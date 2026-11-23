<script setup lang="ts">
import {computed, ref} from 'vue';
import {RouterLink} from 'vue-router';
import {bank, chainById} from '@/data/content';
import type {CoverageItem} from '@/domain/types';
import {useLearningStore} from '@/stores/learning';
import AppIcon from '@/components/AppIcon.vue';

const learning = useLearningStore(),
  filter = ref('all'),
  search = ref('');
const str = (item: CoverageItem, key: string) => (typeof item[key] === 'string' ? (item[key] as string) : '');
const links = (item: CoverageItem) =>
  [
    ...new Set([
      ...(Array.isArray(item.existing) ? item.existing : []),
      ...(Array.isArray(item.added) ? item.added : []),
    ]),
  ].filter((id): id is string => typeof id === 'string' && chainById.has(id));
const withEvidence = computed(
  () => bank.coverage.filter((item) => learning.progress.evidence[item.id]?.trim()).length,
);
const items = computed(() =>
  bank.coverage.filter((item) => {
    if (filter.value === 'verify' && !item.verify) return false;
    if (filter.value === 'pending' && learning.progress.evidence[item.id]?.trim()) return false;
    if (filter.value === 'recorded' && !learning.progress.evidence[item.id]?.trim()) return false;
    return [item.title, str(item, 'section'), str(item, 'basis'), str(item, 'evidence')]
      .join(' ')
      .toLocaleLowerCase()
      .includes(search.value.trim().toLocaleLowerCase());
  }),
);
function done(item: CoverageItem) {
  const ids = links(item).flatMap((id) => chainById.get(id)?.questionIds || []);
  return {
    total: ids.length,
    mastered: ids.filter((id) => learning.getRecord(id).status === 'mastered').length,
  };
}
</script>

