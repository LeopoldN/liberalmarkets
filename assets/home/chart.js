// Chart template. Any <figure class="chart" data-chart="SERIES_ID"> becomes a titled chart drawn from
// data/<SERIES_ID>.csv and described by data/series.json. Trump's two terms are shaded and the line turns
// claret while he is in office; the headline figure is the change since he was sworn in on 20 January 2025.

const SVG = "http://www.w3.org/2000/svg";
const DAY = 86400000;

export const SWORN_IN = Date.UTC(2025, 0, 20);
export const TERMS = [
  { label: "First term", short: "1st term", start: Date.UTC(2017, 0, 20), end: Date.UTC(2021, 0, 20) },
  { label: "Second term", short: "2nd term", start: SWORN_IN, end: null },
];

export const RANGES = {
  "2024": { label: "Since 2024", from: Date.UTC(2024, 0, 1) },
  "2016": { label: "Since 2016", from: Date.UTC(2016, 0, 1) },
  "2000": { label: "Since 2000", from: Date.UTC(2000, 0, 1) },
  all: { label: "All", from: -Infinity },
};
export const DEFAULT_RANGE = "2016";

// ── Data ────────────────────────────────────────────────────────────────

let registry;
const csvCache = new Map();

export function loadRegistry() {
  registry ||= fetch("data/series.json", { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : { series: {} }))
    .then((json) => json.series || {});
  return registry;
}

export function loadSeries(id) {
  if (!csvCache.has(id)) {
    csvCache.set(
      id,
      fetch(`data/${id}.csv`, { cache: "no-cache" }).then(async (res) => {
        if (!res.ok) throw new Error(`${id}: ${res.status}`);
        return (await res.text())
          .trim()
          .split(/\r?\n/)
          .slice(1)
          .map((line) => {
            const [date, raw] = line.split(",");
            return { t: Date.parse(`${date}T00:00:00Z`), v: Number(raw) };
          })
          .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
      }),
    );
  }
  return csvCache.get(id);
}

function frequency(points) {
  const gaps = [];
  for (let i = Math.max(1, points.length - 13); i < points.length; i++) gaps.push(points[i].t - points[i - 1].t);
  gaps.sort((a, b) => a - b);
  const days = (gaps[gaps.length >> 1] || 30 * DAY) / DAY;
  return days <= 8 ? "week" : days <= 35 ? "month" : days <= 100 ? "quarter" : "year";
}

/** The % change on a year earlier, matched by calendar date. */
function yoy(points) {
  const byDate = new Map(points.map((p) => [p.t, p.v]));
  return points
    .map((p) => {
      const d = new Date(p.t);
      const prior = byDate.get(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate()));
      return prior ? { t: p.t, v: (p.v / prior - 1) * 100 } : null;
    })
    .filter(Boolean);
}

/** Index of the reading in force when a term began: the month of the inauguration for monthly and weekly
 *  data, the last full quarter or year before it otherwise. */
function baselineIndex(points, freq, start) {
  const d = new Date(start);
  const cutoff = freq === "month" || freq === "week" ? start : Date.UTC(d.getUTCFullYear(), 0, 1) - 1;
  let found = -1;
  for (let i = 0; i < points.length && points[i].t <= cutoff; i++) found = i;
  return found;
}

/** Everything a chart, a stat or a table row needs about one series. */
export function prepare(spec, rows) {
  const level = rows;
  const points = spec.transform === "yoy" ? yoy(rows) : rows;
  const freq = frequency(level);
  const latest = points[points.length - 1];
  const b = baselineIndex(points, freq, SWORN_IN);
  const base = b >= 0 ? points[b] : null;
  const out = { spec, points, level, freq, latest, base };
  if (base) {
    out.change = latest.v - base.v;
    if (spec.transform === "yoy") {
      const lb = level[baselineIndex(level, freq, SWORN_IN)];
      out.cumulative = (level[level.length - 1].v / lb.v - 1) * 100;
    } else if (spec.unit !== "pct" && base.v !== 0) {
      out.pct = (out.change / Math.abs(base.v)) * 100;
    }
    out.tone = !spec.good || out.change === 0 ? "even" : (out.change > 0) === (spec.good === "up") ? "good" : "bad";
  }
  return out;
}

