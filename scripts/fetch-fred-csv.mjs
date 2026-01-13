/**
 * Fetch latest FRED observations and store/append/update CSVs per series.
 * - Writes to /data/<SERIES_ID>.csv
 * - De-dupes by date
 * - Updates the value if the date exists (handles revisions)
 * - Incremental pulls with revision backfill window
 */

import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = "data";

// How far back to re-pull data to catch revisions (days)
const REVISION_BACKFILL_DAYS = 365 * 5;
const FALLBACK_START = "1970-01-01";

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
];

/**
 * Ensure directory exists.
 */
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Fetch observations for a series (ascending).
 */
async function fetchObservations(seriesId, apiKey, observationStart) {
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
    .filter(o => o && o.value !== ".")
    .map(o => ({ date: o.date, value: o.value }));
}

/**
 * Parse CSV into Map(date -> value)
 */
function parseCsvToMap(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  const map = new Map();
  if (lines.length <= 1) return map;

  for (let i = 1; i < lines.length; i++) {
    const [date, value] = lines[i].split(",");
    if (date) map.set(date.trim(), (value ?? "").trim());
  }
  return map;
}

/**
 * Serialize Map(date -> value) to CSV
 */
function mapToCsv(map) {
  const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const body = rows.map(([d, v]) => `${d},${v}`).join("\n");
  return `date,value\n${body}\n`;
}

/**
 * Read file if exists
 */
async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Extract last date from existing CSV
 */
function getLastDateFromCsv(csvText) {
  const text = csvText.trim();
  if (!text) return null;

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return null;

  const [date] = lines[lines.length - 1].split(",");
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * YYYY-MM-DD minus N days
 */
function minusDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Decide observation_start for incremental pulls
 */
function computeObservationStart(existingCsv) {
  const lastDate = getLastDateFromCsv(existingCsv);
  if (!lastDate) return FALLBACK_START;

  const start = minusDays(lastDate, REVISION_BACKFILL_DAYS);
  return start < FALLBACK_START ? FALLBACK_START : start;
}

/**
 * Read series CSV into sorted array
 */
async function readSeriesCsv(filePath) {
  const text = await readIfExists(filePath);
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length <= 1) return [];

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, val] = lines[i].split(",");
    const value = Number(val);
    if (date && Number.isFinite(value)) out.push({ date, value });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Find latest value as-of target date
 */
function asOf(series, targetDate) {
  let lo = 0, hi = series.length - 1, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= targetDate) {
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
    const filePath = path.join(DATA_DIR, `${s.id}.csv`);
    const existing = await readIfExists(filePath);

    const observationStart = computeObservationStart(existing);
    const observations = await fetchObservations(s.id, apiKey, observationStart);

    const map = parseCsvToMap(existing);

    let changed = 0;
    for (const o of observations) {
      if (map.get(o.date) !== o.value) {
        map.set(o.date, o.value);
        changed++;
      }
    }

    await fs.writeFile(filePath, mapToCsv(map), "utf8");
    console.log(`${s.id}: fetched since ${observationStart}, ${changed} updates`);
  }

  // ---- Derived: House price to income ratio ----
  {
    const income = await readSeriesCsv(path.join(DATA_DIR, "MEHOINUSA646N.csv"));
    const house = await readSeriesCsv(path.join(DATA_DIR, "MSPUS.csv"));

    if (!income.length || !house.length) {
      console.log("Derived ratio skipped (missing data)");
    } else {
      const ratioMap = new Map();
      for (const inc of income) {
        const h = asOf(house, inc.date);
        if (!Number.isFinite(h) || inc.value === 0) continue;
        ratioMap.set(inc.date, String(h / inc.value));
      }
      await fs.writeFile(
        path.join(DATA_DIR, "HOUSE_TO_INCOME_RATIO.csv"),
        mapToCsv(ratioMap),
        "utf8"
      );
      console.log(`Derived: HOUSE_TO_INCOME_RATIO.csv (${ratioMap.size} rows)`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});