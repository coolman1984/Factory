# Bakes the light of each floor with Cycles: soft sun shadows, sky light and contact ambient occlusion from the real geometry.
# A top-down orthographic render of a white floor; the objects cast light and shadow but are invisible to the camera,
# so the image is pure light on the floor. Runtime then needs no shadow maps: it multiplies this texture on the floor.
# Run: blender -b --python tools/blender/bake_floor.py -- <replica.json> <out folder> <px per point> <samples>
import bpy, json, sys, math
from pathlib import Path
a = sys.argv[sys.argv.index("--") + 1:]; R = json.loads(Path(a[0]).read_text()); out = Path(a[1]); PX = float(a[2]); SAMPLES = int(a[3]); M = 1 / R["scale"]
PLATES = {"E1": (21, 157, 529, 337), "E2-1F": (555, 305, 355, 137), "E2-2F": (724.5, 143.5, 222, 159)}

def cube(x, y, z0, sx, sy, sz, rot=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -y, z0 + sz / 2), rotation=(0, 0, rot)); o = bpy.context.object; o.scale = (sx, sy, sz); return o
def clean():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)

for name, (x0, y0, w, h) in PLATES.items():
    clean(); sc = bpy.context.scene
    grey = bpy.data.materials.get("g") or bpy.data.materials.new("g"); grey.use_nodes = True; grey.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.55, .57, .6, 1); grey.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .7
    white = bpy.data.materials.get("w") or bpy.data.materials.new("w"); white.use_nodes = True; white.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.8, .8, .8, 1)
    objs = []
    for wl in R["walls"]:
        if wl["plate"] != name: continue
        (ax, ay), (bx, by) = wl["a"], wl["b"]; L = math.hypot(bx - ax, by - ay); objs.append(cube((ax + bx) / 2, (ay + by) / 2, 0, L + 1.3, 1.3, 3.6 * M, math.atan2(-(by - ay), bx - ax)))
    for c in R["columns"]:
        if c["plate"] == name: objs.append(cube(c["p"][0], c["p"][1], 0, 2, 2, 8.5 * M))
    for r in R["racks"]:
        if r["plate"] == name:   # a rack is mostly air: posts and shelves let light through, so its body is a slatted stack
            lv = 3 if name == "E2-2F" else 4
            for l in range(lv): objs.append(cube(r["x"] + r["w"] / 2, r["y"] + r["h"] / 2, l * 1.75 * M + 1, r["w"], r["h"], 1.35 * M))
    for m in R["machines"]:
        if m["plate"] == name:
            hgt = {"injection": 2.6, "press": 4.2, "utility": 2.6, "dock": .4, "cell": 3.5}[m["type"]] * M; objs.append(cube(m["x"] + m["w"] / 2, m["y"] + m["h"] / 2, 0, m["w"] * .92, m["h"] * .8, hgt))
    for t in R["trucks"]:
        if t["plate"] == name: objs.append(cube(t["x"] + t["w"] / 2, t["y"] + t["h"] / 2, 1.2, t["w"] * .78, t["h"], 3.2 * M))
    for q in R["conveyors"]:
        if q["plate"] != name: continue
        for p, r in zip(q["pts"], q["pts"][1:]):
            L = math.hypot(r[0] - p[0], r[1] - p[1]); objs.append(cube((p[0] + r[0]) / 2, (p[1] + r[1]) / 2, 2.2, L, 3.6, 1.2, math.atan2(-(r[1] - p[1]), r[0] - p[0])))
    for o in objs:
        o.data.materials.append(grey); o.visible_camera = False
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x0 + w / 2, -(y0 + h / 2), 0)); fl = bpy.context.object; fl.scale = (w + 40, h + 40, 1); fl.data.materials.append(white)
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(42), 0, math.radians(-38))); s = bpy.context.object; s.data.energy = 2.2; s.data.angle = math.radians(14)
    wd = bpy.data.worlds.get("W") or bpy.data.worlds.new("W"); wd.use_nodes = True; wd.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1); wd.node_tree.nodes["Background"].inputs[1].default_value = .85; sc.world = wd
    bpy.ops.object.camera_add(location=(x0 + w / 2, -(y0 + h / 2), 300), rotation=(0, 0, 0)); cam = bpy.context.object; cam.data.type = "ORTHO"; cam.data.ortho_scale = max(w, h); cam.data.clip_end = 1000; sc.camera = cam
    sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 3; sc.cycles.use_adaptive_sampling = True
    sc.render.resolution_x = int(w * PX); sc.render.resolution_y = int(h * PX); sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "BW"
    sc.render.filepath = str(out / f"light_{name}.png"); bpy.ops.render.render(write_still=True); print("BAKED", name, sc.render.resolution_x, sc.render.resolution_y)
