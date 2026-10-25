// Indicators table: six headline numbers from the FRED series in data/, each with a three-year sparkline.

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
    note: "quarterly",
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
  const wrap = el("div", "spark");
  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (ind.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const pad = (hi - lo || 1) * 0.1;
  lo -= pad;
  hi += pad;
  const last = points.length - 1;
  const x = (i) => (i / last) * 100;
  const y = (v) => (1 - (v - lo) / (hi - lo)) * 100;

  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join("");
  const base = ind.zero ? y(0) : 100;
  const shape = (tag, cls, attrs) => {
    const node = document.createElementNS(SVG, tag);
    node.setAttribute("class", cls);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.append(node);
    return node;
  };
  shape("path", "spark__area", { d: `${line}L100,${base}L0,${base}Z` });
  if (ind.zero) shape("line", "spark__zero", { x1: 0, x2: 100, y1: y(0), y2: y(0) });
  shape("path", "spark__line", { d: line });
  const cross = shape("line", "spark__cross", { y1: 0, y2: 100 });

  const end = el("span", "spark__end");
  end.style.left = `${x(last)}%`;
  end.style.top = `${y(points[last].value)}%`;
  const dot = el("span", "spark__dot");
  const tip = el("span", "spark__tip");
  wrap.append(svg, end, dot, tip);

  // Crosshair and readout, snapped to the nearest point under the pointer.
  wrap.addEventListener("pointermove", (e) => {
    const rect = wrap.getBoundingClientRect();
    const i = Math.max(0, Math.min(last, Math.round(((e.clientX - rect.left) / rect.width) * last)));
    const p = points[i];
    cross.setAttribute("x1", String(x(i)));
    cross.setAttribute("x2", String(x(i)));
    dot.style.left = `${x(i)}%`;
    dot.style.top = `${y(p.value)}%`;
    const [v, unit] = ind.value(p.value);
    tip.textContent = `${ind.period(p.date)}  ${v}${unit}`;
    tip.style.left = `${Math.max(20, Math.min(80, x(i)))}%`;
    wrap.classList.add("is-hover");
  });
  wrap.addEventListener("pointerleave", () => wrap.classList.remove("is-hover"));
  return wrap;
}

function row(ind, all) {
  const now = all[all.length - 1];
  const then = all[all.length - 1 - ind.yearAgo];
  const [value, unit] = ind.value(now.value);
  const tr = document.createElement("tr");

  const name = el("td", "ind__name", ind.label);
  name.append(el("small", null, `${ind.source} · ${ind.period(now.date)}${ind.note ? ` · ${ind.note}` : ""}`));

  const v = el("td", "num ind__value", value);
  v.append(el("small", null, unit));

  const d = el("td", "num ind__delta");
  if (then) {
    const change = now.value - then.value;
    const arrow = el("span", null, change > 0 ? "▲ " : change < 0 ? "▼ " : "");
    if (ind.goodWhenUp != null && change !== 0) arrow.className = (change > 0) === ind.goodWhenUp ? "is-good" : "is-bad";
    d.append(arrow, ind.delta(now.value, then.value));
  }

  const trend = el("td", "ind__trend");
  trend.append(sparkline(all.slice(-(ind.points || MONTHS)), ind));
  tr.append(name, v, d, trend);
  return tr;
}

/** Fills the table body and resolves to search entries for each indicator. */
export async function renderIndicators(body) {
  if (!body) return [];
  const rows = await Promise.all(
    INDICATORS.map(async (ind) => {
      try {
        const all = ind.load(await series(ind.source));
        if (all.length <= ind.yearAgo) return null;
        const now = all[all.length - 1];
        const [value, unit] = ind.value(now.value);
        return {
          node: row(ind, all),
          entry: { type: "Data", title: ind.label, sub: `${value}${unit} in ${ind.period(now.date)} · FRED ${ind.source}`, href: "trumptracker.html", keywords: ind.source },
        };
      } catch (err) {
        return null;
      }
    }),
  );
  body.textContent = "";
  for (const r of rows) if (r) body.append(r.node);
  return rows.filter(Boolean).map((r) => r.entry);
}
