# Step 0 — camera, director and recording review

This is the recovered task-2 review, not the V7.7.2 release. The complete V8 master plan was read before continuing.
Only Step 0 is authorized here. The lead owns all scene-data work; replacement owner references supersede the earlier
six location images. Detailed business findings and per-path metrics stay in private/test evidence.

## Camera and director findings

- Guided filtering, hysteresis and feed-forward now use story time. Look-ahead is a fixed story interval rather than a
  playback-speed-dependent prediction. A clear shot is held across short steps; ordinary turns retain their limit.
- The intro blends toward the first trolley shot. Elevator rides ease toward a high shaft view with an upper-floor
  cutaway. The recovered code revealed the slab at 95% of the ride; this resumed review keeps it hidden through the
  landing approach. This delays early slab exposure, but the full trace still shows a landing-area rescue spike.
- A device-free scene exposed an unchecked missing device-group object in the chase envelope. The builder now treats it
  as an empty group; the synthetic director film exercises that branch.
- Chase is wider, turns more slowly and participates in the final actual-eye sight check. Seek/mode changes reset stale
  heading history. Follow uses the same visibility protection. Free-camera fly moves start from the rendered pose;
  trolley lock carries the camera target by actual trolley displacement before smoothing user offsets.
- Director target interpolation is bounded by its two evaluated endpoints, distance uses log space and heading uses the
  shortest arc. Smooth uses smootherstep; other easing choices and explicit cuts remain available. Both follow endpoints
  use the same story timestamp. Pure director evaluation is applied directly without a second damping spring.
- CLI keys reject invalid finite values and unsupported fixed upper-floor stop targets; a zero-degree tilt is preserved. Invalid take cameras fail before creating a browser.
  Studio follow toggles retain the key's world pose. Pad blur, close, visibility loss and lost capture release velocities
  and pointer state so a held drag cannot restart a released camera.

## Recording findings

The old real-time CLI path could lose moving opening seconds and report the requested length as though it were measured.
The CLI now warms the renderer/compositor before capture, stops RAF from advancing the story, renders one explicit
story timestamp per frame and uses already installed ffmpeg/ffprobe for constant-rate H.264 MP4. It checks story drift,
decoded frame count/duration, repeated moving images and decoded moving freezes, and retains a JSON success/failure receipt.
State restoration runs after success or failure. Export requests must be sequential; malformed fps/camera inputs fail.
Nothing was installed. Invalid fps values fail before touching browser state; offline speed remains the requested
value instead of snapping to a player preset, so fractional-speed exact-duration recipes work.

Studio's browser recorder remains real time. Its warm-up now precedes both MediaRecorder start and story playback.
A successful Studio recording establishes usable encoding; it does not establish exact duration.
The initial real-time test produced a playable Blob with a measured length that differed from the story range divided
by speed; it did not establish a downloaded disk file. See the [private recording receipt](../private/v7/layout-audit/STEP0_REALTIME_RECORDING.md).
The compositor sets caption direction explicitly, but gradients/multi-line titles and native Arabic acceptance remain
open. The portable browser encoder belongs to M2. See the [director guide](CONTROL_GUIDES/DIRECTOR.md) and
[film recipe](RECIPES.md) for exact duration and simultaneous two-language captions.

## Part B — findings only

- Replacement-map review and unresolved area/device/route questions: [private findings](../private/v7/layout-audit/STEP0_FINDINGS.md).
- No scene file was edited in this resumed review. All four recovered scene files matched the pre-Codex backups byte for
  byte; the comparison lists no changed top-level fields. Earlier task-2 scene changes found at recovery: none.
  All four live scenes subsequently changed outside this delegate work; preserve them. The later private comparison records those deltas. Receipt:
  `private/v7/layout-audit/STEP0-scene-backup-comparison.json`.
- Exact layout matching is not claimed. Historical plan/3D comparisons were inspected; the replacement maps need fresh
  registration and lead-authored scene changes before a new match can be accepted.

## Blender/Godot and next work

Neither application was run: this step fixes runtime camera/recording behavior and supplies layout findings without
geometry edits. The later lighting milestone can use Blender to rebake shadows after scene placement is accepted;
Godot is an optional preview, not a reason to change the canonical scene data. Keep the reactive camera's clear-view
fallback until M3's planned camera passes visibility tests; compare worst-turn events as well as average/percentile motion.

## Measured result

The metric is azimuth degrees per story second, excluding intro and near-vertical views (where azimuth is ill-conditioned).
It does not bound polar or full quaternion motion. Before/after use the same metric and unchanged scene snapshot.
The mean is the unweighted mean of ten per-path 95th percentiles, not a pooled frame percentile.

| Metric at 3x | Before | After |
|---|---|---|
| Mean per-path P95 (deg/s) | 26.24 | 11.20 |
| Worst sampled azimuth rate (deg/s) | 1348.4 | 406.2 |
| Turn episodes | 79 | 39 |

[Private metrics](../private/v7/layout-audit/STEP0_CAMERA_METRICS.md) contain per-path comparisons and 1x/8x measurements;
`dist/test/step0/trace-final/` contains eye, target, quaternion and rescue counters. The cutaway change delays early slab exposure, but the full trace still has a landing-area spike.
Remaining extremes mean the cinematic no-snap goal is FAIL. M3 must use this recovered baseline.
Visibility passing does not establish a smooth shot or clearance of the camera's entire near plane.

## Verification

GPU checks ran sequentially in installed headless Google Chrome with isolated profiles. Exact commands and exit codes are
in `dist/test/step0/final-gates/results.json` and `extra-results.json`; earlier diagnostics are in `results.json`. No acceptance thresholds changed.

