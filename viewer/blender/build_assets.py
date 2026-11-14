# Factory model library for the real-factory viewer, built procedurally in Blender (no downloads, no company data).
# Every model is made at its prefab's reference size (metres), origin at floor centre, Blender X = length, Y = depth, Z = up
# (glTF/Godot: X, -Z, Y). The viewer scales each instance to the footprint measured in the CAD.
# Run: blender -b --factory-startup --python viewer/blender/build_assets.py -- <out_dir>
import bpy, bmesh, math, sys, os
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- materials
MATS = {}
def mat(name, color, metal=0.0, rough=0.5, emit=None, emit_strength=0.0, alpha=1.0, coat=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    if not m.node_tree: m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if "Coat Weight" in b.inputs: b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0); b.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        try: m.surface_render_method = "BLENDED"
        except Exception: m.blend_method = "BLEND"
    MATS[name] = m; return m

def srgb(h):  # "#rrggbb" -> linear rgb
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

M = lambda: None
M.body = mat("machine_body", srgb("#d9dcd6"), 0.15, 0.38, coat=0.25)          # RAL 7035 light grey, painted
M.accent = mat("machine_accent", srgb("#1e5aa8"), 0.2, 0.32, coat=0.3)        # signal blue
M.dark = mat("machine_dark", srgb("#2b2f35"), 0.3, 0.45)
M.steel = mat("steel", srgb("#9aa1a8"), 0.9, 0.32)
M.chrome = mat("chrome", srgb("#e6e9ec"), 1.0, 0.08)
M.black = mat("rubber", srgb("#16181b"), 0.0, 0.7)
M.glass = mat("guard_glass", srgb("#cfe6f2"), 0.0, 0.05, alpha=0.28)
M.yellow = mat("safety_yellow", srgb("#f2b705"), 0.1, 0.4, coat=0.2)
M.orange = mat("robot_orange", srgb("#ef6c1a"), 0.15, 0.35, coat=0.3)
M.screen = mat("screen", srgb("#0b1830"), 0.0, 0.15, emit=srgb("#3aa0ff"), emit_strength=3.0)
M.green_l = mat("lamp_green", srgb("#14c45c"), 0.0, 0.2, emit=srgb("#20ff70"), emit_strength=6.0)
M.amber_l = mat("lamp_amber", srgb("#b07a10"), 0.0, 0.3, emit=srgb("#ffb020"), emit_strength=0.6)
M.red_l = mat("lamp_red", srgb("#701010"), 0.0, 0.3, emit=srgb("#ff3020"), emit_strength=0.4)
M.copper = mat("heater_band", srgb("#8a5a3c"), 0.85, 0.35)
M.wood = mat("pallet_wood", srgb("#b88a5a"), 0.0, 0.8)
M.carton = mat("carton", srgb("#c89b62"), 0.0, 0.85)
M.film = mat("stretch_film", srgb("#e8f0f4"), 0.0, 0.1, alpha=0.35)
M.bin_blue = mat("bin_blue", srgb("#1f62c9"), 0.0, 0.45)
M.bin_grey = mat("bin_grey", srgb("#5b6470"), 0.0, 0.5)
M.part = mat("part_gloss_black", srgb("#0d0e10"), 0.1, 0.12, coat=0.8)
M.rack_blue = mat("rack_upright", srgb("#1c4fa0"), 0.3, 0.4)
M.rack_orange = mat("rack_beam", srgb("#f26a1b"), 0.3, 0.38)
M.white = mat("white_panel", srgb("#f1f2f0"), 0.0, 0.35)
M.vest = mat("hi_vis_vest", srgb("#c8f01a"), 0.0, 0.55, emit=srgb("#c8f01a"), emit_strength=0.15)
M.skin = mat("skin", srgb("#c99a7a"), 0.0, 0.55)
M.navy = mat("work_navy", srgb("#1d2a44"), 0.0, 0.7)
M.cap = mat("safety_cap", srgb("#f5f5f2"), 0.0, 0.35, coat=0.4)
M.led = mat("led_strip", srgb("#0a3a50"), 0.0, 0.2, emit=srgb("#2ad4ff"), emit_strength=4.0)

