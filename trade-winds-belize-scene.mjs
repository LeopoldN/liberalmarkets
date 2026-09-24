import * as THREE from './assets/vendor/three.module.js';
import { loadBelizeTown, createBelizeTown, BELIZE_POSTER } from './trade-winds-belize.mjs';
import { HarborPost } from './trade-winds-harbor-post.mjs';

const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
`;

function skyMaterial() {
  return new THREE.ShaderMaterial({
    depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vSky;void main(){vSky=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vSky;${noise}
      void main(){
        float h=vSky.y;
        vec3 c=mix(vec3(2.1,.96,.24),vec3(1.6,.53,.19),smoothstep(0.,.23,h));
        c=mix(c,vec3(.25,.27,.52),smoothstep(.23,.4,h));
        c=mix(c,vec3(.12,.23,.44),smoothstep(.4,.58,h));
        c=mix(c,vec3(.06,.13,.3),smoothstep(.58,1.,h));
        c=mix(c,vec3(2.65,1.05,.08),clamp((vSky.x-.48)*1.45,0.,1.));
        vec2 q=floor(vSky*vec2(960.,440.))/vec2(960.,440.);
        float n=noise(q*vec2(90.,130.))*.65+noise(q*vec2(220.,260.))*.25+noise(q*vec2(400.,440.))*.1;
        float cloud=smoothstep(.52,.68,n)*smoothstep(.15,.3,h);
        c=mix(c,vec3(3.2,1.1,.14),cloud*.85);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function woodGrain(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 vGrain;\n' + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvGrain=uv;');
    shader.fragmentShader = `varying vec2 vGrain;${noise}\n` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float grain=noise(vec2(vGrain.x*48.,vGrain.y*.9));
      float fine=noise(vec2(vGrain.x*135.,vGrain.y*2.));
      float weather=noise(floor(vGrain*vec2(16.,9.))*.7);
      diffuseColor.rgb*=.64+.26*grain+.13*fine+.15*weather;`);
  };
  material.customProgramCacheKey = () => 'belize-oak-1';
}

