import test from "node:test";
import assert from "node:assert/strict";
import { newState, VESSELS } from "../trade-winds-engine.mjs?v=cargo-80";
import { createSailing } from "../trade-winds-sailing.mjs";

function voyage(options = {}) {
  let state = newState({ x: 0, z: 0 });
  state.heading = 0;
  const keys = new Set(),
    events = [];
  const sailing = createSailing({
    keys,
    ports: [],
    isSolid: () => false,
    getState: () => state,
    getSpeedMultiplier: () => 1,
    toast: (message) => events.push(["toast", message]),
    updateHUD: () => events.push(["hud"]),
    saveGame: (silent) => events.push(["save", silent]),
    rescue: () => events.push(["rescue"]),
    enterPort: (port) => events.push(["port", port.id]),
    updateCompass: () => events.push(["compass"]),
    ...options,
  });
  return {
    sailing,
    keys,
    events,
    get state() {
      return state;
    },
    replace(next) {
      state = next;
    },
  };
}

function advance(sailing, seconds) {
  for (let i = 0; i < seconds * 30; i++) sailing.update(1 / 30);
}

test("sailing preserves vessel speeds, wind, reverse, and storm slowdown", () => {
  for (const vessel of ["raft", "trader"]) {
    for (const multiplier of [1, 0.65]) {
      const v = voyage({ getSpeedMultiplier: () => multiplier });
      v.state.vessel = vessel;
      v.keys.add("w");
      advance(v.sailing, 15);
      const maximum =
        VESSELS[vessel].speed * (0.9 + 0.1 * Math.cos(0.6)) * multiplier;
      assert.ok(Math.abs(v.sailing.speed - maximum) < 0.001);
      assert.ok(v.state.z < 0);
      v.keys.clear();
      v.keys.add("s");
      advance(v.sailing, 15);
      assert.ok(Math.abs(v.sailing.speed + maximum * 0.35) < 0.001);
    }
  }
});

test("pointer arrival stops, keyboard steering cancels the destination, and anchor clears motion", () => {
  const v = voyage();
  v.sailing.target = { x: 0, z: -100 };
  advance(v.sailing, 1);
  assert.ok(v.sailing.speed > 0);
  v.keys.add("a");
  v.sailing.update(1 / 30);
  assert.equal(v.sailing.target, null);
  assert.ok(v.state.heading > 0);
  v.keys.clear();
  v.sailing.target = { x: v.state.x, z: v.state.z - 2 };
  v.sailing.update(1 / 30);
  assert.equal(v.sailing.speed, 0);
  assert.equal(v.sailing.target, null);
  v.sailing.target = { x: 0, z: -200 };
  advance(v.sailing, 1);
  v.sailing.stop();
  assert.equal(v.sailing.speed, 0);
  assert.equal(v.sailing.target, null);
});

test("coast collisions sample the hull width, stop motion, and respect the damage cooldown", () => {
  const samples = [];
  const v = voyage({
    isSolid: (x, z) => {
      samples.push([x, z]);
      return x > 8;
    },
  });
  v.sailing.speed = 20;
  v.sailing.update(1 / 30);
  assert.equal(v.state.health, 94);
  assert.equal(v.state.z, 0);
  assert.equal(v.sailing.speed, 0);
  assert.ok(samples.some(([x]) => x === VESSELS.raft.halfWidth));
  v.sailing.speed = 20;
  v.sailing.update(1 / 30);
  assert.equal(v.state.health, 94);
  v.state.elapsed += 2.1;
  v.sailing.speed = 20;
  v.sailing.update(1 / 30);
  assert.equal(v.state.health, 88);
});

test("leaving port suppresses reentry until the boat clears the harbor", () => {
  const v = voyage({ ports: [{ id: "royal", x: 0, z: 0 }] });
  v.sailing.ignoredPort = "royal";
  v.sailing.update(1 / 30);
  assert.equal(
    v.events.some(([type]) => type === "port"),
    false,
  );
  v.state.z = 91;
  v.sailing.update(1 / 30);
  assert.equal(v.sailing.ignoredPort, null);
  v.state.z = 42;
  v.sailing.update(1 / 30);
  assert.deepEqual(
    v.events.filter(([type]) => type === "port"),
    [["port", "royal"]],
  );
});

test("sailing reads replacement voyage state after trading or resuming", () => {
  const v = voyage();
  const previous = v.state;
  const replacement = structuredClone(previous);
  replacement.vessel = "trader";
  replacement.coins = 123;
  v.replace(replacement);
  v.keys.add("w");
  advance(v.sailing, 1);
  assert.equal(previous.z, 0);
  assert.equal(previous.elapsed, 0);
  assert.ok(replacement.z < 0);
  assert.ok(replacement.elapsed > 0);
  assert.equal(replacement.coins, 123);
});

test("autosave remains tied to simulation time and rescue takes precedence over docking", () => {
  const v = voyage({ ports: [{ id: "royal", x: 0, z: 0 }] });
  advance(v.sailing, 31);
  assert.deepEqual(
    v.events.filter(([type]) => type === "save"),
    [["save", true]],
  );
  v.events.length = 0;
  v.state.health = 0;
  v.sailing.update(1 / 30);
  assert.deepEqual(v.events, [["rescue"]]);
});

test("world edges clamp motion and independent voyages do not share controls", () => {
  const v = voyage(),
    other = voyage();
  v.state.z = -2499.9;
  v.sailing.speed = 40;
  v.sailing.target = { x: 0, z: -2700 };
  v.sailing.update(1 / 30);
  assert.equal(v.state.z, -2500);
  assert.equal(v.sailing.speed, 0);
  assert.equal(v.sailing.target, null);
  assert.equal(other.state.z, 0);
  assert.equal(other.state.elapsed, 0);
  assert.equal(other.sailing.ignoredPort, null);
});
