// Governance (PLATFORM_PLAN P7): review states of a site's models and an append-only change history.
// States: draft -> reviewed -> approved. A model can be "approved" only when (1) the site validates with 0 errors and
// (2) a recorded run (results.sqlite) used exactly this model content (sha256 without the state / approvals fields). Every state change and
// every approval is appended to <site>/CHANGES.jsonl with who, when, note and the run id.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { checkSite, modelContentHash } from "./site-node.mjs";
const STATES = ["draft", "reviewed", "approved"];
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

export async function setState(siteDir, modelId, state, { by, note = "", run } = {}) {
  if (!STATES.includes(state)) throw new Error(`state must be ${STATES.join(", ")}`);
  if (!by) throw new Error("--by <name> required (who approves)");
  const file = join(siteDir, "models", `${modelId}.model.json`); if (!existsSync(file)) throw new Error(`no model ${modelId} in ${siteDir}/models`);
  const chk = checkSite(siteDir); if (chk.errors) throw new Error(`refused: the site has ${chk.errors} validation error(s)`);
  const model = JSON.parse(readFileSync(file, "utf8")), hash = modelContentHash(file);
  let evidence = null;
  if (state === "approved") {
    const dbFile = join(siteDir, "results", "results.sqlite"); if (!existsSync(dbFile)) throw new Error("refused: no recorded runs (run a scenario of this model first)");
    const { open } = await import("./results-db.mjs"), db = open(dbFile);
    try {
      const rows = db.prepare("SELECT r.id, r.receipt FROM runs r JOIN inputs i ON i.run = r.id WHERE i.kind = 'modelContent' AND i.hash = ? ORDER BY r.at DESC").all(hash).filter((x) => !JSON.parse(x.receipt).variant); /* only plain scenario runs approve a model */
      const pick = run ? rows.find((x) => x.id === run) : rows[0];
      if (!pick) throw new Error(`refused: no recorded run used the current model file (content sha256 ${hash.slice(0, 12)})${run ? ` with id ${run}` : ""}; run a scenario first`);
      const rc = JSON.parse(pick.receipt); evidence = { run: pick.id, scenario: rc.scenario, kpiRanges: rc.kpis, kpis: Object.fromEntries(Object.entries(JSON.parse(pick.receipt).kpis).map(([k, v]) => [k, +v.mean.toFixed(4)])) };
    } finally { db.close(); }
  }
  const prev = model.state || "draft", entry = { at: new Date().toISOString(), model: modelId, from: prev, to: state, by, note, modelHash: hash, ...(evidence || {}) };
  model.state = state; model.approvals = [...(model.approvals || []), { state, by, at: entry.at, note, run: evidence ? evidence.run : null }];
  writeFileSync(file, JSON.stringify(model, null, 1) + "\n");
  appendFileSync(join(siteDir, "CHANGES.jsonl"), JSON.stringify(entry) + "\n");
  return entry;
}
export function history(siteDir) { const f = join(siteDir, "CHANGES.jsonl"); return existsSync(f) ? readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []; }

/* models of a site whose last state is approved, with the run that approved them */
export function approved(siteDir) {
  const last = new Map(); for (const h of history(siteDir)) last.set(h.model, h);
  return [...last.values()].filter((h) => h.to === "approved");
}
