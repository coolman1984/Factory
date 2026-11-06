// Screens on the REAL GPU (hardware ANGLE), so what I check is what the owner sees. Usage: node tools/shots-gpu.mjs <folder>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2], port = 9354, file = new URL("../dist/Material_Flow_Player.html", import.meta.url).href + "?q=high"; mkdirSync(out, { recursive: true });
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TEMP}/mf_prof_g${Date.now()}`, "--window-size=1600,900", file]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs = null; for (let i = 0; i < 60 && !tabs; i++) { await wait(500); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const errs = []; ws.addEventListener("message", (e) => { const d = JSON.parse(e.data); if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 300)); });
const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await call("Runtime.enable"); await wait(4000);
const ev = async (e) => (await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.value;
const shot = async (n) => writeFileSync(`${out}/${n}.png`, Buffer.from((await call("Page.captureScreenshot")).data, "base64"));
await ev(`Promise.resolve(MF.ready).then(()=>1)`); await wait(800);
await shot("g0-start"); await ev(`MF.seek(4)`); await wait(900); await shot("g1-rising");
await ev(`MF.setFlow(1);MF.seek(MF.D.flows[1].items[2].t0+3)`); await wait(3500); await shot("g2-step-e1");
await ev(`MF.setFlow(0);MF.seek(MF.D.flows[0].items[2].tm-1)`); await wait(3500); await shot("g3-e2");
await ev(`MF.seek(MF.D.flows[0].items.find(i=>i.s.lift).t0+1.6)`); await wait(3500); await shot("g4-lift");
for (const [n, c] of [["g5-machines", "machines"], ["g6-racks", "racks"], ["g7-docks", "docks"], ["g8-chase", "chase"], ["g9-overview", "overview"]]) { await ev(`MF.setCam('${c}')`); await wait(3500); await shot(n); }
console.log("errors:", errs.length ? errs.join(" | ") : "none", "| box:", await ev(`document.getElementById('err').textContent`)); ws.close(); ch.kill(); process.exit(0);
