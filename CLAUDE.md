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
- Design pass 2 complete (page width, listing layout, post descriptions, footer links).

### Two widths, not one

`--measure` (68ch) is the reading column; `--page` (66rem) is everything else. Prose stays
narrow deliberately — long lines are harder to read, so widening it would make the writing
worse. Header, footer, and listings use `--page`, because a list of titles and dates has no
reading measure to respect. When adding a component, decide which of the two it belongs to
rather than inventing a third width.

### Descriptions

`description` in a note's frontmatter is what shows under the title on every listing and in
the RSS feed. Write one when publishing. `deriveDescription()` in the sync script is only a
floor: it skips fragments under 60 characters, list markers, fenced code, and bare URLs, and
returns nothing rather than something bad — an empty description beats "client".

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

### ⚠ IMPORTANT — raise all three whenever TODOs are reviewed

These need Yashasvee's input and cannot be done unilaterally. Bring them up every time.

**1. A dedicated blog email, in the footer.** Currently there is no way for a
reader to make contact, which forfeits most of what a blog is practically good for — someone
reads a post and wants to ask a question, offer work, or correct you.

Explicitly **do not use the personal address** (`yashasvee2k3@gmail.com`). It is attached to
banking, GitHub, and everything else; once published it is scraped and cannot be unpublished.
Create something like `yashasvee.blog@gmail.com`, forward it to the main inbox, and use that —
it can be abandoned if it ever drowns in spam. Avoid `+blog` style aliases; scrapers strip them.

Precedent: Marc Brooker publishes a plain Gmail address in his blog footer.

Once the address exists this is a one-line change in `BaseLayout.astro`.

**2. `about.astro` is still placeholder text**, with a literal `TODO` comment in it — on a page
linked from the top nav. Every blog in the research above has a real About page with an actual
bio; it is the cheapest credibility fix available. Needs three or four sentences from
Yashasvee about who he is and what the blog is for. Cannot be invented on his behalf.

**3. Decide on a custom domain.** `site` in `astro.config.mjs` currently points at the
`workers.dev` URL, which works but is not a durable address — every inbound link and RSS
subscriber is tied to it. Settling this also unblocks OG images, which are otherwise done
twice. Cloudflare Registrar sells at cost (~$10/yr).

### 0. Yashasvee to verify the Kubernetes post

`platform-eng/Nobody in Kubernetes talks to anybody else` is live and needs a technical
read-through by someone who knows the material.

**Claims I added that are NOT in the `k8s-core` notes.** Each needs confirming or cutting —
they are my reasoning, not Yashasvee's recorded knowledge:

1. **Why the API-server bottleneck is worth it** — that funnelling everything through one
   process puts authn, authz, validation and versioning in exactly one place, and that the
   alternative would need etcd credentials distributed everywhere. Notes only state the fact
   that the API server alone talks to etcd, never the justification.
2. **Why creating pods and placing pods are separate processes** — framed as a deliberate
   separation of "what should exist" from "where it goes". Notes describe both behaviours but
   never say it is intentional design.
3. **"etcd cluster sizes are always odd numbers"** — follows from quorum, but the notes only
   say "quorum idea used to handle failures".
4. **The term "reconciliation loop"** and the claim that controllers recover from mid-operation
   restarts because they compare state rather than execute plans. Notes describe watch-driven
   controllers but never name or characterise the pattern.
5. **The closing failure-mode section** — that `Pending` means the scheduler found no feasible
   node, and `ContainerCreating` means the kubelet owns it and CNI/volumes/image-pull haven't
   finished. Entirely my inference from the trace; not in the notes at all.
6. **RBAC phrasing** — "Roles that describe what may be done, RoleBindings that attach them to a
   subject." Notes say only "Authorisation enforcement -> using Roles, role binding".
7. **API versions given as `v1`/`v1beta1`** — the notes say "v1, v2".
8. **The Deployment controller "creates pods"** — deliberately simplified. Real path goes via a
   ReplicaSet, which the notes never mention, so I avoided naming it rather than assert it.
   Worth deciding whether to state the full chain.

**Gap left open on purpose.** Under etcd, the post says: *"My notes describe this as a frequent
operational need, and I'll leave it there rather than pretend to more operational scar tissue
than I have."* This is honest but it is a hole where a real compaction or defragmentation story
would be the best paragraph in the piece. Fill it if there is one.

