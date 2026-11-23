<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue';
import {labs} from '../data/labs';
import {runCode, type CodeResult, type CodeRun} from '../infrastructure/code-runner';
import {useLearningStore} from '../stores/learning';
import AppIcon from './AppIcon.vue';
const props = defineProps<{labId: string}>();
const store = useLearningStore();
const spec = computed(() => labs[props.labId]);
const code = ref('');
const result = ref<CodeResult | null>(null);
const running = ref(false);
let task: CodeRun | null = null;
watch(
  () => props.labId,
  () => {
    task?.cancel();
    task = null;
    result.value = null;
    running.value = false;
    code.value =
      store.progress.code[props.labId] ||
      `function ${spec.value?.name}(${spec.value?.args}) {\n  // 在这里写下你的实现\n}\n`;
  },
  {immediate: true},
);
function save() {
  store.saveCode(props.labId, code.value);
}
async function run() {
  if (!spec.value || running.value) return;
  save();
  result.value = null;
  running.value = true;
  const current = runCode(spec.value, code.value);
  task = current;
  const output = await current.result;
  if (task === current) {
    result.value = output;
    running.value = false;
    task = null;
  }
}
onBeforeUnmount(() => task?.cancel());
</script>

<template>
  <details v-if="spec" class="code-lab">
    <summary>
      <AppIcon name="code" :size="19" /><span>动手写一遍</span
      ><span class="lab-count">{{ spec.cases.length }} 个验证用例</span>
    </summary>
    <div class="lab-body">
      <p v-if="spec.hint" class="lab-hint">{{ spec.hint }}</p>
      <label :for="'code-' + labId" class="editor-label">JavaScript 编辑器</label>
      <textarea
        :id="'code-' + labId"
        v-model="code"
        class="code-editor"
        maxlength="100000"
        spellcheck="false"
        autocapitalize="off"
        aria-label="代码编辑器"
        @input="save"
      />
      <div class="lab-toolbar">
        <button class="button button-primary" :disabled="running" @click="run">
          <AppIcon name="play" :size="16" />{{ running ? '正在验证' : '运行用例' }}</button
        ><button v-if="running" class="button button-quiet" @click="task?.cancel()">停止</button
        ><span>每次运行限时 3 秒</span>
      </div>
      <div v-if="result" class="result-log" aria-live="polite">
        <p v-if="result.error" class="run-error">{{ result.error }}</p>
        <div v-for="row in result.rows" :key="row.label" class="test-row" :class="{passed: row.pass}">
          <AppIcon :name="row.pass ? 'check-circle' : 'close'" :size="17" />
          <div>
            <strong>{{ row.pass ? '通过' : '待修正' }} · {{ row.label }}</strong>
            <p>{{ row.detail }}</p>
          </div>
        </div>
      </div>
    </div>
  </details>
</template>

<style scoped>
.code-lab {
  border: 1px solid var(--line, #e0e8e2);
  border-radius: 14px;
  margin-top: 24px;
  background: #fff;
}
.code-lab summary {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 18px;
  cursor: pointer;
  font-weight: 650;
  list-style: none;
}
.code-lab summary::after {
  content: '+';
  margin-left: auto;
  color: #7c8981;
}
.code-lab[open] summary::after {
  content: '−';
}
.lab-count {
  font-size: 0.75rem;
  font-weight: 400;
  color: #78867e;
}
.lab-body {
  padding: 0 18px 20px;
}
.lab-hint {
  font-size: 0.875rem;
  line-height: 1.8;
  color: #586a60;
}
.editor-label {
  display: block;
  font-size: 0.8125rem;
  color: #56695d;
  margin-bottom: 8px;
}
.code-editor {
  font:
    0.875rem/1.8 'SFMono-Regular',
    Consolas,
    monospace;
  width: 100%;
  min-height: 250px;
  border: 1px solid #d7e0da;
  border-radius: 10px;
  padding: 16px;
  resize: vertical;
  tab-size: 2;
  background: #f8faf8;
  color: #213e2d;
  white-space: pre;
  overflow: auto;
}
.code-editor:focus {
  outline: 2px solid #b9d4c3;
  outline-offset: 2px;
}
.lab-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 14px;
}
.lab-toolbar > span {
  font-size: 0.75rem;
  color: #79857e;
}
.result-log {
  margin-top: 18px;
}
.test-row {
  display: flex;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid #e7ebe7;
  color: #9b4c35;
}
.test-row.passed {
  color: #236b4b;
}
.test-row strong {
  font-size: 0.875rem;
}
.test-row p {
  font-size: 0.8125rem;
  line-height: 1.65;
  color: #65746b;
  margin: 3px 0 0;
  overflow-wrap: anywhere;
}
.run-error {
  color: #9b4c35;
  font-size: 0.875rem;
}
@media (max-width: 650px) {
  .lab-count {
    display: none;
  }
  .code-editor {
    min-height: 220px;
    padding: 12px;
  }
  .lab-body {
    padding: 0 14px 16px;
  }
}
</style>
