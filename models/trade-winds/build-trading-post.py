"""Build the furnished merchant stall, save its editable scene, and export it.
Rebuilding replaces manual edits; export-trading-post.py exports saved edits only.
"""
import bpy, math, json, random, runpy
from pathlib import Path
from mathutils import Matrix, Vector
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
helpers=runpy.run_path(str(HERE/'sloop-voxel-tools.py'))
Mesh=helpers['Mesh'];palette=helpers['palette']
random.seed(1804)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def collection(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
asset=collection('Trading Post • Game Asset')
study=collection('Study • merchant, harbor and lighting')
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
def pos(p):return C @ Vector(p)
def pigment(hexcolor,variation=.1,metal=0):
    rgb=[int(hexcolor[i:i+2],16)/255 for i in (0,2,4)]
    return palette(tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb),variation,metal)
oak=pigment('9c7045');dark=pigment('4f3827');trim=pigment('ba8950');iron=pigment('3e4745',.08,.5)
cream=pigment('dfcba2');rope=pigment('bfa171');green=pigment('455e49');red=pigment('9e4430')
gold=pigment('d5ac51',.07,.55);glass=pigment('365e50');paper=pigment('ecddb5')

# Keep the original stall footprint and material palette. Faces become editable
# geometry with small tonal blocks, instead of large flat-colored primitives.
for category in ['Original stall','Merchant study','Lantern study','Harbor study','Banner study']:
    m=Mesh(category,asset if category=='Original stall' else study)
    for rec in json.loads((HERE/'trading-post-source.json').read_text()):
        if rec['category']!=category:continue
        mat=Matrix([rec['matrix'][i:i+4] for i in range(0,16,4)]).transposed()
        center,quat,scale=mat.decompose()
        start=len(m.v)
        pal=palette(tuple(rec['color']),.065,emission=2 if rec['glow'] else 0)
        m.box((0,0,0),tuple(scale),pal,cell=.65 if category=='Original stall' else 20,rot=quat)
        for i in range(start,len(m.v)):m.v[i]=tuple(pos(Vector(m.v[i])+center))
    m.finish()

def boxes(name):return Mesh(name,asset)
def block(m,p,s,pal,cell=.32):m.box(pos(p),(s[0],s[2],s[1]),pal,cell)
def beam(m,a,b,width,pal):
    a=pos(a);b=pos(b);m.box((a+b)/2,(width,width,(b-a).length),pal,.30,(b-a).to_track_quat('Z','Y'))
def line(m,a,b,width,pal,sag=0):
    a=Vector(a);b=Vector(b);steps=max(2,int((b-a).length/(width*.8)))
    for i in range(steps+1):
        t=i/steps;p=a.lerp(b,t);p.y-=sag*math.sin(math.pi*t)
        block(m,p,(width,)*3,pal,2)

# A stocked back wall frames the merchant without covering his face.
m=boxes('Cabinet • shelves, drawers and brass pulls')
for x in [3.35,6.6]:block(m,(x,7.65,-2.65),(.20,10.0,.45),dark)
for y in [3.0,5.2,7.8,10.3,12.55]:
    block(m,(4.98,y,-2.25),(3.7,.20,1.5),trim)
    block(m,(4.98,y-.13,-1.45),(3.7,.22,.14),dark)
for x in [4.1,5.8]:
    for y in [3.6,4.45]:
        block(m,(x,y,-1.53),(1.5,.72,.16),oak)
        block(m,(x,y,-1.4),(.28,.12,.12),gold)
for y in [5.8,8.3,10.8]:block(m,(-5.1,y,-2.0),(3.5,.18,2.0),trim)
m.finish()

def bottle(m,x,y,z,h,pal):
    block(m,(x,y+h*.38,z),(.42,h*.76,.42),pal,.20)
    block(m,(x,y+h*.81,z),(.28,h*.15,.28),pal)
    block(m,(x,y+h*.95,z),(.17,h*.25,.17),pal)
    block(m,(x,y+h*1.1,z),(.20,.14,.20),rope)
    block(m,(x,y+h*.40,z+.22),(.32,h*.24,.025),cream)
m=boxes('Stock • rum bottles, jars, books and folded cloth')
for shelf in [5.33,7.93,10.43]:
    for i in range(5):bottle(m,3.8+i*.57,shelf,-1.95,1.1+(i%3)*.18,glass if i%2 else green)
