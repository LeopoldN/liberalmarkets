import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PORTS, pointInPolygon, toWorld } from '../trade-winds-engine.mjs';
import { findHarborPosition, harborGroundContains } from '../trade-winds-port-placement.mjs';

const coast = JSON.parse(readFileSync(new URL('../assets/trade-winds/coast.json', import.meta.url)));
const cache = new Map();
const land = (x, z) => {
  const key = `${x},${z}`;
  if (!cache.has(key)) {
    const { lon, lat } = { lon: (x + .5) * 10 / 220 - 80, lat: 22 - (z + .5) * 10 / 220 };
    cache.set(key, coast.some(ring => pointInPolygon(lon, lat, ring)));
  }
  return cache.get(key);
};
const compactPorts = new Set(['keywest', 'nassau', 'bridgetown', 'stgeorges']);
const harbors = PORTS.map(port => ({
  id: port.id,
  ref: toWorld(port.lon, port.lat),
  ...findHarborPosition(toWorld(port.lon, port.lat), land, { compact: compactPorts.has(port.id) }),
}));

test('Portobelo faces north into the Caribbean with the settlement behind the pier', () => {
  const p = harbors.find(p => p.id === 'portobelo');
  assert.deepEqual(p.normal, { x: 0, z: -1 });
  const x = Math.floor(p.land.x / 10), z = Math.floor(p.land.z / 10);
  let supported = 0;
  for (let side = -5; side <= 5; side++)
    for (let back = 1; back <= 6; back++) if (land(x + side, z + back)) supported++;
  assert.ok(supported / 66 > .8, 'most of the settlement should sit inland, not across a shoreline corner');
});

test('every port has a land anchor and an uninterrupted approach wide enough for a ship', () => {
  for (const p of harbors) {
    const x = Math.floor(p.land.x / 10), z = Math.floor(p.land.z / 10);
    const { x: dx, z: dz } = p.normal;
    assert.ok(land(x, z), p.id);
    assert.ok(Math.hypot(p.land.x - p.ref.x, p.land.z - p.ref.z) < 150, `${p.id} stays near its geographic location`);
    for (let forward = 1; forward <= 12; forward++) {
      const width = forward === 1 ? 0 : 1;
      for (let side = -width; side <= width; side++)
        assert.equal(land(x + dx * forward + dz * side, z + dz * forward - dx * side), false, `${p.id}: clear pier and approach`);
    }
    for (const ahead of [55, 75, 80]) {
      assert.equal(land(Math.floor((p.land.x + dx * ahead) / 10), Math.floor((p.land.z + dz * ahead) / 10)), false, `${p.id}: arrival, starting and departure positions are water`);
    }
  }
});

test('a small island remains eligible without enough land for a full town footprint', () => {
  const p = findHarborPosition({ x: 5, z: 5 }, (x, z) => x === 0 && z === 0, { compact: true });
  assert.deepEqual(p.land, { x: 5, z: 5 });
});

test('a blocked coastline fails explicitly instead of inventing a harbor in the sea', () => {
  assert.throws(() => findHarborPosition({ x: 0, z: 0 }, () => false), /No navigable harbor/);
});

test('terrain clearance follows rotated port grounds and includes overlapping edge cells', () => {
  const footprint = { halfWidth: 54, back: -54, front: 9 };
  for (const [x, z] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const p = { land: { x: 125, z: 235 }, normal: { x, z } };
    const contains = (side, ahead, padding = 0) => harborGroundContains(p,
      p.land.x + side * z + ahead * x, p.land.z - side * x + ahead * z, footprint, padding);
    assert.equal(contains(40, -40), true, 'building ground is cleared');
    assert.equal(contains(0, 35), false, 'water beyond the quay is untouched');
    assert.equal(contains(58, -20), false);
    assert.equal(contains(58, -20, 5), true, 'a terrain cell partially beneath the platform is lowered');
    assert.equal(contains(0, -80, 12), false, 'inland terrain is preserved');
  }
});
