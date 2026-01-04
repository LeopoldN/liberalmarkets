/* ============================================================
   Liberal Markets — app.js
   Full client logic
   - Tape loads from static tape.json (GitHub Actions)
   - Restores: filters, sorting, pinning, signals rail, export pins,
     density toggle, and Cmd/Ctrl+K quick search modal.
   ============================================================ */

/* ---------------- Utilities ---------------- */

/**
 * Escape text for safe HTML insertion.
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[c]));
}

/**
 * Clamp a number.
 * @param {number} n
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Format a percent change.
 * @param {number} n
 * @returns {string}
 */
function pct(n) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/**
 * Format a date like "Jan 4".
 * @param {string} iso
 * @returns {string}
 */
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Set innerHTML.
 * @param {HTMLElement} el
 * @param {string} html
 */
function setHTML(el, html) {
  el.innerHTML = html;
}

/**
 * Render a tiny wire chevron indicating up/down.
 * @param {boolean} up
 * @returns {string}
 */
function chevronSVG(up) {
  const rot = up ? "rotate(0)" : "rotate(180deg)";
  return `
    <svg viewBox="0 0 24 24" class="chev" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:${rot}">
      <path d="M6 14l6-6 6 6"></path>
    </svg>
  `;
}


/**
 * Persist pins to localStorage.
 * @param {Set<string>} pins
 */
function savePins(pins) {
  localStorage.setItem("lw_pins", JSON.stringify([...pins]));
}

/**
 * Load pins from localStorage.
 * @returns {Set<string>}
 */
