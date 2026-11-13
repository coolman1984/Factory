  /* ---------- player UI ---------- */
  const scrub = $("scrub"), fill = scrub.querySelector(".fl"), hd = scrub.querySelector(".hd");
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const card = $("card"), stepPanel = $("steps"), list = $("list"), timeLabel = $("time"), playButton = $("play"), stackControl = $("stack"), elapsedLabel = $("tElapsed"), endLabel = $("tEnd"), stepCount = $("stepNo");
  card.style.contain = stepPanel.style.contain = "layout paint";
  // The card lives inside the glass bar: a centred title and subtitle, then one quiet line of facts.
  let cardCache;
  const buildCards = () => cardCache = D.flows.map(f => f.items.map(cur => {
    const e = document.createElement("div"); e.style.display = "none";
    const stat = cur.s.intro ? "" : `<div class="st"><span class="m ${cur.s.mode}">${cur.s.mode === "auto" ? "Auto" : cur.s.lift ? "Elevator" : "Step"}</span><span>${cur.metres ? cur.metres.toFixed(0) + " m this step" : cur.s.lift ? "Between floors" : "At this point"}</span><span>${(cur.run || 0).toFixed(0)} m so far</span></div>`;
    e.innerHTML = `<b>${cur.s.intro ? "" : cur.i + ". "}${cur.s.title}</b><p>${cur.s.what}</p>${stat}`;
    return e;
  }));
  buildCards();
  let stepRows = [], stepTop = [], stepBottom = [], panelHeight = 0, panelScroll = 0, shown = -1, shownCard = null;
  stepPanel.addEventListener("scroll", () => { panelScroll = stepPanel.scrollTop; }, { passive: true });
  function cacheStepLayout() { panelHeight = stepPanel.clientHeight; panelScroll = stepPanel.scrollTop; for (let i = 0; i < stepRows.length; i++) { stepTop[i] = stepRows[i].offsetTop; stepBottom[i] = stepTop[i] + stepRows[i].offsetHeight; } }
  function renderFlow() {
    $("title").textContent = D.slide.title; document.querySelector(".tag")?.toggleAttribute("hidden", !!D.orderConfirmed);
    $("flows").innerHTML = D.flows.map((f, i) => `<button data-f="${i}" class="${i === S.flow ? "on" : ""}" aria-pressed="${i === S.flow}">${f.name}</button>`).join("");
    $("flows").querySelectorAll("button").forEach(b => b.onclick = () => setFlow(+b.dataset.f));
    $("flows").querySelector('.on')?.scrollIntoView({block:'nearest',inline:'nearest'});
    const f = F(); scrub.querySelectorAll("i").forEach(e => e.remove());
    f.items.forEach(it => { const m = document.createElement("i"); m.style.left = it.tm / f.total * 100 + "%"; m.setAttribute("aria-hidden", "true"); scrub.append(m); });
    endLabel.textContent = fmt(f.total); renderStep.progress = renderStep.seconds = renderStep.step = null; scrub.setAttribute("aria-valuemax", String(Math.round(f.total)));
    list.innerHTML = f.items.map(it => `<li data-i="${it.i}" tabindex="0" role="button"><span class="n">${it.s.intro ? "&#9733;" : it.i}</span><span><b>${it.s.title}</b><small>${it.s.intro ? "The replica rises out of the plan." : it.s.what}</small></span></li>`).join("");
    stepRows = Array.from(list.querySelectorAll("li")); stepTop = new Array(stepRows.length); stepBottom = new Array(stepRows.length);
    stepRows.forEach((row, i) => { row.onclick = () => { seek(f.items[i].tm); pause(); }; row.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); row.onclick(); } }; });
    if (shownCard) shownCard.style.display = "none"; shownCard = null; shown = -1; card.replaceChildren(...cardCache[S.flow]); cacheStepLayout();
  }
  function renderStep() {
    const f = F(), cur = frameLot.it, progress = Math.round(S.t / f.total * 10000), seconds = Math.floor(S.t);
    if (renderStep.progress !== progress) { fill.style.width = hd.style.left = progress / 100 + "%"; renderStep.progress = progress; }
    if (renderStep.seconds !== seconds || renderStep.flow !== S.flow || renderStep.step !== cur.i) {
      timeLabel.textContent = `${fmt(S.t)} / ${fmt(f.total)}  step ${cur.i}/${f.items.length - 1}`; elapsedLabel.textContent = fmt(S.t); stepCount.textContent = cur.s.intro ? "Introduction" : `Step ${cur.i} of ${f.items.length - 1}`;
      scrub.setAttribute("aria-valuenow", String(seconds)); scrub.setAttribute("aria-valuetext", `${fmt(S.t)} of ${fmt(f.total)}, ${cur.s.intro ? "introduction" : `step ${cur.i} of ${f.items.length - 1}: ${cur.s.title}`}`);
      renderStep.seconds = seconds; renderStep.flow = S.flow; renderStep.step = cur.i;
    }
    if (renderStep.playing !== S.playing) { playButton.classList.toggle("is-playing", S.playing); playButton.setAttribute("aria-label", S.playing ? "Pause" : "Play"); playButton.setAttribute("aria-pressed", String(S.playing)); renderStep.playing = S.playing; }
    if (shown !== cur.i) {
      shown = cur.i;
      for (let i = 0; i < stepRows.length; i++) stepRows[i].className = i === cur.i ? "now" : i < cur.i ? "done" : "";
      if (shownCard) shownCard.style.display = "none"; shownCard = cardCache[S.flow][cur.i]; shownCard.style.display = "block";
      if (S.panel && !bareOn && panelHeight) {
        if (stepTop[cur.i] < panelScroll) panelScroll = stepTop[cur.i]; else if (stepBottom[cur.i] > panelScroll + panelHeight) panelScroll = stepBottom[cur.i] - panelHeight;
        stepPanel.scrollTop = panelScroll;
      }
    }
  }
  function seek(t) { guidedReady = false; setWant.chaseReady = false; S.t = clamp(t, 0, F().total); cine.shot=""; cine.cut=true; last = performance.now(); SIGHT.reset(); }
  function play() { if (S.t >= F().total) seek(0); S.playing = true; last = performance.now(); }
  function pause() { S.playing = false; }
  function stepBy(d) { const f = F(), c = stepAt(S.t), atEnd = S.t >= c.tm - .01, i = clamp(c.i + (d > 0 ? (atEnd ? 1 : 0) : (S.t > c.t0 + 1 && !atEnd ? 0 : -1)), 0, f.items.length - 1); seek(f.items[i].tm); pause(); }
  function setFlow(i) { S.flow = i; E = D.flows[i].E || E; shown = -1; seek(0); pause(); renderFlow(); try { prefetchAisles(i); } catch (e) { console.warn("aisle prefetch", e); } }
  function setView(v) { S.view = v; S.stackUser = null; $("views").querySelectorAll("button").forEach((b) => { b.classList.toggle("on", b.dataset.v === v); b.setAttribute("aria-pressed", String(b.dataset.v === v)); }); if (S.cam === "free") setCam("guided"); }
  function setCam(c) { if(c==="forklift"&&!REP.movers.length)c="guided"; S.cam = c; $("cam").value = c; $("cam").querySelector('[value="free"]').hidden = c !== "free"; }
  function setPlan(p) { S.plan = p; $("planBtn").textContent = p === "replica" ? "Plan: replica" : "Plan: original"; }
  function tip(m) { const e = $("tip"); e.textContent = m; e.style.display = "block"; clearTimeout(tip.t); tip.t = setTimeout(() => (e.style.display = "none"), 1900); }
  function toFree() { if (S.cam !== "free") { setCam("free"); tip("Free camera: press G to go back to the guided camera"); } }
  function setMeasure(on) { S.measure = on; S.pts = []; $("measure").classList.toggle("on", on); $("measure").setAttribute("aria-pressed", String(on)); if (on) tip("Measure: click two points on the floor"); }
  $("play").onclick = () => (S.playing ? pause() : play()); $("prev").onclick = () => stepBy(-1); $("next").onclick = () => stepBy(1); $("first").onclick = () => { seek(0); pause(); };
  // Playback speed: the native #speed select stays the one source of truth (0.5 .. 8x). [ and ] step through its options with
  // bounds (no wrap); the select shows the new value, keeps focus state and is not re-created.
  const speedSelect = $("speed"), speedOptions = Array.from(speedSelect.options);
  function setSpeed(v, say) {
    let best = 0; for (let i = 1; i < speedOptions.length; i++) if (Math.abs(+speedOptions[i].value - v) < Math.abs(+speedOptions[best].value - v)) best = i;
    S.speed = +speedOptions[best].value; speedSelect.selectedIndex = best;
    if (say) tip("Speed " + speedOptions[best].textContent);
  }
  function stepSpeed(d) {
    let at = 0; for (let i = 1; i < speedOptions.length; i++) if (Math.abs(+speedOptions[i].value - S.speed) < Math.abs(+speedOptions[at].value - S.speed)) at = i;
    const next = clamp(at + d, 0, speedOptions.length - 1);
    if (next === at) { tip(d > 0 ? "Top speed " + speedOptions[at].textContent : "Lowest speed " + speedOptions[at].textContent); return; }
    setSpeed(+speedOptions[next].value, true);
  }
  speedSelect.onchange = (e) => setSpeed(+e.target.value); $("stepstop").onchange = (e) => (S.stepStop = e.target.checked);
  $("views").querySelectorAll("button").forEach((b) => (b.onclick = () => setView(b.dataset.v)));
  $("cam").onchange = (e) => setCam(e.target.value); $("look").onchange = (e) => setLook(e.target.value); $("quality").onchange = (e) => setQuality(e.target.value);
  $("focusBtn").onclick = () => { S.focus = !S.focus; $("focusBtn").classList.toggle("on", S.focus); };
  $("soundBtn").onclick = () => { S.sound = !S.sound; $("soundBtn").classList.toggle("on", S.sound); if (S.sound) audio(); };
  $("planBtn").onclick = () => setPlan(S.plan === "replica" ? "original" : "replica"); $("measure").onclick = () => setMeasure(!S.measure);
  $("stack").oninput = (e) => (S.stackUser = e.target.value / 100);
  const tog = (id, k, fn) => { const f = () => { S[k] = !S[k]; $(id).classList.toggle("on", S[k]); $(id).setAttribute("aria-pressed", String(S[k])); fn && fn(); }; $(id).onclick = f; return f; };
  let bareOn = false, lastActive = performance.now(), faded = false;
  // Hidden UI must not be clickable or focusable: opacity and pointer-events on the .ui parent are not enough (a child can
  // set pointer-events:auto, and hidden controls stay in the tab order). H hides every .ui; idle hides all but help/tip/err.
  const uiPanels = Array.from(document.querySelectorAll(".ui")), UI_ALWAYS = ["help", "tip", "err"];
  function syncUiHidden() {
    for (let i = 0; i < uiPanels.length; i++) {
      const el = uiPanels[i], hide = bareOn || (faded && !UI_ALWAYS.includes(el.id));
      if (el.inert !== hide) { el.inert = hide; if (hide && el.contains(document.activeElement)) document.activeElement.blur(); }
    }
  }
  const tLbl = tog("lblBtn", "labels"), tNet = tog("netBtn", "net");
  // Steps list: collapsed by default; the rail/top-bar toggle, P and the Options entry all drive the same state.
  const tPanel = tog("panelBtn", "panel", () => { stepPanel.style.display = S.panel ? "block" : "none"; $("stepsToggle").classList.toggle("on", S.panel); $("stepsToggle").setAttribute("aria-expanded", String(S.panel)); if (S.panel) { frame.shift = -1; cacheStepLayout(); shown = -1; } else frame.shift = -1; });
  const tMini = tog("miniBtn", "mini", () => { $("mini").style.display = S.mini ? "block" : "none"; drawMini.last = null; });
  tog("blurBtn", "blur", () => { syncQualityClasses(); if (S.blur && S.quality === "low") tip("Glass blur stays off on Low quality"); });
  const tRoof = tog("roofBtn", "roof", () => { applyRoof(); if (!hasRoof()) tip("The roof is not available in this build"); });
  $("stepsToggle").onclick = tPanel; $("stepsClose").onclick = tPanel;
  // Glass popovers beside the rail: Options and Camera. One open at a time; Escape or an outside click closes them.
  const popovers = [["opts", "optBtn", "flex"], ["camPop", "camBtn", "flex"]];
  function closePopovers(except) { for (const [id, btn, show] of popovers) if (id !== except) { $(id).style.display = "none"; $(btn).classList.remove("on"); $(btn).setAttribute("aria-expanded", "false"); } }
  for (const [id, btn, show] of popovers) $(btn).onclick = (e) => { e.stopPropagation(); const open = $(id).style.display !== show; closePopovers(open ? id : null); $(id).style.display = open ? show : "none"; $(btn).classList.toggle("on", open); $(btn).setAttribute("aria-expanded", String(open)); };
  addEventListener("pointerdown", (e) => { if (!e.target.closest("#opts,#camPop,#rail,#help")) closePopovers(null); });
  $("zi").onclick = () => zoom(.8); $("zo").onclick = () => zoom(1.25);
  const toggleHelp = () => { const h = $("help"); const open = h.style.display !== "block"; h.style.display = open ? "block" : "none"; $("helpBtn").classList.toggle("on", open); $("helpBtn").setAttribute("aria-expanded", String(open)); }; $("helpBtn").onclick = toggleHelp;
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()); $("full").onclick = fullscreen;
  function zoom(k) { if (window.MFX) return window.MFX.zoom(k); toFree(); S.c.dist = clamp(S.c.dist * k, 30, 4000); }
  const toggleBare = () => { bareOn = !bareOn; document.body.classList.toggle("bare", bareOn); if (bareOn) closePopovers(null); syncUiHidden(); frame.shift = -1; };
  const scrubTo = (e) => { const r = scrub.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * F().total); };
  scrub.onpointerdown = (e) => { scrub.setPointerCapture(e.pointerId); scrubTo(e); pause(); scrub.onpointermove = scrubTo; }; scrub.onpointerup = () => { scrub.onpointermove = null; scrub.blur(); };
  // Timeline keyboard (when it has focus): arrows +-5 s (Shift +-15 s), PageUp/PageDown previous/next step, Home/End.
  scrub.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return; const k = e.key, big = e.shiftKey ? 15 : 5;
    const act = { ArrowRight: () => seek(S.t + big), ArrowUp: () => seek(S.t + big), ArrowLeft: () => seek(S.t - big), ArrowDown: () => seek(S.t - big), PageDown: () => stepBy(1), PageUp: () => stepBy(-1), Home: () => seek(0), End: () => seek(F().total) }[k];
    if (act) { e.preventDefault(); e.stopPropagation(); act(); if (k !== "ArrowRight" && k !== "ArrowLeft" && k !== "ArrowUp" && k !== "ArrowDown") pause(); }
  });
  // A mouse click on a button should not keep keyboard focus (Space stays play/pause); keyboard use keeps its focus ring.
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b && e.detail > 0) b.blur(); });
  // Wake the glass UI on any interaction; fade it after 4 s without pointer movement while playing (see tick).
  const wake = () => { lastActive = performance.now(); };
  for (const type of ["pointermove", "pointerdown", "wheel", "keydown", "focusin", "touchstart"]) addEventListener(type, wake, { passive: true });
  function syncPressed() { document.querySelectorAll("button[aria-pressed]").forEach(b => { if (b.id === "play" || b.closest("#flows")) return; const on = b.classList.contains("on"); if (b.getAttribute("aria-pressed") !== String(on)) b.setAttribute("aria-pressed", String(on)); }); }
  addEventListener("keydown", () => setTimeout(syncPressed, 0)); addEventListener("click", () => setTimeout(syncPressed, 0));
  function updateFade(now) {
    const inside = document.activeElement && document.activeElement.closest && document.activeElement.closest(".ui");
    const want = S.autoFade && S.playing && now - lastActive > 4000 && !inside && !S.measure;
    if (want !== faded) { faded = want; document.body.classList.toggle("idle", want); syncUiHidden(); }
  }

  const stg = $("stage"); let drag = null;
  const hitFloor = (e) => { const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2), camera); return ray.intersectObjects(floors.map((f) => f.art), false)[0]; };
  stg.oncontextmenu = (e) => e.preventDefault();
  stg.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pan: e.button === 2 || e.shiftKey || S.c.pol < .05 }; stg.setPointerCapture(e.pointerId); stg.classList.add("drag"); };
  stg.onpointermove = (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (!dx && !dy) return; toFree();
    const c = S.c;
    if (drag.pan) { const k = c.dist * Math.tan((camera.fov * Math.PI) / 360) * 2 / innerHeight, r = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), f = new T.Vector3(Math.sin(c.az), 0, Math.cos(c.az)); c.x += (-dx * r.x + -dy * f.x) * k; c.z += (-dx * r.z + -dy * f.z) * k; }
    else { c.az -= dx * .006; c.pol = clamp(c.pol - dy * .005, .001, 1.5); }
  };
  stg.onpointerup = (e) => {
    const click = drag && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5; drag = null; stg.classList.remove("drag");
    if (click && S.measure) { const h = hitFloor(e); if (h) { if (S.pts.length === 2) S.pts = []; S.pts.push(h.point.clone()); } }
  };
  stg.onwheel = (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : .89); };
  stg.ondblclick = (e) => { if (S.measure) return; const hit = hitFloor(e); if (hit) { toFree(); Object.assign(S.c, { x: hit.point.x, y: hit.point.y, z: hit.point.z, dist: S.c.dist * .7 }); } };
  addEventListener("keydown", (e) => {
    const tag = e.target.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || e.ctrlKey || e.altKey || e.metaKey) return; const k = e.key.toLowerCase();
    if (tag === "SELECT" && k !== "[" && k !== "]") return;   // a focused select keeps its own keys; only the speed steppers pass
    if ((k === " " || k === "enter") && (tag === "BUTTON" || e.target.getAttribute("role") === "button")) return;   // native activation for a focused control
    const act = { " ": () => (S.playing ? pause() : play()), arrowright: () => stepBy(1), arrowleft: () => stepBy(-1), home: () => { seek(0); pause(); }, end: () => { seek(F().total); pause(); }, 2: () => setView("2d"), 3: () => setView("3d"), a: () => setView("auto"), g: () => setCam("guided"), l: tLbl, n: tNet, p: tPanel, r: tRoof, "[": () => stepSpeed(-1), "]": () => stepSpeed(1), f: fullscreen, h: toggleBare, "?": toggleHelp, "+": () => zoom(.8), "=": () => zoom(.8), "-": () => zoom(1.25), m: () => setMeasure(!S.measure), o: () => setPlan(S.plan === "replica" ? "original" : "replica"), escape: () => { setMeasure(false); closePopovers(null); if ($("help").style.display === "block") toggleHelp(); },
      c: () => { const o = [...$("cam").options].filter((x) => !x.hidden).map((x) => x.value); setCam(o[(o.indexOf(S.cam) + 1) % o.length]); } }[k];
    if (act) { e.preventDefault(); act(); }
  });

  const mc = $("minic").getContext("2d");
  const MINI = (() => {   // fit every plate's drawn extent into the 420 x 236 mini map
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [, P] of plateEntries) { const b = P.box; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[0] + b[2]); y1 = Math.max(y1, b[1] + b[3]); }
    const k = Math.min(404 / (x1 - x0), 220 / (y1 - y0)); return { k, ox: (420 - (x1 - x0) * k) / 2 - x0 * k, oy: (236 - (y1 - y0) * k) / 2 - y0 * k };
  })();
  function drawMini() {
    const k = MINI.k, ox = MINI.ox, oy = MINI.oy; mc.clearRect(0, 0, 420, 236);
    const p = frameLot, here = p.lift != null ? plateOf(E.low[0], E.low[1]) : plateOf(p.x, p.y);
    for (const [key, P] of plateEntries) { const b = P.box; mc.fillStyle = key === here ? "#1f6feb" : "#ffffff26"; mc.fillRect(b[0] * k + ox, b[1] * k + oy, b[2] * k, b[3] * k); mc.fillStyle = "#fff"; mc.font = "bold 18px Segoe UI"; mc.fillText(P.label, b[0] * k + ox + 6, b[1] * k + oy + 22); }
    const x = p.lift != null ? E.low[0] : p.x, y = p.lift != null ? E.low[1] : p.y; mc.fillStyle = "#ffc000"; mc.beginPath(); mc.arc(x * k + ox, y * k + oy, 7, 0, 7); mc.fill();
  }

