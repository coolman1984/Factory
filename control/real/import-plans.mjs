// Add the V8 player's 1st-floor plan pictures of every tab to the master data, registered onto the CAD with the same transform
// as everything else (CAD = (x + dx, dy - y) in plan metres; site = CAD - origin). They are the "flat plan" of the V9 player:
// the opening view (From flat plan to factory) and the 2D plan mode. One recorded command per run; re-running replaces them.
// node control/real/import-plans.mjs [--db control/data/real-factory.db] [--config control/data/real-site.config.json]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../store.js";

const here = dirname(fileURLToPath(import.meta.url)), arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const C = JSON.parse(readFileSync(arg("config", resolve(here, "../data/real-site.config.json")), "utf8")), dbFile = arg("db", resolve(here, "../data/real-factory.db"));
const proj = JSON.parse(readFileSync(C.projects, "utf8")), { dx, dy } = C.registration, [ox, oy] = C.origin, r2 = v => Math.round(v * 100) / 100;
const plansDir = resolve(dirname(dbFile), "film/plans"); mkdirSync(plansDir, { recursive: true });
const P = ([x, y]) => [r2(x + dx - ox), r2(dy - y - oy)];
const S = await Store.open(dbFile), commands = [];
for (const tab of C.tabs) {
  const D = proj[tab].data, plate = D.plates?.["1F"]; if (!plate?.pics?.length) { console.log(`${tab}: no 1st-floor picture`); continue; }
  const segs = [];
  for (const pic of plate.pics) { const url = proj[tab].plans[pic.file]; if (!url) continue; const file = `${tab}-1F-${pic.file}.png`;
    writeFileSync(resolve(plansDir, file), Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    const a = P([pic.x * 0.3, pic.y * 0.3]), b = P([(pic.x + pic.w) * 0.3, (pic.y + pic.h) * 0.3]);
    segs.push({ rect: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], image: "plans/" + file }); }
  const id = "PLAN1_" + tab.toUpperCase(), data = { layer_id: id, label: `${tab.toUpperCase()} 1st-floor plan (V8 slide, registered to the CAD)`, kind: "plan", z_m: 0, floor: "1F", height_m: 0, thickness_m: 0, color: "#ffffff", source_layers: ["V8 plan"], count: segs.length, segments: segs };
  commands.push(S.exists("cadlayer", id) ? { type: "record.replace", payload: { type: "cadlayer", id, data } } : { type: "record.create", payload: { type: "cadlayer", data } });
  console.log(`${tab}: ${segs.length} picture(s) ${segs.map(s => s.rect.join(",")).join(" | ")}`);
}
const r = S.command({ actor: "plan-import", type: "batch", force: true, payload: { commands, label: "V8 1st-floor plans for the flat-plan view" } });
console.log(r.ok ? `saved, revision ${r.revision}` : "refused: " + (r.reason || r.code)); S.close();
