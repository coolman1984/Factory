// Factory Control Center server: the control UI and a JSON API on this PC only (127.0.0.1). No dependencies.
// Usage: node control/server.mjs [--port 8765] [--db file]   then open http://127.0.0.1:8765/
// The agent can use the same API (POST /api/command) or the command line (control/fc.mjs) on the same database.
import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "./open.js";
import { TYPES, refsTo } from "./schema.js";
import { worldTransform } from "../engine/src/blueprint.js";
import { openLive, renderFilm, films, filmPath } from "./real/film.mjs";
import { exportScene } from "./real/export-scene.mjs";
import { autoRoute } from "./real/autoroute.mjs";
import { runAndSave } from "./real/path.mjs";

const vendorThree = () => ["three.js", ...Array.from({ length: 10 }, (_, i) => `three-${String(i + 1).padStart(3, "0")}.js`)].map(f => readFileSync(join(vendorDir, f), "utf8")).join("");
import { statSync, createReadStream } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const vendorDir = join(here, "../material-flow/src/v8/vendor"), assetDir = join(here, "../viewer/assets");
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PORT = +arg("port", process.env.FC_PORT || 8765), S = await openStore(arg("db", process.env.FC_DB || undefined));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const STATIC = { "/v9": "ui/v9.html", "/v9.html": "ui/v9.html", "/v9.js": "ui/v9.js", "/v9-studio.js": "ui/v9-studio.js", "/real/timing.js": "real/timing.js", "/3d.html": "ui/3d.html", "/viewer3d.js": "ui/viewer3d.js", "/": "ui/index.html", "/app.js": "ui/app.js", "/app.css": "ui/app.css", "/i18n.js": "ui/i18n.js", "/schema.js": "schema.js" };

