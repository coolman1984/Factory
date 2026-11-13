# Leadership handoff to Claude 2040 - 2026-11-07

Latest owner instruction: "give all the data and the tasks to the leader of claude 2040 opus5.5 meduim now".

You are the Material Flow LEAD on Claude account 2040, model claude-opus-5-5, effort medium. This is a transfer of project ownership, not a bounded implementation/review worker task. Follow the LEAD rules in HERDR/CLAUDE.md and the owner's latest instructions. Codex is handing over and will not concurrently edit or run tests. The 2026-11-06 pause remains historical; the owner now authorizes this handoff and assigns the remaining tasks to you.

## First read, in order
1. docs/STATUS.md and docs/PAUSED-2026-11-06.md (the latter is the precise checkpoint, including what was NOT proven).
2. D:/WORK/Software Development/GitHub/HERDR/docs/PLAYBOOK-INTERACTIVE-FACTORY.md.
3. HERDR/important-issues/README.md and all three case studies, especially 2026-11-06-camera-clearance-and-helper-isolation.md.
4. HERDR/CLAUDE.md, HISTORY.md, LESSONS.md from #157 through #174, docs/LEAD-MIND.md, docs/TEAM-PLAYBOOK.md, docs/AGENT-ROSTER.md, and both factory research reports in docs/research/.
5. Local project memory: .herdr/memory/DECISIONS.md, HISTORY.md, LESSONS.md, plus .herdr/PLAN.md and PAUSED.md. Their stop markers reflect the old owner instruction; record the latest ownership transfer without deleting the old record.
6. notes/sol-perf-look.md and the actual source/tools, not just summaries.

HERDR root in all references is D:/WORK/Software Development/GitHub/HERDR.

## All local inputs, saved data and recovery files
Project: D:/WORK/Software Development/GitHub/Material-Flow. No remote, never push. Source/code checkpoint: c86be97; save receipt/current source head at handoff preparation: 5734d18. Public generic HERDR docs checkpoint: 80aa4247. A later documentation-only transfer commit may follow; read git status/log before editing.

Full checked archive: .herdr/checkpoints/20261106-170416/material-flow-paused.zip. Its final-manifest.json records 155 files, 56,374,314 bytes, SHA-256 7e687a026713d58009cdcaaf9e5b3de5aa252246732467f7b9c5c99034ff0e73, CRC verified. It includes source, model library, private exports/images/traces, built page, memory and both original generic helper tasks/results. Original before-save.zip and HERDR docs backups are beside it. Git safety snapshot: b1a5e7e89c4f9602191db51e2a5e254a7774f618 under refs/autosave/main. Do not restore over the working tree by default: files are already present and source is committed.

Unchanged source deck: C:/Users/m.labib/Downloads/Material flow -261104 V2.pptx. Office files through COM only. No source save occurred. Do not upload the deck or raw company inputs to any external system. Read existing local exports first.

Injection: private/slide1.json, inj.json, replica.json, layout.json, plans/, bake/, assets/. Built offline page: dist/Material_Flow_Player.html. Shared reusable assets: library/models/ (agv, forklift, injection, pallet, press, trolley, truck, utility); never rebuild them.

Press slide 2 already extracted through COM: private/press/slide2.json, source.json, slide.png and plans/pic16.png, plans/pic3.png. EPS slide 3: private/eps/slide3.json, source.json, slide.png and plans/pic9.png, plans/pic4.png. Lead inspected both slide images. No takeoff/routes/new chapter exists yet.

Proof: private/evidence/before/, chase/ (diagnostic.png and report.json), camera-ui/, stalls-before/ (report.json and trace.json). Inspect the actual images yourself before visual claims.

Original generic DeepSeek helper folders: C:/Users/m.labib/AppData/Local/herdr/generic-tools-20261106/browser/ and /camera/, with TASK.md, AGENTS.md, code and ANSWER.md. Both panes are closed. Their outputs were reviewed and integrated; there are no workers to recover/restart.

Private conversation archive: D:/WORK/Software Development/GitHub/HERDR-Memory (no remote). Last sync added 19,741 messages and deferred one Claude file label 3fa215a51eab with JsonReaderException; original retained, retry later without inventing a cause. Exact receipt: .herdr/checkpoints/20261106-170416/conversation-archive-status.json. This deferred archive source is not an app bug and must not block the project takeover.

Memory/recall commands, from PowerShell 7:
- pwsh -NoProfile -File "D:/WORK/Software Development/GitHub/HERDR/herdr-memory.ps1" recall -Query "camera material flow" -Cwd "D:/WORK/Software Development/GitHub/Material-Flow"
- pwsh -NoProfile -File "D:/WORK/Software Development/GitHub/HERDR/herdr-archive.ps1" search -Query "material flow" -Project "Material-Flow" -Top 10
- Use herdr-memory note for project decisions/events/lessons and ingest/eval for helpers. Never mix company facts into public HERDR records.

