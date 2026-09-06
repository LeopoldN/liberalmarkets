import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../assets/vendor/three.module.js';
import { WHIRLPOOL as W, WHIRLPOOL_ROCKS, whirlpoolHeight, whirlpoolCurrent, whirlpoolDistance,
  hitsWhirlpoolCore, resolveWhirlpoolRocks, WhirlpoolHazard } from '../trade-winds-whirlpool-field.mjs';
import { createWhirlpool, animateWhirlpool, disposeWhirlpool } from '../trade-winds-whirlpool.mjs';
import { waveHeight, buoyancyHeight } from '../trade-winds-ocean.mjs';
import { toWorld, toGeo, pointInPolygon, VESSELS } from '../trade-winds-engine.mjs';

test('the large Gulf funnel and all its rocks sit in open water, with finite continuous height and current',()=>{
  assert.deepEqual(toGeo(W.x,W.z),{lon:-90,lat:25});
  const coast=JSON.parse(readFileSync(new URL('../assets/trade-winds/coast.json',import.meta.url)));
  for(let x=-W.influence;x<=W.influence;x+=20)for(let z=-W.influence;z<=W.influence;z+=20){
    const g=toGeo(W.x+x,W.z+z);
    assert.ok(!coast.some(r=>pointInPolygon(g.lon,g.lat,r)),'hazard footprint is offshore');
  }
  assert.equal(whirlpoolHeight(W.x,W.z),-W.depth);
  for(const r of [0,25,100,200,340,420,1000]){
    const h=whirlpoolHeight(W.x+r,W.z,2),flow=whirlpoolCurrent(W.x+r,W.z);
    assert.ok(Number.isFinite(h+flow.x+flow.z));
    if(r>=W.radius)assert.equal(h,0);
    if(r>=W.influence)assert.equal(flow.strength,0);
  }
  assert.ok(Math.abs(whirlpoolHeight(W.x+339.99,W.z))<1e-5);
  for(let r=30;r<340;r++)assert.ok(Math.abs(buoyancyHeight(W.x+r,W.z,2)-waveHeight(W.x+r,W.z,2))<.1);
});
test('inward pull reaches the requested speeds in every direction and strengthens continuously toward the eye',()=>{
  const targets=[[420,0],[300,5],[250,15],[200,25],[150,50],[100,75],[25,105]];
  for(const [radius,speed] of targets)for(const angle of [0,.7,Math.PI,4.2]){
    const x=Math.cos(angle),z=Math.sin(angle);
    const flow=whirlpoolCurrent(W.x+x*radius,W.z+z*radius);
    assert.ok(Math.abs(-(flow.x*x+flow.z*z)-speed)<1e-8,`${radius} units: ${speed} inward`);
  }
  let previous=0;
  for(let radius=420;radius>=25;radius-=.25){
    const pull=-whirlpoolCurrent(W.x+radius,W.z).x;
    assert.ok(pull>=previous-1e-10 && pull-previous<.25,'no reversal or sudden speed jump');
    previous=pull;
  }
});
test('current spirals inward, the outer current is escapable and the inner pull exceeds sailing speed',()=>{
  const outer=whirlpoolCurrent(W.x+300,W.z),inner=whirlpoolCurrent(W.x+95,W.z);
  assert.ok(outer.x<0 && outer.z>0);
  assert.ok(-outer.x<VESSELS.trader.speed);assert.ok(-inner.x>VESSELS.trader.speed);
  const ship={x:W.x+300,z:W.z,heading:-Math.PI/2,health:100};const sim=new WhirlpoolHazard();
  for(let i=0;i<240;i++) {ship.x+=VESSELS.trader.speed/30;sim.update(1/30,ship,VESSELS.trader);}
  assert.ok(whirlpoolDistance(ship.x,ship.z)>W.influence,'sailing away escapes');
});
test('unpowered ships are drawn inward and core contact kills even at full health or across a fast step',()=>{
  const ship={x:W.x+140,z:W.z-10,health:100},sim=new WhirlpoolHazard();
  let death=false;
  for(let i=0;i<1500&&!death;i++)death=sim.update(1/30,ship,VESSELS.trader).some(e=>e.type==='death');
  assert.ok(death);assert.equal(ship.health,0);
  assert.ok(hitsWhirlpoolCore({x:W.x-100,z:W.z},{x:W.x+100,z:W.z}));
  const fresh={x:W.x,z:W.z,health:100};
  assert.ok(new WhirlpoolHazard().update(1/30,fresh,VESSELS.raft).some(e=>e.type==='death'));
  assert.equal(fresh.health,0,'core death is not ordinary chip damage');
});
test('rock collision prevents crossings, allows sliding, limits damage, and respects pause/reset',()=>{
  const rock=WHIRLPOOL_ROCKS[0],x=W.x+rock.x,z=W.z+rock.z,r=rock.radius+7;
  const from={x:x-r-1,z};const crossing=resolveWhirlpoolRocks(from,{x:x+r+30,z},7);
  assert.ok(crossing.hit && crossing.x<x);
  const slide=resolveWhirlpoolRocks({x:x-r-.5,z},{x:x-r+1,z:z+2},7);
  assert.ok(slide.hit && slide.z>z);
  const sim=new WhirlpoolHazard(),ship={...from,health:100};
  const before=JSON.stringify([sim,ship]);sim.update(0,ship,VESSELS.trader);assert.equal(JSON.stringify([sim,ship]),before);
  let hits=0;for(let i=0;i<30;i++){
    const previous={x:x-r-1,z};ship.x=x-r+1;ship.z=z;
    hits+=sim.update(1/30,ship,VESSELS.trader,previous).filter(e=>e.type==='rock').length;
  }
  assert.equal(hits,1);assert.equal(ship.health,92);
  sim.reset();assert.equal(sim.cooldown,0);assert.equal(sim.inside,false);
});
test('whirlpool rocks and bounded foam share the actual water surface, animate, pause, and dispose',()=>{
  const model=createWhirlpool({water:true});
  const foam=model.getObjectByName('Spiral foam and breaking rock wash');
  const sea=model.getObjectByName('Animated voxel whirlpool water');
  assert.equal(foam.count,2300);assert.ok(sea.count<7000);
  animateWhirlpool(model,1);const first=Array.from(foam.instanceMatrix.array);
  animateWhirlpool(model,2);assert.notDeepEqual(Array.from(foam.instanceMatrix.array),first);
  const held=Array.from(foam.instanceMatrix.array);animateWhirlpool(model,2);assert.deepEqual(Array.from(foam.instanceMatrix.array),held);
  const matrix=new THREE.Matrix4(),p=new THREE.Vector3();
  for(let i=0;i<foam.count;i++){
    foam.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);
    const top=waveHeight(Math.round((W.x+p.x)/12)*12,Math.round((W.z+p.z)/12)*12,2)+.45;
    assert.ok(p.y>=top+.13,'foam and spray stay above voxel tile tops');
  }
  for(let k=0;k<WHIRLPOOL_ROCKS.length;k++){
    foam.getMatrixAt(1600+k*100,matrix);p.setFromMatrixPosition(matrix);
    assert.ok(Math.hypot(p.x-WHIRLPOOL_ROCKS[k].x,p.z-WHIRLPOOL_ROCKS[k].z)<WHIRLPOOL_ROCKS[k].radius+10);
  }
  const parent=new THREE.Group();parent.add(model);disposeWhirlpool(model);assert.equal(parent.children.length,0);
});
