import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "../assets/vendor/three.module.js";
import { loadTradingSloop, createVessel, animateVessel, disposeModel } from "../trade-winds-models.mjs";

const bytes = readFileSync(new URL("../assets/trade-winds/models/trading-sloop.glb", import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
test("sloop export includes cloth deformation and independent crew/lantern animation within budget", () => {
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 12 * 1024 * 1024);
  assert.ok(gltf.meshes.reduce((sum, m) => sum + m.primitives.length, 0) <= 20);
  assert.equal(gltf.images, undefined);
  assert.equal(gltf.cameras, undefined);
  const animated = gltf.animations.flatMap((a) => a.channels.map((c) => [gltf.nodes[c.target.node].name, c.target.path]));
  for (const name of ["rig_helmsman", "rig_head", "rig_lantern", "rig_loose_rope", "rig_wheel"])
    assert.ok(animated.some(([n, path]) => n === name && path === "rotation"), name);
  for (const name of ["Main sail", "Jib", "Flag"])
    assert.ok(animated.some(([n, path]) => n.startsWith(name) && path === "weights"), name);
});

test("sloop animation loops, stays local to each vessel, and stops cleanly on disposal", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (request) => {
    assert.match(request.url, /trading-sloop\.glb$/);
    requests++;
    return new Response(bytes);
  });
  const previous = globalThis.ProgressEvent;
  globalThis.ProgressEvent = class extends Event {
    constructor(type, init) { super(type); Object.assign(this, init); }
  };
  t.after(() => { if (previous) globalThis.ProgressEvent = previous; else delete globalThis.ProgressEvent; });
  const [asset] = await Promise.all([loadTradingSloop(), loadTradingSloop()]);
  assert.equal(requests, 1);
  assert.ok(asset.animations.every((clip) => Math.abs(clip.duration - 10) < .001));
  const a = createVessel("trader"), b = createVessel("trader");
  a.position.set(40, 3, -25);
  animateVessel(a, 0); animateVessel(b, 0);
  const headA = a.getObjectByName("rig_head"), headB = b.getObjectByName("rig_head");
  const rest = headA.quaternion.clone();
  let sail;
  a.traverse((o) => { if (o.isMesh && o.name.startsWith("Main_sail")) sail = o; });
  assert.ok(sail?.morphTargetInfluences);
  const canvasSize = new THREE.Box3().setFromObject(sail).getSize(new THREE.Vector3());
  assert.ok(canvasSize.x > canvasSize.z * 8, "main canvas faces the bow across the beam");
  let flag;
  a.traverse((o) => { if (o.isMesh && o.name.startsWith("Flag")) flag = o; });
  const flagBox = new THREE.Box3().setFromObject(flag);
  const flagSize = flagBox.getSize(new THREE.Vector3());
  assert.ok(flagSize.z > flagSize.x * 4, "pennant extends along the vessel rather than across it");
  assert.ok(flagBox.min.z > a.position.z + .8, "pennant trails aft (+Z) from the mast");
  const restCloth = [...sail.morphTargetInfluences];
  animateVessel(a, 1.25);
  assert.ok(headA.quaternion.angleTo(rest) > .01);
  assert.ok(headB.quaternion.angleTo(rest) < .0001, "cloned sailor is independent");
  assert.notDeepEqual(sail.morphTargetInfluences, restCloth);
  assert.deepEqual(a.position.toArray(), [40, 3, -25], "idle does not replace gameplay movement");
  const sample = headA.quaternion.clone();
  animateVessel(a, 1.25);
  assert.ok(headA.quaternion.angleTo(sample) < .0001, "same time holds a paused pose");
  animateVessel(a, 10);
  assert.ok(headA.quaternion.angleTo(rest) < .0001);
  sail.morphTargetInfluences.forEach((v, i) => assert.ok(Math.abs(v - restCloth[i]) < .0001));
  const bounds = new THREE.Box3().setFromObject(b);
  assert.ok(bounds.min.y > -2 && bounds.max.y > 27 && bounds.max.y < 32, "game waterline and mast height");
  disposeModel(a);
  animateVessel(a, 1.25);
  assert.ok(headA.quaternion.angleTo(rest) < .0001, "disposed rig no longer updates");
  animateVessel(b, 1.25);
  assert.ok(headB.quaternion.angleTo(rest) > .01, "disposing another vessel leaves this rig active");
});
