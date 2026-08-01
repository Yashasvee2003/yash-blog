import { visit } from 'unist-util-visit';

/**
 * Wrap every <table> in a horizontally scrollable div.
 *
 * Wide tables (the ML notes have a few) would otherwise force the whole page to
 * scroll sideways on a phone. This keeps the overflow inside the table.
 */
export default function rehypeTableScroll() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'table' || !parent || index === undefined) return;
      if (parent.type === 'element' && parent.properties?.className?.includes?.('table-scroll')) return;

      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-scroll'] },
        children: [node],
      };
    });
  };
}
