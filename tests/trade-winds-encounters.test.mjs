import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../assets/vendor/three.module.js";
import { newState, toWorld } from "../trade-winds-engine.mjs?v=cargo-80";
import { createEncounters } from "../trade-winds-encounters.mjs";

function setup(t) {
  const oldDocument = globalThis.document,
    oldMatchMedia = globalThis.matchMedia;
  const elements = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id))
        elements.set(id, { hidden: false, textContent: "" });
      return elements.get(id);
    },
  };
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
    if (oldMatchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = oldMatchMedia;
  });
  t.mock.method(Math, "random", () => 0.5);
  let state = newState(toWorld(-60, 25)),
    paused = false,
    saves = 0;
  const scene = new THREE.Scene();
  const encounters = createEncounters({
    scene,
    getState: () => state,
    getTime: () => 60,
    sailing: {
      speed: 0,
      stop() {
        this.speed = 0;
      },
    },
    // Allow debris/storm footprints; keep asset-backed frigates and other mobs out.
    openWater: (x, z, radius) => [18, 22, 55].includes(radius),
    paused: () => paused,
    toast() {},
    updateHUD() {},
    saveGame: () => saves++,
    rescue() {},
  });
  return {
    scene,
    encounters,
    elements,
    get state() {
      return state;
    },
    replace(value) {
      state = value;
    },
    pause(value) {
      paused = value;
    },
    get saves() {
      return saves;
    },
  };
}

test("encounter reset removes transient models and clears water fields while preserving the voyage", (t) => {
  const v = setup(t),
    before = structuredClone(v.state);
  assert.ok(v.encounters.sharkShadows.value.every((field) => field.w === 0));
  v.encounters.update(6);
  v.encounters.updateStorms(56);
  v.encounters.renderStorms();
  assert.ok(v.encounters.debris.length > 0);
  assert.ok(v.encounters.storms.length > 0);
  assert.ok(v.scene.children.length > 0);
  assert.ok(v.encounters.stormFields.value.some((field) => field.z > 0));
  v.encounters.reset({ newVoyage: true });
  assert.deepEqual(v.state, before);
  assert.equal(v.scene.children.length, 0);
  assert.equal(v.encounters.debris.length, 0);
  assert.equal(v.encounters.storms.length, 0);
  assert.equal(v.encounters.speedMultiplier, 1);
  for (const field of [
    ...v.encounters.stormFields.value,
    ...v.encounters.sharkShadows.value,
  ]) {
    assert.deepEqual(field.toArray(), [0, 0, 0, 0]);
  }
  assert.equal(v.elements.get("salvage").hidden, true);
});

test("salvage uses the current voyage, cannot run while paused, and saves its reward once", (t) => {
  const v = setup(t);
  v.encounters.update(6);
  const item = v.encounters.debris[0];
  assert.ok(item);
  const old = v.state,
    next = structuredClone(old);
  next.x = item.x;
  next.z = item.z;
  v.replace(next);
  v.pause(true);
  v.encounters.salvage(item.id);
  assert.equal(next.coins, old.coins);
  v.pause(false);
  v.encounters.salvage();
  assert.equal(next.coins, old.coins + 10);
  assert.equal(next.cargo[item.good], item.quantity);
  assert.equal(v.saves, 1);
  v.encounters.salvage(item.id);
  assert.equal(v.saves, 1);
  v.encounters.reset();
});
