  /* ---------- a persistent, bounded post chain (night bloom only) ---------- */
  let composer = null, bloom = null;
  function buildPost() {
    if (composer) return; // never allocate passes during quality, look or resize changes
    const rt = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 0 });
    composer = new T.EffectComposer(renderer, rt); composer.addPass(new T.RenderPass(scene, camera));
    bloom = new T.UnrealBloomPass(new T.Vector2(1, 1), .25, .45, 2.2);
    composer.addPass(bloom); composer.addPass(new T.OutputPass());
  }
  // Backdrop blur is opt-in (body.blur) and forced off on Low by CSS (body.q-low).
  function syncQualityClasses() { document.body.classList.toggle("q-low", S.quality === "low"); document.body.classList.toggle("blur", S.blur && S.quality !== "low"); }
  function setQuality(q, manual = true) {
    if (!["high", "medium", "low"].includes(q)) return;
    if (q === S.quality && resolutionScale === 1) { manualQuality = manual; syncQualityClasses(); return; }
    const start = performance.now(); manualQuality = manual; S.quality = q; resolutionScale = 1; $("quality").value = q; syncQualityClasses(); resize(); event("quality-" + q, start);
  }

