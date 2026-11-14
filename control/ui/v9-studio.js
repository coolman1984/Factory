// Material Flow Player V9 Studio: the V7/V8 Scene Studio and Director rebuilt on the real factory and the Factory Engine.
//  - Editor: pick any object (3D or 2D), move / turn / resize / duplicate / delete / place; drag stops; edit route vertices;
//    draw new routes and whole new paths in the 2D plan (snap, ortho, stops snap); straighten; auto-route (live); steps
//    (title, text, mode, wait, insert, delete); live clash check against the CAD objects and walls.
//  - Director: camera keys (eases, cuts, trolley-locked keys), camera-move recording, captions, six saved shots, timeline lanes.
//  - Numbers: trip time, distances, lifts, trips per shift, before / after.
//  - Saving (the Sticky Notes Pro way): everything lives in memory, an edit marks records dirty, and 0.7 s after the last edit
//    one batch command stores them in the Control Center database (one transaction, recorded, undoable). The offline file keeps
//    the edits in this browser (localStorage) and can export them. Undo / redo are in the page (200 steps).
(() => {
"use strict";
const V = window.V9; if (!V) return;
const $ = s => document.querySelector(s), h = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
let A = null, T = null;
const S = { open: false, tab: "steps", tool: "select", sel: null, stepSel: -1, snap: 0.5, ortho: true, undo: [], redo: [], dirty: new Map(), ver: 0, known: new Set(), local: {},
  state: "saved", msg: "", draw: null, drag: null, hover: null, clash: { objects: [], walls: [] }, allPaths: false, lastPrefab: null, camRec: null, keySel: null, n: 1 };
V.studio = S;
const clone = o => JSON.parse(JSON.stringify(o)), r2 = v => Math.round(v * 100) / 100, wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), lerp = (a, b, u) => a + (b - a) * u;
const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const LKEY = () => "v9-studio:" + (window.V9_BUILD?.built || "live");
const PALETTE = ["#a78bfa", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6", "#eab308"];

/* ---------- the document: records by key ("path:ID", "stop:ID", "obj:ID") ---------- */
const objById = () => V._objs || (V._objs = new Map(V.pack.objects.map(o => [o.id, o])));
const stopById = id => V.pack.stops.find(s => s.id === id);
const pathById = id => V.pack.paths.find(p => p.id === id);
function rec(k) { const [t, ...r] = k.split(":"), id = r.join(":"); return t === "path" ? pathById(id) : t === "stop" ? stopById(id) : objById().get(id); }
function snap(k) { const r = rec(k); if (!r) return null; return JSON.stringify(k.startsWith("path:") ? { tab: r.tab, data: r.data } : r); }
function put(k, json) {
  const [t, ...rr] = k.split(":"), id = rr.join(":"), v = json == null ? null : JSON.parse(json);
  if (t === "path") { const i = V.pack.paths.findIndex(p => p.id === id);
    if (!v) { if (i >= 0) V.pack.paths.splice(i, 1); return; }
    if (i >= 0) { V.pack.paths[i].data = v.data; V.pack.paths[i].tab = v.tab; V.pack.paths[i].timeline = null; } else V.pack.paths.push({ id, tab: v.tab, data: v.data, timeline: null }); return; }
  if (t === "stop") { const i = V.pack.stops.findIndex(s => s.id === id); if (!v) { if (i >= 0) V.pack.stops.splice(i, 1); return; } if (i >= 0) { const s = V.pack.stops[i]; for (const q of Object.keys(s)) delete s[q]; Object.assign(s, v); } else V.pack.stops.push(v); return; }
  const o = objById().get(id); if (!v) { if (o) o.deleted = true; return; }
  if (o) { for (const q of Object.keys(o)) delete o[q]; Object.assign(o, v); } else { V.pack.objects.push(v); objById().set(id, v); }
}
function refresh(keys) {
  let retime = false; const cur = V.path?.id;
  for (const k of keys) {
    if (k.startsWith("obj:")) { const o = rec(k); if (o && !A.placeObject(o) && !o.deleted) A.addObjectMesh(o); }
    else if (k.startsWith("stop:")) retime = true;
    else if (k === "path:" + cur) retime = true;
  }
  if (V.path && !pathById(V.path.id)) { const p = V.pack.paths.find(p => p.tab === V.tab) || V.pack.paths[0]; A.selectPath(p.id); }
  else if (V.path) { const p = pathById(V.path.id); if (p !== V.path || p.data !== V.edit) { V.path = p; V.edit = p.data; } if (retime) A.retime(); }
  A.tabsUI(); render(); selBox();
}
function touch(k) { S.dirty.set(k, ++S.ver); S.local[k] = snap(k); setState("unsaved"); clearTimeout(S.saveT); S.saveT = setTimeout(save, 700); }   // Sticky Notes Pro: save 0.7 s after the last edit
function commit(label, keys, fn) {
  const before = keys.map(k => [k, snap(k)]); fn(); const all = [...new Set([...keys, ...(fn.extra || [])])];
  const after = all.map(k => [k, snap(k)]); const b2 = all.map(k => before.find(b => b[0] === k) || [k, null]);
  if (b2.every((b, i) => b[1] === after[i][1])) return false;
  pushUndo(label, b2, after); return true;
}
function pushUndo(label, before, after) { S.undo.push({ label, before, after }); if (S.undo.length > 200) S.undo.shift(); S.redo.length = 0; for (const [k] of after) touch(k); refresh(after.map(a => a[0])); }
function restore(pairs) { for (const [k, j] of pairs) put(k, j); for (const [k] of pairs) touch(k); refresh(pairs.map(p => p[0])); }
function undo() { const c = S.undo.pop(); if (!c) return A.tip("Nothing to undo"); restore(c.before); S.redo.push(c); A.tip("Undo: " + c.label, 1800); }
function redo() { const c = S.redo.pop(); if (!c) return A.tip("Nothing to redo"); restore(c.after); S.undo.push(c); A.tip("Redo: " + c.label, 1800); }

/* ---------- saving: one batch command per pause in editing (live), or this browser (offline) ---------- */
function setState(s, msg = "") { S.state = s; S.msg = msg; const el = $("#stb-save"), b = $("#save"); const txt = { saved: A?.OFFLINE ? "Saved in this browser" : "Saved", unsaved: "Unsaved…", saving: "Saving…", error: "Not saved" }[s] + (msg ? ": " + msg : "");
  for (const e of [el, b]) if (e) { e.textContent = txt; e.className = "sv " + s; e.title = msg; } }
function cmdFor(k) {
  const [t, ...rr] = k.split(":"), id = rr.join(":"), r = rec(k), exists = S.known.has(k);
  if (t === "path") { if (!r) return exists ? { type: "record.delete", payload: { type: "path", id } } : null; const d = { ...r.data, path_id: id, tab: r.tab };
    return exists ? { type: "record.update", payload: { type: "path", id, set: { name: d.name, color: d.color, tab: d.tab, steps: d.steps, routes: d.routes || [], captions: d.captions || [], director: d.director || null, push_speed_mps: d.push_speed_mps, agv_speed_mps: d.agv_speed_mps, lift_s: d.lift_s } } }
      : { type: "record.create", payload: { type: "path", data: d } }; }
  if (t === "stop") { if (!r) return exists ? { type: "record.delete", payload: { type: "stop", id } } : null;
    return exists ? { type: "record.update", payload: { type: "stop", id, set: { name: r.name, position_m: r.pos, floor: r.floor } } }
      : { type: "record.create", payload: { type: "stop", data: { stop_id: id, name: r.name, symbol: r.symbol || "area", position_m: r.pos, floor: r.floor || "1F" } } }; }
  if (!r || r.deleted) return exists ? { type: "record.delete", payload: { type: "entity", id } } : null;
  return exists ? { type: "record.update", payload: { type: "entity", id, set: { name: r.name, "transform.position_m": r.pos, "transform.yaw_deg": r.yaw, size_m: r.size } } }
    : { type: "record.create", payload: { type: "entity", data: { entity_id: id, name: r.name, category: r.category || "equipment", org_parent_id: null, spatial_parent_id: null, prefab_id: r.prefab, prefab_version: "1.0.0", transform: { position_m: r.pos, yaw_deg: r.yaw }, capabilities: [], size_m: r.size, model_asset: null, source: "V9 Studio" } } };
}
async function save() {
  clearTimeout(S.saveT); if (!S.dirty.size) return setState("saved");
  if (A.OFFLINE) { try { localStorage.setItem(LKEY(), JSON.stringify(S.local)); S.dirty.clear(); setState("saved"); } catch (e) { setState("error", "browser storage full (Export the edits)"); } return; }
  if (S.saving) { S.again = true; return; }
  const order = k => (k.startsWith("stop:") ? 0 : k.startsWith("obj:") ? 1 : 2), sent = [...S.dirty.entries()].sort((a, b) => order(a[0]) - order(b[0])), commands = [];
  for (const [k] of sent) { const c = cmdFor(k); if (c) commands.push(c); }
  S.saving = true; setState("saving");
  try {
    let r = { ok: true }; if (commands.length) r = await fetch("/api/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor: "v9-studio", type: "batch", payload: { commands, label: `V9 Studio: ${commands.length} change(s)` } }) }).then(x => x.json());
    if (!r.ok) { setState("error", r.reason || r.code); S.saving = false; return; }
    for (const [k, ver] of sent) { if (rec(k) && !(k.startsWith("obj:") && rec(k).deleted)) S.known.add(k); else S.known.delete(k); if (S.dirty.get(k) === ver) S.dirty.delete(k); }
    setState(S.dirty.size ? "unsaved" : "saved", r.revision ? "revision " + r.revision : "");
    if (sent.some(([k]) => k === "path:" + V.path.id) && pathById(V.path.id)) fetch("/api/path-run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: V.path.id }) }).catch(() => {});
  } catch (e) { setState("error", "Control Center not reachable"); }
  S.saving = false; if (S.again || S.dirty.size) { S.again = false; clearTimeout(S.saveT); S.saveT = setTimeout(save, 700); }
}
function exportEdits() { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ format: "v9-studio-edits", built: window.V9_BUILD?.built, records: S.local }, null, 1)], { type: "application/json" })); a.download = "v9-studio-edits.json"; a.click(); }
addEventListener("beforeunload", e => { if (S.dirty.size && !A?.OFFLINE) { save(); e.preventDefault(); } });

