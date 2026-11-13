// Container packing plan (Phase 4): how many identical cartons fit in a container, by geometry and by payload.
// Deterministic grid packing: cartons stand upright (height up) unless `allowTipping`; the floor may be split into two blocks
// with the carton turned 90 degrees in the second block, which often fits more than one orientation alone. It is a plan for
// planning, not a load-securing or safety calculation.
import { EngineError } from "./units.js";

const fit = (space, size) => Math.floor((space + 1e-9) / size);

// container: { inner_m: [L, W, H], maxPayloadKg? }; carton: { size_m: [l, w, h], kg? }
export function packPlan(container, carton, { allowTipping = false } = {}) {
  const C = container?.inner_m, K = carton?.size_m;
  if (!Array.isArray(C) || C.length !== 3 || !C.every(v => v > 0)) throw new EngineError("bad_container", "container inner_m must be [length, width, height] in metres, all > 0");
  if (!Array.isArray(K) || K.length !== 3 || !K.every(v => v > 0)) throw new EngineError("bad_carton", "carton size_m must be [length, width, height] in metres, all > 0");
  const [L, W, H] = C, [l, w, h] = K;
  const orientations = allowTipping ? [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]] : [[l, w, h], [w, l, h]];
  let best = null;
  for (const [a, b, c] of orientations) {
    const layers = fit(H, c); if (!layers) continue;
    // block 1: k rows of (a x b) along the length, block 2: the rest of the length with the carton turned (b x a)
    for (let k = 0; k <= fit(L, a); k++) {
      const rest = L - k * a, n1 = k * fit(W, b), n2 = fit(rest, b) * fit(W, a), perLayer = n1 + n2;
      const cand = { perLayer, layers, count: perLayer * layers, orientation: [a, b, c], block1: { rows: k, across: fit(W, b) }, block2: { rows: fit(rest, b), across: fit(W, a) } };
      if (!best || cand.count > best.count || (cand.count === best.count && cand.block2.rows === 0 && best.block2.rows > 0)) best = cand;
    }
  }
  const byVolume = best ? best.count : 0, byWeight = carton.kg > 0 && container.maxPayloadKg > 0 ? Math.floor(container.maxPayloadKg / carton.kg) : Infinity;
  const perContainer = Math.min(byVolume, byWeight), vol = (L * W * H), used = perContainer * l * w * h;
  return {
    perContainer, byVolume, byWeight: Number.isFinite(byWeight) ? byWeight : null, limitedBy: byWeight < byVolume ? "payload" : "space",
    layers: best ? best.layers : 0, perLayer: best ? best.perLayer : 0, orientation_m: best ? best.orientation.map(v => +v.toFixed(4)) : null,
    blocks: best ? [best.block1, best.block2].filter(b => b.rows > 0) : [], volumeFill: +(used / vol).toFixed(4),
    payloadKg: carton.kg > 0 ? +(perContainer * carton.kg).toFixed(2) : null
  };
}
