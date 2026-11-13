// Factory blueprint (schemas/factory-blueprint.schema.json): semantic checks (WP0.3) and conversion to an engine model.
// The blueprint is the definition; the scenario holds start-up and run settings, so one blueprint serves many experiments.
import { EngineError, unitInfo, toBaseQty, sameDimension } from "./units.js";
import { RouteGraph } from "./routes.js";

const MODE_OF = { transporter: "manual_trolley", worker: "pedestrian" };

// World position of an entity: its local transform composed with every spatial parent (yaw about the vertical axis).
export function worldTransform(bp, entityId) {
  const byId = new Map(bp.entities.map(e => [e.entity_id, e])); const chain = []; let e = byId.get(entityId); const seen = new Set();
  while (e) { if (seen.has(e.entity_id)) throw new EngineError("spatial_cycle", `spatial parent cycle at ${e.entity_id}`); seen.add(e.entity_id); chain.unshift(e); e = e.spatial_parent_id ? byId.get(e.spatial_parent_id) : null; }
  let x = 0, y = 0, z = 0, yaw = 0;
  for (const c of chain) { const [lx, ly, lz] = c.transform?.position_m || [0, 0, 0], r = yaw * Math.PI / 180; x += lx * Math.cos(r) - ly * Math.sin(r); y += lx * Math.sin(r) + ly * Math.cos(r); z += lz; yaw += c.transform?.yaw_deg || 0; }
  return { x, y, z, yaw_deg: yaw };
}

