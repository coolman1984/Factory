// Builds a V7 stage player from the V6 player (run tools/build-v6.mjs first). One file per stage, V6 and earlier stay untouched.
//   7.1 Foundation: the scene file drives the player (tools/v7/scene-core.js + preload-scene.js), per-step speed, rebuildable
//       engine, scene file manager (open / save / save as / download / drop, undo / redo, autosave, validation).
// The scenes baked into the file are the default (private/v7/scenes/<tab>.scene.json, made by tools/v7/export-scenes.mjs, or
// any scene given with --bake). Each engine patch must match exactly once, so a different V6 fails loudly.
// Usage: node tools/build-v7.mjs [stage=7.1] [--in dist/Material_Flow_Player_v6.html] [--out dist/Material_Flow_Player_v<stage>.html]
//        [--bake a.scene.json b.scene.json ...]   (default: every file in private/v7/scenes)
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import vm from "node:vm";
import { playerPatches, replicaPatches } from "./v7/engine-patches.mjs";

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const stage = args[0] && !args[0].startsWith("--") ? args[0] : "7.1";
// each inner list is one script scope (the scene manager and the Studio have their own names)
const STAGES = {
  "7.1": { groups: [["scene-ui.js"]], css: ["scene-ui.css"] },
  "7.7.1": { groups: [["scene-ui.js"], ["studio-core.js", "studio-camera.js", "studio-edit.js", "studio-director.js", "studio-numbers.js", "studio-ui.js"]], css: ["scene-ui.css", "studio.css"] },
  "7.7": { groups: [["scene-ui.js"], ["studio-core.js", "studio-camera.js", "studio-edit.js", "studio-director.js", "studio-numbers.js", "studio-ui.js"]], css: ["scene-ui.css", "studio.css"] },
  "7.6": { groups: [["scene-ui.js"], ["studio-core.js", "studio-camera.js", "studio-edit.js", "studio-director.js", "studio-numbers.js", "studio-ui.js"]], css: ["scene-ui.css", "studio.css"] },
};
if (!STAGES[stage]) throw new Error(`unknown stage ${stage} (built so far: ${Object.keys(STAGES).join(", ")})`);
const inFile = opt("--in", "dist/Material_Flow_Player_v6.html"), outFile = opt("--out", `dist/Material_Flow_Player_v${stage}.html`);
const bi = args.indexOf("--bake"), bakeFiles = bi >= 0 ? args.slice(bi + 1).filter((a) => !a.startsWith("--")) : existsSync("private/v7/scenes") ? readdirSync("private/v7/scenes").filter((f) => f.endsWith(".scene.json")).map((f) => "private/v7/scenes/" + f) : [];
for (const f of ["v4", "v5", "v6"]) if (resolve(outFile) === resolve(`dist/Material_Flow_Player_${f}.html`)) throw new Error("earlier versions are read-only");
let html = readFileSync(inFile, "utf8");
const once = (src, find, repl, what) => { const n = src.split(find).length - 1; if (n !== 1) throw new Error(`patch "${what}": expected exactly one match, found ${n}`); return src.replace(find, () => repl); };
// some embedded scripts use CRLF line ends: a multi-line patch that does not match with LF is tried with CRLF
const patch = (src, a, b, what) => (src.split(a).length === 1 && a.includes("\n") ? once(src, a.replace(/\n/g, "\r\n"), b.replace(/\n/g, "\r\n"), what) : once(src, a, b, what));
const read = (f) => readFileSync(new URL("./v7/" + f, import.meta.url), "utf8");
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");

