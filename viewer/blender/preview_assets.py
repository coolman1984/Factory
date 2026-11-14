# Contact sheet of the model library (Eevee), for visual review. blender -b --factory-startup --python preview_assets.py -- <assets_dir> <out.png>
import bpy, sys, os, math
a = sys.argv[sys.argv.index("--") + 1:]; src, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 2400, 1350
names = ["injection_machine", "crane_bridge", "trolley", "agv", "operator", "rfid_gate", "pc_station", "scanner", "rack", "pallet", "aux_unit", "equipment", "column"]
slots = {"injection_machine": (-7, 6), "crane_bridge": (14, 6), "trolley": (-11, -4), "agv": (-8.5, -4), "operator": (-6.2, -4), "rfid_gate": (-2.5, -4), "pc_station": (1, -4), "scanner": (2.6, -4), "rack": (7, -4), "pallet": (11, -4), "aux_unit": (14, -4), "equipment": (2, 4), "column": (19, -4)}
for n in names:
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, n + ".glb"))
    for o in bpy.context.selected_objects:
        if o.parent is None: o.location = (*slots[n], 0)
bpy.ops.mesh.primitive_plane_add(size=80, location=(4, 0, 0)); fl = bpy.context.object; m = bpy.data.materials.new("floor"); m.use_nodes = True
b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (0.5, 0.52, 0.5, 1); b.inputs["Roughness"].default_value = 0.35; fl.data.materials.append(m)
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.6, 0.65, 0.72, 1); w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), math.radians(10), math.radians(35))); bpy.context.object.data.energy = 3.5
bpy.ops.object.light_add(type="AREA", location=(4, -14, 12)); L = bpy.context.object; L.data.energy = 9000; L.data.size = 14; L.rotation_euler = (math.radians(50), 0, 0)
bpy.ops.object.camera_add(location=(4, -26, 15), rotation=(math.radians(62), 0, 0)); c = bpy.context.object; c.data.lens = 28; sc.camera = c
sc.render.filepath = out; bpy.ops.render.render(write_still=True); print("PREVIEW", out)
