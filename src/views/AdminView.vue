<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../infrastructure/ai-client";
import { useAiStore } from "../stores/ai";
import { bank, syncContent } from "../data/content";
import type { Candidate } from "../../packages/contracts/ai";
import AppDialog from "../components/AppDialog.vue";
const ai = useAiStore(),
  items = ref<Candidate[]>([]),
  error = ref(""),
  notice = ref(""),
  selected = ref<string[]>([]),
  topic = ref(bank.topics[0]?.id || ""),
  reason = ref(""),
  editor = ref(""),
  editing = ref<Candidate>(),
  invitation = ref("");
const releases = ref<Array<{ id: string; created_at: string }>>([]);
async function load() {
  items.value = (await api("/admin/candidates")).items;
  releases.value = (await api("/admin/releases")).items;
}
async function action(fn: () => Promise<void>) {
  error.value = "";
  notice.value = "";
  try {
    await fn();
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function review(item: Candidate, approved: boolean) {
  await action(async () => {
    await api(`/admin/candidates/${item.id}/review`, {
      method: "POST",
      body: { version: item.version, approved, reason: reason.value },
    });
    notice.value = "审核结果已保存";
  });
}
function edit(item: Candidate) {
  editing.value = item;
  editor.value = JSON.stringify(item.question, null, 2);
}
async function saveEdit() {
  await action(async () => {
    if (!editing.value) return;
    await api(`/admin/candidates/${editing.value.id}`, {
      method: "PUT",
      body: {
        version: editing.value.version,
        question: JSON.parse(editor.value),
      },
    });
    editing.value = undefined;
    notice.value = "修订已保存，需重新审核";
  });
}
async function publish() {
  await action(async () => {
    await api("/admin/releases", {
      method: "POST",
      body: { ids: selected.value, topicId: topic.value },
    });
    await syncContent();
    selected.value = [];
    notice.value = "内容已发布，客户端同步后即可使用";
  });
}
onMounted(async () => {
  if (!ai.user) await ai.init();
  if (ai.user?.role === "admin") await action(load);
});
</script>
<template>
  <div class="admin-page">
    <RouterLink to="/ai">返回 AI</RouterLink>
    <header class="page-heading">
      <div>
        <h1>题库维护</h1>
        <p class="muted">修订、审核和发布生成内容。</p>
      </div>
    </header>
    <p v-if="ai.user?.role !== 'admin'">需要维护账号登录。</p>
    <template v-else
      ><div class="panel admin-toolbar">
        <label
          >审核说明<input
            v-model="reason"
            placeholder="说明核验依据或修订原因" /></label
        ><label
          >发布到专题<select v-model="topic">
            <option v-for="t in bank.topics" :key="t.id" :value="t.id">
              {{ t.title }}
            </option>
          </select></label
        ><button
          class="button button-primary"
          :disabled="!selected.length"
          @click="publish"
        >
          发布已选 {{ selected.length }} 题</button
        ><button
          class="button"
          @click="
            action(async () => {
              invitation = (await api('/admin/invitations', { method: 'POST' }))
                .invitation;
            })
          "
        >
          创建邀请码
        </button>
      </div>
      <p v-if="invitation" class="admin-notice">
        新邀请码：<code>{{ invitation }}</code>
      </p>
      <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="admin-notice" role="status">{{ notice }}</p>
      <p v-if="!items.length" class="muted">
        暂无候选题，生成练习后可在这里审核。
      </p>
      <details class="panel admin-coverage">
        <summary>专题覆盖与补题</summary>
        <div v-for="t in bank.topics" :key="t.id">
          <span>{{ t.title }} · {{ t.questionIds.length }} 道题</span
          ><RouterLink
            :to="{
              path: '/generate',
              query: {
                scope:
                  '围绕' +
                  t.title +
                  '补充机制、场景、故障排查与取舍题，避免已有题目的同义改写。',
              },
            }"
            >生成候选</RouterLink
          >
        </div>
      </details>
      <details class="panel admin-coverage">
        <summary>发布记录</summary>
        <div v-for="release in releases" :key="release.id">
          <span
            >版本 {{ release.id }} ·
            {{
              String(release.created_at).slice(0, 16).replace("T", " ")
            }}</span
          ><button
            class="ai-text-button"
            @click="
              action(async () => {
                await api('/admin/releases/' + release.id + '/restore', {
                  method: 'POST',
                });
                await syncContent();
                notice = '已发布所选版本的内容';
              })
            "
          >
            恢复此版本内容
          </button>
        </div>
      </details>
      <section
        v-for="item in items"
        :key="item.id"
        class="panel admin-candidate"
      >
        <header>
          <label
            ><input
              v-model="selected"
              type="checkbox"
              :value="item.id"
              :disabled="item.review !== 'approved'"
            />选择</label
          ><span class="muted small"
            >版本 {{ item.version }} ·
            {{
              item.review === "approved"
                ? "已审核"
                : item.review === "rejected"
                  ? "已退回"
                  : "待审核"
            }}</span
          >
        </header>
        <h2>{{ item.question.prompt }}</h2>
        <p class="admin-answer">{{ item.question.explanation }}</p>
        <ul v-if="item.question.choices">
          <li v-for="(choice, index) in item.question.choices" :key="index">
            {{ index === item.question.correctAnswer ? "✓ " : "" }}{{ choice }}
          </li>
        </ul>
        <details>
          <summary>评分要点与检查</summary>
          <pre>{{
            JSON.stringify(
              { rubric: item.question.rubric, checks: item.checks },
              null,
              2,
            )
          }}</pre>
        </details>
        <footer>
          <button class="button button-small" @click="edit(item)">
            修订内容</button
          ><button
            class="button button-small"
            :disabled="reason.length < 2"
            @click="review(item, false)"
          >
            退回</button
          ><button
            class="button button-primary button-small"
            :disabled="reason.length < 2 || !!item.checks.length"
            @click="review(item, true)"
          >
            审核通过
          </button>
        </footer>
      </section>
      <AppDialog
        v-if="editing"
        :open="!!editing"
        label="修订题目"
        class="admin-editor"
        @update:open="editing = undefined"
      >
        <section class="panel">
          <h2>修订题目</h2>
          <textarea
            v-model="editor"
            aria-label="题目 JSON"
            spellcheck="false"
          ></textarea>
          <div>
            <button class="button" @click="editing = undefined">取消</button
            ><button class="button button-primary" @click="saveEdit">
              保存修订
            </button>
          </div>
        </section>
      </AppDialog></template
    >
  </div>
</template>
<style scoped>
.admin-coverage {
  padding: 20px;
  margin: 16px 0;
  font-size: 0.875rem;
}
.admin-coverage summary {
  cursor: pointer;
  font-weight: 600;
}
.admin-coverage > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}
.admin-coverage a {
  color: var(--primary);
}
.admin-page {
  max-width: 1000px;
  margin: auto;
}
.admin-page > .page-heading {
  margin: 24px 0;
}
.admin-toolbar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-end;
  padding: 24px;
  margin-bottom: 22px;
}
.admin-toolbar label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.875rem;
  flex: 1;
  min-width: 180px;
}
.admin-toolbar input,
.admin-toolbar select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: white;
}
.admin-candidate {
  padding: 26px;
  margin: 16px 0;
}
.admin-candidate header {
  display: flex;
  gap: 24px;
  align-items: center;
  font-size: 0.875rem;
}
.admin-candidate h2 {
  margin: 20px 0;
  line-height: 1.8;
}
.admin-answer {
  white-space: pre-wrap;
  line-height: 1.9;
}
.admin-candidate details {
  margin: 20px 0;
  color: var(--muted);
  font-size: 0.875rem;
}
.admin-candidate pre {
  overflow: auto;
  max-width: 100%;
}
.admin-candidate footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 24px;
}
.admin-notice {
  padding: 16px;
  background: #edf3e8;
  overflow-wrap: anywhere;
}
.admin-editor[open] {
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.admin-editor > section {
  width: min(800px, 100%);
  padding: 24px;
  max-height: calc(100dvh - 40px);
  overflow: auto;
}
.admin-editor textarea {
  width: 100%;
  height: 65dvh;
  margin: 16px 0;
  font: 14px/1.7 monospace;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}
.admin-editor > section > div {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
