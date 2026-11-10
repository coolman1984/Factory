// V6 check (no browser): every step of every path of every tab is swept with the real trolley footprint (straights every 0.25
// unit, corners rotated in 5-degree steps) against the edited replica (walls, columns, racks, machines, pallets) and the devices;
// steps join end to start; lift steps start at the elevator's lower point and the next step starts at its upper point;
// segments are axis-aligned; every device is clear of every solid. Exit 1 on any error.
import { readFileSync } from "node:fs";
import { applyEdits } from "./v6/edits.mjs";
import { solidsOf } from "./v6/router.mjs";
import { TROLLEY, footprints } from "./v5/device-dims.mjs";

const P = applyEdits(JSON.parse(readFileSync("private/v5/P-v4.json", "utf8")));
const G = JSON.parse(readFileSync("private/v6/projects.json", "utf8"));
const CLEAR = 0.3, errors = [];
function gap(cx, cy, h, r) {
  const ux = Math.sin(h), uy = Math.cos(h), vx = Math.cos(h), vy = -Math.sin(h);
  const cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [cx + ux * a * TROLLEY.halfL + vx * b * TROLLEY.halfW, cy + uy * a * TROLLEY.halfL + vy * b * TROLLEY.halfW]);
  const bx = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]; let best = -Infinity;
  for (const [ax, ay] of [[1, 0], [0, 1], [ux, uy], [vx, vy]]) { const p = (pts) => { let lo = Infinity, hi = -Infinity; for (const [x, y] of pts) { const d = x * ax + y * ay; lo = Math.min(lo, d); hi = Math.max(hi, d); } return [lo, hi]; }; const [a0, a1] = p(cs), [b0, b1] = p(bx); best = Math.max(best, b0 - a1, a0 - b1); }
  return best;
}
let minAll = Infinity;
for (const [tab, g] of Object.entries(G)) {
  const d = P[tab].data, R = P[tab].replica, E = Object.fromEntries((d.elevators || []).map((e) => [e.label, e]));
  const solids = { "1F": solidsOf(R, "1F"), "2F": d.plates["2F"] ? solidsOf(R, "2F") : [] };
  const devs = { "1F": [], "2F": [] }; for (const dv of g.devices) devs[dv.plate].push(...footprints(dv).map((r) => ({ r, name: dv.label + " " + dv.sym })));
  let minTab = Infinity, at = "";
  for (const f of g.flows) {
    let prevEnd = null, h;
    for (const [i, s] of f.steps.entries()) {
      const n = g.nodes[s.node]; if (!n) { errors.push(`${tab}/${f.id} step ${i + 1}: node ${s.node} missing`); continue; }
      if (s.lift) { const e = E[s.elevator]; if (!prevEnd || Math.hypot(prevEnd[0] - e.low[0], prevEnd[1] - e.low[1]) > 1e-6) errors.push(`${tab}/${f.id} step ${i + 1}: lift does not start at ${e.label} low`); prevEnd = e.high; continue; }
      if (!s.path) { prevEnd = [n.x, n.y]; continue; }
      if (prevEnd && Math.hypot(prevEnd[0] - s.path[0][0], prevEnd[1] - s.path[0][1]) > 1e-6) errors.push(`${tab}/${f.id} step ${i + 1}: starts at ${s.path[0]} not at ${prevEnd}`);
      const end = s.path.at(-1); if (Math.hypot(end[0] - n.x, end[1] - n.y) > 1e-6) errors.push(`${tab}/${f.id} step ${i + 1}: ends off its node`);
      const pl = n.plate, test = (x, y, hh, where) => { for (const s2 of [...solids[pl].map((r) => ({ r, name: "solid" })), ...devs[pl]]) { if (s2.r[2] < x - 8 || s2.r[0] > x + 8 || s2.r[3] < y - 8 || s2.r[1] > y + 8) continue; const v = gap(x, y, hh, s2.r); if (v < minTab) { minTab = v; at = `${f.id} step ${i + 1} ${where} (${x.toFixed(0)},${y.toFixed(0)}) vs ${s2.name} [${s2.r.map((q) => q.toFixed(0))}]`; } if (v < CLEAR) errors.push(`${tab}/${f.id} step ${i + 1} ${where} at (${x.toFixed(1)},${y.toFixed(1)}) hits ${s2.name} (gap ${v.toFixed(2)})`); } };
      if (i && f.steps[i - 1].lift) h = undefined;
      for (let k = 1; k < s.path.length; k++) {
        const [ax, ay] = s.path[k - 1], [bx, by] = s.path[k], L = Math.hypot(bx - ax, by - ay); if (L < 1e-6) continue;
        if (Math.abs(ax - bx) > 1e-6 && Math.abs(ay - by) > 1e-6) errors.push(`${tab}/${f.id} step ${i + 1}: diagonal ${ax},${ay} -> ${bx},${by}`);
        const hh = Math.atan2(bx - ax, by - ay);
        if (h !== undefined) { const dd = Math.atan2(Math.sin(hh - h), Math.cos(hh - h)); for (let q = 1; q <= 18; q++) test(ax, ay, h + dd * q / 18, "turn"); }
        for (let u = 0; u <= L; u += 0.25) test(ax + (bx - ax) * u / L, ay + (by - ay) * u / L, hh, "move");
        test(bx, by, hh, "endpoint"); h = hh;
      }
      prevEnd = end;
    }
  }
  for (const dv of g.devices) for (const r of footprints(dv)) for (const s of solids[dv.plate]) if (Math.max(s[0] - r[2], r[0] - s[2], s[1] - r[3], r[1] - s[3]) < 0.2) errors.push(`${tab}: device ${dv.label} ${dv.sym} overlaps a solid`);
  for (let i = 0; i < g.devices.length; i++) {
    const dv = g.devices[i];
    if (dv.type === "pc" && dv.node != null) {
      const n = g.nodes[dv.node];
      if (!n || n.plate !== dv.plate || n.kind !== dv.kind) errors.push(`${tab}: PC ${dv.sym} serves an incompatible stop`);
    }
    if (dv.type === "rfid-auto" || dv.type === "rfid-manual") {
      const p = dv.type === "rfid-auto" ? [dv.x, dv.y] : dv.lane;
      let nearest = Infinity;
      for (const f of g.flows) for (const s of f.steps) if (Array.isArray(s.path) && g.nodes[s.node].plate === dv.plate) for (let j = 1; j < s.path.length; j++) {
        const a = s.path[j - 1], b = s.path[j];
        const x = Math.max(Math.min(a[0], b[0]), Math.min(p[0], Math.max(a[0], b[0])));
        const y = Math.max(Math.min(a[1], b[1]), Math.min(p[1], Math.max(a[1], b[1])));
        nearest = Math.min(nearest, Math.hypot(x - p[0], y - p[1]));
      }
      if (nearest > .02 && dv.routeBound !== false) errors.push(`${tab}: RFID ${dv.sym} is off every path (${nearest.toFixed(2)} units)`);
    }
    for (const other of g.devices.slice(i + 1)) if (dv.plate === other.plate) for (const r of footprints(dv)) for (const s of footprints(other)) {
      if (Math.max(s[0] - r[2], r[0] - s[2], s[1] - r[3], r[1] - s[3]) < .2) errors.push(`${tab}: devices ${dv.sym} and ${other.sym} overlap`);
    }
  }
  minAll = Math.min(minAll, minTab);
  console.log(`${tab}: ${g.flows.length} paths, ${g.flows.reduce((s, f) => s + f.steps.length, 0)} steps, ${g.devices.length} devices; minimum trolley gap ${minTab.toFixed(2)} units (${(minTab * .3).toFixed(2)} m) at ${at}`);
}
const uniq = [...new Set(errors)];
if (uniq.length) { console.log(`FAIL (${uniq.length})`); for (const e of uniq.slice(0, 30)) console.log("  " + e); process.exit(1); }
console.log("OK: all paths clear, joined and axis-aligned; all devices clear");
