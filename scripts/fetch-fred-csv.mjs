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
 * Fetch the latest non-missing observation for a FRED series.
 * @param {string} seriesId
 * @param {string} apiKey
 * @returns {Promise<{date: string, value: string}>}
 */
async function fetchLatestObservation(seriesId, apiKey) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "10"); // grab a few in case newest is "."

  const res = await fetch(url.toString(), {
    headers: { "user-agent": "LiberalMarketsFREDBot/1.0 (GitHub Actions)" },
  });

  if (!res.ok) {
    throw new Error(`${seriesId}: HTTP ${res.status}`);
  }

  const data = await res.json();
  const obs = Array.isArray(data.observations) ? data.observations : [];

  // FRED uses "." for missing values sometimes
  const latest = obs.find(o => o && typeof o.value === "string" && o.value !== ".");

  if (!latest || typeof latest.date !== "string") {
    throw new Error(`${seriesId}: No usable observations returned`);
  }

  return { date: latest.date, value: latest.value };
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
    const { date, value } = await fetchLatestObservation(s.id, apiKey);

    const filePath = path.join(DATA_DIR, `${s.id}.csv`);
    const existing = await readIfExists(filePath);
    const map = parseCsvToMap(existing);

    const had = map.has(date);
    map.set(date, value); // append or update (revision-safe)

    const out = mapToCsv(map);
    await fs.writeFile(filePath, out, "utf8");

    console.log(`${s.id}: ${had ? "updated" : "added"} ${date} = ${value}`);


    // ---- Derived series: Housing / Income ratio ----
    // Update these filenames to match your two base CSVs:
    const INCOME_ID = "MEHOINUSA"; // example FRED series id (median household income, annual)
    const HOUSE_ID = "MSPUS";      // example series id (median sales price, quarterly)

    const incomePath = path.join(DATA_DIR, `${INCOME_ID}.csv`);
    const housePath = path.join(DATA_DIR, `${HOUSE_ID}.csv`);

    const income = await readSeriesCsv(incomePath);
    const house = await readSeriesCsv(housePath);

    // If either is missing, skip without failing the whole run
    if (income.length && house.length) {
    const ratioMap = new Map();

    for (const inc of income) {
        const h = asOf(house, inc.date);
        if (!Number.isFinite(inc.value) || !Number.isFinite(h) || inc.value === 0) continue;

        // ratio = house price / income
        const ratio = h / inc.value;

        // store on the income date
        ratioMap.set(inc.date, ratio.toString());
    }

    const ratioCsv = mapToCsv(ratioMap);
    const ratioOutPath = path.join(DATA_DIR, `HOUSE_TO_INCOME_RATIO.csv`);
    await fs.writeFile(ratioOutPath, ratioCsv, "utf8");

    console.log(`Derived: HOUSE_TO_INCOME_RATIO.csv (${ratioMap.size} rows)`);
    } else {
    console.log("Derived: ratio skipped (missing income or housing series data)");
    }

  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});