import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "../assets/vendor/three.module.js";
import { PORTS } from "../trade-winds-engine.mjs?v=cargo-80";
import { createSailingWorld } from "../trade-winds-world.mjs";

const coasts = JSON.parse(
  readFileSync(new URL("../assets/trade-winds/coast.json", import.meta.url)),
).map((ring) => ({
  ring,
  minX: Math.min(...ring.map((p) => p[0])),
  maxX: Math.max(...ring.map((p) => p[0])),
  minY: Math.min(...ring.map((p) => p[1])),
  maxY: Math.max(...ring.map((p) => p[1])),
}));

test("world preserves harbor placement, collision clearance, and encounter exclusions", () => {
  const scene = new THREE.Scene(),
    ports = [];
  const world = createSailingWorld({
    scene,
    ports,
    coasts,
    camera: new THREE.OrthographicCamera(-300, 300, 200, -200),
    sharkShadows: { value: [] },
    stormFields: { value: [] },
  });
  assert.deepEqual(
    ports.map((p) => p.id),
    PORTS.map((p) => p.id),
  );
  for (const port of ports) {
    assert.equal(world.isSolid(port.x, port.z), false, port.id);
    assert.equal(world.openWater(port.x, port.z, 20), false, port.id);
    assert.equal(port.group.parent, scene);
  }
  assert.equal(
    world.openWater(-2200, -660, 20),
    false,
    "whirlpool excludes encounters",
  );
});

test("water replacement preserves shared uniforms and evicts distant chunks", () => {
  const scene = new THREE.Scene(),
    ports = [];
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100);
  const sharkShadows = { value: [new THREE.Vector4()] };
  const stormFields = { value: [new THREE.Vector4(), new THREE.Vector4()] };
  const world = createSailingWorld({
    scene,
    camera,
    ports,
    coasts,
    sharkShadows,
    stormFields,
  });
  const initial = world.water;
  world.update({ x: 0, z: 100 });
  assert.notEqual(world.water, initial);
  assert.equal(initial.parent, null);
  assert.equal(world.water.material, initial.material);
  assert.equal(world.water.material.uniforms.sharkShadows, sharkShadows);
  assert.equal(world.water.material.uniforms.stormFields, stormFields);
  const nearby = new Set(scene.children);
  const smallCount = world.water.count;
  camera.top = 600;
  camera.right = 800;
  world.update({ x: 0, z: 100 });
  assert.ok(world.water.count > smallCount);
  assert.equal(world.water.material, initial.material);
  camera.top = 100;
  camera.right = 100;
  world.update({ x: 2000, z: 0 });
  const count = scene.children.length;
  for (const x of [2500, 3000, 3500, 4000]) world.update({ x, z: 0 });
  assert.equal(
    scene.children.length,
    count,
    "terrain does not accumulate along the route",
  );
  assert.ok([...nearby].some((object) => object.parent === null));
  assert.equal(world.water.count, smallCount);
});
