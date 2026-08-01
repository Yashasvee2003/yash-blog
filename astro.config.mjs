// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeTableScroll from './scripts/rehype-table-scroll.mjs';

// Astro 7 defaults to the Sätteri markdown processor, which parses `$...$` but
// emits it as <code class="language-math"> without rendering. The notes are
// math-heavy, so we opt back into the unified/remark processor and render with
// KaTeX at build time — no client-side JS, no layout shift.
export default defineConfig({
  // Update once a custom domain is attached — drives sitemap + RSS absolute URLs.
  site: 'https://yash-blog.pages.dev',
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }], rehypeTableScroll],
      shikiConfig: {
        themes: { light: 'github-light', dark: 'github-dark' },
        wrap: true,
      },
    }),
  },
});
