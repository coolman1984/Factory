// The simulation world: the single logical writer of operating state (decisions D02, D12).
// Model in (definition, seconds), commands and time in, events out. Views receive frozen read-only snapshots.
// Time is integer ticks; equal-time events run in the declared order (time, priority, sequence).
import { EngineError, secondsToTicks, ticksToSeconds, assertQty } from "./units.js";
import { RandomStreams } from "./rng.js";
import { EventQueue } from "./queue.js";
import { canonical, hash64, fingerprintOf, clone } from "./canon.js";
import { Ledger } from "./ledger.js";
import { RouteGraph } from "./routes.js";

export const ENGINE_VERSION = "0.3.0";
export const PRIORITY = Object.freeze({ repair: 10, finish: 20, mission: 30, mark: 35, fail: 40, release: 50 });
export const STATION_STATES = Object.freeze(["working", "starved", "blocked", "idle", "down"]);

const isId = v => typeof v === "string" && v.length > 0;

// Structural and reference check of an engine model. Returns a list of readable problems (empty = valid).
export function validateModel(m) {
  const p = [];
  if (!m || m.format !== "fe-model") return ["model.format must be \"fe-model\""];
  if (m.version !== 1) p.push("model.version must be 1");
  if (!(Number.isSafeInteger(m.tickPerSecond) && m.tickPerSecond > 0)) p.push("tickPerSecond must be a positive integer");
  const ids = new Set(), seen = (kind, id) => { if (!isId(id)) p.push(`${kind}: missing id`); else if (ids.has(kind + ":" + id)) p.push(`${kind} ${id}: duplicate id`); else ids.add(kind + ":" + id); };
  for (const it of m.items || []) { seen("item", it.id); if (it.serial != null && (typeof it.serial !== "string" || !/^[A-Za-z0-9_]+$/.test(it.serial))) p.push(`item ${it.id}: serial prefix must be letters, digits or _`); if (it.serial != null && it.unit !== "ea") p.push(`item ${it.id}: only ea items carry serial numbers`); }
  for (const z of m.zones || []) { seen("zone", z.id); if (!(Number.isSafeInteger(z.capacity) && z.capacity > 0)) p.push(`zone ${z.id}: capacity must be a positive integer`); }
  for (const l of m.locations || []) seen("location", l.id);
  const units = new Map();
  for (const pool of m.pools || []) {
    seen("pool", pool.id); if (!["carrier", "worker", "lift"].includes(pool.kind)) p.push(`pool ${pool.id}: kind must be carrier, worker or lift`);
    for (const u of pool.units || []) { seen("unit", u.id); units.set(u.id, pool.kind); }
  }
  const has = (kind, id) => ids.has(kind + ":" + id);
  const nodes = new Set((m.graph?.nodes || []).map(n => n.id));
  for (const e of m.graph?.edges || []) { if (!nodes.has(e.a) || !nodes.has(e.b)) p.push(`edge ${e.id}: unknown node`); if (e.zone != null && !ids.has("zone:" + e.zone)) p.push(`edge ${e.id}: unknown zone ${e.zone}`); }
  for (const h of m.handling || []) {
    seen("handling", h.id);
    for (const c of h.carriers || []) if (units.get(c) !== "carrier") p.push(`handling ${h.id}: ${c} is not a carrier unit`);
    for (const w of h.workers || []) if (units.get(w) !== "worker") p.push(`handling ${h.id}: ${w} is not a worker unit`);
    if (!(h.carriers || []).length) p.push(`handling ${h.id}: needs at least one carrier`);
  }
  for (const s of m.stations || []) {
    seen("station", s.id);
    for (const k of ["input", "output"]) if (!has("location", s[k])) p.push(`station ${s.id}: unknown ${k} location ${s[k]}`);
    for (const io of [...(s.inputs || []), ...(s.outputs || [])]) { if (!has("item", io.item)) p.push(`station ${s.id}: unknown item ${io.item}`); if (!(Number.isSafeInteger(io.qty) && io.qty > 0)) p.push(`station ${s.id}: ${io.item} quantity must be a positive integer`); }
    if (!(s.cycleSeconds > 0)) p.push(`station ${s.id}: cycleSeconds must be > 0`);
    if (s.test) {
      if (!(s.test.passRate >= 0 && s.test.passRate <= 1)) p.push(`station ${s.id}: test.passRate must be between 0 and 1`);
      if (!has("location", s.test.failTo)) p.push(`station ${s.id}: unknown test.failTo location ${s.test.failTo}`);
      if (!(s.inputs || []).some(i => i.item === s.test.failItem)) p.push(`station ${s.id}: test.failItem ${s.test.failItem} must be one of its inputs (the unit that failed goes to failTo)`);
    }
  }
  for (const pol of m.policies || []) {
    seen("policy", pol.id);
    if (!["pull", "push", "loop"].includes(pol.kind)) p.push(`policy ${pol.id}: kind must be pull, push or loop`);
    if (!has("item", pol.item)) p.push(`policy ${pol.id}: unknown item ${pol.item}`);
    for (const k of ["from", "to"]) if (!has("location", pol[k])) p.push(`policy ${pol.id}: unknown ${k} location ${pol[k]}`);
    if (pol.kind === "loop") {
      if (units.get(pol.carrier) !== "carrier") p.push(`policy ${pol.id}: loop needs a carrier unit (got ${pol.carrier})`);
      if (!Array.isArray(pol.actions) || !pol.actions.length) p.push(`policy ${pol.id}: loop needs explicit actions`);
    } else if (!has("handling", pol.handling)) p.push(`policy ${pol.id}: unknown handling ${pol.handling}`);
  }
  if (m.shipping) { if (!has("location", m.shipping.location)) p.push(`shipping: unknown location ${m.shipping.location}`); if (!has("item", m.shipping.item)) p.push(`shipping: unknown item ${m.shipping.item}`); }
  for (const s of m.initial?.stock || []) { if (!has("location", s.location)) p.push(`initial stock: unknown location ${s.location}`); if (!has("item", s.item)) p.push(`initial stock: unknown item ${s.item}`); if (!(Number.isSafeInteger(s.qty) && s.qty >= 0)) p.push(`initial stock ${s.item}: quantity must be a non-negative integer`); }
  return p;
}

export function createWorld(model, options) { return new World(model, options); }

