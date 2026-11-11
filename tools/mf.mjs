#!/usr/bin/env node
// mf - the agent CLI of the Material Flow scene engine. One verb per job; short, exact output; exit code 0 = OK, 1 = problem.
// Every Studio button has a verb here or a field in the scene file (docs/CONTROL_GUIDES, docs/RECIPES.md).
// Usage: node tools/mf.mjs <verb> [args]   (node tools/mf.mjs help)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
const require_fs = () => ({ copyFileSync });
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readProjects, layoutFor } from "./v7/scene-node.mjs";
import { SC, numbers, tripsPerShift, straighten, route, fixLinks, cameraKey, addKey, addCaption, diff, storyStart } from "./v7/mf-ops.mjs";

import { STAGE, COMMANDS } from "./v7/mf-commands.mjs";
const PLAYER = `dist/Material_Flow_Player_v${STAGE}.html`, SCENES = "private/v7/scenes";
const argv = process.argv.slice(2), verb = argv[0], pos = [], opt = {};
for (let i = 1; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) { const k = a.slice(2), v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; opt[k] = v; } else pos.push(a); }
const die = (m) => { console.log("ERROR " + m); process.exit(1); };
const readScene = (f) => { if (!f || !existsSync(f)) die(`scene file not found: ${f}`); try { const s = JSON.parse(readFileSync(f, "utf8")); if (s.format !== "mf-scene") die(`${f}: not a scene file (format must be "mf-scene")`); return s; } catch (e) { die(`${f}: ${e.message}`); } };
const writeScene = (f, s) => { writeFileSync(f, JSON.stringify(s, null, 1) + "\n"); console.log(`wrote ${f}`); };
const projects = () => { const p = opt.player || PLAYER; if (!existsSync(p)) die(`player not found: ${p} (build it: node tools/build-v7.mjs ${STAGE})`); return readProjects(p); };
// path tools: write when the edited path / step itself is clean; errors elsewhere (another path still broken after a stop moved)
// are listed but do not block, so several paths can be repaired one at a time (or all at once with fix-links)
const writeIfOwnClean = (f, s, P, pathId, stepId) => {
  const pathWhere = `paths[${pathId}]`, stepWhere = pathWhere + `.steps[${stepId}]`;
  const r = SC.validate(s, layoutFor(P, s.project)), mine = r.errors.filter((e) => !e.where.startsWith("paths[") || (e.where.startsWith(pathWhere) && (!stepId || !e.where.startsWith(pathWhere + ".steps[") || e.where.startsWith(stepWhere))));
  if (mine.length) { for (const e of mine) console.log(`ERROR ${e.where}: ${e.msg}`); die(`not written: ${mine.length} error(s) in ${pathId}${stepId ? "/" + stepId : ""}`); }
  writeScene(f, s); const rest = r.errors.length; if (rest) { for (const e of r.errors) console.log(`STILL OPEN ${e.where}: ${e.msg}`); console.log(`written; ${rest} error(s) remain in other paths (fix them next, or run fix-links)`); }
};
// one picture at story second t: free camera above `look` ([x, y] metres; null = the lead trolley), distance metres, tilted 50 deg
async function shotAt(pg, pi, t, look, distance, file) {
  await pg.ev(`(() => { MFX.setPad(false); MF.setFlow(${pi}); MF.seek(${Math.max(0, t)}); MF.pause(); let x, y; ${look ? `x = ${look[0]} / .3; y = ${look[1]} / .3;` : `const p = MF.lotPose(MF.S.t); x = p.x; y = p.y;`}
    const w = MF.W(x, y, MF.S.stack, 0); MF.setCam("free"); Object.assign(MF.S.c, { x: w.x, y: w.y, z: w.z, dist: ${distance} / .3, az: 0, pol: .7 }); MFX.cam.inited = false; return 1; })()`);
  await pg.wait(1800); const r = await pg.call("Page.captureScreenshot", { format: "png" }); writeFileSync(file, Buffer.from(r.data, "base64"));
}
const validateOrDie = (s, P, label = "scene") => { const r = SC.validate(s, layoutFor(P, s.project)); if (r.errors.length) { for (const e of r.errors) console.log(`ERROR ${e.where}: ${e.msg}`); die(`${label} has ${r.errors.length} error(s)`); } return r; };
// a player file with this scene baked in (other tabs from private/v7/scenes), for screenshots, play checks and takes
function bakeTemp(sceneFile, s) {
  mkdirSync("dist/test", { recursive: true }); const out = `dist/test/mf-${s.project}.html`, others = existsSync(SCENES) ? readdirSync(SCENES).filter((f) => f.endsWith(".scene.json") && !f.startsWith(s.project + ".")).map((f) => `${SCENES}/${f}`) : [];
  execFileSync(process.execPath, ["tools/build-v7.mjs", STAGE, "--out", out, "--no-docs-check", "--bake", sceneFile, ...others], { stdio: "pipe" }); return out;
}
async function page(file, tab) { const { openPage } = await import("./v7/cdp.mjs"); return openPage(file, tab, { size: opt.size || "1600,900" }); }



