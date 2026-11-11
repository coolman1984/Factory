
# 2026-11-06 - Owner paused lead work; incomplete checkpoint
The chase camera gained a near-plane and actual-eye guard. A ray cast proved that a bridge beyond the source picture edge hid the trolley. The latest midpoint view uses the whole structure footprint and is clear; final full regression was stopped. Camera is not marked complete.
Frame stalls were traced on the real GPU, with no universal cause or fix proven. Press/EPS source slides were exported read-only through PowerPoint COM; their players are not built. Two isolated generic DeepSeek helpers completed and were closed; lead reviewed the files. Owner ordered a stop and full preservation. See PAUSED-2026-11-06.md for evidence, limitations and resume steps. Local only; no push.

## 2026-11-07 - Claude 2040 leadership handoff prepared
Owner requested the full project/data/task transfer to Claude 2040, Opus 5.5 Medium. Created a local package listing source, private exports, evidence, models, backups, commits, archive status, memory commands, owner rules, remaining decisions and exact task order. No implementation or app tests resumed during preparation. Actual leader startup/acknowledgment is a separate gate; preparation alone does not prove takeover.

## 2026-11-09 — CAD readability and durable project knowledge

Recovered the interrupted extraction session, completed native binary-DXF conversion and streaming SQLite/Excel/CSV/JSONL delivery, independently checked full source counts and exported labels, and preserved both original hashes. Source PDF text and native visual QA remain unavailable under the recorded DRM/native-tool limits; the PDF reader was closed at the owner's request. Added agent onboarding, runbooks, architecture contracts, ADRs and project skills without resuming player implementation or pushing anything. Full attempts, working commands, failures, evidence and open limits: [case history](history/2026-11-09-cad-extraction.md).


## 2026-11-10 — V6 direct review and CPU fixes

Completed the authorized player review and local fixes with original V4 preserved. Generation/build and expanded static sweep pass; 13 regression tests and 2,469 CPU candidate sight samples pass. GPU performance, actual smoothed camera/flicker and owner route/slide acceptance are explicitly pending; no browser or git was run. See the [private delegate report](../private/v6/sol-answer.md), `tools/v6-review-test.mjs`, `tools/v6-cpu-sight.mjs` and `private/v6/generation-report.json`.

## 2026-11-11 — V7.1 Stage 1: the scene file drives the player

Owner goal: a data-driven scene engine built in stages (V7.1 to V7.6), the engine frozen, every scene described by one scene file that the owner (on screen) and AI agents (by editing data) change. Stage 1 delivered: scene format `mf-scene` v1 (metres, seconds, degrees; stable ids; routes `stay`/`points`/`auto`/`elevator`; per-step speed and wait; layout edits), `tools/v7/scene-core.js` shared by the player and `tools/mf-validate.mjs`, the 10 owner paths converted to `private/v7/scenes/*.scene.json` (exact round trip), scene manager in the player (open / save / save as / download / drop, undo / redo, autosave), agent manual `docs/SCENE_MANUAL.md` and a generated private layout reference. Proofs: `tools/v7/identity-test.mjs` (V6 and V7.1 identical on all 10 paths: timeline, pose every 0.1 s, RFID reads and scans), `tools/v7/validator-test.mjs` (16 planted faults caught), `tools/v7/stage1-test.mjs` (a new path made by data only plays; undo/redo; refused bad scene; autosave; baked file), `tools/v7/gates-test.mjs` (24 RFID gates; the old 8-gate shader limit is now 64).
Owner image 24 (same complaint as image 11 for V6, which V6 had not really fixed): the two dark boxes beside Kitting were the removed rooms' shadows baked into the Blender floor light, and the pale cones were the planar floor reflection mirroring rack posts (V6 had removed the DFAtmos light shafts, a different effect). V7.1 repaints the floor light under removed or moved layout objects at load and turns the floor reflection off by default (`?reflect=1` brings it back).
A prototype Studio (camera pad, editor, director) written before the owner's staged plan arrived is kept in `tools/v7/studio-*.js` for later stages and is not part of V7.1.

## Player history, V1 to V7.7.1 (summary)

| version | date | what changed and why |
|---|---|---|
| V1 - V3 | 2026-11 | first offline players from the slides: flows, 2D / 3D rise, guided camera, elevator glide (built on another PC) |
| V4 | 2026-11-10 | the owner's approved look ("do not change the graphic"); base of everything after |
| V5 | 2026-11-10 | INJ 1 true path; PCs, auto RFID gates (radar waves), handheld scanners; roof removed; camera sight line |
| V6 | 2026-11-10 | the owner's 10 paths on 4 tabs; big icons; flicker fixes; Sol 6.1 High review |
| V7.1 | 2026-11-11 | scene files drive the player (data, not code); validator; manual; INJ 2 short route; floor-light repairs |
| V7.6 | 2026-11-11 | Studio: camera pad, editor, paths and steps, objects, director (captions EN / AR / KO, MP4 takes), numbers, several trolleys |
| V7.7 | 2026-11-11 | camera never hides the trolley; GPU warm-up; video take verified |
| V7.7.1 | 2026-11-11 | preparing screen; agent CLI; documentation system; Phase A review (Codex SOL 6.1 High) |
Details per version: [CHANGELOG.md](CHANGELOG.md); decisions: [DECISIONS.md](DECISIONS.md).


## 2026-11-11 — V7 scene engine Phase A direct review

Reviewed the requested V7 engine, scene bridge, Studio, CLI, build and tests; implemented bounded fixes and regression coverage without git, bridge or agents. See [the review report](REVIEW_REPORT.md) for findings, exact test receipts, historical-player preservation and limits. Functional identity/import/editor tests pass; startup stutter reproduces in both the untouched baseline and candidate and remains unresolved. Recorded video encoding and completed file download are separate claims. CAD extraction was not changed.
