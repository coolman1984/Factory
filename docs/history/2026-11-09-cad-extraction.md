# Case history: large CAD extraction and project memory (2026-11-09)

## Request and evidence

The owner supplied the Y26 layout DWG/PDF under `dist/` and asked for readable Excel or another format any AI agent could work with, allowing COM/native tools and downloads. A continuation recovered the earlier session, completed the CAD extraction, then received explicit requests for a professional project documentation/skills/history/lessons system and closure of the PDF.

Original recovery source: `C:/Users/m.labib/.codex/sessions/2026/11/09/rollout-2026-11-09T08-43-59-01a1bf0c-8368-7910-8f21-c90c65d9553d.jsonl`. Do not bulk-copy raw conversations into documentation: preserve useful public facts/error evidence, not encrypted reasoning, credentials, authentication stores or unrelated context.

Actual machine-readable receipts live in `dist/SEEG_Y26_AI_Package/`. Previous small diagnostic logs remain in `dist/SEEG_Y26_AI_Package.staging/`. The exact source hashes and converter installer hash are in the receipts; they identify this snapshot, not every future revision.

## First session: investigation without a usable delivery

| Sequence / evidence | Observation | Outcome / why next step changed |
|---|---|---|
| PDF probe; original session ordinal 34, 06:46 UTC | PyMuPDF reported `no objects found`; bytes showed NASCA wrapper. | Stopped treating it as an ordinary plain PDF. Native access was needed. |
| Native PDF COM checks | AcroExch PDDoc could not be created. | Installed/registered native viewing and usable extraction COM are different capabilities. |
| ezdwg read-only reader, 0.19.2 source present locally | Rejected the drawing's internal structure. | No valid entities produced; retained original. This was not proof of universal source corruption. |
| Aspose.CAD 26.7 attempt | Loading exhausted available Windows memory; no complete extraction resulted. | Stopped only the task's reader and sought a native streaming/conversion route. |
| Separate hidden Word COM import | Connected but PDF import did not finish. | Not a demonstrated PDF text extraction method. |
| LibreDWG / verbose local logs | AC1032 recognized; section-map underflow/type mismatch; `SECTIONNOTFOUND`, error 0x100. | No entity JSON was delivered. A read snapshot did not establish a fix. |
| Official newer LibreDWG download attempts | Official endpoints/DNS addresses timed out; ordinal 359 and 526 show the actual timeout. | Download reachability was unresolved; not a reason to use an untrusted mirror. |
| First Claude bridge job `996920e7f28449dfa86025e9a2cd0571` | Failed with `Request timed out`; no reporting script produced. | Coordinator inspected records/partial state; did not treat a submitted job as a completed artifact. |
| Official ODA MSI download | Authenticode Valid; OPEN DESIGN ALLIANCE. | Native conversion became available locally; drawings were not uploaded. |
| Administrative MSI extraction | Did not yield a usable converter. | Existing `extract_oda_msi.py` extracted the embedded cabinet and restored MSI path/name mappings without installation. |
| ODA ASCII conversion | File reached 2,038,689,717 bytes; `.err` said native `File write error`; final record truncated. | Input was not complete despite size/plausible sections. Exact failure cause not proven. |
| Foxit native view | Supplied PDF rendered; native viewport capture saved. | Viewing worked; text export not yet proven. |
| End of first session | Windows resource error interrupted work while converter/native-view checks were active. | No usable workbook/package had been delivered. Recovery needed actual file checks, not optimistic prior commentary. |

## Continuation: working solution

