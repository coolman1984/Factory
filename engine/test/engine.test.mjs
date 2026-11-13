// Minimum acceptance tests of the core. Each names the validation case (docs/10, V..) or invariant it protects.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { validateBlueprint, blueprintToModel } from "../src/blueprint.js";
import { World } from "../src/world.js";

const bp = JSON.parse(readFileSync(new URL("../../examples/factory-blueprint.example.json", import.meta.url), "utf8"));
const scenario = JSON.parse(readFileSync(new URL("../scenarios/demo.scenario.json", import.meta.url), "utf8"));
const H = h => Math.round(h * 3600 * 1000);
const copy = o => JSON.parse(JSON.stringify(o));

// tiny explicit-leg model: one lot, one trolley, a shared lift
function liftModel() {
  return { format: "fe-model", version: 1, name: "lift", tickPerSecond: 1000, seed: 1,
    items: [{ id: "A", unit: "lot" }, { id: "B", unit: "lot" }], locations: [{ id: "s1" }, { id: "s2" }],
    pools: [{ id: "trolleys", kind: "carrier", units: [{ id: "t1" }, { id: "t2" }] }, { id: "lift", kind: "lift", units: [{ id: "car" }] }],
    initial: { stock: [{ location: "s1", item: "A", qty: 1 }, { location: "s1", item: "B", qty: 1 }] } };
}
const legs = [{ k: "load", seconds: 0 }, { k: "leg", to: "s2", travelSeconds: 6, dwellSeconds: 1, lift: "lift" }, { k: "unload", seconds: 0 }];

test("V01/V21: sample blueprint passes; planted faults are caught with readable reasons", () => {
  assert.deepEqual(validateBlueprint(bp), []);
  const cases = [
    ["unknown_ref", b => { b.ports[0].owner_entity_id = "NOPE"; }],
    ["parent_cycle", b => { b.entities.find(e => e.entity_id === "PLANT").spatial_parent_id = "ZONE_RAW"; }],
    ["unit_mismatch", b => { b.processes[0].inputs[0].unit = "ea"; }],
    ["fractional_quantity", b => { b.processes[0].inputs[0].quantity = 2.4005; b.processes[0].inputs[0].unit = "kg"; }],
    ["no_route", b => { const f = b.material_flows[0], p = b.ports.find(x => x.port_id === f.to_port_id); b.navigation.edges = b.navigation.edges.filter(e => e.to_node !== p.navigation_node_id && e.from_node !== p.navigation_node_id); }],
    ["duplicate_id", b => { b.items.push({ ...b.items[0] }); }],
    ["prefab_version", b => { b.entities[1].prefab_version = "9.9.9"; }],
    ["no_source", b => { b.initial_conditions.handling_units = b.initial_conditions.handling_units.filter(h => h.contents[0].item_id !== "CARTON"); }],
    ["port_item", b => { b.material_flows[0].item_id = "CARTON"; }]
  ];
  for (const [code, mutate] of cases) { const b = copy(bp); mutate(b); const p = validateBlueprint(b); assert.ok(p.some(x => x.code === code), `${code} not caught: ${JSON.stringify(p)}`); assert.ok(p.every(x => x.message.length > 10)); }
});

test("V24 determinism: same seed gives the same fingerprint; another seed changes the breakdowns", () => {
  const run = s => new World(blueprintToModel(bp, { ...scenario, seed: s })).runUntil(H(8)).fingerprint();
  assert.equal(run(7), run(7)); assert.notEqual(run(7), run(8));
});

test("V04/V08/V14 invariants hold after every committed transition of a full run; material balances", () => {
  const w = new World(blueprintToModel(bp, scenario), { checkInvariants: true }).runUntil(H(8));
  const r = w.report(); assert.deepEqual(r.invariants, []);
  assert.ok(r.balance.TV_PACKED.produced > 0, "the slice produces packed TVs");
  assert.equal(r.balance.BARE_PCB.initial - r.balance.BARE_PCB.consumed, w.ledger.total("BARE_PCB"));
});

test("V16 resume: snapshot mid-run, JSON round trip, restore; final fingerprint equals the uninterrupted run", () => {
  const model = blueprintToModel(bp, scenario);
  const a = new World(model).runUntil(H(8));
  const b1 = new World(model).runUntil(H(3)), snap = JSON.parse(JSON.stringify(b1.snapshot()));
  const b2 = World.restore(model, snap).runUntil(H(8));
  assert.equal(b2.fingerprint(), a.fingerprint()); assert.equal(b2.logHash, a.logHash);
  assert.throws(() => World.restore({ ...model, seed: 99 }, snap), /different model/);
});

