import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const dir='private/projects/eps/'; for(const p of ['plans','evidence']) mkdirSync(dir+p,{recursive:true});
// The supplied EPS plan files have NASCA headers; crop the plain screenshot instead.
// A 71px pitch in the 865px-wide EPS strip is 53.20 slide points. The reference
// Injection grid pitch is 160/1422*355 = 39.94 frame units.
const sx=(160/1422*355)/(71/865*648.25), sy=sx*209.63/195.73;
const pt=(x,y,upper=false)=>[+(x*sx+(upper?900:0)).toFixed(3),+(y*(upper?sx:sy)).toFixed(3)];
const rect=(x,y,w,h,plate,more={})=>{let [X,Y]=pt(x,y,plate==='2F');return {x:X,y:Y,w:+(w*sx).toFixed(3),h:+(h*(plate==='2F'?sx:sy)).toFixed(3),plate,...more}};
const plates={LCM:{label:'LCM',dx:0,dz:0,lift:0,box:[...pt(25,115),...pt(230,480)],pics:[{file:'lcm',...(({x,y,w,h})=>({x,y,w,h}))(rect(33.02,120.33,140.27,341.3,'LCM'))}]},'1F':{label:'1F',dx:0,dz:0,lift:0,box:[...pt(230,280),...pt(900,480)],pics:[{file:'1f',...(({x,y,w,h})=>({x,y,w,h}))(rect(239.56,282.81,648.25,195.73,'1F'))}]},'2F':{label:'2F',dx:0,dz:0,lift:1,box:[...pt(230,145,true),...pt(915,285,true)],pics:[{file:'2f',...(({x,y,w,h})=>({x,y,w,h}))(rect(236.89,147.45,671.92,137.23,'2F'))}]}};
const definitions=[[80,'GR','gr','manual','1F',640.8,412.8],[99,'Waiting Dry','area','none','1F',633.6,452.2],[103,'Dry Room','area','none','1F',539.8,386.1],[107,'W/H 1','area','none','1F',410.7,343.3],[118,'KD','area','none','1F',315.4,351.1],[109,'TO Mapping','mapping','manual','1F',294.6,422.8],[124,'2F Elev 6','lift','none','1F',417.7,403.4],[14,'LCM Elev 2','dest','none','LCM',108.9,429.6],[137,'FDC','dest','none','LCM',75.5,257.9],[139,'2F Elev 6','lift','none','2F',539.3,256.3],[143,'2F WH','area','none','2F',539.2,185.4],[147,'TO Mapping 2F','mapping','manual','2F',574.1,213.8],[7,'To MAIN','dest','none','2F',294.6,237.3]];
const nodes={}; for(const [id,text,kind,mode,plate,x,y] of definitions){const [X,Y]=pt(x,y,plate==='2F');nodes[id]={id,x:X,y:Y,plate,kind,mode,fill:mode==='manual'?'#00B0F0':'#156082',text};}
const N=i=>[nodes[i].x,nodes[i].y];
// Junctions attach the original deck segments to one canonical point per station.
const path=(start,end,via=[],upper=false)=>{let arr=[N(start),...via.map(p=>pt(...p,upper)),N(end)], out=[arr[0]]; for(const b of arr.slice(1)){let a=out.at(-1);if(Math.abs(a[0]-b[0])>.001&&Math.abs(a[1]-b[1])>.001)out.push([b[0],a[1]]);out.push(b)}return out;};
const step=(id,p,title=nodes[id].text)=>({node:id,title,what:`Move to ${title}.`,path:p,mode:'flow',view:nodes[id].plate==='2F'?'3d':'2d',dist:360});
const common=()=>[step(80,null),step(99,path(80,99,[[640.8,452.2]])),step(103,path(99,103,[[611.5,452.2],[611.5,386.1]]))];
const finish=()=>[step(139,'lift'),step(143,path(139,143,[[539.3,220.9]],true)),step(147,path(143,147,[[539.2,213.8]],true)),step(7,path(147,7,[[574.1,237.3],[405.9,237.3]],true))];
function flow(id,name,rest){return {id,name,color:'#00B0F0',steps:[...common(),...rest]}};
const lift=()=>{let a=finish();a[0].lift=true;a[0].elevator='Elev 6';a[0].what='Take Elev 6 to the second floor.';return a};
const map=()=>step(109,path(103,109,[[495.7,386.1],[495.7,393],[450.3,393],[450.3,422.8]]));
const flows=[flow('eps-kd','EPS to KD',[step(118,path(103,118,[[495.8,386.2],[315.4,386.2]]))]),flow('eps-lcm','EPS to LCM Elev 2',[map(),step(14,path(109,14,[[198.2,422.8],[198.2,429.6]]))]),flow('eps-fdc','EPS to FDC',[map(),step(137,path(109,137,[[288.3,422.8],[288.3,416.7],[181.9,416.7],[181.9,257.9]]))]),flow('eps-main','EPS to MAIN via 2F',[step(107,path(103,107,[[495.7,386.1],[495.7,381.3],[453.2,381.3],[453.2,343.3]])),step(124,path(107,124,[[411.3,343.3],[411.3,349.6],[429.7,349.6],[429.7,403.4]])),...lift()]),flow('eps-direct-2f','EPS direct to 2F',[step(124,path(103,124,[[495.1,386.1],[495.1,389.6],[417.7,389.6]])),...lift()])];
const F={id:'eps',title:'EPS material flow',slide:{title:'EPS location 1F and 2F',w:960,h:540},plates,elevators:[{label:'Elev 6',low:N(124),lowPlate:'1F',high:N(139),highPlate:'2F'}],nodes,flows};
const R={walls:[],racks:[],columns:[],machines:[],trucks:[],conveyors:[],rooms:[],lifts:[],decks:[],crop:{},scale:.3};
const wall=(x,y,X,Y,plate='1F')=>R.walls.push({a:pt(x,y,plate==='2F'),b:pt(X,Y,plate==='2F'),plate});
const box=(x,y,w,h,plate)=>{wall(x,y,x+w,y,plate);wall(x+w,y,x+w,y+h,plate);wall(x+w,y+h,x,y+h,plate);wall(x,y+h,x,y,plate)};
// Approximate visible structural outlines and rack fields from the displayed plan.
wall(270,286,888,286);wall(270,286,270,478);wall(270,399,756,399);wall(270,478,888,478);wall(330,286,330,399);wall(471,286,471,399);wall(542,286,542,399);wall(650,286,650,399);wall(756,286,756,399);
for(const [x,y,w,h,label] of [[495,369,45,31,'Dry Room'],[588,423,48,48,'Waiting Dry'],[290,302,48,95,'KD'],[343,294,110,91,'W/H 1'],[300,421,188,54,'W/H 2']]) R.rooms.push(rect(x,y,w,h,'1F',{label}));
for(const x of [350,371,405,438]) R.racks.push(rect(x,295,x===438?30:23,45,'1F')); for(const x of [350,371]) R.racks.push(rect(x,347,23,45,'1F'));
for(const x of [300,360,420,480,540,600,660,720,780,840]) { R.columns.push({p:pt(x,399),plate:'1F'}); R.machines.push({type:'dock',...rect(x,471,19,7,'1F')}); }
R.lifts.push(rect(406,395,25,16,'1F',{label:'Elev 6'}));
box(42,124,112,335,'LCM'); for(let y=190;y<=250;y+=13)R.racks.push(rect(45,y,76,7,'LCM')); R.lifts.push(rect(48,421,35,18,'LCM',{label:'LCM Elev 2'}));
box(460,154,205,100,'2F');wall(665,154,665,254,'2F');wall(745,154,745,254,'2F');wall(325,229,460,229,'2F');R.rooms.push(rect(460,154,205,100,'2F',{label:'2F WH'}));R.lifts.push(rect(526,250,26,17,'2F',{label:'Elev 6'}));
// Small visible storage rows at the northern edge of the 2F warehouse.
for(let x=625;x<662;x+=8)R.racks.push(rect(x,155,6,5,'2F'));
plates['2F'].dx=+(N(124)[0]-N(139)[0]).toFixed(3); plates['2F'].dz=+(N(124)[1]-N(139)[1]).toFixed(3);
writeFileSync(dir+'flow.json',JSON.stringify(F,null,2));writeFileSync(dir+'replica.json',JSON.stringify(R,null,2));
const py=String.raw`
from PIL import Image,ImageDraw
import json, math
D='private/projects/eps/'
f=json.load(open(D+'flow.json',encoding='utf8')); r=json.load(open(D+'replica.json',encoding='utf8'))
# Pixel centres of three cyan COM symbols, measured in the owner's 2042x1145 screenshot.
obs=[(1347,877,640.8,412.8),(606,898,294.6,422.8),(1205,451,574.1,213.8)]
def fit(p,q):
 a=sum((x-sum(p)/len(p))*(y-sum(q)/len(q)) for x,y in zip(p,q))/sum((x-sum(p)/len(p))**2 for x in p); return a,sum(q)/len(q)-a*sum(p)/len(p)
a,b=fit([v[0] for v in obs],[v[2] for v in obs]);c,d=fit([v[1] for v in obs],[v[3] for v in obs])
print('FIT',a,b,c,d,'residuals',[(round(a*x+b-X,2),round(c*y+d-Y,2)) for x,y,X,Y in obs])
import sys
sys.path.insert(0,'private/projects')
from clean_plan import clean
im=clean(Image.open('private/paths/shots/eps.png'),4,a,b,c,d)
for name,x,y,w,h in [('lcm',33.02,120.33,140.27,341.30),('1f',239.56,282.81,648.25,195.73),('2f',236.89,147.45,671.92,137.23)]:
 im.crop((round((x-b)/a),round((y-d)/c),round((x+w-b)/a),round((y+h-d)/c))).save(D+'plans/'+name+'.png')
# Independent plate overview, drawn in project frame, preserving ground-floor gaps.
S=1.7; margin=20; bounds=[0,70,1600,390]
def xy(p):return (int((p[0]-bounds[0])*S+margin),int((p[1]-bounds[1])*S+margin))
out=Image.new('RGB',(int((bounds[2]-bounds[0])*S+2*margin),int((bounds[3]-bounds[1])*S+2*margin)),'white')
for plate in f['plates'].values():
 for p in plate['pics']:
  src=Image.open(D+'plans/'+p['file']+'.png').convert('RGB'); x,y=xy((p['x'],p['y'])); w,h=int(p['w']*S),int(p['h']*S);out.paste(src.resize((w,h)),(x,y))
draw=ImageDraw.Draw(out,'RGBA')
for w in r['walls']:draw.line([xy(w['a']),xy(w['b'])], fill=(220,20,20,230),width=2)
for key,color in [('rooms',(250,180,0,70)),('racks',(0,150,20,110)),('lifts',(200,0,200,120)),('machines',(80,80,80,100))]:
 for v in r[key]:
  x,y=xy((v['x'],v['y'])); X,Y=xy((v['x']+v['w'],v['y']+v['h']));draw.rectangle((x,y,X,Y),fill=color,outline=color[:3]+(255,),width=2)
for c in r['columns']:
 x,y=xy(c['p']);draw.ellipse((x-3,y-3,x+3,y+3),fill=(0,0,0,255))
for flow in f['flows']:
 for st in flow['steps']:
  if isinstance(st['path'],list): draw.line([xy(p) for p in st['path']], fill=(0,120,255,255),width=3)
for n in f['nodes'].values():
 x,y=xy((n['x'],n['y']));draw.ellipse((x-5,y-5,x+5,y+5),fill=(255,0,0,255));draw.text((x+5,y-12),str(n['id']),fill=(0,0,0,255))
out.save(D+'evidence/overlay.png')
`;
execFileSync('python',['-c',py],{stdio:'inherit'});console.log('Scale:',sx,sy);
