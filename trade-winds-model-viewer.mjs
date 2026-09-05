import * as THREE from "./assets/vendor/three.module.js";
import {
  createKraken,
  animateKraken,
  krakenPreviewAttacks,
  instanceBlocks,
  createVessel,
  createPortModel,
  createTree,
  createGull,
  PORT_VARIANTS,
  disposeModel,
} from "./trade-winds-models.mjs";
const stage = document.querySelector("#stage");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e3d6);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
stage.prepend(renderer.domElement);
const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 3000);
scene.add(new THREE.HemisphereLight(0xf3f1dc, 0x64755b, 2));
const sun = new THREE.DirectionalLight(0xffe7bd, 2.8);
sun.position.set(-90, 170, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -120,
  right: 120,
  top: 120,
  bottom: -120,
  near: 1,
  far: 500,
});
sun.shadow.normalBias = 0.25;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshStandardMaterial({ color: 0xe9e3d6, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.4;
ground.receiveShadow = true;
scene.add(ground);
let model,
  yaw = 0.7,
  pitch = 0.64,
  zoom = 1,
  span = 65,
  selected = "raft";
const target = new THREE.Vector3();
let previewTime = 0,
  lastFrame = 0,
  motion = true,
  striking = false,
  variant = 17,
  comparison = null,
  oceanStage = null;
const seaTime = { value: 0 };
const descriptions = {
  kraken:
    "A deep-sea giant with a plated mantle, amber eyes, and eight independently moving arms. Pale suckers line each curling limb.",
  raft: "Lashed logs, a patched sail, a steering oar, and just enough room to start a voyage.",
  trader:
    "The original trading ship, preserved with its hull, rigging, canvas sails, and cargo.",
  palm: "A curved, ringed trunk with seven tapered fronds and a cluster of coconuts.",
  canopy:
    "Branching hardwood with layered, irregular clusters of sunlit foliage.",
  gull: "A voxel gull with separate wing joints and dark primary feathers.",
};
function resize() {
  const w = stage.clientWidth,
    h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.top = (span * zoom) / 2;
  camera.bottom = -camera.top;
  camera.right = (camera.top * w) / h;
  camera.left = -camera.right;
  camera.updateProjectionMatrix();
  render();
}
function render() {
  camera.position
    .copy(target)
    .add(
      new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch),
      ).multiplyScalar(
        selected === "kraken" ? Math.max(420, span * zoom) : 220,
      ),
    );
  camera.lookAt(target);
  renderer.render(scene, camera);
}
function select(id) {
  if (model) {
    scene.remove(model);
    disposeModel(model);
  }
  if (comparison) {
    scene.remove(comparison);
    disposeModel(comparison);
    comparison = null;
  }
  if (oceanStage) {
    scene.remove(oceanStage);
    oceanStage.children[0].material.dispose();
    disposeModel(oceanStage);
    oceanStage = null;
  }
  selected = id;
  previewTime = 0;
  document.querySelector("#mob-controls").hidden = id !== "kraken";
  stage.classList.toggle("ocean-stage", id === "kraken");
  scene.background.set(id === "kraken" ? 0x173f49 : 0xe9e3d6);
  model =
    id === "kraken"
      ? createKraken(variant)
      : id === "raft" || id === "trader"
        ? createVessel(id)
        : PORT_VARIANTS[id]
          ? createPortModel(id)
          : id === "gull"
            ? createGull(0)
            : createTree(id, 3);
  scene.add(model);
  if (id === "kraken") {
    comparison = createVessel("trader");
    comparison.position.set(16, 1, 105);
    comparison.rotation.y = -0.35;
    comparison.visible = document.querySelector("#ship-scale").checked;
    scene.add(comparison);
    oceanStage = new THREE.Group();
    const tiles = [];
    for (let x = -420; x <= 420; x += 12)
      for (let z = -420; z <= 420; z += 12) {
        const n =
          Math.sin(x * 0.17 + z * 0.41) * 0.5 +
          Math.sin(z * 0.11 - x * 0.08) * 0.5;
        const c = new THREE.Color().setRGB(
          0.008 + n * 0.002,
          0.045 + n * 0.004,
          0.06 + n * 0.005,
        );
        tiles.push([x, -1.6 + Math.floor(n * 3) * 0.13, z, 12, 0.8, 12, c]);
      }
    instanceBlocks(tiles, oceanStage);
    const sea = oceanStage.children[0];
    sea.castShadow = false;
    sea.material = sea.material.clone();
    sea.material.onBeforeCompile = (shader) => {
      shader.uniforms.seaTime = seaTime;
      shader.vertexShader = "varying vec2 seaPoint;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nseaPoint = (modelMatrix * instanceMatrix * vec4(position,1.)).xz;",
      );
      shader.fragmentShader =
        "varying vec2 seaPoint;\nuniform float seaTime;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        vec2 pixel = floor(seaPoint / 2.);
        float fleck = fract(sin(dot(floor(pixel / vec2(4.,2.)),vec2(127.1,311.7)))*43758.5453);
        float crest = sin(pixel.x * .43 + pixel.y * .63 - seaTime * 1.3);
        float cap = step(.85,fleck) * step(.88,crest);
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.17,.29,.27),cap * .7);
      `,
      );
    };
    scene.add(oceanStage);
  }
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  bounds.getCenter(target);
  span = Math.max(size.y * 1.5, size.x * 1.2, size.z * 1.2, 25);
  if (stage.clientWidth < stage.clientHeight)
    span *= stage.clientHeight / stage.clientWidth;
  if (id === "kraken") {
    span = Math.max(span, 330);
    target.y = 22;
  }
  yaw = id === "kraken" ? 0.46 : 0.7;
  pitch = 0.64;
  zoom = 1;
  const shadowSpan = id === "kraken" ? 210 : 120;
  Object.assign(sun.shadow.camera, {
    left: -shadowSpan,
    right: shadowSpan,
    top: shadowSpan,
    bottom: -shadowSpan,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.copy(target);
  sun.position.copy(target).add(new THREE.Vector3(-90, 170, 80));
  ground.position.y = id === "kraken" ? -5 : -1.4;
  ground.material.color.set(
    id === "kraken"
      ? 0x173f49
      : PORT_VARIANTS[id] || ["raft", "trader"].includes(id)
        ? 0x5c9fa0
        : 0xd9d3bc,
  );
  document.querySelector("#name").textContent =
    PORT_VARIANTS[id]?.name ||
    {
      kraken: "Atlantic Kraken",
      raft: "Starting raft",
      trader: "Trading sloop",
      palm: "Coconut palm",
      canopy: "Tropical canopy",
      gull: "Seagull",
    }[id];
  document.querySelector("#description").textContent =
    PORT_VARIANTS[id]?.description || descriptions[id];
  document
    .querySelectorAll("[data-model]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.model === id)),
    );
  history.replaceState(null, "", `#${id}`);
  resize();
}
document
  .querySelectorAll("[data-model]")
  .forEach((button) => (button.onclick = () => select(button.dataset.model)));
