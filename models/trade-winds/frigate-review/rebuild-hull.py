import bpy, math, random, json
from mathutils import Vector
random.seed(211)
ROOT='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds'
def clear(collection):
    for o in list(bpy.data.collections[collection].objects): bpy.data.objects.remove(o,do_unlink=True)
for c in ['Hull','Stern gallery','Decks']: clear(c)
groups={}
def material(n,color):
    m=bpy.data.materials.get(n) or bpy.data.materials.new(n)
    m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.78
    return m
copper=[material('Ref copper %d'%i,(.265+i*.014,.079+i*.006,.033+i*.003)) for i in range(6)]
oak=[material('Ref oak %d'%i,(.40+i*.013,.255+i*.009,.117+i*.005)) for i in range(6)]
tar=material('Ref tar',(.023,.025,.022));gold=material('Ref gilding',(.65,.405,.135));darkgold=material('Ref carved ochre',(.39,.215,.065));glass=material('Ref dark glazing',(.025,.064,.083))
CV=[(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]
CF=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def box(n,p,s,m,c):
    g=groups.setdefault((c,n),[[],[],[],[]]);v,f,ms,mi=g
    if m not in ms:ms.append(m)
    k=len(v);v.extend([(p[0]+a*s[0],p[1]+b*s[1],p[2]+d*s[2]) for a,b,d in CV]);f.extend([tuple(k+i for i in face) for face in CF]);mi.extend([ms.index(m)]*6)
def beam(n,a,b,r,m,c):
    a,b=Vector(a),Vector(b);q=(b-a).to_track_quat('Z','Y');p=(a+b)/2
    g=groups.setdefault((c,n),[[],[],[],[]]);v,f,ms,mi=g
    if m not in ms:ms.append(m)
    k=len(v);v.extend([tuple(p+q@Vector((x*r,y*r,z*(b-a).length))) for x,y,z in CV]);f.extend([tuple(k+i for i in face) for face in CF]);mi.extend([ms.index(m)]*6)
def interp(x,pts):
    for (a,u),(b,v) in zip(pts,pts[1:]):
        if a<=x<=b:return u+(v-u)*(x-a)/(b-a)
    return pts[0][1] if x<pts[0][0] else pts[-1][1]
def halfwidth(x,z=5.9):
    front=-17.8-.66*min(z,6);back=18.9+.39*min(z,6)
    if not front<=x<=back:return 0
    t=(x-front)/(back-front)
    plan=interp(t,[(0,0),(.025,.27),(.07,.57),(.14,.79),(.3,.97),(.5,1),(.72,.93),(.9,.81),(1,.71)])
    cross=interp(z,[(0,.59),(.4,.64),(1,.74),(2,.86),(3,.95),(4.2,1),(5.9,.965),(7,.93)])
    return 5.8*plan*cross
# Occupied grid shells have real transverse closures and no exposed bilge.
step=.24;dz=.24
occupied=set()
for iz in range(27):
    z=.12+iz*dz
    for ix in range(-94,92):
        x=(ix+.5)*step;w=halfwidth(x,z)
        for iy in range(-25,25):
            if abs((iy+.5)*step)<w:occupied.add((ix,iy,iz))
for ix,iy,iz in sorted(occupied):
    # Retain walls and the true curved underside, omit enclosed internal cubes.
    if all((ix+a,iy+b,iz+c) in occupied for a,b,c in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,-1)]):continue
    x,y,z=(ix+.5)*step,(iy+.5)*step,.12+iz*dz
    near_side=abs(y)>halfwidth(x,z)-.8
    gunx=min([-16.6+i*2.15 for i in range(16)],key=lambda gx:abs(x-gx))
    if near_side and 4.45<z<5.15 and abs(x-gunx)<.42:continue
    m=random.choice(copper) if z<3.65 else tar if z<4.23 or z>5.62 else random.choice(oak)
    box('Closed copper shell' if z<3.65 else 'Closed upper hull',(x,y,z),(step-.006,step-.006,dz-.008),m,'Hull')
