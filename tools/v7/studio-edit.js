/* ===== V7 Studio: scene editor (selection, gizmo, live moves, props, replica objects, paths, placement) ===== */
const stage = $("stage"), labelsEl = X.labels;
const ov = document.createElement("canvas"); ov.id = "ed7fx"; stage.appendChild(ov);
const og = ov.getContext("2d");
const ed = {
  open: false, tab: "objects", sel: null, hover: null, placing: null, drawing: null, hits: [], issues: [],
  pickReplica: true, showAllPaths: true, stepSel: -1, dragging: null, lastPointer: null,
};
const KINDS = ["walls", "columns", "racks", "machines", "pallets"];
const REP_H = { walls: 3.6, columns: 8.5, racks: 7.6, machines: 3.2, pallets: 1.3 };
const REP_NAME = { walls: "Wall", columns: "Column", racks: "Rack block", machines: "Machine", pallets: "Pallet" };

/* ---------- projection helpers ---------- */
const wv = new T.Vector3(), pj = [0, 0, 0];
function scr(x, y, h = 1, out = [0, 0, 0]) { MF.W(x, y, S.stack, h, wv); MF.proj(wv, out); return out; }
const onScreen = (p) => p[2] > -1 && p[2] < 1;
const ray = new T.Raycaster(), ndc = new T.Vector2();
function setRay(e) { ndc.set(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2); ray.setFromCamera(ndc, camera); return ray; }
// floor hit -> plan point (x, y) on the plate that was hit
function hitPlan(e) {
  setRay(e); const arts = X.floors.map((f) => f.art), hit = ray.intersectObjects(arts, false)[0]; if (!hit) return null;
  const fl = X.floors.find((f) => f.art === hit.object), g = X.plates[fl.key];
  return { x: hit.point.x - g.position.x + CX, y: hit.point.z - g.position.z + CY, plate: fl.key, world: hit.point.clone() };
}
// ray -> plan point on a given plate's floor plane (for drags: stays on the plate even off its picture)
const plane = new T.Plane(new T.Vector3(0, 1, 0), 0), pHit = new T.Vector3();
function planeHit(e, plate) {
  setRay(e); const g = X.plates[plate] || X.plates[plateKeys[0]]; plane.constant = -(g.position.y + .12);
  if (!ray.ray.intersectPlane(plane, pHit)) return null; return { x: pHit.x - g.position.x + CX, y: pHit.z - g.position.z + CY, plate };
}
const snapStep = () => (doc.settings.snap > 0 ? doc.settings.snap * M : 0);
const snapV = (v, e) => { const s = snapStep(); return s && !(e && e.altKey) ? Math.round(v / s) * s : +v.toFixed(2); };

