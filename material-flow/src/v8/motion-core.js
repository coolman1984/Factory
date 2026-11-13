/* Shared deterministic motion, moved from the reviewed V7.7.2 engine. Units: 0.3 m; story seconds; radians. */
(function(root) {
"use strict";
const DWELL = .7, INTRO = 7, LIFT_T = 6, STATION_T = .01, PT_M = .3;
const V_MAX = 4, RAMP_T = .25, TURN_T = .3, MIN_SEG = 1e-4, TURN_SNAP = 1e-6;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);
const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const ZERO_POINT = [0, 0];
const rampDist = (x) => x * x * x - x * x * x * x * .5, rampSpeed = (x) => x * x * (3 - 2 * x);
const pl = path => { let length = 0; for (let i=0;i<path.length;i++) if(i) length += Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]); return length; };

  function cleanPath(path) {
    const out = [];
    for (const p of path) {
      const q = [p[0], p[1]], n = out.length;
      if (n && Math.hypot(q[0] - out[n - 1][0], q[1] - out[n - 1][1]) < MIN_SEG) continue;           // duplicate
      if (n >= 2) {
        const a = out[n - 2], b = out[n - 1], ux = b[0] - a[0], uy = b[1] - a[1], vx = q[0] - b[0], vy = q[1] - b[1];
        if (Math.abs(ux * vy - uy * vx) < 1e-6 * Math.hypot(ux, uy) * Math.hypot(vx, vy) && ux * vx + uy * vy > 0) { out[n - 1] = q; continue; }   // same-direction collinear
      }
      out.push(q);
    }
    return out;
  }
  function segmentProfile(L, VM = V_MAX) {   // L in metres, VM = cruise speed (m/s)
    const full = VM * RAMP_T, cruise = L >= full;
    const Ta = cruise ? RAMP_T : RAMP_T * Math.sqrt(L / full), vp = cruise ? VM : L / Ta;   // short segments: same acceleration, lower peak
    return { Ta, vp, T: 2 * Ta + (cruise ? (L - full) / VM : 0) };
  }
  function segmentAdvance(p, L, tau) {   // metres travelled along a segment after tau seconds
    if (tau <= 0) return 0; if (tau >= p.T) return L;
    if (tau < p.Ta) return p.vp * p.Ta * rampDist(tau / p.Ta);
    if (tau > p.T - p.Ta) return L - p.vp * p.Ta * rampDist((p.T - tau) / p.Ta);
    return p.vp * p.Ta * .5 + p.vp * (tau - p.Ta);
  }
  function segmentSpeed(p, tau) {
    if (tau <= 0 || tau >= p.T) return 0;
    if (tau < p.Ta) return p.vp * rampSpeed(tau / p.Ta);
    if (tau > p.T - p.Ta) return p.vp * rampSpeed((p.T - tau) / p.Ta);
    return p.vp;
  }
  function buildSchedule(path, hIn, VM = V_MAX) {
    const P = cleanPath(path), phases = [], sched = { pts: P, phases, duration: 0, length: 0, h0: hIn, h1: hIn, vm: VM };
    let t = 0, d = 0, h = hIn;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], dx = b[0] - a[0], dy = b[1] - a[1], lp = Math.hypot(dx, dy), Lm = lp * PT_M, heading = Math.atan2(dx, dy);
      if (h === undefined) { h = sched.h0 = heading; }
      else {
        let delta = wrapPi(heading - h); const quarter = Math.PI / 2;
        if (Math.abs(Math.abs(delta) - quarter) < TURN_SNAP) delta = Math.sign(delta) * quarter; else if (Math.abs(Math.abs(delta) - Math.PI) < TURN_SNAP) delta = Math.PI;
        if (Math.abs(delta) > TURN_SNAP) { const T2 = TURN_T * Math.abs(delta) / quarter; phases.push({ k: "turn", t0: t, t1: t + T2, x: a[0], y: a[1], h0: h, delta, h1: heading, d, seg: i - 1 }); t += T2; }
      }
      const p = segmentProfile(Lm, VM); phases.push({ k: "move", t0: t, t1: t + p.T, a, b, lp, Lm, p, d0: d, h: heading, seg: i - 1 }); t += p.T; d += lp; h = heading;
    }
    sched.duration = t; sched.length = d; sched.h1 = h; return sched;
  }
  function sampleSchedule(s, tau, out) {
    const ph = s.phases, n = ph.length, P = s.pts;
    if (!n || tau >= s.duration) { const e = P[P.length - 1] || ZERO_POINT; out.x = e[0]; out.y = e[1]; out.h = s.h1 === undefined ? 0 : s.h1; out.d = s.length; out.v = 0; out.k = "end"; out.seg = Math.max(0, P.length - 2); return out; }
    if (tau < 0) tau = 0;
    let i = 0; while (i < n - 1 && tau >= ph[i].t1) i++;
    const p = ph[i]; out.seg = p.seg;
    if (p.k === "scan") { out.x = p.x; out.y = p.y; out.h = p.h; out.d = p.d; out.v = 0; out.k = "scan"; return out; }
    if (p.k === "turn") {
      const u = clamp((tau - p.t0) / (p.t1 - p.t0), 0, 1); out.x = p.x; out.y = p.y; out.d = p.d; out.v = 0; out.k = "turn";
      out.h = u >= 1 ? p.h1 : wrapPi(p.h0 + p.delta * ease(u)); return out;
    }
    const m = segmentAdvance(p.p, p.Lm, tau - p.t0), k = p.Lm ? clamp(m / p.Lm, 0, 1) : 1;
    out.x = lerp(p.a[0], p.b[0], k); out.y = lerp(p.a[1], p.b[1], k); out.h = p.h; out.d = p.d0 + k * p.lp; out.v = segmentSpeed(p.p, tau - p.t0); out.k = "move"; return out;
  }
  function scheduleManualStops(sched, plate, devices) {
    const scanners = (devices || []).filter(d => d.type === "rfid-manual" && d.routeBound === true && d.plate === plate && d.node == null);
    if (!scanners.length) return sched;
    const phases = []; let time = 0;
    for (const phase of sched.phases) {
      if (phase.k !== "move") { const span = phase.t1 - phase.t0; phases.push({ ...phase, t0: time, t1: time + span }); time += span; continue; }
      const dx = phase.b[0] - phase.a[0], dy = phase.b[1] - phase.a[1], length2 = dx * dx + dy * dy;
      const hits = [];
      for (const d of scanners) {
        const u = ((d.lane[0] - phase.a[0]) * dx + (d.lane[1] - phase.a[1]) * dy) / length2;
        if (u <= 1e-5 || u > 1 + 1e-5 || Math.hypot(phase.a[0] + u * dx - d.lane[0], phase.a[1] + u * dy - d.lane[1]) > .02) continue;
        hits.push({ u: Math.min(1, u), d });
      }
      hits.sort((a, b) => a.u - b.u);
      let before = 0;
      for (const hit of [...hits, { u: 1, d: null }]) {
        if (hit.u - before > 1e-6) {
          const a = [phase.a[0] + dx * before, phase.a[1] + dy * before], b = [phase.a[0] + dx * hit.u, phase.a[1] + dy * hit.u];
          const lp = phase.lp * (hit.u - before), Lm = lp * PT_M, p = segmentProfile(Lm, sched.vm);
          phases.push({ ...phase, a, b, lp, Lm, p, d0: phase.d0 + phase.lp * before, t0: time, t1: time + p.T }); time += p.T;
        }
        if (hit.d) { phases.push({ k: "scan", scanner: hit.d.sym, t0: time, t1: time + 1.8, x: hit.d.lane[0], y: hit.d.lane[1], h: phase.h, d: phase.d0 + phase.lp * hit.u, seg: phase.seg }); time += 1.8; }
        before = hit.u;
      }
    }
    sched.phases = phases; sched.duration = time; return sched;
  }
  function timeline(D, f, elevator) {
    const E = elevator || {low: [0,0], high: [0,0]};
    const items = [{ s: { node: f.steps[0].node, intro: true }, i: 0, path: null, t0: 0, tm: INTRO - .6, t1: INTRO, h0: 0, h1: 0, sched: null, base: 0, run: 0, metres: 0 }];
    let t = INTRO, total = 0, hPrev, waiting = [];
    f.steps.forEach((s, i) => {
      let path = s.path;
      const EL = elevator || E;
      if (path === "lift") path = [EL.low, EL.high];
      if (path === "fromLift") path = [EL.high, [D.nodes[s.node].x, EL.high[1]], [D.nodes[s.node].x, D.nodes[s.node].y]];
      const sched = path && !s.lift ? scheduleManualStops(buildSchedule(path, hPrev, s.speed || V_MAX), D.nodes[s.node].plate, D.devices) : null, moving = sched && sched.phases.length > 0;
      const stationary = !path || (!s.lift && !moving), move = s.lift ? LIFT_T : moving ? sched.duration : STATION_T, dwell = s.dwell != null ? s.dwell : stationary ? DWELL - STATION_T : DWELL;
      const metres = path && !s.lift ? pl(path) * PT_M : 0, base = total; total += metres;
      const it = { s, i: i + 1, path, sched, t0: t, tm: t + move, t1: t + move + dwell, metres, base, run: total, h0: hPrev, h1: hPrev };
      if (moving) { it.h0 = sched.h0; it.h1 = sched.h1; if (hPrev === undefined) { for (const w of waiting) w.h0 = w.h1 = sched.h0; waiting = []; } hPrev = sched.h1; }
      else if (hPrev === undefined) waiting.push(it);
      items.push(it); t += move + dwell;
    });
    for (const w of waiting) w.h0 = w.h1 = 0;   // a flow with no moving step at all
    items.forEach(it => { if (it.h0 === undefined) it.h0 = it.h1 = 0; });
    return {items, total:t};
  }
