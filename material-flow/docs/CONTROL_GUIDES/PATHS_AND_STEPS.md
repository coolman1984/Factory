# Paths and steps

A **path** is one trolley journey (a tab button). Its **steps** each end at a **stop**. Each step starts where the previous one
ended (after an elevator ride: the upper landing).

## Routes (how a step reaches its stop)
| route | use it for |
|---|---|
| `{ "type": "stay" }` | the first step, or a step whose stop is where the trolley already is |
| `{ "type": "auto" }` | the engine finds a clear, square route around walls, racks, machines, columns and devices (computed at load) |
| `{ "type": "points", "points": [[x, y], ...] }` | an exact line the owner drew: first point = previous end, last point = the stop |
| `{ "type": "elevator", "elevator": "Elev 5" }` | a ride from the elevator's lower landing (the previous step must end there) to its upper landing (this step's stop) |

## A person (Studio, Paths and Steps tabs)
- Select a step (list, PageUp / PageDown). Drag yellow corners; drag the small squares to move a whole leg; double-click a leg to
  add a corner; right-click a corner to remove it. Ends are locked to the stops.
- Straighten (S, Shift+S whole path), L shape (L), Auto-route (R, Shift+R whole path), Draw (B), No path.
- Steps tab: reorder (drag, ▲ ▼), ▶ play from a step, title, explanation, stop, mode, wait, speed, camera distance, delete, add a
  step to a stop, add an elevator ride. Flow: name, colour, trolleys, new, duplicate, move, reverse, delete.
- Moving a stop (Objects tab) re-joins and straightens the legs around it.

## An agent
- Edit `paths[].steps[]` (fields in [../SCENE_MANUAL.md](../SCENE_MANUAL.md)); prefer `"auto"` routes.
- `node tools/mf.mjs route <scene> --path P --step S` writes the router's route as exact points (to edit further).
- `node tools/mf.mjs straighten <scene> --path P [--step S]` removes small jogs (keeps a step that would then collide).
- `node tools/mf.mjs fix-links <scene>` re-routes every step that no longer joins its neighbours.
- Always `node tools/mf.mjs validate <scene>`; then `mf play` and `mf shots` to see it.

## Rules the validator enforces
Joins (start = previous end within 1 cm, end = the stop), no floor change without an elevator ride, the swept trolley keeps 0.09 m
from every wall, rack, machine, column, pallet block and device (warning under 0.15 m), `stay` only where the trolley is.
Examples: [../examples/sample.scene.json](../examples/sample.scene.json), [../examples/move-stop.scene.json](../examples/move-stop.scene.json),
[../examples/elevator.scene.json](../examples/elevator.scene.json).
