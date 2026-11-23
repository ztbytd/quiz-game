<script setup lang="ts">
import { computed } from "vue";
import { bank, quizQuestions, oralQuestions } from "@/data/content";
import { useLearningStore } from "@/stores/learning";
import AppIcon from "@/components/AppIcon.vue";
const store = useLearningStore();
const featured = computed(() =>
  ["0", "3", "18", "16"]
    .map((id) => bank.topics.find((t) => t.id === id))
    .filter((t) => !!t),
);
const recent = computed(() =>
  bank.questions
    .filter((q) => store.getRecord(q.id).lastReviewedAt)
    .sort((a, b) =>
      (store.getRecord(b.id).lastReviewedAt || "").localeCompare(
        store.getRecord(a.id).lastReviewedAt || "",
      ),
    )
    .slice(0, 3),
);
const percent = computed(() =>
  Math.min(
    100,
    Math.round((store.stats.todayCount / store.progress.dailyGoal) * 100),
  ),
);
const session = computed(() =>
  store.progress.session && !store.progress.session.completedAt
    ? store.progress.session
    : null,
);
const topicProgress = (ids: string[]) =>
  Math.round(
    (ids.filter((id) => store.getRecord(id).status === "mastered").length /
      ids.length) *
      100,
  );
const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      label: ["日", "一", "二", "三", "四", "五", "六"][d.getDay()],
      count: store.progress.activity[key] || 0,
      today: i === 6,
    };
  }),
);
const tones = ["sage", "blue", "peach", "lavender"];
</script>
<template>
  <div class="dashboard">
    <div class="page-heading">
      <div>
        <h1>学习工作台</h1>
      </div>
      <RouterLink class="button button-quiet desktop-only" to="/profile"
        ><AppIcon name="calendar" :size="17" />我的学习记录</RouterLink
      >
    </div>
    <div class="dashboard-grid">
      <div class="dashboard-primary">
        <section class="daily-hero">
          <div class="hero-copy">
            <h2>今日练习</h2>
            <RouterLink class="button hero-button" to="/practice?mode=daily"
              ><AppIcon name="play" :size="19" />{{
                store.stats.todayCount ? "继续今日练习" : "开始今日练习"
              }}</RouterLink
            >
            <div class="hero-foot">
              {{ store.progress.dailyGoal }} 道目标题目
              <span>·</span> 按薄弱点与学习进度安排
            </div>
          </div>
          <div class="hero-art" aria-hidden="true">
            <svg viewBox="0 0 300 260" fill="none">
              <circle
                cx="156"
                cy="128"
                r="108"
                stroke="#fff"
                stroke-opacity=".16"
              />
              <circle
                cx="156"
                cy="128"
                r="83"
                stroke="#fff"
                stroke-opacity=".09"
              />
              <path
                d="M56 208L227 210L259 192L91 189Z"
                fill="#103d2c"
                opacity=".5"
              />
              <g transform="rotate(-12 140 145)">
                <rect
                  x="77"
                  y="83"
                  width="148"
                  height="113"
                  rx="5"
                  fill="#a8b9a1"
                />
                <path d="M79 185h142v12H79z" fill="#eceddf" />
                <rect
                  x="70"
                  y="71"
                  width="148"
                  height="112"
                  rx="5"
                  fill="#bed0aa"
                />
                <rect x="70" y="71" width="9" height="112" fill="#91ad85" />
                <path
                  d="M101 102h57M101 113h39"
                  stroke="#56784e"
                  stroke-width="4"
                />
                <circle
                  cx="180"
                  cy="152"
                  r="15"
                  stroke="#698f5b"
                  stroke-width="2"
                />
              </g>
              <g transform="rotate(11 156 107)">
                <rect
                  x="106"
                  y="47"
                  width="108"
                  height="139"
                  rx="5"
                  fill="#eeeeda"
                />
                <path d="M116 49v135" stroke="#cbcfb4" />
                <path
                  d="M136 72h50M136 82h34"
                  stroke="#8c9676"
                  stroke-width="3"
                />
                <path
                  d="M141 121l13 13 25-29"
                  stroke="#3e7054"
                  stroke-width="6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path d="M183 47h14v32l-7-6-7 6z" fill="#cf9878" />
              </g>
              <path
                d="M49 153c-21-13-11-42 4-48-4 21 17 27 6 45M242 97c23-15 24-40 16-48-16 6-27 28-16 48"
                fill="#98b68a"
              />
              <path
                d="M54 150l10 32M243 95l-11 32"
                stroke="#bad0a6"
                stroke-width="2"
              />
              <circle cx="79" cy="44" r="4" fill="#c7d8aa" />
              <path d="M249 160v12m-6-6h12" stroke="#b5c794" stroke-width="2" />
            </svg>
          </div>
        </section>
        <div v-if="session" class="resume-strip">
          <div class="strip-icon"><AppIcon name="history" /></div>
          <div>
            <strong>未完成的练习</strong>
            <p>
              {{ session.title }} · 第 {{ session.index + 1 }} /
              {{ session.questionIds.length }} 题
            </p>
          </div>
          <RouterLink to="/practice?resume=1" class="button button-small"
            >继续练习</RouterLink
          >
        </div>
        <section class="stats-row" aria-label="学习概览">
          <div>
            <span>已练习题目</span
            ><strong
              >{{ store.stats.answered
              }}<small> / {{ bank.questions.length }}</small></strong
            >
          </div>
          <div>
            <span>已标记掌握</span
            ><strong>{{ store.stats.mastered }}<small> 题</small></strong>
          </div>
          <div>
            <span>待巩固问题</span
            ><strong>{{ store.stats.weak }}<small> 题</small></strong
            ><RouterLink class="stat-note" to="/review"
              >查看待复习题目 <AppIcon name="chevron-right" :size="12"
            /></RouterLink>
          </div>
        </section>
        <section class="featured-section">
          <div class="section-heading">
            <div>
              <h2>专题练习</h2>
            </div>
            <RouterLink to="/library" class="text-link"
              >全部 {{ bank.topics.length }} 个专题</RouterLink
            >
          </div>
          <div class="featured-grid">
            <RouterLink
              v-for="(topic, i) in featured"
              :key="topic.id"
              :to="`/practice?mode=quiz&topic=${topic.id}`"
              class="subject-card"
              ><div class="subject-cover" :class="tones[i]">
                <span class="cover-category">{{ topic.category }}</span>
                <div class="cover-title">
                  {{ topic.title }}
                </div>
                <div class="cover-geometry" :class="`geometry-${i}`">
                  <span></span><span></span><span></span>
                </div>
              </div>
              <h3>{{ topic.title }}</h3>
              <div class="subject-meta">
                <span>{{ topic.questionIds.length }} 道题</span
                ><span>{{ topicProgress(topic.questionIds) }}% 已掌握</span>
              </div>
              <div class="tiny-progress">
                <span
                  :style="{ width: topicProgress(topic.questionIds) + '%' }"
                ></span></div
            ></RouterLink>
          </div>
        </section>
        <section class="recent-section">
          <div class="section-heading">
            <h2>最近练习</h2>
            <RouterLink to="/profile" class="text-link">查看记录</RouterLink>
          </div>
          <div v-if="!recent.length" class="empty-recent">
            <AppIcon name="history" :size="25" />
            <div>
              <strong>暂无练习记录</strong>
            </div>
          </div>
          <RouterLink
            v-for="q in recent"
            :key="q.id"
            :to="{ path: '/practice', query: { question: q.id } }"
            class="recent-row"
            ><span class="recent-symbol"
              ><AppIcon
                :name="q.kind === 'oral' ? 'document' : 'bulb'"
                :size="18"
            /></span>
            <div>
              <h3>{{ q.prompt }}</h3>
              <span
                >{{ q.id.startsWith("oral:") ? "专项口述" : "基础练习" }} ·
                {{
                  store.getRecord(q.id).status === "mastered"
                    ? "已掌握"
                    : "继续巩固"
                }}</span
              >
            </div>
            <AppIcon name="chevron-right" :size="16"
          /></RouterLink>
        </section>
      </div>
      <aside class="dashboard-rail">
        <section class="goal-card panel">
          <div class="section-heading">
            <h2>今日目标</h2>
            <RouterLink
              to="/profile"
              aria-label="设置每日目标"
              class="icon-button"
              ><AppIcon name="settings" :size="17"
            /></RouterLink>
          </div>
          <div class="goal-ring" :style="{ '--goal': `${percent * 3.6}deg` }">
            <div>
              <strong
                >{{ store.stats.todayCount
                }}<small> / {{ store.progress.dailyGoal }}</small></strong
              ><span>今日已练习</span>
            </div>
          </div>
          <p class="goal-caption">
            {{
              percent >= 100
                ? "今日目标已完成"
                : `还需练习 ${Math.max(0, store.progress.dailyGoal - store.stats.todayCount)} 题`
            }}
          </p>
          <div class="week-grid">
            <div
              v-for="(day, i) in weekdays"
              :key="i"
              :class="{ today: day.today, done: day.count > 0 }"
              :title="`${day.count} 次练习`"
            >
              <span>{{ day.label }}</span><i
                ><AppIcon v-if="day.count" name="check" :size="13" /><span
                  v-else
                ></span
              ></i>
            </div>
          </div>
        </section>
        <section class="mock-card">
          <div class="mock-heading">
            <h2>模拟面试</h2>
            <AppIcon name="experiment" :size="35" />
          </div>
          <p>跨专题 12 题，结束后查看答案。</p>
          <RouterLink to="/practice?mode=mock" class="button mock-button"
            >进入模拟面试</RouterLink
          >
        </section>
        <section class="rail-links">
          <h2>专项练习</h2>
          <RouterLink to="/resume"
            ><span class="rail-icon peach"><AppIcon name="document" /></span>
            <div>
              <strong>简历对照</strong>
              <p>逐项核对项目与技能</p>
            </div>
            <AppIcon name="chevron-right" :size="14" /></RouterLink
          ><RouterLink to="/library?tab=oral"
            ><span class="rail-icon blue"><AppIcon name="bulb" /></span>
            <div>
              <strong>专项追问</strong>
              <p>{{ bank.chains.length }} 组专项追问</p>
            </div>
            <AppIcon name="chevron-right" :size="14" /></RouterLink
          ><RouterLink to="/review?tab=bookmarks"
            ><span class="rail-icon sage"><AppIcon name="bookmark" /></span>
            <div>
              <strong>收藏题目</strong>
            </div>
            <AppIcon name="chevron-right" :size="14"
          /></RouterLink>
        </section>
        <div class="library-note">
          <AppIcon name="book" :size="18" />
          <p>
            {{ quizQuestions.length }} 道基础题 ·
            {{ oralQuestions.length }} 个口述问题
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
