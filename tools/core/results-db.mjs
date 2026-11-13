// Results store of a site (PLATFORM_PLAN P4): <site>/results/results.sqlite, built-in node:sqlite (no install).
// Tables: runs (one row per run), kpis (run, replication, key, value), inputs (run, kind, file, hash).
// The portfolio database (P5) uses the same tables plus the site id.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const emit = process.emitWarning; process.emitWarning = (w, ...a) => { if (String(w && w.message || w).includes("SQLite")) return; return emit.call(process, w, ...a); };
const { DatabaseSync } = await import("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, site TEXT, scenario TEXT, model TEXT, days REAL, seed INTEGER, replications INTEGER,
  orders INTEGER, events INTEGER, assumptions INTEGER, warnings TEXT, receipt TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS kpis (run TEXT, replication INTEGER, key TEXT, value REAL, PRIMARY KEY (run, replication, key));
CREATE TABLE IF NOT EXISTS inputs (run TEXT, kind TEXT, file TEXT, hash TEXT);`;
export function open(file) { mkdirSync(dirname(file), { recursive: true }); const db = new DatabaseSync(file); db.exec(SCHEMA); return db; }

export function record(file, receipt, per) {
  const db = open(file);
  try {
    db.exec("BEGIN");
    db.prepare("DELETE FROM kpis WHERE run = ?").run(receipt.id); db.prepare("DELETE FROM inputs WHERE run = ?").run(receipt.id);
    db.prepare("INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(receipt.id, receipt.site, receipt.variant ? `${receipt.scenario} [${receipt.variant}]` : receipt.scenario, receipt.model, receipt.days, receipt.seed, receipt.replications, receipt.orders, receipt.events, receipt.assumptions, JSON.stringify(receipt.warnings), JSON.stringify(receipt), new Date().toISOString());
    const k = db.prepare("INSERT INTO kpis VALUES (?,?,?,?)");
    per.forEach((p, i) => { for (const [key, v] of Object.entries(p)) if (Number.isFinite(v)) k.run(receipt.id, i, key, v); });
    const ins = db.prepare("INSERT INTO inputs VALUES (?,?,?,?)");
    for (const [kind, v] of Object.entries(receipt.inputs)) for (const x of [].concat(v || [])) ins.run(receipt.id, kind, x.file, x.hash);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; } finally { db.close(); }
}
export function runs(file) { const db = open(file); try { return db.prepare("SELECT id, site, scenario, model, days, replications, orders, at FROM runs ORDER BY at").all(); } finally { db.close(); } }
export function receipt(file, id) { const db = open(file); try { const r = db.prepare("SELECT receipt FROM runs WHERE id = ?").get(id); return r ? JSON.parse(r.receipt) : null; } finally { db.close(); } }
export function kpiRows(file, id) { const db = open(file); try { return db.prepare("SELECT replication, key, value FROM kpis WHERE run = ? ORDER BY key, replication").all(id); } finally { db.close(); } }
export { DatabaseSync };
