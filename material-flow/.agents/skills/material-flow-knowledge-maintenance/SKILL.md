---
name: material-flow-knowledge-maintenance
description: Create or maintain Material Flow's project documentation, skills, investigation history, lessons, runbooks and decision records from observed work so later agents can continue without repeating failed attempts.
---

Read [maintenance rules](../../../docs/MAINTENANCE.md), [entry point](../../../docs/START_HERE.md), [current status](../../../docs/STATUS.md), then the relevant existing case/lesson. Preserve dated pauses and source history; current owner instructions win over old assignments.

Choose the smallest durable home: STATUS for current workstream state; HISTORY for the dated index; `docs/history/` for substantial chronology; LESSONS for reusable decision changes; runbooks for proven commands; architecture for authority/schema; ADRs for expensive design choices; `.agents/skills/` for task routing and non-obvious invariants. Link canonical detail instead of copying it everywhere.

Record concrete symptoms, attempted actions, proven outcomes, actual evidence and remaining limits. Distinguish failed experiment, hypothesis, workaround and established cause. Never fabricate a successful test, overwrite old findings, copy secrets/raw conversations or promote a machine-specific failure into a universal rule. Preserve the distinction between data correctness, native-open, visual inspection and owner acceptance.

Use the [session](../../../docs/templates/WORK_SESSION.md), [lesson](../../../docs/templates/LESSON.md) or [ADR](../../../docs/templates/ADR.md) template only as needed. Check relative links and skill frontmatter with the project checker and installed skill validator. Documentation maintenance does not authorize code changes, global installs, scheduled work, commit/push or resuming a paused player task.
