<script setup lang="ts">
import type { InterviewReport } from "../../packages/contracts/ai";
import AiMarkdown from "./AiMarkdown.vue";
defineProps<{ report: InterviewReport }>();
</script>
<template>
  <section class="interview-report">
    <div class="report-meta">完成 {{ report.answered }} 次作答</div>
    <AiMarkdown :text="report.summary" /><template
      v-if="report.strengths.length"
      ><h3>已经讲清</h3>
      <div v-for="item in report.strengths" :key="item.quote">
        <blockquote>{{ item.quote }}</blockquote>
        <p>{{ item.comment }}</p>
      </div></template
    ><template v-if="report.gaps.length"
      ><h3>下一步补足</h3>
      <div v-for="item in report.gaps" :key="item.point" class="report-gap">
        <strong>{{ item.point }}</strong>
        <p>{{ item.reason }}</p>
        <p class="muted">{{ item.practice }}</p>
      </div>
      <RouterLink
        class="button button-small"
        :to="{
          path: '/generate',
          query: {
            scope: report.gaps
              .map((g) => g.point + '：' + g.practice)
              .join('；')
              .slice(0, 1400),
          },
        }"
        >生成针对性练习</RouterLink
      ></template
    >
    <h3 v-if="report.answers.length">逐题回顾</h3>
    <details
      v-for="answer in report.answers"
      :key="answer.index"
      class="report-answer"
    >
      <summary>{{ report.transcript[answer.index - 1]?.question }}</summary>
      <h4>我的回答</h4>
      <p class="report-original">
        {{ report.transcript[answer.index - 1]?.answer }}
      </p>
      <p>{{ answer.comment }}</p>
      <h4>参考表达</h4>
      <AiMarkdown :text="answer.improvedAnswer" />
    </details>
    <h3 v-if="report.nextSteps.length">复习安排</h3>
    <ul>
      <li v-for="step in report.nextSteps" :key="step">{{ step }}</li>
    </ul>
  </section>
</template>
<style scoped>
.report-meta {
  font-size: 0.8125rem;
  color: var(--muted);
  margin-bottom: 18px;
}
.interview-report h3 {
  margin: 26px 0 14px;
}
.interview-report blockquote {
  border-left: 3px solid #aac29b;
  padding: 8px 14px;
  margin: 12px 0;
  background: #f0f4eb;
  color: #607451;
  white-space: pre-wrap;
}
.interview-report p {
  line-height: 1.85;
}
.report-gap {
  margin: 16px 0;
}
.report-gap strong {
  font-size: 0.9375rem;
}
.report-gap p {
  font-size: 0.9375rem;
  margin-top: 6px;
}
.report-answer {
  border-top: 1px solid var(--border);
  padding: 16px 0;
}
.report-answer summary {
  font-size: 1rem;
  line-height: 1.8;
  cursor: pointer;
}
.report-answer h4 {
  margin: 20px 0 10px;
}
.report-original {
  white-space: pre-wrap;
  background: #f0f4eb;
  padding: 14px;
  border-radius: 8px;
  margin-bottom: 14px;
}
.interview-report li {
  margin: 8px 0;
  line-height: 1.8;
}
</style>
