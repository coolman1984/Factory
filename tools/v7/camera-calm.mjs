// Guided camera calmness: play every path with the guided camera and measure, per path, the camera's turning speed
// (degrees of azimuth per story second: max = 95th percentile and absolute max, avg) and the number of direction changes
// (turn episodes: the azimuth moves more than 10 deg between two calm moments). Use test-camera-v5.mjs for visibility.
// Usage: node tools/v7/camera-calm.mjs <player.html> [--speed 3] [--tabs inj1,inj2,eps,press] [--json out.json]
import { writeFileSync } from "node:fs";
import { openPage } from "./cdp.mjs";
const args = process.argv.slice(2), file = args[0], opt = {}; for (let i = 1; i < args.length; i += 2) opt[args[i].replace(/^--/, "")] = args[i + 1];
const speed = +(opt.speed || 3), tabs = (opt.tabs || "inj1,inj2,eps,press").split(","), out = [];
if (!Number.isFinite(speed) || speed <= 0 || speed > 8 || tabs.some(t => !["inj1","inj2","eps","press"].includes(t))) throw new Error("positive --speed up to 8 and known --tabs required");
for (const tab of tabs) {
  const pg = await openPage(file, tab);
  try {
    if (pg.ev) await pg.ev(`(MF.prepared || Promise.resolve()).then(() => 1)`);
    const n = await pg.ev(`MF.D.flows.length`);
    for (let fi = 0; fi < n; fi++) {
      const r = await pg.ev(`(async () => {
        MF.setFlow(${fi}); MF.setCam("guided"); MF.setSpeed(${speed}); MF.seek(0); MF.play();
        const cam = MF.x.camera, v = new THREE.Vector3(), rows = [];
        await new Promise((done) => { const tick = () => { if (!MF.S.playing) return done();
          cam.getWorldDirection(v); const az = Math.atan2(v.x, v.z), pol = Math.acos(Math.max(-1, Math.min(1, -v.y)));
          rows.push([MF.S.t, az, pol, cam.position.y]); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
        return { id: MF.D.flows[${fi}].id, total: MF.D.flows[${fi}].total, intro: MF.x.INTRO, rows };
      })()`);
      // turning speed per story second, after the intro (the opening rise is a separate, designed move)
      const rates = [], R = r.rows.filter((q) => q[0] > r.intro + 1); let maxAt = 0, maxRate = 0;
      let episodes = 0, acc = 0, moving = false, calm = 0;
      for (let k = 1; k < R.length; k++) {
        const dt = R[k][0] - R[k - 1][0]; if (dt <= 1e-4) continue;
        if (R[k][2] < .2 || R[k - 1][2] < .2) continue;   // looking (nearly) straight down, e.g. into an elevator shaft: the azimuth has no meaning
        let d = R[k][1] - R[k - 1][1]; d = Math.atan2(Math.sin(d), Math.cos(d)); const deg = Math.abs(d) * 180 / Math.PI, rate = deg / dt;
        if (dt < 0.5) { rates.push(rate); if (rate > maxRate) { maxRate = rate; maxAt = R[k][0]; } }
        if (rate > 2) { acc += deg; calm = 0; if (!moving && acc > 10) { moving = true; episodes++; } } else { calm += dt; if (calm > 0.4) { moving = false; acc = 0; } }
      }
      rates.sort((a, b) => a - b);
      const p95 = rates.length ? rates[Math.floor(rates.length * .95)] : 0, max = rates.length ? rates[rates.length - 1] : 0, avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
      const row = { tab, path: r.id, seconds: +(r.total - r.intro).toFixed(1), p95: +p95.toFixed(1), max: +max.toFixed(1), avg: +avg.toFixed(2), changes: episodes, maxAt: +maxAt.toFixed(1), perMin: +(episodes / Math.max(1, (r.total - r.intro) / 60)).toFixed(1) };
      out.push(row); console.log(`${tab.padEnd(5)} ${r.id.padEnd(16)} ${String(row.seconds).padStart(6)} s  turn avg ${row.avg} deg/s, 95% ${row.p95}, max ${row.max} at ${row.maxAt} s; direction changes ${row.changes} (${row.perMin}/min)`);
    }
    if (pg.errors.length) throw new Error(pg.errors.join(" | "));
  } finally { await pg.close(); }
}
if (opt.json) writeFileSync(opt.json, JSON.stringify(out, null, 1));
