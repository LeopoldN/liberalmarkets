// The margin aquariums: one ascii-sharks world per side, swimming up and down.
import { OceanEngine } from "../aquarium/engine.js";
import { THEMES } from "../aquarium/renderer.js";

const KINDS = ["classic", "hammerhead", "tiger", "mako", "thresher", "zebra", "greathammer", "nurse"];

function pickKinds() {
  const pool = KINDS.slice();
  const take = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  return [take(), take()];
}

/** The monochrome palette for the current theme, on exactly the page's paper. */
function paletteFor(dark) {
  const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
  const base = dark ? THEMES.dark : THEMES.light;
  return paper ? { ...base, bg: paper } : base;
}

/** Figures sit in the reading column, so on paper their light tones are pulled darker. */
function figurePalette(dark) {
  const palette = paletteFor(dark);
  if (dark) return palette;
  return { ...palette, hi: palette.hi.map((h, k) => Math.round(palette.lo[k] + (h - palette.lo[k]) * 0.7)) };
}

export function startTanks({ isDark }) {
  const tanks = [...document.querySelectorAll(".tank")];
  if (!tanks.length || !window.ResizeObserver || !window.IntersectionObserver) return null;
  if (tanks[0].dataset.scene) return startSpace(tanks, isDark);

  const kinds = pickKinds();
  const tall = window.innerHeight > 820;
  const engines = tanks.map((tank, i) => {
    const sharks = [{ kind: kinds[i], size: 1 }];
    if (tall) sharks.push({ kind: kinds[i], size: 0.72 });
    const tankWidth = Math.max(200, (window.innerWidth - 820) / 2);
    const fishCount = Math.round(Math.min(200, Math.max(60, (tankWidth * window.innerHeight) / 2200)));
    return new OceanEngine(tank.querySelector("canvas"), {
      sharks,
      fishCount,
      vertical: true,
      cellSize: 6,
      theme: paletteFor(isDark()),
    });
  });

  return {
    setTheme() {
      const palette = paletteFor(isDark());
      for (const engine of engines) engine.setTheme(palette);
    },
    setEnabled(on) {
      for (const engine of engines) on ? engine.play() : engine.pause();
    },
  };
}

/**
 * Pages can swap the aquarium for another scene with data-scene on each .tank
 * (e.g. "launch" and "orbit" on the ASTS article). The scene code loads only there.
 */
function startSpace(tanks, isDark) {
  let engines = [];
  let figures = [];
  let enabled = true;
  import("../space/engine.js").then(({ SpaceEngine }) => {
    engines = tanks.map(
      (tank) =>
        new SpaceEngine(tank.querySelector("canvas"), {
          scene: tank.dataset.scene,
          cellSize: 5,
          theme: paletteFor(isDark()),
        }),
    );
    if (!enabled) for (const engine of engines) engine.pause();
    // Figures inside the article (canvas[data-figure-scene]) are content, so the margin
    // toggle leaves them running.
    figures = [...document.querySelectorAll("canvas[data-figure-scene]")].map(
      (canvas) =>
        new SpaceEngine(canvas, {
          scene: canvas.dataset.figureScene,
          cellSize: canvas.clientWidth < 520 ? 4 : 5,
          theme: figurePalette(isDark()),
        }),
    );
  });
  return {
    setTheme() {
      const palette = paletteFor(isDark());
      for (const engine of engines) engine.setTheme(palette);
      for (const engine of figures) engine.setTheme(figurePalette(isDark()));
    },
    setEnabled(on) {
      enabled = on;
      for (const engine of engines) on ? engine.play() : engine.pause();
    },
  };
}
