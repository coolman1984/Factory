# High-detail factory hero models, real metres, origin on the floor at the centre, one GLB each.
# Same axes / origin / overall sizes as models.py so the GLBs swap in with no other change:
#   injection: long axis X, footprint 13.6 x 2.75 m. forklift: forward = -Y (three.js +Z).
#   truck: rear = +Y (three.js -Z), 2.5 x 11.8 m. Every model stays under 12,000 exported vertices.
# Material rule kept: a material whose name contains "window" or "glass" is exported transparent.
# Run: blender -b --python tools/blender/models_hd.py -- <out folder>
import bpy, sys, math, mathutils
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
def hose(r, t, loc, rot, m, maj=12, mnr=6):
    # a coiled hydraulic / water hose: a smooth torus loop of major radius r, tube radius t
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=t, major_segments=maj, minor_segments=mnr, location=loc, rotation=rot); o = bpy.context.object; o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o
def plate(sx, sz, loc, m, rot=(0, 0, 0)):
    # a thin panel / decal used for nameplates, safety labels and reflector strips
    return box(sx, .012, sz, loc, m, 0, rot)
def finish(name):
    for o in bpy.data.objects:
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
        o.select_set(False)
    bpy.ops.object.select_all(action="SELECT"); bpy.context.view_layer.objects.active = bpy.data.objects[0]; bpy.ops.object.join()
    bpy.ops.export_scene.gltf(filepath=f"{out}/{name}.glb", export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    o = bpy.data.objects[0]; me = o.data
    c = [o.matrix_world @ mathutils.Vector(v) for v in o.bound_box]
    d = (max(v.x for v in c) - min(v.x for v in c), max(v.y for v in c) - min(v.y for v in c), max(v.z for v in c) - min(v.z for v in c))
    print("MODEL", name, len(me.vertices), "vertices", len(me.materials), "materials")
    print("SIZE", name, round(d[0], 3), "x", round(d[1], 3), "x", round(d[2], 3), " (X x Y x Z m, floor z=0)")
def injection():
    reset()
    white = mat("machine_white", (.78, .8, .82), .38, .05); blue = mat("machine_blue", (.03, .16, .46), .34, .15)
    dark = mat("base_dark", (.05, .055, .065), .55, .2); steel = mat("steel", (.72, .74, .77), .22, 1)
    chrome = mat("chrome", (.86, .87, .89), .1, 1); glass = mat("window", (.25, .4, .5), .08, .3)
    screen = mat("hmi", (.02, .05, .09), .2, 0, (.1, .55, .9)); red = mat("estop", (.7, .03, .03), .4)
    green = mat("lamp_green", (.05, .6, .15), .3, 0, (.1, 1, .3)); yellow = mat("warn_yellow", (.9, .6, .03), .4)
    line = mat("door_line", (.62, .64, .67), .4); rubber = mat("hose_black", (.03, .03, .035), .7)
    copper = mat("copper", (.72, .42, .18), .3, 1); label = mat("nameplate", (.86, .87, .89), .35, .6)
    # base slab on eight levelling feet (foot pad, threaded screw, lock nut)
    box(13.6, 2.3, .12, (0, 0, .18), dark, .012)
    for fx in (-6.4, -2.2, 2.2, 6.4):
        for fy in (-1.0, 1.0):
            box(.26, .26, .06, (fx, fy, .03), dark, .008)
            cyl(.055, .18, (fx, fy, .12), "z", chrome, 10)
            cyl(.09, .03, (fx, fy, .215), "z", steel, 10)
    # clamp unit: fixed / moving / support platens, four tie bars with nuts, toggle links, ejector
    box(.55, 2.3, 1.9, (-5.9, 0, 1.9), blue, .05); box(.6, 2.3, 1.9, (-3.4, 0, 1.9), blue, .05); box(.7, 2.3, 1.9, (-1.1, 0, 1.9), blue, .05)
    for y in (-.85, .85):
        for z in (1.25, 2.55): cyl(.095, 5.6, (-3.5, y, z), "x", chrome)
    for x in (-6.25, -5.55, -1.45, -.75):
        for y in (-.85, .85):
            for z in (1.25, 2.55): cyl(.17, .14, (x, y, z), "x", steel, 8)
    for y in (-.7, .7):
        for (x0, x1, z0, z1) in ((-4.9, -4.0, 1.05, 1.75), (-4.0, -3.4, 1.75, 2.4), (-2.6, -1.7, 1.0, 1.9)):
            box(math.hypot(x1 - x0, z1 - z0), .07, .1, ((x0 + x1) / 2, y, (z0 + z1) / 2), steel, 0, (0, -math.atan2(z1 - z0, x1 - x0), 0))
    cyl(.32, .9, (-6.35, 0, 1.9), "x", steel, 16); cyl(.12, 1.8, (-4.2, 0, 1.9), "x", steel, 12); box(.6, .6, .34, (-5.0, 0, 1.9), steel, .03)
    # sheet-metal guard doors with windows, split lines, hinges, handles and a yellow safety label
    for s in (-1, 1):
        box(5.1, .06, 1.75, (-3.5, s * 1.28, 1.95), white, .012); box(2.3, .03, .95, (-4.05, s * 1.31, 2.05), glass); box(1.5, .03, .95, (-1.95, s * 1.31, 2.05), glass)
        box(.05, .05, 1.7, (-2.85, s * 1.31, 1.95), line, 0)
        for hz in (1.3, 1.95, 2.6): box(.1, .07, .16, (-5.9, s * 1.32, hz), line, 0)
        box(.06, .07, .5, (-1.15, s * 1.33, 1.95), steel, 0); cyl(.03, .3, (-1.15, s * 1.34, 1.95), "z", steel, 8)
        plate(.28, .2, (-4.9, s * 1.35, 1.4), yellow)
    box(5.4, 2.3, .07, (-3.5, 0, 2.88), white, .012)
    # robot arm stub mounted on top of the clamp
    cyl(.18, .14, (-2.5, 0, 2.97), "z", dark, 12); box(.34, .34, .3, (-2.5, 0, 3.11), blue, .02)
    box(.13, .13, .42, (-2.5, .04, 3.3), dark, .01); cyl(.075, .16, (-2.5, .04, 3.47), "x", steel, 10)
    # injection unit: bed, barrel with heater bands, nozzle, screw + drive housings, motor
    box(5.4, 1.1, .42, (2.6, 0, 1.05), steel, .02); cyl(.14, 3.6, (1.3, 0, 1.9), "x", chrome)
    for i, x in enumerate((.0, .35, .7, 1.05, 1.4, 1.75)): cyl(.175, .13, (x, 0, 1.9), "x", yellow if i == 0 else dark, 10)
    cone(.14, .04, .4, (-1.05, 0, 1.9), chrome).rotation_euler = (0, -math.pi / 2, 0)
    box(1.6, 1.1, 1.15, (3.9, 0, 1.9), blue, .05); box(1.4, .9, .9, (5.3, 0, 1.75), blue, .05); cyl(.28, .9, (6.3, 0, 1.75), "x", steel, 16); cyl(.1, .5, (5.9, -1.0, 1.75), "x", steel, 10)
    # hopper with lid, throat, material loader and pipe
    cyl(.4, .62, (2.7, 0, 2.95), "z", white, 16); cone(.4, .16, .55, (2.7, 0, 2.4), steel); cyl(.42, .05, (2.7, 0, 3.28), "z", white, 16)
    cyl(.05, .14, (2.42, 0, 3.33), "z", steel, 8); box(.34, .34, .7, (2.7, .62, 3.0), white, .02); cyl(.07, .5, (2.7, .3, 3.0), "x", copper, 10)
    # control cabinet: door lines, handles, indicator lamps, louver vents, nameplate, safety label
    box(3.7, .62, 1.9, (3.4, 1.05, 1.45), white, .02)
    for x in (2.2, 3.4, 4.6):
        box(.9, .02, 1.6, (x, .75, 1.45), line, .004); box(.05, .04, .34, (x + .4, .72, 1.45), steel, 0)
    cyl(.05, .05, (2.2, .72, .75), "z", green, 8)
    for i in range(7): box(2.6, .03, .035, (3.4, .77, .75 + i * .08), dark, 0)
    plate(.5, .16, (4.5, .76, 2.15), label); plate(.24, .18, (2.6, .76, .95), yellow)
    # HMI on a swivel arm from the cabinet
    cyl(.06, .8, (1.5, 1.05, 2.5), "z", steel, 10); cyl(.09, .12, (1.5, 1.05, 2.85), "z", dark, 10); box(.55, .1, .1, (1.2, 1.05, 2.85), steel, 0)
    box(.06, .6, .55, (.92, 1.05, 2.85), dark, .01); box(.02, .5, .44, (.88, 1.05, 2.85), screen, 0); cyl(.03, .04, (.86, 1.25, 2.6), "x", red, 10)
    # cable tray with rungs, hydraulic + water manifolds, coiled hoses
    box(11.0, .22, .06, (.5, -1.18, 2.5), steel, 0)
    for i in range(14): box(.06, .22, .04, (-4.8 + i * .8, -1.18, 2.53), dark, 0)
    box(.34, .32, .3, (.3, 0, .95), steel, .01); box(.34, .32, .3, (4.6, 0, .95), steel, .01)
    for i in range(3): cyl(.035, .1, (.3, -.18 + i * .18, 1.14), "z", chrome, 8)
    hose(.22, .05, (-.6, .9, 1.05), (0, math.pi / 2, 0), rubber); hose(.22, .05, (5.0, .9, 1.05), (0, math.pi / 2, 0), rubber); hose(.2, .04, (1.0, -1.0, 1.6), (math.pi / 2, 0, 0), copper)
    # stack lamp
    cyl(.03, .8, (-1.0, -1.1, 3.05), "z", steel, 8); cyl(.07, .16, (-1.0, -1.1, 3.5), "z", green, 12)
    finish("injection")
def forklift():
    reset()
    body = mat("fork_yellow", (.95, .56, .02), .36, .05); dark = mat("fork_dark", (.04, .045, .05), .45, .3)
    tyre = mat("tyre", (.015, .015, .018), .8); steel = mat("fork_steel", (.32, .34, .37), .35, .9)
    seat = mat("seat", (.03, .03, .035), .6); hub = mat("hub", (.8, .55, .05), .4, .2)
    chrome = mat("fork_chrome", (.85, .86, .88), .12, 1); glass = mat("mirror_glass", (.2, .28, .34), .05, 1)
    amber = mat("beacon_amber", (.95, .5, .02), .3, 0, (1, .45, .03)); belt = mat("seat_belt", (.35, .03, .03), .5)
    lamp = mat("work_lamp", (.9, .9, .85), .2, 0, (1, 1, .85)); red = mat("fork_red", (.7, .03, .03), .4)
    # chassis, engine hood, rounded cast counterweight (rear, +Y), side vents
    box(1.08, 1.5, .5, (0, .1, .6), body, .06); box(1.0, .92, .5, (0, .5, .95), body, .05)
    box(1.1, .5, .86, (0, .78, .68), body, .14); cyl(.34, .5, (0, .72, .62), "x", body, 20)
    for sx in (-1, 1): box(.04, .62, .3, (sx * .55, .2, .62), dark, 0)
    box(1.06, .95, .12, (0, .1, .92), dark, .02)
    # overhead guard: four posts, roof, three rails
    for sx in (-.47, .47):
        for sy, h in ((-.52, 1.15), (.62, 1.1)): box(.06, .06, h, (sx, sy, 1.55), dark, .012)
    box(1.04, 1.3, .05, (0, .05, 2.14), dark, .012)
    for y in (-.28, .05, .38): box(.98, .03, .03, (0, y, 2.17), dark, 0)
    # mast, cross members, carriage, forks, load backrest, lift chains, mast rollers
    for sx in (-.27, .27): box(.1, .12, 2.2, (sx, -.87, 1.15), steel, .015)
    for z in (.3, 1.3, 2.2): box(.62, .08, .07, (0, -.87, z), steel, .01)
    box(.86, .06, .5, (0, -.99, .46), dark, .012)
    for sx in (-.26, .26):
        box(.12, 1.15, .045, (sx, -1.56, .17), dark, .006); box(.12, .045, .42, (sx, -1.01, .38), dark, .006)
    for sx in (-.3, -.15, 0, .15, .3): box(.03, .04, .7, (sx, -1.06, .85), steel, 0)
    for z in (.62, 1.0): box(.72, .04, .03, (0, -1.06, z), steel, 0)
    for sx in (-.14, .14): cyl(.022, 1.7, (sx, -.93, 1.3), "z", steel, 8)
    for sx in (-.25, .25):
        for z in (.55, 1.85): cyl(.06, .14, (sx, -.79, z), "x", steel, 10)
    # tilt cylinders (mast to frame)
    for sx in (-.34, .34):
        box(.1, .78, .1, (sx, -.42, .82), steel, .012, (-.3, 0, 0)); box(.055, .5, .055, (sx, -.12, .68), chrome, .01, (-.3, 0, 0))
    # steering wheel on a column, three spokes
    cyl(.028, .55, (0, -.28, .95), "z", dark, 8); hose(.14, .022, (0, -.33, 1.2), (math.pi / 2, 0, 0), seat, 14, 6)
    for a in (0, math.pi / 3, 2 * math.pi / 3): box(.28, .02, .02, (0, -.33, 1.2), seat, 0, (a, 0, 0))
    # seat with lap + shoulder belt
    box(.55, .55, .12, (0, .3, 1.0), seat, .03); box(.55, .12, .6, (0, .55, 1.3), seat, .04)
    box(.58, .03, .06, (0, .35, 1.1), belt, 0); box(.06, .03, .5, (.14, .5, 1.32), belt, 0, (0, 0, .12))
    # amber beacon on the guard, two work lamps, two mirrors
    cyl(.04, .05, (.42, .5, 2.04), "z", dark, 10); cyl(.07, .13, (.42, .5, 2.13), "z", amber, 12)
    for sx in (-.4, .4): box(.12, .05, .12, (sx, -.6, 2.0), lamp, .01)
    for sx in (-.52, .52):
        box(.02, .06, .3, (sx, -.5, 1.86), dark, 0); box(.03, .16, .22, (sx, -.56, 1.98), glass, 0)
    # side step with grab handle, rear counterweight light
    box(.3, .3, .06, (.48, .1, .34), dark, .01); cyl(.02, .3, (.47, -.05, .55), "z", steel, 8)
    box(.14, .05, .1, (0, 1.03, .5), red, .01)
    # four wheels: tyre, hub, two tread rings each
    for sx in (-.5, .5):
        cyl(.3, .24, (sx, -.47, .3), "x", tyre, 20); cyl(.17, .25, (sx, -.47, .3), "x", hub, 16)
        cyl(.315, .035, (sx, -.47 - .07, .3), "x", tyre, 20); cyl(.315, .035, (sx, -.47 + .07, .3), "x", tyre, 20)
        cyl(.24, .2, (sx, .62, .25), "x", tyre, 20); cyl(.13, .21, (sx, .62, .25), "x", hub, 12)
        cyl(.255, .03, (sx, .62 - .055, .25), "x", tyre, 20); cyl(.255, .03, (sx, .62 + .055, .25), "x", tyre, 20)
    finish("forklift")
def truck():
    reset()
    white = mat("trailer_white", (.84, .85, .87), .3, .05); blue = mat("cab_blue", (.03, .2, .55), .24, .25)
    dark = mat("chassis", (.04, .045, .05), .5, .4); tyre = mat("tyre", (.015, .015, .018), .8)
    glass = mat("glass", (.05, .1, .14), .06, .6); hub = mat("hub_steel", (.65, .67, .7), .3, .9)
    stripe = mat("stripe", (.03, .2, .55), .3, .1); tail = mat("tail", (.6, .03, .03), .4, 0, (.8, .05, .05))
    inner = mat("inner", (.1, .11, .13), .7); rib = mat("rib", (.72, .73, .75), .4)
    amber = mat("truck_amber", (.9, .5, .03), .35, 0, (1, .5, .05)); lamp = mat("truck_lamp", (.9, .9, .85), .2, 0, (1, 1, .8))
    redr = mat("reflector_red", (.75, .04, .04), .3); amberr = mat("reflector_amber", (.85, .5, .03), .3)
    line = mat("cab_line", (.6, .62, .66), .4)
    # chassis: two rails with cross members, widening at the kingpin
    for sx in (-.75, .75): box(.14, 10.6, .3, (sx, -.55, .98), dark, .01)
    for i in range(6): box(1.6, .1, .12, (0, -5.0 + i * 1.8, 1.06), dark, 0)
    # trailer built from panels so the rear is open: side walls, roof, floor, front, inner linings, outer ribs
    for sx in (-1.2, 1.2): box(.06, 8.05, 2.55, (sx, .725, 2.545), white, .01)
    box(2.5, 8.05, .06, (0, .725, 3.79), white, .01); box(2.5, 8.05, .08, (0, .725, 1.35), inner, .01)
    box(2.5, .06, 2.55, (0, -3.27, 2.545), white, .01)
    for sx in (-1.19, 1.19): box(.02, 7.95, 2.42, (sx, .7, 2.545), white, 0)
    for i in range(9): box(2.5, .03, 2.55, (0, -3.0 + i * .97, 2.545), rib, 0)
    box(2.5, 8.07, .22, (0, .725, 1.6), stripe, .01)
    # rear corner posts + door opening frame
    for sx in (-1.2, 1.2): box(.1, .1, 2.62, (sx, 4.72, 2.545), rib, .01)
    box(2.5, .07, .1, (0, 4.72, 3.83), white, 0); box(2.5, .07, .1, (0, 4.72, 1.32), white, 0)
    # rear doors open ~90 deg: each hinges on its outer edge and swings out to +Y
    for sx in (-1, 1):
        box(.06, 1.15, 2.4, (sx * 1.19, 5.325, 2.545), white, .01)
        for hy in (4.95, 5.7): box(.1, .1, .12, (sx * 1.2, hy, 2.545), dark, .01)
        for cy in (5.05, 5.6): cyl(.022, 2.2, (sx * 1.15, cy, 2.545), "z", dark, 8)
        box(.05, .06, .3, (sx * 1.16, 5.55, 1.7), dark, 0)
        box(.04, .4, .1, (sx * 1.16, 5.5, .5), redr, 0); box(.04, .2, .1, (sx * 1.16, 4.95, .5), amberr, 0)
    # landing legs (outer sleeve, inner leg, foot plate, crank)
    for sx in (-.5, .5):
        box(.18, .18, .72, (sx, -2.75, .52), dark, .01); box(.12, .12, .5, (sx, -2.75, .32), hub, .01)
        box(.3, .3, .06, (sx, -2.75, .03), dark, .01); cyl(.02, .35, (sx, -2.9, .34), "y", dark, 8)
    # side guards, mudguards, fuel tank, air tanks
    for sx in (-1.18, 1.18): box(.05, 3.4, .34, (sx, .8, .95), stripe, .01)
    for sx in (-1, 1):
        box(.34, 1.0, .16, (sx * 1.06, 3.1, 1.2), dark, .04); box(.34, .9, .16, (sx * 1.06, -4.6, 1.24), dark, .04)
    box(.4, 1.2, .66, (1.05, -3.75, 1.15), hub, .04)
    for i in range(2): box(.42, .04, .7, (1.0, -4.2 + i * .9, 1.15), dark, 0)
    for cy in (-2.3, -1.1): cyl(.14, 1.0, (-1.02, cy, .72), "y", hub, 12)
    # cab: body, roof deflector, grille, windshield wipers, door lines, handles, mirrors, lights, bumper, exhaust
    box(2.4, 2.3, 2.0, (0, -4.75, 2.1), blue, .14); box(2.34, 1.2, .85, (0, -4.85, 3.5), blue, .16)
    box(2.0, .08, 1.0, (0, -5.84, 2.1), dark, .03)
    for i in range(5): box(1.9, .05, .09, (0, -5.81, 1.72 + i * .17), dark, 0)
    box(2.15, .06, 1.0, (0, -5.80, 2.66), glass, .02)
    for sx in (-.5, .5): box(.5, .03, .03, (sx, -5.83, 2.2), dark, 0, (.35, 0, 0))
    for sx in (-1, 1):
        box(.03, .02, 1.55, (sx * 1.21, -4.6, 2.15), line, 0); box(.06, .06, .1, (sx * 1.22, -4.85, 1.95), dark, 0)
        box(.03, .95, .72, (sx * 1.2, -4.85, 2.66), glass, .01)
        box(.06, .12, .4, (sx * 1.2, -5.4, 3.0), dark, 0); box(.03, .1, .34, (sx * 1.23, -5.4, 3.0), glass, 0)
        box(.3, .05, .18, (sx * .85, -5.84, 1.5), lamp, .01); box(.1, .05, .16, (sx * 1.05, -5.84, 1.35), amber, .01)
    box(2.34, .12, .34, (0, -5.84, 1.12), dark, .03); box(1.4, .04, .4, (0, -5.83, 1.72), dark, .01)
    cyl(.06, 1.0, (1.08, -3.95, 3.3), "z", hub, 12)
    # wheels: two steering, four trailer (tandem)
    for sy in (-4.6, 2.6, 3.6):
        for sx in (-1.0, 1.0):
            cyl(.52, .34, (sx, sy, .52), "x", tyre, 20); cyl(.3, .35, (sx, sy, .52), "x", hub, 16)
    for sx in (-1.05, 1.05): box(.3, .06, .18, (sx, 4.72, 1.15), tail, .01)
    finish("truck")
injection(); forklift(); truck()
