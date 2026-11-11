// V7 engine patches on the V6 player (each must match exactly once). They turn the one-shot startup builds into rebuildable
// functions (flows, route ribbons, labels, cards, destination gates, devices), tag every replica instance with the plan object it
// came from, add the Studio frame hooks (pre: before the camera, post: after the overlay) and expose the internals to the Studio
// as MF.x. Nothing here changes how V6 looks or plays when the Studio is closed.
export const playerPatches = [
  // ---- owner (image 24): the "pale light cones" are the planar floor reflection mirroring the tall rack posts; off by default
  //      (?reflect=1 turns it back on). It also saves one extra scene render every third frame.
  ["const st = { enabled: query.get(\"reflect\") !== \"0\",", "const st = { enabled: query.get(\"reflect\") === \"1\",", "floor reflection off by default"],
  // ---- owner (image 24): the dark boxes are the removed rooms' shadows baked into the floor light; repaint them (preload-scene.js)
  ["loader.load(source, tex => resolve(apply(tex, true)),", "loader.load(source, tex => Promise.resolve(window.MF7_CLEAN_LIGHT ? window.MF7_CLEAN_LIGHT(tex, key, fl.box) : tex).then(t => resolve(apply(t, true)), reject),", "clean baked shadows of removed objects"],
  // ---- guided camera: when the real camera (lagging behind its clear goal on the springs) has the trolley hidden, catch up faster
  ["if (!clearLine(camera.position, L)) stats.blockedActual++;", "stats.blockedNow = !clearLine(camera.position, L); if (stats.blockedNow) stats.blockedActual++;", "sight: actual view state"],
  ["const omega = (S.cam === \"chase\" || S.cam === \"forklift\" ? 8 : stepAt(S.t).s.intro ? 9 : S.cam === \"guided\" ? 2.7 : 4.2) * camScale();",
    "const omega = (S.cam === \"chase\" || S.cam === \"forklift\" ? 8 : stepAt(S.t).s.intro ? 9 : S.cam === \"guided\" ? 2.7 : 4.2) * camScale() * (S.cam === \"guided\" && SIGHT.stats.blockedNow ? 2.6 : 1);   // V7: catch up when the view is blocked", "guided catch-up"],
  // ---- RFID gates: the wave shader held 8 gates in float arrays; 16 vec4 hold 64 (same per-gate values, packed by 4)
  ["if (NG > 8) throw new Error(\"RFID shader supports at most 8 gates per project\");", "if (NG > 64) throw new Error(\"RFID shader supports at most 64 gates per project\");", "64 gates (limit)"],
  ["uAct: { value: new Float32Array(8) }, uRead: { value: new Float32Array(8) },", "uAct: { value: new Float32Array(64) }, uRead: { value: new Float32Array(64) },", "64 gates (uniform data)"],
  ["uniform float uAct[8]; uniform float uRead[8];", "uniform vec4 uAct[16]; uniform vec4 uRead[16];", "64 gates (uniforms)"],
  ["float pick(float a[8], int i){ float r = 0.0; for (int k = 0; k < 8; k++) if (k == i) r = a[k]; return r; }",
    "float pick(vec4 a[16], int i){ int q = i / 4, c = i - q * 4; vec4 v = vec4(0.0); for (int k = 0; k < 16; k++) if (k == q) v = a[k]; return c == 0 ? v.x : c == 1 ? v.y : c == 2 ? v.z : v.w; }", "64 gates (lookup)"],
  ["        if (gi >= 8) return;", "        if (gi >= 64) return;", "64 gates (frame)"],
  // ---- per-step speed (scene "speed", m/s). Without it every value is V_MAX, so V6 timing is unchanged.
  ["  function segmentProfile(L) {   // L in metres\n    const full = V_MAX * RAMP_T, cruise = L >= full;\n    const Ta = cruise ? RAMP_T : RAMP_T * Math.sqrt(L / full), vp = cruise ? V_MAX : L / Ta;",
    "  function segmentProfile(L, VM = V_MAX) {   // L in metres, VM = cruise speed (m/s)\n    const full = VM * RAMP_T, cruise = L >= full;\n    const Ta = cruise ? RAMP_T : RAMP_T * Math.sqrt(L / full), vp = cruise ? VM : L / Ta;", "segment speed (1)"],
  ["    return { Ta, vp, T: 2 * Ta + (cruise ? (L - full) / V_MAX : 0) };", "    return { Ta, vp, T: 2 * Ta + (cruise ? (L - full) / VM : 0) };", "segment speed (2)"],
  ["  function buildSchedule(path, hIn) {\n    const P = cleanPath(path), phases = [], sched = { pts: P, phases, duration: 0, length: 0, h0: hIn, h1: hIn };",
    "  function buildSchedule(path, hIn, VM = V_MAX) {\n    const P = cleanPath(path), phases = [], sched = { pts: P, phases, duration: 0, length: 0, h0: hIn, h1: hIn, vm: VM };", "schedule speed (1)"],
  ["      const p = segmentProfile(Lm); phases.push({ k: \"move\",", "      const p = segmentProfile(Lm, VM); phases.push({ k: \"move\",", "schedule speed (2)"],
  ["Lm = lp * PT_M, p = segmentProfile(Lm);", "Lm = lp * PT_M, p = segmentProfile(Lm, sched.vm);", "scan-stop speed"],
  ["scheduleManualStops(buildSchedule(path, hPrev), D.nodes[s.node].plate)", "scheduleManualStops(buildSchedule(path, hPrev, s.speed || V_MAX), D.nodes[s.node].plate)", "step speed"],
  // ---- flows: liftIndices must be refreshable
  ["const liftIndices = D.flows.map(f => f.items.findIndex(it => it.s.lift)), plateEntriesForGroups = Object.entries(plates);",
    "let liftIndices = D.flows.map(f => f.items.findIndex(it => it.s.lift)); const plateEntriesForGroups = Object.entries(plates);", "liftIndices rebuildable"],
  // ---- route ribbons: a function, so a flow edit rebuilds them
  ["  const routeFlows = D.flows.map((f, fi) => {", "  const makeRouteFlows = () => D.flows.map((f, fi) => {", "route ribbons as a function (open)"],
  ["    return { meshes, lifts, shown: false };\n  });\n  const routeLifts = routeFlows.flatMap(r => r.lifts);",
    "    return { meshes, lifts, shown: false };\n  });\n  let routeFlows = makeRouteFlows(), routeLifts = routeFlows.flatMap(r => r.lifts);", "route ribbons as a function (close)"],
  // ---- destination gates
  ["  const gates=Object.values(D.nodes).filter(n=>n.kind==='dest').map(n=>{", "  let gates = [];\n  const buildGates = () => gates=Object.values(D.nodes).filter(n=>n.kind==='dest').map(n=>{", "dest gates as a function (open)"],
  ["  });\n  // Elevators: a project can have several;", "  });\n  buildGates();\n  // Elevators: a project can have several;", "dest gates as a function (close)"],
  // ---- node chips
  ["  const chips = {}, labels = $(\"labels\"), nodes = Object.values(D.nodes), chipList = [];\n  labels.style.contain = \"layout style\";\n  for (const n of nodes) {",
    "  let chips = {}, nodes = [], chipList = []; const labels = $(\"labels\");\n  labels.style.contain = \"layout style\";\n  function buildChips() { for (const c of chipList) c.el.remove(); chips = {}; nodes = Object.values(D.nodes); chipList = []; for (const n of nodes) {", "chips as a function (open)"],
  ["chips[n.id] = chip; chipList.push(chip);\n  }\n  const floorTags", "chips[n.id] = chip; chipList.push(chip);\n  } }\n  buildChips();\n  const floorTags", "chips as a function (close)"],
  ["  const labelStates = D.flows.map(f => f.items.map(cur => {", "  let labelStates;\n  const buildLabelStates = () => labelStates = D.flows.map(f => f.items.map(cur => {", "label states as a function"],
  ["  let labelFlow = -1, labelStep = -1,", "  buildLabelStates();\n  let labelFlow = -1, labelStep = -1,", "label states built"],
  // ---- step cards
  ["  const cardCache = D.flows.map(f => f.items.map(cur => {", "  let cardCache;\n  const buildCards = () => cardCache = D.flows.map(f => f.items.map(cur => {", "cards as a function"],
  ["  let stepRows = [], stepTop = [],", "  buildCards();\n  let stepRows = [], stepTop = [],", "cards built"],
  // ---- devices: rebuildable, free PC rotation, every instance knows its device
  ["  DEV = (() => {\n    const DD = window.MF_DEVICE_DIMS", "  const makeDEV = () => {\n    const DD = window.MF_DEVICE_DIMS", "devices as a function (open)"],
  ["    return out;\n  })();", "    return out;\n  };\n  DEV = makeDEV();", "devices as a function (close)"],
  ["d.yaw = FACE[d.face || \"e\"];", "d.yaw = d.yawDeg != null ? d.yawDeg * Math.PI / 180 : FACE[d.face || \"e\"];", "PC free rotation"],
  ["const p = { plate: d.plate || \"1F\", x, y: ly * s * M, z,", "const p = { dev: d.src || d, plate: d.plate || \"1F\", x, y: ly * s * M, z,", "device part knows its device"],
  ["const lane = { x: d.lane[0], y: d.lane[1], yaw: d.yaw + Math.PI / 2, plate: d.plate };", "const lane = { src: d, x: d.lane[0], y: d.lane[1], yaw: d.yaw + Math.PI / 2, plate: d.plate };", "lane marks belong to their scanner"],
  ["      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; groupOf(b.plate).add(im);",
    "      im.userData.devs = b.list.map((p) => p.dev); im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; groupOf(b.plate).add(im);", "instances know their device"],
  ["      head.add(body, strip); g.add(head);", "      head.add(body, strip); head.userData.dev = d; body.userData.dev = d; g.add(head);", "scanner head knows its device"],
  // ---- reflection: forget the hidden-object list after a rebuild
  ["    return { update, warm, resize, set, summary, debug, state: st, uniforms: U,", "    return { rehide: () => { hide = null; }, update, warm, resize, set, summary, debug, state: st, uniforms: U,", "reflection rehide"],
  // ---- camera: the Studio owns free and director cameras (smooth goal, lens), and the zoom buttons
  ["    if (S.cam === \"free\") {\n      const sp = Math.sin(c.pol);", "    if (S.cam === \"free\" || S.cam === \"director\") {\n      if (window.MFX) window.MFX.freeCam(dt, c);\n      const sp = Math.sin(c.pol);", "studio free camera"],
  ["    if (S.cam === \"free\") return;\n    const cur = stepAt(S.t);", "    if (S.cam === \"free\" || S.cam === \"director\") return;\n    const cur = stepAt(S.t);", "director has no auto goal"],
  ["  function zoom(k) { toFree(); S.c.dist", "  function zoom(k) { if (window.MFX) return window.MFX.zoom(k); toFree(); S.c.dist", "zoom through the studio"],
  // ---- frame hooks
  ["    setWant(time); moveCam(dt);", "    const X7 = window.MFX; if (X7) X7.pre(dt, time, cur);\n    setWant(time); moveCam(dt);", "studio pre hook"],
  ["    stage(\"overlay-dom\", overlayStart); metrics.lastMask = mask;", "    if (X7) X7.post(dt, time, cur, lp);\n    stage(\"overlay-dom\", overlayStart); metrics.lastMask = mask;", "studio post hook"],
  // ---- internals for the Studio
  ["  window.MF = { devices: DEV, sight: SIGHT,", `  function disposeDEV() {
    if (!DEV) return;
    for (const g of Object.values(DEV.groups || {})) { if (g.parent) g.parent.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    for (const el of labels.querySelectorAll(".v5toast")) el.remove();
  }
  function rebuildPlanArt() { for (const k of Object.keys(planTex)) { planTex[k].dispose(); delete planTex[k]; } prepareArt(); setArt(LOOK[S.look].dark); }
  // V7: rebuild everything derived from D (flows, nodes, devices) after a Studio edit, keeping the story time.
  function v7Rebuild(o = {}) {
    const start = performance.now(), t = S.t;
    if (S.flow >= D.flows.length) S.flow = Math.max(0, D.flows.length - 1);
    if (o.flows !== false) {
      for (const f of D.flows) buildFlow(f);
      E = (D.flows[S.flow] && D.flows[S.flow].E) || ELEVATORS[0] || E;
      for (const flow of D.flows) for (const it of flow.items) if (it.path) pathInfo(it.path);
      liftIndices = D.flows.map(f => f.items.findIndex(it => it.s.lift));
      metrics.timeline = D.flows.map(f => f.items.map(it => ({ i: it.i, t0: it.t0, tm: it.tm, t1: it.t1, view: it.s.view })));
      for (const r of routeFlows) for (const m of r.meshes) { if (m.parent) m.parent.remove(m); if (m.geometry !== liftGeometry) m.geometry.dispose(); if (m.material !== ribbonMaterial && m.material !== ringMaterial) m.material.dispose(); }
      routeFlows = makeRouteFlows(); routeLifts = routeFlows.flatMap(r => r.lifts); routeShownFlow = -1; routeShownAlpha = -1;
      aisleAngles.clear(); cineAzs.clear(); chaseExitAngles.clear();
    }
    if (o.nodes !== false) { for (const g of gates) { scene.remove(g); g.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); } buildGates(); buildChips(); }
    buildLabelStates(); labelFlow = -1; buildCards();
    if (o.devices !== false) { disposeDEV(); DEV = makeDEV(); window.MF.devices = DEV; }
    if (o.sight !== false) { SIGHT.rebuild(); prepareChaseEnvelope(); }
    if (o.plan) rebuildPlanArt();
    reflection.rehide(); draw.empty = false; guidedReady = false;
    renderFlow(); shown = -1; S.t = clamp(t, 0, F().total); cine.shot = ""; cine.cut = true; SIGHT.reset();
    return +(performance.now() - start).toFixed(1);
  }
  function v7Devices(full) { disposeDEV(); DEV = makeDEV(); window.MF.devices = DEV; reflection.rehide(); SIGHT.rebuild(); if (full) prepareChaseEnvelope(); }
  window.MF = { x: { rebuild: v7Rebuild, rebuildDevices: v7Devices, rebuildPlanArt, renderer, camera, cameraTarget, frameLot: () => frameLot, F, stepAt, lotPos: (t, o) => lotPos(t, o), worldFromLot, plateOf, hitFloor, floors, plates, scene, labels, getE: () => E, ELEVATORS, GAP, CX, CY, INTRO, glideY, prepareChaseEnvelope, tip, toFree, setSpeed, renderFlow, resize, flat, fit, bare: () => bareOn }, devices: DEV, sight: SIGHT,`, "studio internals"],
];

