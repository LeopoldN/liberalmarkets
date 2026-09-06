"""Create the reference-inspired, animated sunset trading-post scene.

Blender --background --python models/trade-winds/build-harbor-sunset.py [-- --render]
Rebuilding replaces harbor-sunset.blend; export-harbor-sunset.py exports saved edits.
"""
import bpy, math, random, runpy, sys
from pathlib import Path
from mathutils import Vector, Quaternion

HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[1]
H=runpy.run_path(str(HERE/'sloop-voxel-tools.py'))
Mesh=H['Mesh']; palette=H['palette']; attach=H['attach']
random.seed(1841)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):bpy.data.collections.remove(c)
def col(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
stall=col('01 • Merchant stall and provisions');dock=col('02 • Cobblestone quay and cargo')
actors=col('03 • Animated dockside characters');tackle=col('04 • Swaying ropes and lanterns')
harbor=col('05 • Moored tall ships');city=col('06 • Cliffside port and fortress')
sky=col('07 • Voxel sunset and clouds');studio=col('Studio • presentation only')
def pigment(h,v=.15,metal=0,emission=0):
    rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return palette(tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb),v,metal,emission)
oak=pigment('805331',.22);board=pigment('9a6e43',.18);dark=pigment('403022',.20)
edge=pigment('b0814b',.15);iron=pigment('303938',.13,.45);brass=pigment('b78b39',.12,.5)
hemp=pigment('bda37b',.14);canvas=pigment('cab798',.11);white=pigment('ddd3bb',.09)
skin=pigment('c79866',.09);skinshade=pigment('ad784c',.09);hair=pigment('513420',.15)
vest=pigment('51463b',.1);navy=pigment('303c43',.1);leather=pigment('332b24',.12)
red=pigment('8d3827',.12);green=pigment('3d5940',.17);amber=pigment('9b5721',.14)
black=pigment('161a1a',.08);stone=pigment('7e7a70',.19);mortar=pigment('514b41',.1)
flame=pigment('ffc34a',.06,emission=3);paper=pigment('ddcc9f',.1)
def empty(name,loc=(0,0,0),parent=None,collection=actors):
    o=bpy.data.objects.new(name,None);collection.objects.link(o);o.location=loc
    if parent:attach(o,parent)
    return o
def box(m,p,s,pal,cell=.22,rot=None):
    if m.col in [stall,dock,actors,tackle] and cell<2:cell=min(cell,.105)
    m.box(p,s,pal,cell,rot)
def beam(m,a,b,w,pal,depth=None,cell=.2):
    a=Vector(a);b=Vector(b);m.box((a+b)/2,(w,depth or w,(b-a).length),pal,cell,(b-a).to_track_quat('Z','Y'))
def line(m,a,b,w,pal,sag=0):
    a=Vector(a);b=Vector(b);n=max(2,min(130,math.ceil((b-a).length/(w*.95))))
    for i in range(n+1):
        t=i/n;p=a.lerp(b,t);p.z-=math.sin(t*math.pi)*sag;m.box(p,(w,w,w),pal,2)
def ring(m,c,r,w,pal,axis='Z',n=24):
    for i in range(n):
        a=math.tau*i/n;p=Vector(c)
        if axis=='Z':p.x+=r*math.cos(a);p.y+=r*math.sin(a)
        elif axis=='Y':p.x+=r*math.cos(a);p.z+=r*math.sin(a)
        else:p.y+=r*math.cos(a);p.z+=r*math.sin(a)
        m.box(p,(w,)*3,pal,2)
def soft_voxel(m,center,size,pal,cell=.075,power=5):
    nx,ny,nz=[max(2,round(v/cell)) for v in size];occ=set()
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                if sum(abs((a+.5)/n*2-1)**power for a,n in zip((i,j,k),(nx,ny,nz)))<1:occ.add((i,j,k))
    origin=tuple(center[a]-[nx,ny,nz][a]*cell/2 for a in range(3))
    m.voxels(occ,origin,cell,pal)
def barrel(m,x,y,z,r=.54,h=1.45):
    sides=16;rows=max(6,round(h/.13));levels=[]
    for k in range(rows):
        zz=(k+.5)/rows;rr=r*(.84+.16*math.sin(math.pi*zz));levels.append(rr)
        for i in range(sides):
            a=i*math.tau/sides
            box(m,(x+rr*.90*math.cos(a),y+rr*.90*math.sin(a),z+zz*h),(.16*r,rr*.39,h/rows*.98),oak,.12,Quaternion((0,0,1),a))
    for zz in [.13,.30,.73,.91]:
        rr=r*(.84+.16*math.sin(math.pi*zz))
        for i in range(sides):
            a=i*math.tau/sides
            box(m,(x+rr*.94*math.cos(a),y+rr*.94*math.sin(a),z+h*zz),(.055,rr*.405,.105),iron,.12,Quaternion((0,0,1),a))
            if i%2==0:box(m,(x+rr*.984*math.cos(a),y+rr*.984*math.sin(a),z+h*zz),(.046,.046,.04),black,2)
    for i in range(-6,7):
        for j in range(-6,7):
            if i*i+j*j<34:box(m,(x+i*r*.14,y+j*r*.14,z+h-.035),(r*.139,r*.139,.055),board,2)
    box(m,(x+.12,y,z+h),(.12,.12,.035),dark)
def crate(m,x,y,z,s=1.1,open=False):
    box(m,(x,y,z+.08),(s,s,.15),dark)
    for k in range(4):
        zz=z+(k+.5)*s/4
        for side in [-1,1]:
            box(m,(x+side*s*.45,y,zz),(.13,s,s*.21),oak,.16)
            box(m,(x,y+side*s*.45,zz),(s,.13,s*.21),board,.16)
    for side in [-1,1]:
        for sy in [-1,1]:box(m,(x+side*s*.46,y+sy*s*.47,z+s*.5),(.13,.13,s),edge)
    if not open:box(m,(x,y,z+s),(s,s,.12),board,.17)
    for xx in [-.32,.32]:
        for zz in [.15,.8]:box(m,(x+xx*s,y-s*.527,z+zz*s),(.06,.025,.065),iron,1)
def bottle(m,x,y,z,h=.85,pal=green):
    soft_voxel(m,(x,y,z+h*.31),(.30,.30,h*.62),pal,.045,5)
    soft_voxel(m,(x,y,z+h*.65),(.23,.23,h*.19),pal,.04,3)
    box(m,(x,y,z+h*.86),(.105,.105,h*.28),pal,.065)
    box(m,(x,y,z+h*1.01),(.125,.125,.07),hemp,.055)
    box(m,(x,y-.153,z+h*.30),(.19,.018,h*.21),paper,.08)
    for i in range(3):box(m,(x,y-.164,z+h*(.25+i*.04)),(.11,.009,.012),dark,2)
