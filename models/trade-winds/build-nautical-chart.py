"""Run with Blender --background --python. Builds the editable chart and game GLB.
Geography shares coast.json and chart-layout.json with the game. +Y is north.
All decorative meshes are batched; port anchors and ship stay independent.
"""
import bpy, math, json, random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/trade-winds/models'
rng=random.Random(1804)
scene=bpy.data.scenes.new('West Indies · Chart Table')
bpy.context.window.scene=scene
collection=bpy.data.collections.new('Nautical Chart · Game Asset');scene.collection.children.link(collection)
materials=[];mat_cache={};parts={}
def material(hexcolor):
    if hexcolor in mat_cache:return mat_cache[hexcolor]
    m=bpy.data.materials.new('Pigment '+hexcolor);m.diffuse_color=(*[(lambda c:c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4)(int(hexcolor[i:i+2],16)/255) for i in (0,2,4)],1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=m.diffuse_color;bs.inputs['Roughness'].default_value=.88
    mat_cache[hexcolor]=len(materials);materials.append(m);return len(materials)-1
# Each named part becomes one mesh with a compact set of material primitives.
def box(part,x,y,z,w,d,h,color):
    v,f,mi=parts.setdefault(part,([],[],[]));n=len(v);v.extend([(x+sx*w/2,y+sy*d/2,z+sz*h/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]])
    faces=[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)];f.extend([tuple(n+i for i in face) for face in faces]);mi.extend([material(color)]*6)
def beam(part,a,b,width,color):
    # Pixel stepping gives rope and diagonals the same voxel language as the map.
    length=(Vector(b)-Vector(a)).length;n=max(1,int(length/(width*.85)))
    for i in range(n+1):
        p=Vector(a).lerp(Vector(b),i/n);box(part,*p,width,width,width,color)
wood=['54321e','654026','71482a','805333','8d5e37','9c6b40','6e4529'];gold=['ba852d','d39a38','e9b44d','f0c568'];green=['586f29','667e30','728b35','7f953d','8c9f43','566927','97a84b'];water=['247b91','287f94','2b8397','2e879a','318b9c','2c8296','257c92'];sand=['c7ac6f','d5bd83','e1ca94','cfb579']
def frame(part,x,y,w,d,z=1.2):
    box(part,x,y,z-.8,w,d,1.8,wood[0]);box(part,x,y,z-.35,w-1.1,d-1.1,.35,'37271d')
    for side in [-1,1]:
        box(part,x,y+side*(d/2-.9),z+1,w,1.8,1.4,wood[2]);box(part,x+side*(w/2-.9),y,z+1,1.8,d,1.4,wood[2])
    for side in [-1,1]:
        for i in range(int(w/4)):
            box(part,x-w/2+2+i*4,y+side*(d/2-.85),z+1.76,3.85,1.5,.12,rng.choice(wood[2:]))
        for i in range(int(d/4)):
            box(part,x+side*(w/2-.85),y-d/2+2+i*4,z+1.76,1.5,3.85,.12,rng.choice(wood[2:]))
    for sx in [-1,1]:
        for sy in [-1,1]:
            px=x+sx*(w/2-1.1);py=y+sy*(d/2-1.1)
            box(part,px,py,z+1.95,2.8,2.8,.45,'805839');box(part,px,py,z+2.22,.7,.7,.15,'332c24');box(part,px-.1,py+.12,z+2.32,.25,.25,.05,'ae8e5c')
# Board and weathered frame.
frame('Carved oak frame',0,0,126,78,0)
for side in [-1,1]:
    for x in range(-48,61,18):
        box('Carved oak frame',x,side*38.4,1.65,2.0,3.0,1.0,wood[3]);box('Carved oak frame',x,side*38.4,2.21,.5,.5,.18,'443528')
