"""/api/companies: everything on the Companies tab in one payload.

  board     biggest US companies by market cap with today's move (Nasdaq screener)
  upcoming  earnings in the next few days
  results   recent earnings with EPS actual vs estimate
  deals     M&A headlines with the companies involved
  news      company headlines (tickers detected) with sentiment
"""
import datetime as dt
import re

import config
from providers import calendar, nasdaq
from services import news, tickers

_NAME_KEY = re.compile(r"\s+(class [abc]|common stock|capital stock).*$", re.I)
# Not common equity: notes, preferreds, warrants, units, tokenized/representing listings.
_NOT_COMMON = re.compile(r"representing|warrant|\bnotes?\b|preferred|\bunits?\b|depositary shares? each|debenture", re.I)


def _board():
    rows, seen = [], set()
    for r in nasdaq.screener():
        if _NOT_COMMON.search(r["name"]):
            continue
        key = _NAME_KEY.sub("", r["name"]).lower()  # GOOG/GOOGL -> one tile
        if key in seen:
            continue
        seen.add(key)
        rows.append({"symbol": r["symbol"], "name": tickers.short_name(r["symbol"]), "price": r["price"],
                     "pct": r["pct"], "change": r["change"], "cap": r["market_cap"], "sector": r["sector"]})
        if len(rows) >= config.MEGACAP_COUNT:
            break
    return rows


def _money(s):
    try:
        return float(re.sub(r"[^0-9.\-]", "", s or ""))
    except ValueError:
        return None


def _earnings(days, past):
    today = dt.date.today()
    out, step, d, n = [], -1 if past else 1, today if not past else today - dt.timedelta(days=1), 0
    while n < days:
        if d.weekday() < 5:
            n += 1
            try:
                out += [r for r in calendar.earnings_on(d) if (r["market_cap"] or 0) >= config.COMPANY_EARNINGS_MIN_CAP]
            except Exception as e:  # noqa: BLE001
                print(f"[companies] earnings {d}: {e!r}")
        d += dt.timedelta(days=step)
    return out


def _upcoming():
    rows = _earnings(5, past=False)
    rows.sort(key=lambda r: (r["date"], -r["market_cap"]))
    return [{"symbol": r["symbol"], "name": r["name"], "date": r["date"].isoformat(), "session": r["session"],
             "eps_est": r["eps_est"], "cap": r["market_cap"]} for r in rows[:60]]


def _results():
    rows = []
    for r in _earnings(5, past=True):
        actual, est = _money(r.get("eps")), _money(r["eps_est"])
        if actual is None:
            continue
        surprise = _money(r.get("surprise"))
        rows.append({"symbol": r["symbol"], "name": r["name"], "date": r["date"].isoformat(),
                     "eps": r.get("eps"), "eps_est": r["eps_est"], "surprise": surprise,
                     "beat": None if est is None else actual >= est, "cap": r["market_cap"]})
    rows.sort(key=lambda r: (r["date"], r["cap"]), reverse=True)
    return rows[:60]


def payload(q=None):
    items = news.payload()["items"]
    company = [i for i in items if i["tickers"] and i["tag"] in ("company", "markets", "macro")]
    return {
        "board": _board(),
        "upcoming": _upcoming(),
        "results": _results(),
        "deals": [i for i in company if i["deal"]][:40],
        "news": company[:80],
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
