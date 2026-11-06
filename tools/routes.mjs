// Makes the layout roomy and drivable, then computes every route with the 3D-Modeling repo's findRoute.
// 1. Breathing space (owner, 2026-11-06): the slide's rack blocks become single rows with real aisles; stations get cleared pads;
//    no column stands inside a rack or machine; walls get doors. The plan's positions stay; density is a presentation choice.
// 2. The trolley never crosses anything: each step is a findRoute path, string-pulled and rounded, stored in the flow data.
// 3. Forklifts and AGVs get their missions on the same floor. Self-check: no route point may touch an obstacle.
import { readFileSync, writeFileSync } from "node:fs";
import { findRoute } from "file:///D:/WORK/Software%20Development/GitHub/3D-Modeling/packages/industry/src/routing.ts";
const rf = new URL("../private/replica.json", import.meta.url), ff = new URL("../private/inj.json", import.meta.url);
const L = JSON.parse(readFileSync(rf, "utf8")), D = JSON.parse(readFileSync(ff, "utf8"));
const CELL = 1.5, M = 1 / L.scale, near = (a, r, m = 0) => a[0] > r.x - m && a[0] < r.x + r.w + m && a[1] > r.y - m && a[1] < r.y + r.h + m;
const plateOf = (x, y) => (x < 553 ? "E1" : y >= 303 ? "E2-1F" : "E2-2F");

/* ---------- 1. breathing space ---------- */
const stationsWanted = [...new Set(D.flows.flatMap((f) => f.steps.map((s) => s.node)))].map((id) => D.nodes[id]).filter((n) => n.kind !== "dest");
for (const r of L.racks) {   // one rack row (1.3 m deep) down the middle of each block, shorter so cross aisles open up
  const v = r.h >= r.w, depth = 1.3 * M, trim = Math.min(7, (v ? r.h : r.w) * .1);
  if (v) { r.x += (r.w - depth) / 2; r.w = depth; r.y += trim; r.h -= trim * 2; } else { r.y += (r.h - depth) / 2; r.h = depth; r.x += trim; r.w -= trim * 2; }
}
L.racks = L.racks.filter((r) => !stationsWanted.some((n) => plateOf(n.x, n.y) === r.plate && near([n.x, n.y], r, 11)));
for (const m of L.machines) if (m.type === "injection" && !m.vertical) { const k = m.h * .12; m.y += k / 2; m.h -= k; }
const solid = [...L.racks, ...L.machines];
L.columns = L.columns.filter((c) => !solid.some((r) => r.plate === c.plate && near(c.p, r, 2.2)));
function door(pic, axis, at, from, to) {   // cuts an opening in the straight walls of one picture
  const out = []; for (const w of L.walls) {
    const i = axis === "x" ? 0 : 1, j = 1 - i, onLine = w.pic === pic && Math.abs(w.a[i] - at) < 1.2 && Math.abs(w.b[i] - at) < 1.2, lo = Math.min(w.a[j], w.b[j]), hi = Math.max(w.a[j], w.b[j]);
    if (!onLine || hi < from || lo > to) { out.push(w); continue; }
    const seg = (p, q) => { const a = [...w.a], b = [...w.b]; a[j] = p; b[j] = q; out.push({ ...w, a, b }); }; if (lo < from) seg(lo, from); if (hi > to) seg(to, hi);
  } L.walls = out;
}
door("pic28", "x", 140, 240, 262); door("pic28", "x", 140, 300, 322); door("pic28", "x", 111, 250, 272); door("pic28", "y", 158, 214, 232);
door("pic28", "x", 426.5, 252, 278); door("pic10", "x", 493.4, 298, 322); door("pic117", "x", 625, 372, 392); door("pic130", "x", 727, 268, 298);
L.rooms = L.rooms.filter((r) => r.label !== "Area" && r.label !== "Plan area");

