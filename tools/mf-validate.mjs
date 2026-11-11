// Validates Material Flow scene files (format "mf-scene") against the built-in layout of their tab. Run it after every edit.
// Usage: node tools/mf-validate.mjs <scene.json> [more.json ...] [--player dist/Material_Flow_Player_v7.1.html] [--json]
// Exit code: 0 = no errors (warnings allowed), 1 = errors, 2 = could not read a file.
import { readFileSync, existsSync } from "node:fs";
import { loadSceneCore, readProjects, layoutFor } from "./v7/scene-node.mjs";

const args = process.argv.slice(2), pi = args.indexOf("--player"), asJson = args.includes("--json");
const player = pi >= 0 ? args[pi + 1] : ["dist/Material_Flow_Player_v7.1.html", "dist/Material_Flow_Player_v6.html"].find(existsSync);
const files = args.filter((a, i) => !a.startsWith("--") && !(pi >= 0 && i === pi + 1));
if (!files.length || !player) { console.log("Usage: node tools/mf-validate.mjs <scene.json> [...] [--player <player.html>] [--json]"); process.exit(2); }
const SC = loadSceneCore(), P = readProjects(player);
let code = 0; const report = [];
for (const f of files) {
  let scene; try { scene = JSON.parse(readFileSync(f, "utf8")); } catch (e) { console.log(`${f}: cannot read: ${e.message}`); code = Math.max(code, 2); continue; }
  if (!P[scene.project]) { console.log(`${f}: project ${JSON.stringify(scene.project)} is not a tab of ${player} (tabs: ${Object.keys(P).join(", ")})`); code = Math.max(code, 1); continue; }
  const t0 = Date.now(), r = SC.validate(scene, layoutFor(P, scene.project));
  report.push({ file: f, ...r });
  if (!asJson) {
    console.log(`${f}: ${r.errors.length ? "FAIL" : "OK"} - ${r.errors.length} error(s), ${r.warnings.length} warning(s); ${r.stats ? `${r.stats.paths} paths, ${r.stats.steps} steps, ${r.stats.stops} stops, ${r.stats.devices} devices` : ""} (${Date.now() - t0} ms)`);
    for (const e of r.errors) console.log(`  ERROR   ${e.where}: ${e.msg}`);
    for (const w of r.warnings) console.log(`  warning ${w.where}: ${w.msg}`);
  }
  if (r.errors.length) code = Math.max(code, 1);
}
if (asJson) console.log(JSON.stringify(report, null, 1));
process.exit(code);
