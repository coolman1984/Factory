// Material Flow Player V9 shell: the V8 player's layout and controls on the V9 engine and real factory.
// Top bar (steps toggle, title, paths, process tabs), Steps list with the "From flat plan to factory" opening, the one player
// card (step title and text, timeline with step ticks, previous / play / next, speed), the right icon rail (2D / 3D / Auto,
// camera pad, measure, options, engine numbers, director, Studio, record, help, full screen), the V7 camera pad (Free / Orbit /
// Guided / Ride / Director, sticks, lens, speed, smoothing, presets, shots, + Key, Photo), idle fading, help and keys.
(() => {
"use strict";
const V = window.V9; if (!V) return;
const $ = s => document.querySelector(s), TABS = [["inj1", "INJ 1"], ["inj2", "INJ 2"], ["eps", "EPS"], ["press", "Press"]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, u) => a + (b - a) * u, fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
let A = null; const U = { stepNow: -2, idleT: 0, measure: null, vel: { ox: 0, oy: 0, px: 0, py: 0, zoom: 0, crane: 0 }, speed: 1, smooth: 0.6, lastPlayStep: -1 };

function tip(msg, ms = 3200) { const t = $("#tip"); t.textContent = msg; t.style.display = "block"; clearTimeout(tip.h); tip.h = setTimeout(() => { t.style.display = "none"; }, ms); }
function tabs() {
  const esc = A.esc, tabName = (TABS.find(t => t[0] === V.tab) || [0, V.tab.toUpperCase()])[1];
  $("#lines").innerHTML = TABS.map(([id, n]) => `<button data-tab="${id}" class="${V.tab === id ? "on" : ""}">${n}</button>`).join("");
  $("#flows").innerHTML = V.pack.paths.filter(p => p.tab === V.tab).map(p => `<button data-path="${esc(p.id)}" class="${V.path.id === p.id ? "on" : ""}" title="${esc(p.data.name)}">${esc(p.data.name)}</button>`).join("");
  $("#title").textContent = `${tabName} process · real factory (CAD)`; document.title = `Material Flow Player V9 · ${tabName}`;
}
function introText() { const nObj = V.pack.objects.filter(o => !o.deleted).length, cad = V.pack.cad, n = k => Object.values(cad).filter(l => l.kind === k).reduce((a, l) => a + l.segments.length, 0);
  return `Rebuilt from the AutoCAD drawing in real dimensions: ${nObj} objects, ${n("wall") + n("exterior_wall") + n("partition")} wall pieces, ${n("column")} columns. The factory rises out of the plan.`; }
function steps() {
  const esc = A.esc, cap = V.edit.captions || [];
  $("#list").innerHTML = `<li data-s="-1"><span class="n">★</span><div><b>From flat plan to factory</b><small>The replica rises out of the plan.</small></div></li>` +
    V.steps.map((s, i) => `<li data-s="${i}"><span class="n">${i + 1}</span><div><b>${esc(s.title)}${s.lift ? " ⇅" : ""}</b><small>${esc(cap[i] || "")}</small></div></li>`).join("");
  const sc = $("#scrub"); sc.querySelectorAll("i").forEach(i => i.remove()); for (const s of V.steps.slice(1)) { const i = document.createElement("i"); i.style.left = (100 * s.t0 / Math.max(1, V.total)) + "%"; sc.insertBefore(i, sc.querySelector(".hd")); }
  U.stepNow = -2; }
function curIndex(ps, intro) { return intro ? -1 : ps.step; }
function frame(ps, intro) {
  const i = curIndex(ps, intro), s = V.steps[ps.step], cap = V.edit.captions || [], card = $("#card");
  if (intro) { card.children[0].textContent = "From flat plan to factory"; card.children[1].textContent = introText(); card.children[2].innerHTML = `<span class="m wait">INTRODUCTION</span><span>${V.steps.length} steps · ${fmt(V.total)} trip</span>`; }
  else { const mode = ps.phase === "travel" ? (ps.lift ? "lift" : s.mode === "agv" ? "agv" : "push") : "wait", lbl = { lift: "ELEVATOR " + (s.lift || ""), agv: "AGV", push: "PUSHED BY HAND", wait: "AT THE STOP" }[mode];
    card.children[0].textContent = `${ps.step + 1}. ${s.title}`; card.children[1].textContent = cap[ps.step] || "";
    card.children[2].innerHTML = `<span class="m ${mode}">${lbl}</span>${ps.step && ps.phase === "travel" && !ps.lift ? `<span>${(+s.dist).toFixed(1)} m</span>` : ""}<span>${ps.p[2] > 3 ? "2nd floor" : "1st floor"}</span><span>${ps.dist.toFixed(1)} m so far</span>`; }
  const f = clamp(V.e / Math.max(1, V.total), 0, 1); $("#scrub .fl").style.width = (f * 100) + "%"; $("#scrub .hd").style.left = (f * 100) + "%";
  $("#tElapsed").textContent = fmt(Math.min(V.e, V.total)); $("#tEnd").textContent = fmt(V.total); $("#play").classList.toggle("is-playing", V.playing);
  $("#stepNo").textContent = intro ? "Introduction" : `Step ${ps.step + 1} of ${V.steps.length}`;
  if (U.stepNow !== i) { U.stepNow = i; $("#list").querySelectorAll("li").forEach(li => { const k = +li.dataset.s; li.classList.toggle("now", k === i); li.classList.toggle("done", k < i); }); const now = $("#list li.now"); if (now) now.scrollIntoView({ block: "nearest" }); }
  if ($("#stepstop").checked && V.playing && !intro && ps.step > U.lastPlayStep && U.lastPlayStep >= 0 && V.steps[ps.step]) { V.e = V.steps[ps.step].t0; V.playing = false; }
  U.lastPlayStep = intro ? 0 : ps.step;
  document.querySelectorAll("#rail [data-v]").forEach(b => b.classList.toggle("on", b.dataset.v === (V.view || "auto"))); $("#dirBtn").classList.toggle("on", V.mode === "director");
  document.querySelectorAll("#padMode [data-m]").forEach(b => b.classList.toggle("on", b.dataset.m === V.mode)); if ($("#camSel").value !== V.mode && [...$("#camSel").options].some(o => o.value === V.mode)) $("#camSel").value = V.mode;
  if ($("#pad").style.display === "flex") padRead(); if ($("#engPop").style.display === "block") engine();
}
function rec(on) { $("#rec").classList.toggle("rec", on); }

/* ---------- views: 2D flat plan, 3D, Auto ---------- */
function setView(v) {
  V.view = v; const C = A.CAM;
  if (v === "2d") { if (V.mode !== "plan") U.mode3 = V.mode; C.intro = -1; A.setMode("plan"); }
  else if (v === "3d") { C.intro = -1; V.rise = 1; A.setMode(U.mode3 && U.mode3 !== "plan" ? U.mode3 : "guided"); }
  else { V.rise = 1; A.setMode(U.mode3 && U.mode3 !== "plan" ? U.mode3 : "guided"); if (V.e < 1) A.playIntro(); }
}

/* ---------- camera pad (V7 Studio camera) ---------- */
const mmOf = fov => 12 / Math.tan(fov * Math.PI / 360), fovOf = mm => 2 * Math.atan(12 / mm) * 180 / Math.PI;
function goFree() { if (!["free", "orbit"].includes(V.mode)) { if (V.view === "2d") V.view = "3d"; A.setMode("free"); } }
function padRead() { const C = A.CAM, d = C.eye.clone().sub(C.tgt), r = d.length(), head = ((Math.atan2(d.x, d.z) * 180 / Math.PI) % 360 + 360) % 360, tilt = Math.acos(clamp(d.y / r, -1, 1)) * 180 / Math.PI;
  const name = { free: "Free", orbit: "Orbit", guided: "Guided", chase: "Ride", director: "Director", follow: "Follow", overview: "Overview", plan: "2D plan" }[V.mode] || V.mode;
  $("#padRead").textContent = `${name} · ${r.toFixed(0)} m · heading ${head.toFixed(0)}° · tilt ${(90 - tilt).toFixed(0)}° · ${mmOf(A.camera.fov).toFixed(0)} mm`;
  (V.edit.director?.shots || []).forEach((s, i) => $(`#pad [data-b="${i}"]`)?.classList.toggle("has", !!s)); }
function preset(k) {
  const o = A.orbit; goFree();
  if (k === "top") { o.ph = 0.02; } else if (k === "front") { o.th = 0; o.ph = 1.25; } else if (k === "side") { o.th = Math.PI / 2; o.ph = 1.25; } else if (k === "iso") { o.th = -0.785; o.ph = 0.96; }
  else if (k === "trolley") { o.tgt.copy(V.trolley.position).setY(V.trolley.position.y + 1); o.r = 25; o.ph = Math.min(o.ph, 1.05); }
  else if (k === "reset") { const f = A.planFit(); o.tgt.copy(f.c); o.r = f.r * 0.9; o.th = -0.785; o.ph = 0.96; V.fov = 40; $("#padLens").value = mmOf(40).toFixed(0); }
}
function applySticks(dt) {
  const v = U.vel; if (!(v.ox || v.oy || v.px || v.py || v.zoom || v.crane)) return; goFree();
  const o = A.orbit, sp = U.speed, k = Math.min(dt, 0.1);
  if (v.ox || v.oy) { o.th -= v.ox * 1.7 * sp * k; o.ph = clamp(o.ph + v.oy * 1.1 * sp * k, 0.02, 1.56); }
  if (v.px || v.py || v.crane) { const s = o.r * 0.85 * sp * k, rx = Math.cos(o.th), rz = -Math.sin(o.th), fx = -Math.sin(o.th), fz = -Math.cos(o.th); o.tgt.x += (v.px * rx - v.py * fx) * s; o.tgt.z += (v.px * rz - v.py * fz) * s; o.tgt.y = clamp(o.tgt.y - v.crane * s * 0.6, -2, 60); }
  if (v.zoom) o.r = clamp(o.r * Math.exp(v.zoom * 1.3 * sp * k), 3, 2000);
}
function photo() {
  const R = A.renderer; R.render(A.scene, A.camera); const c = document.createElement("canvas"); c.width = A.canvas.width; c.height = A.canvas.height; const g = c.getContext("2d");
  g.drawImage(A.canvas, 0, 0); const ov = $("#ov"); if (ov) g.drawImage(ov, 0, 0, c.width, c.height);
  const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `v9-${V.path.id}-${fmt(V.e).replace(":", "m")}s.png`; a.click(); tip("Picture saved"); }
function wirePad() {
  const map = { orbit: ["ox", "oy"], pan: ["px", "py"], zoom: [null, "zoom"], crane: [null, "crane"] };
  for (const el of document.querySelectorAll("#pad .stick, #pad .rocker")) {
    const k = el.dataset.k, knob = el.querySelector(".knob"); let id = null;
    const set = e => { const r = el.getBoundingClientRect(), R = el.classList.contains("rocker") ? r.height / 2 - 14 : Math.min(r.width, r.height) / 2 - 16; let dx = (e.clientX - (r.left + r.width / 2)) / R, dy = (e.clientY - (r.top + r.height / 2)) / R; if (el.classList.contains("rocker")) dx = 0; const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; }
      knob.style.transition = "none"; knob.style.transform = `translate(${dx * R}px,${dy * R}px)`; const cv = q => (Math.abs(q) < 0.08 ? 0 : Math.sign(q) * Math.pow((Math.abs(q) - 0.08) / 0.92, 1.5)), [vx, vy] = map[k]; if (vx) U.vel[vx] = cv(dx); U.vel[vy] = cv(dy); };
    const stop = () => { id = null; knob.style.transition = ""; knob.style.transform = ""; const [vx, vy] = map[k]; if (vx) U.vel[vx] = 0; U.vel[vy] = 0; };
    el.addEventListener("pointerdown", e => { e.preventDefault(); id = e.pointerId; el.setPointerCapture(id); set(e); });
    el.addEventListener("pointermove", e => { if (id === e.pointerId) set(e); }); el.addEventListener("pointerup", stop); el.addEventListener("pointercancel", stop); el.addEventListener("lostpointercapture", stop);
  }
  $('#pad .stick[data-k="orbit"]').addEventListener("dblclick", () => preset("iso"));
  addEventListener("blur", () => { for (const q of Object.keys(U.vel)) U.vel[q] = 0; });
  $("#padMode").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (!b) return; camMode(b.dataset.m); });
  const lens = $("#padLens"), spd = $("#padSpeed"), sm = $("#padSmooth"), show = () => { $("#padLensV").textContent = lens.value + " mm"; $("#padSpeedV").textContent = (+spd.value).toFixed(2) + "x"; $("#padSmoothV").textContent = Math.round(sm.value * 100) + "%"; };
  lens.value = mmOf(40).toFixed(0); lens.oninput = () => { V.fov = fovOf(+lens.value); show(); }; spd.oninput = () => { U.speed = +spd.value; show(); }; sm.oninput = () => { U.smooth = +sm.value; V.freeOmega = lerp(36, 1.8, U.smooth); show(); }; V.freeOmega = lerp(36, 1.8, U.smooth); show();
  document.querySelectorAll("#pad [data-p]").forEach(b => b.onclick = () => preset(b.dataset.p));
  document.querySelectorAll("#pad [data-b]").forEach(b => { const i = +b.dataset.b; b.onclick = e => V.studio?.shot?.(i, e.shiftKey); b.oncontextmenu = e => { e.preventDefault(); V.studio?.shot?.(i, true); }; });
  $("#padKey").onclick = e => V.studio?.addKey?.(e.shiftKey); $("#padPhoto").onclick = photo; $("#padClose").onclick = () => togglePop("#pad", false);
}
function camMode(m) { if (m === "director" && !(V.edit.director?.keys || []).length) return tip("No camera keys yet: frame a view and press + Key (K), or open the Studio's Director tab");
  if (V.view === "2d") V.view = "3d"; A.CAM.intro = -1; V.rise = 1; A.setMode(m); }