function loadPins() {
  try {
    const raw = localStorage.getItem("lw_pins");
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/* ---------------- Config ---------------- */

const WATCH = [
  { sym: "10yusy.b", name: "US 10Y Yield" },
  { sym: "usdeur", name: "USD/EUR" },
  { sym: "cb.f", name: "Brent" },
  { sym: "^spx", name: "S&P 500" },
  { sym: "xauusd", name: "Gold" },
  { sym: "asts.us", name: "ASTS" },
];

/**
 * @typedef {Object} Post
 * @property {string} id
 * @property {string} title
 * @property {string} desc
 * @property {string[]} tags
 * @property {string} category
 * @property {string} dateISO
 * @property {number} minutes
 * @property {number} signal
 */

/** @type {Post[]} */
const POSTS = [
  {
    id: "p1",
    title: "The yield curve as a mood ring",
    desc: "A wireframe take: treat the curve like a system diagram. What moves, what lags, what lies.",
    tags: ["rates", "curve", "macro"],
    category: "macro",
    dateISO: "2026-01-04",
    minutes: 6,
    signal: 82,
  },
  {
    id: "p2",
    title: "DCF without cosplay",
    desc: "Discounting is not wizardry. It’s just assumptions with a flashlight. Build a clean, auditable stack.",
    tags: ["valuation", "dcf", "accounting"],
    category: "accounting",
    dateISO: "2026-01-02",
    minutes: 7,
    signal: 74,
  },
  {
    id: "p3",
    title: "Inflation: the three-bucket sanity check",
    desc: "A quick framework to separate demand pressure, supply shocks, and narrative contagion.",
    tags: ["cpi", "macro", "framework"],
    category: "macro",
    dateISO: "2025-12-28",
    minutes: 5,
    signal: 69,
  },
  {
    id: "p4",
    title: "Market microstructure for normal people",
    desc: "Bid-ask, spreads, and why your 'perfect entry' is mostly a bedtime story.",
    tags: ["microstructure", "execution", "markets"],
    category: "markets",
    dateISO: "2025-12-22",
    minutes: 8,
    signal: 77,
  },
  {
    id: "p5",
    title: "A tiny checklist for reading earnings",
    desc: "Five things that keep you from getting hypnotized by adjusted EBITDA confetti.",
    tags: ["earnings", "quality", "accounting"],
    category: "accounting",
    dateISO: "2025-12-16",
    minutes: 4,
    signal: 71,
  },
  {
    id: "p6",
    title: "One-page risk map: exposures over opinions",
    desc: "If you can’t draw it, you probably can’t manage it. A simple map for portfolio fragility.",
    tags: ["risk", "portfolio", "markets"],
    category: "markets",
    dateISO: "2025-12-09",
    minutes: 6,
    signal: 80,
  },
  {
    id: "p7",
    title: "Tool note: a clean spreadsheet template",
    desc: "A minimalist layout for forecasts that doesn’t turn into a haunted mansion.",
    tags: ["spreadsheets", "workflow", "tools"],
    category: "tools",
    dateISO: "2025-12-01",
    minutes: 3,
    signal: 66,
  },
  {
    id: "p8",
    title: "Narratives are leverage",
    desc: "Markets price stories, then price the consequences of believing them. Keep both ledgers.",
    tags: ["narratives", "positioning", "macro"],
    category: "macro",
    dateISO: "2025-11-24",
    minutes: 5,
    signal: 73,
  },
];

/* ---------------- Tape (static JSON) ---------------- */

/**
 * Load tape.json generated by GitHub Actions.
 * Cache-bust daily so visitors get the latest close after the daily update.
 * @returns {Promise<Array<any>>}
 */
async function loadTapeFromJson() {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const res = await fetch(`/tape.json?v=${day}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load tape.json (${res.status})`);
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}



/**
 * Render the tape panel from tape.json.
 */
async function renderTape() {
  const list = document.getElementById("tape");
  if (!list) return;

  // placeholder
  setHTML(list, WATCH.map(w => `
    <li class="tick">
      <div class="tickLeft">
        <span class="badge">${esc(w.sym.toUpperCase())}</span>
        <span class="tickName">${esc(w.name)}</span>
      </div>
      <div class="tickRight">
        <div>—</div>
        <div class="delta"><span>loading</span></div>
      </div>
    </li>
  `).join(""));

  let items;
  try {
    items = await loadTapeFromJson();
  } catch {
    setHTML(list, `<li class="muted">Tape unavailable</li>`);
    return;
  }

  const bySym = new Map(items.map(i => [i.sym, i]));
  const rows = WATCH.map(w => {
    const d = bySym.get(w.sym);
    return d && d.ok ? d : { ...w, ok: false };
  });


  const dateEl = document.getElementById("lastSync");
  const latestDate = rows.filter(r => r.ok).map(r => r.date).sort().pop();
  if (dateEl) dateEl.textContent = latestDate ? `Close: ${latestDate}` : "Close: —";

  setHTML(list, rows.map(d => {
    if (!d.ok || !Number.isFinite(Number(d.close))) {
      return `
        <li class="tick">
          <div class="tickLeft">
            <span class="badge">${esc(d.sym.toUpperCase())}</span>
            <span class="tickName">${esc(d.name)}</span>
          </div>
          <div class="tickRight">
            <div>n/a</div>
            <div class="delta"><span>no data</span></div>
          </div>
        </li>
      `;
    }

    const deltaPct = Number(d.deltaPct);
    const up = Number.isFinite(deltaPct) ? deltaPct >= 0 : true;
    const deltaClass = up ? "deltaUp" : "deltaDown";

    return `
      <li class="tick">
        <div class="tickLeft">
          <span class="badge">${esc(String(d.sym).toUpperCase())}</span>
          <span class="tickName">${esc(String(d.name))}</span>
        </div>
        <div class="tickRight">
          <div>${Number(d.close).toFixed(2)}</div>
          <div class="delta ${deltaClass}">
            ${Number.isFinite(deltaPct) ? chevronSVG(up) : ""}
            <span>${Number.isFinite(deltaPct) ? pct(deltaPct) : "—"}</span>
          </div>
        </div>
      </li>
    `;
  }).join(""));
}

/* ---------------- Posts / Filters / UI ---------------- */

const state = { filter: "all", q: "", sort: "new" };
const pinSet = loadPins();

/**
 * Apply filter + search + sort.
 * @param {{filter:string, q:string, sort:string}} s
 * @returns {Post[]}
 */
function selectPosts(s) {
  const query = s.q.trim().toLowerCase();

  let items = POSTS.slice();

  if (s.filter !== "all") {
    items = items.filter(p => p.category === s.filter);
  }

  if (query) {
    items = items.filter(p => {
      const blob = `${p.title} ${p.desc} ${p.tags.join(" ")} ${p.category}`.toLowerCase();
      return blob.includes(query);
    });
  }

  if (s.sort === "new") {
    items.sort((a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime());
  } else if (s.sort === "signal") {
    items.sort((a, b) => b.signal - a.signal);
  } else if (s.sort === "read") {
    items.sort((a, b) => a.minutes - b.minutes);
  }

  return items;
}

/**
 * Render posts.
 * @param {Post[]} posts
 * @param {Set<string>} pins
 */
function renderPosts(posts, pins) {
  const postList = document.getElementById("postList");
  const pill = document.getElementById("resultPill");
  if (!postList) return;

  if (pill) pill.textContent = `${posts.length} shown`;

  setHTML(postList, posts.map(p => {
    const scoreW = clamp(p.signal, 0, 100);
    const isPinned = pins.has(p.id);
    const pinLabel = isPinned ? "Pinned" : "Pin";

    const pinIcon = `
      <svg viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 17v5"></path>
        <path d="M5 10l7-7 7 7"></path>
        <path d="M7 10h10l-1 6H8l-1-6Z"></path>
      </svg>
    `;

    return `
      <article class="post" data-id="${esc(p.id)}">
        <div class="postInner">
          <div class="postTop">
            <div class="tagRow">
              ${p.tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join(" ")}
            </div>
            <div class="score" title="Signal score">
              <span>${p.signal}</span>
              <span class="scoreBar" aria-hidden="true">
                <span class="scoreFill" style="width:${scoreW}%"></span>
              </span>
            </div>
          </div>

          <h3 class="postTitle">
            <a href="#" data-open="${esc(p.id)}">${esc(p.title)}</a>
          </h3>

          <p class="postDesc">${esc(p.desc)}</p>

          <div class="postFoot">
            <div class="meta">
              <span>${fmtDate(p.dateISO)}</span>
              <span class="dot" aria-hidden="true"></span>
              <span>${p.minutes} min</span>
              <span class="dot" aria-hidden="true"></span>
              <span>${esc(p.category)}</span>
            </div>
            <button class="pinIt" type="button" data-pin="${esc(p.id)}" aria-pressed="${isPinned}">
              ${pinIcon}
              <span>${pinLabel}</span>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join(""));
}

/**
 * Render signals and pins in the left rail.
 * @param {Post[]} currentPosts
 * @param {Set<string>} pins
 */
function renderRail(currentPosts, pins) {
  const signals = document.getElementById("signals");
  const pinsEl = document.getElementById("pins");
  if (!signals || !pinsEl) return;

  const topSignals = [...currentPosts].sort((a, b) => b.signal - a.signal).slice(0, 4);

  const icon = `
    <svg viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 18V6"></path>
      <path d="M4 18h16"></path>
      <path d="M7 16l3-3 3 2 5-6"></path>
      <path d="M17 9h2v2"></path>
    </svg>
  `;

  setHTML(signals, topSignals.map(p => `
    <div class="signal">
      <div class="signalLeft">
        <div class="sigIcon" aria-hidden="true">${icon}</div>
        <div class="sigName" title="${esc(p.title)}">${esc(p.title)}</div>
      </div>
      <div class="sigVal">${p.signal}</div>
    </div>
  `).join(""));

  const pinned = POSTS.filter(p => pins.has(p.id)).slice(0, 6);
  if (pinned.length === 0) {
    setHTML(pinsEl, `<div class="muted">Pin a post to keep it here.</div>`);
    return;
  }

  setHTML(pinsEl, pinned.map(p => `
    <div class="pin">
      <div class="pinTitle" title="${esc(p.title)}">${esc(p.title)}</div>
      <button class="pinBtn" type="button" data-unpin="${esc(p.id)}">Unpin</button>
    </div>
  `).join(""));
}

/**
 * Lightweight "reader" placeholder.
 * @param {Post} post
 */
function openPost(post) {
  const lines = [
    post.title,
    "",
    `Category: ${post.category}`,
    `Date: ${post.dateISO}`,
    `Reading: ${post.minutes} min`,
    `Signal: ${post.signal}`,
    "",
    post.desc,
    "",
    "This is a single-page demo. Wire it to real routes when you're done being mortal.",
  ];
  alert(lines.join("\n"));
}

/**
 * Render the modal quick search list.
 * @param {Post[]} posts
 */
function renderModalList(posts) {
  const modalList = document.getElementById("modalList");
  if (!modalList) return;

  setHTML(modalList, posts.map(p => `
    <div class="modalItem" role="button" tabindex="0" data-open="${esc(p.id)}">
      <div class="modalItemTitle">${esc(p.title)}</div>
      <div class="modalItemMeta">${esc(p.category)} • ${p.minutes}m</div>
    </div>
  `).join(""));
}


/**
 * Load a CSV and return the latest (last) non-empty numeric row.
 * Assumes header: date,value and date is YYYY-MM-DD.
 * @param {string} csvPath
 * @returns {Promise<{date:string, value:number} | null>}
 */
async function loadLatestFromCsv(csvPath) {
  const day = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${csvPath}?v=${day}`, { cache: "no-store" });
  if (!res.ok) return null;

  const text = await res.text();
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length <= 1) return null;

  // Walk backwards to find the latest valid numeric value
  for (let i = lines.length - 1; i >= 1; i--) {
    const [dateRaw, valRaw] = lines[i].split(",");
    const date = (dateRaw ?? "").trim();
    const value = Number((valRaw ?? "").trim());
    if (date && Number.isFinite(value)) return { date, value };
  }
  return null;
}

/**
 * Render economic indicators in the hero stats from /data CSVs.
 */
async function renderHeroIndicators() {
  const cpiVal = document.getElementById("cpiVal");
  const unrateVal = document.getElementById("unrateVal");
  const gdpVal = document.getElementById("gdpVal");
  const mincVal = document.getElementById("mincVal");
  const mhouVal = document.getElementById("mhouVal");
  const ratioVal = document.getElementById("ratioVal");

  const cpiLabel = document.getElementById("cpiLabel");
  const unrateLabel = document.getElementById("unrateLabel");
  const gdpLabel = document.getElementById("gdpLabel");
  const mincLabel = document.getElementById("mincLabel");
  const mhouLabel = document.getElementById("mhouLabel");
  const ratioLabel = document.getElementById("ratioLabel");

  const [cpi, unrate, gdp, income, house, ratio] = await Promise.all([
    loadLatestFromCsv("/data/CPIAUCSL.csv"),
    loadLatestFromCsv("/data/UNRATE.csv"),
    loadLatestFromCsv("/data/GDPC1.csv"),
    loadLatestFromCsv("/data/MEHOINUSA646N.csv"),
    loadLatestFromCsv("/data/MSPUS.csv"),
    loadLatestFromCsv("/data/HOUSE_TO_INCOME_RATIO.csv"),
  ]);

  if (cpiVal) cpiVal.textContent = cpi ? cpi.value.toFixed(3) : "—";
  if (unrateVal) unrateVal.textContent = unrate ? `${unrate.value.toFixed(1)}%` : "—";
  if (gdpVal) gdpVal.textContent = gdp ? gdp.value.toFixed(0) : "—";
  if (mincVal) mincVal.textContent = income ? income.value.toFixed(0) : "—";  
  if (mhouVal) mhouVal.textContent = house ? house.value.toFixed(0) : "—";
  if (ratioVal) ratioVal.textContent = ratio ? ratio.value.toFixed(0) : "—";
  // Optional: keep it minimalist by putting dates in the label

}






/* ---------------- Init ---------------- */

(function init() {
  // footer + header stats
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());


  // initial renders
  renderTape();
  renderHeroIndicators();
  const initial = selectPosts(state);
  renderPosts(initial, pinSet);
  renderRail(initial, pinSet);


  // Filter chips
  document.querySelectorAll(".chip").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));

      state.filter = btn.getAttribute("data-filter") || "all";
      const posts = selectPosts(state);
      renderPosts(posts, pinSet);
      renderRail(posts, pinSet);
    });
  });

  // Sort buttons
  document.querySelectorAll(".sortBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sortBtn").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.querySelectorAll(".sortBtn").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));

      state.sort = btn.getAttribute("data-sort") || "new";
      const posts = selectPosts(state);
      renderPosts(posts, pinSet);
      renderRail(posts, pinSet);
    });
  });

  // Search input
  const q = document.getElementById("q");
  if (q) {
    q.addEventListener("input", () => {
      state.q = q.value;
      const posts = selectPosts(state);
      renderPosts(posts, pinSet);
      renderRail(posts, pinSet);
    });
  }

  // Density toggle
  const densityBtn = document.getElementById("toggleDensity");
  if (densityBtn) {
    densityBtn.addEventListener("click", () => {
      const compact = document.body.classList.toggle("compact");
      densityBtn.setAttribute("aria-pressed", String(compact));
    });
  }

  // Post interactions + pin/unpin (event delegation)
  document.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);

    const openId = t.closest("[data-open]")?.getAttribute("data-open");
    if (openId) {
      const post = POSTS.find(p => p.id === openId);
      if (post) openPost(post);
      return;
    }

    const pinId = t.closest("[data-pin]")?.getAttribute("data-pin");
    if (pinId) {
      if (pinSet.has(pinId)) pinSet.delete(pinId);
      else pinSet.add(pinId);

      savePins(pinSet);

      const posts = selectPosts(state);
      renderPosts(posts, pinSet);
      renderRail(posts, pinSet);
      return;
    }

    const unpinId = t.closest("[data-unpin]")?.getAttribute("data-unpin");
    if (unpinId) {
      pinSet.delete(unpinId);
      savePins(pinSet);

      const posts = selectPosts(state);
      renderPosts(posts, pinSet);
      renderRail(posts, pinSet);
      return;
    }

    // Export pins
    const exportBtn = t.closest("#exportBtn");
    if (exportBtn) {
      e.preventDefault();
      const pinned = POSTS.filter(p => pinSet.has(p.id)).map(p => ({
        title: p.title,
        date: p.dateISO,
        category: p.category,
        tags: p.tags,
      }));

      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), pinned }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "liberal-markets-pins.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  });

  // Modal quick search: ⌘K / Ctrl+K
  const modal = /** @type {HTMLDialogElement|null} */ (document.getElementById("modal"));
  const modalQ = /** @type {HTMLInputElement|null} */ (document.getElementById("modalQ"));

  /**
   * @param {string} query
   */
  function updateModal(query) {
    const tmp = { ...state, q: query };
    const posts = selectPosts(tmp);
    renderModalList(posts);
  }

  document.addEventListener("keydown", (e) => {
    if (!modal || !modalQ) return;

    const isMac = navigator.platform.toLowerCase().includes("mac");
    const cmd = isMac ? e.metaKey : e.ctrlKey;

    if (cmd && e.key.toLowerCase() === "k") {
      e.preventDefault();
      modal.showModal();
      modalQ.value = state.q || "";
      updateModal(modalQ.value);
      modalQ.focus();
    }

    if (e.key === "Escape" && modal.open) modal.close();
  });

  if (modalQ) {
    modalQ.addEventListener("input", () => updateModal(modalQ.value));
  }

  const modalList = document.getElementById("modalList");
  if (modalList) {
    modalList.addEventListener("click", (e) => {
      if (!modal) return;
      const t = /** @type {HTMLElement} */ (e.target);
      const openId = t.closest("[data-open]")?.getAttribute("data-open");
      if (!openId) return;
      const post = POSTS.find(p => p.id === openId);
      if (post) {
        modal.close();
        openPost(post);
      }
    });

    modalList.addEventListener("keydown", (e) => {
      if (!modal) return;
      const ke = /** @type {KeyboardEvent} */ (e);
      if (ke.key !== "Enter") return;
      const t = /** @type {HTMLElement} */ (ke.target);
      const openId = t.closest("[data-open]")?.getAttribute("data-open");
      if (!openId) return;
      const post = POSTS.find(p => p.id === openId);
      if (post) {
        modal.close();
        openPost(post);
      }
    });
  }
})();
