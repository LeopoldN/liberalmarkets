import * as THREE from "./assets/vendor/three.module.js";
import {
  createKraken,
  animateKraken,
  createVessel,
  createPortModel,
  portVariant,
  createGull,
  appendTree,
  instanceBlocks,
  disposeModel,
} from "./trade-winds-models.mjs";
import {
  atlanticWeight,
  waveHeight,
  OCEAN_GLSL,
} from "./trade-winds-ocean.mjs";
import { KrakenEncounter } from "./trade-winds-mobs.mjs";
import { WakeTrail } from "./trade-winds-wake.mjs";
import {
  GOODS,
  PORTS,
  SAVE_KEY,
  SHIP_SPEED as SPEED,
  VESSELS,
  toWorld,
  toGeo,
  prices,
  newState,
  cargoCount,
  transact,
  parseSave,
  pointInPolygon,
} from "./trade-winds-engine.mjs";

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2,
  CELL = 10,
  CHUNK = 160;
const keys = new Set(),
  ports = [],
  chunks = new Map(),
  landCache = new Map();
let scene,
  camera,
  renderer,
  water,
  foam,
  ship,
  sun,
  coasts,
  state,
  loadedSave,
  started = false,
  activePort = null,
  mode = "buy",
  basket = {},
  speed = 0,
  clickTarget = null;
let shoreCenter = "",
  zoom = 1,
  clockTime = 0,
  lastTime = 0,
  terrainClock = 0,
  saveClock = 0,
  lastImpact = -10,
  toastTimer,
  ignorePort = null,
  quality = "high";
const dummy = new THREE.Object3D(),
  raycaster = new THREE.Raycaster(),
  seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const cameraAim = new THREE.Vector3(),
  desiredAim = new THREE.Vector3();
const wake = new WakeTrail();
const encounter = new KrakenEncounter();
let krakenModel = null,
  atlanticAnnounced = false;
