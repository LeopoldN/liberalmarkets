// The margin aquariums: one ascii-sharks world per side, swimming up and down.
import { OceanEngine } from "../aquarium/engine.js";
import { THEMES } from "../aquarium/renderer.js";

const KINDS = ["classic", "hammerhead", "tiger", "mako", "thresher", "zebra", "greathammer", "nurse"];
const NAMES = {
  classic: "REEF SHARK",
  hammerhead: "HAMMERHEAD",
  tiger: "TIGER SHARK",
  mako: "MAKO",
  thresher: "THRESHER",
  zebra: "ZEBRA SHARK",
  greathammer: "GREAT HAMMERHEAD",
  nurse: "NURSE SHARK",
};

function pickKinds() {
  const pool = KINDS.slice();
  const take = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  return [take(), take()];
}

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
    const canvas = tank.querySelector("canvas");
    const sharks = [{ kind: kinds[i], size: 1 }];
    if (tall) sharks.push({ kind: kinds[i], size: 0.72 });
    const area = Math.max(1, (window.innerWidth - 1120) / 2) * window.innerHeight;
    const fishCount = Math.round(Math.min(150, Math.max(50, area / 2600)));
    const engine = new OceanEngine(canvas, { sharks, fishCount, vertical: true, theme: paletteFor(isDark()) });
    return { engine, hud: tank.querySelector("[data-hud]"), name: NAMES[kinds[i]] };
  });

  const updateHud = () => {
    for (const { engine, hud, name } of engines) {
      const alive = engine.world.fish.reduce((n, f) => n + (f.alive ? 1 : 0), 0);
      hud.textContent = `${alive} FISH · ${engine.world.sharks.length}× ${name}`;
    }
  };
  updateHud();
  setInterval(updateHud, 1000);

  return {
    setTheme() {
      const palette = paletteFor(isDark());
      for (const { engine } of engines) engine.setTheme(palette);
    },
    setEnabled(on) {
      for (const { engine } of engines) on ? engine.play() : engine.pause();
    },
  };
}
