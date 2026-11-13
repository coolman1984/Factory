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
  }

  defineItem(id, unit, slotSize = 1) {
    if (this.items.has(id)) throw new EngineError("duplicate_item", `item ${id} defined twice`);
    if (!Number.isSafeInteger(slotSize) || slotSize < 1) throw new EngineError("bad_slot_size", `item ${id}: slot size must be a positive integer`);
    this.items.set(id, { id, unit, slotSize }); this.counters.set(id, { initial: 0, received: 0, produced: 0, consumed: 0 });
  }
  defineLocation(id, kind = "storage", capacitySlots = null, node = null) {
    if (this.locations.has(id)) throw new EngineError("duplicate_location", `location ${id} defined twice`);
    if (capacitySlots !== null && (!Number.isSafeInteger(capacitySlots) || capacitySlots < 0)) throw new EngineError("bad_capacity", `location ${id}: capacity must be a non-negative integer or null`);
    this.locations.set(id, { id, kind, capacitySlots, node, stock: new Map() });
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

  #add(loc, item, qty, spaceKey) {
    const L = this.loc(loc); this.item(item);
    if (spaceKey) {
      const r = this.spaceRes.get(spaceKey);
      if (!r || r.loc !== loc || r.item !== item || r.qty < qty) throw new EngineError("space_reservation_mismatch", `space reservation ${spaceKey} does not cover ${qty} ${item} at ${loc}`);
      if (r.qty === qty) this.spaceRes.delete(spaceKey); else r.qty -= qty;
    } else if (L.capacitySlots !== null && this.slotsUsed(loc, item, qty) > L.capacitySlots) throw new EngineError("no_space", `${loc} is full for ${qty} ${item}`);
    L.stock.set(item, (L.stock.get(item) || 0) + qty);
  }
  #remove(loc, item, qty, stockKey) {
    const L = this.loc(loc), have = L.stock.get(item) || 0;
    if (stockKey) {
      const r = this.stockRes.get(stockKey);
      if (!r || r.loc !== loc || r.item !== item || r.qty < qty) throw new EngineError("stock_reservation_mismatch", `stock reservation ${stockKey} does not cover ${qty} ${item} at ${loc}`);
      if (r.qty === qty) this.stockRes.delete(stockKey); else r.qty -= qty;
    } else if (this.available(loc, item) < qty) throw new EngineError("insufficient_stock", `${loc} has ${this.available(loc, item)} ${item} free, ${qty} to remove`);
    if (have < qty) throw new EngineError("negative_stock", `${loc} would go below zero for ${item}`);
    if (have === qty) L.stock.delete(item); else L.stock.set(item, have - qty);
  }

  initial(loc, item, qty) { assertQty(qty, "initial " + item); this.#add(loc, item, qty, null); this.counters.get(item).initial += qty; }
  receive(loc, item, qty, spaceKey = null) { assertQty(qty, "receive " + item); this.#add(loc, item, qty, spaceKey); this.counters.get(item).received += qty; }
  produce(loc, item, qty, spaceKey = null) { assertQty(qty, "produce " + item); this.#add(loc, item, qty, spaceKey); this.counters.get(item).produced += qty; }
  consume(loc, item, qty, stockKey = null) { assertQty(qty, "consume " + item); this.#remove(loc, item, qty, stockKey); this.counters.get(item).consumed += qty; }
  // Atomic transfer: checks both sides before changing either.
  transfer(from, to, item, qty, { stockKey = null, spaceKey = null } = {}) {
    assertQty(qty, "transfer " + item);
    const sr = stockKey ? this.stockRes.get(stockKey) : null, pr = spaceKey ? this.spaceRes.get(spaceKey) : null;
    if (stockKey && (!sr || sr.loc !== from || sr.item !== item || sr.qty < qty)) throw new EngineError("stock_reservation_mismatch", `stock reservation ${stockKey} does not cover the transfer`);
    if (!stockKey && this.available(from, item) < qty) throw new EngineError("insufficient_stock", `${from} lacks ${qty} ${item}`);
    if (spaceKey && (!pr || pr.loc !== to || pr.item !== item || pr.qty < qty)) throw new EngineError("space_reservation_mismatch", `space reservation ${spaceKey} does not cover the transfer`);
    const T = this.loc(to); if (!spaceKey && T.capacitySlots !== null && this.slotsUsed(to, item, qty) > T.capacitySlots) throw new EngineError("no_space", `${to} is full`);
    this.#remove(from, item, qty, stockKey); this.#add(to, item, qty, spaceKey);
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
    return problems;
  }

  state() {
    const locs = {}; for (const id of [...this.locations.keys()].sort()) { const L = this.locations.get(id), s = {}; for (const k of [...L.stock.keys()].sort()) s[k] = L.stock.get(k); locs[id] = s; }
    const res = m => { const o = {}; for (const k of [...m.keys()].sort()) o[k] = { ...m.get(k) }; return o; };
    const counters = {}; for (const k of [...this.counters.keys()].sort()) counters[k] = { ...this.counters.get(k) };
    return { stock: locs, stockRes: res(this.stockRes), spaceRes: res(this.spaceRes), counters };
  }
  restore(s) {
    for (const L of this.locations.values()) L.stock = new Map(Object.entries(s.stock[L.id] || {}));
    this.stockRes = new Map(Object.entries(s.stockRes).map(([k, v]) => [k, { ...v }]));
    this.spaceRes = new Map(Object.entries(s.spaceRes).map(([k, v]) => [k, { ...v }]));
    this.counters = new Map(Object.entries(s.counters).map(([k, v]) => [k, { ...v }]));
  }
}
