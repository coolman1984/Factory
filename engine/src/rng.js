// Named random streams (decision D17): sfc32 per stream, seeded from (world seed, stream name).
// Adding draws in one stream never changes another, so a new handling rule does not move the breakdown times.
// The full state is four 32-bit integers, saved in every snapshot.

export function hashString32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export class RandomStream {
  constructor(state) { this.s = state.slice(); }
  static seeded(seed, name) {
    const h = hashString32(String(seed) + ":" + name);
    const r = new RandomStream([h, h ^ 0x9e3779b9, h ^ 0x85ebca6b, h ^ 0xc2b2ae35].map(v => v >>> 0));
    for (let i = 0; i < 12; i++) r.next();
    return r;
  }
  next() {
    let [a, b, c, d] = this.s;
    const t = (((a + b) | 0) + d + 1) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    this.s = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    return (t >>> 0) / 4294967296;
  }
  // Exponential sample with the given mean (any unit).
  exp(mean) { return -mean * Math.log(1 - this.next()); }
  state() { return this.s.slice(); }
}

export class RandomStreams {
  constructor(seed, saved) { this.seed = seed; this.streams = new Map(); if (saved) for (const [k, v] of Object.entries(saved)) this.streams.set(k, new RandomStream(v)); }
  get(name) { let s = this.streams.get(name); if (!s) { s = RandomStream.seeded(this.seed, name); this.streams.set(name, s); } return s; }
  state() { const o = {}; for (const k of [...this.streams.keys()].sort()) o[k] = this.streams.get(k).state(); return o; }
}
