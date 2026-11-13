// Step 0 exact-film and failure regressions. Uses existing ffmpeg/ffprobe; installs nothing.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openPage } from './cdp.mjs';
import { exportFilm } from './film-export.mjs';

const [player, out = 'dist/test/film-review'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const pg = await openPage(player, 'inj1', { size: '1920,1080' });
try {
  const flow = await pg.ev('MF.D.flows[0].id');
  const take = { flow, name: 'Film regression', t0: 7, t1: 27, speed: 1, fps: 30,
    cam: 'director', captions: true, card: true, labels: true, quality: 'high' };
  for (const fps of [0, NaN, 121, 2.5]) await assert.rejects(exportFilm(pg, { ...take, fps }, resolve(out, 'invalid.mp4')), /whole number/);
  console.log('PASS invalid fps rejected before encoder/browser state changes');
  const saved = await pg.ev('({flow:MF.S.flow,t:MF.S.t,cam:MF.S.cam,speed:MF.S.speed,playing:MF.S.playing,stepStop:MF.S.stepStop})');
  const r = await exportFilm(pg, take, resolve(out, 'exact-20s.mp4'));
  assert.equal(r.status, 'pass'); assert.equal(r.frames, 600);
  assert.equal(+r.video.duration, 20); assert.equal(r.samples[0].t, 7);
  assert(Math.abs(r.samples[599].t - (7 + 599 / 30)) < 1e-8);
  assert.deepEqual(await pg.ev('({flow:MF.S.flow,t:MF.S.t,cam:MF.S.cam,speed:MF.S.speed,playing:MF.S.playing,stepStop:MF.S.stepStop})'), saved);
  console.log('PASS exact film: 20.0 s, 600 decoded frames, no moving freeze, opening timestamp and state restored');
  const fraction = await exportFilm(pg, { ...take, t1: 12, speed: 1.25 }, resolve(out, 'fractional-speed.mp4'));
  assert.equal(fraction.frames, 120); assert.equal(+fraction.video.duration, 4);
  assert(Math.abs(fraction.samples[119].t - (7 + 119 / 30 * 1.25)) < 1e-8);
  console.log('PASS fractional 1.25x speed: 4.0 s, 120 frames, requested story timestamps');
  const broken = resolve(out, 'injected-freeze.mp4');
  await assert.rejects(exportFilm(pg, { ...take, t0: 10, t1: 14 }, broken, { injectFreeze: true }), /Frozen rendered frames/);
  assert.equal(JSON.parse(readFileSync(broken + '.json', 'utf8')).status, 'fail');
  assert.equal(await pg.ev('!!window.MF7_EXPORT'), false);
  console.log('PASS injected moving freeze: rejected, failure receipt retained, offline mode released');
  await pg.ev(`MFX.prepareExport(${JSON.stringify({ ...take, t1: 8 })})`);
  await assert.rejects(pg.ev('MFX.exportFrame(2)'), /sequence/);
  await pg.ev('MFX.exportFrame(0); MFX.finishExport(); 1');
  assert.equal(await pg.ev('!!window.MF7_EXPORT'), false);
  console.log('PASS skipped export frame refused; cleanup remains usable');
  assert.equal(pg.errors.length, 0, pg.errors.join('\n'));
} finally { await pg.ev('MFX.finishExport(); 1').catch(() => {}); await pg.close(); }
