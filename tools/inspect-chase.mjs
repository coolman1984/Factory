import{openChrome}from './chrome-session.mjs';
const c=await openChrome({file:new URL('../dist/Material_Flow_Player.html?q=low',import.meta.url)});
try{
await c.evaluate('Promise.resolve(MF.ready).then(()=>true)');
console.log(JSON.stringify(await c.evaluate(`(()=>{MF.pause();MF.setView('3d');MF.setCam('chase');MF.setSpeed(1);MF.S.stack=1;MF.S.stackUser=1;MF.S.R=1;const item=MF.D.flows[0].items.find(i=>i.s.lift);MF.seek((item.t0+item.tm)/2);for(let j=0;j<120;j++)MF.frame(1/60,MF.S.t);const lp=MF.lotPose(MF.S.t),E=MF.D.elevator,lot=MF.W(...E.low).lerp(MF.W(...E.high),lp.lift);lot.y+=3;const eye=MF.camera.eye,ray=new THREE.Raycaster(lot,new THREE.Vector3().subVectors(eye,lot).normalize(),1,lot.distanceTo(eye));const scene=MF.floors[0].art.parent.parent;const hits=ray.intersectObjects(scene.children,true).filter(h=>h.object.visible && h.distance>10 && !h.object.material.transparent).slice(0,8).map(h=>({name:h.object.name,type:h.object.type,mat:h.object.material.name,plate:h.object.material.userData.plate,dist:h.distance,point:h.point.toArray(),instance:h.instanceId}));return{eye:eye.toArray(),target:MF.camera.target.toArray(),want:MF.want,lot:lot.toArray(),lp,hits}})()`),null,2));
await c.screenshot('private/evidence/chase/diagnostic.png');
}finally{await c.close()}
