extends Node3D
## Composition and screen transitions for the deliberately limited playable slice.

const World = preload("res://scripts/world.gd")
const Views = preload("res://scripts/asset_views.gd")
const Interface = preload("res://scripts/interface.gd")
const Voyage = preload("res://scripts/voyage.gd")
var world: Node3D
var views: Node3D
var ui: CanvasLayer
var boat: Node3D
var camera: Camera3D
var voyage = Voyage.new()
var mode = "sea"
var previous_mode = "sea"
var ship_position = Vector3.ZERO
var heading = 0.0
var speed = 0.0
var sea_time = 0.0
var zoom = 280.0
var target = Vector3.ZERO
var has_target = false
var notice_time = 0.0
var wake: MultiMeshInstance3D
var wake_points: Array = []
var wake_clock = 0.0
var sailing_audio: AudioStreamPlayer
var harbor_audio: AudioStreamPlayer
var coin_audio: AudioStreamPlayer
var muted = false

func _ready() -> void:
	var environment_node = WorldEnvironment.new()
	var environment = Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("183e49")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("b5d9e2")
	environment.ambient_light_energy = .35
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment_node.environment = environment
	add_child(environment_node)
	world = World.new()
	world.name = "SailingWorld"
	add_child(world)
	views = Views.new()
	views.name = "HarborAndChart"
	add_child(views)
	boat = load("res://assets/models/trading-sloop.glb").instantiate()
	boat.name = "TradingSloop"
	world.add_child(boat)
	Views.prepare_materials(boat)
	Views.animate_asset(boat)
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = zoom
	camera.far = 2200
	world.add_child(camera)
	camera.make_current()
	voyage.capacity = int(world.definitions.vessel.capacity)
	voyage.buy_price = int(world.definitions.rum.buy)
	voyage.sell_price = int(world.definitions.rum.sell)
	make_wake()
	ui = Interface.new()
	add_child(ui)
	ui.chart_requested.connect(toggle_chart)
	ui.dock_requested.connect(dock)
	ui.sail_requested.connect(leave_harbor)
	ui.return_requested.connect(return_to_port)
	ui.trade_requested.connect(trade)
	ui.sound_requested.connect(toggle_sound)
	sailing_audio = audio("res://assets/sounds/boat_sailing_loop.mp3",-22)
	harbor_audio = audio("res://assets/sounds/trade_post_main_background.mp3",-20)
	coin_audio = audio("res://assets/sounds/coin1.mp3",-12,false)
	return_to_port()
	# A deterministic smoke test exercises the same public actions as the UI.
	if "--smoke-test" in OS.get_cmdline_user_args():
		call_deferred("smoke_test")
	elif "--capture" in OS.get_cmdline_user_args():
		call_deferred("capture_views")

func audio(path: String, volume: float, looping: bool = true) -> AudioStreamPlayer:
	var player = AudioStreamPlayer.new()
	player.stream = load(path)
	player.stream.loop = looping
	player.volume_db = volume
	add_child(player)
	return player

func return_to_port() -> void:
	ship_position = world.harbor + world.normal*100
	heading = atan2(world.normal.x,world.normal.z)
	speed = 0
	has_target = false
	wake_points.clear()
	set_sea()
	world.update_chunks(ship_position)
	update_camera(1)
	notice("Welcome aboard. Hold W toward the quay, then press E to dock.")

func set_sea() -> void:
	mode = "sea"
	views.hide_views()
	world.visible = true
	boat.process_mode = Node.PROCESS_MODE_INHERIT
	camera.make_current()
	ui.set_mode(mode)

func dock() -> void:
	if mode != "sea" or ship_position.distance_to(world.harbor) > 90:
		return
	speed = 0
	has_target = false
	mode = "harbor"
	world.visible = false
	boat.process_mode = Node.PROCESS_MODE_DISABLED
	views.show_harbor()
	ui.set_mode(mode)
	notice("Welcome to Port Royal. Rum is a local export: 24 gold per barrel.")

func leave_harbor() -> void:
	if mode != "harbor":
		return
	ship_position = world.harbor + world.normal*95
	heading = atan2(-world.normal.x,-world.normal.z)
	speed = 0
	set_sea()
	notice("Fair winds, captain. Your cargo stays aboard for this voyage.")

