// Node loader for the vendored Factory Engine and the V8.1 engine bridge (the same files the player runs).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadMotionCore } from "../v7/scene-node.mjs";

const SRC = new URL("../../src/v8/engine/", import.meta.url);
// The files run in this realm (not a vm sandbox): a sandbox's global lookups made long shift runs several times slower.
const load = file => { const module = { exports: {} }; vm.runInThisContext("(function (module) {" + readFileSync(new URL(file, SRC), "utf8") + "\n})", { filename: file })(module); return module.exports; };
export function loadEngine() { return load("factory-engine.js"); }
export function loadBridge(MC = loadMotionCore(), FE = loadEngine()) {
  return { MC, FE, bridge: load("engine-bridge.js").makeBridge(MC, FE) };
}
// The player's elevator choice for a path (same rule as the motion core's numbers()).
export function elevatorFor(flow, elevators) { const s = flow.steps.find(x => x.lift); return (s && elevators.find(e => e.label === s.elevator)) || elevators[0] || null; }
