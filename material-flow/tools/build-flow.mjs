// Turns private/slide1.json (read from the deck through PowerPoint COM) into private/inj.json: nodes, connector paths
// and the step-by-step flows. Connector paths are computed from the slide's own geometry (box, flip, rotation, adjust).
// The flow ORDER is a draft read from the arrows: the owner confirms it.
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../private/", import.meta.url);
const S = JSON.parse(readFileSync(new URL("slide1.json", dir), "utf8"));
const byId = Object.fromEntries(S.map((s) => [s.id, s]));
const center = (s) => [s.x + s.w / 2, s.y + s.h / 2];

// which plan a slide point belongs to
const plateOf = (x, y) => (x < 553 ? "E1" : y >= 303 ? "E2-1F" : "E2-2F");

// PowerPoint elbow connectors: local path in the box, then flip, then rotate about the box centre
function connectorPath(c) {
  const { w, h } = c, a = c.adj == null ? [] : [].concat(c.adj);
  let p;
  if (c.name.startsWith("Straight") || c.ctype === 1) p = [[0, 0], [w, h]];
  else if (a.length === 0) p = [[0, 0], [w, 0], [w, h]];
  else if (a.length === 1) p = [[0, 0], [a[0] * w, 0], [a[0] * w, h], [w, h]];
  else p = [[0, 0], [a[0] * w, 0], [a[0] * w, a[1] * h], [w, a[1] * h], [w, h]];
  const cx = c.x + w / 2, cy = c.y + h / 2, r = (c.rot * Math.PI) / 180;
  return p.map(([x, y]) => {
    let dx = x - w / 2, dy = y - h / 2;
    if (c.flipH) dx = -dx;
    if (c.flipV) dy = -dy;
    return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)].map((v) => Math.round(v * 10) / 10);
  });
}

const KIND = { 9: "result", 4: "obama", 1: "mapping", 7: "wip" };
const LABEL = { result: "Prod. Result", obama: "OBAMA GR", mapping: "TO Mapping", wip: "WIP Area", dest: "Destination" };
const nodes = {};
for (const s of S) {
  if (s.parent || s.conn || s.type !== 1 || s.y > 500) continue;
  if (![9, 4, 1, 7].includes(s.auto) || s.fill == null) continue;
  const [x, y] = center(s), dest = s.fill === "#156082";
  nodes[s.id] = { id: s.id, x, y, plate: plateOf(x, y), kind: dest ? "dest" : KIND[s.auto], fill: s.fill, text: (s.text || "").trim() };
}
const conns = {};
const check = [];
for (const c of S) {
  if (!c.conn || !c.from || !c.to || !nodes[c.from] || !nodes[c.to]) continue;
  const pts = connectorPath(c);
  conns[c.id] = { id: c.id, from: c.from, to: c.to, color: c.line, pts };
  // self-check: each end of the computed path must touch its symbol
  const d = (p, n) => Math.hypot(p[0] - n.x, p[1] - n.y), lim = (n) => Math.max(byId[n.id].w, byId[n.id].h) / 2 + 3;
  const a = d(pts[0], nodes[c.from]), b = d(pts.at(-1), nodes[c.to]);
  if (a > lim(nodes[c.from]) || b > lim(nodes[c.to])) check.push(`c${c.id}: start off by ${a.toFixed(1)}, end off by ${b.toFixed(1)}`);
}

