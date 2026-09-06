"""Add wind deformation to the existing frigate canvas without rebuilding it."""
import bpy, bmesh, math, shutil
from pathlib import Path
from mathutils import Vector
HERE = Path(__file__).resolve().parent
SOURCES = [HERE/'british-frigate.blend', Path('/Users/nick/Documents/Blender/PirateHarbor_Rebuild/Voxel_Frigate_1812.blend')]
H = Vector((-math.sin(.36), math.cos(.36), 0))
N = Vector((math.cos(.36), math.sin(.36), 0))
SAILS = [(mx,top*frac,w*scale,top*ht) for mx,top,w in [(-5.8,20.4,7),(0,24.1,10.7),(6,22,9.3)]
         for frac,scale,ht in [(.48,1,.225),(.70,.8,.18),(.855,.56,.115),(.955,.36,.068)]]
def square(p):
    candidates=[]
    for index,(mx,z,w,h) in enumerate(SAILS):
        delta=p-Vector((mx,0,z));v=-delta.z/h
        u=.5+delta.dot(H)/(w*(1+.1*max(0,v)))
        score=abs(delta.dot(N)-.44*math.sin(math.pi*u)*math.sin(math.pi*v))
        score+=20*(max(0,-u,u-1)+max(0,-v,v-1.04))
        candidates.append((score,index,u,v))
    _,index,u,v=min(candidates)
    u=max(0,min(1,u));v=max(0,min(1,v))
    envelope=math.sin(math.pi*u)*v
    return N, envelope, u*5-v*4+index*.71

def staysail(p):
    # Triangular headsails are pinned along all three edges.
    if p.x>0:
        tris=[((6.25,17.6),(15.7,7.2),(8,8.8)),((7.1,20.6),(16.8,7.5),(12.9,9.5))]
        candidates=[]
        for i,(a,b,c) in enumerate(tris):
            ax,az=a;bx,bz=b;cx,cz=c
            d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz)
            u=((bz-cz)*(p.x-cx)+(cx-bx)*(p.z-cz))/d
            v=((cz-az)*(p.x-cx)+(ax-cx)*(p.z-cz))/d
            w=1-u-v
            penalty=sum(max(0,-t,t-1) for t in (u,v,w))
            # Shared XZ regions: distinguish each cloth's authored Y bulge.
            y=(.05 if i else 0)+.27*math.sin(math.pi*v)*math.sin(math.pi*w)
            candidates.append((penalty*100+abs(p.y-y),u,v,w,i))
        _,u,v,w,i=min(candidates)
        envelope=max(0,27*u*v*w) if min(u,v,w)>=0 else 0
        return Vector((0,1,0)),envelope,p.x*.6+p.z*.4+i
    u=max(0,min(1,(-p.x-5.85)/4.15))
    lower=8.85+1.45*u;upper=13.95+1.25*u
    v=max(0,min(1,(p.z-lower)/(upper-lower)))
    return Vector((0,1,0)),math.sin(math.pi*u)*math.sin(math.pi*v),u*5+v*4

for source in SOURCES:
    backup=source.with_name(source.stem+'_Before_Sail_Animation.blend')
    if not backup.exists():shutil.copy2(source,backup)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    for prefix,mapper in [('Frigate Canvas',square),('Frigate Staysails',staysail)]:
        objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(prefix)]
        if any(o.get('wind_animated') for o in objects):continue
        # The gaff canvas was one large quad. Give it interior cloth vertices.
        if prefix.endswith('Staysails'):
            for ob in objects:
                bm=bmesh.new();bm.from_mesh(ob.data)
                edges=set(e for f in bm.faces if len(f.verts)==4 and f.calc_area()>2 for e in f.edges)
                if edges:bmesh.ops.subdivide_edges(bm,edges=list(edges),cuts=14,use_grid_fill=True)
                bm.to_mesh(ob.data);bm.free()
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join();ob=bpy.context.object;ob.name=prefix+' | Wind animated'
        ob.shape_key_add(name='Basis')
        mapping=[mapper(v.co) for v in ob.data.vertices]
        for name,phase in [('Wind sine',0),('Wind cosine',math.pi/2)]:
            key=ob.shape_key_add(name=name);key.slider_min=-1
            for i,(direction,envelope,spatial) in enumerate(mapping):
                displacement=envelope*(.28*math.sin(spatial*.45+phase)+.09*math.sin(spatial*2+phase))
                key.data[i].co+=direction*displacement
            for frame in range(1,194,3):
                key.value=math.sin(4*math.pi*(frame-1)/192+phase)
                key.keyframe_insert('value',frame=frame)
        ob['wind_animated']=True
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    print('SAILS ANIMATED',source)
