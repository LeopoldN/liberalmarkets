/* =====================================================================
   map.js — UKRAINE // AREA OF RESPONSIBILITY theater map
   D3 v7 · SVG · Lambert conformal conic centred on Ukraine.

   Public API: window.UkraineMap (see bottom of file).
   ===================================================================== */
(function () {
  "use strict";

  const U = window.GeoUtils;
  const R_EARTH = 6371.0088; // km

  /* ------------------------------------------------------------------
     Static reference data
     ------------------------------------------------------------------ */

  /** First-level units keyed by ISO 3166-2. center = admin centre [lon, lat]. */
  const OBLASTS = {
    "UA-05": { name: "Vinnytsia Oblast",       short: "VINNYTSIA",       native: "Вінницька область",        center: "Vinnytsia",       ll: [28.468, 49.233], lab: [28.85, 48.78] },
    "UA-07": { name: "Volyn Oblast",           short: "VOLYN",           native: "Волинська область",        center: "Lutsk",           ll: [25.325, 50.747] },
    "UA-09": { name: "Luhansk Oblast",         short: "LUHANSK",         native: "Луганська область",        center: "Luhansk",         ll: [39.308, 48.574], lab: [39.05, 49.15] },
    "UA-12": { name: "Dnipropetrovsk Oblast",  short: "DNIPROPETROVSK",  native: "Дніпропетровська область", center: "Dnipro",          ll: [35.046, 48.465], lab: [34.55, 48.12] },
    "UA-14": { name: "Donetsk Oblast",         short: "DONETSK",         native: "Донецька область",         center: "Donetsk",         ll: [37.803, 48.016], lab: [37.85, 47.55] },
    "UA-18": { name: "Zhytomyr Oblast",        short: "ZHYTOMYR",        native: "Житомирська область",      center: "Zhytomyr",        ll: [28.659, 50.255], lab: [28.35, 50.8] },
    "UA-21": { name: "Zakarpattia Oblast",     short: "ZAKARPATTIA",     native: "Закарпатська область",     center: "Uzhhorod",        ll: [22.288, 48.621], lab: [23.25, 48.3] },
    "UA-23": { name: "Zaporizhzhia Oblast",    short: "ZAPORIZHZHIA",    native: "Запорізька область",       center: "Zaporizhzhia",    ll: [35.140, 47.839], lab: [35.75, 47.15] },
    "UA-26": { name: "Ivano-Frankivsk Oblast", short: "IVANO-FRANKIVSK", native: "Івано-Франківська область", center: "Ivano-Frankivsk", ll: [24.711, 48.923], lab: [24.5, 48.55] },
    "UA-30": { name: "Kyiv City",              short: "KYIV CITY",       native: "Київ",                     center: "Kyiv",            ll: [30.523, 50.450], kind: "CITY WITH SPECIAL STATUS", minK: 6 },
    "UA-32": { name: "Kyiv Oblast",            short: "KYIV",            native: "Київська область",         center: "Kyiv",            ll: [30.523, 50.450], lab: [29.95, 50.95] },
    "UA-35": { name: "Kirovohrad Oblast",      short: "KIROVOHRAD",      native: "Кіровоградська область",   center: "Kropyvnytskyi",   ll: [32.262, 48.508], lab: [31.75, 48.25] },
    "UA-40": { name: "Sevastopol",             short: "SEVASTOPOL",      native: "Севастополь",              center: "Sevastopol",      ll: [33.522, 44.617], kind: "CITY WITH SPECIAL STATUS", minK: 6 },
    "UA-43": { name: "Autonomous Republic of Crimea", short: "CRIMEA",   native: "Автономна Республіка Крим", center: "Simferopol",     ll: [34.102, 44.952], kind: "AUTONOMOUS REPUBLIC", lab: [34.0, 45.45], sub: "AR" },
    "UA-46": { name: "Lviv Oblast",            short: "LVIV",            native: "Львівська область",        center: "Lviv",            ll: [24.030, 49.840], lab: [23.65, 49.5] },
    "UA-48": { name: "Mykolaiv Oblast",        short: "MYKOLAIV",        native: "Миколаївська область",     center: "Mykolaiv",        ll: [31.995, 46.975], lab: [31.75, 47.45] },
    "UA-51": { name: "Odesa Oblast",           short: "ODESA",           native: "Одеська область",          center: "Odesa",           ll: [30.723, 46.483], lab: [29.75, 47.05] },
    "UA-53": { name: "Poltava Oblast",         short: "POLTAVA",         native: "Полтавська область",       center: "Poltava",         ll: [34.551, 49.588], lab: [33.6, 49.65] },
    "UA-56": { name: "Rivne Oblast",           short: "RIVNE",           native: "Рівненська область",       center: "Rivne",           ll: [26.252, 50.620], lab: [26.45, 51.1] },
    "UA-59": { name: "Sumy Oblast",            short: "SUMY",            native: "Сумська область",          center: "Sumy",            ll: [34.798, 50.908], lab: [33.85, 51.15] },
    "UA-61": { name: "Ternopil Oblast",        short: "TERNOPIL",        native: "Тернопільська область",    center: "Ternopil",        ll: [25.595, 49.553], lab: [25.55, 49.12] },
    "UA-63": { name: "Kharkiv Oblast",         short: "KHARKIV",         native: "Харківська область",       center: "Kharkiv",         ll: [36.230, 49.994], lab: [36.55, 49.42] },
    "UA-65": { name: "Kherson Oblast",         short: "KHERSON",         native: "Херсонська область",       center: "Kherson",         ll: [32.617, 46.635], lab: [33.55, 46.55] },
    "UA-68": { name: "Khmelnytskyi Oblast",    short: "KHMELNYTSKYI",    native: "Хмельницька область",      center: "Khmelnytskyi",    ll: [26.987, 49.423], lab: [26.95, 49.95] },
    "UA-71": { name: "Cherkasy Oblast",        short: "CHERKASY",        native: "Черкаська область",        center: "Cherkasy",        ll: [32.060, 49.444], lab: [31.15, 49.15] },
    "UA-74": { name: "Chernihiv Oblast",       short: "CHERNIHIV",       native: "Чернігівська область",     center: "Chernihiv",       ll: [31.289, 51.498], lab: [32.3, 51.25] },
    "UA-77": { name: "Chernivtsi Oblast",      short: "CHERNIVTSI",      native: "Чернівецька область",      center: "Chernivtsi",      ll: [25.936, 48.292], lab: [26.25, 48.12] },
  };

  /** Extra Ukrainian cities (not oblast centres). tier 2 = major, 3 = minor. */
  const UA_CITIES = [
    { name: "Kryvyi Rih",  ll: [33.392, 47.910], tier: 2 },
    { name: "Mariupol",    ll: [37.550, 47.097], tier: 2 },
    { name: "Kramatorsk",  ll: [37.556, 48.739], tier: 3 },
    { name: "Melitopol",   ll: [35.365, 46.849], tier: 3 },
    { name: "Kerch",       ll: [36.471, 45.356], tier: 3 },
    { name: "Izmail",      ll: [28.837, 45.352], tier: 3 },
    { name: "Bila Tserkva",ll: [30.112, 49.799], tier: 3 },
    { name: "Kremenchuk",  ll: [33.416, 49.066], tier: 3 },
    { name: "Bakhmut",     ll: [38.000, 48.595], tier: 3 },
    { name: "Berdiansk",   ll: [36.784, 46.756], tier: 3 },
    { name: "Yalta",       ll: [34.166, 44.495], tier: 3 },
    { name: "Uman",        ll: [30.221, 48.749], tier: 3 },
    { name: "Chornobyl",   ll: [30.219, 51.276], tier: 3 },
  ];

  /** Peripheral cities. cap = national capital. */
  const EXT_CITIES = [
    { name: "Moscow",     ll: [37.617, 55.756], cap: true },
    { name: "Minsk",      ll: [27.562, 53.905], cap: true },
    { name: "Warsaw",     ll: [21.012, 52.230], cap: true },
    { name: "Chișinău",   ll: [28.864, 47.011], cap: true },
    { name: "Bucharest",  ll: [26.103, 44.427], cap: true },
    { name: "Budapest",   ll: [19.040, 47.498], cap: true },
    { name: "Bratislava", ll: [17.108, 48.149], cap: true },
    { name: "Vilnius",    ll: [25.280, 54.687], cap: true },
    { name: "Riga",       ll: [24.105, 56.950], cap: true },
    { name: "Sofia",      ll: [23.322, 42.698], cap: true },
    { name: "Belgrade",   ll: [20.457, 44.787], cap: true },
    { name: "Tbilisi",    ll: [44.793, 41.715], cap: true },
    { name: "Ankara",     ll: [32.860, 39.933], cap: true },
    { name: "Istanbul",   ll: [28.978, 41.008] },
    { name: "Rostov-on-Don", ll: [39.702, 47.236] },
    { name: "Voronezh",   ll: [39.200, 51.672] },
    { name: "Belgorod",   ll: [36.598, 50.600] },
    { name: "Kursk",      ll: [36.187, 51.730] },
    { name: "Bryansk",    ll: [34.365, 53.243] },
    { name: "Smolensk",   ll: [32.040, 54.783] },
    { name: "Krasnodar",  ll: [38.976, 45.035] },
    { name: "Novorossiysk", ll: [37.768, 44.724] },
    { name: "Volgograd",  ll: [44.513, 48.708] },
    { name: "Tiraspol",   ll: [29.643, 46.840] },
    { name: "Gomel",      ll: [30.975, 52.441] },
    { name: "Brest",      ll: [23.685, 52.098] },
    { name: "Kraków",     ll: [19.945, 50.065] },
    { name: "Lublin",     ll: [22.568, 51.247] },
    { name: "Rzeszów",    ll: [22.004, 50.041] },
    { name: "Košice",     ll: [21.261, 48.716] },
    { name: "Debrecen",   ll: [21.627, 47.532] },
    { name: "Iași",       ll: [27.601, 47.159] },
    { name: "Suceava",    ll: [26.256, 47.651] },
    { name: "Constanța",  ll: [28.635, 44.160] },
    { name: "Galați",     ll: [28.050, 45.435] },
    { name: "Samsun",     ll: [36.330, 41.287] },
    { name: "Batumi",     ll: [41.636, 41.642] },
    { name: "Sukhumi",    ll: [41.020, 43.003] },
  ];

  const COUNTRY_LABELS = [
    { text: "RUSSIA",     ll: [40.6, 53.6], size: 17 },
    { text: "RUSSIA",     ll: [42.4, 46.4], size: 14 },
    { text: "BELARUS",    ll: [27.9, 53.35], size: 15 },
    { text: "POLAND",     ll: [19.6, 51.6], size: 15 },
    { text: "SLOVAKIA",   ll: [19.4, 48.75], size: 12 },
    { text: "HUNGARY",    ll: [20.0, 46.9], size: 13 },
    { text: "ROMANIA",    ll: [24.9, 46.0], size: 15 },
    { text: "MOLDOVA",    ll: [28.35, 47.75], size: 10.5 },
    { text: "LITHUANIA",  ll: [23.9, 55.35], size: 12 },
    { text: "LATVIA",     ll: [25.9, 56.75], size: 12 },
    { text: "ESTONIA",    ll: [26.0, 58.6], size: 12 },
    { text: "BULGARIA",   ll: [25.2, 42.75], size: 13 },
    { text: "SERBIA",     ll: [20.9, 43.9], size: 12 },
    { text: "TURKEY",     ll: [35.0, 40.6], size: 15 },
    { text: "GEORGIA",    ll: [43.7, 42.15], size: 12 },
    { text: "CZECHIA",    ll: [15.6, 49.8], size: 12 },
    { text: "AUSTRIA",    ll: [14.6, 47.6], size: 12 },
    { text: "KAZAKHSTAN", ll: [52.5, 49.0], size: 13 },
    { text: "RUSSIA (KALININGRAD)", ll: [21.3, 54.75], size: 9.5, small: true },
    { text: "TRANSNISTRIA", ll: [29.5, 47.42], size: 9, small: true, minK: 1.6 },
    { text: "ABKHAZIA",   ll: [41.25, 43.25], size: 9, small: true, minK: 1.4 },
  ];

  const SEA_LABELS = [
    { text: "Black Sea",     ll: [33.6, 43.35], size: 17 },
    { text: "Sea of Azov",   ll: [36.75, 46.12], size: 10.5, ls: ".22em" },
    { text: "Baltic Sea",    ll: [18.6, 55.9], size: 13 },
    { text: "Caspian Sea",   ll: [50.5, 42.6], size: 13 },
    { text: "Sea of Marmara", ll: [28.2, 40.75], size: 9 },
  ];

  /** Rivers to label: Natural Earth names → display labels. */
  const RIVER_LABELS = [
    { ne: "Dnipro", text: "Dnipro", at: 0.42 },
    { ne: "Dniester", text: "Dniester", at: 0.38 },
    { ne: "Southern Bug", text: "Southern Buh", at: 0.5 },
    { ne: "Desna", text: "Desna", at: 0.55 },
    { ne: "Pripyat", text: "Prypiat", at: 0.45 },
    { ne: "Donets", text: "Siverskyi Donets", at: 0.45 },
    { ne: "Don", text: "Don", at: 0.45 },
    { ne: "Danube", text: "Danube", at: 0.82 },
    { ne: "Prut", text: "Prut", at: 0.45 },
    { ne: "Vistula", text: "Vistula", at: 0.55 },
  ];

  /** Initial view: Ukraine (22–40.2°E, 44.4–52.4°N) plus a margin of its neighbours. The stage shows roughly 18–46°E, 42–56°N around it. */
  const FOCUS_BBOX = { w: 21.6, e: 40.6, s: 44.0, n: 52.6 };

  const ERA_FADE_MS = 650;
  const OV_KINDS = ["rival", "occupied", "contested", "related"];
  const OV_KIND_NAME = { rival: "Neighbouring power", related: "Related polity", occupied: "Occupied", contested: "Contested" };
  const POLITY_HUES = 6; // --pol-1 … --pol-6 in map.css
  const MAJOR = new Set(["Kyiv", "Kharkiv", "Odesa", "Dnipro", "Lviv", "Zaporizhzhia", "Donetsk", "Simferopol", "Sevastopol", "Mykolaiv"]);

  /* ------------------------------------------------------------------
     State
     ------------------------------------------------------------------ */
  const S = {
    W: 0, H: 0, B: 22,
    projection: null, path: null,
    t: d3.zoomIdentity,
    data: {},
    ukr: { features: [], byId: new Map(), outline: null, mesh: null, border: null, totalKm2: 0 },
    layers: {},
    labelItems: [],
    gratLines: { mer: [], par: [] },
    hoverId: null,
    selectedId: null,
    era: null,
    eraSeq: 0,
    historicalLands: null,
    presentDay: false,
    visible: { oblastLabels: true, cities: true, rivers: true, graticule: true, grayZone: true, overlays: true, hul: false },
    ready: false,
    listeners: {},
  };

  const $ = (id) => document.getElementById(id);
  const svg = d3.select("#map");
  const stageEl = $("stage");

  function emit(name, payload) { (S.listeners[name] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } }); }
  function on(name, fn) {
    (S.listeners[name] = S.listeners[name] || []).push(fn);
    if (name === "ready" && S.ready) fn(api);
    return api;
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  async function boot() {
    const status = $("boot-status");
    try {
      status.textContent = "Loading map data";
      const [world, adm1, rivers, lakes, breakaway] = await Promise.all([
        d3.json("data/geo/countries-50m.json"),
        d3.json("data/geo/ukr-adm1.geojson"),
        d3.json("data/geo/rivers.geojson").catch(() => null),
        d3.json("data/geo/lakes.geojson").catch(() => null),
        d3.json("data/geo/breakaway.geojson").catch(() => null),
      ]);
      status.textContent = "Preparing boundaries";
      prepareData(world, adm1, rivers, lakes, breakaway);
      buildSvg();
      resize(true);
      buildLegend();
      buildLayerToggles();
      renderIntelDefault();
      startClock();
      bindUi();
      S.ready = true;
      $("boot").classList.add("done");
      setTimeout(() => { const b = $("boot"); if (b) b.remove(); }, 900);
      emit("ready", api);
    } catch (err) {
      console.error("[UkraineMap] failed to initialise", err);
      const b = $("boot");
      b.classList.add("error");
      status.textContent = "Map data could not be loaded. Check that data/geo/ is being served. " + (err && err.message ? err.message : err);
    }
  }

  /* ------------------------------------------------------------------
     Data preparation
     ------------------------------------------------------------------ */

  /** Geometry level of detail, picked once from the device's screen size:
   *  high = full source detail (large screens), medium = tablets / small laptops,
   *  low = phones. Override with ?lod=high|medium|low. Values are the minimum
   *  Visvalingam triangle area (deg²) a vertex needs to survive simplification. */
  const LOD_WEIGHT = { high: 0, medium: 3e-5, low: 2e-4 };
  function pickLod() {
    const q = new URLSearchParams(location.search).get("lod");
    if (q in LOD_WEIGHT) return q;
    const long = Math.max(screen.width, screen.height), short = Math.min(screen.width, screen.height);
    if (short < 600) return "low";
    if (long < 1600) return "medium";
    return "high";
  }
  S.lod = pickLod();

  /** Simplify a topology at the current LOD. Shared arcs simplify once, so neighbouring
   *  shapes keep identical borders (no slivers). No-op at high LOD or without the library. */
  function simplifyTopo(topo) {
    const w = LOD_WEIGHT[S.lod];
    if (!w || typeof topojson.presimplify !== "function") return topo;
    const t = topojson.simplify(topojson.presimplify(topo), w);
    // drop islands/lakes too small to keep their shape at this LOD
    return topojson.filter(t, topojson.filterWeight(t, w));
  }

  function prepareData(world, adm1, rivers, lakes, breakaway) {
    world = simplifyTopo(world);
    // --- periphery countries (exclude Ukraine 804 — it is drawn from ADM1 data)
    const countries = topojson.feature(world, world.objects.countries).features
      .map((f) => (LOD_WEIGHT[S.lod] ? U.rewind(f) : f)) // simplification can flip tiny rings
      .filter((f) => f.id !== "804" && f.geometry)
      .filter((f) => {
        const [[x0, y0], [x1, y1]] = d3.geoBounds(f);
        const wrap = x0 > x1;
        const lonOk = wrap || (x1 > -5 && x0 < 75);
        return lonOk && y1 > 25 && y0 < 80;
      });
    S.data.countries = countries;
    // regional land only (whole-world land includes Antarctica, which a conic projection sends to infinity)
    const regionIds = new Set(countries.map((f) => f.id).concat(["804"]));
    S.data.land = U.rewind(topojson.merge(world, world.objects.countries.geometries.filter((g) => regionIds.has(g.id))));
    // country borders mesh for crisp shared borders
    S.data.countryMesh = topojson.mesh(world, world.objects.countries, (a, b) => a !== b && a.id !== "804" && b.id !== "804");

    // --- Ukraine ADM1: normalise winding, attach metadata
    const feats = U.rewind(adm1).features.map((f) => {
      const iso = f.properties.shapeISO;
      const meta = OBLASTS[iso] || { name: f.properties.shapeName, short: f.properties.shapeName.toUpperCase(), center: "—" };
      const km2 = d3.geoArea(f) * R_EARTH * R_EARTH;
      return Object.assign({}, f, { id: iso, properties: Object.assign({}, f.properties, meta, { iso, km2 }) });
    });
    S.ukr.features = feats;
    feats.forEach((f) => S.ukr.byId.set(f.id, f));
    S.ukr.totalKm2 = d3.sum(feats, (f) => f.properties.km2);

    // --- topology for dissolved national outline + internal boundaries
    try {
      const topo = simplifyTopo(topojson.topology({ ob: { type: "FeatureCollection", features: feats } }, 2e5));
      const geoms = topo.objects.ob.geometries;
      if (LOD_WEIGHT[S.lod]) {
        const simple = U.rewind(topojson.feature(topo, topo.objects.ob)).features;
        feats.forEach((f, i) => { if (simple[i].geometry) f.geometry = simple[i].geometry; });
      }
      S.ukr.outline = U.rewind(topojson.merge(topo, geoms));
      // 1944–54 Ukrainian SSR: today's border without Crimea (UA-43) and Sevastopol (UA-40)
      S.ukr.withoutCrimea = U.rewind(topojson.merge(topo, geoms.filter((g) => g.id !== "UA-43" && g.id !== "UA-40")));
      S.ukr.mesh = topojson.mesh(topo, topo.objects.ob, (a, b) => a !== b);
      S.ukr.border = topojson.mesh(topo, topo.objects.ob, (a, b) => a === b);
    } catch (e) {
      console.warn("[UkraineMap] topology merge failed, using fallback outline", e);
      S.ukr.outline = { type: "MultiPolygon", coordinates: feats.flatMap((f) => f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) };
      S.ukr.mesh = null; S.ukr.border = null;
    }

    // --- hydrography
    const simpleFc = (fc) => {
      if (!LOD_WEIGHT[S.lod]) return fc;
      const t = simplifyTopo(topojson.topology({ fc }));
      return topojson.feature(t, t.objects.fc);
    };
    S.data.rivers = rivers ? U.rewind(simpleFc(rivers)).features : [];
    S.data.lakes = lakes ? U.rewind(simpleFc(lakes)).features : [];
    S.data.breakaway = breakaway ? U.rewind(breakaway).features : [];
  }

  /* ------------------------------------------------------------------
     SVG scaffold
     ------------------------------------------------------------------ */
  function buildSvg() {
    svg.selectAll("*").remove();
    const defs = svg.append("defs");

    const css = getComputedStyle(document.documentElement);
    const tok = (n, fb) => (css.getPropertyValue(n) || "").trim() || fb;

    // hatch patterns (patternTransform rescaled on zoom so on-screen density is constant)
    const hatch = (id, color, width, gap, angle, opacity, cross) => {
      const p = defs.append("pattern").attr("id", id).attr("class", "zpat")
        .attr("patternUnits", "userSpaceOnUse").attr("width", gap).attr("height", gap)
        .attr("data-angle", angle).attr("patternTransform", `rotate(${angle})`);
      p.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", gap)
        .attr("stroke", color).attr("stroke-width", width).attr("stroke-opacity", opacity);
      if (cross) p.append("line").attr("x1", 0).attr("y1", gap / 2).attr("x2", gap).attr("y2", gap / 2)
        .attr("stroke", color).attr("stroke-width", width).attr("stroke-opacity", opacity);
      return p;
    };
    hatch("hatch-gray", tok("--hist", "#b9c2cc"), 0.9, 6, 45, 0.34);
    hatch("hatch-red", tok("--occupied", "#d4574b"), 1.2, 5, -45, 0.75);
    hatch("hatch-orange", tok("--contested", "#d98a4e"), 1, 7, 45, 0.65, true);
    hatch("hatch-tnr", tok("--breakaway", "#6f6153"), 0.8, 4, 45, 0.7);
    const st = defs.append("pattern").attr("id", "stipple").attr("class", "zpat").attr("data-angle", 0)
      .attr("patternUnits", "userSpaceOnUse").attr("width", 5).attr("height", 5);
    st.append("circle").attr("cx", 1.25).attr("cy", 1.25).attr("r", 0.7).attr("fill", tok("--hist", "#b9c2cc")).attr("fill-opacity", 0.45);
    st.append("circle").attr("cx", 3.75).attr("cy", 3.75).attr("r", 0.7).attr("fill", tok("--hist", "#b9c2cc")).attr("fill-opacity", 0.45);

    defs.append("clipPath").attr("id", "clip-frame").append("rect").attr("id", "clip-frame-rect");

    svg.append("rect").attr("class", "sea-bg").attr("id", "sea-bg");

    const view = svg.append("g").attr("class", "viewport").attr("clip-path", "url(#clip-frame)");
    const z = view.append("g").attr("class", "zoom-layer");
    S.layers.view = view;
    S.layers.zoom = z;
    S.layers.gratMinor = z.append("g").attr("class", "lyr-grat");
    S.layers.periphery = z.append("g").attr("class", "lyr-periphery");
    S.layers.hydroBack = z.append("g").attr("class", "lyr-hydro-back");
    S.layers.ukrBase = z.append("g").attr("class", "lyr-ukr-base");
    S.layers.hul = z.append("g").attr("class", "lyr-hul");
    S.layers.history = z.append("g").attr("class", "lyr-history");
    S.layers.hydro = z.append("g").attr("class", "lyr-hydro");
    S.layers.oblasts = z.append("g").attr("class", "lyr-oblasts");
    S.layers.borders = z.append("g").attr("class", "lyr-borders");
    S.layers.hover = z.append("g").attr("class", "lyr-hover");
    [S.layers.ukrBase, S.layers.hul, S.layers.history, S.layers.oblasts, S.layers.hover].forEach((l) => l.attr("clip-path", "url(#clip-land)"));

    S.layers.labels = view.append("g").attr("class", "labels");
    S.layers.frame = svg.append("g").attr("class", "frame");

    // non-scaling strokes on everything inside the zoomed layer
    z.attr("vector-effect", null);
  }

  /* ------------------------------------------------------------------
     Projection + full (re)render of geographic layers
     ------------------------------------------------------------------ */
  function makeProjection() {
    const { W, H, B } = S;
    // Frame Ukraine (with a margin of its neighbours) in the space left free by the floating cards.
    const wide = W >= 1000;
    const padL = wide ? 300 : W >= 700 ? 40 : 8;
    const padR = wide ? 310 : W >= 700 ? 40 : 8;
    const padT = wide ? 18 : 40, padB = wide ? 18 : 40;
    const pts = [];
    for (let x = FOCUS_BBOX.w; x <= FOCUS_BBOX.e; x += 0.5) { pts.push([x, FOCUS_BBOX.s], [x, FOCUS_BBOX.n]); }
    for (let y = FOCUS_BBOX.s; y <= FOCUS_BBOX.n; y += 0.5) { pts.push([FOCUS_BBOX.w, y], [FOCUS_BBOX.e, y]); }
    const proj = d3.geoConicConformal().parallels([44, 52]).rotate([-31.5, 0]).precision(0.2);
    const x0 = B + padL, x1 = W - B - padR, y0 = B + padT, y1 = H - B - padB;
    if (x1 - x0 < 200 || y1 - y0 < 120) {
      // tiny stage: fall back to the whole frame
      return proj.fitExtent([[B + 4, B + 4], [W - B - 4, H - B - 4]], { type: "MultiPoint", coordinates: pts });
    }
    return proj.fitExtent([[x0, y0], [x1, y1]], { type: "MultiPoint", coordinates: pts });
  }

  function resize(initial) {
    const r = stageEl.getBoundingClientRect();
    const W = Math.max(320, Math.round(r.width)), H = Math.max(240, Math.round(r.height));
    if (!initial && W === S.W && H === S.H) return;

    // keep the geographic centre + zoom factor across resizes
    let keep = null;
    if (!initial && S.projection) {
      const c = S.projection.invert(S.t.invert([S.W / 2, S.H / 2]));
      keep = { c, k: S.t.k };
    }
    S.W = W; S.H = H; S.B = W < 560 ? 18 : 22;
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    d3.select("#sea-bg").attr("x", 0).attr("y", 0).attr("width", W).attr("height", H);
    d3.select("#clip-frame-rect").attr("x", S.B).attr("y", S.B).attr("width", W - 2 * S.B).attr("height", H - 2 * S.B);

    S.projection = makeProjection();
    S.path = d3.geoPath(S.projection);
    // Drawing generator clipped just past the pan limits (see setupZoom) so off-screen
    // coastlines never reach the DOM. S.path stays unclipped for centroids/bounds.
    S.draw = d3.geoPath(S.projection.copy().clipExtent([[-W * 0.7, -H * 0.7], [W * 1.7, H * 1.7]]));
    renderGeo();
    buildGraticuleSamples();
    setupZoom();

    if (keep && keep.c) {
      const p = S.projection(keep.c);
      const t = d3.zoomIdentity.translate(W / 2 - p[0] * keep.k, H / 2 - p[1] * keep.k).scale(keep.k);
      svg.call(S.zoom.transform, t);
    } else {
      svg.call(S.zoom.transform, d3.zoomIdentity);
    }
  }

  function renderGeo() {
    const path = S.draw;

    // land clip shared by all Ukraine + history layers
    d3.select("#clip-land").remove();
    svg.select("defs").append("clipPath").attr("id", "clip-land").append("path").attr("d", path(S.data.land));

    // graticule
    const g = S.layers.gratMinor; g.selectAll("*").remove();
    g.append("path").attr("class", "grat-fine").attr("id", "grat-fine")
      .attr("d", path(d3.geoGraticule().extent([[-10, 28], [80.01, 72.01]]).step([0.5, 0.5]).precision(0.5)()));
    g.append("path").attr("class", "grat-minor")
      .attr("d", path(d3.geoGraticule().extent([[-10, 28], [80.01, 72.01]]).step([1, 1]).precision(0.5)()));
    g.append("path").attr("class", "grat-major")
      .attr("d", path(d3.geoGraticule().extent([[-10, 25], [80.01, 75.01]]).step([5, 5]).precision(0.5)()));

    // periphery
    const p = S.layers.periphery; p.selectAll("*").remove();
    p.append("path").attr("class", "coast-glow").attr("d", path(S.data.land));
    p.selectAll("path.country").data(S.data.countries).join("path")
      .attr("class", "country").attr("d", path)
      .on("pointerenter", (ev, d) => hoverCountry(d, ev))
      .on("pointermove", (ev, d) => { if (S.era && !S.presentDay) hoverCountry(d, ev); else moveTooltip(ev); })
      .on("pointerleave", () => hoverCountry(null));
    p.selectAll("path.country-tnr").data(S.data.breakaway).join("path")
      .attr("class", "country-tnr").attr("d", path);

    // Ukraine base (opaque land under the tint so periphery data never shows through, e.g. Crimea)
    const b = S.layers.ukrBase; b.selectAll("*").remove();
    b.append("path").attr("class", "ukr-base").attr("d", path(S.ukr.outline));
    b.selectAll("path.ukr-base-ob").data(S.ukr.features).join("path").attr("class", "ukr-base ukr-base-ob").attr("d", path);

    // hydrography
    const hb = S.layers.hydro; hb.selectAll("*").remove();
    hb.selectAll("path.lake").data(S.data.lakes).join("path")
      .attr("class", (d) => "lake" + (/Kakhovka/i.test(d.properties.name || "") ? " drained" : ""))
      .attr("d", path);
    hb.selectAll("path.river").data(S.data.rivers).join("path")
      .attr("class", "river").attr("d", path)
      .attr("stroke-width", (d) => Math.max(0.5, 2.1 - (d.properties.scalerank || 6) * 0.17));

    // oblast hit areas + tint
    const o = S.layers.oblasts; o.selectAll("*").remove();
    o.selectAll("path.oblast").data(S.ukr.features, (d) => d.id).join("path")
      .attr("class", "oblast").attr("data-id", (d) => d.id).attr("d", path)
      .on("pointerenter", (ev, d) => hoverOblast(d, ev))
      .on("pointermove", (ev, d) => { if (S.era && !S.presentDay) hoverOblast(d, ev); else moveTooltip(ev); })
      .on("pointerleave", () => hoverOblast(null))
      .on("click", (ev, d) => { ev.stopPropagation(); selectRegion(S.selectedId === d.id ? null : d.id); });

    // borders. ADM1 polygons extend into territorial waters, so land-clip them;
    // the coast itself is drawn from the land outline, clipped to Ukraine.
    const br = S.layers.borders; br.selectAll("*").remove();
    const outline = S.ukr.border || S.ukr.outline;
    const clipId = "clip-ukr";
    d3.select(`#${clipId}`).remove();
    svg.select("defs").append("clipPath").attr("id", clipId).append("path").attr("d", path(S.ukr.outline));
    const onLand = br.append("g").attr("clip-path", "url(#clip-land)");
    if (S.ukr.mesh) onLand.append("path").attr("class", "oblast-mesh").attr("d", path(S.ukr.mesh));
    onLand.append("g").attr("clip-path", `url(#${clipId})`).append("path").attr("class", "nat-inner").attr("d", path(outline));
    onLand.append("path").attr("class", "nat-border").attr("d", path(outline));
    const [[ux0, uy0], [ux1, uy1]] = S.path.bounds(S.ukr.outline);
    const coastPath = d3.geoPath(S.projection.copy().clipExtent([[ux0 - 4, uy0 - 4], [ux1 + 4, uy1 + 4]]));
    br.append("path").attr("class", "nat-coast").attr("clip-path", `url(#${clipId})`).attr("d", coastPath(S.data.land));

    S.ukrBaseW = (() => { const b = S.path.bounds(S.ukr.outline); return b[1][0] - b[0][0]; })();

    // hover outline holder
    S.layers.hover.selectAll("*").remove();
    S.layers.hover.append("path").attr("class", "oblast-selected").style("display", "none");
    S.layers.hover.append("path").attr("class", "oblast-hover").style("display", "none");
    renderSelection();

    // all strokes inside zoom layer: constant screen width
    S.layers.zoom.selectAll("path").attr("vector-effect", "non-scaling-stroke");

    // history layers depend on projection too
    renderHistoricalLands();
    renderEraGeo(S.era, false);

    buildLabelItems();
  }

  /* ------------------------------------------------------------------
     Zoom & pan
     ------------------------------------------------------------------ */
  function setupZoom() {
    const { W, H } = S;
    if (!S.zoom) {
      S.zoom = d3.zoom()
        .scaleExtent([0.5, 18])
        .on("start", (ev) => {
          if (ev.sourceEvent && ev.sourceEvent.type === "mousedown") svg.classed("dragging", true);
          S.obstacles = measureObstacles(); // cards don't move mid-gesture: measure once, not every frame
        })
        .on("zoom", (ev) => onZoom(ev.transform))
        .on("end", () => { svg.classed("dragging", false); S.obstacles = null; });
      svg.call(S.zoom).on("dblclick.zoom", null);
      svg.on("pointermove.coords", onPointerMove).on("pointerleave.coords", () => { $("ro-ll").textContent = "—"; });
      svg.on("click.reset", () => selectRegion(null));
    }
    S.zoom.translateExtent([[-W * 0.6, -H * 0.6], [W * 1.6, H * 1.6]]).extent([[0, 0], [W, H]]);
  }

  let zoomRaf = 0;
  function onZoom(t) {
    S.t = t;
    S.layers.zoom.attr("transform", t);
    if (!zoomRaf) zoomRaf = requestAnimationFrame(() => { zoomRaf = 0; afterZoom(); });
  }

  let patternK = NaN;
  function afterZoom() {
    const k = S.t.k;
    // constant-density hatching (rewriting patternTransform re-rasterises every hatched fill, so only on scale change)
    if (k !== patternK) {
      patternK = k;
      d3.selectAll("pattern.zpat").attr("patternTransform", function () {
        const a = +this.getAttribute("data-angle") || 0;
        return `scale(${1 / k}) rotate(${a})`;
      });
    }
    d3.select("#grat-fine").style("display", k >= 2.5 && S.visible.graticule ? null : "none");
    $("ro-zoom").textContent = (k < 10 ? k.toFixed(1) : Math.round(k)) + "×";
    updateLabels();
    drawFrame();
    drawCompass();
    drawScaleBar();
  }

  /** Zoom so the selected era's territory (and overlays) fill the free map area. */
  function fitEra() {
    const e = S.era;
    if (!e || S.presentDay || !e.territory) { resetView(); return; }
    const geoms = [e.territory].concat((e.overlays || []).map((o) => o.territory));
    zoomToFeature({ type: "GeometryCollection", geometries: geoms }, 0.08);
  }

  function zoomBy(f) { svg.transition().duration(350).call(S.zoom.scaleBy, f, [S.W / 2, S.H / 2]); }
  function resetView() { svg.transition().duration(650).call(S.zoom.transform, d3.zoomIdentity); }

  /** Screen rectangle not covered by expanded cards. */
  function freeRect() {
    const { W, H, B } = S;
    const sr = stageEl.getBoundingClientRect();
    let x0 = B + 8, x1 = W - B - 8;
    if (W >= 860) {
      ["panel-legend", "panel-intel"].forEach((id) => {
        const el = $(id);
        if (!el || el.classList.contains("collapsed")) return;
        const r = el.getBoundingClientRect();
        if (r.left - sr.left < W / 2) x0 = Math.max(x0, r.right - sr.left + 12);
        else x1 = Math.min(x1, r.left - sr.left - 12);
      });
    }
    if (x1 - x0 < W * 0.35) { x0 = B + 8; x1 = W - B - 8; }
    return { x0, x1, y0: B + 8, y1: H - B - 8 };
  }

  function zoomToFeature(f, padFrac) {
    const [[bx0, by0], [bx1, by1]] = S.path.bounds(f);
    const r = freeRect();
    const fw = r.x1 - r.x0, fh = r.y1 - r.y0;
    const pad = padFrac || 0.18;
    const k = Math.max(0.5, Math.min(14, (1 - pad * 2) / Math.max((bx1 - bx0) / fw, (by1 - by0) / fh)));
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
    const t = d3.zoomIdentity.translate((r.x0 + r.x1) / 2 - cx * k, (r.y0 + r.y1) / 2 - cy * k).scale(k);
    svg.transition().duration(800).ease(d3.easeCubicInOut).call(S.zoom.transform, t);
  }

  /* ------------------------------------------------------------------
     Labels (screen space, collision-managed)
     ------------------------------------------------------------------ */
  function riverAnchor(name, at) {
    // longest feature with this name; walk 'at' fraction along it
    const feats = S.data.rivers.filter((f) => (f.properties.name || "") === name);
    if (!feats.length) return null;
    let best = null, bestLen = -1;
    feats.forEach((f) => {
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
      lines.forEach((l) => { const len = d3.geoLength({ type: "LineString", coordinates: l }); if (len > bestLen) { bestLen = len; best = l; } });
    });
    if (!best || best.length < 3) return null;
    const i = Math.max(1, Math.min(best.length - 2, Math.floor(best.length * at)));
    const a = best[Math.max(0, i - 3)], b = best[Math.min(best.length - 1, i + 3)];
    return { ll: best[i], a, b };
  }

  function buildLabelItems() {
    const items = [];
    const P = S.projection;

    SEA_LABELS.forEach((s, i) => items.push({ id: "sea" + i, kind: "sea", text: s.text, xy: P(s.ll), pri: 40, base: s.size * 0.85, grow: 0.8, max: s.size + 3, ls: s.ls }));
    COUNTRY_LABELS.forEach((c, i) => items.push({ id: "ctry" + i, kind: c.small ? "country-sm" : "country", text: c.text, xy: P(c.ll), pri: c.small ? 46 : 42, base: c.size * 0.78, grow: 1.1, max: c.size + 2, minK: c.minK || 0 }));

    RIVER_LABELS.forEach((r) => {
      const a = riverAnchor(r.ne, r.at);
      if (!a) return;
      const pa = P(a.a), pb = P(a.b);
      let ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      items.push({ id: "riv-" + r.ne, kind: "river", text: r.text, xy: P(a.ll), pri: 70, base: 9.5, grow: 1, max: 13, rot: ang, minK: 1.15, layer: "rivers" });
    });

    // oblast labels
    S.ukr.features.forEach((f) => {
      const m = f.properties;
      const xy = m.lab ? P(m.lab) : S.path.centroid(f);
      items.push({ id: "ob-" + f.id, kind: "oblast", oid: f.id, text: m.short, sub: null, pre: m.sub || null, xy, pri: 10, base: 9.5, grow: 1.5, max: 14, minK: m.minK || 0, layer: "oblastLabels" });
    });

    // cities: oblast centres (unique), extras, periphery
    const seen = new Set();
    S.ukr.features.forEach((f) => {
      const m = f.properties;
      if (!m.ll || seen.has(m.center)) return;
      seen.add(m.center);
      const isCap = m.center === "Kyiv";
      items.push({ id: "c-" + m.center, ll: m.ll, major: MAJOR.has(m.center), kind: isCap ? "capital" : "city", text: m.center, xy: P(m.ll), pri: isCap ? 1 : 20, base: isCap ? 13 : 11.5, grow: 0.8, max: isCap ? 15 : 13.5, dot: isCap ? "cap" : "center", layer: isCap ? null : "cities" });
    });
    UA_CITIES.forEach((c) => items.push({ id: "c-" + c.name, ll: c.ll, kind: "city", text: c.name, xy: P(c.ll), pri: c.tier === 2 ? 30 : 60, base: 10.5, grow: 1, max: 13, dot: "town", minK: c.tier === 2 ? 1.3 : 2.4, layer: "cities" }));
    EXT_CITIES.forEach((c) => items.push({ id: "x-" + c.name, ll: c.ll, kind: "ext", text: c.name, xy: P(c.ll), pri: c.cap ? 44 : 65, base: c.cap ? 10.5 : 10, grow: 1, max: 13, dot: c.cap ? "extcap" : "ext", minK: c.cap ? 0 : 1.6, layer: "cities" }));

    // era-specific (territory label, capital, overlays)
    const eraItems = eraLabelItems();
    const cap = eraItems.find((d) => d.kind === "eracap");
    const near = (a, b) => a && b && Math.abs(a[0] - b[0]) < 0.15 && Math.abs(a[1] - b[1]) < 0.12;
    const kept = cap ? items.filter((d) => !(d.dot && near(d.ll, cap.ll))) : items.slice();
    items.length = 0;
    items.push(...kept, ...eraItems);

    S.labelItems = items;
    joinLabels();
  }

  function eraLabelItems() {
    const era = S.era;
    if (!era || S.presentDay) return [];
    const P = S.projection, out = [];
    const tag = "e" + era._seq + "-";
    // era labels outrank oblast/city labels (pri ≤ 6 always shows) so each polity is named on the map
    if (era.territory && S.visible.grayZone) {
      const xy = labelAnchor(era.territory, era.labelPoint);
      const lbl = mapLabel(era.territoryLabel || era.polity || era.name || "");
      if (xy && lbl && lbl.length <= 40) out.push({ id: tag + "terr", kind: "territory", text: lbl.toUpperCase(), xy, pri: 2, base: 11.5, grow: 1.4, max: 17, era: true });
    }
    if (S.visible.overlays) (era.overlays || []).forEach((ov, i) => {
      if (!ov.name) return;
      const xy = labelAnchor(ov.territory, ov.labelPoint);
      if (xy) out.push({ id: tag + ov._key, kind: "overlay", ok: ov.kind, cvar: ov._color, text: mapLabel(ov.name), xy, pri: Math.min(3 + i, 6), base: 10, grow: 1.1, max: 13.5, era: true });
    });
    if (era.capital && isFinite(era.capital.lon) && isFinite(era.capital.lat)) {
      out.push({ id: tag + "cap", kind: "eracap", text: String(era.capital.name || "Capital"), xy: P([era.capital.lon, era.capital.lat]), pri: 0, base: 12, grow: 0.8, max: 14, dot: "eracap", era: true, ll: [era.capital.lon, era.capital.lat] });
    }
    return out;
  }

  /** Short on-map form of a polity name: drop bracketed detail and, if still long, trailing
   *  clauses (the sidebar keeps the full name). */
  function mapLabel(name) {
    let s = String(name).replace(/\s*\([^)]*\)/g, "").trim();
    if (s.length > 32) s = s.split(/[,;:]/)[0].trim();
    return s || String(name);
  }

  /** Label point for a geometry: an explicit [lon, lat], else the grid-sampled point of its
   *  largest polygon farthest from the edge (centroids fall outside crescents and rings). */
  function labelAnchor(geom, explicit) {
    const P = S.projection;
    if (Array.isArray(explicit) && isFinite(explicit[0])) return P(explicit);
    const lp = U.largestPolygon(geom);
    if (!lp) return null;
    const ring = lp.coordinates[0].map(P).filter((p) => p && isFinite(p[0]));
    const c = S.path.centroid(lp);
    if (ring.length < 4) return isFinite(c[0]) ? c : null;
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    const x0 = d3.min(xs), x1 = d3.max(xs), y0 = d3.min(ys), y1 = d3.max(ys);
    const edgeDist = (p) => {
      let m = Infinity;
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i], dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        m = Math.min(m, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
      }
      return m;
    };
    const N = 20;
    let best = null, bestD = -1;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const p = [x0 + (i + 0.5) * (x1 - x0) / N, y0 + (j + 0.5) * (y1 - y0) / N];
      if (!d3.polygonContains(ring, p)) continue;
      const dd = edgeDist(p) - 0.15 * Math.hypot(p[0] - c[0], p[1] - c[1]); // mild pull toward the centroid
      if (dd > bestD) { bestD = dd; best = p; }
    }
    return best || (isFinite(c[0]) ? c : null);
  }

  /** Names of the era's polities that contain a lon/lat (main territory first). */
  function politiesAt(ll) {
    const e = S.era;
    if (!e || S.presentDay || !ll) return [];
    const out = [];
    if (e.territory && S.visible.grayZone && d3.geoContains(e.territory, ll)) out.push({ name: e.territoryLabel || e.polity || e.name, color: "--hist-strong", kind: "Era territory" });
    if (S.visible.overlays) e.overlays.slice().reverse().forEach((o) => { if (d3.geoContains(o.territory, ll)) out.push({ name: o.name, color: o._color, kind: OV_KIND_NAME[o.kind] }); });
    return out;
  }

  function eraTipHtml(ev) {
    if (!S.era || S.presentDay) return "";
    const [mx, my] = d3.pointer(ev, svg.node());
    const list = politiesAt(S.projection.invert(S.t.invert([mx, my])));
    const yr = U.fmtYear(S.era.territoryAsOf || S.era.startYear);
    if (!list.length) return `<span class="tt-era">In ${escapeHtml(yr)}: outside the mapped polities</span>`;
    return `<span class="tt-era">In ${escapeHtml(yr)}:</span>` + list.map((p) =>
      `<span class="tt-pol"><i style="background:var(${p.color})"></i>${escapeHtml(p.name)}<em>${escapeHtml(p.kind)}</em></span>`).join("");
  }

  /** Emphasise one era shape ("terr" or an overlay key) and dim the rest; null clears. */
  function focusShape(key) {
    S.focusKey = key || null;
    const H = S.layers.history;
    H.classed("focusing", !!key);
    H.selectAll("[data-key]").classed("focus", function () { return !!key && this.getAttribute("data-key") === key; });
  }

  function labelClass(d) {
    switch (d.kind) {
      case "sea": return "lbl-sea";
      case "country": return "lbl-country";
      case "country-sm": return "lbl-country-sm";
      case "river": return "lbl-river";
      case "oblast": return "lbl-oblast";
      case "capital": return "lbl-capital";
      case "city": return "lbl-city";
      case "ext": return "lbl-city ext";
      case "territory": return "lbl-territory";
      case "overlay": return "lbl-ov k-" + d.ok;
      case "eracap": return "lbl-era-cap";
      default: return "";
    }
  }

  function joinLabels() {
    const L = S.layers.labels;
    const sel = L.selectAll("g.lbl").data(S.labelItems, (d) => d.id);
    sel.exit().filter(function (d) { return d.era; })
      .classed("leaving", true).transition().duration(ERA_FADE_MS / 2).style("opacity", 0).remove();
    sel.exit().filter(function (d) { return !d.era; }).remove();

    const g = sel.enter().append("g").attr("class", "lbl");
    g.filter((d) => d.era).style("opacity", 0).transition().delay(ERA_FADE_MS * 0.35).duration(ERA_FADE_MS).style("opacity", 1);

    g.each(function (d) {
      const n = d3.select(this);
      if (d.dot === "cap") {
        n.append("circle").attr("class", "cap-ring").attr("r", 6.5);
        n.append("circle").attr("class", "cap-mark").attr("r", 3.2);
      } else if (d.dot === "center") {
        n.append("rect").attr("class", "city-dot center").attr("x", -3).attr("y", -3).attr("width", 6).attr("height", 6);
      } else if (d.dot === "town") {
        n.append("circle").attr("class", "city-dot").attr("r", 2.4);
      } else if (d.dot === "extcap") {
        n.append("rect").attr("class", "city-dot ext").attr("x", -2.8).attr("y", -2.8).attr("width", 5.6).attr("height", 5.6).attr("transform", "rotate(45)");
      } else if (d.dot === "ext") {
        n.append("circle").attr("class", "city-dot ext").attr("r", 2);
      } else if (d.dot === "eracap") {
        n.append("circle").attr("class", "era-cap-ring").attr("r", 7.5);
        n.append("path").attr("class", "era-cap-mark").attr("d", d3.symbol(d3.symbolStar, 70)());
      }
      const t = n.append("text").attr("class", labelClass(d));
      if (d.ls) t.style("letter-spacing", d.ls);
      if (d.cvar) t.style("fill", `var(${d.cvar})`);
      if (d.kind === "eracap") {
        n.append("text").attr("class", "lbl-era-cap-k").text("ERA CAPITAL");
      }
      if (d.pre) t.append("tspan").attr("class", "pre").text(d.pre + " ");
      t.append("tspan").attr("class", "main").text(d.text);
      if (d.sub) n.append("text").attr("class", "lbl-oblast sub").text(d.sub);
      d._node = this;
    });
    // re-bind node refs for updates
    L.selectAll("g.lbl").each(function (d) { d._node = this; });
    updateLabels();
  }

  function fontSize(d, k) {
    const s = d.base + d.grow * Math.log2(Math.max(k, 0.5));
    return Math.max(d.base * 0.85, Math.min(d.max, s));
  }

  function measureObstacles() {
    const sr = stageEl.getBoundingClientRect(), out = [];
    document.querySelectorAll(".card, .instruments > *, .zoomctl").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) out.push({ x0: r.left - sr.left - 4, x1: r.right - sr.left + 4, y0: r.top - sr.top - 4, y1: r.bottom - sr.top + 4 });
    });
    return out;
  }

  function updateLabels() {
    if (!S.labelItems.length) return;
    const t = S.t, k = t.k, { W, H, B } = S;
    const placed = [];
    const hits = (b) => placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
    // floating cards and instruments act as obstacles so labels never hide underneath them
    placed.push(...(S.obstacles || measureObstacles()));
    const inFrame = (b) => b.x0 >= B + 2 && b.x1 <= W - B - 2 && b.y0 >= B + 2 && b.y1 <= H - B - 2;
    const items = S.labelItems.slice().sort((a, b) => a.pri - b.pri);
    const oblLabelsHidden = !S.visible.oblastLabels;

    for (const d of items) {
      const node = d._node; if (!node) continue;
      const sel = d3.select(node);
      if (sel.classed("leaving")) continue;
      const [x, y] = t.apply(d.xy);
      let show = isFinite(x) && x > B - 40 && x < W - B + 40 && y > B - 40 && y < H - B + 40 && k >= (d.minK || 0);
      if (d.layer && !S.visible[d.layer]) show = false;
      if (d.kind === "oblast" && oblLabelsHidden) show = false;
      if (d.kind === "oblast" && S.ukrBaseW * k < 380) show = false;
      if (!show) { node.style.display = "none"; continue; }
      node.style.display = null;

      const fs = fontSize(d, k);
      const txt = node.querySelector("text");
      const sub = node.querySelector("text.sub");
      const key = node.querySelector("text.lbl-era-cap-k");
      txt.setAttribute("font-size", fs.toFixed(1));
      const chars = (d.pre ? d.pre.length + 1 : 0) + d.text.length;
      const lsEm = d.kind === "country" ? 0.2 : d.kind === "sea" ? 0.24 : d.kind === "oblast" ? 0.08 : d.kind === "territory" ? 0.22 : 0.03;
      const upper = d.text === d.text.toUpperCase();
      const w = chars * fs * ((upper ? 0.64 : 0.53) + lsEm) + 2;
      const h = fs * 1.05;
      let box, anchor = "middle", tx = 0, ty = 0;

      if (d.dot) {
        // try right, left, above, below
        const off = d.dot === "cap" || d.dot === "eracap" ? 10 : 6;
        const cands = [
          { a: "start", tx: off, ty: fs * 0.35, b: { x0: x + off, x1: x + off + w, y0: y - h * 0.65, y1: y + h * 0.45 } },
          { a: "end", tx: -off, ty: fs * 0.35, b: { x0: x - off - w, x1: x - off, y0: y - h * 0.65, y1: y + h * 0.45 } },
          { a: "middle", tx: 0, ty: -off - 2, b: { x0: x - w / 2, x1: x + w / 2, y0: y - off - 2 - h, y1: y - off } },
          { a: "middle", tx: 0, ty: off + fs * 0.85, b: { x0: x - w / 2, x1: x + w / 2, y0: y + off, y1: y + off + h } },
        ];
        if (d.kind === "eracap") cands.forEach((c) => { c.ty += 4; c.b.y1 += 10; });
        const dotBox = { x0: x - 4, x1: x + 4, y0: y - 4, y1: y + 4 };
        let chosen = null;
        const sparse = d.dot === "center" && !d.major && S.ukrBaseW * k < 640;
        if (!sparse) for (const c of cands) { if (!hits(c.b) && inFrame(c.b)) { chosen = c; break; } }
        if (!chosen && d.pri <= 1) chosen = cands[0]; // capital always labelled
        placed.push(dotBox);
        if (!chosen) { txt.style.display = "none"; if (key) key.style.display = "none"; node.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`); continue; }
        txt.style.display = null;
        anchor = chosen.a; tx = chosen.tx; ty = chosen.ty; box = chosen.b;
        if (key) {
          key.style.display = null;
          key.setAttribute("text-anchor", anchor); key.setAttribute("x", tx); key.setAttribute("y", ty + 10);
        }
      } else {
        const rows = sub ? 2 : 1;
        const hh = h * rows + (sub ? 1 : 0);
        ty = sub ? -fs * 0.05 : fs * 0.35;
        box = d.rot
          ? { x0: x - w / 2, x1: x + w / 2, y0: y - Math.abs(Math.sin(d.rot * Math.PI / 180)) * w / 2 - h / 2, y1: y + Math.abs(Math.sin(d.rot * Math.PI / 180)) * w / 2 + h / 2 }
          : { x0: x - w / 2, x1: x + w / 2, y0: y - (sub ? h : h * 0.65), y1: y - (sub ? h : h * 0.65) + hh };
        // era labels near the frame edge slide inward (up to half their width) instead of hiding
        if (d.era && !d.rot) {
          box.y0 -= 2; box.y1 += 2; // breathing room so stacked era labels never touch
          const lo = B + 4, hi = W - B - 4;
          const shift = box.x0 < lo ? lo - box.x0 : box.x1 > hi ? hi - box.x1 : 0;
          if (shift && Math.abs(shift) <= w / 2) { tx = shift; box.x0 += shift; box.x1 += shift; }
          // on a collision, try nearby spots (closest first) before accepting the overlap
          if (hits(box)) {
            const cands = [];
            for (const dy of [0, -1.4, 1.4, -2.6, 2.6, -3.8, 3.8]) for (const dx of [0, -0.3, 0.3])
              if (dx || dy) cands.push([dx * w, dy * h]);
            cands.sort((a, b) => Math.hypot(a[0], a[1] * 1.5) - Math.hypot(b[0], b[1] * 1.5));
            for (const [dx, dy] of cands) {
              const b = { x0: box.x0 + dx, x1: box.x1 + dx, y0: box.y0 + dy, y1: box.y1 + dy };
              if (!hits(b) && inFrame(b)) { box = b; tx += dx; ty += dy; break; }
            }
          }
        }
        if ((hits(box) && d.pri > 6) || !inFrame(box)) { node.style.display = "none"; continue; }
      }
      placed.push(box);
      txt.setAttribute("text-anchor", anchor);
      txt.setAttribute("x", tx); txt.setAttribute("y", ty);
      if (sub) {
        sub.setAttribute("font-size", (fs * 0.62).toFixed(1));
        sub.setAttribute("text-anchor", "middle");
        sub.setAttribute("x", 0); sub.setAttribute("y", ty + fs * 0.82);
        sub.style.letterSpacing = ".38em";
        sub.style.fill = "#8d8a6f";
      }
      node.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})${d.rot ? ` rotate(${d.rot.toFixed(1)})` : ""}`);
    }
  }

  /* ------------------------------------------------------------------
     Frame / neatline with graticule tick labels
     ------------------------------------------------------------------ */
  function buildGraticuleSamples() {
    const P = S.projection;
    const mer = [], par = [];
    for (let i = 0; i <= 80 * 6; i++) {
      const lon = -10 + i / 6;
      const pts = [];
      for (let lat = 25; lat <= 72; lat += 0.5) pts.push(P([lon, lat]));
      mer.push({ v: lon, pts });
    }
    for (let i = 0; i <= 45 * 6; i++) {
      const lat = 28 + i / 6;
      const pts = [];
      for (let lon = -12; lon <= 82; lon += 0.5) pts.push(P([lon, lat]));
      par.push({ v: lat, pts });
    }
    S.gratLines = { mer, par };
  }

  function crossings(line, axis, value, lo, hi) {
    const t = S.t, out = [];
    let prev = null;
    for (const p of line.pts) {
      const q = t.apply(p);
      if (prev) {
        const a = axis === "y" ? prev[1] : prev[0], b = axis === "y" ? q[1] : q[0];
        if ((a - value) * (b - value) <= 0 && a !== b) {
          const f = (value - a) / (b - a);
          const o = axis === "y" ? prev[0] + f * (q[0] - prev[0]) : prev[1] + f * (q[1] - prev[1]);
          if (o >= lo && o <= hi) out.push(o);
        }
      }
      prev = q;
    }
    return out;
  }

  function fmtDeg(v, isLat) {
    const hemi = isLat ? (v >= 0 ? "N" : "S") : (v >= 0 ? "E" : "W");
    const a = Math.abs(v);
    let d = Math.floor(a + 1e-9), m = Math.round((a - d) * 60);
    if (m === 60) { d += 1; m = 0; }
    return m ? `${d}°${String(m).padStart(2, "0")}′${hemi}` : `${d}°${hemi}`;
  }

  function drawFrame() {
    const { W, H, B } = S;
    const F = S.layers.frame;
    F.selectAll("*").remove();
    // band (outer minus inner)
    F.append("path").attr("class", "frame-band").attr("fill-rule", "evenodd")
      .attr("d", `M0,0H${W}V${H}H0Z M${B},${B}V${H - B}H${W - B}V${B}Z`);
    F.append("rect").attr("class", "frame-line").attr("x", 0.5).attr("y", 0.5).attr("width", W - 1).attr("height", H - 1);
    F.append("rect").attr("class", "frame-line").attr("x", B + 0.5).attr("y", B + 0.5).attr("width", W - 2 * B - 1).attr("height", H - 2 * B - 1);

    // choose label step from current on-screen spacing of 1° meridians at mid-height
    const k = S.t.k;
    const c = S.projection.invert(S.t.invert([W / 2, H / 2])) || [31.5, 48.5];
    const p1 = S.t.apply(S.projection([c[0], c[1]])), p2 = S.t.apply(S.projection([c[0] + 1, c[1]]));
    const pxPerDeg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = [10, 5, 2, 1, 0.5, 1 / 3, 1 / 6];
    let major = 10;
    for (const s of steps) { if (pxPerDeg * s >= (W < 560 ? 56 : 70)) major = s; }
    const minor = major >= 5 ? 1 : major >= 1 ? major / 2 : major === 0.5 ? 1 / 6 : 1 / 6;
    const isOn = (v, s) => Math.abs(v / s - Math.round(v / s)) < 1e-6;

    // built as markup in one pass: hundreds of d3 appends per zoom frame were a hot spot
    let ticks = "", lbls = "";
    const tick = (cls, x1, x2, y1, y2) => { ticks += `<line class="${cls}" x1="${x1}" x2="${x2}" y1="${y1}" y2="${y2}"></line>`; };

    // meridians → top & bottom
    for (const m of S.gratLines.mer) {
      const isMaj = isOn(m.v, major), isMin = isOn(m.v, minor);
      if (!isMaj && !isMin) continue;
      for (const [Y, dir] of [[B, -1], [H - B, 1]]) {
        const xs = crossings(m, "y", Y, B, W - B);
        for (const x of xs) {
          const len = isMaj ? 7 : 4;
          tick(isMaj ? "frame-tick" : "frame-tick-minor", x, x, Y, Y + dir * len);
          if (isMaj) lbls += `<text class="frame-lbl" text-anchor="middle" x="${x}" y="${dir < 0 ? B - 9 : H - B + 15}">${fmtDeg(m.v, false)}</text>`;
        }
      }
    }
    // parallels → left & right
    for (const p of S.gratLines.par) {
      const isMaj = isOn(p.v - 28, major) && isOn(p.v, major), isMin = isOn(p.v, minor);
      if (!isMaj && !isMin) continue;
      for (const [X, dir] of [[B, -1], [W - B, 1]]) {
        const ys = crossings(p, "x", X, B, H - B);
        for (const y of ys) {
          const len = isMaj ? 7 : 4;
          tick(isMaj ? "frame-tick" : "frame-tick-minor", X, X + dir * len, y, y);
          if (isMaj) {
            const tx = dir < 0 ? B - 8 : W - B + 8;
            lbls += `<text class="frame-lbl" text-anchor="middle" transform="translate(${tx},${y}) rotate(${dir < 0 ? -90 : 90})" dy="3.5">${fmtDeg(p.v, true)}</text>`;
          }
        }
      }
    }
    F.append("g").html(ticks);
    F.append("g").html(lbls);
  }

  /* ------------------------------------------------------------------
     North arrow & scale bar
     ------------------------------------------------------------------ */
  function drawCompass() {
    const el = $("compass");
    if (!el.firstChild) {
      const s = d3.select(el).append("svg").attr("viewBox", "-17 -30 34 52");
      const g = s.append("g").attr("class", "rose");
      // simple split north arrow
      g.append("path").attr("d", "M0,-14 L6,8 L0,4 Z").style("fill", "var(--text-2)");
      g.append("path").attr("d", "M0,-14 L-6,8 L0,4 Z").attr("fill", "none").style("stroke", "var(--text-2)").attr("stroke-width", 1).attr("stroke-linejoin", "round");
      g.append("text").attr("x", 0).attr("y", -18).attr("text-anchor", "middle")
        .style("font-family", "var(--sans)").attr("font-weight", 600).attr("font-size", 11).style("fill", "var(--text)").text("N");
      s.append("text").attr("class", "conv").attr("x", 0).attr("y", 20).attr("text-anchor", "middle")
        .style("font-family", "var(--mono)").attr("font-size", 7).style("fill", "var(--text-3)");
    }
    // rotate so N follows the local meridian at map centre (conic convergence)
    const { W, H } = S;
    const c = S.projection.invert(S.t.invert([W / 2, H / 2]));
    if (!c) return;
    const a = S.projection([c[0], c[1] - 0.25]), b = S.projection([c[0], c[1] + 0.25]);
    const ang = Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI;
    d3.select(el).select("g.rose").attr("transform", `rotate(${ang.toFixed(2)})`);
    d3.select(el).select("text.conv").text(`${ang >= 0 ? "+" : "−"}${Math.abs(ang).toFixed(1)}°`);
    el.title = `Grid convergence at map centre: ${ang.toFixed(1)}°`;
  }

  function niceDist(maxKm) {
    const nice = [1, 2, 5, 10, 20, 25, 50, 100, 150, 200, 250, 300, 500, 750, 1000];
    let best = nice[0];
    for (const n of nice) if (n <= maxKm) best = n;
    return best;
  }

  function drawScaleBar() {
    const el = $("scalebar");
    const { W, H } = S;
    const c0 = S.projection.invert(S.t.invert([W / 2, H / 2]));
    const c1 = S.projection.invert(S.t.invert([W / 2 + 100, H / 2]));
    if (!c0 || !c1) return;
    const kmPerPx = d3.geoDistance(c0, c1) * R_EARTH / 100;
    const maxPx = W < 560 ? 100 : 150;
    const km = niceDist(kmPerPx * maxPx), kmPx = km / kmPerPx;
    const nm = niceDist(kmPerPx * maxPx / 1.852), nmPx = nm * 1.852 / kmPerPx;
    const w = Math.max(kmPx, nmPx) + 44;
    const key = `${W}|${km}|${nm}|${kmPx.toFixed(1)}|${nmPx.toFixed(1)}`;
    if (key === S.scaleKey) return;
    S.scaleKey = key;
    const s = d3.select(el).selectAll("svg").data([0]).join("svg").attr("width", w).attr("height", 40);
    s.selectAll("*").remove();
    const x0 = 1;
    // km above the line, nm below: one shared baseline like a printed chart scale
    const base = 20;
    s.append("line").attr("x1", x0).attr("x2", x0 + Math.max(kmPx, nmPx)).attr("y1", base).attr("y2", base).style("stroke", "var(--text-2)").attr("stroke-width", 1);
    const tick = (x, up, len) => s.append("line").attr("x1", x).attr("x2", x).attr("y1", base).attr("y2", base + (up ? -len : len)).style("stroke", "var(--text-2)").attr("stroke-width", 1);
    [0, 0.5, 1].forEach((f) => tick(x0 + kmPx * f, true, f === 0.5 ? 3 : 5));
    [0, 0.5, 1].forEach((f) => tick(x0 + nmPx * f, false, f === 0.5 ? 3 : 5));
    s.append("text").attr("x", x0 + kmPx).attr("y", base - 8).attr("text-anchor", "middle").text(km);
    s.append("text").attr("x", x0).attr("y", base - 8).attr("text-anchor", "start").text("0");
    s.append("text").attr("x", x0 + Math.max(kmPx, nmPx) + 8).attr("y", base - 4).text("km");
    s.append("text").attr("x", x0 + nmPx).attr("y", base + 15).attr("text-anchor", "middle").text(nm);
    s.append("text").attr("x", x0 + Math.max(kmPx, nmPx) + 8).attr("y", base + 10).text("nmi");
  }

  /* ------------------------------------------------------------------
     Hover / intel readout / tooltip
     ------------------------------------------------------------------ */
  const tip = $("tooltip");
  function showTooltip(html, ev) { tip.innerHTML = html; tip.classList.add("on"); moveTooltip(ev); }
  function hideTooltip() { tip.classList.remove("on"); }
  function moveTooltip(ev) {
    if (!ev || !tip.classList.contains("on")) return;
    const x = ev.clientX + 14, y = ev.clientY + 14;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(x, window.innerWidth - w - 8) + "px";
    tip.style.top = Math.min(y, window.innerHeight - h - 8) + "px";
  }

  function hoverOblast(f, ev) {
    S.hoverId = f ? f.id : null;
    S.layers.oblasts.selectAll("path.oblast").classed("hl", (d) => f && d.id === f.id);
    S.layers.labels.selectAll("g.lbl").select("text.lbl-oblast").classed("hl", (d) => f && d.oid === f.id);
    const hp = S.layers.hover.select("path.oblast-hover");
    if (!f) { hp.style("display", "none"); hideTooltip(); renderIntelDefault(); return; }
    hp.style("display", null).attr("d", S.path(f));
    const m = f.properties;
    showTooltip(`<b>${escapeHtml(m.name)}</b>Admin. centre ${escapeHtml(m.center)}${eraTipHtml(ev)}`, ev);
    renderIntelOblast(f);
  }

  /** Select a present-day region (ISO id) for the history sidebar; null clears. */
  function selectRegion(iso) {
    const id = iso && S.ukr.byId.has(iso) ? iso : null;
    if (id === S.selectedId) return;
    S.selectedId = id;
    renderSelection();
    emit("select", id ? S.ukr.byId.get(id) : null);
  }

  function renderSelection() {
    const f = S.selectedId && S.ukr.byId.get(S.selectedId);
    S.layers.oblasts.selectAll("path.oblast").classed("sel", (d) => !!f && d.id === f.id);
    const sp = S.layers.hover.select("path.oblast-selected");
    if (!f) { sp.style("display", "none"); return; }
    sp.style("display", null).attr("d", S.path(f));
  }

  function hoverCountry(f, ev) {
    S.layers.periphery.selectAll("path.country").classed("hl", (d) => f && d === f);
    if (!f) { hideTooltip(); if (!S.hoverId) renderIntelDefault(); return; }
    const nm = (f.properties && f.properties.name) || "—";
    showTooltip(`<b>${escapeHtml(nm)}</b>Neighbouring state today${eraTipHtml(ev)}`, ev);
    $("intel").innerHTML = `
      <div class="in-kind">Neighbouring state</div>
      <div class="in-name">${escapeHtml(nm)}</div>
      <div class="in-native">Outside the area of responsibility</div>
      <dl class="in-grid">
        <dt>Area</dt><dd>≈ ${fmtKm2(d3.geoArea(f) * R_EARTH * R_EARTH)}</dd>
        <dt>ISO 3166</dt><dd>${escapeHtml(f.id)}</dd>
      </dl>`;
  }

  function fmtKm2(v) { return d3.format(",.0f")(v) + " km²"; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function renderIntelDefault() {
    const n = S.ukr.features.length;
    $("intel").innerHTML = `
      <div class="in-kind">Area of responsibility</div>
      <div class="in-name">Ukraine</div>
      <div class="in-native">Україна</div>
      <dl class="in-grid">
        <dt>Capital</dt><dd>Kyiv</dd>
        <dt>Regions</dt><dd>${n || 27}: 24 oblasts, Crimea, 2 cities</dd>
        <dt>Area</dt><dd>603,628 km²</dd>
        <dt>Borders</dt><dd>Internationally recognized</dd>
      </dl>
      <div class="in-hint">Hover a region for details. Click it to read its history.</div>`;
  }

  function renderIntelOblast(f) {
    const m = f.properties;
    const c = d3.geoCentroid(f);
    const kind = m.kind ? m.kind.charAt(0) + m.kind.slice(1).toLowerCase() : "Oblast";
    $("intel").innerHTML = `
      <div class="in-kind">${escapeHtml(kind)} · ${m.iso}</div>
      <div class="in-name">${escapeHtml(m.name)}</div>
      <div class="in-native">${escapeHtml(m.native || "")}</div>
      <dl class="in-grid">
        <dt>Admin. centre</dt><dd>${escapeHtml(m.center)}</dd>
        <dt>Centroid</dt><dd class="mono">${fmtLL(c)}</dd>
      </dl>
      <div class="in-hint">Click to read this region's history.</div>`;
  }

  function fmtLL(ll) {
    return `${Math.abs(ll[1]).toFixed(2)}°${ll[1] >= 0 ? "N" : "S"} ${Math.abs(ll[0]).toFixed(2)}°${ll[0] >= 0 ? "E" : "W"}`;
  }

  function onPointerMove(ev) {
    const [mx, my] = d3.pointer(ev, svg.node());
    const ll = S.projection.invert(S.t.invert([mx, my]));
    if (!ll || !isFinite(ll[0])) return;
    $("ro-ll").textContent = `${U.dms(ll[1], true)}  ${U.dms(ll[0], false)}`;
  }

  function startClock() {
    const el = $("ro-date");
    if (el) el.textContent = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  /* ------------------------------------------------------------------
     Legend & layer toggles
     ------------------------------------------------------------------ */
  function buildLegend() {
    const sw = (inner) => `<svg viewBox="0 0 26 12" aria-hidden="true">${inner}</svg>`;
    const line = (style) => sw(`<path d="M1,6H25" style="fill:none;${style}"/>`);
    const box = (style, defs) => sw(`${defs || ""}<rect x="1" y="1.5" width="24" height="9" rx="1" style="${style}"/>`);
    const pat = (id, body, rot) => `<defs><pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(${rot || 45})">${body}</pattern></defs>`;
    const rows = [
      ["sec", "Present day"],
      [sw(`<rect x="1" y="1.5" width="24" height="9" rx="1" style="fill:var(--ukr-fill)"/><path d="M1,1.5H25" style="stroke:var(--accent);stroke-width:1.6"/>`), "Ukraine, international border"],
      [line("stroke:var(--oblast-edge);stroke-width:1"), "Oblast boundary"],
      [box("fill:var(--land);stroke:var(--land-edge)"), "Neighbouring state"],
      [box("fill:url(#lg-tnr);stroke:var(--breakaway);stroke-dasharray:2 2", pat("lg-tnr", `<line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--breakaway);stroke-width:1"/>`)), "Breakaway region"],
      [sw(`<circle cx="13" cy="6" r="4.5" style="fill:none;stroke:var(--accent);stroke-opacity:.5"/><circle cx="13" cy="6" r="2.4" style="fill:var(--accent)"/>`), "National capital"],
      [sw(`<rect x="10.5" y="3.5" width="5" height="5" style="fill:var(--text-2)"/>`), "Oblast centre · city"],
      [line("stroke:var(--water);stroke-width:1.4"), "River, reservoir"],
      ["sec", "Historical"],
      [box("fill:url(#lg-gz);stroke:var(--hist-strong);stroke-width:1.6", pat("lg-gz", `<rect width="4" height="4" style="fill:var(--hist-fill)"/><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--hist);stroke-opacity:.5"/>`)), "Ukrainian polity of the era"],
      [sw(`<rect x="1" y="1.5" width="7" height="9" rx="1" style="fill:var(--pol-1);fill-opacity:.28;stroke:var(--pol-1)"/><rect x="9.5" y="1.5" width="7" height="9" rx="1" style="fill:var(--pol-2);fill-opacity:.28;stroke:var(--pol-2)"/><rect x="18" y="1.5" width="7" height="9" rx="1" style="fill:var(--pol-3);fill-opacity:.28;stroke:var(--pol-3)"/>`), "Neighbouring powers (one colour each)"],
      [box("fill:var(--pol-4);fill-opacity:.12;stroke:var(--pol-4);stroke-dasharray:3 2"), "Related polity (dashed edge)"],
      [box("fill:url(#lg-occ);stroke:var(--occupied)", pat("lg-occ", `<line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--occupied);stroke-opacity:.8"/>`, -45)), "Occupied"],
      [box("fill:url(#lg-con);stroke:var(--contested);stroke-dasharray:3 2", pat("lg-con", `<line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--contested);stroke-opacity:.7"/><line x1="0" y1="2" x2="4" y2="2" style="stroke:var(--contested);stroke-opacity:.7"/>`)), "Contested"],
      [sw(`<circle cx="13" cy="6" r="5" style="fill:none;stroke:var(--hist);stroke-opacity:.6"/><path d="M13,2.6l1,2.2 2.4.3-1.8,1.6.5,2.4L13,7.9l-2.1,1.2.5-2.4-1.8-1.6 2.4-.3z" style="fill:var(--surface);stroke:var(--hist);stroke-width:.9"/>`), "Historical capital"],
      [line("stroke:var(--accent);stroke-opacity:.6;stroke-width:1.2;stroke-dasharray:4 3"), "Today's border (reference)"],
      [box("fill:url(#lg-st);stroke:var(--hist);stroke-opacity:.6;stroke-dasharray:1 2", `<defs><pattern id="lg-st" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" style="fill:var(--hist)"/><circle cx="3" cy="3" r=".7" style="fill:var(--hist)"/></pattern></defs>`), "Historical Ukrainian lands", "lg-hul"],
    ];
    $("legend-body").innerHTML = rows.map(([a, b, id]) => a === "sec"
      ? `<div class="sec-title">${b}</div>`
      : `<div class="lg-row"${id ? ` id="${id}"` : ""}>${a}<span>${b}</span></div>`).join("");
    updateLegendAvailability();
  }

  function updateLegendAvailability() {
    const r = $("lg-hul"); if (r) r.classList.toggle("dim", !S.historicalLands);
  }

  const TOGGLES = [
    ["oblastLabels", "Oblast labels"],
    ["cities", "Cities"],
    ["rivers", "Hydrography"],
    ["graticule", "Graticule"],
    ["grayZone", "Era territory"],
    ["overlays", "Neighbouring powers"],
    ["hul", "Historical Ukrainian lands"],
  ];

  function buildLayerToggles() {
    const host = $("layer-toggles");
    host.innerHTML = TOGGLES.map(([k, label]) =>
      `<label class="lt" id="lt-${k}" for="tg-${k}"><span>${label}</span><input type="checkbox" id="tg-${k}" role="switch" data-layer="${k}" ${S.visible[k] ? "checked" : ""}></label>`).join("");
    host.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => setLayerVisible(inp.dataset.layer, inp.checked)));
    updateToggleAvailability();
  }

  function updateToggleAvailability() {
    const hul = $("lt-hul");
    if (hul) {
      hul.classList.toggle("disabled", !S.historicalLands);
      hul.querySelector("input").disabled = !S.historicalLands;
      hul.title = S.historicalLands ? "" : "Not provided by the loaded dataset";
    }
  }

  function setLayerVisible(name, on) {
    S.visible[name] = !!on;
    const inp = document.querySelector(`#layer-toggles input[data-layer="${name}"]`);
    if (inp) inp.checked = !!on;
    applyVisibility();
    if (name === "grayZone" || name === "overlays") buildLabelItems();
    else updateLabels();
  }

  function applyVisibility() {
    S.layers.hydro.style("display", S.visible.rivers ? null : "none");
    S.layers.gratMinor.style("display", S.visible.graticule ? null : "none");
    S.layers.hul.style("display", S.visible.hul && !S.presentDay ? null : "none");
    S.layers.history.selectAll(".gz").style("display", S.visible.grayZone ? null : "none");
    S.layers.history.selectAll(".ovs").style("display", S.visible.overlays ? null : "none");
    d3.select("#grat-fine").style("display", S.t.k >= 2.5 && S.visible.graticule ? null : "none");
  }

  /* ------------------------------------------------------------------
     History rendering
     ------------------------------------------------------------------ */
  function normaliseEra(era) {
    if (!era) return null;
    const e = Object.assign({}, era);
    e.territory = eraTerritory(era);
    // Each rival/related polity gets its own hue (assigned in dataset order so it's stable);
    // occupied/contested keep their semantic colours.
    // Draw order: related < rival < contested < occupied (occupied must sit on top of contested).
    const rank = { related: 0, rival: 1, contested: 2, occupied: 3 };
    let hue = 0;
    e.overlays = (era.overlays || []).map((o, i) => o && Object.assign({}, o, { territory: U.asDrawable(o.territory), _key: "ov" + i }))
      .filter((o) => o && o.territory)
      .map((o, i) => {
        o.kind = OV_KINDS.includes(o.kind) ? o.kind : "related";
        o._color = o.kind === "occupied" ? "--occupied" : o.kind === "contested" ? "--contested" : `--pol-${(hue++ % POLITY_HUES) + 1}`;
        return Object.assign(o, { _i: i });
      })
      .sort((a, b) => (rank[a.kind] ?? 0) - (rank[b.kind] ?? 0) || a._i - b._i);
    e._seq = ++S.eraSeq;
    return e;
  }

  /** Gray-zone geometry for an era. From 1954 the territory is today's border, which the
   *  national outline already shows, so no gray zone is drawn; 1944–54 is derived from the
   *  oblast data so it lines up exactly. Earlier eras use the dataset's hand-drawn extent. */
  function eraTerritory(era) {
    const y = era.startYear;
    if (Number.isFinite(y) && y >= 1954) return null;
    if (Number.isFinite(y) && y >= 1944 && S.ukr.withoutCrimea) return S.ukr.withoutCrimea;
    return U.asDrawable(era.territory);
  }

  function renderEraGeo(era, animate) {
    const H = S.layers.history;
    if (!H) return;
    const old = H.selectAll("g.era");
    if (animate) old.interrupt().transition().duration(ERA_FADE_MS).style("opacity", 0).remove();
    else old.remove();
    svg.classed("history-on", !!era && !S.presentDay);
    // eras with their own territory push the present-day borders back to a faint reference
    svg.classed("era-terr", !!era && !!era.territory && !S.presentDay);
    S.focusKey = null;
    if (!era || S.presentDay) return;

    const g = H.append("g").attr("class", "era").attr("data-era", era.id || "");
    const path = S.draw;
    const ovs = g.append("g").attr("class", "ovs");
    (era.overlays || []).forEach((o) => {
      ovs.append("path").attr("class", `ov ov-${o.kind}`).attr("data-key", o._key)
        .attr("style", `--c: var(${o._color})`).attr("d", path(o.territory));
    });
    // main territory on top of overlays so its outline always reads
    if (era.territory) {
      const gz = g.append("g").attr("class", "gz").attr("data-key", "terr");
      gz.append("path").attr("class", "gz-tint").attr("d", path(era.territory));
      gz.append("path").attr("class", "gz-fill").attr("d", path(era.territory));
      gz.append("path").attr("class", "era-outline").attr("d", path(era.territory));
    }
    g.selectAll("path").attr("vector-effect", "non-scaling-stroke");
    if (animate) g.style("opacity", 0).transition().duration(ERA_FADE_MS).style("opacity", 1);
    applyVisibility();
  }

  function renderHistoricalLands() {
    const g = S.layers.hul; if (!g) return;
    g.selectAll("*").remove();
    if (!S.historicalLands) return;
    g.append("path").attr("class", "hul-fill").attr("d", S.draw(S.historicalLands)).attr("vector-effect", "non-scaling-stroke");
    applyVisibility();
  }

  /** Show an era object (contract shape). Pass null to clear. */
  function showEra(era, opts) {
    const o = Object.assign({ animate: true }, opts);
    S.era = normaliseEra(era);
    renderEraGeo(S.era, o.animate);
    buildLabelItems();
    emit("era", S.era);
  }

  /** Directly set the gray-zone geometry (any GeoJSON) without an era record. */
  function setHistoricalGeometry(geojson, opts) {
    const o = Object.assign({ label: null, confidence: "medium", outline: true }, opts);
    if (!geojson) { showEra(null); return; }
    showEra({ id: "custom", name: o.label || "Custom geometry", territory: geojson, territoryLabel: o.label, overlays: o.overlays || [], capital: o.capital || null, confidence: o.confidence });
  }

  function setHistoricalLands(geojson) {
    S.historicalLands = U.asDrawable(geojson);
    if (S.historicalLands && S._hulAutoOn !== false) { S.visible.hul = false; }
    renderHistoricalLands();
    updateLegendAvailability();
    updateToggleAvailability();
  }

  function setPresentDay(on) {
    S.presentDay = !!on;
    renderEraGeo(S.era, true);
    applyVisibility();
    buildLabelItems();
    emit("presentday", S.presentDay);
  }

  /* ------------------------------------------------------------------
     UI bindings
     ------------------------------------------------------------------ */
  function bindUi() {
    $("zoom-in").addEventListener("click", () => zoomBy(1.6));
    $("zoom-out").addEventListener("click", () => zoomBy(1 / 1.6));
    $("zoom-reset").addEventListener("click", resetView);
    $("zoom-era").addEventListener("click", fitEra);
    document.querySelectorAll("[data-collapse]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = $(btn.dataset.collapse);
        const c = p.classList.toggle("collapsed");
        btn.setAttribute("aria-expanded", String(!c));
        updateLabels();
      });
    });
    // cards start collapsed so the era's polities stay visible; the sidebar lists what each
    // colour means and the hover tooltip covers region details
    const collapse = (id) => { $(id).classList.add("collapsed"); $(id).querySelector(".card-hd").setAttribute("aria-expanded", "false"); };
    collapse("panel-legend"); collapse("panel-intel");
    let rT = 0;
    window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => resize(false), 120); });
    if (window.ResizeObserver) new ResizeObserver(() => { clearTimeout(rT); rT = setTimeout(() => resize(false), 120); }).observe(stageEl);
  }

  /* ------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------ */
  const api = {
    /** Resolves when geodata is loaded and the map is drawn. */
    ready: null,
    on,
    /** Render an era record directly (contract shape); null clears. */
    showEra,
    /** Select an era by id (delegates to the timeline). */
    setEra: (id) => window.UkraineTimeline ? window.UkraineTimeline.setEra(id) : false,
    /** Select the era containing a given year (BCE negative). */
    setYear: (y) => window.UkraineTimeline ? window.UkraineTimeline.setYear(y) : false,
    /** Zoom to the current era territory + overlays. */
    fitEra,
    /** Load a full UKRAINE_HISTORY-shaped dataset into the timeline. */
    loadHistory: (data) => window.UkraineTimeline ? window.UkraineTimeline.load(data) : false,
    /** Draw arbitrary GeoJSON (lon/lat) as the gray zone. */
    setHistoricalGeometry,
    /** Cumulative ethnographic lands layer (stippled). */
    setHistoricalLands,
    setPresentDay,
    isPresentDay: () => S.presentDay,
    setLayerVisible,
    getLayers: () => Object.assign({}, S.visible),
    /** Present-day Ukraine (dissolved ADM1) as a GeoJSON MultiPolygon. */
    getPresentDayGeometry: () => S.ukr.outline,
    getOblasts: () => ({ type: "FeatureCollection", features: S.ukr.features }),
    getOblastGeometry: (iso) => (S.ukr.byId.get(iso) || {}).geometry || null,
    zoomTo: (geojson) => { const g = U.asDrawable(geojson); if (g) zoomToFeature(g, 0.12); },
    selectRegion,
    get selectedRegion() { return S.selectedId || null; },
    /** Emphasise one shape of the current era ("terr" or an overlay's _key); null clears. */
    focusShape,
    zoomToRegion: (iso) => { const f = S.ukr.byId.get(iso); if (f) zoomToFeature(f); },
    resetView,
    project: (lonlat) => S.projection && S.t.apply(S.projection(lonlat)),
    invert: (xy) => S.projection && S.projection.invert(S.t.invert(xy)),
    get currentEra() { return S.era; },
    utils: U,
  };
  api.ready = new Promise((res) => on("ready", res));
  window.UkraineMap = api;

  boot();
})();