// Replica builder (window.MFReplica.build): tag every instance with the plan object it came from ("racks:12"), so the Studio can
// select, move, turn and delete real replica objects. _oid (stamped by the V7 preload) keeps the tags stable after deletions.
export const replicaPatches = [
  ["    const buckets = new Map();\n    function add(plate, geo, mat,", "    const buckets = new Map(); let TAG = null; const tagOf = (k, o, i) => k + \":\" + (o._oid != null ? o._oid : i);\n    function add(plate, geo, mat,", "replica tag state"],
  ["      b.list.push({ cx, y, cz, sx, sy, sz, color, rot });", "      b.list.push({ cx, y, cz, sx, sy, sz, color, rot, tag: TAG });", "replica part tag"],
  ["      placed.push({ name, plate:r.plate,", "      placed.push({ tag: TAG, name, plate:r.plate,", "replica model tag"],
  ["    for (const w of R.walls) {\n      const [ax, ay] = w.a,", "    for (const w of R.walls) {\n      TAG = tagOf(\"walls\", w, R.walls.indexOf(w));\n      const [ax, ay] = w.a,", "wall tags"],
  ["    for (const q of R.columns) { const H", "    for (const q of R.columns) { TAG = tagOf(\"columns\", q, R.columns.indexOf(q)); const H", "column tags"],
  ["    for (const r of R.racks) rack(r, upper(r.plate) ? 3 : 4, rand);", "    for (const r of R.racks) { TAG = tagOf(\"racks\", r, R.racks.indexOf(r)); rack(r, upper(r.plate) ? 3 : 4, rand); }", "rack tags"],
  ["    for (const m of R.machines) ({ injection, press, utility, dock, cell: press })[m.type](m);", "    for (const m of R.machines) { TAG = tagOf(\"machines\", m, R.machines.indexOf(m)); ({ injection, press, utility, dock, cell: press })[m.type](m); }\n    TAG = null;", "machine tags"],
  ["    for (const q of R.pallets || []) place(\"pallet\", q, { max: 1.1, h: 1.05 });", "    for (const q of R.pallets || []) { TAG = tagOf(\"pallets\", q, R.pallets.indexOf(q)); place(\"pallet\", q, { max: 1.1, h: 1.05 }); }\n    TAG = null;", "pallet tags"],
  ["      plates[b.plate].add(im); meshes.push({ im, base, xs });", "      plates[b.plate].add(im); meshes.push({ im, base, xs, tags: b.list.map((o) => o.tag) });", "box mesh tags"],
  ["plates[plate].add(im); meshes.push({ im, base, xs });", "plates[plate].add(im); meshes.push({ im, base, xs, tags: list.map((o) => o.tag) });", "model mesh tags"],
];
