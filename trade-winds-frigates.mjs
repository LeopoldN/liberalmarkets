import * as THREE from './assets/vendor/three.module.js';
import { GLTFLoader } from './assets/vendor/GLTFLoader.js';
import { atlanticWeight } from './trade-winds-ocean.mjs?v=whirlpool-1';

export const FRIGATE_SPEED = 16;
export const FRIGATE_CLEARANCE = 52;
const MAX_FRIGATES = 2;

// Ships face local -Z, matching the player's sailing heading. These encounters
// only emit lifecycle events: proximity never causes an attack or hull damage.
export class FrigateEncounters {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() { this.active = []; this.wait = 16 + this.random() * 8; this.nextId = 0; }
  update(dt, ship, { openWater }) {
    const events = [];
    for (let remaining = dt; remaining > 1e-9;) {
      const step = Math.min(remaining, 1 / 30);
      this.step(step, ship, openWater, events);
      remaining -= step;
    }
    return events;
  }
  step(dt, ship, openWater, events) {
    this.wait = Math.max(-1, this.wait - dt * (1 + 3 * atlanticWeight(ship.x, ship.z)));
    if (this.wait <= 0 && this.active.length < MAX_FRIGATES) {
      this.wait = 4;
      const bearing = ship.heading + (this.random() - .5) * Math.PI * 2;
      const distance = 280 + this.random() * 100;
      const x = ship.x - Math.sin(bearing) * distance;
      const z = ship.z - Math.cos(bearing) * distance;
      if (openWater(ship.x, ship.z, FRIGATE_CLEARANCE) &&
          openWater(x, z, FRIGATE_CLEARANCE + 12) &&
          this.active.every(f => Math.hypot(f.x - x, f.z - z) > 150)) {
        const frigate = { id: this.nextId++, x, z, heading: this.random() * Math.PI * 2,
          age: 0, lifetime: 140 + this.random() * 40, phase: this.random() * 8,
          turn: 0, turnIn: 6, blocked: 0, safeTravel: 0 };
        this.active.push(frigate);
        this.wait = 16 + this.random() * 8;
        events.push({ type: 'spawn', frigate });
      }
    }
    for (const f of [...this.active]) {
      f.age += dt;
      const distance = Math.hypot(f.x - ship.x, f.z - ship.z);
      if (distance > 650 || f.age > f.lifetime || f.blocked > 10) {
        this.active.splice(this.active.indexOf(f), 1);
        events.push({ type: 'despawn', id: f.id });
        continue;
      }
      f.turnIn -= dt;
      if (f.turnIn <= 0) { f.turn = (this.random() - .5) * .1; f.turnIn = 6 + this.random() * 6; }
      // Patrol headings depend only on the ship's random route and coastlines.
      f.heading += f.turn * dt;

      // Probe ahead before reaching a shoreline; retain conservative circular
      // clearance for the entire hull, bowsprit, and any heading change.
      const travel = FRIGATE_SPEED * dt;
      if (f.safeTravel < travel) {
        const budget = FRIGATE_SPEED * .4;
        if (openWater(f.x, f.z, FRIGATE_CLEARANCE + budget)) f.safeTravel = budget;
        else {
          const aheadX = f.x - Math.sin(f.heading) * 24;
          const aheadZ = f.z - Math.cos(f.heading) * 24;
          if (!openWater(aheadX, aheadZ, FRIGATE_CLEARANCE)) f.heading += .9 * dt;
          const x = f.x - Math.sin(f.heading) * travel / 2;
          const z = f.z - Math.cos(f.heading) * travel / 2;
          if (openWater(x, z, FRIGATE_CLEARANCE + travel / 2)) f.safeTravel = travel;
          else { f.heading += .9 * dt; f.blocked += dt; continue; }
        }
      }
      const nextX = f.x - Math.sin(f.heading) * travel;
      const nextZ = f.z - Math.cos(f.heading) * travel;
      f.x = nextX; f.z = nextZ;
      f.safeTravel -= travel;
      f.blocked = 0;
    }
  }
}

let asset, loading;
const instances = new WeakMap();
export function loadFrigateAsset() {
  if (!loading) loading = new GLTFLoader().loadAsync(
    new URL('./assets/trade-winds/models/british-frigate.glb?v=wind-2', import.meta.url).href,
  ).then(gltf => { asset = gltf; return gltf; }).catch(error => { loading = null; throw error; });
  return loading;
}
export function createFrigate() {
  if (!asset) throw new Error('Load the British frigate before creating it');
  const model = new THREE.Group();
  model.name = 'Passive British frigate';
  const rig = asset.scene.clone(true), materials = new Map();
  rig.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const clone = material => {
      if (!materials.has(material)) {
        const copy = material.clone();
        // Dithered fades preserve depth sorting across overlapping sails.
        copy.alphaHash = true;
        copy.side = THREE.DoubleSide;
        materials.set(material, copy);
      }
      return materials.get(material);
    };
    o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
  });
  model.add(rig);
  const mixer = new THREE.AnimationMixer(rig);
  asset.animations.forEach(clip => mixer.clipAction(clip).play());
  instances.set(model, { mixer, rig, materials });
  return model;
}
export function animateFrigate(model, time, opacity = 1) {
  const instance = instances.get(model);
  if (!instance) return;
  instance.mixer.setTime(time);
  instance.materials.forEach(m => { m.opacity = THREE.MathUtils.clamp(opacity, 0, 1); });
}
export function disposeFrigate(model) {
  const instance = instances.get(model);
  if (!instance) return;
  instance.mixer.stopAllAction();
  instance.mixer.uncacheRoot(instance.rig);
  instance.materials.forEach(m => m.dispose());
  instances.delete(model);
}
