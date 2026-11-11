// Scene operations for the agent CLI (tools/mf.mjs): pure data in, data out (metres, seconds). They mirror the Studio's buttons:
// straighten, auto-route, fix links, camera keys from a plain description, captions, numbers (same motion model as the player),
// and a structural diff of two scenes.
import { loadSceneCore, layoutFor } from "./scene-node.mjs";

export const SC = loadSceneCore();
const U = 0.3, M = 1 / U;
const clone = (o) => JSON.parse(JSON.stringify(o));
const r3 = (v) => Math.round(v * 1000) / 1000;

/* ---------- motion model (the player's: tools/v7/engine-patches.mjs segment speed; V6 buildSchedule) ---------- */
const RAMP_T = 0.25, TURN_T = 0.3, DWELL = 0.7, STATION_T = 0.01, LIFT_T = 6, SCAN_T = 1.8, INTRO = 7;
function legTime(Lm, V) { const full = V * RAMP_T; if (Lm >= full) return 2 * RAMP_T + (Lm - full) / V; return 2 * RAMP_T * Math.sqrt(Lm / full); }
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** numbers(scene, P) -> [{ id, name, metres, seconds, trolleys, steps: [{ id, title, metres, seconds }] }] (one trip, no intro) */
export function numbers(scene, P) {
  const L = layoutFor(P, scene.project), conv = SC.toInternal(clone(scene), L).data;
  const scanners = conv.devices.filter((d) => d.type === "rfid-manual" && d.routeBound && d.node == null);
  return conv.flows.map((f, fi) => {
    let h, metres = 0, seconds = 0; const steps = [];
    f.steps.forEach((s, si) => {
      const sid = scene.paths[fi].steps[si].id; let m = 0, t = 0;
      if (s.lift) t = LIFT_T + (s.dwell != null ? s.dwell : DWELL);
      else if (Array.isArray(s.path)) {
        const pts = SC.simplify(s.path); let moved = false;
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1], b = pts[k], lp = Math.hypot(b[0] - a[0], b[1] - a[1]); if (lp < 1e-4) continue;
          const hh = Math.atan2(b[0] - a[0], b[1] - a[1]); if (h !== undefined) t += TURN_T * Math.abs(wrapPi(hh - h)) / (Math.PI / 2); h = hh;
          const plate = conv.nodes[s.node].plate, cuts = scanners.filter((d) => d.plate === plate).map((d) => { const dx = b[0] - a[0], dy = b[1] - a[1], u = ((d.lane[0] - a[0]) * dx + (d.lane[1] - a[1]) * dy) / (lp * lp); return u > 1e-5 && u <= 1 + 1e-5 && Math.hypot(a[0] + u * dx - d.lane[0], a[1] + u * dy - d.lane[1]) <= .02 ? Math.min(1, u) : null; }).filter((u) => u != null).sort((x, y) => x - y);
          let before = 0; for (const u of [...cuts, 1]) { if (u - before > 1e-6) t += legTime(lp * (u - before) * U, s.speed || 4); if (u < 1) t += SCAN_T; before = u; }
          m += lp * U; moved = true;
        }
        t += moved ? (s.dwell != null ? s.dwell : DWELL) : STATION_T + (s.dwell != null ? s.dwell : DWELL - STATION_T);
      } else t = STATION_T + (s.dwell != null ? s.dwell : DWELL - STATION_T);
      metres += m; seconds += t; steps.push({ id: sid, title: s.title, metres: r3(m), seconds: r3(t) });
    });
    return { id: f.id, name: f.name, metres: r3(metres), seconds: r3(seconds), trolleys: f.trolleys || 1, steps };
  });
}
export const tripsPerShift = (n, hours = 8) => Math.floor(hours * 3600 / Math.max(1, n.seconds)) * n.trolleys;
export const storyStart = (scene, P, pathId, stepId, moment = "arrive") => {   // story seconds of a step moment (intro included)
  const n = numbers(scene, P).find((p) => p.id === pathId); if (!n) throw new Error("unknown path " + pathId);
  let t = INTRO; for (const s of n.steps) { if (s.id === stepId) return moment === "start" ? t : moment === "leave" ? t + s.seconds : t + Math.max(0, s.seconds - 0.7); t += s.seconds; }
  throw new Error("unknown step " + stepId);
};

