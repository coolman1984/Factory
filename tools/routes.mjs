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
door("pic28", "x", 140, 232, 268); door("pic28", "x", 140, 292, 330); door("pic28", "x", 111, 246, 280); door("pic28", "y", 158, 204, 240);
door("pic28", "x", 426.5, 244, 284); door("pic10", "x", 493.4, 290, 330); door("pic117", "x", 625, 362, 400); door("pic130", "x", 727, 262, 302);
// no solid may stand in a wall, a conveyor or another solid: move the press line off its conveyor, then clean up
for (const c of L.conveyors) if (c.pic === "pic117" && c.pts[0][1] > 418 && c.pts[0][1] < 425 && c.pts.length === 2) { c.pts = [[747.5, 430.4], [910, 430.4]]; }
{ const ys = [...new Set(L.columns.filter((c) => c.plate === "E2-2F").map((c) => c.p[1]))].sort((p, q) => p - q), keep = new Set(ys.filter((_, i) => i % 2 === 0)); L.columns = L.columns.filter((c) => c.plate !== "E2-2F" || keep.has(c.p[1])); }   // the plan's marks stand 4 m apart: an 8 m grid gives the lanes room
const wallBox = (w) => ({ x: Math.min(w.a[0], w.b[0]) - 1, y: Math.min(w.a[1], w.b[1]) - 1, w: Math.abs(w.a[0] - w.b[0]) + 2, h: Math.abs(w.a[1] - w.b[1]) + 2, plate: w.plate });
const convBoxes = () => L.conveyors.flatMap((q) => q.pts.slice(1).map((b, i) => { const a = q.pts[i]; return { x: Math.min(a[0], b[0]) - 3, y: Math.min(a[1], b[1]) - 3, w: Math.abs(a[0] - b[0]) + 6, h: Math.abs(a[1] - b[1]) + 6, plate: q.plate }; }));
const hit = (a, b, m = 0) => a.plate === b.plate && a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const hard = () => [...L.walls.map(wallBox), ...convBoxes()];
L.racks = L.racks.filter((r, i) => !hard().some((b) => hit(r, b, .5)) && !L.racks.slice(0, i).some((o) => hit(r, o, 1)) && !L.lifts.some((l) => hit(r, l, 1)));
L.machines = L.machines.filter((m) => m.type === "dock" || !hard().some((b) => hit(m, b, .3)) || m.type === "injection");
L.columns = L.columns.filter((c) => { const b = { x: c.p[0] - 1.6, y: c.p[1] - 1.6, w: 3.2, h: 3.2, plate: c.plate }; return ![...L.racks, ...L.machines, ...L.lifts, ...convBoxes()].some((r) => hit(b, r, .3)); });
L.rooms = L.rooms.filter((r) => r.label !== "Area" && r.label !== "Plan area");

