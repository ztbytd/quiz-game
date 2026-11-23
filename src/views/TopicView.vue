<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { topicById, questionById } from "@/data/content";
import { useLearningStore } from "@/stores/learning";
import type { TopicSection } from "@/domain/types";
const route = useRoute();
const learning = useLearningStore();
const topic = computed(() => topicById.get(String(route.params.id)));
const mastered = (ids: string[]) =>
  ids.filter((id) => learning.getRecord(id).status === "mastered").length;
const labels = {
  foundation: "基础",
  chain: "深入追问",
  application: "应用与取舍",
};
function practice(section?: TopicSection, question?: string) {
  return {
    path: "/practice",
    query: {
      mode: "quiz",
      topic: topic.value?.id,
      section: section?.id,
      question,
    },
  };
}
</script>

<template>
  <div v-if="topic" class="topic-page">
    <RouterLink to="/library" class="back-link">返回专题题库</RouterLink>
    <header class="page-heading">
      <div>
        <h1>{{ topic.title }}</h1>
        <p class="muted">{{ topic.description }}</p>
      </div>
      <RouterLink :to="practice()" class="button button-primary"
        >练习整个专题</RouterLink
      >
      <RouterLink
        :to="{ path: '/generate', query: { scope: topic.title } }"
        class="button"
        >补充练习</RouterLink
      >
    </header>
    <div class="topic-overview panel">
      <span
        ><strong>{{ topic.sections.length }}</strong> 章</span
      >
      <span
        ><strong>{{ topic.questionIds.length }}</strong> 道题</span
      >
      <span
        >已掌握 <strong>{{ mastered(topic.questionIds) }}</strong> 题</span
      >
    </div>
    <div class="chapter-list">
      <section
        v-for="(section, index) in topic.sections"
        :key="section.id"
        class="chapter panel"
      >
        <div class="chapter-heading">
          <div>
            <span class="chapter-meta"
              >第 {{ index + 1 }} 章 · {{ labels[section.kind] }}</span
            >
            <h2>{{ section.title }}</h2>
          </div>
          <RouterLink :to="practice(section)" class="button button-secondary"
            >练习本章</RouterLink
          >
        </div>
        <p class="muted chapter-progress">
          {{ section.questionIds.length }} 道题 · 已掌握
          {{ mastered(section.questionIds) }} 题
        </p>
        <details>
          <summary>查看本章题目</summary>
          <ol class="chapter-questions">
            <li v-for="id in section.questionIds" :key="id">
              <RouterLink :to="practice(section, id)">{{
                questionById.get(id)?.prompt
              }}</RouterLink>
              <span
                v-if="learning.getRecord(id).status === 'mastered'"
                class="mastered"
                >已掌握</span
              >
            </li>
          </ol>
        </details>
      </section>
    </div>
  </div>
  <div v-else class="empty-state panel">
    <h1>未找到专题</h1>
    <RouterLink to="/library" class="button">返回题库</RouterLink>
  </div>
</template>

<style scoped>
.topic-page {
  max-width: 1000px;
  margin: 0 auto;
}
.back-link {
  display: inline-block;
  margin-bottom: 24px;
  color: var(--brand);
  text-decoration: underline;
  text-underline-offset: 4px;
}
.page-heading {
  gap: 24px;
  align-items: center;
}
.page-heading p {
  margin-top: 12px;
  line-height: 1.7;
  max-width: 640px;
}
.page-heading .button {
  flex-shrink: 0;
}
.topic-overview {
  display: flex;
  gap: 28px;
  padding: 20px 24px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.topic-overview strong {
  font-variant-numeric: tabular-nums;
  font-size: 1.2rem;
  margin-right: 4px;
}
.chapter-list {
  display: grid;
  gap: 18px;
}
.chapter {
  padding: 24px 28px;
}
.chapter-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.chapter-heading h2 {
  font-size: 1.15rem;
  margin: 8px 0;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.chapter-heading .button {
  flex-shrink: 0;
}
.chapter-meta {
  font-size: 0.8rem;
  color: var(--muted);
}
.chapter-progress {
  font-size: 0.85rem;
  margin: 10px 0 18px;
}
summary {
  cursor: pointer;
  font-weight: 600;
  line-height: 1.8;
}
.chapter-questions {
  padding-left: 24px;
  margin-bottom: 0;
}
.chapter-questions li {
  padding: 11px 0;
  line-height: 1.8;
  border-bottom: 1px solid var(--line);
}
.chapter-questions li:last-child {
  border-bottom: 0;
}
.chapter-questions a {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
  overflow-wrap: anywhere;
}
.mastered {
  font-size: 0.75rem;
  color: var(--brand);
  margin-left: 12px;
  white-space: nowrap;
}
@media (max-width: 650px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .chapter {
    padding: 20px;
  }
  .chapter-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
  .chapter-heading .button {
    width: 100%;
    justify-content: center;
  }
  .topic-overview {
    gap: 18px;
    padding: 18px;
  }
  .chapter-progress {
    margin-top: 16px;
  }
}
</style>
