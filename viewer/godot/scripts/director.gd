# Director: film time -> engine time (a program of phases) and a shot plan (one camera rig per phase). Every rig is built
# from the trolley's engine pose, so the camera always tells the true trip. In --movie mode Godot's Movie Maker renders a
# fixed frame rate and the film quits at its end; otherwise it plays live (Space pause, Right next shot, F free camera).
extends Node

var main
var film_mode := false
var film_time := 0.0
var paused := false
var program: Array = []      # [{kind, f0, f1, e0, e1, rig, step}]
var film_len := 0.0
var cur := -1
var cam_pos := Vector3.ZERO
var cam_tgt := Vector3.ZERO
var cam_fov := 50.0
var free_cam := false
var free_yaw := 0.0
var free_pitch := -0.3
var phase_info := {"kind": "intro", "step": 0, "u": 0.0}
var stills: Array = []        # --stills=t1,t2,... (film seconds) -> PNG frames for review, then quit
var still_i := 0
var still_wait := 0
var still_dir := ""
var wall_grid := {}           # Vector2i(5 m cell) -> [[ax, ay, bx, by, height]] (site metres, true CAD walls)
const CELL := 5.0

func setup(m) -> void:
	main = m
	film_mode = main.movie
	var st: Array = main.steps
	_build_wall_grid()
	_add("intro", 9.0, 0.0, 0.0, "aerial", 0)
	_add("wait", 4.0, 0.0, float(st[0]["t1"]), "machines", 0)
	var travel_rigs := ["chase", "top", "crane", "side", "low_front", "chase_high", "side"]
	for i in range(1, st.size()):
		var s: Dictionary = st[i]
		var tr := float(s["tm"]) - float(s["t0"])
		_add("travel", clampf(tr / 5.5, 4.5, 8.0), float(s["t0"]), float(s["tm"]), travel_rigs[(i - 1) % travel_rigs.size()], i)
		_add("wait", 3.2, float(s["tm"]), float(s["t1"]), "orbit", i)
	var end_t := float(st[-1]["t1"])
	_add("outro", 9.0, end_t, end_t, "reveal", st.size() - 1)
	film_len = program[-1]["f1"]
	if main.args.has("from"):   # render part of the film (Movie Maker) for review: --from=<s> --to=<s>
		film_time = float(main.args["from"])
	if main.args.has("stills"):
		for x in str(main.args["stills"]).split(","): stills.append(float(x))
		still_dir = str(main.args.get("out", OS.get_user_data_dir()))
		film_mode = true
		film_time = stills[0]
	print("FILM program: %d phases, %.1f s film for %.1f s engine time" % [program.size(), film_len, end_t])

func _build_wall_grid() -> void:
	var hmap := {"exterior_wall": 9.0, "wall": 3.4, "partition": 2.7}
	for id in main.pack["cad"].keys():
		var l: Dictionary = main.pack["cad"][id]
		if not hmap.has(l["kind"]):
			continue
		var h: float = hmap[l["kind"]]
		for s in l["segments"]:
			var seg := [float(s[0]), float(s[1]), float(s[2]), float(s[3]), h]
			for cx in range(int(floor(minf(seg[0], seg[2]) / CELL)), int(floor(maxf(seg[0], seg[2]) / CELL)) + 1):
				for cy in range(int(floor(minf(seg[1], seg[3]) / CELL)), int(floor(maxf(seg[1], seg[3]) / CELL)) + 1):
					var k := Vector2i(cx, cy)
					if not wall_grid.has(k):
						wall_grid[k] = []
					wall_grid[k].append(seg)

# Lowest camera height that sees the subject over every true CAD wall between them.
func _clear_height(sub: Vector2, sub_h: float, cam2: Vector2, cam_h: float) -> float:
	var need := cam_h
	var seen := {}
	for cx in range(int(floor(minf(sub.x, cam2.x) / CELL)), int(floor(maxf(sub.x, cam2.x) / CELL)) + 1):
		for cy in range(int(floor(minf(sub.y, cam2.y) / CELL)), int(floor(maxf(sub.y, cam2.y) / CELL)) + 1):
			for seg in wall_grid.get(Vector2i(cx, cy), []):
				if seen.has(seg):
					continue
				seen[seg] = true
				var hit = Geometry2D.segment_intersects_segment(sub, cam2, Vector2(seg[0], seg[1]), Vector2(seg[2], seg[3]))
				if hit == null:
					continue
				var f: float = sub.distance_to(hit) / maxf(sub.distance_to(cam2), 0.001)
				if f < 0.04:
					continue
				need = maxf(need, sub_h + (float(seg[4]) + 0.5 - sub_h) / f)
	return minf(need, 45.0)

