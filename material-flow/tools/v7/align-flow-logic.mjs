// One-time data alignment (owner 2026-11-11, images "map-1F-latest" / tables "Inhouse Material & Logistics flow"):
// name every operation object by the owner's scan table and add the missing ones at the owner's map marks.
// Scan table (4 scans per process): 1 Prod. Result (Input) [no scan], 2 Trolley Mapping, 3 Prod. Result (Final) / GR,
// 4 BIN Allocation, 5 TO Mapping [no scan] / 6 TO G/I (the square mark 5), hexagon = Quality Inspection.
// Usage: node tools/v7/align-flow-logic.mjs <scenes dir>   (idempotent; validate afterwards)
import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2] || "private/v7/scenes";
const OPS = {
  input: { label: "1 Prod. Result (Input)", done: "Item slip printed" },
  final: { label: "3 Prod. Result (Final) / GR", done: "Final scan / GR done" },
  mapping: { label: "5 TO Mapping / GI", done: "TO mapped, goods issued" },
  quality: { label: "Quality Inspection", done: "Checked" },
  trolley: { label: "2 Trolley Mapping", done: "Trolley mapped" },
  bin: { label: "4 BIN Allocation", done: "BIN allocated" },
};
const load = (t) => JSON.parse(readFileSync(`${dir}/${t}.scene.json`, "utf8")), save = (t, s) => writeFileSync(`${dir}/${t}.scene.json`, JSON.stringify(s, null, 2) + "\n");
const setOp = (d, op) => { d.label = OPS[op].label; d.done = OPS[op].done; };
const dev = (s, id) => s.devices.find((d) => d.id === id);
const upsert = (s, d) => { const i = s.devices.findIndex((q) => q.id === d.id); if (i >= 0) s.devices[i] = d; else s.devices.push(d); };
for (const t of ["inj1", "inj2", "eps", "press"]) {
  const s = load(t);
  for (const d of s.devices) {
    if (d.type === "pc" && d.kind === "result") setOp(d, /item-slip/.test(d.serves || "") ? "input" : "final");
    if (d.type === "pc" && d.kind === "mapping") setOp(d, "mapping");
    if (d.type === "pc" && d.kind === "quality") setOp(d, "quality");
  }
  if (t === "inj1") {
    setOp(dev(s, "gate-auto-rfid-gate"), "trolley");                         // between marks 1 and 3 on the machine aisle (auto point)
    setOp(dev(s, "scanner-manual-rfid-scan"), "bin");                        // the diamond 4 before Inj. W/H
    Object.assign(dev(s, "pc-quality-pc"), { x: 44, y: 194.19, heading: 270 });   // the hexagon (nearest clean spot found by tools/v7/free-spot.mjs; was 11 m south)
  }
  if (t === "inj1" || t === "inj2") {   // the diamond 4 at Umbrella W/H: BIN allocation during the wait at the Umbrella stop
    upsert(s, { id: "scanner-bin-umbrella", type: "scanner", floor: "1F", at: [143.55, 178.65], stand: [143.55, 180.15], stop: "umbrella", size: 2.4, label: OPS.bin.label, done: OPS.bin.done });
  }
  if (t === "inj2") Object.assign(dev(s, "pc-quality-pc"), { x: 197.9, y: 149.4 });   // the purple hexagon east of INJ 2 Item Slip (was 15 m east)
  if (t === "press") {   // the dark-blue square 5 of Press Bare (TO Mapping / GI) had no PC; beside the lane at y 181.35
    upsert(s, { id: "pc-to-mapping-gi-bare", type: "pc", kind: "mapping", floor: "1F", x: 219.3, y: 184.2, heading: 0, size: 2.4, label: OPS.mapping.label, done: OPS.mapping.done, color: "#1F4E9E" });
  }
  // 2nd floor (owner's "map-2F-latest"): BIN allocation diamonds
  if (t === "eps") upsert(s, { id: "scanner-bin-2f-wh", type: "scanner", floor: "2F", at: [359.25, 38.25], stand: [359.25, 36.6], stop: "2f-wh", size: 2.4, label: OPS.bin.label, done: OPS.bin.done });
  if (t === "press" && process.env.MF_BIN_2F) {   // PENDING (needs clean spots, tools/v7/free-spot.mjs): two green diamonds of Press Assy on 2F; placed relative to the nearest stops on the map (non-stopping scan points)
    if (!dev(s, "scanner-bin-assy-a")) upsert(s, { id: "scanner-bin-assy-a", type: "scanner", floor: "2F", at: [366.6, 211.4], stand: [366.6, 212.6], stops: false, size: 2.4, label: OPS.bin.label, done: OPS.bin.done });
    if (!dev(s, "scanner-bin-assy-b")) upsert(s, { id: "scanner-bin-assy-b", type: "scanner", floor: "2F", at: [441, 281], stand: [441, 282.2], stops: false, size: 2.4, label: OPS.bin.label, done: OPS.bin.done });
  }
  save(t, s); console.log("aligned " + t);
}
