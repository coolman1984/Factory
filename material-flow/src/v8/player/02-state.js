  /* ---------- state ---------- */
  // panel: the steps list starts collapsed. mini: the mini map starts hidden. blur: opt-in glass backdrop blur (never on Low).
  const S = { flow: 0, t: 0, playing: false, speed: 1, view: "auto", cam: "guided", stack: 0, stackUser: null, labels: true, net: false, panel: false, mini: false, blur: query.get("blur") === "1", autoFade: query.get("fade") !== "0", stepStop: false, roof: true, R: 0, focus: true, sound: false, plan: "replica", look: "studio", quality: ["high", "medium", "low"].includes(query.get("q")) ? query.get("q") : "high", measure: false, pts: [],
    c: { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: 0.001 } };
  const want = { x: 0, y: 0, z: 0, dist: 640, az: 0, pol: 0.001 };

  const metrics = { frames: 0, intervals: new Float32Array(600), events: [], shadows: 0, riseUpdates: 0, dimUpdates: 0, stages: {} };
  metrics.slowFrames = Array.from({ length: 128 }, () => ({ t: 0, end: 0, ms: 0, cpu: 0, step: 0, mask: 0, programs: 0, textures: 0, heap: 0 }));
  metrics.slowCount = 0; metrics.lastMask = 0; metrics.lastCPU = 0;
  metrics.maskNames = { step: 1, surface: 2, replica: 4, movers: 8, stackObjects: 16 };
  const profile = query.has("profile");
  function event(name, start) { metrics.events.push({ name, ms: +(performance.now() - start).toFixed(2) }); if (metrics.events.length > 80) metrics.events.shift(); }
  function stage(name, start) { if (!profile) return; const ms = performance.now() - start, v = metrics.stages[name] || (metrics.stages[name] = { calls: 0, total: 0, max: 0 }); v.calls++; v.total += ms; v.max = Math.max(v.max, ms); }
  const realtimeShadows = query.get("shadows") === "1";
  let manualQuality = query.has("q"), resolutionScale = 1;
