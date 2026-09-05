import { atlanticWeight } from "./trade-winds-ocean.mjs";

export const KRAKEN_TIMING = { windup: 1.5, strike: 0.45, recovery: 1.65 };
export const KRAKEN_IMPACT = KRAKEN_TIMING.windup + KRAKEN_TIMING.strike;
export const KRAKEN_ATTACK_LENGTH = KRAKEN_IMPACT + KRAKEN_TIMING.recovery;
// World units per second; deliberately independent of vessel upgrades and
// the temporary sailing-speed multiplier.
export const KRAKEN_SPEED = 24;
export const KRAKEN_ATTACK_ARMS = [0, 7];
const PURSUIT_DISTANCE = 120;
const TURN_SPEED = 0.8;
export const KRAKEN_ARMS = Array.from({ length: 8 }, (_, i) => {
  const angle = [0.78, 1.38, 2.05, 2.72, -2.72, -2.05, -1.38, -0.78][i];
  return { x: Math.sin(angle) * 80, z: Math.cos(angle) * 76, angle };
});
export function strikeHitsShip(target, ship, hull) {
  const dx = target.x - ship.x,
    dz = target.z - ship.z;
  const side = dx * Math.cos(ship.heading) - dz * Math.sin(ship.heading);
  const front = -dx * Math.sin(ship.heading) - dz * Math.cos(ship.heading);
  return (
    Math.hypot(
      Math.max(0, Math.abs(side) - hull.halfWidth),
      Math.max(0, front - hull.bow, -front - hull.stern),
    ) <= 13
  );
}

function localTarget(k, target) {
  const dx = target.x - k.x,
    dz = target.z - k.z;
  return {
    x: dx * Math.cos(k.heading) - dz * Math.sin(k.heading),
    z: dx * Math.sin(k.heading) + dz * Math.cos(k.heading),
  };
}

function pursue(k, ship, dt, openWater) {
  const dx = ship.x - k.x,
    dz = ship.z - k.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.001) return;
  const heading = Math.atan2(dx, dz);
  const delta = Math.atan2(
    Math.sin(heading - k.heading),
    Math.cos(heading - k.heading),
  );
  k.heading += Math.max(-TURN_SPEED * dt, Math.min(TURN_SPEED * dt, delta));
  const travel = Math.min(
    KRAKEN_SPEED * dt,
    Math.max(0, distance - PURSUIT_DISTANCE),
  );
  k.navigationWait = Math.max(0, k.navigationWait - dt);
  if (!travel || k.navigationWait > 0) return;
  if (travel > k.safeTravel) {
    // Validate a swept footprint for the next quarter second of travel. The
    // distance budget also stays safe if the boat suddenly changes direction.
    const budget = Math.max(KRAKEN_SPEED * 0.25, travel);
    if (!openWater(k.x, k.z, 180 + budget)) {
      k.safeTravel = 0;
      k.navigationWait = 0.25;
      return;
    }
    k.safeTravel = budget;
  }
  k.x += (dx / distance) * travel;
  k.z += (dz / distance) * travel;
  k.safeTravel -= travel;
}

// Simulation owns spawn/attack state; models remain reusable, stateless builders.
// Updates only receive unpaused game time. Randomness is injectable for tests.
export class KrakenEncounter {
  constructor(random = Math.random) {
    this.random = random;
    this.reset();
  }
  reset() {
    this.active = null;
    this.wait = 24 + this.random() * 30;
  }
  update(dt, ship, { openWater, hull }) {
    const events = [];
    if (!(dt > 0)) return events;
    let k = this.active;
    if (!k) {
      if (atlanticWeight(ship.x, ship.z) < 0.8) return events;
      this.wait -= dt;
      if (this.wait > 0) return events;
      this.wait = 8;
      const bearing = ship.heading + (this.random() - 0.5) * 1.3;
      const x = ship.x - Math.sin(bearing) * 185,
        z = ship.z - Math.cos(bearing) * 185;
      if (
        atlanticWeight(x, z) < 0.8 ||
        !openWater(ship.x, ship.z, 180) ||
        !openWater(x, z, 180)
      )
        return events;
      k = this.active = {
        x,
        z,
        heading: Math.atan2(ship.x - x, ship.z - z),
        age: 0,
        retreat: 0,
        nextAttack: 6,
        attacks: [],
        cooldowns: Array(8).fill(0),
        seed: Math.floor(this.random() * 100000),
        safeTravel: 0,
        navigationWait: 0,
      };
      events.push({ type: "spawn", kraken: k });
    }
    k.age += dt;
    const distance = Math.hypot(k.x - ship.x, k.z - ship.z);
    if (
      !k.retreat &&
      (distance > 420 || k.age > 85 || atlanticWeight(ship.x, ship.z) < 0.35)
    ) {
      k.retreat = dt;
      k.attacks = [];
      events.push({ type: "retreat" });
    } else if (k.retreat) k.retreat += dt;
    if (k.retreat > 5) {
      this.active = null;
      this.wait = 75 + this.random() * 75;
      events.push({ type: "despawn" });
      return events;
    }
    if (k.retreat) return events;
    // Emerge first, then swim at a fixed speed and keep enough space to strike.
    pursue(k, ship, Math.min(dt, Math.max(0, k.age - 4)), openWater);
    for (const attack of k.attacks) {
      // The body now moves and turns, but the telegraphed impact point must
      // remain locked in world space so a faster boat can dodge it.
      attack.target = localTarget(k, attack.worldTarget);
      const previous = attack.age;
      attack.age += dt;
      if (previous < KRAKEN_IMPACT && attack.age >= KRAKEN_IMPACT) {
        events.push({
          type: "impact",
          target: attack.worldTarget,
          hit: strikeHitsShip(attack.worldTarget, ship, hull),
          arm: attack.arm,
        });
      }
    }
    k.attacks = k.attacks.filter((a) => a.age < KRAKEN_ATTACK_LENGTH);
    k.nextAttack -= dt;
    if (k.nextAttack <= 0 && k.age > 5) {
      const target = localTarget(k, ship);
      const candidates = KRAKEN_ATTACK_ARMS.map((i) => ({
        i,
        d: Math.hypot(KRAKEN_ARMS[i].x - target.x, KRAKEN_ARMS[i].z - target.z),
      }))
        .filter(
          (a) =>
            target.z > 0 && a.d < 118 && a.d > 15 && k.cooldowns[a.i] <= k.age,
        )
        .sort((a, b) => a.d - b.d);
      if (candidates.length) {
        const arm =
          candidates[Math.floor(this.random() * Math.min(3, candidates.length))]
            .i;
        k.attacks.push({
          arm,
          age: 0,
          target,
          worldTarget: { x: ship.x, z: ship.z },
        });
        k.cooldowns[arm] = k.age + 7;
        events.push({ type: "windup", arm });
      }
      k.nextAttack = 1.7 + this.random() * 0.9;
    }
    return events;
  }
}
