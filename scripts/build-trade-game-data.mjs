import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const GEO_PATH = path.join(ROOT_DIR, "assets/geo/ne_50m_admin_0_countries.geojson");
const OUTPUT_DIR = path.join(ROOT_DIR, "data/trade-game");

const YEAR = 2024;
const THEN_YEAR = 1995;
const MIN_TRADE_VALUE = 2_500_000_000;
const PRODUCTLE_MIN_COUNTRIES = 14;
const PRODUCTLE_COUNTRY_COUNT = 5;
const TRADEOFF_MAX_TOTAL_RATIO = 1.1;
const TRADEOFF_MIN_CATEGORY_RATIO = 1.1;
const TRADEOFF_MAX_CATEGORY_RATIO = 5;
const DATASETS = [
  {
    id: "export",
    dimension: "Exporter",
    fileName: "countries.json",
    valueField: "exportValue"
  },
  {
    id: "import",
    dimension: "Importer",
    fileName: "imports.json",
    valueField: "importValue"
  }
];

const ALIASES = {
  ARE: ["UAE", "United Arab Emirates"],
  BOL: ["Bolivia"],
  BRN: ["Brunei"],
  CIV: ["Ivory Coast", "Côte d’Ivoire", "Cote d'Ivoire"],
  COD: ["DR Congo", "Democratic Republic of Congo"],
  COG: ["Republic of Congo", "Congo-Brazzaville"],
  CZE: ["Czech Republic", "Czechia"],
  EGY: ["Egypt"],
  GBR: ["UK", "United Kingdom", "Great Britain", "Britain"],
  IRN: ["Iran"],
  KOR: ["South Korea", "Republic of Korea"],
  LAO: ["Laos"],
  MDA: ["Moldova"],
  MKD: ["North Macedonia", "Macedonia"],
  RUS: ["Russia", "Russian Federation"],
  SVK: ["Slovakia", "Slovak Republic"],
  SYR: ["Syria"],
  TZA: ["Tanzania"],
  USA: ["USA", "US", "United States", "United States of America", "America"],
  VEN: ["Venezuela"],
  VNM: ["Vietnam", "Viet Nam"]
};

const DISPLAY_NAMES = {
  CIV: "Côte d’Ivoire",
  MMR: "Myanmar",
  TWN: "Taiwan"
};

function validIso3(value) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function geoLookup(features) {
  const lookup = new Map();

  for (const feature of features) {
    const p = feature.properties || {};
    const codes = [p.ISO_A3, p.ISO_A3_EH, p.ADM0_A3, p.SOV_A3].filter(validIso3);

    for (const code of codes) {
      if (!lookup.has(code)) lookup.set(code, p);
    }
  }

  return lookup;
}

