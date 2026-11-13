// Node side of the platform data contract: load a site folder, validate every file with src/core/model-core.js,
// cross-check references (scenes, models, plans, empirical CSVs) and create new site skeletons.
// All paths inside a site's files are relative to the site folder.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export const MFModel = require("../../src/core/model-core.js");

const readJson = (f) => { try { return { data: JSON.parse(readFileSync(f, "utf8")) }; } catch (e) { return { error: e.message }; } };
const jsonFiles = (dir) => existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => join(dir, f)) : [];

/* Check a whole site folder. Returns { site, files: [{ file, kind, errors, warnings }], errors, warnings }. */
export function checkSite(dir) {
  dir = resolve(dir);
  const files = [], at = (f) => resolve(dir, f), rel = (f) => relative(process.cwd(), f).replace(/\\/g, "/");
  const add = (file, kind, r) => { files.push({ file: rel(file), kind, errors: r.errors, warnings: r.warnings }); return r; };
  const fail = (file, kind, msg) => add(file, kind, { errors: [{ where: "", msg }], warnings: [] });
  const sceneCache = new Map();
  const ctxBase = {
    rows(f) { const p = at(f); if (!existsSync(p)) return null; return readFileSync(p, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(1).length; },
    scene(f) {
      const p = at(f); if (sceneCache.has(p)) return sceneCache.get(p);
      const j = existsSync(p) ? readJson(p) : {}; let v = null;
      if (j.data && j.data.format === "mf-scene") v = { paths: new Set((j.data.paths || []).map((x) => x.id)), stops: new Set((j.data.stops || []).map((x) => x.id)) };
      sceneCache.set(p, v); return v;
    },
  };
  const siteFile = join(dir, "site.json");
  if (!existsSync(siteFile)) { fail(siteFile, "site", "site.json not found"); return summary(null, files); }
  const sj = readJson(siteFile); if (sj.error) { fail(siteFile, "site", sj.error); return summary(null, files); }
  const site = add(siteFile, "site", MFModel.validateSite(sj.data, ctxBase)), siteId = sj.data.id;
  const libFile = join(dir, "library.json"), lj = existsSync(libFile) ? readJson(libFile) : { error: "library.json not found" };
  const library = lj.error ? fail(libFile, "library", lj.error) : add(libFile, "library", MFModel.validateLibrary(lj.data, ctxBase));
  const ctx = { ...ctxBase, site, library, siteId };
  // models
  const models = new Map(), materials = new Set();
  const loadModel = (f) => {
    const p = at(f); if (models.has(p)) return models.get(p);
    const j = existsSync(p) ? readJson(p) : null; if (!j) { models.set(p, null); return null; }
    const r = j.error ? { errors: [{ where: "", msg: j.error }], warnings: [] } : MFModel.validateModel(j.data, ctx);
    models.set(p, r); if (r.index) r.index.materials.forEach((m) => materials.add(m)); return r;
  };
  for (const f of jsonFiles(join(dir, "models"))) add(f, "model", loadModel(relative(dir, f)));
  // plans
  const plans = new Map();
  const loadPlan = (f) => {
    const p = at(f); if (plans.has(p)) return plans.get(p);
    const j = existsSync(p) ? readJson(p) : null; if (!j) { plans.set(p, null); return null; }
    const r = j.error ? { errors: [{ where: "", msg: j.error }], warnings: [] } : MFModel.validatePlan(j.data, { ...ctx, materials });
    plans.set(p, r); return r;
  };
  for (const f of jsonFiles(join(dir, "plans"))) add(f, "plan", loadPlan(relative(dir, f)));
  for (const f of jsonFiles(join(dir, "scenarios"))) {
    const j = readJson(f); if (j.error) { fail(f, "scenario", j.error); continue; }
    add(f, "scenario", MFModel.validateScenario(j.data, { ...ctx, model: loadModel, plan: loadPlan }));
  }
  for (const f of jsonFiles(join(dir, "experiments"))) { const j = readJson(f); if (j.error) fail(f, "experiment", j.error); else { const r = add(f, "experiment", MFModel.validateExperiment(j.data)); if (j.data.scenario && !existsSync(at(j.data.scenario))) r.errors.push({ where: "scenario", msg: `scenario not found: ${j.data.scenario}` }); } }
  for (const f of jsonFiles(join(dir, "layout"))) { const j = readJson(f); if (j.error) fail(f, "layout", j.error); else add(f, "layout", MFModel.validateLayout(j.data)); }
  return summary(sj.data, files);
}
function summary(site, files) { return { site, files, errors: files.reduce((n, f) => n + f.errors.length, 0), warnings: files.reduce((n, f) => n + f.warnings.length, 0) }; }

/* Validate one file of any kind on its own (no cross-references beyond what ctx can see). */
export function checkFile(file) {
  const j = readJson(file); if (j.error) return { kind: null, errors: [{ where: "", msg: j.error }], warnings: [] };
  const kind = MFModel.kindOf(j.data); if (!kind) return { kind: null, errors: [{ where: "format", msg: `not a platform file (format must be one of ${Object.values(MFModel.FORMATS).join(", ")})` }], warnings: [] };
  const r = MFModel.validate(kind, j.data, {}); return { kind, errors: r.errors, warnings: r.warnings };
}

/* List sites under a root folder (default private/sites). */
export function listSites(root = "private/sites") {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory() && existsSync(join(root, d, "site.json"))).map((d) => join(root, d));
}

/* A new site skeleton that validates (warnings for the values only the owner can give). Refuses to overwrite. */
export function newSite(dir, { id, name, country = null, timezone = null } = {}) {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) throw new Error(`bad site id "${id}" (lower-case letters, digits, . _ -)`);
  if (existsSync(join(dir, "site.json"))) throw new Error(`${dir}/site.json exists; not overwritten`);
  for (const d of ["", "layout", "models", "plans", "scenarios", "experiments", "results", "evidence"]) mkdirSync(join(dir, d), { recursive: true });
  const site = { format: "mf-site", version: 1, id, name: name || id, country, timezone, productLines: [],
    calendar: { shifts: [{ id: "A", start: "06:00", end: "14:00" }, { id: "B", start: "14:00", end: "22:00" }], breaks: [] },
    buildings: [], areas: [] };
  const library = { format: "mf-library", version: 1,
    carriers: [{ id: "trolley-std", name: "Standard trolley", capacity: { units: 40 }, load: 20, unload: 20, source: "assumed" }],
    vehicles: [{ id: "op-push", name: "Operator pushing", kind: "operator", speed: 1.0, source: "assumed" }],
    lifts: [], devices: [] };
  writeFileSync(join(dir, "site.json"), JSON.stringify(site, null, 1) + "\n");
  writeFileSync(join(dir, "library.json"), JSON.stringify(library, null, 1) + "\n");
  writeFileSync(join(dir, "NOTES.md"), `# ${name || id}\n\nSite folder of the Material Flow Platform (docs/PLATFORM_MANUAL.md). Values marked \`"source": "assumed"\` wait for measured data.\n`);
  return dir;
}

/* hash of a model's content without its review fields (state, approvals): runs and approvals are tied to this */
export function modelContentHash(file) {
  const { state, approvals, ...rest } = JSON.parse(readFileSync(file, "utf8"));
  return createHashSync(JSON.stringify(rest));
}
import { createHash as _ch } from "node:crypto";
const createHashSync = (s) => _ch("sha256").update(s).digest("hex");