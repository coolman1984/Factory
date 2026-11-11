# ADR-003: SQLite is the entity authority; Excel is a readable view

Status: Accepted. Date: 2026-11-09.

Context: millions of CAD records cannot sensibly fit one worksheet or an agent prompt. Raw geometry includes repeated DXF group codes, local block coordinates, nested references and custom objects.

Decision: preserve ordered raw tags, source handles, typed reference coordinates and scope in indexed SQLite; retain other native sections in the DXF. Provide full text/dimension/INSERT/layer/block views in Excel/CSV/JSONL and explicitly sample only geometry. Keep raw and cleaned display text separate; preserve null/zero and guard spreadsheet formula interpretation.

Consequences: convenient views remain small and searchable, while full geometry stays available. A row/symbol/reference is not automatically a machine. Nested block placement, xrefs/proxy semantics, process order and PDF correspondence remain explicit unresolved interpretations. Schema changes require compatible readers/validation and a new decision when authority changes.
