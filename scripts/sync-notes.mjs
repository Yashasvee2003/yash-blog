#!/usr/bin/env node
/**
 * Sync publishable Obsidian notes into the Astro content collection.
 *
 *   node scripts/sync-notes.mjs            # sync notes with `publish: true`
 *   node scripts/sync-notes.mjs --all      # sync every note, ignoring the publish flag
 *   node scripts/sync-notes.mjs --dry-run  # report what would happen, write nothing
 *
 * The vault is the source of truth. src/content/posts and src/assets/notes are
 * generated output: this script wipes and rebuilds them on every run, so never
 * hand-edit anything in there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const VAULT_ROOT = path.resolve(ROOT, '../obsidian-notes');
const POSTS_OUT = path.join(ROOT, 'src/content/posts');
const ASSETS_OUT = path.join(ROOT, 'src/assets/notes');

const VAULTS = ['sys-design', 'platform-eng', 'os', 'ai', 'reads'];
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif']);

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has('--dry-run');
const ALL = argv.has('--all');

const warnings = [];
const warn = (msg) => warnings.push(msg);

/** Obsidian note title / filename -> URL-safe slug. */
function slugify(input) {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Keep the extension, slugify the stem — image filenames must survive as paths. */
function slugifyFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  return `${slugify(path.basename(filename, path.extname(filename)))}${ext}`;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.obsidian' || entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pass 1 — index every vault: images by filename, notes by title.
// Obsidian resolves `![[foo.png]]` by searching the whole vault, so we do too.
// ---------------------------------------------------------------------------

/** vault -> Map<lowercased filename, absolute path> */
const imageIndex = new Map();
/** vault -> Map<lowercased note title, {abs, vault}> */
const noteIndex = new Map();
/** Excalidraw drawing names (they live in Excalidraw/ and are not real notes). */
const excalidrawNames = new Map();

const noteFiles = [];

for (const vault of VAULTS) {
  const vaultDir = path.join(VAULT_ROOT, vault);
  if (!fs.existsSync(vaultDir)) {
    warn(`vault "${vault}" not found at ${vaultDir} — skipped`);
    continue;
  }

  const images = new Map();
  const notes = new Map();
  const drawings = new Map();
  imageIndex.set(vault, images);
  noteIndex.set(vault, notes);
  excalidrawNames.set(vault, drawings);

  for (const abs of walk(vaultDir)) {
    const ext = path.extname(abs).toLowerCase();
    const base = path.basename(abs);

    if (IMAGE_EXT.has(ext)) {
      images.set(base.toLowerCase(), abs);
      continue;
    }
    if (ext !== '.md') continue;

    const stem = path.basename(abs, '.md');
    // Excalidraw drawings are .md files holding compressed JSON, not prose.
    if (abs.includes(`${path.sep}Excalidraw${path.sep}`) || stem.endsWith('.excalidraw')) {
      drawings.set(stem.replace(/\.excalidraw$/, '').toLowerCase(), abs);
      drawings.set(stem.toLowerCase(), abs);
      continue;
    }

    notes.set(stem.toLowerCase(), { abs, vault, stem });
    noteFiles.push({ abs, vault, stem });
  }
}

// ---------------------------------------------------------------------------
// Pass 2 — decide what publishes, so wikilinks know which targets exist.
// ---------------------------------------------------------------------------

const published = new Map(); // `${vault}:${lowercased stem}` -> { slug, url, title }
const queue = [];

for (const note of noteFiles) {
  const raw = fs.readFileSync(note.abs, 'utf8');
  const { data, content } = matter(raw);

  if (!ALL && data.publish !== true) continue;

  const stat = fs.statSync(note.abs);
  const title = data.title ?? note.stem;
  const slug = data.slug ? slugify(String(data.slug)) : slugify(note.stem);
  const url = `/posts/${note.vault}/${slug}/`;

  published.set(`${note.vault}:${note.stem.toLowerCase()}`, { slug, url, title });
  queue.push({ ...note, data, content, stat, title, slug, url });
}

// ---------------------------------------------------------------------------
// Pass 3 — transform and emit.
// ---------------------------------------------------------------------------

/** Resolve a wikilink target across the note's own vault first, then all vaults. */
function resolvePublishedNote(target, vault) {
  const key = target.toLowerCase();
  const own = published.get(`${vault}:${key}`);
  if (own) return own;
  for (const v of VAULTS) {
    const hit = published.get(`${v}:${key}`);
    if (hit) return hit;
  }
  return null;
}

/** Copy an image into src/assets and return the path to use from a post file. */
const copiedAssets = new Set();
function emitAsset(absSource, vault) {
  const outName = slugifyFilename(path.basename(absSource));
  const outAbs = path.join(ASSETS_OUT, vault, outName);
  const key = outAbs;

  if (!copiedAssets.has(key)) {
    if (!DRY_RUN) {
      fs.mkdirSync(path.dirname(outAbs), { recursive: true });
      fs.copyFileSync(absSource, outAbs);
    }
    copiedAssets.add(key);
  }
  // Posts live at src/content/posts/<vault>/<slug>.md — always 3 levels below src/.
  return `../../../assets/notes/${vault}/${outName}`;
}

/**
 * Obsidian embed: ![[target]] / ![[target|500]] / ![[target|1000x200]]
 * Width hints are dropped — they were sized for the Obsidian editor pane, and the
 * site constrains images with CSS instead.
 */
function transformEmbeds(body, note) {
  return body.replace(/!\[\[([^\]]+)\]\]/g, (match, inner) => {
    const [rawTarget] = inner.split('|');
    const target = rawTarget.trim();
    const images = imageIndex.get(note.vault);
    const drawings = excalidrawNames.get(note.vault);

    // Direct image hit.
    const direct = images.get(target.toLowerCase());
    if (direct) return `![${path.basename(target, path.extname(target))}](${emitAsset(direct, note.vault)})`;

    // An Excalidraw drawing. Usable only if it has been exported to an image.
    const drawingKey = target.replace(/\.excalidraw$/i, '').toLowerCase();
    if (drawings.has(drawingKey) || drawings.has(target.toLowerCase())) {
      for (const candidate of [`${drawingKey}.png`, `${target.toLowerCase()}.png`, `${drawingKey}.svg`]) {
        const exported = images.get(candidate);
        if (exported) return `![${target}](${emitAsset(exported, note.vault)})`;
      }
      warn(
        `[${note.vault}/${note.stem}] Excalidraw drawing "${target}" has no exported image — ` +
          `open it in Obsidian and use "Export as PNG" into the vault, then re-run sync.`,
      );
      return `<!-- excalidraw drawing "${target}" not exported -->`;
    }

    // Embedding another note's content is not supported; link to it instead.
    const linked = resolvePublishedNote(target, note.vault);
    if (linked) return `[${linked.title}](${linked.url})`;

    warn(`[${note.vault}/${note.stem}] unresolved embed: ${match}`);
    return `<!-- unresolved embed: ${target} -->`;
  });
}

