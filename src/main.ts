import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import "./styles/global.css";
import "./styles/dashboard.css";
// Keep bookmarks to the previous app usable without changing the origin or its stored data.
if (location.hash && !location.hash.startsWith("#/"))
  history.replaceState(
    null,
    "",
    location.pathname + location.search + "#/" + location.hash.slice(1),
  );
createApp(App).use(createPinia()).use(router).mount("#app");
