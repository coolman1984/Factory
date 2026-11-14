// Material Flow Player V9: the real factory (true AutoCAD dimensions) with every process tab and path of the V8 player,
// both floors and elevator rides, the Factory Engine running in the page (edit waits and speeds -> instant re-timing), and the
// V8 player's look, guided camera, minimap and video takes. Runs from the Control Center (live master data, Save) or as one
// offline HTML file (window.V9_PACK / V9_ASSETS baked by control/v9/build.mjs).
const T = window.THREE, FE = window.FactoryEngine, TM = window.FCTiming, $ = s => document.querySelector(s);
const q = new URLSearchParams(location.search), OFFLINE = !!window.V9_PACK;
const P = (x, y, z = 0) => new T.Vector3(x, z, -y);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const TABS = [["inj1", "INJ 1"], ["inj2", "INJ 2"], ["eps", "EPS"], ["press", "Press"]];
const V = { e: 0, playing: true, speed: 10, mode: "guided", labels: true, models: {}, fps: 0, floor2: "auto", dirty: false, pickables: [], objIndex: {}, hooks: { ready: [], frame: [], path: [], timeline: [] } };
window.V9 = V;

/* ---------- renderer (V8 settings) ---------- */
const canvas = $("#c"), renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1));
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NeutralToneMapping ?? T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
const scene = new T.Scene(); scene.background = new T.Color(0xdfe7f1); scene.fog = new T.Fog(0xdfe7f1, 380, 900);
const camera = new T.PerspectiveCamera(40, 1, 0.3, 3000);
{ const envScene = window.MFLook.environment(T), pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.02).texture; pm.dispose(); }
scene.add(new T.HemisphereLight(0xffffff, 0x2a3550, 0.9));
const sun = new T.DirectionalLight(0xfff2e0, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(3072, 3072);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);
const FACT = new T.Group(); scene.add(FACT);       // everything that rises out of the flat plan (walls, columns, objects, 2nd floors)
const F2 = new T.Group(); FACT.add(F2);            // everything of the 2nd floors (fades while the trolley is below)
const PLANS = new T.Group(); scene.add(PLANS);     // the V8 plan pictures on the floor (the flat plan)
const PATHG = new T.Group(); scene.add(PATHG);     // route, stop markers and labels of the selected path

/* ---------- models ---------- */
const loader = new T.X.GLTFLoader();
const assetUrl = n => (window.V9_ASSETS && window.V9_ASSETS[n]) || `/assets/${n}.glb`;
function model(name) {
  if (!V.models[name]) V.models[name] = new Promise(ok => loader.load(assetUrl(name), g => { const box = new T.Box3().setFromObject(g.scene), parts = [];
    g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() }); }); ok({ scene: g.scene, box, parts }); }, undefined, () => ok(null)));
  return V.models[name];
}
function fit(md, size, pos, yaw, fitH) {
  const b = md.box, s = new T.Vector3(); b.getSize(s); const c = new T.Vector3(); b.getCenter(c);
  const sx = size[0] / s.x, sz = size[1] / s.z, sy = fitH ? size[2] / s.y : Math.min(1.3, Math.max(0.75, Math.sqrt(sx * sz)));
  return new T.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(new T.Matrix4().makeRotationY(yaw * Math.PI / 180)).multiply(new T.Matrix4().makeTranslation(-c.x * sx, -b.min.y * sy, -c.z * sz)).multiply(new T.Matrix4().makeScale(sx, sy, sz));
}
const TILE = 48, tileOf = M => Math.floor(M.elements[12] / TILE) + "," + Math.floor(M.elements[14] / TILE), _sz = new T.Vector3(), _bx = new T.Box3();
V.tiles = [];   // every batch with its tile centre (distance culling of small details, shadow casters)
function instanced(md, mats, parent = scene, ids = null) {
  const groups = new Map(); mats.forEach((M, i) => { const k = tileOf(M); (groups.get(k) || groups.set(k, []).get(k)).push(i); });
  const all = [];
  for (const idx of groups.values()) {
    const ims = [], tm = idx.map(i => mats[i]), tid = ids ? idx.map(i => ids[i]) : null, cx = tm.reduce((a, M) => a + M.elements[12], 0) / tm.length, cz = tm.reduce((a, M) => a + M.elements[14], 0) / tm.length;
    for (const p of md.parts) { const im = new T.InstancedMesh(p.geo, p.mat, tm.length); tm.forEach((M, i) => im.setMatrixAt(i, M.clone().multiply(p.m))); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
      if (!p.geo.boundingBox) p.geo.computeBoundingBox(); _bx.copy(p.geo.boundingBox).applyMatrix4(tm[0].clone().multiply(p.m)).getSize(_sz);
      const big = Math.max(_sz.x, _sz.y, _sz.z), small = big < 0.9; im.castShadow = !small; im.receiveShadow = false;   /* objects cast, floors receive: shadow lookups only on the floor pixels */ im.userData.detail = small ? 1 : big < 3 ? 2 : 0; im.userData.c = [cx, cz]; parent.add(im); ims.push(im); all.push(im); V.tiles.push(im);
      if (tid) { im.userData.ids = tid; im.userData.pm = p.m; V.pickables.push(im); } }
    // object index: id -> its instances, so the Studio can move, turn or hide one object live
    if (tid) tid.forEach((id, i) => { V.objIndex[id] = { md, i, ims }; });
  }
  return all; }
const FITH = new Set(["RACK", "PALLET", "CRANE_BRIDGE", "BOLLARD", "TABLE", "BIN_CART", "SMT_MODULE", "EPS_MACHINE", "LIFT"]);
function placeObject(o) {   // write one object's current pos / yaw / size into its instances (or hide it when deleted)
  const ix = V.objIndex[o.id]; if (!ix) return false; const md = ix.md, M = o.deleted ? new T.Matrix4().makeScale(0, 0, 0) : fit(md, o.size, P(o.pos[0], o.pos[1], o.pos[2] || 0), o.yaw, FITH.has(o.prefab));
  if (ix.mesh) { ix.mesh.matrix.copy(M); ix.mesh.matrixAutoUpdate = false; ix.mesh.visible = !o.deleted; return true; }
  for (const im of ix.ims) { im.setMatrixAt(ix.i, M.clone().multiply(im.userData.pm)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.boundingBox = null; } V.shadowDirty = true; return true; }
async function addObjectMesh(o) {   // a new object placed in the Studio: its own small mesh group (no re-instancing)
  const md = await model(o.asset.split("/").pop().replace(".glb", "")); if (!md) return false; const g = new T.Group();
  for (const p of md.parts) { const m = new T.Mesh(p.geo, p.mat); m.matrixAutoUpdate = false; m.matrix.copy(p.m); m.castShadow = m.receiveShadow = true; m.userData.objId = o.id; g.add(m); V.pickables.push(m); }
  (o.pos[2] > 0.5 ? F2 : FACT).add(g); V.objIndex[o.id] = { md, mesh: g }; placeObject(o); return true; }
function label(text, pos, h, color, group, parent = scene) {
  const c = document.createElement("canvas"), x = c.getContext("2d"), f = 64; x.font = `600 ${f}px Segoe UI, Arial`; const w = Math.ceil(x.measureText(text).width) + 40;
  c.width = w; c.height = f + 30; x.font = `600 ${f}px Segoe UI, Arial`; x.lineWidth = 12; x.strokeStyle = "rgba(10,16,28,.85)"; x.strokeText(text, 20, f); x.fillStyle = color; x.fillText(text, 20, f);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; const s = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: group !== "building", transparent: true }));
  s.scale.set(h * w / c.height, h, 1); s.position.copy(pos); s.userData.label = true; s.visible = V.labels; parent.add(s); return s;
}