/* ---------- popups, engine numbers, measure ---------- */
function togglePop(sel, on) { const el = $(sel), show = on ?? (el.style.display !== "flex" && el.style.display !== "block"); for (const s of ["#opts", "#engPop", "#pad", "#help"]) if (s !== sel && s !== "#pad") $(s).style.display = "none";
  el.style.display = show ? (sel === "#engPop" || sel === "#help" ? "block" : "flex") : "none"; $("#camBtn").classList.toggle("on", $("#pad").style.display === "flex"); $("#optBtn").classList.toggle("on", $("#opts").style.display === "flex"); $("#engBtn").classList.toggle("on", $("#engPop").style.display === "block"); }
function engine() {
  const k = V.kpis || {}, trips = k.trip_s ? Math.floor(28800 / k.trip_s) : 0, S = V.studio;
  $("#engPop").innerHTML = `<b>Factory Engine ${A.FE?.ENGINE_VERSION || ""} · ${A.esc(V.edit.name)}</b><div class="kpi">Trip ${fmt(k.trip_s || V.total)} · ${k.distance_m ?? "-"} m (push ${k.push_m ?? "-"} m, AGV ${k.agv_m ?? "-"} m)<br>${k.lift_rides || 0} elevator ride(s) · ${trips} trips per 8 h shift (one trolley)<br>Live clash check: ${S?.clash ? `${S.clash.objects.length} objects, ${S.clash.walls.length} walls` : "-"}<br>${A.esc(V.engineErr || V.engineMsg || "Timed by the engine in this page; every edit re-times the trip.")}<br>${A.OFFLINE ? "Offline file: edits stay in this browser (Studio > Export)." : "Live master data: edits save to the Control Center database."}</div>`; }
