// Minimal headless Google Chrome driver (DevTools protocol over Node's built-in WebSocket). Fresh isolated profile under
// control/test/.tmp, never a personal profile. Used by the UI test only.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(existsSync);
export async function launch({ width = 1440, height = 900 } = {}) {
  if (!CHROME) throw new Error("Google Chrome is not installed");
  const root = fileURLToPath(new URL("./.tmp/", import.meta.url)); mkdirSync(root, { recursive: true });
  const profile = mkdtempSync(join(root, "chrome-"));
  const ch = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  let port = null; for (let i = 0; i < 300 && !port; i++) { await new Promise(r => setTimeout(r, 100)); try { port = +readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch { } }
  if (!port) { ch.kill(); throw new Error("Chrome did not open its debugging port"); }
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(), page = list.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let id = 0; const pending = new Map(), errors = [], logs = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.bad(new Error(d.error.message)) : p.ok(d.result); }
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map(a => a.value ?? a.description).join(" "));
    if (d.method === "Log.entryAdded" && d.params.entry.level === "error" && !/favicon/.test(d.params.entry.url || "")) errors.push(d.params.entry.text); };
  const call = (method, params = {}, timeoutMs = 60000) => new Promise((ok, bad) => { const i = ++id; const t = setTimeout(() => { pending.delete(i); bad(new Error("Chrome command timed out: " + method)); }, timeoutMs); pending.set(i, { ok: v => { clearTimeout(t); ok(v); }, bad: e => { clearTimeout(t); bad(e); } }); ws.send(JSON.stringify({ id: i, method, params })); });
  await call("Runtime.enable"); await call("Log.enable"); await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr, timeoutMs) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, timeoutMs); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  return {
    call, ev, errors, logs,
    goto: async url => { await call("Page.navigate", { url }); for (let i = 0; i < 300; i++) { await new Promise(r => setTimeout(r, 100)); try { if (await ev("!!(window.FC && window.FC.ready)")) return; } catch { } } throw new Error("page did not become ready"); },
    wait: ms => new Promise(r => setTimeout(r, ms)),
    until: async (expr, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(`!!(${expr})`)) return true; await new Promise(r => setTimeout(r, 100)); } throw new Error("timed out waiting for " + expr); },
    key: async (key, { ctrl = false, text } = {}) => { const mod = ctrl ? 2 : 0; await call("Input.dispatchKeyEvent", { type: "keyDown", key, modifiers: mod, text, code: key.length === 1 ? "Key" + key.toUpperCase() : key, windowsVirtualKeyCode: key === "Enter" ? 13 : key === "Escape" ? 27 : key.toUpperCase().charCodeAt(0) }); await call("Input.dispatchKeyEvent", { type: "keyUp", key, modifiers: mod }); },
    type: async text => { await call("Input.insertText", { text }); },
    shot: async file => { const r = await call("Page.captureScreenshot", { format: "png" }); const { writeFileSync } = await import("node:fs"); writeFileSync(file, Buffer.from(r.data, "base64")); },
    close: async () => { try { await call("Browser.close", {}, 5000); } catch { } ch.kill(); await new Promise(r => setTimeout(r, 500)); try { rmSync(profile, { recursive: true, force: true }); } catch { } }
  };
}