/* ---------- the factory (built once) ---------- */
async function buildFactory(pack) {
  let mn = [1e9, 1e9], mx = [-1e9, -1e9]; for (const b of pack.buildings) { mn = [Math.min(mn[0], b.center[0] - b.size[0] / 2), Math.min(mn[1], b.center[1] - b.size[1] / 2)]; mx = [Math.max(mx[0], b.center[0] + b.size[0] / 2), Math.max(mx[1], b.center[1] + b.size[1] / 2)]; }
  V.site = { c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2], s: [mx[0] - mn[0], mx[1] - mn[1]] };
  const g = new T.Mesh(new T.PlaneGeometry(V.site.s[0] + 400, V.site.s[1] + 400), new T.MeshStandardMaterial({ color: 0x5d6168, roughness: 0.95 })); g.rotation.x = -Math.PI / 2; g.position.copy(P(V.site.c[0], V.site.c[1], -0.03)); g.receiveShadow = true; scene.add(g);
  for (const b of pack.buildings) { const fl = window.MFLook.material(T, "concrete"); fl.color.setHex(0xd0d4d2); for (const k of ["map", "roughnessMap", "normalMap"]) { fl[k] = fl[k].clone(); fl[k].repeat.set(b.size[0] / 12, b.size[1] / 12); }
    const f = new T.Mesh(new T.BoxGeometry(b.size[0], 0.1, b.size[1]), fl); f.position.copy(P(b.center[0], b.center[1], -0.05)); f.receiveShadow = true; scene.add(f); label(b.id, P(b.center[0], b.center[1], 24), 3.2, "#fff", "building"); }
  for (const a of pack.areas) { const z = new T.Mesh(new T.PlaneGeometry(a.size[0], a.size[1]), new T.MeshBasicMaterial({ color: a.id.startsWith("INJ1") ? 0x4f86c6 : 0xe0a040, transparent: true, opacity: 0.12, depthWrite: false })); z.rotation.x = -Math.PI / 2; z.position.copy(P(a.center[0], a.center[1], 0.01)); scene.add(z); }
  const box = new T.BoxGeometry(1, 1, 1), W = { exterior_wall: [9, 0.25, 0xcfd2d2], wall: [3.4, 0.18, 0xdadcdb], partition: [2.7, 0.1, 0xe6e7e6], outline: [0.55, 0.32, 0xf2b705] };
  const texLoader = new T.TextureLoader(), planUrl = p => (window.V9_PLANS && window.V9_PLANS[p]) || "/" + p;
  for (const [id, l] of Object.entries(pack.cad)) {
    const parent = l.z > 0 ? F2 : FACT;
    if (l.kind === "plan") { const tab = id.replace(/^PLAN1_/, "").toLowerCase();   // V8 1st-floor plan picture of a tab, registered to the CAD
      for (const s of l.segments) { if (!s.image) continue; const [x0, y0, x1, y1] = s.rect, t = texLoader.load(planUrl(s.image)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
        const pl = new T.Mesh(new T.PlaneGeometry(x1 - x0, y1 - y0), new T.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); pl.rotation.x = -Math.PI / 2; pl.position.copy(P((x0 + x1) / 2, (y0 + y1) / 2, 0.035)); pl.renderOrder = 1; pl.userData.tab = tab; PLANS.add(pl);
        (V.planRect ||= {})[tab] = [x0, y0, x1, y1]; } continue; }
    if (l.kind === "slab") { for (const s of l.segments) { const [x0, y0, x1, y1] = s.rect, w = x1 - x0, d = y1 - y0, c = P((x0 + x1) / 2, (y0 + y1) / 2, l.z);
        if (!s.image) continue;   // the plate frame is not the real floor: only the 2nd-floor drawing is shown
        { const t = texLoader.load(planUrl(s.image)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; const pl = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshStandardMaterial({ map: t, roughness: 0.8, transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })); pl.rotation.x = -Math.PI / 2; pl.position.copy(c).setY(l.z + 0.02); parent.add(pl); } } continue; }
    if (l.kind === "marking") { const pos = []; for (const s of l.segments) pos.push(s[0], l.z + 0.02, -s[1], s[2], l.z + 0.02, -s[3]); const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); parent.add(new T.LineSegments(geo, new T.LineBasicMaterial({ color: id === "ROAD_MARKINGS" ? 0xeeeeee : 0xe8b407 }))); continue; }
    if (l.kind === "column") { const md = await model("column"); if (!md) continue; const s = new T.Vector3(); md.box.getSize(s); instanced(md, l.segments.map(r => new T.Matrix4().makeTranslation(r[0], l.z, -r[1]).multiply(new T.Matrix4().makeScale(r[2] / s.x, l.height / s.y, r[3] / s.z))), FACT); continue; }
    const w = W[l.kind]; if (!w) continue; const hgt = l.z > 0 ? Math.min(l.height, 3) : w[0], y0 = (l.kind === "outline" ? l.height - 0.55 : 0) + l.z;
    const wm = l.kind === "outline" ? window.MFLook.material(T, "paint", { color: new T.Color(w[2]) }) : window.MFLook.material(T, "wall", { color: new T.Color(w[2]) });
    const Ms = l.segments.map(s => { const a = P(s[0], s[1]), b2 = P(s[2], s[3]), d = b2.clone().sub(a), L = Math.max(d.length(), 0.01), M = new T.Matrix4(); M.makeRotationY(-Math.atan2(d.z, d.x)); M.scale(new T.Vector3(L + w[1] * 0.5, hgt, w[1])); M.setPosition(a.clone().add(b2).multiplyScalar(0.5).setY(y0 + hgt / 2)); return M; });
    for (const im of instanced({ parts: [{ geo: box, mat: wm, m: new T.Matrix4() }] }, Ms, parent)) { im.castShadow = l.kind !== "partition"; im.userData.detail = false; }
  }
  const groups = {};
  for (const o of pack.objects) { if (["TROLLEY", "AGV", "OPERATOR"].includes(o.prefab)) continue; const a = o.asset.split("/").pop().replace(".glb", ""); (groups[a] ||= []).push(o); }
  await Promise.all(Object.keys(groups).map(model));
  for (const [a, list] of Object.entries(groups)) { const md = await model(a); if (!md) continue; const lo = [], hi = [], loId = [], hiId = [];
    for (const o of list) { const up = o.pos[2] > 0.5 && o.prefab !== "CRANE_BRIDGE"; (up ? hi : lo).push(fit(md, o.size, P(o.pos[0], o.pos[1], o.pos[2]), o.yaw, FITH.has(o.prefab))); (up ? hiId : loId).push(o.id); }
    if (lo.length) instanced(md, lo, FACT, loId); if (hi.length) instanced(md, hi, F2, hiId); }
  F2.traverse(o => { if (o.material && !o.isSprite) { o.material = [].concat(o.material).map(m => { const c = m.clone(); c.transparent = true; c.userData.base = c.opacity; return c; }); if (o.material.length === 1) o.material = o.material[0]; } });
  // the hero: V8's Blender trolley (rear covers, 1.4x real size so it stays readable), no people; the AGV for AGV legs
  const [tr, agv] = await Promise.all([model("trolley_v8").then(m => m || model("trolley")), model("agv")]);
  V.trolley = actorNative(tr, Math.PI / 2, tr && Math.max(tr.box.max.x - tr.box.min.x, tr.box.max.z - tr.box.min.z) > 1.5 ? 1 / 1.4 : 1); /* real size: V8 drew it 1.4x; the route clearance is for the real 0.8 m wide trolley */ V.agv = actor(agv, [1.4, 0.9, 0.42]);
  const halo = new T.Mesh(new T.RingGeometry(1.45, 1.75, 64), new T.MeshBasicMaterial({ color: 0xc9fbff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; V.trolley.add(halo);
  { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 8, 64, 64, 62); r.addColorStop(0, "rgba(10,14,24,.55)"); r.addColorStop(.6, "rgba(10,14,24,.25)"); r.addColorStop(1, "rgba(10,14,24,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const blob = new T.Mesh(new T.PlaneGeometry(2.6, 3.4).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false })); blob.position.y = 0.03; V.trolley.add(blob); }
}
function actor(md, size) { const g = new T.Group(); if (md) { const m = md.scene.clone(true); m.applyMatrix4(fit(md, size, new T.Vector3(), 0, true)); m.traverse(o => { if (o.isMesh) o.castShadow = false; }); g.add(m); } scene.add(g); return g; }
function actorNative(md, turn = 0, scale = 1) {   // keep the model's own size (V8 trolley), centred on its footprint, standing on the floor
  const g = new T.Group(); if (md) { const m = md.scene.clone(true), b = md.box, c = new T.Vector3(); b.getCenter(c); m.position.set(-c.x, -b.min.y, -c.z); const pivot = new T.Group(); pivot.rotation.y = turn; pivot.scale.setScalar(scale); pivot.add(m); m.traverse(o => { if (o.isMesh) o.castShadow = false; }); g.add(pivot); } scene.add(g); return g; }

/* ---------- the selected path ---------- */
const stopsById = () => Object.fromEntries(V.pack.stops.map(s => [s.id, { position_m: s.pos, name: s.name }]));
function selectPath(id) {
  const p = V.pack.paths.find(x => x.id === id) || V.pack.paths[0]; V.path = p; V.tab = p.tab;
  V.edit = p.data; V.base = V.base && V.base.id === p.id ? V.base : { id: p.id, kpis: null };   // the path record IS the live document (Studio edits it, autosave stores it)
  if (!p.timeline) retime(); else applyTimeline(p.timeline, p.kpis); if (!V.base.kpis) V.base.kpis = { ...V.kpis };
  tabsUI(); V.e = 0; camReset(); if (V.mode === "guided" && V.view !== "3d") { CAM.intro = 0; V.rise = 0; } else V.rise = 1; history.replaceState(null, "", `?path=${encodeURIComponent(p.id)}`);
  for (const f of V.hooks.path) f(p);
}
function retime() {   // the Factory Engine, in this page
  try { const r = TM.timePath(FE.World, V.edit, stopsById()); V.path.timeline = r.timeline; V.path.kpis = r.kpis; applyTimeline(r.timeline, r.kpis); V.engineMsg = `Engine re-timed: ${mmss(r.kpis.trip_s)} · invariants ${r.kpis.invariants ? "BROKEN" : "OK"}`; V.engineErr = null; }
  catch (err) { V.engineErr = "Engine refused: " + err.message; }
  return !V.engineErr;
}
function applyTimeline(tl, k) {
  V.steps = tl.steps.map((s, i) => ({ ...s, title: V.edit.steps[i]?.title || s.title, caption: (V.edit.captions || [])[i] || "" })); V.total = tl.total_s; V.kpis = k || {};
  while (PATHG.children.length) PATHG.remove(PATHG.children[0]);
  buildRoute(); const seen = new Set(); V.steps.forEach((s, i) => { if (seen.has(s.stop)) return; seen.add(s.stop); const st = V.pack.stops.find(x => x.id === s.stop); if (st) stopMarker(st, i); });
  stepsUI();
  V.miniBox = null; V.wg = null; if (V.e > V.total) V.e = V.total;
  for (const f of V.hooks.timeline) f();
}
function stopMarker(s, i) {   // a ring on the floor; the numbered step chips are drawn by the overlay (Studio)
  const ring = new T.Mesh(new T.RingGeometry(0.75, 0.95, 40), new T.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.95, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.copy(P(s.pos[0], s.pos[1], (s.pos[2] || 0) + 0.04)); PATHG.add(ring);
  if (s.symbol === "scan") for (const d of [-1.3, 1.3]) { const r = new T.Mesh(new T.PlaneGeometry(2.4, 0.1), new T.MeshBasicMaterial({ color: 0xe5363d, transparent: true, opacity: 0.95, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.copy(P(s.pos[0], s.pos[1] + d, (s.pos[2] || 0) + 0.06)); r.renderOrder = 4; PATHG.add(r); }   // V8: the handheld-scan point
}
function buildRoute() {
  const pts = [], cum = [], start = []; let acc = 0;
  V.steps.forEach((s, i) => { start.push(acc); if (!i) return; for (const q2 of s.pts) { const v = new T.Vector3(q2[0], q2[1], q2[2] || 0); if (pts.length) { const d = Math.hypot(v.x - pts.at(-1).x, v.y - pts.at(-1).y); if (d < 0.01 && Math.abs(v.z - pts.at(-1).z) < 0.01) continue; acc += d; } pts.push(v); cum.push(acc); } });
  V.route = pts; V.cum = cum; V.stepStart = start;
  { let a = [1e9, 1e9], b = [-1e9, -1e9]; for (const p of pts) { a = [Math.min(a[0], p.x), Math.min(a[1], p.y)]; b = [Math.max(b[0], p.x), Math.max(b[1], p.y)]; }
    V.routeC = P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); V.routeSpan = Math.max(60, b[0] - a[0], b[1] - a[1]); }
  const pos = [], dist = [], side = [], w = 0.62;
  for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1]; if (Math.abs(a.z - b.z) > 0.5) { const tube = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, Math.abs(b.z - a.z), 16, 1, true), new T.MeshBasicMaterial({ color: new T.Color(V.edit.color || "#a78bfa"), transparent: true, opacity: 0.35, depthWrite: false })); tube.position.copy(P(a.x, a.y, (a.z + b.z) / 2)); PATHG.add(tube); continue; }
    const n = new T.Vector2(b.x - a.x, b.y - a.y).normalize(), o = new T.Vector2(-n.y, n.x).multiplyScalar(w);
    const quad = [[a.x - o.x, a.y - o.y, a.z, cum[k], 0], [a.x + o.x, a.y + o.y, a.z, cum[k], 1], [b.x + o.x, b.y + o.y, b.z, cum[k + 1], 1], [b.x - o.x, b.y - o.y, b.z, cum[k + 1], 0]];
    for (const j of [0, 1, 2, 0, 2, 3]) { pos.push(quad[j][0], quad[j][2] + 0.05, -quad[j][1]); dist.push(quad[j][3]); side.push(quad[j][4]); } }
  const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); geo.setAttribute("dist", new T.Float32BufferAttribute(dist, 1)); geo.setAttribute("side", new T.Float32BufferAttribute(side, 1));
  V.routeMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, uniforms: { progress: { value: 0 }, time: { value: 0 }, col: { value: new T.Color(V.edit.color || "#a78bfa") } },
    vertexShader: "attribute float dist; attribute float side; varying float vD; varying float vS; void main(){ vD = dist; vS = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float progress; uniform float time; uniform vec3 col; varying float vD; varying float vS; void main(){ float across = abs(vS-0.5)*2.0; float edge = smoothstep(1.0,0.82,across); float done = step(vD, progress); float ahead = (1.0-done)*step(vD, progress+12.0); float ch = fract(vD*0.55 - across*0.42 - time*0.6*(1.0-done)); float chev = smoothstep(0.0,0.06,ch)*(1.0-smoothstep(0.28,0.36,ch)); vec3 teal = vec3(0.05,0.47,0.52); vec3 pale = vec3(0.55,0.85,0.88); vec3 orange = vec3(1.0,0.62,0.22); vec3 c = done*mix(teal, vec3(0.62,0.97,0.95), chev*0.8) + ahead*mix(orange, vec3(1.0,0.93,0.8), chev*0.85) + (1.0-done-ahead)*mix(pale, vec3(1.0), chev*0.5); float a = edge*(done*0.86 + ahead*0.82 + (1.0-done-ahead)*(0.28+0.22*chev)); gl_FragColor = vec4(c, clamp(a,0.0,1.0)); }" });
  { const rib = new T.Mesh(geo, V.routeMat); rib.renderOrder = 3; PATHG.add(rib); }   // over the flat-plan picture
  // direction arrows painted on the floor every 4 m (V8 flow lines): which way the trolley goes, readable from any camera
  const tri = new T.ShapeGeometry(new T.Shape([new T.Vector2(0.55, 0), new T.Vector2(-0.35, 0.42), new T.Vector2(-0.15, 0), new T.Vector2(-0.35, -0.42)])).rotateX(-Math.PI / 2), marks = [];
  for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 0.5 || Math.abs(a.z - b.z) > 0.5) continue; const yaw = Math.atan2(b.y - a.y, b.x - a.x);
    for (let s = (4 - (cum[k] % 4)) % 4 + 1; s < L - 0.6; s += 4) marks.push([a.x + (b.x - a.x) * s / L, a.y + (b.y - a.y) * s / L, a.z, yaw]); }
  if (marks.length && V.floorArrows) { const im = new T.InstancedMesh(tri, new T.MeshBasicMaterial({ color: new T.Color(V.edit.color || "#a78bfa").lerp(new T.Color(1, 1, 1), 0.35), transparent: true, opacity: 0.9, depthWrite: false }), marks.length), M = new T.Matrix4();
    marks.forEach((m, i) => { M.makeRotationY(m[3]); M.setPosition(m[0], m[2] + 0.06, -m[1]); im.setMatrixAt(i, M); }); im.renderOrder = 2; PATHG.add(im); }
}

