import Fastify from "fastify";
import { normalizeQuestion } from "./generated-question.ts";
import {
  qualityPrompt,
  reviewSchema,
  nearDuplicate,
  optionChecks,
} from "./quality.ts";
import {
  advanceInterview,
  stepRules,
  stepSchema,
  interviewPrompt,
  transcriptOf,
  reportPrompt,
  formatReport,
} from "./interview.ts";
import {
  randomBytes,
  randomUUID,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { z, ZodError } from "zod";
import {
  conversationInput,
  messageInput,
  generationInput,
  questionSchema,
  assessmentSchema,
  interviewOptionsSchema,
  interviewReportSchema,
} from "../packages/contracts/ai.ts";
import type { Database } from "./db.ts";
import { migrate } from "./db.ts";
import { initializeContent, lockPublicContent } from "./content-upgrades.ts";
import { createStructuredReader, jsonRepairPrompt } from "./structured.ts";
import type { Complete } from "./provider.ts";
import { LiveSseWriter, RunStreamHub, TextCheckpoint } from "./run-stream.ts";
import type { Publication } from "./run-stream.ts";
import type { ServerResponse } from "node:http";
import {
  basePrompt,
  assessmentPrompt,
  generationPrompt,
  PROMPT_VERSION,
} from "./prompts.ts";

const prefix = "/quiz/api/v1";
const id = () => randomUUID();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
const passwordMatches = (password: string, stored: string) => {
  const [salt, digest] = stored.split(":");
  return (
    !!salt &&
    !!digest &&
    timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, "hex"))
  );
};
function fail(status: number, message: string) {
  throw Object.assign(new Error(message), { statusCode: status });
}
const normalize = (s: string) =>
  s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
export interface AppOptions {
  db: Database;
  complete?: Complete;
  origin: string;
  dailyTokens: number;
  adminName?: string;
  adminPassword?: string;
  secure?: boolean;
  worker?: boolean;
}

