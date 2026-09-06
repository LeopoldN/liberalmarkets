"""Export the saved animated clean-character-harbor.blend for the market screen.

The Blender source is never modified. Preserve the authored camera, native
animation and blinking shape keys; batch static geometry per moving parent.
Run with Blender --background --python models/trade-winds/export-clean-character-harbor.py.
"""
import bpy, bmesh, runpy
from pathlib import Path
from collections import defaultdict

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
bpy.ops.wm.open_mainfile(filepath=str(HERE / 'clean-character-harbor.blend'))
scene = bpy.context.scene
scene.frame_set(1)
# Include the duplicate endpoint in the export so glTF loops at exactly 20 s.
scene.frame_end = 481
names = {
    'ANIM | 08 Merchant::Body': 'merchant',
    'ANIM | 08 Merchant::Head': 'merchant_head',
    'ANIM | 09 Seated drinking pirate::Body': 'drunkard_body',
    'ANIM | 09 Seated drinking pirate::Head': 'drunkard_head',
    'ANIM | 09 Seated drinking pirate::Left arm': 'drunkard_arm_left',
    'ANIM | 10 Crew left back::Head': 'dockhand_a_head',
    'ANIM | 11 Crew center::Head': 'dockhand_b_head',
    'ANIM | 12 Crew right back::Head': 'dockhand_c_head',
    'ANIM | Rope left': 'rope_swing_0',
    'ANIM | Rope right': 'rope_swing_1',
    'ANIM | Lantern and chain': 'lantern_swing',
    'FRIGATE | placement root': 'ship_grand_merchant',
}
for old, new in names.items():
    bpy.data.objects[old].name = new
scene.camera['compositionAspect'] = scene.render.resolution_x / scene.render.resolution_y
scene.camera['authoredHarbor'] = True
# Runtime point-light anchors follow the same parents as the original lights.
for light in list(scene.objects):
    if light.type != 'LIGHT' or light.data.type != 'POINT':
        continue
    anchor = bpy.data.objects.new('lamp_' + light.name, None)
    scene.collection.objects.link(anchor)
    anchor.parent = light.parent
    anchor.matrix_world = light.matrix_world.copy()
    anchor['lamp'] = True
    anchor['lampPower'] = light.data.energy * .22
    anchor['lampColor'] = list(light.data.color)
    anchor['lampDrop'] = 0.0
    anchor['lampForward'] = 0.0
    anchor['lampDistance'] = 9.0

retained = [o for o in scene.objects
            if o.type in {'MESH', 'EMPTY', 'CAMERA'} and not o.hide_render
            and o.visible_get() and (o.type != 'CAMERA' or o == scene.camera)
            and not o.name.startswith(('02 Harbor water', 'Distant atmospheric volume'))]
for o in list(scene.objects):
    if o not in retained:
        bpy.data.objects.remove(o, do_unlink=True)

# Bake material pigments to vertex colors: hundreds of palette materials become
# four shared surfaces. Tiny presentation bevels are omitted from runtime meshes.
surfaces = {}
def surface(kind):
    if kind in surfaces:
        return surfaces[kind]
    m = bpy.data.materials.new('Harbor game | ' + kind)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (1, 1, 1, 1)
    p.inputs['Roughness'].default_value = .78 if kind == 'pigment' else .45
    p.inputs['Metallic'].default_value = .65 if kind == 'metal' else 0
    color = m.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'HarborColor'
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
    if o.data.shape_keys:
        continue
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
    color = me.color_attributes.new(name='HarborColor', type='BYTE_COLOR', domain='CORNER')
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
    o.name = (parent.name if parent else 'Harbor') + '_geometry'
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bm.to_mesh(o.data)
    bm.free()

for o in scene.objects:
    o.select_set(True)
path = ROOT / 'assets/trade-winds/models/clean-character-harbor.glb'
bpy.ops.export_scene.gltf(
    filepath=str(path), export_format='GLB', use_selection=True,
    export_apply=True, export_extras=True, export_cameras=True,
    export_animations=True, export_animation_mode='SCENE',
    export_frame_range=True, export_anim_slide_to_zero=True, export_frame_step=1,
    export_morph=True, export_morph_animation=True, export_morph_normal=False,
    export_nla_strips_merged_animation_name='Harbor life • 20 second loop',
)
runpy.run_path(str(HERE / 'pack-harbor-glb.py'))['pack'](path)
print('ANIMATED CLEAN HARBOR EXPORTED:', path, flush=True)
