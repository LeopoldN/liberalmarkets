/**
 * Fetch daily OHLC CSV from Stooq for each symbol in WATCH,
 * then write tape.json with last close + prev close + pct change.
 *
 * Output: /tape.json
 */

import fs from "node:fs/promises";

/**
 * Exit early unless local NY time is within +/- graceMinutes of one of the allowed times.
 * @param {Array<[number, number]>} allowedTimes - array of [hour, minute] in NY time
 * @param {number} graceMinutes - tolerance window (e.g., 20 means allow 09:40–10:20)
 */
function exitUnlessNYTimeMatches(allowedTimes, graceMinutes = 20) {
  const now = new Date();

  // Get NY time parts
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(now);

  const get = (t) => parts.find(p => p.type === t)?.value;
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  // Weekends: bail
  if (weekday === "Sat" || weekday === "Sun") {
    console.log("Weekend in NY, skipping.");
    process.exit(0);
  }

  const nowTotal = hour * 60 + minute;

  const ok = allowedTimes.some(([h, m]) => {
    const target = h * 60 + m;
    const diff = Math.abs(nowTotal - target);

    // Normal window OR crossing midnight edge case (rare here, but correct)
    const wrapDiff = Math.min(diff, 1440 - diff);
    return wrapDiff <= graceMinutes;
  });

  if (!ok) {
    console.log(
      `NY time ${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")} not within ±${graceMinutes}m of scheduled times, skipping.`
    );
    process.exit(0);
  }

  console.log(`NY time within ±${graceMinutes}m window, proceeding.`);
}

// Example: allow 10:00 and 16:30 with 25 minute grace
exitUnlessNYTimeMatches([[10, 0], [16, 30]], 45);


const WATCH = [
  { sym: "2yusy.b", name: "US 2Y Yield" },
  { sym: "5yusy.b", name: "US 5Y Yield" },
  { sym: "10yusy.b", name: "US 10Y Yield" },
  { sym: "30yusy.b", name: "US 30Y Yield" },
  { sym: "usdeur", name: "USD/EUR" },
  { sym: "cb.f", name: "Brent Oil" },
  { sym: "^spx", name: "S&P 500" },
  { sym: "xauusd", name: "Gold" },
  { sym: "asts.us", name: "ASTS" },
];

const HEATMAP = [
  // Broad market
  { sym: "spy.us", name: "S&P 500", group: "Index" },
  { sym: "qqq.us", name: "Nasdaq 100", group: "Index" },
  { sym: "iwm.us", name: "Russell 2000", group: "Index" },
  { sym: "dia.us", name: "Dow 30", group: "Index" },
  { sym: "^hsi", name: "Hong Kong HSI", group: "Index" },
  { sym: "^nkx", name: "Japan Nikkei", group: "Index" },
  { sym: "^snx", name: "Sensex India", group: "Index" },
  { sym: "^dax", name: "DAX Germany", group: "Index" },
  { sym: "^ukx", name: "FTSE 100 UK", group: "Index" },

  // Mega cap
  { sym: "aapl.us", name: "Apple", group: "Mega" },
  { sym: "msft.us", name: "Microsoft", group: "Mega" },
  { sym: "nvda.us", name: "Nvidia", group: "Mega" },
  { sym: "amzn.us", name: "Amazon", group: "Mega" },
  { sym: "googl.us", name: "Alphabet", group: "Mega" },
  { sym: "meta.us", name: "Meta", group: "Mega" },
  { sym: "tsla.us", name: "Tesla", group: "Mega" },

  // Large Cap
  { sym: "jpm.us", name: "JPMorgan Chase", group: "Large" },
  { sym: "wmt.us", name: "Walmart", group: "Large" },
  { sym: "jnj.us", name: "Johnson & Johnson", group: "Large" },
  { sym: "pg.us", name: "Procter & Gamble", group: "Large" },
  { sym: "xom.us", name: "Exxon Mobil", group: "Large" },
  { sym: "hd.us", name: "Home Depot", group: "Large" },

  // Sectors (SPDR)
  { sym: "xlk.us", name: "Tech", group: "Sector" },
  { sym: "xlf.us", name: "Financials", group: "Sector" },
  { sym: "xle.us", name: "Energy", group: "Sector" },
  { sym: "xly.us", name: "Consumer Disc", group: "Sector" },
  { sym: "xlp.us", name: "Consumser Staples", group: "Sector" },
  { sym: "xli.us", name: "Industrials", group: "Sector" },
  { sym: "xlv.us", name: "Health Care", group: "Sector" },
  { sym: "xlu.us", name: "Utilities", group: "Sector" },
  { sym: "xlb.us", name: "Materials", group: "Sector" },
  { sym: "xlc.us", name: "Communcation", group: "Sector" },
  { sym: "xlre.us", name: "Real Estate", group: "Sector" },

  // “Stuff” people argue about
  { sym: "xauusd", name: "Gold", group: "Macro" },
  { sym: "cb.f", name: "Brent Oil", group: "Macro" },
  { sym: "cl.f", name: "WTI Crude", group: "Macro" },
  { sym: "gc.f", name: "Gold (Fut)", group: "Macro" },
  { sym: "2yusy.b", name: "US 2Y Yield", group: "Macro" },
  { sym: "5yusy.b", name: "US 5Y Yield", group: "Macro" },
  { sym: "10yusy.b", name: "US 10Y Yield", group: "Macro" },
  { sym: "30yusy.b", name: "US 30Y Yield", group: "Macro" },
  { sym: "usdeur", name: "USD/EUR", group: "Macro" },
  { sym: "usdjpy", name: "USD/JPY", group: "Macro" },
  { sym: "usdcny", name: "USD/CNY", group: "Macro" },
  { sym: "usdtwd", name: "USD/TWD", group: "Macro" },
  { sym: "btc.v", name: "Bitcoin", group: "Crypto" },
  { sym: "eth.v", name: "Ethereum", group: "Crypto" },
  { sym: "sol.v", name: "Solana", group: "Crypto" },
  { sym: "xrp.v", name: "XRP", group: "Crypto" },
  { sym: "doge.v", name: "Dogecoin", group: "Crypto" },
  { sym: "hg.f", name: "Copper", group: "Macro" },
  { sym: "si.f", name: "Silver", group: "Macro" },
  { sym: "ung.us", name: "Nat Gas", group: "Macro" },
  { sym: "slx.us", name: "Steel", group: "Macro" },
];

