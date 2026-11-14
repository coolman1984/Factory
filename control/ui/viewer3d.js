// Real factory in the browser (three.js, the same build the Material-Flow V8 player uses): true CAD walls and columns,
// every object as one instanced batch per model, and the trolley driven by the Factory Engine timeline of a path.
// Built for laptop GPUs: instancing, one camera-following sun shadow, no post-processing, pixel ratio capped.
const T = window.THREE, $ = s => document.querySelector(s);
const q = new URLSearchParams(location.search), PATH = q.get("path") || "";
const P = (x, y, z = 0) => new T.Vector3(x, z, -y);   // site metres (x east, y north) -> three (y up)
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const V = { pack: null, steps: [], cum: [], stepStart: [], route: [], e: 0, playing: true, speed: 10, mode: "follow", labels: true, models: {}, fps: 0 };
window.V3D = V;

/* ---------- renderer, scene, light ---------- */
const canvas = $("#c"), renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1));   // as the V8 player: laptop GPUs stay at 60 fps
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NeutralToneMapping ?? T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
const scene = new T.Scene(); scene.background = new T.Color(0xdfe7f1); scene.fog = new T.Fog(0xdfe7f1, 380, 900);
const camera = new T.PerspectiveCamera(40, 1, 0.3, 3000);
{ const envScene = window.MFLook.environment(T), pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.02).texture; pm.dispose(); }   // V8 reflection studio
scene.add(new T.HemisphereLight(0xffffff, 0x2a3550, 0.9));
const sun = new T.DirectionalLight(0xfff2e0, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const mat = (c, r = 0.7, m = 0, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...o });

/* ---------- loading ---------- */
const loader = new T.X.GLTFLoader();
function model(name) {
  if (!V.models[name]) V.models[name] = new Promise(ok => loader.load(`/assets/${name}.glb`, g => { const box = new T.Box3().setFromObject(g.scene), parts = [];
    g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() }); });
    ok({ scene: g.scene, box, parts }); }, undefined, () => ok(null)));
  return V.models[name];
}
// object transform: fit the model's bounding box to the CAD footprint (same rule as the Godot viewer)
function fit(md, size, pos, yaw, fitH) {
  const b = md.box, s = new T.Vector3(); b.getSize(s); const c = new T.Vector3(); b.getCenter(c);
  const sx = size[0] / s.x, sz = size[1] / s.z, sy = fitH ? size[2] / s.y : Math.min(1.3, Math.max(0.75, Math.sqrt(sx * sz)));
  const R = new T.Matrix4().makeRotationY(yaw * Math.PI / 180);
  return new T.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(R).multiply(new T.Matrix4().makeTranslation(-c.x * sx, -b.min.y * sy, -c.z * sz)).multiply(new T.Matrix4().makeScale(sx, sy, sz));
}
function instanced(md, mats, shadow = true) {   // one InstancedMesh per glTF part
  for (const p of md.parts) { const im = new T.InstancedMesh(p.geo, p.mat, mats.length); mats.forEach((M, i) => im.setMatrixAt(i, M.clone().multiply(p.m)));
    im.castShadow = shadow; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; scene.add(im); }
}

