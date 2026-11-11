// Headless installed Google Chrome only; every run owns a fresh temporary profile.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
// Throw-away Chrome profiles live in the temp folder; a profile Chrome still held at close stays behind. Every start removes
// mf_* test profiles older than an hour (207 of them filled drive C: on 2026-11-11).
function sweepStaleProfiles() { const dir = tmpdir(), old = Date.now() - 3600e3; for (const f of readdirSync(dir)) { if (!/^mf_[a-z0-9]+_/i.test(f)) continue; try { const p = join(dir, f); if (statSync(p).mtimeMs < old) rmSync(p, { recursive: true, force: true }); } catch { /* in use */ } } }
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

export async function openPage(file, hash = "inj1", { query = "q=high", size = "1920,1080" } = {}) {
  try { sweepStaleProfiles(); } catch { /* best effort */ }
  const profile = mkdtempSync(join(tmpdir(), "mf_v7_"));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pending = new Map(); let ch, ws, launchError, exited = false, id = 0;
  const rejectPending = (err) => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(err); } pending.clear(); };
  const close = async () => {
    rejectPending(new Error("Chrome connection closed"));
    try { ws?.close(); } catch {}
    ch?.kill(); await wait(700);
    // Never delete outside the temporary directory created by this invocation.
    const rel = relative(resolve(tmpdir()), resolve(profile));
    if (!rel.startsWith("..") && !isAbsolute(rel) && rel.startsWith("mf_v7_")) {
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files. */ }
    }
  };
  try {
    const url = pathToFileURL(resolve(file)).href + (query ? "?" + query : "") + "#" + hash;
    ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, `--window-size=${size}`, url], { stdio: "ignore", windowsHide: true });
    ch.on("error", (e) => { launchError = e; }); ch.on("exit", () => { exited = true; });
    let tab;
    for (let i = 0; i < 80 && !tab; i++) {
      if (launchError) throw launchError;
      if (exited) throw new Error("Headless Chrome exited before its debugger became ready");
      try {
        const port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0];
        const tabs = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(2000) })).json();
        tab = tabs.find((t) => t.type === "page");
      } catch { /* starting */ }
      if (!tab) await wait(400);
    }
    if (!tab) throw new Error("Headless Chrome debugger did not become ready within 32 seconds");
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((ok, no) => {
      const timer = setTimeout(() => no(new Error("Chrome WebSocket open timed out")), 10000);
      ws.onopen = () => { clearTimeout(timer); ok(); };
      ws.onerror = () => { clearTimeout(timer); no(new Error("Chrome WebSocket failed")); };
    });
    const errors = [];
    ws.addEventListener("close", () => rejectPending(new Error("Chrome disconnected")));
    ws.addEventListener("message", (e) => {
      const d = JSON.parse(e.data), p = pending.get(d.id);
      if (p) { clearTimeout(p.timer); pending.delete(d.id); if (d.error) p.reject(new Error(d.error.message)); else p.resolve(d.result); }
      if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push("console.error: " + d.params.args.map((a) => a.value ?? a.description).join(" "));
    });
    const call = (method, params = {}) => new Promise((resolveCall, reject) => {
      const i = ++id, timer = setTimeout(() => { pending.delete(i); reject(new Error(`Chrome command timed out: ${method}`)); }, 120000);
      pending.set(i, { resolve: resolveCall, reject, timer });
      try { ws.send(JSON.stringify({ id: i, method, params })); }
      catch (e) { clearTimeout(timer); pending.delete(i); reject(e); }
    });
    const ev = async (expression) => {
      const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const ready = async () => {
      for (let i = 0; i < 150; i++) {
        let found = false;
        try { found = await ev("typeof MF==='object'&&!!MF.ready"); } catch (e) { if (exited) throw e; }
        // A rejected/blocked application readiness promise is terminal, not a reason to start another wait loop.
        if (found) { await ev("Promise.resolve(MF.ready).then(()=>MF.prepared).then(()=>1)"); await wait(400); return; }
        await wait(400);
      }
      throw new Error("Material Flow did not become ready within 60 seconds");
    };
    await call("Runtime.enable"); await ready();
    return { ev, call, errors, close, wait, reload: async () => { await call("Page.reload"); await wait(800); await ready(); } };
  } catch (e) { await close(); throw e; }
}
