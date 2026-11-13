// Run viewer (PLATFORM_PLAN P3): one offline HTML file that plays a simulation run's event log over the plan:
// every carrier on its route, queues for movers and elevators, starved lines, a clock, seek, speed and the KPI table.
// Positions are a pure function of story time t (seekable, identical on replay). Optional CAD layout underlay (P6).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const safe = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

export function buildViewer(runDir, out, { layout } = {}) {
  const rd = (f) => JSON.parse(readFileSync(join(runDir, f), "utf8"));
  const receipt = rd("receipt.json"), log = rd("log.json"), input = rd("input.json"), geo = rd("geometry.json");
  const lay = layout && existsSync(layout) ? JSON.parse(readFileSync(layout, "utf8")) : null;
  const sim = readFileSync(new URL("../../src/core/sim-core.js", import.meta.url), "utf8"), kpi = readFileSync(new URL("../../src/core/kpi-core.js", import.meta.url), "utf8");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(receipt.site)} · ${esc(receipt.scenario)} · simulation run</title>
<style>
:root{--bg:#f4f6f9;--panel:#fff;--ink:#1d2733;--mute:#66758a;--line:#d8dee7;--acc:#2563eb;--bad:#c2410c}
*{box-sizing:border-box}body{margin:0;font:13px/1.4 "Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--ink);display:grid;grid-template-columns:1fr 340px;grid-template-rows:auto 1fr auto;height:100vh}
header{grid-column:1/3;padding:10px 16px;background:var(--panel);border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:baseline}
header h1{font-size:16px;margin:0}header .m{color:var(--mute)}
#stage{position:relative;overflow:hidden}canvas{display:block;width:100%;height:100%}
aside{background:var(--panel);border-left:1px solid var(--line);overflow:auto;padding:12px 14px}
aside h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin:14px 0 6px}
table{border-collapse:collapse;width:100%}td{padding:3px 4px;border-bottom:1px solid var(--line);vertical-align:top}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
footer{grid-column:1/3;background:var(--panel);border-top:1px solid var(--line);padding:8px 16px;display:flex;gap:12px;align-items:center}
footer input[type=range]{flex:1}button,select{font:inherit;padding:4px 10px;border:1px solid var(--line);border-radius:4px;background:#fff;cursor:pointer}
#clock{font-variant-numeric:tabular-nums;min-width:120px;font-weight:600}.warn{color:var(--bad)}
</style></head><body>
<header><h1>${esc(receipt.site)} · ${esc(receipt.model)} · ${esc(receipt.scenario)}</h1><span class="m">model result · ${receipt.days} days · seed ${receipt.seed} · ${receipt.replications} replication(s) · ${receipt.orders} orders · ${receipt.assumptions} assumed value(s)</span></header>
<div id="stage"><canvas id="cv"></canvas></div>
<aside><h2>Now</h2><table id="now"></table><h2>Flows</h2><table id="flows"></table><h2>Results (mean, 95% range)</h2><table id="kpis"></table><h2>Limits</h2><div id="limits" class="m"></div></aside>
<footer><button id="play">Play</button><select id="speed"><option value="60">60x</option><option value="300" selected>300x</option><option value="1200">1200x</option><option value="3600">3600x</option></select><span id="clock"></span><input id="seek" type="range" min="0" step="1"></footer>
<script>${sim}</script><script>${kpi}</script>
<script>
"use strict";
const RECEIPT=${safe(receipt)}, LOG=${safe(log)}, INPUT=${safe(input)}, GEO=${safe(geo)}, LAYOUT=${safe(lay)};
const K=MFSim.K, PAL=["#2563eb","#d97706","#059669","#db2777","#7c3aed","#0891b2","#65a30d","#dc2626"];
const flowCol=(fi)=>PAL[fi%PAL.length];
// per order: timeline of segments {t0,t1,kind,step} from the log
const orders=new Map();
for(const [t,k,a,b] of LOG.events){
  if(k===K.created){orders.set(a,{id:a,flow:b,created:t,segs:[],end:Infinity});continue;}
  const o=orders.get(a);if(!o)continue;
  if(k===K.assigned)o.assigned=t;
  else if(k===K.stepStart)o.cur={step:b,t0:t};
  else if(k===K.liftWait)o.cur.wait=t;
  else if(k===K.liftStart){o.cur.t0=t;o.cur.lift=true;}
  else if(k===K.liftEnd)o.cur.t1=t;
  else if(k===K.stepEnd){const s=INPUT.flows[o.flow].steps[b],dw=typeof s.dwell==="number"?s.dwell:0;const t1=o.cur.t1!=null?o.cur.t1:t-dw;o.segs.push({step:b,t0:o.cur.t0,t1:Math.max(o.cur.t0,t1),t2:t,lift:!!o.cur.lift,wait:o.cur.wait});o.cur=null;}
  else if(k===K.delivered)o.delivered=t;
  else if(k===K.returned)o.end=t;
}
const flowSteps=LOG.flows.map(f=>(GEO.flows[f.id]||{steps:[]}).steps);
function lens(p){const L=[0];for(let i=1;i<p.length;i++)L.push(L[i-1]+Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]));return L;}
const stepLens=flowSteps.map(st=>st.map(s=>lens(s.pts||[])));
function along(fi,si,u){const p=(flowSteps[fi][si]||{}).pts||[];if(!p.length)return null;const L=stepLens[fi][si],tot=L[L.length-1],d=u*tot;let i=1;while(i<L.length-1&&L[i]<d)i++;const s=L[i]-L[i-1]||1,f=Math.min(1,Math.max(0,(d-L[i-1])/s));return [p[i-1][0]+(p[i][0]-p[i-1][0])*f,p[i-1][1]+(p[i][1]-p[i-1][1])*f];}
function lastPt(fi,si){const p=(flowSteps[fi][si]||{}).pts||[];return p.length?p[p.length-1]:null;}
function firstPt(fi){for(let si=0;si<flowSteps[fi].length;si++){const p=flowSteps[fi][si].pts||[];if(p.length)return p[0];}const s=GEO.stops[0];return s?[s.x,s.y]:[0,0];}
/* the state at story time t: every order's place */
function at(t){
  const items=[];let waiting=0,liftQ=0,moving=0,returning=0;
  for(const o of orders.values()){
    if(t<o.created||t>=o.end)continue;
    if(o.assigned==null||t<o.assigned){waiting++;items.push({o,ph:"waiting",p:firstPt(o.flow)});continue;}
    if(o.delivered!=null&&t>=o.delivered){returning++;continue;}
    let p=null,ph="loading";
    for(const s of o.segs){
      if(t<s.t0){if(s.wait!=null&&t>=s.wait){ph="lift-queue";liftQ++;p=s.step?lastPt(o.flow,s.step-1):firstPt(o.flow);}break;}
      if(t<s.t1){ph=s.lift?"riding":"moving";moving++;p=along(o.flow,s.step,(t-s.t0)/Math.max(1e-9,s.t1-s.t0));break;}
      ph="at-stop";p=lastPt(o.flow,s.step);
    }
    if(!p)p=firstPt(o.flow);
    items.push({o,ph,p});
  }
  return {items,waiting,liftQ,moving,returning};
}
const starve=[];{const from={};for(const [t,k,a] of LOG.events){if(k===K.starveStart)from[a]=t;else if(k===K.starveEnd&&from[a]!=null){starve.push([a,from[a],t]);delete from[a];}}}
const starvedAt=(t)=>starve.filter(s=>t>=s[1]&&t<s[2]).map(s=>s[0]);
// view transform
const cv=document.getElementById("cv"),cx=cv.getContext("2d");let B=null;
function bounds(){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;const add=(x,y)=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);};
  for(const st of flowSteps)for(const s of st)for(const p of s.pts||[])add(p[0],p[1]);for(const s of GEO.stops)add(s.x,s.y);
  if(LAYOUT&&!flowSteps.some(st=>st.some(s=>(s.pts||[]).length)))for(const g of LAYOUT.segments)add(g[0],g[1]),add(g[2],g[3]);
  if(x0>x1){x0=0;y0=0;x1=100;y1=100;}return {x0,y0,x1,y1};}
