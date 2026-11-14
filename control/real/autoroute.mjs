// Auto-route: replace every step of a trolley path that crosses a CAD wall or object with the shortest clear route between the
// same two points (A* on a 0.25 m grid; walls and objects inflated by the trolley's half width), simplified to straight runs.
// Saved as one recorded, undoable command; the engine then re-times the path and the clearance is checked again.
// node control/real/autoroute.mjs [--path inj1-wh | --path all] [--db control/data/real-factory.db]
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../store.js";
import { clearance, runAndSave } from "./path.mjs";

const CELL = 0.25;
export function grid(entities, cadlayers, box, { wallPad = 0.5, objPad = 0.7 } = {}) {
  const [x0, y0, x1, y1] = box, W = Math.ceil((x1 - x0) / CELL), H = Math.ceil((y1 - y0) / CELL), g = new Uint8Array(W * H);
  const mark = (cx0, cy0, cx1, cy1, test) => { for (let j = Math.max(0, Math.floor((cy0 - y0) / CELL)); j <= Math.min(H - 1, Math.floor((cy1 - y0) / CELL)); j++) for (let i = Math.max(0, Math.floor((cx0 - x0) / CELL)); i <= Math.min(W - 1, Math.floor((cx1 - x0) / CELL)); i++) if (test(x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL)) g[j * W + i] = 1; };
  for (const L of cadlayers.filter(l => ["exterior_wall", "wall", "partition"].includes(l.kind))) for (const [ax, ay, bx, by] of L.segments) {
    if (Math.max(ax, bx) < x0 - 1 || Math.min(ax, bx) > x1 + 1 || Math.max(ay, by) < y0 - 1 || Math.min(ay, by) > y1 + 1) continue;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
    mark(Math.min(ax, bx) - wallPad, Math.min(ay, by) - wallPad, Math.max(ax, bx) + wallPad, Math.max(ay, by) + wallPad, (x, y) => { const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); return Math.hypot(x - ax - t * dx, y - ay - t * dy) < wallPad; });
  }
  for (const e of entities) {
    if (!e.size_m || ["zone", "transporter", "worker"].includes(e.category) || e.prefab_id === "RFID_GATE" || (e.transform.position_m[2] || 0) > 3) continue;
    const [cx, cy] = e.transform.position_m, a = -(e.transform.yaw_deg || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hl = e.size_m[0] / 2 + objPad, hd = e.size_m[1] / 2 + objPad, r = Math.hypot(hl, hd);
    if (cx + r < x0 || cx - r > x1 || cy + r < y0 || cy - r > y1) continue;
    mark(cx - r, cy - r, cx + r, cy + r, (x, y) => { const dx = x - cx, dy = y - cy; return Math.abs(dx * c - dy * s) <= hl && Math.abs(dx * s + dy * c) <= hd; });
  }
  return { g, W, H, x0, y0 };
}

export function astar(G, a, b) {
  const { g, W, H, x0, y0 } = G, idx = (x, y) => Math.max(0, Math.min(H - 1, Math.floor((y - y0) / CELL))) * W + Math.max(0, Math.min(W - 1, Math.floor((x - x0) / CELL)));
  const s = idx(...a), t = idx(...b), free = k => !g[k];
  for (const k of [s, t]) { const i = k % W, j = (k / W) | 0; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < W && jj < H) g[jj * W + ii] = 0; } }   // stops stand at devices: free their spot
  const N = W * H, cost = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), dirOf = new Int8Array(N).fill(-1), heap = [];
  const ti = t % W, tj = (t / W) | 0, h = k => { const dx = Math.abs(k % W - ti), dy = Math.abs(((k / W) | 0) - tj); return (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)); };
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  cost[s] = 0; push(h(s), s);
  while (heap.length) { const [, k] = pop(); if (k === t) break; const i = k % W, j = (k / W) | 0;
    for (let d = 0; d < 8; d++) { const ii = i + D[d][0], jj = j + D[d][1]; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; const n = jj * W + ii; if (!free(n)) continue;
      if (d >= 4 && (!free(j * W + ii) || !free(jj * W + i))) continue;   // no corner cutting
      const c = cost[k] + D[d][2] + (dirOf[k] >= 0 && dirOf[k] !== d ? 0.6 : 0); if (c < cost[n]) { cost[n] = c; from[n] = k; dirOf[n] = d; push(c + h(n), n); } } }
  if (from[t] < 0 && s !== t) return null;
  const cells = []; for (let k = t; k >= 0; k = from[k]) { cells.push(k); if (k === s) break; } cells.reverse();
  const pt = k => [x0 + (k % W + 0.5) * CELL, y0 + (((k / W) | 0) + 0.5) * CELL];
  const clear = (p, q) => { const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (CELL / 2)); for (let m = 0; m <= n; m++) if (!free(idx(p[0] + (q[0] - p[0]) * m / n, p[1] + (q[1] - p[1]) * m / n))) return false; return true; };
  const pts = [a]; let i = 0; const seq = [a, ...cells.slice(1, -1).map(pt), b];   // string pulling: keep only the turns that are needed
  while (i < seq.length - 1) { let j = seq.length - 1; while (j > i + 1 && !clear(seq[i], seq[j])) j--; pts.push(seq[j]); i = j; }
  return pts.map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
}

