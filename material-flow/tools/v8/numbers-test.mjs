import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPage} from '../v7/cdp.mjs';
import {readProjects} from '../v7/scene-node.mjs';
import {numbers,tripsPerShift} from '../v7/mf-ops.mjs';
const file=process.argv[2]||'dist/Material_Flow_Player_v8.0.html',html=readFileSync(file,'utf8');
const bundle=JSON.parse(/<script id="mf7-embedded" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]),P=readProjects(file);
for(const tab of ['inj1','inj2','eps','press']){
 const expected=numbers(bundle.projects[tab],P),pg=await openPage(file,tab);
 try{
  const actual=await pg.ev(`(() => {MF.pause();MFX.setTab('numbers');return {steps:MF.D.flows.map(f=>f.items.slice(1).map(it=>[it.metres,it.t1-it.t0])),rows:[...document.querySelectorAll('.num7 tr[data-seconds]')].map(r=>({metres:+r.dataset.metres,seconds:+r.dataset.seconds,cells:[...r.cells].map(c=>c.textContent)}))};})()`);
  assert.equal(actual.steps.length,expected.length);assert.equal(actual.rows.length,expected.length);
  for(const [i,n]of expected.entries()){
   assert.equal(actual.steps[i].length,n.steps.length);
   n.steps.forEach((s,j)=>{assert(Math.abs(actual.steps[i][j][0]-s.metres)<1e-6,tab+' distance '+s.id);assert(Math.abs(actual.steps[i][j][1]-s.seconds)<1e-6,tab+' time '+s.id);});
   const r=actual.rows[i];assert(Math.abs(r.metres-n.metres)<1e-6);assert(Math.abs(r.seconds-n.seconds)<1e-6);
   assert.equal(r.cells[1],n.metres.toFixed(0)+' m');assert.equal(r.cells[2],`${Math.floor(n.seconds/60)}:${(n.seconds%60).toFixed(1).padStart(4,'0')}`);assert.equal(+r.cells[3],tripsPerShift(n,bundle.projects[tab].settings?.shift||8));
  }
  assert.deepEqual(pg.errors,[]);console.log('PASS '+tab+': CLI, engine steps and Numbers table agree within 1e-6');
 }finally{await pg.close();}
}
