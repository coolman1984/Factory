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
const V = { e: 0, playing: true, speed: 10, mode: "guided", labels: true, models: {}, fps: 0, floor2: "auto", dirty: false };
window.V9 = V;

/* ---------- renderer (V8 settings) ---------- */
const canvas = $("#c"), renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1));
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NeutralToneMapping ?? T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
const scene = new T.Scene(); scene.background = new T.Color(0xdfe7f1); scene.fog = new T.Fog(0xdfe7f1, 380, 900);
const camera = new T.PerspectiveCamera(40, 1, 0.3, 3000);
{ const envScene = window.MFLook.environment(T), pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.02).texture; pm.dispose(); }
scene.add(new T.HemisphereLight(0xffffff, 0x2a3550, 0.9));
const sun = new T.DirectionalLight(0xfff2e0, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);
const F2 = new T.Group(); scene.add(F2);           // everything of the 2nd floors (fades while the trolley is below)
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
function instanced(md, mats, parent = scene) { for (const p of md.parts) { const im = new T.InstancedMesh(p.geo, p.mat, mats.length); mats.forEach((M, i) => im.setMatrixAt(i, M.clone().multiply(p.m))); im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; parent.add(im); } }
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
    const parent = l.z > 0 ? F2 : scene;
    if (l.kind === "slab") { for (const s of l.segments) { const [x0, y0, x1, y1] = s.rect, w = x1 - x0, d = y1 - y0, c = P((x0 + x1) / 2, (y0 + y1) / 2, l.z);
        if (!s.image) continue;   // the plate frame is not the real floor: only the 2nd-floor drawing is shown
        { const t = texLoader.load(planUrl(s.image)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; const pl = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshStandardMaterial({ map: t, roughness: 0.8, transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })); pl.rotation.x = -Math.PI / 2; pl.position.copy(c).setY(l.z + 0.02); parent.add(pl); } } continue; }
    if (l.kind === "marking") { const pos = []; for (const s of l.segments) pos.push(s[0], l.z + 0.02, -s[1], s[2], l.z + 0.02, -s[3]); const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); parent.add(new T.LineSegments(geo, new T.LineBasicMaterial({ color: id === "ROAD_MARKINGS" ? 0xeeeeee : 0xe8b407 }))); continue; }
    if (l.kind === "column") { const md = await model("column"); if (!md) continue; const s = new T.Vector3(); md.box.getSize(s); instanced(md, l.segments.map(r => new T.Matrix4().makeTranslation(r[0], l.z, -r[1]).multiply(new T.Matrix4().makeScale(r[2] / s.x, l.height / s.y, r[3] / s.z)))); continue; }
    const w = W[l.kind]; if (!w) continue; const hgt = l.z > 0 ? Math.min(l.height, 3) : w[0], y0 = (l.kind === "outline" ? l.height - 0.55 : 0) + l.z;
    const wm = l.kind === "outline" ? window.MFLook.material(T, "paint", { color: new T.Color(w[2]) }) : window.MFLook.material(T, "wall", { color: new T.Color(w[2]) });
    const im = new T.InstancedMesh(box, wm, l.segments.length), M = new T.Matrix4();
    l.segments.forEach((s, i) => { const a = P(s[0], s[1]), b2 = P(s[2], s[3]), d = b2.clone().sub(a), L = Math.max(d.length(), 0.01); M.makeRotationY(-Math.atan2(d.z, d.x)); M.scale(new T.Vector3(L + w[1] * 0.5, hgt, w[1])); M.setPosition(a.clone().add(b2).multiplyScalar(0.5).setY(y0 + hgt / 2)); im.setMatrixAt(i, M); });
    im.castShadow = l.kind !== "partition"; im.receiveShadow = true; parent.add(im);
  }
  const groups = {}, fitH = new Set(["RACK", "PALLET", "CRANE_BRIDGE", "BOLLARD", "TABLE", "BIN_CART", "SMT_MODULE", "EPS_MACHINE", "LIFT"]);
  for (const o of pack.objects) { if (["TROLLEY", "AGV", "OPERATOR"].includes(o.prefab)) continue; const a = o.asset.split("/").pop().replace(".glb", ""); (groups[a] ||= []).push(o); }
  await Promise.all(Object.keys(groups).map(model));
  for (const [a, list] of Object.entries(groups)) { const md = await model(a); if (!md) continue; const lo = [], hi = [];
    for (const o of list) (o.pos[2] > 0.5 && o.prefab !== "CRANE_BRIDGE" ? hi : lo).push(fit(md, o.size, P(o.pos[0], o.pos[1], o.pos[2]), o.yaw, fitH.has(o.prefab)));
    if (lo.length) instanced(md, lo); if (hi.length) instanced(md, hi, F2); }
  F2.traverse(o => { if (o.material && !o.isSprite) { o.material = [].concat(o.material).map(m => { const c = m.clone(); c.transparent = true; c.userData.base = c.opacity; return c; }); if (o.material.length === 1) o.material = o.material[0]; } });
  const [tr, op, agv] = await Promise.all(["trolley", "operator", "agv"].map(model));
  V.trolley = actor(tr, [1.2, 0.8, 1.15]); V.operator = actor(op, [0.65, 0.56, 1.75]); V.agv = actor(agv, [1.4, 0.9, 0.42]);
  const halo = new T.Mesh(new T.RingGeometry(1.25, 1.5, 48), new T.MeshBasicMaterial({ color: 0xc89bff, transparent: true, opacity: 0.85, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; V.trolley.add(halo);
}
function actor(md, size) { const g = new T.Group(); if (md) { const m = md.scene.clone(true); m.applyMatrix4(fit(md, size, new T.Vector3(), 0, true)); m.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.add(m); } scene.add(g); return g; }

/* ---------- the selected path ---------- */
const stopsById = () => Object.fromEntries(V.pack.stops.map(s => [s.id, { position_m: s.pos, name: s.name }]));
function selectPath(id) {
  const p = V.pack.paths.find(x => x.id === id) || V.pack.paths[0]; V.path = p; V.tab = p.tab; V.edit = JSON.parse(JSON.stringify(p.data)); V.dirty = false;
  if (!p.timeline) retime(); else applyTimeline(p.timeline, p.kpis);
  tabsUI(); editorUI(); V.e = 0; V.guided = null; history.replaceState(null, "", `?path=${encodeURIComponent(p.id)}`);
}
function retime() {   // the Factory Engine, in this page
  try { const r = TM.timePath(FE.World, V.edit, stopsById()); applyTimeline(r.timeline, r.kpis); $("#ed-msg").textContent = `Engine re-timed: ${mmss(r.kpis.trip_s)} · invariants ${r.kpis.invariants ? "BROKEN" : "OK"}`; }
  catch (err) { $("#ed-msg").textContent = "Engine refused: " + err.message; }
}
function applyTimeline(tl, k) {
  V.steps = tl.steps.map((s, i) => ({ ...s, title: V.edit.steps[i]?.title || s.title, caption: (V.edit.captions || [])[i] || "" })); V.total = tl.total_s; V.kpis = k || {};
  while (PATHG.children.length) PATHG.remove(PATHG.children[0]);
  buildRoute(); const seen = new Set(); V.steps.forEach((s, i) => { if (seen.has(s.stop)) return; seen.add(s.stop); const st = V.pack.stops.find(x => x.id === s.stop); if (st) stopMarker(st, i); });
  $("#scrub").max = V.total; $("#title").textContent = V.edit.name; stepsUI();
  $("#kpi").textContent = `Engine: ${mmss(V.total)} trip · ${k?.distance_m ?? "-"} m (push ${k?.push_m ?? "-"} m, AGV ${k?.agv_m ?? "-"} m) · ${k?.lift_rides || 0} elevator ride(s) · ${(V.path.data.clearance?.objects_on_route || []).length} clash(es) with the CAD`;
  V.miniBox = null; V.wg = null;
}
function stopMarker(s, i) {
  const ring = new T.Mesh(new T.RingGeometry(0.75, 0.95, 40), new T.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.95, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.copy(P(s.pos[0], s.pos[1], (s.pos[2] || 0) + 0.04)); PATHG.add(ring);
  label(`${i + 1}  ${V.steps[i].title}`, P(s.pos[0], s.pos[1], (s.pos[2] || 0) + 3.2), 0.75, "#ffffff", "stop", PATHG);
}
function buildRoute() {
  const pts = [], cum = [], start = []; let acc = 0;
  V.steps.forEach((s, i) => { start.push(acc); if (!i) return; for (const q2 of s.pts) { const v = new T.Vector3(q2[0], q2[1], q2[2] || 0); if (pts.length) { const d = Math.hypot(v.x - pts.at(-1).x, v.y - pts.at(-1).y); if (d < 0.01 && Math.abs(v.z - pts.at(-1).z) < 0.01) continue; acc += d; } pts.push(v); cum.push(acc); } });
  V.route = pts; V.cum = cum; V.stepStart = start;
  const pos = [], dist = [], side = [], w = 0.45;
  for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1]; if (Math.abs(a.z - b.z) > 0.5) { const tube = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, Math.abs(b.z - a.z), 16, 1, true), new T.MeshBasicMaterial({ color: new T.Color(V.edit.color || "#a78bfa"), transparent: true, opacity: 0.35, depthWrite: false })); tube.position.copy(P(a.x, a.y, (a.z + b.z) / 2)); PATHG.add(tube); continue; }
    const n = new T.Vector2(b.x - a.x, b.y - a.y).normalize(), o = new T.Vector2(-n.y, n.x).multiplyScalar(w);
    const quad = [[a.x - o.x, a.y - o.y, a.z, cum[k], 0], [a.x + o.x, a.y + o.y, a.z, cum[k], 1], [b.x + o.x, b.y + o.y, b.z, cum[k + 1], 1], [b.x - o.x, b.y - o.y, b.z, cum[k + 1], 0]];
    for (const j of [0, 1, 2, 0, 2, 3]) { pos.push(quad[j][0], quad[j][2] + 0.03, -quad[j][1]); dist.push(quad[j][3]); side.push(quad[j][4]); } }
  const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); geo.setAttribute("dist", new T.Float32BufferAttribute(dist, 1)); geo.setAttribute("side", new T.Float32BufferAttribute(side, 1));
  V.routeMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { progress: { value: 0 }, time: { value: 0 }, col: { value: new T.Color(V.edit.color || "#a78bfa") } },
    vertexShader: "attribute float dist; attribute float side; varying float vD; varying float vS; void main(){ vD = dist; vS = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float progress; uniform float time; uniform vec3 col; varying float vD; varying float vS; void main(){ float across = abs(vS-0.5)*2.0; float edge = smoothstep(1.0,0.6,across); float done = step(vD, progress); float chev = step(0.6, fract(vD*0.7 - time*0.9 - across*0.25)); float head = exp(-abs(vD-progress)*0.9); float a = edge*(done*0.75 + (1.0-done)*(0.12+0.25*chev)) + head*edge*0.6; gl_FragColor = vec4(mix(col, vec3(1.0), head*0.45), clamp(a,0.0,1.0)); }" });
  PATHG.add(new T.Mesh(geo, V.routeMat));
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

