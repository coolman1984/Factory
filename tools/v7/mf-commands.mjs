// The agent CLI's command table and the current player stage. Read by tools/mf.mjs (help) and tools/v7/docs-check.mjs (docs/CLI.md).
export const STAGE = "7.7.2";   // the current player version (a stage of tools/build-v7.mjs; docs/CHANGELOG.md must have it)
export const COMMANDS = {
  help: ["", "this list"],
  validate: ["<scene.json> [...]", "check scene files against the layout: ids, joins, collisions, devices; prints every error with its place"],
  bake: ["[scene.json ...] [--out file]", "build the player with these scenes baked in (default: private/v7/scenes/*, out: the current player file)"],
  shots: ["<scene.json> [--out dir] [--only overview|stops|steps] [--path id --at s [--look x,y] [--distance m]]", "render named screenshots for self-review: overview, every stop, every step of every path; --at: one picture at that story second (looking at x,y metres, else the trolley)"],
  congestion: ["<scene.json> --path id [--picture]", "several trolleys (trolleys / headway): closest distance between them, when (story s), where (metres) and in which steps; --picture saves a shot of that moment"],
  play: ["<scene.json> [--path id] [--speed 3]", "play a path to its end in the real player: steps reached, time, page errors"],
  take: ["<scene.json> --path id [--from s] [--to s] [--speed 1] [--fps 30] [--cam director|guided|follow|chase] [--out file]", "export an exact-frame H.264 MP4 with installed ffmpeg/ffprobe; write a timing and freeze-check receipt beside it"],
  numbers: ["<scene.json> [--shift 8]", "distance, time and trips per shift of every path and step (the player's motion model)"],
  diff: ["<a.json> <b.json>", "what changed between two scenes, with distance / time deltas per path"],
  straighten: ["<scene.json> --path id [--step id]", "remove small jogs and square the legs (like the S key); keeps a step that would then collide"],
  route: ["<scene.json> --path id --step id", "auto-route one step around walls and racks and write it as exact points"],
  "fix-links": ["<scene.json>", "auto-route every step that no longer joins its neighbours (after moving stops or reordering)"],
  key: ["<scene.json> --path id (--at s | --step id[:start|arrive|leave]) [--look trolley|stop:id] [--distance m] [--heading deg] [--tilt deg] [--lens mm] [--ease smooth|linear|in|out|cut]", "add a director camera key"],
  caption: ["<scene.json> --path id (--from s --to s | --step id [--seconds n]) --title t [--text t] [--ar-title t] [--ar-text t] [--ko-title t] [--ko-text t] [--place lower|upper|center|left|right] [--style glass|cinema|banner|minimal]", "add a caption (English, Arabic, Korean)"],
  "layout-ref": ["", "write private/v7/LAYOUT_REFERENCE.md (floors, elevators, stops, devices, every wall/rack id)"],
  "docs-gen": ["", "rewrite the generated parts of the docs (field reference, CLI reference, keyboard map)"],
  "install-hooks": ["", "install the git pre-commit hook that runs docs-check"],
  "docs-check": ["", "fail if docs are out of date: schema fields, commands, keys, recipe examples, links, changelog"],
};
