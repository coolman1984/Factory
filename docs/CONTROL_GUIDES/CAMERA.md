# Camera

## What the owner sees
- **Guided camera** (default): follows the trolley step by step; it never ends a frame with the trolley hidden (V7.7 rescue: it tilts,
  turns or comes closer, and looks down the shaft during elevator rides). Distance per step: `paths[].steps[].camera.distance` (m).
- **Ride** (`chase`): rides behind the trolley. **Free**: the person flies the camera. **Orbit**: free, but the trolley stays in the
  middle. **Director**: plays the camera keys of the path (see [DIRECTOR.md](DIRECTOR.md)).
- 2D / 3D / Auto view buttons on the right rail (keys 2, 3, A).

## A person (Studio)
- Camera pad (rail button with the stick icon, bottom right): mode buttons; sticks Orbit / Move / Zoom / Height; Lens (mm),
  Speed (how fast the sticks move), Smooth (damping); Top, Front, Side, Iso, Trolley, Reset; Shots 1-6 (click: fly there,
  right-click or Shift+click: save); + Key (director key); Photo (PNG); `▁` makes the pad small.
- Mouse: left drag orbit, right drag / Shift pan, wheel zoom toward the cursor, double-click fly to a point.

## An agent
- A film's camera: `takes[].cam` = `director` (keys), `guided` or `chase`; `mf take --cam ...`.
- Shots for a film: camera keys (`mf key`, [DIRECTOR.md](DIRECTOR.md)).
- Saved pad shots: `viewpoints[]` (engine units; normally saved by a person).
- Pictures for checking: `mf shots <scene>` (overview, each stop, each step with the guided camera).

## Units of camera keys
Keys are stored in engine units (`x y z` world, `dist` = metres / 0.3, `az` radians, `pol` radians, `fov` degrees). Do not write them
by hand: `mf key` converts plain words (heading 0 = looking north, clockwise; tilt 90 = straight down; lens in mm).
