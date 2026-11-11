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
| High | `tools/v7/studio-edit.js:395`, `tools/v7/studio-core.js:136` | Layout Add reloaded even when persistence failed, discarded undo history on success, and left an old redo branch alive. Undoing a changed addition list in memory could leave the replica unchanged. |
| High | `tools/v7/studio-edit.js:140` | Replica deletion wrote a non-affine all-zero instance matrix. Bounds became non-finite during camera rebuild and the edit rolled back. Keep the homogeneous component at one when scaling an instance to zero. |
| High | `tools/v7/studio-core.js:52` | Changing an unrelated replica object flattened existing ordered edits, including wall transforms and doors. Added-wall folding could also change a base before a later door operation. |
| Medium | `tools/v7/studio-edit.js:118` | Generated door fragments were selectable even though their suffixed IDs cannot be represented by `layoutEdits.target`; a move/delete could be lost on save/reload. |
| High | `tools/v7/scene-core.js:171`, `tools/v7/scene-core.js:201` | Prototype names were accepted as kinds; turns were coerced from strings; fractional grid counts and nonboolean pallet flags passed; large storage fields silently stopped after 999 pallets. Malformed added-wall endpoints were not checked during browser preload. |
| Medium | `tools/v7/scene-core.js:188` | Storage turns swapped the outer rectangle without rotating its grid/cells; per-cell identity did not follow the rotation. |
| Medium | `tools/v7/engine-patches.mjs:203` | Added floor markings inherited the preceding replica selection tag and could be associated with an unrelated solid. |
| Medium | `tools/v7/engine-patches.mjs:155` | Calm-camera framing and short-leg caches survived a route rebuild with the same step indexes, using old route geometry. |
| High | `tools/v7/engine-patches.mjs:43` | The first full run caught three camera paths with a hidden sample: exact rescue omitted device meshes, accepted unchecked candidates after its budget expired, and ran before a ceiling constraint that could invalidate its result. |
| Medium | `tools/mf.mjs:23`, `tools/mf.mjs:94` | Step-local writes could overlook errors at path scope; congestion dereferenced a missing closest pair when no two trolleys appeared together. |
| Medium | `tools/v7/mf-ops.mjs:132`, `tools/v7/scene-schema.mjs` | Scene diff ignored added-layout changes; the schema walker expanded wall endpoint arrays into undocumented child fields. |
| Low | `tools/mf.mjs:69`, `tools/v7/compare-shots.mjs`, `tools/v7/aisle-scan.mjs` | Moment shots silently chose path zero for an unknown path; screenshot arguments were unchecked; upper-floor top views targeted ground height; aisle scan lacked player selection and input validation. |

## Fixed

- Layout imports compare both sections and reload only after saving. Studio carries bounded undo/redo as normalized scenes
  through the reload in the same tab, guarded by baked-scene hash and exact saved-scene identity. Add clears redo. A failed
  browser save leaves the scene exportable in memory and does not reload.
- Preserve unchanged edit sequences per target. Keep transforms of a door-bearing added wall in the ordered edit list;
  fold simple block/rack moves/quarter turns into its addition. Delete retains the list slot. Refuse independent selection
  of generated door pieces instead of emitting invalid targets.
- Validate own kind names, finite numeric quarter turns, exact/different wall endpoint pairs, integral grid counts,
  boolean pallet flags and the 999-cell solid-storage limit. Browser restore checks additions before conversion.
  Rotate storage grid/pallet geometry while retaining original row-major cell IDs.
- Keep deleted instance transforms affine, clear floor-mark selection tags and route-dependent calm-camera caches.
  Exact rescue now includes opaque device instances and runs after the ceiling constraint. Every accepted candidate gets
  an exact check. Preserve the motion model; camera acceptance is tested separately from motion identity.
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
- **Congestion/Numbers are demonstrations with known limits.** Trolleys do not yield; plan-distance comparisons do not
  separate floors or extend the lead timeline. The older Numbers/caption/prop-clearance limitations in
  [the previous review](REVIEW_REPORT.md) remain separate follow-ups.
- **Release remains with the lead.** No root player, archive, `STAGE` release pointer or company scene is rewritten here.
  Use `--player dist/test/review772.html` for this candidate. The requested identity build selects the 7.1 UI group with
  current engine patches; it is not an old engine snapshot.
- **Camera smoothness is not visibility.** The 20-degree ordinary turn limit excludes forced sight corrections; sharp
  rescue moves remain possible. A sampled passing camera run does not prove every frame or arbitrary future scene safe.
  Existing calm-before/after receipts are historical measurements, not a fresh performance guarantee for this review.
- **Raycast cost needs a separate performance receipt.** Visibility checks no longer accept candidates after six exact
  checks without testing them. This fixes a correctness gap but may increase work in difficult views. No new Iris Xe FPS
  benchmark or cold-start guarantee is claimed by this review.

