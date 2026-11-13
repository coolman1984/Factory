  /* ---------- looks ---------- */
  // Studio is the bright clean factory: light grey-blue room, soft sky/ground fill and a stronger (still rough, never mirror)
  // environment reflection. gain = route-light emissive multiplier (Night pushes it over the bloom threshold).
  // The table is exposed as MF.LOOK so the lead can tune env/exp on a real GPU and call MF.setLook(name) again.
  const LOOK = { studio: { bg: 0xd3dce7, ground: 0x929cab, hemi: .85, sun: 2.1, exp: 1, dark: false, env: .8, air: false, gain: 1, grid: false }, night: { bg: 0x05080f, ground: 0x2a3550, hemi: .22, sun: .35, exp: 1.25, dark: true, env: .22, air: true, gain: 3.2, grid: true }, blueprint: { bg: 0x071630, ground: 0x2a3550, hemi: 1.2, sun: 0, exp: 1, dark: true, env: .1, air: false, gain: 1.2, grid: true } };
  function setLook(k) {
    const L = LOOK[k]; if (!L) return; const start = performance.now(); S.look = k; $("look").value = k; document.body.dataset.look = k; scene.background = new T.Color(L.bg); const fogK = Math.max(1, (D.fit ? D.fit[0] : 330) / 330, (D.fit ? D.fit[1] : 560) / 560); scene.fog = new T.Fog(L.bg, 1400 * fogK, 3200 * fogK); hemi.intensity = L.hemi; hemi.groundColor.setHex(L.ground); grid.visible = L.grid; sun.intensity = L.sun; renderer.toneMappingExposure = L.exp; scene.environmentIntensity = L.env; routeU.gain.value = L.gain; setArt(L.dark); atmos?.set(L.air); atmos?.theme(L.dark);
    for (const m of riseMaterials) m.wireframe = k === "blueprint";
    for (const f of floors) f.surfaceMaterial.wireframe = k === "blueprint";
    shadowDirty = true; event("look-" + k, start);
  }
  let shadowDirty = true;

