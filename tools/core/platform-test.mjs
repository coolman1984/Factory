// Minimum tests of P4 to P8 on a temporary copy of the demo site (company data untouched):
// P4 experiment grid + find + Excel report through COM (read back through COM) + run comparison
// P5 portfolio page and database (headless Chrome, no page errors)
// P6 CAD walls from the CAD package (if present) + alignment maths
// P7 approval refused without a run, accepted with one; history; recheck finds no change
// P8 reads exported from a run and compared with it: identical trip times
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runExperiment, compareRuns } from "./exp-node.mjs";
import { runScenario } from "./sim-node.mjs";
import { setState, history } from "./govern-node.mjs";
import { recheck } from "./recheck-node.mjs";
import { exportReads, compareActual } from "./actual-node.mjs";
import { buildPortfolio } from "./portfolio-node.mjs";
import { cadToLayout, similarity } from "./cad-layout.mjs";
import { PWSH } from "./import-node.mjs";
import { MFModel } from "./site-node.mjs";
let bad = 0; const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) bad++; };
const dir = mkdtempSync(join(tmpdir(), "mf-platform-")), site = join(dir, "sites", "site-demo");
try {
  cpSync("docs/examples/site-demo", site, { recursive: true, filter: (s) => !/[\\/]results([\\/]|$)/.test(s) }); cpSync("docs/examples/sample.scene.json", join(dir, "sites", "sample.scene.json"));
  // P4
  const ex = await runExperiment(join(site, "experiments", "staffing.json"), { excel: true, log: () => {} });
  ok(ex.summary.rows.length === 6 && existsSync(join(ex.out, "report.html")), `experiment grid: ${ex.summary.rows.length} points, HTML report`);
  const back = execFileSync(PWSH, ["-NoProfile", "-NonInteractive", "-Command", `$xl=New-Object -ComObject Excel.Application;$xl.Visible=$false;$xl.DisplayAlerts=$false;try{$wb=$xl.Workbooks.Open('${join(ex.out, "report.xlsx").replace(/'/g, "''")}',0,$true);$n=@($wb.Worksheets|%{$_.Name}) -join ',';$r=$wb.Worksheets.Item(1).UsedRange.Rows.Count;$wb.Close($false);"$n|$r"}finally{$xl.Quit()}`], { encoding: "utf8", windowsHide: true }).trim();
  ok(back === "Results,Receipt|7", `Excel report read back through COM: ${back} (sheets|rows)`);
  const hc = await runExperiment(join(site, "experiments", "headcount.json"), { log: () => {} });
  ok(hc.summary.found && hc.summary.found.value === 2, `find: smallest AGV count meeting the targets = ${hc.summary.found && hc.summary.found.value} (expected 2)`);
  const one = hc.summary.rows[0], two = hc.summary.rows[1], cmp = compareRuns({ kpis: one.kpis }, { kpis: two.kpis }).find((x) => x.key === "wait_mover");
  ok(cmp && cmp.proven && cmp.diff < 0, `compare 1 vs 2 AGVs: wait for a mover ${cmp.a.toFixed(1)} -> ${cmp.b.toFixed(1)} s, difference proven`);
  // P7
  // an edited model has no run yet: approval must be refused

  const mf = join(site, "models", "parts.model.json"), m = JSON.parse(readFileSync(mf, "utf8")); m.flows[0].lot.units = 41; writeFileSync(mf, JSON.stringify(m));
  let refused = ""; try { await setState(site, "parts", "approved", { by: "test" }); } catch (e) { refused = e.message; }
  ok(/refused: no recorded run/.test(refused), `approval refused after a model edit without a run: "${refused.slice(0, 60)}..."`);
  await setState(site, "parts", "reviewed", { by: "test", note: "checked" });
  const base = await runScenario(join(site, "scenarios", "base.json"));
  const ap = await setState(site, "parts", "approved", { by: "test", note: "baseline" });
  ok(ap.run === base.receipt.id && history(site).length === 2, `approved with run ${ap.run}; history has ${history(site).length} entries`);
  const rc = await recheck(site); ok(rc.length === 1 && !rc[0].flags.length && !rc[0].inputsChanged, `recheck of the approved baseline: ${rc[0] ? (rc[0].flags.join("; ") || "same") : "none"}`);
  // P8
  const csv = join(dir, "reads.csv"), n = exportReads(base.dir, csv), cmpA = compareActual(base.dir, csv);
  const worst = Math.max(...cmpA.rows.filter((r) => r.simTrip).map((r) => Math.abs(r.diff)));
  ok(n > 0 && cmpA.rows.every((r) => r.actualTrips === r.simTrips) && worst < 1e-6, `plan vs actual round trip: ${n} reads, ${cmpA.rows.map((r) => `${r.flow} ${r.actualTrips}/${r.simTrips} trips`).join(", ")}, worst difference ${worst.toExponential(1)}`);
  // P5
  const ent = join(dir, "portfolio", "enterprise.json"); mkdirSync(join(dir, "portfolio"), { recursive: true });
  writeFileSync(ent, JSON.stringify({ format: "mf-enterprise", version: 1, name: "Test portfolio", sites: ["../sites/site-demo"], targets: { starved_min: 0, wait_mover: 300, util_max: 0.85 } }));
  const P = buildPortfolio(ent);
  ok(P.P.sites.length === 1 && P.P.sites[0].runs.length === 1 && P.P.sites[0].runs[0].id === base.receipt.id && existsSync(join(dir, "portfolio", "portfolio.sqlite")), `portfolio: ${P.P.sites.length} site, ${P.P.sites[0].runs.length} scenario(s) with results, approved ${P.P.sites[0].models.filter((x) => x.state === "approved").length}`);
  const { openPage } = await import("../v7/cdp.mjs"), pg = await openPage(P.file, "", { query: "", size: "1400,900" });
  try { const s = JSON.parse(await pg.ev("JSON.stringify(MFPortfolio)")); const shot = await pg.call("Page.captureScreenshot", { format: "png" }); writeFileSync("dist/test/platform/portfolio.png", Buffer.from(shot.data, "base64")); ok(s.sites === 1 && !pg.errors.length, `portfolio page opens with no page errors (screenshot dist/test/platform/portfolio.png)`); } finally { await pg.close(); }
  // P6
  const T = similarity([[0, 0, 10, 20], [1000, 0, 10, 21]]); ok(Math.abs(T.scale - 0.001) < 1e-12 && Math.abs(T.rotDeg - 90) < 1e-9, `alignment: scale ${T.scale}, rotation ${T.rotDeg} deg`);
  const db = "dist/SEEG_Y26_AI_Package/layout.sqlite";
  if (existsSync(db)) { const L = cadToLayout(db, { box: [600000, 400000, 700000, 480000] }), v = MFModel.validateLayout(L); ok(L.segments.length > 100 && !v.errors.length, `CAD walls: ${L.segments.length} segments, layout validates`); }
  else console.log("SKIP CAD walls (no CAD package)");
} finally { try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch (e) { console.log(`note: temporary folder not removed (${e.code}): ${dir}`); } }
console.log(bad ? `FAIL ${bad}` : "PASS platform P4-P8"); process.exitCode = bad ? 1 : 0;
