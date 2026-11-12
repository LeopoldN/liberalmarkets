// The right margin: BlueBirds in low Earth orbit over the limb. An upper stage drifts in,
// lets go of a folded satellite, and backs away; the array unfolds in two stages (one
// accordion, then the other) and joins the rest, yaw-steering slowly as they cross the frame.
// Point at the margin and the nearest BlueBird beams down to you.
import { clamp } from "../aquarium/math.js";
import { M } from "./raster.js";
import { Smoke, drawBody, drawQuad, faceShade, fbm, rand, ease } from "./shapes.js";

const N = 4; // folding sections per side
const ALPHA_MAX = (86 * Math.PI) / 180;
const BETA_MAX = (88 * Math.PI) / 180;
const UNFOLD_SECONDS = 10;
const CH = (s) => s.charCodeAt(0);

const STAGE = [
  { h0: 0, h1: 0.3, r0: 0.85, r1: 0.32, mat: M.DARK },
  { h0: 0.3, h1: 0.93, r0: 1, r1: 1, mat: M.HULL },
  { h0: 0.93, h1: 1, r0: 0.95, r1: 0.7, mat: M.DARK },
];

/** One accordion: hinge positions for `angle` (0 flat), centred. */
function chain(w, angle) {
  const X = [0];
  const Z = [0];
  for (let i = 0; i < N; i++) {
    X.push(X[i] + w * Math.cos(angle));
    Z.push(Z[i] + (i % 2 ? -1 : 1) * w * Math.sin(angle));
  }
  const cx = X[N] / 2;
  const cz = (w * Math.sin(angle)) / 2;
  return { X: X.map((v) => v - cx), Z: Z.map((v) => v - cz) };
}

/** Rotation matrix: spin about the panel normal, then tilt about x, then roll about y. */
function attitude(spin, tilt, roll) {
  const cs = Math.cos(spin), ss = Math.sin(spin);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // Rz(spin)
  const a = [cs, -ss, 0, ss, cs, 0, 0, 0, 1];
  // Rx(tilt)
  const b = [1, 0, 0, 0, ct, -st, 0, st, ct];
  // Ry(roll)
  const c = [cr, 0, sr, 0, 1, 0, -sr, 0, cr];
  return mul(c, mul(b, a));
}

function mul(p, q) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 3; k++) o[r * 3 + k] = p[r * 3] * q[k] + p[r * 3 + 1] * q[3 + k] + p[r * 3 + 2] * q[6 + k];
  }
  return o;
}

