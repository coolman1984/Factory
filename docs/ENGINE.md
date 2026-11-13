# The engine

**Rule: data first, engine last.** Every owner request about routes, stops, devices, objects, layout, camera shots, captions,
films and numbers is a scene-file edit ([RECIPES.md](RECIPES.md)). Change engine code only when the format cannot express the
request or when the engine has a bug - and then update the docs, the changelog and the lessons in the same commit
(`mf docs-check` must pass; the build and the commit hook run it).

## How the player is made

V8 builds one offline HTML from maintained source: `node tools/build-v8.mjs 8.0`. It fills `src/v8/shell.html` with
byte-preserved vendor/rendering code, sorted engine fragments, the scene and motion cores, and the existing Studio modules.
Company layouts, plans, device/model/audio payloads stay in `private/v8/base/`; the default scene bundle comes from the
lead-owned `private/v7/scenes/`. Neither is copied into tracked source. V7 builds remain the historical patch pipeline.

M1 extraction first proved a byte-identical rebuild of a fresh V7.7.2 reference, then proved the same after splitting.
The `ref-772` stage and hash proof describe stages A/B before motion modularization; subsequent changes use V6 identity.
All source bytes use `src/v8/** -text`. The minified vendor library is stored in bounded fragments and concatenated without
separators, keeping every source line below 100,000 characters without changing its bytes. Sources already escaped in the
reference are inserted once; only the live V7 modules and generated scenes are escaped during a build.

### Engine fragments

| part | responsibility |
|---|---|
| `00-camera-envelope.js` | Camera envelope |
| `01-boot.js` | Boot, coordinates and motion constants |
| `02-state.js` | Player state and diagnostics |
| `03-renderer-and-light.js` | Renderer and lighting |
| `04-plates-slab-clean-replica-plan.js` | Floor plates, replica and trolley |
| `05-a-persistent-bounded-post-chai.js` | Post processing |
| `06-looks.js` | Look presets |
| `07-flows-and-the-timeline.js` | Flow timelines and route ribbons |
| `08-camera.js` | Camera and floor glide |
| `09-overlay-flow-lines-labels-meas.js` | Overlays and labels |
| `10-player-ui.js` | Player controls |
| `11-sound-restrained-generated-off.js` | Sound and reflection |
| `12-the-frame.js` | Frame loop, devices, rebuild and public API |

The parts are fragments of one function, joined in filename order without separators. Their actual names follow the
reference section comments; they are not the approximate fourteen-part list in the original plan.

`src/v8/motion-core.js` defines `window.MFMotion` in Chrome and is loaded through `loadMotionCore()` in Node. It owns
cleaning, segment profiles, schedules, scan holds, timelines, poses, floor glide, world transforms and exact per-path/per-step
numbers. Engine wrappers retain intro text and mutations. CLI step moments now use `t0` / `tm` / `t1`; arrival respects
custom waits. Studio current/base comparisons use this same core; the legacy V7 branch remains for historical rebuilds.

## Factory Engine (V8.1)

`node tools/build-v8.mjs 8.1` adds three scripts after the motion core: the vendored Factory Engine bundle
(`src/v8/engine/factory-engine.js`, built in the 3D Factory repository by `node engine/build.mjs`, copied here by
`node tools/engine/sync-engine.mjs`), the bridge (`engine-bridge.js`) and the read-only Engine panel (`engine-panel.js`).
Stage `8.2` builds the same scripts (engine 0.2 with the Shift run); 8.1 and 8.2 differ only in the engine and panel source
they were built from. Stage `8.3` (engine 0.3) adds drawn returns, measured times and traffic to the Shift run and the layout
journal (below).

- The bridge wraps `MFMotion.timeline`. For every path it builds one engine model (stops = locations, the trolley = a carrier,
  each elevator = a lift resource, one lot at the first stop) and one transport mission whose legs are the steps with the motion
  core's move and wait durations and scan marks. The engine runs it (1 tick = 1 us, invariant checks on) and its
  `leg.start` / `leg.arrive` / `leg.end` events become each step's `t0` / `tm` / `t1`.
- When the engine's tick equals the motion core's instant, the exact float is kept (bit-identical replay); a moved step gets
  the engine time. If the engine refuses or fails, the path falls back to the motion core and the Engine button turns red.
