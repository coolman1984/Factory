# Project map and data flow

## V8 source player

| Location | Responsibility / boundary |
|---|---|
| `src/v8/` | Maintained shell, styles, vendor fragments, renderer/replica and engine source; no company payloads. |
| `src/v8/player/` | Sorted, byte-preserved fragments of the engine function. |
| `src/v8/motion-core.js` | One motion calculation for the engine, CLI and Studio Numbers. |
| `private/v8/base/` | Ignored projects/plans, device/audio and model payloads extracted from the approved reference. |
| `tools/build-v8.mjs`, `tools/v8/` | Source build, extraction/split/hash proof, shared publication/lighting and gate/tests. |

## Historical offline player

```text
Local source decks
  -> tools/extract-slide.ps1 (read-only PowerPoint COM)
  -> private/paths/ and private/projects/<id>/
  -> take-off/registration -> routes -> project/layout checks
  -> tools/build.mjs + src/ + local vendor/model assets
  -> dist/Material_Flow_Player.html
  -> isolated headless Chrome checks and private evidence
```

| Location | Responsibility / important boundary |
|---|---|
| `src/index.template.html`, `src/player.css` | Player template and controls; preserve existing IDs used by tests. |
| `src/player.js` | Playback, route motion, views, camera/UI integration and `window.MF` test hooks. |
| `src/camera-envelope.js` | Camera geometry guard. Clearance and trolley visibility need separate checks. |
| `src/replica.js`, `src/look.js` | Factory geometry and rendering/look pipeline. |
| `tools/extract-slide.ps1`, `picture-info.ps1` | PowerPoint COM exports; source opened read-only; `-Slide` is supported. |
| `tools/read-paths.mjs`, `register-paths.mjs` | Connector interpretation and plan registration. |
| `tools/inj-paths.mjs`, `press-takeoff.mjs`, `eps-takeoff.mjs` | Area-specific source interpretation; do not invent elevator correspondence. |
| `tools/routes.mjs`, `check-project.mjs`, `layout-check.mjs` | Route creation, data-contract checks, clash/diagonal checks. |
| `tools/build.mjs` | Embeds three projects, source JS/CSS, images and models into one offline HTML. Prefers `routed/` data when present. |
| `tools/test-projects.mjs`, `test-player.mjs` | Project/control smoke checks; software-rendering checks do not prove real-GPU performance. |
| `tools/test-chase.mjs`, `test-chase-sight.mjs` | Camera clearance versus actual trolley sight lines. |
| `tools/perf.mjs`, `profile-player.mjs` | Different frame-pacing behavior; compare like workloads only. |
| `tools/chrome-session.mjs` | Installed Chrome, throw-away profile, local CDP helper. |
| `library/models/` | Existing reusable models; do not rebuild them without a demonstrated need. |
| `private/`, `.herdr/checkpoints/`, `notes/` | Local source exports, evidence, archives and detailed older handoffs. |

Build dependencies include this machine's sibling `Digital- Factory` vendor files. The build script is authoritative for exact locations. There is no package-manager build abstraction to assume. The player frame uses a historically estimated 0.30 m per slide unit; this is not a surveyed CAD scale.

## CAD readability package

```text
Unchanged DWG -> signed native ODA converter (ACAD2018 DXB)
  -> complete binary DXF (retained)
  -> mmap / tag streaming -> indexed SQLite + source coverage evidence
  -> values-only Excel + CSV + JSONL + agent guide
  -> independent DXF-count, value, source-hash and workbook checks
```

| Location | Responsibility |
|---|---|
| `dist/Latest update SEEG Y26 Layout.dwg` / `.pdf` | Original inputs; never overwrite. |
| `dist/layout_tools/extract_oda_msi.py` | Local extraction of the signed installer payload when administrative MSI extraction did not work. |
| `dist/layout_tools/extract_layout.py` | Stream complete records into a new SQLite database; reject overwriting an existing DB. |
| `dist/layout_tools/build_readable_package.py` | Formatted Excel projections, CSV/JSONL, metadata and guide. |
| `dist/layout_tools/verify_layout.py` | Independent source counts, exported label values, workbook structure and original hashes. |
| `dist/layout_tools/render_excel_previews.py` | Hidden, separate Excel instance; export first-row previews and report DRM status accurately. |
| `dist/SEEG_Y26_AI_Package/` | Final local data package; `START_HERE.md` is its entry point. |
| `dist/SEEG_Y26_AI_Package.staging/` | Diagnostic evidence and earlier failed attempts; not the authoritative final package. |

CAD `$INSUNITS` and raw entity OCS/local block coordinates are preserved. No CAD-to-player registration, nested block expansion or process-flow reconstruction was performed. See the [data contract](architecture/CAD_DATA_CONTRACT.md).

## Knowledge system

`AGENTS.md` routes agents to this documentation. `docs/STATUS.md` tracks live workstreams; `HISTORY.md` is an append-only index; detailed cases live under `history/`; durable lessons under `LESSONS.md`; procedures under `runbooks/`; design rationale under `decisions/`; reusable task instructions under `.agents/skills/`. Preserve old pause/handoff documents as dated evidence.
