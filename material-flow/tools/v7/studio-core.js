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
function fromLayoutEdits(edits) {
  const replica = {};
  for (const e of edits) { const m = /^([a-z]+):(\d+)$/.exec(e.target || ""); if (!m || !REP_KIND_OF[m[1]]) continue; const op = {}; if (e.move) { op.dx = e.move[0] / U7; op.dy = e.move[1] / U7; } if (e.turn) op.rot = e.turn; if (e.delete) op.del = true; replica[REP_KIND_OF[m[1]] + ":" + m[2]] = op; }
  return replica;
}
function fromScene(scene) {
  const res = SCN.toInternal(clone(scene), { plates: D.plates, elevators: X.ELEVATORS || [], replica: RP }, { applyLayout: false }), replica = {};
  Object.assign(replica, fromLayoutEdits(scene.layoutEdits || []));
  const director = clone(scene.director || {}); for (const d of Object.values(director)) if (d.keys) d.keys.sort((a, b) => a.t - b.t);
  return {
    notes: scene.notes || "", layout: scene.layout || scene.project, layoutEdits: clone(scene.layoutEdits || []), adds: clone(scene.layoutAdds || []),
    format: "mf7-work", project: PROJECT, title: scene.title || PROJECT, nodes: res.data.nodes, flows: res.data.flows, devices: res.data.devices,
    props: (scene.objects || []).map((o) => ({ id: o.id, type: PROP_OF_OBJ[o.type] || o.type, name: o.name || "", x: o.x / U7, y: o.y / U7, plate: o.floor, rot: o.heading || 0, w: o.w, d: o.d, h: o.h, color: o.color, text: o.text })),
    replica, doors: clone((scene.layoutEdits || []).filter((e) => e.door)), director, takes: clone(scene.takes || []), bookmarks: clone(scene.viewpoints || []),
    settings: Object.assign({ snap: .5, ortho: true, lang: "en", shift: 8 }, clone(scene.studio || {})),
  };
}
function toScene() {
  const sc = SCN.fromInternal(PROJECT, { nodes: doc.nodes, flows: doc.flows.map((f) => Object.assign({}, f, { steps: f.steps.map(cleanStep) })), devices: doc.devices, title: doc.title });
  sc.title = doc.title; sc.notes = doc.notes; sc.layout = doc.layout;
  sc.objects = doc.props.map((p) => { const o = { id: p.id, type: OBJ_OF_PROP[p.type] || p.type, floor: p.plate, x: +(p.x * U7).toFixed(3), y: +(p.y * U7).toFixed(3), heading: p.rot || 0, w: p.w, d: p.d, h: p.h, color: p.color }; if (p.name) o.name = p.name; if (p.text) o.text = p.text; return o; });
  // Preserve ordered edits (including doors combined with transforms) when Studio has not changed them.
  const originalOps = fromLayoutEdits(doc.layoutEdits || []);
  if (JSON.stringify(originalOps) === JSON.stringify(doc.replica)) sc.layoutEdits = clone(doc.layoutEdits || []);
  else {
    // Live transforms are relative to the loaded geometry (syncRep), so append that same delta to its ordered edits.
    // Replacing a target's sequence with its last operation would lose earlier moves/turns on save.
    sc.layoutEdits = clone(doc.layoutEdits || []);
    for (const tag of new Set([...Object.keys(originalOps), ...Object.keys(doc.replica)])) {
      const op = doc.replica[tag] || {}, old = originalOps[tag] || {}, [kind, id] = tag.split(":"), e = { target: REP_NAME_OF[kind] + ":" + id };
      const dx = (op.dx || 0) - (old.dx || 0), dy = (op.dy || 0) - (old.dy || 0), rot = (((op.rot || 0) - (old.rot || 0)) % 360 + 360) % 360;
      if (dx || dy) e.move = [+(dx * U7).toFixed(3), +(dy * U7).toFixed(3)];
      if (rot) e.turn = rot;
      if (op.del && !old.del) e.delete = true;
      if (e.move || e.turn || e.delete) sc.layoutEdits.push(e);
    }
  }
  foldAdds(sc);
  sc.director = clone(doc.director); sc.takes = clone(doc.takes); sc.viewpoints = clone(doc.bookmarks); sc.studio = clone(doc.settings);
  return sc;
}
/* layoutAdds: a move or turn of an added item (id >= ADD_BASE, part 0) is written into its layoutAdds entry, not as a layout edit.
   doc.adds is the list as loaded; doc.replica ops are totals from the loaded data, so folding is recomputed on every save. */
