// Engine timing of one trolley path, shared by Node (control/real/path.mjs) and the browser (V9 player): every step is an
// engine transport leg; travel = true route length / push or AGV speed, an elevator step = the lift ride (one shared lift
// resource per elevator), plus the step's wait. Pass the engine's World class (engine/src/world.js or window.FactoryEngine).
const len2 = pts => { let d = 0; for (let i = 1; i < (pts || []).length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; };
export function pathModel(path, stops) {
  const steps = path.steps || [], routes = path.routes || [], TPS = 1000, R = s => Math.round(s * TPS) / TPS;
  if (steps.length < 2) throw new Error(`path ${path.path_id}: needs at least two steps`);
  const ids = [...new Set(steps.map(s => s.stop))]; for (const id of ids) if (!stops[id]) throw new Error(`path ${path.path_id}: stop ${id} does not exist`);
  const lifts = [...new Set(steps.filter(s => s.lift).map(s => "lift:" + s.lift))];
  const model = { format: "fe-model", version: 1, name: "path:" + path.path_id, tickPerSecond: TPS, seed: 1, items: [{ id: "lot", unit: "lot" }],
    locations: ids.map(id => ({ id, kind: "stop" })), pools: [{ id: "trolleys", kind: "carrier", units: [{ id: path.trolley_entity_id || "trolley", node: steps[0].stop }] }, ...lifts.map(id => ({ id, kind: "lift", units: [{ id: id + ":car" }] }))],
    initial: { stock: [{ location: steps[0].stop, item: "lot", qty: 1 }] } };
  const legs = steps.slice(1).map((s, k) => { const i = k + 1, a = stops[steps[i - 1].stop].position_m, b = stops[s.stop].position_m;
    const pts = s.lift ? [a, b].map(p => [p[0], p[1], p[2] || 0]) : routes[i] && routes[i].length > 1 ? routes[i] : [a, b].map(p => [p[0], p[1], p[2] || 0]);
    const d = s.lift ? 0 : len2(pts), v = s.mode === "agv" ? path.agv_speed_mps || 1.2 : path.push_speed_mps || 1.0;
    return { i, stop: s.stop, mode: s.mode, lift: s.lift || null, dist: d, travel: R(s.lift ? (path.lift_s ?? 60) : d / v), wait: R(s.wait_s || 0), pts }; });
  const actions = [{ k: "load", seconds: R(steps[0].wait_s || 0) }, ...legs.map(l => ({ k: "leg", to: l.stop, travelSeconds: l.travel, dwellSeconds: l.wait, lift: l.lift ? "lift:" + l.lift : null, label: steps[l.i].title || l.stop, ref: l.i })), { k: "unload", seconds: 0 }];
  return { model, legs, mission: { item: "lot", qty: 1, from: steps[0].stop, to: steps.at(-1).stop, carrier: path.trolley_entity_id || "trolley", actions, label: path.name || path.path_id } };
}
export function timePath(World, path, stops) {
  const { model, mission, legs } = pathModel(path, stops), world = new World(model, { checkInvariants: true });
  const res = world.submit({ command_id: "trip:" + path.path_id, type: "transport.request", payload: mission }); if (!res.ok) throw new Error(`engine refused path ${path.path_id}: ${res.reason}`);
  world.runToEnd();
  const tps = model.tickPerSecond, at = new Map(); for (const e of world.log) if (e.mission === res.result.mission && e.action != null) { if (!at.has(e.action)) at.set(e.action, {}); at.get(e.action)[e.type] = e.t / tps; }
  const first = path.steps[0], p0 = stops[first.stop].position_m, steps = [{ i: 0, stop: first.stop, mode: first.mode, t0: 0, tm: 0, t1: 0, dist: 0, pts: [[p0[0], p0[1], p0[2] || 0]], title: first.title || first.stop }];
  for (const l of legs) { const e = at.get(l.i) || {}; steps.push({ i: l.i, stop: l.stop, mode: l.mode, lift: l.lift, t0: e["leg.start"], tm: e["leg.arrive"], t1: e["leg.end"], dist: +l.dist.toFixed(2), pts: l.pts, title: path.steps[l.i].title || l.stop }); }
  steps[0].t1 = steps[1]?.t0 ?? 0;
  const report = world.report(), trip = steps.at(-1).t1, mov = legs.filter(l => !l.lift);
  const kpis = { kind: "path", path: path.path_id, name: path.name, trip_s: +trip.toFixed(1), distance_m: +mov.reduce((a, l) => a + l.dist, 0).toFixed(1), push_m: +mov.filter(l => l.mode !== "agv").reduce((a, l) => a + l.dist, 0).toFixed(1),
    agv_m: +mov.filter(l => l.mode === "agv").reduce((a, l) => a + l.dist, 0).toFixed(1), lift_rides: legs.length - mov.length, steps: steps.length, invariants: report.invariants.length, events: world.log.length, finished_total: 1, bottleneck: null };
  return { timeline: { path: path.path_id, name: path.name, color: path.color, total_s: trip, steps }, kpis, model, world, report };
}
