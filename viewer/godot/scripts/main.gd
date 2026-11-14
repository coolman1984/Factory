# Real Factory: builds the factory at runtime from a Control Center scene package (true CAD metres) and the model library,
# then hands the timeline to the director (camera + film time) and the HUD. Site frame (x east, y north, metres) maps to
# Godot as (x, z_up, -y). Run: godot --path viewer/godot -- --scene=<scene.json> --assets=<dir> [--movie] [--quality=1..3]
extends Node3D

var args := {}
var pack := {}
var assets_dir := ""
var quality := 3
var movie := false
var mesh_cache := {}
var steps: Array = []
var step_start_dist: Array = []
var route_pts: Array = []          # all route points (site, Vector2)
var route_cum: Array = []          # cumulative distance at each route point
var route_mat: ShaderMaterial
var engine_time := 0.0
var cam: Camera3D
var trolley: Node3D
var operator_node: Node3D
var agv: Node3D
var gates: Array = []              # [{pos: Vector2, light: OmniLight3D}]
var cranes: Array = []             # [{node, base: Vector3, phase}]
var site_center := Vector2.ZERO
var site_extent := Vector2(200, 200)
var stop_pos := {}
var pose := {"p": Vector2.ZERO, "dir": Vector2.RIGHT, "mode": "push", "moving": false, "step": 0, "dist": 0.0, "u": 0.0}

func P(x: float, y: float, z := 0.0) -> Vector3: return Vector3(x, z, -y)
func V2(a) -> Vector2: return Vector2(float(a[0]), float(a[1]))

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv: PackedStringArray = a.trim_prefix("--").split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	movie = args.has("movie")
	quality = int(args.get("quality", "3"))
	var txt := FileAccess.get_file_as_string(args.get("scene", ""))
	pack = JSON.parse_string(txt) if txt != "" else {}
	if pack == null or pack.is_empty():
		push_error("scene package not found: " + str(args.get("scene", "")))
		get_tree().quit(2)
		return
	assets_dir = args.get("assets", ProjectSettings.globalize_path("res://").path_join("../assets"))
	steps = pack["path"]["steps"]
	_bounds()
	_environment()
	_ground_and_buildings()
	if not args.has("skip_cad"): _cad_layers()
	if not args.has("skip_objects"): _objects()
	_route_and_stops()
	_actors()
	cam = Camera3D.new()
	cam.near = 0.05
	cam.far = 3000.0
	var ca := CameraAttributesPractical.new()
	ca.auto_exposure_enabled = false
	ca.auto_exposure_scale = 0.38
	ca.auto_exposure_speed = 1.4
	ca.auto_exposure_min_sensitivity = 50.0
	ca.auto_exposure_max_sensitivity = 1600.0
	cam.attributes = ca
	add_child(cam)
	cam.current = true
	var director = load("res://scripts/director.gd").new()
	director.name = "Director"
	add_child(director)
	director.setup(self)
	var hud = load("res://scripts/hud.gd").new()
	hud.name = "HUD"
	add_child(hud)
	hud.setup(self, director)

func _bounds() -> void:
	var mn := Vector2(1e9, 1e9)
	var mx := Vector2(-1e9, -1e9)
	for b in pack["buildings"]:
		var c := V2(b["center"])
		var s := Vector2(float(b["size"][0]), float(b["size"][1]))
		mn = mn.min(c - s / 2)
		mx = mx.max(c + s / 2)
	site_center = (mn + mx) / 2
	site_extent = mx - mn
	for s in pack["stops"]:
		stop_pos[s["id"]] = V2(s["pos"])

