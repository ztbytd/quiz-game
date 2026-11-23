<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  useId,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAiStore } from "../stores/ai";
import { useLearningStore } from "../stores/learning";
import { questionById } from "../data/content";
import AiMarkdown from "../components/AiMarkdown.vue";
import AiInterviewReport from "../components/AiInterviewReport.vue";
import AppIcon from "../components/AppIcon.vue";
import AppDialog from "../components/AppDialog.vue";
import { api } from "../infrastructure/ai-client";
import type { StudyQuestion } from "../domain/types";
const props = defineProps<{
  embedded?: boolean;
  question?: StudyQuestion;
  answerText?: string;
  quote?: string;
  initialAction?: "chat" | "assess";
}>();
const emit = defineEmits<{ close: [] }>();
const ai = useAiStore(),
  learning = useLearningStore(),
  route = useRoute(),
  router = useRouter();
const text = ref(""),
  loginName = ref(""),
  password = ref(""),
  invitation = ref(""),
  registering = ref(false),
  historyOpen = ref(false),
  search = ref(""),
  contextOpen = ref(false),
  newContent = ref(false),
  copied = ref(""),
  savedNote = ref("");
const authFormId = useId();
const passwordVisible = ref(false);
const composing = ref(false);
let compositionEndedAt = Number.NEGATIVE_INFINITY;
let composerBlurFrame: number | undefined;
const transcript = ref<HTMLElement>(),
  input = ref<HTMLTextAreaElement>(),
  accountOpen = ref(false),
  historyTarget = ref(false);
const ready = ref(false);
const questionId = ref(
  props.question?.id || String(route.query.question || ""),
);
const nextAction = ref<"chat" | "assess">(
  props.initialAction ?? (route.query.action === "assess" ? "assess" : "chat"),
);
const interviewOptions = ref({ mainQuestions: 6, followups: 2, minutes: 20 });
const notesOpen = ref(false),
  notes = ref<
    Array<{ id: string; title: string; content: string; version: number }>
  >([]);
const noteDraft = ref<{
  id: string;
  title: string;
  content: string;
  version: number;
}>();
const passwordOpen = ref(false),
  currentPassword = ref(""),
  newPassword = ref(""),
  accountNotice = ref("");
