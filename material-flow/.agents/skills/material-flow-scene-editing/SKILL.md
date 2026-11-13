---
name: material-flow-scene-editing
description: Edit Material Flow scene files as data - new or changed trolley paths, steps, stops, moving a stop and straightening, doors and layout edits, PCs / RFID gates / scanners, 3D objects, elevator rides, several trolleys, numbers and before/after comparison. Use when the owner asks to change what the player shows (not the camera or films).
---

# Scene editing

1. Read [docs/RECIPES.md](../../../docs/RECIPES.md) and find the matching recipe; field details in
   [docs/SCENE_MANUAL.md](../../../docs/SCENE_MANUAL.md); the area guide in [docs/CONTROL_GUIDES](../../../docs/CONTROL_GUIDES/README.md).
2. Ids and coordinates: `node tools/mf.mjs layout-ref` → `private/v7/LAYOUT_REFERENCE.md` (floors and their metre ranges, elevators
   with both landings, stops, devices, every `wall:N` / `rack:N` with its rectangle). The scene itself lists stops and devices.
3. Edit `private/v7/scenes/<tab>.scene.json` (a small `node -e` script that reads, changes and writes the JSON is safest; keep ids).
4. Helpers: `mf route` (a step around obstacles, as exact points), `mf straighten`, `mf fix-links` (after moving stops or reordering).
5. `node tools/mf.mjs validate <scene>` until 0 errors - every message says where and what ([docs/TROUBLESHOOTING.md](../../../docs/TROUBLESHOOTING.md)).
6. Look: `node tools/mf.mjs shots <scene>` (read the PNGs) and `node tools/mf.mjs play <scene> --path <id>`.
7. `node tools/mf.mjs bake` puts the scenes into the player; `node tools/mf.mjs numbers` / `diff` for the report.

Facts that save time:
- Units: metres, x right, y down; the 2nd floor of a tab sits beside the 1st floor in the frame (larger x).
- `auto` routes avoid narrow doorways (wider margins than the validator): when the owner drew a line, write it as `points`.
- Elevator ride: the step before ends exactly at the lower landing; the ride's stop is the upper landing.
- A scanner that stops the trolley: `at` exactly on a leg, `stand` beside it, `stops: true`.
- "N m east" = x + N; "north" = y - N.
- Never touch engine code for these requests.
