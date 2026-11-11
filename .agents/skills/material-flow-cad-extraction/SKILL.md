---
name: material-flow-cad-extraction
description: Reuse or rebuild Material Flow's local large-DWG SQLite, Excel, CSV and JSONL package with source preservation, binary DXF streaming and explicit NASCA/PDF limits; excludes inferred process flows and CAD-to-player registration.
---

Start with `dist/SEEG_Y26_AI_Package/START_HERE.md` and its verification/PDF status. Prefer indexed read-only queries to repeating conversion or loading a whole drawing into an agent context.

When rebuilding, read the [working runbook](../../../docs/runbooks/CAD_EXTRACTION.md) and [data contract](../../../docs/architecture/CAD_DATA_CONTRACT.md). When protected Office/PDF access is involved, load [native/DRM notes](../../../docs/runbooks/NASCA_AND_NATIVE_OFFICE.md). Use [validation/delivery](../../../docs/runbooks/VALIDATION_AND_DELIVERY.md) before claiming completion. The [case history](../../../docs/history/2026-11-09-cad-extraction.md) records exact failed attempts and the proven route; do not repeat them without new evidence.

Preserve originals and source hashes. Use a new output directory and fresh source-count evidence for a changed drawing. The demonstrated native path is signed ODA ACAD2018/DXB -> binary DXF -> mmap tag streaming -> SQLite -> readable views. Require true EOF/closed sections, matching source/DB counts and actual artifact checks. A large partial ASCII export must remain marked partial.

Keep raw tags/text, null/zero, source units, local block scope and INSERT transforms explicit. Do not count CAD records as machines or expand coordinates by guesswork. Retain native OBJECTS/ACDSDATA outside the projected database. Guard formula-looking spreadsheet text while preserving raw values in SQLite/JSONL.

Stop a failing native/tool/service attempt with its real evidence; do not loop readers, models or accounts. Native viewing/export does not prove PDF text or visual extraction. NASCA-wrapped previews and the failed hidden CopyPicture path are not a validated visual-QA solution. Never bypass protection or close unrelated user applications.