<template>
  <div class="resume-page">
    <header class="page-heading">
      <h1>简历对照</h1>
      <p class="muted">对照简历准备项目细节，分清自己的职责、方案依据与结果证据。</p>
    </header>
    <section class="evidence-intro panel">
      <div class="intro-icon"><AppIcon name="file" :size="27" /></div>
      <div>
        <h2>简历练习清单</h2>
        <p>题库提供追问方向。把你做过的内容、数据来源和关键决策，写进自己的项目笔记。</p>
      </div>
      <div class="evidence-count">
        <strong
          >{{ withEvidence }}<span>/ {{ bank.coverage.length }}</span></strong
        ><small>已记录项目依据</small>
      </div>
    </section>
    <div class="resume-tools">
      <label class="resume-search"
        ><AppIcon name="search" :size="18" /><input
          v-model="search"
          type="search"
          aria-label="搜索简历核对项目"
          placeholder="搜索技能或项目关键词" /></label
      ><label class="resume-filter"
        ><span>查看</span
        ><select v-model="filter" aria-label="筛选核对项目">
          <option value="all">全部项目</option>
          <option value="pending">待记录依据</option>
          <option value="recorded">已有笔记</option>
          <option value="verify">重点核实</option>
        </select></label
      >
    </div>
    <p class="list-count muted">{{ items.length }} 项 · 点击展开项目细节与关联练习</p>
    <div v-if="!items.length" class="empty-state panel">
      <AppIcon name="search" :size="30" />
      <h2>没有匹配的项目</h2>
      <p>调整筛选条件，或使用更短的关键词。</p>
      <button
        class="button button-quiet"
        @click="
          filter = 'all';
          search = '';
        "
      >
        查看全部
      </button>
    </div>
    <div v-else class="evidence-list">
      <details v-for="item in items" :key="item.id" class="evidence-item panel" :data-coverage-id="item.id">
        <summary>
          <div class="evidence-status" :class="{recorded: learning.progress.evidence[item.id]?.trim()}">
            <AppIcon :name="learning.progress.evidence[item.id]?.trim() ? 'check' : 'file'" :size="18" />
          </div>
          <div class="evidence-title">
            <span>{{ str(item, 'section') }}</span>
            <h2>{{ item.title }}</h2>
          </div>
          <span v-if="item.verify" class="verify-label">重点核实</span
          ><AppIcon name="chevron-down" :size="18" />
        </summary>
        <div class="evidence-body">
          <div class="evidence-description">
            <p v-if="str(item, 'basis')"><span>简历依据</span>{{ str(item, 'basis') }}</p>
            <p v-if="str(item, 'evidence')"><span>准备重点</span>{{ str(item, 'evidence') }}</p>
          </div>
          <div v-if="links(item).length" class="linked-practice">
            <div class="linked-heading">
              <h3>从这些问题开始</h3>
              <span>{{ done(item).mastered }} / {{ done(item).total }} 已掌握</span>
            </div>
            <div class="linked-chains">
              <RouterLink
                v-for="id in links(item)"
                :key="id"
                :to="{path: '/practice', query: {mode: 'oral', chain: id}}"
                ><span>{{ chainById.get(id)!.title }}</span
                ><small>{{ chainById.get(id)!.questionIds.length }} 问</small
                ><AppIcon name="chevron-right" :size="14"
              /></RouterLink>
            </div>
          </div>
          <label class="evidence-note" :for="'evidence-' + item.id"
            ><span>我的项目依据</span
            ><textarea
              :id="'evidence-' + item.id"
              :value="learning.progress.evidence[item.id] || ''"
              rows="4"
              placeholder="例如：我负责的模块、一次技术取舍、验证方法、结果数据的来源…"
              @input="learning.setEvidence(item.id, ($event.target as HTMLTextAreaElement).value)"
            /><small>自动保存到本机；可以在「我的学习」中导出备份。</small></label
          >
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.resume-page > .page-heading {
  display: block;
}
.evidence-intro {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 28px;
  margin: 30px 0;
}
.intro-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 17px;
  background: #eeeee3;
  color: #8b8758;
  flex-shrink: 0;
}
.evidence-intro > div:nth-child(2) {
  flex: 1;
}
.evidence-intro h2 {
  font-size: 19px;
  margin: 0 0 8px;
}
.evidence-intro p {
  font-size: 14px;
  line-height: 1.85;
  color: var(--muted, #6c7873);
  margin: 0;
  max-width: 560px;
}
.evidence-count {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 8px;
  white-space: nowrap;
}
.evidence-count strong {
  font:
    500 31px/1.2 ui-serif,
    Georgia,
    serif;
  color: var(--primary, #26704d);
}
.evidence-count strong span {
  font-size: 18px;
  margin-left: 4px;
  color: var(--muted, #6c7873);
}
.evidence-count > small {
  font-size: 12px;
  color: var(--muted, #6c7873);
}
.resume-tools {
  display: flex;
  align-items: center;
  gap: 18px;
  justify-content: space-between;
}
.resume-search {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line, #dfe5df);
  padding: 12px 16px;
  border-radius: 8px;
  background: white;
  max-width: 500px;
  flex: 1;
  color: var(--muted, #6c7873);
}
.resume-search input {
  font: inherit;
  font-size: 15px;
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: none;
  padding: 0;
}
.resume-filter {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  color: var(--muted, #6c7873);
}
.resume-filter select {
  font: inherit;
  border: 1px solid var(--line, #dfe5df);
  padding: 11px 26px 11px 12px;
  border-radius: 8px;
  background: white;
  color: var(--text, #20352d);
}
.list-count {
  font-size: 13px;
  margin: 18px 0;
}
.evidence-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.evidence-item {
  padding: 0 !important;
  overflow: hidden;
}
.evidence-item summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 15px;
  list-style: none;
  padding: 22px 24px;
}
.evidence-item summary::-webkit-details-marker {
  display: none;
}
.evidence-status {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: #f0f3ee;
  border: 1px solid #e3e9de;
  border-radius: 10px;
  color: #8b9987;
}
.evidence-status.recorded {
  color: #467750;
  background: #edf5e9;
  border-color: #caddc3;
}
.evidence-title {
  flex: 1;
  min-width: 0;
}
.evidence-title > span {
  font-size: 12px;
  color: var(--muted, #6c7873);
}
.evidence-title h2 {
  font-size: 16px;
  line-height: 1.6;
  margin: 5px 0 0;
}
.verify-label {
  font-size: 12px;
  background: #f8f0e5;
  color: #9a784a;
  padding: 3px 8px;
  border-radius: 5px;
  white-space: nowrap;
}
.evidence-item summary > .app-icon {
  color: #8b9990;
  transition: transform 0.16s;
}
.evidence-item[open] summary > .app-icon {
  transform: rotate(180deg);
}
.evidence-body {
  padding: 0 24px 26px;
  border-top: 1px solid var(--line, #e4e9e1);
}
.evidence-description {
  padding: 18px 0;
}
.evidence-description > p {
  font-size: 14px;
  line-height: 1.9;
  color: var(--muted, #6c7873);
  margin: 0 0 12px;
}
.evidence-description > p:last-child {
  margin: 0;
}
.evidence-description span {
  display: block;
  font-size: 12px;
  color: #8b978b;
  margin-bottom: 2px;
}
.linked-practice {
  padding: 18px 20px;
  background: #f7f9f4;
  border-radius: 10px;
  margin-bottom: 22px;
}
.linked-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 14px;
}
.linked-heading h3 {
  font-size: 14px;
  margin: 0;
}
.linked-heading > span {
  font-size: 12px;
  color: var(--muted, #6c7873);
}
.linked-chains {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.linked-chains > a {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 12px;
  border: 1px solid #e1e7dd;
  border-radius: 7px;
  background: white;
  text-decoration: none;
  color: var(--primary, #26704d);
}
.linked-chains > a > span {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
}
.linked-chains > a small {
  font-size: 11px;
  white-space: nowrap;
  color: var(--muted, #6c7873);
}
.evidence-note {
  display: block;
}
.evidence-note > span {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}
.evidence-note textarea {
  width: 100%;
  resize: vertical;
  font: inherit;
  font-size: 15px;
  line-height: 1.8;
  min-height: 120px;
  border: 1px solid var(--line, #dce4d9);
  border-radius: 8px;
  padding: 13px 15px;
  background: #fbfcfa;
  box-sizing: border-box;
  color: var(--text, #20352d);
}
.evidence-note small {
  display: block;
  font-size: 12px;
  color: var(--muted, #6c7873);
  margin-top: 8px;
}
.empty-state {
  padding: 42px 24px;
  text-align: center;
  color: var(--muted, #6c7873);
}
.empty-state h2 {
  font-size: 20px;
  color: var(--text, #20352d);
}
.empty-state p {
  font-size: 15px;
  margin-bottom: 24px;
}
@media (max-width: 650px) {
  .evidence-intro {
    padding: 20px;
    gap: 15px;
    flex-wrap: wrap;
  }
  .intro-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
  }
  .evidence-intro h2 {
    font-size: 17px;
  }
  .evidence-intro p {
    font-size: 13px;
  }
  .evidence-count {
    width: 100%;
    flex-direction: row;
    text-align: left;
    align-items: baseline;
    gap: 12px;
    border-top: 1px solid var(--line, #e1e7dc);
    padding-top: 16px;
  }
  .evidence-count strong {
    font-size: 26px;
  }
  .resume-tools {
    gap: 12px;
  }
  .resume-search {
    padding: 11px 12px;
  }
  .resume-search input {
    font-size: 14px;
  }
  .resume-filter > span {
    display: none;
  }
  .resume-filter select {
    font-size: 13px;
    padding: 12px 22px 12px 10px;
  }
  .evidence-item summary {
    padding: 18px 16px;
    gap: 12px;
  }
  .evidence-status {
    width: 31px;
    height: 31px;
    border-radius: 8px;
  }
  .evidence-title h2 {
    font-size: 15px;
  }
  .evidence-title > span {
    font-size: 11px;
  }
  .verify-label {
    font-size: 10px;
    padding: 3px 5px;
  }
  .evidence-body {
    padding: 0 16px 20px;
  }
  .evidence-description > p {
    font-size: 14px;
  }
  .linked-practice {
    padding: 16px 13px;
  }
  .linked-chains {
    grid-template-columns: 1fr;
  }
  .linked-heading {
    gap: 8px;
  }
  .linked-heading h3 {
    font-size: 13px;
  }
  .linked-heading > span {
    font-size: 11px;
  }
  .evidence-note textarea {
    font-size: 14px;
  }
}
.resume-search:focus-within {
  outline: 2px solid #5e916d;
  outline-offset: 2px;
}
</style>
