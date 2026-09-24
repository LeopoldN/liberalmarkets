import bpy,math,random
from mathutils import Vector
ROOT='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds'
sc=bpy.context.scene;assert not sc.get('game_animation_done')
src=open(ROOT+'/frigate-review/detail-deck-astra.py').read();exec(src[src.index('groups={}'):src.index('def deckz')])
a=math.radians(65);co,si=math.cos(a),math.sin(a)
masts=[(-11,[(9,15,7),(16,23,5.5),(24,29,3.6)]),(4,[(9,16,7),(17,25,5.5),(26,31,3.4)]),(14,[(17,23,3.8),(24,27,2.5)])]
# Square sails face the bow (-X); the jibs and driver keep their fore-and-aft rig.
for o in bpy.data.collections['Sails'].objects:
    if 'Reference canvas' not in o.name:continue
    stem=o.name.split('Reference canvas ')[1];mi=int(stem[0]);x=masts[mi][0]
    for v in o.data.vertices:
        dx=v.co.x-x;dy=v.co.y/1.5+.18;u=co*dx+si*dy;b=-si*dx+co*dy
        v.co.x=x-b;v.co.y=u*1.5*si
    o['sail_forward']='bow -X';o['mast_index']=mi
# Yards and their attached running lines follow the new sail plane.
for o in list(bpy.data.objects):
    if (o.name.startswith('Yard ') and o.name!='Yard lifts') or o.name in ['Yard lifts','Running braces']:bpy.data.objects.remove(o,do_unlink=True)
tar=bpy.data.materials['Ref tar'];hemp=bpy.data.materials['Reference tarred rigging']
def cable(n,a,b,r,sag):
    a,b=Vector(a),Vector(b)
    for j in range(12):
        t=j/12;u=(j+1)/12;p=a.lerp(b,t);q=a.lerp(b,u);p.z-=4*sag*t*(1-t);q.z-=4*sag*u*(1-u);beam(n,p,q,r,hemp,'Rigging')
for mi,(x,tiers) in enumerate(masts):
    for ti,(bottom,z,span) in enumerate(tiers):
        w=span*1.5*si
        beam('Yard %d %d'%(mi,ti),(x,-w*1.05,z),(x,w*1.05,z),.22 if ti==0 else .16,tar,'Masts and yards')
        for side in [-1,1]:
            cable('Yard lifts',(x,side*w,z),(x+.45,0,z+2),.029,.12)
            cable('Running braces',(x,side*w,z),(min(21,x+7),side*3,7),.025,.4)
# Split inherited paired anchor parts into independently editable pivoted assemblies.
parts=[bpy.data.objects[n] for n in ['Anchor stock.002','Anchor shank.002','Anchor fluke.004']]
for side,label in [(-1,'Port'),(1,'Starboard')]:
    for ob in parts:
        for p in ob.data.polygons:
            vv=[ob.matrix_world@ob.data.vertices[i].co for i in p.vertices]
            if sum(v.y for v in vv)*side<0:continue
            geo('Anchor '+label,[tuple(v) for v in vv],[tuple(range(len(vv)))],ob.data.materials[p.material_index],'Props')
for ob in parts:bpy.data.objects.remove(ob,do_unlink=True)
# Emissive flame cores and two practical point lights live inside the stern lanterns.
lantern=bpy.data.materials.new('Animated lantern amber');lantern.use_nodes=True
p=lantern.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(1,.35,.04,1);p.inputs['Emission Color'].default_value=(1,.32,.025,1);p.inputs['Emission Strength'].default_value=3
lantern.diffuse_color=(1,.35,.04,1)
for side in [-1,1]:
    x,y,z=20.84,side*3.65,7.65
    box('Lantern flame '+str(side),(x,y,z),(.28,.27,.48),lantern,'Stern gallery')
    ld=bpy.data.lights.new('Lantern glow '+str(side),'POINT');ld.color=(1,.49,.13);ld.energy=20;ld.shadow_soft_size=.28;ld.use_shadow=False
    ob=bpy.data.objects.new(ld.name,ld);bpy.data.collections['Stern gallery'].objects.link(ob);ob.location=(x+.2,y,z)
    ob['lantern_flicker']=True;ob['flicker_phase']=0 if side<0 else 1.7;ob['base_intensity']=20
    for f in range(1,194,3):
        t=(f-1)/24;ld.energy=20*(.83+.10*math.sin(t*math.pi*2+ob['flicker_phase'])+.07*math.sin(t*math.pi*5+ob['flicker_phase']));ld.keyframe_insert('energy',frame=f)
