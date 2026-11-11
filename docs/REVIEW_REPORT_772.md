# V7.7.2 layout-round review

Direct owner-authorized delegate review, 2026-11-11. No git, bridge, other agents, remote access or company-scene edits.
Built players, screenshots, logs and company-derived measurements remain in `dist/test/`. Earlier players and archives are
read-only. The slide defines existence/location/routes; CAD defines dimensions. This review does not establish business
acceptance or reconcile every slide object to a measured CAD item.

## Found

Line references identify the reviewed source after fixes.

| Severity | Location | What |
|---|---|---|
| High | `tools/v7/scene-ui.js:20` | Import compared only `layoutEdits`; changed `layoutAdds` could update the saved document without rebuilding its solids or visible geometry. |
| High | `tools/v7/studio-edit.js:397`, `tools/v7/studio-core.js:134` | Layout Add reloaded even when persistence failed, discarded undo history on success, and left an old redo branch alive. Undoing a changed addition list in memory could leave the replica unchanged. |
| High | `tools/v7/studio-edit.js:138` | Replica deletion wrote a non-affine all-zero instance matrix. Bounds became non-finite during camera rebuild and the edit rolled back. Keep the homogeneous component at one when scaling an instance to zero. Live transforms also retained cached instance bounds, so raycasting could miss moved geometry. |
| High | `tools/v7/studio-core.js:52` | Changing a replica object flattened existing ordered edits, including wall transforms and doors. Preserving unrelated targets alone still lost earlier transforms when editing the ordered target itself. Added-wall folding could also change a base before a later door operation. |
| Medium | `tools/v7/studio-edit.js:118` | Generated door fragments were selectable even though their suffixed IDs cannot be represented by `layoutEdits.target`; a move/delete could be lost on save/reload. |
| High | `tools/v7/scene-core.js:171`, `tools/v7/scene-core.js:201` | Prototype names were accepted as kinds; turns were coerced from strings; fractional grid counts and nonboolean pallet flags passed; large storage fields silently stopped after 999 pallets. Malformed added-wall endpoints were not checked during browser preload. |
| Medium | `tools/v7/scene-core.js:188` | Storage turns swapped the outer rectangle without rotating its grid/cells; per-cell identity did not follow the rotation. |
| Medium | `tools/v7/engine-patches.mjs:164` | Calm-camera framing and short-leg caches survived a route rebuild with the same step indexes, using old route geometry. |
| High | `tools/v7/engine-patches.mjs:43` | The first full run caught three camera paths with a hidden sample: exact rescue omitted device meshes, accepted unchecked candidates after its budget expired, and ran before a ceiling constraint that could invalidate its result. |
| Medium | `tools/mf.mjs:23`, `tools/mf.mjs:94` | Step-local writes could overlook errors at path scope; congestion dereferenced a missing closest pair when no two trolleys appeared together. |
| Medium | `tools/v7/mf-ops.mjs:132`, `tools/v7/scene-schema.mjs` | Scene diff ignored added-layout changes; the schema walker expanded wall endpoint arrays into undocumented child fields. |
| Low | `tools/mf.mjs:69`, `tools/v7/compare-shots.mjs`, `tools/v7/aisle-scan.mjs` | Moment shots silently chose path zero for an unknown path; screenshot arguments were unchecked; upper-floor top views targeted ground height; aisle scan lacked player selection and input validation. |

## Fixed

- Layout imports compare both sections and reload only after saving. Studio carries bounded undo/redo as normalized scenes
  through the reload in the same tab, guarded by baked-scene hash and exact saved-scene identity. Add clears redo. A failed
  browser save leaves the scene exportable in memory and does not reload.
- Preserve existing edit sequences and append the same delta that Studio applies to the loaded geometry; this also keeps
  earlier transforms when editing that target again. Keep transforms of a door-bearing added wall in the ordered edit list;
  fold simple block/rack moves/quarter turns into its addition. Delete retains the list slot. Refuse independent selection
  of generated door pieces instead of emitting invalid targets.
- Validate own kind names, finite numeric quarter turns, exact/different wall endpoint pairs, integral grid counts,
  boolean pallet flags and the 999-cell solid-storage limit. Browser restore checks additions before conversion.
  Rotate storage grid/pallet geometry while retaining original row-major cell IDs.
