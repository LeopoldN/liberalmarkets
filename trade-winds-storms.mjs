import * as THREE from './assets/vendor/three.module.js';
import { atlanticWeight } from './trade-winds-ocean.mjs?v=whirlpool-1';
export const STORM_SIZE = 4;
export const STORM_DAMAGE = 1;
export const STORM_DAMAGE_INTERVAL = 6;
export const STORM_MIN_SPEED = .65;
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const random=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
export const stormOpacity=s=>smooth(0,4,s.age)*(1-smooth(s.life-8,s.life,s.age));
export function stormExposure(storm,ship){
  const d=Math.hypot((ship.x-storm.x)/storm.radius,(ship.z-storm.z)/(storm.radius*.78));
  return (1-smooth(.5,1,d))*stormOpacity(storm);
}
export class StormEncounters {
  constructor(rng=Math.random){this.random=rng;this.reset();}
  reset(){this.active=[];this.wait=120+this.random()*90;this.nextId=0;this.exposure=0;this.soaked=0;this.inside=false;}
  get speedMultiplier(){return 1-(1-STORM_MIN_SPEED)*this.exposure;}
  update(dt,ship,{openWater=()=>true}={}){
    const events=[];
    for(let left=dt;left>1e-9;){const step=Math.min(left,1/30);this.step(step,ship,openWater,events);left-=step;}
    return events;
  }
  step(dt,ship,openWater,events){
    const ocean=atlanticWeight(ship.x,ship.z);
    this.wait-=dt*(1+2*ocean);
    const limit=ocean>.5?2:1;
    if(this.wait<=0&&this.active.length<limit){
      this.wait=18;
      const a=ship.heading+(this.random()-.5)*Math.PI*1.8,d=220+this.random()*100;
      const x=ship.x-Math.sin(a)*d,z=ship.z-Math.cos(a)*d;
      if(openWater(ship.x,ship.z,18)&&openWater(x,z,55)&&this.active.every(s=>Math.hypot(s.x-x,s.z-z)>230)){
        const heading=Math.atan2(ship.z-z,ship.x-x)+(this.random()-.5)*.8;
        const drift=4+this.random()*3;
        const storm={id:this.nextId++,x,z,radius:(95+this.random()*20)*STORM_SIZE,age:0,life:80+this.random()*30,
          vx:Math.cos(heading)*drift,vz:Math.sin(heading)*drift,seed:Math.floor(this.random()*100000)};
        this.active.push(storm);events.push({type:'spawn',storm});this.wait=120+this.random()*90;
      }
    }
    for(const s of [...this.active]){
      s.age+=dt;s.x+=s.vx*dt;s.z+=s.vz*dt;
      if(s.age>=s.life||Math.hypot(s.x-ship.x,s.z-ship.z)>650+s.radius){
        this.active.splice(this.active.indexOf(s),1);events.push({type:'despawn',id:s.id});
      }
    }
    // Overlapping clouds do not multiply the penalty. Harbors remain sheltered.
    this.exposure=openWater(ship.x,ship.z,18)?Math.max(0,...this.active.map(s=>stormExposure(s,ship))):0;
    const wet=this.exposure>.15;
    if(wet&&!this.inside)events.push({type:'enter'});
    if(!wet&&this.inside)events.push({type:'leave'});
    this.inside=wet;
    if(this.exposure>.45){
      this.soaked+=dt;
      if(this.soaked>=STORM_DAMAGE_INTERVAL-1e-8){this.soaked-=STORM_DAMAGE_INTERVAL;events.push({type:'damage',damage:STORM_DAMAGE});}
    } else this.soaked=0;
  }
}
// Randomly located bursts with a brief secondary flicker; deterministic at any
// animation time so pause/resume and separate model instances stay consistent.
export function stormLightning(seed,time){
  const slot=Math.floor(time/11),start=slot*11+2+random(seed+slot*17)*5;
  const age=time-start;
  const pulse=(center,width)=>Math.max(0,1-Math.abs(age-center)/width);
  return {intensity:Math.max(pulse(.10,.10),pulse(.30,.065)*.72),
    x:(random(seed+slot*19)-.5)*100,y:111+random(seed+slot*23)*22,z:(random(seed+slot*29)-.5)*55};
}
const rigs=new WeakMap();
export function createStorm(seed=43){
  const model=new THREE.Group();model.name='Roaming voxel thunderstorm';
  model.scale.set(STORM_SIZE,1,STORM_SIZE);
  const dummy=new THREE.Object3D(),blocks=[];
  const lobes=[[-48,129,0,48,26,47],[7,138,-12,61,34,50],[52,127,14,46,24,43],[-12,118,24,64,18,40]];
  for(let x=-96;x<=96;x+=12)for(let z=-66;z<=66;z+=12)for(let y=102;y<=174;y+=12){
    if(!lobes.some(([cx,cy,cz,rx,ry,rz])=>((x-cx)/rx)**2+((y-cy)/ry)**2+((z-cz)/rz)**2<1))continue;
    const shade=.012+random(seed+x*3+y*7+z*13)*.06;
    blocks.push({x,y,z,shade});
  }
  const cloudMaterial=new THREE.MeshStandardMaterial({roughness:1,alphaHash:true});
  const flash={value:0},flashPoint={value:new THREE.Vector3()};
  cloudMaterial.onBeforeCompile=shader=>{
    shader.uniforms.stormFlash=flash;shader.uniforms.flashPoint=flashPoint;
    shader.vertexShader='varying vec3 cloudPoint;\nuniform float cloudTime;\n'+shader.vertexShader;
    shader.uniforms.cloudTime=timeUniform;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      cloudPoint=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
      transformed.y+=sin(cloudPoint.x*.04+cloudPoint.z*.05+cloudTime*.65)*1.8;`);
    shader.fragmentShader='varying vec3 cloudPoint;\nuniform float stormFlash;\nuniform vec3 flashPoint;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      float glow=1.-smoothstep(8.,57.,length(cloudPoint-flashPoint));
      totalEmissiveRadiance+=vec3(5.,3.5,.015)*stormFlash*glow;`);
  };
  const timeUniform={value:0};
  const clouds=new THREE.InstancedMesh(new THREE.BoxGeometry(12.4,12.4,12.4),cloudMaterial,blocks.length);
  clouds.name='Dark gray and black storm cloud';
  // Enlarge the cloud vertically too, anchored above the same rain ceiling.
  clouds.scale.y=STORM_SIZE;clouds.position.y=96*(1-STORM_SIZE);clouds.castShadow=true;clouds.receiveShadow=true;
  blocks.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);clouds.setColorAt(i,new THREE.Color(b.shade,b.shade*1.02,b.shade*1.08));});
  model.add(clouds);
  const rain=new THREE.InstancedMesh(new THREE.BoxGeometry(.65,4.5,.65),new THREE.MeshBasicMaterial({color:0xb5ced1,transparent:true,opacity:.48,depthWrite:false}),620*STORM_SIZE);
  rain.name='Falling voxel rain';rain.frustumCulled=false;rain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);model.add(rain);
  const splashes=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.18,1),new THREE.MeshBasicMaterial({color:0xc8e5de,transparent:true,opacity:.45,depthWrite:false}),120*STORM_SIZE);
  splashes.name='Rain splashes on water';splashes.frustumCulled=false;splashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);model.add(splashes);
  const light=new THREE.PointLight(0xffdd22,0,200,2);light.name='Internal yellow lightning';model.add(light);
  rigs.set(model,{seed,dummy,clouds,rain,splashes,flash,flashPoint,timeUniform,light});
  animateStorm(model,0);return model;
}
export function animateStorm(model,time,{opacity=1,cloudOpacity=1,surfaceHeight=()=>0,reducedMotion=false}={}){
  const rig=rigs.get(model);if(!rig)return;
  const {seed,dummy,clouds,rain,splashes,flash,flashPoint,timeUniform,light}=rig;
  const lightning=stormLightning(seed,time);
  flash.value=reducedMotion?0:lightning.intensity*opacity;
  flashPoint.value.set(lightning.x,lightning.y,lightning.z);
  light.position.copy(flashPoint.value);light.position.y=96+(light.position.y-96)*STORM_SIZE;light.intensity=flash.value*2800;
  timeUniform.value=time;clouds.material.opacity=opacity*cloudOpacity;
  rain.material.opacity=.48*opacity;splashes.material.opacity=.45*opacity;
  model.updateMatrixWorld(true);
  const world=new THREE.Vector3();
  const water=(x,z)=>{world.set(x,0,z).applyMatrix4(model.matrixWorld);return surfaceHeight(world.x,world.z)-model.position.y;};
  for(let i=0;i<rain.count;i++){
    const a=random(seed+i*3)*Math.PI*2,r=Math.sqrt(random(seed+i*7))*82;
    const progress=(random(seed+i*13)+time*(.68+random(seed+i*17)*.25))%1;
    const x=Math.cos(a)*r+progress*12,z=Math.sin(a)*r*.78+progress*4;
    const top=water(x,z)+.45;
    dummy.position.set(x,top+(103-top)*(1-progress),z);
    dummy.rotation.set(.04,0,-.12);dummy.scale.set(1, .7+random(i)*.6,1);dummy.updateMatrix();rain.setMatrixAt(i,dummy.matrix);
  }
  for(let i=0;i<splashes.count;i++){
    const a=random(seed+i*3)*Math.PI*2,r=Math.sqrt(random(seed+i*7))*82;
    const x=Math.cos(a)*r+12,z=Math.sin(a)*r*.78+4;
    const phase=(time*1.3+random(seed+i*13))%1;
    dummy.position.set(x,water(x,z)+.2+Math.sin(phase*Math.PI)*.5,z);
    dummy.rotation.set(0,i,0);dummy.scale.set(.5+phase*2,1-phase,(.5+phase*2)*(1-phase));dummy.updateMatrix();splashes.setMatrixAt(i,dummy.matrix);
  }
  rain.instanceMatrix.needsUpdate=splashes.instanceMatrix.needsUpdate=true;
}
export function disposeStorm(model){
  model.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();if(o.isInstancedMesh)o.dispose();}});
  rigs.delete(model);model.removeFromParent();
}
