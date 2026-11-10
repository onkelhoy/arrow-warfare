# Run by models.mjs inside Blender (headless): FBX/OBJ in, one .glb out with the material colours baked into
# vertex colours. No textures, no materials, no UVs, the ground at y 0 and the middle at x 0, z 0.
#   Blender -b --factory-startup --python blender-glb.py -- <in> <out> <keep> <scale> [<in> <out> <keep> <scale> ...]
# `keep` under 1 is the share of triangles to keep, over 1 how many (1 keeps them all), for the heavy ones on phones.
# A .glb in keeps its vertex colours and place, only its inside-out faces get turned (the renderer culls back faces),
# and with `keep` under 1 its flat faces of one colour merged.
import sys
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def base_colour(material):
    """The material's colour, linear, as glTF wants vertex colours."""
    if material is None:
        return (0.8, 0.8, 0.8, 1.0)
    if material.node_tree:
        for node in material.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                return tuple(node.inputs["Base Color"].default_value)
    return tuple(material.diffuse_color)

def hits(tree, start, direction):
    """How many faces a ray crosses on its way out, a few steps at most."""
    count = 0
    for _ in range(8):
        location, _, _, _ = tree.ray_cast(start, direction)
        if location is None:
            break
        count += 1
        start = location + direction * 1e-3
    return count


def outward(model):
    """Turns every face whose front looks into the model: a ray out of its front crosses more faces than one out of its back."""
    bm = bmesh.new()
    bm.from_mesh(model.data)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    # a few slanted rays besides the normal, so a lucky gap doesn't decide alone
    tilts = [Vector((0, 0, 0)), Vector((0.3, 0.2, 0)), Vector((-0.2, 0.3, 0.1)), Vector((0.1, -0.3, 0.2))]
    flip = []
    for face in bm.faces:
        if face.calc_area() < 1e-8:
            continue
        n = face.normal
        centre = face.calc_center_median()
        front = back = 0
        for tilt in tilts:
            d = (n + tilt).normalized()
            front += hits(tree, centre + n * 2e-3, d)
            back += hits(tree, centre - n * 2e-3, -d)
        if front > back:
            flip.append(face)
    for face in flip:
        face.normal_flip()
    bm.to_mesh(model.data)
    bm.free()
    return len(flip)


def merge_flat(model):
    """Merges neighbouring faces that lie flat in one plane and share a colour, then triangles again. The colours
    go through materials for that (the dissolve keeps materials apart, not colours), and back."""
    mesh = model.data
    colours = mesh.color_attributes.active_color
    if colours is None:
        return
    palette = {}
    face_colour = []
    for polygon in mesh.polygons:
        c = tuple(round(v, 3) for v in colours.data[polygon.loop_indices[0]].color)
        face_colour.append(palette.setdefault(c, len(palette)))
    mesh.materials.clear()
    for i in range(len(palette)):
        mesh.materials.append(bpy.data.materials.new(f"c{i}"))
    for polygon, index in zip(mesh.polygons, face_colour):
        polygon.material_index = index
    # the faces come apart (a vertex per corner), weld them so neighbours can merge
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(mesh)
    bm.free()
    bpy.context.view_layer.objects.active = model
    planar = model.modifiers.new("flat", "DECIMATE")
    planar.decimate_type = "DISSOLVE"
    planar.angle_limit = 0.0175
    planar.delimit = {"MATERIAL"}
    bpy.ops.object.modifier_apply(modifier=planar.name)
    triangulate = model.modifiers.new("tri", "TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    by_index = {i: c for c, i in palette.items()}
    for attribute in list(mesh.color_attributes):
        mesh.color_attributes.remove(attribute)
    colours = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    mesh.color_attributes.active_color = colours
    for polygon in mesh.polygons:
        for loop in polygon.loop_indices:
            colours.data[loop].color = by_index[polygon.material_index]
    mesh.materials.clear()


def fix(source, target, merge):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        o.select_set(True)
    turned = sum(outward(o) for o in meshes)
    before = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    if merge < 1:
        for o in meshes:
            merge_flat(o)
            # then edges collapse down to `merge` of what came in
            now = sum(len(p.vertices) - 2 for p in o.data.polygons)
            wanted = merge * before
            if now > wanted:
                bpy.context.view_layer.objects.active = o
                decimate = o.modifiers.new("fewer", "DECIMATE")
                decimate.ratio = wanted / now
                bpy.ops.object.modifier_apply(modifier=decimate.name)
    after = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    print(f"blender-glb: {source.split('/')[-1]} turned {turned}, triangles {before} -> {after}")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=target, export_format="GLB", use_selection=True, export_materials="NONE",
        export_vertex_color="ACTIVE", export_active_vertex_color_when_no_material=True,
        export_texcoords=False, export_normals=False, export_apply=True, export_yup=True,
    )


def triangles(model):
    return sum(len(p.vertices) - 2 for p in model.data.polygons)


def convert(source, target, keep, scale):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if source.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=source)
    else:
        bpy.ops.wm.obj_import(filepath=source)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)

    # one object, transforms applied
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    model = bpy.context.view_layer.objects.active
    model.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # fewer triangles: `keep` under 1 is a share, over 1 a count. Flat faces of one material merge first (keeps
    # the boxy shapes and the windows), then edges collapse if that wasn't enough.
    if keep != 1:
        target_count = keep if keep > 1 else triangles(model) * keep
        if keep > 1:
            planar = model.modifiers.new("flat", "DECIMATE")
            planar.decimate_type = "DISSOLVE"
            planar.angle_limit = 0.0873
            planar.delimit = {"MATERIAL"}
            bpy.ops.object.modifier_apply(modifier=planar.name)
            triangulate = model.modifiers.new("tri", "TRIANGULATE")
            bpy.ops.object.modifier_apply(modifier=triangulate.name)
        if triangles(model) > target_count:
            decimate = model.modifiers.new("fewer", "DECIMATE")
            decimate.ratio = target_count / triangles(model)
            bpy.ops.object.modifier_apply(modifier=decimate.name)

    # the material colours into vertex colours, then no materials or UVs
    mesh = model.data
    for attribute in list(mesh.color_attributes):
        mesh.color_attributes.remove(attribute)
    colours = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    mesh.color_attributes.active_color = colours
    for polygon in mesh.polygons:
        slot = model.material_slots[polygon.material_index] if polygon.material_index < len(model.material_slots) else None
        colour = base_colour(slot.material if slot else None)
        for loop in polygon.loop_indices:
            colours.data[loop].color = colour
    for layer in list(mesh.uv_layers):
        mesh.uv_layers.remove(layer)
    mesh.materials.clear()

    xs = [v.co.x for v in model.data.vertices]
    ys = [v.co.y for v in model.data.vertices]
    zs = [v.co.z for v in model.data.vertices]
    shift = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs))
    for v in model.data.vertices:
        v.co.x -= shift[0]
        v.co.y -= shift[1]
        v.co.z -= shift[2]

    print(f"blender-glb: {source.split('/')[-1]} turned {outward(model)}")
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
for i in range(0, len(pairs), 4):
    if pairs[i].lower().endswith(".glb"):
        # for a .glb, `keep` under 1 asks for the flat faces merged
        fix(pairs[i], pairs[i + 1], float(pairs[i + 2]))
    else:
        convert(pairs[i], pairs[i + 1], float(pairs[i + 2]), float(pairs[i + 3]))
