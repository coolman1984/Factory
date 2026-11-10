  /* ---------- V5 sight line: the camera must always SEE the trolley (inserted by tools/build-v5.mjs) ----------
     Every solid of the replica and the V5 devices becomes a box (plan rectangle + real top height, plate frame) in a uniform grid.
     clearLine() tests the exact segment eye -> trolley against those boxes (slab test), so a wall right beside the trolley, a rack
     row or a column between camera and trolley is found exactly, not estimated. The guided camera keeps its preferred angle while
     that line is clear; when it is not, it turns to the nearest clear angle (or rises), and keeps that choice while it stays clear
     (hysteresis: no flicker). The chase camera only rises. Cost: one segment against the boxes of the cells it crosses. */
  const SIGHT = (() => {
    const CELL = 16, MM = 1 / PT_M, grid = new Map(), boxes = [];
    const upperP = (p) => !!(D.plates[p] && D.plates[p].lift);
    function add(plate, x0, y0, x1, y1, top) {
      const b = { plate, x0: x0 - CX, z0: y0 - CY, x1: x1 - CX, z1: y1 - CY, top, stamp: 0 }; boxes.push(b);
      for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) {
        const k = plate + ":" + i + ":" + j; let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(b);
      }
    }
    let built = false;   // built on first use: the device add-on (DEV) is created after this module
    function build() {
      built = true;
      for (const w of RP.walls || []) { const t = .75; add(w.plate, Math.min(w.a[0], w.b[0]) - t, Math.min(w.a[1], w.b[1]) - t, Math.max(w.a[0], w.b[0]) + t, Math.max(w.a[1], w.b[1]) + t, 3.6 * MM + .5); }
      for (const r of RP.racks || []) add(r.plate, r.x, r.y, r.x + r.w, r.y + r.h, ((upperP(r.plate) ? 3 : 4) * 1.75 + .6) * MM);
      for (const q of RP.columns || []) add(q.plate, q.p[0] - 1.45, q.p[1] - 1.45, q.p[0] + 1.45, q.p[1] + 1.45, (upperP(q.plate) ? 7 : 8.5) * MM);
      for (const m of RP.machines || []) add(m.plate, m.x, m.y, m.x + m.w, m.y + m.h, (m.type === "dock" ? .6 : 3) * MM);
      for (const l of RP.lifts || []) add(l.plate, l.x, l.y, l.x + l.w, l.y + l.h, (upperP(l.plate) ? 6.2 : 7.4) * MM);
      for (const q of RP.pallets || []) add(q.plate, q.x, q.y, q.x + q.w, q.y + q.h, 1.3 * MM);
      if (DEV) for (const p of DEV.solids) { const hx = Math.max(p.sx, p.sz) / 2; add((DEV.list[0] && DEV.list[0].plate) || "1F", p.x - hx, p.z - hx, p.x + hx, p.z + hx, p.y + p.sy / 2); }
    }
    let stamp = 0;
    const off = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3();
    // true if nothing solid crosses the segment from the eye A to the target L (world). ignore = plan radius around L left out
    // (the trolley's own surroundings: the gate it drives through, the floor marks).
    function clearLine(A, L, plate, ignore = 3) {
      if (!built) build();
      const g = plates[plate]; off.copy(g ? g.position : a.set(0, 0, 0));
      a.copy(A).sub(off); b.copy(L).sub(off); stamp++;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, plan = Math.hypot(dx, dz), n = Math.max(2, Math.ceil(plan / (CELL * .5)));
      for (let s = 0; s <= n; s++) {
        const x = a.x + dx * s / n + CX, z = a.z + dz * s / n + CY, k = plate + ":" + Math.floor(x / CELL) + ":" + Math.floor(z / CELL), c = grid.get(k); if (!c) continue;
        for (const bx of c) {
          if (bx.stamp === stamp) continue; bx.stamp = stamp;
          const ex = Math.max(bx.x0 - b.x, 0, b.x - bx.x1), ez = Math.max(bx.z0 - b.z, 0, b.z - bx.z1); if (Math.hypot(ex, ez) < ignore) continue;
          // slab test of the segment against the box [x0,x1] x [0,top] x [z0,z1]
          let t0 = 0, t1 = .97;
          for (const [p0, d0, lo, hi] of [[a.x, dx, bx.x0, bx.x1], [a.y, dy, 0, bx.top], [a.z, dz, bx.z0, bx.z1]]) {
            if (Math.abs(d0) < 1e-9) { if (p0 < lo || p0 > hi) { t0 = 2; break; } continue; }
            let u0 = (lo - p0) / d0, u1 = (hi - p0) / d0; if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
            t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) break;
          }
          if (t0 <= t1) return false;
        }
      }
      return true;
    }
    const eye = new T.Vector3(), L = new T.Vector3();
    const eyeAt = (p, d, az, pol, out) => out.set(p.x + d * Math.sin(pol) * Math.sin(az), p.y + d * Math.cos(pol), p.z + d * Math.sin(pol) * Math.cos(az));
    const OFFS = [0, .26, -.26, .52, -.52, .79, -.79, 1.05, -1.05, 1.31, -1.31, 1.57, -1.57, 2.09, -2.09, 2.62, -2.62, Math.PI];
    let last = null; const stats = { tests: 0, forced: 0, blockedActual: 0 };
    // guided: p = look target (world), d = distance, pref = preferred azimuth, cur = current azimuth, lp = the lot's pose
    function choose(p, d, pref, cur, lp) {
      worldFromLot(lp, S.stack, L); L.y += 2; const plate = lp.lift != null ? E.lowPlate : plateOf(lp.x, lp.y); stats.tests++;
      const ok = (az, pol) => clearLine(eyeAt(p, d, az, pol, eye), L, plate);
      if (!clearLine(camera.position, L, plate)) stats.blockedActual++;
      if (last && last.forced && S.t - last.at < 1.5 && ok(last.az, last.pol)) return last;   // hold a forced choice briefly
      if (ok(pref, .94)) return (last = { az: pref, pol: .94, forced: false, at: S.t });
      if (last && last.forced && ok(last.az, last.pol)) return last;
      for (const pol of [.94, .72, .5, .3]) for (const o of OFFS) { const az = cur + o; if (ok(az, pol)) { stats.forced++; return (last = { az, pol, forced: true, at: S.t }); } }
      return (last = { az: cur, pol: .12, forced: true, at: S.t });   // nothing clear: look straight down
    }
    // chase: keep the azimuth, rise only as much as needed; never drop faster than .6 rad of polar angle per second
    let chaseLast = 1.3;
    function chasePol(p, d, az, lp) {
      worldFromLot(lp, S.stack, L); L.y += 2; const plate = plateOf(lp.x, lp.y);
      let pol = .2; for (const q of [1.3, 1.15, 1.0, .85, .7, .55, .4]) if (clearLine(eyeAt(p, d, az, q, eye), L, plate)) { pol = q; break; }
      chaseLast = pol < chaseLast ? pol : Math.min(pol, chaseLast + .6 * frameDt * Math.max(1, S.speed)); return chaseLast;
    }
    return { clearLine, choose, chasePol, boxes, stats, reset() { last = null; chaseLast = 1.3; } };
  })();
