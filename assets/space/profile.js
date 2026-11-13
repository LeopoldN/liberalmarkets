// An in-article figure: Blacklift lying on its side, drawn like an exploded engineering view.
// The three stages, the payload of five folded BlueBirds and the fairing halves sit apart,
// numbered to match the caption. Every so often the stack slides together, runs a short
// static fire, and comes apart again. It is an illustration of the layout AST described
// (three stages, five satellites under one fairing), not the vehicle's real proportions.
import { clamp } from "../aquarium/math.js";
import { M } from "./raster.js";
import { drawBody, drawPlume, ease } from "./shapes.js";

const CH = (s) => s.charCodeAt(0);

// Loop, in seconds. The stack rests apart; that is also the still frame.
const T_JOIN = 6;
const JOIN = 1.8;
const T_FIRE = 8.4;
const T_CUT = 10.6;
const T_SPLIT = 11.6;
const SPLIT = 1.8;
const PERIOD = 16;

// Profiles along the stack, in units of its assembled length (h) and the core radius (r).
const STAGE_1 = [
  { h0: -0.022, h1: 0, r0: 0.92, r1: 0.6, mat: M.DARK }, // engine bells
  { h0: 0, h1: 0.085, r0: 1.06, r1: 0.96, inner: 0.82, mat: M.DARK }, // folded landing legs
  { h0: 0.41, h1: 0.424, r0: 1.5, r1: 1.5, inner: 1, mat: M.DARK }, // grid fins
  { h0: 0, h1: 0.44, r0: 1, r1: 1, mat: M.HULL, rings: 0.11 },
  { h0: 0.44, h1: 0.48, r0: 1, r1: 1, mat: M.DARK }, // interstage
];
const STAGE_2 = [
  { h0: 0.452, h1: 0.48, r0: 0.78, r1: 0.32, mat: M.DARK }, // nozzle
  { h0: 0.48, h1: 0.68, r0: 1, r1: 1, mat: M.HULL, rings: 0.1 },
  { h0: 0.68, h1: 0.708, r0: 1, r1: 1, mat: M.DARK },
];
const STAGE_3 = [
  { h0: 0.686, h1: 0.708, r0: 0.62, r1: 0.26, mat: M.DARK },
  { h0: 0.708, h1: 0.79, r0: 1, r1: 1, mat: M.HULL, rings: 0.082 },
  { h0: 0.79, h1: 0.8, r0: 0.86, r1: 0.86, mat: M.DARK }, // payload adapter
];
const BIRD_H0 = 0.802;
const BIRD_LEN = 0.023;
const BIRD_STEP = 0.0255;
const bird = (i) => [{ h0: BIRD_H0 + i * BIRD_STEP, h1: BIRD_H0 + i * BIRD_STEP + BIRD_LEN, r0: 0.9, r1: 0.9, mat: M.BUS, stripes: true }];
const fairing = (side) => [
  { h0: 0.796, h1: 0.81, r0: 1.0, r1: 1.12, mat: M.HULL, side },
  { h0: 0.81, h1: 0.93, r0: 1.12, r1: 1.12, mat: M.HULL, side },
  { h0: 0.93, h1: 1.0, r0: 1.12, r1: 0, mat: M.HULL, side, ogive: true },
];

// How far apart each piece sits when exploded, in gaps (the fairing also opens sideways).
const SLOT = { s1: 0, s2: 1, s3: 2, bird: 3, fairing: 4.3 };
const GAP = 0.045;
const SPAN = 1 + SLOT.fairing * GAP;

export class ProfileScene {
  W = 0;
  H = 0;
  time = 0;
  pointer = { x: 0, y: 0, active: false };

  resize(W, H, cw, ch) {
    this.W = W;
    this.H = H;
    this.cw = cw;
    this.ch = ch;
    this.len = (W * 0.92) / SPAN;
    this.r = Math.min(this.len * 0.055, H * 0.13);
    this.cy = H * 0.45;
    this.left = W * 0.04;
  }

  still() {
    this.time = 0;
  }

  click() {
    // Jump to the next join or split, whichever comes first.
    const t = this.time % PERIOD;
    if (t < T_JOIN) this.time += T_JOIN - t;
    else if (t > T_CUT && t < T_SPLIT) this.time += T_SPLIT - t;
  }

  step(dt) {
    this.time += dt;
  }

  /** 1 = pieces apart, 0 = stacked. */
  get spread() {
    const t = this.time % PERIOD;
    if (t < T_JOIN) return 1;
    if (t < T_JOIN + JOIN) return 1 - ease((t - T_JOIN) / JOIN);
    if (t < T_SPLIT) return 0;
    if (t < T_SPLIT + SPLIT) return ease((t - T_SPLIT) / SPLIT);
    return 1;
  }

  get throttle() {
    const t = this.time % PERIOD;
    if (t < T_FIRE || t > T_CUT + 0.5) return 0;
    if (t < T_FIRE + 0.5) return ease((t - T_FIRE) / 0.5);
    if (t > T_CUT) return 1 - (t - T_CUT) / 0.5;
    return 1;
  }

  render(raster) {
    const { len, r, cy, H, cw, ch } = this;
    const sp = this.spread;
    const gap = len * GAP * sp;
    // Stacked, the rocket sits centred; apart, it fills the width from the left.
    const x0 = this.left + (1 - sp) * ((SPAN - 1) * len) * 0.5;
    const view = { sx: (x) => x, sy: (y) => H - y, wx: (x) => x, wy: (y) => H - y };
    const wy = H - cy;
    const body = (dx, dy, parts, z) => ({ x: x0 + dx, y: wy + dy, ang: Math.PI / 2, r, len, z, parts });

    const s1 = body(SLOT.s1 * gap, 0, STAGE_1, 10);
    drawBody(raster, s1, view);
    const th = this.throttle;
    if (th > 0) {
      drawPlume(raster, s1, view, { at: -0.022, base: 0.62, length: len * 0.2 * th, spread: 0.7, diamonds: 0.8, mat: M.FLAME, t: this.time });
    }
    drawBody(raster, body(SLOT.s2 * gap, 0, STAGE_2, 10), view);
    drawBody(raster, body(SLOT.s3 * gap, 0, STAGE_3, 10), view);
    for (let i = 0; i < 5; i++) {
      // Apart, the five folded BlueBirds spread a little and drift as if weightless.
      const drift = Math.sin(this.time * 0.9 + i * 1.3) * r * 0.12 * sp;
      drawBody(raster, body((SLOT.bird + i * 0.32) * gap, drift, bird(i), 10), view);
    }
    for (const side of [-1, 1]) {
      drawBody(raster, body(SLOT.fairing * gap, -side * sp * r * 1.75, fairing(side), 12), view);
    }
    raster.resolve(0.6);

    // A faint centreline, as on a drawing.
    const row = Math.floor(cy / ch);
    for (let c = 0; c < raster.cols; c += 2) raster.ink(c, row, CH("-"), 0.16);

    // The page numbers the pieces underneath; let it fade them while the stack is together.
    if (sp !== this.lastSpread) {
      this.lastSpread = sp;
      raster.canvas.parentElement?.style.setProperty("--spread", sp.toFixed(2));
    }
  }
}