# ---------------------------------------------------------------- primitives
def reset():   # remove the previous model's objects and meshes; materials are shared by all models
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes): bpy.data.meshes.remove(me)
def _finish(o, m, bevel=0.0, smooth=False, segs=2):
    o.data.materials.append(m)
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL"); b.width = bevel; b.segments = segs; b.limit_method = "ANGLE"; b.harden_normals = False
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    return o
def box(sx, sy, sz, x=0, y=0, z=0, m=None, bevel=0.01, rz=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2), rotation=(0, 0, rz)); o = bpy.context.object; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True); return _finish(o, m or M.body, bevel)
def cyl(r, h, x=0, y=0, z=0, m=None, axis="Z", verts=32, bevel=0.0):
    rot = {"Z": (0, 0, 0), "X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=(x, y, z), rotation=rot); return _finish(bpy.context.object, m or M.steel, bevel, smooth=True)
def cone(r1, r2, h, x=0, y=0, z=0, m=None, verts=32):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=h, vertices=verts, location=(x, y, z + h / 2)); return _finish(bpy.context.object, m or M.steel, 0, smooth=True)
def sphere(r, x=0, y=0, z=0, m=None, sx=1, sy=1, sz=1):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=24, ring_count=14, location=(x, y, z)); o = bpy.context.object; o.scale = (sx, sy, sz); bpy.ops.object.transform_apply(scale=True)
    return _finish(o, m or M.skin, 0, smooth=True)
def torus(R, r, x=0, y=0, z=0, m=None, axis="Z"):
    rot = {"Z": (0, 0, 0), "X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0)}[axis]
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=(x, y, z), rotation=rot, major_segments=32, minor_segments=12); return _finish(bpy.context.object, m or M.black, 0, smooth=True)
def tube(p0, p1, r, m=None, verts=16):
    a, b = Vector(p0), Vector(p1); d = b - a; L = d.length
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=L, vertices=verts, location=(a + b) / 2)
    o = bpy.context.object; o.rotation_mode = "QUATERNION"; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return _finish(o, m or M.steel, 0, smooth=True)

def export(name):
    for o in bpy.context.scene.objects: o.select_set(o.type == "MESH")
    bpy.context.view_layer.objects.active = next(o for o in bpy.context.scene.objects if o.type == "MESH")
    bpy.ops.object.convert(target="MESH")      # apply every part's bevel before joining (join keeps only the active part's modifiers)
    bpy.ops.object.join()
    o = bpy.context.object; o.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    print("ASSET", name, len(o.data.vertices), "verts ->", path)

