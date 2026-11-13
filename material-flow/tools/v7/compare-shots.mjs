// Same-framing top views of one floor area for layout checking: the slide's own plan picture ("original"), the replica plan
// drawing ("replica" 2D) and the 3D replica seen from straight above. Writes <out>/<name>-original.png, -replica.png, -3d.png.
// Usage: node tools/v7/compare-shots.mjs <player> <tab> <x0 m> <y0 m> <x1 m> <y1 m> <out dir> <name> [width=2400]
import { writeFileSync, mkdirSync } from "node:fs";
import { openPage } from "./cdp.mjs";
const [file, tab, x0, y0, x1, y1, out, name, width = "2400"] = process.argv.slice(2);
const W = +width, aspect = (+x1 - +x0) / (+y1 - +y0), H = Math.round(W / aspect);
if (![+x0, +y0, +x1, +y1, W].every(Number.isFinite) || +x1 <= +x0 || +y1 <= +y0 || W < 1 || H < 1) throw new Error("finite bounds x0 < x1, y0 < y1 and positive width required");
mkdirSync(out, { recursive: true });
const pg = await openPage(file, tab, { size: `${W},${H}` });
try {
  await pg.ev(`(() => { MFX.setPad(false); document.body.classList.add("bare"); for (const e of document.querySelectorAll(".ui")) e.style.visibility = "hidden"; return 1; })()`);
  const frame = `(() => { const cx = (${+x0} + ${+x1}) / 2 / .3, cy = (${+y0} + ${+y1}) / 2 / .3, w = MF.W(cx, cy, MF.S.stack, 0); const halfH = (${+y1} - ${+y0}) / 2 / .3; const dist = halfH / Math.tan(MF.x.camera.fov * Math.PI / 360); MF.setCam("free"); Object.assign(MF.S.c, { x: w.x, y: w.y, z: w.z, dist, az: 0, pol: .0005 }); MFX.cam.inited = false; return 1; })()`;
  const snap = async (suffix) => { await pg.wait(1800); const r = await pg.call("Page.captureScreenshot", { format: "png" }); writeFileSync(`${out}/${name}-${suffix}.png`, Buffer.from(r.data, "base64")); };
  await pg.ev(`(() => { MF.setView("2d"); MF.setPlan("original"); MF.setFlow(0); MF.seek(MF.D.flows[0].items[1].t0); MF.pause(); return 1; })()`); await pg.ev(frame); await snap("original");
  await pg.ev(`(() => { MF.setPlan("replica"); return 1; })()`); await pg.ev(frame); await snap("replica");
  // 3D: show only the floor this area is on (an upper floor is stacked above and would hide the floor below in a top view)
  await pg.ev(`(() => { MF.setView("3d"); return 1; })()`); await pg.wait(2500); await pg.ev(frame);
  await pg.ev(`(() => { const pl = MF.x.plateOf((${+x0} + ${+x1}) / 2 / .3, (${+y0} + ${+y1}) / 2 / .3), P = MF.x.plates; const hide = () => { for (const k of Object.keys(P)) if (P[k] && "visible" in P[k]) P[k].visible = k === pl; for (const f of MF.x.floors || []) for (const k of ["art", "slab"]) if (f[k]) f[k].visible = f.key === pl; MF.x.scene.traverse((o) => { const m = o.material, tag = m && !Array.isArray(m) && m.userData && m.userData.plate; if (tag) o.visible = tag === pl; }); requestAnimationFrame(hide); }; hide(); window.__shownPlate = pl; return pl; })()`);   // every frame: the engine sets floor visibility itself
  await snap("3d");
  console.log(`${out}/${name}-{original,replica,3d}.png (${W}x${H})`);
} finally { await pg.close(); }