func toggle_chart() -> void:
	if mode == "chart":
		if previous_mode == "harbor":
			mode = "harbor"
			views.show_harbor()
			ui.set_mode(mode)
		else:
			set_sea()
		return
	previous_mode = mode
	mode = "chart"
	world.visible = false
	boat.process_mode = Node.PROCESS_MODE_DISABLED
	views.show_chart(ship_position)
	ui.set_mode(mode)
	notice("Port Royal is the one active harbor in this voyage.")

func trade(buying: bool, quantity: int) -> void:
	if mode != "harbor":
		return
	var before = voyage.trade_count
	var result = voyage.transact(buying,quantity)
	if voyage.trade_count > before and not muted:
		coin_audio.play()
	notice(result)
	ui.refresh(voyage,ship_position.distance_to(world.harbor),speed,ship_position)

func notice(value: String) -> void:
	ui.message.text = value
	notice_time = 7

func toggle_sound() -> void:
	muted = not muted
	ui.sound_button.text = "Sound off" if muted else "Sound on"
	if muted:
		coin_audio.stop()

func _physics_process(dt: float) -> void:
	if mode != "sea":
		return
	sea_time += dt
	var throttle = 0.0
	var turn = 0.0
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP):
		throttle = 1
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN):
		throttle = -.35
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT):
		turn += 1
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT):
		turn -= 1
	if throttle != 0 or turn != 0:
		has_target = false
	if has_target:
		var difference = target-ship_position
		if difference.length() < 10:
			has_target = false
		else:
			var desired = atan2(-difference.x,-difference.z)
			turn = clampf(angle_difference(heading,desired)*2,-1,1)
			throttle = clampf(1-abs(angle_difference(heading,desired))*.4,.25,1)
	heading += turn*1.15*dt
	var wind = .9 + .1*cos(heading-.65)
	speed = move_toward(speed,throttle*float(world.definitions.vessel.speed)*wind,dt*14)
	var next = ship_position + Vector3(-sin(heading),0,-cos(heading))*speed*dt
	if not world.hull_clear(next,heading):
		speed = 0
		has_target = false
		if notice_time < 1:
			notice("Shallow water. Turn away from the coast.")
	elif next.x < -5060 or next.x > 5060 or next.z < -2200 or next.z > 3520:
		speed = 0
		has_target = false
		notice("The edge of this chart. Turn back toward the Caribbean.")
	else:
		ship_position = next
	boat.position = ship_position + Vector3(0,World.wave_height(ship_position,sea_time)-1.6,0)
	boat.rotation = Vector3(sin(sea_time*1.3)*.015,heading,sin(sea_time*1.6)*.025)
	world.update_ocean(ship_position,sea_time)
	world.update_chunks(ship_position)
	update_camera(dt)
	update_wake(dt)

func update_camera(dt: float) -> void:
	var aim = ship_position + Vector3(0,8,0)
	if ship_position.distance_to(world.harbor) < 230:
		aim += (world.harbor-ship_position).limit_length(55)
	camera.position = camera.position.lerp(aim+Vector3(220,280,350),minf(dt*5,1))
	camera.look_at(aim)
	camera.size = zoom

func _process(dt: float) -> void:
	if not ui:
		return
	ui.refresh(voyage,ship_position.distance_to(world.harbor),speed,ship_position)
	notice_time -= dt
	if notice_time <= 0:
		ui.message.text = "W/S sail  ·  A/D turn  ·  Space anchor  ·  Click sea to steer  ·  Scroll zoom" if mode == "sea" else "M chart  ·  E leave harbor" if mode == "harbor" else "M close chart  ·  Return to Port Royal for another short test"
	for track in [sailing_audio,harbor_audio]:
		var active = not muted and ((track == sailing_audio and mode == "sea" and abs(speed)>1) or (track == harbor_audio and mode == "harbor"))
		if active and not track.playing:
			track.play()
		elif not active and track.playing:
			track.stop()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_M:
			toggle_chart()
		elif event.physical_keycode == KEY_E:
			if mode == "harbor":
				leave_harbor()
			else:
				dock()
		elif event.physical_keycode == KEY_ESCAPE and mode != "sea":
			if mode == "chart":
				toggle_chart()
			else:
				leave_harbor()
		elif event.physical_keycode == KEY_SPACE:
			speed = 0
			has_target = false
	if event is InputEventMouseButton and event.pressed and mode == "sea":
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom = maxf(160,zoom-20)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom = minf(360,zoom+20)
		elif event.button_index == MOUSE_BUTTON_LEFT:
			var point = Plane(Vector3.UP,0).intersects_ray(camera.project_ray_origin(event.position),camera.project_ray_normal(event.position))
			if point != null and not world.is_land(point):
				target = point
				has_target = true

