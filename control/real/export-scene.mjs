// Export one film/viewer package from the Control Center database: CAD layers, objects with their 3D models, stops, and the
// engine timeline of a path (latest saved run of that path, or a fresh engine run that is then saved).
// node control/real/export-scene.mjs [--db control/data/real-factory.db] [--path inj1-wh] [--out control/data/film/scene.json]
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../store.js";
import { runAndSave } from "./path.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export async function exportScene({ db = resolve(here, "../data/real-factory.db"), path = null, out = resolve(here, "../data/film/scene.json"), fresh = false } = {}) {   // out = null: return the package only
  const S = await Store.open(db), recs = S.records(), F = recs.factory[0].data, pf = Object.fromEntries(recs.prefab.map(r => [r.id, r.data]));
  const P = recs.path.find(p => p.id === path) || recs.path[0]; if (!P) throw new Error("no trolley path in the master data");
  let run = !fresh && S.runs(500).find(r => r.scenario === "path:" + P.id && r.revision === S.revision);
  let timeline = run ? S.runDetail(run.id).report.timeline : null, kpis = run ? run.kpis : null, runId = run ? run.id : null;
  if (!timeline) { const r = runAndSave(S, P.id, "film"); timeline = r.timeline; kpis = { ...r }; delete kpis.timeline; runId = r.id; }
  const ent = recs.entity.map(r => r.data), byCat = c => ent.filter(e => e.category === c);
  if (S.runs(1000).every(r => r.scenario !== "path:" + P.id)) runAndSave(S, P.id, "export");
  const pack = {
    format: "fc-scene", version: 1, exported: new Date().toISOString(), revision: S.revision, run: runId, engine_kpis: kpis,
    factory: { id: F.factory_id, name: F.name, site_m: F.site_dimensions_m, origin_cad_m: F._meta?.cad_origin_m || null, source: F._meta?.cad_source || null },
    buildings: ent.filter(e => e.prefab_id === "BUILDING").map(e => ({ id: e.entity_id, name: e.name, center: e.transform.position_m.slice(0, 2), size: e.size_m })),
    areas: ent.filter(e => e.prefab_id === "AREA").map(e => ({ id: e.entity_id, name: e.name, center: e.transform.position_m.slice(0, 2), size: e.size_m })),
    cad: Object.fromEntries(recs.cadlayer.map(r => [r.id, { kind: r.data.kind, label: r.data.label, height: r.data.height_m, thickness: r.data.thickness_m, color: r.data.color, z: r.data.z_m || 0, floor: r.data.floor || "1F", segments: r.data.segments }])),
    objects: ent.filter(e => e.prefab_id && pf[e.prefab_id]?.visual_asset).map(e => ({ id: e.entity_id, name: e.name, prefab: e.prefab_id, category: e.category, asset: pf[e.prefab_id].visual_asset,
      ref: pf[e.prefab_id].dimensions_m, pos: e.transform.position_m, yaw: e.transform.yaw_deg || 0, size: e.size_m || pf[e.prefab_id].dimensions_m })),
    stops: recs.stop.map(r => ({ id: r.id, name: r.data.name, symbol: r.data.symbol, pos: r.data.position_m, floor: r.data.floor })),
    // V9: every path with its master data (for re-timing in the browser) and its latest engine timeline at this revision
    paths: recs.path.map(p => { const run2 = S.runs(1000).find(r => r.scenario === "path:" + p.id && r.revision === S.revision) || S.runs(1000).find(r => r.scenario === "path:" + p.id);
      const tl = run2 ? S.runDetail(run2.id).report.timeline : null; return { id: p.id, tab: p.data.tab || "", data: p.data, run: run2?.id || null, kpis: run2?.kpis || null, timeline: tl }; }),
    conflicts: (P.data.clearance?.objects_on_route || []).map(o => o.id), walls_crossed: P.data.clearance?.walls_crossed || [],
    path: { id: P.id, name: P.data.name, color: P.data.color, steps: timeline.steps.map((s, i) => ({ ...s, title: P.data.steps[i]?.title || s.title, caption: (P.data.captions || [])[i] || "", wait_s: P.data.steps[i]?.wait_s ?? 0 })), total_s: timeline.total_s },
    trolley: byCat("transporter").map(e => e.entity_id)
  };
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(pack)); } S.close();
  return { pack, out, objects: pack.objects.length, cad: Object.values(pack.cad).reduce((a, l) => a + l.segments.length, 0), run: runId, total_s: timeline.total_s };
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("export-scene.mjs")) {
  const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
  const { pack, ...r } = await exportScene({ db: arg("db"), path: arg("path"), out: arg("out"), fresh: process.argv.includes("--fresh") }); console.log(JSON.stringify(r));
}
