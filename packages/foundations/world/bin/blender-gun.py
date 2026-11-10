# Run by guns.mjs inside Blender (headless): an animated FPS gun .blend in, one .glb out with its armature,
# skin and actions (fire, reload), the materials turned into vertex colours by name. No textures, no UVs.
#   Blender -b --factory-startup <in.blend> --python blender-gun.py -- <out.glb>
import sys
import bpy

# the pack's materials are all grey, the colours are ours (sRGB, turned linear for glTF)
COLOURS = {
    "Black": "#2b2b30", "Metal": "#8c929c", "Barrels": "#4c5058",
    "Wood": "#8a5a30", "LightWood": "#b07c48", "DarkWood": "#5c3a20",
    "BulletYellow": "#d8a838", "BulletTip": "#b8743c", "BulletOrange": "#c07038",
}

def linear(hex):
    return tuple(pow(int(hex[i:i + 2], 16) / 255, 2.2) for i in (1, 3, 5)) + (1.0,)

target = sys.argv[sys.argv.index("--") + 1]
for model in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
    mesh = model.data
    for attribute in list(mesh.color_attributes):
        mesh.color_attributes.remove(attribute)
    colours = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    mesh.color_attributes.active_color = colours
    for polygon in mesh.polygons:
        slot = model.material_slots[polygon.material_index] if polygon.material_index < len(model.material_slots) else None
        name = slot.material.name if slot and slot.material else ""
        colour = linear(COLOURS.get(name, "#808080"))
        for loop in polygon.loop_indices:
            colours.data[loop].color = colour
    for layer in list(mesh.uv_layers):
        mesh.uv_layers.remove(layer)
    mesh.materials.clear()
    print(f"blender-gun: {model.name} triangles {sum(len(p.vertices) - 2 for p in mesh.polygons)}")

bpy.ops.export_scene.gltf(
    filepath=target, export_format="GLB", export_materials="NONE",
    export_vertex_color="ACTIVE", export_active_vertex_color_when_no_material=True,
    export_texcoords=False, export_normals=False, export_yup=True,
    export_skins=True, export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
)
