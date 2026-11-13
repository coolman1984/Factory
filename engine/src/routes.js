// Navigation graph and route search. A missing route is a reason, never an invented straight line.
// Edges carry allowed modes and speed limits; the cache is keyed by the layout revision so a closed aisle is never reused.
import { EngineError } from "./units.js";

export class RouteGraph {
  constructor(graph) {
    this.nodes = new Map(); this.edges = new Map(); this.adj = new Map(); this.revision = 0; this.cache = new Map();
    if (!graph) return;
    for (const n of graph.nodes) { if (this.nodes.has(n.id)) throw new EngineError("duplicate_node", `node ${n.id} twice`); this.nodes.set(n.id, { id: n.id, x: n.x, y: n.y, z: n.z || 0 }); this.adj.set(n.id, []); }
    for (const e of graph.edges) {
      if (!this.nodes.has(e.a) || !this.nodes.has(e.b)) throw new EngineError("unknown_node", `edge ${e.id} joins unknown nodes`);
      const A = this.nodes.get(e.a), B = this.nodes.get(e.b);
      const length = e.length != null ? e.length : Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
      const E = { id: e.id, a: e.a, b: e.b, both: e.both !== false, length, speed: e.speed || Infinity, modes: e.modes || null, open: e.open !== false };
      this.edges.set(e.id, E); this.adj.get(e.a).push([E, e.b]); if (E.both) this.adj.get(e.b).push([E, e.a]);
    }
  }
  setOpen(edgeId, open) {
    const E = this.edges.get(edgeId); if (!E) throw new EngineError("unknown_edge", `unknown edge ${edgeId}`);
    if (E.open !== open) { E.open = open; this.revision++; this.cache.clear(); }
  }
  // Fastest route for a unit moving in `mode` at `speed` m/s. Returns { nodes, edges, metres, seconds } or null.
  find(from, to, mode, speed) {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    const key = from + ">" + to + ">" + mode + ">" + speed; if (this.cache.has(key)) return this.cache.get(key);
    const dist = new Map([[from, 0]]), prev = new Map(), done = new Set(), open = [[0, from]];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0] || (open[i][0] === open[bi][0] && open[i][1] < open[bi][1])) bi = i;
      const [d, u] = open.splice(bi, 1)[0]; if (done.has(u)) continue; done.add(u); if (u === to) break;
      for (const [E, v] of this.adj.get(u)) {
        if (!E.open || (E.modes && mode && !E.modes.includes(mode))) continue;
        const nd = d + E.length / Math.min(E.speed, speed);
        if (nd < (dist.has(v) ? dist.get(v) : Infinity)) { dist.set(v, nd); prev.set(v, [u, E.id]); open.push([nd, v]); }
      }
    }
    let result = null;
    if (from === to) result = { nodes: [from], edges: [], metres: 0, seconds: 0 };
    else if (prev.has(to)) {
      const nodes = [to], edges = []; let c = to, metres = 0;
      while (c !== from) { const [p, e] = prev.get(c); edges.unshift(e); nodes.unshift(p); metres += this.edges.get(e).length; c = p; }
      result = { nodes, edges, metres, seconds: dist.get(to) };
    }
    this.cache.set(key, result); return result;
  }
  state() { const closed = []; for (const E of this.edges.values()) if (!E.open) closed.push(E.id); return { revision: this.revision, closed: closed.sort() }; }
  restore(s) { for (const E of this.edges.values()) E.open = !s.closed.includes(E.id); this.revision = s.revision; this.cache.clear(); }
}
