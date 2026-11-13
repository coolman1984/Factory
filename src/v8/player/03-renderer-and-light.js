  /* ---------- renderer and light ---------- */
  const glideEase=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
  const glideX=s=>MFMotion.glideX(s), glideY=s=>MFMotion.glideY(s);   // V3: height leads the slide, so the 2F lifts off and glides over
  function W(x, y, s = S.stack, up = 0.8, out = new T.Vector3()) { return MFMotion.world(D.plates,[CX,CY],GAP,x,y,s,up,out); }
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas: $("gl"), antialias: true, powerPreference: "high-performance" }); } catch (e) { fail("This browser could not start 3D (WebGL)."); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
  renderer.toneMapping = T.NeutralToneMapping ?? T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = realtimeShadows; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(28, 1, 8, 7000);
  const envScene = window.MFLook.environment(T), pm = new T.PMREMGenerator(renderer);
  const envTarget = pm.fromScene(envScene, .02); scene.environment = envTarget.texture; pm.dispose();
  envScene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  const hemi = new T.HemisphereLight(0xffffff, 0x2a3550, 1), sun = new T.DirectionalLight(0xfff2e0, 2.4); sun.position.set(-420, 720, 340); sun.castShadow = realtimeShadows;
  Object.assign(sun.shadow.camera, { left: -760, right: 760, top: 620, bottom: -620, near: 50, far: 1700 }); sun.shadow.mapSize.set(1536, 1536); sun.shadow.bias = -.0004; sun.shadow.normalBias = .08; sun.shadow.radius = 4;
  scene.add(hemi, sun);
  const grid = new T.GridHelper(2200, 44, 0x24324d, 0x141e33); grid.position.y = -8; scene.add(grid);

