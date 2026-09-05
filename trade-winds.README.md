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

The world spans Mexico, Florida, Central America, northern South America, and the Caribbean, with sixteen ports. The map uses 220 world units per geographic degree; normal top ship speed is 14 units per second before wind adjustment. A temporary 3.5× testing multiplier currently raises that to 49 units per second. At the normal speed, voyages take roughly a minute to more than ten minutes, depending on distance and detours. The ship holds 40 units of cargo.

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

All model builders live in `trade-winds-models.mjs`. They return independent Three.js groups without attaching them to a scene or touching game state. The original ship is preserved in `createTradingShip()`. New voyages use `createRaft()`; saved voyages without a vessel field migrate to the original trading ship. Existing raft saves remain rafts. Use **New voyage** on the title screen to start on a raft.

- Coordinates: +Y is up; boats face -Z; docks extend toward +Z. Ports are built on a nine-unit raised base, then rotated and positioned by the game.
- `createVessel("raft" | "trader")`: vessel model. Hull dimensions for collision and foam emission live in `VESSELS` in the engine module.
- `createPortModel("merchant" | "fortress" | "lagoon")`: complete port. `portVariant(portId)` assigns each of the sixteen ports a stable style.
- `createTree("palm" | "canopy", seed)`: tree for preview or placement in a port. `appendTree(...)` adds the same model to a terrain chunk's shared instance batch.
- `createGull(index)`: the existing articulated bird. Flight and wing animation remain in the game.
- `block(...)`, `roof(...)`, `house(...)`, and the other internal prop builders are shared modeling primitives. `consolidate(...)` batches static parts, including nested instances, into a single draw call. Use `disposeModel(...)` when replacing a model; shared cube geometry and materials stay alive.

The raft retains the current testing speed and trading capacity.

## Atlantic wildlife

This NPC/mob work is isolated in the shared model and encounter modules:

- `trade-winds-ocean.mjs`: one geographic boundary and matching JavaScript/GLSL wave functions. North and east of the Caribbean island arc, water blends into dark Atlantic blue, with stronger swells, whitecaps, hull motion, and foam following the surface. The boundary is stylized for this game's map.
- `trade-winds-mobs.mjs`: random open-ocean Kraken encounters. After 24–54 seconds spent in Atlantic water, a clear encounter site can spawn ahead of the vessel. Coastlines and harbors are excluded. Eight arms have separate cooldowns; each locks its target before a 1.5-second wind-up and 0.45-second strike. Moving clear avoids damage. A hit costs 12 hull points. Sail away to escape; encounters also retreat after 85 seconds and have a 75–150-second cooldown.
- `createKraken(seed)` / `animateKraken(model, time, attacks, waterLevel)` in `trade-winds-models.mjs`: reusable voxel mantle, eye sockets, ridges, articulated arms, ventral suckers, and spray. The seeded proportions vary between encounters. Static anatomy and each moving arm are instanced batches. Models own no game state; disposal preserves shared geometry and materials.

Open `trade-winds-models.html#kraken` for the **Atlantic Kraken** in **NPCs & mobs**. The workshop offers idle animation, a repeating strike preview, pause/resume, randomized variants, and a trading ship for scale. It uses the exact gameplay rig. Encounters freeze with the market, chart, settings, or hidden tab; rescue and starting a voyage clear the current creature. Encounter state is transient and is not restored from saves.

`node --test tests/trade-winds*.test.mjs` includes Atlantic boundary/swell checks, spawn restrictions, locked-target dodging, hull damage, pause/retreat/cooldown behavior, and independent arm animation.
