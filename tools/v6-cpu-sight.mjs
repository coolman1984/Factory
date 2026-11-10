// CPU-only candidate sight audit using the built player schedule and actual replica geometry.
// This does not simulate camera springs, rasterization, GPU timing or visual acceptance.
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {applyEdits} from './v6/edits.mjs';
import {K,M,DIMS,TROLLEY} from './v5/device-dims.mjs';
process.on('uncaughtException',e=>{console.error(e.name+': '+e.message.slice(0,160));process.exit(1)});
import {performance} from 'node:perf_hooks';
const html=readFileSync('dist/Material_Flow_Player_v6.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
for(const s of scripts)new vm.Script(s);
const P=applyEdits(JSON.parse(readFileSync('private/v5/P-v4.json','utf8'))),G=JSON.parse(readFileSync('private/v6/projects.json','utf8'));for(const [tab,g]of Object.entries(G))Object.assign(P[tab].data,g);
const player=scripts[6];const out=[];
for(const [tab,project]of Object.entries(P)) {
 const context=vm.createContext({console,performance});context.window=context;
 vm.runInContext(scripts[0],context);vm.runInContext(scripts[5],context);
 Object.assign(context,{D:project.data,RP:project.replica,MF_DEVICE_DIMS:{K,M,DIMS,TROLLEY},
  document:{createElement:()=>({style:{setProperty(){}}})},labels:{append(){}},innerWidth:1920,innerHeight:1080});
 vm.runInContext(`
 const T=THREE,[CX,CY]=D.center||[480,290],PT_M=.3,GAP=120,INTRO=7,DWELL=.7,LIFT_T=6,STATION_T=.01,V_MAX=4,RAMP_T=.25,TURN_T=.3,TURN_SNAP=1e-6,MIN_SEG=1e-4;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,ease=t=>t*t*(3-2*t),wrapPi=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const pl=p=>p.slice(1).reduce((n,q,i)=>n+Math.hypot(q[0]-p[i][0],q[1]-p[i][1]),0),st={racks:0,machines:0,columns:0,walls:0};
 const plates=Object.fromEntries(Object.keys(D.plates).map(k=>[k,new T.Group()])),floors=[];
 const ELEVATORS=D.elevators||[],elevatorFor=f=>ELEVATORS.find(e=>e.label===f.steps.find(s=>s.lift)?.elevator)||ELEVATORS[0];let E=ELEVATORS[0];
 const S={t:0,flow:0,playing:true,speed:3,stack:0,R:1},camera={position:new T.Vector3()},frameDt=.25;
 const glideEase=u=>{u=clamp(u,0,1);return ease(u)},glideX=s=>glideEase((s-.22)/.78),glideY=s=>glideEase(s/.36);
 const plateOf=(x,y)=>Object.entries(D.plates).reduce((best,[key,p])=>{const z=p.zone,d=Math.max(z[0]-x,0,x-z[2])**2+Math.max(z[1]-y,0,y-z[3])**2;return d<best.d?{key,d}:best},{key:Object.keys(D.plates)[0],d:Infinity}).key;
 const W=(x,y,s=S.stack,up=.8,out=new T.Vector3())=>{const p=D.plates[plateOf(x,y)];return out.set(x-CX+glideX(s)*p.dx,glideY(s)*p.lift*GAP+up,y-CY+glideX(s)*p.dz)};
 ${player.slice(player.indexOf('  function floorShape('),player.indexOf('  for (const [key, P] of plateEntries)'))}
 for(const [key,p]of Object.entries(D.plates)) {const x=Math.min(...p.pics.map(p=>p.x)),y=Math.min(...p.pics.map(p=>p.y)),w=Math.max(...p.pics.map(p=>p.x+p.w))-x,h=Math.max(...p.pics.map(p=>p.y+p.h))-y;
  const art=new T.Mesh(floorGeometry(key,x+w/2,y+h/2,w,h)),slab=new T.Mesh(floorGeometry(key,x+w/2,y+h/2,w+8,h+8,true));
  art.rotation.x=slab.rotation.x=-Math.PI/2;art.position.set(x+w/2-CX,.12,y+h/2-CY);slab.position.set(x+w/2-CX,-6.2,y+h/2-CY);plates[key].add(art,slab);floors.push({key,art,slab});
 }
 const REP=MFReplica.build({T,plates,R:RP,CX,CY,info:D.plates,plateOf});
 ${player.slice(player.indexOf('  const ZERO_POINT'),player.indexOf('  D.flows.forEach(buildFlow);'))}
 D.flows.forEach(buildFlow);const F=()=>D.flows[S.flow],stepAt=t=>F().items.find(it=>t<it.t1)||F().items.at(-1),worldHigh=new T.Vector3();
 ${player.slice(player.indexOf('  function lotPos('),player.indexOf('  function lotWorld('))}
 var DEV;
 ${readFileSync("tools/v5/devices.js","utf8")}
 ${readFileSync('tools/v5/sight.js','utf8')}
 globalThis.probe=()=>{
  const records=[];const start=performance.now();
  for(let fi=0;fi<D.flows.length;fi++) {S.flow=fi;E=F().E||E;SIGHT.reset();let blocked=0,tests=0,lastAz=-.55;const failures=[];const lp={},target=new T.Vector3(),eye=new T.Vector3();
   const lift=F().items.find(it=>it.s.lift),sm=x=>ease(clamp(x,0,1));
   for(let t=INTRO;t<F().total;t+=.5){S.t=t;S.stack=lift?Math.min(sm((t-(lift.t0-5))/4.6),1-sm((t-(lift.t1+2.6))/3.6)):0;
    for(const [key,g]of Object.entries(plates)){const p=D.plates[key];g.position.set(glideX(S.stack)*p.dx,glideY(S.stack)*p.lift*GAP,glideX(S.stack)*p.dz);}
    lotPos(t,lp);worldFromLot(lp,S.stack,target);const choice=SIGHT.choose(target,360,-.55,lastAz,lp);lastAz=choice.az;
    eye.set(target.x+360*Math.sin(choice.pol)*Math.sin(choice.az),target.y+360*Math.cos(choice.pol),target.z+360*Math.sin(choice.pol)*Math.cos(choice.az));target.y+=2;
    camera.position.copy(eye);tests++;if(!SIGHT.clearLine(eye,target)){blocked++;failures.push({t,lp:{...lp,it:undefined},choice:{...choice},target:target.toArray(),eye:eye.toArray()});}
   }
   records.push({flow:F().id,duration:F().total,tests,blocked,failures,manualHolds:F().items.reduce((n,it)=>n+(it.sched?.phases.filter(p=>p.k==='scan').length||0),0)});
  }
  return {records,boxes:SIGHT.boxes.length,ms:performance.now()-start};
 };`,context);
 const result=context.probe();out.push({tab,...result});console.log(tab,result.records.map(r=>[r.flow,r.blocked,r.tests]),Math.round(result.ms)+'ms');
}
writeFileSync('private/v6/cpu-sight-audit.json',JSON.stringify(out,null,2));