# ------------------------------------------------------------------ look
func _environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.36, 0.56, 0.86)
	sm.sky_horizon_color = Color(0.86, 0.91, 0.97)
	sm.ground_horizon_color = Color(0.70, 0.72, 0.74)
	sm.ground_bottom_color = Color(0.32, 0.33, 0.35)
	sm.sky_curve = 0.13
	sm.sun_angle_max = 22.0
	sky.sky_material = sm
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.5
	env.ambient_light_sky_contribution = 0.55
	env.ambient_light_color = Color(0.86, 0.85, 0.83)
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = float(args.get("exposure", "0.8"))
	env.tonemap_white = 6.0
	env.ssao_enabled = true
	if quality < 2:
		get_viewport().scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR
		get_viewport().scaling_3d_scale = 0.8
		get_viewport().msaa_3d = Viewport.MSAA_DISABLED
		RenderingServer.directional_shadow_atlas_set_size(4096, true)
	env.ssao_radius = 1.4
	env.ssao_intensity = 2.4
	env.ssao_power = 1.7
	env.ssao_detail = 0.6
	env.ssil_enabled = quality >= 2
	env.ssil_intensity = 0.8
	env.ssr_enabled = quality >= 2
	env.ssr_max_steps = 56
	env.ssr_fade_in = 0.2
	env.ssr_fade_out = 2.5
	env.glow_enabled = true
	env.glow_intensity = 0.35
	env.glow_strength = 1.0
	env.glow_bloom = 0.0
	env.glow_hdr_threshold = 2.2
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	env.fog_enabled = true   # very light distance haze only
	env.fog_light_color = Color(0.86, 0.90, 0.96)
	env.fog_density = 0.00025
	env.fog_aerial_perspective = 0.0
	env.fog_sky_affect = 0.0
	env.sdfgi_enabled = quality >= 4   # SDFGI only on request: SSIL + SSAO give clean contact light on this GPU
	env.sdfgi_cascades = 4
	env.sdfgi_min_cell_size = 0.4
	env.sdfgi_energy = 0.55
	env.sdfgi_use_occlusion = true
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.06
	env.adjustment_saturation = 1.08
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -38, 0)
	sun.light_energy = 1.25
	sun.light_color = Color(1.0, 0.97, 0.92)
	sun.light_angular_distance = 0.7
	sun.shadow_enabled = true
	sun.shadow_blur = 1.2
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS if quality >= 2 else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 320.0 if quality >= 2 else 160.0
	sun.directional_shadow_blend_splits = true
	add_child(sun)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-25, 150, 0)
	fill.light_energy = 0.3
	fill.light_color = Color(0.80, 0.86, 1.0)
	add_child(fill)

