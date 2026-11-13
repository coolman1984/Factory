# Project skills

Skills are repository-scoped under `.agents/skills/`. AGENTS.md routes agents to them; they do not alter global Codex/Claude settings, permissions, model choice or worker state.

| Skill | Trigger / boundary |
|---|---|
| [material-flow-project](../../.agents/skills/material-flow-project/SKILL.md) | Enter/recover Material Flow; choose player versus CAD/documentation work. Does not resume paused implementation. |
| [material-flow-cad-extraction](../../.agents/skills/material-flow-cad-extraction/SKILL.md) | Reuse/rebuild the local large-DWG readable package and handle NASCA evidence limits. Not a general CAD-to-player registration tool. |
| [material-flow-knowledge-maintenance](../../.agents/skills/material-flow-knowledge-maintenance/SKILL.md) | Save/organize project lessons, history, decisions and runbooks based on actual work. Not an automatic background task. |

After editing a skill, run the installed skill-creator `quick_validate.py` against its directory, then the project documentation checker. Syntax validation does not establish that a procedure succeeded on a new drawing or host.

Scene engine (V7) skills:

| Skill | Trigger / boundary |
|---|---|
| [material-flow-scene-engine](../../.agents/skills/material-flow-scene-engine/SKILL.md) | Entry point for any V7 player request; routes to the three below and to the docs. |
| [material-flow-scene-editing](../../.agents/skills/material-flow-scene-editing/SKILL.md) | Paths, steps, stops, devices, objects, layout edits, doors, elevator rides, trolleys, numbers - as scene data. |
| [material-flow-directing](../../.agents/skills/material-flow-directing/SKILL.md) | Camera keys, captions EN / AR / KO, video takes. |
| [material-flow-engine-maintenance](../../.agents/skills/material-flow-engine-maintenance/SKILL.md) | Engine bugs, format features, build, tests, generated docs. Only when data cannot do it. |
