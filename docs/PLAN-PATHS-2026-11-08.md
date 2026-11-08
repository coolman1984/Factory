# Plan: correct trolley paths and the Press and EPS players (2026-11-08)

## Goal
The owner's new deck `Trolley Paths -261104.pptx` holds the correct trolley paths. They **replace** the old Injection flows
completely, and they define the Press and EPS flows. Outcome the owner sees: one player file with three working tabs
(Injection, Press, EPS), each showing its own floor replica and its own correct flows.

## Team (owner's order)
1. Three Codex GPT-6.1-Terra medium lanes, one per area, all at once: `inj`, `press`, `eps`.
2. Codex GPT-6.1-Sol medium reviews all three, fixes defects, makes them consistent.
3. The lead (Claude) checks the review, generalises the player to many projects, builds, tests, and commits.

## Sources (all local, git-ignored)
| What | Where | Note |
|---|---|---|
| New deck shapes, connectors, text (COM) | `private/paths/s{1..5}/slideN.json` | from `tools/extract-slide.ps1` |
| Connector endpoints, steps, nearest marks | `private/paths/connectors-s{2,3,4}.txt` | from `tools/read-paths.mjs` |
| Picture geometry, both decks (COM) | `private/paths/pictures-new.json`, `pictures-old.json` | from `tools/picture-info.ps1` |
| New slide 2 to old slide 1 mapping (exact for E2) | `tools/register-paths.mjs`, `private/paths/register-s2.txt` | shared source picture |
| Owner's screenshots of slides 1-5 (plain PNG) | `private/paths/shots/{overview,inj,press,eps,headcount}.png` | the only plain images of the new deck |
| Plain plan images from 6 Nov | `private/plans/` (inj), `private/press/plans/`, `private/eps/plans/` | from the old deck |

PowerPoint exports on this PC are now NASCA-wrapped. Never decrypt them. Read facts through COM (the scripts above, read-only),
and look at the owner's screenshots.

## Legend of the new deck
Oval = GR, square = TO Mapping. Green fill = Auto, cyan fill = Manual. Green line = AGV move (`mode: "auto"`);
blue line = manual trolley move (`mode: "flow"`). Numbered tags = step order. Navy boxes = areas and destinations.
Yellow arrow = leaves the area (To LCM, To MAIN).

## Contract (every lane writes exactly this)
Folder `private/projects/<id>/` with:
- `flow.json`: `{ id, title, slide:{title,w,h}, plates, elevators, nodes, flows }`
  - `plates.<name> = { label, dx, dz, lift, box:[x0,y0,x1,y1], pics:[{file,x,y,w,h}] }`. Project frame units: **1 unit = 0.30 m**
    on every plate (rescale a picture if its slide scale differs). `lift` 0 = ground floor, 1 = second floor; `dx`,`dz` place
    an upper plate beside the ground plate in the player, as in the Injection data today.
  - `elevators: [{ label, low:[x,y], lowPlate, high:[x,y], highPlate }]`
  - `nodes.<id> = { id, x, y, plate, kind: gr|mapping|dest|area|lift, mode: auto|manual|none, fill, text }`; id = the COM shape id.
  - `flows: [{ id, name, color, steps:[{ node, title, what, path, mode: flow|auto, view: 2d|3d, dist, lift }] }]`.
    First step `path: null`. Other steps: an axis-aligned polyline `[[x,y],...]` that ends at its node, or `"lift"` with
    `lift: true` and `elevator: <label>`. The step after a lift starts at the elevator's `high` point.
- `replica.json`: same keys as today's `private/replica.json` (`walls, racks, columns, machines, trucks, conveyors, rooms,
  lifts, decks, crop, scale: 0.3`), every item with `plate`, in the project frame.
- `plans/<file>.png`: plain plan image per plate picture, drawn axis-aligned as displayed.
- `evidence/overlay.png`: the replica, nodes and paths drawn over the plans (proof of the take-off).
Check: `node tools/check-project.mjs <id>` must print `OK`.

## Lanes
| Lane | Spec | Owns |
|---|---|---|
| inj | `private/tasks/mf-inj.md` | `tools/inj-paths.mjs`, `private/projects/inj/` |
| press | `private/tasks/mf-press.md` | `tools/press-takeoff.mjs`, `private/projects/press/` |
| eps | `private/tasks/mf-eps.md` | `tools/eps-takeoff.mjs`, `private/projects/eps/` |
The lead owns everything else (`src/`, `tools/build.mjs`, `tools/routes.mjs`, the tests). No lane runs git.

## Lead integration (after review)
- `src/player.js`, `src/replica.js`: plates and `plateOf` from data (`box`), no hardcoded `553/303`; project tabs from the
  project list; the elevator list replaces the single elevator.
- `tools/routes.mjs`: takes a project id; doors and fixes stay in the Injection part.
- `tools/build.mjs`: embeds all projects; the baked light is optional per plate.
- Checks: `layout-check`, route self-check, `test-player`, GPU screenshots of each tab.

## Assumptions to confirm with the owner
1. Injection Auto flow: GR Auto -> 1 Inj. W/H -> 2 TO Mapping -> 3 Kitting (AGV).
2. Injection Manual flow: from Elev 5 -> GR Manual -> 1 Umbrella (AGV) -> 2 TO Mapping -> 3 Kitting (AGV).
3. The green link GR Auto <-> Umbrella (arrows both ends, no number) is shown as its own AGV flow, Umbrella -> GR Auto.
4. Press: the step-1 line entering Press W/H from the west on E2-2F comes from Elev 7 (2F).
