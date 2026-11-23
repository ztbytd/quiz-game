<script setup lang="ts">
import {computed, ref} from 'vue';
import type {StudyQuestion, Source} from '../domain/types';
const props = defineProps<{question: StudyQuestion}>();
const copied = ref(false);
const heading = ref<HTMLElement | null>(null);
defineExpose({focus: () => heading.value?.focus()});
const explanation = computed(() => props.question.explanation.split('↵'));
const sources = computed<Source[]>(() => {
  const all = [
    ...(props.question.detail?.sources || []),
    ...(props.question.source ? [props.question.source] : []),
  ];
  return all.filter(
    (source, index) =>
      /^https:\/\//.test(source[1]) && all.findIndex((item) => item[1] === source[1]) === index,
  );
});
async function copy(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1800);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <section :key="question.id" class="answer-content" aria-label="参考答案">
    <div class="answer-title">
      <h2 ref="heading" tabindex="-1">参考答案</h2>
    </div>
    <p class="answer-text">{{ explanation[0] }}</p>
    <pre
      v-if="explanation.length > 1"
      tabindex="0"
    ><code>{{ explanation.slice(1).join('\n') }}</code></pre>
    <details v-if="question.detail?.principle" class="answer-section">
      <summary>原理与过程</summary>
      <p>{{ question.detail.principle }}</p>
    </details>
    <details v-if="question.detail?.example" class="answer-section">
      <summary>例子与推演</summary>
      <p>{{ question.detail.example }}</p>
    </details>
    <details v-if="question.detail?.code" class="answer-section">
      <summary>实现代码</summary>
      <div class="code-heading">
        <button class="button button-quiet copy-button" @click="copy(question.detail.code)">
          {{ copied ? '已复制' : '复制代码' }}
        </button>
      </div>
      <pre tabindex="0"><code>{{ question.detail.code }}</code></pre>
      <p class="code-note">长代码可以左右滑动查看</p>
    </details>
    <details v-if="question.detail?.pitfalls" class="answer-section">
      <summary>适用条件与易错点</summary>
      <p>{{ question.detail.pitfalls }}</p>
    </details>
    <section v-if="question.detail?.followups?.length" class="answer-section">
      <h3>继续追问</h3>
      <details v-for="([prompt, answer], index) in question.detail.followups" :key="index">
        <summary>{{ prompt }}</summary>
        <p>{{ answer }}</p>
      </details>
    </section>
    <details v-if="sources.length" class="answer-section references">
      <summary>核对资料</summary>
      <div class="reference-links">
        <a
          v-for="[title, url] in sources"
          :key="url"
          :href="url"
          target="_blank"
          rel="noopener noreferrer"
          >{{ title }}</a
        >
      </div>
    </details>
  </section>
</template>

<style scoped>
.answer-content {
  padding-top: 30px;
  min-width: 0;
}
.answer-title {
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin-bottom: 18px;
}
.answer-title h2 {
  font-size: 1.25rem;
  margin: 0;
  scroll-margin-top: 120px;
  outline: none;
}
.answer-text,
.answer-section p {
  white-space: pre-line;
  line-height: 1.9;
  overflow-wrap: anywhere;
  color: var(--text, #24372e);
}
.answer-section {
  margin-top: 12px;
}
.answer-section h3 {
  font-size: 1rem;
  margin: 0 0 10px;
}
.answer-section p {
  margin: 0;
}
.answer-content pre {
  background: #172c27;
  color: #eaf4ef;
  border-radius: 12px;
  overflow: auto;
  padding: 22px;
  font:
    0.875rem/1.8 'SFMono-Regular',
    Consolas,
    monospace;
  max-width: 100%;
  margin: 14px 0 0;
  tab-size: 2;
}
.answer-content pre code {
  white-space: pre;
}
.code-heading {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
.code-heading h3 {
  margin: 0;
}
.copy-button {
  font-size: 0.8125rem;
  padding: 5px 10px !important;
  min-height: 32px !important;
}
.answer-section .code-note {
  font-size: 0.75rem;
  color: #6b7a73;
  margin-top: 8px;
}
.boundary {
  border-left: 3px solid #cfa35b;
  background: #faf8f2;
  padding: 17px 20px;
}
.reference-links {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 14px;
}
.references a {
  font-size: 0.875rem;
  color: var(--brand, #1c654c);
  overflow-wrap: anywhere;
  text-decoration: underline;
  text-underline-offset: 3px;
}
details {
  padding: 14px 0;
  border-bottom: 1px solid var(--line, #e5eae6);
}
summary {
  cursor: pointer;
  font-weight: 600;
  line-height: 1.6;
}
details p {
  padding-top: 12px;
}
@media (max-width: 650px) {
  .answer-content pre {
    padding: 16px;
  }
  .answer-content {
    padding-top: 24px;
  }
  .answer-title {
    flex-wrap: wrap;
    gap: 5px 12px;
  }
}
</style>
