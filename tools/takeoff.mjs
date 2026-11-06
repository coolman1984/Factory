// The architect's take-off: every element of the factory, read from the 3x plan images and proven by an overlay
// (tools/check-takeoff.py draws this file back on the plans). Coordinates here are 3x image pixels of each picture;
// the output private/replica.json is in slide points. Scale: 1 slide point = 0.30 m (see tools/extract-plan.py).
import { writeFileSync } from "node:fs";
const PICS = { pic28: [21, 157, 410, 337, 1638, 1347, "E1"], pic10: [431, 174, 119, 255, 477, 1023, "E1"], pic117: [555, 305, 355, 137, 1422, 549, "E2-1F"], pic130: [724.5, 143.5, 222, 159, 888, 636, "E2-2F"] };
const L = { walls: [], racks: [], columns: [], machines: [], trucks: [], conveyors: [], rooms: [], lifts: [], decks: [], crop: {} };
const on = (pic) => {
  const [x0, y0, W, H, bw, bh, plate] = PICS[pic], sx = W / bw, sy = H / bh, r1 = (v) => Math.round(v * 10) / 10;
  const P = (x, y) => [r1(x0 + x * sx), r1(y0 + y * sy)];
  const R = (x, y, w, h) => { const [a, b] = P(x, y); return { x: a, y: b, w: r1(w * sx), h: r1(h * sy), plate, pic, raw: [x, y, w, h] }; };
  return {
    wall: (x1, y1, x2, y2, o = {}) => L.walls.push({ a: P(x1, y1), b: P(x2, y2), plate, pic, raw: [x1, y1, x2, y2], ...o }),
    box: (x, y, w, h, o) => { const k = o; on(pic).wall(x, y, x + w, y, k); on(pic).wall(x + w, y, x + w, y + h, k); on(pic).wall(x + w, y + h, x, y + h, k); on(pic).wall(x, y + h, x, y, k); },
    rack: (x, y, w, h, o = {}) => L.racks.push({ ...R(x, y, w, h), ...o }),
    col: (x, y) => L.columns.push({ p: P(x, y), plate, pic, raw: [x, y] }),
    mach: (type, x, y, w, h, o = {}) => L.machines.push({ type, ...R(x, y, w, h), ...o }),
    truck: (x, y, w, h) => L.trucks.push(R(x, y, w, h)),
    conv: (pts) => L.conveyors.push({ pts: pts.map(([x, y]) => P(x, y)), plate, pic, raw: pts }),
    room: (x, y, w, h, label) => L.rooms.push({ ...R(x, y, w, h), label }),
    lift: (x, y, w, h, label) => L.lifts.push({ ...R(x, y, w, h), label }),
    deck: (x, y, w, h, label) => L.decks.push({ ...R(x, y, w, h), label }),
  };
};

