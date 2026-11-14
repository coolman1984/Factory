// Factory Control Center UI. Every change is a checked command on the server (POST /api/command); the page re-reads the
// data after each change and every 1.5 s if someone else (the agent) changed it. No framework, no build step.
import { TYPES, TYPE, GROUPS, getPath, setPath, blank } from "/schema.js";
import { LANGS, installTranslator } from "/i18n.js";

const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 1) => v == null ? "-" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(d)) : String(v);
const pct = v => v == null ? "-" : (v * 100).toFixed(1) + "%";
const S = { records: {}, meta: {}, problems: [], view: "dashboard", type: null, run: null, drawer: null, search: {}, sort: {}, sel: new Set(), runs: [], mapState: null, lastRev: -1, busy: false };
window.FC = S;   // test and automation surface

async function api(path, opts = {}) {
  const r = await fetch(path, { method: opts.method || "GET", headers: { "content-type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const ct = r.headers.get("content-type") || ""; return ct.includes("json") ? r.json() : r.text();
}
function toast(msg, kind = "", action = null) {
  const t = document.createElement("div"); t.className = "toast " + kind; t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement("button"); b.textContent = action.label; b.onclick = () => { t.remove(); action.fn(); }; t.appendChild(b); }
  const box = $("#toasts"); box.appendChild(t); while (box.children.length > 3) box.firstChild.remove();   // at most three at a time
  setTimeout(() => t.remove(), action ? 9000 : kind === "bad" ? 7000 : 2500);
}
// One checked command; refusals offer "Save anyway" (force) when the server refused because of new problems.
async function cmd(type, payload, { force = false, quiet = false } = {}) {
  S.busy = true; let r; try { r = await api("/api/command", { method: "POST", body: { type, payload, force } }); } finally { S.busy = false; S.localAt = Date.now(); }
  if (r.ok) { await load(); if (!quiet) toast(r.changed === false ? "No change" : `Saved r${r.revision}: ${r.label}`, "good"); }
  else toast(r.reason || r.code, "bad", r.code === "refused" ? { label: "Save anyway", fn: () => cmd(type, payload, { force: true, quiet }) } : null);
  return r;
}
async function load() {
  const [meta, records, problems] = await Promise.all([api("/api/meta"), api("/api/records"), api("/api/problems")]);
  S.meta = meta; S.records = records; S.problems = problems; S.lastRev = meta.revision; renderChrome(); render(); renderDrawer();
}
const recs = t => S.records[t] || [];
const findRec = (t, id) => recs(t).find(r => r.id === id);
const problemsOf = (t, id) => S.problems.filter(p => p.type === t && p.id === id);
const labelOf = f => f.label || f.key.replace(/^_meta\./, "").replace(/[._]/g, " ").replace(/\bid\b/g, "ID").replace(/^./, c => c.toUpperCase());

/* ---------------- chrome: top bar and side navigation ---------------- */
function renderChrome() {
  const m = S.meta; $("#factory-name").textContent = m.factory || "factory"; $("#rev").textContent = "r" + m.revision;
  const p = $("#problems"); p.textContent = m.problems ? `${m.problems} problem${m.problems === 1 ? "" : "s"}` : "No problems"; p.className = "chip " + (m.problems ? "bad" : "ok");
  $("#undo").disabled = !m.canUndo; $("#redo").disabled = !m.canRedo;
  const bad = new Set(S.problems.map(x => x.type).filter(Boolean)), on = (v, t) => S.view === v && (!t || S.type === t) ? " on" : "";
  $("#side").innerHTML = `<h4>Overview</h4><a data-go="dashboard" class="${on("dashboard")}">Dashboard</a><a data-go="map" class="${on("map")}">Layout map</a>` +
    GROUPS.map(g => `<h4>${esc(g)}</h4>` + TYPES.filter(T => T.group === g).map(T => `<a data-go="type" data-type="${T.type}" class="${on("type", T.type)}"><span>${esc(T.label)}${bad.has(T.type) ? '<span class="dot" title="has problems"></span>' : ""}</span><small>${recs(T.type).length}</small></a>`).join("")).join("") +
    `<h4>Records</h4><a data-go="runs" class="${on("runs") || on("run")}">Runs</a><a data-go="changes" class="${on("changes")}">Change log</a><a data-go="database" class="${on("database")}">Database</a><a data-go="film" class="${on("film")}">3D &amp; film</a>`;
}
function go(view, type = null, extra = {}) { if (S.drawer && !(view === "type" && type === S.drawer.type)) closeDrawer(); S.view = view; S.type = type; Object.assign(S, extra); S.sel = new Set(); renderChrome(); render(); $("#main").scrollTop = 0; location.hash = view + (type ? "/" + type : extra.run ? "/" + extra.run : ""); }
$("#side").addEventListener("click", e => { const a = e.target.closest("a[data-go]"); if (a) go(a.dataset.go, a.dataset.type || null); });

/* ---------------- views ---------------- */
function render() {
  S.seq = (S.seq || 0) + 1;   // an async view that is no longer the latest render stops after its fetch (no stale overwrite)
  const v = S.view, m = $("#main");
  if (v === "type") return renderType(m);
  if (v === "dashboard") return renderDashboard(m);
  if (v === "map") return renderMap(m);
  if (v === "runs") return renderRuns(m);
  if (v === "run") return renderRun(m);
  if (v === "changes") return renderChanges(m);
  if (v === "database") return renderDatabase(m);
  if (v === "film") return renderFilm(m);
}
function cell(T, f, v) {
  if (v == null || v === "") return '<span class="muted">-</span>';
  if (f && f.kind === "ref") return `<span class="ref" data-open="${f.ref}:${esc(v)}">${esc(v)}</span>`;
  if (f && f.kind === "refs") return v.map(x => `<span class="ref tag" data-open="${f.ref}:${esc(x)}">${esc(x)}</span>`).join("");
  if (f && f.kind === "rows") return v.map(r => `<span class="tag">${esc(Object.values(r).join(" "))}</span>`).join("");
  if (Array.isArray(v)) return f && f.kind === "vec3" ? `<span class="mono">${v.map(x => fmt(x, 2)).join(", ")}</span>` : v.map(x => `<span class="tag">${esc(x)}</span>`).join("");
  if (typeof v === "boolean") return v ? "yes" : "no";
  return esc(typeof v === "object" ? JSON.stringify(v) : v);
}
function renderType(m) {
  const T = TYPE[S.type], q = (S.search[T.type] || "").toLowerCase(), sort = S.sort[T.type] || null, fields = Object.fromEntries(T.fields.map(f => [f.key, f]));
  let list = recs(T.type).filter(r => !q || JSON.stringify(r.data).toLowerCase().includes(q));
  if (sort) list = list.slice().sort((a, b) => { const x = getPath(a.data, sort.k), y = getPath(b.data, sort.k); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  const bad = new Set(S.problems.filter(p => p.type === T.type).map(p => p.id));
  m.innerHTML = `<h1>${esc(T.label)}</h1><p class="sub">${esc(T.help || "")}</p>
<div class="bar"><input type="search" id="q" placeholder="Filter..." value="${esc(S.search[T.type] || "")}">
${T.single && recs(T.type).length ? "" : `<button class="btn primary" data-act="new">+ New</button>`}<button class="btn" data-act="dup" ${S.sel.size === 1 ? "" : "disabled"}>Duplicate</button><button class="btn danger" data-act="del" ${S.sel.size ? "" : "disabled"}>Delete${S.sel.size > 1 ? " " + S.sel.size : ""}</button>
<button class="btn" data-act="bulk" ${S.sel.size > 1 ? "" : "disabled"}>Bulk edit</button><button class="btn" data-act="csv">Export CSV</button><span class="muted">${list.length} of ${recs(T.type).length} &middot; double-click a cell to edit</span></div>
${list.length ? `<div class="grid-wrap"><table class="grid"><thead><tr><th style="width:28px"><input type="checkbox" data-act="all" ${S.sel.size && S.sel.size === list.length ? "checked" : ""}></th>${T.columns.map(c => `<th data-sort="${c}">${esc(labelOf(fields[c] || { key: c }))}${sort && sort.k === c ? (sort.dir > 0 ? " &#9650;" : " &#9660;") : ""}</th>`).join("")}</tr></thead>
<tbody>${list.map(r => `<tr data-id="${esc(r.id)}" class="${S.sel.has(r.id) ? "sel" : ""} ${bad.has(r.id) ? "has-problem" : ""}"><td><input type="checkbox" data-pick="${esc(r.id)}" ${S.sel.has(r.id) ? "checked" : ""}></td>${T.columns.map((c, i) => `<td data-col="${c}" class="${i === 0 ? "k" : ""}">${cell(T, fields[c], getPath(r.data, c))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">${q ? "No records match the filter." : "Nothing here yet."}</div>`}`;
  const qi = $("#q", m); qi.oninput = () => { S.search[T.type] = qi.value; const pos = qi.selectionStart; renderType(m); const n = $("#q", m); n.focus(); n.setSelectionRange(pos, pos); };
}
$("#main").addEventListener("click", async e => {
  const o = e.target.closest("[data-open]"); if (o) { e.stopPropagation(); const [t, ...id] = o.dataset.open.split(":"); return openRecord(t, id.join(":")); }
  if (S.view !== "type") return;
  const T = TYPE[S.type], act = e.target.closest("[data-act]")?.dataset.act;
  if (e.target.dataset.pick) { const id = e.target.dataset.pick; e.target.checked ? S.sel.add(id) : S.sel.delete(id); return renderType($("#main")); }
  if (act === "all") { S.sel = e.target.checked ? new Set($$("tr[data-id]", $("#main")).map(r => r.dataset.id)) : new Set(); return renderType($("#main")); }
  if (act === "new") return newRecord(T.type);
  if (act === "dup") { const id = [...S.sel][0]; const to = await ask("Duplicate as", id + "_COPY"); if (to) { const r = await cmd("record.duplicate", { type: T.type, id, to }); if (r.ok) openRecord(T.type, to); } return; }
  if (act === "del") { const ids = [...S.sel]; if (await confirmBox(`Delete ${ids.length} record(s)?`, ids.join(", "))) { const r = await cmd("batch", { commands: ids.map(id => ({ type: "record.delete", payload: { type: T.type, id } })), label: `delete ${ids.length} ${T.type}` }); if (r.ok) S.sel = new Set(); render(); } return; }
  if (act === "bulk") return bulkEdit(T, [...S.sel]);
  if (act === "csv") return downloadCSV(T);
  const th = e.target.closest("th[data-sort]"); if (th) { const cur = S.sort[T.type]; S.sort[T.type] = { k: th.dataset.sort, dir: cur && cur.k === th.dataset.sort ? -cur.dir : 1 }; return renderType($("#main")); }
  const tr = e.target.closest("tr[data-id]"); if (tr && !e.target.closest("input")) openRecord(T.type, tr.dataset.id);
});
// Double-click a simple cell: edit it in place (text, number, enum, bool, ref).
$("#main").addEventListener("dblclick", e => {
  if (S.view !== "type") return; const td = e.target.closest("td[data-col]"), tr = e.target.closest("tr[data-id]"); if (!td || !tr) return;
  const T = TYPE[S.type], f = T.fields.find(x => x.key === td.dataset.col), r = findRec(T.type, tr.dataset.id); if (!f || !r || !["text", "number", "int", "enum", "ref", "bool"].includes(f.kind)) return;
  e.preventDefault(); const v = getPath(r.data, f.key);
  td.innerHTML = f.kind === "enum" || f.kind === "ref" || f.kind === "bool" ? `<select class="inline">${optionsFor(f, v)}</select>` : `<input class="inline" type="${f.kind === "text" ? "text" : "number"}" value="${esc(v ?? "")}" step="any">`;
  const inp = td.firstChild; inp.focus(); let done = false;
  const commit = async () => { if (done) return; done = true; const nv = parse(f, inp); if (JSON.stringify(nv) !== JSON.stringify(v ?? null)) await cmd("record.update", { type: T.type, id: r.id, set: { [f.key]: nv } }); else renderType($("#main")); };
  inp.addEventListener("blur", commit); inp.addEventListener("keydown", ev => { if (ev.key === "Enter") inp.blur(); if (ev.key === "Escape") { done = true; renderType($("#main")); } });
  inp.addEventListener("change", commit);   // Enter, blur or a new choice saves
});
function optionsFor(f, v) {
  if (f.kind === "bool") return `<option value="true" ${v === true ? "selected" : ""}>yes</option><option value="false" ${v === false ? "selected" : ""}>no</option>`;
  if (f.kind === "enum") return (f.required ? "" : `<option value=""></option>`) + f.options.map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("");
  const list = recs(f.ref).filter(r => !f.filter || Object.entries(f.filter).every(([k, x]) => getPath(r.data, k) === x));
  return `<option value="">${f.required ? "choose..." : "(none)"}</option>` + list.map(r => `<option value="${esc(r.id)}" ${r.id === v ? "selected" : ""}>${esc(r.id)}${r.data.name ? " - " + esc(r.data.name) : ""}</option>`).join("") + (v && !list.some(r => r.id === v) ? `<option value="${esc(v)}" selected>${esc(v)} (missing)</option>` : "");
}
function parse(f, el) {
  const v = el.value;
  if (f.kind === "number" || f.kind === "int") return v === "" ? null : Number(v);
  if (f.kind === "bool") return el.type === "checkbox" ? el.checked : v === "true";
  if (f.kind === "ref" || f.kind === "enum") return v === "" ? null : v;
  return v;
}
function downloadCSV(T) {
  const rows = recs(T.type), cols = T.fields.filter(f => f.kind !== "rows").map(f => f.key), q = x => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => { const v = getPath(r.data, c); return q(Array.isArray(v) ? v.join(" ") : v); }).join(","))].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = T.type + ".csv"; a.click();
}

/* ---------------- record editor (drawer) ---------------- */
function openRecord(type, id) { if (!TYPE[type]) return; S.drawer = { type, id }; renderDrawer(); }
function closeDrawer() { S.drawer = null; $("#drawer").hidden = true; }
async function newRecord(type) {
  const T = TYPE[type]; if (T.single) { const r = await cmd("record.create", { type, data: blank(type) }, { force: true }); if (r.ok) openRecord(type, recs(type)[0]?.id); return; }
  const id = await ask("New record ID", ""); if (!id) return;
  const r = await cmd("record.create", { type, data: blank(type, id) }, { force: true });   // a new record starts incomplete: fill it in the editor
  if (r.ok) { if (S.view !== "type" || S.type !== type) go("type", type); openRecord(type, id); }
}
function renderDrawer() {
  const d = $("#drawer"); if (!S.drawer) { d.hidden = true; return; }
  const T = TYPE[S.drawer.type], r = findRec(T.type, S.drawer.id); if (!r) { d.hidden = true; S.drawer = null; return; }
  const probs = problemsOf(T.type, r.id), focused = document.activeElement && d.contains(document.activeElement) ? document.activeElement.dataset.path : null;
  d.hidden = false;
  d.innerHTML = `<header><div class="muted">${esc(T.label)}</div><h2>${esc(r.id)}</h2><div class="muted" style="font-size:11px">updated ${esc((r.updated_at || "").slice(0, 19).replace("T", " "))} by ${esc(r.updated_by || "-")}</div>
<div class="acts">${T.single ? "" : `<button class="btn sm" data-d="rename">Rename</button><button class="btn sm" data-d="dup">Duplicate</button>`}<button class="btn sm danger" data-d="del">Delete</button><button class="btn sm" data-d="json">JSON</button><button class="btn sm ghost" data-d="close" style="margin-inline-start:auto">Close &#10005;</button></div></header>
<div class="body">${probs.length ? `<div class="problems-box"><b>${probs.length} problem${probs.length > 1 ? "s" : ""}</b>${probs.map(p => `<div>${esc(p.message)}</div>`).join("")}</div>` : ""}
${T.fields.filter(f => f.key !== T.key || T.single).map(f => fieldHTML(f, getPath(r.data, f.key), probs)).join("")}<div class="used" id="used"><h4>Where used</h4><span class="muted">...</span></div></div>`;
  if (!T.single) api(`/api/where-used?type=${T.type}&id=${encodeURIComponent(r.id)}`).then(u => { const el = $("#used", d); if (el) el.innerHTML = `<h4>Where used (${u.length})</h4>` + (u.length ? u.map(x => `<div><span class="ref" data-open="${x.type}:${esc(x.id)}">${esc(x.type)}:${esc(x.id)}</span> <span class="muted">${esc(x.field)}</span></div>`).join("") : '<span class="muted">not referenced</span>'); });
  if (focused) { const el = d.querySelector(`[data-path="${CSS.escape(focused)}"]`); if (el) el.focus(); }
}
function fieldHTML(f, v, probs) {
  const name = labelOf(f), err = probs.find(p => p.message.toLowerCase().startsWith(name.toLowerCase()) || p.message.includes(f.key));
  const p = `data-path="${esc(f.key)}"`; let input;
  switch (f.kind) {
    case "text": input = `<input type="text" ${p} value="${esc(v ?? "")}">`; break;
    case "number": case "int": input = `<input type="number" step="${f.kind === "int" ? 1 : "any"}" ${p} value="${v ?? ""}" ${f.min != null ? `min="${f.min}"` : ""} ${f.max != null ? `max="${f.max}"` : ""}>`; break;
    case "bool": input = `<label style="font-weight:400"><input type="checkbox" ${p} ${v ? "checked" : ""}> ${v ? "yes" : "no"}</label>`; break;
    case "enum": case "ref": input = `<select ${p}>${optionsFor(f, v)}</select>${f.kind === "ref" && v ? ` <span class="ref" data-open="${f.ref}:${esc(v)}">open ${esc(v)}</span>` : ""}`; break;
    case "vec3": input = `<div class="vec">${[0, 1, 2].map(i => `<input type="number" step="any" data-path="${esc(f.key)}" data-i="${i}" value="${Array.isArray(v) ? v[i] : ""}" placeholder="${"xyz"[i]}">`).join("")}</div>`; break;
    case "refs": { const list = recs(f.ref).filter(r => !f.filter || Object.entries(f.filter).every(([k, x]) => getPath(r.data, k) === x)).filter(r => !(v || []).includes(r.id));
      input = `<div class="chips">${(v || []).map(x => `<span class="tag"><span class="ref" data-open="${f.ref}:${esc(x)}">${esc(x)}</span><button data-rm="${esc(f.key)}" data-v="${esc(x)}" title="remove">&#215;</button></span>`).join("")}<select data-add="${esc(f.key)}"><option value="">+ add...</option>${list.map(r => `<option value="${esc(r.id)}">${esc(r.id)}</option>`).join("")}</select></div>`; break; }
    case "tags": input = `<div class="chips">${(v || []).map(x => `<span class="tag">${esc(x)}<button data-rm="${esc(f.key)}" data-v="${esc(x)}" title="remove">&#215;</button></span>`).join("")}<input data-addtag="${esc(f.key)}" placeholder="+ add, Enter" list="dl-${esc(f.key)}">${f.options ? `<datalist id="dl-${esc(f.key)}">${f.options.map(o => `<option>${esc(o)}</option>`).join("")}</datalist>` : ""}</div>`; break;
    case "list": input = `<textarea rows="4" ${p} data-lines="1">${esc((v || []).join("\n"))}</textarea><div class="hint">one per line</div>`; break;
    case "rows": input = `<table class="rows"><tr>${f.fields.map(sf => `<th>${esc(labelOf(sf))}</th>`).join("")}<th></th></tr>${(v || []).map((row, i) => `<tr>${f.fields.map(sf => `<td>${sf.kind === "ref" || sf.kind === "enum" ? `<select data-row="${esc(f.key)}" data-i="${i}" data-k="${sf.key}">${optionsFor(sf, row[sf.key])}</select>` : `<input type="${sf.kind === "text" ? "text" : "number"}" step="any" data-row="${esc(f.key)}" data-i="${i}" data-k="${sf.key}" value="${esc(row[sf.key] ?? "")}">`}</td>`).join("")}<td><button class="btn sm ghost" data-rowrm="${esc(f.key)}" data-i="${i}" title="remove row">&#215;</button></td></tr>`).join("")}</table><button class="btn sm" data-rowadd="${esc(f.key)}">+ row</button>`; break;
    default: input = `<textarea rows="3" ${p} data-json="1">${esc(JSON.stringify(v ?? null, null, 1))}</textarea>`;
  }
  return `<div class="field ${err ? "err" : ""}"><label><span>${esc(name)}</span>${f.required ? '<span class="req" title="required"> *</span>' : ""}</label>${input}${err ? `<div class="msg">${esc(err.message)}</div>` : ""}</div>`;
}
const cur = () => { const T = TYPE[S.drawer.type], r = findRec(T.type, S.drawer.id); return { T, r }; };
const setField = (path, value) => { const { T, r } = cur(); return cmd("record.update", { type: T.type, id: r.id, set: { [path]: value } }, { quiet: true }); };
$("#drawer").addEventListener("change", e => {
  const el = e.target, { T, r } = cur(); if (!r) return;
  if (el.dataset.add) { const v = getPath(r.data, el.dataset.add) || []; if (el.value) setField(el.dataset.add, [...v, el.value]); return; }
  if (el.dataset.row) { const rows = JSON.parse(JSON.stringify(getPath(r.data, el.dataset.row) || [])), f = T.fields.find(x => x.key === el.dataset.row).fields.find(x => x.key === el.dataset.k); rows[+el.dataset.i][el.dataset.k] = parse(f, el); setField(el.dataset.row, rows); return; }
  const path = el.dataset.path; if (!path) return; const f = T.fields.find(x => x.key === path); if (!f) return;
  if (f.kind === "vec3") { const v = [0, 1, 2].map(i => Number($(`[data-path="${CSS.escape(path)}"][data-i="${i}"]`, $("#drawer")).value || 0)); setField(path, v); return; }
  if (el.dataset.lines) { setField(path, el.value.split("\n").map(s => s.trim()).filter(Boolean)); return; }
  if (el.dataset.json) { try { setField(path, JSON.parse(el.value)); } catch { toast("not valid JSON", "bad"); } return; }
  setField(path, parse(f, el));
});
$("#drawer").addEventListener("keydown", e => { const el = e.target; if (el.dataset.addtag && e.key === "Enter" && el.value.trim()) { const { r } = cur(); setField(el.dataset.addtag, [...(getPath(r.data, el.dataset.addtag) || []), el.value.trim()]); } });
$("#drawer").addEventListener("click", async e => {
  const o = e.target.closest("[data-open]"); if (o) { const [t, ...id] = o.dataset.open.split(":"); return openRecord(t, id.join(":")); }
  const b = e.target.closest("button"); if (!b) return; const { T, r } = cur(); if (!r) return;
  if (b.dataset.rm) { setField(b.dataset.rm, (getPath(r.data, b.dataset.rm) || []).filter(x => x !== b.dataset.v)); return; }
  if (b.dataset.rowadd) { const f = T.fields.find(x => x.key === b.dataset.rowadd), row = {}; for (const sf of f.fields) row[sf.key] = sf.default ?? (sf.kind === "enum" ? sf.options[0] : sf.kind === "number" || sf.kind === "int" ? 0 : ""); setField(f.key, [...(getPath(r.data, f.key) || []), row]); return; }
  if (b.dataset.rowrm) { const rows = (getPath(r.data, b.dataset.rowrm) || []).filter((_, i) => i !== +b.dataset.i); setField(b.dataset.rowrm, rows); return; }
  const a = b.dataset.d;
  if (a === "close") closeDrawer();
  if (a === "rename") { const to = await ask("Rename (every reference is updated)", r.id); if (to && to !== r.id) { const x = await cmd("record.rename", { type: T.type, id: r.id, to }); if (x.ok) openRecord(T.type, to); } }
  if (a === "dup") { const to = await ask("Duplicate as", r.id + "_COPY"); if (to) { const x = await cmd("record.duplicate", { type: T.type, id: r.id, to }); if (x.ok) openRecord(T.type, to); } }
  if (a === "del") { if (await confirmBox("Delete this record?", "References to it become problems; the change is refused unless you save anyway.")) { const x = await cmd("record.delete", { type: T.type, id: r.id }); if (x.ok) closeDrawer(); } }
  if (a === "json") editJSON(T, r);
});
function editJSON(T, r) {
  modal(`<h2>Edit as JSON</h2><div class="mono">${esc(T.type)}:${esc(r.id)}</div><textarea class="sql" id="js" style="min-height:340px">${esc(JSON.stringify(r.data, null, 2))}</textarea><div class="acts"><button class="btn" data-m="cancel">Cancel</button><button class="btn primary" data-m="ok">Save</button></div>`,
    async () => { let d; try { d = JSON.parse($("#js").value); } catch { toast("not valid JSON", "bad"); return false; } const x = await cmd("record.replace", { type: T.type, id: r.id, data: d }); if (x.ok) { const nid = T.single ? r.id : getPath(d, T.key); openRecord(T.type, nid); } return x.ok; });
}
function bulkEdit(T, ids) {
  const fs = T.fields.filter(f => f.key !== T.key && ["text", "number", "int", "enum", "ref", "bool"].includes(f.kind));
  modal(`<h2>Bulk edit ${ids.length} records</h2><div class="form"><label>Field</label><select id="bf">${fs.map(f => `<option value="${esc(f.key)}">${esc(labelOf(f))}</option>`).join("")}</select><label>New value</label><span id="bv"></span></div><div class="muted">${esc(ids.join(", "))}</div><div class="acts"><button class="btn" data-m="cancel">Cancel</button><button class="btn primary" data-m="ok">Apply to all</button></div>`,
    async () => { const f = fs.find(x => x.key === $("#bf").value), v = parse(f, $("#bv").firstChild); const x = await cmd("batch", { commands: ids.map(id => ({ type: "record.update", payload: { type: T.type, id, set: { [f.key]: v } } })), label: `bulk set ${f.key} on ${ids.length} ${T.type}` }); return x.ok; });
  const draw = () => { const f = fs.find(x => x.key === $("#bf").value); $("#bv").innerHTML = ["enum", "ref", "bool"].includes(f.kind) ? `<select>${optionsFor(f, null)}</select>` : `<input type="${f.kind === "text" ? "text" : "number"}" step="any">`; };
  $("#bf").onchange = draw; draw();
}

/* ---------------- dashboard ---------------- */
async function renderDashboard(m) {
  m.innerHTML = `<h1>Dashboard</h1><p class="sub">Latest simulation of the master data, data health and recent runs. Every number is from the declared sample data and illustrative scenarios.</p><div id="dash">Loading...</div>`;
  const tok = S.seq; S.runs = await api("/api/runs"); const last = S.runs[0], det = last ? await api("/api/runs/" + last.id) : null; if (tok !== S.seq) return;
  const counts = TYPES.map(T => `<div class="card-k" data-go2="${T.type}" style="cursor:pointer"><div class="l">${esc(T.label)}</div><div class="v">${recs(T.type).length}</div></div>`).join("");
  const el = $("#dash", m); if (!el) return;
  if (!last) { el.innerHTML = `<div class="empty">No simulation yet. <button class="btn primary" id="first-run">&#9654; Run the first simulation</button></div><h3>Master data</h3><div class="cards">${counts}</div>`; $("#first-run").onclick = runDialog; return; }
  el.innerHTML = runSummaryHTML(det) + `<div class="panels" style="margin-top:16px"><div class="panel"><h3>Recent runs</h3>${runsTable(S.runs.slice(0, 8))}</div><div class="panel"><h3>Data health</h3>${S.problems.length ? `<div class="problems-box">${S.problems.slice(0, 8).map(p => `<div>${esc(p.where)}: ${esc(p.message)}</div>`).join("")}</div>` : '<div class="card-k good"><div class="v">OK</div><div class="l">no validation problems</div></div>'}<p class="muted">Revision r${S.meta.revision} &middot; engine ${esc(S.meta.engine)} &middot; database ${esc(S.meta.db)}</p></div></div><h3>Master data</h3><div class="cards">${counts}</div>`;
  el.onclick = e => { const g = e.target.closest("[data-go2]"); if (g) go("type", g.dataset.go2); const rr = e.target.closest("[data-run]"); if (rr) go("run", null, { run: rr.dataset.run }); };
}
function bars(list, opts = {}) { return `<div class="bars">${list.map(x => `<div class="row"><span class="name" title="${esc(x.label)}">${esc(x.label)}</span><span class="track"><span class="fill ${x.v > .9 ? "hot" : x.v > .7 ? "warm" : ""}" style="width:${Math.min(100, x.v * 100).toFixed(1)}%"></span></span><span>${opts.raw ? fmt(x.raw) : pct(x.v)}</span></div>`).join("")}</div>`; }
function runSummaryHTML(det) {
  const k = det.kpis, r = det.report, fin = Object.entries(k.finished).map(([i, n]) => `${n} ${i}`).join(", ") || "-";
  const card = (l, v, s, cls = "") => `<div class="card-k ${cls}"><div class="l">${esc(l)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  return `<div class="bar"><b>Run ${esc(det.id)}</b><span class="muted">${esc(det.scenario)} &middot; ${det.hours} h &middot; seed ${det.seed} &middot; ${esc(det.at.slice(0, 19).replace("T", " "))} &middot; r${det.revision} &middot; fingerprint <span class="mono">${esc(det.fingerprint)}</span></span><button class="btn sm" data-run="${esc(det.id)}">Details</button></div>
<div class="cards">${card("Finished goods", k.finished_total, esc(fin), "good")}${card("In container", k.shipped ?? "-", k.per_container ? `plan ${k.per_container} per container` : "")}${card("Missions done", k.missions_done, `${k.missions_failed} failed, ${k.missions_waiting} waiting`, k.missions_failed ? "bad" : "")}
${card("Mean lead time", fmt(k.mean_lead_s, 0) + " s", "per transport mission")}${card("Bottleneck", k.bottleneck ? esc(k.bottleneck.id) : "-", k.bottleneck ? `${esc(k.bottleneck.kind)} busy ${pct(k.bottleneck.utilisation)}` : "", k.bottleneck && k.bottleneck.utilisation > .95 ? "warn" : "")}
${card("Test yield", pct(k.yield), `first pass ${pct(k.first_pass_yield)}, ${k.fails} fail(s) repaired`)}${card("Traffic wait", fmt(k.traffic_wait_s, 0) + " s", `${k.zones} traffic zone(s)`)}${card("Invariants", k.invariants ? "BROKEN" : "OK", `${k.events} events, ${k.serials} serial numbers`, k.invariants ? "bad" : "good")}</div>
<div class="panels"><div class="panel"><h3>Stations: busy share</h3>${bars(r.stations.map(s => ({ label: s.id, v: s.utilisation })))}</div><div class="panel"><h3>Trolleys and workers: busy share</h3>${bars(r.units.map(u => ({ label: u.id, v: u.utilisation })))}</div></div>`;
}
const runsTable = list => list.length ? `<table class="grid"><tr><th></th><th>Run</th><th>Scenario</th><th>Hours</th><th>Finished</th><th>Bottleneck</th><th>Yield</th><th>When</th></tr>${list.map(r => `<tr data-run="${esc(r.id)}" style="cursor:pointer"><td><input type="checkbox" data-cmp="${esc(r.id)}"></td><td class="k">${esc(r.id)}</td><td>${esc(r.scenario)}</td><td>${r.hours}</td><td>${r.kpis.finished_total}</td><td>${esc(r.kpis.bottleneck?.id || "-")}</td><td>${pct(r.kpis.yield)}</td><td class="muted">${esc(r.at.slice(5, 16).replace("T", " "))}</td></tr>`).join("")}</table>` : '<div class="muted">no runs</div>';

/* ---------------- runs ---------------- */
async function renderRuns(m) {
  const tok = S.seq; S.runs = await api("/api/runs"); if (tok !== S.seq) return;
  m.innerHTML = `<h1>Runs</h1><p class="sub">Every simulation run is stored with its settings, the master data revision, the full report, every event and every serial number. Tick two runs to compare.</p>
<div class="bar"><button class="btn primary" id="rr">&#9654; New run</button><button class="btn" id="cmp" disabled>Compare</button></div><div class="grid-wrap">${runsTable(S.runs)}</div><div id="cmp-out" style="margin-top:16px"></div>`;
  $("#rr", m).onclick = runDialog;
  const picks = () => $$("[data-cmp]:checked", m).map(x => x.dataset.cmp);
  m.querySelector(".grid-wrap").addEventListener("click", e => { if (e.target.dataset.cmp) { $("#cmp", m).disabled = picks().length !== 2; e.stopPropagation(); return; } const tr = e.target.closest("tr[data-run]"); if (tr) go("run", null, { run: tr.dataset.run }); });
  $("#cmp", m).onclick = () => { const [a, b] = picks().map(id => S.runs.find(r => r.id === id)); const keys = ["finished_total", "shipped", "missions_done", "missions_failed", "mean_lead_s", "yield", "first_pass_yield", "fails", "traffic_wait_s", "events"];
    $("#cmp-out", m).innerHTML = `<div class="panel"><h3>${esc(a.id)} (${esc(a.scenario)}) vs ${esc(b.id)} (${esc(b.scenario)})</h3><table class="grid"><tr><th>KPI</th><th>${esc(a.id)}</th><th>${esc(b.id)}</th><th>Change</th></tr>${keys.map(k => { const x = a.kpis[k], y = b.kpis[k], d = typeof x === "number" && typeof y === "number" ? y - x : null; return `<tr><td>${esc(k.replace(/_/g, " "))}</td><td>${fmt(x, 2)}</td><td>${fmt(y, 2)}</td><td>${d == null ? "-" : (d > 0 ? "+" : "") + fmt(d, 2)}</td></tr>`; }).join("")}<tr><td>bottleneck</td><td>${esc(a.kpis.bottleneck?.id)}</td><td>${esc(b.kpis.bottleneck?.id)}</td><td></td></tr></table></div>`; };
}
async function renderRun(m) {
  const tok = S.seq, det = await api("/api/runs/" + S.run); if (tok !== S.seq) return; if (!det || det.error) { m.innerHTML = `<div class="empty">Run ${esc(S.run)} not found.</div>`; return; }
  const r = det.report, tab = S.runTab || "summary";
  m.innerHTML = `<h1>Run ${esc(det.id)}</h1><p class="sub">${esc(det.note || "")}</p><div class="tabs">${["summary", "stations", "events", "serials", "report"].map(t => `<button data-tab="${t}" class="${t === tab ? "on" : ""}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}<button class="btn sm danger" id="delrun" style="margin-inline-start:auto">Delete run</button></div><div id="tab"></div>`;
  $$(".tabs [data-tab]", m).forEach(b => b.onclick = () => { S.runTab = b.dataset.tab; render(); });
  $("#delrun", m).onclick = async () => { if (await confirmBox(`Delete run ${det.id} and its events?`, "")) { await api("/api/runs/" + det.id, { method: "DELETE" }); go("runs"); } };
  const t = $("#tab", m);
  if (tab === "summary") { t.innerHTML = runSummaryHTML(det) + `<div class="panels" style="margin-top:16px"><div class="panel"><h3>Quality</h3>${r.quality.length ? r.quality.map(q => `<div>${esc(q.station)}: ${q.tested} tests, ${q.passed} pass, ${q.failed} fail, yield ${pct(q.yield)}, first pass ${pct(q.first_pass_yield)}, ${q.retests} retest(s)</div>`).join("") : '<span class="muted">no test station in this scenario</span>'}</div>
<div class="panel"><h3>Shipping</h3>${r.shipping ? `<div>${r.shipping.loaded} ${esc(r.shipping.item)} in ${esc(r.shipping.location)}; plan ${r.shipping.per_container} per container (${r.shipping.plan.layers} layers x ${r.shipping.plan.perLayer}, ${esc(r.shipping.plan.limitedBy)}, fill ${pct(r.shipping.plan.volumeFill)})</div><div class="muted">packing list: ${esc((r.shipping.packing_list || []).slice(0, 12).join(", "))}${(r.shipping.packing_list || []).length > 12 ? " ..." : ""}</div>` : '<span class="muted">no shipping plan in this scenario</span>'}</div>
<div class="panel"><h3>Traffic zones (most waits)</h3>${r.zones.length ? bars(r.zones.slice().sort((a, b) => b.wait_s - a.wait_s).slice(0, 8).map(z => ({ label: z.id, v: z.occupied }))) + `<div class="muted">bar = share of time occupied; total wait ${fmt(det.kpis.traffic_wait_s, 0)} s</div>` : '<span class="muted">no traffic zones</span>'}</div>
<div class="panel"><h3>Event types</h3>${bars(det.eventTypes.slice(0, 12).map(e => ({ label: e.type, v: e.n / det.eventTypes[0].n, raw: e.n })), { raw: true })}</div></div>`; t.onclick = e => { const rr = e.target.closest("[data-run]"); if (rr) S.runTab = "summary"; }; }
  if (tab === "stations") t.innerHTML = `<div class="panel"><table class="grid"><tr><th>Station</th><th>Cycles</th><th>Busy</th><th>Starved s</th><th>Blocked s</th><th>Down s</th><th>State at end</th></tr>${r.stations.map(s => `<tr><td class="k"><span class="ref" data-open="process:${esc(s.id)}">${esc(s.id)}</span></td><td>${s.cycles}</td><td>${pct(s.utilisation)}</td><td>${fmt(s.seconds.starved, 0)}</td><td>${fmt(s.seconds.blocked, 0)}</td><td>${fmt(s.seconds.down, 0)}</td><td>${esc(s.state)}</td></tr>`).join("")}</table></div><div class="panel" style="margin-top:16px"><h3>Units</h3><table class="grid"><tr><th>Unit</th><th>Kind</th><th>Busy</th></tr>${r.units.map(u => `<tr><td class="k"><span class="ref" data-open="entity:${esc(u.id)}">${esc(u.id)}</span></td><td>${esc(u.kind)}</td><td>${pct(u.utilisation)}</td></tr>`).join("")}</table></div>`;
  if (tab === "events") { t.innerHTML = `<div class="bar"><select id="et"><option value="">all event types</option>${det.eventTypes.map(e => `<option value="${esc(e.type)}" ${S.evType === e.type ? "selected" : ""}>${esc(e.type)} (${e.n})</option>`).join("")}</select><input type="search" id="eq" placeholder="mission, station or text..." value="${esc(S.evQ || "")}"><button class="btn" id="ego">Show</button><button class="btn" id="emore">Next 200</button></div><div class="grid-wrap" id="evl"></div>`;
    let from = 0; const show = async (reset) => { if (reset) from = 0; S.evType = $("#et").value; S.evQ = $("#eq").value; const ev = await api(`/api/runs/${det.id}/events?from=${from}&limit=200&type=${encodeURIComponent(S.evType)}&q=${encodeURIComponent(S.evQ)}`); $("#evl").innerHTML = `<table class="grid"><tr><th>#</th><th>Time s</th><th>Type</th><th>Mission / station</th><th>Data</th></tr>${ev.map(e => `<tr><td>${e.seq}</td><td>${e.t.toFixed(1)}</td><td>${esc(e.type)}</td><td>${esc(e.mission || e.station || "")}</td><td class="mono">${esc(JSON.stringify(e.data))}</td></tr>`).join("")}</table>`; if (ev.length) from = ev[ev.length - 1].seq + 1; };
    $("#ego").onclick = () => show(true); $("#emore").onclick = () => show(false); show(true); }
  if (tab === "serials") { t.innerHTML = `<div class="bar"><input type="search" id="sq" placeholder="serial, item or location..."><button class="btn" id="sgo">Search</button></div><div class="grid-wrap" id="sl"></div><div id="trace" style="margin-top:16px"></div>`;
    const show = async () => { const list = await api(`/api/runs/${det.id}/serials?q=${encodeURIComponent($("#sq").value)}`); $("#sl").innerHTML = `<table class="grid"><tr><th>Serial</th><th>Item</th><th>Location at end</th><th>Tests</th><th>Fails</th></tr>${list.map(s => `<tr data-sn="${esc(s.serial)}" style="cursor:pointer"><td class="k">${esc(s.serial)}</td><td>${esc(s.item)}</td><td>${esc(s.location)}</td><td>${s.tests}</td><td>${s.fails}</td></tr>`).join("")}</table>`; };
    $("#sgo").onclick = show; show();
    $("#sl").onclick = async e => { const tr = e.target.closest("tr[data-sn]"); if (!tr) return; const tr2 = await api(`/api/runs/${det.id}/trace/${encodeURIComponent(tr.dataset.sn)}`); $("#trace").innerHTML = `<div class="panel"><h3>Trace ${esc(tr2.serial)}</h3><div class="muted">now: ${esc(tr2.now ? tr2.now.item + " at " + tr2.now.location : "-")}</div><table class="grid"><tr><th>Time s</th><th>Event</th><th>Where</th></tr>${tr2.events.map(e => `<tr><td>${e.t.toFixed(1)}</td><td>${esc(e.type)}</td><td class="mono">${esc(e.station || e.data.to || e.data.from || e.mission || "")}</td></tr>`).join("")}</table></div>`; }; }
  if (tab === "report") t.innerHTML = `<pre class="diff" style="max-height:70vh;overflow:auto">${esc(JSON.stringify(r, null, 2))}</pre>`;
}
function runDialog() {
  const sc = recs("scenario");
  modal(`<h2>Run a simulation</h2><div class="form"><label>Scenario</label><select id="r-s">${sc.map(s => `<option value="${esc(s.id)}">${esc(s.id)}${s.data.note ? " - " + esc(s.data.note.slice(0, 60)) : ""}</option>`).join("")}</select>
<label>Hours</label><input id="r-h" type="number" min="0.1" step="0.5" placeholder="scenario horizon"><label>Seed</label><input id="r-seed" type="number" step="1" placeholder="scenario seed"><label>Note</label><input id="r-n" type="text" placeholder="what is this run for?"></div>
${S.meta.problems ? `<div class="problems-box">The master data has ${S.meta.problems} problem(s); the run may be refused.</div>` : ""}<div class="acts"><button class="btn" data-m="cancel">Cancel</button><button class="btn primary" data-m="ok">&#9654; Run</button></div>`,
    async () => { const b = $("#modal-card button[data-m=ok]"); b.disabled = true; b.textContent = "Running..."; const r = await api("/api/run", { method: "POST", body: { scenario: $("#r-s").value, hours: $("#r-h").value || null, seed: $("#r-seed").value || null, note: $("#r-n").value } });
      if (r.id) { toast(`Run ${r.id}: ${r.kpis.finished_total} finished in ${r.hours} h (${r.ms.toFixed(0)} ms)`, "good"); go("run", null, { run: r.id, runTab: "summary" }); return true; } toast(r.reason || "run failed", "bad"); b.disabled = false; b.textContent = "Run"; return false; });
}

/* ---------------- change log ---------------- */
async function renderChanges(m) {
  const tok = S.seq, list = await api("/api/changes?limit=200"); if (tok !== S.seq) return;
  m.innerHTML = `<h1>Change log</h1><p class="sub">Every accepted change, by whom, with the exact before and after of each record. Undo and redo are recorded too; nothing is ever lost.</p>
<div class="bar"><button class="btn" id="cu" ${S.meta.canUndo ? "" : "disabled"}>&#8630; Undo last</button><button class="btn" id="cr" ${S.meta.canRedo ? "" : "disabled"}>&#8631; Redo</button><select id="ca"><option value="">everyone</option>${[...new Set(list.map(c => c.actor))].map(a => `<option ${S.chActor === a ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></div>
<div class="grid-wrap"><table class="grid"><tr><th>#</th><th>Rev</th><th>When</th><th>Who</th><th>Kind</th><th>Change</th><th>Records</th></tr>${list.filter(c => !S.chActor || c.actor === S.chActor).map(c => `<tr data-ch="${c.seq}" style="cursor:pointer"><td>${c.seq}</td><td>r${c.revision}</td><td class="muted">${esc(c.at.slice(0, 19).replace("T", " "))}</td><td>${esc(c.actor)}</td><td>${esc(c.kind)}${c.undone ? ' <span class="tag">undone</span>' : ""}</td><td>${esc(c.label)}</td><td>${c.ops.length}</td></tr><tr class="det" data-for="${c.seq}" hidden><td colspan="7">${c.ops.slice(0, 30).map(diffHTML).join("")}${c.ops.length > 30 ? `<div class="muted">... ${c.ops.length - 30} more</div>` : ""}</td></tr>`).join("")}</table></div>`;
  $("#cu", m).onclick = () => cmd("undo"); $("#cr", m).onclick = () => cmd("redo"); $("#ca", m).onchange = e => { S.chActor = e.target.value; render(); };
  m.querySelector("table").onclick = e => { const tr = e.target.closest("tr[data-ch]"); if (tr) { const d = $(`tr[data-for="${tr.dataset.ch}"]`, m); d.hidden = !d.hidden; } };
}
function diffHTML(o) {
  const flat = (x, p = "", out = {}) => { if (x && typeof x === "object" && !Array.isArray(x)) for (const k of Object.keys(x)) flat(x[k], p ? p + "." + k : k, out); else out[p] = JSON.stringify(x); return out; };
  const a = o.before ? flat(o.before) : {}, b = o.after ? flat(o.after) : {}, keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]);
  const head = `<b>${esc(o.type)}:${esc(o.id)}</b> ${!o.before ? "created" : !o.after ? "deleted" : ""}`;
  return `<div class="diff">${head}${o.before && o.after ? keys.slice(0, 12).map(k => `\n  ${esc(k)}: <span class="a">${esc(a[k] ?? "-")}</span> &#8594; <span class="b">${esc(b[k] ?? "-")}</span>`).join("") : ""}</div>`;
}

/* ---------------- database ---------------- */
async function renderDatabase(m) {
  const tok = S.seq, st = await api("/api/stats"); if (tok !== S.seq) return;
  m.innerHTML = `<h1>Database</h1><p class="sub">One local SQLite file holds the master data, every change, every command, every run with its events and serial numbers. Read-only SQL below (SELECT only).</p>
<div class="cards">${["records", "changes", "commands", "runs", "run_events", "run_serials"].map(k => `<div class="card-k"><div class="l">${k.replace("_", " ")}</div><div class="v">${st[k]}</div></div>`).join("")}</div>
<div class="bar"><span class="mono">${esc(st.file)}</span><button class="btn" id="bk">Backup now</button><a class="btn" href="/api/export">Export JSON</a><label class="btn">Import JSON<input type="file" id="imp" accept=".json" hidden></label></div>
<div class="panel"><h3>SQL (read-only)</h3><textarea class="sql" id="sql">${esc(S.sql || "SELECT type, COUNT(*) AS records FROM records GROUP BY type ORDER BY records DESC")}</textarea><div class="bar" style="margin-top:8px"><button class="btn primary" id="sqlgo">Run query</button>
${["SELECT id, scenario, hours, json_extract(kpis,'$.finished_total') AS finished FROM runs ORDER BY at DESC", "SELECT actor, kind, COUNT(*) n FROM changes GROUP BY actor, kind", "SELECT type, COUNT(*) n FROM run_events GROUP BY type ORDER BY n DESC"].map((q, i) => `<button class="btn sm" data-q="${esc(q)}">Example ${i + 1}</button>`).join("")}</div><div id="sqlout" class="grid-wrap"></div></div>`;
  $("#bk", m).onclick = async () => { const r = await api("/api/backup", { method: "POST" }); toast("Backup: " + r.file, "good"); };
  $("#imp", m).onchange = async e => { const f = e.target.files[0]; if (!f) return; let o; try { o = JSON.parse(await f.text()); } catch { return toast("not a JSON file", "bad"); } if (!(await confirmBox("Replace all master data with this file?", "The current data stays in the change log and can be restored with Undo."))) return; const r = await api("/api/import", { method: "POST", body: o }); if (r.ok) { await load(); toast("Imported: revision " + r.revision, "good"); } else toast(r.reason, "bad", r.code === "refused" ? { label: "Import anyway", fn: async () => { await api("/api/import", { method: "POST", body: { ...o, force: true } }); load(); } } : null); };
  const runQ = async () => { S.sql = $("#sql", m).value; const r = await api("/api/query", { method: "POST", body: { sql: S.sql } }); const out = $("#sqlout", m); if (!r.rows) { out.innerHTML = `<div class="problems-box">${esc(r.reason)}</div>`; return; } const cols = r.rows[0] ? Object.keys(r.rows[0]) : []; out.innerHTML = `<table class="grid"><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>${r.rows.map(x => `<tr>${cols.map(c => `<td class="mono">${esc(typeof x[c] === "string" && x[c].length > 160 ? x[c].slice(0, 160) + "..." : x[c])}</td>`).join("")}</tr>`).join("")}</table><div class="muted" style="padding:6px">${r.total} row(s)</div>`; };
  $("#sqlgo", m).onclick = runQ; m.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { $("#sql", m).value = b.dataset.q; runQ(); }); runQ();
}

/* ---------------- layout map ---------------- */
const CAT_COLOR = { site: "#e5e7eb", zone: "#dbeafe", line: "#e0e7ff", station: "#2563eb", storage: "#f59e0b", container: "#7c3aed", transporter: "#10b981", worker: "#ef4444" };
async function renderMap(m) {
  const tok = S.seq, L = await api("/api/layout"); if (tok !== S.seq) return; S.layout = L; const ms = S.mapState ||= { hide: { site: true }, flows: true, move: false, vb: null };
  m.innerHTML = `<h1>Layout map</h1><p class="sub">Plan view of entities, aisles and material flows (world coordinates, m). Click to edit; switch on Move to drag an entity (its position is saved as a checked command). Wheel to zoom, drag the background to pan.</p>
<div class="bar"><div class="legend">${Object.entries(CAT_COLOR).map(([c, col]) => `<label><input type="checkbox" data-cat="${c}" ${ms.hide[c] ? "" : "checked"}><i style="background:${col}"></i>${c}</label>`).join("")}<label><input type="checkbox" id="mf" ${ms.flows ? "checked" : ""}>flows</label></div><label class="btn ${ms.move ? "primary" : ""}" style="margin-inline-start:auto"><input type="checkbox" id="mv" ${ms.move ? "checked" : ""} hidden>&#10021; Move</label><button class="btn" id="fit">Fit</button></div><div id="map"></div>`;
  $$("[data-cat]", m).forEach(c => c.onchange = () => { ms.hide[c.dataset.cat] = !c.checked; drawMap(); });
  $("#mf", m).onchange = e => { ms.flows = e.target.checked; drawMap(); }; $("#mv", m).onchange = e => { ms.move = e.target.checked; render(); }; $("#fit", m).onclick = () => { ms.vb = null; drawMap(); };
  drawMap();
}
async function renderFilm(m) {
  const tok = S.seq, [list, st] = await Promise.all([api("/api/films"), api("/api/film-status")]); if (tok !== S.seq) return;
  const paths = recs("path");
  m.innerHTML = `<h1>3D &amp; film</h1><p class="sub">The factory in 3D (Godot), built from this database: true CAD walls, columns and objects, and the trolley driven by the Factory Engine timing of a path. 3D in the browser (three.js, like the Material-Flow player) runs smoothly on this laptop; the Godot window is optional; a film renders every frame at full quality (about 7 minutes for a 76 s film on this laptop).</p>
<div class="bar"><select id="fp">${paths.map(p => `<option value="${esc(p.id)}">${esc(p.data.name || p.id)}</option>`).join("") || "<option value=\"\">(no trolley path)</option>"}</select><a class="btn primary" id="web3d" target="_blank" href="/3d.html?path=${encodeURIComponent(paths[0]?.id || "")}">Open 3D in browser</a><button class="btn" id="live">Godot window</button><button class="btn" id="mk" ${st.rendering ? "disabled" : ""}>${st.rendering ? "Rendering..." : "Render film"}</button>
<span class="muted">${st.last ? (st.last.ok ? "last film: " + esc(st.last.name) + " (" + st.last.seconds + " s)" : "last film failed: " + esc(st.last.reason)) : ""}</span></div>
<div class="muted" style="margin:-4px 0 12px">Live keys: Space pause, Left/Right shot, F free camera (W A S D Q E, right mouse to look, Shift fast), 1 / 2 / 3 fly to E1 / E2 / EPS, L labels, H HUD, Esc quit.</div>
${list.length ? list.map(f => `<div class="panel" style="margin-bottom:16px"><h3>${esc(f.name)} <span class="muted">${f.mb} MB, ${esc(f.at.slice(0, 16).replace("T", " "))}</span></h3><video src="/films/${encodeURIComponent(f.name)}" controls preload="metadata" style="width:100%;max-width:1200px;border-radius:8px;background:#000"></video></div>`).join("") : `<div class="empty">No film yet.</div>`}`;
  $("#fp", m).onchange = e => { $("#web3d", m).href = "/3d.html?path=" + encodeURIComponent(e.target.value); };
  $("#live", m).onclick = async () => { const r = await api("/api/live3d", { method: "POST", body: { path: $("#fp", m).value } }); toast(r.ok ? `3D view opening (${r.objects} objects)` : r.reason, r.ok ? "good" : "bad"); };
  $("#mk", m).onclick = async () => { const r = await api("/api/film", { method: "POST", body: { path: $("#fp", m).value } }); toast(r.ok ? "Film rendering started: it appears here when done" : r.reason, r.ok ? "good" : "bad"); render(); };
  if (st.rendering) setTimeout(() => { if (S.view === "film") render(); }, 10000);
}

function drawMap() {
  const L = S.layout, ms = S.mapState, box = $("#map"); if (!box) return;
  const pts = [...L.nodes, ...L.entities.filter(e => e.x != null)]; const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs) - 15, maxX = Math.max(...xs) + 15, minY = Math.min(...ys) - 15, maxY = Math.max(...ys) + 15;
  ms.vb ||= [minX, -maxY, maxX - minX, maxY - minY];   // y up in the factory, down on screen
  const node = Object.fromEntries(L.nodes.map(n => [n.id, n])), port = Object.fromEntries(L.ports.map(p => [p.id, p])), Y = y => -y;
  let svg = `<svg viewBox="${ms.vb.join(" ")}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#7c3aed"/></marker></defs>`;
  const CADS = { exterior_wall: ["#475569", 0.45], wall: ["#64748b", 0.3], partition: ["#94a3b8", 0.18], marking: ["#eab308", 0.12], outline: ["#f59e0b", 0.3] };
  for (const c of L.cad || []) {   // true AutoCAD geometry (metres): one path per layer keeps the map fast
    if (c.kind === "column") { svg += `<g fill="#334155">${c.segments.map(r => `<rect x="${r[0] - r[2] / 2}" y="${Y(r[1]) - r[3] / 2}" width="${r[2]}" height="${r[3]}"/>`).join("")}</g>`; continue; }
    const st = CADS[c.kind] || ["#94a3b8", 0.2]; svg += `<path d="${c.segments.map(s => `M${s[0]} ${Y(s[1])}L${s[2]} ${Y(s[3])}`).join("")}" stroke="${st[0]}" stroke-width="${st[1]}" fill="none"><title>${esc(c.id)}</title></path>`;
  }
  svg += L.edges.map(e => { const a = node[e.a], b = node[e.b]; return a && b ? `<line x1="${a.x}" y1="${Y(a.y)}" x2="${b.x}" y2="${Y(b.y)}" stroke="#cbd5e1" stroke-width="${Math.max(.6, e.width * .8)}" stroke-linecap="round" data-open="edge:${esc(e.id)}"><title>${esc(e.id)} ${e.width} m</title></line>` : ""; }).join("");
  svg += L.nodes.map(n => `<circle cx="${n.x}" cy="${Y(n.y)}" r=".7" fill="#64748b" data-open="node:${esc(n.id)}"><title>${esc(n.id)}</title></circle>`).join("");
  const order = ["site", "zone", "line", "storage", "container", "station", "transporter", "worker"];
  for (const cat of order) for (const e of L.entities.filter(x => x.category === cat && x.x != null && !ms.hide[cat])) {
    const [w, d] = e.size ? [e.size[0], e.size[1]] : [2, 2], big = ["site", "zone", "line"].includes(cat);
    svg += `<g data-ent="${esc(e.id)}" data-open="entity:${esc(e.id)}" transform="translate(${e.x} ${Y(e.y)}) rotate(${-(e.yaw || 0)})" style="cursor:${ms.move ? "move" : "pointer"}"><rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" rx="${big ? 1.5 : .4}" fill="${CAT_COLOR[cat]}" fill-opacity="${big ? .35 : .9}" stroke="${big ? "#93c5fd" : "#0f172a33"}" stroke-width=".25"/>${["station", "storage", "container", "zone"].includes(cat) ? `<text y="${big ? -d / 2 + 2.6 : .7}" text-anchor="middle" font-size="${big ? 2.4 : 1.6}" fill="${big ? "#1e3a8a" : "#fff"}" pointer-events="none">${esc(e.id.replace(/^(ST_|BUF_|ZONE_|WH_)/, ""))}</text>` : ""}<title>${esc(e.id)} (${cat})</title></g>`;
  }
  if (ms.flows) svg += L.flows.map(f => { const a = port[f.from], b = port[f.to]; return a && b && a.x != null && b.x != null ? `<line x1="${a.x}" y1="${Y(a.y)}" x2="${b.x}" y2="${Y(b.y)}" stroke="#7c3aed" stroke-opacity=".45" stroke-width=".35" marker-end="url(#ar)" data-open="flow:${esc(f.id)}"><title>${esc(f.id)}: ${esc(f.item)}</title></line>` : ""; }).join("");
  for (const p of L.paths || []) svg += p.routes.filter(r => r && r.length > 1).map(r => `<polyline points="${r.map(q => q[0] + "," + Y(q[1])).join(" ")}" fill="none" stroke="${esc(p.color || "#f59e0b")}" stroke-width=".55" stroke-linejoin="round" stroke-opacity=".9" data-open="path:${esc(p.id)}"><title>${esc(p.name)}${p.clash ? " - " + p.clash + " route clash(es) with CAD objects" : ""}</title></polyline>`).join("");
  svg += (L.stops || []).map(s => `<g data-open="stop:${esc(s.id)}"><circle cx="${s.x}" cy="${Y(s.y)}" r=".9" fill="#fff" stroke="#7c3aed" stroke-width=".35"/><text x="${s.x + 1.2}" y="${Y(s.y) + .5}" font-size="1.6" fill="#1e1b4b">${esc(s.name)}</text></g>`).join("");
  box.innerHTML = svg + "</svg>"; const el = box.firstChild;
  const toWorld = ev => { const r = el.getBoundingClientRect(), s = Math.max(ms.vb[2] / r.width, ms.vb[3] / r.height), ox = (r.width * s - ms.vb[2]) / 2, oy = (r.height * s - ms.vb[3]) / 2; return [ms.vb[0] - ox + (ev.clientX - r.left) * s, ms.vb[1] - oy + (ev.clientY - r.top) * s]; };
  el.addEventListener("wheel", ev => { ev.preventDefault(); const [wx, wy] = toWorld(ev), k = ev.deltaY > 0 ? 1.15 : 1 / 1.15; ms.vb = [wx - (wx - ms.vb[0]) * k, wy - (wy - ms.vb[1]) * k, ms.vb[2] * k, ms.vb[3] * k]; el.setAttribute("viewBox", ms.vb.join(" ")); }, { passive: false });
  let drag = null;
  el.addEventListener("pointerdown", ev => { const g = ev.target.closest("[data-ent]"); const [wx, wy] = toWorld(ev); drag = { x: wx, y: wy, ent: ms.move && g ? g.dataset.ent : null, moved: false, g, vb: ms.vb.slice() }; el.setPointerCapture(ev.pointerId); if (!drag.ent) el.classList.add("panning"); });
  el.addEventListener("pointermove", ev => { if (!drag) return; const [wx, wy] = toWorld(ev), dx = wx - drag.x, dy = wy - drag.y; if (Math.abs(dx) + Math.abs(dy) > .3) drag.moved = true;
    if (drag.ent) { const e = L.entities.find(x => x.id === drag.ent); drag.g.setAttribute("transform", `translate(${e.x + dx} ${Y(e.y) + dy}) rotate(${-(e.yaw || 0)})`); drag.dx = dx; drag.dy = -dy; }
    else { ms.vb = [drag.vb[0] - dx, drag.vb[1] - dy, drag.vb[2], drag.vb[3]]; el.setAttribute("viewBox", ms.vb.join(" ")); drag.x = wx - dx; drag.y = wy - dy; } });
  el.addEventListener("pointerup", async ev => { el.classList.remove("panning"); const d = drag; drag = null; if (!d) return;
    if (d.ent && d.moved) { await moveEntity(d.ent, d.dx, d.dy); return; }
    if (!d.moved) { const o = ev.target.closest("[data-open]"); if (o) { const [t, ...id] = o.dataset.open.split(":"); openRecord(t, id.join(":")); } } });
}
// Move by a world delta: the stored position is relative to the spatial parent, so the delta is turned into parent axes.
async function moveEntity(id, dx, dy) {
  const r = findRec("entity", id), parent = r.data.spatial_parent_id && S.layout.entities.find(e => e.id === r.data.spatial_parent_id), yaw = (parent ? parent.yaw : 0) * Math.PI / 180;
  const lx = dx * Math.cos(yaw) + dy * Math.sin(yaw), ly = -dx * Math.sin(yaw) + dy * Math.cos(yaw), p = r.data.transform?.position_m || [0, 0, 0], snap = S.records.factory[0]?.data?.snap_step_m || .25, q = v => Math.round(v / snap) * snap;
  await cmd("record.update", { type: "entity", id, set: { "transform.position_m": [q(p[0] + lx), q(p[1] + ly), p[2]] } });
  if (S.view === "map") { S.layout = await api("/api/layout"); drawMap(); }
}

/* ---------------- dialogs ---------------- */
let modalDone = null;
function modal(html, onOk) { $("#modal-card").innerHTML = html; $("#modal").hidden = false; modalDone = onOk; const f = $("#modal-card input, #modal-card select, #modal-card textarea"); if (f) f.focus(); }
function closeModal() { $("#modal").hidden = true; modalDone = null; }
$("#modal").addEventListener("click", async e => { if (e.target.id === "modal") return closeModal(); const b = e.target.closest("[data-m]"); if (!b) return; if (b.dataset.m === "cancel") return closeModal(); if (modalDone) { const fn = modalDone; if (await fn() !== false) closeModal(); } else closeModal(); });
$("#modal").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); $("#modal-card [data-m=ok]")?.click(); } if (e.key === "Escape") closeModal(); });
const ask = (title, value) => new Promise(ok => { modal(`<h2>${esc(title)}</h2><div class="form"><label>Value</label><input id="ask" type="text" value="${esc(value)}"></div><div class="acts"><button class="btn" data-m="cancel">Cancel</button><button class="btn primary" data-m="ok">OK</button></div>`, () => { ok($("#ask").value.trim()); return true; }); const i = $("#ask"); i.select(); const c = $("#modal-card [data-m=cancel]"); c.addEventListener("click", () => ok(null), { once: true }); });
const confirmBox = (title, text) => new Promise(ok => { modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="acts"><button class="btn" data-m="cancel">Cancel</button><button class="btn danger" data-m="ok">Confirm</button></div>`, () => { ok(true); return true; }); $("#modal-card [data-m=cancel]").addEventListener("click", () => ok(false), { once: true }); });
function showProblems() {
  modal(`<h2>${S.problems.length} problem${S.problems.length === 1 ? "" : "s"}</h2>${S.problems.length ? `<div>${S.problems.map(p => `<div class="diff" style="cursor:pointer" ${p.type ? `data-open="${p.type}:${esc(p.id)}"` : ""}><b>${esc(p.where)}</b> ${esc(p.message)}</div>`).join("")}</div>` : "<p>The master data passes every check: field checks, blueprint semantics, and every scenario builds an engine model.</p>"}<div class="acts"><button class="btn" data-m="cancel">Close</button></div>`);
  $("#modal-card").onclick = e => { const o = e.target.closest("[data-open]"); if (o) { closeModal(); const [t, ...id] = o.dataset.open.split(":"); go("type", t); openRecord(t, id.join(":")); } };
}

/* ---------------- command palette ---------------- */
// Grammar (same as control/fc.mjs): set <type> <id> f=v ... | new <type> <id> [f=v ...] | delete|rename|dup <type> <id> [to] | run [scenario] [hours] | undo | redo | go <page>
const val = s => { try { return JSON.parse(s); } catch { return s; } };
async function execLine(line) {
  const [c, t, id, ...rest] = line.trim().split(/\s+/), pairs = list => Object.fromEntries(list.filter(Boolean).map(p => { const i = p.indexOf("="); return [p.slice(0, i), val(p.slice(i + 1))]; }));
  if (c === "undo" || c === "redo") return cmd(c);
  if (c === "run") { const r = await api("/api/run", { method: "POST", body: { scenario: t || null, hours: id || null } }); if (r.id) { toast(`Run ${r.id}: ${r.kpis.finished_total} finished`, "good"); go("run", null, { run: r.id, runTab: "summary" }); } else toast(r.reason, "bad"); return r; }
  if (c === "go") { const T = TYPES.find(x => x.type === t || x.label.toLowerCase().startsWith((t || "").toLowerCase())); return T ? go("type", T.type) : go(t || "dashboard"); }
  if (!TYPE[t]) return toast(`unknown type ${t}`, "bad");
  if (c === "set") { const r = await cmd("record.update", { type: t, id, set: pairs(rest) }); if (r.ok) openRecord(t, id); return r; }
  if (c === "new") { const d = blank(t, TYPE[t].single ? undefined : id); for (const [k, v] of Object.entries(pairs(TYPE[t].single ? [id, ...rest] : rest))) setPath(d, k, v); const r = await cmd("record.create", { type: t, data: d }, { force: true }); if (r.ok) { go("type", t); openRecord(t, TYPE[t].single ? recs(t)[0]?.id : id); } return r; }
  if (c === "delete") return cmd("record.delete", { type: t, id });
  if (c === "rename") { const r = await cmd("record.rename", { type: t, id, to: rest[0] }); if (r.ok) openRecord(t, rest[0]); return r; }
  if (c === "dup") { const r = await cmd("record.duplicate", { type: t, id, to: rest[0] }); if (r.ok) openRecord(t, rest[0]); return r; }
  toast(`unknown command ${c}`, "bad");
}
window.FC.exec = execLine;
let palItems = [], palOn = 0;
function openPalette(prefill = "") { $("#palette").hidden = false; const i = $("#pal-in"); i.value = prefill; i.focus(); palFill(); }
function closePalette() { $("#palette").hidden = true; }
function palFill() {
  const q = $("#pal-in").value.trim(), ql = q.toLowerCase(), items = [];
  if (/^(set|new|delete|rename|dup|run|undo|redo|go)\b/.test(ql)) items.push({ label: `Run command: ${q}`, hint: "Enter", fn: () => execLine(q) });
  const pages = [["Dashboard", "dashboard"], ["Layout map", "map"], ["Runs", "runs"], ["Change log", "changes"], ["Database", "database"], ["3D & film", "film"]];
  for (const [l, v] of pages) if (!ql || l.toLowerCase().includes(ql)) items.push({ label: l, hint: "page", fn: () => go(v) });
  for (const T of TYPES) if (!ql || T.label.toLowerCase().includes(ql) || T.type.includes(ql)) items.push({ label: T.label, hint: "master data", fn: () => go("type", T.type) });
  if (!ql || "undo".includes(ql)) items.push({ label: "Undo last change", hint: "Ctrl+Z", fn: () => cmd("undo") });
  if (ql.length >= 2 || !ql) for (const s of recs("scenario")) if (!ql || ("run " + s.id).includes(ql)) items.push({ label: `Run scenario ${s.id}`, hint: "simulation", fn: () => execLine("run " + s.id) });
  if (ql.length >= 2) for (const T of TYPES) for (const r of recs(T.type)) { const n = (r.id + " " + (r.data.name || "")).toLowerCase(); if (n.includes(ql)) items.push({ label: `${r.id}${r.data.name ? " - " + r.data.name : ""}`, hint: T.label, fn: () => { go("type", T.type); openRecord(T.type, r.id); } }); }
  palItems = items.slice(0, 60); palOn = 0;
  $("#pal-list").innerHTML = palItems.map((x, i) => `<div data-i="${i}" class="${i === 0 ? "on" : ""}"><span>${esc(x.label)}</span><small>${esc(x.hint)}</small></div>`).join("") || '<div class="muted">nothing found</div>';
}
$("#pal-in").addEventListener("input", palFill);
$("#pal-in").addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); palOn = (palOn + (e.key === "ArrowDown" ? 1 : -1) + palItems.length) % Math.max(1, palItems.length); $$("#pal-list div").forEach((d, i) => d.classList.toggle("on", i === palOn)); $$("#pal-list div")[palOn]?.scrollIntoView({ block: "nearest" }); }
  if (e.key === "Enter") { e.preventDefault(); const it = palItems[palOn]; closePalette(); if (it) it.fn(); }
  if (e.key === "Escape") closePalette();
});
$("#pal-list").addEventListener("click", e => { const d = e.target.closest("[data-i]"); if (d) { closePalette(); palItems[+d.dataset.i].fn(); } });
$("#palette").addEventListener("click", e => { if (e.target.id === "palette") closePalette(); });

/* ---------------- global wiring ---------------- */
$("#find").onclick = () => openPalette(); $("#undo").onclick = () => cmd("undo"); $("#redo").onclick = () => cmd("redo"); $("#run").onclick = runDialog; $("#problems").onclick = showProblems;
document.addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (!typing && e.key === "/") { e.preventDefault(); openPalette(); return; }
  if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); cmd(e.shiftKey ? "redo" : "undo"); return; }
  if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); cmd("redo"); return; }
  if (e.key === "Escape" && !$("#palette").hidden) return closePalette();
  if (e.key === "Escape" && $("#modal").hidden && S.drawer) closeDrawer();
});
// Live sync: another client (the agent's CLI or API) changed the data.
setInterval(async () => { if (document.hidden || S.busy) return; try { const m = await api("/api/meta"); if (m.revision !== S.lastRev && !S.busy) { const mine = Date.now() - (S.localAt || 0) < 2500; await load(); if (!mine) toast(`Data changed elsewhere (r${m.revision}): view updated`, ""); } } catch { } }, 1500);
// UI language: English, Arabic (right to left) or Korean; remembered in this browser.
const translator = installTranslator(() => S.lang);
function setLang(l) {
  if (!LANGS[l]) return; S.lang = l; try { localStorage.setItem("fc:lang", l); } catch { }
  document.documentElement.lang = l; document.documentElement.dir = LANGS[l].dir; $("#lang").value = l;
  renderChrome(); render(); renderDrawer(); translator.refresh();
}
window.FC.setLang = setLang;
$("#lang").onchange = e => setLang(e.target.value);
S.lang = (() => { try { return localStorage.getItem("fc:lang"); } catch { return null; } })() || "en";
const [v0, t0] = (location.hash.slice(1) || "dashboard").split("/");
await load();
if (v0 === "type" && TYPE[t0]) go("type", t0); else if (v0 === "run" && t0) go("run", null, { run: t0 }); else if (["dashboard", "map", "runs", "changes", "database", "film"].includes(v0)) go(v0); else go("dashboard");
setLang(S.lang);
window.FC.ready = true;
