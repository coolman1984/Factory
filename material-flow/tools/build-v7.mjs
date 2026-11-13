// Builds a V7 stage player from the V6 player (run tools/build-v6.mjs first). One file per stage, V6 and earlier stay untouched.
//   7.1 Foundation: the scene file drives the player (tools/v7/scene-core.js + preload-scene.js), per-step speed, rebuildable
//       engine, scene file manager (open / save / save as / download / drop, undo / redo, autosave, validation).
// The scenes baked into the file are the default (private/v7/scenes/<tab>.scene.json, made by tools/v7/export-scenes.mjs, or
// any scene given with --bake). Each engine patch must match exactly once, so a different V6 fails loudly.
// Usage: node tools/build-v7.mjs [stage=7.1] [--in dist/Material_Flow_Player_v6.html] [--out dist/Material_Flow_Player_v<stage>.html]
//        [--bake a.scene.json b.scene.json ...]   (default: every file in private/v7/scenes)
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import vm from "node:vm";
import {buildParts,projectData} from "./v8/build-parts.mjs";
import { planBuildOutput, publishBuild } from "./v8/build-output.mjs";
import { playerPatches, replicaPatches } from "./v7/engine-patches.mjs";

const args = process.argv.slice(2);
const stage = args[0] && !args[0].startsWith("--") ? args.shift() : "7.1";
const options = {}, bakeArgs = [];
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (key === "--bake") {
    while (i + 1 < args.length && !args[i + 1].startsWith("--")) bakeArgs.push(args[++i]);
    if (!bakeArgs.length) throw new Error("--bake needs scene files");
    options[key] = true;
  } else if (key === "--no-docs-check") options[key] = true;
  else if (["--in", "--out"].includes(key) && args[i + 1] && !args[i + 1].startsWith("--")) options[key] = args[++i];
  else throw new Error("unknown option or missing value: " + key);
}
const opt = (k, d) => options[k] ?? d;
// each inner list is one script scope (the scene manager and the Studio have their own names)
const STAGES = {
  "7.1": { groups: [["scene-ui.js"]], css: ["scene-ui.css"] },
  "7.7.1": { groups: [["scene-ui.js"], ["studio-core.js", "studio-camera.js", "studio-edit.js", "studio-director.js", "studio-numbers.js", "studio-ui.js"]], css: ["scene-ui.css", "studio.css"] },
  "7.7.2": { groups: [["scene-ui.js"], ["studio-core.js", "studio-camera.js", "studio-edit.js", "studio-director.js", "studio-numbers.js", "studio-ui.js"]], css: ["scene-ui.css", "studio.css"] },
  "7.7": { groups: [["scene-ui.js"], ["studio-core.js", "studio-camera.js", "studio-edit.js", "studio-director.js", "studio-numbers.js", "studio-ui.js"]], css: ["scene-ui.css", "studio.css"] },
  "7.6": { groups: [["scene-ui.js"], ["studio-core.js", "studio-camera.js", "studio-edit.js", "studio-director.js", "studio-numbers.js", "studio-ui.js"]], css: ["scene-ui.css", "studio.css"] },
};
if (!STAGES[stage]) throw new Error(`unknown stage ${stage} (built so far: ${Object.keys(STAGES).join(", ")})`);
const inFile = opt("--in", "dist/Material_Flow_Player_v6.html"), outFile = opt("--out", `dist/Material_Flow_Player_v${stage}.html`);
const bakeFiles = options["--bake"] ? bakeArgs : existsSync("private/v7/scenes") ? readdirSync("private/v7/scenes").filter((f) => f.endsWith(".scene.json")).map((f) => "private/v7/scenes/" + f) : [];
const output = planBuildOutput(stage, inFile, outFile);
let html = readFileSync(inFile, "utf8");
const once = (src, find, repl, what) => { const n = src.split(find).length - 1; if (n !== 1) throw new Error(`patch "${what}": expected exactly one match, found ${n}`); return src.replace(find, () => repl); };
// some embedded scripts use CRLF line ends: a multi-line patch that does not match with LF is tried with CRLF
const patch = (src, a, b, what) => (src.split(a).length === 1 && a.includes("\n") ? once(src, a.replace(/\n/g, "\r\n"), b.replace(/\n/g, "\r\n"), what) : once(src, a, b, what));
const read = (f) => readFileSync(new URL("./v7/" + f, import.meta.url), "utf8");
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");

// 1. scenes baked in + scene core + preload, before the project data picks its tab
const {bundle,lightErase,lightBox}=buildParts(projectData(html),bakeFiles);
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
{ const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi; let m, n = 0;
  while ((m = re.exec(html))) {
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    if (/\bsrc\s*=/i.test(m[1]) || (type && !/^(?:text|application)\/(?:java|ecma)script$/i.test(type[1]))) continue;
    try { new vm.Script(m[2]); n++; } catch (e) { throw new Error(`inline script ${n + 1} does not parse: ${e.message}`); }
  }
  console.log(`syntax: ${n} inline scripts parse`);
}
mkdirSync(dirname(outFile), { recursive: true });
// docs must match the code before a real player is written (test builds under dist/test/ and --no-docs-check skip it)
if (!options["--no-docs-check"] && !output.testOutput) {
  const { docsCheck } = await import("./v7/docs-check.mjs"), problems = await docsCheck();
  if (problems.length) { for (const p of problems) console.log("DOCS " + p); throw new Error(`docs-check failed (${problems.length} problem(s)): fix the docs, the changelog or the examples (node tools/mf.mjs docs-gen for generated parts)`); }
  console.log("docs-check OK");
}
publishBuild(output, html);
console.log(`baked-light clean-up: ${JSON.stringify(lightErase)}`);
console.log(`${outFile}: ${(html.length / 1048576).toFixed(2)} MB, sha256 ${createHash("sha256").update(html).digest("hex").slice(0, 16)}; ${playerPatches.length + replicaPatches.length} engine patches; scenes: ${Object.keys(bundle.projects).join(", ") || "none"}`);
