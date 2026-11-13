// Records one full video take end to end (whole path, director camera if keys exist, else guided) and saves the file.
// Usage: node tools/v7/take-test.mjs [player=dist/Material_Flow_Player_v7.7.html] [tab=inj1] [flow=0] [speed=3] [outDir=dist/test/takes]
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { openPage } from "./cdp.mjs";
const [file = "dist/Material_Flow_Player_v7.7.html", tab = "inj1", flow = "0", speed = "3", outDir = "dist/test/takes"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true }); const before = new Set(readdirSync(outDir));
const pg = await openPage(file, tab, { size: "1920,1080" });
try {
  await pg.call("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: resolve(outDir) }).catch(() => pg.call("Page.setDownloadBehavior", { behavior: "allow", downloadPath: resolve(outDir) }));
  const info = await pg.ev(`(() => { MF.setFlow(${+flow}); const f = MFX.doc.flows[${+flow}]; const t = { id: "test", name: "Full take", flow: f.id, t0: 0, t1: +MF.D.flows[${+flow}].total.toFixed(2), speed: ${+speed}, cam: "guided", captions: true, card: true, labels: true, quality: "high", fps: 60 };
    const mimes = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9"].map(m => [m, MediaRecorder.isTypeSupported(m)]);
    const orig = URL.createObjectURL; URL.createObjectURL = (b) => { if (b instanceof Blob && /video/.test(b.type)) window.__take = b; return orig(b); };
    MFX.startTake(t); return { mimes, length: t.t1 }; })()`);
  const t0 = Date.now();
  while (await pg.ev(`MFX.rec.active`)) { await pg.wait(1000); if (Date.now() - t0 > 600000) throw new Error("take did not end"); }
  await pg.wait(3000);
  const v = await pg.ev(`(async () => { const b = window.__take; if (!b) return null; const head = new Uint8Array(await b.slice(0, 12).arrayBuffer()); const el = document.createElement("video"); el.muted = true; el.src = URL.createObjectURL(b); await new Promise((r, j) => { el.onloadedmetadata = r; el.onerror = () => j(new Error("the browser cannot read the video")); setTimeout(r, 8000); }); return { type: b.type, mb: +(b.size / 1048576).toFixed(1), ftyp: String.fromCharCode(...head.slice(4, 8)), width: el.videoWidth, height: el.videoHeight, duration: +el.duration.toFixed(1) }; })()`);
  console.log("video:", JSON.stringify(v));
  const files = readdirSync(outDir).filter((f) => !before.has(f));
  console.log(JSON.stringify({ ...info, seconds: ((Date.now() - t0) / 1000).toFixed(1), files: files.map((f) => ({ f, mb: (statSync(`${outDir}/${f}`).size / 1048576).toFixed(1) })), tip: await pg.ev(`document.getElementById("tip").textContent`), errors: pg.errors.slice(0, 3) }, null, 1));
  process.exitCode = v && v.width > 0 && !pg.errors.length ? 0 : 1;
} finally { await pg.close(); }
