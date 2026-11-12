// Shared pieces for the space scenes: noise, a smoke particle system, and rasterisers for
// rocket bodies (a radius profile turned into a shaded cylinder), exhaust plumes, and flat
// 3D panels (the BlueBird arrays) projected orthographically.
import { clamp, hash3 } from "../aquarium/math.js";
import { M } from "./raster.js";

export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ── Noise ─────────────────────────────────────────────────────────────────

export function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash3(xi, yi, seed);
  const b = hash3(xi + 1, yi, seed);
  const c = hash3(xi, yi + 1, seed);
  const d = hash3(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, seed = 0) {
  return vnoise(x, y, seed) * 0.55 + vnoise(x * 2.03, y * 2.03, seed + 7) * 0.3 + vnoise(x * 4.1, y * 4.1, seed + 13) * 0.15;
}

/** A smooth, swirling flow field for smoke turbulence. Roughly unit magnitude. */
function flow(x, y, t, out) {
  out.x = Math.sin(y * 0.021 + t * 0.7) * Math.cos(x * 0.013 - t * 0.3) + 0.6 * Math.sin((x + y) * 0.031 + t * 1.1);
  out.y = Math.cos(x * 0.019 - t * 0.5) * Math.sin(y * 0.017 + t * 0.4) + 0.6 * Math.cos((x - y) * 0.027 - t * 0.9);
  return out;
}

// ── Smoke ─────────────────────────────────────────────────────────────────

/** Structure-of-arrays particles in world space (y up). */
export class Smoke {
  constructor(max = 1600) {
    this.max = max;
    this.n = 0;
    const f = () => new Float32Array(max);
    Object.assign(this, {
      x: f(), y: f(), vx: f(), vy: f(), age: f(), life: f(),
      s0: f(), s1: f(), amt: f(), drag: f(), buoy: f(), turb: f(),
    });
    this.tmp = { x: 0, y: 0 };
  }

  clear() {
    this.n = 0;
  }

  /** o: { x, y, vx, vy, life, s0, s1, amt, drag, buoy, turb } */
  spawn(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.x[i] = o.x;
    this.y[i] = o.y;
    this.vx[i] = o.vx ?? 0;
    this.vy[i] = o.vy ?? 0;
    this.age[i] = 0;
    this.life[i] = o.life ?? 3;
    this.s0[i] = o.s0 ?? 3;
    this.s1[i] = o.s1 ?? 12;
    this.amt[i] = o.amt ?? 0.6;
    this.drag[i] = o.drag ?? 1;
    this.buoy[i] = o.buoy ?? 0;
    this.turb[i] = o.turb ?? 10;
  }

  /** floor: world y the smoke can't sink below (the ground), or -Infinity. */
  step(dt, t, floor = -Infinity) {
    const f = this.tmp;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const age = this.age[i] + dt;
      if (age >= this.life[i]) continue;
      let x = this.x[i];
      let y = this.y[i];
      let vx = this.vx[i];
      let vy = this.vy[i];
      flow(x, y, t, f);
      const k = Math.exp(-this.drag[i] * dt);
      const turb = this.turb[i];
      vx = vx * k + f.x * turb * dt;
      vy = vy * k + (f.y * turb + this.buoy[i]) * dt;
      x += vx * dt;
      y += vy * dt;
      if (y < floor) {
        // Smoke that reaches the pad rolls outward along it.
        y = floor;
        vx += Math.sign(vx || 1) * Math.abs(vy) * 0.8;
        vy = Math.abs(vy) * 0.15;
      }
      this.x[w] = x;
      this.y[w] = y;
      this.vx[w] = vx;
      this.vy[w] = vy;
      this.age[w] = age;
      this.life[w] = this.life[i];
      this.s0[w] = this.s0[i];
      this.s1[w] = this.s1[i];
      this.amt[w] = this.amt[i];
      this.drag[w] = this.drag[i];
      this.buoy[w] = this.buoy[i];
      this.turb[w] = this.turb[i];
      w++;
    }
    this.n = w;
  }

  /** Splat into the raster's density field. toScreenY maps world y to px; kill() drops particles off-screen. */
  deposit(raster, toScreenX, toScreenY) {
    const H = raster.height;
    for (let i = 0; i < this.n; i++) {
      const p = this.age[i] / this.life[i];
      const sy = toScreenY(this.y[i]);
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - p) * (1 - p));
      if (sy - size > H || sy + size < 0) continue;
      const fade = Math.min(1, this.age[i] * 8) * Math.pow(1 - p, 1.4);
      raster.splat(toScreenX(this.x[i]), sy, size, this.amt[i] * fade);
    }
  }

  /** Forget particles far below the view, which a climbing camera leaves behind. */
  cull(minY) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.y[i] < minY) continue;
      if (w !== i) {
        for (const key of ["x", "y", "vx", "vy", "age", "life", "s0", "s1", "amt", "drag", "buoy", "turb"]) this[key][w] = this[key][i];
      }
      w++;
    }
    this.n = w;
  }
}

