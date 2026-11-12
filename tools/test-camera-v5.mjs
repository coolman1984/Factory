// Camera acceptance for a player file: plays the whole flow on the real GPU and, every 4th frame, checks that
//   (1) the trolley is on screen and inside the central area (margins: 7% of the width/height, after the panel view offset),
//   (2) nothing solid (walls, racks, machines, columns, devices) lies between the camera and the trolley (three.js raycast
//       against the replica's instanced meshes, ignoring hits within 4 units of the trolley itself).
// Usage: node tools/test-camera-v5.mjs <player.html> [hash=inj1] [cams=guided,chase] [speeds=1,3] [flow=0]   Exit 1 on any failure.
import { openPage } from "./v7/cdp.mjs";

const [file, hash = "inj1", camList = "guided,chase", speedList = "1,3", flow = "0"] = process.argv.slice(2);
if (!Number.isInteger(+flow) || +flow < 0) throw new Error('flow must be a non-negative integer');
let failed = false;
async function run(cam, speed) {
  const pg = await openPage(file, hash, { query: "q=high", size: "1920,1080" });
  try {
    await pg.wait(400); // openPage already waits 400 ms after readiness; retain the original settling interval.
    const res = await pg.ev(`(async()=>{
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
      return out; })()`, { timeoutMs: 600000 });
    const pct = (n) => (100 * n / Math.max(1, res.checked)).toFixed(1) + "%";
    const ok = res.offscreen === 0 && res.occluded === 0 && res.edge / Math.max(1, res.checked) < .05;
    if (!ok) failed = true;
    console.log(`${ok ? "PASS" : "FAIL"} flow=${flow} cam=${cam} speed=${speed}x: ${res.checked} checks over ${res.frames} frames; offscreen ${res.offscreen}, near edge ${pct(res.edge)}, occluded ${pct(res.occluded)}`);
    for (const w of res.worst) console.log("   ", JSON.stringify(w));
  } finally { await pg.close(); }
}
for (const cam of camList.split(",")) for (const sp of speedList.split(",")) await run(cam, +sp);
process.exit(failed ? 1 : 0);
