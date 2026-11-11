/* ===== V7 Studio: director (camera keyframes, captions, camera-move recording, video takes) =====
   Everything is a pure function of story time per flow, so a shot plays the same at every speed and every seek, and a recorded
   video is simply a replay of the timeline with the director camera and the captions drawn in. */
const dirOf = (f = curFlow()) => { if (!f) return { keys: [], caps: [] }; const d = doc.director[f.id] || (doc.director[f.id] = { keys: [], caps: [] }); d.keys = d.keys || []; d.caps = d.caps || []; return d; };
const sortKeys = (d) => d.keys.sort((a, b) => a.t - b.t);
const keyPose = (k, t, out) => {   // a key's pose at story time t (trolley-locked keys ride with the trolley)
  if (k.follow) { const p = trolleyWorld(t, tmpV); out.x = p.x + k.ox; out.y = p.y + k.oy; out.z = p.z + k.oz; } else { out.x = k.x; out.y = k.y; out.z = k.z; }
  out.dist = k.dist; out.az = k.az; out.pol = k.pol; out.fov = k.fov || BASE_FOV; return out;
};
const PA = {}, PB = {}, P0 = {}, P3 = {}, POSE = {};
const cr = (p0, p1, p2, p3, u) => { const u2 = u * u, u3 = u2 * u; return .5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); };
function evalDirector(t, d = dirOf()) {
  const K = d.keys; if (!K.length) return null;
  if (t <= K[0].t) return Object.assign({}, keyPose(K[0], t, POSE));
  if (t >= K[K.length - 1].t) return Object.assign({}, keyPose(K[K.length - 1], t, POSE));
  let i = 0; while (i < K.length - 2 && t >= K[i + 1].t) i++;
  const a = K[i], b = K[i + 1]; keyPose(a, t, PA);
  if (b.ease === "cut" || b.t - a.t < 1e-3) return Object.assign({}, PA);
  keyPose(b, t, PB); let u = (t - a.t) / (b.t - a.t);
  if (b.ease === "linear") { /* constant speed */ } else if (b.ease === "in") u = u * u; else if (b.ease === "out") u = 1 - (1 - u) * (1 - u); else u = smooth(u);
  const pk = K[i - 1] && b.ease !== "cut" && a.ease !== "cut" ? keyPose(K[i - 1], t, P0) : PA, nk = K[i + 2] && K[i + 2].ease !== "cut" ? keyPose(K[i + 2], t, P3) : PB;
  const out = {};
  for (const ax of ["x", "y", "z"]) out[ax] = cr(pk[ax], PA[ax], PB[ax], nk[ax], u);
  out.dist = Math.exp(lerp(Math.log(PA.dist), Math.log(PB.dist), u)); out.az = PA.az + wrapPi(PB.az - PA.az) * u; out.pol = lerp(PA.pol, PB.pol, u); out.fov = lerp(PA.fov, PB.fov, u);
  return out;
}
directorPose = (t) => evalDirector(t);
function addKey(opts = {}) {
  const f = curFlow(); if (!f) return; const c = currentPose(), t = +S.t.toFixed(2), follow = !!opts.follow;
  const k = { id: uid("key"), t, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), dist: +c.dist.toFixed(2), az: +c.az.toFixed(4), pol: +c.pol.toFixed(4), fov: +c.fov.toFixed(2), ease: opts.ease || "smooth", follow };
  if (follow) { const p = trolleyWorld(S.t); k.ox = +(c.x - p.x).toFixed(2); k.oy = +(c.y - p.y).toFixed(2); k.oz = +(c.z - p.z).toFixed(2); }
  commit("add camera key at " + fmtT(t), () => { const d = dirOf(f); const same = d.keys.findIndex((q) => Math.abs(q.t - t) < .05); if (same >= 0) { k.id = d.keys[same].id; d.keys[same] = k; } else d.keys.push(k); sortKeys(d); }, "director");
  dsel.key = k.id; emit("director");
}
function updateKey(id) { const d = dirOf(), k = d.keys.find((q) => q.id === id); if (!k) return; const c = currentPose(); commit("update camera key", () => { Object.assign(k, { x: c.x, y: c.y, z: c.z, dist: c.dist, az: c.az, pol: c.pol, fov: c.fov }); if (k.follow) { const p = trolleyWorld(k.t); k.ox = c.x - p.x; k.oy = c.y - p.y; k.oz = c.z - p.z; } }, "director"); }
function deleteKey(id) { commit("delete camera key", () => { const d = dirOf(); d.keys = d.keys.filter((q) => q.id !== id); }, "director"); if (dsel.key === id) dsel.key = null; }
function addCaption() {
  const f = curFlow(); if (!f) return; const t0 = +S.t.toFixed(2), cur = X.stepAt(S.t);
  const c = { id: uid("cap"), t0, t1: +Math.min(t0 + 4, X.F().total).toFixed(2), title: cur && !cur.s.intro ? cur.s.title : "Title", text: "Write the explanation here", pos: "lower", style: "glass", size: 1 };
  commit("add caption", () => dirOf(f).caps.push(c), "director"); dsel.cap = c.id; emit("director");
}
const dsel = { key: null, cap: null };

