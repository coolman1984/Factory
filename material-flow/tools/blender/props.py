# Props, real metres, origin on the floor at the centre, one GLB each, PBR values only.
# press: H-frame hydraulic press (frame X, forward -Y). agv: low-deck AGV, forward = -Y (three.js +Z).
# utility: electrical / chiller cabinet group. pallet: euro pallet + shrink-wrapped 6-carton stack.
# Run: blender -b --python tools/blender/props.py -- <out folder>
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

def pallet_at(cx, cy, z0, sx, sy, board, block):
    # euro-style deck: 3 bottom boards, 9 blocks, 5 top boards, total height .144
    bh, th = .1, .022
    for y in (-sy / 2 + .05, 0, sy / 2 - .05): box(sx, .1, th, (cx, cy + y, z0 + th / 2), board, .006)
    for x in (-sx / 2 + .06, 0, sx / 2 - .06):
        for y in (-sy / 2 + .05, 0, sy / 2 - .05): box(.12, .1, bh, (cx + x, cy + y, z0 + th + bh / 2), block, .006)
    for i in range(5): box(sx, sy * .15, th, (cx, cy + (i / 4 - .5) * sy * .84, z0 + th + bh + th / 2), board, .006)

def press():
    reset()
    grey = mat("press_grey", (.5, .52, .55), .5, .3); blue = mat("press_blue", (.03, .16, .46), .34, .15)
    steel = mat("press_steel", (.72, .74, .77), .22, 1); dark = mat("press_dark", (.05, .055, .065), .55, .2)
    screen = mat("press_screen", (.02, .05, .09), .2, 0, (.1, .55, .9)); amber = mat("press_curtain", (.9, .6, .03), .3, 0, (1, .55, .05))
    red = mat("press_estop", (.7, .03, .03), .4); green = mat("press_lamp", (.05, .6, .15), .3, 0, (.1, 1, .3))
    # floor plate, base slab, bed
    box(3.2, 1.8, .06, (0, 0, .03), dark, .01); box(3.2, 1.6, .35, (0, 0, .175), grey, .03); box(2.6, 1.2, .16, (0, 0, .43), steel, .02)
    for sx in (-1.35, 1.35):
        for sy in (-.7, .7): cyl(.06, .18, (sx, sy, .09), "z", dark, 12)
    # H-frame columns + crown
    for sx in (-1.35, 1.35): box(.5, 1.2, 2.8, (sx, 0, 1.75), blue, .05)
    box(3.2, 1.4, .5, (0, 0, 3.35), blue, .05)
    # hydraulics: cylinder, ram, platens
    cyl(.3, .55, (0, 0, 2.9), "z", steel); cyl(.17, 1.4, (0, 0, 2.15), "z", steel)
    box(2.4, 1.2, .22, (0, 0, 3.02), steel, .02); box(1.5, 1.1, .32, (0, 0, 1.5), steel, .03)
    # safety light-curtain posts (front, -Y)
    for sx in (-1.05, 1.05):
        box(.1, .1, 2.1, (sx, -.95, 1.05), dark, .008); box(.05, .05, 1.9, (sx, -.975, 1.05), amber, .004)
    box(2.2, .1, .1, (0, -.95, 2.12), dark, .01)
    # control box with screen + e-stop
    box(.52, .34, .72, (1.34, -.8, 1.35), grey, .02); box(.34, .03, .42, (1.34, -.98, 1.42), screen, 0); cyl(.04, .06, (1.34, -.98, 1.02), "y", red, 12)
    # signal tower on the left column
    cyl(.025, .9, (-1.35, -.55, 2.75), "z", steel, 8); cyl(.065, .14, (-1.35, -.55, 3.27), "z", green, 12); cyl(.065, .14, (-1.35, -.55, 3.4), "z", amber, 12)
    finish("press")

