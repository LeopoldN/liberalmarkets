(() => {
  "use strict";

  const GAME_MODES = {
    exportle: {
      id: "exportle",
      name: "Exportle",
      view: "treemap",
      direction: "export",
      valueField: "exportValue",
      dataUrl: "data/trade-game/countries.json?v=2024-1",
      description: "Guess the country from the goods it exports."
    },
    importle: {
      id: "importle",
      name: "Importle",
      view: "treemap",
      direction: "import",
      valueField: "importValue",
      dataUrl: "data/trade-game/imports.json?v=2024-1",
      description: "Guess the country from the goods it imports."
    },
    truddies: {
      id: "truddies",
      name: "Truddies",
      view: "profile",
      direction: "profile",
      valueField: "tradeValue",
      dataUrl: "data/trade-game/truddies.json?v=2024-1",
      description: "Guess the country from its GDP and leading trading partners."
    },
    "then-now": {
      id: "then-now",
      name: "Then&Now",
      view: "comparison",
      direction: "comparison",
      dataUrl: "data/trade-game/then-now.json?v=1995-2024-1",
      description: "Guess the country from how its exports changed between 1995 and 2024."
    },
    productle: {
      id: "productle",
      name: "Productle",
      view: "category",
      direction: "category",
      dataUrl: "data/trade-game/productle.json?v=2024-1",
      maxGuesses: 5,
      description: "Guess the export category from its share across five countries."
    },
    tradeoffs: {
      id: "tradeoffs",
      name: "Tradeoffs",
      view: "tradeoff",
      direction: "tradeoff",
      dataUrl: "data/trade-game/tradeoffs.json?v=2024-1",
      maxGuesses: 1,
      tracksGuessDistribution: false,
      description: "Choose which matched country exports more of the featured category."
    }
  };
  const requestedGame = new URLSearchParams(window.location.search).get("game");
  const IS_HUB = !Object.hasOwn(GAME_MODES, requestedGame);
  const GAME = IS_HUB ? null : GAME_MODES[requestedGame];
  const DATA_URL = GAME?.dataUrl || "";
  const MAX_GUESSES = GAME?.maxGuesses || 6;
  const DAY_MS = 86_400_000;
  const EPOCH_UTC = Date.UTC(2026, 7, 20);
  const GAME_VERSION = GAME ? `${GAME.id}-v1` : "games-hub-v1";
  const STATS_KEY = `${GAME_VERSION}:stats`;
  const THEME_KEY = "trade-games:theme";
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
  let productleCategories = [];
  let tradeoffMatchups = [];
  let countryLookup = new Map();
  let answer = null;
  let state = null;
  let puzzleNumber = 0;
  let dataMeta = null;
  let selectedSectionId = null;
  let colorTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let distanceUnit = "km";
  let suggestionMatches = [];
  let activeSuggestion = -1;
  let resizeTimer = null;
  let toastTimer = null;
  let selectedStatsGameId = GAME?.tracksGuessDistribution === false ? "exportle" : (GAME?.id || "exportle");

  function $(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    Object.assign(el, {
      skipLink: document.querySelector(".skip-link"),
      gamesHub: $("games-hub"),
      hubPuzzleNumber: $("hub-puzzle-number"),
      gameShell: $("game"),
      gameFooter: $("game-footer"),
      hubFooter: $("hub-footer"),
      todayLabel: $("today-label"),
      pageTitle: $("page-title"),
      gameDescription: $("game-description"),
      puzzleHeading: $("puzzle-heading"),
      dataYear: $("data-year"),
      dataSourceCopy: $("data-source-copy"),
      figureYear: $("figure-year"),
      puzzleNumber: $("puzzle-number"),
      callsLeft: $("calls-left"),
      guessLabel: $("guess-label"),
      exportTotal: $("export-total"),
      chartTitle: $("chart-title"),
      chartBack: $("chart-back"),
      chartInstruction: $("chart-instruction"),
      categoryTabs: $("category-tabs"),
      chartLoading: $("chart-loading"),
      chartLoadingCopy: $("chart-loading-copy"),
      treemapWrap: $("treemap-wrap"),
      treemap: $("treemap"),
      tradeProfile: $("trade-profile"),
      gdpValue: $("gdp-value"),
      gdpYear: $("gdp-year"),
      partnerList: $("partner-list"),
      periodComparison: $("period-comparison"),
      thenHeading: $("then-heading"),
      nowHeading: $("now-heading"),
      thenTotal: $("then-total"),
      nowTotal: $("now-total"),
      thenCategoryList: $("then-category-list"),
      nowCategoryList: $("now-category-list"),
      productleClue: $("productle-clue"),
      productleCountryList: $("productle-country-list"),
      productleGuess: $("productle-guess"),
      productleWordBank: $("productle-word-bank"),
      productleGuessesLeft: $("productle-guesses-left"),
      productleMessage: $("productle-message"),
      productleGiveUp: $("productle-give-up"),
      tradeoffClue: $("tradeoff-clue"),
      tradeoffCategoryName: $("tradeoff-category-name"),
      tradeoffCountries: $("tradeoff-countries"),
      tradeoffFeedback: $("tradeoff-feedback"),
      tradeoffGiveUp: $("tradeoff-give-up"),
      attemptTrackContainer: document.querySelector(".attempt-track"),
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
      secondaryActions: $("secondary-actions"),
      calls: $("calls"),
      openHelp: $("open-help"),
      openStats: $("open-stats"),
      themeToggle: $("theme-toggle"),
      unitButtons: document.querySelectorAll("[data-distance-unit]"),
      gameLinks: document.querySelectorAll("[data-game-link]"),
      upcomingGames: document.querySelectorAll("[data-upcoming-game]"),
      completedCard: $("completed-card"),
      completedSummary: $("completed-summary"),
      viewResult: $("view-result"),
      resultDialog: $("result-dialog"),
      statsDialog: $("stats-dialog"),
      statsGameGrid: $("stats-game-grid"),
      statsGameTabs: $("stats-game-tabs"),
      distributionChart: $("distribution-chart"),
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
      helpDetail: $("help-detail"),
      helpGuess: $("help-guess"),
      helpUnits: $("help-units"),
      helpLimit: $("help-limit"),
      toast: $("toast")
    });
  }

  function currentPuzzleNumber() {
    return Math.max(1, Math.floor((Date.now() - EPOCH_UTC) / DAY_MS) + 1);
  }

  function renderHub() {
    const today = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date());
    document.title = "Games — Liberal Markets";
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      "Play six daily games about countries, products, and the relationships that shape world trade."
    );
    el.skipLink.href = "#games-hub";
    el.skipLink.textContent = "Skip to games";
    el.hubPuzzleNumber.textContent = `${today} · Puzzle #${currentPuzzleNumber()}`;
  }

  function directionWord() {
    return GAME.direction === "import" ? "imports" : "exports";
  }

  function totalTradeValue(country) {
    return Number(country?.[GAME.valueField]) || 0;
  }

  function applyGameMode() {
    const isProfile = GAME.view === "profile";
    const isComparison = GAME.view === "comparison";
    const isCategory = GAME.view === "category";
    const isTradeoff = GAME.view === "tradeoff";
    const usesTreemap = GAME.view === "treemap";
    const tradeWord = directionWord();
    document.title = `${GAME.name} — Liberal Markets Games`;
    let metaDescription = `Study an ${GAME.direction} basket and identify the mystery economy in six guesses.`;
    if (isProfile) metaDescription = "Study a country’s GDP and leading trade relationships, then identify it in six guesses.";
    if (isComparison) metaDescription = "Compare a country’s 1995 and 2024 export structures, then identify it in six guesses.";
    if (isCategory) metaDescription = "Compare five countries’ export shares and identify the common broad product category in five guesses.";
    if (isTradeoff) metaDescription = "Choose which of two closely matched countries exports more of a featured top product category.";
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      metaDescription
    );
    el.pageTitle.textContent = GAME.name;
    el.gameDescription.textContent = GAME.description;
    el.tradeProfile.hidden = !isProfile;
    el.periodComparison.hidden = !isComparison;
    el.productleClue.hidden = !isCategory;
    el.productleGuess.hidden = !isCategory;
    el.tradeoffClue.hidden = !isTradeoff;
    el.treemapWrap.hidden = !usesTreemap;
    el.categoryTabs.hidden = !usesTreemap;
    el.chartInstruction.hidden = usesTreemap || isTradeoff;
    el.exportTotal.hidden = isTradeoff;
    el.form.hidden = isCategory || isTradeoff;
    el.secondaryActions.hidden = isCategory || isTradeoff;
    el.calls.hidden = isCategory || isTradeoff;
    el.attemptTrackContainer.setAttribute(
      "aria-label",
      isTradeoff ? "One available choice" : `${MAX_GUESSES} available guesses`
    );
    el.attemptTrackContainer.style.gridTemplateColumns = `repeat(${MAX_GUESSES}, 1fr)`;
    el.attemptTrack.forEach((marker, index) => { marker.hidden = index >= MAX_GUESSES; });
    el.guessLabel.textContent = isTradeoff ? "choice remaining" : "guesses left";

    if (isTradeoff) {
      el.puzzleHeading.textContent = "Who exported more?";
      el.chartBack.hidden = true;
      el.chartTitle.textContent = "Brothers in Trade";
      el.exportTotal.textContent = "";
      el.helpOverview.textContent = "Two countries are matched because their total 2024 goods exports are within 10% of each other.";
      el.helpDetail.textContent = "A category that ranks in both countries’ top five is selected for the matchup.";
      el.helpGuess.textContent = "Choose the country that exported more of the featured category.";
      el.helpUnits.textContent = "After your choice, both category export values and shares are revealed.";
      el.helpLimit.textContent = "You get one choice per daily puzzle.";
    } else if (isCategory) {
      el.puzzleHeading.textContent = "Which export category is this?";
      el.chartBack.hidden = true;
      el.chartTitle.textContent = "Five-country signal";
      el.exportTotal.textContent = "One hidden top export category";
      el.chartInstruction.textContent = "Each figure is the unknown category’s share of that country’s total goods exports.";
      el.helpOverview.textContent = "Five countries show the percentage of their goods exports belonging to one hidden broad category.";
      el.helpDetail.textContent = "The hidden category ranks among the top five export categories for every country shown.";
      el.helpGuess.textContent = "Choose from the category word bank. Every incorrect choice is grayed out.";
      el.helpUnits.textContent = "A new category and five new countries are selected for each daily puzzle.";
      el.helpLimit.textContent = "Find the category in five guesses.";
    } else if (isProfile) {
      el.puzzleHeading.textContent = "Which country is this?";
      el.chartBack.hidden = true;
      el.chartTitle.textContent = "Economic snapshot";
      el.exportTotal.textContent = "GDP and goods trade";
      el.chartInstruction.textContent = "Partners are ranked by combined imports and exports. GDP is shown in current US dollars.";
      el.helpOverview.textContent = "Use the country’s nominal GDP and five leading trading partners as your clues.";
      el.helpDetail.textContent = "Partners are ranked by the value of combined goods imports and exports.";
    } else if (isComparison) {
      el.puzzleHeading.textContent = "Which country is this?";
      el.chartBack.hidden = true;
      el.chartTitle.textContent = "Export transformation";
      el.exportTotal.textContent = "29 years of structural change";
      el.chartInstruction.textContent = "Categories are ranked within each year. Percentages show their share of that year’s goods exports.";
      el.helpOverview.textContent = "Compare the country’s total goods exports and five leading export categories in 1995 and 2024.";
      el.helpDetail.textContent = "The same category colors are used in both columns so changes are easier to spot.";
    } else {
      el.puzzleHeading.textContent = "Which country is this?";
      el.chartBack.textContent = `← All ${tradeWord}`;
      el.chartTitle.textContent = `Top ${GAME.direction} categories`;
      el.chartLoadingCopy.textContent = `Loading ${tradeWord}…`;
      el.categoryTabs.setAttribute("aria-label", `Choose an ${GAME.direction} category`);
      el.treemap.setAttribute("aria-label", `${GAME.name} products grouped by category`);
      el.chartInstruction.textContent = `Leading categories are fitted to the chart; labels show their true ${GAME.direction} shares.`;
      el.helpOverview.textContent = `The overview emphasizes leading ${GAME.direction} categories. Tile areas are fitted for readability; printed percentages are the true shares.`;
      el.helpDetail.textContent = "Use the color bar to open any category, including categories omitted from the overview.";
    }

    if (!isCategory && !isTradeoff) {
      el.helpGuess.textContent = "Guess a country. A wrong guess shows the distance and direction to the answer.";
      el.helpUnits.textContent = "Use KM or MI in the header to choose your distance unit.";
      el.helpLimit.textContent = "Find the country in six guesses.";
    }

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

  function formatMoneyLong(value) {
    if (value >= 1_000_000_000_000) {
      return `$${Number((value / 1_000_000_000_000).toFixed(2)).toLocaleString()} trillion`;
    }
    if (value >= 1_000_000_000) {
      return `$${Number((value / 1_000_000_000).toFixed(1)).toLocaleString()} billion`;
    }
    if (value >= 1_000_000) {
      return `$${Math.round(value / 1_000_000).toLocaleString()} million`;
    }
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

  function loadTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  }

  function renderThemeControl() {
    const isDark = colorTheme === "dark";
    document.documentElement.dataset.theme = colorTheme;
    el.themeToggle.setAttribute("aria-pressed", String(isDark));
    el.themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      isDark ? "#151515" : "#ffffff"
    );
  }

  function setTheme(theme) {
    if (!["dark", "light"].includes(theme)) return;
    colorTheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // The first-visit dark default is used when storage is unavailable.
    }
    renderThemeControl();
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

  function shuffleWithSeed(list, seed, keySelector) {
    const shuffled = [...list].sort((a, b) => String(keySelector(a)).localeCompare(String(keySelector(b))));
    const random = seededRandom(hashSeed(seed));
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return shuffled;
  }

  function selectAnswer() {
    puzzleNumber = currentPuzzleNumber();
    if (GAME.view === "tradeoff") {
      const index = (puzzleNumber - 1) % tradeoffMatchups.length;
      const cycle = Math.floor((puzzleNumber - 1) / tradeoffMatchups.length);
      const shuffledMatchups = shuffleWithSeed(
        tradeoffMatchups,
        `${GAME_VERSION}:matchups:${cycle}`,
        (matchup) => matchup.id
      );
      const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
      const params = new URLSearchParams(window.location.search);
      const requestedMatchup = localPreview && params.get("matchup")?.toUpperCase();
      const overrideMatchup = requestedMatchup
        && tradeoffMatchups.find((matchup) => matchup.id === requestedMatchup);
      const selected = overrideMatchup || shuffledMatchups[index];
      const shuffledCategories = shuffleWithSeed(
        selected.categories,
        `${GAME_VERSION}:puzzle:${puzzleNumber}:matchup:${selected.id}`,
        (category) => category.sectionId
      );
      const requestedCategory = localPreview && Number(params.get("category"));
      const overrideCategory = requestedCategory
        && selected.categories.find((category) => category.sectionId === requestedCategory);
      const category = overrideCategory || shuffledCategories[0];
      const displayCountries = shuffleWithSeed(
        selected.countries,
        `${GAME_VERSION}:puzzle:${puzzleNumber}:matchup:${selected.id}:sides`,
        (country) => country.iso3
      ).map((country) => {
        const sourceIndex = selected.countries.findIndex((candidate) => candidate.iso3 === country.iso3);
        return {
          ...country,
          categoryValue: category.values[sourceIndex],
          categoryShare: category.shares[sourceIndex],
          categoryRank: category.ranks[sourceIndex]
        };
      });
      answer = {
        id: selected.id,
        totalRatio: selected.totalRatio,
        countries: displayCountries,
        category,
        winnerIso3: category.winnerIso3
      };
      return;
    }

    if (GAME.view === "category") {
      const index = (puzzleNumber - 1) % productleCategories.length;
      const cycle = Math.floor((puzzleNumber - 1) / productleCategories.length);
      const shuffledCategories = shuffleWithSeed(
        productleCategories,
        `${GAME_VERSION}:categories:${cycle}`,
        (category) => category.sectionId
      );
      const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
      const requested = localPreview && Number(new URLSearchParams(window.location.search).get("category"));
      const override = requested && productleCategories.find((category) => category.sectionId === requested);
      const selected = override || shuffledCategories[index];
      const clueCountries = shuffleWithSeed(
        selected.countries,
        `${GAME_VERSION}:puzzle:${puzzleNumber}:section:${selected.sectionId}`,
        (country) => country.iso3
      ).slice(0, dataMeta.clueCountryCount || 5);
      answer = { ...selected, clueCountries };
      return;
    }

    const index = (puzzleNumber - 1) % countries.length;
    const cycle = Math.floor((puzzleNumber - 1) / countries.length);
    const shuffled = shuffleForCycle(countries, cycle);
    const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const requested = localPreview && new URLSearchParams(window.location.search).get("economy");
    const override = requested && countries.find((country) => country.iso3 === requested.toUpperCase());
    answer = override || shuffled[index];
  }

  function answerKey() {
    if (GAME.view === "tradeoff") return `matchup-${answer.id}-section-${answer.category.sectionId}`;
    if (GAME.view === "category") return `section-${answer.sectionId}`;
    return answer.iso3;
  }

  function stateKey() {
    return `${GAME_VERSION}:puzzle:${puzzleNumber}:${answerKey()}`;
  }

  function loadState() {
    const fallback = {
      puzzleNumber,
      answer: answerKey(),
      guesses: [],
      finished: false,
      won: false,
      gaveUp: false,
      recorded: false
    };

    try {
      const stored = JSON.parse(localStorage.getItem(stateKey()));
      if (!stored || stored.answer !== answerKey() || !Array.isArray(stored.guesses)) return fallback;
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
    if (GAME.view !== "treemap" || !answer || !el.treemap) return;
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
      ? `Total ${directionWord()} · ${formatMoneyLong(totalTradeValue(answer))}`
      : `${formatMoneyLong(selected.value)} · ${(selected.share * 100).toFixed(1)}% of all ${directionWord()}`;
    el.chartInstruction.textContent = isOverview
      ? `Showing ${overview.sections.length} leading categories (${(overview.coverage * 100).toFixed(1)}% of recorded ${directionWord()}). Areas are fitted for clarity; labels show true shares.`
      : `${selected.products.length} products in this category. Percentages remain shares of all ${directionWord()}.`;
    renderCategoryTabs(sections);
    el.chartLoading.classList.add("is-hidden");
  }

  function renderTradeProfile() {
    if (GAME.view !== "profile" || !answer) return;
    el.gdpValue.textContent = formatMoney(answer.gdpValue);
    el.gdpYear.textContent = `Current US dollars · ${dataMeta.year}`;
    el.partnerList.innerHTML = answer.partners.map((partner, index) => `
      <li>
        <span class="partner-rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="partner-flag" aria-hidden="true">${flagEmoji(partner.iso2)}</span>
        <strong class="partner-name">${escapeHtml(partner.name)}</strong>
      </li>
    `).join("");
    el.tradeProfile.setAttribute(
      "aria-label",
      `Nominal GDP ${formatMoney(answer.gdpValue)}. Top trading partners: ${answer.partners.map((partner) => partner.name).join(", ")}.`
    );
  }

  function renderPeriodCategoryList(list, categories) {
    list.innerHTML = categories.map((category, index) => `
      <li>
        <span class="period-category-rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="period-category-dot" style="--category-color:${SECTION_COLORS[category.sectionId] || "#666"}" aria-hidden="true"></span>
        <strong class="period-category-name">${escapeHtml(category.name)}</strong>
        <span class="period-category-share">${(category.share * 100).toFixed(1)}%</span>
      </li>
    `).join("");
  }

  function renderTradeComparison() {
    if (GAME.view !== "comparison" || !answer) return;
    const [thenYear, nowYear] = dataMeta.years;
    const then = answer.periods[thenYear];
    const now = answer.periods[nowYear];
    el.thenHeading.textContent = thenYear;
    el.nowHeading.textContent = nowYear;
    el.thenTotal.textContent = formatMoney(then.exportValue);
    el.nowTotal.textContent = formatMoney(now.exportValue);
    renderPeriodCategoryList(el.thenCategoryList, then.categories);
    renderPeriodCategoryList(el.nowCategoryList, now.categories);
    el.periodComparison.setAttribute(
      "aria-label",
      `${thenYear} goods exports ${formatMoney(then.exportValue)}; leading categories ${then.categories.map((category) => category.name).join(", ")}. ${nowYear} goods exports ${formatMoney(now.exportValue)}; leading categories ${now.categories.map((category) => category.name).join(", ")}.`
    );
  }

  function renderProductleClue() {
    if (GAME.view !== "category" || !answer) return;
    el.productleCountryList.innerHTML = answer.clueCountries.map((country, index) => `
      <li class="productle-country-row">
        <span class="productle-country-rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="productle-country-flag" aria-hidden="true">${flagEmoji(country.iso2)}</span>
        <strong class="productle-country-name">${escapeHtml(country.name)}</strong>
        <span class="productle-country-share">
          <strong>${(country.share * 100).toFixed(1)}%</strong>
          <small>of exports</small>
        </span>
      </li>
    `).join("");
    el.productleClue.setAttribute(
      "aria-label",
      answer.clueCountries.map((country) => `${country.name}: ${(country.share * 100).toFixed(1)}% of exports`).join(". ")
    );
  }

  function renderProductleWordBank() {
    if (GAME.view !== "category" || !state) return;
    const used = new Set(state.guesses.map(Number));
    el.productleWordBank.innerHTML = productleCategories.map((category) => {
      const isUsed = used.has(category.sectionId);
      const isAnswer = category.sectionId === answer.sectionId;
      const revealCorrect = state.finished && isAnswer;
      const classes = ["productle-category-button"];
      if (isUsed && !isAnswer) classes.push("is-used");
      if (revealCorrect) classes.push("is-correct");
      return `
        <button
          class="${classes.join(" ")}"
          type="button"
          data-productle-category="${category.sectionId}"
          style="--category-color:${SECTION_COLORS[category.sectionId] || "#666"}"
          ${isUsed || state.finished ? "disabled" : ""}
        >
          <span class="productle-category-swatch" aria-hidden="true"></span>
          <span>${escapeHtml(category.name)}</span>
        </button>
      `;
    }).join("");

    const remaining = state.finished ? 0 : Math.max(0, MAX_GUESSES - state.guesses.length);
    el.productleGuessesLeft.textContent = `${remaining} ${remaining === 1 ? "guess" : "guesses"} remaining`;
    el.productleGiveUp.disabled = state.finished;
    el.productleGiveUp.hidden = state.finished;
    if (!state.guesses.length) el.productleMessage.textContent = "Select the category that best fits all five percentages.";
    else if (state.finished && state.won) el.productleMessage.textContent = `Correct — ${answer.name}.`;
    else if (state.finished) el.productleMessage.textContent = `The category was ${answer.name}.`;
    else {
      const latest = productleCategories.find((category) => category.sectionId === Number(state.guesses.at(-1)));
      el.productleMessage.textContent = `${latest?.name || "That category"} is not the answer.`;
    }
  }

  function tradeoffWinner() {
    return answer?.countries.find((country) => country.iso3 === answer.winnerIso3);
  }

  function renderTradeoffClue() {
    if (GAME.view !== "tradeoff" || !answer || !state) return;
    const selectedIso3 = state.guesses[0];
    const winner = tradeoffWinner();
    const totalDifference = (answer.totalRatio - 1) * 100;
    el.tradeoffCategoryName.textContent = answer.category.name;
    el.tradeoffCountries.innerHTML = answer.countries.map((country) => {
      const isWinner = country.iso3 === answer.winnerIso3;
      const isSelected = country.iso3 === selectedIso3;
      const classes = ["tradeoff-country-button"];
      if (state.finished && isWinner) classes.push("is-correct");
      if (state.finished && isSelected && !isWinner) classes.push("is-wrong");
      return `
        <button
          class="${classes.join(" ")}"
          type="button"
          data-tradeoff-country="${country.iso3}"
          ${state.finished ? "disabled" : ""}
          aria-label="${escapeHtml(country.name)}${state.finished ? `, ${formatMoney(country.categoryValue)} in ${answer.category.name} exports` : ""}"
        >
          <span class="tradeoff-country-flag" aria-hidden="true">${flagEmoji(country.iso2)}</span>
          <strong class="tradeoff-country-name">${escapeHtml(country.name)}</strong>
          <span class="tradeoff-total-label">Total exports</span>
          <strong class="tradeoff-total-value">${formatMoney(country.exportValue)}</strong>
          <span class="tradeoff-category-reveal" ${state.finished ? "" : "hidden"}>
            <small>${escapeHtml(answer.category.name)}</small>
            <strong>${formatMoney(country.categoryValue)}</strong>
            <span>${(country.categoryShare * 100).toFixed(1)}% of exports · category #${country.categoryRank}</span>
          </span>
        </button>
      `;
    }).join("");

    if (!state.finished) {
      el.tradeoffFeedback.textContent = `Their total goods exports differ by only ${totalDifference.toFixed(1)}%. Choose one country.`;
    } else if (state.won) {
      el.tradeoffFeedback.textContent = `Correct — ${winner.name} exported ${formatMoney(winner.categoryValue)} in ${answer.category.name}.`;
    } else {
      el.tradeoffFeedback.textContent = `${winner.name} exported more ${answer.category.name}: ${formatMoney(winner.categoryValue)}.`;
    }
    el.tradeoffGiveUp.disabled = state.finished;
    el.tradeoffGiveUp.hidden = state.finished;
    el.tradeoffClue.setAttribute(
      "aria-label",
      state.finished
        ? `${answer.category.name}. ${answer.countries.map((country) => `${country.name}: ${formatMoney(country.categoryValue)}`).join(". ")}`
        : `${answer.category.name}. Choose between ${answer.countries.map((country) => country.name).join(" and ")}.`
    );
  }

  function renderClue() {
    if (GAME.view === "profile") renderTradeProfile();
    else if (GAME.view === "comparison") renderTradeComparison();
    else if (GAME.view === "category") renderProductleClue();
    else if (GAME.view === "tradeoff") renderTradeoffClue();
    else renderTreemap();
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
    if (GAME.view === "category" || GAME.view === "tradeoff") return;
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
    if (GAME.view === "tradeoff") {
      el.completedCard.hidden = !state.finished;
      if (state.finished) {
        const winner = tradeoffWinner();
        el.completedSummary.textContent = state.won
          ? `Correct · ${winner.name} exported more`
          : `Winner: ${winner.name}`;
      }
      return;
    }

    if (GAME.view === "category") {
      el.completedCard.hidden = !state.finished;
      if (state.finished) {
        const guessWord = state.guesses.length === 1 ? "guess" : "guesses";
        el.completedSummary.textContent = state.won
          ? `Solved in ${state.guesses.length} ${guessWord} · ${answer.name}`
          : `Answer: ${answer.name}`;
      }
      return;
    }

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
    if (GAME.view === "tradeoff") renderTradeoffClue();
    else if (GAME.view === "category") renderProductleWordBank();
    else renderGuesses();
    renderFormState();
  }

  function statsKeyFor(gameConfig) {
    return `${gameConfig.id}-v1:stats`;
  }

  function loadStats(gameConfig = GAME) {
    const maxGuesses = gameConfig.maxGuesses || 6;
    const fallback = {
      played: 0,
      wins: 0,
      currentStreak: 0,
      maxStreak: 0,
      lastWinPuzzle: 0,
      distribution: Array(maxGuesses).fill(0)
    };
    try {
      const stored = JSON.parse(localStorage.getItem(statsKeyFor(gameConfig)));
      if (!stored) return fallback;
      return {
        ...fallback,
        ...stored,
        distribution: Array.from(
          { length: maxGuesses },
          (_, index) => Number(stored.distribution?.[index]) || 0
        )
      };
    } catch {
      return fallback;
    }
  }

  function renderDistribution(gameConfig) {
    const stats = loadStats(gameConfig);
    const distribution = stats.distribution;
    const maxCount = Math.max(0, ...distribution);
    el.distributionChart.setAttribute("aria-label", `${gameConfig.name} wins by number of guesses`);
    el.distributionChart.setAttribute("aria-labelledby", `stats-tab-${gameConfig.id}`);
    el.distributionChart.innerHTML = `
      ${distribution.map((count, index) => {
        const width = maxCount > 0 && count > 0 ? Math.max(8, count / maxCount * 100) : 0;
        return `
          <div class="distribution-row">
            <span class="distribution-attempt">${index + 1}</span>
            <span class="distribution-track" aria-hidden="true">
              <span class="distribution-fill" style="width:${width.toFixed(1)}%"></span>
            </span>
            <strong>${count}</strong>
          </div>
        `;
      }).join("")}
      ${maxCount === 0 ? '<p class="distribution-empty">No completed wins yet.</p>' : ""}
    `;
  }

  function renderStatsOverview() {
    const gameConfigs = Object.values(GAME_MODES);
    const distributionGames = gameConfigs.filter((gameConfig) => gameConfig.tracksGuessDistribution !== false);
    if (!distributionGames.some((gameConfig) => gameConfig.id === selectedStatsGameId)) {
      selectedStatsGameId = distributionGames[0].id;
    }

    el.statsGameGrid.innerHTML = `
      <div class="stats-game-row is-heading" aria-hidden="true">
        <span>Game</span><span>Played</span><span>Win %</span><span>Streak</span><span>Best</span>
      </div>
      ${gameConfigs.map((gameConfig) => {
        const stats = loadStats(gameConfig);
        const winRate = stats.played ? Math.round(stats.wins / stats.played * 100) : 0;
        return `
          <div class="stats-game-row${gameConfig.id === GAME?.id ? " is-current" : ""}">
            <strong>${escapeHtml(gameConfig.name)}</strong>
            <span><b>${stats.played}</b><small>Played</small></span>
            <span><b>${winRate}%</b><small>Win</small></span>
            <span><b>${stats.currentStreak}</b><small>Streak</small></span>
            <span><b>${stats.maxStreak}</b><small>Best</small></span>
          </div>
        `;
      }).join("")}
    `;

    el.statsGameTabs.innerHTML = distributionGames.map((gameConfig) => {
      const active = gameConfig.id === selectedStatsGameId;
      return `
        <button
          id="stats-tab-${gameConfig.id}"
          type="button"
          role="tab"
          data-stats-game="${gameConfig.id}"
          aria-controls="distribution-chart"
          aria-selected="${active}"
          tabindex="${active ? "0" : "-1"}"
        >${escapeHtml(gameConfig.name)}</button>
      `;
    }).join("");
    renderDistribution(GAME_MODES[selectedStatsGameId]);
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
      if (GAME.tracksGuessDistribution !== false) {
        const attempt = Math.max(0, Math.min(MAX_GUESSES - 1, state.guesses.length - 1));
        stats.distribution[attempt] = (stats.distribution[attempt] || 0) + 1;
      }
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
    const guessWord = state.guesses.length === 1 ? "guess" : "guesses";
    el.resultKicker.textContent = state.won
      ? `Solved in ${state.guesses.length} ${guessWord}`
      : "Answer revealed";
    const isCategory = GAME.view === "category";
    const isTradeoff = GAME.view === "tradeoff";
    el.answerFlag.hidden = isCategory || isTradeoff;
    el.answerFlag.classList.toggle("is-category", isCategory);
    el.answerProducts.classList.toggle("is-productle", isCategory);
    el.answerProducts.classList.toggle("is-tradeoff", isTradeoff);
    el.answerFlag.style.removeProperty("--category-color");
    el.answerFlag.textContent = isCategory
      ? SECTION_CODES[answer.sectionId]
      : (isTradeoff ? "" : flagEmoji(answer.iso2));
    if (isCategory) el.answerFlag.style.setProperty("--category-color", SECTION_COLORS[answer.sectionId] || "#666");
    if (isTradeoff) {
      const winner = tradeoffWinner();
      el.answerName.textContent = `${winner.name} exported more`;
      el.answerContext.textContent = `${answer.category.name} · matched 2024 goods exporters`;
      el.answerProducts.innerHTML = answer.countries.map((country) => `
        <div class="answer-product">
          <span>${flagEmoji(country.iso2)} ${escapeHtml(country.name)}</span>
          <strong>${formatMoney(country.categoryValue)}</strong>
          <small>${(country.categoryShare * 100).toFixed(1)}% of exports</small>
        </div>
      `).join("");
    } else if (isCategory) {
      el.answerName.textContent = answer.name;
      el.answerContext.textContent = `Broad export category · goods exports · ${dataMeta.year}`;
      el.answerProducts.innerHTML = answer.clueCountries.map((country) => `
        <div class="answer-product">
          <span>${flagEmoji(country.iso2)} ${escapeHtml(country.name)}</span>
          <strong>${(country.share * 100).toFixed(1)}%</strong>
        </div>
      `).join("");
    } else if (GAME.view === "profile") {
      el.answerName.textContent = answer.name;
      el.answerContext.textContent = `${answer.continent} · ${formatMoney(answer.gdpValue)} nominal GDP · ${dataMeta.year}`;
      el.answerProducts.innerHTML = answer.partners.slice(0, 3).map((partner, index) => `
        <div class="answer-product">
          <span>Trade partner #${index + 1}</span>
          <strong>${escapeHtml(partner.name)}</strong>
        </div>
      `).join("");
    } else if (GAME.view === "comparison") {
      el.answerName.textContent = answer.name;
      const [thenYear, nowYear] = dataMeta.years;
      const then = answer.periods[thenYear];
      const now = answer.periods[nowYear];
      el.answerContext.textContent = `${answer.continent} · goods exports ${formatMoney(then.exportValue)} → ${formatMoney(now.exportValue)} · ${thenYear}–${nowYear}`;
      el.answerProducts.innerHTML = now.categories.slice(0, 3).map((category, index) => `
        <div class="answer-product">
          <span>${nowYear} category #${index + 1}</span>
          <strong>${escapeHtml(category.name)}</strong>
        </div>
      `).join("");
    } else {
      el.answerName.textContent = answer.name;
      const topProducts = answer.products.slice(0, 3);
      el.answerContext.textContent = `${answer.continent} · ${formatMoney(totalTradeValue(answer))} in goods ${directionWord()} · ${dataMeta.year}`;
      el.answerProducts.innerHTML = topProducts.map((product) => `
        <div class="answer-product">
          <span>${escapeHtml(product.name)}</span>
          <strong>${(product.share * 100).toFixed(1)}%</strong>
        </div>
      `).join("");
    }
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

  function submitProductleGuess(sectionId) {
    if (GAME.view !== "category" || state.finished) return;
    const category = productleCategories.find((candidate) => candidate.sectionId === Number(sectionId));
    if (!category || state.guesses.map(Number).includes(category.sectionId)) return;

    state.guesses.push(category.sectionId);
    saveState();
    renderGame();

    if (category.sectionId === answer.sectionId) finishGame(true);
    else if (state.guesses.length >= MAX_GUESSES) finishGame(false);
  }

  function submitTradeoffGuess(iso3) {
    if (GAME.view !== "tradeoff" || state.finished) return;
    const country = answer.countries.find((candidate) => candidate.iso3 === iso3);
    if (!country) return;
    state.guesses.push(country.iso3);
    saveState();
    finishGame(country.iso3 === answer.winnerIso3);
  }

  function resultRows() {
    if (GAME.view === "tradeoff") {
      return state.guesses.map((iso3) => (
        iso3 === answer.winnerIso3 ? "🟩🟩🟩🟩🟩" : "⬜⬜⬜⬜⬜"
      ));
    }
    if (GAME.view === "category") {
      return state.guesses.map((sectionId) => (
        Number(sectionId) === answer.sectionId ? "🟩🟩🟩🟩🟩" : "⬜⬜⬜⬜⬜"
      ));
    }
    return state.guesses.map((iso3) => {
      const country = countries.find((candidate) => candidate.iso3 === iso3);
      const clue = clueFor(country);
      if (clue.correct) return "🟩🟩🟩🟩🟩";
      const greenCount = Math.min(4, Math.floor(clue.proximity / 20));
      const yellowCount = greenCount < 4 && clue.proximity % 20 >= 10 ? 1 : 0;
      const blankCount = 5 - greenCount - yellowCount;
      return `${"🟩".repeat(greenCount)}${"🟨".repeat(yellowCount)}${"⬜".repeat(blankCount)}`;
    });
  }

  function shareText() {
    const score = state.won ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    const gameTag = GAME.name.replace(/[^a-zA-Z0-9]/g, "");
    const gameUrl = `https://liberal.markets/games.html?game=${encodeURIComponent(GAME.id)}`;
    const rows = resultRows();
    return [
      `#${gameTag} #${puzzleNumber} ${score}`,
      ...(rows.length ? rows : ["⬜⬜⬜⬜⬜"]),
      gameUrl
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

  function openStats() {
    renderStatsOverview();
    if (!el.statsDialog.open) el.statsDialog.showModal();
  }

  function closeOnBackdrop(dialog, event) {
    if (event.target === dialog) dialog.close();
  }

  function bindGlobalEvents() {
    el.themeToggle.addEventListener("click", () => {
      setTheme(colorTheme === "dark" ? "light" : "dark");
    });
    el.openStats.addEventListener("click", openStats);
    el.statsGameTabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-stats-game]");
      if (!tab) return;
      selectedStatsGameId = tab.dataset.statsGame;
      renderStatsOverview();
      el.statsGameTabs.querySelector(`[data-stats-game="${selectedStatsGameId}"]`)?.focus();
    });
    document.querySelectorAll("[data-close-stats]").forEach((button) => {
      button.addEventListener("click", () => el.statsDialog.close());
    });
    el.statsDialog.addEventListener("click", (event) => closeOnBackdrop(el.statsDialog, event));
  }

  function bindEvents() {
    bindGlobalEvents();
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
    el.productleWordBank.addEventListener("click", (event) => {
      const button = event.target.closest("[data-productle-category]");
      if (button) submitProductleGuess(button.dataset.productleCategory);
    });
    el.tradeoffCountries.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tradeoff-country]");
      if (button) submitTradeoffGuess(button.dataset.tradeoffCountry);
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
    el.productleGiveUp.addEventListener("click", () => {
      if (window.confirm("Reveal today’s export category and end this game?")) finishGame(false, true);
    });
    el.tradeoffGiveUp.addEventListener("click", () => {
      if (window.confirm("Reveal which country exported more and end this game?")) finishGame(false, true);
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
      resizeTimer = window.setTimeout(renderClue, 120);
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
    if (GAME.view === "comparison") {
      const [thenYear, nowYear] = dataMeta.years;
      el.dataYear.textContent = `BACI · ${thenYear}–${nowYear}`;
      el.figureYear.textContent = `${thenYear} → ${nowYear}`;
    } else if (GAME.view === "profile") {
      el.dataYear.textContent = `BACI + World Bank · ${dataMeta.year}`;
      el.dataSourceCopy.innerHTML = `Data: <a href="https://oec.world/en/resources/datasets" target="_blank" rel="noreferrer">CEPII BACI via OEC</a> · <a href="https://data.worldbank.org/indicator/NY.GDP.MKTP.CD" target="_blank" rel="noreferrer">World Bank GDP</a> · CC BY 4.0`;
      el.figureYear.textContent = dataMeta.year;
    } else {
      el.dataYear.textContent = `BACI · ${dataMeta.year}`;
      el.figureYear.textContent = dataMeta.year;
    }
    el.puzzleNumber.textContent = `Puzzle #${puzzleNumber}`;
  }

  function showLoadError(error) {
    console.error(error);
    if (GAME.view === "tradeoff") {
      el.tradeoffClue.innerHTML = '<p class="profile-error">Matchup data unavailable. Please reload.</p>';
    } else if (GAME.view === "category") {
      el.productleClue.innerHTML = '<p class="profile-error">Category data unavailable. Please reload.</p>';
      el.productleGuess.hidden = true;
    } else if (GAME.view === "profile") {
      el.tradeProfile.innerHTML = '<p class="profile-error">Economic data unavailable. Please reload.</p>';
    } else if (GAME.view === "comparison") {
      el.periodComparison.innerHTML = '<p class="profile-error">Historical trade data unavailable. Please reload.</p>';
    } else {
      el.chartLoading.innerHTML = "<p>Trade data unavailable. Please reload.</p>";
    }
    el.exportTotal.textContent = "Could not load trade data";
    el.input.disabled = true;
    el.submit.disabled = true;
  }

  async function init() {
    cacheElements();
    colorTheme = loadTheme();
    renderThemeControl();
    if (IS_HUB) {
      renderHub();
      bindGlobalEvents();
      return;
    }
    applyGameMode();
    distanceUnit = loadDistanceUnit();
    renderDistanceUnitControl();
    bindEvents();

    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`Trade data request failed (${response.status})`);
      const payload = await response.json();
      if (GAME.view === "tradeoff") {
        if (!Array.isArray(payload.matchups) || !payload.matchups.length) {
          throw new Error("Tradeoffs data contains no matchups");
        }
        if (payload.matchups.some((matchup) => matchup.countries?.length !== 2 || !matchup.categories?.length)) {
          throw new Error("Tradeoffs data contains an invalid matchup");
        }
      } else if (GAME.view === "category") {
        if (!Array.isArray(payload.categories) || !payload.categories.length) {
          throw new Error("Productle data contains no categories");
        }
        if (payload.categories.some((category) => !Array.isArray(category.countries) || category.countries.length < 5)) {
          throw new Error("Productle data does not contain enough country clues");
        }
      } else if (!Array.isArray(payload.countries) || !payload.countries.length) {
        throw new Error("Trade data contains no countries");
      }
      if (payload.meta?.direction && payload.meta.direction !== GAME.direction) {
        throw new Error(`Expected ${GAME.direction} data but received ${payload.meta.direction} data`);
      }

      dataMeta = payload.meta;
      if (GAME.view === "tradeoff") tradeoffMatchups = payload.matchups;
      else if (GAME.view === "category") productleCategories = payload.categories;
      else {
        countries = payload.countries;
        buildCountryLookup();
      }
      selectAnswer();
      state = loadState();
      renderMetadata();
      renderGame();
      window.requestAnimationFrame(renderClue);
    } catch (error) {
      showLoadError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
