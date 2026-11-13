# 17 — Engine core (Factory Engine 0.2.0)

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
| `engine/src/routes.js` | navigation graph, fastest route per mode and speed, closable edges, cache keyed by layout revision |
| `engine/src/world.js` | the world: commands, missions, stations, lifts, policies, snapshot/restore, view, report |
| `engine/src/blueprint.js` | semantic checks of a factory blueprint and conversion blueprint + scenario → engine model |
| `engine/cli.mjs` | `validate`, `run`, `resume` from the command line |
| `engine/build.mjs` | bundles the modules into `dist/factory-engine.js` |
| `engine/scenarios/demo.scenario.json` | illustrative run settings for the sample blueprint |
| `engine/test/engine.test.mjs` | minimum acceptance tests (validation cases named in each test) |

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
sample's one worker for twenty flows is the bottleneck. This is a property of the sample data, not of a factory.

## 4. Engine model (`fe-model` v1)

Seconds in the model; converted to ticks once at load.

```
{ format: "fe-model", version: 1, name, tickPerSecond, seed,
  items:     [{ id, unit, slotSize? }],                       // unit = base unit; slotSize = quantity per storage slot
  locations: [{ id, kind?, capacitySlots?: int|null, node? }],
  graph?:    { nodes: [{ id, x, y, z }], edges: [{ id, a, b, both, speed, modes, length? }] },
  pools:     [{ id, kind: "carrier"|"worker"|"lift", units: [{ id, node?, speed?, mode? }] }],
  handling:  [{ id, carriers: [unit ids], workers: [unit ids], loadSeconds, unloadSeconds }],
  stations:  [{ id, input, output, inputs: [{ item, qty }], outputs: [{ item, qty }], cycleSeconds, slots?, breakdown?: { mtbfSeconds, mttrSeconds } }],
  policies:  [{ id, kind: "pull"|"push", item, from, to, fromNode?, toNode?, handling, reorderPoint?, target?, lot?, countInbound?, maxOpen? }
            | { id, kind: "loop", item, from, to, carrier, actions, qty?, startSeconds?, count? }],
  // explicit actions: { k: "load"|"unload", seconds, spread? } | { k: "leg", to, travelSeconds, dwellSeconds?, lift?, marks?, travelSpread?, dwellSpread? }
  // spread f: time x (1 + f*t), t symmetric triangular on (-1, 1), drawn from the policy's own named stream
  initial:   { stock: [{ location, item, qty }] } }
```

Scenario fields used by `blueprintToModel` (defaults in brackets): `seed` [blueprint seed], `tick_per_second` [1000],
`slot_size` {ea [10], kg [25], items{}}, `trolley_speed_mps` [1.0], `walk_speed_mps` [1.2], `load_s` / `unload_s` [30],
`pull` {reorder_cycles [2], target_cycles [6]}, `push` {lot [10], lot_by_item{}}, `breakdowns` {process_id: {mtbf_s, mttr_s}},
`closed_edges` [[]], `horizon_h` [8]. A blueprint replenishment policy overrides the pull levels for its item and destination.

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
- **Events** (`world.log`, each `{ seq, t, type, ... }`): `world.start`, `command.accepted|rejected`, `mission.created|waiting|
  assigned|failed|cancelled|done`, `walk.*`, `leg.start|arrive|end`, `lift.wait|start|end`, `load.start|end`,
  `unload.start|end`, `mark`, `station.start|finish|state|down|up`, `stock.received`, `route.changed`, `policy.blocked`.
- **Invariants** (with `checkInvariants: true`, after every committed transition): no negative or fractional stock,
  reservations covered by stock, capacity respected, per-item balance `initial + received + produced − consumed = on hand`
  (carriers and station work-in-progress are locations, so material in transit is counted), units bound to live missions.
- **Snapshot**: `world.snapshot()` holds the clock, queue, random states, ledger, missions, units, stations, policies,
  command results and the hash chain of all events; `World.restore(model, snap)` refuses a different model.
- **Fingerprint**: hash of the canonical state including the event hash chain; equal fingerprints = equal runs.
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
| WP2.x views and editor | V8.1 is the first viewer; layout editing still V8 Studio scene edits, not engine commands | V8 identity + smoke tests |
| WP3.1 route search with reasons | done | test V06/V07 |
| WP3.2 traffic rules | partial: shared lift only; no aisle/intersection reservation or deadlock detection | test V12 (lift) |
| WP3.3 transport state machine | done (cancel only before assignment) | tests V05, V06/V07, V12 |
| WP3.4 replenishment counting inbound | done | pull policy |
| WP3.5 worker–trolley coupling | partial: bound together per mission, worker walks to the trolley | — |
| WP3.6 estimated motion between events | done in V8.1 (motion core inside engine windows) | V8 smoke test |
| Phase 4 | not started: serial numbers, test/repair loop, shipping pack plan, line move during a mission | — |

## 8. Known limits

Sample data only; no measured times. Handling units are tracked by quantity after the initial load. No serial tracking,
quality failures, shifts or rework yet. Aisle traffic has no reservations (only lifts are shared resources). A route closed
during a leg does not stop a trolley already on it. Performance was measured only on this PC (8 h sample in about 70 ms);
no performance promise is made for any other machine.