/* ---------- path tools (same rules as the Studio buttons) ---------- */
const elbow = (a, b, hFirst) => (Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9 ? [a, b] : hFirst ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b]);
function orthogonalize(P) { const out = [P[0].slice()]; for (let k = 1; k < P.length; k++) { const a = out[out.length - 1], b = P[k]; if (Math.abs(a[0] - b[0]) > 1e-9 && Math.abs(a[1] - b[1]) > 1e-9) { const prevH = out.length > 1 && Math.abs(out[out.length - 2][1] - a[1]) < 1e-9; out.push(prevH ? [a[0], b[1]] : [b[0], a[1]]); } out.push(b.slice()); } return SC.simplify(out); }
/** straightenPoints(points metres, jog metres = 3): remove short jogs between parallel legs, square slanted legs; ends stay */
// drop repeated points and every middle point on a straight horizontal / vertical run, also when the run doubles back
// (a jog going 0.15 m south and then 29 m north): after this the legs alternate horizontal / vertical
const EPS = 1e-6, same = (a, b) => Math.abs(a - b) < EPS;
function tidy(P) {
  let Q = P.map((p) => [r3(p[0]), r3(p[1])]), changed = true;
  while (changed) { changed = false; for (let k = 1; k < Q.length - 1; k++) { const a = Q[k - 1], b = Q[k], c = Q[k + 1]; if ((same(a[0], b[0]) && same(a[1], b[1])) || (same(a[0], b[0]) && same(b[0], c[0])) || (same(a[1], b[1]) && same(b[1], c[1]))) { Q.splice(k, 1); changed = true; break; } } }
  if (Q.length === 2 && same(Q[0][0], Q[1][0]) && same(Q[0][1], Q[1][1])) Q.pop();
  return Q;
}
export function straightenPoints(points, jog = 3) {
  let Q = tidy(orthogonalize(tidy(points)));
  for (let guard = 0; guard < 60; guard++) {
    let changed = false;
    for (let k = 0; k < Q.length - 1; k++) {
      const a = Q[k], b = Q[k + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len >= jog || len < EPS) continue;
      // remove the short leg a-b by sliding the next leg (b..c) back by b-a; c-d is parallel to a-b, so it stays square
      if (k + 2 <= Q.length - 2) { const dx = a[0] - b[0], dy = a[1] - b[1]; Q[k + 1] = a.slice(); Q[k + 2] = [Q[k + 2][0] + dx, Q[k + 2][1] + dy]; }
      // at the end: slide the previous leg (z..a) forward by b-a instead (the end point never moves)
      else if (k - 1 >= 1) { const dx = b[0] - a[0], dy = b[1] - a[1]; Q[k] = b.slice(); Q[k - 1] = [Q[k - 1][0] + dx, Q[k - 1][1] + dy]; }
      else continue;
      Q = tidy(Q); changed = true; break;
    }
    if (!changed) break;
  }
  Q = tidy(orthogonalize(Q));   // guarantee: no slanted leg leaves this function
  return Q.map((p) => [r3(p[0]), r3(p[1])]);
}
const findPath = (scene, id) => { const p = scene.paths.find((q) => q.id === id); if (!p) throw new Error(`unknown path ${id} (paths: ${scene.paths.map((q) => q.id).join(", ")})`); return p; };
const findStep = (p, id) => { const s = p.steps.find((q) => q.id === id); if (!s) throw new Error(`unknown step ${id} in ${p.id} (steps: ${p.steps.map((q) => q.id).join(", ")})`); return s; };
/** straighten(scene, pathId, stepId?): returns { changed: [stepIds] }; keeps a step as it is when straight would collide */
export function straighten(scene, P, pathId, stepId) {
  const p = findPath(scene, pathId), changed = [], kept = [];
  for (const s of stepId ? [findStep(p, stepId)] : p.steps) {
    if (!s.route || s.route.type !== "points" || s.route.points.length < 3) continue;
    const old = s.route.points, nu = straightenPoints(old);
    if (nu.length === old.length && nu.every((p, k) => Math.abs(p[0] - old[k][0]) < 0.002 && Math.abs(p[1] - old[k][1]) < 0.002)) continue;   // same within 2 mm: leave the exact points alone
    const before = clashCount(scene, P, p.id, s.id); s.route.points = nu;
    if (clashCount(scene, P, p.id, s.id) > before) { s.route.points = old; kept.push(s.id); } else changed.push(s.id);
  }
  return { changed, kept };
}
const clashCount = (scene, P, pathId, stepId) => SC.validate(scene, layoutFor(P, scene.project)).errors.filter((e) => e.where.startsWith(`paths[${pathId}].steps[${stepId}].route`) && /trolley/.test(e.msg)).length;
/** route(scene, pathId, stepId): replace the step's route by the router's clear path, written as points */
export function route(scene, P, pathId, stepId) {
  const p = findPath(scene, pathId), s = findStep(p, stepId), i = p.steps.indexOf(s); if (i === 0) throw new Error("the first step has no previous point");
  s.route = { type: "auto" }; const conv = SC.toInternal(clone(scene), layoutFor(P, scene.project));
  const e = conv.issues.find((x) => x.where.includes(`[${stepId}]`)); if (e) throw new Error(e.msg);
  const path = conv.data.flows[scene.paths.indexOf(p)].steps[i].path; s.route = { type: "points", points: path.map((q) => [r3(q[0] * U), r3(q[1] * U)]) };
  return s.route.points;
}
/** fixLinks(scene): every points-step that no longer starts at the previous end / ends at its stop is auto-routed */
export function fixLinks(scene, P) {
  const r = SC.validate(scene, layoutFor(P, scene.project)), fixed = [];
  for (const e of r.errors) { const m = /^paths\[([^\]]+)\]\.steps\[([^\]]+)\]\.route\.points/.exec(e.where); if (m && /previous step ends|last point must be the stop/.test(e.msg)) { try { route(scene, P, m[1], m[2]); fixed.push(m[1] + "/" + m[2]); } catch (x) { fixed.push(m[1] + "/" + m[2] + " (failed: " + x.message + ")"); } } }
  return fixed;
}