export class World {
  constructor(model, { checkInvariants = false, keepLog = true, onEvent = null, snapshot = null } = {}) {
    const problems = validateModel(model);
    if (problems.length) throw new EngineError("invalid_model", "invalid model:\n  " + problems.join("\n  "), problems);
    this.model = clone(model); this.modelHash = fingerprintOf(this.model); this.tps = model.tickPerSecond;
    this.checkInvariants = checkInvariants; this.keepLog = keepLog; this.onEvent = onEvent;
    this.T = s => secondsToTicks(s, this.tps);
    this.ledger = new Ledger();
    for (const it of model.items) this.ledger.defineItem(it.id, it.unit, it.slotSize || 1, it.serial ?? null);
    // Traffic zones (WP3.2): an aisle section or crossing that admits `capacity` trolleys at once.
    this.zones = new Map((model.zones || []).map(z => [z.id, { id: z.id, capacity: z.capacity, users: [], since: 0, busyTicks: 0, occTicks: 0, entries: 0, waits: 0, waitTicks: 0 }]));
    this.waiters = []; this.genealogy = {}; this.testedSerials = {};
    for (const l of model.locations) this.ledger.defineLocation(l.id, l.kind || "storage", l.capacitySlots ?? null, l.node ?? null);
    this.graph = new RouteGraph(model.graph || null);
    this.pools = new Map(); this.units = new Map();
    for (const pool of model.pools || []) {
      this.pools.set(pool.id, { id: pool.id, kind: pool.kind, units: pool.units.map(u => u.id), queue: [] });
      for (const u of pool.units) {
        this.units.set(u.id, { id: u.id, pool: pool.id, kind: pool.kind, node: u.node ?? null, speed: u.speed || 1, mode: u.mode || null, mission: null, busySince: 0, busyTicks: 0 });
        if (pool.kind === "carrier") this.ledger.defineLocation("carrier:" + u.id, "carrier", null, null);
      }
    }
    this.handling = new Map((model.handling || []).map(h => [h.id, { ...h, loadTicks: this.T(h.loadSeconds || 0), unloadTicks: this.T(h.unloadSeconds || 0) }]));
    this.stations = new Map();
    for (const s of model.stations || []) {
      this.ledger.defineLocation("wip:" + s.id, "wip", null, null);
      const failQty = s.test ? s.inputs.filter(i => i.item === s.test.failItem).reduce((n, i) => n + i.qty, 0) : 0;
      this.stations.set(s.id, { def: { ...s, cycle: this.T(s.cycleSeconds), slots: s.slots || 1, mtbf: s.breakdown ? this.T(s.breakdown.mtbfSeconds) : 0, mttr: s.breakdown ? this.T(s.breakdown.mttrSeconds) : 0, failQty },
        state: "idle", since: 0, jobs: [], jobSeq: 0, down: { breakdown: false, manual: false }, cycles: 0, timeIn: Object.fromEntries(STATION_STATES.map(k => [k, 0])), tests: { passed: 0, failed: 0, firstTried: 0, firstPassed: 0 } });
    }
    this.policies = new Map((model.policies || []).map(p => [p.id, { def: { countInbound: true, maxOpen: 1, ...p, start: this.T(p.startSeconds || 0), qty: p.qty || 1 }, enabled: true, blockedAt: -1, created: 0, done: 0, leadTicks: 0, waitTicks: 0, zoneWaitTicks: 0 }]));
    this.missions = new Map(); this.open = []; this.missionSeq = 0; this.inboundQty = new Map(); this.policyLive = new Map();
    this.commands = new Map(); this.revision = 0;
    this.now = 0; this.eventSeq = 0; this.logHash = "0"; this.log = []; this.logStart = 0;
    this.stats = { missionsDone: 0, missionsFailed: 0, leadTicks: 0 };
    if (snapshot) { this.#restoreState(snapshot.state); return; }
    this.queue = new EventQueue(); this.rng = new RandomStreams(model.seed ?? 1);
    for (const s of model.initial?.stock || []) if (s.qty > 0) this.ledger.initial(s.location, s.item, s.qty);
    this.#emit("world.start", { engine: ENGINE_VERSION, model: this.modelHash, seed: model.seed ?? 1, tickPerSecond: this.tps });
    for (const S of this.stations.values()) if (S.def.mtbf > 0) this.#scheduleFailure(S);
    for (const P of this.policies.values()) if (P.def.start > 0) this.#schedule(P.def.start, PRIORITY.release, "policy.wake", { policy: P.def.id });
    this.#settle(); this.#assertInvariants();
  }

  /* ---------------- time ---------------- */
  get seconds() { return ticksToSeconds(this.now, this.tps); }
  // Process every event with time <= tick, then let the clock stand at `tick`.
  runUntil(tick) {
    if (!Number.isSafeInteger(tick) || tick < this.now) throw new EngineError("bad_time", `cannot run to tick ${tick} from ${this.now}`);
    let n = 0;
    while (this.queue.size && this.queue.peek().t <= tick) { this.#step(); if (++n > 5e7) throw new EngineError("runaway", "more than 5e7 events in one run"); }
    this.#advance(tick); return this;
  }
  runSeconds(seconds) { return this.runUntil(this.now + this.T(seconds)); }
  // Run until nothing is scheduled, or `maxTick`.
  runToEnd(maxTick = Number.MAX_SAFE_INTEGER) {
    while (this.queue.size && this.queue.peek().t <= maxTick) this.#step();
    return this;
  }
  #advance(tick) { for (const S of this.stations.values()) { S.timeIn[S.state] += tick - S.since; S.since = tick; } this.now = tick; }
  #step() {
    const e = this.queue.pop(); this.#advance(e.t);
    const h = this.#handlers[e.type]; if (!h) throw new EngineError("unknown_event", `no handler for ${e.type}`);
    h.call(this, e.data); this.#settle(); this.#assertInvariants();
  }
  #assertInvariants() {
    if (!this.checkInvariants) return; const p = this.ledger.check();
    for (const u of this.units.values()) if (u.mission && !this.missions.has(u.mission)) p.push(`unit ${u.id} bound to unknown mission`);
    for (const m of this.missions.values()) if (m.status === "active") { if (this.units.get(m.carrier).mission !== m.id) p.push(`mission ${m.id}: carrier not bound`); if (m.worker && this.units.get(m.worker).mission !== m.id) p.push(`mission ${m.id}: worker not bound`); }
    if (p.length) throw new EngineError("invariant", `invariant broken at tick ${this.now}:\n  ` + p.join("\n  "), p);
  }

