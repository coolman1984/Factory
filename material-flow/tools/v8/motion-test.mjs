import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {loadSceneCore,loadMotionCore,readProjects,layoutFor} from '../v7/scene-node.mjs';
import {storyStart} from '../v7/mf-ops.mjs';
const SC=loadSceneCore(),MC=loadMotionCore(),P=readProjects();let count=0;
const files=['docs/examples',...(existsSync('private/v7/scenes')?['private/v7/scenes']:[])].flatMap(d=>readdirSync(d).filter(f=>f.endsWith('.scene.json')).map(f=>d+'/'+f));
for(const file of files){const sc=JSON.parse(readFileSync(file)),L=layoutFor(P,sc.project),data=SC.toInternal(sc,L).data;
 for(const n of MC.numbers(data,data.flows,L.elevators)){assert(Number.isFinite(n.metres)&&Number.isFinite(n.seconds));assert(Math.abs(n.steps.reduce((s,x)=>s+x.seconds,0)-n.seconds)<1e-9);assert(Math.abs(n.steps.reduce((s,x)=>s+x.metres,0)-n.metres)<1e-9);assert(n.steps.every(s=>s.seconds>=0&&s.metres>=0));count++;}
}
// A wait other than 0.7 must affect leave, not the arrival timestamp. Also exercises a zero-length route.
const sc=JSON.parse(readFileSync('docs/examples/sample.scene.json'));sc.paths[0].steps[0].wait=3.4;
const first=sc.paths[0].steps[0];assert.equal(storyStart(sc,P,sc.paths[0].id,first.id,'start'),MC.CONST.INTRO);
assert(Math.abs(storyStart(sc,P,sc.paths[0].id,first.id,'leave')-storyStart(sc,P,sc.paths[0].id,first.id,'arrive')-3.4)<1e-9);
const sched=MC.schedule([[0,0],[0,0]],undefined);assert.equal(sched.duration,0);assert.equal(MC.sample(sched,0,{}).v,0);
const scan=MC.withScanStops(MC.schedule([[0,0],[100,0]],undefined), 'F',[{type:'rfid-manual',routeBound:true,plate:'F',lane:[50,0],sym:0}]);assert.equal(scan.phases.filter(p=>p.k==='scan').length,1);
assert(Math.abs(scan.phases.find(p=>p.k==='scan').t1-scan.phases.find(p=>p.k==='scan').t0-MC.CONST.SCAN_T)<1e-9);
console.log('OK '+count+' paths');
