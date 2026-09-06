import * as THREE from "./assets/vendor/three.module.js";
import {
  createTradingPost,
  animateTradingPost,
} from "./trade-winds-market-models.mjs";
import {
  createPortModel,
  portVariant,
  disposeModel,
} from "./trade-winds-models.mjs";
import { HarborPost } from "./trade-winds-harbor-post.mjs";
export class TradingPostScene {
  constructor(container, { study = false } = {}) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x71879c);
    this.scene.fog = new THREE.Fog(0x8c929f, 45, 180);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 260);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0x8fa5c5, 0x4b3020, .8));
    const sun = new THREE.DirectionalLight(0xffb16b, 2.3);
    sun.position.set(18, 25, -32);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -45,
      right: 45,
      top: 40,
      bottom: -22,
      near: 1,
      far: 150,
    });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.07;
    this.scene.add(sun, sun.target);
    const faceFill = new THREE.DirectionalLight(0xc5d8ef, 0.85);
    faceFill.position.set(-8, 9, 18);
    this.scene.add(faceFill);
    sun.target.position.set(-6, 6, 0);
    this.set = createTradingPost();
    this.scene.add(this.set);
    if (this.set.userData.authoredHarbor) {
      this.scene.background.set(0x677f9e);
      sun.position.set(10, 12, -9);
      sun.intensity = 1.8;
      sun.target.position.set(0, 1, -3);
      faceFill.position.set(-4, 9, 8);
      faceFill.color.set(0xffdec0);
      faceFill.intensity = 1.8;
    }
    this.post = this.set.userData.harborSunset ? new HarborPost(this.renderer) : null;
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader:
          "varying vec2 p;void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}",
        fragmentShader:
          "varying vec2 p;uniform float time;void main(){vec2 q=floor(p*2.)/2.;float ripple=step(.85,sin(q.x*.8+q.y*1.3-time));vec3 c=mix(vec3(.025,.06,.085),vec3(.15,.22,.28),ripple*.055);float path=exp(-pow((p.x-23.)/4.,2.));float gold=step(.93,sin(q.x*1.7+q.y*2.3-time*.7))*path;c=mix(c,vec3(.6,.28,.09),gold*.65);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, this.set.userData.authoredHarbor ? -0.26 : -0.57, -40);
    this.scene.add(this.water);
    this.time = 0;
    this.gesture = 0;
    this.active = false;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize = () => {
      const width = container.clientWidth,
        height = container.clientHeight;
      if (!width || !height) return;
      this.renderer.setSize(width, height);
      this.post?.resize(width, height);
      this.camera.aspect = width / height;
      if (this.set.userData.harborSunset) {
        const data = this.set.userData;
        data.camera.updateWorldMatrix(true, false);
        data.camera.getWorldPosition(this.camera.position);
        data.camera.getWorldQuaternion(this.camera.quaternion);
        const compositionAspect = data.camera.userData.compositionAspect || 1.5;
        this.camera.fov = Math.max(data.camera.fov, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(data.camera.fov / 2)) * compositionAspect / this.camera.aspect)));
        this.camera.updateProjectionMatrix();
        const p = data.merchant.getWorldPosition(new THREE.Vector3());
        data.lookYaw = Math.atan2(this.camera.position.x - p.x, this.camera.position.z - p.z);
        return;
      }
      this.camera.fov = width < 700 ? 52 : 38;
      this.camera.position.set(...(study ? [5, 11.4, 33] : [0, 8.5, 26]));
      this.camera.lookAt(...(study ? [3, 7.7, -1] : [0, 7, 0]));
      this.camera.updateProjectionMatrix();
      const halfWidth =
        26 *
        Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) *
        this.camera.aspect;
      this.set.userData.stand.position.x =
        study ? 0 : -halfWidth * (width < 700 ? 0.43 : 0.63);
      this.set.userData.banner.position.x = study ? 13 : halfWidth * 0.84;
      this.set.userData.merchant.userData.lookYaw = Math.atan2(
        this.camera.position.x - this.set.userData.stand.position.x,
        this.camera.position.z - 0.3,
      );
    };
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.tick = (ms) => {
      if (!this.active) return;
      const dt = Math.min((ms - this.last) / 1000 || 0, 0.08);
      this.last = ms;
      if (!document.hidden) {
        this.time += dt;
        this.gesture = Math.max(0, this.gesture - dt);
        animateTradingPost(this.set, this.time, this.gesture, this.reduced);
        this.water.material.uniforms.time.value = this.time;
        if (this.post) this.post.render(this.scene, this.camera, this.set.userData.merchantHead);
        else this.renderer.render(this.scene, this.camera);
      }
      this.frame = requestAnimationFrame(this.tick);
    };
  }
  start(port) {
    this.port = port;
    const variant = portVariant(port.id);
    const data = this.set.userData;
    if (!data.harborSunset && data.city.userData.variant !== variant) {
      const previous = data.city;
      data.city = createPortModel(variant);
      data.city.position.copy(previous.position);
      data.city.scale.copy(previous.scale);
      data.harbor.remove(previous);
      disposeModel(previous);
      data.harbor.add(data.city);
    }
    this.active = true;
    this.last = performance.now();
    this.resize();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.tick);
  }
  acknowledge() {
    this.gesture = 1.4;
  }
  stop() {
    this.active = false;
    cancelAnimationFrame(this.frame);
  }
}
