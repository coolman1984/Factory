// Reads the Blender GLBs and packs each primitive (positions, normals, indices, PBR values) into private/assets/assets.json.
// Plain arrays load synchronously, so instancing needs no async loader at start-up.
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../private/assets/", import.meta.url), out = {};
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3 }, BYTES = { 5126: 4, 5123: 2, 5125: 4, 5121: 1 };
for (const name of ["injection", "forklift", "truck", "press", "agv", "utility", "pallet"]) {
  const b = readFileSync(new URL(name + ".glb", dir)), jl = b.readUInt32LE(12), J = JSON.parse(b.subarray(20, 20 + jl).toString()), bin = b.subarray(20 + jl + 8);
  const acc = (i) => { const a = J.accessors[i], v = J.bufferViews[a.bufferView], off = (v.byteOffset || 0) + (a.byteOffset || 0), n = a.count * SIZE[a.type], C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType]; return new C(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * BYTES[a.componentType])); };
  const r3 = (a) => Array.from(a, (x) => Math.round(x * 1000) / 1000);
  out[name] = J.meshes.flatMap((m) => m.primitives).map((p) => {
    const M = J.materials[p.material], pb = M.pbrMetallicRoughness || {}, c = pb.baseColorFactor || [1, 1, 1, 1];
    return { name: M.name, color: c.slice(0, 3), rough: pb.roughnessFactor ?? 1, metal: pb.metallicFactor ?? 0, emissive: M.emissiveFactor || null, pos: r3(acc(p.attributes.POSITION)), nor: r3(acc(p.attributes.NORMAL)), idx: Array.from(acc(p.indices)) };
  });
  console.log(name, out[name].length, "parts", out[name].reduce((s, p) => s + p.pos.length / 3, 0), "vertices");
}
writeFileSync(new URL("assets.json", dir), JSON.stringify(out));
console.log("assets.json", Math.round(JSON.stringify(out).length / 1024), "KB");
