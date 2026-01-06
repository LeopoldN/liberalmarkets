/**
 * Fetch latest FRED observations and store/append/update CSVs per series.
 * - Writes to /data/<SERIES_ID>.csv
 * - De-dupes by date
 * - Updates the value if the date exists (handles revisions)
 */

import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = "data";

const SERIES = [
  { id: "CPIAUCSL", name: "CPI (Inflation)" },
  { id: "UNRATE", name: "Unemployment Rate" },
  { id: "GDPC1", name: "Real GDP" },
  { id: "MSPUS", name: "Median Home Price" },
  { id: "MEHOINUSA646N", name: "Median Household Income" },
  { id: "APU0000708111", name: "Egg Price/doz" },
  { id: "APU000072610", name: "Electricty Price/kwh" },
  { id: "APU0000709112", name: "Whole Milk Price/gal" },
  { id: "APU000074714", name: "Gas Price/gal" },
  { id: "APU0000717311", name: "Coffee Prices/lb" },
  { id: "APU0000FN1101", name: "2 Litre Soda Price" },
  { id: "APU0000718311", name: "16oz Chip bag" },
  { id: "CUSR0000SAH3", name: "Household Furnishings basket" },
  { id: "CUSR0000SAD", name: "Durables basket" },
  { id: "CUSR0000SAF113", name: "Fruits & Veggies Basket" },
  { id: "LNS11300060", name: "Prime Age LFPR" },
  { id: "PAYEMS", name: "Total Nonfarm Employment" },
  { id: "CES1021210001", name: "Total Coal Employment" },
  { id: "USMINE", name: "Total Mining/Logging Employment" },
  { id: "USCONS", name: "Total Construction Employment" },
  { id: "MANEMP", name: "Total Manufacturing Employment" },
  { id: "CES3133600101", name: "Total Car Manufacturing Employment" },
  { id: "CES4348400001", name: "Total Trucking Employment" },
  { id: "USINFO", name: "Total IT Employment" },
  { id: "USFIRE", name: "Total Finance Employment" },
  { id: "CES6562000101", name: "Total Healthcare Employment" },
  { id: "CES9091000001", name: "Total Federal Employment" },
  { id: "USGOVT", name: "Total Government Employment" },
  { id: "TLMFGCONS", name: "Total Manufacturing Spending" },
  { id: "A939RX0Q048SBEA", name: "Real GDP per Capita" },
  { id: "BOPGSTB", name: "US Trade Deficit" },
  { id: "GFDEBTN", name: "Total US Debt" },
  { id: "GFDEGDQ188S", name: "Debt as % of GDP" },
  { id: "FYFSD", name: "Federal Deficit" },
  { id: "FEDFUNDS", name: "Federal Funds Rate" },
  { id: "MORTGAGE30US", name: "Avg 30yr Fixed Mortgage" },
  { id: "MEHOINUSA646N", name: "Total blank Employment" },
  { id: "MEHOINUSA646N", name: "Total blank Employment" },
  { id: "MEHOINUSA646N", name: "Total blank Employment" },
  { id: "MEHOINUSA646N", name: "Total blank Employment" },
  { id: "MEHOINUSA646N", name: "Total blank Employment" },
];

/**
 * Ensure directory exists.
 * @param {string} dir
 * @returns {Promise<void>}
 */
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Fetch observations for a series (ascending).
 * @param {string} seriesId
 * @param {string} apiKey
 * @param {string} observationStart
 * @returns {Promise<Array<{date:string, value:string}>>}
 */
async function fetchObservations(seriesId, apiKey, observationStart = "1970-01-01") {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("observation_start", observationStart);
  url.searchParams.set("limit", "100000");

  const res = await fetch(url.toString(), {
    headers: { "user-agent": "LiberalMarketsFREDBot/1.0 (GitHub Actions)" },
  });
  if (!res.ok) throw new Error(`${seriesId}: HTTP ${res.status}`);

  const data = await res.json();
  const obs = Array.isArray(data.observations) ? data.observations : [];

  return obs
    .filter(o => o && typeof o.date === "string" && typeof o.value === "string" && o.value !== ".")
    .map(o => ({ date: o.date, value: o.value }));
}






