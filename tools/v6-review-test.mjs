// CPU-only regressions; no browser, images, network or GPU required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { makeGrid, route, snap } from './v6/router.mjs';
import { applyEdits } from './v6/edits.mjs';
import { K, M, DIMS, TROLLEY } from './v5/device-dims.mjs';
import * as V5 from './v5/inj1-data.mjs';

const html = readFileSync('dist/Material_Flow_Player_v4.html', 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
const context = vm.createContext({ console });
vm.runInContext(scripts[0][1], context);
const T = context.THREE;
function sight(rp, dev = { solids: [], list: [] }, extra = {}) {
  const ctx = vm.createContext({ T, RP: rp, DEV: dev, PT_M: .3, CX: 0, CY: 0,
    D: { plates: { '1F': { lift: 0 }, '2F': { lift: 1 } } },
    plates: { '1F': { visible: true, position: new T.Vector3() }, '2F': { visible: true, position: new T.Vector3(0, 40, 0) } },
    S: { t: 0, stack: 0, speed: 1 }, E: { lowPlate: '1F' }, frameDt: 1 / 60,
    camera: { position: new T.Vector3() }, plateOf: () => '1F',
    worldFromLot: (lp, stack, out) => out.set(lp.x, lp.height || 0, lp.y), ...extra });
  vm.runInContext(readFileSync('tools/v5/sight.js', 'utf8') + ';globalThis.result=SIGHT;', ctx);
  return ctx.result;
}
const tests = [];
function test(name, fn) { try { fn(); console.log('PASS', name); } catch (e) { tests.push(name); console.error('FAIL', name, e.message); } }
const empty = () => ({ walls: [], racks: [], columns: [], machines: [], lifts: [], pallets: [] });
test('upper-floor device retains its plate and bottom height', () => {
  const s = sight(empty(), { list: [{ plate: '1F' }], solids: [{ plate: '2F', x: 5, z: 0, y: 4, sx: 2, sy: 2, sz: 2, yaw: 0 }] });
  assert.equal(s.clearLine(new T.Vector3(0, 44, 0), new T.Vector3(10, 44, 0), '2F', 0), false);
  assert.equal(s.clearLine(new T.Vector3(0, 40.5, 0), new T.Vector3(10, 40.5, 0), '2F', 0), true);
});
test('visible other floors also occlude', () => {
  const r = empty(); r.walls.push({ plate: '2F', a: [5, -3], b: [5, 3] });
  assert.equal(sight(r).clearLine(new T.Vector3(0, 44, 0), new T.Vector3(10, 44, 0), '1F', 0), false);
});
test('a small near-target occluder is not ignored wholesale', () => {
  const r = empty(); r.walls.push({ plate: '1F', a: [8, -2], b: [8, 2] });
  assert.equal(sight(r).clearLine(new T.Vector3(0, 2, 0), new T.Vector3(10, 2, 0), '1F', 0), false);
});
test('slab triangles block sight while their openings remain open', () => {
  const art = new T.Mesh(new T.PlaneGeometry(4, 4).rotateX(-Math.PI / 2)); art.position.set(0, 10, 0);
  const slab = art.clone(); slab.position.y = 9;
  const s = sight(empty(), undefined, { floors: [{ key: '1F', art, slab }] });
  assert.equal(s.clearLine(new T.Vector3(0, 20, 0), new T.Vector3(0, 0, 0), '1F', 0), false);
  assert.equal(s.clearLine(new T.Vector3(4, 20, 0), new T.Vector3(4, 0, 0), '1F', 0), true);
});
test('cropped extension pictures do not overlap the original plan area', () => {
  const P = JSON.parse(readFileSync('private/v5/P-v4.json', 'utf8'));
  const zone = P.inj2.data.plates['2F'].zone.slice(), count = P.inj2.data.plates['2F'].pics.length;
  applyEdits(P);
  for (const p of P.inj2.data.plates['2F'].pics.slice(count)) {
    const w = Math.min(p.x + p.w, zone[2]) - Math.max(p.x, zone[0]);
    const h = Math.min(p.y + p.h, zone[3]) - Math.max(p.y, zone[1]);
    assert.ok(w <= 1e-8 || h <= 1e-8);
    assert.ok(p.uv.every(v => v >= 0 && v <= 1));
  }
  const once = JSON.stringify(P); assert.equal(JSON.stringify(applyEdits(P)), once);
});
function devices() {
  const groups = { '1F': new T.Group(), '2F': new T.Group() };
  const item = { s: { node: 1 }, t0: 0, tm: 1, t1: 2, sched: { duration: 1, phases: [1] } };
  const D = { plates: groups, nodes: { 1: { plate: '1F' } }, flows: [{ items: [item] }], devices: [
    { type: 'rfid-auto', plate: '1F', axis: 'x', x: 0, y: 0, label: 'gate' },
    { type: 'rfid-auto', plate: '2F', axis: 'x', x: 0, y: 0, label: 'gate 2' },
    { type: 'pc', plate: '1F', x: 20, y: 20, label: 'pc', kind: 'result', node: 1 },
  ] };
  const ctx = vm.createContext({ T, D, plates: groups, DEV: undefined, PT_M: .3, CX: 0, CY: 0,
    window: { MF_DEVICE_DIMS: { K, M, DIMS, TROLLEY } },
    S: { flow: 0, t: 0, R: 1, speed: 1, stack: 0 }, innerWidth: 1920, innerHeight: 1080,
    document: { createElement: () => ({ style: { setProperty() {} } }) }, labels: { append() {} },
    sampleSchedule: (sched, tau, out) => { out.x = -2 + 4 * tau; out.y = 0; },
    W: (x, y, stack, h, out) => out.set(x, h, y), proj: (v, out) => { out[0] = 100; out[1] = 100; out[2] = 0; },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), ease: x => x * x * (3 - 2 * x), lerp: (a, b, t) => a + (b - a) * t });
  vm.runInContext(readFileSync('tools/v5/devices.js', 'utf8'), ctx);
  return { dev: ctx.DEV, item, ctx };
}
test('gate reads are unique at an exact sample crossing and remain on their floor', () => {
  const { dev } = devices();
  assert.equal(dev.state.reads[0].length, 1);
  assert.equal(dev.state.reads[0][0].gate, 0);
});
test('gate effects follow each owning floor', () => {
  const { dev } = devices();
  assert.equal(dev.effects.filter(fx => fx.parent === dev.groups['1F']).length, 1);
  assert.equal(dev.effects.filter(fx => fx.parent === dev.groups['2F']).length, 1);
  assert.ok(dev.solids.every(p => p.plate));
});
test('unchanged device colours do not upload every frame', () => {
  const { dev, item } = devices(), lp = { x: 30, y: 30, lift: null };
  dev.frame(item, lp, 1 / 60, 0);
  const meshes = Object.values(dev.groups).flatMap(g => g.children.filter(m => m.isInstancedMesh));
  const versions = meshes.map(m => m.instanceColor.version);
  dev.frame(item, lp, 1 / 60, 0);
  assert.deepEqual(meshes.map(m => m.instanceColor.version), versions);
});
test('invalid router endpoints fail without phantom paths', () => {
  const g = makeGrid([0, 0, 30, 30], [[14, 0, 16, 30]]);
  assert.equal(snap(g, 5, 5, 4, [-1, -1]), null);
  assert.equal(route(g, [14.5, 10.5], [20.5, 10.5]), null);
});
test('all configured flow and stop orders match the owner PATHS declarations', () => {
  const make = readFileSync('tools/v6/make.mjs', 'utf8');
  const ctx = vm.createContext({ V5 });
  vm.runInContext(make.slice(make.indexOf('const W ='), make.indexOf('// stop targets:')) + ';globalThis.spec={PATHS,BASE};', ctx);
  const G = JSON.parse(readFileSync('private/v6/projects.json', 'utf8'));
  for (const [tab, specs] of Object.entries(ctx.spec.PATHS)) {
    assert.deepEqual(G[tab].flows.map(f => f.id), Array.from(specs, s => s.id));
    specs.forEach((spec, i) => {
      const titles = spec.v5 ? V5.flow.steps.map(s => s.title) :
        Array.from(spec.stops === 'base' ? [...ctx.spec.BASE[tab], ...spec.tail] : spec.stops, s => s[1]);
      assert.deepEqual(G[tab].flows[i].steps.map(s => s.title), titles);
    });
  }
});
test('the built player parses and keeps device DOM projection after camera movement', () => {
  const built = readFileSync('dist/Material_Flow_Player_v6.html', 'utf8');
  const all = [...built.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [, src] of all) new vm.Script(src);
  const player = all[6][1];
  const frame = player.slice(player.indexOf('  function frame(dt, time)'));
  assert.ok(frame.indexOf('DEV.frame(cur, lp, dt, time)') > frame.indexOf('moveCam(dt)'));
});
test('governor never resizes during playback or hunts upward afterward', () => {
  const built = readFileSync('dist/Material_Flow_Player_v6.html', 'utf8');
  const begin = built.indexOf('    // Sample playback, but apply a pending downgrade');
  assert.ok(begin > 0);
  const block = built.slice(begin, built.indexOf('    requestAnimationFrame(tick);', begin));
  const ctx = vm.createContext({ S: { playing: true, t: 30 }, document: { hidden: false }, GOV_ON: true,
    gov: { n: 0, miss: 0, t: 0, pending: null }, governorHold: 0, raw: 1 / 30, resolutionScale: 1,
    metrics: { governor: [] }, resize: () => { throw new Error('resize during playback'); } });
  for (let i = 0; i < 300; i++) vm.runInContext(block, ctx);
  assert.equal(ctx.resolutionScale, 1); assert.equal(ctx.gov.pending, .95);
  let resizes = 0; ctx.resize = () => resizes++; ctx.S.playing = false;
  for (let i = 0; i < 300; i++) vm.runInContext(block, ctx);
  assert.equal(resizes, 1); assert.equal(ctx.resolutionScale, .95);
});
test('manual RFID on a route holds the trolley stationary during the full scan', () => {
  const source = [...readFileSync('dist/Material_Flow_Player_v6.html', 'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][6][1];
  const ctx = vm.createContext({ D: { devices: [
    { type: 'rfid-manual', plate: '1F', lane: [0, 50], sym: 1, routeBound: true },
    { type: 'rfid-manual', plate: '1F', lane: [0, 75], sym: 2, routeBound: false },
  ] }, PT_M: .3, V_MAX: 4, RAMP_T: .25, TURN_T: .3, TURN_SNAP: 1e-6, MIN_SEG: 1e-4,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t,
    ease: t => t * t * (3 - 2 * t), wrapPi: a => Math.atan2(Math.sin(a), Math.cos(a)) });
  vm.runInContext(source.slice(source.indexOf('  const ZERO_POINT'), source.indexOf('  function buildFlow(')) +
    readFileSync('tools/v6/manual-stops.js', 'utf8') + `
    const base = buildSchedule([[0,0],[0,100]]), result = scheduleManualStops(base, '1F');
    const holds = result.phases.filter(p => p.k === 'scan');
    if (holds.length !== 1) throw new Error('expected one route-bound scan');
    const hold = holds[0], a = sampleSchedule(result, hold.t0 + .01, {}), b = sampleSchedule(result, hold.t1 - .01, {});
    if (a.x !== 0 || a.y !== 50 || b.y !== 50 || a.v !== 0 || b.v !== 0) throw new Error('scanner reads a moving trolley');
    if (Math.abs(hold.t1 - hold.t0 - 1.8) > 1e-8) throw new Error('incomplete scan window');
    `, ctx);
});
if (tests.length) process.exitCode = 1;