/* ---------- build ---------- */
async function build() {
  const pack = V.pack = await (await fetch(`/api/scene3d?path=${encodeURIComponent(PATH)}`)).json();
  if (pack.error) throw new Error(pack.error);
  V.steps = pack.path.steps; $("#title").textContent = pack.path.name; $("#sub").textContent = `${pack.factory.name}  ·  ${pack.objects.length} objects from CAD  ·  engine run ${pack.run}`;
  // ground and floors
  let mn = [1e9, 1e9], mx = [-1e9, -1e9]; for (const b of pack.buildings) { mn = [Math.min(mn[0], b.center[0] - b.size[0] / 2), Math.min(mn[1], b.center[1] - b.size[1] / 2)]; mx = [Math.max(mx[0], b.center[0] + b.size[0] / 2), Math.max(mx[1], b.center[1] + b.size[1] / 2)]; }
  V.site = { c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2], s: [mx[0] - mn[0], mx[1] - mn[1]] };
  const g = new T.Mesh(new T.PlaneGeometry(V.site.s[0] + 400, V.site.s[1] + 400), mat(0x5d6168, 0.95)); g.rotation.x = -Math.PI / 2; g.position.copy(P(V.site.c[0], V.site.c[1], -0.03)); g.receiveShadow = true; scene.add(g);
  for (const b of pack.buildings) { const floor = window.MFLook.material(T, "concrete"); floor.color.setHex(0xd0d4d2); for (const k of ["map", "roughnessMap", "normalMap"]) { floor[k] = floor[k].clone(); floor[k].repeat.set(b.size[0] / 12, b.size[1] / 12); }
    const f = new T.Mesh(new T.BoxGeometry(b.size[0], 0.1, b.size[1]), floor); f.position.copy(P(b.center[0], b.center[1], -0.05)); f.receiveShadow = true; scene.add(f); label(b.id, P(b.center[0], b.center[1], 24), 3.2, "#fff", "building"); }
  for (const a of pack.areas) { const z = new T.Mesh(new T.PlaneGeometry(a.size[0], a.size[1]), new T.MeshBasicMaterial({ color: a.id.startsWith("INJ1") ? 0x4f86c6 : 0xe0a040, transparent: true, opacity: 0.12, depthWrite: false })); z.rotation.x = -Math.PI / 2; z.position.copy(P(a.center[0], a.center[1], 0.01)); scene.add(z); label(a.name, P(a.center[0], a.center[1], 12), 1.6, "#ffe1a6", "building"); }
  // CAD layers: walls as instanced boxes, markings as lines, columns from the column model
  const box = new T.BoxGeometry(1, 1, 1), W = { exterior_wall: [9, 0.25, 0xcfd2d2], wall: [3.4, 0.18, 0xdadcdb], partition: [2.7, 0.1, 0xe6e7e6], outline: [0.55, 0.32, 0xf2b705] };
  for (const [id, l] of Object.entries(pack.cad)) {
    if (l.kind === "marking") { const pos = []; for (const s of l.segments) pos.push(s[0], 0.02, -s[1], s[2], 0.02, -s[3]); const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); scene.add(new T.LineSegments(geo, new T.LineBasicMaterial({ color: id === "ROAD_MARKINGS" ? 0xeeeeee : 0xe8b407 }))); continue; }
    if (l.kind === "column") { const md = await model("column"); if (!md) continue; const s = new T.Vector3(); md.box.getSize(s); instanced(md, l.segments.map(r => new T.Matrix4().makeTranslation(r[0], 0, -r[1]).multiply(new T.Matrix4().makeScale(r[2] / s.x, l.height / s.y, r[3] / s.z)))); continue; }
    const w = W[l.kind]; if (!w) continue; const y0 = l.kind === "outline" ? l.height - 0.55 : 0;
    const wm = l.kind === "outline" ? window.MFLook.material(T, "paint", { color: new T.Color(w[2]) }) : window.MFLook.material(T, "wall", { color: new T.Color(w[2]) });
    const im = new T.InstancedMesh(box, wm, l.segments.length), M = new T.Matrix4();
    l.segments.forEach((s, i) => { const a = P(s[0], s[1]), b2 = P(s[2], s[3]), d = b2.clone().sub(a), L = Math.max(d.length(), 0.01); M.makeRotationY(-Math.atan2(d.z, d.x)); M.scale(new T.Vector3(L + w[1] * 0.5, w[0], w[1])); M.setPosition(a.clone().add(b2).multiplyScalar(0.5).setY(y0 + w[0] / 2)); im.setMatrixAt(i, M); });
    im.castShadow = l.kind !== "partition"; im.receiveShadow = true; scene.add(im);
  }
  // objects: one instanced batch per model; route clashes as red ghosts
  const groups = {}, conflicts = new Set(pack.conflicts || []), fitH = new Set(["RACK", "PALLET", "CRANE_BRIDGE", "BOLLARD", "TABLE", "BIN_CART", "SMT_MODULE", "EPS_MACHINE"]);
  for (const o of pack.objects) { if (["TROLLEY", "AGV", "OPERATOR"].includes(o.prefab)) continue; const a = o.asset.split("/").pop().replace(".glb", ""); (groups[a] ||= []).push(o); }
  await Promise.all(Object.keys(groups).map(model));
  const ghost = mat(0xff3322, 0.5, 0, { transparent: true, opacity: 0.32, emissive: 0xff2010, emissiveIntensity: 0.35, depthWrite: false });
  for (const [a, list] of Object.entries(groups)) { const md = await model(a); if (!md) continue; const ok = [];
    for (const o of list) { const M = fit(md, o.size, P(o.pos[0], o.pos[1], o.pos[2]), o.yaw, fitH.has(o.prefab));
      if (conflicts.has(o.id)) { for (const p of md.parts) { const gm = new T.Mesh(p.geo, ghost); gm.matrixAutoUpdate = false; gm.matrix.copy(M.clone().multiply(p.m)); scene.add(gm); } label("ROUTE CLASH · " + o.name.toLowerCase(), P(o.pos[0], o.pos[1], 3.8), 0.9, "#ff8a80", "stop"); }
      else ok.push(M); }
    if (ok.length) instanced(md, ok); }
  // route ribbon (progress shader), stops, actors
  buildRoute(pack); for (const s of pack.stops) stopMarker(s);
  const [tr, op, agv] = await Promise.all(["trolley", "operator", "agv"].map(model));
  V.trolley = actor(tr, [1.2, 0.8, 1.15]); V.operator = actor(op, [0.65, 0.56, 1.75]); V.agv = actor(agv, [1.4, 0.9, 0.42]);
  const halo = new T.Mesh(new T.RingGeometry(1.25, 1.5, 48), new T.MeshBasicMaterial({ color: 0xc89bff, transparent: true, opacity: 0.85, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; V.trolley.add(halo);
  const k = pack.engine_kpis || {}; $("#kpi").textContent = `Engine: ${mmss(k.trip_s || pack.path.total_s)} trip · ${k.distance_m ?? "-"} m (push ${k.push_m ?? "-"} m, AGV ${k.agv_m ?? "-"} m) · ${(pack.conflicts || []).length} route clash(es) with the CAD`;
  $("#scrub").max = pack.path.total_s; steps(); setMode(q.get("mode") || "guided"); $("#loading").remove();
}
function actor(md, size) { const g = new T.Group(); if (md) { const m = md.scene.clone(true); m.applyMatrix4(fit(md, size, new T.Vector3(), 0, true)); m.traverse(o => { if (o.isMesh) { o.castShadow = true; } }); g.add(m); } scene.add(g); return g; }

function label(text, pos, h, color, group) {
  const c = document.createElement("canvas"), x = c.getContext("2d"), f = 64; x.font = `600 ${f}px Segoe UI, Arial`; const w = Math.ceil(x.measureText(text).width) + 40;
  c.width = w; c.height = f + 30; x.font = `600 ${f}px Segoe UI, Arial`; x.lineWidth = 12; x.strokeStyle = "rgba(10,16,28,.85)"; x.strokeText(text, 20, f); x.fillStyle = color; x.fillText(text, 20, f);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; const s = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: group !== "building", transparent: true }));
  s.scale.set(h * w / c.height, h, 1); s.position.copy(pos); s.userData.group = group; scene.add(s); (V.labelList ||= []).push(s); return s;
}
function stopMarker(s) {
  const ring = new T.Mesh(new T.RingGeometry(0.75, 0.95, 40), new T.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.95, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.copy(P(s.pos[0], s.pos[1], 0.04)); scene.add(ring);
  const i = V.steps.findIndex(x => x.stop === s.id); if (i >= 0) label(`${i + 1}  ${V.steps[i].title}`, P(s.pos[0], s.pos[1], 3.2), 0.75, "#ffffff", "stop");
}
function buildRoute(pack) {
  const pts = [], cum = [], start = []; let acc = 0;
  V.steps.forEach((s, i) => { start.push(acc); if (!i) return; for (const q of s.pts) { const v = new T.Vector2(q[0], q[1]); if (pts.length) { const d = v.distanceTo(pts.at(-1)); if (d < 0.01) continue; acc += d; } pts.push(v); cum.push(acc); } });
  V.route = pts; V.cum = cum; V.stepStart = start;
  const pos = [], dist = [], side = [], w = 0.45;
  for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1], n = b.clone().sub(a).normalize(), o = new T.Vector2(-n.y, n.x).multiplyScalar(w);
    const quad = [[a.clone().sub(o), cum[k], 0], [a.clone().add(o), cum[k], 1], [b.clone().add(o), cum[k + 1], 1], [b.clone().sub(o), cum[k + 1], 0]];
    for (const j of [0, 1, 2, 0, 2, 3]) { pos.push(quad[j][0].x, 0.03, -quad[j][0].y); dist.push(quad[j][1]); side.push(quad[j][2]); } }
  const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); geo.setAttribute("dist", new T.Float32BufferAttribute(dist, 1)); geo.setAttribute("side", new T.Float32BufferAttribute(side, 1));
  V.routeMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { progress: { value: 0 }, time: { value: 0 }, col: { value: new T.Color(pack.path.color || "#7030a0") } },
    vertexShader: "attribute float dist; attribute float side; varying float vD; varying float vS; void main(){ vD = dist; vS = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float progress; uniform float time; uniform vec3 col; varying float vD; varying float vS; void main(){ float across = abs(vS-0.5)*2.0; float edge = smoothstep(1.0,0.6,across); float done = step(vD, progress); float chev = step(0.6, fract(vD*0.7 - time*0.9 - across*0.25)); float head = exp(-abs(vD-progress)*0.9); float a = edge*(done*0.75 + (1.0-done)*(0.12+0.25*chev)) + head*edge*0.6; gl_FragColor = vec4(mix(col, vec3(1.0), head*0.45), clamp(a,0.0,1.0)); }" });
  scene.add(new T.Mesh(geo, V.routeMat));
}