let waterGridSize = 0;
const hash = (x, z) => {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function isLand(x, z) {
  const lon = x / 220 - 80,
    lat = 22 - z / 220;
  return coasts.some(
    (p) =>
      lon >= p.minX &&
      lon <= p.maxX &&
      lat >= p.minY &&
      lat <= p.maxY &&
      pointInPolygon(lon, lat, p.ring),
  );
}
function tileLand(ix, iz) {
  const key = `${ix},${iz}`;
  if (!landCache.has(key))
    landCache.set(key, isLand((ix + 0.5) * CELL, (iz + 0.5) * CELL));
  return landCache.get(key);
}
function terrainHeight(ix, iz) {
  let depth = 0;
  for (const dist of [1, 2, 4, 7])
    if (
      tileLand(ix + dist, iz) &&
      tileLand(ix - dist, iz) &&
      tileLand(ix, iz + dist) &&
      tileLand(ix, iz - dist)
    )
      depth++;
  const n =
    (Math.sin(ix * 0.23) +
      Math.cos(iz * 0.18) +
      Math.sin(ix * 0.12 + iz * 0.15) +
      3) /
    6;
  let h = 6 + depth * 4 + Math.floor((n * depth * 6) / 4) * 4;
  for (const p of ports)
    if (
      Math.hypot((ix + 0.5) * CELL - p.land.x, (iz + 0.5) * CELL - p.land.z) <
      85
    )
      h = 8;
  return { h, depth };
}
function buildChunk(cx, cz) {
  const group = new THREE.Group(),
    data = [];
  group.position.set(cx * CHUNK, 0, cz * CHUNK);
  for (let a = 0; a < 16; a++)
    for (let b = 0; b < 16; b++) {
      const ix = cx * 16 + a,
        iz = cz * 16 + b,
        x = a * CELL + 5,
        z = b * CELL + 5,
        r = hash(ix, iz);
      if (!tileLand(ix, iz)) {
        if (
          tileLand(ix + 1, iz) ||
          tileLand(ix - 1, iz) ||
          tileLand(ix, iz + 1) ||
          tileLand(ix, iz - 1)
        )
          data.push([x, -2.6, z, 10, 3, 10, 0xb8bd89]);
        continue;
      }
      const { h, depth } = terrainHeight(ix, iz);
      data.push([
        x,
        h / 2 - 2,
        z,
        10,
        h + 4,
        10,
        depth === 0
          ? r > 0.5
            ? 0xd6cb94
            : 0xe1d2a0
          : r > 0.5
            ? 0x797e4a
            : 0x8d8856,
      ]);
      if (depth > 0)
        data.push([
          x,
          h + 0.6,
          z,
          10,
          1.2,
          10,
          [0x5c8645, 0x6e914a, 0x769951, 0x648944][Math.floor(r * 4)],
        ]);
      const nearTown = ports.some(
        (p) =>
          Math.hypot(
            (ix + 0.5) * CELL - p.land.x,
            (iz + 0.5) * CELL - p.land.z,
          ) < 65,
      );
      if (r > 0.945 && !nearTown) {
        appendTree(data, x, h, z, "palm", r * 100, depth === 0 ? 0.82 : 1);
      } else if (depth > 1 && r > 0.82 && !nearTown) {
        appendTree(data, x, h, z, "canopy", r * 100, 0.8 + hash(iz, ix) * 0.25);
      }
    }
  instanceBlocks(data, group);
  scene.add(group);
  return group;
}
function updateTerrain(force = false) {
  const cx = Math.floor(state.x / CHUNK),
    cz = Math.floor(state.z / CHUNK);
  const halfDepth = camera.top / 0.556,
    extent = Math.max(
      camera.right * 0.824 + halfDepth * 0.566,
      camera.right * 0.566 + halfDepth * 0.824,
    );
  const range = Math.ceil(extent / CHUNK) + 1;
  const needs = new Set();
  for (let a = -range; a <= range; a++)
    for (let b = -range; b <= range; b++) {
      const key = `${cx + a},${cz + b}`;
      needs.add(key);
      if (!chunks.has(key)) chunks.set(key, buildChunk(cx + a, cz + b));
    }
  for (const [key, g] of chunks)
    if (!needs.has(key)) {
      scene.remove(g);
      g.children.forEach((m) => m.dispose?.());
      chunks.delete(key);
    }
  // Bound the occupancy cache on very long voyages; active chunks remain rendered.
  if (landCache.size > 160000) landCache.clear();
  updateShore(cx, cz, range);
  updateWaterGrid(range);
  ports.forEach((p) => {
    p.group.visible =
      Math.hypot(p.x - state.x, p.z - state.z) < CHUNK * (range + 2);
  });
}
function updateShore(cx, cz, range) {
  const size = range > 4 ? 256 : 128;
  const key = `${cx},${cz},${size}`;
  if (shoreCenter === key) return;
  shoreCenter = key;
  const ox = cx * CHUNK - (size * CELL) / 2,
    oz = cz * CHUNK - (size * CELL) / 2,
    data = new Uint8Array(size * size);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++)
      data[z * size + x] = tileLand(ox / CELL + x, oz / CELL + z) ? 255 : 0;
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  water.material.uniforms.shoreMap.value?.dispose();
  water.material.uniforms.shoreMap.value = texture;
  water.material.uniforms.shoreOrigin.value.set(ox, oz);
  water.material.uniforms.shoreSize.value = size * CELL;
}
function findHarbor(port) {
  const ref = toWorld(port.lon, port.lat),
    ix = Math.floor(ref.x / CELL),
    iz = Math.floor(ref.z / CELL);
  let best = null,
    bestD = Infinity;
  for (let a = -15; a <= 15; a++)
    for (let b = -15; b <= 15; b++)
      if (tileLand(ix + a, iz + b)) {
        for (const [dx, dz] of [
          [0, 1],
          [1, 0],
          [-1, 0],
          [0, -1],
        ])
          if (
            !tileLand(ix + a + dx, iz + b + dz) &&
            !tileLand(ix + a + dx * 5, iz + b + dz * 5)
          ) {
            const x = (ix + a + 0.5) * CELL,
              z = (iz + b + 0.5) * CELL,
              d = Math.hypot(x - ref.x, z - ref.z);
            if (d < bestD) {
              bestD = d;
              best = {
                land: { x, z },
                normal: { x: dx, z: dz },
                x: x + dx * 55,
                z: z + dz * 55,
              };
            }
          }
      }
  return (
    best || {
      land: { x: ref.x, z: ref.z - 30 },
      normal: { x: 0, z: 1 },
      x: ref.x,
      z: ref.z + 25,
    }
  );
}
function makePort(p) {
  p.group = createPortModel(portVariant(p.id));
  p.group.position.set(p.land.x, 0, p.land.z);
  p.group.rotation.y = Math.atan2(p.normal.x, p.normal.z);
  scene.add(p.group);
}
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
function makeWater() {
  // A shallow cube for each water tile gives the sea real stepped edges.
  const geometry = new THREE.BoxGeometry(12, 7, 12);
  geometry.translate(0, -3.05, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      fancy: { value: 1 },
      shoreMap: { value: null },
      shoreOrigin: { value: new THREE.Vector2() },
      shoreSize: { value: 1280 },
    },
    vertexShader: `
      varying vec3 world;
      varying vec3 face;
      uniform float time;
      ${OCEAN_GLSL}
      void main() {
        vec4 center = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
        vec4 point = instanceMatrix * vec4(position, 1.);
        point.y += seaHeight(center.xz, time);
        world = (modelMatrix * point).xyz;
        face = normal;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
      }`,
    fragmentShader: `
      precision highp float;
      varying vec3 world;
      varying vec3 face;
      uniform float time;
      uniform float fancy;
      uniform sampler2D shoreMap;
      uniform vec2 shoreOrigin;
      uniform float shoreSize;
      ${OCEAN_GLSL}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
          mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y);
      }
      void main() {
        vec2 p = world.xz;
        float ocean = atlantic(p);
        vec2 tile = floor((p + 6.) / 12.);
        vec2 pixel = floor(p / 2.) * 2.;
        // Broad color shoals, then a restrained palette of individual water facets.
        float depth = noise(tile * .085) * .7 + noise(tile * .21) * .3;
        depth = floor(depth * 7.) / 7.;
        vec3 c = mix(vec3(.012, .125, .19), vec3(.028, .265, .29), depth);
        c = mix(c, mix(vec3(.007, .035, .065), vec3(.025, .11, .155), depth), ocean * .88);
        float facet = sin(tile.x * .43 + tile.y * .29 - time * .7)
          + sin(tile.y * .71 - tile.x * .21 + time * .51);
        c *= .98 + floor(facet * 2.) * .018;
        vec2 uv = (pixel - shoreOrigin) / shoreSize;
        float shore = 0.;
        for (int k = 0; k < 4; k++) {
          float angle = float(k) * 1.570796;
          vec2 direction = vec2(cos(angle), sin(angle));
          shore += texture2D(shoreMap, uv + direction * 15. / shoreSize).r * .55
            + texture2D(shoreMap, uv + direction * 35. / shoreSize).r * .20;
        }
        shore = clamp(shore, 0., 1.);
        c = mix(c, vec3(.12, .43, .34), floor(shore * 6.) / 6. * .85);
        // Short broken wavelets, made from square cells rather than smooth stripes.
        vec2 ripple = floor((pixel + vec2(time * 1.1, -time * .5)) / 4.);
        float crest = sin(ripple.x * .59 + ripple.y * .77 - time * 1.1
          + noise(ripple * .12) * 4.);
        float broken = step(.65, hash(floor(ripple / vec2(4., 2.))));
        float lip = step(.91, crest) * broken;
        c = mix(c, vec3(.17, .42, .43), lip * mix(.18, .44, ocean));
        float cap = step(mix(.985, .81, ocean), hash(floor(ripple / 2.))) * step(.78, crest);
        float flicker = smoothstep(.3, .9, sin(time * .9 + hash(ripple) * 6.28));
        c = mix(c, vec3(.57, .73, .65), cap * flicker * mix(.42, .85, ocean) * mix(.7, 1., fancy));
        float wash = step(.7, sin(pixel.x * .16 + pixel.y * .23 - time * 1.4));
        float coastFoam = step(.65, shore) * wash * step(.45, hash(floor(pixel / 3.)));
        c = mix(c, vec3(.59, .77, .64), coastFoam * .36);
        float side = .90 + max(0., face.y) * .10;
        c *= side;
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geometry, m, 1);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const deep = new THREE.Mesh(
    new THREE.PlaneGeometry(40000, 40000),
    new THREE.MeshBasicMaterial({ color: 0x176c7a }),
  );
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -12;
  scene.add(deep);
  return mesh;
}
function updateWaterGrid(range) {
  const grid = Math.ceil((range * CHUNK * 2 + 96) / 12);
  if (grid !== waterGridSize) {
    const old = water;
    water = new THREE.InstancedMesh(old.geometry, old.material, grid * grid);
    water.frustumCulled = false;
    for (let x = 0; x < grid; x++)
      for (let z = 0; z < grid; z++) {
        dummy.position.set(
          (x - Math.floor(grid / 2)) * 12,
          0,
          (z - Math.floor(grid / 2)) * 12,
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        water.setMatrixAt(x * grid + z, dummy.matrix);
      }
    water.instanceMatrix.needsUpdate = true;
    scene.remove(old);
    old.dispose();
    scene.add(water);
    waterGridSize = grid;
  }
  water.position.set(
    Math.round(state.x / 12) * 12,
    0,
    Math.round(state.z / 12) * 12,
  );
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
    dummy.position.set(p.x, swell + 0.62 + spray, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(
      p.size * spread,
      0.24 + fade * 0.26,
      p.size * (0.7 + (p.seed % 3) * 0.2) * spread,
    );
    dummy.updateMatrix();
    foam.setMatrixAt(count, dummy.matrix);
    life.setXY(count, fade * (0.65 + (p.seed % 5) * 0.06), 0.16 + fade * 0.84);
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
  water = makeWater();
  foam = makeFoam();
  PORTS.forEach((p) => ports.push({ ...p, ...findHarbor(p) }));
  ports.forEach(makePort);
  const home = ports[0];
  state = newState({
    x: home.x + home.normal.x * 20,
    z: home.z + home.normal.z * 20,
  });
  state.heading = Math.atan2(-home.normal.x, -home.normal.z);
  setVessel();
  cameraAim.set(state.x - 65, 0, state.z - 40);
  updateTerrain(true);
  const birds = new THREE.Group();
  birds.position.set(state.x, 0, state.z);
  for (let i = 0; i < 7; i++) birds.add(createGull(i));
  scene.add(birds);
  scene.userData.birds = birds;
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointermove", pointerMove);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("pointercancel", pointerCancel);
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = THREE.MathUtils.clamp(zoom + e.deltaY * 0.001, 0.65, 2);
      resize();
    },
    { passive: false },
  );
  window.addEventListener("resize", () => {
    resize();
    if ($("chart").open) drawChart();
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
function frame(ms) {
  const dt = Math.min((ms - lastTime) / 1000 || 0, 0.25);
  lastTime = ms;
  if (!document.hidden) {
    clockTime += dt;
    if (!paused()) {
      let remaining = dt;
      while (remaining > 0 && !paused()) {
        const step = Math.min(remaining, 1 / 30);
        updateMovement(step);
        if (!paused()) updateMobs(step);
        remaining -= step;
      }
    }
    const roughness = atlanticWeight(state.x, state.z);
    const seaY = waveHeight(state.x, state.z, clockTime);
    ship.position.set(
      state.x,
      1 + seaY + Math.sin(clockTime * 1.5) * 0.22,
      state.z,
    );
    ship.rotation.set(
      Math.sin(clockTime * 1.3) * (0.012 + roughness * 0.05),
      state.heading,
      Math.sin(clockTime * 1.6) * (0.025 + roughness * 0.065),
    );
    const desired = desiredAim.set(state.x, 0, state.z);
    if (!started) desired.add(new THREE.Vector3(-65, 0, -35));
    cameraAim.lerp(desired, 1 - Math.exp(-dt * 3));
    camera.position.copy(cameraAim).add(new THREE.Vector3(330, 390, 480));
    camera.lookAt(cameraAim);
    sun.position.copy(cameraAim).add(new THREE.Vector3(-180, 330, 140));
    sun.target.position.copy(cameraAim);
    water.material.uniforms.time.value = clockTime;
    updateFoam(dt);
    updateBirds(dt);
    terrainClock += dt;
    if (terrainClock > 0.7) {
      updateTerrain();
      terrainClock = 0;
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
function clearKraken() {
  if (!krakenModel) return;
  scene.remove(krakenModel);
  disposeModel(krakenModel);
  krakenModel = null;
}
function openMonsterWater(x, z, radius) {
  if (ports.some((p) => Math.hypot(p.x - x, p.z - z) < radius + 150))
    return false;
  // Check the entire encounter footprint, including small islands between rings.
  for (let dx = -radius; dx <= radius; dx += CELL)
    for (let dz = -radius; dz <= radius; dz += CELL)
      if (
        Math.hypot(dx, dz) <= radius &&
        tileLand(Math.floor((x + dx) / CELL), Math.floor((z + dz) / CELL))
      )
        return false;
  return true;
}
function updateMobs(dt) {
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
      speed *= 0.6;
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
    krakenModel.position.y = -95 * (1 - rise) - 110 * sink;
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
function angleDelta(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
function updateMovement(dt) {
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
    throttle * SPEED * wind,
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
  const solid = (x, z) => tileLand(Math.floor(x / CELL), Math.floor(z / CELL));
  if (
    Math.abs(speed) > 0.1 &&
    (solid(fx, fz) ||
      solid(
        nx + Math.cos(state.heading) * hull.halfWidth,
        nz - Math.sin(state.heading) * hull.halfWidth,
      ) ||
      solid(
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
function rescue() {
  clearKraken();
  encounter.reset();
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
  speed = 0;
  clickTarget = null;
  ignorePort = null;
  updateTerrain(true);
  updateHUD();
  enterPort(p);
  $("trade-message").textContent =
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
  clearKraken();
  encounter.reset();
  atlanticAnnounced = false;
  if (resume && loadedSave) {
    state = loadedSave;
    if (tileLand(Math.floor(state.x / CELL), Math.floor(state.z / CELL))) {
      state.x = ports[0].x;
      state.z = ports[0].z;
    }
    ignorePort = null;
  }
  setVessel();
  started = true;
  $("intro").hidden = true;
  $("hud").hidden = false;
  updateHUD();
  updateCompass();
  updateTerrain(true);
  toast(
    resume
      ? "Welcome back, captain. W / arrows to sail. M opens your chart."
      : "Welcome to Port Royal. Buy local rum, then find a better price across the sea.",
    7000,
  );
  saveGame(true);
}
function merchantSVG() {
  return `<svg viewBox="0 0 150 160" xmlns="http://www.w3.org/2000/svg"><path fill="#763e2d" d="M22 112h106v48H22z"/><path fill="#95563a" d="M17 120h20v40H17zm98 0h20v40h-20z"/><path fill="#ddd0a5" d="M57 104h38v56H57z"/><path fill="#bdad86" d="M67 112h17v48H67z"/><path fill="#492f24" d="M41 59h69v50H41z"/><path fill="#b98051" d="M44 58h64v45H44z"/><path fill="#d3a06b" d="M49 66h54v36H49z"/><path fill="#392e23" d="M49 92h13v15h29V92h12v25H91v10H61v-10H49z"/><path fill="#503729" d="M59 87h33v8H59z"/><path fill="#2e2b23" d="M51 71h17v6H51zm33 0h17v6H84z"/><path fill="#f3e4bf" d="M55 78h10v10H55zm31 0h10v10H86z"/><path fill="#2d2b23" d="M60 78h5v10h-5zm26 0h5v10h-5z"/><path fill="#ad784b" d="M69 80h11v13H69z"/><path fill="#252c28" d="M20 55h111v15H20zM36 41h81v22H36zM51 20h50v31H51z"/><path fill="#b99a53" d="M20 54h31v6H20zm31-8h50v7H51zm50 8h30v6h-30z"/><path fill="#e0c47e" d="M43 124h6v7h-6zm0 17h6v7h-6zm60-17h6v7h-6zm0 17h6v7h-6z"/><path fill="#442e22" d="M33 150h84v10H33z"/><path fill="#c6a05b" d="M69 148h16v12H69z"/><path fill="#493a28" d="M73 152h8v5h-8z"/></svg>`;
}
function enterPort(p) {
  activePort = p;
  speed = 0;
  clickTarget = null;
  keys.clear();
  mode = "buy";
  basket = {};
  if (!state.visited.includes(p.id)) state.visited.push(p.id);
  $("port-name").textContent = p.name;
  $("port-region").textContent = `${p.region} · Port of call`;
  $("merchant-name").textContent = p.merchant;
  $("portrait").innerHTML = merchantSVG();
  const names = (ids) =>
    ids
      .map((id) => GOODS.find((g) => g.id === id).name.toLowerCase())
      .join(" · ");
  $("export-hint").textContent = names(p.exports);
  $("import-hint").textContent = names(p.imports);
  renderMarket();
  $("market").showModal();
  saveGame(true);
}
function leavePort() {
  ignorePort = activePort.id;
  $("market").close();
  activePort = null;
  toast("W / arrows to sail · Click the sea to steer · M for your chart", 5000);
  saveGame(true);
}
function goodIcon(g) {
  let art = "";
  if (g.id === "rum")
    art =
      '<path fill="#76502e" d="M6 2h12v3H6zM4 5h16v16H4zM6 21h12v2H6z"/><path fill="#b77d3e" d="M6 5h10v16H6z"/><path fill="#d49a51" d="M7 5h2v16H7z"/><path fill="#959888" d="M4 7h16v3H4zM4 17h16v3H4z"/>';
  else if (g.id === "sugar")
    art =
      '<path fill="#9b7343" d="M2 15h20v8H2z"/><path fill="#ede5c8" d="M3 13h18v5H3zM6 9h12v5H6zM9 5h6v5H9z"/><path fill="#fff7e1" d="M8 11h5v4H8zM11 7h4v4h-4z"/>';
  else if (g.id === "cotton")
    art =
      '<path fill="#b4b399" d="M2 7h19v13H2z"/><path fill="#eee8ce" d="M3 5h18v12H3z"/><path fill="#fffae0" d="M4 5h16v4H4z"/><path fill="#aaa58c" d="M16 9h4v8h-4z"/>';
  else if (g.id === "timber")
    art =
      '<path fill="#684b2f" d="M1 5h21v16H1z"/><path fill="#a87945" d="M2 5h18v5H2zM2 12h18v6H2z"/><path fill="#ccb077" d="M5 4h2v18H5zM16 4h2v18h-2z"/>';
  else if (g.id === "tobacco")
    art =
      '<path fill="#687440" d="M3 4h18v18H3z"/><path fill="#889853" d="M5 4h5v17H5zM13 4h3v17h-3z"/><path fill="#c6ab73" d="M2 8h20v2H2zM2 17h20v2H2zM11 3h2v20h-2z"/>';
  else if (g.id === "spices")
    art =
      '<path fill="#8e6339" d="M2 12h20v10H2z"/><path fill="#bb6e34" d="M3 9h17v7H3zM6 5h11v8H6zM9 2h4v7H9z"/><path fill="#e4a345" d="M6 9h4v4H6zM11 5h3v4h-3z"/><path fill="#c29658" d="M2 17h20v3H2z"/>';
  else
    art = `<path fill="${g.color}" d="M7 2h10v4H7zM5 6h14v3H5zM3 9h18v12H3zM5 21h14v3H5z"/><path fill="#cfab73" d="M6 5h12v3H6zM5 10h3v9H5z"/><path fill="#513d29" d="M11 12h5v6h-5z"/>`;
  return `<svg class="good-icon" viewBox="0 0 24 26" aria-hidden="true" shape-rendering="crispEdges">${art}</svg>`;
}
function renderMarket() {
  const p = activePort;
  $("buy-tab").setAttribute("aria-selected", String(mode === "buy"));
  $("sell-tab").setAttribute("aria-selected", String(mode === "sell"));
  $("hold").textContent = `Hold ${cargoCount(state)} / ${state.capacity}`;
  $("market-coins").textContent = `${state.coins.toLocaleString()} gold aboard`;
  $("goods-list").innerHTML = GOODS.map(
    (g) =>
      `<div class="goods-row"><span class="goods-name" title="${g.description}">${goodIcon(g)}${g.name}</span><span class="goods-price">${prices(p, g)[mode]}</span><span class="goods-owned">${state.cargo[g.id]}</span><div class="quantity"><button data-good="${g.id}" data-delta="-1" aria-label="Remove one ${g.name}" ${!basket[g.id] ? "disabled" : ""}>−</button><output aria-label="${g.name} quantity">${basket[g.id] || 0}</output><button data-good="${g.id}" data-delta="1" aria-label="Add one ${g.name}" ${canAdd(g) ? "" : "disabled"}>+</button></div></div>`,
  ).join("");
  const total = GOODS.reduce(
      (n, g) => n + (basket[g.id] || 0) * prices(p, g)[mode],
      0,
    ),
    count = Object.values(basket).reduce((a, b) => a + b, 0);
  $("trade-total").innerHTML = `${total.toLocaleString()} <small>gold</small>`;
  $("trade-summary").textContent = count
    ? `${count} cargo ${count === 1 ? "unit" : "units"} · ${mode === "buy" ? "to pay" : "to receive"}`
    : "Select goods to trade";
  $("confirm-trade").disabled = !count;
  $("confirm-trade").textContent =
    mode === "buy" ? "Confirm purchase" : "Confirm sale";
  const cost = Math.ceil((100 - state.health) * 1.5);
  $("repair").textContent = cost
    ? `Repair hull · ${cost} gold`
    : "Hull in fine condition";
  $("repair").disabled = cost === 0 || cost > state.coins;
}
function canAdd(g) {
  if (mode === "sell") return (basket[g.id] || 0) < state.cargo[g.id];
  const quantity = Object.values(basket).reduce((a, b) => a + b, 0),
    total = GOODS.reduce(
      (n, g) => n + (basket[g.id] || 0) * prices(activePort, g).buy,
      0,
    );
  return (
    cargoCount(state) + quantity < state.capacity &&
    total + prices(activePort, g).buy <= state.coins
  );
}
$("goods-list").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-good]");
  if (!btn) return;
  const g = GOODS.find((g) => g.id === btn.dataset.good),
    delta = Number(btn.dataset.delta);
  if (delta > 0 && !canAdd(g)) return;
  basket[g.id] = Math.max(0, (basket[g.id] || 0) + delta);
  renderMarket();
  const replacement = $("goods-list").querySelector(
    `[data-good="${g.id}"][data-delta="${delta}"]`,
  );
  if (replacement && !replacement.disabled) replacement.focus();
});
$("confirm-trade").onclick = () => {
  const draft = structuredClone(state);
  let count = 0;
  for (const g of GOODS)
    if (basket[g.id]) {
      const result = transact(draft, activePort, g.id, mode, basket[g.id]);
      if (!result.ok) {
        $("trade-message").textContent = result.message;
        return;
      }
      count += basket[g.id];
    }
  state = draft;
  basket = {};
  updateHUD();
  renderMarket();
  $("trade-message").textContent =
    `${mode === "buy" ? "Loaded" : "Sold"} ${count} cargo units. A pleasure doing business, captain.`;
  saveGame(true);
};
$("buy-tab").onclick = () => {
  mode = "buy";
  basket = {};
  $("trade-message").textContent = "";
  renderMarket();
};
$("sell-tab").onclick = () => {
  mode = "sell";
  basket = {};
  $("trade-message").textContent = "";
  renderMarket();
};
$("repair").onclick = () => {
  const cost = Math.ceil((100 - state.health) * 1.5);
  if (cost > state.coins || cost <= 0) return;
  state.coins -= cost;
  state.health = 100;
  updateHUD();
  renderMarket();
  $("trade-message").textContent =
    "New planks, fresh caulking. Your hull is fully repaired.";
  saveGame(true);
};
$("leave-port").onclick = leavePort;
$("set-sail").onclick = leavePort;
$("market").addEventListener("cancel", (e) => {
  e.preventDefault();
  leavePort();
});
function openSettings() {
  keys.clear();
  $("voyage-stats").textContent =
    `Day ${1 + Math.floor(state.elapsed / 180)} at sea · ${state.visited.length} of ${ports.length} ports visited · ${cargoCount(state)} / 40 cargo`;
  $("save-status").textContent = "";
  $("settings").showModal();
}
$("settings-button").onclick = openSettings;
$("close-settings").onclick = () => $("settings").close();
$("resume").onclick = () => $("settings").close();
$("save").onclick = () => {
  $("save-status").textContent = saveGame(true)
    ? "Your voyage has been saved."
    : "Saving is unavailable in this browser. Your voyage is still open.";
};
$("quit").onclick = () => {
  if (saveGame(true)) location.href = "games.html";
  else
    $("save-status").textContent =
      "Could not save. Your voyage is still open; enable browser storage before quitting.";
};
$("quality").onchange = (e) => {
  quality = e.target.value;
  renderer.shadowMap.enabled = quality === "high";
  renderer.setPixelRatio(
    quality === "high" ? Math.min(devicePixelRatio, 2) : 1,
  );
  water.material.uniforms.fancy.value = quality === "high" ? 1 : 0;
};
$("start").onclick = () => begin(Boolean(loadedSave));
$("continue").onclick = () => begin(false);
// Chart coordinates cover the Gulf of Mexico, Florida, and the full Caribbean.
const MAP = { west: -103, east: -57, north: 32, south: 6 };
let mapPoints = [];
function drawChart() {
  const canvas = $("map"),
    r = canvas.getBoundingClientRect(),
    ratio = Math.min(devicePixelRatio, 2);
  canvas.width = r.width * ratio;
  canvas.height = r.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const w = r.width,
    h = r.height;
  const project = (lon, lat) => [
    ((lon - MAP.west) / (MAP.east - MAP.west)) * w,
    ((MAP.north - lat) / (MAP.north - MAP.south)) * h,
  ];
  ctx.fillStyle = "#e4d4ad";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#a89a7040";
  ctx.lineWidth = 1;
  for (let lon = -100; lon < -57; lon += 5) {
    const [x] = project(lon, 10);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.font = "9px Georgia";
    ctx.fillStyle = "#978966";
    ctx.fillText(`${-lon}°W`, x + 4, h - 6);
  }
  for (let lat = 10; lat < 32; lat += 5) {
    const [, y] = project(-100, lat);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#999b6b";
  ctx.strokeStyle = "#7b8056";
  for (const p of coasts) {
    ctx.beginPath();
    p.ring.forEach(([lon, lat], i) => {
      const [x, y] = project(lon, lat);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.font = `italic ${w < 500 ? 12 : 17}px Georgia`;
  ctx.fillStyle = "#918363";
  ctx.textAlign = "center";
  const label = (str, lon, lat) => ctx.fillText(str, ...project(lon, lat));
  label("Gulf of Mexico", -91, 25);
  label("Caribbean Sea", -75, 14);
  label("Atlantic Ocean", -66, 27);
  ctx.font = "10px Georgia";
  label("MEXICO", -99, 23);
  label("CUBA", -79, 21.8);
  label("SOUTH AMERICA", -68, 7.8);
  const geo = toGeo(state.x, state.z),
    [sx, sy] = project(geo.lon, geo.lat);
  const target = ports.find((p) => p.id === state.target);
  if (target) {
    const [tx, ty] = project(target.lon, target.lat);
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = "#a06734";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  mapPoints = ports.map((p, i) => {
    const [x, y] = project(p.lon, p.lat);
    ctx.fillStyle = p.id === state.target ? "#a85c31" : "#544f35";
    ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.font = `${p.id === state.target ? "bold " : ""}${w < 500 ? 8 : 10}px Georgia`;
    ctx.textAlign = p.lon < -90 ? "left" : "right";
    let offset =
      p.id === "santiago" || p.id === "sanjuan" || p.id === "stgeorges"
        ? 13
        : -9;
    ctx.fillText(p.name, x + (p.lon < -90 ? 7 : -5), y + offset);
    return { x, y, p };
  });
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-state.heading);
  ctx.fillStyle = "#a3472e";
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(5, 7);
  ctx.lineTo(0, 4);
  ctx.lineTo(-5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function selectDestination(id) {
  state.target = id || null;
  const p = ports.find((p) => p.id === id);
  $("destination").value = id || "";
  if (p) {
    const seconds = Math.hypot(p.x - state.x, p.z - state.z) / (SPEED * 0.92);
    $("route-info").textContent =
      `${p.name} · ≈ ${Math.max(1, Math.round(seconds / 60))} min, plus detours around land. Exports: ${p.exports.join(", ")}. High demand: ${p.imports.join(", ")}.`;
  } else
    $("route-info").textContent =
      "Chart a course. Follow the gold compass marker.";
  drawChart();
  updateCompass();
  saveGame(true);
}
function openChart() {
  keys.clear();
  $("settings").close();
  $("chart").showModal();
  $("destination").value = state.target || "";
  selectDestination(state.target);
}
$("open-chart").onclick = openChart;
$("close-chart").onclick = () => $("chart").close();
$("destination").onchange = (e) => selectDestination(e.target.value);
$("map").onclick = (e) => {
  const r = $("map").getBoundingClientRect(),
    x = e.clientX - r.left,
    y = e.clientY - r.top;
  const near = mapPoints.reduce((a, b) =>
    Math.hypot(a.x - x, a.y - y) < Math.hypot(b.x - x, b.y - y) ? a : b,
  );
  if (Math.hypot(near.x - x, near.y - y) < 30) selectDestination(near.p.id);
};
const pointers = new Map();
let pointerStart = null,
  pinchDistance = 0,
  pinched = false;
function pointerDown(e) {
  if (paused()) return;
  renderer.domElement.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  pointerStart = { x: e.clientX, y: e.clientY };
  if (pointers.size === 2) {
    pinched = true;
    const [a, b] = [...pointers.values()];
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
  }
}
function pointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()],
      d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDistance > 0)
      zoom = THREE.MathUtils.clamp((zoom * pinchDistance) / d, 0.65, 2);
    pinchDistance = d;
    resize();
  }
}
function pointerCancel(e) {
  pointers.delete(e.pointerId);
  if (!pointers.size) {
    pinched = false;
    pointerStart = null;
  }
}
function pointerUp(e) {
  pointers.delete(e.pointerId);
  if (pinched) {
    if (!pointers.size) pinched = false;
    return;
  }
  if (
    paused() ||
    !pointerStart ||
    Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 12
  )
    return;
  raycaster.setFromCamera(
    new THREE.Vector2(
      (e.clientX / innerWidth) * 2 - 1,
      1 - (e.clientY / innerHeight) * 2,
    ),
    camera,
  );
  const point = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(seaPlane, point)) {
    if (tileLand(Math.floor(point.x / CELL), Math.floor(point.z / CELL))) {
      toast("Choose open water, captain.");
      return;
    }
    clickTarget = { x: point.x, z: point.z };
  }
  pointerStart = null;
}
window.addEventListener("keydown", (e) => {
  if (!started || e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key) &&
    !paused()
  )
    e.preventDefault();
  if (e.repeat && ["m", "escape"].includes(key)) return;
  if (key === "escape") {
    if ($("market").open || $("chart").open || $("settings").open) return;
    openSettings();
    e.preventDefault();
    return;
  }
  if (key === "m" && !$("market").open) {
    e.preventDefault();
    $("chart").open ? $("chart").close() : openChart();
    return;
  }
  if (paused()) return;
  if (key === " ") {
    speed = 0;
    clickTarget = null;
    keys.clear();
    toast("Anchor dropped.", 2000);
    return;
  }
  keys.add(key);
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => {
  keys.clear();
  if (document.hidden) saveGame(true);
});
window.addEventListener("pagehide", () => saveGame(true));
async function boot() {
  try {
    const res = await fetch("./assets/trade-winds/coast.json");
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
