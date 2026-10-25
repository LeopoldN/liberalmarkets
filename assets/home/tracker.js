// Trump Tracker page. Every series is prepared up front for the report card, the section lists and the
// table; each section then shows one chart at a time, swapped by picking a measure from its list.
import { loadPrepared, mountChart, setRange, RANGES, DEFAULT_RANGE, formatValue, formatChange, sinceLabel, arrowFor, periodLabel } from "./chart.js?v=20261025b";

const RANGE_KEY = "lm-tracker-range";
const VERDICT = { good: "better", bad: "worse", even: "not scored" };

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function savedRange() {
  try {
    const key = localStorage.getItem(RANGE_KEY);
    return RANGES[key] ? key : DEFAULT_RANGE;
  } catch (e) {
    return DEFAULT_RANGE;
  }
}

function rangeControl(group, initial) {
  if (!group) return;
  const buttons = Object.entries(RANGES).map(([key, range]) => {
    const btn = el("button", "filter", range.label);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(key === initial));
    btn.addEventListener("click", () => {
      for (const b of buttons) b.setAttribute("aria-pressed", String(b === btn));
      setRange(key);
      try { localStorage.setItem(RANGE_KEY, key); } catch (e) {}
    });
    return btn;
  });
  group.replaceChildren(...buttons);
}

/** Keeps the section bar pinned just under the masthead, whose height changes as it wraps. */
function pinTools(tools) {
  const bar = document.querySelector(".bar");
  if (!tools || !bar) return;
  const sync = () => document.documentElement.style.setProperty("--masthead-h", `${bar.offsetHeight}px`);
  new ResizeObserver(sync).observe(bar);
  sync();
}

const tone = (prep) => (prep.spec.good ? prep.tone : "even");

function delta(prep) {
  const span = el("span", `chart__delta is-${prep.tone}`);
  span.append(el("span", "chart__arrow", arrowFor(prep.change)), ` ${formatChange(prep)}`);
  return span;
}

function score(preps) {
  const scored = preps.filter((p) => p.spec.good && p.change != null);
  return { total: scored.length, better: scored.filter((p) => p.tone === "good").length, worse: scored.filter((p) => p.tone === "bad").length };
}

// ── Sections ────────────────────────────────────────────────────────────

/** One section: a list of its measures beside a single chart that shows whichever one is picked. */
function explorer(section, preps, range) {
  const list = section.querySelector("[data-explorer]");
  const figure = section.querySelector("figure[data-chart]");
  const ids = list.dataset.explorer.split(/\s+/).filter((id) => preps.has(id));
  const buttons = new Map();

  for (const id of ids) {
    const prep = preps.get(id);
    const btn = el("button", `pick is-${tone(prep)}`);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(id === figure.dataset.chart));
    btn.setAttribute("aria-controls", figure.id);
    btn.append(
      el("span", "pick__arrow", prep.change != null ? arrowFor(prep.change) : ""),
      el("span", "pick__name", prep.spec.title),
      el("span", "pick__value", formatValue(prep.latest.v, prep.spec)),
    );
    btn.addEventListener("click", () => pick(id, true));
    const li = el("li");
    li.append(btn);
    list.append(li);
    buttons.set(id, btn);
  }

  // Arrow keys move through the list the way they would in a menu.
  list.addEventListener("keydown", (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    const all = [...buttons.values()];
    const i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    all[(i + step + all.length) % all.length].focus();
  });

  function pick(id, animate) {
    if (!buttons.has(id)) return false;
    for (const [key, btn] of buttons) btn.setAttribute("aria-pressed", String(key === id));
    if (figure.dataset.chart !== id || !figure.__chart) {
      figure.dataset.chart = id;
      mountChart(figure, { range, animate });
    }
    return true;
  }

  const head = section.querySelector("[data-section-score]");
  const s = score(ids.map((id) => preps.get(id)));
  if (head && s.total) head.textContent = `${s.better} better · ${s.worse} worse`;

  pick(figure.dataset.chart, false);
  return { ids, pick };
}

// ── Report card ─────────────────────────────────────────────────────────

function card(node, sections, preps) {
  if (!node) return;
  const tip = el("div", "chart__tip card__tip");
  tip.hidden = true;
  const rows = sections.map(({ section, ids }) => {
    const row = el("div", "card__row");
    const name = el("a", "card__name", section.querySelector("h2").textContent);
    name.href = `#${section.id}`;
    const tiles = el("div", "card__tiles");
    for (const id of ids) {
      const prep = preps.get(id);
      const t = tone(prep);
      const tile = el("a", `card__tile is-${t}`, prep.change != null ? arrowFor(prep.change) : "·");
      tile.href = `#chart-${id}`;
      tile.setAttribute("aria-label", `${prep.spec.title}: ${formatChange(prep)} ${sinceLabel(prep)}, ${VERDICT[t]}`);
      const showTip = () => {
        tip.replaceChildren(el("strong", null, prep.spec.title), el("span", null, `${formatChange(prep)} ${sinceLabel(prep)}`));
        tip.hidden = false;
        const box = node.getBoundingClientRect();
        const r = tile.getBoundingClientRect();
        const left = Math.max(0, Math.min(box.width - tip.offsetWidth, r.left - box.left + r.width / 2 - tip.offsetWidth / 2));
        tip.style.transform = `translate(${left}px, ${r.top - box.top - tip.offsetHeight - 6}px)`;
      };
      tile.addEventListener("pointerenter", showTip);
      tile.addEventListener("focus", showTip);
      tile.addEventListener("pointerleave", () => (tip.hidden = true));
      tile.addEventListener("blur", () => (tip.hidden = true));
      tiles.append(tile);
    }
    const s = score(ids.map((id) => preps.get(id)));
    row.append(name, tiles, el("span", "card__count", s.total ? `${s.better} better · ${s.worse} worse` : ""));
    return row;
  });
  node.replaceChildren(...rows, tip);
}

