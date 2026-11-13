#!/usr/bin/env node
// Factory engine command line (WP0.3, WP1.8). Runs headless; prints JSON or a short text report.
//   node engine/cli.mjs validate <blueprint.json>
//   node engine/cli.mjs run <blueprint.json> [--scenario s.json] [--hours 8] [--seed n] [--out report.json] [--log events.jsonl]
//                          [--save-at <hours> --snapshot snap.json]
//   node engine/cli.mjs resume <blueprint.json> --snapshot snap.json [--scenario s.json] [--hours 8] [--out report.json]
import { readFileSync, writeFileSync } from "node:fs";
import { validateBlueprint, blueprintToModel } from "./src/blueprint.js";
import { World } from "./src/world.js";

const [cmd, file, ...rest] = process.argv.slice(2), opt = {};
for (let i = 0; i < rest.length; i++) { if (!rest[i].startsWith("--")) fail(`unexpected argument ${rest[i]}`); opt[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true; }
function fail(msg) { console.error("error: " + msg); process.exit(2); }
const readJSON = p => { try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { fail(`cannot read ${p}: ${e.message}`); } };
if (!cmd || cmd === "help" || !file) { console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 7).map(l => l.replace(/^\/\/ ?/, "")).join("\n")); process.exit(cmd ? 0 : 2); }

const bp = readJSON(file);
if (cmd === "validate") {
  const problems = validateBlueprint(bp);
  if (!problems.length) { console.log(`OK ${file}: ${bp.entities.length} entities, ${bp.processes.length} processes, ${bp.material_flows.length} flows; no semantic problems`); process.exit(0); }
  for (const p of problems) console.log(`${p.code}: ${p.message}`); console.log(`FAIL ${problems.length} problem(s)`); process.exit(1);
}
if (cmd !== "run" && cmd !== "resume") fail(`unknown command ${cmd}`);
const scenario = opt.scenario ? readJSON(opt.scenario) : {};
if (opt.seed != null) scenario.seed = +opt.seed;
const model = blueprintToModel(bp, scenario), hours = opt.hours != null ? +opt.hours : scenario.horizon_h ?? 8, end = Math.round(hours * 3600 * model.tickPerSecond);
const lines = [];
const options = { checkInvariants: !!opt.check, keepLog: false, onEvent: opt.log ? e => lines.push(JSON.stringify(e)) : null };
let world;
if (cmd === "resume") { if (!opt.snapshot) fail("resume needs --snapshot"); world = World.restore(model, readJSON(opt.snapshot), options); }
else world = new World(model, options);
if (opt["save-at"] != null && cmd === "run") {
  if (!opt.snapshot) fail("--save-at needs --snapshot <file>");
  world.runUntil(Math.round(+opt["save-at"] * 3600 * model.tickPerSecond)); writeFileSync(opt.snapshot, JSON.stringify(world.snapshot())); console.log(`snapshot at ${world.seconds} s -> ${opt.snapshot}`);
}
const t0 = performance.now(); world.runUntil(Math.max(world.now, end)); const ms = performance.now() - t0;
const r = world.report();
if (opt.out) writeFileSync(opt.out, JSON.stringify(r, null, 2));
if (opt.log) writeFileSync(opt.log, lines.join("\n") + "\n");
const packed = (r.balance.TV_PACKED || {}).produced ?? null;
console.log(`${model.name} (${model.source.sample_only ? "SAMPLE DATA, not a real factory" : "blueprint"}) seed ${r.seed}: ${hours} h simulated in ${ms.toFixed(0)} ms, ${r.events} events`);
if (packed != null) console.log(`  TVs packed: ${packed}; in container: ${(r.stock.SHIP_CONTAINER || {}).TV_PACKED || 0}; in FG store: ${(r.stock.WH_FG || {}).TV_PACKED || 0}`);
console.log(`  missions: ${r.missions.done} done, ${r.missions.failed} failed, ${r.missions.waiting} waiting, mean lead ${r.missions.mean_lead_s ?? "-"} s`);
for (const s of r.stations) console.log(`  ${s.id.padEnd(14)} ${String(s.cycles).padStart(5)} cycles  busy ${(s.utilisation * 100).toFixed(1).padStart(5)}%  starved ${s.seconds.starved} s  blocked ${s.seconds.blocked} s  down ${s.seconds.down} s`);
for (const u of r.units) console.log(`  ${u.id.padEnd(16)} ${u.kind.padEnd(8)} busy ${(u.utilisation * 100).toFixed(1)}%`);
for (const q of r.quality) console.log(`  quality ${q.station}: ${q.tested} tests, ${q.passed} pass, ${q.failed} fail (repair loop), yield ${q.yield == null ? "-" : (q.yield * 100).toFixed(1) + "%"}, first-pass yield ${q.first_pass_yield == null ? "-" : (q.first_pass_yield * 100).toFixed(1) + "%"}, retests ${q.retests}`);
if (r.serials) console.log(`  serial numbers issued: ${Object.entries(r.serials.issued).map(([k, v]) => k + " " + v).join(", ")}; units with recorded contents: ${r.serials.with_contents}`);
if (r.shipping) { const sh = r.shipping, pl = sh.plan; console.log(`  shipping ${sh.location}: plan ${sh.per_container} x ${sh.item} per container (${pl.layers} layers x ${pl.perLayer}, limited by ${pl.limitedBy}, volume fill ${(pl.volumeFill * 100).toFixed(1)}%); loaded ${sh.loaded}, full containers ${sh.containers_full}`); }
const zw = r.zones.filter(z => z.entries); if (r.zones.length) console.log(`  traffic: ${r.zones.length} zone(s), ${zw.length} used, ${r.zones.reduce((n, z) => n + z.waits, 0)} wait(s), ${r.zones.reduce((n, z) => n + z.wait_s, 0).toFixed(1)} s waiting`);
console.log(`  invariants: ${r.invariants.length ? r.invariants.join("; ") : "OK"}`);
console.log(`  fingerprint ${r.fingerprint}`);
