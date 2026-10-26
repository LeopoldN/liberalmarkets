// Markets page. data/markets.json holds the summary for every asset: latest close, change over each
// period, record, calendar-year returns and a year of weekly closes. The full daily history behind the
// big chart loads from data/markets/<id>.csv only when an asset is picked.

const SVG = "http://www.w3.org/2000/svg";
const DAY = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const PERIODS = [
  { key: "1d", label: "1D", long: "on the day" },
  { key: "1w", label: "1W", long: "over a week" },
  { key: "1m", label: "1M", long: "over a month" },
  { key: "ytd", label: "YTD", long: "this year" },
  { key: "1y", label: "1Y", long: "over a year" },
  { key: "5y", label: "5Y", long: "over five years" },
  { key: "10y", label: "10Y", long: "over ten years" },
];

// Where each tint step starts: percentage change for prices, basis points for yields. A move past the
// last step takes the darkest tint.
const STEPS = {
  "1d": { pct: [0.5, 1.5, 3], bp: [3, 8, 15] },
  "1w": { pct: [1, 3, 6], bp: [5, 15, 30] },
  "1m": { pct: [2, 5, 10], bp: [10, 25, 50] },
  ytd: { pct: [5, 15, 30], bp: [25, 50, 100] },
  "1y": { pct: [5, 15, 30], bp: [25, 50, 100] },
  "5y": { pct: [20, 50, 100], bp: [50, 150, 300] },
  "10y": { pct: [20, 50, 100], bp: [50, 150, 300] },
  year: { pct: [5, 15, 30], bp: [25, 50, 100] },
};

const RANGES = [
  { key: "1m", label: "1M", long: "over a month", from: (end) => shift(end, 0, -1) },
  { key: "6m", label: "6M", long: "over six months", from: (end) => shift(end, 0, -6) },
  { key: "ytd", label: "YTD", long: "this year", from: (end) => Date.UTC(new Date(end).getUTCFullYear() - 1, 11, 31) },
  { key: "1y", label: "1Y", long: "over a year", from: (end) => shift(end, -1, 0) },
  { key: "5y", label: "5Y", long: "over five years", from: (end) => shift(end, -5, 0) },
  { key: "10y", label: "10Y", long: "over ten years", from: (end) => shift(end, -10, 0) },
  { key: "max", label: "Max", long: null, from: () => -Infinity },
];
const DEFAULT_RANGE = "max";

const DOLLARS = new Set(["mega", "large", "sector", "commod", "crypto"]);
const LOG_GROUPS = new Set(["us", "world", "mega", "large", "sector", "crypto"]);

const KEYS = { period: "lm-markets-period", range: "lm-markets-range", asset: "lm-markets-asset", group: "lm-markets-group" };

// ── Helpers ─────────────────────────────────────────────────────────────

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text != null) node.textContent = text;
  return node;
}

function recall(key, allowed, fallback) {
  try {
    const v = localStorage.getItem(key);
    return allowed(v) ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

function remember(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}

/** The same day a number of years and months earlier, pinned to the month's last day if it runs short. */
function shift(t, years, months) {
  const d = new Date(t);
  const m = d.getUTCMonth() + months;
  const y = d.getUTCFullYear() + years + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, mm + 1, 0)).getUTCDate();
  return Date.UTC(y, mm, Math.min(d.getUTCDate(), last));
}

const parseDay = (s) => Date.parse(`${s}T00:00:00Z`);

