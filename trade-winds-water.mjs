import * as THREE from './assets/vendor/three.module.js';
import { OCEAN_GLSL } from './trade-winds-ocean.mjs?v=whirlpool-1';
import { SHARK_SHADOW_GLSL } from './trade-winds-sharks.mjs?v=spawn-3';
const emptyShore = new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
emptyShore.needsUpdate = true;
export function createVoxelWater(sharkShadows = {value:Array.from({length:3},()=>new THREE.Vector4())}, stormFields = {value:[new THREE.Vector4(),new THREE.Vector4()]}) {
  // A shallow cube for each water tile gives the sea real stepped edges.
  const geometry = new THREE.BoxGeometry(12, 18, 12);
  geometry.translate(0, -8.55, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      sharkShadows,
      stormFields,
      time: { value: 0 },
      fancy: { value: 1 },
      shoreMap: { value: emptyShore },
      shoreOrigin: { value: new THREE.Vector2() },
      shoreSize: { value: 1280 },
    },
    vertexShader: `
      varying vec3 world;
      varying vec3 face;
      uniform float time;
      ${OCEAN_GLSL}
      void main() {
        vec4 center = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
        vec4 point = instanceMatrix * vec4(position, 1.);
        point.y += seaHeight(center.xz, time);
        world = (modelMatrix * point).xyz;
        face = normal;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
      }`,
    fragmentShader: `
      precision highp float;
      varying vec3 world;
      varying vec3 face;
      uniform float time;
      uniform float fancy;
      uniform vec4 stormFields[2];
      uniform sampler2D shoreMap;
      uniform vec2 shoreOrigin;
      uniform float shoreSize;
      ${OCEAN_GLSL}
      ${SHARK_SHADOW_GLSL}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
          mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y);
      }
      void main() {
        vec2 p = world.xz;
        if (length(floor(p/4.)*4.-whirlpoolCenter)<25.) discard;
        float ocean = atlantic(p);
        vec2 tile = floor((p + 6.) / 12.);
        vec2 pixel = floor(p / 2.) * 2.;
        // Broad color shoals, then a restrained palette of individual water facets.
        float depth = noise(tile * .085) * .7 + noise(tile * .21) * .3;
        depth = floor(depth * 7.) / 7.;
        vec3 c = mix(vec3(.012, .125, .19), vec3(.028, .265, .29), depth);
        c = mix(c, mix(vec3(.007, .035, .065), vec3(.025, .11, .155), depth), ocean * .88);
        float facet = sin(tile.x * .43 + tile.y * .29 - time * .7)
          + sin(tile.y * .71 - tile.x * .21 + time * .51);
        c *= .98 + facet * .036;
        vec2 uv = (pixel - shoreOrigin) / shoreSize;
        float shore = 0.;
        for (int k = 0; k < 4; k++) {
          float angle = float(k) * 1.570796;
          vec2 direction = vec2(cos(angle), sin(angle));
          shore += texture2D(shoreMap, uv + direction * 15. / shoreSize).r * .55
            + texture2D(shoreMap, uv + direction * 35. / shoreSize).r * .20;
        }
        shore = clamp(shore, 0., 1.);
        c = mix(c, vec3(.12, .43, .34), floor(shore * 6.) / 6. * .85);
        c *= 1. - sharkShadow(p, time) * .62;
        // Anchor the square wavelets in world space. Quantizing a time offset
        // made the entire highlight pattern jump sideways at regular intervals.
        vec2 ripple = floor(pixel / 4.);
        float crest = sin(ripple.x * .59 + ripple.y * .77 - time * .65
          + noise(ripple * .12) * 4.);
        float broken = step(.65, hash(floor(ripple / vec2(4., 2.))));
        float lip = smoothstep(.78, .99, crest) * broken;
        c = mix(c, vec3(.17, .42, .43), lip * mix(.18, .44, ocean));
        float cap = step(mix(.985, .81, ocean), hash(floor(ripple / 2.))) * smoothstep(.62, .98, crest);
        float flicker = smoothstep(.3, .9, sin(time * .55 + hash(ripple) * 6.28));
        c = mix(c, vec3(.57, .73, .65), cap * flicker * mix(.42, .85, ocean) * mix(.7, 1., fancy));
        float wash = smoothstep(.4, .92, sin(pixel.x * .16 + pixel.y * .23 - time * 1.4));
        float coastFoam = step(.65, shore) * wash * step(.45, hash(floor(pixel / 3.)));
        c = mix(c, vec3(.59, .77, .64), coastFoam * .36);
        c = whirlpoolColor(c, floor(p / 2.) * 2., time);
        for(int i=0;i<2;i++) {
          vec4 storm=stormFields[i];
          if(storm.w<=0.)continue;
          float cover=1.-smoothstep(.5,1.,length((p-storm.xy)/vec2(storm.z,storm.z*.78)));
          c*=1.-cover*storm.w*.48;
        }
        float side = .90 + max(0., face.y) * .10;
        c *= side;
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geometry, m, 1);
  mesh.frustumCulled = false;
  return mesh;
}
