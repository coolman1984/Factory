// Reads the Blender GLBs and packs each primitive (positions, normals, indices, PBR values) into private/assets/assets.json.
// Plain arrays load synchronously, so instancing needs no async loader at start-up.
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../private/assets/", import.meta.url), out = {};
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3 }, BYTES = { 5126: 4, 5123: 2, 5125: 4, 5121: 1 };
for (const name of ["injection", "forklift", "truck", "press", "agv", "utility", "pallet"]) {
  const b = readFileSync(new URL(name + ".glb", dir)), jl = b.readUInt32LE(12), J = JSON.parse(b.subarray(20, 20 + jl).toString()), bin = b.subarray(20 + jl + 8);
  const acc = (i) => { const a = J.accessors[i], v = J.bufferViews[a.bufferView], off = (v.byteOffset || 0) + (a.byteOffset || 0), n = a.count * SIZE[a.type], C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType]; return new C(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * BYTES[a.componentType])); };
  const r3 = (a) => Array.from(a, (x) => Math.round(x * 1000) / 1000);
  const node = J.nodes.find((n) => n.mesh !== undefined), Q = node.rotation || [0, 0, 0, 1], Tr = node.translation || [0, 0, 0], S = node.scale || [1, 1, 1];
  // bake the node transform: Blender keeps the join target's rotation and position on the node, not in the vertices
  const rot = (x, y, z) => { const [a, b, c, w] = Q, tx = 2 * (b * z - c * y), ty = 2 * (c * x - a * z), tz = 2 * (a * y - b * x); return [x + w * tx + b * tz - c * ty, y + w * ty + c * tx - a * tz, z + w * tz + a * ty - b * tx]; };
  const bake = (arr, isPos) => { const o = new Float32Array(arr.length); for (let i = 0; i < arr.length; i += 3) { const r = isPos ? rot(arr[i] * S[0], arr[i + 1] * S[1], arr[i + 2] * S[2]) : rot(arr[i], arr[i + 1], arr[i + 2]); o[i] = r[0] + (isPos ? Tr[0] : 0); o[i + 1] = r[1] + (isPos ? Tr[1] : 0); o[i + 2] = r[2] + (isPos ? Tr[2] : 0); } return o; };
  out[name] = J.meshes.flatMap((m) => m.primitives).map((p) => {
    const M = J.materials[p.material], pb = M.pbrMetallicRoughness || {}, c = pb.baseColorFactor || [1, 1, 1, 1];
    return { name: M.name, color: c.slice(0, 3), rough: pb.roughnessFactor ?? 1, metal: pb.metallicFactor ?? 1, emissive: M.emissiveFactor || null, pos: r3(bake(acc(p.attributes.POSITION), true)), nor: r3(bake(acc(p.attributes.NORMAL), false)), idx: Array.from(acc(p.indices)) };
  });
  console.log(name, out[name].length, "parts", out[name].reduce((s, p) => s + p.pos.length / 3, 0), "vertices");
}
writeFileSync(new URL("assets.json", dir), JSON.stringify(out));
console.log("assets.json", Math.round(JSON.stringify(out).length / 1024), "KB");