/* ---------- captions on screen (English, Arabic, Korean: a text is a string or { en, ar, ko }) ---------- */
const LANGS = [["en", "English"], ["ar", "العربية"], ["ko", "한국어"]];
const lang = () => doc.settings.lang || "en";
const tr = (v, l = lang()) => (v == null ? "" : typeof v === "string" ? (l === "en" ? v : v) : v[l] || v.en || Object.values(v)[0] || "");
const trEdit = (v, l = lang()) => (v == null ? "" : typeof v === "string" ? (l === "en" ? v : "") : v[l] || "");
function setTr(o, k, val, l = lang()) { if (typeof o[k] !== "object" || o[k] == null) o[k] = { en: typeof o[k] === "string" ? o[k] : "" }; o[k][l] = val; }
const capLayer = document.createElement("div"); capLayer.id = "cap7"; stage.appendChild(capLayer);
const capEls = new Map();
function drawCaptions() {
  const d = dirOf(), t = S.t, live = new Set();
  for (const c of d.caps) {
    const fade = .35, a = Math.min(clamp((t - c.t0) / fade, 0, 1), clamp((c.t1 - t) / fade, 0, 1)); if (a <= 0) continue;
    live.add(c.id); let el = capEls.get(c.id);
    if (!el) { el = document.createElement("div"); el.innerHTML = "<b></b><p></p>"; capLayer.appendChild(el); capEls.set(c.id, el); }
    const ti = tr(c.title), tx = tr(c.text), key = ti + "|" + tx + "|" + c.pos + "|" + c.style + "|" + c.size + "|" + lang();
    if (el._k !== key) { el._k = key; el.className = `cap7 ${c.pos} ${c.style}`; el.dir = lang() === "ar" ? "rtl" : "ltr"; el.style.setProperty("--s", c.size || 1); el.firstChild.textContent = ti; el.lastChild.textContent = tx; el.firstChild.style.display = ti ? "" : "none"; el.lastChild.style.display = tx ? "" : "none"; }
    el.style.opacity = a; el.style.transform = c.pos === "center" ? `translate(-50%,-50%) scale(${.96 + .04 * a})` : c.pos === "lower" || c.pos === "upper" ? `translateX(-50%) translateY(${(1 - a) * 10}px)` : `translateY(${(1 - a) * 10}px)`;
  }
  for (const [id, el] of capEls) if (!live.has(id)) { el.remove(); capEls.delete(id); }
}

