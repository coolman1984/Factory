// Builds dist/Material_Flow_Player.html: ONE file with the player, three.js, the flow data and the plans inside.
// Everything is inlined because a page opened from disk cannot load images into WebGL or fetch JSON.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
const at = (p) => new URL("../" + p, import.meta.url);
const read = (p) => readFileSync(at(p), "utf8");
const three = readFileSync("D:/WORK/Software Development/GitHub/Digital- Factory/assets/vendor/three/three.iife.min.js", "utf8");
// Projects (product lines), each from private/projects/<id>/: routed/ (tools/routes.mjs output) when present, else the lane's raw data.
const TABS = { inj: "Injection", press: "Press", eps: "EPS" }, projects = {};
const b64 = (p) => readFileSync(at(p)).toString("base64");
for (const [id, tab] of Object.entries(TABS)) {
  const dir = `private/projects/${id}/`, src = existsSync(at(dir + "routed/flow.json")) ? dir + "routed/" : dir;
  if (!existsSync(at(dir + "flow.json"))) { console.log(`skip ${id}: no ${dir}flow.json`); continue; }
  const data = JSON.parse(read(src + "flow.json")), replica = JSON.parse(read(src + "replica.json"));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, main = null;
  for (const P of Object.values(data.plates)) {
    P.zone = P.box;   // the player keeps "box" for the drawn extent; "zone" decides which plate owns a point
    x0 = Math.min(x0, P.box[0]); y0 = Math.min(y0, P.box[1]); x1 = Math.max(x1, P.box[2]); y1 = Math.max(y1, P.box[3]);
    const area = (P.box[2] - P.box[0]) * (P.box[3] - P.box[1]); if (!P.lift && (!main || area > main.area)) main = { area, b: P.box };
  }
  if (id === "inj") {   // Injection keeps the frame, plate rule, cameras and roofs its camera tests were tuned on
    data.plates.E1.zone = [-1e4, -1e4, 553, 1e4]; data.plates["E2-1F"].zone = [553, 303, 1e4, 1e4]; data.plates["E2-2F"].zone = [553, -1e4, 1e4, 303];
    data.cameras = { e1: { label: "E1-1F", at: [285, 330, 640, -.4, .9] }, e21: { label: "E2-1F", at: [730, 373, 520, .35, .95] }, e22: { label: "E2-2F", at: [835, 223, 420, -.5, 1] },
      machines: { label: "Injection machines", at: [75, 215, 300, -1.05, 1.16] }, docks: { label: "Loading docks", at: [290, 440, 340, .55, 1.2] }, racks: { label: "Rack field", at: [320, 330, 300, -.25, 1.25] } };
    replica.roofs = [["E1", 49, 157, 500, 303, 8.3], ["E2-1F", 625, 305, 285, 133, 8.3], ["E2-2F", 727, 149, 172, 146, 6.8]];
  } else {
    data.center = [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)];
    data.fit = [Math.max(200, (y1 - y0) / 2 * 1.9), Math.max(300, (x1 - x0) / 2 * 1.2)];
    data.lampArea = [main.b[0] + 30, main.b[1] + 30, main.b[2] - 30, main.b[3] - 30];
  }
  const plans = {};
  for (const P of Object.values(data.plates)) for (const pic of P.pics) plans[pic.file] = "data:image/png;base64," + b64(`${dir}plans/${pic.file}.png`);
  const light = {};
  if (id === "inj") for (const k of Object.keys(data.plates)) if (existsSync(at(`private/bake/${k}.jpg`))) light[k] = "data:image/jpeg;base64," + b64(`private/bake/${k}.jpg`);
  projects[id] = { tab, data, replica, plans, light };
  console.log(`${id}: ${src}, plates ${Object.keys(data.plates).length}, flows ${data.flows.length}`);
}
const put = (html, mark, text) => html.split(mark).join(text);   // split/join: the inserted text may hold $ signs
let html = read("src/index.template.html");
html = put(html, "/*CSS*/", read("src/player.css"));
html = put(html, "/*THREE*/", three.replace(/<\/script/gi, "<\\/script"));
html = put(html, "/*EXTRAS*/", readFileSync("D:/WORK/Software Development/GitHub/Digital- Factory/assets/vendor/three/three-extras.iife.min.js", "utf8").replace(/<\/script/gi, "<\\/script"));

html = put(html, "/*TROLLEY*/", JSON.stringify(readFileSync(at("private/assets/trolley.glb")).toString("base64")));
html = put(html, "/*PROJECTS*/", JSON.stringify(projects).replace(/<\/script/gi, "<\\/script"));
html = put(html, "/*ATMOS*/", readFileSync("D:/WORK/Software Development/GitHub/Digital- Factory/assets/js/vfx/atmos.js", "utf8"));
html = put(html, "/*REPLICAJS*/", "window.MF_ASSETS=" + read("private/assets/assets.json") + ";\n" + read("src/replica.js"));
html = put(html, "/*LOOK*/", read("src/look.js"));
html = put(html, "/*PLAYER*/", read("src/camera-envelope.js") + "\n" + read("src/player.js"));
mkdirSync(at("dist/"), { recursive: true });
writeFileSync(at("dist/Material_Flow_Player.html"), html);
console.log(`dist/Material_Flow_Player.html ${(html.length / 1024 / 1024).toFixed(1)} MB`);
