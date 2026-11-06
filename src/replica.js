/* The replica: the factory rebuilt from the take-off (private/replica.json), in slide points (1 pt = 0.30 m).
   Everything static goes through one Kit into a few InstancedMeshes per plan, so thousands of parts cost a handful of draw
   calls, and the whole factory can rise out of the flat plan behind a sweep: rise(R) scales every instance from the floor.
   drawPlan() redraws the plan as clean vector art, so the blurry slide image is no longer the limit in 2D. */
"use strict";
window.MFReplica = (function () {
  const M = 1 / 0.3;   // slide points per metre
  function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function build({ T, plates, R, CX, CY }) {
    const G = { box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(.5, .5, 1, 14), cylx: new T.CylinderGeometry(.5, .5, 1, 14).rotateZ(Math.PI / 2), cylz: new T.CylinderGeometry(.5, .5, 1, 10).rotateX(Math.PI / 2), cone: new T.ConeGeometry(.5, 1, 14).rotateX(Math.PI) };
    /* Blender models: packed primitives, instanced per plan. place() fits a model inside its take-off rectangle, never beyond it */
    const ASSETS = window.MF_ASSETS || {}, placed = [];
    const SIZE = { injection: [13.6, 2.75], truck: [2.5, 11.8], press: [3.2, 2.0], utility: [2.4, 1.2], pallet: [1.2, 0.8] };
    function place(name, r, o = {}) {
      if (!ASSETS[name]) return false;
      const turn = !!o.turn, [mx, mz] = SIZE[name], lx = turn ? r.h : r.w, lz = turn ? r.w : r.h, sx = Math.min(lx / mx, M * (o.max || 1)), sz = Math.min(lz / mz, M * (o.max || 1));
      placed.push({ name, plate: r.plate, x: r.x + r.w / 2, z: r.y + r.h / 2, sx, sy: M * (o.h || 1), sz, rot: turn ? Math.PI / 2 : 0 }); return true;
    }
    const MAT = window.MFLook ? window.MFLook.replicaMaterials(T) : {
      paint: new T.MeshStandardMaterial({ roughness: .52, metalness: .08 }), metal: new T.MeshStandardMaterial({ roughness: .34, metalness: .82 }),
      matte: new T.MeshStandardMaterial({ roughness: .92, metalness: 0 }), glass: new T.MeshPhysicalMaterial({ transparent: true, opacity: .2, roughness: .08, metalness: 0, clearcoat: 1, depthWrite: false }),
      glow: new T.MeshBasicMaterial({ toneMapped: false }),
    };
    const buckets = new Map();
    function add(plate, geo, mat, cx, y, cz, sx, sy, sz, color, rot = 0) {
      const key = plate + "|" + geo + "|" + mat; let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { plate, geo, mat, list: [] }));
      b.list.push({ cx, y, cz, sx, sy, sz, color, rot });
    }
    const box = (p, cx, y, cz, sx, sy, sz, c, m = "paint", rot = 0) => add(p, "box", m, cx, y, cz, sx, sy, sz, c, rot);

    /* a frame along a rectangle: u runs along its length, v across; returns a placer in slide coordinates */
    function frame(r, vertical) {
      const L = vertical ? r.h : r.w, Wd = vertical ? r.w : r.h, cx = r.x + r.w / 2, cy = r.y + r.h / 2, rot = vertical ? -Math.PI / 2 : 0;
      const at = (u, v) => (vertical ? [cx + v, cy - L / 2 + u * L] : [cx - L / 2 + u * L, cy + v]);
      return { L, Wd, rot, at };
    }
    const c = { graph: 0x2b3240, blue: 0x2360c9, white: 0xe6eaf0, steel: 0x8e98a6, orange: 0xe2761b, yellow: 0xf4c20d, green: 0x27ae60, red: 0xe5484d, dark: 0x1a2030 };

    function injection(r) { place("injection", r, { turn: !!r.vertical, h: r.big || r.vertical ? 1 : .72 }); }
    function press(r) { place("press", r, { max: 1.7, h: 1.1 }); }
    function rack(r, levels, rand) {
      const p = r.plate, vertical = r.h >= r.w, L = vertical ? r.h : r.w, D = vertical ? r.w : r.h, bays = Math.max(2, Math.round(L / (2.7 * M))), bl = L / bays, lv = 1.75 * M, cx = r.x + r.w / 2, cy = r.y + r.h / 2, row = D * .92, H = levels * lv + .6 * M;
      const pos = (u, v) => (vertical ? [cx + v, cy - L / 2 + u] : [cx - L / 2 + u, cy + v]);
      const up = vertical ? [.5, H, 1.1 * M * .1] : [.5, H, .5];
      for (const side of [0]) {   // one clean row: the layout keeps real aisles around it (owner, 2026-11-06)
        const v = side;
        for (let b = 0; b <= bays; b++) for (const e of [-1, 1]) { const [x, z] = pos(b * bl, v + e * row / 2); box(p, x, H / 2, z, .55, H, .55, c.orange, "paint"); }
        for (let l = 1; l <= levels; l++) for (const e of [-1, 1]) { const [x, z] = pos(L / 2, v + e * row / 2); box(p, x, l * lv - .4, z, vertical ? .4 : L, .55, vertical ? L : .4, c.blue); }
        for (let b = 0; b < bays; b++) for (let l = 0; l < levels; l++) for (const u of [.27, .73]) {
          if (rand() < .14) continue;
          const [x, z] = pos((b + u) * bl, v), hgt = (1 + rand() * .35) * M, tone = rand(), col = tone < .62 ? 0xc9a26b : tone < .85 ? 0xd9b98a : tone < .95 ? 0x5b8fd9 : 0xf0f2f5;
          const sx = vertical ? row * .8 : bl * .4, sz = vertical ? bl * .4 : row * .8, base = l * lv + (l ? 1.1 : .5);
          box(p, x, base, z, sx, .5, sz, 0x9c7443, "matte"); box(p, x, base + .25 + hgt / 2, z, sx * .94, hgt, sz * .94, col, "matte");
        }
      }
    }
    function truck(r) { place("truck", r); }
    function utility(r) { place("utility", r, { max: 1.5 }); }
    function dock(r) { const p = r.plate, cx = r.x + r.w / 2; box(p, cx, .5, r.y + r.h / 2, r.w * .8, 1, r.h, 0x3a4356); box(p, cx - r.w * .45, 7, r.y + .4, 1, 14, 1, c.yellow); box(p, cx + r.w * .45, 7, r.y + .4, 1, 14, 1, c.yellow); box(p, cx, 13.5, r.y + .4, r.w, 1, 1, c.yellow); }

    const rand = rng(20261106);
    for (const w of R.walls) {
      const [ax, ay] = w.a, [bx, by] = w.b, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), rot = -Math.atan2(dy, dx), mx = (ax + bx) / 2, my = (ay + by) / 2, H = 3.6 * M;
      box(w.plate, mx, H / 2, my, len + 1.3, H, 1.3, 0xeef0f3, "paint", rot); box(w.plate, mx, .65 * M, my, len + 1.42, 1.3 * M, 1.42, 0x14536f, "paint", rot); box(w.plate, mx, H + .25, my, len + 1.5, .5, 1.5, 0x2f3a4e, "metal", rot);
    }
    for (const q of R.columns) { const H = (q.plate === "E2-2F" ? 7 : 8.5) * M; box(q.plate, q.p[0], H / 2, q.p[1], 1.9, H, 1.9, 0xc4cad3); box(q.plate, q.p[0], 1.6, q.p[1], 2.9, 3.2, 2.9, c.yellow); }
    for (const r of R.racks) rack(r, r.plate === "E2-2F" ? 3 : 4, rand);
    for (const m of R.machines) ({ injection, press, utility, dock, cell: press })[m.type](m);
    R.trucks.forEach(truck);
    for (const q of R.conveyors) for (let k = 1; k < q.pts.length; k++) {
      const a = q.pts[k - 1], b = q.pts[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = -Math.atan2(b[1] - a[1], b[0] - a[0]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, y = .9 * M, W = 1.1 * M;
      for (const s of [-1, 1]) box(q.plate, mx + Math.sin(rot) * s * W / 2, y + .1, my + Math.cos(rot) * s * W / 2, len, 1.1, .5, c.yellow, "paint", rot);
      for (let u = .6; u < len; u += 1.25) add(q.plate, "cylz", "metal", a[0] + (b[0] - a[0]) * u / len, y + .25, a[1] + (b[1] - a[1]) * u / len, .85, .85, W * .96, 0xb4bac2, rot);
      for (let u = 0; u <= len; u += 3 * M) for (const s of [-1, 1]) { const x = a[0] + (b[0] - a[0]) * u / len + Math.sin(rot) * s * W * .45, z = a[1] + (b[1] - a[1]) * u / len + Math.cos(rot) * s * W * .45; box(q.plate, x, y / 2, z, .4, y, .4, c.steel, "metal"); }
    }
    for (const l of R.lifts) { const cx = l.x + l.w / 2, cy = l.y + l.h / 2, H = 7 * M; box(l.plate, cx, H / 2, cy, l.w, H, l.h, 0xffe08a, "glass"); for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(l.plate, cx + i * l.w / 2, H / 2, cy + j * l.h / 2, .8, H, .8, c.yellow); }
    // painted lanes either side of every trolley route, and a pale safety strip down the middle
    for (const [a, b] of R.lanes || []) { if (plateAt(a) !== plateAt(b)) continue; const p = plateAt(a), h = a[1] === b[1], len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + 1.7 * M * 2, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; for (const s of [-1, 1]) { const off = s * 1.7 * M; box(p, h ? mx : mx + off, .34, h ? my + off : my, h ? len : .42, .08, h ? .42 : len, c.yellow, "paint"); } }
    for (const d of R.decks) box(d.plate, d.x + d.w / 2, .5, d.y + d.h / 2, d.w, 1, d.h, 0x56627a, "paint");

    function plateAt(p) { return p[0] < 553 ? "E1" : p[1] >= 303 ? "E2-1F" : "E2-2F"; }
    /* finalise: one InstancedMesh per plan, geometry and material */
    // each plan owns its materials, so one floor can stay bright while the others step back (focus)
    const owned = {}, matFor = (plate, k) => { const key = plate + k; if (!owned[key]) { owned[key] = MAT[k].clone(); owned[key].userData.dim = k !== "glass" && k !== "glow"; owned[key].userData.plate = plate; } return owned[key]; };
    const meshes = [], q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), mtx = new T.Matrix4(), col = new T.Color();
    for (const b of buckets.values()) {
      const im = new T.InstancedMesh(G[b.geo], matFor(b.plate, b.mat), b.list.length), base = new Float32Array(b.list.length * 4), xs = new Float32Array(b.list.length);
      b.list.forEach((o, i) => {
        q.setFromAxisAngle(up, o.rot); mtx.compose(new T.Vector3(o.cx - CX, o.y, o.cz - CY), q, new T.Vector3(o.sx, o.sy, o.sz)); im.setMatrixAt(i, mtx); im.setColorAt(i, b.mat === "glow" ? col.set(o.color).multiplyScalar(3.2) : col.set(o.color));
        const e = mtx.elements; base[i * 4] = e[1]; base[i * 4 + 1] = e[5]; base[i * 4 + 2] = e[9]; base[i * 4 + 3] = e[13]; xs[i] = o.cx;
      });
      im.castShadow = b.mat !== "glow" && b.mat !== "glass"; im.receiveShadow = b.mat !== "glow"; im.frustumCulled = false; im.userData.replica = true;
      plates[b.plate].add(im); meshes.push({ im, base, xs });
    }
    // Blender models: one InstancedMesh per plan, model and material; emissive parts glow, colours are the model's own
    const geoCache = {}, assetMat = {};
    const geometry = (name, i, p) => { const k = name + i; if (!geoCache[k]) { const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(p.pos, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(p.nor, 3)); g.setIndex(p.idx); geoCache[k] = g; } return geoCache[k]; };
    const material = (plate, p) => { const k = plate + p.name; if (!assetMat[k]) { const m = new T.MeshStandardMaterial({ color: new T.Color().setRGB(...p.color), roughness: p.rough, metalness: p.metal }); if (/window|glass/.test(p.name)) { m.transparent = true; m.opacity = .45; } if (p.emissive && p.emissive.some((v) => v > 0)) { m.emissive = new T.Color().setRGB(...p.emissive); m.emissiveIntensity = 2.2; } m.userData.dim = !m.transparent; m.userData.plate = plate; m.userData.base = m.color.clone(); assetMat[k] = m; owned["a" + k] = m; } return assetMat[k]; };
    for (const key of new Set(placed.map((o) => o.plate + "|" + o.name))) {
      const list = placed.filter((o) => o.plate + "|" + o.name === key), [plate, name] = key.split("|");
      ASSETS[name].forEach((p, i) => {
        const im = new T.InstancedMesh(geometry(name, i, p), material(plate, p), list.length), base = new Float32Array(list.length * 4), xs = new Float32Array(list.length);
        list.forEach((o, n) => { q.setFromAxisAngle(up, o.rot); mtx.compose(new T.Vector3(o.x - CX, 0, o.z - CY), q, new T.Vector3(o.sx, o.sy, o.sz)); im.setMatrixAt(n, mtx); const e = mtx.elements; base[n * 4] = e[1]; base[n * 4 + 1] = e[5]; base[n * 4 + 2] = e[9]; base[n * 4 + 3] = e[13]; xs[n] = o.x; });
        im.castShadow = im.receiveShadow = true; im.frustumCulled = false; im.userData.replica = true; plates[plate].add(im); meshes.push({ im, base, xs });
      });
    }
    let parts = placed.length * 40; for (const m of meshes) parts += m.xs.length;
    function rise(Rv) {
      const sweep = -160 + Rv * 1280, band = 150;
      for (const { im, base, xs } of meshes) {
        const a = im.instanceMatrix.array;
        for (let i = 0; i < xs.length; i++) { let k = (sweep - xs[i]) / band; k = k < 0 ? 0 : k > 1 ? 1 : k; k = k * k * (3 - 2 * k); k = Math.max(k, .004); const o = i * 16, n = i * 4; a[o + 1] = base[n] * k; a[o + 5] = base[n + 1] * k; a[o + 9] = base[n + 2] * k; a[o + 13] = base[n + 3] * k; }
        im.instanceMatrix.needsUpdate = true; im.visible = Rv > .004;
      }
    }

    /* life: cartons on the conveyors, and vehicles on the routes found by 3D-Modeling's findRoute */
    const carton = new T.InstancedMesh(G.box, new T.MeshStandardMaterial({ color: 0xcaa372, roughness: .9 }), 1), lines = [];
    const movers = [];
    for (const q2 of R.conveyors) {
      let L = 0; const seg = q2.pts.slice(1).map((b, i) => { const a = q2.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); L += l; return { a, b, l }; });
      const n = Math.floor(L / (4.5 * M)), im = new T.InstancedMesh(G.box, carton.material, n); im.castShadow = true; im.frustumCulled = false; plates[q2.plate].add(im); lines.push({ seg, L, n, im });
    }
    function vehicle(kind) {
      const g = new T.Group(), name = kind === "forklift" ? "forklift" : "agv";
      (ASSETS[name] || []).forEach((p, i) => { const m = new T.Mesh(geometry(name, i, p), material("veh", p)); m.castShadow = true; g.add(m); });
      g.scale.setScalar(M); return g;
    }
    // square motion: drive a straight, stop, pivot 90 degrees, drive on; a pure function of time, looping
    const ease = (u) => u * u * u * (u * (6 * u - 15) + 10), wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    for (const r of R.routes || []) {
      const v = vehicle(r.kind); plates[r.plate].add(v); const speed = (r.kind === "forklift" ? 1.9 : 1.1) * M, moves = []; let t = 0, head = null;
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], b = r.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < .01) continue;
        const hd = Math.atan2(b[0] - a[0], b[1] - a[1]);
        if (head !== null && Math.abs(wrapA(hd - head)) > .01) { const d = Math.abs(wrapA(hd - head)) > 2 ? 1.6 : 1; moves.push({ turn: true, t0: t, d, a, h0: head, h1: head + wrapA(hd - head) }); t += d; }
        const d = l / speed + .8; moves.push({ t0: t, d, a, b, h0: hd, h1: hd }); t += d; head = hd;
      }
      const first = moves.find((m) => !m.turn); moves.push({ turn: true, t0: t, d: 2, a: r.pts[r.pts.length - 1], h0: head, h1: head + wrapA(first.h0 - head) }); t += 2;
      movers.push({ v, moves, total: t, off: movers.length * 23, heading: first.h0 });
    }
    function vehicleAt(m, time) {
      const t = (time + m.off) % m.total; let lo = 0, hi = m.moves.length - 1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (m.moves[k].t0 <= t) lo = k; else hi = k - 1; }
      const s = m.moves[lo], u = ease(Math.min(1, (t - s.t0) / s.d));
      return s.turn ? { x: s.a[0], y: s.a[1], heading: s.h0 + (s.h1 - s.h0) * u } : { x: s.a[0] + (s.b[0] - s.a[0]) * u, y: s.a[1] + (s.b[1] - s.a[1]) * u, heading: s.h0 };
    }
    const at = (seg, d) => { for (const s of seg) { if (d <= s.l) return [s.a[0] + (s.b[0] - s.a[0]) * d / (s.l || 1), s.a[1] + (s.b[1] - s.a[1]) * d / (s.l || 1), s]; d -= s.l; } const s = seg[seg.length - 1]; return [s.b[0], s.b[1], s]; };
    function live(time, Rv, dt) {
      const show = Rv > .92;
      for (const m of movers) {
        m.v.visible = show; if (!show) continue;
        const p = vehicleAt(m, time); m.heading = p.heading; m.v.position.set(p.x - CX, .1, p.y - CY); m.v.rotation.y = p.heading;
      }
      for (const l of lines) {
        l.im.visible = show; if (!show) continue;
        for (let i = 0; i < l.n; i++) { const d = (i / l.n * l.L + time * 1.1 * M) % l.L, [x, y] = at(l.seg, d); mtx.makeScale(.9 * M, .7 * M, .8 * M).setPosition(x - CX, 1.65 * M + .7, y - CY); l.im.setMatrixAt(i, mtx); }
        l.im.instanceMatrix.needsUpdate = true;
      }
    }
    function dim(plate, k) { for (const m of Object.values(owned)) if (m.userData.dim && m.userData.plate === plate) { if (m.userData.base) m.color.copy(m.userData.base).multiplyScalar(k); else m.color.setScalar(k); } }
    return { ready: Promise.resolve(), vehicleAt, rise, live, dim, movers, parts, meshes, M, stats: { racks: R.racks.length, machines: R.machines.filter((m) => m.type === "injection" || m.type === "press").length, columns: R.columns.length, walls: R.walls.length, routes: (R.routes || []).length } };
  }

  /* the clean 2D replica of one plan, drawn as CAD-like line art */
  function drawPlan(R, plate, box, dark) {
    const k = 6, [x0, y0, w, h] = box, cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    const g = cv.getContext("2d"), X = (x) => (x - x0) * k, Y = (y) => (y - y0) * k, ink = dark ? "#9fd0ff" : "#14233f", soft = dark ? "#3a6ea5" : "#7f90aa", paper = dark ? "#0b1a33" : "#f6f7fa";
    g.fillStyle = paper; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = dark ? "#16325c" : "#e4e8ef"; g.lineWidth = 1; for (let x = 0; x < cv.width; x += 10 * k) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); } for (let y = 0; y < cv.height; y += 10 * k) { g.beginPath(); g.moveTo(0, y); g.lineTo(cv.width, y); g.stroke(); }
    const on = (a) => a.filter((o) => o.plate === plate);
    for (const r of on(R.rooms)) { g.fillStyle = dark ? "#10274a" : "#eef1f6"; g.fillRect(X(r.x), Y(r.y), r.w * k, r.h * k); }
    for (const d of on(R.decks)) { g.fillStyle = dark ? "#1a3560" : "#dfe4ec"; g.fillRect(X(d.x), Y(d.y), d.w * k, d.h * k); }
    g.strokeStyle = soft; g.lineWidth = 1.5;
    for (const r of on(R.racks)) {
      g.fillStyle = dark ? "#143a6b" : "#a9c3ee"; g.fillRect(X(r.x), Y(r.y), r.w * k, r.h * k); g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(X(r.x), Y(r.y), r.w * k, r.h * k); g.lineWidth = 1;
      const vert = r.h >= r.w, L = vert ? r.h : r.w, n = Math.round(L / 9); for (let i = 1; i < n; i++) { g.beginPath(); if (vert) { g.moveTo(X(r.x), Y(r.y + L * i / n)); g.lineTo(X(r.x + r.w), Y(r.y + L * i / n)); } else { g.moveTo(X(r.x + L * i / n), Y(r.y)); g.lineTo(X(r.x + L * i / n), Y(r.y + r.h)); } g.stroke(); }
      g.beginPath(); if (vert) { g.moveTo(X(r.x + r.w / 2), Y(r.y)); g.lineTo(X(r.x + r.w / 2), Y(r.y + r.h)); } else { g.moveTo(X(r.x), Y(r.y + r.h / 2)); g.lineTo(X(r.x + r.w), Y(r.y + r.h / 2)); } g.stroke();
    }
    for (const m of on(R.machines)) { g.fillStyle = m.type === "dock" ? (dark ? "#23406e" : "#aab4c6") : (dark ? "#1b4f8f" : "#6f9be0"); g.strokeStyle = ink; g.lineWidth = 3; g.fillRect(X(m.x), Y(m.y), m.w * k, m.h * k); g.strokeRect(X(m.x), Y(m.y), m.w * k, m.h * k); }
    for (const t of on(R.trucks)) { g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(X(t.x), Y(t.y), t.w * k, t.h * k); g.beginPath(); g.moveTo(X(t.x), Y(t.y + t.h * .74)); g.lineTo(X(t.x + t.w), Y(t.y + t.h * .74)); g.stroke(); }
    g.strokeStyle = dark ? "#59d0ff" : "#2360c9"; g.lineWidth = 5; for (const c of on(R.conveyors)) { g.beginPath(); c.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke(); }
    g.strokeStyle = ink; g.lineWidth = 9; g.lineCap = "square"; for (const w of on(R.walls)) { g.beginPath(); g.moveTo(X(w.a[0]), Y(w.a[1])); g.lineTo(X(w.b[0]), Y(w.b[1])); g.stroke(); }
    g.fillStyle = ink; for (const c of on(R.columns)) g.fillRect(X(c.p[0]) - 8, Y(c.p[1]) - 8, 16, 16);
    for (const l of on(R.lifts)) { g.strokeStyle = "#e0a800"; g.lineWidth = 4; g.strokeRect(X(l.x), Y(l.y), l.w * k, l.h * k); g.beginPath(); g.moveTo(X(l.x), Y(l.y)); g.lineTo(X(l.x + l.w), Y(l.y + l.h)); g.moveTo(X(l.x + l.w), Y(l.y)); g.lineTo(X(l.x), Y(l.y + l.h)); g.stroke(); }
    // scale bar: the replica has real dimensions
    const bx = 16, by = cv.height - 22, tenM = 10 * M * k; g.fillStyle = ink; g.fillRect(bx, by, tenM, 6); g.fillRect(bx + tenM * 2, by, tenM, 6); g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(bx, by, tenM * 3, 6); g.font = "bold 22px Segoe UI, Arial"; g.fillText("0", bx, by - 6); g.fillText("30 m", bx + tenM * 3 - 44, by - 6);
    return cv;
  }
  return { build, drawPlan };
})();