/** Obsidian wikilink: [[target]] / [[target|alias]] / [[target#heading]] */
function transformWikilinks(body, note) {
  return body.replace(/(^|[^!])\[\[([^\]]+)\]\]/g, (_match, prefix, inner) => {
    const [rawTarget, alias] = inner.split('|');
    const [target, heading] = rawTarget.split('#');
    const label = (alias ?? target).trim();

    const linked = resolvePublishedNote(target.trim(), note.vault);
    if (linked) {
      const anchor = heading ? `#${slugify(heading)}` : '';
      return `${prefix}[${label}](${linked.url}${anchor})`;
    }
    // Target is not published — degrade to plain text rather than a dead link.
    warn(`[${note.vault}/${note.stem}] link to unpublished note "${target.trim()}" — rendered as text`);
    return `${prefix}${label}`;
  });
}

/** Obsidian ==highlight== -> <mark> */
function transformHighlights(body) {
  return body.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
}

/** First real paragraph, used as a fallback meta description. */
function deriveDescription(body) {
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^[#>|`\-*!<]/.test(t) || t.startsWith('$$')) continue;
    return t.replace(/[*_`$]/g, '').slice(0, 180);
  }
  return '';
}

if (!DRY_RUN) {
  fs.rmSync(POSTS_OUT, { recursive: true, force: true });
  fs.rmSync(ASSETS_OUT, { recursive: true, force: true });
  fs.mkdirSync(POSTS_OUT, { recursive: true });
  fs.mkdirSync(ASSETS_OUT, { recursive: true });
}

let written = 0;
for (const note of queue) {
  let body = note.content;
  body = transformEmbeds(body, note);
  body = transformWikilinks(body, note);
  body = transformHighlights(body);
  body = body.replace(/^\s+/, '');

  const frontmatter = {
    title: note.title,
    description: note.data.description || deriveDescription(body),
    date: (note.data.date ? new Date(note.data.date) : note.stat.birthtime).toISOString().slice(0, 10),
    category: note.data.category ?? note.vault,
    tags: note.data.tags ?? [],
    draft: note.data.draft ?? false,
    source: path.relative(VAULT_ROOT, note.abs),
  };
  if (note.data.updated) frontmatter.updated = new Date(note.data.updated).toISOString().slice(0, 10);

  const outAbs = path.join(POSTS_OUT, note.vault, `${note.slug}.md`);
  const file = matter.stringify(`\n${body}\n`, frontmatter);

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, file);
  }
  written++;
  console.log(`  ${note.vault}/${note.stem}  ->  ${note.url}`);
}

console.log(
  `\n${DRY_RUN ? '[dry run] ' : ''}${written} post${written === 1 ? '' : 's'}, ` +
    `${copiedAssets.size} asset${copiedAssets.size === 1 ? '' : 's'} ` +
    `(${noteFiles.length} notes scanned)`,
);

if (warnings.length) {
  console.log(`\n${warnings.length} warning${warnings.length === 1 ? '' : 's'}:`);
  for (const w of warnings) console.log(`  ! ${w}`);
}

if (written === 0) {
  console.log(
    '\nNothing published. Add `publish: true` to a note\'s frontmatter ' +
      '(run `npm run notes:init` to add frontmatter blocks), or pass --all to preview everything.',
  );
}
