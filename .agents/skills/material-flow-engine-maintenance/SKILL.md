---
name: material-flow-engine-maintenance
description: Maintain the Material Flow V7 engine - fix engine bugs, add a scene-format feature, change the build (engine patches on the V6 player), run the test set, keep the generated docs and changelog true. Use only when a request cannot be done as scene data, or the engine itself is wrong.
---

# Engine maintenance

Read [docs/ENGINE.md](../../../docs/ENGINE.md) (modules, build, tests), [docs/LESSONS.md](../../../docs/LESSONS.md) (player section)
and [docs/TROUBLESHOOTING.md](../../../docs/TROUBLESHOOTING.md) first.

1. Prove the request needs the engine (no recipe or field can do it). Record the decision in [docs/DECISIONS.md](../../../docs/DECISIONS.md).
2. Find the module (ENGINE.md table). Player patches are exact-once string replacements in `tools/v7/engine-patches.mjs`; a patch
   whose anchor another patch creates must come after it (or be merged into it). Never edit `dist/` players; build a new file.
3. Format feature: `tools/v7/scene-core.js` (toInternal / fromInternal / validate), the Studio bridge (`fromScene` / `toScene` in
   `tools/v7/studio-core.js`) must keep it, `tools/v7/scene-schema.mjs` row, manual text, a recipe or example if owners will ask for it.
4. Build to a test file: `node tools/build-v7.mjs <stage> --out dist/test/x.html` (prints "syntax: N inline scripts parse").
5. Minimum tests for the change (ENGINE.md table); for anything touching motion: the identity test must stay identical.
6. Same commit: `docs/CHANGELOG.md` (new version entry when a new player file is built), lessons, docs; `node tools/mf.mjs docs-gen`
   then `node tools/mf.mjs docs-check` (the build and the pre-commit hook enforce it). A new version: add the stage to
   `tools/build-v7.mjs` STAGES, set `STAGE` in `tools/v7/mf-commands.mjs`, copy the player to `dist/versions/`.
7. Never use one-off edit scripts that can silently apply nothing; every replacement must fail loudly when it does not match.
