# V8 progress

## Step 0 â€” recovered camera/layout review

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

## M0 â€” release and guard what exists (V7.7.2)

- Changed: protected resolved release/archive/backup paths, retained five own-stage backups, exclusive temporary files and
  atomic publication; camera acceptance uses the shared Chrome driver; selectable sequential gate and housekeeping.
- Released: `dist/Material_Flow_Player_v7.7.2.html` and its byte-identical new `dist/versions/` copy. CLI `STAGE` is 7.7.2.
  Both contain the lead's current scenes exactly. No scene edits, reviewed player-code edits, installs, git or delegation.
- Files:
  - `.gitignore`
  - `src/README.md`
  - `tools/build-v7.mjs`
  - `tools/test-camera-v5.mjs`
  - `tools/v7/cdp.mjs`
  - `tools/v7/identity-test.mjs`
  - `tools/v7/mf-commands.mjs`
  - `tools/v8/build-output.mjs`
  - `tools/v8/build-guard-test.mjs`
  - `tools/v8/gate.mjs`
  - `docs/ENGINE.md`
  - `docs/START_HERE.md`
  - `docs/CHANGELOG.md`
  - `docs/LESSONS.md`
  - `docs/DECISIONS.md`
  - `docs/STATUS.md`
  - `docs/OPEN_ISSUES.md`
  - `docs/REVIEW_REPORT_772.md`
  - `docs/HISTORY.md`
  - `docs/plans/V8_PROGRESS.md`
- Tests: one line per result below; exact commands, exits, durations and output are in `dist/test/rc-772-results.json`,
  `dist/test/m0/release-gate/results.json`, `candidate-extra-results.json` and `release-extra-results.json`.
- Deviations: guard fixtures derive only the needed lighting fields from V6 because the builder otherwise needs the private
  V4 snapshot; the legacy synchronous stage1 check uses matching geometry while actual-player reloads use layout/review
  regressions. Whole-path camera calls override the shared two-minute timeout to ten minutes. Section 1.6 adds ten 1x
  paths and a checked film. Five launch checks use the current RC instead of the historical cam2 filename.
  Output protection is shared in `build-output.mjs` so every alias/retention/failure assertion remains without repeated
  compilation/process overhead; the three integrated positive build cases and real earlier-release refusal remain.
  Identity retains eight snapshots and byte-identical probe/comparisons using separate fresh profiles per input and a
  fresh document per project; this removes six browser startups to meet the quick-gate budget.
- Open items: reactive camera snap quality (M3), Studio real-time timing/download and compositor fidelity (M2), cold-start
  root cause (M9), lead-owned layout/flow-logic pending items and business acceptance. M1 was not started.

### Candidate gate

- PASS: docs; `rc-gate/docs.log`.
- PASS: validate; `rc-gate/validate.log`.
- PASS: validator; `rc-gate/validator.log`.
- PASS: identity; `rc-gate/identity.log`.
- PASS: layout-adds; `rc-gate/layout-adds.log`.
- PASS: review; `rc-gate/review.log`.
- PASS: smoke; `rc-gate/smoke.log`.
- PASS: mouse; `rc-gate/mouse.log`.
- PASS: ui; `rc-gate/ui.log`.
- PASS: gates; `rc-gate/gates.log`.
- PASS: stage1; `rc-gate/stage1.log`.
- PASS: camera-inj1-0; `rc-gate/camera-inj1-0.log`.
- PASS: camera-inj1-1; `rc-gate/camera-inj1-1.log`.
- PASS: camera-inj2-0; `rc-gate/camera-inj2-0.log`.
- PASS: camera-inj2-1; `rc-gate/camera-inj2-1.log`.
- PASS: camera-eps-0; `rc-gate/camera-eps-0.log`.
- PASS: camera-eps-1; `rc-gate/camera-eps-1.log`.
- PASS: camera-eps-2; `rc-gate/camera-eps-2.log`.
- PASS: camera-eps-3; `rc-gate/camera-eps-3.log`.
- PASS: camera-press-0; `rc-gate/camera-press-0.log`.
- PASS: camera-press-1; `rc-gate/camera-press-1.log`.
- PASS: start; `rc-gate/start.log`.
- PASS: take; `rc-gate/take.log`.
- PASS: guard; `rc-gate/guard.log`.

### Release gate

