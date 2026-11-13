// Whole-journey sight-line sweep for "Ride with the lot". Plays every flow through the real frame loop, so the eye is the
// actual smoothed eye, and casts real rays from the eye to points on the trolley. Clearance is a separate proof (test-chase.mjs).
// Usage: node tools/test-chase-sight.mjs <evidence folder>. Screens and report stay local.
// Fails when: any lift sample has a blocked trolley point, or any ground sample hides the whole trolley for longer than GRACE_S.
import { openChrome } from './chrome-session.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2] || 'private/evidence/chase-sight'; mkdirSync(out, { recursive: true });
const GRACE_S = 0.5; // story seconds a passing column may fully hide the trolley on the ground
const chrome = await openChrome({ file: new URL('../dist/Material_Flow_Player.html?q=low&fade=0', import.meta.url), timeout: 590000 });
const shots = [];
try {
  await chrome.evaluate('Promise.resolve(MF.ready).then(()=>true)');
  await chrome.evaluate(`(()=>{
    const T = THREE, scene = MF.floors[0].art.parent.parent, ray = new T.Raycaster(), dir = new T.Vector3(), eye = new T.Vector3(), lotBox = new T.Box3(), p = new T.Vector3();
    const isLot = o => { for (; o; o = o.parent) if (o === MF.lot) return true; return false; };
    const solids = () => { const list = []; scene.traverseVisible(o => { if ((o.isMesh || o.isInstancedMesh) && !o.material.transparent && !isLot(o)) list.push(o); }); return list; };
    // Five points on the trolley: centre, and four around it at mid and full height.
    function trolleyPoints() {
      lotBox.makeEmpty(); MF.lot.updateWorldMatrix(true, true);
      MF.lot.traverse(o => { if (o.isMesh && !o.material.transparent) lotBox.expandByObject(o); });
      const c = lotBox.getCenter(new T.Vector3()), s = lotBox.getSize(new T.Vector3());
      return [c, c.clone().setY(lotBox.max.y - .1), c.clone().setX(c.x - s.x * .4), c.clone().setX(c.x + s.x * .4), c.clone().setZ(c.z - s.z * .4), c.clone().setZ(c.z + s.z * .4)];
    }
    function sample(list) {
      eye.copy(MF.camera.eye); const pts = trolleyPoints(); let blocked = 0, first = null;
      for (const q of pts) {
        const d = dir.subVectors(q, eye).length(); dir.normalize(); ray.set(eye, dir); ray.near = 0; ray.far = d - 1.5; // the cabin deck under the lot is not a blocker
        const hits = ray.intersectObjects(list, false);
        if (hits.length) { blocked++; if (!first) { const h = hits[0], m = h.object; first = { name: m.name || m.material.name || m.type, mat: m.material.userData.plate || '', point: h.point.toArray().map(v => +v.toFixed(1)), inst: h.instanceId ?? null, dist: +h.distance.toFixed(1) }; } }
      }
      return { pts: pts.length, blocked, first };
    }
    window.__sight = function run(flow, view, speed, dt, from) {
      MF.pause(); MF.setFlow(flow); MF.setCam('chase'); MF.setView(view); MF.setSpeed(speed); MF.seek(from || 0); MF.play();
      const f = MF.D.flows[flow], total = f.total ?? f.items[f.items.length - 1].t1, rows = []; let guard = 0, list = solids(), last = -1;
      while (MF.S.playing && MF.S.t < total && guard++ < 40000) {
        MF.frame(dt, MF.S.t);
        const cur = MF.stepAt(MF.S.t); if (cur.s.intro || !MF.lot.visible) continue;
        const lift = !!cur.s.lift;
        if (!lift && MF.S.t - last < .2) continue; // ground rays every 0.2 story seconds; every frame in the lift
        last = MF.S.t; list = solids();
        const r = sample(list); rows.push({ t: +MF.S.t.toFixed(2), step: cur.i, title: cur.s.title, lift, stack: +MF.S.stack.toFixed(2), blocked: r.blocked, pts: r.pts, first: r.first, eye: MF.camera.eye.toArray().map(v => +v.toFixed(1)) });
      }
      MF.pause(); return rows;
    };
    window.__pose = function pose(flow, view, speed, t) { // reach t by playing the last seconds, so the eye is the real one
      MF.pause(); MF.setFlow(flow); MF.setCam('chase'); MF.setView(view); MF.setSpeed(speed); MF.seek(Math.max(0, t - 6 * speed)); MF.play();
      let guard = 0; while (MF.S.t < t && MF.S.playing && guard++ < 4000) MF.frame(1 / 60, MF.S.t);
      MF.pause(); MF.frame(0, MF.S.t); return { t: MF.S.t, step: MF.stepAt(MF.S.t).s.title };
    };
    return true;
  })()`);
  const flows = await chrome.evaluate('MF.D.flows.map((f,i)=>({i,name:f.name||f.title||String(i),lifts:f.items.filter(x=>x.s.lift).map(x=>({t0:x.t0,tm:x.tm,t1:x.t1,title:x.s.title}))}))');
  const report = { flows: [], gpu: chrome.gpu }; let failed = false;
  for (const f of flows) for (const view of ['auto', '3d']) for (const [speed, dt] of [[1, 1 / 30], [8, 1 / 60]]) {
    const started = Date.now();
    const rows = await chrome.evaluate(`__sight(${f.i},${JSON.stringify(view)},${speed},${dt})`);
    const lift = rows.filter(r => r.lift), ground = rows.filter(r => !r.lift);
    const liftBlocked = lift.filter(r => r.blocked);
    const hidden = ground.filter(r => r.blocked === r.pts), partial = ground.filter(r => r.blocked && r.blocked < r.pts);
    // Longest run of fully hidden ground samples, in story seconds.
    let run = 0, longest = 0, longestAt = null, prev = -1e9, start = 0; for (const r of ground) { if (r.blocked === r.pts) { if (r.t - prev > .45) { run = 0; start = r.t; } run = r.t - start; prev = r.t; if (run >= longest) { longest = run; longestAt = start; } } }
    const bad = liftBlocked.length > 0 || longest > GRACE_S; failed ||= bad;
    const blockers = {}; for (const r of [...liftBlocked, ...hidden]) { const k = r.first?.name ?? '?'; blockers[k] = (blockers[k] || 0) + 1; }
    const row = { flow: f.i, name: f.name, view, speed, samples: rows.length, liftSamples: lift.length, liftBlocked: liftBlocked.length, groundHidden: hidden.length, groundPartial: partial.length, longestHiddenS: +longest.toFixed(2), longestHiddenAt: longestAt, blockers, seconds: Math.round((Date.now() - started) / 1000), firstLiftBlocked: liftBlocked[0] ?? null, worstSteps: [...new Set(hidden.map(r => r.step))], hiddenTimes: hidden.slice(0, 40).map(r => r.t), bad };
    report.flows.push(row); console.log(JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k]) => !['hiddenTimes', 'firstLiftBlocked'].includes(k)))));
  }
  // Screens: entry, progress and exit of each lift, at the real played eye, plus the longest hidden ground moment.
  for (const f of flows) for (const l of f.lifts) for (const [label, t] of [['entry', l.t0 + .02], ['25', l.t0 + (l.tm - l.t0) * .25], ['50', l.t0 + (l.tm - l.t0) * .5], ['75', l.t0 + (l.tm - l.t0) * .75], ['exit', l.tm + .3]]) {
    await chrome.evaluate(`__pose(${f.i},'auto',1,${t})`); const file = `${out}/f${f.i}-lift-${label}.png`; await chrome.screenshot(file); shots.push(file);
  }
  for (const r of report.flows.filter(x => x.longestHiddenAt != null && x.speed === 1 && x.view === 'auto')) { await chrome.evaluate(`__pose(${r.flow},'auto',1,${r.longestHiddenAt + .05})`); const file = `${out}/f${r.flow}-hidden.png`; await chrome.screenshot(file); shots.push(file); }
  report.shots = shots; report.errors = chrome.errors; report.errorBox = await chrome.evaluate(`document.getElementById('err').textContent`);
  writeFileSync(out + '/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ failed, errors: chrome.errors, errorBox: report.errorBox, gpu: chrome.gpu, shots: shots.length }));
  if (failed || chrome.errors.length || report.errorBox) process.exitCode = 1;
} finally { await chrome.close(); }