function longDate(t) {
  const d = new Date(typeof t === "string" ? parseDay(t) : t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function num(v, dp) {
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// ── Formatting ──────────────────────────────────────────────────────────

const isYield = (a) => a.kind === "yield";

function decimals(a, v) {
  const m = Math.abs(v);
  if (m >= 10000) return 0;
  if (a.group === "fx") return m < 10 ? 4 : 2;
  return m >= 1 ? 2 : 4;
}

function price(a, v) {
  if (isYield(a)) return `${num(v, 2)}%`;
  return `${DOLLARS.has(a.group) ? "$" : ""}${num(v, decimals(a, v))}`;
}

/** A change as [signed number, unit]: percent for prices, basis points for yields. */
function changeParts(a, v, compact) {
  if (v == null) return ["—", ""];
  if (isYield(a)) {
    const bp = Math.round(v * 100);
    return [`${bp > 0 ? "+" : bp < 0 ? "−" : ""}${num(Math.abs(bp), 0)}`, " bp"];
  }
  const m = Math.abs(v);
  let digits;
  if (compact && m >= 1000) digits = `${num(m / 1000, 1)}k`;
  else digits = num(m, m < 10 ? 2 : m < 100 ? 1 : 0);
  const zero = Number(digits.replace(/[,k]/g, "")) === 0;
  return [`${zero ? "" : v < 0 ? "−" : "+"}${digits}`, "%"];
}

const formatChange = (a, v) => changeParts(a, v).join("");

/** Up, down or flat, judged on the number as printed so a tile never says +0.00% in green. */
function direction(a, v) {
  if (v == null) return null;
  const [digits] = changeParts(a, v);
  if (!/[1-9]/.test(digits)) return "flat";
  return v > 0 ? "up" : "down";
}

const ARROW = { up: "▲", down: "▼", flat: "■" };

function tone(a, v, stepKey) {
  const dir = direction(a, v);
  if (!dir) return "flat";
  if (dir === "flat") return "flat";
  const steps = STEPS[stepKey][isYield(a) ? "bp" : "pct"];
  const m = Math.abs(isYield(a) ? v * 100 : v);
  return `${dir}-${1 + steps.filter((s) => m >= s).length}`;
}

function words(a, v) {
  const dir = direction(a, v);
  if (!dir) return "no figure for this period";
  if (dir === "flat") return "unchanged";
  const [digits, unit] = changeParts(a, Math.abs(v));
  return `${dir} ${digits.replace("+", "")}${unit === " bp" ? " basis points" : unit}`;
}

function subtitle(a) {
  if (isYield(a)) return "Yield, per cent";
  switch (a.group) {
    case "us": return "Index level";
    case "world": return `Index level · ${a.place}`;
    case "mega":
    case "large": return `Share price, US dollars · ${a.short}`;
    case "sector": return `SPDR sector fund, US dollars · ${a.short}`;
    case "fx": return `Exchange rate · ${a.short}`;
    case "commod": return a.per ? `US dollars per ${a.per}` : "Fund price, US dollars";
    case "crypto": return `US dollars per coin · ${a.short}`;
    default: return "";
  }
}

// ── Data ────────────────────────────────────────────────────────────────

const histories = new Map();

function loadHistory(id) {
  if (!histories.has(id)) {
    histories.set(
      id,
      fetch(`data/markets/${id}.csv`, { cache: "no-cache" }).then(async (res) => {
        if (!res.ok) throw new Error(`${id}: ${res.status}`);
        return (await res.text())
          .trim()
          .split(/\r?\n/)
          .slice(1)
          .map((line) => {
            const [date, raw] = line.split(",");
            return { t: parseDay(date), v: Number(raw) };
          })
          .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
      }),
    );
  }
  return histories.get(id);
}

/** Index of the last close on or before t, or -1. */
function onOrBefore(points, t) {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

// ── The map ─────────────────────────────────────────────────────────────

const MAP_GAP = 2;      // paper between tiles
const BLOCK_GAP = 8;    // paper between groups
const LABEL_H = 22;     // each group's name sits in a strip above its tiles
const SHORT_GROUPS = { us: "US", world: "World", mega: "Biggest", large: "Household", sector: "Sectors", rates: "Yields", fx: "FX", commod: "Commod.", crypto: "Crypto" };

function periodButtons(node, initial, onPick) {
  const buttons = PERIODS.map((p) => {
    const btn = el("button", "filter", p.label);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(p.key === initial));
    btn.setAttribute("aria-label", `Change ${p.long}`);
    btn.addEventListener("click", () => {
      for (const b of buttons) b.setAttribute("aria-pressed", String(b === btn));
      onPick(p.key);
    });
    return btn;
  });
  node.replaceChildren(...buttons);
}

/** The stepped key under the map: one swatch per tint, the step edges written under the joins. */
function mapKey(node, period) {
  if (!node) return;
  const [s1, s2, s3] = STEPS[period].pct;
  const bp = STEPS[period].bp;
  const scale = el("div", "map-key__scale");
  const ramp = el("div", "map-key__ramp");
  for (const t of ["down-4", "down-3", "down-2", "down-1", "flat", "up-1", "up-2", "up-3", "up-4"]) {
    const i = el("i");
    i.dataset.tone = t;
    ramp.append(i);
  }
  const marks = el("div", "map-key__marks");
  for (const [at, text] of [[1, `−${s3}%`], [2, `−${s2}`], [3, `−${s1}`], [4.5, "0"], [6, `+${s1}`], [7, `+${s2}`], [8, `+${s3}%`]]) {
    const m = el("span", null, text);
    m.style.left = `${(at / 9) * 100}%`;
    marks.append(m);
  }
  scale.append(ramp, marks);
  scale.setAttribute("aria-hidden", "true");
  const bpNote = el("span", "map-key__bp", `Yields: ${bp[0]}, ${bp[1]} and ${bp[2]} bp`);
  bpNote.setAttribute("aria-hidden", "true");
  node.replaceChildren(
    el("span", "visually-hidden", `Colour key: green is up and red is down, darker with each step at ${s1}, ${s2} and ${s3}%, or ${bp[0]}, ${bp[1]} and ${bp[2]} basis points for yields.`),
    scale,
    bpNote,
  );
}

/**
 * Squarified treemap (Bruls, Huizing and van Wijk): fills the rectangle in strips along its shorter
 * side, adding the next item to a strip for as long as that makes the strip's worst tile squarer.
 * Values must be sorted largest first. Returns one rectangle per value, in the same order.
 */
function squarify(values, x, y, w, h) {
  const total = values.reduce((s, v) => s + v, 0);
  const areas = values.map((v) => (v / total) * w * h);
  const out = [];
  const worst = (sum, max, min, side) => Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(w, h);
    let sum = areas[i];
    let j = i + 1;
    while (j < areas.length && worst(sum + areas[j], areas[i], areas[j], side) <= worst(sum, areas[i], areas[j - 1], side)) {
      sum += areas[j];
      j++;
    }
    if (w >= h) {
      // A column down the left edge.
      const cw = sum / h;
      let cy = y;
      for (let k = i; k < j; k++) {
        const ch = areas[k] / cw;
        out.push({ x, y: cy, w: cw, h: ch });
        cy += ch;
      }
      x += cw;
      w -= cw;
    } else {
      // A row along the top.
      const rh = sum / w;
      let cx = x;
      for (let k = i; k < j; k++) {
        const rw = areas[k] / rh;
        out.push({ x: cx, y, w: rw, h: rh });
        cx += rw;
      }
      y += rh;
      h -= rh;
    }
    i = j;
  }
  return out;
}

/** Whole-pixel edges, so neighbouring tiles share a boundary and the gaps between them stay even. */
function snap(r, gap) {
  const x0 = Math.round(r.x);
  const y0 = Math.round(r.y);
  return { x: x0, y: y0, w: Math.max(0, Math.round(r.x + r.w) - x0 - gap), h: Math.max(0, Math.round(r.y + r.h) - y0 - gap) };
}

function place(node, r) {
  node.style.left = `${r.x}px`;
  node.style.top = `${r.y}px`;
  node.style.width = `${r.w}px`;
  node.style.height = `${r.h}px`;
}

const fits = (node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight;

function money(v) {
  if (v >= 1e12) return `$${num(v / 1e12, 2)} trillion`;
  if (v >= 1e9) return `$${num(v / 1e9, v < 1e10 ? 1 : 0)} billion`;
  return `$${num(v / 1e6, 0)} million`;
}

/** What a tile is sized by, in words, or null when every tile in its group is the same size. */
function sizeWords(a) {
  if (a.cap) return `Market value about ${money(a.cap)}`;
  if (a.weight) return `About ${num(a.weight, a.weight < 10 ? 1 : 0)}% of the S&P 500`;
  return null;
}

function buildMap(node, data, onPick) {
  const tip = el("div", "map__tip");
  tip.hidden = true;
  tip.setAttribute("aria-hidden", "true");
  const tiles = new Map();
  const blocks = [];
  for (const g of data.groups) {
    const assets = data.assets.filter((a) => a.group === g.id);
    if (!assets.length) continue;
    // Tile area: market value, fund weight, or one share each. An asset missing its size takes the
    // group's smallest, so it still shows.
    const raw = assets.map((a) => a.cap || a.weight || null);
    const known = raw.filter(Boolean);
    const floor = known.length ? Math.min(...known) : 1;
    const sized = assets.map((a, i) => ({ asset: a, value: raw[i] || floor })).sort((p, q) => q.value - p.value);

    const block = el("div", "map-block");
    const label = el("div", "map-block__label");
    const name = el("span", "map-block__name", g.name);
    const tally = el("span", "map-block__tally");
    label.append(name, tally);
    block.append(label);
    const members = [];
    for (const { asset: a, value } of sized) {
      const tile = el("button", "map-tile");
      tile.type = "button";
      tile.dataset.id = a.id;
      tile.setAttribute("aria-pressed", "false");
      tile.setAttribute("aria-controls", "long-view");
      const chg = el("span", "map-tile__chg");
      tile.append(el("span", "map-tile__name", a.short), chg, el("span", "map-tile__last", price(a, a.close)));
      tile.addEventListener("click", () => onPick(a.id));
      const show = () => showTip(tile);
      tile.addEventListener("pointerenter", show);
      tile.addEventListener("focus", show);
      tile.addEventListener("pointerleave", () => { if (document.activeElement !== tile) tip.hidden = true; });
      tile.addEventListener("blur", () => { tip.hidden = true; });
      block.append(tile);
      const entry = { tile, chg, asset: a, value };
      tiles.set(a.id, entry);
      members.push(entry);
    }
    node.append(block);
    blocks.push({ group: g, block, label, name, tally, members });
  }
  node.append(tip);
  node.removeAttribute("aria-busy");

  const map = { tiles, blocks, period: "1d", width: 0 };

  function showTip(tile) {
    const { asset: a } = tiles.get(tile.dataset.id);
    const v = a.periods?.[map.period];
    const label = PERIODS.find((p) => p.key === map.period);
    const size = sizeWords(a);
    tip.replaceChildren(
      el("strong", null, a.name),
      el("span", null, `${price(a, a.close)} · ${words(a, v)}${v == null ? "" : ` ${label.long}`}`),
      ...(size ? [el("span", "map__tip-size", size)] : []),
    );
    tip.hidden = false;
    const box = node.getBoundingClientRect();
    const r = tile.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const left = Math.min(Math.max(0, r.left - box.left + r.width / 2 - tw / 2), box.width - tw);
    let top = r.top - box.top - th - 6;
    if (top < 0) top = r.bottom - box.top + 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  map.layout = function layout() {
    const W = node.clientWidth;
    if (!W) return;
    map.width = W;
    // Wide screens get a landscape map; a phone gets a tall one so its tiles stay big enough to read.
    const H = Math.round(W < 560 ? W * 1.4 : W * 0.75);
    node.style.height = `${H}px`;
    // Laying out in a rectangle one gap larger, then taking the gap off every tile's right and bottom,
    // leaves paper between tiles and none at the map's outer edge.
    const rects = squarify(blocks.map((b) => b.members.length), 0, 0, W + BLOCK_GAP, H + BLOCK_GAP).map((r) => snap(r, BLOCK_GAP));
    blocks.forEach((b, i) => {
      const r = rects[i];
      place(b.label, { x: r.x, y: r.y, w: r.w, h: LABEL_H });
      b.name.textContent = b.group.name;
      b.tally.hidden = false;
      if (!fits(b.label)) b.tally.hidden = true;
      if (!fits(b.label)) b.name.textContent = SHORT_GROUPS[b.group.id] || b.group.name;
      const inner = squarify(b.members.map((m) => m.value), r.x, r.y + LABEL_H, r.w + MAP_GAP, r.h - LABEL_H + MAP_GAP).map((t) => snap(t, MAP_GAP));
      b.members.forEach((m, k) => {
        const t = inner[k];
        place(m.tile, t);
        m.tile.dataset.size = t.w >= 190 && t.h >= 130 ? "xl" : t.w >= 120 && t.h >= 84 ? "l" : "m";
      });
    });
    fitText();
  };

  /** Shows as much of each tile's text as fits whole: price, then change, then name are dropped in turn. */
  function fitText() {
    for (const { tile } of tiles.values()) {
      let level = 3;
      tile.dataset.fit = String(level);
      while (level > 0 && !fits(tile)) tile.dataset.fit = String(--level);
    }
  }

  map.paint = function paint(period) {
    map.period = period;
    const label = PERIODS.find((p) => p.key === period);
    for (const { tile, chg, asset } of tiles.values()) {
      const v = asset.periods?.[period];
      tile.dataset.tone = tone(asset, v, period);
      tile.classList.toggle("is-missing", v == null);
      const [digits, unit] = changeParts(asset, v, true);
      chg.replaceChildren(digits);
      if (unit) chg.append(el("small", null, unit));
      const size = sizeWords(asset);
      tile.setAttribute("aria-label", `${asset.name}: ${price(asset, asset.close)}, ${words(asset, v)}${v == null ? "" : ` ${label.long}`}${size ? `. ${size}` : ""}`);
    }
    for (const b of blocks) {
      let up = 0;
      let down = 0;
      for (const { asset } of b.members) {
        const dir = direction(asset, asset.periods?.[period]);
        if (dir === "up") up++;
        if (dir === "down") down++;
      }
      b.tally.textContent = `${up} up · ${down} down`;
    }
    tip.hidden = true;
    if (map.width) {
      // The change has a new width, so the text is fitted again; the tiles themselves stay put.
      for (const b of blocks) {
        b.tally.hidden = false;
        b.name.textContent = b.group.name;
        if (!fits(b.label)) b.tally.hidden = true;
        if (!fits(b.label)) b.name.textContent = SHORT_GROUPS[b.group.id] || b.group.name;
      }
      fitText();
    }
  };

  let frame = 0;
  new ResizeObserver(() => {
    if (node.clientWidth === map.width) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(map.layout);
  }).observe(node);
  // Fonts change text widths, so the fit is checked again once they arrive.
  document.fonts?.ready.then(() => { if (map.width) map.paint(map.period); });

  return map;
}

// ── The long view ───────────────────────────────────────────────────────

function niceStep(span, count) {
  const rough = span / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const f = rough / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

function linearTicks(lo, hi, count) {
  if (lo === hi) { lo -= Math.abs(lo) * 0.05 || 1; hi += Math.abs(hi) * 0.05 || 1; }
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return { ticks, step, lo: start, hi: end };
}

/** Gridlines at 1, 10, 100… on a log scale, or at 1, 2 and 5 of each power when that is too sparse. */
function logTicks(lo, hi) {
  const make = (set) => {
    const out = [];
    for (let p = Math.floor(Math.log10(lo)); p <= Math.ceil(Math.log10(hi)); p++) {
      for (const m of set) {
        const v = m * 10 ** p;
        if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
      }
    }
    return out;
  };
  const ones = make([1]);
  if (ones.length >= 4) return ones;
  const more = make([1, 2, 5]);
  if (more.length > 8) return ones;
  if (more.length >= 3) return more;
  return make([1, 1.5, 2, 3, 5, 7]);
}

function tickLabel(a, v, step) {
  let dp = 0;
  if (step != null) while (dp < 4 && Math.abs(Math.round(step * 10 ** dp) - step * 10 ** dp) > 1e-6) dp++;
  else dp = v < 1 ? (v < 0.1 ? 2 : 1) : 0;
  return `${num(v, dp)}${isYield(a) ? "%" : ""}`;
}

/** Bottom-axis ticks: days, months or years, whichever is finest without the labels touching. */
function timeTicks(t0, t1, room) {
  const span = (t1 - t0) / DAY;
  const options = [
    { days: 7, unit: "day", step: 7 },
    { days: 14, unit: "day", step: 14 },
    { days: 30, unit: "month", step: 1 },
    { days: 61, unit: "month", step: 2 },
    { days: 91, unit: "month", step: 3 },
    { days: 182, unit: "month", step: 6 },
    ...[1, 2, 5, 10, 20, 25, 50].map((s) => ({ days: 365.25 * s, unit: "year", step: s })),
  ];
  const pick = options.find((o) => span / o.days <= room) || options[options.length - 1];
  const out = [];
  const a = new Date(t0);
  if (pick.unit === "year") {
    for (let y = Math.ceil(a.getUTCFullYear() / pick.step) * pick.step; ; y += pick.step) {
      const t = Date.UTC(y, 0, 1);
      if (t > t1) break;
      if (t >= t0) out.push({ t, label: String(y) });
    }
  } else if (pick.unit === "month") {
    for (let i = 0; ; i++) {
      const t = Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + i, 1);
      if (t > t1) break;
      const d = new Date(t);
      if (t < t0 || d.getUTCMonth() % pick.step) continue;
      out.push({ t, label: d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : MONTHS[d.getUTCMonth()] });
    }
  } else {
    const days = pick.step === 7 ? [1, 8, 15, 22] : [1, 15];
    for (let i = 0; ; i++) {
      const base = Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + i, 1);
      if (base > t1) break;
      for (const day of days) {
        const t = base + (day - 1) * DAY;
        if (t < t0 || t > t1) continue;
        const d = new Date(t);
        out.push({ t, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` });
      }
    }
  }
  return out;
}

let measurer;
function textWidth(text, font) {
  measurer ||= document.createElement("canvas").getContext("2d");
  measurer.font = font;
  return measurer.measureText(text).width;
}

/** Keeps the low and the high of each pixel-wide bucket, so a long history draws fast and keeps its spikes. */
function thin(points, buckets) {
  if (points.length <= buckets * 2) return points;
  const size = points.length / buckets;
  const out = [];
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(points.length, Math.floor((b + 1) * size));
    let lo = start;
    let hi = start;
    for (let i = start; i < end; i++) {
      if (points[i].v < points[lo].v) lo = i;
      if (points[i].v > points[hi].v) hi = i;
    }
    if (lo === hi) out.push(points[lo]);
    else out.push(points[Math.min(lo, hi)], points[Math.max(lo, hi)]);
  }
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function rangeWindow(points, key) {
  const range = RANGES.find((r) => r.key === key);
  const end = points[points.length - 1].t;
  const from = range.from(end);
  const i = onOrBefore(points, from);
  return points.slice(Math.max(0, i));
}

function useLog(a, key, lo, hi) {
  return LOG_GROUPS.has(a.group) && ["5y", "10y", "max"].includes(key) && lo > 0 && hi / lo > 2.5;
}

function createView(root, data) {
  const figure = root.querySelector("[data-view]");
  const plot = root.querySelector("[data-view-plot]");
  const tip = plot.querySelector(".chart__tip");
  const title = root.querySelector("[data-view-title]");
  const sub = root.querySelector("[data-view-sub]");
  const source = root.querySelector("[data-view-source]");
  const rangesNode = root.querySelector("[data-view-ranges]");
  const factsNode = root.querySelector("[data-facts]");
  const picker = root.querySelector("[data-view-asset]");
  const byId = new Map(data.assets.map((a) => [a.id, a]));

  const state = { asset: null, points: null, range: recall(KEYS.range, (v) => RANGES.some((r) => r.key === v), DEFAULT_RANGE), geometry: null, active: null, token: 0 };
  const listeners = [];

  // Asset picker, grouped the same way as the map.
  for (const g of data.groups) {
    const og = el("optgroup");
    og.label = g.name;
    for (const a of data.assets.filter((x) => x.group === g.id)) {
      const opt = el("option", null, a.name);
      opt.value = a.id;
      og.append(opt);
    }
    if (og.children.length) picker.append(og);
  }
  picker.addEventListener("change", () => select(picker.value, { animate: true }));

  const rangeButtons = RANGES.map((r) => {
    const btn = el("button", "filter", r.label);
    btn.type = "button";
    btn.dataset.range = r.key;
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      state.range = r.key;
      remember(KEYS.range, r.key);
      syncRanges();
      render(true);
    });
    return btn;
  });
  rangesNode.replaceChildren(...rangeButtons);

  function syncRanges() {
    const first = state.points?.[0]?.t;
    const end = state.points?.[state.points.length - 1]?.t;
    for (const btn of rangeButtons) {
      const r = RANGES.find((x) => x.key === btn.dataset.range);
      // A range that reaches back before the data starts would only repeat Max.
      btn.disabled = first != null && r.key !== "max" && r.from(end) < first;
      btn.setAttribute("aria-pressed", String(r.key === state.range));
    }
    if (rangeButtons.find((b) => b.dataset.range === state.range)?.disabled) {
      state.range = "max";
      syncRanges();
    }
  }

  function draw() {
    const a = state.asset;
    const all = state.points;
    const width = Math.round(plot.clientWidth);
    if (!a || !all || !width) return;
    const narrow = width < 440;
    const height = narrow ? 250 : 340;
    const shown = rangeWindow(all, state.range);
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of shown) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    const log = useLog(a, state.range, lo, hi);

    let ticks;
    let step = null;
    let ya;
    let yb;
    if (log) {
      const pad = (Math.log10(hi) - Math.log10(lo)) * 0.04;
      ya = 10 ** (Math.log10(lo) - pad);
      yb = 10 ** (Math.log10(hi) + pad);
      ticks = logTicks(ya, yb);
    } else {
      const y = linearTicks(lo, hi, narrow ? 4 : 5);
      ticks = y.ticks;
      step = y.step;
      ya = y.lo;
      yb = y.hi;
    }
    const labels = ticks.map((v) => tickLabel(a, v, step));
    const tickFont = "400 11px Geist Mono, ui-monospace, monospace";
    const gutter = Math.ceil(Math.max(...labels.map((l) => textWidth(l, tickFont)))) + 10;
    const top = 18;
    const bottom = height - 24;
    const left = gutter;
    const right = width - 8;
    const t0 = shown[0].t;
    const t1 = shown[shown.length - 1].t;
    const x = (t) => left + ((t - t0) / (t1 - t0 || 1)) * (right - left);
    const scaleY = log ? (v) => Math.log10(v) : (v) => v;
    const sa = scaleY(ya);
    const sb = scaleY(yb);
    const yv = (v) => bottom - ((scaleY(v) - sa) / (sb - sa || 1)) * (bottom - top);

    const root = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart__svg", "aria-hidden": "true" });

    ticks.forEach((v, i) => {
      const yy = Math.round(yv(v)) + 0.5;
      root.append(svg("line", { x1: left, x2: right, y1: yy, y2: yy, class: "chart__grid" }));
      root.append(svg("text", { x: left - 10, y: yy, class: "chart__tick", "text-anchor": "end", "dominant-baseline": "middle" }, labels[i]));
    });
    root.append(svg("line", { x1: left, x2: right, y1: bottom + 0.5, y2: bottom + 0.5, class: "chart__zero" }));

    let lastEdge = -Infinity;
    for (const tick of timeTicks(t0, t1, Math.max(2, Math.floor((right - left) / 64)))) {
      const xx = Math.round(x(tick.t)) + 0.5;
      const w = textWidth(tick.label, tickFont);
      if (xx + 4 + w > width || xx < lastEdge + 8) continue;
      lastEdge = xx + 4 + w;
      root.append(svg("line", { x1: xx, x2: xx, y1: bottom, y2: bottom + 5, class: "chart__axis-tick" }));
      root.append(svg("text", { x: xx + 4, y: bottom + 17, class: "chart__tick" }, tick.label));
    }

    // The record close, if it falls inside the window: a faint rule across and a ring on the day.
    const recordT = parseDay(a.highDate);
    const marks = svg("g");
    if (recordT >= t0 && recordT <= t1) {
      const ry = Math.round(yv(a.high)) + 0.5;
      const rx = x(recordT);
      marks.append(svg("line", { x1: left, x2: right, y1: ry, y2: ry, class: "view__record-line" }));
      const label = `Record ${price(a, a.high)}`;
      const lw = textWidth(label, "500 11px Geist, sans-serif");
      const atRight = rx + 8 + lw <= right;
      marks.append(svg("text", { x: atRight ? rx + 8 : rx - 8, y: Math.max(top - 4, ry - 7), class: "view__record-label", "text-anchor": atRight ? "start" : "end" }, label));
    }

    const line = thin(shown, Math.max(60, right - left));
    const d = line.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${yv(p.v).toFixed(1)}`).join("");
    root.append(svg("path", { d: `${d}L${right},${bottom}L${left},${bottom}Z`, class: "view__area" }));
    root.append(marks);
    root.append(svg("path", { d, class: "chart__line" }));
    if (recordT >= t0 && recordT <= t1) root.append(svg("circle", { cx: x(recordT), cy: yv(a.high), r: 3.5, class: "view__record" }));
    const last = shown[shown.length - 1];
    root.append(svg("circle", { cx: x(last.t), cy: yv(last.v), r: 4, class: "chart__end" }));

    const cross = svg("line", { y1: top - 4, y2: bottom, class: "chart__cross" });
    const dot = svg("circle", { r: 4, class: "chart__dot" });
    root.append(cross, dot);

    state.svgEl?.remove();
    plot.prepend(root);
    state.svgEl = root;
    state.geometry = { shown, x, yv, cross, dot, left, right, width };

    const base = shown[0];
    plot.setAttribute(
      "aria-label",
      `${a.name}, daily closes from ${longDate(base.t)} to ${longDate(last.t)}${log ? " on a log scale" : ""}. ` +
        `${price(a, base.v)} at the start, ${price(a, last.v)} at the latest close, ${words(a, change(a, base.v, last.v))}.`,
    );
    source.textContent =
      `Source: ${a.source}. Daily closes${log ? ". Log scale: equal heights are equal percentage moves" : ""}. Latest ${longDate(last.t)}.`;
    if (state.active != null) show(Math.min(state.active, shown.length - 1));
  }

  function show(i) {
    const g = state.geometry;
    if (!g) return;
    const p = g.shown[i];
    state.active = i;
    const xx = g.x(p.t);
    g.cross.setAttribute("x1", xx);
    g.cross.setAttribute("x2", xx);
    g.dot.setAttribute("cx", xx);
    g.dot.setAttribute("cy", g.yv(p.v));
    tip.replaceChildren(el("strong", null, price(state.asset, p.v)), el("span", null, longDate(p.t)));
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.transform = `translateX(${Math.max(0, Math.min(g.width - tw, xx - tw / 2))}px)`;
    plot.classList.add("is-hover");
  }

  function hide() {
    state.active = null;
    tip.hidden = true;
    plot.classList.remove("is-hover");
  }

  function nearest(clientX) {
    const g = state.geometry;
    const px = clientX - plot.getBoundingClientRect().left;
    const t = g.shown[0].t + ((px - g.left) / (g.right - g.left || 1)) * (g.shown[g.shown.length - 1].t - g.shown[0].t);
    const i = Math.max(0, onOrBefore(g.shown, t));
    const j = Math.min(g.shown.length - 1, i + 1);
    return Math.abs(g.shown[j].t - t) < Math.abs(g.shown[i].t - t) ? j : i;
  }

  plot.addEventListener("pointermove", (e) => state.geometry && show(nearest(e.clientX)));
  plot.addEventListener("pointerleave", hide);
  plot.addEventListener("focus", () => state.geometry && show(state.geometry.shown.length - 1));
  plot.addEventListener("blur", hide);
  plot.addEventListener("keydown", (e) => {
    const g = state.geometry;
    if (!g) return;
    const n = g.shown.length;
    // Shift moves by a tenth of the window, so a long history is quick to cross.
    const jump = e.shiftKey ? Math.max(1, Math.round(n / 10)) : 1;
    const step = { ArrowLeft: -jump, ArrowRight: jump }[e.key];
    if (step) state.active = Math.max(0, Math.min(n - 1, (state.active ?? n - 1) + step));
    else if (e.key === "Home") state.active = 0;
    else if (e.key === "End") state.active = n - 1;
    else if (e.key === "Escape") return hide();
    else return;
    e.preventDefault();
    show(state.active);
  });

  let lastWidth = 0;
  let frame = 0;
  new ResizeObserver(() => {
    if (plot.clientWidth === lastWidth) return;
    lastWidth = plot.clientWidth;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }).observe(plot);

  function drawIn() {
    if (reducedMotion() || !state.svgEl) return;
    const path = state.svgEl.querySelector(".chart__line");
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 700, easing: "cubic-bezier(.3, .7, .2, 1)" })
      .finished.then(() => { path.style.strokeDasharray = ""; }, () => {});
    for (const mark of state.svgEl.querySelectorAll(".view__area, .chart__end, .view__record, .view__record-label")) {
      mark.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: 800 });
    }
  }

  function fact(term, value, note, cls) {
    const div = el("div", cls);
    const dd = el("dd");
    if (value instanceof Node) dd.append(value);
    else dd.textContent = value;
    if (note) dd.append(el("small", null, note));
    div.append(el("dt", null, term), dd);
    return div;
  }

  function changeNode(a, v) {
    const frag = document.createDocumentFragment();
    const dir = direction(a, v);
    if (dir && dir !== "flat") frag.append(el("span", `is-${dir}`, `${ARROW[dir]} `));
    frag.append(formatChange(a, v));
    return frag;
  }

  function renderFacts() {
    const a = state.asset;
    const shown = rangeWindow(state.points, state.range);
    const base = shown[0];
    const last = shown[shown.length - 1];
    const r = RANGES.find((x) => x.key === state.range);
    const items = [
      fact("Last close", price(a, a.close), longDate(a.date)),
      fact(r.long ? `Change ${r.long}` : `Change since ${new Date(base.t).getUTCFullYear()}`, changeNode(a, change(a, base.v, last.v)), `from ${price(a, base.v)} on ${longDate(base.t)}`),
      fact("Record close", price(a, a.high), longDate(a.highDate)),
    ];
    if (isYield(a)) {
      items.push(fact("Record low", price(a, a.low), longDate(a.lowDate)));
    } else {
      const below = a.fromHigh == null || a.fromHigh > -0.005 ? "At a record" : `${num(-a.fromHigh, Math.abs(a.fromHigh) < 10 ? 1 : 0)}% below`;
      items.push(fact("From the record", below, below === "At a record" ? "set on the latest close" : "the record close"));
    }
    if (a.hi52 != null && a.lo52 != null) {
      const span = el("div");
      const bar = el("div", "span52");
      const mark = el("i");
      const pos = a.hi52 > a.lo52 ? (a.close - a.lo52) / (a.hi52 - a.lo52) : 0.5;
      mark.style.left = `${Math.max(0, Math.min(1, pos)) * 100}%`;
      bar.append(mark);
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `Last close ${price(a, a.close)}, ${Math.round(pos * 100)}% of the way from the 52-week low to the high`);
      const ends = el("div", "span52__ends");
      ends.append(el("span", null, price(a, a.lo52)), el("span", null, price(a, a.hi52)));
      span.append(bar, ends);
      items.push(fact("52-week range", span, null, "facts__wide"));
    }
    if (a.cagr != null) {
      const [digits] = changeParts(a, a.cagr);
      items.push(fact("Annual return", `${digits}% a year`, `since ${a.first.slice(0, 4)}, before dividends`));
    }
    items.push(fact("Data since", a.first.slice(0, 4), `${num(a.days || state.points.length, 0)} daily closes`));
    factsNode.replaceChildren(...items);
  }

  function render(animate) {
    if (!state.points) return;
    draw();
    renderFacts();
    if (animate) drawIn();
  }

  async function select(id, { animate } = {}) {
    const a = byId.get(id);
    if (!a) return false;
    const token = ++state.token;
    state.asset = a;
    picker.value = id;
    title.textContent = a.name;
    sub.textContent = subtitle(a);
    remember(KEYS.asset, id);
    for (const fn of listeners) fn(id);
    figure.setAttribute("aria-busy", "true");
    try {
      const points = await loadHistory(id);
      if (token !== state.token) return true;
      if (points.length < 2) throw new Error("too short");
      state.points = points;
      state.active = null;
      hide();
      syncRanges();
      render(animate);
    } catch (err) {
      if (token !== state.token) return true;
      state.points = null;
      state.svgEl?.remove();
      state.svgEl = null;
      factsNode.replaceChildren();
      source.textContent = `This chart couldn’t load its prices (data/markets/${id}.csv).`;
    } finally {
      if (token === state.token) figure.removeAttribute("aria-busy");
    }
    return true;
  }

  return { select, onSelect: (fn) => listeners.push(fn), has: (id) => byId.has(id), current: () => state.asset?.id };
}

function change(a, from, to) {
  return isYield(a) ? to - from : (to / from - 1) * 100;
}

// ── Year by year ────────────────────────────────────────────────────────

function createYears(root, data, onPick) {
  const section = root.querySelector("#years");
  const table = root.querySelector("[data-years]");
  const wrap = root.querySelector("[data-years-wrap]");
  const groupsNode = root.querySelector("[data-years-groups]");
  if (!table) return;
  const latest = data.assets.reduce((m, a) => (a.date > m ? a.date : m), "");
  const now = Number(latest.slice(0, 4));
  const years = Array.from({ length: 20 }, (_, i) => now - 19 + i);
  const tip = el("div", "chart__tip years__tip");
  tip.hidden = true;
  section.append(tip);

  const initial = recall(KEYS.group, (v) => data.groups.some((g) => g.id === v), data.groups[0].id);
  const buttons = data.groups.map((g) => {
    const btn = el("button", "filter", g.name);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(g.id === initial));
    btn.addEventListener("click", () => {
      for (const b of buttons) b.setAttribute("aria-pressed", String(b === btn));
      remember(KEYS.group, g.id);
      render(g.id);
    });
    return btn;
  });
  groupsNode.replaceChildren(...buttons);

  function cellText(a, v) {
    if (isYield(a)) {
      const bp = Math.round(v * 100);
      return `${bp > 0 ? "+" : bp < 0 ? "−" : ""}${Math.abs(bp)}`;
    }
    const m = Math.abs(v);
    const r = Math.round(m);
    const digits = r >= 1000 ? `${Math.round(m / 1000)}k` : String(r);
    return `${r === 0 ? "" : v < 0 ? "−" : "+"}${digits}`;
  }

  function showTip(cell) {
    const { id, year } = cell.dataset;
    const a = data.assets.find((x) => x.id === id);
    const v = a.years[year];
    tip.replaceChildren(
      el("strong", null, formatChange(a, v)),
      el("span", null, `${a.short} · ${Number(year) === now ? `${year} to ${longDate(a.date).replace(/ \d{4}$/, "")}` : year}`),
    );
    tip.hidden = false;
    const box = section.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    const left = Math.max(0, Math.min(box.width - tip.offsetWidth, r.left - box.left + r.width / 2 - tip.offsetWidth / 2));
    tip.style.transform = `translate(${left}px, ${r.top - box.top - tip.offsetHeight - 6}px)`;
  }

  function render(groupId) {
    const assets = data.assets.filter((a) => a.group === groupId);
    const cols = el("colgroup");
    cols.append(el("col", "years__label"));
    for (const _ of years) cols.append(el("col"));
    const head = el("thead");
    const hr = el("tr");
    const corner = el("th");
    corner.append(el("span", "visually-hidden", "Asset"));
    hr.append(corner);
    for (const y of years) {
      const th = el("th", y === now ? "is-now" : null, y === now ? "YTD" : `’${String(y).slice(2)}`);
      th.scope = "col";
      th.title = y === now ? `${y} to date` : String(y);
      hr.append(th);
    }
    head.append(hr);
    const body = el("tbody");
    for (const a of assets) {
      const tr = el("tr");
      const th = el("th", null, a.short);
      th.scope = "row";
      th.title = a.name;
      tr.append(th);
      for (const y of years) {
        const v = a.years?.[y];
        if (v == null) {
          const td = el("td", "is-empty");
          td.append(el("span", "visually-hidden", "no data"));
          tr.append(td);
          continue;
        }
        const td = el("td", y === now ? "is-now" : null, cellText(a, v));
        td.dataset.tone = tone(a, v, "year");
        td.dataset.id = a.id;
        td.dataset.year = String(y);
        td.tabIndex = -1;
        td.setAttribute("aria-label", `${a.name}, ${y === now ? `${y} to date` : y}: ${formatChange(a, v)}`);
        tr.append(td);
      }
      body.append(tr);
    }
    table.replaceChildren(cols, head, body);
    const first = table.querySelector("td[data-id]");
    if (first) first.tabIndex = 0;
    // Newest years sit at the right, so a narrow screen starts scrolled to them.
    wrap.scrollLeft = wrap.scrollWidth;
  }

  table.addEventListener("pointerover", (e) => {
    const cell = e.target.closest("td[data-id]");
    if (cell) showTip(cell);
  });
  table.addEventListener("pointerleave", () => (tip.hidden = true));
  table.addEventListener("focusin", (e) => {
    const cell = e.target.closest("td[data-id]");
    if (!cell) return;
    for (const c of table.querySelectorAll('td[tabindex="0"]')) if (c !== cell) c.tabIndex = -1;
    cell.tabIndex = 0;
    showTip(cell);
  });
  table.addEventListener("focusout", () => (tip.hidden = true));
  table.addEventListener("click", (e) => {
    const cell = e.target.closest("td[data-id]");
    if (cell) onPick(cell.dataset.id);
  });
  // One tab stop for the grid; arrow keys move between squares, Enter charts the asset.
  table.addEventListener("keydown", (e) => {
    const cell = e.target.closest("td[data-id]");
    if (!cell) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(cell.dataset.id); return; }
    const rows = [...table.tBodies[0].rows];
    const r = rows.indexOf(cell.parentElement);
    const c = cell.cellIndex;
    const move = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!move) return;
    e.preventDefault();
    let nr = r + move[0];
    let nc = c + move[1];
    while (rows[nr]?.cells[nc] && !rows[nr].cells[nc].dataset.id) { nr += move[0]; nc += move[1]; }
    rows[nr]?.cells[nc]?.focus();
  });

  render(initial);
}

