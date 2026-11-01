"""/api/macro: items for the rotating ticker bar.

Each item: {id, label, value, change, dir, phrases[], asOf, source}
  value/change - the always-visible numbers; the frontend flashes an item when `value` changes
  phrases      - alternate wordings the ticker rotates through
To add an item: add a builder below and list it in MACRO_BUILDERS (or add a row to
config.MARKET_QUOTES for anything on Yahoo).
"""
import datetime as dt

import config
from providers import calendar, fred, yahoo


def _dir(x, eps=1e-9):
    if x is None or abs(x) < eps:
        return "flat"
    return "up" if x > 0 else "down"


def _mon(d):
    return d.strftime("%b").upper()


def _day(d):
    return d.strftime("%b %-d").upper()


def _fmt(x, dec):
    return f"{x:,.{dec}f}"


# ---- Yahoo quotes ---------------------------------------------------------
def market_items():
    rows = config.MARKET_QUOTES
    data = yahoo.many([r[1] for r in rows], "1mo")
    out = []
    for qid, sym, label, dec, kind in rows:
        h = data.get(sym)
        if not h or h["price"] is None:
            continue
        p, prev = h["price"], h["prev_close"]
        chg = p - prev if prev else None
        pct = (chg / prev * 100) if prev else None
        bars = h["bars"]
        wk = yahoo.close_on_or_before(bars, bars[-1][0] - dt.timedelta(days=7)) if bars else None
        if kind == "yield":
            value = f"{p:.3f}%"
            change = f"{chg * 100:+.1f}bp" if chg is not None else ""
            phrases = [f"{chg * 100:+.1f}BP ON DAY" if chg is not None else "",
                       f"WEEK {((p - wk) * 100):+.0f}BP" if wk else ""]
        else:
            value = _fmt(p, dec)
            change = f"{pct:+.2f}%" if pct is not None else ""
            phrases = [f"{chg:+,.{dec}f} ON DAY" if chg is not None else "",
                       f"WEEK {((p / wk - 1) * 100):+.2f}%" if wk else ""]
        if h.get("high") and h.get("low"):
            phrases.append(f"RANGE {_fmt(h['low'], dec)}–{_fmt(h['high'], dec)}")
        if qid == "VIX":
            phrases.append("RISK-OFF" if p >= 25 else "ELEVATED" if p >= 18 else "CALM TAPE")
        out.append({
            "id": qid, "label": label, "value": value, "change": change, "dir": _dir(chg),
            "phrases": [x for x in phrases if x], "asOf": h["time"], "source": "Yahoo",
        })
    return out


# ---- FRED builders --------------------------------------------------------
def _last_change(rows):
    """(date, delta) of the most recent change in a step series like the fed funds target."""
    for i in range(len(rows) - 1, 0, -1):
        if rows[i][1] != rows[i - 1][1]:
            return rows[i][0], rows[i][1] - rows[i - 1][1]
    return None, 0.0


def fed_funds(s):
    lo, hi = s["DFEDTARL"], s["DFEDTARU"]
    when, delta = _last_change(hi)
    phrases = [f"TARGET {lo[-1][1]:.2f}–{hi[-1][1]:.2f}%"]
    if "DFF" in s and s["DFF"]:
        d, v = s["DFF"][-1]
        phrases.append(f"EFFECTIVE {v:.2f}% · {_day(d)}")
    if when:
        bp = round(delta * 100)
        verb = "CUT" if bp < 0 else "HIKE"
        phrases.append(f"LAST MOVE {verb} {abs(bp)}BP · {when.strftime('%b %-d, %Y').upper()}")
    today = dt.date.today()
    nxt = next((dt.date.fromisoformat(x) for x in config.FOMC_DECISION_DATES
                if dt.date.fromisoformat(x) >= today), None)
    if nxt:
        phrases.append(f"NEXT FOMC {_day(nxt)} · {(nxt - today).days}D")
    return {
        "id": "FEDFUNDS", "label": "FED FUNDS", "value": f"{lo[-1][1]:.2f}–{hi[-1][1]:.2f}%",
        "change": f"{'−' if delta < 0 else '+'}{abs(round(delta * 100))}bp {_mon(when)}" if when else "",
        "dir": _dir(delta), "phrases": phrases, "asOf": hi[-1][0].isoformat(), "source": "FRED",
    }


