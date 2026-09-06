"""Pack vertex colors/normals as normalized bytes; merge the actor clips.
No external decoder is needed: Three.js supports KHR_mesh_quantization.
"""
import json, struct, array
from pathlib import Path

def pack(path, clip_name="Living harbor sunset"):
    path=Path(path);raw=path.read_bytes()
    n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n])
    binary=raw[28+n:];roles={}
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            for name,index in primitive['attributes'].items():
                if name=='NORMAL' or name.startswith('COLOR_'):roles[index]=name
    by_view={a['bufferView']:i for i,a in enumerate(doc['accessors']) if 'bufferView' in a}
    output=bytearray()
    for vi,view in enumerate(doc['bufferViews']):
        start=view.get('byteOffset',0);data=binary[start:start+view['byteLength']]
        ai=by_view.get(vi);a=doc['accessors'][ai] if ai is not None else None
        if ai in roles and a['componentType']==5126 and not view.get('byteStride') and not a.get('byteOffset',0):
            values=array.array('f');values.frombytes(data)
            size=3 if a['type']=='VEC3' else 4
            packed=bytearray();normal=roles[ai]=='NORMAL'
            for i in range(0,len(values),size):
                for v in values[i:i+size]:
                    q=round(max(-1 if normal else 0,min(1,v))*(127 if normal else 255))
                    packed.append(q%256)
                if size==3:packed.append(0)
            data=packed;a['componentType']=5120 if normal else 5121;a['normalized']=True
            a.pop('min',None);a.pop('max',None);view['byteStride']=4
        while len(output)%4:output.append(0)
        view['byteOffset']=len(output);view['byteLength']=len(data);output.extend(data)
    while len(output)%4:output.append(0)
    doc['buffers'][0]['byteLength']=len(output)
    for key in ['extensionsUsed','extensionsRequired']:
        doc.setdefault(key,[])
        if 'KHR_mesh_quantization' not in doc[key]:doc[key].append('KHR_mesh_quantization')
    merged={'name':clip_name,'samplers':[],'channels':[]}
    for animation in doc.get('animations',[]):
        offset=len(merged['samplers']);merged['samplers'].extend(animation['samplers'])
        for c in animation['channels']:
            c['sampler']+=offset;merged['channels'].append(c)
    if merged['channels']:doc['animations']=[merged]
    encoded=json.dumps(doc,separators=(',',':')).encode()
    encoded+=b' '*((-len(encoded))%4)
    result=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(output))
    result+=struct.pack('<II',len(encoded),0x4e4f534a)+encoded
    result+=struct.pack('<II',len(output),0x004e4942)+output
    path.write_bytes(result)
    print('PACKED HARBOR',len(raw),'->',len(result),'bytes')

if __name__=='__main__':
    pack(Path(__file__).resolve().parents[2]/'assets/trade-winds/models/harbor-sunset.glb')
