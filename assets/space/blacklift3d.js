// The Blacklift figure in 3D: a three-stage carbon rocket lying on its side, built from what
// AST and Firefly have published (three stages; nine Miranda engines on the first, two Vira on
// the second and one on the third; five folded BlueBirds under the fairing; a reusable first
// stage). Proportions, colours, legs and grid fins are illustrative. It rests taken apart,
// slides together for a short static fire, and comes apart again; drag to turn it, tap to skip.
import * as THREE from "../vendor/three/three.module.min.js";

const TAU = Math.PI * 2;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Loop, in seconds (same rhythm as the ASCII version).
const T_JOIN = 6;
const JOIN = 1.8;
const T_FIRE = 8.4;
const T_CUT = 10.6;
const T_SPLIT = 11.6;
const SPLIT = 1.8;
const PERIOD = 16;

// Stations along the rocket, in body diameters from the engine plate (y = 0) to the nose.
const S1_TOP = 8.6;
const IS1_TOP = 9.4;
const S2_TOP = 13.0;
const IS2_TOP = 13.5;
const S3_TOP = 15.0;
const FAIRING_BASE = 15.0;
const NOSE = 19.3;
const R = 0.5;
const R_FAIRING = 0.7;

// How far each piece moves when the stack comes apart.
const APART = { s2: 0.9, s3: 1.8, bird: 2.7, birdStep: 0.3, fairing: 3.7, open: 0.85 };

const PALETTES = {
  light: { body: 0x232120, matte: 0x3c3936, seam: 0xe8dfd3, metal: 0x8c7d70, panel: 0xd9d3ca, foil: 0xb48a3c, rim: 1.4, hemi: 1.1 },
  dark: { body: 0x4a4643, matte: 0x625d58, seam: 0xefe9e2, metal: 0xa49686, panel: 0xcfc8be, foil: 0xc49a4a, rim: 2.4, hemi: 1.35 },
};

