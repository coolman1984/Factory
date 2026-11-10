// Screenshots of any player file at given story times (headless Google Chrome, real GPU, fresh throw-away profile).
// Usage: node tools/shot-file.mjs <player.html> <outDir> [hash=inj1] [times=comma list] [cam=guided] [w=1920] [h=1080]
// MF_JS = optional setup expression run once after MF.ready. Each shot: seek(t), settle the camera by stepping frames, PNG.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [file, outDir, hash = "inj1", list = "", cam = "guided", w = "1920", h = "1080"] = process.argv.slice(2);
if (!file || !outDir) { console.error("usage: node tools/shot-file.mjs <player.html> <outDir> [hash] [times] [cam] [w] [h]"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 400), profile = mkdtempSync(join(tmpdir(), "mf_shot_"));
const url = pathToFileURL(resolve(file)).href + "?q=high#" + hash;
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${w},${h}`, url], { stdio: "ignore", windowsHide: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs = null; for (let i = 0; i < 60 && !tabs; i++) { await wait(500); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => { const r = await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await call("Runtime.enable"); await call("Page.enable");
  for (let i = 0; i < 120; i++) { await wait(500); if (await ev(`typeof MF==='object'&&!!MF.ready`)) break; }
  await ev(`Promise.resolve(MF.ready).then(()=>1)`); await wait(800);
  if (process.env.MF_JS) console.log("setup:", JSON.stringify(await ev(process.env.MF_JS)));
  await ev(`MF.setCam(${JSON.stringify(cam)});0`);
  const total = await ev(`MF.D.flows[MF.S.flow].total`);
  const times = list ? list.split(",").map(Number) : [0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((k) => +(total * k).toFixed(1));
  for (const t of times) {
    // approach the moment from 2 s earlier in story time so the springs settle as they would in playback
    await ev(`(async()=>{MF.pause();MF.seek(Math.max(0,${t}-2));MF.play();const s=performance.now();while(MF.S.t<${t}&&performance.now()-s<8000)await new Promise(r=>requestAnimationFrame(r));MF.pause();MF.seek(${t});for(let i=0;i<40;i++)await new Promise(r=>requestAnimationFrame(r));return 1})()`);
    const info = await ev(`(()=>{const it=MF.stepAt(MF.S.t);return {t:+MF.S.t.toFixed(1),step:it.i,title:it.s.title}})()`);
    const shot = await call("Page.captureScreenshot", { format: "png" });
    const name = join(outDir, `t${String(t).replace(".", "_")}.png`); writeFileSync(name, Buffer.from(shot.data, "base64"));
    console.log(name, JSON.stringify(info));
  }
  console.log("error box:", JSON.stringify(await ev(`document.getElementById("err").textContent`)));
  ws.close();
} finally { ch.kill(); await wait(800); try { rmSync(profile, { recursive: true, force: true }); } catch { /* held */ } }
process.exit(0);
