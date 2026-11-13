// M0 gate: every selected row runs sequentially, with bounded child processes and local evidence.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,basename,join} from 'node:path';
const argv=process.argv.slice(2),player=argv.shift();
if(!player||player.startsWith('--')||!existsSync(player))throw new Error('gate <player.html> [--quick] [--only name,name] [--out dist/test/gate-name]');
let quick=false,only=null,out='dist/test/gate-'+basename(player,'.html');
for(let i=0;i<argv.length;i++){
 if(argv[i]==='--quick')quick=true;
 else if(['--only','--out'].includes(argv[i])&&argv[i+1]&&!argv[i+1].startsWith('--')){const k=argv[i++];if(k==='--only')only=argv[i].split(',');else out=argv[i];}
 else throw new Error('unknown option or missing value: '+argv[i]);
}
const rel=relative(resolve('dist/test'),resolve(out));if(rel.startsWith('..')||isAbsolute(rel))throw new Error('--out must stay inside dist/test');
const fixture=join(out,'identity.html'),proof=join(out,'proof.html');
if([fixture,proof].some(p=>resolve(p).toLowerCase()===resolve(player).toLowerCase()))throw new Error('player conflicts with a gate fixture');
const tabs=[['inj1',2],['inj2',2],['eps',4],['press',2]],scenes=tabs.map(([t])=>'private/v7/scenes/'+t+'.scene.json'), originals=tabs.map(([t])=>'private/v7/scenes-v6/'+t+'.scene.json');
const hasPrivate=existsSync('private/v7/scenes'),rows=[];
const add=(name,q,needs,commands)=>rows.push({name,q,needs,commands});
const sourceStage=/<title>Material Flow Player V(8[^<]*)<\/title>/.exec(readFileSync(player,'utf8'))?.[1];
const build=(output,bake)=>[sourceStage?'tools/build-v8.mjs':'tools/build-v7.mjs',sourceStage||'7.7.2','--out',output,'--no-docs-check','--bake',...bake];
add('docs',true,[],()=>[['tools/mf.mjs','docs-check']]);
add('validate',true,[],()=>[['tools/mf.mjs','validate',...readdirSync('docs/examples').filter(f=>f.endsWith('.scene.json')).map(f=>'docs/examples/'+f),...(hasPrivate?scenes:[]),'--player',player]]);
add('validator',true,[],()=>[['tools/v7/validator-test.mjs',player]]);
add('identity',true,originals,()=>[build(fixture,originals),['tools/v7/identity-test.mjs','dist/Material_Flow_Player_v6.html',fixture]]);
add('layout-adds',true,[],()=>[['tools/v7/layout-adds-test.mjs',player]]);
for(const [name,tool]of [['review','review-test'],['smoke','smoke-76'],['mouse','mouse-test'],['ui','ui-check'],['gates','gates-test']])add(name,false,[],()=>[['tools/v7/'+tool+'.mjs',player,...(['smoke','mouse'].includes(name)?[join(out,name+'.png')]:[])]]);
// The legacy synchronous import fixture has no additions. Actual-player reloads are covered by layout-adds/review.
add('stage1',false,[...originals,'private/v7/proof/inj1.scene.json'],()=>[...(!results.some(r=>r.name==='identity'&&r.exit===0)?[build(fixture,originals)]:[]),build(proof,['private/v7/proof/inj1.scene.json']),['tools/v7/stage1-test.mjs',fixture,proof]]);
for(const [tab,n]of tabs)for(let i=0;i<n;i++)add(`camera-${tab}-${i}`,false,scenes,()=>[['tools/test-camera-v5.mjs',player,tab,'guided','3',String(i)]]);
add('start',false,[],()=>[['tools/v7/start-test.mjs',player,'8']]);
add('take',false,[],()=>[['tools/v7/take-test.mjs',player,'inj1','0','3',join(out,'takes')]]);
add('guard',true,[],()=>[['tools/v8/build-guard-test.mjs']]);
if(sourceStage){add('motion',true,[],()=>[['tools/v8/motion-test.mjs']]);add('numbers',false,scenes,()=>[['tools/v8/numbers-test.mjs',player]]);}
const names=new Set([...rows.map(r=>r.name),'camera']);
if(only?.some(n=>!names.has(n)))throw new Error('unknown gate row: '+only.filter(n=>!names.has(n)).join(','));
const selected=rows.filter(r=>(!quick||r.q)&&(!only||only.includes(r.name)||(r.name.startsWith('camera-')&&only.includes('camera'))));
if(!selected.length)throw new Error('no gate rows selected');
mkdirSync(out,{recursive:true});
const results=[],start=Date.now();
for(const row of selected){
 const t=Date.now();let log='',exit=0,lastLine='',command='';
 if(row.needs.length&&(!hasPrivate||row.needs.some(p=>!existsSync(p)))){
  exit=null;lastLine='SKIP (no private scenes)';log=lastLine+'\n';
 }else{
  const commands=row.commands();command=commands.map(a=>'node '+a.map(s=>/\s/.test(s)?JSON.stringify(s):s).join(' ')).join('\n');
  if(row.name==='validate'&&!hasPrivate)log+='SKIP (no private scenes); validating public examples\n';
  for(const args of commands){
   try{log+=execFileSync(process.execPath,args,{encoding:'utf8',stdio:'pipe',windowsHide:true,maxBuffer:32*1024*1024,timeout:Math.max(1,1200000-(Date.now()-t))});}
   catch(e){exit=typeof e.status==='number'?e.status:1;log+=(e.stdout?.toString()||'')+(e.stderr?.toString()||'')+'\n'+e.message+'\n';break;}
  }
  lastLine=log.trim().split(/\r?\n/).at(-1)||'(no output)';
 }
 const seconds=+((Date.now()-t)/1000).toFixed(3);writeFileSync(join(out,row.name+'.log'),log);
 results.push({name:row.name,command,exit,seconds,lastLine});writeFileSync(join(out,'results.json'),JSON.stringify(results,null,1)+'\n');
 console.log(`${exit===null?'SKIP':exit?'FAIL':'PASS'} ${row.name} ${seconds} s${exit===null?' (no private scenes)':''}`);
}
const seconds=+((Date.now()-start)/1000).toFixed(3),failed=results.filter(r=>r.exit!==null&&r.exit!==0).length;
writeFileSync(join(out,'summary.json'),JSON.stringify({player:resolve(player),quick,seconds,failed,skipped:results.filter(r=>r.exit===null).length},null,1)+'\n');
console.log(`Gate: ${failed?'FAIL':'PASS'}, ${results.length} rows, ${seconds} s`);process.exitCode=failed?1:0;
