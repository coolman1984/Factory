/* ===== V7 Studio: user interface (rail buttons, camera pad, editor panel, timeline lanes, mouse and keys, frame hooks) ===== */
const ICON = {
  pad: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4.2"/><circle cx="8" cy="12" r="1.3"/><path d="M15 9.5h5M17.5 7v5M15.5 15.5l4 0"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20l4.5-1 10-10-3.5-3.5-10 10z"/><path d="M13.5 6.5l3.5 3.5"/></svg>',
  dir: '<svg viewBox="0 0 24 24"><path d="M4 9h16v10H4z"/><path d="M4 9l2.5-4 3 4M9.5 5l3 4M14.5 5l3 4"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 000 12"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
const num = (v, d = 2) => (Number.isFinite(+v) ? (+v).toFixed(d) : "");

/* ---------- rail buttons ---------- */
const rail = $("rail"), helpBtn = $("helpBtn");
const railBtn = (id, icon, tip) => { const b = h(`<button id="${id}" class="ib" aria-pressed="false" data-tip="${tip}">${icon}</button>`); rail.insertBefore(b, helpBtn.previousElementSibling); return b; };
const padBtn = railBtn("pad7Btn", ICON.pad, "Camera pad"), edBtn = railBtn("ed7Btn", ICON.edit, "Scene Studio (editor)"), dirBtn = railBtn("dir7Btn", ICON.dir, "Director");
rail.insertBefore(h('<span class="rule" aria-hidden="true"></span>'), padBtn);

/* ---------- camera pad ---------- */
const pad = h(`<div id="pad7" class="ui glass" role="group" aria-label="Camera pad">
  <div class="hd"><b>Camera</b><div class="seg" id="padMode"><button data-m="free">Free</button><button data-m="lock" title="The camera keeps the trolley in the middle while you turn around it">Orbit</button><button data-m="guided">Guided</button><button data-m="chase">Ride</button><button data-m="director">Director</button></div><button class="ib xs" id="padMin" title="Make the pad small / big">▁</button><button class="ib xs" id="padClose" aria-label="Close the camera pad">${ICON.x}</button></div>
  <div class="sticks">
    <div class="stick" data-k="orbit" title="Orbit: drag to turn around the target (double-click: isometric)"><div class="ring"><i>N</i><i>E</i><i>S</i><i>W</i></div><div class="knob"></div><small>Orbit</small></div>
    <div class="stick sq" data-k="pan" title="Move: drag to travel over the floor"><div class="cross"></div><div class="knob"></div><small>Move</small></div>
    <div class="rocker" data-k="zoom" title="Zoom: drag up to zoom in"><div class="track"><div class="knob"></div></div><small>Zoom</small></div>
    <div class="rocker" data-k="crane" title="Height: drag up to raise the target"><div class="track"><div class="knob"></div></div><small>Height</small></div>
  </div>
  <div class="sl"><label>Lens <input type="range" id="padLens" min="14" max="135" step="1"><span id="padLensV"></span></label>
  <label>Speed <input type="range" id="padSpeed" min="0.15" max="3" step="0.05"><span id="padSpeedV"></span></label>
  <label>Smooth <input type="range" id="padSmooth" min="0" max="1" step="0.05"><span id="padSmoothV"></span></label></div>
  <div class="row"><button data-p="top">Top</button><button data-p="front">Front</button><button data-p="side">Side</button><button data-p="iso">Iso</button><button data-p="trolley">Trolley</button><button data-p="reset">Reset</button></div>
  <div class="row shots" title="Shots: click to fly there; Shift+click or right-click to save the current view"><span>Shots</span>${[1, 2, 3, 4, 5, 6].map((i) => `<button data-b="${i - 1}">${i}</button>`).join("")}<button id="padKey" class="key" title="Add a director camera key here (K)">+ Key</button><button id="padPhoto" title="Save a picture of this view (PNG)">Photo</button></div>
  <div class="read" id="padRead"></div></div>`);
document.body.appendChild(pad);
function setPad(open) { pad.style.display = open ? "flex" : "none"; padBtn.classList.toggle("on", open); padBtn.setAttribute("aria-pressed", String(open)); document.body.classList.toggle("pad7", open); try { localStorage.setItem("mf7:pad", open ? "1" : "0"); } catch (e) {} }
padBtn.onclick = () => setPad(pad.style.display !== "flex"); $("padClose").onclick = () => setPad(false);
const stickVel = { orbit: ["ox", "oy"], pan: ["px", "py"], zoom: [null, "zoom"], crane: [null, "crane"] };
for (const el of pad.querySelectorAll(".stick,.rocker")) {
  const k = el.dataset.k, knob = el.querySelector(".knob"), area = el.querySelector(".track") || el; let id = null;
  const set = (e) => {
    const r = area.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = el.classList.contains("rocker") ? r.height / 2 - 8 : Math.min(r.width, r.height) / 2 - 10;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; if (el.classList.contains("rocker")) dx = 0; const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; }
    knob.style.transition = "none"; knob.style.transform = `translate(${dx * R}px,${dy * R}px)`;
    const curve = (v) => (Math.abs(v) < .08 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - .08) / .92, 1.5)), [vx, vy] = stickVel[k];
    if (vx) cam.vel[vx] = curve(dx); cam.vel[vy] = curve(dy) * (k === "zoom" ? 1 : 1);
  };
  area.onpointerdown = (e) => { e.preventDefault(); id = e.pointerId; area.setPointerCapture(id); goFree(true); set(e); };
  area.onpointermove = (e) => { if (id === e.pointerId) set(e); };
  area.onpointerup = area.onpointercancel = (e) => { if (id !== e.pointerId) return; id = null; knob.style.transition = ""; knob.style.transform = ""; const [vx, vy] = stickVel[k]; if (vx) cam.vel[vx] = 0; cam.vel[vy] = 0; };
}
pad.querySelector('.stick[data-k="orbit"]').ondblclick = () => viewPreset("iso");
pad.querySelectorAll(".row [data-p]").forEach((b) => (b.onclick = () => { if (b.dataset.p === "reset") setLock(false); viewPreset(b.dataset.p); syncPad(); }));
pad.querySelectorAll("#padMode button").forEach((b) => (b.onclick = () => {
  const m = b.dataset.m;
  if (m === "free") { setLock(false); goFree(); } else if (m === "lock") setLock(true);
  else if (m === "director") { if (!dirOf().keys.length) X.tip("No director keys yet: add keys in the Director tab (K)"); else { cam.lock = false; MF.setCam("director"); } }
  else { cam.lock = false; MF.setCam(m); }
  syncPad();
}));
const lensEl = $("padLens"), speedEl = $("padSpeed"), smoothEl = $("padSmooth");
lensEl.oninput = () => { goFree(true); setLens(fovOfMM(+lensEl.value)); syncPad(); };
speedEl.oninput = () => { cam.speed = +speedEl.value; syncPad(); }; smoothEl.oninput = () => { cam.smooth = +smoothEl.value; syncPad(); };
const shotBtns = [...pad.querySelectorAll(".shots [data-b]")];
function saveShot(i) { const c = currentPose(); commit("save shot " + (i + 1), () => { doc.bookmarks[i] = { x: c.x, y: c.y, z: c.z, dist: c.dist, az: c.az, pol: c.pol, fov: c.fov }; }, "director"); X.tip("Shot " + (i + 1) + " saved"); syncPad(); }
shotBtns.forEach((b, i) => { b.onclick = (e) => { if (e.shiftKey || !doc.bookmarks[i]) return saveShot(i); cam.lock = false; flyTo(doc.bookmarks[i], 1.2); }; b.oncontextmenu = (e) => { e.preventDefault(); saveShot(i); }; });
$("padKey").onclick = () => addKey(); $("padPhoto").onclick = () => { photoPending = true; }; $("padMin").onclick = () => pad.classList.toggle("mini");
function syncPad() {
  const mm = Math.round(lensMM(cam.goal.fov)); lensEl.value = mm; $("padLensV").textContent = mm + " mm"; speedEl.value = cam.speed; $("padSpeedV").textContent = cam.speed.toFixed(2) + "x"; smoothEl.value = cam.smooth; $("padSmoothV").textContent = Math.round(cam.smooth * 100) + "%";
  const mode = S.cam === "free" ? (cam.lock ? "lock" : "free") : S.cam; pad.querySelectorAll("#padMode button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
  shotBtns.forEach((b, i) => b.classList.toggle("set", !!doc.bookmarks[i]));
}
let readAt = 0;
function padTick(now) {
  if (pad.style.display !== "flex" || now - readAt < 100) return; readAt = now; const c = S.c;
  $("padRead").textContent = `${S.cam === "free" ? (cam.lock ? "Orbit trolley" : "Free") : S.cam[0].toUpperCase() + S.cam.slice(1)} · ${(c.dist * PT_M).toFixed(0)} m · heading ${Math.round(((-c.az * 180 / Math.PI) % 360 + 360) % 360)}° · tilt ${Math.round(90 - c.pol * 180 / Math.PI)}° · ${Math.round(lensMM(camera.fov))} mm`;
  pad.querySelector(".ring").style.transform = `rotate(${c.az * 180 / Math.PI}deg)`;
  const mode = S.cam === "free" ? (cam.lock ? "lock" : "free") : S.cam; if (padTick.mode !== mode) { padTick.mode = mode; syncPad(); }
}

/* ---------- edit toolbar (top centre) ---------- */
const bar7 = h(`<div id="tb7" class="ui glass" role="toolbar" aria-label="Studio tools">
  <button id="tbUndo" class="ib xs" data-tip="Undo (Ctrl+Z)">${ICON.undo}</button><button id="tbRedo" class="ib xs" data-tip="Redo (Ctrl+Y)">${ICON.redo}</button><span class="sep"></span>
  <label title="Snap positions to a grid (Alt while dragging: no snap)">Snap <select id="tbSnap"><option value="0">off</option><option value="0.1">0.1 m</option><option value="0.5">0.5 m</option><option value="1">1 m</option><option value="2">2 m</option></select></label>
  <button id="tbOrtho" title="Paths keep horizontal and vertical legs">Ortho</button><span class="sep"></span>
  <button id="tbStraight" title="Straighten the selected step or the steps at the selected stop (S); Shift+click: the whole path">Straighten</button><button id="tbKeys" title="Keyboard map (F1)">Keys</button><span class="sep"></span><span id="tbChecks" class="chk7" title="Collisions and link problems of this flow"></span><span class="sep"></span><span id="tbSave" class="sv"></span></div>`);
document.body.appendChild(bar7);
$("tbUndo").onclick = undo; $("tbRedo").onclick = redo; $("tbStraight").onclick = (e) => { straighten(e.shiftKey ? "flow" : "step"); render(); }; $("tbKeys").onclick = () => toggleKeys();
$("tbSnap").onchange = (e) => { doc.settings.snap = +e.target.value; scheduleSave(); };
$("tbOrtho").onclick = () => { doc.settings.ortho = !doc.settings.ortho; scheduleSave(); syncToolbar(); };
$("tbChecks").onclick = () => { setTab("paths"); const hit = ed.hits[0]; if (hit) { ed.stepSel = hit.step; focusPlan(hit.x, hit.y, plateOf(hit.x, hit.y), 120); render(); } };
function syncToolbar() {
  $("tbSnap").value = String(doc.settings.snap); $("tbOrtho").classList.toggle("on", !!doc.settings.ortho);
  const c = ed.hits.length, l = ed.issues.length; $("tbChecks").className = "chk7 " + (c || l ? "bad" : "ok"); $("tbChecks").textContent = c || l ? `${c} clash${c === 1 ? "" : "es"} · ${l} link issue${l === 1 ? "" : "s"}` : "No clashes";
  $("tbSave").textContent = dirty ? "Saving…" : MF7.source === "original" && !undoStack.length && !localSaved() ? "Original" : "Saved"; $("tbUndo").disabled = !undoStack.length; $("tbRedo").disabled = !redoStack.length;
}
function localSaved() { try { return !!localStorage.getItem(storageKey()); } catch (e) { return false; } }
statusHandler = (msg, bad) => { syncToolbar(); if (bad) X.tip(msg); };

/* ---------- editor panel ---------- */
const panel = h(`<div id="ed7" class="ui glass" role="region" aria-label="Scene Studio">
  <div class="hd"><b>Scene Studio</b><span class="pj">${esc(PROJECT.toUpperCase())}</span><button class="ib xs" id="edClose" aria-label="Close the Studio">${ICON.x}</button></div>
  <div class="tabs7" role="tablist"><button data-t="objects">Objects</button><button data-t="paths">Paths</button><button data-t="steps">Steps</button><button data-t="director">Director</button><button data-t="numbers">Numbers</button><button data-t="project">Project</button></div>
  <div class="body" id="edBody"></div></div>`);
document.body.appendChild(panel);
panel.querySelectorAll(".tabs7 button").forEach((b) => (b.onclick = () => setTab(b.dataset.t)));
$("edClose").onclick = () => setEditor(false);
function setTab(t) { ed.tab = t; if (!ed.open) setEditor(true); panel.querySelectorAll(".tabs7 button").forEach((b) => b.classList.toggle("on", b.dataset.t === t)); if ((t === "paths" || t === "steps") && ed.stepSel < 0) ed.stepSel = Math.max(0, (X.stepAt(S.t).i || 1) - 1); render(); renderLanes(); }
function setEditor(open) {
  ed.open = open; panel.style.display = open ? "flex" : "none"; bar7.style.display = open ? "flex" : "none"; edBtn.classList.toggle("on", open); edBtn.setAttribute("aria-pressed", String(open)); document.body.classList.toggle("ed7", open);
  if (open) { if (S.panel) $("panelBtn").click(); MF.pause(); if (S.cam !== "free" && S.cam !== "director") goFree(true); runChecks(); render(); }
  else { ed.placing = null; ed.drawing = null; ed.sel = null; }
  dirBtn.classList.toggle("on", open && ed.tab === "director"); renderLanes(); syncToolbar();
}
edBtn.onclick = () => setEditor(!ed.open);
dirBtn.onclick = () => { if (ed.open && ed.tab === "director") setEditor(false); else setTab("director"); dirBtn.classList.toggle("on", ed.open && ed.tab === "director"); };
const body = $("edBody");
function render() {
  if (!ed.open) return; syncHint(); const keepScroll = body.scrollTop, focused = document.activeElement && body.contains(document.activeElement) ? document.activeElement.dataset.f : null;
  ({ objects: renderObjects, paths: renderPaths, steps: renderSteps, director: renderDirector, numbers: renderNumbers, project: renderProject })[ed.tab]();
  body.scrollTop = keepScroll; if (focused) { const el = body.querySelector(`[data-f="${focused}"]`); if (el) el.focus(); }
  syncToolbar();
}
// bind inputs: data-f="path" fields write through set(path, value) and commit on change
function bindFields(root, onSet) { root.querySelectorAll("[data-f]").forEach((el) => { const ev = el.type === "range" ? "input" : "change"; el.addEventListener(ev, () => onSet(el.dataset.f, el.type === "checkbox" ? el.checked : el.type === "number" || el.type === "range" ? +el.value : el.value, el)); }); }
const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(label)}</option>`;
const nodeOptions = (cur, none) => (none ? opt("", "(none)", cur) : "") + nodeList().sort((a, b) => String(a.text).localeCompare(String(b.text))).map((n) => opt(n.id, nodeName(n) + " · " + plateLabel(n.plate || plateOf(n.x, n.y)), cur)).join("");

/* ---- Objects tab ---- */
const ADD_GROUPS = [["Devices", ["pc-result", "pc-mapping", "pc-quality", "rfid-auto", "rfid-manual", "stop"]], ["Props", Object.keys(PROP_TYPES).map((k) => "prop-" + k)]];
const ADD_ICON = { "pc-result": "●", "pc-mapping": "■", "pc-quality": "⬢", "rfid-auto": "⊓", "rfid-manual": "⌖", stop: "◆", "prop-box": "▣", "prop-pallet": "▤", "prop-rack": "▥", "prop-column": "▮", "prop-wall": "▬", "prop-fence": "┼", "prop-cone": "▲", "prop-arrow": "➜", "prop-zone": "▢", "prop-sign": "ⓘ", "prop-trolley": "⛟" };
function renderObjects() {
  const info = selInfo(), o = selObj(), k = ed.sel && ed.sel.kind;
  let insp = `<p class="hint">Click an object in the 3D scene, a stop diamond, or an item below. Drag it to move; drag the round green knob to turn. Delete removes, Ctrl+D duplicates, Q / E turn, arrows nudge.</p>`;
  if (info) {
    const xy = `<div class="g2"><label>X (m)<input type="number" step="0.1" data-f="x" value="${num(info.x * PT_M)}"></label><label>Y (m)<input type="number" step="0.1" data-f="y" value="${num(info.y * PT_M)}"></label></div>`;
    let f = "";
    if (k === "device") {
      f += `<label>Label<input data-f="label" value="${esc(o.label || "")}"></label>`;
      if (o.type === "pc") f += `<label>Kind<select data-f="kind">${opt("result", "Prod. Result / GR (circle)", o.kind)}${opt("mapping", "TO Mapping / GI (square)", o.kind)}${opt("quality", "Quality (hexagon)", o.kind)}</select></label><label>Serves stop<select data-f="node">${nodeOptions(o.node, true)}</select></label><label>Done message<input data-f="done" value="${esc(o.done || "")}"></label><div class="g2"><label>Turn (deg)<input type="number" step="15" data-f="yawDeg" value="${o.yawDeg != null ? o.yawDeg : { e: 90, w: -90, n: 180, s: 0 }[o.face || "e"]}"></label><label>Icon size<input type="number" step="0.1" min="0.5" max="4" data-f="k" value="${o.k || DIMS.K}"></label></div><label>Floor symbol colour<input type="color" data-f="fill" value="${o.fill || "#7030A0"}"></label>`;
      if (o.type === "rfid-auto") f += `<label>Lane direction<select data-f="axis">${opt("y", "Trolley drives north-south", o.axis)}${opt("x", "Trolley drives east-west", o.axis)}</select></label>`;
      if (o.type === "rfid-manual") f += `<label>Done message<input data-f="done" value="${esc(o.done || "")}"></label><label class="chk"><input type="checkbox" data-f="routeBound" ${o.routeBound !== false ? "checked" : ""}> Trolley stops here to be scanned</label><label>Icon size<input type="number" step="0.1" min="0.5" max="4" data-f="k" value="${o.k || DIMS.K}"></label>`;
    } else if (k === "prop") {
      f += `<label>Name<input data-f="name" value="${esc(o.name || "")}"></label>${o.type === "sign" ? `<label>Sign text<textarea data-f="text" rows="2">${esc(o.text || "")}</textarea></label>` : ""}
        <div class="g3"><label>Width (m)<input type="number" step="0.1" min="0.05" data-f="w" value="${num(o.w)}"></label><label>Depth (m)<input type="number" step="0.1" min="0.02" data-f="d" value="${num(o.d)}"></label><label>Height (m)<input type="number" step="0.1" min="0.02" data-f="h" value="${num(o.h)}"></label></div>
        <div class="g2"><label>Turn (deg)<input type="number" step="15" data-f="rot" value="${o.rot || 0}"></label><label>Colour<input type="color" data-f="color" value="${o.color}"></label></div>`;
    } else if (k === "node") {
      f += `<label>Name<input data-f="text" value="${esc(o.text || "")}"></label><div class="g2"><label>Symbol<select data-f="kind">${["result", "mapping", "quality", "area", "dest", "scan"].map((v) => opt(v, v, o.kind)).join("")}</select></label><label>Colour<input type="color" data-f="fill" value="${o.fill || "#156082"}"></label></div>`;
    } else if (k === "replica") {
      const op = doc.replica[ed.sel.tag] || {}; f += `<p class="hint">Replica object from the AutoCAD plan. Move it, turn it in 90° steps or delete it; the plan, the routes and the camera follow.</p><div class="g2"><button data-a="rotL">⟲ 90°</button><button data-a="rotR">⟳ 90°</button></div>${op.dx || op.dy || op.rot ? `<button data-a="resetRep">Put it back where it was</button>` : ""}`;
    }
    insp = `<div class="card7"><div class="ct"><b>${esc(info.title)}</b><span>${esc(plateLabel(info.plate))}</span></div>${k !== "replica" ? xy : `<div class="g2"><label>X (m)<input type="number" step="0.1" data-f="x" value="${num(info.x * PT_M)}"></label><label>Y (m)<input type="number" step="0.1" data-f="y" value="${num(info.y * PT_M)}"></label></div>`}${f}
      <div class="acts"><button data-a="focus">Focus</button>${k !== "replica" ? `<button data-a="dup">Duplicate</button>` : ""}${k !== "node" ? `<button data-a="turn">Turn ${k === "replica" ? "90" : "15"}°</button>` : ""}<button data-a="del" class="danger">Delete</button></div></div>`;
  }
  const lists = [
    ["Stops", nodeList().map((n) => ({ sel: { kind: "node", id: n.id }, name: nodeName(n), sub: plateLabel(n.plate || plateOf(n.x, n.y)) }))],
    ["Devices", doc.devices.map((d, i) => ({ sel: { kind: "device", i }, name: d.label || d.type, sub: ({ pc: "PC", "rfid-auto": "Auto RFID", "rfid-manual": "Scanner" }[d.type] || d.type) + " · " + plateLabel(d.plate || "1F") }))],
    ["Props", doc.props.map((p) => ({ sel: { kind: "prop", id: p.id }, name: p.name || p.type, sub: PROP_TYPES[p.type] ? PROP_TYPES[p.type].name : p.type }))],
  ];
  const same = (a, b) => a && b && a.kind === b.kind && (a.i === b.i && a.id == b.id && a.tag === b.tag);
  body.innerHTML = `<div class="sec"><h4>Add to the scene</h4>${ADD_GROUPS.map(([g, items]) => `<div class="add7">${items.map((it) => `<button data-add="${it}" class="${ed.placing && ed.placing.kind === it ? "on" : ""}" title="${esc(ADD[it].label)}"><i>${ADD_ICON[it] || "+"}</i><span>${esc(ADD[it].label.replace(/^PC: /, "PC "))}</span></button>`).join("")}</div>`).join("")}
    <label class="chk"><input type="checkbox" id="pickRep" ${ed.pickReplica ? "checked" : ""}> Click selects replica objects too (racks, machines, walls, columns, pallets)</label></div>
    <div class="sec">${insp}</div>
    <input id="objFind" class="find7" placeholder="Find a stop, device or object…">${lists.map(([t, items]) => `<details class="sec" ${t === "Stops" ? "" : "open"}><summary>${t} <span class="n">${items.length}</span></summary><ul class="list7">${items.map((it, j) => `<li data-l="${t}:${j}" class="${same(it.sel, ed.sel) ? "on" : ""}"><b>${esc(it.name)}</b><small>${esc(it.sub)}</small></li>`).join("")}</ul></details>`).join("")}`;
  body.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => { if (ed.placing && ed.placing.kind === b.dataset.add) { ed.placing = null; render(); } else { startPlace(b.dataset.add); render(); } }));
  $("pickRep").onchange = (e) => { ed.pickReplica = e.target.checked; };
  $("objFind").oninput = (e) => { const q = e.target.value.trim().toLowerCase(); body.querySelectorAll("[data-l]").forEach((li) => { li.style.display = !q || li.textContent.toLowerCase().includes(q) ? "" : "none"; }); if (q) body.querySelectorAll("details.sec").forEach((d) => (d.open = true)); };
  body.querySelectorAll("[data-l]").forEach((li) => (li.onclick = () => { const [t, j] = li.dataset.l.split(":"); const it = lists.find((l) => l[0] === t)[1][+j]; select(it.sel, true); }));
  const acts = { focus: () => { const i = selInfo(); if (i) focusPlan(i.x, i.y, i.plate); }, dup: duplicateSel, del: deleteSel, turn: () => rotateSelBy(15), rotL: () => rotateSelBy(-90), rotR: () => rotateSelBy(90), resetRep: () => commit("put back " + selInfo().title, () => { const op = doc.replica[ed.sel.tag]; delete op.dx; delete op.dy; delete op.rot; }, "replica") };
  body.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => acts[b.dataset.a] && acts[b.dataset.a]()));
  bindFields(body, (f, v) => {
    const sel = ed.sel, o = selObj(); if (!o) return;
    if (f === "x" || f === "y") { const i = selInfo(), x = f === "x" ? v / PT_M : i.x, y = f === "y" ? v / PT_M : i.y; commit("move " + i.title, () => { moveSelTo(x, y, false); if (sel.kind === "node") relinkNode(sel.id); }, kindRebuild(sel.kind)); return; }
    commit("edit " + f, () => {
      if (f === "node") { if (v === "") delete o.node; else o.node = +v; }
      else if (f === "yawDeg") { o.yawDeg = v; o.face = (["s", "e", "n", "w"])[((Math.round(v / 90) % 4) + 4) % 4]; }
      else if (["w", "d", "h"].includes(f)) o[f] = Math.max(.02, v);
      else o[f] = v;
    }, kindRebuild(sel.kind));
  });
}