function tidyProductName(name) {
  return String(name)
    .replace(/\s*&\s*/g, " & ")
    .replace(/,\s*n\.e\.s\.$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTradeRows(dataset, year = YEAR) {
  const params = new URLSearchParams({
    cube: "trade_i_baci_a_92",
    drilldowns: `${dataset.dimension} Country,HS2`,
    include: `Year:${year}`,
    locale: "en",
    parents: "true",
    measures: "Trade Value"
  });
  const url = `https://api-v2.oec.world/tesseract/data.jsonrecords?${params}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`OEC request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error("OEC response did not contain data rows");
  return payload.data;
}

async function fetchBilateralRows() {
  const params = new URLSearchParams({
    cube: "trade_i_baci_a_92",
    drilldowns: "Exporter Country,Importer Country",
    include: `Year:${YEAR}`,
    locale: "en",
    parents: "true",
    measures: "Trade Value"
  });
  const url = `https://api-v2.oec.world/tesseract/data.jsonrecords?${params}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`OEC bilateral request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error("OEC bilateral response did not contain data rows");
  return payload.data;
}

async function fetchGdpRows() {
  const url = `https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?date=${YEAR}&format=json&per_page=500`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`World Bank GDP request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.[1])) throw new Error("World Bank response did not contain GDP rows");
  return payload[1];
}

function createCountryIdentity(iso3, name, continent, geo) {
  const displayName = DISPLAY_NAMES[iso3] || name;
  return {
    iso3,
    iso2: geo.ISO_A2_EH || geo.ISO_A2 || "",
    name: displayName,
    aliases: [...new Set([name, geo.NAME, geo.NAME_LONG, geo.NAME_SORT, ...(ALIASES[iso3] || [])])]
      .filter(Boolean)
      .filter((alias) => alias.toLowerCase() !== displayName.toLowerCase()),
    continent: geo.CONTINENT || continent,
    latitude: Number(geo.LABEL_Y),
    longitude: Number(geo.LABEL_X)
  };
}

function createCountryRecord(group, geo, dataset) {
  const products = group.rows
    .map((row) => ({
      code: String(Number(row["HS2 ID"]) % 100).padStart(2, "0"),
      name: tidyProductName(row.HS2),
      section: row.Section,
      sectionId: Number(row["Section ID"]),
      value: Math.round(Number(row["Trade Value"]) || 0)
    }))
    .filter((product) => product.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = products.reduce((sum, product) => sum + product.value, 0);

  return {
    ...createCountryIdentity(group.iso3, group.name, group.continent, geo),
    [dataset.valueField]: total,
    products: products.map((product) => ({
      ...product,
      share: Number((product.value / total).toFixed(6))
    }))
  };
}

function createTradeCountries(rows, dataset, locations, minimumValue = MIN_TRADE_VALUE) {
  const groups = new Map();
  const countryIdField = `${dataset.dimension} Country ID`;
  const countryNameField = `${dataset.dimension} Country`;
  const continentField = `${dataset.dimension} Continent`;

  for (const row of rows) {
    const oecId = String(row[countryIdField] || "");
    const iso3 = oecId.slice(-3).toUpperCase();
    if (!validIso3(iso3) || !locations.has(iso3)) continue;

    if (!groups.has(iso3)) {
      groups.set(iso3, {
        iso3,
        name: row[countryNameField],
        continent: row[continentField],
        rows: []
      });
    }
    groups.get(iso3).rows.push(row);
  }

  const countries = [...groups.values()]
    .map((group) => createCountryRecord(group, locations.get(group.iso3), dataset))
    .filter((country) => country[dataset.valueField] >= minimumValue)
    .filter((country) => Number.isFinite(country.latitude) && Number.isFinite(country.longitude))
    .sort((a, b) => a.name.localeCompare(b.name));

  return countries;
}

async function buildDataset(dataset, locations, generatedAt) {
  const rows = await fetchTradeRows(dataset);
  const countries = createTradeCountries(rows, dataset, locations);

  const payload = {
    meta: {
      year: YEAR,
      generatedAt,
      countryCount: countries.length,
      direction: dataset.id,
      classification: "HS 1992, 2-digit products",
      source: "CEPII BACI via the Observatory of Economic Complexity",
      sourceUrl: "https://oec.world/en/resources/datasets",
      license: "CC BY 4.0"
    },
    countries
  };

  const outputPath = path.join(OUTPUT_DIR, dataset.fileName);
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`);
  console.log(`Wrote ${countries.length} ${dataset.id} countries to ${path.relative(ROOT_DIR, outputPath)}`);
  return countries;
}

function summarizeExportPeriod(country) {
  const categories = new Map();

  for (const product of country.products) {
    if (!categories.has(product.sectionId)) {
      categories.set(product.sectionId, {
        sectionId: product.sectionId,
        name: product.section,
        value: 0
      });
    }
    categories.get(product.sectionId).value += product.value;
  }

  return {
    exportValue: country.exportValue,
    categories: [...categories.values()]
      .map((category) => ({
        ...category,
        share: Number((category.value / country.exportValue).toFixed(6))
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  };
}

async function buildThenNow(locations, generatedAt, currentExportCountries) {
  const exportDataset = DATASETS.find((dataset) => dataset.id === "export");
  const historicalRows = await fetchTradeRows(exportDataset, THEN_YEAR);
  const historicalCountries = createTradeCountries(historicalRows, exportDataset, locations, 1);
  const historicalByIso3 = new Map(historicalCountries.map((country) => [country.iso3, country]));

  const countries = currentExportCountries
    .map((current) => {
      const historical = historicalByIso3.get(current.iso3);
      if (!historical) return null;
      const then = summarizeExportPeriod(historical);
      const now = summarizeExportPeriod(current);
      if (then.categories.length !== 5 || now.categories.length !== 5) return null;
      const { products, exportValue, ...identity } = current;
      return {
        ...identity,
        periods: {
          [THEN_YEAR]: then,
          [YEAR]: now
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    meta: {
      years: [THEN_YEAR, YEAR],
      generatedAt,
      countryCount: countries.length,
      direction: "comparison",
      game: "then-now",
      categoryLevel: "HS 1992 sections",
      source: "CEPII BACI via the Observatory of Economic Complexity",
      sourceUrl: "https://oec.world/en/resources/datasets",
      license: "CC BY 4.0"
    },
    countries
  };

  const outputPath = path.join(OUTPUT_DIR, "then-now.json");
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`);
  console.log(`Wrote ${countries.length} Then&Now countries to ${path.relative(ROOT_DIR, outputPath)}`);
}

function summarizeProductleCountry(country) {
  const categories = new Map();

  for (const product of country.products) {
    if (!categories.has(product.sectionId)) {
      categories.set(product.sectionId, {
        sectionId: product.sectionId,
        name: product.section,
        value: 0
      });
    }
    categories.get(product.sectionId).value += product.value;
  }

  return [...categories.values()]
    .map((category) => ({
      ...category,
      share: Number((category.value / country.exportValue).toFixed(6))
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

async function buildProductle(generatedAt, currentExportCountries) {
  const categoryPools = new Map();

  for (const country of currentExportCountries) {
    summarizeProductleCountry(country).forEach((category, index) => {
      if (!categoryPools.has(category.sectionId)) {
        categoryPools.set(category.sectionId, {
          sectionId: category.sectionId,
          name: category.name,
          countries: []
        });
      }
      categoryPools.get(category.sectionId).countries.push({
        iso3: country.iso3,
        iso2: country.iso2,
        name: country.name,
        continent: country.continent,
        share: category.share,
        rank: index + 1
      });
    });
  }

  const categories = [...categoryPools.values()]
    .filter((category) => category.countries.length >= PRODUCTLE_MIN_COUNTRIES)
    .map((category) => ({
      ...category,
      countries: category.countries.sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.sectionId - b.sectionId);

  const payload = {
    meta: {
      year: YEAR,
      generatedAt,
      direction: "category",
      game: "productle",
      categoryCount: categories.length,
      clueCountryCount: PRODUCTLE_COUNTRY_COUNT,
      eligibility: `Category must rank in the top five exports of at least ${PRODUCTLE_MIN_COUNTRIES} countries`,
      categoryLevel: "HS 1992 sections",
      source: "CEPII BACI via the Observatory of Economic Complexity",
      sourceUrl: "https://oec.world/en/resources/datasets",
      license: "CC BY 4.0"
    },
    categories
  };

  const outputPath = path.join(OUTPUT_DIR, "productle.json");
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`);
  console.log(`Wrote ${categories.length} Productle categories to ${path.relative(ROOT_DIR, outputPath)}`);
}

async function buildTradeoffs(generatedAt, currentExportCountries) {
  const summarized = currentExportCountries.map((country) => ({
    country: {
      iso3: country.iso3,
      iso2: country.iso2,
      name: country.name,
      continent: country.continent,
      exportValue: country.exportValue
    },
    categories: summarizeProductleCountry(country)
  }));
  const matchups = [];
  let comparisonCount = 0;

  for (let leftIndex = 0; leftIndex < summarized.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < summarized.length; rightIndex += 1) {
      const left = summarized[leftIndex];
      const right = summarized[rightIndex];
      const totalRatio = Math.max(left.country.exportValue, right.country.exportValue)
        / Math.min(left.country.exportValue, right.country.exportValue);
      if (totalRatio > TRADEOFF_MAX_TOTAL_RATIO) continue;

      const rightCategories = new Map(right.categories.map((category) => [category.sectionId, category]));
      const categories = left.categories
        .map((leftCategory) => {
          const rightCategory = rightCategories.get(leftCategory.sectionId);
          if (!rightCategory) return null;
          const categoryRatio = Math.max(leftCategory.value, rightCategory.value)
            / Math.min(leftCategory.value, rightCategory.value);
          if (
            categoryRatio < TRADEOFF_MIN_CATEGORY_RATIO
            || categoryRatio > TRADEOFF_MAX_CATEGORY_RATIO
          ) return null;
          return {
            sectionId: leftCategory.sectionId,
            name: leftCategory.name,
            values: [leftCategory.value, rightCategory.value],
            shares: [leftCategory.share, rightCategory.share],
            ranks: [
              left.categories.findIndex((category) => category.sectionId === leftCategory.sectionId) + 1,
              right.categories.findIndex((category) => category.sectionId === leftCategory.sectionId) + 1
            ],
            winnerIso3: leftCategory.value > rightCategory.value ? left.country.iso3 : right.country.iso3
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.sectionId - b.sectionId);

      if (!categories.length) continue;
      comparisonCount += categories.length;
      matchups.push({
        id: `${left.country.iso3}-${right.country.iso3}`,
        totalRatio: Number(totalRatio.toFixed(6)),
        countries: [left.country, right.country],
        categories
      });
    }
  }

  const payload = {
    meta: {
      year: YEAR,
      generatedAt,
      direction: "tradeoff",
      game: "tradeoffs",
      matchupCount: matchups.length,
      comparisonCount,
      maxTotalExportDifference: Number((TRADEOFF_MAX_TOTAL_RATIO - 1).toFixed(2)),
      categoryValueRatio: [TRADEOFF_MIN_CATEGORY_RATIO, TRADEOFF_MAX_CATEGORY_RATIO],
      eligibility: "Countries have total goods exports within 10%; the category ranks in both countries’ top five",
      categoryLevel: "HS 1992 sections",
      source: "CEPII BACI via the Observatory of Economic Complexity",
      sourceUrl: "https://oec.world/en/resources/datasets",
      license: "CC BY 4.0"
    },
    matchups
  };

  const outputPath = path.join(OUTPUT_DIR, "tradeoffs.json");
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`);
  console.log(`Wrote ${matchups.length} Tradeoffs matchups (${comparisonCount} comparisons) to ${path.relative(ROOT_DIR, outputPath)}`);
}

async function buildTruddies(locations, generatedAt) {
  const [tradeRows, gdpRows] = await Promise.all([fetchBilateralRows(), fetchGdpRows()]);
  const gdpByIso3 = new Map(
    gdpRows
      .filter((row) => validIso3(row.countryiso3code) && Number(row.value) > 0)
      .map((row) => [row.countryiso3code, Math.round(Number(row.value))])
  );
  const groups = new Map();

  function ensureCountry(iso3, name, continent) {
    if (!groups.has(iso3)) {
      groups.set(iso3, { iso3, name, continent, tradeValue: 0, partners: new Map() });
    }
    return groups.get(iso3);
  }

  function addPartner(group, partnerIso3, value) {
    group.tradeValue += value;
    group.partners.set(partnerIso3, (group.partners.get(partnerIso3) || 0) + value);
  }

  for (const row of tradeRows) {
    const exporterIso3 = String(row["Exporter Country ID"] || "").slice(-3).toUpperCase();
    const importerIso3 = String(row["Importer Country ID"] || "").slice(-3).toUpperCase();
    const value = Math.round(Number(row["Trade Value"]) || 0);
    if (
      !validIso3(exporterIso3)
      || !validIso3(importerIso3)
      || exporterIso3 === importerIso3
      || !locations.has(exporterIso3)
      || !locations.has(importerIso3)
      || value <= 0
    ) continue;

    const exporter = ensureCountry(exporterIso3, row["Exporter Country"], row["Exporter Continent"]);
    const importer = ensureCountry(importerIso3, row["Importer Country"], row["Importer Continent"]);
    addPartner(exporter, importerIso3, value);
    addPartner(importer, exporterIso3, value);
  }

  const countries = [...groups.values()]
    .filter((group) => group.tradeValue >= MIN_TRADE_VALUE && gdpByIso3.has(group.iso3))
    .map((group) => {
      const identity = createCountryIdentity(group.iso3, group.name, group.continent, locations.get(group.iso3));
      const partners = [...group.partners.entries()]
        .map(([iso3, value]) => {
          const partnerGroup = groups.get(iso3);
          const partnerGeo = locations.get(iso3);
          return {
            iso3,
            iso2: partnerGeo?.ISO_A2_EH || partnerGeo?.ISO_A2 || "",
            name: DISPLAY_NAMES[iso3] || partnerGroup?.name || partnerGeo?.NAME || iso3,
            value,
            share: Number((value / group.tradeValue).toFixed(6))
          };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      return {
        ...identity,
        gdpValue: gdpByIso3.get(group.iso3),
        tradeValue: group.tradeValue,
        partners
      };
    })
    .filter((country) => country.partners.length === 5)
    .filter((country) => Number.isFinite(country.latitude) && Number.isFinite(country.longitude))
    .sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    meta: {
      year: YEAR,
      generatedAt,
      countryCount: countries.length,
      direction: "profile",
      game: "truddies",
      partnerMethod: "Combined bilateral goods imports and exports",
      gdpIndicator: "NY.GDP.MKTP.CD",
      sources: [
        {
          name: "CEPII BACI via the Observatory of Economic Complexity",
          url: "https://oec.world/en/resources/datasets",
          license: "CC BY 4.0"
        },
        {
          name: "World Bank World Development Indicators",
          url: "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD",
          license: "CC BY 4.0"
        }
      ]
    },
    countries
  };

  const outputPath = path.join(OUTPUT_DIR, "truddies.json");
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`);
  console.log(`Wrote ${countries.length} Truddies countries to ${path.relative(ROOT_DIR, outputPath)}`);
}

async function main() {
  if (process.argv.includes("--productle-only")) {
    const current = JSON.parse(await readFile(path.join(OUTPUT_DIR, "countries.json"), "utf8"));
    await buildProductle(current.meta?.generatedAt || new Date().toISOString(), current.countries || []);
    return;
  }
  if (process.argv.includes("--tradeoffs-only")) {
    const current = JSON.parse(await readFile(path.join(OUTPUT_DIR, "countries.json"), "utf8"));
    await buildTradeoffs(current.meta?.generatedAt || new Date().toISOString(), current.countries || []);
    return;
  }

  const geo = JSON.parse(await readFile(GEO_PATH, "utf8"));
  const locations = geoLookup(geo.features || []);
  const generatedAt = new Date().toISOString();
  let currentExportCountries = [];

  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const dataset of DATASETS) {
    const countries = await buildDataset(dataset, locations, generatedAt);
    if (dataset.id === "export") currentExportCountries = countries;
  }
  await buildTruddies(locations, generatedAt);
  await buildThenNow(locations, generatedAt, currentExportCountries);
  await buildProductle(generatedAt, currentExportCountries);
  await buildTradeoffs(generatedAt, currentExportCountries);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
