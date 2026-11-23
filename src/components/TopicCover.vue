<script setup lang="ts">
import {computed} from 'vue';
const props = withDefaults(
  defineProps<{title: string; subtitle?: string; tone?: string; symbol?: string; compact?: boolean}>(),
  {
    subtitle: '',
    tone: '#d8e9df',
    symbol: '{ }',
    compact: false,
  },
);
const displaySymbol = computed(() => {
  if (/JavaScript/.test(props.title)) return 'JS';
  if (/TypeScript|JS.*TS/.test(props.title)) return 'TS';
  if (/React/.test(props.title)) return 'R';
  if (/Vue/.test(props.title)) return 'V';
  const marks: Record<string, string> = {
    code: '{ }',
    branches: '◇',
    safety: '◎',
    database: 'DB',
    cluster: '∑',
    layout: 'CSS',
    global: 'HTTP',
    server: 'N',
    cloud: 'CI',
    robot: 'AI',
    bulb: 'AI',
    file: 'DOC',
    book: 'Q&A',
    project: 'PRJ',
    video: '▶',
    tool: '+',
    experiment: 'AI',
    api: 'API',
    team: '◎',
    audit: '✓',
    rocket: '↑',
    fund: '¥',
    wallet: '¥',
    swap: '⇄',
    lock: '◎',
    account: '¥',
    play: '▶',
    appstore: '▦',
    check: '✓',
    message: 'Q&A',
  };
  return marks[props.symbol] || (props.symbol.length > 5 ? 'Q&A' : props.symbol);
});
</script>

<template>
  <div class="topic-cover" :class="{compact}" :style="{'--cover-tone': tone}" aria-hidden="true">
    <div class="cover-spine"></div>
    <div class="cover-print">
      <span class="cover-kicker">INTERVIEW STUDIES</span>
      <span class="cover-symbol">{{ displaySymbol }}</span>
      <span class="cover-title">{{ title }}</span>
      <span class="cover-subtitle">{{ subtitle || '理解 · 推演 · 表达' }}</span>
    </div>
    <svg class="cover-pattern" viewBox="0 0 200 200" fill="none">
      <circle cx="128" cy="99" r="67" />
      <circle cx="128" cy="99" r="48" />
      <path d="M-10 170 190-30M12 192 212-8M35 215 235 15" />
    </svg>
    <span class="cover-edition">FRONTEND / FIELD NOTES</span>
  </div>
</template>

<style scoped>
.topic-cover {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  aspect-ratio: 1.52;
  background: var(--cover-tone);
  color: #193e34;
  border-radius: 7px 11px 11px 7px;
  box-shadow:
    inset 1px 0 0 #ffffff90,
    inset -1px 0 0 #15392b10;
}
.cover-spine {
  position: absolute;
  inset: 0 auto 0 0;
  width: 13px;
  border-right: 1px solid #203b3024;
  background: #ffffff24;
  box-shadow: 4px 0 8px #263e3306;
}
.cover-print {
  position: relative;
  z-index: 1;
  height: 100%;
  padding: 20px 24px 30px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.cover-kicker {
  font-size: 10px;
  letter-spacing: 0.15em;
  line-height: 1.4;
  opacity: 0.7;
  font-weight: 650;
}
.cover-symbol {
  font:
    600 34px/1.2 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  margin-top: 8px;
  letter-spacing: -0.06em;
}
.cover-title {
  font-size: 19px;
  line-height: 1.4;
  font-weight: 700;
  max-width: 90%;
  margin-top: auto;
  text-wrap: balance;
}
.cover-subtitle {
  font-size: 11px;
  opacity: 0.72;
  line-height: 1.6;
}
.cover-pattern {
  position: absolute;
  width: 175px;
  height: 175px;
  right: -32px;
  top: 0;
  z-index: -1;
  stroke: currentColor;
  stroke-width: 0.8;
  opacity: 0.16;
}
.cover-edition {
  position: absolute;
  bottom: 10px;
  left: 25px;
  font:
    8px/1.3 ui-monospace,
    monospace;
  letter-spacing: 0.1em;
  opacity: 0.5;
}
.compact {
  aspect-ratio: 0.76;
  min-width: 82px;
}
.compact .cover-print {
  padding: 16px 17px 20px;
  gap: 6px;
}
.compact .cover-kicker,
.compact .cover-subtitle,
.compact .cover-edition {
  display: none;
}
.compact .cover-symbol {
  font-size: 25px;
}
.compact .cover-title {
  font-size: 13px;
}
.compact .cover-pattern {
  right: -85px;
  top: -10px;
}
@media (max-width: 520px) {
  .topic-cover:not(.compact) {
    aspect-ratio: 1.18;
  }
  .cover-print {
    padding: 16px 17px 17px;
    gap: 4px;
  }
  .cover-symbol {
    font-size: 27px;
    margin-top: 8px;
  }
  .cover-title {
    font-size: 15px;
    max-width: 100%;
  }
  .cover-kicker {
    font-size: 9px;
  }
  .cover-subtitle,
  .cover-edition {
    display: none;
  }
  .cover-pattern {
    width: 145px;
    height: 145px;
  }
}
</style>
