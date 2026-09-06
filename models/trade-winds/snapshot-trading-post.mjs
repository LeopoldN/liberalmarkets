// Capture the established set as editable Blender geometry before embellishing it.
import { writeFileSync } from "node:fs";
import * as THREE from "../../assets/vendor/three.module.js";
import { createTradingPost } from "../../trade-winds-market-models.mjs";
const root = createTradingPost();
root.userData.merchant.userData.head.rotation.y = 0.15;
root.updateMatrixWorld(true);
const { stand, merchant, harbor, ships, banner } = root.userData;
const records = [];
const matrix = new THREE.Matrix4(), color = new THREE.Color();
function capture(group, category) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const bounds = o.geometry.boundingBox;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const shape = new THREE.Matrix4().compose(center, new THREE.Quaternion(), size);
    for (let i = 0; i < (o.isInstancedMesh ? o.count : 1); i++) {
      matrix.identity();
      color.copy(o.material.color || new THREE.Color(0xffffff));
      if (o.isInstancedMesh) {
        o.getMatrixAt(i, matrix);
        if (o.instanceColor) { o.getColorAt(i, color); color.multiply(o.material.color); }
      }
      matrix.premultiply(o.matrixWorld).multiply(shape);
      records.push({ category, matrix: matrix.toArray(), color: color.toArray(), glow: o.material.emissiveIntensity > 1 });
    }
  });
}
capture(stand.children[0], "Original stall");
capture(merchant, "Merchant study");
stand.children.slice(2).forEach((o) => capture(o, "Lantern study"));
harbor.children.filter((o) => !ships.includes(o)).forEach((o) => capture(o, "Harbor study"));
capture(banner, "Banner study");
writeFileSync(new URL("trading-post-source.json", import.meta.url), JSON.stringify(records));
console.log(`Captured ${records.length} timber and character blocks`);
