// Node helpers for the scene core: load tools/v7/scene-core.js (the same file the player embeds) and read the built-in layout of
// every tab from a player HTML file (its project data line).
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

export function loadSceneCore() {
  const ctx = { module: { exports: {} }, Math, JSON, Object, Array, Float32Array, Int32Array, Uint8Array, Infinity, isFinite, String, Number };
  vm.runInNewContext(readFileSync(new URL("./scene-core.js", import.meta.url), "utf8"), ctx, { filename: "scene-core.js" });
  return ctx.module.exports;
}
export function readProjects(playerFile) {
  if (!playerFile && existsSync(new URL("../../private/v8/base/projects.json", import.meta.url))) return JSON.parse(readFileSync(new URL("../../private/v8/base/projects.json", import.meta.url), "utf8"));
  playerFile ||= new URL("../../dist/Material_Flow_Player_v7.7.2.html", import.meta.url);
  const html = readFileSync(playerFile, "utf8"), a = html.indexOf("var P = {"), end = html.indexOf("\n", a);
  if (a < 0) throw new Error(playerFile + ": no project data");
  const line = html.slice(a, end), close = line.lastIndexOf("}");
  return JSON.parse(line.slice("var P = ".length, close + 1));
}
// a fresh built-in layout of one tab (independent copy)
export function layoutFor(P, project) {
  const p = P[project]; if (!p) throw new Error(`unknown project ${project} (tabs: ${Object.keys(P).join(", ")})`);
  const replica = JSON.parse(JSON.stringify(p.replica));
  return { project, plates: p.data.plates, elevators: p.data.elevators || (p.data.elevator ? [p.data.elevator] : []), replica };
}

export function loadMotionCore() { const ctx={module:{exports:{}},Math,JSON,Object,Array,Float64Array,WeakMap};vm.runInNewContext(readFileSync(new URL("../../src/v8/motion-core.js",import.meta.url),"utf8"),ctx,{filename:"motion-core.js"});return ctx.module.exports; }