/* ---- Paths tab ---- */
const pathLen = (P) => (Array.isArray(P) ? P.reduce((L, p, k) => L + (k ? Math.hypot(p[0] - P[k - 1][0], p[1] - P[k - 1][1]) : 0), 0) * PT_M : 0);
function renderPaths() {
  const f = curFlow(); if (!f) { body.innerHTML = "<p class='hint'>No flow.</p>"; return; }
  const hitsBy = {}, issBy = {}; for (const x of ed.hits) hitsBy[x.step] = (hitsBy[x.step] || 0) + 1; for (const x of ed.issues) (issBy[x.step] = issBy[x.step] || []).push(x.msg);
  const s = f.steps[ed.stepSel];
  body.innerHTML = `<div class="sec"><h4>${esc(f.name)}</h4><p class="hint">Pick a step, then drag its yellow corners or the small squares on its legs. Double-click a leg to add a corner, right-click a corner to remove it. Ends are locked to the stops; move a stop in Objects.</p>
    <ul class="list7 steps">${f.steps.map((st, i) => `<li data-s="${i}" class="${i === ed.stepSel ? "on" : ""}"><span class="no">${i + 1}</span><b>${esc(st.title || "Step")}</b><small>${st.lift ? "Elevator ride · " + esc(st.elevator || "") : Array.isArray(st.path) ? pathLen(st.path).toFixed(1) + " m" : "stays at the stop"}${hitsBy[i] ? ` · <em class="bad">${hitsBy[i]} clash</em>` : ""}${issBy[i] ? ` · <em class="bad">${esc(issBy[i][0])}</em>` : ""}</small></li>`).join("")}</ul></div>
    ${s ? `<div class="sec card7"><div class="ct"><b>Step ${ed.stepSel + 1}: ${esc(s.title || "")}</b><span>${esc(nodeName(doc.nodes[s.node]))}</span></div>
      ${s.lift ? `<p class="hint">An elevator ride from the lower to the upper landing of ${esc(s.elevator || "the elevator")}. Its ends come from the elevator.</p>` : `<div class="acts"><button data-a="straight" class="pri" title="Remove small jogs, square the legs (S)">Straighten (S)</button><button data-a="ell" title="One corner (L)">L shape (L)</button><button data-a="route" title="Find a clear trolley route from the previous stop (R)">Auto-route (R)</button><button data-a="draw" title="Click the corners yourself (B)">Draw (B)</button><button data-a="clear">No path</button></div>
      <p class="hint">${Array.isArray(s.path) ? `${s.path.length} points, ${pathLen(s.path).toFixed(1)} m, about ${(pathLen(s.path) / 4 + Math.max(0, s.path.length - 2) * .3).toFixed(1)} s at full speed.` : "The trolley stays at its stop in this step."}</p>`}</div>` : ""}
    <div class="sec"><div class="acts"><button data-a="straightFlow" title="Shift+S">Straighten whole path</button><button data-a="straightAll">Straighten all paths</button><button data-a="routeFlow" title="Shift+R">Auto-route whole path</button><button data-a="checkAll">Check all flows</button><button data-a="fixAll" title="Re-route every step that does not join its neighbours">Fix all links</button></div><div id="chkOut" class="hint"></div></div>`;
  body.querySelectorAll("[data-s]").forEach((li) => (li.onclick = () => { ed.stepSel = +li.dataset.s; const it = X.F().items[ed.stepSel + 1]; if (it) { MF.seek(it.t0); MF.pause(); } const P = f.steps[ed.stepSel].path; if (Array.isArray(P)) { const m = P[Math.floor(P.length / 2)]; focusPlan(m[0], m[1], stepPlate(f.steps[ed.stepSel])); } render(); }));
  const acts = {
    route: () => autoRoute(S.flow, ed.stepSel), draw: () => startDraw(S.flow, ed.stepSel), straight: () => straighten("step"), straightFlow: () => straighten("flow"), straightAll: () => straighten("all"), routeFlow: autoRouteFlow,
    ell: lShape,
    clear: () => commit("remove path", () => { s.path = null; }),
    checkAll: () => { const out = doc.flows.map((fl) => { const c = checkFlow(fl).length, l = validateFlow(fl).length; return `${esc(fl.name)}: ${c ? `<em class="bad">${c} clash</em>` : "clear"}${l ? `, <em class="bad">${l} link issue</em>` : ""}`; }); $("chkOut").innerHTML = out.join("<br>"); },
    fixAll: () => commit("fix links", () => { for (const fl of doc.flows) for (const iss of validateFlow(fl)) relink(fl, iss.step, true); }),
  };
  body.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => acts[b.dataset.a] && acts[b.dataset.a]()));
}

