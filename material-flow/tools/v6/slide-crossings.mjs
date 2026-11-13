// Where do the owner's slide trolley lines (connectors) cross a replica wall? Each crossing is a passage the CAD replica is missing.
// Reads the connectors of slide 1 (1st floor, COM export) and approximates each elbow connector by its bounding-box L-shapes;
// reports walls whose segment intersects the connector's straight runs. Read-only; prints candidates for tools/v6/edits.mjs DOORS.
// Usage: node tools/v6/slide-crossings.mjs [tab=inj2]
import { readFileSync } from "node:fs";
const tab = process.argv[2] || "inj2";
const P = JSON.parse(readFileSync("private/v5/P-v4.json", "utf8"));
const S = JSON.parse(readFileSync("private/v5/s1/slide1.json", "utf8").replace(/^﻿/, ""));
const F = (x, y) => [1.14369 * x + 0.26, 2.18066 * y - 91.62];
const zone = P[tab].data.plates["1F"].zone, walls = P[tab].replica.walls.filter((w) => w.plate === "1F");
const byId = Object.fromEntries(S.map((s) => [s.id, s]));
const cross = (a, b, c, d) => { // segments ab, cd intersect (axis-aligned or not)
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
};
for (const s of S) {
  if (!s.conn || !(s.line === "#0B76A0" || s.line === "#3B7D23")) continue;
  // the connector's own box (rotation 90/270 swaps w and h around the centre)
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2, rot = ((s.rot || 0) % 180 + 180) % 180, w = rot === 90 ? s.h : s.w, h = rot === 90 ? s.w : s.h;
  const a = F(cx - w / 2, cy - h / 2), b = F(cx + w / 2, cy + h / 2);
  if (b[0] < zone[0] || a[0] > zone[2] || b[1] < zone[1] || a[1] > zone[3]) continue;
  const from = s.from ? (byId[s.from]?.text || s.from) : "-", to = s.to ? (byId[s.to]?.text || s.to) : "-";
  // candidate runs: the four sides of the connector box (an elbow uses two or three of them)
  const runs = [[[a[0], a[1]], [b[0], a[1]]], [[b[0], a[1]], [b[0], b[1]]], [[a[0], b[1]], [b[0], b[1]]], [[a[0], a[1]], [a[0], b[1]]]];
  const hits = new Set();
  for (const w of walls) for (const [p, q] of runs) if (cross(p, q, w.a, w.b)) hits.add(`${w.a.map((v) => v.toFixed(0))}-${w.b.map((v) => v.toFixed(0))}`);
  console.log(`conn ${s.id} ${s.line === "#3B7D23" ? "AGV" : "manual"} ${from} -> ${to}: box ${a.map((v) => v.toFixed(0))} .. ${b.map((v) => v.toFixed(0))}; walls crossed by its box sides: ${[...hits].join(" | ") || "none"}`);
}
