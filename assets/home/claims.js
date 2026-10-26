// Elon Time (elon-time.html): the clock, one thin line per dated promise with a date line that can
// be dragged back through time, and the file, every claim in chapters with what came of it. Both
// read data/elon-claims.json.

const DAY = 86400000;
const SWEEP_MS = 3200;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATUS = {
  missed: { label: "Missed", tone: "is-bad", group: "missed" },
  late: { label: "Late", tone: "is-late", group: "late" },
  partly: { label: "Partly met", tone: "is-late", group: "late" },
  false: { label: "False", tone: "is-bad", group: "untrue" },
  misleading: { label: "Misleading", tone: "is-bad", group: "untrue" },
  reversed: { label: "Reversed", tone: "is-bad", group: "untrue" },
  pending: { label: "Pending", tone: "", group: "pending" },
  kept: { label: "Came true", tone: "is-kept", group: "kept" },
};

const GROUPS = [
  { id: "missed", label: "Missed" },
  { id: "late", label: "Late" },
  { id: "untrue", label: "Untrue" },
  { id: "pending", label: "Pending" },
  { id: "kept", label: "Came true" },
];

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** Text with [label](url) links, as nodes. */
function rich(text) {
  const frag = document.createDocumentFragment();
  const re = /\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let pos = 0;
  let m;
  while ((m = re.exec(text))) {
    frag.append(text.slice(pos, m.index));
    const a = el("a", null, m[1]);
    a.href = m[2];
    a.rel = "noopener";
    frag.append(a);
    pos = m.index + m[0].length;
  }
  frag.append(text.slice(pos));
  return frag;
}

/** Text without links; a bracketed list of citations goes entirely. */
const plain = (text) => String(text || "")
  .replace(/\s*\((?:\[[^\]]+\]\([^)\s]+\)(?:,\s*)?)+\)/g, "")
  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

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

