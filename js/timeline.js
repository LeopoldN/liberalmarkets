/* =====================================================================
   timeline.js — era scrubber for the Ukraine map
   Consumes window.UKRAINE_HISTORY (data/history.js) or a built-in
   placeholder, and drives UkraineMap.showEra().
   Exposed as window.UkraineTimeline.
   ===================================================================== */
(function () {
  "use strict";

  const U = window.GeoUtils;
  const PLAY_MS = 4000;
  const $ = (id) => document.getElementById(id);

  const T = {
    data: null,
    eras: [],
    idx: -1,
    playing: false,
    timer: 0,
    present: false,
    isPlaceholder: false,
    hover: -1,
  };

  const trackEl = $("tl-track");
  const readoutEl = $("tl-readout");

  /* ---------------- data intake ---------------- */

  function validEra(e) {
    return e && typeof e === "object" && isFinite(e.startYear) && (e.endYear === undefined || e.endYear === null || isFinite(e.endYear));
  }

  function placeholder(map) {
    const ukr = map.getPresentDayGeometry();
    const crimea = map.getOblastGeometry("UA-43");
    const sev = map.getOblastGeometry("UA-40");
    const occ = [];
    [crimea, sev].forEach((g) => {
      if (!g) return;
      if (g.type === "Polygon") occ.push(g.coordinates);
      else if (g.type === "MultiPolygon") occ.push(...g.coordinates);
    });
    return {
      meta: { title: "Placeholder", generated: null, notes: "Built-in sample used until data/history.js is available." },
      eras: [
        {
          id: "independent-ukraine", name: "Independent Ukraine", startYear: 1991, endYear: 2014,
          polity: "Ukraine",
          summary: "Ukraine declares independence from the Soviet Union on 24 August 1991, confirmed by referendum on 1 December. Its internationally recognized borders follow those of the Ukrainian SSR, including Crimea.",
          keyEvents: [
            { year: 1991, text: "Declaration of independence (24 Aug); referendum confirms it (1 Dec)." },
            { year: 1994, text: "Budapest Memorandum: security assurances in exchange for nuclear disarmament." },
            { year: 1996, text: "Constitution of Ukraine adopted." },
            { year: 2004, text: "Orange Revolution." },
          ],
          capital: { name: "Kyiv", lon: 30.523, lat: 50.45 },
          territory: ukr,
          territoryLabel: "Ukraine",
          overlays: [],
          confidence: "high",
        },
        {
          id: "present-day", name: "Present day", startYear: 2014, endYear: 2026,
          polity: "Ukraine",
          summary: "Russia occupies and illegally annexes Crimea in 2014 and launches a full-scale invasion in February 2022. Ukraine's internationally recognized borders remain unchanged. Only Crimea is shown as occupied in this sample.",
          keyEvents: [
            { year: 2014, text: "Revolution of Dignity; Russian occupation of Crimea; war begins in Donbas." },
            { year: 2022, text: "Russia launches a full-scale invasion (24 Feb)." },
          ],
          capital: { name: "Kyiv", lon: 30.523, lat: 50.45 },
          territory: ukr,
          territoryLabel: "Ukraine",
          overlays: occ.length ? [{ name: "Crimea (occupied since 2014)", kind: "occupied", territory: { type: "MultiPolygon", coordinates: occ } }] : [],
          confidence: "high",
        },
      ],
      historicalUkrainianLands: null,
    };
  }

  function load(data, opts) {
    const o = Object.assign({ placeholder: false, startId: null }, opts);
    if (!data || !Array.isArray(data.eras)) {
      console.warn("[UkraineTimeline] dataset has no eras array; ignoring", data);
      return false;
    }
    const eras = data.eras.filter(validEra).slice().sort((a, b) => a.startYear - b.startYear || (a.endYear || 0) - (b.endYear || 0));
    const dropped = data.eras.length - eras.length;
    if (dropped) console.warn(`[UkraineTimeline] skipped ${dropped} era(s) without numeric startYear`);
    if (!eras.length) return false;

    T.data = data; T.eras = eras; T.isPlaceholder = o.placeholder;
    stop();
    window.UkraineMap.setHistoricalLands(data.historicalUkrainianLands || null);
    renderSource();
    renderTrack();
    let start = eras.length - 1;
    if (o.startId) { const i = eras.findIndex((e) => e.id === o.startId); if (i >= 0) start = i; }
    T.idx = -1;
    go(start, { animate: false });
    return true;
  }

  function renderSource() {
    const el = $("tl-src");
    if (!el) return;
    const n = T.eras.length;
    if (T.isPlaceholder) {
      el.innerHTML = `<span class="warn">Sample data</span> · history dataset not loaded yet`;
      el.title = "data/history.js was not found or did not define window.UKRAINE_HISTORY";
    } else {
      const m = (T.data && T.data.meta) || {};
      el.textContent = `${m.title || "History dataset"} · ${n} eras`;
      el.title = m.notes || "";
    }
  }

  /* ---------------- track rendering ----------------
     A namysto, the Ukrainian necklace: one bead per era, sized by its length, strung in a swag
     per age. The selected era wears the dukach, the gold coin pendant. */
  const AGES = [
    { id: "roots", label: "Ancient roots", from: -Infinity },
    { id: "rus", label: "Kyivan Rus'", from: 882 },
    { id: "pl", label: "Lithuania & Poland", from: 1349 },
    { id: "cossack", label: "Cossack Hetmanate", from: 1648 },
    { id: "empires", label: "Empires", from: 1775 },
    { id: "soviet", label: "Revolution & Soviet rule", from: 1917 },
    { id: "ind", label: "Independence", from: 1991 },
  ];
  const STONES = { roots: "#c98a2e", rus: "#8e2233", pl: "#1f8f8a", cossack: "#c8321f", empires: "#2a4f9c", soviet: "#2b2626", ind: "#e0ae22" };
  const ageIndex = (e) => { let a = 0; AGES.forEach((g, i) => { if (e.startYear >= g.from) a = i; }); return a; };

  let geom = null; // { x0, x1, segW, ys, w, h }

  function renderTrack() {
    const w = trackEl.clientWidth || 600, h = trackEl.clientHeight || 96;
    const n = T.eras.length;
    const pad = 12;
    const x0 = pad, x1 = w - pad;
    const segW = (x1 - x0) / n;
    const top = 30, sag = Math.min(12, h * 0.12);

    // the swags: one per age, between its first and last bead
    const spans = [];
    T.eras.forEach((e, i) => {
      const a = ageIndex(e), last = spans[spans.length - 1];
      if (last && last.a === a) last.to = i; else spans.push({ a, from: i, to: i });
    });
    const xAt = (i) => x0 + (i + 0.5) * segW;
    const ys = T.eras.map((e, i) => {
      const sp = spans.find((q) => i >= q.from && i <= q.to);
      const a = sp.from - 0.5, b = sp.to + 0.5, t = ((i - a) / (b - a)) * 2 - 1;
      return top + sag * (1 - t * t);
    });
    geom = { x0, x1, segW, ys, w, h };

    const svg = d3.select(trackEl).selectAll("svg").data([0]).join("svg");
    svg.attr("viewBox", `0 0 ${w} ${h}`).attr("preserveAspectRatio", "xMidYMin meet");
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    Object.entries(STONES).forEach(([id, c]) => {
      const g = defs.append("radialGradient").attr("id", `nk-${id}`).attr("cx", "36%").attr("cy", "30%").attr("r", "75%");
      g.append("stop").attr("offset", "0").attr("stop-color", d3.color(c).brighter(1.4));
      g.append("stop").attr("offset", ".5").attr("stop-color", c);
      g.append("stop").attr("offset", "1").attr("stop-color", d3.color(c).darker(1.1));
    });
    const coin = defs.append("radialGradient").attr("id", "nk-coin").attr("cx", "38%").attr("cy", "32%").attr("r", "80%");
    coin.append("stop").attr("offset", "0").attr("stop-color", "#fff2b8");
    coin.append("stop").attr("offset", ".55").attr("stop-color", "#e0ae22");
    coin.append("stop").attr("offset", "1").attr("stop-color", "#94690c");

    // the cord
    const pts = T.eras.map((e, i) => [xAt(i), ys[i]]);
    svg.append("path").attr("class", "nk-cord").attr("d", d3.line().curve(d3.curveCatmullRom)([[x0 - 8, top], ...pts, [x1 + 8, top]]));

    // each age's name and first year, above its swag, where it fits
    let lastRight = -1e9;
    spans.forEach((sp) => {
      const x = x0 + sp.from * segW, room = (sp.to - sp.from + 1) * segW - 6;
      const year = shortYear(T.eras[sp.from].startYear);
      const full = `${year} · ${AGES[sp.a].label}`;
      const label = full.length * 5.6 < room ? full : year.length * 5.6 < room ? year : "";
      if (!label || x < lastRight) return;
      lastRight = x + label.length * 5.6;
      svg.append("line").attr("class", "nk-mark").attr("x1", x).attr("x2", x).attr("y1", 6).attr("y2", top - 2);
      svg.append("text").attr("class", "nk-age").attr("x", x + 4).attr("y", 13).text(label);
    });

    // beads, with a full-height hit area each
    const beads = svg.append("g");
    const maxR = Math.min(segW * 0.47, 12);
    T.eras.forEach((e, i) => {
      const yrs = Math.max(1, (isFinite(e.endYear) ? e.endYear : e.startYear) - e.startYear);
      const r = Math.max(Math.min(3.4, maxR), Math.min(maxR, 3.6 + 2.3 * Math.log10(yrs)));
      const g = beads.append("g").attr("class", "tl-g").attr("data-i", i);
      g.append("rect").attr("class", "tl-seg").attr("x", x0 + i * segW).attr("y", 0).attr("width", segW).attr("height", h);
      g.append("circle").attr("class", "nk-b").attr("cx", xAt(i)).attr("cy", ys[i]).attr("r", r).style("fill", `url(#nk-${AGES[ageIndex(e)].id})`);
    });

    // the dukach: ribbon, bow and gold coin
    const tryzub = (document.querySelector(".tb-try path") || { getAttribute: () => "" }).getAttribute("d");
    const pend = svg.append("g").attr("id", "nk-pendant").attr("class", "nk-pendant");
    pend.append("path").attr("class", "nk-rib-b").attr("d", "M0 7L-4 20L0 18Z");
    pend.append("path").attr("class", "nk-rib-g").attr("d", "M0 7L4 20L0 18Z");
    pend.append("circle").attr("class", "nk-coin").attr("cy", 32).attr("r", 15);
    pend.append("circle").attr("class", "nk-coin-r").attr("cy", 32).attr("r", 12.5);
    pend.append("path").attr("class", "nk-try").attr("d", tryzub).attr("transform", "translate(-6.05 22) scale(.05)");
    svg.append("text").attr("class", "nk-name").attr("id", "tl-active-name");

    trackEl.setAttribute("aria-valuemax", String(n - 1));
    updateTrack();
  }

  function shortYear(y) {
    if (!isFinite(y)) return "";
    return y < 0 ? `${-y} BCE` : String(y);
  }

  function updateTrack() {
    if (!geom) return;
    const { x0, segW, w, ys } = geom;
    const i = T.idx;
    d3.select(trackEl).selectAll(".tl-g").classed("active", function () { return +this.getAttribute("data-i") === i; })
      .classed("hover", function () { return +this.getAttribute("data-i") === T.hover && T.hover !== i; });
    trackEl.classList.toggle("present", T.present);
    readoutEl.classList.toggle("present", T.present);
    const e = T.eras[i];
    if (!e) return;
    const cx = x0 + (i + 0.5) * segW, cy = ys[i];
    d3.select("#nk-pendant").attr("transform", `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`);
    // beside the coin, on whichever side has room; long names wrap onto two lines
    const nameEl = d3.select("#tl-active-name");
    const name = e.name || "", charW = 7.2;
    const roomR = w - cx - 24, roomL = cx - 24;
    const right = name.length * charW <= roomR || roomR >= roomL;
    const room = right ? roomR : roomL;
    const nameX = right ? cx + 22 : cx - 22;
    let lines = [name];
    if (name.length * charW > room) {
      const words = name.split(" "), first = [];
      while (words.length > 1 && (first.join(" ").length + words[0].length + 1) * charW <= room) first.push(words.shift());
      lines = first.length ? [first.join(" "), words.join(" ")] : [name];
    }
    nameEl.attr("y", cy + (lines.length > 1 ? 30 : 37)).attr("text-anchor", right ? "start" : "end");
    nameEl.selectAll("tspan").remove();
    nameEl.text(null);
    lines.forEach((t, n) => nameEl.append("tspan").attr("x", nameX).attr("dy", n ? 16 : 0).text(t));
    // an estimate placed it; the real width decides whether it must shrink to stay on screen
    nameEl.style("font-size", null);
    const actual = nameEl.node().getBBox().width;
    if (actual > room) nameEl.style("font-size", `${Math.max(9, Math.floor(14 * (room / actual) * 10) / 10)}px`);
    trackEl.setAttribute("aria-valuenow", String(i));
    trackEl.setAttribute("aria-valuetext", `${e.name}, ${U.fmtRange(e.startYear, e.endYear)}`);
  }

  function idxFromX(clientX) {
    const r = trackEl.getBoundingClientRect();
    const x = clientX - r.left;
    const i = Math.floor((x - geom.x0) / geom.segW);
    return Math.max(0, Math.min(T.eras.length - 1, i));
  }

  /* ---------------- era selection ---------------- */

  function eraIndexForYear(y) {
    if (!T.eras.length || !isFinite(y)) return -1;
    let hit = -1;
    T.eras.forEach((e, i) => { const end = isFinite(e.endYear) ? e.endYear : e.startYear; if (y >= e.startYear && y < end) hit = i; });
    if (hit < 0) { const last = T.eras[T.eras.length - 1]; if (y === last.endYear) hit = T.eras.length - 1; }
    return hit;
  }

  function go(i, opts) {
    const o = Object.assign({ animate: true }, opts);
    if (!T.eras.length) return;
    i = Math.max(0, Math.min(T.eras.length - 1, i));
    const changed = i !== T.idx;
    T.idx = i;
    const era = T.eras[i];
    if (T.present && changed && !o.keepPresent) setPresent(false);
    if (changed || !o.animate) window.UkraineMap.showEra(era, { animate: o.animate });
    renderReadout(era, o.animate && changed);
    updateTrack();
  }

  const OV_SWATCH = {
    occupied: `<rect x="1" y="1" width="16" height="8" rx="1" style="fill:url(#sw-occ);stroke:var(--occupied)"/>`,
    contested: `<rect x="1" y="1" width="16" height="8" rx="1" style="fill:url(#sw-con);stroke:var(--contested);stroke-dasharray:3 2"/>`,
    rival: `<rect x="1" y="1" width="16" height="8" rx="1" style="fill:none;stroke:var(--rival);stroke-dasharray:4 2"/>`,
    related: `<rect x="1" y="1" width="16" height="8" rx="1" style="fill:none;stroke:var(--related);stroke-dasharray:1 2"/>`,
    territory: `<rect x="1" y="1" width="16" height="8" rx="1" style="fill:url(#sw-gz);stroke:var(--hist-strong);stroke-width:1.4"/>`,
  };
  const SW_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <pattern id="sw-occ" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--occupied);stroke-opacity:.7"/></pattern>
    <pattern id="sw-con" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--contested);stroke-opacity:.6"/><line x1="0" y1="2" x2="4" y2="2" style="stroke:var(--contested);stroke-opacity:.6"/></pattern>
    <pattern id="sw-gz" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" style="fill:var(--hist-fill)"/><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--hist);stroke-opacity:.45"/></pattern>
  </defs></svg>`;
  const KIND_NAME = { occupied: "Occupied", contested: "Contested", rival: "Neighbouring power", related: "Related polity" };

  function renderReadout(e, animate) {
    const apply = () => {
      $("er-years").textContent = U.fmtRange(e.startYear, e.endYear);
      $("er-name").textContent = e.name || "Untitled era";
      $("er-summary").textContent = e.summary || "";
      const ovs = [];
      // list what the map actually drew (it may suppress the territory, and it assigns each
      // polity its colour); hovering a row highlights that shape on the map
      const cur = window.UkraineMap.currentEra;
      const shown = cur && cur.id === e.id ? cur : null;
      const territory = shown ? shown.territory : e.territory;
      if (territory) ovs.push(`<li data-key="terr">${SW_DEFS}<svg viewBox="0 0 18 10" aria-hidden="true">${OV_SWATCH.territory}</svg><span>${esc(e.territoryLabel || e.polity || e.name || "Territory")}<span class="er-ov-k"> · Era territory</span></span></li>`);
      (shown ? shown.overlays.slice().sort((a, b) => a._i - b._i) : e.overlays || []).forEach((o) => {
        const k = KIND_NAME[o.kind] ? o.kind : "related";
        const sw = o._color && (k === "rival" || k === "related")
          ? `<rect x="1" y="1" width="16" height="8" rx="1" style="fill:var(${o._color});fill-opacity:.3;stroke:var(${o._color})${k === "related" ? ";stroke-dasharray:3 2" : ""}"/>`
          : OV_SWATCH[k];
        ovs.push(`<li${o._key ? ` data-key="${o._key}"` : ""}><svg viewBox="0 0 18 10" aria-hidden="true">${sw}</svg><span>${esc(o.name || KIND_NAME[k])}<span class="er-ov-k"> · ${KIND_NAME[k]}</span></span></li>`);
      });
      $("er-ovs").innerHTML = ovs.join("");
      const ev = (e.keyEvents || []).slice().sort((a, b) => (a.year || 0) - (b.year || 0));
      // group same-year events under one year marker on the rail
      const byYear = [];
      ev.forEach((k) => {
        const last = byYear[byYear.length - 1];
        if (last && last.year === k.year) last.items.push(k.text || "");
        else byYear.push({ year: k.year, items: [k.text || ""] });
      });
      $("er-events").innerHTML = byYear.map((g) => `<li><span class="y">${esc(U.fmtYear(g.year))}</span><ul class="t">${g.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></li>`).join("");
      const notes = T.data && T.data.meta && T.data.meta.notes;
      $("er-note").textContent = T.isPlaceholder ? "Sample data shown until the history dataset loads." : (notes || "");
      $("tl-readout").scrollTop = 0;
    };
    if (!animate) { apply(); return; }
    readoutEl.classList.add("fading");
    clearTimeout(renderReadout._t);
    renderReadout._t = setTimeout(() => { apply(); readoutEl.classList.remove("fading"); }, 200);
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  /* ---------------- transport ---------------- */

  function setPlayButton() {
    const b = $("tl-play");
    b.classList.toggle("playing", T.playing);
    b.setAttribute("aria-label", T.playing ? "Pause" : "Play");
    b.title = T.playing ? "Pause (Space)" : "Play (Space)";
  }

  function play() {
    if (T.eras.length < 2) return;
    if (T.present) setPresent(false);
    if (T.idx >= T.eras.length - 1) go(0);
    T.playing = true; setPlayButton();
    clearInterval(T.timer);
    T.timer = setInterval(() => {
      if (T.idx >= T.eras.length - 1) { stop(); return; }
      go(T.idx + 1);
    }, PLAY_MS);
  }
  function stop() { T.playing = false; clearInterval(T.timer); setPlayButton(); }
  function toggle() { T.playing ? stop() : play(); }

  function setPresent(on) {
    T.present = !!on;
    const b = $("tl-present");
    b.setAttribute("aria-pressed", String(T.present));
    if (T.present) stop();
    window.UkraineMap.setPresentDay(T.present);
    updateTrack();
  }

  /* ---------------- bindings ---------------- */

  function bind() {
    $("tl-prev").addEventListener("click", () => { stop(); go(T.idx - 1); });
    $("tl-next").addEventListener("click", () => { stop(); go(T.idx + 1); });
    $("tl-play").addEventListener("click", toggle);
    $("tl-present").addEventListener("click", () => setPresent(!T.present));
    const ovList = $("er-ovs");
    ovList.addEventListener("pointerover", (ev) => {
      const li = ev.target.closest("li[data-key]");
      window.UkraineMap.focusShape(li ? li.dataset.key : null);
    });
    ovList.addEventListener("pointerleave", () => window.UkraineMap.focusShape(null));
    $("dock-toggle").addEventListener("click", () => {
      const min = readoutEl.classList.toggle("min");
      $("dock-toggle").setAttribute("aria-expanded", String(!min));
    });

    let dragging = false;
    trackEl.addEventListener("pointerdown", (ev) => {
      if (!T.eras.length) return;
      dragging = true; trackEl.setPointerCapture(ev.pointerId); stop();
      go(idxFromX(ev.clientX));
    });
    trackEl.addEventListener("pointermove", (ev) => {
      if (!T.eras.length) return;
      const i = idxFromX(ev.clientX);
      if (dragging) { go(i); return; }
      if (i !== T.hover) { T.hover = i; updateTrack(); }
      const e = T.eras[i];
      const tip = $("tooltip");
      tip.innerHTML = `<b>${esc(e.name || "")}</b>${esc(U.fmtRange(e.startYear, e.endYear))}`;
      tip.classList.add("on");
      tip.style.left = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8) + "px";
      tip.style.top = (ev.clientY - tip.offsetHeight - 12) + "px";
    });
    const end = () => { dragging = false; };
    trackEl.addEventListener("pointerup", end);
    trackEl.addEventListener("pointercancel", end);
    trackEl.addEventListener("pointerleave", () => { T.hover = -1; updateTrack(); $("tooltip").classList.remove("on"); });

    document.addEventListener("keydown", (ev) => {
      const tag = (ev.target && ev.target.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === "ArrowLeft") { stop(); go(T.idx - 1); ev.preventDefault(); }
      else if (ev.key === "ArrowRight") { stop(); go(T.idx + 1); ev.preventDefault(); }
      else if (ev.key === "Home") { stop(); go(0); ev.preventDefault(); }
      else if (ev.key === "End") { stop(); go(T.eras.length - 1); ev.preventDefault(); }
      else if (ev.key === " " && tag !== "BUTTON") { toggle(); ev.preventDefault(); }
      else if (ev.key === "p" || ev.key === "P") { setPresent(!T.present); }
    });

    let rT = 0;
    const onResize = () => { clearTimeout(rT); rT = setTimeout(() => { if (T.eras.length) renderTrack(); }, 80); };
    window.addEventListener("resize", onResize);
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(trackEl);
  }

  /* ---------------- public ---------------- */

  window.UkraineTimeline = {
    load: (data, opts) => load(data, opts),
    setEra: (id) => { const i = T.eras.findIndex((e) => e.id === id); if (i < 0) return false; stop(); go(i); return true; },
    /** Select the era containing a year: startYear <= y < endYear; the final endYear selects the last era. */
    setYear: (y) => { const i = eraIndexForYear(y); if (i < 0) return false; stop(); go(i); return true; },
    next: () => go(T.idx + 1),
    prev: () => go(T.idx - 1),
    play, pause: stop,
    setPresentDay: (on) => setPresent(on),
    get eras() { return T.eras.slice(); },
    get current() { return T.eras[T.idx] || null; },
    get isPlaceholder() { return T.isPlaceholder; },
  };

  bind();
  setPlayButton();
  if (window.innerWidth < 860) { readoutEl.classList.add("min"); document.getElementById("dock-toggle").setAttribute("aria-expanded", "false"); }

  window.UkraineMap.ready.then((map) => {
    const H = window.UKRAINE_HISTORY;
    if (H && Array.isArray(H.eras) && H.eras.length && load(H)) return;
    if (window.__HISTORY_SCRIPT_FAILED) console.info("[UkraineTimeline] data/history.js not available yet; using built-in sample eras.");
    else if (H) console.warn("[UkraineTimeline] window.UKRAINE_HISTORY has no usable eras; using built-in sample eras.");
    load(placeholder(map), { placeholder: true });
  });
})();
