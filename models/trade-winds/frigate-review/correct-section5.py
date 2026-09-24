import bpy,math,random
from mathutils import Vector,Matrix
ROOT='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds'
src=open(ROOT+'/frigate-review/detail-deck-astra.py').read();exec(src[src.index('groups={}'):src.index('def deckz')])
a=math.radians(65);along=Vector((math.cos(a),math.sin(a),0));normal=Vector((-math.sin(a),math.cos(a),0))
masts=[(-11,[(9,15,7),(16,23,5.5),(24,29,3.6)]),(4,[(9,16,7),(17,25,5.5),(26,31,3.4)]),(14,[(17,23,3.8),(24,27,2.5)])]
for o in list(bpy.data.objects):
    if o.name.startswith('Yard ') and o.name!='Yard lifts':bpy.data.objects.remove(o,do_unlink=True)
    elif o.name.startswith('Reference canvas'):bpy.data.objects.remove(o,do_unlink=True)
cream=[bpy.data.materials['Reference linen %d'%i] for i in range(6)];tar=bpy.data.materials['Ref tar'];random.seed(80)
for mast,(x,tiers) in enumerate(masts):
    for tier,(bottom,top,span) in enumerate(tiers):
        end=along*(span*1.05);end.y*=1.5
        beam('Yard %d %d'%(mast,tier),Vector((x,0,top))+end,Vector((x,0,top))-end,.22 if tier==0 else .16,tar,'Masts and yards')
        step=.19;dz=.24
        def point(u,z,thickness):
            frac=max(0,min(1,(top-z)/(top-bottom)))
            billow=.50*math.sin(math.pi*frac)*math.cos(u/span*math.pi/2)
            p=Vector((x,-.18,z))+along*u+normal*(billow+thickness);p.y*=1.5;return tuple(p)
        for i in range(math.ceil(2*span/step)):
            u=-span+(i+.5)*step;un=abs(u)/span
            rise=(1.20 if tier==0 else .55)*((un-.52)/.52)**2
            for j in range(math.ceil((top-bottom)/dz)):
                z=bottom+(j+.5)*dz;frac=(top-z)/(top-bottom)
                if z>top or un>.82+.18*frac or z<bottom+rise:continue
                vs=[point(u+xx*step,z+zz*dz,yy*.045) for xx,yy,zz in CV]
                geo('Reference canvas %d tier%d'%(mast,tier),vs,CF,random.choice(cream),'Sails')
for (c,n),(vs,fs,ms,ids) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ids):p.material_index=i
    o=bpy.data.objects.new(n,me);bpy.data.collections[c].objects.link(o)
# Preserve the existing hull envelope, replace deep voxel cavities with closed faceted strakes.
src=open(ROOT+'/frigate-review/rebuild-hull.py').read();exec(src[src.index('def interp'):src.index('# Occupied')])
o=bpy.data.objects['Closed copper shell'];vs=[];fs=[];ids=[]
N=192;layers=16
# Each ring samples the same point of the taper from bow to stern.
for iz in range(layers):
    z=iz*.24
    front=-17.8-.66*z;back=18.9+.39*z
    for k in range(N):
        t=k/(N/2) if k<=N/2 else (N-k)/(N/2)
        x=front+(back-front)*t
        y=halfwidth(x,z)*(1 if k<N/2 else -1)
        # Deliberately faceted cross-section, extremely shallow strake seam.
        vs.append((x,y,z))
for iz in range(layers-1):
    for k in range(N):
        fs.append((iz*N+k,iz*N+(k+1)%N,(iz+1)*N+(k+1)%N,(iz+1)*N+k));ids.append((k//3*7+iz*3)%6)
fs.append(tuple(range(N-1,-1,-1)));ids.append(0)
fs.append(tuple((layers-1)*N+k for k in range(N)));ids.append(0)
me=bpy.data.meshes.new('Shallow faceted copper strakes');me.from_pydata(vs,[],fs)
for m in o.data.materials:me.materials.append(m)
for p,i in zip(me.polygons,ids):p.material_index=i
o.data=me
# Quiet thin horizontal seams follow the skin with only 0.006m relief.
groups={};seam=bpy.data.materials.get('Copper strake seams') or bpy.data.materials['Ref copper 0'].copy();seam.name='Copper strake seams'
c=(.12,.028,.012,1);seam.diffuse_color=c;seam.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=c
old=bpy.data.objects.get('Copper shallow strake joints')
if old:bpy.data.objects.remove(old,do_unlink=True)
for iz in range(1,layers-1):
    for k in range(N):
        p=Vector(vs[iz*N+k]);q=Vector(vs[iz*N+(k+1)%N]);p.y+=math.copysign(.006,p.y);q.y+=math.copysign(.006,q.y)
        beam('Copper shallow strake joints',p,q,.009,seam,'Hull')
for (c,n),(vv,ff,ms,ii) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vv,[],ff)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ii):p.material_index=i
    o=bpy.data.objects.new(n,me);bpy.data.collections[c].objects.link(o)
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/royal-navy-frigate.blend')
PREFIX='section5b-astra'
exec(compile(open(ROOT+'/frigate-review/render-neutral.py').read(),'render-neutral.py','exec'))
