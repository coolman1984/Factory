# 18 — Factory Control Center

Status 2026-11-13: **built and tested**. A local control application on top of Factory Engine 0.3.0: master data for every
part of the factory, one database that records everything, a full control UI (English, Arabic, Korean) for the owner, and a
command line plus JSON API for the agent. Same data, same checked commands, from every side. All data is still the declared
**sample** (completed into a logically working slice, see §6); nothing is a measurement of a real factory.

## 1. Start

| What | Command |
|---|---|
| Control UI | double-click `start-control-center.cmd`, or `npm run control`, then open http://127.0.0.1:8765/ |
| Agent / command line | `node control/fc.mjs help` (`npm run fc -- <command>`) |
| Tests | `npm test` (engine + control + UI in headless Chrome), `npm run test:fast` (no browser), `npm run test:ui` |

The server listens on 127.0.0.1 only (this PC). The database is `control/data/factory.db` (or `FC_DB` / `--db`); a new
database is seeded automatically. Nothing is installed: Node's built-in `node:sqlite`, `node:http` and `WebSocket` are used.

## 2. Master data (control/schema.js)

One registry drives the database, the command line, the checks and the generated UI forms. Each record is stored as the
blueprint's own JSON object, so the assembled blueprint is exactly `schemas/factory-blueprint.schema.json` format.

| Type | Blueprint section | Key |
|---|---|---|
| factory (single) | `factory` (+ schema version, notes, seed) | `factory_id` |
| item | `items` | `item_id` |
| prefab | `prefabs` | `prefab_id` |
| entity | `entities` (zones, lines, stations, stores, containers, trolleys, workers) | `entity_id` |
| port | `ports` | `port_id` |
| node, edge | `navigation.nodes`, `navigation.edges` (aisles) | `node_id`, `edge_id` |
| process | `processes` | `process_id` |
| flow | `material_flows` | `flow_id` |
| handling | `handling_policies` (handling teams) | `policy_id` |
| replenishment | `replenishment_policies` | `policy_id` |
| stock | `initial_conditions.handling_units` | `handling_unit_id` |
| shipping (single) | `shipping` | container |
| scenario | engine scenario (horizon, seed, speeds, handling times, pull/push, breakdowns, quality, traffic, shipping) | `id` |

Field kinds: text, number, int, bool, enum, ref, refs, tags, vec3, rows (sub-tables such as process inputs), list, json.

## 3. Commands, checks, history

Every write is a command `{ command_id?, actor, expected_revision?, type, payload, force? }` run in one SQLite transaction:
`record.create | update | replace | delete | rename | duplicate | move`, `batch` (all or nothing), `import`, `undo`, `redo`.

- **Guard**: after the change, all checks run (field checks per record, blueprint semantics `validateBlueprint`, and every
  scenario must build an engine model). A command that **adds** a problem is refused and rolled back, with the reasons; `force`
  saves it anyway (the UI offers "Save anyway") and the problem stays visible until fixed. Existing problems never block work.
- **Rename** rewrites every reference in every record (also scenario rows), so ids can be changed safely.
- **Audit**: each accepted command is a row in `changes` with the actor, label, revision and the exact before/after of every
  record it touched. **Undo/redo** replay those, are recorded themselves, and a new edit ends the redo chain.
- A repeated `command_id` returns the first result; a stale `expected_revision` is refused.

## 4. Database (one SQLite file)

| Table | Holds |
|---|---|
| `records` | master data (type, id, position, JSON, who/when) |
| `changes` | every accepted change with before/after, undo/redo links |
| `commands` | every command result (deduplication, audit of refusals) |
| `runs` | every simulation: scenario, seed, hours, master-data revision, engine version, model/blueprint hash, fingerprint, KPIs, full report |
| `run_events` | every engine event of every run |
| `run_serials` | every serial number at the end of a run: item, location, tests, fails, contents |
| `meta` | revision |

Read-only SQL (one SELECT) from the UI Database page, `fc.mjs sql`, or `POST /api/query`. Backup: `VACUUM INTO` a copy under
`control/data/backups/`. Export/import: one JSON file (blueprint + scenarios).

## 5. Control UI

