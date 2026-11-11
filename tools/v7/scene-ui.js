/* ===== V7.1 Scene file manager: open / save / save as / download / drag-and-drop, undo / redo, autosave, validation =====
   The scene in memory (MF7.scene) is the single source of truth. Loading a scene validates it, converts it with MFScene and
   rebuilds the player live; a change of layout edits needs a fresh replica, so it is saved and the page reloads. */
const MF = window.MF, SC = window.MFScene, MF7 = window.MF7;
if (!MF || !MF.x || !SC || !MF7) { console.warn("V7.1 scene manager: missing player internals"); return; }
const X = MF.x, S = MF.S, D = MF.D, $ = (id) => document.getElementById(id), PROJECT = MF7.id;
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = "mf7:scene:" + PROJECT, layout = () => ({ project: PROJECT, plates: D.plates, elevators: D.elevators || (D.elevator ? [D.elevator] : []), replica: clone(MF7.baseReplica) });
const st = { scene: MF7.scene, undo: [], redo: [], handle: null, fileName: MF7.fileName || "", dirty: false, report: null, savedAt: null };
const fsOK = typeof window.showSaveFilePicker === "function" && window.isSecureContext;

/* ---------- autosave ---------- */
function autosave() {
  try { localStorage.setItem(KEY, JSON.stringify({ scene: st.scene, baseHash: MF7.baseHash, savedAt: new Date().toISOString(), fileName: st.fileName })); st.savedAt = new Date(); }
  catch (e) { X.tip("Could not save in this browser: " + e.message); }
}

/* ---------- load a scene (validate, convert, rebuild) ---------- */
const sameEdits = (a, b) => JSON.stringify((a && a.layoutEdits) || []) === JSON.stringify((b && b.layoutEdits) || []);
function load(scene, how, opts = {}) {
  const t0 = performance.now(), rep = SC.validate(scene, layout()); st.report = rep;
  if (rep.errors.length && !opts.force) { render(); open(true); X.tip(`Not loaded: ${rep.errors.length} error(s) in the scene (see the Scene panel)`); return false; }
  if (opts.record !== false) { st.undo.push(clone(st.scene)); if (st.undo.length > 60) st.undo.shift(); st.redo.length = 0; }
  const prev = st.scene; st.scene = clone(scene); MF7.scene = st.scene; autosave();
  if (!sameEdits(prev, scene)) { X.tip("The layout edits changed: reloading the factory…"); setTimeout(() => location.reload(), 350); return true; }
  const res = SC.toInternal(clone(scene), { plates: D.plates, elevators: layout().elevators, replica: MF.RP }, { applyLayout: false });
  for (const k of Object.keys(D.nodes)) delete D.nodes[k]; Object.assign(D.nodes, res.data.nodes);
  D.flows = res.data.flows; D.devices = res.data.devices; if (D.slide && res.data.title) D.slide.title = res.data.title;
  const flow = Math.min(S.flow, D.flows.length - 1); S.flow = flow; X.rebuild(); MF.setFlow(flow);
  render(); X.tip(`${how}: ${scene.paths.length} path(s) loaded in ${(performance.now() - t0).toFixed(0)} ms${rep.warnings.length ? `, ${rep.warnings.length} warning(s)` : ""}`);
  return true;
}
function undo() { const s = st.undo.pop(); if (!s) return X.tip("Nothing to undo"); st.redo.push(clone(st.scene)); load(s, "Undo", { record: false, force: true }); }
function redo() { const s = st.redo.pop(); if (!s) return X.tip("Nothing to redo"); st.undo.push(clone(st.scene)); load(s, "Redo", { record: false, force: true }); }

