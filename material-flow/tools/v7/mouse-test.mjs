// Minimum real-input test of the Studio: mouse and keyboard events through Chrome (not API calls).
// Usage: node tools/v7/mouse-test.mjs [player=dist/Material_Flow_Player_v7.6.html] [shot=dist/test/v7.6-mouse.png]
import { writeFileSync } from "node:fs";
import { openPage } from "./cdp.mjs";
const [file = "dist/Material_Flow_Player_v7.6.html", shot = "dist/test/v7.6-mouse.png"] = process.argv.slice(2);
const pg = await openPage(file, "inj1", { size: "1600,900" });
const mouse = (type, x, y, extra = {}) => pg.call("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
const click = async (x, y) => { await mouse("mouseMoved", x, y, { buttons: 0 }); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await pg.wait(250); };
const drag = async (x0, y0, x1, y1, steps = 12) => { await mouse("mouseMoved", x0, y0, { buttons: 0 }); await mouse("mousePressed", x0, y0); for (let i = 1; i <= steps; i++) { await mouse("mouseMoved", x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await pg.wait(16); } await mouse("mouseReleased", x1, y1); await pg.wait(400); };
const key = async (k, code, mods = 0, vk) => { await pg.call("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, modifiers: mods, windowsVirtualKeyCode: vk }); await pg.call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, modifiers: mods, windowsVirtualKeyCode: vk }); await pg.wait(300); };
const res = {}, fail = [];
try {
  const r = await pg.ev(`(() => { const b = document.getElementById("ed7Btn").getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
  await click(r[0], r[1]); res.editorOpen = await pg.ev(`MFX.ed.open`); if (!res.editorOpen) fail.push("rail button did not open the Studio");
  // a top view over TO Mapping / Kitting
  await pg.ev(`(() => { MF.setFlow(0); MF.seek(MF.D.flows[0].items[5].tm); MF.pause(); const n = Object.values(MF.D.nodes).find(n => /TO Mapping/.test(n.text)); MFX.flyTo(Object.assign({}, (() => { const w = MF.W(n.x + 20, n.y, MF.S.stack, 0); return { x: w.x, y: 0, z: w.z, dist: 260, az: 0, pol: .6 }; })()), .1); return 1; })()`);
  await pg.wait(1800);
  const p = await pg.ev(`(() => { const n = Object.values(MFX.doc.nodes).find(n => /TO Mapping/.test(n.text) && Math.hypot(n.x - 195, n.y - 534) < 20) || Object.values(MFX.doc.nodes).find(n => /TO Mapping/.test(n.text)); const q = MF.proj(MF.W(n.x, n.y, MF.S.stack, 3)); return { id: n.id, x: q[0], y: q[1], nx: n.x, ny: n.y }; })()`);
  await drag(p.x, p.y, p.x + 40, p.y + 25);
  res.stopMoved = await pg.ev(`(() => { const n = MFX.doc.nodes[${p.id}]; return [+(n.x - ${p.nx}).toFixed(2), +(n.y - ${p.ny}).toFixed(2)]; })()`);
  if (!res.stopMoved[0] && !res.stopMoved[1]) fail.push("dragging a stop did not move it");
  res.jogs = await pg.ev(`MFX.doc.flows.flatMap(f => f.steps).filter(s => Array.isArray(s.path)).reduce((n, s) => n + s.path.slice(1).filter((q, k) => { const a = s.path[k], L = Math.hypot(q[0] - a[0], q[1] - a[1]); return L > 1e-6 && L < 3 / .3 && k > 0 && k < s.path.length - 2; }).length, 0)`);
  await key("s", "KeyS", 0, 83); res.afterS = await pg.ev(`document.getElementById("tip").textContent`);
  await key("F1", "F1", 0, 112); res.keysMap = await pg.ev(`getComputedStyle(document.getElementById("keys7")).display`); await key("Escape", "Escape", 0, 27);
  if (res.keysMap !== "block") fail.push("F1 did not open the keyboard map");
  // pick a PC and drag it
  const d = await pg.ev(`(() => { const i = MFX.doc.devices.findIndex(d => d.type === "pc" && /TO Mapping/.test(d.label)); const d = MFX.doc.devices[i]; const q = MF.proj(MF.W(d.x, d.y, MF.S.stack, 4)); return { i, x: q[0], y: q[1], dx: d.x }; })()`);
  await drag(d.x, d.y, d.x - 30, d.y); res.pcSel = await pg.ev(`MFX.ed.sel && MFX.ed.sel.kind`); res.pcMoved = await pg.ev(`+(MFX.doc.devices[${d.i}].x - ${d.dx}).toFixed(2)`);
  if (res.pcSel !== "device" || !res.pcMoved) fail.push("click-drag on a PC did not select and move it");
  // paths tab: drag a middle corner of the selected step
  await key("2", "Digit2", 1, 50);   // Alt+2
  await pg.ev(`(() => { MFX.ed.stepSel = MFX.doc.flows[0].steps.findIndex(s => Array.isArray(s.path) && s.path.length > 3); const s = MFX.doc.flows[0].steps[MFX.ed.stepSel]; const w = MF.W(s.path[1][0], s.path[1][1], MF.S.stack, 0); MFX.flyTo({ x: w.x, y: 0, z: w.z, dist: 200, pol: .5 }, .1); return 1; })()`); await pg.wait(1500);
  const v = await pg.ev(`(() => { MFX.ed.stepSel = MFX.doc.flows[0].steps.findIndex(s => Array.isArray(s.path) && s.path.length > 3); const s = MFX.doc.flows[0].steps[MFX.ed.stepSel]; const k = 1, q = MF.proj(MF.W(s.path[k][0], s.path[k][1], MF.S.stack, 1.2)); MFX.focusPlan && 0; return { tab: MFX.ed.tab, x: q[0], y: q[1], before: JSON.stringify(s.path) }; })()`);
  res.tab = v.tab; if (v.tab !== "paths") fail.push("Alt+2 did not open Paths");
  if (v.x > 0 && v.x < 1600 && v.y > 0 && v.y < 900) { await drag(v.x, v.y, v.x + 20, v.y + 20); res.cornerMoved = await pg.ev(`JSON.stringify(MFX.doc.flows[0].steps[MFX.ed.stepSel].path) !== ${JSON.stringify(v.before)}`); if (!res.cornerMoved) fail.push("dragging a path corner did nothing"); } else res.cornerMoved = "off screen";
  // camera pad stick and wheel
  const az0 = await pg.ev(`MF.S.c.az`), st = await pg.ev(`(() => { const b = document.querySelector('#pad7 .stick[data-k="orbit"]').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
  await drag(st[0], st[1], st[0] + 40, st[1], 30); res.orbit = +(await pg.ev(`MF.S.c.az`) - az0).toFixed(3); if (!res.orbit) fail.push("orbit stick did not turn the camera");
  const d0 = await pg.ev(`MFX.cam.goal.dist`); await pg.call("Input.dispatchMouseEvent", { type: "mouseWheel", x: 800, y: 400, deltaX: 0, deltaY: -300 }); await pg.wait(300); res.zoom = +(d0 - await pg.ev(`MFX.cam.goal.dist`)).toFixed(1); if (!(res.zoom > 0)) fail.push("wheel did not zoom in");
  await key("z", "KeyZ", 2, 90); res.undo = await pg.ev(`document.getElementById("tip").textContent`);
  res.saved = await pg.ev(`(MFX.flush(), !!JSON.parse(localStorage.getItem("mf7:scene:inj1")).scene)`);
  res.errors = pg.errors.slice(0, 5); if (pg.errors.length) fail.push("page errors");
  const s = await pg.call("Page.captureScreenshot", { format: "png" }); writeFileSync(shot, Buffer.from(s.data, "base64"));
} finally { await pg.close(); }
console.log(JSON.stringify(res, null, 1)); console.log(fail.length ? "MOUSE TEST FAIL: " + fail.join("; ") : "MOUSE TEST PASS"); process.exitCode = fail.length ? 1 : 0;