- PASS: docs; `release-gate/docs.log`.
- PASS: validate; `release-gate/validate.log`.
- PASS: validator; `release-gate/validator.log`.
- PASS: identity; `release-gate/identity.log`.
- PASS: layout-adds; `release-gate/layout-adds.log`.
- PASS: review; `release-gate/review.log`.
- PASS: smoke; `release-gate/smoke.log`.
- PASS: mouse; `release-gate/mouse.log`.
- PASS: ui; `release-gate/ui.log`.
- PASS: gates; `release-gate/gates.log`.
- PASS: stage1; `release-gate/stage1.log`.
- PASS: camera-inj1-0; `release-gate/camera-inj1-0.log`.
- PASS: camera-inj1-1; `release-gate/camera-inj1-1.log`.
- PASS: camera-inj2-0; `release-gate/camera-inj2-0.log`.
- PASS: camera-inj2-1; `release-gate/camera-inj2-1.log`.
- PASS: camera-eps-0; `release-gate/camera-eps-0.log`.
- PASS: camera-eps-1; `release-gate/camera-eps-1.log`.
- PASS: camera-eps-2; `release-gate/camera-eps-2.log`.
- PASS: camera-eps-3; `release-gate/camera-eps-3.log`.
- PASS: camera-press-0; `release-gate/camera-press-0.log`.
- PASS: camera-press-1; `release-gate/camera-press-1.log`.
- FAIL (accepted issue 2 / M9): start; `release-gate/start.log`.
- PASS: take; `release-gate/take.log`.
- PASS: guard; `release-gate/guard.log`.

### Supplemental verification

- PASS: transport-1; `transport-1.log`.
- PASS: transport-2; `transport-2.log`.
- PASS: transport-3; `transport-3.log`.
- PASS: transport-4; `transport-4.log`.
- PASS: transport-5; `transport-5.log`.
- PASS: camera-inj1-0-1; `camera-inj1-0-1.log`.
- PASS: camera-inj1-1-1; `camera-inj1-1-1.log`.
- PASS: camera-inj2-0-1; `camera-inj2-0-1.log`.
- PASS: camera-inj2-1-1; `camera-inj2-1-1.log`.
- PASS: camera-eps-0-1; `camera-eps-0-1.log`.
- PASS: camera-eps-1-1; `camera-eps-1-1.log`.
- PASS: camera-eps-2-1; `camera-eps-2-1.log`.
- PASS: camera-eps-3-1; `camera-eps-3-1.log`.
- PASS: camera-press-0-1; `camera-press-0-1.log`.
- PASS: camera-press-1-1; `camera-press-1-1.log`.
- PASS: checked-film; `checked-film.log`.
- PASS: calm-current; `calm-current.log`.
- PASS: final-guard; `final-guard.log`.
- PASS: helper-rebuild; `helper-rebuild.log`.
- PASS: publish; `publish.log`.
- PASS: docs-gen-release; `docs-gen-release.log`.
- PASS: docs-check-release; `docs-check-release.log`.
- PASS: current-cli-film; `current-cli-film.log`.
- PASS: final quick release gate command, six rows in 141.936 s end to end (139.442 s internal); `release-quick-optimized/results.json`.
- FAIL (initial budget attempt): quick command 181.483 s although its internal rows took 178.986 s; retained in `quick-budget.json`. A second attempt also missed the budget at 187.612 s. Both failures remain in `quick-budget.json`. The final run retains every row/assertion and three complete positive builds in one child; identity uses separate profiles per input and fresh documents per project.
- PASS: candidate/release/archive byte equality; SHA-256 `bfbaf85330cd434d589514244ea778a42ebd5cbe3002a4a1e6db08a6a03babe0`.
- PASS: historical files, lead-owned scenes and reviewed engine modules unchanged; `preservation-final.json`.
- PASS: camera acceptance page probe byte-identical; `camera-probe-preserved.json`.
- PASS: identity probe and all comparisons byte-identical, eight snapshots retained; `identity-probe-preserved.json`.
- PASS: gate rejects unknown rows, unsafe outputs and empty selections; `gate-input-tests.json`.
- Measurement: current 3x mean per-path P95 10.97 deg/story s, maximum 405.6, 39 turn episodes; no-snap quality remains open.
- PASS: final current-stage build, 95 patches and 12 parsed scripts; test output matches release/archive/candidate exactly; `final-verification.json`.
- PASS: final docs-gen and docs-check; `final-docs-gen.log`, `final-docs-check.log`.
- PASS: final source syntax checks and housekeeping; `final-verification.json`.
- FAIL: broader project checker, existing CAD receipt mismatch only (issue 16); `final-project-docs.log`.
- Completion protocol: create the empty `private/v7/m0-done.flag` only after all final checks and receipt updates; then stop.