for i in range(5):
    for j in range(3):block(m,(-6.1+i*.51,6.02+j*.18,-1.85),(.48,.16,.94),cream if i%2 else green)
for i in range(6):
    block(m,(-6.3+i*.48,9.0,-1.75),(.39,1.3+(i%3)*.13,.8),[red,green,dark][i%3])
    for y in [8.6,9.25]:block(m,(-6.3+i*.48,y,-1.33),(.35,.055,.05),gold)
for i in range(5):bottle(m,-6.2+i*.5,10.91,-1.85,1.05,glass)
m.finish()

def crate(m,x,y,z,w=1.5):
    for i in range(4):block(m,(x,y+w*(i+.5)/4,z),(w,.22,w),oak)
    for side in [-1,1]:
        block(m,(x+side*w*.43,y+w*.5,z+w*.51),(.15,w,.10),trim)
        for yy in [.09,w-.09]:block(m,(x,y+yy,z+w*.52),(w,.17,.12),trim)
    beam(m,(x-w*.38,y+.15,z+w*.58),(x+w*.38,y+w-.15,z+w*.58),.15,trim)
m=boxes('Cargo • stacked crates and tied canvas bales')
for x,y,z,w in [(-9,0,5,2.0),(-9,2,5,1.6),(9.8,0,-1,2.2),(9.8,2.2,-1,1.8),(8.8,0,-4,2.0)]:crate(m,x,y,z,w)
for x,y,z in [(-8.8,0,8),(8.3,0,9),(9.5,0,7.2)]:
    block(m,(x,y+.9,z),(1.65,1.8,1.7),cream)
    for side in [-.5,.5]:
        block(m,(x+side,y+.9,z+.87),(.12,1.85,.07),rope)
        block(m,(x+side,y+1.82,z),(.12,.08,1.8),rope)
    block(m,(x,y+1.87,z),(.30,.14,.35),rope)
m.finish()

