// V6 generator: the owner's configured trolley paths (2026-11-10) for INJ 1, INJ 2, EPS and Press, routed on the V4 replica, plus every PC
// and RFID point of the latest slides placed beside the routes. Output: private/v6/projects.json (read by tools/build-v6.mjs).
// Sources: private/v5/P-v4.json (V4 data), private/v5/s1/slide1.json (1st floor) and private/v5/s2/slide2.json (2nd floor), both
// read through PowerPoint COM from "Trolley Paths -261110-Update2.pptx".
// Frames: 1st floor X = 1.14369 x + 0.26, Y = 2.18066 y - 91.62; 2nd floor X = 1.1587 x - 68.1 + OFF2[tab], Y = 2.049 y - 54.85.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { applyEdits } from "./edits.mjs";
import { solidsOf, makeGrid, snap, route, TURN } from "./router.mjs";
import { footprints, K, M, TROLLEY } from "../v5/device-dims.mjs";
import * as V5 from "../v5/inj1-data.mjs";

const P = applyEdits(JSON.parse(readFileSync("private/v5/P-v4.json", "utf8")));
const read = (f) => JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""));
const S1 = read("private/v5/s1/slide1.json"), S2 = read("private/v5/s2/slide2.json");
const F1 = (x, y) => [1.14369 * x + 0.26, 2.18066 * y - 91.62];
const OFF2 = { inj2: 684, eps: 579.512, press: 636 };
const F2 = (tab, x, y) => [1.1587 * x - 68.1 + OFF2[tab], 2.049 * y - 54.85];
const shape = (S, id) => S.find((s) => s.id === id);
const centre1 = (id) => { const s = shape(S1, id); return F1(s.x + s.w / 2, s.y + s.h / 2); };
const inZone = (z, p) => p[0] >= z[0] && p[0] <= z[2] && p[1] >= z[1] && p[1] <= z[3];
const log = (...a) => console.log(...a);

