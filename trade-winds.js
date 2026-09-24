import * as THREE from "./assets/vendor/three.module.js";
import {
  createVessel,
  loadVesselAssets,
  animateVessel,
  createGull,
  disposeModel,
} from "./trade-winds-models.mjs?v=island-post-1";
import {
  atlanticWeight,
  buoyancyHeight,
  waveHeight,
} from "./trade-winds-ocean.mjs?v=whirlpool-1";
import { loadFrigateAsset } from "./trade-winds-frigates.mjs?v=forward-rig-1";
import { loadTradingPostAsset } from "./trade-winds-market-models.mjs";
import { WakeTrail } from "./trade-winds-wake.mjs";
import { TradeWindsAudio } from "./trade-winds-audio.mjs";
import {
  SAVE_KEY,
  VESSELS,
  newState,
  parseSave,
} from "./trade-winds-engine.mjs?v=cargo-80";
import {
  whirlpoolDistance,
  whirlpoolCurrent,
} from "./trade-winds-whirlpool-field.mjs?v=pull-2";
import {
  createWhirlpool,
  animateWhirlpool,
} from "./trade-winds-whirlpool.mjs?v=pull-2";
import { createSailingWorld } from "./trade-winds-world.mjs";
import { createSailing } from "./trade-winds-sailing.mjs";
import { createEncounters } from "./trade-winds-encounters.mjs";
import { createMarketUI } from "./trade-winds-market-ui.mjs";
import { createNavigationUI } from "./trade-winds-navigation-ui.mjs";
import { bindSailingInput } from "./trade-winds-input.mjs";

const $ = (id) => document.getElementById(id);
const keys = new Set(),
  ports = [];
let scene, camera, renderer, foam, ship, sun, coasts, state, loadedSave;
let world, encounters, whirlpool;
let started = false,
  zoom = 1,
  clockTime = 0,
  vesselAnimationTime = 0;
let lastTime = 0,
  terrainClock = 0,
  toastTimer;
const dummy = new THREE.Object3D();
const cameraAim = new THREE.Vector3(),
  desiredAim = new THREE.Vector3();
const wake = new WakeTrail();
const audio = new TradeWindsAudio();
const sailing = createSailing({
  keys,
  ports,
  isSolid: (...args) => world.isSolid(...args),
  getState: () => state,
  getSpeedMultiplier: () => encounters.speedMultiplier,
  toast,
  updateHUD,
  saveGame,
  rescue,
  enterPort: (port) => market.enter(port),
  updateCompass,
});
const market = createMarketUI({
  getState: () => state,
  setState: (next) => {
    state = next;
  },
  sailing,
  keys,
  audio,
  onVesselChange: setVessel,
  updateHUD,
  saveGame,
  toast,
  updateAudio,
});
const navigation = createNavigationUI({
  getState: () => state,
  getRenderer: () => renderer,
  getWater: () => world.water,
  ports,
  keys,
  saveGame,
  updateCompass,
});
$("start").onclick = () => begin(Boolean(loadedSave));
$("continue").onclick = () => begin(false);

