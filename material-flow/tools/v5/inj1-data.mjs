// V5 INJ 1: the trolley's true path from production to the main line, from the owner's latest 1st-floor slide
// (Trolley Paths -261110-Update2.pptx, slide 1, read through PowerPoint COM into private/v5/s1/slide1.json) and the owner's
// instructions of 2026-11-10. Frame = the V4 player frame (CAD-true, 1 unit = 0.30 m). Slide -> frame transform:
//   X = 1.14369 x + 0.26,  Y = 2.18066 y - 91.62   (fitted on shared shapes; see tools/v5-symbols.mjs)
//
// The logic (owner's order: Item Slip -> Final Scan -> Inj. W/H -> TO Mapping / GI -> Kitting -> Main Line):
//   * The INJ 1 corridor runs north-south between the machine hall wall (x = 131) and the warehouse wall (x = 176).
//     The trolley lane is x = 145: the deck's step-1 line and both corridor RFID marks sit on it.
//   * PC locations (legend: circle = Prod. Result / GR, square = TO Mapping / GI, hexagon = Quality) are workstations BESIDE
//     the lane; the trolley stops in the lane next to them. A node is where the trolley stops, a device is where the PC stands.
//   * Yellow slashes = auto RFID gate: the trolley is read while it passes, it never stops. Red slashes = manual RFID point:
//     the trolley stops and the operator scans it with the handheld scanner.
//   * Manual moves (dashed blue on the slide) are pushed by an operator; steps 3 and 4 (green) are AGV moves.
//   * Step 5 of the slide (dashed, main line back into the warehouse) is the empty-trolley return; not part of this path.

// Stop points in the lane (frame units)
const LANE = 145, EAST = 195;                // INJ 1 corridor lane; lane east of the warehouse wall (through the 2nd auto gate)
export const STOPS = {
  itemSlip: [LANE, 594],                     // beside the Item Slip PC (slide shape 65)
  finalScan: [LANE, 509],                    // beside the Final Scan PC (shape 4)
  manualScan: [LANE, 619],                   // red manual RFID point (shape 92) at the warehouse entry
  wh: [170, 675],                            // Inj. W/H (shape 82): the V4 put-away point between the rack rows
  mapping: [EAST, 534],                      // beside the TO Mapping / GI PC (shape 5)
  kitting: [301, 501],                       // Kitting (shape 50), as in V4
  mainLine: [301, 404],                      // Main Line: end of the slide's step-4 line above Kitting (shape 178)
};
const S = STOPS;

export const nodes = {
  65: { id: 65, x: S.itemSlip[0], y: S.itemSlip[1], plate: "1F", kind: "result", mode: "manual", fill: "#7030A0", text: "Item Slip (Prod. Result / GR)" },
  4: { id: 4, x: S.finalScan[0], y: S.finalScan[1], plate: "1F", kind: "result", mode: "manual", fill: "#7030A0", text: "Final Scan / GR" },
  92: { id: 92, x: S.manualScan[0], y: S.manualScan[1], plate: "1F", kind: "scan", mode: "manual", fill: "#C00000", text: "Manual RFID scan" },
  82: { id: 82, x: S.wh[0], y: S.wh[1], plate: "1F", kind: "area", mode: "none", fill: "#7030A0", text: "Inj. W/H" },
  5: { id: 5, x: S.mapping[0], y: S.mapping[1], plate: "1F", kind: "mapping", mode: "manual", fill: "#7030A0", text: "TO Mapping / GI" },
  50: { id: 50, x: S.kitting[0], y: S.kitting[1], plate: "1F", kind: "area", mode: "none", fill: "#156082", text: "Kitting" },
  178: { id: 178, x: S.mainLine[0], y: S.mainLine[1], plate: "1F", kind: "dest", mode: "none", fill: "#156082", text: "Main Line" },
};

