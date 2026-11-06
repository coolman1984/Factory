/* The replica: the factory rebuilt from the take-off (private/replica.json), in slide points (1 pt = 0.30 m).
   Everything static goes through one Kit into a few InstancedMeshes per plan, so thousands of parts cost a handful of draw
   calls, and the whole factory can rise out of the flat plan behind a sweep: rise(R) scales every instance from the floor.
   drawPlan() redraws the plan as clean vector art, so the blurry slide image is no longer the limit in 2D. */
"use strict";
window.MFReplica = (function () {
  const M = 1 / 0.3;   // slide points per metre
  function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function build({ T, plates, R, CX, CY }) {
    const G = { box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(.5, .5, 1, 14), cylx: new T.CylinderGeometry(.5, .5, 1, 14).rotateZ(Math.PI / 2), cone: new T.ConeGeometry(.5, 1, 14).rotateX(Math.PI) };
    const MAT = {
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

    function injection(r) {
      const p = r.plate, f = frame(r, r.vertical), m = (x) => x * M, L = f.L, W = f.Wd, big = r.big || r.vertical, hh = big ? 1 : .72, part = (u, v, y, su, sy, sv, col, mat = "paint", geo = "box") => { const [x, z] = f.at(u, v); add(p, geo, mat, x, y, z, su, sy, sv, col, f.rot); };
      part(.5, 0, m(.5), L, m(1), W * .62, c.graph);
      for (const [u, tw] of [[.06, .05], [.26, .05], [.44, .06]]) part(u, 0, m(1.9) * hh, L * tw, m(2.4) * hh, W * .62, c.blue);
      for (const v of [-1, 1]) for (const y of [1.2, 2.6]) part(.25, v * W * .22, m(y) * hh, L * .4, m(.22), m(.22), c.steel, "metal", "cylx");
      part(.25, 0, m(1.9) * hh, L * .42, m(2.6) * hh, W * .72, 0xbfe3ff, "glass");
      part(.66, 0, m(1.75) * hh, L * .4, m(.55), m(.55), c.steel, "metal", "cylx");
      part(.74, 0, m(2.7) * hh, m(1), m(1.1), m(1), c.white, "paint", "cone");
      part(.9, 0, m(1.6) * hh, L * .16, m(1.5) * hh, W * .55, c.blue);
      part(.6, W * .4, m(1.1) * hh, L * .24, m(2.2) * hh, W * .14, c.white);
      part(.52, W * .48, m(1.6) * hh, m(.9), m(.6), m(.06), 0x4fc3ff, "glow");
      part(.47, -W * .34, m(2.9) * hh, m(.1), m(1.4), m(.1), c.steel, "metal", "cyl");
      part(.47, -W * .34, m(3.7) * hh, m(.24), m(.34), m(.24), r.big ? 0x3dff8a : 0xffc000, "glow", "cyl");
    }
    function press(r) {
      const p = r.plate, cx = r.x + r.w / 2, cy = r.y + r.h / 2, h = 4.2 * M;
      box(p, cx, .5 * M, cy, r.w * .9, M, r.h * .8, c.graph);
      for (const dx of [-.35, .35]) box(p, cx + r.w * dx, h / 2, cy, r.w * .14, h, r.h * .6, c.blue);
      box(p, cx, h - M * .5, cy, r.w * .84, M, r.h * .6, c.blue); box(p, cx, h * .55, cy, r.w * .5, M * .5, r.h * .5, c.steel, "metal");
      box(p, cx, h * .5, cy + r.h * .42, r.w * .7, h * .8, 2, 0xbfe3ff, "glass");
    }
    function rack(r, levels, rand) {
      const p = r.plate, vertical = r.h >= r.w, L = vertical ? r.h : r.w, D = vertical ? r.w : r.h, bays = Math.max(2, Math.round(L / (2.7 * M))), bl = L / bays, lv = 1.75 * M, cx = r.x + r.w / 2, cy = r.y + r.h / 2, row = D / 2 * .92, H = levels * lv + .6 * M;
      const pos = (u, v) => (vertical ? [cx + v, cy - L / 2 + u] : [cx - L / 2 + u, cy + v]);
      const up = vertical ? [.5, H, 1.1 * M * .1] : [.5, H, .5];
      for (const side of [-1, 1]) {
        const v = side * D / 4;
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
    function truck(r) {
      const p = r.plate, cx = r.x + r.w / 2, tl = r.h * .74, y0 = r.y, wide = r.w * .78;
      box(p, cx, 2.6 * M, y0 + tl / 2 + 1, wide, 2.7 * M, tl, c.white); box(p, cx, 2.6 * M, y0 + tl / 2 + 1, wide * 1.01, .6 * M, tl * 1.002, c.blue);
      box(p, cx, 1.8 * M, y0 + tl + r.h * .13, wide * .96, 2.8 * M, r.h * .2, c.blue); box(p, cx, 2.3 * M, y0 + r.h * .985, wide * .8, .9 * M, 1, 0x9fd6ff, "glass");
      for (const u of [.16, .28, .74, .96]) for (const s of [-1, 1]) add(p, "cylx", "matte", cx + s * wide * .46, .5 * M, y0 + r.h * u, .3 * M, M, M, 0x10131a);
    }
    function utility(r) { const p = r.plate, cx = r.x + r.w / 2, cy = r.y + r.h / 2, h = 2.4 * M; box(p, cx, h / 2, cy, r.w * .9, h, r.h * .9, 0x7f8a99); box(p, cx, h + .6, cy, r.w * .6, 1.2, r.h * .6, 0x596273, "metal"); }
    function dock(r) { const p = r.plate, cx = r.x + r.w / 2; box(p, cx, .5, r.y + r.h / 2, r.w * .8, 1, r.h, 0x3a4356); box(p, cx - r.w * .45, 7, r.y + .4, 1, 14, 1, c.yellow); box(p, cx + r.w * .45, 7, r.y + .4, 1, 14, 1, c.yellow); box(p, cx, 13.5, r.y + .4, r.w, 1, 1, c.yellow); }

    const rand = rng(20261106);
    for (const w of R.walls) {
      const [ax, ay] = w.a, [bx, by] = w.b, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), rot = -Math.atan2(dy, dx), mx = (ax + bx) / 2, my = (ay + by) / 2, H = 3.6 * M;
      box(w.plate, mx, H / 2, my, len + 1.3, H, 1.3, 0xdde2e9, "paint", rot); box(w.plate, mx, H + .25, my, len + 1.5, .5, 1.5, 0x22304c, "paint", rot);
    }
    for (const q of R.columns) { const H = (q.plate === "E2-2F" ? 7 : 8.5) * M; box(q.plate, q.p[0], H / 2, q.p[1], 1.9, H, 1.9, 0xc4cad3); box(q.plate, q.p[0], 1.6, q.p[1], 2.9, 3.2, 2.9, c.yellow); }
    for (const r of R.racks) rack(r, r.plate === "E2-2F" ? 3 : 4, rand);
    for (const m of R.machines) ({ injection, press, utility, dock, cell: press })[m.type](m);
    R.trucks.forEach(truck);
    for (const q of R.conveyors) for (let k = 1; k < q.pts.length; k++) {
      const a = q.pts[k - 1], b = q.pts[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = -Math.atan2(b[1] - a[1], b[0] - a[0]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, y = .9 * M, W = 1.1 * M;
      box(q.plate, mx, y, my, len, .5, W, 0x23293a, "matte", rot);
      for (const s of [-1, 1]) box(q.plate, mx + Math.sin(rot) * s * W / 2, y + .3, my + Math.cos(rot) * s * W / 2, len, .9, .3, c.steel, "metal", rot);
      for (let u = 0; u <= len; u += 3 * M) for (const s of [-1, 1]) { const x = a[0] + (b[0] - a[0]) * u / len + Math.sin(rot) * s * W * .45, z = a[1] + (b[1] - a[1]) * u / len + Math.cos(rot) * s * W * .45; box(q.plate, x, y / 2, z, .4, y, .4, c.steel, "metal"); }
    }
    for (const l of R.lifts) { const cx = l.x + l.w / 2, cy = l.y + l.h / 2, H = 7 * M; box(l.plate, cx, H / 2, cy, l.w, H, l.h, 0xffe08a, "glass"); for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(l.plate, cx + i * l.w / 2, H / 2, cy + j * l.h / 2, .8, H, .8, c.yellow); }
    for (const d of R.decks) box(d.plate, d.x + d.w / 2, .5, d.y + d.h / 2, d.w, 1, d.h, 0x56627a, "paint");

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
    let parts = 0; for (const m of meshes) parts += m.xs.length;
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
      const g = new T.Group(), std = (color, r = .5, m = .1) => new T.MeshStandardMaterial({ color, roughness: r, metalness: m }), B = (w, h, d, mat, x, y, z) => { const o = new T.Mesh(G.box, mat); o.scale.set(w, h, d); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
      if (kind === "forklift") {
        const y = std(0xf2b705), k = std(0x20242e, .7);
        B(1.2 * M, .8 * M, 2.2 * M, y, 0, .75 * M, 0); B(1.2 * M, .25 * M, .9 * M, k, 0, 2.1 * M, -.1 * M);
        for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(.08 * M, 1.4 * M, .08 * M, k, i * .52 * M, 1.5 * M, -.1 * M + j * .4 * M);
        B(.16 * M, 3 * M, .16 * M, k, -.42 * M, 1.5 * M, 1.2 * M); B(.16 * M, 3 * M, .16 * M, k, .42 * M, 1.5 * M, 1.2 * M);
        B(.14 * M, .1 * M, 1.2 * M, k, -.3 * M, .3 * M, 1.8 * M); B(.14 * M, .1 * M, 1.2 * M, k, .3 * M, .3 * M, 1.8 * M);
        B(1 * M, .9 * M, 1 * M, std(0xc9a26b, .9), 0, .85 * M, 1.8 * M);
      } else {
        B(1.2 * M, .45 * M, 1.9 * M, std(0x2360c9, .35, .3), 0, .35 * M, 0); B(1 * M, .9 * M, 1.2 * M, std(0xc9a26b, .9), 0, 1 * M, 0);
        const led = new T.Mesh(G.box, new T.MeshBasicMaterial({ color: new T.Color(0x3dffb0).multiplyScalar(3), toneMapped: false })); led.scale.set(1.1 * M, .05 * M, 1.8 * M); led.position.y = .62 * M; g.add(led);
      }
      return g;
    }
    for (const r of R.routes || []) {
      const v = vehicle(r.kind); plates[r.plate].add(v); let L = 0; const seg = r.pts.slice(1).map((b, i) => { const a = r.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); L += l; return { a, b, l }; });
      movers.push({ v, seg, L, speed: (r.kind === "forklift" ? 2.6 : 1.4) * M, off: movers.length * 31, heading: 0 });
    }
    const at = (seg, d) => { for (const s of seg) { if (d <= s.l) return [s.a[0] + (s.b[0] - s.a[0]) * d / (s.l || 1), s.a[1] + (s.b[1] - s.a[1]) * d / (s.l || 1), s]; d -= s.l; } const s = seg[seg.length - 1]; return [s.b[0], s.b[1], s]; };
    function live(time, Rv, dt) {
      const show = Rv > .92;
      for (const m of movers) {
        m.v.visible = show; if (!show) continue;
        const d = (time * m.speed + m.off) % m.L, [x, y, s] = at(m.seg, d), want = Math.atan2(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        let diff = Math.atan2(Math.sin(want - m.heading), Math.cos(want - m.heading)); m.heading += diff * Math.min(1, dt * 5);
        m.v.position.set(x - CX, .1, y - CY); m.v.rotation.y = m.heading;
      }
      for (const l of lines) {
        l.im.visible = show; if (!show) continue;
        for (let i = 0; i < l.n; i++) { const d = (i / l.n * l.L + time * 1.1 * M) % l.L, [x, y] = at(l.seg, d); mtx.makeScale(.9 * M, .7 * M, .8 * M).setPosition(x - CX, 1.65 * M + .7, y - CY); l.im.setMatrixAt(i, mtx); }
        l.im.instanceMatrix.needsUpdate = true;
      }
    }
    function dim(plate, k) { for (const m of Object.values(owned)) if (m.userData.dim && m.userData.plate === plate) m.color.setScalar(k); }
    return { rise, live, dim, movers, parts, meshes, M, stats: { racks: R.racks.length, machines: R.machines.filter((m) => m.type === "injection" || m.type === "press").length, columns: R.columns.length, walls: R.walls.length, routes: (R.routes || []).length } };
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
