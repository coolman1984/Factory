// Proof that V7 plays the scene files exactly like V6: for every tab and every path, the step timeline, the trolley pose sampled
// every 0.1 s of story time, every RFID read / scan window and the label of every stop are compared between the two players.
// Usage: node tools/v7/identity-test.mjs [v6=dist/Material_Flow_Player_v6.html] [v7=dist/Material_Flow_Player_v7.1.html]
import { openPage } from "./cdp.mjs";

const [a = "dist/Material_Flow_Player_v6.html", b = "dist/Material_Flow_Player_v7.1.html"] = process.argv.slice(2);
const PROBE = `(() => { const out = { flows: [] };
  for (let fi = 0; fi < MF.D.flows.length; fi++) { MF.setFlow(fi); const f = MF.D.flows[fi], poses = [];
    for (let t = 0; t <= f.total + 1e-9; t += 0.1) { const p = MF.lotPose(t); poses.push([+p.x.toFixed(6), +p.y.toFixed(6), +p.h.toFixed(6), p.lift == null ? -1 : +p.lift.toFixed(6), p.it.i]); }
    out.flows.push({ id: f.id, name: f.name, total: +f.total.toFixed(6), timeline: f.items.map(it => [it.i, +it.t0.toFixed(6), +it.tm.toFixed(6), +it.t1.toFixed(6), it.s.title]), poses,
      reads: MF.devices.state.reads[fi], scans: MF.devices.state.scans[fi].map(s => ({ start: +s.start.toFixed(6), end: +s.end.toFixed(6) })),
      chips: Object.values(MF.D.nodes).map(n => [n.text, +n.x.toFixed(6), +n.y.toFixed(6), n.kind]) }); }
  out.devices = MF.D.devices.map(d => [d.type, +d.x.toFixed(6), +d.y.toFixed(6), d.face || "", d.label]); return out; })()`;
let fail = 0;
for (const tab of ["inj1", "inj2", "eps", "press"]) {
  const res = [];
  for (const file of [a, b]) { const pg = await openPage(file, tab); try { res.push(await pg.ev(PROBE)); if (pg.errors.length) { fail++; console.log(file, tab, "page errors:", pg.errors.slice(0, 3)); } } finally { await pg.close(); } }
  const [A, B] = res, diffs = [];
  if (A.flows.length !== B.flows.length) diffs.push(`path count ${A.flows.length} vs ${B.flows.length}`);
  A.flows.forEach((fa, i) => {
    const fb = B.flows[i]; if (!fb) return;
    if (fa.total !== fb.total) diffs.push(`${fa.id}: total ${fa.total} vs ${fb.total}`);
    if (JSON.stringify(fa.timeline) !== JSON.stringify(fb.timeline)) diffs.push(`${fa.id}: step timeline differs`);
    let worst = 0; fa.poses.forEach((p, k) => { const q = fb.poses[k]; if (!q) { worst = Infinity; return; } worst = Math.max(worst, Math.hypot(p[0] - q[0], p[1] - q[1]), Math.abs(p[2] - q[2]), Math.abs(p[3] - q[3]), p[4] === q[4] ? 0 : Infinity); });
    if (worst > 1e-5) diffs.push(`${fa.id}: trolley pose differs by up to ${worst}`);
    if (JSON.stringify(fa.reads) !== JSON.stringify(fb.reads)) diffs.push(`${fa.id}: RFID reads differ`);
    if (JSON.stringify(fa.scans) !== JSON.stringify(fb.scans)) diffs.push(`${fa.id}: scan windows differ`);
    if (JSON.stringify(fa.chips) !== JSON.stringify(fb.chips)) diffs.push(`${fa.id}: stops / labels differ`);
    console.log(`${tab} ${fa.id}: ${fa.timeline.length - 1} steps, ${fa.total.toFixed(2)} s, ${fa.poses.length} poses, ${(fa.reads || []).length} reads, ${fa.scans.length} scans`);
  });
  if (JSON.stringify(A.devices) !== JSON.stringify(B.devices)) diffs.push("devices differ");
  if (diffs.length) { fail += diffs.length; console.log(`${tab}: DIFFERENT\n  ` + diffs.join("\n  ")); } else console.log(`${tab}: identical`);
}
console.log(fail ? `FAIL: ${fail} difference(s)` : "PASS: all paths play identically from the scene files");
process.exit(fail ? 1 : 0);
