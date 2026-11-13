// Event queue: a binary heap ordered by the declared key (time, priority, sequence).
// Entries are plain data { t, p, s, type, data } so the queue is part of a snapshot (no closures).

const before = (x, y) => x.t < y.t || (x.t === y.t && (x.p < y.p || (x.p === y.p && x.s < y.s)));

export class EventQueue {
  constructor(saved) { this.a = saved ? saved.items.map(e => ({ ...e })) : []; this.seq = saved ? saved.seq : 0; if (saved) this.a.sort((x, y) => before(x, y) ? -1 : 1); }
  get size() { return this.a.length; }
  push(t, p, type, data) {
    const e = { t, p, s: this.seq++, type, data }, a = this.a; a.push(e);
    let i = a.length - 1;
    while (i) { const q = (i - 1) >> 1; if (before(a[q], a[i])) break; [a[q], a[i]] = [a[i], a[q]]; i = q; }
    return e.s;
  }
  peek() { return this.a[0] || null; }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && before(a[l], a[m])) m = l; if (r < a.length && before(a[r], a[m])) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; }
    }
    return top;
  }
  // Canonical order for snapshots and fingerprints: sorted by the queue key.
  state() { return { seq: this.seq, items: this.a.slice().sort((x, y) => before(x, y) ? -1 : 1).map(e => ({ ...e })) }; }
}