  /* ---------------- events ---------------- */
  #emit(type, data = {}) {
    const ev = { seq: this.eventSeq++, t: this.now, type, ...data };
    // The chain hashes the event as emitted: its field order is fixed by this code, so it is as deterministic as sorted keys
    // and several times cheaper on long runs.
    this.logHash = hash64(this.logHash + JSON.stringify(ev));
    if (this.keepLog) this.log.push(ev);
    if (this.onEvent) this.onEvent(ev);
    return ev;
  }
  #schedule(t, priority, type, data) { this.queue.push(t, priority, type, data); }

  /* ---------------- commands (WP1.5) ---------------- */
  // { command_id, expected_revision?, type, payload } -> { ok, command_id, revision, result | code + reason }.
  // A repeated command_id returns the first result and changes nothing. A rejected command leaves no partial state.
  submit(cmd) {
    if (!cmd || !isId(cmd.command_id) || !isId(cmd.type)) return { ok: false, code: "bad_command", reason: "command needs command_id and type" };
    if (this.commands.has(cmd.command_id)) return { ...this.commands.get(cmd.command_id), duplicate: true };
    let result;
    if (cmd.expected_revision != null && cmd.expected_revision !== this.revision) result = { ok: false, command_id: cmd.command_id, code: "stale_revision", reason: `expected revision ${cmd.expected_revision}, world is at ${this.revision}` };
    else {
      const handler = this.#commandHandlers[cmd.type];
      if (!handler) result = { ok: false, command_id: cmd.command_id, code: "unknown_command", reason: `unknown command type ${cmd.type}` };
      else {
        const before = this.#captureState(), logLength = this.log.length;
        try {
          const out = handler.call(this, cmd.payload || {}, cmd.command_id); this.revision++;
          this.#emit("command.accepted", { command: cmd.command_id, kind: cmd.type, revision: this.revision });
          this.#settle(); this.#assertInvariants();
          result = { ok: true, command_id: cmd.command_id, revision: this.revision, result: out ?? null };
        } catch (e) {
          if (!(e instanceof EngineError)) throw e;
          this.#restoreState(before); this.log.length = logLength;
          result = { ok: false, command_id: cmd.command_id, code: e.code, reason: e.message };
        }
      }
    }
    if (!result.ok) this.#emit("command.rejected", { command: cmd.command_id, kind: cmd.type, code: result.code });
    this.commands.set(cmd.command_id, result); return { ...result };
  }
  #commandHandlers = {
    "transport.request"(p, cid) { return { mission: this.#createMission(p, { command: cid }).id }; },
    "transport.cancel"(p) {
      const m = this.missions.get(p.mission); if (!m) throw new EngineError("unknown_mission", `unknown mission ${p.mission}`);
      if (m.status !== "open" && m.status !== "scheduled") throw new EngineError("mission_in_progress", `mission ${m.id} is ${m.status}; only waiting missions can be cancelled (a loaded trolley keeps its load)`);
      this.#closeMission(m, "cancelled", "mission.cancelled", { reason: p.reason || "cancelled" }); return { mission: m.id };
    },
    "station.setDown"(p) { const S = this.#station(p.station); this.#setDown(S, "manual", !!p.down); return { station: S.def.id, down: !!p.down }; },
    "stock.receive"(p) {
      const it = this.ledger.item(p.item); assertQty(p.qty, "receive"); this.ledger.receive(p.location, p.item, p.qty);
      this.#emit("stock.received", { location: p.location, item: it.id, qty: p.qty }); return null;
    },
    "route.setOpen"(p) { this.graph.setOpen(p.edge, !!p.open); for (const P of this.policies.values()) P.blockedAt = -1; this.#emit("route.changed", { edge: p.edge, open: !!p.open, layout: this.graph.revision }); return { layout: this.graph.revision }; },
    "policy.setEnabled"(p) { const P = this.policies.get(p.policy); if (!P) throw new EngineError("unknown_policy", `unknown policy ${p.policy}`); P.enabled = !!p.enabled; return null; }
  };
  #station(id) { const S = this.stations.get(id); if (!S) throw new EngineError("unknown_station", `unknown station ${id}`); return S; }

  /* ---------------- missions (WP3.3 state machine) ---------------- */
  // spec: { item, qty, from, to, fromNode?, toNode?, handling? | carrier?, worker?, actions?, releaseSeconds?, priority?, label? }
  // Explicit `actions` ([{ k: "load"|"unload", seconds } | { k: "leg", to, travelSeconds, dwellSeconds, lift?, marks? }]) are
  // played as given (a viewer that owns its own geometry); otherwise legs come from the route graph at assignment.
  #createMission(spec, cause) {
    const L = this.ledger; L.item(spec.item); L.loc(spec.from); L.loc(spec.to); assertQty(spec.qty, "mission"); if (spec.qty === 0) throw new EngineError("bad_quantity", "mission quantity must be > 0");
    const H = spec.handling != null ? this.handling.get(spec.handling) : null;
    if (spec.handling != null && !H) throw new EngineError("unknown_handling", `unknown handling ${spec.handling}`);
    if (!H && !spec.carrier) throw new EngineError("no_handling", "mission needs a handling policy or a carrier");
    if (spec.carrier && this.units.get(spec.carrier)?.kind !== "carrier") throw new EngineError("unknown_carrier", `unknown carrier ${spec.carrier}`);
    if (spec.worker && this.units.get(spec.worker)?.kind !== "worker") throw new EngineError("unknown_worker", `unknown worker ${spec.worker}`);
    const id = spec.id || "M" + String(++this.missionSeq).padStart(5, "0");
    if (this.missions.has(id)) throw new EngineError("duplicate_mission", `mission ${id} exists`);
    const spread = this.rng.get("spread:" + (cause.policy || "commands"));
    const actions = spec.actions ? spec.actions.map((a, i) => this.#normaliseAction(a, i, spread)) : null;
    if (actions) { const kinds = actions.map(a => a.k); if (kinds.filter(k => k === "load").length !== 1 || kinds.filter(k => k === "unload").length !== 1 || kinds.indexOf("load") > kinds.indexOf("unload")) throw new EngineError("bad_actions", "explicit actions need exactly one load before exactly one unload"); }
    if (!actions && !this.graph.nodes.size) throw new EngineError("no_route", "no navigation graph and no explicit legs");
    L.reserveStock("m:" + id + ":stock", spec.from, spec.item, spec.qty);
    L.reserveSpace("m:" + id + ":space", spec.to, spec.item, spec.qty);
    const release = spec.releaseSeconds != null ? Math.max(this.now, this.T(spec.releaseSeconds)) : this.now;
    const m = { id, seq: this.missionSeq, priority: spec.priority || 0, item: spec.item, qty: spec.qty, from: spec.from, to: spec.to,
      fromNode: spec.fromNode ?? L.loc(spec.from).node, toNode: spec.toNode ?? L.loc(spec.to).node, handling: spec.handling ?? null,
      carrier: spec.carrier || null, worker: spec.worker || null, fixedUnits: !!spec.carrier, label: spec.label || null, policy: cause.policy || null,
      actions, ai: -1, status: release > this.now ? "scheduled" : "open", waiting: null, loaded: false, created: this.now, release, assigned: -1, done: -1, cur: null };
    this.missions.set(id, m); this.#count(m, +1);
    this.#emit("mission.created", { mission: id, item: m.item, qty: m.qty, from: m.from, to: m.to, release: m.release, ...(cause.policy ? { policy: cause.policy } : {}) });
    if (m.status === "scheduled") this.#schedule(release, PRIORITY.release, "mission.release", { mission: id }); else this.#enqueue(m);
    return m;
  }
  // Optional seeded variability: travelSpread / dwellSpread / spread = fraction f; the time is multiplied by 1 + f * t, where
  // t is symmetric triangular on (-1, 1) from the policy's own random stream (same seed, same times; no spread, no draw).
  #normaliseAction(a, i, rng) {
    const vary = (seconds, f) => { if (!(f > 0) || !(seconds > 0)) return seconds; if (f >= 1) throw new EngineError("bad_spread", `action ${i}: spread must be below 1`); return seconds * (1 + f * (rng.next() + rng.next() - 1)); };
    if (a.k === "load" || a.k === "unload") return { k: a.k, ticks: this.T(vary(a.seconds || 0, a.spread)) };
    if (a.k === "leg") {
      if (a.lift != null && this.pools.get(a.lift)?.kind !== "lift") throw new EngineError("unknown_lift", `action ${i}: unknown lift pool ${a.lift}`);
      const zones = [...new Set(a.zones || [])]; for (const z of zones) if (!this.zones.has(z)) throw new EngineError("unknown_zone", `action ${i}: unknown traffic zone ${z}`);
      const travel = this.T(vary(a.travelSeconds || 0, a.travelSpread));
      const marks = (a.marks || []).map(x => ({ at: this.T(x.atSeconds), type: x.type || "mark", ref: x.ref ?? null })).filter(x => x.at <= travel);
      return { k: "leg", to: a.to ?? null, travel, dwell: this.T(vary(a.dwellSeconds || 0, a.dwellSpread)), lift: a.lift ?? null, zones, marks, label: a.label ?? null, ref: a.ref ?? null, path: a.path || null };
    }
    throw new EngineError("bad_action", `action ${i}: unknown kind ${a.k}`);
  }
  #enqueue(m) { m.status = "open"; this.open.push(m.id); this.open.sort((a, b) => { const A = this.missions.get(a), B = this.missions.get(b); return B.priority - A.priority || A.seq - B.seq || (a < b ? -1 : 1); }); }
  #closeMission(m, status, event, extra = {}) {
    this.ledger.releaseStock("m:" + m.id + ":stock"); this.ledger.releaseSpace("m:" + m.id + ":space");
    this.open = this.open.filter(x => x !== m.id); this.#count(m, -1); m.status = status; m.done = this.now; m.cur = null; m.actions = null;
    for (const u of [m.carrier, m.worker]) if (u && this.units.get(u).mission === m.id) this.#releaseUnit(this.units.get(u));
    if (status === "failed") this.stats.missionsFailed++;
    this.#emit(event, { mission: m.id, ...extra });
  }
  #free(u) { return u && u.mission === null; }
  #bindUnit(u, m) { u.mission = m.id; u.busySince = this.now; }
  #releaseUnit(u) { u.busyTicks += this.now - u.busySince; u.mission = null; }
  #routeSeconds(from, to, mode, speed) { const r = this.graph.find(from, to, mode, speed); return r ? r.seconds : Infinity; }

  // Try to give each waiting mission its carrier (+ worker). All or nothing; equal choices break by unit id.
  #dispatch() {
    let changed = false;
    for (const id of this.open.slice()) {
      const m = this.missions.get(id), H = m.handling ? this.handling.get(m.handling) : null;
      let carrier = null, worker = null, reason = null;
      if (m.fixedUnits) { carrier = this.units.get(m.carrier); if (!this.#free(carrier)) { carrier = null; reason = "carrier_busy"; } }
      else {
        const cands = H.carriers.map(c => this.units.get(c)).filter(u => this.#free(u));
        if (!cands.length) reason = "no_free_carrier";
        else if (m.actions) carrier = cands[0];
        else {
          let best = Infinity;
          for (const u of cands) { const s = this.#routeSeconds(u.node, m.fromNode, u.mode, u.speed); if (s < best) { best = s; carrier = u; } }
          if (!carrier) { this.#failMission(m, "no_route", `no free carrier can reach ${m.fromNode}`); changed = true; continue; }
        }
      }
      const workerIds = m.worker ? [m.worker] : (!m.fixedUnits && H && H.workers ? H.workers : []);
      if (carrier && workerIds.length) {
        const cands = workerIds.map(w => this.units.get(w)).filter(u => this.#free(u));
        if (!cands.length) { reason = "no_free_worker"; carrier = null; }
        else if (m.actions) worker = cands[0];
        else { let best = Infinity; for (const u of cands) { const s = this.#routeSeconds(u.node, carrier.node, u.mode, u.speed); if (s < best) { best = s; worker = u; } } if (!worker) { reason = "no_reachable_worker"; carrier = null; } }
      }
      if (!carrier) { if (m.waiting !== reason) { m.waiting = reason; this.#emit("mission.waiting", { mission: m.id, reason }); } continue; }
      if (!m.actions) { const plan = this.#planLegs(m, carrier, worker, H); if (!plan) { changed = true; continue; } m.actions = plan; }
      this.open = this.open.filter(x => x !== m.id); m.status = "active"; m.waiting = null; m.assigned = this.now;
      m.carrier = carrier.id; m.worker = worker ? worker.id : null; this.#bindUnit(carrier, m); if (worker) this.#bindUnit(worker, m);
      this.#emit("mission.assigned", { mission: m.id, carrier: carrier.id, ...(worker ? { worker: worker.id } : {}) });
      this.#schedule(this.now, PRIORITY.mission, "mission.next", { mission: m.id }); changed = true;
    }
    return changed;
  }
  #planLegs(m, carrier, worker, H) {
    const speed = worker ? Math.min(carrier.speed, worker.speed) : carrier.speed, acts = [];
    // A route over edges that belong to traffic zones is split per edge, so each zone is held only while it is crossed.
    const leg = (from, to, mode, sp, who) => {
      const r = this.graph.find(from, to, mode, sp); if (!r) return null; const k = who === "worker" ? "walk" : "leg", E = r.edges.map(id => this.graph.edges.get(id));
      if (k === "walk" || !E.some(e => e.zone)) return [{ k, to, travel: this.T(r.seconds), dwell: 0, lift: null, zones: [], marks: [], label: null, ref: null, path: r.nodes, metres: r.metres }];
      return E.map((e, i) => ({ k, to: r.nodes[i + 1], travel: this.T(e.length / Math.min(e.speed, sp)), dwell: 0, lift: null, zones: e.zone ? [e.zone] : [], marks: [], label: null, ref: null, path: [r.nodes[i], r.nodes[i + 1]], metres: e.length }));
    };
    if (worker && worker.node !== carrier.node) { const w = leg(worker.node, carrier.node, worker.mode, worker.speed, "worker"); if (!w) return this.#failMission(m, "no_route", `worker ${worker.id} cannot reach carrier ${carrier.id}`); acts.push(...w); }
    if (carrier.node !== m.fromNode) { const e = leg(carrier.node, m.fromNode, carrier.mode, speed); if (!e) return this.#failMission(m, "no_route", `no route ${carrier.node} -> ${m.fromNode}`); acts.push(...e); }
    acts.push({ k: "load", ticks: H ? H.loadTicks : 0 });
    const l = leg(m.fromNode, m.toNode, carrier.mode, speed); if (!l) return this.#failMission(m, "no_route", `no route ${m.fromNode} -> ${m.toNode}`); acts.push(...l);
    acts.push({ k: "unload", ticks: H ? H.unloadTicks : 0 });
    return acts;
  }
  #failMission(m, code, reason) {
    if (m.policy) { const P = this.policies.get(m.policy); if (P) { P.blockedAt = this.graph.revision; this.#emit("policy.blocked", { policy: m.policy, code }); } }
    this.#closeMission(m, "failed", "mission.failed", { code, reason }); return null;
  }

  #handlers = {
    "mission.release"(d) { const m = this.missions.get(d.mission); if (m && m.status === "scheduled") this.#enqueue(m); },
    "policy.wake"() {},   // a loop's start time: the settle phase after every event does the work
    "mission.next"(d) { this.#nextAction(this.missions.get(d.mission)); },
    "mission.arrive"(d) { this.#arrive(this.missions.get(d.mission)); },
    "mission.actionEnd"(d) { this.#endAction(this.missions.get(d.mission)); },
    "mission.mark"(d) { this.#emit("mark", { mission: d.mission, type: d.type, ref: d.ref }); },
    "station.finish"(d) { this.#finishJob(this.stations.get(d.station), d.job, d.token); },
    "station.fail"(d) {
      const S = this.stations.get(d.station), r = this.rng.get("station:" + S.def.id); this.#setDown(S, "breakdown", true);
      this.#schedule(this.now + Math.max(1, Math.round(r.exp(S.def.mttr))), PRIORITY.repair, "station.repair", { station: S.def.id });
    },
    "station.repair"(d) { const S = this.stations.get(d.station); this.#setDown(S, "breakdown", false); this.#scheduleFailure(S); }
  };

  #nextAction(m) {
    m.ai++;
    if (m.ai >= m.actions.length) {
      const lead = this.now - m.created; this.stats.missionsDone++; this.stats.leadTicks += lead;
      if (m.policy && this.policies.has(m.policy)) { const P = this.policies.get(m.policy); P.done++; P.leadTicks += lead; P.waitTicks += m.waitTicks || 0; P.zoneWaitTicks += m.zoneWaitTicks || 0; }
      this.#count(m, -1); m.status = "done"; m.done = this.now; m.cur = null; m.actions = null;   // finished: the plan is no longer needed (its events are in the chain)
      for (const u of [m.carrier, m.worker]) if (u) this.#releaseUnit(this.units.get(u));
      this.#emit("mission.done", { mission: m.id, leadTicks: lead }); return;
    }
    const a = m.actions[m.ai];
    if (a.k === "load" || a.k === "unload") {
      m.cur = { k: a.k, t0: this.now, t1: this.now + a.ticks };
      this.#emit(a.k + ".start", { mission: m.id, action: m.ai });
      this.#schedule(this.now + a.ticks, PRIORITY.mission, "mission.actionEnd", { mission: m.id }); return;
    }
    if (a.k === "walk") { this.#beginLeg(m, a, null); return; }
    const g = this.#grab(a);
    if (g.blocked) {
      this.waiters.push(m.id); m.waitSince = this.now; m.waitKind = g.blocked; m.waitZone = g.zone || null; m.cur = { k: g.blocked + "-wait", t0: this.now, t1: null };
      if (g.blocked === "lift") this.#emit("lift.wait", { mission: m.id, lift: a.lift, action: m.ai }); else { this.zones.get(g.zone).waits++; this.#emit("zone.wait", { mission: m.id, zone: g.zone, action: m.ai }); }
      return;
    }
    this.#beginLeg(m, a, g.lift);
  }
  // A leg starts only with everything it needs at once (a free lift car, room in every traffic zone it crosses): all or
  // nothing. A waiting trolley therefore holds no lift and no zone, so waits can never form a cycle (deadlock-free by
  // construction); waiting legs are retried in arrival order whenever a lift or zone is released.
  #grab(a) {
    let lift = null;
    if (a.lift) { lift = this.pools.get(a.lift).units.map(x => this.units.get(x)).find(x => this.#free(x)) || null; if (!lift) return { blocked: "lift" }; }
    for (const z of a.zones || []) { const Z = this.zones.get(z); if (Z.users.length >= Z.capacity) return { blocked: "zone", zone: z }; }
    return { lift };
  }
  #wake() {
    for (const id of this.waiters.slice()) {
      const w = this.missions.get(id), a = w.actions[w.ai], g = this.#grab(a); if (g.blocked) continue;
      this.waiters = this.waiters.filter(x => x !== id); this.#beginLeg(w, a, g.lift);
    }
  }
  #zoneTick(Z) { const dt = this.now - Z.since; Z.busyTicks += Z.users.length * dt; if (Z.users.length) Z.occTicks += dt; Z.since = this.now; }
  #beginLeg(m, a, liftUnit) {
    if (m.waitSince != null) {
      const dt = this.now - m.waitSince; if (m.waitKind === "zone") { m.zoneWaitTicks = (m.zoneWaitTicks || 0) + dt; const Z = this.zones.get(m.waitZone); if (Z) Z.waitTicks += dt; } else m.waitTicks = (m.waitTicks || 0) + dt;
      m.waitSince = null; m.waitKind = null; m.waitZone = null;
    }
    if (liftUnit) { this.#bindUnit(liftUnit, m); m.liftUnit = liftUnit.id; this.#emit("lift.start", { mission: m.id, lift: liftUnit.id }); }
    const zones = a.zones || []; for (const z of zones) { const Z = this.zones.get(z); this.#zoneTick(Z); Z.users.push(m.id); Z.entries++; } m.zonesHeld = zones.slice();
    const mover = this.units.get(a.k === "walk" ? m.worker : m.carrier);
    m.cur = { k: a.k, t0: this.now, t1: this.now + a.travel, from: mover.node, to: a.to, path: a.path, action: m.ai };
    this.#emit(a.k === "walk" ? "walk.start" : "leg.start", { mission: m.id, action: m.ai, from: mover.node, to: a.to, arrive: this.now + a.travel, ...(a.ref != null ? { ref: a.ref } : {}), ...(zones.length ? { zones } : {}) });
    for (const mk of a.marks) this.#schedule(this.now + mk.at, PRIORITY.mark, "mission.mark", { mission: m.id, type: mk.type, ref: mk.ref });
    this.#schedule(this.now + a.travel, PRIORITY.mission, "mission.arrive", { mission: m.id });
  }
  #arrive(m) {
    const a = m.actions[m.ai];
    if (a.to != null) { if (a.k === "walk") this.units.get(m.worker).node = a.to; else { this.units.get(m.carrier).node = a.to; if (m.worker) this.units.get(m.worker).node = a.to; } }
    this.#emit(a.k === "walk" ? "walk.arrive" : "leg.arrive", { mission: m.id, action: m.ai, at: a.to });
    let released = false;
    if (m.liftUnit) { const u = this.units.get(m.liftUnit); this.#releaseUnit(u); m.liftUnit = null; this.#emit("lift.end", { mission: m.id, lift: u.id }); released = true; }
    for (const z of m.zonesHeld || []) { const Z = this.zones.get(z); this.#zoneTick(Z); Z.users = Z.users.filter(x => x !== m.id); released = true; }
    m.zonesHeld = [];
    if (released && this.waiters.length) this.#wake();
    if (a.dwell === 0) { this.#endAction(m); return; }   // no wait at this point: go on at once (one event less per leg)
    m.cur = { k: "dwell", t0: this.now, t1: this.now + a.dwell, at: a.to, action: m.ai };
    this.#schedule(this.now + a.dwell, PRIORITY.mission, "mission.actionEnd", { mission: m.id });
  }
  #endAction(m) {
    const a = m.actions[m.ai], L = this.ledger;
    if (a.k === "load") { const sn = L.transfer(m.from, "carrier:" + m.carrier, m.item, m.qty, { stockKey: "m:" + m.id + ":stock" }); m.loaded = true; this.#emit("load.end", { mission: m.id, item: m.item, qty: m.qty, from: m.from, ...(sn ? { serials: sn } : {}) }); }
    else if (a.k === "unload") { const sn = L.transfer("carrier:" + m.carrier, m.to, m.item, m.qty, { spaceKey: "m:" + m.id + ":space" }); m.loaded = false; this.#emit("unload.end", { mission: m.id, item: m.item, qty: m.qty, to: m.to, ...(sn ? { serials: sn } : {}) }); }
    else this.#emit(a.k === "walk" ? "walk.end" : "leg.end", { mission: m.id, action: m.ai });
    this.#nextAction(m);
  }

  /* ---------------- stations (WP1.6) ---------------- */
  #stationState(S) {
    if (S.down.breakdown || S.down.manual) return "down";
    if (S.jobs.length) return "working";
    const L = this.ledger, d = S.def;
    if (!d.inputs.every(i => L.available(d.input, i.item) >= i.qty)) return "starved";
    if (!this.#room(d)) return "blocked";
    return "idle";
  }
  // Room for every output, and for a test station also room at its fail location (a job never starts without both).
  #room(d) { const L = this.ledger; return d.outputs.every(o => L.freeQty(d.output, o.item) >= o.qty) && (!d.test || L.freeQty(d.test.failTo, d.test.failItem) >= d.failQty); }
  #tryStations() {
    let changed = false; const L = this.ledger;
    for (const S of this.stations.values()) {
      const d = S.def;
      while (!S.down.breakdown && !S.down.manual && S.jobs.length < d.slots && d.inputs.every(i => L.available(d.input, i.item) >= i.qty) && this.#room(d)) {
        const n = ++S.jobSeq, job = { n, token: 0, end: this.now + d.cycle, remaining: null, serials: {} };
        for (const i of d.inputs) { const sn = L.transfer(d.input, "wip:" + d.id, i.item, i.qty); if (sn) job.serials[i.item] = [...(job.serials[i.item] || []), ...sn]; }
        for (const o of d.outputs) L.reserveSpace(`st:${d.id}:${n}:${o.item}`, d.output, o.item, o.qty);
        if (d.test) L.reserveSpace(`st:${d.id}:${n}:fail`, d.test.failTo, d.test.failItem, d.failQty);
        S.jobs.push(job); this.#emit("station.start", { station: d.id, job: n, end: job.end });
        this.#schedule(job.end, PRIORITY.finish, "station.finish", { station: d.id, job: n, token: 0 }); changed = true;
      }
      const st = this.#stationState(S);
      if (st !== S.state) { S.state = st; this.#emit("station.state", { station: d.id, state: st }); }
    }
    return changed;
  }
  #finishJob(S, n, token) {
    const job = S.jobs.find(j => j.n === n); if (!job || job.token !== token || job.remaining !== null) return; // superseded by a breakdown
    const d = S.def, L = this.ledger, own = item => (job.serials || {})[item] || null;
    S.jobs = S.jobs.filter(j => j !== job); S.cycles++;
    if (d.test) {   // test station: a seeded draw per unit decides pass (outputs) or fail (the unit goes to failTo unchanged)
      const pass = this.rng.get("test:" + d.id).next() < d.test.passRate, units = own(d.test.failItem) || [];
      let first = true; for (const sn of units) { const h = this.testedSerials[sn] || (this.testedSerials[sn] = { tests: 0, fails: 0 }); if (h.tests) first = false; h.tests++; if (!pass) h.fails++; }
      if (!units.length || first) { S.tests.firstTried++; if (pass) S.tests.firstPassed++; }
      if (pass) S.tests.passed++; else S.tests.failed++;
      if (!pass) {
        for (const o of d.outputs) L.releaseSpace(`st:${d.id}:${n}:${o.item}`);
        for (const i of d.inputs) if (i.item !== d.test.failItem) L.consume("wip:" + d.id, i.item, i.qty, null, own(i.item));
        L.transfer("wip:" + d.id, d.test.failTo, d.test.failItem, d.failQty, { spaceKey: `st:${d.id}:${n}:fail`, pick: units.length ? units : null });
        this.#emit("test.fail", { station: d.id, job: n, to: d.test.failTo, ...(units.length ? { serials: units } : {}) });
        this.#emit("station.finish", { station: d.id, job: n, result: "fail" }); return;
      }
      L.releaseSpace(`st:${d.id}:${n}:fail`); this.#emit("test.pass", { station: d.id, job: n, ...(units.length ? { serials: units } : {}) });
    }
    // Serial numbers: a job that takes in exactly as many serial units as it puts out keeps them (the same TV, a new state:
    // assembled -> passed -> packed); otherwise outputs get new numbers and the consumed units are recorded as their contents.
    const sIn = []; for (const i of d.inputs) { const sn = L.consume("wip:" + d.id, i.item, i.qty, null, own(i.item)); if (sn) sIn.push(...sn); }
    const serialOut = d.outputs.filter(o => L.item(o.item).serial != null), nOut = serialOut.reduce((k, o) => k + o.qty, 0), through = nOut > 0 && sIn.length === nOut, sOut = [];
    let next = 0;
    for (const o of d.outputs) {
      const keep = through && L.item(o.item).serial != null ? sIn.slice(next, next += o.qty) : null;
      const sn = L.produce(d.output, o.item, o.qty, `st:${d.id}:${n}:${o.item}`, keep);
      if (sn) { sOut.push(...sn); if (!keep && sIn.length) for (const x of sn) this.genealogy[x] = sIn.slice(); }
    }
    this.#emit("station.finish", { station: d.id, job: n, ...(sIn.length ? { in: sIn } : {}), ...(sOut.length ? { out: sOut } : {}), ...(d.test ? { result: "pass" } : {}) });
  }
  #setDown(S, cause, down) {
    const was = S.down.breakdown || S.down.manual; S.down[cause] = down; const now = S.down.breakdown || S.down.manual;
    if (!was && now) { for (const j of S.jobs) { j.remaining = j.end - this.now; j.token++; } this.#emit("station.down", { station: S.def.id, cause }); }
    if (was && !now) { for (const j of S.jobs) { j.end = this.now + j.remaining; j.remaining = null; this.#schedule(j.end, PRIORITY.finish, "station.finish", { station: S.def.id, job: j.n, token: j.token }); } this.#emit("station.up", { station: S.def.id, cause }); }
  }
  #scheduleFailure(S) { const r = this.rng.get("station:" + S.def.id); this.#schedule(this.now + Math.max(1, Math.round(r.exp(S.def.mtbf))), PRIORITY.fail, "station.fail", { station: S.def.id }); }

  /* ---------------- policies (WP3.4: replenishment counting confirmed inbound) ---------------- */
  // Live missions per destination (confirmed inbound) and per policy; derived, so rebuilt after a restore.
  #count(m, sign) {
    const k = m.to + "|" + m.item; this.inboundQty.set(k, (this.inboundQty.get(k) || 0) + sign * m.qty);
    if (m.policy) this.policyLive.set(m.policy, (this.policyLive.get(m.policy) || 0) + sign);
  }
  #recount() { this.inboundQty = new Map(); this.policyLive = new Map(); for (const m of this.missions.values()) if (m.status === "open" || m.status === "scheduled" || m.status === "active") this.#count(m, +1); }
  inbound(loc, item) { return this.inboundQty.get(loc + "|" + item) || 0; }
  #policies() {
    let changed = false; const L = this.ledger;
    for (const P of this.policies.values()) {
      const d = P.def; if (!P.enabled || P.blockedAt === this.graph.revision) continue;
      if ((this.policyLive.get(d.id) || 0) >= d.maxOpen) continue;
      let qty = 0;
      if (d.kind === "loop") {   // repeated trip (milk run / shift run): next trip as soon as the carrier's last one is done
        if (this.now < d.start || (d.count != null && P.created >= d.count) || L.available(d.from, d.item) < d.qty || L.freeQty(d.to, d.item) < d.qty) continue;
        this.#createMission({ item: d.item, qty: d.qty, from: d.from, to: d.to, carrier: d.carrier, actions: d.actions, priority: d.priority || 0 }, { policy: d.id });
        P.created++; changed = true; continue;
      }
      if (d.kind === "pull") {
        const position = L.onHand(d.to, d.item) + (d.countInbound ? this.inbound(d.to, d.item) : 0);
        if (position >= d.reorderPoint) continue;
        qty = Math.min(d.target - position, L.available(d.from, d.item), L.freeQty(d.to, d.item));
      } else {
        const lot = d.lot || 1; if (L.available(d.from, d.item) < lot || L.freeQty(d.to, d.item) < lot) continue; qty = lot;
      }
      if (!(qty > 0)) continue;
      this.#createMission({ item: d.item, qty, from: d.from, to: d.to, fromNode: d.fromNode, toNode: d.toNode, handling: d.handling, priority: d.priority || 0 }, { policy: d.id });
      P.created++; changed = true;
    }
    return changed;
  }

  #settle() {
    for (let i = 0; i < 10000; i++) { const a = this.#policies(), b = this.#dispatch(), c = this.#tryStations(); if (!a && !b && !c) return; }
    throw new EngineError("settle_loop", "the world did not settle after 10000 rounds at one instant");
  }

  /* ---------------- snapshot / restore (WP1.7) ---------------- */
  #captureState() {
    const units = {}; for (const id of [...this.units.keys()].sort()) { const u = this.units.get(id); units[id] = { node: u.node, mission: u.mission, busySince: u.busySince, busyTicks: u.busyTicks }; }
    const zones = {}; for (const id of [...this.zones.keys()].sort()) { const { capacity, id: _, ...z } = this.zones.get(id); zones[id] = clone(z); }
    const stations = {}; for (const id of [...this.stations.keys()].sort()) { const S = this.stations.get(id); stations[id] = { state: S.state, since: S.since, jobs: S.jobs.map(j => clone(j)), jobSeq: S.jobSeq, down: { ...S.down }, cycles: S.cycles, timeIn: { ...S.timeIn }, tests: { ...S.tests } }; }
    const missions = {}; for (const id of [...this.missions.keys()].sort()) missions[id] = clone(this.missions.get(id));
    const policies = {}; for (const id of [...this.policies.keys()].sort()) { const P = this.policies.get(id); policies[id] = { enabled: P.enabled, blockedAt: P.blockedAt, created: P.created, done: P.done, leadTicks: P.leadTicks, waitTicks: P.waitTicks, zoneWaitTicks: P.zoneWaitTicks }; }
    const commands = {}; for (const id of [...this.commands.keys()].sort()) commands[id] = clone(this.commands.get(id));
    return { now: this.now, revision: this.revision, eventSeq: this.eventSeq, logHash: this.logHash, missionSeq: this.missionSeq, open: this.open.slice(),
      queue: this.queue.state(), rng: this.rng.state(), ledger: this.ledger.state(), graph: this.graph.state(), units, zones, waiters: this.waiters.slice(), stations, missions, policies, commands, stats: { ...this.stats },
      genealogy: clone(this.genealogy), tested: clone(this.testedSerials) };
  }
  #restoreState(s) {
    s = clone(s);
    this.now = s.now; this.revision = s.revision; this.eventSeq = s.eventSeq; this.logHash = s.logHash; this.missionSeq = s.missionSeq; this.open = s.open;
    this.queue = new EventQueue(s.queue); this.rng = new RandomStreams(this.model.seed ?? 1, s.rng); this.ledger.restore(s.ledger); this.graph.restore(s.graph);
    for (const [id, u] of Object.entries(s.units)) Object.assign(this.units.get(id), u);
    for (const [id, z] of Object.entries(s.zones || {})) Object.assign(this.zones.get(id), z);
    this.waiters = s.waiters || []; this.genealogy = s.genealogy || {}; this.testedSerials = s.tested || {};
    for (const [id, st] of Object.entries(s.stations)) Object.assign(this.stations.get(id), st);
    this.missions = new Map(Object.entries(s.missions));
    for (const [id, p] of Object.entries(s.policies)) Object.assign(this.policies.get(id), p);
    this.commands = new Map(Object.entries(s.commands)); this.stats = s.stats; this.#recount();
  }
  snapshot() { return { format: "fe-snapshot", version: 1, engine: ENGINE_VERSION, model: this.modelHash, state: this.#captureState() }; }
  static restore(model, snap, options = {}) {
    if (!snap || snap.format !== "fe-snapshot") throw new EngineError("bad_snapshot", "not a snapshot");
    if (snap.model !== fingerprintOf(model)) throw new EngineError("snapshot_model_mismatch", "snapshot was taken from a different model");
    const w = new World(model, { ...options, snapshot: snap }); w.logStart = snap.state.eventSeq; return w;
  }
  // Fingerprint of the whole operating state, including the hash chain of every event so far.
  fingerprint() { return fingerprintOf({ model: this.modelHash, state: this.#captureState() }); }

  /* ---------------- read side ---------------- */
  // Frozen, plain view for renderers and panels (WP2.2). Times in seconds; carrier motion as [t0, t1] windows.
  view() {
    const s = t => t == null ? null : t / this.tps, L = this.ledger;
    const stock = {}; for (const [id, loc] of L.locations) if (loc.stock.size) stock[id] = Object.fromEntries([...loc.stock].sort());
    const v = {
      engine: ENGINE_VERSION, time: s(this.now), tick: this.now, revision: this.revision, layout: this.graph.revision,
      units: [...this.units.values()].map(u => { const m = u.mission ? this.missions.get(u.mission) : null; return { id: u.id, kind: u.kind, node: u.node, mission: u.mission,
        motion: m && m.cur ? { k: m.cur.k, t0: s(m.cur.t0), t1: s(m.cur.t1), from: m.cur.from ?? null, to: m.cur.to ?? m.cur.at ?? null, path: m.cur.path ?? null, action: m.ai } : null,
        load: u.kind === "carrier" ? (stock["carrier:" + u.id] || {}) : undefined }; }),
      stations: [...this.stations.values()].map(S => ({ id: S.def.id, state: S.state, cycles: S.cycles, jobs: S.jobs.map(j => ({ job: j.n, end: j.remaining === null ? s(j.end) : null })) })),
      missions: [...this.missions.values()].filter(m => m.status !== "done").map(m => ({ id: m.id, status: m.status, item: m.item, qty: m.qty, from: m.from, to: m.to, carrier: m.carrier, waiting: m.waiting, action: m.ai, loaded: m.loaded })),
      stock
    };
    return deepFreeze(v);
  }
  report() {
    const s = t => +(t / this.tps).toFixed(3), el = Math.max(1, this.now);
    return {
      engine: ENGINE_VERSION, model: this.modelHash, seed: this.model.seed ?? 1, time_s: s(this.now), events: this.eventSeq, fingerprint: this.fingerprint(),
      stations: [...this.stations.values()].map(S => ({ id: S.def.id, cycles: S.cycles, state: S.state, utilisation: +(S.timeIn.working / el).toFixed(4), seconds: Object.fromEntries(STATION_STATES.map(k => [k, s(S.timeIn[k])])) })),
      missions: { done: this.stats.missionsDone, failed: this.stats.missionsFailed, waiting: this.open.length, active: [...this.missions.values()].filter(m => m.status === "active").length, mean_lead_s: this.stats.missionsDone ? s(this.stats.leadTicks / this.stats.missionsDone) : null },
      units: [...this.units.values()].map(u => ({ id: u.id, kind: u.kind, utilisation: +((u.busyTicks + (u.mission ? this.now - u.busySince : 0)) / el).toFixed(4) })),
      policies: [...this.policies.values()].map(P => ({ id: P.def.id, kind: P.def.kind, created: P.created, done: P.done, mean_cycle_s: P.done ? s(P.leadTicks / P.done) : null, lift_wait_s: s(P.waitTicks), zone_wait_s: s(P.zoneWaitTicks) })),
      zones: [...this.zones.values()].map(Z => { const busy = Z.busyTicks + Z.users.length * (this.now - Z.since), occ = Z.occTicks + (Z.users.length ? this.now - Z.since : 0); return { id: Z.id, capacity: Z.capacity, entries: Z.entries, occupied: +(occ / el).toFixed(4), utilisation: +(busy / (Z.capacity * el)).toFixed(4), waits: Z.waits, wait_s: s(Z.waitTicks) }; }),
      quality: [...this.stations.values()].filter(S => S.def.test).map(S => { const t = S.tests, n = t.passed + t.failed; return { station: S.def.id, tested: n, passed: t.passed, failed: t.failed, yield: n ? +(t.passed / n).toFixed(4) : null, first_pass_yield: t.firstTried ? +(t.firstPassed / t.firstTried).toFixed(4) : null, retests: n - t.firstTried }; }),
      ...(this.ledger.hasSerials ? { serials: { issued: Object.fromEntries(this.ledger.serialSeq), with_contents: Object.keys(this.genealogy).length } } : {}),
      ...(this.model.shipping ? { shipping: this.shipping() } : {}),
      balance: this.ledger.state().counters, stock: this.view().stock, invariants: this.ledger.check()
    };
  }
  // Shipping (Phase 4): units in the container location against the packing plan, and the packing list (serial numbers).
  shipping() {
    const sh = this.model.shipping, L = this.ledger, loaded = L.onHand(sh.location, sh.item), per = sh.perContainer || null;
    return { location: sh.location, item: sh.item, loaded, per_container: per, containers_full: per ? Math.floor(loaded / per) : null, in_open_container: per ? loaded % per : null,
      plan: sh.plan || null, packing_list: L.items.get(sh.item).serial != null ? L.serialsAt(sh.location, sh.item) : null };
  }
  // Where a serial number is now, what it contains, what contains it, and every event that names it.
  trace(sn) {
    let at = null; for (const [id, loc] of this.ledger.locations) for (const [item, list] of loc.serials) if (list.includes(sn)) at = { location: id, item };
    const usedIn = Object.keys(this.genealogy).filter(k => this.genealogy[k].includes(sn)).sort(), names = e => [e.serials, e.in, e.out].some(a => Array.isArray(a) && a.includes(sn));
    return { serial: sn, at, contents: this.genealogy[sn] || [], usedIn, tests: this.testedSerials[sn]?.tests || 0, fails: this.testedSerials[sn]?.fails || 0, events: this.log.filter(names) };
  }
  eventsOf(type) { return this.log.filter(e => e.type === type); }
}

function deepFreeze(o) { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }
