// CPU regressions for the Step 0 director review; synthetic poses only, no private data or browser.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { cameraKey } from './mf-ops.mjs';

const ctx = { Math, tmpV: {}, lerp: (a, b, t) => a + (b - a) * t,
  wrapPi: a => Math.atan2(Math.sin(a), Math.cos(a)), BASE_FOV: 28,
  trolleyWorld: t => ({ x: t * 3, y: 2, z: t }), directorPose: null };
const source = readFileSync(new URL('./studio-director.js', import.meta.url), 'utf8');
vm.runInNewContext(source.slice(0, source.indexOf('function addKey(')) + '\nthis.evaluate = evalDirector;', ctx);
const key = (t, x, extra = {}) => ({ t, x, y: x / 2, z: x / 3, dist: 100, az: 3.1, pol: .6, fov: 28, ease: 'smooth', ...extra });
for (const ease of ['smooth', 'linear', 'in', 'out']) {
  const d = { keys: [key(0, 0), key(2, 10, { ease, az: -3.1 }), key(4, 0)] };
  for (let t = 0; t <= 4; t += .01) {
    const p = ctx.evaluate(t, d);
    assert(p.x >= -1e-9 && p.x <= 10 + 1e-9, `${ease}: target overshoot at ${t}`);
    assert(Math.abs(p.az - 3.1) < .1 || Math.abs(p.az + 3.1) < .1, 'angle must use the short arc');
    assert(Math.abs(p.dist - 100) < 1e-9);
  }
  assert.equal(ctx.evaluate(2, d).x, 10);
  console.log(`PASS director ${ease}: bounded target and short angular arc`);
}
const cuts = { keys: [key(0, 0), key(2, 10, { ease: 'cut' }), key(4, 20)] };
assert.equal(ctx.evaluate(1.999, cuts).x, 0);
assert.equal(ctx.evaluate(2, cuts).x, 10);
assert.equal(ctx.evaluate(4, cuts).x, 20);
console.log('PASS director cut: holds until the exact boundary, including the last key');
const follow = { keys: [key(0, 0, { follow: true, ox: 2, oy: 3, oz: 4 }), key(10, 0, { follow: true, ox: 2, oy: 3, oz: 4 })] };
for (const speed of [1, 3, 8]) for (let frame = 0; frame < 40; frame++) {
  const t = frame / 4, p = ctx.evaluate(t, follow);
  assert.equal(p.x, t * 3 + 2); assert.equal(p.y, 5); assert.equal(p.z, t + 4);
}
console.log('PASS identical follow offsets remain locked at 1x, 3x, 8x and arbitrary seek times');
const scene = { project: 'synthetic', stops: [{ id: 'upper', x: 1, y: 2, floor: '2F' }] };
const projects = { synthetic: { data: { center: [10, 20], plates: { '2F': { lift: 1 } } } } };
const k = cameraKey(scene, projects, { at: 2, lookAt: 'trolley', distance: 30, heading: 90, tilt: 60, lens: 48 });
assert.equal(k.dist, 100); assert(Math.abs(k.az + Math.PI / 2) < .001); assert(Math.abs(k.pol - Math.PI / 6) < .001);
for (const o of [{ tilt: -1 }, { distance: 0 }, { lens: NaN }, { lookAt: [1] }, { lookAt: [1, Infinity] }, { lookAt: 'stop:upper' }]) assert.throws(() => cameraKey(scene, projects, o));
console.log('PASS CLI camera units and invalid/fixed upper-floor targets');
