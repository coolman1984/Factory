# Material Flow Platform plan: from a 3D player to a factory material-flow system

Written 2026-11-12 by Claude Opus 5.5 at the owner's request: "the best possible system to automate and organize this
engine so it is like the leading professional engines and can manage our multinational TV and Mobile factory".

This plan sits **above** [V8_MASTER_PLAN.md](V8_MASTER_PLAN.md). V8 makes the player and its agent control solid. This
plan turns the result into a platform that models, simulates, compares and reports material flow for many sites and both
product lines. Nothing here is implemented yet; `MF <verb>` names a planned CLI verb (today's verbs are written `mf <verb>`). Section 12 lists the decisions the owner must make; every one has a default.

## Build status (2026-11-12: P0-P8 built in one run on the owner's order "do all the stages non stop")

How to use it: [../PLATFORM_MANUAL.md](../PLATFORM_MANUAL.md). Gate: `node tools/mf.mjs platform gate`.

| phase | built | minimum test | deviation from this plan |
|---|---|---|---|
| P0 | `src/core/model-core.js`, `tools/core/site-node.mjs`, `mf site` / `mf model`, demo site, `private/sites/site-01` | `model-validator-test.mjs`: demo clean, 10 planted faults caught | none |
| P1 | `src/core/sim-core.js` (sfc32 streams, heap, orders, movers, lifts, breakdowns, charging, line-side stock), `src/core/kpi-core.js`, `tools/core/sim-node.mjs` | `sim-test.mjs`: identity on all 10 real paths (worst 3e-7 s), M/M/1 and M/M/2 inside the 95% CI, determinism, conservation, 5-day demo in ~0.3 s | event log is JSON arrays, not a binary file; stores validated but not simulated |
| P2 | `src/core/demand-core.js`, `tools/core/import-plan.ps1` (Excel COM), `mf import plan` | `plan-import-test.mjs`: workbook made and read through COM, 30 and 60 orders/day as computed by hand | COM scripts run in PowerShell 7 (Windows PowerShell 5 fails with TYPE_E_LIBNOTREGISTERED on this PC) |
| P3 | `tools/core/viewer.mjs` (`mf sim run --view`, `mf sim view`) | `viewer-test.mjs`: open orders shown = simulation state at the 5 busiest moments, demo and real EPS, no page errors | **2D plan viewer, not the 3D player**: the V8 engine is being changed by another workstream; 3D playback stays open |
| P4 | `tools/core/exp-node.mjs`, `results-db.mjs` (node:sqlite), `excel-report.ps1` | `platform-test.mjs`: 6-point grid, find = 2 AGVs, Excel report read back through COM, proven difference | no optimiser beyond grids and the count search |
| P5 | `tools/core/portfolio-node.mjs`, `mf portfolio init / build` | portfolio page in headless Chrome, no errors; `private/portfolio/portfolio.html` built for site-01 | onboarding runbook folded into PLATFORM_MANUAL (no separate NEW_SITE.md) |
| P6 | `tools/core/cad-layout.mjs`, `mf cad layout` | 14,639 wall segments from the CAD package validate; alignment maths exact | arcs, splines and walls inside blocks not converted; no owner-named dimension checked yet |
| P7 | `tools/core/govern-node.mjs`, `recheck-node.mjs`, `platform-gate.mjs`, `mf platform` | approval refused without a matching run, accepted with one; history; recheck "same"; gate with privacy row | nightly run not scheduled (Q6) |
| P8 | `tools/core/actual-node.mjs`, `mf import events` | round trip: reads exported from a run compare to it exactly (884 reads) | no live MES / RFID link (Q9); works on exported CSV |

Real site status: `private/sites/site-01` runs with **assumed** scenarios (one trip per path every 15 minutes, one
operator at 1.0 m/s). These are not capacity results: the owner's production plan and measured times are needed (Q2, Q4).

---

## 0. One-screen summary

**Where we are.** A very good *animation* engine: data-first scene files, a validator, deterministic motion, an agent CLI
(`tools/mf.mjs`), a Studio, films, offline one-file HTML. It shows one trolley per path, with fixed waits. Its numbers
(distance, trip time, "trips per shift" = shift length / trip time) are geometry, not capacity.

**What the leading engines have that we do not** (Siemens Tecnomatix Plant Simulation, FlexSim, AnyLogic, Simio,
Visual Components, Dassault DELMIA, NVIDIA Omniverse-based factory twins): a **discrete-event simulation** core with
resources, queues, demand, shifts, breakdowns and randomness; an **experiment manager** that runs many scenarios and
replications; **KPIs with statistics**; a **reusable object library**; **data import** from ERP/MES/Excel; **CAD
layouts at true scale**; and **multi-model / multi-site organisation**. Some also offer a **live link** to shop-floor data.

**The core decision (D-P1).** Add a simulation core that produces an **event log**, and make the existing 3D player the
**viewer of that log**. The player keeps its look, Studio and films; the numbers become real capacity numbers. The
principle that makes V7/V8 reliable ("everything is a pure function of story time") stays true: the simulation runs
first, seeded and deterministic, and playback only reads its result.

**What makes ours better than buying a licence** (for this company): every operation is a command an AI agent can run
and check; everything stays offline and local (company rule); the owner's approved 3D look; no licence cost; numbers come
with receipts. **What a licence would still do better:** decades of validated simulation semantics. Section 11 says how we
check our results against hand calculations and, if the owner wants, against one commercial tool.

**Order of work (section 10):** P0 data contract and site registry -> P1 simulation core -> P2 production-plan demand ->
P3 player plays the simulation -> P4 experiments and KPI store -> P5 multi-site portfolio -> P6 CAD layouts -> P7
automation and governance -> P8 live plan-vs-actual pilot. V8 milestones M1, M4 and M5 are foundations and go first;
M8 (queueing) is replaced by P1; film and camera polish (M2, M3, M9) continue in a lower lane; M11 (Godot) is deferred.

---

## 1. What "professional" means here: twelve capabilities

Score: **0** absent, **1** partial, **2** present. "Where" is today's code or evidence.

| # | capability | what leading tools provide (general) | ours today | where / gap |
|---|---|---|---|---|
| C1 | Model hierarchy | enterprise, site, building, area, line, station; models made of reusable objects | 1 | one project = 4 hard-wired tabs (`inj1`, `inj2`, `eps`, `press`); no site or enterprise level |
| C2 | Object library | standard carriers, vehicles, operators, conveyors, lifts, buffers, with parameters | 1 | devices (PC, RFID gate, scanner), trolley, replica racks; no behaviour parameters |
| C3 | Discrete-event simulation | event queue, resources with capacity, queues, routing rules, shifts, breakdowns, randomness | 0 | `src/v8/motion-core.js` is kinematics only; V8 M8 plans a one-path queue warp |
| C4 | Demand from the plan | production plan -> material demand -> transport orders | 0 | trips are not driven by any plan |
| C5 | Experiments | scenarios, parameter sweeps, replications, optimisation | 0 | `mf diff` compares two scenes; V8 M10 "parallel worlds" compares two |
| C6 | KPIs and statistics | throughput, utilisation, WIP, waiting, lead time, starvation, cost; confidence intervals | 1 | `mf numbers`: distance, time, trips per shift (geometry only) |
| C7 | 3D visualisation and films | animated 3D, cameras, video | 2 | the V7/V8 player, Studio, director, exact-frame films |
| C8 | Layout from CAD at scale | import DWG/DXF, true dimensions | 1 | layout from slides via COM; the CAD package `dist/SEEG_Y26_AI_Package/` exists but is not connected |
| C9 | Data integration | Excel, databases, ERP/MES exports | 1 | COM extraction of decks; NERP export skill exists; nothing feeds the model |
| C10 | Scripting / API | script every object and run headless | 2 | `tools/mf.mjs`, V8 `scene-ops` and `MF.agent` (planned M4/M5) |
| C11 | Collaboration and governance | versions, review states, who changed what | 1 | git (local), receipts, docs-check; no approval state per model |
| C12 | Live twin | shop-floor events replayed or compared with the plan | 0 | RFID gates exist in the factory and in the scenes; no data link |

Today: 9 of 24. Target after P1-P7: 22 of 24 (C12 reaches 1 with the P8 pilot; 2 needs company IT).

---

## 2. Principles (they hold for every task below)

1. **Data first, engine last** (as V7/V8). A site, a model, a scenario and an experiment are JSON files with a schema
   and a validator. Engines read them; agents and the Studio edit them through named operations.
2. **Simulate first, then show.** The simulation produces an event log; the player, the numbers, the reports and the
   films all read that log. One source of truth for every number (extends V8 decision D2).
3. **Deterministic and seeded.** Same model + same seed = byte-identical log. Randomness only through the seeded
   generator. This keeps seeking, films, tests and receipts exact.
4. **Every number has a receipt**: model hash, scenario, seed, replications, and the source of every input (plan file,
   CAD record handle, owner statement). Simulated values are labelled `model`; measured values `measured`.
5. **Offline and local.** No cloud, no remote, no upload of company plans (project rule). The platform runs on one PC;
   a later intranet deployment (P7) needs company IT approval and changes nothing in the formats.
6. **Agents can do everything a person can** (V8 section 3), with JSON in / JSON out and no hand-edited JSON.
7. **Company data never in tracked files.** Sites live under `private/sites/`; tests use the synthetic demo site in
   `docs/examples/site-demo/`.
8. **Grow, do not rewrite.** The four current scenes keep working at every step; a "legacy scene" is a site model with one
   product, no demand and one carrier per path, and must reproduce today's numbers exactly (identity rule, section 5.6).

---

## 3. Target architecture

```
 MASTER DATA (private/sites/<site>/)          CORES (plain scripts: the page AND Node load the same file)
 -----------------------------------          ------------------------------------------------------------
 site.json        hierarchy, calendar         tools/v7/scene-core.js   format, validator, router      (exists)
 layout/          from slides or CAD          src/v8/motion-core.js    kinematics: legs, turns, lifts (exists)
 library.json     carriers, vehicles, ...     src/core/model-core.js   site model schema + validator  (P0)
 models/*.model.json  flows, resources        src/core/sim-core.js     discrete-event simulation      (P1)
 plans/*.plan.json    demand (from Excel)     src/core/demand-core.js  plan -> transport orders       (P2)
 scenarios/*.json     deltas on a model       src/core/kpi-core.js     KPIs + statistics from logs    (P4)
                                              tools/v7/scene-ops.js    every edit as an operation     (V8 M4)
          |                                              |
          v                                              v
 RUNS (private/sites/<site>/results/)          FRONT ENDS over the same operations
 -----------------------------------          ------------------------------------------------------------
 runs/<run-id>/log.bin + receipt.json          Player / Studio  plays a run's log (P3), edits models
 results.sqlite   KPIs per run, replication    Portfolio page   all sites, KPIs, scenario comparison  (P5)
                                               Reports          Excel (through COM) + film + HTML     (P4, P7)
 PORTFOLIO (private/portfolio/)                tools/mf.mjs     the one CLI for agents and scripts
 portfolio.sqlite  roll-up of every site       MF.agent         the same operations inside the page
```

Event flow of one run:

```
 model + plan + scenario + seed
        |  demand-core: plan -> transport orders (what, from, to, when needed, how many units)
        v
 sim-core: event queue -> dispatch orders to carriers and vehicles -> request resources (operator, AGV, elevator,
           dock, scanner) -> move (time from motion-core) -> queue when busy -> breakdowns / breaks from the calendar
        |
        v
 event log (compact, seekable)  -->  kpi-core -> results.sqlite -> portfolio, reports
        |
        +-->  player: pose of every carrier at story time t = interpolate the log with motion-core
```

---

## 4. Data model

### 4.1 Hierarchy (ISA-95 style levels, with our ids)

| level | id example | file | notes |
|---|---|---|---|
| enterprise | `ent` | `private/portfolio/enterprise.json` | list of sites, currency, units, KPI targets |
| site | `site-eg-01` | `private/sites/<site>/site.json` | country, time zone, calendar, product lines, buildings |
| building / floor | `b1`, `b1-2f` | `site.json` -> `buildings[]` | floors, elevators, docks; the layout source per floor |
| area | `inj`, `press`, `eps`, `smt`, `assy` | `site.json` -> `areas[]` | today's tabs become areas; areas group lines and stores |
| line / work centre | `assy-l3` | `areas[].lines[]` | consumption points with rates |
| station / point | stop ids (as today) | layout + model | supermarkets, kitting, line-side, warehouse, scan points |

Ids are lower-case, stable, never reused. Area kinds for TV and Mobile are a **template list the owner confirms per
site** (examples above); the platform never infers process order, counts or floors from symbols (project rule).

### 4.2 Library (`library.json`, per site, with an enterprise default)

```
{ "format": "mf-library", "version": 1,
  "carriers": [ { "id": "trolley-std", "name": "Std trolley", "capacity": { "units": 40 }, "size": [1.2, 0.8, 1.6],
                  "push": { "speed": 1.0 }, "load": 20, "unload": 20 } ],
  "vehicles": [ { "id": "agv-tow", "kind": "agv", "speed": 1.2, "tows": 3, "charge": { "every": 14400, "for": 1800 } },
                { "id": "op-push", "kind": "operator", "speed": 1.0 } ],
  "lifts":    [ { "id": "elev-cargo", "cycle": 45, "capacity": { "carriers": 2 }, "door": 8 } ],
  "devices":  [ { "id": "rfid-gate", "time": 0 }, { "id": "scan-manual", "time": 6 }, { "id": "pc", "time": 15 } ] }
```

All times in seconds, sizes in metres, speeds in m/s. Every value may be a number or a distribution (4.4).

### 4.3 Model (`models/<id>.model.json`: one per area or per whole site)

```
{ "format": "mf-model", "version": 1, "site": "site-eg-01", "area": "inj",
  "layout": "layout/b1.layout.json",
  "scenes": ["../../v7/scenes/inj1.scene.json"],          // legacy scenes are imported as flows (P1 identity)
  "flows": [ { "id": "inj-to-kit", "material": "inj-parts", "carrier": "trolley-std", "mover": "op-push",
               "route": "inj1-wh",                         // a scene path: its steps, stops, devices, routes
               "lot": { "units": 40 }, "trigger": "demand" | { "every": 300 } | { "kanban": { "bins": 4 } } } ],
  "resources": [ { "id": "inj-ops", "kind": "op-push", "count": 3, "shift": "A+B" },
                 { "id": "elev-5", "kind": "elev-cargo", "count": 1 } ],
  "stores": [ { "id": "inj-wh", "stop": "inj-wh", "capacity": { "carriers": 30 }, "start": 10 } ],
  "rules": { "dispatch": "fifo" | "nearest" | "due-date", "elevator": "fifo" } }
```

### 4.4 Distributions

`{ "fixed": 6 }`, `{ "uniform": [4, 8] }`, `{ "triangular": [4, 6, 10] }`, `{ "normal": [6, 1], "min": 2 }`,
`{ "lognormal": [6, 2] }`, `{ "exp": 6 }`, `{ "empirical": "plans/scan-times.csv" }`. A plain number = `fixed`.
The validator rejects negative means, `min > max`, and empirical files with fewer than 20 rows (warning under 50).

### 4.5 Calendar

`site.json` -> `calendar`: shifts (`A 06:00-14:00`), breaks (stop all operators, vehicles continue), planned stops,
holidays. Breakdowns per resource: `{ "mtbf": 28800, "mttr": { "triangular": [300, 600, 1800] } }`.

### 4.6 Plan (`plans/<id>.plan.json`, produced by `MF import plan` from Excel through COM)

```
{ "format": "mf-plan", "version": 1, "site": "site-eg-01", "from": "2026-11-16", "days": 5,
  "source": { "file": "<name>.xlsx", "sheet": "Plan", "hash": "sha256:..." },
  "lines": [ { "line": "assy-l3", "model": "<product code>", "rate": { "per_hour": 120 }, "shift": "A+B" } ],
  "bom":   [ { "model": "<product code>", "material": "inj-parts", "per_unit": 2 } ] }
```

Demand-core turns `rate x per_unit / lot.units` into transport orders with due times; a line starves when a needed
carrier is late. Product codes, rates and BOMs come only from the owner's files, never from guesses.

### 4.7 Scenario (`scenarios/<id>.json`): a model plus operations

```
{ "format": "mf-scenario", "version": 1, "base": "models/inj.model.json", "plan": "plans/w47.plan.json",
  "ops": [ { "op": "resource.set", "id": "inj-ops", "count": 2 },
           { "op": "flow.set", "id": "inj-to-kit", "mover": "agv-tow" } ],
  "run": { "days": 5, "warmup": 3600, "replications": 10, "seed": 1 } }
```

`ops` are the same named operations as V8 `scene-ops` (one grammar for edits and what-ifs).

---

## 5. The simulation core (`src/core/sim-core.js`, P1)

### 5.1 Scope

A small, fully specified discrete-event engine in plain JavaScript (no packages), loaded by Node and by the page like
`motion-core.js`. Not a general simulation language: exactly the objects of section 4.

### 5.2 Mechanics

- **Clock and queue:** binary-heap event queue keyed by `(time, priority, sequence)`; `sequence` makes ties
  deterministic. Time in seconds (float64), events never scheduled in the past.
- **Random numbers:** one seeded generator (xoshiro128** or PCG32, about 30 lines) with **one stream per source**
  (per resource, per flow, per device) derived from `(seed, source id)`, so adding a resource does not change other
  streams (common random numbers for fair scenario comparison).
- **Entities:** transport orders and carriers. States: `waiting-order`, `loading`, `moving`, `queue`, `riding`,
  `scanning`, `unloading`, `idle`, `broken`.
- **Resources:** count, calendar, breakdowns; request/release with FIFO or priority queues; utilisation tracked as
  time-weighted state.
- **Movement:** leg times come from `motion-core` (`buildSchedule` on the step's route) scaled by the mover's speed,
  so the kinematics are the same as the player. Elevators are resources with a cycle time and capacity.
- **Congestion (optional, off by default):** aisles as capacity-1 or capacity-2 zones on route segments (from the
  V8 M8 idea, generalised); a carrier waits at the zone entry.
- **Stores:** capacity in carriers or units; a full store blocks the sender; an empty store starves the consumer.
- **Stop conditions:** end time, or end of plan; warm-up period excluded from statistics.

### 5.3 Event log (the contract between the simulation and everything else)

```
log.bin: header JSON + typed arrays (Float64 t, Uint32 entity, Uint8 kind, Uint32 a, Uint32 b)
kinds: order-created, assigned, load-start, load-end, move-start(step), move-end, queue-start(resource),
       queue-end, ride-start(lift), ride-end, scan(device), unload-end, starved(line), blocked(store),
       break-start, break-end, down(resource), up(resource)
```

Readers: `MFSim.pose(log, entity, t)` (uses motion-core between `move-start` and `move-end`), `MFSim.state(log, t)`
(every entity's state at t), `MFSim.events(log, t0, t1)`. Logs over 200 MB are split by day.

### 5.4 Performance target

One site-week (about 50,000 transport orders) in under 10 s in Node on this PC (Iris Xe laptop); 10 replications run
one after another in under 2 minutes. Measured in P1's minimum test; if missed, the receipt says by how much.

### 5.5 Validation of the simulation itself

1. **Identity:** a legacy scene imported with one carrier, no demand and fixed times gives exactly the `mf numbers`
   distance and trip time for every path (`tools/core/sim-identity-test.mjs`).
2. **Queueing sanity:** an M/M/1 and an M/M/c case on the demo site match the textbook mean wait within the 95 %
   confidence interval of 30 replications (`sim-theory-test.mjs`).
3. **Conservation:** orders created = orders finished + orders in progress at the end; units never negative.
4. **Determinism:** two runs with the same seed give byte-identical logs.

### 5.6 What it deliberately does not do (first version)

No continuous physics, no collision avoidance between free-moving vehicles (zones only), no optimisation search
(P4 sweeps parameters; an optimiser can come later), no shop-floor control.

---

## 6. KPIs (`src/core/kpi-core.js`, P4)

Every KPI is computed from the log only, per replication, then summarised as mean, standard deviation and 95 %
confidence interval (Student t). Names are stable keys in `results.sqlite`.

| key | definition | unit |
|---|---|---|
| `throughput` | orders delivered per hour (excluding warm-up) | orders/h |
| `on_time` | share of orders delivered before their due time | % |
| `starved_min` | minutes a line waited for material | min/shift |
| `lead_time` | order created -> delivered, mean and p95 | s |
| `wait_share` | share of carrier time in queues (by resource) | % |
| `util` | busy time / available time per resource (operators, AGVs, elevators) | % |
| `wip` | time-weighted carriers in the system and per store | carriers |
| `distance` | metres travelled per shift by movers | m/shift |
| `headcount_need` | smallest operator count with `starved_min` = 0 and `util` <= target (from a sweep) | people |
| `fleet_need` | the same for AGVs / trolleys | vehicles |
| `cost_shift` | labour + vehicle cost per shift from `site.json` rates (only when rates are given) | currency |
| `co2_shift` | energy x factor, only when the owner supplies factors | kg |

Targets (for traffic-light colours) come from `enterprise.json` and can be overridden per site.

---

## 7. Experiments and scenario management (P4)

- `MF exp run <experiment.json>`: an experiment = base scenario + a grid (`{ "inj-ops.count": [2, 3, 4], "mover":
  ["op-push", "agv-tow"] }`) + replications. Runs sequentially by default, `--parallel N` with worker threads.
- Results go to `results.sqlite` (built-in `node:sqlite`, checked on this PC with Node 25.2.1: no install):
  tables `runs`, `kpis(run, replication, key, value)`, `inputs(run, source, hash)`, `events_summary`.
- `MF exp compare <a> <b>`: KPI table with differences and whether the confidence intervals overlap ("no proven
  difference" is printed when they do).
- `MF exp report <exp> --excel out.xlsx`: Excel workbook written **through Excel COM** (owner rule) with one sheet per
  KPI and a receipt sheet; `--html` writes an offline page with charts; `--film` hands the best scenario to the V8 M10
  "report to film" path.

---

## 8. Organisation of many sites (P5)

### 8.1 Folders

```
private/
  portfolio/  enterprise.json, portfolio.sqlite, reports/
  sites/
    <site-id>/
      site.json, library.json, layout/, models/, plans/, scenarios/, experiments/, results/, evidence/, NOTES.md
  v7/scenes/  (stays; referenced from the first site's models)
docs/examples/site-demo/   synthetic site used by every test (tracked, no company data)
```

### 8.2 Site onboarding recipe (`docs/runbooks/NEW_SITE.md`, written in P5)

1. `MF site new <site-id> --country .. --tz ..` -> skeleton files that validate.
2. Layout: slides through COM (existing tools) **or** the CAD package path (P6). Owner confirms floors, elevators,
   scale against one known dimension.
3. Areas and lines: the owner's list (template for TV and Mobile, edited per site).
4. Flows: from the owner's flow deck or an Excel flow table; routes drawn or auto-routed in the Studio.
5. Library values: defaults from the enterprise library, then measured times as they arrive (each marked
   `assumed` or `measured` with its source).
6. Plan: `MF import plan`; run the baseline experiment; owner review; state -> `approved`.

### 8.3 Portfolio page

One offline HTML file (`MF portfolio build`) reading `portfolio.sqlite`: sites on a list (no map tiles: offline),
per site the approved baseline KPIs, open scenarios, assumption count, last run date and a link to open the site's
player. Comparison of sites by the same KPI keys. Built with the project's own chart rules (dataviz skill).

---

## 9. Automation and agents (P7, plus every phase)

### 9.1 One CLI

New verb groups in `tools/mf.mjs`, generated help and docs (V8 decision D5):

```
mf site new|validate|list|show
mf model validate|import-scenes|show|ops
mf import plan <xlsx> --site s  (COM)   mf import layout-cad <package> --site s --floor f
mf sim run <scenario> [--seed n] [--days d]   mf sim where <run> --entity e --at t   mf sim state <run> --at t
mf exp run|compare|report               mf kpi <run>
mf portfolio build|check                mf gate [--quick]   (V8 gate runner, extended with platform rows)
```

Every verb: `--json` output, non-zero exit on failure, a receipt file for anything that writes.

### 9.2 Pipelines

- **On every change:** `MF gate --quick` (Node-only rows first: validators, sim identity, determinism, theory test,
  KPI recomputation; then one browser row).
- **Nightly (optional, `schedule_create` of the local automation server, owner approval):** re-run every site's
  approved baseline; if a KPI moves outside its interval without a model change, flag it.
- **Plan refresh:** a new plan file dropped in `plans/inbox/` -> import -> baseline run -> report (manual trigger first;
  automatic only after the owner approves).

### 9.3 Agent roles (current owner workflow)

Codex coordinates; one Claude worker at a time implements bounded tasks; the lead verifies independently
(`claude-cli-orchestration` skill). Each P-task below is written as one bounded task with files, minimum test and
acceptance, so it can be handed out as is.

---

## 10. Roadmap

Each phase is one release of the platform files plus a player release when the player changes. "Minimum test" follows
the owner's rule: the smallest check that proves it works; the owner then tests.

| phase | goal | main files | minimum test | owner sees |
|---|---|---|---|---|
| **P0** | data contract: site, library, model, plan, scenario schemas + validators; demo site; first real site wraps the four scenes | `src/core/model-core.js`, `tools/core/model-schema.mjs`, `docs/examples/site-demo/`, `docs/PLATFORM_MANUAL.md` | `MF site validate` passes on demo and on the first site; 10 planted faults caught | the site folder and its manual |
| **P1** | simulation core + event log + identity | `src/core/sim-core.js`, `tools/core/sim-*-test.mjs` | identity on all 10 legacy paths; M/M/1 test; determinism | `MF sim run` and its numbers |
| **P2** | demand from the production plan | `src/core/demand-core.js`, `tools/core/import-plan.ps1` (COM) | demo plan -> expected order count; one real plan imported with a receipt | "how many trolleys / people for this week's plan" |
| **P3** | player plays a run | `src/v8/player/*` fleet drawing from `MFSim.pose`, Numbers tab from KPIs | a 3-carrier run plays, seeks and films identically twice | many trolleys that queue, wait at elevators, starve lines |
| **P4** | experiments, KPI store, Excel report | `src/core/kpi-core.js`, `tools/core/exp.mjs`, `results.sqlite` | 3 x 2 grid x 5 replications on demo; Excel report opens through COM | scenario comparison with confidence |
| **P5** | multi-site portfolio | `MF site new`, `MF portfolio build`, `docs/runbooks/NEW_SITE.md` | demo + first site in one portfolio page, no page errors | all sites on one page |
| **P6** | CAD layouts at true scale | `tools/core/cad-to-layout.mjs` reading `layout.sqlite` | one floor of the CAD package -> layout that the validator accepts; scale check against one dimension the owner names | new sites start from CAD, not slides |
| **P7** | automation and governance | gate rows, model states (`draft` / `reviewed` / `approved`), nightly baseline, change log per site | gate passes; a state change without a passing run is refused | approved baselines, history of who changed what |
| **P8** | plan-vs-actual pilot | `MF import events <csv>` (RFID / MES export) -> actual log; `MF compare actual` | one exported day replayed beside the simulated day | real trolley movements against the model |

### 10.1 How this interleaves with V8 (recommendation; owner decides, question Q3)

| V8 milestone | recommendation | why |
|---|---|---|
| M1 engine from source, one motion model | **do first** (before P1) | sim-core reuses motion-core; patching a frozen file blocks P3 |
| M4 operations / CLI / undo, M5 inspection / `MF.agent` | **do with P0-P1** | scenarios use the same operations; agents need inspection |
| M8 trolleys that wait | **replace by P1/P3** | the simulation does queueing properly for every resource |
| M2 films, M3 planned camera, M9 cold start | **keep, lower lane** | management films still matter; not on the capacity path |
| M6 layout fidelity / format 2, M7 new screen | **keep after P3** | the screen must also show KPIs and runs; design it once |
| M10 ghost / story / worlds / report-to-film | **merge into P4** | "worlds" become scenarios; report-to-film reads KPIs |
| M11 Godot experiment | **defer** | no effect on managing the factory |

---

## 11. Risks and how they are limited

| # | risk | limit |
|---|---|---|
| 1 | Simulated numbers are trusted for investment decisions before the model is validated | every KPI shows its assumption count; `approved` needs a validation note (hand calculation or measured day, P8); optional cross-check of one area in a commercial tool (Q5) |
| 2 | Input data is missing or guessed (times, rates, BOM) | values carry `assumed` / `measured` and a source; reports list assumptions first; never invented |
| 3 | The simulation core has a logic bug | identity, theory, conservation and determinism tests from day one; small, specified core |
| 4 | Company data leaks into tracked files | `private/sites/` only; tests on the demo site; gate row that fails on any `private` path in tracked files |
| 5 | Scope grows faster than verification | one phase at a time, each with its minimum test and owner check |
| 6 | Big logs make the player slow | log split per day; player loads a time window; instanced carriers (V8 M8 note) |
| 7 | Excel / ERP files are NASCA-protected | always COM (owner rule); import scripts never read files directly |
| 8 | Another site's IT rules differ (offline PCs, no Chrome) | one-file HTML, Node only, documented minimum PC; P7 intranet only with IT approval |

---

## 12. Decisions for the owner (each has a default)

| # | question | default if no answer |
|---|---|---|
| Q1 | Build our own simulation core (this plan) or buy a commercial licence and keep our player for visuals? | build our own; re-check after P4 against Q5 |
| Q2 | First site and areas to model beyond the current four (which TV / Mobile areas, which country)? | the current site, the four existing areas, then the area the owner names next |
| Q3 | Accept the V8 re-ordering in 10.1 (M1, M4, M5 first; M8 replaced; M11 deferred)? | yes |
| Q4 | Who supplies measured times (scan, load, elevator cycle) and the production plan files, and in which format? | Excel files, read through COM; assumed values marked until then |
| Q5 | Cross-check one area's results in a commercial tool the company already licenses? | no; hand calculations and one measured day instead |
| Q6 | Allow a nightly local run of approved baselines (scheduled task on this PC)? | no; manual `MF gate` until approved |
| Q7 | Later intranet deployment for other sites (needs IT)? | stay one-PC offline |
| Q8 | Cost and CO2 KPIs: will rates and factors be provided? | leave those KPIs off |
| Q9 | RFID / MES exports for the P8 pilot: available, and who approves their use? | P8 waits for the owner |

---

## 13. First task to hand out (P0, bounded)

**Goal:** the data contract and the demo site, so every later phase has fixed formats.

- Files: new `src/core/model-core.js` (schemas of section 4 as data + `validate(kind, obj)` returning
  `{ errors, warnings }` with paths), `tools/core/model-schema.mjs` (field table for docs-gen), `docs/examples/site-demo/`
  (site, library, one model with two flows over `docs/examples/` scenes, one plan, one scenario),
  `docs/PLATFORM_MANUAL.md` (generated field table + one page of explanation), `tools/mf.mjs` verbs `site validate`
  and `model validate`.
- First real site: `private/sites/<site-id>/` that references the four existing scenes, created by `MF site new` and
  edited by the lead (company data stays private).
- Minimum test: `MF site validate docs/examples/site-demo` exits 0; a planted-fault script with 10 faults
  (unknown id, negative time, bad distribution, missing scene path, duplicate id, unit store capacity 0, shift overlap,
  plan line not in site, scenario op unknown, empty empirical file) catches all 10.
- Do not change: the player, the four scenes, V8 files under work.
