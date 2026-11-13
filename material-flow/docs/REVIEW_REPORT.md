# Material Flow V7 scene engine — Phase A review

Reviewed 2026-11-11. Direct delegate work: no git, bridge, agents, uploads, or source-scene edits. Experiments and company-derived receipts stay in `dist/test/`. Line references below identify the reviewed/fixed source, not generated HTML. The requested final V7.7.1 rebuild is the sole permitted historical-player replacement.

## Found

| Severity | Location | Finding |
|---|---|---|
| High — fixed | `tools/v7/scene-core.js:41`, `tools/v7/studio-core.js:46` | Saving through Studio regenerated stop/device IDs from labels and step IDs from positions. Renaming/reordering could silently change the external scene contract. New duplicates also inherited source IDs. |
| High — fixed | `tools/v7/studio-core.js:29` | Round trips dropped notes and the layout selector. Ordered layout edits were flattened; a combined door/translation could be exported as a translation followed by the same translation again inside the door edit. |
| High — fixed | `tools/v7/scene-core.js:281` | Malformed lists, null entries, scanner coordinates and point routes reached conversion before validation and could throw instead of refusing import. Director/caption/take/viewpoint contents were barely checked. Empty scenes could reach an engine that requires a path. |
| High — fixed | `tools/v7/scene-ui.js:57`, `tools/v7/studio-core.js:93` | Save As did not flush pending Studio changes. A localStorage quota error prevented the scene manager receiving the new scene, so a file download/save could silently contain old content. Failed writable streams were not aborted. |
| Medium — fixed | `tools/v7/scene-ui.js:21`, `tools/v7/studio-ui.js:600` | Scene manager and Studio maintained overlapping undo histories; falling back to manager history after Studio history emptied replayed stale snapshots. Its buttons checked the wrong stacks. |
| Medium — fixed | `tools/v7/studio-ui.js:239` | Duplicating a flow copied its director outside the undo transaction: undo left an orphan and redo did not reliably reconstruct the copy. Deleting a flow left takes pointing to it. |
| Medium — fixed | `tools/v7/studio-ui.js:129` | Empty number inputs became zero before their handlers saw them: clearing Wait forced zero and clearing Speed forced the minimum, instead of restoring automatic defaults. |
| Medium — fixed | `tools/v7/studio-ui.js:349` | Dragging a key across another key did not sort the timeline before evaluation. Multilingual caption lanes displayed `[object Object]`. Scene-provided IDs were interpolated into HTML attributes without escaping. |
| Medium — fixed | `tools/v7/studio-edit.js:378` | Placement/duplication still capped gates at 8 despite the engine and validator supporting 64. |
| Medium — fixed | `tools/v7/studio-ui.js:431`, `tools/v7/studio-core.js:107` | Pointer cancellation committed a partial edit. Rebuild exceptions could leave a modified document/history; commit now restores the prior document and attempts to rebuild it. |
| High — fixed | `tools/v7/studio-director.js:91` | Recording constructor/start/runtime/frame failures lacked complete state and capture-track cleanup. Failed recording could leave altered flow, story time, speed or camera state. |
| Medium — fixed | `tools/v7/preload-scene.js:103` | Failed saved-scene conversion could partly edit the replica before fallback. Door cuts did not trigger floor-light shadow cleanup. Malformed saved director structure could break Studio startup. |
| Medium — fixed | `tools/build-v7.mjs:15`, `tools/build-v7.mjs:93` | `--bake` consumed following option values as scene filenames. Duplicate baked projects silently won by order. The inline-script check skipped scripts over 3 MB and scripts with other attributes. Historical output protection was incomplete. |
| Medium — fixed | `tools/v7/cdp.mjs:8` | Chrome launch failure was hidden behind a null-tabs crash; startup/WebSocket/commands lacked useful bounds, cleanup was not guaranteed, and random debugger ports could collide. CDP protocol errors were returned as successes, defeating callers' fallback catches. |
| Medium — fixed | `tools/v7/export-scenes.mjs:13` | Export wrote canonical scene files before proving its round trip, and would overwrite owner-edited scenes by default. |
| Medium — fixed | `tools/v7/scene-core.js:41`, `tools/v7/scene-core.js:174` | ID dictionaries inherited prototype names. Headway set while a path had one trolley was lost. Collision sweeps omitted the last fraction of a leg. |
| Medium — fixed | `tools/v7/studio-edit.js:103` | Prop rebuilds missed unique sign materials held in arrays and zone edge materials, leaking GPU resources. |
| Low — fixed/documented | `tools/v7/preload.js:1`, `tools/v7/studio-ui.js:326` | Dead prototype uses the incompatible `mf7-scene` format. A second obsolete, unreachable import handler still expected that format. |
| Medium — deferred | `tools/v7/studio-numbers.js:2` | Numbers uses estimates: fixed lift duration, generic waits, no carried heading between steps, and no manual scanner stop schedule. Matching before/after calculations avoids false deltas but does not prove absolute time/trips accuracy. |
| Medium — deferred | `tools/v7/scene-core.js:185`, `tools/v7/studio-core.js:159` | Node collision validation does not sweep placed props. Studio includes props, but its interactive hit aggregation and sampling differ from the full validator. |
| Medium — deferred | `tools/v7/scene-core.js:174` | Arbitrary PC headings use the historical cardinal-orientation footprint approximation. Free-angle clearance is not an exact oriented desk footprint. |
| Medium — deferred | `tools/v7/engine-patches.mjs:43` | Camera rescue's exact-mesh budget is six candidates; later candidates use boxes/floors only, and the final fallback is unconditional. Comments saying “never hidden” exceed the guarantee. |
| Medium — deferred | `tools/v7/studio-director.js:169` | Fleet copies share the lead trolley's overall story duration, and congestion compares plan positions without floor separation. This is a visual headway demonstration, not a traffic/throughput simulator. |

