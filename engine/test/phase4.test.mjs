// Engine 0.3 acceptance tests: traffic zones (WP3.2), serial numbers + test/repair loop + container packing (Phase 4),
// and the layout journal (edits as commands with undo/redo, WP2.x).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blueprintToModel } from "../src/blueprint.js";
import { World } from "../src/world.js";
import { packPlan } from "../src/packing.js";
import { Journal, diff, applyPatch, invert } from "../src/journal.js";

const bp = JSON.parse(readFileSync(new URL("../../examples/factory-blueprint.example.json", import.meta.url), "utf8"));
const scenario = JSON.parse(readFileSync(new URL("../scenarios/demo.scenario.json", import.meta.url), "utf8"));
const H = h => Math.round(h * 3600 * 1000);

// Two trolleys run loops in opposite directions through one shared one-lane section (capacity 1).
function aisleModel(capacity = 1) {
  const go = (to, zones) => ({ k: "leg", to, travelSeconds: 20, dwellSeconds: 0, zones });
  const trip = (a, b) => [{ k: "load", seconds: 5 }, go(null, []), go(null, ["aisle"]), go(b, []), { k: "unload", seconds: 5 }, go(null, []), go(null, ["aisle"]), go(a, [])];
  return { format: "fe-model", version: 1, name: "aisle", tickPerSecond: 1000, seed: 3,
    items: [{ id: "L", unit: "lot" }, { id: "R", unit: "lot" }], locations: [{ id: "west" }, { id: "east" }], zones: [{ id: "aisle", capacity }],
    pools: [{ id: "trolleys", kind: "carrier", units: [{ id: "t1" }, { id: "t2" }] }],
    policies: [{ id: "eastbound", kind: "loop", item: "L", from: "west", to: "east", carrier: "t1", actions: trip("west", "east") },
               { id: "westbound", kind: "loop", item: "R", from: "east", to: "west", carrier: "t2", actions: trip("east", "west") }],
    initial: { stock: [{ location: "west", item: "L", qty: 1000 }, { location: "east", item: "R", qty: 1000 }] } };
}
const occupancy = log => { const open = new Map(), spans = []; for (const e of log) { if (e.type === "leg.start" && e.zones) open.set(e.mission, e.t); if (e.type === "leg.arrive" && open.has(e.mission)) { spans.push([open.get(e.mission), e.t]); open.delete(e.mission); } } return spans; };

test("WP3.2 traffic: a one-lane section admits one trolley at a time; opposite trolleys wait, never deadlock; resume is exact", () => {
  const w = new World(aisleModel(1), { checkInvariants: true }).runUntil(H(1)), r = w.report();
  const spans = occupancy(w.log).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] >= spans[i - 1][1], "two trolleys were in the one-lane section at the same time");
  const z = r.zones[0]; assert.ok(z.waits > 0 && z.wait_s > 0, "opposite trolleys must have waited"); assert.ok(z.utilisation <= 1);
  for (const p of r.policies) assert.ok(p.done > 20, `${p.id} kept running (no deadlock): ${p.done} trips`);
  const wide = new World(aisleModel(2)).runUntil(H(1)).report(); assert.equal(wide.zones[0].waits, 0, "a two-lane section causes no waits");
  assert.ok(wide.policies[0].done >= r.policies[0].done);
  const a = new World(aisleModel(1)); a.runUntil(H(0.37)); const b = World.restore(aisleModel(1), JSON.parse(JSON.stringify(a.snapshot())));
  a.runUntil(H(1)); b.runUntil(H(1)); assert.equal(b.fingerprint(), a.fingerprint());
  assert.ok(w.eventsOf("zone.wait").length > 0);
});

test("WP3.2 traffic on the route graph: narrow aisles become one-lane zones and legs are split per edge", () => {
  const m = blueprintToModel(bp, { ...scenario, traffic: { one_lane_below_m: 2.6 } });
  assert.ok(m.zones.length > 0 && m.graph.edges.some(e => e.zone));
  const w = new World(m, { checkInvariants: true }).runUntil(H(2));
  assert.ok(w.log.some(e => e.type === "leg.start" && e.zones && e.zones[0].startsWith("lane:")), "graph legs carry their lane zones");
  assert.deepEqual(w.report().invariants, []);
});