function waterMesh() {
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 p;void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: `varying vec2 p;uniform float time;${noise}
      void main(){
        vec2 q=floor(p*vec2(6.,12.))/vec2(6.,12.);
        float wave=sin(q.x*3.1+q.y*8.+sin(q.x*.7+time)*1.5-time*1.3);
        float n=noise(q*vec2(2.,5.)+vec2(time*.08,0.));
        vec3 c=mix(vec3(.025,.095,.12),vec3(.14,.26,.29),smoothstep(.1,.95,wave)*.6);
        float path=exp(-pow((p.x-(8.-p.y*.36))/max(2.,4.-p.y*.10),2.));
        float glint=pow(max(0.,wave),18.)*smoothstep(.32,.6,n);
        c+=mix(vec3(.32,.45,.52),vec3(5.,2.4,.7),path)*glint;
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), material);
  mesh.rotation.x = -Math.PI/2; mesh.position.set(0, -.5, -50);
  return mesh;
}

export class BelizeTownScene {
  constructor(container) {
    this.container = container;
    this.layer = document.createElement('div');
    Object.assign(this.layer.style, { position: 'absolute', inset: '0', background: `#3a281c url("${BELIZE_POSTER.href}") center / cover no-repeat` });
    this.layer.setAttribute('aria-label', 'Belize harbor at sunset');
    container.append(this.layer);
    this.active = false; this.time = 0; this.disposed = false;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.resize = () => {
      if (!this.renderer) return;
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h); this.post.resize(w, h);
      const authored = this.town.camera;
      authored.updateWorldMatrix(true, false);
      authored.getWorldPosition(this.camera.position);
      authored.getWorldQuaternion(this.camera.quaternion);
      // Crop the authored shot to cover narrow screens, keeping the shopkeeper
      // in view instead of widening the lens until the edges of the set show.
      const aspect = authored.userData.compositionAspect || 1672/941;
      const fullWidth = Math.max(w, h*aspect), fullHeight = Math.max(h, w/aspect);
      this.camera.fov = authored.fov;
      this.camera.setViewOffset(fullWidth, fullHeight,
        THREE.MathUtils.clamp(fullWidth*.22-w*.5, 0, fullWidth-w),
        (fullHeight-h)*.4, w, h);
      this.camera.updateProjectionMatrix();
    };
    this.observer = new ResizeObserver(this.resize); this.observer.observe(container);
    this.tick = now => {
      if (!this.active || !this.renderer) return;
      const dt = Math.min((now-this.last)/1000 || 0, .08); this.last = now;
      if (!document.hidden) {
        if (!this.motion.matches) this.time += dt;
        this.town.animate(this.time, this.motion.matches);
        this.water.material.uniforms.time.value = this.motion.matches ? 0 : this.time;
        this.post.render(this.scene, this.camera, this.town.focus);
      }
      this.frame = requestAnimationFrame(this.tick);
    };
  }
  async prepare() {
    if (this.renderer || this.disposed) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const asset = await loadBelizeTown();
      if (this.disposed) return;
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.AgXToneMapping;
      this.renderer.toneMappingExposure = 1.35;
      this.renderer.domElement.style.display = 'block';
      this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x9b9bb4);
      this.camera = new THREE.PerspectiveCamera(35, 1, .08, 300);
      this.town = createBelizeTown(asset); this.scene.add(this.town.root);
      this.sky = skyMaterial();
      for (const material of this.town.materials.values()) if (material.userData.belizeSurface === 'wood') woodGrain(material);
      this.town.root.traverse(o => {
        if (o.isMesh && o.material.userData.belizeSurface === 'sky') { o.material = this.sky; o.renderOrder = -1; }
      });
      this.scene.add(new THREE.HemisphereLight(0xa8b9df, 0x785030, .65));
      const sun = new THREE.DirectionalLight(0xffaa55, 5.0);
      sun.position.set(35, 22, -35); sun.target.position.set(0, 2, -5);
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 28, bottom: -17, near: 1, far: 110 });
      sun.shadow.bias = -.00015; sun.shadow.normalBias = .025;
      this.scene.add(sun, sun.target);
      const fill = new THREE.DirectionalLight(0xffd5ae, .55); fill.position.set(-4, 8, 10); this.scene.add(fill);
      this.water = waterMesh(); this.scene.add(this.water);
      this.post = new HarborPost(this.renderer);
      this.resize();
      this.town.animate(this.time, this.motion.matches);
      this.post.render(this.scene, this.camera, this.town.focus);
      this.layer.append(this.renderer.domElement);
      this.layer.dataset.ready = 'true';
    })().catch(error => {
      console.error('Could not load Belize harbor; keeping the town illustration.', error);
      this.layer.dataset.error = 'true';
    }).finally(() => { this.loading = undefined; });
    return this.loading;
  }
  async start(port, { resume = false } = {}) {
    this.active = true; this.port = port; this.layer.hidden = false;
    if (!resume) this.time = 0;
    await this.prepare();
    if (!this.active || this.disposed || !this.renderer) return;
    this.resize(); this.last = performance.now();
    cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(this.tick);
  }
  acknowledge() { /* The authored merchant keeps his camera-facing idle. */ }
  stop() { this.active = false; cancelAnimationFrame(this.frame); }
  setVisible(visible) { this.layer.hidden = !visible; }
  dispose() {
    this.stop(); this.disposed = true; this.observer.disconnect();
    this.town?.dispose(); this.sky?.dispose();
    this.water?.geometry.dispose(); this.water?.material.dispose();
    this.post?.target.dispose(); this.post?.material.dispose();
    this.post?.scene.children[0].geometry.dispose();
    this.renderer?.dispose(); this.layer.remove();
  }
}