/* ---------- engine timeline -> pose (same rules as the Godot film) ---------- */
const plen = p => { let d = 0; for (let k = 1; k < p.length; k++) d += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return d; };
function at(p, s) { let acc = 0; for (let k = 1; k < p.length; k++) { const L = Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); if (acc + L >= s && L > 0) { const t = (s - acc) / L; return [p[k - 1][0] + (p[k][0] - p[k - 1][0]) * t, p[k - 1][1] + (p[k][1] - p[k - 1][1]) * t]; } acc += L; } return p.at(-1); }
function ease(u, L) { const r = Math.min(0.4, Math.max(0.05, 1.6 / Math.max(L, 0.1))), v = 1 / (1 - r); u = Math.min(1, Math.max(0, u)); if (u < r) return 0.5 * v * u * u / r; if (u > 1 - r) { const q2 = 1 - u; return 1 - 0.5 * v * q2 * q2 / r; } return 0.5 * v * r + v * (u - r); }
function pose(e) {
  const S = V.steps, out = { p: S[0].pts[0], dir: V.dir || [1, 0], mode: S[0].mode, moving: false, step: 0, dist: 0, u: 0, phase: "wait" };
  for (let i = 1; i < S.length; i++) { const s = S[i]; if (e < s.t0) { out.step = i - 1; break; } const L = plen(s.pts);
    if (e <= s.tm) { const u = (e - s.t0) / Math.max(s.tm - s.t0, 0.001), d = L * ease(u, L), a = at(s.pts, Math.min(d + 0.9, L)), b = at(s.pts, Math.max(d - 0.9, 0));
      return { p: at(s.pts, d), dir: Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.05 ? [a[0] - b[0], a[1] - b[1]] : out.dir, mode: s.mode, moving: true, step: i, dist: V.stepStart[i] + d, u, phase: "travel" }; }
    out.p = s.pts.at(-1); if (s.pts.length > 1) out.dir = [s.pts.at(-1)[0] - s.pts.at(-2)[0], s.pts.at(-1)[1] - s.pts.at(-2)[1]]; out.mode = s.mode; out.step = i; out.dist = V.stepStart[i] + L; out.u = (e - s.tm) / Math.max(s.t1 - s.tm, 0.001); }
  return out;
}

