// Node loader for the vendored Factory Engine and the V8.1 engine bridge (the same files the player runs).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadMotionCore } from "../v7/scene-node.mjs";

const SRC = new URL("../../src/v8/engine/", import.meta.url);
const sandbox = () => ({ module: { exports: {} }, console, Math, JSON, Object, Array, Map, Set, WeakMap, Number, String, Error, Infinity, NaN, Symbol });
export function loadEngine() { const ctx = sandbox(); vm.runInNewContext(readFileSync(new URL("factory-engine.js", SRC), "utf8"), ctx, { filename: "factory-engine.js" }); return ctx.module.exports; }
export function loadBridge(MC = loadMotionCore(), FE = loadEngine()) {
  const ctx = sandbox(); vm.runInNewContext(readFileSync(new URL("engine-bridge.js", SRC), "utf8"), ctx, { filename: "engine-bridge.js" });
  return { MC, FE, bridge: ctx.module.exports.makeBridge(MC, FE) };
}
// The player's elevator choice for a path (same rule as the motion core's numbers()).
export function elevatorFor(flow, elevators) { const s = flow.steps.find(x => x.lift); return (s && elevators.find(e => e.label === s.elevator)) || elevators[0] || null; }
