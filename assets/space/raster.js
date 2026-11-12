// The space margins' ASCII raster. Same idea as the aquarium renderer (assets/aquarium):
// scenes rasterise shapes into four sub-samples per cell with a depth test, smoke goes
// into a density field, and each cell then resolves to one glyph in one of a few dozen
// fill styles, so a frame is a handful of fillStyle changes and a few thousand fillText calls.
import { clamp } from "../aquarium/math.js";

/** Sub-sample offsets inside a cell, as fractions of the cell. */
export const SUB = [0.27, 0.3, 0.75, 0.26, 0.25, 0.73, 0.73, 0.75];

/** Materials. Foreground ones are depth-tested against each other and sit over smoke. */
export const M = {
  NONE: 0,
  HULL: 1, // painted rocket skin: shaded white
  DARK: 2, // interstage, engines, grid fins, legs
  FLAME: 3, // first-stage exhaust: solid ink
  VAC: 4, // vacuum plume: thin, translucent
  PANEL: 5, // BlueBird antenna face
  SOLAR: 6, // BlueBird solar face
  BUS: 7, // satellite bus and the folded stack
  CHAR: 8, // foreground with a fixed glyph (sv = tone)
  EARTH: 9, // background from here on
  BGCHAR: 10, // background with a fixed glyph (sv = tone)
  BGINK: 11, // background with a fixed glyph in translucent ink (sv = alpha)
};
const FIRST_BG = M.EARTH;

const TONES = 32;
const INKS = 16;
const EMPTY = 255;

// Sparse glyphs on bright skin, dense glyphs in shadow, as with the sharks.
const HULL_RAMP = "`.:-=+*#%@";
const PANEL_RAMP = ":=+*#%%@";
const BUS_RAMP = ".:;=+x#%@";
const FLAME_RAMP = ":;*%#@@";
const VAC_RAMP = ".':|!";
const SMOKE_RAMP = ".,:;~=+*o%#@";
const OCEAN = "-~";
const LAND = ":;%#";
const CLOUD = "o*@";

const code = (s) => [...s].map((c) => c.charCodeAt(0));
const R_HULL = code(HULL_RAMP);
const R_PANEL = code(PANEL_RAMP);
const R_BUS = code(BUS_RAMP);
const R_FLAME = code(FLAME_RAMP);
const R_VAC = code(VAC_RAMP);
const R_SMOKE = code(SMOKE_RAMP);
const R_OCEAN = code(OCEAN);
const R_LAND = code(LAND);
const R_CLOUD = code(CLOUD);
const DOT = 46; // .
const COLON = 58; // :
const PLUS = 43;
const EQ = 61;
const DASH = 45;

const pick = (ramp, v) => ramp[clamp(Math.floor(v * ramp.length), 0, ramp.length - 1)];

export class Raster {
  dpr = 1;
  width = 0;
  height = 0;
  cw = 6;
  ch = 9;
  cols = 0;
  rows = 0;
  fontFamily = "ui-monospace, Menlo, monospace";
  styles = [];
  alpha = 1;

  constructor(canvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
  }

  /** theme: { bg, fish: ink rgb, lo, hi } (the aquarium's monochrome palettes). */
  setTheme(theme) {
    this.theme = theme;
    const { lo, hi, fish } = theme;
    this.styles = [];
    for (let l = 0; l < TONES; l++) {
      const v = l / (TONES - 1);
      const c = [0, 1, 2].map((k) => Math.round(lo[k] + (hi[k] - lo[k]) * v));
      this.styles.push(`rgb(${c[0]},${c[1]},${c[2]})`);
    }
    for (let l = 0; l < INKS; l++) {
      this.styles.push(`rgba(${fish[0]},${fish[1]},${fish[2]},${((l + 1) / INKS).toFixed(3)})`);
    }
  }

  setFontFamily(family) {
    if (family) this.fontFamily = family;
  }

  resize(width, height, dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.cw = this.cellSize || clamp(Math.round(width / 60), 6, 10);
    this.ch = Math.round(this.cw * 1.45);
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    const n = this.cols * this.rows;
    this.sz = new Float32Array(n * 4);
    this.sm = new Uint8Array(n * 4);
    this.sv = new Float32Array(n * 4);
    this.sd = new Float32Array(n * 4);
    this.sc = new Uint16Array(n * 4);
    this.dens = new Float32Array(n);
    this.cellStyle = new Uint8Array(n);
    this.cellChar = new Uint16Array(n);
    this.order = new Int32Array(n);
    this.counts = new Int32Array(TONES + INKS + 1);
  }