/* ---------- props: simple, good-looking 3D objects owned by the Studio ---------- */
const PROP_TYPES = {
  box: { name: "Crate", w: 1.2, d: 1, h: 1, color: "#c9a26b" },
  pallet: { name: "Pallet stack", w: 1.2, d: 1, h: 1.4, color: "#c9a26b" },
  rack: { name: "Rack", w: 5.4, d: 1.1, h: 5, color: "#e2761b" },
  column: { name: "Column", w: .6, d: .6, h: 8.5, color: "#c4cad3" },
  wall: { name: "Wall", w: 6, d: .25, h: 3.6, color: "#eef0f3" },
  fence: { name: "Safety fence", w: 4, d: .1, h: 1.1, color: "#f4c20d" },
  cone: { name: "Traffic cone", w: .4, d: .4, h: .75, color: "#ff6a1f" },
  arrow: { name: "Floor arrow", w: 2.4, d: 1.2, h: .02, color: "#2bd4c0" },
  zone: { name: "Floor zone", w: 4, d: 3, h: .02, color: "#1f6feb" },
  sign: { name: "Info sign", w: 1.6, d: .1, h: 2.2, color: "#1b57b8", text: "INFO" },
  trolley: { name: "Trolley", w: .98, d: 1.74, h: 1.2, color: "#3a6fb0" },
};
const matCache = new Map();
function pmat(color, opts = {}) {
  const key = color + JSON.stringify(opts); let m = matCache.get(key);
  if (!m) { m = new T.MeshStandardMaterial(Object.assign({ color: new T.Color(color), roughness: .62, metalness: .08 }, opts)); m.name = "MF V7 prop"; matCache.set(key, m); }
  return m;
}
const unitBox = new T.BoxGeometry(1, 1, 1), unitCone = new T.ConeGeometry(.5, 1, 20), unitCyl = new T.CylinderGeometry(.5, .5, 1, 16);
function boxPart(g, mat, x, y, z, sx, sy, sz) { const m = new T.Mesh(unitBox, mat); m.position.set(x * M, y * M, z * M); m.scale.set(Math.max(.01, sx * M), Math.max(.01, sy * M), Math.max(.01, sz * M)); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
function signTexture(text, color) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256; const g = c.getContext("2d");
  g.fillStyle = color; g.fillRect(0, 0, 512, 256); g.strokeStyle = "#ffffff"; g.lineWidth = 12; g.strokeRect(14, 14, 484, 228);
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; const lines = String(text || "").split("\n").slice(0, 3);
  let size = 92; g.font = `700 ${size}px Segoe UI, system-ui, sans-serif`; while (size > 26 && lines.some((l) => g.measureText(l).width > 460)) { size -= 6; g.font = `700 ${size}px Segoe UI, system-ui, sans-serif`; }
  lines.forEach((l, i) => g.fillText(l, 256, 128 + (i - (lines.length - 1) / 2) * size * 1.1));
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
function arrowShape() { const s = new T.Shape(); s.moveTo(-.5, -.18); s.lineTo(.1, -.18); s.lineTo(.1, -.5); s.lineTo(.5, 0); s.lineTo(.1, .5); s.lineTo(.1, .18); s.lineTo(-.5, .18); s.closePath(); return s; }
const arrowGeo = new T.ShapeGeometry(arrowShape()).rotateX(-Math.PI / 2);
function buildProp(p) {
  const g = new T.Group(), c = p.color || "#999", w = p.w, d = p.d, h = p.h;
  if (p.type === "box") boxPart(g, pmat(c, { roughness: .9 }), 0, h / 2, 0, w, h, d);
  else if (p.type === "pallet") { boxPart(g, pmat("#9c7443", { roughness: .9 }), 0, .07, 0, w, .14, d); boxPart(g, pmat(c, { roughness: .9 }), 0, .14 + (h - .14) / 2, 0, w * .96, h - .14, d * .96); boxPart(g, pmat("#e9e2d0", { roughness: .9 }), 0, .14 + (h - .14) * .55, d * .48, w * .5, .2, .01); }
  else if (p.type === "rack") {
    const bays = Math.max(1, Math.round(w / 2.7)), lv = 1.75, levels = Math.max(1, Math.floor(h / lv)), orange = pmat(c), blue = pmat("#2360c9"), card = [pmat("#c9a26b", { roughness: .9 }), pmat("#d9b98a", { roughness: .9 }), pmat("#5b8fd9", { roughness: .9 })];
    for (let b = 0; b <= bays; b++) for (const e of [-1, 1]) boxPart(g, orange, -w / 2 + b * w / bays, h / 2, e * d / 2, .09, h, .09);
    for (let l = 1; l <= levels; l++) for (const e of [-1, 1]) boxPart(g, blue, 0, l * lv - .1, e * d / 2, w, .12, .07);
    let n = 0; for (let b = 0; b < bays; b++) for (let l = 0; l < levels; l++) for (const u of [.27, .73]) { if ((b * 7 + l * 3 + (u > .5 ? 1 : 0)) % 7 === 3) continue; const bh = .9 + ((n++ * 37) % 10) / 30; boxPart(g, card[n % 3], -w / 2 + (b + u) * w / bays, l * lv + (l ? .05 : .15) + bh / 2, 0, w / bays * .4, bh, d * .8); }
  } else if (p.type === "column") { boxPart(g, pmat(c), 0, h / 2, 0, w, h, d); boxPart(g, pmat("#f4c20d"), 0, .5, 0, w * 1.5, 1, d * 1.5); }
  else if (p.type === "wall") { boxPart(g, pmat(c), 0, h / 2, 0, w, h, d); boxPart(g, pmat("#14536f"), 0, .65, 0, w + .02, 1.3, d + .02); }
  else if (p.type === "fence") {
    const n = Math.max(2, Math.round(w / 1.2) + 1), post = pmat("#1a2030"), rail = pmat(c);
    for (let i = 0; i < n; i++) boxPart(g, post, -w / 2 + i * w / (n - 1), h / 2, 0, .08, h, .08);
    for (const y of [h * .45, h * .95]) boxPart(g, rail, 0, y, 0, w, .09, .06);
  } else if (p.type === "cone") {
    const m = new T.Mesh(unitCone, pmat(c, { roughness: .5 })); m.scale.set(w * M, h * M, d * M); m.position.y = h * M / 2; m.castShadow = true; g.add(m);
    const band = new T.Mesh(unitCyl, pmat("#ffffff", { roughness: .4 })); band.scale.set(w * .62 * M, h * .12 * M, d * .62 * M); band.position.y = h * .55 * M; g.add(band);
    boxPart(g, pmat("#1a2030"), 0, .02, 0, w * 1.2, .04, d * 1.2);
  } else if (p.type === "arrow") { const m = new T.Mesh(arrowGeo, pmat(c, { roughness: .5, emissive: new T.Color(c), emissiveIntensity: .25 })); m.scale.set(w * M, 1, d * M); m.position.y = .5; m.renderOrder = 2; g.add(m); }
  else if (p.type === "zone") { const m = new T.Mesh(unitBox, pmat(c, { transparent: true, opacity: .32, depthWrite: false })); m.scale.set(w * M, .05, d * M); m.position.y = .48; m.renderOrder = 2; g.add(m); const e = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w * M, .06, d * M)), new T.LineBasicMaterial({ color: c })); e.position.y = .5; g.add(e); }
  else if (p.type === "sign") {
    boxPart(g, pmat("#56616b", { metalness: .4 }), 0, h * .35, 0, .08, h * .7, .08); boxPart(g, pmat("#3a4356"), 0, .03, 0, .5, .06, .5);
    const tex = signTexture(p.text || "INFO", c), face = new T.MeshStandardMaterial({ map: tex, roughness: .5 }); face.name = "MF V7 sign";
    const panel = new T.Mesh(unitBox, [pmat(c), pmat(c), pmat(c), pmat(c), face, face]); panel.position.y = h * .75 * M; panel.scale.set(w * M, h * .45 * M, Math.max(.05, d) * M); panel.castShadow = true; g.add(panel);
  }
  if (p.type === "trolley") { const m = MF.lot && MF.lot.userData.model; if (m) { const c = m.clone(true); c.scale.multiplyScalar(p.d / 1.74); g.add(c); } else boxPart(g, pmat(c), 0, h / 2, 0, w, h, d); }
  g.position.set(p.x - CX, 0, p.y - CY); g.rotation.y = -(p.rot || 0) * Math.PI / 180;
  g.traverse((o) => { o.userData.prop = p.id; }); g.name = "MF V7 prop " + (p.name || p.type);
  return g;
}
const propGroups = {}, propObjs = new Map();
function propGroup(plate) { if (!propGroups[plate]) { const g = new T.Group(); g.name = "MF V7 props " + plate; (X.plates[plate] || X.plates[plateKeys[0]]).add(g); propGroups[plate] = g; } return propGroups[plate]; }
function syncProps() {
  for (const o of propObjs.values()) { if (o.parent) o.parent.remove(o); o.traverse((x) => { if (x.material && x.material.name === "MF V7 sign") { x.material.map && x.material.map.dispose(); x.material.dispose(); } if (x.geometry && x.geometry.type === "EdgesGeometry") x.geometry.dispose(); }); }
  propObjs.clear();
  for (const p of doc.props) { const o = buildProp(p); propGroup(p.plate).add(o); propObjs.set(p.id, o); }
}
function moveProp3D(p) { const o = propObjs.get(p.id); if (o) { o.position.set(p.x - CX, 0, p.y - CY); o.rotation.y = -(p.rot || 0) * Math.PI / 180; } }