func make_wake() -> void:
	wake = MultiMeshInstance3D.new()
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var mesh = BoxMesh.new()
	mesh.size = Vector3.ONE
	mm.mesh = mesh
	mm.instance_count = 120
	mm.visible_instance_count = 0
	wake.multimesh = mm
	var material = StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	wake.material_override = material
	wake.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	world.add_child(wake)

func update_wake(dt: float) -> void:
	wake_clock += dt
	if abs(speed) > 2 and wake_clock > .08:
		wake_clock = 0
		var stern = ship_position + Vector3(sin(heading),0,cos(heading))*12
		for side in [-1,1]:
			wake_points.append({"position":stern+Vector3(cos(heading),0,-sin(heading))*side*4,"age":0.0})
	while wake_points.size() > 120:
		wake_points.pop_front()
	for p in wake_points:
		p.age += dt
	wake_points = wake_points.filter(func(p): return p.age < 4)
	for i in wake_points.size():
		var p: Dictionary = wake_points[i]
		var location_: Vector3 = p.position
		location_.y = World.wave_height(location_,sea_time)+.9
		var size_ = (1-p.age/4)*2.5
		wake.multimesh.set_instance_transform(i,Transform3D(Basis.from_scale(Vector3(size_,.16,size_)),location_))
		wake.multimesh.set_instance_color(i,Color("b5d4c5").lerp(Color("2e6970"),p.age/4))
	wake.multimesh.visible_instance_count = wake_points.size()

func smoke_test() -> void:
	set_physics_process(false)
	assert(world.chunks.size() == 49)
	assert(world.hull_clear(ship_position,heading))
	assert(voyage.buy_price == 24 and voyage.sell_price == 19)
	assert(not boat.find_children("*","MeshInstance3D",true,false).is_empty())
	var start_position = ship_position
	var forward = InputEventKey.new()
	forward.physical_keycode = KEY_W
	forward.keycode = KEY_W
	forward.pressed = true
	Input.parse_input_event(forward)
	for tick in 150:
		_physics_process(1.0/60)
	forward.pressed = false
	Input.parse_input_event(forward)
	assert(ship_position.distance_to(start_position) > 20)
	assert(ship_position.distance_to(world.harbor) < 90)
	dock()
	assert(mode == "harbor")
	assert(views.harbor_camera != null)
	trade(true,5)
	assert(voyage.coins == 530 and voyage.cargo == 5)
	trade(false,2)
	assert(voyage.coins == 568 and voyage.cargo == 3)
	var before = voyage.coins
	trade(false,20)
	assert(voyage.coins == before and voyage.cargo == 3)
	trade(true,80)
	assert(voyage.coins == before and voyage.cargo == 3)
	toggle_chart()
	assert(mode == "chart" and views.marker != null)
	toggle_chart()
	assert(mode == "harbor")
	leave_harbor()
	assert(mode == "sea" and voyage.cargo == 3)
	return_to_port()
	assert(voyage.cargo == 3 and voyage.coins == 568)
	assert(wake_points.is_empty())
	print("SMOKE PASS: original assets, coastline, docking, buy/sell, invalid trade, chart, and return to sea.")
	for player in [sailing_audio,harbor_audio,coin_audio]:
		player.stop()
	await get_tree().process_frame
	await get_tree().process_frame
	get_tree().quit()

func capture_views() -> void:
	DirAccess.make_dir_recursive_absolute("res://builds/screenshots")
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://builds/screenshots/sailing.png")
	ship_position = world.harbor+world.normal*60
	dock()
	trade(true,5)
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://builds/screenshots/harbor.png")
	toggle_chart()
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://builds/screenshots/chart.png")
	print("Rendered sailing, harbor transaction, and chart previews.")
	for player in [sailing_audio,harbor_audio,coin_audio]:
		player.stop()
	await get_tree().process_frame
	await get_tree().process_frame
	get_tree().quit()

func _exit_tree() -> void:
	for player in [sailing_audio,harbor_audio,coin_audio]:
		if is_instance_valid(player):
			player.stop()