def chest(m,x,y,z,w=1):
    box(m,(x,y,z+w*.35),(w,.65*w,.7*w),dark,.15)
    box(m,(x,y,z+w*.74),(w*1.04,.70*w,.12*w),board,.13)
    for xx in [-.34,.34]:
        box(m,(x+xx*w,y,z+.805*w),(.105*w,.7*w,.035),iron)
        box(m,(x+xx*w,y-.34*w,z+.35*w),(.105*w,.04,.68*w),iron)
    box(m,(x,y-.37*w,z+.42*w),(.18*w,.05,.23*w),brass)
    box(m,(x,y-.405*w,z+.43*w),(.055*w,.018,.075*w),black)

# The left-hand shop is deep and layered: exposed joinery, stocked shelves,
# a heavily furnished counter, and a ragged textile canopy.
m=Mesh('Stall • oak frame and roof',stall)
for x in [-9,-.15]:
    for y in [-.1,4.8]:
        box(m,(x,y,4.4),(.45,.48,9.0),dark)
        for zz in [1.0,4.7,7.6]:box(m,(x,y,zz),(.52,.55,.18),iron)
for zz in [1.0,4.8,8.5]:box(m,(-4.55,4.92,zz),(9.5,.35,.34),dark)
for i in range(20):box(m,(-9.05+i*.47,4.98,4.3),(.44,.20,8.6),oak,.3)
for y in [-.25,2.2,4.65]:box(m,(-4.6,y,8.45),(9.8,.38,.42),dark)
for x in [-8.4,-6.5,-4.5,-2.5,-.6]:
    box(m,(x,2.2,8.78),(.24,6.0,.24),oak)
    beam(m,(x,4.6,6.5),(x,3,8.3),.25,dark)
for i in range(22):box(m,(-9.3+i*.45,2.3,8.98),(.43,6.3,.23),board,.32)
for x in [-8.94,-.12]:beam(m,(x,.12,6.4),(x,1.7,8.4),.32,oak)
m.finish()
m=Mesh('Cabinet • recessed shelf grid',stall)
for x in [-8.8,-6.05,-3.25,-.4]:box(m,(x,4.25,4.0),(.2,1.20,7.2),dark)
for zz in [.8,2.25,3.8,5.25,6.7,8.05]:
    box(m,(-4.6,4.25,zz),(8.7,1.3,.16),board)
    box(m,(-4.6,3.6,zz-.1),(8.7,.13,.23),dark)
m.finish()
m=Mesh('Stock • bottles chests jars and parcels',stall)
for z in [2.35,3.9,5.35]:
    for i in range(14):
        x=-8.5+i*.57
        if (i+int(z))%5<3:bottle(m,x,4.05,z,random.uniform(.64,1.12),[green,amber,red,navy][i%4])
        elif i%3==0:chest(m,x,4.0,z,.72)
for x,z in [(-7.6,.92),(-4.6,.92),(-2.1,5.36),(-5.0,6.84),(-7.9,6.83),(-1.6,2.36)]:
    chest(m,x,4.0,z,1.12)
for i in range(7):
    box(m,(-8.2+i*.37,4.0,7.35),(.32,.67,.9+random.random()*.2),canvas,.15)
    box(m,(-8.2+i*.37,3.65,7.35),(.045,.03,.93),hemp)
for i in range(6):box(m,(-2.8+i*.27,4.1,7.32),(.22,.72,1.1),[red,green,navy][i%3],.18)
m.finish()

m=Mesh('Counter • planks panels iron pegs',stall)
for i in range(15):box(m,(-8.65+i*.57,-.2,1.15),(.54,.23,2.35),oak)
for x in [-8.7,-5.7,-2.6,-.6]:box(m,(x,0,1.2),(.23,.75,2.45),dark)
for y in [-.75,-.34,.07,.48]:box(m,(-4.6,y,2.5),(8.8,.39,.22),board,.18)
for z in [.4,2.25]:box(m,(-4.6,-.35,z),(8.9,.23,.19),dark)
for x in [-8.6,-5.7,-2.6,-.6]:
    for z in [.45,2.25]:box(m,(x,-.49,z),(.09,.04,.09),iron,1)
m.finish()

# Canvas follows the canopy with stepped folds and a scalloped voxel hem.
m=Mesh('Awning • weathered draped canvas',stall)
for i in range(42):
    x=-9.30+i*.224
    for j in range(9):
        y=-.85+j*.22;z=8.2-.35*math.sin(math.pi*i/41)+j*.095
        box(m,(x,y,z),(.224,.24,.08),canvas,.23)
    drop=.45+.10*(i%4)+.5*(i/41)**5
    for k in range(int(drop/.14)):
        box(m,(x,-.90,8.2-.35*math.sin(math.pi*i/41)-k*.14),(.224,.11,.145),canvas,.21)
m.finish()

# Uneven individual paving stones extend from the stall into the busy harbor.
m=Mesh('Quay • weathered cobblestone paving',dock)
box(m,(.5,1.5,-.27),(27,24,.5),mortar,3)
for row in range(60):
    y=-9.4+row*.39
    for i in range(49):
        x=-11.3+i*.53+(row%2)*.26
        if y>8 and x<1:continue
        zz=random.uniform(-.045,.025)
        box(m,(x,y,zz),(.48,.34,.14),[stone,oak,board,mortar][random.choices(range(4),[17,0,1,2])[0]],.24)
m.finish()
m=Mesh('Quay • piers and bollards',dock)
for y in [5,9,13,17,21]:
    for x in [7.5,12.2]:
        box(m,(x,y,.25),(.35,.35,1.6),dark)
        box(m,(x,y,1.09),(.48,.48,.18),edge)
for y in range(8,25):box(m,(9.8,y,-.14),(5.0,.92,.32),board,.3)
m.finish()

def coil(name,x,y,z,r=.55,parent=None):
    m=Mesh(name,tackle)
    for j in range(8):
        for i in range(88):
            a=i*math.tau/88
            box(m,(x+(r+j*.018)*math.cos(a)+.025*math.sin(a*3+j),y+j*.022,z+(r*1.6+j*.018)*math.sin(a)),(.058,.058,.063),hemp,2)
    line(m,(x,y,z+r*1.55),(x,y,z+r*1.55+.48),.09,hemp)
    return m.finish(parent)
