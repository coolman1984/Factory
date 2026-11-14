# HUD: title card, letterbox, lower-third captions per step, engine clock and distance, 2D minimap of the true CAD plan
# (walls, route, stops, trolley), and the end card with the engine's numbers. Everything comes from the scene package.
extends CanvasLayer

var main
var director
var root: Control
var title_box: Control
var title_main: Label
var title_sub: Label
var cap_panel: PanelContainer
var cap_step: Label
var cap_title: Label
var cap_text: Label
var cap_mode: Label
var clock: Label
var brand: Label
var mini: Control
var bars_top: ColorRect
var bars_bot: ColorRect
var fade: ColorRect
var endcard: VBoxContainer
var accent := Color(1.0, 0.66, 0.16)

func _ls(size: int, col := Color.WHITE, bold := false) -> LabelSettings:
	var s := LabelSettings.new()
	s.font_size = size
	s.font_color = col
	s.shadow_size = 6
	s.shadow_color = Color(0, 0, 0, 0.45)
	s.shadow_offset = Vector2(0, 2)
	if bold:
		s.outline_size = 1
		s.outline_color = col
	return s

func _label(parent: Node, text: String, ls: LabelSettings) -> Label:
	var l := Label.new()
	l.text = text
	l.label_settings = ls
	parent.add_child(l)
	return l

func setup(m, d) -> void:
	main = m
	director = d
	accent = Color.html(str(main.pack["path"].get("color", "#f59e0b"))).lerp(Color.WHITE, 0.3)
	accent.s = maxf(accent.s, 0.55)
	accent.v = maxf(accent.v, 0.95)
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	bars_top = ColorRect.new()
	bars_top.color = Color.BLACK
	root.add_child(bars_top)
	bars_bot = ColorRect.new()
	bars_bot.color = Color.BLACK
	root.add_child(bars_bot)
	brand = _label(root, "", _ls(22, Color(1, 1, 1, 0.92), true))
	brand.position = Vector2(56, 40)
	var sub := _label(root, "", _ls(16, Color(1, 1, 1, 0.7)))
	sub.position = Vector2(56, 72)
	brand.text = "FACTORY ENGINE  ·  REAL FACTORY"
	sub.text = "%s   ·   true AutoCAD dimensions" % str(main.pack["factory"]["name"]).split(" (")[0]
	# lower third
	cap_panel = PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.03, 0.05, 0.09, 0.72)
	sb.border_width_left = 6
	sb.border_color = accent
	sb.corner_radius_top_right = 10
	sb.corner_radius_bottom_right = 10
	sb.content_margin_left = 28
	sb.content_margin_right = 30
	sb.content_margin_top = 18
	sb.content_margin_bottom = 20
	cap_panel.add_theme_stylebox_override("panel", sb)
	cap_panel.position = Vector2(56, 780)
	cap_panel.custom_minimum_size = Vector2(880, 0)
	root.add_child(cap_panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	cap_panel.add_child(v)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 14)
	v.add_child(h)
	cap_step = _label(h, "", _ls(17, accent, true))
	cap_mode = _label(h, "", _ls(15, Color(0.75, 0.85, 1.0)))
	cap_title = _label(v, "", _ls(40, Color.WHITE, true))
	cap_text = _label(v, "", _ls(19, Color(0.86, 0.9, 0.96)))
	cap_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	cap_text.custom_minimum_size = Vector2(820, 0)
	clock = _label(root, "", _ls(22, Color(1, 1, 1, 0.92), true))
	clock.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	clock.position = Vector2(1300, 1000)
	clock.size = Vector2(560, 40)
	# minimap
	mini = Control.new()
	mini.position = Vector2(1430, 40)
	mini.size = Vector2(440, 330)
	mini.draw.connect(_draw_mini)
	root.add_child(mini)
	# title card
	title_box = VBoxContainer.new()
	title_box.position = Vector2(0, 430)
	title_box.size = Vector2(1920, 220)
	root.add_child(title_box)
	title_main = _label(title_box, "INJ 1  ·  " + str(main.pack["path"]["name"]).trim_prefix("1 · "), _ls(64, Color.WHITE, true))
	title_main.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_main.size = Vector2(1920, 80)
	title_sub = _label(title_box, "E1 – E2  ·  built from the AutoCAD Y26 layout in true metres  ·  timed by the Factory Engine", _ls(24, Color(1, 1, 1, 0.82)))
	title_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# end card
	endcard = VBoxContainer.new()
	endcard.position = Vector2(0, 360)
	endcard.size = Vector2(1920, 400)
	endcard.add_theme_constant_override("separation", 10)
	root.add_child(endcard)
	var k: Dictionary = main.pack.get("engine_kpis", {})
	for row in [["ENGINE RESULT", 22, accent], ["%s" % _mmss(float(k.get("trip_s", main.pack["path"]["total_s"]))) + " trip  ·  %.1f m" % float(k.get("distance_m", 0.0)), 56, Color.WHITE],
			["pushed %.1f m  ·  AGV %.1f m  ·  %d steps  ·  invariants %s" % [float(k.get("push_m", 0)), float(k.get("agv_m", 0)), int(k.get("steps", 0)), "OK" if int(k.get("invariants", 0)) == 0 else "BROKEN"], 24, Color(1, 1, 1, 0.85)],
			["run %s  ·  master data revision %s  ·  wait times are planning assumptions" % [str(main.pack.get("run", "-")), str(main.pack.get("revision", "-"))], 18, Color(1, 1, 1, 0.6)]]:
		var l := _label(endcard, row[0], _ls(row[1], row[2], row[1] > 30))
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	fade = ColorRect.new()
	fade.color = Color.BLACK
	fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(fade)

func _mmss(t: float) -> String:
	return "%d:%02d" % [int(t) / 60, int(t) % 60]

