"""Export the currently open Belize source through Blender (including Blender MCP).

Open models/trade-winds/belize-town.blend, then execute this file. The exporter
builds a separate scene, samples the authored controls, and never edits/saves the
source. Static parts are batched beneath their nearest moving control. The
adjacent pack-harbor-glb.py quantizes colors/normals before gzip compression.
"""
import bpy, bmesh, math, json, runpy, gzip
from pathlib import Path
from collections import defaultdict
from mathutils import Vector, Matrix

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUTPUT = ROOT / 'assets/trade-winds/models/belize-town.glb'
META = ROOT / 'assets/trade-winds/belize/scene.json'
EXCLUDE = {'Water', 'Sea15 | continuous wave surface', 'Distant atmospheric depth',
           'Sun33 | soft atmospheric aureole'}
CABLES = {'Crane14 | running hoist cable', 'Skiff14 | bow painter'}
NAMES = {
 'Idle42 | Merchant breathing': 'belize_merchant',
 'Idle42 | Merchant camera gaze': 'belize_merchant_head',
 'Walk44 | Forward travel along the quay': 'belize_carrier_travel',
 'Walk44 | Supported upper body and carried crate': 'belize_carrier_body',
 'Motion43 | Frigate gentle sea motion': 'belize_frigate',
 'Motion43 | Horizon ship sea motion': 'belize_horizon_ship',
 'Motion43 | Moored rowboat sea motion': 'belize_rowboat',
 'Motion43 | Crane boom restrained sway': 'belize_crane_boom',
 'Motion43 | Crane suspended cargo pendulum': 'belize_crane_load',
 'Lantern41 | Left suspension pivot': 'belize_lantern_left',
 'Lantern41 | Right suspension pivot': 'belize_lantern_right',
}

