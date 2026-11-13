// Imports into a site folder (PLATFORM_PLAN P2, P8): production plans from Excel (through COM: tools/core/import-plan.ps1)
// and shop-floor event exports (RFID / MES CSV) for the plan-vs-actual comparison.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { checkSite, MFModel } from "./site-node.mjs";

// PowerShell 7: Windows PowerShell 5 fails on this PC with TYPE_E_LIBNOTREGISTERED when binding Excel's type library
export const PWSH = process.env.MF_PWSH || "pwsh.exe";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const num = (v) => typeof v === "number" ? v : Number(String(v).replace(",", "."));

/* plan: xlsx -> <site>/plans/<name>.plan.json (validated against the site). */
export function importPlan(xlsx, siteDir, { from, days = 5, name, sheet = "Plan", bomSheet = "BOM" } = {}) {
  if (!existsSync(xlsx)) throw new Error(`file not found: ${xlsx}`);
  if (!from) throw new Error("--from YYYY-MM-DD required (first day of the plan)");
  const out = execFileSync(PWSH, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", resolve("tools/core/import-plan.ps1"), "-Path", resolve(xlsx), "-PlanSheet", sheet, "-BomSheet", bomSheet], { encoding: "utf8", windowsHide: true, maxBuffer: 64 << 20 });
  const raw = JSON.parse(out.trim().split(/\r?\n/).pop()), site = JSON.parse(readFileSync(join(siteDir, "site.json"), "utf8"));
  const arr = (x) => x == null ? [] : Array.isArray(x) ? x : [x];
  const plan = { format: "mf-plan", version: 1, site: site.id, from, days: +days,
    source: { file: basename(xlsx), sheet: `${sheet} + ${bomSheet}`, hash: "sha256:" + sha(readFileSync(xlsx)), importedAt: new Date().toISOString(), via: "Excel COM" },
    lines: arr(raw.plan).map((r) => ({ line: String(r.line).trim(), model: String(r.model).trim(), rate: { per_hour: num(r.per_hour) }, ...(r.shift ? { shift: String(r.shift).trim() } : {}), row: r.row })),
    bom: arr(raw.bom).map((r) => ({ model: String(r.model).trim(), material: String(r.material).trim().toLowerCase(), per_unit: num(r.per_unit), row: r.row })) };
  mkdirSync(join(siteDir, "plans"), { recursive: true });
  const file = join(siteDir, "plans", `${name || basename(xlsx).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-")}.plan.json`);
  const r = MFModel.validatePlan(plan, {});
  writeFileSync(file, JSON.stringify(plan, null, 1) + "\n");
  const chk = checkSite(siteDir), mine = chk.files.find((f) => resolve(f.file) === resolve(file));
  return { file, plan, errors: mine ? mine.errors : r.errors, warnings: mine ? mine.warnings : r.warnings };
}

/* events: CSV with header time,carrier,stop[,flow] (time = seconds from the run start or ISO date-time with --start).
   Each carrier's reads in time order form trips: a trip starts at the first stop of a flow's route and ends at its last.
   Returns per flow: trips, mean lead time, per-step mean times (stop to next stop). */
export function readEvents(csvFile, { start } = {}) {
  const lines = readFileSync(csvFile, "utf8").split(/\r?\n/).filter((l) => l.trim()), head = lines.shift().split(",").map((h) => h.trim().toLowerCase());
  const ix = (k) => { const i = head.indexOf(k); if (i < 0 && k !== "flow") throw new Error(`${csvFile}: column "${k}" required (found ${head.join(", ")})`); return i; };
  const it = ix("time"), ic = ix("carrier"), is = ix("stop"), iflow = ix("flow"), t0 = start ? Date.parse(start) : null;
  return lines.map((l, n) => { const c = l.split(","), tv = c[it].trim(), t = /^[\d.]+$/.test(tv) ? +tv : (Date.parse(tv) - t0) / 1000; if (!Number.isFinite(t)) throw new Error(`${csvFile} line ${n + 2}: bad time ${tv}`); return { t, carrier: c[ic].trim(), stop: c[is].trim(), flow: iflow >= 0 ? (c[iflow] || "").trim() : "" }; }).sort((a, b) => a.t - b.t);
}
export function tripsFromEvents(events, routes) {
  // routes: { flowId: [stop ids in order] }
  const byCarrier = new Map(); for (const e of events) { if (!byCarrier.has(e.carrier)) byCarrier.set(e.carrier, []); byCarrier.get(e.carrier).push(e); }
  const out = {}; for (const f of Object.keys(routes)) out[f] = { trips: 0, lead: [], steps: routes[f].slice(1).map(() => []) };
  for (const evs of byCarrier.values()) {
    let cur = null;
    for (const e of evs) {
      if (!cur) { const f = Object.keys(routes).find((k) => (!e.flow || e.flow === k) && routes[k][0] === e.stop); if (f) cur = { f, k: 0, t0: e.t, last: e.t }; continue; }
      const R = routes[cur.f], want = R[cur.k + 1];
      if (e.stop === want) { out[cur.f].steps[cur.k].push(e.t - cur.last); cur.k++; cur.last = e.t; if (cur.k === R.length - 1) { out[cur.f].trips++; out[cur.f].lead.push(e.t - cur.t0); cur = null; } }
      else if (e.stop === R[0]) cur = { f: cur.f, k: 0, t0: e.t, last: e.t };   // trip restarted
    }
  }
  const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  for (const f of Object.keys(out)) { const o = out[f]; o.leadMean = mean(o.lead); o.stepMeans = o.steps.map(mean); delete o.steps; delete o.lead; }
  return out;
}