/* ---------- camera (V8 guided + follow, chase, overview, plan, free) ---------- */
const orbit = { tgt: new T.Vector3(), r: 60, th: -0.7, ph: 0.9 }; let drag = null;
function setMode(m) { V.mode = m; document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
  if (m === "plan") { orbit.ph = 0.02; orbit.r = 70; } if (m === "follow") { orbit.r = 26; orbit.ph = 0.95; } if (m === "chase") { orbit.r = 11; orbit.ph = 1.2; } if (m === "guided") { orbit.r = 30; V.guided = null; }
  if (m === "overview") { orbit.tgt.copy(P(V.site.c[0], V.site.c[1])); orbit.r = Math.max(...V.site.s) * 1.25; orbit.ph = 0.82; orbit.th = -0.75; } if (m === "free") orbit.ph = Math.max(orbit.ph, 0.6); }
function wallGrid(floorZ) { V.wg ||= {}; const key = floorZ > 0.5 ? "2F" : "1F"; if (V.wg[key]) return V.wg[key]; const g = new Map(), H = { exterior_wall: 9, wall: 3.4, partition: 2.7 };
  for (const l of Object.values(V.pack.cad)) if (H[l.kind] && (l.z > 0.5) === (key === "2F")) for (const s of l.segments) { const sg = [...s, H[l.kind]]; for (let x = Math.floor(Math.min(s[0], s[2]) / 5); x <= Math.floor(Math.max(s[0], s[2]) / 5); x++) for (let y = Math.floor(Math.min(s[1], s[3]) / 5); y <= Math.floor(Math.max(s[1], s[3]) / 5); y++) { const k = x + "," + y; (g.get(k) || g.set(k, []).get(k)).push(sg); } }
  return V.wg[key] = g; }