/* ---------- replica objects: an index from tag to instances, live moves, turns and deletes ---------- */
function applyOp(kind, o, op) {   // same rule as scene-core applyLayoutEdits, in frame units
  const dx = op.dx || 0, dy = op.dy || 0, rot = (((op.rot || 0) % 360) + 360) % 360;
  if (kind === "walls") { const mx = (o.a[0] + o.b[0]) / 2 + dx, my = (o.a[1] + o.b[1]) / 2 + dy, r = rot * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r), t = (p) => { const x = p[0] + dx - mx, y = p[1] + dy - my; return [mx + x * c - y * sn, my + x * sn + y * c]; }; o.a = t(o.a); o.b = t(o.b); }
  else if (kind === "columns") o.p = [o.p[0] + dx, o.p[1] + dy];
  else { o.x += dx; o.y += dy; if (rot === 90 || rot === 270) { const cx = o.x + o.w / 2, cy = o.y + o.h / 2, w = o.w; o.w = o.h; o.h = w; o.x = cx - o.w / 2; o.y = cy - o.h / 2; if (kind === "machines" && o.type === "injection") o.vertical = !o.vertical; } }
}
let repIndex = null; const repTouched = new Set();
const mA = new T.Matrix4(), mB = new T.Matrix4(), mC = new T.Matrix4(), mD = new T.Matrix4();
function buildRepIndex() {
  repIndex = new Map();
  for (const entry of MF.REP.meshes) {
    const tags = entry.tags; if (!tags) continue; const arr = entry.im.instanceMatrix.array;
    for (let i = 0; i < tags.length; i++) { const t = tags[i]; if (!t) continue; let r = repIndex.get(t); if (!r) repIndex.set(t, (r = { tag: t, parts: [] })); r.parts.push({ entry, i, m0: arr.slice(i * 16, i * 16 + 16), b0: entry.base ? entry.base.slice(i * 4, i * 4 + 4) : null }); }
  }
  for (const k of KINDS) for (const o of RP[k] || []) { const r = repIndex.get(k + ":" + o._oid); if (r) { r.kind = k; r.obj = o; r.base = clone(o); r.plate = o.plate; } }
  for (const [t, r] of repIndex) if (!r.obj) repIndex.delete(t);
}
const repCentre = (k, o) => (k === "walls" ? [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2] : k === "columns" ? [o.p[0], o.p[1]] : [o.x + o.w / 2, o.y + o.h / 2]);
function repRect(k, o) {
  if (k === "walls") return [Math.min(o.a[0], o.b[0]) - .75, Math.min(o.a[1], o.b[1]) - .75, Math.max(o.a[0], o.b[0]) + .75, Math.max(o.a[1], o.b[1]) + .75];
  if (k === "columns") return [o.p[0] - 1.45, o.p[1] - 1.45, o.p[0] + 1.45, o.p[1] + 1.45];
  return [o.x, o.y, o.x + o.w, o.y + o.h];
}
// put one replica object where the document says (op relative to the original data, minus what this session already built in)
function syncRep(tag) {
  if (!repIndex) buildRepIndex(); const r = repIndex.get(tag); if (!r) return;
  const op = doc.replica[tag] || {}, lo = loadedOps[tag] || {}, dx = (op.dx || 0) - (lo.dx || 0), dy = (op.dy || 0) - (lo.dy || 0), drot = (op.rot || 0) - (lo.rot || 0), del = !!op.del;
  Object.keys(r.obj).forEach((k) => delete r.obj[k]); Object.assign(r.obj, clone(r.base));
  applyOp(r.kind, r.obj, { dx, dy, rot: drot });
  const list = RP[r.kind], at = list.indexOf(r.obj);
  if (del && at >= 0) list.splice(at, 1); else if (!del && at < 0) list.push(r.obj);
  const c = repCentre(r.kind, r.base), cx = c[0] - CX, cz = c[1] - CY, ang = -drot * Math.PI / 180;
  mA.makeTranslation(cx + dx, 0, cz + dy); mB.makeRotationY(ang); mC.makeTranslation(-cx, 0, -cz); mA.multiply(mB).multiply(mC);
  for (const p of r.parts) {
    const arr = p.entry.im.instanceMatrix.array, o = p.i * 16;
    if (del) { for (let k = 0; k < 16; k++) arr[o + k] = 0; if (p.b0) for (let k = 0; k < 4; k++) p.entry.base[p.i * 4 + k] = 0; }
    else { mD.fromArray(p.m0); mD.premultiply(mA); mD.toArray(arr, o); if (p.b0) for (let k = 0; k < 4; k++) p.entry.base[p.i * 4 + k] = p.b0[k]; }
    p.entry.im.instanceMatrix.needsUpdate = true;
  }
  repTouched.add(tag);
}
function syncAllRep() { const tags = new Set([...repTouched, ...Object.keys(doc.replica)]); for (const t of tags) syncRep(t); }
applyHooks.replica = () => { if (repTouched.size || Object.keys(doc.replica).length) syncAllRep(); };
applyHooks.props = syncProps;

/* ---------- selection ---------- */
// sel: { kind: "device", i } | { kind: "prop", id } | { kind: "node", id } | { kind: "replica", tag } | { kind: "step", i }
function selObj(sel = ed.sel) {
  if (!sel) return null;
  if (sel.kind === "device") return doc.devices[sel.i] || null;
  if (sel.kind === "prop") return doc.props.find((p) => p.id === sel.id) || null;
  if (sel.kind === "node") return doc.nodes[sel.id] || null;
  if (sel.kind === "replica") { if (!repIndex) buildRepIndex(); const r = repIndex.get(sel.tag); return r ? r.obj : null; }
  return null;
}
function selInfo(sel = ed.sel) {   // plan centre, rect, height (units), plate, title
  const o = selObj(sel); if (!o) return null;
  if (sel.kind === "device") { const fp = footprints(o), r = fp.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]); const h = o.type === "rfid-auto" ? 8.2 * M : o.type === "pc" ? 1.25 * (o.k || DIMS.K) * M : 1.15 * (o.k || DIMS.K) * M; return { x: o.x, y: o.y, r, h, plate: o.plate || "1F", title: o.label || o.type }; }
  if (sel.kind === "prop") return { x: o.x, y: o.y, r: propRect(o), h: Math.max(.3, o.h) * M, plate: o.plate, title: o.name || PROP_TYPES[o.type].name };
  if (sel.kind === "node") return { x: o.x, y: o.y, r: [o.x - 4, o.y - 4, o.x + 4, o.y + 4], h: 2, plate: o.plate || plateOf(o.x, o.y), title: nodeName(o) };
  if (sel.kind === "replica") { const r = repIndex.get(sel.tag), c = repCentre(r.kind, o); return { x: c[0], y: c[1], r: repRect(r.kind, o), h: REP_H[r.kind] * M, plate: o.plate, title: REP_NAME[r.kind] + " " + r.obj._oid }; }
  return null;
}
function select(sel, focus) { ed.sel = sel; if (sel && sel.kind === "step") ed.stepSel = sel.i; emit("select"); if (focus) { const i = selInfo(); if (i) focusPlan(i.x, i.y, i.plate); } }

