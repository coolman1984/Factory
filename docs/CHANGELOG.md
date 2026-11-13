# Changelog (player)

Every version is a separate file `dist/Material_Flow_Player_v<version>.html` (older ones kept). Newest first.
A change is not done until this file, the docs and [LESSONS.md](LESSONS.md) are updated in the same commit (`mf docs-check`).

## V8.2 - Shift run on the Factory Engine 0.2 - 2026-11-13
- Engine 0.2.0 (3D Factory): `loop` policy (a trolley repeats its trip as soon as the last one is done; trips, mean cycle and
  lift waits per policy) and optional seeded time spread on legs and waits.
- Engine panel "Shift run (all paths of this tab)": hours, trolleys per path (0 = scene value), lift cars, spread %, empty
  return. All paths run together in ONE engine world; each elevator is one shared lift for all paths in both directions; the
  empty return is the loaded route reversed (estimated). Shows engine trips next to today's number (shift / one-way trip
  time x trolleys), mean cycle, lift wait per trip, lift busy %. Also `MF.engine.shift(opts)` and
  `node tools/engine/shift.mjs [scenes] [--hours --trolleys --lift-cars --spread --seed --no-return --json]`.
- Finding on the owner's 4 scenes (1 trolley per path, no spread): engine trips are about half of today's number because
  today's number ignores the trolley's way back; lifts are 2.6-8.3% busy, so no lift waits yet. With 4 trolleys per path and
  +-15% spread, Elev 5 is 33% busy and small lift queues appear. Return routes and spread are assumptions until measured.
- Tests: identity V8.0 vs V8.2 PASS (10 paths); smoke (now also runs the shift from the panel on all tabs) PASS; bridge test PASS.

## V8.1 - the player runs on the Factory Engine - 2026-11-13
- New stage `node tools/build-v8.mjs 8.1`: V8.0 plus the Factory Engine (from the 3D Factory repository, vendored as
  `src/v8/engine/factory-engine.js` by `node tools/engine/sync-engine.mjs`), the bridge `src/v8/engine/engine-bridge.js`
  and the read-only Engine panel `src/v8/engine/engine-panel.js` (button bottom left, Alt+E; `MF.engine` API).
- Every path's trip is an engine transport mission (load, one leg per step, shared lift resource, scan marks, unload); the
  engine's event times are the step times the player plays. Undisturbed trips replay bit-identically to V8.0; a step the
  engine moves (lift busy, waits) gets the engine time. Studio rebuilds re-run the engine.
- Tests: `node tools/engine/bridge-test.mjs` (Node, 19 paths bit-identical + lift-wait authority), `node tools/v7/identity-test.mjs
  dist/Material_Flow_Player_v8.0.html <8.1 player>` (PASS, all 10 paths), `node tools/engine/smoke-81.mjs <8.1 player>`.
- 8.0 build output is unchanged (rebuild is byte-identical to the 8.0 release).

## Platform P1-P8 - simulation, demand, viewer, experiments, portfolio, CAD, governance, plan vs actual - 2026-11-12 (no player change)
- Discrete-event simulation core (`src/core/sim-core.js`) with KPIs (`src/core/kpi-core.js`) and demand from production
  plans (`src/core/demand-core.js`); Node side in `tools/core/`. New verbs `sim`, `exp`, `import`, `cad`, `portfolio`,
  `platform`. Status table and deviations: [plans/PLATFORM_PLAN.md](plans/PLATFORM_PLAN.md); usage:
  [PLATFORM_MANUAL.md](PLATFORM_MANUAL.md). Gate: `platform gate` (all platform tests + privacy + docs-check).

## Platform P0 - data contract and site folders - 2026-11-12 (no player change)
- New platform layer ([plans/PLATFORM_PLAN.md](plans/PLATFORM_PLAN.md), [PLATFORM_MANUAL.md](PLATFORM_MANUAL.md)):
  `src/core/model-core.js` validates site, library, model, plan and scenario files; `tools/core/site-node.mjs` checks a
  whole site folder with its references (scenes, paths, stops, models, plans, CSV distributions).
- CLI verbs `site validate|new|list|show` and `model validate` (`--json`). Synthetic `docs/examples/site-demo/`;
  test `tools/core/model-validator-test.mjs` (demo clean, 10 planted faults caught).
- First real site `private/sites/site-01` wraps the four scenes (10 paths as flows); country, time zone, shifts, lines,
  materials and lot sizes are marked assumed until the owner confirms.

## V8.0 - source engine and shared motion - 2026-11-12
- Engine now builds from extracted source, with private layouts/models kept separate; byte-identical extraction and split
  proofs precede motion modularization. V7 patches stay frozen.
- One deterministic motion core drives player schedules, CLI totals and Studio current/baseline numbers. Carried heading,
  scanner holds and custom waits agree. CLI step arrival now uses the actual timeline endpoint, correcting non-default waits.
  Sample step-caption output now rounds to 18.5-22.5 s from full precision.
- CLI baking and documentation checks select the V8 source build; explicit older-player layout lookup remains supported.

