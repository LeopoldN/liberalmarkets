"""Expand quantized normals for Godot; preserve original assets and animation.

Godot 4.7.2 rejects KHR_mesh_quantization. The harbor only uses it for
signed-byte normals. Decode these to standard glTF float vectors, leaving
positions, vertex colors, indices, cameras and animation data unchanged.
"""
import json
import struct


def convert(path):
    data = path.read_bytes()
    json_length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    if 'KHR_mesh_quantization' not in document.get('extensionsRequired', []):
        return
    binary_start = 20 + json_length
    binary_length = struct.unpack_from('<I', data, binary_start)[0]
    binary = bytearray(data[binary_start + 8:binary_start + 8 + binary_length])
    for accessor in document['accessors']:
        if accessor['componentType'] != 5120:
            continue
        assert accessor['type'] == 'VEC3' and accessor.get('normalized')
        assert 'sparse' not in accessor
        view = document['bufferViews'][accessor['bufferView']]
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', 3)
        expanded = bytearray(accessor['count'] * 12)
        for i in range(accessor['count']):
            normal = struct.unpack_from('<3b', binary, offset + i * stride)
            struct.pack_into('<3f', expanded, i * 12, *(max(-1, value / 127) for value in normal))
        binary.extend(b'\0' * (-len(binary) % 4))
        new_view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(expanded), 'target': 34962}
        document['bufferViews'].append(new_view)
        binary.extend(expanded)
        accessor['bufferView'] = len(document['bufferViews']) - 1
        accessor['componentType'] = 5126
        accessor['byteOffset'] = 0
        accessor.pop('normalized', None)
        accessor.pop('min', None)
        accessor.pop('max', None)
    for field in ['extensionsRequired', 'extensionsUsed']:
        document[field] = [name for name in document.get(field, []) if name != 'KHR_mesh_quantization']
        if not document[field]:
            document.pop(field)
    document['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    path.write_bytes(struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + struct.pack('<II', len(binary), 0x004E4942) + binary)
