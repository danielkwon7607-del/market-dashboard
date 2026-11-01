"""Find company tickers in headlines, using Nasdaq's screener as the name directory."""
import re
import threading
import time

import config
from providers import nasdaq

# Legal suffixes and share-class noise stripped from screener names.
_SUFFIX = re.compile(
    r"\b(common stock|ordinary shares?|american depositary shares?|depositary shares?|class [abc]|"
    r"series [a-z]|inc\.?|incorporated|corporation|corp\.?|company|co\.?|holdings?|ltd\.?|limited|plc|"
    r"n\.v\.|s\.a\.|ag|se|group|the|\(the\)|new|capital stock|units?|\.com)\b", re.I)
# Short names that are ordinary words in headlines.
_STOP = set("""target block match ball gap snap square progressive southern advance equity general american
national united first global international public best dollar booking visa oracle shell select
energy health realty union pioneer apple-pie micron-x carrier waters masco ross state street salesforce-x
corning lumen sun sunrun fox news live gold copper silver steel coin edge core axon arch compass
vista prime trade value growth summit liberty sentinel eagle quest fortune nasdaq federal associated
rogers warner mobile digital financial toronto western mitsubishi automatic royal canadian
northern eastern pacific atlantic""".split())
_ACRONYMS = set("CEO CFO AI US USA UK EU GDP CPI PCE IPO ETF FDA SEC FED FOMC ECB BOJ IMF OPEC EPS NYSE "
                "TV AM PM CEO EV ESG IT HR API OK UN NATO NOW LIVE NEW ONE BIG ALL ARE FOR HAS CAN LNG PACS BYD KEY "
                "TOP RUN WAR OIL GAS BUY YOU OUT HOT".split())
# Names people actually write in headlines.
_ALIASES = {"Google": "GOOGL", "Alphabet": "GOOGL", "Facebook": "META", "Meta": "META", "Nvidia": "NVDA",
            "Berkshire": "BRK.B", "JPMorgan": "JPM", "Goldman": "GS", "Morgan Stanley": "MS",
            "Exxon": "XOM", "Chevron": "CVX", "Disney": "DIS", "Walmart": "WMT", "Tesla": "TSLA",
            "Microsoft": "MSFT", "Amazon": "AMZN", "Netflix": "NFLX", "Broadcom": "AVGO", "Intel": "INTC",
            "Palantir": "PLTR", "Coca-Cola": "KO", "Pepsi": "PEP", "PepsiCo": "PEP", "McDonald's": "MCD",
            "Citi": "C", "Citigroup": "C", "Wells Fargo": "WFC", "Bank of America": "BAC", "BofA": "BAC",
            "UnitedHealth": "UNH", "Eli Lilly": "LLY", "Lilly": "LLY", "Pfizer": "PFE", "Boeing": "BA",
            "AMD": "AMD", "IBM": "IBM", "TSMC": "TSM", "ASML": "ASML", "Uber": "UBER", "Starbucks": "SBUX"}

_ALIAS_CASE = set(_ALIASES)

_lock = threading.Lock()
_index = {"built": 0, "re": None, "by_key": {}, "caps": {}, "names": {}}


def _short(name):
    s = _SUFFIX.sub(" ", name)
    s = re.sub(r"[,()]+", " ", s)
    return " ".join(s.split()).strip(" .-&")


def _build():
    rows = [r for r in nasdaq.screener() if r["market_cap"] >= config.TICKER_MATCH_MIN_CAP]
    by_key, caps, names = {}, {}, {}
    for r in rows:
        caps[r["symbol"]] = r["market_cap"]
        names[r["symbol"]] = _short(r["name"]) or r["symbol"]
    for r in sorted(rows, key=lambda r: r["market_cap"]):  # bigger caps overwrite smaller on clashes
        short = names[r["symbol"]]
        if len(short) >= 4 and short.lower() not in _STOP:
            by_key[short.lower()] = r["symbol"]
            first = short.split()[0]
            # First-word alias ("Micron" for Micron Technology) only for big, well-known names.
            if (r["market_cap"] >= 75e9 and len(first) >= 5 and first.lower() not in _STOP
                    and first.lower() not in by_key):
                by_key[first.lower()] = r["symbol"]
    for alias, sym in _ALIASES.items():
        if sym in caps or sym in ("BRK.B", "GOOGL"):
            by_key[alias.lower()] = sym
    keys = sorted(by_key, key=len, reverse=True)
    name_re = re.compile(r"(?<![\w$])(" + "|".join(re.escape(k) for k in keys) + r")(?:'s)?(?![\w])", re.I)
    _index.update(built=time.time(), re=name_re, by_key=by_key, caps=caps, names=names)


def _ensure():
    with _lock:
        if not _index["re"] or time.time() - _index["built"] > 3600:
            try:
                _build()
            except Exception as e:  # noqa: BLE001
                print(f"[tickers] {e!r}")


_SYMBOL = re.compile(r"(?:\$|\((?:NYSE|NASDAQ|Nasdaq|NYSEAMERICAN)\s*:\s*)?\b([A-Z]{2,5}(?:\.[AB])?)\b\)?")


def find(text, limit=3):
    """[(symbol, market_cap)] mentioned in text, biggest first."""
    _ensure()
    if not _index["re"]:
        return []
    found = {}
    for m in _index["re"].finditer(text):
        word = m.group(1)
        sym = _index["by_key"].get(word.lower())
        # Short names (PACS, Snap...) must match their exact casing, so "super PACs" isn't PACS Group.
        if sym and len(word) <= 5 and word not in (_index["names"].get(sym), *_ALIAS_CASE):
            continue
        if sym:
            found[sym] = _index["caps"].get(sym, 0)
    for m in _SYMBOL.finditer(text):  # explicit tickers: NVDA, $TSLA, (NYSE: XOM)
        sym = m.group(1)
        if sym in _index["caps"] and sym not in _ACRONYMS and len(sym) >= 3:
            found[sym] = _index["caps"][sym]
    return sorted(found.items(), key=lambda kv: -kv[1])[:limit]


def short_name(symbol):
    _ensure()
    return _index["names"].get(symbol, symbol)