## Fixed

- IDs now travel as internal `sceneId` metadata through scene conversion and Studio snapshots. New items reserve existing IDs before allocating one; duplicates drop the copied identity. Existing scene fields and version remain unchanged.
- Studio preserves notes, layout selection and the original ordered edit list when its replica operations have not changed. A combined door transform is emitted once. Captions/translations, viewpoints, takes and fleet settings remain in the scene. The regression suite checks these round trips.
- Studio calls `window.MFScene` for device footprints, replica transformation, layout/device solids and their spatial hash, grid/A* routing, simplification and trolley/rectangle gap. Studio adds its props through the shared solids/router hook and retains its interactive sampling/overlay adapter. This removes an entire duplicate router rather than merely moving it.
- Validation now checks malformed input before conversion, checks director/recording structures and values, rejects nonintegral trolley counts, validates object sizes and rejects door cuts on diagonal walls. Collision sampling includes every leg endpoint. The manual documents the strengthened checks; no new scene fields were introduced.
- File exports receive current in-memory state even when browser persistence fails. Save As flushes first; file writer failures abort the stream. Loading a layout change refuses to reload if the scene could not be persisted.
- Both manager keyboard actions and panel buttons use Studio's history when Studio is present. Flow/director duplication is one transaction. Deleted flows remove their dependent takes. Live pointer cancellation rolls back. Imported and retimed director keys are sorted.
- Unique sign materials in arrays and zone edge materials are disposed on rebuild; shared cached prop materials remain reusable.
- Recording errors stop capture tracks, clean the HUD, restore the prior flow/time/camera/speed/step-stop/play state and report the failure. Invalid recording ranges are refused. Both an injected encoder failure and a complete real take are covered.
- Saved-scene preload converts on a fresh replica. Its structure-only check catches malformed data without discarding a working edit merely because it currently has collision/link errors. Full file import validation remains strict. Fallback recomputes built-in lighting cleanup.
- Build options are parsed by boundary, duplicate baked projects fail, experiment directories are created, source/archive/earlier output paths are protected, and all executable inline scripts are parsed regardless of size/ordinary attributes. Existing exactly-once patches and LF/CRLF retry remain.
- Chrome uses its own allocated debugging port, bounded connection/command waits, actionable protocol/launch errors, and cleanup on failure. It still uses installed headless Google Chrome and its own temporary profile only.
- Scene export proves all round trips before writing and refuses existing scene outputs unless `--overwrite` is explicit. The old prototype is clearly marked dead; the unreachable legacy import handler is removed.

Verification receipts and final results are listed below. The new `tools/v7/review-test.mjs` uses synthetic data and runtime scene copies; no company scene content was copied into tracked source.

