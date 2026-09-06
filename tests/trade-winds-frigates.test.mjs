import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../assets/vendor/three.module.js';
import { toWorld } from '../trade-winds-engine.mjs';
import { FrigateEncounters, FRIGATE_SPEED, FRIGATE_CLEARANCE, loadFrigateAsset,
  createFrigate, animateFrigate, disposeFrigate } from '../trade-winds-frigates.mjs';
const water = { openWater: () => true };
const sailor = (atlantic = true) => ({ ...toWorld(...(atlantic ? [-67,26] : [-77,18])), heading: 0, health: 100 });
function encounter() {
  const sim = new FrigateEncounters(() => .5), ship = sailor();
  sim.wait = 0; sim.update(1/60, ship, water);
  return { sim, ship, frigate: sim.active[0] };
}
test('frigates spawn in both oceans, four times sooner in the Atlantic, respecting safe water and spacing', () => {
  const a = new FrigateEncounters(() => .5), b = new FrigateEncounters(() => .5);
  a.update(5.1,sailor(),water); b.update(5.1,sailor(false),water);
  assert.equal(a.active.length,1); assert.equal(b.active.length,0);
  b.update(15,sailor(false),water); assert.equal(b.active.length,1);
  const blocked = new FrigateEncounters(() => .5);
  blocked.update(50,sailor(),{openWater:()=>false}); assert.equal(blocked.active.length,0);
  const blockedSpawn = new FrigateEncounters(() => .5), ship = sailor();
  blockedSpawn.update(50,ship,{openWater:(x,z)=>Math.hypot(x-ship.x,z-ship.z)<100});
  assert.equal(blockedSpawn.active.length,0);
  a.update(20,sailor(),water); assert.ok(a.active.length<=2);
  if(a.active.length===2) assert.ok(Math.hypot(a.active[0].x-a.active[1].x,a.active[0].z-a.active[1].z)>100);
});
test('passive ships cruise at 16 through player proximity without turning, stopping, or attacking', () => {
  const {sim,ship,frigate:f}=encounter();
  const z=f.z; sim.wait=100;
  sim.update(1,ship,water); assert.ok(Math.abs(f.z-z-FRIGATE_SPEED)<1e-6);
  f.x=ship.x;f.z=ship.z-70;f.heading=Math.PI;
  f.turn=0; f.turnIn=100;
  const before=f.z;
  const events=sim.update(8,ship,water);
  assert.ok(Math.abs(f.z-before-16*8)<1e-6,'holds course through close contact');
  assert.equal(f.heading,Math.PI);
  f.x=ship.x;f.z=ship.z;
  events.push(...sim.update(1,ship,water));
  assert.ok(events.every(e=>['spawn','despawn'].includes(e.type)));
  assert.equal(ship.health,100);
});
test('frigates pause, avoid land with their full footprint, despawn far away, and reset', () => {
  const {sim,ship,frigate:f}=encounter();
  const before=JSON.stringify(sim); sim.update(0,ship,water); assert.equal(JSON.stringify(sim),before);
  f.safeTravel=0;const start=[f.x,f.z];
  sim.update(1,ship,{openWater:()=>false}); assert.deepEqual([f.x,f.z],start);
  // The shoreline is z=0. A ship headed towards it must never cross it.
  f.x=ship.x; f.z=-FRIGATE_CLEARANCE-15;f.heading=Math.PI;f.safeTravel=0;
  ship.z=f.z-220;
  for(let i=0;i<900;i++) {
    sim.update(1/30,ship,{openWater:(x,z,r)=>z+r<0});
    if(sim.active.includes(f)) assert.ok(f.z+FRIGATE_CLEARANCE<0);
  }
  ship.z+=2000;
  assert.ok(sim.update(.1,ship,water).some(e=>e.type==='despawn'));
  sim.reset(); assert.deepEqual(sim.active,[]);
});
test('navigation is stable at different frame rates', () => {
  const run=dt=>{ const {sim,ship,frigate:f}=encounter();sim.wait=100;
    for(let t=0;t<2-1e-8;t+=dt)sim.update(dt,ship,water);
    return [f.x,f.z]; };
  const a=run(1/30),b=run(1/120);assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6);
});
test('export is batched and its British flag flutters independently on each correctly oriented ship', async t => {
  const bytes=readFileSync(new URL('../assets/trade-winds/models/british-frigate.glb',import.meta.url));
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  assert.ok(bytes.length<25*1024*1024);
  assert.ok(doc.meshes.reduce((n,m)=>n+m.primitives.length,0)<=9);
  assert.equal(doc.cameras,undefined);assert.equal(doc.images,undefined);
  const root=doc.nodes.find(n=>n.extras?.npc==='passive-frigate');
  assert.equal(root.extras.sails,'fully lowered');assert.equal(root.extras.stern_flag,'Union Jack');
  let requests=0;
  t.mock.method(globalThis,'fetch',async()=>{requests++;return new Response(bytes);});
  const previous=globalThis.ProgressEvent;
  globalThis.ProgressEvent=class extends Event {constructor(type,init){super(type);Object.assign(this,init);}};
  t.after(()=>{if(previous)globalThis.ProgressEvent=previous;else delete globalThis.ProgressEvent;});
  const [asset]=await Promise.all([loadFrigateAsset(),loadFrigateAsset()]);
  assert.equal(requests,1);assert.ok(asset.animations.every(a=>Math.abs(a.duration-8)<.001));
  const a=createFrigate(),b=createFrigate();
  let flagA,flagB;
  a.traverse(o=>{if(o.morphTargetInfluences && o.name.includes("British_Ensign"))flagA=o;});
  b.traverse(o=>{if(o.morphTargetInfluences && o.name.includes("British_Ensign"))flagB=o;});
  assert.ok(flagA);animateFrigate(a,0);animateFrigate(b,0);
  const rest=[...flagA.morphTargetInfluences];
  const sailsA=[],sailsB=[];
  a.traverse(o=>{if(o.userData.wind_animated)sailsA.push(o);});
  b.traverse(o=>{if(o.userData.wind_animated)sailsB.push(o);});
  assert.equal(sailsA.length,2,'square canvas and headsails both have wind animation');
  const sailRest=sailsA.map(o=>[...o.morphTargetInfluences]);
  animateFrigate(a,1);
  sailsA.forEach((o,i)=>{
    assert.notDeepEqual(o.morphTargetInfluences,sailRest[i]);
    assert.deepEqual(sailsB[i].morphTargetInfluences,sailRest[i]);
    assert.ok(o.geometry.morphAttributes.position.length>=2);
  });
  animateFrigate(a,0);

  const flagBox=new THREE.Box3().setFromObject(flagA);
  assert.ok(flagBox.min.z>20,'flag extends aft (+Z), with the bow facing -Z');
  const size=new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3());
  assert.ok(size.z>70 && size.y>60,'frigate is larger than the trading sloop');
  animateFrigate(a,2,.5);assert.notDeepEqual(flagA.morphTargetInfluences,rest);
  assert.deepEqual(flagB.morphTargetInfluences,rest);assert.equal(flagA.material.opacity,.5);assert.equal(flagB.material.opacity,1);
  animateFrigate(a,8);flagA.morphTargetInfluences.forEach((v,i)=>assert.ok(Math.abs(v-rest[i])<.001));
  a.position.set(10,2,-8);animateFrigate(a,2);assert.deepEqual(a.position.toArray(),[10,2,-8]);
  disposeFrigate(a);animateFrigate(b,2);assert.notDeepEqual(flagB.morphTargetInfluences,rest);disposeFrigate(b);
});

test('the patrol route is independent of the player location, including close crossings', () => {
  const a=encounter(),b=encounter();
  a.sim.wait=b.sim.wait=100;
  a.frigate.turn=b.frigate.turn=.04;
  a.ship.x=a.frigate.x; a.ship.z=a.frigate.z+50;
  b.ship.x=b.frigate.x+200; b.ship.z=b.frigate.z;
  for(let i=0;i<240;i++){a.sim.update(1/30,a.ship,water);b.sim.update(1/30,b.ship,water);}
  assert.equal(a.frigate.heading,b.frigate.heading);
  assert.equal(a.frigate.x,b.frigate.x);assert.equal(a.frigate.z,b.frigate.z);
});
