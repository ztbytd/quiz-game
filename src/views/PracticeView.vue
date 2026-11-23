<script setup lang="ts">
import {computed, nextTick, ref, toRaw, watch} from 'vue';
import {onBeforeRouteLeave, useRoute, useRouter} from 'vue-router';
import {bank, questionById, chainById} from '../data/content';
import {useLearningStore} from '../stores/learning';
import type {Grade, SessionAnswer, StudyQuestion, StudySession} from '../domain/types';
import {answerLabel, createSession, isCorrect, optionOrder} from '../domain/session';
import {labs} from '../data/labs';
import AnswerContent from '../components/AnswerContent.vue';
import CodeLab from '../components/CodeLab.vue';
import AppIcon from '../components/AppIcon.vue';

const route = useRoute(),
  router = useRouter(),
  store = useLearningStore();
const session = ref<StudySession | null>(null);
const loaded = ref(false),
  missing = ref(false),
  noteOpen = ref(false),
  resumePrompt = ref(false),
  completionNotice = ref('');
const heading = ref<HTMLElement | null>(null);
const answerPanel = ref<InstanceType<typeof AnswerContent> | null>(null);
const current = computed(() =>
  session.value ? questionById.get(session.value.questionIds[session.value.index]!) : undefined,
);
const answer = computed<SessionAnswer | undefined>(() =>
  current.value ? session.value?.answers[current.value.id] : undefined,
);
const completed = computed(() => !!session.value?.completedAt);
const mock = computed(() => session.value?.mode === 'mock');
const questionCount = computed(() => session.value?.questionIds.length || 0);
const answeredCount = computed(
  () => Object.values(session.value?.answers || {}).filter((item) => item.revealed).length,
);
const progress = computed(() =>
  questionCount.value ? (answeredCount.value / questionCount.value) * 100 : 0,
);
const record = computed(() => (current.value ? store.getRecord(current.value.id) : undefined));
const options = computed(() =>
  current.value && session.value
    ? optionOrder(current.value, session.value.id, session.value.optionOrders)
    : [],
);
const hasResponse = computed(
  () =>
    !!answer.value &&
    (current.value?.kind === 'oral' || mock.value
      ? !!answer.value.text.trim()
      : answer.value.pick !== undefined),
);
const canContinue = computed(
  () => !!answer.value?.revealed && (current.value?.kind !== 'oral' || !!answer.value.grade),
);
const labId = computed(() =>
  current.value?.chainId && labs[current.value.chainId] ? current.value.chainId : '',
);
const context = computed(() => {
  if (!current.value?.chainId || !current.value.stepIndex) return [];
  const chain = chainById.get(current.value.chainId);
  return (
    chain?.questionIds
      .slice(0, current.value.stepIndex)
      .map((id) => questionById.get(id)?.prompt)
      .filter(Boolean) || []
  );
});
const summaryQuestions = computed(
  () =>
    session.value?.questionIds
      .map((id) => questionById.get(id))
      .filter((item): item is StudyQuestion => !!item) || [],
);
const summaryCorrect = computed(
  () =>
    summaryQuestions.value.filter(
      (q) => q.kind !== 'oral' && isCorrect(q, session.value?.answers[q.id]?.pick),
    ).length,
);
const summaryChoiceCount = computed(
  () => summaryQuestions.value.filter((q) => q.kind !== 'oral').length,
);
const summaryMinutes = computed(() => {
  if (!session.value) return 0;
  return Math.max(
    1,
    Math.round(
      (Date.parse(session.value.completedAt || new Date().toISOString()) -
        Date.parse(session.value.startedAt)) /
        60000,
    ),
  );
});