test("Phase 4: every TV has one serial number from assembly to packing; failed units go to repair and come back", () => {
  const m = blueprintToModel(bp, { ...scenario, quality: { PROC_TEST: { pass_rate: 0.5, repair_s: 60 } } });
  const w = new World(m, { checkInvariants: true }).runUntil(H(8)), r = w.report();
  assert.deepEqual(r.invariants, []);
  const q = r.quality[0]; assert.equal(q.station, "PROC_TEST"); assert.ok(q.failed > 0 && q.passed > 0); assert.ok(q.retests > 0, "repaired units are tested again");
  const packed = w.ledger.locations; let checked = 0;
  for (const [loc] of packed) for (const sn of w.ledger.serialsAt(loc, "TV_PACKED")) {
    const t = w.trace(sn), kinds = t.events.map(e => e.type);
    assert.ok(kinds.includes("test.pass") && kinds.filter(k => k === "station.finish").length >= 3, `${sn}: assembled, tested and packed under one number`);
    assert.equal(kinds.filter(k => k === "test.fail").length, t.fails); checked++;
  }
  assert.ok(checked > 0, "some TVs were packed");
  const repaired = Object.entries(w.testedSerials).filter(([, h]) => h.fails > 0).map(([sn]) => sn);
  assert.ok(repaired.length > 0); const t = w.trace(repaired[0]).events.map(e => e.type);
  assert.ok(t.indexOf("test.fail") < t.lastIndexOf("station.finish"), "a failed TV is repaired and re-tested");
  // resume with serials is exact
  const a = new World(m); a.runUntil(H(3)); const b = World.restore(m, JSON.parse(JSON.stringify(a.snapshot()))); a.runUntil(H(8)); b.runUntil(H(8));
  assert.equal(b.fingerprint(), a.fingerprint());
});

test("Phase 4 packing plan: grid count, mixed orientation, payload limit; the sample reports its container plan", () => {
  assert.equal(packPlan({ inner_m: [10, 2, 2] }, { size_m: [1, 1, 1] }).perContainer, 40);
  const mixed = packPlan({ inner_m: [11.8, 2.2, 2.5] }, { size_m: [1.36, 0.17, 0.86] });
  assert.equal(mixed.perLayer, 101); assert.equal(mixed.layers, 2); assert.equal(mixed.perContainer, 202); assert.equal(mixed.blocks.length, 2);
  const heavy = packPlan({ inner_m: [10, 2, 2], maxPayloadKg: 300 }, { size_m: [1, 1, 1], kg: 10 }); assert.equal(heavy.perContainer, 30); assert.equal(heavy.limitedBy, "payload");
  assert.equal(packPlan({ inner_m: [2, 2, 0.5] }, { size_m: [1, 1, 1] }).perContainer, 0);
  assert.equal(packPlan({ inner_m: [2, 2, 0.5] }, { size_m: [1, 1, 1] }, { allowTipping: true }).perContainer, 0);
  const r = new World(blueprintToModel(bp, scenario)).runUntil(H(8)).report();
  assert.equal(r.shipping.location, "SHIP_CONTAINER"); assert.equal(r.shipping.per_container, 202); assert.ok(Array.isArray(r.shipping.packing_list));
});

test("WP2.x layout journal: edits are checked commands with exact undo/redo, refusals change nothing, history verifies", () => {
  const scene = { title: "demo", nodes: { 1: { x: 0, y: 0 }, 2: { x: 5, y: 0 } }, flows: [{ id: "f1", steps: [{ node: 1 }, { node: 2 }] }] };
  const validate = d => d.flows.flatMap(f => f.steps.filter(s => !d.nodes[s.node]).map(s => `${f.id}: unknown stop ${s.node}`));
  const J = new Journal(scene, { validate, name: "scene" });
  const moved = JSON.parse(JSON.stringify(scene)); moved.nodes[2].x = 7; moved.flows[0].steps.push({ node: 1 });
  const e1 = J.submit({ command_id: "c1", expected_revision: 0, type: "doc.edit", payload: { label: "move stop 2", doc: moved } });
  assert.ok(e1.ok && e1.revision === 1 && e1.result.ops >= 2);
  assert.ok(J.submit({ command_id: "c1", type: "doc.edit", payload: { doc: scene } }).duplicate, "repeated command id changes nothing");
  assert.equal(J.submit({ command_id: "c2", expected_revision: 0, type: "doc.edit", payload: { doc: scene } }).code, "stale_revision");
  const bad = JSON.parse(JSON.stringify(moved)); bad.flows[0].steps[0].node = 99;
  const refused = J.submit({ command_id: "c3", type: "doc.edit", payload: { label: "bad stop", doc: bad } });
  assert.equal(refused.code, "invalid_edit"); assert.match(refused.reason, /unknown stop 99/); assert.deepEqual(J.current, moved); assert.equal(J.revision, 1);
  assert.deepEqual(J.peekUndo(), scene);
  assert.ok(J.submit({ command_id: "u1", type: "doc.undo" }).ok); assert.deepEqual(J.current, scene);
  assert.ok(J.submit({ command_id: "r1", type: "doc.redo" }).ok); assert.deepEqual(J.current, moved);
  assert.equal(J.submit({ command_id: "r2", type: "doc.redo" }).code, "nothing_to_redo");
  assert.ok(J.verify(scene), "replaying the journal from the first document gives the current one");
  assert.deepEqual(J.history().map(h => h.type), ["doc.edit", "doc.undo", "doc.redo"]);
  // patches are exact and refuse stale bases
  const p = diff(scene, moved); assert.deepEqual(applyPatch(scene, p), moved); assert.deepEqual(applyPatch(moved, invert(p)), scene);
  assert.throws(() => applyPatch(scene, invert(p)), /changed since|does not exist|differs/);
});