/* ---- Steps tab ---- */
const MODES = [["flow", "Push"], ["auto", "AGV"], ["manual", "Manual"]];
function renderSteps() {
  const f = curFlow(); if (!f) return; const fi = S.flow;
  body.innerHTML = `<div class="sec card7"><div class="ct"><b>Flow ${fi + 1} of ${doc.flows.length}</b><span>${f.steps.length} steps</span></div>
    <label>Name<input data-f="flow.name" value="${esc(f.name)}"></label><div class="g3"><label>Colour<input type="color" data-f="flow.color" value="${f.color || "#7030A0"}"></label><label>Trolleys<input type="number" min="1" max="12" step="1" data-f="flow.trolleys" value="${f.trolleys || 1}"></label><label>Every (s)<input type="number" min="1" step="1" data-f="flow.headway" value="${f.headway || 30}"></label></div>
    <div class="acts"><button data-a="newFlow">New flow</button><button data-a="dupFlow">Duplicate</button><button data-a="left">◀ Move</button><button data-a="right">Move ▶</button><button data-a="reverse" title="Drive the path the other way round (no elevator rides)">Reverse</button><button data-a="delFlow" class="danger">Delete flow</button></div></div>
    <ol class="steps7">${f.steps.map((s, i) => `<li draggable="true" data-i="${i}" class="${i === ed.stepSel ? "on" : ""}"><div class="row7"><span class="grip" title="Drag to reorder">⋮⋮</span><span class="no">${i + 1}</span><b>${esc(s.title || "Step")}</b><span class="mini">${s.lift ? "elevator" : esc((MODES.find((m) => m[0] === s.mode) || ["", s.mode || ""])[1])}</span><button data-play="${i}" title="Play from this step">▶</button><button data-up="${i}" title="Move up">▲</button><button data-dn="${i}" title="Move down">▼</button></div>
      ${i === ed.stepSel ? `<div class="ed7row"><label>Title<input data-f="s.title" value="${esc(s.title || "")}"></label><label>Explanation (shown on the card)<textarea data-f="s.what" rows="3">${esc(s.what || "")}</textarea></label>
      ${s.lift ? `<label>Elevator<select data-f="s.elevator">${ELEVATORS.map((e) => opt(e.label, e.label, s.elevator)).join("")}</select></label>` : `<label>Stop<select data-f="s.node">${nodeOptions(s.node)}</select></label>`}
      <div class="g3"><label>Mode<select data-f="s.mode">${MODES.map(([v, l]) => opt(v, l, s.mode)).join("")}</select></label><label>Wait (s)<input type="number" step="0.1" min="0" data-f="s.dwell" value="${s.dwell != null ? s.dwell : ""}" placeholder="auto"></label><label>Camera (m)<input type="number" step="5" min="10" data-f="s.dist" value="${num((s.dist || 300) * PT_M, 0)}"></label></div>${s.lift ? "" : `<label>Speed (m/s, empty = 4)<input type="number" step="0.1" min="0.2" max="8" data-f="s.speed" value="${s.speed != null ? s.speed : ""}" placeholder="4"></label>`}
      <div class="acts">${s.lift ? "" : `<button data-a="route">Auto-route</button>`}<button data-a="delStep" class="danger">Delete step</button></div></div>` : ""}</li>`).join("")}</ol>
    <div class="sec card7"><div class="ct"><b>Add a step after step ${Math.max(1, ed.stepSel + 1)}</b></div><label>Go to stop<select id="addStop">${nodeOptions(null)}</select></label>
      <div class="acts"><button data-a="addStep">Add step</button>${ELEVATORS.length ? `<select id="addElev">${ELEVATORS.map((e) => opt(e.label, e.label)).join("")}</select><button data-a="addLift">Add elevator ride</button>` : ""}</div>
      <p class="hint">New steps are routed automatically around racks, walls and devices. Drag the step markers on the timeline to change when each step happens.</p></div>`;
  const list = body.querySelector(".steps7");
  list.querySelectorAll("li").forEach((li) => {
    li.querySelector(".row7").onclick = (e) => { if (e.target.closest("button")) return; ed.stepSel = +li.dataset.i; const it = X.F().items[ed.stepSel + 1]; if (it) { MF.seek(it.tm); MF.pause(); } render(); };
    li.ondragstart = (e) => { e.dataTransfer.setData("text/plain", li.dataset.i); li.classList.add("drag"); };
    li.ondragend = () => li.classList.remove("drag");
    li.ondragover = (e) => { e.preventDefault(); li.classList.add("over"); }; li.ondragleave = () => li.classList.remove("over");
    li.ondrop = (e) => { e.preventDefault(); li.classList.remove("over"); const from = +e.dataTransfer.getData("text/plain"), to = +li.dataset.i; moveStep(from, to); };
  });
  list.querySelectorAll("[data-play]").forEach((b) => (b.onclick = () => { const it = X.F().items[+b.dataset.play + 1]; if (it) { MF.seek(it.t0); MF.play(); } }));
  list.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => moveStep(+b.dataset.up, +b.dataset.up - 1)));
  list.querySelectorAll("[data-dn]").forEach((b) => (b.onclick = () => moveStep(+b.dataset.dn, +b.dataset.dn + 1)));
  const acts = {
    newFlow: () => { const n = nodeList()[0]; if (!n) return X.tip("Add a stop first"); const nf = { id: uid("flow"), name: "New flow", color: "#2bd4c0", steps: [{ node: n.id, title: n.text || "Start", what: "The trolley starts here.", mode: "flow", view: "3d", dist: 300, path: null, dwell: 1.2 }] }; commit("new flow", () => doc.flows.push(nf)); MF.setFlow(doc.flows.length - 1); ed.stepSel = 0; render(); },
    dupFlow: () => { const c = clone(f); c.id = uid("flow"); c.name = f.name + " (copy)"; commit("duplicate flow", () => doc.flows.splice(fi + 1, 0, c)); if (doc.director[f.id]) doc.director[c.id] = clone(doc.director[f.id]); MF.setFlow(fi + 1); render(); },
    delFlow: () => { if (doc.flows.length < 2) return X.tip("A project keeps at least one flow"); if (!acts.delFlow.armed) { acts.delFlow.armed = true; X.tip("Click Delete flow again to confirm"); setTimeout(() => (acts.delFlow.armed = false), 3000); return; } acts.delFlow.armed = false; commit("delete flow " + f.name, () => { doc.flows.splice(fi, 1); delete doc.director[f.id]; }); MF.setFlow(Math.max(0, fi - 1)); render(); },
    left: () => { if (fi < 1) return; commit("move flow", () => { const [x] = doc.flows.splice(fi, 1); doc.flows.splice(fi - 1, 0, x); }); MF.setFlow(fi - 1); render(); },
    right: () => { if (fi >= doc.flows.length - 1) return; commit("move flow", () => { const [x] = doc.flows.splice(fi, 1); doc.flows.splice(fi + 1, 0, x); }); MF.setFlow(fi + 1); render(); },
    route: () => autoRoute(fi, ed.stepSel),
    reverse: () => { if (f.steps.some((x) => x.lift)) return X.tip("Paths with an elevator ride cannot be reversed (rides go up only)"); commit("reverse path", () => { f.steps.reverse(); f.steps[0].path = null; for (let k = 1; k < f.steps.length; k++) relink(f, k, true); }); render(); },
    delStep: () => { if (f.steps.length < 2) return X.tip("A flow keeps at least one step"); const i = ed.stepSel; commit("delete step " + (i + 1), () => { f.steps.splice(i, 1); for (let k = i; k < f.steps.length; k++) relink(f, k); }); ed.stepSel = Math.min(i, f.steps.length - 1); render(); },
    addStep: () => { const id = +$("addStop").value, n = doc.nodes[id]; if (!n) return; const at = ed.stepSel + 1; commit("add step", () => { f.steps.splice(at, 0, { node: id, title: n.text || "Step", what: "", mode: "flow", view: "3d", dist: 300, path: null, dwell: 1.2 }); relink(f, at, true); for (let k = at + 1; k < f.steps.length; k++) relink(f, k); }); ed.stepSel = at; render(); },
    addLift: () => {
      const e = ELEVATORS.find((x) => x.label === $("addElev").value); if (!e) return; const at = ed.stepSel + 1;
      const findOrMake = (p, label) => { let n = nodeList().find((q) => Math.hypot(q.x - p[0], q.y - p[1]) < .05); if (!n) { const id = newId(); n = doc.nodes[id] = { id, x: p[0], y: p[1], plate: plateOf(p[0], p[1]), kind: "area", mode: "none", fill: "#156082", text: label, target: [p[0], p[1]] }; } return n; };
      commit("add elevator ride", () => { const lo = findOrMake(e.low, e.label + " (lower)"), hi = findOrMake(e.high, e.label + " (upper)"); f.steps.splice(at, 0, { node: lo.id, title: "To " + e.label, what: "", mode: "flow", view: "3d", dist: 300, path: null, dwell: .6 }, { node: hi.id, title: e.label + " ride", what: e.label + " carries the trolley between the floors.", path: "lift", mode: "flow", view: "3d", dist: 300, lift: true, elevator: e.label, dwell: 1 }); relink(f, at, true); for (let k = at + 2; k < f.steps.length; k++) relink(f, k); });
      ed.stepSel = at + 1; render();
    },
  };
  body.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => acts[b.dataset.a] && acts[b.dataset.a]()));
  bindFields(body, (path, v) => {
    const [o, k] = path.split("."), s = f.steps[ed.stepSel];
    if (o === "flow") return commit("edit flow " + k, () => { if (k === "trolleys") { f.trolleys = Math.max(1, Math.min(12, Math.round(v))); if (f.trolleys < 2) delete f.trolleys; } else if (k === "headway") f.headway = Math.max(1, v); else f[k] = v; });
    commit("edit step " + k, () => {
      if (k === "node") { s.node = +v; relink(f, ed.stepSel, true); relink(f, ed.stepSel + 1); }
      else if (k === "dwell") { if (v === "" || !Number.isFinite(v)) delete s.dwell; else s.dwell = Math.max(0, v); }
      else if (k === "dist") s.dist = Math.max(10, v / PT_M);
      else if (k === "speed") { if (v === "" || !Number.isFinite(v) || v === 4) delete s.speed; else s.speed = Math.min(8, Math.max(.2, v)); }
      else s[k] = v;
    });
  });
}
function moveStep(from, to) {
  const f = curFlow(); if (to < 0 || to >= f.steps.length || from === to) return;
  commit("reorder steps", () => { const [x] = f.steps.splice(from, 1); f.steps.splice(to, 0, x); for (let k = 0; k < f.steps.length; k++) relink(f, k); });
  ed.stepSel = to; render(); const bad = validateFlow(curFlow()).length; if (bad) X.tip(`${bad} link issue(s) after the reorder: see Paths`);
}

