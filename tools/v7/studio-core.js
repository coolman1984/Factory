/* ===== V7 Studio: core (document, undo, autosave, geometry helpers, router, collision check) =====
   Wrapped by tools/build-v7.mjs into one IIFE together with studio-camera.js, studio-edit.js, studio-director.js and studio-ui.js.
   Plan units: 1 unit = 0.3 m (frame coordinates of the player); x right, y down. World: x = plan x - CX, z = plan y - CY. */
const MF = window.MF; if (!MF || !MF.x) { console.warn("V7 Studio: player internals missing"); return; }
const X = MF.x, T = window.THREE, S = MF.S, D = MF.D, RP = MF.RP, $ = (id) => document.getElementById(id);
const PT_M = MF.PT_M, M = 1 / PT_M, CX = X.CX, CY = X.CY;
const PROJECT = (window.MF7 && window.MF7.id) || window.MF_PROJECT || "project";
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const m2 = (u) => (u * PT_M).toFixed(2);             // plan units -> metres text
const DIMS = window.MF_DEVICE_DIMS || { K: 2.4, DIMS: { pc: { depth: .7, width: 1.45 }, "rfid-auto": { gap: 2.2 * M, post: .16 * M }, "rfid-manual": { depth: .36, width: .36 } }, TROLLEY: { halfW: 1.635, halfL: 2.895, h: 3.98 } };
const TROLLEY = DIMS.TROLLEY || { halfW: 1.635, halfL: 2.895, h: 3.98 };
const ELEVATORS = X.ELEVATORS || [];
const plateKeys = Object.keys(D.plates);
const plateZone = (k) => { const P = D.plates[k]; if (Array.isArray(P.zone)) return P.zone; const b = P.box || [0, 0, 960, 540]; return [b[0], b[1], b[0] + b[2], b[1] + b[3]]; };
const plateOf = (x, y) => X.plateOf(x, y);
const plateLabel = (k) => (D.plates[k] && D.plates[k].label) || k;

/* ---------- the scene document ----------
   The scene file (MF7.scene, format "mf-scene", metres) is the single source of truth. The Studio edits a working copy in the
   player's units (doc) and writes it back as a scene on every change (toScene); fromScene turns a scene into the working copy. */
