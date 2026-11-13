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
    const st = { enabled: query.get("reflect") === "1", active: false, reason: "init", every: 3, tick: 0, stale: true, renders: 0, skipped: 0, skippedOffscreen: 0, planeY: 0, published: 0, planeChanges: 0, dominant: "", width: 0, height: 0, lastMs: 0, maxMs: 0, calls: 0, triangles: 0, allocations: 0, halfFloat: true, error: null };
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
      hide = [grid, beacon, contactBlob, ...origs, ...atmosObjects, ...routeFlows.flatMap(r => r.meshes), ...(DEV ? DEV.effects : [])];
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
        if (previousAuto) scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false;   // frame already updated matrices; renderNow still works
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
    return { rehide: () => { hide = null; }, update, warm, resize, set, summary, debug, state: st, uniforms: U, renderNow: () => { renderAt(floorY(dominant || floors[0])); st.stale = false; st.renders++; return summary(); } };
  })();

