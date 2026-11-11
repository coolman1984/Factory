---
name: material-flow-scene-engine
description: Control the Material Flow V7 scene engine - change trolley paths, stops, devices, objects, layout (walls, doors, racks), camera shots, captions and videos by editing scene files or driving the Studio in the player; validate, bake and test. Use for any owner request about the V7.x player ("change the route", "move the main line", "open a door", "add a scanner", "make a video", "straighten the path"), and before changing the V7 engine itself.
---

# Material Flow scene engine (V7.x)

The owner's goal: the engine is frozen; every scene change is **data**. A tab (`inj1`, `inj2`, `eps`, `press`) is described by one
scene file (`format: "mf-scene"`, metres, seconds, degrees). Read [docs/SCENE_MANUAL.md](../../../docs/SCENE_MANUAL.md) (the
complete format and recipes) and the generated `private/v7/LAYOUT_REFERENCE.md` (floors, elevators, stop/device ids, every wall/rack
id with its rectangle) before editing. Status and history: [docs/STATUS.md](../../../docs/STATUS.md).

## Owner rules that apply here
- **Working product first** (owner's top rule): build the change, run the minimum test that proves it works, hand it over. Big jobs
  in one shot, non-stop. No long test suites or measurements unless asked. Report honestly what was not checked.
- Company data: scene files, the layout reference and player HTML files stay in `private/` and `dist/` (never committed). Local repo,
  no push. NASCA/Office files only through COM (global CLAUDE.md). English in terminal and work output.
- Earlier versions (`dist/Material_Flow_Player_v4/v5/v6/v7.1.html`) are read-only; each version is a new file, copy it to
  `dist/versions/`.

## Files
| what | where |
|---|---|
| scene files (the truth) | `private/v7/scenes/<tab>.scene.json` (baked into the player at build) |
| original V6 scenes (identity proof) | `private/v7/scenes-v6/` |
| scene core (convert, auto-route, validate; same code in the player and Node) | `tools/v7/scene-core.js` |
| validator CLI | `node tools/mf-validate.mjs <scene.json> [--player <html>]` |
| build | `node tools/build-v7.mjs 7.6` (all tools) or `7.1` (scene manager only); `--out <file> --bake <scene files>` |
| engine patches on V6 (exact-once string patches) | `tools/v7/engine-patches.mjs` |
| preload (scene -> player data, floor-light repair) | `tools/v7/preload-scene.js` |
| scene file manager (open/save/drop/undo) | `tools/v7/scene-ui.js` |
| Studio (camera pad, editor, director, numbers) | `tools/v7/studio-*.js`, `studio.css` |
| tests | `tools/v7/smoke-76.mjs` (API smoke), `tools/v7/mouse-test.mjs` (real mouse/keys), `tools/v7/validator-test.mjs`, `tools/v7/identity-test.mjs`, `tools/v7/stage1-test.mjs` |
| visual probe (find what draws an artefact) | `node tools/v7/shot-probe.mjs <html> <tab> <flow> <item> <x m> <y m> <dist m> <az°> <pol°> <outDir>` |
| headless Chrome driver | `tools/v7/cdp.mjs` (`openPage(file, tab)` -> `ev`, `call`, `errors`, `close`) |

## Workflow for an owner request
1. Find the ids: stops, steps and devices in the scene file; walls and racks in the layout reference (regenerate with
   `node tools/v7/layout-reference.mjs`).
2. Edit the scene JSON (a small `node -e` script that loads, changes and writes it is safest). Prefer `"route": {"type": "auto"}`;
   use `points` when the owner drew an exact line (follow the arrows: first point = previous end, last point = the stop).
3. `node tools/mf-validate.mjs private/v7/scenes/<tab>.scene.json` until 0 errors. Read every message: it names the object, the leg
   and the point. Typical fixes: route around a PC/scanner stand, move a stand beside the lane, cut a `door`, move a wall piece.
4. `node tools/build-v7.mjs 7.6` -> `dist/Material_Flow_Player_v7.6.html`; one quick check (open the tab with `tools/v7/cdp.mjs`
   or `eval-file.mjs`, confirm the step lengths / no page errors; a plan screenshot when the owner sent one).
5. Report the before/after numbers (metres, seconds) and anything you changed in the layout to make it fit.

Common requests, as data:
- **Shorter route through a doorway the CAD closes**: `layoutEdits: [{ "target": "wall:N", "door": [from, to] }]` (metres along
  the wall) or move a short wall stub (`"move": [dx, dy]`). Doorways must leave >= 0.09 m beside the 0.98 m wide display trolley.
- **Move a stop** (e.g. Main Line to a corner): change the stop's `x, y`, then make the step ending there (and the next step) end/start
  at the new point.
- **Stop to scan at a red slide mark**: scanner `"stops": true`, `"at"` exactly on a path leg, `"stand"` beside the lane.
- **Straighten a path after edits**: Studio Paths tab Straighten (S) / L shape (L) / Auto-route (R), or rewrite `points` square.
- **Captions, camera shots, videos**: Studio Director tab (keys are in engine units, edit them there, not by hand).

## Driving the player (automation / tests)
In the page: `MF` (player: `setFlow, seek, play, pause, setCam, setSpeed, D, S, proj, W, lotPose, x` internals),
`MFS` (scene file: `scene, load(scene), validate(), undo, redo, save, download, setScene`),
`MFX` (Studio: `doc, setEditor, setTab, setPad, select, startPlace, placeAt, commit(label, fn, kind), undo, redo, flush, toScene,
replaceScene, autoRoute, addKey, addCaption, startTake, flyTo, viewPreset`, ...). Every Studio change goes through `commit`, is
saved to the scene (`flush()` forces it) and to `localStorage["mf7:scene:<tab>"]`.
Real input works through CDP `Input.dispatchMouseEvent` / `dispatchKeyEvent` (see `mouse-test.mjs`). Keyboard map: F1 in the player.

## Changing the engine (only when data cannot do it)
- Add a format feature in `scene-core.js` (toInternal / fromInternal / validate) and document it in SCENE_MANUAL.md; keep the
  Studio bridge (`fromScene` / `toScene` in `studio-core.js`) lossless for it.
- Player patches in `engine-patches.mjs` must match exactly once; embedded V6 scripts mix LF and CRLF (the build retries CRLF).
- The build parses every inline script (`syntax: N inline scripts parse`); a parse error fails the build.

## Lessons (each cost real time)
- Identify a visual artefact before fixing it: render the view with groups hidden (`shot-probe.mjs`). "Pale cones" were the floor
  reflection, "dark boxes" were shadows baked in the floor light, black bands were a floor-light texture stretched over a bigger floor.
- Baked data outlives geometry edits: the preload repaints the floor light under removed/moved layout objects and composes the light of
  extended floors (`MF7_LIGHT_ERASE`, `MF7_LIGHT_BOX` from the build).
- A validator must keep the worst point per object, not the first. Plant a fault to prove a check works.
- A `//` comment in a one-line code edit swallowed the rest of the line and silently disabled the preload: syntax-check after edits.
- PowerShell: never name a helper `R` (alias of Invoke-History); do multi-replacement edits with a Node script; never nest JS
  template literals inside a template literal used as replacement text.
- The guided camera still loses the trolley briefly (0.3-6.9% at 3x, worst on elevator rides); the first ~10 s of some runs stutter.
  Frame rate is to be optimised later (owner).
