# Blender nautical chart

## British frigate NPC

`british-frigate.blend` is the game source copied from the edited `Documents/Blender/PirateHarbor_Rebuild/Voxel_Frigate_1812.blend`. The original was backed up there as `Voxel_Frigate_1812_Before_British_NPC.blend`. All square sails, including the lower courses, are unfurled. Square canvas, headsails, and the subdivided gaff canvas have independent wind shape keys that move their cloth and seams while pinning attachment edges. The stern carries a modeled Union Jack with an eight-second shape-key flutter loop (frames 1–192 at 24 fps; frame 193 closes the loop).

After editing this repository copy, export with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python models/trade-winds/export-british-frigate.py
```

This writes `assets/trade-winds/models/british-frigate.glb` without changing the Blender source. It exports only the frigate asset collection, batches static geometry, and retains animated canvas and flag meshes, with material colors packed into vertex colors. It scales the source by 2.7 and rotates its +X bow to the game's -Z forward direction. Keep the placement root and cloth/flag shape keys. `animate-frigate-sails.py` adds the cloth rig to an unanimated source without rebuilding the ship; backups ending `_Before_Sail_Animation.blend` preserve the earlier source. If editing the original in Documents/Blender, copy it here before exporting. Do not run the original `build_frigate.py` to export manual changes: that generator rebuilds the older furled-sail model.

The game and workshop (`trade-winds-models.html#frigate`) share the same asset. Refresh after exporting.

## Animated sunset trading post

Open `clean-character-harbor.blend`. This is the editable source for the current market scene, copied from the animated `Clean_Characters_Harbor.blend` in `Documents/Blender/PirateHarbor_Rebuild`. It includes the shopkeeper, drinking sailor, chatting dockhands, swaying ropes and lantern, frigate, and waterfront. The timeline contains a 20-second loop at 24 fps. The saved camera controls the browser composition.

The game and `trade-winds-market-preview.html` load `assets/trade-winds/models/clean-character-harbor.glb`. Saving the Blender file alone does not change that browser asset. After editing, save the blend, then run from the repository:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python models/trade-winds/export-clean-character-harbor.py
```

Refresh the browser after export. The exporter does not modify the Blender source. It excludes hidden objects, presentation lights, the atmospheric volume and static water; preserves the active camera, moving pivots and blinking shape keys; and batches static meshes under each pivot with shared vertex-colored materials. It includes frame 481 as the matching endpoint for a complete 20-second glTF loop. The browser supplies animated water, five nearby lantern lights, shadows and depth effects. Blender's procedural shading and Cycles lighting are approximated for real-time rendering. Keep the original `ANIM | …` controls, scene camera and point lights when editing.

The previous `harbor-sunset.blend` / `harbor-sunset.glb` and `trading-post.blend` remain available. Their build scripts are for those older scenes; they do not update the current harbor. Subsequent edits to the separate file in `Documents/Blender` must first be copied into `clean-character-harbor.blend` before exporting.

## Nautical chart

Open `west-indies-chart.blend` in Blender. The scene **West Indies · Chart Table** contains the editable asset collection **Nautical Chart · Game Asset**, plus a presentation camera and studio lights. It uses modeled geometry and material colors, with no external textures. The original starter scene is retained separately.

`build-nautical-chart.py` reproducibly builds the asset with Blender 5.2. Run from the repository:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python models/trade-winds/build-nautical-chart.py
```

The source script uses macOS Georgia fonts; change its font paths when rebuilding on another operating system. Existing text is mesh geometry in the saved blend and does not require those fonts to view or export.

The game loads `assets/trade-winds/models/west-indies-chart.glb` when opening its chart. The live port labels, route selection, destination flag, and miniature ship are handled by `trade-winds-chart.mjs`. Preview it at `trade-winds-chart-preview.html`, also linked from the model workshop.

## Editing and exporting

- Blender coordinates: X east, Y north, Z up. The water chart spans X −60…60 and Y −36…36.
- `assets/trade-winds/chart-layout.json` defines the matching longitude/latitude bounds and ports. Coastlines come from the same `coast.json` as the sailing world.
- Keep the names and positions of `port_*` empties. They are verified against the game's geographic coordinates. Each has a `port_id` custom property.
- Keep `chart_ship` as its own object, with its origin at the waterline. The game moves and rotates it independently.
- To export manual edits, select only **Nautical Chart · Game Asset** objects and export glTF Binary with **Selected Objects** and **Custom Properties** enabled. Leave cameras and lights disabled. Replace the GLB above.
- The regeneration script overwrites the generated asset, so save manual variants separately before rebuilding.

The game pauses sailing while the chart is open. Clicking a port sets a bearing; it does not teleport the player or automatically sail through land. On narrow screens the detailed chart scrolls, while the destination selector and Set Sail remain accessible.
