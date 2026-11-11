# Material Flow scene files: the agent manual

A **scene file** describes everything one tab of the Material Flow player shows: the stops, the PCs and RFID devices, the
trolley paths with their steps, and (in later versions) objects, camera shots, captions and video takes. The player engine never
changes. To create or change a scene, edit its scene file, validate it, and load it into the player.

This manual is the complete reference. Everything here is checked by the validator (`tools/mf-validate.mjs`). The facts of the
factory (floor extents, elevator landings, the IDs of racks and walls) are company layout data, so they are not in this file. They
are in the generated `private/v7/LAYOUT_REFERENCE.md` (see section 9).

Contents:

1. Workflow
2. Units and coordinates
3. The file
4. Stops
5. Devices
6. Paths and steps
7. Layout edits
8. Sections for later versions
9. Reference data
10. Validator rules and messages
11. Recipes
12. Worked example

---

## 1. Workflow

1. **Get the current scene.** Built-in scenes are in `private/v7/scenes/<tab>.scene.json` (tabs: `inj1`, `inj2`, `eps`,
   `press`). In the player, use **Scene file → Download** or **Save as** to get the scene on screen, including edits.
2. **Edit the JSON** by following this manual. Keep every `id` you do not mean to change.
3. **Validate:** `node tools/mf-validate.mjs <file.scene.json>`. Exit code 0 means no errors; warnings are allowed. Fix every
   error. Each message names the exact place, for example `paths[inj1-wh].steps[s4].route`.
4. **Show it** in one of two ways:
   - **Drop** the file onto the open player (or use **Scene file → Open…**). The player validates it again and refuses a scene
     with errors.
   - **Bake** it into a player file:
     `node tools/build-v7.mjs 7.1 --out dist/test/my-player.html --bake <file.scene.json> [other tabs' scene files]`.
     A tab without a baked scene falls back to the scene built from the V6 data.
5. Play the changed path in the player and check it visually.

The player saves the scene on screen in the browser automatically. **Scene file → Reset to built-in** forgets that copy. When a
player file is rebuilt with a different baked scene, the baked scene wins and the older browser copy is offered as "Load it".

## 2. Units and coordinates

| what | unit |
|---|---|
| positions, sizes, distances | metres |
| time | seconds |
| speed | metres per second |
| angles, headings | degrees |

- **Coordinates** are plan metres in the project frame of the built-in layout: **x grows to the right, y grows downward** (as on
  the slide and the drawing). The 2F plate sits beside 1F in this frame, not on top of it. Its x range is in the layout reference.
- **Heading**: `0` = up on the plan (north), `90` = right (east), `180` = down (south), `270` = left (west). Clockwise.
- A floor is named by its key, for example `1F` or `2F`. Every point must lie inside its floor's extent (up to 0.9 m outside is
  tolerated).
- The trolley footprint is 0.98 m × 1.74 m at 1.4× display size (the real trolley, enlarged so it stays readable). Clearance is
  measured from this footprint.

## 3. The file

```json
{
  "format": "mf-scene", "version": 1, "project": "inj1", "layout": "inj1",
  "title": "INJ 1 – Trolley paths",
  "stops": [ ... ], "devices": [ ... ], "paths": [ ... ], "layoutEdits": [ ... ],
  "objects": [], "director": {}, "viewpoints": [], "notes": ""
}
```

| field | required | value |
|---|---|---|
| `format` | yes | always `"mf-scene"` |
| `version` | yes | always `1` |
| `project` | yes | the tab: `inj1`, `inj2`, `eps` or `press`; must match the player tab it is loaded into |
| `layout` | no | same as `project` (the built-in factory replica) |
| `title` | no | text shown in the top bar |
| `stops`, `devices`, `paths`, `layoutEdits` | no | lists; playable scenes need at least one path with a step and a valid stop; see sections 4 to 7 |
| `objects`, `director`, `viewpoints` | no | accepted now; shown from later versions (section 8) |
| `notes` | no | free text for people and agents; ignored by the engine |

**IDs:** every stop, device, object and path has an `id`, and every step has an `id` that is unique within its path. Use short
lowercase words joined with `-` (`final-scan`, `scanner-wh`). Other entries refer to these IDs, never to list positions, so
reordering a list never breaks anything.

## 4. Stops

A stop is a named point where a step ends. It shows a symbol and a label chip on the floor.

```json
{ "id": "final-scan", "name": "Final Scan / GR", "floor": "1F", "x": 43.5, "y": 152.7, "symbol": "result", "color": "#7030A0" }
```

| field | required | value | default |
|---|---|---|---|
| `id` | yes | unique text | |
| `name` | no | label text | the id |
| `floor` | yes | floor key | |
| `x`, `y` | yes | metres | |
| `symbol` | no | `result` (circle), `mapping` (square), `quality` (hexagon), `area`, `dest`, `scan`, `lift`, `wip`, `obama` | `area` |
| `color` | no | `#rrggbb` | `#156082` |

