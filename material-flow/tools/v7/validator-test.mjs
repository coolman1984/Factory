// Plants one fault at a time in a valid scene and checks the validator reports it (and that the clean scene passes).
// Usage: node tools/v7/validator-test.mjs [player=dist/Material_Flow_Player_v7.1.html]
import { readFileSync } from "node:fs";
import { loadSceneCore, readProjects, layoutFor } from "./scene-node.mjs";

const player = process.argv[2] || "dist/Material_Flow_Player_v7.1.html", SC = loadSceneCore(), P = readProjects(player);
const base = JSON.parse(readFileSync("private/v7/scenes/inj1.scene.json", "utf8")), clone = (o) => JSON.parse(JSON.stringify(o));
const L0 = layoutFor(P, "inj1"), rack = L0.replica.racks.map((o) => ({ cx: (o.x + o.w / 2) * .3, cy: (o.y + o.h / 2) * .3 })).sort((a, b) => Math.hypot(a.cx - 51, a.cy - 202) - Math.hypot(b.cx - 51, b.cy - 202))[0];
const run = (s) => SC.validate(s, layoutFor(P, s.project));
// Choose an in-floor point independently outside every routed segment's bounding rectangle.
function plantOffRoute(s) {
  const d=s.devices.find(x=>x.type==="scanner"&&x.stops),L=layoutFor(P,s.project),data=SC.toInternal(clone(s),L).data;
  const z=L.plates[d.floor].zone, paths=data.flows.flatMap(f=>f.steps.filter(st=>Array.isArray(st.path)&&(data.nodes[st.node]||{}).plate===d.floor).flatMap(st=>st.path.slice(1).map((b,i)=>[st.path[i],b])));
  for(let i=1;i<20;i++)for(let j=1;j<20;j++){
    const x=z[0]+(z[2]-z[0])*i/20,y=z[1]+(z[3]-z[1])*j/20;
    if(paths.every(([a,b])=>x<Math.min(a[0],b[0])-.1||x>Math.max(a[0],b[0])+.1||y<Math.min(a[1],b[1])-.1||y>Math.max(a[1],b[1])+.1)){d.at=[x*.3,y*.3];return;}
  }
  throw new Error("no in-floor off-route fault point");
}
const cases = [
  ["clean scene passes", (s) => s, (r) => r.errors.length === 0],
  ["added block on a path", (s) => { const step = s.paths[0].steps.find(t => t.route?.type === "points"); const [a, b] = step.route.points; const stop = s.stops.find(t => t.id === step.stop); (s.layoutAdds ||= []).push({ id: "planted-block", kind: "machine", floor: stop.floor, x: (a[0] + b[0]) / 2 - 1, y: (a[1] + b[1]) / 2 - 1, w: 2, d: 2 }); }, (r) => r.errors.some(e => /paths\[/.test(e.where) && /hits|passes/.test(e.msg) && /machine:/.test(e.msg))],
  ["bad added kind is exactly one error", (s) => { (s.layoutAdds ||= []).push({ id: "planted-kind", kind: "unknown", floor: s.stops[0].floor, x: 1, y: 1, w: 1, d: 1 }); }, (r) => r.errors.length === 1 && r.errors[0].where === "layoutAdds[planted-kind].kind"],
  ["path straight through the warehouse racks", (s) => { const st = s.paths[0].steps[3]; const a = s.paths[0].steps[2].route.points.at(-1), stop = s.stops.find((x) => x.id === st.stop); st.route = { type: "points", points: [a, [rack.cx, a[1]], [rack.cx, rack.cy], [stop.x, rack.cy], [stop.x, stop.y]] }; }, (r) => r.errors.some((e) => /hits|passes/.test(e.msg))],
  ["unknown stop", (s) => { s.paths[0].steps[2].stop = "nowhere"; }, (r) => r.errors.some((e) => /unknown stop/.test(e.msg))],
  ["speed out of range", (s) => { s.paths[0].steps[1].speed = 40; }, (r) => r.errors.some((e) => /0.2 to 8/.test(e.msg))],
  ["path does not start where the previous step ended", (s) => { s.paths[0].steps[2].route.points[0] = [40, 150]; }, (r) => r.errors.some((e) => /previous step ends/.test(e.msg))],
  ["path does not end at its stop", (s) => { const p = s.paths[0].steps[1].route.points; p[p.length - 1] = [43.5, 160]; }, (r) => r.errors.some((e) => /last point must be the stop/.test(e.msg))],
  ["\"stay\" while the trolley is elsewhere", (s) => { s.paths[0].steps[2].route = { type: "stay" }; }, (r) => r.errors.some((e) => /stay/.test(e.msg))],
  ["duplicate id", (s) => { s.stops[1].id = s.stops[0].id; }, (r) => r.errors.some((e) => /duplicate id/.test(e.msg))],
  ["scanner stop off every path", plantOffRoute, (r) => r.errors.some((e) => /off every path/.test(e.msg))],
  ["PC overlapping a rack", (s) => { const d = s.devices.find((x) => x.type === "pc"); d.x = rack.cx; d.y = rack.cy; }, (r) => r.errors.some((e) => /overlaps/.test(e.msg))],
  ["unknown floor", (s) => { s.stops[0].floor = "3F"; }, (r) => r.errors.some((e) => /unknown floor/.test(e.msg))],
  ["point outside the floor", (s) => { s.stops[0].x = 900; }, (r) => r.errors.some((e) => /outside floor/.test(e.msg))],
  ["elevator that does not exist", (s) => { s.paths[0].steps[2].route = { type: "elevator", elevator: "Elev 99" }; }, (r) => r.errors.some((e) => /unknown elevator/.test(e.msg))],
  ["bad colour", (s) => { s.paths[0].color = "green"; }, (r) => r.errors.some((e) => /colour/.test(e.msg))],
  ["unknown layout object", (s) => { s.layoutEdits = [{ target: "rack:99999", delete: true }]; }, (r) => r.errors.some((e) => /unknown layout object/.test(e.msg))],
  ["wrong format", (s) => { s.format = "something"; }, (r) => r.errors.some((e) => e.where === "format")],
];
let fail = 0;
for (const [name, mutate, ok] of cases) {
  const s = clone(base); mutate(s); const r = run(s), pass = ok(r);
  if (!pass) fail++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${r.errors[0] && name !== "clean scene passes" ? "  ->  " + r.errors[0].where + ": " + r.errors[0].msg : ""}`);
}
console.log(fail ? `${fail} case(s) FAILED` : `All ${cases.length} cases behave as expected`);
process.exit(fail ? 1 : 0);
