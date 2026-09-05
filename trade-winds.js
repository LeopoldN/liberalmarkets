import * as THREE from "./assets/vendor/three.module.js";
import { WakeTrail } from "./trade-winds-wake.mjs";
import {
  GOODS,
  PORTS,
  SAVE_KEY,
  SHIP_SPEED as SPEED,
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
  color = new THREE.Color(),
  raycaster = new THREE.Raycaster(),
  seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const cameraAim = new THREE.Vector3(),
  desiredAim = new THREE.Vector3();
const cube = new THREE.BoxGeometry(1, 1, 1),
  material = new THREE.MeshStandardMaterial({
    roughness: 1,
    flatShading: true,
  });
const mats = new Map();
const wake = new WakeTrail();
let waterGridSize = 0;
function mat(c) {
  if (!mats.has(c))
    mats.set(
      c,
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.95,
        flatShading: true,
      }),
    );
  return mats.get(c);
}
function block(parent, x, y, z, w, h, d, c) {
  const m = new THREE.Mesh(cube, mat(c));
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
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
function instanceBlocks(data, parent) {
  if (!data.length) return;
  const mesh = new THREE.InstancedMesh(cube, material, data.length);
  data.forEach((b, i) => {
    dummy.position.set(b[0], b[1], b[2]);
    dummy.scale.set(b[3], b[4], b[5]);
    dummy.rotation.set(0, b[7] || 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.set(b[6]));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
}
function consolidate(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(),
    items = [];
  group.traverse((obj) => {
    if (obj.isMesh)
      items.push({
        matrix: inverse.clone().multiply(obj.matrixWorld),
        color: obj.material.color,
      });
  });
  const retained = group.children.filter((obj) => obj.isLine);
  group.clear();
  retained.forEach((obj) => group.add(obj));
  const mesh = new THREE.InstancedMesh(cube, material, items.length);
  items.forEach((item, i) => {
    mesh.setMatrixAt(i, item.matrix);
    mesh.setColorAt(i, item.color);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
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
      if (r > 0.925 && !nearTown) {
        const ht = depth === 0 ? 16 : 20;
        data.push(
          [x, h + ht / 2, z, 2.4, ht, 2.4, 0x806340],
          [x + 1, h + ht, z, 3, 3, 3, 0x69883c],
        );
        for (let k = 0; k < 4; k++) {
          const angle = (k * Math.PI) / 2 + r;
          const dx = Math.cos(angle),
            dz = Math.sin(angle);
          data.push(
            [x + dx * 5, h + ht + 1, z + dz * 5, 12, 2, 3, 0x54863a, angle],
            [x + dx * 10, h + ht - 1, z + dz * 10, 7, 2, 3, 0x679344, angle],
          );
        }
      } else if (depth > 1 && r > 0.74 && !nearTown) {
        data.push(
          [x, h + 5, z, 3, 10, 3, 0x655331],
          [x, h + 10, z, 10, 9, 10, r > 0.85 ? 0x487642 : 0x537e40],
          [x + 1, h + 16, z, 7, 5, 7, 0x648a42],
        );
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
  const g = new THREE.Group();
  g.position.set(p.land.x, 0, p.land.z);
  g.rotation.y = Math.atan2(p.normal.x, p.normal.z);
  p.group = g;
  // Wooden landing, piers, mooring posts, and stacked cargo.
  block(g, 0, 5, 19, 15, 3, 54, 0x846346);
  for (let z = 0; z < 49; z += 5) {
    block(g, 0, 6.65, z, 15, 0.35, 0.7, 0xa18058);
    for (const x of [-8, 8]) block(g, x, 3, z, 2, 13, 2, 0x594b36);
  }
  for (let i = 0; i < 6; i++) {
    block(
      g,
      -5 + (i % 2) * 4,
      9 + Math.floor(i / 4) * 4,
      4 + Math.floor(i / 2) * 5,
      3.4,
      4,
      3.4,
      i % 2 ? 0xb18b55 : 0x977449,
    );
  }
  block(g, 0, 5, -12, 85, 8, 27, 0xa99b76);
  block(g, 0, 9.5, -10, 87, 1, 29, 0xccbb8d);
  for (let i = 0; i < 7; i++) {
    const x = ((i % 4) - 1.5) * 23,
      z = -29 - Math.floor(i / 4) * 25,
      w = 15 + hash(i, p.lon) * 5,
      h = 15 + hash(i, p.lat) * 13;
    block(g, x, 8 + h / 2, z, w, h, 17, p.color);
    block(g, x, 8 + h, z, w + 3, 2, 20, 0xad6b47);
    for (let r = 0; r < 4; r++)
      block(g, x, 10 + h + r * 1.7, z, w + 3 - r * 3, 1.8, 20, 0x9e5738);
    block(g, x, 13, z + 8.6, 4, 9, 0.5, 0x554c38);
    for (const wx of [-5, 5]) {
      block(g, x + wx, 17 + h * 0.15, z + 8.7, 3, 4, 0.5, 0x4c6862);
      block(g, x + wx, 19 + h * 0.15, z + 9, 4, 0.7, 1, 0xeadcb8);
    }
    if (i === 2) {
      block(g, x, 8 + h + 11, z, 8, 16, 8, p.color);
      block(g, x, 8 + h + 20, z, 10, 2, 10, 0x9b6045);
      block(g, x, 8 + h + 22, z, 2, 5, 2, 0xd4c1a1);
    }
  }
  // Fort at the headland.
  block(g, 60, 18, -34, 22, 25, 23, 0xb9ae89);
  for (let i = 0; i < 4; i++)
    for (const z of [-45, -23]) block(g, 51 + i * 6, 32, z, 3, 5, 3, 0xd6c69d);
  block(g, 60, 43, -34, 1, 26, 1, 0x765d42);
  block(g, 66, 52, -34, 12, 6, 0.7, 0xe6c48a);
  // Harbor palms and warm lanterns.
  for (const x of [-43, 43]) {
    block(g, x, 21, -13, 3, 26, 3, 0x876a44);
    for (let k = 0; k < 4; k++) {
      const angle = (k * Math.PI) / 2 + 0.4;
      const m = block(
        g,
        x + Math.cos(angle) * 7,
        35,
        -13 + Math.sin(angle) * 7,
        18,
        2.2,
        4,
        0x61853c,
      );
      m.rotation.y = -angle;
    }
  }
  for (const x of [-8, 8]) {
    block(g, x, 14, 40, 1, 12, 1, 0x514b36);
    block(g, x, 20, 40, 3, 4, 3, 0xffcc70);
  }
  // A small second vessel and locals make the harbor feel inhabited.
  const boat = new THREE.Group();
  block(boat, 0, 2, 0, 8, 4, 24, 0x604534);
  block(boat, 0, 4, 0, 6, 1, 20, 0xab8452);
  block(boat, 0, 14, 0, 1, 25, 1, 0x67543b);
  block(boat, 3, 18, 0, 6, 12, 0.8, 0xe7d6aa);
  boat.position.set(25, 0, 19);
  g.add(boat);
  for (let i = 0; i < 5; i++) {
    const x = -27 + i * 13;
    block(g, x, 12, -8, 3, 4, 2, i % 2 ? 0x607e79 : 0x96553d);
    block(g, x, 15, -8, 2.4, 2.4, 2.4, 0xc69567);
    block(g, x, 16.4, -8, 4, 1, 3, 0x6d6242);
  }
  consolidate(g);
  scene.add(g);
}
function makeShip() {
  const g = new THREE.Group();
  block(g, 0, 2, 0, 11, 5, 25, 0x5b3e2b);
  block(g, 0, 4, 0, 14, 4, 22, 0x765038);
  block(g, 0, 3, -14, 8, 4, 7, 0x68452f);
  block(g, 0, 4, -18, 4, 3, 4, 0x765038);
  block(g, 0, 6, 0, 12, 1.5, 24, 0xbb935a);
  for (const x of [-6.5, 6.5]) {
    block(g, x, 7, 1, 1, 3, 23, 0x543e2b);
    block(g, x, 8.5, 1, 1.4, 0.7, 23, 0xd1ae6c);
  }
  block(g, 0, 8, 9, 10, 4, 6, 0x83613e);
  block(g, 0, 10.5, 9, 11, 1, 7, 0xc09c63);
  block(g, 0, 9, 5.8, 3, 2, 0.5, 0x364f51);
  block(g, 0, 23, 0, 1.2, 38, 1.2, 0x675039);
  block(g, 0, 18, 10, 1, 26, 1, 0x725336);
  block(g, 0, 9, -19, 1, 1, 14, 0x9e7c4e);
  // Stepped canvas sails with individual cloth bands and a curved belly.
  for (let j = 0; j < 9; j++) {
    const w = 17 - j * 0.65;
    block(
      g,
      0,
      19 + j * 1.9,
      1.7 + Math.sin((j / 9) * Math.PI) * 1.5,
      w,
      2,
      0.6,
      j % 3 === 0 ? 0xe8dcb8 : 0xf4e9cd,
    );
  }
  block(g, 0, 37, 1, 18, 0.7, 1, 0x886744);
  block(g, 0, 18, 1, 20, 0.7, 1, 0x886744);
  for (let j = 0; j < 6; j++)
    block(
      g,
      0,
      17 + j * 1.8,
      10.8 + Math.sin((j / 6) * Math.PI),
      11 - j * 0.65,
      1.9,
      0.6,
      0xe5d7b0,
    );
  for (let j = 0; j < 8; j++)
    block(g, 0, 12 + j * 1.6, -14 + j * 0.9, 0.6, 1.7, 9 - j * 0.9, 0xf3e5bf);
  block(g, 2.5, 41, 0, 5, 3, 0.5, 0xb75d41);
  block(g, 6, 40.5, 0, 2, 2, 0.5, 0xb75d41);
  for (const x of [-5, 5]) {
    const pts = [
      new THREE.Vector3(x, 8, 7),
      new THREE.Vector3(0, 39, 0),
      new THREE.Vector3(x, 8, -9),
    ];
    g.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x736247 }),
      ),
    );
  }
  block(g, -3, 9, 9, 2, 3, 2, 0x3c6970);
  block(g, -3, 11.5, 9, 1.7, 1.7, 1.7, 0xcb9d71);
  block(g, -3, 12.6, 9, 3, 0.6, 2, 0x433d30);
  block(g, 3, 8, -3, 3, 3, 3, 0x937145);
  block(g, -3, 8, -5, 3, 3, 4, 0xa07c4c);
  consolidate(g);
  scene.add(g);
  return g;
}
function waveHeight(x, z, time) {
  return (
    Math.floor(
      (Math.sin(x * 0.036 + z * 0.021 - time * 0.85) * 0.34 +
        Math.sin(z * 0.057 - x * 0.014 + time * 0.61) * 0.23 +
        0.6) *
        5,
    ) *
      0.18 -
    0.8
  );
}
function makeWater() {
  // A shallow cube for each water tile gives the sea real stepped edges.
  const geometry = new THREE.BoxGeometry(12, 0.9, 12);
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
      void main() {
        vec4 center = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
        float swell = sin(center.x * .036 + center.z * .021 - time * .85) * .34
          + sin(center.z * .057 - center.x * .014 + time * .61) * .23;
        vec4 point = instanceMatrix * vec4(position, 1.);
        point.y += floor((swell + .6) * 5.) * .18 - .8;
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
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
          mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y);
      }
      void main() {
        vec2 p = world.xz;
        vec2 tile = floor((p + 6.) / 12.);
        vec2 pixel = floor(p / 2.) * 2.;
        // Broad color shoals, then a restrained palette of individual water facets.
        float depth = noise(tile * .085) * .7 + noise(tile * .21) * .3;
        depth = floor(depth * 7.) / 7.;
        vec3 c = mix(vec3(.012, .125, .19), vec3(.028, .265, .29), depth);
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
        c = mix(c, vec3(.17, .42, .43), lip * .18);
        float cap = step(.985, hash(floor(ripple / 2.))) * step(.78, crest);
        float flicker = smoothstep(.3, .9, sin(time * .9 + hash(ripple) * 6.28));
        c = mix(c, vec3(.57, .73, .65), cap * flicker * .42 * fancy);
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
  deep.position.y = -3;
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
  wake.update(dt, state);
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
function makeGull(index) {
  const gull = new THREE.Group();
  gull.name = `gull-${index}`;
  const body = new THREE.Group();
  // A rounded, stepped breast, gray mantle, and a distinct forward-facing head.
  block(body, 0, 0, 0, 2.3, 1.8, 4.6, 0xf4f1df);
  block(body, 0, -0.65, -0.2, 1.7, 1.1, 3.2, 0xe1e5dd);
  block(body, 0, 0.85, 0.5, 2.2, 0.7, 3.3, 0xb7c7c8);
  block(body, 0, 0.45, -2.15, 1.5, 1.8, 1.9, 0xf7f3e7);
  block(body, 0, 1.05, -3.1, 1.85, 1.65, 1.9, 0xfff9e7);
  block(body, 0, 0.75, -4.25, 0.75, 0.6, 1.05, 0xe0ad48);
  block(body, 0, 0.6, -4.9, 0.45, 0.4, 0.4, 0xb98535);
  for (const side of [-1, 1]) {
    block(body, side * 0.95, 1.3, -3.5, 0.25, 0.4, 0.4, 0x293737);
    block(body, side * 0.55, -0.8, 2.0, 0.3, 0.3, 1.25, 0xc78c48);
  }
  // Three staggered tail feathers retain a bird silhouette when the wings fold.
  for (let feather = -1; feather <= 1; feather++) {
    block(
      body,
      feather * 0.65,
      0.05,
      3.0,
      0.65,
      0.5,
      2.6 - Math.abs(feather) * 0.4,
      0xeff1e5,
    );
  }
  consolidate(body);
  gull.add(body);
  const wings = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.85, 0.7, -0.25);
    const inner = new THREE.Group();
    block(inner, side * 1.7, 0, 0.05, 3.7, 0.65, 2.8, 0xb9c9c9);
    block(inner, side * 1.7, -0.3, 0.6, 3.5, 0.3, 2.2, 0xf2f1df);
    block(inner, side * 2.7, 0.05, -0.45, 2.1, 0.5, 1.6, 0xdde5dc);
    consolidate(inner);
    shoulder.add(inner);
    const tip = new THREE.Group();
    tip.position.set(side * 3.4, 0, 0.25);
    block(tip, side * 1.35, 0, 0.45, 2.9, 0.5, 2.0, 0xc3ceca);
    // Swept, dark primary feathers, each offset to form a tapered wingtip.
    for (let feather = 0; feather < 3; feather++) {
      block(
        tip,
        side * (2.65 + feather * 0.5),
        -0.08,
        0.05 + feather * 0.62,
        2.05 - feather * 0.4,
        0.4,
        0.58,
        feather === 0 ? 0x546568 : 0x37494d,
      );
    }
    block(tip, side * 2.6, 0.16, 0.6, 0.7, 0.22, 0.55, 0xf0efe0);
    consolidate(tip);
    shoulder.add(tip);
    gull.add(shoulder);
    wings.push({ shoulder, tip, side });
  }
  gull.scale.setScalar(0.8 + (index % 3) * 0.1);
  gull.userData.wings = wings;
  gull.userData.phase = index * 1.73;
  return gull;
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
  ship = makeShip();
  const home = ports[0];
  state = newState({
    x: home.x + home.normal.x * 20,
    z: home.z + home.normal.z * 20,
  });
  state.heading = Math.atan2(-home.normal.x, -home.normal.z);
  cameraAim.set(state.x - 65, 0, state.z - 40);
  updateTerrain(true);
  const birds = new THREE.Group();
  birds.position.set(state.x, 0, state.z);
  for (let i = 0; i < 7; i++) birds.add(makeGull(i));
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
        remaining -= step;
      }
    }
    ship.position.set(state.x, 1 + Math.sin(clockTime * 1.5) * 0.35, state.z);
    ship.rotation.set(
      Math.sin(clockTime * 1.3) * 0.012,
      state.heading,
      Math.sin(clockTime * 1.6) * 0.025,
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
  const fx = nx - Math.sin(state.heading) * 13 * Math.sign(speed),
    fz = nz - Math.cos(state.heading) * 13 * Math.sign(speed);
  // Collide with the same voxel cells used by terrain, including the hull's width.
  const solid = (x, z) => tileLand(Math.floor(x / CELL), Math.floor(z / CELL));
  if (
    Math.abs(speed) > 0.1 &&
    (solid(fx, fz) ||
      solid(
        nx + Math.cos(state.heading) * 6,
        nz - Math.sin(state.heading) * 6,
      ) ||
      solid(nx - Math.cos(state.heading) * 6, nz + Math.sin(state.heading) * 6))
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
  if (resume && loadedSave) {
    state = loadedSave;
    if (tileLand(Math.floor(state.x / CELL), Math.floor(state.z / CELL))) {
      state.x = ports[0].x;
      state.z = ports[0].z;
    }
    ignorePort = null;
  }
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