func _add(kind: String, dur: float, e0: float, e1: float, rig: String, step: int) -> void:
	var f0: float = program[-1]["f1"] if program.size() > 0 else 0.0
	program.append({"kind": kind, "f0": f0, "f1": f0 + dur, "e0": e0, "e1": e1, "rig": rig, "step": step})

func _input(ev: InputEvent) -> void:
	if film_mode:
		return
	if ev is InputEventKey and ev.pressed:
		match ev.keycode:
			KEY_SPACE: paused = not paused
			KEY_RIGHT: if cur >= 0 and cur < program.size() - 1: film_time = program[cur + 1]["f0"]
			KEY_LEFT: if cur > 0: film_time = program[cur - 1]["f0"]
			KEY_F:
				free_cam = not free_cam
				if free_cam:
					var d := (cam_tgt - cam_pos).normalized()
					free_yaw = atan2(-d.x, -d.z)
					free_pitch = asin(clampf(d.y, -1.0, 1.0))
			KEY_ESCAPE: get_tree().quit()
			KEY_L:
				for n in get_tree().get_nodes_in_group("labels"): n.visible = not n.visible
			KEY_H: main.get_node("HUD").visible = not main.get_node("HUD").visible
			KEY_1, KEY_2, KEY_3:   # fly the free camera to E1 / E2 / EPS
				var ids := {KEY_1: "E1", KEY_2: "E2", KEY_3: "EPS"}
				for b in main.pack["buildings"]:
					if b["id"] == ids[ev.keycode]:
						var c: Vector3 = main.P(float(b["center"][0]), float(b["center"][1]))
						free_cam = true
						cam_pos = c + Vector3(-0.45, 0.55, 0.7) * maxf(float(b["size"][0]), float(b["size"][1]))
						var d := (c - cam_pos).normalized()
						free_yaw = atan2(-d.x, -d.z)
						free_pitch = asin(d.y)
	if free_cam and ev is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		free_yaw -= ev.relative.x * 0.004
		free_pitch = clampf(free_pitch - ev.relative.y * 0.004, -1.5, 1.5)

func _ease(u: float) -> float:
	u = clampf(u, 0.0, 1.0)
	return u * u * u * (u * (u * 6.0 - 15.0) + 10.0)   # smootherstep

func _process(delta: float) -> void:
	if main.args.has("fps") and Engine.get_process_frames() % 120 == 0:
		print("FPS ", Engine.get_frames_per_second(), " film ", snappedf(film_time, 0.1))
	if not stills.is_empty():
		still_wait += 1
		if still_wait == 45:   # let GI, shadows and smoothing settle
			var img := get_viewport().get_texture().get_image()
			var fn := still_dir.path_join("still_%02d_%05.1f.png" % [still_i, stills[still_i]])
			img.save_png(fn)
			print("STILL ", fn, " trolley ", main.trolley.global_position, " visible ", main.trolley.is_visible_in_tree(), " cam ", cam_pos, " pose ", main.pose["p"], " step ", main.pose["step"], " e ", main.engine_time)
			var tm: MeshInstance3D = main.trolley.get_child(0) if main.trolley.get_child(0) is MeshInstance3D else null
			print("  camera ", main.cam.global_position, " fov ", main.cam.fov, " basis.z ", main.cam.global_basis.z, " | trolley mesh ", (tm.global_transform * tm.get_aabb()) if tm else "none", " children ", main.trolley.get_children())
			still_i += 1
			still_wait = 0
			if still_i >= stills.size():
				get_tree().quit()
				return
			film_time = stills[still_i]
		else:
			film_time = stills[still_i] - (45 - still_wait) / 30.0   # approach the still time over the settle frames (camera smoothing)
	elif not paused:
		film_time += delta
	if film_mode and main.args.has("to") and film_time > float(main.args["to"]):
		get_tree().quit()
		return
	if film_mode and film_time > film_len + 0.4:
		get_tree().quit()
		return
	if not film_mode and film_time > film_len:
		film_time = 0.0   # live view loops the film
	var i := 0
	while i < program.size() - 1 and film_time >= program[i]["f1"]:
		i += 1
	var ph: Dictionary = program[i]
	var u := clampf((film_time - ph["f0"]) / (ph["f1"] - ph["f0"]), 0.0, 1.0)
	main.engine_time = lerpf(ph["e0"], ph["e1"], u if ph["kind"] == "travel" else _ease(u))
	main._process(0.0)
	var cut := i != cur
	cur = i
	phase_info = {"kind": ph["kind"], "step": ph["step"], "u": u, "rig": ph["rig"]}
	if film_mode or cut:   # building and area names belong to the aerial shots
		for n in get_tree().get_nodes_in_group("area_labels"): n.visible = ph["kind"] in ["intro", "outro"]
	if free_cam:
		_free(delta)
		return
	var shot := _rig(ph, u)
	if ph["rig"] in ["chase", "chase_high", "crane", "side", "low_front", "orbit", "machines", "reveal"]:   # crane over walls that would hide the subject
		var tp: Vector3 = shot["tgt"]
		var sp: Vector3 = shot["pos"]
		var need := _clear_height(Vector2(tp.x, -tp.z), tp.y, Vector2(sp.x, -sp.z), sp.y)
		if need > sp.y:
			shot["pos"] = Vector3(sp.x, need, sp.z)
	var k := 1.0 - exp(-delta * float(shot.get("stiff", 5.0)))
	if cut and shot.get("cut", true):
		cam_pos = shot["pos"]
		cam_tgt = shot["tgt"]
		cam_fov = shot["fov"]
	else:
		cam_pos = cam_pos.lerp(shot["pos"], k)
		cam_tgt = cam_tgt.lerp(shot["tgt"], k)
		cam_fov = lerpf(cam_fov, shot["fov"], k)
	_apply()

