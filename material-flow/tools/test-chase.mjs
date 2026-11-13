// Real geometry, full near-plane sphere, seeks/stack/lifts/speeds; screenshots stay local.
import {openChrome} from './chrome-session.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.argv[2] || 'private/evidence/chase'; mkdirSync(out,{recursive:true});
const chrome=await openChrome({file:new URL('../dist/Material_Flow_Player.html?q=low',import.meta.url)});
try {
  await chrome.evaluate('Promise.resolve(MF.ready).then(()=>true)');
  const result=await chrome.evaluate(`(()=>{
    const T=THREE, boxes=[], matrix=new T.Matrix4(), local=new T.Box3();
    // Independently expand EACH instance geometry; don't trust the envelope's aggregate top.
    for(const {im} of MF.REP.meshes){
      im.geometry.computeBoundingBox();
      for(let i=0;i<im.count;i++){ im.getMatrixAt(i,matrix); local.copy(im.geometry.boundingBox).applyMatrix4(matrix); boxes.push({plate:im.parent,box:local.clone()}); }
    }
    let checks=0,collisions=0,minClearance=Infinity; const failures=[];
    MF.pause(); MF.setCam('chase'); MF.setView('3d');
    for(let f=0;f<MF.D.flows.length;f++){
      MF.setFlow(f);
      const times=[0,4,...MF.D.flows[f].items.flatMap(i=>[i.t0+.01,(i.t0+i.tm)/2,i.tm-.001])];
      for(const stack of [0,.25,.5,.75,1]) for(const speed of [.5,1,8]) for(const time of times){
        MF.S.stack=stack; MF.S.stackUser=stack; MF.S.R=1; MF.setSpeed(speed); MF.seek(time); MF.frame(1/60,time);
        const c=MF.S.c, sp=Math.sin(c.pol), eye=new T.Vector3(c.x+c.dist*sp*Math.sin(c.az),c.y+c.dist*Math.cos(c.pol),c.z+c.dist*sp*Math.cos(c.az));
        const halfH=8*Math.tan(28*Math.PI/360), halfW=halfH*innerWidth/innerHeight;
        const radius=Math.hypot(8,halfH,halfW); // independent near-plane corner radius
        for(const {plate,box} of boxes){
          const tx=plate.position.x,ty=plate.position.y,tz=plate.position.z;
          const dx=Math.max(box.min.x+tx-eye.x,0,eye.x-box.max.x-tx), dy=Math.max(box.min.y+ty-eye.y,0,eye.y-box.max.y-ty), dz=Math.max(box.min.z+tz-eye.z,0,eye.z-box.max.z-tz);
          const gap=Math.hypot(dx,dy,dz)-radius;
          minClearance=Math.min(minClearance,gap);
          if(gap < -1e-5){ collisions++; if(failures.length<5) failures.push({f,stack,speed,time,gap}); }
        }
        checks++;
      }
    }
    MF.S.stackUser=null; MF.setFlow(0); MF.setCam('chase'); MF.setView('3d');
    const lift=MF.D.flows[0].items.find(i=>i.s.lift); MF.seek((lift.t0+lift.tm)/2); for(let j=0;j<90;j++) MF.frame(1/60,MF.S.t);
    return {checks,boxes:boxes.length,collisions,minClearance,failures,errorBox:document.getElementById('err').textContent};
  })()`);
  await chrome.screenshot(out+'/chase-lift.png');
  writeFileSync(out+'/report.json',JSON.stringify({...result,gpu:chrome.gpu,errors:chrome.errors},null,2));
  console.log(JSON.stringify({...result,gpu:chrome.gpu,errors:chrome.errors}));
  if(result.collisions || result.errorBox || chrome.errors.length) process.exitCode=1;
} finally { await chrome.close(); }