/* ---- Director tab ---- */
function renderDirector() {
  const d = dirOf(), f = curFlow(), total = X.F().total;
  body.innerHTML = `<div class="sec"><h4>Camera shots · ${esc(f ? f.name : "")}</h4><p class="hint">Frame the view with the pad or the mouse, then add a key. The director camera glides through the keys along the timeline. A trolley-locked key rides with the trolley.</p>
    <div class="acts"><button data-a="key" class="pri">+ Key here (K)</button><button data-a="keyF">+ Trolley-locked key</button><button data-a="rec" class="${camRec.on ? "recon" : ""}">${camRec.on ? "■ Stop camera recording" : "● Record camera move"}</button><button data-a="play">${S.cam === "director" ? "Director camera on" : "▶ Watch director cut"}</button></div>
    <ul class="list7 keys">${d.keys.map((k) => `<li data-k="${k.id}" class="${dsel.key === k.id ? "on" : ""}"><input type="number" step="0.1" min="0" max="${total.toFixed(1)}" data-f="t:${k.id}" value="${k.t.toFixed(2)}" title="Time (s)"><select data-f="ease:${k.id}" title="How the camera arrives at this key">${opt("smooth", "Smooth", k.ease)}${opt("linear", "Linear", k.ease)}${opt("in", "Ease in", k.ease)}${opt("out", "Ease out", k.ease)}${opt("cut", "Cut", k.ease)}</select><label class="chk" title="Ride with the trolley"><input type="checkbox" data-f="follow:${k.id}" ${k.follow ? "checked" : ""}>ride</label><button data-go="${k.id}" title="Go to this key">Go</button><button data-up="${k.id}" title="Replace with the current view">Set</button><button data-del="${k.id}" class="danger" title="Delete">✕</button></li>`).join("") || "<li class='empty'>No keys yet</li>"}</ul></div>
    <div class="sec"><h4>Captions</h4><label>Language shown and edited<select id="capLang">${LANGS.map(([v, l]) => opt(v, l, lang())).join("")}</select></label><p class="hint">Explanation texts shown over the scene for a time range (also in recorded videos). The step cards are edited in Steps.</p><div class="acts"><button data-a="cap" class="pri">+ Caption here</button></div>
    ${d.caps.map((c) => `<div class="card7 cap ${dsel.cap === c.id ? "on" : ""}" data-c="${c.id}"><div class="g3"><label>From (s)<input type="number" step="0.1" min="0" data-f="t0:${c.id}" value="${c.t0.toFixed(1)}"></label><label>To (s)<input type="number" step="0.1" min="0" data-f="t1:${c.id}" value="${c.t1.toFixed(1)}"></label><label>Size<input type="range" min="0.7" max="1.8" step="0.05" data-f="size:${c.id}" value="${c.size || 1}"></label></div>
      <label>Title (${lang().toUpperCase()})<input dir="${lang() === "ar" ? "rtl" : "ltr"}" data-f="title:${c.id}" value="${esc(trEdit(c.title))}" placeholder="${esc(tr(c.title, "en"))}"></label><label>Text (${lang().toUpperCase()})<textarea dir="${lang() === "ar" ? "rtl" : "ltr"}" rows="2" data-f="text:${c.id}" placeholder="${esc(tr(c.text, "en"))}">${esc(trEdit(c.text))}</textarea></label>
      <div class="g2"><label>Place<select data-f="pos:${c.id}">${opt("lower", "Lower third", c.pos)}${opt("upper", "Top", c.pos)}${opt("center", "Centre", c.pos)}${opt("left", "Left", c.pos)}${opt("right", "Right", c.pos)}</select></label><label>Style<select data-f="style:${c.id}">${opt("glass", "Glass", c.style)}${opt("cinema", "Cinema", c.style)}${opt("banner", "Banner", c.style)}${opt("minimal", "Minimal", c.style)}</select></label></div>
      <div class="acts"><button data-cs="${c.id}">Start = now</button><button data-ce="${c.id}">End = now</button><button data-cg="${c.id}">Go</button><button data-cd="${c.id}" class="danger">Delete</button></div></div>`).join("")}</div>
    <div class="sec"><h4>Video takes</h4><p class="hint">A take replays a time range of a flow and saves it as a video (WebM) with the director camera, labels, cards and captions. Edit a take and record it again at any time.</p>
    <div class="acts"><button data-a="take" class="pri">+ New take</button></div>
    ${doc.takes.map((t) => `<div class="card7 take" data-tk="${t.id}"><label>Name<input data-f="name:${t.id}" value="${esc(t.name)}"></label><label>Flow<select data-f="flow:${t.id}">${doc.flows.map((fl) => opt(fl.id, fl.name, t.flow)).join("")}</select></label>
      <div class="g3"><label>In (s)<input type="number" step="0.1" min="0" data-f="t0:${t.id}" value="${t.t0.toFixed(1)}"></label><label>Out (s)<input type="number" step="0.1" min="0" data-f="t1:${t.id}" value="${t.t1.toFixed(1)}"></label><label>Speed<select data-f="speed:${t.id}">${[.5, 1, 1.5, 2, 3].map((v) => opt(v, v + "x", t.speed)).join("")}</select></label></div>
      <div class="g2"><label>Camera<select data-f="cam:${t.id}">${opt("director", "Director cut", t.cam)}${opt("guided", "Guided", t.cam)}${opt("chase", "Ride with the trolley", t.cam)}${opt("keep", "As it is now", t.cam)}</select></label><label>Quality<select data-f="quality:${t.id}">${opt("high", "High (16 Mbit/s)", t.quality)}${opt("normal", "Normal (8 Mbit/s)", t.quality)}</select></label></div>
      <div class="chks"><label class="chk"><input type="checkbox" data-f="captions:${t.id}" ${t.captions ? "checked" : ""}>Captions</label><label class="chk"><input type="checkbox" data-f="card:${t.id}" ${t.card ? "checked" : ""}>Step card</label><label class="chk"><input type="checkbox" data-f="labels:${t.id}" ${t.labels ? "checked" : ""}>Labels</label></div>
      <div class="acts"><button data-ti="${t.id}">In = now</button><button data-to="${t.id}">Out = now</button><button data-tp="${t.id}">▶ Preview</button><button data-tr="${t.id}" class="pri">● Record video</button><button data-td="${t.id}" class="danger">✕</button></div></div>`).join("")}</div>`;
  $("capLang").onchange = (e) => { commit("caption language", () => { doc.settings.lang = e.target.value; }, "director"); render(); };
  const acts = { key: () => addKey(), keyF: () => addKey({ follow: true }), rec: () => (camRec.on ? stopCamRec() : startCamRec()), play: () => { if (!dirOf().keys.length) return X.tip("Add camera keys first"); MF.setCam("director"); MF.seek(0); MF.play(); render(); }, cap: addCaption, take: () => commit("new take", () => doc.takes.push(newTake()), "director") };
  body.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => { acts[b.dataset.a](); render(); renderLanes(); }));
  const keyOf = (id) => d.keys.find((k) => k.id === id), capOf = (id) => d.caps.find((c) => c.id === id), takeOf = (id) => doc.takes.find((t) => t.id === id);
  const on = (attr, fn) => body.querySelectorAll(`[${attr}]`).forEach((b) => (b.onclick = () => { fn(b.getAttribute(attr)); render(); renderLanes(); }));
  on("data-go", (id) => { const k = keyOf(id); dsel.key = id; MF.seek(k.t); MF.pause(); if (S.cam !== "director") flyTo(evalDirector(k.t), .8); });
  on("data-up", updateKey); on("data-del", deleteKey);
  on("data-cs", (id) => commit("caption start", () => { const c = capOf(id); c.t0 = +S.t.toFixed(2); if (c.t1 < c.t0 + .3) c.t1 = c.t0 + 3; }, "director"));
  on("data-ce", (id) => commit("caption end", () => { const c = capOf(id); c.t1 = Math.max(c.t0 + .3, +S.t.toFixed(2)); }, "director"));
  on("data-cg", (id) => { MF.seek(capOf(id).t0 + .4); MF.pause(); dsel.cap = id; });
  on("data-cd", (id) => commit("delete caption", () => { d.caps = d.caps.filter((c) => c.id !== id); }, "director"));
  on("data-ti", (id) => commit("take in", () => { takeOf(id).t0 = +S.t.toFixed(2); }, "director"));
  on("data-to", (id) => commit("take out", () => { takeOf(id).t1 = +S.t.toFixed(2); }, "director"));
  on("data-tp", (id) => { const t = takeOf(id), fi = doc.flows.findIndex((fl) => fl.id === t.flow); if (fi >= 0 && fi !== S.flow) MF.setFlow(fi); if (t.cam === "director" && dirOf().keys.length) MF.setCam("director"); else if (t.cam !== "keep") MF.setCam(t.cam); X.setSpeed(t.speed); MF.seek(t.t0); MF.play(); });
  on("data-tr", (id) => startTake(takeOf(id)));
  on("data-td", (id) => commit("delete take", () => { doc.takes = doc.takes.filter((t) => t.id !== id); }, "director"));
  bindFields(body, (path, v) => {
    const [k, id] = path.split(":"), key = keyOf(id), cap = capOf(id), take = takeOf(id);
    commit("edit " + k, () => {
      if (key) { if (k === "t") key.t = clamp(v, 0, total); else if (k === "follow") { key.follow = v; const p = trolleyWorld(key.t); key.ox = key.x - p.x; key.oy = key.y - p.y; key.oz = key.z - p.z; if (!v) { key.x = p.x + (key.ox || 0); } } else key[k] = v; sortKeys(d); }
      else if (cap) { if (k === "t0" || k === "t1") cap[k] = clamp(v, 0, total); else if (k === "title" || k === "text") setTr(cap, k, v); else cap[k] = v; if (cap.t1 < cap.t0 + .2) cap.t1 = cap.t0 + .2; }
      else if (take) { if (k === "speed") take.speed = +v; else take[k] = v; }
    }, "director");
    if (k === "size") return; render(); renderLanes();
  });
}

