/* ==========================================================================
   Region history — click a present-day region to read what that area was
   like in the selected era. Per-era entries come from data/oblasts/*.json
   (one file per research group); a live summary comes from Wikipedia's REST
   API. The view replaces the era readout in the right sidebar while a region
   is selected. Era + region are mirrored in the URL hash so reloads keep them.
   ========================================================================== */
(function () {
  "use strict";

  const GROUPS = ["west", "centre", "east", "south"];
  // Wikipedia titles for regions whose article isn't "<Name>" with underscores
  const WIKI_FALLBACK = { "UA-30": "Kyiv", "UA-40": "Sevastopol", "UA-43": "Autonomous_Republic_of_Crimea" };

  const R = { data: {}, politics: {}, parties: {}, groups: {}, wiki: new Map(), iso: null, renderT: 0 };
  const PARTY_FALLBACK = ["--pol-1", "--pol-2", "--pol-3", "--pol-4", "--pol-5", "--pol-6"];
  const $ = (id) => document.getElementById(id);
  const M = window.UkraineMap;
  const U = window.GeoUtils;
  const side = $("tl-readout");
  const view = $("rg-view");
  const eraView = $("er-view");

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : null);

  /* ---------------- data ---------------- */
  const getJson = (url) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

  async function loadData() {
    const [hist, pol] = await Promise.all([
      Promise.allSettled(GROUPS.map((g) => getJson(`data/oblasts/${g}.json`))),
      Promise.allSettled(GROUPS.map((g) => getJson(`data/politics/${g}.json`))),
    ]);
    hist.forEach((r) => { if (r.status === "fulfilled" && r.value && r.value.oblasts) Object.assign(R.data, r.value.oblasts); });
    pol.forEach((r) => { if (r.status === "fulfilled" && r.value) addPolitics(r.value); });
  }

  /** Merge one politics file. Party/group keys are Wikipedia titles shared across files;
   *  a profile with a Wikipedia link wins over one without. */
  function addPolitics(file) {
    const merge = (into, from) => Object.entries(from || {}).forEach(([k, v]) => {
      if (v && (!into[k] || (!into[k].wikipedia && v.wikipedia))) into[k] = v;
    });
    merge(R.parties, file.parties);
    merge(R.groups, file.armedGroups);
    Object.entries(file.oblasts || {}).forEach(([iso, o]) => { R.politics[iso] = Object.assign(R.politics[iso] || {}, o.eras || {}); });
  }

  function wikiTitle(iso, feature) {
    const d = R.data[iso];
    if (d && d.wikipedia) return d.wikipedia;
    if (WIKI_FALLBACK[iso]) return WIKI_FALLBACK[iso];
    return feature ? feature.properties.name.replace(/ /g, "_") : null;
  }

  function wikiSummary(title) {
    if (!title) return Promise.resolve(null);
    if (!R.wiki.has(title)) {
      R.wiki.set(title, fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return R.wiki.get(title);
  }

  /* ---------------- rendering ---------------- */
  function linkList(links) {
    const items = (links || []).map((l) => {
      const url = safeUrl(l && l.url);
      if (!url) return "";
      const host = url.includes("wikipedia.org") ? "Wikipedia" : new URL(url).hostname.replace(/^www\./, "");
      return `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(l.title || url)}</a><span class="rg-host">${esc(host)}</span></li>`;
    }).filter(Boolean);
    return items.length ? `<ul class="rg-links">${items.join("")}</ul>` : "";
  }

  function section(title, body) {
    return body ? `<h3 class="side-title">${esc(title)}</h3>${body}` : "";
  }

  /* ---------------- politics & armed groups (1917–today) ---------------- */
  const hashIdx = (s, n) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % n; };
  // a party's own colour where the data gives one; otherwise a stable palette hue per party key
  const partyColor = (key) => {
    const c = R.parties[key] && R.parties[key].color;
    return /^#[0-9a-f]{3,8}$/i.test(c || "") ? c : `var(${PARTY_FALLBACK[hashIdx(key, PARTY_FALLBACK.length)]})`;
  };
  const keyName = (key) => String(key).replace(/^x:/, "").replace(/_/g, " ").replace(/\s*\((political party|Ukraine)\)$/i, "");
  const extLink = (url, label) => (safeUrl(url) ? `<a class="rg-wiki-more" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : "");
  const yearsOf = (p) => (p.founded || p.dissolved ? `<span class="pp-yrs">${esc(p.founded || "?")}–${esc(p.dissolved || "")}</span>` : "");

  /** One expandable party row: colour, name, optional value (seats/share); opens to its profile. */
  function partyRow(key, value) {
    const p = R.parties[key] || { name: keyName(key) };
    return `<details class="pp"><summary>
        <i class="pp-dot" style="background:${partyColor(key)}"></i>
        <span class="pp-n">${esc(p.name || keyName(key))}${p.abbr ? ` <span class="pp-a">${esc(p.abbr)}</span>` : ""}</span>
        ${value != null ? `<span class="pp-v">${esc(value)}</span>` : ""}
      </summary>
      <div class="pp-bd">
        ${p.leaning ? `<div class="pp-lean">${esc(p.leaning)} ${yearsOf(p)}</div>` : yearsOf(p)}
        ${p.summary ? `<p class="rg-text">${esc(p.summary)}</p>` : ""}
        ${extLink(p.wikipedia, "Party on Wikipedia")}
      </div>
    </details>`;
  }

  function electionBlock(e) {
    const rows = (e.seats || []).filter((s) => s && s.party);
    if (!rows.length) return "";
    const share = rows.every((s) => s.seats == null && s.share != null);
    const val = (s) => Math.max(0, +(share ? s.share : s.seats) || 0);
    const sum = d3.sum(rows, val);
    const total = share ? 100 : Math.max(+e.total || 0, sum);
    const other = total - sum;
    const sorted = rows.slice().sort((a, b) => val(b) - val(a));
    const fmt = (v) => (share ? `${+v.toFixed(1)}%` : `${v}`);
    const bar = sorted.map((s) => `<span style="flex:${val(s)} 0 0;background:${partyColor(s.party)}" title="${esc((R.parties[s.party] || {}).name || keyName(s.party))}: ${fmt(val(s))}"></span>`).join("")
      + (other > 0.05 ? `<span class="other" style="flex:${other} 0 0" title="Other: ${fmt(other)}"></span>` : "");
    // "Body (note)": the trailing parenthetical becomes a subtitle, minus the unit already shown
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(e.body || "");
    const title = m ? m[1] : e.body || "Election";
    const note = m ? m[2].replace(/^(vote share,?\s*%?|seats)\s*[;,]?\s*/i, "") : "";
    return `<div class="el">
      <div class="el-h"><span class="el-yr">${esc(e.year || "")}</span><span class="el-b">${esc(title)}</span></div>
      <div class="el-meta">${share ? "Vote share" : total ? `${total} seats` : ""}${note ? ` · ${esc(note)}` : ""}</div>
      <div class="el-bar" role="img" aria-label="Seat distribution">${bar}</div>
      <div class="pp-list">${sorted.map((s) => partyRow(s.party, fmt(val(s)))).join("")}${other > 0.05 ? `<div class="pp-other">Other${share ? "" : " / vacant"} <span>${fmt(other)}</span></div>` : ""}</div>
      ${e.source && safeUrl(e.source.url) ? `<a class="el-src" href="${esc(e.source.url)}" target="_blank" rel="noopener">Source: ${esc(e.source.title || "link")}</a>` : ""}
    </div>`;
  }

  function politicsBlock(pol) {
    if (!pol) return "";
    const gov = (pol.governing || []).filter(Boolean);
    const els = (pol.elections || []).map(electionBlock).filter(Boolean);
    const html = (pol.note ? `<p class="rg-text">${esc(pol.note)}</p>` : "")
      + (gov.length ? `<div class="pp-k">Governing</div><div class="pp-list">${gov.map((k) => partyRow(k)).join("")}</div>` : "")
      + (els.length ? `<div class="pp-k">Elections</div><div class="el-list">${els.join("")}</div>` : "");
    return html;
  }

  function groupsBlock(list) {
    const rows = (list || []).filter((g) => g && g.group).map((g) => {
      const p = R.groups[g.group] || { name: keyName(g.group) };
      return `<details class="pp ag"><summary>
          <span class="pp-n">${esc(p.name || keyName(g.group))}</span>
          ${p.side ? `<span class="pp-v">${esc(p.side)}</span>` : ""}
        </summary>
        <div class="pp-bd">
          ${p.type ? `<div class="pp-lean">${esc(p.type)}</div>` : ""}
          ${g.role ? `<p class="rg-text"><span class="pp-here">In this region:</span> ${esc(g.role)}</p>` : ""}
          ${p.summary ? `<p class="rg-text">${esc(p.summary)}</p>` : ""}
          ${extLink(p.wikipedia, "Read on Wikipedia")}
        </div>
      </details>`;
    });
    return rows.length ? `<div class="pp-list">${rows.join("")}</div>` : "";
  }

  function render() {
    const iso = R.iso;
    const f = iso && M.getOblasts().features.find((x) => x.id === iso);
    if (!f) { view.hidden = true; eraView.hidden = false; return; }

    const p = f.properties;
    const d = R.data[iso];
    const era = M.currentEra;
    const entry = d && era && d.eras ? d.eras[era.id] : null;
    const pol = era && R.politics[iso] ? R.politics[iso][era.id] : null;
    const eras = (window.UkraineTimeline && window.UkraineTimeline.eras) || [];
    const kind = p.kind ? p.kind.charAt(0) + p.kind.slice(1).toLowerCase() : "Oblast";
    const polHtml = politicsBlock(pol && pol.politics);
    const regions = d && d.historicalRegions && d.historicalRegions.length ? d.historicalRegions.join(", ") : "";

    let eraBlock;
    if (entry) {
      eraBlock = `
        ${entry.control ? `<div class="rg-control"><span class="rg-k">Held by</span>${esc(entry.control)}</div>` : ""}
        <p class="rg-summary">${esc(entry.summary)}</p>
        ${section("Military", entry.military ? `<p class="rg-text">${esc(entry.military)}</p>` : "")}
        ${section("Key places", (entry.places || []).length ? `<ul class="rg-chips">${entry.places.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "")}
        ${section("Read more", linkList(entry.links))}`;
    } else {
      eraBlock = `<p class="rg-pending">${d ? "No entry for this era yet." : "Research for this region is still being compiled. It will appear here automatically."}</p>`;
    }

    const timeline = eras.length ? `<ol class="rg-tl">${eras.map((e) => {
      const en = d && d.eras ? d.eras[e.id] : null;
      const cur = era && e.id === era.id;
      return `<li${cur ? ' class="cur" aria-current="true"' : ""}><button type="button" data-era="${esc(e.id)}">
        <span class="y">${esc(U.fmtYear(e.startYear))}</span>
        <span class="t"><span class="n">${esc(e.name)}</span>${en && en.control ? `<span class="c">${esc(en.control)}</span>` : ""}</span>
      </button></li>`;
    }).join("")}</ol>` : "";

    view.innerHTML = `
      <div class="rg-bar">
        <button type="button" class="rg-back" id="rg-back"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>Era overview</button>
        <button type="button" class="rg-zoom" id="rg-zoom">Zoom to region</button>
      </div>
      <div class="rg-kicker">${esc(kind)}${regions ? ` · ${esc(regions)}` : ""}</div>
      <h2 class="rg-name">${esc(p.name)}</h2>
      <div class="rg-native">${esc(p.native || "")}${p.center && p.center !== "—" ? ` · Centre: ${esc(p.center)}` : ""}</div>

      <div class="rg-era">
        <div class="er-head"><span class="er-years">${era ? esc(U.fmtRange(era.startYear, era.endYear)) : ""}</span></div>
        <div class="rg-era-name">${era ? esc(era.name) : "No era selected"}</div>
      </div>
      <div class="rg-cols${polHtml ? " split" : ""}">
        <div class="rg-col">
          ${eraBlock}
          ${section("Armed groups & militias", groupsBlock(pol && pol.armedGroups))}
        </div>
        ${polHtml ? `<div class="rg-col rg-pol">${section("Politics & elections", polHtml)}</div>` : ""}
      </div>

      ${section("About the region", `<div class="rg-wiki" id="rg-wiki"><div class="rg-wiki-loading">Loading Wikipedia summary…</div></div>`)}
      ${section("Overall history", d && d.overview ? `<p class="rg-text">${esc(d.overview)}</p>` : "")}
      ${section("Across the timeline", timeline)}
      ${section("Sources", d ? linkList(d.sources) : "")}`;

    view.hidden = false;
    eraView.hidden = true;

    $("rg-back").addEventListener("click", () => M.selectRegion(null));
    $("rg-zoom").addEventListener("click", () => M.zoomToRegion(iso));
    view.querySelectorAll(".rg-tl button").forEach((b) => b.addEventListener("click", () => window.UkraineTimeline.setEra(b.dataset.era)));

    const title = wikiTitle(iso, f);
    wikiSummary(title).then((w) => {
      const box = $("rg-wiki");
      if (!box || R.iso !== iso) return;
      const url = (w && w.content_urls && w.content_urls.desktop && w.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
      if (!w || !w.extract) {
        box.innerHTML = `<a class="rg-wiki-more" href="${esc(url)}" target="_blank" rel="noopener">Open ${esc(p.name)} on Wikipedia</a>`;
        return;
      }
      const thumb = w.thumbnail && safeUrl(w.thumbnail.source);
      box.innerHTML = `
        ${thumb ? `<img class="rg-wiki-img" src="${esc(thumb)}" alt="" loading="lazy">` : ""}
        <div class="rg-wiki-body">
          <p class="rg-text">${esc(w.extract)}</p>
          <a class="rg-wiki-more" href="${esc(url)}" target="_blank" rel="noopener">Read more on Wikipedia</a>
        </div>`;
      box.classList.toggle("has-img", !!thumb);
    });
  }

  /** Re-render after the timeline's readout fade so content swaps while hidden. */
  function scheduleRender() {
    clearTimeout(R.renderT);
    queueMicrotask(() => { R.renderT = setTimeout(render, side.classList.contains("fading") ? 200 : 0); });
  }

  /* ---------------- URL hash state ---------------- */
  function writeHash() {
    const q = new URLSearchParams();
    const era = M.currentEra;
    if (era && era.id) q.set("era", era.id);
    if (R.iso) q.set("region", R.iso);
    history.replaceState(null, "", "#" + q.toString());
  }

  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    return { era: q.get("era"), region: q.get("region") };
  }

  /* ---------------- wiring ---------------- */
  async function init() {
    await M.ready;
    const dataReady = loadData();

    M.on("select", (f) => {
      R.iso = f ? f.id : null;
      if (R.iso) side.classList.remove("min"); // phones: open the panel on selection
      render();
      side.scrollTop = 0;
      writeHash();
    });
    M.on("era", () => { if (R.iso) scheduleRender(); writeHash(); });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && R.iso) M.selectRegion(null);
    });

    // restore era/region from the hash once the timeline has its eras
    const h = readHash();
    for (let i = 0; i < 40 && !(window.UkraineTimeline && window.UkraineTimeline.eras.length); i++) await new Promise((r) => setTimeout(r, 50));
    if (h.era && window.UkraineTimeline) window.UkraineTimeline.setEra(h.era);
    await dataReady;
    if (h.region) M.selectRegion(h.region);
    else if (R.iso) render();
  }

  window.UkraineRegions = {
    /** Re-fetch data/oblasts/*.json (e.g. after research files change). */
    reload: () => loadData().then(() => { if (R.iso) render(); }),
    /** Merge region records ({ "UA-63": {...} }) and refresh the view. */
    add: (oblasts) => { Object.assign(R.data, oblasts); if (R.iso) render(); },
    /** Merge a politics file ({ parties, armedGroups, oblasts }) and refresh the view. */
    addPolitics: (file) => { addPolitics(file); if (R.iso) render(); },
    get data() { return R.data; },
  };

  init();
})();
