/**
 * Fetch daily OHLC CSV from Stooq for each symbol in WATCH,
 * then write tape.json with last close + prev close + pct change.
 *
 * Output: /tape.json
 */

import fs from "node:fs/promises";

const WATCH = [
  { sym: "10yusy.b", name: "US 10Y Yield" },
  { sym: "usdeur", name: "USD/EUR" },
  { sym: "cb.f", name: "Brent" },
  { sym: "^spx", name: "S&P 500" },
  { sym: "xauusd", name: "Gold" },
  { sym: "asts.us", name: "ASTS" },
];

/**
 * Sleep helper (gentle rate limiting).
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse a Stooq daily CSV and return the last two rows.
 * Stooq daily CSV columns: Date,Open,High,Low,Close,Volume
 * @param {string} csv
 * @returns {{date:string, close:number, prevDate:string, prevClose:number}}
 */
function parseLastTwoCloses(csv) {
  const lines = csv.trim().split("\n").filter(Boolean);

  // Expect header + at least two data rows
  if (lines.length < 3) {
    throw new Error("Not enough data rows in CSV");
  }

  const last = lines[lines.length - 1].split(",");
  const prev = lines[lines.length - 2].split(",");

  const date = last[0];
  const close = Number(last[4]);

  const prevDate = prev[0];
  const prevClose = Number(prev[4]);

  if (!Number.isFinite(close) || !Number.isFinite(prevClose)) {
    throw new Error("Close values are not numeric");
  }

  return { date, close, prevDate, prevClose };
}

/**
 * Fetch Stooq daily CSV for a symbol.
 * @param {string} sym
 * @returns {Promise<string>}
 */
async function fetchStooqDailyCsv(sym) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  const res = await fetch(url, {
    headers: {
      "user-agent": "LiberalMarketsTapeBot/1.0 (GitHub Actions)",
      "accept": "text/csv,*/*",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return await res.text();
}

/**
 * Compute percent change from prevClose to close.
 * @param {number} close
 * @param {number} prevClose
 * @returns {number}
 */
function pctChange(close, prevClose) {
  return ((close / prevClose) - 1) * 100;
}

async function main() {
  const results = [];

  for (const w of WATCH) {
    try {
      const csv = await fetchStooqDailyCsv(w.sym);
      const { date, close, prevDate, prevClose } = parseLastTwoCloses(csv);
      const deltaPct = pctChange(close, prevClose);

      results.push({
        sym: w.sym,
        name: w.name,
        date,
        close,
        prevDate,
        prevClose,
        deltaPct,
        ok: true,
      });
    } catch (err) {
      results.push({
        sym: w.sym,
        name: w.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Be polite: tiny delay between hits
    await sleep(350);
  }

  const now = new Date().toISOString();

  const payload = {
    generatedAt: now,
    source: "stooq",
    items: results,
  };

  await fs.writeFile("tape.json", JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote tape.json with ${results.length} items @ ${now}`);

  // If everything failed, exit non-zero so you notice.
  const okCount = results.filter((x) => x.ok).length;
  if (okCount === 0) {
    console.error("All symbols failed. Check symbol naming / Stooq availability.");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});