/* Material Flow Player: one scene, full control. Everything on screen is a function of (flow, time, view, camera):
   the timeline can jump anywhere, and the viewer can leave the guided camera at any moment and keep playing.
   Slide coordinates (960 x 540) are kept all the way, 1 point = 0.30 m. Each plan is a plate that can move and rise:
   stack 0 = the slide layout, 1 = floors stacked. R is how far the factory has risen out of the flat plan (0 = 2D, 1 = 3D). */
"use strict";
(function () {
  const D = window.MF_DATA, RP = window.MF_REPLICA, T = window.THREE, $ = (id) => document.getElementById(id);
  function fail(m) { const e = $("err"); e.style.display = "grid"; e.textContent = m; }
  if (!T) { fail("The 3D library did not load."); return; }
  const CX = 480, CY = 290, GAP = 120, DWELL = 1.8, SPEED = 8, INTRO = 7, PT_M = RP.scale;
  const plateOf = (x, y) => (x < 553 ? "E1" : y >= 303 ? "E2-1F" : "E2-2F");
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);
  const query = new URLSearchParams(location.search);

  /* ---------- state ---------- */
  const S = { flow: 0, t: 0, playing: false, speed: 1, view: "auto", cam: "guided", stack: 0, stackUser: null, labels: true, net: false, panel: true, stepStop: false, R: 0, focus: true, sound: false, plan: "replica", look: "studio", quality: ["high", "medium", "low"].includes(query.get("q")) ? query.get("q") : "high", measure: false, pts: [],
    c: { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: 0.001 } };
  const want = { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: 0.001 };

  const metrics = { frames: 0, intervals: new Float32Array(600), events: [], shadows: 0, riseUpdates: 0, dimUpdates: 0, stages: {} };
  metrics.slowFrames = Array.from({ length: 128 }, () => ({ t: 0, end: 0, ms: 0, cpu: 0, step: 0, mask: 0, programs: 0, textures: 0, heap: 0 }));
  metrics.slowCount = 0; metrics.lastMask = 0; metrics.lastCPU = 0;
  metrics.maskNames = { step: 1, surface: 2, replica: 4, movers: 8, stackObjects: 16 };
  const profile = query.has("profile");
  function event(name, start) { metrics.events.push({ name, ms: +(performance.now() - start).toFixed(2) }); if (metrics.events.length > 80) metrics.events.shift(); }
  function stage(name, start) { if (!profile) return; const ms = performance.now() - start, v = metrics.stages[name] || (metrics.stages[name] = { calls: 0, total: 0, max: 0 }); v.calls++; v.total += ms; v.max = Math.max(v.max, ms); }
  const realtimeShadows = query.get("shadows") === "1";
  let manualQuality = query.has("q"), resolutionScale = 1;
  /* ---------- renderer and light ---------- */
  function W(x, y, s = S.stack, up = 0.8, out = new T.Vector3()) { const P = D.plates[plateOf(x, y)]; return out.set(x - CX + s * P.dx, s * P.lift * GAP + up, y - CY + s * P.dz); }
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
  const plateEntries = Object.entries(D.plates);
  for (const [key, P] of plateEntries) {
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
  let replicaVisible = null;
  REP.rise = value => {
    riseUniform.value = value; const show = value > .004;
    if (replicaVisible !== show) { replicaVisible = show; for (let i = 0; i < REP.meshes.length; i++) REP.meshes[i].im.visible = show; }
    metrics.riseUpdates++;
  };
  for (const fl of floors) {
    fl.dimMaterials = [];
    for (const { im } of REP.meshes) if (im.material.userData.dim && im.material.userData.plate === fl.key && !fl.dimMaterials.includes(im.material)) fl.dimMaterials.push(im.material);
  }
  // Geometry remains replica-owned. Pair its live conveyor instances with the existing
  // route metadata once, so runtime animation need not call the allocating REP.live().
  // Let replica initialise its own scales, rotations and heights once; the player
  // subsequently changes only route translation and visibility.
  REP.live(0, 1, 0);
  const animatedLines = [], liveA = { x: 0, y: 0 }, liveB = { x: 0, y: 0 }, livePoint = { x: 0, y: 0 };
  let liveMappingOK = true;
  for (const [key, group] of Object.entries(plates)) {
    const instances = group.children.filter(o => o.isInstancedMesh && !o.userData.replica);
    const routes = RP.conveyors.filter(r => r.plate === key);
    if (instances.length !== routes.length) { liveMappingOK = false; break; }
    for (let n = 0; n < routes.length; n++) {
      const pts = routes[n].pts, seg = []; let length = 0;
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); length += l; seg.push({ a, b, l }); }
      const im = instances[n]; if (im.count !== Math.floor(length / (4.5 * REP.M))) { liveMappingOK = false; break; }
      im.instanceMatrix.setUsage(T.DynamicDrawUsage);
      animatedLines.push({ im, seg, L: length });
    }
  }
  function sampleSegments(seg, distance, out) {
    for (let i = 0; i < seg.length; i++) { const v = seg[i]; if (distance <= v.l || i === seg.length - 1) { const k = v.l ? clamp(distance / v.l, 0, 1) : 0; out.x = lerp(v.a[0], v.b[0], k); out.y = lerp(v.a[1], v.b[1], k); return out; } distance -= v.l; }
    out.x = out.y = 0; return out;
  }
  metrics.liveFallback = !liveMappingOK;
  if (liveMappingOK) REP.live = (time, rise) => {
    const show = rise > .92;
    for (let n = 0; n < REP.movers.length; n++) {
      const m = REP.movers[n]; m.v.visible = show; if (!show || !m.L || !m.seg.length) continue;
      const distance = (time * m.speed + m.off) % m.L, pad = Math.min(m.L / 8, m.speed * .55 * .25);
      sampleSegments(m.seg, distance, livePoint); m.v.position.set(livePoint.x - CX, .1, livePoint.y - CY);
      sampleSegments(m.seg, Math.max(0, distance - pad), liveA); sampleSegments(m.seg, Math.min(m.L, distance + pad), liveB);
      m.heading = Math.atan2(liveB.x - liveA.x, liveB.y - liveA.y); m.v.rotation.y = m.heading;
    }
    for (let n = 0; n < animatedLines.length; n++) {
      const line = animatedLines[n], im = line.im; im.visible = show; if (!show || !line.L) continue;
      const matrices = im.instanceMatrix.array;
      for (let i = 0; i < im.count; i++) { sampleSegments(line.seg, (i / im.count * line.L + time * 1.1 * REP.M) % line.L, livePoint); const o = i * 16; matrices[o + 12] = livePoint.x - CX; matrices[o + 14] = livePoint.y - CY; }
      im.instanceMatrix.needsUpdate = true;
    }
  };
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
    if (fl.lightSource === source && fl.lightPromise) return fl.lightPromise;
    fl.lightSource = source; const request = fl.lightRequest = (fl.lightRequest || 0) + 1;
    function apply(tex, owned) {
      if (request !== fl.lightRequest) { if (owned) tex.dispose(); return tex; }
      if (owned) tex.colorSpace = T.SRGBColorSpace;
      if (fl.loadedLight && fl.loadedLight !== tex) fl.loadedLight.dispose();
      fl.loadedLight = owned ? tex : null; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); renderer.initTexture(tex);
      fl.surfaceMaterial.userData.floorLight.value = tex; return tex;
    }
    fl.lightPromise = source?.isTexture ? Promise.resolve(apply(source, false)) : new Promise((resolve, reject) => loader.load(source, tex => resolve(apply(tex, true)), undefined, error => { if (request === fl.lightRequest) fl.lightPromise = null; reject(error); }));
    return fl.lightPromise;
  }
  // the deck that carries E2-2F out to To LCM, and solid destination blocks (schematic)
  const deck = new T.Group(); plates["E2-2F"].add(deck);
  for (const f of D.flows) for (const s of f.steps) if (s.title === "To LCM") for (let i = 1; i < s.path.length; i++) { const a = s.path[i - 1], b = s.path[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 9; if (a[0] > 726 && b[0] > 726) continue; const m = new T.Mesh(new T.BoxGeometry(len, 3, 9), new T.MeshStandardMaterial({ color: 0x41506e, roughness: .6, metalness: .3 })); m.position.set((a[0] + b[0]) / 2 - CX, -1.5, (a[1] + b[1]) / 2 - CY); m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); m.castShadow = true; deck.add(m); }
  const gates = Object.values(D.nodes).filter((n) => n.kind === "dest" && n.text !== "Elev 5 2F").map((n) => { const m = new T.Mesh(new T.BoxGeometry(24, 16, 24), new T.MeshStandardMaterial({ color: 0x156082, roughness: .4, metalness: .2 })); m.castShadow = true; m.userData.n = n; scene.add(m); return m; });
  const E = D.elevator, shaft = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(30, 1, 30)), new T.LineBasicMaterial({ color: 0xffc000 })); scene.add(shaft);
  const cabin = new T.Mesh(new T.BoxGeometry(19, 1.6, 19), new T.MeshStandardMaterial({ color: 0xffc000, metalness: .4, roughness: .4 })); cabin.castShadow = true; scene.add(cabin);
  const lot = new T.Group(); let trolleyReady;
  { // the hero: Blender's trolley with rear covers, 1.4x real size so it stays readable, on a soft contact shadow
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 8, 64, 64, 62); r.addColorStop(0, "rgba(10,14,24,.62)"); r.addColorStop(.6, "rgba(10,14,24,.3)"); r.addColorStop(1, "rgba(10,14,24,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const blob = new T.Mesh(new T.PlaneGeometry(18, 22).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false })); blob.position.y = .35; lot.add(blob);
    const bytes = Uint8Array.from(atob(window.MF_TROLLEY), (ch) => ch.charCodeAt(0));
    trolleyReady = new Promise((ok, no) => new T.X.GLTFLoader().parse(bytes.buffer, "", (gl) => { gl.scene.scale.setScalar(1.9 / PT_M); lot.add(gl.scene); ok(); }, (e) => { fail("The trolley model could not load: " + e.message); no(e); })); }
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
  const pathCache = new WeakMap();
  function pathInfo(path) {
    let info = pathCache.get(path); if (info) return info;
    const cumulative = new Float64Array(path.length), projected = [], head = []; let length = 0;
    for (let i = 0; i < path.length; i++) { if (i) length += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); cumulative[i] = length; projected.push([0, 0, 0]); head.push([0, 0, 0]); }
    info = { length, cumulative, projected, head }; pathCache.set(path, info); return info;
  }
  const pl = path => pathInfo(path).length;
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
  for (const flow of D.flows) for (const it of flow.items) if (it.path) pathInfo(it.path);
  const liftIndices = D.flows.map(f => f.items.findIndex(it => it.s.lift)), plateEntriesForGroups = Object.entries(plates);
  metrics.timeline = D.flows.map(f => f.items.map(it => ({ i: it.i, t0: it.t0, tm: it.tm, t1: it.t1, view: it.s.view })));
  const F = () => D.flows[S.flow];
  const stepAt = t => { const items = F().items; for (let i = 0; i < items.length; i++) if (t < items[i].t1) return items[i]; return items[items.length - 1]; };
  function along(path, u, out) {
    const info = pathInfo(path), d = u * info.length;
    for (let i = 1; i < path.length; i++) { if (d <= info.cumulative[i] || i === path.length - 1) { const a = path[i - 1], b = path[i], l = info.cumulative[i] - info.cumulative[i - 1], k = l ? clamp((d - info.cumulative[i - 1]) / l, 0, 1) : 0; out.x = lerp(a[0], b[0], k); out.y = lerp(a[1], b[1], k); out.i = i; return out; } }
    out.x = path[0][0]; out.y = path[0][1]; out.i = 1; return out;
  }
  const worldSample = { x: 0, y: 0, i: 1, u: 0, lift: null, it: null }, frameLot = { ...worldSample }, headingA = { x: 0, y: 0, i: 1 }, headingB = { ...headingA }, pathHead = { ...headingA };
  const worldHigh = new T.Vector3(), lotPoint = new T.Vector3(), liftLow = new T.Vector3(), liftHigh = new T.Vector3(), cameraPoint = new T.Vector3(), cameraAhead = new T.Vector3();
  function lotPos(t, out) {
    const it = stepAt(t), n = D.nodes[it.s.node]; out.it = it; out.lift = null;
    if (!it.path) { out.x = n.x; out.y = n.y; out.u = 1; out.i = 1; return out; }
    const u = ease(clamp((t - it.t0) / Math.max(.001, it.tm - it.t0), 0, 1)); out.u = u;
    if (it.s.lift) { out.lift = u; return out; }
    return along(it.path, u, out);
  }
  function worldFromLot(p, stack, out) {
    if (p.lift == null) return W(p.x, p.y, stack, .8, out);
    return W(E.low[0], E.low[1], stack, .8, out).lerp(W(E.high[0], E.high[1], stack, .8, worldHigh), p.lift);
  }
  function lotWorld(t, stack, out) { return worldFromLot(lotPos(t, worldSample), stack, out); }

  /* ---------- camera ---------- */
  const fit = () => { const a = camera.aspect, f = Math.tan((camera.fov * Math.PI) / 360); return Math.max(330 / f, 560 / (f * a)); };
  const flat = () => S.view === "2d";
  const PRESET = {
    e1: [285, 330, 640, -.4, .9], e21: [730, 373, 520, .35, .95], e22: [835, 223, 420, -.5, 1],
    elev: [E.low[0], E.low[1], 340, -.9, 1.15], machines: [75, 215, 300, -1.05, 1.16], docks: [290, 440, 340, .55, 1.2], racks: [320, 330, 300, -.25, 1.25]
  };
  function aim(x, y, z, dist, az, pol) { want.x = x; want.y = y; want.z = z; want.dist = dist; want.az = az; want.pol = pol; }
  function setWant() {
    if (S.cam === "free") return;
    const cur = stepAt(S.t);
    if (S.cam === "guided" || S.cam === "follow") {
      if (S.cam === "guided" && cur.s.intro) { const e = ease(S.R); aim(0, 0, 0, fit() * lerp(1, .9, e), lerp(0, -.5, e), lerp(.001, 1, e)); return; }
      const p = lotWorld(S.t, S.stack, cameraPoint), d = S.cam === "follow" ? 300 : cur.s.dist * (S.stack > .5 ? 1.05 : 1.2);
      aim(p.x, p.y, p.z, flat() ? d * 1.5 : d, flat() ? 0 : -.55, flat() ? .001 : .94);
    } else if (S.cam === "forklift") {
      const m = REP.movers[0]; if (!m) return; const p = m.v.getWorldPosition(cameraPoint); aim(p.x, p.y + 12, p.z, 92, m.heading + Math.PI, 1.28);
    } else if (S.cam === "chase") {
      const p = lotWorld(S.t, S.stack, cameraPoint), q = lotWorld(Math.min(F().total, S.t + .3), S.stack, cameraAhead), dir = Math.atan2(q.x - p.x, q.z - p.z);
      aim(p.x, p.y + 8, p.z, 120, q.distanceToSquared(p) > .0025 ? dir + Math.PI : S.c.az, 1.3);
    } else if (S.cam === "overview" || S.cam === "iso") {
      const iso = S.cam === "iso"; aim(0, iso ? 30 : 0, 0, fit() * (iso ? 1.05 : .95), flat() ? 0 : iso ? -.785 : -.55, flat() ? .001 : iso ? .96 : 1);
    } else {
      const r = PRESET[S.cam]; if (!r) return; const p = W(r[0], r[1], S.stack, .8, cameraPoint); if (S.cam === "elev") p.y += S.stack * GAP / 2;
      aim(p.x, p.y, p.z, r[2], flat() ? 0 : r[3], flat() ? .001 : r[4]);
    }
  }
  // Exact critically damped springs, separately for the eye and the look target.
  const eyeVelocity = new T.Vector3(), targetVelocity = new T.Vector3(), cameraTarget = new T.Vector3(), desiredEye = new T.Vector3(), desiredTarget = new T.Vector3();
  const AXES = ["x", "y", "z"];
  function spring(point, velocity, goal, omega, dt) {
    const decay = Math.exp(-omega * dt);
    for (let i = 0; i < AXES.length; i++) { const axis = AXES[i]; const delta = point[axis] - goal[axis], j = velocity[axis] + omega * delta; point[axis] = goal[axis] + (delta + j * dt) * decay; velocity[axis] = (velocity[axis] - omega * j * dt) * decay; }
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
  const projectionPoint = new T.Vector3(), overlayWorld = new T.Vector3(), liftPoints = [[0, 0, 0], [0, 0, 0]], measureA = [0, 0, 0], measureB = [0, 0, 0];
  const NO_DASH = [], FLOW_DASH = [7, 15], MEASURE_DASH = [6, 5], connections = Object.values(D.conns);
  for (const connection of connections) pathInfo(connection.pts);
  function proj(v, out = [0, 0, 0]) { projectionPoint.copy(v).project(camera); out[0] = (projectionPoint.x + 1) * .5 * innerWidth; out[1] = (1 - projectionPoint.y) * .5 * innerHeight; out[2] = projectionPoint.z; return out; }
  function poly(path) { const pts = pathInfo(path).projected; for (let i = 0; i < path.length; i++) proj(W(path[i][0], path[i][1], S.stack, S.R * 1.5 + .8, overlayWorld), pts[i]); return pts; }
  function stroke(pts, color, w, dash = NO_DASH, off = 0, count = pts.length) {
    if (count < 2) return; g2.beginPath(); g2.setLineDash(dash); g2.lineDashOffset = off; g2.strokeStyle = color; g2.lineWidth = w; g2.lineJoin = "round"; g2.lineCap = "round";
    g2.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < count; i++) g2.lineTo(pts[i][0], pts[i][1]); g2.stroke(); g2.setLineDash(NO_DASH);
  }
  function arrow(a, b, color, size) { const r = Math.atan2(b[1] - a[1], b[0] - a[0]); g2.fillStyle = color; g2.beginPath(); g2.moveTo(b[0], b[1]); g2.lineTo(b[0] - size * Math.cos(r - .45), b[1] - size * Math.sin(r - .45)); g2.lineTo(b[0] - size * Math.cos(r + .45), b[1] - size * Math.sin(r + .45)); g2.fill(); }
  const MODE = {};
  for (const [name, color] of Object.entries({ auto: "#ffc000", manual: "#ff5a4f", flow: "#35c6ff" })) MODE[name] = { color, faint: color + "50", past: color + "40", head: color + "44" };
  let measuredMetres = NaN, measurementText = "", measurementWidth = 0;
  function draw(time) {
    g2.clearRect(0, 0, innerWidth, innerHeight);
    if (S.net) for (let i = 0; i < connections.length; i++) { const c = connections[i]; stroke(poly(c.pts), c.color === "#3B7D23" ? "#3fae5acc" : "#5b8fb9cc", 1.4); }
    const f = F(), cur = frameLot.it;
    for (let n = 0; n < f.items.length; n++) {
      const it = f.items[n]; if (!it.path) continue;
      const p = poly(it.path), col = MODE[it.s.mode];
      if (it.i > cur.i) stroke(p, col.faint, 2.5);
      else if (it.i < cur.i) { stroke(p, col.past, 9); stroke(p, col.color, 3.5); if (p.length > 1) arrow(p[p.length - 2], p[p.length - 1], col.color, 12); }
      else {
        stroke(p, col.faint, 2.5);
        if (it.s.lift) { proj(W(E.low[0], E.low[1], S.stack, .8, overlayWorld), liftPoints[0]); proj(lotPoint, liftPoints[1]); stroke(liftPoints, col.color, 5); }
        else {
          const m = along(it.path, frameLot.u, pathHead), head = pathInfo(it.path).head;
          for (let i = 0; i < m.i; i++) { head[i][0] = p[i][0]; head[i][1] = p[i][1]; head[i][2] = p[i][2]; }
          proj(W(m.x, m.y, S.stack, S.R * 1.5 + .8, overlayWorld), head[m.i]);
          stroke(head, col.head, 13, NO_DASH, 0, m.i + 1); stroke(head, col.color, 4.5, NO_DASH, 0, m.i + 1); stroke(head, "#ffffffd0", 2, FLOW_DASH, -time * 70, m.i + 1);
        }
      }
    }
    if (S.pts.length) {
      const a = proj(S.pts[0], measureA); g2.fillStyle = "#fff"; g2.beginPath(); g2.arc(a[0], a[1], 5, 0, 7); g2.fill();
      if (S.pts[1]) {
        const b = proj(S.pts[1], measureB), metres = S.pts[0].distanceTo(S.pts[1]) * PT_M;
        if (metres !== measuredMetres) { measuredMetres = metres; measurementText = metres.toFixed(1) + " m"; g2.font = "bold 15px Segoe UI"; measurementWidth = g2.measureText(measurementText).width + 14; }
        liftPoints[0][0] = a[0]; liftPoints[0][1] = a[1]; liftPoints[1][0] = b[0]; liftPoints[1][1] = b[1]; stroke(liftPoints, "#fff", 2, MEASURE_DASH);
        g2.beginPath(); g2.arc(b[0], b[1], 5, 0, 7); g2.fill(); g2.font = "bold 15px Segoe UI";
        const x = (a[0] + b[0]) * .5 - measurementWidth * .5, y = (a[1] + b[1]) * .5 - 12; g2.fillStyle = "#0b1220ee"; g2.fillRect(x, y, measurementWidth, 24); g2.fillStyle = "#fff"; g2.fillText(measurementText, x + 7, y + 17);
      }
    }
  }
  const chips = {}, labels = $("labels"), nodes = Object.values(D.nodes), chipList = [];
  labels.style.contain = "layout style";
  for (const n of nodes) {
    const el = document.createElement("div"); el.className = "chip"; el.style.setProperty("--c", n.fill); el.innerHTML = `<span class="mk ${n.kind}"></span><span class="tx"></span>`;
    el.onclick = e => { e.stopPropagation(); pickNode(n); }; labels.append(el);
    const chip = { el, text: el.querySelector(".tx"), point: [0, 0, 0], px: NaN, py: NaN }; chips[n.id] = chip; chipList.push(chip);
  }
  const floorTags = plateEntries.map(([k, P]) => { const e = document.createElement("div"); e.className = "floor"; e.textContent = P.label; labels.append(e); return { e, P, point: [0, 0, 0], px: NaN, py: NaN }; });
  const labelStates = D.flows.map(f => f.items.map(cur => {
    const use = {};
    for (const it of f.items) if (!it.s.intro && (!use[it.s.node] || it.i <= cur.i)) use[it.s.node] = it;
    return nodes.map(n => { const it = use[n.id], base = "chip" + (it ? "" : " dim"), suffix = it && it.i === cur.i ? " now" : it && it.i < cur.i ? " done" : ""; return { it, off: base + suffix, on: base + (it ? " on" : "") + suffix, text: it ? `${it.i}  ${it.s.title}` : "" }; });
  }));
  let labelFlow = -1, labelStep = -1, labelLabels = null, labelState = null;
  function placeLabels() {
    const cur = frameLot.it;
    if (labelFlow !== S.flow || labelStep !== cur.i || labelLabels !== S.labels) {
      labelFlow = S.flow; labelStep = cur.i; labelLabels = S.labels; labelState = labelStates[S.flow][cur.i];
      for (let i = 0; i < chipList.length; i++) { const chip = chipList[i], state = labelState[i]; chip.el.className = S.labels ? state.on : state.off; if (chip.title !== state.text) { chip.text.textContent = chip.title = state.text; } }
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], chip = chipList[i];
      if (!labelState[i].it && !S.net) { if (chip.display !== "none") chip.el.style.display = chip.display = "none"; continue; }
      const p = proj(W(n.x, n.y, S.stack, 3 + S.R * 16, overlayWorld), chip.point), x = p[0], y = p[1], z = p[2];
      const display = z < -1 || z > 1 || x < -100 || x > innerWidth + 100 || y < -100 || y > innerHeight + 100 ? "none" : "flex";
      if (display !== chip.display) chip.el.style.display = chip.display = display;
      if (display !== "none") { const px = Math.round((x - 9) * 4) / 4, py = Math.round((y - 9) * 4) / 4; if (chip.px !== px || chip.py !== py) { chip.px = px; chip.py = py; chip.el.style.transform = `translate(${px}px,${py}px)`; } }
    }
    for (let i = 0; i < floorTags.length; i++) {
      const tag = floorTags[i], display = S.labels ? "block" : "none"; if (tag.display !== display) tag.e.style.display = tag.display = display; if (!S.labels) continue;
      const b = tag.P.box, p = proj(W(b[0] + 2, b[1] + 2, S.stack, .8, overlayWorld), tag.point), px = Math.round(p[0] * 4) / 4, py = Math.round((p[1] - 12) * 4) / 4;
      if (tag.px !== px || tag.py !== py) { tag.px = px; tag.py = py; tag.e.style.transform = `translate(${px}px,${py}px)`; }
    }
  }
  function pickNode(n) { const it = F().items.find((i) => !i.s.intro && i.s.node === n.id); if (it) { seek(it.tm); pause(); } else tip(`${n.text || n.kind}: not in this flow`); }

  /* ---------- player UI ---------- */
  const scrub = $("scrub"), fill = scrub.querySelector(".fl"), hd = scrub.querySelector(".hd");
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const card = $("card"), stepPanel = $("steps"), list = $("list"), timeLabel = $("time"), playButton = $("play"), stackControl = $("stack");
  card.style.contain = stepPanel.style.contain = "layout paint";
  const cardCache = D.flows.map(f => f.items.map(cur => {
    const e = document.createElement("div"); e.style.display = "none";
    const stat = cur.s.intro ? "" : `<div class="st"><span>${cur.metres ? cur.metres.toFixed(0) + " m this step" : cur.s.lift ? "Between floors" : "At this point"}</span><span>${(cur.run || 0).toFixed(0)} m so far</span></div>`;
    e.innerHTML = `<b>${cur.s.intro ? "" : cur.i + ". "}${cur.s.title}</b><p>${cur.s.what}</p>${cur.s.intro ? "" : `<span class="m ${cur.s.mode}">${cur.s.mode === "auto" ? "Auto" : cur.s.lift ? "Elevator" : "Step"}</span>`}${stat}`;
    return e;
  }));
  let stepRows = [], stepTop = [], stepBottom = [], panelHeight = 0, panelScroll = 0, shown = -1, shownCard = null;
  stepPanel.addEventListener("scroll", () => { panelScroll = stepPanel.scrollTop; }, { passive: true });
  function cacheStepLayout() { panelHeight = stepPanel.clientHeight; panelScroll = stepPanel.scrollTop; for (let i = 0; i < stepRows.length; i++) { stepTop[i] = stepRows[i].offsetTop; stepBottom[i] = stepTop[i] + stepRows[i].offsetHeight; } }
  function renderFlow() {
    $("title").textContent = D.slide.title;
    $("flows").innerHTML = D.flows.map((f, i) => `<button data-f="${i}" class="${i === S.flow ? "on" : ""}">${f.name}</button>`).join("");
    $("flows").querySelectorAll("button").forEach(b => b.onclick = () => setFlow(+b.dataset.f));
    const f = F(); scrub.querySelectorAll("i").forEach(e => e.remove());
    f.items.forEach(it => { const m = document.createElement("i"); m.style.left = it.tm / f.total * 100 + "%"; scrub.append(m); });
    list.innerHTML = f.items.map(it => `<li data-i="${it.i}"><span class="n">${it.s.intro ? "&#9733;" : it.i}</span><span><b>${it.s.title}</b><small>${it.s.intro ? "The replica rises out of the plan." : it.s.what}</small></span></li>`).join("");
    stepRows = Array.from(list.querySelectorAll("li")); stepTop = new Array(stepRows.length); stepBottom = new Array(stepRows.length);
    stepRows.forEach((row, i) => row.onclick = () => { seek(f.items[i].tm); pause(); });
    if (shownCard) shownCard.style.display = "none"; shownCard = null; shown = -1; card.replaceChildren(...cardCache[S.flow]); cacheStepLayout();
  }
  function renderStep() {
    const f = F(), cur = frameLot.it, progress = Math.round(S.t / f.total * 10000), seconds = Math.floor(S.t);
    if (renderStep.progress !== progress) { fill.style.width = hd.style.left = progress / 100 + "%"; renderStep.progress = progress; }
    if (renderStep.seconds !== seconds || renderStep.flow !== S.flow || renderStep.step !== cur.i) { timeLabel.textContent = `${fmt(S.t)} / ${fmt(f.total)}  step ${cur.i}/${f.items.length - 1}`; renderStep.seconds = seconds; renderStep.flow = S.flow; renderStep.step = cur.i; }
    if (renderStep.playing !== S.playing) { playButton.textContent = S.playing ? "❚❚" : "▶"; renderStep.playing = S.playing; }
    if (shown !== cur.i) {
      shown = cur.i;
      for (let i = 0; i < stepRows.length; i++) stepRows[i].className = i === cur.i ? "now" : i < cur.i ? "done" : "";
      if (shownCard) shownCard.style.display = "none"; shownCard = cardCache[S.flow][cur.i]; shownCard.style.display = "block";
      if (S.panel && !document.body.classList.contains("bare") && panelHeight) {
        if (stepTop[cur.i] < panelScroll) panelScroll = stepTop[cur.i]; else if (stepBottom[cur.i] > panelScroll + panelHeight) panelScroll = stepBottom[cur.i] - panelHeight;
        stepPanel.scrollTop = panelScroll;
      }
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
  const tLbl = tog("lblBtn", "labels"), tNet = tog("netBtn", "net"), tPanel = tog("panelBtn", "panel", () => { stepPanel.style.display = S.panel ? "" : "none"; if (S.panel) cacheStepLayout(); });
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
    const p = frameLot, here = p.lift != null ? "E2-1F" : plateOf(p.x, p.y);
    for (const [key, P] of plateEntries) { const b = P.box; mc.fillStyle = key === here ? "#1f6feb" : "#ffffff26"; mc.fillRect(b[0] * k, b[1] * k - 30, b[2] * k, b[3] * k); mc.fillStyle = "#fff"; mc.font = "bold 18px Segoe UI"; mc.fillText(P.label, b[0] * k + 6, b[1] * k - 8); }
    const x = p.lift != null ? E.low[0] : p.x, y = p.lift != null ? E.low[1] : p.y; mc.fillStyle = "#ffc000"; mc.beginPath(); mc.arc(x * k, y * k - 30, 7, 0, 7); mc.fill();
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
    cacheStepLayout();
  }
  let resizePending = false;
  addEventListener("resize", () => { resizePending = true; });
  let last = performance.now(), slow = 0, governorHold = 3, lastR = -1, lastStack = -1, shadowSettled = 0, lastLiveTime = NaN, lastLiveShow = null;
  function tick(now) {
    const raw = Math.max(0, (now - last) / 1000); last = now;
    metrics.intervals[metrics.frames++ % metrics.intervals.length] = raw * 1000;
    if (raw > .034) {
      const record = metrics.slowFrames[metrics.slowCount++ % metrics.slowFrames.length];
      record.t = S.t; record.end = S.playing ? Math.min(F().total, S.t + raw * S.speed) : S.t; record.ms = raw * 1000; record.cpu = metrics.lastCPU; record.step = stepAt(S.t).i; record.mask = metrics.lastMask;
      record.programs = renderer.info.programs?.length || 0; record.textures = renderer.info.memory.textures; record.heap = performance.memory?.usedJSHeapSize || 0;
    }
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
    const frameStart = performance.now(); let mask = 0;
    dt = Math.max(0, dt);
    if (S.playing) { const c = stepAt(S.t); let t = S.t + dt * S.speed; if (S.stepStop && S.t < c.tm && t >= c.tm) { t = c.tm; pause(); } S.t = Math.min(t, F().total); if (S.t >= F().total) pause(); }
    time = S.t; // every animated path is a deterministic function of story time
    const cur = stepAt(S.t), intro = cur.s.intro && S.view === "auto";
    const goalR = S.view === "2d" ? 0 : intro ? clamp((S.t - 1.6) / (INTRO - 2.4), 0, 1) : 1;
    S.R = intro ? goalR : S.R + clamp(goalR - S.R, -dt * .7, dt * .7);
    if (Math.abs(S.R - lastR) > 1e-4) { if (replicaVisible !== (S.R > .004)) mask |= 4; REP.rise(S.R); lastR = S.R; shadowDirty = true; }
    const goal = S.stackUser != null ? S.stackUser : S.view === "2d" ? 0 : S.view === "3d" ? 1 : cur.s.view === "3d" ? 1 : 0;
    S.stack = lerp(S.stack, goal, 1 - Math.exp(-dt * 3)); if (Math.abs(S.stack - goal) < .001) S.stack = goal;
    if (S.stackUser == null) { const value = Math.round(S.stack * 100); if (frame.stackValue !== value) { stackControl.value = value; frame.stackValue = value; } }
    if (Math.abs(S.stack - lastStack) > 1e-4) { lastStack = S.stack; shadowDirty = true; }
    for (let i = 0; i < plateEntriesForGroups.length; i++) { const entry = plateEntriesForGroups[i], g = entry[1], P = D.plates[entry[0]]; g.position.set(S.stack * P.dx, S.stack * P.lift * GAP, S.stack * P.dz); }
    if (deck.visible !== (S.stack > .3) || cabin.visible !== (S.stack > .1)) mask |= 16;
    deck.visible = S.stack > .3;
    const oo = S.plan === "original" ? 1 : intro ? 1 - clamp((S.t - .7) / 1.2, 0, 1) : 0;
    for (const m of origs) { m.material.opacity = oo; m.visible = oo > .01; }
    for (const m of gates) { const n = m.userData.n; W(n.x, n.y, S.stack, 8, m.position); m.scale.y = Math.max(.001, S.R); m.visible = S.R > .05 && S.stack > .05; }
    const lo = W(E.low[0], E.low[1], S.stack, .8, liftLow), hi = W(E.high[0], E.high[1], S.stack, .8, liftHigh);
    shaft.visible = cabin.visible = S.stack > .1; shaft.position.copy(lo).lerp(hi, .5); shaft.scale.y = Math.max(1, hi.y - lo.y + 18);
    const lp = lotPos(S.t, frameLot), at = worldFromLot(lp, S.stack, lotPoint), li = liftIndices[S.flow];
    lot.position.copy(at).setY(at.y + S.R * .2); lot.visible = !cur.s.intro; if (cur.path && !cur.s.lift) {
      const duration = cur.tm - cur.t0, u = clamp((S.t - cur.t0) / duration, 0, 1), pad = Math.min(.15 / duration, .1);
      const a = along(cur.path, ease(clamp(u - pad, 0, 1)), headingA), b = along(cur.path, ease(clamp(u + pad, 0, 1)), headingB);
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-6) lot.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
    }
    cabin.position.copy(lp.lift != null ? at : lo).setY((lp.lift != null ? at.y : (li >= 0 && cur.i > li ? hi.y : lo.y)) - .5);
    beacon.visible = !cur.s.intro; beacon.position.copy(at).setY(at.y + 1.2); const pulse = (time * .8) % 1; beacon.scale.setScalar(.7 + pulse * 1.4); beacon.material.opacity = 1 - pulse;
    // focus: the plan with the lot stays bright, the others step back (colours stay, brightness falls)
    const here = lp.lift != null ? "E2" : plateOf(lp.x, lp.y);
    for (const fl of floors) { const on = !S.focus || cur.s.intro || S.R < .9 || S.cam === "overview" || fl.key === here || (here === "E2" && fl.key !== "E1"); const target = on ? 1 : .42; fl.k = lerp(fl.k ?? 1, target, 1 - Math.exp(-dt * 6)); if (Math.abs(fl.k - target) < .001) fl.k = target;
      if (fl.lastDim == null || Math.abs(fl.k - fl.lastDim) > .001 || fl.k === target && fl.lastDim !== target) { for (let i = 0; i < fl.dimMaterials.length; i++) fl.dimMaterials[i].color.setScalar(fl.k); fl.planMaterial.color.setRGB(.79 * fl.k, .81 * fl.k, .84 * fl.k); fl.surfaceMaterial.color.setHex(0xc3c7c4).multiplyScalar(fl.k); fl.lastDim = fl.k; metrics.dimUpdates++; }
      const material = S.R > .85 && S.plan !== "original" ? fl.surfaceMaterial : fl.planMaterial; if (fl.art.material !== material) { fl.art.material = material; mask |= 2; } }
    cue(cur);
    if (lastLiveTime !== time || lastLiveShow !== (S.R > .92)) {
      if (lastLiveShow !== (S.R > .92)) mask |= 8;
      REP.live(time * .55, S.R, dt * .55);
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
    if (shown !== cur.i) mask |= 1;
    draw(time); placeLabels(); renderStep();
    if (drawMini.last == null || drawMini.flow !== S.flow || Math.abs(time - drawMini.last) >= .1) { drawMini(); drawMini.last = time; drawMini.flow = S.flow; }
    stage("overlay-dom", overlayStart); metrics.lastMask = mask; metrics.lastCPU = performance.now() - frameStart;
  }
  prepareArt(); buildPost(); renderFlow(); resize(); setLook("studio"); $("quality").value = S.quality; S.c.dist = want.dist = fit(); setCam("guided");
  window.MF = { floors, S, D, REP, W, proj, seek, play, pause, stepBy, setFlow, setView, setCam, setLook, setPlan, setMeasure, setQuality, setFloorLight, stepAt, frame, want, perf: metrics };   // used by the tests
  metrics.reset = () => { metrics.frames = 0; metrics.intervals.fill(0); metrics.stages = {}; metrics.slowCount = 0; };
  metrics.snapshot = () => {
    const frames = Math.min(metrics.frames, metrics.intervals.length), a = Array.from(metrics.intervals.subarray(0, frames)).sort((a, b) => a - b);
    return { frames, quality: S.quality, pixelRatio: renderer.getPixelRatio(), p50: a[Math.floor(frames * .5)] ?? 0, p99: a[Math.min(frames - 1, Math.floor(frames * .99))] ?? 0, worst: a[frames - 1] ?? 0, over34: a.filter(ms => ms > 34).length, over120: a.filter(ms => ms > 120).length, over250: a.filter(ms => ms > 250).length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0, stages: metrics.stages };
  };
  // Match BOTH real render destinations. Offscreen-only warm-up misses Three r170's
  // screen tone-mapping/output-colour variant and skips VAO/texture uploads when culled.
  MF.ready = (async () => {
    const start = performance.now(), savedTarget = renderer.getRenderTarget(), viewport = renderer.getViewport(new T.Vector4()), scissor = renderer.getScissor(new T.Vector4()), scissorTest = renderer.getScissorTest();
    const saved = [], canvas = $("gl"), oldVisibility = canvas.style.visibility;
    canvas.style.visibility = "hidden";
    try {
      await Promise.all(originalLoads); await trolleyReady;
      // Blender's baked light goes through the floor shader: soft shadows and contact occlusion for no runtime cost
      for (const [key, source] of Object.entries(window.MF_FLOOR_LIGHT || {})) await setFloorLight(key, source);
      for (const m of origs) renderer.initTexture(m.material.map);
      for (const tex of window.MFLook.textures(T)) renderer.initTexture(tex);
      scene.traverse(o => { saved.push({ o, visible: o.visible, culled: o.frustumCulled }); });
      REP.live(0, 1, 0);
      cameraTarget.set(0, 0, 0); camera.position.set(0, S.c.dist, S.c.dist * .001); camera.lookAt(cameraTarget); camera.updateMatrixWorld();
      composer.setPixelRatio(1); composer.setSize(32, 32);
      for (const look of ["studio", "night", "blueprint"]) {
        setLook(look);
        for (let i = 0; i < saved.length; i++) { saved[i].o.visible = true; saved[i].o.frustumCulled = false; }
        for (const surface of [false, true]) {
          for (const f of floors) f.art.material = surface ? f.surfaceMaterial : f.planMaterial;
          riseUniform.value = surface ? 1 : .4; REP.live(surface ? 1 : .25, 1, 0);
          // Default framebuffer: its MSAA, Neutral tone mapping and sRGB output are
          // the Studio/Blueprint playback path. A tiny scissor bounds raster cost.
          renderer.setRenderTarget(null); renderer.setViewport(0, 0, 32, 32); renderer.setScissor(0, 0, 32, 32); renderer.setScissorTest(true);
          if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);
          renderer.render(scene, camera);
          // HDR scene target: the actual Night RenderPass destination. Also render
          // at a partial rise so the uniform fast path is not the only exercised path.
          renderer.setRenderTarget(composer.readBuffer); renderer.setScissorTest(false);
          if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);
          composer.render(0); riseUniform.value = .95; REP.live(.9, 1, 0); composer.render(0);
        }
      }
    } catch (e) { console.error("Material Flow warm-up failed", e); fail("The 3D materials could not start. " + e.message); throw e; }
    finally {
      for (let i = 0; i < saved.length; i++) { const v = saved[i]; v.o.visible = v.visible; v.o.frustumCulled = v.culled; }
      setLook("studio"); for (const f of floors) f.art.material = f.planMaterial; REP.rise(S.R);
      renderer.setRenderTarget(savedTarget); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      composer.width = composer.height = 0; resize(); canvas.style.visibility = oldVisibility;
    }
    // Finish resource creation and initial DOM layout before the story can start.
    // GPU finish is deliberately startup-only; never synchronise it in the hot loop.
    frame(0, 0); void document.body.offsetHeight; renderer.getContext().finish();
    metrics.lastMask = 0; event("startup-warmup", start); last = performance.now(); requestAnimationFrame(tick);
  })();
})();
