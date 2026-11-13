/* Material Flow Platform: calendar windows and demand from a production plan (PLATFORM_PLAN sections 4.5, 4.6; P2).
   Plain script (Node + page). Times are seconds from the run start (day 0, 00:00 local site time). */
(function(root) {
"use strict";
const hm = (s) => { const [h, m] = s.split(":").map(Number); return (h * 60 + m) * 60; };
function merge(w) { w.sort((a, b) => a[0] - b[0]); const out = []; for (const x of w) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push(x.slice()); } return out; }
function subtract(w, cuts) { let out = w; for (const [c0, c1] of cuts) { const n = []; for (const [a, b] of out) { if (c1 <= a || c0 >= b) n.push([a, b]); else { if (c0 > a) n.push([a, c0]); if (c1 < b) n.push([c1, b]); } } out = n; } return out; }

/* working windows of the given shift ids ("A+B", or null = every shift) over `days` days, breaks removed.
   workDays: optional list of day indexes that work (default all). */
function windows(calendar, shiftSel, days, workDays) {
  const want = shiftSel ? String(shiftSel).split("+") : null, out = [], cuts = [];
  for (let d = 0; d < days; d++) {
    if (workDays && !workDays.includes(d)) continue;
    for (const s of calendar.shifts || []) {
      if (want && !want.includes(s.id)) continue;
      let a = hm(s.start), b = hm(s.end); if (b <= a) b += 86400;
      out.push([d * 86400 + a, d * 86400 + b]);
      for (const br of calendar.breaks || []) if (br.shift === s.id) { let t = hm(br.start); if (t < a) t += 86400; cuts.push([d * 86400 + t, d * 86400 + t + br.minutes * 60]); }
    }
  }
  return subtract(merge(out), cuts);
}
const span = (w) => w.reduce((s, [a, b]) => s + (b - a), 0);

/* demand of one flow from a plan: { rate (units/s while its lines work), windows, lines: [ids], perDay (units) } or null.
   A flow feeds flow.line when given, else every plan line that uses its material. Lines with different shifts: the rate
   is total units / total working seconds of the union of their windows (an average; stated in the receipt). */
function flowDemand(flow, plan, calendar, days) {
  if (!plan) return null;
  const planDays = Math.min(days, plan.days || days), uses = [];
  for (const l of plan.lines || []) {
    if (flow.line && l.line !== flow.line) continue;
    const per = (plan.bom || []).filter((b) => b.model === l.model && b.material === flow.material).reduce((s, b) => s + b.per_unit, 0);
    if (per > 0) uses.push({ line: l.line, unitsPerHour: l.rate.per_hour * per, shift: l.shift || null });
  }
  if (!uses.length) return null;
  const days0 = [...Array(planDays).keys()];
  let units = 0; const all = [];
  for (const u of uses) { const w = windows(calendar, u.shift, days, days0); units += u.unitsPerHour * span(w) / 3600; all.push(...w); }
  const w = merge(all), sec = span(w);
  return { rate: sec ? units / sec : 0, windows: w, lines: [...new Set(uses.map((u) => u.line))], units, perDay: units / Math.max(1, planDays) };
}
const api = { windows, flowDemand, span, merge, subtract, hm };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MFDemand = api;
})(typeof window !== "undefined" ? window : this);