function fmtDay(t, long = false) {
  const d = new Date(t);
  return `${d.getUTCDate()} ${(long ? MONTHS_LONG : MONTHS)[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const saidText = (c) => c.saidLabel || fmtGiven(c.said);
const dueText = (c) => c.dueLabel || fmtGiven(c.due);

/** A gap in time for labels: "5 yr 10 mo", "3 mo", "12 days". */
function fmtGap(ms) {
  const days = Math.round(ms / DAY);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = Math.round(days / 30.44);
  const y = Math.floor(months / 12);
  const mo = months % 12;
  if (!y) return `${mo} mo`;
  return mo ? `${y} yr ${mo} mo` : `${y} yr`;
}

/** Years for the running total: "1 year", "38.4 years", "212 years". */
function fmtYears(ms) {
  const y = ms / (365.25 * DAY);
  if (y < 1) return fmtGap(ms).replace(" mo", " months");
  const v = y >= 100 ? Math.round(y) : Math.round(y * 10) / 10;
  return `${v.toLocaleString("en-GB")} ${v === 1 ? "year" : "years"}`;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n) => (n <= 10 ? WORDS[n] : n.toLocaleString("en-GB"));

function fmtAmount(v, n) {
  const digits = Math.abs(v) < 10 && v % 1 ? 1 : 0;
  return `${n.prefix || ""}${v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}${n.suffix || ""}`;
}

// ── Data ────────────────────────────────────────────────────────────────

async function loadRecord() {
  const res = await fetch("data/elon-claims.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(res.status);
  const { sections = [], claims = [] } = await res.json();
  const list = claims
    .filter((c) => c && c.id && c.said && c.claim)
    .map((c, i) => ({
      ...c,
      order: i,
      status: STATUS[c.status] ? c.status : "missed",
      saidT: parseDate(c.said),
      dueT: parseDate(c.due, true),
      doneT: parseDate(c.delivered),
    }))
    .sort((a, b) => a.saidT - b.saidT || (a.dueT ?? 0) - (b.dueT ?? 0) || a.order - b.order);
  return { sections, claims: list };
}

/** Where a dated promise stands on day t. */
function standing(c, t) {
  if (c.doneT != null && c.doneT <= t) {
    if (c.doneT - c.dueT > DAY) return { state: "late", gap: c.doneT - c.dueT };
    return { state: c.status === "kept" ? "kept" : "partly", gap: 0 };
  }
  if (t > c.dueT) return { state: "overdue", gap: t - c.dueT };
  return { state: "pending", gap: c.dueT - t };
}

function verdict(c, today) {
  const s = STATUS[c.status];
  const parts = [s.label];
  if (c.dueT != null) {
    const now = standing(c, today);
    if (c.status === "kept") parts.push(dueText(c));
    else parts.push(`due ${dueText(c)}`);
    if (now.state === "overdue" && c.status !== "kept") parts.push(`${fmtGap(now.gap)} overdue`);
    if (now.state === "late") parts.push(`arrived ${fmtGap(now.gap)} late`);
  }
  return { text: parts.join(" · "), tone: s.tone };
}

// ── The clock ───────────────────────────────────────────────────────────

function buildClock(root, record, today) {
  const dated = record.claims.filter((c) => c.dueT != null);
  const undated = record.claims.filter((c) => c.dueT == null);
  const firstYear = new Date(Math.min(...record.claims.map((c) => c.saidT))).getUTCFullYear();
  const lastT = Math.max(today, ...dated.map((c) => c.dueT), ...dated.map((c) => c.doneT ?? 0));
  const t0 = Date.UTC(firstYear, 0, 1);
  const t1 = Date.UTC(new Date(lastT).getUTCFullYear() + 1, 0, 1);
  const x = (t) => ((t - t0) / (t1 - t0)) * 100;
  const pct = (v) => `${v.toFixed(3)}%`;
  const sectionOf = new Map(record.sections.map((s) => [s.id, s]));

  root.textContent = "";

  // Axis, with the scrubber laid over it.
  const axis = el("div", "clock__axis");
  const lastYear = new Date(t1).getUTCFullYear();
  for (let y = firstYear; y < lastYear; y++) {
    const tick = el("span", "clock__tick", String(y));
    if (y % 2) tick.classList.add("is-odd");
    if (y % 5) tick.classList.add("is-off5");
    if (x(Date.UTC(y, 0, 1)) > 90) tick.classList.add("is-edge");
    tick.style.left = pct(x(Date.UTC(y, 0, 1)));
    axis.append(tick);
  }
  const tag = el("span", "clock__tag");
  const scrub = el("input", "clock__scrub");
  scrub.type = "range";
  scrub.id = "clock-scrub";
  scrub.min = String(Math.round(t0 / DAY));
  scrub.max = String(Math.round(today / DAY));
  scrub.step = "1";
  scrub.setAttribute("aria-label", "Date on the clock");
  axis.append(tag, scrub);

  // One thin row per dated promise, oldest at the top.
  const plot = el("div", "clock__plot");
  const list = el("ol", "clock__rows");
  list.setAttribute("aria-hidden", "true");
  const rows = dated.map((c) => {
    const li = el("li", `clock__row is-${c.status}`);
    li.dataset.id = c.id;
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
    li.append(wait, late, said, due, done);
    list.append(li);
    return { c, li, wait, late, done };
  });

  // Untrue statements and claims with no date sit on one strip below.
  const strip = el("div", "clock__strip");
  const marks = undated.map((c) => {
    const a = el("a", `clock__mark is-${STATUS[c.status].group}`);
    a.href = `#${c.id}`;
    a.dataset.id = c.id;
    a.style.left = pct(x(c.saidT));
    a.setAttribute("aria-label", `${plain(c.claim)}, ${saidText(c)}`);
    strip.append(a);
    return { c, a };
  });

  // Year lines, the shaded future and the date line sit in a layer over everything.
  const layer = el("div", "clock__layer");
  layer.setAttribute("aria-hidden", "true");
  const future = el("span", "clock__future");
  future.style.left = pct(x(today));
  layer.append(future);
  for (let y = firstYear + 1; y < lastYear; y++) {
    const line = el("span", "clock__grid");
    line.style.left = pct(x(Date.UTC(y, 0, 1)));
    layer.append(line);
  }
  const cursor = el("span", "clock__cursor");
  layer.append(cursor);

  const tip = el("div", "clock__tip");
  tip.hidden = true;

  plot.append(list, strip, layer, tip);
  root.append(axis, plot);

  let topic = "";

  function draw(t) {
    const cx = x(t);
    cursor.style.left = pct(cx);
    tag.textContent = fmtDay(t);
    tag.style.left = pct(cx);
    tag.classList.toggle("is-start", cx < 10);
    tag.classList.toggle("is-end", cx > 90);
    scrub.value = String(Math.round(t / DAY));
    scrub.setAttribute("aria-valuetext", fmtDay(t, true));

    for (const r of rows) {
      const { c } = r;
      r.li.classList.toggle("is-future", t < c.saidT);
      const waitEnd = Math.min(t, c.dueT, c.doneT ?? Infinity);
      r.wait.style.width = pct(Math.max(0, x(waitEnd) - x(c.saidT)));
      const lateEnd = Math.min(t, c.doneT ?? Infinity);
      r.late.style.width = pct(Math.max(0, x(lateEnd) - x(c.dueT)));
      const s = standing(c, t);
      r.li.dataset.state = t < c.saidT ? "" : s.state;
      r.done.hidden = !(c.doneT != null && t >= c.doneT);
    }
    for (const m of marks) m.a.classList.toggle("is-future", t < m.c.saidT);
    return tally(t);
  }

  // The sentence above the chart, for day t and the chosen topic.
  function tally(t) {
    const pool = dated.filter((c) => !topic || c.section === topic);
    const name = topic ? ` ${sectionOf.get(topic)?.phrase || ""}`.trimEnd() : "";
    const when = Math.abs(t - today) < DAY ? "By today" : `By ${fmtDay(t, true)}`;
    const made = pool.filter((c) => c.saidT <= t);
    if (!made.length) {
      const text = `${when}, Musk had not yet set a deadline${name}.`;
      return { html: text, text };
    }
    const come = made.filter((c) => c.dueT < t);
    const met = come.filter((c) => ["kept", "partly"].includes(standing(c, t).state));
    const missed = come.length - met.length;
    const total = come.reduce((sum, c) => sum + Math.max(0, Math.min(t, c.doneT ?? Infinity) - c.dueT), 0);
    const first = `${when}, Musk had set ${count(made.length)} ${made.length === 1 ? "deadline" : "deadlines"}${name}.`;
    let second;
    if (!come.length) second = "None had come due.";
    else if (!missed) second = come.length === 1 ? "He met the one that had come due." : `He met all ${count(come.length)} that had come due.`;
    else {
      const of = come.length === made.length ? "" : ` of the ${count(come.length)} that had come due`;
      const lead = missed === come.length
        ? (come.length === 1 ? "He missed it" : `He missed all ${count(come.length)}${of ? " that had come due" : ""}`)
        : `He missed ${count(missed)}${of}`;
      const sum = fmtYears(total);
      return {
        html: `${first} ${lead}, by a combined <strong>${sum}</strong>.`,
        text: `${first} ${lead}, by a combined ${sum}.`,
      };
    }
    return { html: `${first} ${second}`, text: `${first} ${second}` };
  }

  function setTopic(id) {
    topic = id;
    for (const r of rows) r.li.classList.toggle("is-dim", !!topic && r.c.section !== topic);
    for (const m of marks) m.a.classList.toggle("is-dim", !!topic && m.c.section !== topic);
  }

  // The tip names the promise under the pointer; pinned, it links to the entry.
  const byId = new Map(record.claims.map((c) => [c.id, c]));
  let hoverRow = null;
  function showTip(id, clientX, anchor, pinned = false) {
    const c = byId.get(id);
    if (!c) return hideTip();
    tip.replaceChildren(
      el("span", "clock__tip-when", `${saidText(c)} · ${sectionOf.get(c.section)?.short || ""}`),
      el("span", "clock__tip-claim", plain(c.claim)),
    );
    const v = verdict(c, today);
    tip.append(el("span", `clock__tip-verdict ${v.tone}`, v.text));
    if (pinned) {
      const go = el("a", "clock__tip-link", "Read the entry ↓");
      go.href = `#${c.id}`;
      tip.append(go);
    }
    tip.classList.toggle("is-pinned", pinned);
    tip.dataset.id = id;
    tip.hidden = false;
    const box = plot.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const left = Math.max(0, Math.min(box.width - tip.offsetWidth, clientX - box.left - 24));
    let top = a.bottom - box.top + 8;
    if (top + tip.offsetHeight > box.height && a.top - box.top > tip.offsetHeight + 8) top = a.top - box.top - tip.offsetHeight - 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    if (hoverRow) hoverRow.classList.remove("is-hover");
    hoverRow = anchor.closest(".clock__row");
    hoverRow?.classList.add("is-hover");
  }
  function hideTip() {
    tip.hidden = true;
    tip.classList.remove("is-pinned");
    if (hoverRow) hoverRow.classList.remove("is-hover");
    hoverRow = null;
  }

  return { draw, tally, scrub, t0, t1, plot, list, strip, setTopic, showTip, hideTip, tip };
}

