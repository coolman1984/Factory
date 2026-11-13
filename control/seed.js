// Seed data of the Control Center: the declared SAMPLE blueprint (examples/) completed into a logically working factory slice,
// entered through the same commands the owner and the agent use. Every value is illustrative, none is measured.
// The sample has one handling worker for twenty flows (it was the bottleneck); the logic dataset adds a handling team per
// trolley type so material actually flows, plus scenarios that exercise quality, traffic, breakdowns and shipping.
import { readFileSync } from "node:fs";

const read = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));

export const SCENARIOS = {
  demo: () => ({ ...read("../engine/scenarios/demo.scenario.json"), note: "Engine demo settings (illustrative)" }),
  "logic-test": () => ({ ...read("../engine/scenarios/demo.scenario.json"), note: "Logic test: full handling teams, 92% first-pass test, one-lane narrow aisles, SMT breakdowns, container plan (illustrative)",
    seed: 20261113, load_s: 20, unload_s: 20, quality: { PROC_TEST: { pass_rate: 0.92, repair_s: 240, repair_slots: 1 } } }),
  "perfect-quality": () => ({ ...read("../engine/scenarios/demo.scenario.json"), note: "What-if: every test passes, no breakdowns", seed: 20261113, load_s: 20, unload_s: 20, breakdowns: {}, quality: { PROC_TEST: { pass_rate: 1, repair_s: 240 } } }),
  "two-way-aisles": () => ({ ...read("../engine/scenarios/demo.scenario.json"), note: "What-if: no one-lane aisles", seed: 20261113, load_s: 20, unload_s: 20, traffic: {}, quality: { PROC_TEST: { pass_rate: 0.92, repair_s: 240 } } })
};

const person = (id, x, y, caps) => ({ entity_id: id, name: id.replace(/_/g, " ").toLowerCase(), category: "worker", org_parent_id: "ZONE_RAW", spatial_parent_id: null, prefab_id: "WORKER", prefab_version: "0.1.0", transform: { position_m: [x, y, 0], yaw_deg: 0 }, capabilities: caps });
const trolley = (id, prefab, x, y, caps) => ({ entity_id: id, name: id.replace(/_/g, " ").toLowerCase(), category: "transporter", org_parent_id: "ZONE_RAW", spatial_parent_id: null, prefab_id: prefab, prefab_version: "0.1.0", transform: { position_m: [x, y, 0], yaw_deg: 0 }, capabilities: caps });

// The commands that turn the sample into the logic dataset (applied after the import).
export function logicCommands() {
  const create = (type, data) => ({ type: "record.create", payload: { type, data } });
  return [
    create("entity", person("WORKER_02", -110, -22, ["trolley_handling", "esd_handling"])),
    create("entity", person("WORKER_03", -110, -24, ["trolley_handling"])),
    create("entity", person("WORKER_04", -110, -26, ["trolley_handling"])),
    create("entity", trolley("TROLLEY_ESD_02", "TROLLEY_ESD", -100, -22, ["manual_push", "esd"])),
    create("entity", trolley("TROLLEY_HEAVY_02", "TROLLEY_HEAVY", -100, -24, ["manual_push", "heavy"])),
    create("entity", trolley("TROLLEY_HEAVY_03", "TROLLEY_HEAVY", -100, -26, ["manual_push", "heavy"])),
    { type: "record.update", payload: { type: "handling", id: "HANDLE_ESD", set: { transporter_entity_ids: ["TROLLEY_ESD_01", "TROLLEY_ESD_02"], worker_entity_ids: ["WORKER_01", "WORKER_02"] } } },
    { type: "record.update", payload: { type: "handling", id: "HANDLE_GENERAL", set: { transporter_entity_ids: ["TROLLEY_HEAVY_01", "TROLLEY_HEAVY_02", "TROLLEY_HEAVY_03"], worker_entity_ids: ["WORKER_03", "WORKER_04"] } } },
    { type: "record.update", payload: { type: "factory", id: "TV_FACTORY_DEMO", set: { "_meta.notes": [...read("../examples/factory-blueprint.example.json").notes, "Control Center logic dataset: handling teams added (WORKER_02-04, TROLLEY_ESD_02, TROLLEY_HEAVY_02-03); still illustrative."] } } }
  ];
}

export function seed(store, actor = "seed") {
  const bp = read("../examples/factory-blueprint.example.json"), scenarios = Object.fromEntries(Object.entries(SCENARIOS).map(([k, f]) => [k, f()]));
  const a = store.command({ actor, type: "import", payload: { blueprint: bp, scenarios, label: "import sample blueprint + scenarios" } });
  if (!a.ok) throw new Error("seed import refused: " + a.reason);
  const b = store.command({ actor, type: "batch", payload: { commands: logicCommands(), label: "logic dataset: handling teams" } });
  if (!b.ok) throw new Error("seed logic dataset refused: " + b.reason);
  return { import: a, logic: b };
}
