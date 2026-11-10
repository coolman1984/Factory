// Real-GPU frame timing for any player file (headless Google Chrome, hardware ANGLE, fresh throw-away profile).
// Usage: node tools/perf-file.mjs <player.html> [hash=inj1] [speed=1] [seconds=30] [quality=high] [width=1920] [height=1080]
// Prints GPU, fps, frame-time percentiles and slow frames while the story plays from the start.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [file, hash = "inj1", speed = "1", secs = "30", q = "high", w = "1920", h = "1080"] = process.argv.slice(2);
if (!file) { console.error("usage: node tools/perf-file.mjs <player.html> [hash] [speed] [seconds] [quality] [w] [h]"); process.exit(2); }
const port = 9300 + Math.floor(Math.random() * 400), profile = mkdtempSync(join(tmpdir(), "mf_perf_"));
const url = pathToFileURL(resolve(file)).href + "?q=" + q + "#" + hash;
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", ...(process.env.MF_UNCAPPED === "1" ? ["--disable-frame-rate-limit"] : []), "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${w},${h}`, url], { stdio: "ignore", windowsHide: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs = null; for (let i = 0; i < 60 && !tabs; i++) { await wait(500); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
  if (!tabs) throw new Error("Chrome did not start");
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => { const r = await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await call("Runtime.enable");
  for (let i = 0; i < 120; i++) { await wait(500); if (await ev(`typeof MF==='object'&&!!MF.ready`)) break; }
  await ev(`Promise.resolve(MF.ready).then(()=>1)`);
  console.log("GPU:", await ev(`(()=>{const c=document.createElement('canvas').getContext('webgl2'),x=c&&c.getExtension('WEBGL_debug_renderer_info');return x?c.getParameter(x.UNMASKED_RENDERER_WEBGL):'unknown'})()`));
  if (process.env.MF_JS) console.log("setup:", JSON.stringify(await ev(process.env.MF_JS)));   // optional one-off setting before playback
  await wait(1500);
  await ev(`MF.setSpeed(${+speed});window.__f=[];window.__w=[];(function l(t){if(window.__p!=null){const d=t-__p;__f.push(d);if(d>34)__w.push([+MF.S.t.toFixed(1),Math.round(d)])}window.__p=t;if(!window.__stop)requestAnimationFrame(l)})(performance.now());MF.seek(${+(process.env.MF_T || 0)});${process.env.MF_IDLE === "1" ? "MF.pause()" : "MF.play()"};0`);
  await wait(+secs * 1000);
  await ev(`window.__stop=1`);
  const f = await ev(`__f`); f.sort((a, b) => a - b);
  const p = (k) => f[Math.min(f.length - 1, Math.floor(f.length * k))].toFixed(1), avg = f.reduce((s, x) => s + x, 0) / f.length;
  console.log(`file ${file} #${hash} speed ${await ev(`MF.S.speed`)}x quality ${await ev(`MF.S.quality`)} ${w}x${h}: ${f.length} frames, ${(1000 / avg).toFixed(1)} fps avg, median ${p(.5)} ms, 95% ${p(.95)} ms, 99% ${p(.99)} ms, worst ${f[f.length - 1].toFixed(0)} ms, over 17 ms: ${f.filter((x) => x > 17.5).length}, over 34 ms: ${f.filter((x) => x > 34).length}; story t=${(await ev(`MF.S.t`)).toFixed(1)} of ${(await ev(`MF.D.flows[MF.S.flow].total`)).toFixed(1)}`);
  console.log("error box:", JSON.stringify(await ev(`document.getElementById("err").textContent`)));
  console.log("slow frames [story t, ms]:", JSON.stringify((await ev(`__w`)).slice(0, 20)));
  ws.close();
} finally { ch.kill(); await wait(800); try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may hold it briefly */ } }
process.exit(0);
