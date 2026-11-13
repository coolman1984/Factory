/* Material Flow V8.1-V8.3: Engine panel. Shows what the Factory Engine says at the current story time (lot, trolley, step,
   events, fingerprint); the Shift run (V8.2; V8.3: drawn returns, measured times, aisle/crossing traffic); and the Layout journal
   (V8.3): every scene the Studio publishes goes to the engine as a checked command; refused edits are rolled back; engine-level
   undo/redo. Toggle: the "Engine" button (bottom left) or Alt+E. */
(function () {
"use strict";
const css = `#fe-btn{position:fixed;left:12px;bottom:12px;z-index:40;font:600 12px/1 system-ui,Segoe UI,sans-serif;color:#e8f1ff;background:#0d1626cc;border:1px solid #ffffff2e;border-radius:999px;padding:7px 12px;cursor:pointer;backdrop-filter:blur(8px)}
#fe-btn:hover{background:#16243bdd}#fe-btn i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#3fb950;margin-right:6px;vertical-align:0}#fe-btn.bad i{background:#f85149}
#fe-panel{position:fixed;left:12px;bottom:46px;z-index:40;width:400px;max-height:58vh;overflow:auto;font:12px/1.45 system-ui,Segoe UI,sans-serif;color:#dfe8f5;background:#0b1320e6;border:1px solid #ffffff26;border-radius:12px;padding:10px 12px;display:none;backdrop-filter:blur(10px);box-shadow:0 8px 30px #0008}
#fe-panel h3{margin:0 0 6px;font-size:13px;color:#fff}#fe-panel .k{color:#8ea3bd}#fe-panel table{width:100%;border-collapse:collapse;margin-top:6px}#fe-panel td{padding:1px 4px 1px 0;vertical-align:top;white-space:nowrap}
#fe-panel td.e{white-space:normal;color:#b9c7da}#fe-panel .fp{font-family:Consolas,monospace;color:#9ecbff}#fe-panel .err{color:#ff8a80}
#fe-panel input{background:#0f1b2d;color:#e8f1ff;border:1px solid #ffffff33;border-radius:6px;padding:2px 4px;font:inherit}#fe-panel button#fe-go{background:#1f6feb;color:#fff;border:0;border-radius:6px;padding:4px 14px;cursor:pointer;font:600 12px system-ui}
#fe-panel #fe-out{font-size:11px}#fe-panel #fe-out table td{padding-right:7px}#fe-panel details{margin-top:8px;border-top:1px solid #ffffff1f;padding-top:6px}#fe-panel summary{cursor:pointer;color:#fff;font-weight:600}
#fe-panel button.fe-b{background:#22324b;color:#e8f1ff;border:1px solid #ffffff33;border-radius:6px;padding:2px 9px;cursor:pointer;font:12px system-ui;margin:4px 4px 0 0}#fe-panel button.fe-b:disabled{opacity:.4;cursor:default}
#fe-panel .ok{color:#7ee787}#fe-mt input{width:46px}#fe-mt td{padding:1px 3px 1px 0}`;
function start() {
  const MF = window.MF, B = window.MFEngine; if (!MF || !MF.D || !MF.S || !B) return false;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const btn = document.createElement("button"); btn.id = "fe-btn"; btn.type = "button"; btn.title = "Factory Engine (Alt+E)"; btn.innerHTML = "<i></i>Engine"; document.body.appendChild(btn);
  const panel = document.createElement("div"); panel.id = "fe-panel"; panel.setAttribute("role", "region"); panel.setAttribute("aria-label", "Factory Engine"); document.body.appendChild(panel);
  const trip = document.createElement("div"), shift = document.createElement("div"), jr = document.createElement("div"); shift.id = "fe-shift"; jr.id = "fe-journal"; panel.append(trip, shift, jr);
  const project = (window.MF7 && window.MF7.id) || window.MF_PROJECT || (MF.D && MF.D.title) || "project", timesKey = "fe:times:" + project;
  const loadTimes = () => { try { return JSON.parse(localStorage.getItem(timesKey) || "{}") || {}; } catch (e) { return {}; } };
  let times = loadTimes();
  const download = (name, obj) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const flow = () => MF.D.flows[MF.S.flow], data = () => B.infoFor(flow());
  const detail = (e, d) => e.type === "leg.start" ? "to " + (d.names[e.to] || e.to) : e.type === "leg.arrive" ? "at " + (d.names[e.at] || e.at) : e.type === "load.end" ? "lot loaded" : e.type === "unload.end" ? "lot unloaded at " + (d.names[e.to] || e.to) : e.type === "mark" ? e.type + " " + (e.ref ?? "") : e.mission || "";
  /* Shift run (V8.2): all paths of this tab together for a shift on the engine; the form is static, results replace the table. */
  shift.innerHTML = `<details id="fe-sh"><summary>Shift run (all paths of this tab)</summary>
<div style="display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px 8px;margin:6px 0;align-items:center">
<label class="k" for="fe-h">Hours</label><input id="fe-h" type="number" min="0.5" max="24" step="0.5" value="8" style="width:60px">
<label class="k" for="fe-n">Trolleys/path</label><input id="fe-n" type="number" min="0" max="20" step="1" value="0" title="0 = as in the scene" style="width:60px">
<label class="k" for="fe-c">Lift cars</label><input id="fe-c" type="number" min="1" max="6" step="1" value="1" style="width:60px">
<label class="k" for="fe-s">Spread %</label><input id="fe-s" type="number" min="0" max="50" step="5" value="0" title="assumed travel/wait variability" style="width:60px">
<label class="k" for="fe-r">Empty return</label><input id="fe-r" type="checkbox" checked>
<label class="k" for="fe-a" title="0 = no traffic rules. N = every 2 m of a crossing or aisle shared by different paths takes N trolleys at a time">Aisle cap</label><input id="fe-a" type="number" min="0" max="4" step="1" value="0" style="width:60px">
<span></span><span></span><span></span><button id="fe-go" type="button" style="justify-self:end">Run</button></div>
<details id="fe-mtd" style="border:0;margin:0;padding:0"><summary class="k" style="font-weight:400">Measured times (per path, seconds; blank = not measured)</summary><div id="fe-mt"></div>
<button class="fe-b" id="fe-mts" type="button">Save</button><button class="fe-b" id="fe-mte" type="button">Export</button><label class="fe-b" style="display:inline-block">Import<input id="fe-mti" type="file" accept=".json,application/json" style="display:none"></label><span id="fe-mtn" class="k"></span></details>
<div id="fe-out" class="k">Each trolley repeats its path; elevators are shared by all paths. Empty return: a path named "... return ..." from the end back to the start is used as drawn; otherwise the loaded route reversed (estimated). Measured times replace the geometric ones. "Today" = shift / one-way trip time x trolleys.</div></details>`;
  const $ = id => shift.querySelector("#" + id);
  // measured-times editor: one row per loaded path (drawn return paths are not loaded paths)
  const FIELDS = [["trip_s", "trip"], ["return_s", "return"], ["load_s", "load"], ["unload_s", "unload"]];
  function renderTimes() {
    const { isReturn } = B.returnRoutes(MF.D);
    $("fe-mt").innerHTML = `<table><tr class="k"><td>path</td>${FIELDS.map(f => `<td>${f[1]}</td>`).join("")}</tr>${MF.D.flows.filter(f => !isReturn.has(f.id)).map(f => `<tr><td class="e" style="max-width:110px">${esc(f.name || f.id)}</td>${FIELDS.map(([k]) => `<td><input data-p="${esc(f.id)}" data-k="${k}" type="number" min="0" step="0.1" value="${times[f.id] && times[f.id][k] > 0 ? times[f.id][k] : ""}"></td>`).join("")}</tr>`).join("")}</table>`;
  }
  const readTimes = () => { const t = {}; for (const i of shift.querySelectorAll("#fe-mt input")) { const v = +i.value; if (v > 0) (t[i.dataset.p] ||= {})[i.dataset.k] = v; } return t; };
  $("fe-mtd").addEventListener("toggle", () => { if ($("fe-mtd").open) renderTimes(); });
  $("fe-mts").onclick = () => { times = readTimes(); try { localStorage.setItem(timesKey, JSON.stringify(times)); $("fe-mtn").textContent = " saved in this browser"; } catch (e) { $("fe-mtn").textContent = " could not save: " + e.message; } };
  $("fe-mte").onclick = () => download(project + ".times.json", { [project]: readTimes() });
  $("fe-mti").onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(txt => { const o = JSON.parse(txt); times = o[project] || o; localStorage.setItem(timesKey, JSON.stringify(times)); renderTimes(); $("fe-mtn").textContent = " imported"; }).catch(err => { $("fe-mtn").textContent = " import failed: " + err.message; }); };
  function runShiftUI(extra) {
    if ($("fe-mtd").open) times = readTimes();
    const n = +$("fe-n").value, opts = { hours: +$("fe-h").value || 8, liftCars: Math.max(1, +$("fe-c").value || 1), spread: Math.min(.5, Math.max(0, (+$("fe-s").value || 0) / 100)), returnTrip: $("fe-r").checked, trolleys: n > 0 ? () => n : undefined,
      aisleCapacity: Math.max(0, Math.floor(+$("fe-a").value || 0)), times, ...(extra || {}) };
    const t0 = performance.now(); let r; try { r = B.runShift(MF.D, opts); } catch (e) { $("fe-out").innerHTML = `<span class="err">${esc(e.message)}</span>`; return null; }
    const ms = performance.now() - t0;
    const src = p => (p.timeSource === "measured" ? "M" : "G") + "/" + ({ drawn: "D", estimated: "E", measured: "M", none: "-" })[p.returnSource];
    $("fe-out").innerHTML = `<table><tr class="k"><td>path</td><td title="trolleys">trl</td><td title="trips in the shift on the engine">engine trips</td><td title="shift / one-way trip time x trolleys">today</td><td title="mean trip cycle incl. return and waits">cycle s</td><td title="lift wait per trip">lift s</td><td title="traffic wait per trip (shared crossings and aisles)">traffic s</td><td title="times: M measured / G geometric; return: D drawn / E estimated / M measured / - none">src</td></tr>${r.paths.map(p => `<tr><td class="e" style="min-width:120px;max-width:150px">${esc(p.name)}</td><td>${p.trolleys}</td><td><b>${p.trips}</b></td><td>${p.naive}</td><td>${p.meanCycle == null ? "-" : p.meanCycle.toFixed(0)}</td><td>${p.liftWaitPerTrip == null ? "-" : p.liftWaitPerTrip.toFixed(1)}</td><td>${p.trafficWaitPerTrip == null ? "-" : p.trafficWaitPerTrip.toFixed(1)}</td><td>${src(p)}</td></tr>`).join("")}</table>
<div>${r.lifts.map(l => `${esc(l.id.replace(/^lift:/, ""))}: ${l.cars} car(s), busy ${(l.busy * 100).toFixed(1)}%`).join(" &middot; ") || "no lift used"}</div>
${r.aisleCapacity ? `<div>${r.zones.length} shared section(s), ${r.aisleCapacity} trolley(s) per 2 m: ${r.zones.slice(0, 3).map(z => `~${z.metres} m on ${esc(z.plate)} (${z.paths.length} paths) waits ${z.wait_s.toFixed(0)} s`).join(" &middot; ") || "none"}</div>` : ""}
<div class="k">${r.hours} h in ${ms.toFixed(0)} ms &middot; ${r.events} events &middot; invariants ${r.invariants.length ? '<span class="err">' + esc(r.invariants.join("; ")) + "</span>" : "OK"} &middot; <span class="fp">${esc(r.fingerprint)}</span></div>`;
    return r;
  }
  $("fe-go").onclick = () => runShiftUI();

  /* Layout journal (V8.3): the Studio publishes every committed scene through MFS.setScene (edit, undo, redo, load); the engine
     journal receives each one as a doc.edit command, checks it (scene validator + every path still plays on the engine) and
     refuses an edit that adds a problem: the Studio is then rolled back to the last accepted scene. */
  const clone = o => JSON.parse(JSON.stringify(o));
  let JR = null, jnote = "", busy = false, live = null, lastEngine = [], firstScene = null;
  const engineProblems = () => MF.D.flows.flatMap(f => { const d = B.infoFor(f); return d && !d.ok ? [`path ${f.name || f.id}: cannot play on the engine (${d.error})`] : []; });
  const sceneLayout = () => ({ project, plates: MF.D.plates || {}, elevators: MF.D.elevators || (MF.D.elevator ? [MF.D.elevator] : []), replica: window.MF7 && window.MF7.baseReplica ? clone(window.MF7.baseReplica) : null });
  const validate = (sc, which) => {
    const out = []; try { const v = window.MFScene.validate(clone(sc), sceneLayout()); for (const e of (v && v.errors) || []) out.push(`${e.where}: ${e.msg}`); } catch (e) { out.push("scene check failed: " + e.message); }
    if (which === "next" && live) out.push(...live); if (which === "prev") out.push(...lastEngine); return out;
  };
  const publish = (sc, how) => { busy = true; try { window.MFX.replaceScene(sc, how); } finally { busy = false; } if (!JR.same(window.MFS.scene)) JR.edit(clone(window.MFS.scene), "studio normalisation"); };
  function record(sc) {
    if (!JR || JR.same(sc)) return;
    live = engineProblems();
    const r = JR.isUndoOf(sc) ? JR.undo() : JR.isRedoOf(sc) ? JR.redo() : JR.edit(clone(sc), JR.partOf(sc, "undo") ? "Studio undo" : JR.partOf(sc, "redo") ? "Studio redo" : "Studio edit");
    if (r.ok) { lastEngine = live; jnote = ""; } else { jnote = "Refused: " + r.reason; live = null; publish(JR.J.current, "engine refused the edit"); lastEngine = engineProblems(); if (window.MF.x && window.MF.x.tip) window.MF.x.tip("Factory Engine refused the edit: " + r.reason); }
    live = null; renderJournal();
  }
  function startJournal() {
    const S = window.MFS, X = window.MFX; if (JR || !S || !X || !X.replaceScene || !window.MFScene || !S.scene) return false;
    firstScene = clone(X.toScene ? X.toScene() : S.scene); JR = B.makeJournal(clone(firstScene), { validate });   // the Studio's own form of the scene, so its undo is recognised lastEngine = engineProblems();
    const orig = S.setScene; S.setScene = function (sc) { const r = orig.apply(this, arguments); if (!busy) { try { record(sc); } catch (e) { console.error("[Factory Engine] journal:", e); } } return r; };
    renderJournal(); return true;
  }
  function engineStep(kind) {
    if (!JR) return null; live = null; const r = kind === "undo" ? JR.undo() : JR.redo();
    if (r.ok) { publish(JR.J.current, "engine " + kind); lastEngine = engineProblems(); jnote = ""; } else jnote = r.reason;
    renderJournal(); return r;
  }
  function renderJournal() {
    if (!JR) { jr.innerHTML = `<details><summary>Layout journal</summary><div class="k">Waiting for the Studio scene...</div></details>`; return; }
    const open = jr.querySelector("details") && jr.querySelector("details").open, h = JR.J.history().slice(-6).reverse();
    jr.innerHTML = `<details${open ? " open" : ""}><summary>Layout journal (Studio edits as engine commands)</summary>
<div><span class="k">Revision</span> ${JR.J.revision} &middot; <span class="k">hash</span> <span class="fp">${esc(JR.J.hash)}</span></div>
${jnote ? `<div class="err">${esc(jnote)}</div>` : `<div class="ok">Every edit is checked by the scene validator and the engine.</div>`}
<table>${h.map(e => `<tr><td>r${e.rev}</td><td>${esc(e.type.replace("doc.", ""))}</td><td class="e">${esc(e.label)} (${e.ops} change${e.ops === 1 ? "" : "s"})</td></tr>`).join("") || `<tr><td class="k">no edits yet</td></tr>`}</table>
<button class="fe-b" id="fe-ju" type="button"${JR.J.canUndo() ? "" : " disabled"}>Undo (engine)</button><button class="fe-b" id="fe-jd" type="button"${JR.J.canRedo() ? "" : " disabled"}>Redo (engine)</button><button class="fe-b" id="fe-jx" type="button">Export journal</button></details>`;
    jr.querySelector("#fe-ju").onclick = () => engineStep("undo"); jr.querySelector("#fe-jd").onclick = () => engineStep("redo");
    jr.querySelector("#fe-jx").onclick = () => download(project + ".journal.json", JR.J.state());
  }
  renderJournal(); (function waitStudio(n) { if (!startJournal() && n < 300) setTimeout(() => waitStudio(n + 1), 200); })(0);
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
    shift: opts => B.runShift(MF.D, opts || {}), shiftUI: extra => { toggle(true); $("fe-sh").open = true; return runShiftUI(extra); },
    journal: () => JR && { revision: JR.J.revision, hash: JR.J.hash, history: JR.J.history(), note: jnote, canUndo: JR.J.canUndo(), canRedo: JR.J.canRedo(), verified: JR.J.verify(firstScene) },
    journalUndo: () => engineStep("undo"), journalRedo: () => engineStep("redo"), times: () => times,
    summary: () => MF.D.flows.map(f => { const d = B.infoFor(f); return d && d.ok ? { id: f.id, ok: true, steps: d.steps, total: d.total, fingerprint: d.fingerprint, events: d.log.length } : { id: f.id, ok: false, error: d ? d.error : "no engine data" }; }) };
  render(); return true;
}
let tries = 0; (function wait() { if (start()) return; if (++tries < 600) setTimeout(wait, 100); else console.error("[Factory Engine] panel: player API not found"); })();
})();
