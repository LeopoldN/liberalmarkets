// The Wire: latest finance headlines from data/news.json (refreshed daily by scripts/fetch-news.mjs).

const LIMIT = 7;

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

/** Fills the list and resolves to search entries for every headline. */
export async function renderWire(list, meta) {
  if (!list) return [];
  list.innerHTML = Array.from({ length: 5 }, () =>
    '<li><span class="skeleton" style="width:36px"></span><span><span class="skeleton"></span><span class="skeleton" style="width:70%"></span></span></li>').join("");

  try {
    const res = await fetch("data/news.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const now = Date.now();
    const items = (data.items || [])
      .map((item) => ({ title: decode(item.title || ""), link: item.link, date: new Date(item.pubDate) }))
      .filter((item) => item.title && /^https?:/.test(item.link || ""))
      .sort((a, b) => b.date - a.date);

    list.textContent = "";
    for (const item of items.slice(0, LIMIT)) {
      const li = document.createElement("li");
      const time = document.createElement("time");
      time.className = "wire__time";
      time.dateTime = item.date.toISOString();
      time.textContent = ago(item.date, now);
      const a = document.createElement("a");
      a.href = item.link;
      a.rel = "noopener";
      a.target = "_blank";
      a.textContent = item.title;
      li.append(time, a);
      list.append(li);
    }
    if (meta) meta.textContent = `${data.source ? data.source.replace(/ RSS$/, "") : "Newswire"}`;

    return items.map((item) => ({ type: "Headline", title: item.title, sub: "CNBC Finance", href: item.link, external: true }));
  } catch (err) {
    list.innerHTML = '<li class="wire__empty"><span></span><span>Headlines are unavailable right now.</span></li>';
    if (meta) meta.textContent = "Offline";
    return [];
  }
}
