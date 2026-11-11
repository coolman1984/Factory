/* Material Flow scene core (V7). Plain script: in the player it defines window.MFScene; in Node it is loaded with vm
   (tools/mf-validate.mjs) and exports the same object. No 3D, no DOM: data only.
   A scene file (format "mf-scene") is the complete description of a tab: stops, devices, objects, layout edits, paths with steps,
   director shots, captions, takes, viewpoints. Units: metres, seconds, degrees. Coordinates: plan metres, x right, y down, the
   project frame of the built-in layout (1 frame unit = 0.3 m). Heading: 0 = up on the plan (north), clockwise.
   toInternal(scene, layout) -> the player's internal data (frame units); fromInternal(...) -> a scene; validate(...) -> issues. */
(function (root) {
  "use strict";
  var U = 0.3;                                          // metres per frame unit
  var FORMAT = "mf-scene", VERSION = 1;
  var DIMS = { K: 2.4, M: 1 / U, pc: { depth: 0.7, width: 1.45 }, gate: { gap: 2.2 / U, post: 0.16 / U }, scanner: { width: 0.36 }, trolley: { halfW: 3.27 / 2, halfL: 5.79 / 2, h: 3.98 } };
  var LAYOUT_KINDS = ["walls", "columns", "racks", "machines", "pallets"];
  var LAYOUT_NAME = { walls: "wall", columns: "column", racks: "rack", machines: "machine", pallets: "pallet" };
  var KIND_OF_NAME = { wall: "walls", column: "columns", rack: "racks", machine: "machines", pallet: "pallets" };
  var MODES_IN = { push: "flow", agv: "auto", manual: "manual" }, MODES_OUT = { flow: "push", auto: "agv", manual: "manual" };
  var SYMBOLS = ["result", "mapping", "quality", "area", "dest", "scan", "lift", "wip", "obama"];
  var PC_KINDS = ["result", "mapping", "quality"];
  var OBJECT_TYPES = ["crate", "pallet", "rack", "column", "wall", "fence", "cone", "floor-arrow", "floor-zone", "sign", "trolley"];
  var DEFAULT_SPEED = 4, MAX_GATES = 64;

  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  var toM = function (u) { return r6(u * U); }, toU = function (m) { return m / U; };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function slug(s, used) {
    var b = String(s || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "item", id = b, i = 2;
    while (used[id]) id = b + "-" + i++;
    used[id] = 1; return id;
  }
  var HEADING_OF_FACE = { n: 0, e: 90, s: 180, w: 270 }, FACE_OF_HEADING = { 0: "n", 90: "e", 180: "s", 270: "w" };
  var norm360 = function (h) { h = h % 360; return h < 0 ? h + 360 : h; };
  // the floor (plate key) of a frame point: the zone that contains it, else the nearest zone
  function floorOfU(layout, x, y) {
    var best = null, bd = Infinity, keys = Object.keys(layout.plates);
    for (var i = 0; i < keys.length; i++) { var z = zoneU(layout, keys[i]), dx = Math.max(z[0] - x, 0, x - z[2]), dy = Math.max(z[1] - y, 0, y - z[3]), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = keys[i]; } }
    return best;
  }
  function zoneU(layout, k) { var P = layout.plates[k]; if (Array.isArray(P.zone)) return P.zone; var b = P.box || [0, 0, 960, 540]; return [b[0], b[1], b[0] + b[2], b[1] + b[3]]; }
  function layoutOf(p) { return { project: p.data && p.data.id, plates: p.data.plates, elevators: p.data.elevators || (p.data.elevator ? [p.data.elevator] : []), replica: p.replica }; }

  /* ---------------- internal -> scene ---------------- */
  function fromInternal(project, data, opts) {
    opts = opts || {};
    var usedStop = {}, stopId = {}, stops = [];
    Object.keys(data.nodes).forEach(function (k) {
      var n = data.nodes[k], id = slug(n.text || n.kind || "stop", usedStop); stopId[n.id] = id;
      var s = { id: id, name: n.text || "", floor: n.plate, x: toM(n.x), y: toM(n.y), symbol: n.kind, color: n.fill };
      stops.push(s);
    });
    var usedDev = {}, devices = (data.devices || []).map(function (d) {
      var o;
      if (d.type === "pc") {
        o = { id: slug("pc " + (d.label || ""), usedDev), type: "pc", kind: d.kind, floor: d.plate || "1F", x: toM(d.x), y: toM(d.y), heading: d.yawDeg != null ? norm360(180 - d.yawDeg) : HEADING_OF_FACE[d.face || "e"], size: d.k || DIMS.K, label: d.label || "" };
        if (d.node != null && stopId[d.node]) o.serves = stopId[d.node];
        if (d.done) o.done = d.done; if (d.fill) o.color = d.fill;
      } else if (d.type === "rfid-auto") {
        o = { id: slug("gate " + (d.label || ""), usedDev), type: "rfid-gate", floor: d.plate || "1F", x: toM(d.x), y: toM(d.y), lane: d.axis === "x" ? "east-west" : "north-south", label: d.label || "" };
      } else if (d.type === "rfid-manual") {
        var lane = d.lane || [d.x, d.y];
        o = { id: slug("scanner " + (d.label || ""), usedDev), type: "scanner", floor: d.plate || "1F", at: [toM(lane[0]), toM(lane[1])], stand: [toM(d.x), toM(d.y)], size: d.k || DIMS.K, label: d.label || "", stops: d.routeBound === true };
        if (d.node != null && stopId[d.node]) o.stop = stopId[d.node];
        if (d.done) o.done = d.done;
      } else return null;
      return o;
    }).filter(Boolean);
    var paths = data.flows.map(function (f) {
      var usedStep = {};
      var po = { id: f.id, name: f.name, color: f.color || "#7030A0" }; if (f.trolleys > 1) { po.trolleys = f.trolleys; po.headway = f.headway || 30; }
      return Object.assign(po, { steps: f.steps.map(function (s, i) {
        var o = { id: "s" + (i + 1), stop: stopId[s.node], title: s.title || "" };
        usedStep[o.id] = 1;
        if (s.what) o.text = s.what;
        o.mode = MODES_OUT[s.mode] || "push";
        if (s.dwell != null) o.wait = s.dwell;
        if (s.speed != null) o.speed = s.speed;
        if (s.dist != null || s.view) { o.camera = {}; if (s.dist != null) o.camera.distance = toM(s.dist); if (s.view) o.camera.view = s.view; }
        if (s.lift || s.path === "lift") o.route = { type: "elevator", elevator: s.elevator };
        else if (Array.isArray(s.path)) o.route = { type: "points", points: s.path.map(function (p) { return [toM(p[0]), toM(p[1])]; }) };
        else o.route = { type: "stay" };
        return o;
      }) });
    });
    return { format: FORMAT, version: VERSION, project: project, title: data.title || (data.slide && data.slide.title) || project, layout: project,
      stops: stops, devices: devices, objects: [], layoutEdits: [], paths: paths, director: {}, viewpoints: [] , notes: opts.notes || "" };
  }

  /* ---------------- scene -> internal ---------------- */
  // Applies layout edits to layout.replica in place (call once per page load on a fresh replica). Returns
  // { data: { nodes, flows, devices, title }, stopIds: { sceneId: internalId }, issues: [] }.
  function toInternal(scene, layout, opts) {
    opts = opts || {}; var issues = [];
    var nodes = {}, idOf = {}, next = 1;
    (scene.stops || []).forEach(function (s) {
      var id = next++; idOf[s.id] = id;
      nodes[id] = { id: id, x: toU(s.x), y: toU(s.y), plate: s.floor, kind: s.symbol || "area", mode: "manual", fill: s.color || "#156082", text: s.name || s.id, target: [toU(s.x), toU(s.y)] };
    });
    if (opts.applyLayout !== false) applyLayoutEdits(scene.layoutEdits || [], layout.replica, issues);
    var sym = 1, devices = (scene.devices || []).map(function (d) {
      var o;
      if (d.type === "pc") {
        var h = norm360(d.heading != null ? d.heading : 90);
        o = { type: "pc", kind: d.kind || "result", x: toU(d.x), y: toU(d.y), k: d.size || DIMS.K, plate: d.floor, fill: d.color || "#7030A0", label: d.label || "PC", sym: sym++ };
        if (FACE_OF_HEADING[h] != null) o.face = FACE_OF_HEADING[h]; else { o.yawDeg = 180 - h; o.face = FACE_OF_HEADING[Math.round(h / 90) * 90 % 360]; }
        if (d.serves != null && idOf[d.serves] != null) o.node = idOf[d.serves];
        if (d.done) o.done = d.done;
      } else if (d.type === "rfid-gate") {
        o = { type: "rfid-auto", x: toU(d.x), y: toU(d.y), axis: d.lane === "east-west" ? "x" : "y", plate: d.floor, label: d.label || "Auto RFID gate", sym: sym++ };
      } else if (d.type === "scanner") {
        var at = d.at || [d.x, d.y], stand = d.stand || [at[0] - 0.6, at[1]];
        o = { type: "rfid-manual", x: toU(stand[0]), y: toU(stand[1]), lane: [toU(at[0]), toU(at[1])], routeBound: d.stops === true, k: d.size || DIMS.K, plate: d.floor, label: d.label || "Manual RFID scan", sym: sym++ };
        if (d.stop != null && idOf[d.stop] != null) o.node = idOf[d.stop];
        if (d.done) o.done = d.done;
      } else return null;
      o.sceneId = d.id; return o;
    }).filter(Boolean);
    var router = opts.router || makeRouter(layout, devices);
    var flows = (scene.paths || []).map(function (p) {
      var prevEnd = null, steps = (p.steps || []).map(function (s) {
        var n = nodes[idOf[s.stop]], o = { node: idOf[s.stop], title: s.title || "", mode: MODES_IN[s.mode] || "flow", view: (s.camera && s.camera.view) || "3d", dist: s.camera && s.camera.distance != null ? toU(s.camera.distance) : 300, path: null, what: s.text || "", sceneId: s.id };
        if (s.wait != null) o.dwell = s.wait;
        if (s.speed != null && s.speed !== DEFAULT_SPEED) o.speed = s.speed;
        var r = s.route || { type: "stay" };
        if (r.type === "elevator") { o.path = "lift"; o.lift = true; o.elevator = r.elevator; var e = elevatorOf(layout, r.elevator); prevEnd = e ? e.high.slice() : prevEnd; return o; }
        if (r.type === "points") o.path = (r.points || []).map(function (q) { return [toU(q[0]), toU(q[1])]; });
        else if (r.type === "auto" && n && prevEnd) {
          var routed = router.route(prevEnd, [n.x, n.y], n.plate);
          if (routed) o.path = routed; else { issues.push({ level: "error", where: "paths[" + p.id + "].steps[" + s.id + "]", msg: "auto route found no clear trolley path to stop " + s.stop }); o.path = [prevEnd.slice(), [n.x, n.y]]; }
        }
        if (Array.isArray(o.path) && o.path.length < 2) o.path = null;
        prevEnd = Array.isArray(o.path) ? o.path[o.path.length - 1].slice() : n ? [n.x, n.y] : prevEnd;
        return o;
      });
      var fo = { id: p.id, name: p.name || p.id, color: p.color || "#7030A0", steps: steps }; if (p.trolleys > 1) { fo.trolleys = Math.min(12, Math.round(p.trolleys)); fo.headway = p.headway > 0 ? p.headway : 30; } return fo;
    });
    return { data: { nodes: nodes, flows: flows, devices: devices, title: scene.title }, stopIds: idOf, issues: issues };
  }
  function elevatorOf(layout, label) { var E = layout.elevators || []; for (var i = 0; i < E.length; i++) if (E[i].label === label) return E[i]; return null; }
  // stable ids of built-in layout objects: "<name>:<index in the original list>" (rack:12). _oid keeps them after deletions.
  function stampLayout(replica) { LAYOUT_KINDS.forEach(function (k) { (replica[k] || []).forEach(function (o, i) { if (o && o._oid == null) o._oid = i; }); }); }
  function findLayoutObject(replica, target) {
    var m = /^([a-z]+):(\d+)$/.exec(String(target || "")); if (!m || !KIND_OF_NAME[m[1]]) return null;
    var k = KIND_OF_NAME[m[1]], arr = replica[k] || [], oid = +m[2];
    for (var i = 0; i < arr.length; i++) if (arr[i]._oid === oid) return { kind: k, obj: arr[i], index: i };
    return null;
  }
  function applyLayoutEdits(edits, replica, issues) {
    stampLayout(replica);
    edits.forEach(function (e, i) {
      var f = findLayoutObject(replica, e.target); if (!f) { issues && issues.push({ level: "error", where: "layoutEdits[" + i + "]", msg: "unknown layout object " + JSON.stringify(e.target) }); return; }
      var o = f.obj, dx = e.move ? toU(e.move[0]) : 0, dy = e.move ? toU(e.move[1]) : 0, rot = norm360(e.turn || 0);
      if (f.kind === "walls") { var mx = (o.a[0] + o.b[0]) / 2 + dx, my = (o.a[1] + o.b[1]) / 2 + dy, r = rot * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r); var t = function (p) { var x = p[0] + dx - mx, y = p[1] + dy - my; return [mx + x * c - y * sn, my + x * sn + y * c]; }; o.a = t(o.a); o.b = t(o.b); }
      else if (f.kind === "columns") o.p = [o.p[0] + dx, o.p[1] + dy];
      else { o.x += dx; o.y += dy; if (rot === 90 || rot === 270) { var cx = o.x + o.w / 2, cy = o.y + o.h / 2, w = o.w; o.w = o.h; o.h = w; o.x = cx - o.w / 2; o.y = cy - o.h / 2; if (f.kind === "machines" && o.type === "injection") o.vertical = !o.vertical; } }
      if (e.door) {   // cut a doorway into a straight wall: door = [from, to] in metres along the wall
        if (f.kind !== "walls" || !Array.isArray(e.door) || e.door.length !== 2) { issues && issues.push({ level: "error", where: "layoutEdits[" + i + "].door", msg: "door needs a wall target and [from, to] in metres along the wall" }); return; }
        var ax = Math.abs(o.a[1] - o.b[1]) < Math.abs(o.a[0] - o.b[0]) ? 0 : 1, lo = Math.min(o.a[ax], o.b[ax]), hi = Math.max(o.a[ax], o.b[ax]), d0 = toU(Math.min(e.door[0], e.door[1])), d1 = toU(Math.max(e.door[0], e.door[1]));
        if (d1 <= lo || d0 >= hi) { issues && issues.push({ level: "error", where: "layoutEdits[" + i + "].door", msg: "the door [" + e.door + "] is not on " + e.target + " (it runs from " + toM(lo) + " to " + toM(hi) + " m)" }); return; }
        var mk = function (s0, s1, tag) { var c = JSON.parse(JSON.stringify(o)); c.a[ax] = s0; c.b[ax] = s1; c._oid = o._oid + tag; return c; };
        if (d0 > lo + 0.01) replica.walls.push(mk(lo, d0, "a")); if (d1 < hi - 0.01) replica.walls.push(mk(d1, hi, "b")); o._del = true;
      }
      if (e.delete) o._del = true;
    });
    LAYOUT_KINDS.forEach(function (k) { if (replica[k]) replica[k] = replica[k].filter(function (o) { return !o._del; }); });
  }

  /* ---------------- solids, router (grid A*, same as V6 make.mjs) ---------------- */
  function footprintsU(d) {
    var k = d.k || DIMS.K, M = DIMS.M;
    if (d.type === "pc") {
      var yaw = d.yawDeg != null ? d.yawDeg : { e: 90, w: -90, n: 180, s: 0 }[d.face || "e"], horiz = Math.abs(Math.sin(yaw * Math.PI / 180)) > 0.7;
      var hx = (horiz ? DIMS.pc.depth : DIMS.pc.width) * k * M / 2, hy = (horiz ? DIMS.pc.width : DIMS.pc.depth) * k * M / 2;
      return [[d.x - hx, d.y - hy, d.x + hx, d.y + hy]];
    }
    if (d.type === "rfid-auto") { var g = DIMS.gate.gap, p = DIMS.gate.post / 2 + 0.1; return d.axis === "y" ? [[d.x - g - p, d.y - p, d.x - g + p, d.y + p], [d.x + g - p, d.y - p, d.x + g + p, d.y + p]] : [[d.x - p, d.y - g - p, d.x + p, d.y - g + p], [d.x - p, d.y + g - p, d.x + p, d.y + g + p]]; }
    if (d.type === "rfid-manual") { var hh = DIMS.scanner.width * k * M / 2; return [[d.x - hh, d.y - hh, d.x + hh, d.y + hh]]; }
    return [];
  }
  function solidsU(layout, plate, devices) {
    var R = layout.replica, out = [];
    (R.walls || []).forEach(function (w) {
      if (w.plate !== plate) return; var ax = w.a[0], ay = w.a[1], bx = w.b[0], by = w.b[1], t = 0.75;
      if (Math.abs(ax - bx) < 1e-6 || Math.abs(ay - by) < 1e-6) out.push({ r: [Math.min(ax, bx) - t, Math.min(ay, by) - t, Math.max(ax, bx) + t, Math.max(ay, by) + t], what: "wall:" + w._oid });
      else { var n = Math.ceil(Math.hypot(bx - ax, by - ay)); for (var i = 0; i <= n; i++) { var x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; out.push({ r: [x - t, y - t, x + t, y + t], what: "wall:" + w._oid }); } }
    });
    (R.columns || []).forEach(function (q) { if (q.plate === plate) out.push({ r: [q.p[0] - 1.45, q.p[1] - 1.45, q.p[0] + 1.45, q.p[1] + 1.45], what: "column:" + q._oid }); });
    ["racks", "machines", "pallets"].forEach(function (k) { (R[k] || []).forEach(function (o) { if (o.plate === plate) out.push({ r: [o.x, o.y, o.x + o.w, o.y + o.h], what: LAYOUT_NAME[k] + ":" + o._oid }); }); });
    (devices || []).forEach(function (d) { if ((d.plate || "1F") === plate) footprintsU(d).forEach(function (r) { out.push({ r: r, what: (d.sceneId ? "device " + d.sceneId : d.label || d.type), device: true }); }); });
    var C = 16, hash = {};
    out.forEach(function (s, i) { for (var a = Math.floor(s.r[0] / C); a <= Math.floor(s.r[2] / C); a++) for (var b = Math.floor(s.r[1] / C); b <= Math.floor(s.r[3] / C); b++) (hash[a + ":" + b] || (hash[a + ":" + b] = [])).push(i); });
    return { list: out, near: function (x, y, rad) { var seen = {}, res = []; for (var a = Math.floor((x - rad) / C); a <= Math.floor((x + rad) / C); a++) for (var b = Math.floor((y - rad) / C); b <= Math.floor((y + rad) / C); b++) { var l = hash[a + ":" + b]; if (l) for (var j = 0; j < l.length; j++) if (!seen[l[j]]) { seen[l[j]] = 1; res.push(out[l[j]]); } } return res; } };
  }
  var TR = DIMS.trolley, STRAIGHT = TR.halfW + 0.9, TURN = Math.hypot(TR.halfW, TR.halfL) + 0.45;
  function makeRouter(layout, devices) {
    var grids = {};
    function grid(plate) {
      if (grids[plate]) return grids[plate];
      var zone = zoneU(layout, plate), solids = solidsU(layout, plate, devices).list;
      var x0 = Math.floor(zone[0]) - 2, y0 = Math.floor(zone[1]) - 2, W = Math.ceil(zone[2]) - x0 + 4, H = Math.ceil(zone[3]) - y0 + 4, occ = new Uint8Array(W * H);
      solids.forEach(function (s) { var r = s.r, i0 = Math.max(0, Math.floor(r[0] - x0)), i1 = Math.min(W - 1, Math.ceil(r[2] - x0) - 1), j0 = Math.max(0, Math.floor(r[1] - y0)), j1 = Math.min(H - 1, Math.ceil(r[3] - y0) - 1); for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) occ[j * W + i] = 1; });
      var INF = 1e9, d = new Float32Array(W * H), k;
      for (k = 0; k < W * H; k++) d[k] = occ[k] ? 0 : INF;
      var at = function (i, j) { return i < 0 || j < 0 || i >= W || j >= H ? 0 : d[j * W + i]; };
      for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) { k = j * W + i; if (!d[k]) continue; d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414); }
      for (j = H - 1; j >= 0; j--) for (i = W - 1; i >= 0; i--) { k = j * W + i; if (!d[k]) continue; d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414); }
      for (k = 0; k < W * H; k++) d[k] = Math.max(0, d[k] - 0.5);
      return (grids[plate] = { x0: x0, y0: y0, W: W, H: H, d: d });
    }
    function cellOf(g, x, y) { var i = Math.floor(x - g.x0), j = Math.floor(y - g.y0); return i < 0 || j < 0 || i >= g.W || j >= g.H ? -1 : j * g.W + i; }
    function snap(g, x, y, need) {
      var ci = Math.floor(x - g.x0), cj = Math.floor(y - g.y0);
      for (var r = 0; r < 80; r++) { var best = null, bd = Infinity; for (var j = cj - r; j <= cj + r; j++) for (var i = ci - r; i <= ci + r; i++) { if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= g.W || j >= g.H || g.d[j * g.W + i] < need) continue; var cx = g.x0 + i + 0.5, cy = g.y0 + j + 0.5, dd = (cx - x) * (cx - x) + (cy - y) * (cy - y); if (dd < bd) { bd = dd; best = [cx, cy]; } } if (best) return best; }
      return null;
    }
    function astar(g, a, b) {
      var s = cellOf(g, a[0], a[1]), t = cellOf(g, b[0], b[1]); if (s < 0 || t < 0) return null;
      var DD = [[1, 0], [0, 1], [-1, 0], [0, -1]], N = g.W * g.H, cost = new Float32Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1), ti = t % g.W, tj = (t / g.W) | 0, heap = [];
      var push = function (f, s2) { heap.push([f, s2]); var i = heap.length - 1; while (i) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; var x = heap[p]; heap[p] = heap[i]; heap[i] = x; i = p; } };
      var pop = function () { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; var x = heap[m]; heap[m] = heap[i]; heap[i] = x; i = m; } } return top; };
      var h = function (k) { return Math.abs(k % g.W - ti) + Math.abs(((k / g.W) | 0) - tj); };
      for (var dir = 0; dir < 4; dir++) { cost[s * 4 + dir] = 0; push(h(s), s * 4 + dir); }
      var goal = -1;
      while (heap.length) {
        var e = pop(), st = e[1], k = st >> 2, dr = st & 3, c = cost[st]; if (e[0] > c + h(k) + 1e-3) continue; if (k === t) { goal = st; break; }
        var i = k % g.W, j = (k / g.W) | 0;
        for (var nd = 0; nd < 4; nd++) {
          if (nd === ((dr + 2) & 3)) continue; var turn = nd !== dr; if (turn && g.d[k] < TURN && k !== s) continue;
          var ii = i + DD[nd][0], jj = j + DD[nd][1]; if (ii < 0 || jj < 0 || ii >= g.W || jj >= g.H) continue;
          var kk = jj * g.W + ii; if (g.d[kk] < STRAIGHT && kk !== t) continue;
          var nc = c + 1 + 5 / Math.max(1, g.d[kk]) + (turn ? 14 : 0), ns = kk * 4 + nd;
          if (nc < cost[ns]) { cost[ns] = nc; prev[ns] = st; push(nc + h(kk), ns); }
        }
      }
      if (goal < 0) return null;
      var cells = []; for (var q = goal; q >= 0; q = prev[q]) cells.push(q >> 2); cells.reverse();
      return simplify(cells.map(function (k2) { return [g.x0 + k2 % g.W + 0.5, g.y0 + ((k2 / g.W) | 0) + 0.5]; }));
    }
    function elbow(a, b, hFirst) { return Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9 ? [a, b] : hFirst ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b]; }
    return { route: function (a, b, plate) {
      var g = grid(plate), sa = snap(g, a[0], a[1], STRAIGHT + 0.2), sb = snap(g, b[0], b[1], STRAIGHT + 0.2); if (!sa || !sb) return null;
      var mid = astar(g, sa, sb); if (!mid) return null;
      var first = mid.length > 1 && Math.abs(mid[1][1] - mid[0][1]) < 1e-9, last = mid.length > 1 && Math.abs(mid[mid.length - 1][1] - mid[mid.length - 2][1]) < 1e-9;
      return simplify(elbow(a.slice(), mid[0], !first).concat(mid.slice(1, -1), elbow(mid[mid.length - 1], b.slice(), last)));
    } };
  }
  function simplify(pts) {
    var out = [];
    pts.forEach(function (p) {
      var q = [+p[0], +p[1]], n = out.length;
      if (n && Math.hypot(q[0] - out[n - 1][0], q[1] - out[n - 1][1]) < 1e-9) return;
      if (n >= 2) { var a = out[n - 2], b = out[n - 1]; if (Math.abs((b[0] - a[0]) * (q[1] - b[1]) - (b[1] - a[1]) * (q[0] - b[0])) < 1e-9 && (b[0] - a[0]) * (q[0] - b[0]) + (b[1] - a[1]) * (q[1] - b[1]) >= 0) { out[n - 1] = q; return; } }
      out.push(q);
    });
    return out;
  }

  /* ---------------- validation ---------------- */
  // gap (frame units) between the trolley footprint at (cx, cy, heading h) and a rectangle; < 0 = overlap
  function gap(cx, cy, h, r) {
    var ux = Math.sin(h), uy = Math.cos(h), vx = Math.cos(h), vy = -Math.sin(h), hl = TR.halfL, hw = TR.halfW;
    var cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(function (q) { return [cx + ux * q[0] * hl + vx * q[1] * hw, cy + uy * q[0] * hl + vy * q[1] * hw]; });
    var bx = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], best = -Infinity;
    [[1, 0], [0, 1], [ux, uy], [vx, vy]].forEach(function (ax) {
      var a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      cs.forEach(function (p) { var d = p[0] * ax[0] + p[1] * ax[1]; a0 = Math.min(a0, d); a1 = Math.max(a1, d); });
      bx.forEach(function (p) { var d = p[0] * ax[0] + p[1] * ax[1]; b0 = Math.min(b0, d); b1 = Math.max(b1, d); });
      best = Math.max(best, b0 - a1, a0 - b1);
    });
    return best;
  }
  var CLEAR_ERROR = 0.09, CLEAR_WARN = 0.15;            // metres between the trolley and any solid
  /* validate(scene, layout) -> { errors: [{where, msg}], warnings: [...], stats }. layout = a fresh built-in layout
     ({ plates, elevators, replica }); its replica is copied, the layout edits are applied to the copy. */
  function validate(scene, layoutIn) {
    var errors = [], warnings = [], E = function (w, m) { errors.push({ where: w, msg: m }); }, Wn = function (w, m) { warnings.push({ where: w, msg: m }); };
    var layout = { plates: layoutIn.plates, elevators: layoutIn.elevators || [], replica: clone(layoutIn.replica) };
    if (!scene || typeof scene !== "object") { E("scene", "not a JSON object"); return { errors: errors, warnings: warnings }; }
    if (scene.format !== FORMAT) E("format", 'must be "' + FORMAT + '"');
    if (scene.version !== VERSION) E("version", "must be " + VERSION);
    if (layoutIn.project && scene.project !== layoutIn.project) E("project", "is " + JSON.stringify(scene.project) + " but this layout is " + JSON.stringify(layoutIn.project));
    var floors = Object.keys(layout.plates), isNum = function (v) { return typeof v === "number" && isFinite(v); }, isColor = function (c) { return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c); };
    var inFloor = function (where, floor, x, y) {
      if (floors.indexOf(floor) < 0) { E(where + ".floor", "unknown floor " + JSON.stringify(floor) + " (floors: " + floors.join(", ") + ")"); return false; }
      if (!isNum(x) || !isNum(y)) { E(where, "x and y must be numbers (metres)"); return false; }
      var z = zoneU(layout, floor); if (toU(x) < z[0] - 3 || toU(x) > z[2] + 3 || toU(y) < z[1] - 3 || toU(y) > z[3] + 3) E(where, "point (" + x + ", " + y + ") is outside floor " + floor + " (x " + toM(z[0]) + " to " + toM(z[2]) + ", y " + toM(z[1]) + " to " + toM(z[3]) + " m)");
      return true;
    };
    var arr = function (k) { if (scene[k] == null) return []; if (!Array.isArray(scene[k])) { E(k, "must be a list"); return []; } return scene[k]; };
    var uniq = function (list, where) { var seen = {}; list.forEach(function (o, i) { if (!o || typeof o.id !== "string" || !o.id) E(where + "[" + i + "].id", "missing id (a short unique text)"); else if (seen[o.id]) E(where + "[" + o.id + "]", "duplicate id"); else seen[o.id] = 1; }); return seen; };
    var stops = arr("stops"), devices = arr("devices"), objects = arr("objects"), edits = arr("layoutEdits"), paths = arr("paths");
    var stopIds = uniq(stops, "stops"); uniq(devices, "devices"); uniq(objects, "objects"); uniq(paths, "paths");
    var stopOf = {}; stops.forEach(function (s) { stopOf[s.id] = s; inFloor("stops[" + s.id + "]", s.floor, s.x, s.y); if (s.symbol != null && SYMBOLS.indexOf(s.symbol) < 0) E("stops[" + s.id + "].symbol", "one of " + SYMBOLS.join(", ")); if (s.color != null && !isColor(s.color)) E("stops[" + s.id + "].color", "a colour like #7030A0"); });
    edits.forEach(function (e, i) { var w = "layoutEdits[" + i + "]"; if (e.move && !(Array.isArray(e.move) && e.move.length === 2 && isNum(e.move[0]) && isNum(e.move[1]))) E(w + ".move", "[dx, dy] in metres"); if (e.turn != null && [0, 90, 180, 270].indexOf(norm360(e.turn)) < 0) E(w + ".turn", "0, 90, 180 or 270"); });
    var issues = []; applyLayoutEdits(edits, layout.replica, issues); issues.forEach(function (x) { E(x.where, x.msg); });
    devices.forEach(function (d) {
      var w = "devices[" + d.id + "]";
      if (d.type === "pc") { inFloor(w, d.floor, d.x, d.y); if (d.kind != null && PC_KINDS.indexOf(d.kind) < 0) E(w + ".kind", "one of " + PC_KINDS.join(", ")); if (d.heading != null && !isNum(d.heading)) E(w + ".heading", "degrees, 0 = north, clockwise"); if (d.serves != null && !stopIds[d.serves]) E(w + ".serves", "unknown stop " + JSON.stringify(d.serves)); }
      else if (d.type === "rfid-gate") { inFloor(w, d.floor, d.x, d.y); if (d.lane != null && ["north-south", "east-west"].indexOf(d.lane) < 0) E(w + ".lane", '"north-south" or "east-west"'); }
      else if (d.type === "scanner") { if (!Array.isArray(d.at)) E(w + ".at", "[x, y]: the lane point where the trolley's tag is read"); else inFloor(w + ".at", d.floor, d.at[0], d.at[1]); if (d.stand && !Array.isArray(d.stand)) E(w + ".stand", "[x, y] of the stand"); if (d.stop != null && !stopIds[d.stop]) E(w + ".stop", "unknown stop " + JSON.stringify(d.stop)); }
      else E(w + ".type", '"pc", "rfid-gate" or "scanner"');
      if (d.size != null && (!isNum(d.size) || d.size < 0.5 || d.size > 4)) E(w + ".size", "0.5 to 4 (icon scale; 1 = real size)");
    });
    var nGates = devices.filter(function (d) { return d.type === "rfid-gate"; }).length; if (nGates > MAX_GATES) E("devices", nGates + " RFID gates; at most " + MAX_GATES + " per tab");
    objects.forEach(function (o) { var w = "objects[" + o.id + "]"; if (OBJECT_TYPES.indexOf(o.type) < 0) E(w + ".type", "one of " + OBJECT_TYPES.join(", ")); else inFloor(w, o.floor, o.x, o.y); });

    var conv = toInternal(scene, { plates: layout.plates, elevators: layout.elevators, replica: layout.replica }, { applyLayout: false });
    conv.issues.forEach(function (x) { E(x.where, x.msg); });
    var internalDevices = conv.data.devices;
    paths.forEach(function (p, pi) {
      var w = "paths[" + p.id + "]"; if (!Array.isArray(p.steps) || !p.steps.length) { E(w + ".steps", "a path needs at least one step"); return; }
      if (p.color != null && !isColor(p.color)) E(w + ".color", "a colour like #7030A0");
      if (p.trolleys != null && (!isNum(p.trolleys) || p.trolleys < 1 || p.trolleys > 12)) E(w + ".trolleys", "1 to 12 trolleys on this path");
      if (p.headway != null && (!isNum(p.headway) || p.headway < 1 || p.headway > 3600)) E(w + ".headway", "1 to 3600 seconds between trolleys");
      var sid = uniq(p.steps, w + ".steps"); void sid;
      var f = conv.data.flows[pi], prevEnd = null, prevFloor = null;
      p.steps.forEach(function (s, i) {
        var ws = w + ".steps[" + s.id + "]", st = stopOf[s.stop], r = s.route || { type: "stay" }, fs = f.steps[i];
        if (!st) { E(ws + ".stop", "unknown stop " + JSON.stringify(s.stop)); return; }
        if (s.mode != null && !MODES_IN[s.mode]) E(ws + ".mode", '"push", "agv" or "manual"');
        if (s.wait != null && (!isNum(s.wait) || s.wait < 0 || s.wait > 600)) E(ws + ".wait", "0 to 600 seconds");
        if (s.speed != null && (!isNum(s.speed) || s.speed < 0.2 || s.speed > 8)) E(ws + ".speed", "0.2 to 8 m/s");
        if (["stay", "points", "auto", "elevator"].indexOf(r.type) < 0) { E(ws + ".route.type", '"stay", "points", "auto" or "elevator"'); return; }
        if (r.type === "elevator") {
          var el = elevatorOf(layout, r.elevator); if (!el) { E(ws + ".route.elevator", "unknown elevator " + JSON.stringify(r.elevator) + " (elevators: " + layout.elevators.map(function (e) { return e.label; }).join(", ") + ")"); return; }
          if (!prevEnd || Math.hypot(prevEnd[0] - el.low[0], prevEnd[1] - el.low[1]) * U > 0.01) E(ws, "an elevator ride must start at the lower landing of " + el.label + " (" + toM(el.low[0]) + ", " + toM(el.low[1]) + "); the previous step ends at " + (prevEnd ? "(" + toM(prevEnd[0]) + ", " + toM(prevEnd[1]) + ")" : "nowhere"));
          if (Math.hypot(toU(st.x) - el.high[0], toU(st.y) - el.high[1]) * U > 0.01) E(ws + ".stop", "the stop of an elevator ride must be the upper landing (" + toM(el.high[0]) + ", " + toM(el.high[1]) + ")");
          prevEnd = el.high.slice(); prevFloor = floorOfU(layout, el.high[0], el.high[1]); return;
        }
        var stopU = [toU(st.x), toU(st.y)];
        if (r.type === "stay") { if (prevEnd && Math.hypot(prevEnd[0] - stopU[0], prevEnd[1] - stopU[1]) * U > 0.01) E(ws + ".route", "\"stay\" but the trolley is elsewhere (" + toM(prevEnd[0]) + ", " + toM(prevEnd[1]) + "): use \"auto\" or \"points\" to drive to " + s.stop); prevEnd = stopU; prevFloor = st.floor; return; }
        if (r.type === "points") {
          if (!Array.isArray(r.points) || r.points.length < 2 || !r.points.every(function (q) { return Array.isArray(q) && q.length === 2 && isNum(q[0]) && isNum(q[1]); })) { E(ws + ".route.points", "a list of at least two [x, y] points in metres"); return; }
          var a = r.points[0], b = r.points[r.points.length - 1];
          if (prevEnd && Math.hypot(toU(a[0]) - prevEnd[0], toU(a[1]) - prevEnd[1]) * U > 0.01) E(ws + ".route.points[0]", "must be where the previous step ends (" + toM(prevEnd[0]) + ", " + toM(prevEnd[1]) + ")");
          if (Math.hypot(b[0] - st.x, b[1] - st.y) > 0.01) E(ws + ".route.points", "the last point must be the stop " + s.stop + " (" + st.x + ", " + st.y + ")");
        }
        if (r.type === "auto" && !prevEnd) E(ws + ".route", "\"auto\" needs a previous step to start from");
        if (prevFloor && prevFloor !== st.floor) E(ws, "goes from floor " + prevFloor + " to " + st.floor + " without an elevator ride");
        // sweep the real trolley footprint along every leg and corner
        if (Array.isArray(fs.path)) {
          var plate = st.floor, sol = solidsU(layout, plate, internalDevices), P = fs.path, h, worst = null, found = {};
          for (var k = 1; k < P.length; k++) {
            var ax = P[k - 1][0], ay = P[k - 1][1], bx = P[k][0], by = P[k][1], L = Math.hypot(bx - ax, by - ay); if (L < 1e-6) continue;
            var hh = Math.atan2(bx - ax, by - ay);
            var test = function (x, y, hd, leg) { sol.near(x, y, 8).forEach(function (o) { var g = gap(x, y, hd, o.r) * U; if (g < CLEAR_WARN && (!found[o.what] || g < found[o.what].g)) found[o.what] = { g: g, x: x, y: y, leg: leg }; }); };
            if (h !== undefined) { var dd = Math.atan2(Math.sin(hh - h), Math.cos(hh - h)); if (Math.abs(dd) > 1e-3) for (var q = 1; q <= 18; q++) test(ax, ay, h + dd * q / 18, k); }
            for (var u = 0; u <= L; u += 0.25) test(ax + (bx - ax) * u / L, ay + (by - ay) * u / L, hh, k);
            h = hh;
          }
          Object.keys(found).forEach(function (what) { var f0 = found[what], g = f0.g; (g < CLEAR_ERROR ? E : Wn)(ws + ".route", (g < 0 ? "the trolley hits " : "the trolley passes " + g.toFixed(2) + " m from ") + what + " on leg " + f0.leg + " at (" + toM(f0.x).toFixed(1) + ", " + toM(f0.y).toFixed(1) + ")" + (g < CLEAR_ERROR ? "; needs at least " + CLEAR_ERROR + " m" : "")); }); void worst;
          prevEnd = P[P.length - 1].slice();
        } else prevEnd = stopU;
        prevFloor = st.floor;
      });
    });
    // devices clear of the layout and of each other; route-bound scanners on a path
    var byFloor = {}; internalDevices.forEach(function (d) { (byFloor[d.plate] || (byFloor[d.plate] = [])).push(d); });
    Object.keys(byFloor).forEach(function (fl) {
      var sol = solidsU(layout, fl, []), list = byFloor[fl];
      list.forEach(function (d, i) {
        footprintsU(d).forEach(function (r) {
          sol.near((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 10).forEach(function (o) { if (Math.max(o.r[0] - r[2], r[0] - o.r[2], o.r[1] - r[3], r[1] - o.r[3]) < 0.2) E("devices[" + d.sceneId + "]", "overlaps " + o.what); });
          list.slice(i + 1).forEach(function (e) { footprintsU(e).forEach(function (s) { if (Math.max(s[0] - r[2], r[0] - s[2], s[1] - r[3], r[1] - s[3]) < 0.2) E("devices[" + d.sceneId + "]", "overlaps device " + e.sceneId); }); });
        });
        if (d.type === "rfid-manual" && d.routeBound) {
          var best = Infinity; conv.data.flows.forEach(function (f) { f.steps.forEach(function (s) { if (!Array.isArray(s.path) || (conv.data.nodes[s.node] || {}).plate !== fl) return; for (var j = 1; j < s.path.length; j++) { var a = s.path[j - 1], b = s.path[j], x = Math.max(Math.min(a[0], b[0]), Math.min(d.lane[0], Math.max(a[0], b[0]))), y = Math.max(Math.min(a[1], b[1]), Math.min(d.lane[1], Math.max(a[1], b[1]))); best = Math.min(best, Math.hypot(x - d.lane[0], y - d.lane[1])); } }); });
          if (best * U > 0.006) E("devices[" + d.sceneId + "].at", "stops: true, but the point is " + (best * U).toFixed(2) + " m off every path (put \"at\" exactly on a path leg, or set stops: false)");
        }
      });
    });
    var dir = scene.director || {}; Object.keys(dir).forEach(function (pid) { if (!paths.some(function (p) { return p.id === pid; })) E("director[" + pid + "]", "unknown path"); });

    return { errors: errors, warnings: warnings, stats: { stops: stops.length, devices: devices.length, paths: paths.length, steps: paths.reduce(function (n, p) { return n + (p.steps || []).length; }, 0) } };
  }

  var api = { FORMAT: FORMAT, VERSION: VERSION, UNIT: U, DIMS: DIMS, MAX_GATES: MAX_GATES, fromInternal: fromInternal, toInternal: toInternal, validate: validate, layoutOf: layoutOf, stampLayout: stampLayout, applyLayoutEdits: applyLayoutEdits, makeRouter: makeRouter, solidsU: solidsU, footprintsU: footprintsU, floorOfU: floorOfU, simplify: simplify, CLEAR_ERROR: CLEAR_ERROR, CLEAR_WARN: CLEAR_WARN };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MFScene = api;
})(typeof window !== "undefined" ? window : this);
