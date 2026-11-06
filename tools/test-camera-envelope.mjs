/*
 * test-camera-envelope.mjs
 * ---------------------------------------------------------------------------
 * Imports camera-envelope.js for its side effect (sets globalThis.CameraEnvelope).
 * Proves the envelope geometry INDEPENDENTLY of the implementation:
 *   - builds real world-space near-plane corners from an orthonormal camera basis
 *   - checks each corner's distance from the eye via Pythagoras (not via clearance())
 *   - checks the minimum corner Y stays above the solids for many orientations
 *   - checks no mutation, validation, and the smoothed/clamped low-eye case.
 *
 * Run: node test-camera-envelope.mjs
 */
import '../src/camera-envelope.js'; // side-effect import (CommonJS executed under ESM)

const { makeEnvelope } = globalThis.CameraEnvelope;

// ------------------------------------------------------------------ harness
let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else {
    failures.push(msg);
    console.error('FAIL: ' + msg);
  }
}
function approx(a, b, msg, eps = 1e-9) {
  ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)),
     `${msg} (a=${a}, b=${b})`);
}
function throwsRange(fn, msg) {
  try {
    fn();
    ok(false, `${msg} (expected RangeError, nothing thrown)`);
  } catch (e) {
    ok(e instanceof RangeError, `${msg} (threw ${e && e.name}: ${e && e.message})`);
  }
}
const clone = (o) => JSON.parse(JSON.stringify(o));

// ------------------------------------------- independent geometry primitives
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = len(a); return [a[0]/n, a[1]/n, a[2]/n]; };

// Orthonormal camera basis from yaw+pitch. pitch>0 tilts the view downward.
// (Avoids pitch = ±90° so that cross(forward, worldUp) never degenerates.)
function basis(yaw, pitch) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const f = unit([-sy * cp, -sp, -cy * cp]);
  let r = cross(f, [0, 1, 0]);
  if (len(r) < 1e-8) r = cross(f, [1, 0, 0]);
  r = unit(r);
  const u = cross(r, f);
  return { f, r, u };
}

// World-space corners of the near-plane rectangle for a given orientation.
function nearPlaneCorners(eye, near, fovDegrees, aspect, yaw, pitch) {
  const { f, r, u } = basis(yaw, pitch);
  const halfH = near * Math.tan((fovDegrees * Math.PI) / 180 / 2);
  const halfW = halfH * aspect;
  const center = [eye[0] + near * f[0], eye[1] + near * f[1], eye[2] + near * f[2]];
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      corners.push([
        center[0] + sx * halfW * r[0] + sy * halfH * u[0],
        center[1] + sx * halfW * r[1] + sy * halfH * u[1],
        center[2] + sx * halfW * r[2] + sy * halfH * u[2],
      ]);
    }
  }
  return corners;
}

// ============================================================================
// 1. top precompute: empty, negative coords, multiple boxes, tall boxes
// ============================================================================
{
  ok(makeEnvelope([]).top === 0, 'empty boxes => top = 0');

  const boxes = [
    { minX: -10, minY: -5, minZ: -10, maxX: 10, maxY: 3.5, maxZ: 10 },
    { minX: -1,  minY: -20, minZ: -1, maxX: 1, maxY: 42.25, maxZ: 1 }, // tall solid, negative floor
    { minX: 20,  minY: -30, minZ: 20, maxX: 30, maxY: -2, maxZ: 30 },   // fully below ground
  ];
  const env = makeEnvelope(boxes);
  ok(env.top === 42.25, `top = max maxY (got ${env.top})`);
  ok(makeEnvelope([{ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }]).top === 0, 'top floors at 0');
}

