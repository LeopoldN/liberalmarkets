import bpy,os
from mathutils import Vector
sc=bpy.context.scene;root='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds/frigate-review'
sc.render.engine='BLENDER_EEVEE';sc.render.resolution_percentage=100
sc.render.image_settings.media_type='IMAGE';sc.render.image_settings.file_format='PNG'
sc.render.resolution_x=1400;sc.render.resolution_y=1000
ca=bpy.data.cameras.get('Review camera');cam=bpy.data.objects['Review camera'];ca.type='ORTHO';sc.camera=cam
views=[('broadside',(-5,-90,18),(-5,0,18),61),('bow',(-55,-26,24),(-16,0,5),22),('stern',(55,-25,24),(17,0,5),22),('bow-full',(-90,0,18),(0,0,18),53),('stern-full',(90,0,18),(0,0,18),53)]
for name,loc,target,scale in views:
    cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();ca.ortho_scale=scale
    sc.render.filepath=root+'/'+PREFIX+'-'+name+'.png';bpy.ops.render.render(write_still=True)
hidden={}
for c in ['Sails','Rigging','Masts and yards']:
    for o in bpy.data.collections[c].objects:hidden[o]=o.hide_render;o.hide_render=True
for name,loc,target,scale in [('overhead',(0,0,80),(0,0,0),48),('deck-oblique',(-20,-42,55),(-2,0,5),48)]:
    cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();ca.ortho_scale=scale
    if name=='overhead':cam.rotation_euler=(0,0,0)
    sc.render.filepath=root+'/'+PREFIX+'-'+name+'.png';bpy.ops.render.render(write_still=True)
for o,h in hidden.items():o.hide_render=h
sc.camera=bpy.data.objects['Concept camera']
print('Neutral renders '+PREFIX)
