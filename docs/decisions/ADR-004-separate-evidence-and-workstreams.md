# ADR-004: Separate evidence layers and coordinate workstreams

Status: Accepted. Date: 2026-11-09.

Context: exports can exist but be partial/protected; a worker can finish without tests; a native app can open a file without proving its pixels or semantics. The player uses a slide-derived scale and the CAD uses source units/OCS.

Decision: report data validation, native-open/export, visual inspection and owner/business acceptance separately. Keep original/derived artifacts and evidence linked. Do not infer CAD-to-player registration or resume paused application work merely because extraction succeeded.

Consequences: the current data package can pass its full data checks while the PDF remains unextracted and visual QA unavailable. Historical player checks stay historical; unresolved camera/Press alignment/performance work remains open. Future agents must record exact tested scope and new evidence rather than flattening all work into a single "done" flag.