# ---------------------------------------------------------------- models
def injection_machine():
    reset(); L, D = 11.0, 3.0
    box(10.6, 1.5, 0.75, 0, 0, 0.08, M.dark, 0.03)                         # machine bed
    for x in (-4.9, -1.5, 2.0, 4.9):
        for y in (-0.62, 0.62): box(0.3, 0.3, 0.08, x, y, 0, M.black, 0.01)  # levelling feet
    box(10.6, 1.56, 0.08, 0, 0, 0.83, M.accent, 0.01)                        # accent band
    # clamp unit (x -5.2 .. -0.6): rear platen, moving platen, fixed platen, tie bars, clamp cylinder
    for x, t in ((-5.0, 0.35), (-3.2, 0.42), (-0.9, 0.5)): box(t, 1.55, 1.75, x, 0, 0.91, M.steel if x != -3.2 else M.dark, 0.03)
    for y in (-0.6, 0.6):
        for z in (1.18, 2.42): cyl(0.075, 4.4, -2.95, y, z, M.chrome, "X")
    cyl(0.28, 1.2, -5.6, 0, 1.8, M.dark, "X", bevel=0.02); cyl(0.12, 1.6, -4.1, 0, 1.8, M.chrome, "X")
    # guard housing with glass doors (operator side +Y, rear -Y)
    box(4.9, 0.06, 1.45, -2.95, 0.98, 0.95, M.body, 0.02); box(4.9, 0.06, 1.45, -2.95, -0.98, 0.95, M.body, 0.02)
    for x in (-4.3, -2.95, -1.6):
        box(1.15, 0.03, 0.95, x, 1.015, 1.18, M.glass, 0.0); box(1.15, 0.03, 0.95, x, -1.015, 1.18, M.glass, 0.0)
        box(0.05, 0.08, 0.95, x - 0.6, 1.0, 1.18, M.dark, 0.0)
    box(4.9, 2.02, 0.08, -2.95, 0, 2.4, M.body, 0.02)                        # guard roof
    box(4.9, 0.08, 0.12, -2.95, 1.0, 2.28, M.accent, 0.01); box(4.9, 0.08, 0.12, -2.95, -1.0, 2.28, M.accent, 0.01)
    # injection unit (x -0.4 .. 5.2): carriage, barrel with heater bands, nozzle, screw drive, hopper, dryer
    box(5.4, 1.1, 0.55, 2.4, 0, 0.83, M.body, 0.04); box(1.4, 1.2, 1.1, 4.4, 0, 0.83, M.body, 0.05)
    box(1.42, 1.22, 0.1, 4.4, 0, 1.93, M.accent, 0.01)
    cyl(0.16, 3.6, 1.7, 0, 1.62, M.steel, "X"); cone(0.16, 0.05, 0.35, 0, 0, 0, M.chrome).location = (-0.2, 0, 1.62)
    bpy.context.object.rotation_euler = (0, -math.pi / 2, 0)
    for i in range(6): cyl(0.2, 0.32, 0.4 + i * 0.52, 0, 1.62, M.copper, "X", bevel=0.01)
    box(3.7, 0.7, 0.04, 1.7, 0, 1.38, M.dark, 0.0)
    cyl(0.32, 0.9, 3.0, 0, 2.25, M.body, bevel=0.02); cone(0.32, 0.08, 0.55, 3.0, 0, 1.6, M.steel)   # hopper
    cyl(0.36, 0.08, 3.0, 0, 2.72, M.accent); cyl(0.26, 1.2, 3.0, 0, 3.32, M.white, bevel=0.02)           # dryer
    tube((3.0, 0, 3.9), (3.0, 0.9, 3.9), 0.05, M.steel); tube((3.0, 0.9, 3.9), (3.0, 0.9, 0.9), 0.05, M.steel)
    # control panel (operator side), stack light
    box(0.75, 0.5, 1.75, 0.6, 1.25, 0, M.body, 0.03); box(0.58, 0.04, 0.42, 0.6, 1.5, 1.15, M.screen, 0.0)
    box(0.6, 0.12, 0.08, 0.6, 1.52, 0.98, M.dark, 0.01)
    cyl(0.03, 0.4, -0.6, 1.0, 2.6, M.steel); cyl(0.06, 0.1, -0.6, 1.0, 2.86, M.green_l); cyl(0.06, 0.1, -0.6, 1.0, 2.97, M.amber_l); cyl(0.06, 0.1, -0.6, 1.0, 3.08, M.red_l)
    # take-out robot (gantry over the clamp) and part chute + conveyor
    for x in (-4.6, -1.3): box(0.18, 0.18, 0.9, x, 0.7, 2.48, M.orange, 0.02)
    box(3.6, 0.22, 0.22, -2.95, 0.7, 3.38, M.orange, 0.02); box(0.3, 0.3, 0.3, -2.95, 0.35, 3.3, M.orange, 0.03)
    box(0.12, 0.12, 0.9, -2.95, 0.35, 2.45, M.steel, 0.01); box(0.5, 0.06, 0.4, -2.95, 0.35, 2.35, M.dark, 0.01)
    box(1.6, 0.6, 0.06, -2.4, 1.75, 0.72, M.black, 0.01); box(1.66, 0.66, 0.1, -2.4, 1.75, 0.62, M.steel, 0.01)
    for x in (-3.1, -1.7):
        for y in (1.5, 2.0): box(0.06, 0.06, 0.62, x, y, 0, M.steel, 0.0)
    box(0.6, 0.45, 0.02, -2.4, 1.75, 0.79, M.part, 0.005)
    export("injection_machine")

def aux_unit():
    reset(); box(2.0, 1.0, 1.55, 0, 0, 0.05, M.white, 0.04); box(2.02, 1.02, 0.05, 0, 0, 0.0, M.dark, 0.01)
    for i in range(7): box(0.04, 0.02, 0.9, -0.85 + i * 0.12, 0.505, 0.35, M.dark, 0.0)
    box(0.36, 0.03, 0.22, 0.6, 0.51, 1.15, M.screen, 0.0); box(2.02, 1.02, 0.06, 0, 0, 1.6, M.accent, 0.01)
    tube((0.7, -0.3, 1.66), (0.7, -0.3, 2.0), 0.05, M.steel); tube((0.7, -0.3, 2.0), (0.7, -1.2, 2.0), 0.05, M.steel)
    export("aux_unit")