// ── Every price ─────────────────────────────────────────────────────────

function spark(values) {
  const box = el("div", "spark");
  if (!values || values.length < 2) return box;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = (i) => (i / (values.length - 1)) * 100;
  const y = (v) => 24 - ((v - lo) / (hi - lo)) * 22;
  const s = svg("svg", { viewBox: "0 0 100 26", preserveAspectRatio: "none", "aria-hidden": "true" });
  s.append(svg("path", { d: values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(""), class: "spark__line" }));
  const end = el("span", "spark__end");
  end.style.left = "100%";
  end.style.top = `${(y(values[values.length - 1]) / 26) * 100}%`;
  box.append(s, end);
  return box;
}

const COLUMNS = [
  { key: "name", label: "Name", sort: (a) => a.name.toLowerCase(), dir: "ascending" },
  { key: "close", label: "Last", num: true },
  { key: "1d", label: "1D", num: true, sort: (a) => a.periods?.["1d"] },
  { key: "ytd", label: "YTD", num: true, sort: (a) => a.periods?.ytd },
  { key: "1y", label: "1Y", num: true, sort: (a) => a.periods?.["1y"] },
  { key: "fromHigh", label: "From record", num: true, sort: (a) => (isYield(a) ? a.close - a.high : a.fromHigh) },
  { key: "highDate", label: "Record date", num: true, cls: "quotes__date", sort: (a) => a.highDate },
  { key: "first", label: "Since", num: true, cls: "quotes__since", sort: (a) => a.first },
  { key: "spark", label: "Past year", cls: "quotes__spark" },
];

