import * as THREE from "./assets/vendor/three.module.js";
import { VESSELS } from "./trade-winds-engine.mjs?v=cargo-80";

const TAU = Math.PI * 2;

// Read the current voyage on every step: trading and resuming can replace it.
export function createSailing({
  keys,
  ports,
  isSolid,
  getState,
  getSpeedMultiplier,
  toast,
  updateHUD,
  saveGame,
  rescue,
  enterPort,
  updateCompass,
}) {
  let speed = 0,
    clickTarget = null,
    ignorePort = null;
  let lastImpact = -10,
    saveClock = 0;

  function angleDelta(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }
  function updateMovement(dt) {
    const state = getState();
    let throttle = 0;
    const forward = keys.has("w") || keys.has("arrowup"),
      back = keys.has("s") || keys.has("arrowdown"),
      left = keys.has("a") || keys.has("arrowleft"),
      right = keys.has("d") || keys.has("arrowright");
    if (forward || back || left || right) clickTarget = null;
    if (forward) throttle = 1;
    if (back) throttle = -0.35;
    if (left) state.heading += dt * 1.15;
    if (right) state.heading -= dt * 1.15;
    if (clickTarget) {
      const dx = clickTarget.x - state.x,
        dz = clickTarget.z - state.z,
        d = Math.hypot(dx, dz);
      if (d < 7) {
        clickTarget = null;
        speed = 0;
      } else {
        const target = Math.atan2(-dx, -dz),
          delta = angleDelta(target, state.heading);
        state.heading += THREE.MathUtils.clamp(delta, -dt * 1.05, dt * 1.05);
        throttle = Math.max(0.2, 1 - Math.abs(delta) / Math.PI);
      }
    }
    const wind = 0.9 + 0.1 * Math.cos(state.heading + 0.6);
    speed = THREE.MathUtils.damp(
      speed,
      throttle * VESSELS[state.vessel].speed * wind * getSpeedMultiplier(),
      throttle ? 1.2 : 2.2,
      dt,
    );
    state.heading = ((state.heading % TAU) + TAU) % TAU;
    const nx = state.x - Math.sin(state.heading) * speed * dt,
      nz = state.z - Math.cos(state.heading) * speed * dt;
    const hull = VESSELS[state.vessel];
    const reach = speed >= 0 ? hull.bow : hull.stern;
    const fx = nx - Math.sin(state.heading) * reach * Math.sign(speed),
      fz = nz - Math.cos(state.heading) * reach * Math.sign(speed);
    // Collide with the same voxel cells used by terrain, including the hull's width.
    if (
      Math.abs(speed) > 0.1 &&
      (isSolid(fx, fz) ||
        isSolid(
          nx + Math.cos(state.heading) * hull.halfWidth,
          nz - Math.sin(state.heading) * hull.halfWidth,
        ) ||
        isSolid(
          nx - Math.cos(state.heading) * hull.halfWidth,
          nz + Math.sin(state.heading) * hull.halfWidth,
        ))
    ) {
      if (state.elapsed - lastImpact > 2 && Math.abs(speed) > 3) {
        state.health = Math.max(0, state.health - 6);
        lastImpact = state.elapsed;
        toast("Shallow water! Turn away from the coast.");
        updateHUD();
      }
      speed = 0;
      clickTarget = null;
    } else {
      state.x = THREE.MathUtils.clamp(nx, -5500, 4800);
      state.z = THREE.MathUtils.clamp(nz, -2500, 3550);
      if (state.x !== nx || state.z !== nz) {
        speed = 0;
        clickTarget = null;
        toast(
          "Beyond these waters lies another voyage. Turn back toward the Caribbean.",
        );
      }
    }
    state.elapsed += dt;
    saveClock += dt;
    if (saveClock > 30) {
      saveGame(true);
      saveClock = 0;
    }
    if (state.health <= 0) {
      rescue();
      return;
    }
    for (const p of ports) {
      const d = Math.hypot(state.x - p.x, state.z - p.z);
      if (ignorePort === p.id && d > 90) ignorePort = null;
      if (d < 43 && ignorePort !== p.id) {
        enterPort(p);
        break;
      }
    }
    updateCompass();
  }
  return {
    update: updateMovement,
    stop() {
      speed = 0;
      clickTarget = null;
    },
    get speed() {
      return speed;
    },
    set speed(value) {
      speed = value;
    },
    get target() {
      return clickTarget;
    },
    set target(value) {
      clickTarget = value;
    },
    get ignoredPort() {
      return ignorePort;
    },
    set ignoredPort(value) {
      ignorePort = value;
    },
  };
}