// ---------- the owner's paths (2026-11-10). A stop: [key, title, what, mode]; "lift:<label>" = ride that elevator up.
const W = { // short explanations shown on the step card
  itemSlip: "The operator records the production result on the Prod. Result PC and prints the item slip.",
  finalScan: "Final scan / GR at the Final Scan PC.",
  to: "At the TO Mapping / GI PC the transfer order is mapped and the goods are issued.",
};
const PATHS = {
  inj1: [
    { id: "inj1-wh", name: "1 · Item Slip to W/H to Main Line", v5: true },
    { id: "inj1-umb", name: "2 · Item Slip to Umbrella to Main Line", stops: [["is", "Item Slip", W.itemSlip], ["fs", "Final Scan", W.finalScan], ["umb", "Umbrella", "Pushed to the Umbrella area."], ["to", "TO Mapping / GI", W.to], ["kit", "Kitting (AGV)", "An AGV takes the trolley to Kitting.", "auto"], ["ml", "Main Line (AGV)", "The AGV delivers the kitted parts to the main line.", "auto"]] },
  ],
  inj2: [
    { id: "inj2-ml", name: "1 · Item Slip to Umbrella to Main Line", stops: [["is", "Item Slip", W.itemSlip], ["fs", "Final Scan", W.finalScan], ["umb", "Umbrella", "Pushed to the Umbrella area."], ["to", "TO Mapping / GI", W.to], ["kit", "Kitting (AGV)", "An AGV takes the trolley to Kitting.", "auto"], ["ml", "Main Line (AGV)", "The AGV delivers to the main line.", "auto"]] },
    { id: "inj2-lcm", name: "2 · Item Slip to Elev 5 to 2F INJ W/H to LCM", stops: [["is", "Item Slip", W.itemSlip], ["fs", "Final Scan", W.finalScan], ["e5", "To Elev 5", "Pushed into Elevator 5."], ["lift:Elev 5", "Elev 5 up to 2F", "Elevator 5 carries the trolley to the 2nd floor."], ["wh2", "INJ W/H 2F", "Stored in the injection warehouse on the 2nd floor."], ["to2", "TO Mapping / GI 2F", W.to], ["lcm", "To LCM", "Delivered to LCM.", "auto"]] },
  ],
  eps: [
    { id: "eps-wh1", name: "1 · Dry Room to W/H 1", stops: "base", tail: [["wh1", "W/H 1", "Stored in W/H 1."]] },
    { id: "eps-kd", name: "2 · Dry Room to KD", stops: "base", tail: [["kd", "KD", "Delivered to KD."]] },
    { id: "eps-2f", name: "3 · Dry Room to Elev 6 to 2F W/H to Main Line", stops: "base", tail: [["e6", "To Elev 6", "Pushed into Elevator 6."], ["lift:Elev 6", "Elev 6 up to 2F", "Elevator 6 carries the trolley to the 2nd floor."], ["wh2f", "2F WH", "Stored in the 2nd-floor warehouse."], ["to2f", "TO Mapping / GI 2F", W.to], ["ml2", "To Main Line", "Delivered to the main line."]] },
    { id: "eps-fdc", name: "4 · Dry Room to W/H 2 to FDC", stops: "base", tail: [["wh2", "W/H 2", "Stored in W/H 2."], ["to", "TO Mapping / GI", W.to], ["fdc", "FDC", "Delivered to FDC."]] },
  ],
  press: [
    { id: "press-coat", name: "1 · Item Slip to Bare W/H to Coat line", stops: "base", tail: [["coat", "Coat line", "Delivered to the coating line (Coat W/H)."]] },
    { id: "press-assy", name: "2 · Bare W/H to Assembly to Elev 3 & 4 to LCM", stops: "base", tail: [["asm", "Assembly line", "Delivered to the assembly line."], ["ais", "Assembly Item Slip", "The assembly line records its production result and prints the item slip."], ["afs", "Assembly Final Scan", "Final scan / GR of the assembled parts."], ["e34", "To Elev 3 & 4", "Pushed into Elevator 3 & 4."], ["lift:Elev 3 & 4", "Elev 3 & 4 up to 2F", "Elevator 3 & 4 carries the trolley to the 2nd floor."], ["to2", "TO Mapping / GI 2F", W.to], ["unp", "Unpacking", "Unpacked."], ["lcm", "To LCM", "Delivered to LCM.", "auto"]] },
  ],
};
const BASE = {
  eps: [["is", "Item Slip", W.itemSlip], ["fs", "Final Scan", W.finalScan], ["wd", "Waiting Dry", "Waits before drying."], ["dr", "Dry Room", "Dried in the Dry Room."]],
  press: [["is", "Item Slip", W.itemSlip], ["fs", "Final Scan", W.finalScan], ["bwh", "Bare W/H", "Stored in the bare-parts warehouse."], ["to", "TO Mapping / GI", W.to]],
};
// stop targets: [plate, point, id, kind, text, fill]. Points near PCs/boxes are snapped to the nearest cell where the trolley can turn.
const TARGETS = {
  inj1: { is: ["1F", V5.STOPS.itemSlip, 65, "result", "Item Slip", "#7030A0", true], fs: ["1F", V5.STOPS.finalScan, 4, "result", "Final Scan / GR", "#7030A0", true], umb: ["1F", [479, 595], 8, "area", "Umbrella", "#156082"], to: ["1F", V5.STOPS.mapping, 5, "mapping", "TO Mapping / GI", "#7030A0", true], kit: ["1F", V5.STOPS.kitting, 50, "area", "Kitting", "#156082", true], ml: ["1F", V5.STOPS.mainLine, 178, "dest", "Main Line", "#156082", true] },
  inj2: { is: ["1F", centre1(148), 148, "result", "INJ 2 Item Slip", "#8D5524"], fs: ["1F", [585, 474], 21, "result", "INJ 2 Final Scan / GR", "#8D5524"], umb: ["1F", [479, 595], 8, "area", "Umbrella", "#156082"], to: ["1F", [426, 501], 38, "mapping", "TO Mapping / GI", "#8D5524"], kit: ["1F", [301, 501], 50, "area", "Kitting", "#156082"], ml: ["1F", [374, 408], 64, "dest", "Main Line", "#156082"], e5: ["1F", "low:Elev 5", 2001, "lift", "Elev 5"], wh2: ["2F", F2("inj2", 480.35, 318.35), 1105, "area", "INJ W/H 2F", "#8D5524"], to2: ["2F", [1194, 656], 1066, "mapping", "TO Mapping / GI 2F", "#00B0F0"], lcm: ["2F", F2("inj2", 404, 399.1), 1040, "dest", "To LCM", "#156082"] },
  eps: { is: ["1F", centre1(307), 307, "result", "EPS Item Slip", "#C2185B"], fs: ["1F", [769, 283], 258, "result", "EPS Final Scan / GR", "#C2185B"], wd: ["1F", [726, 335], 260, "area", "Waiting Dry", "#C2185B"], dr: ["1F", [689, 255], 263, "area", "Dry Room", "#C2185B"], wh1: ["1F", [606, 168], 265, "area", "W/H 1", "#C2185B"], kd: ["1F", [557, 215], 269, "area", "KD", "#C2185B"], e6: ["1F", "low:Elev 6", 2003, "lift", "Elev 6"], wh2f: ["2F", [1198, 128], 1007, "area", "2F WH", "#C2185B"], to2f: ["2F", [1208, 206], 1008, "mapping", "TO Mapping / GI 2F", "#00B0F0"], ml2: ["2F", [954, 231], 1094, "dest", "To Main Line", "#156082"], wh2: ["1F", [586, 337], 266, "area", "W/H 2", "#C2185B"], to: ["1F", [559, 297], 259, "mapping", "TO Mapping / GI", "#C2185B"], fdc: ["1F", [398, 188], 311, "dest", "FDC", "#156082"] },
  press: { is: ["1F", [818, 554], 323, "result", "Press Item Slip", "#1F4E9E"], fs: ["1F", [759, 618], 180, "result", "Press Final Scan / GR", "#1F4E9E"], bwh: ["1F", centre1(168), 168, "area", "Bare W/H", "#1F4E9E"], to: ["1F", [768, 723], 182, "mapping", "TO Mapping / GI", "#1F4E9E"], coat: ["1F", [821, 699], 235, "area", "Coat line (Coat W/H)", "#1F4E9E"], asm: ["1F", [590, 728], 9177, "area", "Assembly line", "#1F4E9E"], ais: ["1F", centre1(176), 176, "result", "Assembly Item Slip", "#1F4E9E"], afs: ["1F", [852, 866], 172, "result", "Assembly Final Scan / GR", "#1F4E9E"], e34: ["1F", "low:Elev 3 & 4", 2005, "lift", "Elev 3 & 4"], to2: ["2F", [1284, 705], 1016, "mapping", "TO Mapping / GI 2F", "#00B0F0"], unp: ["2F", F2("press", 586.05, 400.6), 1090, "area", "Unpacking", "#156082"], lcm: ["2F", [1046, 765], 1040, "dest", "To LCM", "#156082"] },
};
// PC symbols and RFID points of both slides
const PC_KIND = { 9: "result", 1: "mapping", 10: "quality" };
function symbols(S, toFrame) {
  const out = [];
  for (const s of S) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    if (s.type === 1 && PC_KIND[s.auto] && s.fill && s.fill !== "#7F7F7F" && s.w > 8 && s.w < 16 && s.h > 10 && s.h < 18) out.push({ type: "pc", kind: PC_KIND[s.auto], id: s.id, fill: s.fill, at: toFrame(cx, cy) });
    if (s.type === 6 && (s.line === "#FFC000" || s.line === "#C00000") && s.w < 16) out.push({ type: s.line === "#FFC000" ? "rfid-auto" : "rfid-manual", id: s.id, at: toFrame(cx, cy) });
  }
  return out.filter((o) => o.at[1] < 990);   // drop the legend
}

