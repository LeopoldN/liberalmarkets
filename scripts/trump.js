/**
 * trump.js
 * Page-only behavior for trumptracker.html:
 * - falling man scroll indicator
 * - snapshot CSV loading
 * - horizontal draggable snapshot rows (Firefox-safe)
 * - chart filtering via search
 */

(function () {
  /* ================================
     Utilities
  ================================= */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function bustDaily(url) {
    const day = new Date().toISOString().slice(0, 10);
    return url.includes("?") ? `${url}&v=${day}` : `${url}?v=${day}`;
  }

  function parseFredCsv(text) {
    const lines = String(text || "").trim().split(/\r?\n/);
    let start = lines.findIndex(l => /^DATE\s*,/i.test(l));
    if (start === -1) start = 0;
    else start++;

    const out = [];
    for (let i = start; i < lines.length; i++) {
      const [date, raw] = lines[i].split(",");
      if (!date || raw === "." || raw == null) continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      out.push({ date: date.trim(), value: v });
    }
    return out;
  }

  function formatValue(v, label) {
    const l = (label || "").toLowerCase();
    if (l.includes("rate") || l.includes("%")) return `${v.toFixed(1)}%`;
    if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function formatChange(curr, prev, currDate, prevDate) {
    if (!Number.isFinite(curr) || !Number.isFinite(prev)) return `as of ${currDate}`;
    const d = curr - prev;
    const pct = prev !== 0 ? (d / prev) * 100 : 0;
    const sign = d > 0 ? "+" : "";
    return `${sign}${d.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${sign}${pct.toFixed(2)}%)`;
  }

  function initSnapshotDrawers() {
    document.querySelectorAll(".ttSection").forEach((section) => {
      const row = section.querySelector(".ttSnapRow");
      const btn = section.querySelector("[data-tt-more]");
      const more = section.querySelector(".ttMore");
      const grid = section.querySelector("[data-tt-more-grid]");

      if (!row || !btn || !more || !grid) return;

      const snaps = Array.from(row.querySelectorAll(".ttSnap"));
      const FEATURED = 3;

      const featured = snaps.slice(0, FEATURED);
      const extras = snaps.slice(FEATURED);

      // If no extras, hide the button entirely
      if (extras.length === 0) {
        btn.style.display = "none";
        return;
      }

      // Move extras into the drawer grid
      extras.forEach((el) => grid.appendChild(el));

      // Ensure featured remain in the row (in case DOM got shuffled)
      featured.forEach((el) => row.appendChild(el));

      // Toggle behavior
      const setOpen = (open) => {
        btn.setAttribute("aria-expanded", String(open));
        more.hidden = !open;
        btn.textContent = open ? "Hide" : "Show all";
      };

      setOpen(false);

      btn.addEventListener("click", () => {
        const open = btn.getAttribute("aria-expanded") === "true";
        setOpen(!open);
      });
    });
  }




  /* ================================
     Snapshots (CSV → cards)
  ================================= */

  function initSnapshots() {
    const snaps = document.querySelectorAll(".ttSnap[data-csv]");
    snaps.forEach(async snap => {
      const url = snap.getAttribute("data-csv");
      const label = snap.getAttribute("data-label") || "";
      const valEl = snap.querySelector(".ttSnapVal");
      const chgEl = snap.querySelector(".ttSnapChg");
      if (!url || !valEl || !chgEl) return;

      valEl.textContent = "—";
      chgEl.textContent = "loading…";

      try {
        const res = await fetch(bustDaily(url), { cache: "no-store" });
        if (!res.ok) throw new Error(res.status);
        const rows = parseFredCsv(await res.text());
        if (!rows.length) throw new Error("no data");

        const last = rows[rows.length - 1];
        const prev = rows.length > 1 ? rows[rows.length - 2] : null;

        valEl.textContent = formatValue(last.value, label);
        chgEl.textContent = formatChange(
          last.value,
          prev?.value,
          last.date,
          prev?.date || ""
        );
      } catch {
        valEl.textContent = "—";
        chgEl.textContent = "—";
      }
    });
  }


  /* ================================
     Falling man indicator
  ================================= */

  function initFallingMan() {
    const el = document.getElementById("fallGuy");
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;

    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const t = clamp(scrollTop / maxScroll, 0, 1);

      const rail = el.parentElement;
      const railH = rail ? rail.getBoundingClientRect().height : window.innerHeight;
      const maxY = Math.max(0, railH - 90);

      const y = t * maxY;
      const rot = -8 + t * 120 + Math.sin(t * Math.PI * 2) * 2;

      el.style.transform = `translate(-50%, ${y}px) rotate(${rot}deg)`;
      el.style.opacity = String(0.55 + t * 0.45);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  /* ================================
     Chart search filter
  ================================= */

  function initChartSearch() {
    const q = document.getElementById("q");
    const grid = document.getElementById("chartGrid");
    if (!q || !grid) return;

    const norm = s => (s || "").toLowerCase().trim();

    const apply = () => {
      const needle = norm(q.value);
      const cards = grid.querySelectorAll(".chartCard");

      cards.forEach(card => {
        const title = norm(card.querySelector(".chartTitleText")?.textContent);
        const csv = norm(card.querySelector("canvas")?.dataset.csv);
        card.style.display =
          !needle || title.includes(needle) || csv.includes(needle)
            ? ""
            : "none";
      });

      grid.querySelectorAll(".ttSection").forEach(sec => {
        const visible = sec.querySelector(".chartCard:not([style*='none'])");
        sec.style.display = visible ? "" : "none";
      });
    };

    q.addEventListener("input", apply);
    apply();
  }

  /* ================================
     Boot
  ================================= */

  document.addEventListener("DOMContentLoaded", () => {
    initSnapshotDrawers(); 
    initSnapshots();
    initFallingMan();
    initChartSearch();
  });
})();