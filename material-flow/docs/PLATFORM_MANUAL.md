# Material Flow Platform manual (P0-P8)

The platform layer above the scene engine ([plans/PLATFORM_PLAN.md](plans/PLATFORM_PLAN.md)). A **site folder** holds
everything about one factory site as JSON files. Every file has `format` and `version: 1`. Units: seconds, metres, m/s.
Ids: lower-case letters, digits, `.`, `_`, `-` (shift ids may use capitals: `A`, `B`). Paths inside files are relative to
the site folder. Validator: `src/core/model-core.js` (the same file runs in Node and in the page as `window.MFModel`).

```
<site>/
  site.json          mf-site      hierarchy: country, time zone, product lines, calendar, buildings/floors, areas/lines, rates
  library.json       mf-library   carriers, vehicles (operator | agv | forklift | tugger), lifts, devices
  models/*.json      mf-model     one area: scene files, flows, resources, stores, rules
  plans/*.json       mf-plan      production plan: line rates per product + bill of materials
  scenarios/*.json   mf-scenario  base model + plan + operations (what-if) + run settings
  experiments/*.json mf-experiment  grid of parameters or "find the smallest count" + replications
  layout/*.json      mf-layout    walls from CAD in metres (+ .svg preview)
  results/           runs/<run id>/ (receipt, log, input, geometry, view.html) + results.sqlite
  experiments/results/<name>/   summary.json, report.html, report.xlsx
  CHANGES.jsonl      review-state history (who, when, note, approving run)
  evidence/ NOTES.md
```

Company sites live in `private/sites/<site-id>/` (never committed). The tracked synthetic example is
[examples/site-demo/](examples/site-demo/); copy it to start by hand, or create a skeleton with the CLI.

## Commands

```
node tools/mf.mjs site new private/sites/<id> --id <id> --name "..." [--country ..] [--timezone ..]
node tools/mf.mjs site validate <site dir>      # every file + references; exit 1 on any error
node tools/mf.mjs site show <site dir>          # one-screen summary   (--json for agents)
node tools/mf.mjs site list                     # all sites under private/sites
node tools/mf.mjs model validate <file.json>    # one file alone, no cross-references
node tools/mf.mjs sim run <scenario.json> [--days d] [--seed n] [--replications n] [--view]   # simulate + KPIs + viewer
node tools/mf.mjs sim state <run dir> --at <s>  # open orders at a moment   (sim where ... --order n)
node tools/mf.mjs exp run <experiment.json> [--excel]   # grid / find, HTML + Excel (COM) report
node tools/mf.mjs exp compare <run dir A> <run dir B>   # KPI differences, "proven" when the 95% ranges are apart
node tools/mf.mjs import plan <plan.xlsx> --site <dir> --from 2026-11-23 [--days 5]   # Excel through COM
node tools/mf.mjs import events <reads.csv> --run <run dir>   # plan vs actual (time,carrier,stop[,flow])
node tools/mf.mjs cad layout --out <site>/layout/walls.layout.json --box x0,y0,x1,y1 [--align ...]
node tools/mf.mjs portfolio init | build        # private/portfolio/enterprise.json -> portfolio.html + portfolio.sqlite
node tools/mf.mjs platform state <site> --model <id> --to reviewed|approved --by <name> [--note ..]
node tools/mf.mjs platform history <site> | recheck <site> | gate [--quick]
```

Tests (each prints PASS / FAIL; `platform gate` runs them all and checks that no private data is tracked):
`tools/core/model-validator-test.mjs` (P0), `sim-test.mjs` (P1: identity on the 10 real paths, M/M/1, M/M/2,
determinism, conservation, speed), `plan-import-test.mjs` (P2, Excel COM), `viewer-test.mjs` (P3, headless Chrome),
`platform-test.mjs` (P4-P8).

## How a run works

