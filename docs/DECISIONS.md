# Decisions (scene engine, V5 to V7)

Architecture decisions of the CAD workstream are in [decisions/INDEX.md](decisions/INDEX.md). This log covers the player. Newest last.

| date | decision | alternatives | reason |
|---|---|---|---|
| 2026-11-10 | Build each version from the previous player file with exact-once string patches; never edit older files | fork the V4 source; edit V4 in place | the owner compares versions side by side; a wrong anchor fails loudly instead of silently building something else |
| 2026-11-10 | Roof steel removed; device icons 2.4x real size | real size | owner: "big like icons"; roof cost GPU |
| 2026-11-11 | Scene file `mf-scene` v1 in metres, stable ids, routes stay / points / auto / elevator | keep the player's internal format (frame units, list positions) | agents and people edit data, not code; ids survive reordering; metres are what the owner thinks in |
| 2026-11-11 | One `scene-core.js` for player and Node | separate validator | the screen and the CLI can never disagree |
| 2026-11-11 | Shots and captions on the story timeline (seconds), tools convert step moments to seconds | store step-relative times | simpler engine; `mf key --step` / `mf caption --step` give step anchoring to agents |
| 2026-11-11 | Camera keys stored in engine units; `mf key` converts plain words | metres / degrees in the file | the Studio records live poses exactly; converting at the tool keeps the engine unchanged |
| 2026-11-11 | Floor reflection off by default | keep it | the owner's "pale cones" were the reflection; saves one scene render every third frame |
| 2026-11-11 | Baked floor light repaired at load under removed / moved layout objects; INJ 2 2F light composed from INJ 2 + Press bakes | re-bake in Blender | no external tool, works for any future layout edit |
| 2026-11-11 | RFID gate shader 64 gates (16 vec4) | one mesh per gate | same draw-call cost, no limit the owner will hit soon |
| 2026-11-11 | INJ 2 doorway: `wall:77` moved 0.6 m north (2.2 m door); a slide RFID mark in the doorway became a scan stop | delete the wall; leave the 304 m detour | owner's arrows (image 27); minimal change that lets the 1.4x display trolley pass |
| 2026-11-11 | EPS 2F: `door` layout edit (new) on walls 165 and 170 | delete 40 m walls | owner's arrow (image 30) crosses two long walls; a door is the honest representation |
| 2026-11-11 | Guided camera rescue after the springs (box model + exact floor ray + exact replica ray, max 6 exact checks) | only the box model | the box model missed slab edges and some meshes; ~1 ms extra per frame only when guided |
| 2026-11-11 | Preparing screen until 30 frames < 22 ms (max 4 s, then skip the rise) | find the GPU root cause | owner: stop hunting, hide it; 0 of 10 fresh starts stutter |
| 2026-11-11 | Agent CLI `tools/mf.mjs` with plain-word verbs; browser verbs bake a temporary player | expose only the JS API | agents work from the terminal and must see results (`shots`) |
| 2026-11-11 | Docs generated from code (fields, CLI, keys) + `mf docs-check` in the build and the commit hook | hand-written docs | docs that cannot go stale; a missing field / command / example / link / changelog entry fails |
| 2026-11-11 | Recipe examples are small sample scenes on the built-in layouts (few stops), committed under `docs/examples` | the owner's full scenes | recipes must be testable; full scenes stay in `private/` |
| 2026-11-11 | Phase A review by Codex GPT-6.1-Sol High (owner's choice), lead verifies and commits | lead reviews alone | a second model family finds what the author misses |
| 2026-11-11 | The preparing screen dry-runs the real opening (3x) and precomputes the guided camera's per-segment angles, instead of rendering one risen frame | find the GPU cause; render a static warm frame | the static warm frame did not warm the opening's states (plan pictures, rise, first segments); 2 of 4 -> 1 of 20 starts with a slow frame |
| 2026-11-11 | Codex review fixes accepted after the lead re-ran identity, validator, smoke, mouse, UI, gates, review tests and the start test | partial acceptance | all pass on the final file |
| 2026-11-11 | Retain V7.7.2 positional addition slots; document append-only lists and slot-preserving delete edits | introduce a persistent-slot format migration during review | preserves current scenes and numeric targets; agents should resolve text IDs through tooling in a later slice |
| 2026-11-11 | Layout reload saves first and carries normalized scene undo/redo in the current tab, bound to the baked hash and saved scene | discard history after every layout Add/import | undo must reconstruct visible geometry as well as JSON; no new scene fields are needed |
| 2026-11-11 | V7.7.2 task 1 rescue checks the final rendered eye after constraints/devices, including its last fallback; exhausted searches are counted | keep the six-exact-check bypass and unchecked vertical fallback | the requested 10-path acceptance exposed hidden samples; all accepted candidates need the same floor/replica/device checks. This fixes an engine bug without changing scene fields; performance remains a separate measurement |
