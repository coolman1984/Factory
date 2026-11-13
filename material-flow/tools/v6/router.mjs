// Axis-aligned trolley router on one plate of a project (V6). 1-unit grid over the plate zone; every replica solid is rasterised,
// a two-pass distance transform gives each cell its clearance (units to the nearest solid). A straight move needs clearance for the
// trolley's half width plus a margin; a corner needs its whole turning circle. A* over (cell, heading) with a turn penalty and a
// small pull toward aisle centres, then corners only. Lifts are not obstacles (the trolley drives into the car).
import { TROLLEY } from "../v5/device-dims.mjs";

export const STRAIGHT = TROLLEY.halfW + 0.9;                                        // 2.54 units: half width + 27 cm
export const TURN = Math.hypot(TROLLEY.halfW, TROLLEY.halfL) + 0.45;                 // 3.78 units: turning circle + 13 cm

export function solidsOf(R, plate, extra = []) {
  const out = [];
  for (const w of R.walls || []) if (w.plate === plate) {
    const [ax, ay] = w.a, [bx, by] = w.b, t = 0.75, e = 0.75;
    if (Math.abs(ax - bx) < 1e-6 || Math.abs(ay - by) < 1e-6) out.push([Math.min(ax, bx) - (Math.abs(ax - bx) < 1e-6 ? t : e), Math.min(ay, by) - (Math.abs(ay - by) < 1e-6 ? t : e), Math.max(ax, bx) + (Math.abs(ax - bx) < 1e-6 ? t : e), Math.max(ay, by) + (Math.abs(ay - by) < 1e-6 ? t : e)]);
    else { const n = Math.ceil(Math.hypot(bx - ax, by - ay)); for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; out.push([x - t, y - t, x + t, y + t]); } }
  }
  for (const q of R.columns || []) if (q.plate === plate) out.push([q.p[0] - 1.45, q.p[1] - 1.45, q.p[0] + 1.45, q.p[1] + 1.45]);
  for (const k of ["racks", "machines", "pallets", "decks"]) for (const o of R[k] || []) if (o.plate === plate && k !== "decks") out.push([o.x, o.y, o.x + o.w, o.y + o.h]);
  return out.concat(extra);
}

export function makeGrid(zone, solids) {
  const x0 = Math.floor(zone[0]), y0 = Math.floor(zone[1]), W = Math.ceil(zone[2]) - x0, H = Math.ceil(zone[3]) - y0;
  const occ = new Uint8Array(W * H);
  for (const r of solids) {
    const i0 = Math.max(0, Math.floor(r[0] - x0)), i1 = Math.min(W - 1, Math.ceil(r[2] - x0) - 1), j0 = Math.max(0, Math.floor(r[1] - y0)), j1 = Math.min(H - 1, Math.ceil(r[3] - y0) - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) occ[j * W + i] = 1;
  }
  // chamfer 3-4 distance transform (units), border counts as solid
  const INF = 1e9, d = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) d[k] = occ[k] ? 0 : INF;
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : d[j * W + i]);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (!d[k]) continue; d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414); }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; if (!d[k]) continue; d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414); }
  // clearance measured from the cell centre to the solid edge: subtract half a cell
  for (let k = 0; k < W * H; k++) d[k] = Math.max(0, d[k] - 0.5);
  return { x0, y0, W, H, d, cl: (x, y) => { const i = Math.floor(x - x0), j = Math.floor(y - y0); return i < 0 || j < 0 || i >= W || j >= H ? 0 : d[j * W + i]; }, centre: (x, y) => [Math.floor(x - x0) + x0 + .5, Math.floor(y - y0) + y0 + .5] };
}

/** Nearest cell (to [x, y]) where the trolley can stop and turn, reachable from `from` if given. */
export function snap(g, x, y, need = TURN, reachFrom = null) {
  let reach = null;
  if (reachFrom) {   // flood the straight-free cells from the start
    const s = cellOf(g, ...reachFrom); if (s < 0 || g.d[s] < STRAIGHT) return null;
    reach = new Uint8Array(g.W * g.H); const q = [s]; reach[s] = 1;
    while (q.length) { const k = q.pop(), i = k % g.W, j = (k / g.W) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.W || jj >= g.H) continue; const kk = jj * g.W + ii; if (!reach[kk] && g.d[kk] >= STRAIGHT) { reach[kk] = 1; q.push(kk); } } }
  }
  let best = null, bd = Infinity;
  for (let j = 0; j < g.H; j++) for (let i = 0; i < g.W; i++) {
    const k = j * g.W + i; if (g.d[k] < need || (reach && !reach[k])) continue;
    const cx = g.x0 + i + .5, cy = g.y0 + j + .5, dd = (cx - x) ** 2 + (cy - y) ** 2; if (dd < bd) { bd = dd; best = [cx, cy]; }
  }
  return best;
}
const cellOf = (g, x, y) => { const i = Math.floor(x - g.x0), j = Math.floor(y - g.y0); return i < 0 || j < 0 || i >= g.W || j >= g.H ? -1 : j * g.W + i; };

/** A* from a to b (both cell centres). Returns the corner points [[x,y],...] or null. */
export function route(g, a, b, { turnCost = 14, centre = 5 } = {}) {
  const s = cellOf(g, ...a), t = cellOf(g, ...b); if (s < 0 || t < 0 || g.d[s] < STRAIGHT || g.d[t] < STRAIGHT) return null;
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]], N = g.W * g.H, cost = new Float64Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1);
  const ti = t % g.W, tj = (t / g.W) | 0;
  // binary heap of [f, state]
  const heap = [], push = (f, s2) => { heap.push([f, s2]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (k) => Math.abs(k % g.W - ti) + Math.abs(((k / g.W) | 0) - tj);
  for (let dir = 0; dir < 4; dir++) { cost[s * 4 + dir] = 0; push(h(s), s * 4 + dir); }
  let goal = -1;
  while (heap.length) {
    const [priority, st] = pop(), k = st >> 2, dir = st & 3, c = cost[st];
    if (priority > c + h(k) + 1e-4) continue;   // obsolete heap entry
    if (k === t) { goal = st; break; }
    const i = k % g.W, j = (k / g.W) | 0;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === ((dir + 2) & 3)) continue;   // no reversing in place
      const turn = nd !== dir; if (turn && g.d[k] < TURN && k !== s) continue;
      const ii = i + D[nd][0], jj = j + D[nd][1]; if (ii < 0 || jj < 0 || ii >= g.W || jj >= g.H) continue;
      const kk = jj * g.W + ii; if (g.d[kk] < STRAIGHT) continue;
      const nc = c + 1 + centre / Math.max(1, g.d[kk]) + (turn ? turnCost : 0), ns = kk * 4 + nd;
      if (nc < cost[ns]) { cost[ns] = nc; prev[ns] = st; push(nc + h(kk), ns); }
    }
  }
  if (goal < 0) return null;
  const cells = []; for (let st = goal; st >= 0; st = prev[st]) cells.push(st >> 2);
  cells.reverse();
  const pts = cells.map((k) => [g.x0 + k % g.W + .5, g.y0 + ((k / g.W) | 0) + .5]);
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const p = out[out.length - 1], q = pts[i], r = pts[i + 1]; if ((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) !== 0) out.push(q); }
  if (pts.length > 1) out.push(pts[pts.length - 1]);
  return out;
}
