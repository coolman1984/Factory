// Node side of the simulation (PLATFORM_PLAN P1, P2, P4): compile a scenario of a site folder into the pure input of
// src/core/sim-core.js, run replications, compute KPIs (src/core/kpi-core.js), write a run folder with a receipt and
// record the run in the site's results database.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, basename, relative } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { checkSite, modelContentHash } from "./site-node.mjs";
const require = createRequire(import.meta.url);
export const MFSim = require("../../src/core/sim-core.js");
export const MFKpi = require("../../src/core/kpi-core.js");
export const MFDemand = require("../../src/core/demand-core.js");

const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
const sha = (s) => createHash("sha256").update(s).digest("hex");
const fileHash = (f) => existsSync(f) ? sha(readFileSync(f)) : null;
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- route geometry: scene paths -> steps with story times, metres, plan points (metres), lifts ---------- */
let _geo = null;
async function geoTools() {
  if (_geo) return _geo;
  const sn = await import("../v7/scene-node.mjs");
  _geo = { SC: sn.loadSceneCore(), M: sn.loadMotionCore(), layoutFor: sn.layoutFor, P: null, readProjects: sn.readProjects };
  return _geo;
}
const geoCache = new Map();
export async function sceneRoutes(sceneFile) {
  const f = resolve(sceneFile); if (geoCache.has(f)) return geoCache.get(f);
  const G = await geoTools(); G.P ||= G.readProjects();
  const scene = readJson(f), L = G.layoutFor(G.P, scene.project), data = G.SC.toInternal(clone(scene), L).data;
  const out = { project: scene.project, file: f, stops: scene.stops || [], paths: {} };
  const stopOf = new Map(); for (const p of scene.paths || []) for (const s of p.steps || []) stopOf.set(p.id + "/" + s.id, s.stop);
  for (const fl of data.flows) {
    const st = fl.steps.find((s) => s.lift), el = (st && L.elevators.find((e) => e.label === st.elevator)) || L.elevators[0] || null;
    const items = G.M.timeline(data, fl, el).items.filter((it) => !it.s.intro && it.s.sceneId);
    out.paths[fl.id] = { id: fl.id, name: fl.name, color: fl.color, steps: items.map((it) => ({
      id: it.s.sceneId, stop: stopOf.get(fl.id + "/" + it.s.sceneId) || null, title: it.s.title, travel: +(it.tm - it.t0).toFixed(6), dwell: +(it.t1 - it.tm).toFixed(6), metres: it.metres || 0,
      lift: !!it.s.lift, elevator: it.s.elevator || null,
      pts: it.sched ? it.sched.pts.map((p) => [+(p[0] * 0.3).toFixed(3), +(p[1] * 0.3).toFixed(3)]) : [] })) };
  }
  geoCache.set(f, out); return out;
}

/* ---------- scenario operations (same names as the scenario file's ops) ---------- */
export function applyOps(model, library, ops = []) {
  const m = clone(model), lib = clone(library);
  const set = (arr, op, what) => { const x = (arr || []).find((y) => y.id === op.id); if (!x) throw new Error(`${op.op}: no ${what} "${op.id}"`); for (const [k, v] of Object.entries(op)) if (k !== "op" && k !== "id") x[k] = v; };
  for (const op of ops) {
    if (op.op === "resource.set") set(m.resources, op, "resource");
    else if (op.op === "flow.set") set(m.flows, op, "flow");
    else if (op.op === "store.set") set(m.stores, op, "store");
    else if (op.op === "rules.set") { m.rules = { ...(m.rules || {}) }; for (const [k, v] of Object.entries(op)) if (k !== "op") m.rules[k] = v; }
    else if (op.op === "library.set") { const coll = lib[op.kind || "vehicles"]; if (!coll) throw new Error(`library.set: unknown kind ${op.kind}`); const { kind, ...rest } = op; set(coll, rest, op.kind || "vehicle"); }
    else throw new Error(`unknown operation ${op.op}`);
  }
  return { model: m, library: lib };
}

const distOf = (d, siteDir) => { if (d && typeof d === "object" && d.empirical) { const vals = readFileSync(resolve(siteDir, d.empirical), "utf8").split(/\r?\n/).slice(1).map(Number).filter(Number.isFinite); return { values: vals, min: d.min, max: d.max }; } return d == null ? 0 : d; };

