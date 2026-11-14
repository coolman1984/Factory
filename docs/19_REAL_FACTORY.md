# 19 — Real factory from AutoCAD (2D, 3D, engine, film)

Status 2026-11-14: **built and tested.** The real E1–E2 site is imported from the company AutoCAD layout in true metres into a
separate Control Center database, shown in 2D (Control Center layout map) and 3D (Godot), and trolley path 1 of INJ 1 is timed
by the Factory Engine and filmed. Company data never enters this repository: the CAD extraction, the import settings, the real
database and the films stay in untracked folders (`Material-Flow/dist`, `control/data/`).

## 1. Start

| What | How |
|---|---|
| Real-factory Control Center | double-click `start-real-factory.cmd` (port 8766, database `control/data/real-factory.db`; imports on first start) |
| Live 3D on this laptop (recommended) | Control Center → **3D & film** → *Open 3D in browser* (`/3d.html?path=inj1-wh`): three.js, the same build as the Material-Flow V8 player; 60 fps here |
| Godot window (optional) | Control Center → **3D & film** → *Godot window*, or `node control/real/film.mjs live --path inj1-wh` (about 18 fps on Intel Iris Xe) |
| Render a film | Control Center → **3D & film** → *Render film*, or `node control/real/film.mjs film --path inj1-wh` (MP4 in `control/data/film/`) |
| Re-import after a CAD or setting change | `node control/real/import-site.mjs` (one recorded command; undoable; engine runs every path afterwards) |

Browser keys: Space play/pause, G guided, F follow, C chase, V overview, O free, P 2D plan, R record a take, 1/2/3 fly to
E1/E2/EPS; drag rotate, right-drag pan, wheel zoom. The browser viewer reuses the Material-Flow V8 player's methods: its three.js
build, its look library (`MFLook`: studio reflections, concrete floor with joints, wall and paint finishes), neutral tone mapping,
pixel ratio 1, and a guided camera that keeps one calm angle per step and checks the true CAD walls so the trolley is never
hidden. Takes (browser video, WebM) are saved to the Control Center and play on the **3D & film** page.
Godot window keys: Space pause, Left/Right shot, F free camera (W A S D Q E, right mouse to look, Shift fast), 1/2/3 fly to E1/E2/EPS,
L labels, H HUD, Esc quit.

## 2. Pipeline

| Step | Code | Output |
|---|---|---|
| CAD extraction (earlier work) | Material-Flow `dist/SEEG_Y26_AI_Package/layout.sqlite` | 6.1 M DXF entities, millimetres |
| Read CAD, expand block references one level, group geometry into objects | `control/real/cad.mjs` | walls, columns, object footprints (m) |
| Import into master data | `control/real/import-site.mjs` + `control/data/real-site.config.json` (untracked) | buildings, areas, 414 objects, 8 CAD layers (9,540 shapes), stops, paths, navigation |
| Engine timing and route clearance | `control/real/path.mjs` | runs saved with every event; clashes recorded in the path |
| Scene package | `control/real/export-scene.mjs` | `control/data/film/*.json` |
| 3D models | `viewer/blender/build_assets.py` (Blender 5.2, procedural) | `viewer/assets/*.glb` (18 models) |
| Browser 3D (live) | `control/ui/3d.html`, `control/ui/viewer3d.js` (three.js from `material-flow/src/v8/vendor`) | 60 fps, instanced batches, engine timeline, follow / free / 2D plan, speed 1-60x, scrubber |
| 3D film | `viewer/godot/` (Godot 4.7: `main.gd` world, `director.gd` camera and film time, `hud.gd` overlay) | live window or MP4 |

Site frame = CAD world metres minus the origin (560, 290). Godot: x east, y up, −z north.

## 3. What is imported (true dimensions)

| Item | Source | Count / size |
|---|---|---|
| E1, E2, EPS buildings | wall analysis (see Material-Flow `private/sites/site-01/layout/real-dimensions.json`) | E1 149.8 × 212.5 m, E2 110.5 × 177.5 m, EPS 118.7 × 43.1 m |
| Exterior walls, walls, partitions | `_exterior walls`, `wall`, `--Wall`, `_interior partition` | 1,511 / 3,817 / 2,245 segments |
| Columns | `기둥` | 160 |
| Crane runway, bridge cranes | `crane` | 4 rails, 6 cranes |
| Injection machines and auxiliaries | `injection` (labels 650–2,500 t) | INJ 1: 6 + 15, INJ 2: 11 + 25 |
| SMT / Auto PBA modules, EPS molding machines, equipment, racks, tables, bins, PCs, bollards, pallets | layer rules in the importer | 28, 15, 43, 80, 30, 4, 18, 58, 52 |
| Floor, load and road markings | `0`, `_lines`, `_load marking`, `_road`, `road stone` | 1,803 segments |

Object detection groups each layer's geometry on a grid; long lines are split into machine-sized modules; outlines too large to
be one object are skipped (20). Heights are planning values per type (the CAD is 2D).

## 4. Registration of the player's plan

