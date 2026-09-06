import test from 'node:test';
import * as THREE from '../assets/vendor/three.module.js';
import { waveHeight } from '../trade-winds-ocean.mjs';
import assert from 'node:assert/strict';
import { toWorld, VESSELS } from '../trade-winds-engine.mjs';
import { disposeModel } from '../trade-winds-models.mjs';
import {
  SharkEncounters, SHARK_SPEED, SHARK_DAMAGE, SHARK_BITE_COOLDOWN,
  sharkHitsHull, createShark, animateShark,
} from '../trade-winds-sharks.mjs';
const water = { openWater: () => true, hull: VESSELS.trader };
const sailor = (atlantic = true) => ({ ...toWorld(...(atlantic ? [-67,26] : [-77,18])), heading:0 });
function encounter() {
  const sim = new SharkEncounters(() => .5), ship = sailor();
  sim.wait = 0;
  sim.update(1/60,ship,water);
  return {sim,ship,shark:sim.active[0]};
}
test('sharks spawn randomly in both seas, more frequently in the Atlantic, and stay out of land/ports', () => {
  const a = new SharkEncounters(() => .5), b = new SharkEncounters(() => .5);
  a.update(5,sailor(),water); b.update(5,sailor(false),water);
  assert.equal(a.active.length,1); assert.equal(b.active.length,0);
  b.update(12,sailor(false),water); assert.equal(b.active.length,1);
  a.update(8,sailor(),water); assert.equal(a.active.length,3,'Atlantic fills the nearby encounter slots much sooner');
  const blocked = new SharkEncounters(() => .5);
  blocked.update(120,sailor(),{...water,openWater:()=>false});
  assert.equal(blocked.active.length,0);
  a.update(120,sailor(),water); assert.ok(a.active.length<=3);
});
test('a distant fin patrols, proximity triggers a chase at exactly 26.1, and a faster boat escapes', () => {
  const {sim,ship,shark} = encounter();
  assert.equal(shark.mode,'patrol');
  shark.x=ship.x; shark.z=ship.z-90; shark.heading=0; shark.age=3;
  const start=shark.z;
  assert.ok(sim.update(1,ship,water).some(e=>e.type==='chase'));
  assert.ok(Math.abs(shark.z-start-SHARK_SPEED)<1e-6);
  assert.equal(SHARK_SPEED,26.1);
  for(let i=0;i<400;i++) {ship.z+=VESSELS.trader.speed/30; sim.update(1/30,ship,water);}
  assert.ok(ship.z-shark.z>67,'the trading sloop pulls away from a chasing shark');
});
test('swept bites respect rotated hulls and fast crossings, with an explicit cooldown', () => {
  assert.equal(sharkHitsHull({x:-50,z:0},{x:50,z:0},{x:0,z:0,heading:0},VESSELS.trader),true);
  assert.equal(sharkHitsHull({x:-50,z:50},{x:50,z:50},{x:0,z:0,heading:0},VESSELS.trader),false);
  assert.equal(sharkHitsHull({x:18,z:0},{x:18,z:0},{x:0,z:0,heading:-Math.PI/2},VESSELS.trader),true);
  assert.equal(sharkHitsHull({x:0,z:0},{x:0,z:0},{x:50,z:0,heading:0},VESSELS.raft,{x:-50,z:0}),true);
  const {sim,ship,shark} = encounter();
  shark.x=ship.x; shark.z=ship.z; shark.age=3; shark.heading=0;
  let events=sim.update(1/60,ship,water);
  assert.equal(events.filter(e=>e.type==='bite').length,1);
  assert.equal(events.find(e=>e.type==='bite').damage,SHARK_DAMAGE);
  assert.equal(SHARK_DAMAGE,8);
  assert.equal(shark.cooldown,SHARK_BITE_COOLDOWN);
  events=sim.update(2,ship,water); assert.ok(!events.some(e=>e.type==='bite'));
});
test('sharks pause completely, avoid blocked paths, disengage and reset cleanly', () => {
  const {sim,ship,shark} = encounter();
  const before=JSON.stringify(sim);
  sim.update(0,ship,water); assert.equal(JSON.stringify(sim),before);
  shark.x=ship.x;shark.z=ship.z-80;shark.heading=0;shark.safeTravel=0;
  const z=shark.z;
  sim.update(1,ship,{...water,openWater:()=>false}); assert.equal(shark.z,z);
  shark.mode='chase';ship.z+=270;sim.update(.1,ship,water);assert.equal(shark.mode,'patrol');
  ship.z+=500;assert.ok(sim.update(.1,ship,water).some(e=>e.type==='despawn'));
  sim.reset();assert.deepEqual(sim.active,[]);assert.equal(sim.previousShip,null);
});
test('fixed-speed pursuit is stable across frame rates', () => {
  const run=dt=>{
    const {sim,ship,shark}=encounter();shark.x=ship.x;shark.z=ship.z-100;shark.heading=0;shark.age=3;
    for(let t=0;t<1-1e-8;t+=dt)sim.update(dt,ship,water);
    return {x:shark.x,z:shark.z};
  };
  const a=run(1/30),b=run(1/120);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1e-6);
});
test('the fin and wake are lightweight, independently animated model instances', () => {
  const a=createShark(),b=createShark();
  let batches=0,blocks=0;
  a.traverse(o=>{if(o.isInstancedMesh){batches++;blocks+=o.count;}});
  assert.equal(batches,2);assert.ok(blocks<40);
  animateShark(a,1,true);assert.notEqual(a.userData.shark.fin.rotation.z,b.userData.shark.fin.rotation.z);
  assert.equal(b.userData.shark.wake.scale.z,1);
  disposeModel(a);animateShark(b,2);assert.ok(Number.isFinite(b.userData.shark.fin.rotation.z));disposeModel(b);
});

test('shark foam stays above the actual stepped ocean surface, including rotated Atlantic swells', () => {
  const model=createShark();
  const position=toWorld(-67,26);
  model.position.set(position.x, -2, position.z);
  model.rotation.y=1.2;
  const surface=(x,z)=>waveHeight(Math.round(x/12)*12,Math.round(z/12)*12,4)+.45;
  animateShark(model,1.1,true,surface);
  model.updateMatrixWorld(true);
  const foam=model.userData.shark.wake.children[0], matrix=new THREE.Matrix4(), point=new THREE.Vector3();
  for(let i=0;i<foam.count;i++) {
    foam.getMatrixAt(i,matrix);
    point.setFromMatrixPosition(matrix).applyMatrix4(foam.matrixWorld);
    assert.ok(Math.abs(point.y-surface(point.x,point.z)-.12)<1e-5,'foam clears the tile top');
  }
  const before=Array.from(foam.instanceMatrix.array);
  animateShark(model,1.4,true,surface);
  assert.notDeepEqual(Array.from(foam.instanceMatrix.array),before,'individual foam patches flow');
  const held=Array.from(foam.instanceMatrix.array);
  animateShark(model,1.4,true,surface);
  assert.deepEqual(Array.from(foam.instanceMatrix.array),held,'paused wake is stable');
  disposeModel(model);
});
