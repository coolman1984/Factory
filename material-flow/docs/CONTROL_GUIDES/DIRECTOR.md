# Director: camera keys, captions, video takes

Everything is on the **story timeline** of a path: seconds from the start, intro included (the intro is 7 s; step times:
`node tools/mf.mjs numbers <scene>`). Shots, captions and takes play the same at every speed and every seek.

## Camera keys
The director camera interpolates between the two endpoint poses, bounded by those endpoints; distance interpolates in log
space and heading takes the shortest arc. `ease` of a key = how the camera arrives: smooth (smootherstep), linear, in, out,
or cut (jump). A key with `follow: true` rides with the trolley. Both follow endpoints use the trolley at the evaluated story
time, so equal offsets stay locked at any playback speed. There is no additional director spring after evaluation.
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
`takes[]` saves a recipe: path, from / to, speed, camera, captions / card / labels, quality.
- Agent: `node tools/mf.mjs take <scene> --path P [--from 0 --to 30 --speed 1 --fps 30 --cam director] --out film.mp4`.
  The CLI warms the renderer, pauses the normal animation loop and renders one explicit story timestamp per output frame.
  It pipes those frames to **already installed ffmpeg/ffprobe** for H.264 MP4; it installs nothing. The output length is
  `(to - from) / speed`; that duration times fps must be an integer. The adjacent `.mp4.json` receipt contains decoded frame
  count, duration, timestamp samples and freeze checks. A repeated moving image or decoded moving freeze fails the export.
- Person: Director tab, Video takes, ● Record video. This remains a real-time browser recording (MP4 when supported,
  otherwise WebM). The camera and compositor warm before the recorder and story playback start together. A slow GPU can
  still affect real-time capture; the CLI frame export is the checked route for exact duration.

The current canvas compositor handles caption direction explicitly, but CSS gradients and multi-line titles still differ
from the live overlay. Literal English captions in an Arabic-selected take can inherit RTL punctuation; check simultaneous-language output.
Native Arabic visual acceptance and the planned browser encoder remain separate work.
Example with keys, a three-language caption and a take: [../examples/director.scene.json](../examples/director.scene.json).
