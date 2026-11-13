  /* ---------- plates: slab, clean replica plan, original plan ---------- */
  const plates = {}, floors = [], origs = [], originalLoads = [], loader = new T.TextureLoader();
  const plateEntries = Object.entries(D.plates);
  function floorShape(key,cx,cy,w,h){
    const s=new T.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);s.lineTo(-w/2,h/2);s.closePath();
    if(D.plates[key].lift)for(const l of RP.lifts.filter(l=>l.plate===key)){
      const x=l.x-cx,z=-(l.y-cy),p=new T.Path();p.moveTo(x-.25,z+.25);p.lineTo(x-.25,z-l.h-.25);p.lineTo(x+l.w+.25,z-l.h-.25);p.lineTo(x+l.w+.25,z+.25);p.closePath();s.holes.push(p);
    }return s;
  }
  function floorGeometry(key,cx,cy,w,h,slab=false){
    const s=floorShape(key,cx,cy,w,h),g=slab?new T.ExtrudeGeometry(s,{depth:6,bevelEnabled:false}):new T.ShapeGeometry(s);
    if(!slab){const p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/w+.5,p.getY(i)/h+.5);}
    return g;
  }
  for (const [key, P] of plateEntries) {
    const g = new T.Group(); scene.add(g); plates[key] = g;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const pic of P.pics) {
      let loaded, failed; originalLoads.push(new Promise((resolve, reject) => { loaded = resolve; failed = reject; }));
      const tex = loader.load(window.MF_PLANS[pic.file], loaded, undefined, failed); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }), m = new T.Mesh(floorGeometry(key,pic.x+pic.w/2,pic.y+pic.h/2,pic.w,pic.h), mat);
      if (pic.uv) { const uv = m.geometry.attributes.uv, [u0, v0, u1, v1] = pic.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); }
      m.rotation.x = -Math.PI / 2; m.position.set(pic.x + pic.w / 2 - CX, .3, pic.y + pic.h / 2 - CY); g.add(m); origs.push(m);
      minX = Math.min(minX, pic.x); minY = Math.min(minY, pic.y); maxX = Math.max(maxX, pic.x + pic.w); maxY = Math.max(maxY, pic.y + pic.h);
    }
    const w = maxX - minX, h = maxY - minY; P.box = [minX, minY, w, h];
    const slab = new T.Mesh(floorGeometry(key,minX+w/2,minY+h/2,w+8,h+8,true), new T.MeshStandardMaterial({ color: 0x56627a, roughness: .7 })); slab.rotation.x=-Math.PI/2; slab.position.set(minX + w / 2 - CX, -6.2, minY + h / 2 - CY); slab.receiveShadow = true; g.add(slab);
    const art = new T.Mesh(floorGeometry(key,minX+w/2,minY+h/2,w,h), new T.MeshStandardMaterial({ color: 0xc9ced6, roughness: .78, metalness: 0 })); art.rotation.x = -Math.PI / 2; art.position.set(minX + w / 2 - CX, .12, minY + h / 2 - CY); art.receiveShadow = true; g.add(art);
    const planMaterial = art.material, surfaceMaterial = window.MFLook.floor(T, w, h);
    art.name = "MF floor " + key; slab.name = "MF slab " + key; planMaterial.name = "MF plan " + key; surfaceMaterial.name = "MF surface " + key;
    surfaceMaterial.userData.floorLight.value = window.MFLook.contactLight(T, key, P.box, RP);
    floors.push({ art, slab, key, box: P.box, planMaterial, surfaceMaterial, reflW: 0 }); P.art = art;
  }
  const REP = window.MFReplica.build({ T, plates, R: RP, CX, CY, info: D.plates, plateOf });
  // Sweep in the vertex shader: immutable instance buffers throughout the rise.
  const RISE_START=Math.min(...ZONES.map(([,z])=>z[0]))-40,RISE_END=Math.max(...ZONES.map(([,z])=>z[2]))+40,RISE_BAND=Math.max(80,(RISE_END-RISE_START)*.12);
  const riseUniform = { value: 0 }, riseMaterials = new Set();
  // Idempotent: patches every replica material once. Called now, and again after REP.ready
  // (glTF parts may add instanced meshes/materials later; REP.meshes stays the one list).
  function bindReplicaMeshes() {
    for (const { im } of REP.meshes) {
      const m = im.material; if (riseMaterials.has(m)) continue; riseMaterials.add(m);
      const previous = m.onBeforeCompile.bind(m), oldKey = m.customProgramCacheKey.bind(m), key = oldKey();
      m.onBeforeCompile = shader => {
        previous(shader); shader.uniforms.mfRise = riseUniform;
        const factor = `float mfK = mfRise >= 1.0 ? 1.0 : max(0.004, smoothstep(0.0, 1.0, (${RISE_START.toFixed(3)} + mfRise * ${(RISE_END-RISE_START+RISE_BAND).toFixed(3)} - (instanceMatrix[3].x + ${CX.toFixed(3)})) / ${RISE_BAND.toFixed(3)}));`;
        shader.vertexShader = "uniform float mfRise;\n" + shader.vertexShader
          .replace("void main() {", "void main() {\n" + factor)
          .replace("#include <defaultnormal_vertex>", "objectNormal.y /= mfK;\n#include <defaultnormal_vertex>")
          .replace("#include <project_vertex>", T.ShaderChunk.project_vertex.replace("mvPosition = instanceMatrix * mvPosition;", "mvPosition = instanceMatrix * mvPosition; mvPosition.y *= mfK;"));
      };
      m.customProgramCacheKey = () => key + "|mf-rise-v1";
    }
    for (const fl of floors) {
      fl.dimMaterials = [];
      for (const { im } of REP.meshes) if (im.material.userData.dim && im.material.userData.plate === fl.key && !fl.dimMaterials.includes(im.material)) fl.dimMaterials.push(im.material);
      fl.lastDim = null;   // re-apply the current dim level to any late material
    }
  }
  let replicaVisible = null;
  // Roof switch: the lead's REP.setRoof(on) owns the geometry; absent API = silent no-op. The rise override below forces every
  // replica mesh visible again when the factory appears, so the roof state is re-applied right after that pass.
  const hasRoof = () => typeof REP.setRoof === "function";
  function applyRoof() { if (hasRoof()) REP.setRoof(S.roof); }
  REP.rise = value => {
    riseUniform.value = value; const show = value > .004;
    if (replicaVisible !== show) { replicaVisible = show; for (let i = 0; i < REP.meshes.length; i++) REP.meshes[i].im.visible = show; if (show) applyRoof(); }
    metrics.riseUpdates++;
  };
  bindReplicaMeshes();
  // Conservative overhead flight envelope. Measure full-height instance geometry once, not per frame.
  // The upper floor can slide under the camera during a lift; reserve its entire height at every X/Z.
  let chaseEnvelope;
  const highestFloor = plateEntries.reduce((h, [, p]) => Math.max(h, p.lift * GAP), 0);
  function prepareChaseEnvelope() {
    const boxes = [{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 18, maxZ: 1 }]; // gates/cabin
    for (const { im } of REP.meshes) {
      im.computeBoundingBox(); const b = im.boundingBox;
      if (b && !b.isEmpty()) boxes.push({ minX: b.min.x, minY: b.min.y, minZ: b.min.z, maxX: b.max.x, maxY: b.max.y, maxZ: b.max.z });
    }
    if (DEV) for (const g of Object.values(DEV.groups || {})) g.traverse((o) => { if (!o.isInstancedMesh) return; o.computeBoundingBox(); const b = o.boundingBox; if (b && !b.isEmpty()) boxes.push({ minX: b.min.x, minY: b.min.y, minZ: b.min.z, maxX: b.max.x, maxY: b.max.y, maxZ: b.max.z }); });   // V5 gates and PCs
    chaseEnvelope = window.CameraEnvelope.makeEnvelope(boxes);
  }
  function protectChaseEye(eye) {
    const offset = highestFloor * glideY(S.stack);
    eye.y -= offset;
    try { return offset + chaseEnvelope.protect(eye, camera.near, camera.fov, camera.aspect, 1 / PT_M); }
    finally { eye.y += offset; }
  }
  prepareChaseEnvelope();
  // Vehicles are lead-owned. REP.vehicleAt (physical, story-time) is used through REP.live as the lead
  // defines it; when that API is absent the original REP.live runs untouched. The player no longer
  // overrides REP.live, so there is no nearby-sample heading and no second time scaling for the physical API.
  const physicalVehicles = typeof REP.vehicleAt === "function";
  metrics.vehicleAPI = physicalVehicles; metrics.liveFallback = !physicalVehicles;
  REP.live(0, 1, 0);
  const planTex = {};
  function prepareArt() {
    const start = performance.now();
    // drawPlan is lead-owned. Bound GPU uploads here and release the large temporary source.
    for (const dark of [false, true]) for (const f of floors) {
      const source = window.MFReplica.drawPlan(RP, f.key, f.box, dark), scale = Math.min(1, 2048 / Math.max(source.width, source.height));
      const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(source.width * scale)); cv.height = Math.max(1, Math.round(source.height * scale));
      cv.getContext("2d").drawImage(source, 0, 0, cv.width, cv.height); source.width = source.height = 0;
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      planTex[f.key + dark] = tex; renderer.initTexture(tex);
    }
    event("prepare-plan-art", start);
  }
  function setArt(dark) { for (const f of floors) { f.planMaterial.map = planTex[f.key + dark]; } }
  function setFloorLight(key, source) {
    const fl = floors.find(f => f.key === key); if (!fl) throw new Error("Unknown plate: " + key);
    if (fl.lightSource === source && fl.lightPromise) return fl.lightPromise;
    fl.lightSource = source; const request = fl.lightRequest = (fl.lightRequest || 0) + 1;
    function apply(tex, owned) {
      if (request !== fl.lightRequest) { if (owned) tex.dispose(); return tex; }
      if (owned) tex.colorSpace = T.SRGBColorSpace;
      if (fl.loadedLight && fl.loadedLight !== tex) fl.loadedLight.dispose();
      fl.loadedLight = owned ? tex : null; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); renderer.initTexture(tex);
      fl.surfaceMaterial.userData.floorLight.value = tex; return tex;
    }
    fl.lightPromise = source?.isTexture ? Promise.resolve(apply(source, false)) : new Promise((resolve, reject) => loader.load(source, tex => Promise.resolve(window.MF7_CLEAN_LIGHT ? window.MF7_CLEAN_LIGHT(tex, key, fl.box) : tex).then(t => resolve(apply(t, true)), reject), undefined, error => { if (request === fl.lightRequest) fl.lightPromise = null; reject(error); }));
    return fl.lightPromise;
  }
  // a deck that carries an upper floor's route out of its plate to a destination beyond it, and solid destination blocks (schematic)
  const deck = new T.Group();
  const inZone = (z, p) => z && p[0] >= z[0] && p[0] <= z[2] && p[1] >= z[1] && p[1] <= z[3];
  for (const f of D.flows) for (const s of f.steps) {
    const n = D.nodes[s.node]; if (!n || n.kind !== "dest" || !Array.isArray(s.path)) continue;
    const k = plateOf(s.path[0][0], s.path[0][1]), b = D.plates[k].box, z = [b[0] + 1.5, b[1], b[0] + b[2], b[1] + b[3]]; if (!D.plates[k].lift) continue;   // b = drawn extent [x, y, w, h]
    if (!deck.parent) plates[k].add(deck);
    for (let i = 1; i < s.path.length; i++) { const a = s.path[i - 1], b = s.path[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 9; if (inZone(z, a) && inZone(z, b)) continue; const m = new T.Mesh(new T.BoxGeometry(len, 3, 9), new T.MeshStandardMaterial({ color: 0x41506e, roughness: .6, metalness: .3 })); m.position.set((a[0] + b[0]) / 2 - CX, -1.5, (a[1] + b[1]) / 2 - CY); m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); m.castShadow = true; deck.add(m); }
  }
  let gates = [];
  const buildGates = () => gates=Object.values(D.nodes).filter(n=>n.kind==='dest').map(n=>{
    const g=new T.Group(),mat=new T.MeshStandardMaterial({color:0x156082,roughness:.4,metalness:.2});
    let horizontal=false;for(const f of D.flows)for(const s of f.steps)if(Array.isArray(s.path)){
      const p=s.path;if(Math.hypot(p[0][0]-n.x,p[0][1]-n.y)<.01)horizontal=Math.abs(p[1][0]-p[0][0])>.01;
      if(Math.hypot(p.at(-1)[0]-n.x,p.at(-1)[1]-n.y)<.01)horizontal=Math.abs(p.at(-1)[0]-p.at(-2)[0])>.01;
    }
    for(const x of [-8,8]){const p=new T.Mesh(new T.BoxGeometry(1,16,1),mat);p.position.set(horizontal?0:x,0,horizontal?x:0);g.add(p);}
    const head=new T.Mesh(new T.BoxGeometry(horizontal?1:17,1,horizontal?17:1),mat);head.position.y=8;g.add(head);g.userData.n=n;scene.add(g);return g;
  });
  buildGates();
  // Elevators: a project can have several; each flow uses the elevator its lift step names (at most one lift per flow),
  // and E is the elevator of the flow on screen (setFlow switches it).
  const ELEVATORS = D.elevators || (D.elevator ? [D.elevator] : []);
  const elevatorFor = (f) => { const s = f.steps.find((x) => x.lift); return (s && ELEVATORS.find((e) => e.label === s.elevator)) || ELEVATORS[0] || null; };
  let E = ELEVATORS[0] || { label: "", low: [CX, CY], high: [CX, CY] };
  // V2 elevator: the shaft between the floors (same footprint as the plan lift) and a car sized to the lift and the trolley
  const liftMat = { steel: new T.MeshStandardMaterial({ color: 0x5d6775, metalness: .75, roughness: .32 }), yellow: new T.MeshStandardMaterial({ color: 0xffc000, metalness: .2, roughness: .42 }),
    glass: new T.MeshPhysicalMaterial({ color: 0xa8d8ff, roughness: .06, metalness: 0, transparent: true, opacity: .14, depthWrite: false, side: T.DoubleSide }),
    floor: new T.MeshStandardMaterial({ color: 0x39424e, metalness: .55, roughness: .45 }), lamp: new T.MeshBasicMaterial({ color: new T.Color(0xfff1c8).multiplyScalar(2.4), toneMapped: false }) };
  const liftUnit = new T.BoxGeometry(1, 1, 1), liftPart = (g, m, shadow = true) => { const o = new T.Mesh(liftUnit, m); o.castShadow = shadow && m !== liftMat.glass; o.receiveShadow = m !== liftMat.glass; g.add(o); return o; };
  const shaft = new T.Group(), shaftPosts = [0, 1, 2, 3].map(() => liftPart(shaft, liftMat.steel)), shaftPanes = [0, 1, 2, 3].map(() => liftPart(shaft, liftMat.glass)), shaftBands = [];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) shaftBands.push(liftPart(shaft, liftMat.yellow, false));
  scene.add(shaft);
  const cabin = new T.Group(), carFloor = liftPart(cabin, liftMat.floor), carPosts = [0, 1, 2, 3].map(() => liftPart(cabin, liftMat.steel)), carWalls = [0, 1].map(() => liftPart(cabin, liftMat.glass)),
    carRails = [0, 1].map(() => liftPart(cabin, liftMat.yellow)), carHeads = [0, 1].map(() => liftPart(cabin, liftMat.yellow)), carRoof = liftPart(cabin, liftMat.steel), carLamp = liftPart(cabin, liftMat.lamp, false);
  scene.add(cabin);
  const liftSize = new Map();   // elevator label -> [shaft half x, half z, car half x, half z]
  function liftDims(e) {
    let s = liftSize.get(e.label); if (s) return s;
    let best = null, bd = 40; for (const l of RP.lifts || []) { const dd = Math.hypot(l.x + l.w / 2 - e.low[0], l.y + l.h / 2 - e.low[1]); if (dd < bd) { bd = dd; best = l; } }
    const m = lot.userData.model; let th = 5; if (m) { const b = new T.Box3(), r = lot.rotation.y; lot.rotation.y = 0; lot.updateMatrixWorld(true); b.setFromObject(m); lot.rotation.y = r; lot.updateMatrixWorld(true); th = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2; }
    const hx = best ? best.w / 2 : 15, hz = best ? best.h / 2 : 15, cx = Math.max(hx - 1.6, th + .6), cz = Math.max(hz - 1.6, th + .6);
    s = [Math.max(hx, cx + 1.2), Math.max(hz, cz + 1.2), cx, cz]; if (m) liftSize.set(e.label, s); return s;
  }
  function liftShape(lo, hi) {
    const [hx, hz, cx, cz] = liftDims(E), y0 = lo.y - .8 + 7.4 / .3, h = Math.max(.2, hi.y - .8 - y0);   // the plan lifts stand 7.4 m on the lower floor
    shaft.position.set((lo.x + hi.x) / 2, y0, (lo.z + hi.z) / 2);
    shaftPosts.forEach((p, k) => { p.position.set((k & 1 ? 1 : -1) * hx, h / 2, (k & 2 ? 1 : -1) * hz); p.scale.set(.95, h, .95); });
    shaftPanes.forEach((p, k) => { const side = k < 2, s = k & 1 ? 1 : -1; p.position.set(side ? 0 : s * hx, h / 2, side ? s * hz : 0); p.scale.set(side ? 2 * hx : .12, h, side ? .12 : 2 * hz); });
    shaftBands.forEach((p, i) => { const r = i >> 2, k = i & 3, side = k < 2, s = k & 1 ? 1 : -1; p.position.set(side ? 0 : s * hx, h * (r + 1) / 4, side ? s * hz : 0); p.scale.set(side ? 2 * hx + .95 : .5, .45, side ? .5 : 2 * hz + .95); });
    const usedDoors=RP.lifts.filter(l=>l.label===E.label||Math.hypot(l.x+l.w/2-E.low[0],l.y+l.h/2-E.low[1])<5).flatMap(l=>l.doors||[]);
    carWalls.forEach((p,k)=>p.visible=!usedDoors.includes(k?'e':'w'));carRails.forEach((p,k)=>p.visible=!usedDoors.includes(k?'e':'w'));
    const H = 3.4 / .3;   // car 3.4 m high (one replica metre is 1 / 0.3 plan units)
    carFloor.position.set(0, -.3, 0); carFloor.scale.set(2 * cx, .6, 2 * cz);
    carPosts.forEach((p, k) => { p.position.set((k & 1 ? 1 : -1) * cx, H / 2, (k & 2 ? 1 : -1) * cz); p.scale.set(.6, H, .6); });
    carWalls.forEach((p, k) => { p.position.set((k ? 1 : -1) * cx, H / 2, 0); p.scale.set(.1, H, 2 * cz); });
    carRails.forEach((p, k) => { p.position.set((k ? 1 : -1) * cx, 3.6, 0); p.scale.set(.35, .35, 2 * cz); });
    carHeads.forEach((p, k) => { p.position.set(0, H - .3, (k ? 1 : -1) * cz); p.scale.set(2 * cx + .6, .6, .5); });
    carRoof.position.set(0, H + .2, 0); carRoof.scale.set(2 * cx + .6, .4, 2 * cz + .6); carLamp.position.set(0, H - .05, 0); carLamp.scale.set(cx, .12, cz);
  }
  const lot = new T.Group(); let trolleyReady, contactBlob = null;
  { // the hero: Blender's trolley with rear covers, 1.4x real size so it stays readable, on a soft contact shadow
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 8, 64, 64, 62); r.addColorStop(0, "rgba(10,14,24,.62)"); r.addColorStop(.6, "rgba(10,14,24,.3)"); r.addColorStop(1, "rgba(10,14,24,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const blob = new T.Mesh(new T.PlaneGeometry(8, 11).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false })); blob.position.y = .35; lot.add(blob); contactBlob = blob;
    const bytes = Uint8Array.from(atob(window.MF_TROLLEY), (ch) => ch.charCodeAt(0));
    trolleyReady = new Promise((ok, no) => new T.X.GLTFLoader().parse(bytes.buffer, "", (gl) => { gl.scene.scale.setScalar(1 / PT_M);
      const bb=new T.Box3().setFromObject(gl.scene); gl.scene.position.x-=(bb.min.x+bb.max.x)/2; gl.scene.position.z-=(bb.min.z+bb.max.z)/2; gl.scene.position.y-=bb.min.y;
      lot.add(gl.scene); lot.userData.model=gl.scene; ok(); }, (e) => { fail("The trolley model could not load: " + e.message); no(e); })); }
  scene.add(lot);
  const beacon = new T.Mesh(new T.RingGeometry(9, 11, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: new T.Color(0x8fdcff).multiplyScalar(3), toneMapped: false, transparent: true, depthWrite: false, side: T.DoubleSide })); beacon.renderOrder = 7; scene.add(beacon);
  // atmosphere: Digital Factory's light shafts and dust
  const [lx0, ly0, lx1, ly1] = D.lampArea || [60, 190, 520, 480];   // light shafts over the main hall
  const lamps = []; for (let x = lx0; x < lx1; x += 70) for (let y = ly0; y < ly1; y += 62) lamps.push([x - CX, 46, y - CY]);
  const sceneBeforeAtmos = new Set(scene.children);   // whatever DFAtmos adds to the scene is hidden while the floor reflection renders
  const atmos = null;   // V6: no light shafts / dust (owner)
  const atmosObjects = scene.children.filter(o => !sceneBeforeAtmos.has(o));