/* ---------- 3D picking (devices, props, replica objects) ---------- */
function pick3D(e) {
  setRay(e); const cands = [];
  const dev = MF.devices; if (dev && dev.groups) for (const g of Object.values(dev.groups)) if (g.visible) cands.push(g);
  for (const g of Object.values(propGroups)) if (g.visible !== false) cands.push(g);
  let best = null;
  for (const h of ray.intersectObjects(cands, true)) {
    const o = h.object;
    if (o.userData.prop) { best = { kind: "prop", id: o.userData.prop, d: h.distance }; break; }
    let dv = o.userData.dev || (o.isInstancedMesh && o.userData.devs && h.instanceId != null ? o.userData.devs[h.instanceId] : null);
    if (dv) { const i = D.devices.indexOf(dv); if (i >= 0) { best = { kind: "device", i, d: h.distance }; break; } }
  }
  if (ed.pickReplica && S.R > .5) {
    if (!repIndex) buildRepIndex();
    const meshes = MF.REP.meshes.filter((m) => m.tags && m.im.visible && m.im.parent && m.im.parent.visible && !m.im.material.transparent).map((m) => m.im);
    const hit = ray.intersectObjects(meshes, false).find((h) => { const m = MF.REP.meshes.find((q) => q.im === h.object); return m && m.tags[h.instanceId]; });
    if (hit && (!best || hit.distance < best.d - 1)) { const m = MF.REP.meshes.find((q) => q.im === hit.object), tag = m.tags[hit.instanceId]; if (repIndex.has(tag)) best = { kind: "replica", tag, d: hit.distance }; }
  }
  return best;
}

/* ---------- screen-space handles: stops, path vertices and segments, gizmo ---------- */
function nodeHandles() { const out = []; for (const n of nodeList()) { const p = scr(n.x, n.y, 3, [0, 0, 0]); if (onScreen(p)) out.push({ n, p }); } return out; }
const flowPaths = () => { const f = curFlow(); return f ? f.steps.map((s, i) => ({ s, i, P: Array.isArray(s.path) ? s.path : null })) : []; };
function pathHandles() {   // only the selected step's path is editable
  const f = curFlow(), i = ed.stepSel, s = f && f.steps[i]; if (!s || !Array.isArray(s.path)) return null;
  const pts = s.path.map((q) => scr(q[0], q[1], 1.2, [0, 0, 0])); return { f, i, s, pts };
}
const near = (p, x, y, r) => onScreen(p) && Math.hypot(p[0] - x, p[1] - y) <= r;
function segDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / L2, 0, 1); return [Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy), t]; }
function gizmo() {   // screen centre + rotate knob of the selection
  const info = selInfo(); if (!info || ed.sel.kind === "node") return null;
  const c = scr(info.x, info.y, info.h * .5, [0, 0, 0]); if (!onScreen(c)) return null;
  const o = selObj(), k = ed.sel.kind; let ang = 0;
  if (k === "prop") ang = (o.rot || 0) * Math.PI / 180;
  else if (k === "device") ang = o.type === "pc" ? Math.atan2(Math.cos(((o.yawDeg != null ? o.yawDeg : { e: 90, w: -90, n: 180, s: 0 }[o.face || "e"]) * Math.PI) / 180), Math.sin(((o.yawDeg != null ? o.yawDeg : { e: 90, w: -90, n: 180, s: 0 }[o.face || "e"]) * Math.PI) / 180)) : o.type === "rfid-auto" ? (o.axis === "x" ? 0 : Math.PI / 2) : (() => { const l = o.lane || [o.x, o.y]; return Math.atan2(o.y - l[1], o.x - l[0]); })();
  else if (k === "replica") { const r = repIndex.get(ed.sel.tag); ang = ((doc.replica[ed.sel.tag] || {}).rot || 0) * Math.PI / 180; void r; }
  // knob: the plan direction ang, projected
  const R = Math.max(14, (info.r[2] - info.r[0]) * .5 + 8), q = scr(info.x + Math.cos(ang) * R, info.y + Math.sin(ang) * R, info.h * .5, [0, 0, 0]);
  const dx = q[0] - c[0], dy = q[1] - c[1], L = Math.hypot(dx, dy) || 1, knob = [c[0] + dx / L * 58, c[1] + dy / L * 58];
  return { c, knob, info };
}

