// Narrow trolley aisles: sweep the trolley footprint along every straight leg of every path (corners and the last 3 m before a
// stop are skipped: the trolley slows and turns there) and list each layout object closer than --under metres (default 0.5).
// Usage: node tools/v7/aisle-scan.mjs <scene.json> [--under 0.5] [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { loadSceneCore, readProjects, layoutFor } from "./scene-node.mjs";
import { STAGE } from "./mf-commands.mjs";
const args = process.argv.slice(2), file = args[0], opt = {}; for (let i = 1; i < args.length; i += 2) opt[args[i].replace(/^--/, "")] = args[i + 1];
const UNDER = +(opt.under || 0.5), U = 0.3;
if (!Number.isFinite(UNDER) || UNDER <= 0) throw new Error("--under must be positive metres");
const SC = loadSceneCore(), P = readProjects(opt.player || `dist/Material_Flow_Player_v${STAGE}.html`), scene = JSON.parse(readFileSync(file, "utf8"));
const report = SC.validate(scene, layoutFor(P, scene.project)); if (report.errors.length) throw new Error("scene must validate before an aisle scan: " + report.errors[0].msg);
const layout = layoutFor(P, scene.project), res = SC.toInternal(JSON.parse(JSON.stringify(scene)), layout);
const found = new Map();
res.data.flows.forEach((f) => f.steps.forEach((s) => {
  if (!Array.isArray(s.path)) return; const node = res.data.nodes[s.node], plate = node ? node.plate : "1F", sol = SC.solidsU(layout, plate, res.data.devices), Pt = s.path;
  for (let k = 1; k < Pt.length; k++) {
    const [ax, ay] = Pt[k - 1], [bx, by] = Pt[k], L = Math.hypot(bx - ax, by - ay); if (L * U < 1) continue; const hd = Math.atan2(bx - ax, by - ay);
    const skipEnd = k === Pt.length - 1 ? 3 / U : 0, skip0 = 3.2 / U;   // corners: the trolley turns on the spot; stops: it slows
    for (let d = skip0; d <= L - Math.max(skipEnd, skip0) + 1e-9; d += 0.25 / U) {
      const x = ax + (bx - ax) * d / L, y = ay + (by - ay) * d / L;
      for (const o of sol.near(x, y, 10)) { if (o.device) continue; const g = SC.gap(x, y, hd, o.r) * U; if (g >= UNDER) continue; const key = o.what; const prev = found.get(key); if (!prev || g < prev.g) found.set(key, { what: o.what, g, x: x * U, y: y * U, plate, horizontal: Math.abs(by - ay) < 1e-6, path: f.id, step: s.sceneId, rect: o.r.map((v) => +(v * U).toFixed(2)) }); }
    }
  }
}));
const list = [...found.values()].sort((a, b) => a.g - b.g);
for (const n of list) console.log(`${n.g.toFixed(2)} m  ${n.what.padEnd(16)} ${n.plate} at (${n.x.toFixed(1)}, ${n.y.toFixed(1)})  ${n.path}/${n.step}  ${n.horizontal ? "east-west" : "north-south"} leg`);
console.log(`${list.length} object(s) closer than ${UNDER} m to a straight leg`);
if (opt.json) writeFileSync(opt.json, JSON.stringify(list, null, 1));