// ── Formatting ──────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function periodLabel(t, freq, spec = {}) {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  if (spec.period === "fy") return `FY${d.getUTCMonth() >= 9 ? y + 1 : y}`;
  if (freq === "year") return String(y);
  if (freq === "quarter") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${y}`;
  if (freq === "week") return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${y}`;
  return `${MONTHS[d.getUTCMonth()]} ${y}`;
}

const DOLLAR_BASE = { usdM: 1e6, usdB: 1e9, usd0: 1 };

/** How to print a value of this size: multiplier, prefix, suffix and default decimals. */
function scale(spec, magnitude, axis) {
  const m = Math.abs(magnitude);
  switch (spec.unit) {
    case "usd": return { k: 1, pre: "$", suf: "", dp: spec.digits ?? 2 };
    case "cents": return { k: 100, pre: "", suf: "¢", dp: spec.digits ?? 1 };
    case "pct": return { k: 1, pre: "", suf: "%", dp: spec.digits ?? 1 };
    case "ratio": return { k: 1, pre: "", suf: "×", dp: spec.digits ?? 2 };
    case "jobsK":
      return m >= 1000 ? { k: 1e-3, pre: "", suf: "m", dp: m >= 1e4 ? 1 : 2 } : { k: 1, pre: "", suf: "K", dp: m < 100 ? 1 : 0 };
    case "usdM":
    case "usdB":
    case "usd0": {
      const base = DOLLAR_BASE[spec.unit];
      const dollars = m * base;
      if (dollars >= 1e12) return { k: base / 1e12, pre: "$", suf: "tn", dp: 2 };
      if (dollars >= 1e9) return { k: base / 1e9, pre: "$", suf: "bn", dp: 1 };
      if (dollars >= 1e6) return { k: base / 1e6, pre: "$", suf: "m", dp: 1 };
      if (axis && dollars >= 1e4) return { k: base / 1e3, pre: "$", suf: "K", dp: 0 };
      return { k: base, pre: "$", suf: "", dp: 0 };
    }
    default: return { k: 1, pre: "", suf: "", dp: spec.digits ?? 1 };
  }
}

