// Factory Control Center server: the control UI and a JSON API on this PC only (127.0.0.1). No dependencies.
// Usage: node control/server.mjs [--port 8765] [--db file]   then open http://127.0.0.1:8765/
// The agent can use the same API (POST /api/command) or the command line (control/fc.mjs) on the same database.
import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "./open.js";
import { TYPES, refsTo } from "./schema.js";
import { worldTransform } from "../engine/src/blueprint.js";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PORT = +arg("port", process.env.FC_PORT || 8765), S = await openStore(arg("db", process.env.FC_DB || undefined));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const STATIC = { "/": "ui/index.html", "/app.js": "ui/app.js", "/app.css": "ui/app.css", "/i18n.js": "ui/i18n.js", "/schema.js": "schema.js" };

const send = (res, code, body, type = "application/json; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...extra }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const body = req => new Promise((ok, bad) => { let b = ""; req.on("data", c => { b += c; if (b.length > 50e6) { bad(new Error("request too large")); req.destroy(); } }); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(new Error("body is not JSON")); } }); });
const meta = () => ({ revision: S.revision, canUndo: S.canUndo(), canRedo: S.canRedo(), problems: S.problems().length, engine: S.stats().engine, factory: S.all("factory")[0]?.data?.name || "", db: S.file });

function layout() {
  const bp = S.blueprint(), ents = bp.entities.map(e => { let w = null; try { w = worldTransform(bp, e.entity_id); } catch { } return { id: e.entity_id, name: e.name, category: e.category, parent: e.spatial_parent_id, x: w ? w.x : null, y: w ? w.y : null, yaw: w ? w.yaw_deg : 0, prefab: e.prefab_id }; });
  const pf = Object.fromEntries(bp.prefabs.map(p => [p.prefab_id, p.dimensions_m])), byId = Object.fromEntries(ents.map(e => [e.id, e]));
  for (const e of ents) e.size = pf[e.prefab] || null;
  return { site: bp.factory.site_dimensions_m || null, entities: ents, nodes: bp.navigation.nodes.map(n => ({ id: n.node_id, x: n.position_m[0], y: n.position_m[1] })), edges: bp.navigation.edges.map(e => ({ id: e.edge_id, a: e.from_node, b: e.to_node, width: e.width_m })),
    ports: bp.ports.map(p => { const o = byId[p.owner_entity_id]; return { id: p.port_id, owner: p.owner_entity_id, role: p.role, node: p.navigation_node_id, x: o && o.x != null ? o.x + (p.local_position_m?.[0] || 0) : null, y: o && o.y != null ? o.y + (p.local_position_m?.[1] || 0) : null }; }),
    flows: bp.material_flows.map(f => ({ id: f.flow_id, item: f.item_id, from: f.from_port_id, to: f.to_port_id })) };
}

const routes = [
  ["GET", /^\/api\/meta$/, () => meta()],
  ["GET", /^\/api\/schema$/, () => TYPES],
  ["GET", /^\/api\/records$/, () => S.records()],
  ["GET", /^\/api\/records\/([a-z]+)$/, (m) => S.all(m[1])],
  ["GET", /^\/api\/records\/([a-z]+)\/(.+)$/, (m) => S.get(m[1], decodeURIComponent(m[2])) || { error: "not found", status: 404 }],
  ["GET", /^\/api\/problems$/, () => S.problems()],
  ["GET", /^\/api\/blueprint$/, () => S.blueprint()],
  ["GET", /^\/api\/layout$/, () => layout()],
  ["GET", /^\/api\/where-used$/, (m, q) => refsTo(S.records(), q.get("type"), q.get("id"))],
  ["POST", /^\/api\/command$/, (m, q, b) => S.command({ actor: "owner", ...b })],
  ["POST", /^\/api\/run$/, (m, q, b) => S.run({ actor: b.actor || "owner", ...b })],
  ["GET", /^\/api\/runs$/, () => S.runs()],
  ["GET", /^\/api\/runs\/([^/]+)$/, (m) => S.runDetail(m[1]) || { error: "not found", status: 404 }],
  ["DELETE", /^\/api\/runs\/([^/]+)$/, (m) => ({ ok: S.deleteRun(m[1]) })],
  ["GET", /^\/api\/runs\/([^/]+)\/events$/, (m, q) => S.events(m[1], { type: q.get("type") || null, q: q.get("q") || null, from: +(q.get("from") || 0), limit: Math.min(2000, +(q.get("limit") || 200)) })],
  ["GET", /^\/api\/runs\/([^/]+)\/serials$/, (m, q) => S.serials(m[1], { q: q.get("q") || "", limit: +(q.get("limit") || 200) })],
  ["GET", /^\/api\/runs\/([^/]+)\/trace\/(.+)$/, (m) => S.trace(m[1], decodeURIComponent(m[2]))],
  ["GET", /^\/api\/changes$/, (m, q) => S.changes({ limit: +(q.get("limit") || 100), before: q.get("before") ? +q.get("before") : null })],
  ["POST", /^\/api\/query$/, (m, q, b) => S.query(b.sql)],
  ["GET", /^\/api\/stats$/, () => S.stats()],
  ["POST", /^\/api\/backup$/, () => { const d = join(here, "data", "backups"); mkdirSync(d, { recursive: true }); return { file: S.backup(join(d, `factory-${new Date().toISOString().replace(/[:.]/g, "-")}.db`)) }; }],
  ["POST", /^\/api\/import$/, (m, q, b) => S.command({ actor: b.actor || "owner", type: "import", payload: { blueprint: b.blueprint || b, scenarios: b.scenarios, label: b.label || "import file" }, force: !!b.force })]
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/api/export") return send(res, 200, JSON.stringify(S.exportAll(), null, 2), "application/json", { "content-disposition": `attachment; filename="factory-r${S.revision}.json"` });
    for (const [method, re, fn] of routes) { const m = re.exec(url.pathname); if (m && req.method === method) { const b = method === "POST" ? await body(req) : {}; const out = fn(m, url.searchParams, b); return send(res, out && out.status === 404 ? 404 : 200, out); } }
    const f = STATIC[url.pathname]; if (req.method === "GET" && f && existsSync(join(here, f))) return send(res, 200, readFileSync(join(here, f)), MIME[extname(f)]);
    send(res, 404, { error: "not found" });
  } catch (e) { send(res, 400, { ok: false, code: e.code || "error", reason: e.message }); }
});
server.listen(PORT, "127.0.0.1", () => console.log(`Factory Control Center: http://127.0.0.1:${PORT}/  (database ${S.file}, revision ${S.revision})`));
const stop = () => { server.close(); S.close(); process.exit(0); }; process.on("SIGINT", stop); process.on("SIGTERM", stop);
