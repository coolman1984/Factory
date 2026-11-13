/* Material Flow V8.1: the player's step timeline comes from the Factory Engine (3D Factory repository, engine/).
   For every path, the motion core still computes the geometry (legs, turns, scan holds, lift ride); the engine then runs the
   trip as a transport mission (load the lot, one leg per step, shared lift resource, unload) and its event times become the
   step times the player plays. The engine is the only writer of trip state; the player reads it (lot position, trolley
   activity, events, fingerprint). Clock: 1 tick = 1 microsecond. When the engine's tick is the motion core's own instant the
   exact motion-core float is kept, so an undisturbed trip replays bit-identically to V8.0; moved steps get the engine time.
   Runs in Chrome (window.MFEngine) and in Node (module.exports.makeBridge) for tests. */
(function (root) {
"use strict";
function makeBridge(MC, FE) {
  if (!MC || !FE) throw new Error("engine bridge needs MFMotion and FactoryEngine");
  const TPS = 1000000, R = s => Math.round(s * TPS), info = new WeakMap(), original = MC.timeline;
  const stopId = node => "stop:" + node, liftId = label => "lift:" + (label || "main");

  // One path -> one engine model and one transport mission whose legs are the steps, with the motion core's durations.
  function flowModel(D, f, items, elevator) {
    const first = items[1] || items[0], last = items[items.length - 1], locs = new Map(), lifts = new Set();
    for (const it of items) locs.set(stopId(it.s.node), true);
    for (const it of items.slice(1)) if (it.s.lift) lifts.add(liftId(it.s.elevator || (elevator && elevator.label)));
    const model = { format: "fe-model", version: 1, name: "path:" + f.id, tickPerSecond: TPS, seed: 1,
      items: [{ id: "lot", unit: "lot" }], locations: [...locs.keys()].map(id => ({ id, kind: "stop" })),
      pools: [{ id: "trolleys", kind: "carrier", units: [{ id: "trolley", node: stopId(first.s.node) }] }, ...[...lifts].map(id => ({ id, kind: "lift", units: [{ id: id + ":car" }] }))],
      initial: { stock: [{ location: stopId(first.s.node), item: "lot", qty: 1 }] } };
    const actions = [{ k: "load", seconds: 0 }];
    for (const it of items.slice(1)) {
      const marks = it.sched ? it.sched.phases.filter(p => p.k === "scan").map(p => ({ atSeconds: (R(it.t0 + p.t0) - R(it.t0)) / TPS, type: "scan", ref: p.scanner ?? null })) : [];
      actions.push({ k: "leg", to: stopId(it.s.node), travelSeconds: (R(it.tm) - R(it.t0)) / TPS, dwellSeconds: (R(it.t1) - R(it.tm)) / TPS,
        lift: it.s.lift ? liftId(it.s.elevator || (elevator && elevator.label)) : null, marks, label: it.s.title || null, ref: it.i });
    }
    actions.push({ k: "unload", seconds: 0 });
    return { model, mission: { item: "lot", qty: 1, from: stopId(first.s.node), to: stopId(last.s.node), carrier: "trolley", actions, releaseSeconds: R(items[0].t1) / TPS, label: f.name || f.id } };
  }

  // options.model(model): edit the engine model first (e.g. add another trolley); options.commands: engine commands submitted
  // before the trip (e.g. that trolley's mission through the same lift). Both are for tests and what-if runs; the player uses none.
  function runFlow(D, f, elevator, result, options = {}) {
    const items = result.items, { model, mission } = flowModel(D, f, items, elevator);
    if (options.model) options.model(model);
    const world = new FE.World(model, { checkInvariants: true });
    for (const c of options.commands || []) { const r = world.submit(c); if (!r.ok) throw new Error(`engine refused ${c.command_id}: ${r.reason}`); }
    const res = world.submit({ command_id: "trip:" + f.id, type: "transport.request", payload: mission });
    if (!res.ok) throw new Error(`engine refused path ${f.id}: ${res.reason}`);
    world.runToEnd();
    const byAction = new Map(); for (const e of world.log) if (e.mission === res.result.mission && e.action != null) { const k = e.action; if (!byAction.has(k)) byAction.set(k, {}); byAction.get(k)[e.type] = e.t; }
    // The engine decides every instant (tick). When its tick is the motion core's own instant, keep that exact float, so an
    // undisturbed trip replays bit-identically; a step the engine moved (wait, shared lift, command) gets the engine time.
    const out = items.map(it => ({ ...it })), pick = (tick, motion) => tick === R(motion) ? motion : tick / TPS; let moved = 0;
    for (let i = 1; i < out.length; i++) {
      const ev = byAction.get(i);   // action i is the leg of item i (action 0 = load)
      if (!ev || ev["leg.start"] == null || ev["leg.arrive"] == null || ev["leg.end"] == null) throw new Error(`engine did not play step ${i} of path ${f.id}`);
      const it = items[i]; if (ev["leg.start"] !== R(it.t0) || ev["leg.arrive"] !== R(it.tm) || ev["leg.end"] !== R(it.t1)) moved++;
      out[i].t0 = pick(ev["leg.start"], it.t0); out[i].tm = pick(ev["leg.arrive"], it.tm); out[i].t1 = pick(ev["leg.end"], it.t1);
    }
    const problems = world.ledger.check(); if (problems.length) throw new Error(`engine invariants failed for path ${f.id}: ${problems.join("; ")}`);
    const last = out[out.length - 1], total = out.length > 1 ? pick(byAction.get(out.length - 1)["leg.end"], result.total) : result.total;
    const names = {}; for (const id of Object.keys(D.nodes || {})) names[stopId(id)] = (D.nodes[id] && (D.nodes[id].text || D.nodes[id].label)) || id;
    const data = { ok: true, engine: FE.ENGINE_VERSION, tps: TPS, model: world.modelHash, fingerprint: world.fingerprint(), log: world.log, names, mission: res.result.mission, steps: out.length - 1, moved, total, end: last ? last.t1 : total };
    return { items: out, total, data };
  }

  // Wrapped timeline: same signature and result shape as MFMotion.timeline; falls back (visibly) if the engine fails.
  function timeline(D, f, elevator) {
    const result = original(D, f, elevator);
    try { const r = runFlow(D, f, elevator, result); info.set(f, r.data); return { items: r.items, total: r.total }; }
    catch (e) { info.set(f, { ok: false, error: String(e && e.message || e) }); if (root.console) console.error("[Factory Engine] fallback to the motion core:", e); return result; }
  }

  // What the engine says at story time t (seconds): lot location, trolley activity, current step, recent events.
  function stateAt(data, t) {
    if (!data || !data.ok) return { ok: false, error: data ? data.error : "no engine data" };
    const tick = R(t), s = { ok: true, tick, lot: null, onTrolley: false, activity: "waiting for release", step: 0, to: null, recent: [], scans: 0, done: false };
    for (const e of data.log) {
      if (e.t > tick) break;
      if (e.type === "world.start" || e.type === "command.accepted" || (e.mission && e.mission !== data.mission)) continue;
      if (e.type === "lift.wait") s.activity = "waiting for the lift";
      if (e.type === "mission.created") s.lot = e.from;
      else if (e.type === "load.end") { s.onTrolley = true; s.lot = "trolley"; s.activity = "loaded"; }
      else if (e.type === "leg.start") { s.step = e.ref ?? e.action; s.to = e.to; s.activity = "moving to " + (data.names[e.to] || e.to); }
      else if (e.type === "lift.start") s.activity = "riding the lift to " + (data.names[s.to] || s.to);
      else if (e.type === "leg.arrive") s.activity = "at " + (data.names[e.at] || e.at);
      else if (e.type === "unload.end") { s.onTrolley = false; s.lot = e.to; s.activity = "delivered at " + (data.names[e.to] || e.to); }
      else if (e.type === "mission.done") s.done = true;
      else if (e.type === "mark") s.scans++;
      s.recent.push(e); if (s.recent.length > 6) s.recent.shift();
    }
    return s;
  }

  /* Shift run (V8.2): every path of the tab at once, for a whole shift, in ONE engine world. Each trolley of a path is a loop
     policy (next trip as soon as its last one is done); every elevator is ONE shared lift resource (cars: opts.liftCars) used by
     all paths in both directions; the empty return is the loaded route reversed with no waits (ESTIMATED: the scenes do not
     draw return routes). The result compares the engine's trips with today's geometric "shift / trip time" number. */
  function shiftModel(D, opts = {}) {
    const hours = opts.hours ?? 8, cars = opts.liftCars ?? 1, elevatorOf = opts.elevatorOf || (f => f.E || null), locs = new Map(), lifts = new Set(), units = [], policies = [], stock = [], items = [], paths = [];
    D.flows.forEach(f => {
      const E = elevatorOf(f), base = original(D, f, E), steps = base.items.slice(1); if (!steps.length) return;
      const liftOf = it => it.s.lift ? liftId(it.s.elevator || (E && E.label)) : null, first = stopId(steps[0].s.node), last = stopId(steps[steps.length - 1].s.node);
      for (const it of steps) { locs.set(stopId(it.s.node), true); const l = liftOf(it); if (l) lifts.add(l); }
      const sp = opts.spread || 0, vary = it => it.s.lift ? {} : { travelSpread: sp, dwellSpread: sp };   // lift rides keep their fixed time
      const legs = steps.map(it => ({ k: "leg", to: stopId(it.s.node), travelSeconds: it.tm - it.t0, dwellSeconds: it.t1 - it.tm, lift: liftOf(it), label: it.s.title || null, ...vary(it) }));
      const back = opts.returnTrip === false || first === last ? [] : steps.slice().reverse().map((it, j, arr) => ({ k: "leg", to: j + 1 < arr.length ? stopId(arr[j + 1].s.node) : first, travelSeconds: it.tm - it.t0, dwellSeconds: 0, lift: liftOf(it), label: "empty return (estimated)", ...vary(it) }));
      const oneWay = steps.reduce((n, it) => n + (it.t1 - it.t0), 0), backTime = back.reduce((n, l) => n + l.travelSeconds, 0), n = Math.max(1, opts.trolleys ? opts.trolleys(f) : (f.trolleys || 1)), item = "lot:" + f.id;
      items.push({ id: item, unit: "lot" }); stock.push({ location: first, item, qty: 1000000 });
      for (let k = 0; k < n; k++) {
        const u = "trolley:" + f.id + ":" + (k + 1); units.push({ id: u, node: first });
        policies.push({ id: "loop:" + f.id + ":" + (k + 1), kind: "loop", item, from: first, to: last, carrier: u, startSeconds: (k * (oneWay + backTime)) / n, actions: [{ k: "load", seconds: 0 }, ...legs, { k: "unload", seconds: 0 }, ...back] });
      }
      paths.push({ id: f.id, name: f.name || f.id, trolleys: n, oneWay, cycleAlone: oneWay + backTime, naive: Math.floor(hours * 3600 / Math.max(1, oneWay)) * n, lifts: [...new Set(steps.map(liftOf).filter(Boolean))] });
    });
    const model = { format: "fe-model", version: 1, name: "shift", tickPerSecond: 1000, seed: opts.seed ?? 1, items, locations: [...locs.keys()].map(id => ({ id, kind: "stop" })),
      pools: [{ id: "trolleys", kind: "carrier", units }, ...[...lifts].map(id => ({ id, kind: "lift", units: Array.from({ length: cars }, (_, c) => ({ id: id + ":car" + (c + 1) })) }))], policies, initial: { stock } };
    return { model, paths, hours };
  }
  function runShift(D, opts = {}) {
    const { model, paths, hours } = shiftModel(D, opts), world = new FE.World(model, { keepLog: false, checkInvariants: !!opts.check });
    world.runUntil(Math.round(hours * 3600 * 1000)); const r = world.report(), byPolicy = new Map(r.policies.map(p => [p.id, p])), util = new Map(r.units.map(u => [u.id, u.utilisation]));
    const rows = paths.map(p => {
      const pol = [...byPolicy.values()].filter(x => x.id.startsWith("loop:" + p.id + ":")), done = pol.reduce((n, x) => n + x.done, 0), wait = pol.reduce((n, x) => n + x.lift_wait_s, 0);
      const cyc = pol.filter(x => x.done).map(x => x.mean_cycle_s);
      return { ...p, trips: done, meanCycle: cyc.length ? cyc.reduce((a, b) => a + b, 0) / cyc.length : null, liftWaitPerTrip: done ? wait / done : null };
    });
    const liftRows = model.pools.filter(p => p.kind === "lift").map(p => ({ id: p.id, cars: p.units.length, busy: p.units.reduce((n, u) => n + (util.get(u.id) || 0), 0) / p.units.length }));
    return { engine: FE.ENGINE_VERSION, hours, returnTrip: opts.returnTrip !== false, liftCars: opts.liftCars ?? 1, spread: opts.spread || 0, seed: model.seed, paths: rows, lifts: liftRows, fingerprint: r.fingerprint, invariants: r.invariants, events: r.events };
  }

  const api = { TPS, version: FE.ENGINE_VERSION, original, timeline, runFlow, flowModel, stateAt, shiftModel, runShift, infoFor: f => info.get(f) || null,
    install() { if (MC.timeline !== timeline) MC.timeline = timeline; return api; } };
  return api;
}
if (typeof module !== "undefined" && module.exports) module.exports = { makeBridge };
else { root.MFEngine = makeBridge(root.MFMotion, root.FactoryEngine).install(); }
})(typeof window !== "undefined" ? window : this);