/* ---------- overlay drawing (only while the Studio editor or director lanes need it) ---------- */
let ovW = 0, ovH = 0;
function sizeOverlay() { const d = Math.min(devicePixelRatio || 1, 2), w = Math.round(innerWidth * d), h = Math.round(innerHeight * d); if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; } og.setTransform(d, 0, 0, d, 0, 0); ovW = innerWidth; ovH = innerHeight; }
let ovDrawn = false;
function drawOverlay(time) {
  const need = ed.open && !rec.active; if (!need) { if (ovDrawn) { og.clearRect(0, 0, ovW, ovH); ovDrawn = false; } return; }
  sizeOverlay(); og.clearRect(0, 0, ovW, ovH); ovDrawn = true;
  if (S.R < .02 && S.view !== "2d" && !ed.open) return;
  const f = curFlow(), paths = ed.tab === "paths" || ed.tab === "steps";
  // flow paths
  if (f) f.steps.forEach((s, i) => {
    if (!Array.isArray(s.path)) return; const sel = paths && i === ed.stepSel;
    if (!paths && !ed.showAllPaths) return;
    const pts = s.path.map((q) => scr(q[0], q[1], 1.2, [0, 0, 0])); if (pts.some((p) => !onScreen(p))) return;
    og.lineJoin = og.lineCap = "round";
    og.strokeStyle = sel ? "rgba(255,214,90,.95)" : paths ? "rgba(140,200,255,.55)" : "rgba(255,255,255,.22)"; og.lineWidth = sel ? 4 : 2; og.setLineDash(sel ? [] : [6, 6]);
    og.beginPath(); pts.forEach((p, k) => (k ? og.lineTo(p[0], p[1]) : og.moveTo(p[0], p[1]))); og.stroke(); og.setLineDash([]);
    if (sel) {
      for (let k = 1; k < pts.length; k++) { // segment length chips + mid handles
        const a = pts[k - 1], b = pts[k], L = Math.hypot(s.path[k][0] - s.path[k - 1][0], s.path[k][1] - s.path[k - 1][1]) * PT_M; if (L < .05) continue;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; og.fillStyle = "rgba(10,24,52,.82)"; const t = L.toFixed(1) + " m"; og.font = "600 11px Segoe UI, system-ui"; const w = og.measureText(t).width + 10;
        og.beginPath(); og.roundRect ? og.roundRect(mx - w / 2, my - 19, w, 16, 8) : og.rect(mx - w / 2, my - 19, w, 16); og.fill(); og.fillStyle = "#ffe08a"; og.textAlign = "center"; og.textBaseline = "middle"; og.fillText(t, mx, my - 11);
        og.fillStyle = "rgba(255,214,90,.9)"; og.fillRect(mx - 4, my - 4, 8, 8);
      }
      pts.forEach((p, k) => { const lock = k === 0 || k === pts.length - 1; og.beginPath(); og.arc(p[0], p[1], lock ? 6 : 7, 0, 7); og.fillStyle = lock ? "#8aa4c8" : "#ffd65a"; og.fill(); og.lineWidth = 2; og.strokeStyle = "#0b1730"; og.stroke(); });
    }
  });
  // drawing tool preview
  if (ed.drawing && ed.lastPointer) {
    const d = ed.drawing, pts = d.pts.map((q) => scr(q[0], q[1], 1.2, [0, 0, 0])), cur = d.preview;
    og.strokeStyle = "#ffd65a"; og.lineWidth = 3; og.setLineDash([8, 6]); og.beginPath(); pts.forEach((p, k) => (k ? og.lineTo(p[0], p[1]) : og.moveTo(p[0], p[1])));
    if (cur) { const c = scr(cur[0], cur[1], 1.2, [0, 0, 0]); og.lineTo(c[0], c[1]); } og.stroke(); og.setLineDash([]);
    for (const p of pts) { og.beginPath(); og.arc(p[0], p[1], 5, 0, 7); og.fillStyle = "#ffd65a"; og.fill(); }
  }
  // collision marks
  for (const h of ed.hits) { const p = scr(h.x, h.y, 1.5, [0, 0, 0]); if (!onScreen(p)) continue; og.strokeStyle = "#ff3b3b"; og.lineWidth = 3; og.beginPath(); og.moveTo(p[0] - 7, p[1] - 7); og.lineTo(p[0] + 7, p[1] + 7); og.moveTo(p[0] + 7, p[1] - 7); og.lineTo(p[0] - 7, p[1] + 7); og.stroke(); }
  // stops
  for (const { n, p } of nodeHandles()) {
    const sel = ed.sel && ed.sel.kind === "node" && ed.sel.id == n.id, hov = ed.hover && ed.hover.kind === "node" && ed.hover.id == n.id;
    og.save(); og.translate(p[0], p[1]); og.rotate(Math.PI / 4); og.fillStyle = sel ? "#ffd65a" : hov ? "#bfe3ff" : "rgba(255,255,255,.75)"; og.strokeStyle = "#0b1730"; og.lineWidth = 1.5; const r = sel ? 7 : 5; og.fillRect(-r, -r, 2 * r, 2 * r); og.strokeRect(-r, -r, 2 * r, 2 * r); og.restore();
    if (sel || hov) { og.font = "600 12px Segoe UI, system-ui"; og.textAlign = "left"; og.textBaseline = "middle"; const t = nodeName(n), w = og.measureText(t).width + 12; og.fillStyle = "rgba(10,24,52,.86)"; og.fillRect(p[0] + 10, p[1] - 10, w, 20); og.fillStyle = "#fff"; og.fillText(t, p[0] + 16, p[1]); }
  }
  // selection box + gizmo
  const info = selInfo();
  if (info) {
    const r = info.r, H = info.h, c = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], lo = c.map((q) => scr(q[0], q[1], .3, [0, 0, 0])), hi = c.map((q) => scr(q[0], q[1], H, [0, 0, 0]));
    if (lo.concat(hi).every(onScreen)) {
      const pulse = .6 + .4 * Math.sin(performance.now() / 260); og.strokeStyle = `rgba(255,214,90,${pulse})`; og.lineWidth = 2;
      og.beginPath(); for (let k = 0; k < 4; k++) { const a = lo[k], b = lo[(k + 1) % 4], A = hi[k], B = hi[(k + 1) % 4]; og.moveTo(a[0], a[1]); og.lineTo(b[0], b[1]); og.moveTo(A[0], A[1]); og.lineTo(B[0], B[1]); og.moveTo(a[0], a[1]); og.lineTo(A[0], A[1]); } og.stroke();
    }
    const gz = gizmo();
    if (gz) {
      const [x, y] = gz.c; og.strokeStyle = "rgba(255,255,255,.55)"; og.lineWidth = 1.5; og.beginPath(); og.arc(x, y, 58, 0, 7); og.stroke();
      og.fillStyle = "rgba(255,214,90,.95)"; og.beginPath(); og.arc(x, y, 9, 0, 7); og.fill();
      og.strokeStyle = "#0b1730"; og.lineWidth = 2; og.beginPath(); for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { og.moveTo(x + ax * 4, y + ay * 4); og.lineTo(x + ax * 8, y + ay * 8); } og.stroke();
      og.fillStyle = "#2bd4c0"; og.beginPath(); og.arc(gz.knob[0], gz.knob[1], 8, 0, 7); og.fill(); og.strokeStyle = "#fff"; og.lineWidth = 2; og.stroke();
      og.strokeStyle = "#2bd4c0"; og.beginPath(); og.moveTo(x, y); og.lineTo(gz.knob[0], gz.knob[1]); og.stroke();
    }
  }
  // placement ghost
  if (ed.placing && ed.placing.at) {
    const a = ed.placing.at, r = ed.placing.rect, c = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map((q) => scr(q[0], q[1], .5, [0, 0, 0]));
    if (c.every(onScreen)) { og.fillStyle = ed.placing.ok ? "rgba(43,212,192,.28)" : "rgba(255,59,59,.3)"; og.strokeStyle = ed.placing.ok ? "#2bd4c0" : "#ff3b3b"; og.lineWidth = 2; og.beginPath(); c.forEach((p, k) => (k ? og.lineTo(p[0], p[1]) : og.moveTo(p[0], p[1]))); og.closePath(); og.fill(); og.stroke(); }
    const p = scr(a[0], a[1], 2, [0, 0, 0]); og.font = "600 12px Segoe UI, system-ui"; og.fillStyle = "#fff"; og.textAlign = "center"; og.fillText(ed.placing.label + (ed.placing.ok ? "" : " (clash)"), p[0], p[1] - 22);
  }
}

