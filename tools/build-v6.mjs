// Builds dist/Material_Flow_Player_v6.html from the owner's approved V4 file (built on another PC; its HTML is the source).
// V4's look stays as it is (owner, 2026-11-10: "do not change the graphic"). Each change is a small patch that must match
// exactly once, so a different V4 fails loudly instead of building something wrong. Sources of the changes:
//   tools/v5/inj1-data.mjs   INJ 1: the owner's true trolley path, nodes, devices, connectors (from the latest slide)
//   tools/v5/devices.js      player add-on: PC workstations, auto RFID gates with radar waves, manual scanners, event chips
//   tools/v5/device-dims.mjs device sizes shared with the collision check (tools/v5-check.mjs)
// Usage: node tools/build-v6.mjs [in=dist/Material_Flow_Player_v4.html] [out=dist/Material_Flow_Player_v6.html]
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { K, M, DIMS, TROLLEY } from "./v5/device-dims.mjs";
import { applyEdits } from "./v6/edits.mjs";
import { reviewPatches } from "./v6/player-patches.mjs";
// V6 (2026-11-10): all four tabs from tools/v6/make.mjs (run it first), light-shaft cones removed, camera without flip-flop.

const [inFile = "dist/Material_Flow_Player_v4.html", outFile = "dist/Material_Flow_Player_v6.html"] = process.argv.slice(2);
if (resolve(inFile) === resolve(outFile) || resolve(outFile) === resolve("dist/Material_Flow_Player_v4.html")) throw new Error("V4 is read-only: choose a separate V6 output");
let html = readFileSync(inFile, "utf8");
const once = (src, find, repl, what) => {
  const n = src.split(find).length - 1;
  if (n !== 1) throw new Error(`patch "${what}": expected exactly one match, found ${n}`);
  return src.replace(find, () => repl);
};

// ---------- 1. data (the project script): INJ 1 path and devices, roof steel removed everywhere ----------
const dataStart = html.indexOf("var P = {"), lineEnd = html.indexOf("\n", dataStart);
if (dataStart < 0 || lineEnd < 0 || html.split("var P = {").length !== 2) throw new Error("expected exactly one project data block");
const dataLine = html.slice(dataStart, lineEnd), dataEnd = dataStart + dataLine.lastIndexOf("}");   // the line is: var P = {...};
const P = applyEdits(JSON.parse(html.slice(dataStart + "var P = ".length, dataEnd + 1)));   // rooms out, INJ 2 2F extended, no roof
const GEN = JSON.parse(readFileSync("private/v6/projects.json", "utf8"));   // tools/v6/make.mjs: the owner's configured paths + devices
for (const [tab, g] of Object.entries(GEN)) {
  const d = P[tab].data;
  d.nodes = g.nodes; d.flows = g.flows; d.conns = g.conns; d.devices = g.devices;
  d.orderConfirmed = true;                       // the owner gave every order on 2026-11-10
}
html = html.slice(0, dataStart) + "var P = " + JSON.stringify(P) + html.slice(dataEnd + 1);
html = once(html, "<script>window.MF_TROLLEY=", "<script>window.MF_DEVICE_DIMS=" + JSON.stringify({ K, M, DIMS, TROLLEY }) + ";window.MF_TROLLEY=", "device dims");

