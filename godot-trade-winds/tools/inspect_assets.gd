extends SceneTree

func _init() -> void:
	for path in ["trading-sloop", "west-indies-chart", "clean-character-harbor"]:
		var asset = load("res://assets/models/"+path+".glb").instantiate()
		root.add_child(asset)
		print(path)
		var meshes = asset.find_children("*","MeshInstance3D",true,false)
		for node in meshes.slice(0,2):
			var material = node.get_active_material(0)
			print(node.name, " ",material.albedo_color," vertex=",material.vertex_color_use_as_albedo," srgb=",material.vertex_color_is_srgb)
			var colors = node.mesh.surface_get_arrays(0)[Mesh.ARRAY_COLOR]
			if colors:
				print("colors ", colors.slice(0,3))
		asset.free()
	quit()
