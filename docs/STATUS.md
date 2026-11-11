# Current workstreams — 2026-11-09

- **CAD readable package:** completed data extraction and independent validation; local output at `dist/SEEG_Y26_AI_Package/`. All source/DB counts and exported labels checked; original hashes unchanged. Native Excel opened the workbook. Its preview PDFs are NASCA protected, so native visual QA remains unavailable. Source PDF text/reconciliation is not extracted; its Foxit window was closed at the owner's request. See [case/evidence](history/2026-11-09-cad-extraction.md).
- **Documentation/skills:** project entry point, map, runbooks, decisions, detailed case history and reusable skills added. Read [START_HERE.md](START_HERE.md); maintain them using [MAINTENANCE.md](MAINTENANCE.md).
- **Player implementation:** not resumed by this extraction/documentation task. Latest application checkpoint is the Nov 8 three-project plan/build record below; Press alignment, screenshots, camera visibility and performance acceptance remain open. No fresh player tests were run here.

## Preserved application history and checkpoints

# Material Flow Player: status and open work (2026-11-06)

Read first: `D:\WORK\Software Development\GitHub\HERDR\docs\PLAYBOOK-INTERACTIVE-FACTORY.md`.

**Owner's decisions:** direction approved; speed and routes approved ("this good"); this look is the agreed template. Next: fix the chase camera and the stalls, then build Press and EPS the same way, then more projects.

## Done
Injection (slide 1): three flows, replica, glass player, square direct routes, 8 speeds, roof, floor reflection, HD models, baked light. Checks at commit: layout 0 clashes and 0 diagonals, 27 of 27 tests, about 84 fps on High.

## Next, in order
1. **Chase camera:** "Ride with the lot" passes through racks during the lift. Keep it above or outside solids. Own: `src/player.js`.
2. **Stalls:** rare 0.4 to 1.2 s frames. Use `MF.perf`, `tools/perf.mjs`. Some are CPU in the rise (about t=4), some show little CPU: cause not proven.
3. **Press (slide 2) and EPS (slide 3):** extract with `tools/extract-slide.ps1` (now slide 1 only: add a slide argument), take-off, flows, same pipeline. The tabs exist but are disabled. Note both floors and elevators (Elev 3, Elev 7), Dry Room for EPS.
4. **Polish:** floor reflection is subtle; more clutter and detail towards the owner's reference images.
5. **Owner still owes:** the real Injection step order and Manual or Auto per move (`DRAFT ORDER` tag stays until then); real dimensions to lock the scale; whether thinned racks are acceptable; better plans (CAD or PDF) if available.

## How to verify
`node tools/layout-check.mjs`, `node tools/perf.mjs high 40`, `node tools/shots-gpu.mjs <dir>` then look at the images, `node tools/test-player.mjs <dir> low`. Open `dist/Material_Flow_Player.html` by double-click.

## Rules
Local only: no remote; never commit `private/` or `dist/`; no company data in the public HERDR repository or chats. Office files through COM always. Short, simple reports to the owner.

## PAUSED by owner - latest instruction, 2026-11-06
Implementation and tests stopped. Read [the full saved handoff](PAUSED-2026-11-06.md) before resuming. Camera changes exist but final acceptance is incomplete. Stalls are measured, not fixed. Press/EPS slides were extracted through COM; their players are not built. Polish has not started. Do not resume without the owner asking.

A complete CRC-verified local backup of code, private exports/evidence, built HTML and helper output is at `.herdr/checkpoints/20261106-170416/before-save.zip`. Test limits and exact resume steps are in the handoff. No push occurred.