  begin() {
    this.sz.fill(-1e9);
    this.sm.fill(0);
    this.dens.fill(0);
    this.cellStyle.fill(EMPTY);
  }

  /**
   * Visit every sub-sample whose centre lies in the pixel box [x0,x1]×[y0,y1].
   * fn(k, px, py) gets the sub-sample index and its position in px.
   */
  scan(x0, y0, x1, y1, fn) {
    const { cw, ch, cols, rows } = this;
    const c0 = Math.max(0, Math.floor(x0 / cw));
    const c1 = Math.min(cols - 1, Math.floor(x1 / cw));
    const r0 = Math.max(0, Math.floor(y0 / ch));
    const r1 = Math.min(rows - 1, Math.floor(y1 / ch));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const base = (r * cols + c) * 4;
        for (let s = 0; s < 4; s++) {
          fn(base + s, (c + SUB[s * 2]) * cw, (r + SUB[s * 2 + 1]) * ch);
        }
      }
    }
  }

  /** Depth-tested write of one sub-sample. v = shade or intensity, d = detail, chr = fixed glyph. */
  write(k, z, mat, v, d = 0, chr = 0) {
    if (z <= this.sz[k]) return;
    this.sz[k] = z;
    this.sm[k] = mat;
    this.sv[k] = v;
    this.sd[k] = d;
    this.sc[k] = chr;
  }

  /** Add smoke density around a point (px), falling off over radius (px). */
  splat(x, y, radius, amount) {
    const { cw, ch, cols, rows, dens } = this;
    const c0 = Math.max(0, Math.floor((x - radius) / cw));
    const c1 = Math.min(cols - 1, Math.floor((x + radius) / cw));
    const r0 = Math.max(0, Math.floor((y - radius) / ch));
    const r1 = Math.min(rows - 1, Math.floor((y + radius) / ch));
    const inv = 1 / (radius * radius);
    for (let r = r0; r <= r1; r++) {
      const dy = (r + 0.5) * ch - y;
      for (let c = c0; c <= c1; c++) {
        const dx = (c + 0.5) * cw - x;
        const q = 1 - (dx * dx + dy * dy) * inv;
        if (q > 0) dens[r * cols + c] += amount * q * q;
      }
    }
  }

  /** Mark one empty cell with a glyph in translucent ink (stars, beams). */
  ink(col, row, chr, alpha) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const i = row * this.cols + col;
    if (this.cellStyle[i] !== EMPTY) return;
    this.cellStyle[i] = TONES + clamp(Math.round(alpha * INKS) - 1, 0, INKS - 1);
    this.cellChar[i] = chr;
  }

  tone(v) {
    return clamp(Math.round(v * (TONES - 1)), 0, TONES - 1);
  }

  inkStyle(a) {
    return TONES + clamp(Math.round(a * INKS) - 1, 0, INKS - 1);
  }

  /** Turn a sub-sample into a glyph + style for its cell. Edge cells (partial cover) thin out. */
  glyph(i, k, hits) {
    const m = this.sm[k];
    const v = this.sv[k];
    const d = this.sd[k];
    const fixed = this.sc[k];
    const edge = hits < 3;
    let chr = 0;
    let style = 0;
    switch (m) {
      case M.HULL:
        chr = edge ? (hits === 1 ? DOT : COLON) : pick(R_HULL, 1 - v);
        style = this.tone(v);
        break;
      case M.DARK:
        chr = edge ? COLON : v > 0.55 ? PLUS : pick(R_HULL, 0.72 + (1 - v) * 0.28);
        style = this.tone(v * 0.42);
        break;
      case M.FLAME:
        chr = edge ? (hits === 1 ? 39 : COLON) : pick(R_FLAME, v);
        style = this.inkStyle(edge ? 0.55 : 0.55 + v * 0.45);
        break;
      case M.VAC:
        chr = pick(R_VAC, v);
        style = this.inkStyle(0.12 + v * (edge ? 0.25 : 0.45));
        break;
      case M.PANEL:
        // d = 1 on the seams between folding sections.
        chr = edge ? COLON : d > 0.5 ? (v > 0.5 ? DOT : PLUS) : pick(R_PANEL, 1 - v);
        style = this.tone(d > 0.5 ? v * 0.7 + 0.2 : v);
        break;
      case M.SOLAR:
        chr = edge ? COLON : d > 0.5 ? DOT : (i / this.cols) % 2 < 1 ? EQ : DASH;
        style = this.tone(v);
        break;
      case M.BUS:
        chr = edge ? COLON : d > 0.5 ? DASH : pick(R_BUS, 1 - v);
        style = this.tone(v * 0.85);
        break;
      case M.CHAR:
      case M.BGCHAR:
        chr = fixed;
        style = this.tone(v);
        break;
      case M.BGINK:
        chr = fixed;
        style = this.inkStyle(v);
        break;
      case M.EARTH: {
        // d: 0 ocean, 1 land, 2 cloud. v: daylight.
        if (v < 0.06) return false;
        const ramp = d > 1.5 ? R_CLOUD : d > 0.5 ? R_LAND : R_OCEAN;
        chr = edge ? DOT : d > 0.5 ? pick(ramp, 1 - v) : ramp[(i * 7 + (i / this.cols | 0)) % 2];
        style = this.tone(d > 1.5 ? 0.35 + v * 0.65 : d > 0.5 ? v * 0.7 : v * 0.55);
        break;
      }
      default:
        return false;
    }
    this.cellChar[i] = chr;
    this.cellStyle[i] = style;
    return true;
  }

  /** Resolve sub-samples and smoke into one glyph per cell. */
  resolve(light = 0.6) {
    const { cols, rows, sm, sz, dens } = this;
    const n = cols * rows;
    for (let i = 0; i < n; i++) {
      let fg = -1;
      let fgHits = 0;
      let bg = -1;
      let bgHits = 0;
      const base = i * 4;
      for (let s = 0; s < 4; s++) {
        const k = base + s;
        const m = sm[k];
        if (!m) continue;
        if (m < FIRST_BG) {
          fgHits++;
          if (fg < 0 || sz[k] > sz[fg]) fg = k;
        } else {
          bgHits++;
          if (bg < 0 || sz[k] > sz[bg]) bg = k;
        }
      }
      if (fgHits >= 3 && this.glyph(i, fg, fgHits)) continue;
      const dn = dens[i];
      if (dn > 0.14) {
        this.smoke(i, dn, light);
        continue;
      }
      if (fgHits > 0 && this.glyph(i, fg, fgHits)) continue;
      if (bgHits > 0 && this.glyph(i, bg, bgHits)) continue;
      if (dn > 0.05) this.smoke(i, dn, light);
    }
  }

  /** Smoke: density sets the glyph, the density gradient against the light sets the tone. */
  smoke(i, dn, light) {
    const { cols, dens } = this;
    const t = 1 - Math.exp(-dn * 0.9);
    const c = i % cols;
    const l = c > 0 ? dens[i - 1] : 0;
    const r = c < cols - 1 ? dens[i + 1] : 0;
    const u = i >= cols ? dens[i - cols] : 0;
    // Lit from the upper left: cells whose density falls off toward the light are bright.
    const lit = clamp(0.5 + (r - l) * 0.35 * light + (dens[i + cols] ?? 0) * 0.12 - u * 0.12, 0, 1);
    this.cellChar[i] = pick(R_SMOKE, t);
    if (t < 0.3) {
      this.cellStyle[i] = this.inkStyle(0.12 + t * 0.9);
    } else {
      this.cellStyle[i] = this.tone(0.18 + lit * 0.62);
    }
  }

  draw() {
    const { ctx, dpr, cols, rows, cw, ch, cellStyle, cellChar, counts, order, styles } = this;
    const n = cols * rows;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.alpha <= 0.01) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = this.alpha;
    ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Counting sort by style so each fillStyle is set once.
    counts.fill(0);
    for (let i = 0; i < n; i++) if (cellStyle[i] !== EMPTY) counts[cellStyle[i] + 1]++;
    for (let s = 1; s < counts.length; s++) counts[s] += counts[s - 1];
    const start = counts.slice();
    for (let i = 0; i < n; i++) {
      const s = cellStyle[i];
      if (s !== EMPTY) order[start[s]++] = i;
    }
    let current = -1;
    const total = counts[counts.length - 1];
    for (let j = 0; j < total; j++) {
      const i = order[j];
      const s = cellStyle[i];
      if (s !== current) {
        current = s;
        ctx.fillStyle = styles[s];
      }
      const c = i % cols;
      const r = (i / cols) | 0;
      ctx.fillText(String.fromCharCode(cellChar[i]), (c + 0.5) * cw, (r + 0.5) * ch);
    }
    ctx.globalAlpha = 1;
  }
}
