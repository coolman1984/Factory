// V5 collision and logic check for INJ 1 (no browser). Sweeps the real trolley footprint along every step of the V5 flow,
// including the in-place quarter turns at corners, against the replica solids (walls with their skirting, racks, columns with
// their bases, machines, pallets, lifts) and the new devices; checks every device against the replica; checks the flow logic.
// Usage: node tools/v5-check.mjs [replica.json from scratch P.json]   Exit 1 on any clash or logic error.
import { readFileSync } from "node:fs";
import { flow, nodes, devices, STOPS } from "./v5/inj1-data.mjs";
import { TROLLEY, footprints, DIMS } from "./v5/device-dims.mjs";

const P = JSON.parse(readFileSync(process.argv[2] || process.env.MF_P || "private/v5/P-v4.json", "utf8"));
const R = P.inj1.replica, plate = P.inj1.data.plates["1F"].zone;
const errors = [], warn = [];
const solids = [];   // { name, r: [x0, y0, x1, y1] }
for (const w of R.walls) {
  const [ax, ay] = w.a, [bx, by] = w.b, t = 1.42 / 2, ext = 1.5 / 2;   // skirting 1.42 thick, cap 1.5 long overhang
  const r = Math.abs(ax - bx) < 1e-6 ? [ax - t, Math.min(ay, by) - ext, ax + t, Math.max(ay, by) + ext] : [Math.min(ax, bx) - ext, ay - t, Math.max(ax, bx) + ext, ay + t];
  if (Math.abs(ax - bx) > 1e-6 && Math.abs(ay - by) > 1e-6) { warn.push(`diagonal wall ${ax},${ay}-${bx},${by} checked by its box`); }
  solids.push({ name: `wall ${ax.toFixed(0)},${ay.toFixed(0)}-${bx.toFixed(0)},${by.toFixed(0)}`, r });
}
for (const q of R.columns) solids.push({ name: `column ${q.p[0].toFixed(1)},${q.p[1].toFixed(1)}`, r: [q.p[0] - 1.45, q.p[1] - 1.45, q.p[0] + 1.45, q.p[1] + 1.45] });
for (const k of ["racks", "machines", "pallets", "lifts"]) for (const o of R[k] || []) solids.push({ name: `${k.slice(0, -1)} ${o.x.toFixed(1)},${o.y.toFixed(1)}`, r: [o.x, o.y, o.x + o.w, o.y + o.h] });
const deviceSolids = devices.flatMap((d) => footprints(d).map((r) => ({ name: `${d.type} ${d.label}`, r })));

