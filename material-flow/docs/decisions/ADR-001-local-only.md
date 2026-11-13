# ADR-001: Preserve local-only company artifacts

Status: Accepted owner constraint. Date recorded: 2026-11-09; already established in project README and earlier handoffs.

Context: decks, plans, drawings, screenshots and database records contain company information. The repository has no remote, and `private/` / `dist/` are ignored.

Decision: keep processing and evidence local. Download tools from approved official sources when authorized, verify provenance, and do not upload drawings or publish project artifacts. No remote, git staging, commit or push is introduced by documentation work.

Consequences: git alone does not back up ignored sources, evidence or built outputs. Use an explicit local archive/checkpoint when required. Share portable schema/procedures without leaking company raw data into public/shared generic repositories. Local source preservation hashes are separate from code version control.