// ── Bodies of revolution ─────────────────────────────────────────────────

/**
 * A rocket body: a radius profile along its axis, drawn as a lit cylinder.
 * body: { x, y (world, y up, base of the profile), ang (radians, + leans right), r (px),
 *         len (px), z, parts: [{ h0, h1, r0, r1, mat, inner?, side?, ogive?, stripes? }] }
 * h is in units of len, radii in units of r. `inner` keeps only |x| ≥ inner (fins, legs);
 * `side` keeps one half (fairing halves); `ogive` rounds r1 into a nose.
 */
const LIGHT_X = -0.62;
const LIGHT_Z = 0.78;

function partRadius(p, h) {
  const t = (h - p.h0) / (p.h1 - p.h0);
  if (p.ogive) return p.r0 * Math.pow(Math.max(0, 1 - Math.pow(t, 1.9)), 0.55);
  return p.r0 + (p.r1 - p.r0) * t;
}

export function drawBody(raster, body, view) {
  const { x, y, ang, r, len, parts, z } = body;
  const s = Math.sin(ang);
  const c = Math.cos(ang);
  let hMin = Infinity;
  let hMax = -Infinity;
  let rMax = 0;
  for (const p of parts) {
    hMin = Math.min(hMin, p.h0);
    hMax = Math.max(hMax, p.h1);
    rMax = Math.max(rMax, p.r0, p.r1);
  }
  // Screen bounds from the four corners of the local box.
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const lx of [-rMax * r, rMax * r]) {
    for (const lh of [hMin * len, hMax * len]) {
      const wx = x + lx * c + lh * s;
      const wy = y - lx * s + lh * c;
      const sx = view.sx(wx);
      const sy = view.sy(wy);
      x0 = Math.min(x0, sx);
      x1 = Math.max(x1, sx);
      y0 = Math.min(y0, sy);
      y1 = Math.max(y1, sy);
    }
  }
  if (x1 < 0 || y1 < 0 || x0 > raster.width || y0 > raster.height) return;
  const stripe = body.stripe || 4;
  raster.scan(x0, y0, x1, y1, (k, px, py) => {
    const dx = view.wx(px) - x;
    const dy = view.wy(py) - y;
    const lx = dx * c - dy * s;
    const h = (dx * s + dy * c) / len;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (h < p.h0 || h > p.h1) continue;
      const rad = partRadius(p, h) * r;
      const ax = Math.abs(lx);
      if (ax > rad) continue;
      if (p.inner && ax < p.inner * r) continue;
      if (p.side && Math.sign(lx) !== p.side) continue;
      const q = clamp(lx / Math.max(rad, 0.001), -1, 1);
      const nz = Math.sqrt(1 - q * q);
      const lam = Math.max(0, LIGHT_X * q + LIGHT_Z * nz);
      const spec = Math.pow(Math.max(0, -0.3 * q + 0.95 * nz), 24) * 0.25;
      const v = clamp(0.08 + 0.86 * lam + spec, 0, 1);
      let d = 0;
      if (p.stripes) d = ((h * len) / stripe) % 1 < 0.3 ? 1 : 0;
      raster.write(k, z, p.mat, v, d);
      return;
    }
  });
}

/**
 * An exhaust plume below a body. at: h (in body len units) of the nozzle exit;
 * base: exit radius (in r); length (px); spread: how much it widens; diamonds: 0..1
 * shock-diamond banding; mat: M.FLAME or M.VAC.
 */