/**
 * Parse a CSV of shape: date,value
 * @param {string} text
 * @returns {Map<string, string>}
 */
function parseCsvToMap(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  const map = new Map();

  // empty or header-only
  if (lines.length <= 1) return map;

  for (let i = 1; i < lines.length; i++) {
    const [date, value] = lines[i].split(",");
    if (date) map.set(date.trim(), (value ?? "").trim());
  }
  return map;
}

/**
 * Serialize Map(date->value) back to CSV sorted by date asc.
 * @param {Map<string, string>} map
 * @returns {string}
 */
function mapToCsv(map) {
  const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const body = rows.map(([d, v]) => `${d},${v}`).join("\n");
  return `date,value\n${body}\n`;
}

/**
 * Read file if exists else return empty string.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Read series CSV into sorted arrays.
 * @param {string} filePath
 * @returns {Promise<Array<{date:string, value:number}>>}
 */
async function readSeriesCsv(filePath) {
  const text = await readIfExists(filePath);
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length <= 1) return [];

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const [dateRaw, valRaw] = lines[i].split(",");
    const date = (dateRaw ?? "").trim();
    const value = Number((valRaw ?? "").trim());
    if (!date || !Number.isFinite(value)) continue;
    out.push({ date, value });
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/**
 * Find latest value on or before targetDate (dates are YYYY-MM-DD).
 * @param {Array<{date:string, value:number}>} series
 * @param {string} targetDate
 * @returns {number|null}
 */
function asOf(series, targetDate) {
  // series is sorted asc
  let lo = 0;
  let hi = series.length - 1;
  let best = null;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const d = series[mid].date;

    if (d <= targetDate) {
      best = series[mid].value;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
}


async function main() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("Missing FRED_API_KEY env var");

  await ensureDir(DATA_DIR);

  for (const s of SERIES) {
    const observations = await fetchObservations(s.id, apiKey, "1970-01-01");

    const filePath = path.join(DATA_DIR, `${s.id}.csv`);
    const existing = await readIfExists(filePath);
    const map = parseCsvToMap(existing);

    let changed = 0;
    for (const o of observations) {
    const prev = map.get(o.date);
    if (prev !== o.value) {
        map.set(o.date, o.value); // append or revision-update
        changed++;
    }
    }

    await fs.writeFile(filePath, mapToCsv(map), "utf8");
    console.log(`${s.id}: merged ${observations.length} obs (${changed} new/updated)`);
    
  }

    // ---- Derived series: House price to income ratio ----
    {
    const INCOME_ID = "MEHOINUSA646N";
    const HOUSE_ID = "MSPUS";

    const incomePath = path.join(DATA_DIR, `${INCOME_ID}.csv`);
    const housePath = path.join(DATA_DIR, `${HOUSE_ID}.csv`);

    const income = await readSeriesCsv(incomePath);
    const house = await readSeriesCsv(housePath);

    if (!income.length || !house.length) {
        console.log("Derived: ratio skipped (missing income or housing series data)");
    } else {
        const ratioMap = new Map();

        // Build ratio on income dates (annual), using latest house value as-of that date
        for (const inc of income) {
        const h = asOf(house, inc.date);
        if (!Number.isFinite(inc.value) || !Number.isFinite(h) || inc.value === 0) continue;

        const ratio = h / inc.value;
        ratioMap.set(inc.date, String(ratio));
        }

        const ratioOutPath = path.join(DATA_DIR, "HOUSE_TO_INCOME_RATIO.csv");
        await fs.writeFile(ratioOutPath, mapToCsv(ratioMap), "utf8");

        console.log(`Derived: HOUSE_TO_INCOME_RATIO.csv (${ratioMap.size} rows)`);
    }
    }


}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});