/* ---------- record a camera move as keys (while playing) ---------- */
const camRec = { on: false, keys: [], last: -1 };
function startCamRec() { if (!curFlow()) return; goFree(true); camRec.on = true; camRec.keys = []; camRec.last = -1; if (!S.playing) MF.play(); X.tip("Recording your camera moves: drive with the pad or the mouse; press Stop when done"); emit("director"); }
function sampleCamRec() {
  if (!camRec.on) return; if (!S.playing) { stopCamRec(); return; }
  if (camRec.last >= 0 && S.t - camRec.last < .25) return; camRec.last = S.t; const c = currentPose(); camRec.keys.push({ t: +S.t.toFixed(2), x: c.x, y: c.y, z: c.z, dist: c.dist, az: c.az, pol: c.pol, fov: c.fov });
}
function stopCamRec() {
  if (!camRec.on) return; camRec.on = false; const K = camRec.keys; if (K.length < 2) { emit("director"); return; }
  // keep a key only where a straight blend of its neighbours would miss it (shape-preserving reduction)
  const keep = [K[0]];
  for (let i = 1; i < K.length - 1; i++) {
    const a = keep[keep.length - 1], b = K[i + 1], k = K[i], u = (k.t - a.t) / Math.max(1e-3, b.t - a.t), pos = Math.hypot(lerp(a.x, b.x, u) - k.x, lerp(a.y, b.y, u) - k.y, lerp(a.z, b.z, u) - k.z);
    const err = pos / Math.max(10, k.dist) + Math.abs(wrapPi(a.az + wrapPi(b.az - a.az) * u - k.az)) * 1.5 + Math.abs(lerp(a.pol, b.pol, u) - k.pol) * 1.5 + Math.abs(Math.log(Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), u)) / k.dist)) + Math.abs(lerp(a.fov, b.fov, u) - k.fov) / 30;
    if (err > .03 || k.t - a.t > 3) keep.push(k);
  }
  keep.push(K[K.length - 1]);
  const t0 = keep[0].t, t1 = keep[keep.length - 1].t;
  commit("record camera move", () => { const d = dirOf(); d.keys = d.keys.filter((q) => q.t < t0 - .01 || q.t > t1 + .01); for (const k of keep) d.keys.push({ id: uid("key"), ease: "smooth", follow: false, ...k }); sortKeys(d); }, "director");
  X.tip(`Camera move recorded: ${keep.length} keys from ${fmtT(t0)} to ${fmtT(t1)}`); emit("director");
}

