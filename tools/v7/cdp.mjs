// Minimal headless Chrome page driver for the V7 tests (installed Google Chrome, fresh profile, real GPU via ANGLE/D3D11).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function openPage(file, hash = "inj1", { query = "q=high", size = "1920,1080" } = {}) {
  const port = 9300 + Math.floor(Math.random() * 600), profile = mkdtempSync(join(tmpdir(), "mf_v7_"));
  const url = pathToFileURL(resolve(file)).href + (query ? "?" + query : "") + "#" + hash;
  const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${size}`, url], { stdio: "ignore", windowsHide: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let tabs = null; for (let i = 0; i < 80 && !tabs; i++) { await wait(400); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result || d); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const errors = []; ws.addEventListener("message", (e) => { const d = JSON.parse(e.data); if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push("console.error: " + d.params.args.map((a) => a.value ?? a.description).join(" ")); });
  const ev = async (e) => { const r = await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await call("Runtime.enable");
  for (let i = 0; i < 150; i++) { await wait(400); try { if (await ev("typeof MF==='object'&&!!MF.ready")) break; } catch { /* navigating */ } }
  await ev("Promise.resolve(MF.ready).then(()=>1)"); await wait(400);
  const close = async () => { try { ws.close(); } catch { /* closed */ } ch.kill(); await wait(700); try { rmSync(profile, { recursive: true, force: true }); } catch { /* held */ } };
  return { ev, call, errors, close, wait, reload: async () => { await ev("location.reload()").catch(() => {}); await wait(800); for (let i = 0; i < 150; i++) { await wait(400); try { if (await ev("typeof MF==='object'&&!!MF.ready")) break; } catch { /* navigating */ } } await ev("Promise.resolve(MF.ready).then(()=>1)"); await wait(400); } };
}
