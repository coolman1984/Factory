// Portfolio of sites (PLATFORM_PLAN P5): enterprise.json lists site folders and KPI targets; `portfolio build` collects every
// site's validation state, models (with review state), latest run per scenario and its KPIs into portfolio.sqlite and one
// offline HTML page (no map tiles, no network).
// enterprise.json: { "format": "mf-enterprise", "version": 1, "name": "...", "sites": ["../sites/site-01", ...],
//                    "targets": { "starved_min": 0, "wait_mover": 300, "util_max": 0.85 } }
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { checkSite } from "./site-node.mjs";
import { history } from "./govern-node.mjs";
import { open } from "./results-db.mjs";
import { MFKpi } from "./sim-node.mjs";

export function collect(entFile) {
  const ent = JSON.parse(readFileSync(entFile, "utf8")); if (ent.format !== "mf-enterprise") throw new Error(`${entFile}: format must be "mf-enterprise"`);
  const base = dirname(resolve(entFile)), sites = [];
  for (const rel of ent.sites || []) {
    const dir = resolve(base, rel), chk = checkSite(dir), s = chk.site || {}, models = [];
    for (const f of existsSync(join(dir, "models")) ? readdirSync(join(dir, "models")).filter((x) => x.endsWith(".json")) : []) { const m = JSON.parse(readFileSync(join(dir, "models", f), "utf8")); models.push({ id: f.replace(/\.model\.json$|\.json$/, ""), area: m.area, state: m.state || "draft", flows: (m.flows || []).length }); }
    const runs = [], dbf = join(dir, "results", "results.sqlite");
    if (existsSync(dbf)) { const db = open(dbf); try { const rows = db.prepare("SELECT id, scenario, model, receipt, at FROM runs ORDER BY at").all(), last = new Map(); for (const r of rows) if (!JSON.parse(r.receipt).variant) last.set(r.scenario, r); /* experiment variants stay in the site database */ for (const r of last.values()) { const rc = JSON.parse(r.receipt); runs.push({ id: r.id, scenario: r.scenario, model: r.model, at: r.at, assumptions: rc.assumptions, kpis: rc.kpis, warnings: rc.warnings }); } } finally { db.close(); } }
    const approvals = history(dir).filter((h) => h.to === "approved");
    sites.push({ dir, id: s.id || "?", name: s.name || "?", country: s.country || null, productLines: s.productLines || [], areas: (s.areas || []).map((a) => a.id), errors: chk.errors, warnings: chk.warnings, models, runs, approvals: approvals.length });
  }
  return { ent, sites, at: new Date().toISOString() };
}
const light = (key, v, T) => {
  if (!T) return "";
  if (key === "starved_min" && T.starved_min != null) return v.hi <= T.starved_min + 1e-9 ? "ok" : "bad";
  if (key === "wait_mover" && T.wait_mover != null) return v.hi <= T.wait_mover ? "ok" : v.lo <= T.wait_mover ? "warn" : "bad";
  if (key.startsWith("util.") && T.util_max != null) return v.mean <= T.util_max ? "ok" : "bad";
  return "";
};
export function buildPortfolio(entFile, outDir) {
  const P = collect(entFile), out = resolve(outDir || dirname(resolve(entFile))); mkdirSync(out, { recursive: true });
  const db = open(join(out, "portfolio.sqlite"));
  try {
    db.exec("CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, name TEXT, country TEXT, dir TEXT, errors INTEGER, warnings INTEGER, models INTEGER, approved INTEGER, at TEXT); CREATE TABLE IF NOT EXISTS site_kpis (site TEXT, scenario TEXT, run TEXT, key TEXT, mean REAL, lo REAL, hi REAL);");
    db.exec("BEGIN"); db.exec("DELETE FROM sites; DELETE FROM site_kpis;");
    const si = db.prepare("INSERT OR REPLACE INTO sites VALUES (?,?,?,?,?,?,?,?,?)"), sk = db.prepare("INSERT INTO site_kpis VALUES (?,?,?,?,?,?,?)");
    for (const s of P.sites) { si.run(s.id, s.name, s.country, s.dir, s.errors, s.warnings, s.models.length, s.models.filter((m) => m.state === "approved").length, P.at); for (const r of s.runs) for (const [k, v] of Object.entries(r.kpis)) if (Number.isFinite(v.mean)) sk.run(s.id, r.scenario, r.id, k, v.mean, v.lo, v.hi); }
    db.exec("COMMIT");
  } finally { db.close(); }
  const file = join(out, "portfolio.html"); writeFileSync(file, html(P)); return { file, P };
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function html(P) {
  const T = P.ent.targets || null, KEYS = ["throughput", "starved_min", "lead_time", "wait_mover", "wip"];
  const fmt = (k, v) => k.startsWith("util.") ? (v * 100).toFixed(0) + "%" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  const siteCard = (s) => `<section><h2>${esc(s.name)} <span>${esc(s.id)} · ${esc(s.country || "country not set")} · ${esc(s.productLines.join(", ") || "no product lines")}</span></h2>
<p class="chips"><b class="${s.errors ? "bad" : "ok"}">${s.errors ? s.errors + " validation error(s)" : "valid"}</b> ${s.warnings} warning(s) · ${s.models.length} model(s): ${s.models.map((m) => `${esc(m.id)} <i class="st ${m.state}">${m.state}</i>`).join(" ") || "none"} · ${s.approvals} approval(s)</p>
${s.runs.length ? `<table><thead><tr><th>Scenario</th><th>Model</th>${KEYS.map((k) => `<th>${esc(MFKpi.label(k)[0])}<br><span>${esc(MFKpi.label(k)[1])}</span></th>`).join("")}<th>Utilisation</th><th>Assumed values</th><th>Run</th></tr></thead><tbody>
${s.runs.map((r) => `<tr><td>${esc(r.scenario)}</td><td>${esc(r.model)}</td>${KEYS.map((k) => { const v = r.kpis[k]; return v ? `<td class="n ${light(k, v, T)}">${fmt(k, v.mean)}</td>` : "<td></td>"; }).join("")}<td class="n">${Object.entries(r.kpis).filter(([k]) => k.startsWith("util.")).map(([k, v]) => `<span class="${light(k, v, T)}">${esc(k.slice(5))} ${fmt(k, v.mean)}</span>`).join("<br>")}</td><td class="n">${r.assumptions}</td><td><code>${esc(r.id)}</code><br><span>${esc(r.at.slice(0, 16).replace("T", " "))}</span></td></tr>`).join("")}</tbody></table>` : `<p class="m">No runs yet.</p>`}</section>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(P.ent.name || "Portfolio")} · Material Flow</title><style>
body{font:13px/1.45 "Segoe UI",system-ui,sans-serif;color:#1d2733;background:#f4f6f9;margin:0;padding:24px 32px}h1{font-size:20px;margin:0}header p{color:#66758a;margin:4px 0 20px}
section{background:#fff;border:1px solid #d8dee7;border-radius:6px;padding:14px 18px;margin-bottom:16px}h2{font-size:15px;margin:0 0 6px}h2 span,th span,td span,.m{color:#66758a;font-weight:400;font-size:12px}
table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border-bottom:1px solid #e5e9f0;padding:6px 8px;text-align:left;vertical-align:top}th{font-weight:600;background:#f8fafc}td.n{text-align:right;font-variant-numeric:tabular-nums}
.ok{color:#047857}.warn{color:#b45309}.bad{color:#b91c1c;font-weight:600}.chips b{font-weight:600}.st{font-style:normal;font-size:11px;padding:1px 6px;border-radius:8px;background:#eef2f7}.st.approved{background:#d1fae5}.st.reviewed{background:#fef3c7}
.sum{display:flex;gap:12px;margin-bottom:18px}.sum div{background:#fff;border:1px solid #d8dee7;border-radius:6px;padding:10px 16px}.sum b{display:block;font-size:20px}</style></head><body>
<header><h1>${esc(P.ent.name || "Portfolio")}</h1><p>${P.sites.length} site(s) · built ${esc(P.at.slice(0, 16).replace("T", " "))} · all values are model results (latest run per scenario, mean of replications) unless a site says otherwise${T ? ` · targets: ${esc(JSON.stringify(T))}` : ""}</p></header>
<div class="sum"><div><b>${P.sites.length}</b>sites</div><div><b>${P.sites.reduce((n, s) => n + s.models.length, 0)}</b>models</div><div><b>${P.sites.reduce((n, s) => n + s.models.filter((m) => m.state === "approved").length, 0)}</b>approved</div><div><b>${P.sites.reduce((n, s) => n + s.runs.length, 0)}</b>scenarios with results</div><div><b>${P.sites.reduce((n, s) => n + s.errors, 0)}</b>validation errors</div></div>
${P.sites.map(siteCard).join("")}
<script>window.MF={ready:Promise.resolve(1),prepared:1};window.MFPortfolio=${JSON.stringify({ sites: P.sites.length, runs: P.sites.reduce((n, s) => n + s.runs.length, 0) })};</script></body></html>`;
}
