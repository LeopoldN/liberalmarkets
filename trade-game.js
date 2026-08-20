(() => {
  "use strict";

  const GAME_MODES = {
    exportle: {
      id: "exportle",
      name: "Exportle",
      direction: "export",
      valueField: "exportValue",
      dataUrl: "data/trade-game/countries.json?v=2024-1",
      description: "Guess the country from the goods it exports."
    },
    importle: {
      id: "importle",
      name: "Importle",
      direction: "import",
      valueField: "importValue",
      dataUrl: "data/trade-game/imports.json?v=2024-1",
      description: "Guess the country from the goods it imports."
    }
  };
  const requestedGame = new URLSearchParams(window.location.search).get("game");
  const GAME = Object.hasOwn(GAME_MODES, requestedGame) ? GAME_MODES[requestedGame] : GAME_MODES.exportle;
  const DATA_URL = GAME.dataUrl;
  const MAX_GUESSES = 6;
  const DAY_MS = 86_400_000;
  const EPOCH_UTC = Date.UTC(2026, 7, 20);
  const GAME_VERSION = `${GAME.id}-v1`;
  const STATS_KEY = `${GAME_VERSION}:stats`;
  const UNIT_KEY = "trade-games:distance-unit";
  const LEGACY_UNIT_KEY = "export-signal:distance-unit";
  const OVERVIEW_TARGET_COVERAGE = 0.95;
  const OVERVIEW_MIN_SECTIONS = 4;
  const OVERVIEW_MAX_SECTIONS = 8;
  const OVERVIEW_MIN_PRODUCTS_PER_SECTION = 2;
  const OVERVIEW_MAX_PRODUCTS_PER_SECTION = 6;
  const OVERVIEW_PRODUCT_COVERAGE = 0.92;
  const MIN_DISPLAY_SHARE = 0.035;
  const MAX_DISPLAY_SHARE = 0.72;

  const SECTION_COLORS = {
    1: "#7b4b3a",
    2: "#4f7a4f",
    3: "#a66d2f",
    4: "#a34b40",
    5: "#2f5e7a",
    6: "#6b5880",
    7: "#865944",
    8: "#3d7082",
    9: "#967037",
    10: "#91485e",
    11: "#4d6d91",
    12: "#725a43",
    13: "#6c6853",
    14: "#3d786d",
    15: "#627849",
    16: "#45698a",
    17: "#9b5c35",
    18: "#6e5368",
    19: "#647043",
    20: "#7c5847",
    21: "#51626c"
  };

  const SECTION_CODES = {
    1: "AN",
    2: "VE",
    3: "OI",
    4: "FO",
    5: "MI",
    6: "CH",
    7: "PL",
    8: "HI",
    9: "WO",
    10: "PA",
    11: "TX",
    12: "FW",
    13: "ST",
    14: "PR",
    15: "ME",
    16: "MA",
    17: "TR",
    18: "IN",
    19: "WE",
    20: "MS",
    21: "AR"
  };

  const el = {};
  let countries = [];
  let countryLookup = new Map();
  let answer = null;
  let state = null;
  let puzzleNumber = 0;
  let dataMeta = null;
  let selectedSectionId = null;
  let distanceUnit = "km";
  let suggestionMatches = [];
  let activeSuggestion = -1;
  let resizeTimer = null;
  let toastTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    Object.assign(el, {
      todayLabel: $("today-label"),
      pageTitle: $("page-title"),
      gameDescription: $("game-description"),
      dataYear: $("data-year"),
      figureYear: $("figure-year"),
      puzzleNumber: $("puzzle-number"),
      callsLeft: $("calls-left"),
      exportTotal: $("export-total"),
      chartTitle: $("chart-title"),
      chartBack: $("chart-back"),
      chartInstruction: $("chart-instruction"),
      categoryTabs: $("category-tabs"),
      chartLoading: $("chart-loading"),
      chartLoadingCopy: $("chart-loading-copy"),
      treemap: $("treemap"),
      attemptTrack: document.querySelectorAll(".attempt-track span"),
      form: $("guess-form"),
      input: $("country-input"),
      combobox: $("country-combobox"),
      suggestions: $("country-suggestions"),
      submit: document.querySelector(".submit-guess"),
      formMessage: $("form-message"),
      emptyLog: $("empty-log"),
      guessList: $("guess-list"),
      giveUp: $("give-up"),
      openHelp: $("open-help"),
      unitButtons: document.querySelectorAll("[data-distance-unit]"),
      gameLinks: document.querySelectorAll("[data-game-link]"),
      upcomingGames: document.querySelectorAll("[data-upcoming-game]"),
      completedCard: $("completed-card"),
      completedSummary: $("completed-summary"),
      viewResult: $("view-result"),
      resultDialog: $("result-dialog"),
      helpDialog: $("help-dialog"),
      resultKicker: $("result-kicker"),
      answerFlag: $("answer-flag"),
      answerName: $("answer-name"),
      answerContext: $("answer-context"),
      answerProducts: $("answer-products"),
      statPlayed: $("stat-played"),
      statWinRate: $("stat-win-rate"),
      statStreak: $("stat-streak"),
      statMaxStreak: $("stat-max-streak"),
      shareResult: $("share-result"),
      shareStatus: $("share-status"),
      helpOverview: $("help-overview"),
      toast: $("toast")
    });
  }

  function directionWord() {
    return GAME.direction === "import" ? "imports" : "exports";
  }

  function totalTradeValue(country) {
    return Number(country?.[GAME.valueField]) || 0;
  }

  function applyGameMode() {
    const tradeWord = directionWord();
    document.title = `${GAME.name} — Liberal Markets Games`;
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      `Study an ${GAME.direction} basket and identify the mystery economy in six guesses.`
    );
    el.pageTitle.textContent = GAME.name;
    el.gameDescription.textContent = GAME.description;
    el.chartBack.textContent = `← All ${tradeWord}`;
    el.chartTitle.textContent = `Top ${GAME.direction} categories`;
    el.chartLoadingCopy.textContent = `Loading ${tradeWord}…`;
    el.categoryTabs.setAttribute("aria-label", `Choose an ${GAME.direction} category`);
    el.treemap.setAttribute("aria-label", `${GAME.name} products grouped by category`);
    el.chartInstruction.textContent = `Leading categories are fitted to the chart; labels show their true ${GAME.direction} shares.`;
    el.helpOverview.textContent = `The overview emphasizes leading ${GAME.direction} categories. Tile areas are fitted for readability; printed percentages are the true shares.`;

    el.gameLinks.forEach((link) => {
      const isActive = link.dataset.gameLink === GAME.id;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#039;",
      '"': "&quot;"
    })[character]);
  }

  function normalize(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase();
  }

  function flagEmoji(iso2) {
    if (!/^[A-Z]{2}$/.test(iso2 || "")) return "◉";
    return [...iso2].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
  }

  function formatMoney(value) {
    if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}tn`;
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(value >= 100_000_000_000 ? 0 : 1)}bn`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}mn`;
    return `$${Math.round(value).toLocaleString()}`;
  }

  function loadDistanceUnit() {
    try {
      const saved = localStorage.getItem(UNIT_KEY) || localStorage.getItem(LEGACY_UNIT_KEY);
      return saved === "mi" ? "mi" : "km";
    } catch {
      return "km";
    }
  }

  function renderDistanceUnitControl() {
    el.unitButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.distanceUnit === distanceUnit));
    });
  }

  function setDistanceUnit(unit) {
    if (!['km', 'mi'].includes(unit)) return;
    distanceUnit = unit;
    try {
      localStorage.setItem(UNIT_KEY, unit);
    } catch {
      // The preference simply resets when storage is unavailable.
    }
    renderDistanceUnitControl();
    if (state) renderGuesses();
  }

  function formatDistance(distanceKm) {
    const value = distanceUnit === "mi" ? distanceKm * 0.621371 : distanceKm;
    return `${Math.round(value).toLocaleString()} ${distanceUnit}`;
  }

  function hashSeed(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleForCycle(list, cycle) {
    const shuffled = [...list].sort((a, b) => a.iso3.localeCompare(b.iso3));
    const random = seededRandom(hashSeed(`${GAME_VERSION}:${cycle}`));
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return shuffled;
  }

  function selectAnswer() {
    puzzleNumber = Math.max(1, Math.floor((Date.now() - EPOCH_UTC) / DAY_MS) + 1);
    const index = (puzzleNumber - 1) % countries.length;
    const cycle = Math.floor((puzzleNumber - 1) / countries.length);
    const shuffled = shuffleForCycle(countries, cycle);
    const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const requested = localPreview && new URLSearchParams(window.location.search).get("economy");
    const override = requested && countries.find((country) => country.iso3 === requested.toUpperCase());
    answer = override || shuffled[index];
  }

  function stateKey() {
    return `${GAME_VERSION}:puzzle:${puzzleNumber}:${answer.iso3}`;
  }

  function loadState() {
    const fallback = {
      puzzleNumber,
      answer: answer.iso3,
      guesses: [],
      finished: false,
      won: false,
      gaveUp: false,
      recorded: false
    };

    try {
      const stored = JSON.parse(localStorage.getItem(stateKey()));
      if (!stored || stored.answer !== answer.iso3 || !Array.isArray(stored.guesses)) return fallback;
      return { ...fallback, ...stored, guesses: stored.guesses.slice(0, MAX_GUESSES) };
    } catch {
      return fallback;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(stateKey(), JSON.stringify(state));
    } catch {
      // Storage is optional; the current round still works without it.
    }
  }

  function buildCountryLookup() {
    countryLookup = new Map();
    for (const country of countries) {
      const labels = [country.name, country.iso2, country.iso3, ...(country.aliases || [])];
      for (const label of labels) {
        if (label) countryLookup.set(normalize(label), country);
      }
    }
  }

  function matchingCountries(value) {
    const query = normalize(value);
    if (!query) return countries.slice(0, 8);

    return countries
      .map((country) => {
        const name = normalize(country.name);
        const aliases = (country.aliases || []).map(normalize);
        let score = 99;
        if (name === query) score = 0;
        else if (name.startsWith(query)) score = 1;
        else if (aliases.some((alias) => alias.startsWith(query))) score = 2;
        else if (name.includes(query)) score = 3;
        else if (aliases.some((alias) => alias.includes(query))) score = 4;
        return { country, score };
      })
      .filter((match) => match.score < 99)
      .sort((a, b) => a.score - b.score || a.country.name.localeCompare(b.country.name))
      .slice(0, 8)
      .map((match) => match.country);
  }

  function closeSuggestions() {
    suggestionMatches = [];
    activeSuggestion = -1;
    el.suggestions.hidden = true;
    el.input.setAttribute("aria-expanded", "false");
    el.input.setAttribute("aria-activedescendant", "");
  }

  function updateActiveSuggestion() {
    const options = el.suggestions.querySelectorAll("[role='option']");
    options.forEach((option, index) => {
      const active = index === activeSuggestion;
      option.classList.toggle("is-active", active);
      option.setAttribute("aria-selected", String(active));
    });
    const active = options[activeSuggestion];
    el.input.setAttribute("aria-activedescendant", active ? active.id : "");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function renderSuggestions() {
    suggestionMatches = matchingCountries(el.input.value);
    activeSuggestion = suggestionMatches.length ? 0 : -1;

    if (!suggestionMatches.length || state?.finished) {
      closeSuggestions();
      return;
    }

    el.suggestions.innerHTML = suggestionMatches.map((country, index) => `
      <li
        class="country-suggestion${index === activeSuggestion ? " is-active" : ""}"
        id="country-option-${country.iso3}"
        role="option"
        aria-selected="${index === activeSuggestion}"
        data-iso3="${country.iso3}"
      >
        <span class="suggestion-name"><span class="suggestion-flag" aria-hidden="true">${flagEmoji(country.iso2)}</span>${escapeHtml(country.name)}</span>
        <span class="suggestion-continent">${escapeHtml(country.continent)}</span>
      </li>
    `).join("");
    el.suggestions.hidden = false;
    el.input.setAttribute("aria-expanded", "true");
    updateActiveSuggestion();
  }

  function chooseSuggestion(country) {
    if (!country) return;
    el.input.value = country.name;
    el.formMessage.textContent = "";
    closeSuggestions();
    el.input.focus();
  }

  function handleSuggestionKeys(event) {
    const open = !el.suggestions.hidden && suggestionMatches.length > 0;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) renderSuggestions();
      else {
        activeSuggestion = (activeSuggestion + 1) % suggestionMatches.length;
        updateActiveSuggestion();
      }
      return;
    }

    if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      activeSuggestion = (activeSuggestion - 1 + suggestionMatches.length) % suggestionMatches.length;
      updateActiveSuggestion();
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeSuggestions();
      return;
    }

    if (event.key === "Enter" && open && activeSuggestion >= 0) {
      const selected = suggestionMatches[activeSuggestion];
      if (normalize(el.input.value) !== normalize(selected.name)) {
        event.preventDefault();
        chooseSuggestion(selected);
      } else {
        closeSuggestions();
      }
    }
  }

  function tradeSections(country) {
    const sections = new Map();

    for (const product of country.products) {
      if (!sections.has(product.sectionId)) {
        sections.set(product.sectionId, {
          sectionId: product.sectionId,
          name: product.section,
          value: 0,
          products: []
        });
      }
      const section = sections.get(product.sectionId);
      section.value += product.value;
      section.products.push(product);
    }

    return [...sections.values()]
      .map((section) => ({
        ...section,
        share: section.value / totalTradeValue(country),
        products: section.products.sort((a, b) => b.value - a.value)
      }))
      .sort((a, b) => b.value - a.value);
  }

  function chooseOverviewSections(sections) {
    const visible = [];
    let coverage = 0;

    for (const section of sections) {
      if (visible.length >= OVERVIEW_MAX_SECTIONS) break;
      visible.push(section);
      coverage += section.share;
      if (visible.length >= OVERVIEW_MIN_SECTIONS && coverage >= OVERVIEW_TARGET_COVERAGE) break;
    }

    return { sections: visible, coverage };
  }

  function chooseOverviewProducts(section) {
    const visible = [];
    let value = 0;
    const sectionValue = section.actualValue ?? section.value;

    for (const product of section.products) {
      if (visible.length >= OVERVIEW_MAX_PRODUCTS_PER_SECTION) break;
      visible.push(product);
      value += product.value;
      const coverage = sectionValue > 0 ? value / sectionValue : 1;
      if (visible.length >= OVERVIEW_MIN_PRODUCTS_PER_SECTION && coverage >= OVERVIEW_PRODUCT_COVERAGE) break;
    }

    return visible;
  }

  function bestFitDisplayShares(sections, coverage) {
    const rawShares = sections.map((section) => section.share / coverage);
    const result = new Array(rawShares.length).fill(null);
    let active = rawShares.map((_, index) => index);
    let remaining = 1;

    for (let guard = 0; guard < rawShares.length + 2 && active.length; guard += 1) {
      const activeTotal = active.reduce((sum, index) => sum + rawShares[index], 0);
      const provisional = active.map((index) => ({
        index,
        value: activeTotal > 0 ? remaining * rawShares[index] / activeTotal : remaining / active.length
      }));
      const constrained = provisional.filter(({ value }) => value < MIN_DISPLAY_SHARE || value > MAX_DISPLAY_SHARE);

      if (!constrained.length) {
        provisional.forEach(({ index, value }) => { result[index] = value; });
        active = [];
        break;
      }

      constrained.forEach(({ index, value }) => {
        result[index] = value < MIN_DISPLAY_SHARE ? MIN_DISPLAY_SHARE : MAX_DISPLAY_SHARE;
      });
      const constrainedIds = new Set(constrained.map(({ index }) => index));
      active = active.filter((index) => !constrainedIds.has(index));
      remaining = Math.max(0, 1 - result.reduce((sum, value) => sum + (value || 0), 0));
    }

    if (active.length) {
      const share = remaining / active.length;
      active.forEach((index) => { result[index] = share; });
    }

    return result;
  }

  function binaryTreemap(items, x, y, width, height, output = []) {
    if (!items.length || width <= 0 || height <= 0) return output;
    if (items.length === 1) {
      output.push({ ...items[0], x, y, width, height });
      return output;
    }

    const total = items.reduce((sum, item) => sum + item.value, 0);
    const half = total / 2;
    let running = 0;
    let splitIndex = 1;
    let closest = Infinity;

    for (let index = 0; index < items.length - 1; index += 1) {
      running += items[index].value;
      const difference = Math.abs(half - running);
      if (difference < closest) {
        closest = difference;
        splitIndex = index + 1;
      }
    }

    const first = items.slice(0, splitIndex);
    const second = items.slice(splitIndex);
    const firstTotal = first.reduce((sum, item) => sum + item.value, 0);
    const ratio = total > 0 ? firstTotal / total : 0.5;

    if (width >= height) {
      const firstWidth = width * ratio;
      binaryTreemap(first, x, y, firstWidth, height, output);
      binaryTreemap(second, x + firstWidth, y, width - firstWidth, height, output);
    } else {
      const firstHeight = height * ratio;
      binaryTreemap(first, x, y, width, firstHeight, output);
      binaryTreemap(second, x, y + firstHeight, width, height - firstHeight, output);
    }

    return output;
  }

  function shadeColor(hex, factor) {
    const clean = hex.replace("#", "");
    const red = Math.min(255, Math.max(0, Math.round(Number.parseInt(clean.slice(0, 2), 16) * factor)));
    const green = Math.min(255, Math.max(0, Math.round(Number.parseInt(clean.slice(2, 4), 16) * factor)));
    const blue = Math.min(255, Math.max(0, Math.round(Number.parseInt(clean.slice(4, 6), 16) * factor)));
    return `rgb(${red}, ${green}, ${blue})`;
  }

  function zoomToSection(sectionId) {
    selectedSectionId = Number(sectionId);
    renderTreemap();
  }

  function showAllSections() {
    selectedSectionId = null;
    renderTreemap();
  }

  function renderCategoryTabs(sections) {
    const ordered = [...sections].sort((a, b) => a.sectionId - b.sectionId);
    el.categoryTabs.innerHTML = `
      <button
        class="category-tab all-tab${selectedSectionId === null ? " is-active" : ""}"
        type="button"
        data-category-id="all"
        aria-label="Show all ${GAME.direction} categories"
        aria-pressed="${selectedSectionId === null}"
        title="All ${GAME.direction} categories"
      >ALL</button>
      ${ordered.map((section) => `
        <button
          class="category-tab${selectedSectionId === section.sectionId ? " is-active" : ""}"
          type="button"
          data-category-id="${section.sectionId}"
          aria-label="Show ${escapeHtml(section.name)}"
          aria-pressed="${selectedSectionId === section.sectionId}"
          title="${escapeHtml(section.name)} · ${(section.share * 100).toFixed(1)}%"
          style="--tab-color:${SECTION_COLORS[section.sectionId] || "#5d666b"}"
        >${SECTION_CODES[section.sectionId] || String(section.sectionId)}</button>
      `).join("")}
    `;
  }

  function renderTreemap() {
    if (!answer || !el.treemap) return;
    const width = el.treemap.clientWidth;
    const height = el.treemap.clientHeight;
    if (!width || !height) return;

    const sections = tradeSections(answer);
    const selected = sections.find((section) => section.sectionId === selectedSectionId);
    const isOverview = !selected;
    const overview = chooseOverviewSections(sections);
    const layout = [];
    const outlines = [];

    if (isOverview) {
      const displayShares = bestFitDisplayShares(overview.sections, overview.coverage);
      const displaySections = overview.sections.map((section, index) => ({
        ...section,
        actualValue: section.value,
        value: displayShares[index]
      }));
      const sectionLayout = binaryTreemap(displaySections, 0, 0, width, height);
      sectionLayout.forEach((sectionRect) => {
        outlines.push(sectionRect);
        const inset = 1.5;
        const overviewProducts = chooseOverviewProducts(sectionRect);
        const productLayout = binaryTreemap(
          overviewProducts,
          sectionRect.x + inset,
          sectionRect.y + inset,
          Math.max(0, sectionRect.width - inset * 2),
          Math.max(0, sectionRect.height - inset * 2)
        );
        productLayout.forEach((product, productIndex) => {
          layout.push({
            ...product,
            sectionName: sectionRect.name,
            productIndex,
            categoryLead: productIndex === 0
          });
        });
      });
    } else {
      binaryTreemap(selected.products, 0, 0, width, height).forEach((product, productIndex) => {
        layout.push({ ...product, productIndex, sectionName: selected.name });
      });
    }

    const fragment = document.createDocumentFragment();

    layout.forEach((item, index) => {
      const area = item.width * item.height;
      const cell = document.createElement(isOverview ? "button" : "div");
      cell.className = `treemap-cell ${isOverview ? "is-overview-product" : "is-product"}`;
      if (area < 1200 || item.width < 42 || item.height < 29) cell.classList.add("is-tiny");
      else if (area < 4000 || item.width < 78 || item.height < 50) cell.classList.add("is-small");
      else if (area < 10_000 || item.width < 125 || item.height < 75) cell.classList.add("is-medium");
      cell.style.left = `${item.x}px`;
      cell.style.top = `${item.y}px`;
      cell.style.width = `${item.width}px`;
      cell.style.height = `${item.height}px`;
      const baseColor = SECTION_COLORS[item.sectionId] || "#5d666b";
      const shade = 0.88 + (item.productIndex % 5) * 0.035;
      cell.style.backgroundColor = shadeColor(baseColor, shade);
      cell.style.setProperty("--label-size", `${Math.max(8, Math.min(40, Math.sqrt(area) / 7.5)).toFixed(1)}px`);
      cell.style.setProperty("--value-size", `${Math.max(8, Math.min(20, Math.sqrt(area) / 13)).toFixed(1)}px`);

      if (isOverview) {
        cell.type = "button";
        cell.dataset.sectionId = String(item.sectionId);
        cell.title = `${item.name} · ${(item.share * 100).toFixed(1)}% · ${item.sectionName}`;
        cell.setAttribute("aria-label", cell.title);
        cell.innerHTML = `
          <span class="cell-hint">${item.categoryLead ? escapeHtml(item.sectionName) : `HS ${escapeHtml(item.code)}`}</span>
          <strong class="cell-name">${escapeHtml(item.name)}</strong>
          <span class="cell-value"><span>${(item.share * 100).toFixed(1)}%</span><span>${formatMoney(item.value)}</span></span>
        `;
      } else {
        cell.tabIndex = 0;
        cell.title = `${item.name} · ${(item.share * 100).toFixed(1)}% of all ${directionWord()} · ${selected.name}`;
        cell.setAttribute("aria-label", cell.title);
        cell.innerHTML = `
          <span class="cell-hint">HS ${escapeHtml(item.code)}</span>
          <strong class="cell-name">${escapeHtml(item.name)}</strong>
          <span class="cell-value"><span>${(item.share * 100).toFixed(1)}%</span><span>${formatMoney(item.value)}</span></span>
        `;
      }
      fragment.append(cell);
    });

    if (isOverview) {
      outlines.forEach((section) => {
        const outline = document.createElement("div");
        outline.className = "section-outline";
        outline.style.left = `${section.x}px`;
        outline.style.top = `${section.y}px`;
        outline.style.width = `${section.width}px`;
        outline.style.height = `${section.height}px`;
        fragment.append(outline);
      });
    }

    el.treemap.replaceChildren(fragment);
    el.treemap.setAttribute(
      "aria-label",
      isOverview ? `Leading ${GAME.direction} products grouped by category` : `Products inside ${selected.name}`
    );
    el.chartBack.hidden = isOverview;
    el.chartTitle.textContent = isOverview ? `Top ${GAME.direction} categories` : selected.name;
    el.exportTotal.textContent = isOverview
      ? `${formatMoney(totalTradeValue(answer))} in goods ${directionWord()}`
      : `${formatMoney(selected.value)} · ${(selected.share * 100).toFixed(1)}% of all ${directionWord()}`;
    el.chartInstruction.textContent = isOverview
      ? `Showing ${overview.sections.length} leading categories (${(overview.coverage * 100).toFixed(1)}% of recorded ${directionWord()}). Areas are fitted for clarity; labels show true shares.`
      : `${selected.products.length} products in this category. Percentages remain shares of all ${directionWord()}.`;
    renderCategoryTabs(sections);
    el.chartLoading.classList.add("is-hidden");
  }

  function radians(degrees) {
    return degrees * Math.PI / 180;
  }

  function clueFor(guess) {
    if (guess.iso3 === answer.iso3) {
      return { distanceKm: 0, bearing: 0, direction: "HERE", proximity: 100, correct: true };
    }

    const lat1 = radians(guess.latitude);
    const lat2 = radians(answer.latitude);
    const longitudeDelta = radians(answer.longitude - guess.longitude);
    const latitudeDelta = lat2 - lat1;
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(longitudeDelta / 2) ** 2;
    const boundedHaversine = Math.min(1, Math.max(0, haversine));
    const distance = 6371.0088 * 2
      * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));
    const y = Math.sin(longitudeDelta) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2)
      - Math.sin(lat1) * Math.cos(lat2) * Math.cos(longitudeDelta);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const direction = directions[Math.round(bearing / 45) % 8];
    const proximity = Math.max(0, Math.round(100 * (1 - distance / 20015.1)));

    return {
      distanceKm: Math.round(distance),
      bearing: Math.round(bearing),
      direction,
      proximity,
      correct: false
    };
  }

  function renderAttempts() {
    const wonIndex = state.won ? state.guesses.length - 1 : -1;
    el.attemptTrack.forEach((marker, index) => {
      marker.classList.toggle("used", index < state.guesses.length);
      marker.classList.toggle("correct", index === wonIndex);
    });
    el.callsLeft.textContent = state.finished ? "0" : String(MAX_GUESSES - state.guesses.length);
  }

  function renderGuesses() {
    el.emptyLog.hidden = state.guesses.length > 0;
    el.guessList.innerHTML = state.guesses.map((iso3, index) => {
      const country = countries.find((candidate) => candidate.iso3 === iso3);
      if (!country) return "";
      const clue = clueFor(country);
      const signalMarkup = clue.correct
        ? `
          <span class="guess-signal"><strong>${formatDistance(0)}</strong><small>Distance</small></span>
          <span class="guess-signal"><strong class="bearing">● Correct</strong><small>Direction</small></span>
          <span class="guess-signal"><strong>100%</strong><small>Nearness</small></span>
        `
        : `
          <span class="guess-signal"><strong>${formatDistance(clue.distanceKm)}</strong><small>Distance</small></span>
          <span class="guess-signal">
            <strong class="bearing"><i class="bearing-arrow" style="--bearing-angle:${clue.bearing}deg">↑</i>${clue.direction}</strong>
            <small>Direction</small>
          </span>
          <span class="guess-signal"><strong>${clue.proximity}%</strong><small>Nearness</small></span>
        `;

      return `
        <li class="guess-row${clue.correct ? " is-correct" : ""}">
          <div class="guess-country">
            <span class="guess-count">${String(index + 1).padStart(2, "0")}</span>
            <span class="guess-flag" aria-hidden="true">${flagEmoji(country.iso2)}</span>
            <strong>${escapeHtml(country.name)}</strong>
          </div>
          <div class="guess-signals">${signalMarkup}</div>
        </li>
      `;
    }).join("");
  }

  function renderFormState() {
    el.input.disabled = state.finished;
    el.submit.disabled = state.finished;
    el.giveUp.disabled = state.finished;
    el.giveUp.hidden = state.finished;
    el.completedCard.hidden = !state.finished;
    if (state.finished) closeSuggestions();

    if (state.finished) {
      const guessWord = state.guesses.length === 1 ? "guess" : "guesses";
      el.completedSummary.textContent = state.won
        ? `Solved in ${state.guesses.length} ${guessWord} · ${answer.name}`
        : `Answer: ${answer.name}`;
    }
  }

  function renderGame() {
    renderAttempts();
    renderGuesses();
    renderFormState();
  }

  function loadStats() {
    const fallback = {
      played: 0,
      wins: 0,
      currentStreak: 0,
      maxStreak: 0,
      lastWinPuzzle: 0,
      distribution: [0, 0, 0, 0, 0, 0]
    };
    try {
      const stored = JSON.parse(localStorage.getItem(STATS_KEY));
      return stored ? { ...fallback, ...stored } : fallback;
    } catch {
      return fallback;
    }
  }

  function recordResult() {
    if (state.recorded) return;
    const stats = loadStats();
    stats.played += 1;

    if (state.won) {
      stats.wins += 1;
      stats.currentStreak = stats.lastWinPuzzle === puzzleNumber - 1 ? stats.currentStreak + 1 : 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
      stats.lastWinPuzzle = puzzleNumber;
      const attempt = Math.max(0, Math.min(MAX_GUESSES - 1, state.guesses.length - 1));
      stats.distribution[attempt] = (stats.distribution[attempt] || 0) + 1;
    } else {
      stats.currentStreak = 0;
    }

    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {
      // Statistics are optional when storage is unavailable.
    }

    state.recorded = true;
    saveState();
  }

  function renderResult() {
    const stats = loadStats();
    const topProducts = answer.products.slice(0, 3);
    const guessWord = state.guesses.length === 1 ? "guess" : "guesses";
    el.resultKicker.textContent = state.won
      ? `Solved in ${state.guesses.length} ${guessWord}`
      : "Answer revealed";
    el.answerFlag.textContent = flagEmoji(answer.iso2);
    el.answerName.textContent = answer.name;
    el.answerContext.textContent = `${answer.continent} · ${formatMoney(totalTradeValue(answer))} in goods ${directionWord()} · ${dataMeta.year}`;
    el.answerProducts.innerHTML = topProducts.map((product) => `
      <div class="answer-product">
        <span>${escapeHtml(product.name)}</span>
        <strong>${(product.share * 100).toFixed(1)}%</strong>
      </div>
    `).join("");
    el.statPlayed.textContent = stats.played;
    el.statWinRate.textContent = stats.played ? `${Math.round(stats.wins / stats.played * 100)}%` : "0%";
    el.statStreak.textContent = stats.currentStreak;
    el.statMaxStreak.textContent = stats.maxStreak;
    el.shareStatus.textContent = "";
  }

  function showResult() {
    renderResult();
    if (!el.resultDialog.open) el.resultDialog.showModal();
  }

  function finishGame(won, gaveUp = false) {
    state.finished = true;
    state.won = won;
    state.gaveUp = gaveUp;
    saveState();
    recordResult();
    renderGame();
    window.setTimeout(showResult, 300);
  }

  function submitGuess(event) {
    event.preventDefault();
    if (state.finished) return;
    const country = countryLookup.get(normalize(el.input.value));

    if (!country) {
      el.formMessage.textContent = "Choose a country from the suggestions.";
      renderSuggestions();
      el.input.focus();
      return;
    }

    if (state.guesses.includes(country.iso3)) {
      el.formMessage.textContent = `You already guessed ${country.name}.`;
      el.input.select();
      return;
    }

    closeSuggestions();
    state.guesses.push(country.iso3);
    el.formMessage.textContent = "";
    el.input.value = "";
    saveState();
    renderGame();

    if (country.iso3 === answer.iso3) finishGame(true);
    else if (state.guesses.length >= MAX_GUESSES) finishGame(false);
    else el.input.focus();
  }

  function resultGrid() {
    return state.guesses.map((iso3) => {
      const country = countries.find((candidate) => candidate.iso3 === iso3);
      const clue = clueFor(country);
      if (clue.correct) return "🟩";
      if (clue.proximity >= 80) return "🟧";
      if (clue.proximity >= 60) return "🟨";
      if (clue.proximity >= 35) return "🟦";
      return "⬜";
    }).join("");
  }

  function shareText() {
    const score = state.won ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    return [
      `${GAME.name} #${puzzleNumber} ${score}`,
      resultGrid() || "⬜",
      `Guess the country from its ${directionWord()}.`
    ].join("\n");
  }

  async function copyResult() {
    const text = shareText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    el.shareStatus.textContent = "Copied — the answer is not included.";
    showToast("Results copied");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => el.toast.classList.remove("is-visible"), 2000);
  }

  function openHelp() {
    if (!el.helpDialog.open) el.helpDialog.showModal();
  }

  function closeOnBackdrop(dialog, event) {
    if (event.target === dialog) dialog.close();
  }

  function bindEvents() {
    el.form.addEventListener("submit", submitGuess);
    el.input.addEventListener("input", () => {
      el.formMessage.textContent = "";
      renderSuggestions();
    });
    el.input.addEventListener("focus", renderSuggestions);
    el.input.addEventListener("keydown", handleSuggestionKeys);
    el.suggestions.addEventListener("pointerdown", (event) => {
      const option = event.target.closest("[data-iso3]");
      if (!option) return;
      event.preventDefault();
      chooseSuggestion(countries.find((country) => country.iso3 === option.dataset.iso3));
    });
    document.addEventListener("pointerdown", (event) => {
      if (!el.combobox.contains(event.target)) closeSuggestions();
    });
    el.treemap.addEventListener("click", (event) => {
      const group = event.target.closest("[data-section-id]");
      if (group) zoomToSection(group.dataset.sectionId);
    });
    el.categoryTabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-category-id]");
      if (!tab) return;
      if (tab.dataset.categoryId === "all") showAllSections();
      else zoomToSection(tab.dataset.categoryId);
    });
    el.chartBack.addEventListener("click", showAllSections);
    el.unitButtons.forEach((button) => {
      button.addEventListener("click", () => setDistanceUnit(button.dataset.distanceUnit));
    });
    el.upcomingGames.forEach((button) => {
      button.addEventListener("click", () => showToast(`${button.dataset.upcomingGame} is coming soon`));
    });
    el.giveUp.addEventListener("click", () => {
      if (window.confirm("Reveal today’s country and end this game?")) finishGame(false, true);
    });
    el.openHelp.addEventListener("click", openHelp);
    el.viewResult.addEventListener("click", showResult);
    el.shareResult.addEventListener("click", copyResult);
    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => el.resultDialog.close());
    });
    document.querySelectorAll("[data-close-help]").forEach((button) => {
      button.addEventListener("click", () => el.helpDialog.close());
    });
    el.resultDialog.addEventListener("click", (event) => closeOnBackdrop(el.resultDialog, event));
    el.helpDialog.addEventListener("click", (event) => closeOnBackdrop(el.helpDialog, event));
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(renderTreemap, 120);
    });
  }

  function renderMetadata() {
    const now = new Date();
    el.todayLabel.textContent = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(now);
    el.dataYear.textContent = `BACI · ${dataMeta.year}`;
    el.figureYear.textContent = dataMeta.year;
    el.puzzleNumber.textContent = `Puzzle #${puzzleNumber}`;
  }

  function showLoadError(error) {
    console.error(error);
    el.chartLoading.innerHTML = "<p>Trade data unavailable. Please reload.</p>";
    el.exportTotal.textContent = "Could not load trade data";
    el.input.disabled = true;
    el.submit.disabled = true;
  }

  async function init() {
    cacheElements();
    applyGameMode();
    distanceUnit = loadDistanceUnit();
    renderDistanceUnitControl();
    bindEvents();

    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`Trade data request failed (${response.status})`);
      const payload = await response.json();
      if (!Array.isArray(payload.countries) || !payload.countries.length) {
        throw new Error("Trade data contains no countries");
      }
      if (payload.meta?.direction && payload.meta.direction !== GAME.direction) {
        throw new Error(`Expected ${GAME.direction} data but received ${payload.meta.direction} data`);
      }

      dataMeta = payload.meta;
      countries = payload.countries;
      buildCountryLookup();
      selectAnswer();
      state = loadState();
      renderMetadata();
      renderGame();
      window.requestAnimationFrame(renderTreemap);
    } catch (error) {
      showLoadError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
