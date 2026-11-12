// The right margin: BlueBirds in low Earth orbit over the limb. An upper stage drifts in,
// lets go of a folded satellite, and backs away; the array unfolds in two stages (one
// accordion, then the other) and joins the rest, yaw-steering slowly as they cross the frame.
// Point at the margin and the nearest BlueBird beams down to you.
import { clamp } from "../aquarium/math.js";
import { M } from "./raster.js";
import { Smoke, drawBody, rand, ease } from "./shapes.js";
import { drawBlueBird, drawEarth, behindEarth } from "./bluebird.js";

const UNFOLD_SECONDS = 10;
const CH = (s) => s.charCodeAt(0);

const STAGE = [
  { h0: 0, h1: 0.3, r0: 0.85, r1: 0.32, mat: M.DARK },
  { h0: 0.3, h1: 0.93, r0: 1, r1: 1, mat: M.HULL },
  { h0: 0.93, h1: 1, r0: 0.95, r1: 0.7, mat: M.DARK },
];

export class OrbitScene {
  W = 0;
  H = 0;
  time = 0;
  sats = [];
  stage = null;
  smoke = new Smoke(300);
  stars = [];
  pointer = { x: 0, y: 0, active: false };
  nextDeploy = 1.2;

  resize(W, H, cw, ch) {
    const first = !this.W;
    this.W = W;
    this.H = H;
    this.cw = cw;
    this.ch = ch;
    this.R = Math.max(W * 0.95, 300);
    this.earthTop = H - Math.max(H * 0.15, ch * 8);
    this.ecx = W * 0.5;
    this.ecy = this.earthTop + this.R;
    this.S = clamp(W * 0.4, 72, 170);
    this.target = clamp(Math.round(H / 230), 3, 5);
    this.stars = [];
    const count = Math.round((W * H) / 1300);
    for (let i = 0; i < count; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * H, mag: Math.random(), par: rand(0.3, 1), ph: rand(0, 6.28), f: rand(0.5, 2) });
    }
    if (first) this.populate();
    for (const s of this.sats) s.y = Math.min(s.y, this.earthTop - s.size * 0.5);
  }

  /** Start with a few BlueBirds already open, so the first frame is complete. */
  populate() {
    this.sats = [];
    for (let i = 0; i < this.target - 1; i++) {
      const sat = this.makeSat(this.freeSpot(0.08, 0.92));
      sat.unfold = 1;
      sat.state = "open";
      this.sats.push(sat);
    }
  }

  makeSat({ x, y }) {
    const depth = rand(0.62, 1);
    const showBack = Math.random() < 0.45;
    return {
      x,
      y,
      depth,
      size: this.S * depth,
      vx: 0,
      vy: 0,
      drift: rand(5, 9) * depth,
      spin: rand(0, Math.PI * 2),
      spinRate: rand(0.035, 0.08) * (Math.random() < 0.5 ? -1 : 1),
      tilt: showBack ? rand(2.3, 2.55) : rand(0.6, 0.85),
      ph: rand(0, 6.28),
      unfold: 0,
      unfoldAt: Infinity,
      state: "stowed",
      hullX: [x, x],
      hullY: y,
    };
  }

  /** A point in open sky, as far as possible from the other satellites. */
  freeSpot(x0, x1) {
    const { W, H } = this;
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 24; k++) {
      const p = { x: W * rand(x0, x1), y: rand(H * 0.1, this.earthTop - this.S * 0.55) };
      let d = Infinity;
      for (const s of this.sats) d = Math.min(d, Math.hypot(s.x - p.x, (s.y - p.y) * 1.3));
      if (this.stage) d = Math.min(d, Math.hypot(this.stage.D.x - p.x, this.stage.D.y - p.y));
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** The launch margin's upper stage just left the frame: bring one in soon. */
  payloadArrived() {
    if (!this.stage) this.nextDeploy = Math.min(this.nextDeploy, this.time + 1.5);
  }

  still() {
    this.populate();
    const sat = this.makeSat(this.freeSpot(0.3, 0.6));
    sat.unfold = 0.62;
    sat.state = "open";
    this.sats.push(sat);
    this.nextDeploy = Infinity;
  }

  click() {
    if (!this.stage) this.nextDeploy = this.time;
  }

  startDeploy() {
    const D = this.freeSpot(0.3, 0.62);
    const ang = rand(2.2, 2.45); // nose down and to the right
    const dir = { x: Math.sin(ang), y: -Math.cos(ang) }; // screen-space direction of the nose
    const len = clamp(this.W * 0.5, 110, 200);
    const sat = this.makeSat(D);
    this.stage = { D, ang, dir, len, t: 0, sat, released: false, backV: 0, off: 0 };
    this.sats.push(sat);
  }

  step(dt) {
    this.time += dt;
    const { W } = this;

    if (!this.stage && this.time >= this.nextDeploy) {
      this.startDeploy();
      this.nextDeploy = Infinity;
    }

    const st = this.stage;
    if (st) {
      st.t += dt;
      const approach = ease(st.t / 6);
      const gap = st.sat.size * 0.18;
      // Distance from the release point back along the axis.
      st.off = (1 - approach) * this.H * 0.55;
      if (!st.released) {
        st.sat.x = st.D.x - st.dir.x * st.off;
        st.sat.y = st.D.y - st.dir.y * st.off;
      }
      if (!st.released && st.t >= 6.2) {
        st.released = true;
        st.sat.vx = st.dir.x * 9;
        st.sat.vy = st.dir.y * 9;
        st.sat.unfoldAt = this.time + 1.6;
        st.sat.state = "drift";
        this.rcs(st, 14);
      }
      if (st.released) {
        st.backV += 26 * dt;
        st.off += st.backV * dt;
        if (st.t < 7.4 && Math.random() < 0.5) this.rcs(st, 1);
      }
      // Stage nose sits just behind the satellite.
      const noseX = (st.released ? st.D.x : st.sat.x) - st.dir.x * (gap + (st.released ? st.off : 0));
      const noseY = (st.released ? st.D.y : st.sat.y) - st.dir.y * (gap + (st.released ? st.off : 0));
      st.nose = { x: noseX, y: noseY };
      if (st.released && st.off > this.H * 1.2) {
        this.stage = null;
      }
    }

    for (const s of this.sats) {
      if (s.state === "stowed") continue;
      if (s.unfold < 1 && this.time >= s.unfoldAt) s.unfold = Math.min(1, s.unfold + dt / UNFOLD_SECONDS);
      s.vx += (s.drift - s.vx) * (1 - Math.exp(-dt * 0.25));
      s.vy *= Math.exp(-dt * 0.35);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.spin += s.spinRate * dt * s.unfold;
    }
    this.sats = this.sats.filter((s) => s.hullX[0] < W + 10 || s.state === "stowed");

    const active = this.sats.length;
    if (!this.stage && this.nextDeploy === Infinity && active < this.target) this.nextDeploy = this.time + rand(3, 7);

    this.smoke.step(dt, this.time);
  }

  rcs(st, n) {
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const px = -st.dir.y * side;
      const py = st.dir.x * side;
      this.smoke.spawn({
        x: st.nose.x + px * 6,
        y: this.H - (st.nose.y + py * 6),
        vx: px * rand(20, 45),
        vy: -py * rand(20, 45),
        life: rand(0.7, 1.2),
        s0: 1.5,
        s1: rand(5, 9),
        amt: 0.4,
        drag: 2,
        turb: 4,
      });
    }
  }

  render(raster) {
    raster.alpha = 1;
    drawEarth(raster, this.earth, this.time);
    for (const s of this.sats) drawBlueBird(raster, s, this.time);
    const st = this.stage;
    if (st && st.nose) {
      const len = st.len;
      // Body origin is the nozzle end, `len` behind the nose along the axis.
      const bx = st.nose.x - st.dir.x * len;
      const by = st.nose.y - st.dir.y * len;
      const view = { sx: (x) => x, sy: (y) => this.H - y, wx: (x) => x, wy: (y) => this.H - y };
      drawBody(raster, { x: bx, y: this.H - by, ang: st.ang, r: len * 0.17, len, z: 2500, parts: STAGE }, view);
    }
    this.smoke.deposit(raster, (x) => x, (y) => this.H - y);
    raster.resolve(0.6);
    this.drawStars(raster);
    this.drawBeam(raster);
  }

  get earth() {
    return { R: this.R, cx: this.ecx, cy: this.ecy };
  }

  drawStars(raster) {
    const { cw, ch, W, stars, R, ecx, ecy } = this;
    for (const s of stars) {
      const x = (((s.x - this.time * 1.2 * s.par) % W) + W) % W;
      if (behindEarth(this.earth, x, s.y, ch)) continue;
      const tw = 0.7 + 0.3 * Math.sin(s.ph + this.time * s.f);
      const a = (0.16 + 0.6 * s.mag) * tw;
      raster.ink(Math.floor(x / cw), Math.floor(s.y / ch), s.mag > 0.97 ? CH("*") : s.mag > 0.9 ? CH("+") : CH("."), a);
    }
  }

  /** The nearest open BlueBird points a beam at the pointer: two dotted edges and a mark. */
  drawBeam(raster) {
    const p = this.pointer;
    if (!p.active) return;
    let best = null;
    let bestD = this.W * 0.9;
    for (const s of this.sats) {
      if (s.unfold < 1) continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (!best) return;
    const { cw, ch } = this;
    const from = [[best.hullX[0] + best.size * 0.08, best.y], [best.hullX[1] - best.size * 0.08, best.y]];
    for (const [fx, fy] of from) {
      const dist = Math.hypot(p.x - fx, p.y - fy);
      const steps = Math.floor(dist / (cw * 1.6));
      for (let k = 2; k < steps; k++) {
        const t = k / steps;
        const x = fx + (p.x - fx) * t;
        const y = fy + (p.y - fy) * t;
        const shimmer = 0.5 + 0.5 * Math.sin(this.time * 6 - k * 0.7);
        raster.inkOver(Math.floor(x / cw), Math.floor(y / ch), CH(":"), 0.28 + 0.3 * shimmer);
      }
    }
    raster.inkOver(Math.floor(p.x / cw), Math.floor(p.y / ch), CH("+"), 0.7);
  }
}
