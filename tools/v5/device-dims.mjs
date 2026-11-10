// V5 device sizes, shared by the player add-on (tools/v5/devices.js, injected as window.MF_DEVICE_DIMS) and the collision
// checker (tools/v5-check.mjs). Metres at real size; K = display scale next to the trolley (the trolley is shown 1.4x real).
export const M = 1 / 0.3;      // frame units per metre
export const K = 1.6;          // devices are drawn 1.6x real size so they read at the guided camera's distance (trolley: 1.4x)
export const TROLLEY = { halfW: 3.27 / 2, halfL: 5.79 / 2, h: 3.98 };   // measured from the player's trolley model (units)

// Plan footprints in units: [along the facing axis (depth), across it (width)], centred on the device point.
export const DIMS = {
  pc: { depth: 0.7 * K * M, width: 1.45 * K * M },            // desk 1.2 m x 0.6 m + tower 0.22 m beside it, chair space excluded
  "rfid-auto": { gap: 2.2 * M, post: 0.16 * K * M, beam: 3.1 * M },   // posts either side of the lane; antennas at beam height
  "rfid-manual": { depth: 0.55 * K * M, width: 0.55 * K * M, offset: 2.0 * M },   // stand table beside the lane
};

/** Plan rectangles [x0, y0, x1, y1] a device occupies on the floor (posts, desks, stands). */
export function footprints(d) {
  if (d.type === "pc") {
    const a = DIMS.pc, horiz = d.face === "e" || d.face === "w";   // facing east/west: depth along x
    const hx = (horiz ? a.depth : a.width) / 2, hy = (horiz ? a.width : a.depth) / 2;
    return [[d.x - hx, d.y - hy, d.x + hx, d.y + hy]];
  }
  if (d.type === "rfid-auto") {
    const a = DIMS["rfid-auto"], p = a.post / 2 + 0.1;
    return d.axis === "y"
      ? [[d.x - a.gap - p, d.y - p, d.x - a.gap + p, d.y + p], [d.x + a.gap - p, d.y - p, d.x + a.gap + p, d.y + p]]
      : [[d.x - p, d.y - a.gap - p, d.x + p, d.y - a.gap + p], [d.x - p, d.y + a.gap - p, d.x + p, d.y + a.gap + p]];
  }
  if (d.type === "rfid-manual") {
    const a = DIMS["rfid-manual"], s = { w: [-1, 0], e: [1, 0], n: [0, -1], s: [0, 1] }[d.side || "w"];
    const cx = d.x + s[0] * a.offset, cy = d.y + s[1] * a.offset;
    return [[cx - a.width / 2, cy - a.depth / 2, cx + a.width / 2, cy + a.depth / 2]];
  }
  return [];
}
/** Where the stand of a manual scanner stands (centre). */
export function standAt(d) { const a = DIMS["rfid-manual"], s = { w: [-1, 0], e: [1, 0], n: [0, -1], s: [0, 1] }[d.side || "w"]; return [d.x + s[0] * a.offset, d.y + s[1] * a.offset]; }
