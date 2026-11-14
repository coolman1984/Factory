// Master data registry of the Factory Control Center: one entry per kind of record. The same file drives the database store,
// the command line, the API checks and the generated UI forms (it runs in Node and in the browser).
// Every record is stored as the blueprint's own JSON object (schemas/factory-blueprint.schema.json); `section` says where it
// goes when the blueprint is assembled. Field paths may be dotted ("transform.position_m").
// Field kinds: text, number, int, bool, enum, ref (one id of `ref` type), refs (list of ids), tags (free strings), vec3,
// rows (list of objects with `fields`), list (free text lines), json.

const UNITS = ["ea", "kg", "g", "lot"];
const CATEGORIES = ["site", "zone", "line", "station", "storage", "container", "transporter", "worker"];
const MODES = ["pedestrian", "manual_trolley"];

export const TYPES = [
  { type: "factory", label: "Factory", group: "Site", section: "factory", single: true, key: "factory_id", columns: ["factory_id", "name", "site_dimensions_m"],
    help: "The site: name, units, axes and size. Units must stay m, s, kg.",
    fields: [
      { key: "factory_id", kind: "text", required: true }, { key: "name", kind: "text" },
      { key: "length_unit", kind: "enum", options: ["m"], default: "m" }, { key: "time_unit", kind: "enum", options: ["s"], default: "s" }, { key: "mass_unit", kind: "enum", options: ["kg"], default: "kg" },
      { key: "axes", kind: "text", default: "right_handed_xy_ground_z_up" }, { key: "origin", kind: "text", default: "center_of_site_floor" },
      { key: "site_dimensions_m", kind: "vec3", label: "Site size (m)" }, { key: "snap_step_m", kind: "number", min: 0 },
      { key: "_meta.schema_version", kind: "text", label: "Schema version", default: "0.1.0" }, { key: "_meta.sample_only", kind: "bool", label: "Sample data only", default: true },
      { key: "_meta.random_seed", kind: "int", label: "Blueprint random seed", default: 1 }, { key: "_meta.notes", kind: "list", label: "Notes" }
    ] },
  { type: "item", label: "Items", group: "Products", section: "items", key: "item_id", columns: ["item_id", "name", "unit", "tracking"],
    help: "Materials, parts and products. Serial items (ea only) get one number per unit.",
    fields: [{ key: "item_id", kind: "text", required: true }, { key: "name", kind: "text" }, { key: "unit", kind: "enum", options: UNITS, required: true, default: "ea" },
      { key: "tracking", kind: "enum", options: ["quantity", "lot", "serial"], default: "lot" }] },
  { type: "prefab", label: "Prefabs", group: "Layout", section: "prefabs", key: "prefab_id", columns: ["prefab_id", "version", "category", "dimensions_m"],
    help: "Reusable object types (size, category). Entities name a prefab and its version.",
    fields: [{ key: "prefab_id", kind: "text", required: true }, { key: "version", kind: "text", required: true, default: "0.1.0" }, { key: "category", kind: "enum", options: CATEGORIES, required: true },
      { key: "dimensions_m", kind: "vec3", label: "Size (m)" }, { key: "capabilities", kind: "tags" }, { key: "visual_asset", kind: "text", nullable: true }] },
  { type: "entity", label: "Entities", group: "Layout", section: "entities", key: "entity_id", columns: ["entity_id", "name", "category", "spatial_parent_id", "transform.position_m"],
    help: "Everything placed in the factory: zones, lines, stations, stores, containers, trolleys, workers. Position is relative to the spatial parent.",
    fields: [{ key: "entity_id", kind: "text", required: true }, { key: "name", kind: "text" }, { key: "category", kind: "enum", options: CATEGORIES, required: true },
      { key: "org_parent_id", kind: "ref", ref: "entity", nullable: true, label: "Organisation parent" }, { key: "spatial_parent_id", kind: "ref", ref: "entity", nullable: true, label: "Spatial parent" },
      { key: "prefab_id", kind: "ref", ref: "prefab", nullable: true }, { key: "prefab_version", kind: "text", nullable: true },
      { key: "transform.position_m", kind: "vec3", label: "Position (m)", default: [0, 0, 0] }, { key: "transform.yaw_deg", kind: "number", label: "Yaw (deg)", default: 0 },
      { key: "capabilities", kind: "tags" }, { key: "storage_capacity.handling_unit_slots", kind: "int", label: "Storage slots", min: 0, nullable: true },
      { key: "size_m", kind: "vec3", label: "Size of this object (m)", nullable: true }, { key: "model_asset", kind: "text", label: "3D model (GLB)", nullable: true },
      { key: "source", kind: "text", label: "Source (CAD layer / block)", nullable: true }] },
  { type: "port", label: "Ports", group: "Layout", section: "ports", key: "port_id", columns: ["port_id", "owner_entity_id", "role", "navigation_node_id"],
    help: "Where material enters or leaves a store: linked to a navigation node and the items it accepts.",
    fields: [{ key: "port_id", kind: "text", required: true }, { key: "owner_entity_id", kind: "ref", ref: "entity", required: true }, { key: "role", kind: "enum", options: ["material_in", "material_out"], required: true },
      { key: "local_position_m", kind: "vec3", default: [0, 0, 0] }, { key: "navigation_node_id", kind: "ref", ref: "node", required: true }, { key: "accepted_item_ids", kind: "refs", ref: "item" }, { key: "capacity", kind: "int", min: 1, default: 1 }] },
  { type: "node", label: "Nav nodes", group: "Navigation", section: "navigation.nodes", key: "node_id", columns: ["node_id", "position_m"],
    help: "Points of the aisle network (world coordinates, m).",
    fields: [{ key: "node_id", kind: "text", required: true }, { key: "position_m", kind: "vec3", required: true, default: [0, 0, 0] }] },
  { type: "edge", label: "Aisles", group: "Navigation", section: "navigation.edges", key: "edge_id", columns: ["edge_id", "from_node", "to_node", "width_m", "speed_limit_mps"],
    help: "Aisle segments between nodes: width, speed limit, who may use them. Narrow aisles can become one-lane traffic zones (scenario).",
    fields: [{ key: "edge_id", kind: "text", required: true }, { key: "from_node", kind: "ref", ref: "node", required: true }, { key: "to_node", kind: "ref", ref: "node", required: true },
      { key: "bidirectional", kind: "bool", default: true }, { key: "width_m", kind: "number", min: 0.1, required: true, default: 2.5 }, { key: "speed_limit_mps", kind: "number", min: 0.01, default: 1.2 },
      { key: "allowed_modes", kind: "tags", options: MODES, default: MODES }] },
  { type: "process", label: "Processes", group: "Production", section: "processes", key: "process_id", columns: ["process_id", "station_entity_id", "duration_s", "parallel_slots"],
    help: "What a station makes: inputs from its input store, outputs to its output store, cycle time and parallel slots.",
    fields: [{ key: "process_id", kind: "text", required: true }, { key: "station_entity_id", kind: "ref", ref: "entity", filter: { category: "station" }, required: true },
      { key: "input_location_id", kind: "ref", ref: "entity", required: true }, { key: "output_location_id", kind: "ref", ref: "entity", required: true },
      { key: "inputs", kind: "rows", fields: [{ key: "item_id", kind: "ref", ref: "item", required: true }, { key: "quantity", kind: "number", min: 0, required: true }, { key: "unit", kind: "enum", options: UNITS, required: true }] },
      { key: "outputs", kind: "rows", fields: [{ key: "item_id", kind: "ref", ref: "item", required: true }, { key: "quantity", kind: "number", min: 0, required: true }, { key: "unit", kind: "enum", options: UNITS, required: true }] },
      { key: "duration_s", kind: "number", min: 0.001, required: true, label: "Cycle (s)" }, { key: "parallel_slots", kind: "int", min: 1, default: 1 },
      { key: "quality_policy", kind: "text", default: "illustrative_all_pass" }, { key: "failure_policy", kind: "text", default: "not_modeled_in_this_sample" }] },
  { type: "flow", label: "Material flows", group: "Logistics", section: "material_flows", key: "flow_id", columns: ["flow_id", "item_id", "from_port_id", "to_port_id", "handling_policy_id"],
    help: "Which item moves from which port to which port, and who moves it.",
    fields: [{ key: "flow_id", kind: "text", required: true }, { key: "item_id", kind: "ref", ref: "item", required: true }, { key: "from_port_id", kind: "ref", ref: "port", required: true },
      { key: "to_port_id", kind: "ref", ref: "port", required: true }, { key: "handling_policy_id", kind: "ref", ref: "handling", required: true }] },
  { type: "handling", label: "Handling teams", group: "Logistics", section: "handling_policies", key: "policy_id", columns: ["policy_id", "transporter_entity_ids", "worker_entity_ids"],
    help: "Trolleys and workers that serve a set of flows.",
    fields: [{ key: "policy_id", kind: "text", required: true }, { key: "transporter_entity_ids", kind: "refs", ref: "entity", filter: { category: "transporter" } },
      { key: "worker_entity_ids", kind: "refs", ref: "entity", filter: { category: "worker" } }, { key: "required_capabilities", kind: "tags" }, { key: "max_handling_units_per_trip", kind: "int", min: 1, default: 1 }] },
  { type: "replenishment", label: "Replenishment", group: "Logistics", section: "replenishment_policies", key: "policy_id", columns: ["policy_id", "item_id", "destination_entity_id", "reorder_point", "target_level"],
    help: "Pull levels for an item at a store (overrides the scenario's default levels).",
    fields: [{ key: "policy_id", kind: "text", required: true }, { key: "item_id", kind: "ref", ref: "item", required: true }, { key: "destination_entity_id", kind: "ref", ref: "entity", required: true },
      { key: "source_port_id", kind: "ref", ref: "port", required: true }, { key: "destination_port_id", kind: "ref", ref: "port", required: true },
      { key: "reorder_point", kind: "number", min: 0, required: true }, { key: "target_level", kind: "number", min: 0, required: true }, { key: "unit", kind: "enum", options: UNITS, required: true }, { key: "count_confirmed_inbound", kind: "bool", default: true }] },
  { type: "stock", label: "Initial stock", group: "Stock", section: "initial_conditions.handling_units", key: "handling_unit_id", columns: ["handling_unit_id", "location_entity_id", "lot_id", "contents"],
    help: "Handling units present at the start of a run.",
    fields: [{ key: "handling_unit_id", kind: "text", required: true }, { key: "location_entity_id", kind: "ref", ref: "entity", required: true }, { key: "lot_id", kind: "text", nullable: true },
      { key: "contents", kind: "rows", fields: [{ key: "item_id", kind: "ref", ref: "item", required: true }, { key: "quantity", kind: "number", min: 0, required: true }, { key: "unit", kind: "enum", options: UNITS, required: true }] }] },
  { type: "shipping", label: "Shipping", group: "Stock", section: "shipping", single: true, key: "container_entity_id", columns: ["container_entity_id", "internal_dimensions_m", "max_payload_kg"],
    help: "The shipping container: inner size and payload, used by the packing plan.",
    fields: [{ key: "container_entity_id", kind: "ref", ref: "entity", filter: { category: "container" }, required: true }, { key: "internal_dimensions_m", kind: "vec3", label: "Inner size (m)" },
      { key: "max_payload_kg", kind: "number", min: 0 }, { key: "packing_plan_status", kind: "text", default: "not_calculated" }] },
  { type: "cadlayer", label: "CAD layers", group: "Layout", section: null, key: "layer_id", columns: ["layer_id", "label", "kind", "height_m", "count"],
    help: "Building geometry imported from AutoCAD in true metres (site frame): walls, partitions and columns as line segments or rectangles. The 2D map and the 3D viewer draw these.",
    fields: [{ key: "layer_id", kind: "text", required: true }, { key: "label", kind: "text" }, { key: "kind", kind: "enum", options: ["exterior_wall", "wall", "partition", "column", "marking", "outline", "slab"], required: true, default: "wall" },
      { key: "z_m", kind: "number", label: "Base height (m)", default: 0 }, { key: "floor", kind: "text", default: "1F" },
      { key: "height_m", kind: "number", min: 0, default: 3 }, { key: "thickness_m", kind: "number", min: 0, default: 0.2 }, { key: "color", kind: "text", default: "#9aa3ad" },
      { key: "source_layers", kind: "tags", label: "CAD source layers" }, { key: "count", kind: "int", min: 0, label: "Shapes" },
      { key: "segments", kind: "json", label: "Segments [x1,y1,x2,y2] or rectangles [x,y,w,d,yaw] (m)" }] },
  { type: "stop", label: "Stops", group: "Routes", section: null, key: "stop_id", columns: ["stop_id", "name", "symbol", "position_m"],
    help: "Points a trolley visits (scan PCs, gates, warehouses, lines), in true metres of the site frame.",
    fields: [{ key: "stop_id", kind: "text", required: true }, { key: "name", kind: "text" }, { key: "symbol", kind: "enum", options: ["result", "mapping", "area", "scan", "gate", "dest"], default: "area" },
      { key: "position_m", kind: "vec3", label: "Position (m)", required: true, default: [0, 0, 0] }, { key: "floor", kind: "text", default: "1F" }, { key: "device_entity_id", kind: "ref", ref: "entity", nullable: true, label: "Device at the stop" }] },
  { type: "path", label: "Trolley paths", group: "Routes", section: null, key: "path_id", columns: ["path_id", "name", "trolley_entity_id", "push_speed_mps"],
    help: "A trolley trip: ordered steps (stop, mode, wait) and the drawn route of each step in true metres. The engine times the trip; the 3D film follows it.",
    fields: [{ key: "path_id", kind: "text", required: true }, { key: "name", kind: "text" }, { key: "tab", kind: "text", label: "Process tab" }, { key: "color", kind: "text", default: "#f59e0b" },
      { key: "trolley_entity_id", kind: "ref", ref: "entity", filter: { category: "transporter" }, nullable: true, label: "Trolley" },
      { key: "push_speed_mps", kind: "number", min: 0.1, default: 1.0, label: "Push speed (m/s)" }, { key: "agv_speed_mps", kind: "number", min: 0.1, default: 1.2, label: "AGV speed (m/s)" }, { key: "lift_s", kind: "number", min: 0, default: 60, label: "Elevator ride incl. doors (s)" },
      { key: "steps", kind: "rows", fields: [{ key: "stop", kind: "ref", ref: "stop", required: true }, { key: "mode", kind: "enum", options: ["push", "agv"], required: true }, { key: "wait_s", kind: "number", min: 0, required: true }, { key: "title", kind: "text" }, { key: "lift", kind: "text" }] },
      { key: "routes", kind: "json", label: "Route points per step [[x,y],...] (m)" }, { key: "captions", kind: "json", label: "Caption text per step" }, { key: "clearance", kind: "json", label: "Clearance vs CAD (objects on the route, walls crossed)" }, { key: "notes", kind: "list" }] },
  { type: "scenario", label: "Scenarios", group: "Scenarios", section: null, key: "id", columns: ["id", "note", "horizon_h", "seed"],
    help: "Run settings: horizon, seed, speeds, handling times, pull/push rules, breakdowns, quality, traffic and shipping. One blueprint, many experiments.",
    fields: [{ key: "id", kind: "text", required: true }, { key: "note", kind: "text" }, { key: "horizon_h", kind: "number", min: 0.01, default: 8 }, { key: "seed", kind: "int", default: 1 },
      { key: "tick_per_second", kind: "int", min: 1, default: 1000 }, { key: "trolley_speed_mps", kind: "number", min: 0.01, default: 1 }, { key: "walk_speed_mps", kind: "number", min: 0.01, default: 1.2 },
      { key: "load_s", kind: "number", min: 0, default: 30 }, { key: "unload_s", kind: "number", min: 0, default: 30 },
      { key: "pull.reorder_cycles", kind: "number", min: 0, default: 2 }, { key: "pull.target_cycles", kind: "number", min: 0, default: 6 }, { key: "push.lot", kind: "number", min: 1, default: 10 },
      { key: "slot_size.ea", kind: "number", min: 1, default: 10 }, { key: "slot_size.kg", kind: "number", min: 1, default: 25 }, { key: "serial_prefix", kind: "text", default: "SN" },
      { key: "breakdowns", kind: "rows", fields: [{ key: "process", kind: "ref", ref: "process", required: true }, { key: "mtbf_s", kind: "number", min: 1, required: true }, { key: "mttr_s", kind: "number", min: 1, required: true }] },
      { key: "quality", kind: "rows", fields: [{ key: "process", kind: "ref", ref: "process", required: true }, { key: "pass_rate", kind: "number", min: 0, max: 1, required: true }, { key: "repair_s", kind: "number", min: 1, default: 300 }, { key: "repair_slots", kind: "int", min: 1, default: 1 }] },
      { key: "traffic.one_lane_below_m", kind: "number", min: 0, default: 0, label: "One-lane below (m)" }, { key: "closed_edges", kind: "refs", ref: "edge" },
      { key: "shipping.carton_m", kind: "vec3", label: "Carton size (m)", nullable: true }, { key: "shipping.carton_kg", kind: "number", min: 0, nullable: true }, { key: "shipping.allow_tipping", kind: "bool", default: false }] }
];

