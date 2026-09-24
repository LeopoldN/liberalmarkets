import * as THREE from './assets/vendor/three.module.js';
import { GLTFLoader } from './assets/vendor/GLTFLoader.js';

export const BELIZE_ASSET = new URL('./assets/trade-winds/models/belize-town.glb.gz', import.meta.url);
export const BELIZE_POSTER = new URL('./assets/trade-winds/belize/poster.png', import.meta.url);
let assetPromise;

// The .gz extension keeps the static host independent of Content-Encoding setup.
export function loadBelizeTown() {
  return assetPromise ||= (async () => {
    const response = await fetch(BELIZE_ASSET);
    if (!response.ok) throw new Error(`Belize scene: HTTP ${response.status}`);
    const compressed = new Uint8Array(await response.arrayBuffer());
    // Also tolerate hosts that already decode gzip in transit.
    const bytes = compressed[0] === 0x1f && compressed[1] === 0x8b
      ? await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : compressed.buffer;
    return new GLTFLoader().parseAsync(bytes, new URL('.', BELIZE_ASSET).href);
  })().catch(error => { assetPromise = undefined; throw error; });
}

export function lanternFlicker(time, phase) {
  const t = time * Math.PI / 4;
  return 1 + .066 * Math.sin(13*t+phase) + .040 * Math.sin(23*t+phase*2.1)
    + .025 * Math.sin(37*t+phase*.7) + .014 * Math.sin(59*t+phase*3.4);
}

export function createBelizeTown(asset) {
  const root = asset.scene.clone(true);
  const materials = new Map(), lamps = [], flames = [];
  root.traverse(object => {
    if (object.isMesh) {
      const copy = original => {
        if (!materials.has(original)) materials.set(original, original.clone());
        return materials.get(original);
      };
      object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
      const kind = object.material.userData.belizeSurface;
      object.castShadow = !['sky', 'sun', 'glass', 'flame_left', 'flame_right', 'flame'].includes(kind);
      object.receiveShadow = object.castShadow;
    }
    if (object.userData.lamp) {
      const light = new THREE.PointLight(new THREE.Color(...object.userData.lampColor), 1, 8, 2);
      light.power = object.userData.lampPower;
      object.add(light);
      lamps.push({ light, power: light.power, phase: object.userData.flickerPhase });
    }
  });
  for (const material of materials.values()) {
    const kind = material.userData.belizeSurface;
    if (kind === 'flame_left' || kind === 'flame_right') {
      flames.push({ material, strength: material.emissiveIntensity, phase: kind === 'flame_left' ? .12 : 1.37 });
    }
  }
  const mixer = new THREE.AnimationMixer(root);
  const ambient = mixer.clipAction(THREE.AnimationClip.findByName(asset.animations, 'Belize ambient')).play();
  const delivery = mixer.clipAction(THREE.AnimationClip.findByName(asset.animations, 'Belize cargo delivery'));
  delivery.setLoop(THREE.LoopOnce, 1); delivery.clampWhenFinished = true; delivery.play();
  let elapsed = 0;
  const animate = (time, reduced = false) => {
    const next = reduced ? 0 : Math.max(0, time);
    // Reset only on a new visit or when switching reduced-motion preference.
    if (next < elapsed) {
      mixer.stopAllAction(); mixer.time = 0;
      ambient.reset().play(); delivery.reset().play(); elapsed = 0;
    }
    mixer.update(next - elapsed); elapsed = next;
    for (const {light, power, phase} of lamps) light.power = power * (reduced ? 1 : lanternFlicker(next, phase));
    for (const {material, strength, phase} of flames) material.emissiveIntensity = strength * (reduced ? 1 : lanternFlicker(next, phase));
  };
  animate(0);
  return {
    root, mixer, animate, materials, lamps,
    camera: root.getObjectByProperty('isPerspectiveCamera', true),
    focus: root.getObjectByName('belize_merchant_head'),
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); for (const m of materials.values()) m.dispose(); },
  };
}
