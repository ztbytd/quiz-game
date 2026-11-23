<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useRegisterSW } from "virtual:pwa-register/vue";
import AppIcon from "./components/AppIcon.vue";
import { useLearningStore } from "./stores/learning";
import { syncContent } from "./data/content";
import { useAiStore } from "./stores/ai";

const appBase = import.meta.env.BASE_URL;
const route = useRoute(),
  router = useRouter(),
  learning = useLearningStore();
const search = ref(""),
  online = ref(navigator.onLine),
  fatal = ref("");
const installHelp = ref<HTMLDialogElement | null>(null);
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
const installEvent = ref<InstallPrompt | null>(null);
const installed = ref(matchMedia("(display-mode: standalone)").matches);
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisterError: () => {},
});
const nav = [
  { to: "/", label: "学习工作台", icon: "home" },
  { to: "/library", label: "专题题库", icon: "library" },
  { to: "/ai", label: "AI", icon: "chat" },
  { to: "/review", label: "复习清单", icon: "review" },
  { to: "/practice?mode=mock", label: "模拟面试", icon: "experiment" },
];
const mobileNav = [
  ...nav.map((item) => ({
    ...item,
    label:
      (
        {
          学习工作台: "学习",
          专题题库: "题库",
          复习清单: "复习",
          模拟面试: "模拟",
        } as Record<string, string>
      )[item.label] || item.label,
  })),
];
const focused = computed(() => route.path === "/practice");
const aiPage = computed(() => route.path.startsWith("/ai"));
const today = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(new Date());
function active(to: string) {
  return to.includes("?")
    ? route.path === "/practice" && route.query.mode === "mock"
    : route.path === to ||
        (to === "/ai" && route.path.startsWith("/ai/")) ||
        (to === "/library" && route.path.startsWith("/topics/"));
}
function find() {
  router.push({
    path: "/library",
    query: search.value.trim() ? { q: search.value.trim() } : {},
  });
}
function connection() {
  online.value = navigator.onLine;
}
function captureInstall(event: Event) {
  event.preventDefault();
  installEvent.value = event as InstallPrompt;
}
function markInstalled() {
  installed.value = true;
  installEvent.value = null;
}
async function install() {
  if (installEvent.value) {
    await installEvent.value.prompt();
    await installEvent.value.userChoice;
    installEvent.value = null;
  } else installHelp.value?.showModal();
}
function shortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.getElementById("global-search")?.focus();
  }
}
async function update() {
  try {
    await learning.exportData();
    if (learning.persistError) throw new Error("Save incomplete");
    await updateServiceWorker(true);
  } catch {
    fatal.value = "暂时无法保存当前记录，请先导出备份，再更新。";
  }
}
function reload() {
  location.reload();
}
async function downloadBackup() {
  const data = await learning.exportData();
  const url = URL.createObjectURL(
    new Blob([data], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "interview-study-backup.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
onMounted(async () => {
  addEventListener("online", connection);
  addEventListener("offline", connection);
  addEventListener("beforeinstallprompt", captureInstall);
  addEventListener("appinstalled", markInstalled);
  addEventListener("keydown", shortcut);
  try {
    await learning.init();
    void syncContent().catch(() => {});
    void useAiStore().init();
  } catch {
    fatal.value = "读取学习记录时出现问题，请刷新重试。原有记录没有被清除。";
  }
});
onUnmounted(() => {
  removeEventListener("online", connection);
  removeEventListener("offline", connection);
  removeEventListener("beforeinstallprompt", captureInstall);
  removeEventListener("appinstalled", markInstalled);
  removeEventListener("keydown", shortcut);
});
</script>
<template>
  <a class="skip-link" href="#main-content">跳转到内容</a>
  <div class="app-shell" :class="{ 'is-focused': focused, 'is-ai': aiPage }">
    <aside class="sidebar">
      <RouterLink class="brand" to="/" aria-label="知序，返回学习工作台"
        ><img :src="`${appBase}app-icon.svg`" alt="" width="38" height="38" />
        <div>
          <strong>知序<span>面试练习</span></strong>
        </div></RouterLink
      >
      <div class="nav-caption">学习空间</div>
      <nav class="side-nav" aria-label="主要导航">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          :class="{ selected: active(item.to) }"
          ><AppIcon :name="item.icon" :size="20" /><span>{{ item.label }}</span
          ><span
            v-if="item.to === '/review' && learning.stats.weak"
            class="nav-count"
            >{{ learning.stats.weak }}</span
          ></RouterLink
        >
      </nav>
      <div class="nav-caption second-caption">我的准备</div>
      <nav class="side-nav" aria-label="个人学习">
        <RouterLink to="/resume" :class="{ selected: active('/resume') }"
          ><AppIcon name="document" /><span>简历对照</span></RouterLink
        ><RouterLink to="/profile" :class="{ selected: active('/profile') }"
          ><AppIcon name="history" /><span>学习记录</span></RouterLink
        >
      </nav>
      <div v-if="aiPage" id="ai-history-slot"></div>
      <div class="sidebar-bottom">
        <div class="install-card">
          <div class="install-icon"><AppIcon name="download" :size="22" /></div>
          <strong>{{ installed ? "已添加到主屏幕" : "安装应用" }}</strong>
          <button
            v-if="!installed"
            class="button button-small"
            @click="install"
          >
            安装知序</button
          ><span v-else class="muted small">打开应用即可继续学习</span>
        </div>
        <div class="local-label">
          <span class="local-mark"></span>学习记录保存在本机
        </div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <RouterLink to="/" class="mobile-brand"
          ><img
            :src="`${appBase}app-icon.svg`"
            alt=""
            width="29"
            height="29"
          /><strong>知序</strong></RouterLink
        ><span class="breadcrumb"
          >我的学习空间 <span>/</span>
          <strong>{{ route.meta.title }}</strong></span
        >
        <form class="global-search" role="search" @submit.prevent="find">
          <AppIcon name="search" :size="18" /><input
            id="global-search"
            v-model="search"
            aria-label="搜索题目与知识点"
            placeholder="搜索题目、知识点…"
          /><kbd>⌘ K</kbd>
        </form>
        <div class="topbar-right">
          <span class="date-label">{{ today }}</span><RouterLink
            to="/profile"
            class="profile-dot"
            aria-label="学习记录"
            ><AppIcon name="profile" :size="18"
          /></RouterLink>
        </div>
      </header>
      <div v-if="!online" class="connection-banner" role="status">
        <AppIcon
          name="offline"
          :size="16"
        />当前离线，已缓存的题目仍可练习，记录继续保存在本机。
      </div>
      <div
        v-if="learning.persistError || fatal"
        class="error-banner"
        role="alert"
      >
        {{ learning.persistError || fatal }}
      </div>
      <main id="main-content" class="main-content" tabindex="-1">
        <div v-if="!learning.ready" class="loading-view" role="status">
          <span class="loader"></span>
          <h2>正在整理你的学习空间</h2>
          <p class="muted">读取题库与学习记录</p>
        </div>
        <section
          v-else-if="learning.readOnly"
          class="readonly-view panel"
          role="status"
        >
          <AppIcon name="document" :size="32" />
          <h1>此窗口暂时无法编辑</h1>
          <p>{{ learning.readonlyReason }}</p>
          <div>
            <button class="button button-primary" @click="reload">
              刷新并继续</button
            ><button class="button" @click="downloadBackup">
              导出当前备份
            </button>
          </div>
        </section>
        <RouterView v-else v-slot="{ Component }"
          ><component :is="Component"
        /></RouterView>
      </main>
      <footer v-if="!focused" class="page-footer">
        <a
          :href="`${appBase}third-party-notices.txt`"
          target="_blank"
          rel="noopener"
          >开源许可</a
        ><button v-if="!installed" class="footer-action" @click="install">
          添加到主屏幕</button
        ><span v-if="offlineReady">已准备好离线练习</span>
      </footer>
    </div>
    <nav class="bottom-nav" aria-label="手机导航">
      <RouterLink
        v-for="item in mobileNav"
        :key="item.to"
        :to="item.to"
        :class="{ selected: active(item.to) }"
        ><AppIcon :name="item.icon" :size="21" /><span>{{
          item.label
        }}</span></RouterLink
      >
    </nav>
  </div>
  <div v-if="needRefresh" class="update-toast" role="status">
    <AppIcon name="refresh" /><span>新版本已准备好</span
    ><button class="button button-primary button-small" @click="update">
      保存并更新</button
    ><button
      class="icon-button"
      aria-label="稍后更新"
      @click="needRefresh = false"
    >
      <AppIcon name="close" />
    </button>
  </div>
  <dialog ref="installHelp" class="install-dialog">
    <button
      class="icon-button dialog-close"
      aria-label="关闭安装说明"
      @click="installHelp?.close()"
    >
      <AppIcon name="close" /></button
    ><img :src="`${appBase}app-icon.svg`" width="56" height="56" alt="" />
    <h2>把知序添加到主屏幕</h2>
    <p>
      在 Chrome 或 Edge
      中，使用地址栏的安装按钮，或打开浏览器菜单，选择“安装应用”。
    </p>
    <p>在 iPhone 的 Safari 中，点“分享”，然后选择“添加到主屏幕”。</p>
    <p class="muted">
      首次联网打开后，题库可离线使用。安装能力以当前浏览器支持为准。
    </p>
    <button class="button button-primary" @click="installHelp?.close()">
      知道了
    </button>
  </dialog>
</template>
