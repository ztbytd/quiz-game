import { createRouter, createWebHashHistory } from "vue-router";
import DashboardView from "./views/DashboardView.vue";
export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: DashboardView, meta: { title: "学习工作台" } },
    {
      path: "/library",
      component: () => import("./views/LibraryView.vue"),
      meta: { title: "专题题库" },
    },
    {
      path: "/topics/:id",
      component: () => import("./views/TopicView.vue"),
      meta: { title: "专题目录" },
    },
    {
      path: "/practice",
      component: () => import("./views/PracticeView.vue"),
      meta: { title: "专注练习" },
    },
    {
      path: "/review",
      component: () => import("./views/ReviewView.vue"),
      meta: { title: "复习清单" },
    },
    {
      path: "/profile",
      component: () => import("./views/ProfileView.vue"),
      meta: { title: "学习记录" },
    },
    {
      path: "/resume",
      component: () => import("./views/ResumeView.vue"),
      meta: { title: "简历对照" },
    },
    { path: "/map", redirect: "/library" },
    { path: "/home", redirect: "/" },
    { path: "/quiz", redirect: "/practice?resume=1" },
    {
      path: "/practice/:chain",
      redirect: (to) =>
        to.params.chain === "resume-audit"
          ? "/resume"
          : String(to.params.chain).startsWith("track-")
            ? "/library?tab=oral"
            : `/practice?mode=oral&chain=${encodeURIComponent(String(to.params.chain))}`,
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.path === from.path && to.path === "/practice") return {};
    return { top: 0 };
  },
});
router.afterEach((to) => {
  document.title = `${String(to.meta.title || "学习工作台")} · 知序`;
});