// ============================================================================
// 2. no mutation of input boxes or the array
// ============================================================================
{
  const boxes = [
    { minX: -3, minY: -1, minZ: -2, maxX: 4, maxY: 7, maxZ: 5 },
    { minX: 1,  minY: 0,  minZ: 1,  maxX: 2, maxY: 9, maxZ: 2 },
  ];
  const before = clone(boxes);
  const env = makeEnvelope(boxes);
  env.protect({ x: 1, y: -100, z: 2 }, 0.5, 60, 1.7, 0.1); // also exercise protect
  env.clearance(0.5, 60, 1.7, 0.1);
  ok(JSON.stringify(boxes) === JSON.stringify(before), 'makeEnvelope/protect/clearance do not mutate boxes');
  ok(Array.isArray(boxes) && boxes.length === 2, 'boxes array length unchanged');
}

// ============================================================================
// 3. clearance formula: matches an independent recomputation, various aspects
// ============================================================================
{
  const env = makeEnvelope([{ minX: -1, minY: 0, minZ: -1, maxX: 1, maxY: 5, maxZ: 1 }]);
  const cases = [
    { near: 0.1, fov: 60, aspect: 1.0,  pad: 0 },
    { near: 1,   fov: 90, aspect: 16/9, pad: 0.5 },
    { near: 2.5, fov: 30, aspect: 0.5,  pad: 1.25 },
    { near: 0.25,fov: 120,aspect: 21/9, pad: 0 },
    { near: 10,  fov: 75, aspect: 4/3,  pad: 3 },
  ];
  for (const c of cases) {
    const t = Math.tan(((c.fov * Math.PI) / 180) / 2);
    const expected = c.near * Math.sqrt(1 + t * t * (1 + c.aspect * c.aspect)) + c.pad;
    approx(env.clearance(c.near, c.fov, c.aspect, c.pad), expected,
           `clearance formula near=${c.near} fov=${c.fov} aspect=${c.aspect} pad=${c.pad}`);
  }
}

// ============================================================================
// 4. GEOMETRY PROOF - Pythagorean corner distance equals the clearance radius
//    (independent of clearance(): built from world-space corner coordinates)
// ============================================================================
{
  const near = 0.75, fov = 65, aspect = 1.6, pad = 0.3;
  const env = makeEnvelope([]); // top = 0
  const rExpected = near * Math.sqrt(1 + Math.tan((fov * Math.PI) / 180 / 2) ** 2 * (1 + aspect ** 2));
  const radius = env.clearance(near, fov, aspect, 0);
  approx(radius, rExpected, 'clearance radius equals analytic tube radius');

  const eye = [3, 17, -4];
  let maxSeen = -Infinity, minSeen = Infinity;
  for (let i = 0; i < 200; i++) {
    const yaw = (i / 200) * Math.PI * 2;
    const pitch = (-80 + (i % 161)) * (Math.PI / 180); // sweep -80..+80 deg
    for (const c of nearPlaneCorners(eye, near, fov, aspect, yaw, pitch)) {
      const d = len(sub(c, eye));
      minSeen = Math.min(minSeen, d);
      maxSeen = Math.max(maxSeen, d);
      approx(d, radius, `corner distance = radius (yaw=${yaw.toFixed(3)} pitch=${pitch.toFixed(3)})`, 1e-6);
    }
  }
  // Every near-plane corner sits exactly on the sphere regardless of orientation.
  approx(minSeen, radius, 'min corner distance across orientations = radius', 1e-6);
  approx(maxSeen, radius, 'max corner distance across orientations = radius', 1e-6);
}

