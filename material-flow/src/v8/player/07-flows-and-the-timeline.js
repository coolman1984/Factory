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
  function cleanPath(path) { return MFMotion.cleanPath(path); }
  // Smooth ramp: v = vp * smoothstep(x); distance = vp * Ta * (x^3 - x^4 / 2), which reaches vp * Ta / 2 at x = 1.
  const rampDist = (x) => x * x * x - x * x * x * x * .5, rampSpeed = (x) => x * x * (3 - 2 * x);
  function segmentProfile(L, VM = V_MAX) { return MFMotion.segmentProfile(L, VM); }
  function segmentAdvance(p, L, tau) { return MFMotion.segmentAdvance(p, L, tau); }
  function segmentSpeed(p, tau) { return MFMotion.segmentSpeed(p, tau); }
  // hIn: heading carried in from the previous step (undefined = this route sets its own initial heading, no turn).
  function buildSchedule(path, hIn, VM = V_MAX) { return MFMotion.schedule(path, hIn, VM); }
  // Pure, seekable: out.x/y = position (slide points), h = heading (radians, rotation.y convention), d = distance along the
  // cleaned route (slide points), v = speed (m/s), k = "move" | "turn" | "end", seg = index of the current/next segment.
  function sampleSchedule(s, tau, out) { return MFMotion.sample(s, tau, out); }
  // Add scan holds within a leg, preserving the owner's stop order and the original orthogonal path.
  // Split a move at each route-bound handheld point, so acceleration/deceleration remains physical.
  function scheduleManualStops(sched, plate) { return MFMotion.withScanStops(sched, plate, D.devices); }

  function buildFlow(f) { f.E = elevatorFor(f); f.items = [{ s: { node: f.steps[0].node, title: "From flat plan to factory", what: RP.source === "cad" ? `Rebuilt from the CAD drawing in real dimensions: ${st.racks} rack blocks, ${st.machines + RP.machines.filter(m => m.type === "utility").length} machines and plant units, ${st.columns} columns, ${st.walls} walls.` : `Rebuilt from the slide: ${st.racks} rack blocks, ${st.machines} machines, ${st.columns} columns, ${st.walls} walls. Scale 1 slide point = ${PT_M} m.`, mode: "flow", view: "2d", dist: 300, intro: true }, i: 0, path: null, t0: 0, tm: INTRO - .6, t1: INTRO, h0: 0, h1: 0, sched: null, base: 0, run: 0, metres: 0 }]; const intro=f.items[0], result=MFMotion.timeline(D,f,f.E || E); f.items=result.items; f.items[0]=intro; f.total=result.total; }
  D.flows.forEach(buildFlow);
  E = D.flows[0].E || E;
  for (const flow of D.flows) for (const it of flow.items) if (it.path) pathInfo(it.path);
  let liftIndices = D.flows.map(f => f.items.findIndex(it => it.s.lift)); const plateEntriesForGroups = Object.entries(plates);
  metrics.timeline = D.flows.map(f => f.items.map(it => ({ i: it.i, t0: it.t0, tm: it.tm, t1: it.t1, view: it.s.view })));
  const F = () => D.flows[S.flow];
  const stepAt = t => MFMotion.stepAt(F().items,t);
  function along(path, u, out) {
    const info = pathInfo(path), d = u * info.length;
    for (let i = 1; i < path.length; i++) { if (d <= info.cumulative[i] || i === path.length - 1) { const a = path[i - 1], b = path[i], l = info.cumulative[i] - info.cumulative[i - 1], k = l ? clamp((d - info.cumulative[i - 1]) / l, 0, 1) : 0; out.x = lerp(a[0], b[0], k); out.y = lerp(a[1], b[1], k); out.i = i; return out; } }
    out.x = path[0][0]; out.y = path[0][1]; out.i = 1; return out;
  }
  const worldSample = { x: 0, y: 0, i: 1, u: 0, lift: null, it: null, h: 0, d: 0, v: 0, k: "hold", seg: 0 }, frameLot = { ...worldSample }, pathHead = { x: 0, y: 0, i: 1 };
  const worldHigh = new T.Vector3(), lotPoint = new T.Vector3(), liftLow = new T.Vector3(), liftHigh = new T.Vector3(), cameraPoint = new T.Vector3(), segmentA = new T.Vector3(), segmentB = new T.Vector3();
  // The lot's pose is a pure function of story time: position, heading (h), distance along the route (d, slide points),
  // speed (v, m/s), phase (k: move / turn / end / hold) and the current segment. u = d / route length (exact, not a time fraction).
  function lotPos(t, out) { return MFMotion.pose(F().items, D.nodes, t, out); }
  function worldFromLot(p, stack, out) {
    if (p.lift == null) return W(p.x, p.y, stack, .8, out);
    return W(E.low[0], E.low[1], stack, .8, out).lerp(W(E.high[0], E.high[1], stack, .8, worldHigh), p.lift);
  }
  function lotWorld(t, stack, out) { return worldFromLot(lotPos(t, worldSample), stack, out); }

  /* ---------- route light: a real floor ribbon + station rings ----------
     Static geometry per (flow, plate), parented to the plate group, so stack / floor offsets / elevator positions follow the
     plate transform for free. Nothing is rebuilt or uploaded per frame: shared uniforms only (done distance, story time, step,
     gain, alpha). aU is the flow-global route distance in metres, so "travelled" is one uniform: it.base + schedule distance. */
  const routeU = { done: { value: 0 }, time: { value: 0 }, gain: { value: 1 }, alpha: { value: 0 }, step: { value: 0 }, dim: { value: 1 } };
  const RIBBON_W = 4, RIBBON_Y = .65, STATION_R = 6;
  // One fragment program for the floor ribbon and the elevator connector. uHead gates the leading glow
  // (1 on the floor ribbon; on the connector it is 1 only while the lot is actually travelling it).
  const RIBBON_FRAG = `uniform float uDone, uTime, uGain, uAlpha, uDim, uHead, uStep; varying float vU; varying float vV; varying float vI;
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
  vec3 base=mix(vec3(0.015,0.16,0.24),vec3(0.95,0.28,0.015),reach);
  vec3 rgb=mix(base,vec3(1.0,0.94,0.72),clamp(band*0.72+head*0.45,0.0,0.85))*uGain;
  float focus=mix(0.12,1.0,1.0-step(0.5,abs(vI-uStep)));
  float a = (0.92 * (1.0-smoothstep(0.65,1.0,e)) + head * 0.15) * lit * uAlpha * focus;
  gl_FragColor = vec4(rgb, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
  const ROUTE_STATE = { transparent: true, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
  const ribbonMaterial = new T.ShaderMaterial({
    uniforms: { uDone: routeU.done, uTime: routeU.time, uGain: routeU.gain, uAlpha: routeU.alpha, uDim: routeU.dim, uHead: { value: 1 }, uStep: routeU.step }, ...ROUTE_STATE,
    vertexShader: "attribute float aU; attribute float aV; attribute float aI; varying float vU; varying float vV; varying float vI;\nvoid main() { vI=aI; vU = aU; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: RIBBON_FRAG
  });
  // Elevator connector: same fragment program, one material per lift step (same GLSL, so one compiled program) so each
  // carries its own progress. aU runs 0..1 along the connector; uLen (metres) turns it into route metres in the vertex stage.
  const LIFT_VERT = "attribute float aU; attribute float aV; uniform float uLen; uniform float uStep; varying float vU; varying float vV; varying float vI;\nvoid main() { vI=uStep; vU = aU * uLen; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
  const makeLiftMaterial = () => new T.ShaderMaterial({
    uniforms: { uDone: { value: -.5 }, uHead: { value: 0 }, uLen: { value: 1 }, uTime: routeU.time, uGain: routeU.gain, uAlpha: routeU.alpha, uDim: routeU.dim, uStep: routeU.step }, ...ROUTE_STATE,
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
  const makeRouteFlows = () => D.flows.map((f, fi) => {
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
        station((f.E || E).low[0], (f.E || E).low[1], it.i);
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
        // Split at every plate-zone edge so every portion belongs to the plate it lies on.
        // Neighbouring pieces on the same plate merge back; aU stays the global distance and only true corners get the joint overlap.
        const cuts = [0]; { const tc = []; if (rx) for (const x of CUT_X) { const t = (x - a[0]) / rx; if (t > 1e-6 && t < 1 - 1e-6) tc.push(t); } if (ry) for (const y of CUT_Y) { const t = (y - a[1]) / ry; if (t > 1e-6 && t < 1 - 1e-6) tc.push(t); } tc.sort((p, q) => p - q); cuts.push(...tc.filter((t, j) => !j || t - tc[j - 1] > 1e-6), 1); }
        const pieces = [];
        for (let k = 1; k < cuts.length; k++) {
          const t0 = cuts[k - 1], t1 = cuts[k], tm = (t0 + t1) / 2, plate = plateOf(a[0] + rx * tm, a[1] + ry * tm), last = pieces[pieces.length - 1];
          if (last && last.plate === plate) last.t1 = t1; else pieces.push({ plate, t0, t1 });
        }
        for (const pc of pieces) {
          const s0 = pc.t0 === 0 ? e0 : 0, s1 = pc.t1 === 1 ? e1 : 0;   // joint overlap only at the segment's own ends
          const ax = a[0] + rx * pc.t0 - CX - dx * s0, ay = a[1] + ry * pc.t0 - CY - dy * s0, bx = a[0] + rx * pc.t1 - CX + dx * s1, by = a[1] + ry * pc.t1 - CY + dy * s1;
          const g = bucket(ribbon, pc.plate, () => ({ pos: [], u: [], v: [], i: [], idx: [] }));
          const u0 = cum + pc.t0 * len * PT_M - s0 * PT_M, u1 = cum + pc.t1 * len * PT_M + s1 * PT_M;
          quad(g, ax + nx, ay + ny, ax - nx, ay - ny, bx - nx, by - ny, bx + nx, by + ny, h => { h.u.push(u0, u0, u1, u1); h.v.push(1, -1, -1, 1); h.i.push(it.i,it.i,it.i,it.i); });
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
    make(ribbon, ribbonMaterial, 3, [["aU", 1, "u"], ["aV", 1, "v"], ["aI", 1, "i"]]); make(rings, ringMaterial, 4, [["aC", 2, "c"], ["aI", 1, "i"]]);
    return { meshes, lifts, shown: false };
  });
  let routeFlows = makeRouteFlows(), routeLifts = routeFlows.flatMap(r => r.lifts);
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

