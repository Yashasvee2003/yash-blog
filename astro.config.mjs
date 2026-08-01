// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified, rehypeHeadingIds } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeTableScroll from './scripts/rehype-table-scroll.mjs';
import rehypeHeadingAnchors from './scripts/rehype-heading-anchors.mjs';

// Astro 7 defaults to the Sätteri markdown processor, which parses `$...$` but
// emits it as <code class="language-math"> without rendering. The notes are
// math-heavy, so we opt back into the unified/remark processor and render with
// KaTeX at build time — no client-side JS, no layout shift.
export default defineConfig({
  // Drives absolute URLs in the sitemap and RSS feed. Update when a custom
  // domain is attached.
  site: 'https://yash-blog.yashasvee2k3.workers.dev',
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [
        [rehypeKatex, { strict: false, throwOnError: false }],
        rehypeTableScroll,
        // Astro assigns heading IDs after user plugins run, so the anchor plugin
        // would see no `id` and skip every heading. Running the ID pass here
        // first fixes the ordering; it is a no-op when Astro repeats it later.
        rehypeHeadingIds,
        rehypeHeadingAnchors,
      ],
      shikiConfig: {
        themes: { light: 'github-light', dark: 'github-dark' },
        wrap: true,
      },
    }),
  },
});