/* ---------- engine timeline -> pose ---------- */
const plen = p => { let d = 0; for (let k = 1; k < p.length; k++) d += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return d; };
function at(p, s) { let acc = 0; for (let k = 1; k < p.length; k++) { const L = Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); if (acc + L >= s && L > 0) { const t = (s - acc) / L; return [p[k - 1][0] + (p[k][0] - p[k - 1][0]) * t, p[k - 1][1] + (p[k][1] - p[k - 1][1]) * t, (p[k - 1][2] || 0) + ((p[k][2] || 0) - (p[k - 1][2] || 0)) * t]; } acc += L; } const l = p.at(-1); return [l[0], l[1], l[2] || 0]; }
function ease(u, L) { const r = Math.min(0.4, Math.max(0.05, 1.6 / Math.max(L, 0.1))), v = 1 / (1 - r); u = Math.min(1, Math.max(0, u)); if (u < r) return 0.5 * v * u * u / r; if (u > 1 - r) { const q2 = 1 - u; return 1 - 0.5 * v * q2 * q2 / r; } return 0.5 * v * r + v * (u - r); }
function pose(e) {
  const S = V.steps, p0 = S[0].pts[0], out = { p: [p0[0], p0[1], p0[2] || 0], dir: V.dir || [1, 0], mode: S[0].mode, moving: false, step: 0, dist: 0, u: 0, phase: "wait", lift: false };
  for (let i = 1; i < S.length; i++) { const s = S[i]; if (e < s.t0) { out.step = i - 1; break; } const L = plen(s.pts);
    if (e <= s.tm) { const u = (e - s.t0) / Math.max(s.tm - s.t0, 0.001);
      if (s.lift) { const a = s.pts[0], b = s.pts.at(-1), k = u * u * (3 - 2 * u); return { ...out, p: [a[0], a[1], (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * k], moving: true, step: i, dist: V.stepStart[i], u, phase: "travel", lift: true, mode: s.mode }; }
      const d = L * ease(u, L), a = at(s.pts, Math.min(d + 0.9, L)), b = at(s.pts, Math.max(d - 0.9, 0));
      return { p: at(s.pts, d), dir: Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.05 ? [a[0] - b[0], a[1] - b[1]] : out.dir, mode: s.mode, moving: true, step: i, dist: V.stepStart[i] + d, u, phase: "travel", lift: false }; }
    const l = s.pts.at(-1); out.p = [l[0], l[1], l[2] || 0]; if (s.pts.length > 1 && !s.lift) out.dir = [l[0] - s.pts.at(-2)[0], l[1] - s.pts.at(-2)[1]]; out.mode = s.mode; out.step = i; out.dist = V.stepStart[i] + L; out.u = (e - s.tm) / Math.max(s.t1 - s.tm, 0.001); }
  return out;
}

/* ---------- camera: the V7 director (Material-Flow V7.0-V7.7.1 guided camera, ported to true metres) ----------
   One calm azimuth per long stretch of aisle (the clearest angle near the house angle), a high oblique tilt, a distance that
   frames the stretch, a sight check against the CAD walls and tall objects that holds a clear shot (the trolley is never
   hidden), and exact critically damped springs with velocity feed-forward for the eye and the look target. A path opens
   with the V7 intro: top-down over the route, rising to an oblique view, then landing on the first trolley shot. */
const orbit = { tgt: new T.Vector3(), r: 60, th: -0.7, ph: 0.9 }; let drag = null;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), sm01 = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }, lerp = (a, b, u) => a + (b - a) * u;
const CALM = { base: -0.55, pol: 0.94, D: 34, long: 12, intro: 8.5 };
function planFit() {   // the camera distance that shows the whole flat plan of this tab (V8 2D view)
  const r = V.planRect?.[V.tab], b = r || [V.routeC.x - V.routeSpan / 2, -V.routeC.z - V.routeSpan / 2, V.routeC.x + V.routeSpan / 2, -V.routeC.z + V.routeSpan / 2];
  const w = b[2] - b[0], h = b[3] - b[1], k = 2 * Math.tan(camera.fov * Math.PI / 360);
  return { c: P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, 0), r: Math.max(h, w / camera.aspect) * 1.06 / k }; }
