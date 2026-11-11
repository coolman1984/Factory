# Objects and devices

## Devices (they take part in the process)
| device | what it does | key fields |
|---|---|---|
| `pc` | desk + tower; its screen lights while the trolley is at the stop it `serves` | `kind` (result circle, mapping square, quality hexagon), `x y`, `heading`, `size`, `serves`, `done` |
| `rfid-gate` | ceiling antennas with radar waves; reads the tag while the trolley drives through (no stop) | `x y` = lane centre, `lane` north-south / east-west (posts 2.2 m either side) |
| `scanner` | handheld scanner on a stand; with `stops: true` the trolley stops 1.8 s at `at` and is scanned | `at` (exactly on a path leg), `stand` (beside the lane), `stops`, `stop`, `done` |

Up to 64 RFID gates per tab. Devices must not overlap walls, racks or each other (the validator checks the footprints, icon size included).

## 3D objects (decoration and obstacles)
`objects[]` of type crate, pallet, rack, column, wall, fence, cone, sign (posts and racks block routes); floor-arrow and floor-zone
lie flat (do not block). trolley = a parked trolley model. Size `w d h` in metres, `heading` in degrees, `color`, `text` (sign).

## A person (Studio, Objects tab)
"Add to the scene" buttons, then click the floor (Shift keeps the tool). Click to select (also racks, walls, machines with the
"Click selects replica objects too" box), drag to move, green knob to turn, Q / E, arrows, + / −, Ctrl+D, Delete, F, right-click
menu, inspector fields, search box.

## An agent
Add or edit entries in `devices[]` / `objects[]` / `stops[]`; give every new entry a new `id`. A scanner that stops the trolley:
put `at` on a leg - after `mf route` the leg points are exact, take a point between two corners. Example:
[../examples/devices.scene.json](../examples/devices.scene.json), [../examples/new-path-with-scan.scene.json](../examples/new-path-with-scan.scene.json).
Check: `node tools/mf.mjs validate <scene>` and `node tools/mf.mjs shots <scene> --only stops`.
