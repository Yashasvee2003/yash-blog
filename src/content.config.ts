import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Vault name -> display label. Adding a vault to obsidian-notes/ means adding it here.
export const CATEGORIES = {
  'sys-design': 'Systems Design',
  'platform-eng': 'Platform Engineering',
  os: 'Operating Systems',
  ai: 'Machine Learning',
  reads: 'Paper Reads',
} as const;

export type Category = keyof typeof CATEGORIES;

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(''),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    category: z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]]),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // Path of the note inside obsidian-notes/ that generated this file.
    source: z.string().optional(),
  }),
});

export const collections = { posts };
