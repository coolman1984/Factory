// Measures the player on the REAL GPU (headless Chrome, hardware ANGLE), the number that matters on the owner's laptop.
// Usage: node tools/perf.mjs [high|medium|low] [seconds]   Prints the GPU name, FPS and the worst frames while the story plays.
import { spawn } from "node:child_process";
const q = process.argv[2] || "high", secs = +(process.argv[3] || 20), port = 9353;
const file = new URL("../dist/Material_Flow_Player.html", import.meta.url).href + "?q=" + q;
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-frame-rate-limit", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TEMP}/mf_prof_p${Date.now()}`, "--window-size=1920,1080", file]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs = null; for (let i = 0; i < 60 && !tabs; i++) { await wait(500); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
if (!tabs) throw new Error("Chrome did not start");
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.value;
await call("Runtime.enable"); await wait(5000);
console.log("GPU:", await ev(`(()=>{const c=document.createElement('canvas').getContext('webgl2'),x=c.getExtension('WEBGL_debug_renderer_info');return x?c.getParameter(x.UNMASKED_RENDERER_WEBGL):'unknown'})()`));
await ev(`Promise.resolve(MF.ready).then(()=>1)`); await wait(1500);
await ev(`window.__f=[];window.__w=[];(function l(t){if(window.__p!=null){const d=t-__p;__f.push(d);if(d>60)__w.push([+MF.S.t.toFixed(1),Math.round(d)])}window.__p=t;requestAnimationFrame(l)})(performance.now());MF.seek(0);MF.play();0`);
await wait(secs * 1000);
const f = await ev(`__f`); f.sort((a, b) => a - b);
const p = (k) => f[Math.floor(f.length * k)].toFixed(1), avg = f.reduce((s, x) => s + x, 0) / f.length;
console.log(`quality ${await ev(`MF.S.quality`)}: ${f.length} frames, ${(1000 / avg).toFixed(1)} fps avg, median ${p(.5)} ms, 95% ${p(.95)} ms, 99% ${p(.99)} ms, worst ${f[f.length - 1].toFixed(0)} ms, frames over 50 ms: ${f.filter((x) => x > 50).length}; story reached t=${(await ev(`MF.S.t`)).toFixed(1)}`);
console.log("error box:", JSON.stringify(await ev(`document.getElementById("err").textContent`)), "ready resolved:", await ev(`Promise.race([Promise.resolve(MF.ready).then(()=>true),new Promise(r=>setTimeout(()=>r(false),500))])`));
console.log("slow frames at story time [t, ms]:", JSON.stringify(await ev(`__w`)));
ws.close(); ch.kill(); process.exit(0);