- Keep deleted instance transforms affine; invalidate cached aggregate bounds on live transforms, deletion and undo.
  Regressions check finite bounds, actual solid removal/restoration and raycasting beyond the old bounds.
  Clear route-dependent calm-camera caches. Exact rescue now includes opaque
  device instances, uses the rendered trolley's position, and runs after ceiling constraints and device animation. Every
  accepted candidate, including the last vertical fallback, gets an exact check. Exhausted searches increment
  `MF.sight.stats.unresolved` instead of accepting an unchecked view. Corrected views reproject device labels without advancing animation. Preserve
  the motion model; camera acceptance is tested separately from motion identity.
- Fix scoped CLI writes, empty congestion pairs, moment-shot arguments/path selection, layout diffs, wall schema paths,
  upper-floor framing and aisle-scan validation/player selection. Document the plan-distance limits of congestion.
- Add the two required validator faults: an added solid on a route is an error; an unknown kind produces exactly one
  error. Add synthetic and real-Chrome regressions in `tools/v7/layout-adds-test.mjs`.
- Update the schema/manual/recipes and regenerate the field reference. No new scene fields or format version were added.

Final verification receipts and any failed attempts are recorded below after the complete sequential run.

## Deliberately left

- **Numeric slots remain positional.** The format already assigns `100000 + 1000 * list index + part`; changing that
  contract would require a migration. Entries must be appended, and deletions retain their slots. Reordering/removing
  entries or changing grid counts/kinds requires updating references. The manual now states this explicitly.
- **Storage grids and cut-wall parents are data edits.** Studio can edit individual pallet cells; it does not offer a
  whole-grid transform or a door cutter. Generated wall fragments are deliberately not independent scene targets.
- **Added geometry has no baked shadow.** Original-object moves/deletions/doors still repair original baked light.
  New geometry did not contribute to that bake; erasing its footprint would damage unrelated original lighting.
- **A suspected marking-tag issue was cleared on inspection:** the existing machine-loop patch already resets the tag
  before decks and storage marks. Its behavior is retained; no tagging defect is claimed.
- **Congestion/Numbers are demonstrations with known limits.** Trolleys do not yield; plan-distance comparisons do not
  separate floors or extend the lead timeline. The older Numbers/caption/prop-clearance limitations in
  [the previous review](REVIEW_REPORT.md) remain separate follow-ups.
- **Release remains with the lead.** No root player, archive, `STAGE` release pointer or company scene is rewritten here.
  Use `--player dist/test/review772.html` for this candidate. The requested identity build selects the 7.1 UI group with
  current engine patches; it is not an old engine snapshot.
- **Camera smoothness is not visibility.** The 20-degree ordinary turn limit excludes forced sight corrections; sharp
  rescue moves remain possible. A sampled passing camera run does not prove every frame or arbitrary future scene safe.
  Rescue is a finite search: if no candidate clears the checks, it retains the eye and records an unresolved search.
  Existing calm-before/after receipts are historical measurements, not a fresh performance guarantee for this review.
- **Raycast cost needs a separate performance receipt.** Visibility checks no longer accept candidates after six exact
  checks without testing them. This fixes a correctness gap but may increase work in difficult views. No new Iris Xe FPS
  benchmark or cold-start guarantee is claimed by this review.

## Changed files

Task 1 source changes, including the preserved pre-restart edits:

- `tools/mf.mjs`
- `tools/v7/aisle-scan.mjs`, `tools/v7/camera-calm.mjs`, `tools/v7/compare-shots.mjs`
- `tools/v7/engine-patches.mjs`, `tools/v7/mf-ops.mjs`
- `tools/v7/scene-core.js`, `tools/v7/scene-schema.mjs`, `tools/v7/scene-ui.js`
- `tools/v7/studio-core.js`, `tools/v7/studio-edit.js`, `tools/v7/studio-ui.js`
- `tools/v7/validator-test.mjs`, `tools/v7/layout-adds-test.mjs` (new)
- `docs/CHANGELOG.md`, `docs/CLI.md`, `docs/DECISIONS.md`, `docs/ENGINE.md`, `docs/LESSONS.md`,
  `docs/RECIPES.md`, `docs/SCENE_MANUAL.md`, `docs/REVIEW_REPORT_772.md` (new)
- `docs/STATUS.md`, `docs/HISTORY.md` (review completion records)

This resumed session additionally tightened the last camera fallback, fixed ordered-target delta export and stale instance
bounds, removed a duplicate scene-load flush, strengthened the deletion/ordered-edit regression and completed the report/history. The saved affine
deletion fix in `studio-edit.js` was retained and verified. This inventory is based on recovered task evidence and reviewed
files; no git commands were used. The lead's stage/build changes are reviewed but not claimed as delegate edits.
Generated players, screenshots and verification receipts are confined to `dist/test/`.

