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

  /* Shift run (V8.2, V8.3): every path of the tab at once, for a whole shift, in ONE engine world. Each trolley of a path is a
     loop policy (next trip as soon as its last one is done); every elevator is ONE shared lift resource (cars: opts.liftCars)
     used by all paths in both directions.
     Empty return (V8.3): a path whose name contains "return" and that runs from a path's last stop back to its first stop is
     that path's DRAWN return route (it is then not a loaded path itself); otherwise the return is ESTIMATED as the loaded route
     reversed with no waits. Measured times (opts.times[pathId] = { trip_s, return_s, load_s, unload_s }, any subset) replace the
     geometric ones: legs are scaled to the measured total. Traffic (opts.aisleCapacity > 0): plan cells (opts.cellMetres, 2 m)
     used by two or more different paths are shared (crossings, common aisles); every shared cell is one engine traffic zone that
     admits aisleCapacity trolleys at a time and is held only while a trolley crosses it (time split by distance: an estimate),
     so trolleys queue at crossings and keep one cell of headway in a shared aisle. Connected shared cells are reported together
     as one shared section. The result compares the engine's trips with today's geometric "shift / trip time" number. */
  const nodeAt = (D, id) => D.nodes && D.nodes[id] || null;
  const samePlace = (D, a, b) => { if (a === b) return true; const A = nodeAt(D, a), B = nodeAt(D, b); return !!(A && B && (A.plate || null) === (B.plate || null) && Math.hypot(A.x - B.x, A.y - B.y) < 1.5); };
  function returnRoutes(D) {
    const map = new Map(), of = new Map();
    for (const r of D.flows) {
      if (!/\breturn\b/i.test(r.name || r.id) || r.steps.length < 2) continue;
      const a = r.steps[0].node, b = r.steps[r.steps.length - 1].node;
      const p = D.flows.find(f => f !== r && !map.has(f.id) && !of.has(f.id) && f.steps.length > 1 && samePlace(D, f.steps[f.steps.length - 1].node, a) && samePlace(D, f.steps[0].node, b));
      if (p) { map.set(p.id, r); of.set(r.id, p.id); }
    }
    return { returnOf: map, isReturn: of };
  }
  // Distance runs of one step's drawn line through the shared-cell map: [{ frac, zone|null }] (fractions add up to 1).
  function runsOf(it, cellOf) {
    const P = Array.isArray(it.path) ? it.path : null; if (!P || P.length < 2 || it.s.lift) return [{ frac: 1, zone: null }];
    let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (!(L > 0)) return [{ frac: 1, zone: null }];
    const runs = [], step = L / Math.max(1, Math.ceil(L / 0.5)), push = (len, z) => { const r = runs[runs.length - 1]; if (r && r.zone === z) r.len += len; else runs.push({ len, zone: z }); };
    for (let i = 1; i < P.length; i++) { const [ax, ay] = P[i - 1], [bx, by] = P[i], l = Math.hypot(bx - ax, by - ay); for (let d = 0; d < l - 1e-9; d += step) { const q = Math.min(step, l - d), u = (d + q / 2) / l; push(q, cellOf(it, ax + (bx - ax) * u, ay + (by - ay) * u)); } }
    return runs.map(r => ({ frac: r.len / L, zone: r.zone }));
  }
  function shiftModel(D, opts = {}) {
    const hours = opts.hours ?? 8, cars = opts.liftCars ?? 1, elevatorOf = opts.elevatorOf || (f => f.E || null), times = opts.times || {}, cap = Math.max(0, Math.floor(opts.aisleCapacity || 0)), cellM = opts.cellMetres || 2;
    const locs = new Map(), lifts = new Set(), units = [], policies = [], stock = [], items = [], paths = [], { returnOf, isReturn } = returnRoutes(D);
    const tl = new Map(); for (const f of D.flows) { const E = elevatorOf(f); tl.set(f.id, { E, steps: original(D, f, E).items.slice(1) }); }
    const liftOf = (it, E) => it.s.lift ? liftId(it.s.elevator || (E && E.label)) : null;
    // shared cells -> traffic zones (connected groups of cells used by two or more different paths)
    const scale = it => { const P = it.path; let L = 0; if (Array.isArray(P)) for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L > 0 && it.metres > 0 ? it.metres / L : null; };
    let unitM = null; for (const { steps } of tl.values()) for (const it of steps) if (!unitM && !it.s.lift) unitM = scale(it);
    const cell = unitM ? cellM / unitM : 1, plateOf = it => (nodeAt(D, it.s.node) || {}).plate || "-", key = (it, x, y) => plateOf(it) + ":" + Math.floor(x / cell) + ":" + Math.floor(y / cell);
    const owner = f => isReturn.get(f.id) || f.id, zoneOfCell = new Map(), zones = [];
    if (cap > 0) {
      const users = new Map();
      for (const f of D.flows) for (const it of tl.get(f.id).steps) { const P = it.path; if (it.s.lift || !Array.isArray(P)) continue; for (let i = 1; i < P.length; i++) { const [ax, ay] = P[i - 1], [bx, by] = P[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cell / 4))); for (let q = 0; q <= n; q++) { const k = key(it, ax + (bx - ax) * q / n, ay + (by - ay) * q / n); if (!users.has(k)) users.set(k, new Set()); users.get(k).add(owner(f)); } } }
      const shared = [...users].filter(([, u]) => u.size > 1).map(([k]) => k).sort(), left = new Set(shared);
      for (const k0 of shared) {
        if (!left.has(k0)) continue; const id = "section:" + (zones.length + 1), cells = [], todo = [k0], who = new Set(); left.delete(k0);
        while (todo.length) { const k = todo.pop(); cells.push(k); zoneOfCell.set(k, id + "/" + cells.length); for (const u of users.get(k)) who.add(u); const [pl, cx, cy] = k.split(":"); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = pl + ":" + (+cx + dx) + ":" + (+cy + dy); if (left.has(n)) { left.delete(n); todo.push(n); } } }
        zones.push({ id, capacity: cap, plate: k0.split(":")[0], cells: cells.length, cellIds: cells.map((_, i) => id + "/" + (i + 1)), paths: [...who].sort() });
      }
    }
    const cellOf = (it, x, y) => zoneOfCell.get(key(it, x, y)) || null;
    // one step -> one or more engine legs (split where it crosses a traffic zone); reverse = the same line driven backwards
    const legsOf = (it, E, { to, dwell, label, k = 1, reverse = false, spread = 0 }) => {
      const travel = (it.tm - it.t0) * k, lift = liftOf(it, E), vary = lift ? {} : { travelSpread: spread, dwellSpread: spread };
      let runs = cap > 0 ? runsOf(it, cellOf) : [{ frac: 1, zone: null }]; if (reverse) runs = runs.slice().reverse();
      return runs.map((r, j) => ({ k: "leg", to: j === runs.length - 1 ? to : null, travelSeconds: travel * r.frac, dwellSeconds: j === runs.length - 1 ? dwell : 0, lift: j === 0 ? lift : null, zones: r.zone ? [r.zone] : [], label, ...vary }));
    };
    for (const f of D.flows) {
      if (isReturn.has(f.id)) continue;
      const { E, steps } = tl.get(f.id); if (!steps.length) continue;
      const first = stopId(steps[0].s.node), last = stopId(steps[steps.length - 1].s.node), m = times[f.id] || {}, sp = opts.spread || 0;
      for (const it of steps) { locs.set(stopId(it.s.node), true); const l = liftOf(it, E); if (l) lifts.add(l); }
      const geoOne = steps.reduce((n, it) => n + (it.t1 - it.t0), 0), kOne = m.trip_s > 0 ? m.trip_s / Math.max(1e-9, geoOne) : 1;
      const legs = steps.flatMap(it => legsOf(it, E, { to: stopId(it.s.node), dwell: (it.t1 - it.tm) * kOne, label: it.s.title || null, k: kOne, spread: sp }));
      // the empty return: drawn route, estimated reverse, or none
      let back = [], returnSource = "none", geoBack = 0;
      if (opts.returnTrip !== false && first !== last) {
        const R = returnOf.get(f.id);
        if (R) {
          const r = tl.get(R.id); r.steps.forEach(it => { locs.set(stopId(it.s.node), true); const l = liftOf(it, r.E); if (l) lifts.add(l); }); geoBack = r.steps.reduce((n, it) => n + (it.t1 - it.t0), 0);
          const kB = m.return_s > 0 ? m.return_s / Math.max(1e-9, geoBack) : 1;
          back = r.steps.flatMap((it, j, arr) => legsOf(it, r.E, { to: j === arr.length - 1 ? first : stopId(it.s.node), dwell: (it.t1 - it.tm) * kB, label: "empty return (drawn)", k: kB, spread: sp }));
          returnSource = m.return_s > 0 ? "measured" : "drawn";
        } else {
          geoBack = steps.reduce((n, it) => n + (it.tm - it.t0), 0); const kB = m.return_s > 0 ? m.return_s / Math.max(1e-9, geoBack) : 1;
          back = steps.slice().reverse().flatMap((it, j, arr) => legsOf(it, E, { to: j + 1 < arr.length ? stopId(arr[j + 1].s.node) : first, dwell: 0, label: "empty return (estimated)", k: kB, reverse: true, spread: sp }));
          returnSource = m.return_s > 0 ? "measured" : "estimated";
        }
      }
      const oneWay = geoOne * kOne, backTime = back.reduce((n, l) => n + l.travelSeconds + l.dwellSeconds, 0), n = Math.max(1, opts.trolleys ? opts.trolleys(f) : (f.trolleys || 1)), item = "lot:" + f.id;
      const loadS = m.load_s > 0 ? m.load_s : 0, unloadS = m.unload_s > 0 ? m.unload_s : 0;
      items.push({ id: item, unit: "lot" }); stock.push({ location: first, item, qty: 1000000 });
      for (let k = 0; k < n; k++) {
        const u = "trolley:" + f.id + ":" + (k + 1); units.push({ id: u, node: first });
        policies.push({ id: "loop:" + f.id + ":" + (k + 1), kind: "loop", item, from: first, to: last, carrier: u, startSeconds: (k * (oneWay + backTime + loadS + unloadS)) / n, actions: [{ k: "load", seconds: loadS }, ...legs, { k: "unload", seconds: unloadS }, ...back] });
      }
      paths.push({ id: f.id, name: f.name || f.id, trolleys: n, oneWay, cycleAlone: oneWay + backTime + loadS + unloadS, naive: Math.floor(hours * 3600 / Math.max(1, oneWay)) * n,
        lifts: [...new Set(steps.map(it => liftOf(it, E)).filter(Boolean))], timeSource: Object.keys(m).some(x => m[x] > 0) ? "measured" : "geometric", returnSource, returnPath: returnOf.get(f.id)?.id || null });
    }
    const model = { format: "fe-model", version: 1, name: "shift", tickPerSecond: 1000, seed: opts.seed ?? 1, items, locations: [...locs.keys()].map(id => ({ id, kind: "stop" })), zones: zones.flatMap(z => z.cellIds.map(id => ({ id, capacity: z.capacity }))),
      pools: [{ id: "trolleys", kind: "carrier", units }, ...[...lifts].map(id => ({ id, kind: "lift", units: Array.from({ length: cars }, (_, c) => ({ id: id + ":car" + (c + 1) })) }))], policies, initial: { stock } };
    return { model, paths, hours, zones, cellMetres: cellM };
  }
  function runShift(D, opts = {}) {
    const { model, paths, hours, zones } = shiftModel(D, opts), world = new FE.World(model, { keepLog: false, checkInvariants: !!opts.check });
    world.runUntil(Math.round(hours * 3600 * 1000)); const r = world.report(), byPolicy = new Map(r.policies.map(p => [p.id, p])), util = new Map(r.units.map(u => [u.id, u.utilisation])), zr = new Map(r.zones.map(z => [z.id, z]));
    const names = new Map(D.flows.map(f => [f.id, f.name || f.id]));
    const rows = paths.map(p => {
      const pol = [...byPolicy.values()].filter(x => x.id.startsWith("loop:" + p.id + ":")), done = pol.reduce((n, x) => n + x.done, 0), wait = pol.reduce((n, x) => n + x.lift_wait_s, 0), zw = pol.reduce((n, x) => n + (x.zone_wait_s || 0), 0);
      const cyc = pol.filter(x => x.done).map(x => x.mean_cycle_s);
      return { ...p, trips: done, meanCycle: cyc.length ? cyc.reduce((a, b) => a + b, 0) / cyc.length : null, liftWaitPerTrip: done ? wait / done : null, trafficWaitPerTrip: done ? zw / done : null };
    });
    const liftRows = model.pools.filter(p => p.kind === "lift").map(p => ({ id: p.id, cars: p.units.length, busy: p.units.reduce((n, u) => n + (util.get(u.id) || 0), 0) / p.units.length }));
    const zoneRows = zones.map(({ cellIds, ...z }) => { const xs = cellIds.map(id => zr.get(id) || {}); return { ...z, paths: z.paths.map(id => names.get(id) || id), metres: Math.round(z.cells * (opts.cellMetres || 2)),
      entries: Math.max(0, ...xs.map(x => x.entries || 0)), occupied: Math.max(0, ...xs.map(x => x.occupied || 0)), waits: xs.reduce((n, x) => n + (x.waits || 0), 0), wait_s: +xs.reduce((n, x) => n + (x.wait_s || 0), 0).toFixed(3) }; }).sort((a, b) => b.wait_s - a.wait_s || b.occupied - a.occupied);
    return { engine: FE.ENGINE_VERSION, hours, returnTrip: opts.returnTrip !== false, liftCars: opts.liftCars ?? 1, spread: opts.spread || 0, seed: model.seed, aisleCapacity: Math.max(0, Math.floor(opts.aisleCapacity || 0)),
      paths: rows, lifts: liftRows, zones: zoneRows, fingerprint: r.fingerprint, invariants: r.invariants, events: r.events };
  }

  /* Layout journal (V8.3): Studio edits become engine commands. The journal (FactoryEngine.Journal) holds the scene; every scene
     the Studio publishes is submitted as a doc.edit, checked (scene validator + every path must still play on the engine), and
     refused edits are rolled back. Undo/redo at engine level are journal commands. hooks: { validate(scene, "next" | "prev") -> problems[] }. */
  function makeJournal(scene, hooks = {}) {
    const keyOf = p => String(p).replace(/\d+(\.\d+)?/g, "#");
    const J = new FE.Journal(scene, { name: "scene", validate: (next, prev) => {
      const now = hooks.validate ? hooks.validate(next, "next") : [], before = new Set((hooks.validate ? hooks.validate(prev, "prev") : []).map(keyOf));
      return now.filter(p => !before.has(keyOf(p)));   // only problems the edit adds; a scene's old problems never block work
    } });
    let seq = 0; const id = k => k + ":" + Date.now().toString(36) + ":" + (++seq);
    return { J, edit: (doc, label) => J.submit({ command_id: id("edit"), expected_revision: J.revision, type: "doc.edit", payload: { doc, label } }),
      undo: () => J.submit({ command_id: id("undo"), expected_revision: J.revision, type: "doc.undo" }), redo: () => J.submit({ command_id: id("redo"), expected_revision: J.revision, type: "doc.redo" }),
      isUndoOf: doc => { const u = J.peekUndo(); return !!u && FE.canonical(u) === FE.canonical(doc); }, isRedoOf: doc => { const r = J.peekRedo(); return !!r && FE.canonical(r) === FE.canonical(doc); },
      same: doc => FE.canonical(doc) === FE.canonical(J.doc),
      // A viewer undo can differ from the exact journal undo when the viewer normalised other fields during the edit; it is
      // still an undo when every change it makes is part of the last edit's inverse (likewise redo).
      partOf: (doc, which) => { const e = which === "undo" ? J.undoStack[J.undoStack.length - 1] : J.redoStack[J.redoStack.length - 1]; if (!e) return false;
        const want = new Set((which === "undo" ? FE.invert(e.patch) : e.patch).map(o => FE.canonical([o.path, o.op === "remove" ? null : o.value]))), got = FE.diff(J.doc, doc);
        return got.length > 0 && got.every(o => want.has(FE.canonical([o.path, o.op === "remove" ? null : o.value]))); } };
  }
  const api = { TPS, version: FE.ENGINE_VERSION, original, timeline, runFlow, flowModel, stateAt, shiftModel, runShift, returnRoutes, makeJournal, infoFor: f => info.get(f) || null,
    install() { if (MC.timeline !== timeline) MC.timeline = timeline; return api; } };
  return api;
}
if (typeof module !== "undefined" && module.exports) module.exports = { makeBridge };
else { root.MFEngine = makeBridge(root.MFMotion, root.FactoryEngine).install(); }
})(typeof window !== "undefined" ? window : this);
