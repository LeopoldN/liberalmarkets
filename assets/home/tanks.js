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

export function startTanks({ isDark }) {
  const tanks = [...document.querySelectorAll(".tank")];
  if (!tanks.length || !window.ResizeObserver || !window.IntersectionObserver) return null;

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
