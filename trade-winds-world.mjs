import * as THREE from "./assets/vendor/three.module.js";
import {
  PORTS,
  toWorld,
  pointInPolygon,
} from "./trade-winds-engine.mjs?v=cargo-80";
import {
  createPortModel,
  portVariant,
  PORT_VARIANTS,
  appendTree,
  instanceBlocks,
} from "./trade-winds-models.mjs?v=island-post-1";
import {
  findHarborPosition,
  harborGroundContains,
} from "./trade-winds-port-placement.mjs";
import { createVoxelWater } from "./trade-winds-water.mjs?v=storms-1";
import {
  WHIRLPOOL,
  whirlpoolDistance,
} from "./trade-winds-whirlpool-field.mjs?v=pull-2";

const CELL = 10;
const CHUNK = 160;

// Scene resources and terrain caches belong to this world, never to a saved voyage.
export function createSailingWorld({
  scene,
  camera,
  coasts,
  ports,
  sharkShadows,
  stormFields,
}) {
  const chunks = new Map(),
    landCache = new Map();
  const dummy = new THREE.Object3D();
  let shoreCenter = "",
    waterGridSize = 0,
    water;

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
        (PORT_VARIANTS[portVariant(p.id)].terrainRadius ?? 85)
      )
        h = 8;
    const underPort = ports.some((p) =>
      harborGroundContains(
        p,
        (ix + 0.5) * CELL,
        (iz + 0.5) * CELL,
        PORT_VARIANTS[portVariant(p.id)].ground,
        CELL / 2,
      ),
    );
    // Quays and low wooden walks supply their own top surface. Keep terrain and
    // the raised grass layer beneath them, including cells crossing their edges.
    return underPort ? { h: 6, depth: 0 } : { h, depth };
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
            ) < (PORT_VARIANTS[portVariant(p.id)].treeClearance ?? 65) ||
            harborGroundContains(
              p,
              (ix + 0.5) * CELL,
              (iz + 0.5) * CELL,
              PORT_VARIANTS[portVariant(p.id)].ground,
              12,
            ),
        );
        if (r > 0.945 && !nearTown) {
          appendTree(data, x, h, z, "palm", r * 100, depth === 0 ? 0.82 : 1);
        } else if (depth > 1 && r > 0.82 && !nearTown) {
          appendTree(
            data,
            x,
            h,
            z,
            "canopy",
            r * 100,
            0.8 + hash(iz, ix) * 0.25,
          );
        }
      }
    instanceBlocks(data, group);
    scene.add(group);
    return group;
  }
  function updateTerrain(state, force = false) {
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
    updateWaterGrid(range, state);
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
    return findHarborPosition(toWorld(port.lon, port.lat), tileLand, {
      compact: portVariant(port.id) === "island",
    });
  }
  function makePort(p) {
    p.group = createPortModel(portVariant(p.id));
    p.group.position.set(p.land.x, 0, p.land.z);
    p.group.rotation.y = Math.atan2(p.normal.x, p.normal.z);
    scene.add(p.group);
  }
  function makeWater() {
    const mesh = createVoxelWater(sharkShadows, stormFields);
    scene.add(mesh);
    const deep = new THREE.Mesh(
      new THREE.PlaneGeometry(40000, 40000),
      new THREE.MeshBasicMaterial({ color: 0x176c7a }),
    );
    deep.rotation.x = -Math.PI / 2;
    deep.position.y = -160;
    scene.add(deep);
    return mesh;
  }
  function updateWaterGrid(range, state) {
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
  function openMonsterWater(x, z, radius) {
    if (whirlpoolDistance(x, z) < WHIRLPOOL.influence + radius) return false;
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
  water = makeWater();
  PORTS.forEach((p) => ports.push({ ...p, ...findHarbor(p) }));
  ports.forEach(makePort);
  return {
    update: updateTerrain,
    isSolid: (x, z) => tileLand(Math.floor(x / CELL), Math.floor(z / CELL)),
    openWater: openMonsterWater,
    get water() {
      return water;
    },
  };
}
