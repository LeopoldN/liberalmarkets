/**
 * @typedef {{ t: number, v: number, d: string }} Point
 */

/**
 * Parse a simple CSV with header: date,value
 * Accepts ISO dates (YYYY-MM-DD) or FRED-style (YYYY-MM-01).
 * @param {string} csvText
 * @returns {Point[]}
 */
function parseSeriesCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const [dateStr, valStr] = raw.split(",").map(s => (s ?? "").trim());
    const t = Date.parse(dateStr);
    const v = Number(valStr);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    out.push({ t, v, d: dateStr });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * Fetch a CSV with cache-busting by day.
 * Resolves path relative to document.baseURI, stripping leading slash for GitHub Pages.
 * @param {string} path
 * @returns {Promise<Point[]>}
 */
async function loadSeries(path) {
  const day = new Date().toISOString().slice(0, 10);

  // GitHub Pages usually serves sites from a subpath (/REPO/...).
  // Absolute URLs like `/data/...` will incorrectly hit the domain root and 404.
  // So we resolve relative to document.baseURI and strip a leading slash.
  const rel = (typeof path === "string" && path.startsWith("/")) ? path.slice(1) : path;
  const url = new URL(rel, document.baseURI);
  url.searchParams.set("v", day);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const text = await res.text();
  return parseSeriesCSV(text);
}

/**
 * Render a blueprint wireframe line chart with hover tooltip.
 * @param {HTMLCanvasElement} canvas
 * @param {Point[]} series
 * @param {{title?: string, root?: Document|Element}} opts
 */
