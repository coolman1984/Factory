/* V7 preload: the scene file drives the player. Runs after scene-core.js (window.MFScene) and before the project data picks
   its tab. The scene baked into this HTML (#mf7-embedded) is the default; a scene saved in this browser wins only when it was
   made from that same baked scene (otherwise the file is newer, e.g. an agent rebuilt it; the browser copy is kept and offered). */
(function () {
  "use strict";
  var KEY = function (id) { return "mf7:scene:" + id; };
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
  function baked(id) {
    var el = document.getElementById("mf7-embedded"); if (!el || !el.textContent.trim()) return null;
    try { var all = JSON.parse(el.textContent), s = all && all.projects && all.projects[id]; return s && s.format === "mf-scene" ? s : null; } catch (e) { return null; }
  }
  function stored(id) { try { var o = JSON.parse(localStorage.getItem(KEY(id)) || "null"); return o && o.scene && o.scene.format === "mf-scene" ? o : null; } catch (e) { return null; } }
  /* The Blender floor light (shadows baked into the floor texture) was baked from the V4 layout. Where a layout object was
     removed or moved since (V6 room removal: MF7_LIGHT_ERASE from the build; scene layoutEdits: here), its old shadow is still in
     the texture. clean() repaints those areas from the surrounding floor light (row and column interpolation across the hole). */
  var ERASE_MARGIN = 9;   // frame units (2.7 m): the baked shadows are soft and spread past the object
  function rectOfLayout(kind, o) {
    if (kind === "walls") return [Math.min(o.a[0], o.b[0]) - .75, Math.min(o.a[1], o.b[1]) - .75, Math.max(o.a[0], o.b[0]) + .75, Math.max(o.a[1], o.b[1]) + .75];
    if (kind === "columns") return [o.p[0] - 1.45, o.p[1] - 1.45, o.p[0] + 1.45, o.p[1] + 1.45];
    return [o.x, o.y, o.x + o.w, o.y + o.h];
  }
  function eraseRects(id, scene, baseReplica) {
    var out = {}, add = function (plate, r) { (out[plate] || (out[plate] = [])).push(r); };
    var built = (window.MF7_LIGHT_ERASE || {})[id] || {}; Object.keys(built).forEach(function (pl) { built[pl].forEach(function (r) { add(pl, r); }); });
    var names = { wall: "walls", column: "columns", rack: "racks", machine: "machines", pallet: "pallets" };
    (scene.layoutEdits || []).forEach(function (e) {
      if (!e.delete && !e.move && !e.turn) return; var m = /^([a-z]+):(\d+)$/.exec(String(e.target || "")), k = m && names[m[1]]; if (!k) return;
      var list = baseReplica[k] || []; for (var i = 0; i < list.length; i++) if ((list[i]._oid != null ? list[i]._oid : i) === +m[2]) { add(list[i].plate, rectOfLayout(k, list[i])); break; }
    });
    return out;
  }
  /* The floor light of a plate is baked for the floor extent it had in V4 (MF7_LIGHT_BOX). V6 extended INJ 2's 2nd floor with
     the Press tab's 2nd-floor picture, so the bake was stretched over the larger floor (black bands, image 28). compose() draws the
     own bake in its true place and the source tab's bake (shifted like the picture) under the added area. Async: returns a Promise. */
  function loadImg(src) { return new Promise(function (ok, no) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = no; i.src = src; }); }
  window.MF7_CLEAN_LIGHT = function (tex, plate, box) {
    var M = window.MF7, rects = (M && M.lightErase && M.lightErase[plate]) || [], lb = M && M.lightBox && M.lightBox[plate];
    var img = tex.image, W0 = img && (img.naturalWidth || img.width), H0 = img && (img.naturalHeight || img.height); if (!W0 || !H0) return tex;
    var B = [box[0], box[1], box[0] + box[2], box[1] + box[3]], own = lb ? lb.box : B, same = Math.abs(own[0] - B[0]) + Math.abs(own[1] - B[1]) + Math.abs(own[2] - B[2]) + Math.abs(own[3] - B[3]) < .01;
    if (same && !rects.length) return tex;
    var s = W0 / (own[2] - own[0]), W = same ? W0 : Math.min(4096, Math.round((B[2] - B[0]) * s)), H = same ? H0 : Math.min(4096, Math.round((B[3] - B[1]) * s)), sx = W / (B[2] - B[0]), sy = H / (B[3] - B[1]);
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H; var g = cv.getContext("2d");
    var place = function (im, r) { g.drawImage(im, (r[0] - B[0]) * sx, (r[1] - B[1]) * sy, (r[2] - r[0]) * sx, (r[3] - r[1]) * sy); };
    var exts = same ? [] : (lb.ext || []);
    return Promise.all(exts.map(function (e) { return e.src ? loadImg(e.src).catch(function () { return null; }) : null; })).then(function (ims) {
      if (!same) { var c0 = document.createElement("canvas"); c0.width = 64; c0.height = 64; var g0 = c0.getContext("2d"); g0.drawImage(img, 0, 0, 64, 64); var d0 = g0.getImageData(0, 0, 64, 64).data, px0 = []; for (var q = 0; q < 4096; q++) px0.push([d0[q * 4], d0[q * 4 + 1], d0[q * 4 + 2]]); px0.sort(function (a, b) { return a[0] + a[1] + a[2] - b[0] - b[1] - b[2]; }); var lit = px0[Math.floor(px0.length * .9)]; g.fillStyle = "rgb(" + lit.join(",") + ")"; g.fillRect(0, 0, W, H); }   // the open, lit floor value
      ims.forEach(function (im, i) { if (im) place(im, exts[i].box); });
      place(img, own); M.lightComposed = (M.lightComposed || 0) + (same ? 0 : 1);
      return cleanCanvas(cv, g, W, H, rects, box, tex);
    });
  };
  function cleanCanvas(cv, g, W, H, rects, box, tex) {
    if (!rects.length) { var t0 = new THREE.CanvasTexture(cv); t0.flipY = tex.flipY; t0.wrapS = tex.wrapS; t0.wrapT = tex.wrapT; tex.dispose(); return t0; }
    var M = window.MF7;
    var data = g.getImageData(0, 0, W, H), px = data.data, mask = new Uint8Array(W * H), any = false;
    rects.forEach(function (r) {   // plan rect -> pixels: u = (x - minX) / w, v = (y - minY) / h from the top of the image
      var x0 = Math.max(0, Math.floor((r[0] - ERASE_MARGIN - box[0]) / box[2] * W)), x1 = Math.min(W - 1, Math.ceil((r[2] + ERASE_MARGIN - box[0]) / box[2] * W));
      var y0 = Math.max(0, Math.floor((r[1] - ERASE_MARGIN - box[1]) / box[3] * H)), y1 = Math.min(H - 1, Math.ceil((r[3] + ERASE_MARGIN - box[1]) / box[3] * H));
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) { mask[y * W + x] = 1; any = true; }
    });
    if (!any) return cleanCanvas(cv, g, W, H, [], box, tex);
    var out = new Uint8ClampedArray(px);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var k = y * W + x; if (!mask[k]) continue;
      var l = x, r2 = x, u = y, d = y; while (l > 0 && mask[y * W + l]) l--; while (r2 < W - 1 && mask[y * W + r2]) r2++; while (u > 0 && mask[u * W + x]) u--; while (d < H - 1 && mask[d * W + x]) d++;
      var th = (x - l) / Math.max(1, r2 - l), tv = (y - u) / Math.max(1, d - u), a = (y * W + l) * 4, b = (y * W + r2) * 4, c = (u * W + x) * 4, e = (d * W + x) * 4;
      // weight each direction by the inverse span, so the closer borders dominate
      var wh = 1 / Math.max(1, r2 - l), wv = 1 / Math.max(1, d - u), s = wh + wv;
      for (var ch = 0; ch < 3; ch++) out[k * 4 + ch] = ((px[a + ch] * (1 - th) + px[b + ch] * th) * wh + (px[c + ch] * (1 - tv) + px[e + ch] * tv) * wv) / s;
      out[k * 4 + 3] = 255;
    }
    // soften the seam: box-blur the filled area plus a ring around it (twice, separable), so no edge of the repair shows
    var R = Math.max(4, Math.round(W / 160)), ring = new Uint8Array(W * H);
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) if (mask[yy * W + xx]) for (var dy = -R; dy <= R; dy += R) for (var dx = -R; dx <= R; dx += R) { var qx = xx + dx, qy = yy + dy; if (qx >= 0 && qy >= 0 && qx < W && qy < H) ring[qy * W + qx] = 1; }
    var tmp = new Float32Array(W * H * 3);
    for (var pass = 0; pass < 2; pass++) {
      for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) { var k2 = y2 * W + x2; if (!ring[k2]) continue; for (var c2 = 0; c2 < 3; c2++) { var sum = 0, n = 0; for (var o = -R; o <= R; o++) { var xo = x2 + o; if (xo < 0 || xo >= W) continue; sum += out[(y2 * W + xo) * 4 + c2]; n++; } tmp[k2 * 3 + c2] = sum / n; } }
      for (y2 = 0; y2 < H; y2++) for (x2 = 0; x2 < W; x2++) { k2 = y2 * W + x2; if (!ring[k2]) continue; for (c2 = 0; c2 < 3; c2++) { sum = 0; n = 0; for (o = -R; o <= R; o++) { var yo = y2 + o; if (yo < 0 || yo >= H) continue; var kk = yo * W + x2; sum += ring[kk] ? tmp[kk * 3 + c2] : out[kk * 4 + c2]; n++; } out[k2 * 4 + c2] = sum / n; } }
    }
    data.data.set(out); g.putImageData(data, 0, 0);
    var t = new THREE.CanvasTexture(cv); t.flipY = tex.flipY; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; tex.dispose(); M.lightCleaned = (M.lightCleaned || 0) + rects.length; return t;
  };
  window.MFV7_LOAD = function (id, p, all) {
    var SC = window.MFScene, out = window.MF7 = { id: id, source: "built-in", scene: null, baseHash: "", stale: null, issues: [], error: null, baseReplica: JSON.parse(JSON.stringify(p.replica)) };
    if (!SC) { out.error = "scene core missing"; return; }
    var base = baked(id) || SC.fromInternal(id, p.data), baseHash = hash(JSON.stringify(base)), saved = stored(id), scene = base;
    if (saved && saved.baseHash === baseHash) { scene = saved.scene; out.source = "browser"; out.fileName = saved.fileName || ""; }
    else if (saved) out.stale = saved;
    out.lightBox = {}; var LB = (window.MF7_LIGHT_BOX || {})[id] || {}; Object.keys(LB).forEach(function (pl) { var e = LB[pl]; out.lightBox[pl] = { box: e.box, ext: (e.ext || []).map(function (x) { var src = all && all[x.tab] && all[x.tab].light && all[x.tab].light[x.plate]; return { box: x.box, src: src || null }; }) }; });
    out.baseHash = baseHash; out.base = base; try { out.lightErase = eraseRects(id, scene, out.baseReplica); } catch (e) { out.lightErase = {}; }
    try {
      var res = SC.toInternal(JSON.parse(JSON.stringify(scene)), SC.layoutOf(p));
      p.data.nodes = res.data.nodes; p.data.flows = res.data.flows; p.data.devices = res.data.devices; if (res.data.title && p.data.slide) p.data.slide.title = res.data.title;
      p.data.orderConfirmed = true; out.issues = res.issues; out.scene = scene;
    } catch (e) {
      out.error = "The scene could not be loaded (" + (e && e.message || e) + "); the built-in scene is shown.";
      if (scene !== base) { var r2 = SC.toInternal(JSON.parse(JSON.stringify(base)), SC.layoutOf(p)); p.data.nodes = r2.data.nodes; p.data.flows = r2.data.flows; p.data.devices = r2.data.devices; out.scene = base; out.source = "built-in"; }
    }
  };
})();
