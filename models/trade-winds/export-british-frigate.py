"""Export the saved British frigate, preserving flag animation and source edits."""
import bpy,bmesh,runpy,math
from pathlib import Path
from collections import defaultdict
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
bpy.ops.wm.open_mainfile(filepath=str(HERE/'british-frigate.blend'))
scene=bpy.context.scene;scene.frame_set(1);scene.frame_end=193
asset=bpy.data.collections['FRIGATE | 1812 voxel asset']
retained=[o for o in asset.all_objects if o.type in {'MESH','EMPTY'} and not o.hide_render and o.visible_get()]
for o in list(scene.objects):
    if o not in retained:bpy.data.objects.remove(o,do_unlink=True)
# Bake material pigments to vertex colors: hundreds of palette materials become
# four shared surfaces. Tiny presentation bevels are omitted from runtime meshes.
surfaces = {}
def surface(kind):
    if kind in surfaces:
        return surfaces[kind]
    m = bpy.data.materials.new('Frigate game | ' + kind)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (1, 1, 1, 1)
    p.inputs['Roughness'].default_value = .78 if kind == 'pigment' else .45
    p.inputs['Metallic'].default_value = .65 if kind == 'metal' else 0
    color = m.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'FrigateColor'
    m.node_tree.links.new(color.outputs['Color'], p.inputs['Base Color'])
    if kind == 'lantern':
        p.inputs['Emission Color'].default_value = (1, .31, .025, 1)
        p.inputs['Emission Strength'].default_value = 5
    if kind == 'cloud':
        # Clouds retain their warm silhouette independently of the harbor lights.
        m.node_tree.nodes.remove(p)
        # A color socket directly on Surface is the exporter's unlit convention.
        m.node_tree.links.new(color.outputs['Color'], m.node_tree.nodes['Material Output'].inputs['Surface'])
    surfaces[kind] = m
    return m

for o in retained:
    if o.type != 'MESH':
        continue
    for mod in list(o.modifiers):
        if mod.type == 'BEVEL':
            o.modifiers.remove(mod)
    me = o.data
    values = []
    kinds = []
    for mat in me.materials:
        shader = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if mat and mat.use_nodes else None
        rgba = tuple(shader.inputs['Base Color'].default_value) if shader else tuple(mat.diffuse_color)
        emission = shader.inputs['Emission Strength'].default_value if shader else 0
        metal = shader.inputs['Metallic'].default_value if shader else 0
        kind = 'cloud' if o.name.startswith('25 Sunset clouds') else 'lantern' if emission > 2 else 'metal' if metal > .4 else 'pigment'
        values.append(rgba)
        kinds.append(kind)
    if not values:
        continue
    color = me.color_attributes.new(name='FrigateColor', type='BYTE_COLOR', domain='CORNER')
    rgba_data = [0.] * (len(me.loops) * 4)
    indices = []
    used = list(dict.fromkeys(kinds))
    for poly in me.polygons:
        rgba = values[poly.material_index]
        indices.append(used.index(kinds[poly.material_index]))
        for i in poly.loop_indices:
            rgba_data[i*4:i*4+4] = rgba
    color.data.foreach_set('color', rgba_data)
    me.materials.clear()
    for kind in used:
        me.materials.append(surface(kind))
    for poly, idx in zip(me.polygons, indices):
        poly.material_index = idx

batches = defaultdict(list)
for o in retained:
    if o.type == 'MESH' and not o.animation_data and not o.data.shape_keys:
        batches[o.parent].append(o)
for parent, objects in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = (parent.name if parent else 'Frigate') + '_geometry'
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bm.to_mesh(o.data)
    bm.free()

root=bpy.data.objects['FRIGATE | placement root']
root.name='British frigate | game root'
# Source bow +X becomes Blender +Y, then glTF -Z, matching sailing headings.
root.rotation_euler.z=math.pi/2;root.scale=(2.7,)*3
root['npc']='passive-frigate';root['sails']='fully lowered';root['stern_flag']='Union Jack'
for o in scene.objects:o.select_set(True)
path=ROOT/'assets/trade-winds/models/british-frigate.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
    export_apply=True,export_extras=True,export_animations=True,export_animation_mode='SCENE',
    export_frame_range=True,export_anim_slide_to_zero=True,export_frame_step=1,
    export_morph=True,export_morph_animation=True,export_morph_normal=False,
    export_nla_strips_merged_animation_name='British frigate wind')
runpy.run_path(str(HERE/'pack-harbor-glb.py'))['pack'](path, 'British frigate wind')
print('BRITISH FRIGATE EXPORTED',path)
