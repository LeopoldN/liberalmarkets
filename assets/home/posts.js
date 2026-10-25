// Stories and tools listed in data/stories.json: the Tools list on the homepage, and search entries.

/** Fills the list and resolves to search entries for every story. */
export async function renderPosts(list) {
  try {
    const res = await fetch("data/stories.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const { stories = [] } = await res.json();

    if (list) {
      // The homepage lists the tools; dated stories run as the lead, games have their own section.
      list.textContent = "";
      for (const story of stories.filter((s) => !s.dateISO && s.href !== "games.html")) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = story.href;
        const title = document.createElement("strong");
        title.textContent = story.title;
        const dek = document.createElement("span");
        dek.textContent = story.dek;
        a.append(title, dek);
        li.append(a);
        list.append(li);
      }
    }

    return stories.map((s) => ({ type: s.tag, title: s.title, sub: s.dek, href: s.href, keywords: s.keywords }));
  } catch (err) {
    if (list) list.innerHTML = "<li>Tools could not be loaded.</li>";
    return [];
  }
}
