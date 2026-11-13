# Numbers

Per path: distance (m), time of one trip (s, intro excluded), trips per shift (= shift ÷ one trip × trolleys, without waiting for
each other). The motion model is the player's: smooth ramp 0.25 s, cruise `speed` (4 m/s), 0.3 s per quarter turn, `wait` after
each step (default 0.7 s), 1.8 s per scanner stop, 6 s per elevator ride.

- Agent: `node tools/mf.mjs numbers <scene> [--shift 8]` (per path and per step); `node tools/mf.mjs diff <before> <after>`
  (what changed, with distance / time deltas: the before / after comparison of two layouts or two scene versions).
- Person: Studio, Numbers tab: the table compares with the scene built into the player file; "Compare with a scene file…"; the
  live closest distance between trolleys (congestion under 3 m).
Example: `node tools/mf.mjs diff docs/examples/sample.scene.json docs/examples/move-stop.scene.json`.

V8.0 uses `MFMotion` for the player, CLI and both sides of the Studio comparison. Numbers include carried heading across
steps and every route-bound scanner hold; totals exclude the seven-second intro. Trips are rounded down from the exact
trip time. Step arrival is the actual end of motion (`tm`), rather than leave minus the default wait; custom waits are
honoured. The displayed time rounds to one decimal place; the calculations keep full precision.
