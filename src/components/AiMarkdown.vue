<script setup lang="ts">
import MarkdownIt from "markdown-it";
import { computed } from "vue";
const props = defineProps<{ text: string }>();
const md = new MarkdownIt({ html: false, linkify: false, breaks: true });
md.disable("image");
md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  tokens[index]!.attrSet("target", "_blank");
  tokens[index]!.attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, index, options);
};
const html = computed(() => md.render(props.text));
</script>
<template><div class="ai-markdown" v-html="html"></div></template>
<style>
.ai-markdown {
  line-height: 1.85;
  overflow-wrap: anywhere;
  font-size: 1rem;
  color: var(--text);
}
.ai-markdown p + p,
.ai-markdown p + ul,
.ai-markdown p + ol,
.ai-markdown pre,
.ai-markdown blockquote {
  margin-top: 1em;
}
.ai-markdown h1,
.ai-markdown h2,
.ai-markdown h3 {
  font-size: 1.12rem;
  line-height: 1.6;
  margin: 1.5em 0 0.65em;
}
.ai-markdown h1:first-child,
.ai-markdown h2:first-child,
.ai-markdown h3:first-child {
  margin-top: 0;
}
.ai-markdown ul,
.ai-markdown ol {
  padding-left: 1.5em;
}
.ai-markdown li + li {
  margin-top: 0.45em;
}
.ai-markdown pre {
  background: #f0f3ef;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px;
  overflow: auto;
  white-space: pre;
  max-width: 100%;
  font-size: 0.875rem;
  line-height: 1.7;
}
.ai-markdown code {
  font-family: ui-monospace, Consolas, monospace;
}
.ai-markdown :not(pre) > code {
  background: #edf1ec;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 0.9em;
}
.ai-markdown blockquote {
  border-left: 3px solid #aec1b0;
  padding-left: 16px;
  color: #5f7166;
  margin-left: 0;
}
.ai-markdown table {
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 0.9rem;
  margin: 18px 0;
}
.ai-markdown th,
.ai-markdown td {
  border: 1px solid var(--border);
  padding: 8px 12px;
}
.ai-markdown a {
  color: var(--primary);
  text-decoration: underline;
}
.ai-markdown hr {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 24px 0;
}
</style>
