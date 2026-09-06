# Trade Winds

A standalone WebGL sailing and trading game, linked from `games.html`. No build step or external runtime requests are required. Three.js 0.170.0 is vendored with its license. Coastlines are a regional subset of the repository's Natural Earth 50m dataset; towns, terrain height, and the trading economy are stylized game content.

## Run

From the repository root, run `python3 -m http.server 8000` and visit `http://localhost:8000/trade-winds.html` in a WebGL-capable browser.

## Play

- W / up: sail forward. S / down: slow or reverse.
- A / D or left / right: turn. Space: stop.
- Click or tap open water: steer and sail to that point.
- Scroll or pinch: zoom.
- M: nautical chart. Choose a port to mark its bearing; land still needs to be navigated around.
- Escape or the gear: settings, save, chart, or save and quit.
- Enter a harbor to open its market. Buy local exports, sell where they are in demand, and repair collision damage at port.

The world spans Mexico, Florida, Central America, northern South America, and the Caribbean, with sixteen ports. The map uses 220 world units per geographic degree. The raft has a maximum speed of 26 units per second; the trading sloop has a maximum speed of 40. Wind adjusts full-throttle speed to 80–100% of each maximum (20.8–26 for the raft, 32–40 for the sloop). Each vessel holds 40 units of cargo.

Saves use browser local storage (`liberal-markets:trade-winds:v1`) every 30 seconds, after trading and destination changes, and when leaving the page. Explicit save-and-quit keeps the game open if storage fails. Saved positions, cargo, health, and money are validated before restoration. Set Sail resumes an existing save when one is available. New voyage replaces the current browser save.

## Code and verification

- `trade-winds-engine.mjs`: ports, goods, vessel dimensions, pricing, transactions, save validation, geographic helpers.
- `trade-winds-models.mjs`: reusable raft, original trading ship, gull, three port styles, palms, and tropical canopy builders.
- `trade-winds-models.html` / `trade-winds-model-viewer.mjs`: standalone model workshop with rotation, zoom, and direct links to each model.
- `trade-winds.js`: chunked voxel scenery, stepped water tiles and shaders, voxel foam rendering, ship controls, collision, market, chart, and saves.
- `trade-winds-wake.mjs`: bounded foam simulation following the actual world-space route, including turns, reverse motion, dispersal, and fading.
- `trade-winds.css`: minimal HUD, port merchant interface, and responsive dialogs.
- `tests/trade-winds.test.mjs`: economic, transaction, save, geographic, and collision tests.
- `tests/trade-winds-wake.test.mjs`: stationary/stop behavior, historical trail persistence, frame-rate independence, capacity bounds, and teleport resets.

Run the unit checks with `node --test tests/*.test.*`. Browser checks should cover entering and leaving port, buying and selling, compass steering, chart destination selection, saving and restoring, save-and-quit, and touch-size layouts. High quality enables soft shadows and water highlights; low quality reduces rendering resolution and disables shadows.

## Model workflow

Open `http://localhost:8000/trade-winds-models.html` to review the same models that appear in the game. Choose a model, drag to rotate it, and scroll to zoom. Hash links such as `#raft`, `#fortress`, and `#palm` open a specific asset directly.

All model builders live in `trade-winds-models.mjs`. They return independent Three.js groups without attaching them to a scene or touching game state. `createTradingShip()` now uses the animated Blender sloop after `loadVesselAssets()` completes. New voyages use `createRaft()`; saved voyages without a vessel field migrate to the trading sloop. Existing raft saves remain rafts. Use **New voyage** on the title screen to start on a raft.

- Coordinates: +Y is up; boats face -Z; docks extend toward +Z. Ports are built on a nine-unit raised base, then rotated and positioned by the game.
- `createVessel("raft" | "trader")`: vessel model. Hull dimensions for collision and foam emission live in `VESSELS` in the engine module.
- `createPortModel("merchant" | "fortress" | "lagoon")`: complete port. `portVariant(portId)` assigns each of the sixteen ports a stable style.
- `createTree("palm" | "canopy", seed)`: tree for preview or placement in a port. `appendTree(...)` adds the same model to a terrain chunk's shared instance batch.
- `createMerchantDebris()` / `animateMerchantDebris(model, time)`: floating cargo prop with three barrels, broken planks, a cloth-covered crate, an open fishing net, cork floats, and rope coils. Waterline is local Y=0. Preview at `trade-winds-models.html#debris`; gameplay placement and salvage live in `trade-winds-debris.mjs`.
- `createGull(index)`: the existing articulated bird. Flight and wing animation remain in the game.
- `block(...)`, `roof(...)`, `house(...)`, and the other internal prop builders are shared modeling primitives. `consolidate(...)` batches static parts, including nested instances, into a single draw call. Use `disposeModel(...)` when replacing a model; shared cube geometry and materials stay alive.

