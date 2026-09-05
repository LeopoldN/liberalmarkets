import test from "node:test";
import assert from "node:assert/strict";
import {
  GOODS,
  PORTS,
  BASE_SHIP_SPEED,
  prices,
  newState,
  transact,
  parseSave,
  cargoCount,
  toWorld,
  toGeo,
  pointInPolygon,
} from "../trade-winds-engine.mjs";
const home = PORTS[0],
  rum = GOODS[0];
const fresh = () => newState(toWorld(home.lon, home.lat));
test("regional supply rewards a genuine port-to-port trade, never same-port flipping", () => {
  for (const p of PORTS)
    for (const g of GOODS) assert.ok(prices(p, g).sell < prices(p, g).buy);
  const s = fresh(),
    initial = s.coins;
  assert.equal(transact(s, home, "rum", "buy", 10).ok, true);
  assert.equal(
    transact(
      s,
      PORTS.find((p) => p.id === "cartagena"),
      "rum",
      "sell",
      10,
    ).ok,
    true,
  );
  assert.ok(s.coins > initial);
  assert.equal(cargoCount(s), 0);
});
test("every good has both a low-cost source and a profitable destination", () => {
  for (const g of GOODS) {
    const buy = Math.min(...PORTS.map((p) => prices(p, g).buy));
    const sell = Math.max(...PORTS.map((p) => prices(p, g).sell));
    assert.ok(sell > buy, g.id);
  }
});
test("trade failures leave the complete state unchanged", () => {
  for (const [good, mode, qty] of [
    ["rum", "buy", 100],
    ["rum", "sell", 1],
    ["rum", "buy", -1],
    ["rum", "buy", 1.2],
    ["missing", "buy", 2],
    ["rum", "other", 1],
  ]) {
    const s = fresh(),
      before = structuredClone(s);
    assert.equal(transact(s, home, good, mode, qty).ok, false);
    assert.deepEqual(s, before);
  }
  const s = fresh();
  s.coins = 100000;
  s.cargo.rum = 40;
  const before = structuredClone(s);
  assert.equal(transact(s, home, "sugar", "buy", 1).ok, false);
  assert.deepEqual(s, before);
});
test("save restoration preserves the voyage and rejects corrupt or out-of-world states", () => {
  const s = fresh();
  s.cargo.rum = 4;
  s.target = "havana";
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
  for (const mutation of [
    { x: 1e8 },
    { coins: -1 },
    { health: 0 },
    { capacity: 200 },
    { elapsed: -1 },
    { visited: ["fake"] },
    { cargo: { rum: 0 } },
    { cargo: { ...s.cargo, rum: 41 } },
    { cargo: { ...s.cargo, rum: -2 } },
  ])
    assert.equal(parseSave(JSON.stringify({ ...s, ...mutation })), null);
  assert.equal(parseSave("broken"), null);
  assert.equal(parseSave(null), null);
});
test("geographic conversion is reversible and the Caribbean spans substantial voyages", () => {
  for (const p of PORTS) {
    const w = toWorld(p.lon, p.lat),
      g = toGeo(w.x, w.z);
    assert.ok(Math.abs(g.lon - p.lon) < 1e-9);
    assert.ok(Math.abs(g.lat - p.lat) < 1e-9);
  }
  const a = toWorld(home.lon, home.lat),
    b = toWorld(-75.87, 19.96);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) / BASE_SHIP_SPEED > 30);
});
test("coast collision classifies polygon interiors and open sea", () => {
  const p = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(pointInPolygon(5, 5, p), true);
  assert.equal(pointInPolygon(11, 5, p), false);
});
