# yash-blog

Static blog built with [Astro](https://astro.build), deployed on Cloudflare Pages.

Posts are written as Obsidian notes in the sibling `obsidian-notes/` directory and pulled in
by a sync script. See `../CLAUDE.md` for the full workflow and the Obsidian → markdown
translation rules.

## Quick start

```bash
npm install
npm run sync     # pull `publish: true` notes out of the vault
npm run dev      # http://localhost:4321
```

## Publishing a post

1. Set `publish: true` in the note's frontmatter in Obsidian.
2. `npm run sync` — read the warnings it prints.
3. `npm run dev` to check it.
4. Commit and push. Cloudflare rebuilds automatically.

`src/content/posts/` and `src/assets/notes/` are generated. Don't edit them by hand.

## Deploy settings (Cloudflare Workers)

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy | `npx wrangler versions upload` |

`build` compiles only what is committed — it does not run `sync`, because the vault isn't in
this repo. Run `npm run sync` locally and commit the result before pushing.

The assets directory (`dist`) is declared in `wrangler.jsonc`, not in the dashboard.