/* ---------- director data from plain words ---------- */
/** cameraKey({ at (story s), lookAt: "trolley" | "stop:<id>" | [x, y], distance m, heading deg (direction the camera looks: 0 north,
    clockwise), tilt deg (90 = straight down), lens mm, ease }) -> a Director key in engine units (what the Studio stores) */
export function cameraKey(scene, P, o) {
  for (const [name, fallback] of [["distance",60],["heading",0],["tilt",40],["lens",48],["at",0]]) { if (o[name] == null) o[name] = fallback; if (!Number.isFinite(+o[name])) throw new Error("camera " + name + " must be finite"); o[name] = +o[name]; }
  if (o.at < 0 || o.distance <= 0 || o.lens <= 0 || o.tilt < 0 || o.tilt > 90) throw new Error("camera needs nonnegative time, positive distance/lens and tilt 0 to 90");
  const d = P[scene.project].data, [CX, CY] = d.center || [480, 290], dist = (o.distance || 60) * M, az = -(o.heading || 0) * Math.PI / 180, pol = (90 - (o.tilt == null ? 40 : o.tilt)) * Math.PI / 180, fov = 2 * Math.atan(12 / (o.lens || 48)) * 180 / Math.PI;
  const k = { id: "key-" + Math.random().toString(36).slice(2, 8), t: +(+o.at).toFixed(2), dist: r3(dist), az: r3(az), pol: r3(Math.max(.001, Math.min(Math.PI / 2, pol))), fov: r3(fov), ease: o.ease || "smooth" };
  if (!o.lookAt || o.lookAt === "trolley") Object.assign(k, { follow: true, ox: 0, oy: 2, oz: 0, x: 0, y: 0, z: 0 });
  else { let xy = o.lookAt; if (typeof xy === "string") { const s = scene.stops.find((q) => "stop:" + q.id === xy || q.id === xy); if (!s) throw new Error("unknown stop " + xy); if (P[scene.project].data.plates[s.floor].lift) throw new Error("upper-floor stops: use lookAt trolley (the 2nd floor moves during rides)"); xy = [s.x, s.y]; } if (!Array.isArray(xy) || xy.length !== 2 || !xy.every(Number.isFinite)) throw new Error("camera lookAt must be trolley, stop:<id> or a finite [x, y] pair"); Object.assign(k, { follow: false, x: r3(xy[0] * M - CX), y: 0, z: r3(xy[1] * M - CY) }); }
  return k;
}
export function addKey(scene, pathId, key) { findPath(scene, pathId); const d = (scene.director ||= {})[pathId] ||= { keys: [], caps: [] }; d.keys = (d.keys || []).filter((q) => Math.abs(q.t - key.t) > .05); d.keys.push(key); d.keys.sort((a, b) => a.t - b.t); return key; }
export function addCaption(scene, pathId, c) {
  findPath(scene, pathId); const d = (scene.director ||= {})[pathId] ||= { keys: [], caps: [] }; d.caps ||= [];
  const cap = { id: "cap-" + Math.random().toString(36).slice(2, 8), t0: +c.from, t1: +c.to, title: c.title, text: c.text, pos: c.place || "lower", style: c.style || "glass", size: c.size || 1 };
  if (!(cap.t1 > cap.t0)) throw new Error("caption: to must be after from"); d.caps.push(cap); return cap;
}

