# Agent parity: every Studio action and its data / command equivalent

Audit of 2026-11-11 (V7.7.1). "Data" = a field of the scene file ([SCENE_MANUAL.md](SCENE_MANUAL.md)); "Command" = a verb of the
agent CLI `node tools/mf.mjs` ([CLI.md](CLI.md)). An agent never needs the Studio: every row has a data or command way.

## Before this round (the gap list)

These Studio actions had no documented agent way before V7.7.1 (closed now, see the right column):

| gap | closed by |
|---|---|
| Straighten a path, auto-route a step, fix broken links | `mf straighten`, `mf route`, `mf fix-links` |
| Camera keys (stored in engine units, not writable by hand) | `mf key` (plain words: look at the trolley or a stop, distance m, heading °, tilt °, lens mm, at a time or a step) |
| Captions with three languages | `mf caption` (or the `director{id}.caps[]` fields) |
| Record a video take | `mf take` (writes the MP4 / WebM file) |
| See the result (screenshots) | `mf shots` (overview, every stop, every step) |
| Play a path to check it | `mf play` |
| Numbers per path, before / after | `mf numbers`, `mf diff` |
| Build the player with the scenes | `mf bake` |
| Keyboard map, field list, CLI list kept true | generated docs + `mf docs-check` (build and commit hook) |

## Full table

| Studio (on screen) | Agent way |
|---|---|
| **Scene file:** open, save, save as, download, drop a file | Edit `private/v7/scenes/<tab>.scene.json`; `mf bake` puts it in the player. A file can also be dropped on the player by a person. |
| Undo / redo | Edit the JSON again (keep a copy; `mf diff old new` shows what changed). |
| Validate | `mf validate <scene>` |
| Reset to built-in | `node tools/v7/export-scenes.mjs dist/Material_Flow_Player_v6.html private/v7/scenes-v6` gives the V6 originals. |
| **Camera pad:** free / orbit / guided / ride / director | Viewer only; a film uses `takes[].cam` or `mf take --cam director|guided|chase`. |
| Sticks, lens, speed, smooth, Top / Front / Side / Iso / Trolley / Reset | Viewer only; for films use camera keys (`mf key`). |
| Shots 1-6 (save / fly) | `viewpoints[]` (engine units; save them in the Studio). |
| Photo (PNG) | `mf shots` |
| **Objects:** add PC / gate / scanner / stop | `devices[]`, `stops[]` |
| Add crate, pallet, rack, column, wall, fence, cone, arrow, zone, sign, trolley | `objects[]` |
| Move, turn, resize, delete, duplicate | edit `x`, `y`, `heading`, `w`, `d`, `h`, `size`; remove / copy the entry with a new `id` |
| Move / turn / delete racks, walls, machines, columns, pallets | `layoutEdits[]` (`move`, `turn`, `delete`) |
| Snap, ortho | `studio.snap`, `studio.ortho` (editor settings only) |
| **Paths:** drag corners and legs, add / remove corners | edit `route.points` |
| Straighten (S), whole path, all paths | `mf straighten --path id [--step id]` |
| L shape | write `route.points` as `[start, [stop.x, start.y], stop]` |
| Auto-route (R), whole path | `route: { "type": "auto" }` (routed at load) or `mf route` (writes exact points) |
| Draw (B) | write `route.points` |
| No path | `route: { "type": "stay" }` |
| Check / fix links | `mf validate`, `mf fix-links` |
| **Steps:** add, delete, reorder, play from step | edit `paths[].steps[]` order and content; `mf play` |
| Title, explanation, stop, mode, wait, speed, camera distance | `title`, `text`, `stop`, `mode`, `wait`, `speed`, `camera.distance` |
| Elevator ride | a step to the lower-landing stop, then `route: { "type": "elevator", "elevator": "<label>" }` |
| Flow: new, duplicate, move, reverse, delete, name, colour | edit `paths[]` (`reverse` = reverse the steps, first step `stay`, then `mf fix-links`) |
| Trolleys, every (s) | `paths[].trolleys`, `paths[].headway` |
| Step markers on the timeline (retime) | `wait` of the step before |
| **Director:** key here, trolley-locked key | `mf key` |
| Record camera move | Studio only (a person drives the camera). Agents write keys with `mf key`. |
| Key time, ease, follow, set, delete | `director{id}.keys[]` fields |
| Caption here, language, from / to, text, place, style, size | `mf caption` or `director{id}.caps[]` |
| Takes: new, in / out, speed, camera, quality, captions / card / labels, record | `takes[]` + `mf take` |
| **Numbers:** distance, time, trips per shift, compare | `mf numbers`, `mf diff` |
| Several trolleys: live congestion | `paths[].trolleys` / `headway`; the closest distance is shown in the player (Numbers tab) - agents check it with `mf shots` / `mf play`. |
| **Project:** title | `title` |

## Still person-only (by design)

- Driving the camera live (pad, mouse) and "record camera move": a person's hand on the camera. Agents describe shots with `mf key`.
- Dropping a file on the player and the browser's save dialog: browser security; agents write files directly and `mf bake`.
