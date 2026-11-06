// Drives the built player in headless Chrome, opened from disk the way the owner opens it, using real input events.
// Usage: node tools/test-player.mjs <shots folder>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const file = new URL("../dist/Material_Flow_Player.html", import.meta.url).href, port = 9351;
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TEMP}/mf_prof_${Date.now()}`, "--window-size=1600,900", file]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(3500);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const errs = [];
ws.addEventListener("message", (e) => { const d = JSON.parse(e.data); if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 300)); if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errs.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 300)); });
const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await call("Runtime.enable"); await wait(2500);
const ev = async (e) => { const r = await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(e + ": " + r.exceptionDetails.exception?.description); return r.result.value; };
const shot = async (n) => { const s = await call("Page.captureScreenshot"); writeFileSync(`${out}/${n}.png`, Buffer.from(s.data, "base64")); };
const key = async (k, code) => { for (const type of ["keyDown", "keyUp"]) await call("Input.dispatchKeyEvent", { type, key: k, code: code || k, text: type === "keyDown" && k.length === 1 ? k : undefined, windowsVirtualKeyCode: k === " " ? 32 : k === "ArrowRight" ? 39 : k === "ArrowLeft" ? 37 : k.toUpperCase().charCodeAt(0) }); await wait(200); };
const mouse = async (type, x, y, button = "left", buttons = 1) => call("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount: 1 });
const dragBy = async (x, y, dx, dy, button = "left") => { await mouse("mousePressed", x, y, button, button === "left" ? 1 : 2); for (let i = 1; i <= 6; i++) { await mouse("mouseMoved", x + dx * i / 6, y + dy * i / 6, button, button === "left" ? 1 : 2); await wait(30); } await mouse("mouseReleased", x + dx, y + dy, button, 0); await wait(200); };
const st = () => ev(`JSON.stringify({t:+MF.S.t.toFixed(2),step:MF.stepAt(MF.S.t).i,playing:MF.S.playing,cam:MF.S.cam,view:MF.S.view,stack:+MF.S.stack.toFixed(2),az:+MF.S.c.az.toFixed(2),pol:+MF.S.c.pol.toFixed(2),dist:Math.round(MF.S.c.dist),x:Math.round(MF.S.c.x)})`).then(JSON.parse);
const results = []; const ok = (name, pass, info = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${info}`); };

let s = await st(); ok("opens from disk with no script error", errs.length === 0 && s.step === 0, JSON.stringify(s));
ok("plans are loaded into 3D", await ev(`document.querySelectorAll('.chip').length`) === 25);
await wait(1500); await shot("01-start-2d");
await key(" ", "Space"); await wait(1500); s = await st(); ok("Space plays", s.playing && s.t > .5, `t=${s.t}`);
await key(" ", "Space"); const t1 = (await st()).t; await wait(500); s = await st(); ok("Space pauses", !s.playing && s.t === t1);
await key("ArrowRight"); await key("ArrowRight"); s = await st(); ok("Right steps forward", s.step >= 1, `step ${s.step}`);
await key("ArrowLeft"); const back = await st(); ok("Left steps back", back.step < s.step, `step ${back.step}`);
await ev(`MF.seek(MF.D.flows[0].items[3].t0+1.7)`); await wait(3500); s = await st(); ok("elevator step turns the view to 3D", s.stack > .8, `stack ${s.stack}`); await shot("02-elevator-3d");
await dragBy(700, 420, 220, -60); s = await st(); ok("left drag orbits and frees the camera", s.cam === "free", `az ${s.az} pol ${s.pol}`); await shot("03-free-orbit");
const d0 = s.dist; await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 420, deltaX: 0, deltaY: -300 }); await wait(300); s = await st(); ok("wheel zooms", s.dist < d0, `${d0} -> ${s.dist}`);
const x0 = s.x; await dragBy(700, 420, -160, 0, "right"); s = await st(); ok("right drag pans", s.x !== x0, `${x0} -> ${s.x}`);
await key(" ", "Space"); await wait(1200); const s2 = await st(); ok("plays on while the camera stays free", s2.playing && s2.cam === "free" && s2.t > s.t); await key(" ", "Space");
await key("g"); await wait(2500); s = await st(); ok("G returns to the guided camera", s.cam === "guided");
await key("2"); await wait(3000); s = await st(); ok("2 gives the plan view", s.stack < .1 && s.pol < .1, `stack ${s.stack} pol ${s.pol}`); await shot("04-plan-2d-midflow");
await key("3"); await wait(3000); s = await st(); ok("3 gives the 3D view", s.stack > .9 && s.pol > .8, `stack ${s.stack} pol ${s.pol}`);
for (const c of ["overview", "iso", "e1", "e21", "e22", "elev", "follow", "chase"]) { await ev(`document.getElementById('cam').value='${c}';document.getElementById('cam').dispatchEvent(new Event('change'))`); await wait(1800); if (c === "overview" || c === "elev" || c === "chase") await shot("05-cam-" + c); }
s = await st(); ok("all camera presets run", s.cam === "chase");
await ev(`MF.setCam('guided');MF.setView('auto')`);
for (const f of [1, 2]) { await ev(`MF.setFlow(${f});MF.seek(MF.D.flows[${f}].total)`); await wait(3200); s = await st(); ok(`flow ${f + 1} reaches its last step`, s.step === (await ev(`MF.D.flows[${f}].items.length`)) - 1); await shot(`06-flow${f + 1}-end`); }
await ev(`MF.setFlow(0);MF.seek(MF.D.flows[0].total)`); await wait(3200); await shot("07-flow1-end");
await key("h"); await wait(300); await shot("08-no-ui"); ok("H hides all controls", await ev(`document.body.classList.contains('bare')`)); await key("h");
ok("no script errors in the whole run", errs.length === 0, errs.join(" | "));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
ws.close(); ch.kill(); process.exit(results.every(Boolean) ? 0 : 1);
