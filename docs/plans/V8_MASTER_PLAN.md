# V8 master plan: player, engine, agent control and design

Written 2026-11-11 by a planning delegate (Claude Fable 5.2, high effort). No code, scene or other doc was changed to write it.
The reader is the implementer (Claude Opus 5.5, medium effort) who has only this file and the repository.

**Status of this document:** a plan. Nothing in it is built yet unless a section says "exists today".

## 0. How to use this plan

1. Read sections 1 and 2 once (what is there, what is wrong, where we are going).
2. Then work through section 6 in order. Each task there is complete on its own: goal, files, functions, data, UI text, edge
   cases, tests, acceptance numbers, docs, and what not to touch. Do one task, run its checks, then the next.
3. Sections 3, 4 and 5 are the designs the tasks refer to (the tasks quote section numbers). When a task and a design section
   disagree, the task wins (it is the later, more exact text) and you note the disagreement in the commit message.
4. Never guess. If something needed is missing here, stop that task, write the question into `docs/OPEN_ISSUES.md` and go on with
   the next task that does not depend on it.

### 0.1 Notation used in this file

- **`MF`** means `node tools/mf.mjs`. Planned commands are written as `MF <verb> ...` with a capital `MF` on purpose: the docs
  check (`tools/v7/docs-check.mjs`, rule 4) fails on any lower-case mf command in a `docs/` file that is not in `COMMANDS` yet.
  When you implement a verb, the real docs (`docs/CLI.md`, recipes, guides) use the normal lower-case form.
- Commands that exist today are written in their normal form, for example `mf shots`.
- "the player" = the built HTML file. "the engine" = the JavaScript inside it that plays a scene. "the Studio" = the editor add-on.
- Units: **scene files use metres, seconds, degrees**. "unit" or "engine unit" = 0.3 m (the internal frame unit). Angles inside
  the engine are radians. Every signature below says which unit it takes.
- Story time = seconds on a path's timeline, intro included (`INTRO` = 7 s). Trolley time = story time minus the intro.
- "the 10 paths" = the owner's paths: `inj1` 2, `inj2` 2, `eps` 4, `press` 2.

### 0.2 Rules that hold for every task (project rules, do not break them)

| rule | what it means in practice |
|---|---|
| Each version is a new dist file | `dist/Material_Flow_Player_v<version>.html`. Never rewrite an older one. Experiments go to `dist/test/<name>.html`. |
| Company data is never committed | `private/` and `dist/` are git-ignored and stay so. No stop coordinates, plan pictures or layout numbers in tracked files. Tests use `docs/examples/*.scene.json` or synthetic data. |
| Docs, changelog and lessons in the same commit | Every task lists its docs. `node tools/mf.mjs docs-check` must pass before a commit (the hook runs it). |
| Data first, engine last | A request that the scene format can express is a scene edit, never an engine change. |
| The 10 paths stay identical | After any engine change run the identity test (task T0.4 gives the exact command). Motion (pose per 0.1 s, timeline, reads, scans) must not change unless the task says so. |
| Headless Google Chrome for tests | Through `tools/v7/cdp.mjs` (`openPage`). Fresh profile, never visible, GPU tests one at a time. |
| Working product first | Each milestone ends with a player the owner can open and try. Minimum checks listed per task; no extra test suites. |
| English only | Code, comments, docs, commit messages. |
| No new dependencies, no installs | No npm packages, no downloads, nothing new installed. The player and the CLI are plain browser JavaScript and plain Node (v25 on this PC). Blender 5.2.3 and Godot 4.7.2 **are installed** (owner, 2026-11-11; paths and uses in 4.10) and may be used by off-line tools only: the player never needs them, and every tool that uses them must say so and fail with a clear message when they are missing. |
| No git by delegates | The lead commits. A delegate reports changed files. |

## Table of contents

- 1. Diagnosis
  - 1.1 What was examined
  - 1.2 Architecture today
  - 1.3 What is solid
  - 1.4 What is fragile
  - 1.5 Pain points, ranked
  - 1.6 Work that landed on disk while this plan was written
- 2. Target architecture and decisions
- 3. Agent control: the full surface
  - 3.1 Principles
  - 3.2 Common grammar (ids, places, times, results, errors)
  - 3.3 Operation catalogue
  - 3.4 The CLI
  - 3.5 The page API `MF.agent`
  - 3.6 Inspection
  - 3.7 Rendering: pictures and films
  - 3.8 Transactions, history, undo, diff
  - 3.9 The self-check loop
  - 3.10 Parity table
- 4. Engine improvements
  - 4.1 Engine from source (the way off string patches)
  - 4.2 One motion model
  - 4.3 The planned camera
  - 4.4 Recording
  - 4.5 Performance on Intel Iris Xe
  - 4.6 Layout fidelity
  - 4.7 Several trolleys: queueing
  - 4.8 Robustness
  - 4.9 Format version 2
  - 4.10 Blender and Godot: concrete uses
- 5. Design and controls
  - 5.1 Problems seen on screen
  - 5.2 Principles
  - 5.3 Style tokens
  - 5.4 Layout and workspaces
  - 5.5 Screens (mockups)
  - 5.6 Keyboard, mouse, touch
  - 5.7 Empty states, onboarding, messages
  - 5.8 Accessibility
  - 5.9 Remove or merge
- 6. Implementation plan (milestones M0 to M11, every task)
- 7. Risks and open questions for the owner
- Appendix A. Schema rows to add
- Appendix B. Error codes
- Appendix C. Test matrix
- Appendix D. MP4 file layout for the recorder
- Appendix E. Camera planner, step by step
- Appendix F. Names inside the engine a coder needs

---

## 1. Diagnosis

### 1.1 What was examined

- All entry docs, the scene manual, CLI, recipes, engine notes, control guides, decisions, open issues, lessons, both review
  reports, the changelog, the parity table, the handoff of the round in progress with its Step 2 / Step 6 evidence and the
  Phase E results (requests 1 to 7), and the queued Codex task for camera and layout.
- All code of the V7 line: `tools/build-v7.mjs`, `tools/v7/engine-patches.mjs` (74 patches), `scene-core.js`,
  `preload-scene.js`, `scene-ui.js`, the six `studio-*.js` files, `tools/mf.mjs`, `mf-ops.mjs`, `mf-commands.mjs`,
  `docs-check.mjs`, `cdp.mjs`, and the camera, identity, start and take tests.
- **The engine inside `dist/Material_Flow_Player_v7.7.1.html`** (the owner's current file, built 2026-11-11 13:11, sha256
  `7968c1aecdd3610a…`). Its script 11 (2,097 lines, 188 KB) was read section by section: state, renderer, motion schedule,
  camera (`setWant`, `aisleAz`, `SIGHT`, `moveCam`), the frame loop, the preparing screen, the `MF` export.
- The player was run headless on this PC (Intel Iris Xe, ANGLE D3D11, 1920 x 1080): a screenshot tour of every Studio panel
  (`dist/test/fable-tour/`), guided-camera pictures of every INJ 1 step (`dist/test/fable-shots/`), a measured probe
  (`dist/test/fable-probe-771.json`) and camera calm runs at 1x and 3x (`dist/test/fable-calm-771.log`).

Measured on `v7.7.1` on this PC (facts used later):

| what | INJ 1 | Press |
|---|---|---|
| frame time while playing, 1x, guided | p50 16.7 ms, p99 16.9 ms, worst 33 ms | p50 16.7, p99 16.8, worst 17 |
| draw calls per frame | 45 | 37 |
| triangles per frame | 0.64 million | 1.04 million |
| instanced meshes / instances | 22 / 6,739 | 12 / 7,512 |
| shader programs | 53 | 51 |
| CPU per frame (JavaScript) | about 4 ms | about 3 ms |
| guided camera "rescues" (the eye is teleported) in 15 s of normal play | 19 | 5 |
| H.264 encoding through WebCodecs (`VideoEncoder`, `avc1.640028` and `avc1.64002A`, 1080p) | supported | supported |

Guided camera on `v7.7.1`, path `inj1-wh`: 95 % turn speed 26.2 deg/s at 3x but 35.7 deg/s at 1x; the fastest moment is at
33.4 s at 3x and at 38.8 s at 1x. Path `inj1-umb`: 9 direction changes at 3x, 11 at 1x. **The same path gives a different
camera at a different playback speed.**

Camera acceptance test on `v7.7.1` (`tools/test-camera-v5.mjs`, guided), run for this plan:

| run | result |
|---|---|
| Press path 2, 3x | FAIL: 2 of 1,201 samples hidden (t = 169.7 s and 175.9 s, behind a floor) |
| INJ 2 path 2, 1x | FAIL: 2 of 2,306 samples hidden (t = 36.7 s behind a floor, t = 60.9 s behind a steel part) |
| INJ 2 path 2, 3x | the test itself crashed at start (`tabs` is null: it launches Chrome on a random port with no error handling, unlike `tools/v7/cdp.mjs`) |

So the owner's file has more hidden moments than the one sample recorded in `docs/OPEN_ISSUES.md` (issue 1), they move with
the playback speed, and the camera test is not reliable enough to be a gate. Log: `dist/test/fable-calm-771.log`.

### 1.2 Architecture today

```
 SOURCES (tracked)                         PRIVATE / DIST (never committed)
 -----------------                         --------------------------------
                                           dist/Material_Flow_Player_v4.html   (built on another PC; the approved look)
 tools/build-v6.mjs + tools/v6/*  ------>  dist/Material_Flow_Player_v6.html   (10 MB: three.js, data, models, engine)
                                                     |
 tools/build-v7.mjs <stage>                          |  read as TEXT
   1. bake scenes  <---------------------- private/v7/scenes/<tab>.scene.json  (the owner's scenes, metres)
   2. insert scene-core.js + preload-scene.js before the data script
   3. apply 74 exact-once STRING PATCHES (tools/v7/engine-patches.mjs) to the engine and replica text
   4. append stage modules in two IIFEs:  [scene-ui.js]  [studio-core, -camera, -edit, -director, -numbers, -ui]
   5. parse every inline script, run docs-check
                                                     |
                                                     v
                                           dist/Material_Flow_Player_v7.x.html

 INSIDE THE PLAYER (one HTML file, 13 inline scripts)
 ----------------------------------------------------
  1 three.js   2 three add-ons   3 light-repair tables   4 baked scenes (JSON)   5 scene-core.js -> window.MFScene
  6 preload-scene.js -> MFV7_LOAD, MF7_CLEAN_LIGHT        7 device sizes + project data  var P = {...}  (layout, pictures)
  8 atmosphere  9 look.js (materials)  10 model data + replica builder -> window.MFReplica
  11 THE ENGINE: camera-envelope + one 1,950-line function: state S, renderer, plates, motion schedule (pure function of
     story time), route ribbons, CAMERA (guided / follow / chase / presets, SIGHT), overlay, player UI, reflection, frame
     loop + governor + preparing screen, devices (PC, gates, scanners)  -> window.MF  (54 members, MF.x = Studio internals)
 12 scene-ui.js  -> window.MFS  (scene file panel, load / save, drop)
 13 Studio       -> window.MFX  (52 members: document "doc" in ENGINE UNITS, undo, edit tools, director, takes, fleet, UI)

 DATA FLOW
 ---------
  scene (metres) --MFScene.toInternal--> D.nodes / D.flows / D.devices (units) --buildFlow--> items with t0 / tm / t1
                                                                                  |
  Studio: doc (units) <--fromScene / toScene--> scene      frame(dt): S.t += dt * speed -> lotPos(t) -> setWant -> moveCam
                                                                                  |             (springs, sight rescue)
  Node CLI: tools/mf.mjs -> mf-ops.mjs (its OWN copy of the motion maths) + scene-core.js through vm
            browser verbs: build a temp player in dist/test, drive it with cdp.mjs through MF / MFX / MFS globals
```

### 1.3 What is solid (keep, build on it)

1. **The scene file.** `mf-scene` version 1: metres, stable ids, four route types, layout edits and additions, director,
   takes. One validator (`scene-core.js`) runs in the player and in Node, with planted-fault tests.
2. **Trolley motion is a pure function of story time** (`buildSchedule`, `sampleSchedule`, `lotPos`). It seeks, replays and
   compares exactly. The identity test proves the 10 paths against V6.
3. **Steady-state rendering.** 37 to 46 draw calls, everything static is instanced, 60 fps with 4 ms of JavaScript per frame
   on Iris Xe. There is no steady-state performance problem to solve.
4. **Docs generated from code** (fields, CLI, keys) and a docs check wired into the build and the commit hook.
5. **The headless driver** `tools/v7/cdp.mjs`: bounded waits, own profile, clean-up.
6. **Transactions in the Studio**: `commit` / `commitFrom` / `cancelTo` with rollback, undo across layout reloads.
7. **Fail-loud build**: exact-once patches and a parse of every inline script.

### 1.4 What is fragile

1. **String patches on a frozen 10 MB HTML file.** 74 patches, order-dependent, some are 20-line string literals with escaped
   quotes; the engine cannot be read, linted, searched or unit-tested as source. Every camera change is a patch on a patch.
   `src/player.js` in the repository is an old ancestor (115 KB, no `SIGHT`, no devices) and misleads readers.
2. **The released file is not protected.** `tools/build-v7.mjs` refuses to overwrite v4 to v7.7 but not `v7.7.1`. `STAGE` in
   `tools/v7/mf-commands.mjs` is still `7.7.1`, so `mf bake` without `--out` would overwrite the owner's 7.7.1 file with
   today's unreleased engine, and `mf shots` / `mf play` / `mf take` already run the unreleased engine under the 7.7.1 name.
   The owner's file has none of today's work: no `layoutAdds`, no calm camera, the old rescue.
3. **The guided camera is reactive, not planned.** Each frame it picks an angle (`SIGHT.choose`), eases toward it with
   frame-time and speed-dependent rates, runs springs, and then a rescue may teleport the eye. Holds use a wall clock.
   Result: different films at different speeds, snaps at elevators (200 to 800 deg/s single frames), 19 rescues in 15 s on a
   plain path, and a test that can pass or fail by timing. The V3 elevator shots (`cineShot` A / B / C) are switched off
   ("no untested cinematic cuts"), so rides have no designed camera at all.
4. **Three motion models.** The engine (`buildSchedule`), the CLI (`mf-ops.mjs` re-implements leg times, turns, scans, lift)
   and the Studio Numbers tab (estimates). Seen on screen: Numbers tab 1:08.0 and 423 trips for `inj1-wh`, CLI 69.3 s and 415.
5. **Two unit systems cross the file boundary.** Camera keys and viewpoints are stored in engine units and radians; the
   Studio document is in units; scenes are in metres. Agents cannot write a key by hand.
6. **Two edit paths.** The Studio edits `doc` in units with its own straighten / L / relink code; the CLI edits the scene in
   metres with `mf-ops.mjs`. Same button, two implementations (`straightenPath` in `studio-edit.js`, `straightenPoints` in
   `mf-ops.mjs`).
7. **Recording runs in real time on a wall clock.** `MediaRecorder` on a canvas stream while the story plays: the first
   seconds freeze while the clock runs (Phase E request 7: 3 to 9 s, a stop lost), the length is not exact, a 3-minute path
   takes 3 minutes, captions are redrawn by hand on a canvas (no right-to-left layout), and `mf take` does not save a take.
8. **Layout additions are identified by list position** (`100000 + 1000 * index`). Reordering or removing an entry silently
   retargets edits. Added items have no shadow in the baked floor light.
9. **The fleet is a picture, not a model.** Copies share the lead's timeline, do not wait, are compared in plan across
   floors. Numbers multiply trips by trolleys.
10. **The UI is floating glass.** Three translucent panels cover about half of a 1600 x 900 window, panels overlap each other
    (Scene file over the camera pad; the floor tag under the Studio header), text sits on a busy bright 3D picture, the
    timeline lanes are 8 px high.
11. **The agent surface is partial.** 18 verbs. No verb to add or move a stop, device, object, step, path, layout item or
    door; no key / caption / take edit or delete; no "where is the trolley at t"; no machine-readable output; no undo.
    Agents hand-edit JSON and then repair it.
12. **Cold start.** 51 to 53 shader programs are compiled on a fresh start; the slow opening is hidden by a cover, not solved.
13. **Tests depend on timing and on private data.** The camera test samples every 4th frame of a real-time run; most tests
    need the owner's scenes; a Chrome start costs about 10 s per run.

### 1.5 Pain points, ranked

Rank = owner value x how often it hurts, with the fix's milestone (section 6).

| # | pain | evidence | root cause | fixed in |
|---|---|---|---|---|
| 1 | Camera movements: snaps, swings, different at each speed, elevators cut | owner ("many problems"); 1.1 numbers; Step 6: 200 to 800 deg/s at rides; rescues 19 per 15 s | reactive per-frame camera + teleporting rescue; no ride design | M3 |
| 2 | Films: frozen start, wrong length, no exact-length film, bilingual captions unclear, Arabic order doubt, take not saved | Phase E request 7 (a) to (e); OPEN_ISSUES 9, 15 | real-time capture on a wall clock; hand-drawn captions | M2 |
| 3 | The owner's file is behind the tools and can be overwritten by them | 1.4 item 2 | no release step, missing guard | M0 |
| 4 | Engine changes are slow and risky | LESSONS L-PL-04 to 07, review "string patches retained" | 1.4 item 1 | M1 |
| 5 | Agents hand-edit JSON for most requests and guess coordinates | PARITY (most rows say "edit the field"); Phase E gaps closed by more prose each time | 1.4 item 11 | M4 |
| 6 | Agents cannot see state without a picture (where is the trolley, what is on screen, how close) | Phase E: `--at` and `congestion` were added ad hoc | no inspection API; motion maths only in the page | M5 |
| 7 | Layout match with the slides is manual pixel work | STEP2 / STEP6; review idea 2 | no calibration overlay, no "draw a rectangle -> layout item", doors only as data | M6 |
| 8 | Added layout items look pasted on (no shadow) and are fragile to reorder | SCENE_MANUAL "no pre-baked shadow"; DECISIONS 2026-11-11 slots | positional slots; light baked once in Blender | M6 |
| 9 | Screen is crowded, controls are scattered, timeline too small | 5.1 | floating panels, no workspaces | M7 |
| 10 | Numbers disagree between Studio and CLI; fleet numbers are not real | OPEN_ISSUES 11, 14; screenshot vs CLI | 1.4 items 4 and 9 | M1 (one model), M8 (queueing) |
| 11 | Validator gaps: placed objects not swept in Node, PCs at free angles approximated | OPEN_ISSUES 12, 13 | split checks | M5 |
| 12 | Cold-start stutter hidden, not understood | OPEN_ISSUES 2 | shader compile + first uploads during the rise | M9 |
| 13 | Auto routes detour around narrow doors | OPEN_ISSUES 4, L-PL-11 | router margins wider than the validator's | M5 |
| 14 | Tests are slow and timing-bound | 1.4 item 13 | everything goes through a real-time browser run | M1, M3, M5 |

### 1.6 Work that landed on disk while this plan was written (read before M0, M2 and M3)

Another agent (the Codex review, task 2: camera and films) changed the tools on 2026-11-11 between 21:12 and 21:30,
after sections 1.1 to 1.5 were researched. None of it is released (`STAGE` is still `7.7.1`; no `v7.7.2` file exists),
and none of it was verified for this plan. Where this section and a later section disagree, this section wins.

| new on disk | what it does | effect on this plan |
|---|---|---|
| `tools/v7/camera-review-patches.mjs` (appended to the patch list by `engine-patches.mjs`) | The reactive camera now runs on the story clock: `camScale` = playback speed, fixed 1.5 s look-ahead, story-time hysteresis and feed-forward. Higher house view (`CALM.pol` 0.58 = tilt 57 degrees, look-ahead 12 units x 0.25). A clear shot is held across steps. Fixed base azimuth. The intro lands on the first trolley shot. A ride function `rideView(t)` eases the camera to a near-vertical shaft view before each ride and hides the upper floor (cutaway) until the trolley comes out. Chase camera: slower, wider, protected by the sight rescue. Seek resets the angle history. | The baseline for M3 is this camera, not the one measured in 1.1: re-measure with `tools/v7/camera-calm.mjs` and the camera test in T0.3 and use those numbers as "before". The planned camera (4.3) is still the target, because a per-frame choice plus rescue still cannot be proven clear in advance or tested by seeking. Take the house tilt from `CALM.pol` (`PARAMS.housePol = 0.58`, `pols = [0.58, 0.45, 0.3, 0.12]`). The shaft-view-with-cutaway ride is now the **default ride design** of the planner; the three-beat ride of 4.3.2 becomes the alternative the owner may choose (question Q2). |
| the same file, last patch: `if (window.MF7_EXPORT) { requestAnimationFrame(tick); return; }` | While `window.MF7_EXPORT` is true the animation loop idles. | This **is** the off-line hook of T2.1. Do not add a second one: T2.1 keeps this flag, and only adds `MF.x.setRenderScale` and `MF.x.governor`. |
| `tools/v7/studio-director.js`: `prepareExport(take)`, `exportFrame(index)`, `finishExport()` (on `MFX`) | Frame-stepped rendering as in 4.4 step 1: warm-up frames, then one `MF.frame(1 / fps)` per film frame with the story time set exactly; each frame is returned as a JPEG (quality 0.96) with the story time and the trolley pose. | T2.3's `recordFilm` is built **on these three functions** (same stepping and warm-up); it replaces only what happens to each frame: `VideoFrame` -> `VideoEncoder` -> `MFMp4` in the page, instead of JPEG text sent to Node. |
| `tools/v7/film-export.mjs` + `tools/mf.mjs` `take` | The CLI pipes the JPEG frames into **ffmpeg** (`libx264`, crf 18), checks the story clock per frame, the frame count and length with **ffprobe**, and freezes with ffmpeg's `freezedetect` against the trolley's movement; writes `<out>.json`. | Exact-length films from the CLI exist now, but only where ffmpeg is on the PATH, not from the Studio button, and with a JPEG step before encoding. ffmpeg was put on this PC without the owner's approval (question Q9). Decision for M2: the WebCodecs path of 4.4 becomes the default for the Studio and the CLI; `film-export.mjs` stays as `--encoder ffmpeg` (used automatically only when WebCodecs is missing **and** ffmpeg is found); its clock-drift and freeze checks are kept for both encoders. If the owner approves ffmpeg (Q9), T2.2 to T2.4 may be postponed and M2 shrinks to T2.5 (options, languages, receipt) and T2.6 (Studio button calling a local helper is not possible without a server, so the Studio would keep real-time capture). |
| `tools/v7/scene-core.js`, `mf-ops.mjs`, `studio-ui.js`, `studio-camera.js`, `camera-calm.mjs` (also changed) | Not read after the change. | Re-read them at the start of M0; signatures quoted in this plan (for example `cameraKey`, `numbers`, `MFX` members) are from the earlier state. |

Other consequences:

- The patch count is no longer 74; T1.1 does not depend on it (it extracts the built reference, whatever the patch list is).
- T0.3 must verify **both** review tasks (layout and camera / film): all 10 paths in the camera test at 1x and 3x, the
  identity row, and one `mf take` film with its receipt, before `v7.7.2` is released.
- The run of 1.1 that failed on the owner's 7.7.1 file stays valid as a description of what the owner has today.

---

## 2. Target architecture and decisions

### 2.1 The picture

```
 SOURCES (tracked)                                              PRIVATE (never committed)
 ------------------------------------------------------         ---------------------------------------
 src/v8/shell.html, player.css                                  private/v8/base/projects.json   (layout, plan pictures)
 src/v8/vendor/three.js, three-addons.js                        private/v8/base/assets.js       (3D model data)
 src/v8/player/*.js      the engine as readable source          private/v8/base/device-dims.js
 src/v8/replica.js, look.js, dfatmos.js, camera-envelope.js     private/v7/scenes/*.scene.json  (owner's scenes)
 SHARED CORES (plain scripts: the page AND Node load the same file)
   tools/v7/scene-core.js   format, validator, router, layout edits            (exists)
   src/v8/motion-core.js    schedule, timeline, pose at t, fleet queueing      (cut out of the engine, M1)
   src/v8/sight-core.js     conservative box model, line of sight              (M3)
   src/v8/camera-plan.js    planned camera: shots, transitions, rides          (M3)
   tools/v7/scene-ops.js    EVERY edit and inspection as a named operation     (M4)
 FRONT ENDS over the same operations
   Studio (person)  -->  actions registry --> scene-ops --> scene --> engine
   tools/mf.mjs     -->  scene-ops in Node (no browser for edits and inspection); browser only for pictures and films
   MF.agent (page)  -->  scene-ops in the page + player control, JSON in / JSON out
 tools/build-v8.mjs  = concatenate sources + private base + baked scenes  ->  dist/Material_Flow_Player_v8.N.html
```

### 2.2 Decisions (add each to `docs/DECISIONS.md` in the task that implements it)

| id | decision | instead of | why |
|---|---|---|---|
| D1 | The engine becomes source files. The text that the 74 patches produce today is saved once as `src/v8/` files; the build concatenates them. The first source build must be byte-identical to the patch build. | more patches on V6 | readable, searchable, testable code; the identity is provable by a hash; the V6 file and the patch list stay in the repository as history |
| D2 | One motion model in `motion-core.js`, used by the engine, the CLI and the Studio. | three copies | numbers can never disagree again; `where`, `numbers`, congestion work in Node in milliseconds |
| D3 | The guided camera is planned: a pure function of story time built from held shots and eased transitions, checked against a conservative sight model before playback. The old reactive camera stays behind a switch as the fallback. | tuning the reactive camera further | calm by construction, identical at every speed and on seek, recordable frame by frame, testable without a GPU |
| D4 | Films are rendered frame by frame (story time advances by exactly `speed / fps` per frame) and encoded with WebCodecs into MP4 by a small own muxer. `MediaRecorder` stays as the fallback. | real-time screen capture | no frozen start, exact length, exact frame count, faster or slower than real time without harm |
| D5 | Every edit is an operation in `scene-ops.js` with a declared parameter list. The CLI help, the docs, the Studio command palette and `MF.agent` are generated from that one table. | separate Studio and CLI code | parity by construction: a new operation appears in all three front ends |
| D6 | CLI edits are transactions: validate, write atomically, keep the previous file in a history folder, `undo` restores. The rule for writing is "no new error", not "no error". | "write only when the whole scene is valid" | a broken scene can be repaired step by step; nothing an agent does is unrecoverable |
| D7 | Format version 2 (M6): camera keys and viewpoints in metres and degrees; layout additions get a permanent `slot` number. The player reads versions 1 and 2 and writes 2. | engine units in files; positional slots | removes the last unit trap; reordering additions becomes safe |
| D8 | The screen has three workspaces (Present, Build, Direct) with docked opaque panels; the 3D view is re-centred in the free area. | floating glass panels | the picture is never covered; one place for each control |
| D9 | Two levels of floor light for a changed layout: (a) painted shadows at load, always, with no tool (what a person sees right after an edit in the Studio); (b) a true re-bake with Blender Cycles at build time (`MF light`), used by the player whenever the bake matches the scene's layout. | only one of the two | (a) keeps editing instant and the player self-contained; (b) gives the approved V4 look for the owner's released scenes now that Blender is installed |
| D13 | Godot is tried as an optional second renderer for films and stills in a time-boxed experiment (M11) with a go / no-go. The one-file HTML player stays the product. | move the engine to Godot; ignore Godot | the owner asked for a Godot path; a second engine is only worth keeping if it clearly beats the browser film on quality for acceptable effort |
| D10 | Fleet queueing is computed up front as a time warp per trolley (pure function of story time). Off by default. | per-frame avoidance | keeps seek, replay and recording exact; the 10 paths stay identical |
| D11 | Versions: this plan ships as `v8.0`, `v8.1`, ... The owner's queued features keep their content and ship as later 8.x files (table in 2.3). | reuse the names V7.8 to V7.10 | one number line, no clash with the foundation releases; the owner may rename (question Q1) |
| D12 | Tests that can run without a browser do (cores in Node, synthetic scenes from `docs/examples/`). GPU tests are few, sequential, and only assert what needs a GPU. | every check in a real-time browser run | minutes become seconds; no timing flakiness |

### 2.3 Releases

| file | milestone | content | owner sees |
|---|---|---|---|
| `v7.7.2` | M0 | the round in progress, released and guarded | layout additions, calmer camera (already built, not yet released) |
| `v8.0` | M1 | engine from source, one motion model | nothing new on screen; Numbers tab and CLI agree |
| `v8.1` | M2 | film recorder | films with no frozen start, exact length, language per film |
| `v8.2` | M3 | planned camera | calm guided camera, designed elevator rides |
| `v8.3` | M4 | operations, full CLI, history / undo | (agents) every edit is a command |
| `v8.4` | M5 | inspection, self-check, `MF.agent`, validator and router gaps | (agents) answers without pictures; fewer false detours |
| `v8.5` | M6 | layout fidelity, format 2 | shadows under added items, door tool, slide overlay |
| `v8.6` | M7 | new screen layout | workspaces, big timeline, command palette |
| `v8.7` | M8 | queueing trolleys | trolleys wait for each other; real trips per shift |
| `v8.8` | M9 | cold start and film quality | faster opening, sharper films |
| `v8.9` to `v8.12` | M10 | ghost trolley, story layer, parallel worlds, report to film | the owner's queued features |
| (no player file) | M11 | Godot film path experiment | a go / no-go with one sample film |

Each milestone adds its stage to `STAGES` in the build, sets `STAGE` in `tools/v7/mf-commands.mjs` only after the lead has
verified the new file, and adds the previous file to the build's read-only list.

---

## 3. Agent control: the full surface

### 3.1 Principles

1. **An agent never needs to hand-edit JSON.** Every change the Studio can make is an operation with named parameters in
   metres, seconds, degrees and ids. Hand-editing stays possible and is validated the same way.
2. **An agent never needs a picture to know a fact.** Positions, times, distances, clearances, visibility are answers of
   inspection operations. Pictures are for judging looks.
3. **Everything is recoverable.** Dry run, diff, history, undo.
4. **Everything is machine-readable.** `--json` on every verb; one result shape; stable error codes.
5. **One table.** `OPS` in `tools/v7/scene-ops.js` declares every operation: name, parameters (type, unit, required, default),
   result, errors, and the Studio action it mirrors. Help, docs and the page API are generated from it.

### 3.2 Common grammar

**Ids.** `^[a-z0-9][a-z0-9-]{0,39}$`. When an operation creates something and no id is given, the id is made from the name
(`slug`, as `scene-core.js` does) and returned in the result.

**Place** (a point on a floor). Accepted forms, everywhere a parameter is of type Place:

| form | meaning |
|---|---|
| `[x, y]` (JSON) or `x,y` (CLI) | metres in the plan frame |
| `stop:<id>` | that stop's point |
| `device:<id>` | a PC / gate centre, a scanner's `at` |
| `object:<id>` | a placed object's centre |
| `add:<id>` | centre of a layout addition |
| `wall:N`, `rack:N`, `machine:N`, `column:N`, `pallet:N` | centre of that layout object (after edits) |
| `elevator:<label>:low` / `:high` | a landing |
| `trolley@<Time>` | where the trolley of the operation's `path` is at that time |

A Place that does not carry a floor (plain numbers) needs the operation's `floor` parameter; the others imply their floor.

**Time** (story seconds). Accepted forms:

| form | meaning |
|---|---|
| a number | story seconds (intro included) |
| `start` | when the trolley first shows (`INTRO`) |
| `end` | the path's total |
| `step:<id>` or `step:<id>:arrive` | the moment the trolley arrives at that step's stop (`tm`) |
| `step:<id>:start` | the moment that step begins (`t0`) |
| `step:<id>:leave` | the moment the wait ends (`t1`) |
| any of the above followed by `+s` or `-s` | an offset in seconds, for example `step:s3:arrive-2` |
| `trolley:<s>` | trolley seconds (no intro): `INTRO + s` |
| `<n>%` | that share of the path's total |

Both are parsed by one function each in `scene-ops.js`: `parsePlace(scene, layout, v, ctx) -> { x, y, floor }` and
`parseTime(timeline, v) -> seconds`; both throw `OpError("E_USAGE", ...)` with the list of accepted forms.