def equipment():
    reset(); L = 6.0
    box(L, 1.2, 0.06, 0, 0, 0.86, M.steel, 0.01)
    for x in (-2.85, -1.0, 1.0, 2.85):
        for y in (-0.5, 0.5): box(0.06, 0.06, 0.86, x, y, 0, M.dark, 0.0)
    for i, x in enumerate((-2.0, 0.0, 2.0)): box(1.3, 0.9, 0.6, x, 0, 0.92, (M.body, M.white, M.body)[i], 0.03); box(0.4, 0.03, 0.25, x, 0.46, 1.15, M.screen, 0)
    box(L, 0.05, 0.05, 0, 0, 2.0, M.steel, 0.0); box(L - 0.4, 0.25, 0.04, 0, 0, 1.96, M.led, 0.0)
    for x in (-2.9, 2.9): box(0.05, 0.05, 1.1, x, 0, 0.92, M.steel, 0.0)
    export("equipment")

def rack():
    reset(); L, D, H = 4.5, 1.2, 2.5
    for x in (-L / 2 + 0.05, 0, L / 2 - 0.05):
        for y in (-D / 2 + 0.05, D / 2 - 0.05): box(0.08, 0.08, H, x, y, 0, M.rack_blue, 0.005)
        for z in (0.3, 1.2, 2.1): tube((x, -D / 2 + 0.05, z), (x, D / 2 - 0.05, z + 0.25), 0.012, M.rack_blue)
    import random; random.seed(7)
    for z in (0.12, 0.95, 1.8):
        for y in (-D / 2 + 0.05, D / 2 - 0.05): box(L, 0.05, 0.11, 0, y, z, M.rack_orange, 0.005)
        box(L - 0.1, D - 0.1, 0.02, 0, 0, z + 0.11, M.steel, 0.0)
        x = -L / 2 + 0.35
        while x < L / 2 - 0.35:
            w = random.choice((0.4, 0.6, 0.6)); h = random.choice((0.3, 0.4, 0.5)); m = random.choice((M.bin_blue, M.bin_grey, M.carton, M.carton))
            box(w - 0.04, D - 0.25, h, x + w / 2 - 0.2, 0, z + 0.13, m, 0.012); x += w
    export("rack")

def pallet():
    reset(); L, D = 1.3, 1.0
    for y in (-0.42, 0, 0.42): box(L, 0.1, 0.1, 0, y, 0, M.wood, 0.005)
    for x in (-0.6, -0.3, 0, 0.3, 0.6): box(0.12, D, 0.022, x, 0, 0.1, M.wood, 0.003)
    for i in range(2):
        for j in range(2):
            for k in range(2): box(0.6, 0.47, 0.5, -0.32 + i * 0.64, -0.245 + j * 0.49, 0.125 + k * 0.5, M.carton, 0.01)
    box(1.29, 0.99, 1.0, 0, 0, 0.125, M.film, 0.0)
    box(0.18, 0.005, 0.12, 0.2, 0.497, 0.8, M.white, 0.0)
    export("pallet")

def crane_bridge():
    reset(); W, S = 4.6, 16.4                                                # bridge spans Y (16.4 m), rails along X
    for x in (-0.65, 0.65): box(0.5, S - 0.4, 0.95, x, 0, 0.15, M.yellow, 0.02)        # double girder
    for y in (-S / 2 + 0.3, S / 2 - 0.3):
        box(W, 0.55, 0.55, 0, y, 0.0, M.yellow, 0.03)                                  # end trucks
        for x in (-W / 2 + 0.4, W / 2 - 0.4): cyl(0.2, 0.12, x, y, 0.0, M.dark, "Y")
    for y in (-3.0, 3.0): box(1.6, 0.06, 0.06, 0, y, 1.12, M.black, 0.0)
    box(1.9, 1.6, 0.6, 0, 1.5, 1.1, M.yellow, 0.03); cyl(0.32, 1.3, 0, 1.5, 1.4, M.dark, "X")      # hoist trolley + drum
    box(0.5, 0.4, 0.35, 0.65, 1.5, 1.72, M.dark, 0.02)
    for x in (-0.12, 0.12): tube((x, 1.5, 1.1), (x, 1.5, -2.6), 0.012, M.steel)                    # ropes
    box(0.42, 0.24, 0.4, 0, 1.5, -2.95, M.yellow, 0.03); tube((0, 1.5, -2.95), (0, 1.5, -3.25), 0.04, M.steel)
    torus(0.12, 0.035, 0, 1.5, -3.38, M.steel, "X")
    box(0.3, 0.15, 0.2, 0.95, -S / 2 + 1.2, 0.0, M.amber_l, 0.01)
    export("crane_bridge")

