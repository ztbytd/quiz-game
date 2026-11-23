<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { useLearningStore } from "@/stores/learning";
import { bank } from "@/data/content";
import AppIcon from "@/components/AppIcon.vue";

const learning = useLearningStore(),
  input = ref<HTMLInputElement | null>(null);
const message = ref(""),
  error = ref(""),
  busy = ref(false),
  selected = ref<File | null>(null);
const goal = computed({
  get: () => learning.progress.dailyGoal,
  set: (value: number) => learning.setGoal(value),
});
const completedSessions = computed(() =>
  learning.progress.history
    .filter((s) => s.completedAt)
    .slice()
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))
    .slice(0, 8),
);
const mastery = computed(() =>
  Math.round((learning.stats.mastered / bank.questions.length) * 100),
);
function day(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
}
function dateStamp() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
async function exportBackup() {
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    const data = await learning.exportData();
    const url = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-study-${dateStamp()}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    message.value = "备份文件已生成，包含学习记录、笔记和当前练习。";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "导出失败，请稍后重试。";
  } finally {
    busy.value = false;
  }
}
function chooseFile(event: Event) {
  error.value = "";
  message.value = "";
  selected.value = null;
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    error.value = "文件超过 10 MB，请选择本应用导出的学习备份。";
    return;
  }
  selected.value = file;
}
function cancelImport() {
  selected.value = null;
  if (input.value) input.value.value = "";
}
async function importBackup() {
  if (!selected.value) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    await learning.importData(await selected.value.text());
    message.value = "备份已导入，学习记录已更新。";
    cancelImport();
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : "文件无效，当前记录没有被替换。";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="profile-page">
    <header class="page-heading">
      <h1>学习记录</h1>
    </header>
    <section class="profile-summary panel" aria-label="学习概览">
      <div class="profile-intro">
        <h2>我的学习档案</h2>
        <p>学习数据保存在本机，可导出备份。</p>
      </div>
      <div class="summary-mastery">
        <strong>{{ mastery }}<small>%</small></strong
        ><span>题目已掌握</span>
      </div>
    </section>
    <div class="profile-stats">
      <article class="panel">
        <AppIcon name="check" :size="19" /><strong>{{
          learning.stats.mastered
        }}</strong
        ><span>已掌握问题</span>
      </article>
      <article class="panel">
        <AppIcon name="book" :size="19" /><strong>{{
          learning.stats.answered
        }}</strong
        ><span>已练习问题</span>
      </article>
      <article class="panel">
        <AppIcon name="calendar" :size="19" /><strong>{{
          learning.stats.studyDays
        }}</strong
        ><span>累计学习天数</span>
      </article>
      <article class="panel">
        <AppIcon name="target" :size="19" /><strong>{{
          learning.stats.streak
        }}</strong
        ><span>连续学习天数</span>
      </article>
    </div>
    <div class="profile-columns">
      <div class="profile-main">
        <section class="panel setting-section">
          <header>
            <AppIcon name="target" :size="20" />
            <h2>每日目标</h2>
          </header>
          <p>每完成一道题并作出评价，计入一次练习。</p>
          <div class="goal-options">
            <button
              v-for="n in [5, 10, 15, 20]"
              :key="n"
              :class="{ active: goal === n }"
              :aria-pressed="goal === n"
              @click="goal = n"
            >
              {{ n }} <span>题 / 天</span>
            </button>
          </div>
          <div class="goal-today">
            <span
              >今天已练习
              <strong>{{ learning.stats.todayCount }}</strong> 题</span
            ><span>{{
              learning.stats.todayCount >= goal
                ? "今日目标已达成"
                : `还差 ${goal - learning.stats.todayCount} 题`
            }}</span>
          </div>
          <div class="goal-track">
            <span
              :style="{
                width:
                  Math.min(100, (learning.stats.todayCount / goal) * 100) + '%',
              }"
            ></span>
          </div>
        </section>
        <section class="panel history-section">
          <header>
            <AppIcon name="history" :size="20" />
            <h2>最近完成</h2>
          </header>
          <p v-if="!completedSessions.length" class="history-empty">
            完成一轮练习后，你的学习记录会出现在这里。
          </p>
          <div v-else class="session-history">
            <article v-for="s in completedSessions" :key="s.id">
              <div>
                <h3>{{ s.title }}</h3>
                <p>
                  {{ s.questionIds.length }} 道题 ·
                  {{
                    s.mode === "mock"
                      ? "模拟面试"
                      : s.mode === "oral"
                        ? "专项追问"
                        : "基础练习"
                  }}
                </p>
              </div>
              <time :datetime="s.completedAt">{{
                day(s.completedAt || s.startedAt)
              }}</time>
            </article>
          </div>
        </section>
      </div>
      <aside class="profile-side">
        <section class="panel backup-section">
          <header>
            <AppIcon name="download" :size="20" />
            <h2>数据备份</h2>
          </header>
          <p>
            换设备或清理浏览器前，先导出一份备份。导入后可以继续原来的学习。
          </p>
          <div class="backup-actions">
            <button
              class="button button-primary"
              :disabled="busy"
              @click="exportBackup"
            >
              <AppIcon name="download" :size="18" />导出学习备份</button
            ><button
              class="button button-quiet"
              :disabled="busy"
              @click="input?.click()"
            >
              <AppIcon name="upload" :size="18" />导入备份文件</button
            ><input
              ref="input"
              type="file"
              accept=".json,application/json"
              aria-label="选择学习备份文件"
              class="file-input"
              @change="chooseFile"
            />
          </div>
          <div v-if="selected" class="import-confirm">
            <strong>{{ selected.name }}</strong>
            <p>导入将替换当前学习记录。建议先导出备份。</p>
            <div>
              <button
                class="button button-primary"
                :disabled="busy"
                @click="importBackup"
              >
                {{ busy ? "正在导入…" : "确认导入并替换" }}</button><button
                class="button button-quiet"
                :disabled="busy"
                @click="cancelImport"
              >
                取消
              </button>
            </div>
          </div>
          <p v-if="message" class="backup-message" role="status">
            {{ message }}
          </p>
          <p v-if="error" class="backup-error" role="alert">{{ error }}</p>
        </section>
        <RouterLink to="/resume" class="resume-link panel"
          ><div class="resume-link-icon">
            <AppIcon name="file" :size="22" />
          </div>
          <div>
            <h2>简历与项目对照</h2>
          </div>
          <AppIcon name="chevron-right" :size="18"
        /></RouterLink>
        <div class="privacy-note">
          <AppIcon name="bookmark" :size="17" />
          <p>记录存于当前浏览器，不会自动同步到其他设备。</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.profile-page > .page-heading {
  display: block;
}
.profile-summary {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 28px;
  margin: 30px 0 20px;
}
.profile-intro {
  flex: 1;
}
.profile-intro h2 {
  font-size: 20px;
  margin: 0 0 7px;
}
.profile-intro p {
  font-size: 14px;
  color: var(--muted, #6c7873);
  margin: 0;
}
.summary-mastery {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.summary-mastery strong {
  font:
    500 35px/1.2 ui-serif,
    Georgia,
    serif;
  color: var(--primary, #26704d);
}
.summary-mastery small {
  font:
    400 17px/1.4 system-ui,
    sans-serif;
  margin-left: 2px;
}
.summary-mastery > span {
  font-size: 12px;
  color: var(--muted, #6c7873);
}
.profile-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}
.profile-stats article {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #72917a;
}
.profile-stats strong {
  font:
    500 32px/1.2 ui-serif,
    Georgia,
    serif;
  color: var(--text, #20352d);
}
.profile-stats span {
  font-size: 14px;
  color: var(--muted, #6c7873);
}
.profile-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 24px;
}
.profile-main,
.profile-side {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.setting-section,
.backup-section,
.history-section {
  padding: 26px;
}
.profile-columns header {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--primary, #26704d);
}
.profile-columns h2 {
  font-size: 18px;
  color: var(--text, #20352d);
  margin: 0;
  line-height: 1.6;
}
.setting-section > p,
.backup-section > p {
  font-size: 14px;
  line-height: 1.85;
  color: var(--muted, #6c7873);
  margin: 12px 0 22px;
}
.goal-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
}
.goal-options > button {
  background: white;
  border: 1px solid var(--line, #dfe5de);
  border-radius: 8px;
  font:
    600 21px/1.5 ui-serif,
    Georgia,
    serif;
  padding: 15px 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: var(--text, #20352d);
  cursor: pointer;
}
.goal-options > button span {
  font:
    400 12px/1.5 system-ui,
    sans-serif;
  color: var(--muted, #6c7873);
}
.goal-options > button.active {
  background: #f1f6ee;
  border-color: #77a17f;
  color: var(--primary, #26704d);
}
.goal-today {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--muted, #6c7873);
  margin: 23px 0 10px;
}
.goal-today strong {
  color: var(--primary, #26704d);
}
.goal-track {
  height: 5px;
  overflow: hidden;
  background: #e9eee8;
  border-radius: 4px;
}
.goal-track > span {
  display: block;
  height: 100%;
  background: var(--primary, #26704d);
  border-radius: 4px;
}
.history-empty {
  font-size: 14px;
  line-height: 1.9;
  color: var(--muted, #6c7873);
  padding: 22px 0 10px;
  margin: 0;
}
.session-history > article {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  padding: 18px 0;
  border-bottom: 1px solid var(--line, #e3e8e2);
}
.session-history > article:last-child {
  padding-bottom: 0;
  border: 0;
}
.session-history h3 {
  font-size: 15px;
  margin: 0 0 7px;
}
.session-history p {
  font-size: 12px;
  color: var(--muted, #6c7873);
  margin: 0;
}
.session-history time {
  font-size: 12px;
  color: var(--muted, #6c7873);
  white-space: nowrap;
}
.backup-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.backup-actions > .button {
  justify-content: center;
  padding-inline: 18px;
}
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
.import-confirm {
  margin-top: 20px;
  border-top: 1px solid var(--line, #e1e7e0);
  padding-top: 20px;
}
.import-confirm strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.import-confirm p {
  font-size: 14px;
  line-height: 1.7;
  color: #8d6039;
}
.import-confirm > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.backup-section .backup-message {
  color: #26704d;
  margin-bottom: 0;
}
.backup-section .backup-error {
  color: #b14e36;
  margin-bottom: 0;
}
.resume-link {
  padding: 22px;
  display: flex;
  align-items: center;
  gap: 15px;
  text-decoration: none;
  color: inherit;
}
.resume-link-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: #f2eee7;
  color: #9b794d;
}
.resume-link > div:nth-child(2) {
  flex: 1;
}
.resume-link h2 {
  font-size: 16px;
}
.resume-link p {
  font-size: 13px;
  color: var(--muted, #6c7873);
  margin: 5px 0 0;
}
.privacy-note {
  display: flex;
  gap: 10px;
  color: var(--muted, #6c7873);
  padding: 0 6px;
}
.privacy-note > .app-icon {
  flex-shrink: 0;
  margin-top: 4px;
}
.privacy-note p {
  font-size: 12px;
  line-height: 1.8;
  margin: 0;
}
@media (max-width: 850px) {
  .profile-columns {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 550px) {
  .profile-summary {
    padding: 20px;
    gap: 14px;
    flex-wrap: wrap;
  }
  .profile-intro h2 {
    font-size: 18px;
  }
  .profile-intro p {
    font-size: 12px;
  }
  .summary-mastery {
    display: none;
  }
  .profile-stats {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .profile-stats article {
    padding: 19px;
    gap: 10px;
  }
  .profile-stats strong {
    font-size: 29px;
  }
  .profile-stats span {
    font-size: 13px;
  }
  .setting-section,
  .backup-section,
  .history-section {
    padding: 22px;
  }
  .goal-options {
    gap: 8px;
  }
  .goal-options > button {
    padding: 12px 3px;
    font-size: 20px;
  }
  .profile-columns h2 {
    font-size: 17px;
  }
  .resume-link {
    padding: 20px;
  }
}
</style>