/* ---------- 2. the floor as a grid ---------- */
function grid(plate, x0, y0, x1, y1) {
  const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL), blocked = new Uint8Array(nx * ny);
  const rect = (x, y, w, h) => { for (let j = Math.floor((y - y0) / CELL); j <= Math.ceil((y + h - y0) / CELL); j++) for (let i = Math.floor((x - x0) / CELL); i <= Math.ceil((x + w - x0) / CELL); i++) if (i >= 0 && j >= 0 && i < nx && j < ny) blocked[j * nx + i] = 1; };
  for (const w of L.walls) if (w.plate === plate) { const [a, b] = [w.a, w.b]; rect(Math.min(a[0], b[0]) - .6, Math.min(a[1], b[1]) - .6, Math.abs(a[0] - b[0]) + 1.2, Math.abs(a[1] - b[1]) + 1.2); }
  for (const r of [...L.racks, ...L.machines]) if (r.plate === plate) rect(r.x, r.y, r.w, r.h);
  for (const c of L.columns) if (c.plate === plate) rect(c.p[0] - 1.4, c.p[1] - 1.4, 2.8, 2.8);
  for (const c of L.conveyors) if (c.plate === plate) for (let k = 1; k < c.pts.length; k++) { const a = c.pts[k - 1], b = c.pts[k]; rect(Math.min(a[0], b[0]) - 2, Math.min(a[1], b[1]) - 2, Math.abs(a[0] - b[0]) + 4, Math.abs(a[1] - b[1]) + 4); }
  const clearance = new Float64Array(nx * ny).fill(1e9);
  for (let k = 0; k < blocked.length; k++) if (blocked[k]) clearance[k] = 0;
  const relax = (k, n, d) => { if (clearance[n] + d < clearance[k]) clearance[k] = clearance[n] + d; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (i) relax(k, k - 1, 1); if (j) relax(k, k - nx, 1); if (i && j) relax(k, k - nx - 1, 1.41); if (j && i < nx - 1) relax(k, k - nx + 1, 1.41); }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (i < nx - 1) relax(k, k + 1, 1); if (j < ny - 1) relax(k, k + nx, 1); if (i < nx - 1 && j < ny - 1) relax(k, k + nx + 1, 1.41); if (i && j < ny - 1) relax(k, k + nx - 1, 1.41); }
  return { minX: x0, minY: y0, nx, ny, cell: CELL, blocked, clearance, point: (i, j) => ({ x: x0 + (i + .5) * CELL, y: y0 + (j + .5) * CELL }), index: (p) => { const i = Math.floor((p.x - x0) / CELL), j = Math.floor((p.y - y0) / CELL); return i < 0 || j < 0 || i >= nx || j >= ny ? undefined : j * nx + i; } };
}
const grids = { "E1": grid("E1", 21, 150, 551, 494), "E2-1F": grid("E2-1F", 555, 305, 911, 443), "E2-2F": grid("E2-2F", 712, 143, 947, 303) };
const needOf = (m) => m.effectiveWidth / (2 * CELL) + .5, FORK = { name: "forklift", effectiveWidth: 3.5 * M }, AGV = { name: "agv", effectiveWidth: 2.2 * M }, TROLLEY = { name: "trolley", effectiveWidth: 1.8 * M };
const free = (g, p, need) => { const k = g.index(p); return k !== undefined && !g.blocked[k] && g.clearance[k] >= need; };
const nearestFree = (g, p, need) => { for (let r = 0; r < 60; r++) for (let a = 0; a < 24; a++) { const q = { x: p[0] + Math.cos(a / 24 * 6.283) * r * CELL * .7, y: p[1] + Math.sin(a / 24 * 6.283) * r * CELL * .7 }; if (free(g, q, need)) return q; } return null; };
const sight = (g, a, b, need) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 2)); for (let i = 0; i <= n; i++) if (!free(g, { x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }, need)) return false; return true; };
function pull(g, pts, need) { const o = [pts[0]]; let i = 0; while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !sight(g, pts[i], pts[j], need)) j--; o.push(pts[j]); i = j; } return o; }
function round(pts) { let p = pts; for (let k = 0; k < 2; k++) { const q = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; if (i) q.push({ x: a.x * .75 + b.x * .25, y: a.y * .75 + b.y * .25 }); if (i < p.length - 2) q.push({ x: a.x * .25 + b.x * .75, y: a.y * .25 + b.y * .75 }); } q.push(p[p.length - 1]); p = q; } return p; }
const out = (p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
let touches = 0;
function route(plate, from, to, mover, label) {
  const g = grids[plate], need = needOf(mover), r = findRoute(g, from, to, mover);
  if (!r.reachable) throw new Error(`NO ROUTE ${label}: ${r.reason}`);
  const pulled = pull(g, r.points, need); let pts = round(pulled); if (pts.some((p) => !free(g, p, need * .6))) pts = pulled;   // a rounded corner must not cut into anything
  for (const p of pts) if (!free(g, p, need * .6)) touches++;
  return pts;
}

/* ---------- 3. stations and the trolley's journey ---------- */
const pad = {}; const station = (id, need = needOf(TROLLEY)) => { if (pad[id]) return pad[id]; const n = D.nodes[id], q = nearestFree(grids[plateOf(n.x, n.y)], [n.x, n.y], need); if (!q) throw new Error("no free pad for " + id); pad[id] = q; return q; };
const E = D.elevator, low = nearestFree(grids["E2-1F"], E.low, needOf(TROLLEY)), high = nearestFree(grids["E2-2F"], [738, 285], needOf(TROLLEY)); E.low = out(low); E.high = out(high);
const gateLCM = nearestFree(grids["E2-2F"], [716, 285], needOf(TROLLEY)), gateMain = nearestFree(grids["E1"], [223, 153], needOf(TROLLEY));
for (const f of D.flows) {
  let at = station(f.steps[0].node);
  f.steps.forEach((s, i) => {
    if (i === 0) return; if (s.path === "lift") { at = high; return; }
    const here = plateOf(at.x, at.y);
    if (s.title === "To LCM") { s.path = [...route(here, at, gateLCM, TROLLEY, f.name + " " + s.title).map(out), [D.nodes[s.node].x, 285]]; return; }
    if (s.title === "To Main") { s.path = [...route(here, at, gateMain, TROLLEY, f.name + " " + s.title).map(out), [D.nodes[s.node].x + 2, 131]]; return; }
    const to = s.title === "To Elev 5" ? low : station(s.node); s.path = route(here, at, to, TROLLEY, f.name + " " + s.title).map(out); at = to;
  });
}
for (const [id, q] of Object.entries(pad)) { D.nodes[id].x = out(q)[0]; D.nodes[id].y = out(q)[1]; }
D.nodes[134].x = E.low[0]; D.nodes[134].y = E.low[1]; D.nodes[70].y = 285;

/* ---------- 4. vehicles ---------- */
L.routes = [];
const missions = [
  { kind: "forklift", plate: "E1", mover: FORK, stops: [[227, 410], [225, 300], [250, 210], [227, 410]] },
  { kind: "forklift", plate: "E1", mover: FORK, stops: [[300, 410], [384, 400], [384, 240], [340, 225], [300, 410]] },
  { kind: "agv", plate: "E2-1F", mover: AGV, stops: [[640, 372], [890, 372], [640, 372]] },
  { kind: "agv", plate: "E2-2F", mover: AGV, stops: [[812, 200], [870, 280], [812, 280], [812, 200]] },
];
for (const m of missions) {
  const g = grids[m.plate], need = needOf(m.mover), stops = m.stops.map((s) => nearestFree(g, s, need)); if (stops.some((s) => !s)) throw new Error("no stop for " + m.kind);
  const path = []; for (let i = 1; i < stops.length; i++) path.push(...route(m.plate, stops[i - 1], stops[i], m.mover, m.kind).slice(i > 1 ? 1 : 0));
  L.routes.push({ kind: m.kind, plate: m.plate, pts: path.map(out) });
}
writeFileSync(rf, JSON.stringify(L)); writeFileSync(ff, JSON.stringify(D));
console.log(`racks ${L.racks.length}, columns ${L.columns.length}, walls ${L.walls.length}, stations ${Object.keys(pad).length}, vehicle routes ${L.routes.length}`);
for (const f of D.flows) console.log(`${f.name}: ${Math.round(f.steps.reduce((s, x) => s + (Array.isArray(x.path) ? x.path.slice(1).reduce((d, b, i) => d + Math.hypot(b[0] - x.path[i][0], b[1] - x.path[i][1]), 0) : 0), 0) * L.scale)} m on the floor`);
console.log(touches ? `ROUTE CHECK FAILED: ${touches} points touch an obstacle` : "route check OK: no route point touches an obstacle");
