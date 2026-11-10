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
