  /* ---------- V5 devices: PC workstations, auto RFID gates, manual RFID scanners (data: D.devices) ----------
     Inserted into the player closure by tools/build-v5.mjs. Owner's legend: circle = Prod. Result / GR PC, square = TO Mapping /
     GI PC, hexagon = Quality PC; yellow = auto RFID gate (read on the move, ceiling antennas), red = manual RFID point
     (the trolley stops, the operator scans it with the handheld scanner).
     Cost: all static parts are a few InstancedMeshes per plate (shared box geometry, 4 materials); all gate effects are ONE merged
     mesh with one shader; each scanner is one merged mesh + one beam quad. Everything is a pure function of story time
     (reads, scans, PC activity), so seeking, pausing and 3x playback can never skip or repeat an event. */
  DEV = (() => {
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
      const p = { plate: d.plate || "1F", x, y: ly * s * M, z, sx: sx * s * M, sy: sy * s * M, sz: sz * s * M, color, yaw: d.yaw + (extra.yaw || 0), roll: extra.roll || 0, pitch: extra.pitch || 0, dyn: extra.dyn };
      b.list.push(p); if (extra.solid !== false && mat !== "glow" && mat !== "screen") out.solids.push(p); return p;
    }
    const FACE = { e: Math.PI / 2, w: -Math.PI / 2, n: Math.PI, s: 0 };
    const KIND_FILL = { result: "#7030A0", mapping: "#7030A0", quality: "#7030A0" };
    for (const d of list) {
      if (d.type === "pc") {
        const K = d.k || DD.K;   // per-device display scale (big icons; smaller only where the space needs it)
        d.yaw = FACE[d.face || "e"]; const o = -.107;   // centre the desk + tower footprint on the device point
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
        const lane = { x: d.lane[0], y: d.lane[1], yaw: d.yaw + Math.PI / 2, plate: d.plate };
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
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; groupOf(b.plate).add(im);
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
      head.add(body, strip); g.add(head); beam.visible = false; beam.frustumCulled = false; g.add(beam); out.effects.push(beam);
      head.name = "MF V5 scanner " + d.label; beam.name = "MF V5 scan beam " + d.label; beam.renderOrder = 6;
      return { d, k, head, strip, beam, rest: new T.Vector3(d.x - CX, 1.04 * k * M, d.y - CY) };
    });
    // ---- auto gate effects: ONE merged mesh, ONE shader. Per gate: a quad across the lane, a quad along it, a floor read zone.
    const gates = list.filter((d) => d.type === "rfid-auto"), NG = gates.length;
    if (NG > 8) throw new Error("RFID shader supports at most 8 gates per project");
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
    const waveU = { uTime: { value: 0 }, uAct: { value: new Float32Array(8) }, uRead: { value: new Float32Array(8) }, uGap: { value: gates[0] ? gates[0].gap : 2.2 }, uTop: { value: gates[0] ? gates[0].top - .3 : 7.7 }, uAlpha: { value: 0 } };
    if (NG) {
      const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(EP, 3)); geo.setAttribute("aL", new T.Float32BufferAttribute(EA, 2)); geo.setAttribute("aK", new T.Float32BufferAttribute(EK, 1)); geo.setAttribute("aG", new T.Float32BufferAttribute(EG, 1)); geo.computeBoundingSphere();
      const mat = new T.ShaderMaterial({ uniforms: waveU, transparent: true, depthWrite: false, depthTest: true, side: T.DoubleSide,
        vertexShader: "attribute vec2 aL; attribute float aK; attribute float aG; varying vec2 vL; varying float vK; varying float vG; void main(){ vL = aL; vK = aK; vG = aG; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `uniform float uTime, uGap, uTop, uAlpha; uniform float uAct[8]; uniform float uRead[8]; varying vec2 vL; varying float vK; varying float vG;
float pick(float a[8], int i){ float r = 0.0; for (int k = 0; k < 8; k++) if (k == i) r = a[k]; return r; }
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
        if (gi >= 8) return;
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
  })();