// ============================================================================
// 5. INVARIANT - with protect applied, ALL near-plane corners stay above solids
//    across many headings/tilts and eye X/Z positions.
// ============================================================================
{
  const boxes = [
    { minX: -50, minY: -8, minZ: -50, maxX: 50, maxY: 12,  maxZ: 50 },
    { minX: 0,   minY: 0,  minZ: 0,   maxX: 5,  maxY: 31.75, maxZ: 5 },
    { minX: -20, minY: -30,minZ: -20, maxX: -10,maxY: -5,  maxZ: -10 },
  ];
  const env = makeEnvelope(boxes);
  const top = env.top;
  ok(top === 31.75, `top=31.75 (got ${top})`);

  const near = 0.5, fov = 70, aspect = 1.7777, pad = 0.25;
  const radius = env.clearance(near, fov, aspect, 0);
  const clearance = env.clearance(near, fov, aspect, pad);
  ok(Math.abs(clearance - (radius + pad)) < 1e-12, 'clearance = radius + padding');

  let allAbove = true;
  for (let i = 0; i < 400; i++) {
    const eye = { x: -60 + i * 0.31, y: -1000 + (i % 40) * 3, z: 55 - i * 0.27 }; // includes far-below eyes
    const required = env.protect(eye, near, fov, aspect, pad);
    approx(required, top + clearance, 'protect returns top+clearance', 1e-9);
    if (eye.y < top + clearance) allAbove = false; // eye.y clamped up
    for (let k = 0; k < 6; k++) {
      const yaw = (i + k) * 0.7;
      const pitch = (-85 + ((i * 7 + k * 13) % 171)) * (Math.PI / 180);
      for (const c of nearPlaneCorners([eye.x, eye.y, eye.z], near, fov, aspect, yaw, pitch)) {
        if (c[1] < top) allAbove = false;
      }
    }
  }
  ok(allAbove, 'every near-plane corner stays >= top after protect (all orientations/eye X/Z)');

  // Theoretical worst case: lowest reachable corner Y = eye.y - radius >= top.
  const lowestEye = -1000;
  const clampedEyeY = lowestEye < top + clearance ? top + clearance : lowestEye;
  ok(clampedEyeY - radius >= top, 'worst-case corner Y (eye.y - radius) >= top');

  // Padding is a real margin: worst tilt can put a corner at top+padding.
  ok((top + clearance) - radius === top + pad, 'worst corner sits at top+padding (margin preserved)');
}

// ============================================================================
// 6. protect mutates ONLY eye.y, returns required min, never lowers a high eye
// ============================================================================
{
  const env = makeEnvelope([{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 10, maxZ: 1 }]);
  const near = 1, fov = 60, aspect = 1, pad = 0.5;
  const required = env.top + env.clearance(near, fov, aspect, pad);

  const low = { x: 7, y: -3, z: 9 };
  const before = clone(low);
  const ret = env.protect(low, near, fov, aspect, pad);
  ok(low.y === required, 'low eye.y raised to required');
  ok(low.x === before.x && low.z === before.z, 'eye.x and eye.z unchanged');
  ok(ret === required, 'protect returns required minimum Y');

  const high = { x: 1, y: required + 100, z: 2 };
  const rHigh = env.protect(high, near, fov, aspect, pad);
  ok(high.y === required + 100, 'high eye.y is never lowered');
  ok(rHigh === required, 'returns required even when eye already above');
}

// ============================================================================
// 7. smoothed low eye clamped AFTER interpolation (smoothing/seek/8x speed)
// ============================================================================
{
  const boxes = [{ minX: -5, minY: -5, minZ: -5, maxX: 5, maxY: 20, maxZ: 5 }];
  const env = makeEnvelope(boxes);
  const near = 0.4, fov = 55, aspect = 1.25, pad = 0.15;
  const clearance = env.clearance(near, fov, aspect, pad);
  const required = env.top + clearance;

  // A "seek" that overshoots and a fast (8x) descent: the raw/interpolated eye.y
  // dips far below `required`. protect() is applied AFTER interpolation.
  const from = { x: -30, y: required + 40, z: 0 };
  const to = { x: 30, y: -120, z: 0 };
  let minClampedY = Infinity, minCornerY = Infinity;
  for (let f = 0; f <= 60; f++) {
    const t = f / 60;
    const eye = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: 0 }; // raw interp
    env.protect(eye, near, fov, aspect, pad); // clamp after interpolation
    minClampedY = Math.min(minClampedY, eye.y);
    for (const c of nearPlaneCorners([eye.x, eye.y, eye.z], near, fov, aspect, 8 * t, -0.9)) {
      minCornerY = Math.min(minCornerY, c[1]);
    }
  }
  ok(minClampedY >= required - 1e-9, `clamped eye.y stays >= required through smoothing (min ${minClampedY})`);
  ok(minCornerY >= env.top - 1e-9, `near plane never dips below solids through smoothing (min corner Y ${minCornerY})`);

  // 8x-speed single big step: an overshoot that would dive under must still clamp.
  const fast = { x: 0, y: from.y - 8 * 1000, z: 0 };
  env.protect(fast, near, fov, aspect, pad);
  ok(fast.y === required, 'single 8x-speed step clamped to required');
}