export const TYPE = Object.fromEntries(TYPES.map(t => [t.type, t]));
export const GROUPS = [...new Set(TYPES.map(t => t.group))];

export function getPath(obj, path) { let o = obj; for (const k of path.split(".")) { if (o == null) return undefined; o = o[k]; } return o; }
export function setPath(obj, path, value) {
  const keys = path.split("."); let o = obj;
  for (const k of keys.slice(0, -1)) { if (o[k] == null || typeof o[k] !== "object") o[k] = {}; o = o[k]; }
  if (value === undefined) delete o[keys[keys.length - 1]]; else o[keys[keys.length - 1]] = value;
  return obj;
}
export const idOf = (type, data) => TYPE[type].single && TYPE[type].type === "shipping" ? "shipping" : getPath(data, TYPE[type].key);

// Field-level check of one record (references are checked against `exists(type, id)`). Returns readable problems.
export function checkRecord(type, data, exists = () => true) {
  const T = TYPE[type], out = []; if (!T) return [`unknown type ${type}`];
  const one = (f, v, where) => {
    const name = where + (f.label || f.key);
    if (v === undefined || v === null || v === "") { if (f.required) out.push(`${name} is required`); return; }
    switch (f.kind) {
      case "number": case "int": if (typeof v !== "number" || !Number.isFinite(v)) out.push(`${name} must be a number`); else { if (f.kind === "int" && !Number.isInteger(v)) out.push(`${name} must be a whole number`); if (f.min != null && v < f.min) out.push(`${name} must be >= ${f.min}`); if (f.max != null && v > f.max) out.push(`${name} must be <= ${f.max}`); } break;
      case "bool": if (typeof v !== "boolean") out.push(`${name} must be true or false`); break;
      case "enum": if (!f.options.includes(v)) out.push(`${name} must be one of ${f.options.join(", ")}`); break;
      case "text": if (typeof v !== "string") out.push(`${name} must be text`); break;
      case "vec3": if (!Array.isArray(v) || v.length !== 3 || !v.every(x => typeof x === "number" && Number.isFinite(x))) out.push(`${name} must be three numbers`); break;
      case "ref": if (typeof v !== "string" || !exists(f.ref, v)) out.push(`${name}: ${f.ref} ${v} does not exist`); break;
      case "refs": if (!Array.isArray(v)) out.push(`${name} must be a list`); else for (const x of v) if (!exists(f.ref, x)) out.push(`${name}: ${f.ref} ${x} does not exist`); break;
      case "tags": case "list": if (!Array.isArray(v) || !v.every(x => typeof x === "string")) out.push(`${name} must be a list of text`); else if (f.options) for (const x of v) if (!f.options.includes(x)) out.push(`${name}: ${x} is not one of ${f.options.join(", ")}`); break;
      case "rows": if (!Array.isArray(v)) out.push(`${name} must be a list`); else v.forEach((row, i) => { for (const sf of f.fields) one(sf, row ? row[sf.key] : undefined, `${name} row ${i + 1}: `); }); break;
      case "json": break;
    }
  };
  for (const f of T.fields) one(f, getPath(data, f.key), "");
  const id = idOf(type, data); if (!T.single && (typeof id !== "string" || !/^[A-Za-z0-9_.:\-]+$/.test(id))) out.push(`${T.key} must use letters, digits, _ . : - only`);
  return out;
}