function tally(node, preps) {
  if (!node) return;
  const s = score([...preps.values()]);
  node.replaceChildren(
    `Of the ${s.total} measures we score, `,
    el("strong", null, String(s.better)),
    " have moved the right way since he took office and ",
    el("strong", null, String(s.worse)),
    " the wrong way.",
  );
}

// ── Table ───────────────────────────────────────────────────────────────

function ledger(body, sections, preps) {
  if (!body) return;
  body.replaceChildren();
  for (const { section, ids } of sections) {
    const group = el("tr", "ledger__group");
    const th = el("th", null, section.querySelector("h2")?.textContent || "");
    th.colSpan = 4;
    th.scope = "colgroup";
    group.append(th);
    body.append(group);

    for (const id of ids) {
      const prep = preps.get(id);
      const { spec } = prep;
      const tr = el("tr");
      const name = el("th");
      name.scope = "row";
      const link = el("a", null, spec.title);
      link.href = `#chart-${id}`;
      name.append(link, el("small", null, spec.transform === "yoy" ? "% on a year earlier" : spec.sub));

      const base = el("td", "num ledger__base");
      if (prep.base) base.append(formatValue(prep.base.v, spec), el("small", null, periodLabel(prep.base.t, prep.freq, spec)));
      const latest = el("td", "num");
      latest.append(formatValue(prep.latest.v, spec), el("small", null, periodLabel(prep.latest.t, prep.freq, spec)));
      const change = el("td", "num");
      if (prep.change != null) change.append(delta(prep));
      tr.append(name, base, latest, change);
      body.append(tr);
    }
  }
}

function updated(node, preps) {
  if (!node) return;
  const monthly = [...preps.values()].filter((p) => p.freq === "month");
  if (!monthly.length) return;
  const last = monthly.reduce((a, b) => (b.latest.t > a.latest.t ? b : a));
  node.textContent = `Data to ${periodLabel(last.latest.t, "month")}`;
}

/** Fills the tracker and resolves to search entries for each series. */
export async function startTracker(root) {
  const range = savedRange();
  rangeControl(root.querySelector("[data-range-control]"), range);
  pinTools(root.querySelector(".tracker-tools"));
  setRange(range);

  const sectionNodes = [...root.querySelectorAll("[data-section]")];
  const allIds = sectionNodes.flatMap((s) => s.querySelector("[data-explorer]").dataset.explorer.split(/\s+/));
  const loaded = await Promise.all(allIds.map((id) => loadPrepared(id).catch(() => null)));
  const preps = new Map();
  allIds.forEach((id, i) => loaded[i] && preps.set(id, loaded[i]));

  const sections = sectionNodes.map((section) => ({ section, ...explorer(section, preps, range) }));

  /** Shows a series in its section's chart and brings that section into view. */
  function choose(id, scroll) {
    const hit = sections.find((s) => s.ids.includes(id));
    if (!hit) return false;
    hit.pick(id, true);
    if (scroll) hit.section.querySelector(".explorer").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    return true;
  }

  card(root.querySelector("[data-card]"), sections, preps);
  tally(root.querySelector("[data-tally]"), preps);
  ledger(root.querySelector("[data-ledger]"), sections, preps);
  updated(root.querySelector("[data-updated]"), preps);

  // Links to #chart-ID (the report card, the table, site search) pick that series instead of jumping.
  root.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#chart-"]');
    if (!a) return;
    const id = a.getAttribute("href").slice(7);
    if (choose(id, true)) {
      e.preventDefault();
      history.replaceState(null, "", `#chart-${id}`);
    }
  });
  const fromHash = () => {
    const m = /^#chart-(.+)$/.exec(decodeURIComponent(location.hash));
    if (m) choose(m[1], true);
    else if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();

  return [...preps.entries()].map(([id, prep]) => {
    const hit = sections.find((s) => s.ids.includes(id));
    return {
      type: "Data",
      title: prep.spec.title,
      sub: `${formatValue(prep.latest.v, prep.spec)} in ${periodLabel(prep.latest.t, prep.freq, prep.spec)} · FRED ${id}`,
      href: `trumptracker.html#chart-${id}`,
      keywords: `${id} ${prep.spec.sub} ${hit?.section.querySelector("h2")?.textContent || ""}`,
    };
  });
}
