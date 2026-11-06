# Material Flow Player: performance and look handoff

Status: implementation and synthetic verification complete; real-GPU acceptance and visual review remain with the lead. No commits. No files under `private/` or `dist/` were opened for inspection. The authorized build was run; it reads inputs and writes the offline artifact itself. Existing lead changes in routes and replica geometry were preserved.

## Evidence and findings by severity

### P0 — High misses the acceptance target; the main stall cause is not yet isolated

Owner-provided Intel Iris Xe / 1920×1080 baseline from `node tools/perf.mjs high 15`: High 24 fps average, p99 491 ms, worst 5349 ms; Medium 38 fps / worst 1977 ms; Low 67 fps / worst 1278 ms. These are baseline numbers supplied in the assignment, not results measured by this delegate.

I attempted that exact High command before edits. Chrome launch failed in this sandbox with `Error: spawn EPERM`, errno -4048, at `tools/perf.mjs:6`. Consequently there are no after-change GPU numbers, browser screenshots, or validated frame-time claims here. In particular, the <=22 ms median, <=50 ms p99, <=120 ms post-startup worst and <=250 ms switch budgets are **unverified**. No GPU bottleneck has been proved by an isolated timing experiment.

### P0 — Story time demonstrably discarded elapsed time

The original tick used `dt = Math.min(.1, raw)` for story advancement. A 5.349-second stall therefore advanced the story by at most 0.1 seconds. The new loop passes the full monotonic elapsed interval to `frame`; playback/seek reset its clock origin, and `frame(dt)` remains explicitly drivable for tests. No Date or wall-clock phase drives scene animation. Synthetic checks verified 1.25 seconds advances exactly 1.25, speed scaling, pause, and stopping at a step after a long frame.

### P1 — Recurring shadow and instance-buffer work: confirmed code paths, unmeasured GPU contribution

Originally a 4096×4096 PCF shadow map was dirtied each frame of rise and stack transitions. `REP.rise()` also rewrote all instance matrices. The player now installs the same sweep in the existing materials' vertex shaders and keeps the instance buffers immutable. Correct normals account for the Y scale. Synthetic checks using the real r170 material hooks verified both Standard and Basic shader injection, unchanged instance-buffer versions across rise, and the sampled sweep formula's equivalence to the original.

Default High uses no realtime sun shadow pass. `?shadows=1` opts into a 1536 map refreshed only after rise and stack settle; moving-object shadows are not continuously tracked in that optional mode. This mode is outside the default High performance claim and still needs visual review. Default floor shading uses a small cached analytic contact-light map; the lead's Blender soft shadows/AO replace it through the same uniform.

### P1 — Full-resolution multipass cost and post-chain rebuilds: confirmed allocations, stall attribution unproved

Original High used full-resolution GTAO (normal/depth geometry pass, 12 AO samples, 12 denoise samples), bloom and 4× multisampled half-float targets. `buildPost()` was called on quality changes and resize; disposing only EffectComposer also left pass-owned resources to dispose separately. Original auto-quality could enter this allocation/compile path after slow playback.

Default High now renders Studio/Blueprint directly with the existing MSAA renderer, Neutral tone mapping, PBR maps and cached environment. GTAO is removed. Night uses a single persistent non-MSAA HDR bloom/output chain at 3/4 display resolution. Quality switches and the interval governor reuse this chain; resize resizes it without recreating passes. The existing chain is retained at fixed size across quality switches. High keeps native display pixels with DPR capped at 1; Medium/Low use .8/.65. Automatic resolution reduction (.9, then .8) stays within the selected High material detail and respects a manual quality choice or pinned `?q=high`.

### P1 — First-use shader compilation and texture uploads: plausible stall source, now moved before playback

Original `setArt()` lazily drew 6 px/point plan art, uploaded it and marked floor materials for recompilation during look changes. It now uses six prebuilt/uploaded light/dark textures capped at 2048 on the long edge. `drawPlan` is lead-owned and still generates its original large temporary canvas during startup; that temporary is downsampled and released immediately. There is no plan drawing, texture creation or `needsUpdate` on a look switch.

