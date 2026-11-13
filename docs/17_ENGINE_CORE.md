# 17 — Engine core (Factory Engine 0.3.0)

0.3.0 (2026-11-13): **traffic zones** (WP3.2: aisle sections and crossings with a capacity; all-or-nothing acquisition, so no
deadlock), **Phase 4 core** (serial numbers per unit, test stations with a seeded pass/fail draw and a repair loop, unit
genealogy, `trace(serial)`, container packing plan and packing list), and the **layout journal** (`Journal`: edits as patch
commands with validator, exact undo/redo and a verifiable hash chain). Long runs are about 10x faster (D23). 16 tests pass.
Material Flow V8.3 uses all of it: Shift run with drawn empty returns, measured times and aisle/crossing traffic; Studio
edits go through the journal.

0.2.0 (2026-11-13): `loop` policy (repeated trips with a fixed carrier: milk runs, shift runs) with per-policy trips, mean
cycle and lift-wait statistics in `report().policies`; optional seeded time spread on actions (`spread`, `travelSpread`,
`dwellSpread`). Material Flow V8.2 uses both for its Shift run. 11 tests pass.

Status 2026-11-13: **built and tested** (Phase 0 WP0.3 and the Phase 1 core). It is a deterministic simulation core with no
rendering. Material Flow Player V8.1 (a separate local company project) uses it for every path it plays. All data in this
repository is still the declared **sample**; no result here is a measurement of a real factory.

## 1. Technology decision (closes D14, settles D17 and D18)

| Question | Decision | Why |
|---|---|---|
| Language | Plain modern JavaScript (ES modules), no TypeScript build step | runs on the target PC with Node 25 and Chrome, no installs or npm packages; the same code runs in Node (tests, CLI) and in the browser |
| Rendering | Existing three.js scene of Material Flow V8 (one offline HTML file) as the first viewer | the owner's approved graphics already exist; the core stays renderer-free and replaceable |
| Distribution | `dist/factory-engine.js`, one plain script (global `FactoryEngine`, also `require`-able), built by `node engine/build.mjs` | can be pasted into an offline single-file page; no loader, no network |
| Time | Integer ticks; tick length declared per model (`tickPerSecond`, default 1000 = 1 ms; the V8 bridge uses 1 µs) | integer clock as D17 requires; a viewer with sub-millisecond motion keeps its precision |
| Quantities | Integers of the base unit per dimension (`ea`, `lot`, `g`); `kg` converts exactly once at load; fractional base units are refused | balances never drift; 2.4 kg = 2400 g |

## 2. Layout

| Path | Job |
|---|---|
| `engine/src/units.js` | units, integer quantities and ticks, `EngineError` with a code and a readable reason |
| `engine/src/rng.js` | named sfc32 random streams per subsystem (state saved in snapshots) |
| `engine/src/queue.js` | event heap ordered by `(time, priority, sequence)`; entries are data, never closures |
| `engine/src/canon.js` | canonical JSON (sorted keys) and the 64-bit fingerprint |
| `engine/src/ledger.js` | inventory ledger: locations, capacity in slots, named stock and space reservations, atomic transfers, invariants |
| `engine/src/routes.js` | navigation graph, fastest route per mode and speed, closable edges, cache keyed by layout revision, optional traffic zone per edge |
| `engine/src/packing.js` | container packing plan: cartons per container by geometry (two-block floor, upright or tipped) and by payload |
| `engine/src/journal.js` | layout journal: `diff` / `invert` / `applyPatch`, `Journal` with doc.edit / doc.undo / doc.redo commands |
| `engine/src/world.js` | the world: commands, missions, stations, lifts, policies, snapshot/restore, view, report |
| `engine/src/blueprint.js` | semantic checks of a factory blueprint and conversion blueprint + scenario → engine model |
| `engine/cli.mjs` | `validate`, `run`, `resume` from the command line |
| `engine/build.mjs` | bundles the modules into `dist/factory-engine.js` |
| `engine/scenarios/demo.scenario.json` | illustrative run settings for the sample blueprint |
| `engine/test/engine.test.mjs`, `engine/test/phase4.test.mjs` | minimum acceptance tests (validation cases named in each test) |

