import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { database, migrate, type Database } from "./db.ts";
import { createApp } from "./app.ts";
import { initializeContent, reviewedRevision } from "./content-upgrades.ts";

const seed = JSON.parse(
  await readFile(new URL("../src/data/bank.json", import.meta.url), "utf8"),
);
function question(bank: any, id: string) {
  return bank.questions.find((item: any) => item.id === id);
}
function oldBaseline() {
  const bank = structuredClone(seed);
  bank.version = "2026.11.23-quality.1";
  for (const patch of reviewedRevision.patches) {
    const q = question(bank, patch.id);
    const parent = patch.path
      .slice(0, -1)
      .reduce((value: any, key) => value[key], q);
    parent[patch.path.at(-1)!] = patch.before;
    delete q.version;
  }
  return bank;
}
async function memory() {
  const db = await database(undefined, ":memory:");
  await migrate(db);
  return db;
}
const latest = async (db: Database) =>
  (await db.query("SELECT * FROM releases ORDER BY id DESC LIMIT 1")).rows[0];
const count = async (db: Database, table: string) =>
  Number(
    (await db.query(`SELECT count(*) AS total FROM ${table}`)).rows[0].total,
  );

test("reviewed seed keeps all question identities and records the eight revised versions", () => {
  const old = oldBaseline();
  assert.equal(seed.questions.length, 1011);
  assert.deepEqual(
    seed.questions.map((q: any) => q.id),
    old.questions.map((q: any) => q.id),
  );
  assert.equal(seed.version, "2026.11.23-quality.2");
  assert.equal(
    new Set(reviewedRevision.patches.map((patch) => patch.id)).size,
    8,
  );
  for (const patch of reviewedRevision.patches) {
    const q = question(seed, patch.id);
    const value = patch.path.reduce((parent: any, key) => parent[key], q);
    assert.equal(value, patch.after);
    assert.equal(q.version, 2);
  }
});

test("an existing database serves repaired answers through the manifest and keeps its old release", async () => {
  const db = await memory();
  const old = oldBaseline();
  await db.query("INSERT INTO releases(bank) VALUES($1)", [
    JSON.stringify(old),
  ]);
  const { app } = await createApp({
    db,
    origin: "http://localhost",
    dailyTokens: 0,
    worker: false,
  });
  try {
    const response = await app.inject({
      method: "GET",
      url: "/quiz/api/v1/content/manifest",
    });
    assert.equal(response.statusCode, 200);
    const bank = response.json().bank;
    assert.equal(bank.questions.length, 1011);
    assert.equal(bank.version, reviewedRevision.bankVersion);
    assert.match(
      question(bank, "quiz:21:3").detail.code,
      /console\.log\(context\.x\); \/\/ 5/,
    );
    assert.match(
      question(bank, "oral:loop:0").explanation,
      /JSON\.parse 是单次同步调用/,
    );
    assert.equal(await count(db, "releases"), 2);
    assert.equal(await count(db, "audits"), 1);
    assert.deepEqual(
      (await db.query("SELECT bank FROM releases WHERE id=1")).rows[0].bank,
      old,
    );
    const marker = (
      await db.query("SELECT detail FROM content_upgrades WHERE id=$1", [
        reviewedRevision.id,
      ])
    ).rows[0];
    assert.equal(marker.detail.applied.length, 9);
    assert.equal(marker.detail.conflicts.length, 0);
    assert.equal(marker.detail.publishedRelease, "2");
  } finally {
    await app.close();
    await db.close();
  }
});

test("concurrent empty-database initialization seeds once without an extra correction release", async () => {
  const db = await memory();
  try {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => initializeContent(db, seed)),
    );
    assert.equal(await count(db, "releases"), 1);
    assert.equal(await count(db, "audits"), 0);
    assert.equal((await latest(db)).bank.version, seed.version);
    assert.equal(results[0]!.applied.length, 0);
    assert.equal(results[0]!.alreadyCurrent.length, 9);
    assert.equal(results[0]!.publishedRelease, null);
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) AS total FROM content_upgrades WHERE id=$1",
            [reviewedRevision.id],
          )
        ).rows[0].total,
      ),
      1,
    );
  } finally {
    await db.close();
  }
});

test("concurrent application starts migrate the empty database and seed one release", async () => {
  const db = await database(undefined, ":memory:");
  const apps: Array<Awaited<ReturnType<typeof createApp>>["app"]> = [];
  try {
    const started = await Promise.all(
      Array.from({ length: 3 }, () =>
        createApp({
          db,
          origin: "http://localhost",
          dailyTokens: 0,
          worker: false,
        }),
      ),
    );
    apps.push(...started.map((item) => item.app));
    assert.equal(await count(db, "releases"), 1);
    assert.equal((await latest(db)).bank.version, seed.version);
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) AS total FROM content_upgrades WHERE id=$1",
            [reviewedRevision.id],
          )
        ).rows[0].total,
      ),
      1,
    );
  } finally {
    await Promise.all(apps.map((app) => app.close()));
    await db.close();
  }
});

