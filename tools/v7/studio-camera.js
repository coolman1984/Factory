/* ===== V7 Studio: camera (smooth studio camera, joysticks, lens, presets, bookmarks, trolley lock) =====
   The player's free camera places the eye from S.c every frame. The Studio keeps a goal pose and eases S.c toward it, so every
   control (pad, mouse, wheel, presets, bookmarks) moves the camera smoothly at the chosen speed and damping. */
const camera = X.camera, cameraTarget = X.cameraTarget, BASE_FOV = camera.fov;
const cam = {
  goal: { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: .9, fov: BASE_FOV },
  inited: false, lastMode: "", smooth: .6, speed: 1, lock: false, lockOff: new T.Vector3(),
  vel: { ox: 0, oy: 0, px: 0, py: 0, zoom: 0, crane: 0, roll: 0 }, fly: null,
};
const tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), poseTmp = { x: 0, y: 0, i: 1, u: 0, lift: null, it: null, h: 0, d: 0, v: 0, k: "hold", seg: 0 };
function trolleyWorld(t, out = tmpV2) { X.lotPos(t, poseTmp); return X.worldFromLot(poseTmp, S.stack, out); }
const isFreeish = () => S.cam === "free" || S.cam === "director";
function goFree(silent) {
  if (S.cam !== "free") { MF.setCam("free"); if (!silent) X.tip("Studio camera: use the pad or the mouse; G = guided camera"); }
  if (!cam.inited || cam.lastMode !== "free") syncGoal();
}
function syncGoal() { const c = S.c; Object.assign(cam.goal, { x: c.x, y: c.y, z: c.z, dist: c.dist, az: c.az, pol: c.pol, fov: camera.fov }); cam.inited = true; cam.lastMode = S.cam; if (cam.lock) cam.lockOff.set(c.x, c.y, c.z).sub(trolleyWorld(S.t)); }
const rateOf = () => lerp(36, 1.8, cam.smooth);    // damping: 0 = snappy, 1 = silky
function setLens(fov) { cam.goal.fov = clamp(fov, 8, 90); }
const lensMM = (fov) => 12 / Math.tan(fov * Math.PI / 360);    // 24 mm-high film gate: 28 deg vertical ~ 48 mm
const fovOfMM = (mm) => 2 * Math.atan(12 / mm) * 180 / Math.PI;