/* ---- Project tab ---- */
function renderProject() {
  const src = { original: "the original data in this file", browser: "a scene saved in this browser", file: "a scene baked into this file" }[MF7.source] || MF7.source;
  body.innerHTML = `<div class="sec card7"><div class="ct"><b>${esc(doc.title)}</b><span>${esc(PROJECT)}</span></div><label>Title<input data-f="title" value="${esc(doc.title)}"></label>
    <p class="hint">This view started from ${src}. Every change is saved in this browser automatically (Ctrl+S saves at once). Export the scene to keep it as a file or share it; Import loads one.</p>
    <div class="acts"><button data-a="save" class="pri">Save scene file</button><button data-a="export">Download scene (.json)</button><button data-a="import">Open scene file…</button><button data-a="reset" class="danger">Reset to original</button></div>
    <input type="file" id="imp7" accept=".json,application/json" hidden>${MF7.error ? `<p class="bad">The saved scene had a problem: ${esc(MF7.error)}</p>` : ""}</div>
    <div class="sec card7"><div class="ct"><b>This scene</b></div><p class="hint">${doc.flows.length} flows · ${doc.flows.reduce((n, f) => n + f.steps.length, 0)} steps · ${nodeList().length} stops · ${doc.devices.length} devices · ${doc.props.length} props · ${Object.keys(doc.replica).length} replica edits · ${Object.values(doc.director).reduce((n, d) => n + (d.keys || []).length, 0)} camera keys · ${Object.values(doc.director).reduce((n, d) => n + (d.caps || []).length, 0)} captions · ${doc.takes.length} takes</p><p class="hint">Undo history: ${undoStack.length} change(s).</p></div>
    <div class="sec card7"><div class="ct"><b>Keys and mouse</b></div><table class="keys7">
    <tr><td>Left drag</td><td>Orbit (on an object: move it)</td></tr><tr><td>Right drag / Shift</td><td>Pan</td></tr><tr><td>Wheel</td><td>Zoom toward the cursor</td></tr><tr><td>Double-click</td><td>Fly to that point (on a path leg: add a corner)</td></tr>
    <tr><td>Delete</td><td>Delete the selection or the corner under the mouse</td></tr><tr><td>Ctrl+Z / Ctrl+Y</td><td>Undo / redo</td></tr><tr><td>Ctrl+D</td><td>Duplicate</td></tr><tr><td>Q / E</td><td>Turn 15° (Shift: 90°)</td></tr><tr><td>Arrows</td><td>Nudge one snap step (Shift: ×10)</td></tr><tr><td>K</td><td>Add a director camera key</td></tr><tr><td>Esc</td><td>Stop the tool / clear the selection</td></tr></table></div>`;
  const acts = {
    save: () => { saveNow(); MFS.save(); },
    export: () => { saveNow(); MFS.download(); },
    import: () => MFS.openFile(),
    reset: () => { if (!acts.reset.armed) { acts.reset.armed = true; X.tip("Click Reset again within 3 s: the saved scene is forgotten and the original comes back"); setTimeout(() => (acts.reset.armed = false), 3000); return; } try { localStorage.removeItem(storageKey()); } catch (e) {} location.reload(); },
  };
  body.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => acts[b.dataset.a]()));
  $("imp7").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { const o = JSON.parse(await file.text()); if (!o || o.format !== "mf7-scene") throw new Error("not a Material Flow scene file"); if (o.project && o.project !== PROJECT) throw new Error(`this scene is for ${o.project}; open that tab first`); localStorage.setItem(storageKey(), JSON.stringify(o)); location.reload(); }
    catch (err) { X.tip("Import failed: " + err.message); }
  };
  bindFields(body, (f, v) => commit("rename project", () => { doc.title = v; }));
}

