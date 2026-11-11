// Applied after the original V7 patches. Keep every camera change on the immutable V6 build chain.
export const cameraReviewPatches = [
  ['const camScale = () => (S.playing && S.speed > 1 ? 1 + (S.speed - 1) * .5 : 1);',
   'const camScale = () => S.playing ? S.speed : 1;', 'camera: use one story clock at every playback speed'],
  ['S.t + .8 * Math.max(1, S.speed)', 'S.t + 1.5', 'camera: fixed story look-ahead'],
  ['clock += frameDt;', 'clock += frameDt * camScale();', 'camera: story-time sight hysteresis'],
  ['const blend = 1 - Math.exp(-dt / (S.speed > 1.5 ? .07 : FF_TAU));',
   'const blend = 1 - Math.exp(-dt * camScale() / FF_TAU);', 'camera: story-time feed-forward'],
  ['if (S.cam !== "guided") guidedReady = false;',
   'if (!["guided", "follow"].includes(S.cam)) guidedReady = false;', 'camera: retain follow damping state'],
  ['pol: .82, near: 1.25, far: 1.45, ahead: 20, aheadShare: .35',
   'pol: .58, near: 1.25, far: 1.45, ahead: 12, aheadShare: .25', 'camera: higher view and modest look-ahead'],
  ['Math.min(vis.pol, CALM.pol)', 'vis.pol', 'camera: never invalidate an accepted sight tilt'],
  ['const prefOk = ok(p, d, pref, .94);', 'const prefOk = ok(p, d, pref, CALM.pol);', 'camera: test the actual preferred tilt'],
  ['let az = pref, pol = .94, forced = !prefOk;', 'let az = pref, pol = CALM.pol, forced = !prefOk;', 'camera: use the tested preferred tilt'],
  ['const OFFS = [0, .26, -.26, .52, -.52, .79, -.79, 1.05, -1.05, 1.57, -1.57, Math.PI], POLS = [.94, .72, .5, 1.15, 1.3, 1.45, 1.53, .3, .12, .001];',
   'const OFFS = [0, .26, -.26, .52, -.52, .79, -.79, 1.05, -1.05, 1.57, -1.57, Math.PI], POLS = [.58, .45, .3, .12, .02, .72, .94, 1.15, 1.3, 1.45, 1.53, .001];', 'camera: prefer high clear views'],
  ['if (ready && choice.forced && ok(p, d, choice.az, choice.pol) && (clock - choice.at < 1.5 || !prefOk || clock - prefSince < 1.2)) return choice;',
   'if (ready && ok(p, d, choice.az, choice.pol)) return choice;', 'camera: hold a clear shot across steps'],
  ['"calm camera"', '"calm camera"', 'camera: sentinel'],
];