const OFFS = [0, .26, -.26, .52, -.52, .79, -.79, 1.05, -1.05, 1.57, -1.57, Math.PI], POLS = [.94, .72, .5, 1.15, 1.3, 1.45, .3, .12, .001];
const CAM = { eye: new T.Vector3(), tgt: new T.Vector3(), ev: new T.Vector3(), tv: new T.Vector3(), ff: new T.Vector3(), last: null, az: CALM.base, pol: CALM.pol, ready: false, init: false,
  choice: { az: 0, pol: CALM.pol, forced: false, at: 0 }, chosen: false, clock: 0, prefSince: -1, aisle: new Map(), dist: new Map(), intro: -1, chaseAz: null, chasePol: 1.2, blockedFor: 0, stats: { rescued: 0, forced: 0 } };
V.cam = CAM;
function camReset() { CAM.ready = false; CAM.chosen = false; CAM.prefSince = -1; CAM.aisle.clear(); CAM.dist.clear(); CAM.chaseAz = null; CAM.last = null; CAM.init = false; }
function setMode(m) {
  if (CAM.init && ["free", "orbit", "overview", "plan"].includes(m)) { const d = CAM.eye.clone().sub(CAM.tgt), r = Math.max(0.5, d.length()); orbit.tgt.copy(CAM.tgt); orbit.r = r; orbit.th = Math.atan2(d.x, d.z); orbit.ph = Math.acos(Math.min(1, Math.max(-1, d.y / r))); }
  if (m !== "guided") CAM.intro = -1; if (m !== V.mode) { CAM.ready = false; CAM.chosen = false; CAM.chaseAz = null; }
  V.mode = m; document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
  if (m === "plan") { const f = planFit(); orbit.tgt.copy(f.c); orbit.r = f.r; orbit.ph = 0.001; orbit.th = 0; }
  if (m === "overview") { orbit.tgt.copy(P(V.site.c[0], V.site.c[1])); orbit.r = Math.max(...V.site.s) * 1.25; orbit.ph = 0.82; orbit.th = -0.75; } if (m === "free") orbit.ph = Math.max(orbit.ph, 0.3); }