/* ---------- camera: follow, free orbit, 2D plan ---------- */
const orbit = { tgt: new T.Vector3(), r: 60, th: -0.7, ph: 0.9 }; let drag = null;
function setMode(m) { V.mode = m; document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
  if (m === "plan") { orbit.ph = 0.02; orbit.r = 70; } if (m === "follow") { orbit.r = 26; orbit.ph = 0.95; } if (m === "chase") { orbit.r = 11; orbit.ph = 1.2; } if (m === "guided") { orbit.r = 30; V.guided = null; }
  if (m === "overview") { orbit.tgt.copy(P(V.site.c[0], V.site.c[1])); orbit.r = Math.max(...V.site.s) * 1.25; orbit.ph = 0.82; orbit.th = -0.75; } if (m === "free") { orbit.ph = Math.max(orbit.ph, 0.6); } }
// V8 lesson: a guided camera keeps one calm angle per step and checks that the true CAD walls do not hide the trolley.
function wallGrid() { if (V.wg) return V.wg; const g = new Map(), H = { exterior_wall: 9, wall: 3.4, partition: 2.7 };
  for (const l of Object.values(V.pack.cad)) if (H[l.kind]) for (const s of l.segments) { const sg = [...s, H[l.kind]]; for (let x = Math.floor(Math.min(s[0], s[2]) / 5); x <= Math.floor(Math.max(s[0], s[2]) / 5); x++) for (let y = Math.floor(Math.min(s[1], s[3]) / 5); y <= Math.floor(Math.max(s[1], s[3]) / 5); y++) { const k = x + "," + y; (g.get(k) || g.set(k, []).get(k)).push(sg); } }
  return V.wg = g; }