`MF.ready` waits for original images, uploads their maps, compiles every look with both plan and PBR floors using `compileAsync` (or `compile`), renders them to a tiny offscreen target, and warms bloom/output shaders before scheduling the story loop. Startup work is recorded separately. A real driver can still have first-draw or resize stalls; this needs Chrome/GPU confirmation. Startup may take longer because work previously deferred into playback is now explicit.

### P2 — Per-frame DOM and material writes: confirmed, several suspects cleared

Original label placement assigned class names, text, display and transforms every frame and queried each label's text node repeatedly. Step card/list update and `scrollIntoView` were **already gated on a step change**, so those are cleared as every-frame offenders. The original play button HTML and formatted time were assigned every frame.

Label content/class updates now occur only on flow/step/control changes, text nodes are cached, invisible/unrelated nodes are skipped, and identical transforms/display values are not rewritten. Timeline/time/play updates are conditional; minimap runs at at most 10 Hz during playback and refreshes on flow changes. Dimming converges to its endpoint and stops writing materials. Paused movers stop uploading identical conveyor matrices. The synthetic integration harness verified **zero DOM writes over 20 settled paused frames**; this is a mutation count, not a browser timing measurement.

### P2 — Camera and movement instability / speed: confirmed implementation choices

The original guided camera varied azimuth and polar angle by step and added a live sinusoidal azimuth; a first-order chase then followed that moving target. Two analytic critically damped springs now control eye position and look target independently, preserving free-camera controls. Per-step angle oscillation is removed. A numerical check of the actual spring function verified 30 Hz, 60 Hz and one large step agree to <1e-12 for a fixed target. Moving-goal appearance still needs visual review.

The route duration's original 4.5-second maximum made long trips glide at arbitrary speed. Duration now uses 4 slide points/second (1.2 m/s average at the declared .3 m/point; smoothstep peaks at 1.8 m/s), without the upper cap. Timeline order/data remain unchanged. Ambient movers/conveyors use story time at .55 of their previous rate; a 2.6 m/s forklift becomes about 1.43 m/s. Lot and vehicle headings use nearby path samples instead of frame-history easing/snaps. Open or discontinuous routes can still jump at wrap; route geometry belongs to the lead.

## Changed files and reused work

- `src/player.js`: loop, shader rise hook, camera springs, conditional DOM/material/live updates, bounded cached post-processing, quality rules, startup warm-up, default/optional shadows and floor-light integration.
- `src/look.js`: `window.MFLook`, seeded cached albedo/roughness/normal maps for sealed concrete, painted steel, galvanised steel, cardboard, moulded plastic and wall panels; no packages, downloads, or CDN. Base maps are 128² except 256² concrete: 19 shared textures including white, about 1.69 MiB of base surface-map pixels before mipmaps. Contact-light fallback maps are separate, capped at 512 pixels on their long edge.
- `src/replica.js`: only the `MAT` declaration gains the `MFLook.replicaMaterials(T)` hook and retains its original fallback. All geometry, routes and CPU rise implementation remain lead-owned. Existing paint/metal/matte buckets use paint/galvanised/cardboard; plastic and wall finish factories are available for the lead's more specific geometry buckets. Matte is a shared bucket that also contains tyres/pallets; it cannot be perfectly classified within the MAT-only boundary.
- `tools/build.mjs` / `src/index.template.html`: inline look.js before replica/player, retaining one offline HTML; quality tooltip matches manual selection behavior. CSS unchanged.

Reused from Digital Factory: the long high-bay, cool-key, warm-rim studio panels from `plant/scene.js` (adapted into `MFLook.environment`), Neutral tone mapping, disabled automatic shadow refresh, the analytic soft contact-shade approach, `vfx/materials.js` finish values (steel .3-ish roughness / high metalness, matte plastic .62-ish, rough cardboard), and `vfx/perf.js` real-frame-interval signal, hold period and manual-quality guard. I read `vfx/look.js` disposal guidance; avoiding chain recreation removes the repeated pass-disposal problem. I did not import its grade/outline/DOF passes or the costlier physical material layers.

## Floor bake contract for the lead

