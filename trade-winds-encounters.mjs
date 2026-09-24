import * as THREE from "./assets/vendor/three.module.js";
import {
  GOODS,
  cargoCount,
  VESSELS,
} from "./trade-winds-engine.mjs?v=cargo-80";
import {
  createKraken,
  animateKraken,
  disposeModel,
} from "./trade-winds-models.mjs?v=island-post-1";
import {
  atlanticWeight,
  buoyancyHeight,
  waveHeight,
} from "./trade-winds-ocean.mjs?v=whirlpool-1";
import { KrakenEncounter } from "./trade-winds-mobs.mjs";
import {
  DebrisEncounters,
  createDebrisVisual,
  animateDebrisVisual,
} from "./trade-winds-debris.mjs";
import {
  SharkEncounters,
  createShark,
  animateShark,
} from "./trade-winds-sharks.mjs?v=spawn-3";
import {
  FrigateEncounters,
  createFrigate,
  animateFrigate,
  disposeFrigate,
} from "./trade-winds-frigates.mjs?v=forward-rig-1";
import { FrigateWake } from "./trade-winds-frigate-wake.mjs";
import { WhirlpoolHazard } from "./trade-winds-whirlpool-field.mjs?v=pull-2";
import {
  StormEncounters,
  createStorm,
  animateStorm,
  disposeStorm,
  stormOpacity,
  stormExposure,
} from "./trade-winds-storms.mjs?v=size-4";