const report = { projects: {}, warnings: [] }, OUT = {};
let failures = 0;
for (const tab of ["inj1", "inj2", "eps", "press"]) {
  const d = P[tab].data, R = P[tab].replica, nodes = {}, flows = [], E = Object.fromEntries((d.elevators || []).map((e) => [e.label, e]));
  const grids = {}, gridOf = (pl) => grids[pl] || (grids[pl] = makeGrid(d.plates[pl].zone, solidsOf(R, pl)));
  const stopCache = {};
  // resolve a stop key to its node (point snapped to where the trolley can stop and turn)
  function stop(key, from) {
    if (stopCache[key]) return stopCache[key];
    const [plate, at, id, kind, text, fill, keep] = TARGETS[tab][key];
    let pt;
    if (typeof at === "string") { const e = E[at.slice(4)]; pt = e.low; }
    else if (keep) pt = at;
    else { const g = gridOf(plate); pt = snap(g, at[0], at[1], TURN, from && from.plate === plate ? from.pt : null); }
    if (!pt) throw new Error(`${tab}: no reachable safe stop for ${key}`);
    const n = { id, x: +pt[0].toFixed(2), y: +pt[1].toFixed(2), plate, kind, mode: kind === "area" || kind === "dest" || kind === "lift" ? "none" : "manual", fill: fill || "#156082", text, target: typeof at === "string" ? null : at };
    nodes[id] = n; return (stopCache[key] = { key, id, plate, pt: [n.x, n.y] });
  }
  function leg(a, b, plate) {
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) return [a, b];
    const g = gridOf(plate), s = g.centre(...a), t = g.centre(...b);
    const r = route(g, s, t); if (!r) return null;
    // put the exact end points back without diagonals: shift the first/last segment onto them
    const p = r.map((q) => q.slice());
    const fit = (i, j, q) => { if (p.length < 2) { p.splice(i === 0 ? 0 : p.length, 0, q); return; } const horiz = Math.abs(p[i][1] - p[j][1]) < 1e-9; if (horiz) p[j][1] = q[1]; else p[j][0] = q[0]; p[i] = q.slice(); };
    if (p.length === 1) p.push(p[0].slice());
    fit(0, 1, a); fit(p.length - 1, p.length - 2, b);
    if (Math.abs(p[0][0] - p[1][0]) > 1e-9 && Math.abs(p[0][1] - p[1][1]) > 1e-9) p.splice(1, 0, [p[1][0], p[0][1]]);
    const n = p.length; if (Math.abs(p[n - 1][0] - p[n - 2][0]) > 1e-9 && Math.abs(p[n - 1][1] - p[n - 2][1]) > 1e-9) p.splice(n - 1, 0, [p[n - 2][0], p[n - 1][1]]);
    return p;   // exact: the ends must equal the stop / elevator points to the last digit
  }
  for (const spec of PATHS[tab]) {
    if (spec.v5) { // INJ 1 path 1 stays exactly as the owner approved it in V5
      for (const [k, n] of Object.entries(V5.nodes)) nodes[k] = { ...n };
      flows.push({ ...V5.flow, name: spec.name, id: spec.id, steps: V5.flow.steps.map((s) => ({ ...s })) });
      for (const k of ["is", "fs", "to", "kit", "ml"]) stop(k);
      continue;
    }
    const list = spec.stops === "base" ? BASE[tab].concat(spec.tail) : spec.stops;
    const steps = []; let prev = null, plate = "1F";
    for (const [key, title, what, mode] of list) {
      if (key.startsWith("lift:")) {
        const e = E[key.slice(5)]; const hid = 3000 + (Object.keys(E).indexOf(e.label) + 1) + (tab === "inj2" ? 0 : tab === "eps" ? 2 : 3);
        nodes[hid] = { id: hid, x: e.high[0], y: e.high[1], plate: e.highPlate, kind: "lift", mode: "none", fill: "#FFC000", text: e.label + " 2F" };
        steps.push({ node: hid, title, what, path: "lift", mode: "flow", view: "3d", dist: 300, lift: true, elevator: e.label, dwell: 1.0 });
        prev = { key, id: hid, plate: e.highPlate, pt: e.high }; plate = e.highPlate; continue;
      }
      const s = stop(key, prev);
      if (!prev) { steps.push({ node: s.id, title, what, path: null, mode: mode || "flow", view: "2d", dist: 300, dwell: 1.8 }); prev = s; continue; }
      if (s.plate !== prev.plate) { log(`  ${tab}/${spec.id}: ${key} is on ${s.plate} but the trolley is on ${prev.plate}`); failures++; continue; }
      const path = leg(prev.pt, s.pt, s.plate);
      if (!path) { log(`  ${tab}/${spec.id}: NO ROUTE ${prev.key} -> ${key} on ${s.plate}`); failures++; prev = s; continue; }
      const kind = nodes[s.id].kind;
      steps.push({ node: s.id, title, what, path, mode: mode || "flow", view: s.plate === "2F" ? "3d" : "2d", dist: 300, dwell: kind === "result" || kind === "mapping" ? 1.8 : 1.0 });
      prev = s;
    }
    flows.push({ id: spec.id, name: spec.name, color: "#7030A0", steps });
  }
  // devices: every PC symbol and RFID point of the slides that lies on this tab's floors
  const syms = [];
  for (const o of symbols(S1, F1)) if (inZone(d.plates["1F"].zone, o.at)) syms.push({ ...o, plate: "1F" });
  if (d.plates["2F"]) for (const o of symbols(S2, (x, y) => F2(tab, x, y))) if (inZone(d.plates["2F"].zone, o.at)) syms.push({ ...o, plate: "2F" });
  const devices = [], placed = [];
  const allPaths = flows.flatMap((f) => f.steps.filter((s) => Array.isArray(s.path)).map((s) => ({ plate: nodes[s.node].plate, path: s.path })));
  const segDist = (r, a, b) => { // distance from a rectangle to a segment (axis-aligned segment)
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    return Math.hypot(Math.max(r[0] - x1, 0, x0 - r[2]), Math.max(r[1] - y1, 0, y0 - r[3]));
  };
  const nearPath = (plate, p) => { let best = { d: Infinity }; for (const q of allPaths) if (q.plate === plate) for (let i = 1; i < q.path.length; i++) { const a = q.path[i - 1], b = q.path[i], x = Math.max(Math.min(a[0], b[0]), Math.min(p[0], Math.max(a[0], b[0]))), y = Math.max(Math.min(a[1], b[1]), Math.min(p[1], Math.max(a[1], b[1]))), dd = Math.hypot(p[0] - x, p[1] - y); if (dd < best.d) best = { d: dd, pt: [x, y], horiz: Math.abs(a[1] - b[1]) < 1e-9 }; } return best; };
  function ok(dev) {
    const g = gridOf(dev.plate), solids = solidsOf(R, dev.plate);
    for (const r of footprints(dev)) {
      for (const s of solids) if (Math.max(s[0] - r[2], r[0] - s[2], s[1] - r[3], r[1] - s[3]) < 0.3) return false;
      for (const q of allPaths) if (q.plate === dev.plate) for (let i = 1; i < q.path.length; i++) if (segDist(r, q.path[i - 1], q.path[i]) < TURN + 0.4) return false;
      for (const o of placed) if (o.plate === dev.plate) for (const r2 of footprints(o)) if (Math.max(r2[0] - r[2], r[0] - r2[2], r2[1] - r[3], r[1] - r2[3]) < 0.6) return false;
      if (r[0] < g.x0 || r[1] < g.y0 || r[2] > g.x0 + g.W || r[3] > g.y0 + g.H) return false;
    }
    return true;
  }
  const spiral = function* (R0) { yield [0, 0]; for (let r = 1; r <= R0; r += 1) for (let a = 0; a < 360; a += 360 / (8 * r)) yield [Math.round(r * Math.cos(a * Math.PI / 180) * 2) / 2, Math.round(r * Math.sin(a * Math.PI / 180) * 2) / 2]; };
  for (const o of syms) {
    let dev = null;
    if (o.type === "pc") {
      for (const [k, rad] of [[K, 16], [2.0, 16], [1.6, 16], [1.6, 30]]) {
        for (const [dx, dy] of spiral(rad)) {
          const x = o.at[0] + dx, y = o.at[1] + dy, np = nearPath(o.plate, [x, y]), v = np.pt ? [np.pt[0] - x, np.pt[1] - y] : [1, 0];
          const face = Math.abs(v[0]) > Math.abs(v[1]) ? (v[0] > 0 ? "e" : "w") : (v[1] > 0 ? "s" : "n");
          const cand = { type: "pc", kind: o.kind, x: +x.toFixed(2), y: +y.toFixed(2), face, k, plate: o.plate, fill: o.fill, label: o.kind === "result" ? "Prod. Result / GR PC" : o.kind === "mapping" ? "TO Mapping / GI PC" : "Quality PC", sym: o.id };
          if (ok(cand)) { dev = cand; break; }
        }
        if (dev) break;
      }
      // the PC belongs to the stop it serves (lights up when the trolley is there)
      if (dev) { let bn = null, bd = 20; for (const n of Object.values(nodes)) if (n.plate === dev.plate && n.kind === o.kind) { const anchor = n.target || [n.x, n.y]; const dd = n.id === o.id ? 0 : Math.hypot(anchor[0] - o.at[0], anchor[1] - o.at[1]); if (dd < bd) { bd = dd; bn = n; } } if (bn) { dev.node = bn.id; dev.done = bn.kind === "mapping" ? "TO mapped, goods issued" : /Item Slip/.test(bn.text) ? "Item slip printed" : "Final scan / GR done"; } }
    } else if (o.type === "rfid-auto") {
      const np = nearPath(o.plate, o.at);
      if (np.d < 8) { const cand = { type: "rfid-auto", x: +np.pt[0].toFixed(2), y: +np.pt[1].toFixed(2), axis: np.horiz ? "x" : "y", plate: o.plate, label: "Auto RFID gate", sym: o.id }; if (ok({ ...cand })) dev = cand; else { dev = cand; dev.warn = "posts close to a solid"; } }
    } else {
      const np = nearPath(o.plate, o.at), lane = np.d < 10 ? np.pt : o.at;
      for (const k of [K, 2.0, 1.6]) {
        const off = TROLLEY.halfW + 0.9 + 0.2 * k * M + 0.6;
        const sides = np.d < 10 ? (np.horiz ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]) : [[0, 0]];
        placement: for (const [sx, sy] of sides) for (const [dx, dy] of spiral(4)) {
          const x = lane[0] + sx * (off + Math.abs(dx)) + (sx ? 0 : dx), y = lane[1] + sy * (off + Math.abs(dy)) + (sy ? 0 : dy);
          const cand = { type: "rfid-manual", x: +x.toFixed(2), y: +y.toFixed(2), lane: [+lane[0].toFixed(2), +lane[1].toFixed(2)], routeBound: np.d < 10, routeDistance: np.d, k, plate: o.plate, label: "Manual RFID scan", done: "RFID scanned", sym: o.id };
          if (ok(cand)) { dev = cand; break placement; }
        }
        if (dev) break;
      }
    }
    if (dev) { devices.push(dev); placed.push(dev); } else log(`  ${tab}: no room for ${o.type} ${o.id} at ${o.at.map((v) => v.toFixed(0))}`);
  }
  // V5 INJ 1 keeps its stop-based manual scan (node 92)
  for (const dv of devices) if (tab === "inj1" && dv.type === "rfid-manual" && dv.sym === 92) { dv.node = 92; dv.done = "RFID scanned at W/H entry"; }
  const conns = Object.fromEntries(allPaths.map((q, i) => [i, { pts: q.path, color: "#0B76A0" }]));
  OUT[tab] = { nodes, flows, devices, conns };
  report.projects[tab] = { flows: flows.map((f) => `${f.name}: ${f.steps.length} steps`), devices: devices.length, pcs: devices.filter((x) => x.type === "pc").map((x) => x.k), symbols: syms.length };
  log(`${tab}: ${flows.length} paths, ${devices.length}/${syms.length} devices (PC scales ${devices.filter((x) => x.type === "pc").map((x) => x.k).join(",")})`);
}
mkdirSync("private/v6", { recursive: true });
for (const [tab, g] of Object.entries(OUT)) {
  report.projects[tab].paths = g.flows.map(f => ({ id: f.id, nodes: f.steps.map(s => s.node), legs: f.steps.filter(s => Array.isArray(s.path)).map(s => {
    const path = s.path, a = path[0], b = path.at(-1), length = path.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);
    const direct = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    return { node: s.node, length, direct, ratio: direct ? length / direct : 1 };
  }) }));
  for (const d of g.devices) if (d.routeBound === false) report.warnings.push({ tab, symbol: d.sym, problem: "manual RFID symbol is not served by any configured route", distance: d.routeDistance });
  for (const n of Object.values(g.nodes)) if (n.target && Math.hypot(n.x - n.target[0], n.y - n.target[1]) > 8) report.warnings.push({ tab, node: n.id, problem: "stop moved over 8 units from slide target", distance: Math.hypot(n.x - n.target[0], n.y - n.target[1]) });
  for (const f of report.projects[tab].paths) for (const leg of f.legs) if (leg.ratio > 3) report.warnings.push({ tab, flow: f.id, problem: "detour over 3 times Manhattan distance", ...leg });
}
report.failures = failures;
writeFileSync("private/v6/generation-report.json", JSON.stringify(report, null, 2));
if (!failures) { writeFileSync("private/v6/projects.json.tmp", JSON.stringify(OUT)); renameSync("private/v6/projects.json.tmp", "private/v6/projects.json"); }
log(failures ? `FAILED legs: ${failures}; previous projects.json preserved` : "all legs routed");
process.exit(failures ? 1 : 0);