async function changePassword() {
  try {
    await api("/auth/password", {
      method: "POST",
      body: {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      },
    });
    currentPassword.value = "";
    newPassword.value = "";
    passwordOpen.value = false;
    accountNotice.value = "密码已更新，其他设备需要重新登录。";
  } catch (e) {
    ai.error = (e as Error).message;
  }
}
async function saveNote() {
  if (!noteDraft.value) return;
  try {
    await api("/notes/" + noteDraft.value.id, {
      method: "PUT",
      body: noteDraft.value,
    });
    noteDraft.value = undefined;
    await showNotes();
  } catch (e) {
    ai.error = (e as Error).message;
  }
}
async function deleteNote(id: string) {
  if (!confirm("删除这条笔记？")) return;
  try {
    await api("/notes/" + id, { method: "DELETE" });
    notes.value = notes.value.filter((n) => n.id !== id);
  } catch (e) {
    ai.error = (e as Error).message;
  }
}
function exportChat() {
  const content =
    "# " +
    (ai.current?.title || "AI 对话") +
    "\n\n" +
    ai.messages
      .map((m) => "## " + (m.role === "user" ? "我" : "AI") + "\n\n" + m.text)
      .join("\n\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "知序对话.md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function showNotes() {
  try {
    notes.value = (await api("/notes")).items;
    notesOpen.value = true;
  } catch (error) {
    ai.error = (error as Error).message;
  }
}
const contextQuestion = computed(
  () =>
    props.question ||
    ai.current?.context?.question ||
    learning.progress.session?.questionSnapshots?.[questionId.value] ||
    questionById.get(questionId.value),
);
const linkedAnswer = computed(
  () =>
    props.answerText ??
    (ai.current?.context?.answer ||
      (questionId.value ? learning.getRecord(questionId.value).draft : "")),
);
const filtered = computed(() =>
  ai.conversations.filter((c) =>
    c.title.toLowerCase().includes(search.value.toLowerCase()),
  ),
);
const isInterview = computed(
  () =>
    ai.current?.mode === "interview" ||
    (!ai.current && route.query.mode === "interview"),
);
const interviewFinished = computed(
  () => isInterview.value && ai.current?.context.finished,
);
const streaming = computed(() =>
  ai.run?.kind !== "generate" &&
  !ai.messages.some((m) => m.runId === ai.run?.id && m.role === "assistant")
    ? ai.run?.output?.text || ""
    : "",
);
const examples = [
  {
    icon: "bulb",
    title: "知识答疑",
    text: "用一个请求例子讲清协商缓存，再考我两题。",
  },
  {
    icon: "code",
    title: "项目复盘",
    text: "帮我梳理大文件上传的实现，追问断点续传和并发合并。",
  },
  { icon: "experiment", title: "生成练习", text: "" },
];
const draftKey = computed(() => {
  const prefix = `zhixu-ai-draft:${ai.user?.id || "guest"}:`;
  if (ai.current?.id) return prefix + ai.current.id;
  if (questionId.value) {
    let quoteHash = 0;
    for (const character of props.quote || "")
      quoteHash = (Math.imul(quoteHash, 31) + character.charCodeAt(0)) | 0;
    return (
      prefix +
      `question:${questionId.value}:v${contextQuestion.value?.version || 1}:${props.embedded ? "panel" : "tab"}:${nextAction.value}:${quoteHash >>> 0}`
    );
  }
  return prefix + (isInterview.value ? "interview:new" : "new");
});
function initialDraft() {
  if (props.quote) return "请结合当前题目，解释我引用的这段内容。";
  if (nextAction.value === "assess")
    return "请点评我对当前题目的回答，指出已答到的要点和具体遗漏。";
  if (isInterview.value && !ai.current)
    return "请围绕高级前端工程师岗位开始模拟面试，先问一道主问题，再根据我的回答追问。";
  return "";
}
function restoreDraft() {
  text.value = localStorage.getItem(draftKey.value) ?? initialDraft();
}
watch(
  () => [route.query.question, route.query.mode, route.query.action],
  () => {
    if (props.embedded || !ready.value) return;
    if (!route.params.id) {
      ai.newChat();
      questionId.value = String(route.query.question || "");
      nextAction.value = route.query.action === "assess" ? "assess" : "chat";
    }
  },
);
watch(
  draftKey,
  (key) => {
    text.value = localStorage.getItem(key) ?? initialDraft();
  },
  { immediate: true },
);
watch(text, (value) => {
  localStorage.setItem(draftKey.value, value);
  if (input.value) {
    input.value.style.height = "auto";
    input.value.style.height = Math.min(input.value.scrollHeight, 180) + "px";
  }
});
async function openConversation(id: string) {
  historyOpen.value = false;
  await router.push("/ai/" + id);
}
async function fresh() {
  ai.newChat();
  if (props.embedded) {
    input.value?.focus();
    return;
  }
  questionId.value = "";
  await router.push("/ai");
  input.value?.focus();
}
async function send(
  action: "chat" | "assess" | "followup" | "recap" = nextAction.value,
  override?: string,
) {
  if (composing.value) return;
  const value = override || text.value;
  if (!value.trim()) return;
  const key = draftKey.value;
  const id = await ai.send(
    value,
    {
      questionId: questionId.value || undefined,
      questionVersion: contextQuestion.value?.version || 1,
      answer: linkedAnswer.value || undefined,
      quote: props.quote,
      mode: isInterview.value ? "interview" : "chat",
      interview: isInterview.value ? interviewOptions.value : undefined,
    },
    action,
    action === "recap" && isInterview.value
      ? text.value.trim() || undefined
      : undefined,
  );
  if (id) {
    nextAction.value = "chat";
    localStorage.removeItem(key);
    text.value = "";
    if (!props.embedded && route.params.id !== id)
      await router.replace("/ai/" + id);
    await scrollEnd();
  } else {
    text.value = value;
    if (!props.embedded && ai.current?.id && route.params.id !== ai.current.id)
      await router.replace("/ai/" + ai.current.id);
  }
}
function compositionStart() {
  composing.value = true;
}
function compositionEnd() {
  composing.value = false;
  compositionEndedAt = performance.now();
}
function compositionChange() {
  if (composing.value) compositionEnd();
}
function keydown(e: KeyboardEvent) {
  if (e.key !== "Enter" || e.shiftKey) return;
  if (
    composing.value ||
    e.isComposing ||
    e.keyCode === 229 ||
    performance.now() - compositionEndedAt < 100
  )
    return;
  // A phone's Return key belongs to its keyboard, including IME candidate selection.
  if (matchMedia("(pointer: coarse)").matches && !e.ctrlKey && !e.metaKey)
    return;
  e.preventDefault();
  void send();
}
async function scrollEnd() {
  await nextTick();
  if (transcript.value)
    transcript.value.scrollTop = transcript.value.scrollHeight;
  newContent.value = false;
}
function onScroll() {
  const el = transcript.value;
  if (el)
    newContent.value = el.scrollHeight - el.scrollTop - el.clientHeight > 140;
}
watch(
  () => ai.messages.length,
  () => {
    if (!newContent.value) void scrollEnd();
  },
);
watch(streaming, () => {
  if (!newContent.value) void scrollEnd();
});
watch(
  () => route.params.id,
  async (value) => {
    if (value && ai.user && value !== ai.current?.id)
      await ai.open(String(value));
    if (!value && ai.current) ai.newChat();
  },
);
function readAuthForm(form: HTMLFormElement) {
  // Read the native values too: password managers need not dispatch input events.
  const values = new FormData(form);
  loginName.value = String(values.get("username") ?? "").trim();
  password.value = String(values.get("password") ?? "");
  if (registering.value)
    invitation.value = String(values.get("invitation") ?? "").trim();
}
function togglePassword(event: Event) {
  const form = (event.currentTarget as HTMLButtonElement).form;
  if (form) readAuthForm(form);
  passwordVisible.value = !passwordVisible.value;
}
function toggleRegistration(event: Event) {
  const form = (event.currentTarget as HTMLButtonElement).form;
  if (form) readAuthForm(form);
  registering.value = !registering.value;
  passwordVisible.value = false;
  ai.error = "";
}
async function login(event: Event) {
  if (ai.busy) return;
  const form = event.currentTarget as HTMLFormElement;
  readAuthForm(form);
  // Finish the password field's native input session before replacing the form.
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && form.contains(focused)) focused.blur();
  await ai.login(
    loginName.value,
    password.value,
    registering.value ? invitation.value : undefined,
  );
  if (ai.user) {
    password.value = "";
    invitation.value = "";
    passwordVisible.value = false;
    if (route.params.id) await ai.open(String(route.params.id));
  }
}
async function logout() {
  try {
    await ai.logout();
    accountOpen.value = false;
    await router.replace("/ai");
  } catch (e) {
    ai.error = (e as Error).message;
  }
}
async function copy(id: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    copied.value = id;
    setTimeout(() => (copied.value = ""), 1800);
  } catch {
    ai.error = "浏览器未允许复制，请选中文本后手动复制。";
  }
}
async function note(id: string, value: string) {
  const q = contextQuestion.value;
  if (!q) {
    try {
      await api("/notes", { method: "POST", body: { messageId: id } });
      savedNote.value = id;
    } catch (e) {
      ai.error = (e as Error).message;
    }
    return;
  }
  const before = learning.getRecord(q.id).note;
  learning.setNote(q.id, before ? before + "\n\n" + value : value);
  savedNote.value = id;
}
async function rename(id: string, title: string) {
  const next = window.prompt("会话名称", title);
  if (next)
    try {
      await ai.rename(id, next);
    } catch (error) {
      ai.error = (error as Error).message;
    }
}
async function remove(id: string) {
  if (window.confirm("删除这段对话？已保存的笔记和练习会保留。")) {
    try {
      await ai.remove(id);
      if (!ai.current) await router.replace("/ai");
    } catch (error) {
      ai.error = (error as Error).message;
    }
  }
}
function focusInput() {
  if (composerBlurFrame !== undefined) cancelAnimationFrame(composerBlurFrame);
  composerBlurFrame = undefined;
  document.body.classList.add("ai-keyboard");
}
function blurInput() {
  if (composerBlurFrame !== undefined) cancelAnimationFrame(composerBlurFrame);
  composerBlurFrame = undefined;
  composing.value = false;
  document.body.classList.remove("ai-keyboard");
}
function composerBlur(event: FocusEvent) {
  const composer = event.currentTarget as HTMLElement;
  if (
    event.relatedTarget instanceof Node &&
    composer.contains(event.relatedTarget)
  )
    return;
  if (composerBlurFrame !== undefined) cancelAnimationFrame(composerBlurFrame);
  composerBlurFrame = requestAnimationFrame(() => {
    composerBlurFrame = undefined;
    // Safari can temporarily report no related target while the input keeps focus.
    if (!composer.contains(document.activeElement)) blurInput();
  });
}
onMounted(async () => {
  historyTarget.value =
    !props.embedded && !!document.getElementById("ai-history-slot");
  await ai.init();
  if (ai.user && route.params.id) await ai.open(String(route.params.id));
  if (!route.params.id) ai.newChat();
  if (props.embedded && ai.user && !props.quote && !props.initialAction) {
    const previous = ai.conversations.find(
      (c) =>
        c.context.question?.id === props.question?.id &&
        (c.context.question?.version || 1) === (props.question?.version || 1),
    );
    if (previous) await ai.open(previous.id);
  }
  await nextTick();
  restoreDraft();
  ready.value = true;
});
onBeforeUnmount(() => {
  ai.stopSubscription();
  blurInput();
});
</script>
<template>
  <div
    class="ai-page"
    :class="{
      'is-empty': ai.user && !ai.messages.length && !ai.active,
      'ai-embedded': embedded,
    }"
  >
    <header class="ai-header">
      <button
        v-if="!embedded"
        class="icon-button ai-mobile-history"
        aria-label="打开会话列表"
        @click="historyOpen = true"
      >
        <AppIcon name="menu" /></button
      ><strong>{{
        ai.current?.title || (isInterview ? "AI 模拟面试" : "AI")
      }}</strong>
      <div class="ai-header-actions">
        <RouterLink
          v-if="embedded && ai.current"
          :to="'/ai/' + ai.current.id"
          class="ai-text-button"
          >在 AI 中继续</RouterLink
        >
        <button
          v-if="contextQuestion && !embedded"
          class="button button-small"
          @click="contextOpen = !contextOpen"
        >
          <AppIcon name="document" :size="16" />关联题目</button
        ><button class="icon-button" aria-label="新对话" @click="fresh">
          <AppIcon name="edit" /></button
        ><button
          v-if="!embedded"
          class="icon-button"
          aria-label="账号与额度"
          @click="accountOpen = !accountOpen"
        >
          <AppIcon name="profile" />
        </button>
        <button
          v-if="embedded"
          class="icon-button"
          aria-label="关闭 AI"
          @click="emit('close')"
        >
          <AppIcon name="close" />
        </button>
      </div>
    </header>
    <div v-if="isInterview && ai.user" class="ai-account">
      <span>{{
        interviewFinished
          ? "本次模拟已结束"
          : `第 ${ai.current?.context.interviewState?.main || 0}/${ai.current?.context.interview?.mainQuestions || interviewOptions.mainQuestions} 组 · 根据回答追问，结束后集中复盘。`
      }}</span><button
        v-if="ai.messages.length && !interviewFinished"
        :disabled="ai.active"
        @click="
          send(
            'recap',
            '结束本次模拟面试，依据我的实际作答给出复盘和参考表达。',
          )
        "
      >
        结束并复盘
      </button>
    </div>
    <div v-if="accountOpen" class="ai-account">
      <template v-if="ai.user"
        ><span
          >{{ ai.user.username }} · 今日
          {{ ai.usage.consumed.toLocaleString() }} /
          {{ ai.usage.limit.toLocaleString() }} tokens</span
        ><span v-if="ai.usage.reserved"
          >预留 {{ ai.usage.reserved.toLocaleString() }}</span
        ><button @click="showNotes">我的笔记</button
        ><button @click="passwordOpen = !passwordOpen">修改密码</button
        ><button v-if="ai.messages.length" @click="exportChat">导出对话</button
        ><RouterLink v-if="ai.user.role === 'admin'" to="/admin"
          >题库维护</RouterLink
        ><button @click="logout()">退出登录</button></template
      ><span v-else>登录后保存对话和生成练习</span>
    </div>
    <form
      v-if="passwordOpen && ai.user"
      class="ai-account ai-password"
      @submit.prevent="changePassword"
    >
      <label
        >当前密码<input
          v-model="currentPassword"
          type="password"
          required
          autocomplete="current-password"
      /></label>
      <label
        >新密码<input
          v-model="newPassword"
          type="password"
          required
          minlength="12"
          maxlength="200"
          autocomplete="new-password"
          placeholder="至少 12 位"
      /></label>
      <button class="button button-small">保存密码</button
      ><button type="button" @click="passwordOpen = false">取消</button>
    </form>
    <p v-if="accountNotice" class="ai-account" role="status">
      {{ accountNotice }}
    </p>
    <Teleport v-if="historyTarget && ai.user" to="#ai-history-slot"
      ><div class="ai-side-history">
        <button class="ai-new-chat" @click="fresh">
          <AppIcon name="edit" :size="18" />新对话</button
        ><label class="ai-history-search"
          ><AppIcon name="search" :size="16" /><input
            v-model="search"
            placeholder="搜索对话"
            aria-label="搜索对话"
        /></label>
        <p class="ai-history-label">近期对话</p>
        <div class="ai-history-items">
          <div
            v-for="c in filtered"
            :key="c.id"
            class="ai-history-row"
            :class="{ selected: ai.current?.id === c.id }"
          >
            <button @click="openConversation(c.id)">
              {{ c.title }}</button><button
              class="ai-rename"
              aria-label="重命名会话"
              @click="rename(c.id, c.title)"
            >
              <AppIcon name="edit" :size="14" /></button
            ><button
              class="ai-rename"
              aria-label="删除会话"
              @click="remove(c.id)"
            >
              <AppIcon name="delete" :size="14" />
            </button>
          </div>
          <p v-if="!filtered.length" class="muted small">
            {{ search ? "没有匹配的对话" : "开始一段新对话" }}
          </p>
        </div>
      </div></Teleport
    >
    <AppDialog v-model:open="historyOpen" label="会话列表" side="left">
      <section class="ai-history-drawer">
        <header>
          <strong>对话</strong
          ><button
            class="icon-button"
            aria-label="关闭会话列表"
            @click="historyOpen = false"
          >
            <AppIcon name="close" />
          </button>
        </header>
        <button
          class="ai-new-chat"
          @click="
            fresh();
            historyOpen = false;
          "
        >
          <AppIcon name="edit" />新对话</button
        ><label class="ai-history-search"
          ><AppIcon name="search" /><input
            v-model="search"
            aria-label="搜索会话"
            placeholder="搜索对话"
        /></label>
        <div v-for="c in filtered" :key="c.id" class="ai-history-row">
          <button @click="openConversation(c.id)">{{ c.title }}</button><button
            class="icon-button"
            aria-label="重命名会话"
            @click="rename(c.id, c.title)"
          >
            <AppIcon name="edit" :size="16" /></button
          ><button
            class="icon-button"
            aria-label="删除会话"
            @click="remove(c.id)"
          >
            <AppIcon name="delete" :size="16" />
          </button>
        </div>
        <p v-if="!filtered.length" class="muted">暂无对话</p>
      </section>
    </AppDialog>
    <div v-if="!ready || ai.checking" class="ai-loading" role="status">
      正在读取对话…
    </div>
    <div v-else-if="!ai.user" class="ai-auth">
      <div class="ai-auth-intro">
        <span class="ai-glyph"><AppIcon name="chat" :size="27" /></span>
        <h1>AI 学习助手</h1>
        <p>解释知识点，复盘项目，生成你需要的练习。</p>
      </div>
      <form class="ai-login" @submit.prevent="login">
        <h2>{{ registering ? "加入学习空间" : "登录 AI 学习空间" }}</h2>
        <label
          >用户名<input
            v-model="loginName"
            :id="`${authFormId}-username`"
            name="username"
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
            :spellcheck="false"
            enterkeyhint="next"
            required
            :minlength="registering ? 2 : 1"
            maxlength="80"
        /></label>
        <div class="ai-auth-field">
          <label :for="`${authFormId}-password`">密码</label>
          <div class="ai-password-field">
            <input
              v-model="password"
              :id="`${authFormId}-password`"
              name="password"
              :type="passwordVisible ? 'text' : 'password'"
              :autocomplete="registering ? 'new-password' : 'current-password'"
              autocapitalize="none"
              autocorrect="off"
              :spellcheck="false"
              :enterkeyhint="registering ? 'next' : 'go'"
              :aria-describedby="
                registering ? `${authFormId}-password-hint` : undefined
              "
              required
              maxlength="200"
              :minlength="registering ? 12 : 1"
            />
            <button
              type="button"
              class="ai-password-toggle"
              :aria-label="passwordVisible ? '隐藏密码' : '显示密码'"
              :aria-pressed="passwordVisible"
              :disabled="ai.busy"
              @click="togglePassword"
            >
              {{ passwordVisible ? "隐藏" : "显示" }}
            </button>
          </div>
          <p
            v-if="registering"
            :id="`${authFormId}-password-hint`"
            class="muted small"
          >
            至少 12 个字符
          </p>
        </div>
        <label v-if="registering"
          >邀请码<input
            v-model="invitation"
            name="invitation"
            required
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            :spellcheck="false"
            enterkeyhint="go"
            minlength="16"
            maxlength="160"
        /></label>
        <p v-if="ai.error" class="ai-error" role="alert">{{ ai.error }}</p>
        <button type="submit" class="button button-primary" :disabled="ai.busy">
          {{
            ai.busy
              ? registering
                ? "正在创建…"
                : "正在登录…"
              : registering
                ? "创建账号"
                : "登录"
          }}</button><button
          type="button"
          class="ai-text-button"
          :disabled="ai.busy"
          @click="toggleRegistration"
        >
          {{ registering ? "已有账号，去登录" : "使用邀请码注册" }}</button
        ><RouterLink to="/library" class="ai-auth-back"
          >继续浏览题库</RouterLink
        >
      </form>
    </div>
    <template v-else>
      <div ref="transcript" class="ai-transcript" @scroll.passive="onScroll">
        <div class="ai-conversation-width">
          <section v-if="!ai.messages.length && !ai.active" class="ai-welcome">
            <span class="ai-glyph"><AppIcon name="chat" :size="30" /></span>
            <h1>
              {{
                contextQuestion
                  ? "这道题，哪里还不清楚？"
                  : "有什么想深入聊聊？"
              }}
            </h1>
            <p>
              {{
                contextQuestion
                  ? contextQuestion.prompt
                  : "从一个知识点、一段代码，或你的项目开始。"
              }}
            </p>
          </section>
          <form
            v-if="isInterview && !ai.messages.length"
            class="ai-interview-setup"
            @submit.prevent="send('chat', '开始模拟面试，请先问一个具体问题。')"
          >
            <label
              >主问题<select
                v-model.number="interviewOptions.mainQuestions"
                aria-label="主问题"
              >
                <option v-for="n in [2, 4, 6, 8]" :key="n" :value="n">
                  {{ n }} 道
                </option>
              </select></label
            >
            <label
              >每题最多追问<select
                v-model.number="interviewOptions.followups"
                aria-label="每题最多追问"
              >
                <option v-for="n in [0, 1, 2, 3]" :key="n" :value="n">
                  {{ n }} 次
                </option>
              </select></label
            >
            <label
              >时长<select
                v-model.number="interviewOptions.minutes"
                aria-label="时长"
              >
                <option v-for="n in [5, 10, 20, 30, 45]" :key="n" :value="n">
                  {{ n }} 分钟
                </option>
              </select></label
            >
            <p class="muted small">
              按回答决定追问深度，结束后集中给出逐题点评。
            </p>
          </form>
          <article
            v-for="message in ai.messages"
            :key="message.id"
            class="ai-message"
            :class="'ai-message-' + message.role"
          >
            <div v-if="message.role === 'user'" class="ai-user-text">
              {{ message.text }}
            </div>
            <template v-else
              ><AiInterviewReport
                v-if="message.report"
                :report="message.report"
              />
              <div v-if="message.interviewStep" class="ai-question-step">
                第 {{ message.interviewStep.main }} 组{{
                  message.interviewStep.followup
                    ? " · 追问 " + message.interviewStep.followup
                    : " · 主问题"
                }}
              </div>
              <div v-if="message.result" class="ai-assessment">
                <h3>已经答到</h3>
                <div v-for="point in message.result.covered" :key="point.quote">
                  <blockquote>{{ point.quote }}</blockquote>
                  <p>{{ point.comment }}</p>
                </div>
                <template
                  v-if="
                    message.result.improvements.some(
                      (point) => point.type !== '拓展',
                    )
                  "
                >
                  <h3>需要改进</h3>
                  <div
                    v-for="point in message.result.improvements.filter(
                      (point) => point.type !== '拓展',
                    )"
                    :key="point.type + ':' + point.point"
                    class="ai-improvement"
                  >
                    <span>{{ point.type }}</span>
                    <div>
                      <strong>{{ point.point }}</strong>
                      <p>{{ point.reason }}</p>
                    </div>
                  </div>
                </template>
                <template
                  v-if="
                    message.result.improvements.some(
                      (point) => point.type === '拓展',
                    )
                  "
                >
                  <h3>进一步练习</h3>
                  <div
                    v-for="point in message.result.improvements.filter(
                      (point) => point.type === '拓展',
                    )"
                    :key="point.point"
                    class="ai-improvement"
                  >
                    <span>{{ point.type }}</span>
                    <div>
                      <strong>{{ point.point }}</strong>
                      <p>{{ point.reason }}</p>
                    </div>
                  </div>
                </template>
                <div class="ai-dimensions">
                  <span
                    v-for="d in message.result.dimensions"
                    :key="d.name"
                    :title="d.reason"
                    >{{ d.name }} · {{ d.level }}</span
                  >
                </div>
                <h3>可以这样回答</h3>
              </div>
              <AiMarkdown v-if="!message.report" :text="message.text" />
              <div class="ai-message-actions">
                <button @click="copy(message.id, message.text)">
                  <AppIcon name="copy" :size="15" />{{
                    copied === message.id ? "已复制" : "复制"
                  }}</button
                ><button
                  v-if="!isInterview || interviewFinished"
                  @click="note(message.id, message.text)"
                >
                  <AppIcon name="document" :size="15" />{{
                    savedNote === message.id ? "已保存" : "保存笔记"
                  }}</button
                ><button
                  v-if="message.result"
                  @click="
                    send('followup', '围绕我的回答继续考我，只提出一道追问。')
                  "
                >
                  继续考我
                </button>
              </div>
              <div v-if="message.result" class="ai-next-question">
                <span>下一步</span>
                <p>{{ message.result.followup }}</p>
              </div></template
            >
          </article>
          <article v-if="streaming" class="ai-message ai-message-assistant">
            <AiMarkdown :text="streaming" /><span
              v-if="ai.active"
              class="ai-stream-dot"
            ></span>
          </article>
          <div v-if="ai.active && !streaming" class="ai-thinking" role="status">
            <span></span
            >{{ ai.run?.status === "queued" ? "正在等待回复" : "正在整理回答" }}
          </div>
          <p
            v-if="
              ai.run &&
              ['failed', 'outcome_unknown', 'canceled'].includes(ai.run.status)
            "
            class="ai-run-notice"
            role="status"
          >
            {{
              ai.run.status === "canceled"
                ? "已停止回复，已接收的内容保留在这里。"
                : ai.run.error || "回复未完成，请稍后重试。"
            }}
          </p>
        </div>
      </div>
      <div class="ai-composer-area">
        <div class="ai-conversation-width">
          <button v-if="newContent" class="ai-jump" @click="scrollEnd">
            回到最新回复
          </button>
          <div v-if="!ai.messages.length" class="ai-starters">
            <button
              v-for="example in examples"
              :key="example.title"
              @click="
                example.text
                  ? ((text = example.text), input?.focus())
                  : router.push('/generate')
              "
            >
              <AppIcon :name="example.icon" :size="17" />{{ example.title }}
            </button>
          </div>
          <p v-if="ai.error" class="ai-error" role="alert">{{ ai.error }}</p>
          <div
            class="ai-composer"
            @focusin="focusInput"
            @focusout="composerBlur"
          >
            <details
              v-if="props.quote || ai.current?.context.quote"
              class="ai-quote"
            >
              <summary>引用的内容</summary>
              <blockquote>
                {{ props.quote || ai.current?.context.quote }}
              </blockquote>
            </details>
            <div v-if="contextQuestion" class="ai-context-chips">
              <button @click="contextOpen = !contextOpen">
                <AppIcon name="document" :size="14" />当前题目</button
              ><span v-if="linkedAnswer">我的回答</span
              ><button
                v-if="!ai.current && !embedded"
                aria-label="移除关联题目"
                @click="questionId = ''"
              >
                ×
              </button>
            </div>
            <textarea
              ref="input"
              v-model="text"
              name="message"
              inputmode="text"
              enterkeyhint="enter"
              autocomplete="off"
              aria-label="给 AI 发送消息"
              :placeholder="ai.enabled ? '输入你的问题…' : 'AI 服务尚未启用'"
              rows="2"
              maxlength="8000"
              :disabled="!ai.enabled || interviewFinished"
              @compositionstart="compositionStart"
              @compositionend="compositionEnd"
              @change="compositionChange"
              @keydown="keydown"
            ></textarea>
            <div class="ai-composer-tools">
              <RouterLink to="/generate"
                ><AppIcon name="experiment" :size="17" />生成练习</RouterLink
              ><button
                v-if="contextQuestion && !isInterview"
                :disabled="ai.active || ai.sending || !linkedAnswer"
                @click="
                  send(
                    'assess',
                    '请点评我的回答，依据原文指出已经答到的要点和需要补充的内容。',
                  )
                "
              >
                点评回答</button
              ><button
                v-if="ai.messages.length > 2 && !isInterview"
                :disabled="ai.active || ai.sending"
                @click="
                  send(
                    'recap',
                    '请复盘这次对话，提炼已讲清和需要独立验证的知识点。',
                  )
                "
              >
                复盘</button
              ><button
                v-if="ai.active"
                class="ai-send"
                aria-label="停止回复"
                @click="ai.cancel"
              >
                <AppIcon name="pause" :size="18" /></button
              ><button
                v-else
                class="ai-send"
                aria-label="发送消息"
                :disabled="!text.trim() || ai.sending || !ai.enabled"
                @click="send()"
              >
                <AppIcon name="send" :size="19" />
              </button>
            </div>
          </div>
          <p v-if="!ai.enabled || contextQuestion" class="ai-composer-note">
            {{ ai.enabled ? "" : "模型配置完成后即可交流。"
            }}<template v-if="contextQuestion"
              >对话已关联题目与当前回答。</template
            >
          </p>
        </div>
      </div>
    </template>
    <AppDialog v-model:open="notesOpen" label="我的笔记">
      <aside class="ai-context-panel">
        <header>
          <strong>我的笔记</strong
          ><button
            class="icon-button"
            aria-label="关闭笔记"
            @click="notesOpen = false"
          >
            <AppIcon name="close" />
          </button>
        </header>
        <p v-if="!notes.length" class="muted">
          保存对话回复后，可以在这里回顾。
        </p>
        <p v-if="ai.error" class="ai-error" role="alert">{{ ai.error }}</p>
        <details v-for="item in notes" :key="item.id" class="ai-saved-note">
          <summary>{{ item.title }}</summary>
          <form
            v-if="noteDraft?.id === item.id"
            class="ai-note-editor"
            @submit.prevent="saveNote"
          >
            <label
              >笔记名称<input
                v-model="noteDraft.title"
                required
                maxlength="120" /></label
            ><label
              >笔记内容<textarea
                v-model="noteDraft.content"
                required
                maxlength="60000"
                rows="10"
              /></label
            ><button class="button button-small">保存修改</button
            ><button
              type="button"
              class="ai-text-button"
              @click="noteDraft = undefined"
            >
              取消
            </button>
          </form>
          <AiMarkdown v-else :text="item.content" /><button
            class="ai-text-button"
            @click="copy(item.id, item.content)"
          >
            {{ copied === item.id ? "已复制" : "复制笔记" }}</button
          ><button class="ai-text-button" @click="noteDraft = { ...item }">
            编辑</button
          ><button class="ai-text-button" @click="deleteNote(item.id)">
            删除
          </button>
        </details>
      </aside>
    </AppDialog>
    <AppDialog
      v-if="contextQuestion"
      v-model:open="contextOpen"
      label="关联题目"
    >
      <aside class="ai-context-panel">
        <header>
          <strong>关联题目</strong
          ><button
            class="icon-button"
            aria-label="关闭题目"
            @click="contextOpen = false"
          >
            <AppIcon name="close" />
          </button>
        </header>
        <span class="muted small">版本 {{ contextQuestion.version || 1 }}</span>
        <h2>{{ contextQuestion.prompt }}</h2>
        <h3 v-if="linkedAnswer">我的回答</h3>
        <p class="ai-context-answer">{{ linkedAnswer }}</p>
        <RouterLink
          class="button"
          :to="{ path: '/practice', query: { question: contextQuestion.id } }"
          >返回练习</RouterLink
        >
      </aside>
    </AppDialog>
  </div>