ropes=[]
for n,(x,y,z,r) in enumerate([(-8.98,-.38,5.7,.58),(-.13,-.29,5.45,.45),(-.9,-.9,1.40,.42),(-10,-1.8,7,.68)]):
    root=empty('rope_swing_'+str(n),(x,y,z+r*1.55+.48),collection=tackle)
    coil('Tackle • hanging hemp coils',x,y,z,r,root);ropes.append(root)
    m=Mesh('Tackle • loose rope tail',tackle)
    line(m,(x+.25,y,z),(x+.3,y-.05,max(.1,z-2.3)),.11,hemp,.15);m.finish(root)

lamp_roots=[];flames=[];light_objects=[]
def lantern(name,x,y,z,s=1,hang=0):
    pivot=empty(name,(x,y,z+1.1*s+hang),collection=tackle)
    m=Mesh(name+' frame and chain',tackle)
    if hang:
        for k in range(max(1,int(hang/.15))):
            ring(m,(x,y,z+1.07*s+k*.15),.105,.045,iron,axis='Y' if k%2 else 'X',n=10)
    for zz in [z,z+.84*s]:box(m,(x,y,zz),(.67*s,.58*s,.13*s),iron)
    box(m,(x,y,z+.96*s),(.45*s,.4*s,.14*s),iron)
    box(m,(x,y,z+1.09*s),(.20*s,.2*s,.11*s),iron)
    for xx in [-.28,.28]:
        for yy in [-.235,.235]:box(m,(x+xx*s,y+yy*s,z+.42*s),(.065*s,.065*s,.8*s),iron)
    box(m,(x,y-.245*s,z+.42*s),(.045*s,.05*s,.76*s),iron)
    box(m,(x,y-.245*s,z+.42*s),(.57*s,.05*s,.045*s),iron)
    m.finish(pivot)
    f=Mesh(name+' luminous glass',tackle);box(f,(x,y,z+.42*s),(.47*s,.38*s,.68*s),flame,.20)
    fo=f.finish(pivot);flames.append(fo);lamp_roots.append(pivot)
    d=bpy.data.lights.new(name+' warm light','POINT');d.energy=65*s;d.color=(1,.39,.08);d.shadow_soft_size=.4*s
    o=bpy.data.objects.new(d.name,d);studio.objects.link(o);o.location=(x,y-.35*s,z+.45*s);light_objects.append(o)
    pivot['lamp']=True;pivot['lampPower']=55*s;pivot['lampDrop']=.65*s+hang
    return pivot
lantern('lantern_counter',-7.7,-.55,2.63,.85)
lantern('lantern_hanging',-1.45,.3,5.03,1.0,2.1)
lantern('lantern_far_dock',10,14,1.6,.75,1.1)

m=Mesh('Desk • brass balance scale and weighing pans',stall)
box(m,(-1.9,-.20,2.69),(1.35,.6,.13),dark)
box(m,(-1.9,-.20,3.34),(.10,.10,1.26),brass)
box(m,(-1.9,-.20,3.96),(1.68,.10,.10),brass)
for s in [-1,1]:
    x=-1.9+s*.68
    for dy in [-.2,.2]:line(m,(x,-.2,3.96),(x,-.2+dy,3.02),.026,brass)
    box(m,(x,-.2,2.98),(.54,.5,.055),brass)
    for dx,dy in [(-.24,0),(.24,0),(0,-.21),(0,.21)]:box(m,(x+dx,-.2+dy,3.025),(.075,.075,.12),brass)
m.finish()
m=Mesh('Desk • bottles coins ledger and tankards',stall)
for x,y,h in [(-6.8,-.55,1.1),(-.65,.23,1.0),(-2.7,.14,.75)]:bottle(m,x,y,2.65,h)
for i in range(23):box(m,(-3.4+random.random()*1.3,-.62+random.random()*.65,2.64+random.random()*.12),(.16,.15,.06),brass)
for side in [-1,1]:
    box(m,(-5.15+side*.32,-.20,2.66),(.63,.66,.055),paper)
    for j in range(5):box(m,(-5.15+side*.32,-.41+j*.10,2.692),(.48,.018,.007),dark,2)
box(m,(-6.0,-.25,2.83),(.30,.29,.37),oak)
m.finish()

# Layered cargo frames the bottom edge of the reference.
m=Mesh('Cargo • barrels crates sacks and produce',dock)
for x,y,z,r,h in [(-10,-3,0,.95,2.4),(-10,-3,2.45,.84,2.1),(-9,-6,0,.9,2.3),(-.1,-2.0,0,.64,1.7),(1.0,.8,0,.68,1.85),(6.9,-1.5,0,.68,1.7),(8.5,-4.5,0,.82,2.1),(6.0,2.0,0,.6,1.5),(3.4,4.6,0,.56,1.4),(-.2,2.4,0,.65,1.7),(-.2,2.4,1.8,.61,1.6)]:barrel(m,x,y,z,r,h)
for x,y,z,s in [(-6.8,-2.6,0,1.1),(-5.3,-2.4,0,1.05),(-3.3,-2.0,0,1.0),(-2.4,-1.7,0,1.3),(1.6,3.5,0,1.0),(6.8,6,0,1.0),(8,3,0,.85)]:crate(m,x,y,z,s,True)
for i in range(32):
    x=-6.8+random.uniform(-.42,.42);y=-2.6+random.uniform(-.4,.4)
    box(m,(x,y,1.04+random.random()*.25),(.15,.15,.16),red if i%3 else pigment('c58f35'),.2)
for x,y,z in [(-4.25,-1.0,.2),(-4.25,-1.0,.52),(-4.25,-1.0,.84),(-7.8,-1.8,.1)]:
    box(m,(x,y,z+.16),(1.18,.78,.32),canvas,.13)
    box(m,(x,y,z+.34),(.15,.8,.08),hemp)
for x,y in [(-.1,-2.0),(-2.4,-1.7)]:
    for i in range(6):
        box(m,(x-.38+i*.12,y-.36,1.66),(.12,.8,.08),canvas,.12)
        box(m,(x-.38+i*.12,y-.79,1.22),(.12,.08,.92-(i%2)*.12),canvas,.12)
bottle(m,7,-2.9,.08,1.0,green)
m.finish()
m=Mesh('Cargo • spilled rope on paving',dock)
for r in [.28,.42,.56,.70]:ring(m,(.75,-2.4,.19),r,.11,hemp,n=40)
line(m,(1.3,-2.4,.2),(2.4,-1.5,.17),.105,hemp,.12)
m.finish()

