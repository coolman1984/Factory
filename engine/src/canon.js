// Canonical serialisation and the state fingerprint (decision D17): sorted keys, no whitespace, then a 64-bit hash.

export function canonical(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return value > 0 ? '"+Inf"' : value < 0 ? '"-Inf"' : '"NaN"';
    return JSON.stringify(value === undefined ? null : value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

// Two independent 32-bit lanes (cyrb53 style), printed as 16 hex digits. imul is held locally: inside a Node vm context
// every global lookup in this hot loop is slow.
const imul = Math.imul;
export function hash64(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = imul(h1 ^ c, 2654435761); h2 = imul(h2 ^ c, 1597334677); }
  h1 = imul(h1 ^ (h1 >>> 16), 2246822507) ^ imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = imul(h2 ^ (h2 >>> 16), 2246822507) ^ imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export function fingerprintOf(value) { return hash64(canonical(value)); }

export function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