`MF.setFloorLight(plateKey, textureOrDataURI)` returns a Promise. A THREE.Texture preserves its supplied color space; a data-URI image is treated as sRGB. White means fully lit; RGB multiplies the complete floor shading after lighting. The map covers exactly `D.plates[key].box`, left-to-right/top-to-bottom like plan art, using the plane's unscaled UVs. Concrete repeats separately at a 12 m tile (joints at 6 m). Setting a bake only replaces a uniform and uploads the new texture; it does not rebuild shaders or post passes. Replaced image textures owned by the hook are disposed; caller-owned THREE.Textures remain caller-owned.

For startup, set `window.MF_FLOOR_LIGHT = { E1: dataURI, "E2-1F": dataURI, "E2-2F": dataURI }` before player.js. The current builder does not package new Blender images; that integration remains with the lead. Await `MF.ready` before starting measurements. Baked floor lighting follows the plate when stacked; it is intended for the fully risen scene. Original and clean 2D plans remain available.

## Verification and next measurements

Completed: `node --check` for player/look/replica/build; `node tools/build.mjs` passed (offline artifact reported 1.3 MB at that check). A synthetic Node VM harness using the actual local Three.js r170 bundle and fabricated, non-company scene data passed startup/material hooks, immutable rise buffers, long-frame clock, speed, pause, step stop, one composer across all qualities/looks, zero settled idle DOM mutations, 2D/3D transitions, free camera, flow switching, bake hook, map sharing/color spaces and uncapped physical route duration. This harness mocks the renderer and canvas/DOM: it does **not** compile GLSL on a driver or validate pixels. Spring numerical and sweep-equivalence checks also passed. A further material check passed contact-map caching and its 512-pixel limit, bake UV/uniform injection, floor repeat, seeded byte-for-byte determinism and map sharing.

Required on the lead's permitted Chrome environment: rebuild after integration; run `node tools/test-player.mjs <shots-folder>` and `node tools/perf.mjs high 15` on Iris Xe. The supplied test-player uses SwiftShader, useful for behavior/screenshots but not GPU acceptance. Run a longer High session (new physical route durations mean 15 seconds covers mostly intro/first move), then explicitly switch all cameras, 2D/3D, original/replica, qualities and looks. Measure frame samples after the first 3 seconds; the supplied perf tool currently includes all samples and only waits a fixed 5 seconds rather than awaiting `MF.ready`. Do not infer post-startup acceptance from its aggregate alone.

Open `?q=high&profile=1` for `MF.perf`: a 600-entry interval ring, total frame count, shadow refresh count, rise/dim update counts, startup/look/quality event durations, and CPU stage totals/maxima (`scene-update`, `camera`, `render-submit`, `overlay-dom`). Call `MF.perf.reset()` after startup and `MF.perf.snapshot()` after the measurement window for p50/p99/worst/over-250 counts and renderer resource counts. The ring covers the latest 600 frames, so collect raw RAF samples separately for a longer complete run. CPU submission timing excludes deferred GPU work. `MF.perf.events` is bounded to 80 entries. Compare with raw RAF samples / GPU traces and screenshot Studio/Night/Blueprint before claiming the target. No final acceptance is claimed by this handoff.

## Doubts and remaining review

- Iris Xe timings and visual appearance are unknown in this sandbox; shader source and camera math checks cannot replace real Chrome.
- Cached contact lighting is an approximate fallback, not the final Blender bake. Default shadow cost is eliminated at the expense of accurate sun occlusion until that bake is integrated.
- PBR floor replaces plan art at rise .85 rather than cross-fading; review the intro transition and texture scale close up.
- New route timing makes the story substantially longer. It is deliberately physical rather than capped, and all speed controls still apply.
- Camera springs are exact for stationary goals; real routes and stacked-floor transitions still need motion review. Vehicle route seams remain lead-owned.
- Plan drawing still has a 6 px/point startup transient because this delegate may only edit replica's MAT block. Reducing its source resolution is an optional follow-up for the lead, guided by startup timings.
- Native-pixel Studio High should be much cheaper without GTAO/shadow passes, but texture and geometry bandwidth may still dominate; no performance outcome is assumed.