function resize(){const r=cv.parentElement.getBoundingClientRect(),d=devicePixelRatio||1;cv.width=r.width*d;cv.height=r.height*d;cx.setTransform(d,0,0,d,0,0);B=bounds();const w=r.width-60,h=r.height-60,s=Math.min(w/Math.max(1,B.x1-B.x0),h/Math.max(1,B.y1-B.y0));B.s=s;B.ox=30+(w-(B.x1-B.x0)*s)/2;B.oy=30+(h-(B.y1-B.y0)*s)/2;B.W=r.width;B.H=r.height;draw();}
const X=(x)=>B.ox+(x-B.x0)*B.s, Y=(y)=>B.oy+(y-B.y0)*B.s;   // plan y grows downwards, as in the scene plan pictures
let T=0,playing=false,last=0;
function draw(){
  if(!B)return;cx.clearRect(0,0,B.W,B.H);cx.fillStyle="#fbfcfe";cx.fillRect(0,0,B.W,B.H);
  if(LAYOUT){cx.strokeStyle="#c9d1dc";cx.lineWidth=1;cx.beginPath();for(const g of LAYOUT.segments){cx.moveTo(X(g[0]),Y(g[1]));cx.lineTo(X(g[2]),Y(g[3]));}cx.stroke();}
  LOG.flows.forEach((f,fi)=>{cx.strokeStyle=flowCol(fi);cx.globalAlpha=.35;cx.lineWidth=3;for(const s of flowSteps[fi]){const p=s.pts||[];if(p.length<2)continue;cx.beginPath();cx.moveTo(X(p[0][0]),Y(p[0][1]));for(const q of p.slice(1))cx.lineTo(X(q[0]),Y(q[1]));cx.stroke();}cx.globalAlpha=1;});
  cx.font="11px Segoe UI";for(const s of GEO.stops){cx.fillStyle="#334155";cx.beginPath();cx.arc(X(s.x),Y(s.y),3.5,0,7);cx.fill();cx.fillStyle="#475569";cx.fillText(s.name||s.id,X(s.x)+6,Y(s.y)-5);}
  const S=at(T),stack=new Map(),MAXS=6;
  for(const it of S.items){const mv=it.ph==="moving"||it.ph==="riding",key=Math.round(it.p[0]*2)+","+Math.round(it.p[1]*2)+it.ph,n=stack.get(key)||0;stack.set(key,n+1);
    if(!mv&&n>=MAXS){if(n===MAXS){}continue;}
    const x=X(it.p[0])+(mv?0:n*7),y=Y(it.p[1])-(mv?0:(it.ph==="waiting"?12:22));
    cx.fillStyle=flowCol(it.o.flow);cx.globalAlpha=it.ph==="waiting"||it.ph==="lift-queue"?.45:1;cx.fillRect(x-4,y-4,8,8);cx.globalAlpha=1;
    if(it.ph==="lift-queue"){cx.strokeStyle="#c2410c";cx.strokeRect(x-5,y-5,10,10);}}
  cx.font="bold 11px Segoe UI";cx.fillStyle="#c2410c";for(const [key,n] of stack){if(n<=MAXS)continue;const it=S.items.find(i=>Math.round(i.p[0]*2)+","+Math.round(i.p[1]*2)+i.ph===key);cx.fillText("+"+(n-MAXS)+" "+it.ph,X(it.p[0])+MAXS*7,Y(it.p[1])-(it.ph==="waiting"?8:18));}
  const st=starvedAt(T);
  document.getElementById("now").innerHTML=row("Time",clock(T))+row("Waiting for a mover",S.waiting)+row("Moving / riding",S.moving)+row("Waiting for an elevator",S.liftQ)+row("Returning empty",S.returning)+row("Starved lines",st.length?'<span class="warn">'+st.map(i=>LOG.flows[i].id).join(", ")+'</span>':"none");
  document.getElementById("clock").textContent=clock(T);document.getElementById("seek").value=Math.floor(T);
}
const row=(a,b)=>"<tr><td>"+a+'</td><td class="n">'+b+"</td></tr>";
function clock(t){const d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60);return "day "+(d+1)+" "+String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");}
function frame(ts){if(playing){const dt=last?(ts-last)/1000:0;T=Math.min(LOG.horizon,T+dt*+document.getElementById("speed").value);if(T>=LOG.horizon)playing=false;}last=ts;draw();requestAnimationFrame(frame);}
document.getElementById("play").onclick=()=>{playing=!playing;document.getElementById("play").textContent=playing?"Pause":"Play";};
const sk=document.getElementById("seek");sk.max=Math.floor(LOG.horizon);sk.oninput=()=>{T=+sk.value;draw();};
// side tables
document.getElementById("flows").innerHTML=LOG.flows.map((f,fi)=>"<tr><td><span class=sw style='background:"+flowCol(fi)+"'></span>"+f.id+'</td><td class="n">'+f.pool.join(", ")+"</td></tr>").join("");
const fmt=(v,u)=>u==="%"?(v*100).toFixed(1):Math.abs(v)>=100?v.toFixed(0):v.toFixed(2);
document.getElementById("kpis").innerHTML=Object.entries(RECEIPT.kpis).map(([k,v])=>{const [l,u]=MFKpi.label(k);return row(l+(u?" <span class=m>("+u+")</span>":""),fmt(v.mean,u)+(v.n>1?' <span class=m>'+fmt(v.lo,u)+"–"+fmt(v.hi,u)+"</span>":""));}).join("");
document.getElementById("limits").innerHTML=(RECEIPT.limits||[]).concat(RECEIPT.warnings||[]).map(esc).join("<br>");
function esc(s){return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
addEventListener("resize",resize);resize();requestAnimationFrame(frame);
window.MFView={seek(t){T=t;draw();return clock(T);},state(t){const S=at(t);return {waiting:S.waiting,moving:S.moving,liftQ:S.liftQ,returning:S.returning,shown:S.items.length,starved:starvedAt(t).length};},horizon:LOG.horizon,ready:true};
window.MF=window.MF||{ready:Promise.resolve(1),prepared:1};   // readiness flag the shared headless driver tools/v7/cdp.mjs waits for
</script></body></html>`;
  writeFileSync(out, html); return { out, bytes: Buffer.byteLength(html) };
}
