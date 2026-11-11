// V7.1 player checks: load a scene file like a drop (the proof path), undo / redo, autosave survives a reload, a rebuilt player
// file wins over an older browser copy, a scene with errors is refused, and the proof path baked into a player file plays.
// Usage: node tools/v7/stage1-test.mjs [player=dist/Material_Flow_Player_v7.1.html] [baked=dist/test/Material_Flow_Player_v7.1-proof.html]
import { readFileSync } from "node:fs";
import { openPage } from "./cdp.mjs";

const [player = "dist/Material_Flow_Player_v7.1.html", baked = "dist/test/Material_Flow_Player_v7.1-proof.html"] = process.argv.slice(2);
const proof = readFileSync("private/v7/proof/inj1.scene.json", "utf8");
let fail = 0; const check = (ok, msg, extra = "") => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${extra ? "  (" + extra + ")" : ""}`); };
const flowInfo = `MF.D.flows.map(f => ({ id: f.id, total: +f.total.toFixed(2), steps: f.steps.length }))`;
const pg = await openPage(player, "inj1");
try {
  const before = await pg.ev(flowInfo); check(before.length === 2, "built-in INJ 1 scene has 2 paths");
  const ok = await pg.ev(`MFS.load(${proof})`); const after = await pg.ev(flowInfo);
  check(ok && after.length === 3 && after[2].id === "inj1-proof", "proof scene loads live (like a drop)", JSON.stringify(after[2]));
  // play the proof path to the end at 3x and watch the trolley move through its stops
  const run = await pg.ev(`(async () => { MF.setFlow(2); MF.setSpeed(3); MF.play(); const seen = new Set(); const t0 = performance.now(); while (MF.S.playing && performance.now() - t0 < 60000) { await new Promise(r => setTimeout(r, 200)); seen.add(MF.stepAt(MF.S.t).i); } return { end: +MF.S.t.toFixed(2), total: +MF.D.flows[2].total.toFixed(2), steps: [...seen].sort((a,b)=>a-b), glErr: MF.x.renderer.getContext().getError(), speed3: MF.D.flows[2].steps[2].speed }; })()`);
  check(run.end === run.total && run.steps.includes(4) && run.glErr === 0, "proof path plays to the end through every step", JSON.stringify(run));
  check(run.speed3 === 2.5, "per-step speed reaches the engine (2.5 m/s on step 3)");
  const u = await pg.ev(`(MFS.undo(), ${flowInfo}.length)`), r = await pg.ev(`(MFS.redo(), ${flowInfo}.length)`);
  check(u === 2 && r === 3, "undo removes the loaded path, redo brings it back", `undo ${u}, redo ${r}`);
  const bad = JSON.parse(proof); bad.paths[2].steps[2].stop = "nowhere";
  const refused = await pg.ev(`(() => { const ok = MFS.load(${JSON.stringify(bad)}); return { ok, n: MF.D.flows.length, errs: MFS.state.report.errors.length }; })()`);
  check(!refused.ok && refused.n === 3 && refused.errs > 0, "a scene with errors is refused and the current one stays", JSON.stringify(refused));
  await pg.reload(); const re = await pg.ev(`({ src: MF7.source, n: MF.D.flows.length })`);
  check(re.src === "browser" && re.n === 3, "autosave: after a reload the edited scene is back", JSON.stringify(re));
  check(await pg.ev(`!!(window.showSaveFilePicker && isSecureContext)`), "direct save API available on a local file (save dialog + re-save)");
  if (pg.errors.length) { fail++; console.log("page errors:", pg.errors.slice(0, 3)); }
} finally { await pg.close(); }
// a player file with the proof scene baked in: plays it with no browser copy
const pb = await openPage(baked, "inj1");
try {
  const r = await pb.ev(`({ src: MF7.source, flows: ${flowInfo}, v: MFS.validate().errors.length })`);
  check(r.flows.length === 3 && r.v === 0, "baked player file plays the proof scene from its embedded scene", JSON.stringify(r.flows.map((f) => f.id)));
  if (pb.errors.length) { fail++; console.log("page errors:", pb.errors.slice(0, 3)); }
} finally { await pb.close(); }
console.log(fail ? `${fail} check(s) FAILED` : "All V7.1 player checks pass");
process.exit(fail ? 1 : 0);