## Ideas

These are proposed follow-ups, ranked by value relative to effort. They are not implemented or factory facts.

| Rank | Improvement | Value / effort | Concrete next slice and acceptance |
|---|---|---|---|
| 1 | Layout commands that resolve text IDs | Very high / Small | Add `layout-add`, `layout-move`, `layout-door`, `layout-delete` and `layout-list` using text IDs, allocating/resolving numeric slots internally. Preview a diff, validate, then write. Require two saves/reloads and undo without retargeting any existing object. Keep a migration to explicit persistent slots as a separate format decision. |
| 2 | Measured slide-to-layout workflow | Very high / Medium | Build a local calibration view: original slide picture plus replica overlay, three or more named control points per floor, visible residual errors, and click/drag rectangles that emit `layoutAdds`. Store source hashes, slide/shape references, CAD dimension evidence and unresolved differences in private manifests. Use slide position/existence and CAD dimensions separately; show exceptions rather than silently fitting one source to the other. Require an inventory/overlay review and all ten paths playing. |
| 3 | Plan camera holds across several steps | High / Medium | Generate candidate views over the whole route, then minimize total angular travel with a penalty for changing direction. Keep one angle across short legs and adjacent steps while it remains clear; prefer a modest height/distance change before reversing direction. Add minimum hold and clearance hysteresis, with safety rescue overriding them. Label every forced correction by obstacle/reason. Target fewer than two direction episodes per minute while all ten existing visibility tests remain clear. Use a deliberate cut at an elevator landing when a continuous swing cannot stay legible. |
| 4 | Fast CPU contracts, narrow GPU checks | High / Small–Medium | Compile routes, collision footprints and story schedules once for Node and player use. Run kind/schema/identity-round-trip/door/storage faults without Chrome; reuse a Chrome process with a fresh isolated context for each UI case. Run camera checks only for affected paths during editing and all ten sequentially for release. Cache static layout solids by scene/layout hash; report per-test startup and execution time so speed work has evidence. |
| 5 | Ghost trolley as a comparison tool (queued V7.8–V7.10 work) | High / Small–Medium | Pin an immutable baseline scene and show one translucent baseline trolley against the edited route. Offer equal elapsed time and equal route-progress modes with clear labels; preserve floor identity and disable depth writes for the ghost. Show changed distance/time beside the journey. Start with one baseline/current pair and no traffic-simulation claims. |
| 6 | Story layer anchored to events | High / Medium | Store narrative beats against path/step IDs and moments such as start, arrival, scan and departure; compile them to seconds for the frozen player. Generate short management films around problem, proposed change and measured result. Keep EN/AR/KO text and attribution in data. Changing route duration should retime captions/keys without manual editing; owner-approved process order remains explicit. |
| 7 | Report-to-film pipeline | High / Medium–Large | Define a small validated input contract: metric, unit, period, baseline, proposal, evidence and scene/path/step IDs. Produce a reviewable story specification, then scene director keys/captions/takes. Keep missing evidence visible and distinguish simulated estimates from measured results. First prove one local report produces one repeatable short film and a source-linked receipt, then add report adapters. |
| 8 | Parallel worlds | Medium–High / Medium–Large | Keep baseline and proposal as independent versioned scenes and compare with one shared clock. Start with one canvas, an A/B switch, matched camera and a difference overlay; this keeps memory lower than two live renderers on Iris Xe. Add split-screen only after measuring GPU cost. Define how changed stops/floors correspond before synchronizing progress. |
| 9 | Iris Xe budget based on evidence | High / Medium | Record warm/cold p50/p95/p99 frame time, draw calls, triangles, texture memory, CPU stage time and rescue count for fixed routes at fixed resolution. First reduce repeated route/mesh work, merge/instance static grids and blocks, reuse buffers and avoid per-frame allocations. Keep text/trolley sharp while reducing optional decorations. Use stable quality presets and a measured recording preset; avoid quality changes during a film. Retain the preparing cover until the cold-start cause is demonstrated. |
| 10 | A reproducible film package | Medium–High / Small–Medium | Emit a local manifest containing scene/build hashes, take settings, language, period, source references and validation receipts alongside MP4 and a poster. Check video decode/duration and completed file writing. A reviewer should be able to rebuild the same story without asking which browser autosave or player version was used. |