| Page | What it does |
|---|---|
| Dashboard | latest run KPIs (finished goods, container, missions, lead time, bottleneck, test yield, traffic wait, invariants), busy share of stations and trolleys/workers, recent runs, data health, record counts |
| Master data pages (14) | filter, sort, multi-select, New, Duplicate, Delete, Bulk edit, Export CSV, double-click a cell to edit in place |
| Record editor (drawer) | every field with the right control (lists of references, sub-tables, vectors, tags), problems of the record, where it is used, Rename (with references), Duplicate, Delete, JSON edit; each change saves at once as a checked command |
| Layout map | plan of entities, aisles, ports and flows; click to edit; Move mode drags an entity and saves its position (parent-relative, snapped) |
| Runs | run dialog (scenario, hours, seed, note), run list, compare two runs; run detail: summary, stations/units, event browser (type, text, paging), serial search with full trace, raw report |
| Change log | every change with field-level before/after; undo/redo; filter by actor |
| Database | table counts, backup, export/import, read-only SQL with examples |

Always available: the command palette (Ctrl+K or /: find any record or page, or type `set process PROC_TEST duration_s=20`,
`new`, `delete`, `rename`, `dup`, `run logic-test 8`, `undo`, `redo`, `go`), Undo/Redo (Ctrl+Z / Ctrl+Y), the problems badge
(click for the list, click a problem to open its record), and live sync: when the agent changes data, the open page updates.

**Languages**: English, Arabic (right-to-left layout) and Korean, chosen in the top bar and remembered in the browser. The
dictionary is `control/ui/i18n.js` (every UI phrase, every master-data label and help text; a test checks coverage). Record data
(ids, names) is never translated; technical reasons from the engine stay in English inside a translated message.

## 6. Logical test data (control/seed.js)

The sample blueprint has one handling worker for twenty flows (it was the bottleneck: 6 TVs in 8 h). The seed imports it and,
through the same commands, adds a handling team per trolley type (WORKER_02-04, TROLLEY_ESD_02, TROLLEY_HEAVY_02-03).
Scenarios: `demo` (engine demo), `logic-test` (92% test pass rate, repair 240 s, SMT breakdowns, one-lane narrow aisles,
container plan, 20 s handling), `perfect-quality`, `two-way-aisles`. Result of `logic-test` (8 h): about 36 packed TVs, 0
failed missions, invariants OK; the bottleneck moves to WORKER_03 of the general handling team. All values are illustrative.

The logic test asserts that the numbers are consistent: tests = passes + fails, assembled >= passed >= packed, container
load = packing list, every packed TV traced from test to packing, fails in the event table = fails in the report, every
trolley and worker belongs to a team, `perfect-quality` has 0 fails, `two-way-aisles` has no traffic wait, and the same data
and seed give the same fingerprint.

## 7. Agent interface

Command line (`control/fc.mjs`, actor `agent`): `status`, `types`, `problems`, `list <type> [--where f=v]`, `get`, `where-used`,
`set <type> <id> f=v ...` (values are JSON when they parse), `new`, `delete`, `rename`, `dup`, `batch <file>`, `undo`, `redo`,
`changes`, `run [--scenario] [--hours] [--seed]`, `runs`, `show`, `events`, `trace`, `sql`, `export`, `import`, `backup`,
`seed --reset`; `--json` for machine-readable output, `--force` to save past the guard.

JSON API (actor `owner` unless given): `GET /api/meta | schema | records[/type[/id]] | problems | blueprint | layout | where-used |
runs[/id[/events|serials|trace/<sn>]] | changes | stats | export`, `POST /api/command | run | query | backup | import`,
`DELETE /api/runs/<id>`.

## 8. Tests (all pass)

| Test | Proves |
|---|---|
| `control/test/control.test.mjs` (9) | seed, guard/force/dedupe/stale, audit + exact undo/redo, rename with references, batch atomicity, export/import round trip with the same simulation, the logic test, read-only SQL, HTTP API, language coverage |
| `control/test/ui.test.mjs` | in headless Chrome (fresh profile): every page and tab, first run from the dashboard, drawer edit, inline edit, refused edit with "Save anyway", undo button and Ctrl+Y, rename, palette, bulk edit, map, change log, SQL, run compare, live update after an agent change, problems list, Arabic (RTL) and Korean; no page errors; screenshots in `control/test/out/` |

## 9. Limits

Single user at a time per change (SQLite transactions serialize writers; the UI re-reads on every revision). The layout map is
2-D and shows entity boxes from prefab sizes, not 3-D geometry. Engine reasons and problem messages are English. Performance
was measured only on this PC (an 8 h run of the sample in about 0.3-0.4 s including recording ~7,000 events).