function persist() {
  if (session.value) store.saveSession(structuredClone(toRaw(session.value)));
}
function ensureAnswer() {
  if (!session.value || !current.value) return;
  if (!session.value.answers[current.value.id])
    session.value.answers[current.value.id] = {
      text: store.getRecord(current.value.id).draft || '',
      revealed: false,
    };
}
function queryValue(key: string) {
  const value = route.query[key];
  return typeof value === 'string' ? value : undefined;
}
function build() {
  missing.value = false;
  noteOpen.value = false;
  const previous = store.progress.session;
  if (queryValue('resume') === '1' && previous) {
    session.value = structuredClone(toRaw(previous));
  } else {
    session.value = createSession(
      bank,
      {
        mode: queryValue('mode'),
        topic: queryValue('topic'),
        section: queryValue('section'),
        chain: queryValue('chain'),
        question: queryValue('question'),
        filter: queryValue('filter'),
        dailyGoal: store.progress.dailyGoal,
      },
      store.progress.records,
    );
  }
  missing.value = !session.value;
  if (session.value) {
    session.value.questionIds = session.value.questionIds.filter((id) => questionById.has(id));
    session.value.index = Math.min(
      session.value.index,
      Math.max(0, session.value.questionIds.length - 1),
    );
    if (!session.value.questionIds.length) {
      session.value = null;
      missing.value = true;
      return;
    }
    ensureAnswer();
    persist();
  }
}
watch(
  () => route.fullPath,
  async () => {
    if (route.path !== '/practice') return;
    loaded.value = false;
    await store.init();
    const previous = store.progress.session;
    // An unfinished session is resumed when revisiting exactly the same queue request.
    const requestedQuestion = queryValue('question');
    const requestedTopic = bank.topics.find((topic) => topic.id === queryValue('topic'));
    const requestedIds = queryValue('section')
      ? requestedTopic?.sections.find((section) => section.id === queryValue('section'))
          ?.questionIds
      : requestedTopic?.questionIds;
    const matching =
      previous &&
      !previous.completedAt &&
      !requestedQuestion &&
      ((queryValue('topic') &&
        requestedIds?.length === previous.questionIds.length &&
        previous.questionIds.every((id, index) => id === requestedIds?.[index])) ||
        (queryValue('chain') &&
          previous.questionIds.every(
            (id) => questionById.get(id)?.chainId === queryValue('chain'),
          )) ||
        (queryValue('mode') === 'mock' && previous.mode === 'mock') ||
        (queryValue('mode') === 'daily' && previous.title === '今日练习'));
    if (matching && queryValue('resume') !== '1') {
      session.value = structuredClone(toRaw(previous));
      ensureAnswer();
      resumePrompt.value = true;
    } else {
      build();
      resumePrompt.value = false;
    }
    loaded.value = true;
  },
  {immediate: true},
);
watch(
  () => current.value?.id,
  () => {
    ensureAnswer();
    noteOpen.value = false;
  },
);
onBeforeRouteLeave(() => persist());