| Check | Result | Evidence under dist/test/step0 |
|---|---|---|
| film | PASS | `final-gates/film.log` |
| build-identity | PASS | `final-gates/build-identity.log` |
| identity | PASS | `final-gates/identity.log` |
| validate | PASS | `final-gates/validate.log` |
| validator | PASS | `final-gates/validator.log` |
| director | PASS | `final-gates/director.log` |
| layout-adds | PASS | `final-gates/layout-adds.log` |
| review | PASS | `final-gates/review.log` |
| smoke | PASS | `final-gates/smoke.log` |
| mouse | PASS | `final-gates/mouse.log` |
| ui | PASS | `final-gates/ui.log` |
| gates | PASS | `final-gates/gates.log` |
| build-proof | PASS | `final-gates/build-proof.log` |
| stage1 | PASS | `final-gates/stage1.log` |
| Guided 3x, route 1 | PASS | `final-gates/camera-inj1-0-3.log` |
| Guided 3x, route 2 | PASS | `final-gates/camera-inj1-1-3.log` |
| Guided 3x, route 3 | PASS | `final-gates/camera-inj2-0-3.log` |
| Guided 3x, route 4 | PASS | `final-gates/camera-inj2-1-3.log` |
| Guided 3x, route 5 | PASS | `final-gates/camera-eps-0-3.log` |
| Guided 3x, route 6 | PASS | `final-gates/camera-eps-1-3.log` |
| Guided 3x, route 7 | PASS | `final-gates/camera-eps-2-3.log` |
| Guided 3x, route 8 | PASS | `final-gates/camera-eps-3-3.log` |
| Guided 3x, route 9 | PASS | `final-gates/camera-press-0-3.log` |
| Guided 3x, route 10 | PASS | `final-gates/camera-press-1-3.log` |
| Guided 1x, route 1 | PASS | `final-gates/camera-inj1-0-1.log` |
| Guided 1x, route 2 | PASS | `final-gates/camera-inj2-1-1.log` |
| Guided 1x, route 3 | PASS | `final-gates/camera-eps-2-1.log` |
| Camera input (actual 1x/3x/8x) | PASS | `final-gates/camera-input.log` |
| start | PASS | `final-gates/start.log` |
| Studio take encoding (timing/download unresolved) | PASS | `final-gates/take.log` |
| clip-director | PASS | `clip-director.log` |
| clip-guided | PASS | `clip-guided.log` |
| clip-chase | PASS | `clip-chase.log` |
| shots | PASS | `shots.log` |
| calm-actual8 | PASS | `calm-actual8.log` |
| clip-lift | PASS | `clip-lift.log` |
| Follow/chase 3x, route 1 | PASS | `other-cameras-inj1.log` |
| Follow/chase 3x, route 2 | PASS | `other-cameras-inj2.log` |
| Follow/chase 3x, route 3 | PASS | `other-cameras-eps.log` |
| calm-after | PASS (measurement only) | `calm-after.log` |
| calm-after-1 | PASS (measurement only) | `calm-after-1.log` |

The initial stage1 run on the current layout fails: its legacy synchronous import changes geometry and reloads the player.
The matched pre-addition fixture rerun is reported separately. Current-build layout-adds/review rows cover reload/undo and
refusals. This fixture correction changes no runtime behavior. The saved initial failure remains evidence. The first synthetic film failed during camera preparation
because a device-free scene has no device-group object; the final empty-group guard and film rerun cover that case. The first nominal 8x measurement silently snapped to 3x;
its raw output is preserved as `calm-requested8-actual3.json`. The corrected probe sets and asserts actual
story speed. The actual-8x rerun is a stress state beyond the V7 menu presets and is reported separately.

Source syntax checks and player docs generation/checking pass. The normal current-stage build and preservation checks
are recorded in the step receipt. The broader read-only project checker still fails with its existing unrelated CAD error,
`Native Excel receipt belongs to a different workbook` (OPEN_ISSUES 16).

The explicit-frame regression decodes a 20.0 s / 600-frame film, checks non-preset 1.25x timing, injects a moving freeze
that must fail, rejects invalid fps/skipped indices and restores player state. Owner-scene clips exercise director,
guided and chase with simultaneous English/Arabic captions; visual review and exact-length receipts are separate claims.
Studio's complete real-time take is tested separately and remains subject to wall-clock GPU pacing.
Contact sheets and the bilingual frame were inspected; readable text is present, with literal-English RTL punctuation
still visibly wrong under Arabic selection. See the private visual receipt; compositor fidelity remains open for M2.

No release/root player or scene data was written. M0 release remains pending. See [the step receipt](plans/V8_PROGRESS.md)
for changed files and one-line gates.

Final startup result: **0 of 8 starts with visible stutter**. Final normal current-stage build: PASS (95 patches, test output only).
Historical preservation: PASS (18 hashes unchanged). Source syntax: PASS. Player docs-gen/docs-check: PASS.
Final smoke/mouse screenshots and film contact sheets were inspected; see the private visual receipt for fidelity limits.
Camera gates use the captured recovery scene snapshot. The later lead-owned device changes are preserved and validate
with zero errors/warnings; full current-scene camera integration belongs to M0.

Studio exact-timing/download acceptance: **FAIL** in both recorded runs; the legacy take gate establishes playable
Blob encoding. Details stay in the private recording receipt. Invalid take-camera preflight: **PASS**
(`dist/test/step0/invalid-take-camera.log`).
