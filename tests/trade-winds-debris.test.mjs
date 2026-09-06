import test from "node:test";
import assert from "node:assert/strict";
import {
  DebrisEncounters,
  DEBRIS_LIMIT,
  createDebrisVisual,
  animateDebrisVisual,
} from "../trade-winds-debris.mjs";
import {
  newState,
  toWorld,
  cargoCount,
  parseSave,
} from "../trade-winds-engine.mjs";
import { disposeModel } from "../trade-winds-models.mjs";

function setup(lon = -67, lat = 26) {
  const sim = new DebrisEncounters(() => 0.5),
    ship = newState(toWorld(lon, lat));
  ship.heading = 0;
  sim.wait = 0;
  const event = sim
    .update(0.1, ship, () => true)
    .find((e) => e.type === "spawn");
  return { sim, ship, item: event.item };
}
test("debris spawns in open water, with about three times as many Atlantic encounters", () => {
  function count(lon, lat) {
    const sim = new DebrisEncounters(() => 0.5),
      ship = newState(toWorld(lon, lat));
    let total = 0;
    for (let i = 0; i < 3600; i++)
      for (const e of sim.update(0.1, ship, () => true))
        if (e.type === "spawn") {
          total++;
          sim.collect(e.item.id, {
            ...ship,
            x: e.item.x,
            z: e.item.z,
            cargo: { ...ship.cargo },
          });
        }
    return total;
  }
  const calm = count(-76, 16),
    atlantic = count(-67, 26);
  assert.ok(calm > 0);
  assert.ok(atlantic >= calm * 2.8 && atlantic <= calm * 3.2);
  const sim = new DebrisEncounters(() => 0.5),
    ship = newState(toWorld(-67, 26));
  sim.wait = 0;
  assert.deepEqual(
    sim.update(10, ship, () => false),
    [],
  );
  assert.equal(sim.active.length, 0);
});
test("salvage requires proximity, pays once, and survives normal save restoration", () => {
  const { sim, ship, item } = setup();
  const before = JSON.stringify(ship);
  assert.equal(sim.collect(item.id, ship), null);
  assert.equal(JSON.stringify(ship), before);
  Object.assign(ship, { x: item.x, z: item.z });
  assert.equal(sim.nearest(ship).id, item.id);
  const reward = sim.collect(item.id, ship);
  assert.equal(reward.coins, 10);
  assert.equal(ship.coins, 660);
  assert.equal(reward.quantity, 2);
  assert.equal(cargoCount(ship), 2);
  assert.equal(sim.collect(item.id, ship), null);
  assert.equal(ship.coins, 660);
  const saved = parseSave(JSON.stringify(ship));
  assert.equal(saved.coins, 660);
  assert.equal(cargoCount(saved), 2);
});
test("a nearly full hold takes only available cargo; a full hold still gets gold", () => {
  for (const used of [39, 40]) {
    const { sim, ship, item } = setup();
    ship.cargo.rum = used;
    Object.assign(ship, { x: item.x, z: item.z });
    const reward = sim.collect(item.id, ship);
    assert.equal(reward.quantity, 40 - used);
    assert.equal(cargoCount(ship), 40);
    assert.equal(ship.coins, 660);
    assert.equal(sim.active.length, 0);
  }
});
test("debris population stays bounded, freezes when paused and cleans up distant piles", () => {
  let seed = 23;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const sim = new DebrisEncounters(random),
    ship = newState(toWorld(-67, 26));
  let peak = 0;
  for (let i = 0; i < 2400; i++) {
    sim.update(0.1, ship, () => true);
    peak = Math.max(peak, sim.active.length);
    assert.ok(sim.active.length <= DEBRIS_LIMIT);
  }
  assert.equal(peak, DEBRIS_LIMIT);
  const before = JSON.stringify({ active: sim.active, wait: sim.wait });
  sim.update(0, ship, () => true);
  assert.equal(JSON.stringify({ active: sim.active, wait: sim.wait }), before);
  const ids = sim.active.map((i) => i.id);
  ship.x += 1500;
  const events = sim.update(0.1, ship, () => false);
  for (const id of ids)
    assert.ok(events.some((e) => e.type === "despawn" && e.id === id));
  sim.reset();
  assert.equal(sim.active.length, 0);
});
test("foam stays bounded and the cargo and splash transforms animate without invalid values", () => {
  const { item } = setup();
  item.age = 3;
  const model = createDebrisVisual(item);
  animateDebrisVisual(model, item, 1);
  const before = Array.from(model.userData.debris.foam.instanceMatrix.array);
  animateDebrisVisual(model, item, 2);
  const after = Array.from(model.userData.debris.foam.instanceMatrix.array);
  assert.equal(model.userData.debris.foam.count, 72);
  assert.ok(after.every(Number.isFinite));
  assert.notDeepEqual(before, after);
  assert.equal(model.position.x, item.x);
  assert.equal(model.position.z, item.z);
  disposeModel(model);
});
