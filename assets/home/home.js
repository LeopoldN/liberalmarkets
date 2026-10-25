// Homepage wiring: theme and aquarium toggles, then each section fills itself in.
import { startTanks } from "./tanks.js";
import { renderWire } from "./wire.js";
import { renderDesk } from "./desk.js";
import { renderPosts } from "./posts.js";
import { startOrbit } from "./orbit.js";
import { startSearch } from "./search.js";

const root = document.documentElement;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    // Private mode or blocked storage: the toggle still works for this visit.
  }
}

const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : systemDark.matches);

// ── Date ────────────────────────────────────────────────────────────────
const today = document.querySelector("[data-today]");
if (today) {
  const now = new Date();
  today.dateTime = now.toISOString().slice(0, 10);
  today.textContent = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── Aquarium ────────────────────────────────────────────────────────────
const tanks = startTanks({ isDark });
const fishBtn = document.querySelector("[data-fish-toggle]");

function syncFish() {
  const on = root.dataset.fish !== "off";
  fishBtn?.setAttribute("aria-pressed", String(on));
  if (fishBtn) fishBtn.title = on ? "Hide the aquarium" : "Show the aquarium";
  tanks?.setEnabled(on);
}

fishBtn?.addEventListener("click", () => {
  const on = root.dataset.fish === "off";
  if (on) delete root.dataset.fish;
  else root.dataset.fish = "off";
  store("lm-fish", on ? null : "off");
  syncFish();
});
syncFish();

// ── Theme ───────────────────────────────────────────────────────────────
const themeBtn = document.querySelector("[data-theme-toggle]");

function syncTheme() {
  const dark = isDark();
  themeBtn?.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  if (themeBtn) themeBtn.title = dark ? "Day mode" : "Night mode";
  tanks?.setTheme();
  document.dispatchEvent(new CustomEvent("lm:theme", { detail: { dark } }));
}

themeBtn?.addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  // Back to following the system when the choice matches it.
  if ((next === "dark") === systemDark.matches) {
    delete root.dataset.theme;
    store("lm-theme", null);
  } else {
    root.dataset.theme = next;
    store("lm-theme", next);
  }
  syncTheme();
});
systemDark.addEventListener("change", () => {
  if (!root.dataset.theme) syncTheme();
});
syncTheme();

// ── Sections ────────────────────────────────────────────────────────────
startOrbit(document.querySelector("[data-orbit]"));
const wire = renderWire(document.querySelector("[data-wire]"), document.querySelector("[data-wire-meta]"));
const posts = renderPosts(document.querySelector("[data-posts]"));
const desk = renderDesk(document.querySelector("[data-desk]"));
startSearch({ sources: [posts, desk, wire] });
