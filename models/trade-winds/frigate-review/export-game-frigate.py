import bpy,bmesh,math,runpy,contextlib,io,json
from pathlib import Path
from collections import defaultdict
ROOT=Path('/Users/nick/Documents/GitHub/liberalmarkets')
SOURCE=ROOT/'models/trade-winds/royal-navy-frigate.blend'
sc=bpy.context.scene;sc.frame_set(1);sc.frame_end=193
# Work only in memory; the editable source is reopened after export.
retained=[o for o in sc.objects if (o.type=='MESH' and not o.name.startswith('Panel seams ') and o.name not in ['Copper shallow strake joints','Staggered copper panel joints']) or (o.type=='LIGHT' and o.get('lantern_flicker'))]
for o in list(sc.objects):
    if o not in retained:bpy.data.objects.remove(o,do_unlink=True)
surfaces={}
def surface(kind):
    if kind in surfaces:return surfaces[kind]
    m=bpy.data.materials.new('Royal frigate '+kind);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(1,1,1,1);p.inputs['Roughness'].default_value=.78
    color=m.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='FrigateColor';m.node_tree.links.new(color.outputs['Color'],p.inputs['Base Color'])
    if kind=='lantern':p.inputs['Emission Color'].default_value=(1,.32,.025,1);p.inputs['Emission Strength'].default_value=3
    if kind=='canvas':m.node_tree.links.new(color.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.12
    surfaces[kind]=m;return m
batches=defaultdict(list)
for o in retained:
    if o.type!='MESH':continue
    name=o.name
    group='Square canvas' if o.get('animation_role')=='square_wind' else 'British_Ensign_stern' if name=='Stern ensign' else 'Headsails and mast flag' if o.get('animation_role') in ['headsail_wind','flag_wind'] else name if name.startswith('Anchor ') else 'Lantern glass and flames' if name=='Lantern glass' or name.startswith('Lantern flame') else 'Hull decks rigging and fittings'
    kind='lantern' if group=='Lantern glass and flames' else 'canvas' if group in ['Square canvas','Headsails and mast flag','British_Ensign_stern'] else 'pigment'
    me=o.data
    # Remove hidden paired cell faces without changing vertex order or morph targets.
    delete=set()
    if me.shape_keys:
        pairs=defaultdict(list)
        for face in me.polygons:
            signature=tuple(sorted(tuple(round(me.vertices[i].co[j],4) for j in range(3)) for i in face.vertices))
            pairs[signature].append(face.index)
        for indices in pairs.values():
            if len(indices)>1:delete.update(indices)
    if name in ['Main planked deck','Forecastle deck','Quarterdeck']:
        delete.update(p.index for p in me.polygons if p.normal.z<.5)
    if delete:
        bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm,geom=[bm.faces[i] for i in delete],context='FACES_ONLY')
        bm.to_mesh(me);bm.free()
    values=[]
    for m in me.materials:
        p=m.node_tree.nodes.get('Principled BSDF') if m and m.use_nodes else None
        values.append(tuple(p.inputs['Base Color'].default_value) if p else tuple(m.diffuse_color) if m else (.4,.3,.2,1))
    color=me.color_attributes.new(name='FrigateColor',type='BYTE_COLOR',domain='CORNER');rgba=[0.]*(len(me.loops)*4)
    for p in me.polygons:
        c=values[p.material_index] if values else (.4,.3,.2,1)
        if name=='Lantern glass':c=(1,.44,.07,1)
        for i in p.loop_indices:rgba[i*4:i*4+4]=c
    color.data.foreach_set('color',rgba);me.materials.clear();me.materials.append(surface(kind))
    for p in me.polygons:p.material_index=0
    batches[group].append(o)
for name,objects in batches.items():
    # Matching shape-key names and shared weights allow safe animated batching.
    objects.sort(key=lambda o:0 if o.data.shape_keys else 1)
    before=sum(len(o.data.vertices) for o in objects)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    o=bpy.context.object;o.name=name
    assert len(o.data.vertices)==before,(name,before,len(o.data.vertices))
    if o.data.shape_keys:
        assert all(len(k.data)==before for k in o.data.shape_keys.key_blocks)
    else:
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(o.data);bm.free()
    o['wind_animated']=name in ['Square canvas','Headsails and mast flag']
    o['animation_role']='square_wind' if name=='Square canvas' else 'headsail_wind' if name=='Headsails and mast flag' else o.get('animation_role','static')
root=bpy.data.objects.new('Royal Navy frigate game root',None);sc.collection.objects.link(root)
placement=bpy.data.objects.new('Waterline and center',None);sc.collection.objects.link(placement);placement.parent=root
for o in list(sc.objects):
    if o not in [root,placement]:o.parent=placement
placement.location=(4,0,-3.6);root.rotation_euler.z=-math.pi/2;root.scale=(1.8,)*3
root['npc']='passive-frigate';root['sails']='fully lowered';root['sail_direction']='forward';root['stern_flag']='White Ensign';root['forward_axis']='-Z';root['collision_radius']=56;root['source']='royal-navy-frigate.blend'
for o in sc.objects:o.select_set(True)
path=ROOT/'assets/trade-winds/models/royal-navy-frigate.glb'
with contextlib.redirect_stdout(io.StringIO()):
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_apply=False,export_animations=True,export_animation_mode='SCENE',export_frame_range=True,export_anim_slide_to_zero=True,export_frame_step=3,export_morph=True,export_morph_animation=True,export_morph_normal=False,export_lights=True,export_import_convert_lighting_mode='RAW',export_pointer_animation=False,export_nla_strips_merged_animation_name='Royal frigate sailing')
    runpy.run_path(str(ROOT/'models/trade-winds/pack-harbor-glb.py'))['pack'](path,'Royal frigate sailing')
import shutil
shutil.copy2(path,ROOT/'models/trade-winds/royal-navy-frigate.glb')
raw=path.read_bytes();import struct
doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
print(json.dumps({'file':str(path),'bytes':len(raw),'meshes':len(doc['meshes']),'primitives':sum(len(m['primitives']) for m in doc['meshes']),'animations':[a['name'] for a in doc.get('animations',[])],'nodes':len(doc['nodes'])}))
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
