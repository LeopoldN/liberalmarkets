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

  const R = { data: {}, politics: {}, parties: {}, groups: {}, camps: null, cards: {}, people: {}, wiki: new Map(), iso: null, renderT: 0, tab: "held" };
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
    const [hist, pol, camps, cards, people] = await Promise.all([
      Promise.allSettled(GROUPS.map((g) => getJson(`data/oblasts/${g}.json`))),
      Promise.allSettled(GROUPS.map((g) => getJson(`data/politics/${g}.json`))),
      getJson("data/politics/conflict-camps.json").catch(() => null),
      getJson("data/oblasts/postcards.json").catch(() => null),
      Promise.allSettled(GROUPS.map((g) => getJson(`data/people/${g}.json`))),
    ]);
    people.forEach((r) => { if (r.status === "fulfilled" && r.value && r.value.oblasts) Object.assign(R.people, r.value.oblasts); });
    R.camps = camps;
    R.cards = (cards && cards.oblasts) || {};
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

  function wikiSummary(title, lang = "en") {
    if (!title) return Promise.resolve(null);
    const key = `${lang}:${title}`;
    if (!R.wiki.has(key)) {
      R.wiki.set(key, fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return R.wiki.get(key);
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

  /** One expandable party row: colour, name, optional value (seats/share); opens to its profile.
   *  `stitch` is the party's index in an election cloth: the swatch becomes a cross and hovering links the two. */
  function partyRow(key, value, stitch) {
    const p = R.parties[key] || { name: keyName(key) };
    const swatch = stitch == null
      ? `<i class="pp-dot" style="background:${partyColor(key)}"></i>`
      : `<svg class="pp-x" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" style="stroke:${partyColor(key)}"/></svg>`;
    return `<details class="pp"${stitch == null ? "" : ` data-i="${stitch}"`}><summary>
        ${swatch}
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

  /** Stitches per party. Seats map 1:1; vote share uses 100 stitches, with at least one for any party on the list. */
  function stitchCounts(values, share, total) {
    const counts = values.map((v) => (share ? Math.max(v > 0 ? 1 : 0, Math.round(v)) : Math.round(v)));
    const n = share ? 100 : Math.round(total);
    while (d3.sum(counts) > n) counts[counts.indexOf(d3.max(counts))] -= 1;
    return { counts, n };
  }

  /** The rushnyk: a cross-stitch field filled column by column, largest party first. One <path> per party. */
  function clothSvg(parties, n) {
    const rows = Math.max(2, Math.round(Math.sqrt(n / 6)));
    const cols = Math.ceil(n / rows);
    const C = 10, I = 1.7, L = C - 2 * I;
    const cross = (i) => {
      const x = Math.floor(i / rows) * C + I, y = (i % rows) * C + I;
      return `M${x} ${y}l${L} ${L}M${x + L} ${y}l${-L} ${L}`;
    };
    let at = 0;
    const threads = parties.map((p, i) => {
      let d = "";
      for (let j = 0; j < p.count; j++) d += cross(at++);
      return p.count ? `<g data-i="${i}"><title>${esc(p.label)}</title><path class="st-u" d="${d}"/><path class="st-t" d="${d}" style="stroke:${p.color}"/></g>` : "";
    }).join("");
    let rest = "";
    while (at < n) rest += cross(at++);
    const label = parties.map((p) => p.label).join(", ");
    return `<svg class="el-st" viewBox="0 0 ${cols * C} ${rows * C}" style="max-width:${cols * 20}px" role="img" aria-label="${esc(label)}">${threads}${rest ? `<path class="st-o" d="${rest}"/>` : ""}</svg>`;
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
    const nameOf = (s) => (R.parties[s.party] || {}).name || keyName(s.party);
    const { counts, n } = stitchCounts(sorted.map(val), share, total);
    const cloth = clothSvg(sorted.map((s, i) => ({ count: counts[i], color: partyColor(s.party), label: `${nameOf(s)}: ${fmt(val(s))}` })), n);
    // "Body (note)": the trailing parenthetical becomes a subtitle, minus the unit already shown
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(e.body || "");
    const title = m ? m[1] : e.body || "Election";
    const note = m ? m[2].replace(/^(vote share,?\s*%?|seats)\s*[;,]?\s*/i, "") : "";
    return `<div class="el">
      <div class="el-h"><span class="el-yr">${esc(e.year || "")}</span><span class="el-b">${esc(title)}</span></div>
      <div class="el-meta">${share ? "Vote share" : total ? `${total} seats` : ""}${note ? ` · ${esc(note)}` : ""}</div>
      <div class="el-cloth">${cloth}</div>
      <div class="pp-list">${sorted.map((s, i) => partyRow(s.party, fmt(val(s)), i)).join("")}${other > 0.05 ? `<div class="pp-other">Other${share ? "" : " / vacant"} <span>${fmt(other)}</span></div>` : ""}</div>
      ${e.source && safeUrl(e.source.url) ? `<a class="el-src" href="${esc(e.source.url)}" target="_blank" rel="noopener">Source: ${esc(e.source.title || "link")}</a>` : ""}
    </div>`;
  }

  /* ---------------- governing: the Universal ----------------
     Hetmans and the Central Rada declared power in decrees called Universals, so the era's
     account is a sealed document and each governing party a hanging wax seal: its own colour,
     its emblem pressed in where one suits, cracked black wax where rule was imposed by occupation. */
  // Communist_Party_of_Ukraine (without the suffix) is the legal post-1993 party and stays out
  const IMPOSED = new Set([
    "Nazi_Party", "United_Russia", "Donetsk_Republic_(movement)", "x:Peace_for_Luhansk_Region", "Russian_Unity",
    "Communist_Party_of_Ukraine_(Soviet_Union)", "Communist_Party_of_the_Soviet_Union", "Bolsheviks",
    "Communist_Party_of_Transcarpathian_Ukraine", "Nonpartisan_Bloc_for_Cooperation_with_the_Government",
  ]);
  // never pressed into a seal: the swastika eagle, and photographs that aren't emblems
  const NO_EMBLEM = new Set(["Nazi_Party", "Bolsheviks", "Republican_Party_of_Farmers_and_Peasants", "Opposition_Platform_–_For_Life", "People's_Party_(Ukraine)"]);
  const partyProfile = (key) => R.parties[key] || { name: keyName(key) };
  const partyWiki = (key) => {
    if (NO_EMBLEM.has(key)) return null;
    const m = /\/wiki\/(.+)$/.exec(partyProfile(key).wikipedia || "");
    return m ? decodeURIComponent(m[1]) : null;
  };
  const sealMark = (p) => (String(p.abbr || "").split(/[\/,]/)[0].trim() || initials(p.name || "")).slice(0, 6);
  const isLight = (c) => {
    const m = /^#(..)(..)(..)/.exec(c);
    if (!m) return true; // the fallback palette is all pale
    const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
    return 0.299 * r + 0.587 * g + 0.114 * b > 140;
  };

  /** An irregular wax outline, different for each party but stable between renders. */
  function waxBlob(key) {
    const seed = hashIdx(key, 99991);
    const pts = d3.range(14).map((i) => {
      const a = (i / 14) * Math.PI * 2;
      const r = 43 + (((seed * (i + 3) * 7919) % 100) / 100) * 6;
      return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
    });
    return d3.line().curve(d3.curveCatmullRomClosed)(pts);
  }

  function sealHtml(key, n) {
    const p = partyProfile(key);
    const name = p.name || keyName(key);
    const imposed = IMPOSED.has(key);
    const wax = imposed ? "#17130f" : partyColor(key);
    const lite = !imposed && isLight(wax);
    const ring = `us-ring-${n}`;
    return `<button type="button" class="us${lite ? " lite" : ""}${imposed ? " imposed" : ""}" data-k="${n}" aria-expanded="false" aria-controls="us-cat" style="--wax:${wax}">
      <span class="us-rib" aria-hidden="true"></span>
      <span class="us-wax">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs><path id="${ring}" d="M50 50m-32 0a32 32 0 1 1 64 0a32 32 0 1 1 -64 0"/></defs>
          <path class="us-blob" d="${waxBlob(key)}"/>
          <path class="us-sheen" d="${waxBlob(key)}"/>
          <circle class="us-c" cx="50" cy="50" r="37"/>
          <text class="us-t"><textPath href="#${ring}">${esc(name.toUpperCase())} ✦ ${esc(name.toUpperCase())}</textPath></text>
          ${imposed ? `<path class="us-crack" d="M50 6l-5 17 8 11-9 15 7 12-6 13 4 21M53 34l15-7 9-11M44 49l-18 4-16-5M51 61l16 9 10 13"/>` : ""}
        </svg>
        <span class="us-em"><span class="us-mono">${esc(sealMark(p))}</span></span>
      </span>
      <span class="us-n">${esc(name)}${imposed ? `<em>Imposed</em>` : ""}</span>
    </button>`;
  }

  function universalHtml(note, gov, ctx) {
    R.seals = gov;
    R.sealCtx = ctx;
    return `<div class="un">
      <svg class="un-defs" width="0" height="0" aria-hidden="true">
        <filter id="un-deckle" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="7"/></filter>
        <filter id="us-press" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha" result="a"/><feGaussianBlur in="a" stdDeviation=".7" result="b"/><feDiffuseLighting in="b" surfaceScale="3" diffuseConstant=".61" lighting-color="#fff"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting></filter>
        <radialGradient id="us-light" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>
      </svg>
      <div class="un-sheet">
        <h3 class="un-h">Універсал</h3>
        ${note ? `<p class="un-tx">${esc(note)}</p>` : ""}
        <p class="un-given">Given at ${esc(ctx.place)}, ${esc(ctx.year)}</p>
      </div>
      <div class="un-seals">${gov.map(sealHtml).join("")}</div>
      <div class="un-annex" id="us-cat" hidden></div>
    </div>`;
  }

  /* ---------------- the annex: what a seal opens ----------------
     Computed from the whole dataset, so it answers what a biography can't: where this party
     governs in this era, how long it has held this oblast, and how it did at the ballot here. */
  const SPECTRUM = ["far-left", "left-wing", "centre-left", "centre", "centre-right", "right-wing", "far-right"];

  /** Position on the 0–1 ruler, or null for leanings that aren't left-right ("Big tent", "Regionalism"). */
  function spectrumPos(head) {
    const ends = head.toLowerCase().split(/\s+to\s+/).map((t) => SPECTRUM.indexOf(t.trim()));
    return ends.every((i) => i >= 0) ? d3.mean(ends) / (SPECTRUM.length - 1) : null;
  }

  /** Oblast outlines for the little reach map, thinned to about a pixel. Built once. */
  function miniMapPaths() {
    if (R.mini) return R.mini;
    const fc = M.getOblasts();
    const proj = d3.geoConicConformal().parallels([44, 52]).rotate([-31.5, 0]).fitSize([180, 120], fc);
    const thin = d3.geoTransform({
      lineStart() { this.fresh = true; this.stream.lineStart(); },
      point(x, y) {
        if (this.fresh || Math.hypot(x - this.lx, y - this.ly) > 0.8) { this.stream.point(x, y); this.lx = x; this.ly = y; this.fresh = false; }
      },
    });
    const path = d3.geoPath({ stream: (out) => proj.stream(thin.stream(out)) }).digits(1);
    R.mini = fc.features.map((f) => ({ id: f.id, name: f.properties.name, d: path(f) }));
    return R.mini;
  }

  const eraPolitics = (iso, eraId) => (((R.politics[iso] || {})[eraId] || {}).politics) || {};
  const governsIn = (key, iso, eraId) => (eraPolitics(iso, eraId).governing || []).includes(key);

  /** This party's latest result in this oblast and era, if the data has one. */
  function ballotResult(key, iso, eraId) {
    const found = (eraPolitics(iso, eraId).elections || [])
      .map((e) => ({ e, s: (e.seats || []).find((x) => x && x.party === key) })).filter((x) => x.s);
    if (!found.length) return "";
    const { e, s } = found[found.length - 1];
    return `${s.seats != null ? `${s.seats}${e.total ? ` of ${e.total}` : ""} seats` : `${+(+s.share).toFixed(1)}% of the vote`}, ${e.year}`;
  }

  function annexHtml(key, thumb) {
    const p = partyProfile(key);
    const { iso, eraId, oblast } = R.sealCtx;
    const name = p.name || keyName(key);
    const wax = IMPOSED.has(key) ? "#17130f" : partyColor(key);
    const years = p.founded || p.dissolved ? `${p.founded || "?"}–${p.dissolved || ""}` : "";
    const [head, ...more] = String(p.leaning || "").split(/,\s*/);
    const pos = head ? spectrumPos(head) : null;
    const held = miniMapPaths().filter((o) => governsIn(key, o.id, eraId));
    const eras = ((window.UkraineTimeline && window.UkraineTimeline.eras) || []).filter((e) => e.startYear >= 1917);
    const ballot = ballotResult(key, iso, eraId);

    const map = miniMapPaths().map((o) => `<path d="${o.d}" class="${governsIn(key, o.id, eraId) ? "on" : ""}${o.id === iso ? " here" : ""}"><title>${esc(o.name)}</title></path>`).join("");
    const reign = eras.map((e) => {
      const on = governsIn(key, iso, e.id);
      return `<button type="button" class="ua-e${on ? " on" : ""}${e.id === eraId ? " now" : ""}" data-era="${esc(e.id)}" title="${esc(e.name)}, ${esc(U.fmtRange(e.startYear, e.endYear))}${on ? "" : " (not governing)"}" aria-label="${esc(e.name)}"></button>`;
    }).join("");

    return `<div class="ua" style="--wax:${wax}">
      <button type="button" class="ua-x" aria-label="Close">×</button>
      <header class="ua-head">
        ${thumb ? `<img class="ua-em" src="${esc(thumb)}" alt="">` : ""}
        <div class="ua-id">
          <h4 class="ua-n">${esc(name)}</h4>
          <div class="ua-sub">${[p.abbr, years].filter(Boolean).map(esc).join(" · ")}</div>
        </div>
      </header>
      <div class="ua-body">
        <div class="ua-main">
          ${head ? `<div class="ua-lean"><b>${esc(head)}</b>${more.length ? ` · ${esc(more.join(", "))}` : ""}</div>` : ""}
          ${pos == null ? "" : `<div class="ua-rule" role="img" aria-label="${esc(head)} on a left to right scale"><span class="ua-dot" style="left:${(pos * 100).toFixed(1)}%"></span></div><div class="ua-ends"><span>Left</span><span>Right</span></div>`}
          ${IMPOSED.has(key) ? `<p class="ua-imposed">Held power here through occupation, not by consent of the local population.</p>` : ""}
          ${p.summary ? `<p class="ua-tx">${esc(p.summary)}</p>` : ""}
          ${ballot ? `<p class="ua-ballot"><span>Ballot here</span>${esc(ballot)}</p>` : ""}
          ${extLink(p.wikipedia, "Party on Wikipedia")}
        </div>
        <figure class="ua-map">
          <svg viewBox="0 0 180 120" role="img" aria-label="Oblasts this party governs in this era">${map}</svg>
          <figcaption>Governs ${held.length} of ${miniMapPaths().length} oblasts</figcaption>
        </figure>
      </div>
      <div class="ua-reign">
        <div class="ua-reign-h"><span>${esc(oblast)} since 1917</span><span>Governing in ${eras.filter((e) => governsIn(key, iso, e.id)).length} of ${eras.length} eras</span></div>
        <div class="ua-eras">${reign}</div>
      </div>
    </div>`;
  }

  function bindSeals(iso) {
    const thumbs = new Map();
    const seals = [...view.querySelectorAll(".us")];
    const cat = $("us-cat");
    const close = () => {
      R.openSeal = null;
      seals.forEach((b) => b.setAttribute("aria-expanded", "false"));
      cat.hidden = true;
    };
    const show = (btn) => {
      const key = R.seals[+btn.dataset.k];
      R.openSeal = key;
      seals.forEach((b) => b.setAttribute("aria-expanded", String(b === btn)));
      cat.innerHTML = annexHtml(key, thumbs.get(key));
      cat.hidden = false;
      cat.querySelector(".ua-x").addEventListener("click", close);
      cat.querySelectorAll(".ua-e").forEach((e) => e.addEventListener("click", () => window.UkraineTimeline.setEra(e.dataset.era)));
    };
    seals.forEach((btn) => {
      const key = R.seals[+btn.dataset.k];
      wikiSummary(partyWiki(key)).then((w) => {
        const src = w && w.thumbnail && safeUrl(w.thumbnail.source);
        if (!src || R.iso !== iso || !btn.isConnected) return;
        thumbs.set(key, src);
        if (R.openSeal === key && btn.getAttribute("aria-expanded") === "true") show(btn);
        if (/flag/i.test(src)) return; // flags show in the annex but stay out of the wax
        const img = new Image();
        img.alt = ""; img.src = src;
        img.addEventListener("load", () => btn.classList.add("has-em"));
        btn.querySelector(".us-em").append(img);
      });
      btn.addEventListener("click", () => {
        if (btn.getAttribute("aria-expanded") === "true") { close(); return; }
        show(btn);
        cat.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
    // stays open across eras and oblasts, so a party can be followed through time
    const again = seals.find((b) => R.seals[+b.dataset.k] === R.openSeal);
    if (again) show(again);
  }

  function politicsBlock(pol, ctx) {
    if (!pol) return "";
    const gov = (pol.governing || []).filter(Boolean);
    const els = (pol.elections || []).map(electionBlock).filter(Boolean);
    return (gov.length ? universalHtml(pol.note, gov, ctx) : pol.note ? `<p class="rg-text">${esc(pol.note)}</p>` : "")
      + (els.length ? `<div class="pp-k">Elections</div><div class="el-list">${els.join("")}</div>` : "");
  }

  /* ---------------- conflict: the stamp album ----------------
     Occupiers overprinted Ukraine's stamps (Reich issues in 1941, Russian ones under the trident
     in 1918), so each force is a stamp: one-ink art from its Wikipedia image, cancelled for this
     oblast and year, with foreign forces overprinted. Click a stamp for its catalogue entry. */
  const CAMPS = {
    local: { title: "Local forces" },
    foreign: { title: "Foreign & occupying forces" },
    between: { title: "Divided loyalties" },
    other: { title: "Other forces" },
  };

  function campOf(key, eraId) {
    const c = R.camps && R.camps.groups && R.camps.groups[key];
    const camp = c && typeof c === "object" ? c[eraId] || c.default : c;
    return CAMPS[camp] ? camp : "other";
  }

  const groupProfile = (g) => R.groups[g.group] || { name: keyName(g.group) };
  const groupWiki = (g) => {
    if (R.camps && R.camps.noImage.includes(g.group)) return null;
    const m = /\/wiki\/(.+)$/.exec(groupProfile(g).wikipedia || "");
    return m ? decodeURIComponent(m[1]) : null;
  };
  const issuer = (id, side) => (id === "local" ? "Україна" : /Soviet|USSR/.test(side || "") ? "СРСР" : String(side || "").split(/[,/(]/)[0].trim());
  const initials = (name) => String(name).replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w)).slice(0, 3).map((w) => w[0]).join("");

  function overprint(id, eraId) {
    if (id === "between") return `<span class="st-op st-op-a" aria-hidden="true">Divided</span><span class="st-op st-op-b" aria-hidden="true">Divided</span>`;
    if (id !== "foreign") return "";
    const word = R.camps && R.camps.notOccupation.includes(eraId) ? "Foreign" : "Occupation";
    return `<span class="st-op" aria-hidden="true">${word}</span>`;
  }

  /** Postmark: oblast name round the ring, year in the middle. */
  function cancelMark(place, year, n, turn) {
    const id = `st-ring-${n}`;
    return `<svg class="st-cancel" viewBox="0 0 60 60" aria-hidden="true" style="transform:rotate(${turn}deg)">
      <defs><path id="${id}" d="M30 30m-21 0a21 21 0 1 1 42 0a21 21 0 1 1 -42 0"/></defs>
      <circle cx="30" cy="30" r="28"/><circle cx="30" cy="30" r="15"/>
      <text class="st-c-ring"><textPath href="#${id}">${esc(place)} ★ ${esc(place)} ★</textPath></text>
      <text class="st-c-year" x="30" y="34" text-anchor="middle">${esc(year)}</text>
    </svg>`;
  }

  function stampHtml(g, id, n, ctx) {
    const p = groupProfile(g);
    const name = p.name || keyName(g.group);
    const h = hashIdx(g.group, 1000);
    const tilt = ((h % 30) - 15) / 10;
    return `<li class="st-cell"><button type="button" class="st st-${id}" data-n="${n}" aria-expanded="false" aria-controls="cf-cat" style="--tilt:${tilt}deg">
      <span class="st-paper">
        <span class="st-top"><span>${esc(issuer(id, p.side))}</span><b>${esc(ctx.year)}</b></span>
        <span class="st-art"><span class="st-mono" aria-hidden="true">${esc(initials(name))}</span></span>
        <span class="st-name">${esc(name)}</span>
        ${overprint(id, ctx.eraId)}
        ${cancelMark(ctx.place, ctx.year, n, h % 360)}
      </span>
    </button></li>`;
  }

  /** Written account, then one stockbook page: each camp is a captioned set in its own strip. */
  function conflictBlock(military, list, ctx) {
    const rows = (list || []).filter((g) => g && g.group);
    R.stamps = [];
    const sets = Object.keys(CAMPS).map((id) => {
      const camp = rows.filter((g) => campOf(g.group, ctx.eraId) === id);
      if (!camp.length) return "";
      const stamps = camp.map((g) => { R.stamps.push(g); return stampHtml(g, id, R.stamps.length - 1, ctx); }).join("");
      return `<section class="cf-set">
        <h3 class="cf-set-h">${esc(CAMPS[id].title)}</h3>
        <ul class="cf-strip">${stamps}</ul>
      </section>`;
    }).join("");
    const chron = military ? `<p class="rg-summary cf-chron">${esc(military)}</p>` : "";
    return `${chron}${sets ? `<div class="cf-page"><div class="cf-sets">${sets}</div><div class="cf-cat" id="cf-cat" hidden></div></div>` : ""}`;
  }

  /** Catalogue entry: the same image in true colour, with everything the stamp leaves out. */
  function catalogueHtml(g, thumb) {
    const p = groupProfile(g);
    const meta = [p.type, p.side].filter(Boolean).join(" · ");
    return `${thumb ? `<img class="cf-cat-img" src="${esc(thumb)}" alt="">` : ""}
      <div class="cf-cat-tx">
        <h4 class="cf-cat-n">${esc(p.name || keyName(g.group))}</h4>
        ${meta ? `<div class="pp-lean">${esc(meta)}</div>` : ""}
        ${g.role ? `<p class="rg-text"><span class="pp-here">In this region:</span> ${esc(g.role)}</p>` : ""}
        ${p.summary ? `<p class="rg-text">${esc(p.summary)}</p>` : ""}
        ${extLink(p.wikipedia, "Read on Wikipedia")}
      </div>`;
  }

  function bindAlbum(iso) {
    const thumbs = new Map();
    view.querySelectorAll(".st[data-n]").forEach((btn) => {
      const g = R.stamps[+btn.dataset.n];
      wikiSummary(groupWiki(g)).then((w) => {
        const src = w && w.thumbnail && safeUrl(w.thumbnail.source);
        if (!src || R.iso !== iso || !btn.isConnected) return;
        thumbs.set(g, src);
        const img = new Image();
        img.alt = ""; img.src = src;
        img.addEventListener("load", () => btn.classList.add("has-art"));
        btn.querySelector(".st-art").append(img);
      });
      btn.addEventListener("click", () => {
        const cat = $("cf-cat");
        const open = btn.getAttribute("aria-expanded") === "true";
        view.querySelectorAll(".st[data-n]").forEach((b) => b.setAttribute("aria-expanded", "false"));
        cat.hidden = open;
        if (open) return;
        btn.setAttribute("aria-expanded", "true");
        cat.innerHTML = catalogueHtml(g, thumbs.get(g));
        cat.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
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
    const places = entry && entry.places ? entry.places.filter(Boolean) : [];

    const timeline = eras.length ? treeHtml(d, eras, era) : "";

    // tabs with nothing to show for this era are left out
    const overview = d && d.overview ? `<p>${esc(d.overview)}</p>` : "";
    const tabs = [
      { id: "held", label: "Held by", html: heldHtml(iso, p, entry, eras, era) },
      { id: "conflict", label: "Conflict", html: conflictBlock(entry && entry.military, pol && pol.armedGroups, { eraId: era && era.id, place: p.short || p.name, year: era ? String(era.startYear) : "" }) },
      { id: "politics", label: "Politics", html: politicsBlock(pol && pol.politics, { place: p.center && p.center !== "—" ? p.center : p.name, year: era ? String(era.startYear) : "", iso, eraId: era && era.id, oblast: p.name }) },
      { id: "people", label: "People", html: peopleHtml(iso, era) },
      { id: "history", label: "History", html: postcardHtml(iso, p, d, overview) },
      { id: "timeline", label: "Timeline", html: timeline },
    ].filter((t) => t.html);
    const active = tabs.some((t) => t.id === R.tab) ? R.tab : tabs[0].id;

    view.innerHTML = `
      <div class="rg-bar">
        <button type="button" class="rg-back" id="rg-back"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>Era overview</button>
      </div>
      <h2 class="rg-name">${esc(p.name)}${p.native ? ` <span class="rg-native" lang="uk">${esc(p.native)}</span>` : ""}</h2>
      <div class="er-years">${era ? esc(U.fmtRange(era.startYear, era.endYear)) : ""}</div>
      ${places.length ? `<p class="rg-places">${places.map(esc).join(" · ")}</p>` : ""}

      <div class="rg-tabs" role="tablist" aria-label="Region details">${tabs.map((t) => `
        <button type="button" class="rg-tab" role="tab" id="rg-tab-${t.id}" data-tab="${t.id}" aria-controls="rg-panel-${t.id}"
          aria-selected="${t.id === active}" tabindex="${t.id === active ? 0 : -1}">${esc(t.label)}</button>`).join("")}
      </div>
      ${tabs.map((t) => `<div class="rg-panel" role="tabpanel" id="rg-panel-${t.id}" aria-labelledby="rg-tab-${t.id}" tabindex="0"${t.id === active ? "" : " hidden"}>${t.html}</div>`).join("")}

      ${section("Sources", d ? linkList(d.sources) : "")}`;

    view.hidden = false;
    eraView.hidden = true;

    $("rg-back").addEventListener("click", () => M.selectRegion(null));
    bindTabs();
    bindCloths();
    bindAlbum(iso);
    bindSeals(iso);
    bindTree();
    bindPostcards(iso);
    bindPeople(iso);
    bindHeld();

    const title = wikiTitle(iso, f);
    wikiSummary(title).then((w) => {
      const box = $("rg-wiki");
      if (!box || R.iso !== iso) return;
      const url = (w && w.content_urls && w.content_urls.desktop && w.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
      box.innerHTML = `${w && w.extract ? `<p>${esc(w.extract)}</p>` : ""}${overview}<a class="rg-wiki-more" href="${esc(url)}" target="_blank" rel="noopener">Read more on Wikipedia</a>`;
      const thumb = w && w.thumbnail && safeUrl(w.thumbnail.source);
      const art = view.querySelector(".pc-stamp .st-art");
      if (thumb && art) {
        const img = new Image();
        img.alt = ""; img.src = thumb;
        img.addEventListener("load", () => view.querySelector(".pc-stamp").classList.add("has-art"));
        art.append(img);
      }
    });
  }

  /** Hovering a party row or its stitches lifts that party's threads out of the cloth. */
  function bindCloths() {
    view.querySelectorAll(".el").forEach((el) => {
      const cloth = el.querySelector(".el-cloth");
      const mark = (i) => {
        cloth.classList.toggle("hot", i != null);
        el.querySelectorAll("[data-i]").forEach((n) => n.classList.toggle("on", n.dataset.i === i));
      };
      el.addEventListener("pointerover", (ev) => { const n = ev.target.closest("[data-i]"); mark(n ? n.dataset.i : null); });
      el.addEventListener("pointerleave", () => mark(null));
    });
  }

  /* ---------------- held by: the banknote ----------------
     Land changes hands as money does, and every regime here printed its own: Narbut's Ukrainian
     notes of 1917-18, the Reichskommissariat's occupation karbovanets of 1942. So whoever held
     the land issues the note, and its denomination is the years they held it. "Held by" is free
     text, so it's resolved to a polity; consecutive eras under one polity make one tenure. */
  const POLITIES = [
    { key: "ukraine", label: "Ukraine", wiki: "Ukraine", re: /Independent Ukraine|^Mostly Ukraine|^Ukraine|Ukrainian government|government-controlled/ },
    { key: "russia", label: "Russian occupation", issuer: "Russian Federation", wiki: "Russia", about: "Russian-occupied_territories_of_Ukraine", re: /Russian occupation|Russian-occupied|Russian-held|^Russia\b|Russian Federation|Russian annexation|occupied by Russia|Republic of Crimea|Donetsk People|Luhansk People|\bDPR\b|\bLPR\b/ },
    { key: "uassr", label: "Ukrainian SSR", wiki: "Ukrainian_Soviet_Socialist_Republic", re: /Ukrainian SSR|Ukrainian Soviet/ },
    { key: "crassr", label: "Crimean ASSR", wiki: "Crimean_Autonomous_Soviet_Socialist_Republic", re: /Crimean ASSR|Crimean Oblast/ },
    { key: "ussr", label: "Soviet Union", wiki: "Soviet_Union", re: /Soviet Union|USSR|Soviet|Bolshevik|Russian SFSR/ },
    { key: "nazi", label: "Nazi Germany", wiki: "Reichskommissariat_Ukraine", noFlag: true, dark: true, re: /Reichskommissariat|Nazi|German occupation|Wehrmacht|General Government|District of Galicia|German military/ },
    { key: "german", label: "German Empire", wiki: "German_Empire", re: /German Empire|Imperial German/ },
    { key: "unr", label: "Ukrainian People's Republic", wiki: "Ukrainian_People's_Republic", re: /Ukrainian People's Republic|\bUNR\b|Directorate/ },
    { key: "zunr", label: "West Ukrainian People's Republic", wiki: "West_Ukrainian_People's_Republic", re: /West Ukrainian|\bZUNR\b/ },
    { key: "poland2", label: "Second Polish Republic", wiki: "Second_Polish_Republic", re: /Second Polish Republic|Poland \(|^Poland|Polish rule/ },
    { key: "plc", label: "Polish–Lithuanian Commonwealth", wiki: "Polish–Lithuanian_Commonwealth", re: /Polish-Lithuanian|Commonwealth/ },
    { key: "poland", label: "Kingdom of Poland", wiki: "Crown_of_the_Kingdom_of_Poland", re: /Kingdom of Poland|Polish Crown|Crown of Poland/ },
    { key: "gdl", label: "Grand Duchy of Lithuania", wiki: "Grand_Duchy_of_Lithuania", re: /Lithuania/ },
    { key: "hetman", label: "Cossack Hetmanate", wiki: "Cossack_Hetmanate", re: /Hetmanate|Cossack|Zaporizh|Zaporozh|Sloboda/ },
    { key: "rusemp", label: "Russian Empire", wiki: "Russian_Empire", re: /Russian Empire|Tsardom|Muscov|Moscow|Taurida|New Russia|Novorossi/ },
    { key: "austria", label: "Austrian Empire", wiki: "Austrian_Empire", re: /Austria|Habsburg/ },
    { key: "hungary", label: "Kingdom of Hungary", wiki: "Kingdom_of_Hungary", re: /Hungar/ },
    { key: "romania", label: "Romania", wiki: "Kingdom_of_Romania", re: /Romania/ },
    { key: "czech", label: "Czechoslovakia", wiki: "First_Czechoslovak_Republic", re: /Czech/ },
    { key: "moldavia", label: "Moldavia", wiki: "Moldavia", re: /Moldavia/ },
    { key: "ottoman", label: "Ottoman Empire", wiki: "Ottoman_Empire", re: /Ottoman/ },
    { key: "khanate", label: "Crimean Khanate", wiki: "Crimean_Khanate", re: /Crimean Khanate|Nogai/ },
    { key: "horde", label: "Golden Horde", wiki: "Golden_Horde", re: /Golden Horde|Mongol|Horde/ },
    { key: "galvol", label: "Galicia-Volhynia", wiki: "Kingdom_of_Galicia–Volhynia", re: /Galicia|Volhynia|Ruthenia|Rostislavich/ },
    { key: "rus", label: "Kyivan Rus'", wiki: "Kievan_Rus'", re: /Kyivan Rus|Rus'|Principality of|Kyiv|Chernihiv|Pereiaslav|Novgorod-Sivers/ },
    { key: "cumans", label: "Cumans", wiki: "Cumans", re: /Cuman|Polovts/ },
    { key: "pechenegs", label: "Pechenegs", wiki: "Pechenegs", re: /Pecheneg/ },
    { key: "khazars", label: "Khazars", wiki: "Khazars", re: /Khazar/ },
    { key: "genoa", label: "Republic of Genoa", wiki: "Republic_of_Genoa", re: /Genoese|Genoa/ },
    { key: "byzantium", label: "Byzantine Empire", wiki: "Byzantine_Empire", re: /Byzant|Theodoro|Trebizond/ },
  ];
  // before states: the people of the era
  const PEOPLES = {
    "trypillia": "Cucuteni–Trypillia_culture", "bronze-age-steppe": "Yamnaya_culture", "cimmerians": "Cimmerians",
    "scythians": "Scythians", "sarmatians": "Sarmatians", "goths-chernyakhov": "Chernyakhov_culture",
    "huns": "Huns", "antes": "Antes_(people)", "east-slavic-tribes": "East_Slavs",
  };

  function polityOf(control, era) {
    let best = null, at = Infinity;
    POLITIES.forEach((p) => {
      const i = String(control || "").search(p.re);
      if (i >= 0 && i < at) { at = i; best = p; }
    });
    if (best) return best;
    if (PEOPLES[era.id]) return { key: `era:${era.id}`, label: era.name, wiki: PEOPLES[era.id], ancient: true };
    return { key: "contested", label: "Contested", contested: true };
  }

  /** Consecutive eras under one polity, merged into tenures. */
  function tenures(iso, eras) {
    const runs = [];
    eras.forEach((e) => {
      const en = R.data[iso] && R.data[iso].eras ? R.data[iso].eras[e.id] : null;
      const po = polityOf(en && en.control, e);
      const last = runs[runs.length - 1];
      if (last && last.po.key === po.key) { last.end = e.endYear; last.ids.push(e.id); }
      else runs.push({ po, start: e.startYear, end: e.endYear, ids: [e.id], first: e.id });
    });
    return runs;
  }

  const norm = (t) => String(t).toLowerCase().replace(/[–-]/g, " ");

  /** What the "held by" text adds beyond the polity's name: "Cossack Hetmanate (capital Chyhyryn)" gives "capital Chyhyryn". */
  function controlNote(control, label) {
    const c = String(control || "").replace(/^Independent\s+/, "");
    if (norm(c) === norm(label)) return "";
    if (!norm(c).startsWith(norm(label))) return control;
    return c.slice(label.length).replace(/^[\s,;:(]+|\)$/g, "");
  }

  const plainYear = (y) => U.fmtYear(y).replace(/ CE$/, "");

  /* Coats of arms and emblems on Wikimedia Commons, each checked by eye. Nazi rule, contested
     eras and peoples before states have none: the medallion stays empty or carries a ruzha. */
  const ARMS = {
    ukraine: "Coat_of_Arms_of_Ukraine.svg", russia: "Coat_of_Arms_of_the_Russian_Federation.svg", uassr: "Coat_of_arms_of_Ukrainian_SSR.svg",
    crassr: "Emblem_of_the_Crimean_ASSR.svg", ussr: "State_Emblem_of_the_Soviet_Union.svg", german: "Wappen_Deutsches_Reich_-_Reichsadler_1889.svg",
    unr: "Coat_of_arms_of_the_Ukrainian_People's_Republic.svg", zunr: "Coat_of_Arms_of_the_West_Ukrainian_People's_Republic_(1918—1919).png",
    poland2: "Coat_of_arms_of_Poland_(1928–1939).svg", plc: "Coat_of_arms_of_Vasa_kings_of_Poland.svg", poland: "Herb_Polski.svg",
    gdl: "Coat_of_arms_of_the_Grand_Duchy_of_Lithuania_(A._Guagnini,_1581).svg", hetman: "Coat_of_arms_of_Hetmanate.svg",
    rusemp: "Lesser_coat_of_arms_of_the_Russian_Empire.svg", austria: "Imperial_Coat_of_Arms_of_the_Empire_of_Austria_(1815).svg",
    hungary: "Coat_of_arms_of_Hungary_(1915-1918,_1919-1946;_angels).svg", romania: "Kingdom_of_Romania_Coat_of_Arms_Big_1881-1921.svg",
    czech: "Middle_coat_of_arms_of_Czechoslovakia.svg", moldavia: "Coat_of_arms_of_Moldavia.svg", ottoman: "Coat_of_arms_of_the_Ottoman_Empire_(1882–1922).svg",
    khanate: "Coat_of_arms_of_Crimean_Khanate.png", horde: "Tamga_Mengu-Timur.svg", galvol: "Coat_of_arms_of_Ruthenia_(Герб_Русі).svg",
    rus: "Emblem_of_Kievan_Rus.svg", genoa: "Coat_of_arms_of_Republic_of_Genoa.svg", byzantium: "Byzantine_Palaiologos_Eagle.svg",
  };
  const OCCUPIERS = new Set(["russia", "nazi", "poland2", "ussr", "uassr", "crassr"]);
  const TRYZUB = "m 121 1 c -9.32 10.58 -15 24.42 -15 39.62 0.55 33.37 4.64 66.7 5 100 0.74 31.1 -8.58 60.3 -19.92 88.8 -3.78 7.87 -7.86 15.57 -11.95 23.29 l -12 -2.42 c -10.83 -2.16 -17.87 -12.69 -15.7 -23.52 1.89 -9.47 10.23 -16.1 19.53 -16.1 l 4.38 0.47 l -9.77 -81.6 c -3.19 -36.3 -21.93 -68.2 -49.5 -88.9 -4.74 -3.56 -9.77 -6.82 -15 -9.69 v 289.7 h 66.88 c 5 27.1 19.94 50.8 40.94 67 4.99 3.44 9.18 7.98 12.19 13.28 3 -5.3 7.19 -9.84 12.19 -13.28 21 -16.24 35.94 -39.89 40.94 -67 h 66.88 v -289.7 c -5.23 2.87 -10.26 6.13 -15 9.69 -27.6 20.73 -46.3 52.6 -49.5 88.9 l -9.77 81.6 l 4.38 -0.47 c 9.3 0.04 17.64 6.62 19.53 16.1 2.16 10.83 -4.88 21.35 -15.7 23.52 l -12 2.42 c -4.09 -7.71 -8.18 -15.41 -11.95 -23.29 -11.35 -28.48 -20.67 -57.68 -19.93 -88.8 0.36 -33.4 4.45 -66.7 5 -100 0 -15.2 -5.68 -29 -15 -39.62 z m -100 71.7 c 12.94 15.19 21.63 34.1 24.2 54.93 l 8 67.3 c -10.25 5.1 -18 14.46 -20.94 25.79 h -11.33 v -148 z m 200 0 v 148 h -11.33 c -2.92 -11.32 -10.69 -20.68 -20.94 -25.79 l 8 -67.3 c 2.59 -20.81 11.28 -39.74 24.2 -54.94 z m -100 135.3 c 5.37 17.57 12.76 34.3 21.95 49.78 -8.74 2.65 -16.34 7.81 -21.95 14.76 -5.61 -6.95 -13.21 -12.1 -21.95 -14.77 9.19 -15.51 16.58 -32.2 21.95 -49.77 z m -100 32.74 h 11.33 c 3.57 13.81 14.35 24.71 28 28.52 l 9.61 2.19 c -2.57 9.32 -3.98 19.1 -3.98 29.3 h -45 v -60 z m 188.7 0 h 11.33 v 60 h -45 c 0 -10.14 -1.41 -19.97 -3.98 -29.3 l 9.61 -2.19 c 13.7 -3.81 24.47 -14.72 28 -28.52 z m -120.2 35.3 c 12.13 1.71 21.48 12.1 21.48 24.69 h -25 c 0 -8.57 1.27 -16.84 3.52 -24.69 z m 62.97 0 c 2.25 7.85 3.52 16.1 3.52 24.69 h -25 c 0 -12.61 9.35 -22.98 21.48 -24.69 z m -64.2 44.7 h 22.73 v 42.1 c -11 -11.55 -19 -26 -22.73 -42.1 z m 42.73 0 h 22.73 c -3.68 16.1 -11.7 30.57 -22.73 42.1 v -42.1 z"; // the tryzub, viewBox 0 0 242 402
  const tryzub = (cls) => `<svg class="${cls}" viewBox="0 0 242 402" aria-hidden="true"><path d="${TRYZUB}"/></svg>`;
  // an eight-pointed ruzha, the folk-embroidery star, for those with no arms of their own
  const RUZHA = `<svg class="nt-ruzha" viewBox="-50 -50 100 100" aria-hidden="true">${d3.range(8).map((i) => `<path transform="rotate(${i * 45})" d="M0 0L9 -22L0 -46L-9 -22Z"/>`).join("")}<circle r="6"/></svg>`;

  /** A wheat ear down one side of the wreath and kalyna down the other, tied at the foot in blue and gold. */
  function wreath(cx, cy, r) {
    const at = (deg, rad) => { const t = (deg * Math.PI) / 180; return [cx + rad * Math.cos(t), cy + rad * Math.sin(t)]; };
    const wheat = d3.range(112, 256, 8).map((a) => [-1, 1].map((side) => {
      const [x, y] = at(a, r + side * 8);
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3.2" ry="8" transform="rotate(${a + 90 + side * 24 - 90} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }).join("")).join("");
    const leaves = d3.range(-64, 72, 22).map((a) => {
      const [x, y] = at(a, r + 11);
      return `<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a + 20})" d="M-13 0C-6 -9 6 -9 13 0C6 9 -6 9 -13 0Z"/>`;
    }).join("");
    const berries = d3.range(-74, 80, 11).map((a, i) => {
      const [x, y] = at(a, r - 5 + (i % 2) * 7);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.6"/>`;
    }).join("");
    const [bx, by] = at(90, r + 3);
    return `<circle class="w-stem" cx="${cx}" cy="${cy}" r="${r}"/><g class="w-wheat">${wheat}</g><g class="w-leaf">${leaves}</g><g class="w-berry">${berries}</g>
      <path class="w-blue" d="M${bx} ${by}l-22 -7v15l14 -1Z"/><path class="w-gold" d="M${bx} ${by}l22 -7v15l-14 -1Z"/><circle class="w-knot" cx="${bx}" cy="${by}" r="5"/>`;
  }

  /** Engraved security printing, drawn once. */
  function noteArt() {
    if (R.noteArt) return R.noteArt;
    const W = 760, H = 430, MX = 196, MY = 205;
    const lines = d3.range(30).map((k) => {
      const wave = (dir) => "M" + d3.range(30, W - 29, 8).map((x) => `${x} ${(38 + k * 12.5 + dir * 6 * Math.sin(x / 26 + k * 0.7)).toFixed(1)}`).join("L");
      return `<path d="${wave(1)}"/><path d="${wave(-1)}"/>`;
    }).join("");
    const rosette = (cx, cy, R0, lobes, rings, step) => d3.range(rings).map((j) => {
      const pts = d3.range(0, 361, 2).map((a) => {
        const t = (a * Math.PI) / 180;
        const r = (R0 - j * step) * (1 + 0.11 * Math.sin(lobes * t + j * 0.5));
        return `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
      });
      return `<path d="M${pts.join("L")}Z"/>`;
    }).join("");
    R.noteArt = `<svg class="nt-art" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <defs>
        <pattern id="nt-vysh" width="26" height="20" patternUnits="userSpaceOnUse">
          <path class="v1" d="M13 1l9 9-9 9-9-9z"/><path class="v2" d="M13 5l5 5-5 5-5-5z"/><path class="v3" d="M13 8l2 2-2 2-2-2zM0 6l4 4-4 4zM26 6l-4 4 4 4z"/>
        </pattern>
        <clipPath id="nt-in"><rect x="34" y="34" width="${W - 68}" height="${H - 68}"/></clipPath>
      </defs>
      <g clip-path="url(#nt-in)">
        <g class="nt-lines">${lines}</g>
        ${tryzub("nt-wm").replace("<svg", `<svg x="470" y="66" width="182" height="302"`)}
        <g class="nt-rose">${rosette(MX, MY, 172, 16, 11, 7)}${rosette(650, 340, 84, 10, 7, 6)}</g>
      </g>
      <rect class="nt-band" x="14" y="14" width="${W - 28}" height="20"/><rect class="nt-band" x="14" y="${H - 34}" width="${W - 28}" height="20"/>
      <rect class="nt-band" transform="translate(34 34) rotate(90)" width="${H - 68}" height="20"/>
      <rect class="nt-band" transform="translate(${W - 14} 34) rotate(90)" width="${H - 68}" height="20"/>
      <rect class="nt-b1" x="9" y="9" width="${W - 18}" height="${H - 18}"/><rect class="nt-b2" x="34" y="34" width="${W - 68}" height="${H - 68}"/>
      <g class="nt-wreath">${wreath(MX, MY, 96)}</g>
    </svg>`;
    return R.noteArt;
  }

  /** The tenure as a note: its denomination is the years held. */
  function banknoteHtml(t, title, note, isLast) {
    const po = t.po, n = t.end - t.start;
    const th = threadOf(po.label).id;
    const over = OCCUPIERS.has(po.key) ? "Occupation" : po.contested ? "Contested" : "";
    const emblem = ARMS[po.key]
      ? `<img src="${esc(fileUrl(ARMS[po.key], 360))}" alt="${esc(`Emblem: ${po.label}`)}">`
      : po.dark || po.contested ? "" : RUZHA;
    return `<div class="nt th-${th}${title.length > 26 ? " long" : ""}${over ? " over" : ""}">
      ${noteArt()}
      <div class="nt-med">${emblem}</div>
      <div class="nt-body">
        <div class="nt-iss">${tryzub("nt-try")}Володар землі</div>
        <h3 class="nt-n">${esc(title)}</h3>
        ${note ? `<div class="nt-note">${esc(note)}</div>` : ""}
      </div>
      <div class="nt-ser">№ ${esc(plainYear(t.start))}–${isLast ? "" : esc(plainYear(t.end))}</div>
      <div class="nt-val"><b>${esc(d3.format(",")(n))}</b><span>year${n === 1 ? "" : "s"}</span></div>
      ${over ? `<div class="nt-over" aria-hidden="true">${over}</div>` : ""}
    </div>`;
  }

  function heldHtml(iso, p, entry, eras, era) {
    if (!entry || !era) return `<p class="rg-pending">${R.data[iso] ? "No entry for this era yet." : "Research for this region is still being compiled. It will appear here automatically."}</p>`;
    const runs = tenures(iso, eras);
    const i = runs.findIndex((t) => t.ids.includes(era.id));
    const t = runs[i], po = t.po, before = runs[i - 1], after = runs[i + 1];
    const parts = po.ancient ? String(entry.control).split(/\s*[(;]\s*/) : null;
    const title = po.ancient ? parts[0] : po.issuer || po.label; // the overprint already says "occupation"
    const note = po.ancient ? parts.slice(1).join("; ").replace(/\)/g, "") : controlNote(entry.control, po.label);
    const hand = (r, dir) => {
      if (!r) return "<span></span>";
      const n = r.end - r.start;
      return `<button type="button" class="nm th-${threadOf(r.po.label).id} ${dir < 0 ? "prev" : "next"}" data-era="${esc(r.first)}">
        <span class="nm-t"><span class="nm-n">${dir < 0 ? "‹ " : ""}${esc(r.po.label)}${dir > 0 ? " ›" : ""}</span><span class="nm-v">${esc(d3.format(",")(n))}</span></span>
      </button>`;
    };
    return `<div class="hb" data-wiki="${esc(po.wiki || "")}" data-about="${esc(po.about || po.wiki || "")}">
      <div class="hb-tray">
        ${banknoteHtml(t, title, note, !after)}
        <div class="hb-hands">${hand(before, -1)}${hand(after, 1)}</div>
      </div>
      <p class="rg-summary">${esc(entry.summary)}</p>
      <details class="hb-about" hidden><summary>Background</summary><div class="hb-about-b"></div></details>
      ${section("Read more", linkList(entry.links))}
    </div>`;
  }

  function bindHeld() {
    const hb = view.querySelector(".hb");
    if (!hb) return;
    const iso = R.iso;
    hb.querySelectorAll(".nm").forEach((b) => b.addEventListener("click", () => window.UkraineTimeline.setEra(b.dataset.era)));
    wikiSummary(hb.dataset.wiki).then((w) => {
      if (!w || R.iso !== iso || !hb.isConnected) return;
      const src = w.thumbnail && safeUrl(w.thumbnail.source);
      const isFlag = src && /flag|chor%C4%85giew|banner/i.test(src);
      const nazi = hb.dataset.wiki === "Reichskommissariat_Ukraine";
      const art = src && !isFlag && !nazi ? src : null; // a map or artefact belongs with the text
      wikiSummary(hb.dataset.about).then((a) => {
        if (!a || R.iso !== iso || !hb.isConnected) return;
        const about = hb.querySelector(".hb-about");
        const url = a.content_urls && a.content_urls.desktop && a.content_urls.desktop.page;
        about.querySelector(".hb-about-b").innerHTML = `${art ? `<img src="${esc(art)}" alt="">` : ""}<div><p class="rg-text">${esc(a.extract)}</p>${extLink(url, "Read on Wikipedia")}</div>`;
        about.hidden = false;
      });
    });
  }

  /* ---------------- people: a parsuna gallery ----------------
     The parsuna was Ukraine's Cossack-baroque portrait: a stiff, dignified likeness in a gilded
     frame with an inscription. Portraits come from Wikipedia, everything is readable without a
     click, and a person marked `iron` (a perpetrator) is documented without the gold. */
  const BUST = `<svg class="pn-bust" viewBox="0 0 80 100" aria-hidden="true"><path d="M40 16a17 17 0 1 1 0 34a17 17 0 0 1 0-34zM10 100c0-26 13-42 30-42s30 16 30 42z"/></svg>`;
  const personTitle = (url) => { const m = /\/wiki\/(.+)$/.exec(url || ""); return m ? decodeURIComponent(m[1]) : null; };

  function peopleHtml(iso, era) {
    const list = (era && R.people[iso] && R.people[iso][era.id]) || [];
    if (!list.length) return "";
    return `<div class="pn-wall">${list.map((p) => `<article class="pn${p.iron ? " iron" : ""}">
      <div class="pn-frame"><div class="pn-mat" data-wiki="${esc(personTitle(p.wikipedia) || "")}" data-lang="${/\/\/uk\./.test(p.wikipedia || "") ? "uk" : "en"}">${BUST}</div></div>
      <div class="pn-plate">
        ${safeUrl(p.wikipedia) ? `<a class="pn-n" href="${esc(p.wikipedia)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : `<span class="pn-n">${esc(p.name)}</span>`}
        ${p.role ? `<span class="pn-r">${esc(p.role)}</span>` : ""}
      </div>
      ${p.note ? `<p class="pn-note">${esc(p.note)}</p>` : ""}
    </article>`).join("")}</div>`;
  }

  function bindPeople(iso) {
    view.querySelectorAll(".pn-mat").forEach((mat) => {
      wikiSummary(mat.dataset.wiki || null, mat.dataset.lang).then((w) => {
        const src = w && w.thumbnail && safeUrl(w.thumbnail.source);
        if (!src || R.iso !== iso || !mat.isConnected) return;
        const img = new Image();
        img.alt = ""; img.src = src;
        img.addEventListener("load", () => { mat.textContent = ""; mat.append(img); });
      });
    });
  }

  /* ---------------- history: both sides of a postcard ----------------
     Every other tab is about power; this one shows the place. Front: a stack of hand-picked
     photographs. Back: the history as the message, the oblast's facts as the address. */
  const fileUrl = (file, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`;
  const filePage = (file) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;

  function postcardHtml(iso, p, d, overview) {
    const cards = R.cards[iso] || [];
    const town = p.center && p.center !== "—" ? p.center : p.name;
    const km2 = p.km2 ? `${d3.format(",.0f")(p.km2)} km²` : "";
    const lands = d && d.historicalRegions ? d.historicalRegions.join(", ") : "";
    const front = cards.length ? `<div class="pc-front">
        <div class="pc-stack">${cards.map((c, i) => `<button type="button" class="pc-card" data-pos="${i}" aria-label="Next photograph" style="--t:${((hashIdx(c.file, 40) - 20) / 10).toFixed(1)}deg">
          <img src="${esc(fileUrl(c.file, 900))}" alt="${esc(c.caption)}" ${i ? 'loading="lazy"' : ""}>
          <span class="pc-hello">Greetings from <b>${esc(town)}</b></span>
          ${cancelMark(p.short || p.name, "2026", `pc${i}`, hashIdx(c.file, 360))}
        </button>`).join("")}</div>
        <div class="pc-cap">
          <button type="button" class="pc-nav" data-step="-1" aria-label="Previous photograph">‹</button>
          <span class="pc-cap-t" aria-live="polite"></span>
          <button type="button" class="pc-nav" data-step="1" aria-label="Next photograph">›</button>
        </div>
      </div>` : "";
    return `${front}<div class="pc-back">
      <div class="pc-msg" id="rg-wiki">${overview}<div class="rg-wiki-loading">Loading Wikipedia summary…</div></div>
      <div class="pc-addr">
        <span class="st pc-stamp st-local"><span class="st-paper">
          <span class="st-top"><span>Україна</span></span>
          <span class="st-art"><span class="st-mono" aria-hidden="true">${esc(initials(p.name))}</span></span>
        </span></span>
        <dl class="pc-lines">
          <dd class="pc-to">${esc(p.name)}</dd>
          ${p.native ? `<dd lang="uk">${esc(p.native)}</dd>` : ""}
          ${p.center && p.center !== "—" ? `<dt>Centre</dt><dd>${esc(p.center)}</dd>` : ""}
          ${km2 ? `<dt>Area</dt><dd>${esc(km2)}</dd>` : ""}
          ${lands ? `<dt>Historic lands</dt><dd>${esc(lands)}</dd>` : ""}
        </dl>
      </div>
    </div>`;
  }

  function bindPostcards(iso) {
    const cards = R.cards[iso] || [];
    const els = [...view.querySelectorAll(".pc-card")].map((el, i) => ({ el, card: cards[i] }));
    if (!els.length) return;
    const cap = view.querySelector(".pc-cap-t");
    let cur = 0;
    const show = () => {
      els.forEach(({ el }, i) => { el.dataset.pos = (i - cur + els.length) % els.length; el.tabIndex = i === cur ? 0 : -1; });
      const c = els[cur].card;
      cap.innerHTML = `${esc(c.caption)} <a href="${esc(filePage(c.file))}" target="_blank" rel="noopener">Photo: Wikimedia Commons</a>`;
    };
    const step = (n) => { cur = (cur + n + els.length) % els.length; show(); };
    els.forEach((item) => {
      item.el.addEventListener("click", () => step(1));
      // a photo that's gone from Commons drops out instead of leaving a broken card
      item.el.querySelector("img").addEventListener("error", () => {
        item.el.remove(); els.splice(els.indexOf(item), 1);
        if (els.length) { cur = 0; show(); } else view.querySelector(".pc-front").remove();
      });
    });
    view.querySelectorAll(".pc-nav").forEach((b) => b.addEventListener("click", () => step(+b.dataset.step)));
    show();
  }

  /* ---------------- timeline: the Tree of Life ----------------
     Дерево життя, the central motif of Ukrainian embroidery and Petrykivka painting. Roots in
     Trypillia, crown today; every era is a readable row on a trunk that changes colour with the
     power holding this oblast. Ages fold, and a ruler can be picked to show only its eras. */
  const THREADS = [
    { id: "ua", label: "Ukrainian & Rus'", re: /Ukrain(?!ian SSR|ian Soviet)|Hetman|Cossack|Rus'|Galicia|Volhynia|Ruthenia|Zaporizh|Zaporozh|Sich|Kyiv(?! culture)|Chernihiv|Kholodny Yar/ },
    { id: "ru", label: "Russian & Soviet", re: /Ukrainian SSR|Ukrainian Soviet|SSR|Soviet|Bolshevik|Russia|Muscov|Moscow|occupied|\bWhites?\b(?! Croat)/ },
    { id: "pl", label: "Polish–Lithuanian", re: /Poland|Polish|Lithuania|Commonwealth/ },
    { id: "ce", label: "Central European", re: /Austria|Habsburg|Hungar|Romania|Moldav|German|Nazi|Reich|Czech|Bukovina/ },
    { id: "st", label: "Steppe powers", re: /Horde|Khanate|Tatar|Ottoman|Mongol|Cuman|Polovts|Khazar|Pecheneg|\bHun(?!gar)|Scyth|Sarmat|Goth|Avar|Bulgar/ },
  ];
  const EARLY = { id: "ea", label: "Early & other peoples" };
  const AGES = [
    { label: "Independence", from: 1991 },
    { label: "Revolution & Soviet rule", from: 1917 },
    { label: "Empires", from: 1775 },
    { label: "Cossack Hetmanate", from: 1648 },
    { label: "Lithuania & Poland", from: 1349 },
    { label: "Kyivan Rus'", from: 882 },
    { label: "Ancient roots", from: -Infinity },
  ];
  const ageOf = (e) => AGES.findIndex((a) => e.startYear >= a.from);
  const LEAF = `<svg class="tr-leaf" viewBox="0 0 22 12" aria-hidden="true"><path d="M0 7C5 0 15-1 22 3C17 10 7 12 0 7Z"/><path class="v" d="M2 7C8 5 14 4 20 3.4"/></svg>`;
  const PETALS = (n, r) => d3.range(n).map((i) => `<path transform="rotate(${(i * 360) / n})" d="M0 -3C${r * 0.42} ${-r * 0.5} ${r * 0.34} ${-r * 0.92} 0 ${-r}C${-r * 0.34} ${-r * 0.92} ${-r * 0.42} ${-r * 0.5} 0 -3Z"/>`).join("");
  const FLOWER = (cls, n, r) => `<svg class="${cls}" viewBox="${-r - 1} ${-r - 1} ${2 * r + 2} ${2 * r + 2}" aria-hidden="true">${PETALS(n, r)}<circle r="3"/></svg>`;

  /** Whoever the text names first decides the thread: "Mostly Ukraine; Russian-held strips" is Ukrainian. */
  function threadOf(control) {
    let best = EARLY, at = Infinity;
    THREADS.forEach((t) => {
      const i = String(control || "").search(t.re);
      if (i >= 0 && i < at) { at = i; best = t; }
    });
    return best;
  }

  function treeHtml(d, eras, era) {
    const curAge = era ? ageOf(era) : -1;
    if (curAge >= 0 && R.treeAgeFor !== era.id) { (R.treeOpen = R.treeOpen || new Set()).add(curAge); R.treeAgeFor = era.id; }
    const open = (R.treeOpen = R.treeOpen || new Set());
    const threadAt = (e) => threadOf(d && d.eras && d.eras[e.id] && d.eras[e.id].control);
    const used = new Map(eras.map((e) => { const t = threadAt(e); return [t.id, t]; }));
    const only = used.has(R.treeOnly) ? R.treeOnly : null;

    const ages = AGES.map((age, a) => {
      const list = eras.filter((e) => ageOf(e) === a).reverse(); // newest at the top: the tree grows upward
      const shown = only ? list.filter((e) => threadAt(e).id === only) : list;
      if (!shown.length) return "";
      const isOpen = only || open.has(a);
      const oldest = list[list.length - 1], newest = list[0];
      const buds = list.slice().reverse().map((e) => `<i class="th-${threadAt(e).id}"></i>`).join("");
      const rows = shown.map((e, i) => {
        const en = d && d.eras ? d.eras[e.id] : null;
        const th = threadAt(e), now = era && e.id === era.id;
        return `<li class="tr-e th-${th.id}${now ? " now" : ""}${i % 2 ? " alt" : ""}">
          <button type="button" class="tr-b" data-era="${esc(e.id)}"${now ? ' aria-current="true"' : ""}>
            <span class="tr-node">${now ? FLOWER("tr-bloom", 6, 13) : LEAF}</span>
            <span class="tr-y">${esc(U.fmtYear(e.startYear))}</span>
            <span class="tr-t"><span class="tr-n">${esc(e.name)}</span>${en && en.control ? `<span class="tr-c">${esc(en.control)}</span>` : ""}</span>
          </button>
          ${now && en && en.summary ? `<p class="tr-story">${esc(en.summary)}</p>` : ""}
        </li>`;
      }).join("");
      return `<section class="tr-age${isOpen ? " open" : ""}" data-a="${a}">
        <button type="button" class="tr-h" aria-expanded="${!!isOpen}"${only ? " disabled" : ""}>
          <span class="tr-node">${FLOWER("tr-rose", 8, 11)}</span>
          <span class="tr-h-n">${esc(age.label)}</span>
          <span class="tr-buds" aria-hidden="true">${buds}</span>
          <span class="tr-h-y">${esc(U.fmtYear(oldest.startYear))}${newest !== oldest ? `–${esc(String(newest.endYear))}` : ""}</span>
        </button>
        ${isOpen ? `<ol class="tr-eras">${rows}</ol>` : ""}
      </section>`;
    }).join("");

    const keys = [...THREADS, EARLY].filter((t) => used.has(t.id)).map((t) => {
      const n = eras.filter((e) => threadAt(e).id === t.id).length;
      return `<button type="button" class="tr-k th-${t.id}" data-only="${t.id}" aria-pressed="${only === t.id}"><i></i>${esc(t.label)} <span>${n}</span></button>`;
    }).join("");
    return `<div class="tr-keys" role="group" aria-label="Show only the eras of one ruling power">${keys}</div>
      <div class="tr">${ages}<svg class="tr-roots" viewBox="0 0 44 30" aria-hidden="true"><path d="M22 0C22 12 22 14 22 18M22 8C18 14 12 16 6 26M22 8C26 14 32 16 38 26M22 14C20 20 17 24 15 30M22 14C24 20 27 24 29 30"/></svg></div>`;
  }

  function bindTree() {
    const scope = $("rg-panel-timeline");
    if (!scope) return;
    scope.querySelectorAll(".tr-b").forEach((b) => b.addEventListener("click", () => {
      R.treeJump = true;
      window.UkraineTimeline.setEra(b.dataset.era);
    }));
    scope.querySelectorAll(".tr-h").forEach((b) => b.addEventListener("click", () => {
      const a = +b.closest(".tr-age").dataset.a;
      if (!R.treeOpen.delete(a)) R.treeOpen.add(a);
      render();
    }));
    scope.querySelectorAll(".tr-k").forEach((b) => b.addEventListener("click", () => {
      R.treeOnly = R.treeOnly === b.dataset.only ? null : b.dataset.only;
      render();
    }));
    // the era change scrolls the sidebar to the top: bring the chosen row back
    if (R.treeJump) {
      R.treeJump = false;
      const row = scope.querySelector(".tr-e.now");
      if (row) requestAnimationFrame(() => row.scrollIntoView({ block: "center" }));
    }
  }

  /** Tab bar: click or arrow keys swap panels; the choice carries across regions and eras. */
  function bindTabs() {
    const bar = view.querySelector(".rg-tabs");
    const btns = [...bar.querySelectorAll(".rg-tab")];
    const pick = (btn, focus) => {
      R.tab = btn.dataset.tab;
      btns.forEach((b) => {
        const on = b === btn;
        b.setAttribute("aria-selected", on);
        b.tabIndex = on ? 0 : -1;
        $(b.getAttribute("aria-controls")).hidden = !on;
      });
      btn.scrollIntoView({ block: "nearest", inline: "nearest" });
      // already scrolled past the bar: start the new panel at its top
      const panel = $(btn.getAttribute("aria-controls"));
      const top = side.scrollTop + panel.getBoundingClientRect().top - side.getBoundingClientRect().top - bar.offsetHeight - 14;
      if (side.scrollTop > top) side.scrollTop = top;
      if (focus) btn.focus();
    };
    btns.forEach((b, i) => {
      b.addEventListener("click", () => pick(b));
      b.addEventListener("keydown", (ev) => {
        const next = { ArrowRight: btns[(i + 1) % btns.length], ArrowLeft: btns[(i - 1 + btns.length) % btns.length], Home: btns[0], End: btns[btns.length - 1] }[ev.key];
        if (!next) return;
        ev.preventDefault();
        ev.stopPropagation(); // these keys step through eras everywhere else
        pick(next, true);
      });
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