function blockedHeight(a, b, hs, hc, floorZ = 0) {
  let need = hc; const seen = new Set(), g = wallGrid(floorZ);
  for (let x = Math.floor(Math.min(a[0], b[0]) / 5); x <= Math.floor(Math.max(a[0], b[0]) / 5); x++) for (let y = Math.floor(Math.min(a[1], b[1]) / 5); y <= Math.floor(Math.max(a[1], b[1]) / 5); y++) for (const s of g.get(x + "," + y) || []) {
    if (seen.has(s)) continue; seen.add(s); const d = (b[0] - a[0]) * (s[3] - s[1]) - (b[1] - a[1]) * (s[2] - s[0]); if (Math.abs(d) < 1e-9) continue;
    const u = ((s[0] - a[0]) * (s[3] - s[1]) - (s[1] - a[1]) * (s[2] - s[0])) / d, v = ((s[0] - a[0]) * (b[1] - a[1]) - (s[1] - a[1]) * (b[0] - a[0])) / d;
    if (u > 0.04 && u <= 1 && v >= 0 && v <= 1) need = Math.max(need, hs + (s[4] + 0.6 - hs) / u); }
  return need;
}
function guidedGoal(ps) {
  const key = ps.step + ":" + ps.phase; if (V.guided && V.guided.key === key) return V.guided;
  const s = V.steps[ps.step], pts = s.pts.length > 1 && !s.lift ? s.pts : V.steps[Math.min(ps.step + 1, V.steps.length - 1)].pts, a = pts[0], b = pts.at(-1), main = Math.atan2(b[1] - a[1], b[0] - a[0]) || 0, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let best = null; for (const off of [Math.PI / 2, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 4, -Math.PI / 4, Math.PI]) { const az = main + off, R = 24, ph = 0.95, h = R * Math.cos(ph), c = [mid[0] + Math.cos(az) * R * Math.sin(ph), mid[1] + Math.sin(az) * R * Math.sin(ph)], need = blockedHeight(mid, c, 1, h, ps.p[2]); const score = need - h; if (!best || score < best.score) best = { az, score, h: need }; if (score <= 0) break; }
  return V.guided = { key, th: -best.az + Math.PI / 2, ph: Math.max(0.35, Math.acos(Math.min(1, best.h / 24))) };
}
canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, b: e.button }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointerup", () => drag = null);
canvas.addEventListener("pointermove", e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.b === 2 || e.shiftKey) { if (!["free", "overview"].includes(V.mode)) setMode("free"); const f = orbit.r * 0.0016, c = Math.cos(orbit.th), s = Math.sin(orbit.th); orbit.tgt.x += (-dx * c - dy * s) * f; orbit.tgt.z += (dx * s - dy * c) * f; }
  else { if (["guided", "follow", "chase"].includes(V.mode)) setMode("free"); orbit.th -= dx * 0.006; if (V.mode !== "plan") orbit.ph = Math.min(1.5, Math.max(0.08, orbit.ph - dy * 0.005)); } });
