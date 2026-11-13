// Minimum working test of V7.6: the Studio opens, edits land in the scene file, director / numbers / fleet run, no page errors.
// Usage: node tools/v7/smoke-76.mjs [player=dist/Material_Flow_Player_v7.6.html] [shot.png]
import { writeFileSync } from "node:fs";
import { openPage } from "./cdp.mjs";
const [file = "dist/Material_Flow_Player_v7.6.html", shot = "dist/test/v7.6-smoke.png"] = process.argv.slice(2);
const pg = await openPage(file, "eps", { size: "1600,900" });
try {
  const r = await pg.ev(`(async () => {
    const w = (ms) => new Promise(r => setTimeout(r, ms)), out = {};
    MF.setFlow(2); out.eps3 = MF.D.flows[2].items.map(it => it.s.title + " " + (it.metres || 0).toFixed(0) + "m").slice(-2);
    MFX.setEditor(true); MFX.setTab("objects");
    MFX.startPlace("prop-box"); const n = Object.values(MF.D.nodes).find(n => n.plate === "1F"); MFX.placeAt({ x: n.x + 10, y: n.y + 10, plate: "1F" }, false);
    MFX.startPlace("prop-trolley"); MFX.placeAt({ x: n.x + 14, y: n.y + 10, plate: "1F" }, false);
    MFX.commit("speed", () => { MFX.doc.flows[2].steps[2].speed = 2; MFX.doc.flows[2].trolleys = 3; MFX.doc.flows[2].headway = 20; });
    MF.seek(10); MFX.addKey(); MF.seek(40); MFX.viewPreset("iso"); await w(1500); MFX.addKey({ follow: true });
    MFX.addCaption(); MFX.commit("ar", () => { const c = MFX.doc.director[MFX.doc.flows[2].id].caps[0]; c.title = { en: "Dry room", ar: "غرفة التجفيف" }; MFX.doc.settings.lang = "ar"; }, "director");
    MFX.flush(); const saved = JSON.parse(localStorage.getItem("mf7:scene:eps")).scene;
    out.scene = { objects: saved.objects.map(o => o.type), speed: saved.paths[2].steps[2].speed, trolleys: saved.paths[2].trolleys, keys: saved.director[saved.paths[2].id].keys.length, caps: saved.director[saved.paths[2].id].caps.length, layoutEdits: saved.layoutEdits.length };
    out.valid = MFS.validate().errors.map(e => e.where + ": " + e.msg).slice(0, 3);
    MF.setCam("director"); MF.seek(12); MF.play(); MF.setSpeed(3); await w(5000); out.fleet = MF.scene.children.filter(o => /fleet/.test(o.name) && o.visible).length; out.cam = MF.S.cam;
    MF.seek(MFX.doc.director[MFX.doc.flows[2].id].caps[0].t0 + .5); MF.pause(); await w(800); out.caption = document.querySelector(".cap7 b")?.textContent;
    MFX.setTab("numbers"); await w(300); out.numbers = document.querySelectorAll("table.num7 tr").length - 1;
    MFX.undo(); MFX.redo(); out.undoRedo = MFX.doc.director[MFX.doc.flows[2].id].caps.length;
    MFX.setTab("director"); MFX.setPad(true); out.glErr = MF.x.renderer.getContext().getError();
    return out; })()`);
  console.log(JSON.stringify(r, null, 1));
  const s = await pg.call("Page.captureScreenshot", { format: "png" }); writeFileSync(shot, Buffer.from(s.data, "base64"));
  const ok = r.scene.objects.length === 2 && r.scene.speed === 2 && r.scene.trolleys === 3 && r.scene.keys === 2 && r.scene.caps === 1 && !r.valid.length && r.cam === "director" && r.numbers === 4 && r.glErr === 0 && !pg.errors.length;
  console.log(ok ? "SMOKE PASS" : "SMOKE FAIL", pg.errors.slice(0, 5));
  process.exitCode = ok ? 0 : 1;
} finally { await pg.close(); }