function startClock(section, record) {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const chartRoot = section.querySelector("[data-clock]");
  const tallyEl = section.querySelector("[data-clock-tally]");
  const topicsEl = section.querySelector("[data-clock-topics]");
  const replay = section.querySelector("[data-clock-replay]");
  const toToday = section.querySelector("[data-clock-today]");
  const live = el("p", "visually-hidden");
  live.setAttribute("aria-live", "polite");
  section.append(live);

  if (!record.claims.some((c) => c.dueT != null)) {
    tallyEl.textContent = "No dated promises in the record yet.";
    section.querySelector(".clock__controls").hidden = true;
    return;
  }

  const clock = buildClock(chartRoot, record, today);
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
  };

  // The one moment of motion: the date line runs from the first promise to today.
  function sweep() {
    stop();
    clock.hideTip();
    if (reducedMotion()) return show(today, true);
    const from = Math.min(...record.claims.map((c) => c.saidT)) - 30 * DAY;
    const start = performance.now();
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const frame = (time) => {
      const p = Math.min(1, (time - start) / SWEEP_MS);
      show(from + (today - from) * ease(p));
      if (p < 1) raf = requestAnimationFrame(frame);
      else { raf = 0; show(today, true); }
    };
    raf = requestAnimationFrame(frame);
  }

  // Topics dim the other lines and recount the sentence.
  const topics = [{ id: "", short: "Everything" }, ...record.sections.filter((s) => record.claims.some((c) => c.section === s.id && c.dueT != null))];
  topicsEl.replaceChildren(...topics.map((s) => {
    const b = el("button", "filter", s.short);
    b.type = "button";
    b.setAttribute("aria-pressed", String(!s.id));
    b.addEventListener("click", () => {
      for (const o of topicsEl.children) o.setAttribute("aria-pressed", String(o === b));
      clock.setTopic(s.id);
      reserve();
      show(current, true);
    });
    return b;
  }));

  clock.scrub.addEventListener("input", () => { stop(); show(Number(clock.scrub.value) * DAY); });
  clock.scrub.addEventListener("change", () => show(Number(clock.scrub.value) * DAY, true));

  // On the plot: hover names a line, a press and drag moves the date line, a tap pins the name.
  const { plot } = clock;
  const at = (clientX) => {
    const box = clock.list.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    return clock.t0 + p * (clock.t1 - clock.t0);
  };
  const rowAt = (clientX, clientY) => document.elementFromPoint(clientX, clientY)?.closest(".clock__row, .clock__mark");
  let press = null;
  plot.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".clock__tip, a")) return;
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, scrubbing: false };
  });
  plot.addEventListener("pointermove", (e) => {
    if (press && press.id === e.pointerId) {
      if (!press.scrubbing && Math.abs(e.clientX - press.x) > 6 && Math.abs(e.clientX - press.x) > Math.abs(e.clientY - press.y)) {
        press.scrubbing = true;
        stop();
        clock.hideTip();
        plot.setPointerCapture(e.pointerId);
      }
      if (press.scrubbing) show(at(e.clientX));
      return;
    }
    if (e.pointerType !== "mouse" || clock.tip.classList.contains("is-pinned")) return;
    if (e.target.closest(".clock__tip")) return;
    const hit = rowAt(e.clientX, e.clientY);
    if (hit) clock.showTip(hit.dataset.id, e.clientX, hit);
    else clock.hideTip();
  });
  plot.addEventListener("pointerup", (e) => {
    if (!press || press.id !== e.pointerId) return;
    const { scrubbing } = press;
    press = null;
    if (scrubbing) return show(at(e.clientX), true);
    const hit = rowAt(e.clientX, e.clientY);
    if (hit?.classList.contains("clock__row")) {
      if (clock.tip.classList.contains("is-pinned") && clock.tip.dataset.id === hit.dataset.id) clock.hideTip();
      else clock.showTip(hit.dataset.id, e.clientX, hit, true);
    } else clock.hideTip();
  });
  plot.addEventListener("pointercancel", () => { press = null; });
  plot.addEventListener("pointerleave", () => {
    if (!clock.tip.classList.contains("is-pinned")) clock.hideTip();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") clock.hideTip(); });

  replay.addEventListener("click", sweep);
  toToday.addEventListener("click", () => { stop(); show(today, true); });

  // Hold the sentence at its tallest wording for this topic and width, so the replay never moves the page.
  function reserve() {
    const probe = tallyEl.cloneNode(false);
    probe.removeAttribute("data-clock-tally");
    probe.style.cssText = `position:absolute;visibility:hidden;left:0;top:0;min-height:0;width:${tallyEl.clientWidth}px`;
    tallyEl.parentNode.append(probe);
    let tallest = 0;
    for (let t = clock.t0; t < today + 30 * DAY; t += 30 * DAY) {
      probe.innerHTML = clock.tally(Math.min(t, today)).html;
      tallest = Math.max(tallest, probe.getBoundingClientRect().height);
    }
    probe.remove();
    tallyEl.style.minHeight = `${Math.ceil(tallest)}px`;
  }
  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(reserve, 150);
  });

  show(today);
  reserve();
  sweep();
}