const SCN = window.MFScene, MF7 = window.MF7 || {}, U7 = 0.3;
const OBJ_OF_PROP = { box: "crate", arrow: "floor-arrow", zone: "floor-zone" }, PROP_OF_OBJ = { crate: "box", "floor-arrow": "arrow", "floor-zone": "zone" };
const REP_NAME_OF = { walls: "wall", columns: "column", racks: "rack", machines: "machine", pallets: "pallet" }, REP_KIND_OF = { wall: "walls", column: "columns", rack: "racks", machine: "machines", pallet: "pallets" };
function fromScene(scene) {
  const res = SCN.toInternal(clone(scene), { plates: D.plates, elevators: X.ELEVATORS || [], replica: RP }, { applyLayout: false }), replica = {};
  for (const e of scene.layoutEdits || []) { const m = /^([a-z]+):(\d+)$/.exec(e.target || ""); if (!m || !REP_KIND_OF[m[1]]) continue; const op = {}; if (e.move) { op.dx = e.move[0] / U7; op.dy = e.move[1] / U7; } if (e.turn) op.rot = e.turn; if (e.delete) op.del = true; replica[REP_KIND_OF[m[1]] + ":" + m[2]] = op; }
  return {
    format: "mf7-work", project: PROJECT, title: scene.title || PROJECT, nodes: res.data.nodes, flows: res.data.flows, devices: res.data.devices,
    props: (scene.objects || []).map((o) => ({ id: o.id, type: PROP_OF_OBJ[o.type] || o.type, name: o.name || "", x: o.x / U7, y: o.y / U7, plate: o.floor, rot: o.heading || 0, w: o.w, d: o.d, h: o.h, color: o.color, text: o.text })),
    replica, doors: clone((scene.layoutEdits || []).filter((e) => e.door)), director: clone(scene.director || {}), takes: clone(scene.takes || []), bookmarks: clone(scene.viewpoints || []),
    settings: Object.assign({ snap: .5, ortho: true, lang: "en", shift: 8 }, clone(scene.studio || {})),
  };
}
function toScene() {
  const sc = SCN.fromInternal(PROJECT, { nodes: doc.nodes, flows: doc.flows.map((f) => Object.assign({}, f, { steps: f.steps.map(cleanStep) })), devices: doc.devices, title: doc.title });
  sc.title = doc.title;
  sc.objects = doc.props.map((p) => { const o = { id: p.id, type: OBJ_OF_PROP[p.type] || p.type, floor: p.plate, x: +(p.x * U7).toFixed(3), y: +(p.y * U7).toFixed(3), heading: p.rot || 0, w: p.w, d: p.d, h: p.h, color: p.color }; if (p.name) o.name = p.name; if (p.text) o.text = p.text; return o; });
  sc.layoutEdits = Object.entries(doc.replica).map(([tag, op]) => { const [k, n] = tag.split(":"), e = { target: REP_NAME_OF[k] + ":" + n }; if (op.dx || op.dy) e.move = [+((op.dx || 0) * U7).toFixed(3), +((op.dy || 0) * U7).toFixed(3)]; if (op.rot) e.turn = op.rot; if (op.del) e.delete = true; return e; }).filter((e) => e.move || e.turn || e.delete);
  sc.layoutEdits = sc.layoutEdits.concat(clone(doc.doors || []));
  sc.director = clone(doc.director); sc.takes = clone(doc.takes); sc.viewpoints = clone(doc.bookmarks); sc.studio = clone(doc.settings);
  return sc;
}
const FLOW_KEYS0 = ["id", "name", "color", "steps", "trolleys", "headway"];
const STEP_KEYS0 = ["node", "title", "what", "mode", "view", "dist", "path", "dwell", "lift", "elevator", "speed"];
const cleanStep = (s) => { const o = {}; for (const k of STEP_KEYS0) if (s[k] !== undefined) o[k] = s[k]; return o; };
const doc = fromScene(MF7.scene || SCN.fromInternal(PROJECT, D));
const loadedOps = clone(doc.replica);              // layout edits already built into this session's replica (by the preload)
const flowById = (id) => doc.flows.find((f) => f.id === id);
const curFlow = () => doc.flows[clamp(S.flow, 0, doc.flows.length - 1)];
const nodeList = () => Object.values(doc.nodes);
const nodeName = (n) => (n ? (n.text || n.kind || "Stop") + " #" + n.id : "?");
let nextId = Math.max(1000, ...Object.keys(doc.nodes).map(Number).filter(Number.isFinite), ...doc.devices.map((d) => +d.sym || 0)) + 1;
const newId = () => nextId++;
const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8);

// Elevator of a lift step and the end point of any step (the next step must start there).
const elevatorOf = (s) => ELEVATORS.find((e) => e.label === s.elevator) || ELEVATORS[0] || null;
function stepEnd(f, i) {
  const s = f.steps[i]; if (!s) return null;
  if (s.lift || s.path === "lift") { const e = elevatorOf(s); return e ? [e.high[0], e.high[1]] : null; }
  if (Array.isArray(s.path) && s.path.length) return s.path[s.path.length - 1].slice();
  if (s.path === "fromLift") { const n = doc.nodes[s.node]; return n ? [n.x, n.y] : null; }
  const n = doc.nodes[s.node]; return n ? [n.x, n.y] : null;
}
const stepStart = (f, i) => (i > 0 ? stepEnd(f, i - 1) : null);
const stepPlate = (s) => { const n = doc.nodes[s.node]; return n ? n.plate || plateOf(n.x, n.y) : plateKeys[0]; };