/* ---------- compile ---------- */
export async function compile(scenarioFile, over = {}) {
  const scFile = resolve(scenarioFile), siteDir = over.siteDir || dirname(dirname(scFile)), sc = readJson(scFile);
  const site = readJson(join(siteDir, "site.json")), library0 = readJson(join(siteDir, "library.json"));
  const modelFile = resolve(siteDir, sc.base), model0 = readJson(modelFile);
  const planFile = sc.plan ? resolve(siteDir, sc.plan) : null, plan = planFile ? readJson(planFile) : null;
  const { model, library } = applyOps(model0, library0, [...(sc.ops || []), ...(over.ops || [])]);
  const run = { ...sc.run, ...(over.run || {}) }, days = run.days, H = days * 86400, warnings = [];
  const veh = new Map(library.vehicles.map((v) => [v.id, v])), lifts = new Map((library.lifts || []).map((l) => [l.id, l])), carriers = new Map(library.carriers.map((c) => [c.id, c]));
  const allShifts = MFDemand.windows(site.calendar, null, days);
  const resources = (model.resources || []).map((r) => {
    const v = veh.get(r.kind), l = lifts.get(r.kind);
    if (!v && !l) throw new Error(`resource ${r.id}: unknown kind ${r.kind}`);
    return { id: r.id, kind: v ? v.kind : "lift", libId: r.kind, count: l ? r.count * ((l.capacity && l.capacity.carriers) || 1) : r.count, speed: v ? v.speed : "scene", lift: !!l, elevator: r.elevator || null,
      windows: r.shift ? MFDemand.windows(site.calendar, r.shift, days) : null,
      breakdown: r.breakdown ? { mtbf: r.breakdown.mtbf, mttr: distOf(r.breakdown.mttr, siteDir) } : null,
      charge: v && v.charge ? { every: v.charge.every, for: distOf(v.charge.for, siteDir) } : null };
  });
  const liftRes = resources.filter((r) => r.lift);
  const flows = [], demand = {}, geometry = { flows: {}, stops: [] }, seenStops = new Set();
  for (const f of model.flows) {
    let routes = null; for (const s of model.scenes) { const g = await sceneRoutes(resolve(siteDir, s)); if (g.paths[f.route]) { routes = g.paths[f.route]; break; } }
    if (!routes) throw new Error(`flow ${f.id}: no scene path ${f.route}`);
    geometry.flows[f.id] = { color: routes.color || null, name: routes.name || f.id, steps: routes.steps.map((s) => ({ id: s.id, stop: s.stop, title: s.title, pts: s.pts, dwell: s.dwell, lift: s.lift })) };
    const pool = resources.filter((r) => r.libId === f.mover && !r.lift).map((r) => r.id);
    if (!pool.length) warnings.push(`flow ${f.id}: no resource of kind ${f.mover} in the model; it never moves`);
    const c = carriers.get(f.carrier), mover = veh.get(f.mover);
    const steps = routes.steps.map((s) => {
      const L = s.lift ? (liftRes.find((r) => r.elevator === s.elevator) || liftRes.find((r) => !r.elevator) || null) : null;
      const cyc = L && mover && mover.speed !== "scene" ? distOf(lifts.get(L.libId).cycle, siteDir) : 0;
      return { id: s.id, travel: s.travel, dwell: s.dwell, metres: s.lift ? 0 : s.metres, lift: L ? L.id : null, liftExtra: cyc, scanStop: s.dwell };
    });
    let trigger;
    const T = f.trigger;
    if (T === "demand" || (T && T.kanban)) {
      const d = MFDemand.flowDemand(f, plan, site.calendar, days);
      if (!d) { warnings.push(`flow ${f.id}: ${plan ? "the plan uses no " + f.material : "no plan"}; no orders`); trigger = { bins: T === "demand" ? 2 : T.kanban.bins, rate: 0 }; }
      else { trigger = { bins: T === "demand" ? 2 : T.kanban.bins, rate: d.rate, windows: d.windows }; demand[f.id] = { unitsPerDay: d.perDay, lines: d.lines, ordersPerDay: d.perDay / f.lot.units }; }
    } else if (T && T.every != null) trigger = { every: distOf(T.every, siteDir), windows: allShifts };
    else if (T && T.once != null) trigger = { once: T.once };
    flows.push({ id: f.id, material: f.material, line: f.line || null, pool, load: distOf(c && c.load, siteDir), unload: distOf(c && c.unload, siteDir), lot: f.lot.units, returnTrip: f.returnTrip !== false, trigger, steps });
  }
  for (const s of model.scenes) { const g = await sceneRoutes(resolve(siteDir, s)); for (const st of g.stops) if (!seenStops.has(st.id)) { seenStops.add(st.id); geometry.stops.push({ id: st.id, name: st.name, x: st.x, y: st.y, floor: st.floor, color: st.color }); } }
  const input = { horizon: H, warmup: run.warmup || 0, seed: run.seed || 0, dispatch: (model.rules && model.rules.dispatch) === "due-date" ? "due-date" : "fifo", resources, flows };
  const extra = { shiftHours: 8, rates: site.rates || null, resourceKinds: Object.fromEntries(resources.map((r) => [r.id, r.kind])), resourceWindows: Object.fromEntries(resources.map((r) => [r.id, r.windows])) };
  if ((model.stores || []).length) warnings.push("stores are validated but not simulated in version 1 (line-side stock is simulated per flow)");
  const assumed = (JSON.stringify(library0).match(/"source":\s*"assumed/g) || []).length + (JSON.stringify(model0).match(/"source":\s*"assumed/g) || []).length;
  const inputs = { scenario: { file: scFile, hash: fileHash(scFile) }, model: { file: modelFile, hash: fileHash(modelFile) }, modelContent: { file: modelFile, hash: modelContentHash(modelFile) }, plan: planFile ? { file: planFile, hash: fileHash(planFile) } : null,
    site: { file: join(siteDir, "site.json"), hash: fileHash(join(siteDir, "site.json")) }, library: { file: join(siteDir, "library.json"), hash: fileHash(join(siteDir, "library.json")) },
    scenes: model.scenes.map((s) => ({ file: resolve(siteDir, s), hash: fileHash(resolve(siteDir, s)) })) };
  return { input, extra, geometry, run, warnings, demand, assumed, inputs, siteDir, site, name: basename(scFile, ".json"), model, plan };
}