function pick(value: number | boolean) {
  if (!answer.value || answer.value.revealed) return;
  answer.value.pick = value;
  persist();
}
function draft(event: Event) {
  if (!answer.value || !current.value) return;
  answer.value.text = (event.target as HTMLTextAreaElement).value;
  store.setDraft(current.value.id, answer.value.text);
  persist();
}
async function reveal() {
  if (!current.value || !answer.value || !hasResponse.value || mock.value) return;
  answer.value.revealed = true;
  if (current.value.kind !== 'oral') {
    const correct = isCorrect(current.value, answer.value.pick);
    answer.value.grade = correct ? 'good' : 'again';
    store.grade(current.value.id, answer.value.grade, correct);
  }
  persist();
  await nextTick();
  answerPanel.value?.focus();
}
function grade(value: Grade) {
  if (!current.value || !answer.value || answer.value.grade) return;
  answer.value.grade = value;
  store.grade(current.value.id, value);
  persist();
}
async function focusQuestion() {
  await nextTick();
  window.scrollTo({top: 0, behavior: 'instant'});
  heading.value?.focus({preventScroll: true});
}
async function jump(index: number) {
  if (!session.value || mock.value) return;
  persist();
  session.value.index = index;
  ensureAnswer();
  persist();
  await focusQuestion();
}
async function next() {
  if (!session.value || !current.value || !answer.value) return;
  if (mock.value) {
    if (!hasResponse.value) return;
    answer.value.revealed = true;
  } else if (!canContinue.value) return;
  if (session.value.index === session.value.questionIds.length - 1) {
    const unfinished = session.value.questionIds.findIndex((id) => {
      const item = session.value?.answers[id];
      return (
        !item?.revealed || (!mock.value && questionById.get(id)?.kind === 'oral' && !item.grade)
      );
    });
    if (unfinished !== -1) {
      completionNotice.value = '还有未完成的题目，已回到第一道待答题。';
      session.value.index = unfinished;
      ensureAnswer();
      persist();
      await focusQuestion();
      return;
    }
    session.value.completedAt = new Date().toISOString();
    persist();
    await focusQuestion();
    return;
  }
  session.value.index++;
  ensureAnswer();
  persist();
  await focusQuestion();
}
function leave() {
  persist();
  router.push('/');
}
function newRound() {
  resumePrompt.value = false;
  build();
  focusQuestion();
}
function summaryGrade(id: string, value: Grade) {
  if (!session.value) return;
  const item = session.value.answers[id];
  if (!item || item.grade) return;
  item.grade = value;
  store.grade(id, value);
  persist();
}
function sourceLabel(question: StudyQuestion) {
  return question.kind === 'oral' ? '口述题' : question.kind === 'boolean' ? '判断题' : '单选题';
}
</script>

