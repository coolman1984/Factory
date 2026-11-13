// Experiments (PLATFORM_PLAN P4): a scenario + a parameter grid (or a "find the smallest count" search) + replications.
// Every grid point is one run (tools/core/sim-node.mjs), recorded in the site's results.sqlite; the experiment writes
// <site>/experiments/results/<name>/summary.json, an HTML report and, on request, an Excel report through COM.
//
// mf-experiment file (in <site>/experiments/):
// { "format": "mf-experiment", "version": 1, "scenario": "scenarios/base.json", "replications": 10, "days": 5,
//   "grid": { "resource.parts-ops.count": [1, 2, 3], "flow.parts-to-line.mover": ["op-push", "agv-tow"] },
//   "find": { "param": "resource.parts-ops.count", "from": 1, "to": 10, "until": { "starved_min": 0, "wait_mover": 300 } } }
// Parameter keys: resource.<id>.<field> | flow.<id>.<field> | store.<id>.<field> | rules.<field> | library.<kind>.<id>.<field>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { runScenario, MFKpi } from "./sim-node.mjs";
import { PWSH } from "./import-node.mjs";

export function paramOp(key, value) {
  const p = key.split(".");
  if (p[0] === "rules") return { op: "rules.set", [p[1]]: value };
  if (p[0] === "library") return { op: "library.set", kind: p[1], id: p[2], [p[3]]: value };
  if (["resource", "flow", "store"].includes(p[0]) && p.length === 3) return { op: `${p[0]}.set`, id: p[1], [p[2]]: value };
  throw new Error(`bad parameter "${key}" (resource.<id>.<field>, flow.<id>.<field>, store.<id>.<field>, rules.<field>, library.<kind>.<id>.<field>)`);
}
function points(grid = {}) { let pts = [{}]; for (const [k, vals] of Object.entries(grid)) { const n = []; for (const p of pts) for (const v of vals) n.push({ ...p, [k]: v }); pts = n; } return pts; }
const meets = (k, until) => Object.entries(until).every(([key, lim]) => k[key] && k[key].hi <= lim + 1e-9);

export async function runExperiment(file, { log = console.log, excel = false } = {}) {
  const ex = JSON.parse(readFileSync(file, "utf8"));
  if (ex.format !== "mf-experiment" || ex.version !== 1) throw new Error(`${file}: not an mf-experiment version 1`);
  const siteDir = dirname(dirname(resolve(file))), scen = resolve(siteDir, ex.scenario), name = basename(file, ".json");
  if (!existsSync(scen)) throw new Error(`scenario not found: ${ex.scenario}`);
  const over = { replications: ex.replications, run: ex.days ? { days: ex.days } : undefined };
  const rows = [];
  const one = async (params) => {
    const ops = Object.entries(params).map(([k, v]) => paramOp(k, v));
    const r = await runScenario(scen, { ...over, ops });
    const row = { params, run: r.receipt.id, kpis: r.receipt.kpis, warnings: r.receipt.warnings }; rows.push(row);
    log(`  ${Object.entries(params).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ") || "(base)"}: ${fmtRow(row.kpis)}`);
    return row;
  };
  let found = null;
  if (ex.find) {
    const f = ex.find;
    for (let v = f.from; v <= f.to; v++) { const row = await one({ ...(f.fixed || {}), [f.param]: v }); if (meets(row.kpis, f.until)) { found = { param: f.param, value: v, until: f.until, run: row.run }; break; } }
    log(found ? `  smallest ${f.param} that meets ${JSON.stringify(f.until)} (upper 95% bound): ${found.value}` : `  no value of ${f.param} from ${f.from} to ${f.to} meets ${JSON.stringify(f.until)}`);
  } else for (const p of points(ex.grid)) await one(p);
  const out = join(siteDir, "experiments", "results", name); mkdirSync(out, { recursive: true });
  const summary = { format: "mf-experiment-result", version: 1, experiment: name, scenario: ex.scenario, replications: ex.replications, days: ex.days || null, find: ex.find || null, found, rows, label: "model", at: new Date().toISOString() };
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 1));
  writeFileSync(join(out, "report.html"), reportHtml(summary));
  if (excel) excelReport(summary, join(out, "report.xlsx"));
  return { out, summary };
}
const KEYS = ["throughput", "starved_min", "lead_time", "wait_mover", "wait_lift", "wip"];
function fmtRow(k) { return KEYS.filter((x) => k[x]).map((x) => `${x} ${k[x].mean.toFixed(1)}`).join(", ") + Object.keys(k).filter((x) => x.startsWith("util.")).map((x) => `, ${x} ${(k[x].mean * 100).toFixed(0)}%`).join(""); }

