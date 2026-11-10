// Diagnoses long frames: plays the story on the real GPU and prints the player's own slow-frame records
// (CPU ms of the frame, change mask, shader programs, textures, heap) next to the wall-clock frame time.
// Usage: node tools/stall-probe.mjs <player.html> [hash=inj1] [speed=1] [seconds=30] [extra query, e.g. "&shadows=0"]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [file, hash = "inj1", speed = "1", secs = "30", extra = ""] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 400), profile = mkdtempSync(join(tmpdir(), "mf_stall_"));
const url = pathToFileURL(resolve(file)).href + "?q=high" + extra + "#" + hash;
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", ...(process.env.MF_UNCAPPED === "1" ? ["--disable-frame-rate-limit"] : []), "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1920,1080", url], { stdio: "ignore", windowsHide: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs = null; for (let i = 0; i < 60 && !tabs; i++) { await wait(500); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => { const r = await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await call("Runtime.enable");
  for (let i = 0; i < 120; i++) { await wait(500); if (await ev(`typeof MF==='object'&&!!MF.ready`)) break; }
  await ev(`Promise.resolve(MF.ready).then(()=>1)`); await wait(1500);
  const before = await ev(`({programs:MF.perf.snapshot().programs,textures:MF.perf.snapshot().textures,geometries:MF.perf.snapshot().geometries})`);
  await ev(`MF.setSpeed(${+speed});MF.perf.reset();MF.seek(0);MF.play();0`);
  await wait(+secs * 1000);
  const recs = await ev(`MF.perf.slowFrames.slice(0,Math.min(MF.perf.slowCount,128)).filter(r=>r.ms>50).map(r=>({t:+r.t.toFixed(2),ms:Math.round(r.ms),cpu:+r.cpu.toFixed(1),step:r.step,mask:r.mask,programs:r.programs,textures:r.textures,heapMB:Math.round(r.heap/1048576)}))`);
  console.log("start resources:", JSON.stringify(before), "end:", JSON.stringify(await ev(`({programs:MF.perf.snapshot().programs,textures:MF.perf.snapshot().textures,geometries:MF.perf.snapshot().geometries})`)));
  console.log("slow frames (>50 ms):"); for (const r of recs) console.log(" ", JSON.stringify(r));
  console.log("stages:", JSON.stringify(await ev(`Object.fromEntries(Object.entries(MF.perf.stages).map(([k,v])=>[k,{calls:v.calls,avg:+(v.total/v.calls).toFixed(2),max:+v.max.toFixed(1)}]))`)));
  console.log("story t:", (await ev(`MF.S.t`)).toFixed(1), "cam:", await ev(`MF.S.cam`), "view:", await ev(`MF.S.view`));
  ws.close();
} finally { ch.kill(); await wait(800); try { rmSync(profile, { recursive: true, force: true }); } catch { /* held */ } }
process.exit(0);
