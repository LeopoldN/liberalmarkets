import * as THREE from './assets/vendor/three.module.js';
import { atlanticWeight } from './trade-winds-ocean.mjs?v=whirlpool-1';
import { instanceBlocks } from './trade-winds-models.mjs';

export const SHARK_SPEED = 26.1;
export const SHARK_DAMAGE = 8;
export const SHARK_BITE_COOLDOWN = 3;
export const SHARK_ALERT_DISTANCE = 105;
const PATROL_SPEED = 11;
const CLEARANCE = 18;
const TURN_RATE = 1.65;
const MAX_SHARKS = 3;

// Water-space silhouette: highlights stay above a submerged body, side fins and
// beating forked tail. Used by both the real ocean and the workshop water.
export const SHARK_SHADOW_GLSL = `
  uniform vec4 sharkShadows[3];
  float sharkSegment(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));
  }
  float sharkTriangle(vec2 p, vec2 a, vec2 b, vec2 c) {
    vec2 ab=b-a,bc=c-b,ca=a-c;
    float direction=sign(ab.x*(c-a).y-ab.y*(c-a).x);
    float e0=direction*(ab.x*(p-a).y-ab.y*(p-a).x)/length(ab);
    float e1=direction*(bc.x*(p-b).y-bc.y*(p-b).x)/length(bc);
    float e2=direction*(ca.x*(p-c).y-ca.y*(p-c).x)/length(ca);
    return smoothstep(-.45,.5,min(e0,min(e1,e2)));
  }
  float sharkShadow(vec2 worldPoint, float swimTime) {
    float result=0.;
    for(int i=0;i<3;i++) {
      vec4 shark=sharkShadows[i];
      if(shark.w<=0.) continue;
      vec2 d=worldPoint-shark.xy;
      if(dot(d,d)>1400.) continue;
      float c=cos(shark.z),s=sin(shark.z);
      vec2 p=vec2(d.x*c-d.y*s,d.x*s+d.y*c);
      float tail=sin(swimTime*3.5+float(i)*1.7)*1.8;
      float body=1.-smoothstep(.86,1.12,length((p-vec2(0.,1.))/vec2(3.3,10.5)));
      float fins=sharkTriangle(p,vec2(2.,4.),vec2(10.,-4.),vec2(2.,-1.));
      fins=max(fins,sharkTriangle(p,vec2(-2.,4.),vec2(-10.,-4.),vec2(-2.,-1.)));
      float stem=1.-smoothstep(.65,1.25,sharkSegment(p,vec2(0.,-7.),vec2(tail,-13.5)));
      float fork=sharkTriangle(p,vec2(tail,-12.),vec2(tail+6.,-18.),vec2(tail,-15.));
      fork=max(fork,sharkTriangle(p,vec2(tail,-12.),vec2(tail-6.,-18.),vec2(tail,-15.)));
      result=max(result,max(max(body,fins),max(stem,fork))*shark.w);
    }
    return result;
  }
`;

// Swept contact against the oriented hull, including the boat's movement since
// the last update. Expanding the rectangle by the nose radius prevents tunneling.
export function sharkHitsHull(from, to, ship, hull, previousShip = ship) {
  const local = (p, vessel) => {
    const x = p.x - vessel.x, z = p.z - vessel.z;
    return [x * Math.cos(ship.heading) - z * Math.sin(ship.heading),
      -x * Math.sin(ship.heading) - z * Math.cos(ship.heading)];
  };
  const a = local(from, previousShip), b = local(to, ship);
  const min = [-hull.halfWidth - 2.5, -hull.stern - 2.5];
  const max = [hull.halfWidth + 2.5, hull.bow + 2.5];
  let enter = 0, exit = 1;
  for (let i = 0; i < 2; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-9) {
      if (a[i] < min[i] || a[i] > max[i]) return false;
    } else {
      const t0 = (min[i] - a[i]) / d, t1 = (max[i] - a[i]) / d;
      enter = Math.max(enter, Math.min(t0, t1));
      exit = Math.min(exit, Math.max(t0, t1));
      if (enter > exit) return false;
    }
  }
  return true;
}

