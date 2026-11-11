# Player workflow and unresolved acceptance

Read [STATUS.md](../STATUS.md) and [PLAN-PATHS-2026-11-08.md](../PLAN-PATHS-2026-11-08.md) before executing these commands. This runbook records the existing workflow; documentation/extraction alone does not resume application implementation.

## Existing build/data sequence

1. Read existing COM exports and plan overlays first. Source Office files are opened read-only through the existing PowerPoint script; preserve presentations already open.
2. Recover the per-project contract in the dated plan: flow.json, replica.json, plates/elevators/nodes/flows, plans and evidence overlay under `private/projects/<id>/`.
3. Make only the authorized area/route change. Keep draft process-order and scale caveats until the owner confirms them.
4. Run `node tools/check-project.mjs inj` (or press/eps), `node tools/routes.mjs <id>`, then `node tools/layout-check.mjs <id>` for changed projects.
5. Build with `node tools/build.mjs`; inspect the actual offline result through isolated headless installed Chrome.
6. `node tools/test-projects.mjs private/evidence/<new-run>` checks tabs/flows and saves screenshots. Inspect the images and console; software smoke checks are not GPU quality/performance proof.

## Camera and performance

- Clearance: `test-camera-envelope.mjs`, `test-chase.mjs`; visibility: `test-chase-sight.mjs`. Both need assessment. A clear midpoint does not prove lift entry/exit or whole journeys.
- Inspect the actual smoothed eye and full near plane against projecting structure beyond image boundaries; checking picture extents alone missed a bridge.
- Use `MF.perf` and saved traces. `perf.mjs` and `profile-player.mjs` have different frame pacing; compare matched workloads/pacing. A GPU-process flush is not proof of a JavaScript root cause.
- Run GPU checks one at a time; reuse existing model assets and bakes unless evidence demands rebuilding.

## Outstanding recorded issues

The Nov 8 checkpoint reports three-project contract/route/build smoke checks passed, but Press registration (-9.02 degrees) is questioned because an elevator correspondence may be wrong. Inspect the actual source/overlays before altering rotation. Camera whole-journey visibility and intermittent stalls were not accepted as fixed. Some previous screenshots still needed inspection. Historic Nov 6/7 documents saying Press/EPS were not yet built describe those earlier checkpoints, not the later Nov 8 state.

Do not silently replace the slide-coordinate estimate (0.30 m/unit) with the new CAD millimetre coordinates. Registration, source-version correspondence and actual process semantics require their own evidence and authorization.
