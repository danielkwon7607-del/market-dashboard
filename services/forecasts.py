"""/api/forecasts: predictions for the next macro prints, and your own guesses scored against them.

For every indicator there are three numbers:
  model   a deliberately simple, transparent projection (trend carried forward). Snapshotted the first
          time a period is shown, so it can't quietly change after the fact.
  mine    your hypothesis, typed in on the Macro tab (POST /api/forecasts). Editable until release day.
  actual  filled in from FRED once the print is out. Whoever is closer wins that round.
Fed decision: "model" is market-implied from 30-day fed funds futures (ZQ on Yahoo).

Predictions live in data/predictions.json (git-ignored), so each person keeps their own record.
"""
import calendar as cal
import datetime as dt
import json
import os
import threading

import config
from providers import calendar, fred, yahoo

STORE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "predictions.json")
_lock = threading.Lock()


# ---- storage --------------------------------------------------------------
def _load():
    try:
        with open(STORE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save(data):
    os.makedirs(os.path.dirname(STORE), exist_ok=True)
    tmp = STORE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=1, sort_keys=True)
    os.replace(tmp, STORE)


# ---- transforms (series rows -> value for a period) -------------------------
def _add_months(d, n):
    m = d.month - 1 + n
    return dt.date(d.year + m // 12, m % 12 + 1, 1)


def _month_value(rows, d):
    """Value for month d; if that month was never published (e.g. Oct 2025, the shutdown),
    use the average of the months either side."""
    by = dict(rows)
    if d in by:
        return by[d]
    a, b = by.get(_add_months(d, -1)), by.get(_add_months(d, 1))
    return (a + b) / 2 if a and b else None


def _yoy_at(rows, period):
    a, b = dict(rows).get(period), _month_value(rows, _add_months(period, -12))
    return (a / b - 1) * 100 if a and b else None


def _level_at(rows, period, scale=1.0):
    v = dict(rows).get(period)
    return v * scale if v is not None else None


def _diff_at(rows, period):
    by = dict(rows)
    a, b = by.get(period), by.get(_add_months(period, -1))
    return a - b if a is not None and b is not None else None


# ---- models (deliberately simple; the point is to compare against) ----------
def _model_yoy(rows, nxt):
    moms = [rows[i][1] / rows[i - 1][1] - 1 for i in range(len(rows) - 3, len(rows))]
    pace = sum(moms) / 3
    base = _month_value(rows, _add_months(nxt, -12))
    return ((rows[-1][1] * (1 + pace)) / base - 1) * 100 if base else None


def _model_avg(values):
    return sum(values) / len(values)


INDICATORS = [
    # id, label, series, kind, unit, decimals, release lookup, model description
    # units: "%"  |  "K" signed change in thousands  |  "k" level in thousands  |  "bp" (Fed)
    ("CPI", "CPI y/y", "CPIAUCSL", "yoy", "%", 1, ("bls", "cpi"), "last 3 months' m/m pace carried forward"),
    ("CORECPI", "Core CPI y/y", "CPILFESL", "yoy", "%", 1, ("bls", "cpi"), "last 3 months' m/m pace carried forward"),
    ("PCE", "PCE y/y", "PCEPI", "yoy", "%", 1, ("bea", "Personal Income and Outlays"), "last 3 months' m/m pace carried forward"),
    ("COREPCE", "Core PCE y/y", "PCEPILFE", "yoy", "%", 1, ("bea", "Personal Income and Outlays"), "last 3 months' m/m pace carried forward"),
    ("UNRATE", "Unemployment", "UNRATE", "level", "%", 1, ("bls", "empsit"), "3-month average"),
    ("NFP", "Payrolls (change)", "PAYEMS", "diff", "K", 0, ("bls", "empsit"), "3-month average gain"),
    ("GDP", "Real GDP (SAAR)", "A191RL1Q225SBEA", "quarter", "%", 1, ("bea", "GDP (Advance Estimate)"), "4-quarter average"),
    ("CLAIMS", "Jobless claims", "ICSA", "weekly", "k", 0, ("thursday", None), "4-week average"),
]


def _period_label(kind, d):
    if kind == "quarter":
        return f"Q{(d.month - 1) // 3 + 1} {d.year}"
    if kind == "weekly":
        return f"wk {d.strftime('%b %-d')}"
    return d.strftime("%b %Y")


def _release(kind_src):
    src, arg = kind_src
    today = dt.date.today()
    try:
        if src == "bls":
            return calendar.next_bls(arg)
        if src == "bea":
            return calendar.next_bea(arg)
    except Exception as e:  # noqa: BLE001
        print(f"[forecasts] release {kind_src}: {e!r}")
        return None
    return today + dt.timedelta(days=(3 - today.weekday()) % 7)  # next Thursday (claims)


def _indicator(spec, s):
    iid, label, sid, kind, unit, dec, rel, method = spec
    rows = s.get(sid)
    if not rows or len(rows) < 14:
        return None
    last_d = rows[-1][0]
    if kind == "yoy":
        nxt, actual_at = _add_months(last_d, 1), lambda p: _yoy_at(rows, p)
        last_v, model = _yoy_at(rows, last_d), _model_yoy(rows, _add_months(last_d, 1))
    elif kind == "level":
        nxt, actual_at = _add_months(last_d, 1), lambda p: _level_at(rows, p)
        last_v, model = rows[-1][1], _model_avg([v for _, v in rows[-3:]])
    elif kind == "diff":
        nxt, actual_at = _add_months(last_d, 1), lambda p: _diff_at(rows, p)
        last_v = _diff_at(rows, last_d)
        model = _model_avg([_diff_at(rows, rows[i][0]) for i in range(len(rows) - 3, len(rows))])
    elif kind == "quarter":
        nxt, actual_at = _add_months(last_d, 3), lambda p: _level_at(rows, p)
        last_v, model = rows[-1][1], _model_avg([v for _, v in rows[-4:]])
    else:  # weekly, in thousands
        nxt, actual_at = last_d + dt.timedelta(days=7), lambda p: _level_at(rows, p, 1 / 1000)
        last_v, model = rows[-1][1] / 1000, _model_avg([v / 1000 for _, v in rows[-4:]])
    return {
        "id": iid, "label": label, "unit": unit, "decimals": dec, "method": method, "kind": kind,
        "period": nxt.isoformat(), "period_label": _period_label(kind, nxt),
        "last": {"period_label": _period_label(kind, last_d), "value": last_v},
        "model": model, "release": None, "actual_at": actual_at,
        "_rel": rel,
    }


# ---- Fed: market-implied from fed funds futures ---------------------------
_MONTH_CODES = "FGHJKMNQUVXZ"


def _zq(d):
    return f"ZQ{_MONTH_CODES[d.month - 1]}{d.year % 100:02d}.CBT"


def fed_implied(s):
    today = dt.date.today()
    meeting = next((dt.date.fromisoformat(x) for x in config.FOMC_DECISION_DATES
                    if dt.date.fromisoformat(x) >= today), None)
    if not meeting or not s.get("DFF"):
        return None
    pre = s["DFF"][-1][1]
    days = cal.monthrange(meeting.year, meeting.month)[1]
    before, after = meeting.day, days - meeting.day  # new rate applies from the day after the decision
    try:
        if after >= 7:
            avg = 100 - yahoo.daily_history(_zq(meeting), "1mo")["price"]
            post = (avg * days - pre * before) / after
            contract = _zq(meeting)
        else:  # late-month meeting: the next month's contract is (almost) all post-meeting
            nxt = _add_months(meeting.replace(day=1), 1)
            post = 100 - yahoo.daily_history(_zq(nxt), "1mo")["price"]
            contract = _zq(nxt)
    except Exception as e:  # noqa: BLE001
        print(f"[forecasts] fed futures: {e!r}")
        return None
    bp = (post - pre) * 100
    lo, hi = s["DFEDTARL"][-1][1], s["DFEDTARU"][-1][1]
    return {"meeting": meeting.isoformat(), "effr": pre, "target": [lo, hi], "implied_rate": post,
            "implied_bp": bp, "contract": contract,
            "prob": min(1.0, abs(bp) / 25), "direction": "hike" if bp > 0 else "cut" if bp < 0 else "hold"}


def _fed_actual(s, meeting):
    """bp change of the upper target from the day before the meeting to a few days after."""
    rows = s.get("DFEDTARU") or []
    before = [v for d, v in rows if d < meeting]
    after = [v for d, v in rows if d >= meeting + dt.timedelta(days=1)]
    if not before or not after:
        return None
    return round((after[0] - before[-1]) * 100)


# ---- payload ---------------------------------------------------------------
def payload(q=None):
    s = fred.many(config.FRED_SERIES.items())
    today = dt.date.today()
    with _lock:
        store = _load()
        changed = False
        upcoming = []
        for spec in INDICATORS:
            it = _indicator(spec, s)
            if not it:
                continue
            key = f"{it['id']}|{it['period']}"
            rec = store.setdefault(key, {})
            if "model" not in rec and it["model"] is not None:
                rec.update(model=round(it["model"], 3), created=dt.datetime.now(dt.timezone.utc).isoformat(),
                           label=it["label"], unit=it["unit"], decimals=it["decimals"], period_label=it["period_label"])
                changed = True
            rel = _release(it.pop("_rel"))
            it.pop("actual_at")
            it["release"] = rel.isoformat() if rel else None
            it["days"] = (rel - today).days if rel else None
            it["model"] = rec.get("model", it["model"])
            it["mine"] = rec.get("mine")
            it["locked"] = bool(rel and rel <= today)
            it["key"] = key
            upcoming.append(it)

        fed = fed_implied(s)
        if fed:
            key = f"FED|{fed['meeting']}"
            rec = store.setdefault(key, {"label": "FOMC decision", "unit": "bp", "decimals": 0,
                                         "period_label": f"FOMC {dt.date.fromisoformat(fed['meeting']).strftime('%b %-d %Y')}"})
            # Market view keeps updating until the meeting; the last pre-meeting value is what gets scored.
            if dt.date.fromisoformat(fed["meeting"]) > today:
                rec["model"] = round(fed["implied_bp"], 1)
                changed = True
            fed.update(key=key, mine=rec.get("mine"), locked=dt.date.fromisoformat(fed["meeting"]) <= today)

        # Resolve anything whose actual is now out.
        specs = {sp[0]: sp for sp in INDICATORS}
        history = []
        for key, rec in store.items():
            iid, period = key.split("|")
            if "actual" not in rec:
                if iid == "FED":
                    actual = _fed_actual(s, dt.date.fromisoformat(period)) if dt.date.fromisoformat(period) < today else None
                elif iid in specs:
                    tmp = _indicator(specs[iid], s)
                    actual = tmp["actual_at"](dt.date.fromisoformat(period)) if tmp else None
                else:
                    actual = None
                if actual is None:
                    continue
                rec["actual"] = round(actual, 3)
                changed = True
            m, y, a = rec.get("model"), rec.get("mine"), rec["actual"]
            me = abs(m - a) if m is not None else None
            ye = abs(y - a) if y is not None else None
            winner = None
            if me is not None and ye is not None:
                winner = "tie" if abs(me - ye) < 1e-9 else "you" if ye < me else "model"
            history.append({"key": key, "id": iid, "label": rec.get("label", iid), "period_label": rec.get("period_label", period),
                            "unit": rec.get("unit", ""), "decimals": rec.get("decimals", 1), "period": period,
                            "actual": a, "model": m, "mine": y, "model_err": me, "mine_err": ye, "winner": winner})
        if changed:
            _save(store)

    history.sort(key=lambda h: h["period"], reverse=True)
    score = {k: sum(1 for h in history if h["winner"] == k) for k in ("you", "model", "tie")}
    return {"upcoming": upcoming, "fed": fed, "history": history[:40], "score": score,
            "generated": dt.datetime.now(dt.timezone.utc).isoformat()}


def save_guess(body):
    """POST {key, mine}: set (or clear with null) your prediction for an open period."""
    key, mine = body.get("key"), body.get("mine")
    if not key or "|" not in key:
        raise ValueError("key required")
    if mine is not None:
        mine = float(mine)
    with _lock:
        store = _load()
        rec = store.get(key)
        if rec is None:
            raise ValueError("unknown period — reload the page")
        if "actual" in rec:
            raise ValueError("already released — this one is locked")
        if mine is None:
            rec.pop("mine", None)
            rec.pop("mine_at", None)
        else:
            rec["mine"] = mine
            rec["mine_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        _save(store)
    return {"ok": True, "key": key, "mine": mine}
