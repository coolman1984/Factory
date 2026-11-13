// Units: integer time ticks and integer base quantities (decision D17).
// Every module of the core is plain JavaScript with no rendering import (checked by the dependency test).

export class EngineError extends Error {
  constructor(code, message, detail) { super(message); this.name = "EngineError"; this.code = code; this.detail = detail || null; }
}

// Base unit per dimension and the factor from each accepted unit to it. Quantities are stored as integers of the base unit.
export const UNIT_TABLE = Object.freeze({
  ea: { base: "ea", factor: 1, dimension: "count" },
  pcs: { base: "ea", factor: 1, dimension: "count" },
  lot: { base: "lot", factor: 1, dimension: "lot" },
  g: { base: "g", factor: 1, dimension: "mass" },
  kg: { base: "g", factor: 1000, dimension: "mass" },
  t: { base: "g", factor: 1000000, dimension: "mass" }
});

export function unitInfo(unit) {
  const u = UNIT_TABLE[unit];
  if (!u) throw new EngineError("unknown_unit", `unknown unit "${unit}"`);
  return u;
}

// Convert a decimal quantity in `unit` to an integer of the base unit. Refuses values that are not whole base units.
export function toBaseQty(qty, unit) {
  const u = unitInfo(unit), v = qty * u.factor, r = Math.round(v);
  if (!Number.isFinite(v) || Math.abs(v - r) > 1e-9 * Math.max(1, Math.abs(v))) throw new EngineError("fractional_quantity", `${qty} ${unit} is not a whole number of ${u.base}`);
  return r;
}

export function sameDimension(a, b) { return unitInfo(a).dimension === unitInfo(b).dimension; }

// Seconds (decimal) to integer ticks. The tick length is declared per world (default 1 ms).
export function secondsToTicks(seconds, tickPerSecond) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new EngineError("bad_duration", `duration ${seconds} s is not a finite non-negative number`);
  return Math.round(seconds * tickPerSecond);
}

export function ticksToSeconds(ticks, tickPerSecond) { return ticks / tickPerSecond; }

export function assertQty(q, what) {
  if (!Number.isSafeInteger(q) || q < 0) throw new EngineError("bad_quantity", `${what}: quantity ${q} must be a non-negative integer`);
}