# Terrain sampled from the game's exact chart extent.
layout=json.loads((ROOT/'assets/trade-winds/chart-layout.json').read_text());bounds=layout['bounds'];W=120;D=72;cell=.75;nx=160;ny=96
coasts=json.loads((ROOT/'assets/trade-winds/coast.json').read_text())
polys=[(min(p[0] for p in ring),max(p[0] for p in ring),min(p[1] for p in ring),max(p[1] for p in ring),ring) for ring in coasts]
def contains(lon,lat):
    for west,east,south,north,ring in polys:
        if not west<=lon<=east or not south<=lat<=north:continue
        inside=False;j=len(ring)-1
        for i in range(len(ring)):
            xi,yi=ring[i];xj,yj=ring[j]
            if (yi>lat)!=(yj>lat) and lon<(xj-xi)*(lat-yi)/(yj-yi)+xi:inside=not inside
            j=i
        if inside:return True
    return False
def project(lon,lat):return ((lon-bounds['west'])/(bounds['east']-bounds['west'])-.5)*W,((lat-bounds['south'])/(bounds['north']-bounds['south'])-.5)*D
land={}
for ix in range(nx):
    for iy in range(ny):
        lon=bounds['west']+(ix+.5)/nx*(bounds['east']-bounds['west']);lat=bounds['south']+(iy+.5)/ny*(bounds['north']-bounds['south']);land[ix,iy]=contains(lon,lat)
# Keep very small inhabited islands readable at this tabletop scale.
for p in layout['ports']:
    if p['id'] in ['bridgetown','stgeorges','nassau','royal']:
        x,y=project(p['lon'],p['lat']);ix=int((x+60)/cell);iy=int((y+36)/cell)
        for dx,dy in [(0,0),(1,0),(-1,0),(0,1),(0,-1)]:land[ix+dx,iy+dy]=True
for ix in range(nx):
    for iy in range(ny):
        x=-60+(ix+.5)*cell;y=-36+(iy+.5)*cell
        if land[ix,iy]:
            depth=0
            for r in range(1,5):
                if all(land.get((ix+dx*r,iy+dy*r),True) for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]):depth=r
                else:break
            height=.7+depth*.26+rng.choice([0,0,.25,.5])
            box('Raised coastline',x,y,.24+height/2,cell,cell,height,rng.choice(green if depth else sand))
            if depth and rng.random()<.16:box('Highland voxels',x,y,.24+height+.15,cell*.72,cell*.72,.3,rng.choice(green))
        else:
            shore=any(land.get((ix+dx,iy+dy),False) for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)])
            box('Tiled Caribbean water',x,y,.17,cell,cell,.28,rng.choice(['65a6a2','78b1a7','90bdb0']) if shore else rng.choice(water))
            if not shore and rng.random()<.04:box('Water glints',x,y,.325,cell*.72,cell*.25,.025,rng.choice(['53a0ab','67adb4','418f9f']))
# Port posts are real geometry; labels will be live, accessible game controls.
for p in layout['ports']:
    x,y=project(p['lon'],p['lat']);box('Port moorings',x,y,1.3,1.25,1.25,1.9,'302c20');box('Port moorings',x,y,2.3,1.32,1.32,.16,'b6965d')
    anchor=bpy.data.objects.new('port_'+p['id'],None);collection.objects.link(anchor);anchor.location=(x,y,2.6);anchor['port_id']=p['id']
# Heading plaque and control plinth.
frame('Title plaque',-28,49,69,17,1)
for j in range(4):box('Title plaque',-28,43+j*3,1.9,64,2.9,.35,wood[j%3])
frame('Course control plinth',2,-47,126,13,0)
for i in range(8):box('Course control plinth',-51+i*15,-47,.5,14.9,8,.3,wood[i%3])
# Individually carved strips and chips keep broad wooden surfaces from looking flat.
for i in range(230):
    x=rng.uniform(-59,4);y=rng.uniform(42,56)
    box('Title plaque',x,y,2.11,rng.uniform(.5,3.3),rng.choice([.18,.3,.5]),.08,rng.choice(['422a1b','57351f','684025','754c2c']))
for side in [-1,1]:
    for i in range(130):
        x=rng.uniform(-59,59);y=side*38.2+rng.uniform(-.4,.4)
        box('Carved oak frame',x,y,1.85,rng.uniform(.5,2.4),.18,.15,rng.choice(wood))
