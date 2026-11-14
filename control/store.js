// Factory Control Center store: master data, every change, every run and its events in one local SQLite file (node:sqlite,
// built into Node; nothing to install). All writes are commands: { command_id?, actor, expected_revision?, type, payload, force? }.
// A command runs in one transaction; if it adds a validation problem it is refused and rolled back (unless force); accepted
// commands are recorded with the before/after of every record they touched, so undo/redo are exact and the history is complete.
import { TYPES, TYPE, getPath, setPath, idOf, checkRecord, refsTo, renameRefs, toEngineScenario, fromEngineScenario, blank } from "./schema.js";
import { validateBlueprint, blueprintToModel } from "../engine/src/blueprint.js";
import { World, ENGINE_VERSION } from "../engine/src/world.js";
import { hash64, canonical } from "../engine/src/canon.js";

const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const now = () => new Date().toISOString();

export class Store {
  static async open(file = ":memory:") {
    const emit = process.emitWarning; process.emitWarning = (w, ...a) => { if (!/SQLite/i.test(String(w && w.message || w))) emit.call(process, w, ...a); };   // node:sqlite prints an experimental notice
    let DatabaseSync; try { ({ DatabaseSync } = await import("node:sqlite")); } finally { process.emitWarning = emit; }
    const s = new Store(new DatabaseSync(file), file); s.init(); return s;
  }
  constructor(db, file) { this.db = db; this.file = file; this.cache = null; }
  init() {
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS records (type TEXT NOT NULL, id TEXT NOT NULL, pos INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT, updated_at TEXT, updated_by TEXT, PRIMARY KEY (type, id));
      CREATE TABLE IF NOT EXISTS changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, actor TEXT, command_id TEXT, kind TEXT, label TEXT, revision INTEGER, ops TEXT, undone INTEGER DEFAULT 0, ref INTEGER);
      CREATE TABLE IF NOT EXISTS commands (command_id TEXT PRIMARY KEY, at TEXT, actor TEXT, type TEXT, result TEXT);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, at TEXT, actor TEXT, scenario TEXT, seed INTEGER, hours REAL, revision INTEGER, engine TEXT, model_hash TEXT, blueprint_hash TEXT, fingerprint TEXT, ms REAL, events INTEGER, kpis TEXT, report TEXT, note TEXT);
      CREATE TABLE IF NOT EXISTS run_events (run_id TEXT, seq INTEGER, t REAL, type TEXT, mission TEXT, station TEXT, data TEXT, PRIMARY KEY (run_id, seq));
      CREATE TABLE IF NOT EXISTS run_serials (run_id TEXT, serial TEXT, item TEXT, location TEXT, tests INTEGER, fails INTEGER, contents TEXT, PRIMARY KEY (run_id, serial));
      CREATE INDEX IF NOT EXISTS ev_type ON run_events (run_id, type);
      CREATE INDEX IF NOT EXISTS ch_kind ON changes (kind, seq);`);
    if (this.meta("revision") == null) this.setMeta("revision", "0");
  }
  meta(k) { const r = this.db.prepare("SELECT value FROM meta WHERE key=?").get(k); return r ? r.value : null; }
  setMeta(k, v) { this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, String(v)); }
  get revision() { return +this.meta("revision"); }

  /* ---------------- read ---------------- */
  all(type) { return this.db.prepare("SELECT id, pos, data, updated_at, updated_by FROM records WHERE type=? ORDER BY pos, id").all(type).map(r => ({ id: r.id, pos: r.pos, data: JSON.parse(r.data), updated_at: r.updated_at, updated_by: r.updated_by })); }
  get(type, id) { const r = this.db.prepare("SELECT id, pos, data, updated_at, updated_by FROM records WHERE type=? AND id=?").get(type, id); return r ? { id: r.id, pos: r.pos, data: JSON.parse(r.data), updated_at: r.updated_at, updated_by: r.updated_by } : null; }
  records() { const out = {}; for (const T of TYPES) out[T.type] = this.all(T.type); return out; }
  counts() { const out = Object.fromEntries(TYPES.map(T => [T.type, 0])); for (const r of this.db.prepare("SELECT type, COUNT(*) n FROM records GROUP BY type").all()) out[r.type] = r.n; return out; }
  exists(type, id) { return !!this.db.prepare("SELECT 1 FROM records WHERE type=? AND id=?").get(type, id); }

  // The blueprint assembled from the master data (same format as examples/factory-blueprint.example.json).
  blueprint(recs = this.records()) {
    const f = recs.factory[0]?.data || {}, meta = f._meta || {}, factory = clone(f); delete factory._meta;
    const list = t => recs[t].map(r => clone(r.data));
    return { $schema: meta.$schema || "../schemas/factory-blueprint.schema.json", schema_version: meta.schema_version || "0.1.0", sample_only: meta.sample_only !== false, notes: meta.notes || [],
      factory, items: list("item"), prefabs: list("prefab"), entities: list("entity"), ports: list("port"), processes: list("process"), material_flows: list("flow"),
      navigation: { nodes: list("node"), edges: list("edge") }, handling_policies: list("handling"), replenishment_policies: list("replenishment"),
      initial_conditions: { random_seed: meta.random_seed ?? 1, handling_units: list("stock"), active_missions: meta.active_missions || [] },
      ...(recs.shipping[0] ? { shipping: clone(recs.shipping[0].data) } : {}) };
  }
  // Every problem of the master data: field checks per record, blueprint checks, and each scenario converted to an engine model.
  problems(recs = this.records()) {
    if (this.cache && this.cache.rev === this.revision && !this.inTx) return this.cache.list;
    const P = [], ids = Object.fromEntries(TYPES.map(T => [T.type, new Set(recs[T.type].map(r => r.id))])), exists = (t, id) => !!ids[t] && ids[t].has(id);
    for (const T of TYPES) for (const r of recs[T.type]) for (const m of checkRecord(T.type, r.data, exists)) P.push({ where: `${T.type}:${r.id}`, type: T.type, id: r.id, message: m });
    if (!recs.factory.length) P.push({ where: "factory", message: "the factory record is missing" });
    const bp = this.blueprint(recs), bpp = validateBlueprint(bp);
    for (const p of bpp) P.push({ where: "blueprint", code: p.code, message: p.message });
    if (!bpp.length) for (const s of recs.scenario) {
      try { new World(blueprintToModel(bp, toEngineScenario(s.data))); } catch (e) { P.push({ where: `scenario:${s.id}`, type: "scenario", id: s.id, message: String(e.message).split("\n").slice(0, 4).join(" ") }); }
    }
    if (!this.inTx) this.cache = { rev: this.revision, list: P };
    return P;
  }

  /* ---------------- write: commands ---------------- */
  command(cmd) {
    cmd = { ...cmd }; cmd.command_id ||= `${cmd.actor || "anon"}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const seen = this.db.prepare("SELECT result FROM commands WHERE command_id=?").get(cmd.command_id);
    if (seen) return { ...JSON.parse(seen.result), duplicate: true };
    let result;
    if (cmd.expected_revision != null && cmd.expected_revision !== this.revision) result = { ok: false, code: "stale_revision", reason: `expected revision ${cmd.expected_revision}, data is at ${this.revision}`, revision: this.revision };
    else {
      const key = p => p.where + "|" + p.message, before = new Set(this.problems().map(key));
      this.db.exec("BEGIN"); this.inTx = true;
      try {
        const out = this.#apply(cmd), ops = out.ops;
        if (!ops.length) { this.db.exec("ROLLBACK"); this.inTx = false; result = { ok: true, changed: false, revision: this.revision }; }
        else {
          const added = this.problems().filter(p => !before.has(key(p)));
          if (added.length && !cmd.force && !out.always) { this.db.exec("ROLLBACK"); this.inTx = false; result = { ok: false, code: "refused", reason: `refused: the change adds ${added.length} problem(s): ${added.slice(0, 3).map(p => p.message).join("; ")}`, problems: added, revision: this.revision }; }
          else {
            const rev = this.revision + 1; this.setMeta("revision", rev);
            const ch = this.db.prepare("INSERT INTO changes (at, actor, command_id, kind, label, revision, ops, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(now(), cmd.actor || "anon", cmd.command_id, out.kind || "edit", out.label || cmd.type, rev, JSON.stringify(ops), out.ref ?? null);
            if (out.after) out.after(Number(ch.lastInsertRowid));
            this.db.exec("COMMIT"); this.inTx = false; this.cache = null;
            result = { ok: true, changed: true, revision: rev, change: Number(ch.lastInsertRowid), ops: ops.length, label: out.label || cmd.type, warnings: added.map(p => p.message), ...(out.result || {}) };
          }
        }
      } catch (e) { try { this.db.exec("ROLLBACK"); } catch { } this.inTx = false; this.cache = null; result = { ok: false, code: e.code || "error", reason: e.message, revision: this.revision }; }
    }
    this.db.prepare("INSERT OR REPLACE INTO commands (command_id, at, actor, type, result) VALUES (?, ?, ?, ?, ?)").run(cmd.command_id, now(), cmd.actor || "anon", cmd.type, JSON.stringify(result));
    return { ...result, command_id: cmd.command_id };
  }
  #fail(code, msg) { const e = new Error(msg); e.code = code; throw e; }
  #put(type, id, data, actor, pos) {
    const old = this.get(type, id), t = now();
    if (old) this.db.prepare("UPDATE records SET data=?, updated_at=?, updated_by=?, pos=? WHERE type=? AND id=?").run(JSON.stringify(data), t, actor, pos ?? old.pos, type, id);
    else this.db.prepare("INSERT INTO records (type, id, pos, data, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)").run(type, id, pos ?? this.#nextPos(type), JSON.stringify(data), t, t, actor);
  }
  #del(type, id) { this.db.prepare("DELETE FROM records WHERE type=? AND id=?").run(type, id); }
  #nextPos(type) { return (this.db.prepare("SELECT MAX(pos) m FROM records WHERE type=?").get(type).m ?? -1) + 1; }
  #type(t) { if (!TYPE[t]) this.#fail("unknown_type", `unknown type ${t}`); return TYPE[t]; }
  // Apply one command inside the open transaction; returns { ops: [{ type, id, before, after, pos }], label, kind? }.
  #apply(cmd) {
    const p = cmd.payload || {}, actor = cmd.actor || "anon", ops = [];
    const write = (type, id, data, pos) => { const old = this.get(type, id); if (old && canonical(old.data) === canonical(data) && (pos == null || pos === old.pos)) return; ops.push({ type, id, before: old ? old.data : null, after: clone(data), pos: pos ?? old?.pos ?? this.#nextPos(type) }); this.#put(type, id, data, actor, pos); };
    const remove = (type, id) => { const old = this.get(type, id); if (!old) return; ops.push({ type, id, before: old.data, after: null, pos: old.pos }); this.#del(type, id); };
    const rename = (type, from, to) => {
      const T = this.#type(type), rec = this.get(type, from); if (!rec) this.#fail("not_found", `${type} ${from} does not exist`);
      if (T.single) this.#fail("single", `${T.label} has a fixed id`); if (this.exists(type, to)) this.#fail("duplicate_id", `${type} ${to} already exists`);
      const data = clone(rec.data); setPath(data, T.key, to); remove(type, from); write(type, to, data, rec.pos);
      for (const U of TYPES) for (const r of this.all(U.type)) { const d = clone(r.data); if (renameRefs(U.type, d, type, from, to)) write(U.type, r.id, d); }
    };
    const one = c => {
      const q = c.payload || {};
      switch (c.type) {
        case "record.create": {
          const T = this.#type(q.type), data = q.data ? clone(q.data) : blank(q.type, q.id); if (q.id != null && !T.single) setPath(data, T.key, q.id);
          const id = idOf(q.type, data); if (id == null || id === "") this.#fail("missing_id", `${T.label}: ${T.key} is required`);
          if (this.exists(q.type, id)) this.#fail("duplicate_id", `${q.type} ${id} already exists`); if (T.single && this.all(q.type).length) this.#fail("single", `there is already a ${T.label} record`);
          write(q.type, id, data); return `create ${q.type} ${id}`;
        }
        case "record.update": {
          const T = this.#type(q.type), rec = this.get(q.type, q.id); if (!rec) this.#fail("not_found", `${q.type} ${q.id} does not exist`);
          const data = clone(rec.data); let newId = null;
          for (const [path, v] of Object.entries(q.set || {})) { if (path === T.key && !T.single && v !== q.id) newId = v; else setPath(data, path, v === null && !(T.fields.find(f => f.key === path)?.nullable) && path !== T.key ? undefined : clone(v)); }
          write(q.type, q.id, data); if (newId != null) rename(q.type, q.id, newId);
          return `set ${q.type} ${q.id} ${Object.keys(q.set || {}).join(", ")}`;
        }
        case "record.replace": { const T = this.#type(q.type), rec = this.get(q.type, q.id); if (!rec) this.#fail("not_found", `${q.type} ${q.id} does not exist`); const d = clone(q.data); const nid = idOf(q.type, d); if (!T.single && nid !== q.id) { setPath(d, T.key, q.id); write(q.type, q.id, d); rename(q.type, q.id, nid); } else write(q.type, q.id, d); return `replace ${q.type} ${q.id}`; }
        case "record.delete": { this.#type(q.type); if (!this.exists(q.type, q.id)) this.#fail("not_found", `${q.type} ${q.id} does not exist`); remove(q.type, q.id); return `delete ${q.type} ${q.id}`; }
        case "record.rename": rename(q.type, q.id, q.to); return `rename ${q.type} ${q.id} -> ${q.to}`;
        case "record.duplicate": { const T = this.#type(q.type), rec = this.get(q.type, q.id); if (!rec) this.#fail("not_found", `${q.type} ${q.id} does not exist`); if (T.single) this.#fail("single", `${T.label} cannot be duplicated`); if (this.exists(q.type, q.to)) this.#fail("duplicate_id", `${q.type} ${q.to} already exists`); const d = clone(rec.data); setPath(d, T.key, q.to); write(q.type, q.to, d); return `duplicate ${q.type} ${q.id} -> ${q.to}`; }
        case "record.move": { this.#type(q.type); const list = this.all(q.type), i = list.findIndex(r => r.id === q.id); if (i < 0) this.#fail("not_found", `${q.type} ${q.id} does not exist`); const [r] = list.splice(i, 1); list.splice(Math.max(0, Math.min(list.length, q.to)), 0, r); list.forEach((x, k) => write(q.type, x.id, x.data, k)); return `move ${q.type} ${q.id} to ${q.to}`; }
        case "batch": { const labels = (q.commands || []).map(one); return q.label || `batch of ${labels.length}`; }
        case "import": {
          if (q.mode !== "merge") for (const T of TYPES) if (T.type !== "scenario" || q.scenarios) for (const r of this.all(T.type)) remove(T.type, r.id);
          const recs = splitBlueprint(q.blueprint || {});
          for (const [type, list] of Object.entries(recs)) list.forEach(d => write(type, idOf(type, d), d));
          for (const [id, sc] of Object.entries(q.scenarios || {})) write("scenario", id, sc.breakdowns && !Array.isArray(sc.breakdowns) ? fromEngineScenario(id, sc) : { ...sc, id });
          for (const [type, list] of Object.entries(q.extras || {})) { this.#type(type); for (const d of list) write(type, idOf(type, d), d); }
          return q.label || "import blueprint";
        }
        default: this.#fail("unknown_command", `unknown command ${c.type}`);
      }
    };
    if (cmd.type === "undo" || cmd.type === "redo") return this.#undoRedo(cmd.type, write, remove, ops);
    const label = one(cmd); return { ops, label: (cmd.payload && cmd.payload.label) || label };
  }
  // Undo: the newest edit/redo not yet undone is reversed. Redo: the newest undo with no edit after it is re-applied.
  #undoRedo(kind, write, remove, ops) {
    const restore = (o, side) => { const d = o[side]; if (d == null) remove(o.type, o.id); else write(o.type, o.id, d, o.pos); };
    if (kind === "undo") {
      const t = this.db.prepare("SELECT * FROM changes WHERE kind IN ('edit','redo') AND undone=0 ORDER BY seq DESC LIMIT 1").get(); if (!t) this.#fail("nothing_to_undo", "nothing to undo");
      for (const o of JSON.parse(t.ops).reverse()) restore(o, "before");
      return { ops, label: "undo: " + t.label, kind: "undo", ref: t.seq, always: true, after: () => this.db.prepare("UPDATE changes SET undone=1 WHERE seq=?").run(t.seq) };
    }
    const u = this.db.prepare("SELECT * FROM changes WHERE kind='undo' AND undone=0 ORDER BY seq DESC LIMIT 1").get();
    const later = u && this.db.prepare("SELECT 1 FROM changes WHERE kind='edit' AND seq>? LIMIT 1").get(u.seq);
    if (!u || later) this.#fail("nothing_to_redo", "nothing to redo");
    const t = this.db.prepare("SELECT * FROM changes WHERE seq=?").get(u.ref);
    for (const o of JSON.parse(t.ops)) restore(o, "after");
    return { ops, label: "redo: " + t.label, kind: "redo", ref: u.seq, always: true, after: () => this.db.prepare("UPDATE changes SET undone=1 WHERE seq=?").run(u.seq) };
  }
  canUndo() { return !!this.db.prepare("SELECT 1 FROM changes WHERE kind IN ('edit','redo') AND undone=0 LIMIT 1").get(); }
  canRedo() { const u = this.db.prepare("SELECT seq FROM changes WHERE kind='undo' AND undone=0 ORDER BY seq DESC LIMIT 1").get(); return !!u && !this.db.prepare("SELECT 1 FROM changes WHERE kind='edit' AND seq>? LIMIT 1").get(u.seq); }
  changes({ limit = 100, before = null } = {}) {
    return this.db.prepare(`SELECT seq, at, actor, command_id, kind, label, revision, ops, undone, ref FROM changes ${before ? "WHERE seq<?" : ""} ORDER BY seq DESC LIMIT ?`).all(...(before ? [before, limit] : [limit])).map(r => ({ ...r, ops: JSON.parse(r.ops) }));
  }

  /* ---------------- runs ---------------- */
  run({ scenario, hours, seed, actor = "anon", note = "", events = true } = {}) {
    const recs = this.records(), sid = scenario || recs.scenario[0]?.id; const srec = recs.scenario.find(s => s.id === sid);
    if (!srec) { const e = new Error(`unknown scenario ${sid}`); e.code = "unknown_scenario"; throw e; }
    const bp = this.blueprint(recs), sc = toEngineScenario(srec.data); if (seed != null && seed !== "") sc.seed = +seed;
    const model = blueprintToModel(bp, sc), H = hours != null && hours !== "" ? +hours : (srec.data.horizon_h || 8);
    const t0 = performance.now(), world = new World(model, { keepLog: events }); world.runUntil(Math.round(H * 3600 * model.tickPerSecond));
    const report = world.report(), ms = performance.now() - t0, kpis = kpisOf(bp, model, report, world);
    const id = "R" + String((this.db.prepare("SELECT COUNT(*) n FROM runs").get().n || 0) + 1).padStart(4, "0");
    this.db.exec("BEGIN");
    try {
      this.db.prepare("INSERT INTO runs (id, at, actor, scenario, seed, hours, revision, engine, model_hash, blueprint_hash, fingerprint, ms, events, kpis, report, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, now(), actor, sid, model.seed, H, this.revision, ENGINE_VERSION, world.modelHash, hash64(canonical(bp)), report.fingerprint, ms, report.events, JSON.stringify(kpis), JSON.stringify(report), note);
      if (events) { const st = this.db.prepare("INSERT INTO run_events (run_id, seq, t, type, mission, station, data) VALUES (?, ?, ?, ?, ?, ?, ?)"); for (const e of world.log) { const { seq, t, type, mission, station, ...rest } = e; st.run(id, seq, t / model.tickPerSecond, type, mission ?? null, station ?? null, JSON.stringify(rest)); } }
      const ss = this.db.prepare("INSERT INTO run_serials (run_id, serial, item, location, tests, fails, contents) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const [loc, L] of world.ledger.locations) for (const [item, list] of L.serials) for (const sn of list) { const h = world.testedSerials[sn] || {}; ss.run(id, sn, item, loc, h.tests || 0, h.fails || 0, JSON.stringify(world.genealogy[sn] || [])); }
      this.db.exec("COMMIT");
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
    return { id, scenario: sid, seed: model.seed, hours: H, ms, fingerprint: report.fingerprint, kpis };
  }
  runs(limit = 200) { return this.db.prepare("SELECT id, at, actor, scenario, seed, hours, revision, engine, fingerprint, ms, events, kpis, note FROM runs ORDER BY at DESC, id DESC LIMIT ?").all(limit).map(r => ({ ...r, kpis: JSON.parse(r.kpis) })); }
  runDetail(id) { const r = this.db.prepare("SELECT * FROM runs WHERE id=?").get(id); if (!r) return null; return { ...r, kpis: JSON.parse(r.kpis), report: JSON.parse(r.report), eventTypes: this.db.prepare("SELECT type, COUNT(*) n FROM run_events WHERE run_id=? GROUP BY type ORDER BY n DESC").all(id) }; }
  events(id, { type = null, q = null, from = 0, limit = 200 } = {}) {
    const where = ["run_id=?", "seq>=?"], args = [id, from]; if (type) { where.push("type=?"); args.push(type); } if (q) { where.push("(data LIKE ? OR mission=? OR station=?)"); args.push(`%${q}%`, q, q); }
    return this.db.prepare(`SELECT seq, t, type, mission, station, data FROM run_events WHERE ${where.join(" AND ")} ORDER BY seq LIMIT ?`).all(...args, limit).map(e => ({ ...e, data: JSON.parse(e.data) }));
  }
  serials(id, { q = "", limit = 200 } = {}) { return this.db.prepare("SELECT serial, item, location, tests, fails, contents FROM run_serials WHERE run_id=? AND (serial LIKE ? OR location LIKE ? OR item LIKE ?) ORDER BY serial LIMIT ?").all(id, `%${q}%`, `%${q}%`, `%${q}%`, limit).map(r => ({ ...r, contents: JSON.parse(r.contents) })); }
  trace(id, serial) { const s = this.db.prepare("SELECT * FROM run_serials WHERE run_id=? AND serial=?").get(id, serial); return { serial, now: s ? { item: s.item, location: s.location, tests: s.tests, fails: s.fails } : null, events: this.events(id, { q: `"${serial}"`, limit: 1000 }) }; }
  deleteRun(id) { for (const t of ["run_events", "run_serials"]) this.db.prepare(`DELETE FROM ${t} WHERE run_id=?`).run(id); return this.db.prepare("DELETE FROM runs WHERE id=?").run(id).changes > 0; }

  /* ---------------- database tools ---------------- */
  // Read-only SQL for the owner and the agent (SELECT / WITH only, one statement).
  query(sql, limit = 500) {
    const s = String(sql || "").trim().replace(/;\s*$/, "");
    if (!/^(select|with)\b/i.test(s) || s.includes(";")) { const e = new Error("only one SELECT (or WITH ... SELECT) statement is allowed"); e.code = "read_only"; throw e; }
    const rows = this.db.prepare(s).all(); return { rows: rows.slice(0, limit), total: rows.length };
  }
  stats() {
    const n = t => this.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
    return { file: this.file, revision: this.revision, records: n("records"), changes: n("changes"), commands: n("commands"), runs: n("runs"), run_events: n("run_events"), run_serials: n("run_serials"), counts: this.counts(), engine: ENGINE_VERSION };
  }
  backup(path) { this.db.exec(`VACUUM INTO '${String(path).replace(/'/g, "''")}'`); return path; }
  exportAll() { const recs = this.records(); return { format: "fc-export", version: 1, revision: this.revision, blueprint: this.blueprint(recs), scenarios: Object.fromEntries(recs.scenario.map(s => [s.id, s.data])),
    extras: Object.fromEntries(TYPES.filter(T => !T.section && T.type !== "scenario").map(T => [T.type, recs[T.type].map(r => r.data)])) }; }
  // Save a run made outside the blueprint model (e.g. one trolley path) with its events, like run() does.
  saveRun({ scenario, seed = 1, hours = 0, actor = "anon", note = "", model, world, kpis, report, ms = 0 }) {
    const id = "R" + String((this.db.prepare("SELECT COUNT(*) n FROM runs").get().n || 0) + 1).padStart(4, "0"), tps = model.tickPerSecond;
    this.db.exec("BEGIN");
    try {
      this.db.prepare("INSERT INTO runs (id, at, actor, scenario, seed, hours, revision, engine, model_hash, blueprint_hash, fingerprint, ms, events, kpis, report, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, now(), actor, scenario, seed, hours, this.revision, ENGINE_VERSION, world.modelHash, hash64(canonical(model)), report.fingerprint, ms, world.log.length, JSON.stringify(kpis), JSON.stringify(report), note);
      const st = this.db.prepare("INSERT INTO run_events (run_id, seq, t, type, mission, station, data) VALUES (?, ?, ?, ?, ?, ?, ?)"); for (const e of world.log) { const { seq, t, type, mission, station, ...rest } = e; st.run(id, seq, t / tps, type, mission ?? null, station ?? null, JSON.stringify(rest)); }
      this.db.exec("COMMIT");
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
    return id;
  }
  close() { this.db.close(); }
}

// Blueprint -> records per type.
export function splitBlueprint(bp) {
  const out = Object.fromEntries(TYPES.map(T => [T.type, []]));
  if (bp.factory) out.factory.push({ ...clone(bp.factory), _meta: { $schema: bp.$schema, schema_version: bp.schema_version, sample_only: bp.sample_only !== false, notes: bp.notes || [], random_seed: bp.initial_conditions?.random_seed ?? 1, active_missions: bp.initial_conditions?.active_missions || [] } });
  for (const T of TYPES) if (T.section && !T.single) { const list = getPath(bp, T.section) || []; out[T.type].push(...clone(list)); }
  if (bp.shipping) out.shipping.push(clone(bp.shipping));
  return out;
}

// Headline numbers of a run, for the dashboard and run comparison.
export function kpisOf(bp, model, r, world) {
  const consumed = new Set(bp.processes.flatMap(p => p.inputs.map(i => i.item_id))), finished = [...new Set(bp.processes.flatMap(p => p.outputs.map(o => o.item_id)))].filter(i => !consumed.has(i));
  const util = [...r.stations.map(s => ({ id: s.id, kind: "station", u: s.utilisation })), ...r.units.map(u => ({ id: u.id, kind: u.kind, u: u.utilisation }))].sort((a, b) => b.u - a.u);
  const q = r.quality[0] || null, zw = r.zones.reduce((n, z) => n + z.wait_s, 0);
  return {
    finished: Object.fromEntries(finished.map(i => [i, r.balance[i]?.produced || 0])), finished_total: finished.reduce((n, i) => n + (r.balance[i]?.produced || 0), 0),
    shipped: r.shipping ? r.shipping.loaded : null, containers_full: r.shipping ? r.shipping.containers_full : null, per_container: r.shipping ? r.shipping.per_container : null,
    missions_done: r.missions.done, missions_failed: r.missions.failed, missions_waiting: r.missions.waiting, mean_lead_s: r.missions.mean_lead_s,
    bottleneck: util[0] ? { id: util[0].id, kind: util[0].kind, utilisation: util[0].u } : null,
    yield: q ? q.yield : null, first_pass_yield: q ? q.first_pass_yield : null, tests: q ? q.tested : 0, fails: q ? q.failed : 0,
    traffic_wait_s: +zw.toFixed(1), zones: r.zones.length, serials: r.serials ? Object.values(r.serials.issued).reduce((a, b) => a + b, 0) : 0,
    invariants: r.invariants.length, events: r.events, time_s: r.time_s
  };
}
