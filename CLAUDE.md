# blog

Two sibling directories with a one-way relationship:

```
blog/
├── obsidian-notes/     5 Obsidian vaults — the source of truth for all content
└── yash-blog/          Astro site — its own git repo, this is what gets deployed
```

`obsidian-notes/` is **not** part of the deployed repo and is never read at build time by
the host. Content moves one way only: vault → sync script → `yash-blog/src/content/posts/`
→ commit → push → Cloudflare rebuilds.

**Live at https://yash-blog.yashasvee2k3.workers.dev**

## The notes are pointers, not drafts

This is the single most important thing to understand about this project.

`obsidian-notes/` is a personal study vault — handwritten notes taken while learning, kept
terse on purpose. Across 50 notes there are roughly 7,150 words, averaging ~143 each: mostly
bullet fragments, diagrams, and shorthand that mean something to the person who wrote them
and very little to a stranger.

So **a note is a prompt for a post, not a draft of one.** The sync pipeline moves a note onto
the site verbatim; it cannot supply the connective tissue, the motivating problem, the worked
example, or the "why does this matter" that turns a list of facts into something worth
reading. That is writing work, and it happens per-post.

Practical consequences:

- Do not bulk-flip `publish: true`. Publishing 50 stubs makes a worse blog than publishing 5
  real posts.
- Expect a published post to be several times longer than the note that seeded it. The note
  supplies the skeleton and the diagrams; the prose is new.
- When expanding a note, never invent technical claims to pad it. If a bullet is too terse to
  expand faithfully, that is a signal to go re-learn the topic, not to guess.
- Some notes will never be posts. Index/`Welcome` notes and one-line stubs are vault
  furniture, and that's fine.

Never edit anything in `yash-blog/src/content/posts/` or `yash-blog/src/assets/notes/`.
Both directories are wiped and regenerated on every `npm run sync`. Fix the source note in
the vault instead.

## Vaults → categories

Each top-level directory in `obsidian-notes/` is a separate Obsidian vault (each has its own
`.obsidian/`) and maps to one site category. Subdirectories inside a vault are organisational
only — they are flattened away, and the URL is always `/posts/<vault>/<slug>/`.

| Vault | Category label |
|---|---|
| `sys-design` | Systems Design |
| `platform-eng` | Platform Engineering |
| `os` | Operating Systems |
| `ai` | Machine Learning |
| `reads` | Paper Reads |

Adding a vault means adding it to `VAULTS` in both scripts *and* to `CATEGORIES` in
`src/content.config.ts`. The Zod schema will fail the build if a post has a category that
isn't listed there — that's intentional.

## Publishing workflow

Every note carries frontmatter with `publish: false` by default. Nothing reaches the site
until that flag is flipped.

```bash
# 1. In Obsidian: write the note, set `publish: true` in its frontmatter
# 2. Pull it into the site
cd yash-blog && npm run sync
# 3. Check it locally
npm run dev
# 4. Ship
git add -A && git commit -m "post: <title>" && git push
```

**`npm run build` deliberately does not run sync.** The vault is not in the deployed repo, so
it does not exist on Cloudflare's builder. Generated posts are committed instead, and `build`
only compiles what is already in the repo. Sync is a local step you run before committing.

(`scripts/sync-notes.mjs` also exits early and touches nothing when the vault is missing, so
a stray `sync` on CI can't wipe the committed content and deploy an empty site.)

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | `astro build` only — this is the Cloudflare build command |
| `npm run publish` | `sync` + `build`, for checking the full local pipeline |
| `npm run sync` | Vault → content collection, only `publish: true` notes |
| `npm run sync:all` | Same, ignoring publish flags (preview everything) |
| `npm run sync:dry` | Report what would happen, write nothing |
| `npm run notes:init` | Add frontmatter to vault notes that lack it (dry run; `-- --write` applies) |

## What the sync script handles

`scripts/sync-notes.mjs` translates Obsidian-flavoured markdown into standard markdown:

- **Image embeds** — `![[foo.png]]` resolves against a vault-wide filename index, exactly
  like Obsidian does. Files are slugified (spaces break markdown paths) and copied into
  `src/assets/notes/<vault>/`, so Astro optimises them into WebP with intrinsic dimensions.
- **Width hints** — `![[foo.png|700]]` drops the width. Those were sized for the Obsidian
  editor pane; the site constrains images with CSS instead.
- **Wikilinks** — `[[Note]]` / `[[Note|alias]]` / `[[Note#heading]]` become real links when
  the target is also published. When it isn't, the link degrades to plain text rather than
  producing a dead link, and sync prints a warning.
- **Highlights** — `==text==` becomes `<mark>`.
- **Excalidraw** — see below.
- **Frontmatter** — `title` falls back to the filename, `date` to the file's birthtime,
  `description` to the first real paragraph.

Sync warnings are not fatal but should be read. Unresolved embeds become HTML comments in
the output, so a broken image is invisible on the page — the warning is the only signal.

## Excalidraw drawings

The 8 drawings in the vaults are stored by the Obsidian Excalidraw plugin as
`compressed-json` inside `.md` files. There is no exported raster image, and nothing in the
build pipeline can render that format.

To publish a note containing one: open the drawing in Obsidian, **Export as PNG** into the
same vault, then re-run sync. The script looks for `<drawing name>.png` beside it and picks
it up automatically. Until then the embed becomes an HTML comment and sync warns.

Affected notes: `sys-design/Caching`, `sys-design/DataStores`, `sys-design/Database`,
`platform-eng/cloud/Networking`, `os/Cache`, `os/Process`.

## Markdown processor

Astro 7 defaults to the Sätteri processor, which parses `$...$` but emits it as
`<code class="language-math">` without rendering. The notes are heavy on LaTeX, so
`astro.config.mjs` opts back into the unified/remark processor via `unified()` from
`@astrojs/markdown-remark` and renders math with KaTeX at build time — no client-side JS,
no layout shift.

If you ever remove `remark-math`/`rehype-katex`, drop the `processor` override too and let
Sätteri handle it — but math will stop rendering.

## Deployment

Cloudflare **Workers** (Workers Builds), connected to the `yash-blog` GitHub repo. Cloudflare
now routes new projects through Workers rather than Pages; `wrangler.jsonc` declares an
assets-only Worker, so there is no `main` script and every request is served directly from
`dist` by the asset layer.

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy | `npx wrangler versions upload` |
| Production branch | `main` |

The output directory is not configured in the dashboard — it comes from `assets.directory`
in `wrangler.jsonc`. A failed build leaves the previous deploy live.

`public/_headers` sets immutable caching on hashed assets; Workers static assets honours it.

`site` in `astro.config.mjs` must be updated when a custom domain is attached — it drives
absolute URLs in the sitemap and RSS feed. It currently points at the `.pages.dev` placeholder
and is therefore **wrong** — the real URL is the `workers.dev` one above. Worth fixing
whenever the domain question is settled.

If the dashboard ever shows `workers.dev` as "Disabled" while the site is plainly reachable,
trust the site. `curl -sI <url>` from outside the browser settles it. `workers_dev: true` is
pinned in `wrangler.jsonc` to stop the two from disagreeing.

## Status — 2026-08-01

Working and deployed. Pipeline, hosting, and a first design pass are all done; what remains
is editorial rather than technical.

- Site live at https://yash-blog.yashasvee2k3.workers.dev via Cloudflare Workers, auto-deploying
  from `main`.
- 4 of 50 notes published (`ai/1-Neural nets`, `ai/3- CNNs`, `os/Network Programming`,
  `sys-design/dist-sys/Primary and Backup Replication`). The other 46 sit at `publish: false`
  by design — see the pointer-notes section above before flipping more.
- Sync pipeline handles every Obsidian convention found in the vaults: 83 images resolved,
  27 wikilinks, LaTeX via KaTeX. Only Excalidraw needs manual PNG export.
- Design pass 1 complete (ToC, heading permalinks, prev/next, reading time, dark mode toggle).

**Next session should probably start with TODO 1** — the technical work has outrun the
content, and 4 posts is thin. Deciding *what to write* is now the bottleneck, not tooling.

### Where this file lives

The real file is `yash-blog/CLAUDE.md`, inside the git repo, so it is versioned and travels
with a clone. `blog/CLAUDE.md` is a **symlink** to it, so the guidance still loads when the
working directory is `blog/` rather than `blog/yash-blog/`.

Edit either path — they are the same file. Don't replace the symlink with a copy, or the two
will drift.

## TODO

Roughly in priority order. Nothing here is urgent — the pipeline works and the site is live.

### 1. Mine the notes for post ideas

Read through the vaults and pick out which notes have a real post inside them, rather than
publishing what happens to be longest. Good signals: a note where you worked something out
rather than copied it down; a topic where the existing internet explanations annoyed you; a
diagram you drew because nothing existing was clear enough.

Worth doing as an explicit pass with an output — a ranked list of candidate posts with a
one-line angle for each — rather than deciding note-by-note at publish time. The strongest
current candidates by substance are `platform-eng/cloud/Networking`, `os/Network Programming`,
`sys-design/dist-sys/Primary and Backup Replication`, and the `ai/` series, but substance and
"has an angle" are different tests.

The `k8s-core/` notes are individually thin but collectively cover a whole architecture —
they may work better merged into one substantial piece than as ten stubs.

### 2. Study blogs worth imitating

Pull apart what actually makes technical blogs good, and write the conclusions down here so
they inform later decisions instead of being re-derived. Things to look at deliberately:
opening paragraphs (how fast do they establish why you should care), diagram density, post
length distribution, how series are structured, whether they use a newsletter.

Reference points in this space: Dan Luu, Julia Evans, Brendan Gregg, Marc Brooker, Aphyr,
Fly.io's blog, Cloudflare's engineering blog.

### 3. Improve the design

The theme started deliberately minimal so content could ship. First pass of improvements is
**done** (2026-08-01):

- Table of contents — sticky sidebar at ≥1080px, inline above the article below that. Renders
  only when a post has ≥3 h2/h3 headings, so short posts aren't cluttered.
- Heading permalinks on h2–h4, revealed on hover, reachable by keyboard.
- Prev/next navigation, chronological across all posts (not per-category — with few posts per
  category most links would be dead ends).
- Reading time, computed with LaTeX and image syntax stripped first so a page of KaTeX doesn't
  inflate the estimate.

Still open:

- No related posts.
- No syntax-highlighting stress test — the notes are light on code blocks, so Shiki's output
  has barely been exercised.
- Excalidraw diagrams render as PNGs on a white card; a dark-mode-aware SVG export would look
  considerably better.
- `about.astro` is placeholder text with a TODO comment in it.
- No OG images, so links unfurl bare on social. Best done once the domain is settled.

**Theming:** the site follows `prefers-color-scheme` by default; the header toggle stores an
override in `localStorage` as `data-theme` on `<html>`. Two rules matter if you touch it:

1. Any dark styling must be written **twice** — once inside
   `@media (prefers-color-scheme: dark)` scoped with `:root:not([data-theme='light'])`, and
   once under `:root[data-theme='dark']`. A bare media query would ignore a reader on a dark
   OS who explicitly chose light. The duplication is the point, not an oversight.
2. The theme is applied by an inline `is:inline` script in `<head>`, before any stylesheet.
   Moving or deferring it causes a flash of the wrong theme on every navigation.

Toggling back to the system default deletes the override rather than pinning it, so the page
resumes following the OS if the reader changes it there later.

**Gotcha worth remembering:** Astro assigns heading IDs *after* user rehype plugins run. Any
plugin that needs `node.properties.id` must import `rehypeHeadingIds` from
`@astrojs/markdown-remark` and list it ahead of itself, as `astro.config.mjs` does. Without
that, the plugin silently no-ops — it doesn't error, it just does nothing.

### 4. Smaller loose ends

- Decide on a custom domain, then fix `site` in `astro.config.mjs`.
- Export the 8 Excalidraw drawings to PNG so the six notes that embed them can be published.
- The vault has no backup — consider making `obsidian-notes/` its own private git repo.