## V7.7.2 - guarded release and layout review - 2026-11-12
- M0: dynamic release-path protection, five retained own-stage backups and atomic publication; camera acceptance now
  uses the shared isolated Chrome driver. Identity retains all eight snapshots with fresh documents per project and
  separate input profiles. Added the sequential V8 gate and build-guard regressions. Release verification
  uses the lead-owned current scenes; detailed receipts are in [V8 progress](plans/V8_PROGRESS.md).
- Step 0 camera review: story-time guided filtering, held clear shots, eased shaft views, landing reveal, protected wider
  chase (including device-free scenes), bounded director keys/follow poses, free-camera/pad release fixes and stricter key inputs. CLI films now render
  explicit frames through existing ffmpeg/ffprobe and check decoded length and moving freezes. Studio recording warms
  before its clock starts. See [camera/layout review](REVIEW_CAMERA_LAYOUT_772.md); released by M0.
- Review fixes: added-layout import/reload/undo transactions, ordered door edits, storage rotation/cell identities, strict
  addition validation, layout diffs/schema arrays and CLI edge cases. Camera rescue now checks opaque device meshes as well
  as the replica, after the ceiling clamp; every candidate, including the final fallback, must pass the checks. Studio
  preserves earlier ordered transforms when appending a new edit and invalidates raycast bounds after live instance changes. See
  [the V7.7.2 report](REVIEW_REPORT_772.md) for final evidence and limits.
- Added: `layoutAdds` scene section (machines, lines, conveyors, tables, racks, storage grids, walls as data; validator, 3D, plan,
  Studio move / turn / add). Owner's scenes: missing machines, lines, storage fields, tables added from the slides.
- Fixed: INJ 2 To LCM (2F) detour 457 m -> 94 m (door in the corridor end wall); INJ 2 doorway widened 0.45 m.
- Added: calm guided camera (wider, higher, held angle and framing, look-ahead, 20 deg/s turn limit): 95th-percentile turn speed
  about halved; the trolley is never hidden (camera test, all 10 paths).
- Added: `mf congestion`, `mf shots --at/--look`, `tools/v7/aisle-scan.mjs`, `camera-calm.mjs`, `compare-shots.mjs`.
- Fixed: `mf straighten` left slanted legs; `mf route` / `straighten` refused to write while another path was broken;
  `mf shots --only stops` showed the intro (found by the Phase E proof agent).

## V7.7.1 - 2026-11-11
- Added: preparing screen - the opening is dry-run behind a cover (3x), the camera's sight model and per-segment viewing angles are computed up front; it releases at t = 0 when the last 20 frames were fast (skip the rise after 6 s). Path changes compute the angles at once. Fresh starts: 1 of 20 with one slow frame (was 2 of 4). `MF.prepared`.
- Fixed: drive C: filled by 207 leftover test browser profiles (4.7 GB); the test driver now removes stale ones.
- Added: agent CLI `tools/mf.mjs` (validate, bake, shots, play, take, numbers, diff, straighten, route, fix-links, key, caption,
  layout-ref, docs-gen, docs-check); docs system (START_HERE, CLI, CONTROL_GUIDES, RECIPES with tested examples, ENGINE,
  TROUBLESHOOTING, DECISIONS, OPEN_ISSUES, PARITY); docs generated from code; docs-check in the build and the commit hook.
- Fixed: Phase A review findings (see [REVIEW_REPORT.md](REVIEW_REPORT.md)).
- Open: [OPEN_ISSUES.md](OPEN_ISSUES.md).

## V7.7 - 2026-11-11
- Fixed: the guided camera never ends a frame with the trolley hidden (9 of 10 paths 0.0%, Press path 2 one sample).
- Added: full-size GPU warm-up; video take test (MP4 H.264).

## V7.6 - 2026-11-11
- Added: Studio - camera pad, scene editor (objects, devices, replica objects), paths and steps editor, straighten, director
  (keys, captions EN / AR / KO, takes, MP4 / WebM), Numbers, several trolleys, right-click menu, search, photo, keyboard map (F1).
- Added: `door` layout edit; INJ 2 Main Line at the corner; EPS path 3 straight west through two doors.
- Fixed: visual bugs (start message, pad buttons, timeline markers, false before / after deltas, clutter in Director / Numbers).

## V7.1 - 2026-11-11
- Added: scene files (`mf-scene` v1) drive the player; validator; agent manual; scene file panel (open / save / drop / undo /
  autosave); per-step speed; 64 RFID gates.
- Fixed: dark boxes (baked shadows of removed rooms) and pale cones (floor reflection) beside Kitting; INJ 2 2F black bands;
  INJ 2 short route through the doorway (304 â†’ 37 m, Umbrella 337 â†’ 68 m).

## V6 - 2026-11-10
- Added: the owner's 10 paths on all four tabs, big PC / scanner icons, manual scan stops. Fixed: flicker sources, camera.

## V5 - 2026-11-10
- Added: INJ 1 true path, PCs, RFID gates with radar waves, handheld scanners; roof removed.

## V4 and earlier
Built on another PC; see [HISTORY.md](HISTORY.md).
