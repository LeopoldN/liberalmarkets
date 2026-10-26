// Elon Time (elon-time.html): the clock, one line per dated promise with a date line that can be
// dragged back through time, and the file, every claim with what came of it. Both read
// data/elon-claims.json.

const DAY = 86400000;
const SWEEP_MS = 2800;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const KINDS = [
  { id: "deadline", label: "Deadlines" },
  { id: "false", label: "Not true" },
  { id: "figure", label: "Numbers" },
];

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

// ── Dates ───────────────────────────────────────────────────────────────
// "2020" and "2020-11" are allowed. A deadline given as a year or a month means the end of it.

function parseDate(s, end = false) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  if (d) return Date.UTC(y, m - 1, d);
  if (m) return end ? Date.UTC(y, m, 0) : Date.UTC(y, m - 1, 1);
  return end ? Date.UTC(y, 11, 31) : Date.UTC(y, 0, 1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fmtGiven(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  if (d) return `${d} ${MONTHS[m - 1]} ${y}`;
  if (m) return `${MONTHS[m - 1]} ${y}`;
  return String(y);
}

function fmtDue(s) {
  const parts = String(s).split("-");
  return parts.length === 3 ? fmtGiven(s) : `end of ${fmtGiven(s)}`;
}

function fmtDay(t, long = false) {
  const d = new Date(t);
  return `${d.getUTCDate()} ${(long ? MONTHS_LONG : MONTHS)[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A gap in time, short form for labels: "5 yr 10 mo", "3 mo", "12 days". */
function fmtGap(ms) {
  const days = Math.round(ms / DAY);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = Math.round(days / 30.44);
  const y = Math.floor(months / 12);
  const mo = months % 12;
  if (!y) return `${mo} mo`;
  return mo ? `${y} yr ${mo} mo` : `${y} yr`;
}

/** The same, written out for a sentence: "31 years and 4 months". */
function fmtGapLong(ms) {
  const days = Math.round(ms / DAY);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = Math.round(days / 30.44);
  const y = Math.floor(months / 12);
  const mo = months % 12;
  const ys = y ? `${y} ${y === 1 ? "year" : "years"}` : "";
  const ms_ = mo ? `${mo} ${mo === 1 ? "month" : "months"}` : "";
  return [ys, ms_].filter(Boolean).join(" and ");
}

const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n) => (n <= 10 ? words[n] : String(n));
const plural = (n, one, many) => `${count(n)} ${n === 1 ? one : many}`;

function fmtAmount(v, unit) {
  const n = v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (!unit) return n;
  if (unit === "$") return `$${n}`;
  if (unit === "%") return `${n}%`;
  return `${n} ${unit}`;
}

// ── Data ────────────────────────────────────────────────────────────────

async function loadClaims() {
  const res = await fetch("data/elon-claims.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(res.status);
  const { claims = [] } = await res.json();
  return claims
    .filter((c) => c && c.id && c.said)
    .map((c, i) => ({
      ...c,
      order: i,
      kind: KINDS.some((k) => k.id === c.kind) ? c.kind : "false",
      saidT: parseDate(c.said),
      dueT: c.kind === "deadline" ? parseDate(c.due, true) : null,
      doneT: c.kind === "deadline" ? parseDate(c.delivered) : null,
    }))
    .filter((c) => c.kind !== "deadline" || c.dueT != null)
    .sort((a, b) => a.saidT - b.saidT || (a.dueT ?? 0) - (b.dueT ?? 0) || a.order - b.order);
}

/** Where a claim stands on a given day. */
function standing(c, t) {
  if (c.kind !== "deadline") return null;
  const done = c.doneT != null && c.doneT <= t;
  if (done) {
    const late = c.doneT - c.dueT;
    return late > DAY ? { state: "late", gap: late } : { state: "kept", gap: 0 };
  }
  if (t > c.dueT) return { state: "overdue", gap: t - c.dueT };
  return { state: "pending", gap: c.dueT - t };
}

function verdict(c, today) {
  if (c.kind === "false") return { text: "Not true", cls: "is-bad" };
  if (c.kind === "figure") {
    const a = c.claimed?.value;
    const b = c.actual?.value;
    if (!a || b == null) return { text: "The numbers", cls: "" };
    const pct = Math.round((Math.abs(b - a) / a) * 100);
    return { text: `${pct}% ${b > a ? "higher" : "lower"} than claimed`, cls: "is-bad" };
  }
  const s = standing(c, today);
  const due = `Due ${fmtDue(c.due)}`;
  if (s.state === "overdue") return { text: `${due} · ${fmtGap(s.gap)} overdue`, cls: "is-bad" };
  if (s.state === "late") return { text: `${due} · arrived ${fmtGap(s.gap)} late`, cls: "is-late" };
  if (s.state === "kept") return { text: `${due} · delivered on time`, cls: "is-kept" };
  return { text: `${due} · not due yet`, cls: "" };
}

// ── The clock ───────────────────────────────────────────────────────────

function buildClock(root, claims, today) {
  const dated = claims.filter((c) => c.kind === "deadline");
  const others = claims.filter((c) => c.kind !== "deadline");
  const firstYear = new Date(Math.min(...claims.map((c) => c.saidT))).getUTCFullYear();
  const lastT = Math.max(today, ...dated.map((c) => c.dueT), ...dated.map((c) => c.doneT ?? 0));
  const t0 = Date.UTC(firstYear, 0, 1);
  const t1 = Date.UTC(new Date(lastT).getUTCFullYear() + 1, 0, 1);
  const x = (t) => ((t - t0) / (t1 - t0)) * 100;
  const pct = (v) => `${v.toFixed(3)}%`;

  root.textContent = "";

  // Axis, with the scrubber laid over it.
  const axis = el("div", "clock__axis");
  axis.append(el("span", "clock__axis-label", "Date said"));
  const scale = el("div", "clock__scale");
  const years = new Date(t1).getUTCFullYear() - firstYear;
  for (let y = firstYear; y < firstYear + years; y++) {
    const tick = el("span", "clock__tick", String(y));
    if ((y - firstYear) % 2) tick.classList.add("is-minor");
    tick.style.left = pct(x(Date.UTC(y, 0, 1)));
    scale.append(tick);
  }
  const tag = el("span", "clock__tag");
  const scrub = el("input", "clock__scrub");
  scrub.type = "range";
  scrub.id = "clock-scrub";
  scrub.min = String(Math.round(t0 / DAY));
  scrub.max = String(Math.round(today / DAY));
  scrub.step = "1";
  scrub.setAttribute("aria-label", "Date on the clock");
  scale.append(tag, scrub);
  axis.append(scale);

  // One row per dated promise, then one row for everything else.
  const list = el("ol", "clock__rows");
  const rows = dated.map((c) => {
    const li = el("li", "clock__row");
    const label = el("a", "clock__label");
    label.href = `#${c.id}`;
    const meta = el("small", "clock__meta");
    label.append(el("span", "clock__name", c.title || c.quote), meta);
    const track = el("div", "clock__track");
    const wait = el("span", "clock__wait");
    const late = el("span", "clock__late");
    const said = el("i", "clock__said");
    const due = el("i", "clock__due");
    const done = el("i", "clock__done");
    said.style.left = pct(x(c.saidT));
    wait.style.left = pct(x(c.saidT));
    due.style.left = pct(x(c.dueT));
    late.style.left = pct(x(c.dueT));
    if (c.doneT != null) done.style.left = pct(x(c.doneT));
    track.append(wait, late, said, due, done);
    li.append(label, track);
    list.append(li);
    return { c, li, meta, wait, late, done };
  });

  let marks = [];
  if (others.length) {
    const li = el("li", "clock__row clock__row--others");
    const label = el("span", "clock__label");
    label.append(el("span", "clock__name", "Other claims"), el("small", "clock__meta", "Untrue statements and wrong numbers, by the day he made them"));
    const track = el("div", "clock__track");
    marks = others.map((c) => {
      const a = el("a", `clock__mark is-${c.kind}`);
      a.href = `#${c.id}`;
      a.style.left = pct(x(c.saidT));
      a.setAttribute("aria-label", `${c.title || c.quote}, ${fmtGiven(c.said)}`);
      a.title = `${c.title || c.quote} · ${fmtGiven(c.said)}`;
      track.append(a);
      return { c, a };
    });
    li.append(label, track);
    list.append(li);
  }

  // Year lines and the date line sit in a layer over the plot column.
  const layer = el("div", "clock__layer");
  layer.setAttribute("aria-hidden", "true");
  for (let y = firstYear + 1; y < firstYear + years; y++) {
    const line = el("span", "clock__grid");
    line.style.left = pct(x(Date.UTC(y, 0, 1)));
    layer.append(line);
  }
  const cursor = el("span", "clock__cursor");
  layer.append(cursor);

  root.append(axis, list, layer);

  // Draw the clock as it stood on day t.
  function draw(t) {
    const cx = x(t);
    cursor.style.left = pct(cx);
    tag.textContent = fmtDay(t);
    tag.style.left = pct(cx);
    tag.classList.toggle("is-start", cx < 12);
    tag.classList.toggle("is-end", cx > 88);
    scrub.value = String(Math.round(t / DAY));
    scrub.setAttribute("aria-valuetext", fmtDay(t, true));

    for (const r of rows) {
      const { c } = r;
      const said = t >= c.saidT;
      r.li.classList.toggle("is-future", !said);
      const waitEnd = Math.min(t, c.dueT, c.doneT ?? Infinity);
      r.wait.style.width = pct(Math.max(0, x(waitEnd) - x(c.saidT)));
      const s = standing(c, t);
      const lateEnd = Math.min(t, c.doneT ?? Infinity);
      r.late.style.width = pct(Math.max(0, x(lateEnd) - x(c.dueT)));
      r.li.classList.toggle("is-overdue", said && s.state === "overdue");
      r.li.classList.toggle("is-done", s.state === "late" || s.state === "kept");
      r.done.hidden = !(c.doneT != null && t >= c.doneT);
      if (!said) r.meta.textContent = `Said ${fmtGiven(c.said)}`;
      else if (s.state === "overdue") r.meta.textContent = `Due ${fmtDue(c.due)} · ${fmtGap(s.gap)} overdue`;
      else if (s.state === "late") r.meta.textContent = `Due ${fmtDue(c.due)} · arrived ${fmtGap(s.gap)} late`;
      else if (s.state === "kept") r.meta.textContent = `Due ${fmtDue(c.due)} · on time`;
      else r.meta.textContent = `Due ${fmtDue(c.due)}`;
    }
    for (const m of marks) m.a.classList.toggle("is-future", t < m.c.saidT);
    return tally(t);
  }

  // The sentence above the chart, for day t.
  function tally(t) {
    const made = dated.filter((c) => c.saidT <= t);
    const come = made.filter((c) => c.dueT < t);
    const missed = come.filter((c) => standing(c, t).state !== "kept");
    const total = made.reduce((sum, c) => sum + Math.max(0, Math.min(t, c.doneT ?? Infinity) - c.dueT), 0);
    const when = Math.abs(t - today) < DAY ? "By today" : `By ${fmtDay(t, true)}`;
    let first = `${when}, Musk had set ${plural(made.length, "deadline", "deadlines")}.`;
    if (!made.length) return { html: `${when}, Musk had not yet set any of these deadlines.`, text: `${when}, Musk had not yet set any of these deadlines.` };
    let second;
    if (!come.length) second = "None had come due.";
    else if (missed.length === come.length) {
      const which = come.length === 1 ? "the one that had come due" : `all ${count(come.length)} that had come due`;
      second = `He had missed ${which}`;
    } else second = `He had missed ${count(missed.length)} of the ${count(come.length)} that had come due`;
    if (come.length) {
      const sum = fmtGapLong(total);
      return {
        html: `${first} ${second}, by a combined <strong>${sum}</strong>.`,
        text: `${first} ${second}, by a combined ${sum}.`,
      };
    }
    return { html: `${first} ${second}`, text: `${first} ${second}` };
  }

  return { draw, scrub, t0, t1 };
}

