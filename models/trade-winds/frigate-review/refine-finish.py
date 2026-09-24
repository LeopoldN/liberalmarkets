import bpy,math,random
from mathutils import Vector
src=open('/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds/frigate-review/rebuild-hull.py').read()
exec(src[src.index('groups={}'):src.index('# Occupied')])
for i,m in enumerate(copper):
    c=(.19+i*.006,.047+i*.0025,.019+i*.0015,1);m.diffuse_color=c;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=c
shell=bpy.data.objects['Closed copper shell']
for k in range(0,len(shell.data.vertices),8):
    vv=shell.data.vertices[k:k+8];center=sum((v.co for v in vv),Vector())/8
    for v in vv:
        v.co.x=center.x+(v.co.x-center.x)*(.24/.234)
        v.co.y=center.y+(v.co.y-center.y)*(.24/.234)
    ix=math.floor((center.x+.36*(round(center.z/.24)%2))/.72);iy=math.floor(center.y/.72);iz=round(center.z/.24)
    mi=(ix*13+iy*7+iz*3)%6
    for p in shell.data.polygons[k//8*6:k//8*6+6]:p.material_index=mi
# Small relief ornaments sit against the enclosed black gallery.
for j in range(-12,13):
    y=j*.30;z=6.83+.70*max(0,1-(y/3.9)**2)
    if j%2==0:
        for dy,dz in [(0,0),(-.065,.08),(.065,.08),(-.065,-.08),(.065,-.08)]:box('Gilded crown scroll',(21.82,y+dy,z+dz),(.12,.09,.075),gold,'Stern gallery')
for j in range(-13,14):
    y=j*.31
    box('Lower gallery black frieze',(21.78,y,4.10),(.15,.32,.3),tar,'Stern gallery')
    for dy,dz in [(0,0),(-.07,.07),(.07,.07),(-.07,-.07),(.07,-.07)]:box('Lower gold diamond frieze',(21.9,y+dy,4.10+dz),(.07,.065,.06),gold,'Stern gallery')
for side in [-1,1]:
    for z in [4.56+i*.18 for i in range(12)]:
        y=side*(4.18+.1*math.sin(z*7));box('Carved corner pilasters',(21.79,y,z),(.22,.20,.13),gold,'Stern gallery')
    for dz,w in [(0,.72),(.12,.56),(.24,.38),(.34,.18)]:box('Lantern pagoda cap',(21.35,side*3.85,8.12+dz),(w,w,.09),darkgold if dz==0 else gold,'Stern gallery')
for (collection,n),(vs,fs,ms,ids) in groups.items():
    me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs)
    for m in ms:me.materials.append(m)
    for p,i in zip(me.polygons,ids):p.material_index=i
    o=bpy.data.objects.new(n,me);bpy.data.collections[collection].objects.link(o)
bpy.ops.wm.save_as_mainfile(filepath='/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds/royal-navy-frigate.blend')
