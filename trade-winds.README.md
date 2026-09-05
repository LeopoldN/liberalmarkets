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

- `trade-winds-engine.mjs`: ports, goods, pricing, transactions, save validation, geographic helpers.
- `trade-winds.js`: chunked voxel scenery, stepped water tiles and shaders, voxel foam rendering, ship controls, collision, market, chart, and saves.
- `trade-winds-wake.mjs`: bounded foam simulation following the actual world-space route, including turns, reverse motion, dispersal, and fading.
- `trade-winds.css`: minimal HUD, port merchant interface, and responsive dialogs.
- `tests/trade-winds.test.mjs`: economic, transaction, save, geographic, and collision tests.
- `tests/trade-winds-wake.test.mjs`: stationary/stop behavior, historical trail persistence, frame-rate independence, capacity bounds, and teleport resets.

Run the unit checks with `node --test tests/*.test.*`. Browser checks should cover entering and leaving port, buying and selling, compass steering, chart destination selection, saving and restoring, save-and-quit, and touch-size layouts. High quality enables soft shadows and water highlights; low quality reduces rendering resolution and disables shadows.