## Tasks to own, in this order
1. FINISH CHASE CAMERA ACCEPTANCE. The implementation already guards the full near plane and actual smoothed eye against full-height structure bounds. It also selects an open lift view from the whole upper structure, including the projecting bridge. One final midpoint ray and inspected GPU screenshot are clear. Synthetic tests passed 1,253 checks; a PRECEDING angle revision passed 1,125 real-GPU states against 5,021 instance boxes. Earlier camera code passed 27/27 controls. The FINAL whole-structure angle revision did NOT run its full sweep before the stop. Start with node tools/test-camera-envelope.mjs, node tools/test-chase.mjs private/evidence/chase-final, node tools/layout-check.mjs. Add/perform a sight-line sweep at lift entry, several progress points and exit, and inspect screens. tools/inspect-chase.mjs is currently a one-midpoint diagnostic, not a whole-journey assertion. Consider prewarming the cached footprint rather than computing it on first camera use. Only after the final checks pass, commit the finished camera piece locally and report it simply.
2. STALLS. No fix has been made. Old uncapped High 40s run: average 65.3 fps, p99 49.3ms, worst 434ms. New normal-paced real-Iris-Xe trace: 2,353 frames/40s, p50 16.7ms, p99 33.3ms, worst 100.1ms, no JS long tasks or errors. Trace showed GPU-process WebGL command-buffer flush tasks around 102ms; universal cause not proven. Old perf.mjs disables frame limit; profile-player.mjs does not. Match pacing/workloads, run GPU checks ONE AT A TIME, use MF.perf and saved trace. Do not claim stalls fixed from incomparable runs.
3. PRESS. Use the existing slide-2 COM export. Add takeoff with source overlays, square direct routes and chapter integration with the same approved pipeline/look/assets. Include both floors and Elevator 3 and 7. Player currently hardcodes Injection plateOf, roof loops, presets, one elevator E and E2-2F deck ownership; tabs are disabled. Generalize deliberately, preserve Injection and prove all routes/geometry/screens. Do not invent actual process order or lift landing positions.
4. EPS. Existing slide-3 export; same pipeline. Include both floors, Dry Room In/Out, Final KD and dispatch routes. The extracted slide does not prove a named elevator/landing for its floor transfer. Establish evidence or ask the owner before assigning one. Keep DRAFT ORDER and scale caveats until confirmed. Verify and commit separately.
5. POLISH. Only after the chapters pass: reflection, restrained clutter/detail toward the approved reference look, control regression, all looks/floors/cameras/speeds and final real-GPU screenshots. Reuse library/models. Never invent KPIs.

## Tools and verification
- herdr-agents.ps1 start/ask/read/stop for visible helper panes; read actual IDs/status. Owner permitted TWO ds-flash helpers. Give external helpers only generic synthetic jobs in separate folders when company inputs must stay local. Lead integrates/reviews/tests; never two writers on one file. Close finished panes. Do not start a second Claude worker accidentally.
- Camera: src/player.js, src/camera-envelope.js; tests tools/test-camera-envelope.mjs, test-chase.mjs, inspect-chase.mjs.
- Profiling: tools/perf.mjs high 40 and tools/profile-player.mjs 40 private/evidence/<run>, never simultaneously.
- General: node tools/layout-check.mjs; node tools/build.mjs; node tools/shots-gpu.mjs <private evidence folder>; node tools/test-player.mjs <private evidence folder> low. The last uses software rendering for control checks; it is NOT GPU performance evidence.
- tools/chrome-session.mjs is the generic session utility, reviewed with loopback-only debugging, isolated profiles, explicit own-browser close and cleanup. One startup timed out under overlapping load, exact cause not proven. Review Runtime.enable error-listener timing if extending it.
- tools/extract-slide.ps1 now has -Slide, direct COM picture/slide exports, no clipboard use; preserve existing PowerPoint sessions.
- Baking pipeline and Blender/Godot paths are in the playbook; do not rebuild existing models. Bakes for new layouts may be needed. Build currently packages Injection only.

## Owner rules and unresolved decisions
Very short simple English reports after each verified piece. Claim only proven results, otherwise say "not proven". Never push; never commit private/ or dist/; never put company figures in public HERDR or upload company inputs. Secrets and sign-ins stay with the owner. Preserve existing edits. Back up untracked/ignored content before overwriting. Snapshot and explicitly archive ignored evidence at a stop.

All browser work in Google Chrome. Normal interactive URLs use the mandatory windows-chrome-launcher helper and corporate profile routing. Tests use headless installed Chrome in fresh isolated profiles; do not touch personal/corporate profiles or show test windows. Look at screenshots yourself. Office files through COM only.

Memory stop is 96% Windows commit; below that use -IgnoreMemory if the old 90% Herdr guard rejects. Prefer native GetPerformanceInfo over WMI here: the prior WMI query stalled. No secrets or approval/trust configuration changes. Owner approved lead answering ONLY folder trust for a folder it chose. Other approvals/sign-ins belong to the owner.

Unresolved real inputs: actual Injection process step order and Manual/Auto per move; real dimensions; acceptability of thinned racks; better CAD/PDF if available; exact new chapter lift/transfer details where source does not prove them. Keep DRAFT ORDER. Ask only for a real owner decision, after doing independent work that does not depend on it.

Commit locally after every finished verified piece, update STATUS/project memory, record generic durable lessons and significant case studies in HERDR as required. Never stage HERDR/tasks/: unrelated untracked files there may contain company details. HERDR check.ps1 passed at the paused checkpoint. Do not run application work concurrently with the outgoing Codex.

## Acknowledgment required
Read the first-read list, then create docs/CLAUDE-2040-TAKEOVER-ACK.md with: account/model/effort as actually shown; lead ownership; files read and local data located; real completion limits; your first task; any real blocker. Acknowledge in the pane in short simple English. If an account/model limit or sign-in prevents takeover, report the exact observed state; do not silently switch the requested account/model. After the handoff, own the remaining plan under the owner's standing authorization. Codex will end its work and leave you as lead.