# Open woven baskets give the foreground rich silhouettes and visible produce.
m=boxes('Baskets • oranges, limes, coffee beans and cinnamon')
for x,z,pal in [(-4.9,4.4,pigment('d79b3f')),(-6.0,4.3,pigment('84914a')),(6.1,3.8,pigment('65452d'))]:
    y=6.8
    for level in range(5):
        for side in [-1,1]:
            block(m,(x+side*.48,y+level*.12,z),(.12,.08,1.0),rope)
            block(m,(x,y+level*.12,z+side*.48),(1.0,.08,.12),rope)
    for i in range(16):
        xx=x+(i%4-1.5)*.23;zz=z+(i//4-1.5)*.23
        block(m,(xx,y+.48+random.random()*.14,zz),(.22,.23,.22),pal,.2)
for i in range(11):block(m,(3.0+(i%4)*.13,6.9+(i//4)*.13,5.15),(.10,.10,.85),red,.25)
m.finish()

m=boxes('Desk • balance scale, weights, ledger, scrolls and sealing wax')
block(m,(2.2,6.95,3.15),(1.55,.20,.85),dark)
block(m,(2.2,7.9,3.15),(.14,1.85,.14),gold)
block(m,(2.2,8.8,3.15),(2.4,.11,.11),gold)
for side in [-1,1]:
    x=2.2+side*1.05
    for dz in [-.26,.26]:line(m,(x,8.8,3.15),(x,7.85,3.15+dz),.035,gold)
    block(m,(x,7.78,3.15),(.75,.09,.65),gold)
for i in range(3):block(m,(1.15+i*.20,7.9,3.15),(.17,.20+i*.06,.17),iron)
block(m,(2.2,6.89,5.75),(1.8,.17,1.05),red)
for side in [-1,1]:
    block(m,(2.2+side*.43,7.0,5.75),(.8,.08,.95),paper)
    for i in range(6):block(m,(2.2+side*.43,7.045,5.40+i*.12),(.55,.015,.025),dark,2)
for i in range(3):
    block(m,(4.0+i*.34,6.95,5.35),(.27,.23,1.15),paper)
    block(m,(4.0+i*.34,7.08,5.35),(.29,.055,.14),red)
block(m,(3.9,6.95,6.1),(.26,.26,.32),red)
m.finish()

m=boxes('Tackle • hanging ropes, hooks and fishing net')
for cx,cy,z,r in [(-6.55,10.6,3.0,.64),(6.6,10.3,2.8,.56),(8.7,4.9,.6,.62)]:
    for ring in range(3):
        for i in range(42):
            a=math.tau*i/42
            block(m,(cx+(r+ring*.07)*math.cos(a),cy+(r*1.3+ring*.07)*math.sin(a),z+ring*.05),(.10,.10,.11),rope,2)
    line(m,(cx,cy+r*1.4,z),(cx,cy+r*1.4+.5,z),.09,iron)
for x in [7.3,7.65,8,8.35,8.7,9.05]:line(m,(x,2.8,-.5),(x-.8,.25,2.8),.035,rope,.3)
for j in range(9):
    t=j/8;line(m,(7.3-.8*t,2.8-2.55*t,-.5+3.3*t),(9.05-.8*t,2.8-2.55*t,-.5+3.3*t),.035,rope,.13)
m.finish()

m=boxes('Joinery • pegs, carved counter trim and plank grain')
for x in [-7.5,7.5]:
    for y in [3.8,7.5,11.9,14.1]:
        block(m,(x,y,6.31),(.23,.23,.12),iron)
for i in range(40):
    x=-6.3+(i%20)*.66;y=2.1+(i//20)*2.9
    block(m,(x,y,7.01),(.18,.18,.07),iron)
for y in [1.85,5.72]:block(m,(0,y,7.08),(13,.16,.12),trim)
for i in range(70):
    x=random.uniform(-6.2,6.2);z=random.uniform(2,6.5)
    block(m,(x,6.75,z),(random.uniform(.2,.9),.025,.023),dark,2)
m.finish()

# Render context is excluded from the game export.
def solid(name,color):
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);return mat
bpy.ops.mesh.primitive_plane_add(size=220,location=(0,35,-.65))
water=bpy.context.object;water.name='Study water';water.data.materials.append(solid('Harbor teal',(.026,.18,.22)))
for c in list(water.users_collection):c.objects.unlink(water)
study.objects.link(water)
for x,z,scale in [(9,-27,.58),(-5,-38,.38),(26,-43,.62)]:
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/trade-winds/models/trading-sloop.glb'))
    imported=set(bpy.data.objects)-before
    for o in imported:
        for c in list(o.users_collection):c.objects.unlink(o)
        study.objects.link(o)
    pivot=bpy.data.objects.new('Study • moored sloop',None);study.objects.link(pivot)
    for o in imported:
        if not o.parent:o.parent=pivot
    pivot.location=pos((x,-1.0,z));pivot.scale=(scale,)*3;pivot.rotation_euler.z=.32

scene=bpy.context.scene
scene.world.use_nodes=True
background=scene.world.node_tree.nodes.get('Background')
background.inputs['Color'].default_value=(.36,.56,.66,1)
background.inputs['Strength'].default_value=.45
def light(name,loc,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);study.objects.link(o);o.location=pos(loc)
    o.rotation_euler=(pos((0,7,0))-o.location).to_track_quat('-Z','Y').to_euler()
light('Warm afternoon',(-12,24,18),5500,12,(1,.80,.58))
light('Soft face fill',(3,13,19),2600,10,(.73,.87,1))
light('Harbor rim',(14,20,-18),6000,10,(1,.87,.68))
for x,y,z in [(-1.7,7.5,4.7),(-7.5,11.3,5.8)]:
    data=bpy.data.lights.new('Lantern glow','POINT');data.energy=65;data.color=(1,.55,.17);data.shadow_soft_size=.6
    o=bpy.data.objects.new('Lantern glow',data);study.objects.link(o);o.location=pos((x,y,z))
data=bpy.data.cameras.new('Trading post portrait');cam=bpy.data.objects.new('Trading post portrait',data);study.objects.link(cam)
cam.location=pos((5,11.4,33));target=pos((3,7.7,-1))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();data.lens=40;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1700;scene.render.resolution_y=1300;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'trading-post-preview.png')
scene.view_settings.view_transform='AgX'
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'trading-post.blend'))
runpy.run_path(str(HERE/'export-trading-post.py'))
if '--render' in __import__('sys').argv:bpy.ops.render.render(write_still=True)