/* ---------- geometry helpers ---------- */
const snapV = (v, alt) => (S.snap && !alt ? Math.round(v / S.snap) * S.snap : r2(v));
const floorZ = () => (S.sel?.kind === "obj" ? objById().get(S.sel.id)?.pos[2] || 0 : S.sel?.kind === "stop" ? stopById(S.sel.id)?.pos[2] || 0 : (V.ps?.p[2] || 0) > 3 ? 6 : 0);
const ray = () => S.ray || (S.ray = new T.Raycaster()), ndc = new (window.THREE.Vector2)();
function setRay(e) { const r = A.canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray().setFromCamera(ndc, A.camera); return ray(); }
function floorAt(e, z = floorZ()) { const R = setRay(e).ray; if (Math.abs(R.direction.y) < 1e-6) return null; const t = (z - R.origin.y) / R.direction.y; if (t < 0) return null; return [R.origin.x + R.direction.x * t, -(R.origin.z + R.direction.z * t), z]; }
const pv = new window.THREE.Vector3();
function scr(x, y, z) { pv.set(x, z, -y).project(A.camera); return pv.z > 1 ? null : [(pv.x + 1) / 2 * innerWidth, (1 - pv.y) / 2 * innerHeight]; }
function pickObject(e) {
  const hits = setRay(e).intersectObjects(V.pickables.filter(m => { for (let o = m; o; o = o.parent) { if (o === A.F2 && (V.f2op ?? 1) < 0.5) return false; if (o.visible === false) return false; } return true; }), false);
  for (const hit of hits) { const id = hit.object.userData.objId || hit.object.userData.ids?.[hit.instanceId]; const o = id && objById().get(id); if (o && !o.deleted) return o; } return null; }
function stepStops() { return (V.edit?.steps || []).map((s, i) => ({ i, s, st: stopById(s.stop) })).filter(x => x.st); }
function routeOf(i) { const P2 = V.edit.routes?.[i]; if (P2 && P2.length > 1) return P2; const a = stopById(V.edit.steps[i - 1]?.stop)?.pos, b = stopById(V.edit.steps[i]?.stop)?.pos; return a && b ? [[a[0], a[1], a[2] || 0], [b[0], b[1], b[2] || 0]] : []; }
function setRoute(i, pts) { V.edit.routes ||= []; while (V.edit.routes.length <= i) V.edit.routes.push(null); V.edit.routes[i] = pts.map(p => [r2(p[0]), r2(p[1]), p[2] || 0]); }
function nearStop(pt, maxPx = 16, e = null) {
  let best = null; for (const s of V.pack.stops) { if (Math.abs((s.pos[2] || 0) - (pt?.[2] ?? floorZ())) > 1) continue; const q = scr(s.pos[0], s.pos[1], s.pos[2] || 0); if (!q || !e) continue; const d = Math.hypot(q[0] - e.clientX, q[1] - e.clientY); if (d < maxPx && (!best || d < best.d)) best = { s, d }; } return best?.s || null; }
function orthoTo(prev, p) { if (!S.ortho || !prev) return p; return Math.abs(p[0] - prev[0]) >= Math.abs(p[1] - prev[1]) ? [p[0], prev[1], p[2]] : [prev[0], p[1], p[2]]; }
function simplify(pts) {   // drop repeated and collinear points (ends kept)
  const out = []; for (const p of pts) { const l = out.at(-1); if (l && Math.hypot(p[0] - l[0], p[1] - l[1]) < 0.05) continue; out.push(p); }
  for (let k = out.length - 2; k > 0; k--) { const a = out[k - 1], b = out[k], c = out[k + 1], cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); if (Math.abs(cr) < 0.02 * Math.hypot(c[0] - a[0], c[1] - a[1])) out.splice(k, 1); }
  return out; }
function straighten(pts) {   // square every slanted leg with one corner (longer run first), remove tiny jogs, keep the ends
  if (pts.length < 2) return pts; const out = [pts[0]];
  for (let k = 1; k < pts.length; k++) { const a = out.at(-1), b = pts[k], dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dx) > 0.15 && Math.abs(dy) > 0.15) out.push(Math.abs(dx) >= Math.abs(dy) ? [b[0], a[1], a[2]] : [a[0], b[1], a[2]]); out.push(b); }
  return simplify(out); }

/* ---------- live clash check: the route, inflated by the trolley half width, against CAD objects and walls ---------- */
const HALF = 0.42, NOT_OBST = new Set(["RFID_GATE", "PC_STATION", "SCANNER", "LIFT"]);
function clashGrids() {
  if (S.cg && S.cgVer === S.ver) return S.cg; const g = { obj: { 0: new Map(), 6: new Map() }, wall: { 0: new Map(), 6: new Map() } }, add = (m, x0, y0, x1, y1, v) => { for (let x = Math.floor(x0 / 5); x <= Math.floor(x1 / 5); x++) for (let y = Math.floor(y0 / 5); y <= Math.floor(y1 / 5); y++) { const k = x + "," + y; (m.get(k) || m.set(k, []).get(k)).push(v); } };
  for (const o of V.pack.objects) { if (o.deleted || !o.size || ["zone", "transporter", "worker"].includes(o.category) || NOT_OBST.has(o.prefab) || ["TROLLEY", "AGV", "OPERATOR", "CRANE_BRIDGE"].includes(o.prefab)) continue; const z = (o.pos[2] || 0) > 3 ? 6 : 0;
    const c = Math.cos(o.yaw * Math.PI / 180), s = Math.sin(o.yaw * Math.PI / 180), R = Math.hypot(o.size[0], o.size[1]) / 2 + HALF; add(g.obj[z], o.pos[0] - R, o.pos[1] - R, o.pos[0] + R, o.pos[1] + R, { o, c, s, hx: o.size[0] / 2 + HALF, hy: o.size[1] / 2 + HALF }); }
  for (const l of Object.values(V.pack.cad)) if (["exterior_wall", "wall", "partition"].includes(l.kind)) { const z = l.z > 3 ? 6 : 0; for (const s of l.segments) add(g.wall[z], Math.min(s[0], s[2]), Math.min(s[1], s[3]), Math.max(s[0], s[2]), Math.max(s[1], s[3]), s); }
  S.cg = g; S.cgVer = S.ver; return g; }
function clashCheck() {
  if (!V.edit?.steps) return; const g = clashGrids(), objs = new Map(), walls = [];
  const cross = (a, b, s) => { const d = (b[0] - a[0]) * (s[3] - s[1]) - (b[1] - a[1]) * (s[2] - s[0]); if (Math.abs(d) < 1e-9) return null; const u = ((s[0] - a[0]) * (s[3] - s[1]) - (s[1] - a[1]) * (s[2] - s[0])) / d, v = ((s[0] - a[0]) * (b[1] - a[1]) - (s[1] - a[1]) * (b[0] - a[0])) / d; return u > 0.02 && u < 0.98 && v >= 0 && v <= 1 ? [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u] : null; };
  V.edit.steps.forEach((st, i) => { if (!i || st.lift) return; const R = routeOf(i);
    for (let k = 1; k < R.length; k++) { const a = R[k - 1], b = R[k], z = (a[2] || 0) > 3 ? 6 : 0, L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.25));
      for (let j = 0; j <= n; j++) { const x = a[0] + (b[0] - a[0]) * j / n, y = a[1] + (b[1] - a[1]) * j / n; for (const q of g.obj[z].get(Math.floor(x / 5) + "," + Math.floor(y / 5)) || []) { if (objs.has(q.o.id)) continue; const dx = x - q.o.pos[0], dy = y - q.o.pos[1], u = dx * q.c + dy * q.s, v = -dx * q.s + dy * q.c; if (Math.abs(u) < q.hx && Math.abs(v) < q.hy) objs.set(q.o.id, { id: q.o.id, name: q.o.name, step: i, x, y, z }); } }
      const seen = new Set(); for (let x = Math.floor(Math.min(a[0], b[0]) / 5); x <= Math.floor(Math.max(a[0], b[0]) / 5); x++) for (let y = Math.floor(Math.min(a[1], b[1]) / 5); y <= Math.floor(Math.max(a[1], b[1]) / 5); y++) for (const s of g.wall[z].get(x + "," + y) || []) { if (seen.has(s)) continue; seen.add(s); const p = cross(a, b, s); if (p) walls.push({ step: i, x: p[0], y: p[1], z }); } } });
  S.clash = { objects: [...objs.values()], walls }; syncToolbar(); }

