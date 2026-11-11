# Material Flow: agent entry point

Read [docs/START_HERE.md](docs/START_HERE.md), then [docs/STATUS.md](docs/STATUS.md). Load only the runbook for the current task. Current owner/session instructions override historical handoff roles and commands.

- This is a local company project. Preserve the no-remote setup; do not push, upload company plans, or stage `private/` or `dist/`. Do not read authentication stores.
- Keep the player workstream separate from CAD extraction. Extraction and documentation do not authorize resuming paused camera, route, Press/EPS or performance changes.
- Preserve input decks/drawings/PDFs, user edits and historical evidence. Never infer process order, machine counts, floor correspondences or measurements from symbol counts.
- Use installed Google Chrome for browser work. Interactive URLs use the owner's mandatory Chrome launcher; tests use headless installed Chrome with a fresh isolated profile. Run GPU checks sequentially. Do not touch personal/corporate test profiles.
- Follow the owner's current Codex/Claude bridge workflow: inspect existing jobs before delegation; one Claude worker across projects; independently verify worker output. Do not revive obsolete account/model assignments from historical handoffs.
- Save new evidence and failures as described in [docs/MAINTENANCE.md](docs/MAINTENANCE.md). A successful export, data validation, visual inspection and business acceptance are separate claims.

## Project skills

| Skill | Use |
|---|---|
| [material-flow-project](.agents/skills/material-flow-project/SKILL.md) | Orient in this project, recover its current workstream, and choose the right existing evidence. |
| [material-flow-cad-extraction](.agents/skills/material-flow-cad-extraction/SKILL.md) | Convert large local CAD inputs into the readable SQLite/Excel package and diagnose NASCA limits. |
| [material-flow-knowledge-maintenance](.agents/skills/material-flow-knowledge-maintenance/SKILL.md) | Maintain this project's history, lessons, runbooks, decisions and handoff records after authorized work. |
| [material-flow-scene-engine](.agents/skills/material-flow-scene-engine/SKILL.md) | **V7 player / scene engine: start here for any player request** (routes to scene editing, directing, engine maintenance; docs/START_HERE.md first section). |
| [material-flow-scene-editing](.agents/skills/material-flow-scene-editing/SKILL.md) | Paths, stops, devices, objects, layout, doors, elevator rides, trolleys, numbers as scene data. |
| [material-flow-directing](.agents/skills/material-flow-directing/SKILL.md) | Camera keys, captions EN / AR / KO, video takes. |
| [material-flow-engine-maintenance](.agents/skills/material-flow-engine-maintenance/SKILL.md) | Engine bugs and format features (data first, engine last). |
