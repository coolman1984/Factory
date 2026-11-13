/* Material Flow Platform data contract (docs/plans/PLATFORM_PLAN.md section 4, docs/PLATFORM_MANUAL.md).
   Plain script: Node (require) and the page (window.MFModel) load the same file.
   Units: seconds, metres, m/s. Every validator returns { errors: [{ where, msg }], warnings: [{ where, msg }] }.
   File-system facts (does a scene exist, how many rows has a CSV) come from ctx, so this file never touches the disk. */
(function(root) {
"use strict";
const VERSION = 1;
const FORMATS = { site: "mf-site", library: "mf-library", model: "mf-model", plan: "mf-plan", scenario: "mf-scenario", layout: "mf-layout", experiment: "mf-experiment" };
const VEHICLE_KINDS = ["operator", "agv", "forklift", "tugger"];
const DISPATCH = ["fifo", "nearest", "due-date"], ELEVATOR_RULES = ["fifo", "priority"];
const OPS = { "resource.set": "resources", "flow.set": "flows", "store.set": "stores", "rules.set": null, "library.set": null };
const DIST_KINDS = ["fixed", "uniform", "triangular", "normal", "lognormal", "exp", "empirical"];
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/, SHIFT_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/, DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function report() {
  const r = { errors: [], warnings: [] };
  r.err = (where, msg) => r.errors.push({ where, msg });
  r.warn = (where, msg) => r.warnings.push({ where, msg });
  return r;
}
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const minutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

function header(r, o, kind) {
  if (!isObj(o)) { r.err("", `not a JSON object`); return false; }
  if (o.format !== FORMATS[kind]) r.err("format", `must be "${FORMATS[kind]}"`);
  if (o.version !== VERSION) r.err("version", `must be ${VERSION}`);
  return true;
}
function id(r, where, v, re = ID_RE) { if (typeof v !== "string" || !re.test(v)) { r.err(where, re === ID_RE ? `id must be lower-case letters, digits, . _ - (got ${JSON.stringify(v)})` : `shift id must be letters, digits, _ - (got ${JSON.stringify(v)})`); return false; } return true; }
function text(r, where, v, optional) { if (v == null && optional) return; if (typeof v !== "string" || !v.trim()) r.err(where, "text required"); }
function pos(r, where, v, { optional, zero, int } = {}) {
  if (v == null && optional) return;
  if (!isNum(v) || (zero ? v < 0 : v <= 0)) r.err(where, `number ${zero ? ">= 0" : "> 0"} required (got ${JSON.stringify(v)})`);
  else if (int && !isInt(v)) r.err(where, `whole number required (got ${v})`);
}
function list(r, where, v, optional) { if (v == null && optional) return []; if (!Array.isArray(v)) { r.err(where, "list required"); return []; } return v; }
function uniqueIds(r, where, arr, re) {
  const seen = new Set();
  arr.forEach((x, i) => { if (!isObj(x)) { r.err(`${where}[${i}]`, "object required"); return; } if (id(r, `${where}[${i}].id`, x.id, re)) { if (seen.has(x.id)) r.err(`${where}[${i}].id`, `duplicate id "${x.id}"`); seen.add(x.id); } });
  return seen;
}
function oneOf(r, where, v, allowed, optional) { if (v == null && optional) return; if (!allowed.includes(v)) r.err(where, `must be one of ${allowed.join(", ")} (got ${JSON.stringify(v)})`); }

/* Distributions: a plain number = fixed; else exactly one key of DIST_KINDS (+ optional min / max). */
function dist(r, where, v, ctx, { optional } = {}) {
  if (v == null) { if (!optional) r.err(where, "time or distribution required"); return; }
  if (isNum(v)) { if (v < 0) r.err(where, `must not be negative (got ${v})`); return; }
  if (!isObj(v)) { r.err(where, "number or distribution object required"); return; }
  const keys = Object.keys(v).filter((k) => DIST_KINDS.includes(k));
  if (keys.length !== 1) { r.err(where, `exactly one of ${DIST_KINDS.join(", ")} required`); return; }
  const k = keys[0], a = v[k], w = `${where}.${k}`;
  const nums = (n) => Array.isArray(a) && a.length === n && a.every(isNum);
  if (k === "fixed" || k === "exp") { if (!isNum(a) || a < 0 || (k === "exp" && a === 0)) r.err(w, `${k === "exp" ? "mean > 0" : "number >= 0"} required`); }
  else if (k === "uniform") { if (!nums(2) || a[0] < 0 || a[0] > a[1]) r.err(w, "[min, max] with 0 <= min <= max required"); }
  else if (k === "triangular") { if (!nums(3) || a[0] < 0 || a[0] > a[1] || a[1] > a[2]) r.err(w, "[min, mode, max] with 0 <= min <= mode <= max required"); }
  else if (k === "normal" || k === "lognormal") { if (!nums(2) || a[0] <= 0 || a[1] < 0) r.err(w, "[mean > 0, sd >= 0] required"); }
  else if (k === "empirical") {
    if (typeof a !== "string" || !a.trim()) r.err(w, "CSV file name required");
    else if (ctx && ctx.rows) { const n = ctx.rows(a); if (n == null) r.err(w, `file not found: ${a}`); else if (n < 20) r.err(w, `${a} has ${n} value(s); at least 20 required`); else if (n < 50) r.warn(w, `${a} has only ${n} values (50 or more recommended)`); }
  }
  if (v.min != null && !isNum(v.min)) r.err(`${where}.min`, "number required");
  if (v.max != null && !isNum(v.max)) r.err(`${where}.max`, "number required");
  if (isNum(v.min) && isNum(v.max) && v.min > v.max) r.err(where, `min ${v.min} > max ${v.max}`);
}

/* ---------- site ---------- */
function validateSite(o, ctx = {}) {
  const r = report(); if (!header(r, o, "site")) return r;
  id(r, "id", o.id); text(r, "name", o.name);
  if (o.country == null) r.warn("country", "not set yet (owner to confirm)"); else text(r, "country", o.country);
  if (o.timezone == null) r.warn("timezone", "not set yet (owner to confirm)"); else text(r, "timezone", o.timezone);
  list(r, "productLines", o.productLines).forEach((p, i) => id(r, `productLines[${i}]`, p));
  const cal = o.calendar;
  const shifts = new Set();
  if (!isObj(cal)) r.err("calendar", "object with shifts required");
  else {
    const sh = list(r, "calendar.shifts", cal.shifts); uniqueIds(r, "calendar.shifts", sh, SHIFT_RE).forEach((s) => shifts.add(s));
    const spans = [];
    sh.forEach((s, i) => {
      if (!isObj(s)) return; const w = `calendar.shifts[${i}]`;
      if (!TIME_RE.test(s.start || "")) r.err(`${w}.start`, `time "HH:MM" required`);
      if (!TIME_RE.test(s.end || "")) r.err(`${w}.end`, `time "HH:MM" required`);
      if (TIME_RE.test(s.start || "") && TIME_RE.test(s.end || "")) {
        let a = minutes(s.start), b = minutes(s.end); if (b <= a) b += 1440;                 // a night shift ends the next day
        spans.push([a, b, s.id], [a + 1440, b + 1440, s.id]);
      }
    });
    for (let i = 0; i < spans.length; i++) for (let j = i + 1; j < spans.length; j++) { const [a0, a1, x] = spans[i], [b0, b1, y] = spans[j]; if (x !== y && a0 < b1 && b0 < a1) { r.err("calendar.shifts", `shifts "${x}" and "${y}" overlap`); i = j = spans.length; } }
    list(r, "calendar.breaks", cal.breaks, true).forEach((b, i) => {
      const w = `calendar.breaks[${i}]`; if (!isObj(b)) { r.err(w, "object required"); return; }
      if (!shifts.has(b.shift)) r.err(`${w}.shift`, `unknown shift "${b.shift}"`);
      if (!TIME_RE.test(b.start || "")) r.err(`${w}.start`, `time "HH:MM" required`);
      pos(r, `${w}.minutes`, b.minutes);
    });
  }
  const floors = new Set(), lines = new Set(), areas = new Set();
  const bs = list(r, "buildings", o.buildings); uniqueIds(r, "buildings", bs);
  bs.forEach((b, i) => { if (!isObj(b)) return; const fl = list(r, `buildings[${i}].floors`, b.floors); uniqueIds(r, `buildings[${i}].floors`, fl).forEach((f) => floors.add(f)); });
  const as = list(r, "areas", o.areas); uniqueIds(r, "areas", as).forEach((a) => areas.add(a));
  as.forEach((a, i) => {
    if (!isObj(a)) return; const w = `areas[${i}]`; text(r, `${w}.name`, a.name);
    if (a.productLine != null && !list(r, "productLines", o.productLines).includes(a.productLine)) r.err(`${w}.productLine`, `"${a.productLine}" is not in productLines`);
    if (a.building != null && !bs.some((b) => b && b.id === a.building)) r.err(`${w}.building`, `unknown building "${a.building}"`);
    const ls = list(r, `${w}.lines`, a.lines, true); uniqueIds(r, `${w}.lines`, ls).forEach((l) => { if (lines.has(l)) r.err(`${w}.lines`, `line id "${l}" used in two areas`); lines.add(l); });
  });
  if (o.rates != null) { if (!isObj(o.rates)) r.err("rates", "object required"); else for (const [k, v] of Object.entries(o.rates)) pos(r, `rates.${k}`, v, { zero: true }); }
  r.index = { shifts, floors, lines, areas };
  return r;
}

/* ---------- library ---------- */
function validateLibrary(o, ctx = {}) {
  const r = report(); if (!header(r, o, "library")) return r;
  const carriers = uniqueIds(r, "carriers", list(r, "carriers", o.carriers));
  list(r, "carriers", o.carriers).forEach((c, i) => {
    if (!isObj(c)) return; const w = `carriers[${i}]`;
    if (!isObj(c.capacity) || (c.capacity.units == null && c.capacity.carriers == null)) r.err(`${w}.capacity`, "{ units } required");
    else pos(r, `${w}.capacity.units`, c.capacity.units, { optional: true, int: true });
    if (c.size != null && !(Array.isArray(c.size) && c.size.length === 3 && c.size.every((x) => isNum(x) && x > 0))) r.err(`${w}.size`, "[length, width, height] in metres required");
    dist(r, `${w}.load`, c.load, ctx, { optional: true }); dist(r, `${w}.unload`, c.unload, ctx, { optional: true });
  });
  const vehicles = uniqueIds(r, "vehicles", list(r, "vehicles", o.vehicles));
  list(r, "vehicles", o.vehicles).forEach((v, i) => {
    if (!isObj(v)) return; const w = `vehicles[${i}]`;
    oneOf(r, `${w}.kind`, v.kind, VEHICLE_KINDS); if (v.speed !== "scene") pos(r, `${w}.speed`, v.speed);   // "scene" = the scene's story timing (identity checks)
    pos(r, `${w}.tows`, v.tows, { optional: true, int: true });
    if (v.charge != null) { if (!isObj(v.charge)) r.err(`${w}.charge`, "{ every, for } required"); else { pos(r, `${w}.charge.every`, v.charge.every); dist(r, `${w}.charge.for`, v.charge.for, ctx); } }
  });
  const lifts = uniqueIds(r, "lifts", list(r, "lifts", o.lifts, true));
  list(r, "lifts", o.lifts, true).forEach((l, i) => {
    if (!isObj(l)) return; const w = `lifts[${i}]`;
    dist(r, `${w}.cycle`, l.cycle, ctx);
    if (!isObj(l.capacity)) r.err(`${w}.capacity`, "{ carriers } required"); else pos(r, `${w}.capacity.carriers`, l.capacity.carriers, { int: true });
    dist(r, `${w}.door`, l.door, ctx, { optional: true });
  });
  const devices = uniqueIds(r, "devices", list(r, "devices", o.devices, true));
  list(r, "devices", o.devices, true).forEach((d, i) => { if (isObj(d)) dist(r, `devices[${i}].time`, d.time, ctx); });
  for (const x of lifts) if (vehicles.has(x) || carriers.has(x)) r.err("lifts", `id "${x}" is also a carrier or vehicle`);
  r.index = { carriers, vehicles, lifts, devices };
  return r;
}

/* ---------- model ---------- ctx.site = validated site report, ctx.library = validated library report,
   ctx.scene(path) -> { paths: Set, stops: Set } | null */
function validateModel(o, ctx = {}) {
  const r = report(); if (!header(r, o, "model")) return r;
  const S = ctx.site && ctx.site.index, L = ctx.library && ctx.library.index;
  id(r, "site", o.site); if (ctx.siteId && o.site !== ctx.siteId) r.err("site", `model belongs to "${o.site}", not to site "${ctx.siteId}"`);
  id(r, "area", o.area); if (S && !S.areas.has(o.area)) r.err("area", `unknown area "${o.area}"`);
  const paths = new Set(), stops = new Set();
  list(r, "scenes", o.scenes).forEach((f, i) => {
    if (typeof f !== "string" || !f) { r.err(`scenes[${i}]`, "file path required"); return; }
    if (ctx.scene) { const sc = ctx.scene(f); if (!sc) r.err(`scenes[${i}]`, `scene not found or not an mf-scene: ${f}`); else { sc.paths.forEach((p) => paths.add(p)); sc.stops.forEach((s) => stops.add(s)); } }
  });
  const flows = list(r, "flows", o.flows); uniqueIds(r, "flows", flows);
  flows.forEach((f, i) => {
    if (!isObj(f)) return; const w = `flows[${i}]`;
    id(r, `${w}.material`, f.material);
    if (L && !L.carriers.has(f.carrier)) r.err(`${w}.carrier`, `unknown carrier "${f.carrier}"`);
    if (L && !L.vehicles.has(f.mover)) r.err(`${w}.mover`, `unknown vehicle "${f.mover}"`);
    if (ctx.scene && !paths.has(f.route)) r.err(`${w}.route`, `no scene path "${f.route}"`);
    if (!isObj(f.lot)) r.err(`${w}.lot`, "{ units } required"); else pos(r, `${w}.lot.units`, f.lot.units, { int: true });
    const t = f.trigger;
    if (t === "demand") {}
    else if (isObj(t) && "every" in t) { dist(r, `${w}.trigger.every`, t.every, ctx); if (isNum(t.every) && t.every <= 0) r.err(`${w}.trigger.every`, "interval > 0 required"); }
    else if (isObj(t) && "once" in t) pos(r, `${w}.trigger.once`, t.once, { zero: true });
    else if (isObj(t) && isObj(t.kanban)) pos(r, `${w}.trigger.kanban.bins`, t.kanban.bins, { int: true });
    else r.err(`${w}.trigger`, `"demand", { every: s }, { once: s } or { kanban: { bins } } required`);
    if (f.line != null && S && !S.lines.has(f.line)) r.err(`${w}.line`, `"${f.line}" is not a line of the site`);
    if (f.returnTrip != null && typeof f.returnTrip !== "boolean") r.err(`${w}.returnTrip`, "true or false required");
  });
  oneOf(r, "state", o.state, ["draft", "reviewed", "approved"], true);
  const res = list(r, "resources", o.resources, true); uniqueIds(r, "resources", res);
  res.forEach((x, i) => {
    if (!isObj(x)) return; const w = `resources[${i}]`;
    if (L && !L.vehicles.has(x.kind) && !L.lifts.has(x.kind)) r.err(`${w}.kind`, `unknown vehicle or lift "${x.kind}"`);
    pos(r, `${w}.count`, x.count, { int: true });
    if (x.elevator != null && (typeof x.elevator !== "string" || !x.elevator)) r.err(`${w}.elevator`, "elevator label of the scene layout required (e.g. \"Elev 5\")");
    if (x.shift != null) { if (typeof x.shift !== "string") r.err(`${w}.shift`, `shift ids joined by "+" required`); else if (S) for (const s of x.shift.split("+")) if (!S.shifts.has(s)) r.err(`${w}.shift`, `unknown shift "${s}"`); }
    if (x.breakdown != null) { if (!isObj(x.breakdown)) r.err(`${w}.breakdown`, "{ mtbf, mttr } required"); else { pos(r, `${w}.breakdown.mtbf`, x.breakdown.mtbf); dist(r, `${w}.breakdown.mttr`, x.breakdown.mttr, ctx); } }
  });
  const st = list(r, "stores", o.stores, true); uniqueIds(r, "stores", st);
  st.forEach((x, i) => {
    if (!isObj(x)) return; const w = `stores[${i}]`;
    if (ctx.scene && !stops.has(x.stop)) r.err(`${w}.stop`, `no scene stop "${x.stop}"`);
    if (!isObj(x.capacity) || (x.capacity.carriers == null && x.capacity.units == null)) r.err(`${w}.capacity`, "{ carriers } or { units } required");
    else { pos(r, `${w}.capacity.carriers`, x.capacity.carriers, { optional: true, int: true }); pos(r, `${w}.capacity.units`, x.capacity.units, { optional: true, int: true }); }
    pos(r, `${w}.start`, x.start, { optional: true, zero: true, int: true });
    if (isObj(x.capacity) && isNum(x.start) && isNum(x.capacity.carriers) && x.start > x.capacity.carriers) r.err(`${w}.start`, `start ${x.start} is above the capacity ${x.capacity.carriers}`);
  });
  if (o.rules != null) {
    if (!isObj(o.rules)) r.err("rules", "object required");
    else { oneOf(r, "rules.dispatch", o.rules.dispatch, DISPATCH, true); oneOf(r, "rules.elevator", o.rules.elevator, ELEVATOR_RULES, true); }
  }
  r.index = { flows: new Set(flows.filter(isObj).map((f) => f.id)), resources: new Set(res.filter(isObj).map((x) => x.id)), stores: new Set(st.filter(isObj).map((x) => x.id)), materials: new Set(flows.filter(isObj).map((f) => f.material)) };
  return r;
}

/* ---------- plan ---------- ctx.site, ctx.materials (Set of materials used by the site's models) */
function validatePlan(o, ctx = {}) {
  const r = report(); if (!header(r, o, "plan")) return r;
  const S = ctx.site && ctx.site.index;
  id(r, "site", o.site); if (ctx.siteId && o.site !== ctx.siteId) r.err("site", `plan belongs to "${o.site}", not to site "${ctx.siteId}"`);
  if (!DATE_RE.test(o.from || "") || isNaN(Date.parse(o.from))) r.err("from", `date "YYYY-MM-DD" required`);
  pos(r, "days", o.days, { int: true });
  if (o.source != null && (!isObj(o.source) || typeof o.source.file !== "string")) r.err("source", "{ file, sheet, hash } required");
  const models = new Set();
  list(r, "lines", o.lines).forEach((l, i) => {
    const w = `lines[${i}]`; if (!isObj(l)) { r.err(w, "object required"); return; }
    if (S && !S.lines.has(l.line)) r.err(`${w}.line`, `line "${l.line}" is not a line of the site`);
    text(r, `${w}.model`, l.model); models.add(l.model);
    if (!isObj(l.rate)) r.err(`${w}.rate`, "{ per_hour } required"); else pos(r, `${w}.rate.per_hour`, l.rate.per_hour);
    if (l.shift != null && S) for (const s of String(l.shift).split("+")) if (!S.shifts.has(s)) r.err(`${w}.shift`, `unknown shift "${s}"`);
  });
  const bomModels = new Set();
  list(r, "bom", o.bom).forEach((b, i) => {
    const w = `bom[${i}]`; if (!isObj(b)) { r.err(w, "object required"); return; }
    text(r, `${w}.model`, b.model); bomModels.add(b.model); id(r, `${w}.material`, b.material); pos(r, `${w}.per_unit`, b.per_unit);
    if (ctx.materials && !ctx.materials.has(b.material)) r.warn(`${w}.material`, `no flow of the site moves "${b.material}"`);
  });
  for (const m of models) if (!bomModels.has(m)) r.warn("bom", `product "${m}" has no bill of materials rows`);
  return r;
}

/* ---------- scenario ---------- ctx.model(path) -> model report (with index) | null, ctx.plan(path) -> plan report | null */
function validateScenario(o, ctx = {}) {
  const r = report(); if (!header(r, o, "scenario")) return r;
  let M = null;
  if (typeof o.base !== "string" || !o.base) r.err("base", "model file required");
  else if (ctx.model) { const m = ctx.model(o.base); if (!m) r.err("base", `model not found: ${o.base}`); else { M = m.index; if (m.errors.length) r.err("base", `model ${o.base} has ${m.errors.length} error(s)`); } }
  if (o.plan != null) { if (typeof o.plan !== "string") r.err("plan", "plan file required"); else if (ctx.plan) { const p = ctx.plan(o.plan); if (!p) r.err("plan", `plan not found: ${o.plan}`); else if (p.errors.length) r.err("plan", `plan ${o.plan} has ${p.errors.length} error(s)`); } }
  list(r, "ops", o.ops, true).forEach((op, i) => {
    const w = `ops[${i}]`; if (!isObj(op)) { r.err(w, "object required"); return; }
    if (!(op.op in OPS)) { r.err(`${w}.op`, `unknown operation "${op.op}" (known: ${Object.keys(OPS).join(", ")})`); return; }
    const coll = OPS[op.op]; if (coll && M && !M[coll].has(op.id)) r.err(`${w}.id`, `no ${coll.slice(0, -1)} "${op.id}" in the base model`);
    if (op.count != null) pos(r, `${w}.count`, op.count, { int: true });
  });
  const run = o.run;
  if (!isObj(run)) r.err("run", "{ days, warmup, replications, seed } required");
  else { pos(r, "run.days", run.days); pos(r, "run.warmup", run.warmup, { optional: true, zero: true }); pos(r, "run.replications", run.replications, { int: true }); if (!isInt(run.seed) || run.seed < 0) r.err("run.seed", "whole number >= 0 required"); }
  return r;
}

/* ---------- layout (P6) and experiment (P4) ---------- */
function validateLayout(o) {
  const r = report(); if (!header(r, o, "layout")) return r;
  if (o.units !== "m") r.err("units", `must be "m"`);
  const s = list(r, "segments", o.segments); if (!s.length) r.err("segments", "no segments");
  for (let i = 0; i < s.length; i++) if (!Array.isArray(s[i]) || s[i].length !== 4 || !s[i].every(isNum)) { r.err(`segments[${i}]`, "[x1, y1, x2, y2] in metres required"); break; }
  if (o.source && o.source.transform && isNum(o.source.scale) && Math.abs(o.source.scale - 1) > 0.02) r.warn("source.scale", `alignment scale ${o.source.scale.toFixed(4)} differs from 1 by more than 2 %; check the two point pairs`);
  return r;
}
function validateExperiment(o) {
  const r = report(); if (!header(r, o, "experiment")) return r;
  text(r, "scenario", o.scenario); pos(r, "replications", o.replications, { int: true }); pos(r, "days", o.days, { optional: true });
  const P = /^(resource|flow|store)\.[a-z0-9][a-z0-9._-]*\.[A-Za-z]+$|^rules\.[A-Za-z]+$|^library\.[a-z]+\.[a-z0-9][a-z0-9._-]*\.[A-Za-z]+$/;
  if (o.grid == null && o.find == null) r.err("", "grid or find required");
  if (o.grid != null) { if (!isObj(o.grid)) r.err("grid", "object required"); else for (const [k, v] of Object.entries(o.grid)) { if (!P.test(k)) r.err(`grid.${k}`, "parameter must be resource.<id>.<field>, flow.<id>.<field>, store.<id>.<field>, rules.<field> or library.<kind>.<id>.<field>"); if (!Array.isArray(v) || !v.length) r.err(`grid.${k}`, "list of values required"); } }
  if (o.find != null) { const f = o.find; if (!isObj(f)) r.err("find", "object required"); else { if (!P.test(f.param || "")) r.err("find.param", "parameter required"); if (!isInt(f.from) || !isInt(f.to) || f.from > f.to) r.err("find", "whole numbers from <= to required"); if (!isObj(f.until) || !Object.keys(f.until).length) r.err("find.until", "{ kpi: upper limit } required"); } }
  return r;
}

const VALIDATORS = { layout: validateLayout, experiment: validateExperiment, site: validateSite, library: validateLibrary, model: validateModel, plan: validatePlan, scenario: validateScenario };
function kindOf(o) { if (!isObj(o)) return null; for (const [k, f] of Object.entries(FORMATS)) if (o.format === f) return k; return null; }
function validate(kind, o, ctx) { const f = VALIDATORS[kind]; if (!f) throw new Error(`unknown kind "${kind}"`); return f(o, ctx); }

const api = { VERSION, FORMATS, VEHICLE_KINDS, DISPATCH, ELEVATOR_RULES, OPS: Object.keys(OPS), DIST_KINDS, validate, kindOf, validateLayout, validateExperiment, validateSite, validateLibrary, validateModel, validatePlan, validateScenario };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MFModel = api;
})(typeof window !== "undefined" ? window : this);