// ── The file ────────────────────────────────────────────────────────────

function entry(c, today) {
  const li = el("li", "claim");
  li.id = c.id;

  const when = el("div", "claim__when");
  const time = el("time", null, saidText(c));
  time.dateTime = c.said;
  when.append(time, el("span", "claim__company", c.company || ""));

  const main = el("div", "claim__main");
  const v = verdict(c, today);
  main.append(el("p", `claim__verdict ${v.tone}`, v.text));
  const claim = el("p", "claim__text");
  claim.append(rich(c.claim));
  main.append(claim);
  if (c.outcome) {
    const out = el("p", "claim__outcome");
    out.append(rich(c.outcome));
    main.append(out);
  }

  if (Array.isArray(c.numbers) && c.numbers.length) {
    const fig = el("div", "compare");
    for (const n of c.numbers) {
      const max = Math.max(n.claimed, n.actual) || 1;
      const block = el("div", "compare__metric");
      block.append(el("span", "compare__name", n.metric));
      for (const [value, cls, label] of [[n.claimed, "is-claimed", "Promised"], [n.actual, "is-actual", "Actual"]]) {
        const row = el("div", `compare__row ${cls}`);
        const track = el("span", "compare__track");
        const bar = el("span", "compare__bar");
        bar.style.width = `${((value / max) * 100).toFixed(2)}%`;
        track.append(bar);
        const shown = `${cls === "is-actual" && n.approx ? "~" : ""}${fmtAmount(value, n)}`;
        row.append(el("span", "compare__label", label), track, el("span", "compare__value", shown));
        block.append(row);
      }
      if (n.note) block.append(el("span", "compare__note", n.note));
      fig.append(block);
    }
    main.append(fig);
  }

  const sources = (c.sources || []).filter((s) => s && s.url);
  if (sources.length) {
    const p = el("p", "claim__sources", "Said in: ");
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
  return { li, group: STATUS[c.status].group, company: c.company || "" };
}

function startFile(root, record) {
  const today = Date.now();
  const chaptersEl = root.querySelector("[data-file]");
  const groupsEl = root.querySelector("[data-file-groups]");
  const companiesEl = root.querySelector("[data-file-companies]");
  const countEl = root.querySelector("[data-file-count]");
  const navEl = root.querySelector("[data-file-nav]");
  const filter = { group: "", company: "" };

  const items = [];
  const chapters = record.sections.map((s) => {
    const own = record.claims.filter((c) => c.section === s.id);
    const wrap = el("section", "chapter");
    wrap.id = `chapter-${s.id}`;
    wrap.setAttribute("aria-labelledby", `chapter-${s.id}-title`);
    const head = el("header", "chapter__head");
    const h = el("h3", "chapter__title", s.title);
    h.id = `chapter-${s.id}-title`;
    const meta = el("span", "chapter__meta");
    head.append(el("span", "chapter__company", s.company || ""), h, meta);
    wrap.append(head);
    if (s.intro) {
      const p = el("p", "chapter__intro");
      p.append(rich(s.intro));
      wrap.append(p);
    }
    const ol = el("ol", "chapter__list");
    const mine = own.map((c) => {
      const e = entry(c, today);
      ol.append(e.li);
      items.push(e);
      return e;
    });
    wrap.append(ol);
    for (const n of s.notes || []) {
      const p = el("p", "chapter__note");
      p.append(rich(n));
      wrap.append(p);
    }
    chaptersEl.append(wrap);
    return { s, wrap, meta, mine };
  });
  // Claims whose chapter is missing still show, at the end.
  const known = new Set(record.sections.map((s) => s.id));
  const strays = record.claims.filter((c) => !known.has(c.section));
  if (strays.length) {
    const ol = el("ol", "chapter__list");
    const mine = strays.map((c) => { const e = entry(c, today); ol.append(e.li); items.push(e); return e; });
    const wrap = el("section", "chapter");
    wrap.append(ol);
    chaptersEl.append(wrap);
    chapters.push({ s: { id: "", title: "" }, wrap, meta: el("span"), mine });
  }

  navEl.replaceChildren(...chapters.filter((ch) => ch.s.id).map((ch) => {
    const li = el("li");
    const a = el("a", null, ch.s.title);
    a.href = `#chapter-${ch.s.id}`;
    li.append(a, el("span", null, String(ch.mine.length)));
    return li;
  }));

  function buttons(host, options, key) {
    host.replaceChildren(...options.map((o) => {
      const b = el("button", "filter", o.label);
      b.type = "button";
      b.dataset.value = o.id;
      b.addEventListener("click", () => { filter[key] = o.id; apply(); });
      return b;
    }));
  }

  const groups = [{ id: "", label: `All ${items.length}` }, ...GROUPS
    .map((g) => ({ ...g, n: items.filter((i) => i.group === g.id).length }))
    .filter((g) => g.n)
    .map((g) => ({ id: g.id, label: `${g.label} ${g.n}` }))];
  const companies = [...new Set(items.map((i) => i.company).filter(Boolean))];
  buttons(groupsEl, groups, "group");
  if (companies.length > 1) buttons(companiesEl, [{ id: "", label: "Tesla and SpaceX" }, ...companies.map((c) => ({ id: c, label: c }))], "company");
  else companiesEl.hidden = true;

  function apply() {
    let shown = 0;
    for (const ch of chapters) {
      let n = 0;
      for (const i of ch.mine) {
        const on = (!filter.group || i.group === filter.group) && (!filter.company || i.company === filter.company);
        i.li.hidden = !on;
        if (on) n++;
      }
      ch.wrap.hidden = !n;
      ch.meta.textContent = n === ch.mine.length ? `${n} ${n === 1 ? "entry" : "entries"}` : `${n} of ${ch.mine.length}`;
      shown += n;
    }
    countEl.textContent = shown === items.length ? `${items.length} entries` : `${shown} of ${items.length}`;
    for (const b of groupsEl.children) b.setAttribute("aria-pressed", String(b.dataset.value === filter.group));
    for (const b of companiesEl.children) b.setAttribute("aria-pressed", String(b.dataset.value === filter.company));
    root.classList.toggle("is-empty", !shown);
  }
  apply();

  // Links from the clock always land on a visible entry.
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const target = document.getElementById(a.getAttribute("href").slice(1));
    if (target && target.closest("[data-file-section]") && (target.hidden || target.closest("[hidden]"))) {
      filter.group = "";
      filter.company = "";
      apply();
    }
  });
}

export async function startClaims(section) {
  const fileSection = document.querySelector("[data-file-section]");
  let record;
  try {
    record = await loadRecord();
  } catch (err) {
    section.querySelector("[data-clock-tally]").textContent = "The record didn’t load. Refresh the page to try again.";
    section.querySelector(".clock__controls").hidden = true;
    if (fileSection) fileSection.hidden = true;
    return [];
  }
  startClock(section, record);
  if (fileSection) startFile(fileSection, record);
  // A link straight to an entry lands once the file exists.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  return record.claims.map((c) => ({
    type: "Claim",
    title: plain(c.claim),
    sub: `${saidText(c)} · ${c.company || "Elon Musk"} · ${STATUS[c.status].label}`,
    href: `elon-time.html#${c.id}`,
    keywords: `Elon Musk ${plain(c.outcome)}`,
  }));
}
