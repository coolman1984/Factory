/* Material Flow Player: one scene, full control. Everything on screen is a function of (flow, time, view, camera):
   the timeline can jump anywhere, and the viewer can leave the guided camera at any moment and keep playing.
   Slide coordinates (960 x 540) are kept all the way: the plans, symbols and paths stay where the deck has them,
   and each plan is a plate that can move and rise (stack 0 = the slide layout, 1 = floors stacked in 3D). */
"use strict";
(function () {
  const D = window.MF_DATA, T = window.THREE, $ = (id) => document.getElementById(id);
  if (!T) { fail("The 3D library did not load."); return; }
  function fail(m) { const e = $("err"); e.style.display = "grid"; e.textContent = m; }
  const CX = 480, CY = 290, GAP = 120, DWELL = 1.6, SPEED = 95;
  const plateOf = (x, y) => (x < 553 ? "E1" : y >= 303 ? "E2-1F" : "E2-2F");
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);

  /* ---------- state ---------- */
  const S = { flow: 0, t: 0, playing: false, speed: 1, view: "auto", cam: "guided", stack: 0, stackUser: null, labels: true, net: true, panel: true, stepStop: false, holdUntil: -1,
    c: { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: 0.001 } };   // the live camera (target, distance, angles)
  const want = { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: 0.001 };

  /* ---------- world ---------- */
  function W(x, y, s = S.stack, up = 0.8) {
    const P = D.plates[plateOf(x, y)];
    return new T.Vector3(x - CX + s * P.dx, s * P.lift * GAP + up, y - CY + s * P.dz);
  }
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas: $("gl"), antialias: true }); } catch (e) { fail("This browser could not start 3D (WebGL)."); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new T.Scene(); scene.background = new T.Color(0x0b1220);
  const camera = new T.PerspectiveCamera(28, 1, 5, 6000);
  scene.add(new T.HemisphereLight(0xffffff, 0x334466, 2.2));
  const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(-300, 600, 300); scene.add(sun);
  const grid = new T.GridHelper(1600, 40, 0x24324d, 0x18233a); grid.position.y = -2; scene.add(grid);

  const plates = {};
  const loader = new T.TextureLoader();
  for (const [key, P] of Object.entries(D.plates)) {
    const g = new T.Group(); scene.add(g); plates[key] = g;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const pic of P.pics) {
      const tex = loader.load(window.MF_PLANS[pic.file]); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const m = new T.Mesh(new T.PlaneGeometry(pic.w, pic.h), new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.set(pic.x + pic.w / 2 - CX, 0, pic.y + pic.h / 2 - CY); g.add(m);
      minX = Math.min(minX, pic.x); minY = Math.min(minY, pic.y); maxX = Math.max(maxX, pic.x + pic.w); maxY = Math.max(maxY, pic.y + pic.h);
    }
    // the slab under the plan and a low wall around it give the plate its body in 3D
    const w = maxX - minX, h = maxY - minY, slab = new T.Mesh(new T.BoxGeometry(w + 6, 5, h + 6), new T.MeshStandardMaterial({ color: 0x1c2740, roughness: .8 }));
    slab.position.set(minX + w / 2 - CX, -3, minY + h / 2 - CY); g.add(slab);
    const edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, 14, h)), new T.LineBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: .55 }));
    edge.position.set(minX + w / 2 - CX, 7, minY + h / 2 - CY); edge.userData.wall = true; g.add(edge);
    P.box = [minX, minY, w, h];
  }
  // racks at the WIP areas, seen only in 3D (schematic)
  function rack() {
    const g = new T.Group(), steel = new T.MeshStandardMaterial({ color: 0xe07b1a, metalness: .3, roughness: .5 }), beam = new T.MeshStandardMaterial({ color: 0x2f6fd0 }), box = new T.MeshStandardMaterial({ color: 0xc9a26b });
    for (const x of [-14, 0, 14]) for (const z of [-5, 5]) { const u = new T.Mesh(new T.BoxGeometry(1, 26, 1), steel); u.position.set(x, 13, z); g.add(u); }
    for (const y of [8, 16, 24]) for (const z of [-5, 5]) { const b = new T.Mesh(new T.BoxGeometry(29, 1, 1), beam); b.position.set(0, y, z); g.add(b); }
    for (const y of [9.5, 17.5]) for (const x of [-7, 7]) { const c = new T.Mesh(new T.BoxGeometry(9, 5, 8), box); c.position.set(x, y + 2, 0); g.add(c); }
    return g;
  }
  const racks = Object.values(D.nodes).filter((n) => n.kind === "wip").map((n) => { const r = rack(); r.userData.n = n; scene.add(r); return r; });
  // the destinations are solid blocks; the E2-2F plate carries a deck out to To LCM, as the slide routes it (schematic)
  const deck = new T.Mesh(new T.BoxGeometry(166, 4, 116), new T.MeshStandardMaterial({ color: 0x2b3a5c, roughness: .7 })); deck.position.set(642 - CX, -2.5, 246 - CY); deck.userData.wall = true; plates["E2-2F"].add(deck);
  const gates = Object.values(D.nodes).filter((n) => n.kind === "dest" && n.text !== "Elev 5 2F").map((n) => { const m = new T.Mesh(new T.BoxGeometry(44, 26, 44), new T.MeshStandardMaterial({ color: 0x156082, roughness: .5 })); m.userData.n = n; scene.add(m); return m; });
  // elevator: a shaft and a cabin
  const E = D.elevator, shaft = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(30, 1, 30)), new T.LineBasicMaterial({ color: 0xffc000 })); scene.add(shaft);
  const cabin = new T.Mesh(new T.BoxGeometry(26, 4, 26), new T.MeshStandardMaterial({ color: 0xffc000, metalness: .4, roughness: .4 })); scene.add(cabin);
  // the lot: a pallet with cartons
  const lot = new T.Group();
  { const wood = new T.Mesh(new T.BoxGeometry(18, 2.4, 14), new T.MeshStandardMaterial({ color: 0x9c7443 })); wood.position.y = 1.2; lot.add(wood);
    const load = new T.Mesh(new T.BoxGeometry(16, 9, 12), new T.MeshStandardMaterial({ color: 0x00b0f0, roughness: .45 })); load.position.y = 7; lot.add(load); }
  scene.add(lot);

  /* ---------- flows: paths and the timeline ---------- */
  const pl = (p) => { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return d; };
  function buildFlow(f) {
    let t = 0; f.items = [];
    f.steps.forEach((s, i) => {
      let path = s.path;
      if (path === "lift") path = [E.low, E.high];
      if (path === "fromLift") path = [E.high, [D.nodes[s.node].x, E.high[1]], [D.nodes[s.node].x, D.nodes[s.node].y]];
      const move = !path ? 0 : s.lift ? 3.2 : clamp(pl(path) / SPEED, 1.6, 4.5);
      f.items.push({ s, i, path, t0: t, tm: t + move, t1: t + move + DWELL }); t += move + DWELL;
    });
    f.total = t;
  }
  D.flows.forEach(buildFlow);
  const F = () => D.flows[S.flow];
  const stepAt = (t) => { const f = F(); return f.items.find((it) => t < it.t1) || f.items[f.items.length - 1]; };
  function along(path, u) {   // a point at fraction u of a slide-space path
    const L = pl(path); let d = u * L;
    for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= l || i === path.length - 1) { const k = l ? clamp(d / l, 0, 1) : 0; return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), i }; } d -= l; }
    return { x: path[0][0], y: path[0][1], i: 1 };
  }
  function lotPos(t) {   // where the lot is: slide point, or the lift fraction
    const it = stepAt(t), n = D.nodes[it.s.node];
    if (!it.path) return { x: n.x, y: n.y, it, u: 1 };
    const u = ease(clamp((t - it.t0) / Math.max(.001, it.tm - it.t0), 0, 1));
    if (it.s.lift) return { lift: u, it, u };
    const p = along(it.path, u); return { ...p, it, u };
  }
  function lotWorld(t, s = S.stack) {
    const p = lotPos(t);
    if (p.lift == null) return W(p.x, p.y, s);
    const a = W(E.low[0], E.low[1], s), b = W(E.high[0], E.high[1], s); return a.lerp(b, p.lift);
  }

  /* ---------- camera ---------- */
  const fit = () => { const a = camera.aspect, f = Math.tan((camera.fov * Math.PI) / 360); return Math.max(330 / f, 560 / (f * a)); };
  function viewNow() { if (S.view !== "auto") return S.view; return stepAt(S.t).s.view; }
  const PRESET = { overview: () => ({ p: [0, 0, 0], d: fit() * 1.05, az: -.55, pol: 1 }), iso: () => ({ p: [0, 30, 0], d: fit() * 1.15, az: -.785, pol: .96 }),
    e1: () => ({ p: W(285, 330), d: 560 }), e21: () => ({ p: W(730, 373), d: 460 }), e22: () => ({ p: W(835, 223), d: 340 }), elev: () => ({ p: W(E.low[0], E.low[1], S.stack).add(new T.Vector3(0, S.stack * GAP / 2, 0)), d: 300, az: -.9, pol: 1.15 }) };
  function setWant() {
    const three = S.stack > .5 || viewNow() === "3d", pol = viewNow() === "3d" ? 1 : .001, az = viewNow() === "3d" ? -.55 : 0;
    if (S.cam === "free") return;
    if (S.cam === "guided" || S.cam === "follow") {
      const cur = stepAt(S.t), opening = S.cam === "guided" && cur.i === 0 && S.t < cur.tm + .9;
      if (opening) Object.assign(want, { x: 0, y: 0, z: 0, dist: fit(), pol, az: 0 });
      else { const p = lotWorld(S.t, S.stack), d = S.cam === "follow" ? (S.stack > .5 ? 300 : 460) : cur.s.dist * (S.stack > .5 ? 1.35 : 2.6); Object.assign(want, { x: p.x, y: p.y, z: p.z, dist: d, pol, az: three ? az : 0 }); }
    } else if (S.cam === "chase") {
      const p = lotWorld(S.t, S.stack), q = lotWorld(Math.min(F().total, S.t + .3), S.stack), dir = Math.atan2(q.x - p.x, q.z - p.z);
      Object.assign(want, { x: p.x, y: p.y + 8, z: p.z, dist: 110, pol: 1.28, az: (q.distanceTo(p) > .05 ? dir + Math.PI : S.c.az) });
    } else {
      const r = PRESET[S.cam](), p = r.p.isVector3 ? r.p : new T.Vector3(...r.p);
      Object.assign(want, { x: p.x, y: p.y, z: p.z, dist: r.d, az: r.az ?? az, pol: r.pol ?? pol });
    }
  }
  function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  function moveCam(dt) {
    const k = 1 - Math.exp(-dt * (S.cam === "chase" ? 6 : 3.6)), c = S.c;
    if (S.cam !== "free") {
      for (const n of ["x", "y", "z", "dist", "pol"]) c[n] = lerp(c[n], want[n], k);
      c.az += wrap(want.az - c.az) * k;
    }
    const sp = Math.sin(c.pol);
    camera.position.set(c.x + c.dist * sp * Math.sin(c.az), c.y + c.dist * Math.cos(c.pol), c.z + c.dist * sp * Math.cos(c.az));
    camera.up.set(0, 1, 0); camera.lookAt(c.x, c.y, c.z);
  }

  /* ---------- 2D overlay: flow lines (always crisp), labels ---------- */
  const fx = $("fx"), g2 = fx.getContext("2d");
  function proj(v) { const p = v.clone().project(camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight, p.z]; }
  function poly(path, s = S.stack) { return path.map((p) => proj(W(p[0], p[1]))); }
  function stroke(pts, color, w, dash, off) { if (pts.length < 2) return; g2.beginPath(); g2.setLineDash(dash || []); g2.lineDashOffset = off || 0; g2.strokeStyle = color; g2.lineWidth = w; g2.lineJoin = "round"; g2.lineCap = "round"; pts.forEach((p, i) => (i ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1]))); g2.stroke(); g2.setLineDash([]); }
  function arrow(a, b, color, size) { const r = Math.atan2(b[1] - a[1], b[0] - a[0]); g2.fillStyle = color; g2.beginPath(); g2.moveTo(b[0], b[1]); g2.lineTo(b[0] - size * Math.cos(r - .45), b[1] - size * Math.sin(r - .45)); g2.lineTo(b[0] - size * Math.cos(r + .45), b[1] - size * Math.sin(r + .45)); g2.fill(); }
  const MODE = { auto: "#ffc000", manual: "#ff5a4f", flow: "#35c6ff" };
  function draw(time) {
    g2.clearRect(0, 0, innerWidth, innerHeight);
    if (S.net) for (const c of Object.values(D.conns)) { const p = poly(c.pts); stroke(p, c.color === "#3B7D23" ? "#3fae5acc" : "#5b8fb9cc", 1.4); }
    const f = F(), cur = stepAt(S.t);
    for (const it of f.items) {
      if (!it.path) continue;
      const p = poly(it.path), col = MODE[it.s.mode], z = it.i < cur.i ? 1 : it.i > cur.i ? 0 : -1;
      if (z === 0) stroke(p, col + "59", 3);
      else if (z === 1) { stroke(p, col, 4); arrow(p[p.length - 2], p[p.length - 1], col, 12); }
      else {
        stroke(p, col + "59", 3);
        const u = clamp(lotPos(S.t).u, 0, 1), m = along(it.path, u), head = [...it.path.slice(0, m.i), [m.x, m.y]];
        if (it.s.lift) { const a = proj(W(E.low[0], E.low[1])), b = proj(lotWorld(S.t)); stroke([a, b], col, 5); }
        else { const h = poly(head); stroke(h, col + "55", 11); stroke(h, col, 4.5); if (it.s.mode === "auto") stroke(h, "#ffffffcc", 2, [8, 14], -time * 60); }
      }
    }
  }
  // chips: one per symbol
  const chips = {};
  const labels = $("labels");
  for (const n of Object.values(D.nodes)) {
    const el = document.createElement("div"); el.className = "chip"; el.style.setProperty("--c", n.fill);
    el.innerHTML = `<span class="mk ${n.kind}"></span><span class="tx"></span>`;
    el.onclick = (e) => { e.stopPropagation(); pickNode(n); }; labels.append(el); chips[n.id] = el;
  }
  const floorTags = Object.entries(D.plates).map(([k, P]) => { const e = document.createElement("div"); e.className = "floor"; e.textContent = P.label; labels.append(e); return { e, P }; });
  function placeLabels() {
    const f = F(), cur = stepAt(S.t), use = {};
    f.items.forEach((it) => { if (!use[it.s.node] || it.i <= cur.i) use[it.s.node] = it; });
    for (const n of Object.values(D.nodes)) {
      const el = chips[n.id], it = use[n.id], [x, y, z] = proj(W(n.x, n.y, S.stack, 3));
      el.style.display = z > 1 || (!it && !S.net) ? "none" : "flex"; el.style.transform = `translate(${x - 9}px,${y - 9}px)`;
      el.className = "chip" + (it ? "" : " dim") + (it && S.labels ? " on" : "") + (it && it.i === cur.i ? " now" : it && it.i < cur.i ? " done" : "");
      if (it) el.querySelector(".tx").textContent = `${it.i + 1}  ${it.s.title}`;
    }
    for (const { e, P } of floorTags) { const b = P.box, [x, y] = proj(W(b[0] + 2, b[1] + 2)); e.style.display = S.labels ? "block" : "none"; e.style.transform = `translate(${x}px,${y - 12}px)`; }
  }
  function pickNode(n) {
    const it = F().items.find((i) => i.s.node === n.id);
    if (it) { seek(it.tm); pause(); } else tip(`${n.text || D.nodes[n.id].kind}: not in this flow`);
  }

  /* ---------- player UI ---------- */
  const scrub = $("scrub"), fill = scrub.querySelector(".fl"), hd = scrub.querySelector(".hd");
  function fmt(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; }
  function renderFlow() {
    $("title").textContent = D.slide.title;
    $("flows").innerHTML = D.flows.map((f, i) => `<button data-f="${i}" class="${i === S.flow ? "on" : ""}">${f.name}</button>`).join("");
    $("flows").querySelectorAll("button").forEach((b) => (b.onclick = () => setFlow(+b.dataset.f)));
    const f = F(); scrub.querySelectorAll("i").forEach((e) => e.remove());
    f.items.forEach((it) => { const m = document.createElement("i"); m.style.left = (it.tm / f.total * 100) + "%"; scrub.append(m); });
    $("list").innerHTML = f.items.map((it) => `<li data-i="${it.i}"><span class="n">${it.i + 1}</span><span><b>${it.s.title}</b><small>${it.s.what}</small></span></li>`).join("");
    $("list").querySelectorAll("li").forEach((l) => (l.onclick = () => { const it = f.items[+l.dataset.i]; seek(it.tm); pause(); }));
    lot.children[1].material.color.set(f.color);
  }
  let shown = -1;
  function renderStep() {
    const f = F(), cur = stepAt(S.t);
    fill.style.width = hd.style.left = (S.t / f.total * 100) + "%"; $("time").textContent = `${fmt(S.t)} / ${fmt(f.total)}  step ${cur.i + 1}/${f.items.length}`;
    $("play").innerHTML = S.playing ? "&#10074;&#10074;" : "&#9654;";
    if (shown !== cur.i) {
      shown = cur.i;
      $("list").querySelectorAll("li").forEach((l, i) => { l.className = i === cur.i ? "now" : i < cur.i ? "done" : ""; if (i === cur.i) l.scrollIntoView({ block: "nearest" }); });
      $("card").innerHTML = `<b>${cur.i + 1}. ${cur.s.title}</b><p>${cur.s.what}</p><span class="m ${cur.s.mode}">${cur.s.mode === "auto" ? "Auto" : cur.s.lift ? "Elevator" : "Step"}</span>`;
    }
  }
  function seek(t) { S.t = clamp(t, 0, F().total); S.holdUntil = -1; }
  function play() { if (S.t >= F().total) seek(0); S.playing = true; }
  function pause() { S.playing = false; }
  function stepBy(d) { const f = F(), c = stepAt(S.t); const atEnd = S.t >= c.tm - .01; const i = clamp(c.i + (d > 0 ? (atEnd ? 1 : 0) : (S.t > c.t0 + 1 && !atEnd ? 0 : -1)), 0, f.items.length - 1); seek(f.items[i].tm); pause(); }
  function setFlow(i) { S.flow = i; shown = -1; seek(0); pause(); renderFlow(); }
  function setView(v) { S.view = v; S.stackUser = null; $("views").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v)); if (S.cam === "free") setCam("guided"); }
  function setCam(c) { S.cam = c; $("cam").value = c; $("cam").querySelector('[value="free"]').hidden = c !== "free"; }
  function tip(m) { const e = $("tip"); e.textContent = m; e.style.display = "block"; clearTimeout(tip.t); tip.t = setTimeout(() => (e.style.display = "none"), 1800); }
  function toFree() { if (S.cam !== "free") { setCam("free"); tip("Free camera: press G to go back to the guided camera"); } }
  $("play").onclick = () => (S.playing ? pause() : play()); $("prev").onclick = () => stepBy(-1); $("next").onclick = () => stepBy(1); $("first").onclick = () => { seek(0); pause(); };
  $("speed").onchange = (e) => (S.speed = +e.target.value); $("stepstop").onchange = (e) => (S.stepStop = e.target.checked);
  $("views").querySelectorAll("button").forEach((b) => (b.onclick = () => setView(b.dataset.v)));
  $("cam").onchange = (e) => setCam(e.target.value);
  $("stack").oninput = (e) => (S.stackUser = e.target.value / 100);
  const tog = (id, k, fn) => { const f = () => { S[k] = !S[k]; $(id).classList.toggle("on", S[k]); fn && fn(); }; $(id).onclick = f; return f; };
  const tLbl = tog("lblBtn", "labels"), tNet = tog("netBtn", "net"), tPanel = tog("panelBtn", "panel", () => ($("steps").style.display = S.panel ? "" : "none"));
  $("zi").onclick = () => zoom(.8); $("zo").onclick = () => zoom(1.25);
  const toggleHelp = () => { const h = $("help"); h.style.display = h.style.display === "block" ? "none" : "block"; }; $("helpBtn").onclick = toggleHelp;
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()); $("full").onclick = fullscreen;
  function zoom(k) { toFree(); S.c.dist = clamp(S.c.dist * k, 40, 4000); }
  const scrubTo = (e) => { const r = scrub.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * F().total); };
  scrub.onpointerdown = (e) => { scrub.setPointerCapture(e.pointerId); scrubTo(e); pause(); scrub.onpointermove = scrubTo; }; scrub.onpointerup = () => (scrub.onpointermove = null);

  /* mouse: left drag turns in 3D and pans in 2D; right drag or Shift pans; wheel zooms; double-click centres */
  const st = $("stage"); let drag = null;
  st.oncontextmenu = (e) => e.preventDefault();
  st.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey || S.c.pol < .05 }; st.setPointerCapture(e.pointerId); st.classList.add("drag"); };
  st.onpointermove = (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (!dx && !dy) return; toFree();
    const c = S.c;
    if (drag.pan) {
      const k = c.dist * Math.tan((camera.fov * Math.PI) / 360) * 2 / innerHeight, r = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), f = new T.Vector3(Math.sin(c.az), 0, Math.cos(c.az));
      c.x += (-dx * r.x + -dy * f.x) * k; c.z += (-dx * r.z + -dy * f.z) * k;
    } else { c.az -= dx * .006; c.pol = clamp(c.pol - dy * .005, .001, 1.5); }
  };
  st.onpointerup = () => { drag = null; st.classList.remove("drag"); };
  st.onwheel = (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : .89); };
  st.ondblclick = (e) => {
    const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2), camera);
    const hit = ray.intersectObjects(Object.values(plates), true)[0]; if (hit) { toFree(); Object.assign(S.c, { x: hit.point.x, y: hit.point.y, z: hit.point.z, dist: S.c.dist * .7 }); }
  };
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.ctrlKey || e.altKey) return; const k = e.key.toLowerCase();
    const act = { " ": () => (S.playing ? pause() : play()), arrowright: () => stepBy(1), arrowleft: () => stepBy(-1), home: () => { seek(0); pause(); }, end: () => { seek(F().total); pause(); }, 2: () => setView("2d"), 3: () => setView("3d"), a: () => setView("auto"), g: () => setCam("guided"), l: tLbl, n: tNet, p: tPanel, f: fullscreen, h: () => document.body.classList.toggle("bare"), "?": toggleHelp, "+": () => zoom(.8), "=": () => zoom(.8), "-": () => zoom(1.25),
      c: () => { const o = [...$("cam").options].filter((x) => !x.hidden).map((x) => x.value); setCam(o[(o.indexOf(S.cam) + 1) % o.length]); } }[k];
    if (act) { e.preventDefault(); act(); }
  });

  /* mini-map: the slide's plates and where the lot is */
  const mc = $("minic").getContext("2d");
  function drawMini() {
    const k = 420 / 960; mc.clearRect(0, 0, 420, 236);
    const here = (() => { const p = lotPos(S.t); return p.lift != null ? "E2-1F" : plateOf(p.x, p.y); })();
    for (const [key, P] of Object.entries(D.plates)) { const b = P.box; mc.fillStyle = key === here ? "#1f6feb" : "#ffffff26"; mc.fillRect(b[0] * k, b[1] * k - 30, b[2] * k, b[3] * k); mc.fillStyle = "#fff"; mc.font = "bold 18px Segoe UI"; mc.fillText(P.label, b[0] * k + 6, b[1] * k - 8); }
    const p = lotPos(S.t), q = p.lift != null ? E.low : [p.x, p.y]; mc.fillStyle = "#ffc000"; mc.beginPath(); mc.arc(q[0] * k, q[1] * k - 30, 7, 0, 7); mc.fill();
  }

  /* ---------- the frame ---------- */
  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; frame.shift = -1; camera.updateProjectionMatrix(); const d = Math.min(devicePixelRatio, 2); fx.width = innerWidth * d; fx.height = innerHeight * d; g2.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener("resize", resize); resize();
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now; frame(dt, now / 1000); requestAnimationFrame(tick);
  }
  function frame(dt, time) {
    if (S.playing) {
      const c = stepAt(S.t); let t = S.t + dt * S.speed;
      if (S.stepStop && S.t < c.tm && t >= c.tm) { t = c.tm; pause(); }
      S.t = Math.min(t, F().total); if (S.t >= F().total) pause();
    }
    const goal = S.stackUser != null ? S.stackUser : viewNow() === "3d" ? 1 : 0;
    S.stack = lerp(S.stack, goal, 1 - Math.exp(-dt * 3)); if (Math.abs(S.stack - goal) < .001) S.stack = goal;
    if (S.stackUser == null) $("stack").value = Math.round(S.stack * 100);
    for (const [k, g] of Object.entries(plates)) { const P = D.plates[k]; g.position.set(S.stack * P.dx, S.stack * P.lift * GAP, S.stack * P.dz); g.traverse((o) => { if (o.userData.wall) o.visible = S.stack > .3; }); }
    for (const r of racks) { const n = r.userData.n; r.position.copy(W(n.x + 16, n.y + 14, S.stack, 0)); r.scale.setScalar(.8); r.scale.y = Math.max(.001, S.stack * .8); r.visible = S.stack > .05; }
    for (const m of gates) { const n = m.userData.n; m.position.copy(W(n.x, n.y, S.stack, 13)); m.scale.y = Math.max(.001, S.stack); m.visible = S.stack > .05; }
    const lo = W(E.low[0], E.low[1]), hi = W(E.high[0], E.high[1]);
    shaft.visible = cabin.visible = S.stack > .1; shaft.position.copy(lo.clone().lerp(hi, .5)); shaft.scale.y = Math.max(1, hi.y - lo.y + 18);
    const lp = lotPos(S.t), at = lotWorld(S.t), ahead = lotWorld(Math.min(F().total, S.t + .15));
    lot.position.copy(at); if (ahead.distanceTo(at) > .02 && Math.abs(ahead.y - at.y) < .01) lot.rotation.y = Math.atan2(ahead.x - at.x, ahead.z - at.z);
    cabin.position.copy(lp.lift != null ? at : lo).setY((lp.lift != null ? at.y : (stepAt(S.t).i > 3 && S.flow === 0 ? hi.y : lo.y)) - 2);
    setWant(); moveCam(dt);
    const shift = S.panel && !document.body.classList.contains("bare") ? 150 : 0;
    if (shift !== frame.shift) { frame.shift = shift; camera.setViewOffset(innerWidth, innerHeight, shift, 0, innerWidth, innerHeight); }
    renderer.render(scene, camera); draw(time); placeLabels(); renderStep(); drawMini();
  }
  renderFlow(); S.c.dist = want.dist = fit(); setCam("guided");
  window.MF = { S, D, seek, play, pause, stepBy, setFlow, setView, setCam, stepAt, frame, want };   // used by the tests
  requestAnimationFrame(tick);
})();