## 5. Devices

Three types exist: `pc`, `rfid-gate` and `scanner`.

### PC workstation (`"type": "pc"`)

```json
{ "id": "pc-final-scan", "type": "pc", "kind": "result", "floor": "1F", "x": 41.26, "y": 152.98, "heading": 90,
  "size": 2.4, "label": "Prod. Result / GR PC", "serves": "final-scan", "done": "Final scan / GR done", "color": "#7030A0" }
```

| field | value | default |
|---|---|---|
| `kind` | `result` (circle on the floor), `mapping` (square), `quality` (hexagon) | `result` |
| `x`, `y` | centre of the desk and tower, metres | |
| `heading` | direction the desk front faces, degrees | `90` |
| `size` | icon scale, 0.5 to 4 (1 = real size; the owner wants 2.4) | `2.4` |
| `serves` | stop id: the screen lights up while the trolley is at that stop | none |
| `done` | text of the chip shown when the work at the stop is done | none |
| `color` | `#rrggbb` of the floor symbol | `#7030A0` |

### Auto RFID gate (`"type": "rfid-gate"`)

Ceiling antennas over the lane that read the tag while the trolley drives through, with no stop.

```json
{ "id": "gate-final-scan", "type": "rfid-gate", "floor": "1F", "x": 43.5, "y": 165.6, "lane": "north-south", "label": "Auto RFID gate" }
```

| field | value | default |
|---|---|---|
| `x`, `y` | centre of the lane under the gate | |
| `lane` | `north-south` or `east-west`: the direction trolleys drive through | `north-south` |

The posts stand 2.2 m either side of the centre, so the lane must be clear there. A path counts as passing the gate when it
crosses the gate line within the posts.

Up to 64 gates per tab (all gates of a tab share one animated shader, which has room for 64).

### Handheld scanner (`"type": "scanner"`)

A scanner on a stand. The operator lifts it and scans the trolley's tag.

```json
{ "id": "scanner-wh", "type": "scanner", "floor": "1F", "at": [43.5, 185.7], "stand": [42.9, 185.7], "stops": true,
  "size": 2.4, "label": "Manual RFID scan", "done": "RFID scanned" }
```

| field | value | default |
|---|---|---|
| `at` | `[x, y]`: the point on the lane where the tag is read | |
| `stand` | `[x, y]` of the stand, beside the lane, 0.6 to 1.5 m from `at` on either side (the validator checks it is clear) | 0.6 m west of `at` |
| `stops` | `true`: the trolley stops at `at` for 1.8 s and is scanned. `at` must then lie exactly on a path leg (within 6 mm). `false`: the scanner is shown and scans trolleys that pass close by without stopping. | `false` |

