// V7 engine patches on the V6 player (each must match exactly once). They turn the one-shot startup builds into rebuildable
// functions (flows, route ribbons, labels, cards, destination gates, devices), tag every replica instance with the plan object it
// came from, add the Studio frame hooks (pre: before the camera, post: after the overlay) and expose the internals to the Studio
// as MF.x. Nothing here changes how V6 looks or plays when the Studio is closed.
export const playerPatches = [
  // ---- V7.7.1: a new path (tab button) computes its guided-camera angles at once instead of during playback
  ["  function setFlow(i) { S.flow = i; E = D.flows[i].E || E; shown = -1; seek(0); pause(); renderFlow(); }", "  function setFlow(i) { S.flow = i; E = D.flows[i].E || E; shown = -1; seek(0); pause(); renderFlow(); try { prefetchAisles(i); } catch (e) { console.warn(\"aisle prefetch\", e); } }", "prefetch camera angles on a path change"],
  // ---- V7.7.1 preparing screen: after loading, render the fully risen factory behind a "Preparing" card until frame time is
  //      stable (30 frames in a row under 22 ms), then start the opening rise. If it is still slow after 4 s, skip the rise and
  //      start at step 1 with the factory up. MF.prepared resolves when the story may start (tests and tools wait for it).
  ["  function tick(now) {\n    const raw = Math.max(0, (now - last) / 1000); last = now;", `  const PREP = { active: false, t0: 0, good: 0, frames: 0, skipped: false, el: null, done: null };
  PREP.promise = new Promise((r) => (PREP.done = r));
  function prepStart() {
    PREP.active = true; PREP.t0 = performance.now(); PREP.good = 0; PREP.frames = 0;
    const el = PREP.el = document.createElement("div"); el.id = "prep7";
    el.innerHTML = '<div><b>Preparing the 3D factory…</b><i></i><small>Warming up the graphics so the film runs smoothly</small></div>'; document.body.appendChild(el);
  }
  // the guided camera chooses a viewing angle per path segment (48 sight tests, ~50 ms on a big floor): do all of them up front
  function prefetchAisles(fi) { const f = D.flows[fi]; if (!f) return; const lp = { seg: 0, lift: null }; for (const it of f.items) if (it.sched && !it.s.lift) for (let k = 0; k < Math.max(1, it.sched.pts.length - 1); k++) { lp.seg = k; aisleAz(it, lp, it.s.dist * 1.2); } }
  function prepFrame(raw) {
    // dry-run the real opening (story 0 -> INTRO + 1.5 s at 2x) behind the cover, so every state it will draw is warm
    PREP.frames++; PREP.t = (PREP.t || 0) + Math.min(raw, .05) * 3; S.t = Math.min(PREP.t, F().total); frame(Math.min(raw, .05), S.t);
    PREP.good = raw < .022 ? PREP.good + 1 : 0;
    const waited = performance.now() - PREP.t0, bar = PREP.el && PREP.el.querySelector("i"); if (bar) bar.style.width = Math.min(100, Math.max(PREP.t / (INTRO + 1.5), waited / 6000) * 100) + "%";
    const ran = PREP.t >= INTRO + 1.5;
    if ((ran && PREP.good >= 20) || waited > 6000) {
      try { SIGHT.warm(); prefetchAisles(S.flow); } catch (e) { console.warn("sight warm-up", e); }
      PREP.active = false; PREP.skipped = !(ran && PREP.good >= 20);
      const first = F().items[1]; S.R = PREP.skipped ? 1 : 0; lastR = -1; seek(PREP.skipped && first ? first.t0 : 0); frame(0, S.t);
      if (PREP.el) { PREP.el.classList.add("out"); setTimeout(() => PREP.el && PREP.el.remove(), 400); }
      metrics.prep = { frames: PREP.frames, ms: Math.round(waited), skipped: PREP.skipped }; last = performance.now(); PREP.done(metrics.prep);
    }
  }  function tick(now) {
    const raw = Math.max(0, (now - last) / 1000); last = now;
    if (PREP.active) { prepFrame(raw); requestAnimationFrame(tick); return; }`, "preparing screen (tick)"],
  ["    metrics.lastMask = 0; event(\"startup-warmup\", start); last = performance.now(); requestAnimationFrame(tick);", "    metrics.lastMask = 0; event(\"startup-warmup\", start); last = performance.now(); if (query.get(\"prep\") !== \"0\") prepStart(); else PREP.done({ frames: 0, ms: 0, skipped: false }); requestAnimationFrame(tick);", "preparing screen (start)"],
  // ---- V7.7: warm the GPU with a few FULL-SIZE frames of the rise (canvas still hidden). The tiny 32 px warm-up left the first
  //      real frames of the opening rise to pay for driver setup (bursts of 100-300 ms frames in some runs).
  ["composer.width = composer.height = 0; resize(); canvas.style.visibility = oldVisibility;", "composer.width = composer.height = 0; resize();\n      try { for (const k of [.15, .45, .75, 1]) { REP.rise(k); REP.live(k, 1, 0); for (const f of floors) f.art.material = k > .85 ? f.surfaceMaterial : f.planMaterial; for (let i = 0; i < 2; i++) renderer.render(scene, camera); } renderer.getContext().finish(); } catch (e) { console.warn(\"full-size warm-up\", e); }\n      finally { for (const f of floors) f.art.material = f.planMaterial; REP.rise(S.R); REP.live(0, 1, 0); }\n      canvas.style.visibility = oldVisibility;", "full-size GPU warm-up"],
  // ---- V7.7 hard rule: the guided / follow camera never ends a frame with the trolley hidden. After the springs, if the real eye's
  //      line to the trolley is blocked, the eye moves at once to the nearest clear view (higher first, then around).
  ["    return { clearLine, choose, transitionPol, chasePol, boxes, stats,", `    // exact check against the floors and slabs (a handful of triangles): the box model can miss slab edges around a shaft hole
    const fray = new T.Raycaster(), fdir = new T.Vector3(); let fmeshes = null;
    const floorClear = (P) => { if (!fmeshes) fmeshes = floors.flatMap((f) => [f.art, f.slab]); fdir.subVectors(L, P); const len = fdir.length(); fray.set(P, fdir.multiplyScalar(1 / len)); fray.far = Math.max(0, len - 1.5); for (const m of fmeshes) { let v = true; for (let o = m; o; o = o.parent) if (!o.visible) { v = false; break; } if (v && fray.intersectObject(m, false).length) return false; } return true; };
    // exact check against the real replica meshes (~1 ms): the final word, so the trolley is never hidden by a missed box
    const xray = new T.Raycaster(), xdir = new T.Vector3(); let xmeshes = null, xdev = null, xdevices = [];
    const exactClear = (P) => { if (!xmeshes) xmeshes = REP.meshes.map((m) => m.im).filter((o) => !o.material.transparent); if (xdev !== DEV) { xdev = DEV; xdevices = Object.values(DEV.groups || {}).flatMap(g => g.children.filter(o => o.isInstancedMesh && !o.material.transparent)); } xdir.subVectors(L, P); const len = xdir.length(); xray.set(P, xdir.multiplyScalar(1 / len)); xray.far = Math.max(0, len - 1.5); for (const list of [xmeshes, xdevices]) for (const m of list) { let v = m.visible; for (let o = m.parent; v && o; o = o.parent) if (!o.visible) v = false; if (v) { m.updateWorldMatrix(true, false); if (xray.intersectObject(m, false).length) return false; } } return true; };
    // A candidate must pass the same opaque-mesh checks as the acceptance test, even after several failed candidates.
    const seen = (P) => clearLine(P, L) && floorClear(P) && exactClear(P);
    function ensure(E3, Tg, vel) {
      if (!fmeshes) fmeshes = floors.flatMap((f) => [f.art, f.slab]); for (const k of Object.keys(plates)) plates[k].updateMatrixWorld(true);   // floors may have moved this frame (glide)
      targets(frameLot); if (seen(E3)) return false;
      const dx = E3.x - Tg.x, dy = E3.y - Tg.y, dz = E3.z - Tg.z, d = Math.max(1, Math.hypot(dx, dy, dz)), az = Math.atan2(dx, dz), pol = Math.acos(clamp(dy / d, -1, 1));
      const take = () => { E3.copy(eye); vel.set(0, 0, 0); stats.rescued = (stats.rescued || 0) + 1; return true; };
      // smallest change first: tilt up or down, then turn, then come closer (under an upper slab only a low, near view is clear)
      for (let k = 1; k <= 30; k++) for (const q of [pol - k * .05, pol + k * .05]) if (q > .01 && q < 1.5 && seen(eyeAt(Tg, d, az, q, eye))) return take();
      for (const o of [.35, -.35, .7, -.7, 1.2, -1.2, 1.9, -1.9, Math.PI]) for (const q of [pol, 1.2, .8, .5, .25, 1.4]) if (seen(eyeAt(Tg, d, az + o, q, eye))) return take();
      for (const k of [.7, .5, .35, .22]) for (const o of [0, .7, -.7, 1.5, -1.5, Math.PI]) for (const q of [pol, 1.3, 1.1, .8, .5, .2]) if (seen(eyeAt(Tg, d * k, az + o, q, eye))) return take();
      // last: views centred on the trolley itself (inside an elevator shaft only a near-vertical line through the shaft hole is clear)
      for (const q of [.01, .06, .12, .2, .3]) for (const o of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) if (seen(eyeAt(L, d, az + o, q, eye))) return take();
      eyeAt(L, d, az, .005, eye); return take();
    }
    // V7.7.1: build the sight boxes and the meshes' bounding data now (behind the preparing screen), not in the first guided frame
    function warm() { if (!built) build(); targets(frameLot); floorClear(camera.position); exactClear(camera.position); }
    return { warm, ensure, seen: (P) => { targets(frameLot); return { box: clearLine(P, L), floor: floorClear(P), L: L.toArray().map((v) => +v.toFixed(1)) }; }, clearLine, choose, transitionPol, chasePol, boxes, stats,`, "sight: rescue the real eye"],
  ["      c.x = cameraTarget.x; c.y = cameraTarget.y; c.z = cameraTarget.z;", "      if ((S.cam === \"guided\" || S.cam === \"follow\") && !flat() && S.R > .9 && !stepAt(S.t).s.intro) SIGHT.ensure(camera.position, cameraTarget, eyeVelocity);   // after springs AND the legacy ceiling clamp\n      c.x = cameraTarget.x; c.y = cameraTarget.y; c.z = cameraTarget.z;", "guided camera never hidden"],
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
    reflection.rehide(); draw.empty = false; guidedReady = false; calmD.clear(); calmS.clear();
    renderFlow(); shown = -1; S.t = clamp(t, 0, F().total); cine.shot = ""; cine.cut = true; SIGHT.reset();
    return +(performance.now() - start).toFixed(1);
  }
  function v7Devices(full) { disposeDEV(); DEV = makeDEV(); window.MF.devices = DEV; reflection.rehide(); SIGHT.rebuild(); if (full) prepareChaseEnvelope(); }
  window.MF = { prepared: PREP.promise, x: { rebuild: v7Rebuild, rebuildDevices: v7Devices, rebuildPlanArt, renderer, camera, cameraTarget, frameLot: () => frameLot, F, stepAt, lotPos: (t, o) => lotPos(t, o), worldFromLot, plateOf, hitFloor, floors, plates, scene, labels, getE: () => E, ELEVATORS, GAP, CX, CY, INTRO, glideY, prepareChaseEnvelope, tip, toFree, setSpeed, renderFlow, resize, flat, fit, bare: () => bareOn }, devices: DEV, sight: SIGHT,`, "studio internals"],
  /* V7.7.2 calm guided camera (layout round, step 5): wider and higher, one viewing angle held over runs of short legs (the
     angle of the nearest long leg of the step), a framing distance held per step (its longest leg), a gentle look-ahead along
     the leg, and a turn-rate limit with easing (20 deg/s normally; a turn the sight check forces is not limited, so the trolley never stays hidden). The sight
     rescue (SIGHT.ensure) still runs after all of this, so the trolley is never left hidden. */
  ["  const AZ_STEP = [-.55, -.3, -.8, -.45, -.7, -.25];",
   "  const AZ_STEP = [-.55, -.3, -.8, -.45, -.7, -.25];\n" +
   "  const CALM = { long: 40, turn: .35, forced: 99, ease: .9, pol: .82, near: 1.25, far: 1.45, ahead: 20, aheadShare: .35 }, calmD = new Map(), calmS = new Map();\n" +
   "  const segLen = (P, k) => P[k + 1] ? Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]) : 0;\n" +
   "  function calmSeg(cur, seg) { const key = S.flow + ':' + cur.i + ':' + seg; if (calmS.has(key)) return calmS.get(key); const P = cur.sched.pts; let k = seg;\n" +
   "    if (segLen(P, seg) < CALM.long) { let best = -1; for (let q = seg - 1; q >= 0; q--) if (segLen(P, q) >= CALM.long) { best = q; break; } if (best < 0) for (let q = seg + 1; q < P.length - 1; q++) if (segLen(P, q) >= CALM.long) { best = q; break; } if (best >= 0) k = best; }\n" +
   "    calmS.set(key, k); return k; }\n" +
   "  function calmDist(cur, d) { const key = S.flow + ':' + cur.i; let L = calmD.get(key); if (L == null) { L = 0; const P = cur.sched.pts; for (let k = 0; k < P.length - 1; k++) L = Math.max(L, segLen(P, k)); calmD.set(key, L); } return clamp(L * 1.1, d, d * 1.8); }",
   "calm camera helpers"],
  ["let d = S.cam === \"follow\" ? 300 : cur.s.dist * (S.stack > .5 ? 1.05 : 1.2), share = 1;", "let d = S.cam === \"follow\" ? 300 : cur.s.dist * (S.stack > .5 ? CALM.near : CALM.far), share = 1;", "calm camera: wider"],
  ["          d = clamp(length * 1.35, d * .85, d * 1.8);", "          d = calmDist(cur, d); void length;\n          { const ahead = Math.min(CALM.ahead, Math.hypot(segmentB.x - p.x, segmentB.z - p.z)); if (ahead > .5) { const ux = (segmentB.x - p.x), uz = (segmentB.z - p.z), n = Math.hypot(ux, uz) || 1; p.x += ux / n * ahead * CALM.aheadShare; p.z += uz / n * ahead * CALM.aheadShare; } }", "calm camera: held framing and look-ahead"],
  ["const goalAz = vis ? vis.az : targetAz, goalPol = vis ? SIGHT.transitionPol(p, d, guidedAz, vis.pol, lp) : .94, rate = vis && vis.forced ? 3.2 : 1.3;", "const goalAz = vis ? vis.az : targetAz, goalPol = vis ? SIGHT.transitionPol(p, d, guidedAz, Math.min(vis.pol, CALM.pol), lp) : CALM.pol, rate = vis && vis.forced ? 3.2 : CALM.ease;", "calm camera: higher, eased"],
  ["guidedAz += wrapPi(goalAz - guidedAz) * (1 - Math.exp(-frameDt * rate * camScale()));", "{ const dAz = wrapPi(goalAz - guidedAz) * (1 - Math.exp(-frameDt * rate * camScale())), cap = (vis && vis.forced ? CALM.forced : CALM.turn) * frameDt * camScale(); guidedAz += clamp(dAz, -cap, cap); }", "calm camera: turn-rate limit"],
  ["const key=S.flow+':'+cur.i+':'+lp.seg;", "const sg=calmSeg(cur,lp.seg),key=S.flow+':'+cur.i+':'+sg;", "calm camera: angle held over short legs (key)"],
  // one base viewing angle for the whole path (it used to change per step); leave it only when the view is clearly blocked
  ["if(!cur.sched||lp.lift!=null)return AZ_STEP[cur.i%AZ_STEP.length];", "if(!cur.sched||lp.lift!=null)return AZ_STEP[0];", "calm camera: one base angle (rides)"],
  ["base=AZ_STEP[cur.i%AZ_STEP.length];let best=[Infinity,base];", "base=AZ_STEP[0];let best=[Infinity,base];", "calm camera: one base angle"],
  ["Math.abs(wrapPi(az-base))*.001", "Math.abs(wrapPi(az-base))*.06", "calm camera: prefer the base angle"],
  ["const a=cur.sched.pts[lp.seg],b=cur.sched.pts[lp.seg+1]||a,p=[(a[0]+b[0])/2,(a[1]+b[1])/2];", "const a=cur.sched.pts[sg],b=cur.sched.pts[sg+1]||a,p=[(a[0]+b[0])/2,(a[1]+b[1])/2];", "calm camera: angle held over short legs (scored leg)"],
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
  ["    for (const m of R.machines) ({ injection, press, utility, dock, cell: press })[m.type](m);", "    for (const m of R.machines) { TAG = tagOf(\"machines\", m, R.machines.indexOf(m)); ({ injection, press, utility, dock, cell: press, block: mfBlock })[m.type](m); }\n    TAG = null;", "machine tags"],
  // layoutAdds (V7.8): simple blocks (machine / line / conveyor / table: one clear style per kind) and storage floor markings
  ["    for (const d of R.decks) box(d.plate, d.x + d.w / 2, .5, d.y + d.h / 2, d.w, 1, d.h, 0x56627a, \"paint\");",
   "    for (const d of R.decks) box(d.plate, d.x + d.w / 2, .5, d.y + d.h / 2, d.w, 1, d.h, 0x56627a, \"paint\");\n" +
   "    function mfBlock(r) { const p = r.plate, cx = r.x + r.w / 2, cz = r.y + r.h / 2, H = r.hm || 6, col = parseInt(String(r.col || \"#5b6b82\").slice(1), 16), long = r.w >= r.h;\n" +
   "      box(p, cx, H / 2, cz, r.w, H, r.h, col, \"paint\");\n" +
   "      if (r.stripe) for (const s of [-1, 1]) box(p, long ? cx : cx + s * (r.w / 2 - .25), H + .08, long ? cz + s * (r.h / 2 - .25) : cz, long ? r.w : .5, .16, long ? .5 : r.h, parseInt(r.stripe.slice(1), 16), \"paint\");\n" +
   "      else box(p, cx, H + .05, cz, long ? r.w * .96 : r.w * .3, .1, long ? r.h * .3 : r.h * .96, 0xdfe5ee, \"paint\"); }\n" +
   "    TAG = null; for (const q of R.marks || []) { const p = q.plate, t = .6, y = .12, cw = q.w / q.cols, ch = q.h / q.rows;\n" +
   "      for (let i = 0; i <= q.rows; i++) box(p, q.x + q.w / 2, y, q.y + ch * i, q.w + t, .12, t, c.yellow, \"paint\");\n" +
   "      for (let j = 0; j <= q.cols; j++) box(p, q.x + cw * j, y, q.y + q.h / 2, t, .12, q.h + t, c.yellow, \"paint\"); }",
   "layout adds 3D"],
  ["for (const m of on(R.machines)) { g.fillStyle = m.type === \"dock\" ? (dark ? \"#23406e\" : \"#aab4c6\") : (dark ? \"#1b4f8f\" : \"#6f9be0\");",
   "for (const q of on(R.marks || [])) { g.strokeStyle = dark ? \"#d8b500\" : \"#c99a00\"; g.lineWidth = 2; for (let i = 0; i <= q.rows; i++) { g.beginPath(); g.moveTo(X(q.x), Y(q.y + q.h * i / q.rows)); g.lineTo(X(q.x + q.w), Y(q.y + q.h * i / q.rows)); g.stroke(); } for (let j = 0; j <= q.cols; j++) { g.beginPath(); g.moveTo(X(q.x + q.w * j / q.cols), Y(q.y)); g.lineTo(X(q.x + q.w * j / q.cols), Y(q.y + q.h)); g.stroke(); } }\n" +
   "    for (const m of on(R.machines)) { g.fillStyle = m.col || (m.type === \"dock\" ? (dark ? \"#23406e\" : \"#aab4c6\") : (dark ? \"#1b4f8f\" : \"#6f9be0\"));",
   "layout adds plan"],
  ["    for (const q of R.pallets || []) place(\"pallet\", q, { max: 1.1, h: 1.05 });", "    for (const q of R.pallets || []) { TAG = tagOf(\"pallets\", q, R.pallets.indexOf(q)); place(\"pallet\", q, { max: 1.1, h: 1.05 }); }\n    TAG = null;", "pallet tags"],
  ["      plates[b.plate].add(im); meshes.push({ im, base, xs });", "      plates[b.plate].add(im); meshes.push({ im, base, xs, tags: b.list.map((o) => o.tag) });", "box mesh tags"],
  ["plates[plate].add(im); meshes.push({ im, base, xs });", "plates[plate].add(im); meshes.push({ im, base, xs, tags: list.map((o) => o.tag) });", "model mesh tags"],
];
