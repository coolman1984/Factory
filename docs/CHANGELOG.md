# Changelog (player)

Every version is a separate file `dist/Material_Flow_Player_v<version>.html` (older ones kept). Newest first.
A change is not done until this file, the docs and [LESSONS.md](LESSONS.md) are updated in the same commit (`mf docs-check`).

## V7.7.1 - 2026-11-11
- Added: preparing screen - the opening is dry-run behind a cover (3x), the camera's sight model and per-segment viewing angles are computed up front; it releases at t = 0 when the last 20 frames were fast (skip the rise after 6 s). Path changes compute the angles at once. Fresh starts: 1 of 20 with one slow frame (was 2 of 4). `MF.prepared`.
- Fixed: drive C: filled by 207 leftover test browser profiles (4.7 GB); the test driver now removes stale ones.
- Added: agent CLI `tools/mf.mjs` (validate, bake, shots, play, take, numbers, diff, straighten, route, fix-links, key, caption,
  layout-ref, docs-gen, docs-check); docs system (START_HERE, CLI, CONTROL_GUIDES, RECIPES with tested examples, ENGINE,
  TROUBLESHOOTING, DECISIONS, OPEN_ISSUES, PARITY); docs generated from code; docs-check in the build and the commit hook.
- Fixed: Phase A review findings (see [REVIEW_REPORT.md](REVIEW_REPORT.md)).
- Open: [OPEN_ISSUES.md](OPEN_ISSUES.md).

## V7.7 - 2026-11-11
- Fixed: the guided camera never ends a frame with the trolley hidden (9 of 10 paths 0.0%, Press path 2 one sample).
- Added: full-size GPU warm-up; video take test (MP4 H.264).

## V7.6 - 2026-11-11
- Added: Studio - camera pad, scene editor (objects, devices, replica objects), paths and steps editor, straighten, director
  (keys, captions EN / AR / KO, takes, MP4 / WebM), Numbers, several trolleys, right-click menu, search, photo, keyboard map (F1).
- Added: `door` layout edit; INJ 2 Main Line at the corner; EPS path 3 straight west through two doors.
- Fixed: visual bugs (start message, pad buttons, timeline markers, false before / after deltas, clutter in Director / Numbers).

## V7.1 - 2026-11-11
- Added: scene files (`mf-scene` v1) drive the player; validator; agent manual; scene file panel (open / save / drop / undo /
  autosave); per-step speed; 64 RFID gates.
- Fixed: dark boxes (baked shadows of removed rooms) and pale cones (floor reflection) beside Kitting; INJ 2 2F black bands;
  INJ 2 short route through the doorway (304 → 37 m, Umbrella 337 → 68 m).

## V6 - 2026-11-10
- Added: the owner's 10 paths on all four tabs, big PC / scanner icons, manual scan stops. Fixed: flicker sources, camera.

## V5 - 2026-11-10
- Added: INJ 1 true path, PCs, RFID gates with radar waves, handheld scanners; roof removed.

## V4 and earlier
Built on another PC; see [HISTORY.md](HISTORY.md).