/* ---------- undo / redo / autosave ---------- */
const undoStack = [], redoStack = [];
let dirty = false, saveTimer = 0, lastSaved = "", listeners = [];
const snapshot = () => JSON.stringify(doc);
const onChange = (fn) => listeners.push(fn);
function restore(json) { const o = JSON.parse(json); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, o); }
function storageKey() { return "mf7:scene:" + PROJECT; }
// write the working copy back as the scene: browser autosave (the preload's format) + the scene file manager's state
function saveNow() {
  clearTimeout(saveTimer); const s = snapshot();
  try { const sc = toScene(); MF7.scene = sc; localStorage.setItem(storageKey(), JSON.stringify({ scene: sc, baseHash: MF7.baseHash, savedAt: new Date().toISOString(), fileName: window.MFS ? MFS.state.fileName : "" })); if (window.MFS) MFS.setScene(sc); lastSaved = s; dirty = false; status("Saved in this browser"); }
  catch (e) { status("Could not save: " + (e && e.message || e), true); }
  emit("save");
}function scheduleSave() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 600); emit("dirty"); }
function emit(what) { for (const fn of listeners) try { fn(what); } catch (e) { console.error(e); } }
let statusHandler = null; const status = (msg, bad) => statusHandler && statusHandler(msg, bad);
/* commit(label, fn, rebuild): run fn() to change the document, record undo, push the result into the player and autosave.
   rebuild: false | "devices" | "props" | "director" | "all" (default). */
function commit(label, fn, rebuild = "all") {
  const before = snapshot();
  try { fn(); } catch (e) { restore(before); console.error(e); X.tip("Could not " + label + ": " + (e && e.message || e)); return false; }
  const after = snapshot(); if (after === before) return false;
  undoStack.push({ label, json: before, rebuild }); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0;
  apply(rebuild); scheduleSave(); emit("commit"); return true;
}
// for live drags: the document was already changed in place since `before` (a snapshot() taken at drag start)
function commitFrom(before, label, rebuild = "all") {
  if (snapshot() === before) { apply(rebuild === "director" ? "director" : rebuild); return false; }
  undoStack.push({ label, json: before, rebuild }); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0;
  apply(rebuild); scheduleSave(); emit("commit"); return true;
}
function cancelTo(before, rebuild = "all") { restore(before); apply(rebuild); emit("commit"); }
function undo() { const u = undoStack.pop(); if (!u) return X.tip("Nothing to undo"); redoStack.push({ label: u.label, json: snapshot(), rebuild: u.rebuild }); restore(u.json); apply(u.rebuild === "replica" ? "replica" : "all"); scheduleSave(); emit("commit"); X.tip("Undo: " + u.label); }
function redo() { const r = redoStack.pop(); if (!r) return X.tip("Nothing to redo"); undoStack.push({ label: r.label, json: snapshot(), rebuild: r.rebuild }); restore(r.json); apply(r.rebuild === "replica" ? "replica" : "all"); scheduleSave(); emit("commit"); X.tip("Redo: " + r.label); }

/* push the document into the player: data D (fresh copies, the player decorates them), replica instances, props */
let applyHooks = { replica: () => {}, props: () => {}, after: () => {} };
function apply(what = "all") {
  if (what === "director") { applyHooks.after(what); return; }
  if (what === "props") { applyHooks.props(); invalidateSolids(); applyHooks.after(what); return; }
  if (what === "devices") { D.devices = clone(doc.devices); X.rebuildDevices(true); invalidateSolids(); applyHooks.after(what); return; }
  for (const k of Object.keys(D.nodes)) delete D.nodes[k]; Object.assign(D.nodes, clone(doc.nodes));
  D.flows = doc.flows.map((f) => { const o = {}; for (const k of FLOW_KEYS0) if (f[k] !== undefined) o[k] = clone(f[k]); o.steps = o.steps.map(cleanStep); return o; });
  D.devices = clone(doc.devices); if (D.slide) D.slide.title = doc.title;
  applyHooks.replica(); applyHooks.props(); invalidateSolids();
  const ms = X.rebuild({ plan: what === "replica" });
  applyHooks.after(what); return ms;
}

