/* Material Flow V8.1: Engine panel (read-only). Shows what the Factory Engine says at the current story time:
   where the lot is, what the trolley is doing, the step, the last events and the run fingerprint.
   Toggle: the "Engine" button (bottom left) or Alt+E. It never writes engine or player state. */
(function () {
"use strict";
const css = `#fe-btn{position:fixed;left:12px;bottom:12px;z-index:40;font:600 12px/1 system-ui,Segoe UI,sans-serif;color:#e8f1ff;background:#0d1626cc;border:1px solid #ffffff2e;border-radius:999px;padding:7px 12px;cursor:pointer;backdrop-filter:blur(8px)}
#fe-btn:hover{background:#16243bdd}#fe-btn i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#3fb950;margin-right:6px;vertical-align:0}#fe-btn.bad i{background:#f85149}
#fe-panel{position:fixed;left:12px;bottom:46px;z-index:40;width:330px;max-height:58vh;overflow:auto;font:12px/1.45 system-ui,Segoe UI,sans-serif;color:#dfe8f5;background:#0b1320e6;border:1px solid #ffffff26;border-radius:12px;padding:10px 12px;display:none;backdrop-filter:blur(10px);box-shadow:0 8px 30px #0008}
#fe-panel h3{margin:0 0 6px;font-size:13px;color:#fff}#fe-panel .k{color:#8ea3bd}#fe-panel table{width:100%;border-collapse:collapse;margin-top:6px}#fe-panel td{padding:1px 4px 1px 0;vertical-align:top;white-space:nowrap}
#fe-panel td.e{white-space:normal;color:#b9c7da}#fe-panel .fp{font-family:Consolas,monospace;color:#9ecbff}#fe-panel .err{color:#ff8a80}
#fe-panel input{background:#0f1b2d;color:#e8f1ff;border:1px solid #ffffff33;border-radius:6px;padding:2px 4px;font:inherit}#fe-panel button#fe-go{background:#1f6feb;color:#fff;border:0;border-radius:6px;padding:4px 14px;cursor:pointer;font:600 12px system-ui}
#fe-panel #fe-out{font-size:11px}#fe-panel #fe-out table td{padding-right:7px}`;
function start() {
  const MF = window.MF, B = window.MFEngine; if (!MF || !MF.D || !MF.S || !B) return false;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const btn = document.createElement("button"); btn.id = "fe-btn"; btn.type = "button"; btn.title = "Factory Engine (Alt+E)"; btn.innerHTML = "<i></i>Engine"; document.body.appendChild(btn);
  const panel = document.createElement("div"); panel.id = "fe-panel"; panel.setAttribute("role", "region"); panel.setAttribute("aria-label", "Factory Engine"); document.body.appendChild(panel);
  const trip = document.createElement("div"), shift = document.createElement("div"); shift.id = "fe-shift"; panel.append(trip, shift);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const flow = () => MF.D.flows[MF.S.flow], data = () => B.infoFor(flow());
  const detail = (e, d) => e.type === "leg.start" ? "to " + (d.names[e.to] || e.to) : e.type === "leg.arrive" ? "at " + (d.names[e.at] || e.at) : e.type === "load.end" ? "lot loaded" : e.type === "unload.end" ? "lot unloaded at " + (d.names[e.to] || e.to) : e.type === "mark" ? e.type + " " + (e.ref ?? "") : e.mission || "";
  /* Shift run (V8.2): all paths of this tab together for a shift on the engine; the form is static, results replace the table. */
  shift.innerHTML = `<details id="fe-sh" style="margin-top:8px;border-top:1px solid #ffffff1f;padding-top:6px"><summary style="cursor:pointer;color:#fff;font-weight:600">Shift run (all paths of this tab)</summary>
<div style="display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px 8px;margin:6px 0;align-items:center">
<label class="k" for="fe-h">Hours</label><input id="fe-h" type="number" min="0.5" max="24" step="0.5" value="8" style="width:60px">
<label class="k" for="fe-n">Trolleys/path</label><input id="fe-n" type="number" min="0" max="20" step="1" value="0" title="0 = as in the scene" style="width:60px">
<label class="k" for="fe-c">Lift cars</label><input id="fe-c" type="number" min="1" max="6" step="1" value="1" style="width:60px">
<label class="k" for="fe-s">Spread %</label><input id="fe-s" type="number" min="0" max="50" step="5" value="0" title="assumed travel/wait variability" style="width:60px">
<label class="k" for="fe-r">Empty return</label><input id="fe-r" type="checkbox" checked><span></span><button id="fe-go" type="button" style="justify-self:end">Run</button></div>
<div id="fe-out" class="k">Each trolley repeats its path; elevators are shared by all paths; the empty return is the loaded route reversed (estimated). "Today" = shift / one-way trip time x trolleys.</div></details>`;
  const $ = id => shift.querySelector("#" + id);
  function runShiftUI() {
    const n = +$("fe-n").value, opts = { hours: +$("fe-h").value || 8, liftCars: Math.max(1, +$("fe-c").value || 1), spread: Math.min(.5, Math.max(0, (+$("fe-s").value || 0) / 100)), returnTrip: $("fe-r").checked, trolleys: n > 0 ? () => n : undefined };
    const t0 = performance.now(); let r; try { r = B.runShift(MF.D, opts); } catch (e) { $("fe-out").innerHTML = `<span class="err">${esc(e.message)}</span>`; return null; }
    const ms = performance.now() - t0;
    $("fe-out").innerHTML = `<table><tr class="k"><td>path</td><td title="trolleys">trl</td><td title="trips in the shift on the engine">engine trips</td><td title="shift / one-way trip time x trolleys">today</td><td title="mean trip cycle incl. return and waits">cycle s</td><td title="lift wait per trip">wait s</td></tr>${r.paths.map(p => `<tr><td class="e" style="max-width:120px">${esc(p.name)}</td><td>${p.trolleys}</td><td><b>${p.trips}</b></td><td>${p.naive}</td><td>${p.meanCycle == null ? "-" : p.meanCycle.toFixed(0)}</td><td>${p.liftWaitPerTrip == null ? "-" : p.liftWaitPerTrip.toFixed(1)}</td></tr>`).join("")}</table>
<div>${r.lifts.map(l => `${esc(l.id.replace(/^lift:/, ""))}: ${l.cars} car(s), busy ${(l.busy * 100).toFixed(1)}%`).join(" &middot; ") || "no lift used"}</div>
<div class="k">${r.hours} h in ${ms.toFixed(0)} ms &middot; ${r.events} events &middot; invariants ${r.invariants.length ? '<span class="err">' + esc(r.invariants.join("; ")) + "</span>" : "OK"} &middot; <span class="fp">${esc(r.fingerprint)}</span></div>`;
    return r;
  }
  $("fe-go").onclick = runShiftUI;
  function render() {
    const d = data(), f = flow(); btn.classList.toggle("bad", !d || !d.ok);
    if (panel.style.display !== "block") return;
    if (!d || !d.ok) { trip.innerHTML = `<h3>Factory Engine</h3><div class="err">Engine fallback for this path: ${esc(d ? d.error : "no engine data")}.<br>The player shows the motion-core timeline.</div>`; return; }
    const s = B.stateAt(d, MF.S.t);
    trip.innerHTML = `<h3>Factory Engine ${esc(d.engine)} <span class="k">drives the step timeline</span></h3>
<div><span class="k">Path</span> ${esc(f.name || f.id)} &middot; <span class="k">step</span> ${s.step}/${d.steps}</div>
<div><span class="k">Trolley</span> ${esc(s.activity)}</div>
<div><span class="k">Lot</span> ${s.onTrolley ? "on the trolley" : esc(d.names[s.lot] || s.lot || "-")}${s.done ? " &middot; trip done" : ""}</div>
<div><span class="k">Scans so far</span> ${s.scans} &middot; <span class="k">clock</span> ${(s.tick / d.tps).toFixed(2)} s</div>
<table>${s.recent.map(e => `<tr><td>${(e.t / d.tps).toFixed(1)} s</td><td>${esc(e.type)}</td><td class="e">${esc(detail(e, d))}</td></tr>`).join("")}</table>
<div style="margin-top:6px"><span class="k">Run fingerprint</span> <span class="fp">${esc(d.fingerprint)}</span></div>`;
  }
  const toggle = on => { panel.style.display = (on ?? panel.style.display !== "block") ? "block" : "none"; render(); };
  btn.onclick = () => toggle();
  addEventListener("keydown", e => { if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "e" || e.key === "E")) { e.preventDefault(); toggle(); } });
  setInterval(render, 250);
  MF.engine = { version: B.version, info: fi => B.infoFor(MF.D.flows[fi ?? MF.S.flow]), stateAt: (t, fi) => B.stateAt(B.infoFor(MF.D.flows[fi ?? MF.S.flow]), t ?? MF.S.t), toggle,
    shift: opts => B.runShift(MF.D, opts || {}), shiftUI: () => { toggle(true); $("fe-sh").open = true; return runShiftUI(); },
    summary: () => MF.D.flows.map(f => { const d = B.infoFor(f); return d && d.ok ? { id: f.id, ok: true, steps: d.steps, total: d.total, fingerprint: d.fingerprint, events: d.log.length } : { id: f.id, ok: false, error: d ? d.error : "no engine data" }; }) };
  render(); return true;
}
let tries = 0; (function wait() { if (start()) return; if (++tries < 600) setTimeout(wait, 100); else console.error("[Factory Engine] panel: player API not found"); })();
})();
