// Device sizes, shared by the player add-on (tools/v5/devices.js via window.MF_DEVICE_DIMS), the V6 generator and the collision
// checks. Metres at real size; each device has its own display scale k (default K). Owner (2026-11-10): PCs and scanners "big,
// like icons, so they are very seen" -> K = 2.4; the generator lowers k only where the real space does not allow it.
export const M = 1 / 0.3;      // frame units per metre
export const K = 2.4;          // default display scale of PCs and scanners
export const TROLLEY = { halfW: 3.27 / 2, halfL: 5.79 / 2, h: 3.98 };   // measured from the player's trolley model (units)

export const DIMS = {
  pc: { depth: 0.7, width: 1.45 },                    // metres before k: desk 1.2 x 0.6 + tower beside it
  "rfid-auto": { gap: 2.2 * M, post: 0.16 * M },       // structure at real size (units): posts either side of the lane
  "rfid-manual": { depth: 0.36, width: 0.36 },         // metres before k: stand base
};

/** Plan rectangles [x0, y0, x1, y1] a device occupies on the floor. */
export function footprints(d) {
  const k = d.k || K;
  if (d.type === "pc") {
    const a = DIMS.pc, horiz = d.face === "e" || d.face === "w";
    const hx = (horiz ? a.depth : a.width) * k * M / 2, hy = (horiz ? a.width : a.depth) * k * M / 2;
    return [[d.x - hx, d.y - hy, d.x + hx, d.y + hy]];
  }
  if (d.type === "rfid-auto") {
    const a = DIMS["rfid-auto"], p = a.post / 2 + 0.1;
    return d.axis === "y"
      ? [[d.x - a.gap - p, d.y - p, d.x - a.gap + p, d.y + p], [d.x + a.gap - p, d.y - p, d.x + a.gap + p, d.y + p]]
      : [[d.x - p, d.y - a.gap - p, d.x + p, d.y - a.gap + p], [d.x - p, d.y + a.gap - p, d.x + p, d.y + a.gap + p]];
  }
  if (d.type === "rfid-manual") {
    const a = DIMS["rfid-manual"], h = a.width * k * M / 2;
    return [[d.x - h, d.y - h, d.x + h, d.y + h]];   // (x, y) = the stand
  }
  return [];
}