function stepAt(items,t) { for(let i=0;i<items.length;i++)if(t<items[i].t1)return items[i];return items[items.length-1]; }
  function pose(items, nodes, t, out) {
    const it = stepAt(items,t), n = nodes[it.s.node]; out.it = it; out.lift = null; out.h = it.h0; out.d = 0; out.v = 0; out.k = "hold"; out.seg = 0;
    if (!it.path) { out.x = n.x; out.y = n.y; out.u = 1; out.i = 1; return out; }
    if (it.s.lift) { out.lift = out.u = ease(clamp((t - it.t0) / Math.max(.001, it.tm - it.t0), 0, 1)); out.h = it.h1; return out; }
    sampleSchedule(it.sched, t - it.t0, out); out.u = it.sched.length ? clamp(out.d / it.sched.length, 0, 1) : 1; out.i = out.seg + 1;
    const p = it.sched.pts[it.sched.pts.length - 1]; if (!it.sched.phases.length && p) { out.x = p[0]; out.y = p[1]; out.h = it.h1; }
    return out;
  }
const glideEase=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
const glideX=s=>glideEase((s-.22)/.78), glideY=s=>glideEase(s/.36);
const CINE = { pre: 5, post: 2.6, out: 3.6 };
const smooth01 = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  function glideAt(items, li, t, params = CINE) {
    if (li < 0) return 0;
    const it = items[li];
    return Math.min(smooth01((t - (it.t0 - params.pre)) / (params.pre - .4)), 1 - smooth01((t - (it.t1 + params.post)) / params.out));
  }
