// Converts the V6 player's data (the owner's 10 paths on 4 tabs) into scene files and proves the round trip:
// scene -> internal gives back the same stops, paths and devices as V6 (to 1e-6 frame units).
// Usage: node tools/v7/export-scenes.mjs [player=dist/Material_Flow_Player_v6.html] [outDir=private/v7/scenes]
import { mkdirSync, writeFileSync } from "node:fs";
import { loadSceneCore, readProjects, layoutFor } from "./scene-node.mjs";

const [player = "dist/Material_Flow_Player_v6.html", outDir = "private/v7/scenes"] = process.argv.slice(2);
const SC = loadSceneCore(), P = readProjects(player);
mkdirSync(outDir, { recursive: true });
let bad = 0;
const near = (a, b) => Math.abs(a - b) < 1e-6;
for (const tab of Object.keys(P)) {
  const data = P[tab].data, scene = SC.fromInternal(tab, data);
  scene.title = data.slide && data.slide.title || tab;
  writeFileSync(`${outDir}/${tab}.scene.json`, JSON.stringify(scene, null, 1));
  // round trip
  const back = SC.toInternal(JSON.parse(JSON.stringify(scene)), layoutFor(P, tab)).data, idMap = {};
  const orig = Object.values(data.nodes); Object.values(back.nodes).forEach((n, i) => { idMap[orig[i].id] = n.id; if (!near(n.x, orig[i].x) || !near(n.y, orig[i].y) || n.plate !== orig[i].plate || n.kind !== orig[i].kind) { bad++; console.log(tab, "stop differs", orig[i].id); } });
  data.flows.forEach((f, fi) => f.steps.forEach((s, si) => {
    const b = back.flows[fi].steps[si], diff = [];
    if (idMap[s.node] !== b.node) diff.push("node"); if ((s.dwell ?? null) !== (b.dwell ?? null)) diff.push("dwell"); if (s.title !== b.title || (s.what || "") !== b.what || s.mode !== b.mode || !near(s.dist, b.dist)) diff.push("text/mode/dist");
    if (Array.isArray(s.path) !== Array.isArray(b.path) || (Array.isArray(s.path) && (s.path.length !== b.path.length || s.path.some((p, k) => !near(p[0], b.path[k][0]) || !near(p[1], b.path[k][1]))))) diff.push("path");
    if (!!s.lift !== !!b.lift || (s.lift && s.elevator !== b.elevator)) diff.push("lift");
    if (diff.length) { bad++; console.log(tab, f.id, "step", si + 1, "differs:", diff.join(", ")); }
  }));
  data.devices.forEach((d, i) => {
    const b = back.devices[i], diff = [];
    for (const k of ["type", "kind", "plate", "label", "done", "axis", "fill"]) if ((d[k] ?? null) !== (b[k] ?? null) && !(k === "fill" && d.type !== "pc")) diff.push(k);
    if (!near(d.x, b.x) || !near(d.y, b.y)) diff.push("x/y"); if (d.type === "pc" && (d.face || "e") !== b.face) diff.push("face");
    if (d.type === "rfid-manual") { if (!near(d.lane[0], b.lane[0]) || !near(d.lane[1], b.lane[1]) || !!d.routeBound !== !!b.routeBound || (d.node != null) !== (b.node != null)) diff.push("lane/stop"); }
    if ((d.k || 2.4) !== (b.k || 2.4) && d.type !== "rfid-auto") diff.push("k");
    if (d.type === "pc" && (d.node != null ? idMap[d.node] : null) !== (b.node ?? null)) diff.push("serves");
    if (diff.length) { bad++; console.log(tab, "device", i, d.label, "differs:", diff.join(", ")); }
  });
  console.log(`${tab}: ${scene.stops.length} stops, ${scene.devices.length} devices, ${scene.paths.length} paths, ${scene.paths.reduce((n, p) => n + p.steps.length, 0)} steps -> ${outDir}/${tab}.scene.json`);
}
if (bad) { console.log(`ROUND TRIP FAILED: ${bad} difference(s)`); process.exit(1); }
console.log("Round trip OK: every stop, step, path point and device comes back exactly");
