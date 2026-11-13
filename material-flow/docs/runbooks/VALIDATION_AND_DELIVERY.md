# Validation and delivery

## Separate the claims

| Claim | Required evidence |
|---|---|
| Full native DXF export | Converter result plus all observed sections closed and a real EOF. |
| Complete SQLite projection | Independent DXF record counts by section/type match SQLite; layer/block counts match; integrity check is OK. |
| Correct readable projections | Full label fields match SQLite/JSONL/Excel within documented Excel numeric precision; CSV/worksheet counts agree; workbook ZIP/structure valid. |
| Safe spreadsheet text | No formula/error cells; formula-looking source text remains literal in XLSX, guarded in CSV and raw in JSONL/SQLite. |
| Inputs preserved | SHA-256 before/after for both original files. |
| Excel opens | Actual separate native Excel opened the generated file and read all sheet bounds. |
| Visual QA | Actual inspected pixels; native export or parser success alone is insufficient. Unavailable in this run because native PDF previews were NASCA-wrapped and bitmap capture failed. |
| Factory interpretation accepted | Source registration, nested placement, actual machine identities/process order and owner decisions checked separately. Not supplied by entity counts. |

## Commands and artifacts

From the repository root:

```powershell
$env:PYTHONIOENCODING='utf-8'
python .\dist\layout_tools\verify_layout.py --package '.\dist\SEEG_Y26_AI_Package'
python .\tools\check-project-docs.py
```

Review `verification.json`, `source_counts.json`, `extraction_report.json`, `build_report.json`, `native_conversion.json`, `native_excel_render.json` and `pdf_status.json` in the package. Do not treat `status=pass` in data validation as a claim of visual or business acceptance. Source counts cached in `source_counts.json` belong to the retained DXF for that run; regenerate counts if the input changes.

The extraction fixture in `dist/layout_tools/verification_fixture/` demonstrated header units, record counts, block-local scope, MTEXT chunk order, zero coordinates, EOF and database integrity. Builder checks demonstrated literal `=...` text, CSV guarding, raw JSONL and the plain-text display aid. The full dataset verifier then compared all extracted labels, all output counts and unchanged source hashes.

Verification found two checker-normalization issues, not source-data fixes: Excel returned an integer for a nearly-integral float; the existing numeric tolerance now applies to both numeric Python types. An empty formatted display string could round-trip as `''` or None; normalize both empty representations for comparison. Never normalize zero to empty or alter raw source values to make a check pass.

## Delivery boundaries

- Open `dist/SEEG_Y26_AI_Package/START_HERE.md`; human workbook is `SEEG_Y26_Layout_Readable.xlsx`.
- Use `drawing_labels.csv` first for top-level labels; query indexed SQLite/FTS for complete records. Do not attach/load the full database into an LLM prompt.
- Keep the original files, retained binary DXF, metadata and diagnostics together locally. SQLite is canonical for the exported entity projection; CSV apostrophes and Excel presentation are not raw source replacements.
- Preserve native PDF protection; prefer the existing viewport image only as a limited view. The source PDF has not been text-extracted.
- Publish generated workbook changes through the existing toolkit's `atomic_publish`, retaining prior artifacts. Do not overwrite sources or delete diagnostic evidence merely to hide a failed approach.
- No commit/push/upload is part of this delivery. `private/` and `dist/` stay ignored. No player build or GPU regression was rerun during CAD/documentation work.