**Result of every operation** (also the `--json` output of every verb, one object per run):

```json
{
  "ok": true,
  "op": "stop.move",
  "result": { "id": "buffer-a", "from": [74, 150], "to": [77, 150], "relinked": ["sample-1/s3", "sample-1/s4"] },
  "changed": ["stops[buffer-a]", "paths[sample-1].steps[s3].route", "paths[sample-1].steps[s4].route"],
  "numbers": [ { "path": "sample-1", "metresBefore": 85.9, "metres": 85.1, "secondsBefore": 37.9, "seconds": 32.9 } ],
  "warnings": [ { "code": "W_CLEARANCE", "where": "paths[sample-1].steps[s3].route", "msg": "passes 0.12 m from rack:12" } ],
  "errors": []
}
```

On failure: `"ok": false`, nothing is written, `errors` holds `{ "code", "where", "msg", "hint" }` (codes in Appendix B).
`numbers` lists only paths whose distance or time changed by more than 0.05.

**Exit codes of the CLI:** 0 = ok; 1 = the operation or the validation failed; 2 = wrong usage; 3 = environment (player file
missing, Chrome did not start, file not writable).

### 3.3 Operation catalogue

Columns: parameters (`*` = required; unit in brackets), result. All operations that change the scene also return `changed`
and `numbers`. Operations marked **(read)** change nothing. Operations marked **(page)** need the running player.

#### Scene

| op | parameters | result |
|---|---|---|
| `scene.info` (read) | | title, tab, floors with extents [m], elevators with both landings [m], counts, per path: id, name, steps, metres, seconds |
| `scene.set` | `title`, `notes` | the new values |
| `scene.validate` (read) | | `errors`, `warnings`, `stats` (the existing validator) |
| `scene.numbers` (read) | `shift` [h] = 8 | per path and step: metres, seconds, trips per shift (from `motion-core`) |
| `scene.diff` (read) | `other`* (a scene) | entity-level changes (3.8) |
| `scene.migrate` | `to` = 2 | converts the format version (M6) |

#### Stops

| op | parameters | result |
|---|---|---|
| `stop.add` | `name`*, `at`* (Place), `floor`, `id`, `symbol` = `area`, `color` | `{ id, x, y, floor }` |
| `stop.set` | `id`*, any of `name`, `symbol`, `color` | changed fields |
| `stop.move` | `id`*, `to` (Place) or `by` [dx, dy m]; `relink` = `auto` \| `straighten` \| `keep` \| `none` | `{ from, to, relinked: [path/step] }`. `auto`: every step that ends or starts there is re-joined (keeps drawn corners when the ends still fit, else routes) and then straightened, as the Studio does when a stop is dragged |
| `stop.rename` | `id`*, `newId`* | updates every step, `serves`, `stop` reference |
| `stop.remove` | `id`* | refuses with `E_REF` and the list of steps / devices that use it |

#### Devices

| op | parameters | result |
|---|---|---|
| `device.add` | `type`* (`pc` \| `rfid-gate` \| `scanner`), `at`* (Place), `floor`, `id`, `label`, and the type's own fields (`kind`, `heading`, `size`, `serves`, `done`, `color`, `lane`, `stand`, `stops`, `stop`) | the new device |
| `device.place` | `type`* (`rfid-gate` \| `scanner`), `path`*, `step`*, `where`* = `middle` \| `before-stop` \| `after-start` \| a number [m along the step] \| a Place near the route; `gap` [m] = 4.5 (for before / after); `side` = `auto` \| `left` \| `right`; `stops` = true (scanner) | computes the point exactly on the leg, the lane direction from the leg, the stand on a free side (tries `side`, then the other), returns `{ id, at, stand, lane, leg, metresAlong }`. This replaces the prose rules "a scan in the middle" of the manual |
| `device.set` | `id`*, fields | changed fields |
| `device.move` | `id`*, `to` or `by` | new position; a scanner with `stops: true` is re-snapped to the nearest leg within 1 m, else `E_GEOMETRY` |
| `device.remove` | `id`* | |

#### Objects (placed 3D objects)

| op | parameters | result |
|---|---|---|
| `object.add` | `type`*, `at`*, `floor`, `id`, `name`, `heading` [deg], `w`, `d`, `h` [m], `color`, `text` | the object (sizes default per type, the table `PROP_TYPES` moves from `studio-edit.js` into `scene-ops.js`) |
| `object.set` / `object.move` / `object.remove` | `id`*, ... | |
| `object.duplicate` | `id`*, `by` [dx, dy] = [1, 1], `count` = 1 | new ids |

#### Paths and steps