/* ---------- moving things ---------- */
let devTimer = 0, devPending = false;
function liveDevices() { if (devTimer) { devPending = true; return; } D.devices = clone(doc.devices); X.rebuildDevices(); devTimer = setTimeout(() => { devTimer = 0; if (devPending) { devPending = false; liveDevices(); } }, 60); }
function moveSelTo(x, y, live) {   // centre of the selection to (x, y) on its plate
  const sel = ed.sel, o = selObj(); if (!o) return;
  if (sel.kind === "device") {
    if (o.type === "rfid-manual") { const lx = (o.lane || [o.x, o.y]), dx = x - o.x, dy = y - o.y; o.lane = snapLane([lx[0] + dx, lx[1] + dy], o.plate || "1F"); o.x = o.lane[0] + (o.x - lx[0]); o.y = o.lane[1] + (o.y - lx[1]); }
    else { o.x = x; o.y = y; }
    if (live) liveDevices();
  } else if (sel.kind === "prop") { o.x = x; o.y = y; if (live) moveProp3D(o); }
  else if (sel.kind === "node") { o.x = x; o.y = y; o.target = [x, y]; }
  else if (sel.kind === "replica") {
    const r = repIndex.get(sel.tag), c = repCentre(r.kind, r.base), lo = loadedOps[sel.tag] || {}, op = doc.replica[sel.tag] || (doc.replica[sel.tag] = {});
    op.dx = +(x - c[0] + (lo.dx || 0)).toFixed(2); op.dy = +(y - c[1] + (lo.dy || 0)).toFixed(2); if (live) syncRep(sel.tag);
  }
}
// a scanner's lane point snaps exactly onto a nearby path of the current flow (then the trolley stops there to be scanned)
function snapLane(p, plate) {
  let best = null, bd = 4;
  for (const f of doc.flows) for (const s of f.steps) if (Array.isArray(s.path) && stepPlate(s) === plate) for (let k = 1; k < s.path.length; k++) {
    const a = s.path[k - 1], b = s.path[k], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, .02, .98), q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return best ? [+best[0].toFixed(3), +best[1].toFixed(3)] : [+p[0].toFixed(2), +p[1].toFixed(2)];
}
function rotateSelTo(dirX, dirY, free, live) {   // point the selection toward a plan direction
  const sel = ed.sel, o = selObj(); if (!o) return;
  let deg = Math.atan2(dirY, dirX) * 180 / Math.PI; if (!free) deg = Math.round(deg / 15) * 15;
  if (sel.kind === "prop") { o.rot = (deg + 360) % 360; if (live) moveProp3D(o); }
  else if (sel.kind === "device") {
    if (o.type === "pc") { o.yawDeg = Math.round(Math.atan2(dirX, dirY) * 180 / Math.PI / (free ? 1 : 15)) * (free ? 1 : 15); delete o.face; o.face = (["s", "e", "n", "w"])[((Math.round(o.yawDeg / 90) % 4) + 4) % 4]; }
    else if (o.type === "rfid-auto") o.axis = Math.abs(dirX) > Math.abs(dirY) ? "x" : "y";
    else if (o.type === "rfid-manual") { const l = o.lane || [o.x, o.y], side = Math.abs(dirX) > Math.abs(dirY) ? (dirX > 0 ? [1, 0] : [-1, 0]) : (dirY > 0 ? [0, 1] : [0, -1]); o.x = l[0] + side[0] * 2 * M; o.y = l[1] + side[1] * 2 * M; }
    if (live) liveDevices();
  } else if (sel.kind === "replica") { const op = doc.replica[sel.tag] || (doc.replica[sel.tag] = {}); op.rot = ((Math.round(deg / 90) * 90) % 360 + 360) % 360; if (live) syncRep(sel.tag); }
}
function rotateSelBy(step) {
  const sel = ed.sel, o = selObj(); if (!o) return;
  commit("turn " + (selInfo() || {}).title, () => {
    if (sel.kind === "prop") o.rot = (((o.rot || 0) + step) % 360 + 360) % 360;
    else if (sel.kind === "replica") { const op = doc.replica[sel.tag] || (doc.replica[sel.tag] = {}); op.rot = (((op.rot || 0) + (step > 0 ? 90 : -90)) % 360 + 360) % 360; }
    else if (sel.kind === "device") {
      if (o.type === "pc") { const y = (o.yawDeg != null ? o.yawDeg : { e: 90, w: -90, n: 180, s: 0 }[o.face || "e"]) + step; o.yawDeg = ((y % 360) + 360) % 360; }
      else if (o.type === "rfid-auto") o.axis = o.axis === "x" ? "y" : "x";
      else if (o.type === "rfid-manual") { const l = o.lane || [o.x, o.y], a = Math.atan2(o.y - l[1], o.x - l[0]) + (step > 0 ? 1 : -1) * Math.PI / 2; o.x = l[0] + Math.round(Math.cos(a)) * 2 * M; o.y = l[1] + Math.round(Math.sin(a)) * 2 * M; }
    }
  }, sel.kind === "prop" ? "props" : sel.kind === "device" ? "devices" : "replica");
}
function nudge(dx, dy) {
  const info = selInfo(); if (!info) return;
  commit("move " + info.title, () => { moveSelTo(info.x + dx, info.y + dy, false); if (ed.sel.kind === "node") relinkNode(ed.sel.id); }, kindRebuild(ed.sel.kind));
}
const kindRebuild = (k) => (k === "prop" ? "props" : k === "device" ? "devices" : k === "replica" ? "replica" : "all");
// after a stop moved: every step ending there ends at the new point, every step leaving it starts there (paths re-joined)
// new last point for a path, start locked: the corner before it slides along so the last leg keeps its direction
function fixEnd(P, e) {
  const n = P.length, last = P[n - 1], prev = P[n - 2], horiz = Math.abs(prev[1] - last[1]) < 1e-6;
  if (n >= 3) { const q = prev.slice(); if (horiz) q[1] = e[1]; else q[0] = e[0]; return simplify([...P.slice(0, n - 2).map((p) => p.slice()), q, e.slice()]); }
  return simplify(elbow(P[0].slice(), e.slice(), horiz));
}
const fixStart = (P, s) => fixEnd(P.slice().reverse(), s).reverse();
function relinkNode(id) {
  const n = doc.nodes[id]; if (!n) return; const p = [n.x, n.y], ok = (r) => (r && r.length >= 2 ? r : null);
  for (const f of doc.flows) f.steps.forEach((s, i) => {
    if (s.lift || !Array.isArray(s.path) || s.path.length < 2) return;
    if (s.node == id) s.path = ok(fixEnd(s.path, p));
    const prev = f.steps[i - 1];
    if (prev && prev.node == id && !prev.lift && Array.isArray(s.path)) s.path = ok(fixStart(s.path, p));
  });
  for (const f of doc.flows) f.steps.forEach((s, i) => { if (i && s.path == null && !s.lift) { const e = stepEnd(f, i - 1), m = doc.nodes[s.node]; if (e && m && Math.hypot(e[0] - m.x, e[1] - m.y) > .05) relink(f, i, true); } });
}
function deleteSel() {
  const sel = ed.sel, info = selInfo(); if (!sel || !info) return;
  if (sel.kind === "node") {
    const users = doc.flows.reduce((n, f) => n + f.steps.filter((s) => s.node == sel.id).length, 0);
    if (users) { X.tip(`This stop is used by ${users} step(s): delete those steps first (Steps tab)`); return; }
    commit("delete " + info.title, () => { delete doc.nodes[sel.id]; for (const d of doc.devices) if (d.node == sel.id) delete d.node; });
  } else if (sel.kind === "device") commit("delete " + info.title, () => doc.devices.splice(sel.i, 1), "devices");
  else if (sel.kind === "prop") commit("delete " + info.title, () => { doc.props = doc.props.filter((p) => p.id !== sel.id); }, "props");
  else if (sel.kind === "replica") commit("delete " + info.title, () => { (doc.replica[sel.tag] || (doc.replica[sel.tag] = {})).del = true; }, "replica");
  select(null);
}
function duplicateSel() {
  const sel = ed.sel, o = selObj(); if (!o) return; const off = 3 * M;
  if (sel.kind === "device") { if (o.type === "rfid-auto" && doc.devices.filter((d) => d.type === "rfid-auto").length >= 8) return X.tip("At most 8 auto RFID gates per project"); commit("duplicate " + (o.label || o.type), () => { const c = clone(o); c.x += off; c.y += off; if (c.lane) c.lane = [c.lane[0] + off, c.lane[1] + off]; c.sym = newId(); delete c.node; doc.devices.push(c); }, "devices"); select({ kind: "device", i: doc.devices.length - 1 }); }
  else if (sel.kind === "prop") { const c = clone(o); c.id = uid("prop"); c.x += off; c.y += off; commit("duplicate " + (o.name || o.type), () => doc.props.push(c), "props"); select({ kind: "prop", id: c.id }); }
  else if (sel.kind === "node") { const id = newId(), c = clone(o); c.id = id; c.x += off; c.y += off; c.target = [c.x, c.y]; c.text = (c.text || "Stop") + " copy"; commit("duplicate stop", () => { doc.nodes[id] = c; }); select({ kind: "node", id }); }
  else X.tip("Replica objects can be moved, turned or deleted; add new ones from the Add list");
}