export function createEncounters({
  scene,
  getState,
  getTime,
  sailing,
  openWater: openMonsterWater,
  paused,
  toast,
  updateHUD,
  saveGame,
  rescue,
}) {
  const $ = (id) => document.getElementById(id);
  const storms = new StormEncounters(),
    stormModels = new Map();
  const stormFields = { value: [new THREE.Vector4(), new THREE.Vector4()] };
  const reducedLightning = matchMedia("(prefers-reduced-motion: reduce)");
  const whirlpoolHazard = new WhirlpoolHazard(),
    encounter = new KrakenEncounter();
  const debrisEncounters = new DebrisEncounters(),
    debrisModels = new Map();
  const sharkEncounters = new SharkEncounters(),
    sharkModels = new Map();
  const frigateEncounters = new FrigateEncounters(),
    frigateModels = new Map(),
    frigateWakes = new Map();
  const sharkShadows = {
    value: Array.from({ length: 3 }, () => new THREE.Vector4(0, 0, 0, 0)),
  };
  let krakenModel = null,
    atlanticAnnounced = false;

  function clearStorms() {
    for (const model of stormModels.values()) disposeStorm(model);
    stormModels.clear();
    storms.reset();
    stormFields.value.forEach((v) => v.set(0, 0, 0, 0));
  }
  function updateStorms(dt) {
    const state = getState();
    for (const event of storms.update(dt, state, {
      openWater: openMonsterWater,
    })) {
      if (event.type === "spawn") {
        const model = createStorm(event.storm.seed);
        stormModels.set(event.storm.id, model);
        scene.add(model);
      } else if (event.type === "despawn") {
        const model = stormModels.get(event.id);
        if (model) disposeStorm(model);
        stormModels.delete(event.id);
      } else if (event.type === "enter")
        toast(
          "Heavy rain — reduced sailing speed. Sail out from beneath the storm.",
          5000,
        );
      else if (event.type === "leave")
        toast("Clear of the storm. Sailing speed restored.", 2500);
      else if (event.type === "damage") {
        state.health = Math.max(0, state.health - event.damage);
        updateHUD();
        if (state.health === 0) {
          rescue("The storm finished off your damaged ship. ");
          return;
        }
      }
    }
  }
  function clearKraken() {
    if (!krakenModel) return;
    scene.remove(krakenModel);
    disposeModel(krakenModel);
    krakenModel = null;
  }
  function removeDebris(id) {
    const model = debrisModels.get(id);
    if (model) {
      scene.remove(model);
      disposeModel(model);
      debrisModels.delete(id);
    }
  }
  function clearDebris() {
    for (const id of debrisModels.keys()) removeDebris(id);
    debrisEncounters.reset();
    $("salvage").hidden = true;
  }
  function updateDebris(dt) {
    const state = getState(),
      clockTime = getTime();
    for (const event of debrisEncounters.update(dt, state, openMonsterWater)) {
      if (event.type === "spawn") {
        const model = createDebrisVisual(event.item);
        debrisModels.set(event.item.id, model);
        scene.add(model);
      } else removeDebris(event.id);
    }
    for (const item of debrisEncounters.active) {
      const model = debrisModels.get(item.id);
      if (model) animateDebrisVisual(model, item, clockTime);
    }
    const nearest = debrisEncounters.nearest(state);
    $("salvage").hidden = paused() || !nearest;
    const label =
      cargoCount(state) >= state.capacity
        ? "10 gold · hold full"
        : "10 gold + random cargo";
    if ($("salvage-reward").textContent !== label)
      $("salvage-reward").textContent = label;
  }
  function salvageDebris(id) {
    const state = getState();
    if (id === undefined) id = debrisEncounters.nearest(state)?.id;
    if (paused() || id === undefined) return;
    const reward = debrisEncounters.collect(id, state);
    if (!reward) return;
    removeDebris(reward.id);
    const good = GOODS.find((g) => g.id === reward.good);
    toast(
      reward.quantity
        ? `Salvaged! +10 gold, +${reward.quantity} ${good.name.toLowerCase()}.${reward.leftBehind ? " Hold now full." : ""}`
        : "Salvaged! +10 gold. Hold full — no cargo taken.",
    );
    updateHUD();
    $("salvage").hidden = !debrisEncounters.nearest(state);
    saveGame(true);
  }
  function clearSharks() {
    for (const model of sharkModels.values()) {
      scene.remove(model);
      disposeModel(model);
    }
    sharkModels.clear();
    sharkShadows.value.forEach((shadow) => shadow.set(0, 0, 0, 0));
    sharkEncounters.reset();
  }
  function clearFrigates() {
    for (const wake of frigateWakes.values()) wake.dispose();
    frigateWakes.clear();
    for (const model of frigateModels.values()) {
      scene.remove(model);
      disposeFrigate(model);
    }
    frigateModels.clear();
    frigateEncounters.reset();
  }
  function updateFrigates(dt) {
    const state = getState(),
      clockTime = getTime();
    for (const event of frigateEncounters.update(dt, state, {
      openWater: openMonsterWater,
    })) {
      if (event.type === "spawn") {
        const model = createFrigate();
        frigateModels.set(event.frigate.id, model);
        scene.add(model);
        const trail = new FrigateWake();
        frigateWakes.set(event.frigate.id, trail);
        scene.add(trail.mesh);
      } else if (event.type === "despawn") {
        const model = frigateModels.get(event.id);
        if (model) {
          scene.remove(model);
          disposeFrigate(model);
        }
        frigateModels.delete(event.id);
        frigateWakes.get(event.id)?.dispose();
        frigateWakes.delete(event.id);
      }
    }
    for (const f of frigateEncounters.active) {
      const model = frigateModels.get(f.id);
      if (!model) continue;
      const opacity =
        THREE.MathUtils.smoothstep(f.age, 0, 2) *
        THREE.MathUtils.smoothstep(f.lifetime - f.age, 0, 2) *
        (1 -
          THREE.MathUtils.smoothstep(
            Math.hypot(f.x - state.x, f.z - state.z),
            570,
            650,
          ));
      model.position.set(f.x, buoyancyHeight(f.x, f.z, clockTime), f.z);
      model.rotation.set(
        Math.sin(f.age * 0.8 + f.phase) * 0.012,
        f.heading,
        Math.sin(f.age + f.phase) * 0.018,
      );
      animateFrigate(model, f.age + f.phase, opacity);
      frigateWakes
        .get(f.id)
        ?.update(
          dt,
          f,
          (x, z) =>
            waveHeight(
              Math.round(x / 12) * 12,
              Math.round(z / 12) * 12,
              clockTime,
            ) + 0.45,
          opacity,
        );
    }
  }
  function updateMobs(dt) {
    const state = getState(),
      clockTime = getTime();
    updateDebris(dt);
    updateFrigates(dt);
    for (const event of sharkEncounters.update(dt, state, {
      openWater: openMonsterWater,
      hull: VESSELS[state.vessel],
    })) {
      if (event.type === "spawn") {
        const model = createShark();
        sharkModels.set(event.shark.id, model);
        scene.add(model);
      } else if (event.type === "despawn") {
        const model = sharkModels.get(event.id);
        if (model) {
          scene.remove(model);
          disposeModel(model);
        }
        sharkModels.delete(event.id);
      } else if (event.type === "chase") {
        toast("Shark closing in! Keep sailing to outrun it.");
      } else if (event.type === "bite") {
        state.health = Math.max(0, state.health - event.damage);
        toast(`Shark bite! Lost ${event.damage} hull — keep moving.`);
        updateHUD();
        if (state.health <= 0) {
          rescue();
          return;
        }
      }
    }
    sharkShadows.value.forEach((shadow) => shadow.set(0, 0, 0, 0));
    for (const [index, shark] of sharkEncounters.active.entries()) {
      const model = sharkModels.get(shark.id);
      if (!model) continue;
      const rise = THREE.MathUtils.smoothstep(shark.age, 0, 1.2);
      model.position.set(
        shark.x,
        buoyancyHeight(shark.x, shark.z, clockTime) - 7 * (1 - rise),
        shark.z,
      );
      model.rotation.y = shark.heading;
      sharkShadows.value[index].set(shark.x, shark.z, shark.heading, rise);
      model.userData.shark.wake.visible = rise > 0.8;
      animateShark(
        model,
        shark.age + shark.phase,
        shark.mode === "chase",
        (x, z) =>
          waveHeight(
            Math.round(x / 12) * 12,
            Math.round(z / 12) * 12,
            clockTime,
          ) + 0.45,
      );
    }
    const weight = atlanticWeight(state.x, state.z);
    if (!atlanticAnnounced && weight > 0.8) {
      atlanticAnnounced = true;
      toast(
        "Atlantic Ocean — heavy swells. Keep watch for movement below.",
        6000,
      );
    } else if (weight < 0.2) atlanticAnnounced = false;
    const events = encounter.update(dt, state, {
      openWater: openMonsterWater,
      hull: VESSELS[state.vessel],
    });
    for (const event of events) {
      if (event.type === "spawn") {
        krakenModel = createKraken(event.kraken.seed);
        krakenModel.position.set(event.kraken.x, -90, event.kraken.z);
        krakenModel.rotation.y = event.kraken.heading;
        scene.add(krakenModel);
        toast(
          "Kraken! Watch the raised arms and sail away from their strikes.",
          7000,
        );
      } else if (event.type === "impact" && event.hit) {
        state.health = Math.max(0, state.health - 12);
        sailing.speed *= 0.6;
        toast("Tentacle strike! Hull damaged — keep moving.");
        updateHUD();
        if (state.health <= 0) {
          rescue();
          return;
        }
      } else if (event.type === "retreat") {
        toast("The Kraken slips back into the depths.");
      } else if (event.type === "despawn") clearKraken();
    }
    const k = encounter.active;
    if (k && krakenModel) {
      const rise = THREE.MathUtils.smoothstep(k.age, 0, 4);
      const sink = THREE.MathUtils.smoothstep(k.retreat, 0, 5);
      krakenModel.position.set(k.x, -95 * (1 - rise) - 110 * sink, k.z);
      krakenModel.rotation.y = k.heading;
      const cos = Math.cos(k.heading),
        sin = Math.sin(k.heading);
      animateKraken(
        krakenModel,
        k.age,
        k.attacks,
        (x, z) =>
          waveHeight(
            k.x + x * cos + z * sin,
            k.z + z * cos - x * sin,
            clockTime,
          ) - krakenModel.position.y,
      );
    }
  }
  function renderStorms() {
    const state = getState(),
      clockTime = getTime();
    stormFields.value.forEach((v) => v.set(0, 0, 0, 0));
    storms.active.forEach((storm, index) => {
      const model = stormModels.get(storm.id);
      if (!model) return;
      model.position.set(storm.x, 0, storm.z);
      model.scale.set(storm.radius / 100, 1, storm.radius / 100);
      const opacity = stormOpacity(storm);
      animateStorm(model, storm.age, {
        opacity,
        cloudOpacity: 1 - 0.55 * stormExposure(storm, state),
        reducedMotion: reducedLightning.matches,
        surfaceHeight: (x, z) =>
          waveHeight(
            Math.round(x / 12) * 12,
            Math.round(z / 12) * 12,
            clockTime,
          ) + 0.45,
      });
      stormFields.value[index].set(storm.x, storm.z, storm.radius, opacity);
    });
  }
  function updateWhirlpoolHazard(dt, previous) {
    const state = getState();
    for (const event of whirlpoolHazard.update(
      dt,
      state,
      VESSELS[state.vessel],
      previous,
    )) {
      if (event.type === "warning")
        toast(
          "Whirlpool! The current is pulling you inward — sail away from the dark center.",
          6500,
        );
      if (event.type === "rock") {
        sailing.stop();
        updateHUD();
        toast(
          "Whirlpool rocks! Lost 8 hull — steer clear of the breaking foam.",
        );
      }
      if (event.type === "death") {
        rescue("Your ship was destroyed in the Gulf whirlpool. ");
        return;
      }
    }
  }
  $("salvage").onclick = () => salvageDebris();
  return {
    stormFields,
    sharkShadows,
    renderStorms,
    updateStorms,
    update: updateMobs,
    updateWhirlpool: updateWhirlpoolHazard,
    salvage: salvageDebris,
    get storms() {
      return storms.active;
    },
    get speedMultiplier() {
      return storms.speedMultiplier;
    },
    get debris() {
      return debrisEncounters.active;
    },
    reset({ newVoyage = false } = {}) {
      whirlpoolHazard.reset();
      clearStorms();
      clearDebris();
      clearSharks();
      clearFrigates();
      clearKraken();
      encounter.reset();
      if (newVoyage) atlanticAnnounced = false;
    },
  };
}