test("V05 commands: duplicate id runs once, stale revision is refused, a refused command leaves no partial state", () => {
  const w = new World(liftModel());
  const cmd = { command_id: "c1", type: "transport.request", payload: { item: "A", qty: 1, from: "s1", to: "s2", carrier: "t1", actions: legs } };
  const r1 = w.submit(cmd), r2 = w.submit(cmd);
  assert.ok(r1.ok); assert.ok(r2.duplicate); assert.equal(r2.result.mission, r1.result.mission); assert.equal(w.missions.size, 1);
  assert.equal(w.submit({ command_id: "c2", expected_revision: 0, type: "stock.receive", payload: { location: "s1", item: "A", qty: 1 } }).code, "stale_revision");
  const before = JSON.stringify(w.ledger.state());
  const bad = w.submit({ command_id: "c3", type: "transport.request", payload: { item: "A", qty: 5, from: "s1", to: "s2", carrier: "t2", actions: legs } });
  assert.equal(bad.ok, false); assert.equal(bad.code, "insufficient_stock"); assert.equal(JSON.stringify(w.ledger.state()), before); assert.equal(w.missions.size, 1);
});

test("V12 shared lift: the second trolley waits for the car, then runs; payloads arrive once", () => {
  const w = new World(liftModel(), { checkInvariants: true });
  w.submit({ command_id: "a", type: "transport.request", payload: { item: "A", qty: 1, from: "s1", to: "s2", carrier: "t1", actions: legs } });
  w.submit({ command_id: "b", type: "transport.request", payload: { item: "B", qty: 1, from: "s1", to: "s2", carrier: "t2", actions: legs } });
  w.runToEnd();
  assert.equal(w.eventsOf("lift.wait").length, 1);
  const starts = w.eventsOf("leg.start").map(e => e.t); assert.deepEqual(starts, [0, 6000]);
  assert.equal(w.ledger.onHand("s2", "A"), 1); assert.equal(w.ledger.onHand("s2", "B"), 1); assert.equal(w.ledger.onHand("s1", "A"), 0);
});

test("loop policy: two trolleys cycle through one lift for an hour; waits are counted, payloads conserved, resumable", () => {
  const m = liftModel(); m.initial.stock = [{ location: "s1", item: "A", qty: 1000 }];
  const trip = [{ k: "load", seconds: 10 }, { k: "leg", to: "s2", travelSeconds: 30, dwellSeconds: 5, lift: "lift" }, { k: "unload", seconds: 10 }, { k: "leg", to: "s1", travelSeconds: 30, lift: "lift" }];
  m.policies = [{ id: "L1", kind: "loop", item: "A", from: "s1", to: "s2", carrier: "t1", actions: trip }, { id: "L2", kind: "loop", item: "A", from: "s1", to: "s2", carrier: "t2", actions: trip, startSeconds: 20 }];
  const w = new World(m, { checkInvariants: true }).runUntil(3600 * 1000), r = w.report(), [p1, p2] = r.policies;
  // alone, one cycle is 10 + 30 + 5 + 10 + 30 = 85 s (42 trips/h); each cycle holds the single lift car for 60 s, so two
  // trolleys saturate it: about 120 s per cycle, 30 trips/h each, and the lift is never used by both at once
  assert.ok(p1.done >= 28 && p2.done >= 28, JSON.stringify(r.policies)); assert.ok(p1.lift_wait_s + p2.lift_wait_s > 0);
  assert.ok((p1.done + p2.done) * 60 <= 3600 + 120, "lift time cannot exceed the hour"); assert.ok(p1.mean_cycle_s > 115 && p1.mean_cycle_s < 125, String(p1.mean_cycle_s)); assert.equal(w.ledger.onHand("s2", "A"), w.eventsOf("unload.end").length); assert.ok(w.eventsOf("unload.end").length - (p1.done + p2.done) <= 2); assert.deepEqual(r.invariants, []);
  const a = new World(m).runUntil(3600 * 1000), b = World.restore(m, JSON.parse(JSON.stringify(new World(m).runUntil(1234567).snapshot()))).runUntil(3600 * 1000);
  assert.equal(a.fingerprint(), b.fingerprint());
});

