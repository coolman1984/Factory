# CAD extraction data contract

Status: implemented for the local extraction package; business interpretation is not accepted automatically.

## Authority and coverage

1. Original DWG/PDF: unchanged source bytes, identified by SHA-256 in `metadata.json` / `verification.json`.
2. `source_layout.dxf`: complete native **binary DXF**, retaining HEADER, CLASSES, TABLES, BLOCKS, ENTITIES, OBJECTS and ACDSDATA for this drawing. Conversion completeness is not proof that every custom/proxy object has understood semantics.
3. `layout.sqlite`: indexed projection of BLOCKS/ENTITIES plus layer/block definitions, metadata, diagnostics and full raw entity tags.
4. Excel/CSV/JSONL: convenient projections; neither a replacement for complete geometry nor a manufacturing model.

## SQLite schema

| Table | Fields |
|---|---|
| `metadata` | `key TEXT PRIMARY KEY, value TEXT` (JSON-encoded value) |
| `entities` | `id INTEGER PRIMARY KEY, handle TEXT, type TEXT, layer TEXT, space TEXT, block_name TEXT, text TEXT, x REAL, y REAL, z REAL, rotation REAL, properties_json TEXT` |
| `layers`, `blocks` | `name TEXT PRIMARY KEY, properties_json TEXT` |
| `diagnostics` | `id INTEGER PRIMARY KEY, scope TEXT, object_id TEXT, message TEXT` |
| `text_search` | FTS5: `text, handle, layer, space, block_name, entity_id`; availability declared in metadata |

Indexes exist on type, layer, containing block, source handle and space. Entity IDs reflect this extraction order; handles provide source provenance, not a manufacturing business key. `properties_json.tags` preserves the ordered `[group_code, value]` list, including repeated codes. Binary chunks use `binary_hex`. Do not collapse repeated vertex codes into a dictionary.

## Coordinates and text

- `space` is `model`, `paper` or `block_definition`. The latter is reusable **local** geometry, not placed equipment.
- `block_name` means the containing definition. INSERT target name is `properties_json.referenced_block` (source group 2).
- `x/y/z` are group 10/20/30 reference points, not bounds or centroids. Missing numeric data remains null; zero remains zero.
- Source OCS/extrusion is retained. Placement requires correct block base point, INSERT scaling/rotation/extrusion, nested transforms and array offsets. No expansion was applied.
- Relevant INSERT groups: 41/42/43 scale, 50 degrees, 70/71 columns/rows, 44/45 spacing, 210/220/230 extrusion. Block definition groups 10/20/30 retain its base point.
- The index extracts TEXT, MTEXT, ATTRIB, ATTDEF and dimension text overrides. Other/custom entity text may remain only in raw tags/native DXF. ATTDEF is a definition/default, not an equipment instance. Blank dimension text or `<>` does not imply a missing dimension measurement.
- MTEXT chunks are concatenated in source order. `text` retains raw formatting; `plain_text` is a display aid made with ezdxf text utilities, not a new authoritative value. Formatting-only raw strings may have an empty plain-text result.
- Units come from `$INSUNITS`, never visual guesses. The observed source code 4 means millimetres. Do not apply the player's older slide scale to CAD coordinates.

## Excel and interchange

Ten sheets: Start Here, Entity Summary, Layers, Drawing Labels, Text Labels, Dimensions, Block References, Block Definitions, Geometry Sample, Issues. Drawing Labels contains top-level model/paper text; Text Labels includes reusable definitions. Geometry Sample is explicitly limited to the first 10,000 model-space nontext records; all geometry remains in SQLite.

Layers expose color/flags/linetype/plot/lineweight. Block Definitions expose source base point, flags and xref path. Dimensions expose source group-42 measurement, type and style where present. Raw properties remain available for audit.

Excel disables automatic formulas/URLs and writes raw strings as strings. CSV adds an apostrophe to possible formula text; JSONL and SQLite retain original text. CSV is UTF-8 BOM. Excel detail sheets split before the row limit; long-cell truncation must be marked and counted, with a SQLite reference. This snapshot reported no truncated cells. Excel numeric comparisons allow its serialization precision (absolute 1e-8 or relative 1e-14); SQLite/JSONL retain source numeric values.

## Read-only access

```python
from pathlib import Path
import sqlite3
db = sqlite3.connect(Path('dist/SEEG_Y26_AI_Package/layout.sqlite').resolve().as_uri() + '?mode=ro', uri=True)
print(db.execute("SELECT entity_id,text,space,block_name FROM text_search WHERE text_search MATCH ?", ('SMD',)).fetchmany(20))
```

Use SQL parameters for searches. Begin with `drawing_labels.csv`, then FTS and handle/layer queries. Do not load the multi-gigabyte database or complete DXF into an LLM context.
