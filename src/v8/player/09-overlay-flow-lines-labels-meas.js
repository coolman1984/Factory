  /* ---------- overlay: flow lines, labels, measuring ---------- */
  const fx = $("fx"), g2 = fx.getContext("2d");
  const projectionPoint = new T.Vector3(), overlayWorld = new T.Vector3(), liftPoints = [[0, 0, 0], [0, 0, 0]], measureA = [0, 0, 0], measureB = [0, 0, 0];
  const NO_DASH = [], FLOW_DASH = [7, 15], MEASURE_DASH = [6, 5], connections = Object.values(D.conns || {});
  for (const connection of connections) pathInfo(connection.pts);
  function proj(v, out = [0, 0, 0]) { projectionPoint.copy(v).project(camera); out[0] = (projectionPoint.x + 1) * .5 * innerWidth; out[1] = (1 - projectionPoint.y) * .5 * innerHeight; out[2] = projectionPoint.z; return out; }
  function poly(path) { const pts = pathInfo(path).projected; for (let i = 0; i < path.length; i++) proj(W(path[i][0], path[i][1], S.stack, S.R * 1.5 + .8, overlayWorld), pts[i]); return pts; }
  function stroke(pts, color, w, dash = NO_DASH, off = 0, count = pts.length) {
    if (count < 2) return; g2.beginPath(); g2.setLineDash(dash); g2.lineDashOffset = off; g2.strokeStyle = color; g2.lineWidth = w; g2.lineJoin = "round"; g2.lineCap = "round";
    g2.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < count; i++) g2.lineTo(pts[i][0], pts[i][1]); g2.stroke(); g2.setLineDash(NO_DASH);
  }
  function arrow(a, b, color, size) { const r = Math.atan2(b[1] - a[1], b[0] - a[0]); g2.fillStyle = color; g2.beginPath(); g2.moveTo(b[0], b[1]); g2.lineTo(b[0] - size * Math.cos(r - .45), b[1] - size * Math.sin(r - .45)); g2.lineTo(b[0] - size * Math.cos(r + .45), b[1] - size * Math.sin(r + .45)); g2.fill(); }
  // One orange route style for every mode. The 3D route is the floor ribbon mesh (see "route light"); this 2D canvas
  // line carries the flat plan (ribbon alpha 0) and cross-fades with the ribbon as the factory rises.
  const ROUTE = { core: "#ff9a1f", hot: "#ffd9a0", glow: "#ff8a1f38", faint: "#ff9a1f66", future: "#ff9a1f55" };
  let measuredMetres = NaN, measurementText = "", measurementWidth = 0, planLine = 1;
  const deptPoint = new T.Vector3(), deptOut = [0, 0, 0];
  function drawDepts() {   // V3: the deck's department zones, named on their floor
    if (!D.depts || !S.labels || bareOn) return;
    const upperOnly = S.stack > .5; g2.save(); g2.font = "600 12px 'Segoe UI Variable','Segoe UI',system-ui,sans-serif"; g2.textAlign = "center"; g2.textBaseline = "middle";
    for (const z of D.depts) {
      if (!D.plates[z.plate].lift && underUpper(z.x+z.w/2,z.y+z.h/2)) continue; const grp = plates[z.plate]; if (grp && !grp.visible) continue;
      proj(W(z.x + z.w / 2, z.y + z.h / 2, S.stack, S.R * 34 + 2, deptPoint), deptOut); if (deptOut[2] > 1 || deptOut[2] < -1) continue;
      const w = g2.measureText(z.name).width + 20, x = deptOut[0], y = deptOut[1];
      g2.globalAlpha = .92; g2.fillStyle = "rgba(14,38,70,.74)"; g2.beginPath(); if (g2.roundRect) g2.roundRect(x - w / 2, y - 11, w, 22, 11); else g2.rect(x - w / 2, y - 11, w, 22); g2.fill();
      g2.fillStyle = "#eaf4ff"; g2.fillText(z.name, x, y + .5);
    }
    g2.restore();
  }
  function draw(time) {
    const content = (S.labels && D.depts && D.depts.length && !bareOn) || S.net || planLine > .01 || S.pts.length;
    if (!content && draw.empty) return;
    g2.clearRect(0, 0, innerWidth, innerHeight); draw.empty = !content; if (!content) return; drawDepts();
    if (S.net) for (let i = 0; i < connections.length; i++) { const c = connections[i]; stroke(poly(c.pts), c.color === "#3B7D23" ? "#3fae5acc" : "#5b8fb9cc", 1.4); }
    const f = F(), cur = frameLot.it;
    if (planLine > .01) {
      g2.globalAlpha = planLine;
      for (let n = 0; n < f.items.length; n++) {
        const it = f.items[n]; if (!it.path) continue;
        const p = poly(it.path);
        if (it.i > cur.i) stroke(p, ROUTE.future, 3);
        else if (it.i < cur.i) { stroke(p, ROUTE.glow, 10); stroke(p, ROUTE.core, 4); if (p.length > 1) arrow(p[p.length - 2], p[p.length - 1], ROUTE.core, 12); }
        else {
          stroke(p, ROUTE.future, 3);
          if (it.s.lift) { proj(W(E.low[0], E.low[1], S.stack, .8, overlayWorld), liftPoints[0]); proj(lotPoint, liftPoints[1]); stroke(liftPoints, ROUTE.core, 5); }
          else {
            // the bright part ends at the exact schedule distance (frameLot.u = d / length), not at a time fraction
            const m = along(it.path, frameLot.u, pathHead), head = pathInfo(it.path).head;
            for (let i = 0; i < m.i; i++) { head[i][0] = p[i][0]; head[i][1] = p[i][1]; head[i][2] = p[i][2]; }
            proj(W(m.x, m.y, S.stack, S.R * 1.5 + .8, overlayWorld), head[m.i]);
            stroke(head, ROUTE.glow, 12, NO_DASH, 0, m.i + 1); stroke(head, ROUTE.core, 4.5, NO_DASH, 0, m.i + 1); stroke(head, ROUTE.hot, 1.6, FLOW_DASH, -time * 24, m.i + 1);
          }
        }
      }
      g2.globalAlpha = 1;
    }
    if (S.pts.length) {
      const a = proj(S.pts[0], measureA); g2.fillStyle = "#fff"; g2.beginPath(); g2.arc(a[0], a[1], 5, 0, 7); g2.fill();
      if (S.pts[1]) {
        const b = proj(S.pts[1], measureB), metres = S.pts[0].distanceTo(S.pts[1]) * PT_M;
        if (metres !== measuredMetres) { measuredMetres = metres; measurementText = metres.toFixed(1) + " m"; g2.font = "bold 15px Segoe UI"; measurementWidth = g2.measureText(measurementText).width + 14; }
        liftPoints[0][0] = a[0]; liftPoints[0][1] = a[1]; liftPoints[1][0] = b[0]; liftPoints[1][1] = b[1]; stroke(liftPoints, "#fff", 2, MEASURE_DASH);
        g2.beginPath(); g2.arc(b[0], b[1], 5, 0, 7); g2.fill(); g2.font = "bold 15px Segoe UI";
        const x = (a[0] + b[0]) * .5 - measurementWidth * .5, y = (a[1] + b[1]) * .5 - 12; g2.fillStyle = "#0b1220ee"; g2.fillRect(x, y, measurementWidth, 24); g2.fillStyle = "#fff"; g2.fillText(measurementText, x + 7, y + 17);
      }
    }
  }
  let chips = {}, nodes = [], chipList = []; const labels = $("labels");
  labels.style.contain = "layout style";
  function buildChips() { for (const c of chipList) c.el.remove(); chips = {}; nodes = Object.values(D.nodes); chipList = []; for (const n of nodes) {
    const el = document.createElement("div"); el.className = "chip"; el.style.setProperty("--c", n.fill); el.innerHTML = `<span class="mk ${n.kind}"></span><span class="tx"></span>`;
    el.onclick = e => { e.stopPropagation(); pickNode(n); }; labels.append(el);
    const chip = { el, text: el.querySelector(".tx"), point: [0, 0, 0], px: NaN, py: NaN }; chips[n.id] = chip; chipList.push(chip);
  } }
  buildChips();
  const floorTags = plateEntries.map(([k, P]) => { const e = document.createElement("div"); e.className = "floor"; e.textContent = P.label; labels.append(e); return { e, P, point: [0, 0, 0], px: NaN, py: NaN }; });
  let labelStates;
  const buildLabelStates = () => labelStates = D.flows.map(f => f.items.map(cur => {
    const use = {};
    for (const it of f.items) if (!it.s.intro && (!use[it.s.node] || it.i <= cur.i)) use[it.s.node] = it;
    // Only six labels are visible, around the current step (two behind, the rest ahead; the window slides at either end).
    // All 25 chip nodes still exist; the rest are always hidden (hard cap of six, also with "All flows" on: that only adds network routes).
    const real = f.items.filter(it => !it.s.intro), at = cur.s.intro ? 0 : real.findIndex(it => it.i === cur.i) - 2, lo = clamp(at, 0, Math.max(0, real.length - 6));
    const near = new Set(real.slice(lo, lo + 6).map(it => it.s.node));
    return nodes.map(n => { const it = use[n.id], base = "chip" + (it ? "" : " dim"), suffix = it && it.i === cur.i ? " now" : it && it.i < cur.i ? " done" : ""; return { it, near: !!it && near.has(n.id), off: base + suffix, on: base + (it ? " on" : "") + suffix, text: it ? `${it.i}  ${it.s.title}` : "" }; });
  }));
  buildLabelStates();
  let labelFlow = -1, labelStep = -1, labelLabels = null, labelState = null;
  const upperLabelPoint = new T.Vector3();
  function underUpper(x,y){
    const point=W(x,y,S.stack,1,upperLabelPoint);
    return plateEntries.some(([key,P])=>{
      if(!P.lift||!plates[key].visible||camera.position.y<=plates[key].position.y)return false;
      const b=P.box,g=plates[key];return point.x>=b[0]-CX+g.position.x&&point.x<=b[0]+b[2]-CX+g.position.x&&point.z>=b[1]-CY+g.position.z&&point.z<=b[1]+b[3]-CY+g.position.z;
    });
  }
  function placeLabels() {
    const cur = frameLot.it;
    if (labelFlow !== S.flow || labelStep !== cur.i || labelLabels !== S.labels) {
      labelFlow = S.flow; labelStep = cur.i; labelLabels = S.labels; labelState = labelStates[S.flow][cur.i];
      for (let i = 0; i < chipList.length; i++) { const chip = chipList[i], state = labelState[i]; chip.el.className = S.labels ? state.on : state.off; if (chip.title !== state.text) { chip.text.textContent = chip.title = state.text; } }
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], chip = chipList[i];
      if (!labelState[i].near || (!D.plates[plateOf(n.x,n.y)].lift && underUpper(n.x,n.y))) { if (chip.display !== "none") chip.el.style.display = chip.display = "none"; continue; }
      const p = proj(W(n.x, n.y, S.stack, 3 + S.R * 16, overlayWorld), chip.point), x = p[0], y = p[1], z = p[2];
      const display = z < -1 || z > 1 || x < -100 || x > innerWidth + 100 || y < -100 || y > innerHeight + 100 ? "none" : "flex";
      if (display !== chip.display) chip.el.style.display = chip.display = display;
      if (display !== "none") { const px = x - 9, py = y - 9; if (chip.px !== px || chip.py !== py) { chip.px = px; chip.py = py; chip.el.style.transform = `translate(${px}px,${py}px)`; } }
    }
    for (let i = 0; i < floorTags.length; i++) {
      const tag = floorTags[i], display = S.labels ? "block" : "none"; if (tag.display !== display) tag.e.style.display = tag.display = display; if (!S.labels) continue;
      const b = tag.P.box, p = proj(W(b[0] + 2, b[1] + 2, S.stack, .8, overlayWorld), tag.point), px = p[0], py = p[1] - 12;
      if (tag.px !== px || tag.py !== py) { tag.px = px; tag.py = py; tag.e.style.transform = `translate(${px}px,${py}px)`; }
    }
  }
  function pickNode(n) { const it = F().items.find((i) => !i.s.intro && i.s.node === n.id); if (it) { seek(it.tm); pause(); } else tip(`${n.text || n.kind}: not in this flow`); }