func _process(_d: float) -> void:
	var ph: Dictionary = director.phase_info
	var ft: float = director.film_time
	var fl: float = director.film_len
	var kind: String = ph["kind"]
	# letterbox in intro and outro, open during the trip
	var lb := 0.0
	if kind == "intro": lb = 1.0 - smoothstep(0.75, 1.0, float(ph["u"]))
	elif kind == "outro": lb = smoothstep(0.0, 0.25, float(ph["u"]))
	var bh := 132.0 * lb
	bars_top.position = Vector2(0, 0)
	bars_top.size = Vector2(1920, bh)
	bars_bot.position = Vector2(0, 1080 - bh)
	bars_bot.size = Vector2(1920, bh)
	fade.color.a = clampf(1.0 - ft / 1.4, 0.0, 1.0) + clampf((ft - (fl - 1.2)) / 1.2, 0.0, 1.0)
	var tu := float(ph["u"])
	title_box.modulate.a = (smoothstep(0.08, 0.25, tu) * (1.0 - smoothstep(0.62, 0.8, tu))) if kind == "intro" else 0.0
	endcard.modulate.a = smoothstep(0.35, 0.6, tu) if kind == "outro" else 0.0
	var show_cap := kind in ["wait", "travel"]
	cap_panel.modulate.a = lerpf(cap_panel.modulate.a, 1.0 if show_cap else 0.0, 0.12)
	mini.modulate.a = lerpf(mini.modulate.a, 0.0 if kind == "intro" else 1.0, 0.08)
	var i: int = ph["step"]
	var st: Dictionary = main.steps[i]
	cap_step.text = "STEP %d / %d" % [i + 1, main.steps.size()]
	var moving: bool = kind == "travel"
	cap_mode.text = ("AGV  ·  %.1f m" if st["mode"] == "agv" else "PUSHED BY HAND  ·  %.1f m") % float(st["dist"]) if moving else ("WAIT  ·  %d s at the stop" % int(float(st["t1"]) - float(st["tm"])) if i > 0 else "ITEM SLIP  ·  %d s" % int(float(st["t1"])))
	cap_title.text = str(st["title"])
	cap_text.text = str(st.get("caption", ""))
	clock.text = "ENGINE TIME  %s   ·   %.1f m   ·   %s" % [_mmss(main.engine_time), float(main.pose["dist"]), "2D PLAN" if ph.get("rig", "") == "top" else "3D"]
	mini.queue_redraw()

func _draw_mini() -> void:
	var rp: Array = main.route_pts
	if rp.is_empty():
		return
	var mn := Vector2(1e9, 1e9)
	var mx := Vector2(-1e9, -1e9)
	for q in rp:
		mn = mn.min(q)
		mx = mx.max(q)
	mn -= Vector2(14, 14)
	mx += Vector2(14, 14)
	var W := mini.size
	var sc := minf((W.x - 20) / (mx.x - mn.x), (W.y - 44) / (mx.y - mn.y))
	var off := (W - (mx - mn) * sc) / 2 + Vector2(0, 12)
	var tr := func(p: Vector2) -> Vector2: return Vector2(off.x + (p.x - mn.x) * sc, W.y - off.y - (p.y - mn.y) * sc)
	mini.draw_rect(Rect2(Vector2.ZERO, W), Color(0.03, 0.05, 0.09, 0.72))
	mini.draw_rect(Rect2(Vector2.ZERO, W), Color(1, 1, 1, 0.12), false, 1.0)
	var lines := PackedVector2Array()
	for id in ["EXTERIOR_WALLS", "WALLS", "PARTITIONS"]:
		if not main.pack["cad"].has(id):
			continue
		for s in main.pack["cad"][id]["segments"]:
			var a := Vector2(float(s[0]), float(s[1]))
			var b := Vector2(float(s[2]), float(s[3]))
			if (a.x < mn.x and b.x < mn.x) or (a.x > mx.x and b.x > mx.x) or (a.y < mn.y and b.y < mn.y) or (a.y > mx.y and b.y > mx.y):
				continue
			lines.append(tr.call(a.clamp(mn, mx)))
			lines.append(tr.call(b.clamp(mn, mx)))
	if lines.size() > 1:
		mini.draw_multiline(lines, Color(0.78, 0.82, 0.9, 0.55), 1.0)
	var pl := PackedVector2Array()
	for q in rp:
		pl.append(tr.call(q))
	mini.draw_polyline(pl, Color(accent, 0.35), 3.0, true)
	var done := PackedVector2Array()
	var dist: float = main.pose["dist"]
	for k in range(rp.size()):
		if float(main.route_cum[k]) <= dist:
			done.append(tr.call(rp[k]))
	done.append(tr.call(main.pose["p"]))
	if done.size() > 1:
		mini.draw_polyline(done, accent, 3.5, true)
	for sid in main.stop_pos.keys():
		mini.draw_circle(tr.call(main.stop_pos[sid]), 4.0, Color(1, 1, 1, 0.85))
	var tp: Vector2 = tr.call(main.pose["p"])
	var pulse := 7.0 + 3.0 * sin(director.film_time * 5.0)
	mini.draw_circle(tp, pulse, Color(accent, 0.35))
	mini.draw_circle(tp, 5.0, Color.WHITE)
	mini.draw_string(ThemeDB.fallback_font, Vector2(12, 22), "2D PLAN  ·  CAD  ·  10 m grid", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(1, 1, 1, 0.65))
	var ten := 10.0 * sc
	mini.draw_line(Vector2(12, W.y - 14), Vector2(12 + ten, W.y - 14), Color.WHITE, 2.0)
	mini.draw_string(ThemeDB.fallback_font, Vector2(16 + ten, W.y - 9), "10 m", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.7))