function wallGrid(floorZ) { V.wg ||= {}; const up = floorZ > 0.5, key = up ? "2F" : "1F"; if (V.wg[key]) return V.wg[key]; const g = new Map(), H = { exterior_wall: 9, wall: 3.4, partition: 2.7 };
  const put = sg => { for (let x = Math.floor(Math.min(sg[0], sg[2]) / 5); x <= Math.floor(Math.max(sg[0], sg[2]) / 5); x++) for (let y = Math.floor(Math.min(sg[1], sg[3]) / 5); y <= Math.floor(Math.max(sg[1], sg[3]) / 5); y++) { const k = x + "," + y; (g.get(k) || g.set(k, []).get(k)).push(sg); } };
  for (const l of Object.values(V.pack.cad)) if (H[l.kind] && (l.z > 0.5) === up) for (const s of l.segments) put([...s, up ? Math.min(H[l.kind], 3) : H[l.kind]]);
  // tall objects (racks, machines, cells) block a sight line too: their footprint edges at full height; the elevator the trolley rides is open
  for (const o of V.pack.objects) { if (!o.size || (o.pos[2] > 0.5) !== up || ["LIFT", "CRANE_BRIDGE", "TROLLEY", "AGV", "OPERATOR"].includes(o.prefab) || (o.size[2] || 0) < 1.6) continue;
    const c = Math.cos((o.yaw || 0) * Math.PI / 180), s = Math.sin((o.yaw || 0) * Math.PI / 180), hx = o.size[0] / 2, hy = o.size[1] / 2, k = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([u, v]) => [o.pos[0] + u * c - v * s, o.pos[1] + u * s + v * c]);
    for (let i = 0; i < 4; i++) put([...k[i], ...k[(i + 1) % 4], o.size[2]]); }
  return V.wg[key] = g; }
function blockedHeight(a, b, hs, hc, floorZ = 0) {
  let need = hc; const seen = new Set(), g = wallGrid(floorZ);
  for (let x = Math.floor(Math.min(a[0], b[0]) / 5); x <= Math.floor(Math.max(a[0], b[0]) / 5); x++) for (let y = Math.floor(Math.min(a[1], b[1]) / 5); y <= Math.floor(Math.max(a[1], b[1]) / 5); y++) for (const s of g.get(x + "," + y) || []) {
    if (seen.has(s)) continue; seen.add(s); const d = (b[0] - a[0]) * (s[3] - s[1]) - (b[1] - a[1]) * (s[2] - s[0]); if (Math.abs(d) < 1e-9) continue;
    const u = ((s[0] - a[0]) * (s[3] - s[1]) - (s[1] - a[1]) * (s[2] - s[0])) / d, v = ((s[0] - a[0]) * (b[1] - a[1]) - (s[1] - a[1]) * (b[0] - a[0])) / d;
    if (u > 0.04 && u <= 1 && v >= 0 && v <= 1) need = Math.max(need, hs + (s[4] + 0.6 - hs) / u); }
  return need;
}
const eyeAt = (p, d, az, pol, out = new T.Vector3()) => out.set(p.x + d * Math.sin(pol) * Math.sin(az), p.y + d * Math.cos(pol), p.z + d * Math.sin(pol) * Math.cos(az));
const floorOf = y => (y > 4 ? 6 : 0);
function sees(L, E, fz) { const hs = L.y - fz, hc = E.y - fz; return blockedHeight([L.x, -L.z], [E.x, -E.z], hs, hc, fz) <= hc + 1e-6; }   // world target L seen from world eye E
function segAt(s, along) { let acc = 0; for (let k = 1; k < s.pts.length; k++) { const L = Math.hypot(s.pts[k][0] - s.pts[k - 1][0], s.pts[k][1] - s.pts[k - 1][1]); if (acc + L >= along) return k - 1; acc += L; } return Math.max(0, s.pts.length - 2); }
const segLen = (P2, k) => P2[k + 1] ? Math.hypot(P2[k + 1][0] - P2[k][0], P2[k + 1][1] - P2[k][1]) : 0;
function calmSeg(i, seg) {   // a short piece of a route borrows the angle of the nearest long stretch (corners never turn the camera)
  const P2 = V.steps[i].pts; if (segLen(P2, seg) >= CALM.long) return seg;
  for (let q = seg - 1; q >= 0; q--) if (segLen(P2, q) >= CALM.long) return q; for (let q = seg + 1; q < P2.length - 1; q++) if (segLen(P2, q) >= CALM.long) return q; return seg; }
function stepView(ps) {   // [step index, calm segment] of the stretch the camera frames now
  let i = ps.step; if (!V.steps[i] || V.steps[i].pts.length < 2 || V.steps[i].lift) { const n = V.steps[i + 1]; if (ps.phase === "wait" && n && n.pts.length > 1 && !n.lift && i === 0) return [i + 1, calmSeg(i + 1, 0)]; return null; }
  return [i, calmSeg(i, segAt(V.steps[i], ps.dist - V.stepStart[i]))]; }
function frameDist(sv) {   // distance that frames the stretch (V7: 1.35 x its length, between 0.85 and 1.8 x the house distance)
  if (!sv) return CALM.D; const key = sv.join(":"); if (CAM.dist.has(key)) return CAM.dist.get(key);
  const d = Math.min(CALM.D * 1.8, Math.max(CALM.D * 0.85, segLen(V.steps[sv[0]].pts, sv[1]) * 1.35)); CAM.dist.set(key, d); return d; }
function aisleAz(sv, d) {   // the clearest of 16 angles over the stretch, kept close to the house angle; cached per stretch
  if (!sv) return CAM.ready ? CAM.az : CALM.base; const key = sv.join(":"); if (CAM.aisle.has(key)) return CAM.aisle.get(key);
  const P2 = V.steps[sv[0]].pts, a = P2[sv[1]], b = P2[sv[1] + 1] || a, fz = floorOf(a[2] || 0), pts = [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]], reach = d * Math.sin(CALM.pol), hc = d * Math.cos(CALM.pol) + 1.2;
  let best = [Infinity, CALM.base];
  for (let k = 0; k < 16; k++) { const az = -Math.PI + k * Math.PI / 8; let sc = 0;
    for (const p of pts) { const e = [p[0] + reach * Math.sin(az), p[1] - reach * Math.cos(az)], need = blockedHeight(p, e, 1.2, hc, fz); if (need > hc) sc += 1 + Math.min(1, (need - hc) / hc); }
    sc = sc / 3 + Math.abs(wrap(az - CALM.base)) * 0.06; if (sc < best[0]) best = [sc, az]; }
  CAM.aisle.set(key, best[1]); return best[1]; }
// V5/V7 sight: an angle that SEES the trolley now and where it will be, held while clear (no hunting between angles)
function choose(p, fut, d, pref, cur, fz, dt) {
  const ok = (az, pol) => { const e = eyeAt(p, d, az, pol); return sees(p, e, fz) && sees(fut, e, fz); }, now = (az, pol) => sees(p, eyeAt(p, d, az, pol), fz);
  CAM.clock += dt; const prefOk = ok(pref, CALM.pol), c = CAM.choice; if (prefOk) { if (CAM.prefSince < 0) CAM.prefSince = CAM.clock; } else CAM.prefSince = -1;
  if (CAM.chosen && c.forced && ok(c.az, c.pol) && (CAM.clock - c.at < 1.5 || !prefOk || CAM.clock - CAM.prefSince < 1.2)) return c;
  if (CAM.chosen && c.forced && !prefOk && CAM.clock - c.at < 0.3) return c;   // a full search at most ~3 times a second (the rescue covers the gap)
  let az = pref, pol = CALM.pol; const forced = !prefOk;
  if (forced) { let found = false; for (const t of [ok, now]) { for (const q of POLS) { for (const o of OFFS) if (t(cur + o, q)) { az = cur + o; pol = q; found = true; break; } if (found) break; } if (found) break; }
    if (!found) { az = cur; pol = 0.001; } CAM.stats.forced++; }
  Object.assign(c, { az, pol, forced, at: CAM.clock }); CAM.chosen = true; return c; }
