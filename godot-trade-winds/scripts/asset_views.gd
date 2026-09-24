extends Node3D
## The original authored harbor and chart, loaded only on first visit.

var harbor_root: Node3D
var chart_root: Node3D
var harbor_camera: Camera3D
var chart_camera: Camera3D
var marker: MeshInstance3D

static func prepare_materials(root: Node) -> void:
	# A glTF material shared with a colorless primitive can lose its vertex-color
	# flag on import. Set it per surface from the actual mesh attribute arrays.
	for node in root.find_children("*", "MeshInstance3D", true, false):
		for surface in node.mesh.get_surface_count():
			var original = node.get_active_material(surface)
			if original is StandardMaterial3D:
				var material = original.duplicate()
				var colors = node.mesh.surface_get_arrays(surface)[Mesh.ARRAY_COLOR]
				material.vertex_color_use_as_albedo = colors != null and not colors.is_empty()
				material.vertex_color_is_srgb = false
				node.set_surface_override_material(surface,material)

static func animate_asset(root: Node) -> void:
	for node in root.find_children("*", "AnimationPlayer", true, false):
		var player: AnimationPlayer = node
		var merged = Animation.new()
		merged.length = 1.0
		for key in player.get_animation_list():
			if key == "RESET":
				continue
			var clip = player.get_animation(key)
			merged.length = maxf(merged.length, clip.length)
			for track in clip.get_track_count():
				clip.copy_track(track, merged)
		merged.loop_mode = Animation.LOOP_LINEAR
		var library = AnimationLibrary.new()
		library.add_animation("idle", merged)
		player.add_animation_library("voyage", library)
		player.play("voyage/idle")

func warm_light(root: Node3D, strength: float) -> void:
	var light = DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-48, -35, 0)
	light.light_energy = strength
	light.light_color = Color("ffe0b2")
	light.shadow_enabled = true
	root.add_child(light)

func show_harbor() -> void:
	hide_views()
	if not harbor_root:
		harbor_root = load("res://assets/models/clean-character-harbor.glb").instantiate()
		add_child(harbor_root)
		prepare_materials(harbor_root)
		warm_light(harbor_root, .8)
		var cameras = harbor_root.find_children("*", "Camera3D", true, false)
		if not cameras.is_empty():
			harbor_camera = cameras[0]
			harbor_camera.keep_aspect = Camera3D.KEEP_HEIGHT
		else:
			harbor_camera = Camera3D.new()
			harbor_root.add_child(harbor_camera)
			harbor_camera.position = Vector3(-6,4.3,8.8)
			harbor_camera.look_at(Vector3(0,3,-5))
		animate_asset(harbor_root)
	harbor_root.visible = true
	harbor_root.process_mode = Node.PROCESS_MODE_INHERIT
	harbor_camera.make_current()

func show_chart(ship_position: Vector3) -> void:
	hide_views()
	if not chart_root:
		chart_root = load("res://assets/models/west-indies-chart.glb").instantiate()
		add_child(chart_root)
		prepare_materials(chart_root)
		warm_light(chart_root, .65)
		chart_camera = Camera3D.new()
		chart_root.add_child(chart_camera)
		chart_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		chart_camera.size = 134
		chart_camera.position = Vector3(-20,145,105)
		chart_camera.look_at(Vector3(-20,0,-2))
		var mesh = CylinderMesh.new()
		mesh.top_radius = 0.8
		mesh.bottom_radius = 0.8
		mesh.height = 3
		marker = MeshInstance3D.new()
		marker.mesh = mesh
		var material = StandardMaterial3D.new()
		material.albedo_color = Color("a12c36")
		material.emission_enabled = true
		material.emission = Color("792632")
		marker.material_override = material
		chart_root.add_child(marker)
		var label = Label3D.new()
		label.text = "YOU"
		label.font_size = 32
		label.pixel_size = .09
		label.position.y = 3.2
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true
		marker.add_child(label)
	var lon = ship_position.x / 220 - 80
	var lat = 22 - ship_position.z / 220
	marker.position = Vector3((lon+103)/46*120-60,4,(32-lat)/26*72-36)
	chart_root.visible = true
	chart_camera.make_current()

func hide_views() -> void:
	for root in [harbor_root, chart_root]:
		if is_instance_valid(root):
			root.visible = false
			root.process_mode = Node.PROCESS_MODE_DISABLED
