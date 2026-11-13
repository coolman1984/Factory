// Copy the Factory Engine bundle from the 3D Factory repository into src/v8/engine/factory-engine.js (vendored, like three.js).
// Usage: node tools/engine/sync-engine.mjs [path to factory-engine.js]
// Default source: ../3D Factory/dist/factory-engine.js (build it there with `node engine/build.mjs`), or FACTORY_ENGINE_DIST.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const src = resolve(process.argv[2] || process.env.FACTORY_ENGINE_DIST || "../3D Factory/dist/factory-engine.js"), dst = "src/v8/engine/factory-engine.js";
if (!existsSync(src)) { console.error(`Factory Engine bundle not found at ${src}. Build it in the 3D Factory repository (node engine/build.mjs) or pass its path.`); process.exit(3); }
const code = readFileSync(src, "utf8");
if (!/^\/\* Factory Engine \d+\.\d+\.\d+/.test(code)) { console.error(`${src} is not a Factory Engine bundle`); process.exit(3); }
const before = existsSync(dst) ? readFileSync(dst, "utf8") : null;
writeFileSync(dst, code);
const h = s => createHash("sha256").update(s).digest("hex").slice(0, 16);
console.log(`${dst}: ${code.slice(3, code.indexOf(":"))}, sha256 ${h(code)}${before === null ? " (new)" : before === code ? " (unchanged)" : " (was " + h(before) + ")"}`);
