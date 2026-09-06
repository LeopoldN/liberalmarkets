import bpy, math, random
from mathutils import Vector

MATERIALS = {}
def palette(color, variation=.15, metal=0, emission=0):
    return [(tuple(c*(1+variation*(i-4)/4) for c in color),metal,emission) for i in range(9)]

def material(metal, emission):
    key=(metal,emission)
    if key not in MATERIALS:
        m=bpy.data.materials.new('Voxel pigment' if not metal and not emission else f'Pigment metal {metal} glow {emission}')
        m.use_nodes=True
        p=m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value=(1,1,1,1)
        p.inputs['Roughness'].default_value=.84
        p.inputs['Metallic'].default_value=metal
        c=m.node_tree.nodes.new('ShaderNodeVertexColor');c.layer_name='VoxelColor'
        m.node_tree.links.new(c.outputs['Color'],p.inputs['Base Color'])
        if emission:
            p.inputs['Emission Color'].default_value=(1,.46,.075,1)
            p.inputs['Emission Strength'].default_value=emission
        MATERIALS[key]=m
    return MATERIALS[key]

class Mesh:
    def __init__(self,name,col):self.name=name;self.col=col;self.v=[];self.f=[];self.colors=[];self.matkeys=[]
    def face(self,pts,pal):
        rgba,metal,emission=random.choice(pal)
        i=len(self.v);self.v.extend(pts);self.f.append(tuple(range(i,i+len(pts))))
        self.colors.extend([(*rgba,1)]*len(pts));self.matkeys.append((metal,emission))
    def box(self,center,size,pal,cell=.16,rot=None):
        ctr=Vector(center)
        def tr(p):return tuple(ctr+(rot@Vector(p) if rot else Vector(p)))
        for axis in range(3):
            a=(axis+1)%3;b=(axis+2)%3
            na=max(1,round(size[a]/cell));nb=max(1,round(size[b]/cell))
            for side in [-1,1]:
                for i in range(na):
                    for j in range(nb):
                        pts=[]
                        for u,w in [(i,j),(i+1,j),(i+1,j+1),(i,j+1)]:
                            p=[0,0,0];p[axis]=side*size[axis]/2;p[a]=-size[a]/2+u*size[a]/na;p[b]=-size[b]/2+w*size[b]/nb;pts.append(tr(p))
                        if side<0:pts.reverse()
                        self.face(pts,pal)
    def voxels(self,occ,origin,cell,palette_at):
        dirs=[(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
        corners=[[(1,0,0),(1,1,0),(1,1,1),(1,0,1)],[(0,1,0),(0,0,0),(0,0,1),(0,1,1)],[(1,1,0),(0,1,0),(0,1,1),(1,1,1)],[(0,0,0),(1,0,0),(1,0,1),(0,0,1)],[(0,0,1),(1,0,1),(1,1,1),(0,1,1)],[(0,1,0),(1,1,0),(1,0,0),(0,0,0)]]
        for q in sorted(occ):
            pal=palette_at(q) if callable(palette_at) else palette_at
            for d,cs in zip(dirs,corners):
                if tuple(q[k]+d[k] for k in range(3)) not in occ:
                    self.face([tuple(origin[k]+(q[k]+c[k])*cell for k in range(3)) for c in cs],pal)
    def finish(self,parent=None):
        me=bpy.data.meshes.new(self.name);me.from_pydata(self.v,[],self.f)
        cols=me.color_attributes.new(name='VoxelColor',type='BYTE_COLOR',domain='CORNER')
        cols.data.foreach_set('color',[c for color in self.colors for c in color])
        keys=list(dict.fromkeys(self.matkeys))
        for k in keys:me.materials.append(material(*k))
        for p,k in zip(me.polygons,self.matkeys):p.material_index=keys.index(k)
        me.update();o=bpy.data.objects.new(self.name,me);self.col.objects.link(o)
        if parent:attach(o,parent)
        return o

def attach(obj,parent):
    bpy.context.view_layer.update()
    obj.parent=parent;obj.matrix_parent_inverse=parent.matrix_world.inverted()
    return obj
def box(name,center,size,pal,col,cell=.16,parent=None,rot=None):
    m=Mesh(name,col);m.box(center,size,pal,cell,rot);return m.finish(parent)
def beam(name,start,end,width,pal,col,depth=None,parent=None,cell=.16):
    a=Vector(start);b=Vector(end);q=(b-a).to_track_quat('Z','Y')
    return box(name,(a+b)/2,(width,depth or width,(b-a).length),pal,col,cell,parent,q)
def rope_line(name,start,end,pal,col,th=.07,parent=None,sag=.0):
    m=Mesh(name,col);a=Vector(start);b=Vector(end);n=max(2,int((b-a).length/(th*.9)))
    for i in range(n+1):
        t=i/n;p=a.lerp(b,t);p.z-=sag*math.sin(math.pi*t)
        m.box(p,(th,th,th),pal,th*2)
    return m.finish(parent)
