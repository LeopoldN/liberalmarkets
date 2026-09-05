// World-space foam history: emissions are spaced by distance, never frame rate.
export class WakeTrail {
  constructor(capacity = 1100) {
    this.particles = Array.from({ length: capacity }, () => ({
      age: 0,
      life: 0,
    }));
    this.cursor = 0;
    this.sequence = 0;
    this.carry = 0;
    this.previous = null;
  }
  reset(position) {
    for (const particle of this.particles) particle.life = 0;
    this.carry = 0;
    this.previous = { x: position.x, z: position.z, heading: position.heading };
  }
  spawn(x, z, vx, vz, life, size, lift = 0) {
    const particle = this.particles[this.cursor];
    Object.assign(particle, {
      x,
      z,
      vx,
      vz,
      life,
      size,
      lift,
      age: 0,
      seed: this.sequence++,
    });
    this.cursor = (this.cursor + 1) % this.particles.length;
  }
  update(dt, position) {
    for (const p of this.particles) {
      if (p.age >= p.life) continue;
      p.age += dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const drag = Math.exp(-dt * 0.2);
      p.vx *= drag;
      p.vz *= drag;
    }
    if (!this.previous) {
      this.reset(position);
      return;
    }
    const previous = this.previous;
    const dx = position.x - previous.x,
      dz = position.z - previous.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 60) {
      this.reset(position);
      return;
    }
    if (distance > 0.001) {
      const ax = -dx / distance,
        az = -dz / distance;
      const rx = az,
        rz = -ax;
      const intensity = Math.min(1, distance / Math.max(dt, 0.001) / 20);
      const spacing = 1.5;
      for (
        let along = spacing - this.carry;
        along <= distance;
        along += spacing
      ) {
        const fraction = along / distance;
        const x = previous.x + dx * fraction,
          z = previous.z + dz * fraction;
        const n = Math.sin(this.sequence * 12.9898) * 43758.5453;
        const random = n - Math.floor(n);
        // The trailing end swaps when backing down, so reverse motion has a wake too.
        const stern = 12;
        for (const side of [-1, 1]) {
          for (let layer = 0; layer < 2; layer++) {
            const seed = Math.sin((this.sequence + 1) * 73.17) * 9217.41;
            const scatter = seed - Math.floor(seed);
            const spread = side * (1.4 + layer * 1.8) + (scatter - 0.5) * 5;
            const behind = stern + scatter * 5;
            const drift = 0.45 + scatter * 1.7 + intensity * 0.3;
            this.spawn(
              x + ax * behind + rx * spread,
              z + az * behind + rz * spread,
              ax * scatter * 0.8 + rx * side * drift,
              az * scatter * 0.8 + rz * side * drift,
              4.5 + scatter * 5,
              1.3 + scatter * 2.2,
            );
          }
        }
        this.spawn(
          x + ax * (stern + random * 3) + rx * (random - 0.5) * 6,
          z + az * (stern + random * 3) + rz * (random - 0.5) * 6,
          ax * 0.3,
          az * 0.3,
          5 + random * 2,
          2.0 + random * 1.4,
        );
        if (intensity > 0.25) {
          for (const side of [-1, 1]) {
            this.spawn(
              x - ax * 13 + rx * side * 4.8,
              z - az * 13 + rz * side * 4.8,
              rx * side * 2.4 + ax,
              rz * side * 2.4 + az,
              1.3 + random,
              0.7 + random * 0.8,
              intensity * (0.6 + random),
            );
          }
        }
      }
      this.carry = (this.carry + distance) % spacing;
    }
    this.previous = { x: position.x, z: position.z, heading: position.heading };
  }
}
