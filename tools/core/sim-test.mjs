// Minimum tests of the simulation core (PLATFORM_PLAN P1 section 5.5):
// 1 identity: one carrier, scene timing, no load/unload -> delivery time = `mf numbers` trip time for every path of the 4 scenes
// 2 theory: M/M/1 (arrivals exp 100 s, service exp 60 s) mean wait = 90 s inside the 95 % CI of 30 replications
// 3 M/M/2 (arrivals exp 40 s, service exp 60 s): Erlang C mean wait inside the CI
// 4 determinism: same seed -> identical log; 5 conservation: created = finished + open
// 6 performance: a demo site-week in under 10 s
import { readdirSync, existsSync } from "node:fs";
import { readProjects } from "../v7/scene-node.mjs";
import { numbers } from "../v7/mf-ops.mjs";
import { readFileSync } from "node:fs";
import { MFSim, MFKpi, sceneRoutes, compile } from "./sim-node.mjs";
let bad = 0; const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) bad++; };

// 1 identity
const SC = "private/v7/scenes";
if (existsSync(SC)) {
  const P = readProjects(); let n = 0, worst = 0;
  for (const f of readdirSync(SC).filter((x) => x.endsWith(".scene.json"))) {
    const scene = JSON.parse(readFileSync(`${SC}/${f}`, "utf8")), ref = numbers(scene, P), g = await sceneRoutes(`${SC}/${f}`);
    for (const r of ref) {
      const steps = g.paths[r.id].steps.map((s) => ({ id: s.id, travel: s.travel, dwell: s.dwell, metres: s.metres, lift: null }));
      const log = MFSim.run({ horizon: 1e5, seed: 1, resources: [{ id: "m", count: 1, speed: "scene", windows: null }], flows: [{ id: r.id, pool: ["m"], load: 0, unload: 0, lot: 1, returnTrip: false, trigger: { once: 0 }, steps }] });
      const del = log.events.find((e) => e[1] === MFSim.K.delivered), metres = steps.reduce((a, s) => a + s.metres, 0), d = Math.abs(del[0] - r.seconds), dm = Math.abs(metres - r.metres);
      worst = Math.max(worst, d, dm); n++; if (d > 1e-6 || dm > 1e-6) console.log(`  ${r.id}: sim ${del[0].toFixed(3)} s ${metres.toFixed(2)} m vs numbers ${r.seconds.toFixed(3)} s ${r.metres.toFixed(2)} m`);
    }
  }
  ok(worst < 1e-6, `identity: ${n} paths, delivery time and metres equal mf numbers (worst difference ${worst.toExponential(1)})`);
} else console.log("SKIP identity (no private scenes)");

// 2, 3 queueing theory
function queue(c, arr, svc, reps = 30) {
  const per = [];
  for (let r = 0; r < reps; r++) {
    const log = MFSim.run({ horizon: 400000, warmup: 20000, seed: 100 + r, resources: [{ id: "s", count: c, speed: "scene", windows: null }], flows: [{ id: "q", pool: ["s"], load: 0, unload: 0, lot: 1, returnTrip: false, trigger: { every: { exp: arr } }, steps: [{ id: "x", travel: { exp: svc }, dwell: 0, metres: 0, lift: null }] }] });
    per.push(MFKpi.kpis(log, {}));
  }
  return MFKpi.summarise(per).wait_mover;
}
const w1 = queue(1, 100, 60);
ok(w1.lo <= 90 && 90 <= w1.hi, `M/M/1 mean wait ${w1.mean.toFixed(1)} s, 95% CI [${w1.lo.toFixed(1)}, ${w1.hi.toFixed(1)}], theory 90.0 s`);
// Erlang C for c = 2, lambda = 1/40, mu = 1/60: a = 1.5, rho = 0.75
const a = 1.5, c = 2, rho = a / c, sum = 1 + a, pc = (a ** c / 2) / (1 - rho), C = pc / (sum + pc), wq = C / (c / 60 - 1 / 40);
const w2 = queue(2, 40, 60);
ok(w2.lo <= wq && wq <= w2.hi, `M/M/2 mean wait ${w2.mean.toFixed(1)} s, 95% CI [${w2.lo.toFixed(1)}, ${w2.hi.toFixed(1)}], Erlang C ${wq.toFixed(1)} s`);

// 4, 5, 6 on the demo site
const t0 = Date.now(), Cd = await compile("docs/examples/site-demo/scenarios/base.json");
const L1 = MFSim.run(Cd.input), ms = Date.now() - t0, L2 = MFSim.run(Cd.input);
ok(JSON.stringify(L1) === JSON.stringify(L2), `determinism: two runs with seed ${Cd.input.seed} give identical logs (${L1.events.length} events)`);
const created = L1.events.filter((e) => e[1] === MFSim.K.created).length, done = L1.events.filter((e) => e[1] === MFSim.K.returned).length, openN = MFSim.state(L1, L1.horizon).length;
ok(created === done + openN, `conservation: created ${created} = finished ${done} + open ${openN}`);
ok(ms < 10000, `performance: demo site-week (${Cd.input.horizon / 86400} days) compiled and simulated in ${ms} ms`);
const L3 = MFSim.run({ ...Cd.input, seed: Cd.input.seed + 1 });
ok(JSON.stringify(L3.events) !== JSON.stringify(L1.events), "another seed gives another log");
console.log(bad ? `FAIL ${bad} check(s)` : "PASS all simulation checks");
process.exitCode = bad ? 1 : 0;
