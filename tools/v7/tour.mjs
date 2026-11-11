// Visual tour: screenshots of the player and every Studio panel, for a quick visual bug hunt.
// Usage: node tools/v7/tour.mjs [player=dist/Material_Flow_Player_v7.6.html] [outDir=dist/test/tour] [size=1920,1080]
import { mkdirSync, writeFileSync } from "node:fs";
import { openPage } from "./cdp.mjs";
const [file = "dist/Material_Flow_Player_v7.6.html", out = "dist/test/tour", size = "1920,1080"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const shots = [
  ["play", "MF.setFlow(0); MF.seek(MF.D.flows[0].items[3].tm); MF.pause();"],
  ["objects", "MFX.setEditor(true); MFX.setTab('objects'); MFX.select({ kind: 'device', i: 0 });"],
  ["paths", "MFX.setTab('paths'); MFX.ed.stepSel = 2;"],
  ["steps", "MFX.setTab('steps'); MFX.ed.stepSel = 2;"],
  ["director", "MFX.setTab('director'); MFX.addKey(); MFX.addCaption();"],
  ["numbers", "MFX.setTab('numbers');"],
  ["project", "MFX.setTab('project');"],
  ["keys", "document.getElementById('keys7').style.display = 'block';"],
  ["scenefile", "document.getElementById('keys7').style.display = 'none'; MFX.setEditor(false); MFS.open(true);"],
  ["plan2d", "MFS.open(false); MF.setView('2d');"],
];
for (const tab of ["inj1", "inj2"]) {
  const pg = await openPage(file, tab, { size });
  try {
    for (const [name, js] of shots) {
      await pg.ev(`(() => { ${js} return 1; })()`); await pg.wait(1200);
      const s = await pg.call("Page.captureScreenshot", { format: "png" }); writeFileSync(`${out}/${tab}-${name}.png`, Buffer.from(s.data, "base64"));
    }
    if (pg.errors.length) console.log(tab, "page errors:", pg.errors.slice(0, 5));
  } finally { await pg.close(); }
}
console.log("shots in " + out);
