// Read real factory geometry from a CAD extraction database (Material-Flow's layout.sqlite: one row per DXF entity, source
// units millimetres). Coordinates come out in metres, CAD world frame. Block references are expanded one level, which is how
// the drawing stores most walls and machine parts. Nothing here knows about a specific factory: layers and boxes are inputs.
let DatabaseSync = null;
async function sqlite() { if (!DatabaseSync) { const emit = process.emitWarning; process.emitWarning = (w, ...a) => { if (!/SQLite/i.test(String(w && w.message || w))) emit.call(process, w, ...a); }; try { ({ DatabaseSync } = await import("node:sqlite")); } finally { process.emitWarning = emit; } } return DatabaseSync; }

const tagsOf = pj => JSON.parse(pj).tags;
const pts = (type, tags) => {
  const g = k => tags.filter(q => q[0] === k).map(q => q[1]);
  if (type === "LINE") return [[g(10)[0], g(20)[0]], [g(11)[0], g(21)[0]]];
  const p = g(10).map((x, i) => [x, g(20)[i]]); if ((g(70)[0] & 1) && p.length > 2) p.push(p[0]); return p;
};

export class Cad {
  static async open(file) { const D = await sqlite(); return new Cad(new D(file, { readOnly: true })); }
  constructor(db) { this.db = db; this.blocks = new Map();
    this.qBlock = db.prepare("SELECT type, properties_json FROM entities INDEXED BY entities_block WHERE block_name=? AND space='block_definition' AND type IN ('LINE','LWPOLYLINE')"); }
  close() { this.db.close(); }
  block(name) {
    if (!this.blocks.has(name)) this.blocks.set(name, this.qBlock.all(name).map(b => pts(b.type, tagsOf(b.properties_json))).filter(p => p.every(q => Number.isFinite(q[0] + q[1]))));
    return this.blocks.get(name);
  }
  // Every polyline of the given layers whose anchor lies in the box (metres): [{ layer, block, pts: [[x,y],...] (m) }].
  shapes(layers, [x0, y0, x1, y1], { margin = 20, blockFilter = null } = {}) {
    const out = [], q = this.db.prepare(`SELECT type, layer, properties_json FROM entities WHERE space='model' AND layer IN (${layers.map(() => "?").join(",")}) AND type IN ('LINE','LWPOLYLINE','INSERT') AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?`);
    const inBox = p => p.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
    for (const r of q.iterate(...layers, (x0 - margin) * 1000, (x1 + margin) * 1000, (y0 - margin) * 1000, (y1 + margin) * 1000)) {
      const t = tagsOf(r.properties_json);
      if (r.type !== "INSERT") { const p = pts(r.type, t).map(([x, y]) => [x / 1000, y / 1000]); if (p.every(q => Number.isFinite(q[0] + q[1])) && inBox(p)) out.push({ layer: r.layer, block: null, pts: p }); continue; }
      const g = c => (t.find(q => q[0] === c) || [])[1], name = g(2); if (blockFilter && !blockFilter(name)) continue;
      const px = g(10), py = g(20), sx = g(41) ?? 1, sy = g(42) ?? sx, a = (g(50) || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      for (const p of this.block(name)) { const q2 = p.map(([x, y]) => [(px + x * sx * c - y * sy * s) / 1000, (py + x * sx * s + y * sy * c) / 1000]); if (inBox(q2)) out.push({ layer: r.layer, block: name, pts: q2 }); }
    }
    return out;
  }
  // Block references themselves (one object each): [{ layer, block, x, y, yaw_deg, w, d }] with the block's footprint in metres.
  inserts(layers, [x0, y0, x1, y1], blockFilter) {
    const out = [], q = this.db.prepare(`SELECT layer, properties_json FROM entities WHERE space='model' AND type='INSERT' AND layer IN (${layers.map(() => "?").join(",")}) AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?`);
    for (const r of q.iterate(...layers, x0 * 1000, x1 * 1000, y0 * 1000, y1 * 1000)) {
      const t = tagsOf(r.properties_json), g = c => (t.find(q => q[0] === c) || [])[1], name = g(2); if (blockFilter && !blockFilter(name)) continue;
      const P = this.block(name).flat(); if (!P.length) continue;
      const bx0 = Math.min(...P.map(p => p[0])), bx1 = Math.max(...P.map(p => p[0])), by0 = Math.min(...P.map(p => p[1])), by1 = Math.max(...P.map(p => p[1]));
      const sx = g(41) ?? 1, sy = g(42) ?? sx, yaw = g(50) || 0, a = yaw * Math.PI / 180, cx = (bx0 + bx1) / 2 * sx, cy = (by0 + by1) / 2 * sy;
      out.push({ layer: r.layer, block: name, x: (g(10) + cx * Math.cos(a) - cy * Math.sin(a)) / 1000, y: (g(20) + cx * Math.sin(a) + cy * Math.cos(a)) / 1000, yaw_deg: yaw, w: Math.abs((bx1 - bx0) * sx) / 1000, d: Math.abs((by1 - by0) * sy) / 1000 });
    }
    return out;
  }
}

// Shapes -> unique segments [x1,y1,x2,y2] (m), rounded to 1 cm, shorter than minLen dropped.
export function segments(shapes, minLen = 0.05) {
  const seen = new Set(), out = [], r = v => Math.round(v * 100) / 100;
  for (const s of shapes) for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1], b = s.pts[i]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < minLen) continue;
    const seg = [r(a[0]), r(a[1]), r(b[0]), r(b[1])], k = seg[0] < seg[2] || (seg[0] === seg[2] && seg[1] <= seg[3]) ? seg.join() : [seg[2], seg[3], seg[0], seg[1]].join();
    if (!seen.has(k)) { seen.add(k); out.push(seg); }
  }
  return out;
}