No module imports a renderer, `window` or `document` (checked by a test).

## 3. Commands to run

```
node engine/cli.mjs validate examples/factory-blueprint.example.json
node engine/cli.mjs run examples/factory-blueprint.example.json --scenario engine/scenarios/demo.scenario.json [--hours 8] [--seed n] [--check] [--out report.json] [--log events.jsonl]
node engine/cli.mjs run ... --save-at 3 --snapshot snap.json      # then:
node engine/cli.mjs resume examples/factory-blueprint.example.json --scenario engine/scenarios/demo.scenario.json --snapshot snap.json
npm test                      # node --test "engine/test/*.test.mjs"
node engine/build.mjs         # dist/factory-engine.js
```

Sample result (8 h, demo scenario, seed 20261112): 6 TVs packed, 76 missions, the single handling worker busy 100%: the
sample's one worker for twenty flows is the bottleneck. This is a property of the sample data, not of a factory. With 0.3.0
the same run also reports: PROC_TEST 12 tests, 11 pass, 1 fail repaired and re-tested (illustrative pass rate 0.9); 16 serial
numbers issued; packing plan 202 cartons per container (2 layers x 101, illustrative carton 1.36 x 0.17 x 0.86 m); 22
one-lane aisle zones, no waits (one worker means one trolley moves at a time).

## 4. Engine model (`fe-model` v1)

Seconds in the model; converted to ticks once at load.

```
{ format: "fe-model", version: 1, name, tickPerSecond, seed,
  items:     [{ id, unit, slotSize?, serial? }],              // unit = base unit; slotSize = quantity per storage slot; serial = prefix (ea only)
  zones?:    [{ id, capacity }],                              // traffic zones: trolleys inside at once
  locations: [{ id, kind?, capacitySlots?: int|null, node? }],
  graph?:    { nodes: [{ id, x, y, z }], edges: [{ id, a, b, both, speed, modes, length?, zone? }] },
  pools:     [{ id, kind: "carrier"|"worker"|"lift", units: [{ id, node?, speed?, mode? }] }],
  handling:  [{ id, carriers: [unit ids], workers: [unit ids], loadSeconds, unloadSeconds }],
  stations:  [{ id, input, output, inputs: [{ item, qty }], outputs: [{ item, qty }], cycleSeconds, slots?, breakdown?: { mtbfSeconds, mttrSeconds },
               test?: { passRate, failTo, failItem } }],                   // test station: fail -> the unit goes to failTo unchanged
  shipping?: { location, item, perContainer, plan },
  policies:  [{ id, kind: "pull"|"push", item, from, to, fromNode?, toNode?, handling, reorderPoint?, target?, lot?, countInbound?, maxOpen? }
            | { id, kind: "loop", item, from, to, carrier, actions, qty?, startSeconds?, count? }],
  // explicit actions: { k: "load"|"unload", seconds, spread? } | { k: "leg", to|null, travelSeconds, dwellSeconds?, lift?, zones?, marks?, travelSpread?, dwellSpread? }
  // spread f: time x (1 + f*t), t symmetric triangular on (-1, 1), drawn from the policy's own named stream
  initial:   { stock: [{ location, item, qty }] } }
```

Scenario fields used by `blueprintToModel` (defaults in brackets): `seed` [blueprint seed], `tick_per_second` [1000],
`slot_size` {ea [10], kg [25], items{}}, `trolley_speed_mps` [1.0], `walk_speed_mps` [1.2], `load_s` / `unload_s` [30],
`pull` {reorder_cycles [2], target_cycles [6]}, `push` {lot [10], lot_by_item{}}, `breakdowns` {process_id: {mtbf_s, mttr_s}},
`closed_edges` [[]], `horizon_h` [8], `serial_prefix` ["SN"] (items with `tracking: "serial"`), `quality` {process_id: {pass_rate,
repair_s [300], repair_slots [1]}} (test station + repair bench `REPAIR_<process>` + station `REPAIR:<process>` back to the test
input), `traffic` {one_lane_below_m (edges narrower are one-lane zones), zones [{id, capacity, edges}]}, `shipping` {carton_m,
carton_kg?, allow_tipping?} (packing plan for the item flowing into `blueprint.shipping.container_entity_id`). A blueprint
replenishment policy overrides the pull levels for its item and destination.

