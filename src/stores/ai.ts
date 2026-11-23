import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  api,
  subscribeRun,
  clearIdentity,
  ApiError,
  type Identity,
} from "../infrastructure/ai-client";
import { syncPersonal, clearPersonal } from "../data/content";
import { useLearningStore } from "./learning";
import type {
  AiUser,
  AiMessage,
  AiRun,
  Conversation,
  Candidate,
  InterviewOptions,
} from "../../packages/contracts/ai";
export const useAiStore = defineStore("ai", () => {
  const user = ref<AiUser>(),
    enabled = ref(false),
    checking = ref(true),
    error = ref(""),
    conversations = ref<Conversation[]>([]),
    current = ref<Conversation>(),
    messages = ref<AiMessage[]>([]),
    run = ref<AiRun>(),
    tasks = ref<AiRun[]>([]),
    candidates = ref<Candidate[]>([]),
    usage = ref({ consumed: 0, reserved: 0, limit: 0 }),
    sending = ref(false),
    busy = ref(false);
  const active = computed(
    () => !!run.value && ["queued", "running"].includes(run.value.status),
  );
  let unsubscribe: (() => void) | undefined,
    poll: ReturnType<typeof setInterval> | undefined;
  function stopSubscription() {
    unsubscribe?.();
    unsubscribe = undefined;
    if (poll) clearInterval(poll);
    poll = undefined;
  }
  function report(e: unknown) {
    error.value = e instanceof Error ? e.message : "请求失败，请重试";
  }
  let initPromise: Promise<void> | undefined;
  function init() {
    return (initPromise ??= initialize().finally(() => {
      initPromise = undefined;
    }));
  }
  async function initialize() {
    checking.value = true;
    try {
      const me = await api<Identity>("/me");
      if (useLearningStore().accountId !== me.user.id)
        await clearPersonal(useLearningStore().accountId || "guest", false);
      user.value = me.user;
      enabled.value = me.enabled;
      await Promise.all([refresh(), syncPersonal(me.user.id)]);
      await useLearningStore().switchAccount(me.user.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        if (useLearningStore().accountId)
          await clearPersonal(useLearningStore().accountId);
        await useLearningStore().switchAccount("");
        user.value = undefined;
      } else report(e);
    } finally {
      checking.value = false;
    }
  }
  async function refresh() {
    const [list, budget] = await Promise.all([
      api("/conversations"),
      api("/usage"),
    ]);
    conversations.value = list.items;
    usage.value = budget;
  }
  async function login(
    username: string,
    password: string,
    invitation?: string,
  ) {
    error.value = "";
    busy.value = true;
    try {
      const me = await api<Identity>(
        invitation ? "/auth/register" : "/auth/login",
        {
          method: "POST",
          body: { username, password, ...(invitation ? { invitation } : {}) },
        },
      );
      user.value = me.user;
      enabled.value = me.enabled;
      await clearPersonal(useLearningStore().accountId || "guest", false);
      await Promise.all([refresh(), syncPersonal(me.user.id)]);
      await useLearningStore().switchAccount(me.user.id);
    } catch (e) {
      report(e);
    } finally {
      busy.value = false;
    }
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    stopSubscription();
    const previousUser = user.value?.id;
    await clearPersonal(previousUser);
    await useLearningStore().switchAccount("");
    user.value = undefined;
    current.value = undefined;
    messages.value = [];
    conversations.value = [];
    run.value = undefined;
    candidates.value = [];
    for (const key of Object.keys(localStorage))
      if (
        key.startsWith(`zhixu-ai-draft:${previousUser}:`) ||
        key.startsWith(`zhixu-ai-pending:${previousUser}:`) ||
        key === `zhixu-ai-generate:${previousUser}`
      )
        localStorage.removeItem(key);
    clearIdentity();
  }
  async function open(conversationId: string) {
    stopSubscription();
    error.value = "";
    busy.value = true;
    try {
      const data = await api(`/conversations/${conversationId}`);
      current.value = data.conversation;
      messages.value = data.messages;
      run.value = undefined;
      // Runs arrive newest first; a successful reply supersedes older failures.
      const latest: AiRun | undefined = data.runs[0];
      if (
        latest &&
        ["queued", "running", "outcome_unknown", "failed", "canceled"].includes(
          latest.status,
        )
      )
        watchRun(latest);
    } catch (e) {
      report(e);
    } finally {
      busy.value = false;
    }
  }
  function newChat() {
    stopSubscription();
    current.value = undefined;
    messages.value = [];
    run.value = undefined;
    error.value = "";
  }
  async function create(
    context: {
      questionId?: string;
      questionVersion?: number;
      answer?: string;
      scope?: string;
      quote?: string;
      mode?: string;
      interview?: InterviewOptions;
    } = {},
  ) {
    const data = await api<Conversation>("/conversations", {
      method: "POST",
      body: { ...context },
    });
    current.value = data;
    conversations.value.unshift(data);
    return data;
  }
  async function watchUpdate(value: AiRun) {
    run.value = value;
    if (!["queued", "running"].includes(value.status)) {
      stopSubscription();
      if (
        value.conversation_id &&
        current.value?.id === value.conversation_id
      ) {
        const data = await api(`/conversations/${value.conversation_id}`);
        if (current.value?.id !== value.conversation_id) return;
        messages.value = data.messages;
        current.value = data.conversation;
      }
      await refresh();
      if (["generate", "check"].includes(value.kind)) await loadQuestions();
    }
  }
  function watchRun(value: AiRun) {
    stopSubscription();
    run.value = value;
    if (!["queued", "running"].includes(value.status)) return;
    const recover = () => {
      if (!poll)
        poll = setInterval(() => {
          void api<AiRun>(`/runs/${value.id}`).then(watchUpdate).catch(report);
        }, 1800);
    };
    unsubscribe = subscribeRun(
      value.id,
      (r) => {
        void watchUpdate(r).catch(report);
      },
      recover,
    );
  }
  async function send(
    text: string,
    context: {
      questionId?: string;
      questionVersion?: number;
      answer?: string;
      scope?: string;
      quote?: string;
      mode?: string;
      interview?: InterviewOptions;
    } = {},
    action = "chat",
    finalAnswer?: string,
  ) {
    if (!text.trim() || active.value || sending.value) return;
    error.value = "";
    sending.value = true;
    try {
      const c = current.value || (await create(context));
      const answer =
        finalAnswer ?? (action === "assess" ? context.answer : undefined);
      const signature = JSON.stringify({ text, action, answer });
      const storageKey = `zhixu-ai-pending:${user.value?.id}:${c.id}`;
      let cached: { key: string; signature: string } | undefined;
      try {
        cached = JSON.parse(localStorage.getItem(storageKey) || "null");
      } catch {}
      const pendingKey =
        cached?.signature === signature ? cached.key : crypto.randomUUID();
      localStorage.setItem(
        storageKey,
        JSON.stringify({ key: pendingKey, signature }),
      );
      const value = await api<AiRun>(`/conversations/${c.id}/messages`, {
        method: "POST",
        body: {
          text,
          key: pendingKey,
          action,
          answer,
        },
      });
      localStorage.removeItem(storageKey);
      try {
        const data = await api(`/conversations/${c.id}`);
        messages.value = data.messages;
        current.value = data.conversation;
      } catch (error) {
        report(error);
      }
      watchRun(value);
      await refresh().catch(report);
      return c.id;
    } catch (e) {
      report(e);
    } finally {
      sending.value = false;
    }
  }
  async function cancel() {
    if (!run.value) return;
    try {
      const result = await api<AiRun>(`/runs/${run.value.id}/cancel`, {
        method: "POST",
      });
      await watchUpdate(result);
    } catch (e) {
      report(e);
    }
  }
  async function generate(input: {
    scope: string;
    count: number;
    kind: string;
    difficulty: string;
  }) {
    error.value = "";
    sending.value = true;
    const storageKey = `zhixu-ai-generate:${user.value?.id}`;
    const signature = JSON.stringify(input);
    let pending: { signature: string; key: string } | undefined;
    try {
      pending = JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {}
    if (pending?.signature !== signature)
      pending = { signature, key: crypto.randomUUID() };
    localStorage.setItem(storageKey, JSON.stringify(pending));
    try {
      const value = await api<AiRun>("/generations", {
        method: "POST",
        body: { ...input, key: pending!.key },
      });
      localStorage.removeItem(storageKey);
      watchRun(value);
      return value;
    } catch (e) {
      report(e);
    } finally {
      sending.value = false;
    }
  }
  async function loadQuestions() {
    const data = await api("/my/questions");
    candidates.value = data.items;
    const history = await api("/runs");
    tasks.value = history.items.filter((r: AiRun) => r.kind === "generate");
  }
  async function save(candidateId: string) {
    error.value = "";
    try {
      await api(`/candidates/${candidateId}/save`, { method: "POST" });
      await syncPersonal();
      await loadQuestions();
    } catch (e) {
      report(e);
    }
  }
  async function check(candidate: Candidate) {
    error.value = "";
    try {
      const value = await api<AiRun>(`/candidates/${candidate.id}/check`, {
        method: "POST",
        body: { version: candidate.version, key: crypto.randomUUID() },
      });
      watchRun(value);
    } catch (e) {
      report(e);
    }
  }
  async function rename(conversationId: string, title: string) {
    if (!title.trim()) return;
    await api(`/conversations/${conversationId}`, {
      method: "PATCH",
      body: { title },
    });
    if (current.value?.id === conversationId) current.value.title = title;
    await refresh();
  }
  async function remove(conversationId: string) {
    await api(`/conversations/${conversationId}`, { method: "DELETE" });
    if (current.value?.id === conversationId) newChat();
    await refresh();
  }
  return {
    user,
    enabled,
    checking,
    error,
    conversations,
    current,
    messages,
    run,
    tasks,
    candidates,
    usage,
    sending,
    busy,
    active,
    init,
    refresh,
    login,
    logout,
    open,
    newChat,
    create,
    send,
    cancel,
    generate,
    loadQuestions,
    save,
    check,
    rename,
    remove,
    stopSubscription,
    watchRun,
  };
});