// ---------- 2. player patches ----------
const dev = readFileSync(new URL("./v5/devices.js", import.meta.url), "utf8");
const P7 = [
  ["dwell = stationary ? DWELL - STATION_T : DWELL;", "dwell = s.dwell != null ? s.dwell : stationary ? DWELL - STATION_T : DWELL;", "per-step dwell"],
  ["({ high: 1, medium: .8, low: .65 }[S.quality])", "({ high: .85, medium: .8, low: .65 }[S.quality])", "High render scale .85"],
  ["every: 2, tick: 0", "every: 3, tick: 0", "reflection 20 Hz"],
  ["hide = [grid, beacon, contactBlob, ...origs, ...atmosObjects, ...routeFlows.flatMap(r => r.meshes)];", "hide = [grid, beacon, contactBlob, ...origs, ...atmosObjects, ...routeFlows.flatMap(r => r.meshes), ...(DEV ? DEV.effects : [])];", "effects out of the reflection"],
  ["      if (b && !b.isEmpty()) boxes.push({ minX: b.min.x, minY: b.min.y, minZ: b.min.z, maxX: b.max.x, maxY: b.max.y, maxZ: b.max.z });\n    }",
    "      if (b && !b.isEmpty()) boxes.push({ minX: b.min.x, minY: b.min.y, minZ: b.min.z, maxX: b.max.x, maxY: b.max.y, maxZ: b.max.z });\n    }\n    if (DEV) for (const g of Object.values(DEV.groups)) g.traverse((o) => { if (!o.isInstancedMesh) return; o.computeBoundingBox(); const b = o.boundingBox; if (b && !b.isEmpty()) boxes.push({ minX: b.min.x, minY: b.min.y, minZ: b.min.z, maxX: b.max.x, maxY: b.max.y, maxZ: b.max.z }); });   // V5 gates and PCs", "chase envelope includes devices"],
  // camera (Astra's review): the guided goal stays near the trolley, the view is checked along the whole segment, faster at 3x
  ["const length = segmentA.distanceTo(segmentB); p.lerp(segmentA.lerp(segmentB, .5), .65); share = .35;", "const length = segmentA.distanceTo(segmentB); p.lerp(segmentA.lerp(segmentB, .5), .3); share = .7;", "guided goal near the trolley"],
  ["const camScale = () => (S.playing && S.speed > 1 ? 1 + (S.speed - 1) * .22 : 1);", "const camScale = () => (S.playing && S.speed > 1 ? 1 + (S.speed - 1) * .5 : 1);", "stiffer springs at speed"],
  ["const blend = 1 - Math.exp(-dt / FF_TAU);", "const blend = 1 - Math.exp(-dt / (S.speed > 1.5 ? .07 : FF_TAU));", "faster feed-forward at speed"],
  ["score=sightBlocked(plate,p,az,reach,eyeH)+Math.abs(wrapPi(az-base))*.001;", "score=(sightBlocked(plate,p,az,reach,eyeH)+sightBlocked(plate,a,az,reach,eyeH)+sightBlocked(plate,b,az,reach,eyeH))/3+Math.abs(wrapPi(az-base))*.001;", "sight checked along the whole segment"],
  ["      const targetAz = S.cam === \"follow\" ? -.55 : aisleAz(cur,lp,d);",
    "      if (S.cam === \"guided\" && share < 1) {   // V5: never let the trolley drift to the screen edge: pull the goal onto it\n        proj(worldFromLot(lp, S.stack, guardA), guardOut); const nx = guardOut[0] / innerWidth * 2 - 1, ny = guardOut[1] / innerHeight * 2 - 1, off = Math.max(Math.abs(nx), Math.abs(ny));\n        if (guardOut[2] < 1 && off > .55) { const k = clamp((off - .55) / .25, 0, 1); p.lerp(guardA, k); share = lerp(share, 1, k); }\n      }\n      const targetAz = S.cam === \"follow\" ? -.55 : aisleAz(cur,lp,d);", "screen-edge guard"],
  // sightBlocked(): V4 scored a view by the SHARE of blocked samples along the whole ray, so a wall right beside the trolley (which
  // really hides it) counted ~1/60 and the camera chose that side. Any blocked sample now costs a full point.
  ["    return bad / Math.max(1, n);\n  }\n  function cineAz(e) {", "    return bad ? 1 + bad / Math.max(1, n) : 0;\n  }\n  function cineAz(e) {", "any occluder blocks the view"],
  ["  function setWant() {", "  const guardA = new T.Vector3(), guardOut = [0, 0, 0];\n" + readFileSync(new URL("./v5/sight.js", import.meta.url), "utf8") + "\n  function setWant() {", "guard vectors + sight line"],
  ["let guidedAz = 0, guidedReady = false, frameDt = 1 / 60;", "let guidedAz = 0, guidedPol = .94, guidedReady = false, frameDt = 1 / 60;", "guided polar state"],
  ["      if (!guidedReady || flat()) { guidedAz = targetAz; guidedReady = true; } else guidedAz += wrapPi(targetAz - guidedAz) * (1 - Math.exp(-frameDt * 1.3 * camScale()));\n      aim(p.x, p.y, p.z, flat() ? d * 1.5 : d, flat() ? 0 : guidedAz, flat() ? .001 : .94);",
    "      const vis = !flat() && S.cam === \"guided\" ? SIGHT.choose(p, d, targetAz, guidedAz, lp) : null;   // V5: an angle that SEES the trolley\n      const goalAz = vis ? vis.az : targetAz, goalPol = vis ? vis.pol : .94, rate = vis && vis.forced ? 3.2 : 1.3;\n      if (!guidedReady || flat()) { guidedAz = goalAz; guidedPol = goalPol; guidedReady = true; } else { guidedAz += wrapPi(goalAz - guidedAz) * (1 - Math.exp(-frameDt * rate * camScale())); guidedPol += (goalPol - guidedPol) * (1 - Math.exp(-frameDt * 2.6 * camScale())); }\n      aim(p.x, p.y, p.z, flat() ? d * 1.5 : d, flat() ? 0 : guidedAz, flat() ? .001 : guidedPol);", "guided camera sees the trolley"],
  ["      aim(p.x, p.y + 4, p.z, frameLot.lift != null ? 180 : 120, az, 1.3); leadVelocity(frameLot, cur, 1);",
    "      const cd = frameLot.lift != null ? 180 : 120; aim(p.x, p.y + 4, p.z, cd, az, frameLot.lift != null ? 1.3 : SIGHT.chasePol(p, cd, az, frameLot)); leadVelocity(frameLot, cur, 1);   // V5: rise when blocked", "chase rises when blocked"],
  ["  function seek(t) { S.t = clamp(t, 0, F().total); cine.shot=\"\"; cine.cut=true; last = performance.now(); }", "  function seek(t) { S.t = clamp(t, 0, F().total); cine.shot=\"\"; cine.cut=true; last = performance.now(); SIGHT.reset(); }", "seek resets the sight choice"],
  ["  $(\"title\").textContent = D.slide.title;", "  $(\"title\").textContent = D.slide.title; document.querySelector(\".tag\")?.toggleAttribute(\"hidden\", !!D.orderConfirmed);", "order confirmed tag"],
  ["  window.MF = { glideAt,", "  var DEV;\n" + dev + "\n  window.MF = { devices: DEV, sight: SIGHT, glideAt,", "device add-on"],
];
for (const [a, b, what] of [...P7, ...reviewPatches]) html = once(html, a, b, what);

