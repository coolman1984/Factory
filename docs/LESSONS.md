
# 2026-11-06 - Verified working lessons
- Camera clearance and visibility need separate checks: actual smoothed eye/full near plane versus geometry, then a trolley sight-line check and screenshot. Picture boundaries can miss projecting bridges.
- Match browser frame pacing before comparing frame times. GPU-process flush duration does not prove an application JavaScript cause. Run GPU checks sequentially.
- Isolated synthetic helper jobs avoid sending company inputs. Read answer files and test the output yourself; idle/DONE is not verification.
- Git snapshots exclude ignored private/dist. Preserve exports, traces, images and the built HTML in an explicit local archive when pausing.
- Direct PowerPoint Shape.Export avoids using and clearing the owner's clipboard. Open source decks read-only without a window; preserve existing PowerPoint sessions.

# 2026-11-09 â€” CAD extraction and agent continuity

- **L-CAD-01 â€” Check bytes before parsers.** NASCA-wrapped PDF bytes caused plain-library `no objects found`; native viewing was possible but text export was not established. New native Excel preview PDFs were wrapped too. See [native runbook](runbooks/NASCA_AND_NATIVE_OFFICE.md).
- **L-CAD-02 â€” Use actual completion evidence.** A 2-GB ASCII DXF ended mid-record after a native write error. ODA's documented DXB mode produced complete binary DXF; the exact ASCII failure cause remains unknown. Size/exit status alone is insufficient.
- **L-CAD-03 â€” Stream, do not materialize millions of objects.** mmap-compatible tag streaming and small SQLite batches worked after full CAD loading exhausted available memory. The mmap subclass preserves both `.index()` and the struct buffer interface. See [working procedure](runbooks/CAD_EXTRACTION.md).
- **L-CAD-04 â€” Preserve semantic boundaries.** Block definition text is local reusable geometry; INSERTs/vertices/dimensions are not machine counts. Source CAD units are separate from the player's estimated slide scale. See [contract](architecture/CAD_DATA_CONTRACT.md).
- **L-CAD-05 â€” Verify the verifier.** Fixture and full-data comparison exposed SQL placeholder arity, header grouping, numeric-type serialization and empty display-text cases. Correct the code/checker on evidence; never change raw values to make a check pass.
- **L-CAD-06 â€” Guard views without corrupting raw text.** Write XLSX strings literally, guard formula-like CSV text, retain raw JSONL/SQLite and a separate plain-text display aid. Formatting-only text can produce an empty display value.
- **L-CAD-07 â€” Execution context is a capability variable.** Excel failed to start in the restricted doctor but connected in a separate approved hidden COM context. Orca/hidden CopyPicture did not work. Do not claim native visual acceptance from exported protected files.
- **L-CAD-08 â€” Recover work, not hopeful narration.** Read bridge results and real artifacts before continuing. Both bounded bridge jobs timed out without the reporting script; the coordinator completed locally. Do not loop accounts/models or call a submitted worker a delivered result.
- **L-CAD-09 â€” Cleanup is narrowly scoped.** The owner requested PDF closure; only the verified task-owned unresponsive reader was stopped after ordinary close failed. Do not generalize that into permission to terminate other user apps.
- **L-MEM-01 â€” Separate live state from history.** The dated Nov 8 application checkpoint supersedes older "Press/EPS not built" records, while camera/registration/performance acceptance remains open. A CAD/documentation request does not resume paused app implementation.

Full provenance, failed attempts and demonstrated limits: [2026-11-09 case](history/2026-11-09-cad-extraction.md). Future lessons should follow [MAINTENANCE.md](MAINTENANCE.md).
- **L-V7-01 â€” Identify a visual artefact before "fixing" it.** For V6 the owner's "pale light cones" were assumed to be the DFAtmos light shafts and the "dark boxes" the rooms' walls; both came back (image 24) because the cones were the floor reflection and the boxes were shadows baked into the floor light. Countermeasure: `tools/v7/shot-probe.mjs` renders the same view with candidate groups hidden (devices, replica, route, transparent, reflection); fix only what makes the artefact disappear, and show the before/after shot.
- **L-V7-02 â€” A validator must report the worst point, not the first.** The collision sweep logged each object once at its first close pass (a warning) and so missed a later overlap (an error) on the same object. Planted faults (`tools/v7/validator-test.mjs`) found it; keep fault-planting tests next to every validator.
- **L-V7-03 â€” Baked data outlives edits.** Removing geometry does not remove what was baked from it (floor light, shadows). Any layout edit (V6 room removal, scene layoutEdits) now also cleans the baked light under it.

