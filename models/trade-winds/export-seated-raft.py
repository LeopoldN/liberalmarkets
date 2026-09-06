"""Export the saved Blender scene as vertex-colored meshes for the sailing game.

Run from any directory with Blender --background --python <this file>.
Save seated-raft.blend first. Hidden objects/collections and the studio are excluded.
Both GLB files are generated outputs, never inputs. This does not modify the .blend.
"""
import bpy, bmesh
from pathlib import Path
from mathutils import Matrix
from math import pi

ROOT = Path(__file__).resolve().parents[2]
blend_path = ROOT / 'models/trade-winds/seated-raft.blend'
bpy.ops.wm.open_mainfile(filepath=str(blend_path))
studio = bpy.data.collections.get('07 • Studio, camera & lights')
studio_objects = set(studio.all_objects) if studio else set()
source = [
    obj for obj in bpy.context.scene.objects
    if obj.type == 'MESH' and obj.visible_get() and not obj.hide_render
    and obj not in studio_objects
    and not any(c.hide_render for c in obj.users_collection)
]
if not source:
    raise RuntimeError('No visible raft meshes in the saved Blender scene.')
for obj in bpy.context.scene.objects:
    obj.select_set(obj in source)
bpy.ops.export_scene.gltf(
    filepath=str(ROOT / 'models/trade-winds/seated-raft-source.glb'),
    export_format='GLB', use_selection=True, export_apply=True,
)
print('SOURCE:', blend_path, '| visible mesh parts:', len(source))
depsgraph = bpy.context.evaluated_depsgraph_get()
batches = {}
# Blender -Y (the sailor's face) becomes glTF +Z. Turn to the game's forward -Z.
transform = Matrix.Translation((0, 0, -.45)) @ Matrix.Rotation(pi, 4, 'Z') @ Matrix.Scale(2.4, 4)
for obj in source:
    if obj.type != 'MESH':
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    matrix = transform @ evaluated.matrix_world
    for poly in mesh.polygons:
        material = mesh.materials[poly.material_index]
        shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        rgba = tuple(shader.inputs['Base Color'].default_value)
        metallic = round(shader.inputs['Metallic'].default_value, 3)
        emission = round(shader.inputs['Emission Strength'].default_value, 3)
        emission = 4 if emission > 2.5 else 2 if emission else 0
        key = (metallic, emission)
        batch = batches.setdefault(key, {'verts': [], 'faces': [], 'colors': []})
        start = len(batch['verts'])
        batch['verts'].extend(tuple(matrix @ mesh.vertices[i].co) for i in poly.vertices)
        batch['faces'].append(tuple(range(start, start + len(poly.vertices))))
        batch['colors'].extend([rgba] * len(poly.vertices))
    evaluated.to_mesh_clear()

for obj in list(bpy.context.scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
output_collection = bpy.data.collections.new('Game export')
bpy.context.scene.collection.children.link(output_collection)
for (metallic, emission), batch in batches.items():
    name = ('Lantern glow' if emission else 'Forged metal' if metallic else 'Voxel timber, sail and seated voyager')
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(batch['verts'], [], batch['faces'])
    colors = mesh.color_attributes.new(name='VoxelColor', type='BYTE_COLOR', domain='CORNER')
    colors.data.foreach_set('color', [c for rgba in batch['colors'] for c in rgba])
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bm.to_mesh(mesh)
    bm.free()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = .84
    shader.inputs['Emission Strength'].default_value = emission
    tint = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    tint.layer_name = 'VoxelColor'
    mat.node_tree.links.new(tint.outputs['Color'], shader.inputs['Base Color'])
    if emission:
        # glTF multiplies base color by COLOR_0, but not emissive color.
        shader.inputs['Emission Color'].default_value = batch['colors'][0]
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    output_collection.objects.link(obj)
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(ROOT / 'assets/trade-winds/models/seated-raft.glb'),
    export_format='GLB', use_selection=True, export_apply=True,
)
print('GAME RAFT:', len(batches), 'draw calls')
