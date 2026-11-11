# Reproduce the large-DWG extraction

Use this runbook for the CAD package, not for rebuilding the player. Read the [contract](../architecture/CAD_DATA_CONTRACT.md) and [NASCA notes](NASCA_AND_NATIVE_OFFICE.md) first.

## Preflight

Work from the repository root in PowerShell. Read current status, inspect existing output/jobs, and preserve originals. Check free disk and memory. The observed input was about 349 MB; its binary DXF about 1.16 GB; indexed SQLite about 4.14 GB. Allow additional staging/index/output space and several gigabytes of native converter RAM. These are observations for this drawing, not universal requirements.

Inspect the first bytes before choosing a parser: this DWG starts `AC1032`; the PDF starts `<## NASCA DRM FILE - VER1.00 ##>`. A `.pdf` extension does not make the bytes a plain PDF. Record source hashes before and after.

Dependencies proven here: Python 3.12.10 x64, local ezdxf package under `dist/layout_tools/python/`, xlsxwriter 3.2.9, openpyxl 3.1.5, standard SQLite/FTS5, installed Excel 16.0 for the optional native-open/export check. The builder imports the owner's existing `excel_report_toolkit`; see its explicit path in the script. Do not assume a fresh machine already has these packages or the local toolkit.

## Native conversion: the working route

ODAFileConverter 27.10 was downloaded from the official ODA guest-file page. Verify the actual installer with `Get-AuthenticodeSignature`: the observed result was Valid, signer OPEN DESIGN ALLIANCE. The saved installer SHA-256 is in `native_conversion.json`; verify a new download against its own trusted provenance, not an obsolete expected hash.

Administrative MSI extraction did not produce a usable tool in the first session. `dist/layout_tools/extract_oda_msi.py` uses the MSI File/Component/Directory tables and embedded cabinet, `MsiRecordReadStream` through ctypes, then Windows `expand.exe`, restoring filenames/directories with containment checks. It extracts locally without installing/changing Windows settings. Use that existing script rather than re-inventing cabinet mappings.

The executable's own command-line help lists:

```text
ODAFileConverter.exe INPUT_FOLDER OUTPUT_FOLDER ACAD2018 DXB 0 0 INPUT_FILTER
```

`DXB` is this tool's **binary DXF output mode**; the output still ends in `.dxf`. Verify the `AutoCAD Binary DXF\r\n\x1a\x00` header. Do not confuse the CLI mode with an expected `.dxb` filename. `0 0` means no folder recursion and no audit in the demonstrated run. Do not silently enable repair/audit or write over an original.

Example after choosing a **new** output folder:

```powershell
$converter = (Resolve-Path '.\dist\layout_tools\oda\files\ODAFileConverter.exe').Path
$inputFolder = (Resolve-Path '.\dist').Path
$outputFolder = [IO.Path]::GetFullPath('.\dist\cad-conversion-new')
New-Item -ItemType Directory -Path $outputFolder -ErrorAction Stop | Out-Null
& $converter $inputFolder $outputFolder 'ACAD2018' 'DXB' '0' '0' 'Latest update SEEG Y26 Layout.dwg'
```

Coordinator subprocess launches should use `CREATE_NO_WINDOW` and STARTUPINFO hidden flags as in the recorded case. Bound the wait, capture stdout/stderr, retain process identity and do not kill processes by executable name. Conversion took about 224 seconds in this run.

Require exit 0 **and** a completed structural scan. The earlier ASCII export grew past 2 GB but ended mid-record and had a native write error. Its large size and plausible prefix were not success. The exact ASCII write-failure cause was not established; do not claim a universal ODA or filesystem 2-GB limit.

## Stream into a new database

```powershell
$env:PYTHONIOENCODING='utf-8'
python .\dist\layout_tools\extract_layout.py --dxf '.\dist\cad-conversion-new\Latest update SEEG Y26 Layout.dxf' --output-dir '.\dist\SEEG_Y26_AI_Package.new'
```

The extractor refuses an existing database. It uses an mmap subclass adding `.index()` via `.find()`, preserving the buffer interface required by `struct.unpack_from`. ezdxf's binary tag loader can then stream without allocating an entire CAD document. A generic wrapper object is not a buffer substitute. The loop holds one entity and small SQLite batches, rather than millions of Python CAD objects.

Only complete records cross a group-0 boundary; an incomplete terminal record is discarded and the recovery is marked partial. Do not append a fake EOF to turn a partial drawing into a claimed full export. HEADER variables occur inside the SECTION record before the next group-0 boundary: the fixture protects their extraction, including `$INSUNITS`.

Retain the completed native DXF in the final package as `source_layout.dxf`. Update `metadata.dxf_input` if relocating it. OBJECTS/ACDSDATA are retained in native DXF even though they are not projected into the entities table. Extraction/indexing/integrity checking took about 1,069 seconds here.

## Build and verify

```powershell
python .\dist\layout_tools\build_readable_package.py --db '.\dist\SEEG_Y26_AI_Package.new\layout.sqlite' --output-dir '.\dist\SEEG_Y26_AI_Package.new'
python .\dist\layout_tools\verify_layout.py --package '.\dist\SEEG_Y26_AI_Package.new'
```

The verifier expects `source_layout.dxf` in the package, or the documented original staging path. Ensure retained input/source metadata paths match the new run. Source-count evidence is cached as `source_counts.json`: use a new package directory for a new drawing; do not reuse stale counts after replacing a DXF. The scripts are this project's reproducible implementation, not an arbitrary-filename CAD CLI.

For the original delivery, use the existing verified package instead of repeating conversion. Complete checks and release boundaries are in [VALIDATION_AND_DELIVERY.md](VALIDATION_AND_DELIVERY.md).
