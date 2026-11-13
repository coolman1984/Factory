// Local Chrome timeline for attributing stalls; traces may contain plan labels, so PRIVATE output only.
import {openChrome} from './chrome-session.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const seconds=+(process.argv[2]||40),out=process.argv[3]||'private/evidence/profile'; mkdirSync(out,{recursive:true});
const chrome=await openChrome({file:new URL('../dist/Material_Flow_Player.html?q=high&profile=1',import.meta.url),width:1920,height:1080});
try{
  await chrome.evaluate('Promise.resolve(MF.ready).then(()=>true)');
  let complete; const traced=new Promise(r=>complete=r);chrome.on('Tracing.tracingComplete',complete);
  await chrome.call('Tracing.start',{categories:'devtools.timeline,v8,gpu,disabled-by-default-v8.gc',transferMode:'ReturnAsStream'},null);
  await chrome.evaluate(`(()=>{window.__intervals=[];window.__long=[];new PerformanceObserver(list=>{for(const e of list.getEntries())__long.push({start:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:false});let prev;function sample(t){if(prev!=null)__intervals.push({t:MF.S.t,ms:t-prev});prev=t;if(!window.__stop)requestAnimationFrame(sample)}requestAnimationFrame(sample);MF.perf.reset();MF.seek(0);MF.play();return true})()`);
  await new Promise(r=>setTimeout(r,seconds*1000));
  const report=await chrome.evaluate('window.__stop=true;MF.pause();({frames:__intervals,longtasks:__long,summary:MF.perf.snapshot(),events:MF.perf.events,slow:MF.perf.slowFrames.filter(f=>f.ms>60),errorBox:document.getElementById("err").textContent})');
  writeFileSync(out+'/report.json',JSON.stringify({...report,gpu:chrome.gpu,errors:chrome.errors},null,2));
  await chrome.call('Tracing.end',{},null);const {stream}=await traced;let trace='';
  for(;;){const chunk=await chrome.call('IO.read',{handle:stream},null);trace+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}
  await chrome.call('IO.close',{handle:stream},null);writeFileSync(out+'/trace.json',trace);
  const times=report.frames.map(f=>f.ms).sort((a,b)=>a-b);console.log(JSON.stringify({gpu:chrome.gpu,frames:times.length,p50:times[Math.floor(times.length*.5)],p99:times[Math.floor(times.length*.99)],worst:times.at(-1),summary:report.summary,longtasks:report.longtasks.length,errors:chrome.errors}));
}finally{await chrome.close()}
