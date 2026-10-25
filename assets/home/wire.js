// News ticker: the latest finance headlines from data/news.json (refreshed daily by scripts/fetch-news.mjs).

const LIMIT = 12;

function decode(text) {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

function ago(date, now) {
  const mins = Math.max(0, Math.round((now - date) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const SPEED = 45; // px per second

function item(entry, now, hidden) {
  const a = document.createElement("a");
  a.className = "ticker__item";
  a.href = entry.link;
  a.rel = "noopener";
  a.target = "_blank";
  if (hidden) a.tabIndex = -1;
  const time = document.createElement("time");
  time.dateTime = entry.date.toISOString();
  time.textContent = ago(entry.date, now);
  a.append(time, entry.title);
  return a;
}

/**
 * Fills the news ticker under the top bar and resolves to search entries for every headline.
 * The headlines run twice in one track, so sliding it by half loops without a seam.
 */
export async function renderWire(track) {
  if (!track) return [];
  try {
    const res = await fetch("data/news.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const now = Date.now();
    const items = (data.items || [])
      .map((entry) => ({ title: decode(entry.title || ""), link: entry.link, date: new Date(entry.pubDate) }))
      .filter((entry) => entry.title && /^https?:/.test(entry.link || ""))
      .sort((a, b) => b.date - a.date)
      .slice(0, LIMIT);

    const first = document.createElement("div");
    first.className = "ticker__run";
    first.append(...items.map((entry) => item(entry, now, false)));
    const second = first.cloneNode(false);
    second.setAttribute("aria-hidden", "true");
    second.append(...items.map((entry) => item(entry, now, true)));
    track.replaceChildren(first, second);

    const setSpeed = () => track.style.setProperty("--ticker-duration", `${Math.max(20, first.scrollWidth / SPEED)}s`);
    setSpeed();
    document.fonts?.ready.then(setSpeed);

    return items.map((entry) => ({ type: "Headline", title: entry.title, sub: "CNBC Finance", href: entry.link, external: true }));
  } catch (err) {
    track.replaceChildren(Object.assign(document.createElement("span"), { className: "ticker__item", textContent: "Headlines are unavailable right now." }));
    return [];
  }
}