# Character rigs are real parented Blender objects with keyframed joints.
heads=[];eyes=[];smiles=[];chat_arms=[];bodies=[]
def person(name,location,yaw=0,seated=False,beard=False,shirt=white,coat=vest,drinking=False):
    root=empty(name)
    hip=1.55 if seated else 1.95
    body=empty(name+'_body',(0,0,hip),parent=root)
    m=Mesh(name+' clothing and legs',actors)
    soft_voxel(m,(0,0,hip+.52),(1.12,.66,1.15),shirt,.065,5)
    for s in [-1,1]:
        box(m,(s*.37,-.365,hip+.52),(.36,.085,1.04),coat,.13)
        box(m,(s*.52,0,hip+.52),(.10,.62,1.02),coat,.14)
    box(m,(0,.34,hip+.54),(1.1,.075,1.08),coat,.14)
    box(m,(0,-.01,hip+.015),(1.02,.61,.16),leather)
    box(m,(0,-.333,hip+.015),(.21,.045,.18),brass)
    for zz in [.19,.38,.59,.8]:box(m,(0,-.278,hip+zz),(.048,.03,.05),dark,1)
    m.finish(body)
    m=Mesh(name+' trouser legs and boots',actors)
    for s in [-1,1]:
        if seated:
            beam(m,(s*.29,-.02,hip-.10),(s*.38,-1.0,hip-.22),.36,navy,depth=.40,cell=.14)
            beam(m,(s*.38,-1.0,hip-.22),(s*.48,-1.85,.35),.29,skinshade,cell=.15)
            box(m,(s*.38,-1.0,hip-.27),(.38,.43,.36),navy,.14)
            box(m,(s*.48,-2.0,.19),(.40,.64,.30),leather,.13)
            box(m,(s*.45,-1.65,.57),(.33,.3,.23),skinshade,.14)
        else:
            box(m,(s*.27,0,.91),(.36,.41,1.71),navy,.17)
            box(m,(s*.27,-.10,.14),(.40,.62,.25),leather,.14)
    m.finish(root)
    neck=hip+1.15;head=empty(name+'_head',(0,0,neck),body);heads.append(head)
    m=Mesh(name+' face beard ears and hat',actors)
    soft_voxel(m,(0,0,neck+.35),(.85,.72,.83),skin,.062,7)
    box(m,(0,.34,neck+.42),(.83,.12,.78),hair,.11)
    box(m,(0,-.418,neck+.27),(.18,.17,.21),skinshade,.055)
    for s in [-1,1]:
        box(m,(s*.435,.0,neck+.28),(.12,.2,.22),skinshade,.10)
        box(m,(s*.31,-.343,neck+.42),(.10,.05,.37),hair,.10)
        box(m,(s*.19,-.348,neck+.54),(.21,.045,.06),hair,.12)
    if beard:
        soft_voxel(m,(0,-.35,neck-.015),(.75,.26,.40),hair,.055,3)
        for s in [-1,1]:soft_voxel(m,(s*.32,-.37,neck+.13),(.22,.19,.39),hair,.055,4)
        box(m,(0,-.402,neck+.135),(.55,.085,.095),hair,.1)
    box(m,(0,0,neck+.79),(1.12,.90,.16),navy,.14)
    box(m,(0,.03,neck+.98),(.81,.63,.28),navy,.14)
    box(m,(0,-.305,neck+.90),(.81,.05,.095),leather)
    box(m,(0,.02,neck+1.14),(.62,.54,.085),navy)
    m.finish(head)
    for s in [-1,1]:
        eye=empty(name+('_eye_left' if s<0 else '_eye_right'),(s*.19,-.383,neck+.43),head)
        mm=Mesh(name+' dark pixel eye',actors);box(mm,(s*.19,-.383,neck+.43),(.12,.045,.155),black,1);mm.finish(eye);eyes.append(eye)
    smile=empty(name+'_smile',(0,-.418,neck+.08),head)
    mm=Mesh(name+' smiling mouth',actors)
    box(mm,(0,-.42,neck+.075),(.29,.045,.052),black,1)
    for s in [-1,1]:box(mm,(s*.155,-.421,neck+.115),(.045,.04,.095),black,1)
    box(mm,(0,-.448,neck+.09),(.20,.018,.027),white,1)
    mm.finish(smile);smiles.append(smile)
    arms=[]
    for s in [-1,1]:
        sh=hip+.87;arm=empty(name+('_arm_left' if s<0 else '_arm_right'),(s*.70,0,sh),body)
        mm=Mesh(name+' rolled sleeves',actors)
        beam(mm,(s*.69,0,sh),(s*.89,-.15,sh-.47),.42,shirt,cell=.12)
        box(mm,(s*.89,-.18,sh-.45),(.46,.42,.16),canvas,.11)
        mm.finish(arm)
        mm=Mesh(name+' forearm and hand',actors)
        end=(s*.83,-.68,sh-.61) if not drinking else (s*.70,-.58,sh-.46)
        beam(mm,(s*.87,-.18,sh-.50),end,.23,skin,cell=.11)
        soft_voxel(mm,end,(.33,.31,.25),skin,.055,5);mm.finish(arm)
        if drinking and s<0:
            mug=empty('drunkard_tankard',end,arm)
            mm=Mesh('Drunkard • raised pewter tankard and beer',actors)
            x,y,z=end;barrel(mm,x,y-.18,z-.08,.23,.57)
            box(mm,(x,y-.18,z+.51),(.33,.33,.06),white,.11)
            for zz in [z+.02,z+.36]:box(mm,(x+.34,y-.18,zz),(.17,.08,.065),brass)
            box(mm,(x+.40,y-.18,z+.19),(.06,.08,.4),brass)
            mm.finish(mug)
        arms.append(arm)
    root.location=location;root.rotation_euler.z=yaw
    bodies.append(body)
    return dict(root=root,body=body,head=head,smile=smile,arms=arms)
merchant=person('merchant',(-5.4,.73,0),beard=True)
merchant['root'].scale=(1.25,)*3;merchant['root'].location.z=-.22
drunk=person('drunkard',(3.3,-3.2,.08),yaw=-.40,seated=True,drinking=True)
drunk['body'].rotation_euler.x=-.38;drunk['body'].rotation_euler.y=.24
m=Mesh('Drunkard • stool and neighboring tankard',dock)
crate(m,3.3,-2.8,.02,1.1)
box(m,(3.3,-2.3,1.53),(1.18,.15,2.1),dark)
for x in [2.79,3.8]:box(m,(x,-2.29,1.15),(.12,.16,2.15),oak)
barrel(m,6.85,-.62,1.77,.16,.37);m.finish()
chat=[]
for name,loc,yaw in [('dockhand_a',(3.2,9.0,0),-1.1),('dockhand_b',(5.1,9.8,0),1.2),('dockhand_c',(4.0,11.0,0),.1),('dockhand_d',(9.2,11,0),2.8)]:
    actor=person(name,loc,yaw,beard=name.endswith('b'),shirt=canvas,coat=vest if name.endswith('a') else navy)
    chat.append(actor)
    actor['root'].scale=(.86,)*3

