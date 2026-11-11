# ADR-002: Native binary DXF followed by tag streaming

Status: Accepted for the demonstrated large drawing. Date: 2026-11-09.

Context: the small DWG reader rejected this input; Aspose loading exhausted available memory; LibreDWG rejected its internal section map. Native ODA could read it, but the ASCII export ended mid-record after a native write error. These failures do not establish that the drawing is generally corrupt or that each reader fails universally.

Decision: use the signed ODA converter's ACAD2018/DXB mode, retain its complete binary DXF, then stream tags through an mmap-compatible loader into SQLite. Validate all section ends/EOF and reconcile source counts independently.

Alternatives: full-document Python CAD loading risks millions of in-memory objects; accepting/repairing the truncated ASCII file would silently omit data; screenshot OCR would lose geometry/provenance and was unnecessary for the DWG.

Consequences: local native tooling is a conversion dependency; raw DXF remains large and must be retained. SQLite indexes and readable projections allow subsequent work without repeating conversion or loading the full drawing. Exact converter/parser versions and observed limitations remain in run evidence.