The raft uses its own speed setting and retains the shared trading capacity.

The starting raft now loads `assets/trade-winds/models/seated-raft.glb`, including the seated voyager, cargo, lantern, and weathered sail. Gameplay and the model workshop await `loadRaftAsset()` before creating vessels. Instances share cached geometry and materials. The export uses five vertex-colored mesh batches to preserve the voxel detail with few draw calls. Its uniform scale, forward direction, waterline, and hull footprint are prepared for the sailing world; the outboard oar is decorative. Existing raft saves automatically use this model.

The source of truth is `models/trade-winds/seated-raft.blend`. To update the localhost raft:

1. Edit that scene in Blender and **save** it. Hidden objects and collections are excluded from export, along with the studio, cameras, and lights.
2. From the repository root, run `/Applications/Blender.app/Contents/MacOS/Blender --background --python models/trade-winds/export-seated-raft.py`.
3. Refresh the game or model workshop. A running page keeps its loaded model in memory until refreshed.

The exporter reads the saved `.blend` directly, applies mesh modifiers and transforms, and rebuilds both `models/trade-winds/seated-raft-source.glb` (detailed parts) and `assets/trade-winds/models/seated-raft.glb` (optimized game asset). It does not change the `.blend`. The separate original scene under `Documents/BlenderAssets/SeatedVoyager` is not used by this exporter.

## Animated trading sloop

The reference-based replacement is `assets/trade-winds/models/trading-sloop.glb`. It includes a stepped oak hull and red keel, raised quarterdeck with wheel and helmsman, stern windows and rudder, cargo and a lattice hatch, main canvas and triangular jib, crow's nest, navy pennant, and hanging anchor. The ten-second idle loop animates cloth shape keys, the sailor's torso/head/arms, wheel, lantern, and loose rope. Standing rigging remains anchored.

`loadVesselAssets()` preloads both boats. `animateVessel(model, elapsedSeconds)` advances an independent Three.js animation mixer per sloop; it never changes the vessel's gameplay position or heading. Gameplay holds the rig when paused. The workshop's Trading sloop has a Pause motion button, and moored trading-post sloops use the same animation. Shared meshes/materials stay cached when a vessel is disposed; its mixer is released. Existing trader saves get the replacement automatically, while new voyages still start on the raft.

Edit **`models/trade-winds/trading-sloop.blend`**, then save and run:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python models/trade-winds/export-trading-sloop.py
```

Refresh the page afterward. The exporter uses the saved Blender scene, preserves the rig and shape keys, batches static parts, and excludes hidden objects and the Studio collection. Keep the animated `rig_*` empties and cloth shape keys when editing. `build-trading-sloop.py` is the original generator and overwrites that scene; use the exporter for manual edits. Preview the asset at `trade-winds-models.html#trader`, and press Space over Blender's viewport/timeline to preview its animation.

## Animated harbor trading screen

Markets now use the animated clean-character harbor: the shopkeeper blinks and nods, the seated pirate sways and drinks, dockhands gesture in conversation, ropes and a lantern sway, and the frigate rocks gently. All motion comes from the saved Blender scene in a 20-second loop. The existing buy/sell ledger, prices, cargo, port names and save flow remain in place.

Preview it at `trade-winds-market-preview.html`, or enter a port in the game. The runtime asset is `assets/trade-winds/models/clean-character-harbor.glb`. Its editable source is `models/trade-winds/clean-character-harbor.blend`; save edits there and run:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python models/trade-winds/export-clean-character-harbor.py
```

Refresh the game afterward. The exporter keeps the camera and blink shape keys, batches geometry under the animated pivots, and packs colors and normals without an external decoder. It does not change the Blender source. Browser lighting approximates the Cycles presentation; water and nearby lantern lighting run in Three.js. Reduced-motion mode holds the animation still. The previous harbor assets remain available as backups. See `models/trade-winds/README.md` for editing details.

## Atlantic wildlife

### Rare thunderstorms

Dark gray and black voxel clouds drift across open water, with brief, randomly timed yellow lightning inside the cloud, falling voxel rain and sea splashes. Rain darkens the water beneath the cloud. Storm footprints are four times their original width and depth (380–460-unit radii); cloud coverage, lightning, rain and the affected water area scale together. Overhead cloud cover becomes partially transparent so the player can still see the ship. The same model is available at `trade-winds-models.html#storm`, including pause/resume. Reduced-motion preferences disable lightning flashes.

