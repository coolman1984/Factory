// Read immutable project take-offs and write deterministic routed variants.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {findRoute} from 'file:///D:/WORK/Software%20Development/GitHub/3D-Modeling/packages/industry/src/routing.ts';
const id=process.argv[2];
if(!id||! /^[a-z][a-z0-9-]*$/.test(id)) throw Error('usage: node tools/routes.mjs inj|press|eps');
const dir=`private/projects/${id}`, L=JSON.parse(readFileSync(dir+'/replica.json')), D=JSON.parse(readFileSync(dir+'/flow.json'));
const CELL=1.5,M=1/L.scale;
const near=(a,r,m=0)=>a[0]>r.x-m&&a[0]<r.x+r.w+m&&a[1]>r.y-m&&a[1]<r.y+r.h+m;
const inBox=(p,b)=>p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];
const plateOf=(x,y)=>Object.entries(D.plates).sort((a,b)=>{
 const distance=([,p])=>Math.hypot(Math.max(p.box[0]-x,0,x-p.box[2]),Math.max(p.box[1]-y,0,y-p.box[3]));
 return distance(a)-distance(b);
})[0][0];
/* ---------- 1. breathing space ---------- */
const stationsWanted = [...new Set(D.flows.flatMap((f) => f.steps.map((s) => s.node)))].map((id) => D.nodes[id]).filter((n) => n.kind !== "dest");
for (const r of L.racks) {   // one rack row (1.3 m deep) down the middle of each block, shorter so cross aisles open up
  const v = r.h >= r.w, depth = Math.min(1.3 * M,Math.min(r.w,r.h)), trim = Math.min(7, (v ? r.h : r.w) * .1);
  if (v) { r.x += (r.w - depth) / 2; r.w = depth; r.y += trim; r.h -= trim * 2; } else { r.y += (r.h - depth) / 2; r.h = depth; r.x += trim; r.w -= trim * 2; }
}
L.racks = L.racks.filter((r) => !stationsWanted.some((n) => plateOf(n.x, n.y) === r.plate && near([n.x, n.y], r, 11)));
for (const m of L.machines) if (m.type === "injection" && !m.vertical) { const k = m.h * .12; m.y += k / 2; m.h -= k; }
const solid = [...L.racks, ...L.machines];
L.columns = L.columns.filter((c) => !solid.some((r) => r.plate === c.plate && near(c.p, r, 2.2)));
function door(pic, axis, at, from, to) {   // cuts an opening in the straight walls of one picture
  const out = []; for (const w of L.walls) {
    const i = axis === "x" ? 0 : 1, j = 1 - i, onLine = w.pic === pic && Math.abs(w.a[i] - at) < 1.2 && Math.abs(w.b[i] - at) < 1.2, lo = Math.min(w.a[j], w.b[j]), hi = Math.max(w.a[j], w.b[j]);
    if (!onLine || hi < from || lo > to) { out.push(w); continue; }
    const seg = (p, q) => { const a = [...w.a], b = [...w.b]; a[j] = p; b[j] = q; out.push({ ...w, a, b }); }; if (lo < from) seg(lo, from); if (hi > to) seg(to, hi);
  } L.walls = out;
}
if (id === "inj") {
door("pic28", "x", 140, 232, 268); door("pic28", "x", 140, 292, 330); door("pic28", "x", 111, 246, 280); door("pic28", "y", 158, 204, 240);
door("pic28", "x", 426.5, 244, 284); door("pic10", "x", 493.4, 290, 330); door("pic117", "x", 625, 362, 400); door("pic130", "x", 727, 262, 302);
// no solid may stand in a wall, a conveyor or another solid: move the press line off its conveyor, then clean up
for (const c of L.conveyors) if (c.pic === "pic117" && c.pts[0][1] > 418 && c.pts[0][1] < 425 && c.pts.length === 2) { c.pts = [[747.5, 430.4], [910, 430.4]]; }
{ const ys = [...new Set(L.columns.filter((c) => c.plate === "E2-2F").map((c) => c.p[1]))].sort((p, q) => p - q), keep = new Set(ys.filter((_, i) => i % 2 === 0)); L.columns = L.columns.filter((c) => c.plate !== "E2-2F" || keep.has(c.p[1])); }   // the plan's marks stand 4 m apart: an 8 m grid gives the lanes room
}
const segmentBoxes=(a,b,half,plate)=>{
 if(a[0]===b[0]||a[1]===b[1])return [{x:Math.min(a[0],b[0])-half,y:Math.min(a[1],b[1])-half,w:Math.abs(a[0]-b[0])+2*half,h:Math.abs(a[1]-b[1])+2*half,plate}];
 const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.75));
 return Array.from({length:n+1},(_,i)=>({x:a[0]+(b[0]-a[0])*i/n-half,y:a[1]+(b[1]-a[1])*i/n-half,w:2*half,h:2*half,plate}));
};
const wallBoxes=()=>L.walls.flatMap(w=>segmentBoxes(w.a,w.b,1,w.plate));
const convBoxes=()=>L.conveyors.flatMap(q=>q.pts.slice(1).flatMap((b,i)=>segmentBoxes(q.pts[i],b,3,q.plate)));
const hit = (a, b, m = 0) => a.plate === b.plate && a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const hard = () => [...wallBoxes(), ...convBoxes()];
L.racks = L.racks.filter((r, i) => !hard().some((b) => hit(r, b, .5)) && !L.racks.slice(0, i).some((o) => hit(r, o, 1)) && !L.lifts.some((l) => hit(r, l, 1)));
L.machines = L.machines.filter((m) => m.type === "dock" || !hard().some((b) => hit(m, b, .3)) || m.type === "injection");
L.columns = L.columns.filter((c) => { const b = { x: c.p[0] - 1.6, y: c.p[1] - 1.6, w: 3.2, h: 3.2, plate: c.plate }; return ![...L.racks, ...L.machines, ...L.lifts, ...convBoxes()].some((r) => hit(b, r, .3)); });
L.rooms = L.rooms.filter((r) => r.label !== "Area" && r.label !== "Plan area");

