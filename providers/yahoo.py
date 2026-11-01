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
