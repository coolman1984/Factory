/*
 * camera-envelope.js
 * ---------------------------------------------------------------------------
 * Dependency-free. Works as a browser <script> (sets globalThis.CameraEnvelope)
 * and as a Node CommonJS module imported for side effect from an ESM (.mjs) test.
 *
 * Purpose: a CONSERVATIVE overhead-camera envelope.
 *
 * Given a set of synthetic axis-aligned boxes (the "solids"), we precompute a
 * single scalar `top` = the highest Y any solid reaches. We then guarantee that,
 * no matter how the camera is moved (smoothing, seek, 8x speed, changing
 * heading yaw/pitch, any eye X/Z), the eye and the near plane never go below
 * `top`.
 *
 * How: the perspective near plane is the rectangle at distance `near` in front
 * of the eye; its half-height is near*tan(fov/2) and half-width is that times
 * `aspect`. Every near-plane corner therefore lies on a sphere of radius
 *
 *     r = near * sqrt(1 + tan(fov/2)^2 * (1 + aspect^2))
 *
 * centred on the eye (Pythagoras over the orthonormal camera basis). That
 * sphere is a bound for the near plane in EVERY orientation. If the eye sits at
 * y >= top + r + padding then the whole sphere (and thus the near plane) sits
 * strictly above `top`, so it cannot intersect any solid. The returned
 * `clearance` = r + padding, and `protect` clamps eye.y up to `top + clearance`.
 *
 * Validated inputs; malformed input fails closed (throws RangeError).
 */
(function (global) {
  'use strict';

  var DEG2RAD = Math.PI / 180;

  function fail(msg) {
    throw new RangeError(msg);
  }

  // Finite-number guard: also rejects non-numbers, missing fields, NaN, +/-Infinity.
  function finite(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(name + ' must be a finite number');
    }
    return value;
  }

  // Shared validation + formula. Used by both clearance() and protect().
  function computeClearance(near, fovDegrees, aspect, padding) {
    var n = finite(near, 'near');
    var f = finite(fovDegrees, 'fovDegrees');
    var a = finite(aspect, 'aspect');
    var p = finite(padding, 'padding');

    if (!(n > 0)) fail('near must be > 0');
    if (!(f > 0 && f < 180)) fail('fovDegrees must be in the open interval (0, 180)');
    if (!(a > 0)) fail('aspect must be > 0');
    if (!(p >= 0)) fail('padding must be >= 0');

    var half = Math.tan((f * DEG2RAD) / 2);
    return n * Math.sqrt(1 + half * half * (1 + a * a)) + p;
  }

  // Strict box check: every bound must be a finite number and the box must not
  // be inverted. Never mutates the box. Returns maxY.
  function readTop(box, index) {
    if (box === null || typeof box !== 'object') {
      fail('boxes[' + index + '] must be an object');
    }
    var minX = finite(box.minX, 'boxes[' + index + '].minX');
    var minY = finite(box.minY, 'boxes[' + index + '].minY');
    var minZ = finite(box.minZ, 'boxes[' + index + '].minZ');
    var maxX = finite(box.maxX, 'boxes[' + index + '].maxX');
    var maxY = finite(box.maxY, 'boxes[' + index + '].maxY');
    var maxZ = finite(box.maxZ, 'boxes[' + index + '].maxZ');
    if (minX > maxX || minY > maxY || minZ > maxZ) {
      fail('boxes[' + index + '] has inverted bounds');
    }
    return maxY;
  }

  /**
   * makeEnvelope(boxes)
   * @param {Array<{minX,minY,minZ,maxX,maxY,maxZ}>} boxes  synthetic axis-aligned boxes
   * @returns {{ top:number, clearance:Function, protect:Function }}
   */
  function makeEnvelope(boxes) {
    if (!Array.isArray(boxes)) fail('boxes must be an array');

    var top = 0; // empty input => 0
    for (var i = 0; i < boxes.length; i++) {
      var maxY = readTop(boxes[i], i);
      if (maxY > top) top = maxY;
    }

    // Radius (radius-only, no padding) of the sphere enclosing the near plane.
    function clearance(near, fovDegrees, aspect, padding) {
      return computeClearance(near, fovDegrees, aspect, padding);
    }

    // Mutates ONLY eye.y so that eye.y >= top + clearance. Returns that minimum.
    function protect(eye, near, fovDegrees, aspect, padding) {
      if (eye === null || typeof eye !== 'object') fail('eye must be an object');
      finite(eye.y, 'eye.y'); // fail closed instead of leaving a NaN eye unclamped
      var required = top + computeClearance(near, fovDegrees, aspect, padding);
      if (eye.y < required) {
        eye.y = required; // only eye.y is written
      }
      return required;
    }

    return { top: top, clearance: clearance, protect: protect };
  }

  global.CameraEnvelope = { makeEnvelope: makeEnvelope };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* Material Flow Player: one scene, full control. Everything on screen is a function of (flow, time, view, camera):
   the timeline can jump anywhere, and the viewer can leave the guided camera at any moment and keep playing.
   Slide coordinates (960 x 540) are kept all the way, 1 point = 0.30 m. Each plan is a plate that can move and rise:
   stack 0 = the slide layout, 1 = floors stacked. R is how far the factory has risen out of the flat plan (0 = 2D, 1 = 3D). */
"use strict";
