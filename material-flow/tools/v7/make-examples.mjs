// Builds the small example scenes used by docs/RECIPES.md (docs/examples/*.scene.json) with the same operations an agent uses
// (tools/v7/mf-ops.mjs). Run after a layout or format change: node tools/v7/make-examples.mjs [player]
// They are small samples (a few stops, one or two paths), not the owner's working scenes.
import { writeFileSync, mkdirSync } from "node:fs";
import { readProjects, layoutFor } from "./scene-node.mjs";
import { SC, route, straighten, cameraKey, addKey, addCaption, storyStart } from "./mf-ops.mjs";
const player = process.argv[2] || "dist/Material_Flow_Player_v7.7.1.html", P = readProjects(player), clone = (o) => JSON.parse(JSON.stringify(o));
mkdirSync("docs/examples", { recursive: true });
const base = (project, title) => ({ format: "mf-scene", version: 1, project, layout: project, title, stops: [], devices: [], objects: [], layoutEdits: [], paths: [], director: {}, viewpoints: [], notes: "Example for docs/RECIPES.md" });
const save = (name, s) => { const r = SC.validate(s, layoutFor(P, s.project)); if (r.errors.length) throw new Error(`${name}: ${r.errors[0].where}: ${r.errors[0].msg}`); writeFileSync(`docs/examples/${name}.scene.json`, JSON.stringify(s, null, 1) + "\n"); console.log(`docs/examples/${name}.scene.json OK`); };

// 1. the sample: four stops on INJ 1, one path, every leg routed by the engine
const sample = base("inj1", "Sample - INJ 1");
sample.stops = [
  { id: "stop-a", name: "Stop A (start)", floor: "1F", x: 43.5, y: 178.2, symbol: "result", color: "#7030A0" },
  { id: "stop-b", name: "Stop B", floor: "1F", x: 43.5, y: 152.7, symbol: "result", color: "#7030A0" },
  { id: "stop-c", name: "Stop C (buffer)", floor: "1F", x: 74, y: 150, symbol: "area", color: "#1f6feb" },
  { id: "stop-d", name: "Stop D", floor: "1F", x: 90.3, y: 150.3, symbol: "area", color: "#156082" },
];
sample.paths = [{ id: "sample-1", name: "1 · Stop A to Stop D", color: "#1f9d6b", steps: [
  { id: "s1", stop: "stop-a", title: "Start", text: "The trolley starts at Stop A.", mode: "push", wait: 1.5, route: { type: "stay" } },
  { id: "s2", stop: "stop-b", title: "To B", text: "Pushed to Stop B.", mode: "push", wait: 1.5, route: { type: "auto" } },
  { id: "s3", stop: "stop-c", title: "To C", text: "Parked in the buffer.", mode: "push", wait: 2, route: { type: "auto" } },
  { id: "s4", stop: "stop-d", title: "To D", text: "An AGV takes it to Stop D.", mode: "agv", wait: 1.8, route: { type: "auto" } },
] }];
save("sample", sample);

// 2. a second path with a manual scan in the middle (scanner exactly on a routed leg)
{ const s = clone(sample); s.paths.push({ id: "sample-2", name: "2 · Stop D back to Stop B with a scan", color: "#c0392b", steps: [
    { id: "s1", stop: "stop-d", title: "Start at D", mode: "push", route: { type: "stay" } },
    { id: "s2", stop: "stop-b", title: "Back to B", text: "Scanned on the way.", mode: "push", wait: 1.5, route: { type: "auto" } }] });
  const pts = route(s, P, "sample-2", "s2"); let leg = null; for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 8 && (!leg || L > leg.L)) leg = { a, b, L }; }
  const at = [+(leg.a[0] + (leg.b[0] - leg.a[0]) / 2).toFixed(3), +(leg.a[1] + (leg.b[1] - leg.a[1]) / 2).toFixed(3)], vertical = Math.abs(leg.a[0] - leg.b[0]) < 1e-6;
  for (const side of [1, -1]) { s.devices = [{ id: "scanner-mid", type: "scanner", floor: "1F", at, stand: vertical ? [+(at[0] + side * 1.2).toFixed(3), at[1]] : [at[0], +(at[1] + side * 1.2).toFixed(3)], stops: true, label: "Manual RFID scan", done: "RFID scanned" }]; if (!SC.validate(s, layoutFor(P, "inj1")).errors.length) break; }
  save("new-path-with-scan", s); }

// 3. move Stop C 3 m east, re-join and straighten
{ const s = clone(sample); for (const st of s.paths[0].steps) if (st.route.type === "auto" && st.id !== "s1") route(s, P, "sample-1", st.id);
  const c = s.stops.find((q) => q.id === "stop-c"); c.x = +(c.x + 3).toFixed(3);
  for (const id of ["s3", "s4"]) route(s, P, "sample-1", id); straighten(s, P, "sample-1"); save("move-stop", s); }