// governor: replace V4's block (it ignored a manual quality and let isolated misses cancel out) with a missed-vsync ratio
const g0 = html.indexOf("    governorHold -= raw;"), g1 = html.indexOf("    requestAnimationFrame(tick);", g0);
if (g0 < 0 || g1 < 0 || g1 - g0 > 1200) throw new Error("governor block not found");
html = once(html, html.slice(g0, g1), `    // Sample playback, but apply a pending downgrade only while paused. No resolution hunting or playback reallocations.
    governorHold -= raw;
    if (GOV_ON && S.playing && !document.hidden && raw < .1 && governorHold <= 0) {
      gov.n++; if (raw > .025) gov.miss++; gov.t += raw;
      if (gov.t >= 2) {
        const ratio = gov.miss / Math.max(1, gov.n);
        if (ratio > .05 && resolutionScale > .75) gov.pending = Math.max(.75, +(resolutionScale - .05).toFixed(2));
        gov.n = gov.miss = gov.t = 0;
      }
    }
    if (GOV_ON && !S.playing && gov.pending != null) {
      resolutionScale = gov.pending; gov.pending = null; resize(); governorHold = 3;
      metrics.governor.push({ t: +S.t.toFixed(1), scale: resolutionScale });
    }
`, "governor timing block");
html = once(html, "  function tick(now) {", "  const gov = { n: 0, miss: 0, t: 0, pending: null }, GOV_ON = query.get(\"gov\") !== \"0\"; metrics.governor = [];\n  function tick(now) {", "governor state");

// ---------- 3. page shell: title, speeds up to 3x, no roof button, chips for the new kinds ----------
html = once(html, "<title>Material Flow Player V4</title>", "<title>Material Flow Player V6</title>", "title");
// owner (image 11): remove the pale light-shaft cones (V4 created DFAtmos even in the bright Studio look)
html = once(html, "const atmos = window.DFAtmos ? window.DFAtmos.create(T, scene, { lamps, shafts: { height: 46, top: 1.4, bottom: 13, intensity: .05 }, dust: { count: 900, box: [620, 70, 620], size: .16, alpha: .3 } }) : null;", "const atmos = null;   // V6: no light shafts / dust (owner)", "no light shafts");
html = once(html, '<option value="4">4x</option><option value="6">6x</option><option value="8">8x</option>', "", "speeds up to 3x");
html = once(html, "Slower / faster playback (0.5x to 8x)", "Slower / faster playback (0.5x to 3x)", "help speeds");
html = once(html, "<tr><td>R</td><td>Roof on or off</td></tr>", "", "help roof");
const css = `#roofBtn{display:none}
.v5toast{position:absolute;left:0;top:0;padding:3px 10px;border-radius:11px;background:var(--c,#1f9d6b);color:#fff;font:600 12px 'Segoe UI Variable','Segoe UI',system-ui,sans-serif;white-space:nowrap;box-shadow:0 2px 8px #0006;pointer-events:none;will-change:transform;z-index:3}
.mk.scan{border-radius:3px;background:repeating-linear-gradient(135deg,#C00000 0 3px,#fff 3px 5px)}
.mk.mapping{border-radius:2px}
.mk.quality{clip-path:polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%)}
`;
html = once(html, "</style>", css + "</style>", "styles");

writeFileSync(outFile, html);
console.log(`${outFile}: ${(html.length / 1048576).toFixed(2)} MB, sha256 ${createHash("sha256").update(html).digest("hex").slice(0, 16)}; ${Object.values(GEN).reduce((n, g) => n + g.flows.length, 0)} paths, ${Object.values(GEN).reduce((n, g) => n + g.devices.length, 0)} devices; roofs removed in ${Object.keys(P).length} projects`);