// The shaft shot starts before the upper plate moves over the trolley. A cutaway hides the upper storey until the
// trolley emerges, rather than forcing the eye to cut through its slab. The cabin/shaft remain visible throughout.
cameraReviewPatches.splice(-1, 1,
  ['  function setWant() {', `  function rideView(t) {
    let w = 0;
    for (const it of F().items) if (it.s.lift) {
      const enter = smooth01((t - (it.t0 - CINE.pre - 1)) / (CINE.pre + 1));
      const leave = 1 - smooth01((t - (it.t1 + CINE.post)) / (CINE.out + 1));
      w = Math.max(w, Math.min(enter, leave));
    }
    return w;
  }
  function setWant() {`, 'camera: planned elevator transition'],
  ['if (S.cam === "guided" && cur.s.intro) { const e = ease(S.R); aim(0, 0, 0, fit() * lerp(1, .9, e), lerp(0, -.5, e), lerp(.001, 1, e)); guidedReady = false; return; }',
   `if (S.cam === "guided" && cur.s.intro) {
        const e = ease(S.R), u = smooth01((S.t - (INTRO - 2.5)) / 2.5), p = worldFromLot(frameLot, S.stack, cameraPoint);
        const first = F().items[1], d = first ? first.s.dist * CALM.far : 300;
        aim(p.x * u, (p.y + 2) * u, p.z * u, lerp(fit() * lerp(1, .9, e), d, u), lerp(lerp(0, -.5, e), AZ_STEP[0], u), lerp(lerp(.001, 1, e), CALM.pol, u));
        guidedAz = want.az; guidedPol = want.pol; guidedReady = true; return;
      }`, 'camera: land the intro on the first trolley shot'],
  ['const targetAz = S.cam === "follow" ? -.55 : aisleAz(cur,lp,d);',
   `const rv = rideView(S.t);
      // Follow the rendered trolley during a shaft shot; a leading target misses the narrow opening.
      if (rv > 0) { const at = worldFromLot(lp, S.stack, guardA); p.lerp(at, rv); }
      p.y += 2;
      const targetAz = AZ_STEP[0];`, 'camera: fixed composition and shaft centring'],
  ['const vis = !flat() && S.cam === "guided" ? SIGHT.choose(p, d, targetAz, guidedAz, lp) : null;',
   'const vis = !flat() ? SIGHT.choose(p, d, targetAz, guidedAz, lp) : null;', 'camera: check follow views too'],
  ['const goalAz = vis ? vis.az : targetAz, goalPol = vis ? SIGHT.transitionPol(p, d, guidedAz, vis.pol, lp) : CALM.pol, rate = vis && vis.forced ? 3.2 : CALM.ease;',
   'const goalAz = vis ? vis.az : targetAz, planPol = lerp(vis ? vis.pol : CALM.pol, .005, rv), goalPol = vis ? SIGHT.transitionPol(p, d, guidedAz, planPol, lp) : planPol, rate = CALM.ease;', 'camera: ease into shaft before the ride'],
  ['(vis && vis.forced ? CALM.forced : CALM.turn)', 'CALM.turn', 'camera: limit ordinary requested turns'],
  ['const cd = frameLot.lift != null ? 180 : 120; aim(p.x, p.y + 4, p.z, cd, az, frameLot.lift != null ? 1.3 : SIGHT.chasePol(p, cd, az, frameLot));',
   `const cd = 180, rv = rideView(S.t);
      if (!setWant.chaseReady) { setWant.chaseAz = az; setWant.chaseReady = true; }
      setWant.chaseAz += clamp(wrapPi(az - setWant.chaseAz), -.35 * frameDt * camScale(), .35 * frameDt * camScale());
      aim(p.x, p.y + 2, p.z, cd, setWant.chaseAz, lerp(Math.min(.82, SIGHT.chasePol(p, cd, setWant.chaseAz, frameLot)), .005, rv));`, 'camera: slower wider chase and planned shaft view'],
  ['if (S.cam === "free" || S.cam === "director") return;\n    const cur = stepAt(S.t);',
   'if (S.cam !== "chase") setWant.chaseReady = false;\n    if (S.cam === "free" || S.cam === "director") return;\n    const cur = stepAt(S.t);', 'camera: reset chase on mode change'],
  ['seek(t) { S.t = clamp(t, 0, F().total);', 'seek(t) { guidedReady = false; setWant.chaseReady = false; S.t = clamp(t, 0, F().total);', 'camera: reset angle history on seek'],
  ["cutaway=!cur.s.intro&&S.stack>.1&&S.stackUser==null&&S.view!==\"auto\"&&['guided','follow','chase'].includes(S.cam);",
   "cutaway=!cur.s.intro&&S.stack>.001&&S.stackUser==null&&['guided','follow','chase'].includes(S.cam);", 'camera: planned upper-floor cutaway'],
  ['if (DEV) for (const g of Object.values(DEV.groups))',
   'if (DEV) for (const g of Object.values(DEV.groups || {}))', 'camera: allow device-free scenes in the chase envelope'],
  ['activePlate=lp.lift!=null&&lp.lift<.95?E.lowPlate:plateOf(lp.x,lp.y)',
   'activePlate=lp.lift!=null?E.lowPlate:plateOf(lp.x,lp.y)', 'camera: reveal the upper floor only after the car reaches the landing'],
  ['(S.cam === "guided" || S.cam === "follow") && !flat()', '(S.cam === "guided" || S.cam === "follow" || S.cam === "chase") && !flat()', 'camera: protect actual chase sight line'],
  ['c.az = Math.atan2(dx, dz);\n      if (DEV)', 'c.az = Math.atan2(dx, dz);\n      if (S.cam !== "chase") { guidedAz = c.az; guidedPol = c.pol; }\n      if (DEV)', 'camera: keep rescued orientation instead of oscillating back'],
  ['      for (const o of [.35, -.35, .7, -.7, 1.2, -1.2, 1.9, -1.9, Math.PI])',
   '      // A centred high view is usually a smaller visual correction than an orbit around a device.\n      for (const q of [Math.min(pol, .58), .45, .3, .12, .02, .005]) if (seen(eyeAt(L, d, az, q, eye))) { Tg.copy(L); return take(); }\n      for (const o of [.35, -.35, .7, -.7, 1.2, -1.2, 1.9, -1.9, Math.PI])', 'camera: recenter before a forced orbit'],
  ['if (PREP.active) { prepFrame(raw); requestAnimationFrame(tick); return; }',
   'if (PREP.active) { prepFrame(raw); requestAnimationFrame(tick); return; }\n    if (window.MF7_EXPORT) { requestAnimationFrame(tick); return; }', 'film: offline frame ownership'],
);