function number(x, dp) {
  return x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function print(v, s, dp, signed) {
  const digits = number(Math.abs(v) * s.k, dp);
  const zero = Number(digits.replace(/,/g, "")) === 0;
  const sign = zero ? "" : v < 0 ? "−" : signed && v > 0 ? "+" : "";
  return `${sign}${s.pre}${digits}${s.suf}`;
}

export function formatValue(v, spec) {
  const s = scale(spec, v);
  return print(v, s, s.dp);
}

/** "+0.2 pts", "−317K (−10.6%)", "+$1.33 (+42%)". */
export function formatChange(prep) {
  const { spec, change, pct } = prep;
  if (change == null) return "";
  if (spec.unit === "pct") return `${print(change, { k: 1, pre: "", suf: "" }, spec.digits ?? 1, true)} pts`;
  const s = scale(spec, change);
  // Job changes read in whole thousands unless they are tiny.
  if (spec.unit === "jobsK" && s.suf === "K") s.dp = Math.abs(change) < 10 ? 1 : 0;
  const head = print(change, s, s.dp, true);
  if (pct == null) return head;
  return `${head} (${print(pct, { k: 1, pre: "", suf: "%" }, Math.abs(pct) < 10 ? 1 : 0, true)})`;
}

export function sinceLabel(prep) {
  return prep.base ? `since ${periodLabel(prep.base.t, prep.freq, prep.spec)}` : "";
}

export const ARROW = { up: "▲", down: "▼", flat: "■" };
export const arrowFor = (change) => (change > 0 ? ARROW.up : change < 0 ? ARROW.down : ARROW.flat);

// ── Scales ──────────────────────────────────────────────────────────────

function niceStep(span, count) {
  const rough = span / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const f = rough / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

function yTicks(lo, hi, count) {
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return { ticks, step, lo: start, hi: end };
}

function tickText(v, spec, step, magnitude) {
  const s = scale(spec, magnitude, true);
  if (v === 0 && s.pre === "$") return "$0";
  let dp = 0;
  while (dp < 3 && Math.abs(Math.round(step * s.k * 10 ** dp) - step * s.k * 10 ** dp) > 1e-6) dp++;
  return print(v, s, dp);
}

let measurer;
function textWidth(text, font) {
  measurer ||= document.createElement("canvas").getContext("2d");
  measurer.font = font;
  return measurer.measureText(text).width;
}

// ── Drawing ─────────────────────────────────────────────────────────────

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text != null) node.textContent = text;
  return node;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** A column whose data end is rounded and whose baseline end is square. */
function columnPath(x, w, y0, y1) {
  const r = Math.min(4, w / 2, Math.abs(y1 - y0));
  if (y1 <= y0) {
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

const inTerm = (t) => TERMS.some((term) => t >= term.start && (term.end == null || t < term.end));

function draw(chart) {
  const { plot, prep, rangeKey, lead } = chart;
  const { spec, points, freq } = prep;
  const width = Math.round(plot.clientWidth);
  if (!width) return;
  const narrow = width < 440;
  const height = lead ? (narrow ? 220 : 280) : narrow ? 170 : 190;

  const from = RANGES[rangeKey]?.from ?? RANGES[DEFAULT_RANGE].from;
  let shown = points.filter((p) => p.t >= from);
  if (shown.length < 2) shown = points.slice(-2);
  const column = spec.kind === "column";

  // Vertical scale. Columns always stand on zero; the reference line, if any, stays in view.
  let lo = Math.min(...shown.map((p) => p.v));
  let hi = Math.max(...shown.map((p) => p.v));
  if (column) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (spec.ref) { lo = Math.min(lo, spec.ref.value); hi = Math.max(hi, spec.ref.value); }
  const y = yTicks(lo, hi, lead ? 5 : 4);
  const magnitude = Math.max(Math.abs(y.lo), Math.abs(y.hi));
  const labels = y.ticks.map((v) => tickText(v, spec, y.step, magnitude));

  const tickFont = "400 11px Geist Mono, ui-monospace, monospace";
  const gutter = Math.ceil(Math.max(...labels.map((l) => textWidth(l, tickFont)))) + 10;
  const top = 22;
  const bottom = height - 24;
  const left = gutter;
  const right = width - 6;

  const t0 = shown[0].t;
  const t1 = shown[shown.length - 1].t;
  // Columns sit in equal bands, so pad the time axis by half a band each side.
  const half = column ? (t1 - t0) / Math.max(1, shown.length - 1) / 2 || 180 * DAY : 0;
  const xa = t0 - half;
  const xb = t1 + half;
  const x = (t) => left + ((t - xa) / (xb - xa || 1)) * (right - left);
  const yv = (v) => bottom - ((v - y.lo) / (y.hi - y.lo || 1)) * (bottom - top);

  const root = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart__svg", "aria-hidden": "true" });

  // Terms: a wash behind everything, labelled along the top when the label fits.
  for (const term of TERMS) {
    const a = Math.max(term.start, xa);
    const b = Math.min(term.end ?? xb, xb);
    if (b <= a) continue;
    const xa1 = x(a);
    const w = x(b) - xa1;
    root.append(svg("rect", { x: xa1, y: top - 22, width: w, height: bottom - top + 22, class: "chart__term" }));
    const label = [term.label, term.short].find((l) => w >= textWidth(l, "500 11px Geist, sans-serif") + 12);
    if (label) root.append(svg("text", { x: xa1 + 6, y: top - 8, class: "chart__term-label" }, label));
  }

  // Gridlines with their labels in the left gutter.
  y.ticks.forEach((v, i) => {
    const yy = Math.round(yv(v)) + 0.5;
    root.append(svg("line", { x1: left, x2: right, y1: yy, y2: yy, class: v === 0 && y.lo < 0 ? "chart__zero" : "chart__grid" }));
    root.append(svg("text", { x: left - 10, y: yy, class: "chart__tick", "text-anchor": "end", "dominant-baseline": "middle" }, labels[i]));
  });
  if (y.lo >= 0 || column) {
    const yy = Math.round(yv(Math.max(0, y.lo))) + 0.5;
    root.append(svg("line", { x1: left, x2: right, y1: yy, y2: yy, class: "chart__zero" }));
  }

  // Years along the bottom, spaced so the labels never touch.
  const y0 = new Date(xa).getUTCFullYear();
  const y1 = new Date(xb).getUTCFullYear();
  const room = Math.max(1, Math.floor((right - left) / 54));
  const yearStep = [1, 2, 5, 10, 20, 50].find((s) => (y1 - y0) / s < room) || 50;
  for (let yr = Math.ceil(y0 / yearStep) * yearStep; yr <= y1; yr += yearStep) {
    const t = Date.UTC(yr, 0, 1);
    if (t < xa) continue;
    const xx = Math.round(x(t)) + 0.5;
    if (xx < left - 1 || xx + 32 > width) continue;
    root.append(svg("line", { x1: xx, x2: xx, y1: bottom, y2: bottom + 5, class: "chart__axis-tick" }));
    root.append(svg("text", { x: xx + 4, y: bottom + 17, class: "chart__tick" }, String(yr)));
  }

  // Reference line, labelled at its right end.
  if (spec.ref) {
    const yy = Math.round(yv(spec.ref.value)) + 0.5;
    root.append(svg("line", { x1: left, x2: right, y1: yy, y2: yy, class: "chart__ref" }));
    root.append(svg("text", { x: left + 4, y: yy - 5, class: "chart__ref-label" }, spec.ref.label));
  }

  const marks = svg("g");
  root.append(marks);
  let bars = [];

  if (column) {
    const band = (right - left) / shown.length;
    const w = Math.max(2, Math.min(24, band - 2));
    const zero = yv(0);
    bars = shown.map((p) => {
      const cx = x(p.t);
      const bar = svg("path", { d: columnPath(cx - w / 2, w, zero, yv(p.v)), class: inTerm(p.t) ? "chart__bar is-term" : "chart__bar" });
      marks.append(bar);
      return bar;
    });
  } else {
    const path = (list) => list.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${yv(p.v).toFixed(1)}`).join("");
    marks.append(svg("path", { d: path(shown), class: "chart__line" }));
    // Overlay the stretches he was in office, starting from the reading in force on the day he took over.
    for (const term of TERMS) {
      const a = baselineIndex(shown, freq, term.start);
      const startIdx = a >= 0 ? a : shown[0].t >= term.start ? 0 : -1;
      if (startIdx < 0) continue;
      let endIdx = shown.length - 1;
      if (term.end != null) {
        endIdx = baselineIndex(shown, freq, term.end);
        if (endIdx < startIdx) continue;
      }
      if (endIdx > startIdx) marks.append(svg("path", { d: path(shown.slice(startIdx, endIdx + 1)), class: "chart__line is-term" }));
    }
    // The reading he inherited, as a hollow ring.
    const base = prep.base;
    if (base && base.t >= shown[0].t) {
      marks.append(svg("circle", { cx: x(base.t), cy: yv(base.v), r: 3.5, class: "chart__base" }));
    }
    const last = shown[shown.length - 1];
    marks.append(svg("circle", { cx: x(last.t), cy: yv(last.v), r: 4, class: inTerm(last.t) ? "chart__end is-term" : "chart__end" }));
  }

  // Hover layer.
  const cross = svg("line", { y1: top - 4, y2: bottom, class: "chart__cross" });
  const dot = svg("circle", { r: 4, class: "chart__dot" });
  root.append(cross, dot);

  chart.svgEl?.remove();
  plot.prepend(root);
  chart.svgEl = root;
  chart.geometry = { shown, x, yv, column, bars, cross, dot, left, right, width };

  const first = shown[0];
  plot.setAttribute(
    "aria-label",
    `${spec.title}, ${spec.sub}. ${periodLabel(first.t, freq, spec)} to ${periodLabel(shown[shown.length - 1].t, freq, spec)}. ` +
      `Latest ${formatValue(prep.latest.v, spec)} in ${periodLabel(prep.latest.t, freq, spec)}.`,
  );
  if (chart.active != null) show(chart, Math.min(chart.active, shown.length - 1));
}

function show(chart, i) {
  const g = chart.geometry;
  if (!g) return;
  const p = g.shown[i];
  chart.active = i;
  const xx = g.x(p.t);
  if (g.column) {
    g.bars.forEach((bar, j) => bar.classList.toggle("is-active", j === i));
    chart.plot.classList.add("is-columns-hover");
  } else {
    g.cross.setAttribute("x1", xx);
    g.cross.setAttribute("x2", xx);
    g.dot.setAttribute("cx", xx);
    g.dot.setAttribute("cy", g.yv(p.v));
    g.dot.classList.toggle("is-term", inTerm(p.t));
  }
  const tip = chart.tip;
  tip.replaceChildren(el("strong", null, formatValue(p.v, chart.prep.spec)), el("span", null, periodLabel(p.t, chart.prep.freq, chart.prep.spec)));
  tip.hidden = false;
  const tw = tip.offsetWidth;
  const left = Math.max(0, Math.min(g.width - tw, xx - tw / 2));
  tip.style.transform = `translateX(${left}px)`;
  chart.plot.classList.add("is-hover");
}

function hide(chart) {
  chart.active = null;
  chart.tip.hidden = true;
  chart.plot.classList.remove("is-hover", "is-columns-hover");
  chart.geometry?.bars.forEach((bar) => bar.classList.remove("is-active"));
}

function nearest(chart, clientX) {
  const g = chart.geometry;
  const px = clientX - chart.plot.getBoundingClientRect().left;
  let best = 0;
  let dist = Infinity;
  g.shown.forEach((p, i) => {
    const d = Math.abs(g.x(p.t) - px);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

// ── Mounting ────────────────────────────────────────────────────────────

const mounted = new Set();
let currentRange = null;

function header(figure, prep) {
  const { spec } = prep;
  const head = el("div", "chart__head");
  const titles = el("div", "chart__titles");
  titles.append(el("h3", "chart__title", spec.title), el("p", "chart__sub", spec.sub));

  const stat = el("div", "chart__stat");
  stat.append(el("span", "chart__value", formatValue(prep.latest.v, spec)));
  if (prep.change != null) {
    const delta = el("span", `chart__delta is-${prep.tone}`);
    delta.append(el("span", "chart__arrow", arrowFor(prep.change)), ` ${formatChange(prep)} `, el("span", "chart__since", sinceLabel(prep)));
    stat.append(delta);
  }
  head.append(titles, stat);
  if (prep.cumulative != null) {
    const note = el("p", "chart__note");
    note.textContent = `Prices are ${prep.cumulative >= 0 ? "up" : "down"} ${Math.abs(prep.cumulative).toFixed(1)}% ${sinceLabel(prep)}.`;
    titles.append(note);
  }
  return head;
}

function source(id, prep) {
  const { spec } = prep;
  const foot = el("figcaption", "chart__source");
  foot.append(`Source: ${spec.source}${spec.fred === false ? "" : " via FRED"} · `);
  if (spec.fred !== false) {
    const a = el("a", null, id);
    a.href = `https://fred.stlouisfed.org/series/${id}`;
    a.rel = "noopener";
    foot.append(a, " · ");
  }
  foot.append(`Latest ${periodLabel(prep.latest.t, prep.freq, spec)}`);
  return foot;
}

/** Loads and prepares one series; overrides replace registry fields (title, sub, transform, kind, unit). */
export async function loadPrepared(id, overrides = {}) {
  const [reg, rows] = await Promise.all([loadRegistry(), loadSeries(id)]);
  const spec = { title: id, sub: "", source: "FRED", unit: "", ...reg[id] };
  for (const key of ["title", "sub", "transform", "kind", "unit"]) if (overrides[key]) spec[key] = overrides[key];
  const prep = prepare(spec, rows);
  if (prep.points.length < 2) throw new Error(`${id}: not enough data`);
  return prep;
}

/** Draws the line in from the left, for when a reader swaps one series for another. */
function drawIn(chart) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !chart.svgEl) return;
  for (const path of chart.svgEl.querySelectorAll(".chart__line")) {
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 700, easing: "cubic-bezier(.3, .7, .2, 1)" })
      .finished.then(() => { path.style.strokeDasharray = ""; }, () => {});
  }
  for (const bar of chart.svgEl.querySelectorAll(".chart__bar")) {
    bar.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease-out" });
  }
  for (const mark of chart.svgEl.querySelectorAll(".chart__end, .chart__base")) {
    mark.animate([{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: 800 });
  }
}

