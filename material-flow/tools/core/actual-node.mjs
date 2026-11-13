// Plan versus actual (PLATFORM_PLAN P8): compare shop-floor reads (RFID / MES export CSV: time,carrier,stop[,flow]) with a
// simulation run of the same model. A trip = one carrier read at the stops of a flow's route in order (first to last stop).
// Times compared: per flow the mean trip time (first to last stop) and the mean time between consecutive stops.
// The simulation side uses the moments its carriers leave each stop (stepEnd), the same way a read gate would see them.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readEvents, tripsFromEvents } from "./import-node.mjs";
const K = { stepEnd: 6 };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

function runData(runDir) { const rd = (f) => JSON.parse(readFileSync(join(runDir, f), "utf8")); return { log: rd("log.json"), geo: rd("geometry.json"), receipt: rd("receipt.json") }; }
export function routesOf(geo) { const r = {}; for (const [id, f] of Object.entries(geo.flows)) r[id] = f.steps.map((s) => s.stop).filter((s, i, a) => s && s !== a[i - 1]); return r; }

/* per flow from the simulation: trip and step means (leave first stop -> leave last stop) */
export function simTrips(log, geo) {
  const by = new Map(), out = {};
  for (const [t, k, a, b] of log.events) { if (k !== K.stepEnd || t < (log.warmup || 0)) continue; if (!by.has(a)) by.set(a, []); by.get(a).push([b, t]); }
  const flowOf = new Map(); for (const [t, k, a, b] of log.events) if (k === 0) flowOf.set(a, b);
  for (const [o, seq] of by) {
    const f = log.flows[flowOf.get(o)], n = f.steps.length; if (seq.length !== n) continue;   // only finished trips
    const R = (out[f.id] ||= { trips: 0, lead: [], steps: f.steps.slice(1).map(() => []) });
    R.trips++; R.lead.push(seq[n - 1][1] - seq[0][1]); for (let i = 1; i < n; i++) R.steps[i - 1].push(seq[i][1] - seq[i - 1][1]);
  }
  for (const R of Object.values(out)) { R.leadMean = mean(R.lead); R.stepMeans = R.steps.map(mean); delete R.lead; delete R.steps; }
  return out;
}
/* synthetic reads from a run (for tests and demos): one read per carrier (mover unit) as it leaves each stop */
export function exportReads(runDir, csv) {
  const { log, geo } = runData(runDir), rows = ["time,carrier,stop,flow"], unitOf = new Map(), flowOf = new Map();
  for (const [t, k, a, b] of log.events) { if (k === 0) flowOf.set(a, b); if (k === 1) unitOf.set(a, b); if (k === K.stepEnd) { const f = log.flows[flowOf.get(a)], st = geo.flows[f.id].steps[b]; if (st.stop) rows.push(`${t.toFixed(3)},unit-${unitOf.get(a)},${st.stop},${f.id}`); } }
  writeFileSync(csv, rows.join("\n") + "\n"); return rows.length - 1;
}
export function compareActual(runDir, csv, { start } = {}) {
  const { log, geo, receipt } = runData(runDir), routes = routesOf(geo);
  const act = tripsFromEvents(readEvents(csv, { start }), routes), sim = simTrips(log, geo), rows = [];
  for (const id of Object.keys(routes)) {
    const a = act[id] || {}, s = sim[id] || {}, d = a.leadMean != null && s.leadMean ? (a.leadMean - s.leadMean) / s.leadMean : null;
    rows.push({ flow: id, actualTrips: a.trips || 0, simTrips: s.trips || 0, actualTrip: a.leadMean ?? null, simTrip: s.leadMean ?? null, diff: d,
      steps: (routes[id].slice(1)).map((stop, i) => ({ to: stop, actual: a.stepMeans ? a.stepMeans[i] : null, sim: s.stepMeans ? s.stepMeans[i] : null })) });
  }
  return { run: receipt.id, csv, rows };
}
