// Renders one view of a player and saves screenshots with candidate object groups hidden in turn, to identify what draws an
// unwanted shape. Usage: node tools/v7/shot-probe.mjs <player.html> <tab> <flow> <step> <tx> <ty> <dist> <azDeg> <polDeg> <outDir>
import { writeFileSync, mkdirSync } from "node:fs";
import { openPage } from "./cdp.mjs";

const [file, tab, flow, step, tx, ty, dist, az, pol, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const pg = await openPage(file, tab, { size: "1280,720" });
try {
  await pg.ev(`(() => { MF.setFlow(${+flow}); const it = MF.D.flows[${+flow}].items[${+step}]; MF.seek(it.tm + .2); MF.pause(); MF.setCam("free"); const w = MF.W(${+tx} / .3, ${+ty} / .3, 0, 0); Object.assign(MF.S.c, { x: w.x, y: 0, z: w.z, dist: ${+dist} / .3, az: ${+az} * Math.PI / 180, pol: ${+pol} * Math.PI / 180 }); return 1; })()`);
  await pg.wait(1500);
  const groups = {
    all: "[]",
    noReflection: "(MF.reflection.set({ enabled: false }), [])",
    noDeviceFx: "MF.devices.effects",
    noDevices: "Object.values(MF.devices.groups)",
    noReplica: "MF.REP.meshes.map(m => m.im)",
    noRoute: "MF.route.flows.flatMap(r => r.meshes)",
    noBeacon: "MF.scene.children.filter(o => o.isMesh && o.material && o.material.type === 'MeshBasicMaterial')",
    noGates: "MF.gates",
    noTransparent: "(() => { const a = []; MF.scene.traverse(o => { if (o.material && o.material.transparent && !o.isInstancedMesh) a.push(o); }); return a; })()",
  };
  for (const [name, expr] of Object.entries(groups)) {
    await pg.ev(`(() => { window.__hid = ${expr}; for (const o of window.__hid) o.__v = o.visible; window.__frame = (t) => { for (const o of window.__hid) o.visible = false; }; return window.__hid.length; })()`);
    // hide every frame (the player re-shows some objects each frame): wrap MF.frame once
    await pg.ev(`(() => { if (!window.__wrapped) { window.__wrapped = true; const f = MF.x.renderer.render.bind(MF.x.renderer); MF.x.renderer.render = (s, c) => { if (window.__hid) for (const o of window.__hid) o.visible = false; return f(s, c); }; } return 1; })()`);
    await pg.wait(700);
    const shot = await pg.call("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${outDir}/${name}.png`, Buffer.from(shot.data, "base64"));
    await pg.ev(`(() => { for (const o of window.__hid) o.visible = o.__v; window.__hid = []; return 1; })()`);
  }
  const info = await pg.ev(`({ light: Object.keys(window.MF_FLOOR_LIGHT || {}), lightLen: Object.values(window.MF_FLOOR_LIGHT || {}).map(s => (s && s.length) || 0) })`);
  console.log(JSON.stringify(info));
} finally { await pg.close(); }