## 5. Behaviour

- **Commands** (`world.submit({ command_id, expected_revision?, type, payload })`): `transport.request`, `transport.cancel`,
  `station.setDown`, `stock.receive`, `route.setOpen`, `policy.setEnabled`. A repeated `command_id` returns the first result
  and changes nothing; a stale revision is refused; a refused command restores the exact previous state.
- **Missions**: stock and destination space are reserved when the mission is created (no double booking). A carrier (and
  a worker if the handling needs one) is bound all-or-nothing. Legs come from the route graph (walk to the trolley, empty
  leg, load, loaded leg, unload) or from explicit actions supplied by a viewer that owns its geometry. Lift legs wait for a
  free car. A missing route fails the mission with `no_route` and a reason; its policy waits until the layout changes.
  Cancelling is allowed only before assignment: a loaded trolley keeps its load.
- **Stations**: start only with all inputs available and room reserved for all outputs; states `working`, `starved`,
  `blocked`, `down`; breakdowns pause the job and resume it after repair (named random stream per station).
- **Policies**: pull counts on-hand plus confirmed inbound (WP3.4); push moves fixed lots; loop starts the next trip of
  its carrier as soon as the previous one is done (from `startSeconds`, up to `count` trips).
- **Traffic (WP3.2)**: a leg starts only when its lift car and every zone it lists are free at once; otherwise it waits holding
  nothing (`lift.wait` / `zone.wait`) and is retried in arrival order whenever a lift or zone is released. Nothing is held during
  a wait, so waits cannot form a cycle (deadlock-free by construction, D21). Graph routes whose edges carry zones are split per
  edge, so a zone is held only while it is crossed. Report: per-zone entries, occupied share, utilisation, waits, wait seconds;
  per-policy `zone_wait_s`.
- **Serial numbers (Phase 4)**: every unit of a serial item has its own number, kept oldest-first per location and moved with the
  unit. A station that takes in as many serial units as it puts out keeps their numbers (assembled -> passed -> packed is one
  TV); otherwise outputs get new numbers and the consumed serial units are recorded as their contents (`genealogy`).
  Invariants add: serial count = on hand, no number in two places. `world.trace(sn)`: where it is, contents, what contains it,
  tests and fails, every event naming it.
- **Test and repair (Phase 4)**: a test station draws pass/fail from its own random stream (`test:<station>`); a failed unit goes
  to `failTo` with its number (room is reserved there before the test starts) and, in the blueprint conversion, a repair station
  sends it back to the test input. Report `quality`: tests, pass, fail, yield, first-pass yield, retests.
- **Shipping (Phase 4)**: `packPlan(container, carton)` gives cartons per container (layers x per layer, two-block floor,
  limited by space or payload, volume fill). Report `shipping`: loaded units, full containers, the plan and the packing list
  (serial numbers in the container).
- **Layout journal (WP2.x)**: `new Journal(doc, { validate })`; `submit({ command_id, expected_revision?, type: "doc.edit" |
  "doc.undo" | "doc.redo", payload: { doc | patch, label } })`. An edit is a patch with its exact inverse; the validator sees the
  new and old documents; a refused edit changes nothing; undo/redo are recorded commands; `verify(firstDoc)` replays the hash
  chain. Material Flow V8.3 feeds every Studio scene through it.
- **Events** (`world.log`, each `{ seq, t, type, ... }`): `world.start`, `command.accepted|rejected`, `mission.created|waiting|
  assigned|failed|cancelled|done`, `walk.*`, `leg.start|arrive|end`, `lift.wait|start|end`, `load.start|end`,
  `unload.start|end`, `mark`, `station.start|finish|state|down|up`, `stock.received`, `route.changed`, `policy.blocked`,
  `zone.wait`, `test.pass|fail`. Load/unload and station events carry `serials` / `in` / `out` for serial items.