def trolley():
    reset(); L, D, H = 1.2, 0.8, 1.05
    for x in (-L / 2 + 0.03, L / 2 - 0.03):
        for y in (-D / 2 + 0.03, D / 2 - 0.03): tube((x, y, 0.16), (x, y, H), 0.017, M.steel)
    for z in (0.2, 0.62, H):
        for y in (-D / 2 + 0.03, D / 2 - 0.03): tube((-L / 2 + 0.03, y, z), (L / 2 - 0.03, y, z), 0.016, M.steel)
        for x in (-L / 2 + 0.03, L / 2 - 0.03): tube((x, -D / 2 + 0.03, z), (x, D / 2 - 0.03, z), 0.016, M.steel)
    box(L - 0.04, D - 0.04, 0.025, 0, 0, 0.2, M.bin_grey, 0.004); box(L - 0.04, D - 0.04, 0.025, 0, 0, 0.62, M.bin_grey, 0.004)
    for x in (-L / 2 + 0.1, L / 2 - 0.1):                                       # castors
        for y in (-D / 2 + 0.1, D / 2 - 0.1):
            box(0.07, 0.06, 0.05, x, y, 0.13, M.dark, 0.005); cyl(0.065, 0.045, x, y, 0.065, M.black, "Y"); cyl(0.03, 0.05, x, y, 0.065, M.steel, "Y")
    tube((-L / 2 - 0.02, -D / 2 + 0.05, H), (-L / 2 - 0.2, -D / 2 + 0.05, H + 0.08), 0.016, M.steel)   # push handle
    tube((-L / 2 - 0.02, D / 2 - 0.05, H), (-L / 2 - 0.2, D / 2 - 0.05, H + 0.08), 0.016, M.steel)
    tube((-L / 2 - 0.2, -D / 2 + 0.05, H + 0.08), (-L / 2 - 0.2, D / 2 - 0.05, H + 0.08), 0.02, M.black)
    for z in (0.225, 0.645):                                                    # part trays with glossy injected covers
        for i in range(2):
            box(0.55, D - 0.1, 0.17, -0.29 + i * 0.58, 0, z, M.bin_blue, 0.012)
            for k in range(4): box(0.48, 0.012, 0.15, -0.29 + i * 0.58, -0.25 + k * 0.165, z + 0.03, M.part, 0.003)
    box(0.16, 0.005, 0.1, 0.3, D / 2 - 0.02, 0.95, M.white, 0.0)               # item slip
    box(0.06, 0.005, 0.04, 0.43, D / 2 - 0.02, 0.98, M.led, 0.0)               # RFID tag
    export("trolley")

def agv():
    reset(); L, D = 1.4, 0.9
    box(L, D, 0.24, 0, 0, 0.06, M.dark, 0.05); box(L + 0.04, D + 0.04, 0.06, 0, 0, 0.06, M.yellow, 0.02)
    box(L - 0.2, D - 0.2, 0.03, 0, 0, 0.3, M.steel, 0.01); box(L + 0.01, 0.02, 0.03, 0, D / 2 + 0.005, 0.2, M.led, 0.0); box(L + 0.01, 0.02, 0.03, 0, -D / 2 - 0.005, 0.2, M.led, 0.0)
    cyl(0.07, 0.07, L / 2 - 0.12, 0, 0.34, M.black); cyl(0.05, 0.02, L / 2 - 0.12, 0, 0.39, M.led)
    for x in (-0.35, 0.35): cyl(0.05, 0.12, x, 0, 0.36, M.chrome)
    for x in (-0.5, 0.5):
        for y in (-0.36, 0.36): cyl(0.05, 0.04, x, y, 0.05, M.black, "Y")
    export("agv")

