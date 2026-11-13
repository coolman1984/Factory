import {readFileSync,writeFileSync,mkdirSync,unlinkSync,existsSync} from 'node:fs';
const file='src/v8/player.js',s=readFileSync(file,'utf8');
if(existsSync('src/v8/player'))throw new Error('player parts already exist');
const cuts=[{at:0,name:'camera-envelope'}];
for(const m of s.matchAll(/^\(function \(\) \{|^  \/\* ---------- (.*?) ---------- \*\//gm))cuts.push({at:m.index,name:m[1]||'boot'});
mkdirSync('src/v8/player');
for(let i=0;i<cuts.length;i++){const name=cuts[i].name.toLowerCase().replace(/[^a-z]+/g,'-').slice(0,30).replace(/-$/,'');writeFileSync('src/v8/player/'+String(i).padStart(2,'0')+'-'+name+'.js',Buffer.from(s.slice(cuts[i].at,cuts[i+1]?.at),'utf8'));}
unlinkSync(file);console.log('split '+cuts.length+' byte-preserving engine fragments');
