/* Material Flow Player: one scene, full control. Everything on screen is a function of (flow, time, view, camera):
   the timeline can jump anywhere, and the viewer can leave the guided camera at any moment and keep playing.
   Slide coordinates (960 x 540) are kept all the way, 1 point = 0.30 m. Each plan is a plate that can move and rise:
   stack 0 = the slide layout, 1 = floors stacked. R is how far the factory has risen out of the flat plan (0 = 2D, 1 = 3D). */
"use strict";
(function () {
  const D = window.MF_DATA, RP = window.MF_REPLICA, T = window.THREE, $ = (id) => document.getElementById(id);
  function fail(m) { const e = $("err"); e.style.display = "grid"; e.textContent = m; }
  if (!T) { fail("The 3D library did not load."); return; }
  const CX = 480, CY = 290, GAP = 120, DWELL = .7, INTRO = 7, LIFT_T = 2, STATION_T = .01, PT_M = RP.scale;
  // A truly stationary step (no path, or a path with zero motion) lasts DWELL in total: a token STATION_T "move" (so tm > t0 and step-stop
  // still has something to stop at) plus DWELL - STATION_T of dwell. Moving steps and the lift keep move + DWELL.
  // Physical story-time motion (Round 5 baseline): cruise speed, ramp time to/from cruise, and in-place quarter-turn time.
  // Playback speed (S.speed, 0.5x-8x) multiplies story time exactly once, in frame(); nothing below knows about it.
  const V_MAX = 4, RAMP_T = .25, TURN_T = .3, MIN_SEG = 1e-4, TURN_SNAP = 1e-6;
  const PLATE_X = 553, PLATE_Y = 303;   // plate boundaries in slide points: x < PLATE_X is E1; right of it y >= PLATE_Y is E2-1F, else E2-2F
  const plateOf = (x, y) => (x < PLATE_X ? "E1" : y >= PLATE_Y ? "E2-1F" : "E2-2F");
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);
  const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  const query = new URLSearchParams(location.search);

  /* ---------- state ---------- */
  // panel: the steps list starts collapsed. mini: the mini map starts hidden. blur: opt-in glass backdrop blur (never on Low).
  const S = { flow: 0, t: 0, playing: false, speed: 1, view: "auto", cam: "guided", stack: 0, stackUser: null, labels: true, net: false, panel: false, mini: false, blur: query.get("blur") === "1", autoFade: query.get("fade") !== "0", stepStop: false, roof: true, R: 0, focus: true, sound: false, plan: "replica", look: "studio", quality: ["high", "medium", "low"].includes(query.get("q")) ? query.get("q") : "high", measure: false, pts: [],
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
    const slab = new T.Mesh(new T.BoxGeometry(w + 8, 6, h + 8), new T.MeshStandardMaterial({ color: 0x56627a, roughness: .7 })); slab.position.set(minX + w / 2 - CX, -3.2, minY + h / 2 - CY); slab.receiveShadow = true; g.add(slab);
    const art = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ color: 0xc9ced6, roughness: .78, metalness: 0 })); art.rotation.x = -Math.PI / 2; art.position.set(minX + w / 2 - CX, .12, minY + h / 2 - CY); art.receiveShadow = true; g.add(art);
    const planMaterial = art.material, surfaceMaterial = window.MFLook.floor(T, w, h);
    art.name = "MF floor " + key; slab.name = "MF slab " + key; planMaterial.name = "MF plan " + key; surfaceMaterial.name = "MF surface " + key;
    surfaceMaterial.userData.floorLight.value = window.MFLook.contactLight(T, key, P.box, RP);
    floors.push({ art, slab, key, box: P.box, planMaterial, surfaceMaterial, reflW: 0 }); P.art = art;
  }
  const REP = window.MFReplica.build({ T, plates, R: RP, CX, CY });
  // Sweep in the vertex shader: immutable instance buffers throughout the rise.
  const riseUniform = { value: 0 }, riseMaterials = new Set();
  // Idempotent: patches every replica material once. Called now, and again after REP.ready
  // (glTF parts may add instanced meshes/materials later; REP.meshes stays the one list).
  function bindReplicaMeshes() {
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
    for (const fl of floors) {
      fl.dimMaterials = [];
      for (const { im } of REP.meshes) if (im.material.userData.dim && im.material.userData.plate === fl.key && !fl.dimMaterials.includes(im.material)) fl.dimMaterials.push(im.material);
      fl.lastDim = null;   // re-apply the current dim level to any late material
    }
  }
  let replicaVisible = null;
  // Roof switch: the lead's REP.setRoof(on) owns the geometry; absent API = silent no-op. The rise override below forces every
  // replica mesh visible again when the factory appears, so the roof state is re-applied right after that pass.
  const hasRoof = () => typeof REP.setRoof === "function";
  function applyRoof() { if (hasRoof()) REP.setRoof(S.roof); }
  REP.rise = value => {
    riseUniform.value = value; const show = value > .004;
    if (replicaVisible !== show) { replicaVisible = show; for (let i = 0; i < REP.meshes.length; i++) REP.meshes[i].im.visible = show; if (show) applyRoof(); }
    metrics.riseUpdates++;
  };
  bindReplicaMeshes();
  // Conservative overhead flight envelope. Measure full-height instance geometry once, not per frame.
  // The upper floor can slide under the camera during a lift; reserve its entire height at every X/Z.
  let chaseEnvelope;
  const highestFloor = plateEntries.reduce((h, [, p]) => Math.max(h, p.lift * GAP), 0);
  function prepareChaseEnvelope() {
    const boxes = [{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 18, maxZ: 1 }]; // gates/cabin
    for (const { im } of REP.meshes) {
      im.computeBoundingBox(); const b = im.boundingBox;
      if (b && !b.isEmpty()) boxes.push({ minX: b.min.x, minY: b.min.y, minZ: b.min.z, maxX: b.max.x, maxY: b.max.y, maxZ: b.max.z });
    }
    chaseEnvelope = window.CameraEnvelope.makeEnvelope(boxes);
  }
  function protectChaseEye(eye) {
    const offset = highestFloor * S.stack;
    eye.y -= offset;
    try { return offset + chaseEnvelope.protect(eye, camera.near, camera.fov, camera.aspect, 1 / PT_M); }
    finally { eye.y += offset; }
  }
  prepareChaseEnvelope();
  // Vehicles are lead-owned. REP.vehicleAt (physical, story-time) is used through REP.live as the lead
  // defines it; when that API is absent the original REP.live runs untouched. The player no longer
  // overrides REP.live, so there is no nearby-sample heading and no second time scaling for the physical API.
  const physicalVehicles = typeof REP.vehicleAt === "function";
  metrics.vehicleAPI = physicalVehicles; metrics.liveFallback = !physicalVehicles;
  REP.live(0, 1, 0);
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
  const lot = new T.Group(); let trolleyReady, contactBlob = null;
  { // the hero: Blender's trolley with rear covers, 1.4x real size so it stays readable, on a soft contact shadow
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 8, 64, 64, 62); r.addColorStop(0, "rgba(10,14,24,.62)"); r.addColorStop(.6, "rgba(10,14,24,.3)"); r.addColorStop(1, "rgba(10,14,24,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const blob = new T.Mesh(new T.PlaneGeometry(18, 22).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false })); blob.position.y = .35; lot.add(blob); contactBlob = blob;
    const bytes = Uint8Array.from(atob(window.MF_TROLLEY), (ch) => ch.charCodeAt(0));
    trolleyReady = new Promise((ok, no) => new T.X.GLTFLoader().parse(bytes.buffer, "", (gl) => { gl.scene.scale.setScalar(1.6 / PT_M); lot.add(gl.scene); ok(); }, (e) => { fail("The trolley model could not load: " + e.message); no(e); })); }
  scene.add(lot);
  const beacon = new T.Mesh(new T.RingGeometry(9, 11, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: new T.Color(0x8fdcff).multiplyScalar(3), toneMapped: false, transparent: true, side: T.DoubleSide })); scene.add(beacon);
  // atmosphere: Digital Factory's light shafts and dust
  const lamps = []; for (let x = 60; x < 520; x += 70) for (let y = 190; y < 480; y += 62) lamps.push([x - CX, 46, y - CY]);
  const sceneBeforeAtmos = new Set(scene.children);   // whatever DFAtmos adds to the scene is hidden while the floor reflection renders
  const atmos = window.DFAtmos ? window.DFAtmos.create(T, scene, { lamps, shafts: { height: 46, top: 1.4, bottom: 13, intensity: .05 }, dust: { count: 900, box: [620, 70, 620], size: .16, alpha: .3 } }) : null;
  const atmosObjects = scene.children.filter(o => !sceneBeforeAtmos.has(o));

  /* ---------- a persistent, bounded post chain (night bloom only) ---------- */
  let composer = null, bloom = null;
  function buildPost() {
    if (composer) return; // never allocate passes during quality, look or resize changes
    const rt = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 0 });
    composer = new T.EffectComposer(renderer, rt); composer.addPass(new T.RenderPass(scene, camera));
    bloom = new T.UnrealBloomPass(new T.Vector2(1, 1), .25, .45, 2.2);
    composer.addPass(bloom); composer.addPass(new T.OutputPass());
  }
  // Backdrop blur is opt-in (body.blur) and forced off on Low by CSS (body.q-low).
  function syncQualityClasses() { document.body.classList.toggle("q-low", S.quality === "low"); document.body.classList.toggle("blur", S.blur && S.quality !== "low"); }
  function setQuality(q, manual = true) {
    if (!["high", "medium", "low"].includes(q)) return;
    if (q === S.quality && resolutionScale === 1) { manualQuality = manual; syncQualityClasses(); return; }
    const start = performance.now(); manualQuality = manual; S.quality = q; resolutionScale = 1; $("quality").value = q; syncQualityClasses(); resize(); event("quality-" + q, start);
  }

  /* ---------- looks ---------- */
  // Studio is the bright clean factory: light grey-blue room, soft sky/ground fill and a stronger (still rough, never mirror)
  // environment reflection. gain = route-light emissive multiplier (Night pushes it over the bloom threshold).
  // The table is exposed as MF.LOOK so the lead can tune env/exp on a real GPU and call MF.setLook(name) again.
  const LOOK = { studio: { bg: 0xd3dce7, ground: 0x929cab, hemi: .85, sun: 2.1, exp: 1, dark: false, env: .8, air: false, gain: 1, grid: false }, night: { bg: 0x05080f, ground: 0x2a3550, hemi: .22, sun: .35, exp: 1.25, dark: true, env: .22, air: true, gain: 3.2, grid: true }, blueprint: { bg: 0x071630, ground: 0x2a3550, hemi: 1.2, sun: 0, exp: 1, dark: true, env: .1, air: false, gain: 1.2, grid: true } };
  function setLook(k) {
    const L = LOOK[k]; if (!L) return; const start = performance.now(); S.look = k; $("look").value = k; document.body.dataset.look = k; scene.background = new T.Color(L.bg); scene.fog = new T.Fog(L.bg, 1400, 3200); hemi.intensity = L.hemi; hemi.groundColor.setHex(L.ground); grid.visible = L.grid; sun.intensity = L.sun; renderer.toneMappingExposure = L.exp; scene.environmentIntensity = L.env; routeU.gain.value = L.gain; setArt(L.dark); atmos?.set(L.air); atmos?.theme(L.dark);
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

  /* ---------- deterministic story-time motion ----------
     A route is a pure schedule of phases, a function of story time only (no frame history, no global easing):
       move = one straight segment: soft ramp up, cruise at V_MAX, soft ramp down (rest at both ends);
       turn = exact in-place rotation at a corner (+-90 deg for orthogonal routes), zero translation.
     Duplicate and same-direction collinear points are removed first, so a straight line never stops. Heading in a
     move phase is exactly atan2(dx, dy) of its segment (the rotation.y convention of the lot model). A step's first
     phase may be a turn from the previous step's final heading, so heading never snaps at a step boundary.
     Duration = sum of all phase times; the dwell is added by buildFlow. Distances: slide points (d), metres via PT_M. */
  const ZERO_POINT = [0, 0];
  function cleanPath(path) {
    const out = [];
    for (const p of path) {
      const q = [p[0], p[1]], n = out.length;
      if (n && Math.hypot(q[0] - out[n - 1][0], q[1] - out[n - 1][1]) < MIN_SEG) continue;           // duplicate
      if (n >= 2) {
        const a = out[n - 2], b = out[n - 1], ux = b[0] - a[0], uy = b[1] - a[1], vx = q[0] - b[0], vy = q[1] - b[1];
        if (Math.abs(ux * vy - uy * vx) < 1e-6 * Math.hypot(ux, uy) * Math.hypot(vx, vy) && ux * vx + uy * vy > 0) { out[n - 1] = q; continue; }   // same-direction collinear
      }
      out.push(q);
    }
    return out;
  }
  // Smooth ramp: v = vp * smoothstep(x); distance = vp * Ta * (x^3 - x^4 / 2), which reaches vp * Ta / 2 at x = 1.
  const rampDist = (x) => x * x * x - x * x * x * x * .5, rampSpeed = (x) => x * x * (3 - 2 * x);
  function segmentProfile(L) {   // L in metres
    const full = V_MAX * RAMP_T, cruise = L >= full;
    const Ta = cruise ? RAMP_T : RAMP_T * Math.sqrt(L / full), vp = cruise ? V_MAX : L / Ta;   // short segments: same acceleration, lower peak
    return { Ta, vp, T: 2 * Ta + (cruise ? (L - full) / V_MAX : 0) };
  }
  function segmentAdvance(p, L, tau) {   // metres travelled along a segment after tau seconds
    if (tau <= 0) return 0; if (tau >= p.T) return L;
    if (tau < p.Ta) return p.vp * p.Ta * rampDist(tau / p.Ta);
    if (tau > p.T - p.Ta) return L - p.vp * p.Ta * rampDist((p.T - tau) / p.Ta);
    return p.vp * p.Ta * .5 + p.vp * (tau - p.Ta);
  }
  function segmentSpeed(p, tau) {
    if (tau <= 0 || tau >= p.T) return 0;
    if (tau < p.Ta) return p.vp * rampSpeed(tau / p.Ta);
    if (tau > p.T - p.Ta) return p.vp * rampSpeed((p.T - tau) / p.Ta);
    return p.vp;
  }
  // hIn: heading carried in from the previous step (undefined = this route sets its own initial heading, no turn).
  function buildSchedule(path, hIn) {
    const P = cleanPath(path), phases = [], sched = { pts: P, phases, duration: 0, length: 0, h0: hIn, h1: hIn };
    let t = 0, d = 0, h = hIn;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], dx = b[0] - a[0], dy = b[1] - a[1], lp = Math.hypot(dx, dy), Lm = lp * PT_M, heading = Math.atan2(dx, dy);
      if (h === undefined) { h = sched.h0 = heading; }
      else {
        let delta = wrapPi(heading - h); const quarter = Math.PI / 2;
        if (Math.abs(Math.abs(delta) - quarter) < TURN_SNAP) delta = Math.sign(delta) * quarter; else if (Math.abs(Math.abs(delta) - Math.PI) < TURN_SNAP) delta = Math.PI;
        if (Math.abs(delta) > TURN_SNAP) { const T2 = TURN_T * Math.abs(delta) / quarter; phases.push({ k: "turn", t0: t, t1: t + T2, x: a[0], y: a[1], h0: h, delta, h1: heading, d, seg: i - 1 }); t += T2; }
      }
      const p = segmentProfile(Lm); phases.push({ k: "move", t0: t, t1: t + p.T, a, b, lp, Lm, p, d0: d, h: heading, seg: i - 1 }); t += p.T; d += lp; h = heading;
    }
    sched.duration = t; sched.length = d; sched.h1 = h; return sched;
  }
  // Pure, seekable: out.x/y = position (slide points), h = heading (radians, rotation.y convention), d = distance along the
  // cleaned route (slide points), v = speed (m/s), k = "move" | "turn" | "end", seg = index of the current/next segment.
  function sampleSchedule(s, tau, out) {
    const ph = s.phases, n = ph.length, P = s.pts;
    if (!n || tau >= s.duration) { const e = P[P.length - 1] || ZERO_POINT; out.x = e[0]; out.y = e[1]; out.h = s.h1 === undefined ? 0 : s.h1; out.d = s.length; out.v = 0; out.k = "end"; out.seg = Math.max(0, P.length - 2); return out; }
    if (tau < 0) tau = 0;
    let i = 0; while (i < n - 1 && tau >= ph[i].t1) i++;
    const p = ph[i]; out.seg = p.seg;
    if (p.k === "turn") {
      const u = clamp((tau - p.t0) / (p.t1 - p.t0), 0, 1); out.x = p.x; out.y = p.y; out.d = p.d; out.v = 0; out.k = "turn";
      out.h = u >= 1 ? p.h1 : wrapPi(p.h0 + p.delta * ease(u)); return out;
    }
    const m = segmentAdvance(p.p, p.Lm, tau - p.t0), k = p.Lm ? clamp(m / p.Lm, 0, 1) : 1;
    out.x = lerp(p.a[0], p.b[0], k); out.y = lerp(p.a[1], p.b[1], k); out.h = p.h; out.d = p.d0 + k * p.lp; out.v = segmentSpeed(p.p, tau - p.t0); out.k = "move"; return out;
  }
  function buildFlow(f) {
    f.items = [{ s: { node: f.steps[0].node, title: "From flat plan to factory", what: `Rebuilt from the slide: ${st.racks} rack blocks, ${st.machines} machines, ${st.columns} columns, ${st.walls} walls. Scale 1 slide point = ${PT_M} m.`, mode: "flow", view: "2d", dist: 300, intro: true }, i: 0, path: null, t0: 0, tm: INTRO - .6, t1: INTRO, h0: 0, h1: 0, sched: null, base: 0, run: 0, metres: 0 }];
    let t = INTRO, total = 0, hPrev, waiting = [];
    f.steps.forEach((s, i) => {
      let path = s.path;
      if (path === "lift") path = [E.low, E.high];
      if (path === "fromLift") path = [E.high, [D.nodes[s.node].x, E.high[1]], [D.nodes[s.node].x, D.nodes[s.node].y]];
      const sched = path && !s.lift ? buildSchedule(path, hPrev) : null, moving = sched && sched.phases.length > 0;
      const stationary = !path || (!s.lift && !moving), move = s.lift ? LIFT_T : moving ? sched.duration : STATION_T, dwell = stationary ? DWELL - STATION_T : DWELL;
      const metres = path && !s.lift ? pl(path) * PT_M : 0, base = total; total += metres;
      const it = { s, i: i + 1, path, sched, t0: t, tm: t + move, t1: t + move + dwell, metres, base, run: total, h0: hPrev, h1: hPrev };
      if (moving) { it.h0 = sched.h0; it.h1 = sched.h1; if (hPrev === undefined) { for (const w of waiting) w.h0 = w.h1 = sched.h0; waiting = []; } hPrev = sched.h1; }
      else if (hPrev === undefined) waiting.push(it);
      f.items.push(it); t += move + dwell;
    });
    for (const w of waiting) w.h0 = w.h1 = 0;   // a flow with no moving step at all
    f.items.forEach(it => { if (it.h0 === undefined) it.h0 = it.h1 = 0; });
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
  const worldSample = { x: 0, y: 0, i: 1, u: 0, lift: null, it: null, h: 0, d: 0, v: 0, k: "hold", seg: 0 }, frameLot = { ...worldSample }, pathHead = { x: 0, y: 0, i: 1 };
  const worldHigh = new T.Vector3(), lotPoint = new T.Vector3(), liftLow = new T.Vector3(), liftHigh = new T.Vector3(), cameraPoint = new T.Vector3(), segmentA = new T.Vector3(), segmentB = new T.Vector3();
  // The lot's pose is a pure function of story time: position, heading (h), distance along the route (d, slide points),
  // speed (v, m/s), phase (k: move / turn / end / hold) and the current segment. u = d / route length (exact, not a time fraction).
  function lotPos(t, out) {
    const it = stepAt(t), n = D.nodes[it.s.node]; out.it = it; out.lift = null; out.h = it.h0; out.d = 0; out.v = 0; out.k = "hold"; out.seg = 0;
    if (!it.path) { out.x = n.x; out.y = n.y; out.u = 1; out.i = 1; return out; }
    if (it.s.lift) { out.lift = out.u = ease(clamp((t - it.t0) / Math.max(.001, it.tm - it.t0), 0, 1)); out.h = it.h1; return out; }
    sampleSchedule(it.sched, t - it.t0, out); out.u = it.sched.length ? clamp(out.d / it.sched.length, 0, 1) : 1; out.i = out.seg + 1;
    const p = it.sched.pts[it.sched.pts.length - 1]; if (!it.sched.phases.length && p) { out.x = p[0]; out.y = p[1]; out.h = it.h1; }
    return out;
  }
  function worldFromLot(p, stack, out) {
    if (p.lift == null) return W(p.x, p.y, stack, .8, out);
    return W(E.low[0], E.low[1], stack, .8, out).lerp(W(E.high[0], E.high[1], stack, .8, worldHigh), p.lift);
  }
  function lotWorld(t, stack, out) { return worldFromLot(lotPos(t, worldSample), stack, out); }

  /* ---------- route light: a real floor ribbon + station rings ----------
     Static geometry per (flow, plate), parented to the plate group, so stack / floor offsets / elevator positions follow the
     plate transform for free. Nothing is rebuilt or uploaded per frame: shared uniforms only (done distance, story time, step,
     gain, alpha). aU is the flow-global route distance in metres, so "travelled" is one uniform: it.base + schedule distance. */
  const routeU = { done: { value: 0 }, time: { value: 0 }, gain: { value: 1 }, alpha: { value: 0 }, step: { value: 0 }, dim: { value: .3 } };
  const RIBBON_W = 3.6, RIBBON_Y = .6, STATION_R = 10;
  // One fragment program for the floor ribbon and the elevator connector. uHead gates the leading glow
  // (1 on the floor ribbon; on the connector it is 1 only while the lot is actually travelling it).
  const RIBBON_FRAG = `uniform float uDone, uTime, uGain, uAlpha, uDim, uHead; varying float vU; varying float vV;
void main() {
  float e = abs(vV);
  float core = 1.0 - smoothstep(0.16, 0.30, e);
  float halo = exp(-e * e * 5.0) * (1.0 - smoothstep(0.85, 1.0, e));
  float reach = 1.0 - smoothstep(uDone - 0.25, uDone + 0.25, vU);
  float chev = fract((vU + e * 0.55) / 1.3 - uTime * 0.32);
  float band = smoothstep(0.0, 0.05, chev) * (1.0 - smoothstep(0.2, 0.3, chev)) * (0.3 + 0.7 * reach) * (1.0 - smoothstep(0.55, 0.95, e));
  // chevrons point along the route (the tip, e = 0, leads in +aU)
  float hd = (vU - uDone) / 1.4; float head = exp(-hd * hd) * (1.0 - smoothstep(0.1, 0.9, e)) * uHead;
  float lit = mix(uDim, 1.0, reach);
  vec3 rgb = mix(vec3(1.0, 0.42, 0.04), vec3(1.0, 0.78, 0.36), clamp(core * 0.5 + band * 0.55 + head * 0.6, 0.0, 1.0)) * uGain;
  float a = (core * (0.78 + 0.22 * band) + halo * 0.4 + head * 0.5) * lit * uAlpha;
  gl_FragColor = vec4(rgb, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
  const ROUTE_STATE = { transparent: true, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
  const ribbonMaterial = new T.ShaderMaterial({
    uniforms: { uDone: routeU.done, uTime: routeU.time, uGain: routeU.gain, uAlpha: routeU.alpha, uDim: routeU.dim, uHead: { value: 1 } }, ...ROUTE_STATE,
    vertexShader: "attribute float aU; attribute float aV; varying float vU; varying float vV;\nvoid main() { vU = aU; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: RIBBON_FRAG
  });
  // Elevator connector: same fragment program, one material per lift step (same GLSL, so one compiled program) so each
  // carries its own progress. aU runs 0..1 along the connector; uLen (metres) turns it into route metres in the vertex stage.
  const LIFT_VERT = "attribute float aU; attribute float aV; uniform float uLen; varying float vU; varying float vV;\nvoid main() { vU = aU * uLen; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
  const makeLiftMaterial = () => new T.ShaderMaterial({
    uniforms: { uDone: { value: -.5 }, uHead: { value: 0 }, uLen: { value: 1 }, uTime: routeU.time, uGain: routeU.gain, uAlpha: routeU.alpha, uDim: routeU.dim }, ...ROUTE_STATE,
    vertexShader: LIFT_VERT, fragmentShader: RIBBON_FRAG
  });
  // Shared, static: two crossed strips (one wide in local X, one in local Y) along local +Z from 0 to 1, so the connector
  // reads from any camera angle. The mesh transform (position, rotation, scale.z = length) is the only per-frame change.
  const liftGeometry = (() => {
    const hw = RIBBON_W / 2, pos = [], u = [], v = [], idx = [];
    for (const [wx, wy] of [[hw, 0], [0, hw]]) { const n = pos.length / 3; pos.push(wx, wy, 0, -wx, -wy, 0, -wx, -wy, 1, wx, wy, 1); u.push(0, 0, 1, 1); v.push(1, -1, -1, 1); idx.push(n, n + 1, n + 2, n, n + 2, n + 3); }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("aU", new T.Float32BufferAttribute(u, 1)); g.setAttribute("aV", new T.Float32BufferAttribute(v, 1));
    g.setIndex(idx); g.computeBoundingSphere(); return g;
  })();
  const LIFT_AXIS = new T.Vector3(0, 0, 1), liftDir = new T.Vector3();
  const ringMaterial = new T.ShaderMaterial({
    uniforms: { uTime: routeU.time, uGain: routeU.gain, uAlpha: routeU.alpha, uStep: routeU.step },
    transparent: true, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    vertexShader: "attribute vec2 aC; attribute float aI; varying vec2 vC; varying float vI;\nvoid main() { vC = aC; vI = aI; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime, uGain, uAlpha, uStep; varying vec2 vC; varying float vI;
void main() {
  float r = length(vC);
  float ring = smoothstep(0.66, 0.74, r) * (1.0 - smoothstep(0.84, 0.92, r));
  float now = 1.0 - step(0.5, abs(vI - uStep)), done = step(0.5, uStep - vI);
  float p = fract(uTime * 0.5), pr = 0.25 + p * 0.7;
  float wave = (1.0 - smoothstep(0.0, 0.07, abs(r - pr))) * (1.0 - p) * now;
  float disc = (1.0 - smoothstep(0.0, 0.7, r)) * 0.16 * now;
  float a = ring * mix(0.26, 0.9, max(now, done * 0.6)) + wave * 0.8 + disc;
  vec3 rgb = mix(vec3(1.0, 0.45, 0.06), vec3(1.0, 0.8, 0.4), now * 0.5) * uGain;
  gl_FragColor = vec4(rgb, clamp(a * (r < 1.0 ? 1.0 : 0.0), 0.0, 1.0) * uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
  });
  const routeFlows = D.flows.map((f, fi) => {
    const ribbon = {}, rings = {}, meshes = [], bucket = (map, key, make) => map[key] || (map[key] = make());
    const quad = (g, ax, az, bx, bz, cx, cz, dx, dz, attrs) => { const n = g.pos.length / 3; g.pos.push(ax, RIBBON_Y, az, bx, RIBBON_Y, bz, cx, RIBBON_Y, cz, dx, RIBBON_Y, dz); attrs(g); g.idx.push(n, n + 1, n + 2, n, n + 2, n + 3); };
    const hw = RIBBON_W / 2, lifts = [];
    // One ring per step station (path end, lift landings, and pathless pickup/drop-off nodes), on the plate that owns the point.
    const station = (x, y, step) => {
      const sg = bucket(rings, plateOf(x, y), () => ({ pos: [], c: [], i: [], idx: [] }));
      quad(sg, x - CX - STATION_R, y - CY - STATION_R, x - CX + STATION_R, y - CY - STATION_R, x - CX + STATION_R, y - CY + STATION_R, x - CX - STATION_R, y - CY + STATION_R, g => { g.c.push(-1, -1, 1, -1, 1, 1, -1, 1); g.i.push(step, step, step, step); });
    };
    for (const it of f.items) {
      if (it.s.intro) continue;
      if (!it.path) { const n = D.nodes[it.s.node]; if (n) station(n.x, n.y, it.i); continue; }
      const end = it.path[it.path.length - 1];   // station: where the lot stops for this step (lift: the upper landing)
      station(end[0], end[1], it.i);
      if (it.s.lift) {
        // Landing ring at the lower end too, and one connector mesh in world space (it spans two plates, so it is not
        // parented to either): its transform is set every frame from W(E.low) -> W(E.high), see updateRoute.
        station(E.low[0], E.low[1], it.i);
        const material = makeLiftMaterial(), mesh = new T.Mesh(liftGeometry, material);
        mesh.renderOrder = 3; mesh.visible = false; mesh.name = "MF route lift flow " + fi + " step " + it.i; scene.add(mesh); meshes.push(mesh);
        lifts.push({ flow: fi, step: it.i, item: it, mesh, material, from: new T.Vector3(), to: new T.Vector3(), progress: 0, state: "future", length: 0 });
        continue;
      }
      if (!it.sched) continue;
      const pts = it.sched.pts; let cum = it.base;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < MIN_SEG) continue;
        const rx = b[0] - a[0], ry = b[1] - a[1], dx = rx / len, dy = ry / len, nx = -dy * hw, ny = dx * hw, e0 = i > 1 ? hw : 0, e1 = i < pts.length - 1 ? hw : 0;
        // Split at the plate boundaries (x = PLATE_X; right of it y = PLATE_Y) so every portion belongs to the plate it lies on.
        // Neighbouring pieces on the same plate merge back; aU stays the global distance and only true corners get the joint overlap.
        const cuts = [0]; { const tc = []; if (rx) { const t = (PLATE_X - a[0]) / rx; if (t > 0 && t < 1) tc.push(t); } if (ry) { const t = (PLATE_Y - a[1]) / ry; if (t > 0 && t < 1) tc.push(t); } tc.sort((p, q) => p - q); cuts.push(...tc, 1); }
        const pieces = [];
        for (let k = 1; k < cuts.length; k++) {
          const t0 = cuts[k - 1], t1 = cuts[k], tm = (t0 + t1) / 2, plate = plateOf(a[0] + rx * tm, a[1] + ry * tm), last = pieces[pieces.length - 1];
          if (last && last.plate === plate) last.t1 = t1; else pieces.push({ plate, t0, t1 });
        }
        for (const pc of pieces) {
          const s0 = pc.t0 === 0 ? e0 : 0, s1 = pc.t1 === 1 ? e1 : 0;   // joint overlap only at the segment's own ends
          const ax = a[0] + rx * pc.t0 - CX - dx * s0, ay = a[1] + ry * pc.t0 - CY - dy * s0, bx = a[0] + rx * pc.t1 - CX + dx * s1, by = a[1] + ry * pc.t1 - CY + dy * s1;
          const g = bucket(ribbon, pc.plate, () => ({ pos: [], u: [], v: [], idx: [] }));
          const u0 = cum + pc.t0 * len * PT_M - s0 * PT_M, u1 = cum + pc.t1 * len * PT_M + s1 * PT_M;
          quad(g, ax + nx, ay + ny, ax - nx, ay - ny, bx - nx, by - ny, bx + nx, by + ny, h => { h.u.push(u0, u0, u1, u1); h.v.push(1, -1, -1, 1); });
        }
        cum += len * PT_M;
      }
    }
    const make = (map, material, order, names) => { for (const [key, g] of Object.entries(map)) {
      const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(g.pos, 3));
      for (const [attr, size, src] of names) geo.setAttribute(attr, new T.Float32BufferAttribute(g[src], size));
      geo.setIndex(g.idx); geo.computeBoundingSphere();
      const mesh = new T.Mesh(geo, material); mesh.renderOrder = order; mesh.visible = false; mesh.name = "MF route " + key; plates[key].add(mesh); meshes.push(mesh);
    } };
    make(ribbon, ribbonMaterial, 3, [["aU", 1, "u"], ["aV", 1, "v"]]); make(rings, ringMaterial, 4, [["aC", 2, "c"], ["aI", 1, "i"]]);
    return { meshes, lifts, shown: false };
  });
  const routeLifts = routeFlows.flatMap(r => r.lifts);
  let routeShownFlow = -1, routeShownAlpha = -1;
  function updateRoute(cur, lp) {
    const a = clamp((S.R - .15) / .7, 0, 1), alpha = a * a * (3 - 2 * a); planLine = 1 - alpha;
    routeU.alpha.value = alpha; routeU.time.value = S.t; routeU.step.value = cur.i;
    routeU.done.value = (cur.base || 0) + (cur.path && !cur.s.lift ? lp.d * PT_M : 0);
    const show = alpha > .01;
    if (routeShownFlow !== S.flow || routeShownAlpha !== (show ? 1 : 0)) {
      routeShownFlow = S.flow; routeShownAlpha = show ? 1 : 0;
      routeFlows.forEach((r, i) => { for (const m of r.meshes) m.visible = show && i === S.flow; });
    }
    // Elevator connectors of the shown flow: re-aimed from the exact floor-lift ends (liftLow/liftHigh = W(E.low)/W(E.high) at the
    // current stack, set in frame()). Preallocated vectors, transform and uniform values only; geometry is never touched.
    const lifts = routeFlows[S.flow].lifts;
    for (let k = 0; k < lifts.length; k++) {
      const L = lifts[k], m = L.mesh, u = L.material.uniforms;
      L.state = cur.i < L.step ? "future" : cur.i > L.step ? "past" : "current";
      const p = L.state === "past" ? 1 : L.state === "current" ? clamp(lp.lift ?? 0, 0, 1) : 0;
      L.progress = p; L.from.copy(liftLow); L.to.copy(liftHigh);
      liftDir.subVectors(liftHigh, liftLow); const length = liftDir.length(); L.length = length;
      m.position.copy(liftLow); m.scale.set(1, 1, Math.max(length, 1e-6));
      if (length > 1e-6) m.quaternion.setFromUnitVectors(LIFT_AXIS, liftDir.multiplyScalar(1 / length)); else m.quaternion.identity();
      const metres = length * PT_M;
      u.uLen.value = metres;
      u.uDone.value = p <= 0 ? -.5 : p >= 1 ? metres + .5 : p * metres;   // before: all dim; after: all lit; during: the head sits exactly at the lot
      u.uHead.value = p > 0 && p < 1 ? 1 : 0;
    }
  }

  /* ---------- camera ---------- */
  const fit = () => { const a = camera.aspect, f = Math.tan((camera.fov * Math.PI) / 360); return Math.max(330 / f, 560 / (f * a)); };
  const flat = () => S.view === "2d";
  const PRESET = {
    e1: [285, 330, 640, -.4, .9], e21: [730, 373, 520, .35, .95], e22: [835, 223, 420, -.5, 1],
    elev: [E.low[0], E.low[1], 340, -.9, 1.15], machines: [75, 215, 300, -1.05, 1.16], docks: [290, 440, 340, .55, 1.2], racks: [320, 330, 300, -.25, 1.25]
  };
  function aim(x, y, z, dist, az, pol) { want.x = x; want.y = y; want.z = z; want.dist = dist; want.az = az; want.pol = pol; }
  // Guided camera: the azimuth is a constant per story step (only a step change moves it, and then slowly);
  // the look target is the lot blended toward the middle of the segment it is travelling, and the distance frames
  // that segment. Corners never turn the camera: only the target and distance ease (spring) to the next segment.
  const AZ_STEP = [-.55, -.3, -.8, -.45, -.7, -.25];
  let guidedAz = 0, guidedReady = false, frameDt = 1 / 60;
  const chaseExitAngles = new Map();
  // Speed-aware follow. At 8x the lot travels 8x faster in world space, and a critically damped spring chasing a goal that moves
  // at velocity v lags by 2v/omega: the lag would grow with speed. Two measures keep it bounded:
  //  1) velocity feed-forward: setWant publishes the current world velocity of the goal (camFF, units/s, already x speed and
  //     x the share of the lot motion the goal carries); the spring integrates in the goal's frame, so a constant-velocity goal has
  //     zero steady lag at any speed (exact for any dt);
  //  2) camScale() stiffens every follow spring with playback speed, so discrete changes (segment/step switches, corners) settle
  //     in roughly the same number of story metres instead of falling behind.
  // Discrete jumps of the goal (new segment midpoint, new step) are NOT fed forward: they go into the spring's position error and
  // are absorbed without overshoot. The feed-forward itself is low-pass filtered (FF_TAU) so it never steps the camera velocity.
  const camFF = new T.Vector3(), camFFSmooth = new T.Vector3(), FF_TAU = .12;
  const camScale = () => (S.playing && S.speed > 1 ? 1 + (S.speed - 1) * .22 : 1);
  function leadVelocity(lp, cur, share) {   // world velocity (units/s) of the lot x share, only while playing
    if (!S.playing || share <= 0) return;
    const sp = S.speed * share;
    if (lp.lift != null) {
      const span = Math.max(.001, cur.tm - cur.t0), u = clamp((S.t - cur.t0) / span, 0, 1), k = 6 * u * (1 - u) / span * sp;   // d ease(u) / dt
      camFF.subVectors(liftHigh, liftLow).multiplyScalar(k);
    } else if (lp.k === "move" && lp.v > 0) { const s = lp.v / PT_M * sp; camFF.set(Math.sin(lp.h) * s, 0, Math.cos(lp.h) * s); }
  }
  function setWant() {
    camFF.set(0, 0, 0);
    if (S.cam !== "guided") guidedReady = false;
    if (S.cam === "free") return;
    const cur = stepAt(S.t);
    if (S.cam === "guided" || S.cam === "follow") {
      if (S.cam === "guided" && cur.s.intro) { const e = ease(S.R); aim(0, 0, 0, fit() * lerp(1, .9, e), lerp(0, -.5, e), lerp(.001, 1, e)); guidedReady = false; return; }
      const lp = frameLot, p = worldFromLot(lp, S.stack, cameraPoint); let d = S.cam === "follow" ? 300 : cur.s.dist * (S.stack > .5 ? 1.05 : 1.2), share = 1;
      if (S.cam === "guided" && cur.sched && lp.lift == null && cur.sched.phases.length) {
        const a = cur.sched.pts[lp.seg], b = cur.sched.pts[lp.seg + 1];
        if (a && b) {
          W(a[0], a[1], S.stack, .8, segmentA); W(b[0], b[1], S.stack, .8, segmentB);
          const length = segmentA.distanceTo(segmentB); p.lerp(segmentA.lerp(segmentB, .5), .65); share = .35;   // the goal carries 35% of the lot's motion
          d = clamp(length * 1.35, d * .85, d * 1.8);
        }
      }
      const targetAz = S.cam === "follow" ? -.55 : AZ_STEP[cur.i % AZ_STEP.length];
      if (!guidedReady || flat()) { guidedAz = targetAz; guidedReady = true; } else guidedAz += wrapPi(targetAz - guidedAz) * (1 - Math.exp(-frameDt * 1.3 * camScale()));
      aim(p.x, p.y, p.z, flat() ? d * 1.5 : d, flat() ? 0 : guidedAz, flat() ? .001 : .94);
      leadVelocity(lp, cur, share);
    } else if (S.cam === "forklift") {
      const m = REP.movers[0]; if (!m || !m.v) return; const p = m.v.getWorldPosition(cameraPoint); aim(p.x, p.y + 12, p.z, 92, (m.heading ?? m.v.rotation.y) + Math.PI, 1.28);
    } else if (S.cam === "chase") {
      const p = worldFromLot(frameLot, S.stack, cameraPoint);
      let az = frameLot.h + Math.PI;
      if (frameLot.lift != null) {
        // Look in from the nearest open edge of the upper landing, not through its slab/racks.
        if (!chaseExitAngles.has(E.label)) {
          // Include bridges projecting beyond the source picture: its edge alone is not an open edge.
          const group = plates[plateOf(E.high[0], E.high[1])]; group.updateWorldMatrix(true, true);
          const b = new T.Box3().setFromObject(group), landing = W(E.high[0], E.high[1]);
          const sides = [[landing.x - b.min.x, -Math.PI / 2], [b.max.x - landing.x, Math.PI / 2], [landing.z - b.min.z, Math.PI], [b.max.z - landing.z, 0]];
          chaseExitAngles.set(E.label, sides.reduce((a, b) => b[0] < a[0] ? b : a)[1]);
        }
        az = chaseExitAngles.get(E.label);
      }
      aim(p.x, p.y + 4, p.z, frameLot.lift != null ? 180 : 120, az, 1.3); leadVelocity(frameLot, cur, 1);
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
  // Same exact integration, in the frame of a goal that moves at constant velocity gv over the step (gv = 0 gives spring() above):
  // e = x - goal(t), e(t) = (e0 + (ev0 + w e0) t) exp(-w t). Stable for any dt (long frames, 8x playback).
  function springFF(point, velocity, goal, gv, omega, dt) {
    const decay = Math.exp(-omega * dt);
    for (let i = 0; i < AXES.length; i++) {
      const axis = AXES[i], v = gv[axis], e0 = point[axis] - (goal[axis] - v * dt), ev0 = velocity[axis] - v, j = ev0 + omega * e0;
      point[axis] = goal[axis] + (e0 + j * dt) * decay; velocity[axis] = v + (ev0 - omega * j * dt) * decay;
    }
  }
  function moveCam(dt) {
    const c = S.c;
    if (S.cam === "free") {
      const sp = Math.sin(c.pol); camera.position.set(c.x + c.dist * sp * Math.sin(c.az), c.y + c.dist * Math.cos(c.pol), c.z + c.dist * sp * Math.cos(c.az));
      cameraTarget.set(c.x, c.y, c.z); eyeVelocity.set(0, 0, 0); targetVelocity.set(0, 0, 0); camFFSmooth.set(0, 0, 0);
    } else {
      const sp = Math.sin(want.pol); desiredTarget.set(want.x, want.y, want.z);
      desiredEye.set(want.x + want.dist * sp * Math.sin(want.az), want.y + want.dist * Math.cos(want.pol), want.z + want.dist * sp * Math.cos(want.az));
      if (S.cam === "chase") protectChaseEye(desiredEye);
      const omega = (S.cam === "chase" || S.cam === "forklift" ? 8 : stepAt(S.t).s.intro ? 9 : S.cam === "guided" ? 3.2 : 5) * camScale();
      const blend = 1 - Math.exp(-dt / FF_TAU); camFFSmooth.x += (camFF.x - camFFSmooth.x) * blend; camFFSmooth.y += (camFF.y - camFFSmooth.y) * blend; camFFSmooth.z += (camFF.z - camFFSmooth.z) * blend;
      springFF(camera.position, eyeVelocity, desiredEye, camFFSmooth, omega, dt); springFF(cameraTarget, targetVelocity, desiredTarget, camFFSmooth, omega, dt);
      // A spring or a seek can leave the rendered eye below its safe goal. Guard the actual eye too.
      if (S.cam === "chase") { const before = camera.position.y; protectChaseEye(camera.position); if (camera.position.y !== before) eyeVelocity.y = Math.max(0, eyeVelocity.y); }
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
  // One orange route style for every mode. The 3D route is the floor ribbon mesh (see "route light"); this 2D canvas
  // line carries the flat plan (ribbon alpha 0) and cross-fades with the ribbon as the factory rises.
  const ROUTE = { core: "#ff9a1f", hot: "#ffd9a0", glow: "#ff8a1f38", faint: "#ff9a1f66", future: "#ff9a1f55" };
  let measuredMetres = NaN, measurementText = "", measurementWidth = 0, planLine = 1;
  function draw(time) {
    g2.clearRect(0, 0, innerWidth, innerHeight);
    if (S.net) for (let i = 0; i < connections.length; i++) { const c = connections[i]; stroke(poly(c.pts), c.color === "#3B7D23" ? "#3fae5acc" : "#5b8fb9cc", 1.4); }
    const f = F(), cur = frameLot.it;
    if (planLine > .01) {
      g2.globalAlpha = planLine;
      for (let n = 0; n < f.items.length; n++) {
        const it = f.items[n]; if (!it.path) continue;
        const p = poly(it.path);
        if (it.i > cur.i) stroke(p, ROUTE.future, 3);
        else if (it.i < cur.i) { stroke(p, ROUTE.glow, 10); stroke(p, ROUTE.core, 4); if (p.length > 1) arrow(p[p.length - 2], p[p.length - 1], ROUTE.core, 12); }
        else {
          stroke(p, ROUTE.future, 3);
          if (it.s.lift) { proj(W(E.low[0], E.low[1], S.stack, .8, overlayWorld), liftPoints[0]); proj(lotPoint, liftPoints[1]); stroke(liftPoints, ROUTE.core, 5); }
          else {
            // the bright part ends at the exact schedule distance (frameLot.u = d / length), not at a time fraction
            const m = along(it.path, frameLot.u, pathHead), head = pathInfo(it.path).head;
            for (let i = 0; i < m.i; i++) { head[i][0] = p[i][0]; head[i][1] = p[i][1]; head[i][2] = p[i][2]; }
            proj(W(m.x, m.y, S.stack, S.R * 1.5 + .8, overlayWorld), head[m.i]);
            stroke(head, ROUTE.glow, 12, NO_DASH, 0, m.i + 1); stroke(head, ROUTE.core, 4.5, NO_DASH, 0, m.i + 1); stroke(head, ROUTE.hot, 1.6, FLOW_DASH, -time * 24, m.i + 1);
          }
        }
      }
      g2.globalAlpha = 1;
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
    // Only six labels are visible, around the current step (two behind, the rest ahead; the window slides at either end).
    // All 25 chip nodes still exist; the rest are always hidden (hard cap of six, also with "All flows" on: that only adds network routes).
    const real = f.items.filter(it => !it.s.intro), at = cur.s.intro ? 0 : real.findIndex(it => it.i === cur.i) - 2, lo = clamp(at, 0, Math.max(0, real.length - 6));
    const near = new Set(real.slice(lo, lo + 6).map(it => it.s.node));
    return nodes.map(n => { const it = use[n.id], base = "chip" + (it ? "" : " dim"), suffix = it && it.i === cur.i ? " now" : it && it.i < cur.i ? " done" : ""; return { it, near: !!it && near.has(n.id), off: base + suffix, on: base + (it ? " on" : "") + suffix, text: it ? `${it.i}  ${it.s.title}` : "" }; });
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
      if (!labelState[i].near) { if (chip.display !== "none") chip.el.style.display = chip.display = "none"; continue; }
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
  const card = $("card"), stepPanel = $("steps"), list = $("list"), timeLabel = $("time"), playButton = $("play"), stackControl = $("stack"), elapsedLabel = $("tElapsed"), endLabel = $("tEnd"), stepCount = $("stepNo");
  card.style.contain = stepPanel.style.contain = "layout paint";
  // The card lives inside the glass bar: a centred title and subtitle, then one quiet line of facts.
  const cardCache = D.flows.map(f => f.items.map(cur => {
    const e = document.createElement("div"); e.style.display = "none";
    const stat = cur.s.intro ? "" : `<div class="st"><span class="m ${cur.s.mode}">${cur.s.mode === "auto" ? "Auto" : cur.s.lift ? "Elevator" : "Step"}</span><span>${cur.metres ? cur.metres.toFixed(0) + " m this step" : cur.s.lift ? "Between floors" : "At this point"}</span><span>${(cur.run || 0).toFixed(0)} m so far</span></div>`;
    e.innerHTML = `<b>${cur.s.intro ? "" : cur.i + ". "}${cur.s.title}</b><p>${cur.s.what}</p>${stat}`;
    return e;
  }));
  let stepRows = [], stepTop = [], stepBottom = [], panelHeight = 0, panelScroll = 0, shown = -1, shownCard = null;
  stepPanel.addEventListener("scroll", () => { panelScroll = stepPanel.scrollTop; }, { passive: true });
  function cacheStepLayout() { panelHeight = stepPanel.clientHeight; panelScroll = stepPanel.scrollTop; for (let i = 0; i < stepRows.length; i++) { stepTop[i] = stepRows[i].offsetTop; stepBottom[i] = stepTop[i] + stepRows[i].offsetHeight; } }
  function renderFlow() {
    $("title").textContent = D.slide.title;
    $("flows").innerHTML = D.flows.map((f, i) => `<button data-f="${i}" class="${i === S.flow ? "on" : ""}" aria-pressed="${i === S.flow}">${f.name}</button>`).join("");
    $("flows").querySelectorAll("button").forEach(b => b.onclick = () => setFlow(+b.dataset.f));
    const f = F(); scrub.querySelectorAll("i").forEach(e => e.remove());
    f.items.forEach(it => { const m = document.createElement("i"); m.style.left = it.tm / f.total * 100 + "%"; m.setAttribute("aria-hidden", "true"); scrub.append(m); });
    endLabel.textContent = fmt(f.total); renderStep.progress = renderStep.seconds = renderStep.step = null; scrub.setAttribute("aria-valuemax", String(Math.round(f.total)));
    list.innerHTML = f.items.map(it => `<li data-i="${it.i}" tabindex="0" role="button"><span class="n">${it.s.intro ? "&#9733;" : it.i}</span><span><b>${it.s.title}</b><small>${it.s.intro ? "The replica rises out of the plan." : it.s.what}</small></span></li>`).join("");
    stepRows = Array.from(list.querySelectorAll("li")); stepTop = new Array(stepRows.length); stepBottom = new Array(stepRows.length);
    stepRows.forEach((row, i) => { row.onclick = () => { seek(f.items[i].tm); pause(); }; row.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); row.onclick(); } }; });
    if (shownCard) shownCard.style.display = "none"; shownCard = null; shown = -1; card.replaceChildren(...cardCache[S.flow]); cacheStepLayout();
  }
  function renderStep() {
    const f = F(), cur = frameLot.it, progress = Math.round(S.t / f.total * 10000), seconds = Math.floor(S.t);
    if (renderStep.progress !== progress) { fill.style.width = hd.style.left = progress / 100 + "%"; renderStep.progress = progress; }
    if (renderStep.seconds !== seconds || renderStep.flow !== S.flow || renderStep.step !== cur.i) {
      timeLabel.textContent = `${fmt(S.t)} / ${fmt(f.total)}  step ${cur.i}/${f.items.length - 1}`; elapsedLabel.textContent = fmt(S.t); stepCount.textContent = cur.s.intro ? "Introduction" : `Step ${cur.i} of ${f.items.length - 1}`;
      scrub.setAttribute("aria-valuenow", String(seconds)); scrub.setAttribute("aria-valuetext", `${fmt(S.t)} of ${fmt(f.total)}, ${cur.s.intro ? "introduction" : `step ${cur.i} of ${f.items.length - 1}: ${cur.s.title}`}`);
      renderStep.seconds = seconds; renderStep.flow = S.flow; renderStep.step = cur.i;
    }
    if (renderStep.playing !== S.playing) { playButton.classList.toggle("is-playing", S.playing); playButton.setAttribute("aria-label", S.playing ? "Pause" : "Play"); playButton.setAttribute("aria-pressed", String(S.playing)); renderStep.playing = S.playing; }
    if (shown !== cur.i) {
      shown = cur.i;
      for (let i = 0; i < stepRows.length; i++) stepRows[i].className = i === cur.i ? "now" : i < cur.i ? "done" : "";
      if (shownCard) shownCard.style.display = "none"; shownCard = cardCache[S.flow][cur.i]; shownCard.style.display = "block";
      if (S.panel && !bareOn && panelHeight) {
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
  function setView(v) { S.view = v; S.stackUser = null; $("views").querySelectorAll("button").forEach((b) => { b.classList.toggle("on", b.dataset.v === v); b.setAttribute("aria-pressed", String(b.dataset.v === v)); }); if (S.cam === "free") setCam("guided"); }
  function setCam(c) { S.cam = c; $("cam").value = c; $("cam").querySelector('[value="free"]').hidden = c !== "free"; }
  function setPlan(p) { S.plan = p; $("planBtn").textContent = p === "replica" ? "Plan: replica" : "Plan: original"; }
  function tip(m) { const e = $("tip"); e.textContent = m; e.style.display = "block"; clearTimeout(tip.t); tip.t = setTimeout(() => (e.style.display = "none"), 1900); }
  function toFree() { if (S.cam !== "free") { setCam("free"); tip("Free camera: press G to go back to the guided camera"); } }
  function setMeasure(on) { S.measure = on; S.pts = []; $("measure").classList.toggle("on", on); $("measure").setAttribute("aria-pressed", String(on)); if (on) tip("Measure: click two points on the floor"); }
  $("play").onclick = () => (S.playing ? pause() : play()); $("prev").onclick = () => stepBy(-1); $("next").onclick = () => stepBy(1); $("first").onclick = () => { seek(0); pause(); };
  // Playback speed: the native #speed select stays the one source of truth (0.5 .. 8x). [ and ] step through its options with
  // bounds (no wrap); the select shows the new value, keeps focus state and is not re-created.
  const speedSelect = $("speed"), speedOptions = Array.from(speedSelect.options);
  function setSpeed(v, say) {
    let best = 0; for (let i = 1; i < speedOptions.length; i++) if (Math.abs(+speedOptions[i].value - v) < Math.abs(+speedOptions[best].value - v)) best = i;
    S.speed = +speedOptions[best].value; speedSelect.selectedIndex = best;
    if (say) tip("Speed " + speedOptions[best].textContent);
  }
  function stepSpeed(d) {
    let at = 0; for (let i = 1; i < speedOptions.length; i++) if (Math.abs(+speedOptions[i].value - S.speed) < Math.abs(+speedOptions[at].value - S.speed)) at = i;
    const next = clamp(at + d, 0, speedOptions.length - 1);
    if (next === at) { tip(d > 0 ? "Top speed " + speedOptions[at].textContent : "Lowest speed " + speedOptions[at].textContent); return; }
    setSpeed(+speedOptions[next].value, true);
  }
  speedSelect.onchange = (e) => setSpeed(+e.target.value); $("stepstop").onchange = (e) => (S.stepStop = e.target.checked);
  $("views").querySelectorAll("button").forEach((b) => (b.onclick = () => setView(b.dataset.v)));
  $("cam").onchange = (e) => setCam(e.target.value); $("look").onchange = (e) => setLook(e.target.value); $("quality").onchange = (e) => setQuality(e.target.value);
  $("focusBtn").onclick = () => { S.focus = !S.focus; $("focusBtn").classList.toggle("on", S.focus); };
  $("soundBtn").onclick = () => { S.sound = !S.sound; $("soundBtn").classList.toggle("on", S.sound); if (S.sound) audio(); };
  $("planBtn").onclick = () => setPlan(S.plan === "replica" ? "original" : "replica"); $("measure").onclick = () => setMeasure(!S.measure);
  $("stack").oninput = (e) => (S.stackUser = e.target.value / 100);
  const tog = (id, k, fn) => { const f = () => { S[k] = !S[k]; $(id).classList.toggle("on", S[k]); $(id).setAttribute("aria-pressed", String(S[k])); fn && fn(); }; $(id).onclick = f; return f; };
  let bareOn = false, lastActive = performance.now(), faded = false;
  // Hidden UI must not be clickable or focusable: opacity and pointer-events on the .ui parent are not enough (a child can
  // set pointer-events:auto, and hidden controls stay in the tab order). H hides every .ui; idle hides all but help/tip/err.
  const uiPanels = Array.from(document.querySelectorAll(".ui")), UI_ALWAYS = ["help", "tip", "err"];
  function syncUiHidden() {
    for (let i = 0; i < uiPanels.length; i++) {
      const el = uiPanels[i], hide = bareOn || (faded && !UI_ALWAYS.includes(el.id));
      if (el.inert !== hide) { el.inert = hide; if (hide && el.contains(document.activeElement)) document.activeElement.blur(); }
    }
  }
  const tLbl = tog("lblBtn", "labels"), tNet = tog("netBtn", "net");
  // Steps list: collapsed by default; the rail/top-bar toggle, P and the Options entry all drive the same state.
  const tPanel = tog("panelBtn", "panel", () => { stepPanel.style.display = S.panel ? "block" : "none"; $("stepsToggle").classList.toggle("on", S.panel); $("stepsToggle").setAttribute("aria-expanded", String(S.panel)); if (S.panel) { frame.shift = -1; cacheStepLayout(); shown = -1; } else frame.shift = -1; });
  const tMini = tog("miniBtn", "mini", () => { $("mini").style.display = S.mini ? "block" : "none"; drawMini.last = null; });
  tog("blurBtn", "blur", () => { syncQualityClasses(); if (S.blur && S.quality === "low") tip("Glass blur stays off on Low quality"); });
  const tRoof = tog("roofBtn", "roof", () => { applyRoof(); if (!hasRoof()) tip("The roof is not available in this build"); });
  $("stepsToggle").onclick = tPanel; $("stepsClose").onclick = tPanel;
  // Glass popovers beside the rail: Options and Camera. One open at a time; Escape or an outside click closes them.
  const popovers = [["opts", "optBtn", "flex"], ["camPop", "camBtn", "flex"]];
  function closePopovers(except) { for (const [id, btn, show] of popovers) if (id !== except) { $(id).style.display = "none"; $(btn).classList.remove("on"); $(btn).setAttribute("aria-expanded", "false"); } }
  for (const [id, btn, show] of popovers) $(btn).onclick = (e) => { e.stopPropagation(); const open = $(id).style.display !== show; closePopovers(open ? id : null); $(id).style.display = open ? show : "none"; $(btn).classList.toggle("on", open); $(btn).setAttribute("aria-expanded", String(open)); };
  addEventListener("pointerdown", (e) => { if (!e.target.closest("#opts,#camPop,#rail,#help")) closePopovers(null); });
  $("zi").onclick = () => zoom(.8); $("zo").onclick = () => zoom(1.25);
  const toggleHelp = () => { const h = $("help"); const open = h.style.display !== "block"; h.style.display = open ? "block" : "none"; $("helpBtn").classList.toggle("on", open); $("helpBtn").setAttribute("aria-expanded", String(open)); }; $("helpBtn").onclick = toggleHelp;
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()); $("full").onclick = fullscreen;
  function zoom(k) { toFree(); S.c.dist = clamp(S.c.dist * k, 30, 4000); }
  const toggleBare = () => { bareOn = !bareOn; document.body.classList.toggle("bare", bareOn); if (bareOn) closePopovers(null); syncUiHidden(); frame.shift = -1; };
  const scrubTo = (e) => { const r = scrub.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * F().total); };
  scrub.onpointerdown = (e) => { scrub.setPointerCapture(e.pointerId); scrubTo(e); pause(); scrub.onpointermove = scrubTo; }; scrub.onpointerup = () => { scrub.onpointermove = null; scrub.blur(); };
  // Timeline keyboard (when it has focus): arrows +-5 s (Shift +-15 s), PageUp/PageDown previous/next step, Home/End.
  scrub.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return; const k = e.key, big = e.shiftKey ? 15 : 5;
    const act = { ArrowRight: () => seek(S.t + big), ArrowUp: () => seek(S.t + big), ArrowLeft: () => seek(S.t - big), ArrowDown: () => seek(S.t - big), PageDown: () => stepBy(1), PageUp: () => stepBy(-1), Home: () => seek(0), End: () => seek(F().total) }[k];
    if (act) { e.preventDefault(); e.stopPropagation(); act(); if (k !== "ArrowRight" && k !== "ArrowLeft" && k !== "ArrowUp" && k !== "ArrowDown") pause(); }
  });
  // A mouse click on a button should not keep keyboard focus (Space stays play/pause); keyboard use keeps its focus ring.
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b && e.detail > 0) b.blur(); });
  // Wake the glass UI on any interaction; fade it after 4 s without pointer movement while playing (see tick).
  const wake = () => { lastActive = performance.now(); };
  for (const type of ["pointermove", "pointerdown", "wheel", "keydown", "focusin", "touchstart"]) addEventListener(type, wake, { passive: true });
  function syncPressed() { document.querySelectorAll("button[aria-pressed]").forEach(b => { if (b.id === "play" || b.closest("#flows")) return; const on = b.classList.contains("on"); if (b.getAttribute("aria-pressed") !== String(on)) b.setAttribute("aria-pressed", String(on)); }); }
  addEventListener("keydown", () => setTimeout(syncPressed, 0)); addEventListener("click", () => setTimeout(syncPressed, 0));
  function updateFade(now) {
    const inside = document.activeElement && document.activeElement.closest && document.activeElement.closest(".ui");
    const want = S.autoFade && S.playing && now - lastActive > 4000 && !inside && !S.measure;
    if (want !== faded) { faded = want; document.body.classList.toggle("idle", want); syncUiHidden(); }
  }

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
    const tag = e.target.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || e.ctrlKey || e.altKey || e.metaKey) return; const k = e.key.toLowerCase();
    if (tag === "SELECT" && k !== "[" && k !== "]") return;   // a focused select keeps its own keys; only the speed steppers pass
    if ((k === " " || k === "enter") && (tag === "BUTTON" || e.target.getAttribute("role") === "button")) return;   // native activation for a focused control
    const act = { " ": () => (S.playing ? pause() : play()), arrowright: () => stepBy(1), arrowleft: () => stepBy(-1), home: () => { seek(0); pause(); }, end: () => { seek(F().total); pause(); }, 2: () => setView("2d"), 3: () => setView("3d"), a: () => setView("auto"), g: () => setCam("guided"), l: tLbl, n: tNet, p: tPanel, r: tRoof, "[": () => stepSpeed(-1), "]": () => stepSpeed(1), f: fullscreen, h: toggleBare, "?": toggleHelp, "+": () => zoom(.8), "=": () => zoom(.8), "-": () => zoom(1.25), m: () => setMeasure(!S.measure), o: () => setPlan(S.plan === "replica" ? "original" : "replica"), escape: () => { setMeasure(false); closePopovers(null); if ($("help").style.display === "block") toggleHelp(); },
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

  /* ---------- planar floor reflection (High quality only) ----------
     ONE shared render target and ONE extra scene render, shared by every floor that lies on the reflected plane:
       - mirrored virtual camera + oblique near plane (the THREE.Reflector maths, written out so one target serves all floors);
       - target = a quarter of the framebuffer per axis (480 x 272 at 1080p), rounded to 16 px, clamped 64..640, allocated once
         (lazily, or in MF.ready on High) and only resized when that bucket changes; never per frame;
       - refreshed every second frame (st.every); the floor shader samples it through a world-position matrix, so the texture stays
         glued to the ground between refreshes;
       - Low/Medium, Blueprint, the original-plan art, a camera below the floor, or a view where no reflected floor is on screen:
         NO scene render at all; every floor's weight uniform goes to 0 (the floor program itself never changes);
       - recursion guard: floors, slabs, original plan images, route light, beacon, contact blob, grid and atmosphere are hidden
         for the duration of the render and restored in finally (together with the target, matrixWorldAutoUpdate).
     Stacked floors: a single plane cannot serve floors at different heights. The dominant floor (nearest to the camera target,
     with hysteresis) picks the plane; only floors within 0.6 units of that height keep a reflection weight, the others fade to 0
     (so with floors separated, only the dominant level is reflective; at stack 0 every floor is coplanar and shares it).
     Round 5 correction: map, matrix and plane height (U.plane) are published together, only after a successful render, and the floor
     shader masks any fragment whose world Y is not on U.plane. A plane change forces a render in the same frame (no 2-frame wait). */
  const reflection = (() => {
    const U = window.MFLook.reflectionUniforms(T);
    const st = { enabled: query.get("reflect") !== "0", active: false, reason: "init", every: 2, tick: 0, stale: true, renders: 0, skipped: 0, skippedOffscreen: 0, planeY: 0, published: 0, planeChanges: 0, dominant: "", width: 0, height: 0, lastMs: 0, maxMs: 0, calls: 0, triangles: 0, allocations: 0, halfFloat: true, error: null };
    const SCALE = .25, GRID = 16, MIN_SIDE = 64, MAX_SIDE = 640, HYST = 60, SAME_PLANE = .6, CLIP_BIAS = 0;
    const cam = new T.PerspectiveCamera(); cam.matrixWorldAutoUpdate = false;
    const eye = new T.Vector3(), tgt = new T.Vector3(), UP = new T.Vector3(0, 1, 0), plane = new T.Plane(), clip = new T.Vector4(), q = new T.Vector4();
    const frustum = new T.Frustum(), frustumMatrix = new T.Matrix4(), floorBox = new T.Box3();
    const pending = new T.Matrix4(), savedViewport = new T.Vector4(), savedScissor = new T.Vector4(), nowViewport = new T.Vector4(), nowScissor = new T.Vector4(), NO_PLANE = -1e9, PLANE_EPS = .05;
    let target = null, hide = null, hidden = null, dominant = null;
    // The floor shader samples (map, matrix) only where world Y == U.plane (look.js mask). The three are published together, and only
    // after a render succeeded; anything that makes the texture unusable (new/resized target, error, reflection off) withdraws the plane,
    // which masks every floor at once.
    const withdraw = () => { U.plane.value = NO_PLANE; };
    const floorY = f => f.art.parent.position.y + f.art.position.y;
    const side = px => clamp(Math.round(px * SCALE / GRID) * GRID, MIN_SIDE, MAX_SIDE);
    function ensure() {
      const w = side(innerWidth * Math.min(devicePixelRatio, 1)), h = side(innerHeight * Math.min(devicePixelRatio, 1));
      if (!target) {
        const half = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
        target = new T.WebGLRenderTarget(w, h, { type: half ? T.HalfFloatType : T.UnsignedByteType, colorSpace: half ? T.NoColorSpace : T.SRGBColorSpace, format: T.RGBAFormat, depthBuffer: true, stencilBuffer: false, samples: 0, generateMipmaps: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
        target.texture.name = "MF floor reflection"; U.map.value = target.texture; st.halfFloat = half; st.allocations++; st.stale = true; withdraw();
      } else if (target.width !== w || target.height !== h) { target.setSize(w, h); st.allocations++; st.stale = true; withdraw(); }   // resized: contents are gone
      st.width = w; st.height = h; U.texel.value.set(1 / w, 1 / h);
    }
    function collectHide() {
      hide = [grid, beacon, contactBlob, ...origs, ...atmosObjects, ...routeFlows.flatMap(r => r.meshes)];
      for (const f of floors) hide.push(f.art, f.slab);
      hide = hide.filter(Boolean); hidden = new Uint8Array(hide.length);
    }
    // Renders the reflected scene for the horizontal plane y = py into the shared target and updates the sampling matrix.
    function renderAt(py) {
      ensure(); if (!hide) collectHide();
      const m = camera.matrixWorld.elements; eye.setFromMatrixPosition(camera.matrixWorld);
      if (eye.y <= py + .5) return false;
      // mirrored eye, forward and up (Reflector): reflecting about y = py negates the y offset only
      cam.position.set(eye.x, 2 * py - eye.y, eye.z); cam.up.set(m[4], -m[5], m[6]);
      tgt.set(eye.x - m[8], 2 * py - (eye.y - m[9]), eye.z - m[10]); cam.lookAt(tgt);
      cam.near = camera.near; cam.far = camera.far; cam.projectionMatrix.copy(camera.projectionMatrix); cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse); cam.updateMatrixWorld();
      pending.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);   // before the oblique edit; published only after the render
      // oblique near plane = the floor plane, so nothing below the floor (or between the mirrored eye and the floor) is drawn
      plane.set(UP, -py).applyMatrix4(cam.matrixWorldInverse); clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const pe = cam.projectionMatrix.elements;
      q.x = (Math.sign(clip.x) + pe[8]) / pe[0]; q.y = (Math.sign(clip.y) + pe[9]) / pe[5]; q.z = -1; q.w = (1 + pe[10]) / pe[14];
      clip.multiplyScalar(2 / clip.dot(q)); pe[2] = clip.x; pe[6] = clip.y; pe[10] = clip.z + 1 - CLIP_BIAS; pe[14] = clip.w;
      const previousTarget = renderer.getRenderTarget(), previousAuto = scene.matrixWorldAutoUpdate, previousTest = renderer.getScissorTest(), t0 = performance.now();
      renderer.getViewport(savedViewport); renderer.getScissor(savedScissor);   // preallocated; setRenderTarget() is expected to restore these, this makes it certain
      for (let i = 0; i < hide.length; i++) { hidden[i] = hide[i].visible ? 1 : 0; hide[i].visible = false; }
      try {
        scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false;   // one matrix pass; the main render repeats it
        renderer.setRenderTarget(target); renderer.render(scene, cam);
        st.calls = renderer.info.render.calls; st.triangles = renderer.info.render.triangles;
      } finally {
        scene.matrixWorldAutoUpdate = previousAuto; renderer.setRenderTarget(previousTarget);
        for (let i = 0; i < hide.length; i++) hide[i].visible = hidden[i] === 1;
        const vp = renderer.getViewport(nowViewport), sc = renderer.getScissor(nowScissor);
        if (!vp.equals(savedViewport)) renderer.setViewport(savedViewport);
        if (!sc.equals(savedScissor)) renderer.setScissor(savedScissor);
        if (renderer.getScissorTest() !== previousTest) renderer.setScissorTest(previousTest);
      }
      // success: publish matrix, plane height and the freshness together (an exception above skips all of it)
      U.matrix.value.copy(pending); U.plane.value = py; st.planeY = py; st.published++;
      st.lastMs = performance.now() - t0; if (st.lastMs > st.maxMs) st.maxMs = st.lastMs;
      return true;
    }
    function off(reason) {
      st.active = false; st.reason = reason; st.stale = true; st.tick = 0; withdraw();
      for (const f of floors) { f.reflW = 0; f.surfaceMaterial.userData.floorReflect.value = 0; }
    }
    // Nearest floor to the camera target (xz distance + a little height difference), sticky within HYST world units.
    function pick() {
      let best = null, bestScore = Infinity, keep = null, keepScore = Infinity;
      for (const f of floors) {
        const g = f.art.parent.position, b = f.box, x0 = b[0] - CX + g.x, z0 = b[1] - CY + g.z;
        const dx = Math.max(x0 - cameraTarget.x, 0, cameraTarget.x - (x0 + b[2])), dz = Math.max(z0 - cameraTarget.z, 0, cameraTarget.z - (z0 + b[3]));
        const score = Math.hypot(dx, dz) + .3 * Math.abs(floorY(f) - cameraTarget.y);
        if (score < bestScore) { bestScore = score; best = f; } if (f === dominant) { keep = f; keepScore = score; }
      }
      return keep && keepScore <= bestScore + HYST ? keep : best;
    }
    // The floor program reports (once compiled) whether the Three.js markers matched; if not, never start the costly render.
    function shaderProblem() {
      for (const f of floors) { const s = f.surfaceMaterial.userData.floorShader; if (s.compiles > 0 && s.reflectionError) return s.reflectionError; }
      return null;
    }
    function update(dt) {
      if (!st.error) { const problem = shaderProblem(); if (problem) st.error = problem; }
      const why =!st.enabled ? "disabled" : st.error ? "error" : S.quality !== "high" ? "quality" : S.look === "blueprint" ? "blueprint" : S.R <= .85 || S.plan === "original" ? "plan" : "";
      if (why) { if (st.active || st.reason !== why) off(why); return; }
      dominant = pick(); const py = floorY(dominant);
      if (camera.position.y <= py + .5) { if (st.active || st.reason !== "below") off("below"); return; }
      st.dominant = dominant.key;
      // The captured plane must follow the dominant floor: a new plane (dominant switch, or that floor moving during the stack
      // animation) forces a render THIS frame instead of waiting for the 2-frame cadence, so the shared map/matrix/plane are never one
      // frame behind the floor. Until it is published, the shader masks every floor that is not on the old plane.
      if (Math.abs(py - U.plane.value) > PLANE_EPS) { if (!st.stale) st.planeChanges++; st.stale = true; }
      // weights: floors on the dominant plane fade in; every other floor fades out. Correctness does not depend on this fade: the
      // shader's world-Y plane mask (look.js) already cuts any receiver off the captured plane immediately.
      const k = 1 - Math.exp(-dt * 10); let any = false;
      frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(frustumMatrix);
      for (const f of floors) {
        const goal = Math.abs(floorY(f) - py) < SAME_PLANE ? 1 : 0; f.reflW += (goal - f.reflW) * k; if (Math.abs(goal - f.reflW) < .01) f.reflW = goal;
        f.surfaceMaterial.userData.floorReflect.value = f.reflW * (f.k ?? 1);   // focus dimming (f.k) dims the mirrored sky/ground too
        if (goal) { const g = f.art.parent.position, b = f.box; floorBox.min.set(b[0] - CX + g.x, py - 1, b[1] - CY + g.z); floorBox.max.set(b[0] - CX + g.x + b[2], py + 1, b[1] - CY + g.z + b[3]); if (frustum.intersectsBox(floorBox)) any = true; }
      }
      st.active = true; st.reason = "ok";
      if (!any) { st.skippedOffscreen++; return; }   // no reflected floor on screen: no scene render
      if (!st.stale && st.tick++ % st.every !== 0) { st.skipped++; return; }
      try { if (renderAt(py)) { st.stale = false; st.renders++; st.tick = 1; } }
      catch (e) { st.error = String(e && e.message || e); console.error("Material Flow floor reflection disabled", e); off("error"); }
    }
    function warm() {   // MF.ready: allocate and render once so the first playback frame has nothing left to create
      if (!st.enabled || S.quality !== "high") return;
      if (!st.error) { const problem = shaderProblem(); if (problem) st.error = problem; }
      if (st.error) return;   // unsupported floor shader: no costly empty render
      try { renderAt(floorY(floors[0])); st.stale = true; } catch (e) { st.error = String(e && e.message || e); console.error("Material Flow floor reflection warm-up failed", e); }
    }
    function resize() { if (target) ensure(); }
    function set(p = {}) {
      if ("enabled" in p) { st.enabled = !!p.enabled; if (st.enabled) st.error = null; }
      if (p.every) st.every = Math.max(1, p.every | 0);
      const v = U.params.value; if ("strength" in p) v.x = +p.strength; if ("f0" in p) v.y = +p.f0; if ("distort" in p) v.z = +p.distort; if ("blur" in p) v.w = +p.blur;
      return debug();
    }
    function summary() { return { enabled: st.enabled, active: st.active, reason: st.reason, renders: st.renders, skipped: st.skipped, skippedOffscreen: st.skippedOffscreen, lastMs: st.lastMs, maxMs: st.maxMs, calls: st.calls, triangles: st.triangles, width: st.width, height: st.height, allocations: st.allocations }; }
    function debug() {
      return { ...st, every: st.every, publishedPlane: U.plane.value, strength: U.params.value.x, f0: U.params.value.y, distort: U.params.value.z, blur: U.params.value.w, target: target ? { width: target.width, height: target.height, uuid: target.texture.uuid, type: target.texture.type, colorSpace: target.texture.colorSpace } : null,
        floors: floors.map(f => ({ plate: f.key, y: floorY(f), weight: f.reflW, uniform: f.surfaceMaterial.userData.floorReflect.value, program: f.surfaceMaterial.customProgramCacheKey(), patched: f.surfaceMaterial.userData.floorShader.reflectionPatched })), hidden: hide ? hide.length : 0 };
    }
    return { update, warm, resize, set, summary, debug, state: st, uniforms: U, renderNow: () => { renderAt(floorY(dominant || floors[0])); st.stale = false; st.renders++; return summary(); } };
  })();

  /* ---------- the frame ---------- */
  function resize() {
    const ratio = Math.min(devicePixelRatio, 1) * ({ high: 1, medium: .8, low: .65 }[S.quality]) * resolutionScale;
    renderer.setPixelRatio(ratio); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; frame.shift = -1; camera.updateProjectionMatrix();
    const d = Math.min(devicePixelRatio, 1), fw = Math.round(innerWidth * d), fh = Math.round(innerHeight * d); if (fx.width !== fw) fx.width = fw; if (fx.height !== fh) fx.height = fh; g2.setTransform(d, 0, 0, d, 0, 0);
    // Fixed 3/4-resolution night targets: quality switches allocate no post resources.
    if (composer && (composer.width !== innerWidth || composer.height !== innerHeight)) { composer.setPixelRatio(.75); composer.setSize(innerWidth, innerHeight); composer.width = innerWidth; composer.height = innerHeight; }
    reflection.resize();
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
    frame(raw, S.t); updateFade(now);
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
    dt = Math.max(0, dt); frameDt = dt > 0 ? Math.min(dt, .25) : 1 / 60;
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
    lot.position.copy(at).setY(at.y + S.R * .2); lot.visible = !cur.s.intro;
    lot.rotation.y = lp.h;   // pure function of story time: segment direction while moving, eased exact quarter turn at a corner
    updateRoute(cur, lp);
    cabin.position.copy(lp.lift != null ? at : lo).setY((lp.lift != null ? at.y : (li >= 0 && cur.i > li ? hi.y : lo.y)) - .5);
    beacon.visible = !cur.s.intro; beacon.position.copy(at).setY(at.y + 1.2); const pulse = (time * .8) % 1; beacon.scale.setScalar(.7 + pulse * 1.4); beacon.material.opacity = 1 - pulse;
    // focus: the plan with the lot stays bright, the others step back (colours stay, brightness falls)
    const here = lp.lift != null ? "E2" : plateOf(lp.x, lp.y);
    for (const fl of floors) { const on = !S.focus || cur.s.intro || S.R < .9 || S.cam === "overview" || fl.key === here || (here === "E2" && fl.key !== "E1"); const target = on ? 1 : .42; fl.k = lerp(fl.k ?? 1, target, 1 - Math.exp(-dt * 6)); if (Math.abs(fl.k - target) < .001) fl.k = target;
      if (fl.lastDim == null || Math.abs(fl.k - fl.lastDim) > .001 || fl.k === target && fl.lastDim !== target) { for (let i = 0; i < fl.dimMaterials.length; i++) { const dm = fl.dimMaterials[i]; if (dm.userData.base) dm.color.copy(dm.userData.base).multiplyScalar(fl.k); else dm.color.setScalar(fl.k); } fl.planMaterial.color.setRGB(.79 * fl.k, .81 * fl.k, .84 * fl.k); fl.surfaceMaterial.color.setHex(0xd0d4d2).multiplyScalar(fl.k); fl.lastDim = fl.k; metrics.dimUpdates++; }
      const material = S.R > .85 && S.plan !== "original" ? fl.surfaceMaterial : fl.planMaterial; if (fl.art.material !== material) { fl.art.material = material; mask |= 2; } }
    cue(cur);
    if (lastLiveTime !== time || lastLiveShow !== (S.R > .92)) {
      if (lastLiveShow !== (S.R > .92)) mask |= 8;
      // physical vehicle API (REP.vehicleAt): story time as-is. Legacy REP.live keeps its original .55 ambient pace.
      if (physicalVehicles) REP.live(time, S.R, dt); else REP.live(time * .55, S.R, dt * .55);
      lastLiveTime = time; lastLiveShow = S.R > .92;
    }
    if (S.look === "night") atmos?.update(time, camera, innerHeight);
    stage("scene-update", frameStart);
    const cameraStart = profile ? performance.now() : 0;
    setWant(time); moveCam(dt); if (REP.roofFade) { const cy = camera.position.y - S.stack * GAP * .5, a = 1 - Math.min(1, Math.max(0, (cy - 42) / 60)); REP.roofFade(.1 + .9 * a * a); }   // full steel at working height, a hint from above: beams never hide the trolley
    const shift = S.panel && !bareOn ? -140 : 0;   // the steps list opens on the left: nudge the scene right of it
    if (shift !== frame.shift) { frame.shift = shift; camera.setViewOffset(innerWidth, innerHeight, shift, 0, innerWidth, innerHeight); }
    stage("camera", cameraStart);
    // Bake/static shadows only. Optional sun shadow refresh waits for the final pose.
    const settled = Math.abs(S.R - goalR) < 1e-4 && (S.R < .001 || S.R > .999) && S.stack === goal;
    shadowSettled = settled ? shadowSettled + dt : 0;
    if (realtimeShadows && shadowDirty && shadowSettled > .15) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; metrics.shadows++; }
    const reflectionStart = profile ? performance.now() : 0;
    reflection.update(dt);   // High only: at most one extra low-resolution scene render every second frame, before the main render
    stage("reflection", reflectionStart);
    const renderStart = profile ? performance.now() : 0;
    if (composer && S.look === "night" && S.quality !== "low") composer.render(dt); else renderer.render(scene, camera);
    stage("render-submit", renderStart);
    const overlayStart = profile ? performance.now() : 0;
    if (shown !== cur.i) mask |= 1;
    draw(time); if (!bareOn) placeLabels(); renderStep();   // H hides every label: no label DOM work while hidden
    if (S.mini && !bareOn && (drawMini.last == null || drawMini.flow !== S.flow || Math.abs(time - drawMini.last) >= .1)) { drawMini(); drawMini.last = time; drawMini.flow = S.flow; }
    stage("overlay-dom", overlayStart); metrics.lastMask = mask; metrics.lastCPU = performance.now() - frameStart;
  }
  // Read-only, on-demand diagnostics: inspect the renderer's own uniform table, not
  // just the expected userData value. No image data URI or company image is returned.
  function debugFloor() {
    function textureInfo(tex) {
      if (!tex) return null;
      const image = tex.image || tex.source?.data;
      return { id: tex.id, uuid: tex.uuid, name: tex.name, width: image?.naturalWidth || image?.width || 0, height: image?.naturalHeight || image?.height || 0, colorSpace: tex.colorSpace, version: tex.version };
    }
    return floors.map(fl => {
      const material = fl.art.material, expected = fl.surfaceMaterial.userData.floorLight, properties = renderer.properties.get(fl.surfaceMaterial), active = renderer.properties.get(material), bound = properties.uniforms?.mfFloorLight;
      const actual = active.uniforms?.mfFloorLight, sampler = active.currentProgram?.getUniforms().map.mfFloorLight;
      let visible = true; for (let o = fl.art; o; o = o.parent) if (!o.visible) visible = false;
      return { plate: fl.key, rise: S.R, look: S.look, plan: S.plan, visible, floorY: fl.art.position.y, material: { id: material.id, name: material.name, type: material.type, isSurface: material === fl.surfaceMaterial, shaderKey: material.customProgramCacheKey() }, texture: textureInfo(expected?.value), uniform: textureInfo(actual?.value), sameUniformObject: bound === expected, sameTexture: bound?.value === expected?.value, samplerActive: !!sampler, samplerUnit: sampler?.cache?.[0] ?? null, shader: fl.surfaceMaterial.userData.floorShader, originalPlanes: origs.filter(m => m.parent === fl.art.parent).map(m => ({ visible: m.visible, opacity: m.material.opacity, y: m.position.y })) };
    });
  }
  prepareArt(); buildPost(); renderFlow(); resize(); setLook("studio"); $("quality").value = S.quality; S.c.dist = want.dist = fit(); setCam("guided");
  syncQualityClasses(); $("blurBtn").classList.toggle("on", S.blur); $("blurBtn").setAttribute("aria-pressed", String(S.blur));
  for (const id of ["lblBtn", "netBtn", "panelBtn", "miniBtn", "focusBtn", "soundBtn", "measure", "roofBtn"]) $(id).setAttribute("aria-pressed", String($(id).classList.contains("on")));
  $("views").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.classList.contains("on"))));
  $("steps").style.display = "none"; $("mini").style.display = "none"; applyRoof();
  // Elevator connector diagnostics (allocates; for tests only). Returns, per lift connector: the mesh's own end points
  // (position and position + rotated +Z * scale.z), the expected W(E.low) / W(E.high) at the current stack, progress and state.
  // Mesh ends are from the transform last set by frame(), so call it after MF.frame/seek of the flow being checked.
  function liftDiagnostics() {
    return routeLifts.map(L => {
      const m = L.mesh, start = m.position.clone(), end = new T.Vector3(0, 0, m.scale.z).applyQuaternion(m.quaternion).add(start);
      return { name: m.name, flow: L.flow, step: L.step, visible: m.visible, state: L.state, progress: L.progress, length: L.length, uLen: L.material.uniforms.uLen.value, uDone: L.material.uniforms.uDone.value, uHead: L.material.uniforms.uHead.value,
        meshFrom: start.toArray(), meshTo: end.toArray(), expectedFrom: W(E.low[0], E.low[1]).toArray(), expectedTo: W(E.high[0], E.high[1]).toArray() };
    });
  }
  // Test and diagnostic surface. schedule/sampleSchedule/lotPose are pure helpers for synthetic motion checks:
  //   MF.schedule(path, headingIn) -> { pts, phases[], duration, length, h0, h1 }   (path in slide points, headings in radians)
  //   MF.sampleSchedule(sched, tau, out) -> out { x, y, h, d, v, k, seg }            (tau = seconds since the step began)
  //   MF.lotPose(t) -> the lot's pose at flow story time t (same sampler the frame loop uses)
  window.MF = { lot, floors, S, D, REP, W, proj, seek, play, pause, stepBy, setFlow, setView, setCam, setLook, setPlan, setMeasure, setQuality, setFloorLight, debugFloor, stepAt, frame, want, perf: metrics,   // used by the tests
    LOOK, PT_M, motion: { V_MAX, RAMP_T, TURN_T, DWELL, LIFT_T, STATION_T }, schedule: buildSchedule, sampleSchedule, cleanPath, lotPose: (t) => { const o = lotPos(t, { x: 0, y: 0, i: 1, u: 0, lift: null, it: null, h: 0, d: 0, v: 0, k: "hold", seg: 0 }); return o; }, route: { uniforms: routeU, flows: routeFlows, lifts: routeLifts, liftState: liftDiagnostics, plateOf }, vehicleAPI: physicalVehicles,
    // Round 5: reflection = { state, uniforms, update, warm, set({enabled, every, strength, f0, distort, blur}), summary(), debug(), renderNow() };
    // setSpeed(v) / stepSpeed(+-1) drive the #speed select; setRoof(on) drives S.roof + REP.setRoof (guarded); camera = feed-forward diagnostics.
    reflection, setSpeed, stepSpeed, setRoof: (on) => { if (S.roof !== !!on) tRoof(); return S.roof; }, camera: { eye: camera.position, target: cameraTarget, near: camera.near, fov: camera.fov, ceiling: () => chaseEnvelope.top + highestFloor * S.stack, ff: camFF, ffSmooth: camFFSmooth, scale: camScale, eyeVelocity, targetVelocity } };
  metrics.reset = () => { metrics.frames = 0; metrics.intervals.fill(0); metrics.stages = {}; metrics.slowCount = 0; };
  metrics.snapshot = () => {
    const frames = Math.min(metrics.frames, metrics.intervals.length), a = Array.from(metrics.intervals.subarray(0, frames)).sort((a, b) => a - b);
    return { frames, quality: S.quality, pixelRatio: renderer.getPixelRatio(), p50: a[Math.floor(frames * .5)] ?? 0, p99: a[Math.min(frames - 1, Math.floor(frames * .99))] ?? 0, worst: a[frames - 1] ?? 0, over34: a.filter(ms => ms > 34).length, over120: a.filter(ms => ms > 120).length, over250: a.filter(ms => ms > 250).length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0, reflection: reflection.summary(), stages: metrics.stages };
  };
  // Match BOTH real render destinations. Offscreen-only warm-up misses Three r170's
  // screen tone-mapping/output-colour variant and skips VAO/texture uploads when culled.
  MF.ready = (async () => {
    const start = performance.now(), savedTarget = renderer.getRenderTarget(), viewport = renderer.getViewport(new T.Vector4()), scissor = renderer.getScissor(new T.Vector4()), scissorTest = renderer.getScissorTest();
    const saved = [], canvas = $("gl"), oldVisibility = canvas.style.visibility;
    canvas.style.visibility = "hidden";
    try {
      await Promise.all(originalLoads); await trolleyReady;
      // Lead's GLB parts: REP.ready resolves once they are instanced. Await it BEFORE any compile, then bind the
      // (possibly new) materials to the rise sweep and focus dimming; REP.meshes remains the one instanced list.
      if (REP.ready && typeof REP.ready.then === "function") { await REP.ready; bindReplicaMeshes(); prepareChaseEnvelope(); replicaVisible = null; REP.rise(S.R); REP.live(0, 1, 0); }
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
        // The floor reflection target (High only): allocated and rendered once per look so no resource is created in playback.
        // Its object programs are the same non-tone-mapped, linear-output variants as the HDR scene target compiled just above.
        if (look !== "blueprint") reflection.warm();
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