test("repeated and concurrent starts publish an old-bank correction only once", async () => {
  const db = await memory();
  try {
    await db.query("INSERT INTO releases(bank) VALUES($1)", [
      JSON.stringify(oldBaseline()),
    ]);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => initializeContent(db, seed)),
    );
    await initializeContent(db, seed);
    assert.equal(await count(db, "releases"), 2);
    assert.equal(await count(db, "audits"), 1);
    assert.ok(results.every((result) => result.publishedRelease === "2"));
    const { detail } = (
      await db.query("SELECT detail FROM content_upgrades WHERE id=$1", [
        reviewedRevision.id,
      ])
    ).rows[0];
    assert.equal(detail.applied.length, 9);
  } finally {
    await db.close();
  }
});

test("modified fields, already current fields, extra public questions and private data survive an upgrade", async () => {
  const db = await memory();
  try {
    const bank = oldBaseline();
    question(bank, "quiz:21:3").detail.code = "管理员核验过的自定义代码";
    question(bank, "quiz:21:3").version = 7;
    question(bank, "quiz:21:6").detail.example = "管理员补充的模块示例";
    question(bank, "quiz:21:6").version = 5;
    question(bank, "quiz:21:2").detail.pitfalls = question(
      seed,
      "quiz:21:2",
    ).detail.pitfalls;
    question(bank, "quiz:21:2").version = 2;
    const extra = {
      id: "public-extra",
      kind: "oral",
      topicId: "0",
      prompt: "额外发布的个人项目问题",
      explanation: "这道额外发布的问题需要完整保留。",
      version: 3,
    };
    bank.questions.push(extra);
    bank.topics[0].questionIds.push(extra.id);
    bank.topics[0].sections[0].questionIds.push(extra.id);
    await db.query("INSERT INTO releases(bank) VALUES($1)", [
      JSON.stringify(bank),
    ]);
    await db.query(
      "INSERT INTO users(id,username,password) VALUES('preserved-owner','preserved-user','test-only')",
    );
    await db.query(
      "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES('kept-session','preserved-owner','kept-csrf',now()+interval '1 day')",
    );
    await db.query(
      "INSERT INTO candidates(id,owner,question,checks,saved) VALUES('private-extra','preserved-owner',$1,'[]',true)",
      [JSON.stringify(extra)],
    );
    await db.query(
      "INSERT INTO notes(id,owner,message_id,title,content) VALUES('kept-note','preserved-owner','message','笔记','保留内容')",
    );
    const result = await initializeContent(db, seed);
    const updated = (await latest(db)).bank;
    assert.equal(result.applied.length, 6);
    assert.equal(result.alreadyCurrent.length, 1);
    assert.deepEqual(
      result.conflicts.map((item) => [item.id, item.path]),
      [
        ["quiz:21:3", "detail.code"],
        ["quiz:21:6", "detail.example"],
      ],
    );
    assert.equal(updated.questions.length, 1012);
    assert.deepEqual(question(updated, extra.id), extra);
    assert.equal(
      question(updated, "quiz:21:3").detail.code,
      "管理员核验过的自定义代码",
    );
    assert.equal(question(updated, "quiz:21:3").version, 7);
    assert.equal(
      question(updated, "quiz:21:6").detail.example,
      "管理员补充的模块示例",
    );
    assert.equal(question(updated, "quiz:21:6").version, 6);
    assert.equal(question(updated, "quiz:21:2").version, 2);
    assert.equal(await count(db, "users"), 1);
    assert.equal(await count(db, "sessions"), 1);
    assert.equal(
      (await db.query("SELECT content FROM notes WHERE id='kept-note'")).rows[0]
        .content,
      "保留内容",
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT question FROM candidates WHERE id='private-extra'",
        )
      ).rows[0].question,
      extra,
    );
    assert.deepEqual(
      (await db.query("SELECT bank FROM releases WHERE id=1")).rows[0].bank,
      bank,
    );
  } finally {
    await db.close();
  }
});

test("an already corrected release only gets a completion marker", async () => {
  const db = await memory();
  try {
    await db.query("INSERT INTO releases(bank) VALUES($1)", [
      JSON.stringify(seed),
    ]);
    const result = await initializeContent(db, seed);
    assert.equal(result.seeded, false);
    assert.equal(result.applied.length, 0);
    assert.equal(result.alreadyCurrent.length, 9);
    assert.equal(await count(db, "releases"), 1);
    assert.equal(await count(db, "audits"), 0);
  } finally {
    await db.close();
  }
});

