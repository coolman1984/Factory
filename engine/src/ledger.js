// Inventory ledger: the only writer of stock. Locations hold integer base quantities per item.
// Stock reservations (material promised to a mission or a station) and space reservations (room promised at a destination)
// are named, so a transfer either consumes exactly the promised amounts or is refused. Nothing here knows about drawing.
import { EngineError, assertQty } from "./units.js";

export class Ledger {
  constructor() {
    this.items = new Map();       // id -> { id, unit, slotSize }
    this.locations = new Map();   // id -> { id, kind, capacitySlots|null, node|null, stock: Map(item -> onHand) }
    this.stockRes = new Map();    // key -> { loc, item, qty }
    this.spaceRes = new Map();    // key -> { loc, item, qty }
    this.counters = new Map();    // item -> { initial, received, produced, consumed }
    this.serialSeq = new Map();   // serial prefix -> last number issued (Phase 4: serial tracking)
    this.hasSerials = false;
  }

  // serial: null (tracked by quantity) or a prefix; every unit of a serial item has its own number (prefix-000001), kept in
  // first-in first-out order per location, so each unit can be followed through the factory.
  defineItem(id, unit, slotSize = 1, serial = null) {
    if (this.items.has(id)) throw new EngineError("duplicate_item", `item ${id} defined twice`);
    if (!Number.isSafeInteger(slotSize) || slotSize < 1) throw new EngineError("bad_slot_size", `item ${id}: slot size must be a positive integer`);
    if (serial != null && unit !== "ea") throw new EngineError("bad_serial", `item ${id}: only items counted in ea can carry serial numbers`);
    this.items.set(id, { id, unit, slotSize, serial: serial ?? null }); this.counters.set(id, { initial: 0, received: 0, produced: 0, consumed: 0 });
    if (serial != null) { this.hasSerials = true; if (!this.serialSeq.has(serial)) this.serialSeq.set(serial, 0); }
  }
  defineLocation(id, kind = "storage", capacitySlots = null, node = null) {
    if (this.locations.has(id)) throw new EngineError("duplicate_location", `location ${id} defined twice`);
    if (capacitySlots !== null && (!Number.isSafeInteger(capacitySlots) || capacitySlots < 0)) throw new EngineError("bad_capacity", `location ${id}: capacity must be a non-negative integer or null`);
    this.locations.set(id, { id, kind, capacitySlots, node, stock: new Map(), serials: new Map() });
  }
  loc(id) { const l = this.locations.get(id); if (!l) throw new EngineError("unknown_location", `unknown location ${id}`); return l; }
  item(id) { const i = this.items.get(id); if (!i) throw new EngineError("unknown_item", `unknown item ${id}`); return i; }

  onHand(loc, item) { return this.loc(loc).stock.get(item) || 0; }
  reservedStock(loc, item) { let n = 0; for (const r of this.stockRes.values()) if (r.loc === loc && r.item === item) n += r.qty; return n; }
  reservedSpace(loc, item) { let n = 0; for (const r of this.spaceRes.values()) if (r.loc === loc && r.item === item) n += r.qty; return n; }
  available(loc, item) { return this.onHand(loc, item) - this.reservedStock(loc, item); }

