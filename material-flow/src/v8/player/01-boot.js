(function () {
  const D = window.MF_DATA, RP = window.MF_REPLICA, T = window.THREE, $ = (id) => document.getElementById(id);
  function fail(m) { const e = $("err"); e.style.display = "grid"; e.textContent = m; }
  if (!T) { fail("The 3D library did not load."); return; }
  const [CX, CY] = D.center || [480, 290], GAP = 120, DWELL = .7, INTRO = 7, LIFT_T = 6, STATION_T = .01, PT_M = RP.scale;
  // A truly stationary step (no path, or a path with zero motion) lasts DWELL in total: a token STATION_T "move" (so tm > t0 and step-stop
  // still has something to stop at) plus DWELL - STATION_T of dwell. Moving steps and the lift keep move + DWELL.
  // Physical story-time motion (Round 5 baseline): cruise speed, ramp time to/from cruise, and in-place quarter-turn time.
  // Playback speed (S.speed, 0.5x-8x) multiplies story time exactly once, in frame(); nothing below knows about it.
  const V_MAX = 4, RAMP_T = .25, TURN_T = .3, MIN_SEG = 1e-4, TURN_SNAP = 1e-6;
  // Each plate owns a zone [x0, y0, x1, y1] of the project frame (zones never overlap); a point belongs to the plate whose zone
  // contains it, else to the nearest zone. Projects without zones keep the original Injection rule.
  const ZONES = Object.entries(D.plates).filter(([, P]) => Array.isArray(P.zone)).map(([k, P]) => [k, P.zone]);
  const plateOf = ZONES.length ? (x, y) => {
    let best = ZONES[0][0], bestD = Infinity;
    for (let i = 0; i < ZONES.length; i++) { const b = ZONES[i][1], dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]), d = dx * dx + dy * dy; if (d < bestD) { bestD = d; best = ZONES[i][0]; if (d === 0) break; } }
    return best;
  } : (x, y) => (x < 553 ? "E1" : y >= 303 ? "E2-1F" : "E2-2F");
  const zoneOf = (k) => D.plates[k].zone;
  const CUT_X = ZONES.length ? [...new Set(ZONES.flatMap(([, z]) => [z[0], z[2]]))] : [553], CUT_Y = ZONES.length ? [...new Set(ZONES.flatMap(([, z]) => [z[1], z[3]]))] : [303];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);
  const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  const query = new URLSearchParams(location.search);

