// Control Center acceptance tests: commands and guard, audit + undo/redo, rename with references, batch atomicity,
// export/import round trip, the logic dataset (the factory produces, numbers add up), read-only SQL, and the HTTP API.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Store } from "../store.js";
import { seed } from "../seed.js";
import { refsTo, TYPES, GROUPS, checkRecord } from "../schema.js";
import { D, tr } from "../ui/i18n.js";

const fresh = async () => { const s = await Store.open(":memory:"); seed(s); return s; };

test("seed: the logic dataset loads through commands with no problems; every type has records", async () => {
  const s = await fresh(), c = s.counts();
  assert.deepEqual(s.problems(), []); assert.equal(s.revision, 2);
  for (const T of TYPES) if (T.section || T.type === "scenario") assert.ok(c[T.type] > 0, `${T.type} has records`);   // CAD layers, stops and paths belong to a real site
  assert.equal(s.changes().length, 2);
});

test("commands: accepted, refused with reasons and no trace, forced with warnings, deduplicated, stale revisions refused", async () => {
  const s = await fresh();
  const ok = s.command({ actor: "t", type: "record.update", payload: { type: "process", id: "PROC_TEST", set: { duration_s: 16 } } });
  assert.ok(ok.ok && ok.revision === 3); assert.equal(s.get("process", "PROC_TEST").data.duration_s, 16);
  const bad = s.command({ actor: "t", type: "record.update", payload: { type: "process", id: "PROC_TEST", set: { input_location_id: "NOPE" } } });
  assert.equal(bad.code, "refused"); assert.ok(bad.problems.length > 0 && /NOPE/.test(bad.reason));
  assert.equal(s.get("process", "PROC_TEST").data.input_location_id, "BUF_TEST_IN"); assert.equal(s.revision, 3, "a refused command changes nothing");
  const forced = s.command({ actor: "t", type: "record.update", payload: { type: "process", id: "PROC_TEST", set: { input_location_id: "NOPE" } }, force: true });
  assert.ok(forced.ok && forced.warnings.length > 0); assert.ok(s.problems().length > 0);
  assert.ok(s.command({ actor: "t", type: "undo" }).ok); assert.deepEqual(s.problems(), []);
  const a = s.command({ command_id: "same", actor: "t", type: "record.update", payload: { type: "item", id: "CARTON", set: { name: "Carton A" } } });
  const b = s.command({ command_id: "same", actor: "t", type: "record.update", payload: { type: "item", id: "CARTON", set: { name: "Carton B" } } });
  assert.ok(b.duplicate && b.revision === a.revision); assert.equal(s.get("item", "CARTON").data.name, "Carton A");
  assert.equal(s.command({ actor: "t", expected_revision: 1, type: "record.update", payload: { type: "item", id: "CARTON", set: { name: "x" } } }).code, "stale_revision");
  assert.equal(s.command({ actor: "t", type: "record.update", payload: { type: "item", id: "CARTON", set: { unit: "parsec" } } }).code, "refused", "field checks guard enum values");
});

test("audit + undo/redo: every change records exact before/after; undo and redo are exact and recorded", async () => {
  const s = await fresh(), before = s.blueprint();
  s.command({ actor: "owner", type: "record.update", payload: { type: "edge", id: "E_SPINE_1", set: { width_m: 3.5, speed_limit_mps: 1.5 } } });
  s.command({ actor: "agent", type: "record.create", payload: { type: "item", data: { item_id: "LABEL", name: "Label", unit: "ea", tracking: "lot" } } });
  const mid = s.blueprint();
  assert.ok(s.command({ actor: "owner", type: "undo" }).ok); assert.ok(!s.exists("item", "LABEL"));
  assert.ok(s.command({ actor: "owner", type: "undo" }).ok); assert.deepEqual(s.blueprint(), before);
  assert.ok(s.command({ actor: "owner", type: "redo" }).ok); assert.ok(s.command({ actor: "owner", type: "redo" }).ok); assert.deepEqual(s.blueprint(), mid);
  assert.equal(s.command({ actor: "owner", type: "redo" }).code, "nothing_to_redo");
  const ch = s.changes(); assert.deepEqual(ch.slice(0, 6).map(c => c.kind), ["redo", "redo", "undo", "undo", "edit", "edit"]);
  const e = ch.find(c => c.label.startsWith("set edge")); assert.equal(e.ops[0].before.width_m, 3); assert.equal(e.ops[0].after.width_m, 3.5); assert.equal(e.actor, "owner");
  s.command({ actor: "owner", type: "undo" }); s.command({ actor: "owner", type: "record.update", payload: { type: "item", id: "CARTON", set: { name: "new branch" } } });
  assert.equal(s.command({ actor: "owner", type: "redo" }).code, "nothing_to_redo", "a new edit ends the redo chain");
});