# Compass case, stepped brass ring, paper face and cardinal ticks.
compass_x=-62;compass_y=-42
for i in range(48):
    a=math.tau*i/48
    for radius,z,size,col in [(8,1.8,1.6,'bc8831'),(7.2,2.5,1.0,'e4b653'),(6.3,2.4,1.0,'ba9652')]:box('Brass compass',compass_x+math.sin(a)*radius,compass_y+math.cos(a)*radius,z,size,size,1.2,col)
for ix in range(-6,7):
    for iy in range(-6,7):
        if ix*ix+iy*iy<40:box('Brass compass',compass_x+ix,compass_y+iy,2.0,1,1,.4,rng.choice(sand))
for i in range(16):
    a=math.tau*i/16;box('Brass compass',compass_x+math.sin(a)*5.7,compass_y+math.cos(a)*5.7,2.5,.3,.3,.3,'654827')
beam('Brass compass',(compass_x,compass_y,2.65),(compass_x+1.3,compass_y+5,2.65),.5,'b04429');beam('Brass compass',(compass_x,compass_y,2.65),(compass_x-1.3,compass_y-5,2.65),.5,'393b34');box('Brass compass',compass_x,compass_y,3,1.2,1.2,.7,'564735')
for x,y in [(-65,-31),(-61,-31)]:box('Brass compass',x,y,1.8,.8,5,.8,'bc8831')
box('Brass compass',-63,-28.5,1.8,4.8,.8,.8,'e3b34a')
# Bound navy atlas with a voxel gold anchor.
box('Navigation atlas',23,49,1.5,17,18,2.2,'493521');box('Navigation atlas',23,49,2.7,15.8,17,.6,'c6ac75');box('Navigation atlas',23,49,3.3,17.3,18.3,.55,'173b56')
for i in range(65):box('Navigation atlas',15.2+rng.random()*15.5,41+rng.random()*16,3.62,1.1,1.1,.04,rng.choice(['214762','284c66','1b4059']))
box('Navigation atlas',23,50,3.75,.65,8,.2,'c69a46');box('Navigation atlas',23,52,3.75,4,.65,.2,'c69a46')
for side in [-1,1]:beam('Navigation atlas',(23,46,3.75),(23+side*3,48,3.75),.65,'c69a46');box('Navigation atlas',23+side*3,48.5,3.75,.65,2,.2,'c69a46')
for x in [15,31]:
    for y in [41,57]:box('Navigation atlas',x,y,3.7,1.8,1.8,.15,'b68a46')
# Lantern, candle, warm glass and handle.
for z,w,d in [(1,10,9),(2,8,7),(11,8.5,7.5),(12,10,9),(14,5,5)]:box('Harbor lantern',47,50,z,w,d,1.1,wood[2])
for dx in [-3.4,3.4]:
    for dy in [-2.8,2.8]:box('Harbor lantern',47+dx,50+dy,6.5,.9,.9,9,wood[3])
box('Harbor lantern',47,50,4,2.5,2.5,3,'eed391');box('Lantern flame',47,50,7,1.4,1.4,3.2,'ffd052');box('Lantern flame',47,50,8.7,.75,.75,1.2,'ffeb9a')
for dx in [-1.7,1.7]:box('Harbor lantern',47+dx,50,15.8,.7,.7,3.3,'614b31')
box('Harbor lantern',47,50,17.2,4,.7,.7,'8d6d3c')
# Coins and a tied chart roll.
for i in range(25):
    x,y=rng.choice([(-57,-55),(38,44),(58,51)]);x+=rng.uniform(-5,5);y+=rng.uniform(-3,3);z=rng.uniform(.4,1.2)
    box('Scattered doubloons',x,y,z,1.25,1.25,.45,rng.choice(gold));box('Scattered doubloons',x,y,z+.27,.55,.55,.12,'f5cd6b')
