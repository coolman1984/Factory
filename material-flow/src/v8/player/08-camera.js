  /* ---------- camera ---------- */
  const fit = () => { const a = camera.aspect, f = Math.tan((camera.fov * Math.PI) / 360); return Math.max(FIT[0] / f, FIT[1] / (f * a)); }, FIT = D.fit || [330, 560];   // half-height / half-width the overview must show
  const flat = () => S.view === "2d";
  // Camera presets [x, y, dist, az, pol] in the project frame. A project lists its own (D.cameras: key -> {label, at});
  // otherwise one preset per plate. "elev" always looks at the elevator of the flow on screen.
  const PRESET = {}, camLabels = [];
  if (D.cameras) for (const [k, c] of Object.entries(D.cameras)) { PRESET[k] = c.at; camLabels.push([k, c.label]); }
  else for (const [k, P] of plateEntries) {
    const b = P.box, size = Math.max(b[2], b[3]); PRESET["p:" + k] = [b[0] + b[2] / 2, b[1] + b[3] / 2, clamp(size * 1.4, 300, 700), P.lift ? -.5 : -.4, .95]; camLabels.push(["p:" + k, P.label]);
  }
  if (ELEVATORS.length) camLabels.push(["elev", ELEVATORS.length > 1 ? "Elevator of this flow" : ELEVATORS[0].label]);
  { // the camera menu lists this project's presets between "Isometric" and "Free camera"
    const sel = $("cam"), free = sel.querySelector('option[value="free"]');
    for (const o of [...sel.options]) if (!["guided", "follow", "chase", "forklift", "overview", "iso", "free"].includes(o.value)) o.remove();
    for (const [k, label] of camLabels) { const o = document.createElement("option"); o.value = k; o.textContent = label; sel.insertBefore(o, free); }
  }
  function aim(x, y, z, dist, az, pol) { want.x = x; want.y = y; want.z = z; want.dist = dist; want.az = az; want.pol = pol; }
  // Guided camera: the azimuth is a constant per story step (only a step change moves it, and then slowly);
  // the look target is the lot blended toward the middle of the segment it is travelling, and the distance frames
  // that segment. Corners never turn the camera: only the target and distance ease (spring) to the next segment.
  const AZ_STEP = [-.55, -.3, -.8, -.45, -.7, -.25];
  const CALM = { long: 40, turn: .35, forced: 99, ease: .9, pol: .58, near: 1.25, far: 1.45, ahead: 12, aheadShare: .25 }, calmD = new Map(), calmS = new Map();
  const segLen = (P, k) => P[k + 1] ? Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]) : 0;
  function calmSeg(cur, seg) { const key = S.flow + ':' + cur.i + ':' + seg; if (calmS.has(key)) return calmS.get(key); const P = cur.sched.pts; let k = seg;
    if (segLen(P, seg) < CALM.long) { let best = -1; for (let q = seg - 1; q >= 0; q--) if (segLen(P, q) >= CALM.long) { best = q; break; } if (best < 0) for (let q = seg + 1; q < P.length - 1; q++) if (segLen(P, q) >= CALM.long) { best = q; break; } if (best >= 0) k = best; }
    calmS.set(key, k); return k; }
  function calmDist(cur, d) { const key = S.flow + ':' + cur.i; let L = calmD.get(key); if (L == null) { L = 0; const P = cur.sched.pts; for (let k = 0; k < P.length - 1; k++) L = Math.max(L, segLen(P, k)); calmD.set(key, L); } return clamp(L * 1.1, d, d * 1.8); }
  let guidedAz = 0, guidedPol = .94, guidedReady = false, frameDt = 1 / 60;
  const chaseExitAngles = new Map();
  // Speed-aware follow. At 8x the lot travels 8x faster in world space, and a critically damped spring chasing a goal that moves
  // at velocity v lags by 2v/omega: the lag would grow with speed. Two measures keep it bounded:
  //  1) velocity feed-forward: setWant publishes the current world velocity of the goal (camFF, units/s, already x speed and
  //     x the share of the lot motion the goal carries); the spring integrates in the goal's frame, so a constant-velocity goal has
  //     zero steady lag at any speed (exact for any dt);
  //  2) camScale() stiffens every follow spring with playback speed, so discrete changes (segment/step switches, corners) settle
  //     in roughly the same number of story metres instead of falling behind.
  // Discrete jumps of the goal (new segment midpoint, new step) are NOT fed forward: they go into the spring's position error and
  // are absorbed without overshoot. The feed-forward itself is low-pass filtered (FF_TAU) so it never steps the camera velocity.
  const camFF = new T.Vector3(), camFFSmooth = new T.Vector3(), FF_TAU = .12;
  const camScale = () => S.playing ? S.speed : 1;
  function leadVelocity(lp, cur, share) {   // world velocity (units/s) of the lot x share, only while playing
    if (!S.playing || share <= 0) return;
    const sp = S.speed * share;
    if (lp.lift != null) {
      const span = Math.max(.001, cur.tm - cur.t0), u = clamp((S.t - cur.t0) / span, 0, 1), k = 6 * u * (1 - u) / span * sp;   // d ease(u) / dt
      camFF.subVectors(liftHigh, liftLow).multiplyScalar(k);
    } else if (lp.k === "move" && lp.v > 0) { const s = lp.v / PT_M * sp; camFF.set(Math.sin(lp.h) * s, 0, Math.cos(lp.h) * s); }
  }
  // V3 director. Around each ride (CINE.pre s before it until CINE.post s after arrival, then CINE.out s to slide back) the
  // 2F glides over the 1F. Guided camera shots: A crane down between the floors while the 2F slides in; B the car between
  // the slabs, slow orbit and push in; C a cut to above the 2F as the car comes up through the shaft hole.
  const CINE = { pre: 5, post: 2.6, out: 3.6 }, cine = { shot: "", cut: false }, cineAzs = new Map(), cineA = new T.Vector3(), cineB = new T.Vector3();
  const smooth01 = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  function glideAt(t) { return MFMotion.glideAt(F().items, liftIndices[S.flow], t, CINE); }
  // share of the sight line from an eye at height eyeH (reach R away, azimuth az) to the trolley that solids cover
  function sightBlocked(plate, p, az, reach, eyeH) {
    const sx = Math.sin(az), sz = Math.cos(az), near = o => o.plate === plate && Math.abs(o.x + o.w / 2 - p[0]) < reach + o.w / 2 + 10 && Math.abs(o.y + o.h / 2 - p[1]) < reach + o.h / 2 + 10;
    const M = 1 / .3, solids = [...RP.racks.filter(near).map(o => [o, 7.6 * M]), ...RP.machines.filter(near).map(o => [o, 5 * M]), ...RP.lifts.filter(near).filter(o => Math.hypot(o.x + o.w / 2 - p[0], o.y + o.h / 2 - p[1]) > 4).map(o => [o, 7.4 * M])];
    const walls = RP.walls.filter(w => w.plate === plate && Math.min(Math.hypot(w.a[0] - p[0], w.a[1] - p[1]), Math.hypot(w.b[0] - p[0], w.b[1] - p[1]), Math.abs(w.a[0] - w.b[0]) < .1 ? Math.abs(w.a[0] - p[0]) : Math.abs(w.a[1] - p[1])) < reach);
    let bad = 0, n = 0;
    for (let r = 5; r < reach; r += 4) {
      const x = p[0] + sx * r, y = p[1] + sz * r, h = 2 + (eyeH - 2) * r / reach; n++;
      if (solids.some(([o, H]) => H > h && x > o.x - 1 && x < o.x + o.w + 1 && y > o.y - 1 && y < o.y + o.h + 1)) { bad++; continue; }
      if (h < 3.6 * M + 1 && walls.some(w => { const ax = w.a[0], ay = w.a[1], bx = w.b[0], by = w.b[1], L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1, k = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2, 0, 1); return Math.hypot(x - ax - k * (bx - ax), y - ay - k * (by - ay)) < 1.5; })) bad++;
    }
    return bad ? 1 + bad / Math.max(1, n) : 0;
  }
  function cineAz(e) {
    const key = S.flow + ":" + e.label; if (cineAzs.has(key)) return cineAzs.get(key);
    let best = null;
    for (let k = 0; k < 24; k++) {
      const az = -Math.PI + k * Math.PI / 12;
      const score = sightBlocked(e.lowPlate, e.low, az, 300, 90) * 2 + sightBlocked(e.highPlate, e.high, az + .55, 250, 150) + Math.abs(wrapPi(az + .55)) * .015;
      if (!best || score < best[0]) best = [score, az];
    }
    cineAzs.set(key, best[1]); return best[1];
  }
  function cineShot(cur) {
    const li = liftIndices[S.flow]; if (li < 0 || cur.s.intro) { cine.shot = ""; return false; }
    const it = F().items[li], t = S.t;
    if (t < it.t0 - CINE.pre || t > it.t1 + CINE.post) { cine.shot = ""; return false; }
    const az0 = cineAz(E), low = W(E.low[0], E.low[1], S.stack, .8, cineA), lp = frameLot, at = worldFromLot(lp, S.stack, cineB);
    let shot, x, y, z, dist, az, eyeH;
    if (t < it.t0) {                                   // A: the 2F slides in overhead, the camera cranes down between the floors
      const u = smooth01((t - (it.t0 - CINE.pre)) / CINE.pre), k = .3 + .55 * u;
      shot = "A"; x = lerp(at.x, low.x, k); z = lerp(at.z, low.z, k); y = lerp(6, 14, u); dist = lerp(470, 330, u); az = az0 - .5 + .35 * u; eyeH = lerp(250, 190, u);
    } else {
      const u = clamp((t - it.t0) / Math.max(.001, it.tm - it.t0), 0, 1);
      if (lp.lift != null && lp.lift < .98) {           // B: the car between the slabs
        shot = "B"; x = at.x; z = at.z; y = at.y + 5; dist = lerp(330, 255, clamp(u / .92,0,1)); az = az0 - .15 + .55 * u; eyeH = Math.min(y + 75, glideY(S.stack) * GAP - 16);
      } else {                                         // C: above the 2F, the car comes up through the shaft hole
        const v = clamp((t - it.t0) / Math.max(.001, it.t1 + CINE.post - it.t0), 0, 1);
        shot = "C"; x = at.x; z = at.z; y = at.y + 4; dist = lerp(290, 235, v); az = az0 + .4 + .3 * v; eyeH = y + 150;
      }
    }
    if ((shot === "B" || shot === "C") && cine.shot !== shot) cine.cut = true;   // a director's cut, never a swoop through the slab
    cine.shot = shot;
    aim(x, y, z, dist, az, Math.acos(clamp((eyeH - y) / dist, -1, 1)));
    leadVelocity(lp, cur, shot === "A" ? .3 : 1);
    return true;
  }
  const aisleAngles=new Map();
  function aisleAz(cur,lp,d){
    if(!cur.sched||lp.lift!=null)return AZ_STEP[0];
    const sg=calmSeg(cur,lp.seg),key=S.flow+':'+cur.i+':'+sg;if(aisleAngles.has(key))return aisleAngles.get(key);
    const a=cur.sched.pts[sg],b=cur.sched.pts[sg+1]||a,p=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const plate=plateOf(p[0],p[1]),reach=d*Math.sin(.94),eyeH=d*Math.cos(.94),base=AZ_STEP[0];let best=[Infinity,base];
    for(let k=0;k<16;k++){
      const az=-Math.PI+k*Math.PI/8,score=(sightBlocked(plate,p,az,reach,eyeH)+sightBlocked(plate,a,az,reach,eyeH)+sightBlocked(plate,b,az,reach,eyeH))/3+Math.abs(wrapPi(az-base))*.06;
      if(score<best[0])best=[score,az];
    }
    aisleAngles.set(key,best[1]);return best[1];
  }
  const guardA = new T.Vector3(), guardOut = [0, 0, 0];
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
    const OFFS = [0, .26, -.26, .52, -.52, .79, -.79, 1.05, -1.05, 1.57, -1.57, Math.PI], POLS = [.58, .45, .3, .12, .02, .72, .94, 1.15, 1.3, 1.45, 1.53, .001];
    const choice = { az: 0, pol: .94, forced: false, at: 0 }, stats = { tests: 0, forced: 0, blockedActual: 0 };
    let ready = false, clock = 0, prefSince = -1, chaseLast = 1.3;
    function targets(lp) {
      worldFromLot(lp, S.stack, L); L.y += 2; future.copy(L);
      if (typeof lotPos === 'function' && S.playing) { lotPos(Math.min(F().total, S.t + 1.5), futurePose); worldFromLot(futurePose, S.stack, future); future.y += 2; }
    }
    const ok = (p, d, az, pol) => { eyeAt(p, d, az, pol, eye); return clearLine(eye, L) && clearLine(eye, future); };
    const visibleNow = (p, d, az, pol) => clearLine(eyeAt(p, d, az, pol, eye), L);
    function choose(p, d, pref, cur, lp) {
      targets(lp); clock += frameDt * camScale(); stats.tests++;
      stats.blockedNow = !clearLine(camera.position, L); if (stats.blockedNow) stats.blockedActual++;
      const prefOk = ok(p, d, pref, CALM.pol);
      if (prefOk) { if (prefSince < 0) prefSince = clock; } else prefSince = -1;
      if (ready && ok(p, d, choice.az, choice.pol)) return choice;
      let az = pref, pol = CALM.pol, forced = !prefOk;
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
    // exact check against the floors and slabs (a handful of triangles): the box model can miss slab edges around a shaft hole
    const fray = new T.Raycaster(), fdir = new T.Vector3(); let fmeshes = null;
    const floorClear = (P) => { if (!fmeshes) fmeshes = floors.flatMap((f) => [f.art, f.slab]); fdir.subVectors(L, P); const len = fdir.length(); fray.set(P, fdir.multiplyScalar(1 / len)); fray.far = Math.max(0, len - 1.5); for (const m of fmeshes) { let v = true; for (let o = m; o; o = o.parent) if (!o.visible) { v = false; break; } if (v && fray.intersectObject(m, false).length) return false; } return true; };
    // exact check against the real replica meshes (~1 ms): the final word, so the trolley is never hidden by a missed box
    const xray = new T.Raycaster(), xdir = new T.Vector3(); let xmeshes = null, xdev = null, xdevices = [];
    const exactClear = (P) => { if (!xmeshes) xmeshes = REP.meshes.map((m) => m.im).filter((o) => !o.material.transparent); if (xdev !== DEV) { xdev = DEV; xdevices = Object.values(DEV.groups || {}).flatMap(g => g.children.filter(o => o.isInstancedMesh && !o.material.transparent)); } xdir.subVectors(L, P); const len = xdir.length(); xray.set(P, xdir.multiplyScalar(1 / len)); xray.far = Math.max(0, len - 1.5); for (const list of [xmeshes, xdevices]) for (const m of list) { let v = m.visible; for (let o = m.parent; v && o; o = o.parent) if (!o.visible) v = false; if (v) { m.updateWorldMatrix(true, false); if (xray.intersectObject(m, false).length) return false; } } return true; };
    // A candidate must pass the same opaque-mesh checks as the acceptance test, even after several failed candidates.
    const seen = (P) => clearLine(P, L) && floorClear(P) && exactClear(P);
    function ensure(E3, Tg, vel) {
      if (!fmeshes) fmeshes = floors.flatMap((f) => [f.art, f.slab]); for (const k of Object.keys(plates)) plates[k].updateMatrixWorld(true);   // floors may have moved this frame (glide)
      targets(frameLot); lot.getWorldPosition(L); L.y += 2; if (seen(E3)) return false;
      const dx = E3.x - Tg.x, dy = E3.y - Tg.y, dz = E3.z - Tg.z, d = Math.max(1, Math.hypot(dx, dy, dz)), az = Math.atan2(dx, dz), pol = Math.acos(clamp(dy / d, -1, 1));
      const take = () => { E3.copy(eye); vel.set(0, 0, 0); stats.rescued = (stats.rescued || 0) + 1; return true; };
      // smallest change first: tilt up or down, then turn, then come closer (under an upper slab only a low, near view is clear)
      for (let k = 1; k <= 30; k++) for (const q of [pol - k * .05, pol + k * .05]) if (q > .01 && q < 1.5 && seen(eyeAt(Tg, d, az, q, eye))) return take();
      // A centred high view is usually a smaller visual correction than an orbit around a device.
      for (const q of [Math.min(pol, .58), .45, .3, .12, .02, .005]) if (seen(eyeAt(L, d, az, q, eye))) { Tg.copy(L); return take(); }
      for (const o of [.35, -.35, .7, -.7, 1.2, -1.2, 1.9, -1.9, Math.PI]) for (const q of [pol, 1.2, .8, .5, .25, 1.4]) if (seen(eyeAt(Tg, d, az + o, q, eye))) return take();
      for (const k of [.7, .5, .35, .22]) for (const o of [0, .7, -.7, 1.5, -1.5, Math.PI]) for (const q of [pol, 1.3, 1.1, .8, .5, .2]) if (seen(eyeAt(Tg, d * k, az + o, q, eye))) return take();
      // last: views centred on the trolley itself (inside an elevator shaft only a near-vertical line through the shaft hole is clear)
      for (const q of [.01, .06, .12, .2, .3]) for (const o of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) if (seen(eyeAt(L, d, az + o, q, eye))) return take();
      if (seen(eyeAt(L, d, az, .005, eye))) return take();
      // An exhausted finite search is a failed rescue, never evidence of a clear view.
      stats.unresolved = (stats.unresolved || 0) + 1; return false;
    }
    // V7.7.1: build the sight boxes and the meshes' bounding data now (behind the preparing screen), not in the first guided frame
    function warm() { if (!built) build(); targets(frameLot); floorClear(camera.position); exactClear(camera.position); }
    return { warm, ensure, seen: (P) => { targets(frameLot); return { box: clearLine(P, L), floor: floorClear(P), L: L.toArray().map((v) => +v.toFixed(1)) }; }, clearLine, choose, transitionPol, chasePol, boxes, stats,
      rebuild() { built = false; boxes.length = 0; grids.length = 0; },
      reset() { ready = false; prefSince = -1; clock = 0; chaseLast = 1.3; } };
  })();

  function rideView(t) {
    let w = 0;
    for (const it of F().items) if (it.s.lift) {
      const enter = smooth01((t - (it.t0 - CINE.pre - 1)) / (CINE.pre + 1));
      const leave = 1 - smooth01((t - (it.t1 + CINE.post)) / (CINE.out + 1));
      w = Math.max(w, Math.min(enter, leave));
    }
    return w;
  }
  function setWant() {
    camFF.set(0, 0, 0);
    if (!["guided", "follow"].includes(S.cam)) guidedReady = false;
    if (S.cam !== "chase") setWant.chaseReady = false;
    if (S.cam === "free" || S.cam === "director") return;
    const cur = stepAt(S.t);
    cine.shot = "";   // Guided follows the trolley through lifts too; no untested cinematic cuts.
    if (S.cam === "guided" || S.cam === "follow") {
      if (S.cam === "guided" && cur.s.intro) {
        const e = ease(S.R), u = smooth01((S.t - (INTRO - 2.5)) / 2.5), p = worldFromLot(frameLot, S.stack, cameraPoint);
        const first = F().items[1], d = first ? first.s.dist * CALM.far : 300;
        aim(p.x * u, (p.y + 2) * u, p.z * u, lerp(fit() * lerp(1, .9, e), d, u), lerp(lerp(0, -.5, e), AZ_STEP[0], u), lerp(lerp(.001, 1, e), CALM.pol, u));
        guidedAz = want.az; guidedPol = want.pol; guidedReady = true; return;
      }
      const lp = frameLot, p = worldFromLot(lp, S.stack, cameraPoint); let d = S.cam === "follow" ? 300 : cur.s.dist * (S.stack > .5 ? CALM.near : CALM.far), share = 1;
      if (S.cam === "guided" && cur.sched && lp.lift == null && cur.sched.phases.length) {
        const a = cur.sched.pts[lp.seg], b = cur.sched.pts[lp.seg + 1];
        if (a && b) {
          W(a[0], a[1], S.stack, .8, segmentA); W(b[0], b[1], S.stack, .8, segmentB);
          const length = segmentA.distanceTo(segmentB); share = 1;   // Keep the target on the trolley, including segment changes.   // the goal carries 35% of the lot's motion
          d = calmDist(cur, d); void length;
          { const ahead = Math.min(CALM.ahead, Math.hypot(segmentB.x - p.x, segmentB.z - p.z)); if (ahead > .5) { const ux = (segmentB.x - p.x), uz = (segmentB.z - p.z), n = Math.hypot(ux, uz) || 1; p.x += ux / n * ahead * CALM.aheadShare; p.z += uz / n * ahead * CALM.aheadShare; } }
        }
      }
      if (S.cam === "guided" && share < 1) {   // V5: never let the trolley drift to the screen edge: pull the goal onto it
        proj(worldFromLot(lp, S.stack, guardA), guardOut); const nx = guardOut[0] / innerWidth * 2 - 1, ny = guardOut[1] / innerHeight * 2 - 1, off = Math.max(Math.abs(nx), Math.abs(ny));
        if (guardOut[2] < 1 && off > .55) { const k = clamp((off - .55) / .25, 0, 1); p.lerp(guardA, k); share = lerp(share, 1, k); }
      }
      const rv = rideView(S.t);
      // Follow the rendered trolley during a shaft shot; a leading target misses the narrow opening.
      if (rv > 0) { const at = worldFromLot(lp, S.stack, guardA); p.lerp(at, rv); }
      p.y += 2;
      const targetAz = AZ_STEP[0];
      const vis = !flat() ? SIGHT.choose(p, d, targetAz, guidedAz, lp) : null;   // V5: an angle that SEES the trolley
      const goalAz = vis ? vis.az : targetAz, planPol = lerp(vis ? vis.pol : CALM.pol, .005, rv), goalPol = vis ? SIGHT.transitionPol(p, d, guidedAz, planPol, lp) : planPol, rate = CALM.ease;
      if (!guidedReady || flat()) { guidedAz = goalAz; guidedPol = goalPol; guidedReady = true; } else { { const dAz = wrapPi(goalAz - guidedAz) * (1 - Math.exp(-frameDt * rate * camScale())), cap = CALM.turn * frameDt * camScale(); guidedAz += clamp(dAz, -cap, cap); } guidedPol += (goalPol - guidedPol) * (1 - Math.exp(-frameDt * (goalPol < guidedPol ? 8 : 1.3) * camScale())); }
      aim(p.x, p.y, p.z, flat() ? d * 1.5 : d, flat() ? 0 : guidedAz, flat() ? .001 : guidedPol);
      leadVelocity(lp, cur, share);
    } else if (S.cam === "forklift") {
      const m = REP.movers[0]; if (!m || !m.v) return; const p = m.v.getWorldPosition(cameraPoint); aim(p.x, p.y + 12, p.z, 92, (m.heading ?? m.v.rotation.y) + Math.PI, 1.28);
    } else if (S.cam === "chase") {
      const p = worldFromLot(frameLot, S.stack, cameraPoint);
      let az = frameLot.h + Math.PI;
      if (frameLot.lift != null) {
        // Look in from the nearest open edge of the upper landing, not through its slab/racks.
        if (!chaseExitAngles.has(E.label)) {
          // Include bridges projecting beyond the source picture: its edge alone is not an open edge.
          const group = plates[plateOf(E.high[0], E.high[1])]; group.updateWorldMatrix(true, true);
          const b = new T.Box3().setFromObject(group), landing = W(E.high[0], E.high[1]);
          const sides = [[landing.x - b.min.x, -Math.PI / 2], [b.max.x - landing.x, Math.PI / 2], [landing.z - b.min.z, Math.PI], [b.max.z - landing.z, 0]];
          chaseExitAngles.set(E.label, sides.reduce((a, b) => b[0] < a[0] ? b : a)[1]);
        }
        az = chaseExitAngles.get(E.label);
      }
      const cd = 180, rv = rideView(S.t);
      if (!setWant.chaseReady) { setWant.chaseAz = az; setWant.chaseReady = true; }
      setWant.chaseAz += clamp(wrapPi(az - setWant.chaseAz), -.35 * frameDt * camScale(), .35 * frameDt * camScale());
      aim(p.x, p.y + 2, p.z, cd, setWant.chaseAz, lerp(Math.min(.82, SIGHT.chasePol(p, cd, setWant.chaseAz, frameLot)), .005, rv)); leadVelocity(frameLot, cur, 1);   // V5: rise when blocked
    } else if (S.cam === "overview" || S.cam === "iso") {
      const iso = S.cam === "iso"; aim(0, iso ? 30 : 0, 0, fit() * (iso ? 1.05 : .95), flat() ? 0 : iso ? -.785 : -.55, flat() ? .001 : iso ? .96 : 1);
    } else {
      const r = S.cam === "elev" ? [E.low[0], E.low[1], 340, -.9, 1.15] : PRESET[S.cam]; if (!r) return; const p = W(r[0], r[1], S.stack, .8, cameraPoint); if (S.cam === "elev") p.y += S.stack * GAP / 2;
      aim(p.x, p.y, p.z, r[2], flat() ? 0 : r[3], flat() ? .001 : r[4]);
    }
  }
  // Exact critically damped springs, separately for the eye and the look target.
  const eyeVelocity = new T.Vector3(), targetVelocity = new T.Vector3(), cameraTarget = new T.Vector3(), desiredEye = new T.Vector3(), desiredTarget = new T.Vector3();
  const AXES = ["x", "y", "z"];
  function spring(point, velocity, goal, omega, dt) {
    const decay = Math.exp(-omega * dt);
    for (let i = 0; i < AXES.length; i++) { const axis = AXES[i]; const delta = point[axis] - goal[axis], j = velocity[axis] + omega * delta; point[axis] = goal[axis] + (delta + j * dt) * decay; velocity[axis] = (velocity[axis] - omega * j * dt) * decay; }
  }
  // Same exact integration, in the frame of a goal that moves at constant velocity gv over the step (gv = 0 gives spring() above):
  // e = x - goal(t), e(t) = (e0 + (ev0 + w e0) t) exp(-w t). Stable for any dt (long frames, 8x playback).
  function springFF(point, velocity, goal, gv, omega, dt) {
    const decay = Math.exp(-omega * dt);
    for (let i = 0; i < AXES.length; i++) {
      const axis = AXES[i], v = gv[axis], e0 = point[axis] - (goal[axis] - v * dt), ev0 = velocity[axis] - v, j = ev0 + omega * e0;
      point[axis] = goal[axis] + (e0 + j * dt) * decay; velocity[axis] = v + (ev0 - omega * j * dt) * decay;
    }
  }
  const carriedFloor=new T.Vector3(),floorCarryDelta=new T.Vector3(),eyeFF=new T.Vector3();let carriedKey='',carriedFlow=-1;
  function moveCam(dt) {
    const carryKey=frameLot.lift==null?plateOf(frameLot.x,frameLot.y):'',g=plates[carryKey];
    if(g&&S.playing&&S.view==='auto'&&S.stackUser==null&&['guided','follow','chase'].includes(S.cam)&&carriedKey===carryKey&&carriedFlow===S.flow){
      floorCarryDelta.copy(g.position).sub(carriedFloor);camera.position.add(floorCarryDelta);cameraTarget.add(floorCarryDelta);
    }
    carriedKey=carryKey;carriedFlow=S.flow;if(g)carriedFloor.copy(g.position);
    const c = S.c;
    if (S.cam === "free" || S.cam === "director") {
      if (window.MFX) window.MFX.freeCam(dt, c);
      const sp = Math.sin(c.pol); camera.position.set(c.x + c.dist * sp * Math.sin(c.az), c.y + c.dist * Math.cos(c.pol), c.z + c.dist * sp * Math.cos(c.az));
      cameraTarget.set(c.x, c.y, c.z); eyeVelocity.set(0, 0, 0); targetVelocity.set(0, 0, 0); camFFSmooth.set(0, 0, 0);
    } else {
      const sp = Math.sin(want.pol); desiredTarget.set(want.x, want.y, want.z);
      desiredEye.set(want.x + want.dist * sp * Math.sin(want.az), want.y + want.dist * Math.cos(want.pol), want.z + want.dist * sp * Math.cos(want.az));
      if (S.cam === "chase") protectChaseEye(desiredEye);
      if (cine.cut) { cine.cut = false; camera.position.copy(desiredEye); cameraTarget.copy(desiredTarget); eyeVelocity.set(0, 0, 0); targetVelocity.set(0, 0, 0); camFFSmooth.set(0, 0, 0); }   // V3 cut
      const omega = (S.cam === "chase" || S.cam === "forklift" ? 8 : stepAt(S.t).s.intro ? 9 : S.cam === "guided" ? 2.7 : 4.2) * camScale() * (S.cam === "guided" && SIGHT.stats.blockedNow ? 2.6 : 1);   // V7: catch up when the view is blocked   // V2: softer
      const blend = 1 - Math.exp(-dt * camScale() / FF_TAU); camFFSmooth.x += (camFF.x - camFFSmooth.x) * blend; camFFSmooth.y += (camFF.y - camFFSmooth.y) * blend; camFFSmooth.z += (camFF.z - camFFSmooth.z) * blend;
      eyeFF.copy(camFFSmooth);if(cine.shot==='B'&&S.cam==='guided'&&S.view==='auto'&&desiredEye.y>=glideY(S.stack)*GAP-16.01)eyeFF.y=0;
      springFF(camera.position, eyeVelocity, desiredEye, eyeFF, omega, dt); springFF(cameraTarget, targetVelocity, desiredTarget, camFFSmooth, omega, dt);
      // A spring or a seek can leave the rendered eye below its safe goal. Guard the actual eye too.
      if (S.cam === "chase") { const before = camera.position.y; protectChaseEye(camera.position); if (camera.position.y !== before) eyeVelocity.y = Math.max(0, eyeVelocity.y); }
      if(cine.shot==='B'&&S.cam==='guided'&&S.view==='auto'&&S.stackUser==null){
        const ceiling=glideY(S.stack)*GAP-16;if(camera.position.y>ceiling){camera.position.y=ceiling;eyeVelocity.y=Math.min(0,eyeVelocity.y);}
      }
      c.x = cameraTarget.x; c.y = cameraTarget.y; c.z = cameraTarget.z;
      const dx = camera.position.x - c.x, dy = camera.position.y - c.y, dz = camera.position.z - c.z;
      c.dist = Math.max(.001, Math.hypot(dx, dy, dz)); c.pol = Math.acos(clamp(dy / c.dist, -1, 1)); c.az = Math.atan2(dx, dz);
    }
    camera.up.set(0, 1, 0); camera.lookAt(cameraTarget); camera.updateMatrixWorld();
  }