function blockedHeight(a, b, hs, hc) {   // the camera height needed to see a (subject, 2D site m) from b
  let need = hc; const seen = new Set(), g = wallGrid();
  for (let x = Math.floor(Math.min(a[0], b[0]) / 5); x <= Math.floor(Math.max(a[0], b[0]) / 5); x++) for (let y = Math.floor(Math.min(a[1], b[1]) / 5); y <= Math.floor(Math.max(a[1], b[1]) / 5); y++) for (const s of g.get(x + "," + y) || []) {
    if (seen.has(s)) continue; seen.add(s); const d = (b[0] - a[0]) * (s[3] - s[1]) - (b[1] - a[1]) * (s[2] - s[0]); if (Math.abs(d) < 1e-9) continue;
    const u = ((s[0] - a[0]) * (s[3] - s[1]) - (s[1] - a[1]) * (s[2] - s[0])) / d, v = ((s[0] - a[0]) * (b[1] - a[1]) - (s[1] - a[1]) * (b[0] - a[0])) / d;
    if (u > 0.04 && u <= 1 && v >= 0 && v <= 1) need = Math.max(need, hs + (s[4] + 0.6 - hs) / u); }
  return need;
}
function guidedGoal(ps) {   // one azimuth per step: side-on to the step's main direction, the clearest of a few candidates
  const key = ps.step + ":" + ps.phase; if (V.guided && V.guided.key === key) return V.guided;
  const s = V.steps[ps.step], pts = s.pts.length > 1 ? s.pts : V.steps[Math.min(ps.step + 1, V.steps.length - 1)].pts, a = pts[0], b = pts.at(-1), main = Math.atan2(b[1] - a[1], b[0] - a[0]) || 0, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let best = null; for (const off of [Math.PI / 2, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 4, -Math.PI / 4, Math.PI]) { const az = main + off, R = 24, ph = 0.95, h = R * Math.cos(ph), c = [mid[0] + Math.cos(az) * R * Math.sin(ph), mid[1] + Math.sin(az) * R * Math.sin(ph)], need = blockedHeight(mid, c, 1, h); const score = need - h; if (!best || score < best.score) best = { az, score, h: need }; if (score <= 0) break; }
  return V.guided = { key, th: -best.az - Math.PI / 2 + Math.PI, ph: Math.max(0.35, Math.acos(Math.min(1, best.h / 24))) };
}
canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, b: e.button }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointerup", () => drag = null);
canvas.addEventListener("pointermove", e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.b === 2 || e.shiftKey) { if (V.mode === "follow") setMode("free"); const f = orbit.r * 0.0016, c = Math.cos(orbit.th), s = Math.sin(orbit.th); orbit.tgt.x += (-dx * c - dy * s) * f; orbit.tgt.z += (dx * s - dy * c) * f; }
  else { orbit.th -= dx * 0.006; if (V.mode !== "plan") orbit.ph = Math.min(1.5, Math.max(0.08, orbit.ph - dy * 0.005)); } });
