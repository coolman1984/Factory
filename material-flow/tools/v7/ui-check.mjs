// Quick check of the round-3 UI: right-click menu, object search, photo, numbers without false deltas; saves two screenshots.
import { writeFileSync } from "node:fs";
import { openPage } from "./cdp.mjs";
const [file = "dist/Material_Flow_Player_v7.6.html", size = "1366,768"] = process.argv.slice(2);
const pg = await openPage(file, "inj1", { size }), out = {};
const shot = async (n) => { const s = await pg.call("Page.captureScreenshot", { format: "png" }); writeFileSync(`dist/test/ui-${n}.png`, Buffer.from(s.data, "base64")); };
try {
  await pg.ev(`(() => { MFX.setEditor(true); MFX.setTab("objects"); MF.setFlow(0); MF.seek(30); MF.pause(); return 1; })()`); await pg.wait(800);
  const p = await pg.ev(`(() => { const n = Object.values(MFX.doc.nodes)[0]; const q = MF.proj(MF.W(n.x, n.y, MF.S.stack, 3)); return q; })()`);
  for (const [t, b] of [["mouseMoved", 0], ["mousePressed", 2], ["mouseReleased", 0]]) await pg.call("Input.dispatchMouseEvent", { type: t, x: p[0], y: p[1], button: "right", buttons: b, clickCount: 1 });
  await pg.wait(300); out.menu = await pg.ev(`[...document.querySelectorAll("#ctx7 button")].map(b => b.textContent)`); await shot("menu");
  await pg.ev(`(() => { document.getElementById("ctx7").style.display = "none"; const i = document.getElementById("objFind"); i.value = "scan"; i.dispatchEvent(new Event("input")); return 1; })()`);
  out.found = await pg.ev(`[...document.querySelectorAll("[data-l]")].filter(li => li.style.display !== "none").length`);
  out.hint = await pg.ev(`document.getElementById("hint7").textContent`);
  await pg.ev(`(() => { document.getElementById("padPhoto").click(); return 1; })()`); await pg.wait(600); out.photo = await pg.ev(`document.getElementById("tip").textContent`);
  await pg.ev(`(() => { MFX.setTab("numbers"); return 1; })()`); await pg.wait(400); out.falseDeltas = await pg.ev(`document.querySelectorAll("table.num7 em").length`); await shot("numbers");
  out.errors = pg.errors.slice(0, 3);
} finally { await pg.close(); }
console.log(JSON.stringify(out, null, 1));
const ok = out.menu.length >= 3 && out.found > 0 && /Picture saved/.test(out.photo) && out.falseDeltas === 0 && !out.errors.length;
console.log(ok ? "UI CHECK PASS" : "UI CHECK FAIL"); process.exitCode = ok ? 0 : 1;
