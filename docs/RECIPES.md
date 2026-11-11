# Recipes: one per owner request type

Every recipe: the exact edit (scene data), the command to check it, and the expected output. The examples are small sample scenes in
[examples/](examples/) (made by `node tools/v7/make-examples.mjs`; `mf docs-check` validates them). For the owner's real scenes edit
`private/v7/scenes/<tab>.scene.json` the same way, then `node tools/mf.mjs bake`.

Always: **read → edit data → `mf validate` → `mf play` / `mf shots` (look at the pictures) → report** (what changed, numbers before
and after, anything you could not do). Never edit engine code for these requests ([ENGINE.md](ENGINE.md): data first, engine last).

## 1. A new path (with a manual scan in the middle)
Edit: append to `paths` a new `id`, a `name` with the next number, a first step `"route": {"type": "stay"}` at the start stop, then
one step per stop with `"route": {"type": "auto"}`. For the scan: `mf route` the leg, then add a scanner with `"stops": true`, `at`
on that leg (between two corners) and `stand` 1.2 m beside it; if the validator says the stand overlaps something, put it on the other side.
Example: [examples/new-path-with-scan.scene.json](examples/new-path-with-scan.scene.json) (path `sample-2`, scanner `scanner-mid`).
```
node tools/mf.mjs validate docs/examples/new-path-with-scan.scene.json
docs/examples/new-path-with-scan.scene.json: OK 0 error(s), 0 warning(s)
```

## 2. Move a stop and straighten
Edit: change the stop's `x` / `y` (metres; "3 m east" = x + 3). Then the step ending there and the step leaving it must be re-joined:
`mf route` both (or `mf fix-links`), then `mf straighten`.
```
node tools/mf.mjs route <scene> --path sample-1 --step s3
node tools/mf.mjs route <scene> --path sample-1 --step s4
node tools/mf.mjs straighten <scene> --path sample-1
node tools/mf.mjs diff docs/examples/sample.scene.json docs/examples/move-stop.scene.json
~ stop stop-c changed: moved 3.00 m
~ path sample-1 changed
# sample-1: 85.9 m -> 85.1 m, 37.9 s -> 32.9 s
```

## 3. Open a door in a wall
Find the wall id in `private/v7/LAYOUT_REFERENCE.md` (`node tools/mf.mjs layout-ref`): the wall the owner's line crosses. Edit:
`"layoutEdits": [{ "target": "wall:165", "door": [61.65, 65.25] }]` (`[from, to]` along the wall, about 3.6 m wide), then a `points`
route through it (or `auto`; see [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if auto still detours). Example: [examples/door.scene.json](examples/door.scene.json).
```
node tools/mf.mjs numbers docs/examples/door.scene.json
west: 83.7 m, 24.2 s per trip, 1188 trips per 8 h shift
```

## 4. Add a PC, an RFID gate and a scanner
Edit `devices[]`: a `pc` with `kind`, `x y` beside the stop, `heading` toward the aisle, `serves` = the stop id; an `rfid-gate` with
`x y` on a straight leg and `lane` along it; a `scanner` as in recipe 1. Example: [examples/devices.scene.json](examples/devices.scene.json).
```
node tools/mf.mjs validate docs/examples/devices.scene.json
docs/examples/devices.scene.json: OK 0 error(s), 0 warning(s)
```
A device that touches a wall or rack fails with `devices[<id>]: overlaps rack:12` - move it 0.5 m away from the named object.

## 5. An elevator ride
The previous step must end at the elevator's lower landing and the ride's stop must be the upper landing (coordinates: layout
reference, "Elevators"). Stops at both landings, then:
`{ "id": "s3", "stop": "elev-5-2f", "title": "Elev 5 up", "route": { "type": "elevator", "elevator": "Elev 5" } }`.
Example: [examples/elevator.scene.json](examples/elevator.scene.json).
```
node tools/mf.mjs numbers docs/examples/elevator.scene.json
up: 60.3 m, 28.6 s per trip, 1005 trips per 8 h shift
  s1 Start: 0.0 m, 0.7 s
  s2 To Elev 5: 37.2 m, 12.4 s
```

## 6. Several trolleys and congestion
Edit the path: `"trolleys": 3, "headway": 12`. Example: [examples/trolleys.scene.json](examples/trolleys.scene.json).
```
node tools/mf.mjs numbers docs/examples/trolleys.scene.json
sample-1: 85.9 m, 37.9 s per trip, 2277 trips per 8 h shift (3 trolleys)
```
To see congestion: `mf shots` / the player's Numbers tab while playing (closest distance under 3 m = congestion). A shorter
`headway` than the slowest step's time makes trolleys catch up.

## 7. A camera shot
```
node tools/mf.mjs key <scene> --path sample-1 --at 8 --look trolley --distance 50 --heading 30 --tilt 40
node tools/mf.mjs key <scene> --path sample-1 --step s3:start --look stop:stop-c --distance 35 --heading 120 --tilt 30
```
Expected: `camera key at 8 s on sample-1 (rides with the trolley)` and `wrote <scene>`. The film uses them with `--cam director`.

## 8. A caption in three languages
```
node tools/mf.mjs caption <scene> --path sample-1 --step s3 --seconds 4 --title "Buffer" --ar-title "منطقة الانتظار" --ko-title "버퍼" --text "The trolley waits here." --ar-text "تنتظر العربة هنا."
```
Expected: `caption cap-xxxxxx on sample-1: 18.4-22.4 s`. Show Arabic: `"studio": { "lang": "ar" }`. Example with both keys, the
caption and a take: [examples/director.scene.json](examples/director.scene.json).

## 9. A video take (a short film)
```
node tools/mf.mjs take docs/examples/director.scene.json --path sample-1 --from 0 --to 20 --speed 1 --cam director --out dist/test/film.mp4
```
Expected: `dist/test/film.mp4: video/mp4;codecs=avc1..., N MB, about 20.0 s, camera director`. For a 20 s film of a longer path,
use `--speed 2` or `--from` / `--to`.

## 10. Compare two layouts (before / after)
```
node tools/mf.mjs diff <before.scene.json> <after.scene.json>
node tools/mf.mjs numbers <after.scene.json>
```
Report the `#` lines (distance and time per path) and the trips per shift.

## 11. Change what a step says or how long it waits
Edit the step's `title`, `text`, `wait` (s) or `speed` (m/s). Check with `mf validate`; see the card with `mf shots --only steps`.

## 12. Move, turn or delete a rack (or wall, machine, column, pallet block)
`"layoutEdits": [{ "target": "rack:12", "move": [0, -2] }]` / `"turn": 90` / `"delete": true`; then `mf fix-links` and
`mf validate` (paths near it may now pass, or be blocked).