## Deliberately left

- **Numbers and fleet simulation:** fixing the estimates requires sharing the complete motion/scanner schedule, including baseline devices and nodes, and defining whether trailing trolleys extend playback. Those changes affect product behavior and need a dedicated follow-up. Current values must not be used as accepted factory capacity measurements.
- **Interactive checks versus full validation:** Studio retains fast marker aggregation and fewer samples so editing remains responsive. The shared footprint/gap/router removes geometric duplication; identical diagnostic counts are not promised. The full validator still needs placed-prop sweeps and exact free-angle desk footprints.
- **Complex ordered edits on the same target:** unchanged sequences round-trip exactly. Studio still represents an edited replica target as one cumulative move/turn/delete. Editing an already-cut wall or rewriting multiple transforms of that same target needs a canonical edit model/rebuild, not another flattening shortcut. Door fragments have suffixed internal IDs and are not independent scene targets.
- **Camera behavior and performance:** retained the existing six-candidate budget and owner-accepted visibility limit. Removing the budget or replacing sight heuristics could regress frame time and exceeds the smallest safe data/transaction fixes. The startup test is evidence for its sampled runs, not a universal stutter guarantee.
- **Renderer resource lifetime:** fixed the concrete sign-material-array and zone-edge-material leaks, with a dispose-event regression. A broader fleet/device ownership pass remains separate; indiscriminate disposal could destroy assets shared with the player.
- **Recorder composition:** canvas captions do not fully reproduce CSS gradients, multiline title layout, or Arabic RTL text alignment. Translations are preserved and on-screen Arabic is tested; exported video typography is not a full DOM rendering guarantee.
- **Router endpoint joins:** A* clears its grid route, then joins exact endpoints with short elbows. Those joins still require the collision validator/checks. An “auto” route is not independently certified merely because A* returned points.
- **`tools/v7/preload.js` is dead for all current 7.x build stages.** Retained as historical prototype with an explicit warning; there are no build references. Do not wire it back in or use its `mf7-scene` persistence format.
- **String patches:** retained because the project intentionally builds on the frozen V6 HTML. Exactly-once matches, full script syntax parsing and 10-path identity are the controls. A parser-based engine/source extraction would be a larger architectural migration.
- **Other tooling limits:** `layout-reference.mjs` combines the selected player's base layout with current disk scene labels, not arbitrary baked/browser edits. `shot-probe.mjs` changes reflection for later probe captures; its captures should not be treated as wholly independent configurations. These tools were inspected, not used to change source layouts.
- **Download observation:** the full-take test passed decoding the recorded MP4 blob, but its disk output still had `.crdownload` suffixes when the test closed Chrome. Encoding is verified; completed disk delivery is not. The existing test's fixed three-second wait does not establish download completion.
- **Test limits:** mouse-test permits its corner check to be skipped if the point is offscreen (it was on screen and moved in this run); smoke does not verify every emitted number or all three caption languages visually. Existing tour is a screenshot generator, not an assertion suite. Real picker permissions/user file dialogs are not exercised by the mocked Save As regression.

## Notes for agents

- Current build stages share the same engine patch list; “7.1” selects the small UI group, not a historical engine snapshot. Compare against original V6 scenes for identity and current scenes for owner edits.
- Scene positions are metres; working-copy/layout coordinates and trolley gap values are frame units (`0.3 m` each). Camera poses in director/viewpoints use engine world units/radians except `fov` in degrees. Layout turns/headings are degrees. Keep these boundaries explicit.
- Always build experiments with `--out dist/test/...`. Do not overwrite `dist/versions/` or earlier named players. Only the specifically requested final build replaces `dist/Material_Flow_Player_v7.7.1.html`.
- `export-scenes.mjs` seeds scenes from V6; it is not a way to save Studio edits. Its overwrite refusal protects owner scenes. Use a new private/dist output directory for conversion experiments.
- Do not restore the removed duplicate router or legacy import handler. Use `MFScene.makeRouter(..., solidsFor)` for Studio's added obstacles, and `MFScene.applyLayoutOp` for replica geometry.
- `structureOnly` is for restoring the editor's browser working copy. It deliberately skips business/geometric validity so an unfinished edit remains recoverable. File import and CLI validation use the full validator.
- No `_apply*.mjs` one-off edit scripts were present in the reviewed tree and none were created. New documentation-generator tools appeared during the lead's concurrent work; they are outside this delegate's Phase A changes.
- Review coverage: read all requested engine/build, core/preload, Studio JS/CSS, CLI/export/reference/CDP/probe files, and all ten listed tests. `studio-camera.js`, both CSS files, `engine-patches.mjs`, `scene-node.mjs`, reference/probe and existing tests were left intact after review.
- The input V6 and historical player output preservation are checked by the hash receipt `dist/test/review-before-hashes.json`. Company-derived logs/screenshots/videos stay in `dist/test/`. No acceptance claim is made for factory process order, dimensions or capacity.