// ============================================================================
// 8. validation: near / fov / aspect / padding and malformed boxes
// ============================================================================
{
  const env = makeEnvelope([{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 }]);
  const good = [1, 60, 1.5, 0];

  throwsRange(() => env.clearance(0, 60, 1.5, 0), 'near = 0');
  throwsRange(() => env.clearance(-1, 60, 1.5, 0), 'near negative');
  throwsRange(() => env.clearance(NaN, 60, 1.5, 0), 'near NaN');
  throwsRange(() => env.clearance(Infinity, 60, 1.5, 0), 'near Infinity');

  throwsRange(() => env.clearance(1, 0, 1.5, 0), 'fov = 0');
  throwsRange(() => env.clearance(1, 180, 1.5, 0), 'fov = 180');
  throwsRange(() => env.clearance(1, -30, 1.5, 0), 'fov negative');
  throwsRange(() => env.clearance(1, NaN, 1.5, 0), 'fov NaN');
  throwsRange(() => env.clearance(1, Infinity, 1.5, 0), 'fov Infinity');

  throwsRange(() => env.clearance(1, 60, 0, 0), 'aspect = 0');
  throwsRange(() => env.clearance(1, 60, -2, 0), 'aspect negative');
  throwsRange(() => env.clearance(1, 60, NaN, 0), 'aspect NaN');
  throwsRange(() => env.clearance(1, 60, Infinity, 0), 'aspect Infinity');

  throwsRange(() => env.clearance(1, 60, 1.5, -0.1), 'padding negative');
  throwsRange(() => env.clearance(1, 60, 1.5, NaN), 'padding NaN');
  throwsRange(() => env.clearance(1, 60, 1.5, Infinity), 'padding Infinity');

  // protect validates too (and eye shape / eye.y).
  throwsRange(() => env.protect({ x: 0, y: 0, z: 0 }, -1, 60, 1.5, 0), 'protect: bad near');
  throwsRange(() => env.protect({ x: 0, y: 0, z: 0 }, 1, 200, 1.5, 0), 'protect: bad fov');
  throwsRange(() => env.protect(null, 1, 60, 1.5, 0), 'protect: null eye');
  throwsRange(() => env.protect({ x: 0, y: NaN, z: 0 }, 1, 60, 1.5, 0), 'protect: eye.y NaN');

  // malformed boxes
  throwsRange(() => makeEnvelope('nope'), 'boxes not an array');
  throwsRange(() => makeEnvelope([{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1 }]), 'box missing maxZ');
  throwsRange(() => makeEnvelope([{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: NaN, maxZ: 1 }]), 'box maxY NaN');
  throwsRange(() => makeEnvelope([{ minX: 0, minY: 0, minZ: 0, maxX: Infinity, maxY: 1, maxZ: 1 }]), 'box maxX Infinity');
  throwsRange(() => makeEnvelope([{ minX: 5, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 }]), 'box inverted X');
  throwsRange(() => makeEnvelope([null]), 'box null');

  // sanity: a fully valid call does NOT throw
  try {
    env.clearance(...good);
    env.protect({ x: 0, y: 0, z: 0 }, ...good);
    ok(true, 'valid inputs do not throw');
  } catch (e) {
    ok(false, `valid inputs threw ${e && e.name}: ${e && e.message}`);
  }
}

// ------------------------------------------------------------------ report
console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log('All camera-envelope checks passed.');
