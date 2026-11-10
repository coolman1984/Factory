// Lists every PC-location symbol and RFID mark of the 1st-floor slide (COM export in private/v5/s1/slide1.json) in the
// player's INJ 1 frame. Slide -> frame transform fitted on shared shapes (node 4, node 5, the INJ 1 box, Inj. W/H):
//   X = 1.14369 x + 0.26,  Y = 2.18066 y - 91.62   (the deck squashes the CAD plan vertically; the player is CAD-true)
// Usage: node tools/v5-symbols.mjs [slide.json]
import { readFileSync } from "node:fs";
const file = process.argv[2] || "private/v5/s1/slide1.json";
const S = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
export const X = (x) => 1.14369 * x + 0.26, Y = (y) => 2.18066 * y - 91.62;
const PLATE = [20.01, 390, 508, 770.666];
const inPlate = (x, y) => x >= PLATE[0] && x <= PLATE[2] && y >= PLATE[1] && y <= PLATE[3];
const PC = { 9: "result", 1: "mapping", 10: "quality" };   // AutoShapeType: oval, rectangle, hexagon
const rows = [];
for (const s of S) {
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  const small = s.w > 8 && s.w < 16 && s.h > 10 && s.h < 18;
  if (s.type === 1 && small && PC[s.auto] && s.fill) rows.push({ what: "pc", kind: PC[s.auto], id: s.id, fill: s.fill, x: +X(cx).toFixed(1), y: +Y(cy).toFixed(1) });
  if (s.type === 6 && (s.line === "#FFC000" || s.line === "#C00000")) rows.push({ what: s.line === "#FFC000" ? "rfid-auto" : "rfid-manual", id: s.id, x: +X(cx).toFixed(1), y: +Y(cy).toFixed(1), x0: +X(s.x).toFixed(1), x1: +X(s.x + s.w).toFixed(1), y0: +Y(s.y).toFixed(1), y1: +Y(s.y + s.h).toFixed(1) });
}
for (const r of rows) r.inj1 = inPlate(r.x, r.y);
if (process.argv[1].endsWith("v5-symbols.mjs")) for (const r of rows) console.log(JSON.stringify(r));
