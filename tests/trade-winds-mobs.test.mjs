import test from "node:test";
import assert from "node:assert/strict";
import { atlanticWeight, waveHeight } from "../trade-winds-ocean.mjs";
import { toWorld, VESSELS } from "../trade-winds-engine.mjs";
import {
  KrakenEncounter,
  KRAKEN_IMPACT,
  KRAKEN_SPEED,
  KRAKEN_ATTACK_ARMS,
  strikeHitsShip,
} from "../trade-winds-mobs.mjs";
import {
  createKraken,
  animateKraken,
  krakenPreviewAttacks,
  disposeModel,
} from "../trade-winds-models.mjs";
const options = { openWater: () => true, hull: VESSELS.trader };
const sailor = () => ({ ...toWorld(-67, 26), heading: 0 });
function spawn() {
  const sim = new KrakenEncounter(() => 0.5),
    ship = sailor();
  sim.wait = 0;
  assert.equal(sim.update(0.1, ship, options)[0].type, "spawn");
  return { sim, ship, k: sim.active };
}
test("Atlantic is distinct from Caribbean and Gulf with a continuous transition", () => {
  for (const p of [
    [-77, 18],
    [-87, 25],
    [-72, 17],
    [-65, 16],
  ]) {
    const { x, z } = toWorld(...p);
    assert.equal(atlanticWeight(x, z), 0);
  }
  for (const p of [
    [-70, 26],
    [-60, 20],
    [-78, 29],
  ]) {
    const { x, z } = toWorld(...p);
    assert.equal(atlanticWeight(x, z), 1);
  }
  const { x, z } = toWorld(-70, 20.7);
  assert.ok(Math.abs(atlanticWeight(x, z) - 0.5) < 1e-9);
  assert.ok(
    Math.abs(atlanticWeight(x, z + 0.01) - atlanticWeight(x, z - 0.01)) < 0.001,
  );
  let calm = 0,
    rough = 0;
  const a = toWorld(-77, 18),
    b = toWorld(-70, 26);
  for (let t = 0; t < 100; t += 0.1) {
    calm += waveHeight(a.x, a.z, t) ** 2;
    rough += waveHeight(b.x, b.z, t) ** 2;
  }
  assert.ok(rough > calm * 8, "Atlantic swell must be materially rougher");
});
test("random encounters require open Atlantic water and respect cooldown", () => {
  const sim = new KrakenEncounter(() => 0.5);
  sim.wait = 0;
  assert.deepEqual(
    sim.update(60, { ...toWorld(-77, 18), heading: 0 }, options),
    [],
  );
  assert.equal(sim.active, null);
  assert.deepEqual(
    sim.update(60, sailor(), { ...options, openWater: () => false }),
    [],
  );
  assert.equal(sim.active, null);
  assert.equal(sim.update(9, sailor(), options)[0].type, "spawn");
  assert.equal(
    sim.update(0.1, sailor(), options).filter((e) => e.type === "spawn").length,
    0,
  );
});
test("arms telegraph, lock targets, strike once, and let a moving ship dodge", () => {
  const { sim, ship, k } = spawn();
  ship.z = k.z + 110;
  let attack;
  for (let i = 0; i < 300 && !attack; i++) {
    sim.update(1 / 30, ship, options);
    attack = k.attacks[0];
  }
  assert.ok(attack);
  const locked = { ...attack.worldTarget };
  assert.equal(attack.age, 0);
  ship.x += 65;
  let impacts = [];
  for (let i = 0; i < 65; i++)
    impacts.push(
      ...sim.update(1 / 30, ship, options).filter((e) => e.type === "impact"),
    );
  assert.equal(impacts.filter((e) => e.arm === attack.arm).length, 1);
  assert.equal(impacts[0].hit, false);
  assert.deepEqual(attack.worldTarget, locked);
});
test("stationary hull is hit once, including a strike across a timestep boundary", () => {
  const { sim, ship, k } = spawn();
  k.age = 10;
  k.nextAttack = 100;
  k.attacks = [
    {
      arm: 0,
      age: KRAKEN_IMPACT - 0.01,
      target: { x: 0, z: 110 },
      worldTarget: { x: ship.x, z: ship.z },
    },
  ];
  assert.equal(
    sim.update(0.03, ship, options).filter((e) => e.type === "impact" && e.hit)
      .length,
    1,
  );
  assert.equal(
    sim.update(0.03, ship, options).filter((e) => e.type === "impact").length,
    0,
  );
  assert.ok(
    strikeHitsShip(
      { x: 0, z: -28 },
      { x: 0, z: 0, heading: 0 },
      VESSELS.trader,
    ),
  );
  assert.ok(
    !strikeHitsShip({ x: 0, z: -28 }, { x: 0, z: 0, heading: 0 }, VESSELS.raft),
  );
});
test("pause freezes encounters; escape retires the creature and reset removes attacks", () => {
  const { sim, ship, k } = spawn();
  const before = JSON.stringify(k);
  assert.deepEqual(sim.update(0, ship, options), []);
  assert.equal(JSON.stringify(k), before);
  ship.x += 600;
  assert.ok(sim.update(0.1, ship, options).some((e) => e.type === "retreat"));
  assert.deepEqual(k.attacks, []);
  assert.ok(sim.update(5, ship, options).some((e) => e.type === "despawn"));
  assert.equal(sim.active, null);
  assert.ok(sim.wait >= 75);
  sim.reset();
  assert.equal(sim.active, null);
});
test("shared Kraken has eight independent bounded rigs and deterministic variants", () => {
  const a = createKraken(17),
    b = createKraken(17);
  const arms = a.userData.kraken.arms;
  assert.equal(arms.length, 8);
  assert.equal(a.children.filter((c) => c.isInstancedMesh).length, 9);
  const before = arms.map((arm) => Array.from(arm.mesh.instanceMatrix.array));
  animateKraken(a, 2, [{ arm: 0, age: 1.8, target: { x: 16, z: 105 } }]);
  animateKraken(b, 2);
  for (let i = 0; i < 8; i++) {
    const matrix = Array.from(arms[i].mesh.instanceMatrix.array);
    assert.ok(matrix.every(Number.isFinite));
    assert.notDeepEqual(matrix, before[i]);
    if (i === 0)
      assert.notDeepEqual(
        matrix,
        Array.from(b.userData.kraken.arms[i].mesh.instanceMatrix.array),
      );
    else
      assert.deepEqual(
        matrix,
        Array.from(b.userData.kraken.arms[i].mesh.instanceMatrix.array),
      );
  }
  assert.ok(
    a.userData.kraken.spray.count <=
      a.userData.kraken.spray.instanceMatrix.count,
  );
  disposeModel(a);
  disposeModel(b);
});

