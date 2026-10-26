#!/usr/bin/env python3
"""
Fetch daily closing prices for every asset on the Markets page and keep their full history.

- History lives in data/markets/<id>.csv (date,close), one file per asset.
- An asset with no file is backfilled as far back as its source goes.
- Later runs pull the last few weeks and merge them in, so each file grows by a row a day.
  If recent closes no longer match what is stored (a stock split, a revised series), the
  asset is refetched in full.
- data/markets.json is the page's summary: latest close, returns over set periods, record
  highs, calendar-year returns and a year of weekly closes per asset.
- tape.json keeps its old shape for the ASTS tracker.

Sources: the Yahoo Finance chart API (no key) and FRED (FRED_API_KEY if set, else the public
CSV download). Some assets take their history from FRED and their latest days from Yahoo,
because FRED publishes a few days late.

Standard library only, so it runs on a stock Mac and on GitHub Actions.

  python3 scripts/fetch-markets.py            update every asset
  python3 scripts/fetch-markets.py --full     refetch every asset from scratch
  python3 scripts/fetch-markets.py spx btc    update only these ids
  python3 scripts/fetch-markets.py --summary  rebuild markets.json and tape.json from the CSVs
"""

import csv
import datetime as dt
import io
import json
import os
import random
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIST_DIR = os.path.join(ROOT, "data", "markets")
SUMMARY = os.path.join(ROOT, "data", "markets.json")
TAPE = os.path.join(ROOT, "tape.json")

UPDATE_WINDOW_DAYS = 21     # how far back a routine update re-pulls
MISMATCH_TOLERANCE = 0.005  # a stored close this far off the source triggers a full refetch
REQUEST_GAP = 0.6           # seconds between requests
RETRIES = 4