test("rename updates every reference; delete of a used record is refused; batches are all-or-nothing", async () => {
  const s = await fresh();
  const used = refsTo(s.records(), "entity", "WORKER_03"); assert.ok(used.some(u => u.type === "handling"));
  assert.ok(s.command({ actor: "t", type: "record.rename", payload: { type: "entity", id: "WORKER_03", to: "HANDLER_A" } }).ok);
  assert.ok(s.get("handling", "HANDLE_GENERAL").data.worker_entity_ids.includes("HANDLER_A")); assert.deepEqual(s.problems(), []);
  assert.ok(s.command({ actor: "t", type: "record.rename", payload: { type: "process", id: "PROC_SMT", to: "PROC_SMT_A" } }).ok);
  assert.ok(s.get("scenario", "demo").data.breakdowns.some(b => b.process === "PROC_SMT_A"), "scenario rows follow a renamed process");
  assert.equal(s.command({ actor: "t", type: "record.delete", payload: { type: "item", id: "CARTON" } }).code, "refused");
  assert.ok(s.command({ actor: "t", type: "record.create", payload: { type: "item", data: { item_id: "SPARE", unit: "ea", tracking: "lot" } } }).ok);
  assert.ok(s.command({ actor: "t", type: "record.delete", payload: { type: "item", id: "SPARE" } }).ok);
  const rev = s.revision, r = s.command({ actor: "t", type: "batch", payload: { commands: [{ type: "record.update", payload: { type: "item", id: "CARTON", set: { name: "batched" } } }, { type: "record.create", payload: { type: "item", data: { item_id: "CARTON", unit: "ea" } } }] } });
  assert.equal(r.ok, false); assert.equal(s.revision, rev); assert.notEqual(s.get("item", "CARTON").data.name, "batched", "nothing of a failed batch remains");
  assert.ok(s.command({ actor: "t", type: "record.move", payload: { type: "item", id: "CARTON", to: 0 } }).ok); assert.equal(s.all("item")[0].id, "CARTON");
});

test("export -> import gives the same master data and the same simulation", async () => {
  const a = await fresh(), dump = a.exportAll(), b = await Store.open(":memory:");
  assert.ok(b.command({ actor: "t", type: "import", payload: { blueprint: dump.blueprint, scenarios: dump.scenarios } }).ok);
  assert.deepEqual(b.blueprint(), a.blueprint());
  assert.equal(b.run({ scenario: "logic-test", hours: 2, events: false }).fingerprint, a.run({ scenario: "logic-test", hours: 2, events: false }).fingerprint);
});

test("logic test: the completed factory produces; quality, shipping, traffic and serial numbers add up", async () => {
  const s = await fresh(), r = s.run({ scenario: "logic-test", actor: "test" }), k = r.kpis, d = s.runDetail(r.id), rep = d.report;
  assert.equal(k.invariants, 0); assert.equal(k.missions_failed, 0);
  assert.ok(k.finished_total >= 20, `packed TVs in 8 h: ${k.finished_total}`);
  const q = rep.quality[0]; assert.equal(q.tested, q.passed + q.failed); assert.ok(q.yield > 0.8 && q.yield <= 1, `yield ${q.yield} near the 92% pass rate`);
  assert.ok(rep.balance.TV_ASSEMBLED.produced >= rep.balance.TV_PASSED.produced && rep.balance.TV_PASSED.produced >= rep.balance.TV_PACKED.produced, "assembled >= passed >= packed");
  assert.equal(rep.shipping.loaded, rep.shipping.packing_list.length); assert.equal(k.shipped, rep.shipping.loaded);
  const packed = s.query(`SELECT serial FROM run_serials WHERE run_id='${r.id}' AND item='TV_PACKED'`).rows; assert.ok(packed.length > 0);
  for (const { serial } of packed.slice(0, 10)) { const t = s.trace(r.id, serial).events.map(e => e.type); assert.ok(t.includes("test.pass") && t.includes("station.finish"), `${serial} traced from test to packing`); }
  const fails = s.query(`SELECT COUNT(*) n FROM run_events WHERE run_id='${r.id}' AND type='test.fail'`).rows[0].n; assert.equal(fails, q.failed);
  const recs = s.records(), inTeam = new Set(recs.handling.flatMap(h => [...h.data.transporter_entity_ids, ...h.data.worker_entity_ids]));
  for (const e of recs.entity.filter(x => ["transporter", "worker"].includes(x.data.category))) assert.ok(inTeam.has(e.id), `${e.id} belongs to a handling team`);
  const perfect = s.run({ scenario: "perfect-quality", events: false }).kpis; assert.equal(perfect.fails, 0); assert.equal(perfect.yield, 1);
  const wide = s.run({ scenario: "two-way-aisles", events: false }).kpis; assert.equal(wide.traffic_wait_s, 0); assert.equal(wide.zones, 0);
  assert.equal(s.run({ scenario: "logic-test", events: false }).fingerprint, r.fingerprint, "same data, same seed: same run");
  assert.equal(s.runs().length, 4);
});