canvas.addEventListener("wheel", e => { e.preventDefault(); orbit.r = Math.min(900, Math.max(4, orbit.r * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); }, { passive: false });
canvas.addEventListener("contextmenu", e => e.preventDefault());
function fly(id) { const b = V.pack.buildings.find(x => x.id === id); if (!b) return; setMode("free"); orbit.tgt.copy(P(b.center[0], b.center[1])); orbit.r = Math.max(b.size[0], b.size[1]) * 1.1; orbit.ph = 0.85; }

/* ---------- UI ---------- */
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function steps() { $("#steps").innerHTML = V.steps.map((s, i) => `<button data-step="${i}"><b>${i + 1}</b> ${esc(s.title)}</button>`).join(""); }
document.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.mode) setMode(b.dataset.mode); if (b.dataset.fly) fly(b.dataset.fly); if (b.dataset.step) { const s = V.steps[+b.dataset.step]; V.e = Math.max(0, (+b.dataset.step ? s.t0 : 0)); setMode("follow"); }
  if (b.id === "play") V.playing = !V.playing; if (b.id === "rec") record(); if (b.id === "lab") { V.labels = !V.labels; for (const s of V.labelList) s.visible = V.labels; }
  if (b.dataset.speed) { V.speed = +b.dataset.speed; document.querySelectorAll("[data-speed]").forEach(x => x.classList.toggle("on", x === b)); } });
$("#scrub").addEventListener("input", e => { V.e = +e.target.value; });
addEventListener("keydown", e => { if (e.key === " ") { V.playing = !V.playing; e.preventDefault(); } if (e.key === "g") setMode("guided"); if (e.key === "f") setMode("follow"); if (e.key === "c") setMode("chase"); if (e.key === "v") setMode("overview"); if (e.key === "p") setMode("plan"); if (e.key === "o") setMode("free"); if (e.key === "r") record(); if (["1", "2", "3"].includes(e.key)) fly(["E1", "E2", "EPS"][+e.key - 1]); });