// --- Request pacing + retry policy (Stooq is friendly until it isn't) ---
const REQUEST_GAP_MS = 800;       // baseline delay between symbols
const REQUEST_JITTER_MS = 400;    // random extra delay to look less bot-like
const BATCH_SIZE = 10;            // symbols per batch (lower = gentler on Stooq)
const BATCH_PAUSE_MS = 7_000;     // pause between batches
const BATCH_JITTER_MS = 2_000;    // random extra pause between batches

const RETRY_COUNT = 4;            // retries after the initial attempt
const BACKOFF_BASE_MS = 800;      // exponential backoff base
const BACKOFF_MAX_MS = 15_000;    // cap backoff so it doesn't explode

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sleep with jitter to avoid perfectly-regular request intervals.
 * @param {number} baseMs
 * @param {number} jitterMs
 * @returns {Promise<void>}
 */
function sleepJitter(baseMs, jitterMs) {
  const b = Math.max(0, Number(baseMs) || 0);
  const j = Math.max(0, Number(jitterMs) || 0);
  const extra = j ? Math.floor(Math.random() * (j + 1)) : 0;
  return sleepMs(b + extra);
}

/**
 * @param {number} attempt 0-based attempt number
 * @returns {number}
 */
function backoffDelayMs(attempt) {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * (2 ** attempt));
  const jitter = Math.floor(Math.random() * 250);
  return exp + jitter;
}

/**
 * @param {number} status
 * @returns {boolean}
 */
function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Fetch text with retry + exponential backoff. Honors Retry-After when present.
 * @param {string} url
 * @param {RequestInit} options
 * @param {string} label
 * @returns {Promise<string>}
 */
