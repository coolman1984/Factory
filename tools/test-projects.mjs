// Smoke test of every product line in the built player: loads each tab (#inj, #press, #eps) in headless Chrome,
// plays every flow to its middle and end, and saves 2D and 3D screenshots. Usage: node tools/test-projects.mjs <shots folder> [q]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2] || "private/evidence/projects"; mkdirSync(out, { recursive: true });
const base = new URL("../dist/Material_Flow_Player.html", import.meta.url).href + "?q=" + (process.argv[3] || "low");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
for (const [i, id] of ["inj", "press", "eps"].entries()) {
  const port = 9361 + i;
  const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TEMP}/mf_proj_${Date.now()}`, "--window-size=1600,900", `${base}#${id}`], { windowsHide: true });
  let tabs = null;
  for (let k = 0; k < 60 && !tabs; k++) { await wait(500); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let n = 0; const errs = [];
  ws.addEventListener("message", (e) => { const d = JSON.parse(e.data); if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 300)); if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errs.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 300)); });
  const call = (m, p = {}) => new Promise((r) => { const q = ++n; const f = (e) => { const d = JSON.parse(e.data); if (d.id === q) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: q, method: m, params: p })); });
  const ev = async (x) => { const r = await call("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(x + ": " + r.exceptionDetails.exception?.description); return r.result.value; };
  const shot = async (name) => { const s = await call("Page.captureScreenshot"); writeFileSync(`${out}/${id}-${name}.png`, Buffer.from(s.data, "base64")); };
  await call("Runtime.enable"); await wait(9000);
  if (!(await ev("!!window.MF"))) { failed++; console.log(`${id}: player did not start. Screen error: ${await ev("document.getElementById('err')?.textContent || ''")}\n  ` + errs.join("\n  ")); await shot("0-dead"); ws.close(); ch.kill(); continue; }
  const info = await ev(`({ project: window.MF_PROJECT, mf: !!window.MF, flows: MF.D.flows.map(f => [f.name, f.items.length, +f.total.toFixed(1)]), tabs: [...document.querySelectorAll('#lines button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')), cams: [...document.getElementById('cam').options].map(o => o.value) })`);
  console.log(id, JSON.stringify(info));
  const okProject = info.project === id && info.mf; if (!okProject) failed++;
  await shot("0-start");
  for (let f = 0; f < info.flows.length; f++) {
    const T = info.flows[f][2];
    await ev(`MF.setFlow(${f}); MF.setView('3d'); MF.setCam('guided'); MF.seek(${(T * .55).toFixed(1)}); MF.pause()`); await wait(3500); await shot(`f${f}-mid-3d`);
    await ev(`MF.setView('2d'); MF.seek(${(T - .1).toFixed(1)}); MF.pause()`); await wait(2500); await shot(`f${f}-end-2d`);
  }
  await ev(`MF.setView('3d'); MF.setCam('overview')`); await wait(3500); await shot("overview");
  if (errs.length) { failed++; console.log(`${id} ERRORS:\n  ` + errs.join("\n  ")); } else console.log(`${id}: no page errors`);
  ws.close(); ch.kill();
}
console.log(failed ? `FAILED ${failed}` : "ALL PROJECTS OK"); process.exit(failed ? 1 : 0);