/* ---------- 2D minimap of the true CAD plan ---------- */
function drawMini(ps) {
  const cv = $("#mini"), x = cv.getContext("2d"), W = cv.width, H = cv.height; if (!V.miniBox) { let mn = [1e9, 1e9], mx = [-1e9, -1e9]; for (const p of V.route) { mn = [Math.min(mn[0], p.x), Math.min(mn[1], p.y)]; mx = [Math.max(mx[0], p.x), Math.max(mx[1], p.y)]; } V.miniBox = [mn[0] - 14, mn[1] - 14, mx[0] + 14, mx[1] + 14]; }
  const [x0, y0, x1, y1] = V.miniBox, sc = Math.min((W - 16) / (x1 - x0), (H - 16) / (y1 - y0)), ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2, tx = p => [ox + (p[0] - x0) * sc, H - oy - (p[1] - y0) * sc];
  x.clearRect(0, 0, W, H); x.lineWidth = 1; x.strokeStyle = "rgba(220,230,245,.55)"; x.beginPath();
  for (const id of ["EXTERIOR_WALLS", "WALLS", "PARTITIONS"]) for (const s of V.pack.cad[id]?.segments || []) { if (Math.max(s[0], s[2]) < x0 || Math.min(s[0], s[2]) > x1 || Math.max(s[1], s[3]) < y0 || Math.min(s[1], s[3]) > y1) continue; const a = tx(s), b = tx([s[2], s[3]]); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }
  x.stroke(); x.lineWidth = 3; x.strokeStyle = "rgba(200,155,255,.35)"; x.beginPath(); V.route.forEach((p, i) => { const q2 = tx([p.x, p.y]); i ? x.lineTo(q2[0], q2[1]) : x.moveTo(q2[0], q2[1]); }); x.stroke();
  x.strokeStyle = "#c89bff"; x.beginPath(); let started = false; V.route.forEach((p, i) => { if (V.cum[i] > ps.dist) return; const q2 = tx([p.x, p.y]); started ? x.lineTo(q2[0], q2[1]) : x.moveTo(q2[0], q2[1]); started = true; }); const tp2 = tx(ps.p); if (started) x.lineTo(tp2[0], tp2[1]); x.stroke();
  for (const s of V.pack.stops) { const q2 = tx(s.pos); x.fillStyle = "#fff"; x.beginPath(); x.arc(q2[0], q2[1], 3, 0, 7); x.fill(); }
  x.fillStyle = "rgba(200,155,255,.35)"; x.beginPath(); x.arc(tp2[0], tp2[1], 9 + 3 * Math.sin(performance.now() / 200), 0, 7); x.fill(); x.fillStyle = "#fff"; x.beginPath(); x.arc(tp2[0], tp2[1], 4.5, 0, 7); x.fill();
}

/* ---------- takes: record the trip as a video in the browser (V8 lesson), saved to the Control Center ---------- */
async function record() {
  if (V.rec) { V.rec.stop(); return; }
  if (!window.MediaRecorder) return alert("This browser cannot record video.");
  const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(t => MediaRecorder.isTypeSupported(t)), chunks = [], rec = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 12e6 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = async () => { V.rec = null; $("#rec").classList.remove("on"); $("#rec").textContent = "● Record"; const blob = new Blob(chunks, { type: "video/webm" }), name = `${PATH || "path"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.webm`;
    const r = await fetch("/api/films/upload?name=" + encodeURIComponent(name), { method: "POST", body: blob }).then(x => x.json()).catch(() => ({ ok: false }));
    $("#cap-n").textContent = r.ok ? `TAKE SAVED · ${name} · Control Center → 3D & film` : "TAKE NOT SAVED"; };
  V.rec = rec; V.e = 0; V.playing = true; setMode("guided"); rec.start(1000); $("#rec").classList.add("on"); $("#rec").textContent = "■ Stop";
  V.recEnd = V.pack.path.total_s + 2;
}

