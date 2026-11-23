<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAiStore } from "../stores/ai";
import { bank, questionById } from "../data/content";
import AppIcon from "../components/AppIcon.vue";
import AiMarkdown from "../components/AiMarkdown.vue";
const ai = useAiStore(),
  route = useRoute(),
  router = useRouter();
const scope = ref(String(route.query.scope || "")),
  count = ref(5),
  difficulty = ref("进阶"),
  kind = ref("oral"),
  expanded = ref(""),
  tab = ref(route.query.tab === "mine" ? "mine" : "generate");
const visible = computed(() => {
  const ids =
    ai.run?.kind === "generate"
      ? new Set(ai.run.output?.candidates?.map((c: any) => c.id) || [])
      : undefined;
  return tab.value === "mine"
    ? ai.candidates.filter((c) => c.saved)
    : ids?.size
      ? ai.candidates
          .filter((c) => ids.has(c.id))
          .sort((a, b) => [...ids].indexOf(a.id) - [...ids].indexOf(b.id))
      : ai.candidates.filter((c) => !c.saved);
});
const currentCandidates = computed(() =>
  ai.run?.kind === "generate"
    ? (ai.run.output?.candidates || []).map(
        (candidate: any) =>
          ai.candidates.find((item) => item.id === candidate.id) || candidate,
      )
    : [],
);
const readyCount = computed(
  () => currentCandidates.value.filter((c: any) => !c.checks.length).length,
);
const remaining = computed(() =>
  Math.max(0, (ai.run?.output?.requested || 0) - readyCount.value),
);
async function generate(amount = count.value, source?: any) {
  const run = await ai.generate({
    scope: source?.scope ?? scope.value,
    count: amount,
    difficulty: source?.difficulty ?? difficulty.value,
    kind: source?.kind ?? kind.value,
  });
  if (run) await router.replace({ path: "/generate", query: { run: run.id } });
}
async function supplement() {
  await generate(remaining.value, (ai.run as any)?.input);
}
async function selectTask(task: any) {
  ai.watchRun(task);
  tab.value = "generate";
  if (task.input) {
    scope.value = task.input.scope;
    difficulty.value = task.input.difficulty;
    kind.value = task.input.kind;
    count.value = task.input.count;
  }
  await router.replace({ path: "/generate", query: { run: task.id } });
}
onMounted(async () => {
  if (!ai.user) await ai.init();
  if (ai.user) {
    await ai.loadQuestions();
    const r =
      ai.tasks.find((t) => t.id === route.query.run) ||
      (!route.query.run
        ? ai.tasks.find((t) => ["queued", "running"].includes(t.status))
        : undefined);
    if (r) {
      ai.watchRun(r);
      const input = (r as any).input;
      if (input) {
        scope.value = input.scope;
        difficulty.value = input.difficulty;
        kind.value = input.kind;
        count.value = input.count;
      }
      if (!route.query.run)
        await router.replace({ path: "/generate", query: { run: r.id } });
    }
  }
});
onBeforeUnmount(() => ai.stopSubscription());
</script>
<template>
  <div class="generation-page">
    <RouterLink to="/ai" class="generation-back"
      ><AppIcon name="back" :size="16" />返回 AI</RouterLink
    >
    <header class="page-heading">
      <div>
        <h1>补充练习</h1>
        <p class="muted">围绕知识点和考查角度，补足你需要的练习。</p>
      </div>
      <div class="generation-tabs">
        <button
          :class="{ selected: tab === 'generate' }"
          @click="tab = 'generate'"
        >
          生成练习</button
        ><button :class="{ selected: tab === 'mine' }" @click="tab = 'mine'">
          我的题库
        </button>
      </div>
    </header>
    <div v-if="!ai.user" class="panel generation-empty">
      <h2>登录后生成和保存练习</h2>
      <RouterLink class="button button-primary" to="/ai">去登录</RouterLink>
    </div>
    <template v-else
      ><form
        v-if="tab === 'generate'"
        class="panel generation-form"
        @submit.prevent="generate()"
      >
        <label class="generation-scope"
          >练习什么<textarea
            v-model="scope"
            required
            minlength="2"
            maxlength="1500"
            placeholder="例如：大文件上传的失败重试、幂等和合并互斥，重点考场景和取舍。"
            rows="3"
          ></textarea>
        </label>
        <div class="generation-topic-chips">
          <button
            v-for="topic in bank.topics.slice(0, 6)"
            :key="topic.id"
            type="button"
            @click="scope = topic.title"
          >
            {{ topic.title }}
          </button>
        </div>
        <div class="generation-options">
          <label
            >难度<select v-model="difficulty" aria-label="难度">
              <option>基础</option>
              <option>进阶</option>
              <option>深入</option>
            </select></label
          ><label
            >题型<select v-model="kind" aria-label="题型">
              <option value="oral">口述题</option>
              <option value="choice">选择题</option>
              <option value="boolean">判断题</option>
              <option value="mixed">混合</option>
            </select></label
          ><label
            >数量<select v-model.number="count" aria-label="数量">
              <option v-for="n in 20" :key="n" :value="n">{{ n }} 道</option>
            </select></label
          ><button
            class="button button-primary"
            :disabled="
              ai.active || ai.sending || !ai.enabled || scope.trim().length < 2
            "
          >
            <AppIcon name="experiment" :size="17" />{{
              ai.sending ? "正在创建…" : "生成练习"
            }}
          </button>
        </div>
        <p class="muted small">
          生成内容先进入个人题库，通过检查后可练习。公共题库由维护者审核发布。
        </p>
      </form>
      <div v-if="ai.error" class="ai-error" role="alert">{{ ai.error }}</div>
      <p
        v-if="ai.run?.kind === 'check'"
        class="generation-history"
        role="status"
      >
        {{
          ai.active
            ? "正在复核题目"
            : ai.run.status === "succeeded"
              ? "复核已完成，检查结果已更新"
              : ai.run.error || "复核已停止"
        }}
      </p>
      <section
        v-if="ai.run?.kind === 'generate'"
        class="panel generation-progress"
        role="status"
      >
        <div>
          <strong>{{
            ai.active
              ? "正在生成练习"
              : ai.run.status === "succeeded"
                ? "练习已生成"
                : ai.run.status === "partially_succeeded"
                  ? "部分练习已生成"
                  : "任务已结束"
          }}</strong>
          <p class="muted small">
            已生成 {{ currentCandidates.length }} 道候选题，{{
              readyCount
            }}
            道通过检查{{
              ai.run.output?.requested
                ? "，目标 " + ai.run.output.requested + " 道"
                : ""
            }}
          </p>
          <p v-if="ai.run.error" class="ai-error">{{ ai.run.error }}</p>
        </div>
        <button v-if="ai.active" class="button" @click="ai.cancel">停止</button>
        <button
          v-else-if="remaining && ai.run.output?.requested"
          class="button"
          :disabled="ai.sending"
          @click="supplement"
        >
          补足 {{ remaining }} 道
        </button>
      </section>
      <details
        v-if="ai.run?.kind === 'generate' && ai.run.output?.invalid?.length"
        class="generation-history"
      >
        <summary>{{ ai.run.output.invalid.length }} 道题未通过格式检查</summary>
        <p v-for="item in ai.run.output.invalid" :key="item.index">
          第 {{ item.index }} 题：{{ item.issues.join("；") }}
        </p>
      </details>
      <div class="generation-result-heading">
        <h2>{{ tab === "mine" ? "我的题库" : "候选练习" }}</h2>
        <span class="muted small">{{ visible.length }} 道</span>
      </div>
      <p v-if="!visible.length && !ai.active" class="muted generation-empty">
        {{
          tab === "mine"
            ? "保存生成题后，可以在这里继续练习。"
            : "选择范围，生成第一组练习。"
        }}
      </p>
      <article
        v-for="item in visible"
        :key="item.id"
        :data-question-id="item.id"
        class="panel generated-question"
      >
        <header>
          <span class="generated-type">{{
            item.question.kind === "oral"
              ? "口述"
              : item.question.kind === "choice"
                ? "选择"
                : "判断"
          }}</span><span class="muted small"
            >{{ item.question.angle }} ·
            {{ item.question.knowledgePoints.join("、") }}</span
          ><span class="generated-label">{{
            item.review === "approved" ? "已审核" : "AI 生成 · 待复核"
          }}</span>
        </header>
        <h3>{{ item.question.prompt }}</h3>
        <ol v-if="item.question.choices" class="generated-choices">
          <li v-for="choice in item.question.choices" :key="choice">
            {{ choice }}
          </li>
        </ol>
        <p v-if="item.checks.length" class="ai-error">
          {{ item.checks.join("；") }}
        </p>
        <div class="generated-actions">
          <button
            v-if="item.checks.some((s) => s.startsWith('内容复核未完成'))"
            class="button button-small"
            :disabled="ai.active"
            @click="ai.check(item)"
          >
            重新复核
          </button>
          <button
            class="ai-text-button"
            @click="expanded = expanded === item.id ? '' : item.id"
          >
            {{ expanded === item.id ? "收起解析" : "查看解析" }}</button><button
            v-if="!item.saved"
            class="button button-small"
            :disabled="!!item.checks.length"
            @click="ai.save(item.id)"
          >
            保存到我的题库</button
          ><RouterLink
            v-if="item.saved && questionById.has(item.id)"
            class="button button-primary button-small"
            :to="{ path: '/practice', query: { question: item.id } }"
            >开始练习</RouterLink
          ><RouterLink
            v-if="item.saved"
            class="button button-small"
            :to="{ path: '/ai', query: { question: item.id } }"
            >问 AI</RouterLink
          >
        </div>
        <div v-if="expanded === item.id" class="generated-answer">
          <AiMarkdown :text="item.question.explanation" />
          <h4>回答要点</h4>
          <ul>
            <li v-for="point in item.question.rubric.required" :key="point">
              {{ point }}
            </li>
          </ul>
        </div>
      </article>
      <details v-if="ai.tasks.length" class="generation-history">
        <summary>生成任务记录</summary>
        <button
          v-for="task in ai.tasks"
          :key="task.id"
          @click="selectTask(task)"
        >
          <span>{{
            task.created_at.slice(0, 16).replace("T", " ")
          }}</span><span>{{
            task.status === "succeeded"
              ? "已完成"
              : task.status === "running"
                ? "进行中"
                : task.status === "queued"
                  ? "等待中"
                  : "查看结果"
          }}</span>
        </button>
      </details></template
    >
  </div>