function setVessel() {
  if (ship?.userData.vessel === state.vessel) return;
  if (ship) {
    scene.remove(ship);
    disposeModel(ship);
  }
  ship = createVessel(state.vessel);
  scene.add(ship);
  wake.reset(state);
}
function makeFoam() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.setAttribute(
    "foamLife",
    new THREE.InstancedBufferAttribute(
      new Float32Array(wake.particles.length * 2),
      2,
    ).setUsage(THREE.DynamicDrawUsage),
  );
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec2 foamLife;
      varying vec2 life;
      varying float shade;
      void main() {
        life = foamLife;
        shade = .76 + max(0., normal.y) * .24 + max(0., -normal.x) * .06;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 life;
      varying float shade;
      void main() {
        vec3 tint = mix(vec3(.16, .43, .41), vec3(.79, .89, .77), life.y);
        gl_FragColor = vec4(tint * shade, life.x);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(
    geometry,
    material,
    wake.particles.length,
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}
function updateFoam(dt) {
  wake.update(dt, state, VESSELS[state.vessel]);
  const life = foam.geometry.attributes.foamLife;
  let count = 0;
  for (const p of wake.particles) {
    if (p.age >= p.life) continue;
    const age = p.age / p.life;
    const fade = Math.pow(1 - age, 1.4);
    const swell = waveHeight(
      Math.round(p.x / 12) * 12,
      Math.round(p.z / 12) * 12,
      clockTime,
    );
    const spread = 1 + age * 0.65;
    const spray = p.lift * Math.max(0, Math.sin(Math.min(p.age * 3, Math.PI)));
    dummy.position.set(p.x, swell + (p.surface ? 0.5 : 0.62) + spray, p.z);
    dummy.rotation.set(0, p.heading, 0);
    dummy.scale.set(
      p.size * spread,
      p.surface ? 0.08 : 0.24 + fade * 0.26,
      p.size * (p.surface ? 2.3 : 0.7 + (p.seed % 3) * 0.2) * spread,
    );
    dummy.updateMatrix();
    foam.setMatrixAt(count, dummy.matrix);
    life.setXY(
      count,
      fade * (p.surface ? 0.52 : 0.65 + (p.seed % 5) * 0.06),
      0.16 + fade * 0.84,
    );
    count++;
  }
  foam.count = count;
  foam.instanceMatrix.needsUpdate = true;
  life.needsUpdate = true;
}
function updateBirds(dt) {
  const flock = scene.userData.birds;
  // The flock catches up gradually; individual birds fly broad, crossing arcs.
  const follow = 1 - Math.exp(-dt * 0.6);
  flock.position.x += (state.x - flock.position.x) * follow;
  flock.position.z += (state.z - flock.position.z) * follow;
  flock.children.forEach((gull, index) => {
    const phase = gull.userData.phase;
    const direction = index % 3 === 0 ? -1 : 1;
    const omega = (0.11 + (index % 3) * 0.019) * direction;
    const angle = clockTime * omega + phase;
    const rx = 50 + index * 10,
      rz = 35 + (index % 4) * 18;
    const drift = clockTime * 0.19 + phase;
    const vx = -Math.sin(angle) * rx * omega + Math.cos(drift) * 2.66;
    const vz = Math.cos(angle) * rz * omega + Math.cos(drift * 0.7) * 2.66;
    gull.position.set(
      Math.cos(angle) * rx + Math.sin(drift) * 14,
      49 + (index % 3) * 13 + Math.sin(clockTime * 0.5 + phase) * 5,
      Math.sin(angle) * rz + Math.sin(drift * 0.7) * 20,
    );
    const flapAmount = THREE.MathUtils.smoothstep(
      Math.sin(clockTime * 0.48 + phase),
      -0.2,
      0.55,
    );
    const stroke = Math.sin(clockTime * (7.3 + index * 0.19) + phase);
    const fold = Math.sin(clockTime * (7.3 + index * 0.19) + phase - 0.65);
    gull.rotation.set(
      Math.sin(clockTime * 0.5 + phase) * 0.07,
      Math.atan2(-vx, -vz),
      direction * (0.16 + Math.sin(drift) * 0.09),
      "YXZ",
    );
    for (const { shoulder, tip, side } of gull.userData.wings) {
      shoulder.rotation.z = side * (0.1 + stroke * 0.64 * flapAmount);
      tip.rotation.z = side * (0.08 + fold * 0.33 * flapAmount);
      tip.rotation.y = side * (0.11 + (1 - stroke) * 0.07 * flapAmount);
    }
  });
}
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x70aeb4);
  scene.fog = new THREE.FogExp2(0x89b6b5, 0.00023);
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  $("ocean").append(renderer.domElement);
  camera = new THREE.OrthographicCamera(-300, 300, 200, -200, 1, 4000);
  resize();
  scene.add(new THREE.HemisphereLight(0xe3f1dd, 0x537a68, 1.7));
  sun = new THREE.DirectionalLight(0xffe4b5, 2.8);
  sun.position.set(-180, 330, 140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -300,
    right: 300,
    top: 300,
    bottom: -300,
    near: 1,
    far: 1000,
  });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  encounters = createEncounters({
    scene,
    getState: () => state,
    getTime: () => clockTime,
    sailing,
    openWater: (...args) => world.openWater(...args),
    paused,
    toast,
    updateHUD,
    saveGame,
    rescue,
  });
  world = createSailingWorld({
    scene,
    camera,
    coasts,
    ports,
    sharkShadows: encounters.sharkShadows,
    stormFields: encounters.stormFields,
  });
  whirlpool = createWhirlpool();
  scene.add(whirlpool);
  foam = makeFoam();
  const home = ports[0];
  state = newState({
    x: home.x + home.normal.x * 20,
    z: home.z + home.normal.z * 20,
  });
  state.heading = Math.atan2(-home.normal.x, -home.normal.z);
  setVessel();
  cameraAim.set(state.x - 65, 0, state.z - 40);
  world.update(state, true);
  const birds = new THREE.Group();
  birds.position.set(state.x, 0, state.z);
  for (let i = 0; i < 7; i++) birds.add(createGull(i));
  scene.add(birds);
  scene.userData.birds = birds;
  bindSailingInput({
    canvas: renderer.domElement,
    camera,
    keys,
    sailing,
    navigation,
    audio,
    getState: () => state,
    isStarted: () => started,
    paused,
    isSolid: (...args) => world.isSolid(...args),
    getDebris: () => encounters.debris,
    salvage: (id) => encounters.salvage(id),
    getZoom: () => zoom,
    setZoom: (value) => {
      zoom = value;
    },
    resize,
    toast,
    updateAudio,
    saveGame,
  });
  window.addEventListener("resize", () => {
    resize();
    if ($("chart").open) navigation.drawChart();
  });
  requestAnimationFrame(frame);
}
function resize() {
  if (!renderer || !camera) return;
  renderer.setSize(innerWidth, innerHeight);
  const height = (innerWidth < 700 ? 360 : 400) * zoom;
  camera.left = (-height * innerWidth) / innerHeight / 2;
  camera.right = -camera.left;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}