## Player / scene engine lessons (V5 - V7.7.1)

Each: what happened, the cause, the rule.

- **L-PL-01 Identify a visual artefact before fixing it.** V6 "removed" the pale cones and dark boxes the owner circled; both came back (image 24). Cause: the cones were the floor reflection, the boxes were shadows baked in the floor light; V6 had removed other things (light shafts, room walls). Rule: render the view with groups hidden (`tools/v7/shot-probe.mjs`) and fix only what makes it disappear; show before / after.
- **L-PL-02 Baked data outlives geometry.** Removing rooms left their baked shadows; extending a floor stretched its baked light (black bands, image 28). Rule: any layout edit must also repair what was baked from it (`MF7_LIGHT_ERASE`, `MF7_LIGHT_BOX`).
- **L-PL-03 A validator keeps the worst point, not the first.** The sweep logged an object at its first close pass (a warning) and missed the later overlap (an error). Planted faults found it. Rule: every validator has a fault-planting test (`validator-test.mjs`).
- **L-PL-04 A comment can delete code.** A `//` comment inside a one-line edit swallowed the rest of the line and silently disabled the preload. Rule: the build parses every inline script; run syntax checks after edits.
- **L-PL-05 Edit scripts must fail loudly.** A PowerShell helper named `R` (an alias of Invoke-History) applied none of 28 edits; nested template literals broke another. Rule: exact-once replacement with a thrown error; no one-off `_apply*.mjs` left in the repo (Phase A review).
- **L-PL-06 Patch order matters.** A patch whose anchor text is created by another patch failed ("expected exactly one match, found 0"). Rule: put it after the creating patch or merge it into that patch.
- **L-PL-07 Mixed line ends.** Embedded scripts in the V6 file mix LF and CRLF. Rule: the build retries a multi-line anchor with CRLF.
- **L-PL-08 Measure with the right state.** A camera probe after a seek saw the factory still rising (`S.R` 0.14) and blamed the rescue. Rule: probes play from the start like the real test, or wait for `S.R` = 1.
- **L-PL-09 Same frame, same matrices.** The camera rescue raycast the floors with last frame's matrices while the 2nd floor glided. Rule: update world matrices before exact checks inside the frame.
- **L-PL-10 One slow run is not a regression.** Opening stalls appeared in V6 and V7 alike, in some fresh sessions only. Rule: A/B the same tab and speed back to back, several runs, before blaming a change; hide what cannot be fixed (preparing screen).
- **L-PL-11 Auto routes are conservative.** The router's margins avoid narrow doorways (304 m detour instead of 37 m). Rule: draw the owner's exact line as `points`; the validator, not the router, decides what fits.
- **L-PL-12 Tests that compare need the same calculation.** The Numbers tab compared real timings with estimates and showed false differences. Rule: both sides of a comparison use one function.
- **L-PL-13 Working product first** (owner's rule). Deliver a working result with the minimum test, then iterate; long test suites only when asked.
- **L-PL-14 Headless downloads do not land on disk.** Read the produced Blob in the page (and write it from Node over CDP) to verify a video.
- **L-PL-15 Test profiles fill the disk.** 207 throw-away Chrome profiles (4.7 GB) left in the temp folder filled drive C: and caused stutter in the start test. Cause: Chrome still held files when the test removed its profile. Rule: `tools/v7/cdp.mjs` removes `mf_*` profiles older than an hour on every start; check free space when tests behave strangely.
- **L-PL-16 Layout reloads are transactions.** A layout addition can update JSON while leaving the visible replica unchanged;
  reloading after a failed save can lose the change. Compare both layout sections, persist first, preserve normalized scene
  history across reload, and test save/reload/undo against actual geometry. Positional slots must survive deletion.
  When editing an already transformed target, retain its ordered operations and append the live delta; keeping only the last
  original operation loses earlier transforms on save. Deleted instance matrices need the affine homogeneous component
  to stay one, even with zero scale, so computed bounds remain finite. Invalidate instance bounds after edits/undo so
  raycasting sees moved geometry outside the old bounds.
- **L-PL-17 A camera check must use every acceptance obstacle.** The replica-only exact ray omitted opaque device meshes,
  and a later ceiling clamp could invalidate a rescued eye. Check the final eye after constraints, include device instances,
  and never treat an exhausted exact-check budget as evidence that a candidate is clear. See the V7.7.2 review receipts.
- **L-CAM-01 Story time owns camera motion.** Wall-clock filtering changed the shot at different playback speeds; use story-time damping, look-ahead and hysteresis. This reduces ordinary turns but cannot prove a reactive rescue is cinematic. Report its worst turn separately from the 95th percentile; a clear trolley can still accompany a visible snap.
- **L-CAM-02 Bounded keys and real follow endpoints.** Catmull-Rom could leave the endpoint range, and independently sampled follow endpoints plus a second spring introduced drift. Evaluate both follow endpoints at the same story time, use bounded interpolation and test offsets at several speeds and arbitrary timestamps. Keep cuts explicit.
- **L-FILM-01 Decode the film before accepting it.** A requested duration and a produced Blob did not establish actual length or moving frames. Warm before capture, give one loop ownership of frame time, count decoded frames, check timestamps and inject a moving freeze to prove rejection. Retain the failure receipt and restore player state after success or failure.
- **L-REV-01 Recover scope as well as files.** Replacement references and lead ownership can supersede an interrupted task. Compare backups before attributing earlier edits, keep business-specific findings private, and do not make scene fixes after ownership has moved.
- **L-FILM-02 A UI speed setter is not an export clock.** The player snaps speed to its menu presets. An offline recipe can request a fractional speed to fit an exact duration; preserve that value for frame advancement and test a non-preset speed against actual timestamps, then restore the prior player state.
- **L-TEST-01 Verify the setting, not the argument.** A camera test requested 8x but the player menu setter selected 3x. Record and assert the actual story speed; distinguish an explicit stress state from a supported UI preset. Preserve and label the invalid measurement instead of reporting it as 8x.

- **L-PL-18 Guard every release path.** A version pointer that lagged the tools let browser verbs rebuild an older owner file.
  Guard resolved release paths by the selected stage, refuse archives/backups, back up own-stage replacements and publish
  atomically. Test old-file hashes and failure paths rather than maintaining an incomplete list of protected versions.
- **L-M0-01 Keep fixture authority explicit.** Guard tests derive an isolated lighting snapshot from the V6 input so they
  need no owner scenes. This proves publication plumbing, not lighting accuracy. The legacy synchronous scene-import test
  requires matching layout fixtures; actual-player layout changes have their own reload/undo regressions.
- **L-M0-02 Bound the operation that actually runs.** The shared CDP driver had a two-minute evaluation limit, shorter
  than a valid 1x whole-path check. Keep the normal default and allow an explicit bounded override for long operations.
  Preserve assertions while removing test-process/compiler overhead; the shared publisher lets guard cases run directly
  without weakening the three integrated build cases.
  Measure timing budgets end to end: the gate-internal clock omits process startup/exit. Keep failed budget attempts
  and all assertions when reducing repeated process overhead.
  Identity can keep a fresh profile per input and load a fresh document per project; verify the project and unload boundary,
  and preserve every snapshot/comparison when removing redundant browser launches.

- **L-PL-19 Three copies of one calculation drift.** CLI and Studio estimates lost carried heading, scan holds and exact wait
  endpoints. Move the reviewed arithmetic into one browser/Node core; use it for current and baseline numbers. Verify
  exact engine steps, displayed summaries and explicit older-player lookup; do not force current scene totals to historical
  examples. Keep the byte proof before the modularization proof so extraction errors cannot masquerade as motion bugs.
