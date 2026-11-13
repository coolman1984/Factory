// Re-check approved baselines (PLATFORM_PLAN P7 "nightly"): re-run the scenario that approved each model and flag every KPI
// whose new mean leaves the approved 95 % range (or differs, for single-replication runs). Runs are seeded, so with
// unchanged inputs a flag means the engine changed. Not scheduled automatically (owner decision Q6); run it by hand or
// from a scheduled task once the owner approves.
import { join } from "node:path";
import { existsSync } from "node:fs";
import { approved } from "./govern-node.mjs";
import { modelContentHash } from "./site-node.mjs";
import { runScenario } from "./sim-node.mjs";

export async function recheck(siteDir) {
  const out = [];
  for (const a of approved(siteDir)) {
    const scen = join(siteDir, "scenarios", `${a.scenario}.json`); if (!a.scenario || !existsSync(scen)) { out.push({ model: a.model, scenario: a.scenario, flags: ["approving scenario missing"], inputsChanged: true }); continue; }
    const now = modelContentHash(join(siteDir, "models", `${a.model}.model.json`)), r = await runScenario(scen, { replications: a.kpiRanges && Object.values(a.kpiRanges)[0] ? Object.values(a.kpiRanges)[0].n : undefined });
    const flags = [];
    for (const [k, v] of Object.entries(a.kpiRanges || {})) {
      const m = r.receipt.kpis[k]; if (!m) { flags.push(`${k} missing`); continue; }
      const lo = v.n > 1 ? v.lo : v.mean - 1e-6 * Math.max(1, Math.abs(v.mean)), hi = v.n > 1 ? v.hi : v.mean + 1e-6 * Math.max(1, Math.abs(v.mean));
      if (m.mean < lo - 1e-9 || m.mean > hi + 1e-9) flags.push(`${k} ${v.mean.toFixed(3)} -> ${m.mean.toFixed(3)}`);
    }
    out.push({ model: a.model, scenario: a.scenario, approvedRun: a.run, run: r.receipt.id, flags, inputsChanged: now !== a.modelHash });
  }
  return out;
}
