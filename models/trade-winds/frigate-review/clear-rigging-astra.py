import bpy,math,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds'
src=open(ROOT+'/frigate-review/detail-deck-astra.py').read();exec(src[src.index('groups={}'):src.index('def deckz')])
src=open(ROOT+'/frigate-review/rebuild-hull.py').read();exec(src[src.index('def interp'):src.index('# Occupied')])
for n in ['Lower standing shrouds','Lower ratlines','Topmast shrouds','Topmast ratlines','Sagged masthead stays']:
    old=bpy.data.objects.get(n)
    if old:bpy.data.objects.remove(old,do_unlink=True)
hemp=bpy.data.materials['Reference tarred rigging']
def cable(n,a,b,r=.03,sag=0):
    a,b=Vector(a),Vector(b)
    for i in range(12):
        t=i/12;u=(i+1)/12;p=a.lerp(b,t);q=a.lerp(b,u);p.z-=4*sag*t*(1-t);q.z-=4*sag*u*(1-u);beam(n,p,q,r,hemp,'Rigging')
for x,lower,upper in [(-11,15.7,23.5),(4,16.7,25.5),(14,16.2,23.5)]:
    for side in [-1,1]:
        w=halfwidth(x+3.5,6)+.05
        for i in range(5):cable('Lower standing shrouds',(x+2.8+i*.4,side*w,6.6),(x+.65,side*.75,lower),.042)
        for j in range(1,20):
            t=j/21;y=side*(w*(1-t)+.75*t);z=6.6+(lower-6.6)*t
            cable('Lower ratlines',(x+2.8*(1-t)+.65*t,y,z),(x+4.4*(1-t)+.65*t,y,z),.021)
        for dx in [.75,1.15,1.55]:cable('Topmast shrouds',(x+dx,side*.85,lower),(x+.8,side*.3,upper),.027)
        for j in range(1,14):
            t=j/15;y=side*(.85*(1-t)+.3*t);z=lower+(upper-lower)*t
            cable('Topmast ratlines',(x+.75*(1-t)+.8*t,y,z),(x+1.55*(1-t)+.8*t,y,z),.017)
for a,b,sag in [((-32.8,-.5,14.6),(-10.4,-.5,32.8),.6),((-27.5,-.5,11),(-10.6,-.5,23.8),.3),((-10.4,-.5,32.8),(4.6,-.5,34.5),4.5),((4.6,-.5,34.5),(14.6,-.5,29.5),2.1),((-10.5,-.5,24.2),(4.6,-.5,32),.8),((4.6,-.5,26),(14.6,-.5,28),1.1),((14.6,-.5,29.5),(21.4,-.5,7.4),.5)]:cable('Sagged masthead stays',a,b,.045,sag)
for (c,n),(vs,fs,ms,ids) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ids):p.material_index=i
    o=bpy.data.objects.new(n,me);bpy.data.collections[c].objects.link(o)
# True segment/surface tests, retained for repeatable verification.
sails=[o for o in bpy.data.collections['Sails'].objects if o.name.startswith('Reference canvas') or o.name.startswith('Shaped ')]
bvhs={o.name:BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[list(p.vertices) for p in o.data.polygons]) for o in sails}
records=[]
for o in bpy.data.collections['Rigging'].objects:
    if o.type!='MESH':continue
    for k in range(0,len(o.data.vertices),8):
        vv=[o.matrix_world@v.co for v in o.data.vertices[k:k+8]];a=sum(vv[:4],Vector())/4;b=sum(vv[4:],Vector())/4;d=b-a
        if d.length<.001:continue
        for n,bvh in bvhs.items():
            loc,normal,index,dist=bvh.ray_cast(a+d.normalized()*.002,d.normalized(),max(0,d.length-.004))
            if loc is not None:records.append({'rig':o.name,'segment':k//8,'sail':n,'point':list(loc)})
open(ROOT+'/frigate-review/rig-intersections-after.json','w').write(json.dumps(records,indent=2))
print('Remaining intersections',records)
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/royal-navy-frigate.blend')
