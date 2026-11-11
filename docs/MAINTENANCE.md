# Maintaining project memory

The goal is that the next agent can act without replaying conversations or repeating failed experiments. Keep this system factual, linked and small enough to navigate. Current owner instructions and actual files take precedence over old handoff roles.

## At the start of authorized work

Read AGENTS.md, START_HERE and STATUS. Recover the relevant prior case and real artifacts. Check git status and existing bridge jobs; preserve unrelated changes. Choose one workstream. Historical paused player work is not an implied task when the owner requests extraction or documentation.

## Before handing back

1. Update only the current workstream summary in STATUS: achieved result, exact evidence, open work and the next meaningful action. Never mark another workstream complete.
2. Add a dated HISTORY index entry linking a detailed case when the investigation was substantial. Keep older records; do not rewrite their results into current claims.
3. Record a lesson only when it changes a future decision. Include context, observed failure, proven action, evidence and limits. Explicitly label hypotheses and unresolved attempts. Link the detailed case instead of duplicating full logs.
4. Update an existing runbook/skill if the procedure changed; add one only for a reusable distinct workflow. Keep algorithms in scripts, contracts in architecture docs, rationale in ADRs and chronology in history.
5. Record significant authority/schema/tooling changes in a numbered ADR; supersede, do not erase.
6. Run `python tools/check-project-docs.py` and the skill validator for changed skills. For generated data, run its actual verifier; a documentation check cannot prove data/app behavior.
7. State remaining limits simply. Source preservation, native-open, data correctness, visual QA and owner acceptance are separate claims.

## Evidence placement and hygiene

Private/generated receipts belong in `private/` or `dist/`. Keep project-specific history local; do not copy raw company inputs/figures into public generic HERDR or upload a conversation archive. Do not read secret/auth stores. Refer to source hashes/task IDs/log paths and useful error excerpts; do not bulk-save encrypted reasoning or unrelated chat context.

Use stable lesson/decision IDs and relative links. A machine-specific observed failure should not become an unconditional rule for every host/version. The current converter/readers worked or failed on the recorded file; validate a changed environment on its own evidence.

## Documentation checks and maintenance boundaries

`tools/check-project-docs.py` checks relative file links, skill frontmatter/discovery, critical entry points and the presence/consistency of local package evidence when present. It is read-only. No background worker, scheduled maintenance, remote publication or automatic implementation is installed by this documentation system.

Use [WORK_SESSION.md](templates/WORK_SESSION.md), [LESSON.md](templates/LESSON.md) and [ADR.md](templates/ADR.md). Fill real facts; omit irrelevant sections rather than accumulating empty boilerplate.
