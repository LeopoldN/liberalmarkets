// Data desk: six headline indicators from the FRED series in data/, each a stat tile with a sparkline.

const MONTHS = 36;

const fmtMonth = (d) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const fmtQuarter = (d) => `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
const pct = (v, digits = 1) => `${v.toFixed(digits)}`;
const signed = (v, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`;

async function series(id) {
  const res = await fetch(`data/${id}.csv`);
  if (!res.ok) throw new Error(`${id}: ${res.status}`);
  const rows = (await res.text()).trim().split(/\r?\n/).slice(1);
  return rows
    .map((line) => {
      const [date, value] = line.split(",");
      return { date: new Date(`${date}T00:00:00Z`), value: Number(value) };
    })
    .filter((p) => Number.isFinite(p.value));
}

/** Each indicator: where its numbers come from, how to show them, and whether up is good. */
const INDICATORS = [
  {
    label: "Unemployment rate",
    source: "UNRATE",
    load: (s) => s,
    value: (v) => [pct(v), "%"],
    delta: (now, then) => `${signed(now - then)} pts`,
    goodWhenUp: false,
    period: fmtMonth,
    yearAgo: 12,
  },
  {
    label: "Inflation, CPI y/y",
    source: "CPIAUCSL",
    load: (s) => s.slice(12).map((p, i) => ({ date: p.date, value: (p.value / s[i].value - 1) * 100 })),
    value: (v) => [pct(v), "%"],
    delta: (now, then) => `${signed(now - then)} pts`,
    goodWhenUp: false,
    period: fmtMonth,
    yearAgo: 12,
  },
  {
    label: "Fed funds rate",
    source: "FEDFUNDS",
    load: (s) => s,
    value: (v) => [pct(v, 2), "%"],
    delta: (now, then) => `${signed(now - then, 2)} pts`,
    goodWhenUp: null,
    period: fmtMonth,
    yearAgo: 12,
  },
  {
    label: "Payrolls, monthly change",
    source: "PAYEMS",
    load: (s) => s.slice(1).map((p, i) => ({ date: p.date, value: p.value - s[i].value })),
    value: (v) => [`${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}`, "K"],
    delta: (now, then) => `${signed(now - then, 0)}K`,
    goodWhenUp: true,
    period: fmtMonth,
    yearAgo: 12,
    zero: true,
  },
  {
    label: "Trade balance",
    source: "BOPGSTB",
    load: (s) => s.map((p) => ({ date: p.date, value: p.value / 1000 })),
    value: (v) => [`${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(1)}`, "B"],
    delta: (now, then) => `${signed(now - then)}B`,
    goodWhenUp: true,
    period: fmtMonth,
    yearAgo: 12,
  },
  {
    label: "Federal debt to GDP",
    source: "GFDEGDQ188S",
    load: (s) => s,
    value: (v) => [pct(v), "%"],
    delta: (now, then) => `${signed(now - then)} pts`,
    goodWhenUp: false,
    period: fmtQuarter,
    yearAgo: 4,
    points: 16,
  },
];