def export_belize():
 source = bpy.context.scene
 assert source.objects.get('Walk44 | Forward travel along the quay'), 'Open belize-town.blend first'
 previous_frame = source.frame_current
 before = {kind:set(getattr(bpy.data,kind)) for kind in ['objects','meshes','curves','materials','actions','cameras','scenes']}
 staging = bpy.data.scenes.new('Belize export staging')
 try:
  source.frame_set(1);bpy.context.view_layer.update()
  visible=[o for o in source.objects if not o.hide_render and o.visible_get()
           and not any(c.hide_render for c in o.users_collection) and o.name not in EXCLUDE]
  movers={o for o in visible if o.animation_data and o.animation_data.action and o.type in {'EMPTY','MESH'}}
  def parent_mover(o, include=False):
   p=o if include else o.parent
   while p:
    if p in movers:return p
    p=p.parent
   return None
  controls={}
  for o in movers:
   target=bpy.data.objects.new(NAMES.get(o.name,o.name.replace(' | ','_').replace(' ','_')),None)
   target['sourceName']=o.name
   if o.name.startswith(('Walk44 |','Worker21 |')):target['belizeCarrier']=True
   staging.collection.objects.link(target);controls[o]=target
  for o,target in controls.items():
   p=parent_mover(o)
   if p:target.parent=controls[p]
  # Animated ropes use small articulated cylinder segments, retaining every anchor.
  cable_rigs=[]
  for name in CABLES:
   o=source.objects[name]
   for i in range(len(o.data.splines[0].points)-1):
    r=bpy.data.objects.new('belize_cable_'+('hoist' if 'Crane' in name else 'mooring')+'_'+str(i),None)
    staging.collection.objects.link(r);cable_rigs.append((o,i,r))
  # Sample native transforms before geometry is batched. Curve material/light
  # flicker is supplied by the runtime using the source's exact periodic formula.
  for frame in range(1,194):
   source.frame_set(frame);bpy.context.view_layer.update()
   for o,target in controls.items():
    p=parent_mover(o);m=o.matrix_world.copy()
    if p:m=p.matrix_world.inverted_safe()@m
    target.rotation_mode='QUATERNION';target.location,target.rotation_quaternion,target.scale=m.decompose()
    for path in ['location','rotation_quaternion','scale']:target.keyframe_insert(data_path=path,frame=frame)
   for o,i,r in cable_rigs:
    pts=o.data.splines[0].points;a=o.matrix_world@Vector(pts[i].co[:3]);b=o.matrix_world@Vector(pts[i+1].co[:3]);d=b-a
    r.location=(a+b)*.5;r.rotation_mode='QUATERNION';r.rotation_quaternion=d.to_track_quat('Z','Y');r.scale=(o.data.bevel_depth,o.data.bevel_depth,d.length)
    for path in ['location','rotation_quaternion','scale']:r.keyframe_insert(data_path=path,frame=frame)
  source.frame_set(1);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
  print('BELIZE: sampled',len(controls),'controls and',len(cable_rigs),'rope segments',flush=True)
  materials={};batches={};mat_cache={}
  def surface(kind):
   if kind in materials:return materials[kind]
   m=bpy.data.materials.new('Belize '+kind);m.use_nodes=True;m['belizeSurface']=kind
   p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(1,1,1,1);p.inputs['Roughness'].default_value=.72;p.inputs['Metallic'].default_value=.5 if kind=='metal' else 0
   color=m.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='BelizeColor';m.node_tree.links.new(color.outputs['Color'],p.inputs['Base Color'])
   if kind.startswith('flame') or kind=='sun':
    p.inputs['Emission Color'].default_value=(1,.42,.055,1) if kind.startswith('flame') else (1,.8,.4,1);p.inputs['Emission Strength'].default_value=8 if kind.startswith('flame') else 10
   if kind=='glass':
    p.inputs['Base Color'].default_value=(.92,.65,.3,.16);p.inputs['Alpha'].default_value=.16;p.inputs['Roughness'].default_value=.12;m.surface_render_method='DITHERED'
   if kind=='sky':
    m.node_tree.nodes.remove(p);m.node_tree.links.new(color.outputs['Color'],m.node_tree.nodes['Material Output'].inputs['Surface'])
   materials[kind]=m;return m
  def pigment(mat):
   if mat in mat_cache:return mat_cache[mat]
   p=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat and mat.use_nodes else None
   rgba=tuple(p.inputs['Base Color'].default_value) if p else tuple(mat.diffuse_color) if mat else (.4,.25,.12,1)
   name=mat.name if mat else ''
   kind='wood' if 'oak' in name.lower() or name.startswith('Ref timber') else 'metal' if p and p.inputs['Metallic'].default_value>.4 else 'pigment'
   if 'thin amber glass' in name or name=='Lantern glass':kind='glass'
   if 'animated flame' in name:kind='flame_left' if 'Left' in name else 'flame_right'
   elif p and p.inputs['Emission Strength'].default_value>2:kind='flame'
   if name=='Sun disc':kind='sun'
   if name=='Lavender peach sunset sky':kind='sky'
   axis=0 if 'grain X' in name else 1 if 'grain Y' in name else 2
   mat_cache[mat]=(rgba,kind,axis);return rgba,kind,axis
  def add_geometry(o, world, owner):
   if o.type not in {'MESH','CURVE'} or o.name in CABLES:return
   evaluated=o.evaluated_get(deps) if hasattr(o,'evaluated_get') else o
   mesh=evaluated.to_mesh()
   if not mesh or not mesh.polygons:
    evaluated.to_mesh_clear();return
   if len(mesh.polygons)>1500:
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.dissolve_limit(bm,angle_limit=.025,use_dissolve_boundaries=False,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})
    bm.to_mesh(mesh);bm.free();mesh.update()
   transform=(owner.matrix_world.inverted_safe()@world) if owner else world
   mats=[pigment(m) for m in mesh.materials] or [((.4,.25,.12,1),'pigment',2)]
   kinds=set(v[1] for v in mats)
   for kind in kinds:
    key=(owner,kind)
    batch=batches.setdefault(key,{'vertices':[],'faces':[],'colors':[],'uv':[],'smooth':[]})
    base=len(batch['vertices']);batch['vertices'].extend(tuple(transform@v.co) for v in mesh.vertices)
    for poly in mesh.polygons:
     rgba,pk,axis=mats[min(poly.material_index,len(mats)-1)]
     if pk!=kind:continue
     batch['faces'].append(tuple(base+i for i in poly.vertices));batch['smooth'].append(poly.use_smooth)
     n=poly.normal;transverse=next((j for j in sorted(range(3),key=lambda j:abs(n[j])) if j!=axis),0)
     for vi in poly.vertices:
      v=mesh.vertices[vi].co
      batch['colors'].extend(rgba[:3]+(1.,))
      if kind=='sky':
       w=world@v;batch['uv'].extend(((w.x+90)/180,(w.z+11)/70))
      elif kind=='wood':batch['uv'].extend((v[transverse],v[axis]))
      else:batch['uv'].extend((0.,0.))
   evaluated.to_mesh_clear()
  # Visible instance geometry remains under the moving horizon-ship control.
  for o in visible:
   if o.type not in {'MESH','CURVE'}:continue
   add_geometry(o,o.matrix_world,parent_mover(o,True))
  for instance in deps.object_instances:
   if instance.is_instance and instance.parent and instance.parent.original.name=='Distant frigate on horizon':
    o=instance.object.original
    if o.type in {'MESH','CURVE'}:add_geometry(o,instance.matrix_world,parent_mover(source.objects['Distant frigate on horizon'],True))
  for (owner,kind),batch in batches.items():
   if not batch['faces']:continue
   me=bpy.data.meshes.new('Belize '+kind+' batch');me.from_pydata(batch['vertices'],[],batch['faces']);me.update()
   colors=me.color_attributes.new(name='BelizeColor',type='BYTE_COLOR',domain='CORNER');colors.data.foreach_set('color',batch['colors'])
   uv=me.uv_layers.new(name='BelizeUV');uv.data.foreach_set('uv',batch['uv'])
   for p,sm in zip(me.polygons,batch['smooth']):p.use_smooth=sm
   me.materials.append(surface(kind));obj=bpy.data.objects.new((controls[owner].name if owner else 'Belize_static')+'_'+kind,me);staging.collection.objects.link(obj)
   if owner:obj.parent=controls[owner]
  for o,i,r in cable_rigs:
   verts=[(math.cos(j*math.tau/8),math.sin(j*math.tau/8),z) for z in [-.5,.5] for j in range(8)]
   faces=[(j,(j+1)%8,(j+1)%8+8,j+8) for j in range(8)]+[tuple(range(7,-1,-1)),tuple(range(8,16))]
   me=bpy.data.meshes.new('Belize moving rope');me.from_pydata(verts,[],faces);me.update();me.materials.append(surface('pigment'));co=me.color_attributes.new(name='BelizeColor',type='BYTE_COLOR',domain='CORNER');co.data.foreach_set('color',[.25,.14,.06,1]*len(me.loops));ob=bpy.data.objects.new(r.name+'_rope',me);staging.collection.objects.link(ob);ob.parent=r
  cam=bpy.data.objects.new('Belize authored camera',source.camera.data.copy());staging.collection.objects.link(cam);cam.matrix_world=source.camera.matrix_world.copy();cam['compositionAspect']=source.render.resolution_x/source.render.resolution_y;cam['authoredBelize']=True;staging.camera=cam
  for side,name,phase in [('left','Point',.12),('right','Point.001',1.37)]:
   o=source.objects[name];p=parent_mover(o);anchor=bpy.data.objects.new('belize_lamp_'+side,None);staging.collection.objects.link(anchor)
   if p:anchor.parent=controls[p];anchor.matrix_local=p.matrix_world.inverted_safe()@o.matrix_world
   else:anchor.matrix_world=o.matrix_world.copy()
   anchor['lamp']=True;anchor['lampPower']=48.;anchor['lampColor']=list(o.data.color);anchor['flickerPhase']=phase
  staging.frame_start=1;staging.frame_end=193;staging.render.fps=24;staging.frame_set(1)
  bpy.context.window.scene=staging;bpy.context.view_layer.update()
  print('BELIZE: exporting',len(batches),'batches',sum(len(b['faces']) for b in batches.values()),'faces',flush=True)
  OUTPUT.parent.mkdir(parents=True,exist_ok=True)
  bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format='GLB',use_active_scene=True,export_cameras=True,export_extras=True,export_animations=True,export_animation_mode='SCENE',export_frame_range=True,export_anim_slide_to_zero=True,export_frame_step=1,export_nla_strips_merged_animation_name='Belize harbor activity')
  runpy.run_path(str(HERE/'pack-harbor-glb.py'))['pack'](OUTPUT,'Belize harbor activity')
  # Separate the one-way walk from cyclic ambience without changing its keys.
  import struct
  raw=OUTPUT.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:];clips=[]
  for original in doc.get('animations',[]):
   for label,carrier in [('Belize ambient',False),('Belize cargo delivery',True)]:
    selected=[ch for ch in original['channels'] if bool(doc['nodes'][ch['target']['node']].get('extras',{}).get('belizeCarrier'))==carrier]
    if selected:clips.append({'name':label,'samplers':original['samplers'],'channels':selected})
  doc['animations']=clips
  encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
  OUTPUT.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary)
  metadata={'version':1,'source':'models/trade-winds/belize-town.blend','asset':'assets/trade-winds/models/belize-town.glb.gz','duration':8,'fps':24,'waterLevel':-.5,'compositionAspect':1672/941,'surfaceKinds':sorted(materials),'drawBatches':len(batches),'ambientClip':'Belize ambient','carrierClip':'Belize cargo delivery','carrierPlayback':'once per visit, forward only','lights':2}
  META.parent.mkdir(parents=True,exist_ok=True);META.write_text(json.dumps(metadata,indent=2)+'\n')
  compressed=OUTPUT.with_suffix('.glb.gz')
  compressed.write_bytes(gzip.compress(OUTPUT.read_bytes(),compresslevel=9,mtime=0))
  OUTPUT.unlink()
  print('BELIZE_EXPORTED',compressed.stat().st_size,json.dumps(metadata),flush=True)
 finally:
  bpy.context.window.scene=source;source.frame_set(previous_frame)
  for kind in ['objects','scenes','meshes','curves','materials','actions','cameras']:
   data=getattr(bpy.data,kind)
   for item in set(data)-before[kind]:
    if kind in ['objects','scenes']:data.remove(item,do_unlink=True)
    elif item.users==0:data.remove(item)

if __name__=='__main__':export_belize()