/* ---------- device footprints (same rule as tools/v5/device-dims.mjs) ---------- */
function footprints(d) {
  const k = d.k || DIMS.K, A = DIMS.DIMS || {};
  if (d.type === "pc") {
    const a = A.pc || { depth: .7, width: 1.45 }, yaw = d.yawDeg != null ? d.yawDeg : { e: 90, w: -90, n: 180, s: 0 }[d.face || "e"];
    const horiz = Math.abs(Math.sin(yaw * Math.PI / 180)) > .7, hx = (horiz ? a.depth : a.width) * k * M / 2, hy = (horiz ? a.width : a.depth) * k * M / 2;
    return [[d.x - hx, d.y - hy, d.x + hx, d.y + hy]];
  }
  if (d.type === "rfid-auto") {
    const a = A["rfid-auto"] || { gap: 2.2 * M, post: .16 * M }, p = a.post / 2 + .1;
    return d.axis === "y" ? [[d.x - a.gap - p, d.y - p, d.x - a.gap + p, d.y + p], [d.x + a.gap - p, d.y - p, d.x + a.gap + p, d.y + p]]
      : [[d.x - p, d.y - a.gap - p, d.x + p, d.y - a.gap + p], [d.x - p, d.y + a.gap - p, d.x + p, d.y + a.gap + p]];
  }
  if (d.type === "rfid-manual") { const a = A["rfid-manual"] || { width: .36 }, h = a.width * k * M / 2; return [[d.x - h, d.y - h, d.x + h, d.y + h]]; }
  return [];
}
// a prop's plan rectangle (rotated bounding box)
function propRect(p) {
  const r = (p.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)), hw = p.w * M / 2, hd = p.d * M / 2;
  const ex = c * hw + s * hd, ey = s * hw + c * hd; return [p.x - ex, p.y - ey, p.x + ex, p.y + ey];
}
const PROP_SOLID = { box: 1, pallet: 1, rack: 1, column: 1, wall: 1, fence: 1, cone: 1, sign: 1, arrow: 0, zone: 0, light: 0 };

/* ---------- solids per plate (replica + devices + props), with a spatial hash ---------- */
const solidCache = {};
function invalidateSolids() { for (const k of Object.keys(solidCache)) delete solidCache[k]; routerCache.clear(); }
function solidsOf(plate) {
  if (solidCache[plate]) return solidCache[plate];
  const out = [];
  for (const w of RP.walls || []) if (w.plate === plate) {
    const [ax, ay] = w.a, [bx, by] = w.b, t = .75;
    if (Math.abs(ax - bx) < 1e-6 || Math.abs(ay - by) < 1e-6) out.push({ r: [Math.min(ax, bx) - t, Math.min(ay, by) - t, Math.max(ax, bx) + t, Math.max(ay, by) + t], what: "wall" });
    else { const n = Math.ceil(Math.hypot(bx - ax, by - ay)); for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; out.push({ r: [x - t, y - t, x + t, y + t], what: "wall" }); } }
  }
  for (const q of RP.columns || []) if (q.plate === plate) out.push({ r: [q.p[0] - 1.45, q.p[1] - 1.45, q.p[0] + 1.45, q.p[1] + 1.45], what: "column" });
  for (const k of ["racks", "machines", "pallets"]) for (const o of RP[k] || []) if (o.plate === plate) out.push({ r: [o.x, o.y, o.x + o.w, o.y + o.h], what: k.slice(0, -1) });
  for (const d of doc.devices) if ((d.plate || "1F") === plate) for (const r of footprints(d)) out.push({ r, what: d.label || d.type });
  for (const p of doc.props) if (p.plate === plate && PROP_SOLID[p.type]) out.push({ r: propRect(p), what: p.name || p.type });
  const hash = new Map(), C = 16;
  out.forEach((s, i) => { for (let a = Math.floor(s.r[0] / C); a <= Math.floor(s.r[2] / C); a++) for (let b = Math.floor(s.r[1] / C); b <= Math.floor(s.r[3] / C); b++) { const key = a * 4096 + b; let l = hash.get(key); if (!l) hash.set(key, (l = [])); l.push(i); } });
  const near = (x, y, rad) => { const set = new Set(); for (let a = Math.floor((x - rad) / C); a <= Math.floor((x + rad) / C); a++) for (let b = Math.floor((y - rad) / C); b <= Math.floor((y + rad) / C); b++) { const l = hash.get(a * 4096 + b); if (l) for (const i of l) set.add(i); } return [...set].map((i) => out[i]); };
  return (solidCache[plate] = { list: out, near });
}