# Uniform dark core just behind gunports prevents seeing through the whole hull.
for side in [-1,1]:
    for i in range(16):
        x=-16.6+i*2.15;y=side*(halfwidth(x,4.8)-.42)
        box('Gunport dark interior',(x,y,4.8),(1,.22,.85),tar,'Hull')
        box('Gunport upper lid',(x,side*(halfwidth(x,5.3)+.04),5.3),(.94,.38,.12),tar,'Hull')
    for ix in range(-90,90):
        x=(ix+.5)*step;w=halfwidth(x,5.9)
        if w<.2:continue
        sheer=.45*max(0,(-x-15)/7)**2+.35*max(0,(x-13)/9)**2
        box('Continuous black wale',(x,side*(halfwidth(x,3.9)+.1),3.9),(step,.24,.24),tar,'Hull')
        box('Ochre waterline trim',(x,side*(halfwidth(x,4.22)+.13),4.22),(step,.12,.10),gold,'Hull')
        box('Sheer cap',(x,side*w,6.25+sheer),(step,.35,.3),tar,'Hull')
        box('Gilded sheer edge',(x,side*(w+.13),6.31+sheer),(step,.10,.11),gold,'Hull')
        box('Upper railing cap',(x,side*w,7.02+sheer),(step,.16,.12),darkgold,'Decks')
        if ix%4==0:box('Railing baluster',(x,side*w,6.66+sheer),(.10,.13,.75),tar,'Decks')
# Deck ends follow the hull and actually connect to its walls.
for ix in range(-91,92):
    x=(ix+.5)*step;w=halfwidth(x,5.9)-.14
    if w<=0:continue
    z=6.48 if x< -16 else 6.68 if x>13 else 5.93
    for iy in range(-25,25):
        y=(iy+.5)*step
        if abs(y)<w:box('Forecastle deck' if x< -16 else 'Quarterdeck' if x>13 else 'Main planked deck',(x,y,z),(step-.003,step-.005,.15),random.choice(oak),'Decks')
box('Keel and sternpost',(1,0,.06),(36,.48,.32),tar,'Hull')
# Raised, sweeping beak. Three layered U-shaped head rails wrap the bow in 3D.
for side in [-1,1]:
    for tier in range(3):
        pts=[(-23.7,side*.32,7.25+tier*.37),(-23.2,side*.62,6.65+tier*.37),(-22.5,side*1.2,5.72+tier*.37),(-21.5,side*2,5.22+tier*.37),(-20.2,side*2.9,5.35+tier*.37),(-18.7,side*3.95,6.08+tier*.37),(-17.8,side*4.15,6.62+tier*.37)]
        for a,b in zip(pts,pts[1:]):
            beam('Headrail black foundation',a,b,.33,tar,'Hull')
            aa=(a[0],a[1]+side*.19,a[2]);bb=(b[0],b[1]+side*.19,b[2]);beam('Three gilded headrails',aa,bb,.095,gold,'Hull')
    for x,y,z in [(-22.5,1.2,6.3),(-21.5,2,5.9),(-20.2,2.9,6.1),(-18.7,3.95,6.8)]:
        beam('Headrail uprights',(x,side*y,z-.6),(x,side*y,z+.6),.13,darkgold,'Hull')
for z in [i*.30 for i in range(24)]:
    x=interp(z,[(0,-17.8),(2,-19.25),(4,-21),(5.5,-22.1),(7.2,-23.8)])
    box('Rising stem',(x,0,z),(.48,.48,.32),random.choice(copper) if z<3.6 else tar,'Hull')
for i in range(12):
    x=-23.25+i*.38;w=.3+i*.16
    box('Beakhead grating',(x,0,6.95),(.15,2*w,.1),oak[2],'Decks')
