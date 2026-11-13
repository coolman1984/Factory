// One slow look at the full-quality pipeline (GTAO, bloom, shadows): software rendering takes seconds per frame.
// Usage: node tools/shot-high.mjs <shots folder>
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const out = process.argv[2], port = 9352, file = new URL("../dist/Material_Flow_Player.html", import.meta.url).href + "?q=high";
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TEMP}/mf_prof_h${Date.now()}`, "--window-size=1600,900", file]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs = null; for (let i = 0; i < 60 && !tabs; i++) { await wait(500); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const errs = []; ws.addEventListener("message", (e) => { const d = JSON.parse(e.data); if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 300)); });
const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await call("Runtime.enable"); await wait(6000);
const ev = async (e) => (await call("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
const shot = async (n) => writeFileSync(`${out}/${n}.png`, Buffer.from((await call("Page.captureScreenshot")).data, "base64"));
await ev(`document.body.classList.add('bare');MF.seek(MF.D.flows[0].items[2].tm)`);
for (let i = 0; i < 80 && !(await ev(`MF.S.R>.98`)); i++) await wait(1500);
for (const [n, c, l] of [["h1-e2", "e21", "studio"], ["h2-machines", "machines", "studio"], ["h3-racks", "racks", "studio"], ["h4-night", "overview", "night"]]) { await ev(`MF.setLook('${l}');MF.setCam('${c}')`); await wait(26000); await shot(n); }
console.log("errors:", errs.length ? errs.join(" | ") : "none"); ws.close(); ch.kill(); process.exit(0);