`trade-winds-storms.mjs` uses a random 120–210-second spawn clock, running three times faster in Atlantic water (40–70 seconds). Failed placements retry after 18 clock seconds. Up to one storm is allowed nearby outside the Atlantic, or two within it; they last 80–110 seconds and drift at 4–7 units per second. Storms spawn away from harbors, land and the whirlpool.

Rain reduces top sailing speed gradually toward the cloud's center, reaching a 35% reduction. Sustained heavy rain deals only 1 hull damage every six seconds. Overlapping storms do not stack penalties. Leaving the cloud restores normal speed and resets the damage timer; sheltered harbor water has no storm penalty. Storm timers, motion and effects pause with gameplay, and rescue or starting/resuming a voyage clears them. They are not saved with the voyage.

Tests cover regional rarity, spawn clearance, population bounds, slowdown, damage intervals, overlap, shelter, pause/reset, drifting clouds, rain/splashes and localized lightning.

### Gulf whirlpool

A permanent whirlpool sits in the central Gulf of Mexico at **90°W, 25°N** (world `-2200, -660`). Its visible funnel is 680 units across, with currents reaching 420 units from the eye. The game's existing voxel water now shares its renderer with the workshop; CPU buoyancy and GPU tiles use the same 76-unit funnel depression. Five animated spiral foam bands, drifting foam, and seven jagged rock clusters mark the danger. Foam collars, upstream spray and downstream wash surround each rock. The camera widens gradually nearby to show more of the hazard.

The current adds inward and circular drift to normal sailing, increasing toward the center. Inward speeds (world units/second) are 0 at radius 420, 5 at 300, 15 at 250, 25 at 200, 50 at 150, 75 at 100, and 105 at the 25-unit eye, with smooth transitions between these distances. Both boats can escape the outer flow under sail, while the inner pull exceeds their top speed. Rocks stop hull crossings and deal 8 damage with a 1.8-second cooldown. Contact with the 25-unit eye sets health to zero immediately, including fast crossings. Destruction uses the existing rescue flow: return to a nearby port, lose up to 75 gold, and restore 55% hull, with a whirlpool-specific message. Currents and damage pause with gameplay. Sharks, frigates and floating cargo avoid spawning or patrolling inside the hazard.

Preview the animated funnel at `trade-winds-models.html#whirlpool`; Pause motion holds its water, foam and spray still. `trade-winds-whirlpool-field.mjs` owns the location, current, collision shapes and shared height/color functions; `trade-winds-whirlpool.mjs` supplies the bounded rock/foam scene; `trade-winds-water.mjs` supplies the common voxel water. Tests verify offshore placement, escape/pull, fatal core contact, rocks, pause/reset and foam above the actual tile surface.

### Passive British frigates

`trade-winds-frigates.mjs` adds peaceful 1812 frigates with billowing, fully unfurled sails and an animated Union Jack at the stern. They cruise at 16 world units per second on random patrols. Nearby players do not change their heading or speed; only coastlines redirect them. They never chase, fire, or deal contact damage. Up to two spawn 280–380 units from the player on a random 16–24-second clock, accelerated fourfold in fully Atlantic water (4–6 seconds). Failed spawn attempts retry after four clock seconds; occupied slots and water clearance can delay appearances.

The full 52-unit ship footprint avoids land and the existing harbor safety buffer. Ships leave animated foam along their traveled route, fade in, bob and roll with the sea, and retire after 140–180 seconds or beyond 650 units. Encounters pause with the game and clear on rescue or starting/resuming a voyage. They are transient and do not change saved voyages.

Preview at `trade-winds-models.html#frigate`. The shared 22.2 MiB GLB uses seven mesh primitives, cached geometry, independent sail/flag mixers, and an eight-second wind loop. Square sails, headsails, and the gaff canvas deform while their attachment edges stay fixed. Each ship has one bounded instanced wake that samples the actual voxel water surface; old foam stays behind through turns and fades after the ship stops. The editable source and exporter are `models/trade-winds/british-frigate.blend` and `models/trade-winds/export-british-frigate.py`. Tests cover regional spawning, clearance, player-independent patrols, fixed speed, pause/reset, model orientation, independent sail animation/disposal, and foam height/history.