func _apply() -> void:
	var cam: Camera3D = main.cam
	if cam_pos.distance_to(cam_tgt) < 0.01:
		cam_tgt = cam_pos + Vector3(0, -1, -0.001)
	var up := Vector3.UP if absf((cam_tgt - cam_pos).normalized().y) < 0.995 else Vector3(0, 0, -1)
	cam.look_at_from_position(cam_pos, cam_tgt, up)
	cam.fov = cam_fov
	var att: CameraAttributesPractical = cam.attributes
	var dist := cam_pos.distance_to(cam_tgt)
	att.dof_blur_far_enabled = dist < 60.0
	att.dof_blur_far_distance = dist + 7.0
	att.dof_blur_far_transition = 18.0 + dist * 0.6
	att.dof_blur_near_enabled = dist < 9.0
	att.dof_blur_near_distance = maxf(dist * 0.35, 0.3)
	att.dof_blur_near_transition = 0.8
	att.dof_blur_amount = 0.06

func _free(delta: float) -> void:
	var fwd := Vector3(-sin(free_yaw) * cos(free_pitch), sin(free_pitch), -cos(free_yaw) * cos(free_pitch))
	var right := fwd.cross(Vector3.UP).normalized()
	var v := Vector3.ZERO
	if Input.is_key_pressed(KEY_W): v += fwd
	if Input.is_key_pressed(KEY_S): v -= fwd
	if Input.is_key_pressed(KEY_D): v += right
	if Input.is_key_pressed(KEY_A): v -= right
	if Input.is_key_pressed(KEY_E): v += Vector3.UP
	if Input.is_key_pressed(KEY_Q): v -= Vector3.UP
	var speed := 30.0 if Input.is_key_pressed(KEY_SHIFT) else 8.0
	cam_pos += v * speed * delta
	cam_tgt = cam_pos + fwd
	_apply()

# ------------------------------------------------------------------ camera rigs
func _subject() -> Dictionary:
	var p: Vector2 = main.pose["p"]
	var d: Vector2 = main.pose["dir"]
	var P3: Vector3 = main.P(p.x, p.y)
	var D3: Vector3 = main.P(d.x, d.y).normalized()
	var S3 := D3.cross(Vector3.UP).normalized()
	return {"p": P3, "d": D3, "s": S3}

func _catmull(pts: Array, t: float) -> Vector3:
	var n := pts.size() - 1
	var f := clampf(t, 0.0, 1.0) * n
	var i := mini(int(f), n - 1)
	var u := f - i
	var p0: Vector3 = pts[maxi(i - 1, 0)]
	var p1: Vector3 = pts[i]
	var p2: Vector3 = pts[mini(i + 1, n)]
	var p3: Vector3 = pts[mini(i + 2, n)]
	return 0.5 * ((2.0 * p1) + (-p0 + p2) * u + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * u * u + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * u * u * u)