test("seeded time spread: same seed same run, other seed different; times stay inside +-spread; zero spread draws nothing", () => {
  const m = liftModel(); m.initial.stock = [{ location: "s1", item: "A", qty: 1000 }];
  const trip = [{ k: "load", seconds: 10 }, { k: "leg", to: "s2", travelSeconds: 100, travelSpread: 0.2, dwellSeconds: 5 }, { k: "unload", seconds: 10 }, { k: "leg", to: "s1", travelSeconds: 100, travelSpread: 0.2 }];
  m.policies = [{ id: "L1", kind: "loop", item: "A", from: "s1", to: "s2", carrier: "t1", actions: trip }];
  const run = seed => new World({ ...m, seed }).runUntil(7200 * 1000);
  assert.equal(run(1).fingerprint(), run(1).fingerprint()); assert.notEqual(run(1).fingerprint(), run(2).fingerprint());
  const legs = run(3).eventsOf("leg.start").map(e => e.arrive - e.t);
  assert.ok(legs.every(d => d > 80000 && d < 120000), "every leg inside 100 s +-20%"); assert.ok(new Set(legs).size > 5, "times vary");
  const fixed = new World({ ...m, policies: [{ ...m.policies[0], actions: trip.map(a => ({ ...a, travelSpread: 0 })) }] }).runUntil(7200 * 1000);
  assert.ok(fixed.eventsOf("leg.start").every(e => e.arrive - e.t === 100000));
});

test("V06/V07 closed aisle: missions fail with a reason, the policy waits, reopening resumes the flow", () => {
  const model = blueprintToModel(bp, scenario), w = new World(model, { checkInvariants: true });
  const port = bp.ports.find(p => p.port_id === "P_SMT_IN").navigation_node_id, edge = bp.navigation.edges.find(e => e.to_node === port || e.from_node === port).edge_id;
  w.submit({ command_id: "close", type: "route.setOpen", payload: { edge, open: false } });
  w.runUntil(H(1));
  assert.ok(w.eventsOf("mission.failed").some(e => e.code === "no_route" && /N_P_SMT_IN|no route/.test(e.reason)));
  const smtBefore = w.stations.get("PROC_SMT").cycles;
  w.submit({ command_id: "open", type: "route.setOpen", payload: { edge, open: true } }); w.runUntil(H(3));
  assert.ok(w.stations.get("PROC_SMT").cycles > smtBefore, "SMT works again after the aisle reopens");
});

test("V10 full output: a station with no room downstream is blocked, never overfills", () => {
  const model = blueprintToModel(bp, { ...scenario, breakdowns: {} });
  model.locations.find(l => l.id === "BUF_METAL_OUT").capacitySlots = 1;   // 10 backs
  model.policies = model.policies.filter(p => p.item !== "METAL_BACK");    // nobody empties it
  const w = new World(model, { checkInvariants: true }).runUntil(H(4));
  assert.equal(w.ledger.onHand("BUF_METAL_OUT", "METAL_BACK"), 10); assert.ok(w.eventsOf("station.state").some(e => e.station === "PROC_METAL" && e.state === "blocked"));
});

test("core has no rendering dependency; the browser bundle gives the same result as the modules", () => {
  for (const f of readdirSync(new URL("../src/", import.meta.url))) { const s = readFileSync(new URL("../src/" + f, import.meta.url), "utf8"); assert.doesNotMatch(s, /\bfrom\s+"(?!\.\/)|\bwindow\.|\bdocument\.|three/i, f); }
  execFileSync(process.execPath, [fileURLToPath(new URL("../build.mjs", import.meta.url))]);
  const ctx = { module: { exports: {} }, Math, JSON, Object, Array, Map, Set, Number, String, Error, Infinity, NaN, Symbol, WeakMap };
  vm.runInNewContext(readFileSync(new URL("../../dist/factory-engine.js", import.meta.url), "utf8"), ctx);
  const FE = ctx.module.exports, m = FE.blueprintToModel(JSON.parse(JSON.stringify(bp)), scenario);
  assert.equal(new FE.World(m).runUntil(H(2)).fingerprint(), new World(blueprintToModel(bp, scenario)).runUntil(H(2)).fingerprint());
});