const SVG = "http://www.w3.org/2000/svg";

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function sparkline(points, ind) {
  const wrap = el("div", "stat__spark");
  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (ind.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const pad = (hi - lo || 1) * 0.12;
  lo -= pad;
  hi += pad;
  const x = (i) => (i / (points.length - 1)) * 100;
  const y = (v) => (1 - (v - lo) / (hi - lo)) * 100;

  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join("");
  const base = ind.zero ? y(0) : 100;
  const area = document.createElementNS(SVG, "path");
  area.setAttribute("class", "spark-area");
  area.setAttribute("d", `${line}L100,${base}L0,${base}Z`);
  svg.append(area);
  if (ind.zero) {
    const zero = document.createElementNS(SVG, "line");
    zero.setAttribute("class", "spark-zero");
    zero.setAttribute("x1", "0");
    zero.setAttribute("x2", "100");
    zero.setAttribute("y1", String(y(0)));
    zero.setAttribute("y2", String(y(0)));
    svg.append(zero);
  }
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("class", "spark-line");
  path.setAttribute("d", line);
  const cross = document.createElementNS(SVG, "line");
  cross.setAttribute("class", "spark-cross");
  cross.setAttribute("y1", "0");
  cross.setAttribute("y2", "100");
  svg.append(path, cross);

  const last = el("span", "spark-last");
  const lastIdx = points.length - 1;
  last.style.left = `${x(lastIdx)}%`;
  last.style.top = `${y(points[lastIdx].value)}%`;
  const dot = el("span", "spark-dot");
  const tip = el("span", "spark-tip");
  wrap.append(svg, last, dot, tip);

  // Crosshair + tooltip: snap to the nearest point under the pointer.
  wrap.addEventListener("pointermove", (e) => {
    const rect = wrap.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * lastIdx);
    const p = points[Math.max(0, Math.min(lastIdx, i))];
    const px = x(points.indexOf(p));
    cross.setAttribute("x1", String(px));
    cross.setAttribute("x2", String(px));
    dot.style.left = `${px}%`;
    dot.style.top = `${y(p.value)}%`;
    const [v, unit] = ind.value(p.value);
    tip.textContent = `${ind.period(p.date)} · ${v}${unit}`;
    tip.style.left = `${Math.max(18, Math.min(82, px))}%`;
    wrap.classList.add("is-hover");
  });
  wrap.addEventListener("pointerleave", () => wrap.classList.remove("is-hover"));
  return wrap;
}

function tile(ind, all) {
  const points = all.slice(-(ind.points || MONTHS));
  const now = all[all.length - 1];
  const then = all[all.length - 1 - ind.yearAgo];
  const [value, unit] = ind.value(now.value);

  const a = el("a", "stat");
  a.href = "trumptracker.html";
  a.append(el("span", "stat__label", ind.label));

  const v = el("span", "stat__value", value);
  v.append(el("small", null, unit));
  a.append(v);

  const delta = el("span", "stat__delta");
  if (then) {
    const change = now.value - then.value;
    const arrow = el("i", null, change > 0 ? "▲ " : change < 0 ? "▼ " : "■ ");
    if (ind.goodWhenUp != null && change !== 0) arrow.className = (change > 0) === ind.goodWhenUp ? "is-good" : "is-bad";
    delta.append(arrow, ind.delta(now.value, then.value), el("span", null, "vs a year earlier"));
  }
  a.append(delta);

  a.append(sparkline(points, ind));
  const foot = el("span", "stat__foot");
  foot.append(el("span", null, `FRED · ${ind.source}`), el("span", null, ind.period(now.date)));
  a.append(foot);
  a.setAttribute("aria-label", `${ind.label}: ${value}${unit} in ${ind.period(now.date)}${then ? `, ${ind.delta(now.value, then.value)} vs a year earlier` : ""}. Open the Trump Tracker.`);
  return a;
}

/** Fills the grid and resolves to search entries for each indicator. */
export async function renderDesk(grid) {
  if (!grid) return [];
  grid.innerHTML = INDICATORS.map(() => '<div class="stat"><span class="skeleton" style="width:50%"></span><span class="skeleton" style="height:28px;width:40%;margin-top:10px"></span><span class="skeleton" style="height:48px;margin-top:14px;grid-column:1/-1"></span></div>').join("");
  const tiles = await Promise.all(
    INDICATORS.map(async (ind) => {
      try {
        const all = ind.load(await series(ind.source));
        if (all.length <= ind.yearAgo) return null;
        const now = all[all.length - 1];
        const [value, unit] = ind.value(now.value);
        return {
          node: tile(ind, all),
          entry: { type: "Data", title: ind.label, sub: `${value}${unit} in ${ind.period(now.date)} · FRED ${ind.source}`, href: "trumptracker.html", keywords: ind.source },
        };
      } catch (err) {
        return null;
      }
    }),
  );
  grid.textContent = "";
  for (const t of tiles) if (t) grid.append(t.node);
  return tiles.filter(Boolean).map((t) => t.entry);
}
