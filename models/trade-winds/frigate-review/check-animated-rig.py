import bpy,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sc=bpy.context.scene;report=[]
for frame in range(1,194,24):
 sc.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get();bvhs={}
 for o in bpy.data.collections['Sails'].objects:
  if not (o.name.startswith('Reference canvas') or o.name.startswith('Shaped ')):continue
  ev=o.evaluated_get(deps);me=ev.to_mesh();bvhs[o.name]=BVHTree.FromPolygons([ev.matrix_world@v.co for v in me.vertices],[list(p.vertices) for p in me.polygons]);ev.to_mesh_clear()
 hits=[]
 for o in bpy.data.collections['Rigging'].objects:
  for k in range(0,len(o.data.vertices),8):
   vv=[o.matrix_world@v.co for v in o.data.vertices[k:k+8]];a=sum(vv[:4],Vector())/4;b=sum(vv[4:],Vector())/4;d=b-a
   if d.length<.001:continue
   for n,bvh in bvhs.items():
    p,_,_,_=bvh.ray_cast(a+d.normalized()*.003,d.normalized(),max(0,d.length-.006))
    if p is not None:hits.append({'rig':o.name,'sail':n,'point':list(p)})
 report.append({'frame':frame,'hits':hits})
sc.frame_set(1)
open('/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds/frigate-review/animated-rig-check.json','w').write(json.dumps(report,indent=2))
print([(r['frame'],len(r['hits'])) for r in report])
