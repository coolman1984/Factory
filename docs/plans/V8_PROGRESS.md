# V8 progress

## Step 0 — recovered camera/layout review

Run: 2026-11-11 to 2026-11-12.

Scope: Part A implementation and verification; Part B findings only under the lead correction. No M0 release work.

- Changed: recovered and completed camera, director, pad/key validation and checked frame-export fixes; updated directing,
  CLI, engine, decisions, lessons, changelog and current-workstream documentation.
- Files: `tools/mf.mjs`; `tools/v7/{camera-calm,camera-review-patches,engine-patches,film-export,mf-commands,mf-ops}.mjs`;
  `tools/v7/{scene-core,studio-camera,studio-director,studio-ui}.js`; `tools/v7/{camera-input-test,camera-review-test,film-review-test}.mjs`;
  `docs/{CHANGELOG,CLI,DECISIONS,ENGINE,HISTORY,LESSONS,OPEN_ISSUES,RECIPES,REVIEW_CAMERA_LAYOUT_772,STATUS}.md`;
  `docs/CONTROL_GUIDES/DIRECTOR.md`; this receipt. Business evidence stays in `private/` and `dist/test/step0/`.
- Scene edits: none in this resumed step; all four recovered scenes matched their backups; no earlier delegate scene edits
  were found at recovery. All four live scenes later changed outside this delegate work; those edits were preserved
  and separately captured in private evidence. Camera gates use the captured baseline; live scene validation is separate.
- Tests: final command receipts below; exact commands/logs are in `dist/test/step0/`.
- Deviations: latest images replace the six old location references and Part B is a list only; no exact layout-match claim.
  Bounded director interpolation is the recovered baseline, rather than the plan's older Catmull-Rom description.
  Existing ffmpeg/ffprobe are a temporary CLI dependency; no installation and no M2 browser encoder work.
  The legacy stage1 synchronous import test needs matching geometry; current layout reloads have separate regressions.
- Open items: measured reactive rescue extremes, startup frame pacing, compositor fidelity and lead layout decisions;
  exact results are in the review. Release is explicitly left to M0.

Detailed findings: [camera/layout report](../REVIEW_CAMERA_LAYOUT_772.md).

- PASS: film; `final-gates/film.log`.
- PASS: build-identity; `final-gates/build-identity.log`.
- PASS: identity; `final-gates/identity.log`.
- PASS: validate; `final-gates/validate.log`.
- PASS: validator; `final-gates/validator.log`.
- PASS: director; `final-gates/director.log`.
- PASS: layout-adds; `final-gates/layout-adds.log`.
- PASS: review; `final-gates/review.log`.
- PASS: smoke; `final-gates/smoke.log`.
- PASS: mouse; `final-gates/mouse.log`.
- PASS: ui; `final-gates/ui.log`.
- PASS: gates; `final-gates/gates.log`.
- PASS: build-proof; `final-gates/build-proof.log`.
- PASS: stage1; `final-gates/stage1.log`.
- PASS: Guided 3x, route 1; `final-gates/camera-inj1-0-3.log`.
- PASS: Guided 3x, route 2; `final-gates/camera-inj1-1-3.log`.
- PASS: Guided 3x, route 3; `final-gates/camera-inj2-0-3.log`.
- PASS: Guided 3x, route 4; `final-gates/camera-inj2-1-3.log`.
- PASS: Guided 3x, route 5; `final-gates/camera-eps-0-3.log`.
- PASS: Guided 3x, route 6; `final-gates/camera-eps-1-3.log`.
- PASS: Guided 3x, route 7; `final-gates/camera-eps-2-3.log`.
- PASS: Guided 3x, route 8; `final-gates/camera-eps-3-3.log`.
- PASS: Guided 3x, route 9; `final-gates/camera-press-0-3.log`.
- PASS: Guided 3x, route 10; `final-gates/camera-press-1-3.log`.
- PASS: Guided 1x, route 1; `final-gates/camera-inj1-0-1.log`.
- PASS: Guided 1x, route 2; `final-gates/camera-inj2-1-1.log`.
- PASS: Guided 1x, route 3; `final-gates/camera-eps-2-1.log`.
- PASS: Camera input (actual 1x/3x/8x); `final-gates/camera-input.log`.
- PASS: start; `final-gates/start.log`.
- PASS: Studio take encoding (timing/download unresolved); `final-gates/take.log`.
- PASS: clip-director; `clip-director.log`.
- PASS: clip-guided; `clip-guided.log`.
- PASS: clip-chase; `clip-chase.log`.
- PASS: shots; `shots.log`.
- PASS: calm-actual8; `calm-actual8.log`.
- PASS: clip-lift; `clip-lift.log`.
- PASS: Follow/chase 3x, route 1; `other-cameras-inj1.log`.
- PASS: Follow/chase 3x, route 2; `other-cameras-inj2.log`.
- PASS: Follow/chase 3x, route 3; `other-cameras-eps.log`.
- PASS: calm-after (measurement only); `calm-after.log`.
- PASS: calm-after-1 (measurement only); `calm-after-1.log`.
- PASS: source syntax checks; `source-check.log`.
- PASS: docs-gen and docs-check (rerun after receipt finalization).
- FAIL: broader project documentation checker; existing CAD receipt mismatch, OPEN_ISSUES 16.

- PASS: final normal current-stage V7.7.1 build (95 patches) with docs-check enabled; `current-stage-build-final.log`.
- PASS: historical preservation, all 18 earlier player/archive hashes unchanged; `preservation-final.json`.
- PASS: final source syntax checks; `source-check-final.json`.
- PASS: final smoke/mouse screenshots and film contact sheets inspected for their stated scope.
- FAIL: cinematic no-snap goal, worst sampled 406.2 deg/s; M3 planned camera remains required.
- FAIL: compositor fidelity (literal English RTL punctuation under Arabic selection, CSS gradients/multi-line titles); M2.
- Scope: live scenes changed externally in devices only; all four validate, while camera gates use the preserved recovery snapshot. M0 must integrate/recheck the lead-owned live scenes.

- PASS: invalid take camera fails before temporary bake/browser launch; `invalid-take-camera.log`.
- FAIL: Studio real-time exact timing/download acceptance; both sampled recordings differ from the expected length, and no completed disk MP4 was verified. Private recording receipt; M2.