/* ---------- loop ---------- */
let last = performance.now(), frames = 0, fpsT = last;
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (V.ready) {
    const total = V.pack.path.total_s; if (V.playing) { V.e += dt * V.speed; if (V.rec && V.e > V.recEnd) V.rec.stop(); if (V.e > total + 4) V.e = 0; }
    const ps = pose(Math.min(V.e, total)); const d = new T.Vector2(...ps.dir).normalize(), prev = V.dirS || d; V.dirS = prev.clone().lerp(d, Math.min(1, dt * 6)).normalize(); V.dir = [V.dirS.x, V.dirS.y];
    const yaw = Math.atan2(V.dirS.y, V.dirS.x), agvMode = ps.mode === "agv", tp = P(ps.p[0], ps.p[1], agvMode ? 0.36 : 0);
    V.trolley.position.copy(tp); V.trolley.rotation.y = yaw;
    if (!agvMode) { const back = [ps.p[0] - V.dirS.x * 1.15, ps.p[1] - V.dirS.y * 1.15]; V.operator.position.copy(P(back[0], back[1], ps.moving ? Math.abs(Math.sin(ps.dist * 2.6)) * 0.035 : 0)); V.operator.rotation.y = yaw; }
    V.agv.visible = agvMode || (ps.step >= 4 && ps.phase === "wait" && ps.u > 0.35);
    if (agvMode) { V.agv.position.copy(P(ps.p[0], ps.p[1])); V.agv.rotation.y = yaw; } else if (V.agv.visible) { let k = Math.min(1, Math.max(0, (ps.u - 0.35) / 0.6)); k = k * k * (3 - 2 * k); const sx = -V.dirS.y * 7, sy = V.dirS.x * 7; V.agv.position.copy(P(ps.p[0] + sx * (1 - k), ps.p[1] + sy * (1 - k))); V.agv.rotation.y = yaw; }
    V.routeMat.uniforms.progress.value = ps.dist; V.routeMat.uniforms.time.value = now / 1000;
    if (!["free", "overview"].includes(V.mode)) orbit.tgt.lerp(tp, V.mode === "plan" ? 1 : Math.min(1, dt * 3));
    const wrap = d2 => Math.atan2(Math.sin(d2), Math.cos(d2));
    if (V.mode === "follow" || V.mode === "chase") orbit.th += wrap(-(yaw) - Math.PI / 2 - orbit.th) * Math.min(1, dt * (V.mode === "chase" ? 1.5 : 0.6));
    if (V.mode === "guided") { const gg = guidedGoal(ps); orbit.th += wrap(gg.th - orbit.th) * Math.min(1, dt * 0.9); orbit.ph += (gg.ph - orbit.ph) * Math.min(1, dt * 0.9); orbit.r += (30 - orbit.r) * Math.min(1, dt); }
    if (V.mode === "follow" || V.mode === "chase") { const cx = orbit.tgt.x + orbit.r * Math.sin(orbit.ph) * Math.sin(orbit.th), cz = orbit.tgt.z + orbit.r * Math.sin(orbit.ph) * Math.cos(orbit.th), need = blockedHeight(ps.p, [cx, -cz], 1, orbit.r * Math.cos(orbit.ph));
      const want = Math.acos(Math.min(1, need / orbit.r)); orbit.ph += ((need > orbit.r * Math.cos(orbit.ph) + 0.2 ? want : (V.mode === "chase" ? 1.2 : 0.95)) - orbit.ph) * Math.min(1, dt * 2); }
    drawMini(ps);
    const s = V.steps[ps.step]; $("#cap-n").textContent = `STEP ${ps.step + 1} / ${V.steps.length}  ·  ${ps.phase === "travel" ? (s.mode === "agv" ? "AGV" : "PUSHED BY HAND") + " · " + (+s.dist).toFixed(1) + " m" : "WAIT"}`;
    $("#cap-t").textContent = s.title; $("#cap-x").textContent = s.caption || ""; $("#clock").textContent = `ENGINE TIME ${mmss(V.e)} / ${mmss(total)}  ·  ${ps.dist.toFixed(1)} m  ·  ${V.speed}×`;
    if (document.activeElement !== $("#scrub")) $("#scrub").value = V.e; $("#play").textContent = V.playing ? "❚❚" : "▶";
    document.querySelectorAll("[data-step]").forEach(b => b.classList.toggle("on", +b.dataset.step === ps.step));
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
build().then(() => { V.ready = true; }).catch(e => { $("#loading").textContent = "Could not build the 3D factory: " + e.message; });
requestAnimationFrame(frame);