# kind: "price" moves in percent; "yield" moves in percentage points.
# src: (provider, symbol) pairs. The first gives the history; any later one only adds days
# after the first one's latest date.
ASSETS = [
    # shares: approximate shares outstanding (stocks) or circulating supply (crypto), so the map can size each
    # tile by market value (shares × latest close). weight: approximate S&P 500 weight of a sector fund, in %.
    # US indexes
    dict(id="spx", name="S&P 500", short="S&P 500", group="us", src=[("yahoo", "^GSPC")]),
    dict(id="ndx", name="Nasdaq 100", short="Nasdaq 100", group="us", src=[("yahoo", "^NDX")]),
    dict(id="dji", name="Dow Jones Industrial Average", short="Dow", group="us", src=[("yahoo", "^DJI")]),
    dict(id="rut", name="Russell 2000", short="Russell 2000", group="us", src=[("yahoo", "^RUT")]),
    # World indexes
    dict(id="ftse", name="FTSE 100", short="FTSE 100", group="world", place="London", src=[("yahoo", "^FTSE")]),
    dict(id="dax", name="DAX", short="DAX", group="world", place="Frankfurt", src=[("yahoo", "^GDAXI")]),
    dict(id="n225", name="Nikkei 225", short="Nikkei", group="world", place="Tokyo", src=[("yahoo", "^N225")]),
    dict(id="hsi", name="Hang Seng", short="Hang Seng", group="world", place="Hong Kong", src=[("yahoo", "^HSI")]),
    dict(id="sensex", name="BSE Sensex", short="Sensex", group="world", place="Mumbai", src=[("yahoo", "^BSESN")]),
    # Biggest companies
    dict(id="aapl", name="Apple", short="AAPL", group="mega", shares=14.8e9, src=[("yahoo", "AAPL")]),
    dict(id="msft", name="Microsoft", short="MSFT", group="mega", shares=7.43e9, src=[("yahoo", "MSFT")]),
    dict(id="nvda", name="Nvidia", short="NVDA", group="mega", shares=24.3e9, src=[("yahoo", "NVDA")]),
    dict(id="amzn", name="Amazon", short="AMZN", group="mega", shares=10.7e9, src=[("yahoo", "AMZN")]),
    dict(id="googl", name="Alphabet", short="GOOGL", group="mega", shares=12.1e9, src=[("yahoo", "GOOGL")]),
    dict(id="meta", name="Meta", short="META", group="mega", shares=2.52e9, src=[("yahoo", "META")]),
    dict(id="tsla", name="Tesla", short="TSLA", group="mega", shares=3.22e9, src=[("yahoo", "TSLA")]),
    # Household names
    dict(id="jpm", name="JPMorgan Chase", short="JPM", group="large", shares=2.75e9, src=[("yahoo", "JPM")]),
    dict(id="wmt", name="Walmart", short="WMT", group="large", shares=7.98e9, src=[("yahoo", "WMT")]),
    dict(id="jnj", name="Johnson & Johnson", short="JNJ", group="large", shares=2.41e9, src=[("yahoo", "JNJ")]),
    dict(id="pg", name="Procter & Gamble", short="PG", group="large", shares=2.34e9, src=[("yahoo", "PG")]),
    dict(id="xom", name="Exxon Mobil", short="XOM", group="large", shares=4.3e9, src=[("yahoo", "XOM")]),
    dict(id="hd", name="Home Depot", short="HD", group="large", shares=0.995e9, src=[("yahoo", "HD")]),
    dict(id="asts", name="AST SpaceMobile", short="ASTS", group="large", shares=0.36e9, src=[("yahoo", "ASTS")]),
    # S&P 500 sectors (SPDR funds)
    dict(id="xlk", name="Technology", short="XLK", group="sector", weight=33, src=[("yahoo", "XLK")]),
    dict(id="xlc", name="Communication", short="XLC", group="sector", weight=10, src=[("yahoo", "XLC")]),
    dict(id="xly", name="Consumer discretionary", short="XLY", group="sector", weight=10.5, src=[("yahoo", "XLY")]),
    dict(id="xlp", name="Consumer staples", short="XLP", group="sector", weight=5, src=[("yahoo", "XLP")]),
    dict(id="xlf", name="Financials", short="XLF", group="sector", weight=13, src=[("yahoo", "XLF")]),
    dict(id="xlv", name="Health care", short="XLV", group="sector", weight=9, src=[("yahoo", "XLV")]),
    dict(id="xli", name="Industrials", short="XLI", group="sector", weight=8.5, src=[("yahoo", "XLI")]),
    dict(id="xle", name="Energy", short="XLE", group="sector", weight=3, src=[("yahoo", "XLE")]),
    dict(id="xlb", name="Materials", short="XLB", group="sector", weight=1.8, src=[("yahoo", "XLB")]),
    dict(id="xlu", name="Utilities", short="XLU", group="sector", weight=2.4, src=[("yahoo", "XLU")]),
    dict(id="xlre", name="Real estate", short="XLRE", group="sector", weight=2, src=[("yahoo", "XLRE")]),
    # Treasury yields
    dict(id="us2y", name="2-year Treasury yield", short="2-year", group="rates", kind="yield", src=[("fred", "DGS2")]),
    dict(id="us5y", name="5-year Treasury yield", short="5-year", group="rates", kind="yield", src=[("fred", "DGS5"), ("yahoo", "^FVX")]),
    dict(id="us10y", name="10-year Treasury yield", short="10-year", group="rates", kind="yield", src=[("fred", "DGS10"), ("yahoo", "^TNX")]),
    dict(id="us30y", name="30-year Treasury yield", short="30-year", group="rates", kind="yield", src=[("fred", "DGS30"), ("yahoo", "^TYX")]),
    # Currencies
    dict(id="eurusd", name="Euro in dollars", short="EUR/USD", group="fx", unit="$", src=[("fred", "DEXUSEU"), ("yahoo", "EURUSD=X")]),
    dict(id="usdjpy", name="Dollar in yen", short="USD/JPY", group="fx", unit="¥", src=[("fred", "DEXJPUS"), ("yahoo", "JPY=X")]),
    dict(id="usdcny", name="Dollar in yuan", short="USD/CNY", group="fx", unit="¥", src=[("fred", "DEXCHUS"), ("yahoo", "CNY=X")]),
    dict(id="usdtwd", name="Dollar in Taiwan dollars", short="USD/TWD", group="fx", unit="NT$", src=[("fred", "DEXTAUS"), ("yahoo", "TWD=X")]),
    dict(id="usdbrl", name="Dollar in reais", short="USD/BRL", group="fx", unit="R$", src=[("yahoo", "BRL=X")]),
    # Commodities
    dict(id="gold", name="Gold", short="Gold", group="commod", per="oz", src=[("yahoo", "GC=F")]),
    dict(id="silver", name="Silver", short="Silver", group="commod", per="oz", src=[("yahoo", "SI=F")]),
    dict(id="copper", name="Copper", short="Copper", group="commod", per="lb", src=[("yahoo", "HG=F")]),
    dict(id="brent", name="Brent crude", short="Brent", group="commod", per="bbl", src=[("fred", "DCOILBRENTEU"), ("yahoo", "BZ=F")]),
    dict(id="wti", name="WTI crude", short="WTI", group="commod", per="bbl", src=[("fred", "DCOILWTICO"), ("yahoo", "CL=F")]),
    dict(id="natgas", name="Natural gas", short="Nat gas", group="commod", per="MMBtu", src=[("fred", "DHHNGSP"), ("yahoo", "NG=F")]),
    dict(id="steel", name="Steel producers (SLX)", short="Steel", group="commod", src=[("yahoo", "SLX")]),
    # Crypto
    dict(id="btc", name="Bitcoin", short="BTC", group="crypto", shares=19.95e6, src=[("yahoo", "BTC-USD")]),
    dict(id="eth", name="Ether", short="ETH", group="crypto", shares=120.7e6, src=[("yahoo", "ETH-USD")]),
    dict(id="sol", name="Solana", short="SOL", group="crypto", shares=560e6, src=[("yahoo", "SOL-USD")]),
    dict(id="xrp", name="XRP", short="XRP", group="crypto", shares=60e9, src=[("yahoo", "XRP-USD")]),
    dict(id="doge", name="Dogecoin", short="DOGE", group="crypto", shares=150e9, src=[("yahoo", "DOGE-USD")]),
]

