// The left margin: a two-stage launch carrying folded BlueBirds. Pad venting, ignition into
// the flame trench, liftoff past the tower, a climb that thins the air (the plume widens and
// the stars come out), staging with a booster flip, fairing separation, and the upper stage
// leaving the top of the frame. Then the pad again.
import { clamp } from "../aquarium/math.js";
import { M } from "./raster.js";
import { Smoke, drawBody, drawPlume, rand, ease, vnoise } from "./shapes.js";

const T_IGNITE = 4.2;
const T_LIFT = T_IGNITE + 1.5;
const T_MECO = T_LIFT + 12;
const T_SEP = T_MECO + 0.9;
const T_SES = T_SEP + 1.7;
const T_FAIRING = T_SES + 3.2;
const T_LOOSE = T_FAIRING + 2.6; // the camera stops following

const CH = (s) => s.charCodeAt(0);

// Profiles in units of the stack's length (h) and the core radius (r).
const BOOSTER = [
  { h0: 0.575, h1: 0.597, r0: 1.5, r1: 1.5, inner: 1.0, mat: M.DARK }, // grid fins
  { h0: 0.0, h1: 0.13, r0: 1.04, r1: 0.94, inner: 0.8, mat: M.DARK }, // folded legs
  { h0: -0.028, h1: 0.0, r0: 0.96, r1: 0.62, mat: M.DARK }, // engine bells
  { h0: 0.0, h1: 0.6, r0: 1, r1: 1, mat: M.HULL },
  { h0: 0.6, h1: 0.662, r0: 1, r1: 1, mat: M.DARK }, // interstage
];
const UPPER = [
  { h0: 0.575, h1: 0.662, r0: 0.82, r1: 0.32, mat: M.DARK }, // vacuum nozzle
  { h0: 0.662, h1: 0.79, r0: 1, r1: 1, mat: M.HULL },
  { h0: 0.79, h1: 0.8, r0: 0.9, r1: 0.9, mat: M.DARK }, // payload adapter
  { h0: 0.8, h1: 0.94, r0: 0.98, r1: 0.98, mat: M.BUS, stripes: true }, // folded BlueBirds
];
// Fairing, measured from its own base (h = 0.79 on the stack).
const FAIRING_BASE = 0.79;
const fairing = (side) => [
  { h0: 0, h1: 0.022, r0: 1.0, r1: 1.24, mat: M.HULL, side },
  { h0: 0.022, h1: 0.115, r0: 1.24, r1: 1.24, mat: M.HULL, side },
  { h0: 0.115, h1: 0.21, r0: 1.24, r1: 0, mat: M.HULL, side, ogive: true },
];

export class LaunchScene {
  W = 0;
  H = 0;
  T = 0;
  time = 0;
  smoke = new Smoke(1800);
  stars = [];
  pointer = { x: 0, y: 0, active: false };

