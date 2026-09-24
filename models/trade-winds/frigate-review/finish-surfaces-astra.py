import bpy,math,bmesh,random
from mathutils import Vector
ROOT='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds'
sc=bpy.context.scene;assert not sc.get('surface_astra_done')
src=open(ROOT+'/frigate-review/detail-deck-astra.py').read();exec(src[src.index('groups={}'):src.index('def deckz')])
src=open(ROOT+'/frigate-review/rebuild-hull.py').read();exec(src[src.index('def interp'):src.index('# Occupied')])
# Repair floating-point endpoint collapse at the transom, retaining the established envelope.
o=bpy.data.objects['Closed copper shell'];N=192
for iz in range(16):
    z=iz*.24;front=-17.8-.66*z;back=18.9+.39*z
    for k in range(N):
        t=k/96 if k<=96 else (N-k)/96
        if k==95:t=1
        x=front+(back-front)*t
        # Never feed an extrapolated endpoint into the profile guard.
        w=halfwidth(min(back-1e-7,max(front+1e-7,x)),z)
        p=Vector((x,w*(1 if k<96 else -1),z));taper=max(0,min(1,(p.x-16)/5.5))
        p.x-=1.6*taper*taper*(abs(p.y)/5.5)**3;p.y*=1-.06*taper*taper
        o.data.vertices[iz*N+k].co=p
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
verts=[v.co.copy() for v in o.data.vertices];seam=bpy.data.materials['Copper strake seams']
for n in ['Copper shallow strake joints','Staggered copper panel joints']:
    old=bpy.data.objects.get(n)
    if old:bpy.data.objects.remove(old,do_unlink=True)
for iz in range(1,15):
    for k in range(N):
        p=verts[iz*N+k].copy();q=verts[iz*N+(k+1)%N].copy()
        normal=Vector((1,0,0)) if k==95 else Vector((0,math.copysign(1,p.y),0))
        beam('Copper shallow strake joints',p+normal*.008,q+normal*.008,.014,seam,'Hull')
for iz in range(15):
    for k in range(1+iz%2,N,3):
        p=verts[iz*N+k].copy();q=verts[(iz+1)*N+k].copy();p.y+=math.copysign(.009,p.y);q.y+=math.copysign(.009,q.y)
        beam('Staggered copper panel joints',p,q,.014,seam,'Hull')
# Rudder now follows the rake of the actual transom and its hinges reach the sternpost.
for name in ['Attached rudder','Rudder pintle']:
    ob=bpy.data.objects[name]
    for v in ob.data.vertices:v.co.x+=-1.90+.39*v.co.z
# Remove duplicated overlapping driver panels and use the same thin faceted cloth treatment throughout.
cream=[bpy.data.materials['Reference linen %d'%i] for i in range(6)]
for i,m in enumerate(cream):
    c=(.79+i*.006,.72+i*.006,.59+i*.006,1);m.diffuse_color=c;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=c;p.inputs['Emission Color'].default_value=c;p.inputs['Emission Strength'].default_value=.35
sets=[('Shaped outer jib',['Outer jib.258']),('Shaped inner jib',['Inner jib.187']),('Shaped driver',['Spanker.215','Spanker upper gaff.128']),('Shaped spritsail',['Bowsprit spritsail.034'])]
random.seed(33)
for name,names in sets:
    cells={}
    for oldname in names:
        ob=bpy.data.objects.get(oldname)
        if not ob:continue
        for k in range(0,len(ob.data.vertices),8):
            vv=[ob.matrix_world@v.co for v in ob.data.vertices[k:k+8]];p=sum(vv,Vector())/8
            cells[(round(p.x,3),round(p.z,3))]=p
        bpy.data.objects.remove(ob,do_unlink=True)
    xx=[p.x for p in cells.values()];zz=[p.z for p in cells.values()];xmin,xmax=min(xx)-.21,max(xx)+.21;zmin,zmax=min(zz)-.21,max(zz)+.21
    def point(x,z,th):
        u=(x-xmin)/(xmax-xmin);v=(z-zmin)/(zmax-zmin)
        return (x,-.15+.32*math.sin(math.pi*u)*math.sin(math.pi*v)+th,z)
    for x,z in cells:
        for dx in [-.105,.105]:
            for dz in [-.105,.105]:
                geo(name,[point(x+dx+a*.21,z+dz+c*.21,b*.045) for a,b,c in CV],CF,random.choice(cream),'Sails')
for (c,n),(vs,fs,ms,ids) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ids):p.material_index=i
    ob=bpy.data.objects.new(n,me);bpy.data.collections[c].objects.link(ob)
# Higher sample count makes comparison of fine relief reliable.
sc.eevee.taa_render_samples=64
sc['surface_astra_done']=True
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/royal-navy-frigate.blend')
PREFIX='section7-astra'
exec(compile(open(ROOT+'/frigate-review/render-neutral.py').read(),'render-neutral.py','exec'))