let directorPose = null;    // set by the director module
function freeCam(dt, c) {
  if (S.cam === "director" && directorPose) {
    const p = directorPose(S.t);
    if (p) { c.x = p.x; c.y = p.y; c.z = p.z; c.dist = p.dist; c.az = p.az; c.pol = p.pol; if (Math.abs(camera.fov - p.fov) > 1e-3) { camera.fov = p.fov; camera.updateProjectionMatrix(); } Object.assign(cam.goal, p); cam.lastMode = "director"; return; }
  }
  if (!cam.inited || cam.lastMode !== S.cam) syncGoal();
  cam.lastMode = S.cam;
  const g = cam.goal, v = cam.vel, sp = cam.speed, k0 = Math.min(dt, .1);
  if (cam.fly) {   // a timed move (presets, focus, bookmarks): ease from the start pose to the end pose
    const f = cam.fly; f.t += k0; const u = smooth(f.t / f.dur);
    g.x = lerp(f.a.x, f.b.x, u); g.y = lerp(f.a.y, f.b.y, u); g.z = lerp(f.a.z, f.b.z, u); g.dist = Math.exp(lerp(Math.log(f.a.dist), Math.log(f.b.dist), u));
    g.az = f.a.az + wrapPi(f.b.az - f.a.az) * u; g.pol = lerp(f.a.pol, f.b.pol, u); g.fov = lerp(f.a.fov, f.b.fov, u);
    if (f.t >= f.dur) cam.fly = null;
  }
  if (v.ox || v.oy) { g.az -= v.ox * 1.7 * sp * k0; g.pol = clamp(g.pol + v.oy * 1.1 * sp * k0, .02, 1.56); cam.fly = null; }
  if (v.px || v.py || v.crane) {
    const s = g.dist * .85 * sp * k0, rx = Math.cos(g.az), rz = -Math.sin(g.az), fx = -Math.sin(g.az), fz = -Math.cos(g.az);
    const dx = (v.px * rx + -v.py * fx) * s, dz = (v.px * rz + -v.py * fz) * s, dy = -v.crane * s * .6;
    if (cam.lock) cam.lockOff.x += dx, cam.lockOff.z += dz, cam.lockOff.y += dy; else { g.x += dx; g.z += dz; g.y += dy; }
    cam.fly = null;
  }
  if (v.zoom) { g.dist = clamp(g.dist * Math.exp(v.zoom * 1.3 * sp * k0), 6, 5000); cam.fly = null; }
  if (cam.lock && !cam.fly) { const p = trolleyWorld(S.t); g.x = p.x + cam.lockOff.x; g.y = p.y + cam.lockOff.y; g.z = p.z + cam.lockOff.z; }
  const k = 1 - Math.exp(-rateOf() * k0), kl = cam.lock ? 1 - Math.exp(-Math.max(rateOf(), 10) * k0) : k;
  c.x += (g.x - c.x) * kl; c.y += (g.y - c.y) * kl; c.z += (g.z - c.z) * kl;
  c.dist = Math.exp(lerp(Math.log(Math.max(.01, c.dist)), Math.log(g.dist), k)); c.az += wrapPi(g.az - c.az) * k; c.pol += (g.pol - c.pol) * k;
  const fov = camera.fov + (g.fov - camera.fov) * k; if (Math.abs(fov - camera.fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
function zoomBy(f, at) {   // f < 1 zooms in; at = world point to zoom toward
  goFree(true); const g = cam.goal; const nd = clamp(g.dist * f, 6, 5000), real = nd / g.dist; cam.fly = null;
  if (at && !cam.lock) { g.x += (at.x - g.x) * (1 - real); g.y += (at.y - g.y) * (1 - real); g.z += (at.z - g.z) * (1 - real); }
  g.dist = nd;
}
function flyTo(b, dur = 1.1) { goFree(true); const g = cam.goal; cam.fly = { a: { ...g }, b: Object.assign({ ...g }, b), t: 0, dur }; }
function viewPreset(kind) {
  const g = cam.goal, at = cam.lock ? trolleyWorld(S.t) : new T.Vector3(g.x, g.y, g.z);
  const fit = X.fit(), d = kind === "top" ? fit * .95 : g.dist;
  if (kind === "top") flyTo({ x: 0, y: 0, z: 0, dist: d, az: 0, pol: .02 });
  else if (kind === "front") flyTo({ az: 0, pol: 1.25 });
  else if (kind === "side") flyTo({ az: Math.PI / 2, pol: 1.25 });
  else if (kind === "iso") flyTo({ az: -.785, pol: .96 });
  else if (kind === "reset") { cam.lock = false; flyTo({ x: 0, y: 30, z: 0, dist: X.fit() * 1.05, az: -.785, pol: .96, fov: BASE_FOV }); }
  else if (kind === "trolley") { const p = trolleyWorld(S.t); flyTo({ x: p.x, y: p.y + 2, z: p.z, dist: 120, pol: Math.min(g.pol, 1.05) }); }
  return at;
}
function focusPlan(x, y, plate, dist) { const w = MF.W(x, y, S.stack, 2); flyTo({ x: w.x, y: w.y, z: w.z, dist: dist || Math.min(cam.goal.dist, 260) }, .8); }
function setLock(on) {
  goFree(true); cam.lock = on;
  if (on) { const p = trolleyWorld(S.t); cam.lockOff.set(0, 2, 0); const g = cam.goal; cam.fly = null; g.dist = Math.min(g.dist, 220); g.x = p.x; g.y = p.y + 2; g.z = p.z; }
}
function currentPose() { const c = S.c; return { x: c.x, y: c.y, z: c.z, dist: c.dist, az: c.az, pol: c.pol, fov: camera.fov }; }