export function validateBlueprint(bp) {
  const P = [], add = (code, msg) => P.push({ code, message: msg });
  if (!bp || typeof bp !== "object") return [{ code: "not_object", message: "blueprint is not a JSON object" }];
  if (typeof bp.schema_version !== "string") add("schema_version", "schema_version is missing");
  const f = bp.factory || {};
  if (f.length_unit !== "m" || f.time_unit !== "s" || f.mass_unit !== "kg") add("units", "factory units must be m, s and kg");
  const index = (list, key, kind) => { const m = new Map(); for (const x of list || []) { const id = x?.[key]; if (typeof id !== "string" || !id) add("missing_id", `${kind}: entry without ${key}`); else if (m.has(id)) add("duplicate_id", `${kind} ${id} appears twice`); else m.set(id, x); } return m; };
  const items = index(bp.items, "item_id", "item"), prefabs = index(bp.prefabs, "prefab_id", "prefab"), ents = index(bp.entities, "entity_id", "entity"), ports = index(bp.ports, "port_id", "port");
  const procs = index(bp.processes, "process_id", "process"), flows = index(bp.material_flows, "flow_id", "material flow"), nodes = index(bp.navigation?.nodes, "node_id", "navigation node"), edges = index(bp.navigation?.edges, "edge_id", "navigation edge");
  const handling = index(bp.handling_policies, "policy_id", "handling policy"), repl = index(bp.replenishment_policies, "policy_id", "replenishment policy"), hus = index(bp.initial_conditions?.handling_units, "handling_unit_id", "handling unit");
  for (const [id, it] of items) { try { unitInfo(it.unit); } catch { add("unknown_unit", `item ${id}: unknown unit ${it.unit}`); } }
  const qty = (where, itemId, q, unit) => {
    const it = items.get(itemId); if (!it) { add("unknown_ref", `${where}: unknown item ${itemId}`); return; }
    try { if (!sameDimension(unit, it.unit)) add("unit_mismatch", `${where}: ${itemId} is measured in ${it.unit}, not ${unit}`); else toBaseQty(q, unit); } catch (e) { add(e.code || "bad_quantity", `${where}: ${e.message}`); }
  };
  // entities: references, prefab versions, cycles
  for (const [id, e] of ents) {
    for (const k of ["org_parent_id", "spatial_parent_id"]) if (e[k] != null && !ents.has(e[k])) add("unknown_ref", `entity ${id}: ${k} ${e[k]} does not exist`);
    if (e.prefab_id != null) { const pf = prefabs.get(e.prefab_id); if (!pf) add("unknown_ref", `entity ${id}: prefab ${e.prefab_id} does not exist`); else if (e.prefab_version !== pf.version) add("prefab_version", `entity ${id}: prefab ${e.prefab_id} is version ${pf.version}, entity uses ${e.prefab_version}`); }
  }
  for (const k of ["org_parent_id", "spatial_parent_id"]) for (const id of ents.keys()) { const seen = new Set(); let c = id; while (c != null && ents.has(c)) { if (seen.has(c)) { add("parent_cycle", `entity ${id}: ${k} chain loops`); break; } seen.add(c); c = ents.get(c)[k]; } }
  // ports
  for (const [id, p] of ports) {
    if (!ents.has(p.owner_entity_id)) add("unknown_ref", `port ${id}: owner ${p.owner_entity_id} does not exist`);
    if (!nodes.has(p.navigation_node_id)) add("unknown_ref", `port ${id}: navigation node ${p.navigation_node_id} does not exist`);
    if (!["material_in", "material_out"].includes(p.role)) add("port_role", `port ${id}: role must be material_in or material_out`);
    for (const i of p.accepted_item_ids || []) if (!items.has(i)) add("unknown_ref", `port ${id}: accepts unknown item ${i}`);
  }
  // navigation
  for (const [id, e] of edges) { for (const k of ["from_node", "to_node"]) if (!nodes.has(e[k])) add("unknown_ref", `edge ${id}: ${k} ${e[k]} does not exist`); if (!(e.width_m > 0)) add("edge_width", `edge ${id}: width must be > 0`); }
  // processes
  const producedBy = new Map(), consumedAt = new Map();
  for (const [id, pr] of procs) {
    const st = ents.get(pr.station_entity_id); if (!st) add("unknown_ref", `process ${id}: station ${pr.station_entity_id} does not exist`); else if (st.category !== "station") add("category", `process ${id}: ${pr.station_entity_id} is a ${st.category}, not a station`);
    for (const k of ["input_location_id", "output_location_id"]) if (!ents.has(pr[k])) add("unknown_ref", `process ${id}: ${k} ${pr[k]} does not exist`);
    for (const i of pr.inputs || []) { qty(`process ${id} input`, i.item_id, i.quantity, i.unit); consumedAt.set(pr.input_location_id + "|" + i.item_id, id); }
    for (const o of pr.outputs || []) { qty(`process ${id} output`, o.item_id, o.quantity, o.unit); producedBy.set(o.item_id, id); }
    if (!(pr.duration_s > 0)) add("duration", `process ${id}: duration_s must be > 0`);
    if (!(Number.isInteger(pr.parallel_slots) && pr.parallel_slots >= 1)) add("slots", `process ${id}: parallel_slots must be a whole number >= 1`);
  }
  // initial stock and the material sequence: every input is raw stock or some process output
  const raw = new Set();
  for (const [id, h] of hus) { if (!ents.has(h.location_entity_id)) add("unknown_ref", `handling unit ${id}: location ${h.location_entity_id} does not exist`); for (const c of h.contents || []) { qty(`handling unit ${id}`, c.item_id, c.quantity, c.unit); raw.add(c.item_id); } }
  for (const [id, pr] of procs) for (const i of pr.inputs || []) if (!raw.has(i.item_id) && !producedBy.has(i.item_id)) add("no_source", `process ${id}: input ${i.item_id} is neither initial stock nor produced by any process`);
  // handling policies
  for (const [id, h] of handling) {
    for (const t of h.transporter_entity_ids || []) if (ents.get(t)?.category !== "transporter") add("category", `handling ${id}: ${t} is not a transporter`);
    for (const w of h.worker_entity_ids || []) if (ents.get(w)?.category !== "worker") add("category", `handling ${id}: ${w} is not a worker`);
  }
  // material flows: port roles, accepted items, handling, and a real route on the navigation graph
  let graph = null; try { graph = new RouteGraph(navGraph(bp)); } catch (e) { add("navigation", e.message); }
  for (const [id, fl] of flows) {
    if (!items.has(fl.item_id)) add("unknown_ref", `flow ${id}: unknown item ${fl.item_id}`);
    const a = ports.get(fl.from_port_id), b = ports.get(fl.to_port_id);
    if (!a) add("unknown_ref", `flow ${id}: from port ${fl.from_port_id} does not exist`); else { if (a.role !== "material_out") add("port_role", `flow ${id}: from port ${a.port_id} is not material_out`); if (!(a.accepted_item_ids || []).includes(fl.item_id)) add("port_item", `flow ${id}: port ${a.port_id} does not accept ${fl.item_id}`); }
    if (!b) add("unknown_ref", `flow ${id}: to port ${fl.to_port_id} does not exist`); else { if (b.role !== "material_in") add("port_role", `flow ${id}: to port ${b.port_id} is not material_in`); if (!(b.accepted_item_ids || []).includes(fl.item_id)) add("port_item", `flow ${id}: port ${b.port_id} does not accept ${fl.item_id}`); }
    if (!handling.has(fl.handling_policy_id)) add("unknown_ref", `flow ${id}: handling policy ${fl.handling_policy_id} does not exist`);
    if (graph && a && b && nodes.has(a.navigation_node_id) && nodes.has(b.navigation_node_id) && !graph.find(a.navigation_node_id, b.navigation_node_id, "manual_trolley", Infinity)) add("no_route", `flow ${id}: no manual-trolley route from ${a.navigation_node_id} to ${b.navigation_node_id}`);
    if (a && ents.has(a.owner_entity_id) && !ents.get(a.owner_entity_id).storage_capacity) add("flow_source", `flow ${id}: source ${a.owner_entity_id} is not a storage location`);
    if (b && ents.has(b.owner_entity_id) && !ents.get(b.owner_entity_id).storage_capacity) add("flow_target", `flow ${id}: destination ${b.owner_entity_id} is not a storage location`);
  }
  for (const [id, r] of repl) {
    if (!items.has(r.item_id)) add("unknown_ref", `replenishment ${id}: unknown item ${r.item_id}`);
    if (!ents.has(r.destination_entity_id)) add("unknown_ref", `replenishment ${id}: destination ${r.destination_entity_id} does not exist`);
    for (const k of ["source_port_id", "destination_port_id"]) if (!ports.has(r[k])) add("unknown_ref", `replenishment ${id}: ${k} ${r[k]} does not exist`);
    if (!(r.target_level > r.reorder_point)) add("levels", `replenishment ${id}: target_level must be above reorder_point`);
    if (items.has(r.item_id)) qty(`replenishment ${id}`, r.item_id, r.target_level, r.unit);
  }
  if (bp.shipping && !ents.has(bp.shipping.container_entity_id)) add("unknown_ref", `shipping: container ${bp.shipping.container_entity_id} does not exist`);
  return P;
}

