// Runs one space scene on a canvas: fixed-timestep loop, resize, pointer input, pausing
// off-screen and while the page's toggle is off, and a single still frame for reduced motion.
// Mirrors assets/aquarium/engine.js so the margin tanks treat both the same way.
import { Raster } from "./raster.js";
import { LaunchScene } from "./launch.js";
import { OrbitScene } from "./orbit.js";

const STEP = 1 / 60;
const MAX_STEPS = 4;

/** Lets the launch margin hand its payload to the orbit margin. */
const bus = new EventTarget();

export class SpaceEngine {
  raf = 0;
  last = 0;
  acc = 0;
  visible = true;
  paused = false;
  disposed = false;

  constructor(canvas, { scene = "launch", theme, cellSize } = {}) {
    this.canvas = canvas;
    this.raster = new Raster(canvas);
    if (cellSize) this.raster.cellSize = cellSize;
    this.raster.setTheme(theme);
    this.raster.setFontFamily(getComputedStyle(canvas).fontFamily);
    this.scene = scene === "orbit" ? new OrbitScene() : new LaunchScene();
    if (scene === "orbit") {
      this.onPayload = () => this.scene.payloadArrived();
      bus.addEventListener("payload", this.onPayload);
    } else {
      this.scene.onPayload = () => bus.dispatchEvent(new Event("payload"));
    }
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);
    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("blur", this.onPointerLeave);

    this.resize();
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed && (this.paused || this.reducedMotion.matches)) this.drawFrame();
    });
    this.schedule();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    if (this.onPayload) bus.removeEventListener("payload", this.onPayload);
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("blur", this.onPointerLeave);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.raster.resize(rect.width, rect.height, dpr);
    this.scene.resize(rect.width, rect.height, this.raster.cw, this.raster.ch);
    if (this.reducedMotion.matches) this.drawStill();
    else this.drawFrame();
  }

  setTheme(theme) {
    this.raster.setTheme(theme);
    this.drawFrame();
  }

  pause() {
    this.paused = true;
    cancelAnimationFrame(this.raf);
  }

  play() {
    this.paused = false;
    this.schedule();
  }

  schedule() {
    cancelAnimationFrame(this.raf);
    if (this.disposed || this.paused || !this.visible || this.reducedMotion.matches) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  frame = (now) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.scene.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.drawFrame();
    this.raf = requestAnimationFrame(this.frame);
  };

  drawFrame() {
    if (!this.raster.cols) return;
    this.raster.begin();
    this.scene.render(this.raster);
    this.raster.draw();
  }

  drawStill() {
    if (!this.stilled) {
      this.stilled = true;
      this.scene.still();
    }
    this.drawFrame();
  }

  onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.drawStill();
    } else {
      this.schedule();
    }
  };

  toLocal(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
  }

  onPointerMove = (e) => {
    const { x, y, inside } = this.toLocal(e);
    const p = this.scene.pointer;
    p.x = x;
    p.y = y;
    p.active = inside && e.pointerType !== "touch";
  };

  onPointerDown = (e) => {
    const { x, y, inside } = this.toLocal(e);
    if (inside && !this.reducedMotion.matches) this.scene.click(x, y);
  };

  onPointerLeave = () => {
    this.scene.pointer.active = false;
  };
}