def agv():
    reset()
    dark = mat("agv_dark", (.05, .055, .07), .42, .3); blue = mat("agv_blue", (.03, .16, .5), .3, .15)
    green = mat("agv_green", (.05, .65, .2), .25, 0, (.1, 1, .35)); tyre = mat("agv_tyre", (.015, .015, .018), .8)
    board = mat("agv_board", (.55, .4, .24), .62); block = mat("agv_block", (.46, .32, .18), .68); card = mat("agv_card", (.6, .45, .28), .72)
    # low-deck chassis + deck plate
    box(.96, 1.56, .24, (0, 0, .19), dark, .03); box(1.0, 1.6, .07, (0, 0, .315), dark, .02)
    # blue bumpers front (-Y) and rear (+Y)
    for sy in (-.77, .77): box(.98, .06, .16, (0, sy, .16), blue, .012)
    for sx in (-.485, .485): box(.03, 1.5, .1, (sx, 0, .16), blue, .008)
    # drive wheels
    for sx in (-.36, .36):
        for sy in (-.55, .55): cyl(.07, .08, (sx, sy, .07), "x", tyre, 16)
    # status light + front sensor strip
    cyl(.05, .06, (.42, -.6, .36), "z", green, 14); box(.16, .04, .06, (-.3, -.775, .2), green, 0)
    # load: pallet (X .8, Y 1.2) + two cartons
    pallet_at(0, 0, .35, .8, 1.2, board, block)
    for sx in (-.2, .2): box(.36, 1.1, .42, (sx, 0, .35 + .144 + .21), card, .02)
    finish("agv")

def utility():
    reset()
    grey = mat("ut_grey", (.6, .62, .64), .42, .25); panel = mat("ut_panel", (.52, .54, .57), .45, .2)
    dark = mat("ut_dark", (.06, .065, .075), .55, .25); steel = mat("ut_steel", (.72, .74, .77), .24, 1)
    copper = mat("ut_copper", (.72, .42, .18), .3, 1); vent = mat("ut_vent", (.09, .1, .11), .6, .3)
    # plinth + two cabinets + top cap
    box(2.4, 1.2, .08, (0, 0, .04), dark, .01)
    for cx in (-.62, .62):
        box(1.1, 1.1, 1.94, (cx, 0, 1.05), grey, .02); box(.94, .04, 1.66, (cx, -.56, 1.03), panel, .01)
        box(.03, .05, .28, (cx + .4, -.57, 1.2), steel, .008)
    box(2.4, 1.2, .06, (0, 0, 2.05), grey, .02)
    # louver vents on both doors
    for cx in (-.62, .62):
        for i in range(6): box(.7, .03, .025, (cx, -.575, .5 + i * .06), vent, 0)
    # roof pipes (electrical conduit + chiller refrigerant)
    for y in (-.35, 0, .35): cyl(.06, 2.2, (0, y, 2.13), "x", steel, 16)
    for y in (-.35, .35): cyl(.06, .14, (-.9, y, 2.12), "z", copper, 12)
    cyl(.05, 1.6, (0, -.5, 2.13), "x", copper, 12)
    finish("utility")

def pallet():
    reset()
    board = mat("pal_board", (.55, .4, .24), .62); block = mat("pal_block", (.46, .32, .18), .68)
    card = mat("pal_card", (.6, .45, .28), .72); tape = mat("pal_tape", (.42, .32, .2), .6)
    pallet_at(0, 0, 0, 1.2, .8, board, block)
    z0 = .144
    # 6 cartons: 3 along X, 2 tiers, top at 1.1 m
    for sx in (-.4, 0, .4):
        for tz in (z0 + .239, z0 + .717): box(.4, .78, .478, (sx, 0, tz), card, .015)
    # vertical carton seams
    for sx in (-.2, .2): box(.03, .78, .956, (sx, 0, z0 + .478), tape, 0)
    # two stretch-wrap bands around the stack
    for zt in (z0 + .22, z0 + .72):
        box(1.19, .02, .07, (0, -.39, zt), tape, 0); box(1.19, .02, .07, (0, .39, zt), tape, 0)
        box(.02, .79, .07, (-.59, 0, zt), tape, 0); box(.02, .79, .07, (.59, 0, zt), tape, 0)
    box(.02, .78, .03, (0, 0, z0 + .941), tape, 0)
    finish("pallet")

press(); agv(); utility(); pallet()
