import {readFileSync} from "node:fs";
export const safe = js => js.replace(/<\/script/gi, "<\\/script");
export function projectData(html) { const a=html.indexOf("var P = {"),e=html.indexOf("\n",a),line=html.slice(a,e);if(a<0)throw new Error("no project data");return JSON.parse(line.slice(8,line.lastIndexOf("}")+1)); }
export function buildParts(projects,bakeFiles) {
const bundle = { format: "mf-scene-bundle", projects: {} };
for (const f of bakeFiles) { const o = JSON.parse(readFileSync(f, "utf8")); if (o.format !== "mf-scene" || !o.project) throw new Error(`${f}: not a scene file`); if (Object.hasOwn(bundle.projects, o.project)) throw new Error(`${f}: duplicate baked project ${o.project}`); bundle.projects[o.project] = o; }
// walls that V4 had and this player does not (V6 removed the rooms beside Kitting): their shadows are baked into the floor light
// and get repainted at load. Rooms = clusters of touching removed walls.
const lightErase = {};
{
  const v4 = JSON.parse(readFileSync("private/v5/P-v4.json", "utf8")), cur = projects;
  for (const tab of Object.keys(cur)) {
    if (!v4[tab]) continue; const key = (w) => w.plate + ":" + w.a.join(",") + ":" + w.b.join(","), now = new Set(cur[tab].replica.walls.map(key));
    const gone = v4[tab].replica.walls.filter((w) => !now.has(key(w))).map((w) => ({ plate: w.plate, r: [Math.min(w.a[0], w.b[0]) - .75, Math.min(w.a[1], w.b[1]) - .75, Math.max(w.a[0], w.b[0]) + .75, Math.max(w.a[1], w.b[1]) + .75] }));
    const groups = [];
    for (const g of gone) { const hit = groups.find((q) => q.plate === g.plate && g.r[0] <= q.r[2] + 2 && g.r[2] >= q.r[0] - 2 && g.r[1] <= q.r[3] + 2 && g.r[3] >= q.r[1] - 2); if (hit) hit.r = [Math.min(hit.r[0], g.r[0]), Math.min(hit.r[1], g.r[1]), Math.max(hit.r[2], g.r[2]), Math.max(hit.r[3], g.r[3])]; else groups.push({ plate: g.plate, r: g.r.slice() }); }
    for (const q of groups) ((lightErase[tab] ||= {})[q.plate] ||= []).push(q.r.map((v) => +v.toFixed(2)));
  }
}
// floor-light boxes: the V4 extent each bake was made for; a plate that grew since (V6: INJ 2 2F + Press 2F picture, +48)
// gets the source tab's bake under the added area
const lightBox = {};
{
  const v4 = JSON.parse(readFileSync("private/v5/P-v4.json", "utf8")), cur = projects;
  const ext = (pics) => pics.reduce((a, p) => [Math.min(a[0], p.x), Math.min(a[1], p.y), Math.max(a[2], p.x + p.w), Math.max(a[3], p.y + p.h)], [1e9, 1e9, -1e9, -1e9]);
  for (const tab of Object.keys(cur)) for (const k of Object.keys(cur[tab].data.plates)) {
    if (!v4[tab] || !v4[tab].data.plates[k]) continue; const a = ext(v4[tab].data.plates[k].pics), b = ext(cur[tab].data.plates[k].pics);
    if (a.every((v, i) => Math.abs(v - b[i]) < .01)) continue;
    const e = { box: a, ext: [] };
    if (tab === "inj2" && k === "2F" && cur.press) { const pb = ext(v4.press.data.plates["2F"].pics), dx = 684 - 636; e.ext.push({ tab: "press", plate: "2F", box: [pb[0] + dx, pb[1], pb[2] + dx, pb[3]] }); }
    (lightBox[tab] ||= {})[k] = e;
  }
}
return {bundle,lightErase,lightBox};
}
