"""Yahoo Finance chart endpoint (free, no key)."""
import datetime as dt
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo

from . import http
from .cache import ttl_cache

CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"


@ttl_cache(60)
def daily_history(symbol, rng="2y"):
    """Daily closes for `symbol`, with the latest bar set to the live price.

    Returns {symbol, name, price, prev_close, high, low, time, currency,
             bars: [(date, close), ...]} with dates as datetime.date.
    """
    data = http.get_json(CHART_URL.format(symbol=symbol),
                         params={"range": rng, "interval": "1d", "includePrePost": "false"})
    res = data["chart"]["result"][0]
    meta = res["meta"]
    quote = res["indicators"]["quote"][0]
    # Use the exchange's real zone: futures bars are stamped at midnight ET, so a fixed
    # gmtoffset shifts them a day across DST changes.
    try:
        tz = ZoneInfo(meta["exchangeTimezoneName"])
    except Exception:  # noqa: BLE001
        tz = dt.timezone(dt.timedelta(seconds=meta.get("gmtoffset", 0)))
    bars = []
    for ts, c in zip(res.get("timestamp") or [], quote.get("close") or []):
        if c is not None:
            bars.append((dt.datetime.fromtimestamp(ts, tz).date(), float(c)))
    price = meta.get("regularMarketPrice")
    mkt_time = meta.get("regularMarketTime")
    if price is not None and mkt_time:
        today = dt.datetime.fromtimestamp(mkt_time, tz).date()
        if bars and bars[-1][0] == today:
            bars[-1] = (today, float(price))
        elif not bars or bars[-1][0] < today:
            bars.append((today, float(price)))
    last = bars[-1][1] if bars else price
    prev = bars[-2][1] if len(bars) > 1 else meta.get("chartPreviousClose")
    return {
        "symbol": symbol,
        "name": meta.get("shortName") or meta.get("longName") or symbol,
        "price": last,
        "prev_close": prev,
        "high": meta.get("regularMarketDayHigh"),
        "low": meta.get("regularMarketDayLow"),
        "time": mkt_time,
        "currency": meta.get("currency"),
        "bars": bars,
    }


def many(symbols, rng="2y"):
    """Fetch several symbols in parallel. Failed symbols are left out."""
    out = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {s: pool.submit(daily_history, s, rng) for s in symbols}
        for s, f in futs.items():
            try:
                out[s] = f.result()
            except Exception as e:  # noqa: BLE001 - one bad symbol shouldn't sink the page
                print(f"[yahoo] {s}: {e}")
    return out


def close_on_or_before(bars, day):
    """Last close on or before `day` (bars sorted ascending)."""
    best = None
    for d, c in bars:
        if d <= day:
            best = c
        else:
            break
    return best


@ttl_cache(60)
def candles(symbol, rng, interval, keep_hours=None):
    """OHLC bars for charts. Intraday times are shifted to exchange-local 'wall clock' seconds
    (charting libs render UTC), daily+ bars use 'YYYY-MM-DD'."""
    data = http.get_json(CHART_URL.format(symbol=symbol),
                         params={"range": rng, "interval": interval, "includePrePost": "false"})
    res = data["chart"]["result"][0]
    meta = res["meta"]
    q = res["indicators"]["quote"][0]
    try:
        tz = ZoneInfo(meta["exchangeTimezoneName"])
    except Exception:  # noqa: BLE001
        tz = dt.timezone(dt.timedelta(seconds=meta.get("gmtoffset", 0)))
    intraday = interval[-1] in "mh"
    stamps = res.get("timestamp") or []
    if keep_hours and stamps:
        cutoff = stamps[-1] - keep_hours * 3600
    else:
        cutoff = None
    bars, before = [], None
    for i, ts in enumerate(stamps):
        o, h, l, c = (q.get(k, [None])[i] for k in ("open", "high", "low", "close"))
        if None in (o, h, l, c) or c <= 0:
            continue
        # Yahoo sometimes zeroes O/H/L on the live bar; fall back to the close.
        o, h, l = (x if x and x > 0 else c for x in (o, h, l))
        h, l = max(h, o, c), min(l, o, c)
        if cutoff and ts < cutoff:
            before = c  # last close before the window = reference "previous close"
            continue
        local = dt.datetime.fromtimestamp(ts, tz)
        t = int(ts + local.utcoffset().total_seconds()) if intraday else local.date().isoformat()
        if bars and bars[-1]["time"] == t:  # Yahoo sometimes repeats the live bar
            bars[-1] = {"time": t, "open": o, "high": h, "low": l, "close": c}
            continue
        bars.append({"time": t, "open": o, "high": h, "low": l, "close": c})
    if intraday:
        _fix_stale_opens(bars)
    return {
        "symbol": symbol,
        "price": meta.get("regularMarketPrice"),
        # Reference for the window's change: the close just before it, else the first open.
        "base": before if before is not None else (bars[0]["open"] if bars else None),
        "intraday": intraday,
        "bars": bars,
    }


def _fix_stale_opens(bars):
    """Yahoo occasionally stamps an intraday bar with a stale open (e.g. yesterday's close),
    drawing a huge fake candle. If an open sits far from the previous close, re-anchor it."""
    if len(bars) < 10:
        return
    ranges = sorted(b["high"] - b["low"] for b in bars)
    typical = ranges[len(ranges) // 2] or 1e-9
    for prev, b in zip(bars, bars[1:]):
        gap = abs(b["open"] - prev["close"])
        if gap > 8 * typical:
            stale = b["open"]
            b["open"] = prev["close"]
            hi = b["high"] if b["high"] != stale else max(b["open"], b["close"])
            lo = b["low"] if b["low"] != stale else min(b["open"], b["close"])
            b["high"], b["low"] = max(hi, b["open"], b["close"]), min(lo, b["open"], b["close"])
