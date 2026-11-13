# Layout (the built-in factory)

The factory replica (walls, columns, racks, machines, pallet blocks, elevators) comes from the AutoCAD drawing and is built into the
player. A scene never edits it directly: it lists **layout edits** applied on top.

| edit | example | effect |
|---|---|---|
| move | `{ "target": "rack:12", "move": [0, -2] }` | moves the object (metres) |
| turn | `{ "target": "rack:13", "turn": 90 }` | turns it about its centre (0 / 90 / 180 / 270) |
| delete | `{ "target": "wall:40", "delete": true }` | removes it |
| door | `{ "target": "wall:170", "door": [61.65, 65.25] }` | cuts a doorway: `[from, to]` in metres along the wall (y range for a vertical wall, x range for a horizontal one) |

Ids (`wall:N`, `column:N`, `rack:N`, `machine:N`, `pallet:N`) and their rectangles: `node tools/mf.mjs layout-ref` writes
`private/v7/LAYOUT_REFERENCE.md` (company data, stays private). A doorway for the trolley needs about 2.2 m between wall ends
(display trolley 0.98 m + 0.09 m clearance each side + wall thickness); the validator says when it is too narrow.

The floor's baked light (soft shadows) is repainted under removed or moved objects automatically.
Changing layout edits in the player reloads the page (the replica is rebuilt).

## A person (Studio)
Objects tab, "Click selects replica objects too": select a rack / wall / machine / column / pallet; drag to move, ⟲ / ⟳ 90°, Delete,
"Put it back where it was". Doors: not in the Studio yet - use the `door` edit.

## An agent
Edit `layoutEdits[]`, then change the affected steps to `"auto"` (or `mf fix-links`), validate. Examples:
[../examples/door.scene.json](../examples/door.scene.json), [../examples/elevator.scene.json](../examples/elevator.scene.json) (a moved wall stub).
