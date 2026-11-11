# The agent CLI: `tools/mf.mjs`

One tool for everything an agent does with a scene. Run from the repository root with Node (no install):
`node tools/mf.mjs <verb> ...`. Output is short and exact; exit code 0 = OK, 1 = a problem (every problem is printed as
`ERROR <where>: <what>`). Verbs that change a scene validate it first and write it back only when it is valid.

The player file the tools use is `dist/Material_Flow_Player_v<stage>.html` (the stage is `STAGE` in `tools/v7/mf-commands.mjs`); `--player <file>`
uses another one. Browser verbs (`shots`, `play`, `take`) bake a temporary player into `dist/test/` and drive headless Google Chrome.

## Reference

<!-- GENERATED:cli (mf docs-gen; do not edit by hand) -->
### `mf help`

```
node tools/mf.mjs help
```

this list.

### `mf validate`

```
node tools/mf.mjs validate <scene.json> [...]
```

check scene files against the layout: ids, joins, collisions, devices; prints every error with its place.

### `mf bake`

```
node tools/mf.mjs bake [scene.json ...] [--out file]
```

build the player with these scenes baked in (default: private/v7/scenes/*, out: the current player file).

### `mf shots`

```
node tools/mf.mjs shots <scene.json> [--out dir] [--only overview|stops|steps]
```

render named screenshots for self-review: overview, every stop, every step of every path.

### `mf play`

```
node tools/mf.mjs play <scene.json> [--path id] [--speed 3]
```

play a path to its end in the real player: steps reached, time, page errors.

### `mf take`

```
node tools/mf.mjs take <scene.json> --path id [--from s] [--to s] [--speed 1] [--cam director|guided|chase] [--out file]
```

record a video take (MP4 when the browser supports it, else WebM).

### `mf numbers`

```
node tools/mf.mjs numbers <scene.json> [--shift 8]
```

distance, time and trips per shift of every path and step (the player's motion model).

### `mf diff`

```
node tools/mf.mjs diff <a.json> <b.json>
```

what changed between two scenes, with distance / time deltas per path.

### `mf straighten`

```
node tools/mf.mjs straighten <scene.json> --path id [--step id]
```

remove small jogs and square the legs (like the S key); keeps a step that would then collide.

### `mf route`

```
node tools/mf.mjs route <scene.json> --path id --step id
```

auto-route one step around walls and racks and write it as exact points.

### `mf fix-links`

```
node tools/mf.mjs fix-links <scene.json>
```

auto-route every step that no longer joins its neighbours (after moving stops or reordering).

### `mf key`

```
node tools/mf.mjs key <scene.json> --path id (--at s | --step id[:start|arrive|leave]) [--look trolley|stop:id] [--distance m] [--heading deg] [--tilt deg] [--lens mm] [--ease smooth|linear|in|out|cut]
```

add a director camera key.

### `mf caption`

```
node tools/mf.mjs caption <scene.json> --path id (--from s --to s | --step id [--seconds n]) --title t [--text t] [--ar-title t] [--ar-text t] [--ko-title t] [--ko-text t] [--place lower|upper|center|left|right] [--style glass|cinema|banner|minimal]
```

add a caption (English, Arabic, Korean).

### `mf layout-ref`

```
node tools/mf.mjs layout-ref
```

write private/v7/LAYOUT_REFERENCE.md (floors, elevators, stops, devices, every wall/rack id).

### `mf docs-gen`

```
node tools/mf.mjs docs-gen
```

rewrite the generated parts of the docs (field reference, CLI reference, keyboard map).

### `mf install-hooks`

```
node tools/mf.mjs install-hooks
```

install the git pre-commit hook that runs docs-check.

### `mf docs-check`

```
node tools/mf.mjs docs-check
```

fail if docs are out of date: schema fields, commands, keys, recipe examples, links, changelog.
<!-- /GENERATED:cli -->