export class SharkEncounters {
  constructor(random = Math.random) {
    this.random = random;
    this.reset();
  }
  reset() {
    this.active = [];
    this.wait = 12 + this.random() * 8;
    this.nextId = 0;
    this.previousShip = null;
  }
  update(dt, ship, { openWater, hull }) {
    const events = [];
    if (!(dt > 0)) return events;
    // Bounded steps keep navigation, turning and bites stable across frame rates.
    let remaining = dt;
    while (remaining > 1e-9) {
      const step = Math.min(remaining, 1 / 30);
      this.step(step, ship, openWater, hull, events);
      this.previousShip = { x: ship.x, z: ship.z };
      remaining -= step;
    }
    return events;
  }
  step(dt, ship, openWater, hull, events) {
    const ocean = atlanticWeight(ship.x, ship.z);
    // Same random clock, up to four times faster in Atlantic waters.
    this.wait -= dt * (1 + 3 * ocean);
    if (this.wait <= 0 && this.active.length < MAX_SHARKS) {
      this.wait = 4;
      const bearing = ship.heading + (this.random() - .5) * Math.PI * 1.7;
      const distance = 175 + this.random() * 110;
      const x = ship.x - Math.sin(bearing) * distance;
      const z = ship.z - Math.cos(bearing) * distance;
      if (openWater(ship.x, ship.z, CLEARANCE) && openWater(x, z, CLEARANCE + 8)) {
        const shark = {
          id: this.nextId++, x, z, heading: this.random() * Math.PI * 2,
          age: 0, mode: 'patrol', cooldown: 0, safeTravel: 0, blocked: 0,
          turn: (this.random() - .5) * .18, turnIn: 4, phase: this.random() * 6.28,
        };
        this.active.push(shark);
        this.wait = 12 + this.random() * 8;
        events.push({ type: 'spawn', shark });
      }
    }
    for (const shark of [...this.active]) {
      shark.age += dt;
      shark.cooldown = Math.max(0, shark.cooldown - dt);
      const distance = Math.hypot(ship.x - shark.x, ship.z - shark.z);
      if (distance > 460 || shark.age > 130 || shark.blocked > 8) {
        this.active.splice(this.active.indexOf(shark), 1);
        events.push({ type: 'despawn', id: shark.id });
        continue;
      }
      if (shark.mode === 'patrol' && distance < SHARK_ALERT_DISTANCE) {
        shark.mode = 'chase';
        events.push({ type: 'chase', id: shark.id });
      } else if (shark.mode === 'chase' && distance > 260) shark.mode = 'patrol';
      const recovering = shark.cooldown > 1.5;
      if (shark.mode === 'chase' && !recovering) {
        const aim = Math.atan2(ship.x - shark.x, ship.z - shark.z);
        const delta = Math.atan2(Math.sin(aim - shark.heading), Math.cos(aim - shark.heading));
        shark.heading += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, delta));
      } else {
        shark.turnIn -= dt;
        if (shark.turnIn <= 0) {
          shark.turn = (this.random() - .5) * .36;
          shark.turnIn = 3 + this.random() * 5;
        }
        shark.heading += (recovering ? .65 : shark.turn) * dt;
      }
      const travel = (shark.mode === 'chase' ? SHARK_SPEED : PATROL_SPEED) * dt;
      const from = { x: shark.x, z: shark.z };
      if (shark.safeTravel < travel) {
        const budget = SHARK_SPEED * .3;
        if (openWater(shark.x, shark.z, CLEARANCE + budget)) {
          shark.safeTravel = budget;
          shark.blocked = 0;
        } else {
          // Near a shore, check just this swept step. This permits turning back
          // into open water without requiring clearance in every direction.
          const midX = shark.x + Math.sin(shark.heading) * travel / 2;
          const midZ = shark.z + Math.cos(shark.heading) * travel / 2;
          if (openWater(midX, midZ, CLEARANCE + travel / 2)) {
            shark.safeTravel = travel;
            shark.blocked = 0;
          } else {
            shark.blocked += dt;
            shark.heading += 2.5 * dt;
            shark.safeTravel = 0;
            continue;
          }
        }
      }
      shark.x += Math.sin(shark.heading) * travel;
      shark.z += Math.cos(shark.heading) * travel;
      shark.safeTravel -= travel;
      const nose = p => ({ x: p.x + Math.sin(shark.heading) * 4, z: p.z + Math.cos(shark.heading) * 4 });
      if (shark.age > 2 && shark.cooldown === 0 &&
          sharkHitsHull(nose(from), nose(shark), ship, hull, this.previousShip || ship)) {
        shark.mode = 'chase';
        shark.cooldown = SHARK_BITE_COOLDOWN;
        events.push({ type: 'bite', id: shark.id, damage: SHARK_DAMAGE });
      }
    }
  }
}