/* ---------- files ---------- */
const TYPES = [{ description: "Material Flow scene", accept: { "application/json": [".json"] } }];
const text = () => JSON.stringify(st.scene, null, 1) + "\n";
async function writeHandle(h) { const w = await h.createWritable(); await w.write(text()); await w.close(); }
async function save() {
  if (!st.handle) return saveAs();
  try {
    if (st.handle.queryPermission && (await st.handle.queryPermission({ mode: "readwrite" })) !== "granted" && (await st.handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("permission refused");
    await writeHandle(st.handle); st.dirty = false; render(); X.tip("Saved to " + st.fileName);
  } catch (e) { X.tip("Direct save failed (" + e.message + "): use Save as or Download"); st.lastSaveError = e.message; render(); }
}
async function saveAs() {
  if (!fsOK) return download();
  try {
    const h = await window.showSaveFilePicker({ suggestedName: st.fileName || `${PROJECT}.scene.json`, types: TYPES });
    await writeHandle(h); st.handle = h; st.fileName = h.name; st.dirty = false; autosave(); render(); X.tip("Saved to " + h.name + " (Save now writes to this file directly)");
  } catch (e) { if (e.name !== "AbortError") { X.tip("Save as failed (" + e.message + "): downloading instead"); download(); } }
}
function download() {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text()], { type: "application/json" })); a.download = st.fileName || `${PROJECT}.scene.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}
async function readFile(file, handle) {
  let scene; try { scene = JSON.parse(await file.text()); } catch (e) { X.tip("Not a JSON file: " + e.message); return; }
  if (!scene || scene.format !== SC.FORMAT) { X.tip("Not a Material Flow scene file (format must be \"mf-scene\")"); return; }
  if (scene.project !== PROJECT) { X.tip(`This scene is for the ${String(scene.project).toUpperCase()} tab: open that tab first`); return; }
  if (load(scene, "Opened " + file.name)) { st.fileName = file.name; st.handle = handle || null; autosave(); render(); }
}
async function openFile() {
  if (fsOK && window.showOpenFilePicker) {
    try { const [h] = await window.showOpenFilePicker({ types: TYPES }); await readFile(await h.getFile(), h); } catch (e) { if (e.name !== "AbortError") X.tip("Open failed: " + e.message); }
  } else $("sc7file").click();
}

/* ---------- panel ---------- */
const ICON = '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>';
const rail = $("rail"), btn = document.createElement("button");
btn.id = "sc7Btn"; btn.className = "ib"; btn.setAttribute("aria-pressed", "false"); btn.dataset.tip = "Scene file"; btn.innerHTML = ICON;
rail.insertBefore(btn, $("helpBtn").previousElementSibling);
const panel = document.createElement("div"); panel.id = "sc7"; panel.className = "ui glass"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Scene file");
document.body.appendChild(panel);
const inp = document.createElement("input"); inp.type = "file"; inp.id = "sc7file"; inp.accept = ".json,application/json"; inp.hidden = true; document.body.appendChild(inp);
inp.onchange = () => { const f = inp.files[0]; inp.value = ""; if (f) readFile(f, null); };
function open(on) { panel.style.display = on ? "flex" : "none"; btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", String(on)); if (on) render(); }
btn.onclick = () => open(panel.style.display !== "flex");
function render() {
  if (panel.style.display !== "flex") return;
  const s = st.scene, r = st.report, src = st.fileName ? "file " + st.fileName : { "built-in": "the scene built into this player", browser: "your scene saved in this browser", file: "the scene built into this player" }[MF7.source] || MF7.source;
  const list = (items, cls) => items.map((x) => `<li class="${cls}"><b>${esc(x.where)}</b>${esc(x.msg)}</li>`).join("");
  panel.innerHTML = `<div class="hd"><b>Scene file</b><span class="pj">${esc(PROJECT.toUpperCase())}</span><button class="ib xs" id="sc7x" aria-label="Close">✕</button></div>
    <p class="src">${esc(s.title || "")}<br><small>${s.paths.length} paths · ${s.paths.reduce((n, p) => n + p.steps.length, 0)} steps · ${s.stops.length} stops · ${s.devices.length} devices · from ${esc(src)}${st.savedAt ? " · autosaved " + st.savedAt.toLocaleTimeString() : ""}</small></p>
    ${MF7.stale ? `<p class="warn7">This browser also has an older edited copy (from ${esc(MF7.stale.savedAt || "")}), made before this player file was rebuilt. <button id="sc7stale">Load it</button></p>` : ""}
    ${MF7.error ? `<p class="err7">${esc(MF7.error)}</p>` : ""}
    <div class="acts"><button id="sc7open" title="Open a scene file (Ctrl+O)">Open…</button><button id="sc7save" title="${st.handle ? "Write to " + esc(st.fileName) : "Choose where to save"} (Ctrl+S)">Save</button><button id="sc7as">Save as…</button><button id="sc7dl" title="Download a copy">Download</button></div>
    <div class="acts"><button id="sc7undo" ${st.undo.length ? "" : "disabled"} title="Ctrl+Z">Undo</button><button id="sc7redo" ${st.redo.length ? "" : "disabled"} title="Ctrl+Y">Redo</button><button id="sc7val" class="pri">Validate</button><button id="sc7reset" class="danger">Reset to built-in</button></div>
    <p class="hint">Drop a scene file anywhere on the player to load it. ${fsOK ? "Save writes straight back to the file you opened or saved." : "This browser cannot write files directly: Save downloads a copy."}${st.lastSaveError ? ` Last direct save failed: ${esc(st.lastSaveError)}.` : ""}</p>
    ${r ? `<div class="rep ${r.errors.length ? "bad" : "ok"}"><b>${r.errors.length ? r.errors.length + " error(s)" : "Valid"}${r.warnings.length ? ", " + r.warnings.length + " warning(s)" : ""}</b><ul>${list(r.errors, "e")}${list(r.warnings, "w")}</ul></div>` : ""}`;
  $("sc7x").onclick = () => open(false); $("sc7open").onclick = openFile; $("sc7save").onclick = save; $("sc7as").onclick = saveAs; $("sc7dl").onclick = download;
  $("sc7undo").onclick = undo; $("sc7redo").onclick = redo; $("sc7val").onclick = () => { const t = performance.now(); st.report = SC.validate(st.scene, layout()); render(); X.tip(`Validated in ${(performance.now() - t).toFixed(0)} ms`); };
  $("sc7reset").onclick = () => { if (!render.armed) { render.armed = true; X.tip("Click Reset again within 3 s to go back to the built-in scene"); setTimeout(() => (render.armed = false), 3000); return; } load(MF7.base, "Built-in scene", { force: true }); st.fileName = ""; st.handle = null; try { localStorage.removeItem(KEY); } catch (e) {} render(); };
  if ($("sc7stale")) $("sc7stale").onclick = () => { const s2 = MF7.stale.scene; MF7.stale = null; load(s2, "Older browser copy"); };
}

/* ---------- drag and drop anywhere ---------- */
const drop = document.createElement("div"); drop.id = "sc7drop"; drop.innerHTML = "<div>Drop a scene file to load it</div>"; document.body.appendChild(drop);
let depth = 0;
addEventListener("dragenter", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { depth++; drop.style.display = "grid"; e.preventDefault(); } });
addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; drop.style.display = "none"; } });
addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
addEventListener("drop", async (e) => {
  depth = 0; drop.style.display = "none"; const item = e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items[0]; if (!item) return; e.preventDefault();
  let handle = null; try { if (item.getAsFileSystemHandle) handle = await item.getAsFileSystemHandle(); } catch (x) { handle = null; }
  const file = handle && handle.kind === "file" ? await handle.getFile() : e.dataTransfer.files[0]; if (file) readFile(file, handle && handle.kind === "file" ? handle : null);
});

/* ---------- keys (an optional extra: every action is in the panel) ---------- */
addEventListener("keydown", (e) => {
  const t = e.target, tag = t.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable || !(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase(), act = { s: e.shiftKey ? saveAs : save, o: openFile, z: e.shiftKey ? redo : undo, y: redo }[k];
  if (act) { e.preventDefault(); e.stopImmediatePropagation(); act(); }
}, true);

if (MF7.issues && MF7.issues.length) X.tip(MF7.issues[0].msg);
MF.ready.then(() => { if (MF7.source === "browser") X.tip("Your scene saved in this browser is loaded (Scene file: Reset to built-in to undo)"); if (MF7.error) X.tip(MF7.error); });
// test and automation surface
window.MFS = { get scene() { return st.scene; }, load: (s, o) => load(s, "Loaded", o), validate: () => SC.validate(st.scene, layout()), undo, redo, save, saveAs, download, open, state: st, fsOK };
