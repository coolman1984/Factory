/* DFAtmos: cheap atmosphere for big interiors, two draw calls in all.
   - Light shafts: one instanced open cone under each high-bay light, additive, brightest at the lamp and fading to the
     floor, soft at its silhouette (the view-angle term) so it reads as lit haze rather than a solid cone.
   - Dust: points in a box that travels with the camera and wraps around it, drifting and catching the light; it looks
     endless and costs the same anywhere in the plant.
   Neither writes depth, both follow the scene fog, and both are off unless the page turns them on. */
(function () {
  function shafts(T, lamps, o = {}) {
    const H = o.height || 9.6, geo = new T.CylinderGeometry(o.top || 0.35, o.bottom || 2.8, H, 20, 1, true);
    geo.translate(0, -H / 2, 0);
    const mat = new T.ShaderMaterial({
      uniforms: { color: { value: new T.Color(o.color ?? 0xFFF2DC) }, intensity: { value: o.intensity ?? 0.05 }, height: { value: H }, time: { value: 0 } },
      vertexShader: `uniform float height; varying float vH; varying vec3 vN; varying vec3 vV; varying float vSeed;
        void main() {
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vH = clamp(-position.y / height, 0.0, 1.0);
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz);
          uint h = uint(int(instanceMatrix[3].x * 7.0)) * 747796405u ^ uint(int(instanceMatrix[3].z * 13.0)) * 2891336453u;   // PCG, not a sine hash
          h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u; vSeed = float(((h >> 22u) ^ h) & 65535u) / 65535.0;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `uniform vec3 color; uniform float intensity, time; varying float vH; varying vec3 vN; varying vec3 vV; varying float vSeed;
        void main() {
          float facing = pow(abs(dot(vN, vV)), 1.6);              // soft at the silhouette
          float fall = (1.0 - vH) * (1.0 - vH);                   // brightest at the lamp
          float breathe = 0.85 + 0.15 * sin(time * 0.6 + vSeed * 6.283);
          gl_FragColor = vec4(color * intensity * facing * fall * breathe, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
    });
    const m = new T.InstancedMesh(geo, mat, lamps.length), q = new T.Matrix4();
    lamps.forEach((p, i) => { q.makeTranslation(p[0], p[1], p[2]); m.setMatrixAt(i, q); });
    m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.renderOrder = 5; m.raycast = () => {};
    return m;
  }
  function dust(T, o = {}) {
    const N = o.count || 3500, B = o.box || [60, 10, 60], pos = new Float32Array(N * 3), seed = new Float32Array(N);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) { pos[i * 3] = r() * B[0]; pos[i * 3 + 1] = r() * B[1]; pos[i * 3 + 2] = r() * B[2]; seed[i] = r(); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('seed', new T.BufferAttribute(seed, 1));
    const mat = new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, box: { value: new T.Vector3(...B) }, origin: { value: new T.Vector3() }, color: { value: new T.Color(o.color ?? 0xFFF6E8) }, size: { value: o.size || 0.016 }, scale: { value: 600 }, alpha: { value: o.alpha ?? 0.55 } },
      vertexShader: `attribute float seed; uniform float time, size, scale; uniform vec3 box, origin; varying float vA;
        void main() {
          vec3 p = position + vec3(sin(time * 0.11 + seed * 40.0) * 0.6, time * (0.04 + seed * 0.05), cos(time * 0.09 + seed * 23.0) * 0.6);
          p = origin + mod(p - origin, box);                           // wrap inside the box that follows the camera
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z; vA = smoothstep(0.5, 2.0, d) * (1.0 - smoothstep(box.x * 0.35, box.x * 0.5, d));
          gl_PointSize = size * scale / max(d, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 color; uniform float alpha; varying float vA;
        void main() { vec2 c = gl_PointCoord - 0.5; float m = smoothstep(0.5, 0.15, length(c)); gl_FragColor = vec4(color, m * vA * alpha); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    const pts = new T.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 6; pts.raycast = () => {};
    return pts;
  }
  function create(T, scene, o = {}) {
    const group = new T.Group(); group.name = 'atmosphere'; group.visible = false;
    const sh = shafts(T, o.lamps || [], o.shafts || {}), du = dust(T, o.dust || {});
    group.add(sh, du); scene.add(group);
    const B = du.material.uniforms.box.value;
    return {
      group,
      set(v) { group.visible = !!v; },
      get on() { return group.visible; },
      update(t, camera, ppx) {
        if (!group.visible) return;
        sh.material.uniforms.time.value = t; du.material.uniforms.time.value = t;
        du.material.uniforms.origin.value.set(camera.position.x - B.x / 2, Math.max(0, camera.position.y - B.y / 2), camera.position.z - B.z / 2);
        if (ppx) du.material.uniforms.scale.value = ppx;
      },
      theme(dark) { sh.material.uniforms.intensity.value = dark ? 0.12 : 0.06; du.material.uniforms.alpha.value = dark ? 0.55 : 0.35; },
      dispose() { group.removeFromParent(); sh.geometry.dispose(); sh.material.dispose(); sh.dispose && sh.dispose(); du.geometry.dispose(); du.material.dispose(); }
    };
  }
  window.DFAtmos = { create };
})();
