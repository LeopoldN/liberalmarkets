import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.js';
import { FrigateWake } from '../trade-winds-frigate-wake.mjs';
import { waveHeight } from '../trade-winds-ocean.mjs';
import { toWorld } from '../trade-winds-engine.mjs';

test('frigate foam follows the route and clears the stepped Atlantic surface', () => {
  const wake=new FrigateWake(),other=new FrigateWake();
  const origin=toWorld(-67,26),position={...origin,heading:0};
  const surface=(x,z)=>waveHeight(Math.round(x/12)*12,Math.round(z/12)*12,4)+.45;
  wake.update(1/30,position,surface);
  for(let i=0;i<90;i++){position.z-=16/30;wake.update(1/30,position,surface);}
  assert.ok(wake.mesh.count>70 && wake.mesh.count<480);
  const matrix=new THREE.Matrix4(),p=new THREE.Vector3();
  for(let i=0;i<wake.mesh.count;i++){
    wake.mesh.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);
    assert.ok(Math.abs(p.y-surface(p.x,p.z)-.12)<1e-5);
  }
  const particle=wake.trail.particles.find(p=>p.age<p.life);
  const before={...particle};
  position.heading=Math.PI/2;position.x-=16/30;
  wake.update(1/30,position,surface);
  assert.ok(Math.abs(particle.x-before.x-before.vx/30)<1e-6);
  assert.ok(Math.abs(particle.z-before.z-before.vz/30)<1e-6,'old foam does not rotate with the bow');
  const snapshot=JSON.stringify(wake.trail);
  const matrices=Array.from(wake.mesh.instanceMatrix.array);
  wake.update(0,position,surface);
  assert.equal(JSON.stringify(wake.trail),snapshot);
  assert.deepEqual(Array.from(wake.mesh.instanceMatrix.array),matrices);
  const sequence=wake.trail.sequence;
  for(let i=0;i<180;i++)wake.update(1/30,position,surface);
  assert.equal(wake.trail.sequence,sequence,'stopped ships cease emitting');
  assert.equal(wake.mesh.count,0,'old foam fades completely');
  assert.equal(other.mesh.count,0,'each ship has an independent trail');
  const parent=new THREE.Group();parent.add(wake.mesh);wake.dispose();assert.equal(parent.children.length,0);
  other.dispose();
});

test('workshop foam streams aft in the camera-following view and fades with its frigate', () => {
  const wake=new FrigateWake();
  let position={x:0,z:0,heading:0};
  wake.update(1/30,position,()=>0,1,position);
  for(let i=0;i<120;i++){
    position={x:0,z:-(i+1)*16/30,heading:0};
    wake.update(1/30,position,()=>0,.5,position);
  }
  const matrix=new THREE.Matrix4(),p=new THREE.Vector3();let sternFoam=0;
  for(let i=0;i<wake.mesh.count;i++){
    wake.mesh.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);
    if(p.z>28)sternFoam++;
    assert.ok(wake.mesh.geometry.attributes.foamLife.getX(i)<=.36+1e-6);
  }
  assert.ok(sternFoam>50,'a visible trail extends behind the stern');
  wake.dispose();
});
