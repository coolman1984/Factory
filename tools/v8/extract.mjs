// Freeze a reviewed player without placing company layouts, scenes or models in source.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const file=process.argv[2]; if(!file)throw new Error('extract <reference.html>');
const html=readFileSync(file,'utf8'), re=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, scripts=[...html.matchAll(re)];
assert.equal(scripts.length,13,'expected exactly thirteen reference scripts');
const found=new Map();
const pick=(name,pred)=>{const matches=scripts.filter(pred);assert.equal(matches.length,1,'expected one '+name);const m=matches[0];assert(![...found.values()].includes(m),'script matched twice');found.set(name,m);return m[2];};
pick('three',m=>m[2].startsWith('var THREE='));
pick('addons',m=>scripts.indexOf(m)===scripts.indexOf(found.get('three'))+1);
pick('lights',m=>m[2].startsWith('window.MF7_LIGHT_ERASE='));
pick('scenes',m=>/\bid="mf7-embedded"/.test(m[1]));
pick('scene-core',m=>m[2].startsWith('/* Material Flow scene core'));
pick('preload',m=>m[2].startsWith('/* V7 preload'));
const project=pick('projects',m=>m[2].startsWith('window.MF_DEVICE_DIMS='));
pick('atmos',m=>m[2].startsWith('/* DFAtmos'));
pick('look',m=>m[2].startsWith('/* Offline, seeded surface library'));
const assets=pick('replica',m=>m[2].startsWith('window.MF_ASSETS='));
pick('player',m=>m[2].slice(0,200).includes('camera-envelope.js'));
pick('scene-ui',m=>m[2].startsWith('/* Material Flow V')&&m[2].includes(': scene-ui.js */'));
pick('studio',m=>m[2].startsWith('/* Material Flow V')&&m[2].includes(': studio-core.js,'));
const planned=new Map(),put=(p,s)=>{assert(!planned.has(p),'duplicate output');if(p.startsWith('src/'))assert(s.split('\n').every(l=>l.length<=100000),'oversized source line: '+p);planned.set(p,s);};
const src='src/v8/',base='private/v8/base/';
for(const [name,path]of [['addons','vendor/three-addons.js'],['atmos','dfatmos.js'],['look','look.js'],['player','player.js']])put(src+path,found.get(name)[2]);
// The upstream minified library itself exceeds the source line limit. Concatenate byte-preserving fragments at build time.
const three=found.get('three')[2];for(let i=0;i<three.length;i+=80000)put(src+'vendor/'+(i?'three-'+String(i/80000).padStart(3,'0'):'three')+'.js',three.slice(i,i+80000));
const splitLine=(s)=>{const n=s.indexOf('\n');assert(n>=0);return [s.slice(0,n+1),s.slice(n+1)];};
const [dims,boot]=splitLine(project),pm=/var P = (\{[^\n]*\})/.exec(boot);assert(pm,'project JSON line');JSON.parse(pm[1]);
put(base+'device-dims.js',dims);put(base+'projects.json',pm[1]);put(src+'project-boot.js',boot.replace(pm[1],'/*@PROJECTS@*/'));
const [models,replica]=splitLine(assets);assert(models.startsWith('window.MF_ASSETS='));put(base+'assets.js',models);put(src+'replica.js',replica);
const styles=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];assert.equal(styles.length,1);
const appended=readFileSync('tools/v7/scene-ui.css','utf8')+'\n'+readFileSync('tools/v7/studio.css','utf8');assert(styles[0][1].endsWith(appended),'appended stage styles differ');put(src+'player.css',styles[0][1].slice(0,-appended.length));
let shell=html;const edits=[...found].map(([name,m])=>({at:m.index+m[0].indexOf('>')+1,len:m[2].length,token:'<!--@SCRIPT:'+name+'@-->'}));
edits.push({at:styles[0].index+styles[0][0].indexOf('>')+1,len:styles[0][1].length,token:'/*@STYLE@*/'});
for(const e of edits.sort((a,b)=>b.at-a.at))shell=shell.slice(0,e.at)+e.token+shell.slice(e.at+e.len);put(src+'shell.html',shell);
for(const p of planned.keys())assert(!existsSync(p),'extraction output already exists; refuse to overwrite '+p);
for(const [p,s]of planned){mkdirSync(p.slice(0,p.lastIndexOf('/')),{recursive:true});writeFileSync(p,Buffer.from(s,'utf8'));}
console.log('extracted thirteen scripts, private data separated; source lines <= 100000');
