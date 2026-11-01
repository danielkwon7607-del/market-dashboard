"""/api/charts: asset list (no params) or OHLC bars (?id=ES&tf=1M)."""
import config
from providers import yahoo

ASSETS = {a[0]: a for a in config.CHART_ASSETS}


def payload(q=None):
    q = q or {}
    if "id" not in q:
        return {
            "timeframes": list(config.CHART_TIMEFRAMES),
            "assets": [{"id": i, "symbol": s, "label": l, "desc": d, "decimals": dec, "comparable": cmp}
                       for i, s, l, d, dec, cmp in config.CHART_ASSETS],
        }
    asset = ASSETS.get(q["id"])
    tf = q.get("tf", "1D")
    if not asset or tf not in config.CHART_TIMEFRAMES:
        raise ValueError(f"unknown asset/timeframe {q.get('id')}/{tf}")
    rng, interval, keep = config.CHART_TIMEFRAMES[tf]
    c = yahoo.candles(asset[1], rng, interval, keep)
    last = c["bars"][-1]["close"] if c["bars"] else c["price"]
    base = c["base"]
    return {
        "id": asset[0], "tf": tf, "intraday": c["intraday"], "bars": c["bars"],
        "last": last, "base": base,
        "change": (last - base) if (last is not None and base) else None,
        "pct": ((last / base - 1) * 100) if (last is not None and base) else None,
    }
