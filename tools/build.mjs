// Builds dist/Material_Flow_Player.html: ONE file with the player, three.js, the flow data and the plans inside.
// Everything is inlined because a page opened from disk cannot load images into WebGL or fetch JSON.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const at = (p) => new URL("../" + p, import.meta.url);
const read = (p) => readFileSync(at(p), "utf8");
const three = readFileSync("D:/WORK/Software Development/GitHub/Digital- Factory/assets/vendor/three/three.iife.min.js", "utf8");
const data = JSON.parse(read("private/inj.json"));
const plans = {};
for (const P of Object.values(data.plates)) for (const pic of P.pics) plans[pic.file] = "data:image/png;base64," + readFileSync(at(`private/plans/${pic.file}.png`)).toString("base64");
const put = (html, mark, text) => html.split(mark).join(text);   // split/join: the inserted text may hold $ signs
let html = read("src/index.template.html");
html = put(html, "/*CSS*/", read("src/player.css"));
html = put(html, "/*THREE*/", three.replace(/<\/script/gi, "<\\/script"));
html = put(html, "/*EXTRAS*/", readFileSync("D:/WORK/Software Development/GitHub/Digital- Factory/assets/vendor/three/three-extras.iife.min.js", "utf8").replace(/<\/script/gi, "<\\/script"));
const light = Object.fromEntries(["E1", "E2-1F", "E2-2F"].map((k) => [k, "data:image/jpeg;base64," + readFileSync(at(`private/bake/${k}.jpg`)).toString("base64")]));
html = put(html, "/*LIGHT*/", JSON.stringify(light));
html = put(html, "/*TROLLEY*/", JSON.stringify(readFileSync(at("private/assets/trolley.glb")).toString("base64")));
html = put(html, "/*DATA*/", JSON.stringify(data));
html = put(html, "/*REPLICA*/", read("private/replica.json"));
html = put(html, "/*PLANS*/", JSON.stringify(plans));
html = put(html, "/*ATMOS*/", readFileSync("D:/WORK/Software Development/GitHub/Digital- Factory/assets/js/vfx/atmos.js", "utf8"));
html = put(html, "/*REPLICAJS*/", read("src/replica.js"));
html = put(html, "/*LOOK*/", read("src/look.js"));
html = put(html, "/*PLAYER*/", read("src/player.js"));
mkdirSync(at("dist/"), { recursive: true });
writeFileSync(at("dist/Material_Flow_Player.html"), html);
console.log(`dist/Material_Flow_Player.html ${(html.length / 1024 / 1024).toFixed(1)} MB`);