canvas.addEventListener("wheel", e => { e.preventDefault(); orbit.r = Math.min(900, Math.max(4, orbit.r * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); }, { passive: false });
canvas.addEventListener("contextmenu", e => e.preventDefault());
function fly(id) { const b = V.pack.buildings.find(x => x.id === id); if (!b) return; setMode("free"); orbit.tgt.copy(P(b.center[0], b.center[1])); orbit.r = Math.max(b.size[0], b.size[1]) * 1.1; orbit.ph = 0.85; }

/* ---------- UI: tabs, steps, editor (engine in the page), minimap, takes ---------- */
function tabsUI() {
  $("#tabs").innerHTML = TABS.map(([id, name]) => `<button data-tab="${id}" class="${V.tab === id ? "on" : ""}">${name}</button>`).join("") + `<span class="sep"></span>` +
    V.pack.paths.filter(p => p.tab === V.tab).map(p => `<button data-path="${esc(p.id)}" class="${V.path.id === p.id ? "on" : ""}" title="${esc(p.data.name)}">${esc(p.data.name.split(" · ")[0] || p.id)} · ${esc((p.data.name.split(" · ")[1] || p.data.name).slice(0, 34))}</button>`).join("");
}
function stepsUI() { $("#steps").innerHTML = V.steps.map((s, i) => `<button data-step="${i}"><b>${i + 1}</b> ${esc(s.title)}${s.lift ? " ⇅" : ""}</button>`).join(""); }
function editorUI() {
  const e = V.edit, n = (k, v, step = 0.1) => `<label>${k}<input type="number" step="${step}" min="0" data-ed="${k}" value="${v}"></label>`;
  $("#ed").innerHTML = `<h4>Path settings · engine</h4><div class="row">${n("push_speed_mps", e.push_speed_mps ?? 1)}${n("agv_speed_mps", e.agv_speed_mps ?? 1.2)}${n("lift_s", e.lift_s ?? 60, 1)}</div>
<h4>Wait at each stop (s)</h4>${e.steps.map((s, i) => `<label class="w"><span>${i + 1}. ${esc(s.title || s.stop)}${s.lift ? " ⇅" : ""}</span><input type="number" step="1" min="0" data-wait="${i}" value="${s.wait_s}"></label>`).join("")}
<div class="row"><button id="ed-save">${OFFLINE ? "Download edits" : "Save to master data"}</button><button id="ed-reset">Reset</button></div><div id="ed-msg" class="muted">Edit a value: the Factory Engine in this page re-times the trip at once.</div>`;
}
document.addEventListener("input", e => { const el = e.target; if (el.dataset.ed) { V.edit[el.dataset.ed] = +el.value; } else if (el.dataset.wait) { V.edit.steps[+el.dataset.wait].wait_s = +el.value; } else return; V.dirty = true; retime(); });
async function save() {
  const set = { steps: V.edit.steps, push_speed_mps: V.edit.push_speed_mps, agv_speed_mps: V.edit.agv_speed_mps, lift_s: V.edit.lift_s };
  if (OFFLINE) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ path: V.path.id, set }, null, 2)], { type: "application/json" })); a.download = `${V.path.id}-edits.json`; a.click(); return; }
  const r = await fetch("/api/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor: "v9", type: "record.update", payload: { type: "path", id: V.path.id, set, label: `V9: edit ${V.path.id}` } }) }).then(x => x.json());
  if (!r.ok) { $("#ed-msg").textContent = "Not saved: " + (r.reason || r.code); return; }
  const run = await fetch("/api/path-run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: V.path.id }) }).then(x => x.json());
  V.path.data = JSON.parse(JSON.stringify(V.edit)); V.dirty = false; $("#ed-msg").textContent = `Saved (revision ${r.revision}); engine run ${run.id} stored in the database.`;
}
document.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.mode) setMode(b.dataset.mode); if (b.dataset.fly) fly(b.dataset.fly);
  if (b.dataset.tab) { const p = V.pack.paths.find(x => x.tab === b.dataset.tab); if (p) selectPath(p.id); }
  if (b.dataset.path) selectPath(b.dataset.path);
  if (b.dataset.step) { const s = V.steps[+b.dataset.step]; V.e = +b.dataset.step ? s.t0 : 0; setMode("guided"); }
  if (b.id === "play") V.playing = !V.playing; if (b.id === "rec") record(); if (b.id === "ed-save") save(); if (b.id === "ed-reset") { V.edit = JSON.parse(JSON.stringify(V.path.data)); editorUI(); retime(); }
  if (b.id === "edit") $("#ed").classList.toggle("open");
  if (b.id === "lab") { V.labels = !V.labels; scene.traverse(o => { if (o.userData.label) o.visible = V.labels; }); }
  if (b.id === "f2") { V.floor2 = { auto: "show", show: "hide", hide: "auto" }[V.floor2]; b.textContent = "2F: " + V.floor2; }
  if (b.dataset.speed) { V.speed = +b.dataset.speed; document.querySelectorAll("[data-speed]").forEach(x => x.classList.toggle("on", x === b)); } });