function renderWireChart(canvas, series, opts = {}) {
  const root = opts.root || canvas.closest(".chartCard") || document;
  const tip = root.querySelector(".chartTip");
  const rangeEl = root.querySelector(".chartRange");
  const latestEl = root.querySelector(".chartLatest");
  const titleEl = root.querySelector(".chartTitleText");

  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue("--c-ink").trim() || "#344e41";
  const forest = css.getPropertyValue("--c-forest").trim() || "#3a5a40";
  const moss = css.getPropertyValue("--c-moss").trim() || "#588157";
  const readColor = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const chartText = readColor("--chart-text", ink);
  const chartTextSoft = readColor("--chart-text-soft", "rgba(52,78,65,0.72)");
  const chartGridMajor = readColor("--chart-grid-major", "rgba(52,78,65,0.24)");
  const chartGridMinor = readColor("--chart-grid-minor", "rgba(52,78,65,0.14)");
  const chartLine = readColor("--chart-line", forest);
  const chartLineGlow = readColor("--chart-line-glow", "rgba(52,78,65,0.28)");
  const chartPoint = readColor("--chart-point", moss);
  const chartCrosshair = readColor("--chart-crosshair", ink);
  const chartWindowFillTop = readColor("--chart-window-fill-top", "rgba(88,129,87,0.06)");
  const chartWindowFillBottom = readColor("--chart-window-fill-bottom", "rgba(58,90,64,0.11)");
  const chartWindowStroke = readColor("--chart-window-stroke", "rgba(52,78,65,0.14)");
  const chartHazeBottom = readColor("--chart-haze-bottom", "rgba(88,129,87,0.10)");
  const chartHazeMid = readColor("--chart-haze-mid", "rgba(88,129,87,0.04)");

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  /** device pixel ratio scaling */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    // Prefer explicit height so charts don't balloon on wide screens.
    const attrH = Number(canvas.getAttribute("data-height"));
    const cssH = Number.isFinite(attrH) && attrH > 0 ? attrH : 260;
    const clampedH = Math.max(200, Math.min(340, cssH));

    // Set the element's CSS size first so layout height matches the requested height.
    canvas.style.width = "100%";
    canvas.style.height = `${clampedH}px`;

    // Re-read size after CSS changes
    const rect2 = canvas.getBoundingClientRect();

    // Set drawing buffer size (device pixels)
    canvas.width = Math.floor(rect2.width * dpr);
    canvas.height = Math.floor(rect2.height * dpr);

    // Keep drawing coordinates in CSS pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  // Range selection (default comes from active tab if present)
  const rangeButtons = Array.from(root.querySelectorAll(".chartTab[data-range]"));

  const getActiveRange = () => {
    const active = root.querySelector(".chartTab.is-active");
    return active?.getAttribute("data-range") || "5y";
  };

  const rangeToMs = (r) => {
    const year = 1000 * 60 * 60 * 24 * 365.25;
    if (r === "1y") return 1 * year;
    if (r === "5y") return 5 * year;
    if (r === "10y") return 10 * year;
    return null; // all
  };

  const sliceSeries = () => {
    const r = getActiveRange();
    const ms = rangeToMs(r);
    if (!series.length) return [];
    if (!ms) return series.slice();
    const maxT = series.at(-1)?.t ?? 0;
    const startT = Math.max(series[0]?.t ?? 0, maxT - ms);
    return series.filter(p => p.t >= startT);
  };

  let data = sliceSeries();

  const pad = { l: 64, r: 20, t: 30, b: 42 };
  let hover = null;

  /** significant dates state for current slice */
  let sig = [];
  let sigWins = [];
  let axisMeta = {
    kind: "number",
    mag: { divisor: 1, suffix: "", word: "" },
    unitLabel: "Value",
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const hintText = `${canvas.getAttribute("data-title") || opts.title || ""} ${canvas.getAttribute("data-csv") || ""}`.toLowerCase();
  const explicitUnit = String(
    canvas.getAttribute("data-unit") ||
    canvas.getAttribute("data-y-unit") ||
    ""
  ).trim().toLowerCase();

  function inferValueKind(maxAbs) {
    if (explicitUnit === "currency" || explicitUnit === "usd" || explicitUnit === "dollar") return "currency";
    if (explicitUnit === "percent" || explicitUnit === "pct" || explicitUnit === "%") return "percent";
    if (explicitUnit === "number" || explicitUnit === "index" || explicitUnit === "count") return "number";

    if (
      /(^|[^a-z])(rate|yield|percent|percentage|unemployment|cpi yoy|pce yoy|chg%|delta%|pct|lfpr)([^a-z]|$)|%/.test(hintText)
    ) {
      return "percent";
    }

    if (
      /(^|[^a-z])(employment|jobs?|payroll|labor force|population|persons?|workers?|claims|permits|starts|production|index|ratio|count)([^a-z]|$)/.test(hintText)
    ) {
      return "number";
    }

    if (
      /(^|[^a-z])(price|gdp|income|wage|earnings|sales|spending|debt|deficit|revenue|exports|imports|rent|gas|oil|electricity|milk|egg|dollar)([^a-z]|$)/.test(hintText)
    ) {
      return "currency";
    }

    return "number";
  }

  function magnitudeFor(maxAbs, kind) {
    if (kind === "percent") return { divisor: 1, suffix: "", word: "" };
    if (maxAbs >= 1_000_000_000_000) return { divisor: 1_000_000_000_000, suffix: "T", word: "Trillions" };
    if (maxAbs >= 1_000_000_000) return { divisor: 1_000_000_000, suffix: "B", word: "Billions" };
    if (maxAbs >= 1_000_000) return { divisor: 1_000_000, suffix: "M", word: "Millions" };
    if (maxAbs >= 1_000) return { divisor: 1_000, suffix: "K", word: "Thousands" };
    return { divisor: 1, suffix: "", word: "" };
  }

  function buildAxisMeta(minV, maxV) {
    const maxAbs = Math.max(Math.abs(minV), Math.abs(maxV));
    const kind = inferValueKind(maxAbs);
    const mag = magnitudeFor(maxAbs, kind);
    const unitLabel =
      kind === "currency"
        ? (mag.word ? `USD (${mag.word})` : "USD")
        : kind === "percent"
          ? "Percent (%)"
          : (mag.word ? `Units (${mag.word})` : "Units");
    return { kind, mag, unitLabel };
  }

  function formatYValue(value, meta, mode = "axis") {
    const scaled = value / meta.mag.divisor;
    const abs = Math.abs(scaled);
    let maxFrac = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    if (mode === "tooltip" && abs < 1) maxFrac = 3;
    const num = abs.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFrac,
    });
    const sign = scaled < 0 ? "-" : "";
    if (meta.kind === "currency") return `${sign}$${num}${meta.mag.suffix}`;
    if (meta.kind === "percent") return `${sign}${num}%`;
    return `${sign}${num}${meta.mag.suffix}`;
  }

  /**
   * Significant markers you want on the chart.
   * NOTE: Verify the April tariff date if you mean a different day.
   * @returns {{ t:number, label:string, windowDays?: {before:number, after:number} }[]}
   */
  function significantMarkers() {
    const mk = (iso, label, windowDays) => ({
      t: Date.parse(iso),
      label,
      windowDays,
    });

    return [
      mk("2021-01-20", "Biden Inauguration"),
      mk("2022-08-16", "IRA Signed (Inflation Reduction Act)"),
      mk("2025-01-20", "Trump 2nd Inauguration"),
      mk("2025-04-02", "Liberation Day Tariffs", { before: 7, after: 21 }),
    ].filter(m => Number.isFinite(m.t));
  }

  /**
   * Markers inside [minT, maxT]
   * @param {number} minT
   * @param {number} maxT
   * @returns {{t:number,label:string,windowDays?:{before:number,after:number}}[]}
   */
  function markersInRange(minT, maxT) {
    return significantMarkers().filter(m => m.t >= minT && m.t <= maxT);
  }

  /**
   * Shading windows for markers that have windowDays
   * @param {{t:number,label:string,windowDays?:{before:number,after:number}}[]} markers
   * @param {number} minT
   * @param {number} maxT
   * @returns {{start:number,end:number,label:string,t:number}[]}
   */
  function markerWindows(markers, minT, maxT) {
    const day = 1000 * 60 * 60 * 24;
    const out = [];
    for (const m of markers) {
      if (!m.windowDays) continue;
      const start = m.t - (m.windowDays.before ?? 0) * day;
      const end = m.t + (m.windowDays.after ?? 0) * day;
      if (end < minT || start > maxT) continue;
      out.push({
        start: Math.max(start, minT),
        end: Math.min(end, maxT),
        label: m.label,
        t: m.t,
      });
    }
    return out;
  }

  // Hook up range selector buttons (optional)
  if (rangeButtons.length) {
    rangeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        rangeButtons.forEach(b => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        hover = null;
        data = sliceSeries();
        sig = [];
        sigWins = [];
        if (tip) tip.classList.remove("is-on");
        resize(); // redraw using new slice + current size
      });
    });
  }

  function draw() {
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;

    ctx.clearRect(0, 0, w, h);

    // If no data, draw a polite placeholder
    if (data.length < 2) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = chartTextSoft;
      ctx.font = `12px ${css.getPropertyValue("--mono") || "ui-monospace"}`;
      ctx.fillText("No data to plot.", pad.l, pad.t + 14);
      ctx.globalAlpha = 1;
      return;
    }

    const minV = Math.min(...data.map(p => p.v));
    const maxV = Math.max(...data.map(p => p.v));
    const spanV = (maxV - minV) || 1;
    axisMeta = buildAxisMeta(minV, maxV);

    const axisTicks = Array.from({ length: 4 }, (_, i) => minV + (i / 3) * spanV);
    const axisTickLabels = axisTicks.map(v => formatYValue(v, axisMeta, "axis"));
    ctx.save();
    ctx.font = `11px ${css.getPropertyValue("--mono") || "ui-monospace"}`;
    const widestTick = Math.max(...axisTickLabels.map(t => ctx.measureText(t).width), 0);
    ctx.font = `10px ${css.getPropertyValue("--mono") || "ui-monospace"}`;
    const unitW = ctx.measureText(axisMeta.unitLabel).width;
    ctx.restore();
    pad.l = clamp(Math.ceil(Math.max(widestTick, unitW) + 30), 68, 132);

    const minT = data[0].t;
    const maxT2 = data.at(-1).t;
    const spanT = (maxT2 - minT) || 1;

    const x = (t) => pad.l + ((t - minT) / spanT) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - minV) / spanV) * (h - pad.t - pad.b);

    // Subtle vignette to make the plot feel "framed"
    // Bottom-weighted haze (tape-style, subtle)
    ctx.save();
    const haze = ctx.createLinearGradient(0, h - pad.b, 0, pad.t);
    haze.addColorStop(0, chartHazeBottom);
    haze.addColorStop(0.45, chartHazeMid);
    haze.addColorStop(1, "rgba(88,129,87,0.00)");
    ctx.fillStyle = haze;
    ctx.fillRect(pad.l, pad.t, (w - pad.l - pad.r), (h - pad.t - pad.b));
    ctx.restore();

    // Significant markers (only the ones you want)
    sig = markersInRange(minT, maxT2);
    sigWins = markerWindows(sig, minT, maxT2);

    // Optional shading windows around selected markers
    if (sigWins.length) {
      ctx.save();
      for (const win of sigWins) {
        const x0 = x(win.start);
        const x1 = x(win.end);

        const g = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
        g.addColorStop(0, chartWindowFillTop);
        g.addColorStop(1, chartWindowFillBottom);
        ctx.fillStyle = g;

        ctx.fillRect(x0, pad.t, Math.max(1, x1 - x0), (h - pad.t - pad.b));

        // subtle border so it reads as intentional
        ctx.strokeStyle = chartWindowStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(
          x0 + 0.5,
          pad.t + 0.5,
          Math.max(1, x1 - x0) - 1,
          (h - pad.t - pad.b) - 1
        );
      }
      ctx.restore();
    }

    // Grid: subtle
    ctx.save();
    ctx.lineWidth = 1;

    const gridN = 6;
    for (let i = 0; i <= gridN; i++) {
      const yy = pad.t + (i / gridN) * (h - pad.t - pad.b);
      ctx.strokeStyle = chartGridMajor;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(w - pad.r, yy);
      ctx.stroke();
    }

    const vN = 8;
    for (let i = 0; i <= vN; i++) {
      const xx = pad.l + (i / vN) * (w - pad.l - pad.r);
      ctx.strokeStyle = chartGridMinor;
      ctx.beginPath();
      ctx.moveTo(xx, pad.t);
      ctx.lineTo(xx, h - pad.b);
      ctx.stroke();
    }
    ctx.restore();

    // Baseline emphasis
    ctx.save();
    ctx.strokeStyle = chartGridMajor;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();
    ctx.restore();

    // Significant marker lines + baseline triangles + labels
    if (sig.length) {
      ctx.save();
      ctx.strokeStyle = chartTextSoft;
      ctx.fillStyle = chartTextSoft;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 1;

      ctx.font = `10px ${css.getPropertyValue("--mono") || "ui-monospace"}`;

      // simple label collision avoidance: only label if far enough from previous label
      let lastLabelX = -Infinity;
      const minLabelGap = 110; // px

      for (const m of sig) {
        const px = clamp(x(m.t), pad.l, w - pad.r);

        // vertical line
        ctx.beginPath();
        ctx.moveTo(px, pad.t);
        ctx.lineTo(px, h - pad.b);
        ctx.stroke();

        // baseline triangle
        const by = h - pad.b;
        ctx.beginPath();
        ctx.moveTo(px, by + 2);
        ctx.lineTo(px - 5, by + 10);
        ctx.lineTo(px + 5, by + 10);
        ctx.closePath();
        ctx.fill();

        // label near top (only if not too crowded)
        const label = m.label;
        const tw = ctx.measureText(label).width;
        const lx = clamp(px - tw / 2, pad.l, (w - pad.r) - tw);
        const ly = pad.t + 14;

        if (lx - lastLabelX >= minLabelGap) {
          ctx.globalAlpha = 0.64;
          ctx.fillText(label, lx, ly);
          ctx.globalAlpha = 0.72;
          lastLabelX = lx;
        }
      }

      ctx.restore();
    }

    // Axis labels (left)
    ctx.save();
    ctx.fillStyle = chartText;
    ctx.globalAlpha = 0.94;
    ctx.font = `11px ${css.getPropertyValue("--mono") || "ui-monospace"}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i < axisTicks.length; i++) {
      const yy = y(axisTicks[i]);
      ctx.fillText(axisTickLabels[i], pad.l - 10, yy);
    }

    ctx.fillStyle = chartTextSoft;
    ctx.globalAlpha = 0.88;
    ctx.font = `10px ${css.getPropertyValue("--mono") || "ui-monospace"}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(axisMeta.unitLabel, 10, Math.max(12, pad.t - 14));

    // Date range labels
    const d0 = new Date(minT);
    const d1 = new Date(maxT2);
    ctx.fillStyle = chartTextSoft;
    ctx.globalAlpha = 0.82;
    ctx.textAlign = "left";
    ctx.fillText(d0.toISOString().slice(0, 10), pad.l, h - 12);
    const endStr = d1.toISOString().slice(0, 10);
    const endW = ctx.measureText(endStr).width;
    ctx.fillText(endStr, w - pad.r - endW, h - 12);
    ctx.restore();

    // Area gradient (tape-style fade, bottom-weighted)
    ctx.save();
    const grad = ctx.createLinearGradient(0, h - pad.b, 0, pad.t);
    grad.addColorStop(0, "rgba(76,214,155,0.24)");
    grad.addColorStop(0.45, "rgba(76,214,155,0.12)");
    grad.addColorStop(1, "rgba(76,214,155,0.02)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x(data[0].t), h - pad.b);
    for (const p of data) ctx.lineTo(x(p.t), y(p.v));
    ctx.lineTo(x(data.at(-1).t), h - pad.b);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Line
    ctx.save();
    ctx.strokeStyle = chartLine;
    ctx.lineWidth = 2.55;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = chartLineGlow;
    ctx.shadowBlur = 6;
    ctx.globalAlpha = hover ? 1 : 0.92;
    ctx.beginPath();
    ctx.moveTo(x(data[0].t), y(data[0].v));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(x(data[i].t), y(data[i].v));
    }
    ctx.stroke();
    ctx.restore();

    // Points (sparingly)
    ctx.save();
    ctx.fillStyle = chartPoint;
    ctx.globalAlpha = 0.72;
    const step = Math.max(1, Math.floor(data.length / 22));
    for (let i = 0; i < data.length; i += step) {
      const px = x(data[i].t);
      const py = y(data[i].v);
      ctx.beginPath();
      ctx.roundRect(px - 2, py - 2, 4, 4, 2);
      ctx.fill();
    }
    ctx.restore();

    // Hover crosshair
    if (hover) {
      const px = x(hover.t);
      const py = y(hover.v);

      ctx.save();
      ctx.strokeStyle = chartCrosshair;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(px, pad.t);
      ctx.lineTo(px, h - pad.b);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pad.l, py);
      ctx.lineTo(w - pad.r, py);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = chartLine;
      ctx.beginPath();
      ctx.roundRect(px - 4, py - 4, 8, 8, 3);
      ctx.fill();
      ctx.restore();
    }

    // Header pills
    if (rangeEl) rangeEl.textContent = `${new Date(minT).toISOString().slice(0, 7)} → ${new Date(maxT2).toISOString().slice(0, 7)}`;
    if (latestEl) {
      const last = data.at(-1);
      latestEl.textContent = `Latest: ${formatYValue(last.v, axisMeta, "pill")}`;
    }
    if (titleEl) {
      const t = canvas.getAttribute("data-title");
      if (t) titleEl.textContent = t;
    }
  }

  function nearestPoint(mouseX) {
    if (!data.length) return null;
    const w = canvas.getBoundingClientRect().width;
    const padL = pad.l, padR = pad.r;

    // Map mouseX back to t
    const minT = data[0].t;
    const maxT = data.at(-1).t;
    const spanT = (maxT - minT) || 1;

    const clampedX = Math.max(padL, Math.min(w - padR, mouseX));
    const tGuess = minT + ((clampedX - padL) / (w - padL - padR)) * spanT;

    // binary search nearest
    let lo = 0, hi = data.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (data[mid].t < tGuess) lo = mid + 1;
      else hi = mid;
    }
    const i = lo;
    const a = data[Math.max(0, i - 1)];
    const b = data[i];
    return (Math.abs(a.t - tGuess) < Math.abs(b.t - tGuess)) ? a : b;
  }

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    hover = nearestPoint(mx);
    if (!hover) { if (tip) tip.classList.remove("is-on"); draw(); return; }
    draw();

    if (tip && hover) {
      tip.classList.add("is-on");

      const cardRect = (root instanceof Document) ? rect : root.getBoundingClientRect();
      const leftWithinCard = (e.clientX - cardRect.left) + 18;
      const maxLeft = cardRect.width - 300;

      tip.style.left = `${Math.min(maxLeft, Math.max(14, leftWithinCard))}px`;
      tip.style.top = `14px`;

      // Add significant label when close to a marker (±3 days) or inside a window.
      const day = 1000 * 60 * 60 * 24;

      const nearestSig = (() => {
        let best = null;
        let bestDist = Infinity;
        for (const m of sig) {
          const dist = Math.abs(m.t - hover.t);
          if (dist < bestDist) { bestDist = dist; best = m; }
        }
        return (best && bestDist <= 3 * day) ? best.label : null;
      })();

      const inSigWindow = (() => {
        for (const win of sigWins) {
          if (hover.t >= win.start && hover.t <= win.end) return win.label;
        }
        return null;
      })();

      const sigLabel = nearestSig || inSigWindow;

      tip.textContent =
        `${hover.d}  •  ${formatYValue(hover.v, axisMeta, "tooltip")}` +
        (sigLabel ? `  •  ${sigLabel}` : "");
    }
  });

  canvas.addEventListener("mouseleave", () => {
    hover = null;
    if (tip) tip.classList.remove("is-on");
    draw();
  });

  window.addEventListener("resize", resize, { passive: true });
  resize();
}

async function initWireCharts() {
  const canvases = Array.from(document.querySelectorAll("canvas.wireChart[data-csv]"));
  if (!canvases.length) return;

  await Promise.all(canvases.map(async (canvas) => {
    const csvPath = canvas.getAttribute("data-csv");
    if (!csvPath) return;

    try {
      const series = await loadSeries(csvPath);
      renderWireChart(canvas, series, { root: canvas.closest(".chartCard") || document });
    } catch (err) {
      const root = canvas.closest(".chartCard") || document;
      const tip = root.querySelector(".chartTip");
      if (tip) {
        tip.classList.add("is-on");
        tip.style.left = "14px";
        tip.style.top = "14px";
        tip.textContent = `Chart error: ${err?.message || String(err)}`;
      }
    }
  }));
}

window.initWireCharts = initWireCharts;

document.addEventListener("DOMContentLoaded", () => {
  initWireCharts();
});
