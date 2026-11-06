# Material Flow Player (local only: company plans, never push)

Interactive full-screen player for the material-flow deck: step by step like slides, with free 2D and 3D exploration.

- Open `dist/Material_Flow_Player.html` (one file, works offline, nothing to install).
- `tools/extract-slide.ps1`: reads a slide through PowerPoint COM into `private/` (shapes, connectors, plan images).
- `node tools/build-flow.mjs`: slide data -> flows (the step order is a DRAFT until the owner confirms it).
- `node tools/build.mjs`: builds the single HTML. three.js comes from Digital Factory's vendored copy.
- `node tools/test-player.mjs <folder>`: drives the built file in headless Chrome and saves screenshots.

`private/` and `dist/` are git-ignored because they hold company plans. This repository has no remote; keep it so.
