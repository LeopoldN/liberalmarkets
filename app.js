/* ============================================================
   Liberal Markets — app.js
   Full client logic
   Tape loads from static tape.json (GitHub Actions)
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
 */
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Percent formatter.
 */
function pct(n) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/**
 * Chevron SVG.
 */
function chevronSVG(up) {
  const rot = up ? "rotate(0)" : "rotate(180deg)";
  return `
    <svg viewBox="0 0 24 24" class="chev" fill="none"
      stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"
      style="transform:${rot}">
      <path d="M6 14l6-6 6 6"></path>
    </svg>
  `;
}

/**
 * Simple regime classifier.
 */
function computeRegime(deltas) {
  if (!deltas.length) return "Neutral";
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  if (avg > 0.35) return "Risk-on";
  if (avg < -0.35) return "Risk-off";
  return "Neutral";
}

/* ---------------- Config ---------------- */

const WATCH = [
  { sym: "10yusy.b", name: "US 10Y Yield" },
  { sym: "usdeur",   name: "USD/EUR" },
  { sym: "cb.f",     name: "Brent" },
  { sym: "^spx",     name: "S&P 500" },
  { sym: "xauusd",   name: "Gold" },
  { sym: "asts.us",  name: "ASTS" },
];

const POSTS = [
  {
    id: "p1",
    title: "The yield curve as a mood ring",
    desc: "Treat the curve like a system diagram instead of a prophecy.",
    tags: ["macro", "rates"],
    category: "macro",
    dateISO: "2026-01-04",
    minutes: 6,
    signal: 82,
  },
  {
    id: "p2",
    title: "DCF without cosplay",
    desc: "Valuation is assumptions, not wizard robes.",
    tags: ["valuation", "accounting"],
    category: "accounting",
    dateISO: "2026-01-02",
    minutes: 7,
    signal: 74,
  },
  {
    id: "p3",
    title: "Narratives are leverage",
    desc: "Markets price stories, then price belief in them.",
    tags: ["macro", "positioning"],
    category: "macro",
    dateISO: "2025-12-28",
    minutes: 5,
    signal: 73,
  },
];

/* ---------------- Tape ---------------- */

/**
 * Load static tape.json.
 */
async function loadTapeFromJson() {
  const res = await fetch("/tape.json", { cache: "no-store" });
  if (!res.ok) throw new Error("tape.json missing");
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

/**
 * Render tape panel.
 */
async function renderTape() {
  const list = document.getElementById("tape");
  if (!list) return;

  list.innerHTML = WATCH.map(w => `
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
  `).join("");

  let items;
  try {
    items = await loadTapeFromJson();
  } catch {
    list.innerHTML = `<li class="muted">Tape unavailable</li>`;
    return;
  }

  const bySym = new Map(items.map(i => [i.sym, i]));
  const rows = WATCH.map(w => bySym.get(w.sym) || { ...w, ok: false });

  const deltas = rows.filter(r => r.ok).map(r => r.deltaPct);
  const regimeEl = document.getElementById("regime");
  if (regimeEl) regimeEl.textContent = computeRegime(deltas);

  const dateEl = document.getElementById("lastSync");
  const latestDate = rows.filter(r => r.ok).map(r => r.date).sort().pop();
  if (dateEl) dateEl.textContent = latestDate ? `Close: ${latestDate}` : "Close: —";

  list.innerHTML = rows.map(d => {
    if (!d.ok) {
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

    const up = d.deltaPct >= 0;
    return `
      <li class="tick">
        <div class="tickLeft">
          <span class="badge">${esc(d.sym.toUpperCase())}</span>
          <span class="tickName">${esc(d.name)}</span>
        </div>
        <div class="tickRight">
          <div>${d.close.toFixed(2)}</div>
          <div class="delta ${up ? "deltaUp" : "deltaDown"}">
            ${chevronSVG(up)}
            <span>${pct(d.deltaPct)}</span>
          </div>
        </div>
      </li>
    `;
  }).join("");
}

/* ---------------- Posts / Filters ---------------- */

const state = { filter: "all", q: "", sort: "new" };
const pinSet = new Set(JSON.parse(localStorage.getItem("lm_pins") || "[]"));

function savePins() {
  localStorage.setItem("lm_pins", JSON.stringify([...pinSet]));
}

function selectPosts() {
  let items = POSTS.slice();

  if (state.filter !== "all") {
    items = items.filter(p => p.category === state.filter);
  }

  if (state.q) {
    const q = state.q.toLowerCase();
    items = items.filter(p =>
      `${p.title} ${p.desc} ${p.tags.join(" ")}`.toLowerCase().includes(q)
    );
  }

  if (state.sort === "signal") {
    items.sort((a, b) => b.signal - a.signal);
  } else {
    items.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  }

  return items;
}

function renderPosts() {
  const list = document.getElementById("postList");
  if (!list) return;

  const posts = selectPosts();

  list.innerHTML = posts.map(p => `
    <article class="post">
      <h3 class="postTitle">${esc(p.title)}</h3>
      <p class="postDesc">${esc(p.desc)}</p>
      <div class="postFoot">
        <span>${p.minutes} min</span>
        <button class="pinIt" data-pin="${p.id}">
          ${pinSet.has(p.id) ? "Pinned" : "Pin"}
        </button>
      </div>
    </article>
  `).join("");
}

/* ---------------- Init ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  renderTape();
  renderPosts();

  document.addEventListener("click", (e) => {
    const pin = e.target.closest("[data-pin]");
    if (!pin) return;
    const id = pin.getAttribute("data-pin");
    pinSet.has(id) ? pinSet.delete(id) : pinSet.add(id);
    savePins();
    renderPosts();
  });
});