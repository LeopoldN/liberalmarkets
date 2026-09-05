// Close-up trading-post set. Kept separate from the sailing-world model library.
import * as THREE from "./assets/vendor/three.module.js";
import { createTradingShip, createPortModel } from "./trade-winds-models.mjs";
const cube = new THREE.BoxGeometry(1, 1, 1),
  materials = new Map();
function box(g, x, y, z, w, h, d, color) {
  if (!materials.has(color))
    materials.set(
      color,
      new THREE.MeshStandardMaterial({ color, roughness: 0.94 }),
    );
  const m = new THREE.Mesh(cube, materials.get(color));
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function batch(g) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(),
    items = [];
  g.traverse((m) => {
    if (m.isMesh)
      items.push({
        matrix: inv.clone().multiply(m.matrixWorld),
        color: m.material.color,
      });
  });
  g.clear();
  const mesh = new THREE.InstancedMesh(
    cube,
    new THREE.MeshStandardMaterial({ roughness: 0.94 }),
    items.length,
  );
  items.forEach((p, i) => {
    mesh.setMatrixAt(i, p.matrix);
    mesh.setColorAt(i, p.color);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  g.add(mesh);
  return g;
}
function barrel(g, x, y, z, size = 1) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.scale.setScalar(size);
  box(b, 0, 1.6, 0, 2.3, 3.2, 2.3, 0x76502e);
  box(b, 0, 1.6, 0, 2.7, 2.3, 2.7, 0x8d6135);
  for (let i = -2; i <= 2; i++) {
    box(b, i * 0.5, 1.6, 1.37, 0.07, 2.9, 0.1, 0x513824);
    box(b, 1.37, 1.6, i * 0.5, 0.1, 2.9, 0.07, 0x513824);
  }
  for (const h of [0.5, 2.6]) box(b, 0, h, 0, 2.83, 0.28, 2.83, 0x535651);
  box(b, 0, 3.22, 0, 2.1, 0.18, 2.1, 0xad814b);
  g.add(b);
}
function crate(g, x, y, z, size = 2.2) {
  box(g, x, y + size / 2, z, size, size, size, 0x896039);
  for (const side of [-1, 1]) {
    box(
      g,
      x + side * (size / 2 - 0.16),
      y + size / 2,
      z + size / 2 + 0.04,
      0.3,
      size,
      0.18,
      0xbc8b4d,
    );
    box(
      g,
      x,
      y + size / 2 + side * (size / 2 - 0.16),
      z + size / 2 + 0.04,
      size,
      0.3,
      0.18,
      0xbc8b4d,
    );
  }
  const brace = box(
    g,
    x,
    y + size / 2,
    z + size / 2 + 0.13,
    0.28,
    size * 1.2,
    0.18,
    0xa47741,
  );
  brace.rotation.z = 0.7;
}
function lantern(g, x, y, z, scale = 1) {
  const lamp = new THREE.Group();
  lamp.position.set(x, y, z);
  lamp.scale.setScalar(scale);
  box(lamp, 0, 0.08, 0, 1.4, 0.3, 1.1, 0x3d3b2d);
  box(lamp, 0, 1.65, 0, 1.45, 0.3, 1.15, 0x444235);
  for (const a of [-0.55, 0.55])
    for (const b of [-0.4, 0.4])
      box(lamp, a, 0.85, b, 0.12, 1.55, 0.12, 0x4b4630);
  box(lamp, 0, 1.95, 0, 0.9, 0.3, 0.8, 0x514b34);
  box(lamp, 0, 2.2, 0, 0.15, 0.5, 0.2, 0x433d2e);
  box(lamp, 0, 0.5, 0, 0.75, 0.2, 0.6, 0xa17032);
  batch(lamp);
  const flame = new THREE.Mesh(
    cube,
    new THREE.MeshStandardMaterial({
      color: 0xffd976,
      emissive: 0xffb23b,
      emissiveIntensity: 2.6,
    }),
  );
  flame.position.set(0, 0.95, 0);
  flame.scale.set(0.62, 0.95, 0.5);
  lamp.add(flame);
  const core = new THREE.Mesh(
    cube,
    new THREE.MeshBasicMaterial({ color: 0xfff1b0 }),
  );
  core.position.set(0, 0.85, 0.3);
  core.scale.set(0.32, 0.55, 0.12);
  lamp.add(core);
  const light = new THREE.PointLight(0xffb449, 12, 16, 1.8);
  light.position.set(0, 1, 1);
  lamp.add(light);
  g.add(lamp);
  return { flame, light };
}
export function createMerchant() {
  const actor = new THREE.Group();
  const body = new THREE.Group();
  box(body, 0, 4.4, 0, 3.6, 3, 2.1, 0x43352a);
  box(body, 0, 6.6, 0, 4.5, 4, 2.25, 0x873e2a);
  box(body, -1.8, 6.9, 0, 0.85, 3.6, 2.5, 0xa34c31);
  box(body, 1.8, 6.9, 0, 0.85, 3.6, 2.5, 0x9d462f);
  box(body, 0, 6.8, 1.18, 1.45, 3.8, 0.25, 0xdaca9e);
  box(body, -0.6, 8.5, 1.25, 1.2, 0.7, 0.4, 0xf1dfb5);
  box(body, 0.6, 8.5, 1.25, 1.2, 0.7, 0.4, 0xf1dfb5);
  box(body, 0, 4.8, 1.32, 4.2, 0.7, 0.4, 0x433126);
  box(body, 0, 4.8, 1.6, 0.85, 0.85, 0.18, 0xd2a24c);
  box(body, 0, 4.8, 1.72, 0.42, 0.4, 0.1, 0x564128);
  for (const side of [-1, 1])
    for (let y = 5.7; y < 8.8; y += 1)
      box(body, side * 1.4, y, 1.38, 0.4, 0.5, 0.2, 0xd5a34e);
  batch(body);
  actor.add(body);
  const head = new THREE.Group();
  head.position.set(0, 9.2, 0);
  box(head, 0, 0.65, 0, 3.1, 3.1, 2.5, 0xa66c42);
  box(head, 0, 0.85, 0.3, 2.7, 2.5, 2.5, 0xca915a);
  box(head, -1.4, 0.3, 0, 0.45, 2, 2.7, 0x68432c);
  box(head, 1.4, 0.3, 0, 0.45, 2, 2.7, 0x68432c);
  box(head, 0, -0.7, 1.5, 2.3, 1.4, 0.9, 0x4d3425);
  box(head, 0, -1.2, 1.3, 1.6, 0.8, 1.2, 0x5a3c29);
  box(head, 0, 0.25, 1.65, 1.8, 0.4, 0.4, 0x543323);
  box(head, 0, -0.1, 1.75, 0.9, 0.32, 0.16, 0xc69261);
  box(head, 0, 0.7, 1.65, 0.55, 0.9, 0.65, 0xb47743);
  for (const side of [-1, 1]) {
    box(head, side * 0.82, 1.45, 1.57, 0.9, 0.27, 0.25, 0x453226);
    box(head, side * 1.64, 0.7, 0.1, 0.4, 0.9, 0.9, 0xb57f4d);
  }
  // Broad, stepped tricorn and its gold ribbon.
  box(head, 0, 2.05, 0, 5.8, 0.48, 3.6, 0x222c29);
  box(head, -2.9, 2.24, 0, 1.2, 0.5, 3, 0x26312b);
  box(head, 2.9, 2.24, 0, 1.2, 0.5, 3, 0x26312b);
  box(head, 0, 2.6, -0.3, 3.7, 1.0, 2.7, 0x202b27);
  box(head, 0, 3.35, -0.5, 3.1, 0.6, 2.2, 0x26312c);
  box(head, 0, 2.65, 1.12, 3.75, 0.35, 0.24, 0xc2943e);
  box(head, -2.3, 2.45, 1.6, 1.8, 0.28, 0.3, 0xbc8e3b);
  box(head, 2.3, 2.45, 1.6, 1.8, 0.28, 0.3, 0xbc8e3b);
  box(head, -0.9, -0.4, 1.42, 0.45, 1.1, 0.35, 0x563827);
  box(head, 0.9, -0.4, 1.42, 0.45, 1.1, 0.35, 0x563827);
  batch(head);
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.82, 1.05, 1.57);
    box(eye, 0, 0, 0, 0.55, 0.65, 0.15, 0xf0dfb5);
    box(eye, side * -0.06, -0.02, 0.12, 0.22, 0.5, 0.1, 0x262923);
    head.add(eye);
    eyes.push(eye);
  }
  actor.add(head);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 2.35, 7.8, 0.1);
    box(arm, side * 0.1, -1.1, 0, 1.3, 2.8, 1.5, 0x97452d);
    const sleeve = box(arm, side * 0.2, -2.4, 1.0, 1.25, 1.6, 2.8, 0x9c4930);
    sleeve.rotation.x = 0.24;
    box(arm, side * 0.2, -2.9, 2.25, 1.2, 0.7, 0.8, 0xdfcda2);
    box(arm, side * 0.2, -3.12, 2.85, 1.05, 0.6, 1.15, 0xc18b53);
    batch(arm);
    actor.add(arm);
    arms.push(arm);
  }
  actor.userData = { head, eyes, arms };
  return actor;
}
export function createTradingPost() {
  const root = new THREE.Group(),
    stand = new THREE.Group(),
    wood = new THREE.Group();
  // Wooden pier, stall, roof beams, and stacks of trading cargo.
  for (let i = -12; i <= 12; i++)
    box(
      wood,
      i * 1.3,
      -0.15,
      1,
      1.25,
      0.45,
      22,
      i % 3 === 0 ? 0x80603d : i % 2 ? 0x997348 : 0x8e6942,
    );
  for (const x of [-7.5, 7.5]) {
    box(wood, x, 7.5, -2, 1.1, 16, 1.1, 0x68452b);
    box(wood, x, 8.7, 5.8, 0.95, 17.4, 0.95, 0x7c5332);
    for (const y of [4, 12]) box(wood, x, y, 5.8, 1.15, 0.35, 1.15, 0x483d2d);
  }
  for (let x = -9; x <= 9; x += 1.6)
    box(
      wood,
      x,
      15.4,
      1,
      1.5,
      0.6,
      15,
      Math.floor(x) % 2 ? 0x624229 : 0x765032,
    );
  for (const z of [-5, 0, 6]) box(wood, 0, 14.5, z, 19, 1.2, 0.85, 0x5c3d28);
  for (const x of [-6.7, 6.7]) {
    const brace = box(wood, x, 12.8, 5.8, 0.8, 4, 0.8, 0x8f6338);
    brace.rotation.z = x < 0 ? -0.6 : 0.6;
  }
  const counter = new THREE.Group();
  box(counter, 0, 2.25, 4.9, 13.6, 4.5, 3.8, 0x6c472d);
  for (let i = -6; i <= 6; i++)
    box(counter, i, 2.2, 6.86, 0.91, 4.15, 0.18, i % 2 ? 0x785234 : 0x825a36);
  box(counter, 0, 4.7, 4.4, 15, 0.7, 5.3, 0x593d29);
  for (let i = 0; i < 6; i++)
    box(
      counter,
      0,
      5.12,
      2.1 + i * 0.9,
      15,
      0.24,
      0.85,
      i % 2 ? 0x9a6e40 : 0xb08348,
    );
  for (const x of [-6.8, 6.8])
    box(counter, x, 2.7, 7.05, 0.75, 5.4, 0.5, 0x946538);
  // Map, ink bottle, quill, and gold laid on the counter.
  box(counter, -0.5, 5.32, 4.55, 4.0, 0.1, 2.3, 0xd7bd7d);
  box(counter, -0.4, 5.39, 4.45, 1.1, 0.05, 1.25, 0x83905b);
  box(counter, 0.8, 5.39, 4.75, 0.5, 0.05, 0.7, 0x88935e);
  box(counter, -1.5, 5.4, 4.05, 0.8, 0.05, 0.3, 0xb18a4d);
  for (let i = 0; i < 15; i++) {
    const x = -3.8 + (i % 5) * 0.35,
      z = 5.25 + Math.floor(i / 5) * 0.3;
    box(
      counter,
      x,
      5.34 + (i % 3) * 0.11,
      z,
      0.33,
      0.15,
      0.33,
      i % 2 ? 0xd8a337 : 0xf0c35a,
    );
  }
  box(counter, 4.7, 5.65, 3.7, 0.85, 0.85, 0.85, 0x293635);
  box(counter, 4.7, 6.16, 3.7, 0.55, 0.25, 0.55, 0x4c4936);
  const quill = box(counter, 4.8, 7.0, 3.7, 0.2, 2.1, 0.15, 0xdec38b);
  quill.rotation.z = -0.4;
  // Small end-grain cuts, worn plank seams, and iron pegs break up the broad timber faces.
  for (let i = 0; i < 80; i++) {
    const x = ((i * 47) % 130) / 10 - 6.5,
      y = 0.4 + ((i * 29) % 36) / 10;
    box(
      counter,
      x,
      y,
      6.985,
      0.15 + ((i * 13) % 8) / 10,
      0.025,
      0.03,
      i % 3 ? 0x65452c : 0xa27843,
    );
  }
  for (const x of [-6.8, 6.8])
    for (const y of [0.7, 4.3])
      box(counter, x, y, 7.34, 0.16, 0.16, 0.08, 0x3b372d);
  for (let i = 0; i < 9; i++)
    box(
      counter,
      -0.9 + (i % 3) * 0.33,
      5.38 + Math.floor(i / 3) * 0.13,
      5.7,
      0.32,
      0.12,
      0.32,
      i % 2 ? 0xd6a334 : 0xefc65c,
    );
  counter.position.y = 1.5;
  wood.add(counter);
  barrel(wood, -7.2, 0, 1, 1.3);
  barrel(wood, 6.6, 0, 7, 1.12);
  barrel(wood, 8.7, 0, 1, 1.3);
  crate(wood, 6.3, 3.6, 6, 2.25);
  crate(wood, -6, 0, -4, 2.8);
  crate(wood, -6, 2.8, -4, 2.3);
  crate(wood, 5.6, 0, -4, 3);
  for (let i = 0; i < 7; i++)
    box(
      wood,
      -8.6 + i * 0.85,
      7.1,
      -3,
      0.8,
      14,
      0.4,
      i % 2 ? 0x765437 : 0x66482e,
    );
  for (const y of [2, 6, 10])
    box(wood, -6.1, y, -2.72, 5.9, 0.25, 0.18, 0x473523);
  barrel(wood, -5.4, 0, -1, 1.05);
  barrel(wood, -5.4, 3.4, -1, 0.98);
  crate(wood, -3.7, 0, -3, 2);
  crate(wood, -3.7, 2, -3, 1.8);
  batch(wood);
  stand.add(wood);
  const merchant = createMerchant();
  merchant.position.set(0, 2.2, 0.3);
  merchant.scale.setScalar(0.75);
  stand.add(merchant);
  const lamps = [
    lantern(stand, -1.7, 6.75, 4.7, 0.85),
    lantern(stand, -7.5, 10.4, 5.8, 0.85),
  ];
  root.add(stand);
  const harbor = new THREE.Group();
  const city = createPortModel("fortress");
  city.scale.setScalar(0.48);
  city.position.set(6, -0.4, -58);
  harbor.add(city);
  const ships = [];
  for (const [x, z, scale] of [
    [9, -27, 0.58],
    [-5, -38, 0.38],
    [26, -43, 0.62],
  ]) {
    const ship = createTradingShip();
    ship.scale.setScalar(scale);
    ship.position.set(x, -0.35, z);
    ship.rotation.y = -0.32;
    harbor.add(ship);
    ships.push(ship);
  }
  const waterfront = new THREE.Group();
  for (let z = -3; z > -47; z -= 2) {
    box(
      waterfront,
      17,
      0.1,
      z,
      9,
      0.6,
      1.9,
      Math.floor(z) % 3 ? 0x9f804d : 0xb3935b,
    );
    if (z % 6 === -3)
      for (const x of [13, 21]) box(waterfront, x, 1, z, 0.5, 3, 0.5, 0x765c3e);
  }
  batch(waterfront);
  harbor.add(waterfront);
  root.add(harbor);
  const banner = new THREE.Group();
  const cloth = [];
  for (let i = 0; i < 14; i++) {
    const row = box(
      banner,
      0,
      -i * 0.52,
      0,
      5.6 - (i > 11 ? (i - 11) * 0.6 : 0),
      0.54,
      0.16,
      i % 3 ? 0x203e58 : 0x264965,
    );
    cloth.push(row);
  }
  const emblem = new THREE.Group();
  box(emblem, 0, -2.9, 0.13, 0.37, 3.4, 0.15, 0xba964d);
  box(emblem, 0, -1.5, 0.13, 1.55, 0.32, 0.15, 0xba964d);
  box(emblem, 0, -0.9, 0.13, 0.8, 0.8, 0.15, 0xba964d);
  for (const side of [-1, 1]) {
    box(emblem, side * 0.7, -4.35, 0.13, 1.35, 0.4, 0.15, 0xba964d);
    box(emblem, side * 1.35, -3.85, 0.13, 0.4, 1.2, 0.15, 0xba964d);
  }
  batch(emblem);
  banner.add(emblem);
  banner.position.set(13, 17, -10);
  root.add(banner);
  root.userData = {
    stand,
    merchant,
    lamps,
    ships,
    harbor,
    city,
    banner,
    cloth,
    emblem,
  };
  return root;
}
export function animateTradingPost(root, time, gesture = 0, reduced = false) {
  const { merchant, lamps, ships, banner, cloth, emblem } = root.userData;
  const motion = reduced ? 0 : 1;
  merchant.position.y = 2.2 + Math.sin(time * 1.4) * 0.055 * motion;
  merchant.userData.head.rotation.y = Math.sin(time * 0.38) * 0.08 * motion;
  merchant.userData.head.rotation.x =
    (Math.sin(time * 0.7) * 0.025 + Math.sin(gesture * Math.PI * 2) * 0.07) *
    motion;
  const blink = time % 5.7;
  const eyeScale =
    blink < 0.22 ? Math.max(0.08, Math.abs(blink - 0.11) / 0.11) : 1;
  merchant.userData.eyes.forEach(
    (eye) => (eye.scale.y = reduced ? 1 : eyeScale),
  );
  merchant.userData.arms.forEach((arm, i) => {
    arm.rotation.x = Math.sin(time * 0.8 + i) * 0.018 * motion;
    arm.rotation.z =
      (i === 1 ? Math.sin(gesture * Math.PI) * 0.11 : 0) * motion;
  });
  lamps.forEach(({ flame, light }, i) => {
    const pulse = Math.sin(time * 8 + i) * 0.07 + Math.sin(time * 13) * 0.04;
    flame.scale.y = 0.95 + pulse * motion;
    light.intensity = 12 + pulse * 17 * motion;
  });
  ships.forEach((ship, i) => {
    ship.position.y = -0.35 + Math.sin(time * 0.8 + i) * 0.11 * motion;
    ship.rotation.z = Math.sin(time * 0.6 + i) * 0.013 * motion;
  });
  banner.rotation.z = Math.sin(time * 0.7) * 0.025 * motion;
  cloth.forEach(
    (row, i) =>
      (row.position.z =
        Math.sin(time * 1.3 + i * 0.35) * 0.1 * (i / 14) * motion),
  );
  emblem.position.z = Math.sin(time * 1.3 + 1.6) * 0.06 * motion;
}