/* ---------- timeline lanes: camera keys, captions, draggable step markers ---------- */
const barEl = $("bar"), scrubEl = $("scrub"), lanes = h(`<div id="lanes7"><div class="ln"><span class="lb">Camera</span><div class="tk" id="lnKeys"></div><span class="rb"></span></div><div class="ln"><span class="lb">Text</span><div class="tk" id="lnCaps"></div><span class="rb"></span></div></div>`);
barEl.insertBefore(lanes, barEl.querySelector(".line"));
const stepMarks = h('<div id="sm7"></div>'); scrubEl.appendChild(stepMarks);
function renderLanes() {
  const show = ed.open, total = X.F().total || 1; lanes.style.display = show ? "block" : "none"; document.body.classList.toggle("lanes7", show);
  stepMarks.innerHTML = ""; if (!show) return;
  const d = dirOf(), pct = (t) => clamp(t / total * 100, 0, 100) + "%";
  $("lnKeys").innerHTML = d.keys.map((k) => `<i class="kf ${k.ease} ${dsel.key === k.id ? "on" : ""} ${k.follow ? "fol" : ""}" data-k="${k.id}" style="left:${pct(k.t)}" title="${fmtT(k.t)} · ${k.ease}${k.follow ? " · rides with the trolley" : ""}"></i>`).join("");
  $("lnCaps").innerHTML = d.caps.map((c) => `<i class="cb ${dsel.cap === c.id ? "on" : ""}" data-c="${c.id}" style="left:${pct(c.t0)};width:calc(${pct(c.t1)} - ${pct(c.t0)})" title="${esc(c.title || c.text)}"><b>${esc(c.title || c.text)}</b><u class="e0"></u><u class="e1"></u></i>`).join("");
  const items = X.F().items;
  stepMarks.innerHTML = items.map((it, j) => (j < 2 ? "" : `<b class="smk" data-j="${j}" style="left:${pct(it.tm)}" title="Step ${it.i}: ${esc(it.s.title)} · drag to change when it arrives"></b>`)).join("");
  // drags
  const trackT = (el, e) => { const r = el.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * total; };
  const dragEl = (sel, onMove, onUp) => lanes.querySelectorAll(sel).forEach((el) => {
    el.onpointerdown = (e) => { e.stopPropagation(); e.preventDefault(); el.setPointerCapture(e.pointerId); const before = snapshot(), t0 = trackT(el.parentElement, e); let moved = false; el.onpointermove = (ev) => { moved = true; onMove(el, trackT(el.parentElement, ev) - t0, e); renderLanesSoft(); }; el.onpointerup = () => { el.onpointermove = null; if (moved) commitFrom(before, "retime", "director"); else onUp(el); render(); renderLanes(); }; };
  });
  const keyStart = new Map(), capStart = new Map();
  dragEl(".kf", (el, dt) => { const k = d.keys.find((q) => q.id === el.dataset.k); if (!keyStart.has(k.id)) keyStart.set(k.id, k.t); k.t = +clamp(keyStart.get(k.id) + dt, 0, total).toFixed(2); }, (el) => { const k = d.keys.find((q) => q.id === el.dataset.k); dsel.key = k.id; MF.seek(k.t); MF.pause(); if (ed.tab !== "director") setTab("director"); });
  lanes.querySelectorAll(".cb").forEach((el) => {
    el.onpointerdown = (e) => {
      e.stopPropagation(); e.preventDefault(); const c = d.caps.find((q) => q.id === el.dataset.c), edge = e.target.classList.contains("e0") ? 0 : e.target.classList.contains("e1") ? 1 : -1, before = snapshot(), t0 = trackT(el.parentElement, e), a = c.t0, b = c.t1; let moved = false;
      el.setPointerCapture(e.pointerId);
      el.onpointermove = (ev) => { moved = true; const dt = trackT(el.parentElement, ev) - t0; if (edge === 0) c.t0 = +clamp(a + dt, 0, b - .2).toFixed(2); else if (edge === 1) c.t1 = +clamp(b + dt, a + .2, total).toFixed(2); else { const w = b - a, n = clamp(a + dt, 0, total - w); c.t0 = +n.toFixed(2); c.t1 = +(n + w).toFixed(2); } renderLanesSoft(); };
      el.onpointerup = () => { el.onpointermove = null; if (moved) commitFrom(before, "retime caption", "director"); else { dsel.cap = c.id; MF.seek(c.t0 + .3); MF.pause(); if (ed.tab !== "director") setTab("director"); } render(); renderLanes(); };
      void capStart;
    };
  });
  stepMarks.querySelectorAll(".smk").forEach((el) => {
    el.onpointerdown = (e) => {
      e.stopPropagation(); e.preventDefault(); el.setPointerCapture(e.pointerId); const j = +el.dataset.j, f = curFlow(), prevItem = X.F().items[j - 1], prevStep = f.steps[j - 2], baseDwell = prevItem.t1 - prevItem.tm, before = snapshot(), r = scrubEl.getBoundingClientRect(), x0 = e.clientX, tm = X.F().items[j].tm; let moved = false;
      el.onpointermove = (ev) => { moved = true; const dt = (ev.clientX - x0) / r.width * total; prevStep.dwell = +Math.max(.1, baseDwell + dt).toFixed(2); el.style.left = clamp((tm + prevStep.dwell - baseDwell) / total * 100, 0, 100) + "%"; el.dataset.tip = `wait ${prevStep.dwell.toFixed(1)} s at step ${j - 1}`; X.tip(`Step ${j - 1} waits ${prevStep.dwell.toFixed(1)} s`); };
      el.onpointerup = () => { el.onpointermove = null; if (moved) commitFrom(before, "retime step " + (j - 1)); else { MF.seek(tm); MF.pause(); } renderLanes(); render(); };
    };
  });
}
function renderLanesSoft() { const d = dirOf(), total = X.F().total || 1, pct = (t) => clamp(t / total * 100, 0, 100) + "%"; for (const el of lanes.querySelectorAll(".kf")) { const k = d.keys.find((q) => q.id === el.dataset.k); if (k) el.style.left = pct(k.t); } for (const el of lanes.querySelectorAll(".cb")) { const c = d.caps.find((q) => q.id === el.dataset.c); if (c) { el.style.left = pct(c.t0); el.style.width = `calc(${pct(c.t1)} - ${pct(c.t0)})`; } } }

/* ---------- REC heads-up ---------- */
const hud = h(`<div id="rec7hud"><i></i><b>REC</b><span id="recT">0:00</span><span id="recN"></span><button id="recStop">Stop</button></div>`); document.body.appendChild(hud);
$("recStop").onclick = stopTake;

/* ---------- mouse on the scene: studio camera + editor ---------- */
let sd = null;
const flatNow = () => S.c.pol < .05;
function editDown(e) {
  const x = e.clientX, y = e.clientY;
  if (ed.placing || ed.drawing) return null;
  const gz = gizmo();
  if (gz && Math.hypot(gz.knob[0] - x, gz.knob[1] - y) < 13) { const before = snapshot(), info = gz.info; return { move: (ev) => { const p = planeHit(ev, info.plate); if (p) rotateSelTo(p.x - info.x, p.y - info.y, ev.shiftKey, true); }, up: (moved) => moved && commitFrom(before, "turn " + info.title, kindRebuild(ed.sel.kind)), cancel: () => cancelTo(before) }; }
  if (gz && Math.hypot(gz.c[0] - x, gz.c[1] - y) < 15) return moveHandler(e);
  if (ed.tab === "paths" || ed.tab === "steps") {
    const ph = pathHandles();
    if (ph) {
      for (let k = 1; k < ph.pts.length - 1; k++) if (near(ph.pts[k], x, y, 10)) return vertexHandler(ph, k);
      for (let k = 1; k < ph.pts.length; k++) { const a = ph.pts[k - 1], b = ph.pts[k]; if (near([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]], x, y, 9)) return segHandler(ph, k); }
    }
  }
  for (const { n, p } of nodeHandles()) if (Math.hypot(p[0] - x, p[1] - y) < 10) { select({ kind: "node", id: n.id }); return moveHandler(e); }
  const hit = pick3D(e);
  if (hit) { select(hit.kind === "device" ? { kind: "device", i: hit.i } : hit.kind === "prop" ? { kind: "prop", id: hit.id } : { kind: "replica", tag: hit.tag }); if (ed.tab !== "objects") setTab("objects"); return moveHandler(e); }
  return null;
}
function moveHandler(e) {
  const info = selInfo(); if (!info) return null; const before = snapshot(), p0 = planeHit(e, info.plate); if (!p0) return null; const off = [info.x - p0.x, info.y - p0.y], sel = ed.sel;
  return { move: (ev) => { const p = planeHit(ev, info.plate); if (!p) return; moveSelTo(snapV(p.x + off[0], ev), snapV(p.y + off[1], ev), true); },
    up: (moved) => { if (!moved) return; if (sel.kind === "node") relinkNode(sel.id); commitFrom(before, "move " + info.title, kindRebuild(sel.kind)); }, cancel: () => cancelTo(before, kindRebuild(sel.kind)) };
}
function vertexHandler(ph, k) {
  const before = snapshot(), P0 = clone(ph.s.path), plate = stepPlate(ph.s); ed.hover = { kind: "vertex", k };
  return { move: (ev) => { const p = planeHit(ev, plate); if (p) ph.s.path = dragVertex(P0, k, [snapV(p.x, ev), snapV(p.y, ev)], doc.settings.ortho); }, up: (moved) => { if (!moved) return; ph.s.path = simplify(ph.s.path); commitFrom(before, "move a corner"); }, cancel: () => cancelTo(before) };
}
function segHandler(ph, k) {
  const before = snapshot(), P0 = clone(ph.s.path), plate = stepPlate(ph.s);
  return { move: (ev) => { const p = planeHit(ev, plate); if (!p) return; const q = [snapV(p.x, ev), snapV(p.y, ev)]; ph.s.path = doc.settings.ortho ? dragSegment(P0, k, q) : dragVertex([...P0.slice(0, k), q, ...P0.slice(k)], k, q, false); }, up: (moved) => { if (!moved) return; ph.s.path = simplify(ph.s.path); commitFrom(before, "move a leg"); }, cancel: () => cancelTo(before) };
}
function editClick(e) {
  if (ed.placing) { const p = hitPlan(e); if (p) placeAt(p, e.shiftKey); render(); return true; }
  if (ed.drawing) {
    const s = doc.flows[ed.drawing.fi].steps[ed.drawing.i], n = doc.nodes[s.node], np = scr(n.x, n.y, 3, [0, 0, 0]);
    if (Math.hypot(np[0] - e.clientX, np[1] - e.clientY) < 16) { finishDraw(); render(); return true; }
    const p = planeHit(e, stepPlate(s)); if (p) ed.drawing.pts.push(drawPoint(p, e)); return true;
  }
  if (sd && sd.miss) { select(null); render(); }
  return false;
}
stage.onpointerdown = (e) => {
  if (rec.active) return; if (e.target.closest && e.target.closest(".chip") && !ed.open) return;
  let hnd = null; if (ed.open && e.button === 0 && !e.altKey) hnd = editDown(e);
  sd = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, btn: e.button, h: hnd, miss: ed.open && e.button === 0 && !hnd, mode: hnd ? "edit" : e.button === 2 || e.button === 1 || e.shiftKey || flatNow() ? "pan" : "orbit", moved: false };
  stage.setPointerCapture(e.pointerId); stage.classList.add("drag");
};
stage.onpointermove = (e) => {
  ed.lastPointer = e;
  if (!sd) { if (ed.open) hoverEdit(e); return; }
  const dx = e.clientX - sd.x, dy = e.clientY - sd.y; sd.x = e.clientX; sd.y = e.clientY; if (!dx && !dy) return;
  if (!sd.moved && Math.hypot(e.clientX - sd.x0, e.clientY - sd.y0) < 4) return; sd.moved = true;
  if (sd.mode === "edit") { sd.h.move(e); return; }
  goFree(true); const g = cam.goal; cam.fly = null;
  if (sd.mode === "pan") { const k = g.dist * Math.tan(camera.fov * Math.PI / 360) * 2 / innerHeight, rx = Math.cos(g.az), rz = -Math.sin(g.az), fx = Math.sin(g.az), fz = Math.cos(g.az), mx = (-dx * rx - dy * fx) * k, mz = (-dx * rz - dy * fz) * k; if (cam.lock) { cam.lockOff.x += mx; cam.lockOff.z += mz; } else { g.x += mx; g.z += mz; } }
  else { g.az -= dx * .006; g.pol = clamp(g.pol - dy * .005, .02, 1.56); }
};
stage.onpointerup = stage.onpointercancel = (e) => {
  if (!sd) return; const d = sd; stage.classList.remove("drag");
  if (d.mode === "edit") { d.h.up(d.moved); sd = null; render(); return; }
  const click = !d.moved && e.type === "pointerup";
  if (click && d.btn === 0) { if (ed.open) editClick(e); else if (S.measure) { const hh = X.hitFloor(e); if (hh) { if (S.pts.length === 2) S.pts = []; S.pts.push(hh.point.clone()); } } }
  if (click && d.btn === 2 && ed.open) {
    if (ed.drawing && ed.drawing.pts.length > 1) ed.drawing.pts.pop();
    else { const ph = pathHandles(); let done = false; if (ph) for (let k = 1; k < ph.pts.length - 1; k++) if (near(ph.pts[k], e.clientX, e.clientY, 10)) { removeVertex(ph.f, ph.i, k); done = true; break; } if (!done) contextMenu(e); }
  }
  sd = null;
};
stage.onwheel = (e) => { e.preventDefault(); if (rec.active) return; const hp = hitPlan(e); zoomBy(e.deltaY > 0 ? 1.13 : .885, hp && hp.world); };
stage.ondblclick = (e) => {
  if (rec.active || S.measure) return;
  if (ed.open && (ed.tab === "paths" || ed.tab === "steps")) { const ph = pathHandles(); if (ph) for (let k = 1; k < ph.pts.length; k++) { const [dd, t] = segDist(e.clientX, e.clientY, ph.pts[k - 1], ph.pts[k]); if (dd < 8 && onScreen(ph.pts[k])) { const a = ph.s.path[k - 1], b = ph.s.path[k]; insertVertex(ph.f, ph.i, k, [snapV(lerp(a[0], b[0], t)), snapV(lerp(a[1], b[1], t))]); return; } } }
  const hp = hitPlan(e); if (hp) { cam.lock = false; flyTo({ x: hp.world.x, y: hp.world.y, z: hp.world.z, dist: cam.goal.dist * .7 }, .8); }
};
function hoverEdit(e) {
  const x = e.clientX, y = e.clientY; let cur = "", hov = null;
  if (ed.placing) { const p = hitPlan(e); if (p) { const px = snapV(p.x), py = snapV(p.y); ed.placing.at = [px, py]; ed.placing.rect = placeRect(ed.placing.kind, px, py); ed.placing.ok = !rectClash(ed.placing.rect, p.plate); } cur = "copy"; }
  else if (ed.drawing) { const s = doc.flows[ed.drawing.fi].steps[ed.drawing.i], p = planeHit(e, stepPlate(s)); ed.drawing.preview = p ? drawPoint(p, e) : null; cur = "crosshair"; }
  else {
    const gz = gizmo(); if (gz && Math.hypot(gz.knob[0] - x, gz.knob[1] - y) < 13) cur = "grab"; else if (gz && Math.hypot(gz.c[0] - x, gz.c[1] - y) < 15) cur = "move";
    if (!cur && (ed.tab === "paths" || ed.tab === "steps")) { const ph = pathHandles(); if (ph) { for (let k = 1; k < ph.pts.length - 1; k++) if (near(ph.pts[k], x, y, 10)) { cur = "move"; hov = { kind: "vertex", k }; } if (!cur) for (let k = 1; k < ph.pts.length; k++) { const a = ph.pts[k - 1], b = ph.pts[k]; if (near([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]], x, y, 9)) cur = Math.abs(a[0] - b[0]) > Math.abs(a[1] - b[1]) ? "ns-resize" : "ew-resize"; } } }
    if (!cur) for (const { n, p } of nodeHandles()) if (Math.hypot(p[0] - x, p[1] - y) < 10) { cur = "pointer"; hov = { kind: "node", id: n.id }; break; }
  }
  ed.hover = hov; stage.style.cursor = cur;
}

