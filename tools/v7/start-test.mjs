// 10 fresh browser starts: after the preparing screen, play the opening at 1x and count visible stutter in the first 10 s
// (a start "stutters" when any frame takes over 100 ms or more than 3 frames take over 50 ms).
// Usage: node tools/v7/start-test.mjs [player=dist/Material_Flow_Player_v7.7.1.html] [runs=10]
import { openPage } from "./cdp.mjs";
const [file = "dist/Material_Flow_Player_v7.7.1.html", runs = "10"] = process.argv.slice(2);
const tabs = (process.argv[4] || "inj1,inj2,eps,press").split(","); let bad = 0;
for (let i = 0; i < +runs; i++) {
  const tab = tabs[i % tabs.length], pg = await openPage(file, tab);
  try {
    const r = await pg.ev(`(async () => { const prep = await MF.prepared; MF.setFlow(0); MF.seek(0); MF.setSpeed(1); MF.play(); const iv = [], at = []; let last = performance.now(); const t0 = last;
      await new Promise(done => { (function f(now) { iv.push(now - last); at.push(+MF.S.t.toFixed(2)); last = now; if (now - t0 < 10000) requestAnimationFrame(f); else done(); })(performance.now()); });
      iv.shift(); at.shift(); const slowAt = iv.map((x, k) => x > 50 ? at[k] + "s/" + Math.round(x) : null).filter(Boolean); return { slowAt, prep, frames: iv.length, over50: iv.filter(x => x > 50).length, worst: Math.round(Math.max(...iv)), fps: +(iv.length / 10).toFixed(1), t: +MF.S.t.toFixed(1) }; })()`);
    const stutter = r.worst > 100 || r.over50 > 3; if (stutter) bad++;
    console.log(`start ${i + 1} ${tab}: ${stutter ? "STUTTER" : "smooth"} - prep ${r.prep.ms} ms${r.prep.skipped ? " (rise skipped)" : ""}, ${r.fps} fps, worst ${r.worst} ms, frames over 50 ms: ${r.over50}${r.slowAt.length ? " at " + r.slowAt.join(" ") : ""}`);
  } finally { await pg.close(); }
}
console.log(`${bad} of ${runs} starts with visible stutter`); process.exitCode = bad ? 1 : 0;
