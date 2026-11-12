// Build protection checks use an isolated working directory under dist/test.
// Its lighting snapshot is derived from the V6 input: no owner scenes or private V4 snapshot are required.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,existsSync,utimesSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readProjects} from '../v7/scene-node.mjs';
import {planBuildOutput,publishBuild} from './build-output.mjs';
const root=resolve('.'), v6=resolve('dist/Material_Flow_Player_v6.html'), build=resolve('tools/build-v7.mjs');
const sample=resolve('docs/examples/sample.scene.json'), hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
assert(existsSync(v6),'V6 input required');
mkdirSync('dist/test',{recursive:true});
const work=mkdtempSync(resolve('dist/test/build-guard-'));
mkdirSync(join(work,'private/v5'),{recursive:true});mkdirSync(join(work,'dist'),{recursive:true});
const base=readProjects(v6),lighting={};
for(const [tab,p] of Object.entries(base)) lighting[tab]={replica:{walls:p.replica.walls},data:{plates:Object.fromEntries(Object.entries(p.data.plates).map(([id,plate])=>[id,{pics:plate.pics.map(({x,y,w,h})=>({x,y,w,h}))}]))}};
writeFileSync(join(work,'private/v5/P-v4.json'),JSON.stringify(lighting));
const run=(out,{cwd=work,input=v6}={})=>spawnSync(process.execPath,[build,'7.7.2','--in',input,'--out',out,'--no-docs-check','--bake',sample],{cwd,encoding:'utf8',windowsHide:true,timeout:120000});
const good=r=>{assert.ifError(r.error);assert.equal(r.status,0,(r.stdout||'')+(r.stderr||''));};
const blocked=r=>{assert.ifError(r.error);assert.notEqual(r.status,0);assert.match((r.stdout||'')+(r.stderr||''),/read-only|never a build output|EEXIST/);};
const earlier=resolve('dist/Material_Flow_Player_v7.7.1.html'), oldHash=existsSync(earlier)?hash(earlier):null;
if(oldHash){blocked(run(earlier,{cwd:root}));assert.equal(hash(earlier),oldHash);}
const fakeOld=join(work,'dist/Material_Flow_Player_v7.7.1.html');writeFileSync(fakeOld,'earlier-stage sentinel');
if(!oldHash)blocked(run('dist/Material_Flow_Player_v7.7.1.html'));
for(const out of ['dist/Material_Flow_Player_v7.7.1.html','dist/MATERIAL_FLOW_PLAYER_V7.7.1.HTML','dist/./Material_Flow_Player_v7.7.1.html','dist/Material_Flow_Player.html','dist/versions/no-write.html','dist/backup/no-write.html']) assert.throws(()=>planBuildOutput('7.7.2',v6,out,work),/read-only|never a build output/);
if(process.platform==='win32')assert.throws(()=>planBuildOutput('7.7.2',v6,'dist\\Material_Flow_Player_v7.7.1.html',work),/read-only/);
assert.equal(readFileSync(fakeOld,'utf8'),'earlier-stage sentinel');
console.log('PASS other releases, case/slash aliases, archives and backup outputs refused; earlier hash unchanged');
// Run the three complete positive compiler invocations in one Node child. Each import has a fresh module scope;
// all compilation, parsing and publication code still runs. This avoids only process-start overhead.
const own=join(work,'dist/Material_Flow_Player_v7.7.2.html'), backup=join(work,'dist/backup');
const config={build,v6,sample,own,expected:join(work,'first-own-hash.txt')};
const positive=spawnSync(process.execPath,['--input-type=module','-e',`
  import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
  import {createHash} from 'node:crypto';
  import {pathToFileURL} from 'node:url';
  const c=JSON.parse(process.argv[1]);
  for(const [i,out] of ['dist/test/guard.html',c.own,c.own].entries()) {
    process.argv=[process.execPath,c.build,'7.7.2','--in',c.v6,'--out',out,'--no-docs-check','--bake',c.sample];
    await import(pathToFileURL(c.build).href+'?guard-build='+i);
    if(i===1){appendFileSync(c.own,'\\n<!-- preserve this pre-existing own-stage edit -->');writeFileSync(c.expected,createHash('sha256').update(readFileSync(c.own)).digest('hex'));}
  }
`,JSON.stringify(config)],{cwd:work,encoding:'utf8',windowsHide:true,timeout:120000});
good(positive);assert(existsSync(join(work,'dist/test/guard.html')));
console.log('PASS explicit dist/test output builds and parses');
const first=readFileSync(config.expected,'utf8');
let saved=readdirSync(backup);assert.equal(saved.length,1);assert.equal(hash(join(backup,saved[0])),first);assert.notEqual(hash(own),first);assert(!existsSync(own+'.tmp'));
console.log('PASS own-stage replacement creates one byte-identical backup of prior edits and publishes without a temporary file');
// Retention never removes another stage, and keeps this stage's five newest copies.
for(let i=0;i<6;i++){const p=join(backup,`Material_Flow_Player_v7.7.2-20000101-00000${i}.html`);writeFileSync(p,'old backup');utimesSync(p,4102444800+i,4102444800+i);}
const other=join(backup,'Material_Flow_Player_v7.7.1-20000101-000000.html');writeFileSync(other,'other-stage sentinel');
publishBuild(planBuildOutput('7.7.2',v6,own,work),readFileSync(own));saved=readdirSync(backup).filter(n=>n.startsWith('Material_Flow_Player_v7.7.2-'));assert.equal(saved.length,5);for(let i=0;i<6;i++)assert.equal(saved.includes(`Material_Flow_Player_v7.7.2-20000101-00000${i}.html`),i>=3);assert.equal(readFileSync(other,'utf8'),'other-stage sentinel');
console.log('PASS backup retention keeps five newest files for this stage and preserves other stages');
const target=join(work,'dist/test/guard.html'), targetHash=hash(target);writeFileSync(target+'.tmp','another build owns this');assert.throws(()=>publishBuild(planBuildOutput('7.7.2',v6,target,work),readFileSync(target)),/EEXIST/);assert.equal(hash(target),targetHash);assert.equal(readFileSync(target+'.tmp','utf8'),'another build owns this');
if(oldHash)assert.equal(hash(earlier),oldHash);
console.log('PASS occupied temporary file refuses publication without truncating either file');
