# Open issues (honest list)

| # | issue | since | state / next step |
|---|---|---|---|
| 1 | Guided camera: Press path 2, one sample in ~1,200 hidden at t = 169 s (the 2nd floor glides in before Elev 3&4) | V7.7 | owner accepted; reproduce with `node tools/test-camera-v5.mjs <player> press guided 3 1` |
| 2 | The cause of the slow opening on some cold starts (GPU side) | V6 | hidden by the preparing screen (V7.7.1: 1 of 20 fresh starts had one 117 ms frame); the cover now takes about 3 s; cause not found by decision |
| 3 | The floor name tag ("1st Floor E1-E2") can sit under the Studio panel's corner | V7.6 | cosmetic |
| 4 | `auto` routes avoid narrow doorways (router margins wider than the validator's) | V6 | use `points` for the owner's exact lines; see [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| 5 | Doors cannot be cut in the Studio (only as `door` layout edits) | V7.6 | add a Studio button when needed |
| 6 | Several trolleys do not wait for each other (they can overlap); congestion is only measured (closest distance) | V7.6 | queueing behaviour would be an engine feature |
| 7 | Camera keys and viewpoints are stored in engine units | V7.6 | use `mf key`; a metre-based key format would need engine work |
| 8 | Frame rate on this PC (Intel Iris Xe): steady 59.3-59.9 fps; occasional single 50-130 ms frames | V6 | measure with `tools/perf-file.mjs` |
| 9 | Recording takes real time (a 3 min path at 1x records for 3 min) | V7.6 | use `--speed` or `--from/--to` |
| 10 | The owner's full INJ 2 doorway and EPS doors are assumptions from the owner's arrows, not from the CAD | V7.1 / V7.6 | owner confirmed the routes by drawing them |
| 11 | Studio Numbers tab uses estimates for its before / after table (the CLI `mf numbers` uses the player's exact motion model) | V7.6 | Codex review: deferred |
| 12 | The Node validator does not sweep placed 3D objects (`objects[]`); the Studio does | V7.6 | Codex review: deferred |
| 13 | PCs at free angles use a square-on footprint approximation for clearance | V7.6 | Codex review: deferred |
| 14 | Several trolleys share the lead trolley's timeline and are compared in plan (not per floor): a headway demonstration, not a traffic simulator | V7.6 | Codex review: deferred |
| 15 | Video captions: canvas drawing does not reproduce CSS gradients, multi-line titles or Arabic right-to-left alignment exactly | V7.6 | Codex review: deferred |
| 16 | The old project checker `tools/check-project-docs.py` reports a CAD receipt mismatch ("Native Excel receipt belongs to a different workbook") | 2026-11-09 | unrelated to the player; CAD workstream |