- **Invariants** (with `checkInvariants: true`, after every committed transition): no negative or fractional stock,
  reservations covered by stock, capacity respected, per-item balance `initial + received + produced − consumed = on hand`
  (carriers and station work-in-progress are locations, so material in transit is counted), units bound to live missions.
- **Snapshot**: `world.snapshot()` holds the clock, queue, random states, ledger, missions, units, stations, policies,
  command results and the hash chain of all events; `World.restore(model, snap)` refuses a different model.
- **Fingerprint**: hash of the canonical state including the event hash chain; equal fingerprints = equal runs. The chain
  hashes each event as emitted (field order fixed by the engine code, D23).
- **View** (`world.view()`): a deep-frozen plain object for renderers: units with their motion window `[t0, t1]`, path and
  load, station states, open missions, stock per location. Renderers interpolate inside the window and label it estimated.

## 6. Material Flow V8.1 integration (local company project, not in this repository)

The V8 player keeps its graphics, Studio, camera and films. A bridge script wraps its timeline function: each path's trip
becomes an engine mission with explicit legs (the motion core's durations, scan marks, a lift resource per elevator), and
the engine's `leg.start / leg.arrive / leg.end` times become the step times the player plays. Undisturbed trips replay
bit-identically to V8.0 (proved by V8's own identity test on all 10 company paths); a busy lift delays the trip (proved by a
test). The engine bundle is copied into that project; company layouts never come into this repository.

## 7. Work-package status

| Package | Status | Evidence |
|---|---|---|
| WP0.3 contract + semantic checker | done | `cli validate`; test V01/V21 (9 planted fault kinds) |
| WP1.1 ids, units, quantities | done | units refuse mixed dimensions and fractional base units |
| WP1.2 load + references + cycles | done (semantic); JSON Schema structural check not implemented | test V01/V21 |
| WP1.3 clock, ordering, named random streams | done | test V24 |
| WP1.4 ledger | done (quantity tracking; handling-unit identity not kept after the first move) | test V04/V08/V14 |
| WP1.5 command gateway | done | test V05 |
| WP1.6 one process with starvation, blocked output, breakdown | done | tests V10, V24 |
| WP1.7 snapshot, resume | done | test V16 |
| WP1.8 CLI runner + report | done | `cli run` |
| WP2.x views and editor | V8 is the viewer; Studio edits go through the engine layout journal (V8.3): checked, refused edits rolled back, engine undo/redo | journal test; V8.3 smoke |
| WP3.1 route search with reasons | done | test V06/V07 |
| WP3.2 traffic rules | done (0.3.0): lifts and traffic zones, all-or-nothing, deadlock-free by construction; one-lane aisles from edge width | tests V12, WP3.2 traffic (2) |
| WP3.3 transport state machine | done (cancel only before assignment) | tests V05, V06/V07, V12 |
| WP3.4 replenishment counting inbound | done | pull policy |
| WP3.5 worker–trolley coupling | partial: bound together per mission, worker walks to the trolley | — |
| WP3.6 estimated motion between events | done in V8.1 (motion core inside engine windows) | V8 smoke test |
| Phase 4 | core done (0.3.0): serial numbers + genealogy + trace, test/repair loop, container packing plan + packing list; not done: line move during a mission, mixed cartons, load securing | Phase 4 tests (2) |

## 8. Known limits

Sample data only; no measured times. Lots are tracked by quantity after the initial load; serial items by number. The test
pass rate, repair time and carton size in the demo scenario are illustrative. A zone is released on arrival: a trolley dwelling
inside a zone does not hold it. The packing plan is grid packing of identical cartons, not a load-securing calculation. A route closed
during a leg does not stop a trolley already on it. Performance was measured only on this PC (8 h sample in about 250 ms; a V8.3 shift run with traffic, 16 trolleys,
1.5 M events, in about 8 s in Node);
no performance promise is made for any other machine.
