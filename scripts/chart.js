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
 * @param {{title?: string}} opts
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

  // Choose a readable slice: last ~5 years (or all if shorter)
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

  const pad = { l: 44, r: 18, t: 18, b: 34 };
  let hover = null;
  let elect = [];

  /**
   * US presidential election day:
   * Tuesday following the first Monday in November.
   * @param {number} year
   * @returns {Date}
   */
  function usElectionDay(year) {
    const d = new Date(Date.UTC(year, 10, 1)); // Nov 1
    const dow = d.getUTCDay(); // 0 Sun..6 Sat

    // First Monday in November
    const firstMonday = new Date(d);
    const offsetToMonday = (1 - dow + 7) % 7;
    firstMonday.setUTCDate(1 + offsetToMonday);

    // Election day: Tuesday after first Monday
    const election = new Date(firstMonday);
    election.setUTCDate(firstMonday.getUTCDate() + 1);
    return election;
  }

  /**
   * Election shading windows in [minT, maxT]
   * Window: 30d before → 10d after election day
   * @param {number} minTms
   * @param {number} maxTms
   * @returns {{start:number,end:number,label:string}[]}
   */
  function electionWindows(minTms, maxTms) {
    const out = [];
    const minY = new Date(minTms).getUTCFullYear();
    const maxY = new Date(maxTms).getUTCFullYear();

    for (let y = minY; y <= maxY; y++) {
      if (y % 4 !== 0) continue;
      const ed = usElectionDay(y).getTime();
      const start = ed - 1000 * 60 * 60 * 24 * 30;
      const end = ed + 1000 * 60 * 60 * 24 * 10;
      if (end < minTms || start > maxTms) continue;
      out.push({
        start: Math.max(start, minTms),
        end: Math.min(end, maxTms),
        label: `Election ${y}`,
      });
    }
    return out;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
        elect = [];
        if (tip) tip.classList.remove("is-on");
        resize(); // redraw using new slice + current size
      });
    });
  }

  function draw() {
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;

    ctx.clearRect(0, 0, w, h);
    // Subtle vignette to make the plot feel "framed"
    ctx.save();
    const vign = ctx.createRadialGradient(
      w * 0.5, h * 0.35, Math.min(w, h) * 0.10,
      w * 0.5, h * 0.45, Math.min(w, h) * 0.85
    );
    vign.addColorStop(0, "rgba(163,177,138,0.06)");
    vign.addColorStop(1, "rgba(52,78,65,0.03)");
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // If no data, draw a polite placeholder
    if (data.length < 2) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = ink;
      ctx.font = `12px ${css.getPropertyValue("--mono") || "ui-monospace"}`;
      ctx.fillText("No data to plot.", pad.l, pad.t + 14);
      ctx.globalAlpha = 1;
      return;
    }

    const minV = Math.min(...data.map(p => p.v));
    const maxV = Math.max(...data.map(p => p.v));
    const spanV = (maxV - minV) || 1;

    const minT = data[0].t;
    const maxT2 = data.at(-1).t;
    const spanT = (maxT2 - minT) || 1;

    const x = (t) => pad.l + ((t - minT) / spanT) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - minV) / spanV) * (h - pad.t - pad.b);

    // Regime shading: elections (30d before → 10d after)
    elect = electionWindows(minT, maxT2);
    if (elect.length) {
      ctx.save();
      for (const win of elect) {
        const x0 = x(win.start);
        const x1 = x(win.end);

        const g = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
        g.addColorStop(0, "rgba(88,129,87,0.06)");
        g.addColorStop(1, "rgba(58,90,64,0.11)");
        ctx.fillStyle = g;

        ctx.fillRect(x0, pad.t, Math.max(1, x1 - x0), (h - pad.t - pad.b));

        // subtle border so it reads as intentional
        ctx.strokeStyle = "rgba(52,78,65,0.14)";
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
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;

    const gridN = 6;
    for (let i = 0; i <= gridN; i++) {
      const yy = pad.t + (i / gridN) * (h - pad.t - pad.b);
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(w - pad.r, yy);
      ctx.stroke();
    }

    const vN = 8;
    for (let i = 0; i <= vN; i++) {
      const xx = pad.l + (i / vN) * (w - pad.l - pad.r);
      ctx.beginPath();
      ctx.moveTo(xx, pad.t);
      ctx.lineTo(xx, h - pad.b);
      ctx.stroke();
    }
    ctx.restore();

    // Baseline emphasis
    ctx.save();
    ctx.strokeStyle = "rgba(52,78,65,0.35)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();
    ctx.restore();

    // Election markers on baseline (tiny triangles)
    if (elect.length) {
      ctx.save();
      ctx.fillStyle = "rgba(52,78,65,0.55)";
      ctx.globalAlpha = 0.75;

      for (const win of elect) {
        const mid = (win.start + win.end) / 2;
        const px = clamp(x(mid), pad.l, w - pad.r);
        const by = h - pad.b;

        ctx.beginPath();
        ctx.moveTo(px, by + 2);
        ctx.lineTo(px - 5, by + 10);
        ctx.lineTo(px + 5, by + 10);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Axis labels (left)
    ctx.save();
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.85;
    ctx.font = `11px ${css.getPropertyValue("--mono") || "ui-monospace"}`;

    for (let i = 0; i <= 3; i++) {
      const vv = minV + (i / 3) * spanV;
      const yy = y(vv);
      ctx.fillText(vv.toFixed(1), 8, yy + 4);
    }

    // Date range labels
    const d0 = new Date(minT);
    const d1 = new Date(maxT2);
    ctx.fillText(d0.toISOString().slice(0, 10), pad.l, h - 12);
    const endStr = d1.toISOString().slice(0, 10);
    const endW = ctx.measureText(endStr).width;
    ctx.fillText(endStr, w - pad.r - endW, h - 12);
    ctx.restore();

    // Area gradient (tape-style fade, bottom-weighted)
    ctx.save();
    const grad = ctx.createLinearGradient(0, h - pad.b, 0, pad.t);
    grad.addColorStop(0, "rgba(58,90,64,0.20)");
    grad.addColorStop(0.45, "rgba(58,90,64,0.10)");
    grad.addColorStop(1, "rgba(58,90,64,0.02)");
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
    ctx.strokeStyle = forest;
    ctx.lineWidth = 2.25;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(52,78,65,0.25)";
    ctx.shadowBlur = 4;
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
    ctx.fillStyle = forest;
    ctx.globalAlpha = 0.58;
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
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.55;
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
      ctx.fillStyle = forest;
      ctx.beginPath();
      ctx.roundRect(px - 4, py - 4, 8, 8, 3);
      ctx.fill();
      ctx.restore();
    }

    // Header pills
    if (rangeEl) rangeEl.textContent = `${new Date(minT).toISOString().slice(0, 7)} → ${new Date(maxT2).toISOString().slice(0, 7)}`;
    if (latestEl) {
      const last = data.at(-1);
      latestEl.textContent = `Latest: ${last.v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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

      const inElection = (() => {
        for (const win of elect) {
          if (hover.t >= win.start && hover.t <= win.end) return win.label;
        }
        return null;
      })();

      tip.textContent =
        `${hover.d}  •  ${hover.v.toLocaleString(undefined, { maximumFractionDigits: 3 })}` +
        (inElection ? `  •  ${inElection}` : "");
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