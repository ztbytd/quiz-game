import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import { createStreamText } from "../domain/stream-text";

export function useStreamText(
  text: Ref<string>,
  active: Ref<boolean>,
  identity: Ref<string>,
) {
  const displayed = ref("");
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const presenter = createStreamText(
    (value) => {
      displayed.value = value;
    },
    {
      now: () => performance.now(),
      request: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
    },
  );
  const synchronize = () => {
    presenter.immediate(document.hidden || preference.matches);
    // Hidden tabs do not keep an animation backlog for the next foreground visit.
    if (!document.hidden) presenter.flush();
  };
  synchronize();
  document.addEventListener("visibilitychange", synchronize);
  preference.addEventListener("change", synchronize);
  watch(
    [text, active, identity],
    ([value, running, key], previous) => {
      const changed = !!previous && key !== previous[2];
      presenter.update(value, !running || changed);
    },
    { immediate: true, flush: "sync" },
  );
  onBeforeUnmount(() => {
    presenter.dispose();
    document.removeEventListener("visibilitychange", synchronize);
    preference.removeEventListener("change", synchronize);
  });
  return displayed;
}