// Group shapes into objects: geometry is rasterised on a grid (cell m), cells closer than `join` cells are one object.
// Returns [{ x0, y0, x1, y1, w, d, cx, cy, length_m (drawn line length), n (shapes) }], largest first.
export function cluster(shapes, { cell = 0.25, join = 2, minSize = 0.3 } = {}) {
  const cells = new Map(), key = (i, j) => i * 1e6 + j;
  shapes.forEach((s, si) => { for (let k = 1; k < s.pts.length; k++) { const [a, b] = [s.pts[k - 1], s.pts[k]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cell / 2)));
    for (let t = 0; t <= n; t++) { const x = a[0] + (b[0] - a[0]) * t / n, y = a[1] + (b[1] - a[1]) * t / n, kk = key(Math.floor(x / cell), Math.floor(y / cell)); let c = cells.get(kk); if (!c) cells.set(kk, c = new Set()); c.add(si); } } });
  const seen = new Set(), comps = [];
  for (const k0 of cells.keys()) {
    if (seen.has(k0)) continue; const stack = [k0], members = new Set(); seen.add(k0);
    while (stack.length) { const k = stack.pop(), i = Math.floor(k / 1e6), j = k - i * 1e6; for (const s of cells.get(k)) members.add(s);   // cells are positive (CAD metres)
      for (let di = -join; di <= join; di++) for (let dj = -join; dj <= join; dj++) { const kk = key(i + di, j + dj); if (cells.has(kk) && !seen.has(kk)) { seen.add(kk); stack.push(kk); } } }
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18, len = 0;
    for (const si of members) { const p = shapes[si].pts; for (let k = 0; k < p.length; k++) { x0 = Math.min(x0, p[k][0]); y0 = Math.min(y0, p[k][1]); x1 = Math.max(x1, p[k][0]); y1 = Math.max(y1, p[k][1]); if (k) len += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); } }
    if (Math.max(x1 - x0, y1 - y0) >= minSize) comps.push({ x0, y0, x1, y1, w: x1 - x0, d: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, length_m: len, n: members.size });
  }
  return comps.sort((a, b) => b.w * b.d - a.w * a.d);
}
