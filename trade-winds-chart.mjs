import * as THREE from "./assets/vendor/three.module.js";
import { GLTFLoader } from "./assets/vendor/GLTFLoader.js";
import { PORTS, toGeo } from "./trade-winds-engine.mjs";

export class NauticalChartScene {
  constructor(container, { onSelect = () => {}, onReady = () => {} } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.active = false;
    this.time = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x292c30);
    this.camera = new THREE.OrthographicCamera(-75, 75, 55, -55, 0.1, 450);
    this.camera.position.set(3, 145, 105);
    this.camera.lookAt(0, 0, -2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xcbd8e3, 0x57452f, 1.5));
    const sun = new THREE.DirectionalLight(0xffd5a1, 3.2);
    sun.position.set(-55, 125, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -95,
      right: 95,
      top: 95,
      bottom: -95,
      near: 1,
      far: 260,
    });
    sun.shadow.normalBias = 0.055;
    sun.shadow.bias = -0.0001;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x292c30, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.labels = document.createElement("div");
    this.labels.className = "chart-port-labels";
    container.append(this.labels);
    this.portButtons = PORTS.map((p) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "chart-port";
      el.textContent = p.name;
      el.dataset.port = p.id;
      el.setAttribute("aria-label", `Set course for ${p.name}`);
      el.setAttribute("aria-pressed", "false");
      el.onclick = () => onSelect(p.id);
      this.labels.append(el);
      return { port: p, el };
    });
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 4, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x9b713a }),
    );
    pole.position.y = 2;
    flag.add(pole);
    const flagGeo = new THREE.BufferGeometry();
    flagGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 4, 0, 2.1, 3.3, 0, 0, 2.6, 0], 3),
    );
    flagGeo.computeVertexNormals();
    this.flagCloth = new THREE.Mesh(
      flagGeo,
      new THREE.MeshStandardMaterial({
        color: 0xb8492a,
        side: THREE.DoubleSide,
      }),
    );
    flag.add(this.flagCloth);
    this.flag = flag;
    this.scene.add(flag);
    flag.visible = false;
    this.route = new THREE.Group();
    this.scene.add(this.route);
    this.message = document.createElement("p");
    this.message.className = "chart-load-message";
    this.message.setAttribute("role", "status");
    this.message.textContent = "Unrolling the chart…";
    container.append(this.message);
    this.resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h);
      const aspect = w / h;
      const span = Math.max(109, 150 / aspect);
      this.camera.top = span / 2;
      this.camera.bottom = -span / 2;
      this.camera.left = (-span * aspect) / 2;
      this.camera.right = (span * aspect) / 2;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      this.layout();
      if (this.model) this.renderer.render(this.scene, this.camera);
    };
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.ready = Promise.all([
      fetch("./assets/trade-winds/chart-layout.json").then((r) => {
        if (!r.ok) throw Error("Chart coordinates could not load");
        return r.json();
      }),
      new GLTFLoader().loadAsync(
        "./assets/trade-winds/models/west-indies-chart.glb",
      ),
    ])
      .then(([layout, gltf]) => {
        this.layoutData = layout;
        this.model = gltf.scene;
        this.model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.scene.add(this.model);
        this.ship = this.model.getObjectByName("chart_ship");
        if (this.ship) this.ship.scale.setScalar(1.35);
        this.flame = this.model.getObjectByName("Lantern_flame");
        if (this.flame)
          this.flame.traverse((o) => {
            if (o.isMesh) {
              o.material.emissive = new THREE.Color(0xffb332);
              o.material.emissiveIntensity = 0.7;
            }
          });
        const lanternLight = new THREE.PointLight(0xffb447, 60, 25, 1.5);
        lanternLight.position.set(47, 8, -50);
        this.scene.add(lanternLight);
        this.lanternLight = lanternLight;
        this.message.hidden = true;
        this.resize();
        if (this.state) this.update(this.state);
        onReady(this);
      })
      .catch((error) => {
        this.message.textContent =
          "The chart could not load. Close it and reload the game to try again.";
        console.error(error);
      });
    this.tick = (ms) => {
      if (!this.active) return;
      const dt = Math.min((ms - this.last) / 1000 || 0, 0.08);
      this.last = ms;
      if (!document.hidden && this.model) {
        this.time += dt;
        const motion = matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 1;
        if (this.ship) {
          this.ship.position.y =
            1.6 + Math.sin(this.time * 1.5) * 0.07 * motion;
          this.ship.rotation.z = Math.sin(this.time * 0.8) * 0.015 * motion;
        }
        this.flagCloth.rotation.y = Math.sin(this.time * 2) * 0.09 * motion;
        if (this.lanternLight)
          this.lanternLight.intensity =
            60 + Math.sin(this.time * 8) * 4 * motion;
        this.renderer.render(this.scene, this.camera);
      }
      this.frame = requestAnimationFrame(this.tick);
    };
  }
  point(lon, lat, y = 2.8) {
    const b = this.layoutData?.bounds || {
      west: -103,
      east: -57,
      south: 6,
      north: 32,
    };
    return new THREE.Vector3(
      ((lon - b.west) / (b.east - b.west) - 0.5) * 120,
      y,
      -((lat - b.south) / (b.north - b.south) - 0.5) * 72,
    );
  }
  screen(point) {
    const v = point.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.container.clientWidth,
      y: (-0.5 * v.y + 0.5) * this.container.clientHeight,
    };
  }
  layout() {
    if (!this.layoutData) return;
    for (const { port, el } of this.portButtons) {
      const pos = this.screen(this.point(port.lon, port.lat));
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y - 5}px`;
    }
    this.container.dispatchEvent(
      new CustomEvent("chartlayout", { detail: this }),
    );
  }
  update(state) {
    this.state = state;
    if (!this.model) return;
    const geo = toGeo(state.x, state.z),
      p = this.point(geo.lon, geo.lat, 1.6);
    p.x = THREE.MathUtils.clamp(p.x, -59, 59);
    p.z = THREE.MathUtils.clamp(p.z, -35, 35);
    if (this.ship) {
      this.ship.position.copy(p);
      this.ship.rotation.y = state.heading + Math.PI;
    }
    const dest = PORTS.find((port) => port.id === state.target);
    for (const { port, el } of this.portButtons)
      el.setAttribute("aria-pressed", String(port.id === state.target));
    this.flag.visible = !!dest;
    if (dest) this.flag.position.copy(this.point(dest.lon, dest.lat, 2.5));
    // Bearing dots are advisory: the player still sails around land manually.
    for (const child of [...this.route.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.route.remove(child);
    }
    if (dest) {
      const target = this.point(dest.lon, dest.lat, 0.65),
        start = this.point(geo.lon, geo.lat, 0.65);
      const distance = start.distanceTo(target),
        count = Math.min(70, Math.floor(distance / 1.1));
      for (let i = 1; i < count; i++) {
        const dot = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.12, 0.3),
          new THREE.MeshBasicMaterial({
            color: 0xe0c68f,
            transparent: true,
            opacity: 0.65,
          }),
        );
        dot.position.copy(start.clone().lerp(target, i / count));
        this.route.add(dot);
      }
    }
    this.layout();
  }
  start(state) {
    this.update(state);
    this.active = true;
    this.last = performance.now();
    this.resize();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.tick);
  }
  stop() {
    this.active = false;
    cancelAnimationFrame(this.frame);
  }
}
