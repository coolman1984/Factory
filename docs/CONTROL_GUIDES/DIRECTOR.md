# Director: camera keys, captions, video takes

Everything is on the **story timeline** of a path: seconds from the start, intro included (the intro is 7 s; step times:
`node tools/mf.mjs numbers <scene>`). Shots, captions and takes play the same at every speed and every seek.

## Camera keys
The director camera glides through the keys (Catmull-Rom on position, eased in time). `ease` of a key = how the camera arrives:
smooth, linear, in, out, or cut (jump). A key with `follow: true` rides with the trolley.
- Agent: `node tools/mf.mjs key <scene> --path P --step S:arrive --look trolley --distance 40 --heading 45 --tilt 35 --lens 48`
  (or `--at 28.2`, `--look stop:<id>` for a fixed point on the 1st floor). Heading = the direction the camera looks (0 north,
  clockwise); tilt 90 = straight down.
- Person: frame the view (pad / mouse), Director tab + Key here (K), Trolley-locked key (Shift+K), Record camera move (J); drag
  diamonds on the Camera lane to retime.

## Captions
`director{path}.caps[]`: `t0`, `t1` (seconds), `title`, `text` (a string or `{ "en", "ar", "ko" }`; missing languages fall back to
English; Arabic is shown right to left), `pos`, `style`, `size`. The shown language is `studio.lang`.
- Agent: `node tools/mf.mjs caption <scene> --path P --step S --seconds 4 --title "Buffer" --ar-title "منطقة الانتظار" --text "..." --ar-text "..."`.
- Person: Director tab, + Caption here (C), language select, text fields; drag the bars on the Text lane.
Step cards (the explanation in the player bar) are the steps' `title` and `text`.

## Video takes
`takes[]` saves a recipe: path, from / to, speed, camera, captions / card / labels, quality. Recording replays the timeline and
saves **MP4 (H.264)** when the browser supports it (Chrome does), else WebM.
- Agent: `node tools/mf.mjs take <scene> --path P [--from 0 --to 30 --speed 1 --cam director] --out film.mp4`.
- Person: Director tab, Video takes, ● Record video.
Example with keys, a three-language caption and a take: [../examples/director.scene.json](../examples/director.scene.json).