// Only the dorsal fin breaks the surface. Reuse the game's voxel batches,
// including their shared geometry/material lifetime, for a two-draw-call model.
const foamMaterial = new THREE.MeshBasicMaterial({
  color: 0xc4e1df, transparent: true, depthWrite: false,
});
// The vertical scale carries each foam particle's opacity, without adding
// attributes to the shared cube geometry or allocating materials per shark.
foamMaterial.onBeforeCompile = shader => {
  shader.vertexShader = 'varying float sharkFoamAlpha;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nsharkFoamAlpha = clamp(length(instanceMatrix[1].xyz) / .12, 0., 1.);');
  shader.fragmentShader = 'varying float sharkFoamAlpha;\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
    'diffuseColor.a *= sharkFoamAlpha;\n#include <opaque_fragment>');
};
foamMaterial.customProgramCacheKey = () => 'shark-foam-opacity-v1';
const foamTransform = new THREE.Object3D();
export function createShark() {
  const root = new THREE.Group();
  root.name = 'Shark fin';
  const fin = new THREE.Group(), wake = new THREE.Group();
  const blocks = [];
  for (let row = 0; row < 8; row++) {
    const length = 8.5 - row * 1.05;
    const center = row * .28;
    blocks.push([0, row * .58 + .05, center, 1.8 - row * .18, .62, length,
      [0x33444b, 0x3b4f57, 0x40555d, 0x4b6068][row % 4]]);
  }
  instanceBlocks(blocks, fin);
  const foam = [];
  for (let i = 0; i < 10; i++) for (const side of [-1, 1]) {
    foam.push([side * (1.5 + i * .38), .02, 1 - i * 1.65,
      .4 + i * .055, .12, .9, 0xe1f0e9]);
  }
  instanceBlocks(foam, wake);
  const foamMesh = wake.children[0];
  foamMesh.castShadow = false;
  foamMesh.material = foamMaterial;
  foamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // The flowing wake can extend beyond the original static batch bounds.
  foamMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -10), 18);
  root.add(fin, wake);
  root.userData.shark = { fin, wake };
  animateShark(root, 0);
  return root;
}
export function animateShark(root, time, chasing = false, surfaceHeight = null) {
  const { fin, wake } = root.userData.shark;
  fin.rotation.z = Math.sin(time * (chasing ? 4 : 2.4)) * .035;
  const foam = wake.children[0];
  const lifetime = chasing ? 2.4 : 3.4;
  const headingCos = Math.cos(root.rotation.y), headingSin = Math.sin(root.rotation.y);
  for (let i = 0; i < 10; i++) for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1;
    const age = ((time / lifetime + i / 10 + s * .025) % 1 + 1) % 1;
    const fadeIn = Math.min(1, age / .08);
    const opacity = fadeIn * (1 - age) ** 1.5;
    const size = (.8 + age * .95) * Math.min(1, (1 - age) * 8);
    const x = side * (1.1 + age * 5 + Math.sin(time * 2.5 + i) * age * .18);
    const z = 2 - age * (chasing ? SHARK_SPEED : 17);
    // The ocean is made of 12-unit tiles. The caller samples the same tile
    // surface, not the smooth buoyancy used to move the fin itself.
    const y = surfaceHeight
      ? surfaceHeight(root.position.x + x*headingCos + z*headingSin, root.position.z - x*headingSin + z*headingCos) - root.position.y + .12
      : .09;
    foamTransform.position.set(x, y, z);
    foamTransform.rotation.y = side * (.12 + age * .22);
    foamTransform.scale.set(size, .12 * opacity, size * (1.5 + age * .5));
    foamTransform.updateMatrix();
    foam.setMatrixAt(i * 2 + s, foamTransform.matrix);
  }
  foam.instanceMatrix.needsUpdate = true;
}
