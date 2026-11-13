// V8.1 minimum test (Node, no browser): for every scene and path, the engine-driven timeline equals the motion core's
// timeline within 0.5 us and at 6 decimals, the lot is delivered exactly once, invariants hold, and two runs give the same fingerprint.
// Usage: node tools/engine/bridge-test.mjs [scene files...]   (default: docs/examples + private/v7/scenes)
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { loadSceneCore, readProjects, layoutFor } from "../v7/scene-node.mjs";
import { loadBridge, elevatorFor } from "./engine-node.mjs";

const SC = loadSceneCore(), P = readProjects(), { MC, FE, bridge } = loadBridge();
const files = process.argv.slice(2).length ? process.argv.slice(2) : ["docs/examples", ...(existsSync("private/v7/scenes") ? ["private/v7/scenes"] : [])].flatMap(d => readdirSync(d).filter(f => f.endsWith(".scene.json")).map(f => d + "/" + f));
let paths = 0, steps = 0, worst = 0, fails = 0;
for (const file of files) {
  const sc = JSON.parse(readFileSync(file, "utf8")), L = layoutFor(P, sc.project), D = SC.toInternal(sc, L).data;
  for (const f of D.flows) {
    try {
      const E = elevatorFor(f, L.elevators), base = bridge.original(D, f, E), got = bridge.timeline(D, f, E), data = bridge.infoFor(f);
      assert.ok(data && data.ok, `${file} ${f.id}: engine fell back: ${data && data.error}`);
      assert.equal(got.items.length, base.items.length); assert.equal(data.moved, 0, `${file} ${f.id}: an undisturbed trip must not move a step`);
      for (let i = 1; i < base.items.length; i++) for (const k of ["t0", "tm", "t1"]) {
        const d = Math.abs(got.items[i][k] - base.items[i][k]); worst = Math.max(worst, d);
        assert.equal(got.items[i][k], base.items[i][k], `${file} ${f.id} step ${i} ${k}: engine ${got.items[i][k]} vs motion ${base.items[i][k]}`);
      }
      assert.equal(got.total, base.total);
      const kinds = data.log.map(e => e.type);
      assert.equal(kinds.filter(k => k === "load.end").length, 1); assert.equal(kinds.filter(k => k === "unload.end").length, 1); assert.ok(kinds.includes("mission.done"));
      const end = bridge.stateAt(data, got.total + 1); assert.equal(end.onTrolley, false); assert.ok(end.done);
      const again = bridge.runFlow(D, f, E, bridge.original(D, f, E)).data; assert.equal(again.fingerprint, data.fingerprint);
      paths++; steps += base.items.length - 1;
    } catch (e) { fails++; console.log("FAIL " + e.message); }
  }
  console.log(`${file}: ${D.flows.length} path(s)`);
}
// The engine really decides: another trolley holding the same lift for 100 s delays this path's lift step and every later step.
{
  const sc = JSON.parse(readFileSync("docs/examples/elevator.scene.json", "utf8")), L = layoutFor(P, sc.project), D = SC.toInternal(sc, L).data, f = D.flows[0], E = elevatorFor(f, L.elevators);
  const base = bridge.original(D, f, E), li = base.items.findIndex(it => it.s.lift);
  try {
    assert.ok(li > 0, "elevator sample has a lift step");
    const { model } = bridge.flowModel(D, f, base.items, E), lift = model.pools.find(p => p.kind === "lift").id, from = model.locations[0].id;
    const r = bridge.runFlow(D, f, E, base, { model: m => { m.pools[0].units.push({ id: "other" }); m.items.push({ id: "other-lot", unit: "lot" }); m.initial.stock.push({ location: from, item: "other-lot", qty: 1 }); },
      commands: [{ command_id: "other", type: "transport.request", payload: { item: "other-lot", qty: 1, from, to: from, carrier: "other", actions: [{ k: "load", seconds: 0 }, { k: "leg", to: from, travelSeconds: 100, lift }, { k: "unload", seconds: 0 }] } }] });
    assert.ok(r.data.log.some(e => e.type === "lift.wait" && e.mission === r.data.mission), "the trip waits for the lift");
    assert.ok(Math.abs(r.items[li].t0 - 100) < 1e-9, `lift step starts when the other trolley frees the car (got ${r.items[li].t0})`);
    const shift = r.items[li].t0 - base.items[li].t0; assert.ok(shift > 0 && r.data.moved > 0);
    for (let i = li; i < base.items.length; i++) assert.ok(Math.abs(r.items[i].t1 - base.items[i].t1 - shift) < 1e-6, `step ${i} shifts by the wait`);
    console.log(`engine authority: lift step delayed ${shift.toFixed(3)} s by a busy lift; ${r.data.moved} step(s) moved`);
  } catch (e) { fails++; console.log("FAIL engine authority: " + e.message); }
}
// Layout journal: an edit after which a path cannot play is refused and changes nothing; a viewer undo is recognised.
try {
  const J = bridge.makeJournal({ paths: ["a"] }, { validate: (d, w) => w === "next" && d.paths.includes("broken") ? ["path broken: cannot play on the engine"] : [] });
  const bad = J.edit({ paths: ["a", "broken"] }, "bad"); assert.equal(bad.ok, false); assert.deepEqual(J.J.current, { paths: ["a"] });
  assert.ok(J.edit({ paths: ["a", "b"] }, "good").ok); assert.ok(J.isUndoOf({ paths: ["a"] })); assert.ok(J.undo().ok); assert.ok(J.isRedoOf({ paths: ["a", "b"] }));
  console.log("journal: engine refusal changes nothing; undo/redo recognised");
} catch (e) { fails++; console.log("FAIL journal: " + e.message); }
console.log(fails ? `FAIL: ${fails} check(s)` : `PASS: ${paths} paths, ${steps} steps play from the Factory Engine ${FE.ENGINE_VERSION}, bit-identical to the motion core (worst ${worst} s)`);
process.exit(fails ? 1 : 0);
