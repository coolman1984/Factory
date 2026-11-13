// Press slide 3: deterministic approximate take-off in a disjoint project frame.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const out='private/projects/press'; for(const d of ['', '/plans','/evidence']) mkdirSync(out+d,{recursive:true});
const get=(f,s,id)=>JSON.parse(readFileSync(f,'utf8')).find(p=>p.slide===s&&p.id===id);
const n=get('private/paths/pictures-new.json',3,127), o=get('private/paths/pictures-old.json',1,130);
// Rotation swaps picture axes in slide space. Calculate both source-axis ratios.
const ratio=(axis)=>{const W=axis==='x'?'origW':'origH', A=axis==='x'?'cropL':'cropT', B=axis==='x'?'cropR':'cropB', D=axis==='x'?'w':'h';return (o[D]/(o[W]-o[A]-o[B]))/(n[D]/(n[W]-n[A]-n[B]));};
const sx=ratio('y'),sy=ratio('x'),s1=40/48;
// A true two-point similarity preserves 1F proportions. Its small rotation is required
// because the recorded lift-pair vectors are not parallel (translation + scale alone cannot fit).
const vx=468.2-34.9,vy=397.5-309.2,ux=(933.3-666.7)*sx,uy=(365-335.5)*sy;
const A=(ux*vx+uy*vy)/(vx*vx+vy*vy), B=(uy*vx-ux*vy)/(vx*vx+vy*vy);
const corners=[[0,0],[537.63,0],[0,324.85],[537.63,324.85]].map(([x,y])=>[A*x-B*y,B*x+A*y]);
const minX=Math.min(...corners.map(p=>p[0])),minY=Math.min(...corners.map(p=>p[1]));
const rr=x=>Math.round(x*1000)/1000;
const p1=([x,y])=>[rr(A*(x-22.94)-B*(y-160.30)-minX),rr(B*(x-22.94)+A*(y-160.30)-minY)];
const p2=([x,y])=>[rr(1200+(x-567.73)*sx),rr((y-188.8)*sy)];
const plate1='E2-1F',plate2='E2-2F';
const w1=Math.max(...corners.map(p=>p[0]))-minX,h1=Math.max(...corners.map(p=>p[1]))-minY,w2=381.16*sx,h2=279.44*sy;
const plates={ [plate1]:{label:plate1,dx:0,dz:0,lift:0,box:[0,0,rr(w1),rr(h1)],pics:[{file:'e2-1f',x:0,y:0,w:rr(w1),h:rr(h1)}]}, [plate2]:{label:plate2,dx:0,dz:0,lift:1,box:[1200,0,rr(1200+w2),rr(h2)],pics:[{file:'e2-2f',x:1200,y:0,w:rr(w2),h:rr(h2)}]} };
const R={walls:[],racks:[],columns:[],machines:[],trucks:[],conveyors:[],rooms:[],lifts:[],decks:[],crop:{},scale:0.3};
function on(plate){const P=plate===plate1?p1:p2; const rect=(x,y,w,h)=>{let cs=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(P),xs=cs.map(p=>p[0]),ys=cs.map(p=>p[1]);return {x:Math.min(...xs),y:Math.min(...ys),w:rr(Math.max(...xs)-Math.min(...xs)),h:rr(Math.max(...ys)-Math.min(...ys)),plate};};return {wall:(x,y,X,Y)=>R.walls.push({a:P([x,y]),b:P([X,Y]),plate}),rack:(x,y,w,h)=>R.racks.push(rect(x,y,w,h)),col:(x,y)=>R.columns.push({p:P([x,y]),plate}),mach:(type,x,y,w,h)=>R.machines.push({type,...rect(x,y,w,h)}),conv:(pts)=>R.conveyors.push({pts:pts.map(P),plate}),lift:(x,y,w,h,label)=>R.lifts.push({...rect(x,y,w,h),label})};}
const a=on(plate1),b=on(plate2);
// Major visible structure; aisle openings are kept between the blocks.
for(const q of [[23,160,560,160],[23,160,23,485],[23,485,560,485],[560,160,560,485],[50,165,50,266],[50,266,382,266],[382,266,382,359],[382,359,405,359],[405,359,405,449],[405,449,276,449],[276,449,276,359],[276,359,50,359],[50,359,50,266],[275,360,275,485],[425,190,425,265]]) a.wall(...q);
for(const y of [269,283,297,311,325,339]) a.rack(287,y,91,7);
for(const y of [370,385,400,415,430]) a.rack(293,y,44,6);
for(const x of [69,116,163,210,257,304,351,398,445,492]) for(const y of [246,345,453]) a.col(x,y);
for(const x of [84,118,152,186,220,254]) a.mach('press',x,202,25,20);
for(const y of [188,230,337,366,401,430]) a.conv([[52,y],[275,y]]);
a.lift(23,300,16,18,'Elev 7'); a.lift(459,390,15,15,'Elev 3 & 4');
for(const q of [[568,189,949,189],[568,189,568,468],[568,468,949,468],[949,189,949,468],[665,189,665,345],[665,345,665,468],[690,255,949,255],[690,355,949,355],[690,369,949,369],[817,369,817,453]]) b.wall(...q);
// Warehouse rack fields, broken at the warehouse-to-mapping aisle.
for(const y of [257,266,275,284]) {b.rack(691,y,54,5);b.rack(760,y,28,5);}
for(const x of [708,724,740,756,772,788,804,820,836,852,868,884]) {b.rack(x,283,12,24); if(x>756)b.rack(x,317,12,25);}
for(const y of [382,390,398,406,414,422,430,438]) b.rack(721,y,74,4);
for(const x of [841,850,859,868,877,886,895,904,913,922]) {b.rack(x,373,6,37);b.rack(x,416,6,35);}
for(const x of [623,641,659,677,695]) for(const y of [220,237,254,271,288,305,322]) b.col(x,y);
b.lift(659,329,10,10,'Elev 7');b.lift(930,359,13,12,'Elev 3');b.lift(930,415,13,12,'Elev 4');
const defs=[[106,[60.7,297.5],plate1,'gr','manual','GR (west)'],[125,[395.3,404.9],plate1,'gr','manual','GR Manual'],[95,[34.9,309.2],plate1,'lift','none','Elev 7'],[139,[468.2,397.5],plate1,'lift','none','Elev 3 & 4'],[146,[933.3,365],plate2,'lift','none','Elev 3 & 4 2F'],[9070,[666.7,335.5],plate2,'lift','none','Elev 7 2F'],[147,[767.7,329.4],plate2,'area','none','Press W/H'],[145,[743.4,322.7],plate2,'mapping','manual','TO Mapping'],[4,[615.1,354.7],plate2,'dest','none','To LCM']];
const nodes={};for(const [id,pt,plate,kind,mode,text] of defs){const [x,y]=(plate===plate1?p1:p2)(pt);nodes[id]={id,x,y,plate,kind,mode,fill:mode==='manual'?'#00B0F0':'#156082',text};}
const elevators=[['Elev 7',95,9070],['Elev 3 & 4',139,146]].map(([label,lo,hi])=>({label,low:[nodes[lo].x,nodes[lo].y],lowPlate:plate1,high:[nodes[hi].x,nodes[hi].y],highPlate:plate2}));
plates[plate2].dx=rr(elevators[0].low[0]-elevators[0].high[0]); plates[plate2].dz=rr(elevators[0].low[1]-elevators[0].high[1]);
const pt=id=>[nodes[id].x,nodes[id].y];
function step(node,title,what,path,view='3d',extra={}) {return {node,title,what,path,mode:'flow',view,dist:360,...extra};}
const route=(id,name,gr,lo,hi,elev,way)=>({id,name,color:'#00B0F0',steps:[step(gr,'Goods receipt','Receive the material.',null,'2d'),step(lo,'Elevator','Move the material to the elevator.',[pt(gr),[pt(lo)[0],pt(gr)[1]],pt(lo)],'2d'),step(hi,'Go up','Move the material to the second floor.','lift','3d',{lift:true,elevator:elev}),step(147,'Press W/H','Move the material to the Press warehouse.',way),step(145,'TO Mapping','Move the material to TO Mapping.',[pt(147),[pt(147)[0],pt(145)[1]],pt(145)]),step(4,'To LCM','Send the material toward LCM.',[pt(145),[pt(145)[0],p2([0,354.7])[1]],pt(4)])]});
const f1=[pt(9070),p2([694.9,335.5]),p2([694.9,310.7]),p2([767.7,310.7]),pt(147)];
const f2=[pt(146),p2([928.7,365]),p2([928.7,345.8]),p2([767.7,345.8]),pt(147)];
const flow={id:'press',title:'Press',slide:{title:'PRESS location 1F and 2F',w:960,h:540},plates,elevators,nodes,flows:[route('press-elev7','Press via Elev 7',106,95,9070,'Elev 7',f1),route('press-elev34','Press via Elev 3 & 4',125,139,146,'Elev 3 & 4',f2)]};
writeFileSync(out+'/evidence/similarity.json',JSON.stringify({A,B,minX,minY,w:w1,h:h1}));
writeFileSync(out+'/flow.json',JSON.stringify(flow,null,2));writeFileSync(out+'/replica.json',JSON.stringify(R,null,2));
execFileSync('python',[out+'/evidence/render.py'],{stdio:'inherit'});
console.log('2F exact X/Y',sx,sy,'1F before',s1,'similarity scale',Math.hypot(A,B),'rotation degrees',Math.atan2(B,A)*180/Math.PI);