// Separating-axis test: oriented trolley rectangle vs axis-aligned box. Returns the gap (negative = overlap).
function gap(cx, cy, h, r) {
  const ux = Math.sin(h), uy = Math.cos(h), vx = Math.cos(h), vy = -Math.sin(h);   // u along the trolley (heading), v across
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [cx + ux * a * TROLLEY.halfL + vx * b * TROLLEY.halfW, cy + uy * a * TROLLEY.halfL + vy * b * TROLLEY.halfW]);
  const box = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
  let best = -Infinity;
  for (const [ax, ay] of [[1, 0], [0, 1], [ux, uy], [vx, vy]]) {
    const p = (pts) => { let lo = Infinity, hi = -Infinity; for (const [x, y] of pts) { const d = x * ax + y * ay; lo = Math.min(lo, d); hi = Math.max(hi, d); } return [lo, hi]; };
    const [a0, a1] = p(corners), [b0, b1] = p(box);
    best = Math.max(best, Math.max(b0 - a1, a0 - b1));
  }
  return best;
}
const CLEAR = 0.5;   // units (15 cm) the trolley keeps from any solid
let minGap = Infinity, minAt = "";
function test(x, y, h, where) {
  for (const s of [...solids, ...deviceSolids]) {
    if (s.r[2] < x - 8 || s.r[0] > x + 8 || s.r[3] < y - 8 || s.r[1] > y + 8) continue;
    const g = gap(x, y, h, s.r);
    if (g < minGap) { minGap = g; minAt = `${where} vs ${s.name}`; }
    if (g < CLEAR) errors.push(`trolley ${where} at (${x.toFixed(1)},${y.toFixed(1)}) hits ${s.name} (gap ${g.toFixed(2)})`);
  }
}
// sweep: straight moves sampled every 0.25 unit with the segment heading; corners rotated in 5-degree steps
let heading;
for (const [si, s] of flow.steps.entries()) {
  if (!s.path) { if (!nodes[s.node]) errors.push(`step ${si + 1}: node ${s.node} missing`); continue; }
  const end = s.path[s.path.length - 1], n = nodes[s.node];
  if (!n || Math.hypot(end[0] - n.x, end[1] - n.y) > 1e-6) errors.push(`step ${si + 1}: path does not end at node ${s.node}`);
  const prevEnd = si ? (flow.steps[si - 1].path ? flow.steps[si - 1].path.at(-1) : [nodes[flow.steps[si - 1].node].x, nodes[flow.steps[si - 1].node].y]) : null;
  if (prevEnd && Math.hypot(prevEnd[0] - s.path[0][0], prevEnd[1] - s.path[0][1]) > 1e-6) errors.push(`step ${si + 1}: path does not start where step ${si} ended`);
  for (let i = 1; i < s.path.length; i++) {
    const [ax, ay] = s.path[i - 1], [bx, by] = s.path[i], L = Math.hypot(bx - ax, by - ay); if (L < 1e-6) continue;
    if (Math.abs(ax - bx) > 1e-6 && Math.abs(ay - by) > 1e-6) errors.push(`step ${si + 1}: diagonal segment ${ax},${ay} -> ${bx},${by}`);
    const h = Math.atan2(bx - ax, by - ay);
    if (heading !== undefined) { let d = Math.atan2(Math.sin(h - heading), Math.cos(h - heading)); for (let k = 1; k <= 18; k++) test(ax, ay, heading + d * k / 18, `step ${si + 1} turn`); }
    for (let u = 0; u <= L; u += 0.25) test(ax + (bx - ax) * u / L, ay + (by - ay) * u / L, h, `step ${si + 1}`);
    heading = h;
    for (const p of [s.path[i - 1], s.path[i]]) if (p[0] < plate[0] || p[0] > plate[2] || p[1] < plate[1] || p[1] > plate[3]) errors.push(`step ${si + 1}: point ${p} outside the plate`);
  }
}
// devices: never inside a wall, column, rack, machine, pallet or lift, never on the trolley lane of another step
for (const d of devices) for (const r of footprints(d)) for (const s of solids) {
  const g = Math.max(s.r[0] - r[2], r[0] - s.r[2], s.r[1] - r[3], r[1] - s.r[3]);
  if (g < 0.2) errors.push(`device ${d.label} overlaps ${s.name} (gap ${g.toFixed(2)})`);
}
// logic: the owner's order, gates on the path, PC beside every stop that has one
const order = flow.steps.map((s) => nodes[s.node].text);
const want = ["Item Slip", "Final Scan", "Manual RFID", "Inj. W/H", "TO Mapping", "Kitting", "Main Line"];
want.forEach((w, i) => { if (!order[i] || !order[i].includes(w)) errors.push(`order: step ${i + 1} should be ${w}, is ${order[i]}`); });
const onPath = (x, y) => flow.steps.some((s) => s.path && s.path.some((p, i) => i && Math.min(p[0], s.path[i - 1][0]) - .01 <= x && x <= Math.max(p[0], s.path[i - 1][0]) + .01 && Math.min(p[1], s.path[i - 1][1]) - .01 <= y && y <= Math.max(p[1], s.path[i - 1][1]) + .01));
for (const d of devices.filter((d) => d.type !== "pc" && !d.label.startsWith("INJ 2"))) if (!onPath(d.x, d.y)) errors.push(`${d.label} at ${d.x},${d.y} is not on the trolley path`);
for (const d of devices.filter((d) => d.node)) { const n = nodes[d.node], dist = Math.hypot(n.x - d.x, n.y - d.y); if (dist > 15) errors.push(`${d.label} is ${dist.toFixed(1)} units from its stop`); }
console.log(`checked ${flow.steps.length} steps, ${devices.length} devices against ${solids.length} solids; trolley ${TROLLEY.halfW * 2}x${TROLLEY.halfL * 2}; minimum trolley gap ${minGap.toFixed(2)} units (${(minGap * 0.3).toFixed(2)} m) at ${minAt}`);
for (const w of warn.slice(0, 3)) console.log("note:", w);
if (errors.length) { console.log(`FAIL (${errors.length})`); for (const e of [...new Set(errors)].slice(0, 40)) console.log(" ", e); process.exit(1); }
console.log("OK: no clash, order and devices correct");
