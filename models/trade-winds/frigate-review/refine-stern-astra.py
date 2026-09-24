import bpy,math,bmesh
from mathutils import Vector
ROOT='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds'
sc=bpy.context.scene
assert not sc.get('stern_astra_done'),'Already applied'
src=open(ROOT+'/frigate-review/detail-deck-astra.py').read();exec(src[src.index('groups={}'):src.index('def deckz')])
# Copper joints are shallow seams, staggered as in the reference courses.
o=bpy.data.objects['Closed copper shell'];verts=[v.co.copy() for v in o.data.vertices];N=192
seam=bpy.data.materials['Copper strake seams']
for iz in range(15):
    for k in range(1+(iz%2),N,3):
        p=verts[iz*N+k].copy();q=verts[(iz+1)*N+k].copy()
        p.y+=math.copysign(.009,p.y);q.y+=math.copysign(.009,q.y)
        beam('Staggered copper panel joints',p,q,.018,seam,'Hull')
for i in range(6):
    m=bpy.data.materials['Ref copper %d'%i];c=(.167+i*.010,.042+i*.0035,.017+i*.0018,1);m.diffuse_color=c;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=c
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
# Additional compact relief on the curved taffrail.
gold=bpy.data.materials['Ref gilding'];ochre=bpy.data.materials['Ref carved ochre'];tar=bpy.data.materials['Ref tar']
for side in [-1,1]:
    for t in range(30):
        a=t*math.pi*1.7/29;r=.33*(1-t/38);y=side*(1.12+r*math.cos(a));z=7.2+r*math.sin(a)
        box('Royal crest scroll relief',(21.90,y,z),(.10,.09,.09),gold,'Stern gallery')
for y in [-3.9,-3,-2.1,-1.2,1.2,2.1,3,3.9]:
    for z in [4.37,5.42,6.51]:
        box('Gallery carved bosses',(21.87,y,z),(.09,.18,.15),ochre,'Stern gallery')
        box('Gallery boss gilded center',(21.93,y,z),(.055,.07,.07),gold,'Stern gallery')
# Flags are tessellated colored geometry: no image textures.
old=bpy.data.objects.get('Ensign block.528')
if old:bpy.data.objects.remove(old,do_unlink=True)
def mat(n,c):
    m=bpy.data.materials.get(n) or bpy.data.materials.new(n);m.use_nodes=True;m.diffuse_color=(*c,1);p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.85;return m
white=mat('Ensign warm white',(.79,.75,.65));red=mat('Ensign vermilion',(.42,.025,.015));blue=mat('Ensign naval blue',(.015,.042,.09))
def flagcolor(u,v):
    if abs(u-.5)<.065 or abs(v-.5)<.065:return red
    if u<.435 and v<.435:
        x=u/.435;y=v/.435
        if abs(x-.5)<.07 or abs(y-.5)<.07:return red
        if abs(x-.5)<.135 or abs(y-.5)<.135:return white
        d=min(abs(y-x),abs(y-(1-x)))
        if d<.038:return red
        if d<.105:return white
        return blue
    return white
for name,origin,width,height,skew in [('Main mast ensign',(4.45,-.05,34.7),2.5,1.55,.35),('Stern ensign',(21.6,-.18,17.65),2.8,4.0,.85)]:
    nu,nv=60,48
    def pos(u,v,d):
        wave=.22*math.sin(u*math.pi*3-v*.6)*u
        return (origin[0]+width*u+.38*v if name.startswith('Stern') else origin[0]+width*u,origin[1]+skew*width*u+wave+d,origin[2]-height*v-.42*u)
    for i in range(nu):
        for j in range(nv):
            u=(i+.5)/nu;v=(j+.5)/nv
            vv=[pos(u+a/nu,v+c/nv,b*.025) for a,b,c in CV]
            geo(name,vv,CF,flagcolor(u,v),'Sails')
for (c,n),(vs,fs,ms,ids) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ids):p.material_index=i
    o=bpy.data.objects.new(n,me);bpy.data.collections[c].objects.link(o)
# Shape only the last six metres of hull/deck/gallery; all details follow the same deformation.
collections={'Hull','Decks','Stern gallery','Props','Cannons'}
for o in bpy.data.objects:
    if o.type!='MESH' or not any(c.name in collections for c in o.users_collection):continue
    if max((o.matrix_world@v.co).x for v in o.data.vertices)<16:continue
    if o.data.users>1:o.data=o.data.copy()
    if any(c.name=='Stern gallery' for c in o.users_collection):
        bm=bmesh.new();bm.from_mesh(o.data);edges=[e for e in bm.edges if e.calc_length()>1.4]
        if edges:bmesh.ops.subdivide_edges(bm,edges=edges,cuts=12,use_grid_fill=True)
        bm.to_mesh(o.data);bm.free()
    inv=o.matrix_world.inverted()
    for v in o.data.vertices:
        p=o.matrix_world@v.co;t=max(0,min(1,(p.x-16)/5.5))
        p.x-=1.6*t*t*(abs(p.y)/5.5)**3;p.y*=1-.06*t*t;v.co=inv@p
# Neutral fill illuminates front-facing canvas without washing out dark tar.
ld=bpy.data.lights.new('Bow neutral soft fill','AREA');lo=bpy.data.objects.new('Bow neutral soft fill',ld);sc.collection.objects.link(lo)
lo.location=(-45,-8,32);lo.rotation_euler=(Vector((0,0,18))-lo.location).to_track_quat('-Z','Y').to_euler();ld.energy=5000;ld.shape='DISK';ld.size=30
sc['stern_astra_done']=True
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/royal-navy-frigate.blend')
PREFIX='section6-astra'
exec(compile(open(ROOT+'/frigate-review/render-neutral.py').read(),'render-neutral.py','exec'))