## PAUSED again - 2026-11-08 (owner moved the team to ExcelApp)
New deck `Trolley Paths -261104` replaces the Injection flows; Press and EPS projects built. Plan and contract: [PLAN-PATHS-2026-11-08.md](PLAN-PATHS-2026-11-08.md).
Done and verified by the lead: `node tools/check-project.mjs inj|press|eps` OK; `node tools/routes.mjs <id>` then `node tools/layout-check.mjs <id>` 0 diagonals, 0 clashes for all three; `node tools/build.mjs` 6.7 MB; `node tools/test-projects.mjs private/evidence/projects2` ALL PROJECTS OK (tabs Injection/Press/EPS, no page errors).
Open, in order:
1. **Press -9 degree rotation (doubt).** The review fitted E2-1F to E2-2F with both lifts and rotated 1F by -9.02 degrees (scale 1.4803). The owner's slide shows both floors unrotated, so one elevator correspondence is probably wrong (check Elev 7: 1F node 95 west edge vs 2F node 9070; Elev 3&4: 139 vs 146). Fix in `tools/press-takeoff.mjs`, then rerun routes/check/layout/build/test-projects.
2. Look at every shot in `private/evidence/projects2` (lift steps, Press overview: routes leave the frame).
3. Re-run the older Injection tests (`test-player.mjs`, chase sight-line, `shots-gpu.mjs`) against the new flows; chase camera acceptance still open.
4. Owner report: assumptions 1-4 in the plan, combined Elev 3&4, one direction per two-way link, masks that blank deck labels.
Private data backup: `.herdr/checkpoints/20261108-paths/private-paths.zip`.

## Latest owner instruction - 2026-11-07
Owner requested transfer of all local data, memory and remaining tasks to Claude account 2040, Opus 5.5 Medium, as project LEAD. Full package: [LEAD-TRANSFER-2026-11-07.md](LEAD-TRANSFER-2026-11-07.md). The previous pause remains part of the history; this newer instruction authorizes the leadership handoff. Actual acceptance must be recorded by the receiving leader. Codex will not run implementation/tests alongside it.


## PAUSED by owner - 2026-11-07
The owner stopped the project again after the Claude 2040 takeover and asked to save and wait for orders. Read [PAUSED-2026-11-07.md](PAUSED-2026-11-07.md). Camera is still NOT accepted: clearance passes, but a new whole-journey sight-line test failed (lift exit and some ground moments). Nothing else was started. Do not resume until the owner orders.

