<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {useRoute, useRouter, RouterLink} from 'vue-router';
import {bank, quizQuestions, oralQuestions, questionById, chainById, topicById} from '@/data/content';
import {useLearningStore} from '@/stores/learning';
import type {StudyQuestion, Topic} from '@/domain/types';
import AppIcon from '@/components/AppIcon.vue';
import TopicCover from '@/components/TopicCover.vue';

const route = useRoute(),
  router = useRouter(),
  learning = useLearningStore();
const search = ref(String(route.query.q || '')),
  page = ref(1);
const tab = computed(() => (route.query.tab === 'oral' ? 'oral' : 'quiz'));
const category = computed(() => String(route.query.category || 'all'));
const query = computed(() => search.value.trim().toLocaleLowerCase());
const categories = computed(() =>
  tab.value === 'quiz'
    ? [...new Set(bank.topics.map((t) => t.category))].map((c) => ({id: c, title: c}))
    : bank.groups.map((g) => ({id: g.id, title: g.title})),
);
function updateQuery(values: Record<string, string>) {
  const next: Record<string, unknown> = {...route.query, ...values};
  for (const key of Object.keys(next)) if (next[key] === '' || next[key] === 'all') delete next[key];
  router.replace({path: '/library', query: next as Record<string, string>});
}
watch(
  () => route.query.q,
  (q) => {
    search.value = String(q || '');
  },
);
watch([search, tab, category], () => {
  page.value = 1;
});
const topics = computed(() =>
  bank.topics.filter((t) => category.value === 'all' || t.category === category.value),
);
const groups = computed(() => bank.groups.filter((g) => category.value === 'all' || g.id === category.value));
const results = computed(() => {
  const candidates = tab.value === 'quiz' ? quizQuestions : oralQuestions;
  return candidates.filter((q) => {
    const groupId = q.chainId ? chainById.get(q.chainId)?.groupId : undefined;
    const belongs = tab.value === 'quiz' ? topicById.get(q.topicId || '')?.category : groupId;
    if (category.value !== 'all' && belongs !== category.value) return false;
    return [q.prompt, q.explanation, q.label, q.detail?.principle, q.detail?.example, q.detail?.code]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.value);
  });
});
const visibleResults = computed(() => results.value.slice((page.value - 1) * 20, page.value * 20));
const maxPage = computed(() => Math.max(1, Math.ceil(results.value.length / 20)));
function mastered(ids: string[]) {
  return ids.filter((id) => learning.getRecord(id).status === 'mastered').length;
}
function topicProgress(topic: Topic) {
  return Math.round((mastered(topic.questionIds) / topic.questionIds.length) * 100);
}
function questionLink(q: StudyQuestion) {
  return {
    path: '/practice',
    query: q.id.startsWith('oral:')
      ? {mode: 'oral', chain: q.chainId, question: q.id}
      : {mode: 'quiz', topic: q.topicId, question: q.id},
  };
}
function questionContext(q: StudyQuestion) {
  return q.id.startsWith('oral:')
    ? chainById.get(q.chainId || '')?.title
    : topicById.get(q.topicId || '')?.title;
}
const difficultyLabels: Record<string, string> = {easy: '基础', medium: '进阶', hard: '深入', boss: '综合'};
function changePage(next: number) {
  page.value = next;
  document.querySelector('.library-results')?.scrollIntoView({block: 'start', behavior: 'smooth'});
}
</script>

