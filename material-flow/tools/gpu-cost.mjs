// True cost of one frame (CPU + GPU, synchronised with gl.finish) at fixed story moments, real GPU, headless Chrome.
// Usage: node tools/gpu-cost.mjs <player.html> [hash=inj1] [quality=high] [times=comma list] ; MF_JS = optional setup expression
// Prints the median and 90th percentile ms of 40 synchronised frames per story moment. 16.7 ms is the 60 fps budget.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [file, hash = "inj1", q = "high", list = ""] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 400), profile = mkdtempSync(join(tmpdir(), "mf_gpu_"));
const url = pathToFileURL(resolve(file)).href + "?q=" + q + "#" + hash;
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1920,1080", url], { stdio: "ignore", windowsHide: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs = null; for (let i = 0; i < 60 && !tabs; i++) { await wait(500); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => { const r = await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await call("Runtime.enable");
  for (let i = 0; i < 120; i++) { await wait(500); if (await ev(`typeof MF==='object'&&!!MF.ready`)) break; }
  await ev(`Promise.resolve(MF.ready).then(()=>MF.prepared).then(()=>1)`); await wait(1000);
  if (process.env.MF_JS) console.log("setup:", JSON.stringify(await ev(process.env.MF_JS)));
  const total = await ev(`MF.D.flows[MF.S.flow].total`);
  const times = list ? list.split(",").map(Number) : [0.25, 0.4, 0.55, 0.7, 0.85].map((k) => +(total * k).toFixed(1));
  const out = await ev(`(async()=>{const gl=document.getElementById('gl').getContext('webgl2');const res=[];MF.pause();
    for(const t of ${JSON.stringify(times)}){MF.seek(t);for(let i=0;i<90;i++){MF.frame(1/60,t);gl.finish();await new Promise(r=>setTimeout(r,0));}
      const a=[];for(let i=0;i<40;i++){const s=performance.now();MF.frame(1/60,t);gl.finish();a.push(performance.now()-s);await new Promise(r=>setTimeout(r,0));}
      a.sort((x,y)=>x-y);res.push({t,step:MF.stepAt(t).i,median:+a[20].toFixed(2),p90:+a[36].toFixed(2)});}
    return res;})()`);
  console.log(`${file} #${hash} q=${q}${process.env.MF_JS ? " +setup" : ""}: ` + out.map((r) => `t${r.t}(s${r.step}) ${r.median}/${r.p90}`).join("  ") + `  | mean of medians ${(out.reduce((s, r) => s + r.median, 0) / out.length).toFixed(2)} ms`);
  ws.close();
} finally { ch.kill(); await wait(800); try { rmSync(profile, { recursive: true, force: true }); } catch { /* held */ } }
process.exit(0);