export async function createApp(options: AppOptions) {
  const { db } = options;
  await migrate(db);
  if (options.adminPassword && options.adminName)
    await db.query(
      `INSERT INTO users(id,username,password,role) VALUES($1,$2,$3,'admin') ON CONFLICT(username) DO NOTHING`,
      [id(), options.adminName, passwordHash(options.adminPassword)],
    );
  const seed = JSON.parse(
    await readFile(new URL("../src/data/bank.json", import.meta.url), "utf8"),
  );
  await initializeContent(db, seed);
  const app = Fastify({ bodyLimit: 100_000, logger: false });
  const controllers = new Map<string, AbortController>();
  const live = new RunStreamHub();
  const eventConnections = new Set<ServerResponse>();
  const rate = new Map<string, { count: number; time: number }>();
  let timer: ReturnType<typeof setInterval> | undefined,
    closed = false,
    working = false;
  app.setErrorHandler((e: any, _req, reply) => {
    const status = e instanceof ZodError ? 400 : e.statusCode || 500;
    reply.status(status).send({
      error: status >= 500 ? "服务暂时无法完成请求，请稍后重试" : e.message,
      requestId: _req.id,
    });
  });
  async function auth(req: any) {
    const token = req.headers.cookie
      ?.split(";")
      .map((x: string) => x.trim())
      .find((x: string) => x.startsWith("zhixu_session="))
      ?.split("=")[1];
    if (!token) return undefined;
    const row = await db.query(
      `SELECT u.id,u.username,u.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>now()`,
      [hash(token)],
    );
    return row.rows[0];
  }
  app.addHook("onRequest", async (req: any, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (req.headers.origin !== options.origin) fail(403, "请求来源不匹配");
      const key = req.ip;
      const current = rate.get(key);
      if (!current || Date.now() - current.time > 60_000)
        rate.set(key, { count: 1, time: Date.now() });
      else if (++current.count > 90) fail(429, "操作过于频繁，请稍后再试");
      if (rate.size > 10000)
        for (const [k, v] of rate)
          if (Date.now() - v.time > 60_000) rate.delete(k);
    }
    if (
      req.url.startsWith(prefix + "/health") ||
      req.url.startsWith(prefix + "/content/") ||
      req.url === prefix + "/auth/login" ||
      req.url === prefix + "/auth/register"
    )
      return;
    req.user = await auth(req);
    if (!req.user) fail(401, "请先登录 AI 学习空间");
    if (req.method !== "GET" && req.headers["x-csrf-token"] !== req.user.csrf)
      fail(403, "登录状态已变化，请刷新后再试");
  });
  async function ownConversation(user: string, conversation: string) {
    const r = await db.query(
      "SELECT * FROM conversations WHERE id=$1 AND owner=$2",
      [conversation, user],
    );
    if (!r.rows[0]) fail(404, "会话不存在");
    return r.rows[0];
  }
  const admin = (req: any) => {
    if (req.user.role !== "admin") fail(403, "需要维护权限");
  };
  async function session(reply: any, user: any) {
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    await db.query(
      `INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '14 days')`,
      [hash(token), user.id, csrf],
    );
    reply.header(
      "Set-Cookie",
      `zhixu_session=${token}; Path=/quiz/api/; HttpOnly; SameSite=Strict; Max-Age=1209600${options.secure ? "; Secure" : ""}`,
    );
    return {
      user: { id: user.id, username: user.username, role: user.role },
      csrf,
      enabled: !!options.complete && options.dailyTokens > 0,
    };
  }
  app.get(prefix + "/health", async () => {
    await db.query("SELECT 1");
    return { ok: true, ai: !!options.complete && options.dailyTokens > 0 };
  });
  app.post(prefix + "/auth/login", async (req, reply) => {
    const b = z
      .object({
        username: z.string().min(1).max(80),
        password: z.string().min(1).max(200),
      })
      .parse(req.body);
    const r = await db.query("SELECT * FROM users WHERE username=$1", [
      b.username,
    ]);
    if (!r.rows[0] || !passwordMatches(b.password, r.rows[0].password))
      fail(401, "账号或密码不正确");
    return session(reply, r.rows[0]);
  });
  app.post(prefix + "/auth/register", async (req, reply) => {
    const b = z
      .object({
        username: z.string().min(2).max(80),
        password: z.string().min(12).max(200),
        invitation: z.string().min(16).max(160),
      })
      .parse(req.body);
    const user = await db.transaction(async (tx) => {
      const r = await tx.query(
        "UPDATE invitations SET used=true WHERE token=$1 AND used=false RETURNING token",
        [hash(b.invitation)],
      );
      if (!r.rows.length) fail(400, "邀请无效或已被使用");
      const user = { id: id(), username: b.username, role: "learner" };
      await tx.query(
        "INSERT INTO users(id,username,password) VALUES($1,$2,$3)",
        [user.id, b.username, passwordHash(b.password)],
      );
      return user;
    });
    return session(reply, user);
  });
  app.get(prefix + "/me", async (req: any) => ({
    user: { id: req.user.id, username: req.user.username, role: req.user.role },
    csrf: req.user.csrf,
    enabled: !!options.complete && options.dailyTokens > 0,
  }));
  app.post(prefix + "/auth/logout", async (req: any, reply) => {
    await db.query("DELETE FROM sessions WHERE user_id=$1", [req.user.id]);
    reply.header(
      "Set-Cookie",
      "zhixu_session=; Path=/quiz/api/; HttpOnly; SameSite=Strict; Max-Age=0",
    );
    return { ok: true };
  });
  app.post(prefix + "/auth/password", async (req: any, reply) => {
    const b = z
      .object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z.string().min(12).max(200),
      })
      .parse(req.body);
    const user = await db.transaction(async (tx) => {
      const user = (
        await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
          req.user.id,
        ])
      ).rows[0];
      if (!passwordMatches(b.currentPassword, user.password))
        fail(400, "当前密码不正确");
      await tx.query("UPDATE users SET password=$1 WHERE id=$2", [
        passwordHash(b.newPassword),
        user.id,
      ]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
      return user;
    });
    return session(reply, user);
  });
  app.post(prefix + "/admin/invitations", async (req: any) => {
    admin(req);
    const token = randomBytes(24).toString("hex");
    await db.query("INSERT INTO invitations(token) VALUES($1)", [hash(token)]);
    return { invitation: token };
  });
  app.get(prefix + "/content/manifest", async (_req, reply) => {
    const r = await db.query(
      "SELECT id,bank FROM releases ORDER BY id DESC LIMIT 1",
    );
    const release = r.rows[0];
    reply
      .header("Cache-Control", "public,max-age=60")
      .header("ETag", `"release-${release.id}"`);
    return {
      release: String(release.id),
      schemaVersion: 1,
      bank: release.bank,
    };
  });
  app.get(prefix + "/conversations", async (req: any) => ({
    items: (
      await db.query(
        "SELECT * FROM conversations WHERE owner=$1 ORDER BY updated_at DESC LIMIT 100",
        [req.user.id],
      )
    ).rows,
  }));
  app.post(prefix + "/conversations", async (req: any) => {
    const b = conversationInput.parse(req.body);
    let question: any;
    if (b.questionId) {
      const release = await db.query(
        "SELECT bank FROM releases ORDER BY id DESC LIMIT 1",
      );
      question = release.rows[0].bank.questions.find(
        (q: any) => q.id === b.questionId,
      );
      if (!question) {
        const own = await db.query(
          "SELECT question,version FROM candidates WHERE id=$1 AND owner=$2 AND saved=true",
          [b.questionId, req.user.id],
        );
        if (own.rows[0])
          question = {
            ...own.rows[0].question,
            id: b.questionId,
            version: own.rows[0].version,
          };
      }
      if (!question) fail(404, "关联题目不存在");
      if (b.questionVersion && (question.version || 1) !== b.questionVersion) {
        const historical = await db.query(
          `SELECT q AS question FROM releases r CROSS JOIN LATERAL jsonb_array_elements(r.bank->'questions') q WHERE q->>'id'=$1 AND COALESCE((q->>'version')::int,1)=$2 ORDER BY r.id DESC LIMIT 1`,
          [b.questionId, b.questionVersion],
        );
        if (historical.rows[0]) question = historical.rows[0].question;
        else {
          const privateVersion = await db.query(
            "SELECT v.question FROM candidate_versions v JOIN candidates c ON c.id=v.question_id WHERE v.question_id=$1 AND v.version=$2 AND c.owner=$3",
            [b.questionId, b.questionVersion, req.user.id],
          );
          if (!privateVersion.rows[0]) fail(404, "题目历史版本不存在");
          question = {
            ...privateVersion.rows[0].question,
            id: b.questionId,
            version: b.questionVersion,
          };
        }
      }
    }
    const c = {
      id: id(),
      title: b.title,
      mode: b.mode,
      context: {
        question,
        answer: b.answer,
        scope: b.scope,
        quote: b.quote,
        ...(b.mode === "interview"
          ? {
              startedAt: new Date().toISOString(),
              finished: false,
              interview: interviewOptionsSchema.parse(b.interview || {}),
              interviewState: { main: 0, followup: 0 },
            }
          : {}),
      },
    };
    await db.query(
      "INSERT INTO conversations(id,owner,title,mode,context) VALUES($1,$2,$3,$4,$5)",
      [c.id, req.user.id, c.title, c.mode, JSON.stringify(c.context)],
    );
    return c;
  });
  app.get(prefix + "/conversations/:id", async (req: any) => {
    const c = await ownConversation(req.user.id, req.params.id);
    const messages = (
      await db.query(
        "SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at,id",
        [c.id],
      )
    ).rows.map((m: any) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      result: m.result?.type ? undefined : m.result,
      report: m.result?.type === "report" ? m.result.report : undefined,
      interviewStep:
        m.result?.type === "interview_step" ? m.result.state : undefined,
      runId: m.run_id,
      createdAt: m.created_at,
    }));
    return {
      conversation: c,
      messages,
      runs: (
        await db.query(
          `SELECT * FROM runs WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 10`,
          [c.id],
        )
      ).rows,
    };
  });
  app.patch(prefix + "/conversations/:id", async (req: any) => {
    await ownConversation(req.user.id, req.params.id);
    const b = z.object({ title: z.string().min(1).max(80) }).parse(req.body);
    await db.query("UPDATE conversations SET title=$1 WHERE id=$2", [
      b.title,
      req.params.id,
    ]);
    return { ok: true };
  });
  app.delete(prefix + "/conversations/:id", async (req: any) => {
    await ownConversation(req.user.id, req.params.id);
    const active = await db.query(
      `SELECT id FROM runs WHERE conversation_id=$1 AND status IN ('queued','running')`,
      [req.params.id],
    );
    if (active.rows.length) fail(409, "请先停止正在进行的回复");
    await db.query("DELETE FROM conversations WHERE id=$1", [req.params.id]);
    return { ok: true };
  });
  async function enqueue(
    user: string,
    key: string,
    kind: string,
    input: any,
    conversation?: string,
  ) {
    if (!options.complete || options.dailyTokens <= 0)
      fail(503, "AI 尚未配置，请联系维护者");
    const inputHash = hash(
      JSON.stringify({
        kind,
        input: { ...input, recent: undefined },
        conversation,
      }),
    );
    const reserve =
      kind === "generate" ? Math.ceil(input.count / 2) * 30000 : 60000;
    return db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO usage(owner) VALUES($1) ON CONFLICT DO NOTHING",
        [user],
      );
      const usage = await tx.query(
        "SELECT * FROM usage WHERE owner=$1 AND day=CURRENT_DATE FOR UPDATE",
        [user],
      );
      const old = await tx.query(
        "SELECT * FROM runs WHERE owner=$1 AND key=$2",
        [user, key],
      );
      if (old.rows[0]) {
        if (old.rows[0].input.inputHash !== inputHash)
          fail(409, "同一请求标识不能用于不同内容");
        return old.rows[0];
      }
      const active = await tx.query(
        `SELECT id FROM runs WHERE owner=$1 AND status IN ('queued','running')`,
        [user],
      );
      if (active.rows.length >= 2)
        fail(429, "已有两个 AI 任务进行中，请等待或停止");
      if (conversation) {
        const pending = await tx.query(
          `SELECT id FROM runs WHERE conversation_id=$1 AND status IN ('queued','running')`,
          [conversation],
        );
        if (pending.rows.length) fail(409, "请等待当前回答完成");
      }
      if (
        usage.rows[0].reserved + usage.rows[0].consumed + reserve >
        options.dailyTokens
      )
        fail(429, "今日 AI 额度不足，请明天继续或调整服务端额度");
      const run = {
        id: id(),
        owner: user,
        kind,
        key,
        input: { ...input, inputHash, promptVersion: PROMPT_VERSION },
        conversation_id: conversation,
        status: "queued",
        output: {},
      };
      await tx.query(
        "INSERT INTO runs(id,owner,conversation_id,kind,key,input,reserved) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          run.id,
          user,
          conversation || null,
          kind,
          key,
          JSON.stringify(run.input),
          reserve,
        ],
      );
      await tx.query(
        "UPDATE usage SET reserved=reserved+$1 WHERE owner=$2 AND day=CURRENT_DATE",
        [reserve, user],
      );
      if (conversation) {
        await tx.query(
          "INSERT INTO messages(id,conversation_id,role,text,run_id) VALUES($1,$2,$3,$4,$5)",
          [
            id(),
            conversation,
            "user",
            input.transcriptAnswer || input.text,
            run.id,
          ],
        );
        await tx.query(
          `UPDATE conversations SET updated_at=now(),title=CASE WHEN title='新对话' THEN $1 ELSE title END WHERE id=$2`,
          [input.text.slice(0, 28), conversation],
        );
      }
      return run;
    });
  }
  app.post(prefix + "/conversations/:id/messages", async (req: any) => {
    const c = await ownConversation(req.user.id, req.params.id);
    const b = messageInput.parse(req.body);
    if (b.action === "assess" && !(b.answer ?? c.context.answer ?? "").trim())
      fail(400, "请先填写你的实际作答，再请求点评");
    const old = (
      await db.query("SELECT * FROM runs WHERE owner=$1 AND key=$2", [
        req.user.id,
        b.key,
      ])
    ).rows[0];
    if (old) {
      if (
        old.conversation_id !== c.id ||
        old.input.text !== b.text ||
        old.input.requestedAction !== b.action ||
        old.input.finalAnswer !== b.answer
      )
        fail(409, "同一请求标识不能用于不同内容");
      return old;
    }
    const turnCount = Number(
      (
        await db.query(
          `SELECT count(*) AS n FROM messages WHERE conversation_id=$1 AND role='assistant'`,
          [c.id],
        )
      ).rows[0].n,
    );
    if (c.mode === "interview" && c.context.finished)
      fail(409, "本次模拟已结束，可以新建对话继续讨论");
    if (
      c.mode === "interview" &&
      b.action !== "recap" &&
      Date.now() - Date.parse(c.context.startedAt) >
        (c.context.interview?.minutes || 20) * 60 * 1000
    )
      fail(409, "本次模拟已达到题数或时长，请结束并复盘");
    if (c.mode === "interview" && b.action === "assess")
      fail(409, "模拟结束后统一复盘，请先提交当前回答");
    const followupCount = Number(
      (
        await db.query(
          `SELECT count(*) AS n FROM runs WHERE conversation_id=$1 AND kind='followup' AND status='succeeded'`,
          [c.id],
        )
      ).rows[0].n,
    );
    if (b.action === "followup" && followupCount >= 3)
      fail(409, "已完成本组追问，建议先复盘或新建一组练习");
    const recent = (
      await db.query(
        "SELECT role,text FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 12",
        [c.id],
      )
    ).rows.reverse();
    const interviewOptions = interviewOptionsSchema.parse(
      c.context.interview || {},
    );
    const interviewState = c.context.interviewState || { main: 0, followup: 0 };
    const autoFinish =
      c.mode === "interview" &&
      b.action !== "recap" &&
      stepRules(interviewOptions, interviewState).finished;
    let transcript: any[] = [];
    if (c.mode === "interview" && (b.action === "recap" || autoFinish)) {
      const rows = (
        await db.query(
          "SELECT m.*,r.kind,r.input->>'transcriptAnswer' AS final_answer FROM messages m LEFT JOIN runs r ON r.id=m.run_id WHERE m.conversation_id=$1 ORDER BY m.created_at,m.id",
          [c.id],
        )
      ).rows;
      transcript = transcriptOf(rows, autoFinish ? b.text : b.answer);
    }
    return enqueue(
      req.user.id,
      b.key,
      c.mode === "interview"
        ? b.action === "recap" || autoFinish
          ? "recap"
          : "interview"
        : b.action,
      {
        text: b.text,
        context: {
          ...c.context,
          ...(b.action === "assess" && b.answer !== undefined
            ? { answer: b.answer }
            : {}),
        },
        recent,
        turnCount,
        mode: c.mode,
        requestedAction: b.action,
        finalAnswer: b.answer,
        transcriptAnswer:
          c.mode === "interview" && (b.action === "recap" || autoFinish)
            ? autoFinish
              ? b.text
              : b.answer
            : undefined,
        transcript,
        interviewOptions,
        interviewState,
      },
      c.id,
    );
  });
  app.post(prefix + "/generations", async (req: any) => {
    const b = generationInput.parse(req.body);
    return enqueue(req.user.id, b.key, "generate", { ...b, key: undefined });
  });
  app.get(prefix + "/runs/:id", async (req: any) => {
    const r = await db.query("SELECT * FROM runs WHERE id=$1 AND owner=$2", [
      req.params.id,
      req.user.id,
    ]);
    if (!r.rows[0]) fail(404, "任务不存在");
    return r.rows[0];
  });
  app.get(prefix + "/runs", async (req: any) => ({
    items: (
      await db.query(
        "SELECT * FROM runs WHERE owner=$1 ORDER BY created_at DESC LIMIT 50",
        [req.user.id],
      )
    ).rows,
  }));
  app.post(prefix + "/runs/:id/cancel", async (req: any) => {
    const result = await db.transaction(async (tx) => {
      const r = await tx.query(
        "SELECT * FROM runs WHERE id=$1 AND owner=$2 FOR UPDATE",
        [req.params.id, req.user.id],
      );
      const run = r.rows[0];
      if (!run) fail(404, "任务不存在");
      if (!["queued", "running"].includes(run.status)) return run;
      const text = live.currentText(run.id, run.fence);
      live.pause(run.id, run.fence);
      controllers.get(run.id)?.abort();
      const charge = run.status === "queued" ? 0 : run.reserved;
      await tx.query(
        `UPDATE usage SET reserved=GREATEST(0,reserved-$1),consumed=consumed+$2 WHERE owner=$3 AND day=$4`,
        [run.reserved, charge, run.owner, run.usage_day],
      );
      const changed = await tx.query(
        `UPDATE runs SET status='canceled',fence=fence+1,output=output||$1::jsonb,updated_at=now() WHERE id=$2 RETURNING *`,
        [
          JSON.stringify({
            estimatedTokens: charge,
            ...(text !== undefined ? { text } : {}),
          }),
          run.id,
        ],
      );
      return changed.rows[0];
    });
    live.finish(result);
    return result;
  });
  app.get(prefix + "/runs/:id/events", async (req: any, reply) => {
    const r = await db.query("SELECT * FROM runs WHERE id=$1 AND owner=$2", [
      req.params.id,
      req.user.id,
    ]);
    if (!r.rows[0]) fail(404, "任务不存在");
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    eventConnections.add(reply.raw);
    reply.raw.on("close", () => eventConnections.delete(reply.raw));
    if (req.query?.live === "1") {
      const writer = new LiveSseWriter(reply.raw);
      let ready = false,
        polling = false,
        last = "";
      const pending: Publication[] = [];
      const unsubscribe = live.subscribe(req.params.id, (publication) => {
        if (!ready) {
          pending[0] = publication;
          return;
        }
        writer.send(publication);
      });
      reply.raw.on("close", unsubscribe);
      // Re-read after subscribing: the authorization read may predate completion.
      let current;
      try {
        current = (
          await db.query("SELECT * FROM runs WHERE id=$1 AND owner=$2", [
            req.params.id,
            req.user.id,
          ])
        ).rows[0];
      } catch {
        unsubscribe();
        reply.raw.end();
        return;
      }
      if (!current) {
        unsubscribe();
        reply.raw.end();
        return;
      }
      const buffered = pending[0]?.snapshot;
      if (buffered && buffered.fence >= current.fence) current = buffered;
      const initial = live.snapshot(current);
      writer.send({
        event: "snapshot",
        data: initial,
        snapshot: initial,
        terminal: !["queued", "running"].includes(initial.status),
      });
      last = JSON.stringify(initial);
      ready = true;
      if (
        pending[0] &&
        pending[0].snapshot.stream?.seq > (initial.stream?.seq ?? -1)
      )
        writer.send(pending[0]);
      const poll = async () => {
        if (
          polling ||
          reply.raw.destroyed ||
          reply.raw.writableEnded ||
          live.has(req.params.id)
        )
          return;
        polling = true;
        try {
          // Another process, structured tasks, and older workers keep snapshot recovery.
          const current = (
            await db.query("SELECT * FROM runs WHERE id=$1 AND owner=$2", [
              req.params.id,
              req.user.id,
            ])
          ).rows[0];
          if (
            live.has(req.params.id) ||
            reply.raw.writableEnded ||
            reply.raw.destroyed
          )
            return;
          if (!current) {
            reply.raw.end();
            return;
          }
          const snapshot = live.snapshot(current);
          const encoded = JSON.stringify(snapshot);
          if (encoded !== last) {
            last = encoded;
            writer.send({
              event: "snapshot",
              data: snapshot,
              snapshot,
              terminal: !["queued", "running"].includes(snapshot.status),
            });
          }
        } catch {
          reply.raw.end();
        } finally {
          polling = false;
        }
      };
      const tick = setInterval(() => void poll(), 600);
      const heartbeat = setInterval(() => writer.heartbeat(), 15000);
      const cleanup = () => {
        unsubscribe();
        clearInterval(tick);
        clearInterval(heartbeat);
      };
      reply.raw.on("close", cleanup);
      // A terminal initial snapshot may have ended before the close listener existed.
      if (reply.raw.writableEnded || reply.raw.destroyed) cleanup();
      return;
    }
    let last = "",
      polling = false;
    const send = async () => {
      if (polling || reply.raw.destroyed) return;
      polling = true;
      try {
        const rows = await db.query(
          "SELECT * FROM runs WHERE id=$1 AND owner=$2",
          [req.params.id, req.user.id],
        );
        const run = rows.rows[0];
        if (!run) {
          reply.raw.end();
          return;
        }
        const snapshot = JSON.stringify(run);
        if (snapshot !== last) {
          last = snapshot;
          reply.raw.write(`event: snapshot\ndata: ${snapshot}\n\n`);
        } else reply.raw.write(": heartbeat\n\n");
        if (!["queued", "running"].includes(run.status)) reply.raw.end();
      } catch {
        reply.raw.end();
      } finally {
        polling = false;
      }
    };
    const tick = setInterval(() => void send(), 600);
    reply.raw.on("close", () => clearInterval(tick));
    await send();
  });
  app.get(prefix + "/usage", async (req: any) => {
    const r = await db.query(
      "SELECT consumed,reserved,day FROM usage WHERE owner=$1 AND day=CURRENT_DATE",
      [req.user.id],
    );
    return {
      limit: options.dailyTokens,
      ...(r.rows[0] || { consumed: 0, reserved: 0 }),
      unit: "tokens",
      dayBoundary: "UTC",
    };
  });
  app.get(prefix + "/my/questions", async (req: any) => ({
    items: (
      await db.query(
        "SELECT * FROM candidates WHERE owner=$1 ORDER BY created_at DESC LIMIT 500",
        [req.user.id],
      )
    ).rows,
  }));
  app.post(prefix + "/candidates/:id/save", async (req: any) => {
    const r = await db.query(
      `UPDATE candidates SET saved=true WHERE id=$1 AND owner=$2 AND checks='[]'::jsonb RETURNING *`,
      [req.params.id, req.user.id],
    );
    if (!r.rows[0]) fail(400, "题目不存在或仍需修订");
    return r.rows[0];
  });
  app.post(prefix + "/candidates/:id/check", async (req: any) => {
    const b = z
      .object({
        key: z.string().min(8).max(160),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    const q = (
      await db.query(
        "SELECT * FROM candidates WHERE id=$1 AND owner=$2 AND version=$3",
        [req.params.id, req.user.id, b.version],
      )
    ).rows[0];
    if (!q) fail(404, "题目不存在或版本已变化");
    return enqueue(req.user.id, b.key, "check", {
      candidateId: q.id,
      version: q.version,
      question: q.question,
    });
  });
  app.get(prefix + "/admin/candidates", async (req: any) => {
    admin(req);
    return {
      items: (
        await db.query(
          "SELECT * FROM candidates ORDER BY created_at DESC LIMIT 200",
        )
      ).rows,
    };
  });
  app.put(prefix + "/admin/candidates/:id", async (req: any) => {
    admin(req);
    const b = z
      .object({
        question: questionSchema,
        version: z.number().int().positive(),
      })
      .parse(req.body);
    const r = await db.transaction(async (tx) => {
      const result = await tx.query(
        `UPDATE candidates SET question=$1,version=version+1,review='unreviewed',checks='[]' WHERE id=$2 AND version=$3 RETURNING *`,
        [JSON.stringify(b.question), req.params.id, b.version],
      );
      if (!result.rows[0]) fail(409, "题目已变化，请刷新后修订");
      await tx.query(
        "INSERT INTO candidate_versions(question_id,version,question) VALUES($1,$2,$3)",
        [req.params.id, result.rows[0].version, JSON.stringify(b.question)],
      );
      return result;
    });
    if (!r.rows[0]) fail(409, "题目已变化，请刷新后修订");
    await audit(req.user.id, "edit", req.params.id);
    return r.rows[0];
  });
  async function audit(
    actor: string,
    action: string,
    target: string,
    detail: object = {},
  ) {
    await db.query(
      "INSERT INTO audits(actor,action,target,detail) VALUES($1,$2,$3,$4)",
      [actor, action, target, JSON.stringify(detail)],
    );
  }
  app.post(prefix + "/admin/candidates/:id/review", async (req: any) => {
    admin(req);
    const b = z
      .object({
        version: z.number().int().positive(),
        approved: z.boolean(),
        reason: z.string().min(2).max(2000),
      })
      .parse(req.body);
    const r = await db.query(
      `UPDATE candidates SET review=$1 WHERE id=$2 AND version=$3 AND checks='[]'::jsonb RETURNING id`,
      [b.approved ? "approved" : "rejected", req.params.id, b.version],
    );
    if (!r.rows[0]) fail(409, "内容已变化或未通过检查");
    await audit(req.user.id, b.approved ? "approve" : "reject", req.params.id, {
      version: b.version,
      reason: b.reason,
    });
    return { ok: true };
  });
  app.post(prefix + "/admin/releases", async (req: any) => {
    admin(req);
    const b = z
      .object({ ids: z.array(z.string()).min(1).max(50), topicId: z.string() })
      .parse(req.body);
    return db.transaction(async (tx) => {
      await lockPublicContent(tx);
      const latest = (
        await tx.query(
          "SELECT * FROM releases ORDER BY id DESC LIMIT 1 FOR UPDATE",
        )
      ).rows[0];
      const bank = structuredClone(latest.bank);
      const topic = bank.topics.find((t: any) => t.id === b.topicId);
      if (!topic) fail(400, "专题不存在");
      const items = await tx.query(
        `SELECT * FROM candidates WHERE id=ANY($1::text[]) AND review='approved' AND checks='[]'::jsonb FOR UPDATE`,
        [b.ids],
      );
      if (items.rows.length !== new Set(b.ids).size)
        fail(409, "部分题目未通过审核");
      let section = topic.sections.find((s: any) => s.id === "ai-reviewed");
      if (!section) {
        section = {
          id: "ai-reviewed",
          title: "补充练习",
          kind: "application",
          questionIds: [],
        };
        topic.sections.push(section);
      }
      for (const c of items.rows) {
        const q = {
          ...c.question,
          id: c.id,
          version: c.version,
          topicId: topic.id,
          label: "已审核",
          origin: "ai",
        };
        const index = bank.questions.findIndex((x: any) => x.id === q.id);
        if (index < 0) bank.questions.push(q);
        else bank.questions[index] = q;
        if (!topic.questionIds.includes(q.id)) topic.questionIds.push(q.id);
        if (!section.questionIds.includes(q.id)) section.questionIds.push(q.id);
      }
      bank.version = `release-${Date.now()}`;
      const published = await tx.query(
        "INSERT INTO releases(bank,by_user) VALUES($1,$2) RETURNING id",
        [JSON.stringify(bank), req.user.id],
      );
      await tx.query(
        "INSERT INTO audits(actor,action,target,detail) VALUES($1,$2,$3,$4)",
        [
          req.user.id,
          "publish",
          String(published.rows[0].id),
          JSON.stringify(b),
        ],
      );
      return { release: String(published.rows[0].id) };
    });
  });

  app.get(prefix + "/admin/releases", async (req: any) => {
    admin(req);
    return {
      items: (
        await db.query(
          "SELECT id,created_at,by_user FROM releases ORDER BY id DESC LIMIT 30",
        )
      ).rows,
    };
  });
  app.post(prefix + "/admin/releases/:id/restore", async (req: any) => {
    admin(req);
    return db.transaction(async (tx) => {
      await lockPublicContent(tx);
      const release = await tx.query("SELECT bank FROM releases WHERE id=$1", [
        req.params.id,
      ]);
      if (!release.rows[0]) fail(404, "发布版本不存在");
      const result = await tx.query(
        "INSERT INTO releases(bank,by_user) VALUES($1,$2) RETURNING id",
        [
          JSON.stringify({
            ...release.rows[0].bank,
            version: "restore-" + Date.now(),
          }),
          req.user.id,
        ],
      );
      await tx.query(
        "INSERT INTO audits(actor,action,target,detail) VALUES($1,$2,$3,$4)",
        [
          req.user.id,
          "restore_release",
          String(result.rows[0].id),
          JSON.stringify({ source: req.params.id }),
        ],
      );
      return { release: String(result.rows[0].id) };
    });
  });
  app.get(prefix + "/notes", async (req: any) => ({
    items: (
      await db.query(
        "SELECT * FROM notes WHERE owner=$1 ORDER BY created_at DESC LIMIT 200",
        [req.user.id],
      )
    ).rows,
  }));
  app.post(prefix + "/notes", async (req: any) => {
    const b = z.object({ messageId: z.string().max(160) }).parse(req.body);
    const source = (
      await db.query(
        `SELECT m.*,c.title FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.owner=$2 AND m.role='assistant'`,
        [b.messageId, req.user.id],
      )
    ).rows[0];
    if (!source) fail(404, "回复不存在");
    const saved = await db.query(
      "INSERT INTO notes(id,owner,message_id,title,content) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner,message_id) DO UPDATE SET message_id=EXCLUDED.message_id RETURNING *",
      [id(), req.user.id, b.messageId, source.title, source.text],
    );
    return saved.rows[0];
  });
  app.delete(prefix + "/notes/:id", async (req: any) => {
    await db.query("DELETE FROM notes WHERE id=$1 AND owner=$2", [
      req.params.id,
      req.user.id,
    ]);
    return { ok: true };
  });
  app.put(prefix + "/notes/:id", async (req: any) => {
    const b = z
      .object({
        title: z.string().min(1).max(120),
        content: z.string().min(1).max(60000),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    const result = await db.query(
      "UPDATE notes SET title=$1,content=$2,version=version+1 WHERE id=$3 AND owner=$4 AND version=$5 RETURNING *",
      [b.title, b.content, req.params.id, req.user.id, b.version],
    );
    if (!result.rows.length)
      fail(409, "笔记已在其他页面更新，请重新打开后合并修改");
    return result.rows[0];
  });
  async function processOne() {
    if (working || closed || !options.complete || options.dailyTokens <= 0)
      return;
    working = true;
    let run: any,
      started = false;
    let spent = 0,
      uncertainUsage = false;
    let checkpoint: TextCheckpoint | undefined;
    const abort = new AbortController();
    try {
      // Expired calls may already have been billed upstream; keep their reservation and do not resubmit.
      await db.query(
        `UPDATE runs SET status='outcome_unknown',error='任务进程中断，模型结果与用量待核实',fence=fence+1 WHERE status='running' AND lease_until<now()`,
      );
      run = await db.transaction(async (tx) => {
        const row = (
          await tx.query(
            `SELECT * FROM runs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
          )
        ).rows[0];
        if (!row) return;
        await tx.query(
          `UPDATE runs SET status='running',fence=fence+1,lease_until=now()+interval '6 minutes',updated_at=now() WHERE id=$1`,
          [row.id],
        );
        return { ...row, status: "running", fence: row.fence + 1 };
      });
      if (!run) return;
      controllers.set(run.id, abort);
      const deadline = setTimeout(
        () => abort.abort(),
        run.kind === "generate"
          ? 180000 + run.input.count * 70000
          : run.kind === "recap"
            ? 180000 + (run.input.transcript?.length || 0) * 15000
            : 90000,
      );
      const heartbeat = setInterval(() => {
        void db
          .query(
            "UPDATE runs SET lease_until=now()+interval '6 minutes' WHERE id=$1 AND fence=$2 AND status='running' RETURNING id",
            [run.id, run.fence],
          )
          .then((r) => {
            if (!r.rows.length) abort.abort();
          })
          .catch(() => abort.abort());
      }, 5000);
      try {
        const call = async (
          messages: any[],
          structured = false,
          maxTokens = 2200,
          delta?: (s: string) => Promise<void>,
        ) => {
          started = true;
          const r = await options.complete!(messages, {
            structured,
            maxTokens,
            signal: abort.signal,
            delta,
          }).catch((error: any) => {
            if (!error.upstreamRejected) uncertainUsage = true;
            throw error;
          });
          spent +=
            r.tokens ||
            maxTokens + Buffer.byteLength(JSON.stringify(messages), "utf8");
          return r;
        };
        const readStructured = createStructuredReader(
          async (malformed, maxTokens) => {
            const active = await db.query(
              "SELECT id FROM runs WHERE id=$1 AND fence=$2 AND status='running'",
              [run.id, run.fence],
            );
            if (!active.rows.length) abort.abort();
            abort.signal.throwIfAborted();
            const repaired = await call(
              [
                { role: "system", content: jsonRepairPrompt },
                { role: "user", content: JSON.stringify({ malformed }) },
              ],
              true,
              maxTokens,
            );
            return repaired.text;
          },
          abort.signal,
        );
        let output: any;
        if (run.kind === "check") {
          const result = await call(
            [
              { role: "system", content: qualityPrompt },
              { role: "user", content: JSON.stringify([run.input.question]) },
            ],
            true,
            2000,
          );
          const reviews = reviewSchema.parse(
            await readStructured(result.text, 2000),
          ).reviews;
          if (reviews.length !== 1 || reviews[0]?.index !== 0)
            throw new Error("复核结果未对应当前题目");
          const old = (
            await db.query(
              "SELECT checks FROM candidates WHERE id=$1 AND owner=$2 AND version=$3",
              [run.input.candidateId, run.owner, run.input.version],
            )
          ).rows[0];
          if (!old) throw new Error("题目版本已变化，请重新复核");
          const retained = old.checks.filter(
            (s: string) => s === "与现有题目重复" || s === "题型与所选要求不符",
          );
          output = {
            checkedCandidate: {
              id: run.input.candidateId,
              version: run.input.version,
              checks: [
                ...new Set([
                  ...retained,
                  ...reviews[0].issues,
                  ...optionChecks(run.input.question),
                ]),
              ],
            },
          };
        } else if (run.kind === "generate") {
          const published = (
            await db.query("SELECT bank FROM releases ORDER BY id DESC LIMIT 1")
          ).rows[0].bank;
          const personal = (
            await db.query("SELECT question FROM candidates WHERE owner=$1", [
              run.owner,
            ])
          ).rows.map((c: any) => c.question);
          const generated: any[] = [],
            invalid: any[] = [];
          const originals = [...published.questions, ...personal];
          const relevant = originals
            .filter((q: any) =>
              run.input.scope
                .split(/[，、\s]+/)
                .some(
                  (word: string) => word.length > 1 && q.prompt.includes(word),
                ),
            )
            .slice(0, 20);
          const existing = originals.map((q: any) => normalize(q.prompt));
          for (let offset = 0; offset < run.input.count; offset += 2) {
            if (abort.signal.aborted) throw new Error("任务已停止");
            const count = Math.min(2, run.input.count - offset);
            const result = await call(
              [
                {
                  role: "system",
                  content: basePrompt + "\n" + generationPrompt,
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    ...run.input,
                    count,
                    exclude: [
                      ...relevant.map((q: any) => q.prompt.slice(0, 200)),
                      ...generated.map((q) => q.question.prompt.slice(0, 200)),
                    ],
                  }),
                },
              ],
              true,
              6000,
            );
            const data = await readStructured(result.text, 6000);
            if (
              !data ||
              typeof data !== "object" ||
              !Array.isArray(data.questions)
            )
              throw new Error("模型未返回题目数组");
            data.questions = data.questions.slice(0, count);
            for (
              let missing = data.questions.length;
              missing < count;
              missing++
            )
              invalid.push({
                index: offset + missing + 1,
                issues: ["模型未返回此题"],
              });
            let reviews: ReturnType<typeof reviewSchema.parse>["reviews"] = [];
            let reviewFailure = "内容复核未完成";
            if (
              Buffer.byteLength(JSON.stringify(data.questions), "utf8") < 30000
            ) {
              try {
                const checked = await call(
                  [
                    { role: "system", content: qualityPrompt },
                    { role: "user", content: JSON.stringify(data.questions) },
                  ],
                  true,
                  1500,
                );
                reviews = reviewSchema.parse(
                  await readStructured(checked.text, 1500),
                ).reviews;
                if (
                  reviews.length !== data.questions.length ||
                  new Set(reviews.map((r) => r.index)).size !==
                    data.questions.length ||
                  reviews.some((r) => r.index >= data.questions.length)
                )
                  reviews = [];
              } catch (error) {
                if (abort.signal.aborted) throw error;
                reviews = [];
                reviewFailure +=
                  "：" +
                  (error instanceof ZodError
                    ? "复核结果格式不正确"
                    : String((error as Error).message).slice(0, 120));
              }
            }
            for (const [index, item] of data.questions.entries()) {
              const parsed = questionSchema.safeParse(normalizeQuestion(item));
              if (!parsed.success) {
                invalid.push({
                  index: offset + index + 1,
                  issues: parsed.error.issues.map(
                    (e) => e.path.join(".") + "：" + e.message,
                  ),
                });
                continue;
              }
              const q = parsed.data;
              delete q.id;
              const checks: string[] = [
                ...optionChecks(q),
                ...(reviews.find((r) => r.index === index)?.issues || [
                  reviewFailure,
                ]),
              ];
              if (run.input.kind !== "mixed" && q.kind !== run.input.kind)
                checks.push("题型与所选要求不符");
              if (
                existing.some((p: string) => nearDuplicate(p, q.prompt)) ||
                generated.some((x) =>
                  nearDuplicate(x.question.prompt, q.prompt),
                )
              )
                checks.push("与现有题目重复");
              const candidate = {
                id: "q_" + id(),
                question: q,
                checks,
                version: 1,
                saved: false,
                review: "unreviewed",
              };
              await db.transaction(async (tx) => {
                const current = await tx.query(
                  `SELECT id FROM runs WHERE id=$1 AND fence=$2 AND status='running' FOR UPDATE`,
                  [run.id, run.fence],
                );
                if (!current.rows.length) throw new Error("任务已停止");
                await tx.query(
                  "INSERT INTO candidates(id,owner,question,checks) VALUES($1,$2,$3,$4)",
                  [
                    candidate.id,
                    run.owner,
                    JSON.stringify(q),
                    JSON.stringify(checks),
                  ],
                );
                await tx.query(
                  "INSERT INTO candidate_versions(question_id,version,question) VALUES($1,1,$2)",
                  [candidate.id, JSON.stringify(q)],
                );
              });
              generated.push(candidate);
            }
            await db.query(
              `UPDATE runs SET output=$1,updated_at=now() WHERE id=$2 AND fence=$3 AND status='running'`,
              [
                JSON.stringify({
                  candidates: generated,
                  invalid,
                  requested: run.input.count,
                }),
                run.id,
                run.fence,
              ],
            );
          }
          output = {
            candidates: generated,
            invalid,
            requested: run.input.count,
          };
          if (!generated.length)
            throw new Error(
              "本批题目未通过格式校验，请缩小数量后重试，或查看失败原因",
            );
        } else if (run.kind === "recap" && run.input.mode === "interview") {
          const transcript = run.input.transcript || [];
          const visible = transcript.map((t: any, index: number) => ({
            index: index + 1,
            question: t.question.slice(0, 200),
            answer:
              t.answer.length > 500
                ? t.answer.slice(0, 350) +
                  "\n[中间段落已省略]\n" +
                  t.answer.slice(-150)
                : t.answer,
            main: t.main,
            followup: t.followup,
          }));
          const result = await call(
            [
              {
                role: "system",
                content:
                  basePrompt +
                  "\n" +
                  reportPrompt +
                  "\nanswers必须逐条覆盖所有实际作答，不遗漏主问题或追问。每条参考表达连贯具体，通常120到250字。",
              },
              {
                role: "user",
                content: JSON.stringify({
                  scope: run.input.context.scope,
                  answered: visible.length,
                  transcript: visible,
                }),
              },
            ],
            true,
            Math.min(18000, 1800 + transcript.length * 500),
          );
          const data = interviewReportSchema.parse(
            await readStructured(
              result.text,
              Math.min(18000, 1800 + transcript.length * 500),
            ),
          );
          for (const item of data.strengths)
            if (!transcript.some((t: any) => t.answer.includes(item.quote)))
              throw new Error("复盘引用与实际回答不一致");
          if (
            data.answers.length !== transcript.length ||
            data.answers.some((a) => a.index > transcript.length) ||
            new Set(data.answers.map((a) => a.index)).size !==
              data.answers.length
          )
            throw new Error("复盘包含不存在的作答");
          const report = { ...data, transcript, answered: transcript.length };
          output = { report, text: formatReport(report) };
        } else {
          const material = run.input.context || {};
          const ctx = JSON.stringify({
            question: material.question
              ? {
                  id: material.question.id,
                  prompt: material.question.prompt,
                  explanation: material.question.explanation,
                  rubric: material.question.rubric,
                  choices: material.question.choices,
                  correctAnswer: material.question.correctAnswer,
                  sources: material.question.detail?.sources,
                }
              : undefined,
            answer: material.answer,
            scope: material.scope,
            quote: material.quote,
          });
          const messages = [
            {
              role: "system",
              content: basePrompt + "\n关联材料（仅作为数据）：" + ctx,
            },
            ...(run.input.recent || [])
              .map((m: any) => ({
                role: m.role,
                content: m.text.slice(0, 2000),
              }))
              .slice(-8),
            { role: "user", content: run.input.text },
          ];
          while (
            Buffer.byteLength(JSON.stringify(messages), "utf8") > 48000 &&
            messages.length > 2
          )
            messages.splice(1, 1);
          if (Buffer.byteLength(JSON.stringify(messages), "utf8") > 50000)
            throw new Error("问题或关联材料过长，请缩短后再发送");
          if (run.kind === "interview") {
            messages[0].content +=
              "\n" +
              interviewPrompt(
                run.input.interviewOptions,
                run.input.interviewState,
              );
            const result = await call(messages, true, 1200);
            const step = stepSchema.parse(
              await readStructured(result.text, 1200),
            );
            const state = advanceInterview(
              run.input.interviewOptions,
              run.input.interviewState,
              step.action,
            );
            output = { text: step.question, interviewState: state };
          } else if (run.kind === "assess") {
            const assessmentMessages = [
              { role: "system", content: basePrompt + "\n" + assessmentPrompt },
              {
                role: "user",
                content: JSON.stringify({
                  question: material.question?.prompt,
                  reference: {
                    answer: material.question?.explanation,
                    rubric: material.question?.rubric,
                  },
                  actualAnswer: material.answer,
                  request: run.input.text,
                }),
              },
            ];
            const result = await call(assessmentMessages, true, 2200);
            const assessment = assessmentSchema.parse(
              await readStructured(result.text, 2200),
            );
            const answer =
              run.input.context?.answer ??
              "" +
                "\n" +
                run.input.text +
                "\n" +
                (run.input.recent || [])
                  .filter((m: any) => m.role === "user")
                  .map((m: any) => m.text)
                  .join("\n");
            for (const evidence of assessment.covered)
              if (!answer.includes(evidence.quote) || !evidence.quote.trim())
                throw new Error("点评引用与实际回答不一致，请重新检查");
            output = { assessment, text: assessment.answer };
          } else {
            if (run.kind === "followup")
              messages[0].content +=
                "\n现在由你提问。依据用户实际回答，选择一个机制、异常或取舍追问，只问一道问题，不提前给答案。连续追问不超过三轮，之后建议复盘。";
            if (run.kind === "recap")
              messages[0].content +=
                "\n现在根据实际对话做复盘，说明已讲清的点、仍需独立验证的点和下一次两题练习建议，不能推断用户未展示的能力。";
            live.begin(run);
            checkpoint = new TextCheckpoint(
              async (text) => {
                const changed = await db.query(
                  `UPDATE runs SET output=$1,updated_at=now() WHERE id=$2 AND fence=$3 AND status='running' RETURNING id`,
                  [JSON.stringify({ text }), run.id, run.fence],
                );
                if (!changed.rows.length) throw new Error("任务已经停止");
              },
              () => abort.abort(),
            );
            const result = await call(messages, false, 1600, async (text) => {
              live.text(run.id, run.fence, text);
              checkpoint!.set(text);
            });
            await checkpoint.flush();
            output = { text: result.text };
          }
        }
        const finished = await db.transaction(async (tx) => {
          const current = await tx.query(
            `SELECT id FROM runs WHERE id=$1 AND fence=$2 AND status='running' FOR UPDATE`,
            [run.id, run.fence],
          );
          if (!current.rows.length) return;
          if (output.checkedCandidate) {
            const c = output.checkedCandidate;
            const changed = await tx.query(
              "UPDATE candidates SET checks=$1 WHERE id=$2 AND owner=$3 AND version=$4 RETURNING id",
              [JSON.stringify(c.checks), c.id, run.owner, c.version],
            );
            if (!changed.rows.length)
              throw new Error("题目版本已变化，请重新复核");
          }
          const partial =
            run.kind === "generate" &&
            (output.candidates?.length < run.input.count ||
              output.candidates?.some((c: any) => c.checks.length));
          await tx.query(
            "UPDATE runs SET status=$1,output=$2,updated_at=now() WHERE id=$3",
            [
              partial ? "partially_succeeded" : "succeeded",
              JSON.stringify({
                ...output,
                tokens: uncertainUsage ? Math.max(spent, run.reserved) : spent,
                usageEstimated: uncertainUsage,
                promptVersion: PROMPT_VERSION,
              }),
              run.id,
            ],
          );
          await tx.query(
            "UPDATE usage SET reserved=GREATEST(0,reserved-$1),consumed=consumed+$2 WHERE owner=$3 AND day=$4",
            [
              run.reserved,
              uncertainUsage ? Math.max(spent, run.reserved) : spent,
              run.owner,
              run.usage_day,
            ],
          );
          if (run.kind === "recap" && run.input.mode === "interview")
            await tx.query(
              `UPDATE conversations SET context=context||'{"finished":true}'::jsonb WHERE id=$1`,
              [run.conversation_id],
            );
          if (output.interviewState)
            await tx.query(
              "UPDATE conversations SET context=context||$1::jsonb WHERE id=$2",
              [
                JSON.stringify({ interviewState: output.interviewState }),
                run.conversation_id,
              ],
            );
          if (run.conversation_id)
            await tx.query(
              "INSERT INTO messages(id,conversation_id,role,text,result,run_id) VALUES($1,$2,$3,$4,$5,$6)",
              [
                id(),
                run.conversation_id,
                "assistant",
                output.text,
                output.assessment
                  ? JSON.stringify(output.assessment)
                  : output.report
                    ? JSON.stringify({ type: "report", report: output.report })
                    : output.interviewState
                      ? JSON.stringify({
                          type: "interview_step",
                          state: output.interviewState,
                        })
                      : null,
                run.id,
              ],
            );
          return (await tx.query("SELECT * FROM runs WHERE id=$1", [run.id]))
            .rows[0];
        });
        if (finished) live.finish(finished);
      } finally {
        clearTimeout(deadline);
        clearInterval(heartbeat);
      }
    } catch (e: any) {
      if (checkpoint) await checkpoint.stop();
      if (run) {
        const text = live.currentText(run.id, run.fence);
        live.pause(run.id, run.fence);
        const finished = await db.transaction(async (tx) => {
          const current = await tx.query(
            `SELECT id FROM runs WHERE id=$1 AND fence=$2 AND status='running' FOR UPDATE`,
            [run.id, run.fence],
          );
          if (!current.rows.length) return;
          const unknown = started && uncertainUsage;
          const charged = unknown ? Math.max(run.reserved, spent) : spent;
          const changed = await tx.query(
            `UPDATE runs SET status=$1,error=$2,updated_at=now(),output=output||$4::jsonb WHERE id=$3 RETURNING *`,
            [
              unknown ? "outcome_unknown" : "failed",
              e instanceof ZodError
                ? "模型内容未通过格式校验"
                : String(e.message || "任务未完成").slice(0, 200),
              run.id,
              JSON.stringify(text !== undefined ? { text } : {}),
            ],
          );
          await tx.query(
            "UPDATE usage SET reserved=GREATEST(0,reserved-$1),consumed=consumed+$2 WHERE owner=$3 AND day=$4",
            [run.reserved, charged, run.owner, run.usage_day],
          );
          return changed.rows[0];
        });
        if (finished) live.finish(finished);
      }
    } finally {
      if (checkpoint) await checkpoint.stop();
      if (run) {
        controllers.delete(run.id);
        live.forget(run.id, run.fence);
      }
      working = false;
    }
  }
  if (options.worker !== false)
    timer = setInterval(() => void processOne().catch(() => {}), 350);
  app.addHook("preClose", async () => {
    closed = true;
    if (timer) clearInterval(timer);
    for (const c of controllers.values()) c.abort();
    live.close();
    for (const response of eventConnections) response.end();
    eventConnections.clear();
  });
  return { app, processOne };
}
