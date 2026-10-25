// Lead art: an ASCII Earth turning under a satellite in low orbit, drawn into a <pre>.

const LAND = " .:-=+*#%@";
const TILT = 0.38;
const FPS = 14;

/** Rough continents from a few layered waves; enough to read as land and sea. */
function land(lon, lat) {
  const f =
    Math.sin(3 * lon + 1.3 * Math.sin(2 * lat)) * Math.cos(2 * lat) +
    0.55 * Math.sin(5 * lon - 2 * lat + 1) +
    0.35 * Math.cos(7 * lat + 2 * lon);
  return f - 0.35;
}

function escape(ch) {
  return ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === "&" ? "&amp;" : ch;
}

export function startOrbit(pre) {
  if (!pre) return;
  const box = pre.parentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let cols = 48;
  let rows = 22;
  let aspect = 0.55;
  let raf = 0;
  let last = 0;
  let visible = true;
  const isDark = () => getComputedStyle(document.documentElement).colorScheme === "dark";
  let dark = isDark();
  const start = performance.now();

  function measure() {
    const probe = document.createElement("span");
    probe.textContent = "M".repeat(10);
    pre.append(probe);
    const w = probe.getBoundingClientRect().width / 10 || 6.6;
    const h = parseFloat(getComputedStyle(pre).lineHeight) || 11;
    probe.remove();
    aspect = w / h;
    const rect = box.getBoundingClientRect();
    cols = Math.max(24, Math.min(72, Math.floor(rect.width / w) - 4));
    rows = Math.max(14, Math.min(30, Math.floor(rect.height / h) - 4));
  }

  function draw(t) {
    const cx = cols / 2;
    const cy = rows / 2;
    // Radius in rows; columns are narrower, so x is stretched by the cell aspect.
    const R = Math.min(rows * 0.4, cols * aspect * 0.34);
    const spin = t * 0.18;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(" "));
    const cls = Array.from({ length: rows }, () => Array(cols).fill(""));
    const L = [-0.55, 0.55, 0.63];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = ((c + 0.5 - cx) * aspect) / R;
        const y = (cy - (r + 0.5)) / R;
        const d2 = x * x + y * y;
        if (d2 > 1) continue;
        const z = Math.sqrt(1 - d2);
        // Undo the axial tilt, then read latitude/longitude.
        const yy = y * Math.cos(TILT) - z * Math.sin(TILT);
        const zz = y * Math.sin(TILT) + z * Math.cos(TILT);
        const lat = Math.asin(Math.max(-1, Math.min(1, yy)));
        const lon = Math.atan2(x, zz) + spin;
        const light = Math.max(0, x * L[0] + y * L[1] + z * L[2]);
        const h = land(lon, lat);
        if (h > 0) {
          // Ink on paper: shadowed land is dense, sunlit land sparse. Light on night: the reverse.
          const v = Math.min(1, 0.15 + (dark ? light : 1 - light) * 0.85);
          grid[r][c] = LAND[Math.min(LAND.length - 1, Math.floor(v * (LAND.length - 1)) + 1)];
        } else {
          // Sea: a graticule every 30°, faint on the night side.
          const glat = Math.abs(((lat * 180) / Math.PI) % 30) < 2.2;
          const glon = Math.abs((((lon * 180) / Math.PI) % 30 + 30) % 30) < 3;
          if ((glat || glon) && light > 0.08) grid[r][c] = "·";
          else if (d2 > 0.86) grid[r][c] = light > 0.2 ? "'" : ".";
        }
      }
    }

    // Satellite on an inclined orbit; hidden while it passes behind the planet.
    const a = t * 0.55;
    const orbit = 1.42;
    const inc = 0.5;
    const sx = Math.cos(a) * orbit;
    const sy = Math.sin(a) * orbit * Math.sin(inc) * 0.55 + Math.sin(a) * 0.18;
    const sz = Math.sin(a) * orbit * Math.cos(inc);
    const col = Math.round(cx + (sx * R) / aspect);
    const row = Math.round(cy - sy * R);
    const behind = sz < 0 && sx * sx + sy * sy < 1;
    if (!behind && row >= 0 && row < rows) {
      const sat = "=[■]=";
      for (let k = 0; k < sat.length; k++) {
        const c = col - 2 + k;
        if (c >= 0 && c < cols) { grid[row][c] = sat[k]; cls[row][c] = "sat"; }
      }
      // A coverage beam down toward the sub-satellite point, when in front.
      if (sz > 0) {
        const steps = 6;
        for (let k = 1; k <= steps; k++) {
          const f = k / (steps + 1);
          const bx = sx * (1 - f * 0.55);
          const by = sy * (1 - f * 0.55);
          if (bx * bx + by * by < 0.98) break;
          const br = Math.round(cy - by * R);
          const bc = Math.round(cx + (bx * R) / aspect);
          if (br >= 0 && br < rows && bc >= 0 && bc < cols && grid[br][bc] === " ") {
            grid[br][bc] = k % 2 ? ":" : "·";
            cls[br][bc] = "beam";
          }
        }
      }
    }

    let html = "";
    for (let r = 0; r < rows; r++) {
      let run = "";
      let runCls = "";
      for (let c = 0; c < cols; c++) {
        const k = cls[r][c];
        if (k !== runCls) {
          html += runCls ? `<span class="${runCls}">${run}</span>` : run;
          run = "";
          runCls = k;
        }
        run += escape(grid[r][c]);
      }
      html += runCls ? `<span class="${runCls}">${run}</span>` : run;
      html += "\n";
    }
    pre.innerHTML = html;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / FPS) return;
    last = now;
    draw((now - start) / 1000);
  }

  function schedule() {
    cancelAnimationFrame(raf);
    if (reduced.matches || !visible) {
      draw(4);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  measure();
  draw(0);
  new ResizeObserver(() => { measure(); draw((performance.now() - start) / 1000); }).observe(box);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }).observe(box);
  reduced.addEventListener("change", schedule);
  document.addEventListener("lm:theme", () => { dark = isDark(); draw((performance.now() - start) / 1000); });
  document.fonts?.ready.then(() => { measure(); draw((performance.now() - start) / 1000); });
}
