// Factory Control Center command line: the agent's (and the owner's) fast way to read and change everything.
// Same database and same checked commands as the UI. Database: FC_DB or control/data/factory.db (seeded on first use).
//   node control/fc.mjs status | types | problems | list <type> [--where f=v] | get <type> <id> | where-used <type> <id>
//   node control/fc.mjs set <type> <id> f=v [f=v ...] [--force] | new <type> <id> [f=v ...] | delete|rename|dup <type> <id> [to]
//   node control/fc.mjs batch <commands.json> | undo | redo | changes [--limit n]
//   node control/fc.mjs run [--scenario s] [--hours h] [--seed n] | runs | show <run> | events <run> [--type t] [--q text] | trace <run> <serial>
//   node control/fc.mjs sql "<select ...>" | export <file> | import <file> [--force] | backup <file> | seed --reset
// Values: JSON when it parses (12, true, null, [1,2,3], ["A","B"]), otherwise text. Add --json for machine-readable output.
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { openStore, DEFAULT_DB } from "./open.js";
import { TYPE, TYPES, refsTo, getPath, setPath, blank } from "./schema.js";
import { seed } from "./seed.js";

const argv = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) { const k = a.slice(2); opt[k] = argv[i + 1] != null && !argv[i + 1].startsWith("--") && !["force", "json", "reset"].includes(k) ? argv[++i] : true; } else pos.push(a); }
const [cmd, ...rest] = pos, json = !!opt.json, actor = opt.actor || "agent";
const val = s => { try { return JSON.parse(s); } catch { return s; } };
const pairs = list => Object.fromEntries(list.map(p => { const i = p.indexOf("="); if (i < 1) throw new Error(`expected field=value, got ${p}`); return [p.slice(0, i), val(p.slice(i + 1))]; }));
const out = (o, text) => console.log(json ? JSON.stringify(o, null, 2) : (text ?? JSON.stringify(o, null, 2)));
const needType = t => { if (!TYPE[t]) { console.error(`unknown type ${t}; types: ${TYPES.map(x => x.type).join(", ")}`); process.exit(2); } return TYPE[t]; };

if (!cmd || cmd === "help") { console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(0, 9).map(l => l.replace(/^\/\/ ?/, "")).join("\n")); process.exit(0); }
if (cmd === "seed" && opt.reset) { const f = process.env.FC_DB || DEFAULT_DB; for (const x of [f, f + "-wal", f + "-shm"]) if (existsSync(x)) rmSync(x); }
const S = await openStore();
const show = r => { if (!r.ok) { out(r, `REFUSED (${r.code}): ${r.reason}`); process.exitCode = 1; } else out(r, r.changed === false ? `no change (revision ${r.revision})` : `OK revision ${r.revision}: ${r.label} (${r.ops} record(s))${r.warnings && r.warnings.length ? "\n  still open: " + r.warnings.join("; ") : ""}`); };
const command = (type, payload) => show(S.command({ actor, type, payload, force: !!opt.force }));

