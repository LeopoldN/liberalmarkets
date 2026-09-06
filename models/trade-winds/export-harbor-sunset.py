"""Export saved edits and animation from harbor-sunset.blend, without rebuilding it.

Hidden objects and presentation lighting/water are omitted. Static parts are
batched per animated parent; the reference camera and actor pivots are retained.
"""
import bpy, bmesh, runpy
from pathlib import Path
from collections import defaultdict
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
bpy.ops.wm.open_mainfile(filepath=str(HERE/'harbor-sunset.blend'))
scene=bpy.context.scene;scene.frame_set(1)
studio=bpy.data.collections.get('Studio • presentation only')
excluded=set(studio.all_objects) if studio else set()
source=[o for o in scene.objects if (o not in excluded or o==scene.camera)
        and o.visible_get() and not o.hide_render and o.type in {'MESH','EMPTY','CAMERA'}]
retained=set(source)
for o in list(scene.objects):
    if o not in retained:bpy.data.objects.remove(o,do_unlink=True)
groups=defaultdict(list)
for o in source:
    if o.type=='MESH' and not o.animation_data and not o.data.shape_keys:
        # Keep independent geographic layers legible in the outliner.
        key=(o.parent, o.users_collection[0] if not o.parent else None)
        groups[key].append(o)
for (parent,collection),objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    obj=bpy.context.view_layer.objects.active
    obj.name=parent.name+'_geometry' if parent else collection.name+'_geometry'
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bm.to_mesh(obj.data);bm.free()
for o in scene.objects:o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(ROOT/'assets/trade-winds/models/harbor-sunset.glb'),
    export_format='GLB',use_selection=True,export_apply=True,export_extras=True,
    export_cameras=True,export_animations=True,export_animation_mode='SCENE',
    export_frame_range=True,export_anim_slide_to_zero=True,export_frame_step=2,
    export_nla_strips_merged_animation_name='Harbor sunset • living dock',
)
print('HARBOR EXPORTED',len(scene.objects),'nodes',flush=True)
runpy.run_path(str(HERE/'pack-harbor-glb.py'),run_name='__main__')
