import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const GEO_PATH = path.join(ROOT_DIR, "assets/geo/ne_50m_admin_0_countries.geojson");
const OUTPUT_DIR = path.join(ROOT_DIR, "data/trade-game");

const YEAR = 2024;
const MIN_TRADE_VALUE = 2_500_000_000;
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

async function fetchTradeRows(dataset) {
  const params = new URLSearchParams({
    cube: "trade_i_baci_a_92",
    drilldowns: `${dataset.dimension} Country,HS2`,
    include: `Year:${YEAR}`,
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
    iso3: group.iso3,
    iso2: geo.ISO_A2_EH || geo.ISO_A2 || "",
    name: DISPLAY_NAMES[group.iso3] || group.name,
    aliases: [...new Set([group.name, geo.NAME, geo.NAME_LONG, geo.NAME_SORT, ...(ALIASES[group.iso3] || [])])]
      .filter(Boolean)
      .filter((name) => name.toLowerCase() !== (DISPLAY_NAMES[group.iso3] || group.name).toLowerCase()),
    continent: geo.CONTINENT || group.continent,
    latitude: Number(geo.LABEL_Y),
    longitude: Number(geo.LABEL_X),
    [dataset.valueField]: total,
    products: products.map((product) => ({
      ...product,
      share: Number((product.value / total).toFixed(6))
    }))
  };
}

async function buildDataset(dataset, locations, generatedAt) {
  const rows = await fetchTradeRows(dataset);
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
    .filter((country) => country[dataset.valueField] >= MIN_TRADE_VALUE)
    .filter((country) => Number.isFinite(country.latitude) && Number.isFinite(country.longitude))
    .sort((a, b) => a.name.localeCompare(b.name));

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
}

async function main() {
  const geo = JSON.parse(await readFile(GEO_PATH, "utf8"));
  const locations = geoLookup(geo.features || []);
  const generatedAt = new Date().toISOString();

  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const dataset of DATASETS) {
    await buildDataset(dataset, locations, generatedAt);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