/* ---------- video takes: replay the timeline and record the screen picture (WebM) ---------- */
const rec = { active: false, mr: null, chunks: [], comp: null, cg: null, take: null, started: 0, saved: null };
function newTake() { const f = curFlow(); return { id: uid("take"), name: "Take " + (doc.takes.length + 1), flow: f ? f.id : "", t0: 0, t1: f ? +X.F().total.toFixed(2) : 10, speed: 1, cam: dirOf(f).keys.length ? "director" : "guided", captions: true, card: true, labels: true, quality: "high", fps: 60 }; }
function pickMime() { for (const m of ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; return ""; }
function startTake(take) {
  if (rec.active) return; if (!window.MediaRecorder) return X.tip("This browser cannot record video");
  const fi = doc.flows.findIndex((f) => f.id === take.flow); if (fi < 0) return X.tip("The take's flow no longer exists");
  if (fi !== S.flow) MF.setFlow(fi);
  rec.saved = { cam: S.cam, speed: S.speed, playing: S.playing, edOpen: ed.open, stepStop: S.stepStop }; S.stepStop = false;
  MF.seek(take.t0); MF.pause(); if (take.cam === "director" && dirOf().keys.length) MF.setCam("director"); else if (take.cam && take.cam !== "keep") MF.setCam(take.cam);
  X.setSpeed(take.speed);
  const w = Math.round(innerWidth / 2) * 2, h = Math.round(innerHeight / 2) * 2;
  rec.comp = rec.comp || document.createElement("canvas"); rec.comp.width = w; rec.comp.height = h; rec.cg = rec.comp.getContext("2d");
  const stream = rec.comp.captureStream(take.fps || 60), mime = pickMime();
  try { rec.mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: take.quality === "high" ? 16e6 : 8e6 } : undefined); } catch (e) { return X.tip("Video recording failed to start: " + e.message); }
  rec.chunks = []; rec.mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
  rec.mr.onstop = () => {
    const blob = new Blob(rec.chunks, { type: (rec.mr && rec.mr.mimeType) || "video/webm" }), a = document.createElement("a"), f = flowById(take.flow);
    a.href = URL.createObjectURL(blob); a.download = `Material_Flow_${PROJECT}_${(f ? f.name : "flow").replace(/[^\w.-]+/g, "_").slice(0, 40)}_${take.name.replace(/[^\w.-]+/g, "_")}.${/mp4/.test(blob.type) ? "mp4" : "webm"}`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    X.tip(`Video saved: ${(blob.size / 1048576).toFixed(1)} MB (${a.download})`); emit("rec");
  };
  rec.take = take; rec.active = true; rec.started = performance.now(); document.body.classList.add("rec7");
  rec.mr.start(250); MF.play(); emit("rec");
}
function stopTake() {
  if (!rec.active) return; rec.active = false; try { rec.mr.stop(); } catch (e) {}
  document.body.classList.remove("rec7"); MF.pause();
  const sv = rec.saved; if (sv) { S.stepStop = sv.stepStop; X.setSpeed(sv.speed); if (sv.cam !== S.cam) MF.setCam(sv.cam === "director" && !dirOf().keys.length ? "guided" : sv.cam); }
  emit("rec");
}
// composite one video frame: the 3D picture, the plan overlay, labels, the step card and captions
function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function compositeFrame() {
  const take = rec.take, g = rec.cg, W = rec.comp.width, H = rec.comp.height, sx = W / innerWidth, sy = H / innerHeight;
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(X.renderer.domElement, 0, 0, W, H); g.drawImage($("fx"), 0, 0, W, H);
  g.setTransform(sx, 0, 0, sy, 0, 0); g.textBaseline = "middle";
  if (take.labels) for (const el of labelsEl.children) {
    if (el.style.display === "none" || !el.style.transform) continue; const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform); if (!m) continue; const x = +m[1], y = +m[2];
    if (el.classList.contains("chip")) {
      const mk = el.querySelector(".mk"), tx = el.querySelector(".tx"), col = getComputedStyle(el).getPropertyValue("--c") || "#2f6fb0";
      g.globalAlpha = el.classList.contains("dim") ? .45 : 1; g.fillStyle = col.trim() || "#2f6fb0"; g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(x + 9, y + 9, 8, 0, 7); g.fill(); g.stroke();
      if (tx && getComputedStyle(tx).display !== "none" && tx.textContent) { g.font = "600 12px Segoe UI, system-ui"; const w = g.measureText(tx.textContent).width + 20; g.fillStyle = el.classList.contains("now") ? "#2a74db" : el.classList.contains("done") ? "rgba(18,82,72,.92)" : "rgba(28,70,130,.9)"; rr(g, x + 24, y, w, 20, 10); g.fill(); g.strokeStyle = "rgba(190,224,255,.5)"; g.lineWidth = 1; g.stroke(); g.fillStyle = "#fff"; g.fillText(tx.textContent, x + 34, y + 10.5); }
      g.globalAlpha = 1;
    } else if (el.classList.contains("v5toast")) { g.font = "600 12px Segoe UI, system-ui"; const t = el.textContent, w = g.measureText(t).width + 20; g.fillStyle = (el.style.getPropertyValue("--c") || "#1f9d6b").trim(); rr(g, x - w / 2, y - 22, w, 22, 11); g.fill(); g.fillStyle = "#fff"; g.textAlign = "center"; g.fillText(t, x, y - 10.5); g.textAlign = "left"; }
  }
  if (take.card) {
    const cur = X.stepAt(S.t); if (cur && !cur.s.intro) {
      const w = Math.min(760, innerWidth - 120), x = (innerWidth - w) / 2, y = innerHeight - 96; const grd = g.createLinearGradient(0, y, 0, y + 76); grd.addColorStop(0, "rgba(52,112,188,.78)"); grd.addColorStop(1, "rgba(12,36,78,.86)");
      g.fillStyle = grd; rr(g, x, y, w, 76, 20); g.fill(); g.strokeStyle = "rgba(190,224,255,.4)"; g.lineWidth = 1; g.stroke(); g.textAlign = "center"; g.fillStyle = "#fff"; g.font = "600 17px Segoe UI, system-ui"; g.fillText(`${cur.i}. ${cur.s.title}`, innerWidth / 2, y + 24);
      g.font = "13px Segoe UI, system-ui"; g.fillStyle = "#c3d6ec"; const words = String(cur.s.what || "").split(/\s+/); let line = "", ly = y + 48; for (const wd of words) { if (g.measureText(line + " " + wd).width > w - 40) { g.fillText(line, innerWidth / 2, ly); line = wd; ly += 17; if (ly > y + 70) break; } else line = line ? line + " " + wd : wd; } if (ly <= y + 70) g.fillText(line, innerWidth / 2, ly); g.textAlign = "left";
    }
  }
  if (take.captions) for (const el of capLayer.children) {
    const op = +el.style.opacity || 0; if (op <= .01) continue; const r = el.getBoundingClientRect(), cs = getComputedStyle(el), b = el.firstChild, p = el.lastChild;
    g.globalAlpha = op; g.fillStyle = cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : "rgba(12,36,78,.82)"; rr(g, r.left, r.top, r.width, r.height, parseFloat(cs.borderRadius) || 14); g.fill();
    const pad = parseFloat(cs.paddingLeft) || 18, ta = cs.textAlign === "center" ? "center" : "left", tx = ta === "center" ? r.left + r.width / 2 : r.left + pad; g.textAlign = ta;
    if (b.style.display !== "none") { const bs = getComputedStyle(b), br = b.getBoundingClientRect(); g.font = `${bs.fontWeight} ${bs.fontSize} Segoe UI, system-ui`; g.fillStyle = bs.color; g.fillText(b.textContent, tx, br.top + br.height / 2); }
    if (p.style.display !== "none") { const ps = getComputedStyle(p), pr = p.getBoundingClientRect(), lh = parseFloat(ps.lineHeight) || parseFloat(ps.fontSize) * 1.35; g.font = `${ps.fontWeight} ${ps.fontSize} Segoe UI, system-ui`; g.fillStyle = ps.color; let line = "", ly = pr.top + lh / 2; for (const wd of p.textContent.split(/\s+/)) { if (g.measureText(line + " " + wd).width > pr.width + 2 && line) { g.fillText(line, tx, ly); line = wd; ly += lh; } else line = line ? line + " " + wd : wd; } g.fillText(line, tx, ly); }
    g.globalAlpha = 1; g.textAlign = "left";
  }
}
function recFrame() { if (!rec.active) return; compositeFrame(); if (S.t >= rec.take.t1 - 1e-3 || (!S.playing && S.t > rec.take.t0 + .05)) stopTake(); }

