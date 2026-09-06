import * as THREE from "./assets/vendor/three.module.js";
import { createShark, animateShark, SHARK_SHADOW_GLSL } from "./trade-winds-sharks.mjs?v=spawn-3";
import {
  createMerchantDebris,
  animateMerchantDebris,
  createKraken,
  animateKraken,
  krakenPreviewAttacks,
  instanceBlocks,
  createVessel,
  loadVesselAssets,
  animateVessel,
  createPortModel,
  createTree,
  createGull,
  PORT_VARIANTS,
  disposeModel,
} from "./trade-winds-models.mjs?v=frigate-1";
import { loadFrigateAsset, createFrigate, animateFrigate, disposeFrigate } from "./trade-winds-frigates.mjs?v=wind-2";
import { FrigateWake } from "./trade-winds-frigate-wake.mjs";
import { createWhirlpool, animateWhirlpool, disposeWhirlpool } from "./trade-winds-whirlpool.mjs?v=pull-2";
import { WHIRLPOOL } from "./trade-winds-whirlpool-field.mjs?v=pull-2";
import { createStorm, animateStorm, disposeStorm, STORM_SIZE } from "./trade-winds-storms.mjs?v=size-4";
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
const previewShadows = { value: Array.from({ length: 3 }, () => new THREE.Vector4(0, 0, 0, 0)) };
const shadowTime = { value: 0 };
ground.material.onBeforeCompile = shader => {
  shader.uniforms.sharkShadows = previewShadows;
  shader.uniforms.shadowTime = shadowTime;
  shader.vertexShader = 'varying vec2 shadowPoint;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nshadowPoint=(modelMatrix*vec4(position,1.)).xz;');
  shader.fragmentShader = 'varying vec2 shadowPoint;\nuniform float shadowTime;\n' + SHARK_SHADOW_GLSL + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
    '#include <color_fragment>\ndiffuseColor.rgb *= 1. - sharkShadow(shadowPoint,shadowTime)*.62;');
};
let model,
  yaw = 0.7,
  pitch = 0.64,
  zoom = 1,
  span = 65,
  selected = "raft";
const target = new THREE.Vector3();
let previewTime = 0,
  frigateWake = null,
  lastFrame = 0,
  motion = true,
  striking = false,
  variant = 17,
  comparison = null,
  oceanStage = null;