/* ---------- keys ---------- */
addEventListener("keydown", (e) => {
  const t = e.target, tag = t.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey; let act = null;
  if (rec.active) { if (k === "escape") act = stopTake; }
  else if (k === "f1") act = () => toggleKeys();
  else if (ctrl && k === "z") act = e.shiftKey ? redo : undo; else if (ctrl && k === "y") act = redo; else if (ctrl && k === "s") act = saveNow;
  else if (ed.open && !ctrl) {
    if (sd && sd.mode === "edit" && k === "escape") act = () => { sd.h.cancel && sd.h.cancel(); sd = null; };
    else if (k === "escape" && ctx.style.display === "flex") act = hideCtx;
    else if (k === "escape" && keysEl.style.display === "block") act = () => toggleKeys(false);
    else if (k === "escape") act = () => { if (ed.placing || ed.drawing) { ed.placing = null; ed.drawing = null; } else select(null); render(); };
    else if (k === "enter" && ed.drawing) act = () => { finishDraw(); render(); };
    else if ((k === "delete" || k === "backspace") && ed.hover && ed.hover.kind === "vertex") act = () => { const ph = pathHandles(); if (ph) removeVertex(ph.f, ph.i, ed.hover.k); ed.hover = null; };
    else if ((k === "delete" || k === "backspace") && ed.sel) act = () => { deleteSel(); render(); };
    else if (k === "k") act = () => { addKey({ follow: e.shiftKey }); if (ed.tab === "director") render(); renderLanes(); };
    else if (e.altKey && k >= "1" && k <= "6") act = () => setTab(["objects", "paths", "steps", "director", "numbers", "project"][+k - 1]);
    else if (k === "f1" || e.key === "?") act = toggleKeys;
    else if (k === "s") act = () => { straighten(e.shiftKey ? "flow" : "step"); render(); };
    else if (k === "l") act = () => { lShape(); render(); };
    else if (k === "r") act = () => { if (e.shiftKey) autoRouteFlow(); else autoRoute(S.flow, ed.stepSel); render(); };
    else if (k === "b") act = () => startDraw(S.flow, ed.stepSel);
    else if (k === "o") act = () => { doc.settings.ortho = !doc.settings.ortho; scheduleSave(); syncToolbar(); X.tip("Ortho " + (doc.settings.ortho ? "on" : "off")); };
    else if (k === "g") act = () => { const c = [0, .1, .5, 1, 2], i = (c.indexOf(doc.settings.snap) + 1) % c.length; doc.settings.snap = c[i]; scheduleSave(); syncToolbar(); X.tip("Snap " + (c[i] ? c[i] + " m" : "off")); };
    else if (k === "v") act = () => { ed.placing = null; ed.drawing = null; select(null); render(); };
    else if (k === "n") act = () => { startPlace("stop"); render(); };
    else if (k === "p" && !e.shiftKey) act = () => { if (lastPlace) { startPlace(lastPlace); render(); } };
    else if (k === "f" && ed.sel) act = () => { const i = selInfo(); if (i) focusPlan(i.x, i.y, i.plate); };
    else if (k === "c" && !e.shiftKey) act = () => { addCaption(); setTab("director"); };
    else if (k === "j") act = () => { camRec.on ? stopCamRec() : startCamRec(); render(); };
    else if (k === "p" && e.shiftKey) act = () => { if (dirOf().keys.length) { MF.setCam("director"); MF.seek(0); MF.play(); } };
    else if (k === "pageup" || k === "pagedown") act = () => { const n = curFlow().steps.length; ed.stepSel = clamp(ed.stepSel + (k === "pagedown" ? 1 : -1), 0, n - 1); if (ed.tab !== "paths" && ed.tab !== "steps") setTab("paths"); else render(); };
    else if (ed.sel && (e.key === "+" || e.key === "=" || e.key === "-")) act = () => scaleSel(e.key === "-" ? 1 / 1.1 : 1.1);
    else if (ed.sel && (k === "q" || k === "e")) act = () => { rotateSelBy((k === "e" ? 1 : -1) * (e.shiftKey ? 90 : 15)); render(); };
    else if (ed.sel && k.startsWith("arrow")) { const st = (snapStep() || .5 * M) * (e.shiftKey ? 10 : 1); act = () => { nudge(k === "arrowleft" ? -st : k === "arrowright" ? st : 0, k === "arrowup" ? -st : k === "arrowdown" ? st : 0); render(); }; }
  } else if (ctrl && k === "d" && ed.open) act = () => { duplicateSel(); render(); };
  else if (!ed.open && k === "k" && (S.cam === "free" || pad.style.display === "flex")) act = () => addKey();
  if (ed.open && ctrl && k === "d") act = () => { duplicateSel(); render(); };
  if (act) { e.preventDefault(); e.stopImmediatePropagation(); act(); }
}, true);