// Same plate selection as the player; cache immutable plate zones outside the hot path.
const zoneCache = new WeakMap();
function world(plates, center, gap, x, y, stack, up, out) {
 let zones=zoneCache.get(plates); if(!zones){zones=Object.entries(plates).filter(([,p])=>Array.isArray(p.zone)).map(([k,p])=>[k,p.zone]);zoneCache.set(plates,zones);}
 let key;
 if(zones.length){let bestD=Infinity;key=zones[0][0];for(let i=0;i<zones.length;i++){const b=zones[i][1],dx=Math.max(b[0]-x,0,x-b[2]),dy=Math.max(b[1]-y,0,y-b[3]),d=dx*dx+dy*dy;if(d<bestD){bestD=d;key=zones[i][0];if(d===0)break;}}}
 else key=x<553?"E1":y>=303?"E2-1F":"E2-2F";
 const P=plates[key],xx=x-center[0]+glideX(stack)*P.dx, yy=glideY(stack)*P.lift*gap+up, zz=y-center[1]+glideX(stack)*P.dz;
 if(out.set)return out.set(xx,yy,zz);out.x=xx;out.y=yy;out.z=zz;return out;
}
function elevatorFor(flow,elevators) {const s=flow.steps.find(x=>x.lift);return (s&&elevators.find(e=>e.label===s.elevator))||elevators[0]||null;}
function numbers(data,flows,elevators=[]) {
 return flows.map(f=>{const items=timeline(data,f,elevatorFor(f,elevators)).items.slice(1);const steps=items.map(it=>({id:it.s.sceneId||"s"+it.i,title:it.s.title,metres:it.metres,seconds:it.t1-it.t0}));return {id:f.id,name:f.name,metres:steps.reduce((n,s)=>n+s.metres,0),seconds:steps.reduce((n,s)=>n+s.seconds,0),trolleys:f.trolleys||1,steps};});
}
const api={CONST:Object.freeze({V_MAX,RAMP_T,TURN_T,DWELL,STATION_T,LIFT_T,SCAN_T:1.8,INTRO,UNIT:PT_M}),cleanPath,segmentProfile,segmentAdvance,segmentSpeed,schedule:buildSchedule,sample:sampleSchedule,withScanStops:scheduleManualStops,timeline,pose,stepAt,numbers,glideX,glideY,glideAt,world};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.MFMotion=api;
})(typeof window!=="undefined"?window:this);

