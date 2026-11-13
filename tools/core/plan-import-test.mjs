// Minimum test of P2: a synthetic plan workbook made through Excel COM is imported into a temporary copy of the demo
// site; the plan validates against the site, demand-core gives the expected orders per day, and a run uses it.
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { importPlan, PWSH } from "./import-node.mjs";
import { runScenario } from "./sim-node.mjs";
let bad = 0; const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) bad++; };
const dir = mkdtempSync(join(tmpdir(), "mf-plan-")), site = join(dir, "site-demo"), xlsx = join(dir, "Plan W48.xlsx");
try {
  cpSync("docs/examples/site-demo", site, { recursive: true, filter: (s) => !s.includes("results") }); cpSync("docs/examples/sample.scene.json", join(dir, "sample.scene.json"));
  const ps = `$ErrorActionPreference='Stop'; $xl = New-Object -ComObject Excel.Application; $xl.Visible=$false; $xl.DisplayAlerts=$false
try { $wb = $xl.Workbooks.Add(); $p = $wb.Worksheets.Item(1); $p.Name = 'Plan'; $b = $wb.Worksheets.Add([Type]::Missing, $p); $b.Name = 'BOM'
$p.Cells.Item(1,1)='Line'; $p.Cells.Item(1,2)='Model'; $p.Cells.Item(1,3)='Per_hour'; $p.Cells.Item(1,4)='Shift'
$p.Cells.Item(2,1)='assy-l1'; $p.Cells.Item(2,2)='TV-DEMO-55'; $p.Cells.Item(2,3)=80; $p.Cells.Item(2,4)='A+B'
$b.Cells.Item(1,1)='model'; $b.Cells.Item(1,2)='material'; $b.Cells.Item(1,3)='per_unit'
$b.Cells.Item(2,1)='TV-DEMO-55'; $b.Cells.Item(2,2)='front-cover'; $b.Cells.Item(2,3)=1
$b.Cells.Item(3,1)='TV-DEMO-55'; $b.Cells.Item(3,2)='back-cover'; $b.Cells.Item(3,3)=2
$wb.SaveAs('${xlsx.replace(/'/g, "''")}', 51); $wb.Close($false) } finally { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }`;
  execFileSync(PWSH, ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "pipe", windowsHide: true });
  const r = importPlan(xlsx, site, { from: "2026-11-23", days: 5, name: "w48" });
  ok(!r.errors.length, `imported ${r.plan.lines.length} plan line(s) and ${r.plan.bom.length} BOM row(s) through Excel COM; ${r.errors.length} error(s) ${JSON.stringify(r.errors)}`);
  ok(r.plan.lines[0].rate.per_hour === 80 && r.plan.bom[1].per_unit === 2, "values read: 80 per hour, 2 back covers per unit");
  writeFileSync(join(site, "scenarios", "w48.json"), JSON.stringify({ format: "mf-scenario", version: 1, base: "models/parts.model.json", plan: "plans/w48.plan.json", ops: [], run: { days: 5, warmup: 0, replications: 2, seed: 1 } }));
  const run = await runScenario(join(site, "scenarios", "w48.json"), { db: false });
  // 80 units/h x 16 h - 1 h breaks = 15 h x 80 = 1200 front covers/day = 30 lots; back covers 2400 = 60 lots
  const d = run.receipt.demand;
  ok(Math.abs(d["parts-to-line"].ordersPerDay - 30) < 1e-9 && Math.abs(d["parts-kanban"].ordersPerDay - 60) < 1e-9, `demand: ${d["parts-to-line"].ordersPerDay} and ${d["parts-kanban"].ordersPerDay} orders/day (expected 30 and 60)`);
  ok(Math.abs(run.receipt.kpis.delivered.mean - 5 * 90) <= 3, `simulated deliveries ${run.receipt.kpis.delivered.mean} over 5 days (expected about 450)`);
} finally { try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch (e) { console.log(`note: temporary folder not removed (${e.code}): ${dir}`); } }
console.log(bad ? `FAIL ${bad}` : "PASS plan import"); process.exitCode = bad ? 1 : 0;
