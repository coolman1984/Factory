
# 2026-11-06 - Verified working lessons
- Camera clearance and visibility need separate checks: actual smoothed eye/full near plane versus geometry, then a trolley sight-line check and screenshot. Picture boundaries can miss projecting bridges.
- Match browser frame pacing before comparing frame times. GPU-process flush duration does not prove an application JavaScript cause. Run GPU checks sequentially.
- Isolated synthetic helper jobs avoid sending company inputs. Read answer files and test the output yourself; idle/DONE is not verification.
- Git snapshots exclude ignored private/dist. Preserve exports, traces, images and the built HTML in an explicit local archive when pausing.
- Direct PowerPoint Shape.Export avoids using and clearing the owner's clipboard. Open source decks read-only without a window; preserve existing PowerPoint sessions.

# 2026-11-09 — CAD extraction and agent continuity

- **L-CAD-01 — Check bytes before parsers.** NASCA-wrapped PDF bytes caused plain-library `no objects found`; native viewing was possible but text export was not established. New native Excel preview PDFs were wrapped too. See [native runbook](runbooks/NASCA_AND_NATIVE_OFFICE.md).
- **L-CAD-02 — Use actual completion evidence.** A 2-GB ASCII DXF ended mid-record after a native write error. ODA's documented DXB mode produced complete binary DXF; the exact ASCII failure cause remains unknown. Size/exit status alone is insufficient.
- **L-CAD-03 — Stream, do not materialize millions of objects.** mmap-compatible tag streaming and small SQLite batches worked after full CAD loading exhausted available memory. The mmap subclass preserves both `.index()` and the struct buffer interface. See [working procedure](runbooks/CAD_EXTRACTION.md).
- **L-CAD-04 — Preserve semantic boundaries.** Block definition text is local reusable geometry; INSERTs/vertices/dimensions are not machine counts. Source CAD units are separate from the player's estimated slide scale. See [contract](architecture/CAD_DATA_CONTRACT.md).
- **L-CAD-05 — Verify the verifier.** Fixture and full-data comparison exposed SQL placeholder arity, header grouping, numeric-type serialization and empty display-text cases. Correct the code/checker on evidence; never change raw values to make a check pass.
- **L-CAD-06 — Guard views without corrupting raw text.** Write XLSX strings literally, guard formula-like CSV text, retain raw JSONL/SQLite and a separate plain-text display aid. Formatting-only text can produce an empty display value.
- **L-CAD-07 — Execution context is a capability variable.** Excel failed to start in the restricted doctor but connected in a separate approved hidden COM context. Orca/hidden CopyPicture did not work. Do not claim native visual acceptance from exported protected files.
- **L-CAD-08 — Recover work, not hopeful narration.** Read bridge results and real artifacts before continuing. Both bounded bridge jobs timed out without the reporting script; the coordinator completed locally. Do not loop accounts/models or call a submitted worker a delivered result.
- **L-CAD-09 — Cleanup is narrowly scoped.** The owner requested PDF closure; only the verified task-owned unresponsive reader was stopped after ordinary close failed. Do not generalize that into permission to terminate other user apps.
- **L-MEM-01 — Separate live state from history.** The dated Nov 8 application checkpoint supersedes older "Press/EPS not built" records, while camera/registration/performance acceptance remains open. A CAD/documentation request does not resume paused app implementation.

Full provenance, failed attempts and demonstrated limits: [2026-11-09 case](history/2026-11-09-cad-extraction.md). Future lessons should follow [MAINTENANCE.md](MAINTENANCE.md).
- **L-V7-01 — Identify a visual artefact before "fixing" it.** For V6 the owner's "pale light cones" were assumed to be the DFAtmos light shafts and the "dark boxes" the rooms' walls; both came back (image 24) because the cones were the floor reflection and the boxes were shadows baked into the floor light. Countermeasure: `tools/v7/shot-probe.mjs` renders the same view with candidate groups hidden (devices, replica, route, transparent, reflection); fix only what makes the artefact disappear, and show the before/after shot.
- **L-V7-02 — A validator must report the worst point, not the first.** The collision sweep logged each object once at its first close pass (a warning) and so missed a later overlap (an error) on the same object. Planted faults (`tools/v7/validator-test.mjs`) found it; keep fault-planting tests next to every validator.
- **L-V7-03 — Baked data outlives edits.** Removing geometry does not remove what was baked from it (floor light, shadows). Any layout edit (V6 room removal, scene layoutEdits) now also cleans the baked light under it.

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
