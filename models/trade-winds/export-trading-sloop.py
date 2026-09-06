"""Export the saved animated trading-sloop.blend; never regenerate manual edits.
Hidden parts and the studio are excluded. Static meshes are batched per moving rig.
"""
import bpy, bmesh, math
from pathlib import Path
from collections import defaultdict
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
bpy.ops.wm.open_mainfile(filepath=str(HERE/'trading-sloop.blend'))
scene=bpy.context.scene;scene.frame_set(1)
studio=bpy.data.collections.get('Studio • presentation only')
excluded=set(studio.all_objects) if studio else set()
source=[o for o in scene.objects if o not in excluded and o.visible_get() and not o.hide_render and o.type in {'MESH','EMPTY'}]
source_set=set(source)
for o in list(scene.objects):
    if o not in source_set:bpy.data.objects.remove(o,do_unlink=True)
groups=defaultdict(list)
for o in source:
    if o.type=='MESH' and not o.data.shape_keys and not o.animation_data:
        groups[o.parent].append(o)
for parent,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    obj=bpy.context.view_layer.objects.active
    obj.name='Static hull and fittings' if parent is None else parent.name+'_mesh'
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bm.to_mesh(obj.data);bm.free()
# A single transform provides a consistent model scale while preserving clip space.
roots=[o for o in scene.objects if not o.parent]
root=bpy.data.objects.new('Trading sloop • game root',None);scene.collection.objects.link(root)
for o in roots:o.parent=root
root.scale=(2.7,)*3;root.rotation_euler.z=math.pi
root['vessel']='trader';root['reference']='Voxel merchant sloop with raised stern and single main mast'
for o in scene.objects:o.select_set(True)
scene.frame_set(1)
bpy.ops.export_scene.gltf(
    filepath=str(ROOT/'assets/trade-winds/models/trading-sloop.glb'),
    export_format='GLB',use_selection=True,export_apply=True,export_extras=True,
    export_animations=True,export_animation_mode='SCENE',export_frame_range=True,
    export_anim_slide_to_zero=True,
    export_frame_step=2,export_morph=True,export_morph_animation=True,
    export_morph_normal=False,export_nla_strips_merged_animation_name='Sloop gentle idle',
)
print('SLOOP EXPORTED',len(list(scene.objects)),'nodes',flush=True)
