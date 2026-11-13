// V8 builds from maintained source and ignored layout/model inputs; V7 patches are not loaded.
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {planBuildOutput,publishBuild} from './v8/build-output.mjs';
import {buildParts,safe} from './v8/build-parts.mjs';
const args=process.argv.slice(2),stage=args[0]&&!args[0].startsWith('--')?args.shift():'8.0',options={},bake=[];
for(let i=0;i<args.length;i++){
 const k=args[i];if(k==='--bake'){while(args[i+1]&&!args[i+1].startsWith('--'))bake.push(args[++i]);if(!bake.length)throw new Error('--bake needs scene files');options[k]=true;}
 else if(k==='--no-docs-check')options[k]=true;
 else if(k==='--out'&&args[i+1]&&!args[i+1].startsWith('--'))options[k]=args[++i];
 else throw new Error('unknown option or missing value: '+k);
}
const STAGES={
 "8.0":{groups:[['scene-ui.js'],['studio-core.js','studio-camera.js','studio-edit.js','studio-director.js','studio-numbers.js','studio-ui.js']],css:['scene-ui.css','studio.css']},
};
// 8.1 = 8.0 + the Factory Engine: the step timeline comes from engine events (src/v8/engine/, docs/ENGINE.md "Factory Engine").
STAGES["8.1"]={...STAGES["8.0"],engine:true};
const ref=stage==='ref-772',version=ref?'7.7.2':stage,S=STAGES[ref?'8.0':stage];if(!S)throw new Error('unknown V8 stage '+stage);
if(ref&&!options['--out'])throw new Error('ref-772 requires explicit --out dist/test/<name>.html');
const out=options['--out']||`dist/Material_Flow_Player_v${stage}.html`,output=planBuildOutput(ref?'7.7.2':stage,'private/v8/base/projects.json',out);
if(ref&&!output.testOutput)throw new Error('reference output must stay in dist/test');
const read=p=>readFileSync(p,'utf8'),src=p=>read('src/v8/'+p),v7=p=>read('tools/v7/'+p);
const projects=JSON.parse(read('private/v8/base/projects.json'));
const files=options['--bake']?bake:existsSync('private/v7/scenes')?readdirSync('private/v7/scenes').filter(f=>f.endsWith('.scene.json')).map(f=>'private/v7/scenes/'+f):[];
const {bundle,lightErase,lightBox}=buildParts(projects,files);
const wrap=files=>`/* Material Flow V${version}: ${files.join(', ')} */\n(() => {\n"use strict";\ntry {\n${safe(files.map(f=>`/* ---- ${f} ---- */\n`+v7(f)).join('\n'))}\n} catch (e) { console.error("V${version} add-on failed to start", e); const t = document.getElementById("tip"); if (t) { t.textContent = "The V${version} tools could not start: " + e.message; t.style.display = "block"; } }\n})();`;
const engine=existsSync('src/v8/player.js')?src('player.js'):readdirSync('src/v8/player').filter(f=>f.endsWith('.js')).sort().map(f=>src('player/'+f)).join('');
const scripts={three:readdirSync('src/v8/vendor').filter(f=>f==='three.js'||/^three-\d+\.js$/.test(f)).sort((a,b)=>a==='three.js'?-1:b==='three.js'?1:a.localeCompare(b)).map(f=>src('vendor/'+f)).join(''),addons:src('vendor/three-addons.js'),lights:`window.MF7_LIGHT_ERASE=${JSON.stringify(lightErase)};window.MF7_LIGHT_BOX=${JSON.stringify(lightBox)};`,scenes:safe(JSON.stringify(bundle)),'scene-core':safe(v7('scene-core.js')),preload:safe(v7('preload-scene.js')),projects:read('private/v8/base/device-dims.js')+src('project-boot.js').replace('/*@PROJECTS@*/',()=>JSON.stringify(projects)),atmos:src('dfatmos.js'),look:src('look.js'),replica:read('private/v8/base/assets.js')+src('replica.js'),player:engine,'scene-ui':wrap(S.groups[0]),studio:wrap(S.groups[1])};
let html=src('shell.html').replace(/<!--@SCRIPT:([a-z-]+)@-->/g,(_,k)=>{if(!Object.hasOwn(scripts,k))throw new Error('unknown script token '+k);return scripts[k];}).replace('/*@STYLE@*/',()=>src('player.css')+S.css.map(v7).join('\n'));
if(existsSync('src/v8/motion-core.js'))html=html.replace('<script>'+safe(v7('scene-core.js'))+'</script>',()=>'<script>'+safe(v7('scene-core.js'))+'</script><script>'+src('motion-core.js')+'</script>'+(S.engine?'<script>'+safe(src('engine/factory-engine.js'))+'</script><script>'+safe(src('engine/engine-bridge.js'))+'</script>':''));
if(S.engine){if(!html.includes('window.MFEngine'))throw new Error('engine stage: bridge was not inserted (motion core missing?)');const i=html.lastIndexOf('</body>');html=html.slice(0,i)+'<script>'+safe(src('engine/engine-panel.js'))+'</script>'+html.slice(i);}
html=html.replace('<title>Material Flow Player V7.7.2</title>',`<title>Material Flow Player V${version}</title>`);
let count=0;for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){const type=/\btype\s*=\s*["']([^"']+)["']/i.exec(m[1]);if(/\bsrc\s*=/i.test(m[1])||(type&&!/^(?:text|application)\/(?:java|ecma)script$/i.test(type[1])))continue;new vm.Script(m[2]);count++;}console.log(`syntax: ${count} inline scripts parse`);
if(!options['--no-docs-check']&&!output.testOutput){const {docsCheck}=await import('./v7/docs-check.mjs');const problems=await docsCheck();if(problems.length)throw new Error('docs-check failed:\n'+problems.join('\n'));console.log('docs-check OK');}
publishBuild(output,html);console.log(`${out}: sha256 ${createHash('sha256').update(html).digest('hex')}; source build ${stage}`);
