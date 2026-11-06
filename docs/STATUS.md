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
