// More than 8 auto RFID gates: puts 24 gates on INJ 1 (on the legs of path 1, every few metres) and checks that the wave
// shader compiles, every gate reads the passing trolley (also gates past number 8) and nothing errors.
// Usage: node tools/v7/gates-test.mjs [player=dist/Material_Flow_Player_v7.1.html]
import { readFileSync } from "node:fs";
import { openPage } from "./cdp.mjs";

const player = process.argv[2] || "dist/Material_Flow_Player_v7.1.html", s = JSON.parse(readFileSync("private/v7/scenes/inj1.scene.json", "utf8"));
s.devices = s.devices.filter((d) => d.type !== "rfid-gate");
const legs = s.paths[0].steps.filter((st) => st.route.type === "points").flatMap((st) => st.route.points.slice(1).map((b, k) => [st.route.points[k], b]));
let n = 0;
for (const [a, b] of legs) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let u = 3; u < L - 3 && n < 24; u += 4) { const x = a[0] + (b[0] - a[0]) * u / L, y = a[1] + (b[1] - a[1]) * u / L; s.devices.push({ id: "gate-test-" + ++n, type: "rfid-gate", floor: "1F", x, y, lane: Math.abs(a[0] - b[0]) < 1e-6 ? "north-south" : "east-west" }); } }
const pg = await openPage(player, "inj1");
let code = 0;
try {
  const r = await pg.ev(`(async () => { MFS.load(${JSON.stringify(s)}, { force: true }); MF.setFlow(0); MF.setSpeed(3); MF.play(); await new Promise(r => setTimeout(r, 9000));
    const reads = MF.devices.state.reads[0], gates = new Set(reads.map(r => r.gate)); return { gates: MF.devices.gates.length, readsTotal: reads.length, gatesRead: gates.size, maxGate: Math.max(...gates), glErr: MF.x.renderer.getContext().getError(), waves: MF.devices.effects.filter(e => e.name.startsWith("MF V5 RFID")).length }; })()`);
  console.log(JSON.stringify(r));
  const ok = r.gates === n && r.gatesRead === n && r.maxGate === n - 1 && r.glErr === 0 && !pg.errors.length;
  if (!ok) code = 1; console.log(ok ? `PASS: ${n} gates, all read, shader OK` : "FAIL", pg.errors.slice(0, 3));
} finally { await pg.close(); }
process.exit(code);