/** A small twill weave, so the carbon reads as carbon up close. */
function twill() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  for (let y = 0; y < 32; y += 4) {
    for (let x = 0; x < 32; x += 4) {
      const on = ((x + y) / 4) % 4 < 2;
      g.fillStyle = on ? "#ffffff" : "#d2d2d2";
      g.fillRect(x, y, 4, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/** The antenna face of a folded BlueBird: a grid of tiles. */
function tiles() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "#8f8a84";
  g.lineWidth = 1;
  for (let i = 0; i <= 64; i += 8) {
    g.beginPath();
    g.moveTo(i + 0.5, 0);
    g.lineTo(i + 0.5, 64);
    g.moveTo(0, i + 0.5);
    g.lineTo(64, i + 0.5);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Folded edges on the sides of a stowed BlueBird: thin stripes. */
function folds() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 32;
  const g = c.getContext("2d");
  for (let y = 0; y < 32; y += 4) {
    g.fillStyle = y % 8 ? "#ffffff" : "#9c958c";
    g.fillRect(0, y, 8, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function bell(throat, mouth, length, segments = 32) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(throat + (mouth - throat) * Math.pow(t, 0.7), -t * length));
  }
  return new THREE.LatheGeometry(pts, segments);
}

function cylinder(r, y0, y1, open = false) {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 48, 1, open);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
}

function fairingHalf(side) {
  const pts = [new THREE.Vector2(R, FAIRING_BASE), new THREE.Vector2(R_FAIRING, FAIRING_BASE + 0.4), new THREE.Vector2(R_FAIRING, 17.5)];
  for (let i = 1; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector2(R_FAIRING * Math.pow(1 - Math.pow(t, 1.9), 0.55), 17.5 + t * (NOSE - 17.5)));
  }
  return new THREE.LatheGeometry(pts, 32, side > 0 ? 0 : Math.PI, Math.PI);
}

function build(pal) {
  const weave = twill();
  const carbon = (len) => {
    const map = weave.clone();
    map.needsUpdate = true;
    map.repeat.set(24, Math.round(len * 6));
    return new THREE.MeshStandardMaterial({ color: pal.body, map, roughness: 0.42, metalness: 0.2 });
  };
  const mats = {
    matte: new THREE.MeshStandardMaterial({ color: pal.matte, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide }),
    seam: new THREE.MeshStandardMaterial({ color: pal.seam, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: pal.metal, roughness: 0.32, metalness: 0.6, side: THREE.DoubleSide }),
    hardware: new THREE.MeshStandardMaterial({ color: pal.matte, roughness: 0.55, metalness: 0.45 }),
    panel: new THREE.MeshStandardMaterial({ color: pal.panel, map: tiles(), roughness: 0.5, metalness: 0.1 }),
    foil: new THREE.MeshStandardMaterial({ color: pal.foil, map: folds(), roughness: 0.35, metalness: 0.5 }),
    carbon: [],
  };
  const body = (len) => {
    const m = carbon(len);
    mats.carbon.push(m);
    return m;
  };
  const seam = (y) => new THREE.Mesh(cylinder(R + 0.006, y - 0.012, y + 0.012), mats.seam);

  // First stage: tank, nine Miranda engines (one in the middle, eight around), folded legs,
  // grid fins at the top and the interstage that hides the second stage's engines.
  const s1 = new THREE.Group();
  s1.add(new THREE.Mesh(cylinder(R, 0, S1_TOP), body(S1_TOP)));
  s1.add(new THREE.Mesh(cylinder(R, -0.04, 0.0), mats.hardware));
  s1.add(new THREE.Mesh(cylinder(R, S1_TOP, IS1_TOP, true), mats.matte));
  s1.add(seam(S1_TOP));
  const miranda = bell(0.045, 0.105, 0.42, 24);
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * TAU;
    const rr = i === 8 ? 0 : 0.33;
    const e = new THREE.Mesh(miranda, mats.metal);
    e.position.set(Math.cos(a) * rr, -0.04, Math.sin(a) * rr);
    s1.add(e);
  }
  for (let i = 0; i < 4; i++) {
    const a = TAU * (i / 4 + 0.125);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.3, 0.13), mats.hardware);
    leg.position.set(Math.cos(a) * (R + 0.03), 1.35, Math.sin(a) * (R + 0.03));
    leg.rotation.y = -a;
    s1.add(leg);
    const fin = new THREE.Group();
    const frame = [
      [0.3, 0.025, 0, 0.13],
      [0.3, 0.025, 0, -0.13],
      [0.025, 0.28, 0.14, 0],
      [0.025, 0.28, -0.14, 0],
      [0.3, 0.012, 0, 0.045],
      [0.3, 0.012, 0, -0.045],
      [0.012, 0.28, 0.05, 0],
      [0.012, 0.28, -0.05, 0],
    ];
    for (const [w, h, x, y] of frame) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), mats.hardware);
      bar.position.set(x, y, 0);
      fin.add(bar);
    }
    const af = TAU * (i / 4);
    fin.position.set(Math.cos(af) * (R + 0.16), S1_TOP - 0.25, Math.sin(af) * (R + 0.16));
    fin.rotation.y = -af;
    s1.add(fin);
  }

  // Second stage: two Vira vacuum engines under the tank, its own interstage on top.
  const s2 = new THREE.Group();
  s2.add(new THREE.Mesh(cylinder(R, IS1_TOP, S2_TOP), body(S2_TOP - IS1_TOP)));
  s2.add(new THREE.Mesh(cylinder(R, S2_TOP, IS2_TOP, true), mats.matte));
  s2.add(new THREE.Mesh(cylinder(R * 0.98, IS1_TOP - 0.03, IS1_TOP), mats.hardware));
  s2.add(seam(S2_TOP));
  const vira = bell(0.05, 0.19, 0.62);
  for (const x of [-0.21, 0.21]) {
    const e = new THREE.Mesh(vira, mats.metal);
    e.position.set(x, IS1_TOP - 0.03, 0);
    s2.add(e);
  }

  // Third stage: one Vira and the payload adapter.
  const s3 = new THREE.Group();
  s3.add(new THREE.Mesh(cylinder(R, IS2_TOP, S3_TOP), body(S3_TOP - IS2_TOP)));
  s3.add(new THREE.Mesh(cylinder(R * 0.98, IS2_TOP - 0.03, IS2_TOP), mats.hardware));
  const adapter = new THREE.CylinderGeometry(0.4, R, 0.18, 48);
  adapter.translate(0, S3_TOP + 0.09, 0);
  s3.add(new THREE.Mesh(adapter, mats.hardware));
  const v3 = new THREE.Mesh(bell(0.06, 0.24, 0.55), mats.metal);
  v3.position.set(0, IS2_TOP - 0.03, 0);
  s3.add(v3);

  // Five BlueBirds, folded flat and stacked: tile faces up and down, folds around the sides.
  const birds = [];
  const birdGeo = new THREE.BoxGeometry(0.78, 0.34, 0.78);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(birdGeo, [mats.foil, mats.foil, mats.panel, mats.panel, mats.foil, mats.foil]);
    b.userData.y = S3_TOP + 0.4 + i * 0.38;
    b.position.y = b.userData.y;
    birds.push(b);
  }

  // Fairing halves, open inside so the payload shows when they part.
  const halves = [1, -1].map((side) => {
    const m = new THREE.Mesh(fairingHalf(side), body(NOSE - FAIRING_BASE));
    m.material.side = THREE.DoubleSide;
    m.userData.side = side;
    return m;
  });

  // Exhaust for the static fire: a hot core inside a wider glow, both fading downstream.
  const fade = (() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(0.45, "#888");
    grad.addColorStop(1, "#000");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
    return new THREE.CanvasTexture(c);
  })();
  const plumeMat = (color, opacity) =>
    new THREE.MeshBasicMaterial({ color, alphaMap: fade, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const glowGeo = new THREE.CylinderGeometry(0.46, 0.85, 3.2, 40, 1, true);
  glowGeo.translate(0, -1.6, 0);
  const coreGeo = new THREE.CylinderGeometry(0.34, 0.2, 1.5, 40, 1, true);
  coreGeo.translate(0, -0.75, 0);
  const glow = new THREE.Mesh(glowGeo, plumeMat(0xffa65c, 0.6));
  const core = new THREE.Mesh(coreGeo, plumeMat(0xfff1d6, 0.95));
  const plume = new THREE.Group();
  plume.add(glow, core);
  plume.position.y = -0.44;
  s1.add(plume);

  return { s1, s2, s3, birds, halves, plume, glow, core, mats };
}

/**
 * Mount the model in a .fig__stage. Returns null when WebGL isn't available, so the caller
 * can fall back to the ASCII drawing.
 */
export function mountBlacklift(stage, { dark = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "fig__canvas fig__canvas--3d";
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    return null;
  }
  const old = stage.querySelector("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", old?.getAttribute("aria-label") || "Blacklift");
  if (old) old.replaceWith(canvas);
  else stage.prepend(canvas);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  let pal = dark ? PALETTES.dark : PALETTES.light;
  const parts = build(pal);
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7d70, pal.hemi);
  const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
  key.position.set(4, 9, 10);
  const rim = new THREE.DirectionalLight(0xdfe8ff, pal.rim);
  rim.position.set(-6, 5, -10);
  const under = new THREE.DirectionalLight(0xffe2c6, 0.5);
  under.position.set(0, -8, 4);
  scene.add(hemi, key, rim, under);

  // outer lays the rocket on its side (its +y becomes screen right); spin rolls it.
  const outer = new THREE.Group();
  const spin = new THREE.Group();
  outer.rotation.z = -Math.PI / 2;
  outer.add(spin);
  spin.add(parts.s1, parts.s2, parts.s3, ...parts.birds, ...parts.halves);
  scene.add(outer);

  const camera = new THREE.PerspectiveCamera(12, 3, 1, 600);
  const marks = [...stage.querySelectorAll(".fig__marks span")];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let time = 0;
  let roll = 0.5;
  let yaw = 0;
  let last = 0;
  let raf = 0;
  let visible = false;
  let dragging = null;
  let aspect = 3;

  const spreadAt = (t) => {
    t %= PERIOD;
    if (t < T_JOIN) return 1;
    if (t < T_JOIN + JOIN) return 1 - ease((t - T_JOIN) / JOIN);
    if (t < T_SPLIT) return 0;
    if (t < T_SPLIT + SPLIT) return ease((t - T_SPLIT) / SPLIT);
    return 1;
  };
  const throttleAt = (t) => {
    t %= PERIOD;
    if (t < T_FIRE || t > T_CUT + 0.4) return 0;
    if (t < T_FIRE + 0.4) return ease((t - T_FIRE) / 0.4);
    if (t > T_CUT) return 1 - (t - T_CUT) / 0.4;
    return 1;
  };

  function resize() {
    const w = stage.clientWidth;
    const h = canvas.clientHeight || w / 3;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    draw();
  }

  const v = new THREE.Vector3();
  /** Screen x (-1..1) of a point on the rocket's axis. */
  function end(y) {
    v.set(0, y, 0);
    spin.localToWorld(v);
    v.project(camera);
    return v.x;
  }
  function placeMark(el, obj, y) {
    v.set(0, y, 0);
    obj.localToWorld(v);
    v.project(camera);
    el.style.left = `${((v.x + 1) / 2) * 100}%`;
  }

  function draw() {
    const sp = spreadAt(time);
    const th = throttleAt(time);
    parts.s2.position.y = APART.s2 * sp;
    parts.s3.position.y = APART.s3 * sp;
    parts.birds.forEach((b, i) => {
      b.position.y = b.userData.y + (APART.bird + i * APART.birdStep) * sp;
      // Loose in the exploded view, the BlueBirds drift a little.
      b.position.x = Math.sin(time * 0.8 + i * 1.7) * 0.05 * sp;
      b.rotation.y = Math.sin(time * 0.5 + i) * 0.12 * sp;
    });
    for (const h of parts.halves) {
      h.position.y = APART.fairing * sp;
      h.position.x = h.userData.side * APART.open * sp;
      h.rotation.z = -h.userData.side * 0.12 * sp;
    }
    parts.plume.visible = th > 0.01;
    if (parts.plume.visible) {
      const f = 1 + 0.06 * Math.sin(time * 41) + 0.04 * Math.sin(time * 67);
      parts.plume.scale.set(1, th * f, 1);
      parts.glow.material.opacity = 0.6 * th;
      parts.core.material.opacity = 0.95 * th;
    }
    spin.rotation.y = roll;

    // Keep the whole thing centred and filling the width, apart or together. Perspective
    // makes the near end look bigger, so fit by projecting both ends and correcting once.
    const left = th > 0.01 ? -3.4 : -0.5;
    const right = NOSE + APART.fairing * sp;
    const span = right - left;
    const yawAll = -0.24 + yaw;
    let dist = (span * 0.5) / (Math.tan((camera.fov * Math.PI) / 360) * aspect);
    let shift = -((left + right) / 2);
    for (let pass = 0; pass < 2; pass++) {
      outer.position.x = shift;
      camera.position.set(Math.sin(yawAll) * dist, dist * 0.1, Math.cos(yawAll) * dist);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      outer.updateMatrixWorld(true);
      const a = end(left);
      const b = end(right);
      const half = Math.max(Math.abs(a), Math.abs(b));
      dist *= half / 0.9;
      shift -= ((a + b) / 2) * (span / Math.max(0.2, b - a)) * 0.5;
    }
    outer.position.x = shift;
    camera.position.set(Math.sin(yawAll) * dist, dist * 0.1, Math.cos(yawAll) * dist);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    outer.updateMatrixWorld(true);

    renderer.render(scene, camera);

    stage.style.setProperty("--spread", sp.toFixed(2));
    if (marks.length === 5) {
      placeMark(marks[0], parts.s1, S1_TOP * 0.5);
      placeMark(marks[1], parts.s2, (IS1_TOP + S2_TOP) / 2);
      placeMark(marks[2], parts.s3, (IS2_TOP + S3_TOP) / 2);
      placeMark(marks[3], parts.birds[2], 0);
      placeMark(marks[4], parts.halves[0], 18.2);
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!dragging) roll += dt * 0.16;
    time += dt;
    draw();
    raf = requestAnimationFrame(frame);
  }

  function schedule() {
    cancelAnimationFrame(raf);
    if (!visible || reduced.matches || document.hidden) {
      draw();
      return;
    }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  canvas.addEventListener("pointerdown", (e) => {
    dragging = { x: e.clientX, y: e.clientY, yaw, roll, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.x;
    const dy = e.clientY - dragging.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragging.moved = true;
    yaw = Math.max(-0.9, Math.min(0.9, dragging.yaw - dx * 0.006));
    roll = dragging.roll + dy * 0.012;
    if (reduced.matches || !visible) draw();
  });
  const release = () => {
    if (!dragging) return;
    if (!dragging.moved) {
      // A tap skips to the next join or split.
      const t = time % PERIOD;
      if (t < T_JOIN) time += T_JOIN - t;
      else if (t > T_CUT && t < T_SPLIT) time += T_SPLIT - t;
      else if (reduced.matches) time = spreadAt(time) > 0.5 ? T_JOIN + JOIN : 0;
      draw();
    }
    dragging = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    schedule();
  }).observe(stage);
  reduced.addEventListener("change", schedule);
  document.addEventListener("visibilitychange", schedule);
  resize();

  return {
    setTheme(isDark) {
      pal = isDark ? PALETTES.dark : PALETTES.light;
      for (const m of parts.mats.carbon) m.color.setHex(pal.body);
      parts.mats.matte.color.setHex(pal.matte);
      parts.mats.hardware.color.setHex(pal.matte);
      parts.mats.seam.color.setHex(pal.seam);
      parts.mats.metal.color.setHex(pal.metal);
      parts.mats.panel.color.setHex(pal.panel);
      parts.mats.foil.color.setHex(pal.foil);
      rim.intensity = pal.rim;
      hemi.intensity = pal.hemi;
      draw();
    },
  };
}