/* ---------- 2. the floor as a grid ---------- */
function grid(plate, x0, y0, x1, y1) {
  const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL), blocked = new Uint8Array(nx * ny);
  const rect = (x, y, w, h) => { for (let j = Math.floor((y - y0) / CELL); j <= Math.ceil((y + h - y0) / CELL); j++) for (let i = Math.floor((x - x0) / CELL); i <= Math.ceil((x + w - x0) / CELL); i++) if (i >= 0 && j >= 0 && i < nx && j < ny) blocked[j * nx + i] = 1; };
  for (const w of L.walls) if (w.plate === plate) { const [a, b] = [w.a, w.b]; rect(Math.min(a[0], b[0]) - .6, Math.min(a[1], b[1]) - .6, Math.abs(a[0] - b[0]) + 1.2, Math.abs(a[1] - b[1]) + 1.2); }
  for (const r of [...L.racks, ...L.machines, ...L.trucks]) if (r.plate === plate) rect(r.x, r.y, r.w, r.h);
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
const needOf = (m) => m.effectiveWidth / (2 * CELL) + .5, FORK = { name: "forklift", effectiveWidth: 3.2 * M }, AGV = { name: "agv", effectiveWidth: 2.4 * M }, TROLLEY = { name: "trolley", effectiveWidth: 3.6 * M };
const free = (g, p, need) => { const k = g.index(p); return k !== undefined && !g.blocked[k] && g.clearance[k] >= need; };
const nearestFree = (g, p, need) => { for (let r = 0; r < 60; r++) for (let a = 0; a < 24; a++) { const q = { x: p[0] + Math.cos(a / 24 * 6.283) * r * CELL * .7, y: p[1] + Math.sin(a / 24 * 6.283) * r * CELL * .7 }; if (free(g, q, need)) return snap(g, q); } return null; };
const out = (p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
// Square routes: Dijkstra over (cell, heading) with four directions only. A turn costs as much as 14 m of straight run, so
// paths are long clean straights with few 90 degree corners, and running close to obstacles costs extra, so they hold the lane centre.
// Same floor model as 3D-Modeling's findRoute (blocked cells + clearance), which allows diagonals; this one must not.
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]], TURN = 14 / L.scale;
function ortho(g, from, to, need, label) {
  const s = g.index(from), e = g.index(to), N = g.nx * g.ny;
  if (s === undefined || e === undefined) throw new Error(`OUTSIDE ${label}`);
  const dist = new Float64Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1), heap = [];
  const push = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { let c = i * 2 + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[i][0] <= heap[c][0]) break; [heap[c], heap[i]] = [heap[i], heap[c]]; i = c; } } return t; };
  for (let d = 0; d < 4; d++) { dist[s * 4 + d] = 0; push(s * 4 + d, 0); }
  let end = -1;
  while (heap.length) {
    const [d0, st] = pop(); if (d0 > dist[st]) continue; const k = st >> 2, dir = st & 3; if (k === e) { end = st; break; }
    const x = k % g.nx, y = (k - x) / g.nx;
    for (let nd = 0; nd < 4; nd++) {
      if ((nd + 2) % 4 === dir) continue;
      const a = x + DIRS[nd][0], b = y + DIRS[nd][1]; if (a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue;
      const n = b * g.nx + a; if (g.blocked[n] || g.clearance[n] < need) continue;
      const near = Math.max(0, need * 2.2 - g.clearance[n]) * 1.6, c = d0 + CELL * (1 + near) + (nd === dir ? 0 : TURN), ns = n * 4 + nd;
      if (c < dist[ns]) { dist[ns] = c; prev[ns] = st; push(ns, c); }
    }
  }
  if (end < 0) throw new Error(`NO ROUTE ${label}`);
  const pts = []; for (let st = end; st !== -1; st = prev[st]) { const k = st >> 2, i = k % g.nx; pts.push(g.point(i, (k - i) / g.nx)); }
  pts.reverse(); const o = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const a = o[o.length - 1], b = pts[i], c = pts[i + 1]; if (!((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) o.push(b); }
  if (pts.length > 1) o.push(pts[pts.length - 1]); return o;
}
const snap = (g, p) => { const k = g.index(p), i = k % g.nx; return g.point(i, (k - i) / g.nx); };
function route(plate, from, to, mover, label) { return ortho(grids[plate], from, to, needOf(mover), label); }
/* ---------- 3. stations and the trolley's journey ---------- */
const pad = {}; const station = (id, need = needOf(TROLLEY)) => { if (pad[id]) return pad[id]; const n = D.nodes[id], q = nearestFree(grids[plateOf(n.x, n.y)], [n.x, n.y], need); if (!q) throw new Error("no free pad for " + id); pad[id] = q; return q; };
const E = D.elevator, need0 = needOf(TROLLEY), low = nearestFree(grids["E2-1F"], E.low, need0), high = nearestFree(grids["E2-2F"], [742, 282], need0); E.low = out(low); E.high = out(high);
const gateLCM = nearestFree(grids["E2-2F"], [716, 282], need0), gateMain = nearestFree(grids["E1"], [223, 166], need0);
for (const f of D.flows) {
  let at = station(f.steps[0].node);
  f.steps.forEach((s, i) => {
    if (i === 0) return; if (s.path === "lift") { at = high; return; }
    const here = plateOf(at.x, at.y);
    if (s.title === "To LCM") { const p = route(here, at, gateLCM, TROLLEY, f.name + " " + s.title).map(out); D.nodes[s.node].y = p[p.length - 1][1]; s.path = [...p, [D.nodes[s.node].x, p[p.length - 1][1]]]; return; }
    if (s.title === "To Main") { const p = route(here, at, gateMain, TROLLEY, f.name + " " + s.title).map(out); D.nodes[s.node].x = p[p.length - 1][0]; s.path = [...p, [p[p.length - 1][0], 131]]; return; }
    const to = s.title === "To Elev 5" ? low : station(s.node); s.path = route(here, at, to, TROLLEY, f.name + " " + s.title).map(out); at = to;
  });
}
for (const [id, q] of Object.entries(pad)) { D.nodes[id].x = out(q)[0]; D.nodes[id].y = out(q)[1]; }
D.nodes[134].x = E.low[0]; D.nodes[134].y = E.low[1];
// painted lanes: the unique straight runs of every flow, for the floor markings
const seen = new Set(); L.lanes = [];
for (const f of D.flows) for (const s of f.steps) if (Array.isArray(s.path)) for (let i = 1; i < s.path.length; i++) { const a = s.path[i - 1], b = s.path[i], k = [a, b].flat().join(); if (!seen.has(k)) { seen.add(k); L.lanes.push([a, b]); } }

/* ---------- 4. vehicles ---------- */
L.routes = [];
// vehicles never share floor with the trolley lanes or with each other: every finished route becomes an obstacle for the next
function reclear(g) { const { nx, ny, blocked, clearance } = g; clearance.fill(1e9); for (let k = 0; k < blocked.length; k++) if (blocked[k]) clearance[k] = 0; const rx = (k, n, d) => { if (clearance[n] + d < clearance[k]) clearance[k] = clearance[n] + d; }; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (i) rx(k, k - 1, 1); if (j) rx(k, k - nx, 1); if (i && j) rx(k, k - nx - 1, 1.41); if (j && i < nx - 1) rx(k, k - nx + 1, 1.41); } for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (i < nx - 1) rx(k, k + 1, 1); if (j < ny - 1) rx(k, k + nx, 1); if (i < nx - 1 && j < ny - 1) rx(k, k + nx + 1, 1.41); if (i && j < ny - 1) rx(k, k + nx - 1, 1.41); } }
function blockPath(pts, half) { for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], p = plateOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), g = grids[p], x0 = Math.min(a[0], b[0]) - half, x1 = Math.max(a[0], b[0]) + half, y0 = Math.min(a[1], b[1]) - half, y1 = Math.max(a[1], b[1]) + half; for (let y = y0; y <= y1; y += CELL / 2) for (let x = x0; x <= x1; x += CELL / 2) { const k = g.index({ x, y }); if (k !== undefined) g.blocked[k] = 1; } } }
for (const f of D.flows) for (const s of f.steps) if (Array.isArray(s.path)) blockPath(s.path, 1.8 * M);
blockPath([E.low, [E.low[0], E.low[1]]], 3 * M); Object.values(grids).forEach(reclear);
// the largest free square circuit on a floor: every side must keep the vehicle's clearance; lanes and earlier circuits are obstacles
function findLoop(plate, mover) {
  const g = grids[plate], need = needOf(mover), ok = (i, j) => { const k = j * g.nx + i; return !g.blocked[k] && g.clearance[k] >= need; };
  const sideH = (j, a, b) => { for (let i = a; i <= b; i++) if (!ok(i, j)) return false; return true; }, sideV = (i, a, b) => { for (let j = a; j <= b; j++) if (!ok(i, j)) return false; return true; };
  let best = null, score = 0;
  for (let j = 2; j < g.ny - 12; j += 3) for (let i = 2; i < g.nx - 12; i += 3) { if (!ok(i, j)) continue;
    for (let w = 12; i + w < g.nx - 1; w += 3) { if (!ok(i + w, j)) break; if (!sideH(j, i, i + w)) break;
      for (let h = 10; j + h < g.ny - 1; h += 3) { if (!sideV(i, j, j + h)) break; if (!sideV(i + w, j, j + h) || !sideH(j + h, i, i + w)) continue; const s = (w + h) * Math.min(w, h * 3); if (s > score) { score = s; best = [i, j, w, h]; } } } }
  if (!best) return null; const [i, j, w, h] = best, c = (a, b) => out(g.point(a, b)); return [c(i, j), c(i + w, j), c(i + w, j + h), c(i, j + h), c(i, j)];
}
for (const [kind, plate, mover] of [["forklift", "E1", FORK], ["forklift", "E1", FORK], ["agv", "E2-1F", AGV], ["agv", "E2-2F", AGV]]) {
  const pts = findLoop(plate, mover); if (!pts) { console.log("left out:", kind, plate); continue; }
  L.routes.push({ kind, plate, pts }); blockPath(pts, (kind === "forklift" ? 2.4 : 1.8) * M); reclear(grids[plate]); console.log(`${kind} on ${plate}: circuit ${Math.round(Math.abs(pts[1][0] - pts[0][0]) * L.scale)} x ${Math.round(Math.abs(pts[2][1] - pts[1][1]) * L.scale)} m`);
}
writeFileSync(rf, JSON.stringify(L)); writeFileSync(ff, JSON.stringify(D));
console.log(`racks ${L.racks.length}, columns ${L.columns.length}, walls ${L.walls.length}, stations ${Object.keys(pad).length}, vehicle routes ${L.routes.length}`);
for (const f of D.flows) console.log(`${f.name}: ${Math.round(f.steps.reduce((s, x) => s + (Array.isArray(x.path) ? x.path.slice(1).reduce((d, b, i) => d + Math.hypot(b[0] - x.path[i][0], b[1] - x.path[i][1]), 0) : 0), 0) * L.scale)} m on the floor`);

