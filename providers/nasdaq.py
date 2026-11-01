"""Nasdaq's public screener: every US-listed stock with price, % change and market cap (free)."""
import re

from . import http
from .cache import ttl_cache


def _num(s):
    try:
        return float(re.sub(r"[^0-9.\-]", "", s or ""))
    except ValueError:
        return None


@ttl_cache(300)
def screener():
    data = http.get_json("https://api.nasdaq.com/api/screener/stocks",
                         params={"tableonly": "true", "limit": "10000", "download": "true"}, timeout=30)
    out = []
    for r in data["data"]["rows"]:
        sym = (r.get("symbol") or "").strip().replace("/", ".")
        if not sym or "^" in sym:
            continue
        out.append({
            "symbol": sym,
            "name": (r.get("name") or "").strip(),
            "price": _num(r.get("lastsale")),
            "change": _num(r.get("netchange")),
            "pct": _num(r.get("pctchange")),
            "market_cap": _num(r.get("marketCap")) or 0.0,
            "sector": r.get("sector") or "",
            "industry": r.get("industry") or "",
        })
    out.sort(key=lambda r: -r["market_cap"])
    return out
