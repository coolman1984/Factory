// One trolley path through the Factory Engine: each step is a transport leg whose travel time comes from the true route
// length (metres, from the master data) and the push or AGV speed, plus the step's wait. The engine decides every instant;
// the timeline it returns drives the 2D map and the 3D film, and the run is saved with all its events.
import { World } from "../../engine/src/world.js";

const len = pts => { let d = 0; for (let i = 1; i < (pts || []).length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; };

export function pathModel(path, stops) {
  const steps = path.steps || [], routes = path.routes || [], TPS = 1000, R = s => Math.round(s * TPS) / TPS;
  if (steps.length < 2) throw new Error(`path ${path.path_id}: needs at least two steps`);
  const ids = [...new Set(steps.map(s => s.stop))];
  for (const id of ids) if (!stops[id]) throw new Error(`path ${path.path_id}: stop ${id} does not exist`);
  const model = { format: "fe-model", version: 1, name: "path:" + path.path_id, tickPerSecond: TPS, seed: 1, items: [{ id: "lot", unit: "lot" }],
    locations: ids.map(id => ({ id, kind: "stop" })), pools: [{ id: "trolleys", kind: "carrier", units: [{ id: path.trolley_entity_id || "trolley", node: steps[0].stop }] }],
    initial: { stock: [{ location: steps[0].stop, item: "lot", qty: 1 }] } };
  const legs = steps.slice(1).map((s, k) => { const i = k + 1, pts = routes[i] && routes[i].length > 1 ? routes[i] : [stops[steps[i - 1].stop].position_m, stops[s.stop].position_m].map(p => [p[0], p[1]]);
    const d = len(pts), v = s.mode === "agv" ? path.agv_speed_mps || 1.2 : path.push_speed_mps || 1.0; return { i, stop: s.stop, mode: s.mode, dist: d, travel: R(d / v), wait: R(s.wait_s || 0), pts }; });
  const actions = [{ k: "load", seconds: R(steps[0].wait_s || 0) }, ...legs.map(l => ({ k: "leg", to: l.stop, travelSeconds: l.travel, dwellSeconds: l.wait, label: steps[l.i].title || l.stop, ref: l.i })), { k: "unload", seconds: 0 }];
  const mission = { item: "lot", qty: 1, from: steps[0].stop, to: steps.at(-1).stop, carrier: path.trolley_entity_id || "trolley", actions, label: path.name || path.path_id };
  return { model, mission, legs };
}

// Run the engine; returns { timeline, kpis, model, world, report }. timeline.steps[i] = { stop, mode, t0, tm, t1, dist, pts }.
export function runPath(path, stopsById) {
  const t0 = performance.now(), { model, mission, legs } = pathModel(path, stopsById), world = new World(model, { checkInvariants: true });
  const res = world.submit({ command_id: "trip:" + path.path_id, type: "transport.request", payload: mission });
  if (!res.ok) throw new Error(`engine refused path ${path.path_id}: ${res.reason}`);
  world.runToEnd();
  const tps = model.tickPerSecond, at = new Map();
  for (const e of world.log) if (e.mission === res.result.mission && e.action != null) { if (!at.has(e.action)) at.set(e.action, {}); at.get(e.action)[e.type] = e.t / tps; }
  const load = at.get(0) || {}, first = path.steps[0];
  const steps = [{ i: 0, stop: first.stop, mode: first.mode, t0: load["load.start"] ?? 0, tm: load["load.start"] ?? 0, t1: load["load.end"] ?? 0, dist: 0, pts: [stopsById[first.stop].position_m.slice(0, 2)], title: first.title || first.stop }];
  for (const l of legs) { const e = at.get(l.i) || {}; steps.push({ i: l.i, stop: l.stop, mode: l.mode, t0: e["leg.start"], tm: e["leg.arrive"], t1: e["leg.end"], dist: +l.dist.toFixed(2), pts: l.pts, title: path.steps[l.i].title || l.stop }); }
  steps[0].t1 = steps[1]?.t0 ?? steps[0].t1;   // the first wait (item slip) ends when the trolley leaves
  const report = world.report(), trip = steps.at(-1).t1, dist = legs.reduce((a, l) => a + l.dist, 0);
  const kpis = { kind: "path", path: path.path_id, name: path.name, trip_s: +trip.toFixed(1), distance_m: +dist.toFixed(1), push_m: +legs.filter(l => l.mode !== "agv").reduce((a, l) => a + l.dist, 0).toFixed(1),
    agv_m: +legs.filter(l => l.mode === "agv").reduce((a, l) => a + l.dist, 0).toFixed(1), steps: steps.length, invariants: report.invariants.length, events: world.log.length, finished_total: 1, bottleneck: null };
  return { timeline: { path: path.path_id, name: path.name, color: path.color, total_s: trip, steps }, kpis, model, world, report, ms: performance.now() - t0 };
}

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
  const pts = []; for (const r of path.routes || []) for (let i = 1; i < (r || []).length; i++) { const [a, b] = [r[i - 1], r[i]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25)); for (let k = 0; k <= n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  const objects = [];
  for (const e of entities) {
    if (!e.size_m || ["zone", "transporter", "worker"].includes(e.category) || e.prefab_id === "RFID_GATE" || (e.transform.position_m[2] || 0) > 3) continue;   // gates are driven through; overhead cranes do not block the floor
    const [cx, cy] = e.transform.position_m, a = -(e.transform.yaw_deg || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hl = e.size_m[0] / 2 + halfWidth, hd = e.size_m[1] / 2 + halfWidth;
    const hit = pts.find(([x, y]) => { const dx = x - cx, dy = y - cy, lx = dx * c - dy * s, ly = dx * s + dy * c; return Math.abs(lx) <= hl && Math.abs(ly) <= hd; });
    if (hit) objects.push({ id: e.entity_id, name: e.name, at: hit.map(v => +v.toFixed(2)) });
  }
  const walls = [], cross = (p, q, r, t) => { const d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]); if (Math.abs(d) < 1e-9) return null; const u = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d, v = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d; return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])] : null; };
  for (const L of cadlayers.filter(l => ["exterior_wall", "wall", "partition"].includes(l.kind))) for (const r of path.routes || []) for (let i = 1; i < (r || []).length; i++) for (const sg of L.segments) { const x = cross(r[i - 1], r[i], [sg[0], sg[1]], [sg[2], sg[3]]); if (x) walls.push({ layer: L.layer_id, at: x.map(v => +v.toFixed(2)) }); }
  const seen = new Set(); return { objects, walls: walls.filter(w => { const k = w.at.map(v => Math.round(v)).join(); if (seen.has(k)) return false; seen.add(k); return true; }) };
}
