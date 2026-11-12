# The engine

**Rule: data first, engine last.** Every owner request about routes, stops, devices, objects, layout, camera shots, captions,
films and numbers is a scene-file edit ([RECIPES.md](RECIPES.md)). Change engine code only when the format cannot express the
request or when the engine has a bug - and then update the docs, the changelog and the lessons in the same commit
(`mf docs-check` must pass; the build and the commit hook run it).

## How the player is made
The player is ONE self-contained offline HTML file. V4 (built on another PC) is the base; each version is a new file built from the
previous one by exact-once string patches; older files in `dist/` and `dist/versions/` are never changed.

```
dist/Material_Flow_Player_v4.html   (owner's approved look; read-only)
  └ tools/build-v6.mjs  -> v6.html  (all tabs, paths from tools/v6/make.mjs, devices, flicker/camera fixes)
      └ tools/build-v7.mjs <stage> -> v7.x.html   (scene engine + Studio; scenes baked in)
```

## Modules (tools/v7)
| file | runs in | job |
|---|---|---|
| `scene-core.js` | player + Node | scene <-> internal data (metres <-> frame units 0.3 m), auto router (grid A*), validator, layout edits (move / turn / delete / door). The one source of format rules. |
| `scene-node.mjs` | Node | loads scene-core with `vm`; reads a player's built-in layout (`var P = {...}`) |
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

Build: `node tools/build-v7.mjs 7.7.2` (stages in `STAGES`: which add-on groups and CSS go in). The build bakes
`private/v7/scenes/*.scene.json`, parses every inline script, and runs `mf docs-check` (skip only with `--no-docs-check` for
temporary test players).

## Release files are protected

The V7 builder uses `tools/v8/build-output.mjs` and refuses any other `dist/Material_Flow_Player*.html`, all `dist/versions/` outputs and all `dist/backup/`
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
