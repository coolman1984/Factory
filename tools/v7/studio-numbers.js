/* ===== V7 Studio: Numbers tab (distance, time, trips per shift, before / after comparison, live congestion) ===== */
function flowNumbers(flows) {   // built player flows (items) or scene-converted flows (estimated with the same motion schedule)
  return flows.map((f) => {
    let metres = 0, time = 0;
    if (f.items) { for (const it of f.items) if (!it.s.intro) { metres += it.metres || 0; time += it.t1 - it.t0; } }
    else for (const s of f.steps) {
      const wait = s.dwell != null ? s.dwell : .7;
      if (s.lift) { time += 6 + wait; continue; }
      if (Array.isArray(s.path)) { const sc = MF.schedule(s.path, undefined, s.speed || 4); metres += sc.length * PT_M; time += sc.duration + wait; }
      else time += wait;
    }
    return { id: f.id, name: f.name, metres, time, trolleys: f.trolleys || 1 };
  });
}
const sceneFlows = (sc) => SCN.toInternal(clone(sc), { plates: D.plates, elevators: X.ELEVATORS || [], replica: RP }, { applyLayout: false }).data.flows;
function renderNumbers() {
  const shift = doc.settings.shift || 8, now = flowNumbers(MF.D.flows), base = flowNumbers(sceneFlows(MF7.base || toScene()));
  const trips = (r) => Math.floor(shift * 3600 / Math.max(1, r.time)) * r.trolleys;
  const delta = (a, b, unit) => { const x = a - b; if (Math.abs(x) < .05) return ""; return ' <em class="' + (x < 0 ? "ok7" : "bad") + '">' + (x > 0 ? "+" : "") + x.toFixed(unit ? 1 : 0) + (unit || "") + "</em>"; };
  const rows = now.map((r) => {
    const b = base.find((q) => q.id === r.id);
    return "<tr><td>" + esc(r.name) + (r.trolleys > 1 ? " <small>(" + r.trolleys + " trolleys)</small>" : "") + "</td><td>" + r.metres.toFixed(0) + " m" + (b ? delta(r.metres, b.metres, " m") : "") + "</td><td>" + fmtT(r.time) + (b ? delta(r.time, b.time, " s") : "") + "</td><td>" + trips(r) + (b ? delta(trips(r), trips(b), "") : "") + "</td></tr>";
  }).join("");
  body.innerHTML = '<div class="sec card7"><div class="ct"><b>Numbers per path</b><span>one trip</span></div>' +
    '<label>Shift length (hours)<input type="number" min="1" max="24" step="0.5" data-f="shift" value="' + shift + '"></label>' +
    '<table class="num7"><tr><th>Path</th><th>Distance</th><th>Time</th><th>Trips / shift</th></tr>' + rows + "</table>" +
    '<p class="hint">Green / red: the change against the scene built into this player file (before / after). Trips per shift = shift ÷ one trip × trolleys, without waiting for each other.</p>' +
    '<div class="acts"><button data-a="cmpFile">Compare with a scene file…</button></div><div id="cmpOut" class="hint"></div></div>' +
    '<div class="sec card7"><div class="ct"><b>Several trolleys on one path</b></div><p class="hint">Set Trolleys and Every (s) for a path in Steps, then play. The closest distance between two trolleys shows here; under 3 m they block each other (congestion).</p><p id="fleetOut" class="hint"></p></div>';
  bindFields(body, (f, v) => commit("shift length", () => { doc.settings.shift = Math.max(1, Math.min(24, v)); }, "director"));
  body.querySelector('[data-a="cmpFile"]').onclick = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json";
    inp.onchange = async () => {
      try {
        const sc = JSON.parse(await inp.files[0].text()), other = flowNumbers(sceneFlows(sc));
        $("cmpOut").innerHTML = "<b>" + esc(inp.files[0].name) + "</b><br>" + now.map((r) => { const o = other.find((q) => q.id === r.id); return o ? esc(r.name) + ": " + r.metres.toFixed(0) + " m vs " + o.metres.toFixed(0) + " m, " + fmtT(r.time) + " vs " + fmtT(o.time) : esc(r.name) + ": not in that file"; }).join("<br>");
      } catch (e) { X.tip("Could not compare: " + e.message); }
    };
    inp.click();
  };
  fleetTick();
}
function fleetTick() {
  const el = $("fleetOut"); if (!el) return;
  el.innerHTML = fleet.clones.length ? (fleet.minGap < Infinity ? 'Closest distance now: <b class="' + (fleet.minGap < 3 ? "bad" : "") + '">' + fleet.minGap.toFixed(1) + " m</b>" + (fleet.minGap < 3 ? " · congestion" : "") : "Only one trolley is moving now.") : "This path has one trolley.";
}