</template>
<style scoped>
.generation-page {
  max-width: 1000px;
  margin: auto;
}
.generation-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.875rem;
  margin-bottom: 24px;
}
.generation-tabs {
  display: flex;
  gap: 6px;
  background: #ecf1e9;
  border-radius: 9px;
  padding: 4px;
}
.generation-tabs button {
  border: 0;
  border-radius: 6px;
  background: none;
  padding: 7px 12px;
  font-size: 0.875rem;
  color: #748068;
}
.generation-tabs button.selected {
  background: white;
  color: var(--primary);
  box-shadow: 0 1px 4px #0001;
}
.generation-form {
  padding: 28px;
  margin-top: 24px;
}
.generation-form label {
  font-size: 0.875rem;
  font-weight: 550;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.generation-form textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fcfdfb;
  padding: 14px;
  resize: vertical;
  line-height: 1.8;
  font-size: 1rem;
}
.generation-options {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin: 22px 0;
}
.generation-options label {
  min-width: 100px;
}
.generation-options select {
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 28px 8px 12px;
  background: white;
}
.generation-options > .button {
  margin-left: auto;
}
.generation-topic-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.generation-topic-chips button {
  border: 0;
  background: #f0f4eb;
  color: #6a7c5e;
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 0.75rem;
}
.generation-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  margin-top: 20px;
}
.generation-result-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 30px 0 16px;
}
.generated-question {
  padding: 26px;
  margin-bottom: 14px;
}
.generated-question > header {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.generated-type {
  font-size: 0.75rem;
  color: var(--primary);
  background: #edf3e7;
  padding: 3px 7px;
  border-radius: 5px;
}
.generated-label {
  font-size: 0.75rem;
  color: #8d8060;
  margin-left: auto;
}
.generated-question h3 {
  font-size: 1.1rem;
  line-height: 1.8;
  margin: 16px 0;
}
.generated-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.generated-actions > .ai-text-button {
  margin-right: auto;
}
.generated-choices {
  line-height: 1.8;
  padding-left: 22px;
  color: #6c7d62;
}
.generated-answer {
  border-top: 1px solid var(--border);
  padding-top: 20px;
  margin-top: 20px;
}
.generated-answer h4 {
  margin-top: 20px;
}
.generated-answer li {
  font-size: 0.9375rem;
  margin-top: 6px;
}
.generation-empty {
  text-align: center;
  padding: 40px 20px;
}
.generation-empty .button {
  margin-top: 20px;
}
.generation-history {
  margin-top: 30px;
  color: var(--muted);
  font-size: 0.875rem;
}
.generation-history summary {
  cursor: pointer;
}
.generation-history > button {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: none;
  padding: 14px 0;
  font-size: 0.875rem;
}
@media (max-width: 700px) {
  .generation-form {
    padding: 20px;
  }
  .generation-options {
    flex-wrap: wrap;
    gap: 12px;
  }
  .generation-options label {
    min-width: 0;
    flex: 1;
  }
  .generation-options > .button {
    width: 100%;
    margin-top: 5px;
  }
  .generated-question {
    padding: 20px;
  }
  .generated-label {
    margin-left: 0;
  }
  .generation-page > .page-heading {
    align-items: flex-start;
    gap: 18px;
    flex-direction: column;
  }
  .generation-page h1 {
    font-size: 1.6rem;
  }
}
</style>
