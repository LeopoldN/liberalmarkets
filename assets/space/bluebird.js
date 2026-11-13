// BlueBirds and the Earth, shared by both space margins.
//
// A BlueBird is a square phased array made of n×n folding sections around a small bus.
// Stowed, it folds like a map: one accordion (u) collapses it into a strip and lies flat,
// a second accordion (v) collapses the strip into a block. Unfolding runs that backwards:
// the v accordion opens first, then the u accordion, as unfold goes 0 → 1.
import { clamp, hash3 } from "../aquarium/math.js";
import { M } from "./raster.js";
import { drawQuad, faceShade, fbm, ease } from "./shapes.js";

const ALPHA_MAX = (86 * Math.PI) / 180;
const BETA_MAX = (88 * Math.PI) / 180;
const CH = (s) => s.charCodeAt(0);

/** One accordion of n sections of width w at fold angle `angle` (0 = flat), centred. */
function chain(n, w, angle) {
  const X = [0];
  const Z = [0];
  for (let i = 0; i < n; i++) {
    X.push(X[i] + w * Math.cos(angle));
    Z.push(Z[i] + (i % 2 ? -1 : 1) * w * Math.sin(angle));
  }
  const cx = X[n] / 2;
  const cz = (w * Math.sin(angle)) / 2;
  return { X: X.map((v) => v - cx), Z: Z.map((v) => v - cz) };
}

function mul(p, q) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 3; k++) o[r * 3 + k] = p[r * 3] * q[k] + p[r * 3 + 1] * q[3 + k] + p[r * 3 + 2] * q[6 + k];
  }
  return o;
}

/** Spin about the panel normal, then tilt about x, then roll about y. */
export function attitude(spin, tilt, roll) {
  const cs = Math.cos(spin), ss = Math.sin(spin);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const a = [cs, -ss, 0, ss, cs, 0, 0, 0, 1];
  const b = [1, 0, 0, 0, ct, -st, 0, st, ct];
  const c = [cr, 0, sr, 0, 1, 0, -sr, 0, cr];
  return mul(c, mul(b, a));
}

export const apply = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Draw one BlueBird. s: { x, y (screen px, centre), size (px, open), depth (z order),
 * spin, tilt, roll?, ph, unfold (0..1), n? (sections per side), tiles? (antenna tiles per
 * section side) }. Writes s.hullX / s.hullY (screen bounds of the array) for beams.
 */
export function drawBlueBird(raster, s, t) {
  const n = s.n || 4;
  const tiles = s.tiles || 3;
  const u = s.unfold;
  const w = s.size / n;
  const beta = (1 - ease(u / 0.5)) * BETA_MAX;
  const alpha = (1 - ease((u - 0.5) / 0.5)) * ALPHA_MAX;
  const gamma = (alpha / ALPHA_MAX) * (Math.PI / 2);
  const cu = chain(n, w, alpha);
  const cv = chain(n, w, beta);
  // A small shudder as each accordion locks open.
  const settle = u > 0.45 && u < 1 ? Math.sin(u * 46) * 0.035 * Math.sin(Math.PI * u) : 0;
  const open = ease(u);
  const tilt = s.tilt + (0.1 * Math.sin(t * 0.21 + s.ph) + settle) * (0.3 + 0.7 * open);
  const roll = (s.roll || 0) + 0.16 * Math.sin(t * 0.15 + s.ph * 1.7) * (0.3 + 0.7 * open);
  const m = attitude(s.spin, tilt, roll);
  const cg = Math.cos(gamma);
  const sg = Math.sin(gamma);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const zBase = 1000 * s.depth;
  const cw = raster.cw;
  const seed = (s.ph * 1000) | 0;
  // Once open, a slow band of sunlight slides across the tiles.
  const sweep = ((t * 0.09 + s.ph) % 1.8) - 0.4;
  const glint = 0.32 * ease((u - 0.9) / 0.1);

  // A panel point: section (i, j), local (a, b) in 0..1.
  const point = (i, a, j, b) => {
    const su = i % 2 ? -1 : 1;
    const x0 = cu.X[i] + a * w * ca;
    const z0 = cu.Z[i] + su * a * w * sa;
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
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = point(i, 0, j, 0);
      const p1 = point(i, 1, j, 0);
      const p2 = point(i, 0, j, 1);
      const e1 = [p1[0] - p[0], p1[1] - p[1], p1[2] - p[2]];
      const e2 = [p2[0] - p[0], p2[1] - p[1], p2[2] - p[2]];
      const [shade0, front] = faceShade(...cross(e1, e2));
      // Sections are separate panels: a whisper of variation keeps them from reading as one sheet.
      const shade = clamp(shade0 + (((i * 7 + j * 13) % 5) - 2) * 0.012, 0, 1);
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
      const tileLines = L1 / tiles > cw * 1.7 && L2 / tiles > cw * 1.7;
      const outer = i === 0 || j === 0 || i === n - 1 || j === n - 1;
      drawQuad(raster, ox, oy, e1[0], -e1[1], e2[0], -e2[1], (k, a, b) => {
        const z = zBase + p[2] + a * e1[2] + b * e2[2];
        const ea = Math.min(a, 1 - a) * L1;
        const eb = Math.min(b, 1 - b) * L2;
        let d = 0;
        if (ea < 1.6 || eb < 1.6) d = 1;
        else if (tileLines) {
          const fa = (a * tiles) % 1;
          const fb = (b * tiles) % 1;
          if (Math.min(fa, 1 - fa) * (L1 / tiles) < 1.05 || Math.min(fb, 1 - fb) * (L2 / tiles) < 1.05) d = 0.3;
        }
        // The rim of the whole array reads as a frame once it is open.
        if (outer && d === 1 && open > 0.98) {
          const rim = (i === 0 && a < 0.5) || (i === n - 1 && a > 0.5) || (j === 0 && b < 0.5) || (j === n - 1 && b > 0.5);
          if (rim) d = 0.7;
        }
        let v = shade;
        if (d === 0) {
          // Each antenna tile catches the light a little differently.
          v += (hash3(i * tiles + Math.floor(a * tiles), j * tiles + Math.floor(b * tiles), seed) - 0.5) * 0.1;
        }
        if (glint > 0) {
          const g = (i + a + j + b) / (2 * n) - sweep;
          v += glint * Math.exp((-g * g) / 0.004);
        }
        raster.write(k, z, mat, clamp(v, 0, 1), d);
      });
    }
  }
  s.hullX = [minX, maxX];
  s.hullY = minY;

  // The bus: a box on the solar side of the array, with its own small radiator fins.
  const bs = s.size * (n > 4 ? 0.15 : 0.2);
  const bt = s.size * (n > 4 ? 0.07 : 0.09);
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
    const [shade] = faceShade(...cross(e1, e2));
    const L1 = Math.hypot(e1[0], e1[1]);
    drawQuad(raster, s.x + p[0], s.y - p[1], e1[0], -e1[1], e2[0], -e2[1], (k, a2, b2) => {
      const fin = L1 > cw * 4 && (a2 * 5) % 1 < 0.2 ? 1 : 0;
      raster.write(k, zBase + p[2] + a2 * e1[2] + b2 * e2[2], M.BUS, shade * 0.9, fin);
    });
  }
}

