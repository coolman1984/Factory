---
name: material-flow-scene-engine
description: Entry point for any work on the Material Flow V7 player / scene engine - change trolley paths, stops, devices, objects, layout (walls, doors, racks), camera shots, captions, films, numbers, or fix the engine. Routes to the right docs and focused skills. Use for every owner request about the V7.x player.
---

# Material Flow scene engine (V7.x)

Start with [docs/START_HERE.md](../../../docs/START_HERE.md) (first section). The rule: **data first, engine last** - a scene file per
tab (`private/v7/scenes/<tab>.scene.json`) describes everything; owner requests are data edits.

## Route by request
| request | read | skill |
|---|---|---|
| paths, stops, steps, devices, objects, layout, doors, elevator rides, trolleys, numbers | [RECIPES.md](../../../docs/RECIPES.md), [CONTROL_GUIDES](../../../docs/CONTROL_GUIDES/README.md), [SCENE_MANUAL.md](../../../docs/SCENE_MANUAL.md) | [material-flow-scene-editing](../material-flow-scene-editing/SKILL.md) |
| camera shots, captions (EN / AR / KO), films (video takes) | [CONTROL_GUIDES/DIRECTOR.md](../../../docs/CONTROL_GUIDES/DIRECTOR.md) | [material-flow-directing](../material-flow-directing/SKILL.md) |
| an engine bug, a new format feature, the build, tests, docs generation | [ENGINE.md](../../../docs/ENGINE.md), [TROUBLESHOOTING.md](../../../docs/TROUBLESHOOTING.md) | [material-flow-engine-maintenance](../material-flow-engine-maintenance/SKILL.md) |

## Workflow (every request)
read → edit data → `node tools/mf.mjs validate <scene>` → render (`mf shots`, `mf play`) → look at the pictures and check them
against the request → report: what changed, numbers before / after (`mf numbers`, `mf diff`), what you could not do or guessed.

## Rules
- **Working product first** (owner's top rule): build it, run the minimum check that proves it, report; no long test suites unless asked.
- **A change is not done until docs, lessons and the changelog are updated in the same commit.** `node tools/mf.mjs docs-check`
  must pass (the build and the git pre-commit hook run it).
- Company data stays in `private/` and `dist/` (never committed; local repo, no push). NASCA / Office files only through COM.
- Older players in `dist/` and `dist/versions/` are read-only. English in work output.
- Never guess silently: when the docs do not answer, say what you assumed in the report (and fix the docs).
