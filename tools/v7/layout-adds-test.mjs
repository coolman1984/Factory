// V7.7.2: synthetic format/geometry checks and real reload/undo/save transactions.
import assert from 'node:assert/strict';
import { loadSceneCore } from './scene-node.mjs';
import { fieldPaths } from './scene-schema.mjs';
import { straightenPoints, diff } from './mf-ops.mjs';
import { openPage } from './cdp.mjs';
const SC = loadSceneCore(), copy = x => JSON.parse(JSON.stringify(x));
const layout = { project: 'test', plates: { F: { zone: [0, 0, 100, 100] } }, elevators: [], replica: { walls: [], columns: [], racks: [], machines: [], pallets: [] } };
const scene = { format: 'mf-scene', version: 1, project: 'test', stops: [{ id: 'a', floor: 'F', x: 2, y: 2 }, { id: 'b', floor: 'F', x: 20, y: 2 }], paths: [{ id: 'p', steps: [{ id: 's1', stop: 'a' }, { id: 's2', stop: 'b', route: { type: 'points', points: [[2, 2], [20, 2]] } }] }], layoutAdds: [{ id: 'block', kind: 'machine', floor: 'F', x: 5, y: 10, w: 2, d: 4 }] };
const run = s => SC.validate(s, copy(layout));
assert.equal(run(scene).errors.length, 0);
for (const kind of ['unknown', 'constructor', '__proto__', 'toString']) {
  const s = copy(scene); s.layoutAdds[0].kind = kind;
  const r = run(s); assert.equal(r.errors.length, 1); assert.match(r.errors[0].where, /\.kind$/);
}
for (const mutate of [a => a.turn = '90', a => a.turn = 45, a => a.rows = 1.5, a => a.pallets = 'false', a => { a.kind = 'storage'; a.rows = 60; a.cols = 60; }, a => { a.kind = 'wall'; a.a = [1, 1]; a.b = [1, 1]; }, a => { a.kind = 'wall'; a.a = [1]; a.b = [1, 2]; }]) {
  const s = copy(scene); mutate(s.layoutAdds[0]); assert.ok(run(s).errors.length); assert.ok(SC.validate(s, copy(layout), { structureOnly: true }).errors.length);
}
const s = copy(scene); s.layoutAdds[0].y = 1; assert.ok(run(s).errors.some(e => /trolley/.test(e.msg)));
const wall = copy(scene); wall.layoutAdds.push({ id: 'wall', kind: 'wall', floor: 'F', a: [10, 10], b: [20, 10] }); wall.layoutEdits = [{ target: 'wall:101000', door: [13, 16] }];
assert.equal(run(wall).errors.length, 0);
const l = copy(layout); SC.toInternal(wall, l); assert.deepEqual(Array.from(l.replica.walls, w => w._oid), ['101000a', '101000b']);
const storage = copy(scene); storage.layoutAdds = [{ id: 'grid', kind: 'storage', floor: 'F', x: 10, y: 10, w: 6, d: 4, rows: 2, cols: 3 }];
for (const turn of [0, 90, 180, 270]) {
  storage.layoutAdds[0].turn = turn; const l = copy(layout); SC.toInternal(storage, l);
  assert.deepEqual(Array.from(l.replica.pallets, p => p._oid), [100001, 100002, 100003, 100004, 100005, 100006]);
  assert.equal(l.replica.marks[0].rows, turn % 180 ? 3 : 2);
  assert.ok(l.replica.pallets.every(p => p.x >= l.replica.marks[0].x && p.y >= l.replica.marks[0].y));
}
const deleted = copy(scene); deleted.layoutAdds.push({ ...deleted.layoutAdds[0], id: 'second', x: 10 }); deleted.layoutEdits = [{ target: 'machine:100000', delete: true }];
const dl = copy(layout); SC.toInternal(deleted, dl); assert.deepEqual(Array.from(dl.replica.machines, x => x._oid), [101000]);
assert.ok(diff(scene, deleted).some(x => x.includes('layoutAdds')));
assert.ok(fieldPaths(wall).has('layoutAdds[].a')); assert.ok(!fieldPaths(wall).has('layoutAdds[].a[]'));
for (const points of [[[1, 1], [1, 1], [1, 5], [8, 5]], [[1, 1], [3, 2], [4, 8], [9, 9]], [[1, 1], [1, 3], [2, 3], [2, 9]]]) {
  const q = straightenPoints(points); assert.deepEqual(q[0], points[0]); assert.deepEqual(q.at(-1), points.at(-1));
  assert.ok(q.slice(1).every((p, i) => p[0] === q[i][0] || p[1] === q[i][1]));
}
console.log('PASS layoutAdds core: kinds, strict fields, preload, collision, door IDs, storage rotation, deletion, schema, diff, straightening');
if (process.argv.includes('--core-only')) process.exit(0);
const pg = await openPage(process.argv[2], 'inj1');
async function afterReload() {
  for (let i = 0; i < 150; i++) {
    await pg.wait(400);
    try { if (await pg.ev("typeof MF==='object' && !!window.MFX && !window.__layoutReload")) { await pg.ev('Promise.resolve(MF.ready).then(()=>MF.prepared).then(()=>1)'); return; } }
    catch { /* navigation destroys the old execution context */ }
  }
  throw new Error('layout reload did not finish');
}
try {
  const checks = await pg.ev(`(() => {
    MF.pause(); MFX.setEditor(true); MFX.setTab('objects'); const out = [], check = (ok, s) => { if (!ok) throw new Error(s); out.push(s); };
    const item = MFX.doc.adds.find(a => !['storage','wall'].includes(a.kind)); if (!item) throw new Error('test needs an added block');
    const i = MFX.doc.adds.indexOf(item), tag = MFScene.ADD_KINDS[item.kind].into + ':' + (100000 + 1000 * i);
    MFX.buildRepIndex(); MFX.select({kind:'replica', tag}); const before = MFX.toScene();
    MFX.rotateSelBy(90); MFX.nudge(2, 0); const after = MFX.toScene(), a = after.layoutAdds[i];
    check(a.id === item.id && a.turn === 90, 'added item turn and ID folded');
    const layout = {plates:MF.D.plates, elevators:[], replica:JSON.parse(JSON.stringify(MF7.baseReplica))}; MFScene.toInternal(after, layout);
    const live = MFX.repIndex().get(tag).obj, saved = layout.replica[MFScene.ADD_KINDS[a.kind].into].find(o=>o._oid === 100000+1000*i);
    check(['x','y','w','h'].every(k=>Math.abs(live[k]-saved[k])<.01), 'folded save matches live geometry');
    MFX.undo(); MFX.undo(); check(JSON.stringify(MFX.toScene().layoutAdds) === JSON.stringify(before.layoutAdds), 'undo restores folded addition');
    MFX.redo(); MFX.redo(); check(JSON.stringify(MFX.toScene().layoutAdds) === JSON.stringify(after.layoutAdds), 'redo restores folded addition');
    MFX.select({kind:'replica',tag}); MFX.deleteSel(); check(MFX.toScene().layoutAdds.length === after.layoutAdds.length && MFX.toScene().layoutEdits.some(e=>e.delete && e.target.endsWith(':'+ (100000+1000*i))), 'delete keeps addition slot'); MFX.undo();
    return out;
  })()`);
  checks.forEach(x => console.log('PASS ' + x));
  // A real placement reload must preserve undo and redo, and all three documents must agree with rendered solids.
  const count = await pg.ev('MFX.doc.adds.length');
  await pg.ev(`(() => { window.__layoutReload=1; MFX.startPlace('lay-table'); const n=Object.values(MFX.doc.nodes)[0]; MFX.placeAt({x:n.x,y:n.y,plate:n.plate},false); return 1; })()`);
  await afterReload();
  assert.equal(await pg.ev('MFX.doc.adds.length'), count + 1);
  assert.equal(await pg.ev('MFX.canUndo()'), true);
  await pg.ev('window.__layoutReload=1; MFX.undo(); 1'); await afterReload();
  assert.equal(await pg.ev('MFX.doc.adds.length'), count);
  assert.equal(await pg.ev('MFX.canRedo()'), true);
  await pg.ev('window.__layoutReload=1; MFX.redo(); 1'); await afterReload();
  assert.equal(await pg.ev('MFX.doc.adds.length'), count + 1);
  assert.equal(await pg.ev('MF.RP.machines.some(o => o._oid === 100000 + 1000*(MFX.doc.adds.length-1))'), true);
  console.log('PASS layout placement reload / undo / redo rebuild the actual replica');
  const imported = await pg.ev(`(() => { window.__layoutReload=1; const s=JSON.parse(JSON.stringify(MF7.base)), n=s.stops[0]; s.layoutAdds.push({id:'import-mark',kind:'storage',floor:n.floor,x:n.x,y:n.y,w:.2,d:.2,pallets:false}); return MFS.load(s,'layout import'); })()`);
  assert.equal(imported, true); await afterReload();
  assert.equal(await pg.ev("MF.RP.marks.some(o=>o._add==='import-mark')"), true);
  console.log('PASS import with only layoutAdds changed rebuilds markings');
  await pg.ev(`(() => { window.__quotaMarker=1; window.__setItem=Storage.prototype.setItem; Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError')}; MFX.startPlace('lay-table'); const n=Object.values(MFX.doc.nodes)[0]; MFX.placeAt({x:n.x,y:n.y,plate:n.plate},false); Storage.prototype.setItem=window.__setItem; return 1; })()`);
  await pg.wait(1000); assert.equal(await pg.ev('window.__quotaMarker'), 1);
  assert.equal(await pg.ev('MFX.toScene().layoutAdds.length > MF7.base.layoutAdds.length'), true);
  console.log('PASS failed layout save remains exportable and does not reload');
  assert.deepEqual(pg.errors, []);
} finally { await pg.close(); }
