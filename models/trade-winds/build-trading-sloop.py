"""Generate a reference-inspired voxel sloop, editable rig, and 10-second idle loop.
This generator writes trading-sloop.blend; use export-trading-sloop.py after manual edits.
"""
import bpy, math, random, runpy
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
globals().update(runpy.run_path(str(HERE/'sloop-voxel-tools.py')))
random.seed(86)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):bpy.data.collections.remove(c)
def collection(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
hull=collection('01 • Stepped hull & planked decks')
fittings=collection('02 • Rails, helm & deck fittings')
rig=collection('03 • Mast, sails & standing rigging')
cargo=collection('04 • Barrels, crates & canvas cargo')
crew=collection('05 • Animated helmsman')
lamps=collection('06 • Animated stern lantern')
studio=collection('Studio • presentation only')
def empty(name,loc,col):
    o=bpy.data.objects.new(name,None);col.objects.link(o);o.location=loc;o.empty_display_size=.20;return o
oak=palette((.205,.097,.035),.23)
deck=palette((.25,.132,.056),.17)
dark=palette((.070,.030,.012),.2)
trim=palette((.12,.059,.026),.16)
redwood=palette((.075,.018,.012),.2)
rope=palette((.39,.245,.115),.14)
ivory=palette((.68,.588,.43),.075)
oldcloth=palette((.50,.41,.29),.08)
iron=palette((.032,.038,.040),.13,.45)
brass=palette((.38,.22,.075),.12,.45)
navy=palette((.018,.023,.052),.17)
white=palette((.74,.69,.56),.07)
skin=palette((.60,.32,.125),.08)
coat=palette((.051,.027,.014),.16)
boots=palette((.021,.015,.010),.12)
black=palette((.008,.007,.006),.05)
olive=palette((.16,.18,.084),.12)
glow=palette((1,.45,.045),.08,emission=3)

# Full, blunt stern and tapered rising bow. Voxels expose the stepped contours.
def breadth(y):
    pts=[(-5.45,.10),(-4.95,.75),(-4.3,1.4),(-3.2,2.07),(-1.6,2.48),(.5,2.56),(2.7,2.37),(4.25,1.91),(4.85,1.40)]
    for (a,w),(b,v) in zip(pts,pts[1:]):
        if a<=y<=b:return w+(v-w)*(y-a)/(b-a)
    return 0
unit=.12;occ=set()
for j in range(-45,41):
    y=(j+.5)*unit
    for k in range(-4,19):
        z=(k+.5)*unit
        taper=.32+.68*min(1,max(0,(z+.48)/2.05))**.64
        w=breadth(y)*taper
        for i in range(-22,22):
            if abs((i+.5)*unit)<=w:occ.add((i,j,k))
m=Mesh('Hull • carved stepped oak planking',hull)
m.voxels(occ,(0,0,0),unit,lambda q:redwood if q[2]<1 else dark if q[2] in [3,14] else oak if q[2]%4 else trim);m.finish()
unit=.16
box('Keel • dark central timber',(0,-.10,-.46),(.32,8.95,.19),redwood,hull)
# Deck follows the actual curved footprint. Long individual boards have staggered joints.
for i in range(-14,14):
    x=(i+.5)*.17
    for j in range(-31,29):
        y=(j+.5)*.16
        if abs(x)<breadth(y)-.21:
            box('Deck plank',(x,y,2.25),(.163,.158,.14),deck,hull,.22)
# Continuous low gunwales and black wales follow the ship sides.
for side in [-1,1]:
    for j in range(-32,30):
        y=(j+.5)*unit;w=breadth(y)
        if w<.3:continue
        sheer=.34*max(0,(-y-3)/2.3)+.40*max(0,(y-2.7)/2.1)
        box('Bulwark • oak strake',(side*(w-.10),y,2.43+sheer),(.22,.167,.44),oak,hull)
        box('Gunwale • thick cap',(side*(w-.10),y,2.69+sheer),(.30,.177,.13),trim,hull)
        if j%6==0:
            box('Rail • dark timber joint',(side*(w-.10),y,2.70+sheer),(.32,.145,.16),dark,fittings)
            box('Hull • square iron nail',(side*(w+.024),y,1.55),(.035,.075,.075),iron,fittings)
# Raised aft cabin and stern terrace.
for j in range(17,30):
    y=(j+.5)*unit;w=breadth(y)-.22
    box('Aft cabin • planked upper hull',(0,y,2.72),(w*2,.16,.90),oak,hull)
    box('Quarterdeck • planks',(0,y,3.23),(w*2+.12,.157,.16),deck,hull)
for x in [-1.15,0,1.15]:
    box('Stern • dark window',(x,4.815,2.79),(.56,.05,.44),black,fittings)
    for dx in [-.31,0,.31]:box('Stern window • upright',(x+dx,4.86,2.79),(.055,.10,.51),trim,fittings)
    for z in [2.55,2.81,3.04]:box('Stern window • frame',(x,4.86,z),(.68,.10,.06),trim,fittings)
box('Rudder • broad stern blade',(0,4.86,.59),(.20,.46,2.08),trim,fittings)
for z in [.3,.9,1.4]:box('Rudder • iron hinge',(0,4.61,z),(.26,.27,.13),iron,fittings)
for side in [-1,1]:
    pts=[(side*(breadth(y)-.11),y,3.88) for y in [2.9,3.45,4.0,4.57]]
    for a,b in zip(pts,pts[1:]):beam('Quarterdeck • raised cap rail',a,b,.19,oak,fittings)
    for x,y,z in pts:
        box('Quarterdeck • rail baluster',(x,y,3.57),(.13,.14,.57),trim,fittings)
        box('Quarterdeck • post cap',(x,y,3.95),(.25,.25,.13),deck,fittings)
for x in [-1.38,-.92,-.46,0,.46,.92,1.38]:
    box('Stern • balustrade',(x,4.62,3.60),(.12,.16,.68),trim,fittings)
box('Stern • upper transom rail',(0,4.62,3.96),(3.1,.23,.17),oak,fittings)
# Short central stair flight from the main deck to the helm.
for j in range(5):
    box('Quarterdeck steps',(-.94,1.65+j*.23,2.37+j*.185),(.74,.29,.15),deck,fittings)
for x in [-1.39,-.49]:beam('Stairs • stringer',(x,1.50,2.25),(x,2.75,3.24),.12,dark,fittings)
for x in [-1.48,.85]:
    box('Cabin • framed front panel',(x,2.70,2.79),(.65,.075,.60),dark,fittings)
    box('Cabin • inset planks',(x,2.645,2.79),(.50,.08,.49),oak,fittings)

# Main mast, yard, boom, crow's nest, and a long rising bowsprit.
mx,my=0,.38
box('Mast • square foot',(mx,my,2.44),(.73,.76,.30),dark,rig)
box('Mast • stepped collar',(mx,my,2.68),(.54,.57,.17),oak,rig)
box('Mast • oak spar',(mx,my,6.10),(.30,.33,7.2),dark,rig)
box('Mast • sunward timber',(mx-.165,my,6.06),(.08,.30,6.6),oak,rig)
for z in [3.04,4.06,6.7,8.5,9.0]:box('Mast • iron collar',(mx,my,z),(.36,.39,.13),iron,rig)
box('Yard • main upper cross spar',(0,.39,8.47),(5.20,.19,.20),dark,rig)
box('Boom • lower square sail spar',(0,.32,3.85),(5.55,.21,.22),dark,rig)
for x in [-2.63,2.63]:box('Boom • capped end',(x,.32,3.85),(.27,.31,.29),oak,rig)
beam('Bowsprit • anchored rising timber',(0,-3.84,2.43),(0,-7.22,3.20),.27,oak,rig)
box('Bowsprit • end cap',(0,-7.20,3.20),(.37,.29,.35),trim,rig)
for y in [-4.3,-4.7,-5.1]:
    box('Bowsprit • hemp binding',(0,y,2.73+(abs(y)-4.3)*.23),(.40,.12,.30),rope,rig)
box('Crow nest • floor',(0,.38,9.14),(1.06,.94,.18),trim,rig)
for side in [-1,1]:
    box('Crow nest • front and rear rail',(0,.38+side*.43,9.46),(1.03,.14,.14),oak,rig)
    box('Crow nest • side rail',(side*.49,.38,9.46),(.14,.92,.14),oak,rig)
    for x in [-.45,0,.45]:box('Crow nest • baluster',(x,.38+side*.41,9.28),(.11,.11,.36),trim,rig)
box('Topmast • flagstaff',(0,.38,9.85),(.19,.19,1.62),oak,rig)

def cloth_tile(mesh, corners, depth_axis, pal):
    if depth_axis==1:corners=list(reversed(corners))
    front=[];back=[]
    for p in corners:
        a=list(p);b=list(p);a[depth_axis]-=.035;b[depth_axis]+=.035
        front.append(a);back.append(b)
    mesh.face(front,pal);mesh.face(list(reversed(back)),pal)
    for k in range(4):mesh.face([front[k],back[k],back[(k+1)%4],front[(k+1)%4]],pal)

main=Mesh('Main sail • billowing patched voxel canvas',rig)
for ix in range(-16,16):
    x=(ix+.5)*.145
    for iz in range(30):
        z=4.02+iz*.145
        width=2.35-.10*(z-4.02)/4.35
        if abs(x)>width or (iz==0 and ix%9==0):continue
        worn=((ix+3)//5+(iz+2)//6)%7==0 or (iz%9==0 and ix<5)
        corners=[]
        for dx,dz in [(-1,-1),(-1,1),(1,1),(1,-1)]:
            xx=x+dx*.0725;zz=z+dz*.0725
            yy=my+.16+.08*math.sin(math.pi*(xx+2.35)/4.7)*math.sin(math.pi*(zz-3.94)/4.6)
            corners.append((xx,yy,zz))
        cloth_tile(main,corners,1,oldcloth if worn else ivory)
main=main.finish()
jib=Mesh('Jib • triangular forward canvas',rig)
for iz in range(31):
    z=3.40+iz*.145
    lead=-6.60+(z-3.40)*1.19
    trail=-.52-(7.9-z)*.11
    for iy in range(-46,-3):
        y=(iy+.5)*.145
        if lead<y<trail:
            corners=[]
            for dy,dz in [(-1,-1),(-1,1),(1,1),(1,-1)]:
                yy=y+dy*.0725;zz=z+dz*.0725
                ll=-6.6+(zz-3.4)*1.19;tt=-.52-(7.9-zz)*.11
                xx=-.09-.07*math.sin(math.pi*(yy-ll)/max(.15,tt-ll))*math.sin(math.pi*(zz-3.4)/4.7)
                corners.append((xx,yy,zz))
            cloth_tile(jib,corners,0,oldcloth if (iy//6+iz//5)%8==0 else ivory)
jib=jib.finish()
# Navy pennant, stepped fly, and cream diamond emblem.
flag=Mesh('Flag • navy merchant pennant',rig)
for ix in range(13):
    for iz in range(7):
        if ix>8 and iz<ix-8:continue
        if ix>10 and iz>4:continue
        xx=.12+ix*.11;zz=10.46-iz*.11
        emblem=(abs(ix-4)+abs(iz-3)==2)
        flag.box((xx,.39,zz),(.11,.065,.11),ivory if emblem else navy,.14)
flag=flag.finish()
# Thick voxel ropes in the reference's stays and sheet runs.
for x in [-2.47,2.47]:
    rope_line('Yard • suspension rope',(0,my,9.04),(x,my,8.48),rope,rig,.055)
    rope_line('Main sheet • deck tie',(x,my,3.82),(x*.85,1.3,2.69),rope,rig,.055)
for x in [-2.04,2.04]:
    rope_line('Shroud • aft standing rigging',(0,.38,8.95),(x,3.22,3.93),rope,rig,.065)
rope_line('Forestay • main diagonal',(0,.38,9.02),(0,-7.19,3.24),rope,rig,.065)
rope_line('Jib • lower sheet',(-.1,-6.57,3.34),(-1.40,-2.0,2.65),rope,rig,.055,sag=.10)
for x in [-2.20,2.20]:
    for z in [4.10,8.45]:box('Sail • hemp lashing',(x,.29,z),(.085,.29,.12),rope,rig,.08)
for x in [-1.85,1.85]:
    rope_line('Bow • bowsprit guy',(x,-3.70,2.68),(0,-7.16,3.14),rope,rig,.06,sag=.15)

# Lattice cargo hatch and belaying rails.
box('Hatch • dark recessed opening',(.30,-2.38,2.34),(1.32,1.22,.05),black,fittings)
for x in [-.43,1.03]:box('Hatch • side frame',(x,-2.38,2.41),(.16,1.42,.17),trim,fittings)
for y in [-3.05,-1.71]:box('Hatch • end frame',(.30,y,2.41),(1.58,.16,.17),trim,fittings)
for x in [-.27,-.03,.21,.45,.69,.93]:box('Hatch • grille bar',(x,-2.38,2.44),(.065,1.22,.085),oak,fittings)
for y in [-2.90,-2.66,-2.42,-2.18,-1.94]:box('Hatch • cross grille',(.30,y,2.455),(1.29,.055,.06),oak,fittings)
for x,y in [(-1.62,.72),(1.65,.7),(-1.25,-3.8),(1.30,-3.8)]:
    for dy in [-.22,.22]:box('Bollard • upright',(x,y+dy,2.62),(.18,.17,.64),dark,fittings)
    box('Bollard • cross timber',(x,y,2.94),(.25,.75,.16),oak,fittings)
    for z in [2.59,2.69]:box('Bollard • rope turns',(x,y,z),(.26,.58,.075),rope,fittings)

def crate(x,y,z,size=.69,cloth=False):
    box('Cargo • crate body',(x,y,z+size*.5),(size,size*.85,size),oak,cargo)
    for dx in [-.34,.34]:box('Cargo crate • corner band',(x+dx*size,y-size*.445,z+size*.5),(.09,size*.05,size),trim,cargo)
    for zz in [.10,.90]:box('Cargo crate • cross batten',(x,y-size*.445,z+size*zz),(size,.06,.09),deck,cargo)
    box('Cargo • planked lid',(x,y,z+size+.025),(size*1.04,size*.91,.09),deck,cargo)
    if cloth:
        box('Cargo • folded linen on crate',(x,y,z+size+.15),(size*.90,size*.84,.22),white,cargo)
        box('Cargo • tied linen strap',(x,y,z+size+.27),(.07,size*.88,.065),rope,cargo)
def barrel(x,y,z,r=.34,h=.90):
    m=Mesh('Cargo • voxel barrel',cargo);occ=set();u=.095;n=round(h/u)
    for iz in range(n):
        radius=r*(.90+.1*math.sin(math.pi*iz/(n-1)))
        for ix in range(-5,5):
            for iy in range(-5,5):
                if ((ix+.5)*u)**2+((iy+.5)*u)**2<radius**2:occ.add((ix,iy,iz))
    m.voxels(occ,(x,y,z),u,oak);m.finish()
    for zz in [z+.13,z+h*.55,z+h-.1]:
        for i in range(12):
            a=i*math.tau/12
            box('Barrel • forged hoop',(x+math.cos(a)*r,y+math.sin(a)*r,zz),(.085,r*.58,.095),iron,cargo,.12,rot=Quaternion((0,0,1),a))
    box('Barrel • bung',(x+.07,y,z+h+.014),(.105,.10,.055),trim,cargo)
barrel(-1.83,-.53,2.32,.36,.93)
barrel(1.76,1.4,2.32,.36,1.0)
barrel(1.38,3.56,3.32,.29,.69)
barrel(-1.45,3.53,3.32,.27,.72)
crate(-1.51,-1.66,2.33,.63,True)
crate(-1.58,1.17,2.32,.68)
crate(1.55,-1.05,2.32,.75,True)
crate(.76,.55,2.32,.73)
for x,y,z in [(-1.73,-2.5,2.48),(-1.73,-2.5,2.72),(1.48,-1.68,2.44)]:
    box('Cargo • tied canvas sack',(x,y,z),(.49,.39,.33),ivory,cargo)
    box('Sack • hemp tie',(x,y,z+.18),(.06,.43,.07),rope,cargo)

# Anchor hangs over the port bow in chunky charcoal iron.
ax,ay=-1.72,-3.75
rope_line('Anchor • cable',(ax,ay,2.69),(ax,ay,1.49),rope,fittings,.065)
beam('Anchor • shaft',(ax,ay,1.69),(ax,ay,.62),.115,iron,fittings)
beam('Anchor • cross stock',(ax-.04,ay-.30,1.45),(ax-.04,ay+.30,1.45),.15,dark,fittings)
for s in [-1,1]:
    beam('Anchor • fluke',(ax,ay,.61),(ax,ay+s*.34,.83),.115,iron,fittings)
    box('Anchor • fluke tip',(ax,ay+s*.35,.93),(.18,.16,.22),iron,fittings)

# Wheel is a separate rig: sailor's hands barely turn it between glances.
wheel=empty('rig_wheel',(0,2.90,3.84),crew)
box('Wheel • pedestal',(0,2.92,3.54),(.26,.28,.52),dark,fittings)
for i in range(8):
    a=i*math.pi/4;b=(i+1)*math.pi/4
    p=(math.sin(a)*.39,2.9,3.84+math.cos(a)*.39)
    q=(math.sin(b)*.39,2.9,3.84+math.cos(b)*.39)
    beam('Wheel • octagonal rim',p,q,.085,oak,crew,parent=wheel)
    beam('Wheel • spoke',(0,2.9,3.84),(math.sin(a)*.54,2.9,3.84+math.cos(a)*.54),.065,trim,crew,parent=wheel)
    box('Wheel • ivory handle',(math.sin(a)*.53,2.9,3.84+math.cos(a)*.53),(.11,.13,.11),rope,crew,parent=wheel)
box('Wheel • brass hub',(0,2.84,3.84),(.17,.15,.17),brass,crew,parent=wheel)

px,py,pz=0,3.66,3.32
body=empty('rig_helmsman',(px,py,pz+.60),crew)
head=empty('rig_head',(px,py,pz+1.42),crew);attach(head,body)
for side in [-1,1]:
    x=px+side*.18
    box('Helmsman • trouser leg',(x,py,pz+.42),(.25,.27,.61),coat,crew,.095)
    box('Helmsman • boot',(x,py-.08,pz+.13),(.29,.43,.24),boots,crew,.09)
box('Helmsman • ivory shirt',(px,py,pz+1.06),(.66,.35,.76),white,crew,.09,parent=body)
for side in [-1,1]:
    box('Helmsman • vest front',(px+side*.22,py-.205,pz+1.06),(.21,.085,.74),coat,crew,.09,parent=body)
box('Helmsman • vest back',(px,py+.20,pz+1.06),(.71,.10,.77),coat,crew,.09,parent=body)
box('Helmsman • leather belt',(px,py,pz+.73),(.70,.43,.10),trim,crew,.08,parent=body)
box('Helmsman • buckle',(px,py-.24,pz+.73),(.115,.06,.10),brass,crew,.055,parent=body)
for z in [pz+.9,pz+1.10,pz+1.29]:box('Helmsman • shirt button',(px,py-.19,z),(.055,.028,.055),trim,crew,.06,parent=body)
box('Helmsman • square face',(px,py-.025,pz+1.68),(.54,.46,.52),skin,crew,.085,parent=head)
box('Helmsman • hair back',(px,py+.22,pz+1.73),(.56,.09,.54),coat,crew,.085,parent=head)
for side in [-1,1]:
    box('Helmsman • dark pixel eye',(px+side*.13,py-.267,pz+1.70),(.065,.025,.14),black,crew,.08,parent=head)
    box('Helmsman • sideburn',(px+side*.25,py-.25,pz+1.75),(.065,.04,.2),coat,crew,.085,parent=head)
box('Helmsman • nose',(px,py-.30,pz+1.58),(.085,.085,.10),skin,crew,.10,parent=head)
box('Helmsman • wide tricorne brim',(px,py,pz+1.99),(.93,.72,.13),coat,crew,.09,parent=head)
box('Helmsman • hat crown',(px,py+.02,pz+2.13),(.57,.45,.21),boots,crew,.09,parent=head)
for side in [-1,1]:
    box('Helmsman • turned up brim',(px+side*.39,py,pz+2.09),(.14,.60,.14),coat,crew,.09,parent=head)
    box('Helmsman • hat gold piping',(px+side*.435,py,pz+2.15),(.055,.56,.045),brass,crew,.08,parent=head)
    arm=empty('rig_arm_'+str(side),(px+side*.42,py,pz+1.30),crew);attach(arm,body)
    beam('Helmsman • rolled sleeve',(px+side*.42,py,pz+1.30),(px+side*.43,py-.12,pz+.98),.21,white,crew,parent=arm,cell=.085)
    beam('Helmsman • reaching forearm',(px+side*.43,py-.14,pz+.97),(px+side*.32,py-.53,pz+.82),.14,skin,crew,parent=arm,cell=.085)
    box('Helmsman • hand on wheel',(px+side*.32,py-.62,pz+.78),(.16,.18,.15),skin,crew,.07,parent=arm)

# Lantern pivots at its chain, rather than sliding over the stern rail.
lx,ly=-1.83,4.25
box('Lantern • stern bracket upright',(lx,ly,4.11),(.16,.18,1.49),oak,fittings)
beam('Lantern • projecting bracket',(lx,ly,4.87),(lx-.65,ly,4.87),.16,dark,fittings)
lantern=empty('rig_lantern',(lx-.62,ly,4.80),lamps)
rope_line('Lantern • short chain',(lx-.62,ly,4.8),(lx-.62,ly,4.48),iron,lamps,.055,parent=lantern)
box('Lantern • glowing panes',(lx-.62,ly,4.12),(.30,.28,.44),glow,lamps,.08,parent=lantern)
for z,size in [(4.39,.43),(3.86,.43),(4.52,.25)]:box('Lantern • stepped iron cap',(lx-.62,ly,z),(size,size,.13),iron,lamps,.09,parent=lantern)
for dx in [-.17,.17]:
    for dy in [-.16,.16]:box('Lantern • frame',(lx-.62+dx,ly+dy,4.12),(.045,.045,.48),iron,lamps,.08,parent=lantern)
loose=empty('rig_loose_rope',(1.98,1.72,2.73),rig)
for a in range(24):
    t=math.tau*a/24
    box('Rope • hanging oval coil',(1.99,1.72+.14*math.sin(t),2.35+.35*math.cos(t)),(.065,.075,.075),rope,rig,.1,parent=loose)
rope_line('Rope • loose hanging tail',(1.99,1.72,2.60),(1.98,1.72,1.88),rope,rig,.055,parent=loose)

# The main yard runs athwartships: the square canvas faces the bow (-Y).
brace=Matrix.Translation((0,my,0)) @ Matrix.Rotation(math.pi,4,'Z') @ Matrix.Translation((0,-my,0))
for obj in rig.objects:
    if obj==main or obj.name.startswith(('Yard •','Boom •','Main sheet •','Sail •')):
        obj.matrix_world=brace @ obj.matrix_world
# Pennant extends aft (+Y), with its cloth ripple moving side-to-side.
flag.matrix_world=Matrix.Translation((0,my,0)) @ Matrix.Rotation(math.pi/2,4,'Z') @ Matrix.Translation((0,-my,0)) @ flag.matrix_world

# Ten-second seamless animation, preserving fixed sail edges.
for obj in crew.objects:
    if not obj.parent:obj.location.x-=.65
bpy.data.objects['Wheel • pedestal'].location.x-=.65
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=1;scene.frame_end=241
def motion(obj,axis,amplitude,cycles=1,phase=0):
    rest=obj.rotation_euler.copy()
    for frame in range(1,242,6):
        t=(frame-1)/240*math.tau
        obj.rotation_euler=rest.copy();obj.rotation_euler[axis]+=amplitude*math.sin(t*cycles+phase)
        obj.keyframe_insert(data_path='rotation_euler',frame=frame)
for obj,axis,amp,cycles,phase in [(body,1,.018,2,0),(head,2,.065,1,0),(wheel,1,.037,2,.1),(lantern,1,.065,3,0),(loose,1,.036,2,0)]:motion(obj,axis,amp,cycles,phase)
for obj in list(crew.objects):
    if obj.name.startswith('rig_arm_'):motion(obj,0,.017,2,0)
for obj,kind in [(main,'main'),(jib,'jib'),(flag,'flag')]:
    obj.shape_key_add(name='Basis')
    for mode in range(2):
        key=obj.shape_key_add(name='Wind billow' if mode==0 else 'Cloth ripple')
        for v in key.data:
            x,y,z=v.co
            if kind=='main':
                envelope=max(0,math.sin(math.pi*(x+2.35)/4.7))*max(0,math.sin(math.pi*(z-3.94)/4.6))
                v.co.y+=envelope*(.10 if mode==0 else .045*math.sin(z*3+x*2))
            elif kind=='jib':
                lead=-6.60+(z-3.40)*1.19;trail=-.52-(7.9-z)*.11
                envelope=max(0,math.sin(math.pi*max(0,min(1,(y-lead)/max(.1,trail-lead)))))*max(0,math.sin(math.pi*(z-3.4)/4.7))
                v.co.x+=envelope*(.10 if mode==0 else .035*math.sin(z*4-y))
            else:v.co.y+=max(0,x/1.5)*(.08 if mode==0 else .06*math.sin(x*5+z*3))
        for frame in range(1,242,6):
            t=(frame-1)/240*math.tau
            key.value=.5+.5*math.sin(t*(2+mode)+(0 if mode==0 else 1.1))
            key.keyframe_insert(data_path='value',frame=frame)
scene.frame_set(1)

# Studio only: soft, dark-neutral backdrop similar to the reference sheet.
floor=palette((.021,.024,.026),0)
box('Studio ground',(0,0,-.64),(200,200,.10),floor,studio,200)
world=bpy.data.worlds.new('Charcoal studio');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.18,.20,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.32
def area(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,4))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key • warm broad softbox',(-7,-9,15),2200,7,(1,.84,.65))
area('Fill • neutral bounce',(8,-5,10),1250,8,(.80,.87,1))
area('Rim • stern light',(0,8,13),2400,6,(1,.78,.49))
camd=bpy.data.cameras.new('Camera • sloop hero');cam=bpy.data.objects.new(camd.name,camd);studio.objects.link(cam)
cam.location=(-18,-12,13);cam.rotation_euler=(Vector((0,-.75,4.25))-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='ORTHO';camd.ortho_scale=17.7;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1700;scene.render.resolution_y=1700;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'trading-sloop-preview.png')
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=-.15
scene['asset']='Reference trading sloop with animated canvas, helmsman, wheel, lantern, loose rope and navy pennant.'
scene['export_scale']=2.7
scene['edit_workflow']='Save this blend, then run export-trading-sloop.py. Builder regeneration overwrites manual changes.'
for obj in bpy.context.selected_objects:obj.select_set(False)
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.type='MATERIAL';a.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'trading-sloop.blend'))
print('SLOOP SAVED',len(bpy.data.objects),'objects',flush=True)
bpy.ops.render.render(write_still=True)
