# Open issues (honest list)

| # | issue | since | state / next step |
|---|---|---|---|
| 1 | Reactive camera still has abrupt rescue turns | V7.7 | Step 0 visibility passes ten paths at 3x and three at 1x; mean per-path P95 26.24 -> 11.20 deg/s, worst 1348.4 -> 406.2. No-snap goal remains open for M3; see [review](REVIEW_CAMERA_LAYOUT_772.md) |
| 2 | Intermittent cold-start GPU stalls: cause remains unproven | V6 | Final Step 0: 0 of 8 starts with visible stutter; preparing screen retained. Historical V7.7.1 had 1/20 starts with one 117 ms frame. Keep measuring in M9 |
| 3 | The floor name tag ("1st Floor E1-E2") can sit under the Studio panel's corner | V7.6 | cosmetic |
| 4 | `auto` routes avoid narrow doorways (router margins wider than the validator's) | V6 | use `points` for the owner's exact lines; see [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| 5 | Doors cannot be cut in the Studio (only as `door` layout edits) | V7.6 | add a Studio button when needed |
| 6 | Several trolleys do not wait for each other (they can overlap); congestion is only measured (closest distance) | V7.6 | queueing behaviour would be an engine feature |
| 7 | Camera keys and viewpoints are stored in engine units | V7.6 | use `mf key`; a metre-based key format would need engine work |
| 8 | Frame rate on this PC (Intel Iris Xe): steady 59.3-59.9 fps; occasional single 50-130 ms frames | V6 | measure with `tools/perf-file.mjs` |
| 9 | Studio real-time timing/download acceptance fails | V7.6 | Both Step 0 recordings differ from story range / speed; a completed disk MP4 download is unverified. See [private receipt](../private/v7/layout-audit/STEP0_REALTIME_RECORDING.md). CLI explicit frames pass decoded timing/freeze checks using existing ffmpeg/ffprobe; portable browser export is M2 |
| 10 | Door assumptions and layout/path conflicts need replacement-map review | V7.1 / V7.6 | Older arrows are historical; the lead owns scene-data changes against the latest owner images. Step 0 supplies [private findings](../private/v7/layout-audit/STEP0_FINDINGS.md), not layout acceptance |
| 11 | Studio Numbers tab uses estimates for its before / after table (the CLI `mf numbers` uses the player's exact motion model) | V7.6 | Codex review: deferred |
| 12 | The Node validator does not sweep placed 3D objects (`objects[]`); the Studio does | V7.6 | Codex review: deferred |
| 13 | PCs at free angles use a square-on footprint approximation for clearance | V7.6 | Codex review: deferred |
| 14 | Several trolleys share the lead trolley's timeline and are compared in plan (not per floor): a headway demonstration, not a traffic simulator | V7.6 | Codex review: deferred |
| 15 | Video compositor differs from live CSS; mixed literal-language punctuation and native Arabic acceptance remain open | V7.6 | Step 0 supplies inspected bilingual footage; English literals can inherit RTL punctuation under Arabic selection. Gradients/multi-line titles also differ; finish fidelity in M2 |
| 16 | The old project checker `tools/check-project-docs.py` reports a CAD receipt mismatch ("Native Excel receipt belongs to a different workbook") | 2026-11-09 | unrelated to the player; CAD workstream |