/**
 * The Earth's limb across the bottom of a margin. e: { R, cx, cy } in screen px (cy below
 * the frame), top: first row to scan. Texture comes from the rotated sphere point, so land
 * and cloud foreshorten toward the limb; the night side is left empty.
 */
export function drawEarth(raster, e, time) {
  const { R, cx, cy } = e;
  const top = cy - R;
  if (top > raster.height) return;
  const { cw, ch } = raster;
  const L = [0.78, 0.22, 0.58];
  const rot = time * 0.012;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  raster.scan(0, top - 2, raster.width, raster.height, (k, px, py) => {
    const nx = (px - cx) / R;
    const ny = (cy - py) / R;
    const d2 = nx * nx + ny * ny;
    if (d2 >= 1) return;
    const nz = Math.sqrt(1 - d2);
    const lam = nx * L[0] + ny * L[1] + nz * L[2];
    const day = clamp(lam * 1.6 + 0.02, 0, 1);
    if (day < 0.06) return;
    const X = nx * cr + nz * sr;
    const Z = -nx * sr + nz * cr;
    const cloud = fbm(X * 5.2 + time * 0.01, Z * 4.4 + ny * 3.1, 9);
    const land = fbm(X * 2.6 + 40, Z * 2.6 + ny * 1.7, 21);
    const d = cloud > 0.6 ? 2 : land > 0.56 ? 1 : 0;
    raster.write(k, -1e5, M.EARTH, day, d);
  });
  // The limb: one hairline of glyphs that follows the curve, filled down steep stretches.
  const rowAt = (x) => {
    const dx = x - cx;
    return Math.abs(dx) >= R ? null : Math.floor((cy - Math.sqrt(R * R - dx * dx) - ch * 0.35) / ch);
  };
  for (let c = 0; c < raster.cols; c++) {
    const x = (c + 0.5) * cw;
    const row = rowAt(x);
    if (row === null) continue;
    const next = rowAt(x + (x < cx ? -cw : cw)) ?? row;
    const dx = x - cx;
    const slope = (dx / Math.sqrt(R * R - dx * dx)) * (cw / ch);
    const chr = slope < -0.35 ? CH("/") : slope > 0.35 ? CH("\\") : CH("_");
    for (let r = row; r <= Math.max(row, next - 1); r++) raster.cell(c, r, -9e4, M.BGINK, 0.55, chr);
  }
}

/** Is a screen point inside the Earth's disc (plus a margin)? Keeps stars off the planet. */
export function behindEarth(e, x, y, pad = 0) {
  return Math.hypot(x - e.cx, y - e.cy) < e.R + pad;
}