/* ---------- right-click menu ---------- */
const ctx = h('<div id="ctx7" class="glass" role="menu"></div>'); document.body.appendChild(ctx);
function hideCtx() { ctx.style.display = "none"; }
addEventListener("pointerdown", (e) => { if (!e.target.closest || !e.target.closest("#ctx7")) hideCtx(); }, true);
function contextMenu(e) {
  let hit = null; for (const { n, p } of nodeHandles()) if (Math.hypot(p[0] - e.clientX, p[1] - e.clientY) < 10) { hit = { kind: "node", id: n.id }; break; }
  if (!hit) { const h3 = pick3D(e); if (h3) hit = h3.kind === "device" ? { kind: "device", i: h3.i } : h3.kind === "prop" ? { kind: "prop", id: h3.id } : { kind: "replica", tag: h3.tag }; }
  const items = [], floor = hitPlan(e);
  if (hit) {
    select(hit); const k = hit.kind, info = selInfo();
    items.push(["<b>" + esc(info ? info.title : "") + "</b>", null]);
    items.push(["Fly to it (F)", () => { focusPlan(info.x, info.y, info.plate); }]);
    if (k !== "replica") items.push(["Duplicate (Ctrl+D)", duplicateSel]);
    if (k === "node") { items.push(["Straighten paths here (S)", () => straighten("step")]); items.push(["Add a step to this stop", () => { const f = curFlow(), at = ed.stepSel + 1, n = doc.nodes[hit.id]; commit("add step", () => { f.steps.splice(at, 0, { node: n.id, title: n.text || "Step", what: "", mode: "flow", view: "3d", dist: 300, path: null, dwell: 1.2 }); relink(f, at, true); for (let q = at + 1; q < f.steps.length; q++) relink(f, q); }); ed.stepSel = at; setTab("steps"); }]); }
    else { items.push(["Turn 90° (Shift+E)", () => rotateSelBy(90)]); if (k !== "replica") { items.push(["Bigger (+)", () => scaleSel(1.1)]); items.push(["Smaller (−)", () => scaleSel(1 / 1.1)]); } }
    items.push(["Delete (Del)", deleteSel, "danger"]);
  } else if (floor) {
    items.push(["<b>Here</b>", null]);
    items.push(["Place a stop here", () => { ed.placing = { kind: "stop" }; placeAt(floor, false); }]);
    items.push(["Place a crate here", () => { ed.placing = { kind: "prop-box" }; placeAt(floor, false); }]);
    if (lastPlace) items.push(["Place " + esc(ADD[lastPlace].label) + " here", () => { ed.placing = { kind: lastPlace }; placeAt(floor, false); }]);
    items.push(["Fly here", () => flyTo({ x: floor.world.x, y: floor.world.y, z: floor.world.z, dist: cam.goal.dist * .7 }, .8)]);
    items.push(["Add a camera key here (K)", () => addKey()]);
  } else return;
  ctx.innerHTML = items.map(([t, f, c], i) => f ? '<button data-i="' + i + '" class="' + (c || "") + '">' + t + "</button>" : '<div class="t">' + t + "</div>").join("");
  ctx.querySelectorAll("button").forEach((b) => (b.onclick = () => { hideCtx(); items[+b.dataset.i][1](); render(); }));
  ctx.style.display = "flex"; const w = ctx.offsetWidth, hh = ctx.offsetHeight; ctx.style.left = Math.min(e.clientX, innerWidth - w - 8) + "px"; ctx.style.top = Math.min(e.clientY, innerHeight - hh - 8) + "px";
}

/* ---------- a picture of the view (PNG), composed like a video frame ---------- */
let photoPending = false;
function takePhoto() {
  photoPending = false; const keep = { comp: rec.comp, cg: rec.cg, take: rec.take };
  rec.comp = document.createElement("canvas"); rec.comp.width = innerWidth; rec.comp.height = innerHeight; rec.cg = rec.comp.getContext("2d"); rec.take = { labels: true, card: false, captions: true };
  try { compositeFrame(); const c = rec.comp; c.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "Material_Flow_" + PROJECT + "_" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".png"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000); X.tip("Picture saved: " + a.download); }, "image/png"); }
  finally { Object.assign(rec, keep); }
}

/* ---------- one-line hint: what the mouse does now ---------- */
const hint = h('<div id="hint7"></div>'); panel.appendChild(hint);
function syncHint() {
  hint.textContent = ed.placing ? "Click the floor to place " + (ADD[ed.placing.kind] ? ADD[ed.placing.kind].label : "it") + " · Shift keeps the tool · Esc stops"
    : ed.drawing ? "Click corners · click the stop or Enter to finish · right-click removes the last corner · Esc cancels"
    : ed.tab === "objects" ? (ed.sel ? "Drag to move · green knob turns · Q/E turn · +/− size · Del deletes · right-click: menu" : "Click an object or a ◆ stop · right-click: menu · F1: all keys")
    : ed.tab === "paths" || ed.tab === "steps" ? "Drag yellow corners or the small squares · double-click a leg adds a corner · S straighten · R auto-route"
    : ed.tab === "director" ? "Frame the view, K adds a camera key · C adds a caption · J records your camera move"
    : "F1: all keys · right-click in the scene: menu";
}

/* ---------- keyboard map overlay ---------- */
const KEYMAP = [
  ["Playback", [["Space", "Play / pause"], ["← / →", "Previous / next step (when nothing is selected)"], ["Home / End", "Start / end"], ["[ / ]", "Slower / faster"], ["2 / 3 / A", "2D plan / 3D / auto view (Studio closed)"]]],
  ["Studio", [["F1 or ?", "This keyboard map"], ["Alt+1 … Alt+6", "Objects · Paths · Steps · Director · Numbers · Project"], ["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Ctrl+S / Ctrl+Shift+S", "Save the scene file / save as"], ["Ctrl+O", "Open a scene file (or drop it on the player)"], ["Esc / V", "Stop the tool, clear the selection"], ["O", "Ortho on / off (paths keep square legs)"], ["G", "Snap grid: off · 0.1 · 0.5 · 1 · 2 m"]]],
  ["Objects", [["Click / drag", "Select / move (Alt: no snap)"], ["Green knob", "Drag to turn (Shift: free angle)"], ["Q / E", "Turn 15° (Shift: 90°)"], ["Arrows", "Nudge one snap step (Shift: ×10)"], ["+ / −", "Bigger / smaller"], ["Ctrl+D", "Duplicate"], ["Delete", "Delete"], ["F", "Fly to the selection"], ["N", "Place a new stop"], ["P", "Place the last object type again"]]],
  ["Paths", [["S", "Straighten the step (or every step at the selected stop)"], ["Shift+S", "Straighten the whole path"], ["L", "Make the step one L (one corner)"], ["R / Shift+R", "Auto-route the step / the whole path"], ["B", "Draw the step's path corner by corner (Enter ends)"], ["PageUp / PageDown", "Previous / next step"], ["Double-click a leg", "Add a corner"], ["Right-click / Delete on a corner", "Remove the corner"]]],
  ["Director", [["K / Shift+K", "Camera key here / key that rides with the trolley"], ["J", "Start / stop recording your camera move"], ["C", "Caption here"], ["Shift+P", "Watch the director cut from the start"]]],
  ["Camera", [["Left drag", "Orbit"], ["Right drag or Shift+drag", "Pan"], ["Wheel", "Zoom toward the cursor"], ["Double-click", "Fly to that point"], ["Pad", "Sticks, lens, speed, smooth, views, 6 shots (right-click a shot to save it)"]]],
];
const keysEl = h('<div id="keys7" class="glass" role="dialog" aria-label="Keyboard map"></div>'); document.body.appendChild(keysEl);
keysEl.innerHTML = '<div class="hd"><b>Keyboard map</b><span>every action is also a button on screen</span><button class="ib xs" id="keysX" aria-label="Close">' + ICON.x + '</button></div><div class="cols">' + KEYMAP.map(([g, rows]) => '<div><h4>' + g + '</h4><table>' + rows.map(([k, v]) => '<tr><td><kbd>' + esc(k) + '</kbd></td><td>' + esc(v) + '</td></tr>').join("") + '</table></div>').join("") + '</div>';
function toggleKeys(on) { const show = on != null ? on : keysEl.style.display !== "block"; keysEl.style.display = show ? "block" : "none"; }
$("keysX").onclick = () => toggleKeys(false); keysEl.onclick = (e) => { if (e.target === keysEl) toggleKeys(false); };
let lastPlace = null;
function scaleSel(f) {
  const sel = ed.sel, o = selObj(); if (!o) return;
  if (sel.kind === "device") commit("resize", () => { o.k = +clamp((o.k || DIMS.K) * f, .5, 4).toFixed(2); }, "devices");
  else if (sel.kind === "prop") commit("resize", () => { o.w = +(o.w * f).toFixed(2); o.d = +(o.d * f).toFixed(2); o.h = +(o.h * f).toFixed(2); }, "props");
  render();
}

/* ---------- reacting to changes ---------- */
let lastFlow = S.flow, lastTotal = 0;
onChange((w) => {
  if (w === "select" || w === "commit" || w === "tool" || w === "director" || w === "rec") { render(); if (w !== "select") renderLanes(); }
  if (w === "checks") syncToolbar(); if (w === "save" || w === "dirty") syncToolbar();
  if (w === "commit") syncPad();
});
applyHooks.after = (what) => { if (what !== "director") { runChecks(); } renderLanes(); };

/* ---------- frame hooks ---------- */
window.MFX = {
  freeCam, zoom: (k) => zoomBy(k),
  pre(dt) {
    const R = S.R, show = R > .02, k = Math.max(.002, R * R * (3 - 2 * R));
    for (const g of Object.values(propGroups)) { if (g.visible !== show) g.visible = show; if (show && g.scale.y !== k) g.scale.y = k; }
    if (!isFreeish()) { cam.lastMode = S.cam; if (Math.abs(camera.fov - BASE_FOV) > 1e-3) { camera.fov = BASE_FOV; camera.updateProjectionMatrix(); } }
    sampleCamRec(); fleetFrame(); void dt;
  },
  post(dt, time) {
    drawOverlay(time); drawCaptions(); if (rec.active) recFrame(); if (photoPending) takePhoto();
    const now = performance.now(); padTick(now); if (ed.open && ed.tab === "numbers" && now - (fleetTick.t || 0) > 400) { fleetTick.t = now; fleetTick(); }
    if (S.flow !== lastFlow || Math.abs(X.F().total - lastTotal) > 1e-6) { lastFlow = S.flow; lastTotal = X.F().total; ed.stepSel = Math.min(ed.stepSel, curFlow().steps.length - 1); runChecks(); render(); renderLanes(); }
    if (rec.active) { $("recT").textContent = fmtT((now - rec.started) / 1000).replace(/\.\d$/, ""); $("recN").textContent = rec.take.name + " · " + fmtT(S.t); }
  },
  // test and automation surface
  flush: () => { if (dirty) saveNow(); }, canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0,
  replaceScene: (scene, how) => { commit(how || "load scene", () => { const w = fromScene(scene); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, w); }); saveNow(); render(); renderLanes(); },
  toScene, doc, ed, cam, commit, undo, redo, apply, select, startPlace, placeAt, autoRoute, routeBetween, checkFlow, validateFlow, relink, addKey, addCaption, evalDirector, startTake, stopTake, rec, setEditor, setTab, setPad, saveNow, moveSelTo, rotateSelBy, deleteSel, duplicateSel, nudge, syncRep, buildRepIndex, repIndex: () => repIndex, flyTo, viewPreset, setLock, zoomBy, goFree, dragVertex, dragSegment, footprints, solidsOf, gridFor,
};

/* ---------- start ---------- */
try { setPad(localStorage.getItem("mf7:pad") !== "0"); } catch (e) { setPad(true); }
syncPad(); panel.style.display = "none"; bar7.style.display = "none"; renderLanes();
MF.ready.then(() => { if (doc.props.length) syncProps(); if (Object.keys(doc.replica).some((t) => !loadedOps[t] || JSON.stringify(loadedOps[t]) !== JSON.stringify(doc.replica[t]))) syncAllRep(); lastTotal = X.F().total; });
// the camera menu gets the director cut
{ const sel = $("cam"), o = document.createElement("option"); o.value = "director"; o.textContent = "Director cut"; sel.insertBefore(o, sel.querySelector('option[value="free"]')); }