function foldAdds(sc) {
  const BASE = SCN.ADD_BASE || 100000, adds = clone(doc.adds || []); sc.layoutAdds = adds;
  const cutTargets = new Set((sc.layoutEdits || []).filter(e => e.door).map(e => e.target));
  sc.layoutEdits = (sc.layoutEdits || []).filter((e) => {
    const m = /^([a-z]+):(\d+)$/.exec(e.target || ""); if (!m || +m[2] < BASE || e.delete || e.door || cutTargets.has(e.target)) return true;
    const n = +m[2] - BASE, a = adds[Math.floor(n / 1000)]; if (!a || n % 1000 !== 0 || a.kind === "storage") return true;
    const into = (SCN.ADD_KINDS[a.kind] || {}).into; if (REP_NAME_OF[into] !== m[1]) return true;
    const dx = e.move ? e.move[0] : 0, dy = e.move ? e.move[1] : 0;
    if (a.kind === "wall") { if (e.turn) return true; const t = (p) => [+(p[0] + dx).toFixed(3), +(p[1] + dy).toFixed(3)]; a.a = t(a.a); a.b = t(a.b); return false; }
    const K = (SCN.ADD_KINDS || {})[a.kind] || {}, dims = (turn) => { let w = a.w != null ? a.w : K.w, d = a.d != null ? a.d : K.d; if (((turn % 360) + 360) % 180 === 90) [w, d] = [d, w]; return [w, d]; };
    const [w0, d0] = dims(a.turn || 0), cx = a.x + w0 / 2 + dx, cy = a.y + d0 / 2 + dy;
    if (e.turn) a.turn = ((a.turn || 0) + e.turn) % 360; const [w1, d1] = dims(a.turn || 0);
    a.x = +(cx - w1 / 2).toFixed(3); a.y = +(cy - d1 / 2).toFixed(3); return false;
  });
}
const FLOW_KEYS0 =["id", "name", "color", "steps", "trolleys", "headway"];
const STEP_KEYS0 = ["node", "title", "what", "mode", "view", "dist", "path", "dwell", "lift", "elevator", "speed", "sceneId"];
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
const elevatorOf = (s) => ELEVATORS.find((e) => e.label === s.elevator) || (s.elevator == null ? ELEVATORS[0] : null) || null;
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
const loadedAdds = JSON.stringify(doc.adds), loadedEdits = JSON.stringify(doc.layoutEdits), reloadKey = "mf7:layout-history:" + PROJECT;
// Only a successful, matching reload may restore history. Scenes normalize folded additions before the next session.
try {
  const h = JSON.parse(sessionStorage.getItem(reloadKey) || "null"); sessionStorage.removeItem(reloadKey);
  if (h && h.baseHash === MF7.baseHash && h.scene === JSON.stringify(MF7.scene)) {
    for (const [stack, entries] of [[undoStack, h.undo], [redoStack, h.redo]]) for (const e of entries) stack.push({ label: e.label, json: JSON.stringify(fromScene(e.scene)), rebuild: e.rebuild });
  }
} catch { /* History is optional; the scene is still in localStorage. */ }
let dirty = false, saveTimer = 0, lastSaved = "", listeners = [];
const snapshot = () => JSON.stringify(doc);
const onChange = (fn) => listeners.push(fn);
function restore(json) { const o = JSON.parse(json); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, o); }
function storageKey() { return "mf7:scene:" + PROJECT; }
// write the working copy back as the scene: browser autosave (the preload's format) + the scene file manager's state
function saveNow() {
  clearTimeout(saveTimer); const s = snapshot();
  try { const sc = toScene(); MF7.scene = sc; if (window.MFS) MFS.setScene(sc); localStorage.setItem(storageKey(), JSON.stringify({ scene: sc, baseHash: MF7.baseHash, savedAt: new Date().toISOString(), fileName: window.MFS ? MFS.state.fileName : "" })); lastSaved = s; dirty = false; status("Saved in this browser"); }
  catch (e) { status("Could not save: " + (e && e.message || e), true); }
  emit("save"); return !dirty && lastSaved === s;
}function scheduleSave() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 600); emit("dirty"); }
function reloadLayout(scene, how) {
  if (scene) { const before = snapshot(); restore(JSON.stringify(fromScene(scene))); undoStack.push({ label: how || "load layout", json: before, rebuild: "all" }); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0; dirty = true; }
  if (!saveNow()) { X.tip("Layout kept in memory: save in this browser failed; export the scene before reloading."); return false; }
  const current = snapshot();
  try {
    const pack = stack => stack.map(e => { restore(e.json); return { label: e.label, rebuild: e.rebuild, scene: toScene() }; });
    const undo = pack(undoStack), redo = pack(redoStack); restore(current);
    sessionStorage.setItem(reloadKey, JSON.stringify({ baseHash: MF7.baseHash, scene: JSON.stringify(MF7.scene), undo, redo }));
  } catch (e) { restore(current); X.tip("Could not preserve layout undo: " + e.message); return false; }
  setTimeout(() => location.reload(), 350); return true;
}
function emit(what) { for (const fn of listeners) try { fn(what); } catch (e) { console.error(e); } }
let statusHandler = null; const status = (msg, bad) => statusHandler && statusHandler(msg, bad);
/* commit(label, fn, rebuild): run fn() to change the document, record undo, push the result into the player and autosave.
   rebuild: false | "devices" | "props" | "director" | "all" (default). */
