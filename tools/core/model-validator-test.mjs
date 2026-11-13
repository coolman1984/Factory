// Minimum test of the platform data contract (PLATFORM_PLAN P0): the demo site validates clean, and each of
// 10 planted faults in a temporary copy is caught with an error at the expected file and place.
// Usage: node tools/core/model-validator-test.mjs
import { cpSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkSite } from "./site-node.mjs";

const DEMO = "docs/examples/site-demo";
const base = checkSite(DEMO);
let failed = 0;
if (base.errors || base.warnings) { console.log(`FAIL demo site is not clean: ${base.errors} errors, ${base.warnings} warnings`); failed++; }
else console.log(`PASS demo site clean (${base.files.length} files)`);

const edit = (dir, file, fn) => { const p = join(dir, file), j = JSON.parse(readFileSync(p, "utf8")); fn(j); writeFileSync(p, JSON.stringify(j)); };
const faults = [
  ["unknown carrier id", "models/parts.model.json", (j) => { j.flows[0].carrier = "no-such-trolley"; }, "parts.model.json", "flows[0].carrier"],
  ["negative time", "library.json", (j) => { j.carriers[0].unload = -5; }, "library.json", "carriers[0].unload"],
  ["bad distribution", "library.json", (j) => { j.lifts[0].cycle = { triangular: [50, 40, 60] }; }, "library.json", "lifts[0].cycle.triangular"],
  ["missing scene file", "models/parts.model.json", (j) => { j.scenes = ["../missing.scene.json"]; }, "parts.model.json", "scenes[0]"],
  ["duplicate id", "models/parts.model.json", (j) => { j.flows[1].id = j.flows[0].id; }, "parts.model.json", "flows[1].id"],
  ["store capacity 0", "models/parts.model.json", (j) => { j.stores[0].capacity.carriers = 0; }, "parts.model.json", "stores[0].capacity.carriers"],
  ["shift overlap", "site.json", (j) => { j.calendar.shifts[1].start = "13:00"; }, "site.json", "calendar.shifts"],
  ["plan line not in site", "plans/week-1.plan.json", (j) => { j.lines[0].line = "assy-l9"; }, "week-1.plan.json", "lines[0].line"],
  ["unknown scenario op", "scenarios/agv-only.json", (j) => { j.ops[0].op = "resource.explode"; }, "agv-only.json", "ops[0].op"],
  ["empirical file too short", "library.json", (j) => { j.devices[1].time = { empirical: "data/short.csv" }; }, "library.json", "devices[1].time.empirical"],
];
for (const [name, file, fn, expFile, expWhere] of faults) {
  const dir = mkdtempSync(join(tmpdir(), "mf-site-")), site = join(dir, "site-demo");
  try {
    cpSync(DEMO, site, { recursive: true }); cpSync("docs/examples/sample.scene.json", join(dir, "sample.scene.json"));
    writeFileSync(join(site, "data/short.csv"), "seconds\n5\n6\n7\n");
    edit(site, file, fn);
    const r = checkSite(site), hit = r.files.some((f) => f.file.endsWith(expFile) && f.errors.some((e) => e.where === expWhere));
    if (hit) console.log(`PASS caught: ${name} (${expFile} ${expWhere})`);
    else { failed++; console.log(`FAIL not caught: ${name}; got ${JSON.stringify(r.files.flatMap((f) => f.errors.map((e) => f.file.split("/").pop() + " " + e.where + ": " + e.msg)))}`); }
  } finally { try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch (e) { console.log(`note: temporary folder not removed (${e.code}): ${dir}`); } }
}
console.log(failed ? `FAIL ${failed} problem(s)` : `PASS all ${faults.length} planted faults caught`);
process.exitCode = failed ? 1 : 0;