// A new record with the defaults filled in.
export function blank(type, id) {
  const T = TYPE[type], d = {};
  for (const f of T.fields) { if (f.default !== undefined) setPath(d, f.key, JSON.parse(JSON.stringify(f.default))); else if (["rows", "refs", "tags", "list"].includes(f.kind)) setPath(d, f.key, []); else if (f.nullable) setPath(d, f.key, null); }
  if (id != null) setPath(d, T.key, id); return d;
}

// Every place that points at (type, id): [{ type, id, field }].
export function refsTo(records, type, id) {
  const out = [];
  for (const T of TYPES) for (const r of records[T.type] || []) for (const f of T.fields) {
    const v = getPath(r.data, f.key);
    if (f.ref === type && (f.kind === "ref" ? v === id : f.kind === "refs" && Array.isArray(v) && v.includes(id))) out.push({ type: T.type, id: r.id, field: f.key });
    if (f.kind === "rows" && Array.isArray(v)) for (const sf of f.fields) if (sf.ref === type && v.some(row => row && row[sf.key] === id)) out.push({ type: T.type, id: r.id, field: f.key + "." + sf.key });
  }
  return out;
}
// Rewrite every reference to (type, from) as `to` inside one record's data (returns true if changed).
export function renameRefs(recType, data, type, from, to) {
  let changed = false;
  for (const f of TYPE[recType].fields) {
    const v = getPath(data, f.key);
    if (f.ref === type && f.kind === "ref" && v === from) { setPath(data, f.key, to); changed = true; }
    if (f.ref === type && f.kind === "refs" && Array.isArray(v) && v.includes(from)) { setPath(data, f.key, v.map(x => x === from ? to : x)); changed = true; }
    if (f.kind === "rows" && Array.isArray(v)) for (const sf of f.fields) if (sf.ref === type) for (const row of v) if (row && row[sf.key] === from) { row[sf.key] = to; changed = true; }
  }
  return changed;
}

