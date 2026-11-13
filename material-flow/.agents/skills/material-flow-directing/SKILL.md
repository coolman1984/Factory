---
name: material-flow-directing
description: Direct Material Flow films - camera keys (shots), captions in English / Arabic / Korean, video takes (MP4), choosing timing from the story steps. Use when the owner asks for a film, a shot, a caption, a translation on screen or a video file.
---

# Directing

Read [docs/CONTROL_GUIDES/DIRECTOR.md](../../../docs/CONTROL_GUIDES/DIRECTOR.md) and recipes 7-9 in [docs/RECIPES.md](../../../docs/RECIPES.md).

1. Timing: `node tools/mf.mjs numbers <scene>` gives each step's seconds; story time starts with a 7 s intro. Use `--step <id>`
   (start / arrive / leave) instead of computing seconds yourself.
2. Shots: `node tools/mf.mjs key <scene> --path P --step S:arrive --look trolley --distance 40 --heading 45 --tilt 35`. Two or more
   keys make a move; `--ease cut` jumps. `--look stop:<id>` only for 1st-floor stops (the 2nd floor moves during rides).
3. Captions: `node tools/mf.mjs caption <scene> --path P --step S --seconds 4 --title ... --ar-title ... --ko-title ... --text ...`.
   Show a language: `"studio": { "lang": "ar" }` in the scene.
4. Film: `node tools/mf.mjs take <scene> --path P --from 0 --to 20 --speed 1 --cam director --out dist/test/<name>.mp4`
   (20 s of film = `(to - from) / speed`). MP4 (H.264) in Chrome; it plays in PowerPoint.
5. Check: `node tools/mf.mjs shots <scene> --only steps`; the take command prints type, size and length.
6. Report the file path, length, camera, languages and anything you could not do. Arabic and Korean texts should be checked by a
   native speaker (the owner checks Arabic; a Korean colleague checks Korean): say so.
