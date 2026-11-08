import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const dir='private/projects/inj'; for(const d of [dir,dir+'/plans',dir+'/evidence']) mkdirSync(d,{recursive:true});
// Use the existing read-only take-off; do not regenerate shared legacy files.
copyFileSync('private/replica.json',dir+'/replica.json');
for(const p of ['pic28','pic10','pic117','pic130']) copyFileSync(`private/plans/${p}.png`,`${dir}/plans/${p}.png`);
const R=JSON.parse(readFileSync(dir+'/replica.json'));
const plates={E1:{label:'E1-1F',dx:0,dz:0,lift:0,box:[21,157,555,494],pics:[{file:'pic28',x:21,y:157,w:410,h:337},{file:'pic10',x:431,y:174,w:119,h:255}]},'E2-1F':{label:'E2-1F',dx:0,dz:0,lift:0,box:[555,305,910,442],pics:[{file:'pic117',x:555,y:305,w:355,h:137}]},'E2-2F':{label:'E2-2F',dx:-124,dz:150,lift:1,box:[724.5,143.5,946.5,302.5],pics:[{file:'pic130',x:724.5,y:143.5,w:222,h:159}]}};
const round=n=>Math.round(n*100)/100;
// Owner-approved SIFT image registration; screenshot fit from three COM area centres.
function e1([x,y]) {const px=(x-5.46417523)/.46748823, py=(y-5.24687373)/.46660023; return [21+(px-111.408464)/.706839144*410/1638,157+(py-287.220725)/.493808941*337/1347].map(round)}
const read=(f)=>JSON.parse(readFileSync(f,'utf8')); const N=read('private/paths/pictures-new.json').find(p=>p.slide===2&&p.id===3), O=read('private/paths/pictures-old.json').find(p=>p.slide===1&&p.id===117);
function source(q,[x,y]){const cx=q.x+q.w/2,cy=q.y+q.h/2,r=-q.rot*Math.PI/180;let dx=x-cx,dy=y-cy;[dx,dy]=[dx*Math.cos(r)-dy*Math.sin(r),dx*Math.sin(r)+dy*Math.cos(r)];if(q.flipH)dx=-dx;if(q.flipV)dy=-dy;return [q.cropL+(dx+q.w/2)/q.w*(q.origW-q.cropL-q.cropR),q.cropT+(dy+q.h/2)/q.h*(q.origH-q.cropT-q.cropB)]}
function slide(q,[x,y]){let dx=(x-q.cropL)/(q.origW-q.cropL-q.cropR)*q.w-q.w/2,dy=(y-q.cropT)/(q.origH-q.cropT-q.cropB)*q.h-q.h/2;if(q.flipH)dx=-dx;if(q.flipV)dy=-dy;const r=q.rot*Math.PI/180;return [q.x+q.w/2+dx*Math.cos(r)-dy*Math.sin(r),q.y+q.h/2+dx*Math.sin(r)+dy*Math.cos(r)].map(round)}
const e2=p=>slide(O,source(N,p));
const specs=[[4,'GR Auto','gr','auto','#00B050',[208,217],'E1'],[5,'TO Mapping Auto','mapping','auto','#00B050',[265,215],'E1'],[82,'Inj. W/H','area','none','#156082',[239,289.5],'E1'],[50,'Kitting','area','none','#156082',[438.2,207.4],'E1'],[21,'GR Manual','gr','manual','#00B0F0',[828,184],'E2-1F'],[37,'Elev 5','lift','none','#156082',[759.5,211.2],'E2-1F'],[38,'TO Mapping Manual','mapping','manual','#00B0F0',[605,210],'E1'],[8,'Umbrella','area','none','#156082',[639.6,244.9],'E1']];
const solids=[...R.racks,...R.machines];function blocked(p,plate){return solids.some(s=>s.plate===plate&&p[0]>s.x&&p[0]<s.x+s.w&&p[1]>s.y&&p[1]<s.y+s.h)||R.walls.some(w=>w.plate===plate&& (w.a[0]===w.b[0]?Math.abs(p[0]-w.a[0])<.4&&p[1]>=Math.min(w.a[1],w.b[1])&&p[1]<=Math.max(w.a[1],w.b[1]):Math.abs(p[1]-w.a[1])<.4&&p[0]>=Math.min(w.a[0],w.b[0])&&p[0]<=Math.max(w.a[0],w.b[0])))}
const nodes={};for(const [id,text,kind,mode,fill,pt,plate] of specs){let p=plate==='E1'?e1(pt):e2(pt), old=p;if(blocked(p,plate)){let found;for(let d=.25;d<=6&&!found;d+=.25) for(let a=0;a<360;a+=15){const c=[round(p[0]+d*Math.cos(a*Math.PI/180)),round(p[1]+d*Math.sin(a*Math.PI/180))];if(!blocked(c,plate)){found=c;break}}if(!found)throw Error(`No free point within 6 units for ${id}`);p=found;console.log('snap',id,old,p)}nodes[id]={id,x:p[0],y:p[1],plate,kind,mode,fill,text}}
const point=id=>[nodes[id].x,nodes[id].y];
function route(a,b,via=[]){const points=[point(a),...via,point(b)], out=[points[0]];for(const p of points.slice(1)){let q=out.at(-1);if(q[0]!==p[0]&&q[1]!==p[1])out.push([p[0],q[1]]);out.push(p)}return out}
const A=(p)=>e1(p); const step=(node,title,mode,path,view='2d')=>({node,title,what:title+'.',path,mode,view,dist:Math.round(Math.min(520,220+(path ? path.slice(1).reduce((v,p,i)=>v+Math.abs(p[0]-path[i][0])+Math.abs(p[1]-path[i][1]),0) : 0))),lift:false});
const flows=[{id:'inj-auto',name:'Injection Auto (GR Auto to Kitting)',color:'#00B050',steps:[step(4,'Start at GR Auto','flow',null),step(82,'Put away in Inj. W/H','flow',route(4,82,[A([207.7,234.4]),A([239,234.4])])),step(5,'Map at TO Mapping Auto','flow',route(82,5,[A([258.9,256]),A([265,256])]),'3d'),step(50,'Deliver to Kitting','auto',route(5,50,[A([355.1,215.2]),A([355.1,207.4])]),'3d')]},{id:'inj-manual',name:'Injection Manual (Elev 5 to Kitting)',color:'#00B0F0',steps:[step(37,'Arrive at Elev 5','flow',null),step(21,'Move to GR Manual','flow',route(37,21,[e2([792.8,211.2]),e2([792.8,183.8])])),step(8,'Move to Umbrella','auto',route(21,8,[[560,point(21)[1]],[545,point(21)[1]],[545,point(8)[1]]])),step(38,'Map at TO Mapping Manual','flow',route(8,38,[A([639.6,210])]),'3d'),step(50,'Deliver to Kitting','auto',route(38,50,[A([548.7,210]),A([548.7,207.4])]),'3d')]},{id:'inj-agv-link',name:'AGV link Umbrella to GR Auto',color:'#00B050',steps:[step(8,'Start at Umbrella','auto',null),step(4,'Move to GR Auto','auto',route(8,4,[A([628.4,224.4]),A([207.7,224.4])]))]}];
const data={id:'inj',title:'Injection',slide:{title:'Injection',w:960,h:540},plates,elevators:[{label:'Elev 5',low:point(37),lowPlate:'E2-1F',high:[728,285],highPlate:'E2-2F'}],nodes,flows};const shaft=data.elevators[0]; plates['E2-2F'].dx=round(shaft.low[0]-shaft.high[0]); plates['E2-2F'].dz=round(shaft.low[1]-shaft.high[1]);
writeFileSync(dir+'/flow.json',JSON.stringify(data,null,2));
const py=String.raw`import json,sys
from PIL import Image,ImageDraw,ImageFont
D=sys.argv[1]; f=json.load(open(D+'/flow.json',encoding='utf8')); r=json.load(open(D+'/replica.json',encoding='utf8')); k=2
im=Image.new('RGB',(1920,1080),'white'); d=ImageDraw.Draw(im)
for plate in f['plates'].values():
 for p in plate['pics']:
  img=Image.open(D+'/plans/'+p['file']+'.png').convert('RGB').resize((round(p['w']*k),round(p['h']*k)))
  im.paste(img,(round(p['x']*k),round(p['y']*k)))
d=ImageDraw.Draw(im,'RGBA')
for w in r['walls']: d.line([tuple(v*k for v in w['a']),tuple(v*k for v in w['b'])],fill=(255,50,40,190),width=2)
for typ,col in [('racks',(200,0,150,130)),('machines',(255,140,0,130))]:
 for v in r[typ]: d.rectangle([v['x']*k,v['y']*k,(v['x']+v['w'])*k,(v['y']+v['h'])*k],outline=col,width=2)
for f1 in f['flows']:
 for i,s in enumerate(f1['steps']):
  if not s['path']: continue
  path=s['path']; col=tuple(bytes.fromhex(f1['color'][1:]))+(220,); d.line([tuple(v*k for v in p) for p in path],fill=col,width=4)
  x,y=path[-1];d.text((x*k+5,y*k-14),str(i),fill=col)
for n in f['nodes'].values():
 x,y=n['x']*k,n['y']*k; d.ellipse((x-6,y-6,x+6,y+6),fill=(0,0,0,255));d.text((x+7,y+4),str(n['id'])+' '+n['text'],fill=(0,0,0,255))
im.convert('RGB').save(D+'/evidence/overlay.png')`;
execFileSync('python',['-c',py,dir],{stdio:'inherit'});

