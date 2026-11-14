// Build the real factory in the Control Center from AutoCAD: buildings, walls, partitions and columns (CAD layers), the INJ 1
// hall objects (injection machines, auxiliaries, bridge cranes, racks, pallets, equipment, floor markings), the trolley paths
// with their stops (moved from the player's plan onto CAD coordinates), then the engine times every path.
// Usage: node control/real/import-site.mjs [--config control/data/real-site.config.json] [--db control/data/real-factory.db]
// Every value is in true metres (site frame = CAD world metres minus config.origin). The import is one recorded command, so
// it shows in the change log and can be undone; running it again replaces the data (also recorded).
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Cad, segments, cluster } from "./cad.mjs";
import { Store } from "../store.js";
import { runAndSave, clearance } from "./path.mjs";
import { autoRoute } from "./autoroute.mjs";

const here = dirname(fileURLToPath(import.meta.url)), arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const C = JSON.parse(readFileSync(arg("config", resolve(here, "../data/real-site.config.json")), "utf8")), dbFile = arg("db", resolve(here, "../data/real-factory.db"));
const [ox, oy] = C.origin, r2 = v => Math.round(v * 100) / 100, S = ([x, y]) => [r2(x - ox), r2(y - oy)];
const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s]`, ...a);
const cad = await Cad.open(C.cad);

/* ---------- prefabs: object types with a 3D model each (control/viewer assets) ---------- */
const PF = (id, category, dims, caps, asset) => ({ prefab_id: id, version: "1.0.0", category, dimensions_m: dims, capabilities: caps, visual_asset: asset ? `assets/${asset}.glb` : null });
const prefabs = [PF("BUILDING", "zone", [100, 100, 10], [], null), PF("AREA", "zone", [20, 20, 0.02], [], null),
  PF("INJECTION_MACHINE", "station", [11, 3, 3], ["injection"], "injection_machine"), PF("AUX_UNIT", "station", [2, 1, 1.6], ["auxiliary"], "aux_unit"),
  PF("EQUIPMENT", "station", [6, 1.3, 1.6], ["process"], "equipment"), PF("RACK", "storage", [4.5, 1.2, 2.5], ["storage"], "rack"), PF("PALLET", "storage", [1.3, 1, 1.25], ["storage"], "pallet"),
  PF("CRANE_BRIDGE", "station", [4.6, 16.4, 1.2], ["lifting"], "crane_bridge"), PF("TROLLEY", "transporter", [1.2, 0.8, 1.5], ["manual_push"], "trolley"), PF("AGV", "transporter", [1.4, 0.9, 0.35], ["agv"], "agv"),
  PF("PC_STATION", "station", [0.8, 0.6, 1.6], ["scan"], "pc_station"), PF("SMT_MODULE", "station", [4, 1.6, 1.55], ["process"], "smt_module"), PF("EPS_MACHINE", "station", [4, 2.5, 3.2], ["molding"], "eps_machine"),
  PF("TABLE", "station", [1.6, 0.8, 0.78], ["work"], "table"), PF("BIN_CART", "storage", [1.0, 0.7, 1.1], ["storage"], "bin_cart"), PF("BOLLARD", "station", [0.2, 0.2, 1.1], ["safety"], "bollard"), PF("RFID_GATE", "station", [3.2, 0.5, 2.8], ["rfid"], "rfid_gate"), PF("SCANNER", "station", [0.5, 0.5, 1.3], ["scan"], "scanner"),
  PF("OPERATOR", "worker", [0.6, 0.4, 1.75], ["trolley_handling"], "operator")];
const entities = [], E = (id, name, cat, prefab, [x, y], size, yaw = 0, extra = {}) => entities.push({ entity_id: id, name, category: cat, org_parent_id: extra.parent || null, spatial_parent_id: null,
  prefab_id: prefab, prefab_version: prefab ? "1.0.0" : null, transform: { position_m: [r2(x), r2(y), r2(extra.z || 0)], yaw_deg: r2(yaw) }, capabilities: extra.caps || [], size_m: size.map(r2), model_asset: null, source: extra.source || null,
  ...(extra.slots ? { storage_capacity: { handling_unit_slots: extra.slots } } : {}) });

/* ---------- buildings and areas ---------- */
for (const b of C.buildings) E(b.id, b.name, "zone", "BUILDING", S([(b.x[0] + b.x[1]) / 2, (b.y[0] + b.y[1]) / 2]), [b.x[1] - b.x[0], b.y[1] - b.y[0], b.h], 0, { source: "CAD walls (measured)" });
for (const a of C.areas) E(a.id, a.name, "zone", "AREA", S([(a.x[0] + a.x[1]) / 2, (a.y[0] + a.y[1]) / 2]), [a.x[1] - a.x[0], a.y[1] - a.y[0], 0.02], 0, { parent: a.parent, source: "CAD walls (measured)" });

/* ---------- CAD layers: walls, partitions, columns, crane runway, floor markings ---------- */
const cadlayers = [], L = (id, label, kind, h, th, color, src, segs) => cadlayers.push({ layer_id: id, label, kind, height_m: h, thickness_m: th, color, source_layers: src, count: segs.length, segments: segs });
const segsOf = (layers, box, min) => segments(cad.shapes(layers, box), min).map(([a, b, c, d]) => [...S([a, b]), ...S([c, d])]);
L("EXTERIOR_WALLS", "Exterior walls", "exterior_wall", 9, 0.25, "#d6d3cc", ["_exterior walls"], segsOf(["_exterior walls"], C.complex_box, 0.1)); log("exterior walls", cadlayers.at(-1).count);
L("WALLS", "Walls", "wall", 5, 0.2, "#e4e1da", ["wall", "--Wall"], segsOf(["wall", "--Wall"], C.complex_box, 0.1)); log("walls", cadlayers.at(-1).count);
L("PARTITIONS", "Interior partitions", "partition", 3, 0.12, "#eceae4", ["_interior partition"], segsOf(["_interior partition"], C.complex_box, 0.1)); log("partitions", cadlayers.at(-1).count);
const cols = cluster(cad.shapes(["기둥"], C.complex_box), { cell: 0.1, join: 1, minSize: 0.2 }).filter(c => c.w >= 0.2 && c.d >= 0.2 && c.w <= 1.6 && c.d <= 1.6);
L("COLUMNS", "Structural columns", "column", 9, 0, "#b8bec7", ["기둥"], cols.map(c => [...S([c.cx, c.cy]), r2(c.w), r2(c.d), 0])); log("columns", cols.length);
L("CRANE_RUNWAY", "Crane runway rails", "outline", 7.2, 0.3, "#f2b705", ["crane"], segsOf(["crane"], C.hall_box, 20)); log("crane runway", cadlayers.at(-1).count);
L("FLOOR_MARKINGS", "Floor markings (storage grids, aisles)", "marking", 0, 0.08, "#f4c20d", ["0", "_lines"], segsOf(["0", "_lines"], C.hall_box, 0.3)); log("floor markings", cadlayers.at(-1).count);

/* ---------- objects of the whole complex (E1, E2, EPS), detected from CAD geometry by layer rules ---------- */
const box = C.complex_box, inBld = (x, y) => (C.buildings.find(b => x >= b.x[0] && x <= b.x[1] && y >= b.y[0] && y <= b.y[1]) || {}).id || null;
const labels = cad.db.prepare("SELECT text, x, y FROM entities WHERE space='model' AND layer='injection' AND type='TEXT' AND text LIKE '%Ton%'").all().map(r => ({ t: r.text.replace(/\s/g, ""), x: r.x / 1000, y: r.y / 1000 }));
const count = {}, nextId = p => `${p}-${String(count[p] = (count[p] || 0) + 1).padStart(3, "0")}`;
const obj = (prefab, cat, name, c, L, D, H, extra = {}) => { const yaw = c.w >= c.d ? 0 : 90, par = extra.parent || inBld(c.cx, c.cy);
  E(extra.id || nextId(prefab), name, cat, prefab, S([c.cx, c.cy]), [L, D, H], yaw, { parent: par, source: extra.source, caps: extra.caps || [], slots: extra.slots }); };
// injection machines (and their auxiliaries) everywhere; INJ 1 / INJ 2 by area
for (const c of cluster(cad.shapes(["injection"], box), { cell: 0.1, join: 1, minSize: 1 })) {
  const L = Math.max(c.w, c.d), D = Math.min(c.w, c.d), area = c.cx < 600 ? "INJ1" : c.cx > 729 && c.cy > 440 ? "INJ2_PRESSES" : null, pre = area === "INJ1" ? "INJ1" : area ? "INJ2" : "INJ";
  if (L >= 7.5 && D >= 1.8) { const lab = labels.filter(l => Math.abs(l.y - c.cy) < 2.2 && Math.abs(l.x - c.cx) < L / 2 + 3).sort((a, b) => Math.abs(a.y - c.cy) - Math.abs(b.y - c.cy))[0];
    obj("INJECTION_MACHINE", "station", `Injection machine${lab ? " " + lab.t : ""}`, c, L, D, Math.min(3.4, 2.0 + 0.1 * L), { id: nextId(pre + "-M"), parent: area, caps: ["injection"], source: `CAD injection layer${lab ? ", label " + lab.t : ""}` }); }
  else if (L >= 1.2 && D >= 0.5 && L <= 12) obj("AUX_UNIT", "station", "Auxiliary unit", c, L, D, L > 3 ? 2.2 : 1.6, { id: nextId(pre + "-AUX"), parent: area, source: "CAD injection layer" });
}
log("injection", Object.entries(count).filter(([k]) => /INJ/.test(k)).map(([k, v]) => `${k} ${v}`).join(", "));
// rule table: layers -> object type; size limits (m) filter text/frames; height is a planning value per type
const RULES = [
  { layers: ["SMD line"], prefab: "SMT_MODULE", cat: "station", name: "SMT line module", h: 1.55, cell: 0.2, join: 2, min: 0.6, max: 26, minD: 0.4, split: 4.5, maxLine: 120 },
  { layers: ["Auto PBA lines"], prefab: "SMT_MODULE", cat: "station", name: "Auto PBA line module", h: 1.55, cell: 0.2, join: 2, min: 0.6, max: 26, minD: 0.4, split: 4.5, maxLine: 120 },
  { layers: ["eps cushion", "eps"], prefab: "EPS_MACHINE", cat: "station", name: "EPS cushion molding machine", h: 3.2, cell: 0.2, join: 2, min: 1.0, max: 25, minD: 0.6 },
  { layers: ["외형선(ISO)", "_technology.TECH", "11_COMPONENT", "11_COMPONENT_4_1", "00 Prodution MC", "D-FIX"], prefab: "EQUIPMENT", cat: "station", name: "Production equipment", h: 1.7, cell: 0.2, join: 2, min: 0.8, max: 25, minD: 0.4, split: 5, maxLine: 80 },
  { layers: ["Racks", "4"], prefab: "RACK", cat: "storage", name: "Storage rack", h: 2.8, cell: 0.15, join: 1, min: 1.5, max: 15, minD: 0.6, slots: true, split: 4.5, maxLine: 80 },
  { layers: ["Tables and chairs", "furniture", "_furniture & Equipment"], prefab: "TABLE", cat: "station", name: "Work table", h: 0.78, cell: 0.1, join: 1, min: 0.6, max: 8, minD: 0.4 },
  { layers: ["container"], prefab: "BIN_CART", cat: "storage", name: "Bin container", h: 1.1, cell: 0.1, join: 1, min: 0.5, max: 4, minD: 0.3 },
  { layers: ["Monitors"], prefab: "PC_STATION", cat: "station", name: "Monitor / PC", h: 1.6, cell: 0.1, join: 1, min: 0.3, max: 2.5, minD: 0.1 },
  { layers: ["bollard", "guide(bollad)"], prefab: "BOLLARD", cat: "station", name: "Safety bollard", h: 1.1, cell: 0.05, join: 1, min: 0.08, max: 0.7, minD: 0.05, square: true }
];
let skipped = 0;
for (const R of RULES) { let n = 0;
  for (const c of cluster(cad.shapes(R.layers, box), { cell: R.cell, join: R.join, minSize: R.min })) {
    const L = Math.max(c.w, c.d), D = Math.min(c.w, c.d); if (D < R.minD || (R.square && L > 2.5 * D)) continue;
    if (L > R.max && !(R.split && L <= R.maxLine && D <= 8)) { skipped++; continue; }
    const parts = L > R.max ? Math.max(1, Math.round(L / R.split)) : 1, alongX = c.w >= c.d;   // a long line becomes modules along its length
    for (let k = 0; k < parts; k++) { const a = -L / 2 + (k + 0.5) * L / parts, sub = { ...c, cx: c.cx + (alongX ? a : 0), cy: c.cy + (alongX ? 0 : a), w: alongX ? L / parts : c.w, d: alongX ? c.d : L / parts };
      obj(R.prefab, R.cat, R.name, sub, Math.max(sub.w, sub.d), Math.min(sub.w, sub.d), R.h, { source: "CAD layer " + R.layers.join(" / ") + (parts > 1 ? ` (line ${L.toFixed(1)} m, module ${k + 1}/${parts})` : ""), slots: R.slots ? Math.max(1, Math.round(Math.max(sub.w, sub.d) / 1.1) * 3) : undefined }); n++; } }
  log(R.prefab, R.layers[0], n); }
log("groups skipped as frames/outlines:", skipped);
let n = 0; for (const b of cad.inserts(["crane"], box, () => true).filter(b => Math.max(b.w, b.d) > 10 && Math.min(b.w, b.d) > 2)) { n++; E(`CRANE-${n}`, "Overhead bridge crane", "station", "CRANE_BRIDGE", S([b.x, b.y]), [b.w, b.d, 1.2], b.yaw_deg, { z: 6.2, parent: inBld(b.x, b.y), source: "CAD crane block " + b.block }); }
log("cranes", n);
n = 0; for (const b of cad.inserts(["0"], box, nm2 => /^\*U(4098|4107)$/.test(nm2))) { n++; E(`PAL-${String(n).padStart(3, "0")}`, "Pallet position", "storage", "PALLET", S([b.x, b.y]), [b.w, b.d, 1.25], b.yaw_deg, { slots: 1, parent: inBld(b.x, b.y), source: "CAD block " + b.block }); }
log("pallets", n);
L("LOAD_MARKINGS", "Load and lane markings", "marking", 0, 0.1, "#f4c20d", ["_load marking", "_lines"], segsOf(["_load marking", "_lines"], box, 0.3)); log("load markings", cadlayers.at(-1).count);
L("ROAD_MARKINGS", "Road and kerb lines", "marking", 0, 0.12, "#e8e8e8", ["_road", "road stone"], segsOf(["_road", "road stone"], [box[0] - 30, box[1] - 30, box[2] + 30, box[3] + 30], 0.5)); log("road markings", cadlayers.at(-1).count);
cad.close();
/* ---------- stops, devices and paths from the player's INJ 1 scene, moved onto CAD coordinates ---------- */
const sc = JSON.parse(readFileSync(C.scene, "utf8")), { dx, dy } = C.registration, P = ([x, y]) => S([x + dx, dy - y]);
const WAIT = { result: 60, mapping: 45, scan: 15, area: 90, gate: 0, dest: 30 }, kitting = 120;
const stops = sc.stops.map(s => ({ stop_id: s.id, name: s.name, symbol: ["result", "mapping", "area", "scan", "gate", "dest"].includes(s.symbol) ? s.symbol : "area", position_m: [...P([s.x, s.y]), 0], floor: s.floor || "1F", device_entity_id: null }));
const devPrefab = { pc: ["PC_STATION", "station"], "rfid-gate": ["RFID_GATE", "station"], scanner: ["SCANNER", "station"] };
for (const d of sc.devices || []) { const [pf, cat] = devPrefab[d.type] || ["PC_STATION", "station"]; const id = "DEV-" + d.id.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  const at = d.stand || d.at || [d.x, d.y], yaw = d.type === "rfid-gate" ? (d.lane === "east-west" ? 90 : 0) : -(d.heading || 0);   // plan y-down -> CAD y-up mirrors angles
  E(id, d.label || d.id, cat, pf, P(at), prefabs.find(p => p.prefab_id === pf).dimensions_m, yaw, { source: "player INJ 1 scene device (registered to CAD)" });
  if (d.serves || d.stop) { const st = stops.find(s => s.stop_id === (d.serves || d.stop)); if (st && !st.device_entity_id) st.device_entity_id = id; } }
const first = stops.find(s => s.stop_id === sc.paths[0].steps[0].stop).position_m;
E("TROLLEY-01", "INJ 1 parts trolley", "transporter", "TROLLEY", first, [1.2, 0.8, 1.5], 0, { caps: ["manual_push"], source: "path 1 trolley" });
E("OPERATOR-01", "Material handler", "worker", "OPERATOR", [first[0] - 1, first[1]], [0.6, 0.4, 1.75], 0, { source: "path 1 operator" });
E("AGV-01", "Kitting AGV", "transporter", "AGV", stops.find(s => s.stop_id === "to-mapping-gi")?.position_m || first, [1.4, 0.9, 0.35], 0, { caps: ["agv"], source: "path 1 AGV" });
const paths = sc.paths.map((p, k) => ({ path_id: p.id, name: p.name, color: p.color || (k ? "#22d3ee" : "#f59e0b"), trolley_entity_id: "TROLLEY-01", push_speed_mps: 1.0, agv_speed_mps: 1.2,
  steps: p.steps.map((s, i) => { const st = stops.find(x => x.stop_id === s.stop); return { stop: s.stop, mode: s.mode === "agv" ? "agv" : "push", wait_s: i === 0 ? 60 : s.stop === "kitting" ? kitting : WAIT[st?.symbol] ?? 30, title: s.title || st?.name || s.stop }; }),
  routes: p.steps.map(s => s.route && s.route.type === "points" ? s.route.points.map(P) : []), captions: p.steps.map(s => s.text || ""),
  notes: ["Route and stops from the player's INJ 1 scene, registered onto the CAD (96.6% line overlap).", "Wait times are assumed planning values (s), not measured; edit them here."] }));
for (const p of paths) {   // the drawn route vs the true CAD layout: record every clash in the path itself
  const c = clearance(p, entities, cadlayers);
  p.clearance = { checked: new Date().toISOString().slice(0, 10), objects_on_route: c.objects, walls_crossed: c.walls };
  p.notes.push(`Clearance vs CAD: ${c.objects.length} object(s) on the route, ${c.walls.length} wall crossing(s) (route from the current plan, objects from the Y26 CAD).`);
  log(`clearance ${p.path_id}: ${c.objects.length} objects on route (${[...new Set(c.objects.map(o => o.id.replace(/-\d+$/, "")))].join(", ")}), ${c.walls.length} wall crossings`); }
log("stops", stops.length, "paths", paths.length);

/* ---------- navigation graph from the routes (for the engine and the map) ---------- */
const nodes = new Map(), edges = new Map(), nodeAt = ([x, y]) => { const k = `${Math.round(x * 20)},${Math.round(y * 20)}`; if (!nodes.has(k)) nodes.set(k, { node_id: "N" + String(nodes.size + 1).padStart(3, "0"), position_m: [r2(x), r2(y), 0] }); return nodes.get(k).node_id; };
for (const p of paths) for (const r of p.routes) for (let i = 1; i < r.length; i++) { const a = nodeAt(r[i - 1]), b = nodeAt(r[i]); if (a === b) continue; const k = [a, b].sort().join("-"); if (!edges.has(k)) edges.set(k, { edge_id: "E" + String(edges.size + 1).padStart(3, "0"), from_node: a, to_node: b, bidirectional: true, width_m: 2.5, speed_limit_mps: 1.2, allowed_modes: ["pedestrian", "manual_trolley"] }); }

/* ---------- write everything as one checked, recorded command ---------- */
const [xs, ys] = [[], []]; for (const b of C.buildings) { xs.push(...b.x); ys.push(...b.y); }
const blueprint = { schema_version: "0.1.0", sample_only: false, notes: [`Imported from ${C.cad_name} (true dimensions, CAD millimetres -> metres).`, `Site frame = CAD world metres minus origin (${ox}, ${oy}).`, "Objects in the INJ 1 hall and the INJ 2 press row are detected from CAD geometry; buildings, walls and columns cover E1, E2 and EPS."],
  factory: { factory_id: C.factory.factory_id, name: C.factory.name, length_unit: "m", time_unit: "s", mass_unit: "kg", axes: "right_handed_xy_ground_z_up", origin: "cad_world_minus_offset", site_dimensions_m: [r2(Math.max(...xs) - ox + 10), r2(Math.max(...ys) - oy + 10), 12], snap_step_m: 0.05 },
  items: [{ item_id: "INJ_PARTS_LOT", name: "Injection parts lot (trolley load)", unit: "ea", tracking: "lot" }], prefabs, entities, ports: [], processes: [], material_flows: [],
  navigation: { nodes: [...nodes.values()], edges: [...edges.values()] }, handling_policies: [], replenishment_policies: [], initial_conditions: { random_seed: 1, handling_units: [], active_missions: [] } };
mkdirSync(dirname(dbFile), { recursive: true });
const store = await Store.open(dbFile);
const res = store.command({ actor: "cad-import", type: "import", force: true, payload: { blueprint, scenarios: {}, extras: { cadlayer: cadlayers, stop: stops, path: paths }, label: `import real factory from ${C.cad_name}` } });
if (!res.ok) throw new Error("import refused: " + res.reason);
const meta = store.get("factory", C.factory.factory_id); store.command({ actor: "cad-import", type: "record.update", force: true, payload: { type: "factory", id: C.factory.factory_id, set: { "_meta.cad_origin_m": [ox, oy], "_meta.cad_source": C.cad_name, "_meta.registration": C.registration } } });
log(`imported: revision ${store.revision}, ${entities.length} entities, ${cadlayers.reduce((a, l) => a + l.count, 0)} CAD shapes, ${stops.length} stops, ${paths.length} paths; problems ${store.problems().length}`);
for (const p of store.problems().slice(0, 8)) console.log("  problem:", p.where, p.message);
for (const p of paths) {   // the drawn routes come from the current plan: reroute any step that clashes with the CAD, then time it
  const r = process.argv.includes("--no-autoroute") ? { path: p.path_id, ...runAndSave(store, p.path_id, "cad-import") } : autoRoute(store, p.path_id, "cad-import");
  const k = r.run ? r : runAndSave(store, p.path_id, "cad-import");
  log(`path ${p.path_id}: ${r.changed?.filter(c => !c.failed).length || 0} step(s) auto-routed, clashes left ${r.clash_after ?? "-"}; engine ${k.run || k.id}: trip ${k.trip_s} s, ${k.distance_m} m`); }
store.close();