/* ---------- the V6 router, in the browser (grid A* with a chamfer distance transform) ---------- */
const STRAIGHT = TROLLEY.halfW + .9, TURN = Math.hypot(TROLLEY.halfW, TROLLEY.halfL) + .45;
const routerCache = new Map();
function gridFor(plate) {
  if (routerCache.has(plate)) return routerCache.get(plate);
  const zone = plateZone(plate), solids = solidsOf(plate).list.map((s) => s.r);
  const x0 = Math.floor(zone[0]) - 2, y0 = Math.floor(zone[1]) - 2, W = Math.ceil(zone[2]) - x0 + 4, H = Math.ceil(zone[3]) - y0 + 4;
  const occ = new Uint8Array(W * H);
  for (const r of solids) { const i0 = Math.max(0, Math.floor(r[0] - x0)), i1 = Math.min(W - 1, Math.ceil(r[2] - x0) - 1), j0 = Math.max(0, Math.floor(r[1] - y0)), j1 = Math.min(H - 1, Math.ceil(r[3] - y0) - 1); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) occ[j * W + i] = 1; }
  const INF = 1e9, d = new Float32Array(W * H); for (let k = 0; k < W * H; k++) d[k] = occ[k] ? 0 : INF;
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : d[j * W + i]);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (!d[k]) continue; d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414); }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; if (!d[k]) continue; d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414); }
  for (let k = 0; k < W * H; k++) d[k] = Math.max(0, d[k] - .5);
  const g = { x0, y0, W, H, d }; routerCache.set(plate, g); return g;
}
const cellOf = (g, x, y) => { const i = Math.floor(x - g.x0), j = Math.floor(y - g.y0); return i < 0 || j < 0 || i >= g.W || j >= g.H ? -1 : j * g.W + i; };
function snapCell(g, x, y, need) {   // nearest clear cell centre (spiral by rings)
  const ci = Math.floor(x - g.x0), cj = Math.floor(y - g.y0);
  for (let r = 0; r < 80; r++) {
    let best = null, bd = Infinity;
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= g.W || j >= g.H) continue;
      if (g.d[j * g.W + i] < need) continue; const cx = g.x0 + i + .5, cy = g.y0 + j + .5, dd = (cx - x) ** 2 + (cy - y) ** 2; if (dd < bd) { bd = dd; best = [cx, cy]; }
    }
    if (best) return best;
  }
  return null;
}
function astar(g, a, b, turnCost = 14, centre = 5) {
  const s = cellOf(g, a[0], a[1]), t = cellOf(g, b[0], b[1]); if (s < 0 || t < 0) return null;
  const Dd = [[1, 0], [0, 1], [-1, 0], [0, -1]], N = g.W * g.H, cost = new Float32Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1);
  const ti = t % g.W, tj = (t / g.W) | 0, heap = [];
  const push = (f, s2) => { heap.push([f, s2]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (k) => Math.abs(k % g.W - ti) + Math.abs(((k / g.W) | 0) - tj);
  for (let dir = 0; dir < 4; dir++) { cost[s * 4 + dir] = 0; push(h(s), s * 4 + dir); }
  let goal = -1, guard = 0;
  while (heap.length && guard++ < 6e6) {
    const [pri, st] = pop(), k = st >> 2, dir = st & 3, c = cost[st];
    if (pri > c + h(k) + 1e-3) continue;
    if (k === t) { goal = st; break; }
    const i = k % g.W, j = (k / g.W) | 0;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === ((dir + 2) & 3)) continue;
      const turn = nd !== dir; if (turn && g.d[k] < TURN && k !== s) continue;
      const ii = i + Dd[nd][0], jj = j + Dd[nd][1]; if (ii < 0 || jj < 0 || ii >= g.W || jj >= g.H) continue;
      const kk = jj * g.W + ii; if (g.d[kk] < STRAIGHT && kk !== t) continue;
      const nc = c + 1 + centre / Math.max(1, g.d[kk]) + (turn ? turnCost : 0), ns = kk * 4 + nd;
      if (nc < cost[ns]) { cost[ns] = nc; prev[ns] = st; push(nc + h(kk), ns); }
    }
  }
  if (goal < 0) return null;
  const cells = []; for (let st = goal; st >= 0; st = prev[st]) cells.push(st >> 2); cells.reverse();
  const pts = cells.map((k) => [g.x0 + k % g.W + .5, g.y0 + ((k / g.W) | 0) + .5]);
  return simplify(pts);
}
// remove duplicate and collinear points (keeps the first and last exactly)
function simplify(pts) {
  const out = [];
  for (const p of pts) {
    const q = [+p[0], +p[1]], n = out.length;
    if (n && Math.hypot(q[0] - out[n - 1][0], q[1] - out[n - 1][1]) < 1e-6) continue;
    if (n >= 2) { const a = out[n - 2], b = out[n - 1]; if (Math.abs((b[0] - a[0]) * (q[1] - b[1]) - (b[1] - a[1]) * (q[0] - b[0])) < 1e-6 && (b[0] - a[0]) * (q[0] - b[0]) + (b[1] - a[1]) * (q[1] - b[1]) >= 0) { out[n - 1] = q; continue; } }
    out.push(q);
  }
  return out;
}
// orthogonal L between two points (horizontal first when hFirst)
const elbow = (a, b, hFirst = true) => (Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6 ? [a, b] : hFirst ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b]);
/* routeBetween(a, b, plate): an obstacle-free orthogonal trolley path from a to b (exact ends), or null */
function routeBetween(a, b, plate) {
  const g = gridFor(plate);
  const sa = snapCell(g, a[0], a[1], STRAIGHT + .2), sb = snapCell(g, b[0], b[1], STRAIGHT + .2); if (!sa || !sb) return null;
  const mid = astar(g, sa, sb); if (!mid) return null;
  // join the exact ends to the routed cells with short orthogonal jogs (aligned to the first / last routed leg)
  const first = mid.length > 1 && Math.abs(mid[1][1] - mid[0][1]) < 1e-6, last = mid.length > 1 && Math.abs(mid[mid.length - 1][1] - mid[mid.length - 2][1]) < 1e-6;
  const head = elbow(a, mid[0], !first), tail = elbow(mid[mid.length - 1], b, last);
  return simplify([...head, ...mid.slice(1, -1), ...tail]);
}

