// Writes the layout reference an agent needs next to the manual: per tab, the floors with their extents, the elevators with
// both landings, the stops and devices of the built-in scene, and every built-in layout object id (rack:12 ...) with its place.
// Company layout data: the output goes to private/ and is never committed.
// Usage: node tools/v7/layout-reference.mjs [player=dist/Material_Flow_Player_v7.1.html] [out=private/v7/LAYOUT_REFERENCE.md]
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { loadSceneCore, readProjects, layoutFor } from "./scene-node.mjs";

const [player = "dist/Material_Flow_Player_v7.1.html", out = "private/v7/LAYOUT_REFERENCE.md"] = process.argv.slice(2);
const SC = loadSceneCore(), P = readProjects(player), m = (u) => (u * 0.3).toFixed(2);
let md = `# Layout reference (generated, private)\n\nFrom \`${player}\` on ${new Date().toISOString().slice(0, 10)}. Metres, plan frame (x right, y down). Regenerate with \`node tools/v7/layout-reference.mjs\`.\n`;
for (const tab of Object.keys(P)) {
  const L = layoutFor(P, tab); SC.stampLayout(L.replica);
  md += `\n## ${tab} (${P[tab].tab || tab})\n\n### Floors\n\n| floor | label | x from | x to | y from | y to |\n|---|---|---|---|---|---|\n`;
  for (const [k, p] of Object.entries(L.plates)) { const z = p.zone || [p.box[0], p.box[1], p.box[0] + p.box[2], p.box[1] + p.box[3]]; md += `| ${k} | ${p.label || ""} | ${m(z[0])} | ${m(z[2])} | ${m(z[1])} | ${m(z[3])} |\n`; }
  md += `\n### Elevators\n\n| elevator | lower landing (floor, x, y) | upper landing (floor, x, y) |\n|---|---|---|\n`;
  for (const e of L.elevators) md += `| ${e.label} | ${e.lowPlate}, ${m(e.low[0])}, ${m(e.low[1])} | ${e.highPlate}, ${m(e.high[0])}, ${m(e.high[1])} |\n`;
  if (!L.elevators.length) md += `| (none) | | |\n`;
  const f = `private/v7/scenes/${tab}.scene.json`;
  if (existsSync(f)) {
    const s = JSON.parse(readFileSync(f, "utf8"));
    md += `\n### Stops in the built-in scene\n\n| id | name | floor | x | y | symbol |\n|---|---|---|---|---|---|\n` + s.stops.map((q) => `| ${q.id} | ${q.name} | ${q.floor} | ${q.x} | ${q.y} | ${q.symbol} |`).join("\n") + "\n";
    md += `\n### Devices in the built-in scene\n\n| id | type | floor | position | label |\n|---|---|---|---|---|\n` + s.devices.map((d) => `| ${d.id} | ${d.type} | ${d.floor} | ${d.at ? d.at.join(", ") : d.x + ", " + d.y} | ${d.label} |`).join("\n") + "\n";
  }
  md += `\n### Layout objects (targets for layoutEdits)\n\n| id | floor | x from | x to | y from | y to |\n|---|---|---|---|---|---|\n`;
  for (const [k, name] of [["walls", "wall"], ["columns", "column"], ["racks", "rack"], ["machines", "machine"], ["pallets", "pallet"]]) for (const o of L.replica[k] || []) {
    const r = k === "walls" ? [Math.min(o.a[0], o.b[0]), Math.min(o.a[1], o.b[1]), Math.max(o.a[0], o.b[0]), Math.max(o.a[1], o.b[1])] : k === "columns" ? [o.p[0], o.p[1], o.p[0], o.p[1]] : [o.x, o.y, o.x + o.w, o.y + o.h];
    md += `| ${name}:${o._oid} | ${o.plate} | ${m(r[0])} | ${m(r[2])} | ${m(r[1])} | ${m(r[3])} |\n`;
  }
}
writeFileSync(out, md); console.log(`${out}: ${(md.length / 1024).toFixed(0)} KB`);
