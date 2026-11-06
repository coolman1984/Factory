# Factory hero models, real metres, origin on the floor at the centre, one GLB each.
# injection: long axis X. forklift: forward = -Y (three.js +Z). truck: rear = +Y (three.js -Z).
# Run: blender -b --python tools/blender/models.py -- <out folder>
import bpy, sys, math
out = sys.argv[sys.argv.index("--") + 1]

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True); global MATS; MATS = {}
def mat(name, rgb, rough, metal=0.0, emit=None):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if emit: b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = 2
    MATS[name] = m; return m
def box(sx, sy, sz, loc, m, bevel=.02, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.object; o.scale = (sx, sy, sz); bpy.ops.object.transform_apply(scale=True); o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new("b", "BEVEL"); b.width = bevel; b.segments = 2; b.limit_method = "ANGLE"
    return o
def cyl(r, l, loc, axis, m, v=20):
    rot = {"x": (0, math.pi / 2, 0), "y": (math.pi / 2, 0, 0), "z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=l, location=loc, rotation=rot); o = bpy.context.object; o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o
def cone(r1, r2, l, loc, m):
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=r1, radius2=r2, depth=l, location=loc); o = bpy.context.object; o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o
def finish(name):
    for o in bpy.data.objects:
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
        o.select_set(False)
    bpy.ops.object.select_all(action="SELECT"); bpy.context.view_layer.objects.active = bpy.data.objects[0]; bpy.ops.object.join()
    bpy.ops.export_scene.gltf(filepath=f"{out}/{name}.glb", export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    me = bpy.data.objects[0].data; print("MODEL", name, len(me.vertices), "vertices", len(me.materials), "materials")

def injection():
    reset()
    white = mat("machine_white", (.78, .8, .82), .38, .05); blue = mat("machine_blue", (.03, .16, .46), .34, .15); dark = mat("base_dark", (.05, .055, .065), .55, .2)
    steel = mat("steel", (.72, .74, .77), .22, 1); chrome = mat("chrome", (.86, .87, .89), .1, 1); glass = mat("window", (.25, .4, .5), .08, .3)
    screen = mat("hmi", (.02, .05, .09), .2, 0, (.1, .55, .9)); red = mat("estop", (.7, .03, .03), .4); green = mat("lamp_green", (.05, .6, .15), .3, 0, (.1, 1, .3)); yellow = mat("warn_yellow", (.9, .6, .03), .4)
    L, W = 13.5, 2.6
    box(L, W * .86, .75, (0, 0, .42), dark, .03); box(L + .12, W * .9, .09, (0, 0, .045), dark, .01)
    # clamp unit, left half
    for x, w in ((-5.9, .5), (-3.4, .55), (-1.1, .65)): box(w, W * .84, 1.95, (x, 0, 1.75), blue, .05)
    for y in (-.8, .8):
        for z in (1.1, 2.4): cyl(.095, 5.2, (-3.5, y, z), "x", chrome)
    box(.7, .9, .9, (-4.7, 0, 1.75), steel, .03); cyl(.3, .9, (-6.5, 0, 1.75), "x", steel)
    # guards with windows, along both sides of the clamp
    for s in (-1, 1):
        box(4.6, .05, 1.55, (-3.5, s * 1.14, 1.85), white, .012); box(2.1, .03, .85, (-3.9, s * 1.17, 2.0), glass, .01); box(1.2, .03, .85, (-1.95, s * 1.17, 2.0), glass, .01)
        box(.05, .04, 1.5, (-2.65, s * 1.17, 1.85), dark, .005)
    box(4.7, 2.3, .05, (-3.5, 0, 2.66), white, .012)
    # injection unit, right half
    box(4.9, 1.05, .34, (2.3, 0, 1.0), steel, .02); cyl(.13, 3.1, (1.25, 0, 1.75), "x", chrome); cone(.13, .03, .35, (-.47, 0, 1.75), steel).rotation_euler = (0, -math.pi / 2, 0)
    for x in (.2, .7, 1.2, 1.7, 2.2): cyl(.17, .3, (x, 0, 1.75), "x", yellow if x == .2 else dark)
    box(1.3, 1.1, 1.05, (3.5, 0, 1.75), blue, .05); box(1.25, .7, .75, (4.9, 0, 1.55), blue, .05); cyl(.24, .7, (5.8, 0, 1.55), "x", steel)
    cyl(.34, .55, (2.6, 0, 2.62), "z", white); cone(.34, .12, .42, (2.6, 0, 2.12), steel); cyl(.14, .22, (2.6, 0, 1.95), "z", steel)
    # cabinet, operator panel, stack lamp
    box(3.3, .55, 1.65, (3.0, 1.0, 1.25), white, .02)
    for x in (2.1, 3.0, 3.9): box(.8, .02, 1.4, (x, .73, 1.25), mat("door_line", (.62, .64, .67), .4), .004)
    box(.05, .75, .55, (-.42, 1.32, 1.75), dark, .01); box(.02, .66, .44, (-.395, 1.32, 1.75), screen, 0); cyl(.04, .04, (-.39, 1.05, 1.5), "x", red, 12)
    cyl(.025, .8, (-1.0, -1.15, 3.05), "z", steel, 10); cyl(.06, .16, (-1.0, -1.15, 3.5), "z", green, 12)
    finish("injection")

def forklift():
    reset()
    body = mat("fork_yellow", (.95, .56, .02), .36, .05); dark = mat("fork_dark", (.04, .045, .05), .45, .3); tyre = mat("tyre", (.015, .015, .018), .8); steel = mat("fork_steel", (.32, .34, .37), .35, .9); seat = mat("seat", (.03, .03, .035), .6); hub = mat("hub", (.8, .55, .05), .4, .2)
    box(1.1, 1.45, .55, (0, .15, .62), body, .05); box(1.08, .55, .75, (0, .78, .78), dark, .07); box(1.06, .95, .12, (0, .1, .95), dark, .02)
    box(.5, .5, .1, (0, .3, 1.08), seat, .03); box(.5, .1, .55, (0, .55, 1.32), seat, .03)
    box(.08, .35, .45, (0, -.3, 1.2), dark, .01); cyl(.17, .03, (0, -.28, 1.42), "z", seat, 16)
    for sx in (-.47, .47):
        for sy, h in ((-.52, 1.15), (.62, 1.1)): box(.06, .06, h, (sx, sy, 1.55), dark, .012)
    box(1.0, 1.25, .05, (0, .05, 2.12), dark, .012)
    for y in (-.25, .05, .35): box(.94, .03, .03, (0, y, 2.15), dark, 0)
    for sx in (-.5, .5):
        cyl(.3, .24, (sx, -.47, .3), "x", tyre); cyl(.17, .25, (sx, -.47, .3), "x", hub)
        cyl(.24, .2, (sx, .62, .25), "x", tyre); cyl(.13, .21, (sx, .62, .25), "x", hub)
    for sx in (-.27, .27): box(.1, .12, 2.2, (sx, -.87, 1.15), steel, .015)
    for z in (.3, 1.3, 2.2): box(.62, .08, .07, (0, -.87, z), steel, .01)
    box(.86, .06, .5, (0, -.99, .46), dark, .012)
    for sx in (-.26, .26):
        box(.12, 1.15, .045, (sx, -1.56, .17), dark, .006); box(.12, .045, .42, (sx, -1.01, .38), dark, .006)
    finish("forklift")

def truck():
    reset()
    white = mat("trailer_white", (.84, .85, .87), .3, .05); blue = mat("cab_blue", (.03, .2, .55), .24, .25); dark = mat("chassis", (.04, .045, .05), .5, .4); tyre = mat("tyre", (.015, .015, .018), .8); glass = mat("glass", (.05, .1, .14), .06, .6); hub = mat("hub_steel", (.65, .67, .7), .3, .9); stripe = mat("stripe", (.03, .2, .55), .3, .1); tail = mat("tail", (.6, .03, .03), .4, 0, (.8, .05, .05)); inner = mat("inner", (.1, .11, .13), .7)
    box(2.5, 9.2, 2.6, (0, 1.2, 2.5), white, .03); box(2.52, 9.22, .22, (0, 1.2, 1.5), stripe, .01)
    for y in range(-3, 6): box(2.53, .03, 2.5, (0, y * 1.0 + .7, 2.5), mat("rib", (.72, .73, .75), .4), 0)
    box(2.3, .02, 2.4, (0, 5.81, 2.5), inner, 0)
    box(2.2, 11.6, .24, (0, 0, 1.03), dark, .02)
    # cab
    box(2.45, 2.0, 2.05, (0, -4.75, 2.1), blue, .13); box(2.4, 1.1, .9, (0, -4.85, 3.5), blue, .16); box(2.2, .05, .95, (0, -5.77, 2.65), glass, .02)
    for s in (-1, 1): box(.03, .9, .7, (s * 1.23, -5.0, 2.65), glass, .01); box(.1, .1, .3, (s * 1.32, -5.55, 2.7), dark, .02); box(.3, .05, .16, (s * .85, -5.77, 1.55), mat("lamp", (.9, .9, .85), .2, 0, (1, 1, .8)), .01)
    box(2.3, .1, .32, (0, -5.8, 1.15), dark, .03); box(1.5, .04, .45, (0, -5.79, 1.75), dark, .01)
    for y in (-4.6, -1.8, 3.4, 4.6):
        for s in (-1, 1):
            cyl(.52, .34, (s * 1.0, y, .52), "x", tyre, 24); cyl(.3, .35, (s * 1.0, y, .52), "x", hub, 16)
    for s in (-1, 1): box(.34, .05, .14, (s * 1.0, 5.82, 1.28), tail, .01)
    finish("truck")

injection(); forklift(); truck()