/* ---------- collision check: the real trolley footprint swept along every move and turn ---------- */
function gap(cx, cy, h, r) {
  const ux = Math.sin(h), uy = Math.cos(h), vx = Math.cos(h), vy = -Math.sin(h), hl = TROLLEY.halfL, hw = TROLLEY.halfW;
  const cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [cx + ux * a * hl + vx * b * hw, cy + uy * a * hl + vy * b * hw]);
  const bx = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]; let best = -Infinity;
  for (const [ax, ay] of [[1, 0], [0, 1], [ux, uy], [vx, vy]]) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of cs) { const d = x * ax + y * ay; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, y] of bx) { const d = x * ax + y * ay; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    best = Math.max(best, b0 - a1, a0 - b1);
  }
  return best;
}
const CLEAR = .3;
function checkFlow(f) {
  const hits = []; let h;
  f.steps.forEach((s, i) => {
    if (s.lift || !Array.isArray(s.path)) { h = undefined; return; }
    const plate = stepPlate(s), sol = solidsOf(plate), P = s.path, seen = new Set();
    const test = (x, y, hh) => { for (const o of sol.near(x, y, 8)) { const v = gap(x, y, hh, o.r); if (v < CLEAR) { const key = Math.round(x / 3) + ":" + Math.round(y / 3); if (!seen.has(key)) { seen.add(key); hits.push({ step: i, x, y, gap: v, what: o.what }); } return; } } };
    for (let k = 1; k < P.length; k++) {
      const [ax, ay] = P[k - 1], [bx, by] = P[k], L = Math.hypot(bx - ax, by - ay); if (L < 1e-6) continue;
      const hh = Math.atan2(bx - ax, by - ay);
      if (h !== undefined) { const dd = wrapPi(hh - h); if (Math.abs(dd) > 1e-3) for (let q = 1; q <= 6; q++) test(ax, ay, h + dd * q / 6); }
      for (let u = 0; u <= L; u += .5) test(ax + (bx - ax) * u / L, ay + (by - ay) * u / L, hh);
      h = hh;
    }
  });
  return hits;
}
/* flow sanity: joined steps, known stops, lift order */
function validateFlow(f) {
  const issues = [];
  f.steps.forEach((s, i) => {
    if (!doc.nodes[s.node]) issues.push({ step: i, msg: "unknown stop" });
    if (i > 0 && Array.isArray(s.path)) { const e = stepEnd(f, i - 1), p = s.path[0]; if (e && Math.hypot(e[0] - p[0], e[1] - p[1]) > .05) issues.push({ step: i, msg: "does not start where the previous step ended" }); }
    if (Array.isArray(s.path)) { const n = doc.nodes[s.node], e = s.path[s.path.length - 1]; if (n && Math.hypot(n.x - e[0], n.y - e[1]) > .05) issues.push({ step: i, msg: "does not end at its stop" }); }
    if (i > 0 && s.path == null && !s.lift) { const e = stepEnd(f, i - 1), n = doc.nodes[s.node]; if (e && n && Math.hypot(e[0] - n.x, e[1] - n.y) > .05) issues.push({ step: i, msg: "jumps (no path to its stop)" }); }
  });
  return issues;
}
// make step i start at the previous end and end at its stop: keep the drawn path where possible, otherwise route it
function relink(f, i, force = false) {
  const s = f.steps[i]; if (!s || s.lift || s.path === "lift" || s.path === "fromLift") return;
  const n = doc.nodes[s.node]; if (!n) return;
  const a = stepStart(f, i), b = [n.x, n.y];
  if (!a) { if (Array.isArray(s.path) && !force) { s.path[s.path.length - 1] = b; } return; }
  const same = Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  if (same) { s.path = null; return; }
  if (!force && Array.isArray(s.path) && s.path.length >= 2) {
    const p = s.path, okA = Math.hypot(p[0][0] - a[0], p[0][1] - a[1]) < .05, okB = Math.hypot(p[p.length - 1][0] - b[0], p[p.length - 1][1] - b[1]) < .05;
    if (okA && okB) return;
  }
  const plate = n.plate || plateOf(b[0], b[1]), pa = plateOf(a[0], a[1]);
  const r = pa === plate ? routeBetween(a, b, plate) : null;
  s.path = r || simplify(elbow(a, b, Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])));
}