# Dockside cannon and crane match the diagonal silhouettes in the reference.
m=Mesh('Cannon • iron barrel timber carriage and shot',dock)
crate(m,5.6,4.5,.0,1.1)
beam(m,(4.65,4.5,1.1),(7.5,4.5,1.35),.40,iron,cell=.16)
for x in [5.2,5.8,6.5,7.2]:box(m,(x,4.5,1.2),(.12,.55,.54),iron)
for y in [4.0,5.0]:
    for x in [5.3,6.3]:ring(m,(x,y,.55),.35,.18,dark,axis='Y',n=12)
for k in range(3):
    for i in range(4-k):
        for j in range(3-k):
            box(m,(6.7+i*.34+k*.17,2.6+j*.34+k*.17,.2+k*.28),(.3,.3,.3),iron)
m.finish()
m=Mesh('Crane • timber jib and suspended crate',dock)
beam(m,(10.5,7,0),(10.2,7,7.1),.35,dark)
beam(m,(10.2,7,7.1),(7.4,7,8.1),.4,dark)
beam(m,(10.35,7,4.9),(8.0,7,7.9),.22,oak)
line(m,(7.65,7,8.0),(7.65,7,5.2),.10,iron)
crate(m,7.65,7,4.1,1.25)
for s in [-1,1]:line(m,(7.65,7,5.4),(7.65+s*.57,7,5.3),.07,iron)
m.finish()

# Full-rigged merchantmen, built as separate rocking assemblies.
ships=[]
def ship(name,loc,length=13,scale=1):
    root=empty(name,collection=harbor)
    m=Mesh(name+' stepped hull gunports and galleries',harbor)
    for k in range(6):
        z=.3+k*.33;L=length-(5-k)*.47;w=2.8+k*.19
        for j in range(25):
            u=j/24;ww=w*(.38+.62*math.sin(math.pi*u)**.32)
            box(m,((u-.5)*L,0,z),(L/24*1.02,ww,.36),dark if k in [1,4] else oak,.30)
    for x in [-length*.42,length*.41]:box(m,(x,0,2.7),(1.55,3.5,1.2),dark,.27)
    box(m,(0,0,2.38),(length,3.7,.18),board,.28)
    for side in [-1,1]:
        for z in [1.05,1.95,2.7]:
            box(m,(0,side*1.92,z),(length,.13,.13),edge,.3)
        for i in range(15):
            x=-length*.44+i*length*.88/14
            box(m,(x,side*1.94,1.45),(.35,.045,.29),black,.3)
            if i%3==0:box(m,(x,side*1.98,2.27),(.20,.035,.27),flame,.3)
        for i in range(24):box(m,(-length*.48+i*length*.96/23,side*1.77,2.75),(.085,.1,.62),dark,.3)
    box(m,(-length*.42,0,3.47),(1.8,3.6,.18),edge,.3)
    for level in range(3):
        box(m,(-length*.39,0,3.1+level*.58),(2.4,3.3,.50),dark,.26)
        box(m,(-length*.39,0,3.42+level*.58),(2.55,3.45,.12),edge,.3)
        for side in [-1,1]:
            for i in range(5):box(m,(-length*.46+i*.44,side*1.68,3.18+level*.58),(.18,.035,.28),flame,.25)
    beam(m,(length*.46,0,2.50),(length*.72,0,4.5),.18,oak,cell=.4)
    m.finish(root)
    m=Mesh(name+' masts yards and rigging',harbor)
    sail=Mesh(name+' tiered ivory canvas',harbor)
    for idx,(x,h) in enumerate([(-length*.28,17.5),(0,22),(length*.28,19.8)]):
        beam(m,(x,0,2.3),(x,0,h),.20,dark,cell=.3)
        box(m,(x,0,h*.69),(.85,.75,.19),dark,.3)
        for level,(zz,ww,hh) in enumerate([(h*.26,5.4,3.6),(h*.50,4.5,3.2),(h*.73,3.4,2.5)]):
            # Yards are angled across the deck so layered sails face the camera.
            beam(m,(x-ww/2,-.25,zz+hh),(x+ww/2,.25,zz+hh),.13,dark,cell=.3)
            for i in range(max(5,int(ww/.22))):
                u=i/max(1,int(ww/.22)-1)
                for j in range(max(4,int(hh/.24))):
                    v=j/max(1,int(hh/.24)-1)
                    xx=x+(u-.5)*ww*(.88+.12*v);z=zz+v*hh+.17*math.cos(u*math.pi*2)
                    box(sail,(xx,-.3-.75*math.sin(v*math.pi)*math.sin(u*math.pi),z),(ww/(int(ww/.22)-1)*1.025,.14,hh/(int(hh/.24)-1)*1.02),canvas,.3)
        for sy in [-1,1]:
            for dx in [-1.3,1.3]:
                line(m,(x+dx,sy*1.7,2.5),(x,0,h*.86),.035,hemp)
            for zz in range(3,int(h*.74)):
                ratio=(zz-2.5)/(h*.86-2.5);spread=1.3*(1-ratio)
                line(m,(x-spread,sy*1.7*(1-ratio),zz),(x+spread,sy*1.7*(1-ratio),zz),.025,hemp)
    m.finish(root);sail.finish(root)
    root.location=loc;root.scale=(scale,)*3;ships.append(root)
    return root
main_ship=ship('ship_grand_merchant',(16,34,-.45),19,1.05);main_ship.rotation_euler.z=-.30
ship('ship_outer_harbor',(11.7,42,-.45),12,.60)
ship('ship_distant',(-10,49,-.4),11,.52)

# Cliffs, whitewashed houses, palms and a lantern-crowned fort in the distance.
m=Mesh('Port • stepped limestone cliffs',city)
for i in range(20):
    x=13.5+i*.78;y=28+i*.50;h=4.4+i*.46+random.random()*.6
    box(m,(x,y,h/2),(1.2,10.5,h),stone,.55)
    for j in range(4):box(m,(x-.4,y-4.8+j*.6,h*.4+random.random()*h*.4),(.55,.7,1.8),mortar,.5)