/** Turns one figure into a chart, replacing any chart it already holds. Resolves to the prepared series,
 *  or null if it can't load. Pass animate to draw the line in. */
export async function mountChart(figure, { range, animate } = {}) {
  const id = figure.dataset.chart;
  try {
    const prep = await loadPrepared(id, figure.dataset);
    const previous = figure.__chart;
    if (previous) {
      previous.observer.disconnect();
      mounted.delete(previous);
      if (!range) range = previous.rangeKey;
    }

    const plot = el("div", "chart__plot");
    plot.tabIndex = 0;
    plot.setAttribute("role", "img");
    const tip = el("div", "chart__tip");
    tip.hidden = true;
    tip.setAttribute("aria-live", "polite");
    plot.append(tip);
    figure.replaceChildren(header(figure, prep), plot, source(id, prep));
    if (!figure.id) figure.id = `chart-${id}`;

    const chart = {
      figure,
      plot,
      tip,
      prep,
      lead: figure.classList.contains("chart--lead"),
      rangeKey: range || figure.dataset.range || currentRange || DEFAULT_RANGE,
      active: null,
    };
    plot.addEventListener("pointermove", (e) => show(chart, nearest(chart, e.clientX)));
    plot.addEventListener("pointerleave", () => hide(chart));
    plot.addEventListener("focus", () => chart.geometry && show(chart, chart.geometry.shown.length - 1));
    plot.addEventListener("blur", () => hide(chart));
    plot.addEventListener("keydown", (e) => {
      if (!chart.geometry) return;
      const n = chart.geometry.shown.length;
      const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (step) chart.active = Math.max(0, Math.min(n - 1, (chart.active ?? n - 1) + step));
      else if (e.key === "Home") chart.active = 0;
      else if (e.key === "End") chart.active = n - 1;
      else if (e.key === "Escape") return hide(chart);
      else return;
      e.preventDefault();
      show(chart, chart.active);
    });

    let frame = 0;
    let lastWidth = 0;
    chart.observer = new ResizeObserver(() => {
      if (plot.clientWidth === lastWidth) return;
      lastWidth = plot.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => draw(chart));
    });
    chart.observer.observe(plot);
    draw(chart);
    if (animate) drawIn(chart);
    mounted.add(chart);
    figure.__chart = chart;
    figure.classList.add("is-ready");
    return prep;
  } catch (err) {
    figure.classList.add("is-missing");
    figure.replaceChildren(el("p", "chart__missing", `This chart couldn’t load its data (${id}).`));
    return null;
  }
}

/** Redraws every chart on the page over a new period. */
export function setRange(key) {
  if (!RANGES[key]) return;
  currentRange = key;
  for (const chart of mounted) {
    if (chart.figure.dataset.range) continue;
    chart.rangeKey = key;
    draw(chart);
    drawIn(chart);
  }
}

/** Mounts every chart figure under root. */
export function mountAll(root = document, options) {
  return Promise.all([...root.querySelectorAll("figure[data-chart]")].map((f) => mountChart(f, options)));
}
