// V6 replica edits, applied identically by the route generator (tools/v6/make.mjs) and the build (tools/build-v6.mjs).
//  1. Owner (2026-11-10, image 11): remove the two small walled rooms beside Kitting (they read as dark boxes from above).
//  2. INJ 2's 2nd-floor plate ends at y 682; its new path ends at To LCM (y ~763). The Press tab's 2nd-floor picture and replica cover
//     that area in the same 2nd-floor frame, offset by 684 - 636 = 48 units: add them to INJ 2's 2nd floor (outside its own zone only).
//  3. Owner: no steel roof anywhere.
export const ROOMS = [[236, 508, 257, 547], [337, 509, 358, 547]];
const inside = (r, x, y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
const shiftItem = (o, dx) => { const c = JSON.parse(JSON.stringify(o)); if (c.a) { c.a[0] += dx; c.b[0] += dx; } if (c.p) c.p[0] += dx; if (c.x !== undefined) c.x += dx; return c; };
const centre = (o) => o.a ? [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2] : o.p ? o.p : [o.x + (o.w || 0) / 2, o.y + (o.h || 0) / 2];

export function applyEdits(P) {
  for (const k of Object.keys(P)) {
    const R = P[k].replica;
    R.roofs = [];
    R.walls = R.walls.filter((w) => !(w.plate === "1F" && ROOMS.some((r) => inside(r, w.a[0], w.a[1]) && inside(r, w.b[0], w.b[1]))));
  }
  if (P.inj2 && P.press && !P.inj2.data.plates["2F"].extendedV6) {
    const dx = 684 - 636, z = P.inj2.data.plates["2F"].zone.slice(), pic = P.press.data.plates["2F"].pics[0];
    const add = { file: pic.file, x: pic.x + dx, y: pic.y, w: pic.w, h: pic.h };
    // Rectangle subtraction: retain the source picture UVs, but never draw two plan planes at y=.3.
    const x0 = add.x, y0 = add.y, x1 = x0 + add.w, y1 = y0 + add.h;
    const ix0 = Math.max(x0, z[0]), iy0 = Math.max(y0, z[1]), ix1 = Math.min(x1, z[2]), iy1 = Math.min(y1, z[3]);
    const pieces = ix0 >= ix1 || iy0 >= iy1 ? [[x0, y0, x1, y1]] :
      [[x0, y0, x1, iy0], [x0, iy1, x1, y1], [x0, iy0, ix0, iy1], [ix1, iy0, x1, iy1]];
    for (const [ax, ay, bx, by] of pieces) if (bx > ax && by > ay) P.inj2.data.plates["2F"].pics.push({
      file: add.file, x: ax, y: ay, w: bx - ax, h: by - ay,
      uv: [(ax - x0) / add.w, 1 - (by - y0) / add.h, (bx - x0) / add.w, 1 - (ay - y0) / add.h],
    });
    P.inj2.plans[pic.file] = P.press.plans[pic.file];
    const outside = (o) => { const [x, y] = centre(o); return !(x >= z[0] && x <= z[2] && y >= z[1] && y <= z[3]); };
    for (const key of ["walls", "racks", "columns", "machines", "lifts", "pallets", "decks"]) {
      const extra = (P.press.replica[key] || []).filter((o) => o.plate === "2F").map((o) => shiftItem(o, dx)).filter(outside);
      P.inj2.replica[key] = (P.inj2.replica[key] || []).concat(extra);
    }
    const nz = [Math.min(z[0], add.x), Math.min(z[1], add.y), Math.max(z[2], add.x + add.w), Math.max(z[3], add.y + add.h)];
    P.inj2.data.plates["2F"].zone = nz; P.inj2.data.plates["2F"].box = nz; P.inj2.data.plates["2F"].extendedV6 = true;
  }
  return P;
}