Recommended order: establish layout identity/calibration and faster checks first, then the camera planner and ghost/story
slices; use those foundations for parallel worlds and report-driven films. Measure Iris Xe cost at each slice.

## Verification

**All 22 requested build/test commands, including the added layout regression, passed on the final source/build.**
The runner was `node dist/test/review772-run.mjs`; it runs GPU checks sequentially, using installed headless Google Chrome
and fresh isolated profiles. Receipts: `dist/test/review772-results.json` and `dist/test/review772-<test>.log`.

| Check | Final result | Receipt under `dist/test/` |
|---|---|---|
| Build 7.7.2 with `--out dist/test/review772.html --no-docs-check` | PASS; 68 exact-once patches, 12 inline scripts parse | `review772-build.log` |
| Build 7.1 with the four `private/v7/scenes-v6/` scenes | PASS | `review772-build-v6scenes.log` |
| V6 identity | PASS; all 10 paths match | `review772-identity.log` |
| Validate all four current scenes against the candidate | PASS; zero errors and warnings | `review772-validate.log` |
| Validator planted faults | PASS; all 18 cases, including both required addition faults | `review772-validator.log` |
| `node tools/v7/layout-adds-test.mjs dist/test/review772.html` | PASS; core and actual Chrome transactions, deletion/bounds, ordered transforms | `review772-layout-adds.log` |
| Phase A review regressions | PASS | `review772-review.log` |
| Studio smoke | PASS; no page or GL errors | `review772-smoke.log`, `review772-smoke.png` |
| Mouse/keyboard | PASS; edit, undo and persistence | `review772-mouse.log`, `review772-mouse.png` |
| UI | PASS | `review772-ui.log` |
| Gates | PASS | `review772-gates.log` |
| Camera `inj1 guided 3 0` | PASS; 342 clear samples | `review772-camera-inj1-0.log` |
| Camera `inj1 guided 3 1` | PASS; 508 clear samples | `review772-camera-inj1-1.log` |
| Camera `inj2 guided 3 0` | PASS; 393 clear samples | `review772-camera-inj2-0.log` |
| Camera `inj2 guided 3 1` | PASS; 380 clear samples | `review772-camera-inj2-1.log` |
| Camera `eps guided 3 0` | PASS; 258 clear samples | `review772-camera-eps-0.log` |
| Camera `eps guided 3 1` | PASS; 272 clear samples | `review772-camera-eps-1.log` |
| Camera `eps guided 3 2` | PASS; 622 clear samples | `review772-camera-eps-2.log` |
| Camera `eps guided 3 3` | PASS; 486 clear samples | `review772-camera-eps-3.log` |
| Camera `press guided 3 0` | PASS; 461 clear samples | `review772-camera-press-0.log` |
| Camera `press guided 3 1` | PASS; 1,201 clear samples | `review772-camera-press-1.log` |
| `node tools/mf.mjs docs-check` | PASS | `review772-docs.log` |

Camera commands use `node tools/test-camera-v5.mjs dist/test/review772.html` followed by the arguments in the table.
All 4,923 checked samples have zero occlusion, offscreen or near-edge events. The test samples every fourth frame; the
thresholds and acceptance tool were not weakened. Final smoke and mouse screenshots were visually inspected. The mouse
test's temporary route edits intentionally produce clash markers; they are not saved-scene validation failures.

Final player SHA-256: `01f0fb8d613bf2ebeb1c4151ed065c0fbed59cecd2fcca7cb84e6bda7c92c6bb`.
V6-scene identity player SHA-256: `b26ff874269703f24ad634a57b515ce4d62f1f4ed69324ea92c606ca7f072b06`.
Historical preservation: PASS, all 18 earlier player/archive hashes unchanged (`review772-preservation.json`).
No release/root player or company scene was written. The lead can integrate this tested candidate separately.

Supplemental documentation generation reports that generated sections are already current. The broader
`python tools/check-project-docs.py` check exits 1 with its existing separate CAD evidence error,
`Native Excel receipt belongs to a different workbook`; no Markdown/link errors were reported
(`review772-project-docs.log`). That receipt was not changed because CAD extraction is outside this task.

Earlier failures remain evidence, not current results: pre-restart camera failures are in the `first-review772-*` receipts.
The first resumed sandboxed Chrome launch exited before debugger startup; approved isolated execution succeeded. The
complete resumed diagnostic suite passed before the final ordered-edit/bounds/fallback tightening; its receipts and player
were preserved in `dist/test/review772-resume-diagnostic/`. The full final suite above was rerun after every source fix.
