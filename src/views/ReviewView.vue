<script setup lang="ts">
import {computed, ref} from 'vue';
import {useRoute, RouterLink} from 'vue-router';
import {bank, topicById, chainById} from '@/data/content';
import {useLearningStore} from '@/stores/learning';
import type {StudyQuestion} from '@/domain/types';
import AppIcon from '@/components/AppIcon.vue';

const route = useRoute(),
  learning = useLearningStore(),
  search = ref(''),
  editingNote = ref('');
const tabs = [
  {id: 'weak', title: '还需练习'},
  {id: 'due', title: '到期复习'},
  {id: 'bookmarks', title: '我的收藏'},
  {id: 'notes', title: '学习笔记'},
];
const tab = computed(() => (tabs.some((t) => t.id === route.query.tab) ? String(route.query.tab) : 'weak'));
function matches(q: StudyQuestion, kind: string) {
  const r = learning.progress.records[q.id];
  if (!r) return false;
  if (kind === 'bookmarks') return r.bookmarked;
  if (kind === 'notes') return Boolean(r.note.trim());
  if (kind === 'due') return Boolean(r.nextReviewAt && new Date(r.nextReviewAt).getTime() <= Date.now());
  return r.status === 'learning';
}
const counts = computed(() =>
  Object.fromEntries(tabs.map((t) => [t.id, bank.questions.filter((q) => matches(q, t.id)).length])),
);
const items = computed(() =>
  bank.questions
    .filter((q) => matches(q, tab.value) || (tab.value === 'notes' && editingNote.value === q.id))
    .filter((q) =>
      [q.prompt, learning.getRecord(q.id).note, context(q)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.value.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      (learning.getRecord(b.id).lastReviewedAt || '').localeCompare(
        learning.getRecord(a.id).lastReviewedAt || '',
      ),
    ),
);
function context(q: StudyQuestion) {
  return q.id.startsWith('oral:')
    ? chainById.get(q.chainId || '')?.title
    : topicById.get(q.topicId || '')?.title;
}
function link(q: StudyQuestion) {
  return {
    path: '/practice',
    query: q.id.startsWith('oral:')
      ? {mode: 'oral', chain: q.chainId, question: q.id}
      : {mode: 'quiz', topic: q.topicId, question: q.id},
  };
}
function date(value?: string) {
  return value ? new Date(value).toLocaleDateString('zh-CN', {month: 'long', day: 'numeric'}) : '尚未练习';
}
const emptyCopy: Record<string, [string, string]> = {
  weak: ['把卡住的问题留在这里', '答题后选择「还需练习」，下次就能集中回顾。'],
  due: ['今天没有到期的复习', '完成练习并自评后，系统会安排下一次回顾。'],
  bookmarks: ['收好值得反复琢磨的问题', '在练习页收藏题目，为自己建立一份重点清单。'],
  notes: ['让每一次练习留下思考', '在题目旁写下自己的表达、例子和待确认的细节。'],
};
</script>

<template>
  <div class="review-page">
    <header class="page-heading review-heading">
      <div>
        <p class="eyebrow">YOUR LEARNING NOTES</p>
        <h1>温故，然后知新。</h1>
        <p class="muted">把还没讲清的问题，变成下一次的底气。</p>
      </div>
      <RouterLink
        v-if="counts.weak"
        class="button button-primary"
        :to="{path: '/practice', query: {mode: 'review'}}"
        ><AppIcon name="book" :size="18" />开始复习</RouterLink
      >
    </header>
    <div class="review-tabs" aria-label="复习分类">
      <RouterLink
        v-for="t in tabs"
        :key="t.id"
        :to="{path: '/review', query: {tab: t.id}}"
        :class="{active: tab === t.id}"
        :aria-current="tab === t.id ? 'page' : undefined"
        >{{ t.title }}<span>{{ counts[t.id] }}</span></RouterLink
      >
    </div>
    <div class="review-tools">
      <p class="muted">
        {{ items.length }} 个问题{{ tab === 'notes' ? '，记录你的思考' : '，按最近练习排序' }}
      </p>
      <label class="review-search"
        ><AppIcon name="search" :size="17" /><input
          v-model="search"
          type="search"
          placeholder="搜索这份清单"
          aria-label="搜索复习清单"
      /></label>
    </div>
    <div v-if="!items.length" class="empty-state panel">
      <div class="empty-illustration">
        <AppIcon :name="tab === 'bookmarks' ? 'bookmark' : tab === 'notes' ? 'file' : 'book'" :size="32" />
      </div>
      <h2>{{ search ? '没有匹配的问题' : emptyCopy[tab][0] }}</h2>
      <p>{{ search ? '换一个关键词，或清除搜索后查看全部。' : emptyCopy[tab][1] }}</p>
      <button v-if="search" class="button button-quiet" @click="search = ''">清除搜索</button
      ><RouterLink v-else class="button button-primary" to="/library">浏览题库</RouterLink>
    </div>
    <div v-else class="review-list">
      <article v-for="q in items" :key="q.id" class="review-item panel">
        <div class="item-top">
          <span class="item-context">{{ context(q) }}</span
          ><button
            class="bookmark-button"
            :class="{selected: learning.getRecord(q.id).bookmarked}"
            :aria-label="learning.getRecord(q.id).bookmarked ? '取消收藏' : '收藏题目'"
            :aria-pressed="learning.getRecord(q.id).bookmarked"
            @click="learning.toggleBookmark(q.id)"
          >
            <AppIcon name="bookmark" :size="19" />
          </button>
        </div>
        <RouterLink :to="link(q)" class="question-link"
          ><h2>{{ q.prompt }}</h2></RouterLink
        >
        <label v-if="tab === 'notes'" class="note-editor"
          ><span>我的笔记</span
          ><textarea
            :value="learning.getRecord(q.id).note"
            :aria-label="'笔记：' + q.prompt"
            rows="4"
            @focus="editingNote = q.id"
            @blur="editingNote = ''"
            @input="learning.setNote(q.id, ($event.target as HTMLTextAreaElement).value)"
          />
        </label>
        <p v-else-if="learning.getRecord(q.id).note" class="note-preview">
          {{ learning.getRecord(q.id).note }}
        </p>
        <div class="item-bottom">
          <div>
            <span>{{ learning.getRecord(q.id).attempts }} 次练习</span
            ><span>{{ date(learning.getRecord(q.id).lastReviewedAt) }}</span>
          </div>
          <RouterLink :to="link(q)"
            >{{ tab === 'notes' ? '回到题目' : '再练一次' }}<AppIcon name="chevron-right" :size="16"
          /></RouterLink>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.review-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}