function transitionPol(p, fut, d, az, pol, fz) {   // a safe destination does not imply a safe orbit to it: the tilt on the way must see too
  const ok = q => { const e = eyeAt(p, d, az, q); return sees(p, e, fz) && sees(fut, e, fz); };
  if (ok(pol)) return pol; for (const q of POLS) if (ok(q)) return q; for (const q of POLS) if (sees(p, eyeAt(p, d, az, q), fz)) return q; return 0.001; }
// exact critically damped spring in the frame of a goal moving at velocity gv (stable for any frame time and playback speed)
function springFF(x, v, goal, gv, w, dt) { const decay = Math.exp(-w * dt); for (const k of ["x", "y", "z"]) { const e0 = x[k] - (goal[k] - gv[k] * dt), ev0 = v[k] - gv[k], j = ev0 + w * e0; x[k] = goal[k] + (e0 + j * dt) * decay; v[k] = gv[k] + (ev0 - w * j * dt) * decay; } }
const WANT = { t: new T.Vector3(), e: new T.Vector3() }, ZERO = new T.Vector3(), FUT = new T.Vector3();
function camFrame(dt, ps, tp) { const t0 = performance.now(); camStep(dt, ps, tp); const ms = performance.now() - t0; CAM.stats.ms = CAM.stats.ms ? CAM.stats.ms * 0.95 + ms * 0.05 : ms; CAM.stats.maxMs = Math.max(CAM.stats.maxMs || 0, ms); }
function camStep(dt, ps, tp) {
  if (V.mode === "director" && V.directorPose) {   // V7 director: the camera is a pure function of engine time (same at every speed and seek)
    const p = V.directorPose(V.e);
    if (p) { CAM.tgt.set(p.x, p.y, p.z); eyeAt(CAM.tgt, p.dist, p.az, p.pol, CAM.eye); CAM.ev.set(0, 0, 0); CAM.tv.set(0, 0, 0); CAM.init = true; CAM.last = null;
      if (Math.abs(camera.fov - p.fov) > 1e-3) { camera.fov = p.fov; camera.updateProjectionMatrix(); } camera.position.copy(CAM.eye); camera.up.set(0, 1, 0); camera.lookAt(CAM.tgt); return; }
  }
  if (V.mode !== "director" && Math.abs(camera.fov - (V.fov || 40)) > 1e-3) { camera.fov += ((V.fov || 40) - camera.fov) * Math.min(1, dt * 6); if (Math.abs(camera.fov - (V.fov || 40)) < 0.01) camera.fov = V.fov || 40; camera.updateProjectionMatrix(); }
  const L = tp.clone(); L.y += 1.2; const fz = floorOf(ps.p[2]), wantT = WANT.t, wantE = WANT.e; let omega = 6, gv = ZERO, cut = false;
  // trolley velocity (feed-forward) and seek / jump detection (a jump is a cut, not a swoop across the factory)
  if (CAM.last) { const v = L.clone().sub(CAM.last).multiplyScalar(1 / Math.max(dt, 1e-3)); if (v.length() * dt > 4) { cut = true; CAM.ready = false; CAM.chosen = false; } else CAM.ff.lerp(v, 1 - Math.exp(-dt / 0.12)); }
  CAM.last = L.clone(); if (cut) CAM.ff.set(0, 0, 0);
  const m = V.mode, trip = ["guided", "follow", "chase"].includes(m);
  if (m === "guided" && CAM.intro >= 0) {   // V7 intro: over the whole route top-down, rise to an oblique view, land on the first shot
    // V8 "From flat plan to factory": the flat plan from above (2.5 s), the replica rises while the camera tilts (3 s), then lands on the trolley
    CAM.intro += dt; const e1 = sm01((CAM.intro - 2.5) / 3), u = sm01((CAM.intro - (CALM.intro - 2.5)) / 2.5), sv = stepView(ps), d = frameDist(sv), az1 = aisleAz(sv, d), pf = planFit(); V.rise = e1;
    wantT.copy(pf.c).lerp(L, u); const dd = lerp(pf.r * lerp(1, 0.85, e1), d, u), az = lerp(-0.5 * e1, az1, u), pol = lerp(lerp(0.001, 1, e1), CALM.pol, u);
    eyeAt(wantT, dd, az, pol, wantE); omega = 9; if (CAM.intro >= CALM.intro) { CAM.intro = -1; CAM.az = az1; CAM.pol = CALM.pol; CAM.ready = true; }
  } else if (m === "guided" || m === "follow") {
    const sv = m === "guided" ? stepView(ps) : null, d = m === "guided" ? (ps.lift ? CALM.D * 0.9 : frameDist(sv)) : 26, pref = m === "guided" ? aisleAz(sv, d) : CALM.base;
    if (ps.moving || ps.phase === "travel") { const f = pose(Math.min(V.total, V.e + Math.min(1.2 * V.speed, 12))); FUT.copy(P(f.p[0], f.p[1], f.p[2] + 1.2)); if (Math.abs(FUT.y - L.y) > 1) FUT.copy(L); } else FUT.copy(L);
    const vis = choose(L, FUT, d, pref, CAM.ready ? CAM.az : pref, fz, dt), goalPol = transitionPol(L, FUT, d, CAM.ready ? CAM.az : vis.az, vis.pol, fz), rate = vis.forced ? 3.2 : 1.3;
    if (!CAM.ready) { CAM.az = vis.az; CAM.pol = goalPol; CAM.ready = true; }
    else { const cap = (vis.forced ? 1.2 : 0.6) * dt; CAM.az += Math.max(-cap, Math.min(cap, wrap(vis.az - CAM.az) * (1 - Math.exp(-dt * rate)))); CAM.pol += (goalPol - CAM.pol) * (1 - Math.exp(-dt * (goalPol < CAM.pol ? 8 : 1.3))); }
    wantT.copy(L); eyeAt(L, d, CAM.az, CAM.pol, wantE); gv = CAM.ff; omega = (m === "guided" ? 2.7 : 4.2) * (CAM.blockedFor > 0 ? 2.6 : 1);
  } else if (m === "chase") {   // behind the trolley, turning at most 0.6 rad/s; rises only as much as a wall needs, settles back slowly
    const d = 14, az = ps.lift ? (CAM.chaseAz ?? CALM.base) : Math.atan2(-V.dirS.x, V.dirS.y); if (CAM.chaseAz == null) CAM.chaseAz = az;
    CAM.chaseAz += Math.max(-0.6 * dt, Math.min(0.6 * dt, wrap(az - CAM.chaseAz)));
    let pol = 0.2; for (let q = 1.3; q >= 0.39; q -= 0.15) if (sees(L, eyeAt(L, d, CAM.chaseAz, q), fz)) { pol = q; break; }
    CAM.chasePol = pol < CAM.chasePol ? pol : Math.min(pol, CAM.chasePol + 0.6 * dt);
    wantT.copy(L); eyeAt(L, d, CAM.chaseAz, CAM.chasePol, wantE); gv = CAM.ff; omega = 8;
  } else {   // free, overview, 2D plan: the orbit is the goal; the springs make every change a smooth move
    if (m === "orbit") orbit.tgt.lerp(L, 1 - Math.exp(-dt * 8));   // V7 Orbit: turn around the trolley while it moves
    wantT.copy(orbit.tgt); eyeAt(orbit.tgt, orbit.r, orbit.th, orbit.ph, wantE); omega = m === "free" || m === "orbit" ? (V.freeOmega || 12) : 3.5;
  }
  if (!CAM.init || cut) { CAM.eye.copy(wantE); CAM.tgt.copy(wantT); CAM.ev.set(0, 0, 0); CAM.tv.set(0, 0, 0); CAM.init = true; }
  springFF(CAM.eye, CAM.ev, wantE, gv, omega, dt); springFF(CAM.tgt, CAM.tv, wantT, gv, omega, dt);
  // guard the rendered eye: blocked for more than a moment -> the smallest tilt that sees the trolley (V7 rescue)
  if (trip && CAM.intro < 0) { if (sees(L, CAM.eye, fz)) CAM.blockedFor = 0; else { CAM.blockedFor += dt; if (CAM.blockedFor > 0.3) { const d0 = CAM.eye.clone().sub(CAM.tgt), r = d0.length(), az = Math.atan2(d0.x, d0.z), pol = Math.acos(Math.min(1, Math.max(-1, d0.y / r)));
    for (let k = 1; k <= 18; k++) { const q = pol - k * 0.05; if (q < 0.01) break; const E = eyeAt(CAM.tgt, r, az, q); if (sees(L, E, fz)) { CAM.eye.copy(E); CAM.ev.set(0, 0, 0); CAM.pol = Math.min(CAM.pol, q); CAM.blockedFor = 0; CAM.stats.rescued++; break; } } } } }
  camera.position.copy(CAM.eye); camera.up.set(0, 1, 0); camera.lookAt(CAM.tgt);
}
canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, b: e.button }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointerup", () => drag = null);
canvas.addEventListener("pointermove", e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.b === 2 || e.shiftKey || V.mode === "plan") { if (!["free", "overview"].includes(V.mode)) setMode("free"); const f = orbit.r * 0.0016, c = Math.cos(orbit.th), s = Math.sin(orbit.th); orbit.tgt.x += (-dx * c - dy * s) * f; orbit.tgt.z += (dx * s - dy * c) * f; }
  else { if (["guided", "follow", "chase", "director"].includes(V.mode)) setMode("free"); orbit.th -= dx * 0.006; if (V.mode !== "plan") orbit.ph = Math.min(1.5, Math.max(0.08, orbit.ph - dy * 0.005)); } });
