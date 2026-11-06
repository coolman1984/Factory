/* Offline, seeded surface library. Small shared maps; materials may be cloned per plate.
   Finish values and the reflection studio follow Digital Factory's DFMaterials / lightformers. */
"use strict";
(function () {
  const libraries = new WeakMap();
  function library(T) {
    if (libraries.has(T)) return libraries.get(T);
    let seed = 20261106;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const textures = [], presets = {};
    function maps(kind, size) {
      const albedo = new Uint8Array(size * size * 4), rough = albedo.slice(), normal = albedo.slice(), heights = new Float32Array(size * size);
      const tau = Math.PI * 2;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = y * size + x, n = random(), u = x / size, v = y / size;
        const cloud = Math.sin(u * tau + Math.cos(v * tau)) * Math.sin(v * tau * 2 + .7);
        let a = 245, r = 180, h = n * .06;
        if (kind === "concrete") {
          // Sealed slab: broad stains, fine aggregate, and narrow recessed 6 m joints.
          const joint = x % (size / 2) < 1 || y % (size / 2) < 1;
          const stain = Math.max(0, cloud - .25);
          a = 232 + cloud * 6 + n * 8 - stain * 15 - (joint ? 28 : 0);
          r = 146 + n * 12 + stain * 24 + (joint ? 35 : 0); h = n * .08 - (joint ? .55 : 0);
        } else if (kind === "paint") { a = 248 + n * 5; r = 143 + n * 12; h = n * .035; }
        else if (kind === "galvanised") {
          const spangle = Math.sin(Math.floor(u * 22) * 9 + Math.floor(v * 22) * 17);
          a = 222 + spangle * 15 + n * 7; r = 100 + spangle * 16 + n * 12; h = n * .02;
        } else if (kind === "cardboard") { a = 238 + n * 12; r = 229 + n * 12; h = n * .12 + Math.sin(x * tau / 8) * .02; }
        else if (kind === "plastic") { a = 248 + n * 5; r = 166 + n * 12; h = n * .025; }
        else if (kind === "wall") { const seam = x % (size / 4) === 0; a = seam ? 210 : 248 + n * 4; r = 177 + n * 8; h = seam ? -.2 : n * .02; }
        heights[i] = h;
        for (let c = 0; c < 3; c++) { albedo[i * 4 + c] = a; rough[i * 4 + c] = r; }
        albedo[i * 4 + 3] = rough[i * 4 + 3] = 255;
      }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4, dx = heights[y * size + (x + 1) % size] - heights[y * size + (x + size - 1) % size];
        const dy = heights[((y + 1) % size) * size + x] - heights[((y + size - 1) % size) * size + x], len = Math.hypot(dx, dy, 1);
        normal[i] = 128 - dx / len * 127; normal[i + 1] = 128 - dy / len * 127; normal[i + 2] = 128 + 127 / len; normal[i + 3] = 255;
      }
      function texture(bytes, color) {
        const t = new T.DataTexture(bytes, size, size, T.RGBAFormat);
        t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
        t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true;
        t.anisotropy = 4; t.needsUpdate = true; textures.push(t); return t;
      }
      return { map: texture(albedo, true), roughnessMap: texture(rough, false), normalMap: texture(normal, false) };
    }
    const finish = { concrete: [.76, 0, 256], paint: [.95, .08, 128], galvanised: [.85, .95, 128], cardboard: [1, 0, 128], plastic: [.94, 0, 128], wall: [.95, .02, 128] };
    for (const [name, [roughness, metalness, size]] of Object.entries(finish)) {
      presets[name] = new T.MeshStandardMaterial({ ...maps(name, size), roughness, metalness, normalScale: new T.Vector2(name === "concrete" ? .3 : .12, name === "concrete" ? .3 : .12) });
      presets[name].name = "MF " + name;
    }
    const white = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, T.RGBAFormat); white.needsUpdate = true; textures.push(white);
    const result = { presets, textures, white, contacts: new WeakMap() }; libraries.set(T, result); return result;
  }
  function material(T, name, options = {}) {
    const preset = library(T).presets[name];
    if (!preset) throw new Error("Unknown Material Flow finish: " + name);
    return Object.assign(preset.clone(), options);
  }
  function replicaMaterials(T) {
    return {
      paint: material(T, "paint"), metal: material(T, "galvanised"), matte: material(T, "cardboard"),
      glass: new T.MeshStandardMaterial({ transparent: true, opacity: .2, roughness: .08, metalness: 0, depthWrite: false }),
      glow: new T.MeshBasicMaterial({ toneMapped: false })
    };
  }
  function floor(T, width, height) {
    const m = material(T, "concrete"); m.color.setHex(0xc3c7c4);
    for (const key of ["map", "roughnessMap", "normalMap"]) { m[key] = m[key].clone(); m[key].repeat.set(width / 40, height / 40); }
    // The bake uses the full plate UV rectangle, independently of the repeating concrete.
    // Always bind white until a bake arrives: replacing the uniform never recompiles a shader.
    m.userData.floorLight = { value: library(T).white };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.mfFloorLight = m.userData.floorLight;
      shader.vertexShader = "varying vec2 vMfFloorUv;\n" + shader.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\nvMfFloorUv = uv;");
      shader.fragmentShader = "uniform sampler2D mfFloorLight; varying vec2 vMfFloorUv;\n" + shader.fragmentShader.replace("#include <colorspace_fragment>", "#include <colorspace_fragment>\ngl_FragColor.rgb *= texture2D(mfFloorLight, vMfFloorUv).rgb;");   // after tone mapping: the lit floor sits above white, so a shadow applied before it is squeezed away
    };
    m.customProgramCacheKey = () => "mf-floor-light-v2";
    return m;
  }
  // Digital Factory's analytic contact shade, rasterised once per plate. A Blender bake
  // replaces it through the same uniform; there is never an extra scene/depth pass.
  function contactLight(T, key, box, replica) {
    const lib = library(T); let cache = lib.contacts.get(replica);
    if (!cache) { cache = new Map(); lib.contacts.set(replica, cache); }
    if (cache.has(key)) return cache.get(key);
    const stamp = document.createElement("canvas"); stamp.width = stamp.height = 64;
    const sg = stamp.getContext("2d"), pixels = sg.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const dx = Math.max(0, Math.abs(x - 31.5) - 20), dy = Math.max(0, Math.abs(y - 31.5) - 20), i = (y * 64 + x) * 4;
      pixels.data[i + 3] = Math.round(65 * Math.exp(-(dx * dx + dy * dy) / 35));
    }
    sg.putImageData(pixels, 0, 0);
    const [x0, y0, width, height] = box, scale = 512 / Math.max(width, height), cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(width * scale)); cv.height = Math.max(1, Math.round(height * scale));
    const g = cv.getContext("2d"); g.fillStyle = "white"; g.fillRect(0, 0, cv.width, cv.height);
    for (const obj of [...replica.racks, ...replica.machines]) {
      if (obj.plate !== key) continue;
      const margin = 3;
      g.drawImage(stamp, (obj.x - x0 - margin) * scale, (obj.y - y0 - margin) * scale, (obj.w + margin * 2) * scale, (obj.h + margin * 2) * scale);
    }
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.name = "MF contact " + key;
    cache.set(key, tex); return tex;
  }
  function environment(T) {
    const s = new T.Scene(), PI = Math.PI;
    const room = new T.Mesh(new T.BoxGeometry(64, 32, 64), new T.MeshBasicMaterial({ color: 0x4a5059, side: T.BackSide })); room.position.y = 11; s.add(room);
    function panel(w, h, x, y, z, rx, ry, k, color = 0xffffff) {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(k), side: T.DoubleSide }));
      m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
    }
    for (const x of [-14, -4.5, 4.5, 14]) panel(2.4, 46, x, 26.5, 0, PI / 2, 0, 5.5);
    panel(18, 11, -31, 11, -6, 0, PI / 2, 3.2, 0xeef4ff); panel(14, 9, 31, 9, 9, 0, -PI / 2, 2.2, 0xffe6c8);
    panel(34, 5, 0, 4.5, -31, 0, 0, 1.6, 0xdce6ff); panel(20, 4, 0, 2.5, 31, 0, PI, 1.1);
    return s;
  }
  window.MFLook = { material, replicaMaterials, floor, contactLight, environment, textures: T => library(T).textures };
})();