function commit(label, fn, rebuild = "all") {
  const before = snapshot();
  try { fn(); } catch (e) { restore(before); console.error(e); X.tip("Could not " + label + ": " + (e && e.message || e)); return false; }
  const after = snapshot(); if (after === before) return false;
  try { apply(rebuild); }
  catch (e) { restore(before); try { apply("all"); } catch (rollback) { console.error(rollback); } X.tip("Could not " + label + ": " + e.message); return false; }
  undoStack.push({ label, json: before, rebuild }); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0;
  scheduleSave(); emit("commit"); return true;
}
// for live drags: the document was already changed in place since `before` (a snapshot() taken at drag start)
function commitFrom(before, label, rebuild = "all") {
  if (snapshot() === before) { apply(rebuild === "director" ? "director" : rebuild); return false; }
  try { apply(rebuild); }
  catch (e) { restore(before); try { apply("all"); } catch (rollback) { console.error(rollback); } X.tip("Could not " + label + ": " + e.message); return false; }
  undoStack.push({ label, json: before, rebuild }); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0;
  scheduleSave(); emit("commit"); return true;
}
function cancelTo(before, rebuild = "all") { restore(before); apply(rebuild); emit("commit"); }
function undo() { const u = undoStack.pop(); if (!u) return X.tip("Nothing to undo"); redoStack.push({ label: u.label, json: snapshot(), rebuild: u.rebuild }); restore(u.json); if (JSON.stringify(doc.adds) !== loadedAdds || JSON.stringify(doc.layoutEdits) !== loadedEdits) { reloadLayout(); return; } apply(u.rebuild === "replica" ? "replica" : "all"); scheduleSave(); emit("commit"); X.tip("Undo: " + u.label); }
function redo() { const r = redoStack.pop(); if (!r) return X.tip("Nothing to redo"); undoStack.push({ label: r.label, json: snapshot(), rebuild: r.rebuild }); restore(r.json); if (JSON.stringify(doc.adds) !== loadedAdds || JSON.stringify(doc.layoutEdits) !== loadedEdits) { reloadLayout(); return; } apply(r.rebuild === "replica" ? "replica" : "all"); scheduleSave(); emit("commit"); X.tip("Redo: " + r.label); }

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

/* ---------- device footprints: canonical scene core, frame units ---------- */
const footprints = (d) => SCN.footprintsU(d);
// a prop's plan rectangle (rotated bounding box)
function propRect(p) {
  const r = (p.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)), hw = p.w * M / 2, hd = p.d * M / 2;
  const ex = c * hw + s * hd, ey = s * hw + c * hd; return [p.x - ex, p.y - ey, p.x + ex, p.y + ey];
}
const PROP_SOLID = { box: 1, pallet: 1, rack: 1, column: 1, wall: 1, fence: 1, cone: 1, sign: 1, arrow: 0, zone: 0, light: 0 };

/* ---------- solids per plate (replica + devices + props), with a spatial hash ---------- */
const solidCache = {};
function invalidateSolids() { for (const k of Object.keys(solidCache)) delete solidCache[k]; sharedRouter = null; }
function solidsOf(plate) {
  if (solidCache[plate]) return solidCache[plate];
  const extra = doc.props.filter((p) => p.plate === plate && PROP_SOLID[p.type]).map((p) => ({ r: propRect(p), what: p.name || p.type }));
  return (solidCache[plate] = SCN.solidsU({ replica: RP }, plate, doc.devices, extra));
}
// The same grid A* and clearance constants as scene import/Node; Studio props join its solids.
let sharedRouter = null;
const gridFor = (plate) => (sharedRouter ||= SCN.makeRouter({ plates: D.plates }, doc.devices, solidsOf)).grid(plate);
const routeBetween = (a, b, plate) => (sharedRouter ||= SCN.makeRouter({ plates: D.plates }, doc.devices, solidsOf)).route(a, b, plate);
const simplify = (pts) => SCN.simplify(pts);
const elbow = (a, b, hFirst = true) => (Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6 ? [a, b] : hFirst ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b]);

/* ---------- collision check: the real trolley footprint swept along every move and turn ---------- */
const gap = (cx, cy, h, r) => SCN.gap(cx, cy, h, r);
const CLEAR = SCN.CLEAR_ERROR / PT_M; // frame units (0.09 m)
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
      for (let n = Math.ceil(L / .5), q = 0; q <= n; q++) test(ax + (bx - ax) * q / n, ay + (by - ay) * q / n, hh);
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