/* ---------- director: camera keys, captions, recording, shots ---------- */
const dir = () => { const d = V.edit.director ||= { keys: [], caps: [], shots: [] }; d.keys ||= []; d.caps ||= []; d.shots ||= []; return d; };
const BASE_FOV = 40;
function trolleyAt(t) { const ps = A.pose(Math.max(0, Math.min(V.total, t))); return A.P(ps.p[0], ps.p[1], ps.p[2] + 1.2); }
function curPose() { const C = A.CAM, d = C.eye.clone().sub(C.tgt), r = Math.max(0.01, d.length()); return { x: C.tgt.x, y: C.tgt.y, z: C.tgt.z, dist: r, az: Math.atan2(d.x, d.z), pol: Math.acos(Math.max(-1, Math.min(1, d.y / r))), fov: A.camera.fov }; }
function keyPose(k, t, out) { if (k.follow) { const p = trolleyAt(t); out.x = p.x + k.ox; out.y = p.y + k.oy; out.z = p.z + k.oz; } else { out.x = k.x; out.y = k.y; out.z = k.z; } out.dist = k.dist; out.az = k.az; out.pol = k.pol; out.fov = k.fov || BASE_FOV; return out; }
const PA = {}, PB = {};
V.directorPose = t => {   // V7 evalDirector: smooth (quintic), linear, in, out or cut between keys; log distance; follow keys ride with the trolley
  const K = V.edit?.director?.keys; if (!K || !K.length) return null;
  if (t <= K[0].t) return { ...keyPose(K[0], t, PA) }; if (t >= K.at(-1).t) return { ...keyPose(K.at(-1), t, PA) };
  let i = 0; while (i < K.length - 2 && t >= K[i + 1].t) i++; const a = K[i], b = K[i + 1]; keyPose(a, t, PA);
  if (b.ease === "cut" || b.t - a.t < 1e-3) return { ...PA }; keyPose(b, t, PB); let u = (t - a.t) / (b.t - a.t);
  if (b.ease === "in") u = u * u; else if (b.ease === "out") u = 1 - (1 - u) * (1 - u); else if (b.ease !== "linear") u = u * u * u * (10 + u * (-15 + 6 * u));
  return { x: lerp(PA.x, PB.x, u), y: lerp(PA.y, PB.y, u), z: lerp(PA.z, PB.z, u), dist: Math.exp(lerp(Math.log(PA.dist), Math.log(PB.dist), u)), az: PA.az + wrap(PB.az - PA.az) * u, pol: lerp(PA.pol, PB.pol, u), fov: lerp(PA.fov, PB.fov, u) };
};
function addKey(follow = false, ease = "smooth") {
  const c = curPose(), t = r2(V.e), k = { id: "key" + Date.now().toString(36) + (S.n++), t, x: r2(c.x), y: r2(c.y), z: r2(c.z), dist: r2(c.dist), az: +c.az.toFixed(4), pol: +c.pol.toFixed(4), fov: r2(c.fov), ease, follow };
  if (follow) { const p = trolleyAt(t); k.ox = r2(c.x - p.x); k.oy = r2(c.y - p.y); k.oz = r2(c.z - p.z); }
  commit(`camera key at ${fmtT(t)}`, ["path:" + V.path.id], () => { const d = dir(), i = d.keys.findIndex(q => Math.abs(q.t - t) < 0.5); if (i >= 0) d.keys[i] = k; else d.keys.push(k); d.keys.sort((a, b) => a.t - b.t); });
  S.keySel = k.id; A.tip(`Camera key ${dir().keys.length} at ${fmtT(t)}${follow ? " (rides with the trolley)" : ""}. Play the Director camera: D`, 2600); }
function camRecToggle() {
  if (S.camRec) { const K = S.camRec.keys; S.camRec = null; if (K.length < 2) return render();
    const keep = [K[0]]; for (let i = 1; i < K.length - 1; i++) { const a = keep.at(-1), b = K[i + 1], k = K[i], u = (k.t - a.t) / Math.max(1e-3, b.t - a.t), pos = Math.hypot(lerp(a.x, b.x, u) - k.x, lerp(a.y, b.y, u) - k.y, lerp(a.z, b.z, u) - k.z);
      const err = pos / Math.max(3, k.dist) + Math.abs(wrap(a.az + wrap(b.az - a.az) * u - k.az)) * 1.5 + Math.abs(lerp(a.pol, b.pol, u) - k.pol) * 1.5 + Math.abs(Math.log(Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), u)) / k.dist)); if (err > 0.03 || k.t - a.t > 30) keep.push(k); }
    keep.push(K.at(-1)); const t0 = keep[0].t, t1 = keep.at(-1).t;
    commit("record camera move", ["path:" + V.path.id], () => { const d = dir(); d.keys = d.keys.filter(q => q.t < t0 - 0.01 || q.t > t1 + 0.01); for (const k of keep) d.keys.push({ id: "key" + Date.now().toString(36) + (S.n++), ease: "smooth", follow: false, ...k }); d.keys.sort((a, b) => a.t - b.t); });
    A.tip(`Camera move recorded: ${keep.length} keys from ${fmtT(t0)} to ${fmtT(t1)}`); return render(); }
  if (["guided", "follow", "chase", "director", "overview", "plan"].includes(V.mode)) A.setMode("free"); S.camRec = { keys: [], last: -1, wall: 0 }; V.playing = true; A.tip("Recording your camera: drive it with the mouse (drag, right-drag, wheel); press J again to stop", 4000); render(); }
function sampleCamRec(dt) { const R = S.camRec; if (!R) return; if (!V.playing || V.e < R.last) return camRecToggle(); R.wall += dt; if (R.wall < 0.25) return; R.wall = 0; R.last = V.e; const c = curPose(); R.keys.push({ t: r2(V.e), ...c }); }
function addCaption() { const t0 = r2(V.e), cur = V.steps[V.ps?.step || 0]; commit("add caption", ["path:" + V.path.id], () => dir().caps.push({ id: "cap" + Date.now().toString(36), t0, t1: r2(Math.min(V.total, t0 + 40)), title: cur?.title || "Title", text: "Write the explanation here", pos: "lower" })); S.tab = "director"; render(); }
function shot(i, saveIt) { const d = dir(); if (saveIt || !d.shots[i]) { const c = curPose(); commit("save shot " + (i + 1), ["path:" + V.path.id], () => { dir().shots[i] = { x: r2(c.x), y: r2(c.y), z: r2(c.z), dist: r2(c.dist), az: +c.az.toFixed(4), pol: +c.pol.toFixed(4) }; }); return A.tip("Shot " + (i + 1) + " saved (click to fly there; Shift+click to save again)"); }
  const s = d.shots[i]; A.setMode("free"); A.orbit.tgt.set(s.x, s.y, s.z); A.orbit.r = s.dist; A.orbit.th = s.az; A.orbit.ph = s.pol; }
const capLayer = h(`<div id="caps"></div>`), capEls = new Map();
function drawCaptions() { const caps = V.edit?.director?.caps || [], t = V.e, live = new Set();
  for (const c of caps) { const fade = 2.5, a = Math.min(Math.max(0, Math.min(1, (t - c.t0) / fade)), Math.max(0, Math.min(1, (c.t1 - t) / fade))); if (a <= 0) continue; live.add(c.id); let el = capEls.get(c.id);
    if (!el) { el = h(`<div class="cap9"><b></b><p></p></div>`); capLayer.appendChild(el); capEls.set(c.id, el); } const key = c.title + "|" + c.text + "|" + c.pos; if (el._k !== key) { el._k = key; el.className = "cap9 " + (c.pos || "lower"); el.firstChild.textContent = c.title || ""; el.lastChild.textContent = c.text || ""; }
    el.style.opacity = a; el.style.transform = c.pos === "center" ? `translate(-50%,-50%) scale(${0.96 + 0.04 * a})` : `translateX(-50%) translateY(${(1 - a) * 10}px)`; }
  for (const [id, el] of capEls) if (!live.has(id)) { el.remove(); capEls.delete(id); } }

/* ---------- UI: Studio button, toolbar, panel, lanes, overlay ---------- */
const ov = h(`<canvas id="ov"></canvas>`), og = ov.getContext("2d"), lanes = h(`<canvas id="lanes" class="glass" height="34"></canvas>`), lg = lanes.getContext("2d");
const stb = h(`<div id="stb" class="glass" role="toolbar" aria-label="Studio tools">
  <button data-a="undo" title="Undo (Ctrl+Z)">↶</button><button data-a="redo" title="Redo (Ctrl+Y)">↷</button><span class="sep"></span>
  <button data-tool="select" title="Select and move (V): click any object, stop or route point; drag to move; Q / E turn">Select</button>
  <button data-tool="draw" title="Draw (B): in the 2D plan click points; click a stop to end a step; Enter finishes, Backspace removes a point, Esc cancels">Draw route</button>
  <button data-tool="stop" title="New stop (N): click on the floor">+ Stop</button>
  <button data-tool="place" title="Place an object (P): choose it in Objects, then click on the floor">+ Object</button><span class="sep"></span>
  <label title="Snap positions to a grid (hold Alt while dragging: no snap)">Snap <select id="stb-snap"><option value="0">off</option><option value="0.1">0.1 m</option><option value="0.5">0.5 m</option><option value="1">1 m</option></select></label>
  <button data-a="ortho" title="Ortho (O): routes keep horizontal and vertical legs">Ortho</button><button data-a="straight" title="Straighten the selected step (S); Shift: the whole path">Straighten</button><button data-a="auto" title="Auto-route (R): the shortest clear route for every step that clashes (live Control Center)">Auto-route</button><span class="sep"></span>
  <span id="stb-chk" class="chk" title="Live check of this path against the CAD objects and walls; click to go to the first clash"></span><span id="stb-save" class="sv"></span>${"<button data-a=\"export\" title=\"Download the edits as JSON\">Export</button>"}</div>`);
const panel = h(`<div id="studio" class="glass"><div class="tabs9">${["steps", "paths", "objects", "director", "numbers"].map((t, i) => `<button data-t="${t}" title="Alt+${i + 1}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div><div id="sp"></div></div>`);
const ctx = h(`<div id="ctx" class="glass"></div>`);
function syncToolbar() {
  if (!A) return; stb.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === S.tool)); stb.querySelector('[data-a="ortho"]').classList.toggle("on", S.ortho); $("#stb-snap").value = String(S.snap);
  stb.querySelector('[data-a="undo"]').disabled = !S.undo.length; stb.querySelector('[data-a="redo"]').disabled = !S.redo.length; stb.querySelector('[data-a="auto"]').disabled = A.OFFLINE;
  const n = S.clash.objects.length + S.clash.walls.length, el = $("#stb-chk"); el.className = "chk " + (n ? "bad" : "ok"); el.textContent = n ? `${S.clash.objects.length} object clash(es) · ${S.clash.walls.length} wall crossing(s)` : "No clashes";
  setState(S.state, S.msg); }
