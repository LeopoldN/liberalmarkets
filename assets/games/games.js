// Shared wiring for the games pages. The game styles key on an explicit data-theme, so after the
// site's Night toggle runs, the attribute is set either way. On the hub, each game shows how today's
// puzzle went in this browser, along with the time until the next set.
(() => {
  "use strict";

  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  function savedTheme() {
    try {
      const theme = localStorage.getItem("lm-theme");
      return theme === "light" || theme === "dark" ? theme : null;
    } catch (e) {
      return null;
    }
  }

  function applyTheme(dark) {
    root.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#121110" : "#fff1e5");
  }

  document.addEventListener("lm:theme", (event) => applyTheme(event.detail.dark));
  systemDark.addEventListener("change", () => {
    if (savedTheme()) return;
    applyTheme(systemDark.matches);
    document.dispatchEvent(new CustomEvent("lm:theme", { detail: { dark: systemDark.matches } }));
  });
  applyTheme(root.dataset.theme === "dark");

  if (root.dataset.page !== "hub") return;

  // ── Today's progress ──────────────────────────────────────────────────
  // Puzzle numbers and storage keys match trade-game.js and globe-game.js.
  const EPOCH_UTC = Date.UTC(2026, 7, 20);
  const DAY_MS = 86_400_000;
  const GAMES = [
    { id: "exportle", guesses: 6 },
    { id: "importle", guesses: 6 },
    { id: "truddies", guesses: 6 },
    { id: "then-now", guesses: 6 },
    { id: "productle", guesses: 5 },
    { id: "tradeoffs", guesses: 1 }
  ];

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  }

  function keysStartingWith(prefix) {
    try {
      return Object.keys(localStorage).filter((key) => key.startsWith(prefix));
    } catch (e) {
      return [];
    }
  }

  function dailyResult(game, puzzle) {
    const state = keysStartingWith(`${game.id}-v1:puzzle:${puzzle}:`).map(read).find(Boolean);
    const stats = read(`${game.id}-v1:stats`);
    const streak = stats && stats.lastWinPuzzle >= puzzle - 1 ? Number(stats.currentStreak) || 0 : 0;
    const used = Array.isArray(state?.guesses) ? state.guesses.length : 0;

    if (state?.finished && state.won) {
      const text = game.guesses === 1 ? "Solved" : `Solved in ${used}`;
      return { kind: "won", text: streak > 1 ? `${text} · ${streak}-day streak` : text };
    }
    if (state?.finished) return { kind: "lost", text: state.gaveUp ? "Revealed" : "Missed" };
    if (used) return { kind: "open", text: `${used} of ${game.guesses} guesses used` };
    return { kind: "none", text: streak > 0 ? `Not played · ${streak}-day streak` : "Not played" };
  }

  function pairsResult() {
    const date = new Date().toISOString().slice(0, 10);
    const state = read(`trade-pairs:v1:${date}`);
    const solved = Array.isArray(state?.solved) ? state.solved.length : 0;
    const wrong = Array.isArray(state?.wrong) ? state.wrong.length : 0;
    if (solved === 4) return { kind: "won", text: wrong ? `Solved · ${wrong} ${wrong === 1 ? "mistake" : "mistakes"}` : "Solved, no mistakes" };
    if (wrong >= 4) return { kind: "lost", text: `Missed · ${solved} of 4 pairs` };
    if (solved || wrong) return { kind: "open", text: `${solved} of 4 pairs found` };
    return { kind: "none", text: "Not played" };
  }

  function renderProgress() {
    const puzzle = Math.max(1, Math.floor((Date.now() - EPOCH_UTC) / DAY_MS) + 1);
    const results = new Map(GAMES.map((game) => [game.id, dailyResult(game, puzzle)]));
    results.set("trade-pairs", pairsResult());

    results.forEach((result, id) => {
      const status = document.querySelector(`[data-status="${id}"]`);
      if (status) {
        status.textContent = result.text;
        status.dataset.kind = result.kind;
      }
      const go = document.querySelector(`[data-go="${id}"]`);
      if (go) go.textContent = result.kind === "none" ? "Play" : result.kind === "open" ? "Continue" : "See result";
      const box = document.querySelector(`[data-tally-for="${id}"]`);
      if (box) box.dataset.kind = result.kind;
    });

    const all = [...results.values()];
    const done = all.filter((r) => r.kind === "won" || r.kind === "lost").length;
    const won = all.filter((r) => r.kind === "won").length;
    const text = document.querySelector("[data-tally-text]");
    if (text) {
      text.textContent = done === 0
        ? "None played yet today"
        : done === all.length
          ? `All ${all.length} played today · ${won} solved`
          : `${done} of ${all.length} played today · ${won} solved`;
    }
  }

  // ── Date and the next set ─────────────────────────────────────────────
  function renderClock() {
    const now = new Date();
    const date = document.querySelector("[data-games-date]");
    if (date) {
      date.dateTime = now.toISOString().slice(0, 10);
      date.textContent = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    }
    const next = document.querySelector("[data-games-next]");
    if (next) {
      const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      const minutes = Math.max(1, Math.ceil((midnight - now) / 60000));
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      next.textContent = `Next set in ${h ? `${h} h ` : ""}${m} min`;
    }
  }

  function refresh() {
    renderProgress();
    renderClock();
  }

  document.addEventListener("DOMContentLoaded", refresh);
  window.addEventListener("pageshow", refresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  window.setInterval(renderClock, 30000);
})();
