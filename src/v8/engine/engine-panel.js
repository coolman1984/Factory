/* Material Flow V8.1: Engine panel (read-only). Shows what the Factory Engine says at the current story time:
   where the lot is, what the trolley is doing, the step, the last events and the run fingerprint.
   Toggle: the "Engine" button (bottom left) or Alt+E. It never writes engine or player state. */
(function () {
"use strict";
const css = `#fe-btn{position:fixed;left:12px;bottom:12px;z-index:40;font:600 12px/1 system-ui,Segoe UI,sans-serif;color:#e8f1ff;background:#0d1626cc;border:1px solid #ffffff2e;border-radius:999px;padding:7px 12px;cursor:pointer;backdrop-filter:blur(8px)}
#fe-btn:hover{background:#16243bdd}#fe-btn i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#3fb950;margin-right:6px;vertical-align:0}#fe-btn.bad i{background:#f85149}
#fe-panel{position:fixed;left:12px;bottom:46px;z-index:40;width:330px;max-height:58vh;overflow:auto;font:12px/1.45 system-ui,Segoe UI,sans-serif;color:#dfe8f5;background:#0b1320e6;border:1px solid #ffffff26;border-radius:12px;padding:10px 12px;display:none;backdrop-filter:blur(10px);box-shadow:0 8px 30px #0008}
#fe-panel h3{margin:0 0 6px;font-size:13px;color:#fff}#fe-panel .k{color:#8ea3bd}#fe-panel table{width:100%;border-collapse:collapse;margin-top:6px}#fe-panel td{padding:1px 4px 1px 0;vertical-align:top;white-space:nowrap}
#fe-panel td.e{white-space:normal;color:#b9c7da}#fe-panel .fp{font-family:Consolas,monospace;color:#9ecbff}#fe-panel .err{color:#ff8a80}`;
function start() {
  const MF = window.MF, B = window.MFEngine; if (!MF || !MF.D || !MF.S || !B) return false;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const btn = document.createElement("button"); btn.id = "fe-btn"; btn.type = "button"; btn.title = "Factory Engine (Alt+E)"; btn.innerHTML = "<i></i>Engine"; document.body.appendChild(btn);
  const panel = document.createElement("div"); panel.id = "fe-panel"; panel.setAttribute("role", "region"); panel.setAttribute("aria-label", "Factory Engine"); document.body.appendChild(panel);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const flow = () => MF.D.flows[MF.S.flow], data = () => B.infoFor(flow());
  const detail = (e, d) => e.type === "leg.start" ? "to " + (d.names[e.to] || e.to) : e.type === "leg.arrive" ? "at " + (d.names[e.at] || e.at) : e.type === "load.end" ? "lot loaded" : e.type === "unload.end" ? "lot unloaded at " + (d.names[e.to] || e.to) : e.type === "mark" ? e.type + " " + (e.ref ?? "") : e.mission || "";
  function render() {
    const d = data(), f = flow(); btn.classList.toggle("bad", !d || !d.ok);
    if (panel.style.display !== "block") return;
    if (!d || !d.ok) { panel.innerHTML = `<h3>Factory Engine</h3><div class="err">Engine fallback for this path: ${esc(d ? d.error : "no engine data")}.<br>The player shows the motion-core timeline.</div>`; return; }
    const s = B.stateAt(d, MF.S.t);
    panel.innerHTML = `<h3>Factory Engine ${esc(d.engine)} <span class="k">drives the step timeline</span></h3>
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
    summary: () => MF.D.flows.map(f => { const d = B.infoFor(f); return d && d.ok ? { id: f.id, ok: true, steps: d.steps, total: d.total, fingerprint: d.fingerprint, events: d.log.length } : { id: f.id, ok: false, error: d ? d.error : "no engine data" }; }) };
  render(); return true;
}
let tries = 0; (function wait() { if (start()) return; if (++tries < 600) setTimeout(wait, 100); else console.error("[Factory Engine] panel: player API not found"); })();
})();