// Scenario record -> engine scenario object (rows become the engine's keyed maps).
export function toEngineScenario(s) {
  const o = JSON.parse(JSON.stringify(s)); delete o.id; delete o.note;
  o.breakdowns = Object.fromEntries((s.breakdowns || []).map(b => [b.process, { mtbf_s: b.mtbf_s, mttr_s: b.mttr_s }]));
  o.quality = Object.fromEntries((s.quality || []).map(q => [q.process, { pass_rate: q.pass_rate, repair_s: q.repair_s, repair_slots: q.repair_slots }]));
  if (!s.shipping || !Array.isArray(s.shipping.carton_m)) o.shipping = null;
  o.closed_edges = s.closed_edges || [];
  return o;
}
// Engine scenario file -> scenario record.
export function fromEngineScenario(id, sc) {
  const o = JSON.parse(JSON.stringify(sc)); delete o.format; delete o.version;
  o.id = id; o.note = sc.note || "";
  o.breakdowns = Object.entries(sc.breakdowns || {}).map(([process, b]) => ({ process, mtbf_s: b.mtbf_s, mttr_s: b.mttr_s }));
  o.quality = Object.entries(sc.quality || {}).map(([process, q]) => ({ process, pass_rate: q.pass_rate, repair_s: q.repair_s ?? 300, repair_slots: q.repair_slots ?? 1 }));
  return o;
}
