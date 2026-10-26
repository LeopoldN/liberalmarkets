// Page wiring for the homepage, the article archive, article pages and the Trump Tracker: theme and
// aquarium toggles, the news ticker, then whichever sections the page has fill themselves in.
import { startTanks } from "./tanks.js";
import { renderWire } from "./wire.js";
import { renderIndicators } from "./desk.js";
import { renderPosts } from "./posts.js";
import { startSearch } from "./search.js";
import { loadArticles, renderRecent, renderArchive, renderNext, articleEntries } from "./articles.js";

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
  today.textContent = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// ── Aquarium ────────────────────────────────────────────────────────────
const tanks = startTanks({ isDark });
const fishBtn = document.querySelector("[data-fish-toggle]");

function syncFish() {
  const on = root.dataset.fish !== "off";
  fishBtn?.setAttribute("aria-pressed", String(on));
  fishBtn?.setAttribute("aria-label", on ? "Fish on. Hide the aquarium" : "Fish off. Show the aquarium");
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
  if (themeBtn) {
    themeBtn.textContent = dark ? "Day" : "Night";
    themeBtn.setAttribute("aria-label", dark ? "Switch to day mode" : "Switch to night mode");
  }
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
const $ = (sel) => document.querySelector(sel);
const wire = renderWire($("[data-wire]"));
const posts = renderPosts($("[data-posts]"));
const desk = renderIndicators($("[data-indicators]"));
const articles = loadArticles().then((list) => {
  renderRecent({ list: $("[data-recent]"), input: $("[data-recent-search]"), more: $("[data-recent-more]"), status: $("[data-recent-status]") }, list);
  renderArchive({ list: $("[data-archive]"), input: $("[data-archive-search]"), topics: $("[data-archive-topics]"), count: $("[data-archive-count]") }, list);
  renderNext({ list: $("[data-next]"), section: $("[data-next-section]") }, list);
  return articleEntries(list);
});
// The tracker, or any page with a chart figure, loads the chart template only when it needs it.
const trackerRoot = $("[data-tracker]");
const charts = trackerRoot
  ? import("./tracker.js?v=20261025b").then((m) => m.startTracker(trackerRoot))
  : $("figure[data-chart]")
    ? import("./chart.js?v=20261025b").then((m) => m.mountAll()).then(() => [])
    : Promise.resolve([]);
// Elon Time draws its clock and file from data/elon-claims.json.
const claimsRoot = $("[data-claims]");
const claims = claimsRoot
  ? import("./claims.js?v=20261026c").then((m) => m.startClaims(claimsRoot))
  : Promise.resolve([]);
startSearch({ sources: [articles, posts, desk, wire, charts.catch(() => []), claims.catch(() => [])] });