## Ideas

These are proposed follow-ups, ranked by value relative to effort. They are not implemented or factory facts.

| Rank | Improvement | Value / effort | Concrete next slice and acceptance |
|---|---|---|---|
| 1 | Layout commands that resolve text IDs | Very high / Small | Add `layout-add`, `layout-move`, `layout-door`, `layout-delete` and `layout-list` using text IDs, allocating/resolving numeric slots internally. Preview a diff, validate, then write. Require two saves/reloads and undo without retargeting any existing object. Keep a migration to explicit persistent slots as a separate format decision. |
| 2 | Measured slide-to-layout workflow | Very high / Medium | Build a local calibration view: original slide picture plus replica overlay, three or more named control points per floor, visible residual errors, and click/drag rectangles that emit `layoutAdds`. Store source hashes, slide/shape references, CAD dimension evidence and unresolved differences in private manifests. Use slide position/existence and CAD dimensions separately; show exceptions rather than silently fitting one source to the other. Require a signed inventory/overlay review and all ten paths playing. |
| 3 | Plan camera holds across several steps | High / Medium | Generate candidate views over the whole route, then minimize total angular travel with a penalty for changing direction. Keep one angle across short legs and adjacent steps while it remains clear; prefer a modest height/distance change before reversing direction. Add minimum hold and clearance hysteresis, with safety rescue overriding them. Label every forced correction by obstacle/reason. Target fewer than two direction episodes per minute while all ten existing visibility tests remain clear. Use a deliberate cut at an elevator landing when a continuous swing cannot stay legible. |
| 4 | Fast CPU contracts, narrow GPU checks | High / Small–Medium | Compile routes, collision footprints and story schedules once for Node and player use. Run kind/schema/identity-round-trip/door/storage faults without Chrome; reuse one isolated Chrome session for UI cases. Run camera checks only for affected paths during editing and all ten sequentially for release. Cache static layout solids by scene/layout hash; report per-test startup and execution time so speed work has evidence. |
| 5 | V7.8 ghost trolley as a comparison tool | High / Small–Medium | Pin an immutable baseline scene and show one translucent baseline trolley against the edited route. Offer equal elapsed time and equal route-progress modes with clear labels; preserve floor identity and disable depth writes for the ghost. Show changed distance/time beside the journey. Start with one baseline/current pair and no traffic-simulation claims. |
| 6 | Story layer anchored to events | High / Medium | Store narrative beats against path/step IDs and moments such as start, arrival, scan and departure; compile them to seconds for the frozen player. Generate short management films around problem, proposed change and measured result. Keep EN/AR/KO text and attribution in data. Changing route duration should retime captions/keys without manual editing; owner-approved process order remains explicit. |
| 7 | Report-to-film pipeline | High / Medium–Large | Define a small validated input contract: metric, unit, period, baseline, proposal, evidence and scene/path/step IDs. Produce a reviewable story specification, then scene director keys/captions/takes. Keep missing evidence visible and distinguish simulated estimates from measured results. First prove one local report produces one repeatable short film and a source-linked receipt, then add report adapters. |
| 8 | V7.9–V7.10 parallel worlds | Medium–High / Medium–Large | Keep baseline and proposal as independent versioned scenes and compare with one shared clock. Start with a one-canvas A/B switch, matched camera and a difference overlay; this keeps memory lower than two live renderers on Iris Xe. Add split-screen only after measuring GPU cost. Define how changed stops/floors correspond before synchronizing progress. |
| 9 | Iris Xe budget based on evidence | High / Medium | Record warm/cold p50/p95/p99 frame time, draw calls, triangles, texture memory, CPU stage time and rescue count for fixed routes at fixed resolution. First reduce repeated route/mesh work, merge/instance static grids and blocks, reuse buffers and avoid per-frame allocations. Keep text/trolley sharp while reducing optional decorations. Use stable quality presets and a measured recording preset; avoid quality changes during a film. Retain the preparing cover until the cold-start cause is demonstrated. |
| 10 | A reproducible film package | Medium–High / Small–Medium | Emit a local manifest containing scene/build hashes, take settings, language, period, source references and validation receipts alongside MP4 and a poster. Check video decode/duration and completed file writing. A reviewer should be able to rebuild the same story without asking which browser autosave or player version was used. |

Recommended order: establish layout identity/calibration and faster checks first, then the camera planner and ghost/story
slices; use those foundations for parallel worlds and report-driven films. Measure Iris Xe cost at each slice.

## Verification

Pending completion of the requested sequential suite. Receipts: `dist/test/review772-results.json` and
`dist/test/review772-<test>.log`. The first sandboxed Chrome launch exited before debugger startup; an approved isolated
headless run is used for browser verification. An initial new regression failed and is being investigated; no pass is claimed
until its final run succeeds.