function startClock(section, claims) {
  const today = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const chartRoot = section.querySelector("[data-clock]");
  const tallyEl = section.querySelector("[data-clock-tally]");
  const replay = section.querySelector("[data-clock-replay]");
  const toToday = section.querySelector("[data-clock-today]");
  const live = el("p", "visually-hidden");
  live.setAttribute("aria-live", "polite");
  section.append(live);

  if (!claims.some((c) => c.kind === "deadline")) {
    tallyEl.textContent = "No dated promises in the record yet.";
    section.querySelector(".clock__controls").hidden = true;
    return;
  }

  const clock = buildClock(chartRoot, claims, today);
  let current = today;
  let raf = 0;

  const show = (t, announce = false) => {
    current = Math.max(clock.t0, Math.min(today, t));
    const out = clock.draw(current);
    tallyEl.innerHTML = out.html;
    if (announce) live.textContent = out.text;
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    section.classList.remove("is-sweeping");
  };

  // The one moment of motion: the date line runs from the first promise to today.
  function sweep() {
    stop();
    if (reducedMotion()) return show(today, true);
    const from = Math.min(...claims.map((c) => c.saidT)) - 60 * DAY;
    const start = performance.now();
    section.classList.add("is-sweeping");
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const frame = (now) => {
      const p = Math.min(1, (now - start) / SWEEP_MS);
      show(from + (today - from) * ease(p));
      if (p < 1) raf = requestAnimationFrame(frame);
      else { stop(); show(today, true); }
    };
    raf = requestAnimationFrame(frame);
  }

  clock.scrub.addEventListener("input", () => { stop(); show(Number(clock.scrub.value) * DAY); });
  clock.scrub.addEventListener("change", () => show(Number(clock.scrub.value) * DAY, true));

  // Dragging along any track moves the date line too.
  const plot = chartRoot.querySelector(".clock__rows");
  let dragging = false;
  const fromPointer = (e) => {
    const box = plot.querySelector(".clock__track").getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
    return clock.t0 + p * (clock.t1 - clock.t0);
  };
  plot.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".clock__track") || e.target.closest("a")) return;
    dragging = true;
    stop();
    plot.setPointerCapture(e.pointerId);
    show(fromPointer(e));
  });
  plot.addEventListener("pointermove", (e) => { if (dragging) show(fromPointer(e)); });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    show(fromPointer(e), true);
  };
  plot.addEventListener("pointerup", end);
  plot.addEventListener("pointercancel", () => { dragging = false; });

  replay.addEventListener("click", sweep);
  toToday.addEventListener("click", () => { stop(); show(today, true); });

  show(today);
  sweep();
}

