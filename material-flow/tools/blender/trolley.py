# Hero asset: a parts trolley carrying injection-moulded TV rear covers. Real metres, origin on the floor, forward = +Y in Blender (+Z in three.js).
# Run: blender -b --python tools/blender/trolley.py -- <out.glb>
import bpy, sys, math
out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgb, rough, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    return m
steel = mat("frame_blue", (.05, .17, .5), .42, .1)
zinc = mat("zinc", (.6, .62, .65), .35, 1)
rubber = mat("rubber", (.02, .02, .025), .75)
yellow = mat("handle_yellow", (.95, .6, .03), .4)
plastic = mat("cover_plastic", (.018, .02, .026), .46)
plastic2 = mat("cover_detail", (.05, .055, .065), .38)
label = mat("label_white", (.85, .86, .88), .5)

def box(sx, sy, sz, loc, m, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.scale = (sx, sy, sz); bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new("b", "BEVEL"); b.width = bevel; b.segments = 2; b.limit_method = "ANGLE"
    return o
def tube(r, length, loc, rot, m):
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=r, depth=length, location=loc, rotation=rot); o = bpy.context.object; o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o

L, W, H = 1.62, .98, 1.18
# base and posts
box(W, L, .05, (0, 0, .24), steel, .012)
for sx in (-1, 1):
    box(.04, L, .04, (sx * (W / 2 - .02), 0, H), steel)
    for sy in (-1, 0, 1):
        box(.04, .04, H - .24, (sx * (W / 2 - .02), sy * (L / 2 - .02), (H + .24) / 2), steel)
for sy in (-1, 1):
    box(W, .04, .04, (0, sy * (L / 2 - .02), H), steel)
    box(W, .03, .03, (0, sy * (L / 2 - .02), .72), steel)
# push handle
tube(.018, W * .9, (0, -L / 2 - .1, 1.02), (0, math.pi / 2, 0), yellow)
for sx in (-1, 1): tube(.018, .12, (sx * W * .44, -L / 2 - .05, 1.02), (math.pi / 2, 0, 0), yellow)
# casters
for sx in (-1, 1):
    for sy in (-1, 1):
        x, y = sx * (W / 2 - .09), sy * (L / 2 - .1)
        box(.07, .09, .07, (x, y, .185), zinc, .006)
        tube(.075, .05, (x, y, .08), (0, math.pi / 2, 0), rubber)
        tube(.03, .058, (x, y, .08), (0, math.pi / 2, 0), zinc)
# slot rails that keep the covers apart
slots = 7; pitch = (W - .2) / (slots - 1)
for i in range(slots):
    x = -(W - .2) / 2 + i * pitch
    for z in (.285, 1.135):
        for sy in (-1, 1): box(.012, .1, .02, (x + .02, sy * (L / 2 - .08), z), zinc, 0)
# rear covers, standing on the long edge
CW, CH, CT = 1.45, .84, .012
for i in range(slots):
    x = -(W - .2) / 2 + i * pitch; zc = .285 + CH / 2 + .012
    box(CT, CW, CH, (x, 0, zc), plastic, .005)
    box(.03, CW * .46, CH * .44, (x + .02, 0, zc - .02), plastic, .012)            # the raised centre pod
    box(.008, CW * .22, CH * .12, (x + .036, CW * .1, zc + .02), plastic2, .002)    # terminal window
    for k in range(-4, 5):                                                          # vent slots
        box(.006, .012, CH * .2, (x + .009, CW * .36 + k * .022 - .02, zc + CH * .22), plastic2, 0)
    for sy in (-1, 1):
        for sz in (-1, 1): tube(.014, .02, (x + .012, sy * CW * .4, zc + sz * CH * .34), (0, math.pi / 2, 0), plastic2)
    box(.003, .1, .05, (x + .037, -CW * .12, zc - .06), label, 0)                   # lot label
for o in bpy.data.objects:
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
    o.select_set(False)
bpy.ops.object.select_all(action="SELECT"); bpy.context.view_layer.objects.active = bpy.data.objects[0]; bpy.ops.object.join()
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
me = bpy.data.objects[0].data
print("TROLLEY", len(me.vertices), "vertices", len(me.polygons), "faces", len(me.materials), "materials")
