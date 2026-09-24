import bpy,os
from mathutils import Vector
sc=bpy.context.scene
root='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds/frigate-review'
sc.render.engine='BLENDER_WORKBENCH'
sc.display.shading.light='STUDIO';sc.display.shading.studiolight_rotate_z=.4
sc.display.shading.color_type='MATERIAL';sc.display.shading.show_shadows=True
sc.display.shading.show_cavity=True;sc.display.shading.cavity_type='BOTH'
sc.display.shading.background_type='WORLD';sc.world.color=(.035,.062,.089)
sc.display.render_aa='16';sc.render.resolution_x=1400;sc.render.resolution_y=1000;sc.render.resolution_percentage=100
sc.render.image_settings.media_type='IMAGE';sc.render.image_settings.file_format='PNG'
ca=bpy.data.cameras.get('Review camera') or bpy.data.cameras.new('Review camera')
cam=bpy.data.objects.get('Review camera') or bpy.data.objects.new('Review camera',ca)
if not cam.users_collection:sc.collection.objects.link(cam)
ca.type='ORTHO';sc.camera=cam
for name,loc,target,scale in [('bow',(-55,-26,24),(-16,0,5),22),('stern',(55,-25,24),(17,0,5),22),('bow-end',(-75,0,9),(-15,0,5),17),('stern-end',(75,0,9),(17,0,5),17),('broadside',(-5,-90,18),(-5,0,18),61)]:
    cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();ca.ortho_scale=scale
    sc.render.filepath=root+'/'+PREFIX+'-'+name+'.png';bpy.ops.render.render(write_still=True)
sc.camera=bpy.data.objects['Concept camera']
print('Rendered '+PREFIX)
