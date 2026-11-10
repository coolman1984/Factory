// Camera acceptance for a player file: plays the whole flow on the real GPU and, every 4th frame, checks that
//   (1) the trolley is on screen and inside the central area (margins: 7% of the width/height, after the panel view offset),
//   (2) nothing solid (walls, racks, machines, columns, devices) lies between the camera and the trolley (three.js raycast
//       against the replica's instanced meshes, ignoring hits within 4 units of the trolley itself).
// Usage: node tools/test-camera-v5.mjs <player.html> [hash=inj1] [cams=guided,chase] [speeds=1,3] [flow=0]   Exit 1 on any failure.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [file, hash = "inj1", camList = "guided,chase", speedList = "1,3", flow = "0"] = process.argv.slice(2);
if (!Number.isInteger(+flow) || +flow < 0) throw new Error('flow must be a non-negative integer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
async function run(cam, speed) {
  const port = 9300 + Math.floor(Math.random() * 400), profile = mkdtempSync(join(tmpdir(), "mf_cam_"));
  const url = pathToFileURL(resolve(file)).href + "?q=high#" + hash;
  const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1920,1080", url], { stdio: "ignore", windowsHide: true });
  try {
    let tabs = null; for (let i = 0; i < 60 && !tabs; i++) { await wait(500); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* starting */ } }
    const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
    let id = 0; const call = (m, p = {}) => new Promise((r) => { const i = ++id; const f = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", f); r(d.result); } }; ws.addEventListener("message", f); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
    const ev = async (e) => { const r = await call("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    await call("Runtime.enable");
    for (let i = 0; i < 120; i++) { await wait(500); if (await ev(`typeof MF==='object'&&!!MF.ready`)) break; }
    await ev(`Promise.resolve(MF.ready).then(()=>1)`); await wait(800);
    const res = await ev(`(async()=>{
      const T=window.THREE, cam=MF.lot.parent && MF.camera, ray=new T.Raycaster(), lot=new T.Vector3(), eye=new T.Vector3(), dir=new T.Vector3();
      const solids=[...MF.floors.flatMap(f=>[f.art,f.slab]), ...MF.REP.meshes.map(m=>m.im), ...Object.values(MF.devices.groups||{}).flatMap(g=>g.children.filter(o=>o.isInstancedMesh))];
      if (!MF.D.flows[${+flow}]) throw new Error('flow index out of range');
      MF.setFlow(${+flow}); MF.setCam(${JSON.stringify(cam)}); MF.setSpeed(${speed}); MF.seek(0); MF.play();
      const out={frames:0,checked:0,offscreen:0,edge:0,occluded:0,worst:[],steps:{}}; let k=0;
      const total=MF.D.flows[MF.S.flow].total;
      await new Promise(done=>{ (function loop(){ if(MF.S.t>=total-.05||!MF.S.playing){done();return;} out.frames++;
        if(++k%4===0 && MF.S.t>MF.stepAt(MF.S.t).t0 && !MF.stepAt(MF.S.t).s.intro && MF.S.R>.95){
          out.checked++; MF.lot.getWorldPosition(lot); lot.y+=2; const p=MF.proj(lot), w=innerWidth, h=innerHeight;
          const st=MF.stepAt(MF.S.t).i; const s=out.steps[st]||(out.steps[st]={n:0,bad:0}); s.n++;
          let bad='';
          if(p[2]<-1||p[2]>1||p[0]<0||p[0]>w||p[1]<0||p[1]>h){out.offscreen++;bad='offscreen';}
          else if(p[0]<w*.07||p[0]>w*.93||p[1]<h*.07||p[1]>h*.93){out.edge++;bad='edge';}
          eye.copy(MF.camera.eye); dir.subVectors(lot,eye); const L=dir.length(); dir.normalize(); ray.set(eye,dir); ray.far=L-4;
          const visible=solids.filter(o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true});
          const hit=ray.intersectObjects(visible,false).find(x=>x.object.material&&!x.object.material.transparent);
          if(hit){out.occluded++;bad=bad||'occluded: '+(hit.object.name||hit.object.material.name||'mesh');}
          if(bad){s.bad++; if(out.worst.length<12) out.worst.push({t:+MF.S.t.toFixed(1),step:st,bad,x:Math.round(p[0]),y:Math.round(p[1])});}
        }
        requestAnimationFrame(loop); })(); });
      return out; })()`);
    const pct = (n) => (100 * n / Math.max(1, res.checked)).toFixed(1) + "%";
    const ok = res.offscreen === 0 && res.occluded === 0 && res.edge / Math.max(1, res.checked) < .05;
    if (!ok) failed = true;
    console.log(`${ok ? "PASS" : "FAIL"} flow=${flow} cam=${cam} speed=${speed}x: ${res.checked} checks over ${res.frames} frames; offscreen ${res.offscreen}, near edge ${pct(res.edge)}, occluded ${pct(res.occluded)}`);
    for (const w of res.worst) console.log("   ", JSON.stringify(w));
    ws.close();
  } finally { ch.kill(); await wait(800); try { rmSync(profile, { recursive: true, force: true }); } catch { /* held */ } }
}
for (const cam of camList.split(",")) for (const sp of speedList.split(",")) await run(cam, +sp);
process.exit(failed ? 1 : 0);