for (c,n),(vs,fs,ms,ids) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ids):p.material_index=i
    ob=bpy.data.objects.new(n,me);bpy.data.collections[c].objects.link(ob)
# Anchor swing is stowed motion: no patrol anchor is dropped into the water.
for side,label in [(-1,'Port'),(1,'Starboard')]:
    ob=bpy.data.objects['Anchor '+label];pivot=Vector((-18,side*4,6.5))
    for v in ob.data.vertices:v.co-=pivot
    ob.location=pivot;ob['animation_role']='anchor_sway'
    for f in range(1,194,3):
        t=2*math.pi*(f-1)/192;ob.rotation_euler.x=.045*math.sin(t+side*.4);ob.rotation_euler.y=.025*math.sin(t*2);ob.keyframe_insert('rotation_euler',frame=f)
# Wind uses matching sine/cosine weights so export batching preserves deformation.
for ob in bpy.data.collections['Sails'].objects:
    if ob.type!='MESH':continue
    is_square='Reference canvas' in ob.name;is_flag='ensign' in ob.name.lower()
    coords=[v.co.copy() for v in ob.data.vertices];xmin=min(v.x for v in coords);xmax=max(v.x for v in coords);ymin=min(v.y for v in coords);ymax=max(v.y for v in coords);zmin=min(v.z for v in coords);zmax=max(v.z for v in coords)
    ob.shape_key_add(name='Basis')
    for name,phase in [('Wind sine',0),('Wind cosine',math.pi/2)]:
        key=ob.shape_key_add(name=name);key.slider_min=-1
        for k,v in enumerate(coords):
            u=(v.y-ymin)/max(.1,ymax-ymin) if is_square else (v.x-xmin)/max(.1,xmax-xmin)
            fall=(zmax-v.z)/max(.1,zmax-zmin)
            envelope=max(0,math.sin(math.pi*u))*max(0,fall) if is_square else (max(0,u)**1.2 if is_flag else max(0,math.sin(math.pi*u))*max(0,math.sin(math.pi*fall)))
            amp=(.13 if is_square else .18 if is_flag else .11)*envelope*math.sin(u*5+fall*3+phase)
            key.data[k].co+=Vector((-amp,0,0)) if is_square else Vector((0,amp,0))
        for f in range(1,194,3):
            key.value=math.sin(2*math.pi*(f-1)/192+phase);key.keyframe_insert('value',frame=f)
    ob['wind_animated']=not is_flag;ob['animation_role']='flag_wind' if is_flag else 'square_wind' if is_square else 'headsail_wind'
# Geometric flame flicker is carried in glTF even in engines without animated-light support.
for side in [-1,1]:
    ob=bpy.data.objects['Lantern flame '+str(side)];ob['animation_role']='lantern_flicker';ob.shape_key_add(name='Basis')
    for name,phase in [('Wind sine',0),('Wind cosine',math.pi/2)]:
        key=ob.shape_key_add(name=name);key.slider_min=-1
        for v in key.data:v.co.z+=.035*math.sin(phase+side)*(v.co.z-7.4)/.5
        for f in range(1,194,3):
            key.value=math.sin(2*math.pi*(f-1)/192+phase);key.keyframe_insert('value',frame=f)
# Keep the entire ten-second presentation alive while the eight-second wind loop repeats.
for action in bpy.data.actions:
    if action.name.startswith('Flyaround'):continue
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot)
                if not bag:continue
                for fc in bag.fcurves:
                    for key in fc.keyframe_points:key.interpolation='LINEAR'
                    if not any(m.type=='CYCLES' for m in fc.modifiers):fc.modifiers.new('CYCLES')
sc.frame_start=1;sc.frame_end=240;sc.render.fps=24;sc.frame_set(1);sc.camera=bpy.data.objects['Concept camera'];sc['game_animation_done']=True
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/royal-navy-frigate.blend')
print('Forward rig, wind, independent stowed anchors, emissive lantern animation and practical flicker saved')
