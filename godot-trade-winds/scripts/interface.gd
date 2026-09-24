extends CanvasLayer
## Native Control UI, with one screen state and no DOM/browser dependency.

signal chart_requested
signal dock_requested
signal sail_requested
signal return_requested
signal trade_requested(buying: bool, quantity: int)
signal sound_requested

var root: Control
var stats: Label
var location: Label
var objective: Label
var message: Label
var dock_button: Button
var chart_button: Button
var sound_button: Button
var market_panel: PanelContainer
var chart_panel: PanelContainer
var ledger: Label
var buy_button: Button
var sell_button: Button
var quantity: SpinBox
var mode = "sea"
var gold = Color("e4bc77")
var cream = Color("f5ead2")
var muted = Color("b6c8c5")

func _ready() -> void:
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var theme = Theme.new()
	theme.default_font_size = 18
	theme.set_color("font_color","Label",cream)
	theme.set_color("font_color","Button",cream)
	theme.set_stylebox("normal","Button",box(Color("20383de8")))
	theme.set_stylebox("hover","Button",box(Color("38545b")))
	theme.set_stylebox("pressed","Button",box(Color("547078")))
	theme.set_stylebox("focus","Button",box(Color("38545b"),gold))
	root.theme = theme
	var header = PanelContainer.new()
	header.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	header.offset_left = 24
	header.offset_top = 22
	header.offset_right = -24
	header.add_theme_stylebox_override("panel",box(Color("12262ce8")))
	root.add_child(header)
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation",24)
	header.add_child(row)
	var brand = VBoxContainer.new()
	brand.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(brand)
	var title = text("TRADE WINDS", 28)
	var serif = SystemFont.new()
	serif.font_names = PackedStringArray(["Georgia"])
	title.add_theme_font_override("font",serif)
	brand.add_child(title)
	var subtitle = text("PORT ROYAL   /   A CARIBBEAN VOYAGE",12)
	subtitle.modulate = gold
	brand.add_child(subtitle)
	stats = text("",19)
	stats.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(stats)
	chart_button = button("Chart  M",func(): chart_requested.emit())
	row.add_child(chart_button)
	sound_button = button("Sound on",func(): sound_requested.emit())
	row.add_child(sound_button)
	var bottom = PanelContainer.new()
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_left = 24
	bottom.offset_right = -24
	bottom.offset_bottom = -22
	bottom.offset_top = -142
	bottom.add_theme_stylebox_override("panel",box(Color("12262cee")))
	root.add_child(bottom)
	var bottom_row = HBoxContainer.new()
	bottom_row.add_theme_constant_override("separation",24)
	bottom.add_child(bottom_row)
	var details = VBoxContainer.new()
	details.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom_row.add_child(details)
	location = text("",19)
	details.add_child(location)
	objective = text("Sail toward the quay, dock, then buy your first rum barrels.",16)
	objective.modulate = gold
	details.add_child(objective)
	message = text("W/S sail  ·  A/D turn  ·  Space anchor  ·  Click sea to steer  ·  Scroll zoom",14)
	message.modulate = muted
	details.add_child(message)
	dock_button = button("Dock at Port Royal  E",func(): dock_requested.emit())
	dock_button.custom_minimum_size.x = 240
	bottom_row.add_child(dock_button)
	build_market()
	build_chart()
	set_mode("sea")

func box(color: Color, border: Color = Color("4e625c")) -> StyleBoxFlat:
	var style = StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(5)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 14
	style.content_margin_bottom = 14
	return style

func text(value: String, size_: int) -> Label:
	var label = Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size",size_)
	return label

func button(value: String, callback: Callable) -> Button:
	var btn = Button.new()
	btn.text = value
	btn.focus_mode = Control.FOCUS_NONE
	btn.pressed.connect(callback)
	btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	return btn

