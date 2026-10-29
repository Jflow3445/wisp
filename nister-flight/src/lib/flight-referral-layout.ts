export type ReferralLayoutNode = { key: string; children: ReferralLayoutNode[] };
export function referralTreeLayout(root: ReferralLayoutNode) {
  const nodeWidth = 196, nodeHeight = 118, gap = 28, rowHeight = 182, padding = 40;
  const positions: Array<{ key: string; x: number; y: number; depth: number }> = [], edges: Array<{ parent: string; child: string }> = [];
  const widths = new Map<string, number>();
  function measure(node: ReferralLayoutNode): number {
    const width = Math.max(nodeWidth, node.children.reduce((total, child, index) => total + measure(child) + (index ? gap : 0), 0));
    widths.set(node.key, width); return width;
  }
  function place(node: ReferralLayoutNode, left: number, depth: number) {
    const width = widths.get(node.key)!; positions.push({ key: node.key, x: left + width / 2, y: padding + depth * rowHeight, depth });
    let cursor = left;
    for (const child of node.children) { edges.push({ parent: node.key, child: child.key }); place(child, cursor, depth + 1); cursor += widths.get(child.key)! + gap; }
  }
  const width = measure(root) + 2 * padding; place(root, padding, 0);
  return { positions, edges, width, height: padding * 2 + Math.max(...positions.map(p => p.depth)) * rowHeight + nodeHeight, nodeWidth, nodeHeight };
}
