// One trolley path through the Factory Engine: each step is a transport leg whose travel time comes from the true route
// length (metres, from the master data) and the push or AGV speed, plus the step's wait. The engine decides every instant;
// the timeline it returns drives the 2D map and the 3D film, and the run is saved with all its events.
import { World } from "../../engine/src/world.js";

import { timePath } from "./timing.js";
export { pathModel } from "./timing.js";
export function runPath(path, stopsById) { const t0 = performance.now(), r = timePath(World, path, stopsById); return { ...r, ms: performance.now() - t0 }; }

// Run and save in the Control Center database (scenario "path:<id>"); the timeline is kept in the run report.
export function runAndSave(store, pathId, actor = "engine") {
  const P = store.get("path", pathId); if (!P) throw new Error(`no path ${pathId}`);
  const stops = Object.fromEntries(store.all("stop").map(r => [r.id, r.data]));
  const r = runPath(P.data, stops), id = store.saveRun({ scenario: "path:" + pathId, actor, note: "engine timing of " + (P.data.name || pathId), model: r.model, world: r.world, kpis: r.kpis, report: { ...r.report, timeline: r.timeline }, ms: r.ms });
  return { id, ...r.kpis, timeline: r.timeline };
}

// Route clearance against the true CAD layout: objects whose footprint (plus the trolley's half width) the route crosses, and
// walls the route passes through. Returns { objects: [{ id, name, at:[x,y] }], walls: [{ layer, at:[x,y] }] }.
export function clearance(path, entities, cadlayers, halfWidth = 0.6) {
  const pts = []; for (const r of path.routes || []) for (let i = 1; i < (r || []).length; i++) { const [a, b] = [r[i - 1], r[i]]; if ((a[2] || 0) > 0.5 || (b[2] || 0) > 0.5) continue; const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25)); for (let k = 0; k <= n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  const objects = [];
  for (const e of entities) {
    if (!e.size_m || ["zone", "transporter", "worker"].includes(e.category) || e.prefab_id === "RFID_GATE" || (e.transform.position_m[2] || 0) > 3) continue;   // gates are driven through; overhead cranes do not block the floor
    const [cx, cy] = e.transform.position_m, a = -(e.transform.yaw_deg || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hl = e.size_m[0] / 2 + halfWidth, hd = e.size_m[1] / 2 + halfWidth;
    const hit = pts.find(([x, y]) => { const dx = x - cx, dy = y - cy, lx = dx * c - dy * s, ly = dx * s + dy * c; return Math.abs(lx) <= hl && Math.abs(ly) <= hd; });
    if (hit) objects.push({ id: e.entity_id, name: e.name, at: hit.map(v => +v.toFixed(2)) });
  }
  const walls = [], cross = (p, q, r, t) => { const d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]); if (Math.abs(d) < 1e-9) return null; const u = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d, v = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d; return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])] : null; };
  for (const L of cadlayers.filter(l => ["exterior_wall", "wall", "partition"].includes(l.kind) && !(l.z_m > 0))) for (const r of path.routes || []) for (let i = 1; i < (r || []).length; i++) for (const sg of L.segments) { if ((r[i - 1][2] || 0) > 0.5 || (r[i][2] || 0) > 0.5) continue; const x = cross(r[i - 1], r[i], [sg[0], sg[1]], [sg[2], sg[3]]); if (x) walls.push({ layer: L.layer_id, at: x.map(v => +v.toFixed(2)) }); }
  const seen = new Set(); return { objects, walls: walls.filter(w => { const k = w.at.map(v => Math.round(v)).join(); if (seen.has(k)) return false; seen.add(k); return true; }) };
}