- `MF.engine`: `summary()`, `info(fi)`, `stateAt(t, fi)` (lot position, trolley activity, step, recent events), `toggle()`,
  and (V8.2) `shift(opts)` / `shiftUI()`: the Shift run (`bridge.runShift(D, { hours, trolleys, liftCars, spread, seed,
  returnTrip })`): all paths of the tab in one engine world, one loop policy per trolley, one shared lift resource per
  elevator, estimated empty return. CLI: `node tools/engine/shift.mjs`.
- V8.3 Shift run options: `times` ({ pathId: { trip_s, return_s, load_s, unload_s } }, panel "Measured times", stored in
  localStorage `fe:times:<project>`), `aisleCapacity` (0 = off; N trolleys per 2 m cell shared by different paths; `cellMetres`),
  drawn returns (a path whose name contains "return" and runs from a path end back to its start; `bridge.returnRoutes(D)`).
  Rows add `trafficWaitPerTrip`, `timeSource` (measured/geometric), `returnSource` (drawn/estimated/measured/none); `zones` lists
  shared sections. CLI: `--aisle N --times file.json [--check]`.
- V8.3 layout journal (`bridge.makeJournal`, panel "Layout journal", `MF.engine.journal()`, `journalUndo()`, `journalRedo()`):
  the panel wraps `MFS.setScene`; each published scene becomes a `doc.edit` (or undo/redo) on `FactoryEngine.Journal`, validated
  by `MFScene.validate` plus "every path plays on the engine"; only problems the edit adds are refused; a refused edit is rolled
  back through `MFX.replaceScene`. Engine undo/redo publish the journal document back to the Studio.
- Node: `tools/engine/engine-node.mjs` loads the same two files; `bridge.runFlow(D, f, E, base, { model, commands })` runs
  what-if trips (another trolley on the lift, blocked time) without a browser.
- The engine itself (API, events, tests, plan) is documented in the 3D Factory repository: `docs/17_ENGINE_CORE.md`.

## Modules (source and tools/v7)
| file | runs in | job |
|---|---|---|
| `src/v8/motion-core.js` | player + Node | shared schedules, scan holds, timelines, poses, glide/world transforms and exact numbers |
| `scene-core.js` | player + Node | scene <-> internal data (metres <-> frame units 0.3 m), auto router (grid A*), validator, layout edits (move / turn / delete / door). The one source of format rules. |
| `scene-node.mjs` | Node | loads the motion core, defaults to the private base project JSON (explicit older players still scan HTML); loads scene-core with `vm`; reads a player's built-in layout (`var P = {...}`) |
| `scene-schema.mjs` | Node | the field list (docs and `docs-check`) |
| `preload-scene.js` | player, before the data | picks the scene (browser autosave if made from the same baked scene, else the baked one), converts it, applies layout edits, floor-light repair (`MF7_CLEAN_LIGHT`) |
| `engine-patches.mjs` | build | patches on the V6 player: rebuildable flows / labels / devices, replica instance tags, per-step speed, 64 RFID gates, camera rescue (never hidden), preparing screen, frame hooks (`MFX.pre` / `MFX.post`), internals `MF.x` |
| `camera-review-patches.mjs` | build | exact-once camera review corrections applied after the base patches: story-time filtering, landing reveal, lift framing, chase visibility and export ownership of the frame loop |
| `scene-ui.js` | player | scene file panel: open / save / save as / download / drop, undo, validate |
| `studio-core.js` | player | Studio document (engine units) <-> scene (`fromScene` / `toScene`), undo / redo, autosave, footprints, solids, router, collision check |
| `studio-camera.js` | player | camera pad logic: goal pose, damping, lens, presets, trolley lock |
| `studio-edit.js` | player | selection, gizmo, moves, props (3D objects), replica edits, path editing, straighten, placement |
| `studio-director.js` | player | director keys, captions (3 languages), camera-move recording, video takes, several trolleys |
| `studio-numbers.js` | player | Numbers tab |
| `studio-ui.js` | player | rail buttons, pad, panels, timeline lanes, mouse / keys, right-click menu, keyboard map (`KEYMAP`) |
| `mf-ops.mjs`, `../mf.mjs` | Node | the agent CLI ([CLI.md](CLI.md)) |
| `docs-check.mjs` | Node | generated docs + docs check |
| `cdp.mjs` | Node | headless Google Chrome driver for tests and browser verbs |
| `film-export.mjs` | Node + player hooks | explicit-frame CLI export through existing ffmpeg/ffprobe; decoded timing and freeze receipts |