<template>
  <div v-if="!loaded" class="practice-loading panel" role="status">正在准备练习…</div>
  <div v-else-if="missing || !session" class="practice-empty panel">
    <AppIcon name="check-circle" :size="40" />
    <h1>这里暂时没有待练习的题</h1>
    <p>可以先从题库选择一个方向，或完成一轮练习后回来复习。</p>
    <RouterLink to="/library" class="button button-primary">浏览题库</RouterLink>
  </div>
  <div v-else-if="completed" class="practice-page">
    <div class="practice-top">
      <button class="back-link" @click="leave"><AppIcon name="back" :size="16" />回到学习台</button
      ><span class="muted">练习复盘</span>
    </div>
    <section class="summary-hero panel">
      <div class="summary-mark"><AppIcon name="check" :size="30" /></div>
      <h1 ref="heading" tabindex="-1">练习完成</h1>
      <p>{{ session.title }} · {{ questionCount }} 道题 · {{ summaryMinutes }} 分钟</p>
      <div class="summary-stats">
        <div>
          <strong>{{ answeredCount }}</strong><span>已作答</span>
        </div>
        <div v-if="summaryChoiceCount && !mock">
          <strong
            >{{ summaryCorrect }}<small>/{{ summaryChoiceCount }}</small></strong
          ><span>客观题答对</span>
        </div>
        <div>
          <strong>{{
            Object.values(session.answers).filter((a) => a.grade === 'again').length
          }}</strong><span>需要再练</span>
        </div>
      </div>
      <p v-if="mock" class="summary-note">
        对照参考答案自评。这里记录的是你的练习结果，不是 AI 自动评分。
      </p>
      <div class="summary-actions">
        <RouterLink to="/review" class="button button-primary">安排复习</RouterLink
        ><RouterLink to="/library" class="button button-quiet">继续探索题库</RouterLink>
      </div>
    </section>
    <div class="section-heading">
      <h2>逐题回看</h2>
    </div>
    <details
      v-for="(question, index) in summaryQuestions"
      :key="question.id"
      class="recap-item panel"
    >
      <summary>
        <span class="recap-number">{{ String(index + 1).padStart(2, '0') }}</span><span>{{
          question.prompt
        }}</span
        ><span class="recap-status">{{
          session.answers[question.id]?.grade === 'again'
            ? '需复习'
            : session.answers[question.id]?.grade
              ? '已记录'
              : '待自评'
        }}</span>
      </summary>
      <div class="recap-body">
        <h3>我的回答</h3>
        <p class="my-response">
          {{
            mock || question.kind === 'oral'
              ? session.answers[question.id]?.text || '未填写'
              : answerLabel(question, session.answers[question.id]?.pick)
          }}
        </p>
        <AnswerContent :question="question" />
        <div class="self-grade">
          <span>{{
            session.answers[question.id]?.grade
              ? '自评已记录，重新练习可更新掌握情况'
              : '这题讲清楚了吗？'
          }}</span><button
            class="button button-quiet"
            :disabled="!!session.answers[question.id]?.grade"
            :class="{
              selected: session.answers[question.id]?.grade === 'again',
            }"
            @click="summaryGrade(question.id, 'again')"
          >
            还需练习</button
          ><button
            class="button button-primary"
            :disabled="!!session.answers[question.id]?.grade"
            :class="{
              selected: session.answers[question.id]?.grade === 'easy',
            }"
            @click="summaryGrade(question.id, 'easy')"
          >
            能独立讲清
          </button>
        </div>
      </div>
    </details>
  </div>
  <div v-else-if="current && answer" class="practice-page">
    <div class="practice-top">
      <button class="back-link" @click="leave"><AppIcon name="back" :size="16" />保存并退出</button
      ><span class="muted">{{ mock ? '模拟面试' : '专注练习' }}</span
      ><span class="saved-label"><AppIcon name="check" :size="14" />进度自动保存</span>
    </div>
    <div v-if="resumePrompt" class="resume-banner">
      <span>已接上上次的练习进度。</span><button @click="newRound">重新开始这一轮</button
      ><button aria-label="关闭继续提示" @click="resumePrompt = false">
        <AppIcon name="close" :size="14" />
      </button>
    </div>
    <p v-if="completionNotice" class="resume-banner" role="status">
      {{ completionNotice }}
    </p>
    <div class="practice-grid">
      <main class="question-panel panel">
        <div class="question-meta">
          <span class="tag">{{ sourceLabel(current) }}</span><span>{{ session.title }}</span
          ><span class="question-counter">{{ session.index + 1 }} / {{ questionCount }}</span>
        </div>
        <div
          class="practice-progress"
          role="progressbar"
          :aria-valuenow="answeredCount"
          :aria-valuemax="questionCount"
          aria-valuemin="0"
          aria-label="本轮作答进度"
        >
          <span :style="{width: progress + '%'}" />
        </div>
        <h1 ref="heading" tabindex="-1" class="question-prompt">
          {{ current.prompt }}
        </h1>
        <details v-if="context.length" class="question-context">
          <summary>查看前置问题</summary>
          <p v-for="(text, index) in context" :key="index">{{ text }}</p>
        </details>
        <p v-if="mock" class="mock-notice">
          <AppIcon name="clock" :size="17" />先独立作答，结束后统一复盘答案。
        </p>
        <div
          v-if="current.kind !== 'oral' && !mock"
          class="choices"
          :class="{binary: current.kind === 'boolean'}"
        >
          <button
            v-for="(value, index) in options"
            :key="String(value)"
            class="choice"
            :class="{
              picked: answer.pick === value,
              right: answer.revealed && value === current.correctAnswer,
              wrong: answer.revealed && answer.pick === value && value !== current.correctAnswer,
            }"
            :disabled="answer.revealed"
            :aria-pressed="answer.pick === value"
            @click="pick(value)"
          >
            <span class="choice-letter">{{
              current.kind === 'boolean' ? (value ? '✓' : '×') : String.fromCharCode(65 + index)
            }}</span><span>{{ answerLabel(current, value) }}</span
            ><AppIcon
              v-if="answer.revealed && value === current.correctAnswer"
              name="check-circle"
              :size="18"
            />
          </button>
        </div>
        <div v-else class="response-editor">
          <label for="response">先写下你的回答</label
          ><textarea
            id="response"
            :value="answer.text"
            :readonly="answer.revealed"
            placeholder="按结论、原理、例子和边界展开。简短记录也可以。"
            @input="draft"
          />
        </div>
        <CodeLab v-if="labId && !mock" :key="labId" :lab-id="labId" />
        <div v-if="!answer.revealed" class="answer-actions">
          <button
            class="button button-primary reveal-button"
            :disabled="!hasResponse"
            @click="mock ? next() : reveal()"
          >
            {{
              mock
                ? session.index === questionCount - 1
                  ? '结束并复盘'
                  : '记录并继续'
                : '提交并查看解析'
            }}</button><span v-if="!hasResponse || mock" class="muted">{{
            !hasResponse ? '完成作答后查看参考答案' : '本轮答案将在结束后显示'
          }}</span>
        </div>
        <template v-if="answer.revealed && !mock">
          <div
            v-if="current.kind !== 'oral'"
            class="answer-feedback"
            :class="{incorrect: !isCorrect(current, answer.pick)}"
          >
            <AppIcon :name="isCorrect(current, answer.pick) ? 'check-circle' : 'bulb'" :size="21" />
            <div>
              <strong>{{ isCorrect(current, answer.pick) ? '回答正确' : '已加入待复习' }}</strong>
              <p v-if="!isCorrect(current, answer.pick)">
                正确答案：{{ answerLabel(current, current.correctAnswer) }}
              </p>
            </div>
          </div>
          <AnswerContent ref="answerPanel" :question="current" />
          <div v-if="current.kind === 'oral'" class="self-grade">
            <span>{{ answer.grade ? '自评已记录' : '对照参考答案自评' }}</span><button
              class="button button-quiet"
              :disabled="!!answer.grade"
              :class="{selected: answer.grade === 'again'}"
              @click="grade('again')"
            >
              还需练习</button
            ><button
              class="button button-quiet"
              :disabled="!!answer.grade"
              :class="{selected: answer.grade === 'good'}"
              @click="grade('good')"
            >
              基本掌握</button
            ><button
              class="button button-primary"
              :disabled="!!answer.grade"
              :class="{selected: answer.grade === 'easy'}"
              @click="grade('easy')"
            >
              能独立讲清
            </button>
          </div>
          <div v-if="current.chainId && current.id.startsWith('quiz:')" class="followup-link">
            <AppIcon name="bulb" :size="18" /><RouterLink
              :to="{
                path: '/practice',
                query: {mode: 'oral', chain: current.chainId},
              }"
              >继续练：{{ chainById.get(current.chainId)?.title }}</RouterLink
            >
          </div>
        </template>
        <div class="question-tools">
          <button
            class="tool-action"
            :class="{active: record?.bookmarked}"
            @click="store.toggleBookmark(current.id)"
          >
            <AppIcon name="bookmark" :size="17" />{{
              record?.bookmarked ? '已收藏' : '收藏这题'
            }}</button
          ><button class="tool-action" :class="{active: noteOpen}" @click="noteOpen = !noteOpen">
            <AppIcon name="document" :size="17" />我的笔记{{ record?.note ? ' · 已记录' : '' }}
          </button>
        </div>
        <div v-if="noteOpen" class="note-editor">
          <label for="practice-note">记下容易遗漏的点</label
          ><textarea
            id="practice-note"
            :value="record?.note"
            placeholder="例如：先说明前提，再推导执行顺序。"
            @input="store.setNote(current.id, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
        <div v-if="!mock" class="question-navigation">
          <button
            class="button button-quiet"
            :disabled="session.index === 0"
            @click="jump(session.index - 1)"
          >
            <AppIcon name="arrow-left" :size="16" />上一题</button
          ><button class="button button-primary" :disabled="!canContinue" @click="next">
            {{ session.index === questionCount - 1 ? '完成并复盘' : '下一题'
            }}<AppIcon v-if="session.index < questionCount - 1" name="arrow-right" :size="16" />
          </button>
        </div>
      </main>
      <aside class="practice-aside">
        <section class="session-outline panel">
          <h2>本轮练习</h2>
          <p class="outline-description">{{ session.title }}</p>
          <div class="outline-count">
            <strong>{{ answeredCount }}</strong><span>/ {{ questionCount }} 已作答</span>
          </div>
          <div v-if="!mock" class="question-dots">
            <button
              v-for="(id, index) in session.questionIds"
              :key="id"
              :class="{
                current: index === session.index,
                done: session.answers[id]?.revealed,
                weak: session.answers[id]?.grade === 'again',
              }"
              :aria-label="'第 ' + (index + 1) + ' 题'"
              :aria-current="index === session.index ? 'step' : undefined"
              @click="jump(index)"
            >
              {{ index + 1 }}
            </button>
          </div>
          <p v-else class="outline-description">模拟面试按顺序作答，避免提前查看后续问题与答案。</p>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.practice-page {
  max-width: 1120px;
  margin: 0 auto;
}
.practice-loading,
.practice-empty {
  padding: 64px 24px;
  text-align: center;
}
.practice-empty h1 {
  font-size: 1.5rem;
  margin-top: 20px;
}
.practice-empty p {
  color: #6b7c71;
  margin: 12px 0 24px;
}
.practice-top {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
  font-size: 0.8125rem;
}
.back-link {
  border: 0;
  background: none;
  color: var(--text, #304439);
  display: inline-flex;
  gap: 8px;
  align-items: center;
  cursor: pointer;
  padding: 4px 0;
  font: inherit;
  font-weight: 600;
}
.saved-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #75857b;
  margin-left: auto;
}
.practice-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 238px;
  gap: 28px;
  align-items: start;
}
.question-panel {
  padding: 32px 36px;
  min-width: 0;
}
.question-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.8125rem;
  color: #77867e;
}
.question-meta > span:nth-child(2) {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.question-counter {
  margin-left: auto;
  white-space: nowrap;
}
.practice-progress {
  height: 3px;
  border-radius: 4px;
  overflow: hidden;
  background: #edf1ed;
  margin: 22px 0 28px;
}
.practice-progress > span {
  height: 100%;
  display: block;
  background: var(--brand, #246e51);
  transition: width 0.2s;
}
.question-prompt {
  font-size: 1.5rem;
  line-height: 1.65;
  letter-spacing: -0.025em;
  margin: 0 0 28px;
  font-weight: 650;
  color: #203c2e;
  outline: none;
}
.question-context {
  background: #f7f9f7;
  padding: 14px 16px;
  border-radius: 8px;
  font-size: 0.875rem;
  margin-bottom: 20px;
}
.question-context summary {
  cursor: pointer;
  color: #526b5d;
}
.question-context p {
  line-height: 1.8;
  margin: 10px 0 0;
  color: #6a7d70;
}
.choices {
  display: grid;
  gap: 12px;
}
.choices.binary {
  grid-template-columns: 1fr 1fr;
}
.choice {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  background: #fff;
  border: 1px solid #dfe6df;
  border-radius: 10px;
  padding: 17px 18px;
  text-align: left;
  color: #3e5146;
  font: inherit;
  font-size: 1rem;
  line-height: 1.7;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.choice > span:nth-child(2) {
  flex: 1;
}
.choice:hover:not(:disabled) {
  border-color: #81ab94;
  background: #fbfdfb;
}
.choice.picked {
  border-color: #397d5f;
  background: #f1f7f2;
}
.choice.right {
  border-color: #83b997;
  background: #eef7ef;
}
.choice.wrong {
  border-color: #dca78a;
  background: #fff7f0;
}
.choice:disabled {
  opacity: 1;
  cursor: default;
}
.choice-letter {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid #dce4de;
  border-radius: 7px;
  font-size: 0.8125rem;
  font-weight: 650;
  margin-top: 1px;
}
.choice.picked .choice-letter {
  background: #276a4e;
  border-color: #276a4e;
  color: white;
}
.choice.right .choice-letter {
  background: #276a4e;
  color: #fff;
}
.choice.wrong .choice-letter {
  background: #ac6844;
  border-color: #ac6844;
  color: white;
}
.response-editor label,
.note-editor label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 10px;
  color: #52675a;
}
.response-editor textarea,
.note-editor textarea {
  width: 100%;
  border: 1px solid #dce4dd;
  border-radius: 10px;
  background: #fcfdfb;
  padding: 17px;
  resize: vertical;
  font: inherit;
  line-height: 1.85;
  color: #344c3d;
  min-height: 190px;
  outline: none;
}
.response-editor textarea:focus,
.note-editor textarea:focus {
  border-color: #5b9675;
  box-shadow: 0 0 0 3px #e9f2eb;
}
.response-editor > span {
  display: block;
  font-size: 0.75rem;
  color: #8a958e;
  margin-top: 8px;
}
.answer-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding-top: 26px;
}
.answer-actions .muted {
  font-size: 0.75rem;
}
.answer-feedback {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  border-top: 1px solid #e3e9e3;
  padding-top: 26px;
  margin-top: 28px;
  color: #30724e;
}
.answer-feedback.incorrect {
  color: #a46838;
}
.answer-feedback p {
  font-size: 0.875rem;
  margin: 4px 0 0;
  line-height: 1.8;
}
.answer-feedback strong {
  font-size: 1rem;
}
.question-tools {
  display: flex;
  gap: 24px;
  padding-top: 24px;
  margin-top: 24px;
  border-top: 1px solid #e5ebe5;
}
.tool-action {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  font: inherit;
  font-size: 0.8125rem;
  color: #7a8980;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.tool-action.active {
  color: #246d50;
}
.note-editor {
  margin-top: 20px;
}
.note-editor textarea {
  min-height: 110px;
  font-size: 0.875rem;
}
.question-navigation {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 28px;
}
.session-outline {
  padding: 25px;
}
.session-outline h2 {
  font-size: 1.0625rem;
  margin: 8px 0;
}
.outline-description {
  font-size: 0.8125rem;
  line-height: 1.8;
  color: #7b8a80;
}
.outline-count {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin: 20px 0;
}
.outline-count strong {
  font-size: 2rem;
  line-height: 1;
  font-weight: 600;
  color: #244d37;
}
.outline-count span {
  font-size: 0.75rem;
  color: #819087;
}
.question-dots {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 7px;
}
.question-dots button {
  aspect-ratio: 1;
  border: 1px solid #e5ebe5;
  border-radius: 7px;
  background: #f8faf8;
  color: #839087;
  font-size: 0.75rem;
  cursor: pointer;
}
.question-dots button.done {
  background: #e8f1e9;
  color: #34714d;
  border-color: #dce9de;
}
.question-dots button.weak {
  background: #fbf1df;
  color: #8b6b3e;
  border-color: #efe1c5;
}
.question-dots button.current {
  background: #26684d;
  color: white;
  border-color: #26684d;
}
.self-grade {
  padding: 24px 0 0;
  border-top: 1px solid #e5ebe5;
  margin-top: 26px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.self-grade > span {
  width: 100%;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 4px;
}
.self-grade .selected {
  outline: 2px solid #94bca1;
  outline-offset: 2px;
}
.followup-link {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  background: #f5f8f2;
  border-radius: 8px;
  padding: 14px;
  margin-top: 24px;
  color: #41704b;
  font-size: 0.875rem;
  line-height: 1.7;
}
.followup-link a {
  color: inherit;
}
.mock-notice {
  display: flex;
  gap: 8px;
  align-items: center;
  background: #f5f7ed;
  padding: 13px 15px;
  border-radius: 9px;
  color: #69794d;
  font-size: 0.8125rem;
  margin: 0 0 20px;
}
.resume-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #e0e9dc;
  background: #f4f8ef;
  border-radius: 9px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 0.8125rem;
  color: #58704b;
}
.resume-banner button {
  border: 0;
  background: none;
  color: #316443;
  cursor: pointer;
  font: inherit;
}
.resume-banner button:nth-child(2) {
  margin-left: auto;
  text-decoration: underline;
}
.summary-hero {
  text-align: center;
  padding: 42px 30px;
}
.summary-mark {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #edf4e8;
  color: #46753b;
  margin: 0 auto 22px;
}
.summary-hero h1 {
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.04em;
  margin: 10px 0 12px;
  color: #234630;
  outline: none;
}
.summary-hero > p {
  font-size: 0.875rem;
  color: #7d8c80;
}
.summary-stats {
  display: flex;
  justify-content: center;
  gap: 60px;
  margin: 30px 0;
}
.summary-stats > div {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.summary-stats strong {
  font-size: 2rem;
  color: #294e35;
  font-weight: 600;
}
.summary-stats small {
  font-size: 1rem;
  color: #8d9c8e;
}
.summary-stats span {
  font-size: 0.75rem;
  color: #7b8c7c;
}
.summary-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}
.summary-note {
  max-width: 450px;
  line-height: 1.8;
  margin: 0 auto 25px;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
  margin: 32px 0 16px;
}
.section-heading h2 {
  font-size: 1.125rem;
  margin: 0;
}
.section-heading span {
  font-size: 0.8125rem;
}
.recap-item {
  margin-bottom: 12px;
  overflow: hidden;
}
.recap-item > summary {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 22px;
  cursor: pointer;
  font-size: 0.9375rem;
  line-height: 1.75;
  font-weight: 550;
  list-style: none;
}
.recap-number {
  color: #99a89b;
  font: 0.8125rem/1.9 monospace;
  flex-shrink: 0;
}
.recap-status {
  font-size: 0.75rem;
  color: #798a7b;
  white-space: nowrap;
  margin-left: auto;
}
.recap-body {
  padding: 0 32px 28px;
}
.recap-body > h3 {
  font-size: 0.875rem;
  margin: 0 0 8px;
}
.my-response {
  white-space: pre-line;
  background: #f6f8f5;
  padding: 16px;
  font-size: 1rem;
  line-height: 1.85;
  color: #637364;
  border-radius: 8px;
}
@media (max-width: 1050px) {
  .practice-grid {
    grid-template-columns: minmax(0, 1fr) 200px;
    gap: 20px;
  }
  .question-panel {
    padding: 26px;
  }
  .session-outline {
    padding: 20px;
  }
  .question-dots {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 800px) {
  .practice-grid {
    grid-template-columns: 1fr;
  }
  .practice-aside {
    display: none;
  }
  .practice-top {
    margin-bottom: 16px;
  }
  .question-panel {
    padding: 24px;
  }
  .question-prompt {
    font-size: 1.25rem;
  }
  .summary-stats {
    gap: 40px;
  }
}
@media (max-width: 520px) {
  .question-panel {
    padding: 20px 17px;
  }
  .practice-top {
    gap: 12px;
    font-size: 0.75rem;
  }
  .saved-label {
    font-size: 0.6875rem;
  }
  .question-meta {
    font-size: 0.75rem;
    gap: 7px;
  }
  .question-prompt {
    font-size: 1.1875rem;
    margin-bottom: 24px;
  }
  .choice {
    padding: 14px 12px;
    gap: 10px;
    font-size: 1rem;
  }
  .choices.binary {
    gap: 10px;
  }
  .choice-letter {
    width: 23px;
    height: 23px;
  }
  .answer-actions {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }
  .reveal-button {
    width: 100%;
  }
  .summary-hero {
    padding: 30px 20px;
  }
  .summary-hero h1 {
    font-size: 1.35rem;
  }
  .summary-stats {
    gap: 30px;
  }
  .recap-item > summary {
    padding: 18px 15px;
    gap: 10px;
  }
  .recap-status {
    display: none;
  }
  .recap-body {
    padding: 0 16px 22px;
  }
  .resume-banner {
    flex-wrap: wrap;
  }
  .self-grade .button {
    flex: 1;
    padding-left: 12px;
    padding-right: 12px;
  }
  .question-navigation .button {
    padding-left: 13px;
    padding-right: 13px;
  }
  .question-tools {
    gap: 18px;
  }
}
</style>