/* ---------- placement tool ---------- */
const ADD = {
  "pc-result": { label: "PC: Prod. Result / GR", dev: { type: "pc", kind: "result", fill: "#7030A0", label: "Prod. Result / GR PC", done: "Done", face: "e", yawDeg: 90 } },
  "pc-mapping": { label: "PC: TO Mapping / GI", dev: { type: "pc", kind: "mapping", fill: "#7030A0", label: "TO Mapping / GI PC", done: "TO mapped", face: "e", yawDeg: 90 } },
  "pc-quality": { label: "PC: Quality", dev: { type: "pc", kind: "quality", fill: "#7030A0", label: "Quality PC", done: "Checked", face: "e", yawDeg: 90 } },
  "rfid-auto": { label: "Auto RFID gate", dev: { type: "rfid-auto", axis: "y", label: "Auto RFID gate" } },
  "rfid-manual": { label: "Handheld scanner", dev: { type: "rfid-manual", side: "w", routeBound: true, label: "Manual RFID scan", done: "RFID scanned" } },
  stop: { label: "Stop point" },
};
for (const [k, v] of Object.entries(PROP_TYPES)) ADD["prop-" + k] = { label: v.name, prop: k };
function startPlace(kind) { ed.drawing = null; ed.placing = { kind, label: ADD[kind].label, at: null, rect: [0, 0, 0, 0], ok: true }; X.tip("Click the floor to place: " + ADD[kind].label + " (Shift keeps the tool, Esc stops)"); emit("tool"); }
function placeRect(kind, x, y) {
  const a = ADD[kind]; if (a.prop) return propRect(Object.assign({ x, y, rot: 0 }, PROP_TYPES[a.prop]));
  if (a.dev) { const d = Object.assign({ x, y, k: DIMS.K }, a.dev); if (d.type === "rfid-manual") { d.lane = [x, y]; d.x = x - 2 * M; } const fp = footprints(d); return fp.reduce((p, q) => [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])], [Infinity, Infinity, -Infinity, -Infinity]); }
  return [x - 3, y - 3, x + 3, y + 3];
}
function rectClash(r, plate) { for (const o of solidsOf(plate).near((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, Math.max(r[2] - r[0], r[3] - r[1]) / 2 + 2)) if (Math.max(o.r[0] - r[2], r[0] - o.r[2], o.r[1] - r[3], r[1] - o.r[3]) < .1) return o; return null; }
function placeAt(h, keep) {
  const kind = ed.placing.kind, a = ADD[kind], x = snapV(h.x), y = snapV(h.y), plate = h.plate;
  if (a.prop) { const p = Object.assign({ id: uid("prop"), type: a.prop, x, y, plate, rot: 0 }, clone(PROP_TYPES[a.prop])); p.name = PROP_TYPES[a.prop].name; commit("add " + p.name, () => doc.props.push(p), "props"); select({ kind: "prop", id: p.id }); }
  else if (a.dev) {
    if (a.dev.type === "rfid-auto" && doc.devices.filter((d) => d.type === "rfid-auto").length >= 8) { X.tip("At most 8 auto RFID gates per project"); ed.placing = null; return; }
    const d = Object.assign({ x, y, plate, k: DIMS.K, sym: newId() }, clone(a.dev));
    if (d.type === "rfid-manual") { d.lane = snapLane([x, y], plate); d.x = d.lane[0] - 2 * M; d.y = d.lane[1]; }
    commit("add " + d.label, () => doc.devices.push(d), "devices"); select({ kind: "device", i: doc.devices.length - 1 });
  } else { const id = newId(); commit("add stop", () => { doc.nodes[id] = { id, x, y, plate, kind: "area", mode: "manual", fill: "#156082", text: "New stop", target: [x, y] }; }); select({ kind: "node", id }); }
  if (!keep) { ed.placing = null; emit("tool"); }
}

/* ---------- path editing ---------- */
// drag one interior vertex; with Ortho on, neighbours follow so every leg stays horizontal or vertical (ends are locked)
function dragVertex(P0, i, q, ortho) {
  const P = P0.map((p) => p.slice()), n = P.length; if (i <= 0 || i >= n - 1) return P;
  if (!ortho) { P[i] = q; return P; }
  const horizPrev = Math.abs(P0[i - 1][1] - P0[i][1]) < 1e-6, horizNext = Math.abs(P0[i + 1][1] - P0[i][1]) < 1e-6;
  P[i] = q.slice(); const ins = [];
  if (i - 1 > 0) { if (horizPrev) P[i - 1][1] = q[1]; else P[i - 1][0] = q[0]; }
  else if (Math.abs(P[0][0] - q[0]) > 1e-6 && Math.abs(P[0][1] - q[1]) > 1e-6) ins.push([i, horizPrev ? [q[0], P[0][1]] : [P[0][0], q[1]]]);
  if (i + 1 < n - 1) { if (horizNext) P[i + 1][1] = q[1]; else P[i + 1][0] = q[0]; }
  else if (Math.abs(P[n - 1][0] - q[0]) > 1e-6 && Math.abs(P[n - 1][1] - q[1]) > 1e-6) ins.push([i + 1, horizNext ? [q[0], P[n - 1][1]] : [P[n - 1][0], q[1]]]);
  for (const [at, p] of ins.sort((a, b) => b[0] - a[0])) P.splice(at, 0, p);
  return P;
}
// drag a whole leg sideways (orthogonal paths): both ends move across, locked path ends get a new corner
function dragSegment(P0, k, q) {
  const P = P0.map((p) => p.slice()), n = P.length, a = P[k - 1], b = P[k], horiz = Math.abs(a[1] - b[1]) < 1e-6;
  const set = (j) => { if (horiz) P[j][1] = q[1]; else P[j][0] = q[0]; };
  const out = [];
  for (let j = 0; j < n; j++) {
    if (j === k - 1) { if (j === 0) { out.push(P[0]); const c = P[0].slice(); horiz ? (c[1] = q[1]) : (c[0] = q[0]); out.push(c); } else { set(j); out.push(P[j]); } }
    else if (j === k) { if (j === n - 1) { const c = P[j].slice(); horiz ? (c[1] = q[1]) : (c[0] = q[0]); out.push(c); out.push(P[j]); } else { set(j); out.push(P[j]); } }
    else out.push(P[j]);
  }
  return out;
}
function insertVertex(f, i, k, q) { commit("add a corner", () => { const s = f.steps[i]; s.path.splice(k, 0, [q[0], q[1]]); }); }
function removeVertex(f, i, k) { const s = f.steps[i]; if (!s || k <= 0 || k >= s.path.length - 1) return; commit("remove a corner", () => { s.path.splice(k, 1); }); }
function autoRoute(fi, i) {
  const f = doc.flows[fi], s = f && f.steps[i]; if (!s || s.lift) return X.tip("Elevator rides have no floor path");
  const a = stepStart(f, i), n = doc.nodes[s.node]; if (!a || !n) return X.tip("The first step has no previous point to route from");
  const plate = n.plate || plateOf(n.x, n.y); if (plateOf(a[0], a[1]) !== plate) return X.tip("The previous point is on another floor: add an elevator ride first");
  const t0 = performance.now(), r = routeBetween(a, [n.x, n.y], plate);
  if (!r) return X.tip("No clear trolley route found between these points");
  commit("auto-route step " + (i + 1), () => { s.path = r; }); X.tip(`Routed in ${(performance.now() - t0).toFixed(0)} ms: ${(r.reduce((L, p, k) => L + (k ? Math.hypot(p[0] - r[k - 1][0], p[1] - r[k - 1][1]) : 0), 0) * PT_M).toFixed(1)} m`);
}
function startDraw(fi, i) {
  const f = doc.flows[fi], s = f && f.steps[i]; if (!s || s.lift) return;
  const a = stepStart(f, i); if (!a) return X.tip("The first step starts where the trolley stands; choose a later step");
  ed.placing = null; ed.drawing = { fi, i, pts: [a], preview: null }; X.tip("Click corners on the floor; click the stop (or press Enter) to finish; Esc cancels; right-click removes the last corner"); emit("tool");
}
function drawPoint(h, e) {
  const d = ed.drawing, last = d.pts[d.pts.length - 1]; let q = [snapV(h.x, e), snapV(h.y, e)];
  if (doc.settings.ortho) q = Math.abs(q[0] - last[0]) >= Math.abs(q[1] - last[1]) ? [q[0], last[1]] : [last[0], q[1]];
  return q;
}
function finishDraw() {
  const d = ed.drawing; if (!d) return; ed.drawing = null; const f = doc.flows[d.fi], s = f.steps[d.i], n = doc.nodes[s.node];
  const last = d.pts[d.pts.length - 1], end = [n.x, n.y];
  const pts = d.pts.concat(Math.hypot(last[0] - end[0], last[1] - end[1]) < 1e-6 ? [] : doc.settings.ortho ? elbow(last, end, Math.abs(end[1] - last[1]) < Math.abs(end[0] - last[0])).slice(1) : [end]);
  commit("draw path of step " + (d.i + 1), () => { s.path = simplify(pts); }); emit("tool");
}
function runChecks() {
  const f = curFlow(); if (!f) return; ed.hits = checkFlow(f); ed.issues = validateFlow(f); emit("checks");
}
onChange((w) => { if (w === "commit") setTimeout(runChecks, 0); });
