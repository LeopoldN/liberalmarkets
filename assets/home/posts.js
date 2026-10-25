// "From Liberal Markets": stories and tools listed in data/stories.json.

function formatDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Fills the list and resolves to search entries for every story. */
export async function renderPosts(list) {
  try {
    const res = await fetch("data/stories.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const { stories = [] } = await res.json();

    if (list) {
      list.textContent = "";
      for (const story of stories) {
        const li = document.createElement("li");
        li.className = "post";

        const date = document.createElement("span");
        date.className = "post__date";
        date.textContent = story.dateISO ? formatDate(story.dateISO) : "Always on";

        const body = document.createElement("div");
        const h3 = document.createElement("h3");
        h3.className = "post__title";
        const a = document.createElement("a");
        a.href = story.href;
        a.textContent = story.title;
        h3.append(a);
        const dek = document.createElement("p");
        dek.className = "post__dek";
        dek.textContent = story.dek;
        body.append(h3, dek);

        const tag = document.createElement("span");
        tag.className = "post__tag";
        tag.textContent = story.minutes ? `${story.tag} · ${story.minutes} min` : story.tag;

        li.append(date, body, tag);
        list.append(li);
      }
    }

    return stories.map((s) => ({ type: s.tag, title: s.title, sub: s.dek, href: s.href, keywords: s.keywords }));
  } catch (err) {
    if (list) list.innerHTML = '<li class="post"><span></span><p class="post__dek">Stories could not be loaded.</p></li>';
    return [];
  }
}
