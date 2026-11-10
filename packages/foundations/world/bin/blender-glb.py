# Run by models.mjs inside Blender (headless): FBX/OBJ in, one .glb out with the material colours baked into
# vertex colours. No textures, no materials, no UVs, the ground at y 0 and the middle at x 0, z 0.
#   Blender -b --factory-startup --python blender-glb.py -- <in> <out> <keep> [<in> <out> <keep> ...]
# `keep` is the share of triangles to keep (1 keeps them all), for the heavy ones on phones.
import sys
import bpy


def base_colour(material):
    """The material's colour, linear, as glTF wants vertex colours."""
    if material is None:
        return (0.8, 0.8, 0.8, 1.0)
    if material.node_tree:
        for node in material.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                return tuple(node.inputs["Base Color"].default_value)
    return tuple(material.diffuse_color)

def convert(source, target, keep):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if source.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=source)
    else:
        bpy.ops.wm.obj_import(filepath=source)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)

    for o in meshes:
        mesh = o.data
        for attribute in list(mesh.color_attributes):
            mesh.color_attributes.remove(attribute)
        colours = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        mesh.color_attributes.active_color = colours
        for polygon in mesh.polygons:
            slot = o.material_slots[polygon.material_index] if polygon.material_index < len(o.material_slots) else None
            colour = base_colour(slot.material if slot else None)
            for loop in polygon.loop_indices:
                colours.data[loop].color = colour
        for layer in list(mesh.uv_layers):
            mesh.uv_layers.remove(layer)
        mesh.materials.clear()

    # one object, transforms applied, standing on the ground in the middle
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    model = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if keep < 1:
        decimate = model.modifiers.new("fewer", "DECIMATE")
        decimate.ratio = keep
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    xs = [v.co.x for v in model.data.vertices]
    ys = [v.co.y for v in model.data.vertices]
    zs = [v.co.z for v in model.data.vertices]
    shift = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs))
    for v in model.data.vertices:
        v.co.x -= shift[0]
        v.co.y -= shift[1]
        v.co.z -= shift[2]

    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format="GLB",
        use_selection=True,
        export_materials="NONE",
        export_vertex_color="ACTIVE",
        export_active_vertex_color_when_no_material=True,
        export_texcoords=False,
        export_normals=False,
        export_apply=True,
        export_yup=True,
    )

pairs = sys.argv[sys.argv.index("--") + 1:]
for i in range(0, len(pairs), 3):
    convert(pairs[i], pairs[i + 1], float(pairs[i + 2]))
