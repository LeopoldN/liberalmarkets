import bpy,math,random
from mathutils import Vector,Matrix
ROOT='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds'
sc=bpy.context.scene
assert not sc.get('rig_span_astra_done'), 'Already applied'
# Reuse mesh helpers without invoking any rebuilding or material mutations.
src=open(ROOT+'/frigate-review/detail-deck-astra.py').read()
exec(src[src.index('groups={}'):src.index('def deckz')])
cream=[bpy.data.materials['Reference linen %d'%i] for i in range(6)]
random.seed(80)
a=math.radians(65);along=Vector((math.cos(a),math.sin(a),0));normal=Vector((-math.sin(a),math.cos(a),0));R=Matrix.Rotation(a,4,'Z')
for o in list(bpy.data.collections['Sails'].objects):
    if o.name.startswith('Reference canvas'):bpy.data.objects.remove(o,do_unlink=True)
masts=[(-11,[(9,15,7),(16,23,5.5),(24,29,3.6)]),(4,[(9,16,7),(17,25,5.5),(26,31,3.4)]),(14,[(17,23,3.8),(24,27,2.5)])]
for mast,(x,tiers) in enumerate(masts):
    for tier,(bottom,top,span) in enumerate(tiers):
        name='Reference canvas %d tier%d'%(mast,tier);step=.19;dz=.24
        for i in range(math.ceil(2*span/step)):
            u=-span+(i+.5)*step;un=abs(u)/span
            # Two hanging lobes, raised clews and a generous central bunt.
            rise=(1.65 if tier==0 else .85)*((un-.52)/.52)**2
            for j in range(math.ceil((top-bottom)/dz)):
                z=bottom+(j+.5)*dz;frac=(top-z)/(top-bottom)
                if z>top or un>.82+.18*frac or z<bottom+rise:continue
                billow=round(.65*math.sin(math.pi*frac)*math.cos(un*math.pi/2)/.075)*.075
                pos=Vector((x,-.18,z))+along*u+normal*billow
                vs=[]
                for xx,yy,zz in CV:
                    p=pos+R@Vector((xx*(step-.001),yy*.07,zz*(dz-.001)));p.y*=1.5;vs.append(tuple(p))
                geo(name,vs,CF,random.choice(cream),'Sails')
for (c,n),(vs,fs,ms,ids) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ids):p.material_index=i
    o=bpy.data.objects.new(n,me);bpy.data.collections[c].objects.link(o)
for o in bpy.data.objects:
    if o.type=='MESH' and (o.name.startswith('Yard ') or o.name in ['Yard lifts','Running braces']):
        inv=o.matrix_world.inverted()
        for v in o.data.vertices:
            p=o.matrix_world@v.co;p.y*=1.5;v.co=inv@p
bpy.data.objects['Hatch 02 crossed grating'].location.x+=2.1
# Material copies let deck fittings remain distinct from the lighter planks.
for o in bpy.data.objects:
    if o.get('section')=='deck-astra':
        for slot in o.material_slots:
            if slot.material and slot.material.name.startswith('Ref oak'):
                old=slot.material;name='Fittings '+old.name;m=bpy.data.materials.get(name)
                if not m:
                    m=old.copy();m.name=name;c=list(old.diffuse_color);c[:3]=[c[0]*.55,c[1]*.45,c[2]*.38];m.diffuse_color=c;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=c
                slot.material=m
# Remove the deep holes between copper voxels by emitting only the union boundary.
o=bpy.data.objects['Closed copper shell'];cells={}
for k in range(0,len(o.data.vertices),8):
    p=sum((v.co for v in o.data.vertices[k:k+8]),Vector())/8
    cells[tuple(round((p[i]-.12)/.24) for i in range(3))]=o.data.polygons[k//8*6].material_index
vs=[];fs=[];ids=[];lookup={};neighbors=[(0,0,-1),(0,0,1),(0,-1,0),(1,0,0),(0,1,0),(-1,0,0)]
for cell,mi in cells.items():
    ix,iy,iz=cell
    for f,delta in zip(CF,neighbors):
        if tuple(cell[j]+delta[j] for j in range(3)) in cells:continue
        face=[]
        for index in f:
            corner=tuple(round((cell[j]+.5+CV[index][j])*.24,6) for j in range(3))
            if corner not in lookup:lookup[corner]=len(vs);vs.append(corner)
            face.append(lookup[corner])
        fs.append(face);ids.append(mi)
me=bpy.data.meshes.new('Copper continuous voxel surface');me.from_pydata(vs,[],fs)
for m in o.data.materials:me.materials.append(m)
for p,mi in zip(me.polygons,ids):p.material_index=mi
o.data=me
sc['rig_span_astra_done']=True
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/royal-navy-frigate.blend')
print('Section5 saved: widened transverse rig, lobe hems, distinct fittings, moved hatch, watertight copper surface')