export function navGraph(bp) {
  return {
    nodes: (bp.navigation?.nodes || []).map(n => ({ id: n.node_id, x: n.position_m[0], y: n.position_m[1], z: n.position_m[2] || 0 })),
    edges: (bp.navigation?.edges || []).map(e => ({ id: e.edge_id, a: e.from_node, b: e.to_node, both: e.bidirectional !== false, speed: e.speed_limit_mps || Infinity, modes: e.allowed_modes || null }))
  };
}

// Blueprint + scenario -> engine model (fe-model v1). Scenario fields and their defaults are listed in docs/17_ENGINE_CORE.md.
export function blueprintToModel(bp, scenario = {}) {
  const problems = validateBlueprint(bp);
  if (problems.length) throw new EngineError("invalid_blueprint", "blueprint has problems:\n  " + problems.map(p => p.message).join("\n  "), problems);
  const S = { seed: bp.initial_conditions?.random_seed ?? 1, tick_per_second: 1000, slot_size: { ea: 10, kg: 25 }, trolley_speed_mps: 1.0, walk_speed_mps: 1.2,
    load_s: 30, unload_s: 30, pull: { reorder_cycles: 2, target_cycles: 6 }, push: { lot: 10 }, breakdowns: {}, closed_edges: [], ...scenario };
  const items = new Map(bp.items.map(i => [i.item_id, i])), ents = new Map(bp.entities.map(e => [e.entity_id, e])), ports = new Map(bp.ports.map(p => [p.port_id, p]));
  const base = (itemId, q, unit) => toBaseQty(q, unit || items.get(itemId).unit);
  const slotOf = it => { const own = S.slot_size.items?.[it.item_id]; const q = own ?? S.slot_size[it.unit] ?? 1; return Math.max(1, base(it.item_id, q, it.unit)); };
  const graph = navGraph(bp); const closed = new Set(S.closed_edges); for (const e of graph.edges) if (closed.has(e.id)) e.open = false;
  const nearest = (x, y) => { let best = null, bd = Infinity; for (const n of graph.nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd || (d === bd && n.id < best)) { bd = d; best = n.id; } } return best; };
  const unitOf = e => { const p = worldTransform(bp, e.entity_id); return { id: e.entity_id, node: nearest(p.x, p.y), speed: e.category === "worker" ? S.walk_speed_mps : S.trolley_speed_mps, mode: MODE_OF[e.category] }; };
  const procByInput = new Map(); for (const pr of bp.processes) for (const i of pr.inputs) procByInput.set(pr.input_location_id + "|" + i.item_id, { pr, q: base(i.item_id, i.quantity, i.unit) });
  const policies = [];
  for (const fl of bp.material_flows) {
    const a = ports.get(fl.from_port_id), b = ports.get(fl.to_port_id), consumer = procByInput.get(b.owner_entity_id + "|" + fl.item_id);
    const common = { id: fl.flow_id, item: fl.item_id, from: a.owner_entity_id, to: b.owner_entity_id, fromNode: a.navigation_node_id, toNode: b.navigation_node_id, handling: fl.handling_policy_id };
    if (consumer) {
      const r = (bp.replenishment_policies || []).find(r => r.item_id === fl.item_id && r.destination_entity_id === b.owner_entity_id);
      policies.push(r ? { ...common, kind: "pull", reorderPoint: base(fl.item_id, r.reorder_point, r.unit), target: base(fl.item_id, r.target_level, r.unit), countInbound: r.count_confirmed_inbound !== false, source: r.policy_id }
        : { ...common, kind: "pull", reorderPoint: consumer.q * S.pull.reorder_cycles, target: consumer.q * S.pull.target_cycles, countInbound: true });
    } else policies.push({ ...common, kind: "push", lot: base(fl.item_id, S.push.lot_by_item?.[fl.item_id] ?? S.push.lot, items.get(fl.item_id).unit) });
  }
  const initial = new Map();
  for (const h of bp.initial_conditions?.handling_units || []) for (const c of h.contents) { const k = h.location_entity_id + "|" + c.item_id; initial.set(k, (initial.get(k) || 0) + base(c.item_id, c.quantity, c.unit)); }
  return {
    format: "fe-model", version: 1, name: bp.factory?.factory_id || "blueprint", source: { blueprint: bp.factory?.factory_id, schema_version: bp.schema_version, sample_only: !!bp.sample_only },
    tickPerSecond: S.tick_per_second, seed: S.seed,
    items: bp.items.map(it => ({ id: it.item_id, unit: unitInfo(it.unit).base, slotSize: slotOf(it) })),
    locations: bp.entities.filter(e => e.storage_capacity || ["storage", "container"].includes(e.category)).map(e => ({ id: e.entity_id, kind: e.category, capacitySlots: e.storage_capacity?.handling_unit_slots ?? null, node: null })),
    graph,
    pools: [
      { id: "transporters", kind: "carrier", units: bp.entities.filter(e => e.category === "transporter").map(unitOf) },
      { id: "workers", kind: "worker", units: bp.entities.filter(e => e.category === "worker").map(unitOf) }
    ],
    handling: (bp.handling_policies || []).map(h => ({ id: h.policy_id, carriers: h.transporter_entity_ids, workers: h.worker_entity_ids || [], loadSeconds: S.load_s, unloadSeconds: S.unload_s })),
    stations: bp.processes.map(pr => ({ id: pr.process_id, entity: pr.station_entity_id, input: pr.input_location_id, output: pr.output_location_id,
      inputs: pr.inputs.map(i => ({ item: i.item_id, qty: base(i.item_id, i.quantity, i.unit) })), outputs: pr.outputs.map(o => ({ item: o.item_id, qty: base(o.item_id, o.quantity, o.unit) })),
      cycleSeconds: pr.duration_s, slots: pr.parallel_slots, breakdown: S.breakdowns[pr.process_id] ? { mtbfSeconds: S.breakdowns[pr.process_id].mtbf_s, mttrSeconds: S.breakdowns[pr.process_id].mttr_s } : null })),
    policies,
    initial: { stock: [...initial].map(([k, qty]) => { const [location, item] = k.split("|"); return { location, item, qty }; }) }
  };
}