## Verification results

- Required current-scene validation: PASS, all four scenes, zero errors/warnings (`dist/test/review-test-3.log`).
- Required validator fault suite: PASS, 16 cases (`dist/test/review-test-4.log`).
- Required V6 identity: PASS, all 10 paths (`dist/test/review-test-2.log`).
- Required review smoke, mouse and UI checks: PASS (`dist/test/review-final-2.log` through `review-final-4.log`); screenshots inspected for smoke/mouse UI placement.
- Required startup: **FAIL**, initially 2/4 starts with stutter. Sequential comparison: untouched V7.7.1 also FAIL 2/4; candidate FAIL 1/4 (`dist/test/review-start-baseline.log`, `review-start-candidate.log`). This remains open; thresholds were not relaxed and no pass is claimed.
- Extra 24-gate shader/read test: PASS (`dist/test/review-final-6.log`).
- Extra full take: encoded MP4 blob decodes in Chrome; test exits 0. Completed filesystem download is unverified (`dist/test/review-final-7.log`).
- Build/export safeguard checks: PASS, including `--bake` before `--out`, V6 round trip export, overwrite refusal, historical/archive output refusal, a syntax fault in an attributed inline script over 3 MB, and null JSON CLI rejection (`dist/test/review-tool-results.json`).
- Project documentation checker: FAIL on the existing skill-discovery inventory and separate CAD receipt mismatch (“Native Excel receipt belongs to a different workbook”). No Markdown/link failures were reported. Neither inventory nor CAD evidence was changed by this review.
- Added review regressions: PASS, including material cleanup and malformed saved-scene recovery (`dist/test/review-extra-1.log`).
- Existing Stage 1 proof: PASS, all checks (`dist/test/review-extra-2.log`).
- Existing tour: exit 0, 20 captures at 1366×768 (`dist/test/review-extra-3.log`); smoke/mouse screenshots were visually inspected. This is screenshot generation, not exhaustive visual acceptance.
- Final real build: PASS, 55 exactly-once engine patches; 12 executable inline scripts parse. SHA-256 `5ce02a8d07873c90bd43dcb01b24bd8ef6578634e906f42c1ad5c13f9b1a692f`; byte-identical to the tested review candidate. Earlier player/archive hashes unchanged (`dist/test/review-preservation.json`).
- Final real-file smoke: PASS; final real-file mouse: PASS; no page errors (`dist/test/review-real-smoke.log`, `review-real-mouse.log`).


## Changed files

Source and documentation changed by this delegate:

- `docs/REVIEW_REPORT.md` (new)
- `docs/SCENE_MANUAL.md`
- `docs/STATUS.md` (appended Phase A status only)
- `docs/HISTORY.md` (appended Phase A entry only)
- `tools/build-v7.mjs`
- `tools/mf-validate.mjs`
- `tools/v7/cdp.mjs`
- `tools/v7/export-scenes.mjs`
- `tools/v7/preload-scene.js`
- `tools/v7/preload.js` (dead-prototype notice only)
- `tools/v7/review-test.mjs` (new)
- `tools/v7/scene-core.js`
- `tools/v7/scene-ui.js`
- `tools/v7/studio-core.js`
- `tools/v7/studio-director.js`
- `tools/v7/studio-edit.js`
- `tools/v7/studio-ui.js`

Generated: `dist/Material_Flow_Player_v7.7.1.html`; experimental builds, screenshots, video download fragments, logs and JSON receipts under `dist/test/`. Other concurrent lead documentation/tool additions are not claimed as this delegate's changes.