<template>
  <div class="library-page">
    <header class="page-heading library-heading">
      <div>
        <p class="eyebrow">KNOWLEDGE LIBRARY</p>
        <h1>把知识，练成自己的表达。</h1>
        <p class="muted">从基础原理到项目现场，找到你今天想讲清的问题。</p>
      </div>
      <div class="library-count">
        <strong>{{ quizQuestions.length }}</strong
        ><span>道基础题</span><i></i><strong>{{ oralQuestions.length }}</strong
        ><span>问深入追问</span>
      </div>
    </header>

    <div class="library-controls panel">
      <form class="library-search" role="search" @submit.prevent="updateQuery({q: search})">
        <AppIcon name="search" :size="20" />
        <input
          v-model="search"
          type="search"
          aria-label="搜索题目和解析"
          placeholder="搜索问题、知识点或项目场景…"
          @input="updateQuery({q: search})"
        />
        <span class="search-count" v-if="query">{{ results.length }} 条</span>
      </form>
      <div class="library-filter-row">
        <div class="library-tabs" role="tablist" aria-label="题库类型">
          <button
            :aria-selected="tab === 'quiz'"
            role="tab"
            :class="{active: tab === 'quiz'}"
            @click="updateQuery({tab: 'quiz', category: 'all'})"
          >
            基础闯关 <span>{{ bank.topics.length }}</span>
          </button>
          <button
            :aria-selected="tab === 'oral'"
            role="tab"
            :class="{active: tab === 'oral'}"
            @click="updateQuery({tab: 'oral', category: 'all'})"
          >
            专项追问 <span>{{ bank.chains.length }}</span>
          </button>
        </div>
        <label class="category-select"
          ><AppIcon name="filter" :size="16" /><span class="sr-only">筛选分类</span
          ><select
            :value="category"
            aria-label="筛选分类"
            @change="updateQuery({category: ($event.target as HTMLSelectElement).value})"
          >
            <option value="all">全部方向</option>
            <option v-for="item in categories" :key="item.id" :value="item.id">{{ item.title }}</option>
          </select></label
        >
      </div>
    </div>

    <section v-if="query" class="library-results" aria-live="polite">
      <div class="section-heading">
        <h2>搜索结果</h2>
        <span class="muted">{{ results.length }} 个匹配问题</span>
      </div>
      <div v-if="!results.length" class="empty-state panel">
        <AppIcon name="search" :size="32" />
        <h2>暂时没有找到</h2>
        <p>试试更短的关键词，或切换题库类型和方向。</p>
        <button
          class="button button-quiet"
          @click="
            search = '';
            updateQuery({q: '', category: 'all'});
          "
        >
          清除筛选
        </button>
      </div>
      <div v-else class="question-results panel">
        <RouterLink v-for="q in visibleResults" :key="q.id" :to="questionLink(q)" class="question-result">
          <span class="result-kind">{{
            q.kind === 'choice' ? '选择' : q.kind === 'boolean' ? '判断' : '口述'
          }}</span>
          <div>
            <p class="result-context">{{ questionContext(q) }}</p>
            <h3>{{ q.prompt }}</h3>
            <p class="result-preview">{{ q.explanation.split('↵')[0] }}</p>
          </div>
          <AppIcon name="chevron-right" :size="18" />
        </RouterLink>
      </div>
      <nav v-if="maxPage > 1" class="pagination" aria-label="搜索结果分页">
        <button class="button button-quiet" :disabled="page === 1" @click="changePage(page - 1)">
          上一页</button
        ><span>{{ page }} / {{ maxPage }}</span
        ><button class="button button-quiet" :disabled="page === maxPage" @click="changePage(page + 1)">
          下一页
        </button>
      </nav>
    </section>

    <section v-else-if="tab === 'quiz'" aria-label="基础题库">
      <div class="section-heading">
        <h2>{{ category === 'all' ? '所有专题' : category }}</h2>
        <span class="muted">{{ topics.length }} 个专题 · 自由选择练习顺序</span>
      </div>
      <div class="topic-grid">
        <RouterLink
          v-for="topic in topics"
          :key="topic.id"
          :to="{path: '/practice', query: {mode: 'quiz', topic: topic.id}}"
          class="topic-tile"
        >
          <TopicCover
            :title="topic.title"
            :subtitle="topic.category"
            :tone="topic.color"
            :symbol="topic.symbol"
          />
          <div class="topic-info">
            <div class="topic-title-row">
              <h3>{{ topic.title }}</h3>
              <span class="difficulty">{{ difficultyLabels[topic.difficulty] || '专题' }}</span>
            </div>
            <p>{{ topic.description }}</p>
            <div class="topic-progress">
              <span>{{ topic.questionIds.length }} 道题</span
              ><span>{{
                mastered(topic.questionIds) ? `已掌握 ${mastered(topic.questionIds)} 题` : '待开启'
              }}</span>
            </div>
            <div class="topic-progress-line"><span :style="{width: topicProgress(topic) + '%'}"></span></div>
          </div>
        </RouterLink>
      </div>
    </section>

    <div v-else class="oral-groups">
      <section v-for="group in groups" :key="group.id" class="oral-group">
        <div class="section-heading">
          <h2>{{ group.title }}</h2>
          <span class="muted">{{ group.chainIds.length }} 组追问</span>
        </div>
        <div class="chain-grid">
          <template v-for="id in group.chainIds" :key="id"
            ><RouterLink
              v-if="chainById.get(id)"
              :to="{path: '/practice', query: {mode: 'oral', chain: id}}"
              class="chain-tile panel"
              ><div class="chain-label">
                <span class="tag">{{ chainById.get(id)!.questionIds.length }} 层追问</span
                ><AppIcon
                  name="check"
                  v-if="mastered(chainById.get(id)!.questionIds) === chainById.get(id)!.questionIds.length"
                  :size="18"
                />
              </div>
              <h3>{{ chainById.get(id)!.title }}</h3>
              <p>{{ questionById.get(chainById.get(id)!.questionIds[0])?.prompt }}</p>
              <span class="chain-footer"
                >{{ mastered(chainById.get(id)!.questionIds) }} /
                {{ chainById.get(id)!.questionIds.length }} 已掌握<AppIcon
                  name="chevron-right"
                  :size="17" /></span></RouterLink
          ></template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.library-heading {
  display: block;
}
.library-count {
  display: flex;
  gap: 7px;
  align-items: baseline;
  margin-top: 24px;
  font-size: 14px;
  color: var(--muted, #6c7873);
}
.library-count strong {
  font:
    500 25px/1.2 ui-serif,
    Georgia,
    serif;
  color: var(--text, #20352d);
}
.library-count i {
  height: 15px;
  align-self: center;
  width: 1px;
  background: var(--line, #e2e7e3);
  margin: 0 14px;
}
.library-controls {
  padding: 0 !important;
  margin: 30px 0 32px;
  overflow: hidden;
}
.library-search {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 17px 22px;
  border-bottom: 1px solid var(--line, #e5e9e5);
  color: var(--muted, #6c7873);
}
.library-search input {
  width: 100%;
  min-width: 0;
  border: 0 !important;
  outline: none !important;
  padding: 0 !important;
  background: transparent !important;
  color: var(--text, #20352d);
  font: inherit;
  font-size: 16px;
}
.search-count {
  white-space: nowrap;
  font-size: 14px;
}
.library-filter-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 0 18px;
}
.library-tabs {
  display: flex;
  gap: 28px;
}
.library-tabs button {
  font: inherit;
  font-size: 15px;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 16px 2px;
  color: var(--muted, #6c7873);
  cursor: pointer;
  white-space: nowrap;
}
.library-tabs button.active {
  color: var(--primary, #26704d);
  border-color: currentColor;
  font-weight: 650;
}
.library-tabs span {
  font-size: 12px;
  margin-left: 5px;
  opacity: 0.65;
}
.category-select {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 45%;
  font-size: 14px;
}
.category-select select {
  border: 0;
  background: transparent;
  max-width: 100%;
  font: inherit;
  color: var(--muted, #6c7873);
  padding: 8px 20px 8px 4px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 20px;
}
.section-heading h2 {
  font-size: 20px;
  margin: 0;
}
.section-heading > .muted {
  font-size: 14px;
}
.topic-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 28px 24px;
}
.topic-tile {
  text-decoration: none;
  color: inherit;
  min-width: 0;
}
.topic-tile .topic-cover {
  transition:
    transform 0.18s,
    box-shadow 0.18s;
}
.topic-tile:hover .topic-cover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px #24463510;
}
.topic-info {
  padding: 16px 2px 0;
}
.topic-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.topic-title-row h3 {
  font-size: 17px;
  margin: 0;
  line-height: 1.5;
}
.difficulty {
  font-size: 11px;
  border: 1px solid var(--line, #dce3dc);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--muted, #6c7873);
  white-space: nowrap;
}
.topic-info > p {
  font-size: 14px;
  line-height: 1.65;
  color: var(--muted, #6c7873);
  margin: 7px 0 16px;
  min-height: 23px;
}
.topic-progress {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted, #6c7873);
  gap: 10px;
}
.topic-progress-line {
  margin-top: 9px;
  background: var(--line, #e2e8e2);
  height: 3px;
  border-radius: 2px;
  overflow: hidden;
}
.topic-progress-line > span {
  display: block;
  height: 100%;
  background: var(--primary, #26704d);
}
.oral-group + .oral-group {
  margin-top: 34px;
}
.chain-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.chain-tile {
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  padding: 22px;
  transition: border-color 0.18s;
}
.chain-tile:hover {
  border-color: var(--primary, #26704d);
}
.chain-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.chain-tile h3 {
  font-size: 17px;
  margin: 15px 0 8px;
  line-height: 1.55;
}
.chain-tile > p {
  font-size: 14px;
  line-height: 1.75;
  color: var(--muted, #6c7873);
  margin: 0 0 20px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.chain-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  font-size: 12px;
  color: var(--muted, #6c7873);
}
.question-results {
  padding: 0 !important;
  overflow: hidden;
}
.question-result {
  display: flex;
  align-items: center;
  gap: 18px;
  text-decoration: none;
  color: inherit;
  padding: 24px;
  border-bottom: 1px solid var(--line, #e4e9e5);
}
.question-result:last-child {
  border-bottom: 0;
}
.question-result:hover {
  background: #f5f8f5;
}
.question-result > div {
  flex: 1;
  min-width: 0;
}
.result-kind {
  background: #edf3ee;
  color: #467357;
  font-size: 12px;
  border-radius: 5px;
  padding: 5px 9px;
  align-self: flex-start;
  margin-top: 3px;
  white-space: nowrap;
}
.result-context {
  font-size: 12px;
  color: var(--muted, #6c7873);
  margin: 0 0 5px;
}
.question-result h3 {
  font-size: 16px;
  line-height: 1.6;
  margin: 0;
}
.result-preview {
  font-size: 14px;
  color: var(--muted, #6c7873);
  margin: 9px 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.empty-state {
  padding: 48px 24px;
  text-align: center;
  color: var(--muted, #6c7873);
}
.empty-state h2 {
  color: var(--text, #20352d);
  font-size: 20px;
}
.empty-state p {
  font-size: 15px;
  margin: 12px 0 24px;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 24px;
  font-size: 14px;
}
.library-results {
  scroll-margin-top: 100px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (min-width: 1500px) {
  .topic-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 1000px) {
  .topic-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .library-count {
    margin-top: 20px;
  }
  .library-controls {
    margin: 24px 0;
  }
  .library-search {
    padding: 15px;
  }
  .library-filter-row {
    padding: 0 12px;
    gap: 8px;
  }
  .library-tabs {
    gap: 15px;
  }
  .library-tabs button {
    font-size: 14px;
  }
  .category-select {
    gap: 0;
    max-width: 38%;
  }
  .category-select > .app-icon {
    display: none;
  }
  .category-select select {
    font-size: 13px;
  }
  .section-heading {
    gap: 8px;
    align-items: baseline;
  }
  .section-heading > .muted {
    font-size: 12px;
    max-width: 50%;
    text-align: right;
  }
  .topic-grid {
    gap: 24px 15px;
  }
  .topic-title-row {
    align-items: flex-start;
    gap: 5px;
  }
  .topic-title-row h3 {
    font-size: 15px;
  }
  .difficulty {
    font-size: 10px;
  }
  .topic-info > p {
    font-size: 12px;
    min-height: 40px;
    margin-bottom: 12px;
  }
  .topic-progress {
    font-size: 11px;
  }
  .chain-grid {
    grid-template-columns: 1fr;
  }
  .chain-tile {
    padding: 20px;
  }
  .question-result {
    padding: 18px 15px;
    gap: 10px;
  }
  .question-result > .result-kind {
    display: none;
  }
  .question-result h3 {
    font-size: 16px;
  }
  .result-preview {
    font-size: 13px;
  }
  .question-result > .app-icon {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .topic-tile .topic-cover {
    transition: none;
  }
}
.library-search:focus-within {
  outline: 2px solid #5e916d;
  outline-offset: -2px;
}
.category-select select {
  min-height: 44px;
}
</style>