function createQuotes(root, data, onPick) {
  const table = root.querySelector("[data-quotes]");
  if (!table) return;
  const order = { key: null, dir: null };
  const head = el("thead");
  const hr = el("tr");
  const headers = COLUMNS.map((col) => {
    const th = el("th", [col.num ? "num" : "", col.cls || ""].join(" ").trim() || null);
    th.scope = "col";
    if (col.sort) {
      const btn = el("button", "sort", col.label);
      btn.type = "button";
      btn.addEventListener("click", () => {
        if (order.key !== col.key) { order.key = col.key; order.dir = col.dir || "descending"; }
        else if (order.dir === (col.dir || "descending")) order.dir = order.dir === "ascending" ? "descending" : "ascending";
        else { order.key = null; order.dir = null; }
        render();
      });
      th.append(btn);
    } else th.textContent = col.label;
    hr.append(th);
    return th;
  });
  head.append(hr);
  const body = el("tbody");
  table.replaceChildren(head, body);

  function changeCell(a, v) {
    const dir = direction(a, v);
    const td = el("td", `num${dir === "up" || dir === "down" ? ` is-${dir}` : ""}`, formatChange(a, v));
    return td;
  }

  function row(a) {
    const tr = el("tr");
    const name = el("th");
    name.scope = "row";
    const link = el("a", null, a.name);
    link.href = `#${a.id}`;
    link.addEventListener("click", (e) => { e.preventDefault(); onPick(a.id); });
    const note = a.place || (a.short !== a.name ? a.short : "");
    name.append(link);
    if (note) name.append(el("small", null, note));
    const last = el("td", "num");
    last.append(price(a, a.close), el("small", null, longDate(a.date).replace(/ \d{4}$/, "")));
    const record = isYield(a)
      ? (() => { const pts = a.close - a.high; return el("td", "num", `${pts < 0 ? "−" : ""}${num(Math.abs(pts), 2)} pts`); })()
      : el("td", "num", a.fromHigh == null || a.fromHigh > -0.005 ? "Record" : formatChange(a, a.fromHigh));
    const sparkCell = el("td", "quotes__spark");
    sparkCell.append(spark(a.spark));
    tr.append(
      name,
      last,
      changeCell(a, a.periods?.["1d"]),
      changeCell(a, a.periods?.ytd),
      changeCell(a, a.periods?.["1y"]),
      record,
      el("td", "num quotes__date", longDate(a.highDate)),
      el("td", "num quotes__since", a.first.slice(0, 4)),
      sparkCell,
    );
    return tr;
  }

  function render() {
    COLUMNS.forEach((col, i) => {
      if (order.key === col.key) headers[i].setAttribute("aria-sort", order.dir);
      else headers[i].removeAttribute("aria-sort");
    });
    body.replaceChildren();
    if (!order.key) {
      for (const g of data.groups) {
        const assets = data.assets.filter((a) => a.group === g.id);
        if (!assets.length) continue;
        const tr = el("tr", "ledger__group");
        const th = el("th", null, g.name);
        th.colSpan = COLUMNS.length;
        th.scope = "colgroup";
        tr.append(th);
        body.append(tr, ...assets.map(row));
      }
      return;
    }
    const col = COLUMNS.find((c) => c.key === order.key);
    const sign = order.dir === "ascending" ? 1 : -1;
    const sorted = [...data.assets].sort((a, b) => {
      const va = col.sort(a);
      const vb = col.sort(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
    });
    body.append(...sorted.map(row));
  }

  render();
}

// ── Page ────────────────────────────────────────────────────────────────

async function start(root) {
  let data;
  try {
    const res = await fetch("data/markets.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch (err) {
    const mapNode = root.querySelector("[data-map]");
    mapNode.removeAttribute("aria-busy");
    mapNode.replaceChildren(el("p", "chart__missing", "Prices couldn’t load. Try again in a minute."));
    return;
  }

  // The meta line names the day most markets last closed; crypto trades through the weekend.
  const counts = new Map();
  for (const a of data.assets) if (a.group !== "crypto") counts.set(a.date, (counts.get(a.date) || 0) + 1);
  const closed = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0];
  const closedNode = root.querySelector("[data-closed]");
  if (closed && closedNode) closedNode.textContent = `Closing prices on ${longDate(closed)}`;
  const count = root.querySelector("[data-map-count]");
  if (count) count.textContent = `${data.assets.length} prices`;

  const view = createView(root, data);
  const viewSection = root.querySelector("#long-view");

  /** Charts an asset and, if the chart is out of sight, brings it into view. */
  function pick(id) {
    view.select(id, { animate: true });
    history.replaceState(null, "", `#${id}`);
    const r = viewSection.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight * 0.5) viewSection.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  }

  const map = buildMap(root.querySelector("[data-map]"), data, pick);
  let period = recall(KEYS.period, (v) => PERIODS.some((p) => p.key === v), "1d");
  periodButtons(root.querySelector("[data-periods]"), period, (key) => {
    period = key;
    remember(KEYS.period, key);
    map.paint(key);
    mapKey(root.querySelector("[data-key]"), key);
  });
  map.paint(period);
  map.layout();
  mapKey(root.querySelector("[data-key]"), period);
  view.onSelect((id) => {
    for (const [key, { tile }] of map.tiles) tile.setAttribute("aria-pressed", String(key === id));
  });

  createYears(root, data, pick);
  createQuotes(root, data, pick);

  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (view.has(fromHash)) {
    await view.select(fromHash);
    viewSection.scrollIntoView();
  } else {
    const saved = recall(KEYS.asset, (v) => view.has(v), "spx");
    view.select(saved);
  }
  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (view.has(id) && id !== view.current()) pick(id);
  });
}

const root = document.querySelector("[data-markets]");
if (root) start(root);
