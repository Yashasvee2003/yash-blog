#!/usr/bin/env node
/**
 * One-time bootstrap: add a frontmatter block to every Obsidian note that lacks one.
 *
 *   node scripts/init-frontmatter.mjs            # dry run — prints the plan
 *   node scripts/init-frontmatter.mjs --write    # actually modify the vault notes
 *
 * This writes into obsidian-notes/, which is your source of truth, so it is a dry
 * run by default. It only ever prepends a block to notes that have none; notes
 * with existing frontmatter are left completely alone. Everything defaults to
 * `publish: false` — flip the ones you want live and run `npm run sync`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const VAULT_ROOT = path.resolve(ROOT, '../obsidian-notes');
const VAULTS = ['sys-design', 'platform-eng', 'os', 'ai', 'reads'];

const WRITE = process.argv.includes('--write');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.obsidian' || entry.name === 'Excalidraw' || entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md') && !entry.name.endsWith('.excalidraw.md')) out.push(full);
  }
  return out;
}

/** Quote a YAML scalar only when it needs it. */
function yamlString(value) {
  return /^[A-Za-z0-9][A-Za-z0-9 _.,()/-]*$/.test(value) ? value : JSON.stringify(value);
}

let touched = 0;
let skipped = 0;

for (const vault of VAULTS) {
  const dir = path.join(VAULT_ROOT, vault);
  if (!fs.existsSync(dir)) continue;

  for (const abs of walk(dir)) {
    const raw = fs.readFileSync(abs, 'utf8');
    if (raw.trimStart().startsWith('---')) {
      skipped++;
      continue;
    }

    const stem = path.basename(abs, '.md');
    const stat = fs.statSync(abs);
    const date = stat.birthtime.toISOString().slice(0, 10);

    const block = [
      '---',
      `title: ${yamlString(stem)}`,
      'description: ""',
      `date: ${date}`,
      `category: ${vault}`,
      'tags: []',
      'publish: false',
      '---',
      '',
    ].join('\n');

    if (WRITE) fs.writeFileSync(abs, block + raw.replace(/^\n+/, ''));
    console.log(`  ${WRITE ? 'wrote' : 'would write'}  ${path.relative(VAULT_ROOT, abs)}`);
    touched++;
  }
}

console.log(
  `\n${WRITE ? 'Added' : 'Would add'} frontmatter to ${touched} note${touched === 1 ? '' : 's'}` +
    ` (${skipped} already had some).`,
);
if (!WRITE && touched > 0) console.log('Re-run with --write to apply.');
