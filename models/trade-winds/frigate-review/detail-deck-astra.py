import bpy,math,random,json
from mathutils import Vector
random.seed(1234)
ROOT='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds'
for o in list(bpy.data.objects):
    if any(c.name=='Cannons' for c in o.users_collection) or (any(c.name=='Props' for c in o.users_collection) and not o.name.startswith('Anchor')):
        bpy.data.objects.remove(o,do_unlink=True)
for o in list(bpy.data.objects):
    if o.get('section')=='deck-astra':bpy.data.objects.remove(o,do_unlink=True)
wood=[bpy.data.materials['Ref oak %d'%i] for i in range(6)]
iron=bpy.data.materials['Ref tar'];gold=bpy.data.materials['Ref carved ochre'];hemp=bpy.data.materials['Reference tarred rigging']
groups={}
CV=[(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]
CF=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def geo(n,v,f,m,c='Props'):
    vs,fs,ms,mi=groups.setdefault((c,n),[[],[],[],[]]);off=len(vs)
    if m not in ms:ms.append(m)
    vs.extend(v);fs.extend([tuple(off+i for i in a) for a in f]);mi.extend([ms.index(m)]*len(f))
def box(n,p,s,m,c='Props'):
    geo(n,[(p[0]+x*s[0],p[1]+y*s[1],p[2]+z*s[2]) for x,y,z in CV],CF,m,c)
def beam(n,a,b,r,m,c='Props'):
    a,b=Vector(a),Vector(b);q=(b-a).to_track_quat('Z','Y');p=(a+b)/2
    geo(n,[tuple(p+q@Vector((x*r,y*r,z*(b-a).length))) for x,y,z in CV],CF,m,c)
def cylinder(n,p,r,length,m,axis='Z',sides=12,c='Props',r2=None):
    q=Vector((0,0,1) if axis=='Z' else (0,1,0) if axis=='Y' else (1,0,0)).to_track_quat('Z','Y')
    vs=[];r2=r if r2 is None else r2
    for z,rr in [(-length/2,r),(length/2,r2)]:
        vs.extend([tuple(Vector(p)+q@Vector((rr*math.cos(i*2*math.pi/sides),rr*math.sin(i*2*math.pi/sides),z))) for i in range(sides)])
    fs=[tuple(range(sides-1,-1,-1)),tuple(range(sides,sides*2))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    geo(n,vs,fs,m,c)
def deckz(x):return 6.56 if x< -16 else 6.76 if x>13 else 6.01
def hw(x):
    pts=[(-21.5,1),(-20,2.5),(-18,3.8),(-15,4.8),(-10,5.4),(0,5.6),(10,5.2),(17,4.65),(21.2,4)]
    for (a,u),(b,v) in zip(pts,pts[1:]):
        if a<=x<=b:return u+(v-u)*(x-a)/(b-a)
    return 4
# Varied hatch assemblies: coamings, dark recess, crossed timber lattice, rim bolts.
for index,(x,y,sx,sy) in enumerate([(-13.7,0,2.4,2),(-3.6,0,3.5,2.4),(5.1,0,2.1,1.8),(10.7,0,1.5,1.7),(17.8,0,1.8,1.6)]):
    n='Hatch %02d crossed grating'%index;z=deckz(x)
    box(n,(x,y,z+.03),(sx,sy,.10),iron)
    for side in [-1,1]:
        box(n,(x+side*sx/2,y,z+.17),(.18,sy+.24,.32),wood[1])
        box(n,(x,y+side*sy/2,z+.17),(sx+.18,.18,.32),wood[1])
    for i in range(1,int(sx/.20)):
        xx=x-sx/2+i*.20;box(n,(xx,y,z+.17),(.08,sy-.08,.12),wood[2+i%3])
    for i in range(1,int(sy/.20)):
        yy=y-sy/2+i*.20;box(n,(x,yy,z+.17),(sx-.08,.075,.12),wood[2+i%3])
    for dx in [-sx/2,sx/2]:
        for dy in [-sy/2,sy/2]:box(n,(x+dx,y+dy,z+.35),(.055,.055,.045),iron)
# Three mast partners, octagonal collars, belaying pin racks and bitts.
for index,x in enumerate([-11,4,14]):
    z=deckz(x);n='Mast %d partners and belaying pins'%index
    box(n,(x,0,z+.08),(1.5,1.3,.18),wood[0]);box(n,(x,0,z+.23),(1.12,1.03,.18),wood[3])
    cylinder(n,(x,0,z+.42),.48,.23,iron,sides=8)
    for side in [-1,1]:
        for xx in [x-.9,x+.9]:box(n,(xx,side*1.18,z+.43),(.22,.22,.82),wood[0])
        box(n,(x,side*1.18,z+.8),(2.1,.28,.20),wood[3])
        for j in range(7):cylinder(n,(x-.8+j*.27,side*1.18,z+.98),.045,.35,wood[1],sides=8)
# Stepped capstan barrel on proper foot; six handspikes with compact radial geometry.
x,y=-18.0,0;z=deckz(x);n='Forecastle capstan complete'
cylinder(n,(x,y,z+.10),.85,.2,wood[0],sides=12)
cylinder(n,(x,y,z+.49),.49,.65,wood[2],sides=10,r2=.57)
for zz in [.26,.63]:cylinder(n,(x,y,z+zz),.55,.08,iron,sides=10)
cylinder(n,(x,y,z+.92),.72,.23,wood[3],sides=12)
for i in range(6):
    a=i*math.pi/3;beam(n,(x+.43*math.cos(a),y+.43*math.sin(a),z+.91),(x+1.40*math.cos(a),y+1.40*math.sin(a),z+.91),.12,wood[1])
# Coopered barrels with bulging staves, dark hoops and lids, grouped like deck plan.
for j,(x,y) in enumerate([(-15.0,1.8),(-14.3,2.0),(-14.8,2.65),(-18.4,-1.7),(-17.7,-2.0),(8.5,1.7),(9.2,1.95),(8.7,2.5),(16.5,-2.0),(17.2,-2.2),(18.1,2.0)]):
    n='Barrel %02d'%j;z=deckz(x);r=.33;h=.84
    for i in range(12):
        a=2*math.pi*i/12
        for zz,rr in [(.12,.29),(.34,.34),(.56,.34),(.76,.29)]:
            box(n,(x+rr*math.cos(a),y+rr*math.sin(a),z+zz),(.16,.16,.22),wood[(j+i)%6])
    for zz,rr in [(.16,.34),(.66,.35)]:cylinder(n,(x,y,z+zz),rr,.065,iron,sides=12)
    cylinder(n,(x,y,z+.87),.30,.07,wood[j%6],sides=12)
    box(n,(x,y,z+.91),(.58,.04,.025),wood[0])
# Companionways and raised-deck steps aligned to actual deck levels.
for side in [-1,1]:
    for x,low,high,direction in [(-15.8,6.01,6.56,-1),(13.1,6.01,6.76,1)]:
        n='Deck companionway %s %s'%(x,side);y=side*2.65
        for i in range(6):box(n,(x+direction*i*.18,y,low+.1+i*(high-low)/6),(.20,.95,.12),wood[3])
        for dy in [-.55,.55]:
            beam(n,(x,y+dy,low),(x+direction*1.15,y+dy,high),.10,wood[0])
            beam(n,(x,y+dy,low+.8),(x+direction*1.15,y+dy,high+.8),.085,wood[1])
            for t in [0,1]:beam(n,(x+direction*1.15*t,y+dy,low+(high-low)*t),(x+direction*1.15*t,y+dy,low+(high-low)*t+.8),.09,wood[0])
# Compact substantial artillery; every assembly is separately editable.
for side in [-1,1]:
    for i in range(16):
        x=-16.6+i*2.15;outer=hw(x)+.42;y=side*(outer-1.18);z=deckz(x);n='Cannon %s %02d complete'%(side,i);c='Cannons'
        box(n,(x,y,z+.25),(.83,1.03,.30),wood[0],c)
        for dx in [-.38,.38]:
            box(n,(x+dx,y,z+.46),(.19,.93,.36),wood[2],c)
            for dy in [-.37,.36]:cylinder(n,(x+dx*1.32,y+dy,z+.21),.205,.15,iron,axis='X',sides=8,c=c)
        # Three octagonal segments and rings give a tapered tube silhouette.
        for dy,rr,ll in [(-.32,.255,.43),(.13,.22,.53),(.68,.185,.61)]:cylinder(n,(x,y+side*dy,z+.67),rr,ll,iron,axis='Y',sides=12,c=c)
        for dy,rr in [(-.52,.28),(-.08,.24),(.89,.205)]:cylinder(n,(x,y+side*dy,z+.67),rr,.075,iron,axis='Y',sides=12,c=c)
        cylinder(n,(x,y-side*.64,z+.67),.11,.18,iron,axis='Y',sides=8,c=c)
        # Dark bore inset with a twelve-sided muzzle ring.
        front=y+side*.99
        v=[];f=[]
        for yy,r in [(front-side*.06,.205),(front,.205),(front,.13),(front-side*.16,.13)]:
            v.extend([(x+r*math.cos(k*math.pi/6),yy,z+.67+r*math.sin(k*math.pi/6)) for k in range(12)])
        for ring in range(3):
            for k in range(12):f.append((ring*12+k,ring*12+(k+1)%12,(ring+1)*12+(k+1)%12,(ring+1)*12+k))
        geo(n,v,f,iron,c)
        beam(n,(x-.52,y-side*.44,z+.22),(x+.52,y-side*.44,z+.22),.10,wood[0],c)
# Bitts, cleats, coils and shot racks populate working areas without blocking gangways.
for j,(x,y) in enumerate([(-19,1.5),(-19,-1.5),(-8,2.5),(-8,-2.5),(-.5,3),(-.5,-3),(7.5,-2.6),(19,2.9),(19,-2.9)]):
    z=deckz(x);n='Working bitt and rope coil %02d'%j
    for dx in [-.24,.24]:box(n,(x+dx,y,z+.25),(.19,.23,.52),wood[0])
    box(n,(x,y,z+.53),(.9,.25,.16),wood[3])
    for radius in [.19,.26,.33]:
        for k in range(16):
            a=k*math.pi/8;b=(k+1)*math.pi/8
            beam(n,(x+.7+radius*math.cos(a),y+radius*math.sin(a),z+.045),(x+.7+radius*math.cos(b),y+radius*math.sin(b),z+.045),.035,hemp)
for x,y in [(-6,3.5),(1,-3.7),(12,3.2)]:
    n='Shot rack %.1f'%x;z=deckz(x);box(n,(x,y,z+.07),(1.1,.65,.12),wood[0])
    for i in range(3):
        for j in range(2):cylinder(n,(x-.34+i*.34,y-.17+j*.34,z+.20),.13,.23,iron,sides=8)
# Quarterdeck wheel and binnacle.
n='Helm wheel and binnacle';x=18.3;y=-1.35;z=deckz(x)
for yy in [y-.28,y+.28]:box(n,(x,yy,z+.5),(.23,.2,1),wood[0])
for k in range(12):
    a=k*math.pi/6;b=(k+1)*math.pi/6
    beam(n,(x+.64*math.sin(a),y,z+.85+.64*math.cos(a)),(x+.64*math.sin(b),y,z+.85+.64*math.cos(b)),.085,wood[2])
    beam(n,(x,y,z+.85),(x+.76*math.sin(a),y,z+.85+.76*math.cos(a)),.065,wood[3])
box(n,(x-1.4,y,z+.42),(.62,.62,.82),wood[0]);box(n,(x-1.4,y,z+.88),(.76,.76,.15),gold)
for (c,n),(vs,fs,ms,mi) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,mi):p.material_index=i
    o=bpy.data.objects.new(n,me);bpy.data.collections[c].objects.link(o);o['section']='deck-astra'
for c in ['Sails','Rigging','Masts and yards']:
    for o in bpy.data.collections[c].objects:o.hide_render=False
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/royal-navy-frigate.blend')
print(json.dumps({'new_assemblies':len(groups),'scene_objects':len(bpy.data.objects)}))