The Material-Flow INJ 1 plan picture overlaps the CAD lines by **96.6 %** at exactly **0.12000 m per pixel** (the player's own
scale); 3 m off in either direction drops the overlap to about 60 %. So player metres = CAD metres with a pure shift:
CAD x = x + 566.16, CAD y = 587.88 − y. Stops, devices and both INJ 1 routes are moved onto the CAD with it.

## 5. Engine and clearance

Each path step is an engine transport leg: travel = true route length ÷ push speed (1.0 m/s) or AGV speed (1.2 m/s), plus the
step's wait. Waits are planning assumptions (item slip 60 s, final scan 60 s, manual scan 15 s, W/H 90 s, TO mapping 45 s,
kitting 120 s, main line 30 s), editable in the path record. Path 1 as drawn: 621 s, 212.9 m; after auto-route 611.5 s, 203.3 m (132.5 m pushed, 70.8 m AGV), invariants OK.

Clearance check: the route (from the current plan) is tested against every CAD object (footprint + 0.6 m half trolley width)
and every wall. As drawn in the plan, path 1 crossed **2 racks** of the Y26 CAD and path 2 crossed 1 rack and 1 wall.

**Auto-route** (`control/real/autoroute.mjs`, run by every import, also `POST /api/autoroute`): each clashing step is replaced
by the shortest clear route between the same points (A* on a 0.25 m grid, walls + 0.5 m and objects + 0.7 m, simplified to
straight runs), saved as one recorded, undoable command, then the engine re-times the path. Result: **0 clashes**; path 1
**611.5 s, 203.3 m**, path 2 690.3 s, 297.1 m. The changed steps and the cleared obstacles are kept in the path's `clearance`.

## 6. Look, performance, film

- Daylight architectural cut-away (all buildings open from above), V8.3-like clean look: SSAO, SSIL, SSR, soft sun shadows,
  AgX tone mapping; every object type batched in one MultiMesh (about 20 draw batches for 414 objects).
- Laptop preset (`--quality=1`, used for live view): no SSIL/SSR, 2 shadow splits, 0.8 render scale with FSR, no MSAA.
- Film (`--quality=3`): 15 phases, 76 s for 621 s of engine time: drone establishing shot, machine-row flyover, chase, 2D plan,
  crane rise, side track, low AGV shot, orbits at stops, crane reveal and end card with the engine numbers. The camera rises over
  any true CAD wall between it and the trolley. Movie Maker renders every frame (about 7 min on Intel Iris Xe), then H.264.

## 7. Tests and limits

`npm test` (engine, Control Center incl. languages and UI). Real-factory checks run on this PC only (company data): import with
0 problems, engine invariants OK, 2D map without page errors, review stills and the full film inspected frame by frame.

Limits: object classes and heights are inferred from 2D layers; walls are extruded line pairs (no door openings); the INJ 1
plan picture shows about 10 injection machines where the Y26 CAD has 6 (different drawing revisions); wait times are assumed.

## 8. Material Flow Player V9 (2026-11-14)

V9 is the complete player on the new engine, built from everything the V8 player taught:

| | |
|---|---|
| Open live (master data, Save) | Control Center (`start-real-factory.cmd`) → **3D & film** → *Open Material Flow Player V9*, or `http://127.0.0.1:8766/v9` |
| Offline file (like V8) | `node control/v9/build.mjs` → `Material-Flow/dist/Material_Flow_Player_v9.0.html` (6.2 MB, double-click, no server) |
| Code | `control/ui/v9.html`, `control/ui/v9.js`, `control/real/timing.js` (engine timing shared by Node and the browser), `control/v9/build.mjs` |

- **All V8 tabs and paths on the true CAD**: INJ 1, INJ 2, EPS, Press; 10 paths, 46 stops. One transform fits every V8 slide
  (INJ 1 96.6 %, INJ 2 92.9 %, EPS 93.7 % of CAD lines, 0.12 m/px): CAD = plan + (566.16, 587.88).
- **Two floors and elevators**: the CAD has no 2nd-floor drawing, so each tab's 2nd floor is placed exactly above the 1st through
  its elevator landings (offsets INJ 2 205.2 m, EPS 173.85 m, Press 190.8 m) at an assumed 6.0 m, with V8's traced walls and plan
  drawing; 5 elevator shafts; elevator rides are engine legs on a shared lift resource (60 s assumed). The 2nd floor turns
  see-through while the trolley is below (2F: auto / show / hide).
- **Factory Engine in the page**: Edit (E) changes waits, push/AGV speed and the lift time; the engine re-times at once. Live
  mode saves to the master data (recorded, undoable) and stores an engine run; the offline file downloads the edits as JSON.
- **V8 lessons**: three.js build and `MFLook` (reflections, concrete, walls), neutral tone mapping, pixel ratio 1, guided camera
  that keeps the trolley in sight using the true walls of its floor, minimap per floor, takes (WebM video), V8 glass UI.
- **Routes**: all 10 paths clash-free against the CAD (auto-route; devices, gates and elevators are not obstacles; an object
  drawn where an elevator stands is the elevator core and is removed). INJ 1 keeps the CAD's 6 injection machines (owner
  decision 2026-11-14).