| op | parameters | result |
|---|---|---|
| `path.add` | `name`*, `from`* (stop id), `via` (list of stop ids, in order), `id`, `color`, `route` = `auto` \| `points-from:<path id>` | a path whose first step is `stay` at `from` and one auto-routed step per `via` stop; when a step crosses floors the needed elevator ride is inserted (lower-landing stop, ride, upper-landing stop are created when missing) |
| `path.set` | `id`*, `name`, `color`, `trolleys`, `headway` [s], `queue`, `gap` [m] | |
| `path.duplicate` | `id`*, `newId`, `name` | copies the director entry too |
| `path.reverse` | `id`* | refuses paths with an elevator ride (`E_RANGE`, rides go up only) |
| `path.order` | `id`*, `index`* (0-based) | reorders the tab buttons; renumbers the leading `N ·` of the names when `renumber` = true (default) |
| `path.remove` | `id`* | removes its director entry and takes |
| `step.add` | `path`*, `stop`*, `after` = `end` \| step id \| `start`; `id`, `title`, `text`, `mode`, `wait`, `speed`, `route` = `auto` \| `stay` \| points | the step; the following step is re-joined |
| `step.elevator` | `path`*, `elevator`* (label), `after` = `end` | adds "to the lower landing" (auto) and the ride; creates the landing stops when missing |
| `step.set` | `path`*, `step`*, any of `title`, `text`, `mode`, `wait`, `speed`, `stop`, `camera.distance`, `camera.heading`, `camera.tilt`, `camera.hold` | changing `stop` re-joins this and the next step |
| `step.move` | `path`*, `step`*, `to`* (index or `before:<id>` / `after:<id>`) | re-joins every step whose neighbours changed |
| `step.remove` | `path`*, `step`* | the next step is re-joined; refuses the last remaining step |
| `route.auto` | `path`*, `step` (omit = every step that is not a ride), `write` = `points` \| `auto` | writes exact points (default) or sets `{ "type": "auto" }` |
| `route.points` | `path`*, `step`*, `points`* (list of Place; first and last may be omitted: they are the previous end and the stop) | the stored points |
| `route.straighten` | `path`*, `step` | `{ changed: [], kept: [] }` (exists as `mf straighten`) |
| `route.l` | `path`*, `step`*, `first` = `auto` \| `horizontal` \| `vertical` | one corner |
| `route.corner` | `path`*, `step`*, `action`* = `add` \| `move` \| `remove`, `index`, `at` | corner editing (the Studio's drag, double-click, delete) |
| `route.fix-links` | `path` (omit = all) | re-routes every step that no longer joins (exists) |

#### Layout

| op | parameters | result |
|---|---|---|
| `layout.list` (read) | `kind`, `floor`, `near` (Place), `radius` [m] = 15, `box` [x0, y0, x1, y1] | objects with id (`rack:12`, or the addition's text id), kind, rectangle [m], height [m], whether edited |
| `layout.move` | `target`* (layout id or `add:<id>`), `by`* [m] | for an addition the entry itself is changed (no edit is appended) |
| `layout.turn` | `target`*, `deg`* (90, 180, 270) | |
| `layout.delete` | `target`* | built-in: a `delete` edit; addition: the entry is removed (format 2) or tombstoned (format 1, see 4.9) |
| `layout.restore` | `target`* | removes every edit of that target |
| `layout.door` | `at`* (Place on or near a wall) or `wall`* + `range`* [from, to m]; `width` [m] = 3.6; `note` | finds the nearest straight wall within 2 m of `at`, cuts a door centred there; result `{ wall, range, clearWidth }`; `E_GEOMETRY` when a column stands in the opening or the wall is slanted |
| `layout.door-on-line` | `from`*, `to`* (Places), `floor`, `width` = 3.6 | cuts a door in every wall the segment crosses; result: one entry per wall. This is "open a door where the owner's line crosses" |
| `layout.add` | `kind`*, `id`*, `floor`*, and `at` + `w`, `d` (or `box` [x0, y0, x1, y1]), `h`, `turn`, `color`, `rows`, `cols`, `pallets`, `label`, `note`; walls: `a`, `b` | the entry; refuses when it overlaps a route (`E_GEOMETRY`) unless `force` |
| `layout.add-set` | `id`*, fields | |
| `layout.grid` | `id`* (prefix), `kind`*, `floor`*, `box`*, `rows`*, `cols`*, `gapX`, `gapY` [m], `h` | adds rows x cols equal items in a box (the 16 tables case) with ids `<prefix>-r<i>c<j>` |

#### Director

| op | parameters | result |
|---|---|---|
| `key.add` | `path`*, `at`* (Time), `look` = `trolley` \| Place, `distance` [m] = 60, `heading` [deg] = 0, `tilt` [deg] = 40, `lens` [mm] = 48, `ease` = `smooth`, `id` | the key in plain words; replaces a key within 0.05 s |
| `key.set` / `key.remove` | `path`*, `id`* (or `at` to pick the nearest key), fields | |
| `key.list` (read) | `path`* | every key in plain words (time, look, distance, heading, tilt, lens, ease) whatever the stored format |
| `key.from-plan` | `path`*, `from`, `to` (Time) | writes the planned guided camera (4.3) as editable director keys |
| `key.clear` | `path`*, `from`, `to` | removes keys in the range |
| `caption.add` | `path`*, `from`* and `to`* (Time) or `step`* + `seconds` = 4; `title`*, `text`; `ar.title`, `ar.text`, `ko.title`, `ko.text`; `place`, `style`, `size`, `id` | the caption |
| `caption.set` / `caption.remove` / `caption.list` | `path`*, `id`* | `caption.set` with `ar.title` etc. adds a language without touching the others |
| `caption.from-steps` | `path`*, `seconds` = 4, `style` | one caption per step from its `title` / `text` (a quick first cut of a film) |
| `take.add` | `name`*, `path`*, `from` = `start`, `to` = `end`, `seconds` or `speed`, `fps` = 30, `cam` = `director`, `lang` = `en`, `captions`, `card`, `labels`, `quality`, `id` | the take |
| `take.set` / `take.remove` / `take.list` | `id`* | |
| `viewpoint.set` | `slot`* (1 to 6) or `name`*, `look`* (Place), `floor`, `distance`, `heading`, `tilt`, `lens` | |
| `viewpoint.remove` / `viewpoint.list` | | |
| `studio.set` | `snap`, `ortho`, `lang`, `shift` | |

#### Inspection (all read)

| op | parameters | result |
|---|---|---|
| `where` | `path`*, `at` (Time) or `every` [s] with `from`, `to` | `{ t, trolleyT, step, stepTitle, phase: hold \| move \| turn \| scan \| ride, floor, x, y, heading, speed [m/s], metresSoFar, nextStop, secondsToNextStop }` per moment |
| `timeline` | `path`* | per step: `t0`, `arrive`, `leave` (story s), metres, seconds; scans and gate reads with their times; rides; planned camera shots; captions |
| `clearance` | `path` (omit = all), `step`, `under` [m] = 0.8 | per leg: smallest gap [m], the object, the point; sorted by gap |
| `nearest` | `at`* (Place), `floor`, `kinds`, `n` = 5 | nearest layout objects, devices, stops with distance and direction (N / E / S / W) |
| `ray` | `from`*, `to`* (Places), `floor` | everything the straight segment crosses, in order: object id, entry point, for walls the along-wall coordinate (ready for `layout.door`) |
| `free` | `at`* (Place), `floor`, `w`* , `d`* [m], `turn` | whether that rectangle is free; if not, the objects in it and the nearest free position within 5 m |
| `fits` | `from`*, `to`* (Places), `floor` | whether the trolley can drive the straight line (the validator's sweep) and the tightest gap |
| `congestion` | `path`*, or `all` = true (every pair of paths) | closest approach, when, where, steps (exists; moves to `motion-core`, separates floors) |
| `camera` | `path`*, `at`* (Time), `cam` = `guided` | the camera in plain words: target [m] and floor, distance, heading, tilt, lens; for `guided` also the shot number and whether the sight model says the trolley is clear |
| `visible` (page) | `path`*, `at`* (Time), `cam` = `guided` \| `chase` \| `director` | exact answer from the rendered frame: `{ trolleyOnScreen, trolleyHidden, hiddenBy, onScreen: [ids of stops / devices inside the frame], screenXY }` |
| `scene.check` | `path`, `film` | the scorecard of 3.9 |

### 3.4 The CLI

One file stays the entry: `tools/mf.mjs`. Grammar: `MF <family> [action] <scene.json> [--param value ...] [global flags]`.
The family is the first word of the operation (`stop`, `device`, `object`, `path`, `step`, `route`, `layout`, `key`,
`caption`, `take`, `viewpoint`); the action is the second (`add`, `set`, `move`, ...). Parameters map one to one:
`--at 74,150`, `--by 3,0`, `--via stop-a,stop-b`, `--ar.title "..."`; a flag without a value is `true`.

Verbs that exist today keep working unchanged (`validate`, `bake`, `shots`, `congestion`, `play`, `take`, `numbers`,
`diff`, `straighten`, `route`, `fix-links`, `key`, `caption`, `layout-ref`, `docs-gen`, `install-hooks`, `docs-check`,
`help`). `key` and `caption` without an action word mean `add` (today's meaning); `take` without an action word means
`record`; `straighten`, `route`, `fix-links` become aliases of `route straighten`, `route auto`, `route fix-links`.

New top-level verbs:

| verb | usage | does |
|---|---|---|
| `MF info` | `<scene> [--json]` | `scene.info` |
| `MF list` | `<scene> <what> [--path id] [--floor F] [--near Place --radius m]` | lists stops, devices, objects, paths, steps, layout, adds, keys, captions, takes, viewpoints |
| `MF where` | `<scene> --path id (--at Time \| --every s)` | `where` |
| `MF timeline` | `<scene> --path id` | `timeline` |
| `MF clearance` | `<scene> [--path id] [--under 0.8]` | `clearance` (replaces `tools/v7/aisle-scan.mjs`) |
| `MF nearest` / `MF ray` / `MF free` / `MF fits` | as in 3.3 | geometry questions |
| `MF camera` | `<scene> --path id --at Time [--cam guided]` | `camera` |
| `MF apply` | `<scene> <ops.json> [--dry-run]` | a batch as one transaction (3.8) |
| `MF undo` / `MF redo` / `MF log` | `<scene> [--steps n]` | history (3.8) |
| `MF check` | `<scene> [--path id] [--film] [--json]` | the self-check loop (3.9) |
| `MF review` | `<scene> [--path id] --out dir` | pictures + contact sheets + numbers + an index file for a report |
| `MF sheet` | `<scene> --path id [--every 5] [--cam guided] [--out file.png]` | a contact sheet: one picture with a frame every N story seconds, each stamped with its time and step |
| `MF overlay` | `<scene> --picture file --floor F --box x0,y0,x1,y1 [--out dir]` | slide picture beside and over the 3D top view (wraps `tools/v7/compare-shots.mjs`) |
| `MF ops` | `[--json]` | the operation table (what `MF.agent.describe()` returns) |
| `MF migrate` | `<scene> [--to 2]` | format upgrade (M6) |

Global flags on every verb: `--json` (one JSON object on stdout, nothing else), `--dry-run` (do everything except write;
print the diff), `--player <file>`, `--note "why"` (stored in the history entry), `--force` (write although new errors
appear; the errors are still printed), `--quiet`.

Examples (each is a complete request an owner might make):

```
# "Add a buffer stop east of the Final Scan and send path 1 through it at half speed"
MF stop add s.json --name "Buffer A" --at 74,150 --floor 1F
MF step add s.json --path sample-1 --stop buffer-a --after s2 --speed 2 --wait 3

# "Put a manual scan in the middle of step 3 and a gate just before the Kitting stop"
MF device place s.json --type scanner --path sample-1 --step s3 --where middle
MF device place s.json --type rfid-gate --path sample-1 --step s5 --where before-stop

# "The line on the slide goes straight from A to B: open the walls"
MF ray s.json --from stop:a --to stop:b              # see what is in the way
MF layout door-on-line s.json --from stop:a --to stop:b --note "owner image 31"
MF route points s.json --path p --step s4            # straight line between the two ends
MF check s.json --path p

# "A 20 second film of path 1 in Arabic and English"
MF caption from-steps s.json --path sample-1
MF caption set s.json --path sample-1 --id cap-1 --ar.title "..." --ar.text "..."
mf take s.json --path sample-1 --seconds 20 --lang en+ar --out dist/test/film.mp4
```

Human output stays short: one line per result, `ERROR <code> <where>: <msg>` then `hint: ...` lines, and for edits a last
line `wrote <file> (undo: MF undo <file>)`.

### 3.5 The page API `MF.agent`

Purpose: drive the running player with JSON, from a test, from the CLI's browser verbs, or from an embedding page.

```
MF.agent.describe()                       -> { version, ops: [ { name, summary, params: [ { name, type, unit, required, default } ], page } ] }
MF.agent.call(name, params)               -> Promise<{ ok, op, result, changed, numbers, warnings, errors }>   (never throws)
MF.agent.batch(list, { atomic = true })   -> Promise<{ ok, results: [...] }>      list = [ { op, ...params } ]
MF.agent.on(event, fn) / off(event, fn)   events: "change" (scene changed), "time" (4 per second while playing), "state", "error"
```

Every operation of 3.3 can be called (scene operations act on the scene on screen, are undoable with Ctrl+Z, and autosave
like a Studio edit). Extra operations that exist only in the page:

| op | parameters | result |
|---|---|---|
| `player.state` | | `{ tab, path, t, total, playing, speed, cam, view, step, prepared, version, sceneHash }` |
| `player.set` | `path`, `t` (Time), `playing`, `speed`, `cam`, `view` (`2d` \| `3d` \| `auto`), `look`, `lang`, `ui` (`full` \| `clean` \| `none`), `labels`, `card` | the new state |
| `player.wait` | `until`* = `prepared` \| `idle` \| a Time \| `end`; `timeout` [s] = 600 | resolves when reached |
| `view.set` | `look`* (Place or `trolley`), `floor`, `distance`, `heading`, `tilt`, `lens`, `fly` [s] = 0 | sets the free camera in plain words |
| `view.get` | | the current camera in plain words |
| `view.picture` | `width`, `height`, `mark` (list of Places), `grid` [m] | `{ dataUrl }` of the composed frame (3D + labels + captions) |
| `scene.get` / `scene.load` | `scene` | the scene on screen / loads one (validated; layout changes reload the page as today) |
| `film.record` | a take (3.7) | `{ frames, seconds, fps, bytes, mime, frozenFrames, handle }`; `film.read { handle, offset, length }` returns base64 chunks |
| `visible` | 3.3 | |

A JSON-RPC 2.0 bridge on `window.postMessage` exposes the same calls: a message
`{ "jsonrpc": "2.0", "id": 7, "method": "where", "params": { "path": "inj1-wh", "at": 30 } }` is answered to its source
with `{ "jsonrpc": "2.0", "id": 7, "result": { ... } }` or `"error": { "code": -32000, "message": "...", "data": { errors } }`.
The bridge is off unless the URL has `?agent=1` (a page that embeds the player opts in).

`window.MFX`, `window.MFS` and `MF.x` stay as they are (the tests use them); new tools use `MF.agent` only.

### 3.6 Inspection

Covered by the "Inspection" table of 3.3. Where each answer comes from:

| answer | computed by | browser needed |
|---|---|---|
| trolley pose, timeline, numbers, congestion | `motion-core.js` | no |
| clearance, nearest, ray, free, fits | `scene-core.js` (solids, `gap`) | no |
| planned camera pose, "is the trolley clear" for the guided camera | `camera-plan.js` + `sight-core.js` | no |
| exact visibility in the rendered frame, what is on screen | the page (`visible`) | yes |
| looks | `mf shots`, `MF sheet`, `MF review` | yes |

### 3.7 Rendering: pictures and films

**Pictures** (`mf shots`, existing verb, new options):

| option | meaning |
|---|---|
| `--at Time` (accepts the Time grammar), `--look Place`, `--distance m`, `--heading deg`, `--tilt deg`, `--lens mm` | one picture of a moment from a described camera |
| `--cam guided\|chase\|director\|top` | use that camera at `--at` instead of a described one |
| `--size W,H` | default 1600,900 |
| `--ui full\|clean\|none` | `clean` = no panels, labels and card kept (default for `--at`); `none` = 3D only |
| `--lang en\|ar\|ko` | caption language |
| `--grid m` | draws a metre grid with coordinate numbers on the floor of the active plate (an agent can read positions off the picture) |
| `--mark Place[,Place...]` | draws numbered pins |
| `--floor F` | top views: show only that floor |

**Contact sheet** (`MF sheet`): frames every `--every` seconds (default: so that 24 frames cover the range), 4 columns,
each 480 x 270 with a caption line `0:26  s3 Manual RFID scan`. Purpose: an agent reviews a whole film in one picture.

**Films** (`mf take`, existing verb; with an action word it also manages saved takes):

```
mf take <scene> --path id [--from Time] [--to Time] [--seconds N | --speed s] [--fps 30|60] [--size 1920,1080]
        [--cam director|guided|chase] [--lang en|ar|ko|en+ar|en+ko|ar+ko] [--no-captions] [--no-card] [--no-labels]
        [--quality high|normal] [--out file.mp4] [--save name] [--poster] [--realtime]
MF take add|set|remove|list <scene> ...        MF take record <scene> --take id [--out file]      MF take record-all <scene> --out dir
```

- `--seconds N` fixes the film length: speed = (to - from) / N. Frames = round(N x fps) exactly.
- `--lang a+b` shows two languages in one caption box (first language on top).
- `--save name` also writes a `takes[]` entry with these settings.
- `--poster` also writes `<out>.png`, the frame at 40 % of the film.
- Next to the film the tool writes `<out>.json`: scene hash, player file and hash, the take, frames, seconds, fps, codec,
  bytes, `frozenFrames` (must be 0), `rescues` (camera, must be 0), start and end story times. The tool reads the MP4 back
  (`mvhd` duration, sample count) and fails (exit 1) when they differ from the request by more than one frame.
- `--realtime` forces the old `MediaRecorder` path (the fallback when WebCodecs is missing).

### 3.8 Transactions, history, undo, diff

**Writing rule.** `transact(file, fn)` in `tools/mf.mjs`:

1. Read the file; remember its bytes' sha256.
2. Validate it -> error set A (`where` + `msg` strings).
3. Apply the operation(s) to a copy.
4. Validate the copy -> error set B. **New errors = B minus A.** If there are new errors and no `--force`: print them, exit 1,
   write nothing.
5. `--dry-run`: print the diff (below) and stop.
6. Re-read the file; if its sha256 changed since step 1 -> `E_CONFLICT`, write nothing (another agent or the Studio saved).
7. Write `<file>.tmp`, then rename over the file (atomic on NTFS). Formatting: `JSON.stringify(scene, null, 1) + "\n"`.
8. Append to the history.

**History.** Beside the scene: `<dir>/.mf-history/<file name>/`. Each write stores the PREVIOUS content as
`NNNNNN.json` (6-digit counter) and appends one line to `log.jsonl`:
`{ "n": 12, "time": "2026-11-12T09:14:03Z", "ops": ["stop.move"], "note": "...", "before": "sha256...", "after": "sha256...", "changed": [...] }`.
A file `head` holds the current position for redo. Keep the last 200 entries (delete older snapshot files, keep the log).
`.mf-history/` goes into `.gitignore` (examples in `docs/examples/` must not carry history).

- `MF undo <scene> [--steps n]`: restores snapshot `head`, saves the current content as the redo snapshot, moves `head`.
- `MF redo <scene>`: the reverse. Any new write clears the redo snapshots.
- `MF log <scene> [--last 20]`: `n  time  ops  changed-count  note`.

**Batch.** `MF apply <scene> <ops.json>`; the file is `{ "note": "...", "ops": [ { "op": "stop.move", "id": "a", "by": [3, 0] }, ... ] }`.
All operations run on one copy in order; a failing operation aborts the whole batch (nothing written) and reports its
index. Validation happens once at the end (intermediate states may be invalid). One history entry.

**Diff.** `scene.diff` / `mf diff a b` (existing verb) becomes entity-level and reads like a report:

```
~ stop buffer-a: moved 3.00 m east (74.0, 150.0) -> (77.0, 150.0)
+ device scanner-mid: scanner at (43.5, 170.2) on sample-1/s3, stops the trolley
~ path sample-1 step s3: route 5 -> 3 points, 54.6 -> 51.0 m
~ layout: + door wall:165 [61.65, 65.25]; + add line-a (line 4.0 x 21.0 m)
~ director sample-1: + key 28.2 s; ~ caption cap-x1 (ar added)
# sample-1: 85.9 m -> 85.1 m, 37.9 s -> 32.9 s, 2277 -> 2618 trips per 8 h shift
```

`--json` gives the same as a list of `{ kind, id, change, before, after }`.

### 3.9 The self-check loop

`MF check <scene>` is the one command an agent runs before it reports. It prints a scorecard and exits 1 on any FAIL.

| # | check | how | FAIL when |
|---|---|---|---|
| 1 | valid | validator | any error |
| 2 | joined | validator link rules | any step does not join |
| 3 | clear | `clearance` | any gap under 0.09 m (warning under 0.15 m) |
| 4 | scans on route | every scanner with `stops: true` lies on a leg; every step that should pass a gate does | a scanner off every path |
| 5 | detours | route length / straight distance per step | ratio over 2.5 and more than 30 m longer: WARN with the walls a straight line would cross (`ray`) |
| 6 | camera | planned camera per path: trolley clear at every sample, shots, turn speed | any hidden sample; p95 turn over 12 deg/s |
| 7 | captions | inside the path's time range, no overlap in the same place, every language of `studio.lang` used has a text | out of range or overlapping |
| 8 | takes | path exists, range inside the path | broken reference |
| 9 | numbers | per path metres, seconds, trips | never fails; printed, with the change against the last history entry |
| 10 | plays (only with `--film` or `--play`) | the page: each path to its end, no page error, camera rescues 0 | any error, or a rescue |

Checks 1 to 9 need no browser and take under 2 seconds for the owner's scenes.

### 3.10 Parity table (what the owner can do -> how an agent does it)

| Studio (person) | operation | CLI | page API |
|---|---|---|---|
| Open / save / download / drop a scene | file read / write | edit the file; `mf bake` | `scene.get`, `scene.load` |
| Undo / redo | history | `MF undo`, `MF redo`, `MF log` | Ctrl+Z stack; `MF.agent.call("undo")` |
| Validate | `scene.validate` | `mf validate`, `MF check` | same op |
| Reset to built-in | | `MF undo --steps all` or copy from `private/v7/scenes-v6` | `scene.load` of the base |
| Add PC / gate / scanner / stop | `device.add`, `device.place`, `stop.add` | `MF device add`, `MF device place`, `MF stop add` | same ops |
| Add crate, pallet, rack, column, wall, fence, cone, arrow, zone, sign, trolley | `object.add` | `MF object add` | same |
| Move / turn / resize / delete / duplicate | `*.move`, `*.set`, `*.remove`, `object.duplicate` | same names | same |
| Select replica objects; move / turn / delete / put back | `layout.move`, `layout.turn`, `layout.delete`, `layout.restore` | `MF layout ...` | same |
| Cut a door (new Studio tool, M6) | `layout.door`, `layout.door-on-line` | `MF layout door` | same |
| Add machines, lines, tables, racks, storage, walls | `layout.add`, `layout.grid` | `MF layout add` | same |
| Search | `list`, `nearest` | `MF list`, `MF nearest` | same |
| Snap, ortho, language, shift | `studio.set` | `MF studio set` | same |
| Drag corners and legs, add / remove corners | `route.corner`, `route.points` | `MF route corner`, `MF route points` | same |
| Straighten / L / auto-route / draw / no path / fix links | `route.straighten`, `route.l`, `route.auto`, `route.points`, `step.set route stay`, `route.fix-links` | `MF route ...` (old verbs kept) | same |
| Steps: add, delete, reorder, play from step | `step.add`, `step.remove`, `step.move`; `player.set` | `MF step ...`; `mf play` | same |
| Step title, text, stop, mode, wait, speed, camera distance | `step.set` | `MF step set` | same |
| Elevator ride | `step.elevator` | `MF step elevator` | same |
| Flow: new, duplicate, move, reverse, delete, name, colour | `path.add`, `path.duplicate`, `path.order`, `path.reverse`, `path.remove`, `path.set` | `MF path ...` | same |
| Trolleys, headway, queueing | `path.set` | `MF path set` | same |
| Step markers on the timeline (retime) | `step.set wait` | `MF step set --wait` | same |
| Camera pad: modes, sticks, lens, presets | viewer state | pictures: `mf shots --at ... --heading ...` | `player.set cam`, `view.set`, `view.get` |
| Shots 1 to 6 | `viewpoint.set` | `MF viewpoint set` | same |
| Photo | | `mf shots` | `view.picture` |
| Key here, trolley-locked key, set, delete, retime, ease | `key.add`, `key.set`, `key.remove` | `mf key`, `MF key set` | same |
| Record camera move | (a hand on the camera) | `MF key from-plan` gives a planned move to edit | `view.set` + `key.add` in a loop |
| Captions: add, language, times, text, place, style, size | `caption.*` | `mf caption`, `MF caption set` | same |
| Takes: new, in / out, speed, camera, quality, toggles, record | `take.*`, `film.record` | `mf take`, `MF take add` | same |
| Numbers, compare | `scene.numbers`, `scene.diff` | `mf numbers`, `mf diff` | same |
| Live congestion | `congestion` | `mf congestion` | same |
| Project title | `scene.set` | `MF scene set` | same |
| Look at the result | | `mf shots`, `MF sheet`, `MF review` | `view.picture` |

Still person-only by design: dragging with a hand (the agent has `view.set` and operations with coordinates) and the
browser's own file dialogs.

---

## 4. Engine improvements

Each part: what is wrong, the design, risk, effort (S = under a day of medium-effort work, M = 1 to 2 days, L = 3 to 5
days), and how the 10 paths stay identical.

### 4.1 Engine from source (the way off string patches)

**Wrong today:** 1.4 item 1.

**Design.** Three stages; after each one the player is proven unchanged.

*Stage A: freeze the patched text as source (byte-identical).*

1. Build the reference: `node tools/build-v7.mjs 7.7.2 --out dist/test/ref-772.html --no-docs-check`.
2. A one-time tool `tools/v8/extract.mjs` reads the reference and writes every part of it to a file:

| part of the reference file | goes to | tracked |
|---|---|---|
| everything outside the scripts and the style (the page shell), with tokens where a script or the style was | `src/v8/shell.html` | yes |
| the style block **without** the two stage style files at its end | `src/v8/player.css` | yes |
| script 1 (three.js bundle), script 2 (add-ons) | `src/v8/vendor/three.js`, `three-addons.js` | yes (open-source library) |
| script 3 (light tables), script 4 (baked scenes) | nothing: the build generates them as today | |
| scripts 5, 6 (scene core, preload) | nothing: read from `tools/v7/` as today | |
| script 7 line 0 (device sizes) | `private/v8/base/device-dims.js` | no |
| script 7, the JSON after `var P = ` | `private/v8/base/projects.json` | no (layout, plan pictures) |
| script 7, the rest, with the token `/*@PROJECTS@*/` where the JSON was | `src/v8/project-boot.js` | yes |
| script 8 | `src/v8/dfatmos.js` | yes |
| script 9 | `src/v8/look.js` | yes |
| script 10 line 0 (`window.MF_ASSETS=...`, model data, 2 MB) | `private/v8/base/assets.js` | no |
| script 10, the rest (`window.MFReplica`) | `src/v8/replica.js` | yes |
| script 11 (camera envelope + engine) | `src/v8/player.js` (split in stage B) | yes |
| scripts 12, 13 (scene panel, Studio) | nothing: read from `tools/v7/` as today | |

   Tokens in `shell.html`: `<!--@SCRIPT:name@-->` per script in order and `/*@STYLE@*/` inside the style element.
   The tool writes bytes exactly as found (mixed LF / CRLF line ends are kept). A new `.gitattributes` line
   `src/v8/** -text` stops git from converting them.
3. `tools/build-v8.mjs <stage>` puts the parts back in the same order with the same wrappers (`safe()`, the two IIFE
   wrappers, the title, the help rows) and the same options as `build-v7.mjs` (`--out`, `--bake`, `--no-docs-check`).
4. Proof: `sha256(build-v8 output) == sha256(dist/test/ref-772.html)`. The tool `tools/v8/same.mjs a b` prints both hashes
   and the first differing byte offset with 80 characters of context from each file.

*Stage B: split the engine file.* `src/v8/player.js` becomes `src/v8/player/NN-name.js` parts, cut **immediately before**
each section comment line of the form `  /* ---------- <name> ---------- */` (and before the second top-level
`(function () {`). The parts are fragments of one function, concatenated in name order with nothing added between them.
Expected parts: `00-camera-envelope`, `01-boot-state`, `02-renderer-plates`, `03-post-looks`, `04-flows-motion`,
`05-route-light`, `06-camera`, `07-overlay-labels`, `08-player-ui`, `09-sound`, `10-reflection`, `11-frame`,
`12-devices`, `13-export-ready` (the real list is whatever section comments exist; the build reads
`src/v8/player/*.js` sorted by name). Proof: same hash as stage A.

*Stage C: real modules, one at a time, each proven by the gate instead of a hash.* The first is the motion core (4.2).
After stage A, `tools/v7/engine-patches.mjs` and `tools/build-v7.mjs` are frozen: they build 7.x players only and stay in
the repository as the record of how the engine text came to be. New engine work edits `src/v8/` directly.

**Identity.** Stages A and B: byte-identical output. Stage C onward: the identity test (pose every 0.1 s, timeline, reads,
scans, chips) against V6 for the 10 paths, plus the gate (Appendix C).

**Risk:** low for A and B (hash proof). The one trap is line ends and the private split; both are covered by the hash.
**Effort:** A = M, B = S.

**Not changed:** `dist/Material_Flow_Player_v6.html`, the V6 build, `tools/v7/engine-patches.mjs` (frozen), the old
`src/*.js` files (an older ancestor of the engine; a new `src/README.md` says so; do not delete or use them).

### 4.2 One motion model

**Wrong today:** 1.4 item 4.

**Design.** `src/v8/motion-core.js`: a plain script like `scene-core.js` (defines `window.MFMotion` in the page, exports
the same object in Node through `vm`). It holds, moved verbatim out of the engine part `04-flows-motion`:

```
MFMotion.CONST                      { V_MAX, RAMP_T, TURN_T, DWELL, STATION_T, LIFT_T, SCAN_T, INTRO, UNIT }   (copied from the engine, not retyped)
MFMotion.cleanPath(path)            -> points (units)                      [engine: cleanPath]
MFMotion.schedule(path, hIn, vmax)  -> { pts, phases, duration, length, h0, h1, vm }   [buildSchedule]
MFMotion.sample(sched, tau, out)    -> out { x, y, h, d, v, k, seg }       [sampleSchedule]
MFMotion.withScanStops(sched, plate, scanners) -> sched                    [scheduleManualStops; scanners = route-bound manual devices]
MFMotion.timeline(data, flow, elevator) -> { items, total }                [buildFlow without the intro card's text]
        data = { nodes, devices } in units; flow = { steps }; items[i] = { s, i, path, sched, t0, tm, t1, metres, base, run, h0, h1 }
MFMotion.pose(items, nodes, t, out) -> out { x, y, h, d, v, k, seg, lift, u, i, it }   [lotPos]
MFMotion.stepAt(items, t)           -> item
MFMotion.numbers(data, flows, elevators) -> [ { id, name, metres, seconds, trolleys, steps: [ { id, title, metres, seconds } ] } ]
MFMotion.glideX(s), glideY(s), glideAt(items, liftIndex, t)                 [the floor glide around rides]
MFMotion.world(plates, center, gap, x, y, stack, up, out)                   [W(): plan point -> world point for a stack value]
```

How to move a function: copy its body unchanged, turn every free variable into a parameter or a field of `CONST`
(look for `D`, `PT_M`, `V_MAX`, `RAMP_T`, `TURN_T`, `DWELL`, `STATION_T`, `LIFT_T`, `INTRO`, `E`, `ELEVATORS`,
`elevatorFor`, `pl`, `pathInfo`, `ease`, `clamp`, `lerp`), and leave a one-line wrapper with the old name in the engine so
no caller changes (for example `function buildSchedule(path, hIn, VM = V_MAX) { return MFMotion.schedule(path, hIn, VM); }`).
The engine's `buildFlow` keeps the intro card (its text uses replica statistics) and calls `MFMotion.timeline` for the rest.

Users: the engine (through the wrappers); `tools/v7/mf-ops.mjs` (`numbers`, `storyStart` call `MFMotion` and the private
copy of the maths is deleted); the Studio Numbers tab (`flowNumbers` calls `MFMotion.numbers` for both sides); later
`where`, `timeline`, `congestion`, the camera planner and the queue model.

**Identity:** the identity test (motion must be bit-equal to V6: the code is moved, not rewritten).
**Risk:** low to medium (hidden free variables). **Effort:** M.

### 4.3 The planned camera

**Wrong today:** 1.4 item 3; numbers in 1.1.

**Idea.** A film camera is planned before it runs. For each path the engine computes, once, a list of **shots** (a camera
rig held for a stretch of story time) joined by **eased transitions**, with a designed sequence at each elevator ride.
The camera pose is then a pure function `pose(t)`: no springs, no per-frame choice, no rescue. It is the same at every
playback speed, after every seek, and in every recorded frame. The full algorithm is Appendix E; the summary:

1. **Sample** the trolley every 0.25 s of story time (pose, floor, ride state).
2. **Rigs.** A rig is `(azimuth, polar angle, distance)` around a look target. Candidates: 16 azimuths (22.5 degree
   steps) x 4 polar angles (tilt 43, 53, 64, 76 degrees) = 64 rigs. Distance per step: as the calm camera does today
   (the step's `camera.distance` x 1.45, widened to frame the step's longest leg, at most x 1.8).
3. **Look target** = the trolley's position averaged over +-0.6 s of story time (a symmetric average: smooth and still a
   pure function), pushed up to 6 m ahead along the current leg.
4. **Feasible** = from the rig's eye the line to the trolley is clear in the sight model (4.3.1) and the trolley projects
   inside the middle 70 % of the frame.
5. **Choose** rigs for all samples together by dynamic programming: least total cost, where cost = a large price per
   rig change + the angle turned + small prices for leaving the house angle and the house tilt. This yields long holds and
   few, small turns; a change happens only where the view would otherwise be blocked.
6. **Transitions.** Each rig change becomes an eased blend (smootherstep) lasting `angle / 10 deg/s`, at least 2 s, at
   most 6 s, centred on the change and checked sample by sample. If the blend is blocked: slide it up to 2 s earlier or
   later; else arc over the top (through tilt 76 degrees); else make it a **cut** at the nearest moment the trolley stands
   still. Cuts are listed in the plan with their reason.
7. **Rides** get a fixed three-beat design (4.3.2).
8. **Pinned shots.** A step may fix its heading, tilt or "hold through this step" (`steps[].camera.heading`, `.tilt`,
   `.hold`). The planner obeys and reports the moments a pin hides the trolley.

At run time the guided camera sets the eye and target straight from `pose(t)`. The reactive code path stays in the
engine behind a switch (`?cam=reactive`, `MF.x.setPlanned(false)`) as a fallback and for A / B comparison. `SIGHT.ensure`
still runs as a last safety net; a release requires its counter `MF.sight.stats.rescued` to stay 0 on the 10 paths.

#### 4.3.1 The sight model (`src/v8/sight-core.js`)

The engine's `SIGHT` already has a conservative box model: one box per replica instance (from real instance bounds), one
per floor and slab triangle, one per device part, in a 16-unit grid per floor, with `clearLine(A, L)`. It moves into
`sight-core.js` unchanged in behaviour:

```
MFSight.create()                                   -> model
model.add(plate, x0, z0, x1, z1, top, bottom, tri?)   box in the plate's own frame (units)
model.clearLine(A, L, offsetOf, ignore = .5)       -> true when nothing blocks; offsetOf(plate) -> { x, y, z } of that plate now
model.fromLayout(layout, devices, heights)         Node: boxes from layout rectangles
        heights (m): wall 3.6 (+0.15), column 8.5, rack 7.6, machine 5 (a block: its own h), pallet 1.3, lift 7.4, slab 0.3
```

In the page the model is filled from instance bounds as today (exact and conservative: a box always contains its mesh),
so "clear in the model" implies "clear on screen". In Node the model is filled from rectangles and heights: an estimate,
good enough for `MF check` and `MF camera`, and labelled as an estimate in their output. The exact answer is always the
page's (`visible`, the camera test).

#### 4.3.2 Elevator rides

Around each ride the engine already glides the upper floor over the lower one (`glideAt`: starts 5 s before the ride,
back 2.6 s after it). The V3 shots for this (`cineShot` A, B, C) exist in the engine and are switched off. The plan
turns them into three planned beats, each checked by the sight model with the floors where they will be at that moment:

| beat | time | camera |
|---|---|---|
| A approach | from 5 s before the ride to its start | ease to the ride rig: look at a point 30 to 85 % of the way from the trolley to the lower landing; distance 141 m down to 99 m; tilt from 58 to 55 degrees; azimuth = the ride azimuth minus 0.5 rad, easing to minus 0.15 rad |
| B the car | the ride, until the car is 98 % up | look at the car; eye below the incoming upper slab (eye height = at most 4.8 m under the slab); distance 99 m down to 77 m; slow orbit of 0.55 rad over the ride |
| C arrival | from 98 % up to 2.6 s after arrival | **cut** to above the upper floor: look at the car coming through the shaft opening; eye 45 m above it; distance 87 m down to 70 m; orbit 0.3 rad; then a normal transition to the next shot |

The ride azimuth is chosen once per elevator as today's `cineAz` does (24 directions, least blocked for both landings),
but scored with the sight model. If beat B is blocked at more than 5 % of its samples for every azimuth, the planner
uses the fallback: a near-vertical view down the shaft (tilt 86 degrees) with a cut in and a cut out, and reports it.
So a ride has at most two cuts and no snap.

#### 4.3.3 Director camera fixes

- Position between keys uses a monotone cubic (tangents limited so the curve never overshoots a key) instead of plain
  Catmull-Rom; a fixed-point key no longer swings past its target.
- From format 2, fixed keys are stored as a plan point + floor and placed through the world function each frame, so
  they are right on upper floors and while floors glide (today they are frozen world coordinates).
- `MF check` samples the director camera too and lists hidden stretches as warnings (the director may want them).

#### 4.3.4 Acceptance numbers (every one measured by a tool, per path)

| measure | target | tool |
|---|---|---|
| trolley hidden (exact, sampled every 0.1 s of story time by seeking) | 0 samples on all 10 paths | `tools/v8/camera-test.mjs` |
| rescues during a full play at 1x and at 3x | 0 | same |
| trolley outside the middle 70 % of the frame | 0 samples | same |
| pose at 20 story times: played at 3x vs reached by seek | equal within 1e-6 | same |
| 95 % azimuth speed | at most 12 deg/s (today 26 to 36) | `tools/v8/camera-report.mjs` (from the plan, no browser) |
| maximum azimuth speed outside listed cuts | at most 25 deg/s | same |
| shot changes outside rides | at most 2 per minute on average | same |
| cuts | at most 2 per ride; elsewhere 0, or listed with a reason | same |
| planning time per path in the page | under 400 ms (behind the preparing screen) | `MF.perf.plan` |

**Identity:** the camera does not touch motion; the identity test must still pass. The owner's accepted look changes (the
camera is the point of the change): the release shows before / after contact sheets of all 10 paths.

**Risk:** medium to high. The planner is new logic; rides are the hard part; the Node estimate can disagree with the page.
Mitigations: the reactive camera stays as fallback per path (`plan.ok === false` -> reactive for that path, reported); the
planner is pure and unit-tested on synthetic layouts; rides have a designed fallback. **Effort:** L.

### 4.4 Recording

**Wrong today:** 1.4 item 7.

**Design: frame-stepped rendering + WebCodecs + an own MP4 writer.**

1. **Stepping.** A new engine entry `MF.x.offline(on)` makes the animation loop idle (the `tick` function returns at once
   while it is on). The recorder then drives the engine itself: for film frame `i` it sets
   `S.t = max(0, t0 + (i - 1) * speed / fps)`, keeps `S.playing = true`, `S.speed = speed`, and calls the engine's
   `frame(1 / fps)` (for `i = 0` at `t0 = 0`: `frame(0)`). This is exactly what real playback does on a perfect display,
   so every camera and every animation behaves as on screen, and the story time of frame `i` is exactly `t0 + i * speed / fps`.
2. **Picture.** Right after `frame()` (same task, so the 3D canvas still holds the frame) the recorder composes the film
   frame on a 2D canvas: 3D picture, route overlay, labels, step card, captions. Render scale is 1.0 during recording
   (on screen High uses 0.85), the quality governor and the reflection are off.
3. **Captions are drawn on the canvas from the caption data**, not copied from the page: own word wrap by measured
   width, `direction = "rtl"` and right alignment for Arabic (the missing direction is the likely cause of the "RFID in
   the wrong place" doubt: with a left-to-right base the Latin run of an Arabic line is ordered wrongly), title and text
   in the take's language, two languages stacked when the take says `en+ar`.
4. **Encoding.** `VideoEncoder` with `avc1.640028` (1080p at up to 30 fps) or `avc1.64002A` (60 fps), `avc: { format: "avc" }`,
   bit rate 12 Mbit/s (high) or 6 (normal) at 1080p, scaled by pixel count, a key frame every 2 s. Back-pressure: wait
   while `encodeQueueSize > 4`.
5. **File.** `src/v8/mp4-mux.js` writes a plain MP4 with the index first ("fast start"), one video track, no audio
   (layout in Appendix D). Frame count and duration are exact by construction.
6. **Checks built in.** A 32 x 18 thumbnail of each composed frame is compared with the previous one; frames that are
   identical while the trolley moved more than 1.5 cm count as `frozenFrames`. The result reports frames, seconds, fps,
   codec, bytes, frozen frames, camera rescues.
7. **Fallback.** No `VideoEncoder`, or `configure` refuses: the old `MediaRecorder` path, repaired: render 30 frames at
   `t0` before starting, start the story only after the recorder's first data arrives, count stalls (a gap over 250 ms
   between composed frames), restart once when a stall happens in the first 2 s, and report "real-time capture, length
   not exact" in the result.

Measured support on this PC: `VideoEncoder` exists, both codecs are supported at 1080p. Expected speed: at least 30 film
frames per second (render 8 to 17 ms + compose + encode), so a 20 s film at 30 fps takes under a minute.

**New take fields** (optional, format 1 already): `seconds`, `lang`, `size`, `poster`; `fps` limited to 24, 25, 30, 60.

**Identity:** nothing in playback changes; `offline` is off unless a film is being made. **Risk:** medium (encoder
differences between PCs; mixed-direction text). Mitigation: fallback path; the result says which path was used; the
owner checks one Arabic film. **Effort:** L.

### 4.5 Performance on Intel Iris Xe

**Facts (1.1):** steady playback is already inside the budget. The open problems are the cold start, film sharpness
and keeping the budget while features are added.

**Budget** (1920 x 1080, High, this PC; `tools/v8/perf-budget.json`, checked by `tools/v8/perf-report.mjs`):

| measure | today | budget |
|---|---|---|
| frame time p50 / p95 / p99 while playing | 16.7 / - / 16.9 ms | 16.7 / 17.5 / 20 ms |
| frames over 34 ms in 60 s of play after the opening | 0 to 1 | at most 1 |
| JavaScript per frame, p95 | 3 to 4 ms | 5 ms (planned camera should lower it) |
| draw calls | 37 to 46 | 60 |
| triangles | 0.64 to 1.04 million | 1.2 million |
| shader programs | 51 to 53 | 60 |
| preparing screen, median | about 3 s | 2 s |
| fresh starts with visible stutter | 1 of 20 | 0 of 20 |

**Work, in order of value:**

1. **A performance receipt** (`perf-report.mjs`): per tab, cold and warm: the numbers above plus texture count and the
   time of each start-up stage. Every later milestone runs it; a budget miss fails the gate. (S)
2. **Cold start.** Behind the preparing screen: compile all programs with `renderer.compileAsync(scene, camera)` for both
   floor material states and both looks used, upload every texture with `renderer.initTexture`, then the dry run. Record
   per stage time in `MF.perf.prep`. Keep the cover until the cause of any remaining slow frame is shown by the receipt. (M)
3. **Film preset**: render scale 1.0 (or 1.5 supersampled then scaled down for stills and films: both are off-line so
   speed does not matter), governor off, reflection off. (S, part of M2 / M9)
4. **Added layout items** already go into the instanced "paint" bucket (no new draw calls). Painted shadows cost nothing
   per frame (they are in the floor light texture). (see 4.6)
5. **Fleet**: copies of the trolley are separate objects today (draw calls x parts x trolleys). With queueing (4.7)
   switch to one instanced mesh per trolley part when a path has more than 3 trolleys. (S)
6. **Fewer pixels**: when panels are docked (section 5) the 3D canvas covers only the free area. (part of M7)
7. **Not planned** (no evidence they are needed at 60 fps): level-of-detail models, occlusion culling, a new renderer.

**Risk:** low. **Effort:** M in total.

### 4.6 Layout fidelity

| need | design | effort / risk |
|---|---|---|
| Added items have no shadow | **Painted shadows at load.** The preload already repaints the floor light on a canvas (`MF7_CLEAN_LIGHT`). After the repair it paints, for every added solid (block, rack, pallet stack, wall), a soft dark shape: the footprint grown by `0.3 m + 0.12 x height`, shifted by `height x (0.55, -0.71)` in plan (east and north: the direction of the sun in `tools/blender/bake_floor.py`, rotation 42 and -38 degrees), blurred by `0.9 m`, multiplied into the texture with strength 0.35. Constants in one object `ADD_SHADOW`. This is the instant preview; the re-bake below replaces it for released scenes. | S / low (look to be approved by the owner) |
| Additions break when reordered | **Permanent slots** (format 2): each entry has `slot`; numeric ids come from the slot, not the list position. Edits may target `add:<id>`. | M / medium (migration) |
| Doors only as data | **Door tool** in the Studio and the operations `layout.door`, `layout.door-on-line`. | S / low |
| Matching a slide is pixel work | **Trace tool**: the registered plan picture at 50 % over a straight-down view; drag a rectangle; pick the kind; the size shows in metres; the entry is added through `layout.add`. Agents: `MF overlay` pictures, `MF layout add --box`, `MF layout grid`. | M / low |
| A new picture from the owner | **Calibrated overlay**: drop a picture, click 3 matching points (picture, plan), see the fit error in metres, keep it as an overlay. The picture stays in the browser (IndexedDB); the scene stores only its name, hash and the 6 numbers of the fit. | M / medium (optional task) |
| Labels of added items | field `showLabel`: draws the `label` as an area tag at the item's centre. | S / low |
| A true re-bake | **Planned (Blender is installed):** `MF light <scene>` exports the edited layout, runs Blender Cycles headless with the same sun and sky as the V4 bake, and stores one light picture per floor; the build embeds it; the player uses it when it matches the scene's layout and falls back to repair + painted shadows when it does not. Design and commands in 4.10.1. | M / medium |
| Automatic recognition of machines from a picture | **Not planned.** The project rule forbids inferring counts or positions from symbols; a person or agent traces and the owner confirms. | |
| Layout change reloads the page | Keep the reload (it is a tested transaction). A live rebuild of the replica is possible once the engine is source; listed as a stretch task. | M / medium |

### 4.7 Several trolleys: queueing

**Wrong today:** 1.4 item 9.

**Design: a time warp per trolley, computed up front** (`MFMotion.queue`).

- Trolley 0 (the lead) keeps the path's timeline. Its distance along the whole path as a function of its own clock is
  `s(tau)` (monotone; a ride counts as a point).
- Trolley `k` nominally runs `k x headway` later. With queueing its own clock `tau_k(t)` advances at rate 1 unless that
  would bring it closer than `gap` metres (default 2.5 m, along the route, same floor) behind trolley `k - 1`, or onto an
  elevator that is busy (a ride plus the car's return: `2 x LIFT_T`); then the clock stands still.
- The simulation steps 0.05 s once when the path is built and stores each `tau_k` as a short list of
  `(story time, clock)` corner points. `pose_k(t) = pose(tau_k(t))`: still a pure function of story time, so seek,
  replay and films stay exact.
- Output per trolley: start, finish, waiting seconds, where it waited (steps). Numbers: mean trip time with waiting,
  trips per shift from it, total waiting per trip. Congestion reports the waits instead of "closest distance".
- Scene: `paths[].queue` (true / false, default false), `paths[].gap` (m, 1 to 20, default 2.5).

**Limits, stated in the docs:** one path at a time (no meeting traffic between paths), no return trips, no passing.
**Identity:** `queue` is off by default; the 10 paths are unchanged. **Risk:** low to medium. **Effort:** M.

### 4.8 Robustness

| item | design |
|---|---|
| Release files can be overwritten | The build refuses any existing `dist/Material_Flow_Player_v*.html` that is not its own stage. Writing its own stage first copies the old file to `dist/backup/<name>-<yyyymmdd-hhmmss>.html` (the newest 5 are kept), writes a temp file and renames it. |
| Validator gaps | Sweep placed solid objects in Node too (the solid table and rectangle code move from `studio-core.js` into `scene-core.js`); exact turned footprint for PCs at free angles (separating-axis test of two rectangles); every issue gets a `code` and a `hint` (texts unchanged); unknown fields give a warning `W_UNKNOWN_FIELD` with the nearest known name (a typo such as `headwy` passes silently today). |
| Auto routes avoid narrow doors | Two passes: today's comfortable margins first; when there is no route, or it is over 1.6 x the straight right-angle distance + 20 m, a second pass with tight margins (straight: half width + 0.15 m; turn: half diagonal + 0.03 m); the tight route is used only when the full trolley sweep accepts it. Routes that are fine today do not change. |
| A script error leaves a blank page | Start-up errors show a card: what failed, "Reload", "Reload without my saved scene" (clears the browser copy for this tab after a download of it is offered). |
| Graphics reset | `webglcontextlost`: show "The graphics were reset. Reloading…" and reload once. |
| Camera test crashes at launch | All tests start Chrome through `tools/v7/cdp.mjs`. |
| Temp player files collide | CLI browser verbs write `dist/test/mf-<tab>-<process id>.html` and delete it at the end, so two agents can run at once. |
| Random ids in files | New ids from operations are derived from names and counters (`key-3`, `cap-2`), not `Math.random`, so the same commands give the same file. |

### 4.9 Format version 2 (milestone M6)

| change | version 1 | version 2 |
|---|---|---|
| marker | `"version": 1` | `"version": 2` |
| camera keys | `x, y, z, dist` in units, `az, pol` in radians, `fov`; follow keys `ox, oy, oz` | `look` (`"trolley"` or `[x, y]` m), `floor` (fixed keys), `height` (m above the floor, default 0.6), `distance` (m), `heading` (deg), `tilt` (deg), `lens` (mm); follow keys `offset` `[dx, dy, dh]` (m) |
| viewpoints | 6 slots, engine units | a list of `{ id, name, look, floor, height, distance, heading, tilt, lens }`; the first six are the pad's buttons |
| layout additions | id from the list position | `slot` (whole number, unique, never reused); ids = `100000 + 1000 x slot + part` |
| layout edit targets | `wall:N` ... | also `add:<id>` and `add:<id>:<cell>` (storage cell 1 to 999) |
| optional fields added earlier under version 1 | `takes[].seconds / lang / size / poster`, `steps[].camera.heading / tilt / hold`, `paths[].queue / gap` | same |

- `MFScene.upgrade(scene)` (pure) turns 1 into 2; it runs wherever a scene is read (preload, file open, CLI). Saving
  writes 2. `MFScene.downgrade(scene)` turns 2 into 1 for older players and returns the list of things it could not keep.
- The conversion of keys uses the tab's centre (`data.center`) and the rule in `tools/v7/mf-ops.mjs` `cameraKey`
  (distance = m / 0.3; azimuth = -heading; polar = 90 - tilt; lens = 12 / tan(fov / 2)).
- Players up to 7.7.2 cannot open a version 2 file; the message of the new player on a version 3 or later file is
  "This scene was saved by a newer player (format N). Open it with that player."
- The identity scenes in `private/v7/scenes-v6/` stay version 1 on disk and are upgraded in memory: this is the standing
  proof that version 1 still plays.

### 4.10 Blender and Godot: concrete uses

Both were checked for this plan on this PC: Blender 5.2.3 LTS runs headless (`-b`), Cycles on the CPU is available, its
Python is 3.13 with numpy, the glTF exporter is present; Godot 4.7.2 runs a script headless.

```
Blender  D:\WORK\Software Development\Apps\Blender\blender-5.2.3-windows-x64\blender.exe
Godot    D:\WORK\Software Development\Apps\Godot\4.7.2\Godot_v4.7.2-stable_win64_console.exe
```

One module holds the paths: `tools/v8/apps.mjs` exports `blender()` and `godot()`; each returns the value of the
environment variable `MF_BLENDER` / `MF_GODOT` when set, else the path above; when the file does not exist it throws
`Blender not found at <path>. Set MF_BLENDER to blender.exe.` (same for Godot). Tools start them with
`execFileSync(path, args, { stdio: "pipe", windowsHide: true })`: no window, no shell, paths with spaces are safe.
In the commands below `%BLENDER%` and `%GODOT%` stand for those two paths.

| # | use | tool | milestone | value |
|---|---|---|---|---|
| 1 | Floor-light re-bake for changed layouts | Blender Cycles | M6 | high: added items and doors get the same soft light as the original factory |
| 2 | Independent picture of the layout data (top view) and geometry check | Blender | M6 | medium: proves the player draws what the data says; a neutral picture to lay over a slide |
| 3 | Layout as a glTF file | Blender | M6 | medium: input for use 5 and for any other 3D tool the owner uses |
| 4 | Still pictures with path-traced light for slides | Blender Cycles | M9 (optional) | medium: a few "hero" stills per film |
| 5 | A second film renderer with real-time shadows | Godot | M11 (experiment) | unknown until tried: decided by a go / no-go |
| - | The 3D models of the player (machines, trolley, props) | Blender | exists | `tools/blender/models.py`, `models_hd.py`, `props.py`, `trolley.py` + `tools/pack-assets.mjs`; not changed by this plan |

#### 4.10.1 Floor-light re-bake (use 1)

Today's `tools/blender/bake_floor.py` (45 lines) bakes the V4 take-off: fixed floor names and boxes, the old
`replica.json` format; `tools/make-light.py` then deepens the shadows with OpenCV (not installed here). The new script
keeps its light recipe exactly and takes the current layout.

```
1. node tools/v8/export-layout.mjs <scene.json> [--player <file>] --out private/v8/bake/<tab>.layout.json
     the layout of the scene's tab AFTER layoutAdds and layoutEdits, in units (0.3 m):
     { "tab", "unit": 0.3, "layoutHash", "plates": { "<key>": { "box": [x, y, w, h], "lift": n } },
       "walls": [ { plate, a, b } ], "columns": [ { plate, p } ], "racks": [ { plate, x, y, w, h } ],
       "machines": [ { plate, x, y, w, h, type, hm? } ], "pallets": [ { plate, x, y, w, h } ],
       "lifts": [ ... ], "trucks": [ ... ], "conveyors": [ ... ] }      (the last three copied from the base layout when present)
     layoutHash = the preload's hash() of JSON.stringify([scene.layoutAdds || [], scene.layoutEdits || []])

2. "%BLENDER%" -b --factory-startup --python tools/blender/bake_floor_v8.py -- private/v8/bake/<tab>.layout.json private/v8/light/<tab> --px 2048 --samples 64
     per plate: the same scene as bake_floor.py (white floor, grey invisible-to-camera solids, SUN rotation (42, 0, -38) deg,
     energy 2.2, angle 14 deg, white world 0.85, orthographic camera from above, CYCLES on the CPU, denoising, 3 bounces,
     Standard view transform, black-and-white PNG). Heights (m): wall 3.6, column 8.5, rack 4 slatted levels of 1.35 at 1.75
     spacing (3 levels on upper floors), machine by type (injection 2.6, press 4.2, utility 2.6, dock 0.4, cell 3.5,
     block: its own hm), pallet 1.3. Picture: longest side = --px, other side in proportion, rounded to a multiple of 4.
     Then, inside Blender with numpy (replaces make-light.py): v = clip(v, 0.12, 1) ** 3; save <plate>.png and
     write private/v8/light/<tab>/bake.json = { layoutHash, px, samples, blender, seconds, plates: { key: { file, w, h, box } } }.

3. node tools/build-v8.mjs <stage> ...        (reads private/v8/light/<tab>/bake.json automatically; --no-light skips it)
     embeds window.MF8_LIGHT = { "<tab>": { layoutHash, plates: { "<key>": "<data URL>" } } } next to the light tables.

4. In the player (preload): when MF8_LIGHT[tab].layoutHash equals the hash of the scene being loaded, the baked picture
   is the floor light of that plate and no repair and no painted shadow runs; otherwise the original light + repair +
   painted shadows run as before. A scene edited in the Studio after the build therefore still looks right at once.
```

The one command for people and agents: `MF light <scene.json> [--samples 64] [--px 2048]` (steps 1 and 2; then
`mf bake`). Proof that the recipe is right before it is trusted: bake the **unedited** layout of each tab and compare
with the light picture inside the player (mean absolute difference under 6 of 255 over the floor area, checked by
`tools/v8/light-compare.mjs`); if it is not met, tune only the tone step (the clip and the power), never the sun.

Limits: the bake takes minutes per tab on this PC (measure and print it); it must be re-run after every layout change
that should look final; the rise animation and the placed `objects[]` do not take part (objects keep no baked shadow).

#### 4.10.2 Top-view reference and geometry check (uses 2 and 3)

```
"%BLENDER%" -b --factory-startup --python tools/blender/layout_check.py -- private/v8/bake/<tab>.layout.json dist/test/ref/<tab> --px-per-m 8 [--gltf]
```

- Writes `<plate>-top.png`: a flat-shaded orthographic top view, one colour per kind (wall dark grey, column light grey,
  rack orange, machine blue, block its own colour, pallet tan, storage marking yellow lines), with no light or texture.
  `MF overlay --reference dist/test/ref/<tab>/<plate>-top.png` lays it over the player's own top view and over the
  slide picture: a difference between the two renderers is an engine drawing bug; a difference from the slide is a
  layout question.
- Prints `OVERLAP <a> <b> <area m2>` for every pair of solids that intersect by more than 0.05 m2 (BVH overlap of the
  boxes) and `OUTSIDE <id>` for a solid outside its floor's box; exit code 1 when any line was printed. The Node
  validator checks routes against solids; this checks solids against each other, which nothing does today.
- `--gltf` also writes `private/v8/gltf/<tab>.glb` (boxes with names = layout ids, one material per kind, Y up, metres).

#### 4.10.3 Hero stills (use 4, optional)

```
MF camera <scene> --path <id> --at <Time> --json > dist/test/pose.json          (the camera in plain words; M5)
"%BLENDER%" -b --factory-startup --python tools/blender/hero_render.py -- private/v8/bake/<tab>.layout.json dist/test/pose.json dist/test/hero.png --samples 128 --size 1920x1080
```

The layout boxes with simple materials, the trolley as a box at the pose's trolley point, the same sun, a Cycles
picture with soft shadows and bounce light. For a slide's title picture, not for the film itself. Build it only if the
owner asks after seeing M9's sharper browser stills.

#### 4.10.4 Godot film path (use 5, experiment)

Idea: Godot plays no logic of its own. The Node tools export **what happens** (the trolley pose and the camera pose for
every film frame, from the motion core and the camera plan) and **where** (the glTF layout); a small Godot project only
draws it with real-time shadows and writes frames.

```
node tools/v8/export-film.mjs <scene> --take <id> --out private/v8/godot/<name>
     writes film.json = { fps, frames, size, sun: { rotation: [42, 0, -38] }, layout: "<tab>.glb",
                          trolley: [[x, y, z, heading] per frame], camera: [[ex, ey, ez, tx, ty, tz, fov] per frame],
                          captions: [ { f0, f1, title, text, lang, place, style } ], route: [[x, z] ...] }   (metres, Y up)
"%GODOT%" --path godot/mf-film --resolution 1920x1080 --fixed-fps 30 --write-movie <abs path>\frames\f.png --quit-after <frames> -- --film <abs path>\film.json
```

Open points the experiment must settle first (do not assume): `--headless` uses a dummy display and cannot draw, so
frame writing needs a real (possibly minimised) window: confirm the exact flags on this PC; which renderer runs well on
Intel Iris Xe (`--rendering-method mobile` or `gl_compatibility`); the movie writer gives a PNG sequence or an AVI, so
turning frames into an MP4 needs an encoder (the M2 MP4 writer can be reused from Node only with an H.264 encoder,
which Node does not have: options are a browser page that encodes the PNGs with WebCodecs, or ffmpeg, which was put on
this PC without the owner's approval and needs his decision, question Q9).

Go / no-go after the spike (M11): keep the Godot path only if one 10 s film of an owner path looks clearly better to the
owner than the M9 browser film, the whole export-to-file run is one command, and the project stays under about 400
lines of GDScript. Otherwise record the result in `docs/DECISIONS.md` and stop.

---

## 5. Design and controls

### 5.1 Problems seen on screen (screenshots in `dist/test/fable-tour/`, 1600 x 900)

| # | problem | where |
|---|---|---|
| 1 | With the Studio open, three translucent panels (Studio 350 px, camera pad 355 px, player bar 720 px) cover about half the picture; the trolley sits behind the player bar. | every Studio tab |
| 2 | Panels are see-through glass over a bright, busy picture: labels and field text are hard to read. | all panels |
| 3 | Panels overlap each other: the Scene file panel lies on the camera pad; the floor name tag lies under the Studio header; the top toolbar lies over stop labels. | `inj2-scenefile`, `inj1-objects` |
| 4 | The same thing lives in several places: Undo / Redo (toolbar, Scene file panel, keys), save / open (Scene file panel, Project tab), camera mode (rail popover, pad, Director tab), keyboard help (old help table, F1 map, Project tab). | |
| 5 | The timeline is a thin line; the Camera and Text lanes are 8 px high; a key or caption is a few pixels wide; step names are not on it. | Director tab |
| 6 | Paths and Steps are two tabs for one thing (the selected step); editing a step means switching between them. | |
| 7 | A caption card and a take card take a whole panel height each; with five captions the list is unusable. | Director tab |
| 8 | The camera pad shows six unnamed "Shots" and three sliders (Lens, Speed, Smooth) most people never touch, always. | pad |
| 9 | The right rail has 12 icon-only buttons with no grouping by task. | rail |
| 10 | The Numbers tab disagrees with the CLI and uses a narrow table; the comparison is text. | Numbers tab |
| 11 | No first-run help: a new person sees a film player with unexplained icons. Empty lists say only "No keys yet". | |
| 12 | Hints are one line at the bottom of the panel; errors are a toast that disappears. | |
| 13 | A "DRAFT ORDER" tag from V2 is still in the page shell. | top bar |

### 5.2 Principles

1. **The picture is the product.** Nothing translucent on top of it while working; panels dock at the edges and the 3D
   view fills (and is centred in) the free area.
2. **Three jobs, three workspaces.** Present (show a film), Build (change the scene), Direct (make a film). Each shows
   only the controls of its job.
3. **One place for each thing.** One undo, one save, one camera mode control, one keyboard map.
4. **The timeline is the spine** of Direct and visible in Build: steps, camera shots and captions as readable bars.
5. **Every action has a name.** The same action table drives buttons, the right-click menu, keys, the command palette
   and the agent's operations.
6. **Say what happened and what to do next**, in a status bar that stays, not in a toast that leaves.

### 5.3 Style tokens (CSS variables on `:root`, in `src/v8/player.css`)

```
/* colour: dark opaque chrome, light picture */
--bg-chrome: #0e1726;        /* docks, top bar, timeline */
--bg-raised: #17233a;        /* cards, inputs, menus */
--bg-hover:  #1f2f4d;
--line:      #2b3d5f;        /* 1 px borders and dividers */
--text:      #eaf1fb;        /* 15.9 : 1 on --bg-chrome */
--text-dim:  #a9bad2;        /* 8.6 : 1 */
--accent:    #3b82f6;        /* primary buttons, selection, focus */
--accent-ink:#ffffff;
--ok:   #22a06b;   --warn: #e2b203;   --bad: #e5484d;   --info: #38bdf8;
--focus: #9cc2ff;            /* 2 px focus ring, offset 2 px */
/* the three lanes of the timeline */
--lane-step: #5b7bb5;   --lane-cam: #e2b203;   --lane-text: #22a06b;
/* type */
--font: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
--font-ar: "Segoe UI", "Tahoma", sans-serif;      /* Arabic captions and fields */
--fs-1: 12px;  --fs-2: 13px;  --fs-3: 15px;  --fs-4: 18px;  --fs-5: 24px;
--lh: 1.4;
/* space and shape */
--s-1: 4px;  --s-2: 8px;  --s-3: 12px;  --s-4: 16px;  --s-5: 24px;
--r-1: 6px;  --r-2: 10px;
--ctl-h: 32px;               /* control height; 40 px when the pointer is coarse */
--dock-l: 320px;  --dock-r: 320px;  --top-h: 48px;  --time-h: 96px;  --time-h-direct: 220px;
/* motion */
--t-fast: 120ms;  --t-slow: 240ms;   /* both 0 when the system asks for reduced motion */
```

Rules: body text `--fs-2`; labels above fields `--fs-1` in `--text-dim`; section titles `--fs-3` semibold; one primary
(filled accent) button per card; destructive actions are text buttons in `--bad` and ask once ("Delete 3 steps?  Delete /
Keep") in the status bar instead of the "click again within 3 s" pattern. The glass look (blur, translucency) is kept for
Present mode's floating player bar only, where nothing is being edited.

### 5.4 Layout and workspaces

```
+----------------------------------------------------------------------------------------------------------+
| TOP BAR 48px                                                                                              |
| [File v] [INJ 1 | INJ 2 | EPS | Press]   1 Item Slip to W/H v   | Present | Build | Direct |  [?] [Find]  |
+----------+-----------------------------------------------------------------------------------+-----------+
| LEFT     |                                                                                   | RIGHT     |
| DOCK     |                         3D VIEW (the canvas fills this area)                      | DOCK      |
| 320px    |                                                                                   | 320px     |
| (Build,  |   view tools float at its top-right corner:  [2D] [3D] [Auto]  [camera v]  [...]  | inspector |
|  Direct) |                                                                                   | (Build,   |
|          |                                                                                   |  Direct)  |
+----------+-----------------------------------------------------------------------------------+-----------+
| TIMELINE  96px (Build)  /  220px (Direct)  /  floating player bar (Present)                               |
+----------------------------------------------------------------------------------------------------------+
| STATUS BAR 24px:  what the mouse does now  ·  last message  ·  No clashes  ·  Saved 10:42                 |
+----------------------------------------------------------------------------------------------------------+
```

- The page is a CSS grid; the 3D canvas is sized to its grid cell, so the subject is centred in the free area and
  fewer pixels are drawn while docks are open.
- Docks can be collapsed to a 28 px strip (button on the dock edge, key `Tab` toggles both).
- Under 1100 px width the right dock becomes a bottom sheet over the timeline; under 800 px (tablet, touch) both docks
  are sheets opened by buttons in the top bar and only Present and Direct are offered.
- Workspace keys: `1` Present, `2` Build, `3` Direct (when no text field has the focus). Today's `2` / `3` / `A` view
  keys move to `Shift+2`, `Shift+3`, `Shift+A`.

### 5.5 Screens

#### Present (the default when the file opens)

```
+----------------------------------------------------------------------------------------------------------+
| [File v] [INJ 1|INJ 2|EPS|Press]   1 Item Slip to W/H v            | Present | Build | Direct |   [?]     |
+----------------------------------------------------------------------------------------------------------+
|                                                                              [2D][3D][Auto] [Guided v][=] |
|                                                                                                          |
|                                   (3D picture, full window)                                              |
|                                                                                                          |
|                                                                                                          |
|        +------------------------------------------------------------------------------+                  |
|        |  3. Manual RFID scan                                              Step 3 of 7 |                  |
|        |  Pushed back down the corridor toward the warehouse ...                      |                  |
|        |  0:26 |===*====|=========|======|===========|========|=======| 1:16          |                  |
|        |        Item   Final     Manual  Inj. W/H    TO Map   Kitting  Main            |                  |
|        |              [|<]  [ > ]  [>|]        1x v     [Numbers]   [EN v]             |                  |
|        +------------------------------------------------------------------------------+                  |
+----------------------------------------------------------------------------------------------------------+
```

- The player bar floats (glass), fades after 4 s of no input while playing (as today) and comes back on any input.
- The scrub line shows the steps as named segments in the path colour; the current one is brighter.
- `[=]` opens the view menu: look (Studio / Night / Blueprint), quality, plan picture, labels, floors slider, mini map,
  measure, sound, full screen, hide everything (`H`). This replaces the rail and the options popover.
- `[Numbers]` opens the numbers drawer (below). `[EN v]` picks the caption language.
- Exact texts: path menu items are the path names; camera menu: `Guided`, `Ride with the trolley`, `Overview`,
  `Director cut` (shown only when the path has keys), `Free`.

#### Build

```
+----------------------------------------------------------------------------------------------------------+
| [File v] [INJ 1|INJ 2|EPS|Press]   1 Item Slip to W/H v   | Present | Build | Direct |  [Undo][Redo] [?]  |
+-----------------------+----------------------------------------------------------+-----------------------+
| [Outline] [Add]       |                         [2D][3D][Auto] [Free v] [Snap 0.5 v] [Ortho] [=]          | Step 3 · Manual RFID  |
|-----------------------|                                                          |-----------------------|
| Find...               |                                                          | Title                 |
|                       |                                                          | [Manual RFID scan   ] |
| PATH  1 Item Slip ... |                                                          | Explanation           |
|  1  Item Slip      1s |                                                          | [Pushed back down...] |
|  2  Final Scan  25.5m |               (3D picture with handles)                  | Stop  [Manual RFID v] |
| >3  Manual RFID  33 m |                                                          | Mode [Push v] Wait[2.6]|
|  4  Inj. W/H    24 m  |                                                          | Speed [4.0] m/s       |
|  5  TO Mapping  55 m  |                                                          |                       |
|  ...                  |                                                          | ROUTE  33.0 m · 3 pts |
| [+ Step] [+ Elevator] |                                                          | [Straighten][L][Auto] |
|                       |                                                          | [Draw]    [No path]   |
| STOPS (8)           > |                                                          |                       |
| DEVICES (9)         > |                                                          | CAMERA                |
| OBJECTS (0)         > |                                                          | Distance [90] m       |
| LAYOUT CHANGES (5)  > |                                                          | Heading [auto] Tilt[a]|
|                       |                                                          | [ ] Hold this view    |
+-----------------------+----------------------------------------------------------+-----------------------+
| 0:26 |=Item=|==Final==|=*Manual=|==Inj W/H==|=====TO Mapping=====|===Kitting===|==Main==| 1:16  [>] 1x  |
+----------------------------------------------------------------------------------------------------------+
| Drag a yellow corner · double-click a leg adds a corner · S straighten        No clashes · Saved 10:42    |
+----------------------------------------------------------------------------------------------------------+
```

- **Outline** (left): the path's steps (drag to reorder; the selected step's route shows handles in the view), then
  collapsible lists of stops, devices, objects and layout changes. Clicking an item selects it in the view and fills
  the inspector. `Find...` filters every list.
- **Add** (left, second tab): a grid of things to place, in groups with these exact titles: `Stops and devices`
  (Stop, PC result, PC mapping, PC quality, RFID gate, Scanner), `Objects` (Crate, Pallet stack, Rack, Column, Wall,
  Safety fence, Cone, Floor arrow, Floor zone, Sign, Trolley), `Factory layout` (Machine, Line, Conveyor, Table, Rack
  block, Storage field, Wall, Door, Trace from the plan picture). Click one, then click (or drag a rectangle on) the floor.
- **Inspector** (right): fields of the selection, in metres / seconds / degrees. Nothing selected: the path's fields
  (name, colour, trolleys, every, wait in line) and the path actions (`Duplicate`, `Reverse`, `Move left`, `Move right`,
  `Delete path`, `New path`).
- The Paths and Steps tabs are merged into this (problem 6). The toolbar, the Project tab and the Scene file panel
  are gone (their actions are in the top bar, the File menu and the status bar).
- Clash and link problems: the status bar chip (`No clashes` green, or `2 clashes · 1 link problem` red; click =
  next problem) and a red mark on the step in the outline.

#### Direct

```
+----------------------------------------------------------------------------------------------------------+
| [File v] [INJ 1|INJ 2|EPS|Press]   1 Item Slip to W/H v   | Present | Build | Direct |  [Undo][Redo] [?]  |
+-----------------------+----------------------------------------------------------+-----------------------+
| CAMERA                |                              [Guided][Ride][Director][Free]   [EN v]  [=]         | Caption               |
| (O)      (+)    | |   |                                                          |-----------------------|
| Orbit    Move  Zoom H |                                                          | From [26.3] To [30.3] |
| [Top][Iso][Trolley]   |                  (3D picture: exactly what the film shows)| Title (EN)            |
| Lens 48 mm  [more v]  |                                                          | [Manual RFID scan   ] |
|-----------------------|                                                          | Text (EN)             |
| VIEWS                 |                                                          | [The operator scans.] |
|  1 Overview           |                                                          | Arabic  [........   ] |
|  2 Warehouse door     |                                                          | Korean  [........   ] |
|  [+ Save this view]   |                                                          | Place [Lower third v] |
|-----------------------|                                                          | Style [Glass v] Size  |
| FILMS                 |                                                          | [Delete caption]      |
|  Full ride 76 s  [Rec]|                                                          |                       |
|  [+ New film]         |                                                          |                       |
+-----------------------+----------------------------------------------------------+-----------------------+
| [|<][>][>|] 0:26.3 / 1:16.3   1x v   [+ Key K] [+ Caption C] [Record my move J]          zoom [- ====o +] |
| STEPS  |=Item=|==Final Scan==|=*Manual RFID=|===Inj. W/H===|======TO Mapping======|==Kitting==|=Main=|    |
| CAMERA |-----<>---------------<>==========<>-----------------------<>---------X--------------------|      |
| TEXT   |            [ Final scan / GR ]        [ Manual RFID scan ]             [ Kitting ]         |      |
| FILM   |      [=================== Full ride ======================================================]|      |
+----------------------------------------------------------------------------------------------------------+
| Frame the view, then K adds a camera key · drag a key to retime it                Saved 10:42             |
+----------------------------------------------------------------------------------------------------------+
```

- **Timeline lanes**, each 36 px high with its name at the left: `STEPS` (named bars; drag a boundary to change the
  wait before it), `CAMERA` (diamonds = keys, `X` = a cut; with the guided camera the planned shots show as bars that
  can be turned into keys with the button `Make keys from the guided camera`), `TEXT` (caption bars with their title;
  drag the body or an edge), `FILM` (the in / out range of the selected film; drag its ends).
- Zoom: `Ctrl+wheel` or the slider; pan: wheel or drag the empty lane area; `Home` fits the whole path. Bars and keys
  snap to step moments and to each other within 6 px (hold `Alt` for free placement). The time under the pointer shows
  in a small tag.
- **Right inspector** shows the selected key, caption or film. A caption shows all three languages at once (no
  language switch needed to translate). Empty fields show the English text in `--text-dim` as a placeholder.
- **Film inspector** exact fields: `Name`, `Path`, `From` / `To` (s) with `Set to now` buttons, `Length` (radio:
  `Real speed 1x` / `Speed [ ] x` / `Exactly [ ] seconds`), `Camera` (Director cut / Guided / Ride with the trolley / As
  it is now), `Language` (English / Arabic / Korean / English + Arabic / English + Korean), `Frames per second`
  (30 / 60 / 24 / 25), `Show` checkboxes (Captions, Step card, Labels), `Quality` (High / Normal), buttons `Preview` and
  `Record film`.
- **While recording**: the docks dim; a centred card shows `Making the film…  frame 312 of 600 · 0:10.4 of 0:20.0`
  with a progress bar and `Cancel`; at the end: `Film saved: <name>.mp4 · 20.0 s · 600 frames · 14.2 MB` in the status
  bar. On a fallback: `This browser cannot make exact films; recording in real time instead.`
- The camera pad is a docked block, not a floating window. `more v` reveals Speed and Smooth (problem 8). Views are a
  named list (double-click to rename); the first six still answer to the pad's number buttons / keys `Ctrl+1..6`.

#### Numbers drawer (from Present or Build; slides up over the timeline, 280 px high)

```
+----------------------------------------------------------------------------------------------------------+
| NUMBERS · one trip, shift [8] h           Compare with: (o) the scene in this file  ( ) a scene file...   |
| Path                          Distance        Time        Trips per shift     Waiting in line             |
| 1 Item Slip to W/H            208 m           1:09.3      415                 -                           |
|   before                      208 m           1:09.3      415                                             |
| 2 Item Slip to Umbrella       344 m  -9 m     1:42.1 -3 s 282  +8             -                           |
|   before                      353 m           1:45.0      274                                             |
| [=====bar: distance per step, coloured by step=====]                               [Copy as text] [Close] |
+----------------------------------------------------------------------------------------------------------+
```

Green for less distance / time or more trips, red for the opposite. `Copy as text` puts the table on the clipboard as
plain text for a report. The values come from `MFMotion.numbers` on both sides (the same function as the CLI).

#### File menu (replaces the Scene file panel and the Project tab)

```
 File
 +----------------------------------+
 | Open scene...            Ctrl+O  |
 | Save                     Ctrl+S  |
 | Save as...         Ctrl+Shift+S  |
 | Download a copy                  |
 |----------------------------------|
 | Check the scene                  |   -> list of problems opens in the right dock; click one to go there
 | Scene title and notes...         |
 |----------------------------------|
 | Go back to the scene in this file|   (was "Reset to built-in")
 | Load my older browser copy       |   (only when there is one)
 +----------------------------------+
 status bar chip:  Saved 10:42  |  Saving...  |  Not saved in this browser: download a copy   (red, stays)
```

#### Command palette (`Ctrl+K` or `[Find]`)

```
 +--------------------------------------------------------------+
 | > door                                                       |
 |--------------------------------------------------------------|
 |  Cut a door in a wall                              Build     |
 |  Open doors where a line crosses walls             Build     |
 |  Stop: 2F Elev 6 door                              go to     |
 +--------------------------------------------------------------+
```

Lists every action of the action table (with its key, if any) and every stop, device, step and path by name
("go to" = select and fly there). `Enter` runs; `Esc` closes.

#### Keyboard map (`?` or `F1`)

One overlay, generated from the action table (the same source as `docs/CONTROL_GUIDES/KEYBOARD.md`), grouped by
workspace, with a search field. The old help table in the page shell and the table in the Project tab are removed.

### 5.6 Keyboard, mouse, touch

**Mouse in the 3D view** (unchanged where it works today): left drag = orbit (on a selected object or handle: move it);
right drag or `Shift`+drag = pan; wheel = zoom toward the pointer; double-click = fly there (on a leg in Build: add a
corner); right-click = menu of the thing under the pointer.

**Keys that change** (all others stay as in `docs/CONTROL_GUIDES/KEYBOARD.md`):

| key | now | new |
|---|---|---|
| `1` / `2` / `3` | - / 2D / 3D | Present / Build / Direct |
| `Shift+2` / `Shift+3` / `Shift+A` | - | 2D / 3D / auto view |
| `Alt+1 … 6` | Studio tabs | removed (tabs are gone) |
| `Tab` | focus | (when the 3D view has the focus) collapse / show the docks |
| `Ctrl+K` | - | command palette |
| `D` | - | door tool (Build) |
| `T` | - | trace tool (Build) |
| `I` / `O` | - / ortho | set the film's in / out to now (Direct); ortho moves to `Shift+O` |
| `,` / `.` | - | one film frame back / forward (Direct, paused) |
| `Ctrl+1 … 6` | - | fly to view 1 … 6 |

**Touch** (coarse pointer): one finger drag = orbit; two fingers = pan and pinch zoom; double tap = fly there; long
press = the right-click menu; controls are 40 px high; the timeline scrubs with one finger and zooms with two; sticks on
the camera pad already use pointer events and keep working. Build is not offered under 800 px width (message in the
workspace switch: `Build needs a wider screen`).

### 5.7 Empty states, onboarding, messages

**First run** (no `mf8:seen` in the browser storage): a card over the picture, once:

```
 +--------------------------------------------------------------------+
 |  Material Flow                                                     |
 |  Watch how a trolley moves through the factory, step by step.      |
 |                                                                    |
 |  [ > Play this path ]     [ Change the scene ]     [ Make a film ] |
 |                                                                    |
 |  Space plays and pauses · drag to look around · ? shows every key  |
 |                                             [ ] Do not show again  |
 +--------------------------------------------------------------------+
```

The three buttons go to Present (and play), Build and Direct. Each workspace shows three coach marks the first time it
opens (small arrows with one sentence each, dismissed by any click): Build: `Pick a step here` (outline), `Drag the
yellow corners to move the route` (view), `Its details are here` (inspector). Direct: `Frame the view with the mouse or
the pad`, `Press K to keep it as a camera key`, `Drag keys and captions on the timeline`.

**Empty states** (exact texts, each with one button):

| place | text | button |
|---|---|---|
| CAMERA lane, no keys | `No camera keys: the guided camera films this path.` | `Make keys from the guided camera` |
| TEXT lane, no captions | `No captions yet.` | `Add one caption per step` |
| FILMS, none | `No films yet. A film is a part of the path saved as a video.` | `New film of the whole path` |
| VIEWS, none | `Save views you want to come back to.` | `Save this view` |
| OBJECTS (0) | `Nothing placed yet. Use Add to place crates, signs, fences…` | `Open Add` |
| LAYOUT CHANGES (0) | `The factory is as in the drawing.` | - |
| Numbers, one trolley | `One trolley on this path. Set Trolleys in the path's details to see waiting.` | - |

**Messages** go to the status bar and stay until the next message; errors are red and also listed under
`File > Check the scene`. Every refusal says why and what to do, for example:
`Not placed: the scanner must stand on a route. Click a route line.` /
`The door is too narrow for the trolley (1.6 m). It needs 2.2 m.` /
`Not loaded: 3 problems in the scene file. See File > Check the scene.`

### 5.8 Accessibility

- Every control reachable by `Tab` in a sensible order; visible focus ring (`--focus`); `Esc` closes the top-most menu,
  palette or tool.
- Roles: top bar `toolbar`; workspace switch `tablist`; docks `region` with a label; outline `tree`; timeline lanes
  `group` with `slider` semantics for the play head (arrow keys +-1 s, `Shift` +-5 s, as today); status bar
  `role="status"` (polite); recording progress `progressbar`.
- Text contrast at least 4.5 : 1 (the tokens above meet it); nothing is told by colour alone (clashes have an icon and a
  count; deltas have a sign).
- `prefers-reduced-motion`: no panel animation, no camera fly-to animation (jump), the opening rise is skipped.
- Captions: Arabic fields and captions are right-to-left with `--font-ar`; Korean uses the system font.
- Minimum window: 1024 x 640 without horizontal scrolling of the page.

### 5.9 Remove or merge

| today | becomes |
|---|---|
| Right rail (12 icon buttons), options popover, camera popover | view tools at the view's corner + the `[=]` view menu |
| Scene file panel, Project tab | File menu + status bar chip |
| Studio toolbar (undo, redo, snap, ortho, straighten, keys, checks, saved) | Undo / Redo in the top bar; Snap / Ortho at the view; Straighten in the inspector; checks and saved in the status bar |
| Tabs Objects, Paths, Steps, Director, Numbers, Project | workspaces Build (outline + inspector), Direct, the Numbers drawer, the File menu |
| Floating camera pad with Speed / Smooth always shown | docked camera block; Speed / Smooth under `more` |
| Shots 1 to 6 | named views |
| Three keyboard helps | one generated keyboard map |
| "Click again within 3 s" confirmations | one confirm line in the status bar |
| `DRAFT ORDER` tag | removed (question Q7 for the owner) |
| Hint line at the bottom of the Studio panel, toasts | status bar |
| Old steps list panel (left) and its toggle | the scrub line's named segments (Present) and the outline (Build) |

---

## 6. Implementation plan

Order: M0 to M10. Inside a milestone, tasks run in the listed order. Every task has the same headings:
**Goal / Files / Do / Data / UI text / Edge cases / Tests / Accept / Docs / Do not change.** A heading is left out only
when it has nothing to say.

**The gate** (run after every task that touches the engine, the cores or the Studio; full list in Appendix C):
`node tools/v8/gate.mjs <player.html> --quick` during work, without `--quick` before a release. Until task T0.4 creates
it, run the commands of Appendix C by hand.

**A release** (last task of every milestone) always means: build `dist/Material_Flow_Player_v<stage>.html`; run the full
gate on it; copy it to `dist/versions/`; add `"<stage>"` to `STAGES` and the previous stage to the read-only list of the
build; set `STAGE` in `tools/v7/mf-commands.mjs`; finish the `## V<stage>` entry in `docs/CHANGELOG.md`; update
`docs/STATUS.md` (one dated paragraph: what the owner can now do, what was checked, what is open) and
`docs/OPEN_ISSUES.md`; run `node tools/mf.mjs docs-check`. The lead commits.

### M0. Release and guard what exists (`v7.7.2`)

Why first: the tools already run an engine the owner does not have, under the name of the owner's file (1.4 item 2).

#### T0.1 The build never overwrites another release

- **Goal:** no command can damage a released player.
- **Files:** `tools/build-v7.mjs`.
- **Do:**
  1. Replace the fixed list `["v4", "v5", "v6", "v7.1", "v7.6", "v7.7"]` by a rule: let `own = "dist/Material_Flow_Player_v" + stage + ".html"`.
     If the resolved output path matches `dist/Material_Flow_Player*.html` (any name directly in `dist/`) and is not
     `own`, throw `earlier versions are read-only; use --out dist/test/<name>.html`.
  2. When the output is `own` and the file exists: copy it first to
     `dist/backup/Material_Flow_Player_v<stage>-<yyyymmdd-hhmmss>.html` (create the folder; keep the newest 5 files whose
     name starts with `Material_Flow_Player_v<stage>-`, delete older ones).
  3. Write to `<out>.tmp`, then `renameSync` to the final name.
- **Edge cases:** paths with different case or slashes (compare resolved, lower-cased paths, as the file does today);
  `--out` inside `dist/versions/` stays refused; `dist/backup/` is never an allowed output.
- **Tests:** in `tools/v7/review-test.mjs` style, add three cases to a new `tools/v8/build-guard-test.mjs` (no browser):
  building stage `7.7.2` with `--out dist/Material_Flow_Player_v7.7.1.html` exits non-zero and leaves the file's sha256
  unchanged; building to `dist/test/guard.html` works; building twice to a temporary own-stage copy creates one backup.
  Use `--no-docs-check` and `--bake docs/examples/sample.scene.json` so no private data is needed beyond the V6 input.
- **Accept:** the three cases pass; `sha256` of `dist/Material_Flow_Player_v7.7.1.html` before and after the test run is equal.
- **Docs:** `docs/ENGINE.md` (one paragraph "Release files are protected"), `docs/CHANGELOG.md` under V7.7.2, `docs/LESSONS.md`
  (L-PL-18: a version pointer that lags the tools lets them overwrite the owner's file; rule: the build guards every release).
- **Do not change:** any file in `dist/` other than through the test's own outputs.

#### T0.2 Camera test starts Chrome through the shared driver

- **Goal:** the camera acceptance test never dies at launch.
- **Files:** `tools/test-camera-v5.mjs`.
- **Do:** remove its own `spawn` / port / WebSocket code; `import { openPage } from "./v7/cdp.mjs"`; per run
  `const pg = await openPage(file, hash, { query: "q=high", size: "1920,1080" })`, run the same page script through
  `pg.ev(...)`, `await pg.close()` in `finally`. Keep the arguments, the output lines and the exit code exactly.
- **Tests / Accept:** `node tools/test-camera-v5.mjs dist/test/v772-cam2.html inj1 guided 3 0` prints one `PASS` or `FAIL`
  line and exits 0 or 1; five runs in a row never throw.
- **Docs:** `docs/CHANGELOG.md` (V7.7.2, Fixed).

#### T0.3 Verify the review work and release `v7.7.2`

- **Goal:** the owner gets today's work (layout additions, calm camera, review fixes) as a file.
- **Do:**
  1. Read `docs/REVIEW_REPORT_772.md` and `private/v7/layout-audit/HANDOFF.md`. If another agent is still editing
     `tools/`, wait for its report; do not edit the same files at the same time.
  2. Build `node tools/build-v7.mjs 7.7.2 --out dist/test/rc-772.html --no-docs-check` and run every command of
     Appendix C on it. Record each result in `dist/test/rc-772-results.json` (`{ name, command, exit, lastLine }`).
  3. The camera rows (10 paths, guided, 3x) must be `PASS`. If one fails, do not tune the reactive camera further
     (M3 replaces it): record the failing path, time and obstacle in `docs/OPEN_ISSUES.md` issue 1 and continue.
  4. Release as described at the top of section 6 (stage `7.7.2`; add `"v7.7.1"` protection comes from T0.1's rule).
- **Accept:** `dist/Material_Flow_Player_v7.7.2.html` exists; the full Appendix C list passes except rows recorded as
  open issues; `node tools/mf.mjs docs-check` prints `docs-check OK`; `dist/Material_Flow_Player_v7.7.1.html` hash unchanged.
- **Docs:** CHANGELOG (remove "(in progress)"), STATUS, OPEN_ISSUES (issue 1 updated with the numbers of section 1.1),
  `docs/REVIEW_REPORT_772.md` "Verification" section filled with the receipts.
- **Do not change:** the owner's scenes; the review's code (verify, do not rewrite).

#### T0.4 The gate script

- **Goal:** one command proves a player.
- **Files:** new `tools/v8/gate.mjs`.
- **Do:** `node tools/v8/gate.mjs <player.html> [--quick] [--only name,name] [--out dist/test/gate-<name>]`. It runs the
  rows of Appendix C one after another with `execFileSync(process.execPath, [...], { stdio: "pipe" })`, never two at a
  time, each with a 20-minute limit; writes `<out>/<row>.log` and `<out>/results.json`
  (`[{ name, command, exit, seconds, lastLine }]`); prints one line per row (`PASS identity 41 s`); exit code 1 when any
  row fails. `--quick` runs only rows marked quick. Rows that need the private scenes are skipped with
  `SKIP (no private scenes)` when `private/v7/scenes` is missing. For the identity row it first builds the identity
  player itself (command in Appendix C) into `<out>/identity.html`.
- **Accept:** on `dist/Material_Flow_Player_v7.7.2.html` the quick gate ends in under 3 minutes and the full gate prints
  a result for every row.
- **Docs:** `docs/ENGINE.md` "Tests" section: replace the table's intro with "run the gate"; keep the table.

#### T0.5 Housekeeping

- **Files / Do:** `.gitignore`: add `.mf-history/`. New `src/README.md` (5 lines): the files in `src/` are the source of
  the V2 to V4 players, kept as history; V5 and later are built from the V4 / V6 HTML; the current engine source is
  `src/v8/` from V8.0. `docs/START_HERE.md`: add one row to the folder map: `docs/plans/V8_MASTER_PLAN.md | the build
  plan for V8`. Verify the claim about `src/` first: `tools/build-v5.mjs`, `build-v6.mjs`, `build-v7.mjs` must not read
  `src/` (search for `"src/` in them); if one does, write what it reads into the README instead.
- **Accept:** `node tools/mf.mjs docs-check` OK.

### M1. Engine from source, one motion model (`v8.0`)

#### T1.1 Extract the engine text and rebuild it byte-identical

- **Goal:** stage A of 4.1.
- **Files:** new `tools/v8/extract.mjs`, `tools/v8/same.mjs`, `tools/build-v8.mjs`, `.gitattributes`; generated
  `src/v8/**` and `private/v8/base/**`.
- **Do:**
  1. `.gitattributes`: one line `src/v8/** -text`.
  2. `tools/v8/extract.mjs <reference.html>`: follow the table in 4.1. Find scripts with the same regular expression the
     build uses (`/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi`). Identify each script by content, not by number:
     three.js starts with `var THREE=`; the add-ons script is the one right after it; light tables start with
     `window.MF7_LIGHT_ERASE=`; baked scenes have `id="mf7-embedded"`; scene core starts with `/* Material Flow scene core`;
     preload with `/* V7 preload`; the data script starts with `window.MF_DEVICE_DIMS=`; atmosphere with `/* DFAtmos`;
     look with `/* Offline, seeded surface library`; assets with `window.MF_ASSETS=`; the engine contains
     `camera-envelope.js` in its first 200 characters; the two last scripts start with `/* Material Flow V`.
     Throw when any of the 13 is not found exactly once.
  3. The style: the build appends `scene-ui.css` and `studio.css` before `</style>`. Remove exactly that appended text
     (it equals `read("scene-ui.css") + "\n" + read("studio.css")`) to get `src/v8/player.css`; throw if the style does
     not end with it.
  4. The shell: the reference with each script body and the style body replaced by its token.
  5. `tools/build-v8.mjs`: same command line as `build-v7.mjs` (`<stage>`, `--out`, `--bake`, `--no-docs-check`), the
     same guards (T0.1), `STAGES` keyed `8.0` onward with the same `groups` / `css` shape. It computes the light tables
     and the scene bundle with the same code as `build-v7.mjs` (move those two blocks into a shared
     `tools/v8/build-parts.mjs` and import them in both builds), fills the tokens, runs the inline-script parse and the
     docs check as today. A hidden stage name `ref-772` reproduces the reference (title text "V7.7.2", wrapper comments
     "Material Flow V7.7.2") so the hash can match.
  6. `tools/v8/same.mjs a b`.
- **Edge cases:** CRLF inside scripts (write `Buffer.from(text, "utf8")`, never normalise); the `safe()` escaping of
  `</script` is already in the reference text, so the sources are stored escaped and the build must not escape the
  `src/v8` files again (only the `tools/v7` modules, as today); the reference must be built with the default baked scenes.
- **Tests:** `node tools/build-v7.mjs 7.7.2 --out dist/test/ref-772.html --no-docs-check`,
  `node tools/v8/extract.mjs dist/test/ref-772.html`, `node tools/build-v8.mjs ref-772 --out dist/test/src-772.html --no-docs-check`,
  `node tools/v8/same.mjs dist/test/ref-772.html dist/test/src-772.html`.
- **Accept:** `same.mjs` prints `identical` and one sha256; `git status` shows no file under `private/` or `dist/` as
  new tracked content; `src/v8` contains no line longer than 100,000 characters (a guard against company data: the
  data and asset lines are megabytes long; the tool throws if one would land in `src/v8`).
- **Docs:** `docs/ENGINE.md` (new "How the player is made" for V8), `docs/DECISIONS.md` (D1), `docs/PROJECT_MAP.md`
  (`src/v8`, `private/v8/base`, `tools/v8`).
- **Do not change:** `tools/v7/engine-patches.mjs`, `dist/Material_Flow_Player_v6.html`.

#### T1.2 Split the engine into parts

- **Goal:** stage B of 4.1.
- **Files:** new `tools/v8/split-player.mjs` (one-time), `src/v8/player/*.js`, `tools/build-v8.mjs`.
- **Do:** cut `src/v8/player.js` as 4.1 says; file names `NN-<name>.js` where `<name>` is the section comment's text in
  lower case with non-letters turned into `-` (first 30 characters). The build concatenates `src/v8/player/*.js` sorted
  by name with no separator. Delete `src/v8/player.js`.
- **Accept:** `same.mjs` still prints `identical` for the `ref-772` stage.
- **Docs:** `docs/ENGINE.md`: a table of the parts with one line each (take it from Appendix F).

#### T1.3 `v8.0` stage and tools switch to the source build

- **Files:** `tools/build-v8.mjs` (stage `8.0`), `tools/mf.mjs` (`bake` and `bakeTemp` call `tools/build-v8.mjs` when
  `STAGE` starts with `8`), `tools/v7/docs-check.mjs` (rule 6 looks for the stage in `tools/build-v8.mjs` when it starts
  with `8`), `tools/v7/scene-node.mjs` (`readProjects`: when `private/v8/base/projects.json` exists and the player is
  not given explicitly, read that file instead of scanning the HTML).
- **Edge cases:** `--player <file>` must still read any older player's `var P` line.
- **Accept:** `node tools/build-v8.mjs 8.0 --out dist/test/v80a.html --no-docs-check` then the quick gate passes;
  `node tools/mf.mjs numbers docs/examples/sample.scene.json --player dist/test/v80a.html` prints the same lines as
  with the 7.7.2 player.

#### T1.4 The motion core

- **Goal:** 4.2.
- **Files:** new `src/v8/motion-core.js`; `src/v8/player/*flows*` part; `tools/build-v8.mjs` (insert the core as its
  own script right after the scene core); `tools/v7/scene-node.mjs` (new `loadMotionCore()` like `loadSceneCore()`).
- **Do:** as 4.2. Work function by function: move one, leave the wrapper, build, run
  `node tools/v8/gate.mjs dist/test/v80b.html --only identity`, then the next. Order: `cleanPath`, `segmentProfile` /
  `segmentAdvance` / `segmentSpeed`, `buildSchedule`, `sampleSchedule`, `scheduleManualStops`, the timeline part of
  `buildFlow`, `lotPos`, `glideX` / `glideY` / `glideAt`, `W`.
- **Edge cases:** `buildFlow` mutates `f.items`, `f.total`, `f.E` (keep that in the engine wrapper); `lotPos` returns
  the item object in `out.it` (keep); `scheduleManualStops` reads the device list (pass
  `devices.filter(d => d.type === "rfid-manual" && d.routeBound && d.node == null)`; check the engine's own filter and
  copy it); elevator choice `elevatorFor(f)` stays in the engine and its result is passed in.
- **Tests:** new `tools/v8/motion-test.mjs` (Node only): for every `docs/examples/*.scene.json` and, when present, every
  `private/v7/scenes/*.scene.json`: convert with `SC.toInternal`, compute `MFMotion.numbers`; assert totals are finite
  and steps sum to the path. Plus the identity row of the gate.
- **Accept:** identity `PASS: all paths play identically`; `motion-test` prints `OK <n> paths`.
- **Docs:** `docs/ENGINE.md` modules table (new row), `docs/DECISIONS.md` (D2).
- **Do not change:** any constant value; the order of operations inside a moved function.

#### T1.5 The CLI and the Numbers tab use the motion core

- **Files:** `tools/v7/mf-ops.mjs` (`numbers`, `storyStart`; delete `legTime` and the private constants),
  `tools/v7/studio-numbers.js` (`flowNumbers` -> `MFMotion.numbers` for both the current and the base scene),
  `tools/build-v8.mjs` (the Studio group can see `window.MFMotion`).
- **Do:** `numbers(scene, P)` = `MFMotion.numbers(conv.data, conv.data.flows, layout.elevators)` after
  `SC.toInternal`; keep its return shape. `storyStart` uses `MFMotion.timeline` item times: `start` = `t0`,
  `arrive` = `tm`, `leave` = `t1` (today `arrive` is "end minus 0.7 s", which is wrong when a step has its own wait).
- **Edge cases:** `storyStart(... "arrive")` changes for steps with a `wait` other than 0.7: say so in the changelog.
- **Tests:** new `tools/v8/numbers-test.mjs`: opens the player once per tab through `openPage`, reads
  `MF.D.flows.map(f => f.items.slice(1).map(it => [it.metres, it.t1 - it.t0]))` and compares with
  `numbers(scene, P)` for the baked scene: every value within 1e-6. Compares the Numbers tab's values the same way
  (`MFX.setTab("numbers")`, read the table cells).
- **Accept:** `numbers-test` passes on all four tabs; the Numbers tab shows 69.3 s and 415 trips for `inj1-wh` (was
  1:08.0 and 423); every expected output printed in `docs/RECIPES.md` is re-run and corrected where it changed.
- **Docs:** `docs/RECIPES.md` outputs, `docs/CONTROL_GUIDES/NUMBERS.md`, `docs/OPEN_ISSUES.md` (close 11),
  `docs/CHANGELOG.md`, `docs/LESSONS.md` (L-PL-19: three copies of one calculation drift; one core, loaded everywhere).

#### T1.6 Release `v8.0`

As "A release". Extra acceptance: full gate; `tools/v8/numbers-test.mjs`; the owner's four scenes validate with 0 errors.
`docs/STATUS.md` says plainly: "V8.0 looks and plays like V7.7.2; the change is inside."

### M2. Films (`v8.1`)

#### T2.1 Engine: off-line stepping

- **Goal:** the recorder can advance the story by an exact amount per film frame (4.4 step 1).
- **Files:** `src/v8/player/*frame*`, `*export*`.
- **Do:** first check 1.6: if the engine source already has the line `if (window.MF7_EXPORT) { requestAnimationFrame(tick); return; }`
  in `tick`, keep it and make the two functions below thin wrappers over it
  (`offline: (on) => { window.MF7_EXPORT = !!on; last = performance.now(); }`); otherwise add
  `const OFFLINE = { on: false };` and, as the first statement of `tick(now)`,
  `if (OFFLINE.on) { last = now; requestAnimationFrame(tick); return; }`. Add to `MF.x`:
  `offline: (on) => { OFFLINE.on = !!on; last = performance.now(); }`,
  `step: (dt) => frame(dt, S.t)`,
  `setRenderScale: (k) => { resolutionScale = k == null ? 1 : k / ({ high: .85, medium: .8, low: .65 }[S.quality]); resize(); }`
  (so `setRenderScale(1)` renders at full size; `setRenderScale(null)` restores), and
  `governor: (on) => { GOV = !!on; }` after changing `const GOV_ON` into `let GOV = query.get("gov") !== "0"` and using
  `GOV` in the two places `GOV_ON` is read.
- **Edge cases:** the preparing screen must have finished (`await MF.prepared`) before `offline(true)`; `frame()` pauses
  itself at the path's end: the recorder sets `S.playing = true` again before each call while frames remain.
- **Tests:** new `tools/v8/offline-test.mjs` (browser): `offline(true)`; 300 calls of `step(1 / 30)` at speed 1 from
  `t = INTRO`; assert `MF.S.t` equals `INTRO + 10` within 1e-9 and that `MF.lotPose(MF.S.t)` equals the pose reached by
  `MF.seek(INTRO + 10)` within 1e-9.
- **Accept:** test passes; identity row passes (normal playback untouched).

#### T2.2 MP4 writer and reader

- **Goal:** 4.4 step 5; Appendix D.
- **Files:** new `src/v8/mp4-mux.js` (plain script: `window.MFMp4` / Node export), new `tools/v8/mp4-info.mjs`.
- **Do:**
  ```
  MFMp4.create({ width, height, fps, codecString })  -> mux
  mux.add(bytes: Uint8Array, isKey: boolean, config?: Uint8Array)   one encoded frame in decode order; config = avcC bytes (first frame)
  mux.finish()  -> Uint8Array[]  (the file's parts in order: ftyp, moov, mdat header, frames)   throws when no config or no frame was given
  mux.stats     -> { frames, bytes, seconds }
  ```
  `tools/v8/mp4-info.mjs <file>` prints and exports `mp4Info(buffer) -> { brand, timescale, duration, seconds, width,
  height, frames, keyFrames, codec, fastStart }` by walking the boxes (`moov/mvhd`, `trak/tkhd`, `mdia/mdhd`,
  `stbl/stsd`, `stsz`, `stss`), with clear errors on a truncated file.
- **Tests:** `tools/v8/mp4-test.mjs` (Node): feed 60 fake frames (random bytes, every 30th a key frame, a 30-byte fake
  config), `finish()`, `mp4Info`: frames 60, key frames 2, seconds 2.0 at 30 fps, `fastStart` true, file length equals
  the sum of the parts.
- **Accept:** test passes; a film from T2.3 opens in Chrome (`<video>` reports the duration within 0.04 s) and in
  Windows' own player and in PowerPoint (owner's click test, recorded in STATUS).

#### T2.3 The film recorder

- **Goal:** 4.4 steps 2 to 6.
- **Start from what exists (1.6):** `prepareExport`, `exportFrame`, `finishExport` in `tools/v7/studio-director.js`
  already do the warm-up and the exact stepping. `recordFilm` calls `prepareExport(take)`, then for each frame the
  stepping part of `exportFrame` (split it into `stepExportFrame(index)` that renders and composes, and the JPEG
  return used by `tools/v7/film-export.mjs`), then `finishExport()` in `finally`. Do not write a second stepping loop.
- **Files:** `tools/v7/studio-director.js` (new functions; `startTake` chooses the path), `tools/build-v8.mjs`
  (`mp4-mux.js` goes into the Studio script group, before `studio-core.js`).
- **Do:**
  ```
  async function recordFilm(take, { onProgress } = {})  -> { ok, blob, mime, frames, seconds, fps, bytes, frozenFrames, rescues, path: "frames" | "realtime", message }
  function filmPlan(take)        -> { fi, t0, t1, speed, fps, frames, width, height, bitrate, codec }   (pure; throws OpError-like { code, msg })
  function drawCaptionsCanvas(g, t, d, langs, W, H)      captions of director entry d at story time t, in 1 or 2 languages
  function wrapText(g, text, maxWidth) -> string[]
  function frameThumb(canvas) -> Uint8ClampedArray        32 x 18 RGBA
  ```
  `filmPlan`: `speed = take.seconds ? (t1 - t0) / take.seconds : (take.speed || 1)`; `frames = Math.round((t1 - t0) / speed * fps)`;
  `width` / `height` = the window's inner size rounded down to even numbers (`take.size` is honoured only when it equals
  that; otherwise the result carries a warning "film size follows the window: W x H"); `codec` = `avc1.64002A` when
  `fps > 30` or `width * height > 2073600`, else `avc1.640028`; `bitrate` = `(quality === "high" ? 12e6 : 6e6) * width * height / 2073600`.
  `recordFilm` steps: save player state (as `startTake` does today); `await VideoEncoder.isConfigSupported(cfg)`; if not
  supported or no `VideoEncoder`: return `recordRealtime(take)` (T2.4). Else: set path, camera, `X.setRenderScale(1)`,
  `X.governor(false)`, reflection off (`MF.reflection.set({ enabled: false })`, restore after), `X.offline(true)`;
  `MF.seek(t0)`; three warm-up `X.step(0)` calls; loop over frames as 4.4 step 1; after each `X.step`: `compositeFrame()`
  (with the caption part replaced by `drawCaptionsCanvas`), thumbnail compare, `new VideoFrame(rec.comp, { timestamp:
  Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) })`, `encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })`,
  `frame.close()`, wait while `encoder.encodeQueueSize > 4` (`await new Promise(r => setTimeout(r, 0))`), `onProgress(i + 1, frames)`
  every 10 frames; `await encoder.flush()`; `mux.finish()`; `new Blob(parts, { type: "video/mp4" })`. The encoder's
  `output(chunk, meta)` copies the chunk (`chunk.copyTo`) and calls `mux.add(bytes, chunk.type === "key", meta?.decoderConfig?.description)`.
  If chunk timestamps ever go backwards, stop and fall back to `recordRealtime` with the message
  "This encoder reorders frames; recording in real time instead." Always, in `finally`: `X.offline(false)`,
  `X.setRenderScale(null)`, `X.governor(true)`, restore reflection and player state (`restoreTakeState`).
  `rescues` = `MF.sight.stats.rescued` after minus before.
  Captions: for each caption with alpha > 0 at `t` (same 0.35 s fade as on screen): box width `min(0.62 * W, 900 px)`
  (`left` / `right` places: `0.36 * W`), padding 18 px, title `600 22px` and text `16px` times `size`, font
  `"Segoe UI", system-ui` (Arabic: `"Segoe UI", Tahoma`); per language: `g.direction = lang === "ar" ? "rtl" : "ltr"`,
  `g.textAlign = centred places ? "center" : (rtl ? "right" : "left")`; wrap with `wrapText`; two languages: the second
  block under the first with a 1 px line at 30 % white between; background and text colours per style from a small
  table copied from `studio.css` (`glass`, `cinema`, `banner`, `minimal`); places as the CSS classes position them.
  On screen the same function draws nothing: the page keeps its DOM captions (so the Studio still shows editable text).
- **UI text:** progress card and messages as in 5.5 (Direct, "While recording").
- **Edge cases:** the take's path has no keys and `cam` is `director` -> guided (as today, and say so in the result
  message); `t1` beyond the path's end -> clamp; zero frames -> error `E_RANGE`; the window is resized during recording
  -> cancel with "The window changed size; the film was stopped."; `Esc` cancels; a second `recordFilm` while one runs
  is refused.
- **Tests:** new `tools/v8/film-test.mjs` (browser, `docs/examples/director.scene.json` baked into a test player): a
  10 s, 30 fps film of `sample-1` from `start`: result `path === "frames"`, `frames === 300`, `frozenFrames === 0`;
  `mp4Info`: 300 frames, 10.0 s; a second film with `lang: "en+ar"` and one Arabic caption: no page error, and the
  frame at the caption's middle differs from the same frame without captions (compare two thumbnails). The old
  `tools/v7/take-test.mjs` still passes.
- **Accept:** as the tests; a 20 s, 30 fps, 1920 x 1080 film is made in under 60 s on this PC; the first film frame
  shows story time `t0` exactly (`mux` frame 0 is rendered after the warm-up, not before).
- **Docs:** `docs/CONTROL_GUIDES/DIRECTOR.md`, `docs/OPEN_ISSUES.md` (close 9 and 15, or restate what remains),
  `docs/DECISIONS.md` (D4), `docs/LESSONS.md` (L-PL-20: a film recorded on a wall clock is not a film of the story
  clock; step the story per frame).

#### T2.4 Real-time fallback, repaired

- **Files:** `tools/v7/studio-director.js`.
- **Do:** rename today's `startTake` body to `recordRealtime(take)` returning the same result shape as `recordFilm`
  (promise resolved in `mr.onstop`). Changes: before `mr.start`, with the player paused at `t0`, wait for 30 animation
  frames; call `MF.play()` only after the first `dataavailable` event or 500 ms, whichever comes first; in `recFrame`
  measure the gap between composed frames: over 250 ms -> `stalls++`; a stall while `S.t < t0 + 2 * speed` and
  `retries < 1` -> stop, discard, start again; result `seconds` = measured from the blob through a `<video>` element's
  `duration`; `message` = "Recorded in real time; the length is not exact." `startTake(take)` stays as a thin wrapper
  (`recordFilm(take).then(saveFilmBlob)`) so existing callers and tests work.
- **Tests:** `film-test.mjs --realtime` case: force the fallback with `window.VideoEncoder = undefined` before the call;
  result `path === "realtime"`, a blob with a video MIME type, `stalls` reported.
- **Accept:** test passes.

#### T2.5 CLI: `mf take` options, receipt, verification

- **Files:** `tools/mf.mjs`, `tools/v7/mf-commands.mjs`, `tools/v7/mf-ops.mjs` (`addTake`), `tools/v7/scene-core.js`
  (validator), `tools/v7/scene-schema.mjs`.
- **Do:** options of 3.7 (`--seconds`, `--speed`, `--fps`, `--size`, `--cam`, `--lang`, `--no-captions`, `--no-card`,
  `--no-labels`, `--quality`, `--out`, `--save`, `--poster`, `--realtime`) plus `--encoder webcodecs|ffmpeg`
  (default `webcodecs`; `ffmpeg` runs today's `tools/v7/film-export.mjs` unchanged and fails with `E_ENV` when ffmpeg
  is not on the PATH; see 1.6). Keep `film-export.mjs`'s per-frame story-clock check for both encoders. The verb opens the page with
  `size = opt.size || "1920,1080"`, calls `MFX.recordFilm(take)` (exported on `MFX`), reads the blob in 4 MB base64
  pieces (existing code), writes the file, then `mp4Info`; compares frames and seconds with the plan (tolerance one
  frame); writes `<out>.json` (fields in 3.7); `--poster`: `mf shots`-style capture at 40 % of the range into `<out>.png`.
  Output line: `<out>: 20.0 s, 600 frames, 30 fps, 1920x1080, 14.2 MB, camera guided, frames path, 0 frozen`.
  Exit 1 when the check fails, when `frozenFrames > 0`, or when the fallback was used without `--realtime`
  (message: `the exact recorder is not available here; pass --realtime to accept a real-time capture`).
  `--save name`: `addTake(scene, take)` and write the scene (through today's `validateOrDie` + `writeScene`).
- **Data:** Appendix A rows `takes[].seconds`, `.lang`, `.size`, `.poster`; `fps` allowed values 24, 25, 30, 60
  (validator: error otherwise); `lang` one of `en`, `ar`, `ko`, `en+ar`, `en+ko`, `ar+ko`; `seconds` 1 to 3600 and not
  together with `speed`; `size` two even whole numbers 320 to 3840.
- **Edge cases:** `--seconds` and `--speed` together -> usage error (exit 2); `--to` before `--from`; unknown path.
- **Tests:** `tools/v8/film-test.mjs` drives the CLI once: `node tools/mf.mjs take docs/examples/director.scene.json
  --path sample-1 --seconds 8 --fps 30 --out dist/test/film-cli.mp4` -> exit 0, the JSON receipt exists, `mp4Info`
  seconds 8.0, frames 240. Validator test: three planted faults (`fps: 50`, `lang: "fr"`, `seconds` with `speed`) each
  give exactly one error (add to `tools/v7/validator-test.mjs`).
- **Accept:** tests pass; the Phase E request "a 20 s film with Arabic and English captions" is done by two commands
  with no ffmpeg (write them into `docs/RECIPES.md` recipe 9).
- **Docs:** `docs/CLI.md` (generated + "Things to know": exact length, languages, receipt), `docs/RECIPES.md` (9),
  `docs/SCENE_MANUAL.md` (generated fields + section 8 text on takes), skill `material-flow-directing`.

#### T2.6 Studio: film card and progress

- **Files:** `tools/v7/studio-ui.js` (`renderDirector`, the REC heads-up), `tools/v7/studio.css`.
- **Do:** in the take card add the fields `Length` (`Real speed 1x` / `Speed` / `Exactly … seconds`), `Language`,
  `Frames per second` with the exact labels of 5.5; the record button text becomes `Record film`; replace the REC
  heads-up content during a frames-path recording by the progress card of 5.5 (`Making the film…`), with `Cancel`.
  (The full Direct workspace comes in M7; this task only makes the feature usable now.)
- **Tests:** `tools/v7/ui-check.mjs`: add one check that the three new fields exist and that changing `Exactly … seconds`
  to 12 writes `seconds: 12` into `MFX.doc.takes[0]` and removes `speed`.
- **Accept:** check passes; a film recorded from the button equals the CLI's for the same take (frames and seconds).

#### T2.7 Release `v8.1`

As "A release". Extra: `tools/v8/film-test.mjs` in the gate (Appendix C row `film`); one Arabic + English film of an
owner path saved to `dist/test/v81-film-ar-en.mp4` for the owner to check the Arabic line order (question Q5).

### M3. The planned camera (`v8.2`)

Read 4.3, Appendix E and **1.6** before starting (the reactive camera was improved after this plan's measurements: use
its new numbers as "before", its house tilt, and its shaft-view-with-cutaway as the default ride). Order matters: the
sight model first (the planner needs it), then the planner without rides, then rides, then the switch.

#### T3.1 The sight core

- **Goal:** 4.3.1.
- **Files:** new `src/v8/sight-core.js`; `src/v8/player/*camera*` part (`SIGHT`); `tools/build-v8.mjs` (script after
  the motion core); `tools/v7/scene-node.mjs` (`loadSightCore()`).
- **Do:** move from `SIGHT`: the grid (`CELL`, `add`), `intersects`, `clearLine` into `MFSight.create()`. `clearLine`
  gets the plate offsets as an argument instead of reading `plates[g.plate].position` and `group.visible`:
  `model.clearLine(A, L, offsetOf, ignore = .5)` where `offsetOf(plate)` returns `{ x, y, z }` or `null` (plate hidden:
  skip it). The engine's `SIGHT.clearLine(A, L)` becomes a wrapper passing
  `(k) => plates[k] && plates[k].visible !== false ? plates[k].position : null`. `SIGHT.build` keeps filling the model
  from instance bounds, floor triangles and device parts (unchanged). Add `model.fromLayout(layout, devices, heights)`
  for Node: walls as boxes 0.75 units around the segment (slanted walls: boxes every unit, as `solidsU` does), columns
  1.45 units half-size, racks / machines / pallets their rectangle, heights from the table in 4.3.1 converted to units,
  one slab box per upper floor (its zone rectangle, thickness 1 unit) **minus** elevator shaft openings (split the slab
  rectangle around each elevator's upper landing with a 12 x 12 unit hole).
- **Edge cases:** the triangle test uses three.js `Ray` in the page; the core needs its own small ray-triangle function
  (Moller-Trumbore, 15 lines) so it runs in Node; keep the result equal (test below).
- **Tests:** `tools/v8/sight-test.mjs` (Node): a synthetic floor with one wall and one rack: a line through the rack is
  blocked, over it is clear, through a slab is blocked, through the shaft hole is clear, a hidden plate is ignored.
  Browser: on `inj1`, 500 random eye points around the trolley at `t = 30`: the wrapper's answer equals the answer of
  the old code path kept under a test-only name for this one task (delete it afterwards).
- **Accept:** both tests pass; the gate's camera rows are unchanged from T1.6 (the reactive camera still runs on it).

#### T3.2 The camera plan

- **Goal:** `pose(t)` for a path without rides (Appendix E parts 1 to 6).
- **Files:** new `src/v8/camera-plan.js` (`window.MFCamPlan` / Node export).
- **Do:**
  ```
  MFCamPlan.PARAMS   { dt: .25, azN: 16, pols: [.82, .65, .45, .25], houseAz: -.55, housePol: .82,
                       near: 1.25, far: 1.45, distMax: 1.8, ahead: 20, aheadShare: .35, avg: .6,
                       frame: .70, wCut: 40, wTurn: 6, wHouseAz: .4, wPol: 1.2, minHold: 4,
                       blendRate: 10, blendMin: 2, blendMax: 6, slide: 2, rideA: 5, rideC: 2.6, lens: 28 }
  MFCamPlan.plan(input, params?) -> plan
      input = { items, nodes, total, intro, liftIndex, elevator,          // from MFMotion.timeline
                plates, center, gap,                                      // world maths (MFMotion.world)
                sight,                                                    // MFSight model
                aspect,                                                   // width / height of the picture
                stackMode: "auto" | "stacked",
                pins: [ { t0, t1, heading?, tilt?, hold? } ] }            // from steps[].camera
      plan  = { ok, shots: [ { t0, t1, az, pol, dist, kind: "hold" | "ride-a" | "ride-b" | "ride-c" | "fallback", forced } ],
                joins: [ { t, kind: "blend" | "over" | "cut", t0, t1, reason } ],
                stats: { samples, hidden, cuts, changes, p95, max, ms }, warnings: [ { t0, t1, msg } ] }
  MFCamPlan.pose(plan, input, t, out) -> out { x, y, z, dist, az, pol, fov, shot }      // world target, units, radians
  MFCamPlan.report(plan, input) -> { p95, max, changesPerMin, cuts, hiddenSamples, offFrameSamples }   // degrees per second
  MFCamPlan.toKeys(plan, input) -> keys                                  // follow keys for the director (format of the day)
  ```
  Algorithm: Appendix E. The module uses only `MFMotion` and `MFSight` and plain maths: no three.js, no DOM.
- **Edge cases:** a path of one standing step (no movement): one shot, house rig; a step shorter than `minHold`; no
  feasible rig at a sample (inside a closed room): take the rig with the shortest blocked stretch at tilt 76 degrees,
  mark the shot `forced`, add a warning; azimuth wrap-around in costs and blends (always the short way); pins that
  conflict with visibility (obey the pin, warn).
- **Tests:** `tools/v8/camplan-test.mjs` (Node, synthetic layouts built in the test: an open floor; a corridor between
  two long walls; an L-shaped corridor; a room with one door): open floor -> exactly 1 shot; straight corridor -> 1
  shot whose azimuth looks along the corridor (within 22.5 degrees); L corridor -> at most 2 shots and 1 blend, no cut;
  every sample of every case clear in the model (`stats.hidden === 0`); `pose` is continuous: sampled every 0.02 s the
  eye never moves more than `0.02 x (trolley speed + 8 units/s)` except at listed cuts; same input -> same plan
  (deep-equal on two runs); `report.p95 <= 12`.
- **Accept:** test passes; planning each `docs/examples` path takes under 150 ms in Node.

#### T3.3 The engine uses the plan

- **Files:** `src/v8/player/*camera*`, `*frame*`, `*export*`.
- **Do:**
  1. `const PLAN = { on: query.get("cam") !== "reactive", byFlow: new Map() };`
     `function planFor(fi)`: key `fi + ":" + (S.view === "3d" ? "stacked" : "auto") + ":" + camera.aspect.toFixed(3)`;
     builds the input from `D.flows[fi]`, `SIGHT`'s model, the plates and the step pins; stores the plan. Call it from
     `prefetchAisles` (so it runs behind the preparing screen and on a path change) and clear `PLAN.byFlow` in
     `v7Rebuild` and in `resize()` when the aspect changes by more than 0.01.
  2. In `setWant()`: when `S.cam === "guided"`, not flat, not the intro, `PLAN.on` and the plan is `ok`:
     `MFCamPlan.pose(plan, input, S.t, P)`; `aim(P.x, P.y, P.z, P.dist, P.az, P.pol)`; set `guidedPlanned = true`; return.
     Otherwise today's code runs with `guidedPlanned = false`.
  3. In `moveCam(dt)`: when `guidedPlanned`, skip the springs: put the eye and the target straight on the wanted pose
     (the same lines the `cine.cut` branch uses), zero the velocities, then continue with the existing `SIGHT.ensure`
     safety net and the `S.c` update.
  4. The intro: keep today's rise; from `INTRO - 0.6` to `INTRO + 1.4` blend (smootherstep) from the intro pose to
     `pose(t)` so the first shot is reached without a jump.
  5. `MF.x.setPlanned(on)`, `MF.x.plan(fi)` (returns the plan), `MF.perf.plan = { ms, shots, cuts }`.
- **Edge cases:** the user's stack slider (`S.stackUser != null`) or view `3d`: use the `stacked` plan; while the user
  drags the slider use the reactive camera; pause, seek, speed change: nothing special (pure function).
- **Tests:** T3.5's test.
- **Accept:** on `dist/test/v82a.html` with `docs/examples/sample.scene.json`: playing at 1x and at 3x and seeking give
  the same camera at the same story time (T3.5 check 4); `?cam=reactive` behaves as V8.1.

#### T3.4 Rides

- **Goal:** 4.3.2 (Appendix E part 7).
- **Files:** `src/v8/camera-plan.js`.
- **Do:** for each ride item: beats A, B, C as the table in 4.3.2, with the ride azimuth from `rideAz(input, elevator)`
  (24 directions; score = blocked share of beat B's samples x 2 + blocked share of beat C's samples + 0.015 x distance
  from the house azimuth). Each beat's samples are tested with the plates where they will be (`MFMotion.glideAt`).
  Beat B blocked at more than 5 % of samples for the best azimuth -> the fallback shot (tilt 86 degrees, cut in at the
  ride's start, cut out at arrival + 0.4 s). The shots before and after a ride are joined to A and C by normal blends.
- **Edge cases:** two rides in one path; a ride as the first moving step; `stacked` mode (no glide: the same beats with
  the floors fixed); the eye height limit of beat B must never put the eye below `target + 2 units`.
- **Tests:** `camplan-test.mjs` gains a two-floor synthetic case with one elevator: the plan has `ride-a`, `ride-b`,
  `ride-c` (or `fallback`) shots, at most 2 cuts in the ride window, `stats.hidden === 0`.
  Browser: `docs/examples/elevator.scene.json`: T3.5's test.
- **Accept:** tests pass; on the owner's four ride paths (when private scenes exist) the exact test reports 0 hidden
  samples, or the path is listed in the release notes with the reason and stays on the reactive camera
  (`plan.ok = false`).

#### T3.5 The camera test and report

- **Files:** new `tools/v8/camera-test.mjs`, `tools/v8/camera-report.mjs`.
- **Do:** `camera-test.mjs <player> [--tab t] [--path i] [--step 0.1] [--json out]`: per path, with the guided camera:
  1. seek-sample: for `t` from `INTRO + 0.5` to the end in `--step` seconds: `MF.pause(); MF.seek(t); MF.frame(0, t);`
     then the exact ray test of `tools/test-camera-v5.mjs` (floors, slabs, replica meshes, device meshes; ignore hits
     within 4 units of the trolley; ignore transparent materials) and the frame test (projected trolley inside the
     middle 70 %);
  2. play at 1x and at 3x to the end and read `MF.sight.stats.rescued` (must not grow);
  3. `MF.x.plan(i).stats` and `joins`;
  4. pose equality: at 20 evenly spaced times compare `MF.camera.eye` after "play at 3x until t" with "seek to t"
     (pause on reaching t).
  Prints per path `PASS|FAIL <tab> <id>: hidden 0/1234, off-frame 0, rescues 0, shots 5, cuts 0, p95 7.4 deg/s`.
  `camera-report.mjs <scene> [--path id]` does the Node-side estimate (plan + report) with no browser.
- **Accept:** on the test player with the example scenes: all `PASS`. On the owner's 10 paths: the table of 4.3.4 is met,
  or each miss is listed (path, time, reason) in `docs/OPEN_ISSUES.md` and in the release note.
- **Docs:** `docs/ENGINE.md` tests table (the new test replaces `test-camera-v5.mjs` for the guided camera; the old one
  stays for the chase camera).

#### T3.6 Step camera fields

- **Files:** `tools/v7/scene-core.js` (convert + validate), `tools/v7/scene-schema.mjs`, `tools/v7/studio-ui.js`
  (`renderSteps`: three fields), `tools/v7/studio-core.js` (`STEP_KEYS0`: add `camAz`, `camPol`, `camHold`).
- **Data:** `paths[].steps[].camera.heading` (deg, 0 to 360, direction the camera looks), `.tilt` (deg, 20 to 89),
  `.hold` (true / false). Internal step fields: `camAz = -heading * PI / 180`, `camPol = (90 - tilt) * PI / 180`,
  `camHold`. Validator errors: heading not a number; tilt outside 20 to 89; hold not a boolean.
- **UI text:** in the step editor after `Camera (m)`: `Heading (deg, empty = automatic)`, `Tilt (deg, empty = automatic)`,
  checkbox `Hold this view through the step`.
- **Tests:** validator test: 3 planted faults; `camplan-test`: a pinned heading is obeyed (`shots` during that step
  have that azimuth) and a pin into a wall produces a warning with the step's time range.
- **Docs:** `docs/SCENE_MANUAL.md` (step table + generated), `docs/CONTROL_GUIDES/CAMERA.md` (rewrite "What the owner
  sees": shots, holds, rides, pins).

#### T3.7 Director curve without overshoot

- **Files:** `tools/v7/studio-director.js` (`evalDirector`).
- **Do:** replace the `cr(...)` position blend by a cubic Hermite blend per axis with tangents
  `m1 = (p2 - p0) / 2`, `m2 = (p3 - p1) / 2`, each set to 0 when its neighbours lie on opposite sides
  (`(p1 - p0) * (p2 - p1) <= 0` -> `m1 = 0`; same for `m2`) and limited to `3 * |p2 - p1|` in size. Everything else in
  `evalDirector` is unchanged.
- **Tests:** `tools/v8/director-test.mjs` (browser, example scene): three fixed keys A, B, A: between the second and
  third key the target never leaves the box spanned by A and B (sampled every 0.05 s).
- **Accept:** test passes; `tools/v7/smoke-76.mjs` passes.

#### T3.8 Release `v8.2`

As "A release". Extra: before / after contact sheets of all 10 paths (reactive vs planned; until `MF sheet` exists use
`mf shots --path id --at t` every 5 s into `dist/test/v82-sheets/`); `docs/CHANGELOG.md` states the measured table;
`docs/DECISIONS.md` D3; `docs/LESSONS.md` L-PL-21 (a camera chosen per frame cannot be calm or repeatable; plan it as a
function of story time and test it by seeking); `docs/OPEN_ISSUES.md` issue 1 closed or restated.

### M4. Operations, the full CLI, history (`v8.3`)

Read section 3 before starting. The Studio is not changed in this milestone.

#### T4.1 `scene-ops.js`: the frame

- **Files:** new `tools/v7/scene-ops.js` (plain script, the page and Node load the same file: `window.MFOps` / export;
  it needs `MFScene` and `MFMotion` passed in: `MFOps.create({ SC, MOTION })`), `tools/v7/scene-node.mjs`
  (`loadOps()`), `tools/v7/mf-ops.mjs` (becomes a thin re-export so existing imports keep working).
- **Do:**
  ```
  ops.OPS                                  { "<name>": { summary, studio, page: false, read: false, params: { <p>: { type, unit, required, default, values, doc } }, run(ctx, p) } }
  ops.run(scene, layout, name, params)  -> { ok, op, result, changed, numbers, warnings, errors }     // never throws for user mistakes; scene is changed in place only when ok
  ops.batch(scene, layout, list)        -> { ok, results, failedAt }
  ops.parsePlace(scene, layout, value, ctx) -> { x, y, floor }
  ops.parseTime(tl, value)              -> seconds          // tl = ops.timeline(scene, layout, pathId)
  ops.timeline(scene, layout, pathId)   -> { intro, total, steps: [ { id, t0, arrive, leave, metres, seconds } ] }
  ops.OpError(code, where, msg, hint)
  ```
  Parameter types: `id`, `text`, `number`, `bool`, `enum`, `place`, `time`, `point` (`[x, y]`), `points`, `list`
  (comma list), `color`, `json`. `ops.run` checks required / type / enum / range from the table before calling `run`
  (errors `E_USAGE` with the parameter's `doc`), runs on a deep copy, validates before and after (new errors =
  after minus before, compared by `where + msg`), computes `changed` (a recursive compare of the two scenes giving
  entity paths as in 3.2) and `numbers`, and copies the result back into `scene` only when there is no new error.
  Move into `scene-ops.js` (unchanged logic) from `mf-ops.mjs`: `straightenPoints`, `straighten`, `route`, `fixLinks`,
  `cameraKey`, `addKey`, `addCaption`, `diff`; register them as `route.straighten`, `route.auto`, `route.fix-links`,
  `key.add`, `caption.add`, `scene.diff`; plus `scene.info`, `scene.set`, `scene.validate`, `scene.numbers`.
- **Edge cases:** id creation: `slug(name)` then `-2`, `-3` … against every id of that kind; director ids `key-<n>`,
  `cap-<n>`, takes `take-<n>` with the smallest free `n`.
- **Tests:** new `tools/v8/ops-test.mjs` (Node, on copies of `docs/examples/*.scene.json`): parameter checking (a
  missing required parameter, a wrong enum value, a bad Place each give `ok: false`, `E_USAGE`, scene unchanged);
  the Time grammar (every form of 3.2 against `ops.timeline`); the Place grammar (every form); the moved operations
  give the same result as before (compare with a saved copy of the old functions' output for three cases).
- **Accept:** test passes; every existing CLI verb prints exactly what it printed before (run the commands of
  `docs/RECIPES.md` and compare).

#### T4.2 Transactions, history, undo, JSON output, exit codes

- **Files:** `tools/mf.mjs` (rewrite the argument parsing and the write path; keep the browser verbs), new
  `tools/v8/history.mjs`.
- **Do:**
  ```
  history.dirFor(sceneFile)                -> "<dir>/.mf-history/<basename>"
  history.record(sceneFile, beforeText, afterText, meta)   // meta = { ops, note, changed }
  history.undo(sceneFile, steps = 1)  -> { restored: n }     history.redo(sceneFile, steps = 1)     history.log(sceneFile, last = 20)
  transact(sceneFile, fn, { dryRun, force, note })           // fn(scene, layout) -> result object(s); implements 3.8 steps 1 to 8
  ```
  Argument parsing: `MF <word> [word2] <scene.json> --k v …`; resolve the operation as `word.word2` if it exists in
  `OPS`, else `word` as a top-level verb; `--json` prints `JSON.stringify(result)` only; exit codes of 3.2.
  Parameter names with dots (`--ar.title`) and `--no-x` (= `x: false`) are supported. Values are converted by the
  parameter's declared type (`number`, `bool`, `list`, `point` "x,y", `points` "x,y;x,y;…", `json`).
  Replace `writeIfOwnClean`, `validateOrDie` + `writeScene` in the edit verbs by `transact`. `undo`, `redo`, `log`
  verbs. Help: `MF help` lists families; `MF help <family>` lists that family's operations with parameters; generated
  from `OPS`.
- **Edge cases:** the scene file is read-only or missing (exit 3); the history folder cannot be created (warn, still
  write the scene, exit 0, message `history not recorded: <reason>`); two processes (the sha check, `E_CONFLICT`, exit 1);
  `--dry-run` with `--json`; undo with no history (`nothing to undo`, exit 1); a hand-edited file between two commands
  (the next command records the hand-edited content as its "before": undo returns to it).
- **Tests:** `tools/v8/cli-test.mjs` (Node, runs `tools/mf.mjs` as a child process on a temporary copy of
  `docs/examples/sample.scene.json` in the system temp folder): an edit writes the file and a history entry; `undo`
  restores the exact bytes; `redo` re-applies; `--dry-run` leaves the bytes unchanged and prints a diff; a failing
  operation leaves the bytes unchanged and exits 1; `--json` output parses and has the keys of 3.2; a simulated
  conflict (the test changes the file from inside a test hook env `MF_TEST_TOUCH=1` between read and write) gives
  `E_CONFLICT`.
- **Accept:** test passes.
- **Docs:** `docs/CLI.md` intro (grammar, global flags, exit codes, history), `docs/DECISIONS.md` (D5, D6).

#### T4.3 Operations: stops, devices, objects

- **Files:** `tools/v7/scene-ops.js`; move `PROP_TYPES` defaults (name, w, d, h, color per type) from
  `tools/v7/studio-edit.js` into `scene-core.js` as `MFScene.OBJECT_DEFAULTS` (the Studio reads it from there).
- **Do:** the "Stops", "Devices", "Objects" tables of 3.3. Details:
  - `stop.move` with `relink: auto`: for every path and step that ends at the stop, and the step after it: if the
    route is `points`, set the moved end to the new point; if the leg that ends there is no longer horizontal /
    vertical, re-route that step (`route.auto`) then `route.straighten`; `auto` and `stay` routes need nothing. Steps
    with an elevator ride at the stop: refuse the move (`E_GEOMETRY`: landing stops are fixed by the elevator).
  - `device.place`: build the step's route points (resolve `auto` through the router); total length `L`; the target
    distance along it: `middle` = the midpoint of the **longest leg**; `before-stop` = `L - gap`; `after-start` = `gap`;
    a number = that distance; a Place = the nearest point on the route (error if farther than 1 m). Move the point at
    least 1.2 m away from a corner along its leg (error `E_GEOMETRY` when the leg is shorter than 2.4 m). Lane from the
    leg's direction. Scanner stand: 0.6 m to the left of the driving direction, then right, then 0.9, 1.2, 1.5 m each
    side; the first position whose footprint is free (`free` test against the solids) wins; none -> `E_GEOMETRY` with
    the nearest free distance. Gate: needs 2.2 m free on both sides (posts); else try moving along the leg in 0.5 m
    steps up to 3 m each way.
- **Tests:** `ops-test.mjs`: one case per operation on the examples (result fields present, scene validates), plus:
  `stop.move` keeps a 3-point L after moving a stop 3 m (the recipe 2 case, same numbers as `docs/examples/move-stop.scene.json`);
  `device.place --where middle` puts `at` within 6 mm of a leg and the scene validates; `stop.remove` of a used stop is
  refused with the list of users; `stop.rename` updates a `serves` and a step.
- **Accept:** test passes.

#### T4.4 Operations: paths, steps, routes

- **Do:** the "Paths and steps" table of 3.3. Details:
  - `path.add`: floor change between consecutive stops -> find an elevator whose lower landing is on the first floor
    and upper landing on the second (`layout.elevators`: `lowPlate`, `highPlate` or the floor of `low` / `high` through
    `floorOfU`); none or downward -> `E_GEOMETRY` ("rides go upward only; no elevator from 2F to 1F"). Landing stops:
    reuse a stop within 0.02 m of the landing, else create `elev-<label>-<floor>` named `<label> (<floor>)`.
  - `step.move` / `step.remove` / `step.set stop`: after the change every `points` route whose first point is no longer
    the previous end, or last point no longer its stop, is re-routed (same rule as `route.fix-links`); a ride that no
    longer starts at its lower landing makes the operation fail (`E_GEOMETRY`).
  - `route.corner`: `add` inserts `at` after corner `index` (0 = after the start); `move` sets corner `index`; `remove`
    deletes it; with `studio.ortho` true the two legs around a moved corner are kept square by moving the neighbour
    corners on one axis (the Studio's `dragVertex` rule; copy it from `tools/v7/studio-edit.js`).
  - `route.l`: `[start, [stop.x, start.y], stop]` or the other corner; `first: auto` picks the one with fewer new
    clashes, then the shorter clearance warning list.
- **Tests:** `ops-test.mjs`: build the worked example of `docs/SCENE_MANUAL.md` section 12 with three commands
  (`stop.add`, `path.add` with `via`, `step.set`) and compare the trip seconds with the manual's 51.4 s (within 0.5 s:
  the router's points may differ slightly; record the real number in the manual); `path.add` across floors on
  `docs/examples/elevator.scene.json` inserts the ride; `step.move` re-joins; `path.reverse` refuses a ride.
- **Accept:** test passes.

#### T4.5 Operations: layout

- **Do:** the "Layout" table of 3.3. Details:
  - `layout.list`: after applying the scene's edits and additions to a copy of the layout; `near` + `radius` or `box`
    filter by rectangle overlap; each row `{ id, kind, floor, rect: [x0, y0, x1, y1] (m), height (m), edited, add }`.
  - `layout.door`: candidate walls = straight walls of the floor within 2 m of `at` (distance from the point to the
    segment); the nearest wins; `range = [c - width / 2, c + width / 2]` along the wall, clipped to the wall's ends
    minus 0.3 m; refuse when the clipped opening is under 2.2 m (`E_GEOMETRY`, with the wall's free length) or when a
    column's rectangle overlaps the opening widened by 0.2 m. A wall that already has a `door` edit gets a second edit
    only when the ranges do not overlap. Result `clearWidth` = opening minus 2 x 0.225 m (wall end thickness).
  - `layout.door-on-line`: walls crossed = `ray` between the two points; one `layout.door` per wall at the crossing.
  - `layout.add` (format 1 until M6): appends; the result includes the numeric ids (`machine:101000`) so an agent can
    target them; `layout.delete` of an addition in format 1 writes a `delete` edit (the slot stays), as the Studio does.
  - `layout.move` / `turn` of an addition changes the entry (`x`, `y`, `turn`; walls `a`, `b`), exactly as
    `foldAdds` in `tools/v7/studio-core.js` does (move that function's maths into `scene-ops.js` and call it from both).
- **Tests:** `ops-test.mjs`: `layout.door --at` on `docs/examples/door.scene.json`'s wall reproduces the example's
  range within 0.05 m; a door on a column is refused; `layout.door-on-line` across two walls adds two edits and a
  straight `route.points` then validates; `layout.add` on a route is refused, with `--force` accepted and the validator
  then reports the clash; `layout.grid` 4 x 4 creates 16 entries with the stated ids.
- **Accept:** test passes.

#### T4.6 Operations: director, takes, viewpoints, studio

- **Do:** the "Director" table of 3.3 (without `key.from-plan`, which needs M3's plan in Node: include it when M3 is
  released; it calls `MFCamPlan.plan` + `toKeys` with the layout sight model). `key.list` converts stored keys to plain
  words with the inverse of `cameraKey` (heading = `-az`, tilt = `90 - pol`, distance = `dist x 0.3`, lens from `fov`).
  `caption.set --ar.title` turns a plain string title into `{ en: <old>, ar: <new> }`.
  `caption.from-steps`: for each step with a title: `from = step:<id>:start`, `to = min(from + seconds, step:<id>:leave)`,
  title = the step's title, text = its text; skips steps shorter than 1.5 s; never overlaps an existing caption in the
  same place (shortens or skips, and says so in `warnings`).
- **Tests:** `ops-test.mjs`: add, set, list, remove round trips for keys, captions, takes, viewpoints; the scene of
  `docs/examples/director.scene.json` can be rebuilt from `sample.scene.json` with commands and equals it except ids.
- **Accept:** test passes.

#### T4.7 Batch

- **Files:** `tools/mf.mjs` (`apply` verb).
- **Do:** 3.8 "Batch". `MF apply <scene> <ops.json> [--dry-run]`; also `MF apply <scene> -` reads the JSON from stdin.
- **Tests:** `cli-test.mjs`: a 4-operation batch writes once and makes one history entry; a failing third operation
  writes nothing and reports `failedAt: 2`.

#### T4.8 Entity diff

- **Files:** `tools/v7/scene-ops.js` (`scene.diff`), `tools/mf.mjs` (`diff` verb output).
- **Do:** 3.8 "Diff". Compare by id for stops, devices, objects, paths, steps (within a path), layout additions, keys,
  captions, takes; layout edits by target + content; routes: point count and length; print compass words for moves
  (`north` = smaller y). Keep the `#` number lines (they are quoted in `docs/RECIPES.md`).
- **Tests:** `ops-test.mjs`: the diff of `sample` vs `move-stop` still contains the two lines quoted in recipe 2.

#### T4.9 Docs from the operation table

- **Files:** `tools/v7/docs-check.mjs`, `tools/v7/mf-commands.mjs`, `docs/CLI.md`, `docs/PARITY.md`, `docs/RECIPES.md`,
  `docs/CONTROL_GUIDES/*.md`, `.agents/skills/material-flow-scene-editing/SKILL.md`, `material-flow-directing/SKILL.md`,
  `material-flow-scene-engine/SKILL.md`.
- **Do:** `COMMANDS` keeps the top-level verbs; the generated `cli` block gains one section per family from `OPS`
  (usage line, parameter table: name, type, unit, required, default, meaning; one example). Docs-check rule 4 accepts
  `mf <family>` words. New generated block `parity` in `docs/PARITY.md` from each operation's `studio` field. Rewrite
  each recipe to lead with the command and keep the JSON as "what it writes". Each control guide's "An agent" section
  lists its commands. The skills say: use commands; hand-edit only what no command covers; always finish with the
  check command.
- **Accept:** `node tools/mf.mjs docs-gen` then `docs-check` OK; a fresh agent proof (lead's Phase E style, requests 1
  to 6 of the handoff) is done with commands only: record the result in `docs/STATUS.md`.

#### T4.10 Release `v8.3`

As "A release" (the player file changes only by version text; the value is in the tools).

### M5. Inspection, self-check, the page API (`v8.4`)

#### T5.1 Inspection operations

- **Files:** `tools/v7/scene-ops.js`, `tools/mf.mjs` (verbs `where`, `timeline`, `clearance`, `nearest`, `ray`, `free`,
  `fits`, `camera`, `info`, `list`; `congestion` moves to Node).
- **Do:** the "Inspection" table of 3.3 except `visible`. Details:
  - `where`: `MFMotion.pose`; `phase`: `ride` when `lift != null`; `scan` when inside a scan window of
    `MFMotion.withScanStops` (expose the windows on the schedule as `sched.scans = [{ t0, t1 }]`); `turn` / `move` from
    the pose's `k`; `hold` otherwise. `floor` from the item's stop (during a ride: the lower floor until 95 %).
  - `clearance`: the validator's sweep, but collecting the smallest gap per leg and object (factor the sweep out of
    `validate` into `MFScene.sweep(layout, devices, objects, path, plate, cb)` and use it in both).
  - `ray`: rectangle-segment intersections against `solidsU`; sorted by distance; walls report `along` (m).
  - `free`: rectangle overlap against solids + the swept routes of all paths (a route counts as a 1.3 m wide band).
  - `congestion`: positions from `MFMotion.pose` for each trolley every 0.05 s; **same floor only**; `--all`: every pair
    of paths started together.
  - `camera`: `guided` -> `MFCamPlan` with the layout sight model, labelled `"estimate": true`; `director` -> the key
    curve (move `evalDirector`'s maths into `scene-ops.js` as `directorPose`, the Studio calls it).
- **Tests:** `ops-test.mjs`: `where` at `step:s3:arrive` equals that stop's point; `where --every 5` is monotone in
  `metresSoFar`; `clearance` on the door example reports the door walls as the tightest objects; `ray` across the
  door example's wall names it; `free` finds a free spot next to an occupied one; `congestion` on the trolleys example
  matches the page's value for the same scene within 0.05 m (browser comparison once, in `numbers-test.mjs`).
- **Accept:** tests pass; each verb answers in under 1 s for the owner's scenes.
- **Docs:** CLI (generated), `docs/TROUBLESHOOTING.md` (use `ray` and `clearance` to find what blocks a route),
  remove `tools/v7/aisle-scan.mjs` from the docs (keep the file, marked "replaced by the clearance command").

#### T5.2 The check command

- **Files:** `tools/v7/scene-ops.js` (`scene.check`), `tools/mf.mjs` (`check`).
- **Do:** 3.9. Output:
  ```
  CHECK docs/examples/sample.scene.json
   1 valid        PASS
   2 joined       PASS
   3 clear        WARN  sample-1/s3 passes 0.12 m from rack:12 at (74.1, 150.0)
   ...
   9 numbers      sample-1 85.9 m, 37.9 s, 759 trips per 8 h shift (was 85.9 m, 37.9 s)
  RESULT: PASS with 1 warning
  ```
  `--play` / `--film` add row 10 through the page (plays each path with `MF.x.offline` stepping at 10 frames per story
  second: fast and deterministic; counts page errors and rescues).
- **Tests:** `cli-test.mjs`: clean example -> exit 0; an example with a planted clash -> exit 1 and row 3 FAIL.
- **Docs:** every recipe ends with the check; `AGENTS.md` skill table text for scene editing; `docs/START_HERE.md`
  "The commands that matter".

#### T5.3 `MF.agent` and the JSON-RPC bridge

- **Files:** new `tools/v7/agent-api.js` (page only; added to the Studio script group after `studio-ui.js`),
  `tools/build-v8.mjs` (`scene-ops.js` goes into the page, before the Studio group).
- **Do:** 3.5. `MF.agent.call(name, params)`: scene operations run `ops.run` on `MFX.toScene()`; on success
  `MFX.replaceScene(scene, name)` (one undo step) unless only `layoutEdits` / `layoutAdds` changed (then
  `MFX.reloadLayout(scene, name)` and the promise resolves after the reload is requested, with
  `result.reloading = true`). Page operations as the table in 3.5. `player.wait`: polls on animation frames.
  `view.set`: converts plain words through `cameraKey`'s maths and calls `MFX.flyTo` (or sets the pose directly when
  `fly` is 0). `view.picture`: the existing photo compositing into a data URL. `film.record`: `MFX.recordFilm`, keeps
  the blob in a table keyed by `handle`. The bridge: `addEventListener("message", …)` only when
  `new URLSearchParams(location.search).get("agent") === "1"`; answers with `event.source.postMessage(reply, "*")`.
  Switch the CLI's browser verbs (`shots`, `play`, `take`, `congestion --picture`) from `MFX` / `MF.x` calls to
  `MF.agent.call`.
- **Edge cases:** calls before `MF.prepared` wait for it; unknown operation -> `E_USAGE`; an exception inside an
  operation -> `ok: false`, `E_INTERNAL`, the message, and the scene is not replaced.
- **Tests:** new `tools/v8/agent-test.mjs` (browser, example scene): `describe()` lists every operation of `OPS` plus
  the page ones; `call("stop.move", …)` moves the stop on screen (`MF.D.nodes`) and `Ctrl+Z` (`MFX.undo()`) restores it;
  `batch` with a failing second call changes nothing; `player.set` + `player.wait` reach a time; `view.set` then
  `view.get` return the same plain words within 0.5 (m, degrees); `visible` at a moment returns `trolleyOnScreen: true`;
  the bridge answers a posted request when `?agent=1` and stays silent without it.
- **Accept:** test passes; `mf shots`, `mf play`, `mf take` outputs unchanged.
- **Docs:** new `docs/AGENT_API.md` (generated operation table + the page-only table + the bridge), linked from
  `docs/START_HERE.md` and `docs/CLI.md`.

#### T5.4 Pictures: options, contact sheet, review, overlay

- **Files:** `tools/mf.mjs`, `tools/v7/agent-api.js` (`view.picture` options `grid`, `mark`, `ui`).
- **Do:** 3.7 "Pictures" and the verbs `sheet`, `review`, `overlay` of 3.4. The grid and marks are drawn on the 2D
  overlay canvas by projecting floor points (`MF.W` + `MF.proj`): grid lines every `grid` metres across the active
  floor's extent, labels every second line (`x 60`, `y 150`), pins as numbered circles. The contact sheet is composed in
  the page on one canvas (frames captured by stepping story time with `MF.x.offline`), returned as one PNG.
  `review`: `overview.png`, one sheet per path, `numbers.txt`, `check.txt`, `index.md` listing them.
  `overlay` wraps `tools/v7/compare-shots.mjs` (same arguments by name).
- **Tests:** `agent-test.mjs`: a picture with `grid: 10` differs from one without; a sheet of the example path has the
  expected pixel size (4 columns x 480, rows x 290).
- **Docs:** CLI, recipes ("look at your work": the sheet first, single shots for detail).

#### T5.5 Validator gaps

- **Files:** `tools/v7/scene-core.js`, `tools/v7/studio-core.js` (use the moved code), `tools/v7/validator-test.mjs`.
- **Do:** 4.8 row "Validator gaps". Signatures: `MFScene.objectSolidsU(objects, plate) -> [{ r, what, poly? }]`
  (solid types: crate, pallet, rack, column, wall, fence, cone, sign); `MFScene.polyGap(a, b)` (two convex quads, units,
  < 0 = overlap); `footprintsU(d)` returns `{ r, poly }` entries for PCs with `yawDeg` (r = bounding box, poly = the
  turned rectangle); the sweep uses `poly` when present. Issue objects become `{ code, where, msg, hint }` (Appendix B);
  `W_UNKNOWN_FIELD` from `FIELD_PATHS` (pass the schema's path set into `validate` through `opts.fields`; the page
  embeds the list at build time as `window.MF_FIELDS`).
- **Edge cases:** existing scenes with objects standing on a route start failing: by design, but the release note must
  list which owner scenes are affected (run the validator on the four scenes before and after).
- **Tests:** validator test: planted object on a route (error), PC at 30 degrees next to a route (clear at the true
  footprint, would have failed with the old square), a misspelled field (one warning naming the nearest field).
- **Docs:** `docs/SCENE_MANUAL.md` section 10, `docs/TROUBLESHOOTING.md`, `docs/OPEN_ISSUES.md` (close 12, 13).

#### T5.6 Router: tight second pass

- **Files:** `tools/v7/scene-core.js` (`makeRouter`).
- **Do:** 4.8 row "Auto routes". `route(a, b, plate)`: first today's search. Detour test: route length (units) >
  `1.6 * (|dx| + |dy|) + 67` (20 m) or no route -> search again with `STRAIGHT_T = TR.halfW + 0.5`,
  `TURN_T = Math.hypot(TR.halfW, TR.halfL) + 0.1`; accept the tight route when it is at least 30 % shorter (or the
  first search failed) **and** `MFScene.sweep` over it finds no gap under `CLEAR_ERROR`; else keep the first result.
- **Edge cases:** identity: the V6 scenes use `points` routes (no router), so they cannot change; for the owner's
  current scenes list every `auto` step whose length changes (script: numbers before / after) in the release note.
- **Tests:** `ops-test.mjs`: `docs/examples/door.scene.json` with its door step set to `auto` routes through the door
  (length at most 1.2 x the right-angle distance) and validates; a scene with no door still detours as before.
- **Docs:** `docs/TROUBLESHOOTING.md` (the detour row), `docs/OPEN_ISSUES.md` (close 4), `docs/LESSONS.md` L-PL-11 note.

#### T5.7 Release `v8.4`

As "A release". Extra: `tools/v8/agent-test.mjs` and `ops-test.mjs` in the gate.

### M6. Layout fidelity and format 2 (`v8.5`)

#### T6.1 Format version 2

- **Goal:** 4.9.
- **Files:** `tools/v7/scene-core.js`, `tools/v7/scene-schema.mjs`, `tools/v7/preload-scene.js`, `tools/v7/scene-ui.js`,
  `tools/v7/studio-core.js` (`fromScene` / `toScene`), `tools/v7/studio-director.js`, `tools/v7/scene-ops.js`,
  `tools/mf.mjs` (`migrate` verb; `readScene` upgrades in memory), `tools/v7/make-examples.mjs`, `docs/examples/*`.
- **Do:**
  ```
  MFScene.VERSION = 2;  MFScene.READS = [1, 2]
  MFScene.upgrade(scene, layout)   -> scene (version 2; input not changed)       layout gives center and plates
  MFScene.downgrade(scene, layout) -> { scene (version 1), lost: [text] }
  MFScene.keyToEngine(key, layout, worldOf) -> { x, y, z, dist, az, pol, fov, follow, ox, oy, oz }
  MFScene.keyFromEngine(k, layout)  -> version-2 key
  ```
  Conversions: `distance = dist * 0.3`; `heading = norm360(-az * 180 / PI)`; `tilt = 90 - pol * 180 / PI`;
  `lens = 12 / tan(fov * PI / 360)`; fixed key `look = [(x + CX) * 0.3, (z + CY) * 0.3]`, `floor = floorOfU(...)`,
  `height = y * 0.3`; follow key `offset = [ox * 0.3, oz * 0.3, oy * 0.3]`. In the player a fixed version-2 key is
  placed every frame through `MFMotion.world(plates, center, gap, look.x / 0.3, look.y / 0.3, S.stack, height / 0.3)`
  (so it follows its floor). `layoutAdds[].slot`: upgrade sets `slot = index`; new entries get `max(slot) + 1`;
  `applyLayoutAdds` uses `ADD_BASE + 1000 * slot`. Targets `add:<id>` / `add:<id>:<cell>` are resolved to numeric
  targets inside `applyLayoutEdits` (error `unknown layout addition "<id>"`). `layout.delete` of an addition now
  removes the entry and every edit that targets it. Validator: `version` 1 or 2 accepted (1 is upgraded first);
  `slot` a whole number 0 to 899, unique; version-2 key fields checked (distance 2 to 1500 m, tilt 1 to 89.5, lens 8
  to 300, heading a number, `look` `"trolley"` or a point inside `floor`). The Studio keeps engine-unit keys in its
  working copy (`doc.director`) and converts at `fromScene` / `toScene`, so the director code is unchanged.
  `MF migrate <scene> [--to 2|1]` through `transact` (a history entry, so `MF undo` reverses it).
- **Edge cases:** a version-1 fixed key that was saved while floors were stacked on an upper floor (its world point is
  not on the floor's plan position): upgrade computes the floor from the stack-0 position and adds a warning
  `key <id>: saved on a moving floor; check its target`; scenes with `"version": 3`: refuse with the text of 4.9;
  `viewpoints` with `null` slots keep their position in the list (upgrade writes `{ "id": "view-3", "empty": true }`).
- **Tests:** `tools/v8/format-test.mjs` (Node): every example and (when present) every owner scene: `upgrade` then
  `downgrade` gives back the same version-1 scene except number rounding under 1e-6 (`lost` empty); reordering two
  additions in a version-2 scene leaves every numeric id unchanged; an `add:<id>` target validates; a planted version-3
  scene is refused. Browser: identity row (version-1 V6 scenes still play); `tools/v7/layout-adds-test.mjs` updated
  for slots; `tools/v7/smoke-76.mjs`.
- **Accept:** tests pass; all `docs/examples` are version 2 on disk; the four owner scenes are migrated by the lead
  (copies of the version-1 files kept in `private/v7/scenes-v1/`).
- **Docs:** `docs/SCENE_MANUAL.md` (sections 3, 7, 8, generated fields; a "Version 1 files" paragraph),
  `docs/CONTROL_GUIDES/CAMERA.md` and `DIRECTOR.md` (keys in plain words), `docs/DECISIONS.md` (D7),
  `docs/OPEN_ISSUES.md` (close 7), `docs/LESSONS.md` (L-PL-22: an id made from a list position is not an id).
- **Do not change:** `private/v7/scenes-v6/` (stays version 1: the identity proof).

#### T6.2 Painted shadows for added items

- **Files:** `tools/v7/preload-scene.js`.
- **Do:** 4.6 row 1. In `MFV7_LOAD`: after the layout is applied, collect `out.lightAdds[plate] = [{ r: [x0, y0, x1, y1], h }]`
  (units) from replica objects that carry `_add` (walls: their 1.5-unit-wide rectangle, h 12; machines: `hm` or 16.7
  for models; racks 25; pallets 4.3). In `MF7_CLEAN_LIGHT`: do not return early when `lightAdds[plate]` has entries;
  after the erase / compose step, for each entry draw on a second canvas a filled rectangle of the footprint grown by
  `ADD_SHADOW.grow + ADD_SHADOW.perH * h` and shifted by `h * ADD_SHADOW.dir`, blur it
  (`ctx.filter = "blur(" + px + "px)"`), then `globalCompositeOperation = "multiply"` it onto the light canvas with
  `globalAlpha = ADD_SHADOW.strength`. `const ADD_SHADOW = { dir: [0.55, -0.71], grow: 1, perH: 0.12, blur: 3, strength: 0.35 }`
  (units; `blur` in units converted to pixels with the canvas scale).
- **Edge cases:** an addition later deleted by an edit (no object -> no shadow); storage without pallets (markings:
  no shadow); plates with a composed light (INJ 2 2F): paint after composing.
- **Tests:** browser, a test player with `docs/examples` plus one added machine: the mean brightness of the light
  texture under the machine's shifted footprint is 15 to 45 % lower than in the same player without the addition
  (read both through `MF.debugFloor()` texture info + a canvas read of the texture image); no page error.
- **Accept:** test passes; one before / after picture pair of an owner tab in `dist/test/v85-shadows/` for the owner.
- **Docs:** `docs/CONTROL_GUIDES/LAYOUT.md`, `docs/SCENE_MANUAL.md` ("Added items have no pre-baked shadow" sentence
  replaced), `docs/TROUBLESHOOTING.md`.

#### T6.3 Floor-light re-bake with Blender

- **Goal:** 4.10.1.
- **Files:** new `tools/v8/apps.mjs`, `tools/v8/export-layout.mjs`, `tools/blender/bake_floor_v8.py`,
  `tools/v8/light-compare.mjs`; `tools/build-v8.mjs` (embed `MF8_LIGHT`, option `--no-light`),
  `tools/v7/preload-scene.js` (use the bake when the hash matches), `tools/mf.mjs` (`light` verb).
- **Do:** exactly the four steps of 4.10.1. `bake_floor_v8.py`: copy `tools/blender/bake_floor.py`, replace the fixed
  `PLATES` table by the JSON's `plates` (name, box), read the new JSON keys, add `pallets` (box, 1.3 m) and block
  machines (`hm`), parse `--px` and `--samples`, do the tone step with numpy on the rendered image's pixels
  (`bpy.data.images.load(path)`; `pixels` as a float array; grey = the red channel), save, write `bake.json`. Keep the
  light set-up lines byte for byte. `MF light <scene>`: runs export + Blender, prints one line per plate
  (`light 1F: 2048 x 1024, 74 s`) and `next: node tools/mf.mjs bake`. Preload: `var L8 = (window.MF8_LIGHT || {})[id];`
  when `L8 && L8.layoutHash === hashOf([scene.layoutAdds || [], scene.layoutEdits || []])` set `out.lightBaked = L8.plates`;
  in the floor-light loader patch point (`MF7_CLEAN_LIGHT(tex, key, fl.box)`), when `M.lightBaked && M.lightBaked[key]`:
  load that picture into a texture and return it (no erase, no compose, no painted shadows).
- **Edge cases:** Blender missing (clear message, exit 3); a floor with no solids; a tab whose scene has no layout
  change (bake still valid: hash of two empty lists); the bake is older than the scene (hash differs -> not embedded,
  the build prints `light for <tab> is out of date: run MF light`); upper floors: 3 rack levels as the old script
  did for its upper floor (use `plates[key].lift > 0`); the 4096-pixel canvas limit elsewhere does not apply (the bake
  is a ready picture).
- **Tests:** `tools/v8/light-compare.mjs <player> <tab>` (browser + files): bakes of the **unedited** layout vs the
  light inside the player: mean absolute difference under 6 / 255 per plate (first run decides the tone constants; record
  the measured numbers in `docs/DECISIONS.md`). A build with a matching bake: `MF7.lightBaked` is set and
  `MF7.lightCleaned` stays 0; with a non-matching scene (one extra edit in the browser): the fallback runs.
- **Accept:** tests pass; all four owner tabs baked; the release note gives the bake time per tab on this PC.
- **Docs:** `docs/CONTROL_GUIDES/LAYOUT.md` (two levels of light), `docs/RECIPES.md` 13 (add: `MF light` then bake
  before showing the owner), `docs/ENGINE.md` (tools that need Blender), `docs/DECISIONS.md` (D9), `docs/CLI.md`.
- **Do not change:** `tools/blender/bake_floor.py`, `tools/make-light.py` (history of the V4 bake).

#### T6.4 Layout check and reference top view with Blender

- **Goal:** 4.10.2.
- **Files:** new `tools/blender/layout_check.py`; `tools/mf.mjs` (`layout check <scene> [--gltf]` runs export +
  Blender; `overlay --reference <png>`).
- **Do:** as 4.10.2. Overlap test: for each plate, boxes as mesh objects; `mathutils.bvhtree.BVHTree.FromObject` per
  object and `overlap()` pairs, then the intersection area from the two rectangles' overlap in plan (report only
  pairs whose plan overlap exceeds 0.05 m2 and whose kinds are not both `wall`, since walls meet at corners).
- **Tests:** a synthetic layout JSON with two overlapping racks -> one `OVERLAP` line and exit 1; a clean one -> exit 0
  and a PNG of the expected size.
- **Accept:** tests pass; the check's result for the four owner tabs is listed in the release note (overlaps are
  questions for the lead, not auto-fixed).
- **Docs:** `docs/RECIPES.md` 13, `docs/TROUBLESHOOTING.md`.

#### T6.5 Studio: door tool, trace tool, label switch

- **Files:** `tools/v7/studio-edit.js`, `tools/v7/studio-ui.js`, `tools/v7/scene-core.js` (`showLabel`),
  `src/v8/replica.js` (draw labels), `tools/v7/scene-schema.mjs`.
- **Do:**
  - **Door** (`D`, button `Door` in the Objects tab's add grid until M7 moves it): click a wall: a 3.6 m opening
    centred on the click shows as a preview; drag along the wall to move it, drag an end to resize; `Enter` or a second
    click applies `layout.door` through `MFOps` and the layout reload; `Esc` cancels.
  - **Trace** (`T`, button `Trace from the plan picture`): the view flies to straight-down over the active floor, the
    original plan picture shows at 50 % (the engine's "Plan: original" layer; slider `Picture 0 … 100 %`), a kind
    picker (`Machine`, `Line`, `Conveyor`, `Table`, `Rack block`, `Storage field`, `Wall`); drag a rectangle (snaps to
    0.1 m); a tag shows `4.0 x 21.0 m`; on release `layout.add` with an id `<kind>-<n>`; `Shift` keeps the tool for the
    next rectangle; the layout reload happens once, when the tool is left (the rectangles are shown as outlines until
    then).
  - **Label**: `layoutAdds[].showLabel` (true / false, default false): the replica draws the `label` text as an area
    tag at the item's centre (reuse the department label drawing of the engine, `drawDepts`).
- **UI text:** status bar hints: `Click a wall to cut a door · drag to move it · Enter applies` /
  `Drag a rectangle over the picture · Shift keeps the tool · Esc ends`. Refusals as 5.7.
- **Edge cases:** a slanted wall (`Doors can only be cut in straight walls.`); a rectangle on a route
  (`This would block the path "<name>". Hold Ctrl while releasing to add it anyway.`); the trace tool on a floor that
  has no original picture (`This floor has no plan picture.`).
- **Tests:** `tools/v7/mouse-test.mjs` additions: a door cut by two real clicks on the example's wall appears in
  `MFX.toScene().layoutEdits` and survives the reload; a traced rectangle becomes one `layoutAdds` entry of the picked
  kind with the dragged size within 0.1 m.
- **Docs:** `docs/CONTROL_GUIDES/LAYOUT.md`, `KEYBOARD.md` (generated), `docs/OPEN_ISSUES.md` (close 5).

#### T6.6 (optional) A new picture as a calibrated overlay

- **Do:** 4.6 row "A new picture". Scene field `studio.overlays[]`:
  `{ id, name, floor, hash, opacity (0 to 1), fit: [a, b, c, d, e, f] }` where plan x = a px + b py + c and plan
  y = d px + e py + f (metres, picture pixels). The picture's bytes go to IndexedDB (`mf8-overlays`, key = hash); a
  scene opened on another PC shows `Picture "<name>" is not on this PC. Drop it here to show it.` Three-point fit: solve
  the 6 numbers from 3 pairs; with more pairs, least squares; show the largest error in metres.
- **Accept:** a picture scaled and shifted by known amounts is fitted with under 0.05 m error from 3 clicks (driven
  through the API in `ui-check.mjs`). Build only when the owner asks (question Q6).

#### T6.7 Release `v8.5`

As "A release". Extra: `format-test.mjs` in the gate; side-by-side pictures of one owner tab: no shadows (7.7.2) /
painted / re-baked.

### M7. The new screen (`v8.6`)

Read section 5. Do the tasks in order; after each one the player must still work with the old panels that have not
been replaced yet.

#### T7.1 The view follows its container

- **Goal:** the 3D canvas can be smaller than the window (docks; later: film size).
- **Files:** `src/v8/player/*` (every use of `innerWidth` / `innerHeight`), `tools/v7/studio-*.js` (same),
  `src/v8/shell.html`, `src/v8/player.css`.
- **Do:** in the boot part: `const VIEW = { w: innerWidth, h: innerHeight, x: 0, y: 0 };` updated at the start of
  `resize()` from `$("stage").getBoundingClientRect()`; replace `innerWidth` / `innerHeight` by `VIEW.w` / `VIEW.h` in
  the engine and the Studio (projection `proj`, overlay canvas size, label placement, picking `setRay`, `ndc` maths,
  compositing); pointer coordinates use `e.clientX - VIEW.x`, `e.clientY - VIEW.y`. Expose `MF.x.view = VIEW`. Observe
  the stage with a `ResizeObserver` that sets `resizePending`. Remove the `setViewOffset` shift for the old steps
  panel when that panel is removed (T7.3).
- **Tests:** browser: set `#stage` to a 1000 x 600 box at (300, 80) by CSS in the test; a stop's label is within 2 px
  of its projected point; a click on a stop's screen position selects it; `mouse-test.mjs` passes at full size.
- **Accept:** tests pass; identity and camera rows pass.

#### T7.2 Tokens and opaque docks

- **Files:** `src/v8/player.css`, `tools/v7/studio.css`, `tools/v7/scene-ui.css`.
- **Do:** add the tokens of 5.3; restyle panels, inputs, buttons, lists to them (opaque `--bg-chrome`, no backdrop
  blur outside Present's player bar); one focus style; control height from `--ctl-h`;
  `@media (pointer: coarse) { :root { --ctl-h: 40px } }`; `@media (prefers-reduced-motion: reduce)` zeroes transitions.
- **Accept:** `tools/v7/tour.mjs` screenshots: every panel text passes 4.5 : 1 against its background (check 10 sampled
  text / background pairs with the tokens' values; they are fixed colours, so this is arithmetic, recorded in the PR
  text); no panel is translucent over the 3D view in Build and Direct.

#### T7.3 Page grid, top bar, workspaces, File menu, status bar

- **Files:** `src/v8/shell.html`, `src/v8/player.css`, `tools/v7/studio-ui.js`, `tools/v7/scene-ui.js`,
  `src/v8/player/*player-ui*`.
- **Do:** the grid of 5.4 (`#app` with areas `top`, `left`, `view`, `right`, `time`, `status`); body classes
  `ws-present`, `ws-build`, `ws-direct`; `MFX.setWorkspace(name)` (also `MF.agent` `player.set { workspace }`); the
  top bar of 5.5 with the File menu (items and texts exactly as 5.5), the tab buttons, the path menu, the workspace
  switch, Undo / Redo, `?`; the status bar (`#status`: hint, message, checks chip, saved chip) and `X.tip()` writes to
  it (errors red, kept until replaced); remove: the right rail, the options and camera popovers (their controls move
  into the view tools and the `[=]` menu), the Scene file panel, the Project tab, the Studio toolbar, the `DRAFT ORDER`
  tag, the old help table, the old steps panel. Keys `1`, `2`, `3`, `Shift+2`, `Shift+3`, `Shift+A`, `Tab` as 5.6.
- **Edge cases:** the player must still start when the Studio scripts fail (Present only: the engine's own bar);
  deep links: `#inj1` tab hashes keep working; `?ws=build` opens a workspace; the fade of Present's bar must not hide
  the top bar while a menu is open.
- **Tests:** `tools/v7/ui-check.mjs` rewritten for the new ids: switch the three workspaces; File menu actions call the
  same functions as before (`MFS.save`, `openFile`, `download`, validate); the status bar shows the last message;
  `tools/v7/smoke-76.mjs` and `mouse-test.mjs` updated to open Build instead of "the editor".
- **Accept:** tests pass; the tour screenshots show no overlapping panels at 1600 x 900 and at 1100 x 700.

#### T7.4 Build workspace

- **Files:** `tools/v7/studio-ui.js` (replace `renderObjects`, `renderPaths`, `renderSteps` by `renderOutline`,
  `renderAdd`, `renderInspector`), `tools/v7/studio.css`.
- **Do:** 5.5 "Build": the outline (steps of the path with drag reorder, the four collapsible lists, `Find…`), the Add
  tab (three groups, exact titles and items of 5.5), the inspector (one renderer per selection kind: step, stop,
  device, object, layout object, layout addition, nothing = path). Every field keeps its current `data-f` binding and
  `commit` call; only the place on screen changes. Route buttons (`Straighten`, `L`, `Auto`, `Draw`, `No path`) and the
  camera fields of T3.6 sit in the step inspector. The small timeline (96 px) shows the named step bars.
- **UI text:** section titles `PATH`, `STOPS`, `DEVICES`, `OBJECTS`, `LAYOUT CHANGES`; buttons `+ Step`, `+ Elevator`;
  inspector headings `ROUTE`, `CAMERA`; path actions as 5.5.
- **Tests:** `ui-check.mjs`: selecting a step in the outline fills the inspector; editing `Wait` writes the scene;
  the Add tab places a crate by a real click; `Find` filters.
- **Accept:** tests pass; every field that existed in the old three tabs is reachable (checklist in the PR text made
  from the old `data-f` names: `grep -o 'data-f="[^"]*"' tools/v7/studio-ui.js` before and after).

#### T7.5 Direct workspace and the timeline

- **Files:** `tools/v7/studio-ui.js` (`renderLanes` rewritten as `renderTimeline`; `renderDirector` split into the left
  dock blocks and the right inspector), `tools/v7/studio.css`.
- **Do:** 5.5 "Direct": lanes `STEPS`, `CAMERA`, `TEXT`, `FILM` (36 px each, labelled); zoom (`tl.zoom` = pixels per
  second, 2 to 200; `Ctrl+wheel`, slider, `Home` = fit) and pan (`tl.t0`); snapping (6 px) to step times and to other
  items, `Alt` = free; a time tag under the pointer; keys as diamonds, cuts as `X`, planned shots as bars with the
  button `Make keys from the guided camera` (`key.from-plan`); captions as bars with their title; the film range bar.
  Left dock: camera block (pad docked, `more` for Speed / Smooth), `VIEWS` (named list; rename by double-click),
  `FILMS` list. Right inspector: key (time, look, distance, heading, tilt, lens, ease: plain words through the
  format-2 conversion), caption (three languages at once), film (fields and texts of 5.5). Transport row with
  `+ Key (K)`, `+ Caption (C)`, `Record my move (J)`; `,` / `.` step one film frame; `I` / `O` set the film range.
- **Edge cases:** very long paths (248 s) at the widest zoom: draw only items in view; dragging a step boundary
  changes the wait of the step before it (existing behaviour) and re-plans the camera; a caption dragged past the path's
  end is clipped.
- **Tests:** `ui-check.mjs`: zoom and pan keep the play head's time; dragging a caption bar by a real pointer drag
  moves `t0` / `t1` by the expected seconds within one snap step; the caption inspector writes `ar` without touching
  `en`; `mouse-test.mjs`: key drag.
- **Accept:** tests pass; lanes are at least 36 px high; a caption's title is readable on its bar at fit zoom for the
  example film.

#### T7.6 Present workspace and the Numbers drawer

- **Files:** `src/v8/player/*player-ui*`, `src/v8/player.css`, `tools/v7/studio-numbers.js`.
- **Do:** 5.5 "Present": the floating bar with the named step segments on the scrub line, the caption language menu,
  the `[=]` view menu; the Numbers drawer (table, before / after rows, the per-step distance bar, `Copy as text`).
- **Tests:** `ui-check.mjs`: the drawer's values equal `MFMotion.numbers`; `Copy as text` puts the table on the
  clipboard (read back through `navigator.clipboard.readText` in the test page with the permission granted through CDP
  `Browser.grantPermissions`).
- **Accept:** tests pass.

#### T7.7 Actions table, command palette, keyboard map

- **Files:** new `tools/v7/studio-actions.js` (in the Studio group before `studio-ui.js`), `tools/v7/studio-ui.js`,
  `tools/v7/docs-check.mjs` (the `keys` block reads `ACTIONS`).
- **Do:** `const ACTIONS = [ { id, title, group, keys, when(ctx), run(ctx), op? } ]` holding every command of the
  Studio (move the `keydown` chain, the right-click menu items and the toolbar buttons onto it); the key handler looks
  keys up in `ACTIONS`; the right-click menu and the palette list actions whose `when` is true; `Ctrl+K` palette as
  5.5 (fuzzy match on title; also stops, devices, steps, paths by name); the keyboard map overlay and
  `docs/CONTROL_GUIDES/KEYBOARD.md` are generated from `ACTIONS` (`group` = the workspace).
- **Tests:** `ui-check.mjs`: typing `door` in the palette lists the door action; `Enter` starts the tool; every action
  with `keys` appears in the generated keyboard doc (docs-check).
- **Accept:** tests pass; no key works that is not in `ACTIONS` (search `studio-ui.js` for remaining `e.key` uses
  outside the handler and text fields).

#### T7.8 Studio commands go through the operations

- **Goal:** one implementation per edit (1.4 item 6).
- **Files:** `tools/v7/studio-edit.js`, `tools/v7/studio-ui.js`, `tools/v7/studio-actions.js`.
- **Do:** actions that are whole-scene edits call `MFOps.run(MFX.toScene(), layout, op, params)` and then
  `replaceScene` (one undo step): straighten (step / path / all), L shape, auto-route (step / path), fix links, add
  step, add elevator ride, reverse, duplicate / delete / reorder path, door, layout add, device placed on a route,
  captions from steps, keys from the guided camera. Delete the Studio's own copies (`straightenPath`, `orthogonalize`,
  `lShape`, `autoRouteFlow`, the elevator-ride code in `renderSteps`). Live drags (move, turn, corner drag, timeline
  drags) keep editing the working copy directly (they need per-frame feedback).
- **Tests:** `smoke-76.mjs`, `mouse-test.mjs`, `ui-check.mjs`; new check: `S` on a jagged example step gives the same
  points as `route.straighten` in Node for the same scene.
- **Accept:** tests pass; `studio-edit.js` no longer defines the deleted functions.

#### T7.9 First run, empty states, touch, accessibility

- **Files:** `tools/v7/studio-ui.js`, `src/v8/shell.html`, `src/v8/player.css`.
- **Do:** 5.7 (first-run card with the exact texts; coach marks; empty-state texts and buttons), 5.6 touch (two-finger
  pan and pinch in the view: track two pointers; long press = context menu after 500 ms without movement), 5.8 (roles,
  focus order, `Esc`, reduced motion, minimum window). Browser storage keys `mf8:seen`, `mf8:coach:<workspace>`.
- **Tests:** `ui-check.mjs`: a fresh profile shows the card once and not after `Do not show again`; each empty state's
  button does its job; a synthetic two-pointer pinch (CDP `Input.dispatchTouchEvent`) changes the camera distance;
  `Tab` reaches the workspace switch, the path menu and the play button in order.
- **Accept:** tests pass.

#### T7.10 Release `v8.6`

As "A release". Extra: the tour at 1600 x 900, 1366 x 768 and 1100 x 700 in `dist/test/v86-tour/`; `docs/CONTROL_GUIDES/*`
"A person" sections rewritten for the workspaces; `docs/OPEN_ISSUES.md` (close 3); a one-page "what moved where" table
in `docs/CHANGELOG.md` from 5.9.

### M8. Trolleys that wait (`v8.7`)

#### T8.1 Queue model

- **Files:** `src/v8/motion-core.js`.
- **Do:** 4.7.
  ```
  MFMotion.queue(items, nodes, { trolleys, headway, gap = 2.5, liftReturn = LIFT_T }) ->
      { warps: [ [ [t, tau], ... ] per trolley ], finish: [t per trolley], waits: [ { trolley, t0, t1, step, reason: "trolley ahead" | "elevator" } ], total }
  MFMotion.warp(warp, t) -> tau        // piecewise-linear lookup; tau < intro => not started (returns -1)
  MFMotion.arc(items, nodes, tau) -> { s (m along the whole path), floor, ride: index or -1 }
  ```
  Simulation step 0.05 s; trolley `k` starts when `t >= intro + k * headway` and trolley `k - 1` is at least `gap`
  ahead; a trolley leaves the model when it reaches the path's end plus its last wait.
- **Edge cases:** `headway` shorter than the first step's wait (all later trolleys wait at the start: allowed);
  a gap larger than a leg; two rides in one path; `trolleys = 1` (no warps).
- **Tests:** `tools/v8/queue-test.mjs` (Node): on `docs/examples/trolleys.scene.json` with `queue: true`: the distance
  along the route between consecutive trolleys never falls under `gap - 0.05` while both are on the same floor; with a
  headway longer than any wait there are no waits and every warp is the identity shifted by `k * headway`; an elevator
  path: never two trolleys with `ride >= 0` for the same elevator within `2 * LIFT_T`.
- **Accept:** test passes.

#### T8.2 Engine and Studio use it

- **Files:** `tools/v7/studio-director.js` (`fleetFrame`), `tools/v7/scene-core.js` + schema (`paths[].queue`, `.gap`),
  `tools/v7/studio-ui.js` (path inspector: checkbox `Trolleys wait in line`, field `Gap (m)`), `tools/v7/scene-ops.js`
  (`scene.numbers`, `congestion`), `tools/v7/studio-numbers.js` (column `Waiting in line`).
- **Do:** `fleetFrame`: when `f.queue`, trolley `k`'s time is `MFMotion.warp(warps[k], S.t)` instead of
  `S.t - k * headway`; hidden while `-1` or finished; closest-gap tracking per floor. More than 3 trolleys: one
  `InstancedMesh` per trolley part instead of clones (build from `MF.lot`'s meshes once; update matrices per frame).
  Numbers with `queue`: `seconds` = mean over trolleys of (finish - start); `waiting` = mean wait; trips per shift =
  `floor(shift / seconds) * trolleys`; without `queue` unchanged.
- **Data:** Appendix A rows. Validator: `queue` boolean; `gap` 1 to 20.
- **Tests:** browser: example with `queue: true`: clones never overlap on screen positions closer than the gap (sample
  200 times); `numbers-test.mjs`: page and Node agree on waiting seconds. Identity row (queue off).
- **Accept:** tests pass; draw calls with 12 trolleys stay under the budget (perf report).
- **Docs:** `docs/CONTROL_GUIDES/TROLLEYS.md`, `NUMBERS.md`, `docs/RECIPES.md` 6, `docs/OPEN_ISSUES.md` (6 and 14:
  restate the limits of 4.7), `docs/DECISIONS.md` (D10), CLI "Things to know" (congestion).

#### T8.3 Release `v8.7`

As "A release".

### M9. Cold start and film quality (`v8.8`)

#### T9.1 The performance receipt

- **Files:** new `tools/v8/perf-report.mjs`, `tools/v8/perf-budget.json`.
- **Do:** 4.5 item 1. `node tools/v8/perf-report.mjs <player> [--tabs …] [--seconds 60] [--json out]`: per tab, a fresh
  Chrome: `MF.perf.prep`, then play path 0 at 1x for the given seconds; collect frame intervals (p50, p95, p99, frames
  over 34 ms after the first 10 s), `renderer.info` (calls, triangles, programs, textures, geometries), CPU per frame
  from `MF.perf.lastCPU` samples; compare with the budget file (the table in 4.5); exit 1 on a miss; tabs run one
  after another.
- **Accept:** on `v8.7`: prints a table for four tabs; the result is saved as `dist/test/perf-v87.json` (the baseline).

#### T9.2 Cold start

- **Files:** `src/v8/player/*export-ready*` (the `MF.ready` warm-up), `*frame*` (the preparing screen).
- **Do:** 4.5 item 2. In `MF.ready`: for each of the two floor material states (plan, surface) and with the route
  ribbons and devices visible: `await renderer.compileAsync(scene, camera)`; `renderer.initTexture(t)` for every
  texture found by traversing the scene's materials (`map`, `normalMap`, `roughnessMap`, `emissiveMap`, custom uniforms
  holding textures such as the floor light); time each stage into `metrics.prepStages = { compile, textures, dryRun }`.
  The preparing screen's text gains the stage name (`Preparing the 3D factory… shaders` / `textures` / `first frames`).
  Keep the dry run and the release rule; lower the cover's fixed minimum only if the receipt shows the budget is met.
- **Edge cases:** `compileAsync` missing in the bundled three.js version (check `typeof renderer.compileAsync`; else
  `renderer.compile`); night look programs are compiled only when the look is used.
- **Tests:** `node tools/v7/start-test.mjs <player> 20`; `perf-report` cold numbers.
- **Accept:** 0 of 20 starts with stutter; median cover time at most 2 s; if not met, the receipt's stage times are
  recorded in `docs/OPEN_ISSUES.md` issue 2 with the stage that dominates (the cause is then known, not hidden).

#### T9.3 Film and still quality

- **Files:** `tools/v7/studio-director.js`, `src/v8/player/*frame*`, `tools/mf.mjs`.
- **Do:** film size independent of the window: `recordFilm` sets `VIEW` to the film's size for the duration (T7.1 made
  this possible) and scales the stage element down by CSS transform so the person sees the whole frame; option
  `quality: "best"` renders at 1.5 x and scales down when composing (sharper edges); `mf shots --size` and
  `--supersample 2` for stills; sizes up to 3840 x 2160 at 30 fps (`avc1.640033`; check `isConfigSupported`, else say
  `This PC cannot encode 4K; using 1920 x 1080.`).
- **Tests:** `film-test.mjs`: a 1280 x 720 film from a 1600 x 900 window has 1280 x 720 in `mp4Info`; the window's
  picture is restored afterwards (`VIEW` equals the stage box).
- **Accept:** tests pass; an edge-sharpness comparison picture pair (normal vs best) in `dist/test/v88-quality/`.

#### T9.4 Start-up errors and graphics reset

- **Do:** 4.8 rows "A script error" and "Graphics reset". Texts: `Material Flow could not start.` + the error's first
  line + buttons `Reload` and `Reload without my saved scene` (the second first offers `Download my scene`).
- **Tests:** browser: a planted bad autosave in `localStorage` -> the card shows, the second button starts the player
  with the built-in scene; `WEBGL_lose_context.loseContext()` -> the page reloads once (a flag in `sessionStorage`
  prevents a loop).

#### T9.5 (optional) Hero stills with Blender

4.10.3. Build only on the owner's request.

#### T9.6 Release `v8.8`

As "A release". Extra: `perf-report` before / after table in the changelog.

### M10. The owner's queued features (`v8.9` to `v8.12`)

Each is one release. They are specified to the level needed to start; before each, re-read the owner's latest words in
`docs/STATUS.md` and confirm the questions marked Q in section 7.

#### T10.1 Ghost trolley (`v8.9`)

- **Goal:** see the old route and the new route at once.
- **Data:** `studio.ghost`: `{ "scene": "base" | "file", "name": text, "mode": "time" | "progress" }`. The baseline is
  the scene baked into the player (`MF7.base`) or a scene file chosen in the Numbers drawer (kept in the browser
  session, not in the scene).
- **Do:** build the baseline's timeline for the path with the same id (`MFMotion.timeline` on the baseline scene
  converted against the **baseline's** layout); draw a second trolley (a clone of `MF.lot`, materials cloned with
  opacity 0.35, `depthWrite: false`, `renderOrder` 3) at `pose_base(t)` (`mode: time`) or at the pose with the same
  share of its own route (`mode: progress`), and the baseline route as a thin grey ribbon; hide the ghost when it is on
  another floor than the visible one; a chip above it: `Before · 353 m · 1:45`. Present bar button `Before / after`.
  Operation `ghost.set { scene, mode }`; `mf take --ghost` films with it.
- **Edge cases:** the path id is missing in the baseline (`No "before" for this path.`); different step counts (time
  mode needs none; progress mode uses distance share); rides.
- **Tests:** browser: after `stop.move` on the example the ghost's position at `t = 20` equals the baseline pose and
  differs from the trolley's; the ghost never writes depth (a rack behind it stays visible: pixel check on a synthetic
  view).
- **Accept:** tests pass; identity row.

#### T10.2 Story layer (`v8.10`)

- **Goal:** captions and camera keys follow the process when times change; a film is described as a story.
- **Data:** new top-level `story`: `{ "<path id>": { "beats": [ { "id", "at": Time-anchor, "for": seconds,
  "title": text or { en, ar, ko }, "text": …, "shot": { "look", "distance", "heading", "tilt", "lens", "ease" } or null,
  "place", "style" } ] } }` where `at` is a string of the Time grammar **anchored to a step** (`step:s3:arrive-1`).
  The player compiles beats to captions and keys at load (`MFScene.compileStory(scene, timeline)`), after any timing
  change, and whenever a beat is edited; compiled items carry `from: "<beat id>"` and are not saved twice (the scene
  stores beats; `director` keeps only hand-made items).
- **Do:** operations `beat.add / set / move / remove / list`, `story.from-steps` (one beat per step);
  Direct: a `STORY` lane above `STEPS` (beats as flags tied to their step; dragging re-anchors to the nearest step
  moment); inspector for a beat. Validator: anchors must name existing steps; beats of a path must not overlap in the
  same caption place.
- **Tests:** Node: change a step's `wait` by +5 s: every later beat's compiled time moves by 5 s; hand-made captions do
  not move. Browser: smoke.
- **Accept:** tests pass.

#### T10.3 Parallel worlds (`v8.11`)

- **Goal:** compare two whole scenes (before / after, option A / option B).
- **Do (first slice, one canvas):** `File > Compare with a scene…` loads a second scene of the same tab as world B
  (validated; its layout edits must equal world A's in this slice, else: `These scenes have different factory layouts;
  comparing them needs the split view (not built yet).`). A switch `A | B | A+B` in the top bar: `A` and `B` swap the
  scene on screen at the same story share (`replaceScene` + seek); `A+B` shows world A with world B's trolley and route
  as ghosts (T10.1's drawing) for the path with the same id; the Numbers drawer shows both columns. Operation
  `world.set { b: scene | null, show }`.
- **Second slice (only after measuring):** split screen = two viewports of one renderer (`renderer.setViewport` /
  `setScissor`), each world with its own layout needs a second replica: measure memory and frame time with
  `perf-report` first; ship only if the budget of 4.5 holds at 2 x 960 x 1080.
- **Tests:** browser: A / B switch keeps the play share within 0.5 %; numbers of both shown.
- **Accept:** tests pass; perf receipt within budget.

#### T10.4 Report to film (`v8.12`)

- **Goal:** from a small report file to a finished film with one command.
- **Data:** `film-brief` JSON (validated by `tools/v8/brief-schema.mjs`):
  ```
  { "format": "mf-film-brief", "version": 1, "title": text | { en, ar, ko }, "lang": "en" | "ar" | "ko" | "en+ar" …,
    "scene": "path/to.scene.json", "before": "path/to.before.scene.json" (optional), "path": "<path id>",
    "seconds": 30, "fps": 30,
    "points": [ { "say": text | { … }, "step": "<step id>" (optional), "metric": "distance" | "time" | "trips" | "waiting" (optional),
                  "evidence": text (where the number comes from; shown in the receipt, not in the film) } ] }
  ```
- **Do:** `MF film <brief.json> --out <file.mp4>`: validates the brief; builds a story (T10.2): an opening title beat,
  one beat per point anchored to its step (or spread evenly), metric values taken from `scene.numbers` of `scene` and
  `before` (`Distance 353 m -> 344 m`), a closing beat with the numbers table; turns on the ghost when `before` is
  given; records the take (M2); writes the receipt (`<out>.json`) with the brief's hash, scene hashes, every number
  with its source, and any point whose metric could not be computed (listed as `missing`, never invented).
- **Rules:** numbers come only from the motion model or from the brief's own text; a brief may not reorder the process;
  simulated values are labelled `model` in the receipt.
- **Tests:** an example brief in `docs/examples/film-brief.json` over the sample scenes produces a film of the stated
  length and a receipt with no `missing` entries; a brief naming an unknown step fails with `E_REF`.
- **Accept:** tests pass; one owner film made from a real brief for the owner's review.

### M11. Godot film path experiment (no player release)

#### T11.1 Spike

- **Goal:** 4.10.4: one 10 s film of one owner path rendered by Godot, or a recorded "no".
- **Files:** new `godot/mf-film/project.godot`, `godot/mf-film/film.gd`, `godot/mf-film/film.tscn`;
  new `tools/v8/export-film.mjs`; uses `tools/blender/layout_check.py --gltf` (T6.4).
- **Do:**
  1. `export-film.mjs`: per film frame `i`: `t = t0 + i * speed / fps`; trolley from `MFMotion.pose` + `MFMotion.world`
     (metres: units x 0.3; Y up; Godot -Z = north: z = plan y, so no flip is needed if the glTF used the same rule:
     state the rule in both tools' headers); camera from `MFCamPlan.pose` (eye from target, distance, azimuth, polar).
     Rides: export the plates' offsets per frame too (`plates: { key: [[x, y, z] per frame] }`).
  2. `film.gd` (attached to the root of `film.tscn`): read `--film` from `OS.get_cmdline_user_args()`; load the GLB
     with `GLTFDocument.append_from_file` + `generate_scene`; add a `DirectionalLight3D` with the sun rotation and
     shadows on, a `WorldEnvironment` (sky colour as the Studio look's background `#d3dce7`, ambient 0.85), a
     `Camera3D`, a box mesh for the trolley; in `_process`: frame index = `Engine.get_frames_drawn()` minus the first
     frame's number; set trolley transform, camera `look_at_from_position`, plate offsets; quit after the last frame.
  3. Run (verify each flag with `"%GODOT%" --help` first): the command of 4.10.4 without `--headless`; try
     `--rendering-method mobile` then `gl_compatibility`; record which works and the seconds per frame.
  4. Frames to MP4: a small page `tools/v8/png-to-mp4.html` driven through `cdp.mjs` that decodes each PNG
     (`createImageBitmap`), encodes with `VideoEncoder` and writes with `MFMp4` (no new tool needed).
- **Accept (go / no-go, decided with the owner):** the three conditions at the end of 4.10.4. Either way: a section in
  `docs/DECISIONS.md` (D13 result) with the sample film's path, the timings, and what a full Godot path would still
  need (materials, models, labels, captions, devices).
- **Do not change:** the player; nothing in M0 to M10 depends on this task.

---

## 7. Risks and open questions for the owner

### 7.1 Risks, ranked (likelihood x damage)

| # | risk | sign that it is happening | what limits it |
|---|---|---|---|
| 1 | The planned camera cannot find clear, calm shots on some owner paths (tight rooms, rides) | `camera-test` hidden samples or forced cuts on a path | per-path fallback to the reactive camera (`plan.ok = false`), the designed ride fallback, pins per step for hand correction, the release lists every such path |
| 2 | The source build drifts from the patch build without anyone noticing | hash differs in T1.1 / T1.2; later: identity row fails | byte-identity proof for stages A and B; the gate after every engine task; V6 and the patch list kept untouched as the reference |
| 3 | Company data lands in a tracked file during extraction | a megabyte-long line or a picture data URL under `src/v8` | the extractor refuses lines over 100,000 characters in `src/v8`; data and assets go to `private/v8/base`; `git status` check in the task's acceptance |
| 4 | WebCodecs behaves differently on another PC (no H.264 encoder, frame reordering) | `recordFilm` reports `path: "realtime"` | automatic fallback with a clear message; the CLI fails loudly unless `--realtime` is given; the receipt names the path used |
| 5 | Arabic captions in films are still ordered or shaped wrongly | the owner's check of the sample film | explicit right-to-left direction per line; one sample film per release for the owner; the page's own caption (DOM) stays the reference |
| 6 | The UI rebuild breaks habits or hides a control | a field in the old panels has no new home | the `data-f` checklist in T7.4; the "what moved where" table; old behaviour kept per task until its replacement works |
| 7 | Moving every Studio command onto the operations slows editing (a full scene replace per command) | a command takes over 150 ms | measure `replaceScene` on the largest scene first; live drags stay on the working copy; if slow, keep a fast path for single-step route edits |
| 8 | The Blender re-bake does not match the approved light of the original floors | `light-compare` over the limit | tune only the tone step against the unedited layout before any edited layout is baked; the painted-shadow level remains as fallback |
| 9 | Format 2 strands files for older players | a version-2 file opened in 7.x fails | `downgrade`, copies of the version-1 scenes, the message in the new player, version-1 identity scenes kept |
| 10 | The stricter validator (objects on routes, true PC footprints) fails scenes that pass today | the four owner scenes after T5.5 | run before / after on the owner scenes and list the differences for the lead before release |
| 11 | The tight router pass changes an owner route | numbers before / after differ on an `auto` step | it runs only when the comfortable pass detours or fails; every changed step is listed; exact `points` routes never change |
| 12 | History folders or temp players pile up | disk space | 200 entries per scene; temp players deleted at the end of each verb; `.mf-history/` ignored by git |
| 13 | Too many Chrome starts make the gate slow or flaky | gate over 30 minutes | Node-only tests for all cores; one Chrome per test file; GPU rows sequential; `--quick` for daily work |
| 14 | The Godot experiment absorbs time without a result | no film after the time box | it is last, optional, isolated, and ends with a recorded go / no-go |
| 15 | Queueing numbers are read as a factory capacity study | the owner quotes trips per shift from it | the limits are printed with the numbers ("one path, no return trip, no passing") in the drawer, the CLI and the docs |

### 7.2 Open questions for the owner, ranked by how much they block

| # | question | needed before | default if no answer |
|---|---|---|---|
| Q1 | The planned camera changes how all 10 films look (longer holds, fewer turns, cuts only at elevators). Approve from before / after contact sheets? Preferred viewing direction and tilt? | releasing M3 | release it with `?cam=reactive` documented as the way back |
| Q2 | At an elevator: a look straight down the shaft with the upper floor hidden until the trolley comes out (built by the review on 2026-11-11, see 1.6), or the three-beat ride (approach, the car between the floors, cut to above the upper floor)? | T3.4 | the shaft view (already built); three beats only if the owner asks |
| Q3 | Version names: this plan uses `v8.0` to `v8.12`; the ghost trolley, story layer and parallel worlds were announced as V7.8 to V7.10. Rename them? | M0 release notes | use the 8.x numbers and say so in the changelog |
| Q4 | May the tool re-bake the floor light with Blender for every released layout change (minutes per tab on this PC)? | T6.3 | yes for releases; painted shadows while editing |
| Q5 | Arabic in films: please check the sample film (`dist/test/v81-film-ar-en.mp4`): word order around "RFID", font, size. | closing OPEN_ISSUES 15 | keep the issue open |
| Q6 | With several trolleys, what should "trips per shift" mean? There is no return trip in the model. | T8.2 texts | mean trip time with waiting x trolleys, labelled as a model value |
| Q7 | After M5 the checker fails a scene when a placed object stands on a route or a PC truly touches the lane. Accept the stricter check? | T5.5 release | yes, with the list of affected places shown first |
| Q8 | The new screen opens in Present (clean film view) with Build and Direct one click away, and the right icon rail is removed. Agree? | M7 | yes |
| Q9 | ffmpeg was installed on this PC by a proof agent without asking (handoff note), and the CLI's film export now depends on it (1.6). Approve it as a tool of the project, or remove it? If approved, M2 can shrink (the in-page encoder becomes optional) and the Godot frame-to-film step is trivial. If not, M2 as written removes the dependency. | M2 | not approved: build M2 as written, keep ffmpeg as an optional encoder only |
| Q10 | Is the Godot film path wanted enough to spend the experiment (M11), or only if the browser films of M9 are not good enough? | M11 | run it last |
| Q11 | Films: is 1920 x 1080 at 30 frames per second the standard? Is 4K or 60 fps needed for the management screens? | T9.3 | 1080p30; 60 fps on request |
| Q12 | The three.js library (0.9 MB, open source) would be tracked in git under `src/v8/vendor`; model data and all layout data stay private. Acceptable? | T1.1 | yes; if not, it goes to `private/v8/base` too |
| Q13 | Layout questions still open from the round in progress: Press line P2 and the west parts of P1 / P3 (your paths run there); the INJ 2 double lines below the machine row (markings or conveyors?). | the layout round, not this plan | leave as they are |
| Q14 | A new plan picture dropped into the Studio as a calibrated overlay (T6.6): needed, or are the pictures already in the player enough? | T6.6 | not built |
| Q15 | The `DRAFT ORDER` tag from V2 is still in the page (hidden since V7.1). Remove it for good? | T7.3 | remove |

---

## Appendix A. Schema rows to add (`tools/v7/scene-schema.mjs`; same columns as the generated field table)

| field | type | unit | allowed values | default | example | meaning | task |
|---|---|---|---|---|---|---|---|
| `takes[].seconds` | number | s | 1 to 3600; not with `speed` | none | 20 | Exact film length; the speed is computed. | T2.5 |
| `takes[].lang` | text | | en, ar, ko, en+ar, en+ko, ar+ko | `studio.lang` | "en+ar" | Caption language(s) of the film. | T2.5 |
| `takes[].size` | [w, h] | px | even numbers 320 to 3840 | the window | [1920, 1080] | Film picture size. | T2.5 / T9.3 |
| `takes[].poster` | true/false | | | false | true | Also save a still picture. | T2.5 |
| `takes[].fps` | number | | 24, 25, 30, 60 (was 1 to 120) | 30 | 30 | Frames per second. | T2.5 |
| `paths[].steps[].camera.heading` | number | deg | 0 to 360 | automatic | 315 | Direction the guided camera looks in this step. | T3.6 |
| `paths[].steps[].camera.tilt` | number | deg | 20 to 89 | automatic | 45 | Guided camera tilt (90 = straight down). | T3.6 |
| `paths[].steps[].camera.hold` | true/false | | | false | true | No view change inside this step. | T3.6 |
| `layoutAdds[].slot` | number | | whole number 0 to 899, unique | list position (version 1) | 4 | Permanent number behind the item's numeric ids. | T6.1 |
| `layoutAdds[].showLabel` | true/false | | | false | true | Draw `label` as an area tag. | T6.5 |
| `layoutEdits[].target` | text | | also `add:<id>`, `add:<id>:<cell>` | | "add:line-a" | Target an added item by its id. | T6.1 |
| `director{id}.keys[].look` | text or [x, y] | m | "trolley" or a point | "trolley" | [43.5, 152.7] | What the camera looks at. | T6.1 |
| `director{id}.keys[].floor` | text | | a floor key | | "1F" | Floor of a fixed look point. | T6.1 |
| `director{id}.keys[].height` | number | m | 0 to 30 | 0.6 | 0.6 | Height of the look point above the floor. | T6.1 |
| `director{id}.keys[].offset` | [dx, dy, dh] | m | | [0, 0, 0.6] | [0, 0, 0.6] | Follow keys: look point relative to the trolley. | T6.1 |
| `director{id}.keys[].distance` | number | m | 2 to 1500 | 60 | 40 | Camera distance. | T6.1 |
| `director{id}.keys[].heading` | number | deg | | 0 | 45 | Direction the camera looks (0 north, clockwise). | T6.1 |
| `director{id}.keys[].tilt` | number | deg | 1 to 89.5 | 40 | 35 | 90 = straight down. | T6.1 |
| `director{id}.keys[].lens` | number | mm | 8 to 300 | 48 | 48 | Lens. | T6.1 |
| `viewpoints[].id`, `.name`, `.empty` | text / text / true | | | | "view-1", "Overview" | Named saved views. | T6.1 |
| `studio.overlays[]` | list | | | [] | | Calibrated pictures (name, floor, hash, opacity, fit). | T6.6 |
| `paths[].queue` | true/false | | | false | true | Trolleys wait behind each other and for the elevator. | T8.2 |
| `paths[].gap` | number | m | 1 to 20 | 2.5 | 3 | Smallest distance between waiting trolleys. | T8.2 |
| `studio.ghost` | object | | { scene, name, mode } | none | { "scene": "base", "mode": "time" } | Before / after ghost trolley. | T10.1 |
| `story{id}.beats[]` | list | | | [] | | Story beats anchored to steps. | T10.2 |

Version-1 key fields (`x, y, z, ox, oy, oz, dist, az, pol, fov`) stay in the schema, marked "version 1 only".

## Appendix B. Error and warning codes

Every issue and operation error carries one of these. Exit code of the CLI in brackets.

| code | meaning | typical hint |
|---|---|---|
| `E_USAGE` (2) | missing or malformed parameter, unknown operation | the parameter's doc line and accepted forms |
| `E_FORMAT` (1) | not a scene, wrong version, malformed list / object | start from an example scene |
| `E_ID` (1) | missing, duplicate or badly formed id | a free id is suggested |
| `E_REF` (1) | unknown stop, path, step, floor, elevator, layout object; or the thing is still used | the valid names; the users |
| `E_RANGE` (1) | value outside its range | the range |
| `E_JOIN` (1) | a step does not start where the previous ended / end at its stop / changes floor without a ride | the point it must use; `route fix-links` |
| `E_CLEAR` (1) | the trolley hits or passes under 0.09 m from something | the object, leg and point; `ray`, `clearance` |
| `E_GEOMETRY` (1) | a placement or door that cannot be made | the nearest free place or the free wall length |
| `E_ROUTE` (1) | no clear route found | what a straight line would cross |
| `E_CONFLICT` (1) | the file changed on disk during the command | run the command again |
| `E_ENV` (3) | player file, Chrome, Blender or Godot not found; file not writable | how to build / where the tool looks |
| `E_INTERNAL` (1) | an unexpected exception | the message; nothing was written |
| `W_CLEARANCE` | gap under 0.15 m | |
| `W_DETOUR` | a step is far longer than the straight way | walls in the way |
| `W_CAMERA` | the camera hides the trolley for a stretch, or a pin was overridden | times |
| `W_UNKNOWN_FIELD` | a field the format does not know | the nearest known name |
| `W_CAPTION` | caption out of range, overlapping, or missing a language | the caption id |
| `W_LIGHT` | the baked floor light is out of date for this layout | run the light command |

The validator's message texts stay as they are today (the troubleshooting table and agents rely on them); the code is
added beside them.

## Appendix C. Test matrix (the gate)

`<P>` = the player under test. Rows marked **q** are in `--quick`. Rows marked **priv** need `private/`.

| name | command | proves | q | priv |
|---|---|---|---|---|
| docs | `node tools/mf.mjs docs-check` | docs match the code | q | |
| validate | `node tools/mf.mjs validate <every docs/examples/*.scene.json> --player <P>` and the four `private/v7/scenes/*.scene.json` | scenes are valid | q | part |
| validator | `node tools/v7/validator-test.mjs <P>` | planted faults are caught | q | |
| identity | build: `node tools/build-v7.mjs 7.7.2 --out <out>/identity.html --no-docs-check --bake private/v7/scenes-v6/inj1.scene.json private/v7/scenes-v6/inj2.scene.json private/v7/scenes-v6/eps.scene.json private/v7/scenes-v6/press.scene.json` (from M1: `tools/build-v8.mjs <stage>` with the same options); then `node tools/v7/identity-test.mjs dist/Material_Flow_Player_v6.html <out>/identity.html` | the 10 paths move exactly as in V6 | q | priv |
| layout-adds | `node tools/v7/layout-adds-test.mjs <P>` | additions, doors, reload undo | q | |
| review | `node tools/v7/review-test.mjs <P>` | round trips, transactions | | |
| smoke | `node tools/v7/smoke-76.mjs <P>` | Studio edits reach the scene | | |
| mouse | `node tools/v7/mouse-test.mjs <P>` | real mouse and keys | | |
| ui | `node tools/v7/ui-check.mjs <P>` | menus, search, numbers | | |
| gates | `node tools/v7/gates-test.mjs <P>` | 24 RFID gates | | |
| stage1 | `node tools/v7/stage1-test.mjs <P>` | a path from data only | | priv |
| camera (to M2) | `node tools/test-camera-v5.mjs <P> <tab> guided 3 <i>` for inj1 0, 1; inj2 0, 1; eps 0, 1, 2, 3; press 0, 1 | trolley visible (sampled) | | priv |
| camera (from M3) | `node tools/v8/camera-test.mjs <P>` | 4.3.4 table | | priv |
| camplan (M3) | `node tools/v8/camplan-test.mjs`, `node tools/v8/sight-test.mjs` | planner and sight model | q | |
| start | `node tools/v7/start-test.mjs <P> 8` | no stutter on fresh starts | | |
| take | `node tools/v7/take-test.mjs <P>` | a film records | | |
| motion (M1) | `node tools/v8/motion-test.mjs`, `node tools/v8/numbers-test.mjs <P>` | one motion model | q (first) | |
| guard (M0) | `node tools/v8/build-guard-test.mjs` | releases are protected | q | |
| film (M2) | `node tools/v8/mp4-test.mjs`, `node tools/v8/offline-test.mjs <P>`, `node tools/v8/film-test.mjs <P>` | exact films | q (first) | |
| ops (M4) | `node tools/v8/ops-test.mjs`, `node tools/v8/cli-test.mjs` | operations, history | q | |
| agent (M5) | `node tools/v8/agent-test.mjs <P>` | page API | | |
| format (M6) | `node tools/v8/format-test.mjs` | versions 1 and 2 | q | |
| queue (M8) | `node tools/v8/queue-test.mjs` | waiting trolleys | q | |
| perf (M9) | `node tools/v8/perf-report.mjs <P>` | the budget of 4.5 | | |

Rules: GPU rows run one at a time; a row never edits a file outside `dist/test/` and the system temp folder; new tests
use `docs/examples` scenes or synthetic data so they run without `private/`; a failing row is fixed or recorded in
`docs/OPEN_ISSUES.md` with its numbers: thresholds are never relaxed to make a row pass.

## Appendix D. MP4 file layout for the recorder (`src/v8/mp4-mux.js`)

All numbers big-endian. A box = 4-byte size, 4-byte type, content. "Full box" = 1-byte version + 3-byte flags first.
`N` = frame count, `fps` = frames per second, `TS = fps * 1000` (track time scale), each frame lasts 1000.

```
ftyp   major "isom", minor 0x200, compatible "isom" "iso2" "avc1" "mp41"
moov
  mvhd (v0)  timescale 1000, duration round(N / fps * 1000), rate 0x00010000, volume 0x0100, identity matrix, next track id 2
  trak
    tkhd (v0, flags 3)  track id 1, duration (movie time scale), width and height as 16.16 fixed point, identity matrix
    mdia
      mdhd (v0)  timescale TS, duration N * 1000, language "und" (0x55C4)
      hdlr       handler "vide", name "Material Flow"
      minf
        vmhd (flags 1)
        dinf > dref (1 entry) > "url " (flags 1: data in this file)
        stbl
          stsd (1 entry) > avc1: data reference index 1, width, height, 72 dpi (0x00480000) twice, frame count 1,
                                 32-byte compressor name (zeros), depth 0x0018, pre-defined -1,
                                 then box avcC = the encoder's decoderConfig.description bytes, unchanged
          stts  1 entry: (N, 1000)
          stss  the 1-based numbers of the key frames
          stsc  1 entry: (first chunk 1, samples per chunk N, description 1)
          stsz  sample size 0, count N, then the N frame sizes
          stco  1 entry: the file offset of the first frame  (use co64 with an 8-byte offset when the file is over 4 GB)
mdat   size (use the 64-bit size form when over 4 GB), then the frames in order, each exactly as the encoder gave it
       (avc format: 4-byte length before every NAL unit)
```

Order in the file: `ftyp`, `moov`, `mdat` (index first). Because `moov`'s size depends only on `N` and the key-frame
count, build `moov` once with offset 0 to learn its size, then again with the real offset
`ftyp.size + moov.size + 8`. Frames must arrive in presentation order (no reordering); the recorder checks this.

## Appendix E. Camera planner, step by step (`src/v8/camera-plan.js`)

Angles in radians, distances in units (0.3 m), times in story seconds. `P` = `MFCamPlan.PARAMS`. "Clear" = the sight
model's `clearLine` with the floors placed where they are at that time.

1. **Samples.** `t_i = intro + i * P.dt` up to `total`. For each: the trolley pose (`MFMotion.pose`), its floor, `ride`
   (pose.lift != null), `still` (phase hold). The stack value `s(t)`: `auto` mode -> `MFMotion.glideAt`; `stacked` -> 1.
   World points through `MFMotion.world(..., s(t), up)`. The trolley point `L_i` is the pose 2 units up.
2. **Windows.** For every ride item `[t0, t1]` (its `t0` to its `t1`): the ride window is
   `[t0 - P.rideA, t1 + P.rideC]`. The rest of the path splits into floor windows.
3. **Look target** `c(t)`: the mean of the trolley's plan position at `t - P.avg, t - P.avg / 2, t, t + P.avg / 2,
   t + P.avg` (times clamped to the window), plus the look-ahead: `min(P.ahead, distance left on the current leg) *
   P.aheadShare` along the heading, averaged the same way. Then to world, 2 units up.
4. **Distance** `d(t)`: per step `clamp(longestLeg * 1.1, base, base * P.distMax)` with
   `base = step.dist * (stacked ? P.near : P.far)`; blended over 2 s (smootherstep) around each step boundary.
5. **Rigs.** `az_k = -PI + k * 2 PI / P.azN`, `pol` from `P.pols`. Eye of rig `r` at sample `i`:
   `c_i + d_i * (sin pol * sin az, cos pol, sin pol * cos az)`.
6. **Feasible** `F[i][r]`: the eye-to-`L_i` line is clear; the eye-to-trolley line 0.4 s later is clear; the angle
   between eye-to-`L_i` and eye-to-`c_i` is under `P.frame / 2` of the field of view both ways (vertical field of view
   `P.lens` degrees = 28; horizontal from the aspect).
7. **Costs.** Node cost `n(i, r) = P.wHouseAz * |wrap(az_r - P.houseAz)| + P.wPol * (index of pol_r in P.pols) +
   (F[i][r] ? 0 : 1000)`, plus 10000 when a pin covering `t_i` fixes another heading (more than `PI / P.azN` away) or
   another tilt (not the nearest `pol`). Change cost `x(r, r') = P.wCut + P.wTurn * |wrap(az_r - az_r')| +
   P.wTurn / 2 * |pol_r - pol_r'|`, plus 10000 when both samples lie inside one `hold` pin.
8. **Choose** per floor window by dynamic programming: `best[i][r] = n(i, r) + min over r' of (best[i - 1][r'] +
   (r' == r ? 0 : x(r', r)))`; backtrack from the cheapest final rig. Runs of the same rig are **shots**.
9. **Short shots.** A shot shorter than `P.minHold`: replace it by the rig of the shot before or after when every one
   of its samples is feasible there (cheaper one wins); otherwise keep it and mark it `forced`.
10. **Joins.** Between shots A and B meeting at `t_b`: `T = clamp(angle between them in degrees / P.blendRate,
    P.blendMin, P.blendMax)`; the blend runs over `[t_b - T / 2, t_b + T / 2]`, shortened to stay clear of the
    neighbouring joins (not under 1 s, else a cut). Inside it `u = smootherstep`; azimuth the short way; polar linear.
    Test every 0.1 s: all clear -> `blend`. Else try the same blend shifted by -0.5, +0.5, -1, +1, -1.5, +1.5, -2, +2 s.
    Else `over`: the same blend with `pol(u) = lerp(pol_A, pol_B, u) - (min(pol_A, pol_B) - 0.25) * sin(PI u)` (rises to
    a steep view in the middle). Else `cut` at the nearest `still` sample within 3 s of `t_b`, else at `t_b`; record
    the reason (`blocked by <first blocking box's floor>`).
11. **Rides.** Per ride window the three beats of 4.3.2, or the fallback; the ride azimuth from `rideAz` (T3.4). Join
    floor shot -> beat A: a normal join; A -> B: continuous by construction (same target path and azimuth at the
    boundary); B -> C: `cut`; C -> next floor shot: a normal join.
12. **Pose.** `pose(plan, input, t)`: find the shot or join containing `t` (binary search), take its rig (blended in a
    join), compute `c(t)` and `d(t)` (ride beats use their own target and distance rules), return
    `{ x, y, z: c(t), dist, az, pol, fov: P.lens, shot: index }`.
13. **Stats.** `hidden` = samples every 0.1 s whose final pose is not clear; `cuts`; `changes`; azimuth speed
    (degrees per story second) 95th percentile and maximum outside cuts; `ms`. `ok = hidden === 0`.

Tuning order when a path looks wrong: first pins on that step; then `P.wCut` (higher = fewer changes); then
`P.houseAz` / `P.housePol` (the owner's taste, question Q1); never the feasibility rule.

## Appendix F. Names inside the engine a coder needs

From the engine script of `v7.7.1` (and its source parts after M1). Line numbers are not given: search for the name.

| name | what it is |
|---|---|
| `S` | player state: `flow` (path index), `t` (story s), `playing`, `speed`, `view` (`2d` / `3d` / `auto`), `cam`, `stack` (0 side by side to 1 stacked), `stackUser`, `R` (rise 0 to 1), `c` (current camera: `x, y, z, dist, az, pol`), `quality`, `look`, `plan`, `labels` … |
| `D` | the tab's data: `nodes` (stops, units), `flows` (paths; after `buildFlow`: `items`, `total`, `E`), `devices`, `plates`, `center` (`CX`, `CY`), `elevators` |
| `RP`, `REP` | the layout data (`walls`, `columns`, `racks`, `machines`, `pallets`, `lifts`, `marks`) and the built replica (`meshes`: instanced meshes with `tags`, `rise`, `live`) |
| `PT_M` | metres per unit (0.3); `GAP` vertical distance between floors (units); `INTRO` 7 s |
| `W(x, y, s, up, out)` | plan point -> world point for stack `s`; `proj(v, out)` world -> screen pixels |
| `plates[key]` | the three.js group of a floor; moves with `glideX(s)`, `glideY(s)` |
| `buildSchedule`, `sampleSchedule`, `scheduleManualStops`, `buildFlow`, `lotPos`, `stepAt`, `F()` | motion (4.2) |
| `frameLot` | the trolley pose of this frame (`x, y, h, lift, seg, k, v, it`) |
| `setWant()` / `aim(...)` / `want` | compute the wanted camera for the current mode |
| `moveCam(dt)` | springs (`springFF`), sight rescue, writes `S.c`, `camera`, `cameraTarget` |
| `aisleAz`, `AZ_STEP`, `CALM`, `calmSeg`, `calmDist` | today's guided angle and distance choice (7.7.2 adds the calm rules) |
| `SIGHT` | `clearLine`, `choose`, `transitionPol`, `chasePol`, `ensure` (rescue), `warm`, `rebuild`, `reset`, `stats` (`tests`, `forced`, `blockedActual`, `rescued`, `unresolved`) |
| `cineShot`, `cineAz`, `CINE`, `glideAt` | the V3 ride shots (off) and the floor glide around rides |
| `tick(now)` / `frame(dt, time)` | the animation loop and one frame; `PREP`, `prepFrame` the preparing screen; `gov` the resolution governor |
| `resize()` | pixel ratio = quality factor (High 0.85) x `resolutionScale`; canvas and overlay sizes |
| `DEV` / `makeDEV()` | devices: instanced parts, gate wave shader (64 gates), toasts; `DEV.frame(cur, lp, dt, time)` |
| `v7Rebuild(o)` | rebuild flows, ribbons, gates, chips, cards, devices, sight after a Studio edit |
| `window.MF` | public surface: `S`, `D`, `RP`, `REP`, `W`, `proj`, `seek`, `play`, `pause`, `setFlow`, `setCam`, `setView`, `setSpeed`, `setQuality`, `setLook`, `stepAt`, `frame`, `lotPose(t)`, `schedule`, `sight`, `devices`, `camera` (`eye`, `target`, …), `perf` (metrics, `snapshot()`), `ready`, `prepared`, `x` (Studio internals) |
| `window.MFX` | the Studio: `doc`, `toScene`, `replaceScene`, `reloadLayout`, `commit`, `undo`, `redo`, `setEditor`, `setTab`, `select`, `flyTo`, `viewPreset`, `addKey`, `addCaption`, `evalDirector`, `startTake`, `rec`, `saveNow` … |
| `window.MFS` | the scene file manager: `scene`, `load`, `validate`, `save`, `saveAs`, `download`, `openFile` |
| `window.MFScene` | the scene core (`tools/v7/scene-core.js`) |
| `window.MF7` | what the preload decided: `id`, `scene`, `base`, `baseHash`, `source`, `baseReplica`, `lightErase`, `lightBox`, `error` |