/* ---------- E1-1F, west part (pic28) ---------- */
{ const a = on("pic28");
  // shell
  a.wall(112, 4, 112, 1210); a.wall(112, 1210, 670, 1210); a.wall(670, 1210, 670, 1082); a.wall(670, 1082, 1638, 1082); a.wall(112, 4, 1638, 4); a.wall(1620, 4, 1620, 1082);
  // inner walls
  a.wall(660, 4, 660, 240); a.wall(660, 905, 660, 1082); a.wall(360, 20, 360, 750); a.wall(475, 20, 475, 905); a.wall(360, 750, 475, 750); a.wall(360, 800, 360, 942); a.wall(360, 942, 475, 942);
  a.wall(115, 965, 660, 965); a.wall(305, 965, 305, 1210); a.wall(458, 975, 458, 1080); a.wall(395, 1080, 660, 1080); a.wall(598, 970, 598, 1210); a.wall(530, 1085, 530, 1205);
  a.wall(1025, 72, 1620, 72); a.wall(1485, 495, 1485, 1082); a.wall(1485, 495, 1620, 495);
  a.box(495, 18, 133, 104); a.box(495, 135, 133, 105);
  a.room(495, 18, 133, 104, "Room"); a.room(495, 135, 133, 105, "Room"); a.room(1485, 495, 135, 587, "Area");
  // rack blocks (double rows), west and east fields
  for (const y of [250, 428, 588, 750]) for (const [x, w] of [[497, 43], [556, 42], [615, 43], [665, 27]]) a.rack(x, y, w, y === 250 ? 142 : 145);
  for (const y of [428, 588, 750]) for (const [x, w] of [[1018, 40], [1076, 42], [1127, 41], [1185, 41], [1243, 41], [1320, 42], [1378, 42]]) a.rack(x, y, w, 145);
  // column grid
  for (const x of [118, 660, 990, 1140, 1298, 1455, 1622]) for (const y of [123, 229, 335, 440, 548, 652, 760, 865, 971]) if (!(x === 990 && y < 100)) a.col(x, y);
  // injection machines: five large ones, then the small ones and the utility block
  for (const y of [72, 148, 220, 295, 372]) a.mach("injection", 155, y - 26, 186, 52, { big: true });
  for (const y of [440, 500, 560, 620]) a.mach("injection", 150, y - 19, 70, 38);
  a.mach("utility", 120, 815, 78, 75); a.mach("utility", 268, 815, 50, 118); a.mach("utility", 118, 900, 40, 45);
  for (const y of [995, 1043, 1090, 1137]) a.mach("utility", 130, y - 16, 28, 32);
  a.mach("utility", 170, 975, 45, 120); a.mach("utility", 230, 975, 48, 110); a.mach("utility", 170, 1110, 62, 95);
  // loading docks with trucks
  for (const x of [762, 825, 882, 951, 1014, 1135, 1204]) { a.truck(x - 20, 1120, 40, 160); a.mach("dock", x - 26, 1082, 52, 32); }
  a.deck(1362, 1082, 62, 188, "Ramp"); a.mach("utility", 1445, 1085, 95, 22);
}
/* ---------- E1-1F, east part (pic10) ---------- */
{ const a = on("pic10");
  a.wall(0, 4, 470, 4); a.wall(470, 4, 470, 1005); a.wall(0, 1005, 470, 1005); a.wall(0, 135, 250, 135); a.wall(250, 135, 250, 830); a.wall(0, 830, 250, 830); a.wall(250, 145, 470, 145);
  a.room(10, 135, 240, 695, "Room");
  for (const y of [175, 285, 393, 502, 612, 720]) for (const x of [15, 130]) a.col(x, y);
  for (const y of [172, 262, 348, 436, 522, 610, 697, 785, 855]) a.col(283, y);
  for (const y of [348, 436, 522, 610, 697, 855]) { a.col(375, y); a.col(435, y); }
  a.lift(375, 188, 62, 56, "Lift"); a.box(365, 168, 105, 97); a.lift(420, 835, 42, 55, "Lift");
}
/* ---------- E2-1F (pic117) ---------- */
{ const a = on("pic117");
  a.wall(280, 190, 280, 530); a.wall(280, 530, 1422, 530); a.wall(160, 0, 160, 280); a.wall(250, 0, 250, 280); a.wall(160, 280, 250, 280); a.wall(160, 370, 160, 530); a.wall(0, 365, 160, 365); a.wall(0, 4, 1422, 4);
  a.box(5, 142, 65, 128); a.lift(30, 397, 80, 45, "Lift");
  a.rack(82, 170, 24, 96); a.rack(82, 252, 76, 16);
  // injection machines, standing across the top row
  for (const x of [340, 430, 525, 615, 710, 800, 910, 1015, 1140, 1265]) a.mach("injection", x - 30, 55, 60, 122, { vertical: true });
  // conveyors
  a.conv([[300, 188], [1422, 188]]); a.conv([[305, 358], [1422, 358]]); a.conv([[365, 422], [700, 422], [700, 497], [365, 497], [365, 422]]); a.conv([[770, 460], [1422, 460]]);
  for (const x of [320, 480, 640, 800, 960, 1120, 1280]) { a.col(x, 345); a.col(x, 530); }
  for (const x of [930, 1040, 1140, 1245, 1350]) a.mach("press", x - 45, 425, 90, 58);
  a.rack(292, 415, 68, 60); a.mach("utility", 510, 377, 30, 26); a.mach("utility", 706, 374, 32, 46); a.rack(695, 470, 76, 60);
}
/* ---------- E2-2F (pic130) ---------- */
{ const a = on("pic130");
  a.wall(10, 25, 695, 25); a.wall(10, 25, 10, 585); a.wall(10, 585, 695, 585); a.wall(695, 25, 695, 585); a.box(705, 100, 160, 390);
  a.room(705, 100, 160, 390, "Plan area");
  for (let i = 0; i < 10; i++) a.rack(20, 52 + i * 46.5, 225, 30, { along: true });
  a.rack(445, 50, 75, 45, { along: true }); a.rack(540, 50, 150, 45, { along: true });
  a.mach("cell", 495, 120, 130, 40);
  for (const y of [115, 168, 222, 275, 328, 381, 434, 487, 530, 575]) for (const x of [310, 495, 625]) a.col(x, y);
  a.deck(10, 590, 680, 30, "Bridge");
}
L.scale = 0.3;
writeFileSync(new URL("../private/replica.json", import.meta.url), JSON.stringify(L));
console.log(`walls ${L.walls.length}, racks ${L.racks.length}, columns ${L.columns.length}, machines ${L.machines.length}, trucks ${L.trucks.length}, conveyors ${L.conveyors.length}, lifts ${L.lifts.length}`);
