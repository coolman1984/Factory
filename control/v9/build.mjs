// Build Material Flow Player V9 as ONE offline HTML file (double-click, no server), like the V8 player: three.js, the V8 look
// library, the Factory Engine bundle, the shared path timing, the real-factory package from the Control Center database (all
// tabs and paths), the 3D models and the 2nd-floor plan pictures are all inlined. Company data: the output goes to the
// untracked Material-Flow dist folder.
// node control/v9/build.mjs [--db control/data/real-factory.db] [--out <file>] [--version 9.0]
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportScene } from "../real/export-scene.mjs";

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, "../.."), arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const version = arg("version", "9.0"), vendor = join(root, "material-flow/src/v8/vendor");
const out = arg("out", resolve(root, `../Material-Flow/dist/Material_Flow_Player_v${version}.html`));
const { pack } = await exportScene({ db: arg("db", resolve(root, "control/data/real-factory.db")), out: null });
const assets = {}; for (const f of readdirSync(join(root, "viewer/assets")).filter(f => f.endsWith(".glb"))) assets[f.replace(".glb", "")] = "data:model/gltf-binary;base64," + readFileSync(join(root, "viewer/assets", f)).toString("base64");
const plans = {}; for (const l of Object.values(pack.cad)) if (l.kind === "slab") for (const s of l.segments) if (s.image && !plans[s.image]) { const fp = join(root, "control/data/film", s.image); if (existsSync(fp)) plans[s.image] = "data:image/png;base64," + readFileSync(fp).toString("base64"); }
const three = ["three.js", ...Array.from({ length: 10 }, (_, i) => `three-${String(i + 1).padStart(3, "0")}.js`)].map(f => readFileSync(join(vendor, f), "utf8")).join("");
const timing = readFileSync(join(root, "control/real/timing.js"), "utf8").replace(/^export /gm, "");
const safe = s => s.replace(/<\/script/gi, "<\\/script");
const scripts = [three, readFileSync(join(vendor, "three-addons.js"), "utf8"), readFileSync(join(vendor, "../look.js"), "utf8"), readFileSync(join(vendor, "../engine/factory-engine.js"), "utf8"),
  `window.FCTiming = (() => { ${timing}\nreturn { pathModel, timePath }; })();`,
  `window.V9_PACK = ${JSON.stringify(pack)};\nwindow.V9_ASSETS = ${JSON.stringify(assets)};\nwindow.V9_PLANS = ${JSON.stringify(plans)};\nwindow.V9_BUILD = ${JSON.stringify({ version, built: new Date().toISOString(), revision: pack.revision })};`,
  readFileSync(join(root, "control/ui/v9.js"), "utf8")].map(s => `<script>${safe(s)}</script>`).join("\n");
const page = readFileSync(join(root, "control/ui/v9.html"), "utf8").replace(/<!--V9-SCRIPTS-->[\s\S]*<!--\/V9-SCRIPTS-->/, () => scripts).replace("<title>Material Flow Player V9</title>", `<title>Material Flow Player V${version}</title>`);
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1048576).toFixed(1)} MB; sha256 ${createHash("sha256").update(page).digest("hex")}; ${pack.paths.length} paths, ${pack.objects.length} objects, revision ${pack.revision}`);
