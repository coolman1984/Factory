/* V7 Studio preload: runs before the project data is handed to the player. If this browser has a saved Studio scene for the
   project (or the file carries a baked one in #mf7-embedded), its nodes, flows, devices and replica edits replace the original
   data before anything is built. The untouched original stays in the file: "Reset to original" just forgets the saved scene. */
(function () {
  "use strict";
  var KEY = function (id) { return "mf7:scene:" + id; };
  function parse(s) { try { var d = JSON.parse(s); return d && d.format === "mf7-scene" ? d : null; } catch (e) { return null; } }
  function readDoc(id) {
    var s = null; try { s = localStorage.getItem(KEY(id)); } catch (e) { s = null; }
    var d = s && parse(s); if (d) return { doc: d, source: "browser" };
    var emb = document.getElementById("mf7-embedded");
    if (emb && emb.textContent.trim()) { try { var all = JSON.parse(emb.textContent); var e = all && all.projects && all.projects[id]; if (e && e.format === "mf7-scene") return { doc: e, source: "file" }; } catch (x) {} }
    return null;
  }
  var KINDS = ["walls", "columns", "racks", "machines", "pallets"];
  // A replica edit: move by (dx, dy) plan units, turn by rot degrees (multiples of 90) about the object's centre, or delete.
  function applyOp(kind, o, op) {
    var dx = op.dx || 0, dy = op.dy || 0, rot = ((op.rot || 0) % 360 + 360) % 360;
    if (kind === "walls") {
      var mx = (o.a[0] + o.b[0]) / 2 + dx, my = (o.a[1] + o.b[1]) / 2 + dy, r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      var turn = function (p) { var x = p[0] + dx - mx, y = p[1] + dy - my; return [mx + x * c - y * s, my + x * s + y * c]; };
      o.a = turn(o.a); o.b = turn(o.b);
    } else if (kind === "columns") { o.p = [o.p[0] + dx, o.p[1] + dy]; }
    else {
      o.x += dx; o.y += dy;
      if (rot === 90 || rot === 270) { var cx = o.x + o.w / 2, cy = o.y + o.h / 2, w = o.w; o.w = o.h; o.h = w; o.x = cx - o.w / 2; o.y = cy - o.h / 2; if (kind === "machines" && o.type === "injection") o.vertical = !o.vertical; }
    }
    if (op.del) o._del = true;
  }
  window.MFV7_LOAD = function (id, p) {
    var R = p.replica || {}, found = null;
    KINDS.forEach(function (k) { (R[k] || []).forEach(function (o, i) { if (o && o._oid == null) o._oid = i; }); });
    try { found = readDoc(id); } catch (e) { found = null; }
    window.MF7 = { id: id, source: found ? found.source : "original", doc: found ? found.doc : null, ops: {}, error: null };
    if (found) {
      var d = found.doc;
      try {
        if (d.nodes && typeof d.nodes === "object") p.data.nodes = d.nodes;
        if (Array.isArray(d.flows) && d.flows.length && d.flows.every(function (f) { return f && Array.isArray(f.steps) && f.steps.length; })) p.data.flows = d.flows;
        if (Array.isArray(d.devices)) p.data.devices = d.devices;
        if (d.title) p.data.slide.title = d.title;
        var ops = d.replica || {};
        Object.keys(ops).forEach(function (tag) {
          var k = tag.split(":")[0], oid = +tag.split(":")[1], arr = R[k]; if (!arr || KINDS.indexOf(k) < 0) return;
          for (var i = 0; i < arr.length; i++) if (arr[i]._oid === oid) { applyOp(k, arr[i], ops[tag]); window.MF7.ops[tag] = ops[tag]; break; }
        });
        KINDS.forEach(function (k) { if (R[k]) R[k] = R[k].filter(function (o) { return !o._del; }); });
      } catch (e) { window.MF7.error = String(e && e.message || e); }
    }
    // The clean data the Studio edits (the player decorates its own copies with runtime fields).
    window.MF7.clean = JSON.parse(JSON.stringify({ nodes: p.data.nodes, flows: p.data.flows, devices: p.data.devices || [], title: p.data.slide && p.data.slide.title }));
    window.MF7.applyOp = applyOp;
  };
})();
