// Hard collision check of the whole factory: every solid against every other solid and every wall, in plan,
// and every route against every solid with its vehicle's half width. Exit 1 on any clash. Run after tools/routes.mjs.
import { readFileSync } from "node:fs";
const id=process.argv[2];
if(!id||! /^[a-z][a-z0-9-]*$/.test(id))throw Error('usage: node tools/layout-check.mjs inj|press|eps');
const dir=new URL(`../private/projects/${id}/routed/`,import.meta.url);
const L=JSON.parse(readFileSync(new URL('replica.json',dir),'utf8'));
const D=JSON.parse(readFileSync(new URL('flow.json',dir),'utf8'));
const M = 1 / L.scale, name = (o) => `${o.kind}${o.type ? ":" + o.type : ""}@${Math.round(o.x)},${Math.round(o.y)}`;
const solids = [];
for (const r of L.racks) solids.push({ kind: "rack", ...r });
for (const m of L.machines) solids.push({ kind: "machine", ...m });
for (const t of L.trucks) solids.push({ kind: "truck", ...t });
for (const c of L.columns) solids.push({ kind: "column", x: c.p[0] - 1, y: c.p[1] - 1, w: 2, h: 2, plate: c.plate });
for (const l of L.lifts) solids.push({ kind: "lift", ...l });
for (const p of L.pallets || []) solids.push({ kind: "pallet", ...p });
const segmentBoxes=(a,b,half,plate,kind)=>{
 if(a[0]===b[0]||a[1]===b[1])return [{x:Math.min(a[0],b[0])-half,y:Math.min(a[1],b[1])-half,w:Math.abs(a[0]-b[0])+2*half,h:Math.abs(a[1]-b[1])+2*half,plate,kind}];
 const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.75));
 return Array.from({length:n+1},(_,i)=>({kind,x:a[0]+(b[0]-a[0])*i/n-half,y:a[1]+(b[1]-a[1])*i/n-half,w:half*2,h:half*2,plate}));
};
for(const q of L.conveyors)for(let i=1;i<q.pts.length;i++)solids.push(...segmentBoxes(q.pts[i-1],q.pts[i],2,q.plate,'conveyor'));
const walls=L.walls.flatMap(w=>segmentBoxes(w.a,w.b,.65,w.plate,'wall'));
const hit = (a, b, m = 0) => a.plate === b.plate && a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const clashes = [], allow = (a, b) => (a.kind === "conveyor" && b.kind === "conveyor") || (a.kind === "column" && b.kind === "wall") || (b.kind === "column" && a.kind === "wall") || (a.type === "dock" && b.kind === "wall") || (b.type === "dock" && a.kind === "wall") || (a.type === "dock" && b.kind === "truck") || (b.type === "dock" && a.kind === "truck");
const all = [...solids, ...walls];
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { if (all[i].kind === "wall" && all[j].kind === "wall") continue; if (!allow(all[i], all[j]) && hit(all[i], all[j])) clashes.push(`${name(all[i])} x ${name(all[j])}`); }
const plateOf=(x,y)=>Object.entries(D.plates).sort((a,b)=>{
const d=([,p])=>Math.hypot(Math.max(p.box[0]-x,0,x-p.box[2]),Math.max(p.box[1]-y,0,y-p.box[3]));return d(a)-d(b);
})[0][0];
let docking=[];
const segClash = (a, b, half, label, skipEnd) => { const box = { x: Math.min(a[0], b[0]) - half, y: Math.min(a[1], b[1]) - half, w: Math.abs(a[0] - b[0]) + half * 2, h: Math.abs(a[1] - b[1]) + half * 2, plate: plateOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) }; for (const s of all) if (s.kind !== "column" || true) if (hit(box, s) && !(s.kind==='lift' && docking.includes(s))) clashes.push(`${label} x ${name(s)}`); };
let diag = 0;
const route = (pts, half, label) => { docking=solids.filter(s=>s.kind==='lift'&&[pts[0],pts.at(-1)].some(p=>p[0]>=s.x-3&&p[0]<=s.x+s.w+3&&p[1]>=s.y-3&&p[1]<=s.y+s.h+3)); for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (a[0] !== b[0] && a[1] !== b[1]) diag++; segClash(a, b, half, `${label}[${i}]`); } };
for (const f of D.flows) for (const s of f.steps) if (Array.isArray(s.path) && !s.exit) route(s.path, 1.6 * M, `${f.name}/${s.title}`);
for (const r of L.routes || []) route(r.pts, r.kind === "forklift" ? 1.1 * M : .8 * M, r.kind);
const box = (a, b, h) => ({ x: Math.min(a[0], b[0]) - h, y: Math.min(a[1], b[1]) - h, w: Math.abs(a[0] - b[0]) + 2 * h, h: Math.abs(a[1] - b[1]) + 2 * h, plate: plateOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) });
const moving = []; for (const f of D.flows) for (const s of f.steps) if (Array.isArray(s.path)) for (let i = 1; i < s.path.length; i++) moving.push({ who: "trolley", ...box(s.path[i - 1], s.path[i], 1.6 * M) });
(L.routes || []).forEach((r, n) => { for (let i = 1; i < r.pts.length; i++) moving.push({ who: r.kind + n, ...box(r.pts[i - 1], r.pts[i], 1.2 * M) }); });
for (let i = 0; i < moving.length; i++) for (let j = i + 1; j < moving.length; j++) if (moving[i].who !== moving[j].who && hit(moving[i], moving[j])) clashes.push(`${moving[i].who} crosses ${moving[j].who}`);
console.log(`solids ${solids.length}, walls ${walls.length}, diagonal segments ${diag}, clashes ${clashes.length}`);
for (const c of [...new Set(clashes)].slice(0, 40)) console.log("  " + c);
process.exit(clashes.length || diag ? 1 : 0);