const run = {
  help() { console.log("node tools/mf.mjs <verb> ...\n"); for (const [k, [a, d]] of Object.entries(COMMANDS)) console.log(`  ${k} ${a}\n      ${d}`); },
  validate() { if (!pos.length) die("validate <scene.json>"); const P = projects(); let bad = 0; for (const f of pos) { const s = readScene(f); if (!P[s.project]) die(`${f}: project ${s.project} is not a tab of the player`); const r = SC.validate(s, layoutFor(P, s.project)); console.log(`${f}: ${r.errors.length ? "FAIL" : "OK"} ${r.errors.length} error(s), ${r.warnings.length} warning(s)`); for (const e of r.errors) console.log(`  ERROR ${e.where}: ${e.msg}`); for (const w of r.warnings) console.log(`  warning ${w.where}: ${w.msg}`); if (r.errors.length) bad++; } process.exitCode = bad ? 1 : 0; },
  bake() { const args = ["tools/build-v7.mjs", STAGE]; if (opt.out) args.push("--out", opt.out); if (pos.length) args.push("--bake", ...pos); try { console.log(execFileSync(process.execPath, args, { encoding: "utf8" }).trim().split("\n").pop()); } catch (e) { die((e.stdout || "") + (e.stderr || e.message)); } },
  numbers() { const s = readScene(pos[0]), P = projects(), shift = +(opt.shift || 8); for (const n of numbers(s, P)) { console.log(`${n.id}: ${n.metres.toFixed(1)} m, ${n.seconds.toFixed(1)} s per trip, ${tripsPerShift(n, shift)} trips per ${shift} h shift${n.trolleys > 1 ? ` (${n.trolleys} trolleys)` : ""}`); for (const st of n.steps) console.log(`  ${st.id} ${st.title}: ${st.metres.toFixed(1)} m, ${st.seconds.toFixed(1)} s`); } },
  diff() { if (pos.length < 2) die("diff <a.json> <b.json>"); const a = readScene(pos[0]), b = readScene(pos[1]), lines = diff(a, b, a.project === b.project ? projects() : null); console.log(lines.length ? lines.join("\n") : "no differences"); },
  straighten() { const f = pos[0], s = readScene(f), P = projects(); if (!opt.path) die("--path id"); const r = straighten(s, P, opt.path, opt.step); writeIfOwnClean(f, s, P, opt.path, opt.step); console.log(`straightened: ${r.changed.join(", ") || "none"}${r.kept.length ? `; kept (straight would collide, use route): ${r.kept.join(", ")}` : ""}`); },
  route() { const f = pos[0], s = readScene(f), P = projects(); if (!opt.path || !opt.step) die("--path id --step id"); let p; try { p = route(s, P, opt.path, opt.step); } catch (e) { die(e.message); } writeIfOwnClean(f, s, P, opt.path, opt.step); console.log(`routed ${opt.path}/${opt.step}: ${p.length} points`); },
  "fix-links"() { const f = pos[0], s = readScene(f), P = projects(), fixed = fixLinks(s, P); console.log(`fixed: ${fixed.join(", ") || "nothing to fix"}`); validateOrDie(s, P); writeScene(f, s); },
  key() {
    const f = pos[0], s = readScene(f), P = projects(); if (!opt.path) die("--path id");
    let at = opt.at != null ? +opt.at : null; if (opt.step) { const [sid, mom] = String(opt.step).split(":"); at = storyStart(s, P, opt.path, sid, mom || "arrive"); } if (at == null || !isFinite(at)) die("--at seconds or --step id");
    const k = addKey(s, opt.path, cameraKey(s, P, { at, lookAt: opt.look || "trolley", distance: opt.distance && +opt.distance, heading: opt.heading && +opt.heading, tilt: opt.tilt != null ? +opt.tilt : undefined, lens: opt.lens && +opt.lens, ease: opt.ease }));
    console.log(`camera key at ${k.t} s on ${opt.path} (${k.follow ? "rides with the trolley" : "fixed point"})`); validateOrDie(s, P); writeScene(f, s);
  },
  caption() {
    const f = pos[0], s = readScene(f), P = projects(); if (!opt.path || !opt.title) die("--path id --title text");
    let from = opt.from != null ? +opt.from : null, to = opt.to != null ? +opt.to : null; if (opt.step) { from = storyStart(s, P, opt.path, String(opt.step).split(":")[0], "start"); to = from + +(opt.seconds || 4); }
    const L = (k) => { const o = { en: opt[k] || "" }; if (opt["ar-" + k]) o.ar = opt["ar-" + k]; if (opt["ko-" + k]) o.ko = opt["ko-" + k]; return Object.keys(o).length > 1 ? o : o.en; };
    const c = addCaption(s, opt.path, { from, to, title: L("title"), text: opt.text || opt["ar-text"] || opt["ko-text"] ? L("text") : "", place: opt.place, style: opt.style });
    console.log(`caption ${c.id} on ${opt.path}: ${c.t0.toFixed(1)}-${c.t1.toFixed(1)} s`); validateOrDie(s, P); writeScene(f, s);
  },
  "layout-ref"() { console.log(execFileSync(process.execPath, ["tools/v7/layout-reference.mjs", opt.player || PLAYER], { encoding: "utf8" }).trim()); },
  async shots() {
    const f = pos[0], s = readScene(f), P = projects(); validateOrDie(s, P); const out = opt.out || `dist/test/shots-${s.project}`; mkdirSync(out, { recursive: true });
    const pg = await page(bakeTemp(f, s), s.project), only = opt.only, names = [];
    const snap = async (name) => { await pg.wait(1600); const r = await pg.call("Page.captureScreenshot", { format: "png" }); writeFileSync(`${out}/${name}.png`, Buffer.from(r.data, "base64")); names.push(name); };
    try {
      if (opt.at != null) { const pi = opt.path ? s.paths.findIndex((p) => p.id === opt.path) : 0; const look = opt.look ? String(opt.look).split(",").map(Number) : null; const at = +opt.at, distance = +(opt.distance || 40); if (pi < 0) throw new Error("unknown path " + opt.path); if (!Number.isFinite(at) || at < 0 || !Number.isFinite(distance) || distance <= 0 || (look && (look.length !== 2 || !look.every(Number.isFinite)))) throw new Error("shots: finite --at >= 0, --distance > 0 and --look x,y required"); const file = `${out}/at-${s.paths[pi].id}-${at.toFixed(1)}s.png`; await shotAt(pg, pi, at, look, distance, file); console.log(`1 screenshot: ${file}`); return; }
      await pg.ev(`(() => { MFX.setPad(false); MF.setFlow(0); MF.seek(MF.D.flows[0].items[1].t0); MF.pause(); return 1; })()`);   // past the intro for every kind of shot
      if (!only || only === "overview") { await pg.ev(`(() => { MFX.viewPreset("reset"); return 1; })()`); await snap("overview"); }
      if (!only || only === "stops") for (const st of s.stops) { await pg.ev(`(() => { const w = MF.W(${st.x / .3}, ${st.y / .3}, MF.S.stack, 0); MFX.flyTo({ x: w.x, y: w.y, z: w.z, dist: 120, pol: .75 }, .1); return 1; })()`); await snap("stop-" + st.id); }
      if (!only || only === "steps") for (const [pi, p] of s.paths.entries()) for (const [si, st] of p.steps.entries()) { await pg.ev(`(() => { MF.setFlow(${pi}); MF.setCam("guided"); MF.seek(MF.D.flows[${pi}].items[${si + 1}].tm); MF.pause(); return 1; })()`); await snap(`path-${p.id}-${st.id}`); }
      console.log(`${names.length} screenshots in ${out}: ${names.join(", ")}`); if (pg.errors.length) die("page errors: " + pg.errors.slice(0, 3).join(" | "));
    } finally { await pg.close(); }
  },
  // several trolleys of one path: the player's fleet rules (copy k runs at story t - k * headway, shown while intro < its t <= total)
  async congestion() {
    const f = pos[0], s = readScene(f), P = projects(); validateOrDie(s, P); if (!opt.path) die("--path id"); const pi = s.paths.findIndex((p) => p.id === opt.path); if (pi < 0) die("unknown path " + opt.path);
    const pg = await page(bakeTemp(f, s), s.project);
    try {
      const r = await pg.ev(`(() => { MF.setFlow(${pi}); const f = MF.D.flows[${pi}], n = Math.min(12, f.trolleys || 1), hw = f.headway || 30, IN = MF.x.INTRO, total = f.total;
        const pose = (t) => { const p = MF.lotPose(Math.min(t, total)); return [p.x * .3, p.y * .3]; }, step = (t) => { const it = MF.stepAt(Math.min(t, total)); return it && it.s ? it.s.title : "?"; };
        let best = null, under = 0; const pairs = {};
        for (let T = 0; T <= total + 1e-9; T += .05) { const ps = []; for (let k = 0; k < n; k++) { const t = T - k * hw; ps.push(k === 0 || (t > IN && t <= total) ? { k, t, p: pose(t) } : null); }
          let m = Infinity; for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { if (!ps[a] || !ps[b]) continue; const d = Math.hypot(ps[a].p[0] - ps[b].p[0], ps[a].p[1] - ps[b].p[1]); m = Math.min(m, d); const key = (a + 1) + " and " + (b + 1), o = { d, T, a: a + 1, b: b + 1, at: [(ps[a].p[0] + ps[b].p[0]) / 2, (ps[a].p[1] + ps[b].p[1]) / 2], sa: step(ps[a].t), sb: step(ps[b].t) }; if (!pairs[key] || d < pairs[key].d) pairs[key] = o; if (!best || d < best.d) best = o; }
          if (m < 3) under += .05; }
        return { n, hw, total, best, pairs: Object.values(pairs), under }; })()`);
      if (r.n < 2) { console.log(`${opt.path}: one trolley (set "trolleys" and "headway" on the path)`); return; }
      if (!r.best) { console.log(`${opt.path}: no simultaneous trolley pair during playback (${r.n} trolleys, ${r.hw} s apart)`); return; }
      const fm = (o) => `${o.d.toFixed(2)} m at story ${o.T.toFixed(1)} s, at (${o.at[0].toFixed(1)}, ${o.at[1].toFixed(1)}) m; trolley ${o.a} in "${o.sa}", trolley ${o.b} in "${o.sb}"`;
      console.log(`${opt.path}: ${r.n} trolleys, ${r.hw} s apart; closest ${fm(r.best)}${r.best.d < 3 ? " - CONGESTION (under 3 m)" : ""}`);
      for (const p of r.pairs) console.log(`  trolleys ${p.a} and ${p.b}: ${fm(p)}`);
      console.log(`  time with two trolleys under 3 m apart: ${r.under.toFixed(1)} s (they do not wait for each other: OPEN_ISSUES 6)`);
      if (opt.picture) { const out = typeof opt.picture === "string" ? opt.picture : `dist/test/congestion-${s.project}-${opt.path}.png`; await shotAt(pg, pi, r.best.T - 1, r.best.at, 40, out); console.log(`  picture 1 s before the closest moment: ${out}`); }
    } finally { await pg.close(); }
  },
  async play() {
    const f = pos[0], s = readScene(f), P = projects(); validateOrDie(s, P); const pg = await page(bakeTemp(f, s), s.project), speed = +(opt.speed || 3); let bad = 0;
    try {
      for (const [pi, p] of s.paths.entries()) {
        if (opt.path && p.id !== opt.path) continue;
        const r = await pg.ev(`(async () => { MF.setFlow(${pi}); MF.setCam("guided"); MF.setSpeed(${speed}); MF.seek(0); MF.play(); const seen = new Set(); const t0 = performance.now(); while (MF.S.playing && performance.now() - t0 < 900000) { await new Promise(r => setTimeout(r, 150)); seen.add(MF.stepAt(MF.S.t).i); } return { end: +MF.S.t.toFixed(1), total: +MF.D.flows[${pi}].total.toFixed(1), steps: MF.D.flows[${pi}].items.length - 1, reached: [...seen].filter(i => i > 0).length, gl: MF.x.renderer.getContext().getError() }; })()`);
        const ok = r.end >= r.total - .05 && r.reached === r.steps && !r.gl; if (!ok) bad++;
        console.log(`${p.id}: ${ok ? "OK" : "FAIL"} played ${r.end} of ${r.total} s, ${r.reached}/${r.steps} steps reached${r.gl ? ", GL error " + r.gl : ""}`);
      }
      if (pg.errors.length) { bad++; console.log("page errors: " + pg.errors.slice(0, 3).join(" | ")); }
    } finally { await pg.close(); }
    process.exitCode = bad ? 1 : 0;
  },
  async take() {
    const f = pos[0], s = readScene(f), P = projects(); validateOrDie(s, P); if (!opt.path) die("--path id"); const pi = s.paths.findIndex((p) => p.id === opt.path); if (pi < 0) die("unknown path " + opt.path);
    if (!["guided", "director", "chase", "follow"].includes(opt.cam || "director")) die("camera must be guided, director, chase or follow");
    const pg = await page(bakeTemp(f, s), s.project);
    try {
      const take = await pg.ev(`(() => { MF.setFlow(${pi}); const total = MF.D.flows[${pi}].total; const t = { flow: ${JSON.stringify(opt.path)}, name: ${JSON.stringify(opt.name || "take")}, t0: ${opt.from != null ? +opt.from : 0}, t1: ${opt.to != null ? +opt.to : "total"}, speed: ${+(opt.speed || 1)}, cam: ${JSON.stringify(opt.cam || "director")}, captions: true, card: true, labels: true, fps: ${+(opt.fps || 30)} }; if (t.cam === "director" && !MFX.doc.director[t.flow]?.keys?.length) t.cam = "guided"; return t; })()`);
      if (!["guided", "director", "chase", "follow"].includes(take.cam)) throw new Error("camera must be guided, director, chase or follow");
      const { exportFilm } = await import("./v7/film-export.mjs");
      await exportFilm(pg, take, opt.out || `dist/test/take-${s.project}-${opt.path}.mp4`);
    } finally { await pg.close(); }
  },
  async "docs-gen"() { const { docsGen } = await import("./v7/docs-check.mjs"); const f = await docsGen(); console.log(f.length ? "updated " + f.join(", ") : "generated docs already current"); },
  "install-hooks"() { const { copyFileSync } = require_fs(); copyFileSync("tools/hooks/pre-commit", ".git/hooks/pre-commit"); console.log("installed .git/hooks/pre-commit (runs mf docs-check)"); },
  async "docs-check"() { const { docsCheck } = await import("./v7/docs-check.mjs"); const problems = await docsCheck(); if (problems.length) { for (const p of problems) console.log("DOCS " + p); die(`${problems.length} docs problem(s)`); } console.log("docs-check OK"); },
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!verb || !run[verb]) { run.help(); process.exit(verb ? 1 : 0); }
  await run[verb]();
}