func _rig(ph: Dictionary, u: float) -> Dictionary:
	var S := _subject()
	var p: Vector3 = S["p"]
	var d: Vector3 = S["d"]
	var s: Vector3 = S["s"]
	var up := Vector3.UP
	var sc: Vector2 = main.site_center
	var C: Vector3 = main.P(sc.x, sc.y)
	match ph["rig"]:
		"aerial":
			var e := _ease(u)
			var path := [C + Vector3(-230, 150, 210), C + Vector3(-150, 100, 110), p + Vector3(-75, 52, 45), p + Vector3(-34, 24, 22), p + Vector3(-19, 13.5, 13)]
			var tgt := C.lerp(p + up * 1.0, _ease(clampf(u * 1.25 - 0.1, 0.0, 1.0)))
			return {"pos": _catmull(path, e), "tgt": tgt, "fov": lerpf(48.0, 40.0, e), "stiff": 30.0}
		"machines":
			var ms: Array = []
			for o in main.pack["objects"]:
				if o["prefab"] == "INJECTION_MACHINE" and str(o["id"]).begins_with("INJ1"):
					ms.append(main.P(float(o["pos"][0]), float(o["pos"][1])))
			if ms.is_empty():
				return {"pos": p + Vector3(6, 3, 6), "tgt": p, "fov": 45.0}
			ms.sort_custom(func(a, b): return a.z < b.z)
			var a0: Vector3 = ms[0] + Vector3(14.0, 11.0, -12.0)   # wide flyover along the INJ 1 machine row, from the assembly side
			var a1: Vector3 = ms[-1] + Vector3(13.0, 8.5, 9.0)
			var e := _ease(u)
			var pos := a0.lerp(a1, e)
			var look: Vector3 = (ms[0].lerp(ms[-1], clampf(e + 0.1, 0.0, 1.0)) + up * 1.5).lerp(p + up * 0.9, _ease(clampf(u * 1.6 - 0.6, 0.0, 1.0)))
			return {"pos": pos, "tgt": look, "fov": 46.0, "stiff": 30.0}
		"chase":
			return {"pos": p - d * 10.0 + up * 9.5 + s * 3.0, "tgt": p + d * 3.0 + up * 0.5, "fov": 44.0, "stiff": 3.0}
		"chase_high":
			return {"pos": p - d * 12.0 + up * 10.0 - s * 3.0, "tgt": p + d * 5.0, "fov": 46.0, "stiff": 3.0}
		"top":
			var h := lerpf(30.0, 21.0, _ease(u)) if not main.args.has("debug_top") else float(main.args["debug_top"])
			return {"pos": p + up * h - d * h * 0.18, "tgt": p, "fov": 40.0, "stiff": 4.0}   # plan view, tilted 10 degrees (no straight-down degeneracy)
		"crane":
			var e := _ease(u)
			return {"pos": p + s * lerpf(7.0, 12.0, e) - d * lerpf(4.0, 8.0, e) + up * lerpf(9.5, 20.0, e), "tgt": p + up * 0.6 + d * 2.0, "fov": 44.0, "stiff": 4.0}
		"side":
			return {"pos": p + s * 12.0 + up * 9.0 - d * 1.0, "tgt": p + up * 0.6 + d * 0.8, "fov": 40.0, "stiff": 3.5}
		"low_front":
			return {"pos": p + d * 8.0 + up * 2.0 - s * 2.5, "tgt": p + up * 0.5, "fov": 40.0, "stiff": 3.5}
		"orbit":
			var st: Dictionary = main.steps[ph["step"]]
			var c2: Vector2 = main.stop_pos.get(st["stop"], main.pose["p"])
			var c3: Vector3 = main.P(c2.x, c2.y)
			var a := deg_to_rad(35.0 + float(ph["step"]) * 70.0) + _ease(u) * deg_to_rad(55.0)
			return {"pos": c3 + Vector3(cos(a) * 9.0, 7.0, sin(a) * 9.0), "tgt": c3 + up * 0.8, "fov": 40.0, "stiff": 5.0, "cut": false}
		"reveal":
			var rp: Array = main.route_pts
			var mn := Vector2(1e9, 1e9)
			var mx := Vector2(-1e9, -1e9)
			for q in rp:
				mn = mn.min(q)
				mx = mx.max(q)
			var rc2 := (mn + mx) / 2
			var rc: Vector3 = main.P(rc2.x, rc2.y)
			var e := _ease(u)
			var pos := (p + s * 9.0 + up * 3.5).lerp(rc + Vector3(-45, 70, 75), e)
			return {"pos": pos, "tgt": (p + up).lerp(rc, e), "fov": lerpf(44.0, 50.0, e), "stiff": 4.0, "cut": false}
	return {"pos": p + Vector3(6, 4, 6), "tgt": p, "fov": 45.0}