switch (cmd) {
  case "status": { const st = S.stats(), p = S.problems(), last = S.runs(1)[0]; out({ ...st, problems: p.length, last_run: last || null }, `revision ${st.revision}; ${st.records} records; ${p.length} problem(s); ${st.changes} change(s); ${st.runs} run(s); engine ${st.engine}\n` + TYPES.map(T => `  ${T.type.padEnd(14)} ${st.counts[T.type]}`).join("\n") + (last ? `\nlast run ${last.id} ${last.scenario} ${last.hours} h: ${last.kpis.finished_total} finished, bottleneck ${last.kpis.bottleneck?.id}` : "")); break; }
  case "types": out(TYPES.map(T => ({ type: T.type, label: T.label, key: T.key, fields: T.fields.map(f => f.key) })), TYPES.map(T => `${T.type.padEnd(14)} ${T.label.padEnd(16)} key ${T.key}: ${T.fields.map(f => f.key).join(", ")}`).join("\n")); break;
  case "problems": { const p = S.problems(); out(p, p.length ? p.map(x => `${x.where}: ${x.message}`).join("\n") : "no problems"); break; }
  case "list": { const T = needType(rest[0]); let list = S.all(T.type); if (opt.where) { const [k, v] = String(opt.where).split("="); list = list.filter(r => String(getPath(r.data, k)) === v); }
    out(list.map(r => r.data), list.map(r => T.columns.map(c => { const v = getPath(r.data, c); return Array.isArray(v) ? `[${v.join(" ")}]` : String(v ?? "-"); }).join(" | ")).join("\n") || "(none)"); break; }
  case "get": { needType(rest[0]); const r = S.get(rest[0], rest[1]); if (!r) { console.error("not found"); process.exit(1); } out(r.data); break; }
  case "where-used": { needType(rest[0]); const u = refsTo(S.records(), rest[0], rest[1]); out(u, u.length ? u.map(x => `${x.type}:${x.id} (${x.field})`).join("\n") : "not referenced"); break; }
  case "set": needType(rest[0]); command("record.update", { type: rest[0], id: rest[1], set: pairs(rest.slice(2)) }); break;
  case "new": { const T = needType(rest[0]), d = blank(T.type, T.single ? undefined : rest[1]); for (const [k, v] of Object.entries(pairs(rest.slice(T.single ? 1 : 2)))) setPath(d, k, v); command("record.create", { type: T.type, data: d }); break; }
  case "delete": needType(rest[0]); command("record.delete", { type: rest[0], id: rest[1] }); break;
  case "rename": needType(rest[0]); command("record.rename", { type: rest[0], id: rest[1], to: rest[2] }); break;
  case "dup": needType(rest[0]); command("record.duplicate", { type: rest[0], id: rest[1], to: rest[2] }); break;
  case "batch": { const list = JSON.parse(readFileSync(rest[0], "utf8")); command("batch", { commands: Array.isArray(list) ? list : list.commands, label: opt.label }); break; }
  case "undo": case "redo": show(S.command({ actor, type: cmd })); break;
  case "changes": { const c = S.changes({ limit: +(opt.limit || 20) }); out(c, c.map(x => `#${x.seq} r${x.revision} ${x.at.slice(0, 19)} ${x.actor.padEnd(6)} ${x.kind.padEnd(5)} ${x.label} (${x.ops.length})${x.undone ? " [undone]" : ""}`).join("\n")); break; }
  case "run": { const r = S.run({ scenario: opt.scenario, hours: opt.hours, seed: opt.seed, actor, note: opt.note || "" }), k = r.kpis;
    out(r, `run ${r.id}: ${r.scenario}, ${r.hours} h, seed ${r.seed}, ${r.ms.toFixed(0)} ms\n  finished ${JSON.stringify(k.finished)}; shipped ${k.shipped ?? "-"}; missions ${k.missions_done} done / ${k.missions_failed} failed; mean lead ${k.mean_lead_s ?? "-"} s\n  bottleneck ${k.bottleneck ? k.bottleneck.id + " " + (k.bottleneck.utilisation * 100).toFixed(1) + "%" : "-"}; yield ${k.yield ?? "-"}; traffic wait ${k.traffic_wait_s} s; invariants ${k.invariants ? "BROKEN" : "OK"}; fingerprint ${r.fingerprint}`); break; }
  case "runs": { const r = S.runs(+(opt.limit || 20)); out(r, r.map(x => `${x.id} ${x.at.slice(0, 19)} ${x.scenario.padEnd(16)} ${String(x.hours).padStart(4)} h  finished ${x.kpis.finished_total}  bottleneck ${x.kpis.bottleneck?.id}  ${x.fingerprint}`).join("\n") || "(no runs)"); break; }
  case "show": { const r = S.runDetail(rest[0]); if (!r) { console.error("no such run"); process.exit(1); } out(json ? r : { ...r, report: undefined }); break; }
  case "events": { const e = S.events(rest[0], { type: opt.type, q: opt.q, from: +(opt.from || 0), limit: +(opt.limit || 50) }); out(e, e.map(x => `${String(x.seq).padStart(6)} ${x.t.toFixed(1).padStart(9)} s  ${x.type.padEnd(16)} ${x.mission || x.station || ""} ${JSON.stringify(x.data)}`).join("\n")); break; }
  case "trace": out(S.trace(rest[0], rest[1])); break;
  case "sql": { const r = S.query(rest.join(" ")); out(r, r.rows.map(x => JSON.stringify(x)).join("\n") + `\n(${r.total} row(s))`); break; }
  case "export": writeFileSync(rest[0], JSON.stringify(S.exportAll(), null, 2)); out({ ok: true, file: rest[0] }, `exported revision ${S.revision} to ${rest[0]}`); break;
  case "import": { const o = JSON.parse(readFileSync(rest[0], "utf8")); command("import", { blueprint: o.blueprint || o, scenarios: o.scenarios, label: "import " + rest[0] }); break; }
  case "backup": out({ file: S.backup(rest[0]) }, `backup written to ${rest[0]}`); break;
  case "seed": if (!opt.reset) { const r = seed(S, actor); out(r, "seeded"); } else out({ ok: true }, `database reset and seeded (revision ${S.revision})`); break;
  default: console.error(`unknown command ${cmd} (try: node control/fc.mjs help)`); process.exitCode = 2;
}
S.close();
