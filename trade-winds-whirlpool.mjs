import * as THREE from './assets/vendor/three.module.js';
import { WHIRLPOOL as W, WHIRLPOOL_ROCKS, whirlpoolHeight, whirlpoolCurrent } from './trade-winds-whirlpool-field.mjs?v=pull-2';
import { waveHeight } from './trade-winds-ocean.mjs?v=whirlpool-1';
import { createVoxelWater } from './trade-winds-water.mjs';

const rigs=new WeakMap(),TAU=Math.PI*2;
const random=i=>{const n=Math.sin(i*127.1+33.7)*43758.5453;return n-Math.floor(n);};
export function createWhirlpool({water=false}={}) {
  const group=new THREE.Group();group.name='Gulf of Mexico whirlpool';group.position.set(W.x,0,W.z);
  const blocks=[],dummy=new THREE.Object3D();
  WHIRLPOOL_ROCKS.forEach((rock,index)=>{
    const base=whirlpoolHeight(W.x+rock.x,W.z+rock.z)-10;
    for(let y=0;y<rock.height+10;y+=4)for(let x=-rock.radius;x<=rock.radius;x+=4)for(let z=-rock.radius;z<=rock.radius;z+=4){
      const taper=1-.7*y/(rock.height+10),r=rock.radius*taper;
      if(Math.hypot(x,z)>r*(.84+random(index*53+x*7+z)*.16))continue;
      blocks.push({x:rock.x+x,y:base+y+2,z:rock.z+z,c:new THREE.Color().setRGB(.12+y*.003,.16+y*.003,.16+y*.003)});
    }
  });
  const rocks=new THREE.InstancedMesh(new THREE.BoxGeometry(4,4,4),new THREE.MeshStandardMaterial({roughness:.92}),blocks.length);
  rocks.name='Jagged whirlpool rocks';rocks.castShadow=rocks.receiveShadow=true;
  blocks.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);rocks.setColorAt(i,b.c);});
  group.add(rocks);
  const core=new THREE.Mesh(new THREE.CylinderGeometry(27,10,50,12,1,true),new THREE.MeshBasicMaterial({color:0x06151b,side:THREE.DoubleSide}));
  core.position.y=-100;core.name='Fatal whirlpool eye';group.add(core);
  const bottom=new THREE.Mesh(new THREE.CircleGeometry(11,12),new THREE.MeshBasicMaterial({color:0x010509}));
  bottom.rotation.x=-Math.PI/2;bottom.position.y=-125;group.add(bottom);
  const count=1600+WHIRLPOOL_ROCKS.length*100;
  const foamGeometry=new THREE.BoxGeometry(1,1,1);
  foamGeometry.setAttribute('opacity',new THREE.InstancedBufferAttribute(new Float32Array(count),1));
  const foam=new THREE.InstancedMesh(foamGeometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    vertexShader:`attribute float opacity;varying float alpha;void main(){alpha=opacity;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:`varying float alpha;void main(){gl_FragColor=vec4(.72,.94,.88,alpha);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include'),
  }),count);
  foam.name='Spiral foam and breaking rock wash';foam.frustumCulled=false;foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(foam);
  let sea=null;
  if(water){
    const template=createVoxelWater();sea=new THREE.InstancedMesh(template.geometry,template.material,81*81);
    sea.frustumCulled=false;sea.name='Animated voxel whirlpool water';
    for(let x=0;x<81;x++)for(let z=0;z<81;z++){
      dummy.position.set((x-40)*12,(0),(z-40)*12);dummy.scale.set(1,1,1);dummy.updateMatrix();sea.setMatrixAt(x*81+z,dummy.matrix);
    }
    // World tile centers match the game's grid, including the foam sampler.
    sea.position.set(Math.round(W.x/12)*12-W.x,0,Math.round(W.z/12)*12-W.z);
    template.dispose();group.add(sea);
  }
  rigs.set(group,{foam,sea,dummy});animateWhirlpool(group,0);return group;
}
export function animateWhirlpool(group,time) {
  const rig=rigs.get(group);if(!rig)return;
  const {foam,sea,dummy}=rig;
  if(sea)sea.material.uniforms.time.value=time;
  const opacity=foam.geometry.attributes.opacity;
  function place(i,x,z,size,angle,alpha,lift=0){
    const y=waveHeight(Math.round((W.x+x)/12)*12,Math.round((W.z+z)/12)*12,time)+.45;
    dummy.position.set(x,y+.16+lift,z);dummy.rotation.set(0,-angle,0);dummy.scale.set(size,.16+lift*.13,size*1.8);dummy.updateMatrix();
    foam.setMatrixAt(i,dummy.matrix);opacity.setX(i,alpha);
  }
  for(let i=0;i<1600;i++) {
    const progress=(random(i)+time*.027)%1,r=30+310*Math.sqrt(1-progress);
    const a=i*2.399963+time*.38+Math.log(340/r)*2.6;
    const x=Math.cos(a)*r,z=Math.sin(a)*r;
    const clear=WHIRLPOOL_ROCKS.every(k=>Math.hypot(k.x-x,k.z-z)>k.radius+1);
    const fade=Math.min(1,progress*14,(1-progress)*20);
    place(i,x,z,1.1+random(i+8)*1.6,a,clear?fade*(.24+random(i+2)*.43):0);
  }
  WHIRLPOOL_ROCKS.forEach((rock,index)=>{
    const flow=whirlpoolCurrent(W.x+rock.x,W.z+rock.z),heading=Math.atan2(flow.z,flow.x);
    for(let j=0;j<100;j++) {
      const i=1600+index*100+j,phase=(random(i)+time*(.32+random(i+3)*.16))%1;
      const spray=j>=80,plume=j>=56&&!spray;
      const a=spray?heading+Math.PI+(random(i+6)-.5)*1.9:j*2.39996+time*1.6;
      const r=rock.radius+1+(spray?phase*14:random(i+2)*8);
      let x=rock.x+Math.cos(a)*r,z=rock.z+Math.sin(a)*r;
      if(plume){
        const downstream=rock.radius+phase*58,side=(random(i+7)-.5)*(10+phase*18);
        x=rock.x+Math.cos(heading)*downstream-Math.sin(heading)*side;
        z=rock.z+Math.sin(heading)*downstream+Math.cos(heading)*side;
      }
      place(i,x,z,spray?1.1:1.4+random(i)*1.7,a,plume?(1-phase)*.78:Math.sin(phase*Math.PI)*.88,spray?Math.sin(phase*Math.PI)*(4+random(i)*5):0);
    }
  });
  foam.instanceMatrix.needsUpdate=opacity.needsUpdate=true;
}
export function disposeWhirlpool(group){
  group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();if(o.isInstancedMesh)o.dispose();}});
  rigs.delete(group);group.removeFromParent();
}
