  /* Visibility uses full-height instance bounds, indexed once in each plate's local frame.
     Test every visible plate, preserving empty space beneath desks and between lift parts.
     Guided angles have a wall-clock hold and look ahead before the trolley reaches a wall. */
  const SIGHT = (() => {
    const CELL = 16, MM = 1 / PT_M, boxes = [], grids = [];
    let built = false, stamp = 0;
    function add(plate, x0, z0, x1, z1, top, bottom = 0) {
      let g = grids.find(g => g.plate === plate);
      if (!g) { g = { plate, cells: new Map() }; grids.push(g); }
      const b = { plate, x0, z0, x1, z1, top, bottom, stamp: 0 }; boxes.push(b);
      for (let i = Math.floor((x0 + CX) / CELL); i <= Math.floor((x1 + CX) / CELL); i++) for (let j = Math.floor((z0 + CY) / CELL); j <= Math.floor((z1 + CY) / CELL); j++) {
        const key = i + j * 65536; let c = g.cells.get(key); if (!c) g.cells.set(key, c = []); c.push(b);
      }
      return b;
    }
    function build() {
      built = true;
      // Replica instance matrices may be collapsed by the rise sweep: restore their stored full-height Y rows.
      if (typeof REP !== 'undefined' && REP.meshes) {
        const matrix = new T.Matrix4(), bound = new T.Box3();
        for (const { im, base } of REP.meshes) {
          if (im.material.transparent) continue;
          const plate = im.material.userData.plate; if (!plates[plate]) continue;
          if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
          for (let i = 0; i < im.count; i++) {
            im.getMatrixAt(i, matrix);
            if (base) { const e = matrix.elements; e[1] = base[i * 4]; e[5] = base[i * 4 + 1]; e[9] = base[i * 4 + 2]; e[13] = base[i * 4 + 3]; }
            bound.copy(im.geometry.boundingBox).applyMatrix4(matrix);
            add(plate, bound.min.x, bound.min.z, bound.max.x, bound.max.z, bound.max.y, bound.min.y);
          }
        }
      } else {
        // CPU fixture / legacy fallback; production uses actual parts, including open lift cages.
        for (const w of RP.walls || []) add(w.plate, Math.min(w.a[0], w.b[0]) - CX - .75, Math.min(w.a[1], w.b[1]) - CY - .75, Math.max(w.a[0], w.b[0]) - CX + .75, Math.max(w.a[1], w.b[1]) - CY + .75, 3.6 * MM + .5);
        for (const key of ['racks', 'machines', 'pallets']) for (const r of RP[key] || []) add(r.plate, r.x - CX, r.y - CY, r.x + r.w - CX, r.y + r.h - CY, (key === 'racks' ? 7.6 : key === 'pallets' ? 1.3 : 3) * MM);
      }
      if (typeof floors !== 'undefined') for (const floor of floors) for (const mesh of [floor.art, floor.slab]) {
        // Keep slab openings: their triangles, rather than a filled floor bounding rectangle, block a sight line.
        const geometry = mesh.geometry, positions = geometry.attributes.position, index = geometry.index;
        mesh.updateMatrix();
        const count = index ? index.count : positions.count;
        for (let i = 0; i < count; i += 3) {
          const tri = [];
          for (let k = 0; k < 3; k++) tri.push(new T.Vector3().fromBufferAttribute(positions, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrix));
          const [a, b, c] = tri;
          const box = add(floor.key, Math.min(a.x, b.x, c.x), Math.min(a.z, b.z, c.z), Math.max(a.x, b.x, c.x), Math.max(a.z, b.z, c.z), Math.max(a.y, b.y, c.y), Math.min(a.y, b.y, c.y));
          box.tri = tri;
        }
      }
      if (DEV) for (const p of DEV.solids) {
        const c = Math.abs(Math.cos(p.yaw)), s = Math.abs(Math.sin(p.yaw)), hx = (c * p.sx + s * p.sz) / 2, hz = (s * p.sx + c * p.sz) / 2;
        add(p.plate || '1F', p.x - CX - hx, p.z - CY - hz, p.x - CX + hx, p.z - CY + hz, p.y + p.sy / 2, p.y - p.sy / 2);
      }
    }
    function intersects(a, dx, dy, dz, b, end) {
      let lo = 0, hi = end, u, v;
      for (let axis = 0; axis < 3; axis++) {
        const p = axis === 0 ? a.x : axis === 1 ? a.y : a.z, d = axis === 0 ? dx : axis === 1 ? dy : dz;
        const min = axis === 0 ? b.x0 : axis === 1 ? b.bottom : b.z0, max = axis === 0 ? b.x1 : axis === 1 ? b.top : b.z1;
        if (Math.abs(d) < 1e-10) { if (p < min || p > max) return false; continue; }
        u = (min - p) / d; v = (max - p) / d; if (u > v) { const t = u; u = v; v = t; }
        lo = Math.max(lo, u); hi = Math.min(hi, v); if (lo > hi) return false;
      }
      if (b.tri) {
        ray.origin.copy(a); ray.direction.set(dx, dy, dz).normalize();
        const hit = ray.intersectTriangle(b.tri[0], b.tri[1], b.tri[2], false, triangleHit);
        return !!hit && hit.distanceTo(a) <= Math.hypot(dx, dy, dz) * end;
      }
      return true;
    }
    const ray = new T.Ray(), triangleHit = new T.Vector3();
    const a = new T.Vector3(), b = new T.Vector3();
    function clearLine(A, L, plate, ignore = .5) {
      if (!built) build();
      const length = A.distanceTo(L), end = Math.max(0, 1 - ignore / Math.max(.001, length));
      for (const g of grids) {
        const group = plates[g.plate]; if (!group || group.visible === false) continue;
        a.copy(A).sub(group.position); b.copy(L).sub(group.position); stamp++;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        let i = Math.floor((a.x + CX) / CELL), j = Math.floor((a.z + CY) / CELL);
        const ei = Math.floor((b.x + CX) / CELL), ej = Math.floor((b.z + CY) / CELL), si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
        const tx = Math.abs(dx) < 1e-10 ? Infinity : CELL / Math.abs(dx), tz = Math.abs(dz) < 1e-10 ? Infinity : CELL / Math.abs(dz);
        let nx = Math.abs(dx) < 1e-10 ? Infinity : ((i + (si > 0 ? 1 : 0)) * CELL - CX - a.x) / dx;
        let nz = Math.abs(dz) < 1e-10 ? Infinity : ((j + (sj > 0 ? 1 : 0)) * CELL - CY - a.z) / dz;
        const limit = Math.abs(ei - i) + Math.abs(ej - j) + 3;
        for (let k = 0; k < limit; k++) {
          const cell = g.cells.get(i + j * 65536);
          if (cell) for (const box of cell) { if (box.stamp === stamp) continue; box.stamp = stamp; if (intersects(a, dx, dy, dz, box, end)) return false; }
          if (i === ei && j === ej) break;
          if (nx < nz) { i += si; nx += tx; } else { j += sj; nz += tz; }
        }
      }
      return true;
    }
    const eye = new T.Vector3(), L = new T.Vector3(), future = new T.Vector3(), futurePose = {};
    const eyeAt = (p, d, az, pol, out) => out.set(p.x + d * Math.sin(pol) * Math.sin(az), p.y + d * Math.cos(pol), p.z + d * Math.sin(pol) * Math.cos(az));
    const OFFS = [0, .26, -.26, .52, -.52, .79, -.79, 1.05, -1.05, 1.57, -1.57, Math.PI], POLS = [.94, .72, .5, 1.15, 1.3, 1.45, 1.53, .3, .12, .001];
    const choice = { az: 0, pol: .94, forced: false, at: 0 }, stats = { tests: 0, forced: 0, blockedActual: 0 };
    let ready = false, clock = 0, prefSince = -1, chaseLast = 1.3;
    function targets(lp) {
      worldFromLot(lp, S.stack, L); L.y += 2; future.copy(L);
      if (typeof lotPos === 'function' && S.playing) { lotPos(Math.min(F().total, S.t + .8 * Math.max(1, S.speed)), futurePose); worldFromLot(futurePose, S.stack, future); future.y += 2; }
    }
    const ok = (p, d, az, pol) => { eyeAt(p, d, az, pol, eye); return clearLine(eye, L) && clearLine(eye, future); };
    const visibleNow = (p, d, az, pol) => clearLine(eyeAt(p, d, az, pol, eye), L);
    function choose(p, d, pref, cur, lp) {
      targets(lp); clock += frameDt; stats.tests++;
      if (!clearLine(camera.position, L)) stats.blockedActual++;
      const prefOk = ok(p, d, pref, .94);
      if (prefOk) { if (prefSince < 0) prefSince = clock; } else prefSince = -1;
      if (ready && choice.forced && ok(p, d, choice.az, choice.pol) && (clock - choice.at < 1.5 || !prefOk || clock - prefSince < 1.2)) return choice;
      let az = pref, pol = .94, forced = !prefOk;
      if (forced) {
        let found = false;
        for (const q of POLS) { for (const o of OFFS) if (ok(p, d, cur + o, q)) { az = cur + o; pol = q; found = true; break; } if (found) break; }
        // A lift can put the current and predicted target on opposite sides of a slab.
        // Prefer a clear current view over an impossible two-target view; never blindly choose overhead.
        if (!found) for (const q of POLS) { for (const o of OFFS) if (visibleNow(p, d, cur + o, q)) { az = cur + o; pol = q; found = true; break; } if (found) break; }
        if (!found) { az = cur; pol = .001; }
        stats.forced++;
      }
      choice.az = az; choice.pol = pol; choice.forced = forced; choice.at = clock; ready = true; return choice;
    }
    // The interpolated angle also needs clearance: a safe destination does not imply a safe orbit to it.
    function transitionPol(p, d, az, pol, lp) {
      targets(lp);
      if (ok(p, d, az, pol)) return pol;
      for (const q of POLS) if (ok(p, d, az, q)) return q;
      for (const q of POLS) if (visibleNow(p, d, az, q)) return q;
      return .001;
    }
    function chasePol(p, d, az, lp) {
      targets(lp); let pol = .2;
      for (let q = 1.3; q >= .39; q -= .15) if (ok(p, d, az, q)) { pol = q; break; }
      chaseLast = pol < chaseLast ? pol : Math.min(pol, chaseLast + .6 * frameDt); return chaseLast;
    }
    return { clearLine, choose, transitionPol, chasePol, boxes, stats,
      rebuild() { built = false; boxes.length = 0; grids.length = 0; },
      reset() { ready = false; prefSince = -1; clock = 0; chaseLast = 1.3; } };
  })();
