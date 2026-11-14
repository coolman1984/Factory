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