# Full black gallery body, stepped crown and wraparound side windows.
for iz in range(12):
    z=4.1+iz*.29;w=interp(z,[(4.1,3.7),(4.6,4.45),(5.8,4.3),(6.6,4.0),(7.4,3.4)])
    for iy in range(-15,16):
        y=iy*.29
        if abs(y)<w:box('Enclosed gallery transom',(21.25,y,z),(.65,.285,.285),tar,'Stern gallery')
for z,w in [(4.18,4.5),(4.45,4.65),(5.43,4.6),(6.5,4.35),(6.75,4.3)]:
    box('Gallery projecting cornice',(21.66,0,z),(.63,w*2,.13),gold,'Stern gallery')
for row,z in enumerate([4.91,5.96]):
    for j in range(9):
        y=(j-4)*.9
        box('Inset stern glazing',(21.605,y,z),(.09,.65,.71),glass,'Stern gallery')
        for yy in [y-.38,y+.38]:box('Gallery window jamb',(21.72,yy,z),(.13,.085,.88),gold,'Stern gallery')
        for zz in [z-.42,z+.42]:box('Gallery sill',(21.72,y,zz),(.13,.84,.08),gold,'Stern gallery')
        box('Glazing cross vertical',(21.73,y,z),(.08,.047,.71),darkgold,'Stern gallery')
        box('Glazing cross horizontal',(21.73,y,z),(.08,.65,.047),darkgold,'Stern gallery')
for side in [-1,1]:
    box('Quarter gallery enclosing body',(20,side*4.45,5.46),(2.65,.65,2.15),tar,'Stern gallery')
    for j in range(4):
        x=18.97+j*.58
        for z in [4.94,5.94]:
            box('Quarter gallery glazing',(x,side*4.8,z),(.43,.07,.68),glass,'Stern gallery')
            for dx in [-.27,.27]:box('Side window jamb',(x+dx,side*4.88,z),(.07,.12,.88),gold,'Stern gallery')
    for z in [4.4,5.43,6.47]:box('Wraparound gallery cornice',(20,side*4.8,z),(2.9,.42,.12),gold,'Stern gallery')
    for x in [19,19.6,20.2,20.8]:beam('Gallery lower brackets',(x,side*4.65,4.35),(x-.3,side*3.7,3.85),.18,darkgold,'Stern gallery')
    # Stern lantern cages.
    x,y,z=21.35,side*3.85,7.65
    box('Lantern glass',(x,y,z),(.48,.45,.65),oak[5],'Stern gallery')
    for xx in [-.25,.25]:
        for yy in [-.23,.23]:box('Lantern cage',(x+xx,y+yy,z),(.07,.07,.8),gold,'Stern gallery')
    for zz in [-.43,.43]:box('Lantern roof and base',(x,y,z+zz),(.64,.60,.12),gold,'Stern gallery')
    box('Lantern finial',(x,y,z+.63),(.13,.13,.28),gold,'Stern gallery')
for j in range(-24,25):
    y=j*.16;z=6.91+.87*max(0,1-(y/3.9)**2)
    box('Stepped arched taffrail',(21.58,y,z),(.32,.17,.26),gold,'Stern gallery')
    if j%3==0:
        box('Taffrail carved rosette',(21.78,y,z-.30),(.12,.16,.18),darkgold,'Stern gallery')
for dy,dz in [(0,0),(-.24,0),(.24,0),(0,.24),(0,-.24)]:box('Central royal crest',(21.83,dy,7.28+dz),(.17,.26,.26),gold,'Stern gallery')
box('Attached rudder',(21.05,0,1.68),(.85,.42,3.3),oak[0],'Stern gallery')
for z in [.55,1.45,2.35,3.1]:box('Rudder pintle',(20.62,0,z),(.72,.48,.12),tar,'Stern gallery')
for (collection,n),(vs,fs,ms,ids) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ids):p.material_index=i
    o=bpy.data.objects.new(n,me);bpy.data.collections[collection].objects.link(o)
    o['reconstruction_section']='closed-hull-and-ends-v1'
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/royal-navy-frigate.blend')
print(json.dumps({'rebuilt_parts':len(groups),'shell_blocks':len(occupied)}))
