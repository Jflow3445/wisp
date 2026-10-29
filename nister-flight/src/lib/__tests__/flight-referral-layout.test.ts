import test from "node:test";
import assert from "node:assert/strict";
import { referralTreeLayout } from "../flight-referral-layout";
test("connected referral layout preserves generations and keeps sibling nodes apart", () => {
  const layout = referralTreeLayout({ key: "you", children: [{ key: "a", children: [{ key: "c", children: [{ key: "e", children: [] }] }, { key: "d", children: [] }] }, { key: "b", children: [] }] });
  assert.equal(layout.positions.length, 6); assert.equal(layout.edges.length, 5);
  const byId = new Map(layout.positions.map(node => [node.key, node]));
  assert.equal(byId.get("e")!.depth, 3);
  for (const edge of layout.edges) assert.equal(byId.get(edge.child)!.depth, byId.get(edge.parent)!.depth + 1);
  for (const node of layout.positions) { assert.ok(node.x - layout.nodeWidth / 2 >= 0); assert.ok(node.x + layout.nodeWidth / 2 <= layout.width); }
  for (let depth = 0; depth <= 3; depth++) {
    const row = layout.positions.filter(node => node.depth === depth).sort((a,b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) assert.ok(row[i].x - row[i - 1].x >= layout.nodeWidth);
  }
});