const apply = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

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
    this.R = Math.max(W * 1.8, 560);
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
      tilt: showBack ? rand(1.95, 2.1) : rand(1.05, 1.2),
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
    const len = clamp(this.W * 0.42, 90, 170);
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
    this.drawEarth(raster);
    for (const s of this.sats) this.drawSat(raster, s);
    const st = this.stage;
    if (st && st.nose) {
      const len = st.len;
      // Body origin is the nozzle end, `len` behind the nose along the axis.
      const bx = st.nose.x - st.dir.x * len;
      const by = st.nose.y - st.dir.y * len;
      const view = { sx: (x) => x, sy: (y) => this.H - y, wx: (x) => x, wy: (y) => this.H - y };
      drawBody(raster, { x: bx, y: this.H - by, ang: st.ang, r: len * 0.1, len, z: 2500, parts: STAGE }, view);
    }
    this.smoke.deposit(raster, (x) => x, (y) => this.H - y);
    raster.resolve(0.6);
    this.drawStars(raster);
    this.drawBeam(raster);
  }

  drawEarth(raster) {
    const { R, ecx, ecy, earthTop, time, W, H, cw, ch } = this;
    const L = [0.78, 0.22, 0.58];
    const rot = time * 0.0035;
    raster.scan(0, earthTop - 2, W, H, (k, px, py) => {
      const nx = (px - ecx) / R;
      const ny = (ecy - py) / R;
      const d2 = nx * nx + ny * ny;
      if (d2 >= 1) return;
      const nz = Math.sqrt(1 - d2);
      const lam = nx * L[0] + ny * L[1] + nz * L[2];
      const day = clamp(lam * 1.6 + 0.02, 0, 1);
      if (day < 0.06) return;
      const lat = Math.asin(clamp(ny, -1, 1));
      const lon = Math.atan2(nx, nz) + rot;
      const cloud = fbm(lon * 5.5 + time * 0.004, lat * 12, 9);
      const land = fbm(lon * 2.4, lat * 4.2, 21);
      const d = cloud > 0.6 ? 2 : land > 0.57 ? 1 : 0;
      raster.write(k, -1e5, M.EARTH, day, d);
    });
    // The limb: one hairline of glyphs that follows the curve.
    for (let c = 0; c < raster.cols; c++) {
      const x = (c + 0.5) * cw;
      const dx = x - ecx;
      if (Math.abs(dx) >= R) continue;
      const y = ecy - Math.sqrt(R * R - dx * dx) - ch * 0.35;
      const slope = (dx / Math.sqrt(R * R - dx * dx)) * (cw / ch);
      const chr = slope < -0.35 ? CH("/") : slope > 0.35 ? CH("\\") : CH("_");
      raster.cell(c, Math.floor(y / ch), -9e4, M.BGINK, 0.55, chr);
    }
  }

  drawSat(raster, s) {
    const t = this.time;
    const u = s.unfold;
    const w = s.size / N;
    const beta = (1 - ease(u / 0.5)) * BETA_MAX;
    const alpha = (1 - ease((u - 0.5) / 0.5)) * ALPHA_MAX;
    const gamma = (alpha / ALPHA_MAX) * (Math.PI / 2);
    const cu = chain(w, alpha);
    const cv = chain(w, beta);
    const settle = u >= 1 ? 0 : Math.sin(u * 40) * 0.04 * u;
    const tilt = s.tilt + 0.1 * Math.sin(t * 0.21 + s.ph) + settle;
    const roll = 0.16 * Math.sin(t * 0.15 + s.ph * 1.7);
    const m = attitude(s.spin, tilt, roll);
    const cg = Math.cos(gamma);
    const sg = Math.sin(gamma);
    const zBase = 1000 * s.depth;

    // A panel point: section (i, j), local (a, b) in 0..1.
    const point = (i, a, j, b) => {
      const su = i % 2 ? -1 : 1;
      const x0 = cu.X[i] + a * w * Math.cos(alpha);
      const z0 = cu.Z[i] + su * a * w * Math.sin(alpha);
      const x1 = x0 * cg + z0 * sg;
      const zz = -x0 * sg + z0 * cg;
      const bj = (j % 2 ? -1 : 1) * beta;
      const y = cv.X[j] + b * w * Math.cos(bj) - zz * Math.sin(bj);
      const z = cv.Z[j] + b * w * Math.sin(bj) + zz * Math.cos(bj);
      return apply(m, x1, y, z);
    };

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const p = point(i, 0, j, 0);
        const p1 = point(i, 1, j, 0);
        const p2 = point(i, 0, j, 1);
        const e1 = [p1[0] - p[0], p1[1] - p[1], p1[2] - p[2]];
        const e2 = [p2[0] - p[0], p2[1] - p[1], p2[2] - p[2]];
        const nx = e1[1] * e2[2] - e1[2] * e2[1];
        const ny = e1[2] * e2[0] - e1[0] * e2[2];
        const nz = e1[0] * e2[1] - e1[1] * e2[0];
        const [shade, front] = faceShade(nx, ny, nz);
        const mat = front ? M.PANEL : M.SOLAR;
        const ox = s.x + p[0];
        const oy = s.y - p[1];
        const L1 = Math.hypot(e1[0], e1[1]);
        const L2 = Math.hypot(e2[0], e2[1]);
        for (const q of [[ox, oy], [ox + e1[0], oy - e1[1]], [ox + e2[0], oy - e2[1]], [ox + e1[0] + e2[0], oy - e1[1] - e2[1]]]) {
          minX = Math.min(minX, q[0]);
          maxX = Math.max(maxX, q[0]);
          minY = Math.min(minY, q[1]);
        }
        drawQuad(raster, ox, oy, e1[0], -e1[1], e2[0], -e2[1], (k, a, b) => {
          const z = zBase + p[2] + a * e1[2] + b * e2[2];
          const ea = Math.min(a, 1 - a) * L1;
          const eb = Math.min(b, 1 - b) * L2;
          let d = 0;
          if (ea < 1.6 || eb < 1.6) d = 1;
          else {
            const fa = (a * 3) % 1;
            const fb = (b * 3) % 1;
            if (Math.min(fa, 1 - fa) * (L1 / 3) < 1.1 || Math.min(fb, 1 - fb) * (L2 / 3) < 1.1) d = 0.3;
          }
          raster.write(k, z, mat, shade, d);
        });
      }
    }
    s.hullX = [minX, maxX];
    s.hullY = minY;

    // The bus: a box on the solar side of the array.
    const bs = s.size * 0.2;
    const bt = s.size * 0.09;
    const cz = -bt / 2 - 1;
    const faces = [
      [[-bs / 2, -bs / 2, cz + bt / 2], [bs, 0, 0], [0, bs, 0]],
      [[-bs / 2, -bs / 2, cz - bt / 2], [bs, 0, 0], [0, bs, 0]],
      [[-bs / 2, -bs / 2, cz - bt / 2], [bs, 0, 0], [0, 0, bt]],
      [[-bs / 2, bs / 2, cz - bt / 2], [bs, 0, 0], [0, 0, bt]],
      [[-bs / 2, -bs / 2, cz - bt / 2], [0, bs, 0], [0, 0, bt]],
      [[bs / 2, -bs / 2, cz - bt / 2], [0, bs, 0], [0, 0, bt]],
    ];
    for (const [o, a, b] of faces) {
      const p = apply(m, ...o);
      const e1 = apply(m, ...a);
      const e2 = apply(m, ...b);
      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      const [shade] = faceShade(nx, ny, nz);
      drawQuad(raster, s.x + p[0], s.y - p[1], e1[0], -e1[1], e2[0], -e2[1], (k, a2, b2) => {
        raster.write(k, zBase + p[2] + a2 * e1[2] + b2 * e2[2], M.BUS, shade * 0.9);
      });
    }
  }

  drawStars(raster) {
    const { cw, ch, W, stars, R, ecx, ecy } = this;
    for (const s of stars) {
      const x = (((s.x - this.time * 1.2 * s.par) % W) + W) % W;
      if (Math.hypot(x - ecx, s.y - ecy) < R + ch) continue;
      const tw = 0.7 + 0.3 * Math.sin(s.ph + this.time * s.f);
      const a = (0.16 + 0.6 * s.mag) * tw;
      raster.ink(Math.floor(x / cw), Math.floor(s.y / ch), s.mag > 0.94 ? CH("*") : s.mag > 0.78 ? CH("+") : CH("."), a);
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
        raster.inkOver(Math.floor(x / cw), Math.floor(y / ch), CH("."), 0.18 + 0.22 * shimmer);
      }
    }
    raster.inkOver(Math.floor(p.x / cw), Math.floor(p.y / ch), CH("+"), 0.7);
  }
}
