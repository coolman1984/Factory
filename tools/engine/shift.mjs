// Shift run on the Factory Engine (V8.2): all paths of a scene at once for a shift, several trolleys per path, shared lifts,
// estimated empty returns. Compares with today's geometric number (shift / one-way trip time x trolleys).
// Usage: node tools/engine/shift.mjs [scene files...] [--hours 8] [--lift-cars 1] [--trolleys N] [--spread 0.1] [--seed 1] [--no-return] [--json]
//        --spread f: travel and wait times vary by up to +-f (triangular, seeded); an assumption until times are measured
//        (default scenes: private/v7/scenes/*.scene.json; output stays on this PC)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { loadSceneCore, readProjects, layoutFor } from "../v7/scene-node.mjs";
import { loadBridge, elevatorFor } from "./engine-node.mjs";

const args = process.argv.slice(2), files = [], opt = {};
for (let i = 0; i < args.length; i++) { if (args[i].startsWith("--")) { const k = args[i].slice(2); opt[k] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true; } else files.push(args[i]); }
if (!files.length) { if (!existsSync("private/v7/scenes")) { console.error("no scene files given and private/v7/scenes is missing"); process.exit(2); } files.push(...readdirSync("private/v7/scenes").filter(f => f.endsWith(".scene.json")).map(f => "private/v7/scenes/" + f)); }
const SC = loadSceneCore(), P = readProjects(), { bridge, FE } = loadBridge(), out = [];
for (const file of files) {
  const sc = JSON.parse(readFileSync(file, "utf8")), L = layoutFor(P, sc.project), D = SC.toInternal(sc, L).data;
  const r = bridge.runShift(D, { hours: opt.hours != null ? +opt.hours : (sc.settings?.shift || 8), liftCars: opt["lift-cars"] != null ? +opt["lift-cars"] : 1, returnTrip: !opt["no-return"],
    trolleys: opt.trolleys != null ? () => +opt.trolleys : undefined, spread: opt.spread != null ? +opt.spread : 0, seed: opt.seed != null ? +opt.seed : 1, elevatorOf: f => elevatorFor(f, L.elevators), check: true });
  out.push({ file, project: sc.project, ...r });
  if (opt.json) continue;
  console.log(`\n${sc.project} (${file}): ${r.hours} h shift on Factory Engine ${r.engine}; lift cars ${r.liftCars}; empty return ${r.returnTrip ? "estimated (reverse of the loaded route)" : "not modelled"}; time spread ${r.spread ? "+-" + r.spread * 100 + "% (assumed), seed " + r.seed : "none"}`);
  console.log("  path".padEnd(26) + "trolleys  one-way s  cycle alone s  engine trips  today's number  mean cycle s  lift wait s/trip");
  for (const p of r.paths) console.log("  " + p.id.padEnd(24) + String(p.trolleys).padStart(8) + p.oneWay.toFixed(1).padStart(11) + p.cycleAlone.toFixed(1).padStart(15) + String(p.trips).padStart(14) + String(p.naive).padStart(16) + (p.meanCycle == null ? "-" : p.meanCycle.toFixed(1)).padStart(14) + (p.liftWaitPerTrip == null ? "-" : p.liftWaitPerTrip.toFixed(1)).padStart(18));
  for (const l of r.lifts) console.log(`  ${l.id}: ${l.cars} car(s), busy ${(l.busy * 100).toFixed(1)}%`);
  console.log(`  invariants ${r.invariants.length ? r.invariants.join("; ") : "OK"}; ${r.events} events; fingerprint ${r.fingerprint}`);
}
if (opt.json) console.log(JSON.stringify(out, null, 2));