def pc_station():
    reset(); box(0.6, 0.5, 0.05, 0, 0, 0, M.dark, 0.01); box(0.08, 0.08, 1.05, 0, -0.1, 0.05, M.steel, 0.005)
    box(0.55, 0.45, 0.03, 0, 0, 1.0, M.steel, 0.005); box(0.45, 0.16, 0.025, 0, 0.08, 1.03, M.dark, 0.005)
    box(0.52, 0.035, 0.33, 0, -0.13, 1.25, M.dark, 0.008); box(0.48, 0.004, 0.29, 0, -0.11, 1.27, M.screen, 0.0)
    box(0.2, 0.25, 0.16, 0.38, 0, 0.98, M.white, 0.01); box(0.06, 0.04, 0.14, -0.22, 0.12, 1.04, M.black, 0.004)
    export("pc_station")

def rfid_gate():
    reset(); W, H = 3.2, 2.8
    for x in (-W / 2 + 0.1, W / 2 - 0.1):
        box(0.2, 0.4, H, x, 0, 0, M.white, 0.03); box(0.04, 0.32, 1.6, x + (0.11 if x < 0 else -0.11), 0, 0.6, M.accent, 0.01)
        box(0.24, 0.44, 0.08, x, 0, 0, M.dark, 0.01)
    box(W, 0.4, 0.22, 0, 0, H - 0.22, M.white, 0.03); box(W - 0.4, 0.42, 0.05, 0, 0, H - 0.2, M.led, 0.0)
    cyl(0.07, 0.12, W / 2 - 0.2, 0, H + 0.06, M.green_l)
    for x in (-0.8, 0.8): box(0.5, 0.3, 0.06, x, 0, H - 0.28, M.steel, 0.01)
    export("rfid_gate")

def scanner():
    reset(); box(0.4, 0.4, 0.04, 0, 0, 0, M.dark, 0.01); box(0.06, 0.06, 1.05, 0, 0, 0.04, M.steel, 0.005)
    box(0.3, 0.22, 0.03, 0, 0, 1.08, M.dark, 0.01); box(0.24, 0.004, 0.16, 0, -0.11, 1.18, M.screen, 0.0)
    box(0.07, 0.16, 0.05, 0.08, 0.04, 1.12, M.yellow, 0.01); box(0.04, 0.05, 0.12, 0.08, 0.1, 1.04, M.black, 0.005)
    export("scanner")

def operator():   # material handler in a pushing pose, ~1.75 m, facing +X, hands at the trolley handle height (1.1 m)
    reset()
    def limb(p0, p1, r0, r1, m):
        a, b = Vector(p0), Vector(p1); d = b - a
        bpy.ops.mesh.primitive_cone_add(radius1=r0, radius2=r1, depth=d.length, vertices=20, location=(a + b) / 2)
        o = bpy.context.object; o.rotation_mode = "QUATERNION"; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        _finish(o, m, 0, smooth=True); return o
    for y, step in ((-0.1, 0.12), (0.1, -0.1)):                       # legs mid-stride
        knee = (0.02 + step * 0.5, y, 0.5); hip = (0.0, y * 0.9, 0.93); ankle = (step, y, 0.09)
        limb(hip, knee, 0.075, 0.06, M.navy); limb(knee, ankle, 0.058, 0.045, M.navy)
        box(0.27, 0.11, 0.09, step + 0.05, y, 0.0, M.black, 0.03)         # safety boots
    box(0.24, 0.34, 0.2, 0.0, 0, 0.88, M.navy, 0.05)                     # pelvis
    torso = box(0.26, 0.4, 0.5, 0.06, 0, 1.04, M.navy, 0.07); torso.rotation_euler = (0, math.radians(14), 0)
    vest = box(0.29, 0.43, 0.42, 0.08, 0, 1.08, M.vest, 0.06); vest.rotation_euler = (0, math.radians(14), 0)
    for z in (1.2, 1.32): box(0.3, 0.44, 0.035, 0.1 + (z - 1.2) * 0.25, 0, z, M.white, 0.01).rotation_euler = (0, math.radians(14), 0)   # reflective bands
    for y in (-0.23, 0.23):                                              # arms reaching to the handle
        sh = (0.13, y, 1.43); el = (0.33, y * 1.05, 1.22); hand = (0.55, y * 0.95, 1.12)
        sphere(0.065, *sh, M.vest); limb(sh, el, 0.058, 0.05, M.vest); limb(el, hand, 0.048, 0.04, M.navy)
        sphere(0.047, *hand, M.black, sx=1.3, sy=1.0, sz=0.9)              # gloves
    limb((0.15, 0, 1.47), (0.19, 0, 1.56), 0.05, 0.048, M.skin)          # neck
    sphere(0.105, 0.22, 0, 1.66, M.skin, sx=1.0, sy=0.88, sz=1.12)       # head
    sphere(0.125, 0.21, 0, 1.73, M.cap, sx=1.08, sy=1.0, sz=0.72)        # hard hat
    box(0.13, 0.2, 0.015, 0.33, 0, 1.69, M.cap, 0.005)                   # brim
    export("operator")