/* ---------- run replications ---------- */
export async function runScenario(scenarioFile, o = {}) {
  const C = await compile(scenarioFile, o);
  if (o.check !== false) { const chk = checkSite(C.siteDir); if (chk.errors) throw new Error(`site ${C.siteDir} has ${chk.errors} validation error(s); run "mf site validate"`); }
  const reps = o.replications || C.run.replications || 1, seed0 = C.input.seed, per = [], t0 = Date.now();
  let first = null;
  for (let r = 0; r < reps; r++) { const log = MFSim.run({ ...C.input, seed: seed0 + r }); if (!r) first = log; per.push(MFKpi.kpis(log, C.extra)); }
  const summary = MFKpi.summarise(per), ms = Date.now() - t0;
  const key = sha(JSON.stringify({ input: C.input, reps })).slice(0, 10), id = o.id || `${C.name}${(o.ops || []).length ? "~v" : "-"}${key}`;   /* "~v": an experiment variant */
  const dir = join(C.siteDir, "results", "runs", id); mkdirSync(dir, { recursive: true });
  const rel = (f) => relative(C.siteDir, f).replace(/\\/g, "/");
  const variant = (o.ops || []).length ? o.ops.map((op) => `${op.op}${op.id ? " " + op.id : ""} ${Object.entries(op).filter(([k]) => !["op", "id", "kind"].includes(k)).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(",")}`).join("; ") : null;
  const receipt = { format: "mf-run", version: 1, id, site: C.site.id, scenario: C.name, variant, model: C.model.area, days: C.run.days, warmup: C.input.warmup, seed: seed0, replications: reps,
    events: first.events.length, orders: first.orders, ms, inputs: JSON.parse(JSON.stringify(C.inputs, (k, v) => k === "file" ? rel(v) : v)),
    assumptions: C.assumed, warnings: C.warnings, demand: C.demand, kpis: summary, label: "model",
    limits: ["one simulated material per flow; a starved material does not stop the others", "elevator capacity as parallel slots", "breakdowns and charging start after the current task", "stores not simulated in version 1"] };
  writeFileSync(join(dir, "receipt.json"), JSON.stringify(receipt, null, 1));
  writeFileSync(join(dir, "replications.json"), JSON.stringify(per));
  writeFileSync(join(dir, "log.json"), JSON.stringify(first));
  writeFileSync(join(dir, "input.json"), JSON.stringify(C.input));
  writeFileSync(join(dir, "geometry.json"), JSON.stringify(C.geometry));
  if (o.db !== false) { const { record } = await import("./results-db.mjs"); record(join(C.siteDir, "results", "results.sqlite"), receipt, per); }
  return { dir, receipt, per, log: first, C };
}

/* readers for one run folder */
export function loadRun(dir) { return { receipt: readJson(join(dir, "receipt.json")), log: readJson(join(dir, "log.json")) }; }
