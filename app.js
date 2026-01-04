// app.js

/**
 * @typedef {Object} Post
 * @property {string} id
 * @property {string} title
 * @property {string} desc
 * @property {string[]} tags
 * @property {string} category
 * @property {string} dateISO
 * @property {number} minutes
 * @property {number} signal  // 0..100
 */

/**
 * Small deterministic PRNG so the "tape" feels alive but stable-ish.
 * @param {number} seed
 * @returns {() => number} Returns a function that yields a float in [0,1).
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
 * Format a date like "Jan 4".
 * @param {string} iso
 * @returns {string}
 */
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Escape text for safe HTML insertion.
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

/**
 * @param {number} n
 * @returns {string}
 */
function pct(n) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/**
 * Fetch last two daily closes from Stooq CSV for a symbol.
 * @param {string} sym Stooq symbol (e.g., "aapl.us")
 * @returns {Promise<{date:string, close:number, prevDate:string, prevClose:number}>}
 */
async function fetchStooqLastTwoCloses(sym) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Stooq fetch failed for ${sym}: ${res.status}`);

  const text = await res.text();
  // CSV header: Date,Open,High,Low,Close,Volume
  const lines = text.trim().split("\n");
  if (lines.length < 3) throw new Error(`Not enough rows for ${sym}`);

  // Last line = most recent trading day
  const last = lines[lines.length - 1].split(",");
  const prev = lines[lines.length - 2].split(",");

  const date = last[0];
  const close = Number(last[4]);
  const prevDate = prev[0];
  const prevClose = Number(prev[4]);

  if (!Number.isFinite(close) || !Number.isFinite(prevClose)) {
    throw new Error(`Bad close values for ${sym}`);
  }

  return { date, close, prevDate, prevClose };
}

/**
 * Percent change from prevClose to close.
 * @param {number} close
 * @param {number} prevClose
 * @returns {number}
 */
function dayPctChange(close, prevClose) {
  return ((close / prevClose) - 1) * 100;
}


const POSTS = /** @type {Post[]} */ ([
  {
    id: "p1",
    title: "The yield curve as a mood ring",
    desc: "A wireframe take: treat the curve like a system diagram. What moves, what lags, what lies.",
    tags: ["rates", "curve", "macro"],
    category: "macro",
    dateISO: "2026-01-04",
    minutes: 6,
    signal: 82
  },
  {
    id: "p2",
    title: "DCF without cosplay",
    desc: "Discounting is not wizardry. It’s just assumptions with a flashlight. Build a clean, auditable stack.",
    tags: ["valuation", "dcf", "accounting"],
    category: "accounting",
    dateISO: "2026-01-02",
    minutes: 7,
    signal: 74
  },
  {
    id: "p3",
    title: "Inflation: the three-bucket sanity check",
    desc: "A quick framework to separate demand pressure, supply shocks, and narrative contagion.",
    tags: ["cpi", "macro", "framework"],
    category: "macro",
    dateISO: "2025-12-28",
    minutes: 5,
    signal: 69
  },
  {
    id: "p4",
    title: "Market microstructure for normal people",
    desc: "Bid-ask, spreads, and why your 'perfect entry' is mostly a bedtime story.",
    tags: ["microstructure", "execution", "markets"],
    category: "markets",
    dateISO: "2025-12-22",
    minutes: 8,
    signal: 77
  },
  {
    id: "p5",
    title: "A tiny checklist for reading earnings",
    desc: "Five things that keep you from getting hypnotized by adjusted EBITDA confetti.",
    tags: ["earnings", "quality", "accounting"],
    category: "accounting",
    dateISO: "2025-12-16",
    minutes: 4,
    signal: 71
  },
  {
    id: "p6",
    title: "One-page risk map: exposures over opinions",
    desc: "If you can’t draw it, you probably can’t manage it. A simple map for portfolio fragility.",
    tags: ["risk", "portfolio", "markets"],
    category: "markets",
    dateISO: "2025-12-09",
    minutes: 6,
    signal: 80
  },
  {
    id: "p7",
    title: "Tool note: a clean spreadsheet template",
    desc: "A minimalist layout for forecasts that doesn’t turn into a haunted mansion.",
    tags: ["spreadsheets", "workflow", "tools"],
    category: "tools",
    dateISO: "2025-12-01",
    minutes: 3,
    signal: 66
  },
  {
    id: "p8",
    title: "Narratives are leverage",
    desc: "Markets price stories, then price the consequences of believing them. Keep both ledgers.",
    tags: ["narratives", "positioning", "macro"],
    category: "macro",
    dateISO: "2025-11-24",
    minutes: 5,
    signal: 73
  }
]);

const WATCH = [
  { sym: "10yusy.b", name: "US 10Y Yield" },
  { sym: "usdeur", name: "USD/EUR" },
  { sym: "cb.f", name: "Brent" },
  { sym: "^spx", name: "S&P 500" },
  { sym: "xauusd", name: "Gold" },
  { sym: "asts.us", name: "ASTS" },
];

/**
 * @param {HTMLElement} el
 * @param {string} html
 */
function setHTML(el, html) { el.innerHTML = html; }

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
 * Compute a "regime" label from synthetic signals.
 * @param {number[]} deltas
 * @returns {string}
 */
function computeRegime(deltas) {
  const avg = deltas.reduce((a,b)=>a+b,0) / deltas.length;
  if (avg > 0.35) return "Risk-on";
  if (avg < -0.35) return "Risk-off";
  return "Neutral";
}

/**
 * Create synthetic tape values.
 * @returns {{sym:string,name:string,delta:number,level:number}[]}
 */
function makeTape() {
  const seed = (new Date().getFullYear() * 10000) + ((new Date().getMonth()+1) * 100) + new Date().getDate();
  const rnd = mulberry32(seed);

  return WATCH.map((w, i) => {
    const base = 50 + i * 12 + rnd() * 18;
    const shock = (rnd() - 0.5) * 1.6;
    const drift = (Math.sin((seed % 97) + i) * 0.12);
    const delta = shock + drift;
    const level = base * (1 + delta / 100);
    return { ...w, delta, level };
  });
}

/**
 * Render the tape panel using Stooq daily closes (last close + change).
 */
async function renderTape() {
  const list = document.getElementById("tape");

  // Show a placeholder while loading
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

  const results = await Promise.allSettled(
    WATCH.map(async (w) => {
      const d = await fetchStooqLastTwoCloses(w.sym);
      const delta = dayPctChange(d.close, d.prevClose);
      return { ...w, ...d, delta };
    })
  );

  const rows = results.map((r, i) => {
    const w = WATCH[i];
    if (r.status === "fulfilled") return r.value;
    return { ...w, date: "—", close: NaN, prevDate: "—", prevClose: NaN, delta: NaN, error: r.reason?.message || "error" };
  });

  // Regime based on average delta (ignoring NaNs)
  const deltas = rows.map(x => x.delta).filter(Number.isFinite);
  document.getElementById("regime").textContent = deltas.length ? computeRegime(deltas) : "Neutral";

  // Sync label uses the latest date among successful rows
  const latestDate = rows.map(r => r.date).filter(d => d && d !== "—").sort().pop();
  document.getElementById("lastSync").textContent = latestDate ? `Close: ${latestDate}` : "Close: —";

  setHTML(list, rows.map(d => {
    const ok = Number.isFinite(d.close) && Number.isFinite(d.delta);
    const up = ok ? d.delta >= 0 : true;
    const deltaClass = up ? "deltaUp" : "deltaDown";

    return `
      <li class="tick">
        <div class="tickLeft">
          <span class="badge">${esc(d.sym.toUpperCase())}</span>
          <span class="tickName">${esc(d.name)}</span>
        </div>
        <div class="tickRight">
          <div>${ok ? d.close.toFixed(2) : "—"}</div>
          <div class="delta ${deltaClass}">
            ${ok ? chevronSVG(up) : ""}
            <span>${ok ? pct(d.delta) : esc(d.error || "n/a")}</span>
          </div>
        </div>
      </li>
    `;
  }).join(""));
}

/**
 * Render signals and pins in the left rail.
 * @param {Post[]} currentPosts
 * @param {Set<string>} pinSet
 */
function renderRail(currentPosts, pinSet) {
  const signals = document.getElementById("signals");
  const pins = document.getElementById("pins");

  const topSignals = [...currentPosts]
    .sort((a,b) => b.signal - a.signal)
    .slice(0, 4);

  setHTML(signals, topSignals.map(p => {
    const icon = `
      <svg viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 18V6"></path>
        <path d="M4 18h16"></path>
        <path d="M7 16l3-3 3 2 5-6"></path>
        <path d="M17 9h2v2"></path>
      </svg>
    `;
    return `
      <div class="signal">
        <div class="signalLeft">
          <div class="sigIcon" aria-hidden="true">${icon}</div>
          <div class="sigName" title="${esc(p.title)}">${esc(p.title)}</div>
        </div>
        <div class="sigVal">${p.signal}</div>
      </div>
    `;
  }).join(""));

  const pinned = POSTS.filter(p => pinSet.has(p.id)).slice(0, 6);
  if (pinned.length === 0) {
    setHTML(pins, `<div class="muted">Pin a post to keep it here.</div>`);
    return;
  }

  setHTML(pins, pinned.map(p => `
    <div class="pin">
      <div class="pinTitle" title="${esc(p.title)}">${esc(p.title)}</div>
      <button class="pinBtn" type="button" data-unpin="${esc(p.id)}">Unpin</button>
    </div>
  `).join(""));
}

/**
 * Render the post list.
 * @param {Post[]} posts
 * @param {Set<string>} pinSet
 */
function renderPosts(posts, pinSet) {
  const postList = document.getElementById("postList");
  const pill = document.getElementById("resultPill");
  pill.textContent = `${posts.length} shown`;

  setHTML(postList, posts.map(p => {
    const scoreW = clamp(p.signal, 0, 100);
    const isPinned = pinSet.has(p.id);
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
              ${p.tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join("")}
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
 * Apply filter + search + sort.
 * @param {{filter:string, q:string, sort:string}} state
 * @returns {Post[]}
 */
function selectPosts(state) {
  const query = state.q.trim().toLowerCase();

  let items = POSTS.slice();

  if (state.filter !== "all") {
    items = items.filter(p => p.category === state.filter);
  }

  if (query) {
    items = items.filter(p => {
      const blob = `${p.title} ${p.desc} ${p.tags.join(" ")} ${p.category}`.toLowerCase();
      return blob.includes(query);
    });
  }

  if (state.sort === "new") {
    items.sort((a,b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime());
  } else if (state.sort === "signal") {
    items.sort((a,b) => b.signal - a.signal);
  } else if (state.sort === "read") {
    items.sort((a,b) => a.minutes - b.minutes);
  }

  return items;
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

/**
 * Open a lightweight "reader" alert (placeholder for real post pages).
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
    "This is a single-page demo. Wire it to real routes when you're done being mortal."
  ];
  alert(lines.join("\n"));
}

/**
 * Render the modal quick search list.
 * @param {Post[]} posts
 */
function renderModalList(posts) {
  const modalList = document.getElementById("modalList");
  setHTML(modalList, posts.map(p => `
    <div class="modalItem" role="button" tabindex="0" data-open="${esc(p.id)}">
      <div class="modalItemTitle">${esc(p.title)}</div>
      <div class="modalItemMeta">${esc(p.category)} • ${p.minutes}m</div>
    </div>
  `).join(""));
}

(function init() {
  const state = { filter: "all", q: "", sort: "new" };
  const pinSet = loadPins();

  document.getElementById("year").textContent = String(new Date().getFullYear());
  document.getElementById("watchCount").textContent = String(WATCH.length);

  // initial render
  renderTape();
  const initial = selectPosts(state);
  renderPosts(initial, pinSet);
  renderRail(initial, pinSet);
  document.getElementById("readingTime").textContent = `~${Math.max(3, Math.round(initial.slice(0,3).reduce((a,p)=>a+p.minutes,0)/3))} min`;

  // update tape occasionally (cheap, not laggy)
  //window.setInterval(renderTape, 6500);

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

  // Search input (top bar)
  const q = document.getElementById("q");
  q.addEventListener("input", () => {
    state.q = q.value;
    const posts = selectPosts(state);
    renderPosts(posts, pinSet);
    renderRail(posts, pinSet);
  });

  // Density toggle
  const densityBtn = document.getElementById("toggleDensity");
  densityBtn.addEventListener("click", () => {
    const compact = document.body.classList.toggle("compact");
    densityBtn.setAttribute("aria-pressed", String(compact));
  });

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
    }
  });

  // Export pins
  document.getElementById("exportBtn").addEventListener("click", (e) => {
    e.preventDefault();
    const pinned = POSTS.filter(p => pinSet.has(p.id)).map(p => ({
      title: p.title,
      date: p.dateISO,
      category: p.category,
      tags: p.tags
    }));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), pinned }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ledgerwire-pins.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // Modal quick search: ⌘K / Ctrl+K
  const modal = /** @type {HTMLDialogElement} */ (document.getElementById("modal"));
  const modalQ = document.getElementById("modalQ");
  const modalList = document.getElementById("modalList");

  /**
   * @param {string} query
   */
  function updateModal(query) {
    const tmp = { ...state, q: query };
    const posts = selectPosts(tmp);
    renderModalList(posts);
  }

  document.addEventListener("keydown", (e) => {
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

  modalQ.addEventListener("input", () => updateModal(modalQ.value));

  modalList.addEventListener("click", (e) => {
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
})();