  /* ---------- the frame ---------- */
  function resize() {
    const ratio = Math.min(devicePixelRatio, 1) * ({ high: .85, medium: .8, low: .65 }[S.quality]) * resolutionScale;
    renderer.setPixelRatio(ratio); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; frame.shift = -1; camera.updateProjectionMatrix();
    const d = Math.min(devicePixelRatio, 1), fw = Math.round(innerWidth * d), fh = Math.round(innerHeight * d); if (fx.width !== fw) { fx.width = fw; draw.empty = false; } if (fx.height !== fh) { fx.height = fh; draw.empty = false; } g2.setTransform(d, 0, 0, d, 0, 0);
    // Fixed 3/4-resolution night targets: quality switches allocate no post resources.
    if (composer && (composer.width !== innerWidth || composer.height !== innerHeight)) { composer.setPixelRatio(.75); composer.setSize(innerWidth, innerHeight); composer.width = innerWidth; composer.height = innerHeight; }
    reflection.resize();
    cacheStepLayout();
  }
  let resizePending = false;
  addEventListener("resize", () => { resizePending = true; });
  let last = performance.now(), slow = 0, governorHold = 3, lastR = -1, lastStack = -1, shadowSettled = 0, lastLiveTime = NaN, lastLiveShow = null;
  const gov = { n: 0, miss: 0, t: 0, pending: null }, GOV_ON = query.get("gov") !== "0"; metrics.governor = [];
  const PREP = { active: false, t0: 0, good: 0, frames: 0, skipped: false, el: null, done: null };
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
    if (PREP.active) { prepFrame(raw); requestAnimationFrame(tick); return; }
    if (window.MF7_EXPORT) { requestAnimationFrame(tick); return; }
    metrics.intervals[metrics.frames++ % metrics.intervals.length] = raw * 1000;
    if (raw > .034) {
      const record = metrics.slowFrames[metrics.slowCount++ % metrics.slowFrames.length];
      record.t = S.t; record.end = S.playing ? Math.min(F().total, S.t + raw * S.speed) : S.t; record.ms = raw * 1000; record.cpu = metrics.lastCPU; record.step = stepAt(S.t).i; record.mask = metrics.lastMask;
      record.programs = renderer.info.programs?.length || 0; record.textures = renderer.info.memory.textures; record.heap = performance.memory?.usedJSHeapSize || 0;
    }
    if (resizePending) { resizePending = false; resize(); }
    const ema = tick.ema = tick.ema ? tick.ema + (Math.min(raw, .1) - tick.ema) * .08 : Math.min(raw, .1);
    frame(Math.abs(raw - ema) < ema * .25 ? ema : raw, S.t); updateFade(now);   // V2: rAF jitter filtered; a real dropped frame still catches up
    // Reuse DFPerf's interval signal and hold period. Lower resolution within High;
    // never rebuild effects or silently overwrite a manually chosen quality.
    // Sample playback, but apply a pending downgrade only while paused. No resolution hunting or playback reallocations.
    governorHold -= raw;
    if (GOV_ON && S.playing && !document.hidden && raw < .1 && governorHold <= 0) {
      gov.n++; if (raw > .025) gov.miss++; gov.t += raw;
      if (gov.t >= 2) {
        const ratio = gov.miss / Math.max(1, gov.n);
        if (ratio > .05 && resolutionScale > .75) gov.pending = Math.max(.75, +(resolutionScale - .05).toFixed(2));
        gov.n = gov.miss = gov.t = 0;
      }
    }
    if (GOV_ON && !S.playing && gov.pending != null) {
      resolutionScale = gov.pending; gov.pending = null; resize(); governorHold = 3;
      metrics.governor.push({ t: +S.t.toFixed(1), scale: resolutionScale });
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
    const autoStack = S.stackUser == null && S.view === "auto", goal = S.stackUser != null ? S.stackUser : S.view === "2d" ? 0 : S.view === "3d" ? 1 : glideAt(S.t);   // V3: side by side, glide for each ride
    S.stack = autoStack ? goal : lerp(S.stack, goal, 1 - Math.exp(-dt * 3)); if (Math.abs(S.stack - goal) < .001) S.stack = goal;
    if (S.stackUser == null) { const value = Math.round(S.stack * 100); if (frame.stackValue !== value) { stackControl.value = value; frame.stackValue = value; } }
    if (Math.abs(S.stack - lastStack) > 1e-4) { lastStack = S.stack; shadowDirty = true; }
    for (let i = 0; i < plateEntriesForGroups.length; i++) { const entry = plateEntriesForGroups[i], g = entry[1], P = D.plates[entry[0]]; g.position.set(glideX(S.stack) * P.dx, glideY(S.stack) * P.lift * GAP, glideX(S.stack) * P.dz); }
    if (deck.visible !== (S.stack > .3) || cabin.visible !== (S.stack > .1)) mask |= 16;
    deck.visible = S.stack > .3;
    const oo = S.plan === "original" ? 1 : intro ? 1 - clamp((S.t - .7) / 1.2, 0, 1) : 0;
    for (const m of origs) { m.material.opacity = oo; m.visible = oo > .01; }
    for (const m of gates) { const n = m.userData.n; W(n.x, n.y, S.stack, 8, m.position); m.scale.y = Math.max(.001, S.R); m.visible = S.R > .05 && S.stack > .05; }
    const lo = W(E.low[0], E.low[1], S.stack, .8, liftLow), hi = W(E.high[0], E.high[1], S.stack, .8, liftHigh);
    const aligned=Math.hypot(lo.x-hi.x,lo.z-hi.z)<.01;
    shaft.visible=S.stack>.1&&liftIndices[S.flow]>=0&&aligned;
    cabin.visible=S.stack>.1&&liftIndices[S.flow]>=0;liftShape(lo,hi);
    const lp = lotPos(S.t, frameLot), at = worldFromLot(lp, S.stack, lotPoint), li = liftIndices[S.flow];
    lot.position.copy(at).setY(at.y + S.R * .2); lot.visible = !cur.s.intro;
    lot.rotation.y = lp.h;   // pure function of story time: segment direction while moving, eased exact quarter turn at a corner
    updateRoute(cur, lp);
    cabin.position.copy(lp.lift != null ? at : (li >= 0 && cur.i > li ? hi : lo)).setY((lp.lift != null ? at.y : (li >= 0 && cur.i > li ? hi.y : lo.y)) - .5);
    beacon.visible = !cur.s.intro; beacon.position.copy(at).setY(at.y + 1.2); const pulse = (time * .8) % 1; beacon.scale.setScalar(.7 + pulse * 1.4); beacon.material.opacity = 1 - pulse;
    // focus: the plan with the lot stays bright, the others step back (colours stay, brightness falls)
    const activePlate=lp.lift!=null?E.lowPlate:plateOf(lp.x,lp.y),cutaway=!cur.s.intro&&S.stack>.001&&S.stackUser==null&&['guided','follow','chase'].includes(S.cam);
    for(const [key,g] of plateEntriesForGroups)g.visible=!(cutaway&&D.plates[key].lift>D.plates[activePlate].lift);
    const riding = lp.lift != null, here = riding ? "" : plateOf(lp.x, lp.y), liftLo = riding ? plateOf(E.low[0], E.low[1]) : "", liftHi = riding ? plateOf(E.high[0], E.high[1]) : "";
    for (const fl of floors) { const on = !S.focus || cur.s.intro || S.R < .9 || S.cam === "overview" || fl.key === here || (riding && (fl.key === liftLo || fl.key === liftHi)) || (S.view === "auto" && glideAt(S.t) > .02); const target = on ? 1 : .42; fl.k = lerp(fl.k ?? 1, target, 1 - Math.exp(-dt * 6)); if (Math.abs(fl.k - target) < .001) fl.k = target;
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
    const X7 = window.MFX; if (X7) X7.pre(dt, time, cur);
    setWant(time); moveCam(dt); if (REP.roofFade) { const cy = camera.position.y - S.stack * GAP * .5, a = 1 - Math.min(1, Math.max(0, (cy - 42) / 60)); REP.roofFade(.1 + .9 * a * a); }   // full steel at working height, a hint from above: beams never hide the trolley
    const shift = S.panel && !bareOn ? -140 : 0;   // the steps list opens on the left: nudge the scene right of it
    if (shift !== frame.shift) { frame.shift = shift; camera.setViewOffset(innerWidth, innerHeight, shift, 0, innerWidth, innerHeight); }
    if (DEV) DEV.frame(cur, lp, dt, time);   // Project DOM chips with this frame's camera, including its view offset.
    // The final rendered target includes the trolley's display lift, and device instances have this frame's transforms.
    if ((S.cam === "guided" || S.cam === "follow" || S.cam === "chase") && !flat() && S.R > .9 && !cur.s.intro && SIGHT.ensure(camera.position, cameraTarget, eyeVelocity)) {
      camera.lookAt(cameraTarget); camera.updateMatrixWorld();
      const c = S.c, dx = camera.position.x - cameraTarget.x, dy = camera.position.y - cameraTarget.y, dz = camera.position.z - cameraTarget.z;
      c.x = cameraTarget.x; c.y = cameraTarget.y; c.z = cameraTarget.z; c.dist = Math.max(.001, Math.hypot(dx, dy, dz)); c.pol = Math.acos(clamp(dy / c.dist, -1, 1)); c.az = Math.atan2(dx, dz);
      if (S.cam !== "chase") { guidedAz = c.az; guidedPol = c.pol; }
      if (DEV) DEV.frame(cur, lp, 0, time);   // reproject the device chips with the corrected camera, without advancing animation
    }
    stage("camera", cameraStart);
    // Bake/static shadows only. Optional sun shadow refresh waits for the final pose.
    const settled = Math.abs(S.R - goalR) < 1e-4 && (S.R < .001 || S.R > .999) && S.stack === goal;
    shadowSettled = settled ? shadowSettled + dt : 0;
    if (realtimeShadows && shadowDirty && shadowSettled > .15) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; metrics.shadows++; }
    const reflectionStart = profile ? performance.now() : 0;
    scene.updateMatrixWorld(); const sceneAuto = scene.matrixWorldAutoUpdate; scene.matrixWorldAutoUpdate = false;
    try {
    reflection.update(dt);   // High only: at most one extra low-resolution scene render every second frame, before the main render
    stage("reflection", reflectionStart);
    const renderStart = profile ? performance.now() : 0;
    if (composer && S.look === "night" && S.quality !== "low") composer.render(dt); else renderer.render(scene, camera);
    stage("render-submit", renderStart);
    } finally { scene.matrixWorldAutoUpdate = sceneAuto; }
    const overlayStart = profile ? performance.now() : 0;
    if (shown !== cur.i) mask |= 1;
    draw(time); if (!bareOn) placeLabels(); renderStep();   // H hides every label: no label DOM work while hidden
    if (S.mini && !bareOn && (drawMini.last == null || drawMini.flow !== S.flow || Math.abs(time - drawMini.last) >= .1)) { drawMini(); drawMini.last = time; drawMini.flow = S.flow; }
    if (X7) X7.post(dt, time, cur, lp);
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
  var DEV;
  /* ---------- V5 devices: PC workstations, auto RFID gates, manual RFID scanners (data: D.devices) ----------
     Inserted into the player closure by tools/build-v5.mjs. Owner's legend: circle = Prod. Result / GR PC, square = TO Mapping /
     GI PC, hexagon = Quality PC; yellow = auto RFID gate (read on the move, ceiling antennas), red = manual RFID point
     (the trolley stops, the operator scans it with the handheld scanner).
     Cost: all static parts are a few InstancedMeshes per plate (shared box geometry, 4 materials); all gate effects are ONE merged
     mesh with one shader; each scanner is one merged mesh + one beam quad. Everything is a pure function of story time
     (reads, scans, PC activity), so seeking, pausing and 3x playback can never skip or repeat an event. */
  const makeDEV = () => {
    const DD = window.MF_DEVICE_DIMS || { K: 1.3 }, K = DD.K, M = 1 / PT_M, list = (D.devices || []).filter((d) => D.plates[d.plate || "1F"]);
    const out = { list, effects: [], solids: [], frame() {}, state: { reads: [], scans: [], pcs: [] } };
    if (!list.length) return out;
    const box = new T.BoxGeometry(1, 1, 1), cyl = new T.CylinderGeometry(.5, .5, 1, 28), hex = new T.CylinderGeometry(.5, .5, 1, 6);
    const MAT = {
      plastic: new T.MeshStandardMaterial({ roughness: .65, metalness: .05 }),
      steel: new T.MeshStandardMaterial({ roughness: .55, metalness: .25 }),
      screen: new T.MeshBasicMaterial({ toneMapped: false }),
      glow: new T.MeshBasicMaterial({ toneMapped: false }),
    };
    for (const [k, m] of Object.entries(MAT)) m.name = "MF V5 device " + k;
    const groups = {}, buckets = new Map(), dyn = [];   // dyn: instances whose colour changes (screens, LEDs)
    const groupOf = (plate) => groups[plate] || (groups[plate] = (() => { const g = new T.Group(); g.name = "MF V5 devices " + plate; g.visible = false; plates[plate].add(g); return g; })());
    const q = new T.Quaternion(), e = new T.Euler(), mtx = new T.Matrix4(), pos = new T.Vector3(), scl = new T.Vector3(), col = new T.Color();
    // part(): one box (or cylinder/hexagon) in a device's local frame. Local +z = the device's front, metres at real size,
    // s = scale applied (K for device bodies, 1 for structure). yaw turns local +z to the front direction in the plan.
    function part(d, geo, mat, lx, ly, lz, sx, sy, sz, color, s, extra = {}) {
      const c = Math.cos(d.yaw), sn = Math.sin(d.yaw), x = d.x + (lx * c + lz * sn) * s * M, z = d.y + (-lx * sn + lz * c) * s * M;
      const key = (d.plate || "1F") + "|" + geo + "|" + mat; let b = buckets.get(key); if (!b) buckets.set(key, (b = { plate: d.plate || "1F", geo, mat, list: [] }));
      const p = { dev: d.src || d, plate: d.plate || "1F", x, y: ly * s * M, z, sx: sx * s * M, sy: sy * s * M, sz: sz * s * M, color, yaw: d.yaw + (extra.yaw || 0), roll: extra.roll || 0, pitch: extra.pitch || 0, dyn: extra.dyn };
      b.list.push(p); if (extra.solid !== false && mat !== "glow" && mat !== "screen") out.solids.push(p); return p;
    }
    const FACE = { e: Math.PI / 2, w: -Math.PI / 2, n: Math.PI, s: 0 };
    const KIND_FILL = { result: "#7030A0", mapping: "#7030A0", quality: "#7030A0" };
    for (const d of list) {
      if (d.type === "pc") {
        const K = d.k || DD.K;   // per-device display scale (big icons; smaller only where the space needs it)
        d.yaw = d.yawDeg != null ? d.yawDeg * Math.PI / 180 : FACE[d.face || "e"]; const o = -.107;   // centre the desk + tower footprint on the device point
        part(d, "box", "steel", o, .78, 0, 1.2, .04, .6, 0x8a949e, K);                                         // desk top (light: reads on the pale floor)
        for (const sx of [-.57, .57]) part(d, "box", "steel", o + sx, .38, 0, .04, .76, .56, 0x4a535c, K);       // slab legs
        part(d, "box", "steel", o, .5, -.27, 1.1, .4, .02, 0x4a535c, K);                                          // modesty panel
        part(d, "box", "plastic", o, 1.0, -.16, .56, .34, .04, 0x1b1e22, K);                                      // monitor
        d.screen = part(d, "box", "screen", o, 1.005, -.137, .52, .30, .006, 0x1d3348, K, { dyn: true });        // screen
        part(d, "box", "plastic", o, .87, -.19, .05, .14, .04, 0x2a2e33, K); part(d, "box", "plastic", o, .806, -.17, .22, .012, .16, 0x2a2e33, K);
        part(d, "box", "plastic", o, .807, .1, .44, .018, .14, 0x2b2f35, K); part(d, "box", "plastic", o + .3, .807, .1, .06, .02, .1, 0x2b2f35, K);
        const tx = o + .72;                                                                                       // tower beside the desk
        part(d, "box", "plastic", tx, .21, -.02, .19, .42, .42, 0x202328, K);
        part(d, "box", "plastic", tx, .23, .193, .17, .29, .008, 0x111418, K);                                    // mesh front (inset)
        for (let i = 0; i < 6; i++) part(d, "box", "plastic", tx, .12 + i * .042, .198, .15, .006, .004, 0x2c3036, K, { solid: false });   // grille ribs
        part(d, "box", "plastic", tx, .385, .197, .15, .025, .008, 0x34383d, K);                                  // drive strip
        d.led = part(d, "box", "glow", tx + .06, .352, .199, .014, .014, .006, 0x66cfff, K, { dyn: true });       // power LED
        const fill = d.fill || KIND_FILL[d.kind] || "#7030A0";                                                     // the slide's symbol on the floor
        // Floor symbol spans .39-.53 units: above plan .3, below ribbon .65.
        part(d, d.kind === "result" ? "cyl" : d.kind === "quality" ? "hex" : "box", "plastic", o - .95, .46 / (K * M), .18, .42, .14 / (K * M), .42, new T.Color(fill).getHex(), K, { solid: false });
      } else if (d.type === "rfid-auto") {
        d.yaw = d.axis === "x" ? Math.PI / 2 : 0;   // local z = along the lane
        const g = DD.DIMS ? DD.DIMS["rfid-auto"].gap / M : 2.2, top = 8.0;
        d.gap = g; d.top = top;
        for (const sx of [-g, g]) { part(d, "box", "steel", sx, top / 2, 0, .12, top, .12, 0x66717c, 1); part(d, "box", "steel", sx, .12, 0, .3, .06, .3, 0x5a636d, 1); }
        part(d, "box", "steel", 0, top, 0, 2 * g + .2, .16, .10, 0x66717c, 1);                                   // crossbar
        d.leds = [];
        for (const side of [-1, 1]) {
          const px = side * (g - .45), roll = side * 20 * Math.PI / 180;                                         // tilted 20 deg toward the lane
          part(d, "box", "steel", px, top - .1, 0, .06, .12, .08, 0x66717c, 1);                                   // bracket
          part(d, "box", "plastic", px, top - .22, 0, .34 * K, .025 * K, .34 * K, 0xd8dce0, 1, { roll });          // backing
          part(d, "box", "plastic", px, top - .26, 0, .32 * K, .035 * K, .32 * K, 0xf3f4f3, 1, { roll });          // antenna face
          d.leds.push(part(d, "box", "glow", px - side * .1, top - .3, 0, .05, .02, .05, 0x48bdd5, K, { roll, dyn: true }));
        }
        for (const z of [-.9, .9]) part(d, "box", "plastic", 0, .13, z, 2 * g - .3, .03, .1, 0xffc000, 1, { solid: false });   // the slide's yellow marks (above the floor layers)
      } else if (d.type === "rfid-manual") {
        const K = d.k || DD.K;
        if (!d.lane) { const s = { w: [-1, 0], e: [1, 0], n: [0, -1], s: [0, 1] }[d.side || "w"]; d.lane = [d.x, d.y]; d.x += s[0] * 2 * M; d.y += s[1] * 2 * M; }
        d.yaw = Math.atan2(d.lane[0] - d.x, d.lane[1] - d.y);   // front = toward the lane
        part(d, "box", "steel", 0, .05, 0, .36, .1, .36, 0x4a535c, K); part(d, "box", "steel", 0, .5, 0, .05, 1.0, .05, 0x56616b, K);
        part(d, "box", "steel", 0, 1.0, 0, .30, .025, .25, 0x56616b, K); part(d, "box", "plastic", 0, 1.024, 0, .11, .025, .13, 0x24272b, K);   // top + cradle
        // the slide's red marks: two stripes across the lane, along the path direction
        const lane = { src: d, x: d.lane[0], y: d.lane[1], yaw: d.yaw + Math.PI / 2, plate: d.plate };
        for (const z of [-.9, .9]) part(lane, "box", "plastic", 0, .13, z, 2.6, .03, .1, 0xc00000, 1, { solid: false });
      }
    }
    // finalise: one InstancedMesh per plate | geometry | material
    const G = { box, cyl, hex };
    for (const b of buckets.values()) {
      const im = new T.InstancedMesh(G[b.geo], MAT[b.mat], b.list.length); im.name = "MF V5 " + b.plate + " " + b.geo + " " + b.mat;
      b.list.forEach((p, i) => {
        e.set(p.pitch, p.yaw, p.roll, "YXZ"); q.setFromEuler(e); mtx.compose(pos.set(p.x - CX, p.y, p.z - CY), q, scl.set(p.sx, p.sy, p.sz));
        im.setMatrixAt(i, mtx); im.setColorAt(i, col.set(p.color)); if (p.dyn) { p.im = im; p.i = i; dyn.push(p); }
      });
      im.userData.devs = b.list.map((p) => p.dev); im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; groupOf(b.plate).add(im);
    }
    // ---- manual scanners: one merged mesh each (vertex colours), animated from the cradle to the trolley and back
    const scanMat = new T.MeshStandardMaterial({ roughness: .5, metalness: .1, vertexColors: true }); scanMat.name = "MF V5 scanner";
    const scanGeos = new Map();   // one merged geometry per display scale
    function mergedScanner(K) {
      if (scanGeos.has(K)) return scanGeos.get(K);
      const parts = [[0, .06, 0, .035, .12, .045, 0x24272b], [0, .13, .03, .075, .055, .11, 0x24272b], [0, .1, .03, .015, .03, .02, 0x1a1c1f], [0, .13, .087, .06, .035, .006, 0x10151b]];
      const P = [], N = [], C = [], I = []; const tmp = new T.BoxGeometry(1, 1, 1), c = new T.Color();
      for (const [x, y, z, sx, sy, sz, hexc] of parts) {
        const g = tmp.clone().scale(sx * K * M, sy * K * M, sz * K * M).translate(x * K * M, y * K * M, z * K * M), n = P.length / 3;
        P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); c.set(hexc); for (let i = 0; i < g.attributes.position.count; i++) C.push(c.r, c.g, c.b);
        I.push(...Array.from(g.index.array, (v) => v + n));
      }
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(N, 3)); g.setAttribute("color", new T.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeBoundingSphere();
      const strip = new T.BoxGeometry(.06 * K * M, .006 * K * M, .02 * K * M).translate(0, .16 * K * M, .03 * K * M);
      scanGeos.set(K, { g, strip }); return scanGeos.get(K);
    }
    const beamMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, uniforms: { uA: { value: 0 }, uC: { value: new T.Color(0xff5555) } },
      vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uA; uniform vec3 uC; varying vec2 vP; void main(){ float u = vP.y; float w = abs(vP.x) / max(.02, u * .22 + .02); float a = (1.0 - smoothstep(.55, 1.0, w)) * (1.0 - u * .55) * uA; gl_FragColor = vec4(uC * 1.6, a); }" });
    beamMat.name = "MF V5 scan beam";
    const beamGeo = new T.BufferGeometry(); beamGeo.setAttribute("position", new T.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, .5, 1, 0, -.5, 1, 0], 3)); beamGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const scanners = list.filter((d) => d.type === "rfid-manual").map((d) => {
      const k = d.k || DD.K, geo = mergedScanner(k), g = groupOf(d.plate || "1F"), head = new T.Group(), body = new T.Mesh(geo.g, scanMat), strip = new T.Mesh(geo.strip, new T.MeshBasicMaterial({ color: 0x426dff, toneMapped: false })), beam = new T.Mesh(beamGeo, beamMat.clone());
      head.add(body, strip); head.userData.dev = d; body.userData.dev = d; g.add(head); beam.visible = false; beam.frustumCulled = false; g.add(beam); out.effects.push(beam);
      head.name = "MF V5 scanner " + d.label; beam.name = "MF V5 scan beam " + d.label; beam.renderOrder = 6;
      return { d, k, head, strip, beam, rest: new T.Vector3(d.x - CX, 1.04 * k * M, d.y - CY) };
    });
    // ---- auto gate effects: ONE merged mesh, ONE shader. Per gate: a quad across the lane, a quad along it, a floor read zone.
    const gates = list.filter((d) => d.type === "rfid-auto"), NG = gates.length;
    if (NG > 64) throw new Error("RFID shader supports at most 64 gates per project");
    const gateIndices = new Map();
    const EP = [], EA = [], EK = [], EG = [];
    gates.slice(0, NG).forEach((d, gi) => {
      const c = Math.cos(d.yaw), sn = Math.sin(d.yaw), g = d.gap, h = d.top - .3;
      const plate = d.plate || "1F"; if (!gateIndices.has(plate)) gateIndices.set(plate, []);
      const indices = gateIndices.get(plate);
      const w = (lx, ly, lz) => [d.x - CX + (lx * c + lz * sn) * M, ly * M, d.y - CY + (-lx * sn + lz * c) * M];
      const quad = (pts, local, kind) => { const n = EP.length / 3; for (let i = 0; i < 4; i++) { EP.push(...w(...pts[i])); EA.push(...local[i]); EK.push(kind); EG.push(gi); } indices.push(n, n + 1, n + 2, n, n + 2, n + 3); };
      quad([[-g + .2, 0, 0], [g - .2, 0, 0], [g - .2, h, 0], [-g + .2, h, 0]], [[-g + .2, 0], [g - .2, 0], [g - .2, h], [-g + .2, h]], 0);   // across the lane
      quad([[0, 0, -1.4], [0, 0, 1.4], [0, h, 1.4], [0, h, -1.4]], [[-1.4, 0], [1.4, 0], [1.4, h], [-1.4, h]], 1);                          // along the lane
      quad([[-g + .25, .16, -.9], [g - .25, .16, -.9], [g - .25, .16, .9], [-g + .25, .16, .9]], [[-g + .25, -.9], [g - .25, -.9], [g - .25, .9], [-g + .25, .9]], 2);   // floor
    });
    const waveU = { uTime: { value: 0 }, uAct: { value: new Float32Array(64) }, uRead: { value: new Float32Array(64) }, uGap: { value: gates[0] ? gates[0].gap : 2.2 }, uTop: { value: gates[0] ? gates[0].top - .3 : 7.7 }, uAlpha: { value: 0 } };
    if (NG) {
      const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(EP, 3)); geo.setAttribute("aL", new T.Float32BufferAttribute(EA, 2)); geo.setAttribute("aK", new T.Float32BufferAttribute(EK, 1)); geo.setAttribute("aG", new T.Float32BufferAttribute(EG, 1)); geo.computeBoundingSphere();
      const mat = new T.ShaderMaterial({ uniforms: waveU, transparent: true, depthWrite: false, depthTest: true, side: T.DoubleSide,
        vertexShader: "attribute vec2 aL; attribute float aK; attribute float aG; varying vec2 vL; varying float vK; varying float vG; void main(){ vL = aL; vK = aK; vG = aG; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `uniform float uTime, uGap, uTop, uAlpha; uniform vec4 uAct[16]; uniform vec4 uRead[16]; varying vec2 vL; varying float vK; varying float vG;
float pick(vec4 a[16], int i){ int q = i / 4, c = i - q * 4; vec4 v = vec4(0.0); for (int k = 0; k < 16; k++) if (k == q) v = a[k]; return c == 0 ? v.x : c == 1 ? v.y : c == 2 ? v.z : v.w; }
// radar bands leaving an emitter e along the direction n, inside a cone; period: seconds per band
float radar(vec2 p, vec2 e, vec2 n, float period, float act){
  vec2 d = p - e; float r = length(d); if (r < .05) return 0.0;
  float cone = smoothstep(.55, .9, dot(d / r, n));
  float ph = fract(r * .42 - uTime / period);
  float band = smoothstep(0.0, .06, ph) * (1.0 - smoothstep(.1, .24, ph));
  return cone * band * (1.0 - smoothstep(uTop * .55, uTop * 1.05, r)) * (.55 + .45 * act);
}
void main(){
  int gi = int(vG + .5); float act = pick(uAct, gi), rd = pick(uRead, gi), period = mix(1.6, .6, act);
  vec3 cyan = vec3(.282, .741, .835), green = vec3(.333, .839, .627);
  float a = 0.0;
  if (vK < .5) {          // across the lane: two antennas tilted 20 degrees toward the lane
    float px = uGap - .45; a = radar(vL, vec2(-px, uTop + .1), normalize(vec2(.342, -.94)), period, act) + radar(vL, vec2(px, uTop + .1), normalize(vec2(-.342, -.94)), period, act);
    a *= mix(.34, .62, act);
  } else if (vK < 1.5) {  // along the lane: the same wavefronts seen side-on
    a = radar(vL, vec2(0.0, uTop + .1), vec2(0.0, -1.0), period, act) * mix(.28, .55, act);
  } else {                // floor read zone between the yellow marks
    vec2 q = abs(vL) / vec2(uGap - .25, .9); float edge = smoothstep(.84, .97, max(q.x, q.y));
    float ring = 1.0 - smoothstep(0.0, .07, abs(max(q.x, q.y) - fract(uTime / period)));
    a = edge * mix(.35, .7, act) + ring * mix(.16, .4, act) + .1 * act;
  }
  a += vK > 1.5 ? rd * .35 : rd * .12 * smoothstep(0.0, .02, a);   // the green read pulse brightens the zone and the bands
  vec3 c = mix(cyan, green, clamp(rd * 1.4, 0.0, 1.0));
  float alpha = clamp(a, 0.0, .85) * uAlpha; if (alpha < .003) discard;
  gl_FragColor = vec4(c, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` });
      mat.name = "MF V5 RFID waves";
      for (const [plate, indices] of gateIndices) {
        const pg = geo.clone(); pg.setIndex(indices);
        const fx = new T.Mesh(pg, mat); fx.name = "MF V5 RFID read zones " + plate; fx.renderOrder = 5; fx.frustumCulled = false; fx.visible = false; groupOf(plate).add(fx); out.effects.push(fx);
      }
      geo.dispose();
    }
    // ---- events, all pure functions of story time: gate crossings, manual scan windows, PC activity
    const flows = D.flows.map((f) => {
      const reads = [], passes = [];   // gate reads { g, t }, drive-by manual scans { s, t }
      for (const sc of scanners) sc._m = null;
      for (const it of f.items) {
        if (!it.sched || !it.sched.phases.length) continue;
        const o = { x: 0, y: 0 }, steps = Math.max(8, Math.ceil(it.sched.duration * 60));
        let prevX = 0, prevY = 0, hasPrev = false;
        const plate = D.nodes[it.s.node].plate;
        const held = new Set();
        for (const phase of it.sched.phases) if (phase.k === "scan") {
          const sc = scanners.find(sc => sc.d.plate === plate && sc.d.sym === phase.scanner);
          if (sc) { held.add(sc); passes.push({ s: sc, t: it.t0 + phase.t0 + .6 }); }
        }
        for (let k = 0; k <= steps; k++) {
          const tau = it.sched.duration * k / steps; sampleSchedule(it.sched, tau, o);
          // drive-by scans: a manual point the trolley passes without stopping (closest approach under 4.5 units)
          for (const sc of scanners) if (!held.has(sc) && !sc.d.node && sc.d.routeBound !== false && sc.d.plate === plate) { const dd = Math.hypot(o.x - sc.d.lane[0], o.y - sc.d.lane[1]); const m = sc._m || (sc._m = { best: Infinity, t: 0, it: null }); if (dd < m.best && dd < 4.5) { m.best = dd; m.t = it.t0 + tau; m.it = it; } else if (m.best < 4.5 && dd > m.best + 2) { passes.push({ s: sc, t: m.t }); m.best = Infinity; } }
          if (hasPrev) gates.forEach((d, gi) => {
            if (d.plate !== plate) return;
            const alongY = d.axis !== "x", a0 = alongY ? prevY - d.y : prevX - d.x, a1 = alongY ? o.y - d.y : o.x - d.x, across = alongY ? Math.abs(o.x - d.x) : Math.abs(o.y - d.y);
            if (((a0 < 0 && a1 >= 0) || (a0 > 0 && a1 <= 0)) && across < d.gap * M) reads.push({ g: gi, t: it.t0 + tau - (it.sched.duration / steps) * (Math.abs(a1) / (Math.abs(a0) + Math.abs(a1))) });
          });
          prevX = o.x; prevY = o.y; hasPrev = true;
        }
        for (const sc of scanners) { if (sc._m && sc._m.best < 4.5) passes.push({ s: sc, t: sc._m.t }); sc._m = null; }
      }
      const scans = f.items.filter((it) => !it.s.intro && scanners.some((s) => s.d.node === it.s.node)).map((it) => ({ it, s: scanners.find((s) => s.d.node === it.s.node) }));
      const pcDone = new Map(); for (const it of f.items) if (!it.s.intro) pcDone.set(it.s.node, Math.min(pcDone.get(it.s.node) ?? Infinity, it.t1));
      return { reads, scans, passes, pcDone };
    });
    out.state.reads = flows.map((f) => f.reads.map((r) => ({ gate: r.g, t: +r.t.toFixed(3) })));
    out.state.scans = flows.map(f => [...f.scans.map(j => ({ scanner: j.s.d.sym, start: j.it.tm, end: j.it.t1 })), ...f.passes.map(p => ({ scanner: p.s.d.sym, start: p.t - .6, end: p.t + 1.2 }))]);
    // ---- toasts: small "done" chips above a device (DOM, two at most, positions cached like the node chips)
    const toasts = [0, 1].map(() => { const el = document.createElement("div"); el.className = "v5toast"; el.style.display = "none"; labels.append(el); return { el, text: "", shown: false, px: NaN, py: NaN }; });
    const tp = new T.Vector3(), tOut = [0, 0, 0];
    function toast(k, text, x, y, h, color) {
      const t = toasts[k]; if (!text) { if (t.shown) { t.el.style.display = "none"; t.shown = false; } return; }
      if (t.text !== text) { t.el.textContent = t.text = text; } if (t.color !== color) { t.el.style.setProperty("--c", color); t.color = color; }
      proj(W(x, y, S.stack, h, tp), tOut); const vis = tOut[2] > -1 && tOut[2] < 1 && tOut[0] > -100 && tOut[0] < innerWidth + 100 && tOut[1] > -100 && tOut[1] < innerHeight + 100;
      if (vis !== t.shown) { t.el.style.display = vis ? "block" : "none"; t.shown = vis; }
      if (vis) { const px = tOut[0], py = tOut[1]; if (px !== t.px || py !== t.py) { t.px = px; t.py = py; t.el.style.transform = `translate(${px}px,${py}px) translate(-50%,-100%)`; } }
    }
    const SCREEN = { idle: new T.Color(0x1d3348), live: new T.Color(0x7fd6ff), done: new T.Color(0x9ff0c8) }, LED = { idle: new T.Color(0x48bdd5), read: new T.Color(0x55d6a0) };
    const camDir = new T.Vector3(), aimTo = new T.Vector3(), tmpV = new T.Vector3(), headQ = new T.Quaternion(), lens = new T.Vector3(), beamUp = new T.Vector3(0, 1, 0);
    const deviceGroups = Object.values(groups), pcs = list.filter(d => d.type === "pc"), waveMeshes = out.effects.filter(fx => fx.name.startsWith("MF V5 RFID"));
    const scanChip = {}, pcChip = {}, gateChip = { text: "✓ RFID read", color: "#1f9d6b" };
    let lastRise = -1;
    out.frame = (cur, lp, dt, time) => {
      const R = S.R, show = R > .02;
      for (const g of deviceGroups) { g.visible = show; if (show && Math.abs(R - lastRise) > 1e-4) g.scale.y = Math.max(.002, R * R * (3 - 2 * R)); }
      lastRise = R;
      if (!show) { toast(0, ""); toast(1, ""); return; }
      const fl = flows[S.flow], now = S.t, effA = clamp((R - .6) / .3, 0, 1);
      waveU.uTime.value = now; waveU.uAlpha.value = effA;
      for (const fx of waveMeshes) fx.visible = effA > .01;
      // gates: inside the read zone (act) and the read confirmation (rd), from story time
      const hold = .9 * Math.max(1, S.speed), riding = lp.lift == null && !cur.s.intro, activePlate = D.nodes[cur.s.node].plate;
      let toastGate = -1, toastAge = 1e9;
      gates.forEach((d, gi) => {
        if (gi >= 64) return;
        const along = d.axis !== "x" ? lp.y - d.y : lp.x - d.x, across = d.axis !== "x" ? Math.abs(lp.x - d.x) : Math.abs(lp.y - d.y);
        const target = riding && d.plate === activePlate && across < d.gap * M ? ease(clamp((3.2 * M - Math.abs(along)) / (1.2 * M), 0, 1)) : 0, a = waveU.uAct.value;
        a[gi] = target;   // seekable: independent of prior frames and playback speed
        let rd = 0; for (const r of fl.reads) if (r.g === gi && S.t >= r.t && S.t < r.t + hold) { const age = S.t - r.t; rd = Math.max(rd, 1 - age / hold); if (age < toastAge) { toastAge = age; toastGate = gi; } }
        waveU.uRead.value[gi] = rd;
        for (const led of d.leds) setDyn(led, rd > .01 ? LED.read : LED.idle, rd > .01 ? 1.6 : 1);
      });
      // manual scanners: lift from the cradle, aim at the trolley's tag, beam, green confirmation, back to the cradle
      let scanToast = null;
      for (const sc of scanners) {
        let job = null; for (const j of fl.scans) if (j.s === sc && cur === j.it) { job = j; break; }
        let u = -1; if (job && S.t >= job.it.tm) u = clamp((S.t - job.it.tm) / Math.max(.2, job.it.t1 - job.it.tm), 0, 1);
        if (u < 0) for (const p of fl.passes) if (p.s === sc && S.t >= p.t - .6 && S.t <= p.t + 1.2) u = (S.t - (p.t - .6)) / 1.8;   // drive-by
        const lift = u < 0 ? 0 : u < .25 ? ease(u / .25) : u < .85 ? 1 : 1 - ease((u - .85) / .15);
        tmpV.set(sc.d.lane[0] - CX, 1.05 * 1.4 * M, sc.d.lane[1] - CY);   // the trolley's tag (side panel, about 1.05 m at 1.4x)
        aimTo.copy(sc.rest).lerp(tmpV, .38 * lift); aimTo.y = sc.rest.y + lift * .32 * sc.k * M;
        sc.head.position.copy(aimTo);
        camDir.subVectors(tmpV, aimTo); const yaw = Math.atan2(camDir.x, camDir.z), pitch = -Math.atan2(camDir.y, Math.hypot(camDir.x, camDir.z));
        headQ.setFromEuler(e.set(lerp(-.26, pitch, lift), lift > .01 ? yaw : sc.d.yaw, 0, "YXZ")); sc.head.quaternion.copy(headQ);
        const beamOn = u > .3 && u < .62, done = u >= .62;
        sc.beam.visible = beamOn && show;
        if (beamOn) {
          lens.subVectors(tmpV, aimTo); const L = lens.length(); sc.beam.position.copy(aimTo).addScaledVector(lens, .04);
          sc.beam.scale.set(.6 * M, L * .96, 1); sc.beam.quaternion.setFromUnitVectors(beamUp, lens.normalize());
          const k = (u - .3) / .32; sc.beam.material.uniforms.uA.value = .55 * Math.sin(Math.PI * k) + .25;
        }
        sc.strip.material.color.set(done ? 0x55d6a0 : beamOn ? 0xff5555 : 0x426dff);
        if (u >= 0) { scanToast = scanChip; scanChip.text = done ? "✓ " + (sc.d.done || "RFID scanned") : "Scanning…"; scanChip.x = sc.d.lane[0]; scanChip.y = sc.d.lane[1]; scanChip.color = done ? "#1f9d6b" : "#c03a3a"; }
      }
      // PCs: the PC of the current stop lights up when the trolley has arrived; "done" once its step is complete
      let pcToast = null;
      for (const d of pcs) {
        const here = !cur.s.intro && cur.s.node === d.node && S.t >= cur.tm, past = (fl.pcDone.get(d.node) ?? Infinity) <= S.t;
        setDyn(d.screen, here ? (S.t - cur.tm > (cur.t1 - cur.tm) * .45 ? SCREEN.done : SCREEN.live) : past ? SCREEN.done : SCREEN.idle, here ? 1.5 : 1);
        if (here) { pcToast = pcChip; pcChip.text = (S.t - cur.tm > (cur.t1 - cur.tm) * .45 ? "✓ " : "") + (d.done || d.label); pcChip.x = d.x; pcChip.y = d.y; pcChip.color = "#2f6fb0"; }
      }
      // at most two chips: the current event first (scan, PC), then a gate read
      let gateToast = null;
      if (toastGate >= 0) { const d = gates[toastGate]; gateToast = gateChip; gateChip.x = d.x; gateChip.y = d.y; gateChip.h = (d.top + .5) * M; }
      emit(0, scanToast || pcToast || gateToast);
      emit(1, scanToast ? pcToast || gateToast : pcToast ? gateToast : null);
      for (const p of dyn) if (p.dirty) { p.im.instanceColor.needsUpdate = true; p.dirty = false; }
    };
    function emit(k, c) { if (c) toast(k, c.text, c.x, c.y, c.h || 3.2 * K * M, c.color); else toast(k, ""); }
    function setDyn(p, c, gain) { if (!p) return; col.copy(c).multiplyScalar(gain); col.r = Math.fround(col.r); col.g = Math.fround(col.g); col.b = Math.fround(col.b); const a = p.im.instanceColor.array, o = p.i * 3; if (a[o] !== col.r || a[o + 1] !== col.g || a[o + 2] !== col.b) { p.im.setColorAt(p.i, col); p.dirty = true; } }
    out.gates = gates; out.scanners = scanners; out.groups = groups; out.waves = waveU;
    return out;
  };
  DEV = makeDEV();

  function disposeDEV() {
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
  window.MF = { prepared: PREP.promise, x: { rebuild: v7Rebuild, rebuildDevices: v7Devices, rebuildPlanArt, renderer, camera, cameraTarget, frameLot: () => frameLot, F, stepAt, lotPos: (t, o) => lotPos(t, o), worldFromLot, plateOf, hitFloor, floors, plates, scene, labels, getE: () => E, ELEVATORS, GAP, CX, CY, INTRO, glideY, prepareChaseEnvelope, tip, toFree, setSpeed, renderFlow, resize, flat, fit, bare: () => bareOn }, devices: DEV, sight: SIGHT, glideAt, glideX, glideY, riseBounds:{start:RISE_START,end:RISE_END,band:RISE_BAND,center:CX}, cine, lot, floors, scene, plates, gates, cabin, shaft, S, D, RP, REP, W, proj, seek, play, pause, stepBy, setFlow, setView, setCam, setLook, setPlan, setMeasure, setQuality, setFloorLight, debugFloor, stepAt, frame, want, perf: metrics,   // used by the tests
    LOOK, PT_M, motion: { V_MAX, RAMP_T, TURN_T, DWELL, LIFT_T, STATION_T }, schedule: buildSchedule, sampleSchedule, cleanPath, lotPose: (t) => { const o = lotPos(t, { x: 0, y: 0, i: 1, u: 0, lift: null, it: null, h: 0, d: 0, v: 0, k: "hold", seg: 0 }); return o; }, route: { uniforms: routeU, flows: routeFlows, lifts: routeLifts, liftState: liftDiagnostics, plateOf }, vehicleAPI: physicalVehicles,
    // Round 5: reflection = { state, uniforms, update, warm, set({enabled, every, strength, f0, distort, blur}), summary(), debug(), renderNow() };
    // setSpeed(v) / stepSpeed(+-1) drive the #speed select; setRoof(on) drives S.roof + REP.setRoof (guarded); camera = feed-forward diagnostics.
    reflection, setSpeed, stepSpeed, setRoof: (on) => { if (S.roof !== !!on) tRoof(); return S.roof; }, camera: { eye: camera.position, target: cameraTarget, near: camera.near, fov: camera.fov, ceiling: () => chaseEnvelope.top + highestFloor * glideY(S.stack), ff: camFF, ffSmooth: camFFSmooth, scale: camScale, eyeVelocity, targetVelocity } };
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
      if (REP.ready && typeof REP.ready.then === "function") { await REP.ready; bindReplicaMeshes(); prepareChaseEnvelope(); replicaVisible = null; REP.rise(S.R); REP.live(0, 1, 0); SIGHT.rebuild(); }
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
      composer.width = composer.height = 0; resize();
      try { for (const k of [.15, .45, .75, 1]) { REP.rise(k); REP.live(k, 1, 0); for (const f of floors) f.art.material = k > .85 ? f.surfaceMaterial : f.planMaterial; for (let i = 0; i < 2; i++) renderer.render(scene, camera); } renderer.getContext().finish(); } catch (e) { console.warn("full-size warm-up", e); }
      finally { for (const f of floors) f.art.material = f.planMaterial; REP.rise(S.R); REP.live(0, 1, 0); }
      canvas.style.visibility = oldVisibility;
    }
    // Finish resource creation and initial DOM layout before the story can start.
    // GPU finish is deliberately startup-only; never synchronise it in the hot loop.
    frame(0, 0); void document.body.offsetHeight; renderer.getContext().finish();
    metrics.lastMask = 0; event("startup-warmup", start); last = performance.now(); if (query.get("prep") !== "0") prepStart(); else PREP.done({ frames: 0, ms: 0, skipped: false }); requestAnimationFrame(tick);
  })();
})();
