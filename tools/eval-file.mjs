// Runs one JavaScript expression in a player file after MF.ready and prints the JSON result (headless Chrome, real GPU).
// Usage: node tools/eval-file.mjs <player.html> <hash> "<expression>"   (the expression may be async; it must return JSON)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [file, hash = "inj1", expr = "1"] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 400), profile = mkdtempSync(join(tmpdir(), "mf_eval_"));
const url = pathToFileURL(resolve(file)).href + "?q=high#" + hash;
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1920,1080", url], { stdio: "ignore", windowsHide: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  let tabs = null; for (let i = 0; i < 60 && !tabs; i++) { await wait(500); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const errors = []; ws.addEventListener("message", (e) => { const d = JSON.parse(e.data); if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });
  const ev = async (e) => { const r = await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await call("Runtime.enable");
  for (let i = 0; i < 120; i++) { await wait(500); if (await ev(`typeof MF==='object'&&!!MF.ready`)) break; }
  await ev(`Promise.resolve(MF.ready).then(()=>1)`); await wait(500);
  console.log(JSON.stringify(await ev(`(async()=>{${expr.includes("return") ? expr : "return (" + expr + ")"}})()`), null, 1));
  const box = await ev(`document.getElementById("err").textContent`); if (box) { console.log("ERROR BOX:", box); code = 1; }
  if (errors.length) { console.log("PAGE EXCEPTIONS:", JSON.stringify(errors)); code = 1; }
  ws.close();
} catch (e) { console.log("FAILED:", e.message); code = 1; }
finally { ch.kill(); await wait(800); try { rmSync(profile, { recursive: true, force: true }); } catch { /* held */ } }
process.exit(code);