let dockAllowed=new Set(L.lifts);
function grid(plate, x0, y0, x1, y1, softWalls = false) {
  const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL), blocked = new Uint8Array(nx * ny);
  const rect = (x, y, w, h) => { for (let j = Math.floor((y - y0) / CELL); j <= Math.ceil((y + h - y0) / CELL); j++) for (let i = Math.floor((x - x0) / CELL); i <= Math.ceil((x + w - x0) / CELL); i++) if (i >= 0 && j >= 0 && i < nx && j < ny) blocked[j * nx + i] = 1; };
  for (const w of L.walls) if (w.plate === plate) { const [a,b]=[w.a,w.b],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/(CELL/2)));for(let i=0;i<=n;i++)rect(a[0]+(b[0]-a[0])*i/n-.6,a[1]+(b[1]-a[1])*i/n-.6,1.2,1.2); }
  const soft = softWalls ? blocked.slice() : null; if (softWalls) blocked.fill(0);
  for (const r of [...L.racks, ...L.machines, ...L.trucks, ...L.lifts.filter(l=>!dockAllowed.has(l))]) if (r.plate === plate) rect(r.x, r.y, r.w, r.h);
  for (const c of L.columns) if (c.plate === plate) rect(c.p[0] - 1.4, c.p[1] - 1.4, 2.8, 2.8);
  for (const c of convBoxes()) if(c.plate===plate)rect(c.x,c.y,c.w,c.h);
  const clearance = new Float64Array(nx * ny).fill(1e9);
  for (let k = 0; k < blocked.length; k++) if (blocked[k]) clearance[k] = 0;
  const relax = (k, n, d) => { if (clearance[n] + d < clearance[k]) clearance[k] = clearance[n] + d; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (i) relax(k, k - 1, 1); if (j) relax(k, k - nx, 1); if (i && j) relax(k, k - nx - 1, 1.41); if (j && i < nx - 1) relax(k, k - nx + 1, 1.41); }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (i < nx - 1) relax(k, k + 1, 1); if (j < ny - 1) relax(k, k + nx, 1); if (i < nx - 1 && j < ny - 1) relax(k, k + nx + 1, 1.41); if (i && j < ny - 1) relax(k, k + nx - 1, 1.41); }
  return { soft, minX: x0, minY: y0, nx, ny, cell: CELL, blocked, clearance, point: (i, j) => ({ x: x0 + (i + .5) * CELL, y: y0 + (j + .5) * CELL }), index: (p) => { const i = Math.floor((p.x - x0) / CELL), j = Math.floor((p.y - y0) / CELL); return i < 0 || j < 0 || i >= nx || j >= ny ? undefined : j * nx + i; } };
}