function setOpen(on) { S.open = on; S.lw = 0; V.studioOpen = on; document.body.classList.toggle("studio", on); $("#studio-btn")?.classList.toggle("on", on); if (!on) { S.draw = null; S.tool = "select"; } render(); syncToolbar(); }
function setTab(t) { S.tab = t; render(); }
const inp = (k, v, opt = "") => `<input data-f="${k}" value="${A.esc(v ?? "")}" ${opt}>`, numIn = (k, v, step = 0.1, opt = "") => `<input type="number" data-f="${k}" step="${step}" value="${v ?? ""}" ${opt}>`;
function render() {
  if (!A || !S.open) return; panel.querySelectorAll(".tabs9 button").forEach(b => b.classList.toggle("on", b.dataset.t === S.tab)); const sp = $("#sp"), e = V.edit, esc = A.esc;
  if (document.activeElement && sp.contains(document.activeElement) && document.activeElement.matches("input,textarea,select") && S.keepFocus) return;
  if (S.tab === "steps") {
    const opts = V.pack.stops.filter(s => s.id.startsWith(V.tab + ".")).map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.floor === "2F" ? " (2F)" : ""}</option>`).join("");
    sp.innerHTML = `<h4>Path</h4><div class="row">${inp("p.name", e.name, 'class="w"')}</div><div class="row"><label>Colour<input type="color" data-f="p.color" value="${e.color || "#a78bfa"}"></label><label>Push m/s${numIn("p.push_speed_mps", e.push_speed_mps ?? 1)}</label><label>AGV m/s${numIn("p.agv_speed_mps", e.agv_speed_mps ?? 1.2)}</label><label>Lift s${numIn("p.lift_s", e.lift_s ?? 60, 1)}</label></div>
<h4>Steps · click a number to go there; the engine re-times at once</h4>${e.steps.map((s, i) => { const tl = V.steps[i] || {}; return `<div class="step ${S.stepSel === i ? "sel" : ""} ${V.ps?.step === i ? "now" : ""}" data-i="${i}">
<div class="row"><button class="n" data-a="go" data-i="${i}" title="Go to this step">${i + 1}</button>${inp(`s.${i}.title`, s.title, 'class="w" placeholder="Step title"')}${s.lift ? `<span class="tag">⇅ ${esc(s.lift)}</span>` : ""}</div>
<div class="row"><label>Stop<select data-f="s.${i}.stop">${opts.replace(`value="${esc(s.stop)}"`, `value="${esc(s.stop)}" selected`)}</select></label>${i ? `<label>Move<select data-f="s.${i}.mode"><option value="push" ${s.mode !== "agv" ? "selected" : ""}>push</option><option value="agv" ${s.mode === "agv" ? "selected" : ""}>AGV</option></select></label>` : ""}<label>Wait s${numIn(`s.${i}.wait_s`, s.wait_s ?? 0, 1, 'min="0"')}</label></div>
<textarea data-f="c.${i}" rows="2" placeholder="What happens here (shown on the player)">${esc(e.captions?.[i] || "")}</textarea>
<div class="row muted">${i ? `${(tl.dist ?? 0).toFixed?.(1) ?? tl.dist} m · move ${fmtT((tl.tm || 0) - (tl.t0 || 0))} · ` : ""}at ${fmtT(tl.t0 || 0)}${i && !s.lift ? ` · <button data-a="drawstep" data-i="${i}" title="Redraw this step's route in the 2D plan (B)">Draw route</button><button data-a="straightstep" data-i="${i}">Straighten</button>` : ""}<button data-a="addstep" data-i="${i}" title="Insert a step after this one">+ step</button>${i ? `<button data-a="delstep" data-i="${i}" title="Delete this step">✕</button>` : ""}</div></div>`; }).join("")}
<div class="muted">${V.engineErr ? `<b class="bad">${esc(V.engineErr)}</b>` : esc(V.engineMsg || "")}</div>`;
  } else if (S.tab === "paths") {
    sp.innerHTML = `<h4>Paths of ${esc(V.tab.toUpperCase())}</h4>${V.pack.paths.filter(p => p.tab === V.tab).map(p => `<div class="row item ${p.id === V.path.id ? "sel" : ""}"><i style="background:${p.data.color || "#a78bfa"}"></i><button data-a="pick" data-id="${esc(p.id)}" class="w">${esc(p.data.name)}</button><button data-a="dup" data-id="${esc(p.id)}" title="Duplicate">⧉</button><button data-a="delpath" data-id="${esc(p.id)}" title="Delete">✕</button></div>`).join("")}
<div class="row"><button data-a="newpath" title="Draw a new path in the 2D plan: click the start stop, then route points and stops">+ New path (draw)</button><button data-a="allpaths" class="${S.allPaths ? "on" : ""}">Show all paths</button></div>
<p class="muted">Drawing: the camera turns to the 2D plan. Click a stop to start, click on the floor for corners (Ortho keeps them square), click the next stop to end a step. Shift+click on empty floor makes a new stop there. Enter finishes; Backspace removes the last point; Esc cancels. Every step gets a title and can get a text in Steps.</p>`;
  } else if (S.tab === "objects") {
    const o = S.sel?.kind === "obj" ? objById().get(S.sel.id) : null, st = S.sel?.kind === "stop" ? stopById(S.sel.id) : null, q = (S.q || "").toLowerCase();
    const list = q ? V.pack.objects.filter(x => !x.deleted && (x.id + " " + x.name + " " + x.prefab).toLowerCase().includes(q)).slice(0, 40) : [];
    const prefabs = [...new Map(V.pack.objects.filter(x => x.asset && !["TROLLEY", "AGV", "OPERATOR"].includes(x.prefab)).map(x => [x.prefab, x])).values()];
    sp.innerHTML = `${o ? `<h4>Object · ${esc(o.prefab)}</h4><div class="row">${inp("o.name", o.name, 'class="w"')}</div><div class="row muted">${esc(o.id)}${o.pos[2] > 3 ? " · 2nd floor" : ""}</div>
<div class="row"><label>X m${numIn("o.x", r2(o.pos[0]))}</label><label>Y m${numIn("o.y", r2(o.pos[1]))}</label><label>Turn °${numIn("o.yaw", r2(o.yaw), 1)}</label></div>
<div class="row"><label>Width${numIn("o.w", r2(o.size[0]))}</label><label>Depth${numIn("o.d", r2(o.size[1]))}</label><label>Height${numIn("o.h", r2(o.size[2] || 1))}</label></div>
<div class="row"><button data-a="rot" data-v="-90">⟲ 90°</button><button data-a="rot" data-v="90">⟳ 90°</button><button data-a="focus">Focus</button><button data-a="dupobj">Duplicate</button><button data-a="delobj">Delete</button></div>`
      : st ? `<h4>Stop</h4><div class="row">${inp("st.name", st.name, 'class="w"')}</div><div class="row muted">${esc(st.id)}</div><div class="row"><label>X m${numIn("st.x", r2(st.pos[0]))}</label><label>Y m${numIn("st.y", r2(st.pos[1]))}</label></div><p class="muted">Drag the stop on the floor; the routes that end there follow.</p>`
      : `<p class="muted">Click any object in 3D or in the 2D plan to select it; drag to move it, Q / E to turn (Shift: 90°), Delete to remove. Hold Alt while dragging for no snap.</p>`}
<h4>Find</h4><input id="oq" placeholder="name, id or type…" value="${esc(S.q || "")}" class="w">${list.map(x => `<button data-a="selobj" data-id="${esc(x.id)}" class="li">${esc(x.name || x.id)} <small>${esc(x.prefab)}</small></button>`).join("")}
<h4>Place a new object</h4><div class="row"><select id="pf">${prefabs.map(x => `<option value="${esc(x.prefab)}" ${S.lastPrefab === x.prefab ? "selected" : ""}>${esc(x.prefab.replace(/_/g, " ").toLowerCase())}</option>`).join("")}</select><button data-a="place">Place (click on the floor)</button></div>`;
  } else if (S.tab === "director") {
    const d = V.edit.director || { keys: [], caps: [], shots: [] };
    sp.innerHTML = `<h4>Camera keys · the Director camera (D) plays them</h4><div class="row"><button data-a="key" title="K">+ Key</button><button data-a="fkey" title="Shift+K: the key rides with the trolley">+ Follow key</button><button data-a="camrec" class="${S.camRec ? "rec" : ""}" title="J">${S.camRec ? "■ Stop recording" : "● Record camera move"}</button><button data-a="playdir" title="Shift+P">▶ Play</button></div>
${(d.keys || []).map((k, i) => `<div class="row item ${S.keySel === k.id ? "sel" : ""}"><button data-a="gokey" data-i="${i}" class="n">${i + 1}</button><span class="w">${fmtT(k.t)}${k.follow ? " · follow" : ""}</span><select data-f="k.${i}.ease">${["smooth", "linear", "in", "out", "cut"].map(x => `<option ${k.ease === x ? "selected" : ""}>${x}</option>`).join("")}</select><button data-a="updkey" data-i="${i}" title="Take the current view">⟳</button><button data-a="delkey" data-i="${i}">✕</button></div>`).join("") || `<p class="muted">Frame a view (Free camera), move the time, press K. Keys blend smoothly; "cut" jumps.</p>`}
<h4>Captions</h4><div class="row"><button data-a="cap" title="C">+ Caption at ${fmtT(V.e)}</button></div>${(d.caps || []).map((c, i) => `<div class="capr"><div class="row"><label>From${numIn(`cp.${i}.t0`, c.t0, 1)}</label><label>To${numIn(`cp.${i}.t1`, c.t1, 1)}</label><select data-f="cp.${i}.pos">${["lower", "upper", "center"].map(x => `<option ${c.pos === x ? "selected" : ""}>${x}</option>`).join("")}</select><button data-a="delcap" data-i="${i}">✕</button></div>${inp(`cp.${i}.title`, c.title, 'class="w" placeholder="Title"')}<textarea data-f="cp.${i}.text" rows="2">${esc(c.text || "")}</textarea></div>`).join("")}
<h4>Shots · click to fly, Shift+click to save the view</h4><div class="row">${[0, 1, 2, 3, 4, 5].map(i => `<button data-a="shot" data-i="${i}" class="${d.shots?.[i] ? "on" : ""}">${i + 1}</button>`).join("")}</div>
<p class="muted">Times are engine seconds of this trip, so the film plays the same at every speed. Record (R) films the Director camera when keys exist.</p>`;
  } else if (S.tab === "numbers") {
    const k = V.kpis || {}, b = V.base?.kpis || {}, dlt = (a, c, u = "") => c != null && a != null && Math.abs(a - c) > 0.05 ? ` <small class="${a > c ? "bad" : "good"}">${a > c ? "+" : ""}${(a - c).toFixed(1)}${u}</small>` : "";
    const trips = k.trip_s ? Math.floor(28800 / k.trip_s) : 0, tripsB = b.trip_s ? Math.floor(28800 / b.trip_s) : 0;
    sp.innerHTML = `<h4>This trip · Factory Engine</h4><table class="nums"><tr><td>Trip time</td><td>${fmtT(k.trip_s || 0)}${dlt(k.trip_s, b.trip_s, " s")}</td></tr><tr><td>Distance</td><td>${k.distance_m ?? "-"} m${dlt(k.distance_m, b.distance_m, " m")}</td></tr>
<tr><td>Pushed by hand</td><td>${k.push_m ?? "-"} m</td></tr><tr><td>AGV</td><td>${k.agv_m ?? "-"} m</td></tr><tr><td>Elevator rides</td><td>${k.lift_rides || 0}</td></tr><tr><td>Trips per 8 h shift (one trolley)</td><td>${trips}${trips !== tripsB && tripsB ? ` <small>${trips > tripsB ? "good" : "bad"}: was ${tripsB}</small>` : ""}</td></tr><tr><td>Clashes (live check)</td><td>${S.clash.objects.length} objects · ${S.clash.walls.length} walls</td></tr></table>
<h4>Steps</h4><table class="nums"><tr><th>#</th><th>Step</th><th>m</th><th>move</th><th>wait</th></tr>${V.steps.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.title)}</td><td>${i ? s.dist : ""}</td><td>${i ? fmtT((s.tm || 0) - (s.t0 || 0)) : ""}</td><td>${fmtT((s.t1 || 0) - (s.tm || 0))}</td></tr>`).join("")}</table>
${S.clash.objects.length ? `<h4>Clashes</h4>${S.clash.objects.map(c => `<button class="li" data-a="selobj" data-id="${esc(c.id)}">step ${c.step + 1}: ${esc(c.name || c.id)}</button>`).join("")}` : ""}<p class="muted">Before = this path when it was opened.</p>`;
  }
  if (S.focusF) { const el = sp.querySelector(`[data-f="${S.focusF}"]`); if (el) { el.focus(); if (el.setSelectionRange && el.type !== "number") el.setSelectionRange(el.value.length, el.value.length); } S.focusF = null; }
}

/* ---------- panel edits (every change = one undoable command; text fields commit when you leave them) ---------- */
function applyField(f, v, el) {
  const e = V.edit, pk = "path:" + V.path.id, n = +v, [a, b, c] = f.split(".");
  if (a === "p") return commit("path " + b, [pk], () => { e[b] = el.type === "number" ? n : v; });
  if (a === "s") return commit(`step ${+b + 1} ${c}`, [pk], () => { const s = e.steps[+b]; if (c === "wait_s") s.wait_s = Math.max(0, n); else s[c] = v;
    if (c === "stop") { const st = stopById(v); s.title ||= st?.name; if (e.routes?.[+b]) { const R = e.routes[+b]; R[R.length - 1] = [...st.pos]; } if (e.routes?.[+b + 1]) e.routes[+b + 1][0] = [...st.pos]; } });
  if (a === "c") return commit(`step ${+b + 1} text`, [pk], () => { e.captions ||= []; while (e.captions.length < e.steps.length) e.captions.push(""); e.captions[+b] = v; });
  if (a === "k") return commit("camera key ease", [pk], () => { dir().keys[+b][c] = v; });
  if (a === "cp") return commit("caption", [pk], () => { const cp = dir().caps[+b]; cp[c] = el.type === "number" ? n : v; });
  if (a === "o") { const o = objById().get(S.sel.id); return commit("object " + b, ["obj:" + o.id], () => { if (b === "name") o.name = v; if (b === "x") o.pos = [n, o.pos[1], o.pos[2]]; if (b === "y") o.pos = [o.pos[0], n, o.pos[2]]; if (b === "yaw") o.yaw = n; if (b === "w") o.size = [Math.max(0.05, n), o.size[1], o.size[2]]; if (b === "d") o.size = [o.size[0], Math.max(0.05, n), o.size[2]]; if (b === "h") o.size = [o.size[0], o.size[1], Math.max(0.05, n)]; }); }
  if (a === "st") { const st = stopById(S.sel.id); if (b === "name") return commit("stop name", ["stop:" + st.id], () => { st.name = v; }); return moveStop(st, b === "x" ? [n, st.pos[1], st.pos[2]] : [st.pos[0], n, st.pos[2]], true); }
}
panel.addEventListener("change", ev => { const el = ev.target; if (el.id === "pf") { S.lastPrefab = el.value; return; } if (!el.dataset.f) return; applyField(el.dataset.f, el.value, el); });
panel.addEventListener("input", ev => { if (ev.target.id === "oq") { S.q = ev.target.value; S.focusF = null; render(); const q2 = $("#oq"); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); } });
panel.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.matches("input:not(#oq)")) ev.target.blur(); ev.stopPropagation(); });
function pathKeysUsing(stopId) { return V.pack.paths.filter(p => p.data.steps.some(s => s.stop === stopId)).map(p => "path:" + p.id); }
function moveStop(st, pos, finalCommit) {   // the stop and every route end that touches it
  const keys = ["stop:" + st.id, ...pathKeysUsing(st.id)], fn = () => { st.pos = [r2(pos[0]), r2(pos[1]), st.pos[2] || 0];
    for (const p of V.pack.paths) p.data.steps.forEach((s, i) => { if (s.stop !== st.id) return; const R = p.data.routes; if (R?.[i]?.length > 1) R[i][R[i].length - 1] = [...st.pos]; if (R?.[i + 1]?.length > 1) R[i + 1][0] = [...st.pos]; }); };
  return finalCommit ? commit("move stop " + st.name, keys, fn) : fn(); }
panel.addEventListener("click", ev => {
  const b = ev.target.closest("button"); if (!b) return; if (b.dataset.t) return setTab(b.dataset.t); const a = b.dataset.a, i = +b.dataset.i, pk = "path:" + V.path.id, e = V.edit; if (!a) return;
  if (a === "go") { S.stepSel = i; V.e = i ? V.steps[i].t0 : 0; A.camReset(); render(); }
  if (a === "drawstep") startDraw({ kind: "step", i });
  if (a === "straightstep") commit(`straighten step ${i + 1}`, [pk], () => setRoute(i, straighten(routeOf(i))));
  if (a === "addstep") { const st = V.pack.stops.find(s => s.id.startsWith(V.tab + ".") && s.id !== e.steps[i].stop) || stopById(e.steps[i].stop); commit("insert step", [pk], () => { e.steps.splice(i + 1, 0, { stop: st.id, mode: "push", wait_s: 30, title: st.name }); e.routes ||= []; e.routes.splice(i + 1, 0, null); if (e.routes[i + 2]) e.routes[i + 2] = null; e.captions?.splice(i + 1, 0, ""); }); S.stepSel = i + 1; S.focusF = `s.${i + 1}.title`; render(); }
  if (a === "delstep") { if (e.steps.length <= 2) return A.tip("A path needs at least two steps"); commit(`delete step ${i + 1}`, [pk], () => { e.steps.splice(i, 1); e.routes?.splice(i, 1); if (e.routes?.[i]) e.routes[i] = null; e.captions?.splice(i, 1); }); }
  if (a === "pick") A.selectPath(b.dataset.id);
  if (a === "dup") { const p = pathById(b.dataset.id), id = uniq(p.id + "-copy", x => pathById(x)); commit("duplicate path", ["path:" + id], () => { const d = clone(p.data); d.path_id = id; d.name = p.data.name + " (copy)"; d.color = PALETTE[V.pack.paths.length % PALETTE.length]; V.pack.paths.push({ id, tab: p.tab, data: d, timeline: null }); }); A.selectPath(id); }
  if (a === "delpath") { if (V.pack.paths.filter(p => p.tab === V.tab).length < 2) return A.tip("Keep at least one path in this tab"); commit("delete path", ["path:" + b.dataset.id], () => { const k = V.pack.paths.findIndex(p => p.id === b.dataset.id); V.pack.paths.splice(k, 1); }); }
  if (a === "newpath") startDraw({ kind: "path" });
  if (a === "allpaths") { S.allPaths = !S.allPaths; render(); }
  if (a === "selobj") { select({ kind: "obj", id: b.dataset.id }); focusSel(); }
  if (a === "rot") turnSel(+b.dataset.v); if (a === "focus") focusSel(); if (a === "dupobj") dupSel(); if (a === "delobj") deleteSel();
  if (a === "place") { S.lastPrefab = $("#pf").value; setTool("place"); }
  if (a === "key") addKey(false); if (a === "fkey") addKey(true); if (a === "camrec") camRecToggle(); if (a === "playdir") playDirector();
  if (a === "gokey") { const k = dir().keys[i]; S.keySel = k.id; V.e = k.t; V.playing = false; A.setMode("director"); render(); }
  if (a === "updkey") { const c = curPose(); commit("update camera key", [pk], () => { const k = dir().keys[i]; Object.assign(k, { x: r2(c.x), y: r2(c.y), z: r2(c.z), dist: r2(c.dist), az: +c.az.toFixed(4), pol: +c.pol.toFixed(4), fov: r2(c.fov) }); if (k.follow) { const p = trolleyAt(k.t); k.ox = r2(c.x - p.x); k.oy = r2(c.y - p.y); k.oz = r2(c.z - p.z); } }); }
  if (a === "delkey") commit("delete camera key", [pk], () => dir().keys.splice(i, 1));
  if (a === "cap") addCaption(); if (a === "delcap") commit("delete caption", [pk], () => dir().caps.splice(i, 1));
  if (a === "shot") shot(i, ev.shiftKey);
});
function playDirector() { if (!dir().keys.length) return A.tip("Add camera keys first (K)"); A.setMode("director"); V.e = 0; V.playing = true; }
const uniq = (base, exists) => { let id = base, n = 2; while (exists(id)) id = `${base}-${n++}`; return id; };
stb.addEventListener("click", ev => { const b = ev.target.closest("button"); if (!b) return; if (b.dataset.tool) return setTool(b.dataset.tool); const a = b.dataset.a;
  if (a === "undo") undo(); if (a === "redo") redo(); if (a === "ortho") { S.ortho = !S.ortho; syncToolbar(); } if (a === "export") exportEdits();
  if (a === "straight") straightenSel(ev.shiftKey); if (a === "auto") autoRoute(); });
stb.querySelector("#stb-snap").addEventListener("change", ev => { S.snap = +ev.target.value; });
stb.querySelector("#stb-chk").addEventListener("click", () => { const c = S.clash.objects[0] || S.clash.walls[0]; if (!c) return; A.setMode("free"); A.orbit.tgt.copy(A.P(c.x, c.y, c.z)); A.orbit.r = 30; A.orbit.ph = 0.7; if (c.id) select({ kind: "obj", id: c.id }); });
function setTool(t) { S.tool = t; S.draw = null; if (t === "draw") startDraw(S.stepSel > 0 && !V.edit.steps[S.stepSel]?.lift ? { kind: "step", i: S.stepSel } : { kind: "path" }); if (t === "place" && !S.lastPrefab) { S.tab = "objects"; render(); A.tip("Choose the object type in Objects, then click on the floor"); } if (t === "stop") A.tip("Click on the floor to place a new stop", 2500); syncToolbar(); }
function startDraw(d) { S.tool = "draw"; S.draw = { ...d, pts: [], stops: [], steps: [], routes: [] }; if (V.mode !== "plan") A.setMode("plan");
  A.tip(d.kind === "step" ? `Redraw step ${d.i + 1}: click corner points from "${V.steps[d.i - 1]?.title}", end on the stop "${V.steps[d.i]?.title}" (or Enter)` : "New path: click the start stop, then corners and stops (Shift+click empty floor = new stop). Enter finishes.", 6000); syncToolbar(); }
function straightenSel(all) { const pk = "path:" + V.path.id; if (all || S.stepSel < 1) commit("straighten the path", [pk], () => V.edit.steps.forEach((s, i) => { if (i && !s.lift) setRoute(i, straighten(routeOf(i))); })); else commit(`straighten step ${S.stepSel + 1}`, [pk], () => setRoute(S.stepSel, straighten(routeOf(S.stepSel)))); }
async function autoRoute() { if (A.OFFLINE) return A.tip("Auto-route runs in the live Control Center"); await save(); A.tip("Auto-route: finding clear routes…", 8000);
  try { const r = await fetch("/api/autoroute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: V.path.id }) }).then(x => x.json()); if (r.error) throw new Error(r.error);
    const fresh = await fetch("/api/records/path/" + encodeURIComponent(V.path.id)).then(x => x.json()), pk = "path:" + V.path.id, before = [[pk, snap(pk)]];
    V.path.data.routes = fresh.data.routes; V.edit = V.path.data; S.known.add(pk); const after = [[pk, snap(pk)]]; S.undo.push({ label: "auto-route", before, after }); S.redo.length = 0; refresh([pk]);
    A.tip(`Auto-route: ${(r.changed || []).length} step(s) re-routed; clashes after: ${r.clash_after ?? 0}`); } catch (e) { A.tip("Auto-route failed: " + e.message); } }

/* ---------- selection ---------- */
let selMesh = null;
function selBox() { if (selMesh) { selMesh.parent?.remove(selMesh); selMesh = null; } if (!S.sel || S.sel.kind !== "obj") return; const o = objById().get(S.sel.id); if (!o || o.deleted) return;
  const g = new T.EdgesGeometry(new T.BoxGeometry(o.size[0] + 0.2, (o.size[2] || 1) + 0.2, o.size[1] + 0.2)); selMesh = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xc89bff, depthTest: false, transparent: true })); selMesh.renderOrder = 9;
  selMesh.position.copy(A.P(o.pos[0], o.pos[1], (o.pos[2] || 0) + (o.size[2] || 1) / 2)); selMesh.rotation.y = o.yaw * Math.PI / 180; A.scene.add(selMesh); }
function select(s) { S.sel = s; if (s && (s.kind === "obj" || s.kind === "stop")) S.tab = "objects"; selBox(); render(); }
function focusSel() { const o = S.sel?.kind === "obj" ? objById().get(S.sel.id) : S.sel?.kind === "stop" ? stopById(S.sel.id) : null; if (!o) return; if (V.mode !== "plan") A.setMode("free"); A.orbit.tgt.copy(A.P(o.pos[0], o.pos[1], o.pos[2] || 0)); A.orbit.r = Math.min(A.orbit.r, 40); }
function turnSel(deg) { const o = S.sel?.kind === "obj" && objById().get(S.sel.id); if (!o) return; commit("turn " + (o.name || o.id), ["obj:" + o.id], () => { o.yaw = ((o.yaw + deg) % 360 + 360) % 360; }); }
function deleteSel() { const o = S.sel?.kind === "obj" && objById().get(S.sel.id); if (!o) return A.tip("Select an object first"); commit("delete " + (o.name || o.id), ["obj:" + o.id], () => { o.deleted = true; }); S.sel = null; selBox(); render(); }
function dupSel() { const o = S.sel?.kind === "obj" && objById().get(S.sel.id); if (!o) return; const id = uniq(o.id + "-V9", x => objById().has(x)), n = { ...clone(o), id, name: (o.name || o.prefab) + " (copy)", pos: [r2(o.pos[0] + o.size[0] + 0.5), o.pos[1], o.pos[2]] };
  commit("duplicate " + (o.name || o.id), ["obj:" + id], () => { V.pack.objects.push(n); objById().set(id, n); }); select({ kind: "obj", id }); }

/* ---------- mouse on the scene ---------- */
function handleAt(e) {   // route vertices of the current path (screen space)
  if (!V.edit?.steps) return null; let best = null;
  V.edit.steps.forEach((s, i) => { if (!i || s.lift) return; const R = routeOf(i); for (let k = 1; k < R.length - 1; k++) { const q = scr(R[k][0], R[k][1], R[k][2] || 0); if (!q) continue; const d = Math.hypot(q[0] - e.clientX, q[1] - e.clientY); if (d < 10 && (!best || d < best.d)) best = { kind: "vertex", i, k, d }; } }); return best; }
function segmentAt(e) { let best = null; V.edit.steps.forEach((s, i) => { if (!i || s.lift) return; const R = routeOf(i); for (let k = 1; k < R.length; k++) { const a = scr(...R[k - 1]), b = scr(...R[k]); if (!a || !b) continue; const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1, u = Math.max(0, Math.min(1, ((e.clientX - a[0]) * (b[0] - a[0]) + (e.clientY - a[1]) * (b[1] - a[1])) / L2)), d = Math.hypot(a[0] + (b[0] - a[0]) * u - e.clientX, a[1] + (b[1] - a[1]) * u - e.clientY); if (d < 8 && (!best || d < best.d)) best = { i, k, d }; } }); return best; }
function onDown(e) {
  if (!S.open || e.button !== 0) return; const alt = e.altKey;
  if (S.tool === "draw" && S.draw) { e.stopImmediatePropagation(); drawClick(e); return; }
  if (S.tool === "stop") { e.stopImmediatePropagation(); const p = floorAt(e); if (p) newStop(snapV(p[0], alt), snapV(p[1], alt), p[2]); setTool("select"); return; }
  if (S.tool === "place") { e.stopImmediatePropagation(); const p = floorAt(e); if (p) placeNew(snapV(p[0], alt), snapV(p[1], alt), p[2]); return; }
  const hd = handleAt(e); if (hd) { e.stopImmediatePropagation(); const pk = "path:" + V.path.id; S.drag = { kind: "vertex", ...hd, before: [[pk, snap(pk)]], x: e.clientX, y: e.clientY }; S.stepSel = hd.i; return; }
  const st = nearStop(null, 14, e); if (st) { e.stopImmediatePropagation(); select({ kind: "stop", id: st.id }); S.drag = { kind: "stop", st, before: ["stop:" + st.id, ...pathKeysUsing(st.id)].map(k => [k, snap(k)]), x: e.clientX, y: e.clientY, moved: false }; return; }
  const o = pickObject(e); if (o) { e.stopImmediatePropagation(); select({ kind: "obj", id: o.id }); const p = floorAt(e, o.pos[2] || 0); S.drag = { kind: "obj", o, off: p ? [o.pos[0] - p[0], o.pos[1] - p[1]] : [0, 0], before: [["obj:" + o.id, snap("obj:" + o.id)]], x: e.clientX, y: e.clientY, moved: false }; return; }
  if (V.mode === "plan") { e.stopImmediatePropagation(); S.drag = { kind: "pan", x: e.clientX, y: e.clientY, moved: false }; return; }
  S.drag = { kind: "none", x: e.clientX, y: e.clientY };
}
function onMove(e) {
  if (!S.open) return; S.mouse = [e.clientX, e.clientY]; const d = S.drag, alt = e.altKey;
  if (!d) { const hov = (S.tool === "select" && (handleAt(e) || nearStop(null, 14, e))) || null; A.canvas.style.cursor = S.tool !== "select" ? "crosshair" : hov ? "move" : ""; return; }
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3) d.moved = true;
  if (d.kind === "pan") { const f = A.orbit.r * 0.0016 * 1.4; A.orbit.tgt.x -= (e.clientX - d.x) * f; A.orbit.tgt.z -= (e.clientY - d.y) * f; d.x = e.clientX; d.y = e.clientY; return; }
  if (!d.moved) return;
  if (d.kind === "obj") { const p = floorAt(e, d.o.pos[2] || 0); if (!p) return; d.o.pos = [snapV(p[0] + d.off[0], alt), snapV(p[1] + d.off[1], alt), d.o.pos[2] || 0]; A.placeObject(d.o); selBox(); }
  if (d.kind === "stop") { const p = floorAt(e, d.st.pos[2] || 0); if (!p) return; moveStop(d.st, [snapV(p[0], alt), snapV(p[1], alt)], false); throttleRetime(); }
  if (d.kind === "vertex") { const p = floorAt(e, routeOf(d.i)[d.k][2] || 0); if (!p) return; const R = routeOf(d.i).map(q => [...q]); let x = snapV(p[0], alt), y = snapV(p[1], alt);
    if (S.ortho && !alt) { const a = R[d.k - 1], b = R[d.k + 1]; for (const q of [a, b]) { if (Math.abs(x - q[0]) < 0.8) x = q[0]; if (Math.abs(y - q[1]) < 0.8) y = q[1]; } }
    R[d.k] = [x, y, R[d.k][2] || 0]; setRoute(d.i, R); throttleRetime(); }
}
function throttleRetime() { if (S.rt) return; S.rt = requestAnimationFrame(() => { S.rt = null; A.retime(); }); }
function onUp(e) {
  const d = S.drag; S.drag = null; if (!d || !S.open) return;
  if (d.kind === "none") { if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) { select(null); } return; }
  if (d.kind === "pan") { if (!d.moved) select(null); return; }
  if (!d.moved) return;
  const after = d.before.map(([k]) => [k, snap(k)]); if (d.before.every((b, i) => b[1] === after[i][1])) return;
  if (d.kind === "vertex") { const R = simplify(routeOf(d.i)); setRoute(d.i, R); after[0][1] = snap(after[0][0]); }
  pushUndo({ obj: "move " + (d.o?.name || "object"), stop: "move stop " + d.st?.name, vertex: `edit route of step ${d.i + 1}` }[d.kind], d.before, after);
}
function onDbl(e) { if (!S.open || S.tool !== "select") return; const sg = segmentAt(e); if (!sg) return; e.stopImmediatePropagation(); const p = floorAt(e, routeOf(sg.i)[0][2] || 0); if (!p) return; const pk = "path:" + V.path.id;
  commit(`add a route point to step ${sg.i + 1}`, [pk], () => { const R = routeOf(sg.i).map(q => [...q]); R.splice(sg.k, 0, [snapV(p[0]), snapV(p[1]), R[0][2] || 0]); setRoute(sg.i, R); }); }
function onCtx(e) { if (!S.open) return; const hd = handleAt(e); if (!hd) return; e.preventDefault(); e.stopImmediatePropagation(); const pk = "path:" + V.path.id; commit(`remove a route point of step ${hd.i + 1}`, [pk], () => { const R = routeOf(hd.i).map(q => [...q]); R.splice(hd.k, 1); setRoute(hd.i, R); }); }
function newStop(x, y, z, silent) { const id = uniq(`${V.tab}.stop-${S.n++}`, q => stopById(q)), st = { id, name: "New stop " + id.split("-").pop(), symbol: "area", pos: [x, y, z || 0], floor: (z || 0) > 3 ? "2F" : "1F" };
  commit("new stop", ["stop:" + id], () => V.pack.stops.push(st)); if (!silent) { select({ kind: "stop", id }); S.focusF = "st.name"; render(); } return st; }
function placeNew(x, y, z) { const proto = V.pack.objects.find(o => o.prefab === (S.lastPrefab || $("#pf")?.value) && o.asset); if (!proto) return A.tip("Choose the object type in Objects first");
  const id = uniq(`${proto.prefab}-V9-${S.n++}`, q => objById().has(q)), o = { id, name: proto.prefab.replace(/_/g, " ").toLowerCase() + " (new)", prefab: proto.prefab, category: proto.category, asset: proto.asset, ref: proto.ref, pos: [x, y, z], yaw: 0, size: [...(proto.ref || proto.size)] };
  commit("place " + o.name, ["obj:" + id], () => { V.pack.objects.push(o); objById().set(id, o); }); select({ kind: "obj", id }); A.tip("Placed. Click again to place another, V to stop", 2500); }

/* ---------- drawing routes and paths in the 2D plan ---------- */
function drawClick(e) {
  const D = S.draw, alt = e.altKey, z = D.kind === "step" ? (stopById(V.edit.steps[D.i - 1].stop).pos[2] || 0) : (D.stops.at(-1)?.pos[2] ?? floorZ()); let st = nearStop([0, 0, z], 16, e);
  const p0 = floorAt(e, z); if (!p0) return; if (!st && e.shiftKey && D.kind === "path") st = newStop(snapV(p0[0]), snapV(p0[1]), z, true);
  if (D.kind === "step") { const target = stopById(V.edit.steps[D.i].stop); if (st && st.id === target.id) return finishDraw(); D.pts.push(orthoTo(D.pts.at(-1) || stopById(V.edit.steps[D.i - 1].stop).pos, [snapV(p0[0], alt), snapV(p0[1], alt), z])); return; }
  if (!D.stops.length) { if (!st) return A.tip("Start on a stop (or Shift+click to make one)"); D.stops.push(st); D.steps.push({ stop: st.id, mode: "push", wait_s: 30, title: st.name }); D.routes.push(null); return; }
  const prev = D.stops.at(-1).pos;
  if (st) { if (st.id === D.stops.at(-1).id) return; const route = [[...prev], ...D.pts, [...st.pos]]; D.routes.push(S.ortho ? straighten(route) : route); D.stops.push(st); D.steps.push({ stop: st.id, mode: "push", wait_s: 30, title: st.name }); D.pts = []; A.tip(`Step ${D.steps.length}: ${st.name}. Click more points / stops, Enter to finish`, 2500); return; }
  D.pts.push(orthoTo(D.pts.at(-1) || prev, [snapV(p0[0], alt), snapV(p0[1], alt), z]));
}
function finishDraw() {
  const D = S.draw; if (!D) return; S.draw = null; S.tool = "select"; syncToolbar();
  if (D.kind === "step") { const a = stopById(V.edit.steps[D.i - 1].stop).pos, b = stopById(V.edit.steps[D.i].stop).pos, R = [[...a], ...D.pts, [...b]]; commit(`draw route of step ${D.i + 1}`, ["path:" + V.path.id], () => setRoute(D.i, S.ortho ? straighten(R) : simplify(R))); return A.tip(`Step ${D.i + 1} re-drawn; the engine re-timed the trip`); }
  if (D.steps.length < 2) return A.tip("A path needs a start stop and at least one more stop");
  const id = uniq(`${V.tab}-path-${V.pack.paths.filter(p => p.tab === V.tab).length + 1}`, q => pathById(q)), data = { path_id: id, name: `New path ${id.split("-").pop()} · ${D.stops[0].name} to ${D.stops.at(-1).name}`, tab: V.tab, color: PALETTE[V.pack.paths.length % PALETTE.length], trolley_entity_id: V.edit.trolley_entity_id, push_speed_mps: 1.0, agv_speed_mps: 1.2, lift_s: 60, steps: D.steps, routes: D.routes, captions: D.steps.map(() => ""), director: { keys: [], caps: [], shots: [] } };
  commit("new path " + data.name, ["path:" + id], () => V.pack.paths.push({ id, tab: V.tab, data, timeline: null })); A.selectPath(id); S.tab = "steps"; render(); A.tip(`New path with ${D.steps.length} steps. Write the step titles and texts in Steps.`); }

/* ---------- keys (Studio open: take the Studio keys first) ---------- */
addEventListener("keydown", e => {
  const t = e.target; if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return; const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey; let act = null;
  if (k === "e" && !ctrl && !e.altKey && !(S.open && S.sel?.kind === "obj")) act = () => setOpen(!S.open);
  else if (S.open) {
    if (ctrl && k === "z") act = e.shiftKey ? redo : undo; else if (ctrl && k === "y") act = redo; else if (ctrl && k === "s") act = save;
    else if (k === "escape") act = () => { if (S.draw) { S.draw = null; S.tool = "select"; syncToolbar(); } else if (S.tool !== "select") setTool("select"); else select(null); };
    else if (k === "enter" && S.draw) act = finishDraw; else if (k === "backspace" && S.draw) act = () => S.draw.pts.pop();
    else if ((k === "delete" || k === "backspace") && S.sel?.kind === "obj") act = deleteSel;
    else if (e.altKey && k >= "1" && k <= "5") act = () => setTab(["steps", "paths", "objects", "director", "numbers"][+k - 1]);
    else if (ctrl || e.altKey) return;
    else if (k === "q" || k === "e") act = () => turnSel((k === "q" ? -1 : 1) * (e.shiftKey ? 90 : 15));
    else if (k === "v") act = () => setTool("select"); else if (k === "b") act = () => setTool("draw"); else if (k === "n") act = () => setTool("stop");
    else if (k === "s") act = () => straightenSel(e.shiftKey); else if (k === "o") act = () => { S.ortho = !S.ortho; syncToolbar(); A.tip("Ortho " + (S.ortho ? "on" : "off"), 1200); };
    else if (k === "r" && !e.shiftKey) act = autoRoute; else if (k === "k") act = () => addKey(e.shiftKey); else if (k === "j") act = camRecToggle; else if (k === "c") act = addCaption;
    else if (k === "p" && e.shiftKey) act = playDirector; else if (k === "f" && S.sel) act = focusSel; else if (k === "x" && S.sel?.kind === "obj") act = dupSel;
  } else if (ctrl && k === "z") act = undo;
  if (act) { e.preventDefault(); e.stopImmediatePropagation(); act(); render(); }
}, true);

/* ---------- overlay: step chips, route handles, drawing, all paths, clashes; timeline lanes ---------- */
function rr(g, x, y, w, hh, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, r) : g.rect(x, y, w, hh); }
function drawOverlay() {
  if (!V.ready || !V.edit) return; const cur = V.ps?.step ?? 0, col = V.edit.color || "#a78bfa", need = S.open || S.allPaths;
  if (!need) { if (S.ovDirty) { og.clearRect(0, 0, ov.width, ov.height); S.ovDirty = false; ov.style.display = "none"; } drawChips(cur); return; }
  const W = innerWidth, H = innerHeight; if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; } og.clearRect(0, 0, W, H); S.ovDirty = true; ov.style.display = "";
  if (S.allPaths) for (const p of V.pack.paths) { if (p.tab !== V.tab || p.id === V.path.id) continue; og.strokeStyle = (p.data.color || "#888") + "aa"; og.lineWidth = 2; og.setLineDash([6, 5]); og.beginPath();
    p.data.steps.forEach((s, i) => { if (!i) return; const R = p.data.routes?.[i]?.length > 1 ? p.data.routes[i] : [stopById(p.data.steps[i - 1].stop)?.pos, stopById(s.stop)?.pos].filter(Boolean); R.forEach((q, k) => { const a = scr(q[0], q[1], q[2] || 0); if (!a) return; k ? og.lineTo(...a) : og.moveTo(...a); }); }); og.stroke(); og.setLineDash([]); }
  if (S.open) {   // route handles of the current path
    V.edit.steps.forEach((s, i) => { if (!i || s.lift) return; const R = routeOf(i), sel = S.stepSel === i; og.strokeStyle = sel ? "#fff" : col; og.lineWidth = sel ? 2.5 : 1.5; og.beginPath(); R.forEach((q, k) => { const a = scr(q[0], q[1], q[2] || 0); if (a) k ? og.lineTo(...a) : og.moveTo(...a); }); og.stroke();
      for (let k = 1; k < R.length - 1; k++) { const a = scr(R[k][0], R[k][1], R[k][2] || 0); if (!a) continue; og.fillStyle = "#fff"; og.strokeStyle = col; og.lineWidth = 2; og.beginPath(); og.rect(a[0] - 4.5, a[1] - 4.5, 9, 9); og.fill(); og.stroke(); } });
    for (const c of S.clash.objects) { const a = scr(c.x, c.y, c.z); if (!a) continue; og.strokeStyle = "#ff4d4f"; og.lineWidth = 3; og.beginPath(); og.moveTo(a[0] - 7, a[1] - 7); og.lineTo(a[0] + 7, a[1] + 7); og.moveTo(a[0] + 7, a[1] - 7); og.lineTo(a[0] - 7, a[1] + 7); og.stroke(); }
    for (const c of S.clash.walls) { const a = scr(c.x, c.y, c.z); if (!a) continue; og.fillStyle = "#ff4d4f"; og.beginPath(); og.arc(a[0], a[1], 5, 0, 7); og.fill(); }
    if (S.sel?.kind === "stop") { const st = stopById(S.sel.id), a = st && scr(st.pos[0], st.pos[1], st.pos[2] || 0); if (a) { og.strokeStyle = "#c89bff"; og.lineWidth = 3; og.beginPath(); og.arc(a[0], a[1], 15, 0, 7); og.stroke(); } }
    if (S.tool === "stop" || S.tool === "place" || S.draw) for (const s of V.pack.stops) { if (!s.id.startsWith(V.tab + ".")) continue; const a = scr(s.pos[0], s.pos[1], s.pos[2] || 0); if (!a) continue; og.fillStyle = "rgba(255,176,46,.9)"; og.beginPath(); og.arc(a[0], a[1], 4, 0, 7); og.fill(); og.fillStyle = "rgba(255,255,255,.85)"; og.font = "11px Segoe UI"; og.fillText(s.name, a[0] + 7, a[1] + 4); }
    const D = S.draw; if (D) { og.strokeStyle = "#ffe08a"; og.lineWidth = 3; og.setLineDash([8, 6]); og.beginPath(); let started = false; const lineTo = q => { const a = scr(q[0], q[1], q[2] || 0); if (!a) return; started ? og.lineTo(...a) : og.moveTo(...a); started = true; };
      if (D.kind === "step") lineTo(stopById(V.edit.steps[D.i - 1].stop).pos); else { D.routes.forEach(R => R && R.forEach(lineTo)); if (D.stops.length) lineTo(D.stops.at(-1).pos); } D.pts.forEach(lineTo);
      if (S.mouse && started) { const z = D.kind === "step" ? stopById(V.edit.steps[D.i - 1].stop).pos[2] || 0 : D.stops.at(-1)?.pos[2] || 0, m = floorAt({ clientX: S.mouse[0], clientY: S.mouse[1] }, z); if (m) lineTo(orthoTo(D.pts.at(-1) || (D.kind === "step" ? stopById(V.edit.steps[D.i - 1].stop).pos : D.stops.at(-1)?.pos), [snapV(m[0]), snapV(m[1]), z])); }
      og.stroke(); og.setLineDash([]); }
  }
  drawChips(cur);
}
/* V8 step chips as DOM elements (moved by transform: cheap for the compositor; no full-screen canvas each frame) */
const chipLayer = h(`<div id="chips"></div>`), chipEls = new Map(), MK = { result: "result", mapping: "mapping", scan: "scan", area: "area", dest: "dest", gate: "gate" };
function drawChips(cur) {
  const live = new Set(), intro = V.mode === "guided" && A.CAM.intro >= 0, flat = (V.flat || 0) > 0.5;
  if (V.labels) V.edit.steps.forEach((s, i) => { const st = stopById(s.stop); if (!st) return; const key = s.stop + (s.lift ? ":" + i : ""); if (live.has(key)) return;
    const up = (st.pos[2] || 0) > 3; if (flat && up) return; const a = scr(st.pos[0], st.pos[1], (st.pos[2] || 0) + (flat ? 0 : 2.4)); if (!a || a[0] < -200 || a[0] > innerWidth + 50 || a[1] < -40 || a[1] > innerHeight + 40) return;
    live.add(key); let el = chipEls.get(key); if (!el) { el = h(`<div class="chip9"><i></i><span></span></div>`); chipLayer.appendChild(el); chipEls.set(key, el); }
    const now = i === cur && !intro, done = i < cur && !intro, dim = up !== ((V.ps?.p[2] || 0) > 3) && V.floor2 !== "show", label = `${i + 1} ${s.title || st.name}`, cls = `chip9 ${MK[st.symbol] || "area"}${now ? " now" : done ? " done" : ""}${dim ? " dim" : ""}`;
    if (el._l !== label) { el._l = label; el.lastChild.textContent = label; } if (el.className !== cls) el.className = cls;
    el.style.transform = `translate3d(${(a[0] - 9) | 0}px,${(a[1] - 11) | 0}px,0)`; });
  for (const [k, el] of chipEls) if (!live.has(k)) { el.remove(); chipEls.delete(k); }
}
function drawLanes() {
  if (!S.open) return; const W = S.lw || (S.lw = lanes.clientWidth), H = 34; if (!W) { S.lw = 0; return; } if (lanes.width !== W) lanes.width = W; lg.clearRect(0, 0, W, H); if (!V.ready || !V.total) return;
  const x = t => 8 + (W - 16) * t / V.total, col = V.edit.color || "#a78bfa";
  V.steps.forEach((s, i) => { if (!i) return; lg.fillStyle = s.lift ? "#5eead4" : s.mode === "agv" ? "#60a5fa" : col; lg.fillRect(x(s.t0), 4, Math.max(1, x(s.tm) - x(s.t0)), 10); lg.fillStyle = "rgba(255,255,255,.18)"; lg.fillRect(x(s.tm), 4, Math.max(1, x(s.t1) - x(s.tm)), 10);
    lg.fillStyle = "rgba(255,255,255,.8)"; lg.font = "9px Segoe UI"; if (x(s.t1) - x(s.t0) > 14) lg.fillText(String(i + 1), x(s.t0) + 2, 12.5); });
  const d = V.edit.director; for (const c of d?.caps || []) { lg.fillStyle = "rgba(255,225,166,.55)"; lg.fillRect(x(c.t0), 18, Math.max(2, x(c.t1) - x(c.t0)), 5); }
  for (const k of d?.keys || []) { const X = x(k.t); lg.fillStyle = S.keySel === k.id ? "#fff" : "#c89bff"; lg.beginPath(); lg.moveTo(X, 24); lg.lineTo(X + 4, 28.5); lg.lineTo(X, 33); lg.lineTo(X - 4, 28.5); lg.fill(); }
  lg.fillStyle = "#fff"; lg.fillRect(x(Math.min(V.e, V.total)) - 1, 0, 2, H);
}
lanes.addEventListener("pointerdown", e => { const r = lanes.getBoundingClientRect(), t = Math.max(0, Math.min(V.total, (e.clientX - r.left - 8) / (r.width - 16) * V.total)); const k = (V.edit.director?.keys || []).find(q => Math.abs(((q.t / V.total) * (r.width - 16) + 8) - (e.clientX - r.left)) < 6 && e.clientY - r.top > 22); if (k) S.keySel = k.id; V.e = k ? k.t : t; A.camReset(); render(); });

/* ---------- start ---------- */
V.hooks.ready.push(() => {
  A = V.api; T = A.T;
  S.known = new Set([...V.pack.paths.map(p => "path:" + p.id), ...V.pack.stops.map(s => "stop:" + s.id), ...V.pack.objects.map(o => "obj:" + o.id)]);
  if (A.OFFLINE) { try { const L = JSON.parse(localStorage.getItem(LKEY()) || "{}"); S.local = L; for (const [k, j] of Object.entries(L)) put(k, j); if (Object.keys(L).length) setTimeout(() => A.tip(`Restored ${Object.keys(L).length} edited record(s) saved in this browser`), 1500); } catch (e) {} }
  document.body.append(ov, chipLayer, capLayer, lanes, stb, panel, ctx);
  $("#studio-btn").onclick = () => setOpen(!S.open); S.shot = shot; S.addKey = f => addKey(!!f);
  A.canvas.addEventListener("pointerdown", onDown, true); addEventListener("pointermove", onMove); addEventListener("pointerup", onUp); A.canvas.addEventListener("dblclick", onDbl, true); A.canvas.addEventListener("contextmenu", onCtx, true);
  setState("saved");
});
(V.hooks.built ||= []).push(() => { for (const o of V.pack.objects) if (!V.objIndex[o.id] && !o.deleted && o.asset) A.addObjectMesh(o); else if (o.deleted) A.placeObject(o); syncToolbar(); clashCheck(); });
V.hooks.timeline.push(() => { clearTimeout(S.ct); S.ct = setTimeout(clashCheck, 120); if (S.open && !S.drag) render(); });
V.hooks.path.push(() => { S.stepSel = -1; S.draw = null; if (S.sel?.kind !== "obj") S.sel = null; render(); });
V.hooks.frame.push((dt, ps) => { sampleCamRec(dt); drawOverlay(); drawLanes(); drawCaptions(); if (S.open && S.tab === "steps" && S.lastStep !== ps.step) { S.lastStep = ps.step; panel.querySelectorAll(".step").forEach(el => el.classList.toggle("now", +el.dataset.i === ps.step)); } });
})();