test("publication and restore acquire the shared content lock; a concurrent publication retains the upgrade", async () => {
  const db = await memory();
  let lockAcquisitions = 0;
  // PGlite serializes its transactions; also assert the lock precedes release reads/writes,
  // so this regression remains meaningful for PostgreSQL's separate API/Worker connections.
  const guarded: Database = {
    ...db,
    transaction: (callback) =>
      db.transaction((tx) => {
        let locked = false;
        return callback({
          query: async (sql, params) => {
            if (/^(SELECT .* FROM releases|INSERT INTO releases)/i.test(sql))
              assert.equal(
                locked,
                true,
                "read or write of a release must follow the shared content lock",
              );
            const response = await tx.query(sql, params);
            if (
              sql ===
              "SELECT id FROM content_upgrades WHERE id='__bootstrap_lock__' FOR UPDATE"
            ) {
              locked = true;
              lockAcquisitions++;
            }
            return response;
          },
        });
      }),
  };
  const origin = "http://localhost";
  const { app } = await createApp({
    db: guarded,
    origin,
    dailyTokens: 0,
    worker: false,
    adminName: "content-admin",
    adminPassword: "content-test-password",
  });
  try {
    // Represent a running API over a pre-upgrade database when a new Worker starts.
    await db.query("DELETE FROM content_upgrades WHERE id=$1", [
      reviewedRevision.id,
    ]);
    await db.query("INSERT INTO releases(bank) VALUES($1)", [
      JSON.stringify(oldBaseline()),
    ]);
    const owner = (
      await db.query("SELECT id FROM users WHERE username='content-admin'")
    ).rows[0].id;
    const added = {
      kind: "oral",
      prompt: "本次发布新增的分页查询问题",
      explanation: "这道已审核问题随新发布加入，不能导致已有答案修订丢失。",
    };
    await db.query(
      "INSERT INTO candidates(id,owner,question,checks,review) VALUES('reviewed-extra',$1,$2,'[]','approved')",
      [owner, JSON.stringify(added)],
    );
    const login = await app.inject({
      method: "POST",
      url: "/quiz/api/v1/auth/login",
      headers: { origin },
      payload: { username: "content-admin", password: "content-test-password" },
    });
    const headers = {
      origin,
      cookie: String(login.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": login.json().csrf,
    };
    const upgrading = initializeContent(guarded, seed);
    const publishing = app.inject({
      method: "POST",
      url: "/quiz/api/v1/admin/releases",
      headers,
      payload: { ids: ["reviewed-extra"], topicId: "0" },
    });
    const [upgrade, publication] = await Promise.all([upgrading, publishing]);
    assert.equal(publication.statusCode, 200, publication.body);
    const published = (await latest(db)).bank;
    assert.ok(question(published, "reviewed-extra"));
    assert.match(
      question(published, "quiz:21:3").detail.code,
      /console\.log\(context\.x\)/,
    );
    assert.equal(question(published, "quiz:21:3").version, 2);
    assert.equal(await count(db, "releases"), 4);
    const restored = await app.inject({
      method: "POST",
      url: `/quiz/api/v1/admin/releases/${upgrade.publishedRelease}/restore`,
      headers,
    });
    assert.equal(restored.statusCode, 200, restored.body);
    assert.match(
      question((await latest(db)).bank, "quiz:21:3").detail.code,
      /console\.log\(context\.x\)/,
    );
    assert.equal(await count(db, "releases"), 5);
    assert.equal(lockAcquisitions, 4);
  } finally {
    await app.close();
    await db.close();
  }
});

test("release, audit and completion marker roll back together if an upgrade fails", async () => {
  const db = await memory();
  try {
    const old = oldBaseline();
    await db.query("INSERT INTO releases(bank) VALUES($1)", [
      JSON.stringify(old),
    ]);
    const failing: Database = {
      ...db,
      transaction: (callback) =>
        db.transaction((tx) =>
          callback({
            query: async (sql, params) => {
              if (sql.startsWith("INSERT INTO audits"))
                throw new Error("injected audit failure");
              return tx.query(sql, params);
            },
          }),
        ),
    };
    await assert.rejects(
      initializeContent(failing, seed),
      /injected audit failure/,
    );
    assert.equal(await count(db, "releases"), 1);
    assert.equal(await count(db, "audits"), 0);
    assert.equal(await count(db, "content_upgrades"), 0);
    assert.deepEqual((await latest(db)).bank, old);
    const recovered = await initializeContent(db, seed);
    assert.equal(recovered.applied.length, 9);
    assert.equal(await count(db, "releases"), 2);
  } finally {
    await db.close();
  }
});