.review-heading > .button {
  white-space: nowrap;
}
.review-tabs {
  display: flex;
  gap: 30px;
  border-bottom: 1px solid var(--line, #e0e6e0);
  margin-top: 32px;
  overflow-x: auto;
}
.review-tabs > a {
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  padding: 16px 0;
  color: var(--muted, #6c7873);
  border-bottom: 2px solid transparent;
  font-size: 15px;
}
.review-tabs > a.active {
  color: var(--primary, #26704d);
  font-weight: 650;
  border-color: currentColor;
}
.review-tabs span {
  font:
    12px/1.5 ui-monospace,
    monospace;
  background: #edf2ed;
  padding: 0 6px;
  border-radius: 4px;
}
.review-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 24px 0;
}
.review-tools > p {
  font-size: 14px;
  margin: 0;
}
.review-search {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line, #e0e6e0);
  border-radius: 8px;
  padding: 10px 13px;
  color: var(--muted, #6c7873);
  background: white;
  max-width: 250px;
}
.review-search input {
  font: inherit;
  font-size: 14px;
  width: 100%;
  min-width: 0;
  background: none;
  border: 0;
  outline: none;
  padding: 0;
}
.review-list {
  display: grid;
  gap: 16px;
}
.review-item {
  padding: 22px 26px;
}
.item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.item-context {
  font-size: 13px;
  color: var(--muted, #6c7873);
}
.bookmark-button {
  background: transparent;
  border: 0;
  color: #8b9790;
  border-radius: 6px;
  padding: 7px;
  display: inline-flex;
  cursor: pointer;
}
.bookmark-button.selected {
  color: var(--primary, #26704d);
  background: #edf4ee;
}
.question-link {
  color: var(--text, #20352d);
  text-decoration: none;
}
.question-link h2 {
  font-size: 18px;
  line-height: 1.7;
  margin: 9px 0 18px;
  font-weight: 600;
}
.question-link:hover {
  color: var(--primary, #26704d);
}
.note-preview {
  font-size: 15px;
  line-height: 1.8;
  white-space: pre-line;
  background: #f6f8f4;
  border-left: 2px solid #c4d8c4;
  padding: 10px 16px;
  margin: 0 0 22px;
  color: #607164;
}
.note-editor {
  display: block;
  margin-bottom: 20px;
}
.note-editor > span {
  display: block;
  font-size: 13px;
  color: var(--muted, #6c7873);
  margin-bottom: 8px;
}
.note-editor textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 110px;
  border: 1px solid var(--line, #dde5dd);
  border-radius: 8px;
  background: #f8faf7;
  padding: 12px 14px;
  font: inherit;
  font-size: 15px;
  line-height: 1.8;
  color: var(--text, #20352d);
}
.item-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  font-size: 13px;
}
.item-bottom > div {
  display: flex;
  gap: 16px;
  color: var(--muted, #6c7873);
}
.item-bottom > a {
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--primary, #26704d);
  font-weight: 600;
}
.empty-state {
  text-align: center;
  padding: 56px 24px;
}
.empty-illustration {
  width: 80px;
  height: 80px;
  border-radius: 23px;
  background: #eff4ed;
  color: #65916d;
  display: grid;
  place-items: center;
  margin: 0 auto 24px;
  transform: rotate(-5deg);
}
.empty-state h2 {
  font-size: 21px;
  margin: 0 0 14px;
}
.empty-state p {
  font-size: 15px;
  color: var(--muted, #6c7873);
  max-width: 380px;
  line-height: 1.8;
  margin: 0 auto 26px;
}
@media (max-width: 600px) {
  .review-heading {
    display: block;
  }
  .review-heading > .button {
    margin-top: 20px;
  }
  .review-tabs {
    gap: 22px;
    margin-top: 20px;
  }
  .review-tabs > a {
    font-size: 14px;
  }
  .review-tools {
    align-items: flex-start;
    gap: 12px;
    margin: 20px 0;
  }
  .review-tools > p {
    font-size: 12px;
    max-width: 42%;
    padding-top: 10px;
  }
  .review-search {
    max-width: 54%;
    padding: 9px 10px;
  }
  .review-item {
    padding: 18px;
  }
  .question-link h2 {
    font-size: 16px;
  }
  .item-context {
    font-size: 12px;
  }
  .item-bottom {
    font-size: 12px;
  }
  .item-bottom > div {
    gap: 10px;
  }
  .empty-state {
    padding: 40px 20px;
  }
}
.review-search:focus-within {
  outline: 2px solid #5e916d;
  outline-offset: 2px;
}
.bookmark-button {
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}
.item-bottom > a {
  min-height: 44px;
}
</style>