/* ---------- several trolleys on one path (scene: path.trolleys, path.headway seconds): copies of the trolley start one headway
   apart on the same timeline; the closest distance between two moving trolleys is tracked to show congestion ---------- */
const fleet = { clones: [], flow: -1, minGap: Infinity, at: null };
const fpos = { x: 0, y: 0, i: 1, u: 0, lift: null, it: null, h: 0, d: 0, v: 0, k: "hold", seg: 0 }, fw = new T.Vector3();
function fleetFrame() {
  const f = MF.D.flows[S.flow], n = f && f.trolleys > 1 ? Math.min(12, f.trolleys) : 1, hw = (f && f.headway) || 30;
  if (fleet.flow !== S.flow || fleet.clones.length !== n - 1) {
    for (const c of fleet.clones) { if (c.parent) c.parent.remove(c); } fleet.clones = []; fleet.flow = S.flow;
    for (let k = 1; k < n; k++) { const c = MF.lot.clone(true); c.name = "MF V7 fleet trolley " + k; MF.scene.add(c); fleet.clones.push(c); }
  }
  fleet.minGap = Infinity; fleet.at = null; if (n < 2) return;
  const pts = [[MF.lot.position.x, MF.lot.position.z, MF.lot.visible]];
  fleet.clones.forEach((c, k) => {
    const t = S.t - (k + 1) * hw, on = t > X.INTRO && t <= X.F().total; c.visible = on && S.R > .5;
    if (!on) { pts.push([0, 0, false]); return; }
    X.lotPos(t, fpos); X.worldFromLot(fpos, S.stack, fw); c.position.copy(fw).setY(fw.y + S.R * .2); c.rotation.y = fpos.h; pts.push([fw.x, fw.z, true]);
  });
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) if (pts[a][2] && pts[b][2]) { const d = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]) * PT_M; if (d < fleet.minGap) { fleet.minGap = d; fleet.at = S.t; } }
}