function paused() {
  return (
    !started ||
    document.hidden ||
    $("market").open ||
    $("settings").open ||
    $("chart").open
  );
}
function updateAudio(dt = 0) {
  audio.update(dt, {
    started,
    hidden: document.hidden,
    paused: paused(),
    atPort: $("market").open,
    ship: state,
    speed: sailing.speed,
    storms: encounters?.storms || [],
  });
}
function frame(ms) {
  const dt = Math.min((ms - lastTime) / 1000 || 0, 0.25);
  lastTime = ms;
  updateAudio(dt);
  if (paused()) $("salvage").hidden = true;
  if ($("market").open || $("chart").open) {
    requestAnimationFrame(frame);
    return;
  }
  if (!document.hidden) {
    clockTime += dt;
    if (!paused()) {
      vesselAnimationTime += dt;
      let remaining = dt;
      while (remaining > 0 && !paused()) {
        const step = Math.min(remaining, 1 / 30);
        encounters.updateStorms(step);
        if (paused()) break;
        const previous = { x: state.x, z: state.z };
        sailing.update(step);
        if (!paused()) encounters.updateWhirlpool(step, previous);
        if (!paused()) encounters.update(step);
        remaining -= step;
      }
    }
    encounters.renderStorms();
    const roughness = atlanticWeight(state.x, state.z);
    animateVessel(ship, vesselAnimationTime);
    const seaY = buoyancyHeight(state.x, state.z, clockTime);
    // Immerse the sloop's lower hull while keeping the raft on the surface.
    const waterlineOffset = state.vessel === "trader" ? -1.6 : 1;
    ship.position.set(
      state.x,
      waterlineOffset + seaY + Math.sin(clockTime * 1.5) * 0.22,
      state.z,
    );
    ship.rotation.set(
      Math.sin(clockTime * 1.3) * (0.012 + roughness * 0.05),
      state.heading,
      Math.sin(clockTime * 1.6) * (0.025 + roughness * 0.065),
    );
    const whirlDistance = whirlpoolDistance(state.x, state.z);
    const whirlStrength = whirlpoolCurrent(state.x, state.z).strength;
    if (whirlStrength > 0) {
      const sx = Math.sin(state.heading) * 8,
        sz = Math.cos(state.heading) * 8;
      ship.rotation.x += Math.atan2(
        buoyancyHeight(state.x - sx, state.z - sz, clockTime) -
          buoyancyHeight(state.x + sx, state.z + sz, clockTime),
        16,
      );
      ship.rotation.z += whirlStrength * 0.12;
    }
    whirlpool.visible = whirlDistance < 1500;
    if (whirlpool.visible) animateWhirlpool(whirlpool, clockTime);
    const overview =
      1 + 0.65 * (1 - THREE.MathUtils.smoothstep(whirlDistance, 320, 750));
    const viewHeight = (innerWidth < 700 ? 360 : 400) * zoom * overview;
    camera.top = THREE.MathUtils.lerp(
      camera.top,
      viewHeight / 2,
      1 - Math.exp(-dt * 2),
    );
    camera.bottom = -camera.top;
    camera.right = (camera.top * innerWidth) / innerHeight;
    camera.left = -camera.right;
    camera.updateProjectionMatrix();
    const desired = desiredAim.set(
      state.x,
      seaY * whirlStrength * 0.4,
      state.z,
    );
    if (!started) desired.add(new THREE.Vector3(-65, 0, -35));
    cameraAim.lerp(desired, 1 - Math.exp(-dt * 3));
    camera.position.copy(cameraAim).add(new THREE.Vector3(330, 390, 480));
    camera.lookAt(cameraAim);
    sun.position.copy(cameraAim).add(new THREE.Vector3(-180, 330, 140));
    sun.target.position.copy(cameraAim);
    world.water.material.uniforms.time.value = clockTime;
    updateFoam(dt);
    updateBirds(dt);
    terrainClock += dt;
    if (terrainClock > 0.7) {
      world.update(state);
      terrainClock = 0;
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
function rescue(reason = "") {
  encounters.reset();
  const p = ports.reduce((a, b) =>
    Math.hypot(a.x - state.x, a.z - state.z) <
    Math.hypot(b.x - state.x, b.z - state.z)
      ? a
      : b,
  );
  state.x = p.x + p.normal.x * 18;
  state.z = p.z + p.normal.z * 18;
  state.health = 55;
  state.coins = Math.max(0, state.coins - 75);
  sailing.speed = 0;
  sailing.target = null;
  sailing.ignoredPort = null;
  world.update(state, true);
  updateHUD();
  market.enter(p);
  $("trade-message").textContent =
    reason +
    "A harbor tug rescued you. Up to 75 gold paid; hull restored to 55%.";
  saveGame(true);
}
function pixelGold(value) {
  const glyphs = [
    "111,101,101,101,111",
    "010,110,010,010,111",
    "111,001,111,100,111",
    "111,001,111,001,111",
    "101,101,111,001,001",
    "111,100,111,001,111",
    "111,100,111,101,111",
    "111,001,010,010,010",
    "111,101,111,101,111",
    "111,101,111,001,111",
  ];
  const str = String(value);
  let pixels = "";
  [...str].forEach((c, i) =>
    glyphs[Number(c)].split(",").forEach((row, y) =>
      [...row].forEach((v, x) => {
        if (v === "1")
          pixels += `<rect x="${i * 4 + x}" y="${y}" width="1" height="1"/>`;
      }),
    ),
  );
  return `<svg height="20" width="${str.length * 16}" viewBox="0 0 ${str.length * 4} 5" fill="#ffe3a0" shape-rendering="crispEdges" aria-hidden="true">${pixels}</svg>`;
}
function updateHUD() {
  $("coins").innerHTML = pixelGold(state.coins);
  $("coins").setAttribute("aria-label", `${state.coins.toLocaleString()} gold`);
  $("health").innerHTML = Array.from(
    { length: 10 },
    (_, i) =>
      `<i class="${i < Math.ceil(state.health / 10) ? "" : "empty"}"></i>`,
  ).join("");
  $("health").setAttribute("aria-valuenow", String(state.health));
}
function updateCompass() {
  const degrees = (360 - (state.heading * 180) / Math.PI) % 360;
  $("needle").style.transform = `rotate(${degrees}deg)`;
  document
    .querySelector(".compass")
    .setAttribute(
      "aria-label",
      `Ship heading ${Math.round(degrees)} degrees. North is up on the chart.`,
    );
  const p = ports.find((p) => p.id === state.target);
  $("bearing").hidden = !p;
  if (p) {
    const angle = Math.atan2(-(p.x - state.x), -(p.z - state.z));
    $("bearing").style.transform = `rotate(${(-angle * 180) / Math.PI}deg)`;
  }
}
function toast(text, duration = 4500) {
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => $("toast").classList.remove("visible"),
    duration,
  );
}
function saveGame(silent = false) {
  if (!started) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    if (!silent) toast("Voyage saved. Fair winds, captain.");
    return true;
  } catch {
    if (!silent)
      toast("This browser cannot save your voyage. Keep this tab open.");
    return false;
  }
}
function begin(resume) {
  audio.unlock();
  audio.stop();
  encounters.reset({ newVoyage: true });
  if (resume && loadedSave) {
    state = loadedSave;
    if (world.isSolid(state.x, state.z)) {
      state.x = ports[0].x;
      state.z = ports[0].z;
    }
    sailing.ignoredPort = null;
  }
  setVessel();
  started = true;
  $("intro").hidden = true;
  $("hud").hidden = false;
  updateHUD();
  updateCompass();
  world.update(state, true);
  toast(
    resume
      ? "Welcome back, captain. W / arrows to sail. M opens your chart."
      : "Welcome to Port Royal. Buy local rum, then find a better price across the sea.",
    7000,
  );
  saveGame(true);
}
async function boot() {
  try {
    const [res] = await Promise.all([
      fetch("./assets/trade-winds/coast.json"),
      loadVesselAssets(),
      loadFrigateAsset(),
      loadTradingPostAsset(),
    ]);
    if (!res.ok) throw Error("Could not load coastlines");
    const polygons = await res.json();
    coasts = polygons.map((ring) => ({
      ring,
      minX: Math.min(...ring.map((p) => p[0])),
      maxX: Math.max(...ring.map((p) => p[0])),
      minY: Math.min(...ring.map((p) => p[1])),
      maxY: Math.max(...ring.map((p) => p[1])),
    }));
    try {
      loadedSave = parseSave(localStorage.getItem(SAVE_KEY));
    } catch {
      loadedSave = null;
    }
    initScene();
    $("destination").innerHTML =
      '<option value="">No destination</option>' +
      ports
        .map((p) => `<option value="${p.id}">${p.name} · ${p.region}</option>`)
        .join("");
    $("start").disabled = false;
    $("start").textContent = "Set Sail";
    $("continue").hidden = !loadedSave;
  } catch (error) {
    console.error("Trade Winds:", error);
    $("start").textContent = "The sea couldn’t load";
    $("intro-error").hidden = false;
    $("intro-error").textContent =
      "The world could not load. Check your connection and WebGL support, then reload.";
  }
}
boot().catch((error) => {
  console.error(error);
  $("intro-error").hidden = false;
  $("intro-error").textContent =
    "This game needs WebGL. Try enabling hardware acceleration or opening a recent browser, then reload.";
});
