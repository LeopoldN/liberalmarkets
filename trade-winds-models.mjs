// Voxel model library. Builders return groups without attaching them to a scene.
// +Y is up; vessels face -Z; port docks extend toward +Z. Dimensions are world units.
import * as THREE from "./assets/vendor/three.module.js";
import {
  KRAKEN_ARMS,
  KRAKEN_ATTACK_ARMS,
  KRAKEN_TIMING,
  KRAKEN_IMPACT,
  KRAKEN_ATTACK_LENGTH,
} from "./trade-winds-mobs.mjs";
const dummy = new THREE.Object3D(),
  color = new THREE.Color();
const cube = new THREE.BoxGeometry(1, 1, 1),
  material = new THREE.MeshStandardMaterial({
    roughness: 1,
    flatShading: true,
  });
const mats = new Map();
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
export function instanceBlocks(data, parent) {
  if (!data.length) return;
  const mesh = new THREE.InstancedMesh(cube, material, data.length);
  data.forEach((b, i) => {
    dummy.position.set(b[0], b[1], b[2]);
    dummy.scale.set(b[3], b[4], b[5]);
    dummy.rotation.set(0, b[7] || 0, b[8] || 0, "YXZ");
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
    if (obj.isInstancedMesh) {
      const local = new THREE.Matrix4();
      for (let i = 0; i < obj.count; i++) {
        obj.getMatrixAt(i, local);
        const tint = new THREE.Color();
        obj.getColorAt(i, tint);
        items.push({
          matrix: inverse.clone().multiply(obj.matrixWorld).multiply(local),
          color: tint,
        });
      }
      obj.dispose();
    } else if (obj.isMesh) {
      items.push({
        matrix: inverse.clone().multiply(obj.matrixWorld),
        color: obj.material.color,
      });
    }
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
export function createTradingShip() {
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
  // Seat the bowsprit inside the foredeck, then rake it upward over the bow.
  block(g, 0, 6.6, -10, 2.8, 2.5, 4, 0x80603e);
  const bowsprit = block(
    g,
    0,
    7.7,
    -17,
    1.1,
    1.1,
    Math.hypot(18, 2.6),
    0x9e7c4e,
  );
  bowsprit.rotation.x = Math.atan2(2.6, 18);
  // Canvas fills toward the bow (-Z), ahead of its mast and yards.
  for (let j = 0; j < 9; j++) {
    const w = 17 - j * 0.65;
    block(
      g,
      0,
      19 + j * 1.9,
      -1.7 - Math.sin((j / 8) * Math.PI) * 1.5,
      w,
      2,
      0.6,
      j % 3 === 0 ? 0xe8dcb8 : 0xf4e9cd,
    );
  }
  block(g, 0, 35.3, -1, 18, 0.7, 1, 0x886744);
  block(g, 0, 18, -1, 20, 0.7, 1, 0x886744);
  for (let j = 0; j < 6; j++)
    block(
      g,
      0,
      17 + j * 1.8,
      9.2 - Math.sin((j / 5) * Math.PI),
      11 - j * 0.65,
      1.9,
      0.6,
      0xe5d7b0,
    );
  block(g, 0, 27.3, 9.3, 12.4, 0.65, 1, 0x886744);
  block(g, 0, 16.2, 9.3, 12.4, 0.65, 1, 0x886744);
  // The jib follows the stay from the anchored bowsprit to the main mast.
  for (let j = 0; j < 10; j++) {
    const y = 10.4 + j * 2;
    const leading = -26 + ((y - 9) / 22) * 25.4;
    const trailing = -0.6;
    block(
      g,
      0,
      y,
      (leading + trailing) / 2,
      0.6,
      2.1,
      trailing - leading,
      0xf3e5bf,
    );
  }
  g.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 9, -26),
        new THREE.Vector3(0, 31, -0.6),
        new THREE.Vector3(0, 10, -0.6),
      ]),
      new THREE.LineBasicMaterial({ color: 0x736247 }),
    ),
  );
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
  return g;
}
export function createGull(index) {
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

export function createRaft() {
  const g = new THREE.Group();
  // Individually lashed logs, with staggered ends and exposed end grain.
  for (let i = -3; i <= 3; i++) {
    const length = 17 + (i % 2 === 0 ? 1.5 : 0);
    block(g, i * 1.75, 1.05, 0, 1.7, 2.1, length, i % 2 ? 0x8b633c : 0xa47a47);
    block(g, i * 1.75, 2.13, 0, 1.15, 0.18, length - 0.2, 0xc79a5e);
    for (const end of [-1, 1]) {
      block(
        g,
        i * 1.75,
        1.07,
        end * (length / 2 + 0.02),
        1.35,
        1.55,
        0.15,
        0xcba269,
      );
      block(
        g,
        i * 1.75,
        1.1,
        end * (length / 2 + 0.13),
        0.55,
        0.65,
        0.1,
        0x92613a,
      );
    }
  }
  for (const z of [-5.4, 5.4]) {
    block(g, 0, 2.6, z, 13.5, 0.85, 1.25, 0x745232);
    for (let i = -3; i <= 3; i++) {
      block(g, i * 1.75, 3.08, z, 0.45, 0.22, 1.65, 0xddc28c);
      block(g, i * 1.75, 1.15, z + 0.78, 0.4, 3.8, 0.32, 0xc4a06b);
    }
  }
  block(g, 0, 3.5, -1, 3.6, 1.8, 3.6, 0x87613e);
  block(g, 0, 12, -1, 0.9, 20, 0.9, 0x866139);
  const spar = block(g, 0, 20, -1, 12.5, 0.65, 0.65, 0xb08750);
  spar.rotation.z = -0.06;
  for (const x of [-4, 4]) block(g, x, 19.7, -1.3, 0.25, 1.5, 0.8, 0xc8ac78);
  // A patched, modest square sail; it is a raft, with no ship's hull or cabin.
  for (let row = 0; row < 7; row++) {
    const width = 10.5 - row * 0.35;
    const sailZ = -1.6 - Math.sin((row / 6) * Math.PI) * 1.2;
    block(
      g,
      0.2,
      9.9 + row * 1.45,
      sailZ,
      width,
      1.5,
      0.7,
      row % 3 ? 0xe8ddbb : 0xd1c398,
    );
    if (row >= 2 && row <= 4)
      block(g, -2.3, 9.9 + row * 1.45, sailZ - 0.38, 2.2, 1.5, 0.12, 0xbda577);
    if (row === 5)
      block(g, 2.4, 9.9 + row * 1.45, sailZ - 0.38, 1.8, 1.2, 0.12, 0xf6ebcc);
  }
  block(g, 0, 9.2, -1.4, 9.5, 0.45, 0.6, 0x9a7447);
  block(g, 4, 3.4, 3, 2.4, 2.4, 3.0, 0xa17b47);
  block(g, 4, 4.65, 3, 2.6, 0.3, 3.2, 0xc3985f);
  block(g, -3.2, 4.3, 5.1, 1.6, 2.8, 1.5, 0x46787b);
  block(g, -3.2, 6.3, 5.1, 1.5, 1.5, 1.5, 0xcda173);
  block(g, -3.2, 7.2, 5.1, 2.4, 0.5, 2.2, 0xb99963);
  const oar = block(g, -4.7, 2.3, 8, 0.55, 0.55, 9, 0x725132);
  oar.rotation.x = 0.25;
  block(g, -4.7, 1.2, 12.5, 1.5, 0.4, 3, 0x957044);
  consolidate(g);
  g.name = "Starting raft";
  g.userData.vessel = "raft";
  return g;
}
export function createVessel(type = "raft") {
  if (type === "raft") return createRaft();
  if (type !== "trader") throw new Error(`Unknown vessel: ${type}`);
  const g = createTradingShip();
  g.name = "Trading sloop";
  g.userData.vessel = "trader";
  return g;
}

// Tree parts can be appended directly to a terrain chunk's instance batch.
export function appendTree(parts, x, y, z, kind = "palm", seed = 0, scale = 1) {
  const add = (a, b, c, w, h, d, color, angle = 0, slope = 0) =>
    parts.push([
      x + a * scale,
      y + b * scale,
      z + c * scale,
      w * scale,
      h * scale,
      d * scale,
      color,
      angle,
      slope,
    ]);
  const phase = seed * 2.399;
  if (kind === "palm") {
    const leanX = Math.cos(phase) * 4.5,
      leanZ = Math.sin(phase) * 4.5;
    for (let i = 0; i < 8; i++) {
      const t = i / 7,
        width = 2.5 - t * 1.05;
      add(
        leanX * t * t,
        1.3 + i * 2.4,
        leanZ * t * t,
        width,
        2.55,
        width,
        i % 2 ? 0x9c7c52 : 0x80613c,
      );
      if (i % 2 === 0)
        add(
          leanX * t * t,
          2.2 + i * 2.4,
          leanZ * t * t,
          width + 0.2,
          0.35,
          width + 0.2,
          0xb69b69,
        );
    }
    add(leanX, 19.4, leanZ, 3.1, 3, 3.1, 0x688347);
    for (let frond = 0; frond < 7; frond++) {
      const angle = phase + (frond * Math.PI * 2) / 7;
      const length = 11.5 + (frond % 3) * 1.4;
      for (let segment = 0; segment < 5; segment++) {
        const t0 = segment / 5,
          t1 = (segment + 1) / 5,
          t = (t0 + t1) / 2;
        const curve = (t) => Math.sin(t * Math.PI) * 3.1 - t * t * 5.3;
        const rise0 = curve(t0),
          rise1 = curve(t1);
        const run = length / 5,
          rise = rise1 - rise0;
        add(
          leanX + Math.cos(angle) * t * length,
          20 + (rise0 + rise1) / 2,
          leanZ + Math.sin(angle) * t * length,
          Math.hypot(run, rise) + 0.55,
          0.85,
          3.7 * (1 - t) + 0.45,
          [0x486e35, 0x64883d, 0x7b9b49][(frond + segment) % 3],
          -angle,
          Math.atan2(rise, run),
        );
      }
    }
    for (let i = 0; i < 3; i++)
      add(
        leanX + Math.cos(i * 2.1) * 1.5,
        18.8,
        leanZ + Math.sin(i * 2.1) * 1.5,
        1.6,
        1.8,
        1.6,
        0x8f7345,
      );
  } else {
    add(0, 5, 0, 3.0, 10, 3.0, 0x785535);
    add(0.8, 10.5, 0.3, 2.4, 4, 2.4, 0x8d6740);
    for (let root = 0; root < 3; root++) {
      const a = phase + root * 2.09;
      add(Math.cos(a) * 1.5, 1, Math.sin(a) * 1.5, 2.8, 2, 2.4, 0x80603c, -a);
    }
    const leaves = [0x365e36, 0x49743b, 0x5a833e, 0x759447];
    for (let crown = 0; crown < 5; crown++) {
      const a = phase + crown * 2.4,
        radius = crown === 0 ? 0 : 4.8;
      const cx = Math.cos(a) * radius,
        cz = Math.sin(a) * radius,
        cy = 12.5 + (crown % 3) * 2.2;
      if (crown) add(cx * 0.5, 9.8, cz * 0.5, 5, 2, 2, 0x805d39, -a);
      add(cx, cy, cz, 8.5, 5.5, 8.0, leaves[crown % 3]);
      add(cx - 0.7, cy + 3.4, cz + 0.5, 6.8, 2.6, 6.0, leaves[2 + (crown % 2)]);
      add(cx + 1.1, cy - 2.7, cz - 0.7, 6.2, 1.5, 6.5, leaves[0]);
    }
    add(0.7, 20, -0.5, 5.8, 2.2, 5.8, 0x829e51);
  }
}
export function createTree(kind = "palm", seed = 1) {
  const parts = [],
    g = new THREE.Group();
  appendTree(parts, 0, 0, 0, kind, seed);
  instanceBlocks(parts, g);
  g.name = kind === "palm" ? "Coconut palm" : "Tropical canopy";
  return g;
}

export const PORT_VARIANTS = {
  merchant: {
    name: "Merchant quay",
    description:
      "Pastel townhouses, shaded balconies, market awnings, and a busy stone waterfront.",
  },
  fortress: {
    name: "Fort harbor",
    description:
      "Coral-stone ramparts, a bell tower, arcaded customs house, and terracotta roofs.",
  },
  lagoon: {
    name: "Lagoon settlement",
    description:
      "Timber houses on stilts, woven palm roofs, fishing skiffs, and branching wooden walks.",
  },
};
const PORT_STYLES = {
  royal: "merchant",
  havana: "fortress",
  santiago: "fortress",
  nassau: "lagoon",
  keywest: "lagoon",
  staugustine: "fortress",
  veracruz: "fortress",
  campeche: "merchant",
  belize: "lagoon",
  portobelo: "lagoon",
  cartagena: "fortress",
  laguaira: "merchant",
  santodomingo: "merchant",
  sanjuan: "fortress",
  bridgetown: "merchant",
  stgeorges: "lagoon",
};
export function portVariant(id) {
  return PORT_STYLES[id] || "merchant";
}
function crate(g, x, y, z, size = 3) {
  block(g, x, y + size / 2, z, size, size, size, 0x9d7446);
  for (const dx of [-0.36, 0.36])
    block(
      g,
      x + dx * size,
      y + size / 2,
      z + size * 0.51,
      0.35,
      size,
      0.25,
      0xc29961,
    );
  block(g, x, y + size * 0.8, z + size * 0.52, size, 0.35, 0.25, 0xc29961);
  block(g, x, y + size * 0.18, z + size * 0.52, size, 0.35, 0.25, 0x765535);
}
function barrel(g, x, y, z) {
  block(g, x, y + 1.8, z, 2.8, 3.6, 2.8, 0x9c7141);
  block(g, x, y + 1.8, z, 3.2, 2.4, 3.2, 0xaa7e49);
  for (const h of [0.8, 2.8]) block(g, x, y + h, z, 3.4, 0.35, 3.4, 0x6a7368);
}
function palmAt(g, x, z, scale = 1, seed = 1, y = 9) {
  const tree = createTree("palm", seed);
  tree.scale.setScalar(scale);
  tree.position.set(x, y, z);
  g.add(tree);
}
function roof(g, x, y, z, w, d, color = 0xa8613e, thatch = false) {
  for (let i = 0; i < 6; i++) {
    const width = w + 3 - i * (w / 7),
      depth = d + 3 - (thatch ? i * 1.5 : 0);
    block(
      g,
      x,
      y + i * 1.1,
      z,
      width,
      1.25,
      depth,
      i % 2 === 0 ? color : thatch ? 0xc3a265 : 0xb46d45,
    );
  }
  if (!thatch)
    for (let i = -Math.floor(d / 3); i <= Math.floor(d / 3); i++)
      block(g, x, y + 6.7, z + i * 1.5, 2, 0.35, 0.22, 0xd49162);
}
function windowAt(g, x, y, z, trim = 0xf1dfb7, shutter = 0x416d69) {
  block(g, x, y, z, 2.6, 3.8, 0.5, 0x314d4d);
  block(g, x, y, z + 0.3, 0.25, 3.8, 0.35, trim);
  block(g, x, y, z + 0.3, 2.6, 0.25, 0.35, trim);
  for (const side of [-1, 1])
    block(g, x + side * 1.8, y, z + 0.4, 0.9, 4.2, 0.6, shutter);
  block(g, x, y - 2.2, z + 0.5, 4.7, 0.6, 1.2, trim);
}
function house(g, x, z, w, h, color, shutter = 0x416d69, balcony = true) {
  const floor = 9,
    d = 17;
  block(g, x, floor + h / 2, z, w, h, d, color);
  block(g, x, floor + 1, z, w + 0.5, 1.2, d + 0.5, 0xc7b894);
  block(g, x, floor + h - 1, z, w + 0.7, 0.6, d + 0.7, 0xf0dbb2);
  roof(g, x, floor + h, z, w, d);
  block(g, x, floor + 4, z + d / 2 + 0.2, 3.8, 8, 0.65, 0x6c5140);
  block(g, x, floor + 8.3, z + d / 2 + 0.4, 4.7, 0.8, 1.1, 0xe4d0a5);
  for (const side of [-1, 1]) {
    windowAt(
      g,
      x + side * w * 0.31,
      floor + 5,
      z + d / 2 + 0.3,
      0xf1dfb7,
      shutter,
    );
    if (h > 18)
      windowAt(
        g,
        x + side * w * 0.31,
        floor + 15,
        z + d / 2 + 0.3,
        0xf1dfb7,
        shutter,
      );
  }
  if (balcony && h > 18) {
    block(g, x, floor + 11, z + 11, w + 1, 0.8, 5, 0x8c6b49);
    for (let i = 0; i < 6; i++)
      block(
        g,
        x - w / 2 + (i * w) / 5,
        floor + 13,
        z + 13,
        0.45,
        3.5,
        0.45,
        0xead7ab,
      );
    block(g, x, floor + 14.8, z + 13, w + 1, 0.45, 0.6, 0xead7ab);
    for (const side of [-1, 1])
      block(
        g,
        x + side * w * 0.46,
        floor + 5.4,
        z + 12,
        0.7,
        10.7,
        0.7,
        0xe5d3ab,
      );
  }
}
function stall(g, x, z, color) {
  for (const dx of [-4.5, 4.5])
    for (const dz of [-2, 2])
      block(g, x + dx, 13, z + dz, 0.6, 8, 0.6, 0x896540);
  block(g, x, 11, z, 9, 3.8, 4, 0xaa8250);
  for (let stripe = 0; stripe < 6; stripe++)
    block(
      g,
      x - 4.6 + stripe * 1.85,
      17.2,
      z,
      1.8,
      0.55,
      6,
      stripe % 2 ? 0xe8d8b4 : color,
    );
  for (let i = 0; i < 4; i++)
    block(
      g,
      x - 3 + i * 2,
      13.3,
      z,
      1.5,
      0.8,
      1.5,
      [0xc28a3f, 0x628343, 0xb6673d, 0xe0b667][i],
    );
}
function pier(g, x = 0, start = 0, length = 48, width = 13) {
  block(g, x, 5, start + length / 2, width, 2.4, length, 0x826346);
  for (let z = start; z < start + length; z += 2.6)
    block(
      g,
      x,
      6.3,
      z,
      width,
      0.35,
      2.25,
      Math.floor(z) % 2 ? 0xa38458 : 0xb19366,
    );
  for (let z = start + 2; z < start + length; z += 11)
    for (const side of [-1, 1]) {
      block(g, x + side * (width / 2 + 0.25), 3, z, 1.6, 11, 1.6, 0x68513b);
      block(g, x + side * (width / 2 + 0.25), 8.8, z, 2, 0.8, 2, 0xc3a47a);
    }
}
function lantern(g, x, z) {
  block(g, x, 12, z, 0.65, 12, 0.65, 0x525744);
  block(g, x, 18.5, z, 2.2, 3, 2.2, 0xe5bc6c);
  block(g, x, 20.2, z, 3, 0.5, 3, 0x655b40);
}
function person(g, x, z, color = 0x698885, y = 9) {
  for (const side of [-1, 1])
    block(g, x + side * 0.55, y + 1.1, z, 0.8, 2.2, 1.1, 0x534b3c);
  block(g, x, y + 3.2, z, 2.2, 2.6, 1.5, color);
  block(g, x, y + 5.4, z, 1.7, 1.7, 1.7, 0xc59769);
  block(g, x, y + 6.45, z, 3, 0.45, 2.5, 0xb39a69);
}
function skiff(g, x, z) {
  block(g, x, 1.8, z, 5.8, 2.5, 16, 0x73513b);
  block(g, x, 3.1, z, 4.4, 0.7, 13.5, 0xbb9058);
  for (const end of [-1, 1]) block(g, x, 2, z + end * 8, 3.8, 2.5, 2, 0x87603f);
  for (const dz of [-4, 3]) block(g, x, 3.7, z + dz, 5, 0.6, 1.5, 0xa57a48);
}
function quay(g) {
  block(g, 0, 4, -26, 109, 8, 76, 0xab9d7b);
  block(g, 0, 8.5, -26, 110, 1, 77, 0xd5c299);
  for (let x = -51; x < 54; x += 6) block(g, x, 6, 13, 5.7, 4, 1, 0xbfb18d);
  for (let i = -3; i <= 3; i++)
    block(g, i * 3, 9.08, -13, 2.7, 0.18, 37, 0xe4d4af);
  pier(g);
  for (const x of [-7.3, 7.3]) lantern(g, x, 39);
}
function merchantPort(g) {
  quay(g);
  house(g, -37, -25, 19, 23, 0xd89c79, 0x476d72);
  house(g, -13, -29, 19, 29, 0xe4c782, 0x578277);
  house(g, 14, -26, 19, 21, 0xc1c9a0, 0x527f84);
  house(g, 39, -32, 19, 27, 0xd1bbaa, 0x65746b);
  // Small warehouse, open loading doors, and a projecting hoist.
  house(g, -36, -51, 23, 16, 0xc5b28d, 0x697d68, false);
  block(g, -48, 24, -14, 1.2, 22, 1.2, 0x766044);
  block(g, -43, 33, -14, 11, 1.2, 1.2, 0x766044);
  block(g, -38, 28, -14, 0.3, 10, 0.3, 0x9f9072);
  crate(g, -38, 20, -14, 3.5);
  stall(g, -20, 1, 0x497d83);
  stall(g, 27, 1, 0xb36b4c);
  for (let i = 0; i < 6; i++)
    crate(g, -42 + (i % 3) * 4, 9 + Math.floor(i / 3) * 3, -7, 3);
  barrel(g, 42, 9, -7);
  barrel(g, 46, 9, -5);
  palmAt(g, -54, -10, 0.9, 2);
  palmAt(g, 52, -48, 1.05, 5);
  person(g, -5, -5);
  person(g, 21, 7, 0xa26044);
  person(g, 4, 26, 0x637f89, 6.5);
  skiff(g, -22, 30);
}
function fortressPort(g) {
  quay(g);
  house(g, -32, -30, 24, 22, 0xe0c49a, 0x667b71);
  house(g, 24, -38, 23, 19, 0xe3bc80, 0x638188);
  // An arcaded customs hall with stepped stone arches.
  block(g, 0, 23, -22, 28, 9, 16, 0xdcccaa);
  roof(g, 0, 28, -22, 28, 16);
  for (const x of [-12, -4, 4, 12])
    block(g, x, 14.5, -13, 2.2, 11, 2.6, 0xe8d7b4);
  for (const x of [-8, 0, 8]) {
    block(g, x, 18.2, -13, 6, 1.5, 2.6, 0xe8d7b4);
    for (const side of [-1, 1])
      block(g, x + side * 2.2, 17, -13, 1.6, 2.2, 2.6, 0xe8d7b4);
  }
  // Bell tower rises independently above the port silhouette.
  block(g, -9, 32, -47, 12, 46, 12, 0xd4c5a2);
  for (const side of [-1, 1])
    block(g, -9 + side * 3.8, 53, -40.8, 1.8, 10, 1, 0xe7d8b8);
  block(g, -9, 54, -40.7, 5.8, 7, 0.7, 0x625941);
  block(g, -9, 53, -40, 3, 3.8, 1.2, 0xa68e51);
  roof(g, -9, 58, -47, 13, 13);
  block(g, -9, 66, -47, 0.8, 5, 0.8, 0xcabc96);
  // Low ramparts, crenellations, and a squat coastal bastion.
  block(g, 48, 4, -24, 22, 8, 41, 0xab9d7b);
  block(g, 48, 17, -24, 17, 18, 34, 0xb1ab8c);
  block(g, 48, 27, -24, 20, 2, 37, 0xcfc5a5);
  for (let z = -40; z <= -7; z += 5)
    for (const x of [39, 57]) block(g, x, 30, z, 3, 5, 3, 0xd7c9a7);
  for (const z of [-32, -17]) {
    block(g, 52, 29, z, 5, 2.5, 3, 0x4e5750);
    block(g, 55.5, 29.5, z, 4.5, 1.4, 1.4, 0x374b48);
  }
  block(g, 48, 42, -28, 0.85, 28, 0.85, 0x796744);
  block(g, 54, 52, -28, 11, 6, 0.45, 0xc57954);
  stall(g, -30, 1, 0xa87043);
  barrel(g, 18, 9, -5);
  crate(g, 25, 9, -3, 4);
  palmAt(g, -54, -10, 0.85, 4);
  palmAt(g, 26, -57, 0.85, 8);
  person(g, -9, 0, 0x66768a);
  person(g, 32, -3, 0xaa7552);
  skiff(g, -23, 32);
}
function lagoonPort(g) {
  // A smaller sand bank and an irregular network of elevated timber decks.
  block(g, 0, 4, -29, 106, 8, 48, 0xb9a87b);
  block(g, 0, 8.5, -29, 107, 1, 49, 0xd6c493);
  pier(g, 0, 0, 48, 11);
  pier(g, -25, -25, 43, 13);
  pier(g, 28, -33, 42, 13);
  block(g, 0, 6, -3, 76, 2.4, 12, 0x8c704d);
  for (let x = -37; x < 38; x += 2.6)
    block(g, x, 7.3, -3, 2.25, 0.3, 12, 0xad8b5d);
  const cabins = [
    [-35, -27, 18, 14, 0x8d9d8a],
    [-10, -42, 20, 18, 0xcaad81],
    [18, -38, 19, 15, 0xa57a58],
    [39, -24, 17, 17, 0x70918c],
  ];
  for (const [x, z, w, h, c] of cabins) {
    for (const dx of [-w / 2 + 1, w / 2 - 1])
      for (const dz of [-6, 6])
        block(g, x + dx, 6, z + dz, 1.3, 12, 1.3, 0x735b3c);
    block(g, x, 10 + h / 2, z, w, h, 15, c);
    for (let row = 0; row < h; row += 2.2)
      block(g, x, 10 + row, z + 7.65, w, 0.3, 0.25, 0x75684c);
    block(g, x, 14, z + 7.8, 3.2, 8, 0.5, 0x544a36);
    windowAt(g, x + w * 0.28, 16, z + 7.8, 0xd5c394, 0x557b70);
    roof(g, x, 10 + h, z, w, 15, 0xb99959, true);
    block(g, x, 10, z + 10, w + 3, 0.7, 6, 0xb39360);
    for (const side of [-1, 1])
      block(g, x + (side * w) / 2, 14, z + 12, 0.65, 8, 0.65, 0x8a7249);
  }
  for (let i = 0; i < 5; i++) block(g, -25 + i * 1.4, 9, 8, 1, 1, 5, 0x9f9b76);
  for (const [x, z, seed] of [
    [-50, -43, 1],
    [3, -29, 7],
    [51, -44, 4],
    [-43, -8, 10],
  ])
    palmAt(g, x, z, 0.86, seed);
  skiff(g, -17, 28);
  skiff(g, 21, 28);
  crate(g, 8, 7.5, 0, 3);
  barrel(g, -7, 7.5, -3);
  lantern(g, -6.5, 38);
  person(g, -25, 2, 0x956c49, 7.5);
  person(g, 30, -2, 0x688888, 8);
}
export function createPortModel(variant = "merchant") {
  if (!Object.hasOwn(PORT_VARIANTS, variant))
    throw new Error(`Unknown port variant: ${variant}`);
  const g = new THREE.Group();
  ({ merchant: merchantPort, fortress: fortressPort, lagoon: lagoonPort })[
    variant
  ](g);
  consolidate(g);
  g.name = PORT_VARIANTS[variant].name;
  g.userData.variant = variant;
  return g;
}
export function disposeModel(group) {
  group.traverse((object) => {
    if (object.isInstancedMesh) object.dispose();
    // Box geometry/materials are shared; only line rigging owns its geometry.
    if (object.isLine) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
}

// Eight dynamic instance batches preserve articulated arms without hundreds of
// per-voxel draw calls. No textures or external models are needed.
export function createKraken(seed = 17) {
  const g = new THREE.Group();
  g.name = "Atlantic Kraken";
  const body = new THREE.Group();
  g.add(body);
  const noise = (x, y, z) => {
    const n =
      Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    return n - Math.floor(n);
  };
  const skin = [0x1c4847, 0x21504d, 0x265951, 0x2b6058, 0x33685e];
  const inside = (x, y, z) => {
    const width = 36 - Math.max(0, z - 10) * 0.15;
    return (
      (x / width) ** 2 + ((y - 5) / 62) ** 2 + ((z + 10) / 49) ** 2 < 1 &&
      y >= -7
    );
  };
  for (let x = -36; x <= 36; x += 3)
    for (let y = -6; y <= 69; y += 3)
      for (let z = -60; z <= 42; z += 3) {
        if (!inside(x, y, z)) continue;
        if (
          [
            [3, 0, 0],
            [-3, 0, 0],
            [0, 3, 0],
            [0, -3, 0],
            [0, 0, 3],
            [0, 0, -3],
          ].every(([a, b, c]) => inside(x + a, y + b, z + c))
        )
          continue;
        const ridge = y > 15 && y % 12 === 0;
        block(
          body,
          x,
          y,
          z,
          3.1,
          3.1,
          ridge ? 4.6 : 3.1,
          skin[
            Math.min(
              4,
              (ridge ? 0 : 1) +
                (y > 30 ? 1 : 0) +
                (noise(
                  Math.floor(x / 9),
                  Math.floor(y / 9),
                  Math.floor(z / 9),
                ) > 0.8
                  ? 1
                  : 0),
            )
          ],
        );
      }
  // Raised dorsal seams, nuchal plates, and a tapered facial crest.
  for (let row = 0; row < 8; row++) {
    const y = 17 + row * 5,
      z = 35 - row * 2.9;
    block(body, 0, y, z, 23 - row * 1.8, 4, 5, row % 2 ? 0x2b625b : 0x20504e);
    for (const side of [-1, 1])
      block(body, side * (21 - row * 1.2), y, z - 6, 4, 5, 6, 0x143c3f);
  }
  for (const side of [-1, 1]) {
    block(body, side * 27, 20, 28, 15, 13, 8, 0x102f34);
    block(body, side * 28, 20, 32.5, 8, 7.5, 2.5, 0xd89c16);
    block(body, side * 28, 20.4, 34, 5, 5.8, 1, 0xffd847);
    block(body, side * 28, 20.6, 34.7, 1.7, 6.4, 0.6, 0x182f2c);
    block(body, side * 29.5, 22.3, 34.9, 1.2, 1.2, 0.6, 0xfff2af);
    block(body, side * 26, 26, 31, 17, 4, 7, 0x184442);
    for (let i = 0; i < 5; i++)
      block(body, side * (12 + i * 3), 8 + i * 2, 38 - i, 5, 5, 6, skin[i % 3]);
  }
  block(body, 0, 5, 40, 13, 12, 9, 0x123137);
  block(body, 0, 4, 45, 5, 7, 4, 0x8f7951);
  block(body, 0, 1, 46, 3, 5, 3, 0xc3a775);
  consolidate(body);
  body.scale.set(1.16, 0.98, 1.12);
  const arms = KRAKEN_ARMS.map((base, index) => {
    const blocks = [],
      sections = 25;
    for (let ring = 0; ring < sections; ring++) {
      const t = ring / (sections - 1),
        radius = (9 * Math.pow(1 - t, 0.55) + 2.6) * (index === 7 ? 0.72 : 1);
      // A bevelled octagonal cross-section with a pale ventral strip.
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          if (Math.abs(a) + Math.abs(b) === 2) {
            blocks.push({
              ring,
              x: a * radius * 0.51,
              y: b * radius * 0.51,
              w: radius * 0.46,
              h: radius * 0.46,
              d: 5.9,
              c: b === 1 ? 0xb4a17a : skin[(ring + index) % 3],
            });
            continue;
          }
          blocks.push({
            ring,
            x: a * radius * 0.62,
            y: b * radius * 0.62,
            w: radius * 0.78,
            h: radius * 0.78,
            d: 5.9,
            c:
              b === 1
                ? ring % 3
                  ? 0xb4a17a
                  : 0xc7b68a
                : skin[(ring + index + (a === -1 ? 1 : 0)) % 4],
          });
        }
      if (ring > 2 && ring < 23 && ring % 2 === 0) {
        for (const side of [-1, 1]) {
          const size = radius * 0.42;
          // Raised square cup rims and recessed, dark centers.
          for (const [u, v, w, h] of [
            [-1, 0, 0.32, 1.1],
            [1, 0, 0.32, 1.1],
            [0, -1, 0.8, 0.3],
            [0, 1, 0.8, 0.3],
          ])
            blocks.push({
              ring,
              x: side * radius * 0.45 + u * size * 0.46,
              y: radius * 1.06,
              offset: v * size * 0.46,
              w: size * w,
              h: size * 0.32,
              d: size * h,
              c: 0xd7c598,
            });
          blocks.push({
            ring,
            x: side * radius * 0.45,
            y: radius * 1.015,
            w: size * 0.7,
            h: size * 0.12,
            d: size * 0.7,
            c: 0x796d50,
          });
        }
      }
    }
    const mesh = new THREE.InstancedMesh(cube, material, blocks.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Animated limbs can swing beyond their initial bounds.
    mesh.frustumCulled = false;
    blocks.forEach((b, i) => mesh.setColorAt(i, color.set(b.c)));
    g.add(mesh);
    return {
      ...base,
      mesh,
      blocks,
      sections,
      phase: index * 1.73 + seed * 0.01,
      height:
        [70, 95, 108, 90, 102, 80, 88, 56][index] + noise(index, 1, 0) * 12,
      reach: 44 + noise(index, 2, 0) * 22,
    };
  });
  const spray = new THREE.InstancedMesh(cube, material, 512);
  spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spray.frustumCulled = false;
  for (let i = 0; i < spray.instanceMatrix.count; i++)
    spray.setColorAt(i, color.set(i % 3 ? 0xb5d8cc : 0x72aba7));
  g.add(spray);
  g.userData.kraken = { body, arms, spray, seed };
  animateKraken(g, 0);
  return g;
}

const krakenPoint = new THREE.Vector3(),
  krakenTangent = new THREE.Vector3(),
  krakenSide = new THREE.Vector3(),
  krakenNormal = new THREE.Vector3(),
  krakenMatrix = new THREE.Matrix4(),
  krakenLocal = new THREE.Matrix4();
const ease = (t) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export function animateKraken(g, time, attacks = [], waterLevel = null) {
  const { body, arms, spray } = g.userData.kraken;
  body.position.y = Math.sin(time * 0.72) * 1.3;
  body.rotation.z = Math.sin(time * 0.4) * 0.014;
  let sprayCount = 0;
  const foamBlock = (x, y, z, size) => {
    if (sprayCount >= spray.instanceMatrix.count) return;
    if (waterLevel) y += waterLevel(x, z);
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(size, size * 0.65, size);
    dummy.updateMatrix();
    spray.setMatrixAt(sprayCount++, dummy.matrix);
  };
  arms.forEach((arm, index) => {
    const attack = attacks.find((a) => a.arm === index);
    const sway = Math.sin(time * 0.67 + arm.phase),
      twist = Math.sin(time * 0.43 + arm.phase) * 0.13;
    const angle = arm.angle + twist,
      dx = Math.sin(angle),
      dz = Math.cos(angle);
    const start = new THREE.Vector3(arm.x, -9, arm.z);
    const p1 = new THREE.Vector3(
      arm.x + dx * 6,
      arm.height + sway * 7,
      arm.z + dz * 6,
    );
    const p2 = new THREE.Vector3(
      arm.x + dx * arm.reach,
      arm.height + 8 + sway * 5,
      arm.z + dz * arm.reach,
    );
    const end = new THREE.Vector3(
      arm.x + dx * (arm.reach - 6),
      28 + sway * 6,
      arm.z + dz * (arm.reach - 6),
    );
    if (attack) {
      const lift = ease(attack.age / KRAKEN_TIMING.windup);
      const slam = ease(
        (attack.age - KRAKEN_TIMING.windup) / KRAKEN_TIMING.strike,
      );
      const recover = ease(
        (attack.age - KRAKEN_IMPACT) / KRAKEN_TIMING.recovery,
      );
      const weight = lift * (1 - recover);
      const aim = new THREE.Vector3(
        attack.target.x,
        85 * (1 - slam) + 0.8,
        attack.target.z,
      );
      end.lerp(aim, weight);
      p1.lerp(new THREE.Vector3(arm.x, 116 * (1 - slam) + 15, arm.z), weight);
      p2.lerp(
        new THREE.Vector3(
          attack.target.x,
          119 * (1 - slam) + 5,
          attack.target.z,
        ),
        weight,
      );
      const splashAge = attack.age - KRAKEN_IMPACT;
      if (splashAge >= 0 && splashAge < 1.2) {
        for (let j = 0; j < 28; j++) {
          const a = j * 2.399,
            radius = 5 + splashAge * (15 + (j % 5));
          foamBlock(
            attack.target.x + Math.sin(a) * radius,
            1 + Math.sin((splashAge / 1.2) * Math.PI) * (5 + (j % 7)),
            attack.target.z + Math.cos(a) * radius,
            (1 - splashAge / 1.2) * 2.8 + 0.3,
          );
        }
      }
    }
    const curve = new THREE.CubicBezierCurve3(start, p1, p2, end);
    const frames = [],
      lengths = [];
    for (let ring = 0; ring < arm.sections; ring++) {
      const t = ring / (arm.sections - 1);
      curve.getPoint(t, krakenPoint);
      curve.getTangent(t, krakenTangent).normalize();
      krakenSide.set(Math.cos(angle), 0, -Math.sin(angle));
      // Re-orthogonalize when a striking arm turns toward its locked target.
      krakenSide
        .addScaledVector(krakenTangent, -krakenSide.dot(krakenTangent))
        .normalize();
      krakenNormal.crossVectors(krakenTangent, krakenSide).normalize().negate();
      // Reverse longitudinal Z to preserve a right-handed basis and face winding.
      frames.push(
        new THREE.Matrix4()
          .makeBasis(krakenSide, krakenNormal, krakenTangent.negate())
          .setPosition(krakenPoint),
      );
      lengths.push(
        curve
          .getPoint(Math.min(1, t + 0.5 / (arm.sections - 1)))
          .distanceTo(
            curve.getPoint(Math.max(0, t - 0.5 / (arm.sections - 1))),
          ) * (ring === 0 || ring === arm.sections - 1 ? 2 : 1),
      );
    }
    arm.blocks.forEach((b, i) => {
      krakenLocal.makeScale(
        b.w,
        b.h,
        b.d === 5.9 ? lengths[b.ring] * 1.12 : b.d,
      );
      krakenLocal.setPosition(b.x, b.y, b.offset || 0);
      krakenMatrix.multiplyMatrices(frames[b.ring], krakenLocal);
      arm.mesh.setMatrixAt(i, krakenMatrix);
    });
    arm.mesh.instanceMatrix.needsUpdate = true;
    for (let j = 0; j < 24; j++) {
      const a = j * 2.399 + arm.phase,
        pulse = (time * 0.5 + j * 0.13) % 1;
      const r = 11 + pulse * 10;
      foamBlock(
        arm.x + Math.sin(a) * r,
        0.5 + Math.sin(pulse * Math.PI) * (j % 3),
        arm.z + Math.cos(a) * r,
        (1 - pulse) * 3.1 + 0.5,
      );
    }
  });
  for (let j = 0; j < 44; j++) {
    const a = j * 2.399,
      pulse = (time * 0.38 + j * 0.13) % 1;
    foamBlock(
      Math.sin(a) * (43 + pulse * 8),
      0.6 + Math.sin(pulse * Math.PI) * 1.2,
      -8 + Math.cos(a) * (52 + pulse * 8),
      (1 - pulse) * 2.7 + 0.5,
    );
  }
  spray.count = sprayCount;
  spray.instanceMatrix.needsUpdate = true;
}

// Workshop choreography exercises the same rig and strike timing as gameplay.
export function krakenPreviewAttacks(time) {
  const attacks = [];
  for (const [index, arm] of KRAKEN_ATTACK_ARMS.entries()) {
    const age = (((time - index * 2.4) % 11) + 11) % 11;
    if (age < KRAKEN_ATTACK_LENGTH)
      attacks.push({ arm, age, target: { x: 16, z: 105 } });
  }
  return attacks;
}