export function drawPlume(raster, body, view, { at, base, length, spread, diamonds = 0, mat, t, floor = -Infinity }) {
  if (length < 1) return;
  const { x, y, ang, r, len } = body;
  const s = Math.sin(ang);
  const c = Math.cos(ang);
  const w0 = base * r;
  const wMax = w0 * (1 + spread);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const lx of [-wMax, wMax]) {
    for (const lh of [at * len, at * len - length]) {
      const sx = view.sx(x + lx * c + lh * s);
      const sy = view.sy(y - lx * s + lh * c);
      x0 = Math.min(x0, sx);
      x1 = Math.max(x1, sx);
      y0 = Math.min(y0, sy);
      y1 = Math.max(y1, sy);
    }
  }
  const z = body.z - 0.5;
  const flick = 1 + 0.1 * Math.sin(t * 37) + 0.06 * Math.sin(t * 61 + 1.3);
  const L = length * flick;
  raster.scan(x0, y0, x1, y1, (k, px, py) => {
    const wy = view.wy(py);
    if (wy < floor) return;
    const dx = view.wx(px) - x;
    const dy = wy - y;
    const lx = dx * c - dy * s;
    const lh = dx * s + dy * c;
    const u = (at * len - lh) / L;
    if (u < 0 || u > 1) return;
    const n = vnoise(u * 7 - t * 9, lx * 0.15, 5);
    const w = w0 * (1 + spread * u) * Math.pow(1 - u, 0.45) * (0.85 + 0.3 * n);
    const ax = Math.abs(lx);
    if (ax > w) return;
    let v = Math.pow(1 - ax / w, 0.6) * (1 - u * 0.7);
    if (diamonds > 0) {
      const band = 0.5 + 0.5 * Math.cos((u * L) / (w0 * 1.25) * Math.PI * 2);
      v = v * (1 - diamonds * 0.45) + diamonds * 0.45 * band * (1 - u);
    }
    raster.write(k, z, mat, clamp(v, 0, 1));
  });
}

// ── Flat panels in 3D ────────────────────────────────────────────────────

const SUN = (() => {
  const v = [0.55, 0.5, 0.67];
  const m = Math.hypot(...v);
  return v.map((a) => a / m);
})();
const HALF = (() => {
  const v = [SUN[0], SUN[1], SUN[2] + 1];
  const m = Math.hypot(...v);
  return v.map((a) => a / m);
})();

/** Lighting for a flat face with normal n (any length): returns [shade, facesViewer]. */
export function faceShade(nx, ny, nz) {
  const m = Math.hypot(nx, ny, nz) || 1;
  let a = nx / m;
  let b = ny / m;
  let c = nz / m;
  const front = c >= 0;
  if (!front) {
    a = -a;
    b = -b;
    c = -c;
  }
  const lam = Math.max(0, a * SUN[0] + b * SUN[1] + c * SUN[2]);
  const spec = Math.pow(Math.max(0, a * HALF[0] + b * HALF[1] + c * HALF[2]), 36);
  const earthshine = Math.max(0, -b) * 0.22;
  return [clamp(0.1 + 0.68 * lam + earthshine + 0.5 * spec, 0, 1), front];
}

/**
 * Rasterise a parallelogram given in screen px: origin (ox, oy), edges e1, e2, with depths
 * z0 + a·dz1 + b·dz2. hit(k, a, b, z) decides what to write.
 */
export function drawQuad(raster, ox, oy, e1x, e1y, e2x, e2y, hit) {
  const det = e1x * e2y - e1y * e2x;
  if (Math.abs(det) < 0.5) return;
  const inv = 1 / det;
  const xs = [ox, ox + e1x, ox + e2x, ox + e1x + e2x];
  const ys = [oy, oy + e1y, oy + e2y, oy + e1y + e2y];
  raster.scan(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (k, px, py) => {
    const qx = px - ox;
    const qy = py - oy;
    const a = (qx * e2y - qy * e2x) * inv;
    if (a < 0 || a > 1) return;
    const b = (e1x * qy - e1y * qx) * inv;
    if (b < 0 || b > 1) return;
    hit(k, a, b);
  });
}

export { M };
