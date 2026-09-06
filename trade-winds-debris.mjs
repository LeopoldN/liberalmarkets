import * as THREE from "./assets/vendor/three.module.js";
import { GOODS, cargoCount } from "./trade-winds-engine.mjs";
import {
  atlanticWeight,
  buoyancyHeight,
  waveHeight,
} from "./trade-winds-ocean.mjs?v=whirlpool-1";
import {
  createMerchantDebris,
  animateMerchantDebris,
} from "./trade-winds-models.mjs?v=frigate-1";

export const DEBRIS_REACH = 36;
export const DEBRIS_LIMIT = 4;
export const DEBRIS_GOLD = 10;

export class DebrisEncounters {
  constructor(random = Math.random) {
    this.random = random;
    this.sequence = 0;
    this.reset();
  }
  reset() {
    this.active = [];
    this.wait = 8 + this.random() * 8;
  }
  update(dt, ship, openWater) {
    if (!(dt > 0)) return [];
    const events = [];
    this.active = this.active.filter((item) => {
      item.age += dt;
      if (
        item.age > 180 ||
        Math.hypot(item.x - ship.x, item.z - ship.z) > 700
      ) {
        events.push({ type: "despawn", id: item.id });
        return false;
      }
      return true;
    });
    // Three times as frequent in the Atlantic, with a smooth regional blend.
    this.wait -= dt * (1 + 2 * atlanticWeight(ship.x, ship.z));
    if (this.wait > 0 || this.active.length >= DEBRIS_LIMIT) return events;
    this.wait = 5;
    for (let attempt = 0; attempt < 6; attempt++) {
      const bearing = ship.heading + (this.random() - 0.5) * 2.6;
      const distance = 175 + this.random() * 125;
      const x = ship.x - Math.sin(bearing) * distance,
        z = ship.z - Math.cos(bearing) * distance;
      if (
        x < -5480 ||
        x > 4780 ||
        z < -2480 ||
        z > 3530 ||
        this.active.some((item) => Math.hypot(item.x - x, item.z - z) < 85) ||
        !openWater(x, z, 22)
      )
        continue;
      const item = {
        id: ++this.sequence,
        x,
        z,
        age: 0,
        heading: this.random() * Math.PI * 2,
        phase: this.random() * Math.PI * 2,
        good: GOODS[Math.floor(this.random() * GOODS.length)].id,
        quantity: 1 + Math.floor(this.random() * 3),
      };
      this.active.push(item);
      this.wait = 30 + this.random() * 30;
      events.push({ type: "spawn", item });
      break;
    }
    return events;
  }
  nearest(ship) {
    let closest = null,
      distance = DEBRIS_REACH;
    for (const item of this.active) {
      const d = Math.hypot(item.x - ship.x, item.z - ship.z);
      if (d <= distance) {
        closest = item;
        distance = d;
      }
    }
    return closest;
  }
  collect(id, ship) {
    const index = this.active.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const item = this.active[index];
    if (Math.hypot(item.x - ship.x, item.z - ship.z) > DEBRIS_REACH)
      return null;
    const quantity = Math.min(
      item.quantity,
      Math.max(0, Math.floor(ship.capacity - cargoCount(ship))),
    );
    // Consume first: repeated clicks/key events cannot collect the same pile twice.
    this.active.splice(index, 1);
    ship.coins += DEBRIS_GOLD;
    if (quantity)
      ship.cargo[item.good] = (ship.cargo[item.good] || 0) + quantity;
    return {
      id,
      coins: DEBRIS_GOLD,
      good: item.good,
      quantity,
      leftBehind: item.quantity - quantity,
    };
  }
}

const foamGeometry = new THREE.BoxGeometry(1, 1, 1);
const foamMaterial = new THREE.MeshStandardMaterial({
  roughness: 1,
  flatShading: true,
});
const dummy = new THREE.Object3D(),
  tint = new THREE.Color();
export function createDebrisVisual(item) {
  const group = new THREE.Group();
  group.name = "Salvageable merchant debris";
  const cargo = createMerchantDebris();
  cargo.rotation.y = item.heading;
  const foam = new THREE.InstancedMesh(foamGeometry, foamMaterial, 72);
  foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  foam.frustumCulled = false;
  for (let i = 0; i < foam.count; i++)
    foam.setColorAt(i, tint.set(i % 3 ? 0xb7d7c9 : 0x739f99));
  group.add(cargo, foam);
  group.userData.debris = { cargo, foam };
  animateDebrisVisual(group, item, 0);
  return group;
}
export function animateDebrisVisual(group, item, time) {
  const { cargo, foam } = group.userData.debris;
  const phase = time + item.phase;
  const ocean = atlanticWeight(item.x, item.z);
  const surface = buoyancyHeight(item.x, item.z, time);
  const rise = THREE.MathUtils.smoothstep(item.age, 0, 1.5);
  group.position.set(item.x, surface, item.z);
  animateMerchantDebris(cargo, phase);
  cargo.position.y -= (1 - rise) * 6;
  cargo.rotation.x *= 1 + ocean;
  cargo.rotation.z *= 1 + ocean;
  for (let i = 0; i < foam.count; i++) {
    const age = (phase * (0.23 + (i % 5) * 0.025) + i * 0.137) % 1;
    const angle = i * 2.399 + item.phase;
    const radius = 1 + age * 0.35;
    const x = Math.cos(angle) * 12 * radius,
      z = Math.sin(angle) * 10 * radius;
    const splash =
      i % 6 === 0 ? Math.sin(age * Math.PI) * (1 + ocean * 1.4) : 0;
    const height =
      waveHeight(
        Math.round((item.x + x) / 12) * 12,
        Math.round((item.z + z) / 12) * 12,
        time,
      ) + 0.55;
    const size = (0.25 + (1 - age) * 0.7) * rise;
    dummy.position.set(x, height - surface + splash, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(size, 0.15 + size * 0.3, size);
    dummy.updateMatrix();
    foam.setMatrixAt(i, dummy.matrix);
  }
  foam.instanceMatrix.needsUpdate = true;
}
