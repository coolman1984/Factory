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
    assert.match(r.panel, /Factory Engine/); assert.match(r.panel, /on the trolley/); assert.match(r.title, /V8\.[123]/);
    if (await pg.ev("typeof MF.engine.shiftUI === 'function'")) {   // V8.2: shift run from the panel
      const sh = await pg.ev(`(() => { const r = MF.engine.shiftUI(); return { paths: r.paths.map(p => [p.id, p.trips, p.naive]), inv: r.invariants, html: document.getElementById("fe-out").innerText }; })()`);
      assert.ok(sh.paths.length > 0 && sh.paths.every(p => p[1] > 0 && p[1] <= p[2] * 1.01 + 1), `${tab}: shift trips ${JSON.stringify(sh.paths)}`);
      assert.deepEqual(sh.inv, []); assert.match(sh.html, /engine trips/);
    }
    if (await pg.ev("typeof MF.engine.journal === 'function'")) {   // V8.3: traffic + measured times in the shift run; Studio edits through the engine journal
      const t = await pg.ev(`(() => { const id = MF.D.flows[0].id, r = MF.engine.shiftUI({ hours: 1, aisleCapacity: 1, times: { [id]: { trip_s: 100, load_s: 20 } } }); return { p: r.paths[0], inv: r.invariants, zones: r.zones.length, html: document.getElementById("fe-out").innerText }; })()`);
      assert.equal(t.p.timeSource, "measured"); assert.ok(Math.abs(t.p.oneWay - 100) < 1e-6, `${tab}: measured trip time used (${t.p.oneWay})`); assert.deepEqual(t.inv, []); assert.match(t.html, /traffic s/);
      const j = await pg.ev(`new Promise(ok => { let n = 0; (function w() { if (MF.engine.journal() || ++n > 50) go(); else setTimeout(w, 100); })();
        function go() { const X = MFX, j0 = MF.engine.journal(); if (!j0) return ok({ none: true });
          const name0 = X.doc.flows[0].name || ""; X.commit("rename path", () => { X.doc.flows[0].name = name0 + " (j)"; }); const j1 = MF.engine.journal();
          X.undo(); const j2 = MF.engine.journal(), afterUndo = X.doc.flows[0].name;
          const node0 = X.doc.flows[0].steps[1].node; let threw = null; try { X.commit("bad stop", () => { X.doc.flows[0].steps[1].node = 987654; }); } catch (e) { threw = e.message; }
          const j3 = MF.engine.journal(), nodeAfter = X.doc.flows[0].steps[1].node;
          const nFlows = X.doc.flows.length; X.commit("duplicate path", () => { X.doc.flows.push(JSON.parse(JSON.stringify(X.doc.flows[0]))); }); const flowsAfter = X.doc.flows.length;
          setTimeout(() => { const warn = MF.engine.journal().warning, eu = MF.engine.journalUndo(), flowsEU = X.doc.flows.length, er = MF.engine.journalRedo(), flowsER = X.doc.flows.length, eu2 = MF.engine.journalUndo(), j4 = MF.engine.journal();
            ok({ j0, j1, j2, j3, j4, nFlows, flowsAfter, warn, name0, afterUndo, node0, nodeAfter, threw, eu: eu && eu.ok, er: er && er.ok, eu2: eu2 && eu2.ok, flowsEU, flowsER, flowsEnd: X.doc.flows.length, html: document.getElementById("fe-journal").innerText }); }, 2500); } })`);
      assert.ok(!j.none, `${tab}: the layout journal started`);
      assert.equal(j.j1.revision, j.j0.revision + 1, `${tab}: a Studio edit is one journal command`); assert.equal(j.j1.history.at(-1).type, "doc.edit");
      assert.ok(j.j2.history.at(-1).type === "doc.undo" || j.j2.history.at(-1).label === "Studio undo", `${tab}: Studio undo is recorded as an undo (${JSON.stringify(j.j2.history.at(-1))})`); assert.equal(j.afterUndo, j.name0);
      assert.equal(j.nodeAfter, j.node0, `${tab}: an edit to an unknown stop is rolled back`); assert.equal(j.j3.history.filter(h => h.label === "Studio edit").length, j.j2.history.filter(h => h.label === "Studio edit").length, `${tab}: the bad edit is not in the journal`);
      assert.ok(j.flowsAfter === j.nFlows + 1 && /duplicate/i.test(j.warn), `${tab}: a Studio edit the scene validator flags is kept and warned (${j.warn}; ${j.flowsAfter} vs ${j.nFlows})`);
      assert.ok(j.eu && j.flowsEU === j.nFlows && j.er && j.flowsER === j.nFlows + 1 && j.eu2 && j.flowsEnd === j.nFlows, `${tab}: engine undo/redo change the Studio scene (${j.flowsEU}/${j.flowsER}/${j.flowsEnd} vs ${j.nFlows})`); assert.ok(j.j4.verified, `${tab}: journal replays to the current scene`);
      console.log(`  ${tab}: shift with traffic (${t.zones} shared section(s)) + measured time OK; journal r${j.j4.revision}: edit, Studio undo, bad stop (${j.j3.note || j.threw || "rejected by the Studio"}), duplicate path kept with a validator warning, engine undo + redo OK`);
    }
    await pg.wait(600);
    const shot = await pg.call("Page.captureScreenshot", { format: "png" }); writeFileSync(`${out}/${tab}-engine-panel.png`, Buffer.from(shot.data, "base64"));
    assert.deepEqual(pg.errors, [], `${tab}: page errors`);
    console.log(`PASS ${tab}: ${r.sum.length} path(s) on Factory Engine ${r.version}; mid-trip: ${r.s.activity}; panel + rebuild OK`);
  } catch (e) { fail++; console.log(`FAIL ${tab}: ${e.message}`); } finally { await pg.close(); }
}
console.log(fail ? `FAIL: ${fail} tab(s)` : `PASS: all tabs; screenshots in ${out}`); process.exit(fail ? 1 : 0);