test("gameplay and workshop strikes use only the two front arms", () => {
  const { sim, ship, k } = spawn();
  ship.z = k.z + 120;
  const used = new Set(),
    preview = new Set();
  for (let i = 0; i < 1800; i++) {
    for (const event of sim.update(1 / 30, ship, options))
      if (event.type === "windup") used.add(event.arm);
    for (const attack of krakenPreviewAttacks(i / 30)) preview.add(attack.arm);
  }
  assert.deepEqual([...used].sort(), [0, 7]);
  assert.deepEqual([...preview].sort(), [0, 7]);
  assert.deepEqual(KRAKEN_ATTACK_ARMS, [0, 7]);
});

test("pursuit speed is fixed, frame-rate independent, and faster boats pull away", () => {
  function chase(boatSpeed, fps) {
    const { sim, ship, k } = spawn();
    k.age = 5;
    k.nextAttack = 100;
    ship.x = k.x;
    ship.z = k.z + 200;
    const start = { x: k.x, z: k.z };
    for (let i = 0; i < fps * 3; i++) {
      ship.z += boatSpeed / fps;
      sim.update(1 / fps, ship, options);
    }
    return {
      travelled: Math.hypot(k.x - start.x, k.z - start.z),
      gap: ship.z - k.z,
    };
  }
  for (const fps of [30, 60, 120]) {
    const equal = chase(24, fps),
      faster = chase(40, fps);
    assert.ok(Math.abs(equal.travelled - KRAKEN_SPEED * 3) < 1e-8);
    assert.ok(Math.abs(equal.gap - 200) < 1e-8);
    assert.ok(Math.abs(faster.travelled - KRAKEN_SPEED * 3) < 1e-8);
    assert.ok(Math.abs(faster.gap - 248) < 1e-8);
  }
});

test("pursuit respects strike distance, emergence, and blocked water", () => {
  const { sim, ship, k } = spawn();
  const start = { x: k.x, z: k.z };
  sim.update(1, ship, options);
  assert.deepEqual(
    { x: k.x, z: k.z },
    start,
    "submerged creature must finish emerging",
  );
  k.age = 5;
  sim.update(1, ship, { ...options, openWater: () => false });
  assert.deepEqual(
    { x: k.x, z: k.z },
    start,
    "must not swim onto land or into a harbor",
  );
  for (let i = 0; i < 300; i++) sim.update(1 / 30, ship, options);
  assert.ok(Math.abs(Math.hypot(k.x - ship.x, k.z - ship.z) - 120) < 1e-8);
});

test("a moving, rotating Kraken keeps its animated strike on the locked world target", () => {
  const { sim, ship, k } = spawn();
  k.age = 5;
  k.nextAttack = .2;
  ship.z = k.z + 120;
  let attack;
  for (let i = 0; i < 120 && !attack; i++) {
    sim.update(1 / 30, ship, options);
    attack = k.attacks[0];
  }
  assert.ok(attack);
  const locked = { ...attack.worldTarget },
    start = { x: k.x, z: k.z, heading: k.heading };
  ship.x += 90;
  ship.z += 40;
  for (let i = 0; i < 30; i++) {
    sim.update(1 / 30, ship, options);
    const x =
      k.x +
      attack.target.x * Math.cos(k.heading) +
      attack.target.z * Math.sin(k.heading);
    const z =
      k.z -
      attack.target.x * Math.sin(k.heading) +
      attack.target.z * Math.cos(k.heading);
    assert.ok(Math.hypot(x - locked.x, z - locked.z) < 1e-8);
  }
  assert.ok(Math.hypot(k.x - start.x, k.z - start.z) > 10);
  assert.notEqual(k.heading, start.heading);
});
