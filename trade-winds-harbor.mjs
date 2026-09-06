import * as THREE from "./assets/vendor/three.module.js";
import { GLTFLoader } from "./assets/vendor/GLTFLoader.js";

let asset, pending;
export function loadHarborSunset() {
  return pending ||= new GLTFLoader()
    .loadAsync(new URL("./assets/trade-winds/models/clean-character-harbor.glb", import.meta.url).href)
    .then((gltf) => {
      asset = gltf;
      asset.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = !(Array.isArray(o.material) ? o.material : [o.material]).every((m) => m.isMeshBasicMaterial);
          o.receiveShadow = true;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.isMeshBasicMaterial) m.fog = false;
        }
      });
      return asset.scene;
    }).catch((error) => { pending = null; throw error; });
}

export function createHarborSunset() {
  if (!asset) return null;
  const root = asset.scene.clone(true);
  const mixer = new THREE.AnimationMixer(root);
  for (const clip of asset.animations) mixer.clipAction(clip).play();
  const lamps = [];
  let camera;
  root.traverse((o) => {
    if (o.isPerspectiveCamera) camera = o;
    if (o.userData.lamp) lamps.push(o);
  });
  root.updateMatrixWorld(true);
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  lamps.sort((a, b) => a.getWorldPosition(new THREE.Vector3()).distanceToSquared(cameraPosition)
    - b.getWorldPosition(new THREE.Vector3()).distanceToSquared(cameraPosition));
  const lights = lamps.slice(0, 5).map((anchor) => {
    const color = anchor.userData.lampColor
      ? new THREE.Color().fromArray(anchor.userData.lampColor) : 0xffa33c;
    const light = new THREE.PointLight(color, anchor.userData.lampPower ?? 35, anchor.userData.lampDistance ?? 12, 2);
    light.position.set(0, -(anchor.userData.lampDrop ?? .65), anchor.userData.lampForward ?? .25);
    anchor.add(light);
    return { light, power: light.intensity };
  });
  root.userData = {
    harborSunset: true, authoredHarbor: !!camera.userData.authoredHarbor, mixer, camera, lights,
    merchantHead: root.getObjectByName("merchant_head"),
    merchant: root.getObjectByName("merchant"),
    lookYaw: 0,
  };
  return root;
}

export function animateHarborSunset(root, time, gesture = 0, reduced = false) {
  const data = root.userData;
  if (data.animatedHeadQuaternion) data.merchantHead.quaternion.copy(data.animatedHeadQuaternion);
  data.mixer.setTime(reduced ? 0 : time);
  if (data.merchantHead) {
    data.animatedHeadQuaternion ||= new THREE.Quaternion();
    data.animatedHeadQuaternion.copy(data.merchantHead.quaternion);
    if (!data.authoredHarbor) data.merchantHead.rotation.y += data.lookYaw;
    if (!reduced) data.merchantHead.rotation.x -= Math.sin(gesture * Math.PI * 2) * .075;
  }
  data.lights.forEach(({ light, power }, i) => {
    const flicker = reduced ? 0 : .065 * Math.sin(time * Math.PI * 2 / .8 + i) + .035 * Math.sin(time * Math.PI * 2 / 1.5);
    light.intensity = power * (1 + flicker);
  });
}
