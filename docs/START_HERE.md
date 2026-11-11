# Material Flow knowledge base

## The scene engine (player V7) - start here

**What this is.** An offline 3D player (one HTML file) that shows how trolleys move through the factory (four tabs: `inj1`, `inj2`,
`eps`, `press`), with a Studio to edit scenes and direct films. Every scene is **data**: one scene file per tab
(`private/v7/scenes/<tab>.scene.json`, metres, seconds, degrees). The engine code is frozen: **data first, engine last**
([ENGINE.md](ENGINE.md)).

**Folder map.**
| folder / file | what |
|---|---|
| `tools/mf.mjs` | the agent CLI ([CLI.md](CLI.md)) |
| `tools/build-v7.mjs`, `tools/v7/` | the engine build and its modules ([ENGINE.md](ENGINE.md)) |
| `private/v7/scenes/` | the owner's scenes (company data, never committed) |
| `docs/examples/` | small sample scenes used by the recipes |
| `dist/Material_Flow_Player_v<version>.html` | built players (older versions are read-only) |
| `docs/` | this documentation; `.agents/skills/` the agent skills |

**First 10 minutes.**
1. Read this section, then [RECIPES.md](RECIPES.md) (one recipe per kind of owner request) and [SCENE_MANUAL.md](SCENE_MANUAL.md) (every field).
2. `node tools/mf.mjs help` - the commands.
3. `node tools/mf.mjs layout-ref` - writes `private/v7/LAYOUT_REFERENCE.md` (floors, elevators, stop / device ids, wall / rack ids).
4. `node tools/mf.mjs validate private/v7/scenes/inj1.scene.json` - see a valid scene.
5. Pick the recipe for the request; the control guides ([CONTROL_GUIDES/README.md](CONTROL_GUIDES/README.md)) explain each area.

**The commands that matter.**
```
node tools/mf.mjs validate <scene>        # after every edit
node tools/mf.mjs shots <scene>           # look at your work (overview, every stop, every step)
node tools/mf.mjs play <scene> --path P   # play it in the real player
node tools/mf.mjs numbers <scene>         # distance, time, trips per shift
node tools/mf.mjs bake                    # build the player with the scenes
node tools/mf.mjs docs-check              # before every commit (the hook runs it)
```

**Workflow.** read → edit data → validate → render (`mf shots`, `mf play`) → self-review the pictures against the request →
report (what changed, numbers before / after, what you could not do). A change is not done until docs, lessons and the changelog
are updated in the same commit. Problems: [TROUBLESHOOTING.md](TROUBLESHOOTING.md); open issues: [OPEN_ISSUES.md](OPEN_ISSUES.md);
why things are as they are: [DECISIONS.md](DECISIONS.md), [LESSONS.md](LESSONS.md), [HISTORY.md](HISTORY.md), [CHANGELOG.md](CHANGELOG.md).

---

## Whole project (player history and CAD extraction)
This project has two related workstreams: an offline material-flow player built from slide-derived plans, and a CAD-to-SQLite/Excel extraction package. Their coordinate systems and acceptance states are different. Read the current status before changing either.

## Start in five minutes

1. Read [STATUS.md](STATUS.md). The latest dated workstream entry takes precedence over older sections; historical ownership/pause instructions are evidence, not a new assignment.
2. Read [PROJECT_MAP.md](PROJECT_MAP.md) to locate the source, tools, private evidence and generated artifacts.
3. Select one task below. Read its runbook and relevant lesson; do not load the entire archive.
4. Inspect the named files and saved evidence before changing anything. Check current git status and active bridge jobs.
5. Complete authorized work, verify the result, then update history/status using [MAINTENANCE.md](MAINTENANCE.md).

| Task | Read next |
|---|---|
| Use the readable CAD export | `dist/SEEG_Y26_AI_Package/START_HERE.md`, then its `verification.json` and `pdf_status.json` |
| Rebuild CAD extraction | [runbooks/CAD_EXTRACTION.md](runbooks/CAD_EXTRACTION.md), [architecture/CAD_DATA_CONTRACT.md](architecture/CAD_DATA_CONTRACT.md) |
| Understand the complete extraction investigation | [history/2026-11-09-cad-extraction.md](history/2026-11-09-cad-extraction.md), [LESSONS.md](LESSONS.md) |
| Troubleshoot protected PDF/Office output | [runbooks/NASCA_AND_NATIVE_OFFICE.md](runbooks/NASCA_AND_NATIVE_OFFICE.md) |
| Validate/deliver a package | [runbooks/VALIDATION_AND_DELIVERY.md](runbooks/VALIDATION_AND_DELIVERY.md) |
| Resume player work when authorized | [PLAN-PATHS-2026-11-08.md](PLAN-PATHS-2026-11-08.md), [runbooks/PLAYER_WORKFLOW.md](runbooks/PLAYER_WORKFLOW.md), then relevant pause records |
| Change an architectural decision | [decisions/INDEX.md](decisions/INDEX.md) |
| Record new experience or hand off | [MAINTENANCE.md](MAINTENANCE.md), [templates/WORK_SESSION.md](templates/WORK_SESSION.md) |
| Find a reusable project skill | [skills/INDEX.md](skills/INDEX.md) |

## Evidence vocabulary

- **Verified:** a named command/artifact demonstrated a specific claim on a specific revision.
- **Observed failure:** preserve the exact symptom and scope; it is not automatically the root cause.
- **Hypothesis:** an explanation not yet demonstrated; never present it as a fix.
- **Historical result:** a previous agent's recorded check, not a fresh check on current source.
- **Open:** unresolved work, unavailable capability, or owner acceptance still needed.

The CAD data checks passed in this session. Native Excel opened/exported the workbook, but NASCA wrapped the preview PDFs; native visual inspection remains unavailable. The supplied PDF rendered in Foxit but was not text-extracted or reconciled with the DWG. It was closed on the owner's request. Application camera/performance acceptance was not resumed.
