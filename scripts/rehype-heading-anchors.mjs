import { visit } from 'unist-util-visit';

const LEVELS = new Set(['h2', 'h3', 'h4']);

/**
 * Append a permalink anchor to each section heading.
 *
 * Astro already assigns heading IDs, so this only adds the affordance for
 * grabbing one. h1 is skipped — the post title is rendered by the layout, and a
 * note's own top-level headings are rare. The anchor is aria-hidden because the
 * heading text beside it already names the destination.
 */
export default function rehypeHeadingAnchors() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!LEVELS.has(node.tagName)) return;
      const id = node.properties?.id;
      if (!id) return;

      node.properties.className = [...(node.properties.className ?? []), 'heading-linked'];
      node.children.push({
        type: 'element',
        tagName: 'a',
        properties: {
          href: `#${id}`,
          className: ['heading-anchor'],
          ariaHidden: 'true',
          tabIndex: -1,
        },
        children: [{ type: 'text', value: '#' }],
      });
    });
  };
}
