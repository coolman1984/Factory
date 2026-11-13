// V8.1 minimum browser test: every tab loads with no page error, every path runs on the Factory Engine (no fallback),
// the Engine panel opens and reports the lot and the trolley, a Studio-style rebuild re-runs the engine, and a screenshot
// of the panel is saved. Usage: node tools/engine/smoke-81.mjs <player.html> [out dir=dist/test/smoke-81]
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { openPage } from "../v7/cdp.mjs";
const file = process.argv[2] || "dist/Material_Flow_Player_v8.1.html", out = process.argv[3] || "dist/test/smoke-81"; mkdirSync(out, { recursive: true });
let fail = 0;
for (const tab of ["inj1", "inj2", "eps", "press"]) {
  const pg = await openPage(file, tab);
  try {
    const r = await pg.ev(`(() => { MF.pause(); const sum = MF.engine.summary(); MF.engine.toggle(true);
      const f = MF.D.flows[MF.S.flow], mid = f.items[Math.min(2, f.items.length - 1)].t0 + .5; MF.seek(mid);
      const s = MF.engine.stateAt(mid), before = MF.engine.info().fingerprint; MF.x.rebuild(); const after = MF.engine.info();
      return new Promise(ok => setTimeout(() => ok({ sum, s, before, after: after && after.fingerprint, ok: after && after.ok, panel: document.getElementById("fe-panel").innerText, version: MF.engine.version, title: document.title }), 600)); })()`);
    assert.ok(r.sum.length > 0 && r.sum.every(x => x.ok), `${tab}: engine fallback ${JSON.stringify(r.sum.filter(x => !x.ok))}`);
    assert.ok(r.s.ok && r.s.onTrolley && /moving|at |lift/.test(r.s.activity), `${tab}: engine state at mid-trip ${JSON.stringify(r.s)}`);
    assert.ok(r.ok && r.after === r.before, `${tab}: rebuild re-runs the engine with the same result`);
    assert.match(r.panel, /Factory Engine/); assert.match(r.panel, /on the trolley/); assert.match(r.title, /V8\.[12]/);
    if (await pg.ev("typeof MF.engine.shiftUI === 'function'")) {   // V8.2: shift run from the panel
      const sh = await pg.ev(`(() => { const r = MF.engine.shiftUI(); return { paths: r.paths.map(p => [p.id, p.trips, p.naive]), inv: r.invariants, html: document.getElementById("fe-out").innerText }; })()`);
      assert.ok(sh.paths.length > 0 && sh.paths.every(p => p[1] > 0 && p[1] <= p[2] * 1.01 + 1), `${tab}: shift trips ${JSON.stringify(sh.paths)}`);
      assert.deepEqual(sh.inv, []); assert.match(sh.html, /engine trips/);
    }
    await pg.wait(600);
    const shot = await pg.call("Page.captureScreenshot", { format: "png" }); writeFileSync(`${out}/${tab}-engine-panel.png`, Buffer.from(shot.data, "base64"));
    assert.deepEqual(pg.errors, [], `${tab}: page errors`);
    console.log(`PASS ${tab}: ${r.sum.length} path(s) on Factory Engine ${r.version}; mid-trip: ${r.s.activity}; panel + rebuild OK`);
  } catch (e) { fail++; console.log(`FAIL ${tab}: ${e.message}`); } finally { await pg.close(); }
}
console.log(fail ? `FAIL: ${fail} tab(s)` : `PASS: all tabs; screenshots in ${out}`); process.exit(fail ? 1 : 0);
