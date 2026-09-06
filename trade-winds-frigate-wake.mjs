import * as THREE from './assets/vendor/three.module.js';
import { WakeTrail } from './trade-winds-wake.mjs';

// Immersed hull only: the bowsprit and stern flag do not emit foam.
export const FRIGATE_WAKE_HULL = { wake: { bow: 27, stern: 28, halfWidth: 9 } };
export class FrigateWake {
  constructor() {
    this.trail = new WakeTrail(480);
    this.dummy = new THREE.Object3D();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.setAttribute('foamLife', new THREE.InstancedBufferAttribute(new Float32Array(960), 2).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec2 foamLife;
        varying vec2 life;
        void main() {
          life = foamLife;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.);
        }`,
      fragmentShader: `
        varying vec2 life;
        void main() {
          gl_FragColor = vec4(mix(vec3(.18,.48,.47),vec3(.81,.94,.88),life.y),life.x);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.trail.particles.length);
    this.mesh.name = 'Frigate flowing water trail';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }
  // origin is only for the workshop's camera-following presentation. Gameplay
  // leaves it at zero, so old foam stays on the route as the ship turns.
  update(dt, position, surfaceHeight, opacity = 1, origin = { x: 0, z: 0 }) {
    if (dt > 0) this.trail.update(dt, position, FRIGATE_WAKE_HULL);
    const life = this.mesh.geometry.attributes.foamLife;
    let count = 0;
    for (const p of this.trail.particles) {
      if (p.age >= p.life) continue;
      const age = p.age / p.life, fade = Math.pow(1 - age, 1.4);
      const x = p.x - origin.x, z = p.z - origin.z;
      this.dummy.position.set(x, surfaceHeight(x, z) + .12, z);
      this.dummy.rotation.set(0, p.heading, 0);
      const fleck = .65 + .35 * Math.sin(p.seed * 2.399) ** 2;
      const pulse = .86 + .14 * Math.sin(p.age * 5 + p.seed);
      const size = p.size * (1.2 + age * 1.2) * fleck;
      this.dummy.scale.set(size, .10, size * 1.65 * pulse);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count, this.dummy.matrix);
      life.setXY(count, fade * .58 * fleck * opacity, .25 + fade * .75);
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = life.needsUpdate = true;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
