# Trolleys

## What the owner sees
One trolley per path drives the steps: it speeds up and slows down smoothly on every leg (cruise speed 4 m/s unless a step sets
`speed`), turns on the spot at corners (0.3 s per quarter turn), waits `wait` seconds at each stop, stops 1.8 s at each scanner with
`stops: true` on its leg, and rides elevators (6 s). The trolley is drawn 1.4x real size (0.98 x 1.74 m) so it stays readable;
clearances are checked with that size.

## Several trolleys (congestion)
`paths[].trolleys` (1-12) and `paths[].headway` (seconds between starts): copies of the trolley follow the same path one headway
apart on the same timeline. The Studio's Numbers tab shows the closest distance between two moving trolleys; under 3 m they block
each other ("congestion"). Trips per shift multiply by the number of trolleys (without waiting for each other).

## A person (Studio)
Steps tab: Trolleys and Every (s) of the flow; Speed (m/s) and Wait (s) per step.

## An agent
```json
{ "id": "sample-1", "trolleys": 3, "headway": 12, "steps": [ ... { "id": "s3", "speed": 2.5, "wait": 2 } ] }
```
Check: `node tools/mf.mjs numbers <scene>` (trips per shift), `node tools/mf.mjs play <scene> --path <id>`; example
[../examples/trolleys.scene.json](../examples/trolleys.scene.json).
