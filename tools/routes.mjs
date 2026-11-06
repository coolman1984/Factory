// Vehicle routes on the reconstructed floor, computed by the 3D-Modeling repo's own route finder (findRoute):
// shortest eight-direction paths that keep a vehicle's full width clear of walls, racks, machines and columns.
import { readFileSync, writeFileSync } from "node:fs";
import { findRoute } from "file:///D:/WORK/Software%20Development/GitHub/3D-Modeling/packages/industry/src/routing.ts";
const file = new URL("../private/replica.json", import.meta.url);
const L = JSON.parse(readFileSync(file, "utf8"));
const CELL = 1.5, M = 1 / L.scale;   // slide points per cell; slide points per metre

function grid(plate, x0, y0, x1, y1) {
  const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL), blocked = new Uint8Array(nx * ny);
  const rect = (x, y, w, h) => { for (let j = Math.floor((y - y0) / CELL); j <= Math.ceil((y + h - y0) / CELL); j++) for (let i = Math.floor((x - x0) / CELL); i <= Math.ceil((x + w - x0) / CELL); i++) if (i >= 0 && j >= 0 && i < nx && j < ny) blocked[j * nx + i] = 1; };
  for (const w of L.walls) if (w.plate === plate) { const [a, b] = [w.a, w.b]; rect(Math.min(a[0], b[0]) - .6, Math.min(a[1], b[1]) - .6, Math.abs(a[0] - b[0]) + 1.2, Math.abs(a[1] - b[1]) + 1.2); }
  for (const r of [...L.racks, ...L.machines, ...L.rooms.filter((q) => q.label === "Room")]) if (r.plate === plate) rect(r.x, r.y, r.w, r.h);
  for (const c of L.columns) if (c.plate === plate) rect(c.p[0] - 1.2, c.p[1] - 1.2, 2.4, 2.4);
  for (const c of L.conveyors) if (c.plate === plate) for (let k = 1; k < c.pts.length; k++) { const a = c.pts[k - 1], b = c.pts[k]; rect(Math.min(a[0], b[0]) - 1, Math.min(a[1], b[1]) - 1, Math.abs(a[0] - b[0]) + 2, Math.abs(a[1] - b[1]) + 2); }
  // clearance in cells: exact distance to the nearest blocked cell (two-pass chamfer is enough at this size)
  const clearance = new Float64Array(nx * ny).fill(1e9);
  for (let k = 0; k < blocked.length; k++) if (blocked[k]) clearance[k] = 0;
  const relax = (k, n, d) => { if (clearance[n] + d < clearance[k]) clearance[k] = clearance[n] + d; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (i) relax(k, k - 1, 1); if (j) relax(k, k - nx, 1); if (i && j) relax(k, k - nx - 1, 1.41); if (j && i < nx - 1) relax(k, k - nx + 1, 1.41); }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (i < nx - 1) relax(k, k + 1, 1); if (j < ny - 1) relax(k, k + nx, 1); if (i < nx - 1 && j < ny - 1) relax(k, k + nx + 1, 1.41); if (i && j < ny - 1) relax(k, k + nx - 1, 1.41); }
  return { minX: x0, minY: y0, nx, ny, cell: CELL, blocked, clearance, point: (i, j) => ({ x: x0 + (i + .5) * CELL, y: y0 + (j + .5) * CELL }), index: (p) => { const i = Math.floor((p.x - x0) / CELL), j = Math.floor((p.y - y0) / CELL); return i < 0 || j < 0 || i >= nx || j >= ny ? undefined : j * nx + i; } };
}
const nearestFree = (g, p, need) => { for (let r = 0; r < 40; r++) for (let a = 0; a < 16; a++) { const q = { x: p[0] + Math.cos(a / 16 * 6.283) * r * CELL, y: p[1] + Math.sin(a / 16 * 6.283) * r * CELL }, k = g.index(q); if (k !== undefined && !g.blocked[k] && g.clearance[k] >= need) return q; } return null; };
function simplify(pts) { const o = [pts[0]]; for (let i = 1; i < pts.length - 1; i++) { const a = o[o.length - 1], b = pts[i], c = pts[i + 1]; if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) > .01) o.push(b); } o.push(pts[pts.length - 1]); return o.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]); }

const grids = { "E1": grid("E1", 21, 157, 551, 494), "E2-1F": grid("E2-1F", 555, 305, 911, 443), "E2-2F": grid("E2-2F", 724, 143, 947, 303) };
const FORK = { name: "forklift", effectiveWidth: 3.5 * M }, AGV = { name: "agv", effectiveWidth: 2.2 * M };
const missions = [
  { kind: "forklift", plate: "E1", mover: FORK, stops: [[227, 410], [225, 300], [250, 210], [227, 410]] },
  { kind: "forklift", plate: "E1", mover: FORK, stops: [[300, 410], [384, 400], [384, 240], [340, 225], [300, 410]] },
  { kind: "forklift", plate: "E1", mover: FORK, stops: [[245, 410], [212, 195], [340, 200], [245, 410]] },
  { kind: "agv", plate: "E2-1F", mover: AGV, stops: [[640, 372], [890, 372], [640, 372]] },
  { kind: "agv", plate: "E2-2F", mover: AGV, stops: [[812, 200], [870, 280], [812, 280], [812, 200]] },
];
L.routes = [];
for (const m of missions) {
  const g = grids[m.plate], need = m.mover.effectiveWidth / (2 * CELL) + .5, stops = m.stops.map((s) => nearestFree(g, s, need));
  if (stops.some((s) => !s)) { console.log(`NO FREE STOP for ${m.kind} on ${m.plate}`); continue; }
  let path = [], metres = 0, ok = true;
  for (let i = 1; i < stops.length; i++) { const r = findRoute(g, stops[i - 1], stops[i], m.mover); if (!r.reachable) { console.log(`NO ROUTE ${m.kind} ${m.plate} leg ${i}: ${r.reason}`); ok = false; break; } path.push(...r.points); metres += r.distance * L.scale; }
  if (ok) { const pts = simplify(path); L.routes.push({ kind: m.kind, plate: m.plate, pts, metres: Math.round(metres) }); console.log(`${m.kind} on ${m.plate}: ${Math.round(metres)} m, ${pts.length} points`); }
}
writeFileSync(file, JSON.stringify(L));
