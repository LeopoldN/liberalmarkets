extends Node3D
## Stream a bounded set of voxel chunks from the original geographic coastline.

const CELL = 10.0
const CHUNK = 160.0
var definitions: Dictionary
var coast: Array = []
var occupancy: Dictionary = {}
var chunks: Dictionary = {}
var center_chunk = Vector2i(99999, 99999)
var ocean: MultiMeshInstance3D
var water_material: ShaderMaterial
var terrain_material: StandardMaterial3D
var cube = BoxMesh.new()
var harbor: Vector3
var anchor: Vector3
var normal: Vector3

func _ready() -> void:
	definitions = JSON.parse_string(FileAccess.get_file_as_string("res://assets/world.json"))
	var h: Dictionary = definitions.harbor
	harbor = Vector3(h.x, 0, h.z)
	anchor = Vector3(h.land.x, 0, h.land.z)
	normal = Vector3(h.normal.x, 0, h.normal.z)
	var rings: Array = JSON.parse_string(FileAccess.get_file_as_string("res://assets/coast.json"))
	for ring in rings:
		var points = PackedVector2Array()
		for p in ring:
			points.append(Vector2((p[0] + 80) * 220, (22 - p[1]) * 220))
		var bounds = Rect2(points[0], Vector2.ZERO)
		for p in points:
			bounds = bounds.expand(p)
		coast.append({"points": points, "bounds": bounds.grow(0.01)})
	cube.size = Vector3.ONE
	terrain_material = StandardMaterial3D.new()
	terrain_material.vertex_color_use_as_albedo = true
	terrain_material.roughness = 1.0
	var port = batch(definitions.portBlocks)
	port.position = anchor
	port.rotation.y = atan2(normal.x, normal.z)
	add_child(port)
	make_ocean()
	var sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -35, 0)
	sun.light_color = Color("ffe0b5")
	sun.light_energy = .8
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 900
	add_child(sun)
	var label = Label3D.new()
	label.text = "PORT ROYAL"
	label.font_size = 32
	label.pixel_size = 0.18
	label.modulate = Color("ffe6ae")
	label.outline_modulate = Color("14232b")
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.position = anchor + Vector3(0, 65, 0)
	add_child(label)

func batch(parts: Array) -> MultiMeshInstance3D:
	var instance = MultiMeshInstance3D.new()
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = cube
	mm.instance_count = parts.size()
	for i in parts.size():
		var p: Dictionary = parts[i]
		var m: Array = p.matrix
		mm.set_instance_transform(i, Transform3D(Basis(Vector3(m[0],m[1],m[2]),Vector3(m[4],m[5],m[6]),Vector3(m[8],m[9],m[10])),Vector3(m[12],m[13],m[14])))
		mm.set_instance_color(i, Color(p.color[0], p.color[1], p.color[2]))
	instance.multimesh = mm
	instance.material_override = terrain_material
	return instance

func is_land(point: Vector3) -> bool:
	var p = Vector2(point.x, point.z)
	for polygon in coast:
		if polygon.bounds.has_point(p) and Geometry2D.is_point_in_polygon(p, polygon.points):
			return true
	return false

func tile_land(ix: int, iz: int) -> bool:
	var key = Vector2i(ix, iz)
	if not occupancy.has(key):
		occupancy[key] = is_land(Vector3((ix + 0.5) * CELL, 0, (iz + 0.5) * CELL))
	return occupancy[key]

func hull_clear(point: Vector3, heading: float) -> bool:
	var basis = Basis(Vector3.UP, heading)
	for z in [-20.0, -8.0, 5.0, 13.0]:
		for x in [-7.0, 0.0, 7.0]:
			if is_land(point + basis * Vector3(x, 0, z)):
				return false
	return true

func hash2(x: float, z: float) -> float:
	return fposmod(sin(x * 127.1 + z * 311.7) * 43758.5453, 1.0)

func add_block(parts: Array, pos: Vector3, size: Vector3, color: Color) -> void:
	parts.append({"matrix": [size.x,0,0,0,0,size.y,0,0,0,0,size.z,0,pos.x,pos.y,pos.z,1], "color": [color.r,color.g,color.b]})