Historical V7 build: `node tools/build-v7.mjs 7.7.2` (stages in `STAGES`: which add-on groups and CSS go in). The build bakes
`private/v7/scenes/*.scene.json`, parses every inline script, and runs `mf docs-check` (skip only with `--no-docs-check` for
temporary test players).

## Release files are protected

Both builders use `tools/v8/build-output.mjs` and refuses any other `dist/Material_Flow_Player*.html`, all `dist/versions/` outputs and all `dist/backup/`
outputs after resolving paths without case sensitivity. Rebuilding the selected stage's own release first backs it up in
`dist/backup/` and keeps its five newest backups. Publication writes an exclusive `.tmp` file, then renames it atomically;
a stale/in-use temporary file causes a refusal. Test outputs belong under `dist/test/`.

## Coordinates and units
Scene files: metres, plan frame (x right, y down), 1 frame unit = 0.3 m. The engine works in frame units; world x = unit x - CX,
world z = unit y - CY (`D.center`), y up. Floors are plates that slide and lift (stack 0 = side by side, 1 = stacked).

## Tests (minimum set, run after engine changes)

Run the gate: `node tools/v8/gate.mjs <player.html>`; use `--quick` during work or `--only name,name` for selected rows.
Logs and machine-readable results go to `dist/test/gate-<player>/` (`--out dist/test/<name>` overrides it). GPU rows run
sequentially with a 20-minute row limit. Missing private fixtures produce explicit skips; public examples still validate.
The V8 gate also includes Node `motion` and four-tab browser `numbers` rows.
`--only camera` selects all ten guided 3x camera rows. The legacy stage1 row uses matching pre-addition fixtures; the
actual player is checked by the separate layout/review transaction rows. M0 also verifies all ten paths at 1x outside
the standard gate, as required by master-plan section 1.6. Camera evaluations use a ten-minute timeout; other CDP
commands keep their two-minute default. Identity uses a separate fresh profile per input file and a fresh document per
project; its eight snapshots and comparison assertions are unchanged.

| test | proves |
|---|---|
| `node tools/v8/build-guard-test.mjs` | release path refusal, own-stage backups/retention and atomic publication |
| `node tools/v7/identity-test.mjs dist/Material_Flow_Player_v6.html <v7 player baked with private/v7/scenes-v6>` | the 10 V6 paths play identically |
| `node tools/v7/validator-test.mjs <player>` | 18 planted cases, including layout additions and single-error bad kinds |
| `node tools/v7/layout-adds-test.mjs <player>` | strict additions, storage/door identities, folded transforms and reload undo |
| `node tools/v7/smoke-76.mjs <player>` | Studio edits land in the scene, director / fleet / numbers / undo work |
| `node tools/v7/mouse-test.mjs <player>` | real mouse and keyboard input |
| `node tools/v7/ui-check.mjs <player>` | right-click menu, search, photo, numbers |
| `node tools/v7/start-test.mjs <player> 10` | no stutter on fresh starts |
| `node tools/test-camera-v5.mjs <player> <tab> guided 3 <path index>` | the guided camera never hides the trolley |
| `node tools/v7/take-test.mjs <player>` | a full video take records (MP4) |
| `node tools/v7/camera-input-test.mjs <player>` | pad capture release, free-camera fly continuity and trolley lock at 1x/3x/8x |
| `node tools/v7/camera-review-test.mjs` | bounded director interpolation, follow offsets, key units and invalid CLI targets |
| `node tools/v7/film-review-test.mjs <player baked with docs/examples/director.scene.json> <output directory>` | exact 20 s film, injected freeze rejection, sequential frames and state restoration |
| `node tools/mf.mjs docs-check` | docs match the code |
| `node tools/engine/bridge-test.mjs` | V8.1: every path plays from the Factory Engine bit-identically; a busy lift delays the trip (engine authority) |
| `node tools/engine/smoke-81.mjs <8.1 player>` | V8.1: all tabs on the engine, Engine panel, rebuild re-runs the engine, no page errors |
