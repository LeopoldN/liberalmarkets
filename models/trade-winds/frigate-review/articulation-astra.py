import bpy,math,random
from mathutils import Vector
ROOT='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds'
sc=bpy.context.scene;assert not sc.get('articulation_astra_done')
src=open(ROOT+'/frigate-review/detail-deck-astra.py').read();exec(src[src.index('groups={}'):src.index('def deckz')])
# Fine panel stitching sits on the cloth, with no holes or thick extruded strips.
mat=bpy.data.materials.new('Linen quiet panel seams');mat.use_nodes=True;c=(.53,.48,.38,1);mat.diffuse_color=c
p=mat.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=c;p.inputs['Emission Color'].default_value=c;p.inputs['Emission Strength'].default_value=.35;p.inputs['Roughness'].default_value=.9
for o in list(bpy.data.collections['Sails'].objects):
    if not (o.name.startswith('Reference canvas') or o.name.startswith('Shaped ')):continue
    vv=o.data.vertices
    for k in range(0,len(vv),8):
        pts=[v.co.copy() for v in vv[k:k+8]]
        for a,b in [(1,5),(2,6)]:beam('Panel seams '+o.name,pts[a],pts[b],.006,mat,'Sails')
        if round(sum(v.z for v in pts)/8/.24)%2==0:
            for a,b in [(0,1),(3,2)]:beam('Panel seams '+o.name,pts[a],pts[b],.004,mat,'Sails')
# Proper lower fighting tops and smaller upper trestletrees replace uniform slabs.
o=bpy.data.objects.get('Fighting top.009')
if o:bpy.data.objects.remove(o,do_unlink=True)
wood=[bpy.data.materials['Fittings Ref oak %d'%i] for i in range(6)];tar=bpy.data.materials['Ref tar'];gold=bpy.data.materials['Ref carved ochre']
for i,(x,z,upper) in enumerate([(-11,15.55,23.55),(4,16.55,25.55),(14,16.55,23.55)]):
    n='Fighting top %d detailed'%i
    cylinder(n,(x+.25,0,z),1.04,.18,wood[2],sides=8,c='Masts and yards')
    for j in range(9):
        y=-.8+j*.20;box(n,(x+.25,y,z+.11),(1.35,.14,.05),wood[j%6],'Masts and yards')
    for side in [-1,1]:
        for dx in [-.55,.15,.85]:box(n,(x+dx,side*.79,z+.34),(.055,.055,.45),tar,'Masts and yards')
        beam(n,(x-.55,side*.79,z+.56),(x+.85,side*.79,z+.56),.075,gold,'Masts and yards')
        beam(n,(x+.2,side*.12,z-.7),(x+.2,side*.85,z-.10),.12,wood[0],'Masts and yards')
        box('Upper trestletrees %d'%i,(x+.38,side*.37,upper),(1.3,.13,.14),wood[2],'Masts and yards')
    box('Upper trestletrees %d'%i,(x+.38,0,upper+.10),(.18,1.03,.12),tar,'Masts and yards')
# Restrained modular timber color on mast sections, preserving the established rake and dimensions.
random.seed(66)
for i,(x,top) in enumerate([(-11,33),(4,35),(14,30)]):
    old=bpy.data.objects.get('Tapered mast %d'%i)
    if old:bpy.data.objects.remove(old,do_unlink=True)
    for j in range(math.ceil((top-5.8)/.24)):
        z=5.8+(j+.5)*.24;r=.31 if z<16 else .21 if z<25 else .125
        cylinder('Tapered mast %d'%i,(x+(z-6)*.02,0,z),r,.24,wood[(j//3+i)%6],sides=8,c='Masts and yards')
# Finer glazing subdivision follows the already-curved transom.
for row,z in enumerate([4.91,5.96]):
    for j in range(9):
        y=(j-4)*.9
        for dz in [-.15,.15]:
            a=Vector((21.735,y-.31,z+dz));b=Vector((21.735,y+.31,z+dz))
            for v in [a,b]:
                t=max(0,min(1,(v.x-16)/5.5));v.x-=1.6*t*t*(abs(v.y)/5.5)**3;v.y*=1-.06*t*t
            beam('Gallery fine glazing bars',a,b,.026,gold,'Stern gallery')
for (c,n),(vs,fs,ms,ids) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ids):p.material_index=i
    o=bpy.data.objects.new(n,me);bpy.data.collections[c].objects.link(o)
sc['articulation_astra_done']=True;bpy.data.objects['Flyaround camera'].data.ortho_scale=75
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/royal-navy-frigate.blend')
PREFIX='section8-astra'
exec(compile(open(ROOT+'/frigate-review/render-neutral.py').read(),'render-neutral.py','exec'))
sc.camera=bpy.data.objects['Flyaround camera'];sc.render.resolution_x=1600;sc.render.resolution_y=1000
for f in [31,91,151,211]:
    sc.frame_set(f);sc.render.filepath=ROOT+'/frigate-review/section8-orbit-%03d.png'%f;bpy.ops.render.render(write_still=True)
sc.camera=bpy.data.objects['Concept camera'];sc.frame_set(1)
