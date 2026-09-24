import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createBelizeTown, loadBelizeTown, lanternFlicker } from '../trade-winds-belize.mjs';
import { townBackgroundKind } from '../trade-winds-town-background.mjs';
import { PORTS } from '../trade-winds-engine.mjs';

const compressed = readFileSync(new URL('../assets/trade-winds/models/belize-town.glb.gz', import.meta.url));
const bytes = gunzipSync(compressed);
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));

test('Belize export is self-contained, compact, and separates delivery from looping motion', () => {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.ok(compressed.length < 13 * 1024 * 1024);
  assert.equal(gltf.images, undefined);
  assert.ok(gltf.buffers.every(b => !b.uri));
  assert.equal(gltf.cameras.length, 1);
  assert.ok(gltf.nodes.some(n => n.camera === 0 && n.extras.authoredBelize));
  assert.deepEqual(gltf.animations.map(c => c.name), ['Belize ambient', 'Belize cargo delivery']);
  for (const clip of gltf.animations) {
    for (const channel of clip.channels) {
      const carrier = !!gltf.nodes[channel.target.node].extras?.belizeCarrier;
      assert.equal(carrier, clip.name === 'Belize cargo delivery');
    }
  }
  const moving = new Set(gltf.animations.flatMap(a => a.channels.map(c => gltf.nodes[c.target.node].name)));
  for (const name of ['belize_merchant_head', 'belize_carrier_travel', 'belize_frigate', 'belize_rowboat', 'belize_crane_boom', 'belize_crane_load', 'belize_lantern_left', 'belize_lantern_right', 'belize_cable_hoist_0', 'belize_cable_mooring_0']) assert.ok(moving.has(name), name);
});

test('only Belize selects the imported town scene', () => {
  for (const port of PORTS) assert.equal(townBackgroundKind(port), port.id === 'belize' ? 'belize' : 'trading-post');
});

test('loader retries failures, shares its download, and preserves independent animation instances', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    assert.match(url.href, /belize-town\.glb\.gz$/);
    requests++;
    return requests === 1 ? new Response('', { status: 503 }) : new Response(compressed);
  });
  await assert.rejects(loadBelizeTown(), /503/);
  const [asset, same] = await Promise.all([loadBelizeTown(), loadBelizeTown()]);
  assert.equal(asset, same); assert.equal(requests, 2);
  const a = createBelizeTown(asset), b = createBelizeTown(asset);
  t.after(() => { a.dispose(); b.dispose(); });
  const carrier = a.root.getObjectByName('belize_carrier_travel');
  const ship = a.root.getObjectByName('belize_frigate');
  a.animate(0); const start = carrier.position.clone(), shipStart = ship.quaternion.clone();
  // Regression: changing Blender rotation mode after assigning the first key
  // replaced its authored frigate yaw with identity for one frame every loop.
  a.animate(1/24); assert.ok(shipStart.angleTo(ship.quaternion) < .01, 'no first-frame rotation jump');
  a.animate(8); const delivered = carrier.position.clone();
  assert.ok(Math.abs(delivered.z - start.z - 4.8) < .001, 'carrier walks 4.8m forward');
  assert.ok(shipStart.angleTo(ship.quaternion) < .001, 'ambient loop closes');
  a.animate(20); assert.ok(carrier.position.distanceTo(delivered) < .001, 'delivery never teleports back');
  assert.ok(b.root.getObjectByName('belize_carrier_travel').position.distanceTo(start) < .001);
  assert.notEqual(a.lamps[0].light, b.lamps[0].light);
  a.animate(0); assert.ok(carrier.position.distanceTo(start) < .001, 'next visit restarts delivery');
  a.animate(3); const bob = ship.quaternion.clone();
  a.animate(6); assert.ok(bob.angleTo(ship.quaternion) > .001, 'ship motion retained');
  a.animate(50, true); const still = carrier.position.clone(), rotation = ship.quaternion.clone();
  a.animate(70, true);
  assert.ok(carrier.position.distanceTo(still) < .001);
  assert.ok(rotation.angleTo(ship.quaternion) < .001);
  for (const {light, power} of a.lamps) assert.ok(Math.abs(light.power - power) < .000001);
  for (const phase of [.12, 1.37]) assert.ok(Math.abs(lanternFlicker(2, phase) - lanternFlicker(10, phase)) < .000001);
});
