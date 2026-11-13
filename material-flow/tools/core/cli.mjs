// Platform verbs of the agent CLI (tools/mf.mjs delegates here): sim, exp, import, cad, portfolio, platform.
// Every verb prints short lines, or JSON with --json; exit 1 on failure.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
const J = (o) => console.log(JSON.stringify(o, null, 1));
const f2 = (v, k = "") => !Number.isFinite(v) ? "-" : k.startsWith("util.") ? (v * 100).toFixed(1) + "%" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
function printKpis(k, MFKpi) { for (const [key, v] of Object.entries(k)) { const [l, u] = MFKpi.label(key); console.log(`  ${l}${u && u !== "%" ? ` (${u})` : ""}: ${f2(v.mean, key)}${v.n > 1 ? `  [${f2(v.lo, key)} .. ${f2(v.hi, key)}]` : ""}`); } }
const runDirOf = (x) => { if (existsSync(join(x, "receipt.json"))) return x; throw new Error(`not a run folder (no receipt.json): ${x}`); };

export async function sim(pos, opt, die) {
  const S = await import("./sim-node.mjs"), sub = pos[0];
  if (sub === "run") {
    if (!pos[1]) die("sim run <scenario.json> [--seed n] [--days d] [--replications n] [--view] [--json]");
    const o = {}; if (opt.replications) o.replications = +opt.replications; const run = {}; if (opt.days) run.days = +opt.days; if (opt.seed != null) run.seed = +opt.seed; if (Object.keys(run).length) o.run = run;
    let r; try { r = await S.runScenario(pos[1], o); } catch (e) { die(e.message); }
    if (opt.view) { const { buildViewer } = await import("./viewer.mjs"); r.viewer = buildViewer(r.dir, join(r.dir, "view.html"), { layout: typeof opt.layout === "string" ? opt.layout : undefined }).out; }
    if (opt.json) return J({ dir: r.dir, receipt: r.receipt, viewer: r.viewer });
    const rc = r.receipt; console.log(`run ${rc.id}: ${rc.site} / ${rc.model} / ${rc.scenario}, ${rc.days} day(s), ${rc.replications} replication(s), ${rc.orders} orders, ${rc.ms} ms (model result, ${rc.assumptions} assumed value(s))`);
    printKpis(rc.kpis, S.MFKpi); for (const w of rc.warnings) console.log(`  warning: ${w}`); console.log(`  folder: ${r.dir}`); if (r.viewer) console.log(`  viewer: ${r.viewer}`);
  } else if (sub === "view") {
    if (!pos[1]) die("sim view <run dir> [--out file.html] [--layout layout.json]");
    const { buildViewer } = await import("./viewer.mjs"); const out = opt.out || join(runDirOf(pos[1]), "view.html"); const v = buildViewer(pos[1], out, { layout: opt.layout }); console.log(`viewer ${v.out} (${(v.bytes / 1e6).toFixed(2)} MB)`);
  } else if (sub === "state" || sub === "where") {
    if (!pos[1] || opt.at == null) die(`sim ${sub} <run dir> --at seconds${sub === "where" ? " --order n" : ""}`);
    const { log } = S.loadRun(runDirOf(pos[1])), st = S.MFSim.state(log, +opt.at), name = (o) => log.flows[o.flow].id;
    if (sub === "where") { const o = st.find((x) => x.order === +opt.order); if (!o) die(`order ${opt.order} is not open at ${opt.at} s`); return opt.json ? J({ ...o, flow: name(o), step: o.step >= 0 ? log.flows[o.flow].steps[o.step].id : null }) : console.log(`order ${o.order} (${name(o)}): ${o.phase}${o.step >= 0 ? " in step " + log.flows[o.flow].steps[o.step].id : ""} since ${o.since.toFixed(1)} s${o.unit >= 0 ? ", mover " + log.units[o.unit].res + "#" + log.units[o.unit].i : ""}`); }
    if (opt.json) return J(st.map((o) => ({ ...o, flow: name(o) })));
    const by = {}; for (const o of st) by[o.phase] = (by[o.phase] || 0) + 1; console.log(`${st.length} open order(s) at ${opt.at} s: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
  } else die("sim run|view|state|where");
}

export async function exp(pos, opt, die) {
  const E = await import("./exp-node.mjs"), sub = pos[0];
  if (sub === "run") {
    if (!pos[1]) die("exp run <experiment.json> [--excel] [--json]");
    let r; try { r = await E.runExperiment(pos[1], { excel: !!opt.excel, log: opt.json ? () => {} : console.log }); } catch (e) { die(e.message); }
    if (opt.json) return J(r.summary);
    console.log(`${r.summary.rows.length} point(s); report ${join(r.out, "report.html")}${opt.excel ? `, ${join(r.out, "report.xlsx")}` : ""}`);
  } else if (sub === "compare") {
    if (pos.length < 3) die("exp compare <run dir A> <run dir B>");
    const rd = (d) => JSON.parse(readFileSync(join(runDirOf(d), "receipt.json"), "utf8")), rows = E.compareRuns(rd(pos[1]), rd(pos[2]));
    if (opt.json) return J(rows);
    for (const x of rows) console.log(`  ${x.label}${x.unit && x.unit !== "%" ? ` (${x.unit})` : ""}: ${f2(x.a, x.key)} -> ${f2(x.b, x.key)} (${x.diff >= 0 ? "+" : ""}${f2(x.diff, x.key)}) ${x.proven ? "difference proven (95% ranges apart)" : "no proven difference"}`);
  } else if (sub === "report") {
    if (!pos[1]) die("exp report <experiment result dir> [--excel]");
    const s = JSON.parse(readFileSync(join(pos[1], "summary.json"), "utf8")); if (opt.excel) { E.excelReport(s, join(pos[1], "report.xlsx")); console.log(`wrote ${join(pos[1], "report.xlsx")} through Excel COM`); } else console.log(join(pos[1], "report.html"));
  } else die("exp run|compare|report");
}

export async function importVerb(pos, opt, die) {
  const sub = pos[0];
  if (sub === "plan") {
    if (!pos[1] || !opt.site || !opt.from) die("import plan <workbook.xlsx> --site <site dir> --from YYYY-MM-DD [--days 5] [--name n] [--sheet Plan] [--bom-sheet BOM]");
    const { importPlan } = await import("./import-node.mjs"); let r; try { r = importPlan(pos[1], opt.site, { from: opt.from, days: +(opt.days || 5), name: opt.name, sheet: opt.sheet || "Plan", bomSheet: opt["bom-sheet"] || "BOM" }); } catch (e) { die(e.message); }
    if (opt.json) return J(r);
    console.log(`wrote ${r.file}: ${r.plan.lines.length} plan line(s), ${r.plan.bom.length} BOM row(s) (read through Excel COM)`); for (const e of r.errors) console.log(`  ERROR ${e.where}: ${e.msg}`); for (const w of r.warnings) console.log(`  warning ${w.where}: ${w.msg}`); process.exitCode = r.errors.length ? 1 : 0;
  } else if (sub === "events") {
    if (!pos[1] || !opt.run) die("import events <reads.csv> --run <run dir> [--start ISO-time]  (compare shop-floor reads with a simulation run)");
    const A = await import("./actual-node.mjs"), r = A.compareActual(runDirOf(opt.run), pos[1], { start: opt.start });
    if (opt.json) return J(r);
    console.log(`plan vs actual, run ${r.run}:`); for (const x of r.rows) console.log(`  ${x.flow}: actual ${x.actualTrips} trip(s), mean ${f2(x.actualTrip ?? NaN)} s; model ${x.simTrips} trip(s), mean ${f2(x.simTrip ?? NaN)} s${x.diff != null ? `; difference ${(x.diff * 100).toFixed(1)} %` : ""}`);
  } else die("import plan|events");
}

export async function cad(pos, opt, die) {
  if (pos[0] !== "layout" || !opt.out) die("cad layout <layout.sqlite> --out <site>/layout/<name>.layout.json [--layers a,b] [--box x0,y0,x1,y1 (CAD units)] [--align cx,cy=px,py;cx,cy=px,py] [--svg file]");
  const C = await import("./cad-layout.mjs"), db = pos[1] || "dist/SEEG_Y26_AI_Package/layout.sqlite";
  let L; try { L = C.cadToLayout(db, { layers: opt.layers ? String(opt.layers).split(",") : undefined, box: opt.box ? String(opt.box).split(",").map(Number) : null, align: opt.align ? C.parseAlign(String(opt.align)) : null }); } catch (e) { die(e.message); }
  mkdirSync(dirname(resolve(opt.out)), { recursive: true }); writeFileSync(opt.out, JSON.stringify(L));
  const svg = opt.svg || opt.out.replace(/\.json$/, ".svg"); C.layoutSvg(L, svg);
  console.log(`wrote ${opt.out}: ${L.segments.length} segment(s) ${JSON.stringify(L.perLayer)}; preview ${svg}${L.source.transform ? `; alignment scale ${L.source.scale.toFixed(4)}, rotation ${L.source.transform.rotDeg.toFixed(2)} deg` : ""}`);
}

export async function portfolio(pos, opt, die) {
  const ent = pos[1] || "private/portfolio/enterprise.json";
  if (pos[0] === "init") {
    if (existsSync(ent)) die(`${ent} exists; not overwritten`); mkdirSync(dirname(ent), { recursive: true });
    const sites = existsSync("private/sites") ? readdirSync("private/sites").filter((d) => existsSync(join("private/sites", d, "site.json"))).map((d) => `../sites/${d}`) : [];
    writeFileSync(ent, JSON.stringify({ format: "mf-enterprise", version: 1, name: opt.name || "Material Flow portfolio", sites, targets: { starved_min: 0, wait_mover: 300, util_max: 0.85 } }, null, 1) + "\n"); console.log(`wrote ${ent} with ${sites.length} site(s)`);
  } else if (pos[0] === "build") {
    if (!existsSync(ent)) die(`${ent} not found (portfolio init)`); const { buildPortfolio } = await import("./portfolio-node.mjs"); const r = buildPortfolio(ent, opt.out);
    if (opt.json) return J({ file: r.file, sites: r.P.sites.map((s) => ({ id: s.id, errors: s.errors, models: s.models.length, runs: s.runs.length })) });
    console.log(`portfolio ${r.file}: ${r.P.sites.length} site(s)`); for (const s of r.P.sites) console.log(`  ${s.id}: ${s.errors ? s.errors + " error(s)" : "valid"}, ${s.models.length} model(s) (${s.models.filter((m) => m.state === "approved").length} approved), ${s.runs.length} scenario(s) with results`);
  } else die("portfolio init|build [enterprise.json]");
}

export async function platform(pos, opt, die) {
  const sub = pos[0];
  if (sub === "state") {
    if (!pos[1] || !opt.model || !opt.to) die("platform state <site dir> --model id --to draft|reviewed|approved --by name [--note t] [--run id]");
    const G = await import("./govern-node.mjs"); let e; try { e = await G.setState(pos[1], opt.model, opt.to, { by: opt.by, note: opt.note || "", run: opt.run }); } catch (err) { die(err.message); }
    opt.json ? J(e) : console.log(`${e.model}: ${e.from} -> ${e.to} by ${e.by}${e.run ? ` (run ${e.run})` : ""}; recorded in ${join(pos[1], "CHANGES.jsonl")}`);
  } else if (sub === "history") {
    if (!pos[1]) die("platform history <site dir>"); const G = await import("./govern-node.mjs"), h = G.history(pos[1]);
    if (opt.json) return J(h); for (const e of h) console.log(`${e.at.slice(0, 16).replace("T", " ")}  ${e.model}: ${e.from} -> ${e.to} by ${e.by}${e.run ? ` run ${e.run}` : ""}${e.note ? ` "${e.note}"` : ""}`); if (!h.length) console.log("no changes recorded");
  } else if (sub === "recheck") {
    if (!pos[1]) die("platform recheck <site dir>   (re-run every approved model's scenario; flag KPIs outside the approved 95% range)");
    const { recheck } = await import("./recheck-node.mjs"), r = await recheck(pos[1]); if (opt.json) return J(r);
    for (const x of r) console.log(`${x.model} (${x.scenario}): ${x.flags.length ? "CHANGED " + x.flags.join("; ") : "same as approved"}${x.inputsChanged ? " (inputs changed since approval)" : ""}`); if (!r.length) console.log("no approved models"); process.exitCode = r.some((x) => x.flags.length && !x.inputsChanged) ? 1 : 0;
  } else if (sub === "gate") {
    const { gate } = await import("./platform-gate.mjs"); process.exitCode = (await gate({ quick: !!opt.quick })) ? 0 : 1;
  } else die("platform state|history|recheck|gate");
}