</template>
<style>
.app-shell.is-ai {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}
.app-shell.is-ai .workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.app-shell.is-ai .topbar,
.app-shell.is-ai .page-footer {
  display: none;
}
.app-shell.is-ai .main-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  margin: 0;
  padding: 0;
  max-width: none;
  overflow: hidden;
}
.app-shell.is-ai .sidebar-bottom {
  margin-top: auto;
}
.app-shell.is-ai .second-caption,
.app-shell.is-ai .sidebar > nav[aria-label="个人学习"] {
  display: none;
}
.app-shell.is-ai .nav-caption {
  display: none;
}
.app-shell.is-ai .side-nav {
  padding-bottom: 14px;
}
.app-shell.is-ai .install-card {
  display: none;
}
.app-shell.is-ai .sidebar {
  gap: 12px;
}
.ai-page {
  height: 100%;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: #fafbf8;
}
.ai-password label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ai-password input,
.ai-note-editor input,
.ai-note-editor textarea {
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  min-width: 0;
  max-width: 100%;
}
.ai-note-editor {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 16px 0;
}
.ai-note-editor label {
  display: flex;
  gap: 8px;
  flex-direction: column;
  width: 100%;
}
.ai-saved-note > .ai-text-button {
  margin: 8px 14px 0 0;
}
.ai-interview-setup {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin: 0 auto 26px;
  max-width: 600px;
}
.ai-interview-setup label {
  display: flex;
  flex: 1;
  min-width: 120px;
  flex-direction: column;
  gap: 8px;
  font-size: 0.875rem;
}
.ai-interview-setup select {
  background: white;
  border: 1px solid var(--border);
  padding: 10px;
  border-radius: 8px;
}
.ai-interview-setup p {
  flex-basis: 100%;
}
.ai-quote {
  font-size: 0.8125rem;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
}
.ai-quote summary {
  cursor: pointer;
}
.ai-quote blockquote {
  margin: 10px 0 0;
  padding-left: 12px;
  border-left: 2px solid var(--border);
  max-height: 140px;
  overflow: auto;
  white-space: pre-wrap;
}
.ai-embedded .ai-auth {
  padding: 24px;
}
.ai-page.is-empty .ai-composer-area {
  padding-top: 12px;
}
.is-ai #ai-history-slot {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.is-ai .brand {
  margin-bottom: 16px;
}
.ai-header {
  height: 66px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 30px;
}
.ai-header > strong {
  font-size: 0.9375rem;
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-header-actions {
  display: flex;
  gap: 5px;
  align-items: center;
  margin-left: auto;
  flex-shrink: 0;
}
.ai-header .icon-button {
  width: 38px;
  height: 38px;
}
.ai-mobile-history {
  display: none !important;
}
.ai-transcript {
  flex: 1;
  overflow: auto;
  min-height: 0;
  scrollbar-gutter: stable;
}
.ai-conversation-width {
  width: min(100% - 64px, 760px);
  margin: 0 auto;
}
.ai-welcome {
  padding: clamp(48px, 12vh, 140px) 0 24px;
  text-align: center;
}
.ai-glyph {
  display: inline-flex;
  width: 52px;
  height: 52px;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  border-radius: 16px;
  background: #eaf0e6;
  margin-bottom: 24px;
}
.ai-welcome h1 {
  font-size: clamp(1.5rem, 2.6vw, 2rem);
  font-weight: 550;
  letter-spacing: -0.03em;
  line-height: 1.5;
}
.ai-welcome p {
  color: #778078;
  font-size: 1rem;
  margin: 16px auto 0;
  max-width: 580px;
  line-height: 1.9;
}
.ai-message {
  margin: 24px 0 38px;
}
.ai-message-user {
  display: flex;
  justify-content: flex-end;
  margin-top: 32px;
  margin-bottom: 28px;
}
.ai-user-text {
  background: #edf0e8;
  border-radius: 18px 18px 5px 18px;
  padding: 12px 18px;
  max-width: 90%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
.ai-message-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 18px;
}
.ai-message-actions button,
.ai-text-button,
.ai-composer-tools > a,
.ai-composer-tools > button:not(.ai-send) {
  background: none;
  border: 0;
  padding: 4px 0;
  font-size: 0.875rem;
  color: #748077;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.ai-message-actions button:hover,
.ai-text-button:hover {
  color: var(--primary);
}
.ai-composer-area {
  padding: 10px 0 8px;
  flex-shrink: 0;
  position: relative;
}
.ai-composer {
  background: white;
  border: 1px solid #dce2d7;
  border-radius: 20px;
  box-shadow: 0 3px 15px #263b3207;
  overflow: hidden;
}
.ai-composer:focus-within {
  border-color: #8da58b;
  box-shadow: 0 0 0 2px #e9efdf;
}
.ai-composer textarea {
  display: block;
  width: 100%;
  min-height: 72px;
  max-height: 180px;
  padding: 17px 20px 8px;
  resize: none;
  background: none;
  border: 0;
  outline: none;
  color: var(--text);
  font-size: 1rem;
  line-height: 1.7;
  box-shadow: none;
}
.ai-composer-tools {
  display: flex;
  gap: 18px;
  align-items: center;
  padding: 8px 14px 12px 20px;
}
.ai-composer-tools .ai-send {
  margin-left: auto;
  background: var(--primary);
  color: white;
  border: 0;
  border-radius: 10px;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.ai-send:disabled {
  background: #e8ece3;
  color: #9da79b;
  opacity: 1;
}
.ai-composer-note {
  font-size: 0.75rem;
  text-align: center;
  color: #8b958a;
  min-height: 24px;
  padding-top: 5px;
}
.ai-starters {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 24px;
}
.ai-starters button {
  display: flex;
  gap: 7px;
  align-items: center;
  border: 1px solid #e3e7dd;
  border-radius: 10px;
  background: transparent;
  font-size: 0.875rem;
  padding: 9px 13px;
  color: #5f6d60;
}
.ai-starters button:hover {
  background: #eef2e8;
}
.ai-context-chips {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px 16px 0;
  font-size: 0.75rem;
}
.ai-context-chips button,
.ai-context-chips span {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  background: #eff3e9;
  border: 0;
  border-radius: 5px;
  padding: 4px 7px;
  color: #58704f;
}
.ai-jump {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 1px solid var(--border);
  border-radius: 20px;
  background: white;
  padding: 6px 15px;
  box-shadow: 0 2px 12px #0001;
  font-size: 0.875rem;
}
.ai-side-history {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
}
.ai-new-chat {
  display: flex;
  gap: 10px;
  align-items: center;
  border: 0;
  border-radius: 8px;
  background: #e8eee2;
  padding: 10px 13px;
  font-size: 0.875rem;
  text-align: left;
  width: 100%;
  color: #476244;
}
.ai-history-search {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 16px 0 20px;
  color: #87917f;
}
.ai-history-search input {
  border: 0;
  outline: 0;
  min-width: 0;
  width: 100%;
  background: none;
  font-size: 0.875rem;
  color: var(--text);
}
.ai-history-label {
  font-size: 0.75rem;
  color: #84907c;
  margin-bottom: 8px;
  padding-left: 10px;
}
.ai-history-items {
  overflow: auto;
  min-height: 0;
  flex: 1;
}
.ai-history-row {
  display: flex;
  align-items: center;
  border-radius: 7px;
  min-height: 39px;
  padding-right: 5px;
}
.ai-history-row:hover,
.ai-history-row.selected {
  background: #e9eee3;
}
.ai-history-row > button:first-child {
  border: 0;
  background: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 0.875rem;
  padding: 9px 10px;
  color: #55614e;
}
.ai-history-row .ai-rename {
  display: none;
  background: none;
  border: 0;
  padding: 4px;
  color: #7a8871;
}
.ai-history-row:hover .ai-rename,
.ai-history-row:focus-within .ai-rename {
  display: inline-flex;
}
.ai-history-drawer {
  width: min(85vw, 320px);
  height: 100dvh;
  background: #f3f5ed;
  padding: 20px;
  overflow-y: auto;
}
.ai-history-drawer header,
.ai-context-panel header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.ai-context-panel {
  margin-left: auto;
  width: min(440px, 100vw);
  height: 100dvh;
  background: #fff;
  padding: 26px;
  overflow: auto;
}
.ai-context-panel h2 {
  font-size: 1.15rem;
  line-height: 1.85;
  margin: 18px 0 28px;
}
.ai-context-answer {
  white-space: pre-wrap;
  margin: 12px 0 28px;
  line-height: 1.9;
}
.ai-loading {
  margin: auto;
  color: var(--muted);
}
.ai-auth {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 5vh 24px;
}
.ai-auth-intro {
  text-align: center;
  margin-bottom: 30px;
}
.ai-auth-intro h1 {
  font-size: 1.8rem;
  font-weight: 550;
}
.ai-auth-intro p {
  color: var(--muted);
  margin-top: 12px;
}
.ai-login {
  max-width: 380px;
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: #fff;
  border: 1px solid var(--border);
  padding: 28px;
  border-radius: 18px;
}
.ai-login h2 {
  font-size: 1rem;
}
.ai-login label,
.ai-auth-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 0.875rem;
}
.ai-login input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  outline-color: #97b38c;
  min-height: 44px;
  font-size: 1rem;
  color: var(--text);
  background: #fff;
  -webkit-text-fill-color: var(--text);
  -webkit-appearance: none;
  appearance: none;
}
.ai-password-field {
  position: relative;
}
.ai-password-field input {
  padding-right: 68px;
}
.ai-password-toggle {
  position: absolute;
  top: 0;
  right: 4px;
  min-width: 56px;
  min-height: 44px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 0.875rem;
}
.ai-login .ai-text-button {
  justify-content: center;
}
.ai-auth-back {
  text-align: center;
  color: var(--muted);
  font-size: 0.875rem;
}
.ai-error {
  background: #fbf0e9;
  color: #96533c;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.875rem;
  margin: 8px 0;
  line-height: 1.6;
}
.ai-account {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 30px;
  border-bottom: 1px solid var(--border);
  font-size: 0.875rem;
  background: #f1f4ed;
}
.ai-account button {
  border: 0;
  background: none;
  color: var(--primary);
}
.ai-account a {
  color: var(--primary);
}
.ai-thinking {
  display: flex;
  gap: 10px;
  align-items: center;
  color: #798473;
  font-size: 0.875rem;
  padding-bottom: 28px;
}
.ai-thinking span,
.ai-stream-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #8ca079;
  animation: ai-pulse 1.3s ease-in-out infinite;
}
.ai-stream-dot {
  margin-top: 10px;
}
.ai-run-notice {
  color: #8a765d;
  font-size: 0.875rem;
  padding: 12px 0 24px;
}
.ai-assessment h3 {
  margin: 26px 0 12px;
  font-size: 1rem;
}
.ai-assessment h3:first-child {
  margin-top: 0;
}
.ai-assessment blockquote {
  border-left: 3px solid #bdc9b4;
  margin: 12px 0;
  padding: 6px 14px;
  background: #f0f3eb;
  color: #6b7b60;
}
.ai-assessment p {
  font-size: 0.9375rem;
}
.ai-improvement {
  display: flex;
  gap: 12px;
  margin: 15px 0;
}
.ai-improvement > span {
  font-size: 0.75rem;
  white-space: nowrap;
  align-self: flex-start;
  color: #8a7046;
  background: #f5eddd;
  border-radius: 5px;
  padding: 2px 6px;
}
.ai-improvement strong {
  font-size: 0.9375rem;
}
.ai-improvement p {
  color: #6e7b65;
  margin-top: 4px;
}
.ai-dimensions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 24px 0;
}
.ai-dimensions span {
  font-size: 0.75rem;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.ai-next-question {
  border-top: 1px solid var(--border);
  padding-top: 16px;
  margin-top: 18px;
}
.ai-next-question > span {
  font-size: 0.75rem;
  color: var(--muted);
}
.ai-next-question p {
  margin-top: 6px;
  font-size: 0.9375rem;
}
@keyframes ai-pulse {
  50% {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ai-thinking span,
  .ai-stream-dot {
    animation: none;
  }
}
@media (max-width: 1199px) {
  .ai-mobile-history {
    display: grid !important;
  }
  .app-shell.is-ai #ai-history-slot {
    display: none;
  }
}
@media (max-width: 700px) {
  .app-shell.is-ai {
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .app-shell.is-ai .bottom-nav {
    position: static;
  }
  .app-shell.is-ai .workspace {
    padding: 0 !important;
  }
  .app-shell.is-ai .main-content {
    padding: 0 !important;
  }
  .ai-keyboard .app-shell.is-ai .bottom-nav {
    display: none;
  }
  .ai-header {
    height: 56px;
    padding: 0 12px;
    gap: 8px;
  }
  .ai-header .button-small {
    padding: 5px 8px;
    font-size: 0.75rem;
  }
  .ai-header-actions {
    gap: 0;
  }
  .ai-conversation-width {
    width: calc(100% - 36px);
  }
  .ai-welcome {
    padding: 65px 6px 28px;
  }
  .ai-welcome h1 {
    font-size: 1.5rem;
  }
  .ai-welcome p {
    font-size: 0.9375rem;
  }
  .ai-composer-area {
    padding: 6px 0 max(4px, env(safe-area-inset-bottom));
  }
  .app-shell.is-ai .ai-composer-area {
    padding-bottom: 12px;
  }
  .ai-keyboard .app-shell.is-ai .ai-composer-area {
    padding-bottom: max(8px, env(safe-area-inset-bottom));
  }
  .ai-interview-setup {
    gap: 10px;
  }
  .ai-interview-setup label {
    min-width: 0;
  }
  .ai-interview-setup select {
    min-width: 0;
    max-width: 100%;
    padding: 9px 6px;
    font-size: 1rem;
  }
  .ai-composer {
    border-radius: 17px;
  }
  .ai-composer-tools {
    gap: 14px;
    padding: 6px 12px 10px 14px;
  }
  .ai-composer-tools > a,
  .ai-composer-tools > button:not(.ai-send) {
    font-size: 0.8125rem;
  }
  .ai-composer textarea {
    padding: 14px 15px 7px;
    font-size: 1rem;
    min-height: 65px;
  }
  .ai-starters {
    gap: 7px;
    margin-bottom: 18px;
  }
  .ai-starters button {
    padding: 8px;
    font-size: 0.8125rem;
    gap: 5px;
  }
  .ai-starters .app-icon {
    font-size: 15px !important;
  }
  .ai-message {
    margin-bottom: 28px;
  }
  .ai-user-text {
    max-width: 94%;
    padding: 10px 14px;
  }
  .ai-auth {
    padding: 4vh 20px 24px;
  }
  .ai-auth-intro p {
    font-size: 0.875rem;
  }
  .ai-account {
    padding: 10px 18px;
  }
  .ai-context-panel {
    width: 100%;
    padding: 20px;
  }
  .ai-composer-note {
    font-size: 0.6875rem;
  }
  .ai-glyph {
    margin-bottom: 18px;
  }
  .ai-header-actions .icon-button {
    width: 34px;
  }
  .ai-login {
    padding: 24px;
  }
  .ai-assessment p {
    font-size: 1rem;
  }
}
</style>