def _next_release(item, when, name):
    """Add a 'NEXT CPI NOV 10 · 9D' phrase if the release calendar knows the date."""
    if when:
        days = (when - dt.date.today()).days
        item["phrases"].append(f"NEXT {name} {_day(when)} · {'TODAY' if days == 0 else f'{days}D'}")
    return item


def _safe(fn, *a):
    try:
        return fn(*a)
    except Exception as e:  # noqa: BLE001 - calendars are nice-to-have
        print(f"[calendar] {fn.__name__}{a}: {e!r}")
        return None


def _yoy_item(rows, iid, label):
    """Inflation-style index -> y/y and m/m."""
    d, v = rows[-1]
    by_date = dict(rows)

    def yoy_at(idx):
        dd, vv = rows[idx]
        base = by_date.get(dd.replace(year=dd.year - 1))
        return (vv / base - 1) * 100 if base else None

    yoy, prev_yoy = yoy_at(-1), yoy_at(-2)
    mom = (v / rows[-2][1] - 1) * 100
    trend = None
    if prev_yoy is not None:
        diff = round(yoy, 1) - round(prev_yoy, 1)
        trend = "ACCELERATING" if diff > 0 else "COOLING" if diff < 0 else "UNCHANGED"
    phrases = [f"{_mon(d)} {mom:+.1f}% M/M"]
    if prev_yoy is not None:
        phrases.append(f"PRIOR {prev_yoy:.1f}% → {trend}")
    return {
        "id": iid, "label": label, "value": f"{yoy:.1f}% y/y", "change": _mon(d),
        "dir": _dir((yoy - prev_yoy) if prev_yoy is not None else 0, 0.05),
        "phrases": phrases, "asOf": d.isoformat(), "source": "FRED",
    }


def unrate(s):
    rows = s["UNRATE"]
    d, v = rows[-1]
    p = rows[-2][1]
    low12 = min(x for _, x in rows[-12:])
    return {
        "id": "UNRATE", "label": "UNEMPLOYMENT", "value": f"{v:.1f}%", "change": _mon(d),
        "dir": _dir(v - p, 0.05),
        "phrases": [f"PRIOR {p:.1f}%", f"12M LOW {low12:.1f}%"], "asOf": d.isoformat(), "source": "FRED",
    }


def payrolls(s):
    rows = s["PAYEMS"]
    d = rows[-1][0]
    chg = rows[-1][1] - rows[-2][1]
    avg3 = (rows[-1][1] - rows[-4][1]) / 3
    return {
        "id": "NFP", "label": "PAYROLLS", "value": f"{chg:+,.0f}K", "change": _mon(d), "dir": _dir(chg),
        "phrases": [f"3M AVG {avg3:+,.0f}K", f"PRIOR {rows[-2][1] - rows[-3][1]:+,.0f}K"],
        "asOf": d.isoformat(), "source": "FRED",
    }


def claims(s):
    rows = s["ICSA"]
    d, v = rows[-1]
    avg4 = sum(x for _, x in rows[-4:]) / 4
    return {
        "id": "CLAIMS", "label": "JOBLESS CLAIMS", "value": f"{v / 1000:,.0f}K", "change": f"WK {_day(d)}",
        "dir": _dir(v - rows[-2][1]),
        "phrases": [f"4WK AVG {avg4 / 1000:,.0f}K", f"PRIOR {rows[-2][1] / 1000:,.0f}K"],
        "asOf": d.isoformat(), "source": "FRED",
    }


def gdp(s):
    rows = s["A191RL1Q225SBEA"]
    d, v = rows[-1]
    q = f"Q{(d.month - 1) // 3 + 1} {d.year}"
    return {
        "id": "GDP", "label": "REAL GDP", "value": f"{v:+.1f}% SAAR", "change": q, "dir": _dir(v),
        "phrases": [f"PRIOR {rows[-2][1]:+.1f}%"], "asOf": d.isoformat(), "source": "FRED",
    }