canvas.addEventListener("wheel", e => { e.preventDefault(); if (["guided", "follow", "chase"].includes(V.mode)) setMode("free"); orbit.r = Math.min(900, Math.max(4, orbit.r * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); }, { passive: false });
canvas.addEventListener("contextmenu", e => e.preventDefault());
function fly(id) { const b = V.pack.buildings.find(x => x.id === id); if (!b) return; setMode("free"); orbit.tgt.copy(P(b.center[0], b.center[1])); orbit.r = Math.max(b.size[0], b.size[1]) * 1.1; orbit.ph = 0.85; }

/* ---------- UI: tabs, steps, editor (engine in the page), minimap, takes ---------- */
function tabsUI() { V.ui?.tabs?.(); }     // the V8 shell (v9-shell.js) draws the top bar, steps list, card and timeline
function stepsUI() { V.ui?.steps?.(); }
function tip(msg, ms = 3500) { if (V.ui?.tip) return V.ui.tip(msg, ms); }
function seekStep(i) { const s = V.steps[i]; if (!s) return; V.e = i ? s.t0 : 0; if (!["director", "free", "plan", "orbit"].includes(V.mode)) setMode("guided"); CAM.intro = -1; V.rise = 1; camReset(); }
function playIntro() { V.e = 0; V.playing = true; V.view = "auto"; setMode("guided"); camReset(); CAM.intro = 0; V.rise = 0; }
function drawMini(ps) {
  const cv = $("#minic"); if (!cv || !cv.offsetParent) return; const x = cv.getContext("2d"), W = cv.width, H = cv.height; if (!V.miniBox) { let mn = [1e9, 1e9], mx = [-1e9, -1e9]; for (const p of V.route) { mn = [Math.min(mn[0], p.x), Math.min(mn[1], p.y)]; mx = [Math.max(mx[0], p.x), Math.max(mx[1], p.y)]; } V.miniBox = [mn[0] - 14, mn[1] - 14, mx[0] + 14, mx[1] + 14]; }
  const [x0, y0, x1, y1] = V.miniBox, sc = Math.min((W - 16) / (x1 - x0), (H - 16) / (y1 - y0)), ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2, tx = p => [ox + (p[0] - x0) * sc, H - oy - (p[1] - y0) * sc], up = ps.p[2] > 0.5;
  x.clearRect(0, 0, W, H); x.lineWidth = 1; x.strokeStyle = "rgba(220,230,245,.55)"; x.beginPath();
  for (const l of Object.values(V.pack.cad)) if (["exterior_wall", "wall", "partition"].includes(l.kind) && (l.z > 0.5) === up) for (const s of l.segments) { if (Math.max(s[0], s[2]) < x0 || Math.min(s[0], s[2]) > x1 || Math.max(s[1], s[3]) < y0 || Math.min(s[1], s[3]) > y1) continue; const a = tx(s), b = tx([s[2], s[3]]); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }
  x.stroke(); x.lineWidth = 3; x.strokeStyle = "rgba(200,155,255,.35)"; x.beginPath(); V.route.forEach((p, i) => { const q2 = tx([p.x, p.y]); i ? x.lineTo(q2[0], q2[1]) : x.moveTo(q2[0], q2[1]); }); x.stroke();
  const tp2 = tx(ps.p); x.fillStyle = "rgba(200,155,255,.35)"; x.beginPath(); x.arc(tp2[0], tp2[1], 9 + 3 * Math.sin(performance.now() / 200), 0, 7); x.fill(); x.fillStyle = "#fff"; x.beginPath(); x.arc(tp2[0], tp2[1], 4.5, 0, 7); x.fill();
  x.fillStyle = "rgba(255,255,255,.75)"; x.font = "11px Segoe UI"; x.fillText(`2D PLAN · ${up ? "2nd" : "1st"} floor · CAD`, 8, 14);
}
async function record() {
  if (V.rec) { V.rec.stop(); return; } if (!window.MediaRecorder) return;
  const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(t => MediaRecorder.isTypeSupported(t)), chunks = [], rec = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 12e6 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = async () => { V.rec = null; V.ui?.rec?.(false); const blob = new Blob(chunks, { type: "video/webm" }), name = `v9-${V.path.id}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.webm`;
    if (OFFLINE) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); return; }
    const r = await fetch("/api/films/upload?name=" + encodeURIComponent(name), { method: "POST", body: blob }).then(x => x.json()).catch(() => ({ ok: false })); tip(r.ok ? `Take saved: ${name}` : "Take not saved"); };
  const dir = (V.edit.director?.keys || []).length; V.rec = rec; V.e = 0; V.playing = true; setMode(dir ? "director" : "guided"); camReset(); CAM.intro = dir ? -1 : 0; V.recEnd = V.total + 2; rec.start(1000); V.ui?.rec?.(true);
}

/* ---------- quality: high / medium / low, Auto steps down when the laptop cannot hold 60 fps ---------- */
const QUALITY = { high: { pr: 1, far: 35, shadow: true }, medium: { pr: 0.85, far: 50, shadow: true }, low: { pr: 0.7, far: 35, shadow: false } };
const gpuName = (() => { try { const gl = renderer.getContext(), x = gl.getExtension("WEBGL_debug_renderer_info"); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : ""; } catch (e) { return ""; } })();
const integrated = /Intel|Iris|UHD|HD Graphics|Radeon\(TM\) Graphics|Mali|Adreno|Apple/i.test(gpuName), QKEY = "v9-quality-level";
// Auto starts where this browser last held 60 fps (remembered), else Medium on integrated graphics (Iris Xe: measured 60 fps), High on others
V.quality = q.get("quality") || "auto"; V.qLevel = V.quality === "auto" ? ((() => { try { return localStorage.getItem(QKEY); } catch (e) { return null; } })() || (integrated ? "medium" : "high")) : V.quality; V.gpu = gpuName;
function applyQuality(level) { const Q = QUALITY[level]; V.qLevel = level; renderer.setPixelRatio(Q.pr); V.detailFar = Q.far; if (renderer.shadowMap.enabled !== Q.shadow) { renderer.shadowMap.enabled = Q.shadow; scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); } V.shadowDirty = true; resize(); V.ui?.quality?.(level); }
function setQuality(qv) { V.quality = qv; V.qSlow = 0; if (qv === "auto") { try { localStorage.removeItem(QKEY); } catch (e) {} } applyQuality(qv === "auto" ? (integrated ? "medium" : "high") : qv); }
function quality(dt) {
  if (V.quality !== "auto" || !V.fps || (CAM.intro >= 0 && V.mode === "guided") || document.hidden) return;
  V.qSlow = V.fps < 55 ? (V.qSlow || 0) + dt : 0;   // 4 s in a row under 55 fps: one step down (never back up by itself, so it does not flicker)
  if (V.qSlow > 4) { V.qSlow = 0; if (V.qLevel === "high") applyQuality("medium"); else if (V.qLevel === "medium") applyQuality("low"); try { localStorage.setItem(QKEY, V.qLevel); } catch (e) {} }
}