const seaTime = { value: 0 };
const descriptions = {
  storm: "A drifting bank of charcoal voxel clouds with random yellow lightning inside, falling blocky rain, and splashes on the sea. Rare storms are three times more frequent in the Atlantic. Heavy rain slows sailing by up to 35% and deals 1 hull damage every six seconds.",
  whirlpool: "A vast voxel maelstrom in the central Gulf of Mexico. Spiral currents pull ships into a deep, fatal eye. Jagged rocks break the flow into foaming collars and spray. Escape the outer current under sail; the inner pull is stronger than your boat.",
  debris: "Waterlogged merchant cargo: three iron-bound barrels, broken planks, draped sailcloth, a knotted fishing net with cork floats, and loose coils of rope.",
  frigate: "An 1812 voxel frigate with wind-filled, rippling sails, a fluttering Union Jack, and a flowing foam wake. Peaceful ships patrol at 16 units per second, keep clear of land and harbors, and appear four times as often in the Atlantic. They hold their patrol course when you sail nearby.",
  shark: "A slim dorsal fin above a submerged shark silhouette, with broad side fins, a beating tail, and a flowing foam wake. Sharks patrol open water, appear more often in the Atlantic, and chase nearby boats at 26.1 units per second.",
  kraken:
    "A deep-sea giant with a plated mantle, amber eyes, and eight independently moving arms. Pale suckers line each curling limb.",
  raft: "A seated voyager aboard a timber raft, with a weathered sail, cargo chest, barrel, glowing lantern, and wooden oar.",
  trader:
    "A voxel trading sloop with a raised helm, patched canvas, cargo, and a navy pennant. The sails, helmsman, wheel, lantern, and loose rope move gently.",
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
        ["kraken", "whirlpool", "storm"].includes(selected) ? Math.max(1200, span * zoom) : 220,
      ),
    );
  camera.lookAt(target);
  renderer.render(scene, camera);
}
function select(id) {
  frigateWake?.dispose();
  frigateWake = null;
  previewShadows.value.forEach(shadow => shadow.set(0, 0, 0, 0));
  if (model) {
    scene.remove(model);
    if (selected === "storm") disposeStorm(model);
    else if (selected === "whirlpool") disposeWhirlpool(model);
    else if (selected === "frigate") disposeFrigate(model);
    else disposeModel(model);
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
  document.querySelector("#vessel-motion").hidden = !["trader", "shark", "frigate", "debris", "whirlpool", "storm"].includes(id);
  document.querySelector("#vessel-motion").textContent = motion ? "Pause motion" : "Resume motion";
  document.querySelector("#vessel-motion").setAttribute("aria-pressed", String(!motion));
  stage.classList.toggle("ocean-stage", ["kraken", "shark", "frigate", "debris", "whirlpool", "storm"].includes(id));
  scene.background.set(["kraken", "shark", "frigate", "debris", "whirlpool", "storm"].includes(id) ? 0x173f49 : 0xe9e3d6);
  ground.visible = id !== "whirlpool";
  model =
    id === "storm" ? createStorm(43) :
    id === "whirlpool" ? createWhirlpool({water:true}) :
    id === "debris" ? createMerchantDebris() :
    id === "frigate" ? createFrigate() : id === "shark" ? createShark() : id === "kraken"
      ? createKraken(variant)
      : id === "raft" || id === "trader"
        ? createVessel(id)
        : PORT_VARIANTS[id]
          ? createPortModel(id)
          : id === "gull"
            ? createGull(0)
            : createTree(id, 3);
  scene.add(model);
  if (id === "frigate") {
    frigateWake = new FrigateWake();
    scene.add(frigateWake.mesh);
  }
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
  if (id === "shark") {
    span = 65 * Math.max(1, stage.clientHeight / stage.clientWidth);
    target.set(0, 1, 0);
  }
  if (id === "storm") {
    span=240*STORM_SIZE*Math.max(1,stage.clientHeight/stage.clientWidth);
    target.set(0,170,0);
  }
  if (id === "whirlpool") {
    span=790*Math.max(1,stage.clientHeight/stage.clientWidth);
    target.set(WHIRLPOOL.x,-20,WHIRLPOOL.z);
  }
  yaw = id === "frigate" ? 1.2 : id === "kraken" ? 0.46 : id === "raft" ? Math.PI + 0.7 : id === "trader" ? 2.5 : 0.7;
  pitch = id === "whirlpool" ? .95 : .64;
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
  ground.position.y = ["shark", "frigate", "debris"].includes(id) ? 0 : id === "kraken" ? -5 : -1.4;
  ground.material.color.set(
    ["kraken", "shark", "frigate", "debris", "whirlpool", "storm"].includes(id)
      ? 0x173f49
      : PORT_VARIANTS[id] || ["raft", "trader"].includes(id)
        ? 0x5c9fa0
        : 0xd9d3bc,
  );
  document.querySelector("#name").textContent =
    PORT_VARIANTS[id]?.name ||
    {
      debris: "Floating merchant debris",
      whirlpool: "Gulf whirlpool",
      storm: "Atlantic thunderstorm",
      kraken: "Atlantic Kraken",
      shark: "Shark fin",
      frigate: "British frigate",
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
await Promise.all([loadVesselAssets(), loadFrigateAsset()]).catch((error) => console.error("Vessel model could not load:", error));
select(
  [
    "debris",
    "storm",
    "whirlpool",
    "kraken",
    "shark",
    "frigate",
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
document.querySelector("#vessel-motion").onclick = (event) => {
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
  if(selected === "storm" && !document.hidden) {
    if(motion)previewTime+=dt;
    animateStorm(model,previewTime,{reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
    render();
  }
  if (selected === "whirlpool" && !document.hidden) {
    if(motion)previewTime+=dt;
    animateWhirlpool(model,previewTime);
    render();
  }
  if (selected === "debris" && !document.hidden) {
    if (motion) previewTime += dt;
    animateMerchantDebris(model, previewTime);
    render();
  }
  if (selected === "shark" && !document.hidden) {
    if (motion) previewTime += dt;
    animateShark(model, previewTime, true);
    model.position.set(Math.sin(previewTime * .4) * 10, 0, Math.cos(previewTime * .4) * 10);
    model.rotation.y = previewTime * .4 + Math.PI / 2;
    previewShadows.value[0].set(model.position.x, model.position.z, model.rotation.y, 1);
    shadowTime.value = previewTime;
    render();
  }
  if (selected === "frigate" && !document.hidden) {
    if (motion) previewTime += dt;
    animateFrigate(model, previewTime);
    model.position.y = Math.sin(previewTime * .8) * .35;
    model.rotation.x = Math.sin(previewTime * .8) * .012;
    model.rotation.z = Math.sin(previewTime) * .018;
    const position = { x: 0, z: -previewTime * 16, heading: 0 };
    frigateWake.update(motion ? dt : 0, position, () => 0, 1, position);
    render();
  }
  if (selected === "trader" && !document.hidden) {
    if (motion) previewTime += dt;
    animateVessel(model, previewTime);
    render();
  }
  if (selected === "kraken" && !document.hidden) {
    if (motion) previewTime += dt;
    seaTime.value = previewTime;
    animateKraken(
      model,
      previewTime,
      striking ? krakenPreviewAttacks(previewTime) : [],
    );
    if (comparison) {
      animateVessel(comparison, previewTime);
      comparison.position.y = 1 + Math.sin(previewTime * 1.5) * 0.4;
      comparison.rotation.z = Math.sin(previewTime) * 0.03;
    }
    render();
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