func build_chunk(cx: int, cz: int) -> Node3D:
	var parts: Array = []
	for a in 16:
		for b in 16:
			var ix = cx * 16 + a
			var iz = cz * 16 + b
			var p = Vector3((ix + 0.5) * CELL, 0, (iz + 0.5) * CELL)
			if not tile_land(ix, iz):
				if tile_land(ix+1, iz) or tile_land(ix-1, iz) or tile_land(ix, iz+1) or tile_land(ix, iz-1):
					add_block(parts, p + Vector3(0,-2.6,0), Vector3(10,3,10), Color("abbc8a").srgb_to_linear())
				continue
			var depth = 0
			for distance in [1,2,4,7]:
				if tile_land(ix+distance,iz) and tile_land(ix-distance,iz) and tile_land(ix,iz+distance) and tile_land(ix,iz-distance):
					depth += 1
			var n = (sin(ix*.23)+cos(iz*.18)+sin(ix*.12+iz*.15)+3)/6
			var height = 6.0 + depth*4 + floor(n*depth*6/4)*4
			var near_port = p.distance_to(anchor) < 100
			if near_port:
				height = 6
				depth = 0
			var r = hash2(ix, iz)
			var ground = Color("d6cb94") if depth == 0 else Color("8d8856")
			add_block(parts, p + Vector3(0,height/2-2,0),Vector3(10,height+4,10),ground.srgb_to_linear())
			if depth > 0:
				var greens = [Color("5c8645"),Color("6e914a"),Color("769951"),Color("648944")]
				add_block(parts,p+Vector3(0,height+.6,0),Vector3(10,1.2,10),greens[int(r*4)].srgb_to_linear())
			if r > .945 and not near_port:
				var trees: Array = definitions.palmBlocks if depth < 2 else definitions.canopyBlocks
				for block in trees:
					var copy: Dictionary = block.duplicate(true)
					copy.matrix[12] += p.x
					copy.matrix[13] += height
					copy.matrix[14] += p.z
					parts.append(copy)
	return batch(parts)

func update_chunks(position_: Vector3) -> void:
	var center = Vector2i(floor(position_.x/CHUNK),floor(position_.z/CHUNK))
	if center == center_chunk:
		return
	center_chunk = center
	var needed: Dictionary = {}
	for x in range(-3,4):
		for z in range(-3,4):
			var key = center + Vector2i(x,z)
			needed[key] = true
			if not chunks.has(key):
				var chunk = build_chunk(key.x,key.y)
				add_child(chunk)
				chunks[key] = chunk
	for key in chunks.keys():
		if not needed.has(key):
			chunks[key].queue_free()
			chunks.erase(key)
	if occupancy.size() > 160000:
		occupancy.clear()

func make_ocean() -> void:
	ocean = MultiMeshInstance3D.new()
	var tile = BoxMesh.new()
	tile.size = Vector3(12,18,12)
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = tile
	mm.instance_count = 10000
	for x in 100:
		for z in 100:
			mm.set_instance_transform(x*100+z,Transform3D(Basis.IDENTITY,Vector3((x-50)*12,-8.55,(z-50)*12)))
	ocean.multimesh = mm
	water_material = ShaderMaterial.new()
	water_material.shader = load("res://shaders/ocean.gdshader")
	ocean.material_override = water_material
	ocean.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(ocean)

func update_ocean(p: Vector3, time: float) -> void:
	ocean.position = Vector3(round(p.x/12)*12,0,round(p.z/12)*12)
	water_material.set_shader_parameter("sea_time",time)

static func wave_height(p: Vector3, time: float) -> float:
	var lon = p.x/220-80
	var lat = 22-p.z/220
	var edge = [[-82,29],[-80,25],[-76,23],[-70,20.7],[-65,19.3],[-62,18],[-60,10]]
	var border = 29.0
	for i in range(1,edge.size()):
		border += (edge[i][1]-edge[i-1][1])*clampf((lon-edge[i-1][0])/(edge[i][0]-edge[i-1][0]),0,1)
	var atlantic = smoothstep(-82,-80.8,lon)*smoothstep(-.5,.5,lat-border)
	var swell = sin(p.x*.036+p.z*.021-time*.85)*.34+sin(p.z*.057-p.x*.014+time*.61)*.23
	var rough = sin(p.x*.015+p.z*.023-time*1.55)*1.8+sin(p.z*.044-p.x*.028+time*1.19)*.8
	return ((swell+.6)*5-.5)*.18-.8+atlantic*(swell*1.8+rough)