  // Slots used if `extraItem` gained `extraQty`, counting stock already promised to arrive.
  slotsUsed(locId, extraItem = null, extraQty = 0) {
    const L = this.loc(locId), q = new Map(L.stock);
    for (const r of this.spaceRes.values()) if (r.loc === locId) q.set(r.item, (q.get(r.item) || 0) + r.qty);
    if (extraItem) q.set(extraItem, (q.get(extraItem) || 0) + extraQty);
    let n = 0; for (const [item, qty] of q) if (qty > 0) n += Math.ceil(qty / this.item(item).slotSize); return n;
  }
  // Largest quantity of `item` that still fits (Infinity for an unbounded location).
  freeQty(locId, item) {
    const L = this.loc(locId); if (L.capacitySlots === null) return Infinity;
    const slot = this.item(item).slotSize; let lo = 0, hi = L.capacitySlots * slot + slot;
    if (this.slotsUsed(locId) > L.capacitySlots) return 0;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.slotsUsed(locId, item, mid) <= L.capacitySlots) lo = mid; else hi = mid - 1; }
    return lo;
  }

  reserveStock(key, loc, item, qty) {
    assertQty(qty, "reserve " + item); if (this.stockRes.has(key)) throw new EngineError("duplicate_reservation", `stock reservation ${key} exists`);
    if (this.available(loc, item) < qty) throw new EngineError("insufficient_stock", `${loc} has ${this.available(loc, item)} ${item} available, ${qty} needed`);
    this.stockRes.set(key, { loc, item, qty });
  }
  reserveSpace(key, loc, item, qty) {
    assertQty(qty, "reserve space " + item); if (this.spaceRes.has(key)) throw new EngineError("duplicate_reservation", `space reservation ${key} exists`);
    if (this.freeQty(loc, item) < qty) throw new EngineError("no_space", `${loc} has room for ${this.freeQty(loc, item)} ${item}, ${qty} needed`);
    this.spaceRes.set(key, { loc, item, qty });
  }
  releaseStock(key) { this.stockRes.delete(key); }
  releaseSpace(key) { this.spaceRes.delete(key); }

  // Serial numbers of `item` at `loc`, oldest first (a copy).
  serialsAt(loc, item) { return (this.loc(loc).serials.get(item) || []).slice(); }
  #issue(prefix, n) { const out = []; let k = this.serialSeq.get(prefix); for (let i = 0; i < n; i++) out.push(prefix + "-" + String(++k).padStart(6, "0")); this.serialSeq.set(prefix, k); return out; }
  #add(loc, item, qty, spaceKey, serials = null) {
    const L = this.loc(loc), I = this.item(item);
    if (I.serial == null && serials) throw new EngineError("not_serial", `item ${item} has no serial numbers`);
    if (I.serial != null && serials && serials.length !== qty) throw new EngineError("serial_count", `${qty} ${item} need ${qty} serial numbers, got ${serials.length}`);
    if (spaceKey) {
      const r = this.spaceRes.get(spaceKey);
      if (!r || r.loc !== loc || r.item !== item || r.qty < qty) throw new EngineError("space_reservation_mismatch", `space reservation ${spaceKey} does not cover ${qty} ${item} at ${loc}`);
      if (r.qty === qty) this.spaceRes.delete(spaceKey); else r.qty -= qty;
    } else if (L.capacitySlots !== null && this.slotsUsed(loc, item, qty) > L.capacitySlots) throw new EngineError("no_space", `${loc} is full for ${qty} ${item}`);
    L.stock.set(item, (L.stock.get(item) || 0) + qty);
    if (I.serial == null) return null;
    const list = serials ? serials.slice() : this.#issue(I.serial, qty); L.serials.set(item, [...(L.serials.get(item) || []), ...list]); return list;
  }
  // pick: specific serial numbers to take (they must be here); otherwise the oldest first.
  #remove(loc, item, qty, stockKey, pick = null) {
    const L = this.loc(loc), have = L.stock.get(item) || 0, I = this.item(item);
    if (pick && pick.length !== qty) throw new EngineError("serial_count", `removing ${qty} ${item} with ${pick.length} serial numbers`);
    if (pick && I.serial != null) { const here = new Set(L.serials.get(item) || []); for (const sn of pick) if (!here.has(sn)) throw new EngineError("serial_missing", `${sn} is not at ${loc}`); }
    if (stockKey) {
      const r = this.stockRes.get(stockKey);
      if (!r || r.loc !== loc || r.item !== item || r.qty < qty) throw new EngineError("stock_reservation_mismatch", `stock reservation ${stockKey} does not cover ${qty} ${item} at ${loc}`);
      if (r.qty === qty) this.stockRes.delete(stockKey); else r.qty -= qty;
    } else if (this.available(loc, item) < qty) throw new EngineError("insufficient_stock", `${loc} has ${this.available(loc, item)} ${item} free, ${qty} to remove`);
    if (have < qty) throw new EngineError("negative_stock", `${loc} would go below zero for ${item}`);
    if (have === qty) L.stock.delete(item); else L.stock.set(item, have - qty);
    if (I.serial == null) return null;
    const list = L.serials.get(item) || [], taken = pick ? pick.slice() : list.slice(0, qty), out = new Set(taken), rest = list.filter(sn => !out.has(sn));
    if (rest.length) L.serials.set(item, rest); else L.serials.delete(item); return taken;
  }

  // Each returns the serial numbers involved (null for items tracked by quantity). produce(serials) keeps given numbers (the
  // same physical unit changes state, e.g. tested -> passed); without them new numbers are issued.
  initial(loc, item, qty) { assertQty(qty, "initial " + item); const s = this.#add(loc, item, qty, null); this.counters.get(item).initial += qty; return s; }
  receive(loc, item, qty, spaceKey = null) { assertQty(qty, "receive " + item); const s = this.#add(loc, item, qty, spaceKey); this.counters.get(item).received += qty; return s; }
  produce(loc, item, qty, spaceKey = null, serials = null) { assertQty(qty, "produce " + item); const s = this.#add(loc, item, qty, spaceKey, serials); this.counters.get(item).produced += qty; return s; }
  consume(loc, item, qty, stockKey = null, pick = null) { assertQty(qty, "consume " + item); const s = this.#remove(loc, item, qty, stockKey, pick); this.counters.get(item).consumed += qty; return s; }
  // Atomic transfer: checks both sides before changing either. Serial numbers move with the units (oldest first, or `pick`).
  transfer(from, to, item, qty, { stockKey = null, spaceKey = null, pick = null } = {}) {
    assertQty(qty, "transfer " + item);
    const sr = stockKey ? this.stockRes.get(stockKey) : null, pr = spaceKey ? this.spaceRes.get(spaceKey) : null;
    if (stockKey && (!sr || sr.loc !== from || sr.item !== item || sr.qty < qty)) throw new EngineError("stock_reservation_mismatch", `stock reservation ${stockKey} does not cover the transfer`);
    if (!stockKey && this.available(from, item) < qty) throw new EngineError("insufficient_stock", `${from} lacks ${qty} ${item}`);
    if (spaceKey && (!pr || pr.loc !== to || pr.item !== item || pr.qty < qty)) throw new EngineError("space_reservation_mismatch", `space reservation ${spaceKey} does not cover the transfer`);
    const T = this.loc(to); if (!spaceKey && T.capacitySlots !== null && this.slotsUsed(to, item, qty) > T.capacitySlots) throw new EngineError("no_space", `${to} is full`);
    const s = this.#remove(from, item, qty, stockKey, pick); this.#add(to, item, qty, spaceKey, s); return s;
  }

  total(item) { let n = 0; for (const L of this.locations.values()) n += L.stock.get(item) || 0; return n; }

  // Invariants of the validation plan: no negative stock, reservations covered, capacity respected, material balance.
  check() {
    const problems = [];
    for (const L of this.locations.values()) {
      for (const [item, q] of L.stock) if (!(q > 0) || !Number.isSafeInteger(q)) problems.push(`${L.id}: bad stock ${q} ${item}`);
      for (const item of new Set([...L.stock.keys(), ...[...this.stockRes.values()].filter(r => r.loc === L.id).map(r => r.item)])) {
        if (this.reservedStock(L.id, item) > this.onHand(L.id, item)) problems.push(`${L.id}: ${item} reserved ${this.reservedStock(L.id, item)} > on hand ${this.onHand(L.id, item)}`);
      }
      if (L.capacitySlots !== null && this.slotsUsed(L.id) > L.capacitySlots) problems.push(`${L.id}: ${this.slotsUsed(L.id)} slots used of ${L.capacitySlots}`);
    }
    for (const [item, c] of this.counters) { const expect = c.initial + c.received + c.produced - c.consumed, got = this.total(item); if (expect !== got) problems.push(`${item}: balance ${expect} expected, ${got} on hand`); }
    if (this.hasSerials) {   // every serial unit has exactly one number, and no number is in two places
      const seen = new Set();
      for (const L of this.locations.values()) for (const [item, I] of this.items) if (I.serial != null) {
        const list = L.serials.get(item) || []; if (list.length !== (L.stock.get(item) || 0)) problems.push(`${L.id}: ${item} has ${L.stock.get(item) || 0} on hand but ${list.length} serial numbers`);
        for (const sn of list) { if (seen.has(sn)) problems.push(`serial ${sn} is in two places`); seen.add(sn); }
      }
    }
    return problems;
  }

  state() {
    const locs = {}; for (const id of [...this.locations.keys()].sort()) { const L = this.locations.get(id), s = {}; for (const k of [...L.stock.keys()].sort()) s[k] = L.stock.get(k); locs[id] = s; }
    const res = m => { const o = {}; for (const k of [...m.keys()].sort()) o[k] = { ...m.get(k) }; return o; };
    const counters = {}; for (const k of [...this.counters.keys()].sort()) counters[k] = { ...this.counters.get(k) };
    const out = { stock: locs, stockRes: res(this.stockRes), spaceRes: res(this.spaceRes), counters };
    if (this.hasSerials) {
      const serials = {}; for (const id of [...this.locations.keys()].sort()) { const L = this.locations.get(id); if (!L.serials.size) continue; const s = {}; for (const k of [...L.serials.keys()].sort()) s[k] = L.serials.get(k).slice(); serials[id] = s; }
      out.serials = serials; out.serialSeq = Object.fromEntries([...this.serialSeq].sort((a, b) => a[0] < b[0] ? -1 : 1));
    }
    return out;
  }
  restore(s) {
    for (const L of this.locations.values()) L.stock = new Map(Object.entries(s.stock[L.id] || {}));
    this.stockRes = new Map(Object.entries(s.stockRes).map(([k, v]) => [k, { ...v }]));
    this.spaceRes = new Map(Object.entries(s.spaceRes).map(([k, v]) => [k, { ...v }]));
    this.counters = new Map(Object.entries(s.counters).map(([k, v]) => [k, { ...v }]));
    for (const L of this.locations.values()) L.serials = new Map(Object.entries(s.serials?.[L.id] || {}).map(([k, v]) => [k, v.slice()]));
    if (s.serialSeq) this.serialSeq = new Map(Object.entries(s.serialSeq));
  }
}
