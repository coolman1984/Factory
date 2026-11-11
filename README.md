# Material Flow Player (local only: company plans, never push)

Interactive full-screen player for the material-flow deck: step by step like slides, with free 2D and 3D exploration.

- Open `dist/Material_Flow_Player.html` (one file, works offline, nothing to install).
- `tools/extract-slide.ps1`: reads a slide through PowerPoint COM into `private/` (shapes, connectors, plan images).
- `node tools/build-flow.mjs`: slide data -> flows (the step order is a DRAFT until the owner confirms it).
- `node tools/build.mjs`: builds the single HTML. three.js comes from Digital Factory's vendored copy.
- `node tools/test-player.mjs <folder>`: drives the built file in headless Chrome and saves screenshots.

`private/` and `dist/` are git-ignored because they hold company plans. This repository has no remote; keep it so.

## The replica

- `tools/extract-plan.py`: OpenCV analysis of the plan images (detections drawn in `private/debug_*.png`).
- `tools/takeoff.mjs`: the take-off, every element read from the plans; `tools/check-takeoff.py` draws it back on them as proof.
- `tools/routes.mjs`: vehicle routes from the 3D-Modeling repo's `findRoute`.
- `src/replica.js`: the 3D factory (instanced) and the clean 2D plan. Atmosphere comes from Digital Factory's `DFAtmos`.
- `node tools/shot-high.mjs <folder>`: slow look at the full-quality pipeline.
- Scale: 1 slide point = 0.30 m, cross-checked on truck, column grid and machine length. It is an estimate, not a survey.

## Project knowledge and agent onboarding

Start with [docs/START_HERE.md](docs/START_HERE.md), [docs/STATUS.md](docs/STATUS.md) and [AGENTS.md](AGENTS.md). The knowledge base includes the project map, proven runbooks, decisions, investigation history, lessons and repository-scoped skills. The local CAD export has its own `dist/SEEG_Y26_AI_Package/START_HERE.md`; extraction does not resume paused player implementation.
