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
  straighten() { const f = pos[0], s = readScene(f), P = projects(); if (!opt.path) die("--path id"); const r = straighten(s, P, opt.path, opt.step); console.log(`straightened: ${r.changed.join(", ") || "none"}${r.kept.length ? `; kept (straight would collide, use route): ${r.kept.join(", ")}` : ""}`); validateOrDie(s, P); writeScene(f, s); },
  route() { const f = pos[0], s = readScene(f), P = projects(); if (!opt.path || !opt.step) die("--path id --step id"); try { const p = route(s, P, opt.path, opt.step); console.log(`routed ${opt.path}/${opt.step}: ${p.length} points`); } catch (e) { die(e.message); } validateOrDie(s, P); writeScene(f, s); },
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
      await pg.ev(`(() => { MFX.setPad(false); return 1; })()`);
      if (!only || only === "overview") { await pg.ev(`(() => { MF.setFlow(0); MF.seek(MF.D.flows[0].items[1].t0); MF.pause(); MFX.viewPreset("reset"); return 1; })()`); await snap("overview"); }
      if (!only || only === "stops") for (const st of s.stops) { await pg.ev(`(() => { const w = MF.W(${st.x / .3}, ${st.y / .3}, MF.S.stack, 0); MFX.flyTo({ x: w.x, y: w.y, z: w.z, dist: 120, pol: .75 }, .1); return 1; })()`); await snap("stop-" + st.id); }
      if (!only || only === "steps") for (const [pi, p] of s.paths.entries()) for (const [si, st] of p.steps.entries()) { await pg.ev(`(() => { MF.setFlow(${pi}); MF.setCam("guided"); MF.seek(MF.D.flows[${pi}].items[${si + 1}].tm); MF.pause(); return 1; })()`); await snap(`path-${p.id}-${st.id}`); }
      console.log(`${names.length} screenshots in ${out}: ${names.join(", ")}`); if (pg.errors.length) die("page errors: " + pg.errors.slice(0, 3).join(" | "));
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
    const pg = await page(bakeTemp(f, s), s.project);
    try {
      const info = await pg.ev(`(() => { MF.setFlow(${pi}); const total = MF.D.flows[${pi}].total; const t = { id: "cli", name: ${JSON.stringify(opt.name || "take")}, flow: ${JSON.stringify(opt.path)}, t0: ${opt.from != null ? +opt.from : 0}, t1: ${opt.to != null ? +opt.to : "total"}, speed: ${+(opt.speed || 1)}, cam: ${JSON.stringify(opt.cam || "director")}, captions: true, card: true, labels: true, quality: "high", fps: 60 };
        if (t.cam === "director" && !MFX.doc.director[t.flow]?.keys?.length) t.cam = "guided"; const o = URL.createObjectURL; URL.createObjectURL = (b) => { if (b instanceof Blob && /video/.test(b.type)) window.__take = b; return o(b); }; MFX.startTake(t); return { cam: t.cam, seconds: (t.t1 - t.t0) / t.speed }; })()`);
      const t0 = Date.now(); while (await pg.ev(`MFX.rec.active`)) { await pg.wait(1000); if (Date.now() - t0 > 1800000) die("take did not end"); } await pg.wait(2500);
      const meta = await pg.ev(`(async () => { const b = window.__take; if (!b) return null; window.__buf = new Uint8Array(await b.arrayBuffer()); return { type: b.type, size: b.size }; })()`); if (!meta) die("no video was produced");
      const ext = /mp4/.test(meta.type) ? "mp4" : "webm", out = opt.out || `dist/test/take-${s.project}-${opt.path}.${ext}`, parts = [];
      for (let o = 0; o < meta.size; o += 4 << 20) parts.push(Buffer.from(await pg.ev(`(() => { const a = window.__buf.subarray(${o}, ${o + (4 << 20)}); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode.apply(null, a.subarray(i, i + 32768)); return btoa(s); })()`), "base64"));
      writeFileSync(out, Buffer.concat(parts)); console.log(`${out}: ${meta.type}, ${(meta.size / 1048576).toFixed(1)} MB, about ${info.seconds.toFixed(1)} s, camera ${info.cam}`);
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