$("#scrub").addEventListener("input", e => { V.e = +e.target.value; });
addEventListener("keydown", e => { if (e.target.tagName === "INPUT") return; if (e.key === " ") { V.playing = !V.playing; e.preventDefault(); } const m = { g: "guided", f: "follow", c: "chase", v: "overview", p: "plan", o: "free" }[e.key]; if (m) setMode(m); if (e.key === "r") record(); if (e.key === "e") $("#ed").classList.toggle("open"); });
function drawMini(ps) {
  const cv = $("#mini"), x = cv.getContext("2d"), W = cv.width, H = cv.height; if (!V.miniBox) { let mn = [1e9, 1e9], mx = [-1e9, -1e9]; for (const p of V.route) { mn = [Math.min(mn[0], p.x), Math.min(mn[1], p.y)]; mx = [Math.max(mx[0], p.x), Math.max(mx[1], p.y)]; } V.miniBox = [mn[0] - 14, mn[1] - 14, mx[0] + 14, mx[1] + 14]; }
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
  rec.onstop = async () => { V.rec = null; $("#rec").classList.remove("on"); $("#rec").textContent = "● Record"; const blob = new Blob(chunks, { type: "video/webm" }), name = `v9-${V.path.id}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.webm`;
    if (OFFLINE) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); return; }
    const r = await fetch("/api/films/upload?name=" + encodeURIComponent(name), { method: "POST", body: blob }).then(x => x.json()).catch(() => ({ ok: false })); $("#ed-msg").textContent = r.ok ? `Take saved: ${name}` : "Take not saved"; };
  V.rec = rec; V.e = 0; V.playing = true; setMode("guided"); rec.start(1000); $("#rec").classList.add("on"); $("#rec").textContent = "■ Stop"; V.recEnd = V.total + 2;
}

