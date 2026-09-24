# Royal Navy frigate — game handoff

The active browser NPC loader now uses `assets/trade-winds/models/royal-navy-frigate.glb`. The previous `british-frigate.glb` is retained. The editable source is `models/trade-winds/royal-navy-frigate.blend`; the sibling GLB is the same optimized runtime export.

- Source coordinates: bow −X, up +Z. Runtime coordinates: bow −Z, up +Y.
- Runtime scale: 1.8; waterline at source Z=3.6. Center offset: source X+4. Navigation clearance: 56 game units.
- Seven mesh primitives, 16,899,392 bytes. Vertex colors; no projected image or texture dependency. Presentation cameras and studio lights are excluded.
- `Royal frigate sailing`: eight-second repeating clip. Two wind-morphed sail batches, fluttering stern ensign, independently swaying stowed anchors, and lantern flame morphs. Point-light and emissive flicker are driven per NPC by `animateFrigate`.
- All detailed parts remain separately editable and grouped in the Blender source. Only the runtime copy is batched and stripped of hidden cell faces and microscopic seam geometry.

## Verification

Ten automated checks pass across frigate asset/animation, passive patrol, wake, and encounter reset. The actual browser workshop loads and animates the new asset without warning/error logs. Geometry checks at nine evaluated animation poses found no rig centerline–sail intersections. This check is documented in `animated-rig-check.json` and does not claim exhaustive continuous collision simulation.

The Astra critic rated the preserved reference-angle reconstruction 8.5/10, with no blocking visual defect in the final forward-sail variant. Remaining reference differences are simplified canvas contours, gallery ornament density, and deck layout. The user explicitly limited the final refinement to one pass, then requested the forward sail orientation.

`reference-comparison.png` and `royal-navy-frigate-reference-match.blend` preserve the comparison before that intentional orientation change. `royal-navy-frigate-orbit.mp4` is the 10-second animated geometry orbit.

Re-export through Blender MCP by executing `export-game-frigate.py` with the animated source open. It restores the editable source after optimizing/exporting in memory. The Godot prototype currently has no NPC frigate loader; no new Godot encounter behavior was added.