// ── The file ────────────────────────────────────────────────────────────

function entry(c, today) {
  const li = el("li", "claim");
  li.id = c.id;
  li.dataset.kind = c.kind;
  li.dataset.company = c.company || "";

  const when = el("div", "claim__when");
  const time = el("time", null, fmtGiven(c.said));
  time.dateTime = c.said;
  when.append(time);
  if (c.company) when.append(el("span", "claim__company", c.company));

  const main = el("div", "claim__main");
  const v = verdict(c, today);
  main.append(el("p", `claim__verdict ${v.cls}`, v.text));
  const quote = el("blockquote", "claim__quote");
  quote.append(el("p", null, `“${c.quote}”`));
  main.append(quote);
  if (c.where) main.append(el("p", "claim__where", c.where));
  if (c.outcome) main.append(el("p", "claim__outcome", c.outcome));

  if (c.kind === "figure" && c.claimed && c.actual) {
    const max = Math.max(c.claimed.value, c.actual.value) || 1;
    const fig = el("div", "compare");
    for (const [side, cls] of [[c.claimed, "is-claimed"], [c.actual, "is-actual"]]) {
      const row = el("div", `compare__row ${cls}`);
      const bar = el("span", "compare__bar");
      bar.style.width = `${((side.value / max) * 100).toFixed(2)}%`;
      const track = el("span", "compare__track");
      track.append(bar);
      row.append(el("span", "compare__label", side.label || (cls === "is-claimed" ? "Claimed" : "Actual")), track, el("span", "compare__value", fmtAmount(side.value, c.unit)));
      fig.append(row);
    }
    main.append(fig);
  }

  const sources = (c.sources || []).filter((s) => s && s.url);
  if (sources.length) {
    const p = el("p", "claim__sources", sources.length === 1 ? "Source: " : "Sources: ");
    sources.forEach((s, i) => {
      const a = el("a", null, s.label || new URL(s.url).hostname);
      a.href = s.url;
      a.rel = "noopener";
      if (i) p.append(", ");
      p.append(a);
    });
    main.append(p);
  }

  li.append(when, main);
  return li;
}

