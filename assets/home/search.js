// Site search: a command-palette overlay over stories, sections, games and the day's headlines.

const PAGES = [
  { type: "Section", title: "Trump Tracker", sub: "Economic indicators dashboard", href: "trumptracker.html", keywords: "inflation jobs unemployment growth housing rates deficit trade" },
  { type: "Section", title: "Markets", sub: "Prices, records and yearly returns", href: "markets.html", keywords: "stocks indexes yields bonds currencies commodities crypto prices returns" },
  { type: "Section", title: "Games", sub: "Daily trade puzzles", href: "games.html", keywords: "puzzles daily trade" },
];

function gamesFromPage() {
  return [...document.querySelectorAll(".games__grid a")].map((a) => ({
    type: "Game",
    title: a.querySelector("strong")?.textContent || "",
    sub: a.querySelector("span:last-child")?.textContent || "",
    href: a.getAttribute("href"),
  }));
}

function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function score(item, terms) {
  const title = norm(item.title);
  const rest = norm(`${item.sub} ${item.keywords || ""} ${item.type}`);
  let total = 0;
  for (const t of terms) {
    if (title.startsWith(t)) total += 6;
    else if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) total += 4;
    else if (title.includes(t)) total += 2;
    else if (rest.includes(t)) total += 1;
    else return 0;
  }
  return total;
}

function highlight(text, terms) {
  const frag = document.createDocumentFragment();
  const lower = norm(text);
  const marks = [];
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0) marks.push([i, i + t.length]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    frag.append(text.slice(pos, s));
    const m = document.createElement("mark");
    m.textContent = text.slice(s, e);
    frag.append(m);
    pos = e;
  }
  frag.append(text.slice(pos));
  return frag;
}

export function startSearch({ sources }) {
  const overlay = document.querySelector("[data-search]");
  const input = document.querySelector("[data-search-input]");
  const list = document.querySelector("[data-search-results]");
  if (!overlay || !input || !list) return;

  let index = [...PAGES, ...gamesFromPage()];
  Promise.all(sources).then((groups) => {
    // Articles and tools first; a section or game that one already covers is dropped.
    const seen = new Set();
    index = [...groups[0], ...groups[1], ...PAGES, ...gamesFromPage(), ...groups.slice(2).flat()].filter((item) => {
      const key = item.type === "Data" ? `${item.href}#${item.title}` : item.href;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!overlay.hidden) update();
  });

  let results = [];
  let active = 0;
  let opener = null;

  function render(terms) {
    list.textContent = "";
    if (!results.length) {
      const li = document.createElement("li");
      li.className = "search__empty";
      li.textContent = terms.length ? "Nothing matches that. Try a ticker, a country or an indicator." : "";
      if (terms.length) list.append(li);
      return;
    }
    results.forEach((item, i) => {
      const li = document.createElement("li");
      li.id = `sr-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === active));
      const a = document.createElement("a");
      a.href = item.href;
      if (item.external) { a.target = "_blank"; a.rel = "noopener"; }
      const type = document.createElement("span");
      type.className = "r-type";
      type.textContent = item.type;
      const body = document.createElement("span");
      const title = document.createElement("span");
      title.className = "r-title";
      title.append(highlight(item.title, terms));
      const sub = document.createElement("span");
      sub.className = "r-sub";
      sub.textContent = item.sub;
      body.append(title, sub);
      a.append(type, body);
      a.addEventListener("pointerenter", () => select(i));
      li.append(a);
      list.append(li);
    });
    input.setAttribute("aria-activedescendant", `sr-${active}`);
  }

  function update() {
    const terms = norm(input.value).split(/\s+/).filter(Boolean);
    if (!terms.length) {
      // Empty query: suggest the sections and the lead story.
      results = index.filter((it) => it.type !== "Headline").slice(0, 7);
    } else {
      results = index
        .map((item) => ({ item, s: score(item, terms) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 10)
        .map((r) => r.item);
    }
    active = 0;
    render(terms);
  }

  function select(i) {
    if (!results.length) return;
    active = (i + results.length) % results.length;
    [...list.children].forEach((li, k) => li.setAttribute("aria-selected", String(k === active)));
    input.setAttribute("aria-activedescendant", `sr-${active}`);
    list.children[active]?.scrollIntoView({ block: "nearest" });
  }

  function open() {
    if (!overlay.hidden) return;
    opener = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    input.value = "";
    update();
    input.focus();
  }

  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = "";
    opener?.focus?.();
  }

  document.querySelectorAll("[data-search-open]").forEach((b) => b.addEventListener("click", open));
  overlay.querySelectorAll("[data-search-close]").forEach((b) => b.addEventListener("click", close));
  input.addEventListener("input", update);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); select(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); select(active - 1); }
    else if (e.key === "Enter") {
      const a = list.children[active]?.querySelector("a");
      if (a) { e.preventDefault(); a.click(); close(); }
    }
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { e.preventDefault(); input.focus(); }
  });
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      open();
    }
  });
}