for i in range(10):box('Rolled chart',58+i*.8,44,2.1,1,4.5,3.5,rng.choice(sand))
for x in [60,64]:box('Rolled chart',x,44,2.3,.8,4.7,3.7,'865232')
# Miniature ship: exported separately so the game moves it to the saved position.
for i in range(-3,4):
    width=2.2 if abs(i)<2 else (1.7 if abs(i)==2 else 1)
    box('chart_ship',0,i*.6,1,width,.63,1.1,wood[2]);box('chart_ship',0,i*.6,1.65,width+.2,.63,.25,'ba9250')
for y in [-.8,.8]:
    box('chart_ship',0,y,3.0,.18,.18,3.3,'6c4529')
    for j in range(5):box('chart_ship',0,y+.12,2.1+j*.43,2.2-j*.11,.16,.44,'eee1b8')
box('chart_ship',0,.8,4.8,.85,.18,.35,'b15b2d')
# Map compass rose.
for a in range(8):
    angle=math.tau*a/8;beam('Map compass rose',(49,25,.55),(49+math.sin(angle)*3,25+math.cos(angle)*3,.55),.23,'dbc288')
# Build meshes and convert readable map inscriptions to geometry.
for name,(vertices,faces,indices) in parts.items():
    if name=='Tiled Caribbean water':
        faces=faces[5::6];indices=indices[5::6]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj)
    for m in materials:mesh.materials.append(m)
    for poly,idx in zip(mesh.polygons,indices):poly.material_index=idx
    if name=='chart_ship':obj.location=(*project(-78.6,16.8),1.6)
fonts={}
def text(name,body,x,y,z,size,font='Georgia.ttf',color='eed5a0',align='LEFT'):
    curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.size=size;curve.align_x=align;curve.extrude=.025;curve.resolution_u=2
    if font not in fonts:fonts[font]=bpy.data.fonts.load('/System/Library/Fonts/Supplemental/'+font)
    curve.font=fonts[font];obj=bpy.data.objects.new(name,curve);collection.objects.link(obj);obj.location=(x,y,z);curve.materials.append(materials[material(color)])
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');obj.select_set(False)
text('Heading edition','THE WEST INDIES · 1804',-58,53,2.9,1.85,'Georgia Bold.ttf','dfb469')
text('Heading title','A sea of possibilities.',-58,47.6,2.9,5.2,'Georgia Bold.ttf')
text('Heading help','Choose a port. Mark its bearing. Sail the route.',-58,43.7,2.9,1.85)
for label,lon,lat in [('Gulf of Mexico',-91,25),('Caribbean Sea',-74,14.4),('Atlantic Ocean',-66,27)]:
    x,y=project(lon,lat);text(label,label,x,y,.52,2.6,'Georgia Italic.ttf',align='CENTER')
for label,lon,lat in [('MEXICO',-100,23),('SOUTH AMERICA',-67,8)]:
    x,y=project(lon,lat);text(label,label,x,y,3.4,1.55,'Georgia Bold.ttf',align='CENTER')
for label,x,y in [('N',49,29),('S',49,20.8),('E',53,24.8),('W',45,24.8)]:text('Rose '+label,label,x,y,.6,1.5,'Georgia Bold.ttf',align='CENTER')
# An export camera also makes the .blend immediately reviewable.
camdata=bpy.data.cameras.new('Chart presentation');cam=bpy.data.objects.new('Chart presentation',camdata);scene.collection.objects.link(cam);cam.location=(4,-100,137);direction=Vector((0,2,0))-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=150;scene.camera=cam
world=bpy.data.worlds.new('Warm studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.28,.32,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45;scene.world=world
for name,loc,energy,size in [('Sunlit window',(-45,-25,100),180000,75),('Harbor bounce',(60,40,80),70000,65)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1500;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
# Export just this asset, without the original Blender scene or studio lights.
bpy.ops.object.select_all(action='DESELECT')
for obj in collection.objects:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'west-indies-chart.glb'),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
# Keep the source model, camera and lights together in an editable .blend.
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'models/trade-winds/west-indies-chart.blend'))
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
(OUT/'build-complete.json').write_text(json.dumps({'objects':len(collection.objects),'vertices':sum(len(o.data.vertices) for o in collection.objects if o.type=='MESH'),'asset':'west-indies-chart.glb'}))
print('CHART BUILD COMPLETE')
