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
node tools/mf.mjs shots <scene.json> [--out dir] [--only overview|stops|steps] [--path id --at s [--look x,y] [--distance m]]
```

render named screenshots for self-review: overview, every stop, every step of every path; --at: one picture at that story second (looking at x,y metres, else the trolley).

### `mf congestion`

```
node tools/mf.mjs congestion <scene.json> --path id [--picture]
```

several trolleys (trolleys / headway): closest distance between them, when (story s), where (metres) and in which steps; --picture saves a shot of that moment.

### `mf play`

```
node tools/mf.mjs play <scene.json> [--path id] [--speed 3]
```

play a path to its end in the real player: steps reached, time, page errors.

### `mf take`

```
node tools/mf.mjs take <scene.json> --path id [--from s] [--to s] [--speed 1] [--fps 30] [--cam director|guided|follow|chase] [--out file]
```

export an exact-frame H.264 MP4 with installed ffmpeg/ffprobe; write a timing and freeze-check receipt beside it.

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

## Things to know (from the agent proof runs)

- **`mf bake` without `--out` rewrites the owner's current player** (`dist/Material_Flow_Player_v<stage>.html`). Only do that
  for the owner's real scenes in `private/v7/scenes/`. For a copy, a test or a proof, always pass `--out dist/test/<name>.html`.
- **`shots`, `play` and `take` write a temporary player** `dist/test/mf-<tab>.html` (overwritten each time; safe to ignore). It
  contains your scene for that tab and `private/v7/scenes/*` for the other tabs.
- **Play time vs `numbers` time:** `play` reports story time, which starts with an intro of about 7 s (the camera rises and
  the first card shows) before the trolley moves. `numbers` is the trolley's own time (no intro). Director keys and captions
  use story time; `mf key --step` / `mf caption --step` convert for you.
- **Manual scans in `numbers`:** a scanner with `stops: true` on a leg adds its 1.8 s stop inside that step's time; there is
  no separate line for it.
- **Seeing a moment between stops:** use `mf shots <scene> --path id --at <s> [--look x,y]` for a picture at story second s,
  or record a short clip with `mf take <scene> --path id --from <s> --to <s+4>`.
- **Congestion is a sampled plan-distance demonstration:** floors are not separated and trolleys do not yield. If headway
  exceeds playback duration, there is no simultaneous pair to report. Do not use this as an accepted capacity simulation.
- **`private/v7/LAYOUT_REFERENCE.md` describes the built-in scenes** at the time it was written; your scene's stops may have
  moved. The scene file is the truth for stops; the reference is for walls, racks, elevators and floor extents.
- **Names:** ids are lower-case with dashes, `<tab>-<what>` for paths (`inj2-kit-elev5`) and `<type>-<where>` for devices
  (`scanner-kitting-elev5`); path names start with the next number and ` · ` (`3 · Kitting to Elev 5`).
- **Proof or scratch copies** (anything outside `private/v7/scenes/` and `docs/examples/`) need no changelog or lessons entry;
  the rule "update docs, changelog and lessons in the same commit" applies to changes the lead commits.