Also worth a voice pass — it was written without any samples of Yashasvee's own writing, so the
register is a guess.

**Attribution:** all ten diagrams are Bibin Wilson's, from
[DevOpsCube](https://devopscube.com/kubernetes-architecture-explained/), credited in a Sources
section at the bottom of the post. **Redrawing them is the better long-term answer** — it settles
the copyright question properly, allows a dark-mode-aware SVG, and is the one differentiator the
blog research identified as actually available in this field. Applies to every vault image, not
just this post: a pasted image in a study vault is frequently someone else's work.

### 0b. Yashasvee to verify the Network Programming post

Rewritten 2026-08-01 from the bullet notes into prose, with four original diagrams.

**Claims added beyond the notes** — confirm or cut:

1. **`listen()` returns immediately** and the backlog is the queue depth before the kernel
   refuses connections. Notes only say it "takes backlog as arg".
2. **"Address already in use" is a key collision**, and two sockets can share a port when the
   rest of the tuple differs. Extrapolated from the notes' hash-table point.
3. **`send()` partial writes** — I generalised to "the return can be smaller than what you
   handed it" and **dropped the notes' "at most around 1K bytes"**, which isn't a real constant.
4. **How `epoll` differs mechanically** — register once, kernel keeps the set, returns only
   ready descriptors. Notes only give the O(n) vs O(1) result.
5. **Why spinning on non-blocking sockets is bad** ("burns a whole core"). Notes just say
   "bad idea".
6. **"Text for almost everything, binary when bandwidth or latency genuinely matter"** — the
   notes list the options without a recommendation.
7. **IPv6 multicast framed as receivers opting in, and called the better design** — opinion.
8. **A socket being a file evidenced by `lsof` and descriptor limits** — mine.

**Content in the notes that did NOT make the post**, in case any should go back in:
`getpeername`, the `shutdown` vs `close` distinction, data encapsulation, and parts of the
TCP/UDP table — flow control and sequence numbers get no explicit mention (retransmission and
congestion backoff do).

**Source attribution:** credited to the [Core Dumped](https://www.youtube.com/@CoreDumpped)
channel, taken from the `os/Welcome` note's own statement that the vault is "based on Core
Dumped youtube channel and general googling". Confirm that's right for this note specifically.

### 0c. Yashasvee to verify the Primary and Backup Replication post

Rewritten 2026-08-02 from bullets into prose, with four original diagrams replacing the MIT
lecture image.

**Claims added beyond the notes** — confirm or cut:

1. **"Works on unmodified operating systems, the guest has no idea"** — true of VMware FT but
   nowhere in the notes.
2. **The state-transfer-vs-RSM framing as "ship the answer / ship the question"** — mine.
3. **The backup described as a running server whose output the hypervisor suppresses**, with
   failover being suppression *stopping*. Notes only say B's VMM does a "go live".
4. **Why multicore is unfixable** — two threads racing for a lock, resolved by timing below
   anything loggable. Notes say only "multicore: **Soln**: only allow unicore!".
5. **"A dead primary and an unreachable one look identical"** — standard, but not in the notes.
6. **Split brain generalised** to "an external arbiter that can only say yes once", plus the
   observation that the arbiter is itself usually a replicated service. Notes describe only the
   test-and-set lock.
7. **The closing thesis** — "a replication scheme is mostly a list of things you have decided
   the machine is no longer allowed to do." Entirely mine, and the strongest claim in the post.
8. **Calling the one-core restriction "a striking amount of performance to trade away"** —
   opinion.

**Compressed from the notes:** the hardware-clock mechanism (primary's clock ticks many times a
second, the VMM turns each into an interrupt to the guest, which is what drives log generation)
is folded into the interrupt-timing section rather than explained separately. Restore it if the
detail matters.

**Attribution:** confirmed by Yashasvee as MIT 6.824 lecture material. The lecture image was
replaced with original diagrams; the course and the VMware FT paper are both cited.

### 1. Post pipeline — ranked (mining pass done 2026-08-01)

All 50 notes were read and scored on three tests: was it worked out rather than copied, did the
existing explanations annoy him, was a diagram drawn because nothing clear existed.

**The through-line worth knowing:** the five strongest notes are all *traces* — a packet through
a network, a request through k8s, a call sequence through the kernel, a replica through failure
modes. That is what this vault produces when something was genuinely worked out, and it is an
underserved format. Most writing in this space explains components; almost none walks a path.

**Written properly.** `platform-eng/Nobody in Kubernetes talks to anybody else` (merges all ten
`k8s-core` notes). `os/Network Programming`.

**Published but still raw bullet notes — highest-value work available.**

1. `sys-design/dist-sys/Primary and Backup Replication` (483w, 23 bullets, no diagrams).
   Angle: deterministic replay is elegant and reality attacks it from five directions —
   interrupts, non-deterministic instructions, multicore, the Output Rule, split brain. The
   multicore answer, "only allow unicore!", is the hook.
2. `ai/3- CNNs` (431w, 19 bullets). Angle: "Conv layer provides equivariance. Pooling provides
   invariance" — a distinction most tutorials blur — plus the What-vs-Where tradeoff.
3. `ai/1-Neural nets` (412w, 26 bullets). Angle: perceptron through to backpropagation.

**Not yet written, ranked.**

1. `platform-eng/cloud/Networking` (779w) — **the best note in the vault.** A hand-traced path
   for one request from a pod in VPC A to a pod in VPC B, every hop annotated. Nobody writes
   that down without having debugged it. Angle: everything that has to be right for two pods in
   different VPCs to talk. **Blocked on 2 Excalidraw exports.**
2. `os/Process` (296w) — the kernel is mapped into every process's address space, which is why
   Meltdown happened, which is why KPTI has two page tables. Absorbs `reads/Meltdown` (25w,
   unpublishable alone). **Blocked on 1 Excalidraw export.**
3. `sys-design/dist-sys/Go Threads and Raft` + `Golang` (600w combined) — four concurrency
   patterns; locks enforcing invariants across a group of variables; channels as a rendezvous
   rather than a queue. Angle: written by someone arriving from a class-based language.
4. `sys-design/Database` — geospatial indexing, quad trees and Hilbert curves. **Blocked on 3
   Excalidraw exports.**
5. `ai/4- Deep Generative models` — why VAEs generate and autoencoders don't. Note contains a
   literal `???` under reconstruction loss; close that before publishing.

**Actively avoid:** `ai/2-RNNs, Transformers, Attention`. Thin on the transformer half, and Jay
Alammar owns that ground completely.

**Never posts:** index/`Welcome` notes (`Gaurav Sen distsys`, `Welcome to distsys`, `control
plane`, `data plane`, `overall architecture`, both `Welcome`s, `Revision`); stubs under ~80
words (`ArgoCD` 14w, `CSI drivers` 20w, `Storage` 23w, `Cluster Autoscaler` 28w, `Load
Balancing` 38w, `Compute` 47w, `API design` 80w); and `Data Consistency` and `Event Driven
Systems`, which both say "needs more notes" in the body.

### 2. Blog research — findings (2026-08-01)

Examined: [Dan Luu](https://danluu.com), [Julia Evans](https://jvns.ca),
[Brandur Leach](https://brandur.org), [Marc Brooker](https://brooker.co.za/blog/),
[Simon Willison](https://simonwillison.net).

**Inspiration, not imitation.** What follows is *why* these choices work, not a layout to copy.
Lifting one wholesale gets a site that looks like someone else's and fits this content badly.

#### What essentially all of them do

- **The wordmark is the home link.** Every one of the five uses the author's name in the
  top-left as the link to `/`. This is the convention, not a mistake — but it works for them
  because the nav *also* contains distinctly-labelled destinations, so nothing is ambiguous.
- **Date + title, in that order, as the listing unit.** Dates lead. Ours now does this.
- **Reverse chronological is the spine**, even where categories exist.
- **RSS is prominent**, usually in both header and footer. Ours is footer-only.
- **A real About page** with an actual bio, linked from the top nav.
- **Contact details in the open.** Marc Brooker puts a plain Gmail address in his footer.

#### Decisions worth stealing

- **Descriptions are optional, and often omitted.** Dan Luu, Marc Brooker, and Julia Evans show
  *only* date and title. Descriptions are not the norm they seem to be. Relevant here: rather
  than fight to write a good description for every note, dropping them from listings is a
  legitimate, well-precedented choice. Keep them in `<meta>` and RSS regardless.
- **Julia Evans' two-tier home page**: the ~10 most recent posts first, *then* the full set
  grouped into 30+ categories. Gets recency and browsability on one page without an archive.
  This suits a site whose value is reference material rather than news — which is what this is.
- **Simon Willison separates content *types*, not just topics** — long entries vs. links vs.
  short notes, each with its own feed, all mixed on the home page. **This is the most relevant
  finding for this blog.** The recurring problem here is that most vault notes are too thin to
  be posts. A separate lightweight "notes" type would let short material ship honestly as
  short material, instead of either padding it or leaving it unpublished forever.
- **Marking standout posts.** Julia Evans stars favourites; Simon Willison curates
  "Highlights". Once there are more than ~15 posts, a flat list stops guiding anyone.
- **Grouping the archive by year** (Marc Brooker) — cheap, and it scales indefinitely.

#### Design references (a separate list, and a correction)

The five above were chosen for *structure*, and several look plainly dated — Dan Luu's is
deliberately near-styleless. That austerity trades on an established reputation; a new blog
does not get the same latitude.

Scoped to this blog's actual subjects (Kubernetes, distributed systems, OS, ML):

- **ML** — [Jay Alammar](https://jalammar.github.io) is the most relevant reference for this
  vault. "The Illustrated Transformer" is the canonical visual explanation of attention;
  compare it against the `ai/2-RNNs, Transformers, Attention` note before expanding that one.
  Also [Lilian Weng](https://lilianweng.github.io) and the [Distill](https://distill.pub)
  archive (dormant since 2021, still a masterclass in interactive explanation).
- **Kubernetes / platform** — [learnk8s](https://learnk8s.io/blog) effectively set the visual
  standard for k8s architecture diagrams; [Ivan Velichko](https://labs.iximiuz.com) for
  container and kernel internals; [Fly.io](https://fly.io/blog) and
  [Cloudflare](https://blog.cloudflare.com) for infra writing with a real design budget.
- **Distributed systems** — [Marc Brooker](https://brooker.co.za/blog/),
  [Jack Vanlightly](https://jack-vanlightly.com) (excellent, but benchmark-and-prose heavy
  rather than visual — do not treat it as a diagram reference),
  [Phil Eaton](https://notes.eatonphil.com).
- **OS / low-level** — [Julia Evans](https://jvns.ca),
  [Brendan Gregg](https://brendangregg.com) (plain site; the charts are the point).

**The finding that matters: well-designed systems blogs barely exist.** Searching specifically
for them turns up plain sites almost everywhere. The exceptions are ML explainers, where the
subject is inherently visual, and company blogs with in-house designers.

So there is no polished Kubernetes blog to model, and chasing one is wasted effort. **The
differentiator available here is diagram quality, not visual chrome.** A plain layout with
genuinely good diagrams beats an ornate layout in this field — which is the same conclusion
the Excalidraw export item already points at.

Content-type split (Maggie Appleton's "Essays vs. Notes", Simon Willison's per-type feeds)
remains the strongest candidate fix for the 46 unpublished notes, independent of visual design.

#### Deliberately not adopting

- **Newsletter signup** (Julia Evans, Brandur). Adds an ongoing obligation; revisit only if
  the blog gets regular readers.
- **Photography / large hero images** (Brandur). His blog is partly a photography site; this
  one is technical reference material.
- **Extremely austere styling** (Dan Luu). It works because of his reputation and volume. A new
  blog with four posts does not get that latitude.

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

- **Diagrams, tables, and code could break out wider than the prose.** The width split below
  is done, but content inside the article is still capped at `--measure`. Screenshots in these
  notes are often ~800px and get downscaled into a ~640px column. Breaking them out needs care
  on post pages, where the ToC occupies the right margin.

- Socials (GitHub, LinkedIn, LeetCode, RSS) render as icons in the header. Adding one means an
  entry in the `socials` array in `BaseLayout.astro` **and** a matching SVG path in
  `SocialLinks.astro`, keyed by the same `label` — a label with no path renders an empty icon.

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