// Paths: axis-aligned, every point checked against walls, racks, columns and devices by tools/v5-check.mjs
export const flow = {
  id: "inj1-main", name: "INJ 1: Item Slip to Main Line", color: "#7030A0",
  steps: [
    { node: 65, title: "Item Slip", mode: "flow", view: "2d", dist: 300, path: null,
      what: "The full trolley leaves the injection machines. The operator records the production result on the Prod. Result PC and prints the item slip." },
    { node: 4, title: "Final Scan", mode: "flow", view: "2d", dist: 300, path: [S.itemSlip, S.finalScan],
      what: "Pushed by hand to Final Scan. On the way it passes the auto RFID gate: the ceiling antennas read its tag without stopping. The Final Scan PC confirms the goods receipt." },
    { node: 92, title: "Manual RFID scan", mode: "flow", view: "2d", dist: 300, path: [S.finalScan, S.manualScan],
      what: "Step 1: pushed back down the corridor toward the warehouse, through the auto gate again. At the red point it stops and the operator scans its tag with the handheld scanner." },
    { node: 82, title: "Inj. W/H", mode: "flow", view: "2d", dist: 300, path: [S.manualScan, [LANE, 636], [170, 636], S.wh],
      what: "Put away in the injection warehouse between the rack rows." },
    { node: 5, title: "TO Mapping / GI", mode: "flow", view: "2d", dist: 300, path: [S.wh, [170, 683], [EAST, 683], S.mapping],
      what: "Step 2: pushed out through the east door and north past the second auto RFID gate, which reads it on the move. At the TO Mapping / GI PC the transfer order is mapped and the goods are issued." },
    { node: 50, title: "Kitting (AGV)", mode: "auto", view: "2d", dist: 300, path: [S.mapping, [233, 534], [233, 501], S.kitting],
      what: "Step 3: an AGV takes the trolley to Kitting." },
    { node: 178, title: "Main Line (AGV)", mode: "auto", view: "2d", dist: 300, path: [S.kitting, S.mainLine],
      what: "Step 4: the AGV delivers the kitted parts to the main line." },
  ],
};

// Seconds (story time) the trolley stays at each stop: long enough to see the PC confirm, the scanner scan, the AGV hand over.
const DWELL = { 65: 1.8, 4: 1.8, 92: 2.6, 82: 1.0, 5: 1.8, 50: 1.0, 178: 1.2 };
for (const s of flow.steps) s.dwell = DWELL[s.node];

// Devices. PCs stand where the slide's PC symbol is, against the nearest wall, screen facing the lane.
// RFID: "auto" = antenna gate across the lane (the trolley passes between the two antennas); "manual" = handheld scanner
// on its stand beside the lane, the operator scans the stopped trolley. Symbols of INJ 2 that lie on this plate are built too.
export const devices = [
  { type: "pc", kind: "result", x: 136.5, y: 594.2, face: "e", label: "Item Slip PC", node: 65, fill: "#7030A0", done: "Item slip printed" },
  { type: "pc", kind: "result", x: 136.5, y: 508.9, face: "e", label: "Final Scan PC", node: 4, fill: "#7030A0", done: "Final scan / GR done" },
  { type: "pc", kind: "quality", x: 126.9, y: 668, face: "w", label: "Quality PC", fill: "#7030A0" },   // symbol at y 673.8; moved clear of the column at 677
  { type: "pc", kind: "mapping", x: 182.6, y: 534.4, face: "e", label: "TO Mapping / GI PC", node: 5, fill: "#7030A0", done: "TO mapped, goods issued" },
  { type: "pc", kind: "mapping", x: 426.3, y: 501.1, face: "s", label: "INJ 2 TO Mapping / GI PC", fill: "#8D5524" },
  { type: "rfid-auto", x: LANE, y: 558.1, axis: "y", label: "Auto RFID gate" },
  { type: "rfid-auto", x: EAST, y: 560.7, axis: "y", label: "Auto RFID gate" },
  { type: "rfid-manual", x: LANE, y: 618.9, axis: "y", side: "w", label: "Manual RFID scan", node: 92, done: "RFID scanned at W/H entry" },
  { type: "rfid-manual", x: 410.7, y: 518.9, axis: "x", side: "s", label: "INJ 2 manual RFID scan" },
];

// Network lines (the "all flows" view): the slide's INJ 1 connectors, in the player frame
export const conns = Object.fromEntries(flow.steps.filter((s) => s.path).map((s, i) => [i, { pts: s.path, color: s.mode === "auto" ? "#3B7D23" : "#0B76A0" }]));
