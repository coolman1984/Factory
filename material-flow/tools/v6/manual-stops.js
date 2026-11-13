  // Add scan holds within a leg, preserving the owner's stop order and the original orthogonal path.
  // Split a move at each route-bound handheld point, so acceleration/deceleration remains physical.
  function scheduleManualStops(sched, plate) {
    const scanners = (D.devices || []).filter(d => d.type === "rfid-manual" && d.routeBound === true && d.plate === plate && d.node == null);
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
          const lp = phase.lp * (hit.u - before), Lm = lp * PT_M, p = segmentProfile(Lm);
          phases.push({ ...phase, a, b, lp, Lm, p, d0: phase.d0 + phase.lp * before, t0: time, t1: time + p.T }); time += p.T;
        }
        if (hit.d) { phases.push({ k: "scan", scanner: hit.d.sym, t0: time, t1: time + 1.8, x: hit.d.lane[0], y: hit.d.lane[1], h: phase.h, d: phase.d0 + phase.lp * hit.u, seg: phase.seg }); time += 1.8; }
        before = hit.u;
      }
    }
    sched.phases = phases; sched.duration = time; return sched;
  }
