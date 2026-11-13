/* Material Flow Platform: KPIs from a simulation log (docs/plans/PLATFORM_PLAN.md section 6). Plain script (Node + page).
   kpis(log, extra) -> { key: value } for one replication; summarise([kpis...]) -> { key: { mean, sd, lo, hi, n } } (95 % CI). */
(function(root) {
"use strict";
const KN = ["created", "assigned", "loadEnd", "stepStart", "liftWait", "liftStart", "stepEnd", "delivered", "returned", "starveStart", "starveEnd", "down", "up", "chargeStart", "chargeEnd", "liftEnd"];
const K = Object.fromEntries(KN.map((k, i) => [k, i]));
// two-sided 95 % Student t quantiles for n - 1 degrees of freedom
const T95 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
const t95 = (df) => df < T95.length ? T95[df] : 1.96 + 2.4 / df;
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const winOverlap = (w, t0, t1) => !w ? Math.max(0, t1 - t0) : w.reduce((s, [a, b]) => s + overlap(t0, t1, a, b), 0);
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/* extra: { shiftHours (for per-shift values), rates: { labourPerHour, agvPerHour, ... }, resourceKinds: { resId: "operator" | "agv" | ... },
            resourceWindows: { resId: windows | null } } */
function kpis(log, extra = {}) {
  const W = log.warmup || 0, H = log.horizon, span = Math.max(1e-9, H - W), shiftH = extra.shiftHours || 8;
  const O = new Map(), busy = new Map(), down = new Map(), starve = new Map();
  let delivered = 0, onTime = 0, metres = 0; const lead = [], waitMover = [], waitLift = [];
  const unitBusyFrom = new Map(), unitOffFrom = new Map(), liftWaitFrom = new Map(), starveFrom = new Map();
  for (const [t, k, a, b] of log.events) {
    switch (k) {
      case K.created: O.set(a, { created: t, flow: b, due: Infinity }); break;
      case K.assigned: { const o = O.get(a); if (o) { o.assigned = t; o.unit = b; if (t >= W) waitMover.push(t - o.created); } unitBusyFrom.set(b, t); break; }
      case K.liftWait: liftWaitFrom.set(a, t); break;
      case K.liftStart: { const s = liftWaitFrom.get(a); if (s != null) { if (t >= W) waitLift.push(t - s); liftWaitFrom.delete(a); } else if (t >= W) waitLift.push(0); unitBusyFrom.set(b, t); break; }
      case K.liftEnd: addBusy(b, unitBusyFrom.get(b), t); unitBusyFrom.delete(b); break;
      case K.delivered: { const o = O.get(a); if (!o) break; o.delivered = t; if (t >= W) { delivered++; lead.push(t - o.created); const f = log.flows[o.flow]; metres += f.steps.reduce((s, x) => s + x.metres, 0); } break; }
      case K.returned: { const o = O.get(a); if (o) { addBusy(o.unit, unitBusyFrom.get(o.unit), t); O.delete(a); } break; }
      case K.starveStart: starveFrom.set(a, t); break;
      case K.starveEnd: { const s = starveFrom.get(a); if (s != null) { const w = log.flows[a].windows; starve.set(a, (starve.get(a) || 0) + winOverlap(w, Math.max(s, W), t)); starveFrom.delete(a); } break; }
      case K.down: case K.chargeStart: unitOffFrom.set(a, t); break;
      case K.up: case K.chargeEnd: { const s = unitOffFrom.get(a); if (s != null) { down.set(a, (down.get(a) || 0) + overlap(s, t, W, H)); unitOffFrom.delete(a); } break; }
    }
  }
  // busy time counts inside the unit's working windows only (a trip that runs past the shift end is not extra capacity)
  function addBusy(u, s, t) { if (s == null) return; const w = extra.resourceWindows && extra.resourceWindows[log.units[u].res] || null; busy.set(u, (busy.get(u) || 0) + winOverlap(w, Math.max(s, W), Math.min(t, H))); }
  const res = {}; log.units.forEach((u, i) => { const r = (res[u.res] ||= { busy: 0, avail: 0, down: 0, n: 0 }); r.n++; r.busy += busy.get(i) || 0; r.down += down.get(i) || 0; r.avail += winOverlap(extra.resourceWindows && extra.resourceWindows[u.res] || null, W, H); });
  const util = {}; for (const [id, r] of Object.entries(res)) util[id] = r.avail > 0 ? r.busy / r.avail : 0;
  const shifts = span / 3600 / shiftH;
  const starvedTotal = [...starve.values()].reduce((a, b) => a + b, 0), starvedBy = {}; for (const [fi, s] of starve) starvedBy[log.flows[fi].id] = s / 60;
  const out = {
    throughput: delivered / (span / 3600),
    delivered,
    starved_min: starvedTotal / 60 / Math.max(1e-9, shifts),
    lead_time: lead.length ? lead.reduce((a, b) => a + b, 0) / lead.length : 0,
    lead_time_p95: pct(lead, .95),
    wait_mover: waitMover.length ? waitMover.reduce((a, b) => a + b, 0) / waitMover.length : 0,
    wait_lift: waitLift.length ? waitLift.reduce((a, b) => a + b, 0) / waitLift.length : 0,
    distance: metres / Math.max(1e-9, shifts),
  };
  // time-weighted orders in the system (WIP)
  let wip = 0, last = W, cnt = 0; for (const [t, k] of log.events) { if (k !== K.created && k !== K.returned) continue; if (t > W) { wip += cnt * (Math.min(t, H) - last); last = Math.min(t, H); } cnt += k === K.created ? 1 : -1; } wip += cnt * (H - last); out.wip = wip / span;
  for (const [id, u] of Object.entries(util)) out["util." + id] = u;
  for (const [id, m] of Object.entries(starvedBy)) out["starved_min." + id] = m / Math.max(1e-9, shifts);
  if (extra.rates && extra.resourceKinds) {
    let cost = 0, ok = false;
    for (const [id, r] of Object.entries(res)) { const kind = extra.resourceKinds[id], rate = kind === "operator" ? extra.rates.labourPerHour : kind === "agv" ? extra.rates.agvPerHour : kind === "forklift" ? extra.rates.forkliftPerHour : null; if (rate != null) { ok = true; cost += rate * r.avail / 3600; } }
    if (ok) out.cost_shift = cost / Math.max(1e-9, shifts);
  }
  return out;
}
function summarise(list) {
  const keys = [...new Set(list.flatMap((k) => Object.keys(k)))], out = {};
  for (const key of keys) {
    const v = list.map((k) => k[key]).filter((x) => typeof x === "number" && Number.isFinite(x)), n = v.length;
    const m = n ? v.reduce((a, b) => a + b, 0) / n : NaN, sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0, h = n > 1 ? t95(n - 1) * sd / Math.sqrt(n) : 0;
    out[key] = { mean: m, sd, lo: m - h, hi: m + h, n };
  }
  return out;
}
const LABELS = { throughput: ["Deliveries per hour", "orders/h"], delivered: ["Deliveries", "orders"], starved_min: ["Line starved", "min/shift"], lead_time: ["Lead time (mean)", "s"], lead_time_p95: ["Lead time (p95)", "s"], wait_mover: ["Wait for a mover", "s"], wait_lift: ["Wait for an elevator", "s"], distance: ["Distance travelled", "m/shift"], wip: ["Orders in progress (WIP)", "orders"], cost_shift: ["Cost", "per shift"] };
function label(key) { if (LABELS[key]) return LABELS[key]; const [b, id] = key.split("."); if (b === "util") return [`Utilisation ${id}`, "%"]; if (b === "starved_min") return [`Starved ${id}`, "min/shift"]; return [key, ""]; }
const api = { kpis, summarise, label, t95 };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MFKpi = api;
})(typeof window !== "undefined" ? window : this);
