// Central Gulf of Mexico, using the game's shared 220-unit geographic scale.
export const WHIRLPOOL = Object.freeze({ x: -2200, z: -660, radius: 340, influence: 420, core: 25, depth: 76 });
export const WHIRLPOOL_ROCKS = Object.freeze([
  { x: -180, z: -108, radius: 17, height: 28 },
  { x: 104, z: -195, radius: 21, height: 33 },
  { x: 232, z: 65, radius: 16, height: 23 },
  { x: -225, z: 106, radius: 20, height: 30 },
  { x: 58, z: 139, radius: 15, height: 27 },
  { x: -78, z: 55, radius: 13, height: 24 },
  { x: 68, z: -62, radius: 12, height: 21 },
]);
const smooth = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t); };
// Distance from the eye -> inward world units per second. Smooth each interval
// so the current reaches the chosen speeds without jumping at a boundary.
const PULL_SPEEDS = [[25,105],[100,75],[150,50],[200,25],[250,15],[300,5],[420,0]];
function inwardSpeed(distance) {
  for(let i=1;i<PULL_SPEEDS.length;i++) {
    const [near,fast]=PULL_SPEEDS[i-1], [far,slow]=PULL_SPEEDS[i];
    if(distance<=far)return fast+(slow-fast)*smooth(near,far,distance);
  }
  return 0;
}
export function whirlpoolDistance(x,z) { return Math.hypot(x-WHIRLPOOL.x,z-WHIRLPOOL.z); }
export function whirlpoolHeight(x,z,time=0) {
  const dx=x-WHIRLPOOL.x,dz=z-WHIRLPOOL.z,r=Math.hypot(dx,dz);
  if(r>=WHIRLPOOL.radius)return 0;
  const bowl=1-smooth(20,WHIRLPOOL.radius,r);
  return -WHIRLPOOL.depth*bowl*bowl + Math.sin(Math.atan2(dz,dx)*4+r*.055-time*1.6)*bowl*(1-bowl)*3;
}
export function whirlpoolCurrent(x,z) {
  const dx=x-WHIRLPOOL.x,dz=z-WHIRLPOOL.z,r=Math.hypot(dx,dz);
  if(r>=WHIRLPOOL.influence || r<1e-8)return {x:0,z:0,strength:0};
  const strength=1-smooth(WHIRLPOOL.core,WHIRLPOOL.influence,r);
  const inward=inwardSpeed(r);
  const orbit=53*strength;
  return {x:(-dx*inward-dz*orbit)/r,z:(-dz*inward+dx*orbit)/r,strength};
}
function segmentDistance(a,b,x,z) {
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/length)):0;
  return Math.hypot(a.x+dx*t-x,a.z+dz*t-z);
}
export function hitsWhirlpoolCore(from,to,hullRadius=0) {
  return segmentDistance(from,to,WHIRLPOOL.x,WHIRLPOOL.z)<=WHIRLPOOL.core+hullRadius;
}
// Rock contact resolves against the same radii used to build the voxel bases.
export function resolveWhirlpoolRocks(from,to,hullRadius=0) {
  for(const rock of WHIRLPOOL_ROCKS) {
    const x=WHIRLPOOL.x+rock.x,z=WHIRLPOOL.z+rock.z,r=rock.radius+hullRadius;
    if(segmentDistance(from,to,x,z)>r)continue;
    const sameSide=(from.x-x)*(to.x-x)+(from.z-z)*(to.z-z)>=0;
    const dx=(sameSide?to.x:from.x)-x,dz=(sameSide?to.z:from.z)-z,n=Math.hypot(dx,dz)||1;
    return {x:x+dx/n*(r+.5),z:z+dz/n*(r+.5),hit:true};
  }
  return {...to,hit:false};
}
export class WhirlpoolHazard {
  constructor(){this.reset();}
  reset(){this.cooldown=0;this.inside=false;}
  update(dt,ship,hull,previous=ship) {
    if(!(dt>0))return [];
    const from={x:previous.x,z:previous.z},events=[];
    const flow=whirlpoolCurrent(ship.x,ship.z);
    this.cooldown=Math.max(0,this.cooldown-dt);
    const inside=whirlpoolDistance(ship.x,ship.z)<WHIRLPOOL.influence;
    if(inside&&!this.inside)events.push({type:'warning'});
    this.inside=inside;
    const to={x:ship.x+flow.x*dt,z:ship.z+flow.z*dt};
    if(hitsWhirlpoolCore(from,to,hull.halfWidth)) {
      ship.health=0;events.push({type:'death'});return events;
    }
    if(inside) {
      const result=resolveWhirlpoolRocks(from,to,hull.halfWidth);
      ship.x=result.x;ship.z=result.z;
      if(result.hit&&this.cooldown===0) {
        ship.health=Math.max(0,ship.health-8);
        this.cooldown=1.8;events.push({type:'rock',damage:8});
        if(ship.health===0)events.push({type:'death'});
      }
    }
    return events;
  }
}
export const WHIRLPOOL_GLSL = `
  const vec2 whirlpoolCenter=vec2(-2200.,-660.);
  float whirlpoolHeight(vec2 p,float t) {
    vec2 d=p-whirlpoolCenter;float r=length(d);
    float b=1.-smoothstep(20.,340.,r);
    return -76.*b*b+sin(atan(d.y,d.x)*4.+r*.055-t*1.6)*b*(1.-b)*3.;
  }
  vec3 whirlpoolColor(vec3 color,vec2 p,float t) {
    vec2 d=p-whirlpoolCenter;float r=length(d);
    if(r>420.)return color;
    float bowl=1.-smoothstep(25.,340.,r);
    float edge=1.-smoothstep(305.,385.,r);
    float angle=atan(d.y,d.x);
    float spiral=sin(angle*5.-r*.060-t*1.7);
    float bands=smoothstep(.40,.96,spiral);
    color=mix(color,vec3(.006,.025,.035),bowl*.89);
    color=mix(color,vec3(.032,.24,.25),bands*edge*.45);
    vec2 pixel=floor(p/2.);
    float fleck=fract(sin(dot(pixel,vec2(127.1,311.7)))*43758.5453);
    float foam=smoothstep(.90,.997,spiral)*step(.25,fleck)*edge;
    float lip=(1.-smoothstep(3.,13.,abs(r-31.)))*(.6+.4*sin(angle*9.-t*3.));
    return mix(color,vec3(.68,.89,.82),max(foam*.58,lip*.65*step(.25,fleck)));
  }
`;
