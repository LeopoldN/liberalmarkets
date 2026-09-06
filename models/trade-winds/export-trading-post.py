"""Export the editable saved stall; study context is excluded from the live set."""
import bpy
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
if Path(bpy.data.filepath)!=HERE/'trading-post.blend':
    bpy.ops.wm.open_mainfile(filepath=str(HERE/'trading-post.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.collections['Trading Post • Game Asset'].all_objects:
    if o.type=='MESH' and o.visible_get() and not o.hide_render:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/trade-winds/models/trading-post.glb'),
    export_format='GLB',use_selection=True,export_animations=False,export_apply=True)
print('TRADING POST EXPORTED',flush=True)