### Sharks

`trade-winds-sharks.mjs` supplies a reusable voxel dorsal fin and wake, plus the encounter simulation. Sharks spawn in open water around the sailing boat, excluding land and a 150-unit harbor safety zone. A random 12–20-second spawn clock advances four times faster in the Atlantic (one attempt every 3–5 seconds in fully Atlantic water); at most three sharks can be nearby. A fin patrols at 11 units per second, starts chasing within 105 units, and pursues at exactly **26.1 units per second**, independent of boat upgrades or wind.

Contact with the hull deals **8 health**, followed by a **three-second bite cooldown** and a brief pass before turning back. Swept collision checks include boat movement, so fast crossings still register. Beyond 260 units sharks stop chasing; distant or old encounters disappear. They follow the ocean surface and pause with trading, charts, settings and hidden tabs. Rescue and starting/resuming a voyage clear shark encounters; they are not saved. The boat's current boosted top speed is 49, so it can comfortably escape at full speed.

Preview the same moving fin at `trade-winds-models.html#shark`. The model uses two instanced draw calls, and its motion can be paused in the workshop. Its body, side fins and beating forked tail appear as a submerged silhouette in the water shader. Foam samples the actual 12-unit water-tile tops, so it remains visible on Atlantic swells; its brighter patches stream backward and fade. The workshop uses the same silhouette shader. `tests/trade-winds-sharks.test.mjs` covers regional spawn frequency, safe-water checks, pursuit speed, swept hits, cooldown, escape, pause/reset and independent model instances.

### Kraken

This NPC/mob work is isolated in the shared model and encounter modules:

- `trade-winds-ocean.mjs`: one geographic boundary and matching JavaScript/GLSL wave functions. North and east of the Caribbean island arc, water blends into dark Atlantic blue, with stronger swells, whitecaps, hull motion, and foam following the surface. The boundary is stylized for this game's map.
- `trade-winds-mobs.mjs`: random open-ocean Kraken encounters. After 24–54 seconds spent in Atlantic water, a clear encounter site can spawn ahead of the vessel. Coastlines and harbors are excluded. Only the two front arms strike; the other six continue their idle movement. The Kraken pursues at a fixed `KRAKEN_SPEED = 40.1` world units per second, independent of vessel speed and wind. It turns toward the boat, stops 120 units away to strike, and avoids land and harbors. Each attacking arm has its own cooldown and locks a world-space target before a 1.5-second wind-up and 0.45-second strike. Faster boats can pull away. Moving clear avoids damage. A hit costs 12 hull points. Sail away to escape; encounters also retreat after 85 seconds and have a 75–150-second cooldown.
- `createKraken(seed)` / `animateKraken(model, time, attacks, waterLevel)` in `trade-winds-models.mjs`: reusable voxel mantle, eye sockets, ridges, articulated arms, ventral suckers, and spray. The seeded proportions vary between encounters. Static anatomy and each moving arm are instanced batches. Models own no game state; disposal preserves shared geometry and materials.

Open `trade-winds-models.html#kraken` for the **Atlantic Kraken** in **NPCs & mobs**. The workshop offers idle animation, a repeating strike preview, pause/resume, randomized variants, and a trading ship for scale. It uses the exact gameplay rig. Encounters freeze with the market, chart, settings, or hidden tab; rescue and starting a voyage clear the current creature. Encounter state is transient and is not restored from saves.

`node --test tests/trade-winds*.test.mjs` includes Atlantic boundary/swell checks, spawn restrictions, locked-target dodging, hull damage, pause/retreat/cooldown behavior, and independent arm animation.

## Floating salvage

Merchant debris appears randomly in open water, away from harbors and coastlines, about three times as frequently in the Atlantic. Up to four piles are kept nearby, with wave-following bobbing, foam, and small splashes. Unclaimed piles expire after three minutes or when more than 700 units away.

Click or tap a distant pile to sail toward it. Within 36 world units, press **E**, click/tap the pile, or use **Salvage debris** to recover **10 gold and 1–3 units of a random trade good**. Cargo is capped to free hold space; a full hold still receives the gold. Each pile can be collected once, and rewards use the normal voyage save. Spawning and effects pause with gameplay; rescue and starting a voyage clear nearby debris.
