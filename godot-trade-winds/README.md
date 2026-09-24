# Trade Winds · Port Royal

A small, playable Godot 4.7 prototype of the existing browser game. Uses the
Compatibility renderer on macOS. Open `project.godot` in Godot and press F6/F5
to play the main scene/project.

## Play

- W / up: sail; S / down: reverse; A / D / arrows: turn.
- Click open sea to steer to a point; Space drops anchor; scroll zooms.
- E or **Dock at Port Royal** enters the harbor within 90 world units.
- Buy or sell rum in the ledger. Starting gold: 650; hold: 80 barrels.
- The original Port Royal prices apply: buy 24 gold, sell 19 gold per barrel.
- E / **Leave harbor** returns to sailing.
- M opens the original 3D chart with a pin at your current geographic position.
- **Return to Port Royal** on the chart resets position, preserving gold/cargo.
- The sound button mutes sailing, harbor ambience, and transaction effects.

This is one vessel, one active port, and one trade good. The full coastline is
navigable, but other ports, hazards, upgrades, and browser-save migration are
outside the slice. Cargo and gold persist between screens for the current run;
closing/restarting the prototype begins again. World units and collision sizing
follow the browser game. Water and camera are a Godot adaptation, not visual
parity with the browser renderer.

## Original assets, without duplicate binaries in Git

`assets/` contains generated local copies and is ignored by Git. The original
GLBs and Blender files in the parent repository remain the source of truth.
On a fresh clone, or after changing the original models, run from this folder:

```sh
python3 tools/sync_assets.py --node /path/to/node
godot --headless --path . --editor --import
```

The sync tool copies only the sloop, clean character harbor, chart, coast data,
and three MP3s. It also snapshots the actual Port Royal procedural model, trees,
harbor-placement result, vessel parameters, and rum prices from the browser
modules. No JS library or browser runtime ships inside the Godot project.

Godot 4.7.2 does not import the harbor's `KHR_mesh_quantization` extension.
`tools/godot_glb.py` expands its signed-byte normals to standard float vectors in
the generated copy, retaining geometry, colors, animations, and the authored
camera. This increases the local harbor file size; it is a compatibility step,
not an asset-size optimization. Imported vertex-color materials are normalized
per mesh surface, and UV tangent generation is disabled for these voxel assets.

## Code organization

| File | Responsibility |
| --- | --- |
| `scenes/main.tscn` | Main scene entry point |
| `scripts/main.gd` | Sailing/input, camera, wake, audio, screen transitions |
| `scripts/world.gd` | Original coastline, collision, bounded terrain chunks, Port Royal |
| `scripts/asset_views.gd` | Lazy harbor/chart scenes, animation and material adaptation |
| `scripts/interface.gd` | Native Godot HUD, chart controls, trading ledger |
| `scripts/voyage.gd` | Renderer-independent transaction validation/state |
| `shaders/ocean.gdshader` | Voxel ocean adapted from the browser's wave functions |
| `tools/` | Reproducible asset preparation and import diagnostics |

Terrain keeps 49 nearby chunks, the occupancy cache is capped, ocean tiles and
wake instances are bounded, and the harbor/chart load on first visit. The
sailing world pauses in both views. Imported animation tracks are combined into
a looping clip so independently authored sails, rigging, and characters move
together. Nothing is added to the browser game's entry points.

## Verification

```sh
godot --headless --path . -- --smoke-test
godot --path . -- --capture
```

The smoke check exercises the imported assets, keyboard sailing into docking
range, collision clearance, buying, selling, invalid orders, map transitions,
and return-to-port with preserved cargo/gold. Rendering previews are written to
`builds/screenshots/` (ignored) for sailing, a completed trade, and the chart.
The capture command needs a graphical display; headless checks do not benchmark
GPU performance. Web/mobile export and low-end-device profiling remain untested.