// 1. scenes baked in + scene core + preload, before the project data picks its tab
const bundle = { format: "mf-scene-bundle", projects: {} };
for (const f of bakeFiles) { const o = JSON.parse(readFileSync(f, "utf8")); if (o.format !== "mf-scene" || !o.project) throw new Error(`${f}: not a scene file`); bundle.projects[o.project] = o; }
// walls that V4 had and this player does not (V6 removed the rooms beside Kitting): their shadows are baked into the floor light
// and get repainted at load. Rooms = clusters of touching removed walls.
const lightErase = {};
{
  const v4 = JSON.parse(readFileSync("private/v5/P-v4.json", "utf8")), cur = (() => { const a = html.indexOf("var P = {"), e = html.indexOf("\n", a), line = html.slice(a, e); return JSON.parse(line.slice(8, line.lastIndexOf("}") + 1)); })();
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
  const v4 = JSON.parse(readFileSync("private/v5/P-v4.json", "utf8")), cur = (() => { const a = html.indexOf("var P = {"), e = html.indexOf("\n", a), line = html.slice(a, e); return JSON.parse(line.slice(8, line.lastIndexOf("}") + 1)); })();
  const ext = (pics) => pics.reduce((a, p) => [Math.min(a[0], p.x), Math.min(a[1], p.y), Math.max(a[2], p.x + p.w), Math.max(a[3], p.y + p.h)], [1e9, 1e9, -1e9, -1e9]);
  for (const tab of Object.keys(cur)) for (const k of Object.keys(cur[tab].data.plates)) {
    if (!v4[tab] || !v4[tab].data.plates[k]) continue; const a = ext(v4[tab].data.plates[k].pics), b = ext(cur[tab].data.plates[k].pics);
    if (a.every((v, i) => Math.abs(v - b[i]) < .01)) continue;
    const e = { box: a, ext: [] };
    if (tab === "inj2" && k === "2F" && cur.press) { const pb = ext(v4.press.data.plates["2F"].pics), dx = 684 - 636; e.ext.push({ tab: "press", plate: "2F", box: [pb[0] + dx, pb[1], pb[2] + dx, pb[3]] }); }
    (lightBox[tab] ||= {})[k] = e;
  }
}
console.log(`floor-light boxes: ${JSON.stringify(lightBox)}`);
html = once(html, "<script>window.MF_DEVICE_DIMS=", `<script>window.MF7_LIGHT_ERASE=${JSON.stringify(lightErase)};window.MF7_LIGHT_BOX=${JSON.stringify(lightBox)};</script><script id="mf7-embedded" type="application/json">${safe(JSON.stringify(bundle))}</script><script>${safe(read("scene-core.js"))}</script><script>${safe(read("preload-scene.js"))}</script><script>window.MF_DEVICE_DIMS=`, "scene preload");
html = once(html, "var p = P[id]; window.MF_PROJECT = id;", "var p = P[id]; if (window.MFV7_LOAD) window.MFV7_LOAD(id, p, P); window.MF_PROJECT = id;", "apply the scene");

// 2. engine
for (const [a, b, what] of [...replicaPatches, ...playerPatches]) html = patch(html, a, b, what);

// 3. this stage's modules, after the player
const S = STAGES[stage], wrap = (files) => `<script>/* Material Flow V${stage}: ${files.join(", ")} */\n(() => {\n"use strict";\ntry {\n${safe(files.map((f) => `/* ---- ${f} ---- */\n` + read(f)).join("\n"))}\n} catch (e) { console.error("V${stage} add-on failed to start", e); const t = document.getElementById("tip"); if (t) { t.textContent = "The V${stage} tools could not start: " + e.message; t.style.display = "block"; } }\n})();</script>\n`;
html = once(html, "</body>", S.groups.map(wrap).join("") + "</body>", "stage modules");
html = once(html, "</style>", S.css.map(read).join("\n") + "</style>", "stage styles");
html = once(html, "<title>Material Flow Player V6</title>", `<title>Material Flow Player V${stage}</title>`, "title");
html = once(html, "<tr><td>2 / 3 / A</td>", "<tr><td>Ctrl+O / Ctrl+S</td><td>Open / save the scene file (also in the Scene file panel)</td></tr><tr><td>Ctrl+Z / Ctrl+Y</td><td>Undo / redo a scene change</td></tr><tr><td>2 / 3 / A</td>", "help: scene keys");

// every inline script must at least parse (a broken add-on would silently leave the player without it)
{ const re = /<script(?: id="[^"]*")?>([\s\S]*?)<\/script>/g; let m, n = 0; while ((m = re.exec(html))) { if (m[1].length > 3e6) continue; try { new vm.Script(m[1]); n++; } catch (e) { throw new Error(`inline script ${n + 1} does not parse: ${e.message}`); } } console.log(`syntax: ${n} inline scripts parse`); }
writeFileSync(outFile, html);
console.log(`baked-light clean-up: ${JSON.stringify(lightErase)}`);
console.log(`${outFile}: ${(html.length / 1048576).toFixed(2)} MB, sha256 ${createHash("sha256").update(html).digest("hex").slice(0, 16)}; ${playerPatches.length + replicaPatches.length} engine patches; scenes: ${Object.keys(bundle.projects).join(", ") || "none"}`);
