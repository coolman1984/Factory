// Platform gate (PLATFORM_PLAN P7): every platform test in order, one line per row, receipt in dist/test/platform/gate.json.
// --quick skips the rows that need Excel or Chrome. Also checks that no company site data is tracked by git.
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const ROWS = [
  ["contract", ["tools/core/model-validator-test.mjs"], false],
  ["simulation", ["tools/core/sim-test.mjs"], false],
  ["plan-import (Excel COM)", ["tools/core/plan-import-test.mjs"], true],
  ["viewer (headless Chrome)", ["tools/core/viewer-test.mjs"], true],
  ["experiments..actual (Excel, Chrome)", ["tools/core/platform-test.mjs"], true],
  ["docs-check", ["tools/mf.mjs", "docs-check"], false],
];
export async function gate({ quick = false } = {}) {
  const res = []; let ok = true;
  for (const [name, args, heavy] of ROWS) {
    if (quick && heavy) { console.log(`SKIP ${name} (--quick)`); res.push({ name, skipped: true }); continue; }
    const t0 = Date.now(), r = spawnSync(process.execPath, ["--no-warnings", ...args], { encoding: "utf8", windowsHide: true, timeout: 15 * 60e3 });
    const pass = r.status === 0, last = (r.stdout || "").trim().split(/\r?\n/).pop() || (r.stderr || "").trim().split(/\r?\n/).pop();
    console.log(`${pass ? "PASS" : "FAIL"} ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s): ${last}`); if (!pass) { ok = false; console.log((r.stdout || "") + (r.stderr || "")); }
    res.push({ name, pass, seconds: (Date.now() - t0) / 1000, last });
  }
  let tracked = []; try { tracked = execFileSync("git", ["ls-files", "private", "dist", "docs/examples/site-demo/results"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean); } catch { /* not a git checkout */ }
  const priv = tracked.length === 0; console.log(`${priv ? "PASS" : "FAIL"} privacy: ${tracked.length} tracked file(s) under private/, dist/ or demo results`); if (!priv) { ok = false; console.log(tracked.slice(0, 10).join("\n")); }
  res.push({ name: "privacy", pass: priv });
  mkdirSync("dist/test/platform", { recursive: true }); writeFileSync("dist/test/platform/gate.json", JSON.stringify({ at: new Date().toISOString(), quick, ok, rows: res }, null, 1));
  console.log(ok ? "PASS platform gate" : "FAIL platform gate"); return ok;
}
if (process.argv[1] && process.argv[1].endsWith("platform-gate.mjs")) process.exitCode = (await gate({ quick: process.argv.includes("--quick") })) ? 0 : 1;
