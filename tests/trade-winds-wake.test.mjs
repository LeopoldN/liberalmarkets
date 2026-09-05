import test from "node:test";
import assert from "node:assert/strict";
import { WakeTrail } from "../trade-winds-wake.mjs";
const active = (wake) => wake.particles.filter((p) => p.age < p.life);
test("a stationary ship never emits foam, and a stopped trail fades away", () => {
  const wake = new WakeTrail();
  wake.update(0.1, { x: 0, z: 0 });
  for (let i = 0; i < 20; i++) wake.update(0.1, { x: 0, z: 0 });
  assert.equal(active(wake).length, 0);
  wake.update(0.1, { x: 0, z: -2 });
  assert.ok(active(wake).length > 0);
  const sequence = wake.sequence;
  for (let i = 0; i < 120; i++) wake.update(0.1, { x: 0, z: -2 });
  assert.equal(wake.sequence, sequence);
  assert.equal(active(wake).length, 0);
});
test("foam follows the historical route rather than rotating with a turning ship", () => {
  const wake = new WakeTrail();
  wake.update(0.1, { x: 0, z: 0 });
  wake.update(0.1, { x: 0, z: -3 });
  const particle = active(wake)[0],
    oldX = particle.x,
    oldZ = particle.z,
    vx = particle.vx,
    vz = particle.vz;
  wake.update(0.1, { x: 3, z: -3 });
  assert.ok(Math.abs(particle.x - (oldX + vx * 0.1)) < 1e-9);
  assert.ok(Math.abs(particle.z - (oldZ + vz * 0.1)) < 1e-9);
});
test("distance-based emission is stable across frame rates and stays bounded", () => {
  const run = (steps) => {
    const wake = new WakeTrail(60);
    wake.update(0, { x: 0, z: 0 });
    for (let i = 1; i <= steps; i++)
      wake.update(1 / steps, { x: 0, z: (-24 * i) / steps });
    return wake;
  };
  const low = run(10),
    high = run(60);
  assert.equal(low.sequence, high.sequence);
  assert.ok(active(high).length <= 60);
  assert.ok(high.sequence > 60);
});
test("teleports clear old foam without drawing a trail across the world", () => {
  const wake = new WakeTrail();
  wake.update(0.1, { x: 0, z: 0 });
  wake.update(0.1, { x: 0, z: -5 });
  assert.ok(active(wake).length);
  wake.update(0.1, { x: 500, z: 500 });
  assert.equal(active(wake).length, 0);
});