/* compare two runs (receipts): per KPI the means, difference and whether the 95 % ranges overlap */
export function compareRuns(a, b) {
  const keys = [...new Set([...Object.keys(a.kpis), ...Object.keys(b.kpis)])], out = [];
  for (const k of keys) { const x = a.kpis[k], y = b.kpis[k]; if (!x || !y) continue; out.push({ key: k, label: MFKpi.label(k)[0], unit: MFKpi.label(k)[1], a: x.mean, b: y.mean, diff: y.mean - x.mean, proven: x.hi < y.lo || y.hi < x.lo }); }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function reportHtml(s) {
  const keys = [...new Set(s.rows.flatMap((r) => Object.keys(r.kpis)))].filter((k) => k !== "delivered");
  const params = [...new Set(s.rows.flatMap((r) => Object.keys(r.params)))];
  const f = (k, v) => k.startsWith("util.") ? (v * 100).toFixed(1) : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  const head = params.map((p) => `<th>${esc(p)}</th>`).join("") + keys.map((k) => { const [l, u] = MFKpi.label(k); return `<th>${esc(l)}<br><span>${esc(u)}</span></th>`; }).join("");
  const body = s.rows.map((r) => `<tr${s.found && s.found.run === r.run ? ' class="best"' : ""}>` + params.map((p) => `<td>${esc(JSON.stringify(r.params[p] ?? ""))}</td>`).join("") + keys.map((k) => { const v = r.kpis[k]; return v ? `<td class="n">${f(k, v.mean)}<br><span>${f(k, v.lo)}–${f(k, v.hi)}</span></td>` : "<td></td>"; }).join("") + "</tr>").join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(s.experiment)} · experiment</title><style>
body{font:13px/1.4 "Segoe UI",system-ui,sans-serif;color:#1d2733;margin:24px;background:#f4f6f9}h1{font-size:18px;margin:0 0 4px}p{color:#66758a;margin:0 0 16px}
table{border-collapse:collapse;background:#fff}th,td{border:1px solid #d8dee7;padding:6px 8px;vertical-align:top}th{background:#eef2f7;font-weight:600;text-align:left}th span,td span{color:#66758a;font-weight:400;font-size:11px}
td.n{text-align:right;font-variant-numeric:tabular-nums}tr.best td{background:#ecfdf5}.found{background:#ecfdf5;border:1px solid #a7f3d0;padding:8px 12px;display:inline-block;margin-bottom:16px}</style></head><body>
<h1>Experiment ${esc(s.experiment)}</h1><p>Scenario ${esc(s.scenario)} · ${s.replications} replication(s) per point · ${s.rows.length} point(s) · values are model results (mean, 95% range) · ${esc(s.at)}</p>
${s.find ? `<div class="found">${s.found ? `Smallest <b>${esc(s.found.param)}</b> meeting ${esc(JSON.stringify(s.found.until))}: <b>${s.found.value}</b>` : `No value of ${esc(s.find.param)} from ${s.find.from} to ${s.find.to} meets ${esc(JSON.stringify(s.find.until))}`}</div>` : ""}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

/* Excel report through COM (owner rule): a JSON file is turned into a workbook by tools/core/excel-report.ps1 */
export function excelReport(summary, xlsx) {
  const keys = [...new Set(summary.rows.flatMap((r) => Object.keys(r.kpis)))], params = [...new Set(summary.rows.flatMap((r) => Object.keys(r.params)))];
  const head = [...params, ...keys.flatMap((k) => [`${MFKpi.label(k)[0]} (${MFKpi.label(k)[1]}) mean`, "low 95%", "high 95%"]), "run"];
  const rows = summary.rows.map((r) => [...params.map((p) => JSON.stringify(r.params[p] ?? "")), ...keys.flatMap((k) => r.kpis[k] ? [r.kpis[k].mean, r.kpis[k].lo, r.kpis[k].hi] : ["", "", ""]), r.run]);
  const info = [["Experiment", summary.experiment], ["Scenario", summary.scenario], ["Replications", summary.replications], ["Points", summary.rows.length], ["Values", "model results, mean and 95% range"], ["Found", summary.found ? `${summary.found.param} = ${summary.found.value}` : ""], ["Created", summary.at]];
  const tmp = xlsx.replace(/\.xlsx$/, ".excel.json"); writeFileSync(tmp, JSON.stringify({ sheets: [{ name: "Results", rows: [head, ...rows] }, { name: "Receipt", rows: info }] }));
  execFileSync(PWSH, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", resolve("tools/core/excel-report.ps1"), "-Json", tmp, "-Out", resolve(xlsx)], { stdio: "pipe", windowsHide: true });
  return xlsx;
}
