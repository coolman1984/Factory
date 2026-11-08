// Maps new-deck slide-2 points into the old deck's slide-1 frame through the shared source picture (PowerPoint COM geometry).
import { readFileSync } from "node:fs";
const P = "D:/WORK/Software Development/GitHub/Material-Flow/private/";
const pic = (file, slide, id) => JSON.parse(readFileSync(P + file, "utf8")).find((p) => p.slide === slide && p.id === id);
const NEW = pic("paths/pictures-new.json", 2, 3), OLD = pic("paths/pictures-old.json", 1, 117);
const vis = (q) => ({ x0: q.cropL, y0: q.cropT, w: q.origW - q.cropL - q.cropR, h: q.origH - q.cropT - q.cropB });
function toSource(q, [X, Y]) {          // slide point -> source picture point (original points)
  const cx = q.x + q.w / 2, cy = q.y + q.h / 2, r = (-q.rot * Math.PI) / 180;
  let dx = X - cx, dy = Y - cy; [dx, dy] = [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
  if (q.flipH) dx = -dx; if (q.flipV) dy = -dy;
  const v = vis(q); return [v.x0 + ((dx + q.w / 2) / q.w) * v.w, v.y0 + ((dy + q.h / 2) / q.h) * v.h];
}
function toSlide(q, [sx, sy]) {          // source picture point -> slide point
  const v = vis(q); let dx = ((sx - v.x0) / v.w) * q.w - q.w / 2, dy = ((sy - v.y0) / v.h) * q.h - q.h / 2;
  if (q.flipH) dx = -dx; if (q.flipV) dy = -dy;
  const r = (q.rot * Math.PI) / 180, cx = q.x + q.w / 2, cy = q.y + q.h / 2;
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
}
// round trip self-check on both pictures
for (const q of [NEW, OLD]) { const t = [q.x + 10, q.y + 20], b = toSlide(q, toSource(q, t)); if (Math.hypot(b[0] - t[0], b[1] - t[1]) > 1e-6) throw new Error("round trip failed"); }
// displayed box of the old picture on the old slide (rotated 90: swap)
const oc = [OLD.x + OLD.w / 2, OLD.y + OLD.h / 2], ow = OLD.rot % 180 ? OLD.h : OLD.w, oh = OLD.rot % 180 ? OLD.w : OLD.h;
const inside = ([x, y]) => Math.abs(x - oc[0]) <= ow / 2 && Math.abs(y - oc[1]) <= oh / 2;
console.log(`old pic117 shown at x ${(oc[0] - ow / 2).toFixed(1)}..${(oc[0] + ow / 2).toFixed(1)}, y ${(oc[1] - oh / 2).toFixed(1)}..${(oc[1] + oh / 2).toFixed(1)}`);
const nc = [NEW.x + NEW.w / 2, NEW.y + NEW.h / 2], nw = NEW.rot % 180 ? NEW.h : NEW.w, nh = NEW.rot % 180 ? NEW.w : NEW.h;
for (const [name, pt] of [["new picture top-left", [nc[0] - nw / 2, nc[1] - nh / 2]], ["new picture bottom-right", [nc[0] + nw / 2, nc[1] + nh / 2]]]) {
  const o = toSlide(OLD, toSource(NEW, pt)); console.log(`${name} -> old slide (${o[0].toFixed(1)}, ${o[1].toFixed(1)})`);
}
const S = JSON.parse(readFileSync(P + "paths/s2/slide2.json", "utf8"));
for (const s of S.filter((s) => !s.conn && s.type !== 13 && s.fill && s.y < 470 && s.auto !== 5)) {
  const c = [s.x + s.w / 2, s.y + s.h / 2], src = toSource(NEW, c), o = toSlide(OLD, src);
  console.log(`#${s.id} ${(s.text || (s.auto === 9 ? "GR" : "TO Mapping") + " " + (s.fill === "#00B050" ? "Auto" : "Manual")).padEnd(18)} new(${c.map((v) => v.toFixed(0))}) src(${src.map((v) => v.toFixed(0))}) old(${o.map((v) => v.toFixed(1))}) ${inside(o) ? "INSIDE old E2-1F" : "outside"}`);
}