def column():
    reset(); H = 9.0
    box(0.4, 0.4, H, 0, 0, 0, M.steel, 0.005)
    for i in range(6): box(0.46, 0.46, 0.2, 0, 0, i * 0.2, M.yellow if i % 2 == 0 else M.black, 0.005)
    box(0.5, 0.5, 0.1, 0, 0, 0, M.dark, 0.01)
    export("column")

def smt_module():   # SMT line machine (mounter / printer / reflow style): cabinet, top cover with window, signal tower, monitor, conveyor
    reset(); L, D = 4.0, 1.6
    box(L, D, 0.9, 0, 0, 0.12, M.white, 0.03); box(L + 0.02, D + 0.02, 0.12, 0, 0, 0.0, M.dark, 0.01)
    box(L - 0.1, D - 0.1, 0.42, 0, 0, 1.02, M.body, 0.06); box(L * 0.55, 0.02, 0.28, -0.4, D / 2 - 0.04, 1.08, M.glass, 0.0)
    box(L, 0.08, 0.06, 0, D / 2 - 0.03, 0.95, M.accent, 0.005)
    for y in (-0.25, 0.25): box(L + 0.5, 0.05, 0.05, 0, y, 0.9, M.steel, 0.0)                 # board conveyor rails
    box(0.42, 0.04, 0.3, L / 2 - 0.35, D / 2 + 0.06, 1.2, M.dark, 0.01); box(0.38, 0.005, 0.26, L / 2 - 0.35, D / 2 + 0.085, 1.22, M.screen, 0.0)
    cyl(0.025, 0.35, -L / 2 + 0.2, D / 2 - 0.2, 1.62, M.steel); cyl(0.05, 0.07, -L / 2 + 0.2, D / 2 - 0.2, 1.83, M.green_l); cyl(0.05, 0.07, -L / 2 + 0.2, D / 2 - 0.2, 1.9, M.amber_l)
    for x in (-1.2, 0.0, 1.2): box(0.6, 0.03, 0.5, x, -D / 2 - 0.0, 0.3, M.dark, 0.01)
    export("smt_module")

def eps_machine():   # EPS shape molding machine: frame, two platens, steam chests, pipes, hopper, control box
    reset(); L, D = 4.0, 2.5
    box(L, D, 0.3, 0, 0, 0, M.dark, 0.03)
    for x in (-L / 2 + 0.2, L / 2 - 0.2):
        for y in (-D / 2 + 0.2, D / 2 - 0.2): box(0.25, 0.25, 3.0, x, y, 0.3, M.accent, 0.02)
    box(L, D, 0.3, 0, 0, 3.0, M.accent, 0.03)
    box(L - 0.7, D - 0.5, 0.7, 0, 0, 0.6, M.steel, 0.03); box(L - 0.7, D - 0.5, 0.7, 0, 0, 1.5, M.body, 0.03)
    cyl(0.1, 0.6, 0, 0, 2.55, M.chrome); box(1.0, 0.6, 0.55, 0, 0, 3.3, M.white, 0.03); cone(0.35, 0.08, 0.5, 0, 0, 3.85, M.steel)
    for y in (-0.6, 0.6): tube((L / 2 - 0.2, y, 1.0), (L / 2 + 0.6, y, 1.0), 0.07, M.copper); tube((L / 2 + 0.6, y, 1.0), (L / 2 + 0.6, y, 3.6), 0.07, M.copper)
    box(0.7, 0.4, 1.6, -L / 2 - 0.5, D / 2 - 0.4, 0, M.body, 0.03); box(0.5, 0.03, 0.35, -L / 2 - 0.5, D / 2 - 0.19, 1.15, M.screen, 0.0)
    export("eps_machine")