1. `sim run` compiles the scenario: the base model plus its `ops`, the library, the site calendar, the plan and the
   route geometry of every flow (taken from the scene files with the player's own motion model).
2. **Demand:** a flow with trigger `"demand"` (2 bins) or `{kanban: {bins}}` feeds the line(s) that use its material
   in the plan. The line consumes one unit at a time at `per_hour x per_unit` while its shifts work (breaks removed);
   every emptied lot sends a transport order. An empty line side counts as **starved** time. `{every: s or distribution}`
   creates orders at fixed or random intervals during the site's shifts; `{once: s}` one order (tests).
3. **Orders** wait (FIFO, or `due-date` rule) for a free unit of a resource whose kind is the flow's `mover`, inside that
   resource's shift windows. The unit loads (carrier `load`), drives each step (time = metres / vehicle speed, or the
   scene's story time when the vehicle speed is `"scene"`), holds the step's stop time, rides elevators (a model
   resource whose kind is a library lift, matched by `elevator` label; queue when all cars are busy), unloads, returns
   empty (unless `returnTrip: false`) and takes the next order.
4. **Breakdowns** (`mtbf`, `mttr`) and **charging** (`charge.every`, `for`; staggered across a fleet) take a unit out
   after its current task.
5. Replications use seeds `seed, seed+1, ...`; each source (resource, flow) has its own random stream, so scenarios
   compare fairly. Same input + same seed = identical log.
6. KPIs per replication (mean, 95% range over replications): deliveries per hour, line starved (min/shift), lead time
   mean and p95, wait for a mover, wait for an elevator, distance (m/shift), WIP, utilisation per resource (inside its
   shifts), cost per shift (when the site has `rates`).

Every result is labelled a **model** result; the receipt lists its inputs with hashes, the number of `assumed` values,
warnings and the limits of version 1: one material per flow (a starved material does not stop the others), elevator
capacity as parallel slots, breakdowns after the current task, stores validated but not simulated.

## Review states (governance)

Models are `draft`, `reviewed` or `approved`. `platform state ... --to approved` is refused unless the site validates
and a plain scenario run (not an experiment variant) used exactly this model content (sha256 without `state` /
`approvals`). Every change is appended to `CHANGES.jsonl`. `platform recheck` re-runs each approved model's scenario
and flags KPIs that leave the approved range (with unchanged inputs that means the engine changed). It is not scheduled
automatically (owner decision Q6 in the plan).

## Plan vs actual

`import events` reads a CSV `time,carrier,stop[,flow]` (seconds from the run start, or ISO times with `--start`).
A trip is one carrier read at the stops of a flow's route in order; per flow it compares trip counts, mean trip time
(first to last stop) and the time between stops with the run (moments its carriers leave each stop).

## CAD layouts

`cad layout` reads `layout.sqlite` of the CAD package read-only: LINE and LWPOLYLINE of the wall layers (default
`wall`, `wall(window)`, `_exterior walls`, `_interior partition`, `_structure main`, `--Wall`) inside `--box` (CAD units),
converted to metres with y flipped (plan y down). `--align "cx,cy=px,py;cx,cy=px,py"` fits it to a scene plan with two
point pairs; the receipt shows the scale (check it against a dimension the owner names; the validator warns beyond 2 %).
Not converted in version 1: arcs, splines, hatches and walls drawn inside blocks (INSERT). `sim view --layout` draws it
under a run.

## Fields

**site** - `id`, `name`, `country` (null = warning), `timezone` (null = warning), `productLines` (ids, e.g. `tv`,
`mobile`), `calendar.shifts[] {id, start "HH:MM", end "HH:MM"}` (a shift ending before it starts runs past midnight;
shifts must not overlap), `calendar.breaks[] {shift, start, minutes}`, `buildings[] {id, name, floors[] {id, name, level}}`,
`areas[] {id, name, kind, productLine, building, lines[] {id, name}}` (line ids unique across the site),
`rates {name: number >= 0}` (cost rates, optional).

**library** - `carriers[] {id, name, capacity {units}, size [l, w, h], load, unload}`;
`vehicles[] {id, name, kind, speed > 0, tows, charge {every, for}}`; `lifts[] {id, cycle, capacity {carriers}, door}`;
`devices[] {id, time}`. Ids of lifts must differ from carriers and vehicles.

**model** - `site` (must be this site), `area` (an area of the site), `scenes[]` (mf-scene files; their path and stop ids
become usable), `flows[] {id, material, carrier, mover (a vehicle), route (a scene path id), lot {units}, trigger}` where
trigger is `"demand"`, `{every: s}` or `{kanban: {bins}}`; `resources[] {id, kind (vehicle or lift id), count, shift
"A+B", breakdown {mtbf, mttr}}`; `stores[] {id, stop (scene stop id), capacity {carriers | units}, start}`;
`rules {dispatch: fifo | nearest | due-date, elevator: fifo | priority}`; flow extras `line` (a site line it feeds), `returnTrip` (default true); resource extra `elevator` (scene elevator label a lift resource serves); `state` + `approvals` (review, written by `platform state`). Vehicle `speed` may be `"scene"` (the scene's story timing). `nearest` dispatch is accepted and runs as `fifo` in version 1.

**plan** - `site`, `from` "YYYY-MM-DD", `days`, `source {file, sheet, hash}`, `lines[] {line (a site line), model
(product code), rate {per_hour}, shift}`, `bom[] {model, material, per_unit}`. Warnings: a product without BOM rows, a
material no flow moves.

**experiment** - `scenario`, `replications`, `days`, `grid {param: [values]}` or `find {param, from, to, until {kpi: upper limit}, fixed}`; params: `resource.<id>.<field>`, `flow.<id>.<field>`, `store.<id>.<field>`, `rules.<field>`, `library.<kind>.<id>.<field>`. The found value is the first whose upper 95% bound meets every limit.

**layout** - `units: "m"`, `segments [[x1, y1, x2, y2], ...]`, `source` (file, layers, box, alignment, scale).

**scenario** - `base` (model file), `plan` (plan file, optional), `ops[] {op, id, ...}` with op one of `resource.set`,
`flow.set`, `store.set`, `rules.set`, `library.set` (the id must exist in the base model), `run {days, warmup,
replications, seed}`.

**Times** - a plain number (seconds) or one distribution: `{fixed: n}`, `{uniform: [min, max]}`,
`{triangular: [min, mode, max]}`, `{normal: [mean, sd]}`, `{lognormal: [mean, sd]}`, `{exp: mean}`,
`{empirical: "data/file.csv"}` (one header line, then one value per line; at least 20 values, 50 recommended); optional
`min` / `max` clip. Any object may carry `"source": "assumed" | "measured: ..."` (kept, not checked) so reports can list
assumptions.

## Not yet (see the plan)

The 3D player does not play simulation runs yet: runs play in the 2D run viewer (`sim view`), because the V8 player
engine is being changed by another workstream. Stores are not simulated. No optimiser beyond grids and the count search.
Live connection to MES / RFID systems needs company IT; `import events` works on exported files.