m.finish()
m=Mesh('Port • waterfront houses and fortress towers',city)
for i in range(13):
    x=13+i*1.45;y=24+i*.6;z=2.5+i*.45
    box(m,(x,y,z+1.8),(1.3,2.6,3.6),[canvas,stone,edge][i%3],.4)
    box(m,(x,y,z+3.7),(1.5,2.8,.3),red,.35)
    for zz in [z+1,z+2.55]:
        for xx in [-.35,.35]:
            box(m,(x+xx,y-1.315,zz),(.24,.025,.43),black,.5)
            if i%2:box(m,(x+xx,y-1.338,zz),(.13,.016,.27),flame,.5)
for x,y,z,h in [(20,35,11,7),(26,39,14,9),(30,42,16,6)]:
    box(m,(x,y,z+h/2),(3.3,3.4,h),stone,.45)
    for side in [-1,1]:
        for i in range(5):
            box(m,(x-1.5+i*.75,y+side*1.6,z+h+.35),(.48,.48,.85),stone,.4)
    for yy in [y-1.72]:
        for zz in [z+2,z+4,z+6]:box(m,(x,yy,zz),(.38,.04,.85),black,.4)
    box(m,(x,y,z+h+1.4),(.68,.68,1.8),stone,.4)
    box(m,(x,y,z+h+2.3),(.47,.47,.6),flame,.3)
    box(m,(x,y,z+h+2.8),(.9,.85,.22),dark,.3)
m.finish()
m=Mesh('Port • voxel palms',city)
for x,y,z in [(14,25,5),(17,29,7),(23,29,8),(28,37,13),(32,39,13)]:
    for j in range(12):box(m,(x+j*.04,y,z+j*.23),(.21,.21,.26),oak,.2)
    for a in range(7):
        angle=a*math.tau/7
        for j in range(8):
            d=j*.27;box(m,(x+.45+d*math.cos(angle),y+d*math.sin(angle),z+3.0-.13*d*d),(.45,.42,.15),green,.4)
m.finish()

# Colored sky strips and volumetric cubic clouds, with a bright low sunset.
city_root=empty('cliffside_port',collection=city)
for obj in list(city.objects):
    if obj!=city_root:attach(obj,city_root)
city_root.scale=(.65,)*3;city_root.location=(30,30,0)
m=Mesh('Sunset • painted voxel sky gradient',sky)
bottom=(.95,.49,.23);top=(.17,.27,.43)
for j in range(50):
    t=j/49;rgb=tuple(bottom[k]*(1-t)+top[k]*t for k in range(3))
    box(m,(0,115,-5+j*.7),(260,.3,.72),palette(rgb,.0),5)
box(m,(0,115,75),(260,.3,91),palette(top,0),95)
skyback=m.finish()
unlit=bpy.data.materials.new('Sunset sky • unlit vertex colors');unlit.use_nodes=True;ns=unlit.node_tree.nodes;ns.clear()
out=ns.new('ShaderNodeOutputMaterial');em=ns.new('ShaderNodeEmission');vc=ns.new('ShaderNodeVertexColor');vc.layer_name='VoxelColor'
unlit.node_tree.links.new(vc.outputs['Color'],em.inputs['Color']);unlit.node_tree.links.new(em.outputs[0],out.inputs['Surface'])
skyback.data.materials.clear();skyback.data.materials.append(unlit)
clouds=[]
for k in range(24):
    x=20+k*3.5;y=88+random.random()*10;z=12+.20*(x-20)+random.uniform(-1.5,1.5)
    pivot=empty('cloud_drift_'+str(k),(x,y,z),collection=sky)
    m=Mesh('Cloud • sunset cubic billows',sky)
    for i in range(random.randint(18,30)):
        dx=random.uniform(-4,4);dz=random.choice([-.45,0,.35,.7]);dy=random.uniform(-.7,.7)
        pal=pigment('f2ab79',.10) if dz<.3 else pigment('aa94a5',.12)
        box(m,(x+dx,y+dy,z+dz),(random.choice([.3,.5,.8]),.6,.27),pal,2)
    obj=m.finish(pivot);obj.data.materials.clear();obj.data.materials.append(unlit);clouds.append(pivot)

# Dense foreground dressing and weathering at the reference's smaller voxel scale.
m=Mesh('Stall • worn surfaces nail heads and chipped joinery',stall)
for x in [-9,-.15]:
    for i in range(100):
        z=random.uniform(.3,8.5)
        box(m,(x+random.uniform(-.22,.22),-.354,z),(random.choice([.055,.08,.11]),.034,random.choice([.07,.11,.17])),[oak,dark,edge][i%3],2)
for i in range(240):
    x=random.uniform(-8.8,-.3);y=random.uniform(-.73,.58)
    box(m,(x,y,2.617),(random.uniform(.07,.21),.05,.012),[oak,dark,edge][i%3],2)
for z in [.8,2.25,3.8,5.25,6.7,8.05]:
    for x in [-8.8,-6.05,-3.25,-.4]:box(m,(x,3.515,z),(.065,.02,.075),iron,2)
# Large foreground post and doubled timber ceiling occupy the top-left frame.
box(m,(-10.1,-2.0,4.8),(.58,.58,10),dark)
box(m,(-5.0,-1.3,9.5),(11.0,.42,.55),dark)
for y in [-1.0,1.0,3.0]:box(m,(-4.7,y,9.6),(10.8,.22,.18),oak)
m.finish()
m=Mesh('Stock • blue ceramic jars stoppered flasks and tiny labels',stall)
blue=pigment('435565',.20)
for x,y,z in [(-3.9,3.9,3.92),(-7.1,3.8,5.37),(-1.15,.15,2.63),(-5.4,3.9,5.35)]:
    box(m,(x,y,z+.36),(.46,.43,.64),blue)
    box(m,(x,y,z+.74),(.31,.29,.17),blue)
    box(m,(x,y,z+.94),(.2,.2,.25),canvas)
    for dx,dz in [(0,.17),(-.11,.28),(.11,.28),(-.17,.40),(.17,.40),(0,.55)]:box(m,(x+dx,y-.228,z+dz),(.055,.023,.065),paper,2)
for i in range(35):
    x=-8.5+(i%14)*.57;z=[2.35,3.9,5.35][i%3]
    box(m,(x,3.895,z+.30),(.15,.023,.035),dark,2)
m.finish()
m=Mesh('Cargo • iron-bound foreground sea chests',dock)
chest(m,-3.95,-3.00,.05,1.8)
chest(m,-1.72,-2.05,.05,1.40)
chest(m,-8.20,-1.65,2.66,.72)
for i in range(4):
    box(m,(-7.45,-1.5,.35+i*.30),(1.2,.9,.34),canvas)
    box(m,(-7.45,-1.98,.35+i*.30),(.15,.035,.36),hemp)