test("database tools: read-only SQL, stats, every record passes its field checks", async () => {
  const s = await fresh();
  assert.ok(s.query("SELECT type, COUNT(*) n FROM records GROUP BY type").rows.length >= 14);
  assert.throws(() => s.query("DELETE FROM records"), /only one SELECT/); assert.throws(() => s.query("SELECT 1; DROP TABLE runs"), /only one SELECT/);
  const st = s.stats(); assert.equal(st.records, Object.values(st.counts).reduce((a, b) => a + b, 0));
  const exists = (t, id) => s.exists(t, id); for (const T of TYPES) for (const r of s.all(T.type)) assert.deepEqual(checkRecord(T.type, r.data, exists), [], `${T.type}:${r.id}`);
});

test("HTTP API: meta, records, command, run, events, layout, export, query, static UI", async () => {
  const port = 18000 + Math.floor(Math.random() * 1000), srv = spawn(process.execPath, [fileURLToPath(new URL("../server.mjs", import.meta.url)), "--port", String(port), "--db", ":memory:"], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error("server did not start")), 60000); srv.stdout.on("data", d => { if (/Control Center/.test(d)) { clearTimeout(t); ok(); } }); srv.on("exit", c => bad(new Error("server exited " + c))); });
    const j = async (p, o = {}) => (await fetch(`http://127.0.0.1:${port}${p}`, { method: o.method || "GET", headers: { "content-type": "application/json" }, body: o.body ? JSON.stringify(o.body) : undefined })).json();
    const m = await j("/api/meta"); assert.equal(m.revision, 2); assert.equal(m.problems, 0);
    assert.equal((await j("/api/records")).item.length, 19);
    const c = await j("/api/command", { method: "POST", body: { type: "record.update", payload: { type: "item", id: "CARTON", set: { name: "API" } } } }); assert.ok(c.ok);
    assert.equal((await j("/api/changes?limit=1"))[0].actor, "owner");
    const run = await j("/api/run", { method: "POST", body: { scenario: "logic-test", hours: 1 } }); assert.ok(run.id);
    assert.ok((await j(`/api/runs/${run.id}/events?type=load.end&limit=5`)).length > 0);
    const L = await j("/api/layout"); assert.ok(L.entities.length > 50 && L.edges.length > 20);
    assert.equal((await j("/api/export")).format, "fc-export");
    assert.ok((await j("/api/query", { method: "POST", body: { sql: "SELECT COUNT(*) n FROM runs" } })).rows[0].n === 1);
    for (const p of ["/", "/app.js", "/app.css", "/schema.js"]) assert.equal((await fetch(`http://127.0.0.1:${port}${p}`)).status, 200, p);
  } finally { srv.kill(); }
});

test("UI languages: every group, type, help text, field label and option has Arabic and Korean", () => {
  const labelOf = f => f.label || f.key.replace(/^_meta\./, "").replace(/[._]/g, " ").replace(/\bid\b/g, "ID").replace(/^./, c => c.toUpperCase());
  const need = new Set(GROUPS);
  for (const T of TYPES) { need.add(T.label); need.add(T.help); for (const f of T.fields) { need.add(labelOf(f)); for (const o of f.options || []) if (o.length > 2) need.add(o); for (const sf of f.fields || []) need.add(labelOf(sf)); } }
  const missing = [...need].filter(k => !D[k] || !D[k][0] || !D[k][1]); assert.deepEqual(missing, [], "missing translations");
  assert.equal(tr("3 problems", "ar"), "3 مشكلة"); assert.equal(tr("3 problems", "ko"), "문제 3개"); assert.equal(tr("Saved r5: set item X name", "ko"), "저장됨 r5: set item X name");
  assert.equal(tr("PROC_TEST", "ar"), "PROC_TEST", "record ids are never translated"); assert.equal(tr("Dashboard", "en"), "Dashboard");
});