/* ---------- loop ---------- */
let last = performance.now(), frames = 0, fpsT = last;
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (V.ready) {
    if (V.playing && !(V.mode === "guided" && CAM.intro >= 0)) { V.e += dt * V.speed; if (V.rec && V.e > V.recEnd) V.rec.stop(); if (V.e > V.total + 4) V.e = 0; }
    const ps = pose(Math.min(V.e, V.total)), d = new T.Vector2(...ps.dir).normalize(), prev = V.dirS || d; V.dirS = prev.clone().lerp(d, Math.min(1, dt * 6)).normalize(); V.dir = [V.dirS.x, V.dirS.y];
    const yaw = Math.atan2(V.dirS.y, V.dirS.x), agvMode = ps.mode === "agv", tp = P(ps.p[0], ps.p[1], ps.p[2] + (agvMode ? 0.36 : 0));
    V.trolley.position.copy(tp); V.trolley.rotation.y = yaw; V.ps = ps;
    V.agv.visible = agvMode; if (agvMode) { V.agv.position.copy(P(ps.p[0], ps.p[1], ps.p[2])); V.agv.rotation.y = yaw; }
    V.routeMat.uniforms.progress.value = ps.dist; V.routeMat.uniforms.time.value = now / 1000;
    // flat plan (V8): 2D view = flat; Auto view during the opening = flat, then the replica rises; 3D = standing
    const intro = V.mode === "guided" && CAM.intro >= 0, flatT = V.view === "2d" ? 1 : intro ? 1 - (V.rise || 0) : 0;
    V.flat = intro ? flatT : (V.flat ?? flatT) + (flatT - (V.flat ?? flatT)) * Math.min(1, dt * 4); FACT.scale.y = Math.max(0.012, 1 - V.flat);
    for (const pl of PLANS.children) { const o = pl.userData.tab === V.tab ? Math.max(V.flat, V.planFloor ? 0.45 : 0) : V.planFloor ? 0.3 : 0; pl.material.opacity = o; pl.visible = o > 0.01; }
    const nearLift = !!(V.steps[ps.step]?.lift || V.steps[ps.step + 1]?.lift), want2F = V.flat > 0.5 ? 0 : V.floor2 === "show" ? 1 : V.floor2 === "hide" ? 0 : ps.p[2] > 0.5 ? 1 : nearLift ? 0.28 : 0;   // auto: the 2nd floor on the 2nd floor, see-through around an elevator ride, else not drawn (no overdraw)
    F2.visible = want2F > 0.01; if (V.f2op !== want2F) { V.f2op = want2F; F2.traverse(o => { for (const m of [].concat(o.material || [])) if (m.userData && "base" in m.userData) { m.opacity = m.userData.base * want2F; m.depthWrite = want2F > 0.9; m.transparent = want2F < 0.99 || m.userData.base < 0.99; } }); }
    camFrame(dt, ps, tp);
    for (const f of V.hooks.frame) f(dt, ps, now);
    V.ui?.frame?.(ps, intro); drawMini(ps);
  }
  // one shadow map over the whole process area of the tab: drawn once, again only when the tab changes, something is edited,
  // or in 4 steps while the factory rises (no redraws while the camera moves = no hitches)
  const sh = V.sh ||= { tab: null, fy: -1 };
  if (V.ready && V.routeC && (V.shadowDirty || sh.tab !== V.tab || Math.abs(FACT.scale.y - sh.fy) > 0.24 || (FACT.scale.y === 1 && sh.fy !== 1))) {
    const r = V.planRect?.[V.tab] || [V.routeC.x - V.routeSpan / 2, -V.routeC.z - V.routeSpan / 2, V.routeC.x + V.routeSpan / 2, -V.routeC.z + V.routeSpan / 2], c = P((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 0), half = Math.max(r[2] - r[0], r[3] - r[1]) / 2 + 12;
    sh.tab = V.tab; sh.fy = FACT.scale.y; V.shadowDirty = false; Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 600 }); sun.shadow.camera.updateProjectionMatrix();
    sun.position.copy(c).add(new T.Vector3(-90, 160, 70)); sun.target.position.copy(c); sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); renderer.shadowMap.needsUpdate = true; }
  // small details (bins, cartons, bands, bumpers) are drawn only near the camera
  if ((V.fc = (V.fc || 0) + 1) % 10 === 0) { const ex = camera.position.x, ez = camera.position.z, far = V.detailFar || 70; for (const im of V.tiles) if (im.userData.detail) { const d = Math.hypot(im.userData.c[0] - ex, im.userData.c[1] - ez) - TILE * 0.7; im.visible = d < (im.userData.detail === 1 ? far : far * 2.6); } }
  FACT.visible = V.flat < 0.97 || !!V.studioOpen;   // the pure flat plan is the picture: the standing factory is not drawn at all
  quality(dt);
  renderer.render(scene, camera);
  frames++; if (now - fpsT > 1000) { V.fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
(async () => {
  try {
    // let later scripts (the Studio) register their hooks first: wait until the whole page is parsed
    await new Promise(r => document.readyState === "complete" ? setTimeout(r, 0) : addEventListener("DOMContentLoaded", () => r(), { once: true }));
    V.pack = window.V9_PACK || await (await fetch("/api/scene3d")).json(); if (V.pack.error) throw new Error(V.pack.error);
    V.api = { setQuality, FE, record, fly, seekStep, playIntro, planFit, FACT, PLANS, T, scene, camera, renderer, canvas, P, F2, PATHG, CAM, orbit, selectPath, retime, applyTimeline, setMode, camReset, pose, stopsById, placeObject, addObjectMesh, model, label, tip, tabsUI, stepsUI, esc, mmss, eyeAt, FITH, fit, OFFLINE };
    for (const f of V.hooks.ready) await f();   // the Studio restores autosaved edits here, before the first path is shown
    await buildFactory(V.pack); V.view = q.get("view") || "auto"; selectPath(q.get("path") || V.pack.paths[0].id); setMode(q.get("mode") || (V.view === "2d" ? "plan" : "guided")); V.ready = true; $("#loading").remove();
    FACT.traverse(o => { if (o !== FACT && o !== F2 && o.isMesh) { o.updateMatrix(); o.matrixAutoUpdate = false; } }); applyQuality(V.qLevel);
    try { const t0 = performance.now(); FACT.visible = true; F2.visible = true; F2.traverse(o => { o.visible = true; }); for (const im of V.tiles) im.visible = true; if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); V.compileMs = Math.round(performance.now() - t0); } catch (e) { console.warn("shader warm-up skipped", e); }
    for (const f of V.hooks.built || []) f();
  } catch (err) { $("#loading").textContent = "Could not build V9: " + err.message; console.error(err); }
})();
requestAnimationFrame(frame);