/* ---------- loop ---------- */
let last = performance.now(), frames = 0, fpsT = last;
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (V.ready) {
    if (V.playing) { V.e += dt * V.speed; if (V.rec && V.e > V.recEnd) V.rec.stop(); if (V.e > V.total + 4) V.e = 0; }
    const ps = pose(Math.min(V.e, V.total)), d = new T.Vector2(...ps.dir).normalize(), prev = V.dirS || d; V.dirS = prev.clone().lerp(d, Math.min(1, dt * 6)).normalize(); V.dir = [V.dirS.x, V.dirS.y];
    const yaw = Math.atan2(V.dirS.y, V.dirS.x), agvMode = ps.mode === "agv", tp = P(ps.p[0], ps.p[1], ps.p[2] + (agvMode ? 0.36 : 0));
    V.trolley.position.copy(tp); V.trolley.rotation.y = yaw;
    if (!agvMode) { const back = [ps.p[0] - V.dirS.x * 1.15, ps.p[1] - V.dirS.y * 1.15]; V.operator.position.copy(P(back[0], back[1], ps.p[2] + (ps.moving && !ps.lift ? Math.abs(Math.sin(ps.dist * 2.6)) * 0.035 : 0))); V.operator.rotation.y = yaw; }
    V.agv.visible = agvMode; if (agvMode) { V.agv.position.copy(P(ps.p[0], ps.p[1], ps.p[2])); V.agv.rotation.y = yaw; }
    V.routeMat.uniforms.progress.value = ps.dist; V.routeMat.uniforms.time.value = now / 1000;
    const want2F = V.floor2 === "show" ? 1 : V.floor2 === "hide" ? 0 : ps.p[2] > 0.5 ? 1 : 0.28;   // see through the 2nd floor while the trolley is below
    F2.visible = want2F > 0.01; if (V.f2op !== want2F) { V.f2op = want2F; F2.traverse(o => { for (const m of [].concat(o.material || [])) if (m.userData && "base" in m.userData) { m.opacity = m.userData.base * want2F; m.depthWrite = want2F > 0.9; } }); }
    if (!["free", "overview"].includes(V.mode)) orbit.tgt.lerp(tp, V.mode === "plan" ? 1 : Math.min(1, dt * 3));
    const wrap = a2 => Math.atan2(Math.sin(a2), Math.cos(a2));
    if (V.mode === "follow" || V.mode === "chase") { orbit.th += wrap(-yaw - Math.PI / 2 - orbit.th) * Math.min(1, dt * (V.mode === "chase" ? 1.5 : 0.6)); const cx = orbit.tgt.x + orbit.r * Math.sin(orbit.ph) * Math.sin(orbit.th), cz = orbit.tgt.z + orbit.r * Math.sin(orbit.ph) * Math.cos(orbit.th), need = blockedHeight(ps.p, [cx, -cz], 1, orbit.r * Math.cos(orbit.ph), ps.p[2]);
      orbit.ph += ((need > orbit.r * Math.cos(orbit.ph) + 0.2 ? Math.acos(Math.min(1, need / orbit.r)) : (V.mode === "chase" ? 1.2 : 0.95)) - orbit.ph) * Math.min(1, dt * 2); }
    if (V.mode === "guided") { const gg = guidedGoal(ps); orbit.th += wrap(gg.th - orbit.th) * Math.min(1, dt * 0.9); orbit.ph += (gg.ph - orbit.ph) * Math.min(1, dt * 0.9); orbit.r += (30 - orbit.r) * Math.min(1, dt); }
    const s = V.steps[ps.step]; $("#cap-n").textContent = `STEP ${ps.step + 1} / ${V.steps.length}  ·  ${ps.phase === "travel" ? (ps.lift ? "ELEVATOR " + (s.lift || "") : (s.mode === "agv" ? "AGV" : "PUSHED BY HAND") + " · " + (+s.dist).toFixed(1) + " m") : "WAIT"}  ·  ${ps.p[2] > 0.5 ? "2ND FLOOR" : "1ST FLOOR"}`;
    $("#cap-t").textContent = s.title; $("#cap-x").textContent = s.caption || ""; $("#clock").textContent = `ENGINE TIME ${mmss(V.e)} / ${mmss(V.total)}  ·  ${ps.dist.toFixed(1)} m  ·  ${V.speed}×${V.dirty ? "  ·  unsaved edits" : ""}`;
    if (document.activeElement !== $("#scrub")) $("#scrub").value = V.e; $("#play").textContent = V.playing ? "❚❚" : "▶";
    document.querySelectorAll("[data-step]").forEach(b => b.classList.toggle("on", +b.dataset.step === ps.step)); drawMini(ps);
  }
  const sp = Math.sin(orbit.ph), off = new T.Vector3(sp * Math.sin(orbit.th), Math.cos(orbit.ph), sp * Math.cos(orbit.th)).multiplyScalar(orbit.r);
  camera.position.copy(orbit.tgt).add(off); camera.lookAt(orbit.tgt);
  const sz = Math.min(220, Math.max(40, orbit.r * 1.3)); Object.assign(sun.shadow.camera, { left: -sz, right: sz, top: sz, bottom: -sz }); sun.shadow.camera.updateProjectionMatrix();
  sun.position.copy(orbit.tgt).add(new T.Vector3(-90, 160, 70)); sun.target.position.copy(orbit.tgt);
  renderer.render(scene, camera);
  frames++; if (now - fpsT > 1000) { V.fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; $("#fps").textContent = `${V.fps} fps`; }
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
(async () => {
  try {
    V.pack = window.V9_PACK || await (await fetch("/api/scene3d")).json(); if (V.pack.error) throw new Error(V.pack.error);
    $("#sub").textContent = `${V.pack.factory.name} · ${V.pack.objects.length} objects from CAD · ${V.pack.paths.length} paths · Factory Engine ${FE.ENGINE_VERSION || ""}${OFFLINE ? " · offline file" : " · live master data"}`;
    await buildFactory(V.pack); selectPath(q.get("path") || V.pack.paths[0].id); setMode(q.get("mode") || "guided"); V.ready = true; $("#loading").remove();
  } catch (err) { $("#loading").textContent = "Could not build V9: " + err.message; console.error(err); }
})();
requestAnimationFrame(frame);