1. Recovered the transcript's actual user request, recent bridge task/result, existing tools and artifacts. Found no active worker. Inspected DXF head/tail/error, source headers, memory/disk and native viewport. Preserved originals.
2. Scanned the ASCII file: it included completed header/tables/block definitions and some main entities, but lacked EOF. Initial uncertainty about reaching ENTITIES was resolved by the scan; the case does not claim the partial file contained only blocks.
3. Read the native executable's embedded command-line help. It explicitly accepted `DWG`, `DXF`, **`DXB`**. Binary mode was selected rather than repeating the failed ASCII attempt.
4. ODA ACAD2018/DXB exited 0 after 224.119 seconds. The output was 1,160,948,809 bytes, with the binary-DXF signature and a real closing EOF. This was the decisive working conversion.
5. One bounded reporting worker, `1ff6ebfd36f6447ea19eb767c482c11f`, also failed with `Request timed out` and produced no script. The coordinator continued locally; no model/account rotation or further retry loop was used.
6. Implemented a bounded-memory extractor: mmap subclass for the required `.index()` and buffer behavior, native tag loader, complete-record grouping, small SQLite batches, raw ordered tags, typed coordinates/space/containing block, metadata, diagnostics, indexes and FTS5. Retained the native DXF for unprojected sections.
7. The first extractor execution exposed a 13-placeholder INSERT against a 12-column schema. Corrected the SQL arity; preserved the failed scratch database separately. A controlled fixture then passed counts, source units, MTEXT chunks, null/zero, block-local scope, EOF and integrity. The full run was restarted into a new database rather than pretending the failed one was complete.
8. Completed all seven sections observed in this file. Extraction/indexing/integrity took 1,069.332 seconds. Independently scanned native DXF counts instead of trusting database summaries alone.
9. Built a values-only, formula-safe Excel index with frozen headers/filtering and all labels/definitions/references/dimensions; full raw data stayed in SQLite. Added explicit top-level labels, display text, layer fields, block base points and source dimension measurements. CSV and JSONL provide direct agent access.
10. Full validation compared source counts, SQLite counts, all raw label fields against JSONL/Excel, worksheet/CSV counts, workbook structure/ZIP, formula/error absence and original hashes. Checker corrections handled Excel's nearly-integral numeric serialization and empty cleaned-display text. Raw data was not modified to satisfy checks.
11. The restricted doctor could not start Excel, but a separate approved hidden COM context connected to Excel 16.0, opened the final workbook read-only and exported the first 12 rows of each sheet. All resulting PDFs were NASCA-wrapped, so PyMuPDF visual inspection failed. Hidden CopyPicture failed as well; visual QA remains unavailable, honestly distinct from passing data checks.
12. Native Foxit rendered the PDF but became unresponsive during export controls. An intended Save As shortcut did not yield an export dialog. No PDF text extraction, OCR, source save or PDF/DWG reconciliation succeeded. Saved a limited viewport and `pdf_status.json`.
13. On the owner's explicit close request, a normal WM_CLOSE was attempted first. The unresponsive task-owned Foxit process was then identified by PID, exact PDF argument, title and lack of another main document window; only that process was stopped. Closure was verified. This is a narrow cleanup fact, not a general force-close procedure.
14. Built the project knowledge system around existing docs, retaining dated handoffs/pauses and the application workstream's open issues. No player implementation, GPU tests, commit, push or global skill/config change was part of this work.

## Delivered facts

| Artifact/metric | Observed value |
|---|---|
| CAD entity records | 6,093,544 |
| Nonempty raw text records | 23,971 |
| Top-level drawing labels | 2,648 |
| Layers / block definitions | 1,262 / 17,680 |
| INSERT references / dimension records | 107,510 / 681 |
| Source units | INSUNITS=4, millimetres |
| Readable workbook | 10 sheets, about 10.3 MB |
| SQLite / retained binary DXF | 4,135,702,528 / 1,160,948,809 bytes |
| Input preservation | Both SHA-256 hashes unchanged |
| Data verification | Passed, with documented Excel numeric precision |
| Native Excel | Open/export demonstrated; preview PDFs protected; no native pixel acceptance |
| Source PDF | Native viewport only; text/reconciliation unavailable; window closed |

## What remains open

Native PDF text export, usable native visual preview, PDF/DWG correspondence, custom/proxy/xref semantics, nested block placement and CAD-to-player registration are not complete. The separate player camera/Press alignment/performance acceptance is not resumed or solved by this case. See current [STATUS.md](../STATUS.md) and [lessons](../LESSONS.md).

## Reuse next time

Start with existing package evidence and indexed queries; do not redo the failed reader sequence. Reuse the [CAD runbook](../runbooks/CAD_EXTRACTION.md). For a different input or revision, create new staging/output and new source-count evidence. Check byte signatures and capabilities before choosing libraries, and preserve the difference between an observed workaround and an unproven cause.
