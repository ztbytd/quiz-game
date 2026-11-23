import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "/quiz/",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    vue(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "app-icon.svg",
        "icon-192.png",
        "icon-512.png",
        "third-party-notices.txt",
      ],
      manifest: {
        id: "/quiz/",
        name: "知序 · 面试练习",
        short_name: "知序",
        description: "前端题库、口述追问、模拟面试与复习记录。",
        lang: "zh-CN",
        start_url: "/quiz/#/",
        scope: "/quiz/",
        display: "standalone",
        theme_color: "#23634c",
        background_color: "#f7f9f7",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        shortcuts: [
          { name: "专题题库", url: "/quiz/#/library" },
          { name: "复习清单", url: "/quiz/#/review" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json,woff2}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "index.html",
        navigateFallbackAllowlist: [/^\/quiz(?:\/|$)/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith("/data/bank.json")) return "question-bank";
          if (/node_modules[\\/](?:@vue|vue|vue-router|pinia)[\\/]/.test(id))
            return "vue";
        },
      },
    },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
