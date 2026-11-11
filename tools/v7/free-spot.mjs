// Nearest validator-clean position for one device of a scene, searching rings around a target point (metres).
// Usage: node tools/v7/free-spot.mjs <scene.json> <device id> <x> <y> [--max 6] [--write]
// Prints the best spot (and the heading tried); --write stores it in the scene file.
import { readFileSync, writeFileSync } from "node:fs";
import { loadSceneCore, readProjects, layoutFor } from "./scene-node.mjs";
import { STAGE } from "./mf-commands.mjs";
const [file, id, tx, ty, ...rest] = process.argv.slice(2), opt = {}; for (let i = 0; i < rest.length; i++) if (rest[i].startsWith("--")) opt[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true;
const SC = loadSceneCore(), P = readProjects(`dist/Material_Flow_Player_v${STAGE}.html`), scene = JSON.parse(readFileSync(file, "utf8"));
const d = scene.devices.find((q) => q.id === id); if (!d) throw new Error("unknown device " + id);
const max = +(opt.max || 6), X = +tx, Y = +ty, ok = (sc) => !SC.validate(sc, layoutFor(P, sc.project)).errors.length;
let best = null;
for (let r = 0; r <= max && !best; r += 0.3) for (let a = 0; a < 360 && !best; a += r ? Math.max(10, 60 / r) : 360) for (const h of d.type === "pc" ? [d.heading ?? 90, 0, 90, 180, 270] : [null]) {
  const x = +(X + r * Math.cos(a * Math.PI / 180)).toFixed(2), y = +(Y + r * Math.sin(a * Math.PI / 180)).toFixed(2), c = JSON.parse(JSON.stringify(scene)), q = c.devices.find((z) => z.id === id);
  if (q.type === "scanner") { const dx = x - q.at[0], dy = y - q.at[1]; q.at = [x, y]; if (q.stand) q.stand = [q.stand[0] + dx, q.stand[1] + dy]; } else { q.x = x; q.y = y; if (h != null) q.heading = h; }
  if (ok(c)) { best = { x, y, heading: h, r: +r.toFixed(2), scene: c }; break; }
}
if (!best) { console.log(`no clean spot within ${max} m of (${X}, ${Y})`); process.exit(1); }
console.log(`${id}: (${best.x}, ${best.y})${best.heading != null ? " heading " + best.heading : ""}, ${best.r} m from the target`);
if (opt.write) { writeFileSync(file, JSON.stringify(best.scene, null, 2) + "\n"); console.log("written " + file); }
