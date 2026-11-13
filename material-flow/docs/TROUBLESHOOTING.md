# Troubleshooting

## Validator errors (`mf validate`, the player's Scene file panel)
Each message names the place (`paths[P].steps[S].route`, `devices[D]`, ...). Cause and fix:

| message (start) | cause | fix |
|---|---|---|
| `format: must be "mf-scene"` / `version: must be 1` | not a scene file | start from a scene in `private/v7/scenes` or `docs/examples` |
| `project: is "x" but this layout is "y"` | wrong tab | set `project` to the tab, or validate with the right player |
| `missing id` / `duplicate id` | every entry needs a unique `id` | give a new id |
| `unknown stop` / `unknown floor` / `unknown elevator` / `unknown layout object` | a reference to something that does not exist | use an id from the scene / `LAYOUT_REFERENCE.md` (the message lists the valid floors / elevators) |
| `point (x, y) is outside floor F` | metres outside the floor extent (the message gives the range) | fix the coordinate (the 2F of a tab sits beside the 1F in the frame: x is larger) |
| `x and y must be numbers (metres)` | text or missing | numbers in metres |
| `must be where the previous step ends (x, y)` | a `points` route that does not start at the previous end | set `points[0]` to the given point, or `mf fix-links` |
| `the last point must be the stop` | the route ends elsewhere | last point = the stop's `x y`, or `mf route` |
| `"stay" but the trolley is elsewhere` | a `stay` step after the trolley moved away | use `auto` or `points` |
| `"auto" needs a previous step` | `auto` on the first step | the first step is `stay` |
| `goes from floor A to B without an elevator ride` | a floor change in a normal step | add a step to the lower landing and an `elevator` step |
| `an elevator ride must start at the lower landing` | the step before the ride ends elsewhere | end it at the landing (coordinates in the message) |
| `the stop of an elevator ride must be the upper landing` | ride stop elsewhere | a stop at the upper landing (coordinates in the message) |
| `auto route found no clear trolley path` | the router cannot pass (closed walls, narrow door) | open a `door`, move the obstacle, or draw `points` |
| `the trolley hits X on leg N at (x, y)` / `passes 0.05 m from X; needs at least 0.09 m` | the swept trolley (0.98 x 1.74 m display size) touches a wall / rack / machine / column / pallet / device | move the line away, add a corner, widen a doorway, or move the device |
| warning `passes 0.12 m from X` | under 0.15 m (allowed) | fine for a tight aisle; consider 0.2 m more room |
| `overlaps rack:12` / `overlaps device D` | a device footprint (icon size included) touches something | move it; a smaller `size` also helps |
| `stops: true, but the point is N m off every path` | a scanner stop not exactly on a leg | put `at` on a leg (after `mf route` the leg is exact), or `stops: false` |
| `more than 64 RFID gates` | shader limit | fewer gates per tab |
| `door needs a wall target` / `the door [a, b] is not on wall:N` | door on a non-wall or outside the wall's range (message gives the range) | fix the target or the range |
| `speed: 0.2 to 8 m/s`, `wait: 0 to 600`, `size: 0.5 to 4`, `turn: 0, 90, 180 or 270`, colour, symbol, kind, lane, mode, trolleys 1-12, headway 1-3600 | value out of range | use an allowed value ([SCENE_MANUAL.md](SCENE_MANUAL.md)) |

## Known problems and their fixes
| problem | cause | fix |
|---|---|---|
| `auto` takes a long detour (INJ 2: 304 m instead of 37 m) | the router keeps wider margins than the validator (0.76 m on straights, 1.13 m at corners) so it avoids narrow doorways | draw the owner's line as `points` (validator decides), or widen the doorway (`door` / move a wall stub) |
| a black or dark rectangle on the floor | a shadow baked into the floor light from a layout object that was removed / moved | automatic since V7.1 for layout edits and the V6 room removal; if a new one appears, check `MF7_LIGHT_ERASE` in the build output |
| black bands on a floor that was extended | floor light baked for a smaller floor | automatic for INJ 2 2F (`MF7_LIGHT_BOX`); a new extension needs an entry in `tools/build-v7.mjs` |
| pale cones / stretched streaks on the floor | the planar floor reflection of tall racks | off by default since V7.1 (`?reflect=1` turns it on) |
| the opening is slow on some fresh starts | GPU warm-up on a cold start | the preparing screen waits (V7.7.1); `?prep=0` disables it for tests |
| the scene I edited does not show | the browser has an autosaved copy made from the same baked scene | Scene file panel → Reset to built-in, or a new baked file (a rebuilt player wins over an older browser copy) |
| a patch fails in the build: `expected exactly one match` | the V6 player text changed, or two patches touch the same text (order) | fix the anchor in `engine-patches.mjs`; a patch whose anchor another patch creates must come after it |
| a docs-check failure | docs and code disagree | `node tools/mf.mjs docs-gen` for generated parts; otherwise fix the doc or the example |
| PowerShell `R` / `?` behave strangely | aliases (`R` = Invoke-History) | use Node scripts for multi-step edits |

More cases and their history: [LESSONS.md](LESSONS.md).