  resize(W, H, cw, ch) {
    const first = !this.W;
    this.W = W;
    this.H = H;
    this.cw = cw;
    this.ch = ch;
    this.r = clamp(W * 0.042, 6, 12);
    this.len = Math.min(this.r * 25, H * 0.46);
    this.X = Math.round(W * 0.42);
    this.baseY = H - Math.max(ch * 4, H * 0.1);
    this.padH = ch * 0.9;
    this.stars = [];
    const count = Math.round((W * H) / 1500);
    for (let i = 0; i < count; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * H, mag: Math.random(), par: rand(0.05, 0.35), ph: rand(0, 6.28), f: rand(0.6, 2.2) });
    }
    if (first) this.reset();
  }

  reset() {
    this.T = 0;
    this.camAlt = 0;
    this.camV = 0;
    this.smoke.clear();
    this.y = this.padH;
    this.vy = 0;
    this.throttle = 0;
    this.vac = 0;
    this.prevNozzle = this.y;
    this.booster = null;
    this.halves = null;
    this.gone = false;
    this.endAt = Infinity;
    this.announced = false;
  }

  /** Reduced motion: the frame just after liftoff, cloud and all. */
  still() {
    this.reset();
    for (let i = 0; i < (T_LIFT + 3.2) * 60; i++) this.step(1 / 60);
  }

  click(x, y) {
    if (this.T < T_IGNITE - 0.6) this.T = T_IGNITE - 0.6;
  }

  // View transforms: world (y up, metres-as-px) ↔ screen px.
  view = {
    sx: (wx) => wx,
    sy: (wy) => this.baseY - (wy - this.camAlt),
    wx: (px) => px,
    wy: (py) => this.baseY - py + this.camAlt,
  };

  step(dt) {
    this.time += dt;
    this.T += dt;
    const T = this.T;
    const { r, len, X, H } = this;

    // Throttle: spool up, a dip through max-Q, cut-off.
    if (T < T_IGNITE) this.throttle = 0;
    else if (T < T_MECO) {
      const spool = ease((T - T_IGNITE) / 0.6);
      const bucket = 1 - 0.22 * ease((T - T_LIFT - 4.5) / 1) * (1 - ease((T - T_LIFT - 7) / 1));
      this.throttle = spool * bucket;
    } else this.throttle = Math.max(0, 1 - (T - T_MECO) / 0.3);
    this.vac = T > T_SES ? ease((T - T_SES) / 0.5) : 0;

    // Ascent.
    const vMax = H * 1.6;
    if (T >= T_LIFT && T < T_MECO) {
      const a = len * (0.15 + 0.035 * (T - T_LIFT)) * (0.6 + 0.4 * this.throttle);
      this.vy = Math.min(vMax, this.vy + a * dt);
    } else if (T >= T_SES) {
      this.vy += H * 0.3 * this.vac * dt;
    }
    this.y += this.vy * dt;

    // Camera keeps the stack's middle near mid-frame, then lets it go.
    if (T < T_LOOSE) {
      const target = Math.max(0, this.y + len * 0.5 - this.baseY + H * 0.52);
      this.camV = (target - this.camAlt) / dt;
      this.camAlt = target;
    } else {
      this.camV *= Math.exp(-dt * 1.1);
      this.camAlt += this.camV * dt;
    }

    // Staging: the booster falls behind and flips.
    if (T >= T_SEP && !this.booster) {
      this.booster = { x: X, y: this.y, vx: -6, vy: this.vy - 30, ang: 0, av: 0 };
      this.puff(X, this.y + len * 0.63, 26, 70);
    }
    if (this.booster) {
      const b = this.booster;
      b.vy -= H * 0.55 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const flip = T - T_SEP;
      if (flip > 1.2 && b.ang < Math.PI) {
        b.av = Math.min(1.1, b.av + 0.9 * dt);
        b.ang = Math.min(Math.PI, b.ang + b.av * dt);
        if (Math.floor(flip * 4) % 2 === 0) {
          const top = this.localToWorld(b.x, b.y, b.ang, 0, len * 0.6);
          this.smoke.spawn({ x: top.x, y: top.y, vx: rand(30, 60) * (Math.random() < 0.5 ? -1 : 1), vy: rand(-10, 10), life: 0.9, s0: 1.5, s1: 7, amt: 0.5, drag: 2.5, turb: 6 });
        }
      }
    }

    // Fairing halves peel away.
    if (T >= T_FAIRING && !this.halves) {
      this.halves = [-1, 1].map((side) => ({ side, x: X, y: this.y + len * FAIRING_BASE, vx: side * rand(22, 30), vy: this.vy - 20, ang: 0, av: side * 0.55 }));
      for (let i = 0; i < 10; i++) this.puff(X + rand(-r, r), this.y + len * rand(0.8, 0.99), 1, 30);
    }
    if (this.halves) {
      for (const h of this.halves) {
        h.vy -= H * 0.35 * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.ang += h.av * dt;
      }
    }

    this.emit(dt);
    this.smoke.step(dt, this.time, 0);
    this.smoke.cull(this.camAlt - H * 0.3);

    // The stack has left the frame: tell the orbit margin, then wait and go again.
    if (!this.gone && T > T_LOOSE && this.view.sy(this.y) < -20) {
      this.gone = true;
      this.endAt = T + 4.5;
      if (!this.announced) {
        this.announced = true;
        this.onPayload?.();
      }
    }
    if (T > this.endAt + 1.4) this.reset();
  }

  localToWorld(x, y, ang, lx, lh) {
    const s = Math.sin(ang);
    const c = Math.cos(ang);
    return { x: x + lx * c + lh * s, y: y - lx * s + lh * c };
  }

  puff(x, y, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(0.3, 1) * speed;
      this.smoke.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(1, 1.8), s0: 2, s1: rand(8, 14), amt: 0.45, drag: 2.2, turb: 8 });
    }
  }

  emit(dt) {
    const { T, r, len, X, smoke } = this;
    const nozzle = this.y - len * 0.028;

    // Cold oxygen boiling off the tanks before ignition.
    if (T < T_IGNITE + 0.3 && Math.random() < dt * 9) {
      const side = Math.random() < 0.5 ? -1 : 1;
      smoke.spawn({ x: X + side * r, y: this.y + len * rand(0.55, 0.75), vx: side * rand(8, 22), vy: rand(-6, 2), life: rand(2, 3.4), s0: 2, s1: rand(7, 12), amt: 0.32, drag: 0.8, buoy: -5, turb: 8 });
    }

    if (this.throttle <= 0.02 || this.booster) {
      this.prevNozzle = nozzle;
      return;
    }
    const thin = ease((this.y - this.H * 0.6) / (this.H * 4.5)); // 0 at the pad, 1 near vacuum

    // Exhaust into the trench and out across the pad: the big cloud.
    const ground = clamp(1 - nozzle / (len * 0.7), 0, 1);
    if (ground > 0) {
      const n = Math.round(dt * 260 * ground * this.throttle);
      for (let i = 0; i < n; i++) {
        const dir = Math.random() < 0.72 ? 1 : -1;
        smoke.spawn({
          x: X + dir * rand(r * 0.5, r * 2.5),
          y: rand(0, this.padH * 1.5),
          vx: dir * rand(70, 210),
          vy: rand(4, 50),
          life: rand(3.2, 6.5),
          s0: rand(3, 6),
          s1: rand(16, 34),
          amt: 0.75,
          drag: 1.1,
          buoy: 15,
          turb: 34,
        });
      }
    }

    // The trail: one puff every few px of climb so it stays continuous at speed.
    const gap = 4.5;
    let y = Math.max(this.prevNozzle, nozzle - gap * 400);
    for (; y < nozzle; y += gap) {
      smoke.spawn({
        x: X + rand(-r * 0.4, r * 0.4),
        y: y - rand(0, len * 0.08),
        vx: rand(-14, 14) * (1 + thin * 3),
        vy: -rand(20, 60),
        life: rand(2.6, 4.2) * (1 - thin * 0.5),
        s0: r * 0.7,
        s1: r * (2.4 + thin * 5),
        amt: 0.95 * (1 - thin * 0.82) * this.throttle,
        drag: 1.4,
        buoy: 3,
        turb: 18,
      });
    }
    this.prevNozzle = y;
  }

  render(raster) {
    const { T, r, len, X, view, H, W } = this;
    raster.alpha = Math.min(1, T / 1.2) * (1 - clamp((T - this.endAt) / 1.4, 0, 1));
    const thin = ease((this.y - H * 0.6) / (H * 4.5));
    const t = this.time;

    // Bodies.
    if (!this.booster) {
      drawBody(raster, { x: X, y: this.y, ang: 0, r, len, z: 10, parts: BOOSTER }, view);
    } else {
      const b = this.booster;
      drawBody(raster, { x: b.x, y: b.y, ang: b.ang, r, len, z: 8, parts: BOOSTER }, view);
    }
    const upper = { x: X, y: this.y, ang: 0, r, len, z: 9, parts: UPPER };
    drawBody(raster, upper, view);
    if (!this.halves) {
      for (const side of [-1, 1]) drawBody(raster, { x: X, y: this.y + len * FAIRING_BASE, ang: 0, r, len, z: 11, parts: fairing(side) }, view);
    } else {
      for (const h of this.halves) drawBody(raster, { x: h.x, y: h.y, ang: h.ang, r, len, z: 7, parts: fairing(h.side) }, view);
    }

    // Plumes. Shock diamonds near the ground, a wide ghost of a plume up high.
    if (this.throttle > 0.02 && !this.booster) {
      drawPlume(raster, { x: X, y: this.y, ang: 0, r, len, z: 10 }, view, {
        at: -0.028,
        base: 0.95,
        length: len * (0.16 + 0.34 * thin) * this.throttle,
        spread: 0.5 + 3.5 * thin,
        diamonds: 1 - thin,
        mat: M.FLAME,
        floor: 0,
        t,
      });
    }
    if (this.vac > 0.02) {
      drawPlume(raster, upper, view, { at: 0.575, base: 0.82, length: len * 0.55 * this.vac, spread: 4.5, mat: M.VAC, t });
    }

    this.drawPad(raster);
    this.smoke.deposit(raster, (x) => x, view.sy);
    raster.resolve(0.8);
    this.drawStars(raster);
  }

  drawPad(raster) {
    const { cw, ch, view, X, r, len, T } = this;
    const groundRow = Math.floor(view.sy(0) / ch);
    if (groundRow > raster.rows + 1) return;
    const cols = raster.cols;
    // Ground: the pad line, a dithered shore, then water toward the page.
    for (let row = Math.max(0, groundRow); row < raster.rows; row++) {
      const depth = row - groundRow;
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * cw;
        const water = x > X + r * 9;
        let chr = 0;
        let a = 0;
        if (depth === 0) {
          chr = Math.abs(x - X) < r * 3.4 ? CH("=") : water ? CH("~") : CH("_");
          a = 0.7;
        } else if (water) {
          const n = vnoise(c * 0.35 + this.time * 0.6, row * 0.9, 3);
          if (n > 0.45 + depth * 0.03) {
            chr = n > 0.7 ? CH("~") : CH("-");
            a = 0.45 - depth * 0.04;
          }
        } else {
          const n = vnoise(c * 0.5, row * 0.8, 11);
          if (n > 0.38 + depth * 0.07) {
            chr = n > 0.7 ? CH(":") : CH(".");
            a = 0.55 - depth * 0.06;
          }
        }
        if (chr && a > 0.05) raster.cell(c, row, -100, M.BGINK, a, chr);
      }
    }
    // Pad mound rises a little above the line.
    const padRow = Math.floor(view.sy(this.padH * 0.5) / ch);
    for (let c = Math.floor((X - r * 2.6) / cw); c <= Math.ceil((X + r * 2.6) / cw); c++) {
      raster.cell(c, padRow, -90, M.BGCHAR, 0.3, CH("#"));
    }

    // The service tower, left of the stack: rails, cross-bracing, and an access arm that
    // swings clear before ignition.
    const tx0 = X - r * 3.6;
    const tw = r * 1.5;
    const top = len * 0.86;
    const seg = r * 1.9;
    const c0 = Math.floor((tx0 - 1) / cw);
    const c1 = Math.floor((tx0 + tw + 1) / cw);
    const rTop = Math.floor(view.sy(top) / ch);
    const rBot = Math.floor(view.sy(0) / ch) - 1;
    for (let row = Math.max(0, rTop); row <= Math.min(raster.rows - 1, rBot); row++) {
      const wy = view.wy((row + 0.5) * ch);
      const u = (wy % seg) / seg;
      for (let c = c0; c <= c1; c++) {
        const lx = (c + 0.5) * cw - tx0;
        let chr = 0;
        if (c === c0 || c === c1) chr = CH("|");
        else if (u < (ch / seg) * 0.9) chr = CH("-");
        else {
          const d1 = Math.abs(lx - u * tw);
          const d2 = Math.abs(lx - (1 - u) * tw);
          if (d1 < cw * 0.6) chr = CH("/");
          else if (d2 < cw * 0.6) chr = CH("\\");
        }
        if (chr) raster.cell(c, row, -50, M.BGCHAR, 0.12, chr);
      }
    }
    // Lightning mast cap and the arm.
    if (rTop - 1 >= 0) raster.cell(Math.round((tx0 + tw / 2) / cw), rTop - 1, -50, M.BGCHAR, 0.12, CH("^"));
    const swing = ease((T - (T_IGNITE - 1.6)) / 1.2);
    const armRow = Math.floor(view.sy(len * 0.74) / ch);
    const reach = (X - r - (tx0 + tw)) * (1 - swing);
    for (let x = tx0 + tw + cw * 0.5; x < tx0 + tw + reach; x += cw) {
      raster.cell(Math.floor(x / cw), armRow, -40, M.BGCHAR, 0.18, CH("="));
    }
  }

  drawStars(raster) {
    const { cw, ch, H, stars } = this;
    const vis = 0.45 + 0.55 * ease(this.camAlt / (H * 3));
    const speed = Math.abs(this.camV) / 60; // px per frame
    for (const s of stars) {
      const sy = (((s.y + this.camAlt * s.par) % H) + H) % H;
      const tw = 0.75 + 0.25 * Math.sin(s.ph + this.time * s.f);
      const a = vis * (0.18 + 0.6 * s.mag) * tw;
      const c = Math.floor(s.x / cw);
      const row = Math.floor(sy / ch);
      const streak = speed * s.par;
      if (streak > ch * 0.5) {
        const n = Math.min(4, Math.round(streak / ch));
        for (let k = 0; k <= n; k++) raster.ink(c, row - k, CH("|"), a * (1 - k / (n + 1)));
      } else if (streak > ch * 0.2) {
        raster.ink(c, row, CH(":"), a);
      } else {
        raster.ink(c, row, s.mag > 0.93 ? CH("*") : s.mag > 0.75 ? CH("+") : CH("."), a);
      }
    }
  }
}
