import bpy, math, random
from mathutils import Vector,Matrix
random.seed(80)
src=open('/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds/frigate-review/rebuild-hull.py').read()
exec(src[src.index('groups={}'):src.index('# Occupied')])
for o in list(bpy.data.objects):
    if o.name.startswith('Canvas mast') or o.name.startswith('Reference canvas'):bpy.data.objects.remove(o,do_unlink=True)
for o in list(bpy.data.collections['Rigging'].objects):bpy.data.objects.remove(o,do_unlink=True)
cream=[material('Reference linen %d'%i,(.73+i*.009,.686+i*.009,.572+i*.008)) for i in range(6)]
for m in cream:
    p=m.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=m.diffuse_color;p.inputs['Emission Strength'].default_value=.08
angle=math.radians(65);R=Matrix.Rotation(angle,4,'Z');along=Vector((math.cos(angle),math.sin(angle),0));normal=Vector((-math.sin(angle),math.cos(angle),0))
mastdata=[(-11,33,[(9,15,7),(16,23,5.5),(24,29,3.6)]),(4,35,[(9,16,7),(17,25,5.5),(26,31,3.4)]),(14,30,[(17,23,3.8),(24,27,2.5)])]
for mast,(x,top,tiers) in enumerate(mastdata):
    for tier,(bottom,zt,span) in enumerate(tiers):
        name='Reference canvas %d tier%d'%(mast,tier);step=.27
        for i in range(int(2*span/step)):
            u=-span+(i+.5)*step
            for j in range(int((zt-bottom)/step)):
                z=bottom+(j+.5)*step;frac=(zt-z)/(zt-bottom)
                limit=span*(.83+.17*frac)
                foot=bottom+.65*(1-abs(u/span))**2+.16*math.sin(u*4)+(.3 if abs(u)<.4 else 0)
                if abs(u)>limit or z<foot:continue
                billow=round((.65*math.sin(math.pi*frac)*math.cos(u/span*math.pi/2))/.075)*.075
                pos=Vector((x,-.18,z))+along*u+normal*billow
                # Each thin panel has aligned faces and quiet joints; all are solid geometry.
                g=groups.setdefault(('Sails',name),[[],[],[],[]]);vs,fs,ms,ids=g;m=random.choice(cream)
                if m not in ms:ms.append(m)
                k=len(vs);vs.extend([tuple(pos+R@Vector((a*(step-.001),b*.08,c*(step-.001)))) for a,b,c in CV]);fs.extend([tuple(k+i for i in f) for f in CF]);ids.extend([ms.index(m)]*6)
# Every jib/spanker gets the same warm, low-variation linen palette.
for o in bpy.data.collections['Sails'].objects:
    if 'jib' in o.name or 'Spanker' in o.name or 'spritsail' in o.name:
        o.data.materials.clear()
        for m in cream:o.data.materials.append(m)
        for p in o.data.polygons:p.material_index=p.index//6%6
hemp=material('Reference tarred rigging',(.054,.044,.028))
def cable(n,a,b,thick=.036,sag=0):
    a,b=Vector(a),Vector(b)
    for i in range(12):
        t=i/12;s=(i+1)/12
        p=a.lerp(b,t);q=a.lerp(b,s);p.z-=4*sag*t*(1-t);q.z-=4*sag*s*(1-s)
        beam(n,p,q,thick,hemp,'Rigging')
# Shrouds end aft of each mast, avoiding a black mesh over each full sail.
for x,top,tiers in mastdata:
    lower_top=15.7 if x==-11 else 16.7 if x==4 else 16.2
    for side in [-1,1]:
        for i in range(5):
            dx=.35+i*.5
            cable('Lower standing shrouds',(x+dx,side*(halfwidth(x,6)+.1),6.6),(x+.35,side*.75,lower_top),.042)
        for i in range(1,20):
            t=i/21;y=side*((halfwidth(x,6)+.1)*(1-t)+.75*t)
            cable('Lower ratlines',(x+.35,y,6.6+(lower_top-6.6)*t),(x+.35+2*(1-t),y,6.6+(lower_top-6.6)*t),.021)
        upper=25.5 if x==4 else 23.5
        for dx in [.2,.6,1.0]:cable('Topmast shrouds',(x+dx,side*.9,lower_top),(x+.5,side*.3,upper),.027)
        for i in range(1,14):
            t=i/15;y=side*(.9*(1-t)+.3*t);z=lower_top+(upper-lower_top)*t
            cable('Topmast ratlines',(x+.2+.3*t,y,z),(x+1-.5*t,y,z),.017)
for a,b,sag in [((-32.8,0,14.6),(-10.4,0,32.8),.6),((-27.5,0,11),(-10.6,0,27.6),.3),((-10.4,0,32.8),(4.6,0,34.5),4.5),((4.6,0,34.5),(14.6,0,29.5),2.1),((-10.5,0,24.2),(4.4,0,29.7),.8),((4.4,0,26),(14.5,0,25.5),1.1),((14.6,0,29.5),(21.4,0,7.4),.5)]:cable('Sagged masthead stays',a,b,.045,sag)
for x,top,tiers in mastdata:
    for bottom,z,span in tiers:
        for side in [-1,1]:
            end=Vector((x,0,z))+along*span*side
            cable('Yard lifts',end,(x+.4,0,min(top,z+4)),.029,.12)
            cable('Running braces',end,(min(21,x+7),side*2,7),.025,.4)
# Refine masts into narrower upper sections instead of uniform poles.
for i,(x,top,tiers) in enumerate(mastdata):
    old=bpy.data.objects.get('Mast '+str(i))
    if old:bpy.data.objects.remove(old,do_unlink=True)
    for z0,z1,r in [(5.8,16,.62),(16,25,.42),(25,top,.25)]:beam('Tapered mast %d'%i,(x+(z0-6)*.02,0,z0),(x+(z1-6)*.02,0,z1),r,oak[1],'Masts and yards')
for (collection,n),(vs,fs,ms,ids) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ids):p.material_index=i
    o=bpy.data.objects.new(n,me);bpy.data.collections[collection].objects.link(o)
bpy.ops.wm.save_as_mainfile(filepath='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds/royal-navy-frigate.blend')
print('Rebuilt shaped canvas and sparse standing/running rigging')
