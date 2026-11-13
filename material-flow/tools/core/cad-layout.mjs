// CAD layouts at true scale (PLATFORM_PLAN P6): read the readable CAD package's layout.sqlite (read-only), take LINE and
// LWPOLYLINE entities of the chosen layers in model space inside a box, convert source units to metres and write an
// mf-layout file (segments [x1, y1, x2, y2] in metres, plan y downwards like the scenes) plus an SVG preview.
// Alignment to a scene's plan: two point pairs "cadX,cadY=planX,planY" (CAD in source units, plan in metres) give a
// similarity transform; its scale is reported so the owner can check it against a known dimension (it should be ~1).
// Arcs, splines, block (INSERT) contents and hatches are not converted in version 1.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const quiet = process.emitWarning; process.emitWarning = (w, ...a) => { if (String(w && w.message || w).includes("SQLite")) return; return quiet.call(process, w, ...a); };
const { DatabaseSync } = await import("node:sqlite");

export const WALL_LAYERS = ["wall", "wall(window)", "_exterior walls", "_interior partition", "_structure main", "--Wall"];
const UNIT_M = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };   // $INSUNITS code -> metres

export function similarity(pairs) {
  // pairs: [[cx, cy, px, py], [cx, cy, px, py]] -> { a, b, tx, ty, scale, rotDeg } with p = [a -b; b a] c + t
  const [[c1x, c1y, p1x, p1y], [c2x, c2y, p2x, p2y]] = pairs, dcx = c2x - c1x, dcy = c2y - c1y, dpx = p2x - p1x, dpy = p2y - p1y, d = dcx * dcx + dcy * dcy;
  if (!d) throw new Error("the two CAD points are the same");
  const a = (dcx * dpx + dcy * dpy) / d, b = (dcx * dpy - dcy * dpx) / d;
  return { a, b, tx: p1x - (a * c1x - b * c1y), ty: p1y - (b * c1x + a * c1y), scale: Math.hypot(a, b), rotDeg: Math.atan2(b, a) * 180 / Math.PI };
}
export const parseAlign = (s) => s.split(";").map((p) => { const [c, q] = p.split("="); const v = [...c.split(","), ...q.split(",")].map(Number); if (v.length !== 4 || !v.every(Number.isFinite)) throw new Error(`bad --align pair "${p}" (cadX,cadY=planX,planY)`); return v; });

export function cadToLayout(dbFile, { layers = WALL_LAYERS, box = null, align = null, maxSegments = 200000 } = {}) {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const meta = Object.fromEntries(db.prepare("SELECT key, value FROM metadata").all().map((r) => [r.key, (() => { try { return JSON.parse(r.value); } catch { return r.value; } })()]));
    const raw = meta.source_units_code ?? 4, code = +String(raw).split(",").pop(), um = UNIT_M[code];   // units stored as the group-code pair [70, 4] or as a number
    if (!um) throw new Error(`unsupported CAD units code ${code}`);
    const ph = layers.map(() => "?").join(","), args = [...layers];
    let where = `space = 'model' AND type IN ('LINE','LWPOLYLINE') AND layer IN (${ph})`;
    if (box) { where += " AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?"; args.push(box[0], box[2], box[1], box[3]); }
    const T = align ? similarity(align) : null, segs = [], perLayer = {};
    const tf = (x, y) => T ? [T.a * x - T.b * y + T.tx, T.b * x + T.a * y + T.ty] : [x * um, -y * um];   // no alignment: metres, y flipped (plan y down)
    const push = (p, q, layer) => { const A = tf(p[0], p[1]), B = tf(q[0], q[1]); segs.push([+A[0].toFixed(3), +A[1].toFixed(3), +B[0].toFixed(3), +B[1].toFixed(3)]); perLayer[layer] = (perLayer[layer] || 0) + 1; };
    for (const r of db.prepare(`SELECT type, layer, properties_json FROM entities WHERE ${where}`).iterate(...args)) {
      const tags = JSON.parse(r.properties_json).tags || [], g = (c) => tags.filter((t) => t[0] === c).map((t) => t[1]);
      if (r.type === "LINE") push([g(10)[0], g(20)[0]], [g(11)[0], g(21)[0]], r.layer);
      else { const xs = g(10), ys = g(20), closed = (g(70)[0] | 0) & 1, P = xs.map((x, i) => [x, ys[i]]); for (let i = 1; i < P.length; i++) push(P[i - 1], P[i], r.layer); if (closed && P.length > 2) push(P[P.length - 1], P[0], r.layer); }
      if (segs.length > maxSegments) throw new Error(`more than ${maxSegments} segments; give a smaller --box`);
    }
    return { format: "mf-layout", version: 1, units: "m", source: { file: dbFile, units: code, layers, box, align: align || null, transform: T, scale: T ? T.scale / um : 1, note: T ? "scale = plan metres per CAD metre; check ~1 against a dimension the owner names" : "metres from CAD units, y flipped" }, perLayer, segments: segs };
  } finally { db.close(); }
}
export function layoutBounds(L) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [a, b, c, d] of L.segments) { x0 = Math.min(x0, a, c); x1 = Math.max(x1, a, c); y0 = Math.min(y0, b, d); y1 = Math.max(y1, b, d); } return [x0, y0, x1, y1]; }
export function layoutSvg(L, out, width = 1600) {
  const [x0, y0, x1, y1] = layoutBounds(L), s = width / Math.max(1e-9, x1 - x0), h = Math.ceil((y1 - y0) * s);
  const d = L.segments.map(([a, b, c, e]) => `M${((a - x0) * s).toFixed(1)} ${((b - y0) * s).toFixed(1)}L${((c - x0) * s).toFixed(1)} ${((e - y0) * s).toFixed(1)}`).join("");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" stroke="#334155" stroke-width="0.6" fill="none"/></svg>`);
  return out;
}
