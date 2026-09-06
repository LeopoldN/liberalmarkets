import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "../assets/vendor/three.module.js";
import { loadRaftAsset, createVessel, disposeModel } from "../trade-winds-models.mjs";

const bytes = readFileSync(new URL("../assets/trade-winds/models/seated-raft.glb", import.meta.url));
const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));

test("seated raft export preserves voxel colors within the gameplay rendering budget", () => {
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const primitives = document.meshes.flatMap((mesh) => mesh.primitives);
  assert.equal(primitives.length, 5);
  assert.ok(primitives.every((p) => p.attributes.COLOR_0 !== undefined));
  const triangles = primitives.reduce((sum, p) => sum + document.accessors[p.indices].count / 3, 0);
  assert.ok(triangles < 70000);
  assert.ok(bytes.length < 5 * 1024 * 1024);
  assert.equal(document.images, undefined, "no external textures to delay vessel loading");
  assert.equal(document.cameras, undefined, "studio is excluded from the game asset");
});

test("loaded rafts share cached meshes but keep independent vessel transforms after disposal", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (request) => {
    assert.match(request.url, /seated-raft\.glb$/);
    requests++;
    return new Response(bytes);
  });
  const originalProgressEvent = globalThis.ProgressEvent;
  globalThis.ProgressEvent = class extends Event {
    constructor(type, init) { super(type); Object.assign(this, init); }
  };
  t.after(() => {
    if (originalProgressEvent) globalThis.ProgressEvent = originalProgressEvent;
    else delete globalThis.ProgressEvent;
  });
  await Promise.all([loadRaftAsset(), loadRaftAsset()]);
  assert.equal(requests, 1);
  const a = createVessel("raft"), b = createVessel("raft");
  assert.equal(a.userData.vessel, "raft");
  const meshes = [];
  a.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 5);
  assert.ok(meshes.every((o) => o.castShadow && o.receiveShadow));
  const bounds = new THREE.Box3().setFromObject(a);
  assert.ok(bounds.min.y > -1.5 && bounds.min.y < 0, "lashed logs straddle the waterline");
  assert.ok(bounds.max.y > 16 && bounds.max.y < 18, "uniform game scale");
  let disposed = false;
  meshes[0].geometry.addEventListener("dispose", () => { disposed = true; });
  a.position.x = 50;
  disposeModel(a);
  assert.equal(b.position.x, 0);
  assert.equal(disposed, false, "a replacement vessel still uses the cached geometry");
  assert.ok(b.getObjectByName(meshes[0].name).geometry === meshes[0].geometry);
});