A scanner has no path field: it acts on **every** path whose leg passes through its `at`. "A scan in the middle" of a step
means the midpoint of that step's longest leg unless the owner says where; "just before a stop" means about 4.5 m before it on
the last leg (clear of the stop's own marker and PC). The 1.8 s stop is counted inside that step's time.

Place words in a request that no path matches (for example "the lane the trolley uses to leave KD" when no path leaves KD): put
the device on the nearest lane a path does use, do not invent a path or reorder the process, and name the assumption in the
report so the owner can confirm.
| `stop` | stop id: scan during the wait at that stop (the step's stop) instead | none |
| `size`, `label`, `done` | as for PCs | |

## 6. Paths and steps

A path is one trolley journey: an ordered list of steps. Each step drives to (or stays at) one stop, then waits.

```json
{ "id": "inj1-wh", "name": "1 · Item Slip to W/H to Main Line", "color": "#7030A0",
  "steps": [
    { "id": "s1", "stop": "item-slip", "title": "Item Slip", "text": "The full trolley leaves the machines…", "mode": "push", "wait": 1.8, "route": { "type": "stay" } },
    { "id": "s2", "stop": "final-scan", "title": "Final Scan", "text": "…", "mode": "push", "wait": 1.8, "speed": 4,
      "route": { "type": "points", "points": [[43.5, 178.2], [43.5, 152.7]] }, "camera": { "distance": 90 } }
  ] }
```

Path fields:

| field | value | default |
|---|---|---|
| `id` | unique text | |
| `name` | the tab button text (keep the leading number `1 ·`, `2 ·`, … for the order) | the id |
| `color` | `#rrggbb` | `#7030A0` |
| `steps` | at least one step | |

Step fields:

| field | value | default |
|---|---|---|
| `id` | unique within the path (`s1`, `s2`, …) | |
| `stop` | stop id where this step ends | |
| `title` | the step's name on the card and in the steps list | |
| `text` | the explanation on the card | `""` |
| `mode` | `push` (pushed by hand), `agv` (an AGV moves it; badge "Auto"), `manual` | `push` |
| `wait` | seconds the trolley waits at the stop after arriving, 0 to 600 | 0.7 s (0.69 s when the step does not move) |
| `speed` | cruise speed while moving, 0.2 to 8 m/s | 4 |
| `route` | how the trolley gets to the stop (below) | `{ "type": "stay" }` |
| `camera` | `{ "distance": metres, "view": "2d" or "3d" }`: how far the guided camera stays from the trolley in this step; `view` is kept from V6 and only informational (copy what the neighbouring steps use) | 90 m, `"3d"` |

The trolley speeds up and slows down smoothly on every leg and turns on the spot at corners (0.3 s per quarter turn).

### Routes

| `route` | meaning |
|---|---|
| `{ "type": "stay" }` | No movement: the trolley is already at the stop. Only for the first step or a step whose stop is where the trolley stands. |
| `{ "type": "points", "points": [[x, y], …] }` | An exact path. The first point is where the previous step ended; the last point is this step's stop. Legs may go in any direction, but keep them horizontal or vertical (the aisles are). |
| `{ "type": "auto" }` | The engine finds a clear path from where the trolley is to the stop: horizontal and vertical legs, few corners, aisle centres, around walls, racks, machines, columns and devices. It is computed when the scene loads, so it updates when the layout changes. Use it unless the owner wants an exact line. |
| `{ "type": "elevator", "elevator": "Elev 5" }` | A ride in that elevator from its lower landing to its upper landing. The previous step must end exactly at the lower landing, and this step's stop must be at the upper landing (both points are in the layout reference). Rides go upward only. |

**Joining rule:** each step starts where the previous step ended. After an elevator ride, that is the upper landing.

## 7. Layout edits

These change the built-in factory: move, turn or delete a wall, column, rack, machine or pallet block. IDs and positions are in
the layout reference.

```json
"layoutEdits": [ { "target": "rack:12", "move": [3, 0] }, { "target": "rack:13", "turn": 90 }, { "target": "wall:40", "delete": true } ]
```

| field | value |
|---|---|
| `target` | `wall:N`, `column:N`, `rack:N`, `machine:N` or `pallet:N` |
| `move` | `[dx, dy]` in metres |
| `turn` | `0`, `90`, `180` or `270` (about the object's centre) |
| `delete` | `true` removes it |
| `door` | `[from, to]` in metres along a straight wall (its y range for a vertical wall, x range for a horizontal one): cuts a doorway, for example `{ "target": "wall:170", "door": [61.65, 65.25] }` |

Routes, the collision check and the plan follow the edited layout. Changing layout edits in the player reloads the page.

### Added layout items (V7.7.2)

`layoutAdds` appends factory geometry as data; the generated reference below lists every field. `x`/`y` is the north-west
corner of the final footprint, while `w`/`d`, storage `rows`/`cols` describe the shape before a quarter turn. Walls use two
different finite endpoints `a`/`b`; turn a wall using a `layoutEdits` operation. Solid additions join the normal router and
trolley sweep. Storage without pallets is only a floor marking. Storage supports at most 999 pallets per addition; larger
areas must be split. Added items have no pre-baked shadow; existing shadow repair concerns edited original geometry.

An addition's zero-based list position reserves a numeric slot: `100000 + 1000 * position`. Machines, lines, conveyors,
tables and models use `machine:<slot>`, racks `rack:<slot>`, walls `wall:<slot>`. Storage pallets use `pallet:<slot+1>` through
`pallet:<slot+rows*cols>` in original row-major order, including after a turn. Append entries; retain slots when deleting
geometry with `layoutEdits`. Reordering/removing entries, changing kinds, or changing storage cell counts requires updating
every affected target. The text `id` alone does not determine these numeric references.

Studio folds simple added-block/rack moves and turns into `layoutAdds` on save. Delete keeps the entry and writes a delete
edit, so later slots keep their identities. Storage grids are edited as scene data; selecting one pallet edits only that cell.
Door fragments (`wall:<slot>a/b`) are generated pieces, not independently editable targets: change the parent wall's ordered
edits in the scene. Imports and Studio layout additions reload the factory after a successful browser save; Studio preserves
undo/redo across this reload in the current tab. If saving fails, export the in-memory scene before a manual reload.

## 8. Objects, several trolleys, director (V7.6)

- **`objects`**: placed 3D objects. Each one is `{ "id", "type", "floor", "x", "y", "heading", "w", "d", "h", "color", "name", "text" }`, with `w`, `d` and `h` in metres.
  - Types: `crate`, `pallet`, `rack`, `column`, `wall`, `fence`, `cone`, `floor-arrow`, `floor-zone`, `sign` (`text` is shown on the sign), `trolley`.
- **Several trolleys** on a path: set `"trolleys": 1..12` (whole numbers) on the path, and `"headway"` for the seconds between trolley starts. The Studio's Numbers tab shows the closest distance between moving trolleys; under 3 m counts as congestion.
- **`director`**: one entry per path id, `{ "keys": [...], "caps": [...] }`, plus a top-level `takes` list. Normally you edit these in the Studio's Director tab.
  - **keys** are camera keys:
    - `t`: story seconds
    - `x`, `y`, `z`, `dist`, `az`, `pol`, `fov`: camera target, distance and angles in the engine's own 3D units, not in metres; that's why the Director tab is the way to edit them
    - `ease`: `smooth`, `linear`, `in`, `out` or `cut`
    - `follow: true` rides with the trolley, using the offsets `ox`, `oy`, `oz`
  - **caps** are captions:
    - `t0` and `t1`: start and end, in seconds
    - `title` and `text`: a string, or `{ "en", "ar", "ko" }`
    - `pos`: `lower`, `upper`, `center`, `left` or `right`
    - `style`: `glass`, `cinema`, `banner` or `minimal`
    - `size`: 0.7 to 1.8
- **`viewpoints`**: saved camera shots 1 to 6, using the same camera pose fields as keys (no `t` required); empty slots may be `null`.
- **`takes`**: entries with unique `id`, text `name`, path id `flow`, `t0 < t1` (nonnegative seconds), positive `speed` up to 8, optional `fps` from 1 to 120, `cam`, `quality`, `captions`, `card`, and `labels`. Record through Studio.
- Keys and captions need unique `id` within their respective lists. Camera poses must be finite with positive `dist`; following keys need finite `ox`, `oy`, `oz`. The validator rejects malformed lists, translations and time ranges before import.
- **`studio`**: editor settings: `snap`, `ortho`, caption language `lang`, and `shift` (hours).
## 9. Reference data

Generate the reference for the current player with:

```
node tools/v7/layout-reference.mjs [player.html] [private/v7/LAYOUT_REFERENCE.md]
```

The reference lists, per tab:

- each floor's extent
- each elevator with both landings
- the stops and devices of the built-in scene
- every layout object ID with its rectangle

It is company data: keep it in `private/`.

## 10. Validator rules and messages

`node tools/mf-validate.mjs <scene.json> [--player <player.html>] [--json]`

**Errors** (exit code 1) and the problem each one names:

- **Format:** `format`, `version` or `project` is wrong.
- **IDs:** missing or duplicate.
- **References:** an unknown stop, floor, elevator or layout object.
- **Points:**
  - not numbers
  - outside their floor (the message gives the floor's range)
- **Values:**
  - `symbol`, `kind`, `lane`, `mode` or `route.type` not in its list
  - colours not in `#rrggbb` form
  - `speed` outside 0.2 to 8
  - `wait` outside 0 to 600
  - `size` outside 0.5 to 4
  - `turn` not 0, 90, 180 or 270
- **Joining:**
  - `points[0]` is not where the previous step ends
  - the last point is not the stop
  - `stay` is used while the trolley is elsewhere
  - `auto` is used on the first step
  - the floor changes without an elevator ride
- **Elevators:**
  - more than 64 RFID gates in a tab
  - the ride does not start at the lower landing
  - its stop is not the upper landing
  - `auto` found no clear path
- **Collisions:**
  - `the trolley hits <object> on leg N at (x, y)`
  - `the trolley passes 0.05 m from <object> …; needs at least 0.09 m`

  The real trolley footprint is swept every 7.5 cm along each leg and through each corner turn. The objects checked are walls,
  columns, racks, machines, pallets and devices (after layout edits). Studio additionally includes placed solid props in routing and collision marks; Node validation does not yet sweep props.
- **Devices:**
  - a device overlaps a layout object or another device
  - a scanner with `stops: true` is not on a path

**Warnings** (exit code 0):

- a clearance under 0.15 m
- sections that are not shown yet

## 11. Recipes

**Add a stop.** Append to `stops`: `{ "id": "buffer-a", "name": "Buffer A", "floor": "1F", "x": 74, "y": 150, "symbol": "area" }`.
Choose a point in an aisle; the layout reference shows where the racks are.

**Add a path.** Append to `paths`: a new `id`; a `name` starting with the next number (`3 · …`); a first step with
`"route": { "type": "stay" }` at the starting stop; then one step per stop with `"route": { "type": "auto" }`. Validate.

**Insert a step.** Insert the step object at its place in `steps` with a new step `id`. If the next step uses `points`, its first
point must become the new step's stop, or change its route to `auto`.

**Change the order of steps.** Reorder the step objects. Then set the route of each moved step and of the step after it to
`auto` (or fix their first points). Validate.

**Add a scanner stop on a path** (the trolley stops and is scanned there). Find a point on a leg of the path: on a vertical leg
x equals the leg's x, and y lies between its ends. Add
`{ "id": "scanner-x", "type": "scanner", "floor": "1F", "at": [x, y], "stand": [x - 0.6, y], "stops": true }`. The stand must
not touch a wall or rack; move it to the other side (`[x + 0.6, y]`) if it does.

**Add an auto RFID gate.** Find a straight leg. Add
`{ "id": "gate-x", "type": "rfid-gate", "floor": "1F", "x": <on the leg>, "y": <on the leg>, "lane": "north-south" }`
(`east-west` for a horizontal leg). The space 2.2 m either side of the leg must be free for the posts.

**Add an elevator ride** (for example Elev 5 in INJ 2). Look up its landings in the reference. Make sure there is a stop at each
landing (add them if needed). Then add a step to the lower-landing stop with `auto`, followed by a step
`{ "id": "s7", "stop": "<upper-landing stop>", "title": "Elev 5 up to 2F", "route": { "type": "elevator", "elevator": "Elev 5" } }`.

**Make a step slower or faster.** Set `"speed": 2` (m/s) on the step. To make it wait longer at its stop, set `"wait": 5`.

**Change a step's explanation or label.** Edit `title` (card heading and steps list) and `text` (card explanation).

**Move a rack out of an aisle.** Find its `rack:N` in the reference and add `{ "target": "rack:N", "move": [0, -2] }` to
`layoutEdits`. Validate: paths near it may now pass, or be blocked.

**Open a door in a wall.** Find the `wall:N` that closes the doorway and add `{ "target": "wall:N", "delete": true }`. Change
the affected steps to `auto` so they use the door.

**Straighten a path.** In the Studio: select the step (Paths tab, PageUp/PageDown) or the stop, press S (Shift+S: the whole path), L for one corner, R to auto-route. Moving a stop straightens the legs around it automatically.

**Add a camera shot or a caption.** In the Studio Director tab (K: camera key, C: caption, J: record your camera move); see section 8.

## 12. Worked example: a new path made from data only

Goal: a third INJ 1 path. The trolley goes from Item Slip to Final Scan, then to a new buffer stop at reduced speed, and then an
AGV takes it to Kitting.

1. Copy `private/v7/scenes/inj1.scene.json`.
2. Append the stop:
   `{ "id": "proof-buffer", "name": "Buffer (proof)", "floor": "1F", "x": 74, "y": 150, "symbol": "area", "color": "#1f6feb" }`.
3. Append the path:

```json
{ "id": "inj1-proof", "name": "3 · Proof: Item Slip to Buffer to Kitting", "color": "#1f9d6b", "steps": [
  { "id": "s1", "stop": "item-slip", "title": "Item Slip", "text": "Proof path made by editing the scene file only.", "mode": "push", "wait": 1.5, "route": { "type": "stay" } },
  { "id": "s2", "stop": "final-scan-gr", "title": "Final Scan", "text": "Auto-routed by the engine.", "mode": "push", "wait": 1.5, "route": { "type": "auto" } },
  { "id": "s3", "stop": "proof-buffer", "title": "Buffer (proof)", "text": "A new stop that exists only in this scene file.", "mode": "push", "wait": 2, "speed": 2.5, "route": { "type": "auto" } },
  { "id": "s4", "stop": "kitting", "title": "Kitting (AGV)", "text": "The AGV takes the trolley to Kitting.", "mode": "agv", "wait": 1.8, "route": { "type": "auto" } } ] }
```

4. Validate it: `node tools/mf-validate.mjs private/v7/proof/inj1.scene.json` returns `OK - 0 error(s), 0 warning(s)`.
5. Drop the file onto the player, or bake it in. The tab now has a third button, and the path plays through all 4 steps in
   51.4 s. No engine code was changed. This exact scene is the proof test of V7.1 (`tools/v7/stage1-test.mjs`).

## 13. Field reference (generated)

Every field of the format, generated from `tools/v7/scene-schema.mjs`. `mf docs-check` fails when a scene uses a field missing here.

<!-- GENERATED:fields (mf docs-gen; do not edit by hand) -->
| field | type | unit | allowed values | default | example | meaning |
|---|---|---|---|---|---|---|
| `format` | text |  | "mf-scene" | required | "mf-scene" | File type marker. |
| `version` | number |  | 1 | required | 1 | Format version. |
| `project` | text |  | inj1, inj2, eps, press (the player tabs) | required | "inj1" | The tab this scene describes; must match the tab it is loaded into. |
| `layout` | text |  | same as project | project | "inj1" | The built-in factory replica the scene sits on. |
| `title` | text |  | any | project | "INJ 1 – Trolley paths" | Top-bar title. |
| `notes` | text |  | any | "" | "made by agent X" | Free text; ignored by the engine. |
| `stops[]` | list |  |  | [] |  | Named points where steps end. |
| `stops[].id` | text |  | unique, lowercase-with-dashes | required | "final-scan" | Stable id; steps and devices refer to it. |
| `stops[].name` | text |  | any | the id | "Final Scan / GR" | Label chip text. |
| `stops[].floor` | text |  | a floor key of the tab (1F, 2F) | required | "1F" | Floor the stop is on. |
| `stops[].x` | number | m | inside the floor | required | 43.5 | Plan x (right). |
| `stops[].y` | number | m | inside the floor | required | 152.7 | Plan y (down). |
| `stops[].symbol` | text |  | result, mapping, quality, area, dest, scan, lift, wip, obama | "area" | "result" | Floor symbol (circle, square, hexagon, ...). |
| `stops[].color` | text |  | #rrggbb | "#156082" | "#7030A0" | Symbol colour. |
| `devices[]` | list |  |  | [] |  | PCs, auto RFID gates, handheld scanners. |
| `devices[].id` | text |  | unique | required | "pc-final-scan" | Stable id. |
| `devices[].type` | text |  | pc, rfid-gate, scanner | required | "pc" | Device kind. |
| `devices[].floor` | text |  | a floor key | required | "1F" | Floor. |
| `devices[].x` | number | m |  | required (pc, rfid-gate) | 41.26 | Centre (pc: desk + tower; gate: lane centre). |
| `devices[].y` | number | m |  | required (pc, rfid-gate) | 152.98 | Centre. |
| `devices[].label` | text |  | any | type name | "Prod. Result / GR PC" | Name shown in chips and lists. |
| `devices[].kind` | text |  | result, mapping, quality | "result" | "mapping" | pc only: which PC (floor symbol circle / square / hexagon). |
| `devices[].heading` | number | deg | 0 north, clockwise | 90 | 90 | pc only: direction the desk front faces. |
| `devices[].size` | number | x | 0.5 to 4 | 2.4 | 2.4 | pc and scanner: icon scale (1 = real size). |
| `devices[].serves` | text |  | a stop id | none | "final-scan" | pc only: the screen lights while the trolley is at this stop. |
| `devices[].done` | text |  | any | none | "Final scan / GR done" | pc and scanner: chip text when the work is done. |
| `devices[].color` | text |  | #rrggbb | "#7030A0" | "#7030A0" | pc only: floor symbol colour. |
| `devices[].lane` | text |  | north-south, east-west | "north-south" | "east-west" | rfid-gate only: driving direction through the gate. |
| `devices[].at` | [x, y] | m | on a path leg when stops is true | required (scanner) | [43.5, 185.7] | scanner only: lane point where the tag is read. |
| `devices[].stand` | [x, y] | m | beside the lane | 0.6 m west of at | [42.9, 185.7] | scanner only: where the stand is. |
| `devices[].stops` | true/false |  |  | false | true | scanner only: the trolley stops at `at` for 1.8 s and is scanned. |
| `devices[].stop` | text |  | a stop id | none | "manual-rfid-scan" | scanner only: scan during the wait at this stop instead. |
| `objects[]` | list |  |  | [] |  | Placed 3D objects. |
| `objects[].id` | text |  | unique | required | "crate-1" | Stable id. |
| `objects[].type` | text |  | crate, pallet, rack, column, wall, fence, cone, floor-arrow, floor-zone, sign, trolley | required | "crate" | Object kind. |
| `objects[].floor` | text |  | a floor key | required | "1F" | Floor. |
| `objects[].x` | number | m | inside the floor | required | 60 | Centre x. |
| `objects[].y` | number | m | inside the floor | required | 150 | Centre y. |
| `objects[].heading` | number | deg | clockwise | 0 | 90 | Turn (width runs along x at 0). |
| `objects[].w` | number | m | > 0 | per type | 1.2 | Width. |
| `objects[].d` | number | m | > 0 | per type | 1 | Depth. |
| `objects[].h` | number | m | > 0 | per type | 1 | Height. |
| `objects[].color` | text |  | #rrggbb | per type | "#c9a26b" | Colour. |
| `objects[].name` | text |  | any | type name | "Spare crate" | Name in lists. |
| `objects[].text` | text |  | any (\n = new line) | "INFO" | "KITTING" | sign only: text on the sign. |
| `layoutEdits[]` | list |  |  | [] |  | Changes to the built-in factory (walls, columns, racks, machines, pallets). |
| `layoutEdits[].target` | text |  | wall:N, column:N, rack:N, machine:N, pallet:N (ids in LAYOUT_REFERENCE) | required | "wall:77" | The layout object. |
| `layoutEdits[].move` | [dx, dy] | m |  | none | [0, -0.6] | Move it. |
| `layoutEdits[].turn` | number | deg | 0, 90, 180, 270 | 0 | 90 | Turn it about its centre. |
| `layoutEdits[].delete` | true/false |  |  | false | true | Remove it. |
| `layoutEdits[].door` | [from, to] | m | along a straight wall | none | [61.65, 65.25] | Cut a doorway into a wall. |
| `layoutEdits[].note` | text |  | any | none | "owner 2026-11-11" | Why (ignored by the engine). |
| `layoutAdds[]` | list |  | append only; retain deleted slots | [] |  | New layout items; storage markings alone are not solid. Blocks/racks/walls have Studio transforms; storage grids are edited as data. |
| `layoutAdds[].id` | text |  | unique | required | "line-a" | Label identity; edits use wall/machine/rack:100000 + 1000 x zero-based list position, pallets use base + 1..999. Never reorder/remove slots with references. |
| `layoutAdds[].kind` | text |  | injection, press, utility, machine, line, conveyor, table, rack, storage, wall | required | "line" | Models (injection / press / utility) or simple blocks with one style per kind. |
| `layoutAdds[].floor` | text |  | a floor key | required | "1F" | The floor. |
| `layoutAdds[].x` | number | m | inside the floor | required | 67.6 | West edge (north-west corner). |
| `layoutAdds[].y` | number | m | inside the floor | required | 117.5 | North edge. |
| `layoutAdds[].w` | number | m | > 0 and < 200 | per kind (injection 2.74) | 4 | East-west size (before turn). |
| `layoutAdds[].d` | number | m | > 0 and < 200 | per kind (injection 13.6) | 21 | North-south size (before turn). |
| `layoutAdds[].h` | number | m | > 0 and < 200 | machine 2.2, line 1.3, conveyor 0.9, table 0.85 | 1.5 | Height of a simple block. |
| `layoutAdds[].turn` | number | deg | 0, 90, 180, 270 | 0 | 90 | Turn about the centre (swaps w and d). |
| `layoutAdds[].color` | text |  | #rrggbb | per kind | "#5b6b82" | Colour of a simple block. |
| `layoutAdds[].rows` | number |  | integer 1 to 60 | 1 | 5 | storage: rows before turn. rows x cols must be <= 999 with pallets. |
| `layoutAdds[].cols` | number |  | integer 1 to 60 | 1 | 4 | storage: columns before turn; cell ids retain original row-major order through turns. |
| `layoutAdds[].pallets` | true/false |  | boolean | true | false | storage: one solid low pallet stack per cell (up to 999); false = markings only. |
| `layoutAdds[].a` | [x, y] | m |  | required for wall | [320, 230] | wall: start. |
| `layoutAdds[].b` | [x, y] | m |  | required for wall | [330, 230] | wall: end. |
| `layoutAdds[].label` | text |  | any | none | "PB04" | A name for people (not drawn yet). |
| `layoutAdds[].note` | text |  | any | none | "slide line to x 251.9" | Why / where it differs from the slide (ignored by the engine). |
| `paths[]` | list |  |  | [] |  | Trolley journeys (one tab button each). |
| `paths[].id` | text |  | unique | required | "inj1-wh" | Stable id; director entries use it. |
| `paths[].name` | text |  | keep the leading number `1 ·` | the id | "1 · Item Slip to W/H to Main Line" | Tab button text. |
| `paths[].color` | text |  | #rrggbb | "#7030A0" | "#7030A0" | Path colour. |
| `paths[].trolleys` | number |  | 1 to 12 | 1 | 3 | Trolleys on this path, one headway apart. |
| `paths[].headway` | number | s | 1 to 3600 | 30 | 20 | Seconds between trolley starts. |
| `paths[].steps[]` | list |  | at least one | required |  | The journey, step by step. |
| `paths[].steps[].id` | text |  | unique in the path | required | "s2" | Stable step id. |
| `paths[].steps[].stop` | text |  | a stop id | required | "final-scan" | Where the step ends. |
| `paths[].steps[].title` | text |  | any | "" | "Final Scan" | Card heading and steps-list name. |
| `paths[].steps[].text` | text |  | any | "" | "Pushed by hand to Final Scan." | Card explanation. |
| `paths[].steps[].mode` | text |  | push, agv, manual | "push" | "agv" | How it moves (badge on the card). |
| `paths[].steps[].wait` | number | s | 0 to 600 | 0.7 | 1.8 | Wait at the stop after arriving. |
| `paths[].steps[].speed` | number | m/s | 0.2 to 8 | 4 | 2.5 | Cruise speed while moving. |
| `paths[].steps[].camera` | object |  | { distance, view } | none | { "distance": 90 } | Guided camera for this step. |
| `paths[].steps[].camera.distance` | number | m | > 3 | 90 | 60 | How far the guided camera stays. |
| `paths[].steps[].camera.view` | text |  | 2d, 3d | "3d" | "3d" | Kept from V6 (informational). |
| `paths[].steps[].route` | object |  |  | { "type": "stay" } | { "type": "auto" } | How the trolley reaches the stop. |
| `paths[].steps[].route.type` | text |  | stay, points, auto, elevator | required | "points" | stay = already there; points = exact line; auto = engine routes; elevator = ride up. |
| `paths[].steps[].route.points` | list of [x, y] | m | first = previous end, last = the stop | required (points) | [[43.5, 178.2], [43.5, 152.7]] | The exact line. |
| `paths[].steps[].route.elevator` | text |  | an elevator label (LAYOUT_REFERENCE) | required (elevator) | "Elev 5" | The elevator to ride (lower to upper landing). |
| `director` | map |  | path id -> { keys, caps } | {} |  | Camera keys and captions per path (Studio Director tab, or mf key / mf caption). |
| `director{id}` | object |  | { keys, caps } |  |  | One path's camera keys and captions. |
| `director{id}.keys[]` | list |  |  | [] |  | Camera keys on the story timeline. |
| `director{id}.keys[].id` | text |  | unique | made by the tool | "key-a1b2c3" | Key id. |
| `director{id}.keys[].t` | number | s | 0 to path length (story time, intro included) | required | 28.2 | When the camera is at this key. |
| `director{id}.keys[].ease` | text |  | smooth, linear, in, out, cut | "smooth" | "cut" | How the camera arrives here. |
| `director{id}.keys[].follow` | true/false |  |  | false | true | Ride with the trolley (target = trolley + ox, oy, oz). |
| `director{id}.keys[].x` | number | engine unit | world x (plan x / 0.3 - centre) | required | -12.5 | Camera target x (use mf key or the Studio, not by hand). |
| `director{id}.keys[].y` | number | engine unit |  | required | 0 | Camera target height. |
| `director{id}.keys[].z` | number | engine unit | world z (plan y / 0.3 - centre) | required | 40 | Camera target z. |
| `director{id}.keys[].ox` | number | engine unit |  | 0 | 0 | follow keys: offset from the trolley. |
| `director{id}.keys[].oy` | number | engine unit |  | 2 | 2 | follow keys: offset from the trolley. |
| `director{id}.keys[].oz` | number | engine unit |  | 0 | 0 | follow keys: offset from the trolley. |
| `director{id}.keys[].dist` | number | engine unit | metres / 0.3 | required | 133.3 | Camera distance. |
| `director{id}.keys[].az` | number | rad | -heading in radians | required | -0.785 | Camera azimuth. |
| `director{id}.keys[].pol` | number | rad | 0 = straight down | required | 0.873 | Camera polar angle (90° - tilt). |
| `director{id}.keys[].fov` | number | deg | 8 to 90 (48 mm = 28°) | 28 | 28 | Vertical field of view. |
| `director{id}.caps[]` | list |  |  | [] |  | Captions over the scene. |
| `director{id}.caps[].id` | text |  | unique | made by the tool | "cap-x1y2z3" | Caption id. |
| `director{id}.caps[].t0` | number | s | story time | required | 17.2 | Shown from. |
| `director{id}.caps[].t1` | number | s | > t0 | required | 21.2 | Shown until. |
| `director{id}.caps[].title` | text or {en, ar, ko} |  |  | "" | { "en": "Manual scan", "ar": "مسح يدوي" } | Heading (per language). |
| `director{id}.caps[].text` | text or {en, ar, ko} |  |  | "" | "The operator scans the tag." | Body (per language). |
| `director{id}.caps[].pos` | text |  | lower, upper, center, left, right | "lower" | "lower" | Where on screen. |
| `director{id}.caps[].style` | text |  | glass, cinema, banner, minimal | "glass" | "cinema" | Look. |
| `director{id}.caps[].size` | number | x | 0.7 to 1.8 | 1 | 1.2 | Text size. |
| `takes[]` | list |  |  | [] |  | Saved video recipes (Studio Director tab; mf take renders without saving one). |
| `takes[].id` | text |  | unique | made by the tool | "take-1" | Take id. |
| `takes[].name` | text |  | any | "Take 1" | "Full ride" | File name part. |
| `takes[].flow` | text |  | a path id | required | "inj1-wh" | Path to film. |
| `takes[].t0` | number | s | story time | 0 | 0 | From. |
| `takes[].t1` | number | s | story time | path end | 76.2 | To. |
| `takes[].speed` | number | x | 0.5, 1, 1.5, 2, 3 | 1 | 2 | Playback speed while recording. |
| `takes[].cam` | text |  | director, guided, chase, keep | "director" | "guided" | Camera. |
| `takes[].captions` | true/false |  |  | true | true | Draw captions. |
| `takes[].card` | true/false |  |  | true | true | Draw the step card. |
| `takes[].labels` | true/false |  |  | true | true | Draw stop labels. |
| `takes[].quality` | text |  | high (16 Mbit/s), normal (8 Mbit/s) | "high" | "high" | Bit rate. |
| `takes[].fps` | number |  | 30, 60 | 60 | 60 | Frame rate. |
| `viewpoints[]` | list |  | 6 slots | [] |  | Camera pad shots 1-6 (engine units: x, y, z, dist, az, pol, fov). |
| `studio` | object |  |  | {} |  | Editor settings. |
| `studio.snap` | number | m | 0, 0.1, 0.5, 1, 2 | 0.5 | 0.5 | Snap grid. |
| `studio.ortho` | true/false |  |  | true | true | Paths keep square legs while editing. |
| `studio.lang` | text |  | en, ar, ko | "en" | "ar" | Caption language shown. |
| `studio.shift` | number | h | 1 to 24 | 8 | 8 | Shift length for trips per shift. |
<!-- /GENERATED:fields -->

