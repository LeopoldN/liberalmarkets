// Articles from data/articles.json: the homepage's recent list, the full archive on articles.html,
// and the read-next list under each article.

const RECENT = 6;
const NEXT = 3;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const fmtDay = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtMonth = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** Newest first; the file order breaks ties. */
export async function loadArticles() {
  try {
    const res = await fetch("data/articles.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const { articles = [] } = await res.json();
    return articles
      .map((a, i) => ({ ...a, order: i }))
      .sort((a, b) => b.dateISO.localeCompare(a.dateISO) || a.order - b.order);
  } catch (err) {
    return null;
  }
}

/** Every query word has to appear somewhere in the article. */
export function matches(article, query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(`${article.title} ${article.dek} ${article.topic} ${article.author} ${article.keywords || ""}`);
  return words.every((w) => hay.includes(w));
}

function row(article) {
  const li = el("li", "article");
  const a = el("a", "article__link");
  a.href = article.href;
  const date = el("time", "article__date", fmtDay(article.dateISO));
  date.dateTime = article.dateISO;
  const body = el("div", "article__body");
  body.append(el("h3", "article__title", article.title), el("p", "article__dek", article.dek));
  const meta = el("span", "article__meta", `${article.topic} · ${article.minutes} min`);
  a.append(date, body, meta);
  li.append(a);
  return li;
}

function empty(text) {
  const li = el("li", "article article--empty", text);
  return li;
}

/** Homepage: the newest articles, filtered live by the section's own search box. */
export function renderRecent({ list, input, more, status }, articles) {
  if (!list) return;
  if (!articles) {
    list.replaceChildren(empty("Articles could not be loaded."));
    return;
  }
  const update = () => {
    const q = input?.value.trim() || "";
    const hits = articles.filter((a) => matches(a, q));
    // The newest article already runs as the lead, so the unfiltered list starts after it.
    const shown = q ? hits : hits.slice(1);
    list.replaceChildren(...(shown.length ? shown.slice(0, RECENT).map(row) : [empty(q ? `No articles match “${q}”.` : "More articles are on the way.")]));
    if (more) {
      more.href = q ? `articles.html?q=${encodeURIComponent(q)}` : "articles.html";
      more.textContent = q && hits.length > RECENT ? `All ${hits.length} results →` : `All ${articles.length} articles →`;
    }
    if (status) status.textContent = q ? `${hits.length} ${hits.length === 1 ? "article matches" : "articles match"}` : "";
  };
  input?.addEventListener("input", update);
  update();
}

/** articles.html: every article, grouped by month, with search and topic filters kept in the URL. */
export function renderArchive({ list, input, topics, count }, articles) {
  if (!list) return;
  if (!articles) {
    list.replaceChildren(empty("Articles could not be loaded."));
    return;
  }
  const params = new URLSearchParams(location.search);
  let topic = params.get("topic") || "";
  if (input) input.value = params.get("q") || "";

  const allTopics = [...new Set(articles.map((a) => a.topic))].sort();
  if (topics) {
    const buttons = ["", ...allTopics].map((t) => {
      const b = el("button", "filter", t || "All");
      b.type = "button";
      b.dataset.topic = t;
      b.addEventListener("click", () => {
        topic = t;
        update();
      });
      return b;
    });
    topics.replaceChildren(...buttons);
  }

  function update() {
    const q = input?.value.trim() || "";
    const hits = articles.filter((a) => (!topic || a.topic === topic) && matches(a, q));
    topics?.querySelectorAll(".filter").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.topic === topic)));

    const groups = new Map();
    for (const a of hits) {
      const key = a.dateISO.slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    }
    const nodes = [];
    for (const items of groups.values()) {
      const li = el("li", "archive__month");
      li.append(el("h2", "archive__heading", fmtMonth(items[0].dateISO)));
      const ol = el("ol", "articles");
      ol.append(...items.map(row));
      li.append(ol);
      nodes.push(li);
    }
    list.replaceChildren(...(nodes.length ? nodes : [empty(q ? `No articles match “${q}”.` : "No articles in this topic yet.")]));
    if (count) count.textContent = `${hits.length} of ${articles.length} ${articles.length === 1 ? "article" : "articles"}`;

    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (topic) next.set("topic", topic);
    const qs = next.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  input?.addEventListener("input", update);
  update();
}

/** Article pages: a few other articles to read next. The section stays hidden when there are none. */
export function renderNext({ list, section }, articles) {
  if (!list || !articles) return;
  const here = location.pathname.split("/").pop();
  const others = articles.filter((a) => a.href !== here && !a.placeholder);
  if (!others.length) return;
  list.replaceChildren(...others.slice(0, NEXT).map(row));
  if (section) section.hidden = false;
}

/** Search entries for the site-wide search overlay. */
export function articleEntries(articles) {
  return (articles || []).map((a) => ({
    type: "Article",
    title: a.title,
    sub: `${fmtDay(a.dateISO)} · ${a.topic}`,
    href: a.href,
    keywords: `${a.dek} ${a.keywords || ""}`,
  }));
}