async function fetchTextWithRetry(url, options, label) {
  let lastErr = null;

  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const res = await fetch(url, options);

      if (res.ok) {
        return await res.text();
      }

      const status = res.status;
      const retryable = isRetryableStatus(status);

      if (!retryable || attempt === RETRY_COUNT) {
        throw new Error(`${label} HTTP ${status}`);
      }

      const ra = res.headers.get("retry-after");
      let waitMs = backoffDelayMs(attempt);

      if (ra) {
        const raNum = Number(ra);
        if (Number.isFinite(raNum) && raNum >= 0) {
          waitMs = Math.min(BACKOFF_MAX_MS, Math.floor(raNum * 1000));
        }
      }

      console.warn(`${label}: retrying after HTTP ${status} (attempt ${attempt + 1}/${RETRY_COUNT + 1}) in ${waitMs}ms`);
      await sleepMs(waitMs);
    } catch (e) {
      lastErr = e;

      if (attempt === RETRY_COUNT) break;

      const waitMs = backoffDelayMs(attempt);
      console.warn(`${label}: network error, retrying (attempt ${attempt + 1}/${RETRY_COUNT + 1}) in ${waitMs}ms`);
      await sleepMs(waitMs);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Parse Stooq daily CSV and return last close, and optionally prev close.
 * If only one data row exists, prevClose will be null.
 * @param {string} csv
 * @returns {{date:string, close:number, prevDate:(string|null), prevClose:(number|null)}}
 */
function parseLastCloseMaybePrev(csv) {
  const lines = csv.trim().split("\n").filter(Boolean);

  // Expect at least: header + 1 row
  if (lines.length < 2) {
    throw new Error("No daily data returned (header-only CSV)");
  }

  const last = lines[lines.length - 1].split(",");
  const date = last[0];
  const close = Number(last[4]);

  if (!Number.isFinite(close)) {
    throw new Error("Close value is not numeric");
  }

  // If we have at least two data rows, compute prev
  if (lines.length >= 3) {
    const prev = lines[lines.length - 2].split(",");
    const prevDate = prev[0];
    const prevClose = Number(prev[4]);

    if (!Number.isFinite(prevClose)) {
      // Treat as missing rather than failing the whole symbol
      return { date, close, prevDate: null, prevClose: null };
    }

    return { date, close, prevDate, prevClose };
  }

  // Only one data row available
  return { date, close, prevDate: null, prevClose: null };
}

/**
 * Fetch Stooq daily CSV for a symbol.
 * @param {string} sym
 * @returns {Promise<string>}
 */
async function fetchStooqDailyCsv(sym) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  return await fetchTextWithRetry(
    url,
    {
      headers: {
        "user-agent": "LiberalMarketsTapeBot/1.0 (GitHub Actions)",
        "accept": "text/csv,*/*",
      },
    },
    `Daily CSV ${sym}`
  );
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

/**
 * Read prior output to provide a fallback prev close when daily CSV is missing it.
 * @param {string} path
 * @returns {Promise<Map<string,{date:(string|null),close:number,prevDate:(string|null),prevClose:(number|null)}>>}
 */
async function readExistingItemsMap(path) {
  try {
    const text = await fs.readFile(path, "utf8");
    const json = JSON.parse(text);
    const items = Array.isArray(json?.items) ? json.items : [];
    const map = new Map();

    for (const item of items) {
      if (!item || typeof item.sym !== "string") continue;
      if (item.ok !== true) continue;

      const close = Number(item.close);
      if (!Number.isFinite(close)) continue;

      const prevClose = Number(item.prevClose);
      map.set(item.sym, {
        date: typeof item.date === "string" ? item.date : null,
        close,
        prevDate: typeof item.prevDate === "string" ? item.prevDate : null,
        prevClose: Number.isFinite(prevClose) ? prevClose : null,
      });
    }

    return map;
  } catch {
    return new Map();
  }
}

/**
 * Fill missing prevClose using prior run data if possible.
 * @param {{date:string,close:number,prevDate:(string|null),prevClose:(number|null),deltaPct:number}} cur
 * @param {{date:(string|null),close:number,prevDate:(string|null),prevClose:(number|null)}|undefined} fallback
 * @returns {{date:string,close:number,prevDate:(string|null),prevClose:(number|null),deltaPct:number}}
 */
function applyPrevFallback(cur, fallback) {
  const prevOk = Number.isFinite(cur.prevClose) && cur.prevClose !== 0;
  if (prevOk || !fallback) return cur;

  const fbDate = typeof fallback.date === "string" ? fallback.date : null;
  const fbClose = Number(fallback.close);
  const fbCloseOk = Number.isFinite(fbClose) && fbClose !== 0;

  const fbPrevDate = typeof fallback.prevDate === "string" ? fallback.prevDate : null;
  const fbPrevClose = Number(fallback.prevClose);
  const fbPrevCloseOk = Number.isFinite(fbPrevClose) && fbPrevClose !== 0;

  if (fbDate && fbDate !== cur.date && fbCloseOk) {
    cur.prevDate = fbDate;
    cur.prevClose = fbClose;
  } else if (fbPrevCloseOk) {
    cur.prevDate = fbPrevDate;
    cur.prevClose = fbPrevClose;
  }

  if (Number.isFinite(cur.prevClose) && cur.prevClose !== 0) {
    cur.deltaPct = pctChange(cur.close, cur.prevClose);
  }

  return cur;
}

/**
 * Fetch a single quote row from Stooq (works even when daily history is missing).
 * @param {string} sym
 * @returns {Promise<{date:string, close:number}>}
 */
async function fetchStooqQuote(sym) {
  // f=sd2t2c = symbol, date, time, close (simple)
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2c&h&e=csv`;
  const text = await fetchTextWithRetry(
    url,
    {
      headers: {
        "user-agent": "LiberalMarketsTapeBot/1.0 (GitHub Actions)",
        "accept": "text/csv,*/*",
      },
    },
    `Quote ${sym}`
  );

  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("No quote data returned");

  // header: Symbol,Date,Time,Close
  const row = lines[1].split(",");
  const date = row[1];
  const close = Number(row[3]);
  if (!Number.isFinite(close)) throw new Error("Quote close not numeric");

  return { date, close };
}

/**
 * Fetch daily history (fallback to quote) and compute last close + prev close + pct.
 * @param {{sym:string,name:string,group?:string}} w
 * @param {Map<string,{date:(string|null),close:number,prevDate:(string|null),prevClose:(number|null)}>} fallbackMap
 * @returns {Promise<{sym:string,name:string,group:(string|null),date?:string,close?:number,prevDate?:(string|null),prevClose?:(number|null),deltaPct?:number,ok:boolean,error?:string}>}
 */
async function fetchOne(w, fallbackMap) {
  try {
    const csv = await fetchStooqDailyCsv(w.sym);

    // Detect header-only CSV quickly
    const lines = csv.trim().split("\n").filter(Boolean);

    let date, close, prevDate = null, prevClose = null, deltaPct = 0;

    if (lines.length >= 2) {
      const parsed = parseLastCloseMaybePrev(csv);
      date = parsed.date;
      close = parsed.close;
      prevDate = parsed.prevDate;
      prevClose = parsed.prevClose;

      if (prevClose !== null && prevClose !== 0) {
        deltaPct = pctChange(close, prevClose);
      }
    } else {
      // Truly empty: fallback to quote
      const q = await fetchStooqQuote(w.sym);
      date = q.date;
      close = q.close;
      deltaPct = 0;
    }

    // If header-only daily (lines length == 1), fallback to quote
    if (lines.length === 1) {
      const q = await fetchStooqQuote(w.sym);
      date = q.date;
      close = q.close;
      prevDate = null;
      prevClose = null;
      deltaPct = 0;
    }

    const withFallback = applyPrevFallback(
      { date, close, prevDate, prevClose, deltaPct },
      fallbackMap?.get(w.sym)
    );

    return {
      sym: w.sym,
      name: w.name,
      group: w.group ?? null,
      date: withFallback.date,
      close: withFallback.close,
      prevDate: withFallback.prevDate,
      prevClose: withFallback.prevClose,
      deltaPct: withFallback.deltaPct,
      ok: true,
    };
  } catch (err) {
    return {
      sym: w.sym,
      name: w.name,
      group: w.group ?? null,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Process a watchlist in small batches with delays between each request and batch.
 * @param {string} label
 * @param {Array<{sym:string,name:string,group?:string}>} list
 * @param {Map<string,{date:(string|null),close:number,prevDate:(string|null),prevClose:(number|null)}>} fallbackMap
 * @returns {Promise<Array<any>>}
 */
async function fetchInBatches(label, list, fallbackMap) {
  const out = [];
  const total = list.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    const batchCount = Math.ceil(total / BATCH_SIZE);

    console.log(`[${label}] batch ${batchIndex}/${batchCount} (${batch.length} symbols)`);

    for (const w of batch) {
      const item = await fetchOne(w, fallbackMap);
      out.push(item);
      await sleepJitter(REQUEST_GAP_MS, REQUEST_JITTER_MS);
    }

    if (i + BATCH_SIZE < total) {
      await sleepJitter(BATCH_PAUSE_MS, BATCH_JITTER_MS);
    }
  }

  return out;
}

async function main() {
  const [priorTapeMap, priorHeatmapMap] = await Promise.all([
    readExistingItemsMap("tape.json"),
    readExistingItemsMap("heatmap.json"),
  ]);

  const results = await fetchInBatches("tape", WATCH, priorTapeMap);

  const now = new Date().toISOString();

  const payload = {
    generatedAt: now,
    source: "stooq",
    items: results,
  };

  await fs.writeFile("tape.json", JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote tape.json with ${results.length} items @ ${now}`);

  // Build heatmap payload (bigger watchlist) from the same Stooq source
  const heatmapItems = await fetchInBatches("heatmap", HEATMAP, priorHeatmapMap);

  const heatmapPayload = {
    generatedAt: now,
    source: "stooq",
    items: heatmapItems,
  };

  await fs.writeFile("heatmap.json", JSON.stringify(heatmapPayload, null, 2) + "\n", "utf8");
  console.log(`Wrote heatmap.json with ${heatmapItems.length} items @ ${now}`);

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