GROUPS = {
    "us": "US stocks",
    "world": "World stocks",
    "mega": "Biggest companies",
    "large": "Household names",
    "sector": "S&P 500 sectors",
    "rates": "Treasury yields",
    "fx": "Currencies",
    "commod": "Commodities",
    "crypto": "Crypto",
}

# The ASTS tracker reads these from tape.json by their old Stooq symbols.
TAPE_SYMS = {"us2y": "2yusy.b", "us5y": "5yusy.b", "us10y": "10yusy.b", "us30y": "30yusy.b",
             "eurusd": "usdeur", "brent": "cb.f", "spx": "^spx", "gold": "xauusd", "asts": "asts.us"}

# Yahoo answers 429 to full browser strings and to curl's default, but serves this one.
# FRED drops connections that send it, so FRED requests keep Python's own user agent.
YAHOO_UA = "Mozilla/5.0"


# ── HTTP ─────────────────────────────────────────────────────────────────

def _ssl_context():
    try:
        import certifi  # present on many Macs; the system store is used otherwise
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


SSL = _ssl_context()


def _curl(url, ua=None):
    # Fallback for Python builds without a working certificate store.
    out = subprocess.run(["curl", "-sSfL", *(["-A", ua] if ua else []), "--max-time", "60", url],
                         capture_output=True, check=True)
    return out.stdout.decode("utf-8")