/* ---------- diff ---------- */
export function diff(a, b, P) {
  const out = [], byId = (l) => Object.fromEntries((l || []).map((x) => [x.id, x]));
  const cmpList = (name, la, lb, fmt) => { const A = byId(la), B = byId(lb); for (const id of Object.keys(A)) if (!B[id]) out.push(`- ${name} ${id} removed`); for (const id of Object.keys(B)) if (!A[id]) out.push(`+ ${name} ${id} added`); else if (JSON.stringify(A[id]) !== JSON.stringify(B[id])) out.push(`~ ${name} ${id} changed${fmt ? ": " + fmt(A[id], B[id]) : ""}`); };
  const mv = (x, y) => { const p = x.at || [x.x, x.y], q = y.at || [y.x, y.y]; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); return d > .005 ? `moved ${d.toFixed(2)} m` : "properties"; };
  cmpList("stop", a.stops, b.stops, mv); cmpList("device", a.devices, b.devices, mv); cmpList("object", a.objects, b.objects, mv); cmpList("path", a.paths, b.paths, null);
  if (JSON.stringify(a.layoutEdits || []) !== JSON.stringify(b.layoutEdits || [])) out.push(`~ layoutEdits: ${(a.layoutEdits || []).length} -> ${(b.layoutEdits || []).length}`);
  if (JSON.stringify(a.layoutAdds || []) !== JSON.stringify(b.layoutAdds || [])) out.push(`~ layoutAdds: ${(a.layoutAdds || []).length} -> ${(b.layoutAdds || []).length}`);
  if (JSON.stringify(a.director || {}) !== JSON.stringify(b.director || {})) out.push("~ director (keys / captions) changed");
  if (P) { const na = numbers(a, P), nb = numbers(b, P); for (const p of nb) { const q = na.find((x) => x.id === p.id); if (q && (Math.abs(q.metres - p.metres) > .05 || Math.abs(q.seconds - p.seconds) > .05)) out.push(`# ${p.id}: ${q.metres.toFixed(1)} m -> ${p.metres.toFixed(1)} m, ${q.seconds.toFixed(1)} s -> ${p.seconds.toFixed(1)} s`); } }
  return out;
}
