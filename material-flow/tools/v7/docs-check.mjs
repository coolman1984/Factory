// Generated documentation and the docs check (`mf docs-gen`, `mf docs-check`).
// Generated blocks live between <!-- GENERATED:name --> and <!-- /GENERATED:name --> markers:
//   fields -> docs/SCENE_MANUAL.md (from tools/v7/scene-schema.mjs)
//   cli    -> docs/CLI.md (from COMMANDS in tools/mf.mjs)
//   keys   -> docs/CONTROL_GUIDES/KEYBOARD.md (from KEYMAP in tools/v7/studio-ui.js)
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA, FIELD_PATHS, fieldPaths } from "./scene-schema.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const R = (p) => join(ROOT, p), read = (p) => readFileSync(R(p), "utf8");
const esc = (s) => String(s).replace(/\|/g, "\\|");
export async function blocks() {
  const fields = "| field | type | unit | allowed values | default | example | meaning |\n|---|---|---|---|---|---|---|\n" + SCHEMA.map((r) => "| `" + r[0] + "` | " + r.slice(1).map((c) => esc(c || "")).join(" | ") + " |").join("\n");
  const { COMMANDS } = await import("./mf-commands.mjs");
  const cli = Object.entries(COMMANDS).map(([k, [a, d]]) => "### `mf " + k + "`\n\n```\nnode tools/mf.mjs " + k + (a ? " " + a : "") + "\n```\n\n" + d + ".").join("\n\n");
  const ui = read("tools/v7/studio-ui.js"), m = /const KEYMAP = (\[[\s\S]*?\n\]);/.exec(ui); if (!m) throw new Error("KEYMAP not found in tools/v7/studio-ui.js");
  const KEYMAP = new Function("return " + m[1])();   // our own source: an array literal
  const keys = KEYMAP.map(([g, rows]) => "### " + g + "\n\n| keys | action |\n|---|---|\n" + rows.map(([k, v]) => "| " + esc(k) + " | " + esc(v) + " |").join("\n")).join("\n\n");
  return { fields: { file: "docs/SCENE_MANUAL.md", text: fields }, cli: { file: "docs/CLI.md", text: cli }, keys: { file: "docs/CONTROL_GUIDES/KEYBOARD.md", text: keys } };
}
const block = (name, text) => `<!-- GENERATED:${name} (mf docs-gen; do not edit by hand) -->\n${text}\n<!-- /GENERATED:${name} -->`;
const re = (name) => new RegExp(`<!-- GENERATED:${name}[^>]*-->[\\s\\S]*?<!-- /GENERATED:${name} -->`);
export async function docsGen() {
  const out = [];
  for (const [name, b] of Object.entries(await blocks())) {
    const doc = read(b.file); if (!re(name).test(doc)) throw new Error(`${b.file}: no GENERATED:${name} markers`);
    const nu = doc.replace(re(name), () => block(name, b.text)); if (nu !== doc) { writeFileSync(R(b.file), nu); out.push(b.file); }
  }
  return out;
}
function mdFiles() {
  const out = ["README.md", "AGENTS.md"].filter((f) => existsSync(R(f)));
  const walk = (d) => { for (const f of readdirSync(R(d))) { const p = d + "/" + f; if (statSync(R(p)).isDirectory()) { if (!/^(history|templates)$/.test(f)) walk(p); } else if (f.endsWith(".md")) out.push(p); } };
  walk("docs"); walk(".agents/skills"); return out;
}
export async function docsCheck() {
  const problems = [];
  // 1. generated blocks are current
  for (const [name, b] of Object.entries(await blocks())) { if (!existsSync(R(b.file))) { problems.push(`${b.file} is missing`); continue; } const doc = read(b.file), m = re(name).exec(doc); if (!m) problems.push(`${b.file}: no GENERATED:${name} block`); else if (m[0] !== block(name, b.text)) problems.push(`${b.file}: the ${name} block is out of date (run: node tools/mf.mjs docs-gen)`); }
  // 2. every field used in the scenes and examples is in the schema
  const scenes = [...(existsSync(R("private/v7/scenes")) ? readdirSync(R("private/v7/scenes")).map((f) => "private/v7/scenes/" + f) : []), ...(existsSync(R("docs/examples")) ? readdirSync(R("docs/examples")).map((f) => "docs/examples/" + f) : [])].filter((f) => f.endsWith(".json"));
  for (const f of scenes) for (const p of fieldPaths(JSON.parse(read(f)))) if (!FIELD_PATHS.has(p)) problems.push(`${f}: field ${p} is not in the schema (tools/v7/scene-schema.mjs) - document it`);
  // 3. the examples validate
  const { STAGE, COMMANDS } = await import("./mf-commands.mjs"), player = `dist/Material_Flow_Player_v${STAGE}.html`;
  if (existsSync(R(player))) {
    const { loadSceneCore, readProjects, layoutFor } = await import("./scene-node.mjs"), SC = loadSceneCore(), P = readProjects(R(player));
    for (const f of scenes.filter((x) => x.startsWith("docs/examples/"))) { const s = JSON.parse(read(f)), r = SC.validate(s, layoutFor(P, s.project)); if (r.errors.length) problems.push(`${f}: does not validate: ${r.errors[0].where}: ${r.errors[0].msg}`); }
  } else problems.push(`${player} missing: build it to check the examples`);
  // 4. commands named in the docs exist; links resolve
  for (const f of mdFiles()) {
    const t = read(f);
    for (const m of t.matchAll(/(?:node tools\/mf\.mjs|`mf) ([a-z-]+)/g)) if (!COMMANDS[m[1]]) problems.push(`${f}: unknown command "mf ${m[1]}"`);
    for (const m of t.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) { const href = m[1]; if (/^(https?:|mailto:)/.test(href)) continue; if (!existsSync(join(dirname(R(f)), decodeURIComponent(href)))) problems.push(`${f}: link to a missing file: ${href}`); }
  }
  // 5. changelog has the current version
  if (!existsSync(R("docs/CHANGELOG.md")) || !new RegExp(`^## V${STAGE.replace(/\./g, "\\.")}\\b`, "m").test(read("docs/CHANGELOG.md"))) problems.push(`docs/CHANGELOG.md has no "## V${STAGE}" entry`);
  // 6. the build knows the stage
  const builder = STAGE.startsWith("8") ? "tools/build-v8.mjs" : "tools/build-v7.mjs";
  if (!read(builder).includes(`"${STAGE}":`)) problems.push(`${builder} has no stage ${STAGE}`);
  return problems;
}