def get(url, ua=None):
    last = None
    for attempt in range(RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": ua} if ua else {})
            with urllib.request.urlopen(req, timeout=60, context=SSL) as res:
                return res.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (429, 500, 502, 503, 504):
                raise
        except urllib.error.URLError as e:
            if isinstance(e.reason, ssl.SSLError):
                return _curl(url, ua)
            last = e
        except Exception as e:  # timeouts, resets
            last = e
        time.sleep(min(20, 1.5 * 2 ** attempt) + random.random())
    raise last


# ── Sources ──────────────────────────────────────────────────────────────

def tidy(x):
    """Six significant figures is plenty for a daily close."""
    return float(f"{x:.6g}")


def yahoo(symbol, start=None):
    p1 = int(dt.datetime(start.year, start.month, start.day, tzinfo=dt.timezone.utc).timestamp()) if start else -2208988800
    p2 = int(time.time()) + 86400
    host = random.choice(["query1", "query2"])
    url = (f"https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}"
           f"?period1={p1}&period2={p2}&interval=1d&events=split")
    data = json.loads(get(url, YAHOO_UA))
    result = (data.get("chart") or {}).get("result") or []
    if not result:
        raise RuntimeError(f"yahoo {symbol}: {(data.get('chart') or {}).get('error')}")
    r = result[0]
    meta = r.get("meta") or {}
    offset = meta.get("gmtoffset") or 0
    # A bar from a session that hasn't finished is a live quote, not a close. Over a weekend the
    # session Yahoo reports is still Friday's, and a bar after it is the new week's live one.
    session = (meta.get("currentTradingPeriod") or {}).get("regular") or {}
    s_start, s_end = session.get("start"), session.get("end")
    live_from = (s_start if time.time() < s_end else s_end) if s_start and s_end else None
    # A currency reopening on Sunday evening gets a bar stamped at its latest tick rather than at a
    # session open, so it slips under that cut; a bar at the latest tick of an unfinished session is live.
    live_tick = meta.get("regularMarketTime") if s_end and time.time() < s_end else None
    stamps = r.get("timestamp") or []
    closes = ((r.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    rows = {}
    for ts, c in zip(stamps, closes):
        if c is None or c <= 0 or (live_from and ts >= live_from) or ts == live_tick:
            continue
        # Bars are stamped at the session open in exchange time, and the offset Yahoo reports is
        # today's, so across a clock change a midnight open (currencies) lands an hour early.
        # Twelve hours on puts every open on its own trading day.
        day = dt.datetime.fromtimestamp(ts + offset + 43200, dt.timezone.utc).date().isoformat()
        rows[day] = tidy(c)
    return rows


def fred(series, start=None):
    key = os.environ.get("FRED_API_KEY")
    begin = (start or dt.date(1900, 1, 1)).isoformat()
    rows = {}
    if key:
        url = ("https://api.stlouisfed.org/fred/series/observations?"
               + urllib.parse.urlencode({"series_id": series, "api_key": key, "file_type": "json",
                                         "observation_start": begin, "limit": 100000}))
        for o in json.loads(get(url)).get("observations", []):
            try:
                v = float(o["value"])
            except ValueError:
                continue
            rows[o["date"]] = tidy(v)
    else:
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={begin}"
        reader = csv.reader(io.StringIO(get(url)))
        next(reader, None)
        for line in reader:
            if len(line) < 2:
                continue
            try:
                v = float(line[1])
            except ValueError:
                continue
            rows[line[0]] = tidy(v)
    return rows


def fetch(provider, symbol, start=None):
    time.sleep(REQUEST_GAP + random.random() * 0.4)
    return (yahoo if provider == "yahoo" else fred)(symbol, start)


# ── Storage ──────────────────────────────────────────────────────────────

def path_for(asset):
    return os.path.join(HIST_DIR, f"{asset['id']}.csv")


def read_history(asset):
    rows = {}
    try:
        with open(path_for(asset), newline="") as f:
            reader = csv.reader(f)
            next(reader, None)
            for line in reader:
                if len(line) >= 2:
                    rows[line[0]] = float(line[1])
    except FileNotFoundError:
        pass
    return rows


def write_history(asset, rows):
    os.makedirs(HIST_DIR, exist_ok=True)
    tmp = path_for(asset) + ".tmp"
    with open(tmp, "w", newline="") as f:
        f.write("date,close\n")
        for day in sorted(rows):
            f.write(f"{day},{rows[day]:g}\n")
    os.replace(tmp, path_for(asset))


def splice(asset, start=None):
    """History from the first source, with later sources adding only the days after it ends."""
    (p0, s0), *tails = asset["src"]
    rows = fetch(p0, s0, start)
    if not rows:
        raise RuntimeError(f"{asset['id']}: {p0} {s0} returned nothing")
    for provider, symbol in tails:
        end = max(rows)
        try:
            extra = fetch(provider, symbol, dt.date.fromisoformat(end) - dt.timedelta(days=7))
        except Exception as e:
            print(f"  {asset['id']}: tail {symbol} failed ({e}); keeping {p0} only")
            continue
        # A tail quoted on another basis (yields ×10, a different contract) would show as a cliff.
        if extra and abs(extra[max(extra)] / rows[end] - 1) > 0.2:
            print(f"  {asset['id']}: tail {symbol} reads {extra[max(extra)]} against {rows[end]}; ignored")
            continue
        rows.update({d: v for d, v in extra.items() if d > end})
    # Currency and futures quotes open on Sunday evening; that partial bar isn't a close.
    if asset["group"] != "crypto":
        rows = {d: v for d, v in rows.items() if dt.date.fromisoformat(d).weekday() < 5}
    # WTI settled at -$37 on 2020-04-20. A price at or below zero has no percent change or log.
    if asset.get("kind") != "yield":
        rows = {d: v for d, v in rows.items() if v > 0}
    return rows


def update(asset, full=False):
    stored = read_history(asset)
    if full or len(stored) < 30:
        rows = splice(asset)
        write_history(asset, rows)
        return f"backfilled {len(rows)} days from {min(rows)}"

    last = dt.date.fromisoformat(max(stored))
    start = last - dt.timedelta(days=UPDATE_WINDOW_DAYS)
    fresh = splice(asset, start)

    # Days a later source filled in may since have been published by the main source: those get
    # replaced. Anything older that disagrees means the history itself changed, so start over.
    # Only single-source assets are checked: a tail source quotes on a slightly different basis
    # (futures against spot), so its days are expected to differ when the main source catches up.
    settled = sorted(d for d in fresh if d in stored)[:-5] if len(asset["src"]) == 1 else []
    for d in settled:
        if abs(fresh[d] / stored[d] - 1) > MISMATCH_TOLERANCE:
            rows = splice(asset)
            write_history(asset, rows)
            return f"history changed on {d} ({stored[d]} → {fresh[d]}); refetched {len(rows)} days"

    # Drop stored days in the window the source no longer has (a stray holiday print).
    merged = {d: v for d, v in stored.items() if d < start.isoformat() or d in fresh}
    merged.update(fresh)
    write_history(asset, merged)
    added = len([d for d in fresh if d not in stored])
    return f"+{added} day(s), latest {max(merged)}"


# ── Summary ──────────────────────────────────────────────────────────────

def on_or_before(days, values, target):
    """Index of the last row dated on or before target, or -1."""
    lo, hi = 0, len(days) - 1
    found = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if days[mid] <= target:
            found = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return found


def shift(day, years=0, months=0, days=0):
    d = dt.date.fromisoformat(day)
    if years or months:
        m = d.month - 1 + months
        y = d.year + years + m // 12
        m = m % 12 + 1
        last = [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
        d = dt.date(y, m, min(d.day, last))
    return (d - dt.timedelta(days=days)).isoformat()


def r4(x):
    return None if x is None else round(x, 4)


def summarise(asset):
    rows = read_history(asset)
    if len(rows) < 2:
        return None
    days = sorted(rows)
    values = [rows[d] for d in days]
    is_yield = asset.get("kind") == "yield"
    last_day, last = days[-1], values[-1]

    def change(i):
        if i < 0:
            return None
        base = values[i]
        return last - base if is_yield else (last / base - 1) * 100

    periods = {
        "1d": change(len(days) - 2),
        "1w": change(on_or_before(days, values, shift(last_day, days=7))),
        "1m": change(on_or_before(days, values, shift(last_day, months=-1))),
        "ytd": change(on_or_before(days, values, f"{int(last_day[:4]) - 1}-12-31")),
        "1y": change(on_or_before(days, values, shift(last_day, years=-1))),
        "5y": change(on_or_before(days, values, shift(last_day, years=-5))),
        "10y": change(on_or_before(days, values, shift(last_day, years=-10))),
    }
    # A period that reaches before the data starts has no honest answer.
    for key, back in (("1y", shift(last_day, years=-1)), ("5y", shift(last_day, years=-5)), ("10y", shift(last_day, years=-10)),
                      ("ytd", f"{int(last_day[:4]) - 1}-12-31")):
        if days[0] > back:
            periods[key] = None

    hi_i = max(range(len(values)), key=values.__getitem__)
    lo_i = min(range(len(values)), key=values.__getitem__)
    year_ago = shift(last_day, years=-1)
    recent = [v for d, v in zip(days, values) if d > year_ago]

    # Calendar-year change: last close of each year against the last close of the one before.
    years = {}
    year_end = {}
    for d, v in zip(days, values):
        year_end[d[:4]] = v
    ys = sorted(year_end)
    for a, b in zip(ys, ys[1:]):
        if int(b) - int(a) != 1:
            continue  # a year missing from the source (Yahoo has no 2005 for the real) would merge two years into one
        years[b] = year_end[b] - year_end[a] if is_yield else (year_end[b] / year_end[a] - 1) * 100
    # A first year that began mid-year is left out: its change would be a part-year.

    # Weekly closes for a year, for sparklines: the last close of each ISO week.
    weekly = {}
    for d, v in zip(days, values):
        if d > year_ago:
            iso = dt.date.fromisoformat(d).isocalendar()
            weekly[(iso[0], iso[1])] = v
    spark = [weekly[k] for k in sorted(weekly)]

    out = dict(
        id=asset["id"], name=asset["name"], short=asset["short"], group=asset["group"],
        kind=asset.get("kind", "price"),
        source=" + ".join(f"{'Yahoo Finance' if p == 'yahoo' else 'FRED'} {s}" for p, s in asset["src"]),
        first=days[0], date=last_day, close=last, prev=values[-2],
        periods={k: r4(v) for k, v in periods.items()},
        high=values[hi_i], highDate=days[hi_i], low=values[lo_i], lowDate=days[lo_i],
        fromHigh=None if is_yield else r4((last / values[hi_i] - 1) * 100),
        hi52=max(recent) if recent else None, lo52=min(recent) if recent else None,
        years={k: r4(v) for k, v in years.items()},
        spark=spark,
        days=len(days),
    )
    for key in ("unit", "per", "place", "weight"):
        if asset.get(key):
            out[key] = asset[key]
    if asset.get("shares"):
        out["cap"] = round(asset["shares"] * last)
    if not is_yield:
        span = (dt.date.fromisoformat(last_day) - dt.date.fromisoformat(days[0])).days / 365.25
        if span >= 3:
            out["cagr"] = r4(((last / values[0]) ** (1 / span) - 1) * 100)
    return out


def write_summary():
    items = [s for s in (summarise(a) for a in ASSETS) if s]
    summary = dict(
        generatedAt=dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        groups=[dict(id=k, name=v) for k, v in GROUPS.items()],
        assets=items,
    )
    with open(SUMMARY, "w") as f:
        json.dump(summary, f, separators=(",", ":"), ensure_ascii=False)

    tape = dict(generatedAt=summary["generatedAt"], source="data/markets", items=[])
    by_id = {s["id"]: s for s in items}
    for aid, sym in TAPE_SYMS.items():
        s = by_id.get(aid)
        if not s:
            tape["items"].append(dict(sym=sym, name=aid, ok=False, error="no data"))
            continue
        tape["items"].append(dict(sym=sym, name=s["name"], group=None, date=s["date"], close=s["close"],
                                  prevClose=s["prev"], deltaPct=(s["close"] / s["prev"] - 1) * 100 if s["prev"] else None,
                                  ok=True))
    with open(TAPE, "w") as f:
        json.dump(tape, f, indent=2)
    print(f"Wrote {os.path.relpath(SUMMARY, ROOT)} ({len(items)} assets) and tape.json")


def main(argv):
    full = "--full" in argv
    only_summary = "--summary" in argv
    ids = [a for a in argv if not a.startswith("--")]
    unknown = set(ids) - {a["id"] for a in ASSETS}
    if unknown:
        sys.exit(f"Unknown id(s): {', '.join(sorted(unknown))}")

    failures = []
    if not only_summary:
        for asset in ASSETS:
            if ids and asset["id"] not in ids:
                continue
            try:
                print(f"{asset['id']:>7}: {update(asset, full)}", flush=True)
            except Exception as e:
                failures.append(asset["id"])
                print(f"{asset['id']:>7}: FAILED {e}", flush=True)
    write_summary()
    if failures:
        print(f"{len(failures)} failed: {', '.join(failures)}")
        # Fail the run only when nothing worked, so one flaky symbol doesn't block the rest.
        if len(failures) == len([a for a in ASSETS if not ids or a["id"] in ids]):
            sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