function startFile(section, claims) {
  const today = Date.now();
  const list = section.querySelector("[data-file]");
  const kindsEl = section.querySelector("[data-file-kinds]");
  const companiesEl = section.querySelector("[data-file-companies]");
  const countEl = section.querySelector("[data-file-count]");
  const note = section.querySelector("[data-file-note]");
  note.hidden = !claims.some((c) => c.placeholder);

  const items = claims.map((c) => ({ c, li: entry(c, today) }));
  list.replaceChildren(...items.map((i) => i.li));

  const filter = { kind: "", company: "" };

  function buttons(root, options, key) {
    root.replaceChildren(...options.map((o) => {
      const b = el("button", "filter", o.label);
      b.type = "button";
      b.dataset.value = o.id;
      b.setAttribute("aria-pressed", String(filter[key] === o.id));
      b.addEventListener("click", () => { filter[key] = o.id; apply(); });
      return b;
    }));
  }

  const kinds = [{ id: "", label: `All ${claims.length}` }, ...KINDS
    .map((k) => ({ ...k, n: claims.filter((c) => c.kind === k.id).length }))
    .filter((k) => k.n)
    .map((k) => ({ id: k.id, label: `${k.label} ${k.n}` }))];
  const companies = [...new Set(claims.map((c) => c.company).filter(Boolean))].sort();

  function apply() {
    let shown = 0;
    for (const { c, li } of items) {
      const on = (!filter.kind || c.kind === filter.kind) && (!filter.company || c.company === filter.company);
      li.hidden = !on;
      if (on) shown++;
    }
    countEl.textContent = shown === claims.length ? `${plural(claims.length, "entry", "entries")}` : `${shown} of ${claims.length}`;
    for (const b of section.querySelectorAll("[data-file-kinds] .filter")) b.setAttribute("aria-pressed", String(b.dataset.value === filter.kind));
    for (const b of section.querySelectorAll("[data-file-companies] .filter")) b.setAttribute("aria-pressed", String(b.dataset.value === filter.company));
    list.classList.toggle("is-empty", !shown);
  }

  buttons(kindsEl, kinds, "kind");
  if (companies.length > 1) buttons(companiesEl, [{ id: "", label: "Every company" }, ...companies.map((c) => ({ id: c, label: c }))], "company");
  else companiesEl.hidden = true;
  apply();

  // Links from the clock always land on a visible entry.
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const target = items.find((i) => `#${i.c.id}` === a.getAttribute("href"));
    if (target?.li.hidden) { filter.kind = ""; filter.company = ""; apply(); }
  });
}

export async function startClaims(section) {
  const fileSection = document.querySelector("[data-file-section]");
  let claims;
  try {
    claims = await loadClaims();
  } catch (err) {
    section.querySelector("[data-clock-tally]").textContent = "The record didn’t load. Refresh the page to try again.";
    section.querySelector(".clock__controls").hidden = true;
    if (fileSection) fileSection.hidden = true;
    return [];
  }
  startClock(section, claims);
  if (fileSection) startFile(fileSection, claims);
  // A link straight to an entry lands once the file exists.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  return claims.map((c) => ({
    type: "Claim",
    title: c.title || c.quote,
    sub: `${fmtGiven(c.said)} · ${c.company || "Elon Musk"}`,
    href: `elon-time.html#${c.id}`,
    keywords: `Elon Musk ${c.quote} ${c.outcome || ""}`,
  }));
}
