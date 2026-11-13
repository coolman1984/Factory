// Minimum test of P3: run a scenario, build the run viewer, open it in headless Chrome (fresh profile, tools/v7/cdp.mjs),
// seek to several times and compare the open orders shown with the simulation's own state; no page errors; screenshot.
// Usage: node tools/core/viewer-test.mjs [scenario.json] [out dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runScenario, MFSim } from "./sim-node.mjs";
import { buildViewer } from "./viewer.mjs";
import { openPage } from "../v7/cdp.mjs";
const scen = process.argv[2] || "docs/examples/site-demo/scenarios/base.json", outDir = process.argv[3] || "dist/test/platform";
mkdirSync(outDir, { recursive: true });
let bad = 0; const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) bad++; };
const r = await runScenario(scen, { db: false });
const file = resolve(outDir, `view-${r.receipt.site}-${r.receipt.scenario}.html`), v = buildViewer(r.dir, file);
console.log(`viewer ${file} (${(v.bytes / 1e6).toFixed(2)} MB)`);
const pg = await openPage(file, "", { query: "", size: "1600,900" });
try {
  await pg.wait(800);
  const H = r.log.horizon, grid = []; for (let t = 0; t < H; t += 97) grid.push([t, MFSim.state(r.log, t).length]);
  const times = grid.sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5).map((g) => g[0]);
  for (const t of times) {
    const s = await pg.ev(`(() => { MFView.seek(${t}); return JSON.stringify(MFView.state(${t})); })()`), st = JSON.parse(s);
    const ref = MFSim.state(r.log, t), refShown = ref.filter((o) => o.phase !== "returning").length, refRet = ref.length - refShown;
    ok(st.shown === refShown && st.returning === refRet, `t=${t} s: viewer shows ${st.shown} order(s) + ${st.returning} returning; simulation state ${refShown} + ${refRet}`);
  }
  // pick a busy moment for the picture
  let best = times[0], most = -1; for (let t = 0; t < H; t += 600) { const n = MFSim.state(r.log, t).length; if (n > most) { most = n; best = t; } }
  await pg.ev(`(() => { MFView.seek(${best}); return 1; })()`); await pg.wait(300);
  const shot = await pg.call("Page.captureScreenshot", { format: "png" }), png = join(outDir, `view-${r.receipt.site}-${r.receipt.scenario}.png`);
  writeFileSync(png, Buffer.from(shot.data, "base64")); console.log(`screenshot ${png} (t=${best} s, ${most} open orders)`);
  ok(!pg.errors.length, `no page errors${pg.errors.length ? ": " + pg.errors.slice(0, 2).join(" | ") : ""}`);
} finally { await pg.close(); }
console.log(bad ? `FAIL ${bad}` : "PASS viewer"); process.exitCode = bad ? 1 : 0;
