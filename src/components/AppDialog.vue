<script lang="ts">
// Native dialogs make the background inert; this shared lock also stops touch/wheel scrolling.
let openDialogs = 0;
let previousOverflow = "";
let ownsScrollLock = false;
</script>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{ open: boolean; label: string; side?: "left" | "right" }>(),
  { side: "right" },
);
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const dialog = ref<HTMLDialogElement>();
let trigger: HTMLElement | null = null;
let locked = false;
let backdropPressed = false;

function unlock() {
  if (!locked) return;
  locked = false;
  openDialogs--;
  if (!openDialogs && ownsScrollLock) {
    document.body.style.overflow = previousOverflow;
    ownsScrollLock = false;
  }
}
function close(restoreFocus = true) {
  if (dialog.value?.open) dialog.value.close();
  unlock();
  if (restoreFocus && trigger?.isConnected)
    trigger.focus({ preventScroll: true });
}
async function syncOpen() {
  await nextTick();
  if (!dialog.value) return;
  if (!props.open) {
    close();
    return;
  }
  if (dialog.value.open) return;
  trigger =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  dialog.value.showModal();
  if (!openDialogs) {
    previousOverflow = document.body.style.overflow;
    ownsScrollLock = previousOverflow !== "hidden";
    if (ownsScrollLock) document.body.style.overflow = "hidden";
  }
  openDialogs++;
  locked = true;
}
function requestClose() {
  emit("update:open", false);
}
function backdropClick(event: MouseEvent) {
  if (backdropPressed && event.target === event.currentTarget) requestClose();
  backdropPressed = false;
}
function keydown(event: KeyboardEvent) {
  // A nested dialog must not trigger the practice panel's Escape/Tab handlers.
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    requestClose();
    return;
  }
  if (event.key !== "Tab") return;
  const controls = [
    ...dialog.value!.querySelectorAll<HTMLElement>(
      'a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex]:not([tabindex="-1"])',
    ),
  ].filter(
    (element) => element.tabIndex >= 0 && element.getClientRects().length,
  );
  const first = controls[0],
    last = controls.at(-1);
  if (!first) {
    event.preventDefault();
    dialog.value?.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
watch(() => props.open, syncOpen, { flush: "post" });
onMounted(syncOpen);
onBeforeUnmount(() => close(false));
</script>
<template>
  <dialog
    ref="dialog"
    class="app-dialog"
    :class="'app-dialog-' + side"
    :aria-label="label"
    aria-modal="true"
    tabindex="-1"
    @cancel.stop.prevent="requestClose"
    @keydown="keydown"
    @pointerdown="backdropPressed = $event.target === $event.currentTarget"
    @click="backdropClick"
  >
    <slot />
  </dialog>
</template>
<style scoped>
.app-dialog {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  overflow: hidden;
}
.app-dialog[open] {
  display: flex;
}
.app-dialog-right {
  justify-content: flex-end;
}
.app-dialog-left {
  justify-content: flex-start;
}
.app-dialog::backdrop {
  background: #1c291e44;
}
</style>
