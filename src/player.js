/* Material Flow Player: one scene, full control. Everything on screen is a function of (flow, time, view, camera):
   the timeline can jump anywhere, and the viewer can leave the guided camera at any moment and keep playing.
   Slide coordinates (960 x 540) are kept all the way, 1 point = 0.30 m. Each plan is a plate that can move and rise:
   stack 0 = the slide layout, 1 = floors stacked. R is how far the factory has risen out of the flat plan (0 = 2D, 1 = 3D). */
"use strict";
(function () {
  const D = window.MF_DATA, RP = window.MF_REPLICA, T = window.THREE, $ = (id) => document.getElementById(id);
  function fail(m) { const e = $("err"); e.style.display = "grid"; e.textContent = m; }
  if (!T) { fail("The 3D library did not load."); return; }
  const CX = 480, CY = 290, GAP = 120, DWELL = 1.6, SPEED = 95, INTRO = 7, PT_M = RP.scale;
  const plateOf = (x, y) => (x < 553 ? "E1" : y >= 303 ? "E2-1F" : "E2-2F");
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);
  const query = new URLSearchParams(location.search);

  /* ---------- state ---------- */
  const S = { flow: 0, t: 0, playing: false, speed: 1, view: "auto", cam: "guided", stack: 0, stackUser: null, labels: true, net: false, panel: true, stepStop: false, R: 0, focus: true, sound: false, plan: "replica", look: "studio", quality: query.get("q") || "high", measure: false, pts: [],
    c: { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: 0.001 } };
  const want = { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: 0.001 };

  /* ---------- renderer and light ---------- */
  function W(x, y, s = S.stack, up = 0.8) { const P = D.plates[plateOf(x, y)]; return new T.Vector3(x - CX + s * P.dx, s * P.lift * GAP + up, y - CY + s * P.dz); }
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas: $("gl"), antialias: true, powerPreference: "high-performance" }); } catch (e) { fail("This browser could not start 3D (WebGL)."); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(28, 1, 8, 7000);
  const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(new T.RoomEnvironment(), .04).texture; pm.dispose();
  const hemi = new T.HemisphereLight(0xffffff, 0x2a3550, 1), sun = new T.DirectionalLight(0xfff2e0, 2.4); sun.position.set(-420, 720, 340); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -760, right: 760, top: 620, bottom: -620, near: 50, far: 1700 }); sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -.0004; sun.shadow.normalBias = .5; sun.shadow.radius = 4;
  scene.add(hemi, sun);
  const grid = new T.GridHelper(2200, 44, 0x24324d, 0x141e33); grid.position.y = -8; scene.add(grid);

  /* ---------- plates: slab, clean replica plan, original plan ---------- */
  const plates = {}, floors = [], origs = [], loader = new T.TextureLoader();
  for (const [key, P] of Object.entries(D.plates)) {
    const g = new T.Group(); scene.add(g); plates[key] = g;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const pic of P.pics) {
      const tex = loader.load(window.MF_PLANS[pic.file]); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }), m = new T.Mesh(new T.PlaneGeometry(pic.w, pic.h), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(pic.x + pic.w / 2 - CX, .3, pic.y + pic.h / 2 - CY); g.add(m); origs.push(m);
      minX = Math.min(minX, pic.x); minY = Math.min(minY, pic.y); maxX = Math.max(maxX, pic.x + pic.w); maxY = Math.max(maxY, pic.y + pic.h);
    }
    const w = maxX - minX, h = maxY - minY; P.box = [minX, minY, w, h];
    const slab = new T.Mesh(new T.BoxGeometry(w + 8, 6, h + 8), new T.MeshStandardMaterial({ color: 0x18233a, roughness: .7 })); slab.position.set(minX + w / 2 - CX, -3.2, minY + h / 2 - CY); slab.receiveShadow = true; g.add(slab);
    const art = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ color: 0xc9ced6, roughness: .78, metalness: 0 })); art.rotation.x = -Math.PI / 2; art.position.set(minX + w / 2 - CX, .12, minY + h / 2 - CY); art.receiveShadow = true; g.add(art); floors.push({ art, key, box: P.box }); P.art = art;
  }
  const REP = window.MFReplica.build({ T, plates, R: RP, CX, CY }), Mpt = REP.M;
  const planTex = {};
  function setArt(dark) { for (const f of floors) { const k = f.key + dark; if (!planTex[k]) { const t = new T.CanvasTexture(window.MFReplica.drawPlan(RP, f.key, f.box, dark)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); planTex[k] = t; } f.art.material.map = planTex[k]; f.art.material.needsUpdate = true; } }
  // the deck that carries E2-2F out to To LCM, and solid destination blocks (schematic)
  const deck = new T.Group(); plates["E2-2F"].add(deck);
  for (const f of D.flows) for (const s of f.steps) if (s.title === "To LCM") for (let i = 1; i < s.path.length; i++) { const a = s.path[i - 1], b = s.path[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 9; if (a[0] > 726 && b[0] > 726) continue; const m = new T.Mesh(new T.BoxGeometry(len, 3, 9), new T.MeshStandardMaterial({ color: 0x41506e, roughness: .6, metalness: .3 })); m.position.set((a[0] + b[0]) / 2 - CX, -1.5, (a[1] + b[1]) / 2 - CY); m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); m.castShadow = true; deck.add(m); }
  const gates = Object.values(D.nodes).filter((n) => n.kind === "dest" && n.text !== "Elev 5 2F").map((n) => { const m = new T.Mesh(new T.BoxGeometry(24, 16, 24), new T.MeshStandardMaterial({ color: 0x156082, roughness: .4, metalness: .2 })); m.castShadow = true; m.userData.n = n; scene.add(m); return m; });
  const E = D.elevator, shaft = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(30, 1, 30)), new T.LineBasicMaterial({ color: 0xffc000 })); scene.add(shaft);
  const cabin = new T.Mesh(new T.BoxGeometry(17, 2.5, 17), new T.MeshStandardMaterial({ color: 0xffc000, metalness: .4, roughness: .4 })); cabin.castShadow = true; scene.add(cabin);
  const lot = new T.Group();
  { const wood = new T.Mesh(new T.BoxGeometry(14, 2, 11), new T.MeshStandardMaterial({ color: 0x9c7443 })); wood.position.y = 1; lot.add(wood);
    const load = new T.Mesh(new T.BoxGeometry(12, 8, 9.5), new T.MeshStandardMaterial({ color: 0x00b0f0, roughness: .35, emissive: 0x0078b0, emissiveIntensity: .55 })); load.position.y = 6; lot.add(load); lot.traverse((o) => (o.castShadow = true)); }
  scene.add(lot);
  const beacon = new T.Mesh(new T.RingGeometry(9, 11, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: new T.Color(0x8fdcff).multiplyScalar(3), toneMapped: false, transparent: true, side: T.DoubleSide })); scene.add(beacon);
  // atmosphere: Digital Factory's light shafts and dust
  const lamps = []; for (let x = 60; x < 520; x += 70) for (let y = 190; y < 480; y += 62) lamps.push([x - CX, 46, y - CY]);
  const atmos = window.DFAtmos ? window.DFAtmos.create(T, scene, { lamps, shafts: { height: 46, top: 1.4, bottom: 13, intensity: .05 }, dust: { count: 900, box: [620, 70, 620], size: .16, alpha: .3 } }) : null;

  /* ---------- post-processing, with a quality that holds the frame rate ---------- */
  let composer = null, gtao = null, bloom = null;
  function buildPost() {
    if (composer) { composer.dispose?.(); composer = gtao = bloom = null; }
    if (S.quality === "low") return;
    const size = renderer.getDrawingBufferSize(new T.Vector2()), rt = new T.WebGLRenderTarget(size.x, size.y, { type: T.HalfFloatType, samples: 4 });
    composer = new T.EffectComposer(renderer, rt); composer.addPass(new T.RenderPass(scene, camera));
    if (S.quality === "high") { gtao = new T.GTAOPass(scene, camera, size.x, size.y); gtao.updateGtaoMaterial({ radius: 7, distanceExponent: 1.4, thickness: 3, scale: 1.2, samples: 12 }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 }); gtao.blendIntensity = .9; composer.addPass(gtao); }
    bloom = new T.UnrealBloomPass(size, .32, .5, 2.2); composer.addPass(bloom); composer.addPass(new T.OutputPass());
  }
  function setQuality(q) { S.quality = q; $("quality").value = q; buildPost(); }

  /* ---------- looks ---------- */
  const LOOK = { studio: { bg: 0x0b1220, hemi: 1, sun: 2.4, exp: 1, dark: false, env: .55, air: false }, night: { bg: 0x05080f, hemi: .22, sun: .35, exp: 1.25, dark: true, env: .22, air: true }, blueprint: { bg: 0x071630, hemi: 1.2, sun: 0, exp: 1, dark: true, env: .1, air: false } };
  function setLook(k) {
    const L = LOOK[k]; S.look = k; $("look").value = k; scene.background = new T.Color(L.bg); scene.fog = new T.Fog(L.bg, 1400, 3200); hemi.intensity = L.hemi; sun.intensity = L.sun; renderer.toneMappingExposure = L.exp; scene.environmentIntensity = L.env; setArt(L.dark); atmos?.set(L.air); atmos?.theme(L.dark);
    for (const { im } of REP.meshes) im.material.wireframe = k === "blueprint"; shadowDirty = true;
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
      const move = !path ? .6 : s.lift ? 3.2 : clamp(pl(path) / SPEED, 1.6, 4.5), metres = path && !s.lift ? pl(path) * PT_M : 0; total += metres;
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
      Object.assign(want, { x: p.x, y: p.y, z: p.z, dist: flat() ? d * 1.5 : d, pol: flat() ? .001 : .98 - (cur.i % 2) * .14, az: flat() ? 0 : -.55 + ((cur.i % 3) - 1) * .38 + Math.sin(time * .15) * .04 });
    } else if (S.cam === "forklift") {
      const m = REP.movers[0], p = m.v.getWorldPosition(new T.Vector3());
      Object.assign(want, { x: p.x, y: p.y + 12, z: p.z, dist: 92, pol: 1.28, az: m.heading + Math.PI });
    } else if (S.cam === "chase") {
      const p = lotWorld(S.t), q = lotWorld(Math.min(F().total, S.t + .3)), dir = Math.atan2(q.x - p.x, q.z - p.z);
      Object.assign(want, { x: p.x, y: p.y + 8, z: p.z, dist: 120, pol: 1.3, az: q.distanceTo(p) > .05 ? dir + Math.PI : S.c.az });
    } else { const r = PRESET[S.cam](), p = r.p.isVector3 ? r.p : new T.Vector3(...r.p); Object.assign(want, { x: p.x, y: p.y, z: p.z, dist: r.d, az: flat() ? 0 : r.az, pol: flat() ? .001 : r.pol }); }
  }
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function moveCam(dt) {
    const k = 1 - Math.exp(-dt * (S.cam === "chase" ? 6 : stepAt(S.t).s.intro ? 9 : S.cam === "forklift" ? 5 : 2.6)), c = S.c;
    if (S.cam !== "free") { for (const n of ["x", "y", "z", "dist", "pol"]) c[n] = lerp(c[n], want[n], k); c.az += wrap(want.az - c.az) * k; }
    const sp = Math.sin(c.pol); camera.position.set(c.x + c.dist * sp * Math.sin(c.az), c.y + c.dist * Math.cos(c.pol), c.z + c.dist * sp * Math.cos(c.az)); camera.up.set(0, 1, 0); camera.lookAt(c.x, c.y, c.z);
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
  for (const n of Object.values(D.nodes)) { const el = document.createElement("div"); el.className = "chip"; el.style.setProperty("--c", n.fill); el.innerHTML = `<span class="mk ${n.kind}"></span><span class="tx"></span>`; el.onclick = (e) => { e.stopPropagation(); pickNode(n); }; labels.append(el); chips[n.id] = el; }
  const floorTags = Object.entries(D.plates).map(([k, P]) => { const e = document.createElement("div"); e.className = "floor"; e.textContent = P.label; labels.append(e); return { e, P }; });
  function placeLabels() {
    const f = F(), cur = stepAt(S.t), use = {};
    f.items.forEach((it) => { if (!it.s.intro && (!use[it.s.node] || it.i <= cur.i)) use[it.s.node] = it; });
    for (const n of Object.values(D.nodes)) {
      const el = chips[n.id], it = use[n.id], [x, y, z] = proj(W(n.x, n.y, S.stack, 3 + S.R * 16));
      el.style.display = z > 1 || (!it && !S.net) ? "none" : "flex"; el.style.transform = `translate(${x - 9}px,${y - 9}px)`;
      el.className = "chip" + (it ? "" : " dim") + (it && S.labels ? " on" : "") + (it && it.i === cur.i ? " now" : it && it.i < cur.i ? " done" : "");
      if (it) el.querySelector(".tx").textContent = `${it.i}  ${it.s.title}`;
    }
    for (const { e, P } of floorTags) { const b = P.box, [x, y] = proj(W(b[0] + 2, b[1] + 2)); e.style.display = S.labels ? "block" : "none"; e.style.transform = `translate(${x}px,${y - 12}px)`; }
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
    lot.children[1].material.color.set(f.color);
  }
  let shown = -1;
  function renderStep() {
    const f = F(), cur = stepAt(S.t);
    fill.style.width = hd.style.left = (S.t / f.total * 100) + "%"; $("time").textContent = `${fmt(S.t)} / ${fmt(f.total)}  step ${cur.i}/${f.items.length - 1}`;
    $("play").innerHTML = S.playing ? "&#10074;&#10074;" : "&#9654;";
    if (shown !== cur.i) {
      shown = cur.i;
      $("list").querySelectorAll("li").forEach((l, i) => { l.className = i === cur.i ? "now" : i < cur.i ? "done" : ""; if (i === cur.i) l.scrollIntoView({ block: "nearest" }); });
      const stat = cur.s.intro ? "" : `<div class="st"><span>${cur.metres ? cur.metres.toFixed(0) + " m this step" : cur.s.lift ? "Between floors" : "At this point"}</span><span>${(cur.run || 0).toFixed(0)} m so far</span></div>`;
      $("card").innerHTML = `<b>${cur.s.intro ? "" : cur.i + ". "}${cur.s.title}</b><p>${cur.s.what}</p>${cur.s.intro ? "" : `<span class="m ${cur.s.mode}">${cur.s.mode === "auto" ? "Auto" : cur.s.lift ? "Elevator" : "Step"}</span>`}${stat}`;
    }
  }
  function seek(t) { S.t = clamp(t, 0, F().total); }
  function play() { if (S.t >= F().total) seek(0); S.playing = true; }
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
  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; frame.shift = -1; camera.updateProjectionMatrix(); const d = Math.min(devicePixelRatio, 1.5); fx.width = innerWidth * d; fx.height = innerHeight * d; g2.setTransform(d, 0, 0, d, 0, 0); buildPost(); }
  addEventListener("resize", resize);
  let last = performance.now(), slow = 0, lastR = -1, lastStack = -1;
  function tick(now) { const raw = (now - last) / 1000, dt = Math.min(.1, raw); last = now; frame(dt, now / 1000);
    // hold the frame rate: step quality down when frames stay slow (never in a test that pinned ?q=)
    if (!query.get("q")) { slow = raw > .045 ? slow + raw : Math.max(0, slow - raw); if (slow > 2.5) { slow = 0; if (S.quality === "high") setQuality("medium"); else if (S.quality === "medium") setQuality("low"); } }
    requestAnimationFrame(tick); }
  function frame(dt, time) {
    if (S.playing) { const c = stepAt(S.t); let t = S.t + dt * S.speed; if (S.stepStop && S.t < c.tm && t >= c.tm) { t = c.tm; pause(); } S.t = Math.min(t, F().total); if (S.t >= F().total) pause(); }
    const cur = stepAt(S.t), intro = cur.s.intro && S.view === "auto";
    const goalR = S.view === "2d" ? 0 : intro ? clamp((S.t - 1.6) / (INTRO - 2.4), 0, 1) : 1;
    S.R = intro ? goalR : S.R + clamp(goalR - S.R, -dt * .7, dt * .7);
    if (Math.abs(S.R - lastR) > 1e-4) { REP.rise(S.R); lastR = S.R; shadowDirty = true; }
    const goal = S.stackUser != null ? S.stackUser : S.view === "2d" ? 0 : S.view === "3d" ? 1 : cur.s.view === "3d" ? 1 : 0;
    S.stack = lerp(S.stack, goal, 1 - Math.exp(-dt * 3)); if (Math.abs(S.stack - goal) < .001) S.stack = goal;
    if (S.stackUser == null) $("stack").value = Math.round(S.stack * 100);
    if (Math.abs(S.stack - lastStack) > 1e-4) { lastStack = S.stack; shadowDirty = true; }
    for (const [k, g] of Object.entries(plates)) { const P = D.plates[k]; g.position.set(S.stack * P.dx, S.stack * P.lift * GAP, S.stack * P.dz); }
    deck.visible = S.stack > .3;
    const oo = S.plan === "original" ? 1 : intro ? 1 - clamp((S.t - .7) / 1.2, 0, 1) : 0;
    for (const m of origs) { m.material.opacity = oo; m.visible = oo > .01; }
    for (const m of gates) { const n = m.userData.n; m.position.copy(W(n.x, n.y, S.stack, 8)); m.scale.y = Math.max(.001, S.R); m.visible = S.R > .05 && S.stack > .05; }
    const lo = W(E.low[0], E.low[1]), hi = W(E.high[0], E.high[1]);
    shaft.visible = cabin.visible = S.stack > .1; shaft.position.copy(lo.clone().lerp(hi, .5)); shaft.scale.y = Math.max(1, hi.y - lo.y + 18);
    const lp = lotPos(S.t), at = lotWorld(S.t), ahead = lotWorld(Math.min(F().total, S.t + .15)), li = F().items.findIndex((x) => x.s.lift);
    lot.position.copy(at).setY(at.y + S.R * 3); lot.visible = !cur.s.intro; if (ahead.distanceTo(at) > .02 && Math.abs(ahead.y - at.y) < .01) lot.rotation.y = Math.atan2(ahead.x - at.x, ahead.z - at.z);
    cabin.position.copy(lp.lift != null ? at : lo).setY((lp.lift != null ? at.y : (li >= 0 && cur.i > li ? hi.y : lo.y)) - 2);
    beacon.visible = !cur.s.intro; beacon.position.copy(at).setY(at.y + 1.2); const pulse = (time * .8) % 1; beacon.scale.setScalar(.7 + pulse * 1.4); beacon.material.opacity = 1 - pulse;
    // focus: the plan with the lot stays bright, the others step back (colours stay, brightness falls)
    const here = lp.lift != null ? "E2" : plateOf(lp.x, lp.y);
    for (const fl of floors) { const on = !S.focus || cur.s.intro || S.R < .9 || S.cam === "overview" || fl.key === here || (here === "E2" && fl.key !== "E1"); fl.k = lerp(fl.k ?? 1, on ? 1 : .42, 1 - Math.exp(-dt * 6)); REP.dim(fl.key, fl.k); fl.art.material.color.setRGB(.79 * fl.k, .81 * fl.k, .84 * fl.k); }
    cue(cur);
    REP.live(time, S.R, dt); atmos?.update(time, camera, innerHeight * 1.2);
    setWant(time); moveCam(dt);
    const shift = S.panel && !document.body.classList.contains("bare") ? 150 : 0;
    if (shift !== frame.shift) { frame.shift = shift; camera.setViewOffset(innerWidth, innerHeight, shift, 0, innerWidth, innerHeight); }
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    if (composer) composer.render(dt); else renderer.render(scene, camera);
    draw(time); placeLabels(); renderStep(); drawMini();
  }
  renderFlow(); resize(); setLook("studio"); $("quality").value = S.quality; S.c.dist = want.dist = fit(); setCam("guided");
  window.MF = { S, D, REP, W, proj, seek, play, pause, stepBy, setFlow, setView, setCam, setLook, setPlan, setMeasure, setQuality, stepAt, frame, want };   // used by the tests
  requestAnimationFrame(tick);
})();