- Checked here: all 10 paths load; offline file 60 fps, live 36–60 fps in headless Chrome on this laptop; engine re-timing and
  save; no page errors.

### 8.2 V9.1 Studio (2026-11-14): editor, director, numbers, light autosave

Open with **✎ Studio** or **E**. Code: `control/ui/v9-studio.js` (the player `v9.js` gives it hooks and an object index).
Offline file: `node control/v9/build.mjs --version 9.1` → `Material_Flow_Player_v9.1.html`.

| Area | What it does |
|---|---|
| Player | V8 trolley model (Blender, 1.4× real size), no people; floor arrows every 4 m on the route; V7 step chips (number + title; done / now / next) at every stop; timeline lanes (move, wait, AGV, lift, captions, camera keys; click to seek); Director camera mode (D); captions on screen. |
| Objects | Click any object in 3D or the 2D plan; drag to move (snap 0.1 / 0.5 / 1 m, Alt = no snap); Q / E turn 15° (Shift 90°); exact X, Y, turn, size; duplicate (X), delete, focus (F); find by name; place a new object of any type. |
| Stops | Drag a stop; the routes that end there follow; + Stop (N) makes a new one. |
| Routes | Drag route points; double-click a leg adds a point; right-click removes one; Straighten (S, Shift = whole path); Auto-route (R, live Control Center). |
| Draw (2D) | Draw route (B): the camera turns to the 2D plan; redraw a step, or draw a whole new path: click the start stop, corners (Ortho keeps them square), the next stops (Shift+click on empty floor = new stop); Enter finishes. |
| Steps | Title, text, stop, push / AGV, wait, insert, delete; path name, colour, speeds, lift time. Every change re-times the trip with the Factory Engine in the page. |
| Director | Camera keys (K; Shift+K rides with the trolley; eases smooth / linear / in / out / cut), record a camera move (J), captions (C), six shots (1–6, Shift = save), play (Shift+P). Record (R) films the Director camera when keys exist. |
| Numbers | Trip time, distance (push / AGV), lifts, trips per 8 h shift, change since the path was opened, per-step table, live clashes. |
| Checks | Live clash check of the route (trolley half width 0.42 m) against CAD objects and walls, marked on the floor and counted in the toolbar. |

**Saving (learned from Sticky Notes Pro):** the whole document lives in memory; an edit marks its records dirty and, 0.7 s after
the last edit, one `batch` command stores them (stops, then objects, then paths) in the Control Center database in one
transaction: recorded, undoable in the Control Center, revision +1. The engine run of the edited path is stored too. Undo /
redo in the page: 200 steps (Ctrl+Z / Ctrl+Y). The offline file keeps the edits in this browser (localStorage), restores them
on open, and **Export** downloads them as JSON. No new server process or library: the existing Node server and SQLite (WAL).

Checked here (headless Chrome, a copy of the database): wait edit re-times and autosaves; object drag saved; new path drawn in
the 2D plan and saved; Ctrl+Z removes it and the deletion is saved; camera keys and the Director camera; offline edit restored
after reload; 39–47 fps; no page errors. Not checked: auto-route from the Studio, placing new objects, 2nd-floor editing.

### 8.1 V7 director camera (2026-11-14)

The owner judged the Material-Flow camera best up to V7 (V7.0–V7.7.1). V9 now uses that camera, converted from V7 units
(0.3 m) to metres:

| Part | V7 behaviour kept in V9 |
|---|---|
| Intro | Top-down over the whole route, rising to an oblique view, then landing on the first trolley shot (6.5 s; the trip waits). |
| Guided angle | One azimuth per long stretch (≥ 12 m; short pieces borrow the nearest long stretch, so corners never turn the camera): the clearest of 16 angles, kept near the house angle −0.55 rad. |
| Tilt and distance | High oblique tilt 0.94 rad; distance 1.35 × the stretch, between 0.85 and 1.8 × 34 m. |
| Sight | Every angle is checked against the CAD walls and tall objects (racks, machines) of the trolley's floor, now and 1.2 s ahead; a clear forced angle is held (no hunting); the tilt on the way must see too; a blocked rendered eye is rescued by the smallest tilt-up. |
| Motion | Exact critically damped springs for eye and target with trolley-velocity feed-forward (no lag at 10×–60×); turns eased at 1.3/s and capped at 0.6 rad/s (1.2 when forced); a seek or jump is a cut. |
| Follow / Chase | Follow: same sight logic at 26 m. Chase: 14 m behind, turns ≤ 0.6 rad/s, rises only as far as a wall needs. |
| Free / Overview / 2D plan | Start from the current view; every change is a smooth spring move. Wheel or drag in a trip camera switches to Free. |

Checked here (headless Chrome, 30×, all 10 paths): no page errors; 36–51 fps; camera cost about 0.3 ms per frame; turn speed
95th percentile 15–43 deg/s; the one remaining spike per path is the intended cut when the trip loops. Visibility uses a 2D
wall/object model with heights, not the rendered meshes; low objects (< 1.6 m) and elevators are not obstacles.