const seg = (id) => conns[id].pts;
const n = (id) => [nodes[id].x, nodes[id].y];
const step = (node, title, what, path, o = {}) => ({ node, title, what, path: path || null, mode: o.mode || "flow", view: o.view || "2d", dist: o.dist || 300, lift: !!o.lift });
const flows = [
  { id: "assy-lcm", name: "Injection Assy to LCM", color: "#00B0F0", steps: [
    step(203, "Item Slip", "The Injection Assy lot gets its item slip on E2-1F.", null, { dist: 260 }),
    step(205, "Final Scan", "Final scan of the lot; the production result is posted.", seg(207), { dist: 220 }),
    step(134, "To Elev 5", "The lot moves to Elevator 5 for the second floor.", [n(205), [684, 438], [620, 438], n(134)], { mode: "auto", dist: 300 }),
    step(134, "Elev 5 up to E2-2F", "Elevator 5 lifts the lot from E2-1F to E2-2F.", "lift", { view: "3d", dist: 420, lift: true }),
    step(209, "OBAMA GR", "Goods receipt in OBAMA on E2-2F.", "fromLift", { view: "3d", dist: 380 }),
    step(213, "TO Mapping", "The transfer order is mapped.", seg(222), { view: "3d", dist: 320 }),
    step(217, "WIP Area", "The lot waits in the WIP area.", [n(213), n(212), ...seg(218)], { view: "3d", dist: 320 }),
    step(70, "To LCM", "The lot leaves for the LCM line.", seg(271), { mode: "auto", view: "3d", dist: 520 }),
  ] },
  { id: "small-main", name: "Small Inch to Main", color: "#00B0F0", steps: [
    step(173, "Item Slip", "Small-inch Assy lot gets its item slip on E1-1F.", null, { dist: 240 }),
    step(175, "Final Scan", "Final scan; the production result is posted.", seg(186), { dist: 220 }),
    step(179, "OBAMA GR", "Goods receipt in OBAMA for small inch.", seg(189), { dist: 280 }),
    step(178, "TO Mapping", "The transfer order is mapped.", seg(190), { dist: 260 }),
    step(191, "WIP Area", "GI, then the lot waits in the WIP area.", [n(178), n(176), ...seg(192)], { dist: 220 }),
    step(73, "To Main", "The lot leaves for the Main line.", seg(261), { mode: "auto", view: "3d", dist: 480 }),
  ] },
  { id: "big-main", name: "Big Inch to Main", color: "#00B0F0", steps: [
    step(173, "Item Slip", "Big-inch Assy lot gets its item slip on E1-1F.", null, { dist: 240 }),
    step(175, "Final Scan", "Final scan; the production result is posted.", seg(186), { dist: 220 }),
    step(195, "OBAMA GR", "Goods receipt in OBAMA for big inch.", seg(194), { dist: 520 }),
    step(200, "TO Mapping", "The transfer order is mapped.", seg(93), { dist: 240 }),
    step(244, "WIP Area", "GI, then the lot waits in the WIP area.", [n(200), n(201), ...seg(245)], { dist: 260 }),
    step(73, "To Main", "The lot leaves for the Main line.", seg(248), { mode: "auto", view: "3d", dist: 560 }),
  ] },
];
const out = {
  slide: { title: "INJ location E1-E2", w: 960, h: 540 },
  plates: {
    "E1": { label: "E1-1F", dx: 0, dz: 0, lift: 0, pics: [{ file: "pic28", x: 21, y: 157, w: 410, h: 337 }, { file: "pic10", x: 431, y: 174, w: 119, h: 255 }] },
    "E2-1F": { label: "E2-1F", dx: 0, dz: 0, lift: 0, pics: [{ file: "pic117", x: 555, y: 305, w: 355, h: 137 }] },
    "E2-2F": { label: "E2-2F", dx: -124, dz: 150, lift: 1, pics: [{ file: "pic130", x: 724.5, y: 143.5, w: 222, h: 159 }] },
  },
  elevator: { label: "Elev 5", low: [604, 435], high: [728, 285] },
  nodes, conns, flows,
};
writeFileSync(new URL("inj.json", dir), JSON.stringify(out));
console.log(`nodes ${Object.keys(nodes).length}, connectors ${Object.keys(conns).length}, flows ${flows.length}`);
console.log(check.length ? "PATH CHECK FAILED:\n" + check.join("\n") : "path check OK: every connector end touches its symbol");
