"""/api/sectors and /api/em: multi-timeframe performance for a basket of ETFs."""
import datetime as dt

import config
from providers import yahoo


def _pct(now, then):
    if now is None or not then:
        return None
    return (now / then - 1.0) * 100.0


def _returns(bars):
    if len(bars) < 2:
        return {k: None for k, _ in config.TIMEFRAMES}
    last_day, last = bars[-1]
    out = {}
    for key, lookback in config.TIMEFRAMES:
        if lookback is None:
            base = bars[-2][1]
        elif lookback == "ytd":
            base = yahoo.close_on_or_before(bars, dt.date(last_day.year - 1, 12, 31))
        else:
            base = yahoo.close_on_or_before(bars, last_day - dt.timedelta(days=lookback))
        out[key] = _pct(last, base)
    return out


def _status(value, rank, count, key):
    """LEADING / ADVANCING / FLAT / DECLINING / LAGGING."""
    if value is None:
        return None
    if rank < 2 and value > 0:
        return "LEADING"
    if rank >= count - 2 and value < 0:
        return "LAGGING"
    band = config.FLAT_BAND.get(key, 0.25)
    if value > band:
        return "ADVANCING"
    if value < -band:
        return "DECLINING"
    return "FLAT"


def payload(q=None):
    return build([(s, n, g, False) for s, n, g in config.SECTORS] +
                 [(s, n, "benchmark", True) for s, n in config.BENCHMARKS])


def em_payload(q=None):
    return build([(s, n, g, False) for s, n, g in config.EM_ITEMS] +
                 [(s, n, "benchmark", True) for s, n in config.EM_BENCHMARKS])


def build(rows):
    """rows: [(symbol, name, group, is_benchmark)]. Status labels rank the non-benchmarks."""
    data = yahoo.many([r[0] for r in rows])
    items = []
    for sym, name, group, is_bench in rows:
        h = data.get(sym)
        if not h:
            continue
        spark = [round(c, 2) for _, c in h["bars"][-64:]]  # ~3 months of closes
        items.append({
            "symbol": sym, "name": name, "group": group, "benchmark": is_bench,
            "price": h["price"], "prev_close": h["prev_close"],
            "asOf": h["bars"][-1][0].isoformat() if h["bars"] else None,
            "returns": _returns(h["bars"]), "spark": spark,
        })

    # Status is ranked within the basket only, not the benchmarks.
    sectors = [i for i in items if not i["benchmark"]]
    for key, _ in config.TIMEFRAMES:
        ranked = sorted((i for i in sectors if i["returns"][key] is not None), key=lambda i: -i["returns"][key])
        for rank, it in enumerate(ranked):
            it.setdefault("status", {})[key] = _status(it["returns"][key], rank, len(ranked), key)
    for it in items:
        it.setdefault("status", {})

    return {
        "timeframes": [k for k, _ in config.TIMEFRAMES],
        "items": items,
        "asOf": max((i["asOf"] for i in items if i["asOf"]), default=None),
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