// Wall openings follow the supplied reference corridors and station access points.
const corridors=[];
for(const f of D.flows) for(const st of f.steps) if(Array.isArray(st.path)) for(let i=1;i<st.path.length;i++) corridors.push([st.path[i-1],st.path[i]]);
let openings=0;
function subtractRect(w,box){
 let lo=0,hi=1;const d=[w.b[0]-w.a[0],w.b[1]-w.a[1]];
 for(let j=0;j<2;j++){
 if(Math.abs(d[j])<1e-9){if(w.a[j]<box[j]||w.a[j]>box[j+2])return [w];continue;}
 const ts=[(box[j]-w.a[j])/d[j],(box[j+2]-w.a[j])/d[j]];lo=Math.max(lo,Math.min(...ts));hi=Math.min(hi,Math.max(...ts));
 }if(lo>=hi)return [w];
 const P=t=>[w.a[0]+d[0]*t,w.a[1]+d[1]*t];openings++;
 return [[0,lo],[hi,1]].filter(([a,b])=>(b-a)*Math.hypot(...d)>1).map(([a,b])=>({...w,a:P(a),b:P(b)}));
}
for(const [a,b] of corridors){
 const floor=D.plates[plateOf(...a)].lift;
 const box=[Math.min(a[0],b[0])-9,Math.min(a[1],b[1])-9,Math.max(a[0],b[0])+9,Math.max(a[1],b[1])+9];
 L.walls=L.walls.flatMap(w=>D.plates[w.plate].lift===floor?subtractRect(w,box):[w]);
}
const access=[...Object.values(D.nodes).map(n=>({p:[n.x,n.y],plate:n.plate})),...D.elevators.flatMap(e=>[{p:e.low,plate:e.lowPlate},{p:e.high,plate:e.highPlate}])];
for(const {p,plate} of access) L.walls=L.walls.flatMap(w=>w.plate===plate?subtractRect(w,[p[0]-13,p[1]-13,p[0]+13,p[1]+13]):[w]);
// Resolve overlapping approximate take-off furniture before routing; retain walls and lift footprints.
let removed={};
for(const key of ['racks','machines','columns']) {
 const prior=[];const before=L[key].length;
 L[key]=L[key].filter(o=>{
 const r=key==='columns'?{x:o.p[0]-1.4,y:o.p[1]-1.4,w:2.8,h:2.8,plate:o.plate}:o;
 if(access.some(a=>a.plate===r.plate&&near(a.p,r,11)))return false;
 const blockers=[...wallBoxes(),...convBoxes(),...L.lifts,...prior,...(key==='columns'?[...L.racks,...L.machines]:[])];
 if(blockers.some(b=>hit(r,b,.5)))return false;prior.push(r);return true;
 });removed[key]=before-L[key].length;
}
// Conveyors and lift footprints imply structural openings in approximate wall traces.
for(const r of [...L.lifts,...convBoxes()]) L.walls=L.walls.flatMap(w=>w.plate===r.plate?subtractRect(w,[r.x-2,r.y-2,r.x+r.w+2,r.y+r.h+2]):[w]);
const allowDock=(a,b)=>{dockAllowed=new Set(L.lifts.filter(l=>near(a,l,3)||near(b,l,3)));};
const makeGrids=(soft=false)=>Object.fromEntries(Object.entries(D.plates).map(([k,p])=>[k,grid(k,...p.box,soft)]));
let grids=makeGrids();
const needOf=m=>m.effectiveWidth/(2*CELL)+.5, TROLLEY={name:'trolley',effectiveWidth:3.6*M}, FORK={name:'forklift',effectiveWidth:3.2*M},AGV={name:'agv',effectiveWidth:2.4*M};
const free=(g,p,need)=>{const k=g.index(p);return k!==undefined&&!g.blocked[k]&&g.clearance[k]>=need;};
const out=p=>[+p.x.toFixed(3),+p.y.toFixed(3)];
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]], TURN = 30 / L.scale, WALL = 5 / L.scale;   // a turn costs 30 m of straight run; crossing a wall (a new door) about 15 m
function ortho(g, from, to, need, label) {
  const s = g.index(from), e = g.index(to), N = g.nx * g.ny;
  if (s === undefined || e === undefined) throw new Error(`OUTSIDE ${label}`);
  const dist = new Float64Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1), heap = [];
  const push = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { let c = i * 2 + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[i][0] <= heap[c][0]) break; [heap[c], heap[i]] = [heap[i], heap[c]]; i = c; } } return t; };
  for (let d = 0; d < 4; d++) { dist[s * 4 + d] = 0; push(s * 4 + d, 0); }
  let end = -1;
  while (heap.length) {
    const [d0, st] = pop(); if (d0 > dist[st]) continue; const k = st >> 2, dir = st & 3; if (k === e) { end = st; break; }
    const x = k % g.nx, y = (k - x) / g.nx;
    for (let nd = 0; nd < 4; nd++) {
      if ((nd + 2) % 4 === dir) continue;
      const a = x + DIRS[nd][0], b = y + DIRS[nd][1]; if (a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue;
      const n = b * g.nx + a; if (g.blocked[n] || g.clearance[n] < need) continue;
      const near = Math.max(0, need * 1.5 - g.clearance[n]) * .3, c = d0 + CELL * (1 + near) + (nd === dir ? 0 : TURN) + (g.soft && g.soft[n] ? WALL : 0), ns = n * 4 + nd;
      if (c < dist[ns]) { dist[ns] = c; prev[ns] = st; push(ns, c); }
    }
  }
  if (end < 0) throw new Error(`NO ROUTE ${label}`);
  const pts = []; for (let st = end; st !== -1; st = prev[st]) { const k = st >> 2, i = k % g.nx; pts.push(g.point(i, (k - i) / g.nx)); }
  pts.reverse(); const o = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const a = o[o.length - 1], b = pts[i], c = pts[i + 1]; if (!((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) o.push(b); }
  if (pts.length > 1) o.push(pts[pts.length - 1]); return o;
}
const snap = (g, p) => { const k = g.index(p), i = k % g.nx; return g.point(i, (k - i) / g.nx); };

const vector=p=>({x:p[0],y:p[1]});
function segmentFree(g,a,b,mover){
 if(a[0]!==b[0]&&a[1]!==b[1])return false;
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(length/(CELL/3)));
 for(let i=0;i<=n;i++) if(!free(g,vector([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n]),needOf(mover)))return false;
 return true;
}
function pull(g,points,mover){
 const out=[points[0]];let i=0;
 while(i<points.length-1){let found=false;
 for(let j=points.length-1;j>i;j--){const a=out.at(-1),b=points[j];
 for(const mid of [[a[0],b[1]],[b[0],a[1]]]) if(segmentFree(g,a,mid,mover)&&segmentFree(g,mid,b,mover)){
 if(mid[0]!==a[0]||mid[1]!==a[1])out.push(mid);if(b[0]!==mid[0]||b[1]!==mid[1])out.push(b);i=j;found=true;break;
 }if(found)break;
 }if(!found)throw Error('string pulling failed');
 }return out.length===1?[out[0],out[0]]:out;
}
function localRoute(plate,a,b,mover,preferred=[],attempt=0){
 if(attempt>3)throw Error(`No route after door search ${plate} ${JSON.stringify([a,b])}`);
 allowDock(a,b);grids=makeGrids();const g=grids[plate];
 // findRoute supplies an independent reachability check; the heading planner keeps all turns square.
 let result=findRoute(g,vector(a),vector(b),mover);
 if(!result.reachable && result.reason==='no-path'){
 const soft=makeGrids(true)[plate],candidate=ortho(soft,vector(a),vector(b),needOf(mover),plate+' door search').map(out);
 for(let i=1;i<candidate.length;i++) {const A=candidate[i-1],B=candidate[i];
 L.walls=L.walls.flatMap(w=>w.plate===plate?subtractRect(w,[Math.min(A[0],B[0])-13,Math.min(A[1],B[1])-13,Math.max(A[0],B[0])+13,Math.max(A[1],B[1])+13]):[w]);}
 grids=makeGrids();return localRoute(plate,a,b,mover,preferred,attempt+1);
 }
 if(!result.reachable)throw Error(`NO ROUTE ${plate}: ${result.reason} ${JSON.stringify([a,b])}`);
 const reference=[a,...preferred,b];
 if(reference.slice(1).every((p,i)=>segmentFree(g,reference[i],p,mover)))return reference;
 const points=ortho(g,vector(a),vector(b),needOf(mover),plate).map(out);
 return pull(g,[a,...points,b],mover);
}
// Pick pads once for all occurrences. Lift endpoints are fixed to preserve shaft registration.
for(const n of Object.values(D.nodes)){
 const g=grids[n.plate],p=[n.x,n.y];if(free(g,vector(p),needOf(TROLLEY)))continue;
 if(n.kind==='lift')throw Error(`Lift access blocked: ${n.text}`);
 let best;for(let r=.5;r<=11&&!best;r+=.5)for(let d=0;d<32;d++){
 const q=[+(p[0]+r*Math.cos(d*Math.PI/16)).toFixed(3),+(p[1]+r*Math.sin(d*Math.PI/16)).toFixed(3)];
 if(free(g,vector(q),needOf(TROLLEY))){best=q;break;}}
 if(!best)throw Error(`No station pad within 11 units: ${n.id}`);
 n.x=best[0];n.y=best[1];
}
// Adjacent plates on one floor share a portal; never route across an uncovered gap.
function portal(pa,pb,mover){
 const a=D.plates[pa].box,b=D.plates[pb].box,x0=Math.max(a[0],b[0]),x1=Math.min(a[2],b[2]),y0=Math.max(a[1],b[1]),y1=Math.min(a[3],b[3]);
 if(x0>x1+.001||y0>y1+.001)throw Error(`No shared floor between ${pa} and ${pb}`);
 for(let y=y0;y<=y1;y+=CELL/2)for(let x=x0;x<=x1;x+=CELL/2){
 const p=[x,y],inside=(name)=>{const box=D.plates[name].box;return [Math.max(box[0]+.01,Math.min(box[2]-.01,x)),Math.max(box[1]+.01,Math.min(box[3]-.01,y))];};
 const A=inside(pa),B=inside(pb);if(free(grids[pa],vector(A),needOf(mover))&&free(grids[pb],vector(B),needOf(mover)))return [A,B];
 }throw Error(`No free portal ${pa}/${pb}`);
}
for(const f of D.flows){
 let n=D.nodes[f.steps[0].node],at=[n.x,n.y],plate=n.plate;
 for(const [i,s] of f.steps.entries()){
 if(!i){s.path=null;continue;}n=D.nodes[s.node];
 if(s.path==='lift'||s.lift){const e=D.elevators.find(e=>e.label===s.elevator);if(!e)throw Error('Unknown lift');
 if(Math.hypot(at[0]-e.low[0],at[1]-e.low[1])>.1)throw Error('Previous stop does not reach lift '+e.label);
 s.path='lift';s.lift=true;at=e.high;plate=e.highPlate;continue;}
 const to=[n.x,n.y],preferred=Array.isArray(s.path)?s.path.slice(1,-1):[];
 if(plate===n.plate)s.path=localRoute(plate,at,to,TROLLEY,preferred);
 else{
 if(D.plates[plate].lift!==D.plates[n.plate].lift)throw Error('Floor change without lift');
 const [a,b]=portal(plate,n.plate,TROLLEY);const left=localRoute(plate,at,a,TROLLEY),right=localRoute(n.plate,b,to,TROLLEY);
 const bridge=a[0]===b[0]||a[1]===b[1]?[a,b]:[a,[b[0],a[1]],b];s.path=[...left,...bridge.slice(1),...right.slice(1)];
 }at=to;plate=n.plate;
 }
}
L.lanes=[];const seen=new Set();for(const f of D.flows)for(const s of f.steps)if(Array.isArray(s.path))for(let i=1;i<s.path.length;i++){const pair=[s.path[i-1],s.path[i]],key=JSON.stringify(pair);if(!seen.has(key)){seen.add(key);L.lanes.push(pair);}}
L.routes=[];L.pallets=[];dockAllowed=new Set();grids=makeGrids();
// Reserve trolley lanes, then select independent vehicle circuits on the requested floors.
function blockPath(pts,half){for(let i=1;i<pts.length;i++)for(const [name,g]of Object.entries(grids)){
 const a=pts[i-1],b=pts[i];for(let y=Math.min(a[1],b[1])-half;y<=Math.max(a[1],b[1])+half;y+=CELL/2)for(let x=Math.min(a[0],b[0])-half;x<=Math.max(a[0],b[0])+half;x+=CELL/2){const k=g.index({x,y});if(k!==undefined)g.blocked[k]=1;}
}}
for(const f of D.flows)for(const s of f.steps)if(Array.isArray(s.path))blockPath(s.path,9);
const largest=level=>Object.entries(D.plates).filter(([,p])=>p.lift===level).sort((a,b)=>(b[1].box[2]-b[1].box[0])*(b[1].box[3]-b[1].box[1])-(a[1].box[2]-a[1].box[0])*(a[1].box[3]-a[1].box[1]))[0]?.[0];
const missions=id==='inj'?[['forklift','E1',FORK],['forklift','E1',FORK],['agv','E2-1F',AGV],['agv','E2-2F',AGV]]:[['forklift',largest(0),FORK],['agv',largest(1),AGV]];
for(const[kind,plate,mover]of missions){if(!plate)continue;const g=grids[plate];let pts;
 for(let j=8;j<g.ny-18&&!pts;j+=3)for(let i=8;i<g.nx-18&&!pts;i+=3){const p=(x,y)=>out(g.point(x,y)),candidate=[p(i,j),p(i+12,j),p(i+12,j+12),p(i,j+12),p(i,j)];
 if(candidate.slice(1).every((b,k)=>segmentFree(g,candidate[k],b,mover)))pts=candidate;}
 if(!pts){console.log('No separate vehicle circuit:',kind,plate);continue;}L.routes.push({kind,plate,pts});blockPath(pts,9);
}
// Self-check samples every segment, including endpoints, using the immutable obstacle grids.
grids=makeGrids();let checks=0;
for(const f of D.flows)for(const s of f.steps)if(Array.isArray(s.path)){
 allowDock(s.path[0],s.path.at(-1));grids=makeGrids();
 const floor=D.plates[D.nodes[s.node].plate].lift;
 for(let i=1;i<s.path.length;i++){
 const a=s.path[i-1],b=s.path[i];if(a[0]!==b[0]&&a[1]!==b[1])throw Error('Diagonal route');
 const N=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.4));
 for(let k=0;k<=N;k++){const q=[a[0]+(b[0]-a[0])*k/N,a[1]+(b[1]-a[1])*k/N];
 if(!Object.entries(D.plates).some(([p,v])=>v.lift===floor&&inBox(q,v.box)&&free(grids[p],vector(q),needOf(TROLLEY))))throw Error(`SELF CHECK ${f.id}/${s.title} ${q}`);checks++;}
 }}
mkdirSync(dir+'/routed',{recursive:true});writeFileSync(dir+'/routed/flow.json',JSON.stringify(D,null,2));writeFileSync(dir+'/routed/replica.json',JSON.stringify(L,null,2));
console.log(`OK routes ${id}: ${checks} samples, openings ${openings}, furniture conflicts removed ${JSON.stringify(removed)}, movers ${L.routes.length}`);
