/* Material Flow Platform: discrete-event simulation core (docs/plans/PLATFORM_PLAN.md section 5, docs/PLATFORM_MANUAL.md).
   Plain script for Node (require) and the page (window.MFSim). Pure: compiled input in, event log out. Seeded and
   deterministic: same input + same seed = identical log. Units: seconds, metres, units (pieces).

   Compiled input (built by tools/core/sim-node.mjs from a scenario):
   { horizon, warmup, seed, dispatch: "fifo" | "due-date",
     resources: [{ id, count, speed ("scene" | m/s), lift: bool, windows: [[t0, t1], ...] | null,
                   breakdown: { mtbf, mttr: dist } | null, charge: { every, for: dist } | null }],
     flows: [{ id, material, pool: [resource ids], load: dist, unload: dist, lot, returnTrip: bool,
               trigger: { every: dist, windows } | { bins, rate (units/s), windows (line), start },
               steps: [{ id, travel: dist, dwell: dist, metres, lift: resource id | null, liftExtra: dist }] }] }
   dist = number | { fixed | uniform | triangular | normal | lognormal | exp | values: [...] } (+ min / max)
*/
(function(root) {
"use strict";
const K = { created: 0, assigned: 1, loadEnd: 2, stepStart: 3, liftWait: 4, liftStart: 5, stepEnd: 6, delivered: 7, returned: 8,
  starveStart: 9, starveEnd: 10, down: 11, up: 12, chargeStart: 13, chargeEnd: 14, liftEnd: 15 };
const KIND_NAMES = Object.keys(K);

/* ---------- random numbers: sfc32 with one stream per source (common random numbers across scenarios) ---------- */
function hash32(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function sfc32(a, b, c, d) {
  return function() { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return (t >>> 0) / 4294967296; };
}
function stream(seed, name) { const h = hash32(seed + ":" + name); const r = sfc32(h, h ^ 0x9e3779b9, h ^ 0x85ebca6b, h ^ 0xc2b2ae35); for (let i = 0; i < 12; i++) r(); return r; }
function sample(d, rnd) {
  if (d == null) return 0; if (typeof d === "number") return d;
  let v;
  if ("fixed" in d) v = d.fixed;
  else if ("uniform" in d) v = d.uniform[0] + (d.uniform[1] - d.uniform[0]) * rnd();
  else if ("triangular" in d) { const [a, m, b] = d.triangular, u = rnd(), f = b === a ? 0 : (m - a) / (b - a); v = u < f ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m)); }
  else if ("normal" in d) { const [mu, sd] = d.normal; v = mu + sd * gauss(rnd); }
  else if ("lognormal" in d) { const [m, s] = d.lognormal, s2 = Math.log(1 + (s * s) / (m * m)), mu = Math.log(m) - s2 / 2; v = Math.exp(mu + Math.sqrt(s2) * gauss(rnd)); }
  else if ("exp" in d) v = -d.exp * Math.log(1 - rnd());
  else if ("values" in d) v = d.values[Math.floor(rnd() * d.values.length)];
  else throw new Error("unknown distribution " + JSON.stringify(d));
  if (d.min != null && v < d.min) v = d.min; if (d.max != null && v > d.max) v = d.max;
  return v < 0 ? 0 : v;
}
function gauss(rnd) { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function mean(d) {
  if (d == null) return 0; if (typeof d === "number") return d;
  if ("fixed" in d) return d.fixed; if ("uniform" in d) return (d.uniform[0] + d.uniform[1]) / 2; if ("triangular" in d) return (d.triangular[0] + d.triangular[1] + d.triangular[2]) / 3;
  if ("normal" in d) return d.normal[0]; if ("lognormal" in d) return d.lognormal[0]; if ("exp" in d) return d.exp; if ("values" in d) return d.values.reduce((a, b) => a + b, 0) / d.values.length; return 0;
}

/* ---------- event queue: binary heap on (time, sequence) ---------- */
function Heap() { this.a = []; this.seq = 0; }
Heap.prototype.push = function(t, fn) { const a = this.a, e = { t, s: this.seq++, fn }; a.push(e); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (less(a[p], a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } };
Heap.prototype.pop = function() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && less(a[l], a[m])) m = l; if (r < a.length && less(a[r], a[m])) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; };
const less = (x, y) => x.t < y.t || (x.t === y.t && x.s < y.s);

/* windows: sorted [[t0, t1]]; null = always open */
const inWin = (w, t) => !w || w.some(([a, b]) => t >= a && t < b);
const nextOpen = (w, t) => { if (!w) return t; for (const [a, b] of w) { if (t < a) return a; if (t < b) return t; } return Infinity; };
const winEnd = (w, t) => { if (!w) return Infinity; for (const [a, b] of w) if (t >= a && t < b) return b; return t; };

/* ---------- the run ---------- */
function run(input, opts = {}) {
  const seed = input.seed | 0, H = input.horizon, Q = new Heap(), log = [], rs = (n) => stream(seed, n);
  const emit = (t, k, a = -1, b = -1, c = -1) => log.push([t, K[k], a, b, c]);
  const resIndex = new Map(), units = [];   // every physical unit: { res, i, busy, down, pendingDown, ... }
  const resources = input.resources.map((r, ri) => {
    const R = { ...r, ri, units: [], rnd: rs("res:" + r.id), queue: [] }; resIndex.set(r.id, R);
    for (let i = 0; i < r.count; i++) { const u = { R, i, uid: units.length, busy: false, off: false, pendingDown: false, pendingCharge: false }; R.units.push(u); units.push(u); }
    return R;
  });
  const flows = input.flows.map((f, fi) => ({ ...f, fi, rnd: rs("flow:" + f.id), pool: f.pool.map((id) => { const R = resIndex.get(id); if (!R) throw new Error(`flow ${f.id}: unknown resource ${id}`); return R; }) }));
  const orders = [], open = [];   // open = orders waiting for a mover
  let now = 0;

  function createOrder(F, due) { const o = { id: orders.length, F, created: now, due, assigned: -1, delivered: -1 }; orders.push(o); emit(now, "created", o.id, F.fi); open.push(o); dispatch(); return o; }
  function available(u) { return !u.busy && !u.off && inWin(u.R.windows, now); }
  function dispatch() {
    if (!open.length) return;
    if (input.dispatch === "due-date") open.sort((a, b) => a.due - b.due || a.id - b.id);
    for (let k = 0; k < open.length; k++) {
      const o = open[k]; let unit = null;
      for (const R of o.F.pool) { unit = R.units.find(available); if (unit) break; }
      if (!unit) continue;
      open.splice(k--, 1); start(o, unit);
    }
  }
  function start(o, u) {
    u.busy = true; o.assigned = now; o.unit = u.uid; emit(now, "assigned", o.id, u.uid);
    const F = o.F, rnd = F.rnd, speed = u.R.speed, acts = [];
    acts.push({ k: "hold", d: sample(F.load, rnd), end: "loadEnd" });
    let backTime = 0;
    F.steps.forEach((s, si) => {
      const travel = speed === "scene" || !s.metres ? sample(s.travel, rnd) : s.metres / speed, dwell = sample(s.dwell, rnd);
      backTime += speed === "scene" || !s.metres ? mean(s.travel) : s.metres / speed;
      if (s.lift) acts.push({ k: "lift", R: resIndex.get(s.lift), d: travel + sample(s.liftExtra, rnd), si });
      else acts.push({ k: "step", d: travel, si });
      acts.push({ k: "hold", d: dwell, end: "stepEnd", si });
    });
    acts.push({ k: "hold", d: sample(F.unload, rnd), end: "delivered" });
    if (F.returnTrip) acts.push({ k: "hold", d: backTime, end: "returned" });
    o.acts = acts; o.ai = 0; next(o);
  }
  function next(o) {
    if (o.ai >= o.acts.length) return finish(o);
    const a = o.acts[o.ai++];
    if (a.k === "hold") { Q.push(now + a.d, () => { if (a.end) end(o, a); next(o); }); return; }
    emit(now, "stepStart", o.id, a.si);
    if (a.k === "step") { Q.push(now + a.d, () => next(o)); return; }
    // lift: wait for a free car slot (capacity = count x carriers per trip, treated as parallel slots)
    const L = a.R; if (!L) { Q.push(now + a.d, () => next(o)); return; }
    const go = (u) => { u.busy = true; emit(now, "liftStart", o.id, u.uid); Q.push(now + a.d, () => { u.busy = false; emit(now, "liftEnd", o.id, u.uid); liftFree(L); next(o); }); };
    const u = L.units.find(available);
    if (u) go(u); else { emit(now, "liftWait", o.id, a.si); L.queue.push(go); }
  }
  function liftFree(L) { while (L.queue.length) { const u = L.units.find(available); if (!u) break; L.queue.shift()(u); } }
  function end(o, a) {
    if (a.end === "loadEnd") emit(now, "loadEnd", o.id);
    else if (a.end === "stepEnd") emit(now, "stepEnd", o.id, a.si);
    else if (a.end === "delivered") { o.delivered = now; emit(now, "delivered", o.id, o.F.fi); deliver(o); if (!o.F.returnTrip) release(o); }
  }
  function finish(o) { if (o.F.returnTrip) release(o); }
  function release(o) {
    const u = units[o.unit]; u.busy = false; emit(now, "returned", o.id, u.uid);
    if (u.pendingDown) { u.pendingDown = false; goDown(u); }
    else if (u.pendingCharge) { u.pendingCharge = false; goCharge(u); }
    dispatch();
  }
  function goDown(u) { u.off = true; const B = u.R.breakdown; emit(now, "down", u.uid); Q.push(now + sample(B.mttr, u.R.rnd), () => { u.off = false; emit(now, "up", u.uid); schedDown(u); dispatch(); liftFree(u.R); }); }
  function schedDown(u) { const B = u.R.breakdown; if (!B) return; Q.push(now + sample({ exp: B.mtbf }, u.R.rnd), () => { if (u.busy) u.pendingDown = true; else if (!u.off) goDown(u); else schedDown(u); }); }
  function goCharge(u) { u.off = true; emit(now, "chargeStart", u.uid); Q.push(now + sample(u.R.charge.for, u.R.rnd), () => { u.off = false; emit(now, "chargeEnd", u.uid); schedCharge(u); dispatch(); }); }
  // the first charge of unit i of n starts after every x (i + 1) / n, so a fleet never charges all at once
  function schedCharge(u, first) { const C = u.R.charge; if (!C) return; Q.push(now + (first ? C.every * (u.i + 1) / u.R.count : C.every), () => { if (u.busy) u.pendingCharge = true; else if (!u.off) goCharge(u); else schedCharge(u); }); }

  /* line side: discrete consumption, one unit at a time while the line works; every emptied lot (bin) orders a lot */
  const sides = [];
  function deliver(o) { const S = o.F.side; if (!S) return; S.stock += o.F.lot; S.pipe--; if (S.starved) { S.starved = false; emit(now, "starveEnd", o.F.fi); consumeNext(S); } }
  function consumeNext(S) {
    if (S.waiting) return; const t = nextOpen(S.windows, now); if (t === Infinity) return;
    S.waiting = true; Q.push(Math.max(t, now) + 1 / S.rate, () => { S.waiting = false; consume(S); });
  }
  function consume(S) {
    if (!inWin(S.windows, now)) { consumeNext(S); return; }
    if (S.stock <= 0) { if (!S.starved) { S.starved = true; emit(now, "starveStart", S.F.fi); } return; }
    S.stock--; S.used++;
    if (S.used % S.F.lot === 0) { S.pipe++; const due = now + S.stock / S.rate; createOrder(S.F, due); }
    consumeNext(S);
  }

  /* start everything */
  for (const R of resources) for (const u of R.units) { schedDown(u); schedCharge(u, true); }
  for (const R of resources) if (R.windows) for (const [a] of R.windows) Q.push(a, () => dispatch());
  for (const F of flows) {
    const T = F.trigger;
    if (T.bins != null) {
      if (!(T.rate > 0)) continue;   // no consumption: no orders
      const S = { F, rate: T.rate, windows: T.windows || null, stock: T.start != null ? T.start : T.bins * F.lot, used: 0, pipe: 0, starved: false, waiting: false };
      F.side = S; sides.push(S); Q.push(0, () => consumeNext(S));
    } else if (T.every != null) {
      const tick = () => { if (inWin(T.windows || null, now)) createOrder(F, now + mean(T.every)); const dt = Math.max(1e-6, sample(T.every, F.rnd)); Q.push(now + dt, tick); };
      Q.push(T.first != null ? T.first : 0, tick);
    } else if (T.once != null) Q.push(T.once, () => createOrder(F, Infinity));
  }
  let n = 0; const maxEvents = opts.maxEvents || 5e7;
  while (Q.a.length) { const e = Q.pop(); if (e.t > H) break; now = e.t; e.fn(); if (++n > maxEvents) throw new Error("too many events"); }
  now = H;
  for (const S of sides) if (S.starved) emit(H, "starveEnd", S.F.fi);
  return { format: "mf-run-log", version: 1, horizon: H, warmup: input.warmup || 0, seed, kinds: KIND_NAMES,
    units: units.map((u) => ({ res: u.R.id, i: u.i })), flows: flows.map((f) => ({ id: f.id, material: f.material, line: f.line || null, windows: f.trigger.windows || null, pool: f.pool.map((R) => R.id), steps: f.steps.map((s) => ({ id: s.id, metres: s.metres || 0 })) })),
    orders: orders.length, events: log };
}

/* ---------- readers ---------- */
/* state of every order at time t: { order: { flow, phase, step, unit } } (open orders only) */
function state(logObj, t) {
  const st = new Map();
  for (const [et, k, a, b] of logObj.events) {
    if (et > t) break; const name = KIND_NAMES[k];
    if (name === "created") st.set(a, { order: a, flow: b, phase: "waiting", step: -1, unit: -1, since: et });
    const o = st.get(a); if (!o && !["starveStart", "starveEnd", "down", "up", "chargeStart", "chargeEnd"].includes(name)) continue;
    if (name === "assigned") Object.assign(o, { phase: "loading", unit: b, since: et });
    else if (name === "stepStart") Object.assign(o, { phase: "moving", step: b, since: et });
    else if (name === "liftWait") Object.assign(o, { phase: "lift-queue", since: et });
    else if (name === "liftStart") Object.assign(o, { phase: "riding", since: et });
    else if (name === "stepEnd") Object.assign(o, { phase: "at-stop", since: et });
    else if (name === "delivered") Object.assign(o, { phase: "returning", since: et });
    else if (name === "returned") st.delete(a);
  }
  return [...st.values()];
}

const api = { K, KIND_NAMES, run, state, sample, mean, stream, hash32, inWin, nextOpen, winEnd };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MFSim = api;
})(typeof window !== "undefined" ? window : this);
