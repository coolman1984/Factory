/* Material Flow Player: one scene, full control. Everything on screen is a function of (flow, time, view, camera):
   the timeline can jump anywhere, and the viewer can leave the guided camera at any moment and keep playing.
   Slide coordinates (960 x 540) are kept all the way, 1 point = 0.30 m. Each plan is a plate that can move and rise:
   stack 0 = the slide layout, 1 = floors stacked. R is how far the factory has risen out of the flat plan (0 = 2D, 1 = 3D). */
"use strict";
(function () {
  const D = window.MF_DATA, RP = window.MF_REPLICA, T = window.THREE, $ = (id) => document.getElementById(id);
  function fail(m) { const e = $("err"); e.style.display = "grid"; e.textContent = m; }
  if (!T) { fail("The 3D library did not load."); return; }
  const CX = 480, CY = 290, GAP = 120, DWELL = 1.8, SPEED = 7, INTRO = 7, PT_M = RP.scale;
  const plateOf = (x, y) => (x < 553 ? "E1" : y >= 303 ? "E2-1F" : "E2-2F");
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);
  const query = new URLSearchParams(location.search);

  /* ---------- state ---------- */
  const S = { flow: 0, t: 0, playing: false, speed: 1, view: "auto", cam: "guided", stack: 0, stackUser: null, labels: true, net: false, panel: true, stepStop: false, R: 0, focus: true, sound: false, plan: "replica", look: "studio", quality: ["high", "medium", "low"].includes(query.get("q")) ? query.get("q") : "high", measure: false, pts: [],
    c: { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: 0.001 } };
  const want = { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: 0.001 };

  const metrics = { frames: 0, intervals: new Float32Array(600), events: [], shadows: 0, riseUpdates: 0, dimUpdates: 0, stages: {} };
  const profile = query.has("profile");
  function event(name, start) { metrics.events.push({ name, ms: +(performance.now() - start).toFixed(2) }); if (metrics.events.length > 80) metrics.events.shift(); }
  function stage(name, start) { if (!profile) return; const ms = performance.now() - start, v = metrics.stages[name] || (metrics.stages[name] = { calls: 0, total: 0, max: 0 }); v.calls++; v.total += ms; v.max = Math.max(v.max, ms); }
  const realtimeShadows = query.get("shadows") === "1";
  let manualQuality = query.has("q"), resolutionScale = 1;
  /* ---------- renderer and light ---------- */
  function W(x, y, s = S.stack, up = 0.8) { const P = D.plates[plateOf(x, y)]; return new T.Vector3(x - CX + s * P.dx, s * P.lift * GAP + up, y - CY + s * P.dz); }
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas: $("gl"), antialias: true, powerPreference: "high-performance" }); } catch (e) { fail("This browser could not start 3D (WebGL)."); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
  renderer.toneMapping = T.NeutralToneMapping ?? T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = realtimeShadows; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(28, 1, 8, 7000);
  const envScene = window.MFLook.environment(T), pm = new T.PMREMGenerator(renderer);
  const envTarget = pm.fromScene(envScene, .02); scene.environment = envTarget.texture; pm.dispose();
  envScene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  const hemi = new T.HemisphereLight(0xffffff, 0x2a3550, 1), sun = new T.DirectionalLight(0xfff2e0, 2.4); sun.position.set(-420, 720, 340); sun.castShadow = realtimeShadows;
  Object.assign(sun.shadow.camera, { left: -760, right: 760, top: 620, bottom: -620, near: 50, far: 1700 }); sun.shadow.mapSize.set(1536, 1536); sun.shadow.bias = -.0004; sun.shadow.normalBias = .08; sun.shadow.radius = 4;
  scene.add(hemi, sun);
  const grid = new T.GridHelper(2200, 44, 0x24324d, 0x141e33); grid.position.y = -8; scene.add(grid);

  /* ---------- plates: slab, clean replica plan, original plan ---------- */
  const plates = {}, floors = [], origs = [], originalLoads = [], loader = new T.TextureLoader();
  for (const [key, P] of Object.entries(D.plates)) {
    const g = new T.Group(); scene.add(g); plates[key] = g;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const pic of P.pics) {
      let loaded, failed; originalLoads.push(new Promise((resolve, reject) => { loaded = resolve; failed = reject; }));
      const tex = loader.load(window.MF_PLANS[pic.file], loaded, undefined, failed); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }), m = new T.Mesh(new T.PlaneGeometry(pic.w, pic.h), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(pic.x + pic.w / 2 - CX, .3, pic.y + pic.h / 2 - CY); g.add(m); origs.push(m);
      minX = Math.min(minX, pic.x); minY = Math.min(minY, pic.y); maxX = Math.max(maxX, pic.x + pic.w); maxY = Math.max(maxY, pic.y + pic.h);
    }
    const w = maxX - minX, h = maxY - minY; P.box = [minX, minY, w, h];
    const slab = new T.Mesh(new T.BoxGeometry(w + 8, 6, h + 8), new T.MeshStandardMaterial({ color: 0x18233a, roughness: .7 })); slab.position.set(minX + w / 2 - CX, -3.2, minY + h / 2 - CY); slab.receiveShadow = true; g.add(slab);
    const art = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ color: 0xc9ced6, roughness: .78, metalness: 0 })); art.rotation.x = -Math.PI / 2; art.position.set(minX + w / 2 - CX, .12, minY + h / 2 - CY); art.receiveShadow = true; g.add(art);
    const planMaterial = art.material, surfaceMaterial = window.MFLook.floor(T, w, h);
    surfaceMaterial.userData.floorLight.value = window.MFLook.contactLight(T, key, P.box, RP);
    floors.push({ art, key, box: P.box, planMaterial, surfaceMaterial }); P.art = art;
  }
  const REP = window.MFReplica.build({ T, plates, R: RP, CX, CY });
  // Sweep in the vertex shader: immutable instance buffers throughout the rise.
  const riseUniform = { value: 0 }, riseMaterials = new Set();
  for (const { im } of REP.meshes) {
    const m = im.material; if (riseMaterials.has(m)) continue; riseMaterials.add(m);
    const previous = m.onBeforeCompile.bind(m), oldKey = m.customProgramCacheKey.bind(m), key = oldKey();
    m.onBeforeCompile = shader => {
      previous(shader); shader.uniforms.mfRise = riseUniform;
      const factor = "float mfK = mfRise >= 1.0 ? 1.0 : max(0.004, smoothstep(0.0, 1.0, (-160.0 + mfRise * 1280.0 - (instanceMatrix[3].x + 480.0)) / 150.0));";
      shader.vertexShader = "uniform float mfRise;\n" + shader.vertexShader
        .replace("void main() {", "void main() {\n" + factor)
        .replace("#include <defaultnormal_vertex>", "objectNormal.y /= mfK;\n#include <defaultnormal_vertex>")
        .replace("#include <project_vertex>", T.ShaderChunk.project_vertex.replace("mvPosition = instanceMatrix * mvPosition;", "mvPosition = instanceMatrix * mvPosition; mvPosition.y *= mfK;"));
    };
    m.customProgramCacheKey = () => key + "|mf-rise-v1";
  }
  REP.rise = value => { riseUniform.value = value; for (const { im } of REP.meshes) im.visible = value > .004; metrics.riseUpdates++; };
  const planTex = {};
  function prepareArt() {
    const start = performance.now();
    // drawPlan is lead-owned. Bound GPU uploads here and release the large temporary source.
    for (const dark of [false, true]) for (const f of floors) {
      const source = window.MFReplica.drawPlan(RP, f.key, f.box, dark), scale = Math.min(1, 2048 / Math.max(source.width, source.height));
      const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(source.width * scale)); cv.height = Math.max(1, Math.round(source.height * scale));
      cv.getContext("2d").drawImage(source, 0, 0, cv.width, cv.height); source.width = source.height = 0;
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      planTex[f.key + dark] = tex; renderer.initTexture(tex);
    }
    event("prepare-plan-art", start);
  }
  function setArt(dark) { for (const f of floors) { f.planMaterial.map = planTex[f.key + dark]; } }
  function setFloorLight(key, source) {
    const fl = floors.find(f => f.key === key); if (!fl) throw new Error("Unknown plate: " + key);
    const apply = (tex, owned = false) => { if (owned) tex.colorSpace = T.SRGBColorSpace; if (fl.loadedLight && fl.loadedLight !== tex) fl.loadedLight.dispose(); fl.loadedLight = owned ? tex : null; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); renderer.initTexture(tex); fl.surfaceMaterial.userData.floorLight.value = tex; };
    if (source?.isTexture) { apply(source); return Promise.resolve(source); }
    return new Promise((resolve, reject) => loader.load(source, tex => { apply(tex, true); resolve(tex); }, undefined, reject));
  }
  // the deck that carries E2-2F out to To LCM, and solid destination blocks (schematic)
  const deck = new T.Group(); plates["E2-2F"].add(deck);
  for (const f of D.flows) for (const s of f.steps) if (s.title === "To LCM") for (let i = 1; i < s.path.length; i++) { const a = s.path[i - 1], b = s.path[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 9; if (a[0] > 726 && b[0] > 726) continue; const m = new T.Mesh(new T.BoxGeometry(len, 3, 9), new T.MeshStandardMaterial({ color: 0x41506e, roughness: .6, metalness: .3 })); m.position.set((a[0] + b[0]) / 2 - CX, -1.5, (a[1] + b[1]) / 2 - CY); m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); m.castShadow = true; deck.add(m); }
  const gates = Object.values(D.nodes).filter((n) => n.kind === "dest" && n.text !== "Elev 5 2F").map((n) => { const m = new T.Mesh(new T.BoxGeometry(24, 16, 24), new T.MeshStandardMaterial({ color: 0x156082, roughness: .4, metalness: .2 })); m.castShadow = true; m.userData.n = n; scene.add(m); return m; });
  const E = D.elevator, shaft = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(30, 1, 30)), new T.LineBasicMaterial({ color: 0xffc000 })); scene.add(shaft);
  const cabin = new T.Mesh(new T.BoxGeometry(17, 2.5, 17), new T.MeshStandardMaterial({ color: 0xffc000, metalness: .4, roughness: .4 })); cabin.castShadow = true; scene.add(cabin);
  const lot = new T.Group(); let trolleyReady;
  { // the hero: Blender's trolley with rear covers, 1.4x real size so it stays readable, on a soft contact shadow
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 8, 64, 64, 62); r.addColorStop(0, "rgba(10,14,24,.62)"); r.addColorStop(.6, "rgba(10,14,24,.3)"); r.addColorStop(1, "rgba(10,14,24,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const blob = new T.Mesh(new T.PlaneGeometry(13, 16).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false })); blob.position.y = .35; lot.add(blob);
    const bytes = Uint8Array.from(atob(window.MF_TROLLEY), (ch) => ch.charCodeAt(0));
    trolleyReady = new Promise((ok, no) => new T.X.GLTFLoader().parse(bytes.buffer, "", (gl) => { gl.scene.scale.setScalar(1.4 / PT_M); lot.add(gl.scene); ok(); }, (e) => { fail("The trolley model could not load: " + e.message); no(e); })); }
  scene.add(lot);
  const beacon = new T.Mesh(new T.RingGeometry(9, 11, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: new T.Color(0x8fdcff).multiplyScalar(3), toneMapped: false, transparent: true, side: T.DoubleSide })); scene.add(beacon);
  // atmosphere: Digital Factory's light shafts and dust
  const lamps = []; for (let x = 60; x < 520; x += 70) for (let y = 190; y < 480; y += 62) lamps.push([x - CX, 46, y - CY]);
  const atmos = window.DFAtmos ? window.DFAtmos.create(T, scene, { lamps, shafts: { height: 46, top: 1.4, bottom: 13, intensity: .05 }, dust: { count: 900, box: [620, 70, 620], size: .16, alpha: .3 } }) : null;

  /* ---------- a persistent, bounded post chain (night bloom only) ---------- */
  let composer = null, bloom = null;
  function buildPost() {
    if (composer) return; // never allocate passes during quality, look or resize changes
    const rt = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 0 });
    composer = new T.EffectComposer(renderer, rt); composer.addPass(new T.RenderPass(scene, camera));
    bloom = new T.UnrealBloomPass(new T.Vector2(1, 1), .25, .45, 2.2);
    composer.addPass(bloom); composer.addPass(new T.OutputPass());
  }
  function setQuality(q, manual = true) {
    if (!["high", "medium", "low"].includes(q)) return;
    if (q === S.quality && resolutionScale === 1) { manualQuality = manual; return; }
    const start = performance.now(); manualQuality = manual; S.quality = q; resolutionScale = 1; $("quality").value = q; resize(); event("quality-" + q, start);
  }

  /* ---------- looks ---------- */
  const LOOK = { studio: { bg: 0x0b1220, hemi: 1, sun: 2.4, exp: 1, dark: false, env: .55, air: false }, night: { bg: 0x05080f, hemi: .22, sun: .35, exp: 1.25, dark: true, env: .22, air: true }, blueprint: { bg: 0x071630, hemi: 1.2, sun: 0, exp: 1, dark: true, env: .1, air: false } };
  function setLook(k) {
    const L = LOOK[k]; if (!L) return; const start = performance.now(); S.look = k; $("look").value = k; scene.background = new T.Color(L.bg); scene.fog = new T.Fog(L.bg, 1400, 3200); hemi.intensity = L.hemi; sun.intensity = L.sun; renderer.toneMappingExposure = L.exp; scene.environmentIntensity = L.env; setArt(L.dark); atmos?.set(L.air); atmos?.theme(L.dark);
    for (const m of riseMaterials) m.wireframe = k === "blueprint";
    for (const f of floors) f.surfaceMaterial.wireframe = k === "blueprint";
    shadowDirty = true; event("look-" + k, start);
  }
  let shadowDirty = true;

  /* ---------- flows and the timeline ---------- */
  const pl = (p) => { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return d; };
  const st = REP.stats;
  function buildFlow(f) {
    f.items = [{ s: { node: f.steps[0].node, title: "From flat plan to factory", what: `Rebuilt from the slide: ${st.racks} rack blocks, ${st.machines} machines, ${st.columns} columns, ${st.walls} walls. Scale 1 slide point = ${PT_M} m.`, mode: "flow", view: "2d", dist: 300, intro: true }, i: 0, path: null, t0: 0, tm: INTRO - .6, t1: INTRO }];
    let t = INTRO, total = 0;
    f.steps.forEach((s, i) => {
      let path = s.path;
      if (path === "lift") path = [E.low, E.high];
      if (path === "fromLift") path = [E.high, [D.nodes[s.node].x, E.high[1]], [D.nodes[s.node].x, D.nodes[s.node].y]];
      const move = !path ? .6 : s.lift ? 3.2 : Math.max(1.6, pl(path) / SPEED), metres = path && !s.lift ? pl(path) * PT_M : 0; total += metres;
      f.items.push({ s, i: i + 1, path, t0: t, tm: t + move, t1: t + move + DWELL, metres, run: total }); t += move + DWELL;
    });
    f.total = t;
  }
  D.flows.forEach(buildFlow);
  const F = () => D.flows[S.flow];
  const stepAt = (t) => { const f = F(); return f.items.find((it) => t < it.t1) || f.items[f.items.length - 1]; };
  function along(path, u) {
    const L = pl(path); let d = u * L;
    for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= l || i === path.length - 1) { const k = l ? clamp(d / l, 0, 1) : 0; return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), i }; } d -= l; }
    return { x: path[0][0], y: path[0][1], i: 1 };
  }
  function lotPos(t) {
    const it = stepAt(t), n = D.nodes[it.s.node];
    if (!it.path) return { x: n.x, y: n.y, it, u: 1 };
    const u = ease(clamp((t - it.t0) / Math.max(.001, it.tm - it.t0), 0, 1));
    if (it.s.lift) return { lift: u, it, u };
    return { ...along(it.path, u), it, u };
  }
  function lotWorld(t, s = S.stack) { const p = lotPos(t); if (p.lift == null) return W(p.x, p.y, s); return W(E.low[0], E.low[1], s).lerp(W(E.high[0], E.high[1], s), p.lift); }

  /* ---------- camera ---------- */
  const fit = () => { const a = camera.aspect, f = Math.tan((camera.fov * Math.PI) / 360); return Math.max(330 / f, 560 / (f * a)); };
  const flat = () => S.view === "2d";
  const PRESET = { overview: () => ({ p: [0, 0, 0], d: fit() * .95, az: -.55, pol: 1 }), iso: () => ({ p: [0, 30, 0], d: fit() * 1.05, az: -.785, pol: .96 }),
    e1: () => ({ p: W(285, 330), d: 640, az: -.4, pol: .9 }), e21: () => ({ p: W(730, 373), d: 520, az: .35, pol: .95 }), e22: () => ({ p: W(835, 223), d: 420, az: -.5, pol: 1 }), elev: () => ({ p: W(E.low[0], E.low[1]).add(new T.Vector3(0, S.stack * GAP / 2, 0)), d: 340, az: -.9, pol: 1.15 }),
    machines: () => ({ p: W(75, 215), d: 300, az: -1.05, pol: 1.16 }), docks: () => ({ p: W(290, 440), d: 340, az: .55, pol: 1.2 }), racks: () => ({ p: W(320, 330), d: 300, az: -.25, pol: 1.25 }) };
  function setWant(time) {
    if (S.cam === "free") return;
    const cur = stepAt(S.t);
    if (S.cam === "guided" || S.cam === "follow") {
      if (S.cam === "guided" && cur.s.intro) { const e = ease(S.R); Object.assign(want, { x: 0, y: 0, z: 0, dist: fit() * lerp(1, .9, e), pol: lerp(.001, 1, e), az: lerp(0, -.5, e) }); return; }
      const p = lotWorld(S.t), d = S.cam === "follow" ? 300 : cur.s.dist * (S.stack > .5 ? 1.35 : 1.75);
      Object.assign(want, { x: p.x, y: p.y, z: p.z, dist: flat() ? d * 1.5 : d, pol: flat() ? .001 : .94, az: flat() ? 0 : -.55 });
    } else if (S.cam === "forklift") {
      const m = REP.movers[0]; if (!m) return; const p = m.v.getWorldPosition(new T.Vector3());
      Object.assign(want, { x: p.x, y: p.y + 12, z: p.z, dist: 92, pol: 1.28, az: m.heading + Math.PI });
    } else if (S.cam === "chase") {
      const p = lotWorld(S.t), q = lotWorld(Math.min(F().total, S.t + .3)), dir = Math.atan2(q.x - p.x, q.z - p.z);
      Object.assign(want, { x: p.x, y: p.y + 8, z: p.z, dist: 120, pol: 1.3, az: q.distanceTo(p) > .05 ? dir + Math.PI : S.c.az });
    } else { const r = PRESET[S.cam](), p = r.p.isVector3 ? r.p : new T.Vector3(...r.p); Object.assign(want, { x: p.x, y: p.y, z: p.z, dist: r.d, az: flat() ? 0 : r.az, pol: flat() ? .001 : r.pol }); }
  }
  // Exact critically damped springs, separately for the eye and the look target.
  const eyeVelocity = new T.Vector3(), targetVelocity = new T.Vector3(), cameraTarget = new T.Vector3(), desiredEye = new T.Vector3(), desiredTarget = new T.Vector3();
  function spring(point, velocity, goal, omega, dt) {
    const decay = Math.exp(-omega * dt);
    for (const axis of ["x", "y", "z"]) { const delta = point[axis] - goal[axis], j = velocity[axis] + omega * delta; point[axis] = goal[axis] + (delta + j * dt) * decay; velocity[axis] = (velocity[axis] - omega * j * dt) * decay; }
  }
  function moveCam(dt) {
    const c = S.c;
    if (S.cam === "free") {
      const sp = Math.sin(c.pol); camera.position.set(c.x + c.dist * sp * Math.sin(c.az), c.y + c.dist * Math.cos(c.pol), c.z + c.dist * sp * Math.cos(c.az));
      cameraTarget.set(c.x, c.y, c.z); eyeVelocity.set(0, 0, 0); targetVelocity.set(0, 0, 0);
    } else {
      const sp = Math.sin(want.pol); desiredTarget.set(want.x, want.y, want.z);
      desiredEye.set(want.x + want.dist * sp * Math.sin(want.az), want.y + want.dist * Math.cos(want.pol), want.z + want.dist * sp * Math.cos(want.az));
      const omega = S.cam === "chase" || S.cam === "forklift" ? 8 : stepAt(S.t).s.intro ? 9 : 5;
      spring(camera.position, eyeVelocity, desiredEye, omega, dt); spring(cameraTarget, targetVelocity, desiredTarget, omega, dt);
      c.x = cameraTarget.x; c.y = cameraTarget.y; c.z = cameraTarget.z;
      const dx = camera.position.x - c.x, dy = camera.position.y - c.y, dz = camera.position.z - c.z;
      c.dist = Math.max(.001, Math.hypot(dx, dy, dz)); c.pol = Math.acos(clamp(dy / c.dist, -1, 1)); c.az = Math.atan2(dx, dz);
    }
    camera.up.set(0, 1, 0); camera.lookAt(cameraTarget); camera.updateMatrixWorld();
  }

  /* ---------- overlay: flow lines, labels, measuring ---------- */
  const fx = $("fx"), g2 = fx.getContext("2d");
  function proj(v) { const p = v.clone().project(camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight, p.z]; }
  const poly = (path) => path.map((p) => proj(W(p[0], p[1], S.stack, S.R * 1.5 + .8)));
  function stroke(pts, color, w, dash, off) { if (pts.length < 2) return; g2.beginPath(); g2.setLineDash(dash || []); g2.lineDashOffset = off || 0; g2.strokeStyle = color; g2.lineWidth = w; g2.lineJoin = "round"; g2.lineCap = "round"; pts.forEach((p, i) => (i ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1]))); g2.stroke(); g2.setLineDash([]); }
  function arrow(a, b, color, size) { const r = Math.atan2(b[1] - a[1], b[0] - a[0]); g2.fillStyle = color; g2.beginPath(); g2.moveTo(b[0], b[1]); g2.lineTo(b[0] - size * Math.cos(r - .45), b[1] - size * Math.sin(r - .45)); g2.lineTo(b[0] - size * Math.cos(r + .45), b[1] - size * Math.sin(r + .45)); g2.fill(); }
  const MODE = { auto: "#ffc000", manual: "#ff5a4f", flow: "#35c6ff" };
  function draw(time) {
    g2.clearRect(0, 0, innerWidth, innerHeight);
    if (S.net) for (const c of Object.values(D.conns)) stroke(poly(c.pts), c.color === "#3B7D23" ? "#3fae5acc" : "#5b8fb9cc", 1.4);
    const f = F(), cur = stepAt(S.t);
    for (const it of f.items) {
      if (!it.path) continue;
      const p = poly(it.path), col = MODE[it.s.mode], z = it.i < cur.i ? 1 : it.i > cur.i ? 0 : -1;
      if (z === 0) stroke(p, col + "50", 2.5);
      else if (z === 1) { stroke(p, col + "40", 9); stroke(p, col, 3.5); arrow(p[p.length - 2], p[p.length - 1], col, 12); }
      else {
        stroke(p, col + "50", 2.5);
        const u = clamp(lotPos(S.t).u, 0, 1), m = along(it.path, u), head = [...it.path.slice(0, m.i), [m.x, m.y]];
        if (it.s.lift) stroke([proj(W(E.low[0], E.low[1])), proj(lotWorld(S.t))], col, 5);
        else { const h = poly(head); stroke(h, col + "44", 13); stroke(h, col, 4.5); stroke(h, "#ffffffd0", 2, [7, 15], -time * 70); }
      }
    }
    if (S.pts.length) {
      const a = proj(S.pts[0]); g2.fillStyle = "#fff"; g2.beginPath(); g2.arc(a[0], a[1], 5, 0, 7); g2.fill();
      if (S.pts[1]) { const b = proj(S.pts[1]), m = S.pts[0].distanceTo(S.pts[1]) * PT_M, t = `${m.toFixed(1)} m`; stroke([a, b], "#fff", 2, [6, 5]); g2.beginPath(); g2.arc(b[0], b[1], 5, 0, 7); g2.fill(); g2.font = "bold 15px Segoe UI"; const w = g2.measureText(t).width + 14, x = (a[0] + b[0]) / 2 - w / 2, y = (a[1] + b[1]) / 2 - 12; g2.fillStyle = "#0b1220ee"; g2.fillRect(x, y, w, 24); g2.fillStyle = "#fff"; g2.fillText(t, x + 7, y + 17); }
    }
  }
  const chips = {}, labels = $("labels");
  for (const n of Object.values(D.nodes)) { const el = document.createElement("div"); el.className = "chip"; el.style.setProperty("--c", n.fill); el.innerHTML = `<span class="mk ${n.kind}"></span><span class="tx"></span>`; el.onclick = (e) => { e.stopPropagation(); pickNode(n); }; labels.append(el); chips[n.id] = { el, text: el.querySelector(".tx") }; }
  const floorTags = Object.entries(D.plates).map(([k, P]) => { const e = document.createElement("div"); e.className = "floor"; e.textContent = P.label; labels.append(e); return { e, P }; });
  let labelKey = "", labelUse = {};
  const nodes = Object.values(D.nodes);
  function placeLabels() {
    const f = F(), cur = stepAt(S.t), key = `${S.flow}/${cur.i}/${S.labels}/${S.net}`;
    if (key !== labelKey) {
      labelKey = key; labelUse = {};
      for (const it of f.items) if (!it.s.intro && (!labelUse[it.s.node] || it.i <= cur.i)) labelUse[it.s.node] = it;
      for (const n of nodes) {
        const chip = chips[n.id], it = labelUse[n.id];
        chip.el.className = "chip" + (it ? "" : " dim") + (it && S.labels ? " on" : "") + (it && it.i === cur.i ? " now" : it && it.i < cur.i ? " done" : "");
        if (it) chip.text.textContent = `${it.i}  ${it.s.title}`;
      }
    }
    for (const n of nodes) {
      const chip = chips[n.id], it = labelUse[n.id];
      if (!it && !S.net) { if (chip.display !== "none") { chip.el.style.display = chip.display = "none"; } continue; }
      const [x, y, z] = proj(W(n.x, n.y, S.stack, 3 + S.R * 16)), display = z < -1 || z > 1 || x < -100 || x > innerWidth + 100 || y < -100 || y > innerHeight + 100 ? "none" : "flex";
      if (display !== chip.display) chip.el.style.display = chip.display = display;
      if (display !== "none") { const transform = `translate(${(x - 9).toFixed(1)}px,${(y - 9).toFixed(1)}px)`; if (chip.transform !== transform) chip.el.style.transform = chip.transform = transform; }
    }
    for (const tag of floorTags) {
      const { e, P } = tag, display = S.labels ? "block" : "none"; if (tag.display !== display) e.style.display = tag.display = display;
      if (!S.labels) continue; const b = P.box, [x, y] = proj(W(b[0] + 2, b[1] + 2)), transform = `translate(${x.toFixed(1)}px,${(y - 12).toFixed(1)}px)`;
      if (tag.transform !== transform) e.style.transform = tag.transform = transform;
    }
  }
  function pickNode(n) { const it = F().items.find((i) => !i.s.intro && i.s.node === n.id); if (it) { seek(it.tm); pause(); } else tip(`${n.text || n.kind}: not in this flow`); }

  /* ---------- player UI ---------- */
  const scrub = $("scrub"), fill = scrub.querySelector(".fl"), hd = scrub.querySelector(".hd");
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  function renderFlow() {
    $("title").textContent = D.slide.title;
    $("flows").innerHTML = D.flows.map((f, i) => `<button data-f="${i}" class="${i === S.flow ? "on" : ""}">${f.name}</button>`).join("");
    $("flows").querySelectorAll("button").forEach((b) => (b.onclick = () => setFlow(+b.dataset.f)));
    const f = F(); scrub.querySelectorAll("i").forEach((e) => e.remove());
    f.items.forEach((it) => { const m = document.createElement("i"); m.style.left = (it.tm / f.total * 100) + "%"; scrub.append(m); });
    $("list").innerHTML = f.items.map((it) => `<li data-i="${it.i}"><span class="n">${it.s.intro ? "&#9733;" : it.i}</span><span><b>${it.s.title}</b><small>${it.s.intro ? "The replica rises out of the plan." : it.s.what}</small></span></li>`).join("");
    $("list").querySelectorAll("li").forEach((l) => (l.onclick = () => { const it = f.items[+l.dataset.i]; seek(it.tm); pause(); }));

  }
  let shown = -1;
  function renderStep() {
    const f = F(), cur = stepAt(S.t);
    const progress = (S.t / f.total * 100).toFixed(3) + "%", text = `${fmt(S.t)} / ${fmt(f.total)}  step ${cur.i}/${f.items.length - 1}`;
    if (renderStep.progress !== progress) { fill.style.width = hd.style.left = progress; renderStep.progress = progress; }
    if (renderStep.text !== text) { $("time").textContent = text; renderStep.text = text; }
    if (renderStep.playing !== S.playing) { $("play").textContent = S.playing ? "❚❚" : "▶"; renderStep.playing = S.playing; }
    if (shown !== cur.i) {
      shown = cur.i;
      $("list").querySelectorAll("li").forEach((l, i) => { l.className = i === cur.i ? "now" : i < cur.i ? "done" : ""; if (i === cur.i && S.panel && !document.body.classList.contains("bare")) l.scrollIntoView({ block: "nearest", behavior: "instant" }); });
      const stat = cur.s.intro ? "" : `<div class="st"><span>${cur.metres ? cur.metres.toFixed(0) + " m this step" : cur.s.lift ? "Between floors" : "At this point"}</span><span>${(cur.run || 0).toFixed(0)} m so far</span></div>`;
      $("card").innerHTML = `<b>${cur.s.intro ? "" : cur.i + ". "}${cur.s.title}</b><p>${cur.s.what}</p>${cur.s.intro ? "" : `<span class="m ${cur.s.mode}">${cur.s.mode === "auto" ? "Auto" : cur.s.lift ? "Elevator" : "Step"}</span>`}${stat}`;
    }
  }
  function seek(t) { S.t = clamp(t, 0, F().total); last = performance.now(); }
  function play() { if (S.t >= F().total) seek(0); S.playing = true; last = performance.now(); }
  function pause() { S.playing = false; }
  function stepBy(d) { const f = F(), c = stepAt(S.t), atEnd = S.t >= c.tm - .01, i = clamp(c.i + (d > 0 ? (atEnd ? 1 : 0) : (S.t > c.t0 + 1 && !atEnd ? 0 : -1)), 0, f.items.length - 1); seek(f.items[i].tm); pause(); }
  function setFlow(i) { S.flow = i; shown = -1; seek(0); pause(); renderFlow(); }
  function setView(v) { S.view = v; S.stackUser = null; $("views").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v)); if (S.cam === "free") setCam("guided"); }
  function setCam(c) { S.cam = c; $("cam").value = c; $("cam").querySelector('[value="free"]').hidden = c !== "free"; }
  function setPlan(p) { S.plan = p; $("planBtn").textContent = p === "replica" ? "Plan: replica" : "Plan: original"; }
  function tip(m) { const e = $("tip"); e.textContent = m; e.style.display = "block"; clearTimeout(tip.t); tip.t = setTimeout(() => (e.style.display = "none"), 1900); }
  function toFree() { if (S.cam !== "free") { setCam("free"); tip("Free camera: press G to go back to the guided camera"); } }
  function setMeasure(on) { S.measure = on; S.pts = []; $("measure").classList.toggle("on", on); if (on) tip("Measure: click two points on the floor"); }
  $("play").onclick = () => (S.playing ? pause() : play()); $("prev").onclick = () => stepBy(-1); $("next").onclick = () => stepBy(1); $("first").onclick = () => { seek(0); pause(); };
  $("speed").onchange = (e) => (S.speed = +e.target.value); $("stepstop").onchange = (e) => (S.stepStop = e.target.checked);
  $("views").querySelectorAll("button").forEach((b) => (b.onclick = () => setView(b.dataset.v)));
  $("cam").onchange = (e) => setCam(e.target.value); $("look").onchange = (e) => setLook(e.target.value); $("quality").onchange = (e) => setQuality(e.target.value);
  $("focusBtn").onclick = () => { S.focus = !S.focus; $("focusBtn").classList.toggle("on", S.focus); };
  $("soundBtn").onclick = () => { S.sound = !S.sound; $("soundBtn").classList.toggle("on", S.sound); if (S.sound) audio(); };
  $("planBtn").onclick = () => setPlan(S.plan === "replica" ? "original" : "replica"); $("measure").onclick = () => setMeasure(!S.measure);
  $("stack").oninput = (e) => (S.stackUser = e.target.value / 100);
  const tog = (id, k, fn) => { const f = () => { S[k] = !S[k]; $(id).classList.toggle("on", S[k]); fn && fn(); }; $(id).onclick = f; return f; };
  const tLbl = tog("lblBtn", "labels"), tNet = tog("netBtn", "net"), tPanel = tog("panelBtn", "panel", () => ($("steps").style.display = S.panel ? "" : "none"));
  $("optBtn").onclick = (e) => { e.stopPropagation(); const o = $("opts"); o.style.display = o.style.display === "flex" ? "none" : "flex"; $("optBtn").classList.toggle("on"); };
  $("zi").onclick = () => zoom(.8); $("zo").onclick = () => zoom(1.25);
  const toggleHelp = () => { const h = $("help"); h.style.display = h.style.display === "block" ? "none" : "block"; }; $("helpBtn").onclick = toggleHelp;
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()); $("full").onclick = fullscreen;
  function zoom(k) { toFree(); S.c.dist = clamp(S.c.dist * k, 30, 4000); }
  const scrubTo = (e) => { const r = scrub.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * F().total); };
  scrub.onpointerdown = (e) => { scrub.setPointerCapture(e.pointerId); scrubTo(e); pause(); scrub.onpointermove = scrubTo; }; scrub.onpointerup = () => (scrub.onpointermove = null);

  const stg = $("stage"); let drag = null;
  const hitFloor = (e) => { const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2), camera); return ray.intersectObjects(floors.map((f) => f.art), false)[0]; };
  stg.oncontextmenu = (e) => e.preventDefault();
  stg.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pan: e.button === 2 || e.shiftKey || S.c.pol < .05 }; stg.setPointerCapture(e.pointerId); stg.classList.add("drag"); };
  stg.onpointermove = (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (!dx && !dy) return; toFree();
    const c = S.c;
    if (drag.pan) { const k = c.dist * Math.tan((camera.fov * Math.PI) / 360) * 2 / innerHeight, r = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), f = new T.Vector3(Math.sin(c.az), 0, Math.cos(c.az)); c.x += (-dx * r.x + -dy * f.x) * k; c.z += (-dx * r.z + -dy * f.z) * k; }
    else { c.az -= dx * .006; c.pol = clamp(c.pol - dy * .005, .001, 1.5); }
  };
  stg.onpointerup = (e) => {
    const click = drag && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5; drag = null; stg.classList.remove("drag");
    if (click && S.measure) { const h = hitFloor(e); if (h) { if (S.pts.length === 2) S.pts = []; S.pts.push(h.point.clone()); } }
  };
  stg.onwheel = (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : .89); };
  stg.ondblclick = (e) => { if (S.measure) return; const hit = hitFloor(e); if (hit) { toFree(); Object.assign(S.c, { x: hit.point.x, y: hit.point.y, z: hit.point.z, dist: S.c.dist * .7 }); } };
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.ctrlKey || e.altKey) return; const k = e.key.toLowerCase();
    const act = { " ": () => (S.playing ? pause() : play()), arrowright: () => stepBy(1), arrowleft: () => stepBy(-1), home: () => { seek(0); pause(); }, end: () => { seek(F().total); pause(); }, 2: () => setView("2d"), 3: () => setView("3d"), a: () => setView("auto"), g: () => setCam("guided"), l: tLbl, n: tNet, p: tPanel, f: fullscreen, h: () => document.body.classList.toggle("bare"), "?": toggleHelp, "+": () => zoom(.8), "=": () => zoom(.8), "-": () => zoom(1.25), m: () => setMeasure(!S.measure), o: () => setPlan(S.plan === "replica" ? "original" : "replica"), escape: () => setMeasure(false),
      c: () => { const o = [...$("cam").options].filter((x) => !x.hidden).map((x) => x.value); setCam(o[(o.indexOf(S.cam) + 1) % o.length]); } }[k];
    if (act) { e.preventDefault(); act(); }
  });

  const mc = $("minic").getContext("2d");
  function drawMini() {
    const k = 420 / 960; mc.clearRect(0, 0, 420, 236);
    const p = lotPos(S.t), here = p.lift != null ? "E2-1F" : plateOf(p.x, p.y);
    for (const [key, P] of Object.entries(D.plates)) { const b = P.box; mc.fillStyle = key === here ? "#1f6feb" : "#ffffff26"; mc.fillRect(b[0] * k, b[1] * k - 30, b[2] * k, b[3] * k); mc.fillStyle = "#fff"; mc.font = "bold 18px Segoe UI"; mc.fillText(P.label, b[0] * k + 6, b[1] * k - 8); }
    const q = p.lift != null ? E.low : [p.x, p.y]; mc.fillStyle = "#ffc000"; mc.beginPath(); mc.arc(q[0] * k, q[1] * k - 30, 7, 0, 7); mc.fill();
  }

  /* ---------- sound: restrained, generated, off until asked for, and silent while scrubbing ---------- */
  let ac = null, master = null;
  function audio() { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .12; master.connect(ac.destination); } if (ac.state === "suspended") ac.resume(); }
  function tone(f, at, len, type = "sine") { const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + at; o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + .008); g.gain.exponentialRampToValueAtTime(.001, t0 + len); o.connect(g).connect(master); o.start(t0); o.stop(t0 + len + .02); }
  function sweep() { const n = ac.sampleRate * .9, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = b; f.type = "lowpass"; f.frequency.setValueAtTime(400, ac.currentTime); f.frequency.exponentialRampToValueAtTime(1600, ac.currentTime + .8); g.gain.value = .5; s.connect(f).connect(g).connect(master); s.start(); }
  let cueAt = -1;
  function cue(cur) { if (cur.i === cueAt) return; const first = cueAt === -1 || cur.i !== cueAt + 1; cueAt = cur.i; if (!S.sound || !S.playing || !ac || first && cur.i !== 0) return; if (cur.s.intro) sweep(); else if (cur.s.lift) { tone(440, 0, .09); tone(660, .09, .09); } else if (cur.i === F().items.length - 1) { tone(440, 0, .32); tone(550, .02, .32); tone(660, .04, .32); } else tone(660, 0, .07); }

  /* ---------- the frame ---------- */
  function resize() {
    const ratio = Math.min(devicePixelRatio, 1) * ({ high: 1, medium: .8, low: .65 }[S.quality]) * resolutionScale;
    renderer.setPixelRatio(ratio); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; frame.shift = -1; camera.updateProjectionMatrix();
    const d = Math.min(devicePixelRatio, 1), fw = Math.round(innerWidth * d), fh = Math.round(innerHeight * d); if (fx.width !== fw) fx.width = fw; if (fx.height !== fh) fx.height = fh; g2.setTransform(d, 0, 0, d, 0, 0);
    // Fixed 3/4-resolution night targets: quality switches allocate no post resources.
    if (composer && (composer.width !== innerWidth || composer.height !== innerHeight)) { composer.setPixelRatio(.75); composer.setSize(innerWidth, innerHeight); composer.width = innerWidth; composer.height = innerHeight; }
  }
  let resizePending = false;
  addEventListener("resize", () => { resizePending = true; });
  let last = performance.now(), slow = 0, governorHold = 3, lastR = -1, lastStack = -1, shadowSettled = 0, lastLiveTime = NaN, lastLiveShow = null;
  function tick(now) {
    const raw = Math.max(0, (now - last) / 1000); last = now;
    metrics.intervals[metrics.frames++ % metrics.intervals.length] = raw * 1000;
    if (resizePending) { resizePending = false; resize(); }
    frame(raw, S.t);
    // Reuse DFPerf's interval signal and hold period. Lower resolution within High;
    // never rebuild effects or silently overwrite a manually chosen quality.
    governorHold -= raw;
    if (!manualQuality && !document.hidden && raw < .25 && governorHold <= 0) {
      slow = raw > .028 ? slow + raw : Math.max(0, slow - raw);
      if (slow > 3 && resolutionScale > .8) { resolutionScale = Math.max(.8, resolutionScale - .1); resize(); slow = 0; governorHold = 5; }
    }
    requestAnimationFrame(tick);
  }
  function frame(dt, time) {
    const frameStart = profile ? performance.now() : 0;
    dt = Math.max(0, dt);
    if (S.playing) { const c = stepAt(S.t); let t = S.t + dt * S.speed; if (S.stepStop && S.t < c.tm && t >= c.tm) { t = c.tm; pause(); } S.t = Math.min(t, F().total); if (S.t >= F().total) pause(); }
    time = S.t; // every animated path is a deterministic function of story time
    const cur = stepAt(S.t), intro = cur.s.intro && S.view === "auto";
    const goalR = S.view === "2d" ? 0 : intro ? clamp((S.t - 1.6) / (INTRO - 2.4), 0, 1) : 1;
    S.R = intro ? goalR : S.R + clamp(goalR - S.R, -dt * .7, dt * .7);
    if (Math.abs(S.R - lastR) > 1e-4) { REP.rise(S.R); lastR = S.R; shadowDirty = true; }
    const goal = S.stackUser != null ? S.stackUser : S.view === "2d" ? 0 : S.view === "3d" ? 1 : cur.s.view === "3d" ? 1 : 0;
    S.stack = lerp(S.stack, goal, 1 - Math.exp(-dt * 3)); if (Math.abs(S.stack - goal) < .001) S.stack = goal;
    if (S.stackUser == null) { const value = String(Math.round(S.stack * 100)); if ($("stack").value !== value) $("stack").value = value; }
    if (Math.abs(S.stack - lastStack) > 1e-4) { lastStack = S.stack; shadowDirty = true; }
    for (const [k, g] of Object.entries(plates)) { const P = D.plates[k]; g.position.set(S.stack * P.dx, S.stack * P.lift * GAP, S.stack * P.dz); }
    deck.visible = S.stack > .3;
    const oo = S.plan === "original" ? 1 : intro ? 1 - clamp((S.t - .7) / 1.2, 0, 1) : 0;
    for (const m of origs) { m.material.opacity = oo; m.visible = oo > .01; }
    for (const m of gates) { const n = m.userData.n; m.position.copy(W(n.x, n.y, S.stack, 8)); m.scale.y = Math.max(.001, S.R); m.visible = S.R > .05 && S.stack > .05; }
    const lo = W(E.low[0], E.low[1]), hi = W(E.high[0], E.high[1]);
    shaft.visible = cabin.visible = S.stack > .1; shaft.position.copy(lo.clone().lerp(hi, .5)); shaft.scale.y = Math.max(1, hi.y - lo.y + 18);
    const lp = lotPos(S.t), at = lotWorld(S.t), li = F().items.findIndex((x) => x.s.lift);
    lot.position.copy(at).setY(at.y + S.R * 3); lot.visible = !cur.s.intro; if (cur.path && !cur.s.lift) {
      const duration = cur.tm - cur.t0, u = clamp((S.t - cur.t0) / duration, 0, 1), pad = Math.min(.15 / duration, .1);
      const a = along(cur.path, ease(clamp(u - pad, 0, 1))), b = along(cur.path, ease(clamp(u + pad, 0, 1)));
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-6) lot.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
    }
    cabin.position.copy(lp.lift != null ? at : lo).setY((lp.lift != null ? at.y : (li >= 0 && cur.i > li ? hi.y : lo.y)) - 2);
    beacon.visible = !cur.s.intro; beacon.position.copy(at).setY(at.y + 1.2); const pulse = (time * .8) % 1; beacon.scale.setScalar(.7 + pulse * 1.4); beacon.material.opacity = 1 - pulse;
    // focus: the plan with the lot stays bright, the others step back (colours stay, brightness falls)
    const here = lp.lift != null ? "E2" : plateOf(lp.x, lp.y);
    for (const fl of floors) { const on = !S.focus || cur.s.intro || S.R < .9 || S.cam === "overview" || fl.key === here || (here === "E2" && fl.key !== "E1"); const target = on ? 1 : .42; fl.k = lerp(fl.k ?? 1, target, 1 - Math.exp(-dt * 6)); if (Math.abs(fl.k - target) < .001) fl.k = target;
      if (fl.lastDim == null || Math.abs(fl.k - fl.lastDim) > .001 || fl.k === target && fl.lastDim !== target) { REP.dim(fl.key, fl.k); fl.planMaterial.color.setRGB(.79 * fl.k, .81 * fl.k, .84 * fl.k); fl.surfaceMaterial.color.setHex(0xc3c7c4).multiplyScalar(fl.k); fl.lastDim = fl.k; metrics.dimUpdates++; }
      const material = S.R > .85 && S.plan !== "original" ? fl.surfaceMaterial : fl.planMaterial; if (fl.art.material !== material) fl.art.material = material; }
    cue(cur);
    if (lastLiveTime !== time || lastLiveShow !== (S.R > .92)) {
      REP.live(time * .55, S.R, dt * .55);
      // Route tangent averaged over a short physical distance: stable at corners and on seek.
      for (const m of REP.movers) {
        if (!m.L || !m.seg.length) continue;
        const distance = (time * .55 * m.speed + m.off) % m.L, pad = Math.min(m.L / 8, m.speed * .55 * .25);
        const sample = d => { d = clamp(d, 0, m.L); for (const seg of m.seg) { if (d <= seg.l) { const k = seg.l ? d / seg.l : 0; return [lerp(seg.a[0], seg.b[0], k), lerp(seg.a[1], seg.b[1], k)]; } d -= seg.l; } return m.seg[m.seg.length - 1].b; };
        const a = sample(distance - pad), b = sample(distance + pad); m.heading = Math.atan2(b[0] - a[0], b[1] - a[1]); m.v.rotation.y = m.heading;
      }
      lastLiveTime = time; lastLiveShow = S.R > .92;
    }
    if (S.look === "night") atmos?.update(time, camera, innerHeight);
    stage("scene-update", frameStart);
    const cameraStart = profile ? performance.now() : 0;
    setWant(time); moveCam(dt);
    const shift = S.panel && !document.body.classList.contains("bare") ? 150 : 0;
    if (shift !== frame.shift) { frame.shift = shift; camera.setViewOffset(innerWidth, innerHeight, shift, 0, innerWidth, innerHeight); }
    stage("camera", cameraStart);
    // Bake/static shadows only. Optional sun shadow refresh waits for the final pose.
    const settled = Math.abs(S.R - goalR) < 1e-4 && (S.R < .001 || S.R > .999) && S.stack === goal;
    shadowSettled = settled ? shadowSettled + dt : 0;
    if (realtimeShadows && shadowDirty && shadowSettled > .15) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; metrics.shadows++; }
    const renderStart = profile ? performance.now() : 0;
    if (composer && S.look === "night" && S.quality !== "low") composer.render(dt); else renderer.render(scene, camera);
    stage("render-submit", renderStart);
    const overlayStart = profile ? performance.now() : 0;
    draw(time); placeLabels(); renderStep();
    if (drawMini.last == null || drawMini.flow !== S.flow || Math.abs(time - drawMini.last) >= .1) { drawMini(); drawMini.last = time; drawMini.flow = S.flow; }
    stage("overlay-dom", overlayStart);
  }
  prepareArt(); buildPost(); renderFlow(); resize(); setLook("studio"); $("quality").value = S.quality; S.c.dist = want.dist = fit(); setCam("guided");
  window.MF = { S, D, REP, W, proj, seek, play, pause, stepBy, setFlow, setView, setCam, setLook, setPlan, setMeasure, setQuality, setFloorLight, stepAt, frame, want, perf: metrics };   // used by the tests
  metrics.reset = () => { metrics.frames = 0; metrics.intervals.fill(0); metrics.stages = {}; };
  metrics.snapshot = () => {
    const frames = Math.min(metrics.frames, metrics.intervals.length), a = Array.from(metrics.intervals.subarray(0, frames)).sort((a, b) => a - b);
    return { frames, quality: S.quality, pixelRatio: renderer.getPixelRatio(), p50: a[Math.floor(frames * .5)] ?? 0, p99: a[Math.min(frames - 1, Math.floor(frames * .99))] ?? 0, worst: a[frames - 1] ?? 0, over250: a.filter(ms => ms > 250).length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0, stages: metrics.stages };
  };
  // Prewarm all look/material variants offscreen before releasing the story clock.
  MF.ready = (async () => {
    const start = performance.now(), target = new T.WebGLRenderTarget(32, 32), visible = [];
    try {
      await Promise.all(originalLoads); await trolleyReady;
      // everything that will ever appear is loaded BEFORE the warm-up, so the first draw of each thing never stalls the story
      for (const [key, source] of Object.entries(window.MF_FLOOR_LIGHT || {})) await setFloorLight(key, source);
      for (const m of origs) renderer.initTexture(m.material.map);
      scene.traverse(o => { if (o.isMesh || o.isPoints) { visible.push([o, o.visible]); o.visible = true; } });
      for (const tex of window.MFLook.textures(T)) renderer.initTexture(tex);
      const savedTarget = renderer.getRenderTarget();
      for (const look of ["studio", "night", "blueprint"]) {
        setLook(look);
        for (const surface of [false, true]) {
          for (const f of floors) f.art.material = surface ? f.surfaceMaterial : f.planMaterial;
          if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);
          renderer.setRenderTarget(target); renderer.render(scene, camera);
        }
      }
      // Warm the bloom/output full-screen shaders using tiny targets, then resize once.
      setLook("night"); composer.setPixelRatio(1); composer.setSize(32, 32); composer.render(0); composer.width = composer.height = 0; renderer.setRenderTarget(savedTarget);
    } catch (e) { console.error("Material Flow warm-up failed", e); fail("The 3D materials could not start. " + e.message); throw e; }
    finally { target.dispose(); for (const [o, show] of visible) o.visible = show; setLook("studio"); for (const f of floors) f.art.material = f.planMaterial; resize(); }
    // Initial camera is already at the flat plan, not travelling from the origin.
    cameraTarget.set(0, 0, 0); camera.position.set(0, S.c.dist, S.c.dist * .001); camera.lookAt(cameraTarget); camera.updateMatrixWorld();
    event("startup-warmup", start); last = performance.now(); requestAnimationFrame(tick);
  })();
})();