func build_market() -> void:
	market_panel = PanelContainer.new()
	market_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER_RIGHT)
	market_panel.offset_left = -410
	market_panel.offset_right = -24
	market_panel.offset_top = -270
	market_panel.offset_bottom = 185
	market_panel.add_theme_stylebox_override("panel",box(Color("172b30f5"),Color("a68b57")))
	root.add_child(market_panel)
	var column = VBoxContainer.new()
	column.add_theme_constant_override("separation",12)
	market_panel.add_child(column)
	var eyebrow = text("ELIAS BECKETT  ·  LOCAL MERCHANT",12)
	eyebrow.modulate = gold
	column.add_child(eyebrow)
	column.add_child(text("The rum ledger",28))
	var description = text("Oak-aged Jamaican rum.\nA local export, ready for your hold.",16)
	description.modulate = muted
	column.add_child(description)
	column.add_child(HSeparator.new())
	ledger = text("",20)
	column.add_child(ledger)
	var row = HBoxContainer.new()
	var label = text("Barrels",17)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	quantity = SpinBox.new()
	quantity.min_value = 1
	quantity.max_value = 80
	quantity.value = 5
	quantity.custom_minimum_size.x = 130
	row.add_child(quantity)
	column.add_child(row)
	buy_button = button("Buy rum",func(): trade_requested.emit(true,int(quantity.value)))
	sell_button = button("Sell rum",func(): trade_requested.emit(false,int(quantity.value)))
	column.add_child(buy_button)
	column.add_child(sell_button)
	column.add_child(button("Leave harbor  E",func(): sail_requested.emit()))
	var note = text("Local resale pays less than buying.\nOther trading ports are outside this slice.",13)
	note.modulate = muted
	column.add_child(note)

func build_chart() -> void:
	chart_panel = PanelContainer.new()
	chart_panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	chart_panel.offset_left = 24
	chart_panel.offset_top = 130
	chart_panel.add_theme_stylebox_override("panel",box(Color("172b30ed")))
	root.add_child(chart_panel)
	var column = VBoxContainer.new()
	column.add_theme_constant_override("separation",12)
	chart_panel.add_child(column)
	column.add_child(text("The West Indies",25))
	var copy = text("Red pin: your position\nPort Royal is the active harbor.",16)
	copy.modulate = muted
	column.add_child(copy)
	column.add_child(button("Return to Port Royal",func(): return_requested.emit()))
	column.add_child(button("Close chart  M",func(): chart_requested.emit()))

func set_mode(value: String) -> void:
	mode = value
	market_panel.visible = mode == "harbor"
	chart_panel.visible = mode == "chart"
	chart_button.text = "Close chart  M" if mode == "chart" else "Chart  M"
	dock_button.visible = mode == "sea"

func refresh(voyage: RefCounted, distance: float, speed: float, point: Vector3) -> void:
	stats.text = "%d GOLD    /    %d / %d HOLD" % [voyage.coins,voyage.cargo,voyage.capacity]
	if mode == "sea":
		location.text = "JAMAICA    /    Port Royal %d m    /    %d knots" % [int(distance),int(abs(speed)*.1944)]
		objective.text = "First trade complete. Set sail and explore the coastline." if voyage.trade_count > 0 else "Sail toward the quay, dock, then buy your first rum barrels."
	elif mode == "harbor":
		location.text = "PORT ROYAL    /    Jamaica    /    Safely moored"
		objective.text = "First trade complete. Your hold and gold have been updated." if voyage.trade_count > 0 else "Choose your barrels and buy the local export."
	else:
		location.text = "CAPTAIN’S CHART    /    %.2f° N   %.2f° W" % [22-point.z/220,abs(point.x/220-80)]
		objective.text = "The original Caribbean map. Sailing pauses while the chart is open."
	dock_button.disabled = distance > 90
	dock_button.text = "Dock at Port Royal  E" if distance <= 90 else "Approach the harbor"
	ledger.text = "BUY  %d gold     /     SELL  %d gold" % [voyage.buy_price,voyage.sell_price]
	var count = int(quantity.value)
	buy_button.text = "Buy %d barrels  ·  %d gold" % [count,count*voyage.buy_price]
	sell_button.text = "Sell %d barrels  ·  %d gold" % [count,count*voyage.sell_price]
	buy_button.disabled = count*voyage.buy_price > voyage.coins or count > voyage.capacity-voyage.cargo
	sell_button.disabled = count > voyage.cargo