def two_year(s):
    rows = s["DGS2"]
    d, v = rows[-1]
    phrases = [f"{(v - rows[-2][1]) * 100:+.0f}BP · {_day(d)}"]
    if s.get("T10Y2Y"):
        sp = s["T10Y2Y"][-1][1]
        phrases.append(f"2S10S {sp * 100:+.0f}BP {'INVERTED' if sp < 0 else 'POSITIVE'}")
    return {
        "id": "US2Y", "label": "US 2Y", "value": f"{v:.2f}%", "change": f"{(v - rows[-2][1]) * 100:+.0f}bp",
        "dir": _dir(v - rows[-2][1]), "phrases": phrases, "asOf": d.isoformat(), "source": "FRED",
    }


def _cpi(rows, iid, label):
    return _next_release(_yoy_item(rows, iid, label), _safe(calendar.next_bls, "cpi"), "CPI")


def _pce(rows, iid, label):
    return _next_release(_yoy_item(rows, iid, label), _safe(calendar.next_bea, "Personal Income and Outlays"), "PCE")


MACRO_BUILDERS = [
    fed_funds,
    lambda s: _cpi(s["CPIAUCSL"], "CPI", "CPI"),
    lambda s: _cpi(s["CPILFESL"], "CORECPI", "CORE CPI"),
    lambda s: _pce(s["PCEPI"], "PCE", "PCE"),
    lambda s: _pce(s["PCEPILFE"], "COREPCE", "CORE PCE"),
    lambda s: _next_release(unrate(s), _safe(calendar.next_bls, "empsit"), "JOBS"),
    lambda s: _next_release(payrolls(s), _safe(calendar.next_bls, "empsit"), "JOBS"),
    claims,
    lambda s: _next_release(gdp(s), _safe(calendar.next_bea, "GDP"), "GDP"),
    two_year,
]


def macro_items():
    s = fred.many(config.FRED_SERIES.items())
    out = []
    for build in MACRO_BUILDERS:
        try:
            out.append(build(s))
        except (KeyError, IndexError, ZeroDivisionError) as e:
            print(f"[macro] builder failed: {e!r}")
    return out


# ---- Earnings -------------------------------------------------------------
def earnings_items():
    today = dt.date.today()
    rows = []
    for i in range(config.EARNINGS_DAYS_AHEAD):
        day = today + dt.timedelta(days=i)
        if day.weekday() < 5:
            rows += _safe(calendar.earnings_on, day) or []
    big = [r for r in rows if (r["market_cap"] or 0) >= config.EARNINGS_MIN_MARKET_CAP]
    # Biggest names first, then show them in date order.
    seen, uniq = set(), []
    for r in sorted(big, key=lambda r: -r["market_cap"]):
        if r["name"] not in seen:  # share classes (BRK.A / BRK.B) report once
            seen.add(r["name"])
            uniq.append(r)
    big = uniq[:config.EARNINGS_MAX_ITEMS]
    big.sort(key=lambda r: (r["date"], -r["market_cap"]))
    out = []
    for r in big:
        days = (r["date"] - today).days
        when = "TODAY" if days == 0 else "TMRW" if days == 1 else r["date"].strftime("%a").upper()
        phrases = [r["name"].upper()[:34], f"MKT CAP ${r['market_cap'] / 1e9:,.0f}B"]
        if r["eps_last_year"] not in (None, "N/A"):
            phrases.append(f"YR-AGO EPS {r['eps_last_year']}")
        if r["quarter"]:
            phrases.append(f"FQ {r['quarter'].upper()}")
        out.append({
            "id": f"ERN:{r['symbol']}", "kind": "earnings", "label": r["symbol"],
            "value": f"{when} {_day(r['date'])} {r['session']}",
            "change": f"EST {r['eps_est']}" if r["eps_est"] not in (None, "N/A") else "", "dir": "flat",
            "phrases": phrases, "asOf": r["date"].isoformat(), "source": "Nasdaq",
        })
    return out


def payload():
    macro = macro_items()
    market = market_items()
    earnings = earnings_items()
    # Interleave so macro prints sit between market quotes, Fed funds first, earnings at the end.
    order = macro[:1] + market[:5] + macro[1:6] + market[5:] + macro[6:] + earnings
    return {
        "items": order,
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
