// Camera review: actual pad input release and free-camera lock/fly continuity.
import assert from 'node:assert/strict';
import {openPage} from './cdp.mjs';
const pg = await openPage(process.argv[2], 'inj1');
try {
  await pg.ev('(MF.prepared || Promise.resolve()).then(() => 1)');
  await pg.ev('MF.pause(); MF.seek(12); MFX.goFree(true); MFX.setPad(true); 1');
  const rect = await pg.ev(`(() => { const r=document.querySelector('.stick[data-k="orbit"]').getBoundingClientRect(); return {x:r.x+r.width*.75,y:r.y+r.height*.5}; })()`);
  await pg.call('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1,buttons:1});
  assert(await pg.ev('Math.abs(MFX.cam.vel.ox)>0.1'));
  await pg.ev('window.dispatchEvent(new Event("blur")); 1');
  assert(await pg.ev('Object.values(MFX.cam.vel).every(v=>v===0)'));
  await pg.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+3,y:rect.y,buttons:1});
  assert(await pg.ev('Object.values(MFX.cam.vel).every(v=>v===0)'));
  await pg.call('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1,buttons:0});
  await pg.ev('MFX.cam.vel.zoom=1; MFX.setPad(false); 1');
  assert(await pg.ev('Object.values(MFX.cam.vel).every(v=>v===0)'));
  console.log('PASS real pad press, blur releases capture and velocity, held move stays released, close resets zoom');
  assert(await pg.ev(`(() => { const c=MF.S.c; MFX.cam.goal.x=c.x+100; MFX.flyTo({x:c.x+20},1); return Math.abs(MFX.cam.fly.a.x-c.x)<1e-8; })()`));
  console.log('PASS fly starts at the rendered pose rather than a stale goal');
  for (const speed of [1,3,8]) {
    const error = await pg.ev(`(async () => {
      MF.pause(); MF.seek(12); MFX.setLock(true); MF.setSpeed(${speed}); MF.S.speed = ${speed};
      await new Promise(r=>setTimeout(r,1300)); MF.play();
      let worst=0, count=0; const until=performance.now()+1300;
      while(performance.now()<until && MF.S.playing){ await new Promise(r=>requestAnimationFrame(r));
        const p=MF.lotPose(MF.S.t), w=MF.W(p.x,p.y,MF.S.stack,0), c=MF.S.c;
        worst=Math.max(worst,Math.hypot(c.x-w.x,c.z-w.z)); count++;
      }
      MF.pause(); MFX.setLock(false); return {worst,count,speed:MF.S.speed};
    })()`);
    assert.equal(error.speed,speed);
    assert(error.count>10 && error.worst<0.1,JSON.stringify({speed,...error}));
    console.log(`PASS free trolley lock ${speed}x: target offset error ${error.worst.toFixed(5)}`);
  }
  assert.equal(pg.errors.length,0,pg.errors.join(' | '));
} finally {await pg.close();}