def table():   # work table / desk
    reset(); L, D = 1.6, 0.8
    box(L, D, 0.04, 0, 0, 0.74, M.white, 0.01); box(L, D, 0.02, 0, 0, 0.72, M.accent, 0.0)
    for x in (-L / 2 + 0.06, L / 2 - 0.06):
        for y in (-D / 2 + 0.06, D / 2 - 0.06): box(0.05, 0.05, 0.72, x, y, 0, M.steel, 0.005)
    box(L - 0.12, 0.03, 0.1, 0, -D / 2 + 0.06, 0.62, M.steel, 0.0)
    box(0.5, 0.35, 0.03, -0.35, 0.05, 0.78, M.bin_grey, 0.005); box(0.38, 0.03, 0.26, 0.35, -0.2, 0.78, M.dark, 0.005); box(0.34, 0.004, 0.22, 0.35, -0.19, 0.8, M.screen, 0.0)
    export("table")

def bin_cart():   # roll container with bins
    reset(); L, D = 1.0, 0.7
    box(L, D, 0.05, 0, 0, 0.12, M.steel, 0.01)
    for x in (-L / 2 + 0.08, L / 2 - 0.08):
        for y in (-D / 2 + 0.08, D / 2 - 0.08): cyl(0.05, 0.04, x, y, 0.05, M.black, "Y")
    for x in (-L / 2 + 0.02, L / 2 - 0.02): box(0.03, D, 0.95, x, 0, 0.17, M.steel, 0.005)
    for z in (0.18, 0.5, 0.82): box(L - 0.1, D - 0.06, 0.28, 0, 0, z, M.bin_blue, 0.015)
    export("bin_cart")

def bollard():
    reset(); cyl(0.1, 1.05, 0, 0, 0.525, M.yellow, bevel=0.01)
    for z in (0.75, 0.9): cyl(0.102, 0.06, 0, 0, z, M.black)
    cyl(0.14, 0.04, 0, 0, 0.02, M.dark)
    export("bollard")

def lift_shaft():   # goods elevator: steel frame, glass panels, landing doors at 1F and 2F (6 m), car, machine room
    reset(); W, H = 3.0, 9.5
    for x in (-W / 2 + 0.1, W / 2 - 0.1):
        for y in (-W / 2 + 0.1, W / 2 - 0.1): box(0.2, 0.2, H, x, y, 0, M.accent, 0.01)
    for z in (0.0, 3.0, 6.0, 9.0): 
        for s in (-1, 1): box(W, 0.12, 0.15, 0, s * (W / 2 - 0.1), z, M.accent, 0.01); box(0.12, W, 0.15, s * (W / 2 - 0.1), 0, z, M.accent, 0.01)
    for s in (-1, 1): box(0.03, W - 0.4, H - 0.6, s * (W / 2 - 0.1), 0, 0.3, M.glass, 0.0)
    box(W - 0.4, 0.03, H - 0.6, 0, W / 2 - 0.1, 0.3, M.glass, 0.0)
    for z in (0.0, 6.0): box(1.8, 0.08, 2.4, 0, -W / 2 + 0.05, z + 0.1, M.steel, 0.01); box(1.9, 0.1, 0.12, 0, -W / 2 + 0.03, z + 2.55, M.amber_l, 0.0)
    box(W - 0.5, W - 0.5, 0.2, 0, 0, 0.0, M.dark, 0.02); box(W - 0.6, 0.06, 2.2, 0, W / 2 - 0.4, 0.2, M.white, 0.01)
    box(W + 0.2, W + 0.2, 1.0, 0, 0, H - 0.5, M.white, 0.03)
    export("lift_shaft")

for f in (lift_shaft, smt_module, eps_machine, table, bin_cart, bollard, injection_machine, aux_unit, equipment, rack, pallet, crane_bridge, trolley, agv, pc_station, rfid_gate, scanner, operator, column):
    f()
print("DONE", OUT)