// 4. devices: a PC serving Stop B, an auto RFID gate on the leg to B, a scanner stand idle beside the aisle
{ const s = clone(sample); s.devices = [
    { id: "pc-b", type: "pc", kind: "result", floor: "1F", x: 41.26, y: 152.98, heading: 90, size: 2.4, label: "Prod. Result / GR PC", serves: "stop-b", done: "Goods receipt done", color: "#7030A0" },
    { id: "gate-ab", type: "rfid-gate", floor: "1F", x: 43.5, y: 167.43, lane: "north-south", label: "Auto RFID gate" }];
  save("devices", s); }

// 5. several trolleys with congestion
{ const s = clone(sample); s.paths[0].trolleys = 3; s.paths[0].headway = 12; save("trolleys", s); }

// 6. camera keys and a caption in three languages
{ const s = clone(sample); const t = storyStart(s, P, "sample-1", "s3", "start");
  addKey(s, "sample-1", cameraKey(s, P, { at: 8, lookAt: "trolley", distance: 50, heading: 30, tilt: 40 }));
  addKey(s, "sample-1", cameraKey(s, P, { at: t, lookAt: "stop:stop-c", distance: 35, heading: 120, tilt: 30, ease: "smooth" }));
  addCaption(s, "sample-1", { from: t, to: t + 4, title: { en: "Buffer", ar: "منطقة الانتظار", ko: "버퍼" }, text: { en: "The trolley waits here.", ar: "تنتظر العربة هنا.", ko: "트롤리가 여기서 대기합니다." }, place: "lower", style: "glass" });
  s.studio = { lang: "ar" };
  s.takes = [{ id: "take-1", name: "Sample film", flow: "sample-1", t0: 0, t1: +(t + 6).toFixed(1), speed: 1, cam: "director", captions: true, card: true, labels: true, quality: "high", fps: 60 }];
  save("director", s); }

// 7. elevator ride (INJ 2: Elev 5 from the 1st to the 2nd floor)
{ const e = P.inj2.data.elevators.find((q) => q.label === "Elev 5"), s = base("inj2", "Sample - INJ 2 elevator");
  s.stops = [
    { id: "start", name: "Start", floor: "1F", x: 175.35, y: 142.05, symbol: "result", color: "#7030A0" },
    { id: "elev-5", name: "Elev 5", floor: "1F", x: +(e.low[0] * .3).toFixed(4), y: +(e.low[1] * .3).toFixed(4), symbol: "lift", color: "#ffc000" },
    { id: "elev-5-2f", name: "Elev 5 (2F)", floor: "2F", x: +(e.high[0] * .3).toFixed(4), y: +(e.high[1] * .3).toFixed(4), symbol: "lift", color: "#ffc000" },
    { id: "wh-2f", name: "W/H 2F", floor: "2F", x: 357.75, y: 179.25, symbol: "area", color: "#156082" }];
  s.layoutEdits = [{ target: "wall:77", move: [0, -0.6], note: "the doorway the owner uses (V7.1)" }];
  s.paths = [{ id: "up", name: "1 · Start to Elev 5 to the 2nd floor", color: "#ffc000", steps: [
    { id: "s1", stop: "start", title: "Start", route: { type: "stay" } },
    { id: "s2", stop: "elev-5", title: "To Elev 5", text: "Through the doorway (auto would take a 300 m detour: the router keeps wider margins at corners).", route: { type: "points", points: [[175.35, 142.05], [172.5, 142.05], [172.5, 148.1], [158.55, 148.1], [158.55, 160.5], [156.6, 160.5]] } },
    { id: "s3", stop: "elev-5-2f", title: "Elev 5 up", text: "Elevator 5 carries the trolley up.", route: { type: "elevator", elevator: "Elev 5" } },
    { id: "s4", stop: "wh-2f", title: "To W/H 2F", route: { type: "auto" } }] }];
  save("elevator", s); }

// 8. a doorway cut into a wall (EPS 2nd floor: straight west from TO Mapping to Main Line)
{ const s = base("eps", "Sample - EPS doorway");
  s.stops = [{ id: "to-2f", name: "TO Mapping / GI 2F", floor: "2F", x: 362.25, y: 61.65, symbol: "mapping", color: "#00B0F0" }, { id: "main-line", name: "To Main Line", floor: "2F", x: 286.05, y: 69.15, symbol: "dest", color: "#156082" }];
  s.layoutEdits = [{ target: "wall:165", door: [61.65, 65.25] }, { target: "wall:170", door: [61.65, 65.25] }];
  s.paths = [{ id: "west", name: "1 · TO to Main Line through two doors", color: "#7030A0", steps: [
    { id: "s1", stop: "to-2f", title: "TO Mapping", route: { type: "stay" } },
    { id: "s2", stop: "main-line", title: "To Main Line", route: { type: "points", points: [[362.25, 61.65], [362.25, 63.45], [290.55, 63.45], [290.55, 69.15], [286.05, 69.15]] } }] }];
  save("door", s); }