func _std(c: Color, rough := 0.5, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	return m

func _noise_tex(freq: float, seed_v: int) -> NoiseTexture2D:
	var n := FastNoiseLite.new()
	n.frequency = freq
	n.seed = seed_v
	n.fractal_octaves = 4
	var t := NoiseTexture2D.new()
	t.noise = n
	t.width = 1024
	t.height = 1024
	t.seamless = true
	return t

func _ground_and_buildings() -> void:
	var ground := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(site_extent.x + 400, site_extent.y + 400)
	ground.mesh = pm
	var gmat := _std(Color(0.23, 0.24, 0.25), 0.92)
	gmat.albedo_texture = _noise_tex(0.08, 3)
	gmat.uv1_triplanar = true
	gmat.uv1_scale = Vector3(0.02, 0.02, 0.02)
	ground.material_override = gmat
	ground.position = P(site_center.x, site_center.y, -0.02)
	add_child(ground)
	var epoxy := _std(Color(0.55, 0.58, 0.58), 0.45, 0.0)
	epoxy.clearcoat_enabled = true
	epoxy.clearcoat = 0.25
	epoxy.clearcoat_roughness = 0.35
	var roofm := _std(Color(0.80, 0.81, 0.80), 0.55, 0.6)
	for b in pack["buildings"]:
		var c := V2(b["center"])
		var s := Vector2(float(b["size"][0]), float(b["size"][1]))
		var slab := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(s.x, 0.12, s.y)
		slab.mesh = bm
		slab.material_override = epoxy
		slab.position = P(c.x, c.y, -0.058)
		add_child(slab)
		# every building is an open cut-away (architectural model view): the whole factory is visible from above
		var bl := Label3D.new()
		bl.text = str(b["id"])
		bl.font_size = 220
		bl.pixel_size = 0.03
		bl.outline_size = 40
		bl.outline_modulate = Color(0.05, 0.08, 0.14, 0.8)
		bl.modulate = Color(1, 1, 1, 0.92)
		bl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		bl.position = P(c.x, c.y, 22.0)
		bl.add_to_group("labels")
		bl.add_to_group("area_labels")
		add_child(bl)
	for a in pack["areas"]:   # subtle tinted floor zones
		var c := V2(a["center"])
		var s := Vector2(float(a["size"][0]), float(a["size"][1]))
		var z := MeshInstance3D.new()
		var zm := PlaneMesh.new()
		zm.size = Vector2(s.x, s.y)
		z.mesh = zm
		var am := _std(Color(0.30, 0.52, 0.78, 0.10) if str(a["id"]).begins_with("INJ1") else Color(0.85, 0.55, 0.20, 0.08), 0.4)
		am.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		z.material_override = am
		z.position = P(c.x, c.y, 0.006)
		add_child(z)

func _high_bays(c: Vector2, s: Vector2) -> void:
	var fix := MultiMesh.new()
	fix.transform_format = MultiMesh.TRANSFORM_3D
	var fm := BoxMesh.new()
	fm.size = Vector3(1.4, 0.12, 0.5)
	fix.mesh = fm
	var pts := []
	var step := 10.0
	var nx := int(s.x / step)
	var ny := int(s.y / step)
	for i in range(nx):
		for j in range(ny):
			pts.append(Vector2(c.x - s.x / 2 + (i + 0.5) * s.x / nx, c.y - s.y / 2 + (j + 0.5) * s.y / ny))
	fix.instance_count = pts.size()
	var lm := _std(Color(1, 1, 1), 0.3)
	lm.emission_enabled = true
	lm.emission = Color(1.0, 0.93, 0.82)
	lm.emission_energy_multiplier = 6.0
	for k in range(pts.size()):
		fix.set_instance_transform(k, Transform3D(Basis(), P(pts[k].x, pts[k].y, 9.0)))
		var l := OmniLight3D.new()
		l.light_color = Color(1.0, 0.92, 0.80)
		l.light_energy = 2.2
		l.omni_range = 15.0
		l.omni_attenuation = 1.2
		l.light_specular = 0.4
		l.position = P(pts[k].x, pts[k].y, 8.6)
		add_child(l)
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = fix
	mi.material_override = lm
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

# ------------------------------------------------------------------ CAD layers (true geometry)
func _segment_mm(segs: Array, h: float, th: float, y0: float, mat: Material) -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var box := BoxMesh.new()
	box.size = Vector3.ONE
	mm.mesh = box
	mm.instance_count = segs.size()
	var i := 0
	for s in segs:
		var a := P(float(s[0]), float(s[1]))
		var b := P(float(s[2]), float(s[3]))
		var d := b - a
		var L := d.length()
		var xa := Vector3.RIGHT if L < 0.01 else d / L   # posts: a point gives a square box, not a stretched slab
		if L < 0.01:
			L = 0.0
		var za := xa.cross(Vector3.UP)
		var basis := Basis(xa * (L + th * 0.5), Vector3.UP * h, za * th)
		mm.set_instance_transform(i, Transform3D(basis, (a + b) / 2 + Vector3.UP * (y0 + h / 2)))
		i += 1
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.material_override = mat
	add_child(mi)

func _cad_layers() -> void:
	var cad: Dictionary = pack["cad"]
	for id in cad.keys():
		var l: Dictionary = cad[id]
		var kind: String = l["kind"]
		var segs: Array = l["segments"]
		if args.has("skip_kind") and str(args["skip_kind"]).contains(kind):
			continue
		if kind == "exterior_wall":
			var m := _std(Color(0.80, 0.80, 0.78), 0.85)
			_segment_mm(segs, float(l["height"]), maxf(float(l["thickness"]), 0.2), 0.0, m)
		elif kind == "wall":
			_segment_mm(segs, minf(float(l["height"]), 3.4), maxf(float(l["thickness"]), 0.15), 0.0, _std(Color(0.84, 0.84, 0.82), 0.8))
		elif kind == "partition":
			_segment_mm(segs, minf(float(l["height"]), 2.7), 0.1, 0.0, _std(Color(0.88, 0.88, 0.87), 0.7))
		elif kind == "marking":
			var pm := _std(Color(0.98, 0.76, 0.08), 0.45)
			pm.emission_enabled = true
			pm.emission = Color(0.98, 0.70, 0.05)
			pm.emission_energy_multiplier = 0.08
			_segment_mm(segs, 0.006, 0.09, 0.0, pm)
		elif kind == "outline":   # crane runway: yellow I-beams on posts
			var ym := _std(Color(0.95, 0.70, 0.04), 0.4, 0.2)
			_segment_mm(segs, 0.55, 0.32, float(l["height"]) - 0.55, ym)
			var posts := []
			for s in segs:
				var a := Vector2(float(s[0]), float(s[1]))
				var b := Vector2(float(s[2]), float(s[3]))
				var n := int(a.distance_to(b) / 12.0)
				for k in range(n + 1):
					var p := a.lerp(b, float(k) / max(1, n))
					posts.append([p.x, p.y, p.x + 0.001, p.y])
			_segment_mm(posts, float(l["height"]) - 0.55, 0.35, 0.0, _std(Color(0.55, 0.57, 0.6), 0.45, 0.6))
		elif kind == "column":
			var col := _asset("column")
			if col.is_empty():
				continue
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = col["mesh"]
			mm.instance_count = segs.size()
			var ab: AABB = col["aabb"]
			for i in range(segs.size()):
				var r: Array = segs[i]
				var sc := Vector3(float(r[2]) / ab.size.x, float(l["height"]) / ab.size.y, float(r[3]) / ab.size.z)
				mm.set_instance_transform(i, Transform3D(Basis.from_scale(sc), P(float(r[0]), float(r[1]))))
			var mi := MultiMeshInstance3D.new()
			mi.multimesh = mm
			add_child(mi)

# ------------------------------------------------------------------ objects from the model library
func _asset(name: String) -> Dictionary:
	if mesh_cache.has(name):
		return mesh_cache[name]
	var path := assets_dir.path_join(name + ".glb")
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	if doc.append_from_file(path, st) != OK:
		push_warning("model missing: " + path)
		mesh_cache[name] = {}
		return {}
	var scene: Node = doc.generate_scene(st)
	var mis := scene.find_children("*", "MeshInstance3D", true, false)
	var out := {}
	if mis.size() > 0:
		var mi: MeshInstance3D = mis[0]
		out = {"mesh": mi.mesh, "aabb": mi.mesh.get_aabb()}
	scene.free()
	mesh_cache[name] = out
	return out

func place(name: String, size: Array, pos: Vector3, yaw: float, fit_height := false) -> MeshInstance3D:
	var a := _asset(name)
	if a.is_empty():
		return null
	var ab: AABB = a["aabb"]
	var sx := float(size[0]) / ab.size.x
	var sz := float(size[1]) / ab.size.z
	var sy := float(size[2]) / ab.size.y if fit_height else clampf(sqrt(sx * sz), 0.75, 1.3)
	var basis := Basis(Vector3.UP, deg_to_rad(yaw)) * Basis.from_scale(Vector3(sx, sy, sz))
	var c := ab.get_center()
	var local := Vector3(-c.x * sx, -ab.position.y * sy, -c.z * sz)
	var mi := MeshInstance3D.new()
	mi.mesh = a["mesh"]
	mi.transform = Transform3D(basis, pos + Basis(Vector3.UP, deg_to_rad(yaw)) * local)
	add_child(mi)
	return mi

func fit_transform(name: String, size: Array, pos: Vector3, yaw: float, fit_height := false) -> Transform3D:
	var ab: AABB = _asset(name)["aabb"]
	var sx := float(size[0]) / ab.size.x
	var sz := float(size[1]) / ab.size.z
	var sy := float(size[2]) / ab.size.y if fit_height else clampf(sqrt(sx * sz), 0.75, 1.3)
	var rot := Basis(Vector3.UP, deg_to_rad(yaw))
	var c := ab.get_center()
	return Transform3D(rot * Basis.from_scale(Vector3(sx, sy, sz)), pos + rot * Vector3(-c.x * sx, -ab.position.y * sy, -c.z * sz))

func _objects() -> void:
	var batches := {}   # asset -> [Transform3D]: one MultiMesh per model keeps the laptop GPU fast
	var conflicts: Array = pack.get("conflicts", [])
	var ghost := _std(Color(1.0, 0.18, 0.12, 0.28), 0.5)
	ghost.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ghost.emission_enabled = true
	ghost.emission = Color(1.0, 0.2, 0.1)
	ghost.emission_energy_multiplier = 0.6
	ghost.cull_mode = BaseMaterial3D.CULL_DISABLED
	for o in pack["objects"]:
		var pf: String = o["prefab"]
		if pf in ["TROLLEY", "AGV", "OPERATOR"]:
			continue
		var asset: String = str(o["asset"]).get_file().get_basename()
		if _asset(asset).is_empty():
			continue
		var p := P(float(o["pos"][0]), float(o["pos"][1]), float(o["pos"][2]))
		var fit: bool = pf in ["RACK", "PALLET", "CRANE_BRIDGE", "BOLLARD", "TABLE", "BIN_CART", "SMT_MODULE", "EPS_MACHINE"]
		if str(o["id"]) in conflicts:   # an object of the CAD that stands on the drawn route: shown as a red ghost, labelled
			var g := place(asset, o["size"], p, float(o["yaw"]), fit)
			g.material_override = ghost
			g.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			var cl := Label3D.new()
			cl.text = "ROUTE CLASH  ·  %s (Y26 CAD)" % str(o["name"]).to_lower()
			cl.font_size = 44
			cl.pixel_size = 0.006
			cl.outline_size = 12
			cl.modulate = Color(1.0, 0.45, 0.4)
			cl.outline_modulate = Color(0.15, 0.02, 0.02, 0.9)
			cl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			cl.position = p + Vector3.UP * 3.6
			cl.add_to_group("labels")
			add_child(cl)
			continue
		if pf != "CRANE_BRIDGE":
			if not batches.has(asset):
				batches[asset] = []
			batches[asset].append(fit_transform(asset, o["size"], p, float(o["yaw"]), fit))
		var mi: MeshInstance3D = place(asset, o["size"], p, float(o["yaw"]), fit) if pf == "CRANE_BRIDGE" else null
		if pf == "CRANE_BRIDGE":
			cranes.append({"node": mi, "base": mi.position, "phase": randf() * TAU})
		elif pf == "RFID_GATE":
			var l := OmniLight3D.new()
			l.light_color = Color(0.2, 1.0, 0.45)
			l.omni_range = 5.0
			l.light_energy = 0.0
			l.position = p + Vector3.UP * 2.7
			add_child(l)
			gates.append({"pos": Vector2(float(o["pos"][0]), float(o["pos"][1])), "light": l, "glow": 0.0})
		elif pf == "INJECTION_MACHINE" and quality >= 2:
			var s := OmniLight3D.new()
			s.light_color = Color(0.3, 1.0, 0.5)
			s.omni_range = 3.0
			s.light_energy = 0.5
			s.position = p + Vector3.UP * 3.1
			add_child(s)
	for asset in batches.keys():
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = _asset(asset)["mesh"]
		mm.instance_count = batches[asset].size()
		for k in range(batches[asset].size()):
			mm.set_instance_transform(k, batches[asset][k])
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		add_child(mmi)
	for a in pack["areas"]:
		var al := Label3D.new()
		al.text = str(a["name"])
		al.font_size = 96
		al.pixel_size = 0.02
		al.outline_size = 22
		al.outline_modulate = Color(0.05, 0.08, 0.14, 0.8)
		al.modulate = Color(1.0, 0.86, 0.55)
		al.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		al.position = P(float(a["center"][0]), float(a["center"][1]), 12.0)
		al.add_to_group("labels")
		al.add_to_group("area_labels")
		add_child(al)

# ------------------------------------------------------------------ route ribbon, stop markers, labels
func _route_and_stops() -> void:
	route_pts = []
	route_cum = []
	step_start_dist = []
	var acc := 0.0
	for i in range(steps.size()):
		step_start_dist.append(acc)
		if i == 0:
			continue
		var pts: Array = steps[i]["pts"]
		for k in range(pts.size()):
			var q := V2(pts[k])
			if route_pts.size() > 0:
				var d := q.distance_to(route_pts[-1])
				if d < 0.01:
					continue
				acc += d
			route_pts.append(q)
			route_cum.append(acc)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var w := 0.45
	for k in range(route_pts.size() - 1):
		var a: Vector2 = route_pts[k]
		var b: Vector2 = route_pts[k + 1]
		var n := (b - a).normalized().orthogonal() * w
		var ua: float = route_cum[k]
		var ub: float = route_cum[k + 1]
		var quad := [[a - n, Vector2(ua, 0)], [a + n, Vector2(ua, 1)], [b + n, Vector2(ub, 1)], [b - n, Vector2(ub, 0)]]
		for idx in [0, 1, 2, 0, 2, 3]:
			st.set_uv(quad[idx][1])
			var v: Vector2 = quad[idx][0]
			st.add_vertex(P(v.x, v.y, 0.03))
		# round joint
		for j in range(10):
			var a0 := TAU * j / 10.0
			var a1 := TAU * (j + 1) / 10.0
			for vv in [[b, 0.5], [b + Vector2(cos(a0), sin(a0)) * w, 0.0], [b + Vector2(cos(a1), sin(a1)) * w, 0.0]]:
				st.set_uv(Vector2(ub, 0.5 + (0.5 - vv[1])))
				st.add_vertex(P(vv[0].x, vv[0].y, 0.029))
	var rm := MeshInstance3D.new()
	rm.mesh = st.commit()
	route_mat = ShaderMaterial.new()
	route_mat.shader = load("res://shaders/route.gdshader")
	route_mat.set_shader_parameter("col", Color.html(str(pack["path"].get("color", "#f59e0b"))))
	rm.material_override = route_mat
	add_child(rm)
	var beam_shader: Shader = load("res://shaders/beam.gdshader")
	var visited := {}
	for i in range(steps.size()):
		var sid: String = steps[i]["stop"]
		if visited.has(sid):
			continue
		visited[sid] = true
		var p: Vector2 = stop_pos.get(sid, V2(steps[i]["pts"][-1]))
		var col := Color(0.45, 0.85, 1.0) if steps[i]["mode"] == "agv" else Color(1.0, 0.72, 0.18)
		var ring := MeshInstance3D.new()
		var tm := TorusMesh.new()
		tm.inner_radius = 0.75
		tm.outer_radius = 0.95
		tm.rings = 48
		ring.mesh = tm
		var rmat := _std(col, 0.3)
		rmat.emission_enabled = true
		rmat.emission = col
		rmat.emission_energy_multiplier = 2.2
		ring.material_override = rmat
		ring.scale = Vector3(1, 0.05, 1)
		ring.position = P(p.x, p.y, 0.04)
		add_child(ring)
		var beam := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.08
		cm.bottom_radius = 0.6
		cm.height = 5.0
		cm.radial_segments = 32
		beam.mesh = cm
		var bmat := ShaderMaterial.new()
		bmat.shader = beam_shader
		bmat.set_shader_parameter("col", col)
		beam.material_override = bmat
		beam.position = P(p.x, p.y, 2.5)
		add_child(beam)
		var lab := Label3D.new()
		lab.text = "%d  %s" % [i + 1, str(steps[i]["title"])]
		lab.font_size = 56
		lab.pixel_size = 0.0055
		lab.outline_size = 14
		lab.outline_modulate = Color(0.04, 0.06, 0.1, 0.9)
		lab.modulate = Color(1, 1, 1)
		lab.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		lab.no_depth_test = false
		lab.position = P(p.x, p.y, 3.2)
		lab.add_to_group("labels")
		add_child(lab)

func _actors() -> void:
	var p0 := V2(steps[0]["pts"][0])
	trolley = Node3D.new()
	add_child(trolley)
	var t := place("trolley", [1.2, 0.8, 1.15], Vector3.ZERO, 0.0, true)
	if t:
		t.reparent(trolley, false)
	var tag := OmniLight3D.new()   # soft status light on the trolley so it reads in every shot
	tag.light_color = Color(1.0, 0.75, 0.3)
	tag.omni_range = 3.5
	tag.light_energy = 0.8
	tag.position = Vector3(0, 1.6, 0)
	trolley.add_child(tag)
	var halo := MeshInstance3D.new()   # glowing ring under the trolley: readable in every wide shot
	var hm := TorusMesh.new()
	hm.inner_radius = 1.25
	hm.outer_radius = 1.45
	hm.rings = 48
	halo.mesh = hm
	var hmat := _std(Color.html(str(pack["path"].get("color", "#f59e0b"))).lerp(Color.WHITE, 0.35), 0.3)
	hmat.emission_enabled = true
	hmat.emission = hmat.albedo_color
	hmat.emission_energy_multiplier = 3.0
	halo.material_override = hmat
	halo.scale = Vector3(1, 0.04, 1)
	halo.position = Vector3(0, 0.05, 0)
	trolley.add_child(halo)
	if args.has("debug_marker"):
		var dm := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 1.5
		sm.height = 3.0
		dm.mesh = sm
		dm.material_override = _std(Color(1, 0, 0), 0.5)
		trolley.add_child(dm)
	operator_node = Node3D.new()
	add_child(operator_node)
	var o := place("operator", [0.65, 0.56, 1.75], Vector3.ZERO, 0.0, true)
	if o:
		o.reparent(operator_node, false)
	agv = Node3D.new()
	add_child(agv)
	var g := place("agv", [1.4, 0.9, 0.42], Vector3.ZERO, 0.0, true)
	if g:
		g.reparent(agv, false)
	trolley.position = P(p0.x, p0.y)

# ------------------------------------------------------------------ engine time -> poses
func _point_on(pts: Array, s: float) -> Vector2:
	var acc := 0.0
	for k in range(1, pts.size()):
		var a := V2(pts[k - 1])
		var b := V2(pts[k])
		var L := a.distance_to(b)
		if acc + L >= s and L > 0.0:
			return a.lerp(b, (s - acc) / L)
		acc += L
	return V2(pts[-1])

func _path_len(pts: Array) -> float:
	var acc := 0.0
	for k in range(1, pts.size()):
		acc += V2(pts[k - 1]).distance_to(V2(pts[k]))
	return acc

func _ease_travel(u: float, L: float) -> float:   # trapezoid speed profile: gentle start and stop
	var ramp := clampf(1.6 / maxf(L, 0.1), 0.05, 0.4)
	u = clampf(u, 0.0, 1.0)
	var vmax := 1.0 / (1.0 - ramp)
	if u < ramp:
		return 0.5 * vmax * u * u / ramp
	if u > 1.0 - ramp:
		var r := 1.0 - u
		return 1.0 - 0.5 * vmax * r * r / ramp
	return 0.5 * vmax * ramp + vmax * (u - ramp)

func pose_at(e: float) -> Dictionary:
	var out := {"p": V2(steps[0]["pts"][0]), "dir": pose["dir"], "mode": steps[0]["mode"], "moving": false, "step": 0, "dist": 0.0, "u": 0.0, "phase": "wait"}
	for i in range(1, steps.size()):
		var s: Dictionary = steps[i]
		var pts: Array = s["pts"]
		if e < float(s["t0"]):
			out["step"] = i - 1
			break
		var L := _path_len(pts)
		if e <= float(s["tm"]):
			var u := (e - float(s["t0"])) / maxf(float(s["tm"]) - float(s["t0"]), 0.001)
			var d := L * _ease_travel(u, L)
			out["p"] = _point_on(pts, d)
			var ahead := _point_on(pts, minf(d + 0.9, L))
			var behind := _point_on(pts, maxf(d - 0.9, 0.0))
			if ahead.distance_to(behind) > 0.05:
				out["dir"] = (ahead - behind).normalized()
			out["mode"] = s["mode"]
			out["moving"] = true
			out["step"] = i
			out["dist"] = float(step_start_dist[i]) + d
			out["u"] = u
			out["phase"] = "travel"
			return out
		out["p"] = V2(pts[-1])
		if pts.size() > 1:
			out["dir"] = (V2(pts[-1]) - V2(pts[-2])).normalized()
		out["mode"] = s["mode"]
		out["step"] = i
		out["dist"] = float(step_start_dist[i]) + L
		out["phase"] = "wait"
		out["u"] = (e - float(s["tm"])) / maxf(float(s["t1"]) - float(s["tm"]), 0.001)
	return out

func _process(delta: float) -> void:
	if steps.is_empty():
		return
	var prev: Vector2 = pose["dir"]
	pose = pose_at(engine_time)
	var dir: Vector2 = prev.slerp(pose["dir"], clampf(delta * 6.0, 0.0, 1.0)) if prev.length() > 0.5 else pose["dir"]
	pose["dir"] = dir
	var yaw := atan2(dir.y, dir.x)
	var on_agv: bool = pose["mode"] == "agv"
	trolley.position = P(pose["p"].x, pose["p"].y, 0.36 if on_agv else 0.0)
	trolley.rotation = Vector3(0, yaw, 0)
	var t: float = get_node("Director").film_time
	# operator: pushes in push mode; in AGV mode stays at the hand-over point (TO Mapping)
	if not on_agv:
		var back: Vector2 = pose["p"] - dir * 1.15
		var bob := absf(sin(float(pose["dist"]) * 2.6)) * 0.035 if pose["moving"] else 0.0
		operator_node.position = P(back.x, back.y, bob)
		operator_node.rotation = Vector3(0, yaw, 0)
	agv.visible = on_agv or (pose["step"] >= 4 and pose["phase"] == "wait" and float(pose["u"]) > 0.35)
	if on_agv:
		agv.position = P(pose["p"].x, pose["p"].y)
		agv.rotation = Vector3(0, yaw, 0)
	elif agv.visible:   # AGV drives in to dock under the trolley during the hand-over wait
		var k := clampf((float(pose["u"]) - 0.35) / 0.6, 0.0, 1.0)
		k = k * k * (3.0 - 2.0 * k)
		var side := dir.orthogonal() * 7.0
		var q: Vector2 = (pose["p"] + side).lerp(pose["p"], k)
		agv.position = P(q.x, q.y)
		agv.rotation = Vector3(0, yaw, 0)
	route_mat.set_shader_parameter("progress", float(pose["dist"]))
	for g in gates:
		var d: float = g["pos"].distance_to(pose["p"])
		g["glow"] = maxf(float(g["glow"]) - delta * 1.5, 3.0 if d < 2.0 else 0.0)
		g["light"].light_energy = g["glow"]
	for c in cranes:
		c["node"].position = c["base"] + Vector3(0, 0, sin(t * 0.06 + float(c["phase"])) * 9.0)