const send = (res, code, body, type = "application/json; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...extra }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const body = req => new Promise((ok, bad) => { let b = ""; req.on("data", c => { b += c; if (b.length > 50e6) { bad(new Error("request too large")); req.destroy(); } }); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(new Error("body is not JSON")); } }); });
const meta = () => ({ revision: S.revision, canUndo: S.canUndo(), canRedo: S.canRedo(), problems: S.problems().length, engine: S.stats().engine, factory: S.all("factory")[0]?.data?.name || "", db: S.file });

function layout() {
  const bp = S.blueprint(), ents = bp.entities.map(e => { let w = null; try { w = worldTransform(bp, e.entity_id); } catch { } return { id: e.entity_id, name: e.name, category: e.category, parent: e.spatial_parent_id, x: w ? w.x : null, y: w ? w.y : null, yaw: w ? w.yaw_deg : 0, prefab: e.prefab_id }; });
  const pf = Object.fromEntries(bp.prefabs.map(p => [p.prefab_id, p.dimensions_m])), byId = Object.fromEntries(ents.map(e => [e.id, e]));
  const raw = Object.fromEntries(bp.entities.map(e => [e.entity_id, e]));
  for (const e of ents) e.size = raw[e.id]?.size_m || pf[e.prefab] || null;
  return { site: bp.factory.site_dimensions_m || null, entities: ents, nodes: bp.navigation.nodes.map(n => ({ id: n.node_id, x: n.position_m[0], y: n.position_m[1] })), edges: bp.navigation.edges.map(e => ({ id: e.edge_id, a: e.from_node, b: e.to_node, width: e.width_m })),
    ports: bp.ports.map(p => { const o = byId[p.owner_entity_id]; return { id: p.port_id, owner: p.owner_entity_id, role: p.role, node: p.navigation_node_id, x: o && o.x != null ? o.x + (p.local_position_m?.[0] || 0) : null, y: o && o.y != null ? o.y + (p.local_position_m?.[1] || 0) : null }; }),
    flows: bp.material_flows.map(f => ({ id: f.flow_id, item: f.item_id, from: f.from_port_id, to: f.to_port_id })),
    cad: S.all("cadlayer").filter(r => r.data.kind !== "marking" || r.data.count < 1500).map(r => ({ id: r.id, kind: r.data.kind, segments: r.data.segments })),
    stops: S.all("stop").map(r => ({ id: r.id, name: r.data.name, x: r.data.position_m[0], y: r.data.position_m[1] })),
    paths: S.all("path").map(r => ({ id: r.id, name: r.data.name, color: r.data.color, routes: r.data.routes || [], clash: r.data.clearance?.objects_on_route?.length || 0 })) };
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
  ["GET", /^\/api\/films$/, () => films()],
  ["POST", /^\/api\/autoroute$/, (m, q, b) => autoRoute(S, b.path)],
  ["POST", /^\/api\/path-run$/, (m, q, b) => { const r = runAndSave(S, b.path, "v9"); return { id: r.id, trip_s: r.trip_s, distance_m: r.distance_m }; }],
  ["GET", /^\/api\/scene3d$/, async (m, q) => { if (!S.all("path").length) return { error: "this database has no real-factory data (start with start-real-factory.cmd)" }; return (await exportScene({ db: S.file, path: q.get("path") || null, out: null })).pack; }],
  ["POST", /^\/api\/live3d$/, (m, q, b) => openLive({ path: b.path || null, db: S.file })],
  ["POST", /^\/api\/film$/, (m, q, b) => { if (S.filmJob) return { ok: false, reason: "a film is already rendering" }; S.filmJob = renderFilm({ path: b.path || null, db: S.file }).then(r => (S.filmJob = null, S.lastFilm = r)).catch(e => (S.filmJob = null, S.lastFilm = { ok: false, reason: e.message })); return { ok: true, started: true }; }],
  ["GET", /^\/api\/film-status$/, () => ({ rendering: !!S.filmJob, last: S.lastFilm || null })],
  ["GET", /^\/api\/stats$/, () => S.stats()],
  ["POST", /^\/api\/backup$/, () => { const d = join(here, "data", "backups"); mkdirSync(d, { recursive: true }); return { file: S.backup(join(d, `factory-${new Date().toISOString().replace(/[:.]/g, "-")}.db`)) }; }],
  ["POST", /^\/api\/import$/, (m, q, b) => S.command({ actor: b.actor || "owner", type: "import", payload: { blueprint: b.blueprint || b, scenarios: b.scenarios, label: b.label || "import file" }, force: !!b.force })]
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/vendor/three.js") return send(res, 200, vendorThree(), "text/javascript; charset=utf-8", { "cache-control": "max-age=3600" });
    if (req.method === "GET" && url.pathname === "/vendor/factory-engine.js") return send(res, 200, readFileSync(join(vendorDir, "../engine/factory-engine.js")), "text/javascript; charset=utf-8");
    if (req.method === "GET" && /^\/plans\/[\w.\-]+\.png$/.test(url.pathname)) { const fp = join(here, "data/film", url.pathname.slice(1)); if (existsSync(fp)) return send(res, 200, readFileSync(fp), "image/png", { "cache-control": "max-age=600" }); }
    if (req.method === "GET" && url.pathname === "/vendor/look.js") return send(res, 200, readFileSync(join(vendorDir, "../look.js")), "text/javascript; charset=utf-8");
    if (req.method === "POST" && url.pathname === "/api/films/upload") {   // a take recorded in the browser
      const name = (url.searchParams.get("name") || "take.webm").replace(/[^\w.\-]/g, ""); if (!/\.webm$/.test(name)) return send(res, 400, { ok: false, reason: "webm only" });
      const fp = filmPath(name); mkdirSync(dirname(fp), { recursive: true }); const chunks = []; req.on("data", c => chunks.push(c)); req.on("end", () => { writeFileSync(fp, Buffer.concat(chunks)); send(res, 200, { ok: true, name }); }); return;
    }
    if (req.method === "GET" && url.pathname === "/vendor/three-addons.js") return send(res, 200, readFileSync(join(vendorDir, "three-addons.js")), "text/javascript; charset=utf-8", { "cache-control": "max-age=3600" });
    if (req.method === "GET" && /^\/assets\/[\w-]+\.glb$/.test(url.pathname)) { const fp = join(assetDir, url.pathname.slice(8)); if (existsSync(fp)) return send(res, 200, readFileSync(fp), "model/gltf-binary", { "cache-control": "max-age=600" }); }
    if (req.method === "GET" && url.pathname.startsWith("/films/")) {   // MP4 with byte ranges, so the browser can seek
      const fp = filmPath(decodeURIComponent(url.pathname.slice(7))); let st; try { st = statSync(fp); } catch { return send(res, 404, { error: "not found" }); }
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
      if (m) { const a = m[1] ? +m[1] : 0, z = m[2] ? +m[2] : st.size - 1; res.writeHead(206, { "content-type": fp.endsWith(".webm") ? "video/webm" : "video/mp4", "content-range": `bytes ${a}-${z}/${st.size}`, "accept-ranges": "bytes", "content-length": z - a + 1 }); return createReadStream(fp, { start: a, end: z }).pipe(res); }
      res.writeHead(200, { "content-type": fp.endsWith(".webm") ? "video/webm" : "video/mp4", "content-length": st.size, "accept-ranges": "bytes" }); return createReadStream(fp).pipe(res);
    }
    if (req.method === "GET" && url.pathname === "/api/export") return send(res, 200, JSON.stringify(S.exportAll(), null, 2), "application/json", { "content-disposition": `attachment; filename="factory-r${S.revision}.json"` });
    for (const [method, re, fn] of routes) { const m = re.exec(url.pathname); if (m && req.method === method) { const b = method === "POST" ? await body(req) : {}; const out = await fn(m, url.searchParams, b); return send(res, out && out.status === 404 ? 404 : 200, out); } }
    const f = STATIC[url.pathname]; if (req.method === "GET" && f && existsSync(join(here, f))) return send(res, 200, readFileSync(join(here, f)), MIME[extname(f)]);
    send(res, 404, { error: "not found" });
  } catch (e) { send(res, 400, { ok: false, code: e.code || "error", reason: e.message }); }
});
server.listen(PORT, "127.0.0.1", () => console.log(`Factory Control Center: http://127.0.0.1:${PORT}/  (database ${S.file}, revision ${S.revision})`));
const stop = () => { server.close(); S.close(); process.exit(0); }; process.on("SIGINT", stop); process.on("SIGTERM", stop);