function floorPoint(e) { const r = A.canvas.getBoundingClientRect(), v = new A.T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), ray = new A.T.Raycaster(); ray.setFromCamera(v, A.camera);
  const y = (V.ps?.p[2] || 0) > 3 && V.flat < 0.5 ? 6 : 0, o = ray.ray.origin, d = ray.ray.direction; if (Math.abs(d.y) < 1e-6) return null; const t = (y - o.y) / d.y; return t > 0 ? [o.x + d.x * t, -(o.z + d.z * t), y] : null; }
const mov = document.createElement("canvas"); mov.id = "mov"; Object.assign(mov.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: 4 });
function drawMeasure() { const g = mov.getContext("2d"); if (mov.width !== innerWidth || mov.height !== innerHeight) { mov.width = innerWidth; mov.height = innerHeight; } g.clearRect(0, 0, mov.width, mov.height); const M = U.measure; if (!M || !M.a) return;
  const sc = p => { const v = A.P(p[0], p[1], p[2]).project(A.camera); return v.z > 1 ? null : [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, a = sc(M.a), b = M.b ? sc(M.b) : M.hover ? sc(M.hover) : null; if (!a) return;
  g.strokeStyle = "#ffd166"; g.fillStyle = "#ffd166"; g.lineWidth = 3; g.beginPath(); g.arc(a[0], a[1], 5, 0, 7); g.fill(); if (!b) return; g.setLineDash(M.b ? [] : [8, 6]); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(b[0], b[1], 5, 0, 7); g.fill();
  const q = M.b || M.hover, d = Math.hypot(q[0] - M.a[0], q[1] - M.a[1]), t = `${d.toFixed(2)} m`; g.font = "600 13px Segoe UI"; const w = g.measureText(t).width + 16, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; g.fillStyle = "rgba(8,24,56,.9)"; g.fillRect(mx - w / 2, my - 22, w, 20); g.fillStyle = "#fff"; g.fillText(t, mx - w / 2 + 8, my - 7); }

/* ---------- idle fade, scrub, keys ---------- */
function wake() { U.idleT = performance.now(); document.body.classList.remove("idle"); }
function idleCheck() { const busy = !V.playing || V.studioOpen || ["#opts", "#engPop", "#pad", "#help"].some(s => $(s).style.display && $(s).style.display !== "none") || U.measure; if (!busy && performance.now() - U.idleT > 4000) document.body.classList.add("idle"); else if (busy) document.body.classList.remove("idle"); }
function wire() {
  document.addEventListener("click", e => { const b = e.target.closest("button, li[data-s]"); if (!b || b.closest("#studio, #stb, #pad .row, #padMode")) return;
    if (b.dataset.tab) { const p = V.pack.paths.find(x => x.tab === b.dataset.tab); if (p) { A.selectPath(p.id); if (V.view === "2d") A.setMode("plan"); } }
    if (b.dataset.path) { A.selectPath(b.dataset.path); if (V.view === "2d") A.setMode("plan"); }
    if (b.dataset.s != null) { const i = +b.dataset.s; if (i < 0) A.playIntro(); else A.seekStep(i); }
    if (b.dataset.v) setView(b.dataset.v);
    const id = b.id;
    if (id === "play") V.playing = !V.playing; if (id === "prev") step(-1); if (id === "next") step(1);
    if (id === "stepsToggle" || id === "stepsClose") $("#steps").style.display = $("#steps").style.display === "none" ? "" : "none";
    if (id === "camBtn") togglePop("#pad"); if (id === "optBtn") togglePop("#opts"); if (id === "engBtn") { togglePop("#engPop"); engine(); } if (id === "helpBtn") togglePop("#help");
    if (id === "measure") toggleMeasure(); if (id === "dirBtn") camMode(V.mode === "director" ? "guided" : "director"); if (id === "rec") A.record();
    if (id === "full") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    if (id === "lblBtn") labels(); if (id === "netBtn") { if (V.studio) V.studio.allPaths = !V.studio.allPaths; b.classList.toggle("on", !!V.studio?.allPaths); }
    if (id === "planBtn") { V.planFloor = !V.planFloor; b.classList.toggle("on", V.planFloor); } if (id === "arrowBtn") { V.floorArrows = !V.floorArrows; b.classList.toggle("on", V.floorArrows); A.retime(); }
    if (id === "miniBtn") { const m = $("#mini"); m.style.display = m.style.display === "block" ? "none" : "block"; b.classList.toggle("on", m.style.display === "block"); V.miniBox = null; }
    if (id === "blurBtn") { document.body.classList.toggle("blur"); b.classList.toggle("on"); } });
  $("#eng").onclick = () => { togglePop("#engPop"); engine(); };
  $("#camSel").onchange = e => camMode(e.target.value); $("#flySel").onchange = e => { if (e.target.value) { if (V.view === "2d") V.view = "3d"; A.fly(e.target.value); } e.target.value = ""; }; $("#f2Sel").onchange = e => { V.floor2 = e.target.value; };
  $("#speed").onchange = e => { V.speed = +e.target.value; };
  const sc = $("#scrub"); let drag = false; const seek = e => { const r = sc.getBoundingClientRect(); V.e = clamp((e.clientX - r.left) / r.width, 0, 1) * V.total; A.CAM.intro = -1; V.rise = 1; };
  sc.addEventListener("pointerdown", e => { drag = true; sc.setPointerCapture(e.pointerId); seek(e); }); sc.addEventListener("pointermove", e => { if (drag) seek(e); }); sc.addEventListener("pointerup", () => { drag = false; });
  A.canvas.addEventListener("click", e => { if (!U.measure || V.studioOpen) return; const p = floorPoint(e); if (!p) return; if (!U.measure.a || U.measure.b) U.measure = { a: p, b: null }; else { U.measure.b = p; tip(`Distance: ${Math.hypot(p[0] - U.measure.a[0], p[1] - U.measure.a[1]).toFixed(2)} m (click again for a new measurement, M to stop)`, 5000); } });
  A.canvas.addEventListener("pointermove", e => { if (U.measure?.a && !U.measure.b) U.measure.hover = floorPoint(e); });
  for (const ev of ["pointermove", "pointerdown", "keydown", "wheel"]) addEventListener(ev, wake, { passive: true });
  addEventListener("keydown", e => {
    const t = e.target; if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return; const k = e.key; let act = null;
    if (k === " ") act = () => { V.playing = !V.playing; }; else if (k === "ArrowRight") act = () => step(1); else if (k === "ArrowLeft") act = () => step(-1);
    else if (k === "Home") act = () => A.playIntro(); else if (k === "End") act = () => { V.e = V.total; A.CAM.intro = -1; V.rise = 1; };
    else if (k === "2") act = () => setView("2d"); else if (k === "3") act = () => setView("3d"); else if (k === "a" || k === "A") act = () => setView("auto");
    else if (k === "g") act = () => camMode("guided"); else if (k === "c") act = () => togglePop("#pad"); else if (k === "d") act = () => camMode("director"); else if (k === "o") act = () => camMode("free");
    else if (k === "m") act = toggleMeasure; else if (k === "l") act = labels; else if (k === "n") act = () => $("#netBtn").click(); else if (k === "p") act = () => $("#stepsToggle").click();
    else if (k === "[" || k === "]") act = () => { const o = [...$("#speed").options], i = clamp(o.findIndex(x => +x.value === V.speed) + (k === "]" ? 1 : -1), 0, o.length - 1); V.speed = +o[i].value; $("#speed").value = o[i].value; tip(`Speed ${o[i].text}`, 1200); };
    else if (k === "r") act = () => A.record(); else if (k === "f") act = () => $("#full").click(); else if (k === "h") act = () => document.body.classList.toggle("bare"); else if (k === "?") act = () => togglePop("#help");
    else if (k === "k" && !V.studioOpen) act = () => V.studio?.addKey?.(e.shiftKey);
    else if (k === "Escape") act = () => { for (const s of ["#opts", "#engPop", "#help"]) $(s).style.display = "none"; if (U.measure) toggleMeasure(); document.body.classList.remove("bare"); };
    if (act) { e.preventDefault(); act(); } });
}
function step(d) { const C = A.CAM, intro = V.mode === "guided" && C.intro >= 0, i = intro ? -1 : V.ps.step;
  if (d > 0) { if (i + 1 < V.steps.length) A.seekStep(i + 1); }
  else { const s = V.steps[i]; if (i <= 0) A.playIntro(); else if (V.e > s.t0 + 2) A.seekStep(i); else A.seekStep(i - 1); } }
function toggleMeasure() { U.measure = U.measure ? null : { a: null, b: null }; $("#measure").classList.toggle("on", !!U.measure); if (U.measure) tip("Measure: click two points on the floor", 3000); }
function labels() { V.labels = !V.labels; $("#lblBtn").classList.toggle("on", V.labels); A.scene.traverse(o => { if (o.userData.label) o.visible = V.labels; }); }

V.ui = { tabs: () => A && tabs(), steps: () => A && steps(), frame, tip, rec };
V.hooks.ready.push(() => { A = V.api; document.body.appendChild(mov); wirePad(); wire(); V.planFloor = false; V.floorArrows = false; U.idleT = performance.now(); });
V.hooks.built = V.hooks.built || []; V.hooks.built.push(() => { tabs(); steps(); wake(); });
V.hooks.frame.push(dt => { applySticks(dt); drawMeasure(); idleCheck(); });
})();