## V5 - 2026-11-10 (owner: INJ 1 true trolley path, PCs, RFID)
Built by `node tools/build-v5.mjs` from the owner's approved `dist/Material_Flow_Player_v4.html` (built on another PC) into `dist/Material_Flow_Player_v5.html` (copy in `dist/versions/`). V4 look kept; steel roof removed in all projects (owner).
- INJ 1 path (owner's order): Item Slip -> Final Scan -> manual RFID scan -> Inj. W/H -> TO Mapping / GI -> Kitting (AGV) -> Main Line (AGV). Data: `tools/v5/inj1-data.mjs` from `Trolley Paths -261110-Update2.pptx` slide 1 (COM, `private/v5/s1`), transform X=1.14369x+0.26, Y=2.18066y-91.62.
- Devices (`tools/v5/devices.js`): black desktop PCs at every PC symbol, auto RFID gates (ceiling antennas on posts, radar-wave read zone, green "RFID read"), manual handheld scanners (lift, beam, confirm). Astra 6 High gave the design/perf second opinion.
- Checks: `node tools/v5-check.mjs` OK (min trolley gap 0.37 m); camera `node tools/test-camera-v5.mjs dist/Material_Flow_Player_v5.html`: chase PASS 0% occluded at 1x/3x, guided FAIL ~10% of samples occluded (open); perf `node tools/perf-file.mjs dist/Material_Flow_Player_v5.html inj1 1 40`: 58.5 fps (V4 50.6), 3x 56.8 fps, ~2.5% frames over 17 ms (open).
- Found: V4's old perf tool ran uncapped and produced fake multi-second stalls; capped numbers are the real ones.
- Open: guided-camera occlusion, last 2-3% missed frames, Sol 6.1 review, owner's confirmation of step 5 (empty return) and the INJ headcount (19 vs 20).


## V6 local review — 2026-11-10

Owner-authorized direct Codex review/fixes completed without git, bridge, agents or browsers. V4 remains read-only; `tools/build-v6.mjs` builds V6 with deterministic exactly-once patches. `v6-check.mjs` OK, 13 CPU regressions pass, and the actual-replica CPU sight audit selects clear views in all 2,469 samples across 10 configured paths. Fixed plan overlap, transparency depth writes, device projection/allocation/colour-upload issues, governor hunting, floor-aware camera sight selection, and stationary route-bound manual scans. Overall acceptance remains open: lead must run GPU/FPS, rendered camera and flicker checks; reconcile 10 versus requested 11 paths, 14 inactive scanner symbols, large stop snaps and INJ 2 replica-forced detours. Full findings, limits and exact browser commands: [delegate report](../private/v6/sol-answer.md). CAD workstream unchanged.

V6 handoff documentation check returned exit 1 for the separate CAD evidence error "Native Excel receipt belongs to a different workbook". No Markdown/link errors were listed, and no CAD artifacts were changed. Receipt: `private/v6/docs-check-result.json`.

## V6 - 2026-11-11 (owner: all processes; Sol 6.1 High reviewed and fixed, lead verified)
`node tools/v6/make.mjs` (owner's 10 paths: INJ 1 x2, INJ 2 x2, EPS x4, Press x2, routed on the V4 replica with `tools/v6/router.mjs`; edits in `tools/v6/edits.mjs`), then `node tools/build-v6.mjs` -> `dist/Material_Flow_Player_v6.html` (copy in `dist/versions/`, sha256 f850701e5c47da04...).
- Owner fixes: flicker sources removed (floor items below the floor layers, duplicate plan layer, depth-writing beacon, chips one frame late, governor resolution pops); light-shaft cones and the two dark rooms beside Kitting removed; PCs and scanners 2.4x (big icons); manual scans now stop the trolley.
- Verified by the lead: `tools/v6-check.mjs` OK (min gap 0.17 m); `tools/v6-review-test.mjs` 13 PASS; all tabs and paths render with no page/GL error; real GPU 1080p: 59.3-59.8 fps at 0.5x-3x on every tab, 0.6-2.4% frames over 17 ms (V4: 50.6 fps, 15%).
- Open: guided camera 1.2-3.9% of samples occluded (transient: intro fly-in, fast corners), chase 0-0.7%; INJ 2 routes detour ~380 m because the CAD replica has no opening where the owner's slide line crosses (walls x=540/567 near y 556-571, vestibule stubs suggest a door) - needs the owner's confirmation before opening it; 14 slide RFID points lie on no configured path (listed in Sol's answer, private/v6/sol-answer.md).

## V7.1 - 2026-11-11 (owner: Stage 1 of the scene engine; image 24, 27, 28 fixes)

ode tools/v7/export-scenes.mjs (V6 data -> `private/v7/scenes/*.scene.json`; INJ 2 then edited as data), then `node tools/build-v7.mjs 7.1` -> `dist/Material_Flow_Player_v7.1.html` (copy in `dist/versions/`, sha256 d3d07bc9812b6e75...). V6 and earlier untouched.
- Scene file `mf-scene` v1 drives the player: `tools/v7/scene-core.js` (convert, auto-route, validate; same file in the player and in `tools/mf-validate.mjs`), `tools/v7/preload-scene.js`, scene manager (rail: Scene file - open / save / save as / download / drop a file, undo / redo, autosave, validation). Agent manual `docs/SCENE_MANUAL.md`; layout reference `node tools/v7/layout-reference.mjs` -> `private/v7/LAYOUT_REFERENCE.md`.
- Engine additions: per-step speed, rebuildable flows / labels / devices, tagged replica instances, RFID gates up to 64 per tab (was 8).
- Owner fixes: image 24 - dark boxes beside Kitting were the removed rooms' shadows baked in the floor light (now repainted at load, also under any later layout edit); pale cones were the planar floor reflection of rack posts (reflection off by default, `?reflect=1`). Image 27 - INJ 2 uses the owner's short route through the doorway at x = 170 m (`wall:77` moved 0.6 m north to give 2.2 m; the slide RFID mark in the doorway is now a scan stop): To Elev 5 304 -> 37 m, Umbrella 337 -> 68 m. Image 28 - INJ 2 2F floor light composed from its own bake + the Press 2F bake under the area V6 added (no more black bands).
- Verified: `tools/v7/identity-test.mjs` (engine plays the original V6 scenes identically, all 10 paths), `tools/v7/validator-test.mjs` 16/16 planted faults caught, `tools/v7/stage1-test.mjs` all pass (new path by data only, undo / redo, refused bad scene, autosave, baked file), `tools/v7/gates-test.mjs` (24 gates), all 4 scenes validate with 0 errors and 0 warnings.
- Open: guided camera still loses the trolley in 0.3-6.9% of 3x samples (catch-up added; worst on elevator paths); frame-rate bursts in the first ~10 s of some runs not yet explained (owner: optimise later); the direct re-save to an opened file needs the owner's click test (API present, Chrome treats the local file as secure); prototype Studio files `tools/v7/studio-*.js` are for later stages, not in V7.1.

## V7.6 - 2026-11-11 (owner: finish the full engine in one shot; stages 2-6 together)
`node tools/build-v7.mjs 7.6` -> `dist/Material_Flow_Player_v7.6.html` (sha256 5c197d99b58cb32c...). Scene file manager + Studio on top of V7.1: camera pad (orbit / move / zoom / height sticks, lens, speed, smoothing, presets, 6 saved shots, orbit-the-trolley), Scene Studio editor (Objects: add / move / turn / scale / delete PCs, gates, scanners, stops, 11 object types incl. trolley, replica racks / walls / machines; Paths: drag corners and legs, add / remove corners, auto-route, draw, collision marks; Steps: reorder, add, delete, elevator rides, text, mode, wait, speed, camera distance, reverse, several trolleys), Director (camera keys with easing, trolley-locked keys, record camera moves, captions EN / AR / KO, timeline lanes, draggable step markers, video takes recorded as MP4 when Chrome supports it, else WebM), Numbers (distance, time, trips per shift, before / after against the built-in scene or a file, live congestion). Every edit is written to the scene file (autosave + Save / Download).
- Data-only owner fixes: INJ 2 Main Line at the corner (image 29); EPS path 3 TO -> Main Line straight west through two doorways (new layout edit `door`, image 30).
- Minimum test: `node tools/v7/smoke-76.mjs` (Studio edits land in the scene file and validate, director camera, fleet, Arabic caption, numbers, undo / redo, no page errors) PASS.
- Not checked: recording a full video take, drag interactions by mouse (driven through the API in the test), frame rate.

- 2026-11-11 update (owner image 31): Straighten (S / Shift+S / toolbar), L shape (L), auto-route step/path (R / Shift+R), stop moves auto-straighten nearby legs; full keyboard map (F1, toolbar Keys) with Alt+1..6 tabs, B draw, N stop, P place again, +/- resize, F focus, O ortho, G snap, J camera recording, C caption, Shift+K trolley key, PageUp/Down steps; agent skill `.agents/skills/material-flow-scene-engine`. Minimum tests: `tools/v7/smoke-76.mjs` and real-input `tools/v7/mouse-test.mjs` PASS.

- 2026-11-11 UI round (owner: find visual bugs, easier UI, more functions): fixed wrong start message, cut-off pad buttons (modes on their own row, small-screen layout), heavy timeline step markers, false before/after deltas in Numbers (both sides now use the same calculation), cut-off Mode box, stop diamonds and gizmo cluttering Director/Numbers. Added right-click menu (objects: fly to, duplicate, straighten, add step, turn, size, delete; floor: place stop / crate / last object, fly here, camera key), object search, Photo (PNG of the view), play from a step, pad minimise, one-line hint of what the mouse does. Checks: `tools/v7/tour.mjs` screenshots, `ui-check.mjs`, `mouse-test.mjs`, `smoke-76.mjs` PASS.

## V7.7 - 2026-11-11 (owner: Step 0 stabilise)
`node tools/build-v7.mjs 7.7` -> `dist/Material_Flow_Player_v7.7.html`. Engine: guided/follow camera rescue after the springs (box model + exact floor/slab ray + exact replica ray, budget 6 checks; tilts, turns, comes closer, finally looks down the shaft at the trolley); full-size GPU warm-up of the rise before the first frame.
- Camera (`tools/test-camera-v5.mjs`, guided, 3x, alone on the GPU): 9 of 10 paths 0.0% hidden (was 0.3-6.9%); Press path 2: 1 sample of 1198 (0.1%) at t=169 s when the 2nd floor glides in before Elev 3&4.
- Frame rate 1080p (`tools/perf-file.mjs`): steady state 59.3-59.9 fps on all 4 tabs at 1x and 3x. OPEN: in some fresh browser sessions the opening rise (first ~7 s) runs at 7-10 fps, then recovers; V6 does the same; cause not found (cold start, GPU-side; CPU per frame 1-2 ms).
- Video: one full take recorded end to end (`tools/v7/take-test.mjs`): H.264 MP4 (video/mp4;codecs=avc1.640029), 57 MB for a 76 s path at 3x (24 s), plays back in Chrome.
- Tests: smoke, mouse, ui-check, tour all PASS.
