// Reads a slide JSON (from tools/extract-slide.ps1) and prints every connector's real endpoints and the shapes it touches.
import { readFileSync } from "node:fs";
const S = JSON.parse(readFileSync(process.argv[2], "utf8"));
const COL = { "#3B7D23": "GREEN", "#0B76A0": "BLUE" };
function connectorPath(c) {
  const { w, h } = c, a = c.adj == null ? [] : [].concat(c.adj);
  let p;
  if (c.name.startsWith("Straight") || c.name.includes("직선") || c.ctype === 1) p = [[0, 0], [w, h]];
  else if (a.length === 0) p = [[0, 0], [w, 0], [w, h]];
  else if (a.length === 1) p = [[0, 0], [a[0] * w, 0], [a[0] * w, h], [w, h]];
  else p = [[0, 0], [a[0] * w, 0], [a[0] * w, a[1] * h], [w, a[1] * h], [w, h]];
  const cx = c.x + w / 2, cy = c.y + h / 2, r = (c.rot * Math.PI) / 180;
  return p.map(([x, y]) => {
    let dx = x - w / 2, dy = y - h / 2;
    if (c.flipH) dx = -dx;
    if (c.flipV) dy = -dy;
    return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)].map((v) => Math.round(v * 10) / 10);
  });
}
const marks = S.filter((s) => !s.conn && s.type !== 13 && (s.fill || s.text) && s.w < 120);
const label = (s) => {
  const kind = s.auto === 9 ? "Oval" : s.auto === 5 ? "Num" : s.auto === 1 ? (s.text ? "Box" : "Square") : "Shape";
  const col = s.fill === "#00B050" ? "green" : s.fill === "#00B0F0" ? "cyan" : s.fill === "#156082" ? "navy" : s.fill === "#7F7F7F" ? "grey" : s.fill || "";
  return `${kind}:${col}${s.text ? `'${s.text}'` : ""}#${s.id}`;
};
const dist = (p, s) => { const dx = Math.max(s.x - p[0], 0, p[0] - (s.x + s.w)), dy = Math.max(s.y - p[1], 0, p[1] - (s.y + s.h)); return Math.hypot(dx, dy); };
const nearest = (p, skip) => marks.filter((s) => s.auto !== 5 && !skip.includes(s.id)).map((s) => [dist(p, s), s]).sort((a, b) => a[0] - b[0])[0];
for (const c of S.filter((s) => s.conn || (s.line && s.type === 9))) {
  const pts = connectorPath(c), a = pts[0], b = pts[pts.length - 1];
  const na = nearest(a, []), nb = nearest(b, []);
  const nums = S.filter((s) => s.auto === 5 && s.text).map((s) => { const m = [s.x + s.w / 2, s.y + s.h / 2]; let d = 1e9; for (let i = 1; i < pts.length; i++) { const [p, q] = [pts[i - 1], pts[i]]; const t = Math.max(0, Math.min(1, ((m[0] - p[0]) * (q[0] - p[0]) + (m[1] - p[1]) * (q[1] - p[1])) / ((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 || 1))); d = Math.min(d, Math.hypot(m[0] - p[0] - t * (q[0] - p[0]), m[1] - p[1] - t * (q[1] - p[1]))); } return [d, s]; }).filter(([d]) => d < 14).map(([d, s]) => `step ${s.text}(${d.toFixed(0)})`);
  console.log(`#${c.id} ${COL[c.line] || c.line} arrows begin=${c.arrowB} end=${c.arrowE}  ${JSON.stringify(a)} -> ${JSON.stringify(b)}  |  A: ${na ? label(na[1]) + " d" + na[0].toFixed(0) : "-"}  B: ${nb ? label(nb[1]) + " d" + nb[0].toFixed(0) : "-"}  ${nums.join(" ")}  via ${JSON.stringify(pts)}`);
}
console.log("\nMARKS:");
for (const s of marks) console.log(`  ${label(s)} at (${(s.x + s.w / 2).toFixed(0)},${(s.y + s.h / 2).toFixed(0)})`);