# A checked rag hangs over the counter edge.
for i in range(8):
    for j in range(14):
        x=-6.3+i*.09;z=2.63-j*.085
        box(m,(x,-.83,z),(.09,.06,.088),white if (i//2+j//3)%2 else blue,2)
m.finish()
m=Mesh('Tackle • ropes around foreground pillar and scattered chain',tackle)
for j in range(7):
    for i in range(48):
        a=i*math.tau/48
        box(m,(-10.1+(.4+j*.035)*math.cos(a),-2.38+j*.025,6.7+1.9*math.sin(a)),(.12,.12,.12),hemp,2)
for x in [-8.0,-6.6,-3.45]:
    for k in range(16):ring(m,(x,.42,8.5-k*.13),.09,.033,iron,axis='Y' if k%2 else 'X',n=12)
for k in range(35):
    box(m,(-.6+random.uniform(-.1,.1),-1.3,.24+k*.05),(.11,.11,.11),hemp,2)
m.finish()

# Fine-grained wear, soft cargo and irregular textiles break up broad surfaces.
m=Mesh('Stall • small weathered timber grain and splintered edges',stall)
for i in range(1200):
    x=random.uniform(-8.9,-.35);z=random.uniform(.25,8.25)
    box(m,(x,4.858,z),(random.uniform(.045,.09),.018,random.uniform(.13,.38)),[oak,dark,edge][i%3],2)
for z in [.8,2.25,3.8,5.25,6.7,8.05]:
    for i in range(120):
        x=random.uniform(-8.85,-.3)
        box(m,(x,3.518,z+random.uniform(-.20,.01)),(random.uniform(.08,.21),.025,.028),[oak,board,dark][i%3],2)
for y in [-.75,-.34,.07,.48]:
    for i in range(80):
        x=random.uniform(-8.9,-.3)
        box(m,(x,y+random.uniform(-.15,.15),2.618),(random.uniform(.12,.42),.023,.008),[oak,edge,dark][i%3],2)
m.finish()
m=Mesh('Cargo • piled grain sacks woven baskets and loosely draped fabric',dock)
for x,y,z in [(-5.6,-1.4,.30),(-5.5,-1.35,.70),(-5.6,-1.34,1.12),(-7.5,-2.1,.34),(-2.3,-1.5,1.62),(.45,1.4,2.1)]:
    soft_voxel(m,(x,y,z),(1.35,.83,.47),canvas,.075,3)
    for i in range(22):box(m,(x-.6+i*.055,y-.395,z+.07*math.sin(i*.4)),(.04,.04,.045),hemp,2)
for x,y,z in [(-7.8,-2.8,0),(-8.2,-1.2,1.0),(-6.3,-3.8,0)]:
    for level in range(13):
        zz=z+.065*level;r=.40+.035*math.sin(level/12*math.pi)
        ring(m,(x,y,zz),r,.07,hemp,n=40)
    for j in range(24):
        a=j*math.tau/24;line(m,(x+.42*math.cos(a),y+.42*math.sin(a),z),(x+.42*math.cos(a),y+.42*math.sin(a),z+.8),.028,dark)
# Slung coarse cloth on the forward crate, with an uneven fringe.
for i in range(14):
    for j in range(26):
        x=-2.12+i*.064;y=-2.27+min(j,10)*.07
        z=1.7 if j<11 else 1.7-(j-10)*.07
        if j>=11:y=-2.27
        if j>22 and (i*7+j)%5==0:continue
        box(m,(x,y-.025*math.sin(i*1.4),z+.04*math.sin(i)),(.066,.071,.072),canvas if (i+j)%4 else hemp,2)
m.finish()
# Additional forestays, braces, ratlines and deck fittings of the principal ship.
m=Mesh('Flagship • fine standing rigging and running braces',harbor)
for x,h in [(-5.32,17.5),(0,22),(5.32,19.8)]:
    for endx in [-8.6,8.6]:
        line(m,(x,0,h*.96),(endx,-1.9,3),.028,hemp,.10)
    for zz,w,hh in [(h*.26,5.4,3.6),(h*.50,4.5,3.2),(h*.73,3.4,2.5)]:
        for side in [-1,1]:
            line(m,(x+side*w*.5,-.3,zz+hh),(x-side*1.6,-2.0,2.7),.024,hemp,.08)
            line(m,(x+side*w*.5,-.3,zz+hh),(x,0,min(h,zz+hh+2.5)),.025,hemp)
    for yy in [-1.85,1.85]:
        for j in range(7):line(m,(x-1.7+j*.56,yy,2.5),(x,0,h*.72),.025,hemp)
        for j in range(35):
            z=2.9+j*.27;u=(z-2.5)/(h*.72-2.5)
            if u<1:line(m,(x-1.7*(1-u),yy*(1-u),z),(x+1.7*(1-u),yy*(1-u),z),.02,dark)
m.finish(main_ship)
# A maze of small deck-side cargo extends into the dockside crowd.
m=Mesh('Quay • distant cargo clusters mooring fittings and small lanterns',dock)
for i in range(24):
    x=random.uniform(6.7,11.8);y=random.uniform(7.5,19)
    if i%3:crate(m,x,y,0,random.uniform(.45,.85))
    else:barrel(m,x,y,0,.33,.9)
m.finish()

# Native 48-second animation: asynchronous motions avoid a synchronized scene.
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=1;scene.frame_end=1153
def animate(obj,fn,step=12):
    base_loc=obj.location.copy();base_rot=obj.rotation_euler.copy();base_scale=obj.scale.copy()
    for f in range(1,1154,step):
        t=(f-1)/24;obj.location=base_loc;obj.rotation_euler=base_rot;obj.scale=base_scale
        fn(obj,t)
        for prop in ['location','rotation_euler','scale']:obj.keyframe_insert(data_path=prop,frame=f)
def periodic(t,p):return math.sin(math.tau*t/p)
def pulse(t,start,duration,period):
    u=(t-start)%period
    if u>=duration:return 0
    return math.sin(math.pi*u/duration)**2
for i,p in enumerate(ropes):animate(p,lambda o,t,i=i:setattr(o.rotation_euler,'y',.027*periodic(t+i*1.3,8)+.01*periodic(t,12)))
for i,p in enumerate(lamp_roots):animate(p,lambda o,t,i=i:setattr(o.rotation_euler,'x',.018*periodic(t+i,12)))
for i,p in enumerate(ships):
    z=p.location.z
    def rock(o,t,i=i,z=z):
        o.location.z=z+.09*periodic(t+i*2,8);o.rotation_euler.x=.012*periodic(t+i,12);o.rotation_euler.y=.006*periodic(t+i,16)
    animate(p,rock)
for i,p in enumerate(clouds):
    x=p.location.x;animate(p,lambda o,t,x=x,i=i:setattr(o.location,'x',x+.8*periodic(t+i,48)),step=24)
for i,p in enumerate(eyes):animate(p,lambda o,t,i=i:setattr(o.scale,'z',1-.94*pulse(t,.1+(i//2)*.17,.24,6)),step=2)
for i,p in enumerate(smiles):animate(p,lambda o,t,i=i:setattr(o.scale,'z',1+.35*pulse(t,1+i,4,12)))
def merchant_nod(o,t):
    o.rotation_euler.x=.065*periodic(t,3)*pulse(t,.4,4,12)+.012*periodic(t,8)
    o.rotation_euler.z=.025*periodic(t,16)
animate(merchant['head'],merchant_nod)
animate(merchant['body'],lambda o,t:setattr(o.location,'z',1.95+.022*periodic(t,4)))
for i,a in enumerate(merchant['arms']):animate(a,lambda o,t,i=i:setattr(o.rotation_euler,'x',.014*periodic(t+i,6)))
def sip(o,t):
    s=pulse(t,2,6,16);o.rotation_euler.x=-1.0*s;o.rotation_euler.z=.44*s;o.rotation_euler.y=-.12*s
animate(drunk['arms'][0],sip,step=6)
animate(drunk['head'],lambda o,t:setattr(o.rotation_euler,'x',-.10*pulse(t,2,6,16)+.014*periodic(t,8)))
animate(drunk['body'],lambda o,t:setattr(o.rotation_euler,'y',.24+.012*periodic(t,12)))
for i,a in enumerate(chat):
    animate(a['head'],lambda o,t,i=i:(setattr(o.rotation_euler,'z',.13*periodic(t+i*2,12)),setattr(o.rotation_euler,'x',.06*periodic(t+i,6))))
    for j,arm in enumerate(a['arms']):animate(arm,lambda o,t,i=i,j=j:(setattr(o.rotation_euler,'x',-.20*pulse(t,i+j,5,12)),setattr(o.rotation_euler,'y',.09*periodic(t+i+j,8))))
for i,l in enumerate(light_objects):
    energy=l.data.energy
    for f in range(1,1154,6):
        t=(f-1)/24;l.data.energy=energy*(1+.065*periodic(t+i,.8)+.035*periodic(t,1.5));l.data.keyframe_insert(data_path='energy',frame=f)

# Sunset presentation camera and warm/cool light contrast.
m=Mesh('Study • harbor water',studio);box(m,(0,68,-.57),(240,170,.14),pigment('294d60'),90);water=m.finish()
watermat=bpy.data.materials.new('Harbor water • reflective blue');watermat.use_nodes=True
wp=watermat.node_tree.nodes.get('Principled BSDF');wp.inputs['Base Color'].default_value=(.022,.065,.094,1);wp.inputs['Roughness'].default_value=.25;wp.inputs['Metallic'].default_value=.35
water.data.materials.clear();water.data.materials.append(watermat)
m=Mesh('Harbor • warm sunset reflection pixels',harbor)
for i in range(130):
    yy=random.uniform(12,90);xx=9+random.uniform(-2.0,2.0)*(1+(90-yy)/40)
    box(m,(xx,yy,-.482),(random.uniform(.3,1.4),random.uniform(.1,.3),.02),pigment('d99c56',.2),2)
m.finish()
scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=(.20,.26,.36,1);bg.inputs[1].default_value=.20
def area(name,loc,target,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Sunset • warm harbor rim',(10,35,20),(-2,0,3),4800,10,(1,.48,.19))
area('Stall • amber lantern bounce',(-4,-4,5),(-4,2,3),160,5,(1,.60,.29))
area('Merchant • warm reflected lantern light',(-8,-5,4.8),(-5.4,.7,3.7),220,3,(1,.64,.34))
area('Harbor • blue atmospheric fill',(14,12,19),(26,35,7),3800,20,(.58,.72,1))
area('Fort • dusk illumination',(37,35,30),(44,52,12),6500,22,(.67,.73,1))
area('Sky • cool frontal fill',(2,-12,14),(0,6,4),450,12,(.57,.70,1))
area('Sunset • peach cloud illumination',(35,65,25),(25,90,14),16000,22,(1,.65,.43))
sd=bpy.data.lights.new('Sunset • low sun','SUN');sd.energy=1.5;sd.color=(1,.59,.30);sd.angle=.1
so=bpy.data.objects.new(sd.name,sd);studio.objects.link(so);so.rotation_euler=(.9,-.4,-2.5)
camd=bpy.data.cameras.new('Reference composition');cam=bpy.data.objects.new(camd.name,camd);studio.objects.link(cam)
cam.location=(-12,-19,5.8);target=Vector((0,5,3.5));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camd.lens=43;camd.sensor_width=36
camd.dof.use_dof=True;camd.dof.focus_distance=(Vector((-5.4,.7,4.1))-cam.location).length;camd.dof.aperture_fstop=.65
scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1536;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'harbor-sunset-preview.png')
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.1
nt=bpy.data.node_groups.new('Subtle lantern bloom','CompositorNodeTree');scene.compositing_node_group=nt
nt.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor');rl=nt.nodes.new('CompositorNodeRLayers');g=nt.nodes.new('CompositorNodeGlare')
g.inputs['Type'].default_value='Fog Glow';g.inputs['Threshold'].default_value=1.3;g.inputs['Strength'].default_value=.18
out=nt.nodes.new('NodeGroupOutput');nt.links.new(rl.outputs['Image'],g.inputs['Image']);nt.links.new(g.outputs['Image'],out.inputs['Image'])
scene['reference']='User supplied sunset merchant stall, full-rigged ships, drinking sailor and cliffside fort.'
scene['animation']='48 second loop: merchant nod/smile/blink, drinker sip, dockside conversation, rope sway, ship bob, cloud drift, lantern flicker.'
scene.frame_set(1)
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.type='MATERIAL';a.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'harbor-sunset.blend'))
print('HARBOR SAVED',len(scene.objects),'objects',sum(len(m.polygons) for m in bpy.data.meshes),'faces',flush=True)
if '--render' in sys.argv:
    scene.frame_set(121)
    bpy.ops.render.render(write_still=True)