document.querySelector("#left").onclick = () => {
  yaw -= 0.35;
  render();
};
document.querySelector("#right").onclick = () => {
  yaw += 0.35;
  render();
};
document.querySelector("#reset").onclick = () => select(selected);
let pointer = null;
renderer.domElement.onpointerdown = (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  renderer.domElement.setPointerCapture(e.pointerId);
};
renderer.domElement.onpointermove = (e) => {
  if (!pointer) return;
  yaw -= (e.clientX - pointer.x) * 0.008;
  pitch = THREE.MathUtils.clamp(
    pitch + (e.clientY - pointer.y) * 0.005,
    0.2,
    1.25,
  );
  pointer = { x: e.clientX, y: e.clientY };
  render();
};
renderer.domElement.onpointerup = renderer.domElement.onpointercancel = () => {
  pointer = null;
};
renderer.domElement.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom + e.deltaY * 0.001, 0.45, 2);
    resize();
  },
  { passive: false },
);
window.addEventListener("resize", resize);
const first = location.hash.slice(1);
select(
  [
    "kraken",
    "raft",
    "trader",
    "merchant",
    "fortress",
    "lagoon",
    "palm",
    "canopy",
    "gull",
  ].includes(first)
    ? first
    : "raft",
);

document.querySelector("#motion").onclick = (event) => {
  motion = !motion;
  event.currentTarget.textContent = motion ? "Pause motion" : "Resume motion";
  event.currentTarget.setAttribute("aria-pressed", String(!motion));
};
document.querySelector("#strikes").onclick = (event) => {
  striking = !striking;
  previewTime = 0;
  event.currentTarget.setAttribute("aria-pressed", String(striking));
  event.currentTarget.textContent = striking
    ? "Return to idle"
    : "Preview strikes";
};
document.querySelector("#variant").onclick = () => {
  variant = Math.floor(Math.random() * 100000);
  select("kraken");
};
document.querySelector("#ship-scale").onchange = (event) => {
  if (comparison) comparison.visible = event.currentTarget.checked;
  render();
};
function animate(ms) {
  const dt = Math.min((ms - lastFrame) / 1000 || 0, 0.05);
  lastFrame = ms;
  if (selected === "kraken" && !document.hidden) {
    if (motion) previewTime += dt;
    seaTime.value = previewTime;
    animateKraken(
      model,
      previewTime,
      striking ? krakenPreviewAttacks(previewTime) : [],
    );
    if (comparison) {
      comparison.position.y = 1 + Math.sin(previewTime * 1.5) * 0.4;
      comparison.rotation.z = Math.sin(previewTime) * 0.03;
    }
    render();
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