export function autoRoutePath(path, entities, cadlayers) {
  const routes = (path.routes || []).map(r => (r || []).map(p => [...p])), changed = [];
  for (let i = 1; i < routes.length; i++) {
    const r = routes[i]; if (!r || r.length < 2 || path.steps?.[i]?.lift || r.some(p => (p[2] || 0) > 0.5)) continue;   // the CAD covers the 1st floor only
    const c = clearance({ ...path, routes: [r] }, entities, cadlayers); if (!c.objects.length && !c.walls.length) continue;
    const xs = r.map(p => p[0]), ys = r.map(p => p[1]), box = [Math.min(...xs) - 40, Math.min(...ys) - 40, Math.max(...xs) + 40, Math.max(...ys) + 40];
    const nr = astar(grid(entities, cadlayers, box), r[0], r.at(-1));
    if (nr) { routes[i] = nr.map(p => [p[0], p[1], 0]); changed.push({ step: i, before_m: +len(r).toFixed(1), after_m: +len(nr).toFixed(1), cleared: c.objects.map(o => o.id).concat(c.walls.map(w => "wall@" + w.at.join(","))) }); }
    else changed.push({ step: i, failed: true });
  }
  return { routes, changed };
}
const len = p => p.reduce((a, q, k) => k ? a + Math.hypot(q[0] - p[k - 1][0], q[1] - p[k - 1][1]) : 0, 0);

export function autoRoute(store, pathId, actor = "auto-route") {
  const P = store.get("path", pathId); if (!P) throw new Error(`no path ${pathId}`);
  const ents = store.all("entity").map(r => r.data), cad = store.all("cadlayer").map(r => r.data), { routes, changed } = autoRoutePath(P.data, ents, cad);
  if (!changed.some(c => !c.failed)) return { path: pathId, changed, note: "route already clear" };
  const after = clearance({ ...P.data, routes }, ents, cad), notes = [...(P.data.notes || []).filter(n => !/^Auto-routed|^Clearance vs CAD/.test(n)),
    `Auto-routed ${new Date().toISOString().slice(0, 10)}: steps ${changed.filter(c => !c.failed).map(c => c.step + 1).join(", ")} rerouted around CAD walls and objects (A*, 0.25 m grid, trolley clearance 0.7 m).`,
    `Clearance vs CAD: ${after.objects.length} object(s) on the route, ${after.walls.length} wall crossing(s).`];
  const r = store.command({ actor, type: "record.update", payload: { type: "path", id: pathId, set: { routes, notes, clearance: { checked: new Date().toISOString().slice(0, 10), objects_on_route: after.objects, walls_crossed: after.walls, auto_routed: changed } }, label: `auto-route ${pathId}` } });
  if (!r.ok) throw new Error(r.reason);
  const run = runAndSave(store, pathId, actor);
  return { path: pathId, revision: r.revision, changed, clash_after: after.objects.length + after.walls.length, run: run.id, trip_s: run.trip_s, distance_m: run.distance_m };
}

if (process.argv[1]?.endsWith("autoroute.mjs")) {
  const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
  const S = await Store.open(arg("db", resolve(dirname(fileURLToPath(import.meta.url)), "../data/real-factory.db"))), which = arg("path", "all");
  for (const p of S.all("path").filter(p => which === "all" || p.id === which)) console.log(JSON.stringify(autoRoute(S, p.id)));
  S.close();
}
