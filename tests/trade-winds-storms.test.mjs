import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.js';
import { toWorld } from '../trade-winds-engine.mjs';
import { StormEncounters, STORM_SIZE, STORM_DAMAGE, STORM_MIN_SPEED, createStorm, animateStorm, disposeStorm, stormLightning } from '../trade-winds-storms.mjs';
const water={openWater:()=>true};
const sailor=(atlantic=true)=>({...toWorld(...(atlantic?[-67,26]:[-77,18])),heading:0});
function overhead(){
  const sim=new StormEncounters(()=>.5),ship=sailor();sim.wait=0;sim.update(1/30,ship,water);
  const s=sim.active[0];Object.assign(s,{x:ship.x,z:ship.z,age:10,vx:0,vz:0});sim.wait=10000;
  return {sim,ship,s};
}
test('storms are rare, three times more frequent in Atlantic water, avoid unsafe spawn points and stay bounded',()=>{
  const a=new StormEncounters(()=>.5),b=new StormEncounters(()=>.5);
  a.update(54,sailor(),water);assert.equal(a.active.length,0);
  a.update(2,sailor(),water);assert.equal(a.active.length,1);
  b.update(56,sailor(false),water);assert.equal(b.active.length,0);
  b.update(110,sailor(false),water);assert.equal(b.active.length,1);
  a.update(400,sailor(),water);assert.ok(a.active.length<=2);
  const blocked=new StormEncounters(()=>.5);blocked.update(400,sailor(),{openWater:()=>false});assert.equal(blocked.active.length,0);
});
test('rain slows only exposed ships and deals one light damage tick each six seconds without overlap stacking',()=>{
  const {sim,ship,s}=overhead();
  assert.equal(s.radius,105*4);
  let events=sim.update(5.9,ship,water);
  assert.equal(sim.speedMultiplier,STORM_MIN_SPEED);assert.equal(events.filter(e=>e.type==='damage').length,0);
  events=sim.update(.2,ship,water);assert.equal(events.find(e=>e.type==='damage').damage,STORM_DAMAGE);assert.equal(STORM_DAMAGE,1);
  sim.active.push({...s,id:99});
  events=sim.update(12,ship,water);assert.equal(events.filter(e=>e.type==='damage').length,2);
  ship.x+=s.radius*2;sim.update(.1,ship,water);assert.equal(sim.speedMultiplier,1);assert.equal(sim.soaked,0);
  ship.x-=s.radius*2;sim.update(.1,ship,{openWater:()=>false});assert.equal(sim.speedMultiplier,1,'ports shelter the player');
});
test('storm drift, effects and damage pause completely, then reset cleanly',()=>{
  const {sim,ship,s}=overhead();s.vx=5;
  const before=JSON.stringify(sim);sim.update(0,ship,water);assert.equal(JSON.stringify(sim),before);
  const x=s.x;sim.update(1,ship,water);assert.ok(Math.abs(s.x-x-5)<1e-6);
  ship.x+=2000;assert.ok(sim.update(.1,ship,water).some(e=>e.type==='despawn'));
  sim.reset();assert.deepEqual(sim.active,[]);assert.equal(sim.speedMultiplier,1);
});
test('rain falls and splashes above the water while lightning flashes locally at random intervals',()=>{
  const a=createStorm(43),b=createStorm(99),rain=a.getObjectByName('Falling voxel rain');
  assert.deepEqual(a.scale.toArray(),[4,1,4]);
  const surface=(x,z)=>Math.sin(x*.04+z*.03)*2;
  a.position.set(40,0,-50);
  animateStorm(a,1,{surfaceHeight:surface});const first=Array.from(rain.instanceMatrix.array);
  animateStorm(a,1.1,{surfaceHeight:surface});assert.notDeepEqual(Array.from(rain.instanceMatrix.array),first);
  const held=Array.from(rain.instanceMatrix.array);animateStorm(a,1.1,{surfaceHeight:surface});assert.deepEqual(Array.from(rain.instanceMatrix.array),held);
  const splashes=a.getObjectByName('Rain splashes on water'),m=new THREE.Matrix4(),p=new THREE.Vector3();
  for(let i=0;i<splashes.count;i++){splashes.getMatrixAt(i,m);p.setFromMatrixPosition(m);assert.ok(p.y>surface(p.x*STORM_SIZE+40,p.z*STORM_SIZE-50));}
  let flashTime=-1;for(let t=0;t<11;t+=.01)if(stormLightning(43,t).intensity>.95){flashTime=t;break;}
  assert.ok(flashTime>2);animateStorm(a,flashTime);assert.ok(a.getObjectByName('Internal yellow lightning').intensity>2500);
  animateStorm(a,flashTime+1);assert.equal(a.getObjectByName('Internal yellow lightning').intensity,0);
  animateStorm(a,flashTime,{reducedMotion:true});assert.equal(a.getObjectByName('Internal yellow lightning').intensity,0);
  const parent=new THREE.Group();parent.add(a);disposeStorm(a);assert.equal(parent.children.length,0);
  animateStorm(b,4);disposeStorm(b);
});
