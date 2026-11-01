"""Release and earnings calendars: BLS + BEA schedule pages, Nasdaq earnings calendar."""
import datetime as dt
import html
import re

from . import http
from .cache import ttl_cache

_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def _date(month, day, year=None):
    m = _MONTHS[month[:3].lower()]
    if year is None:  # schedule pages omit the year: roll past dates into next year
        today = dt.date.today()
        year = today.year + (1 if m < today.month - 1 else 0)
    return dt.date(int(year), m, int(day))


@ttl_cache(24 * 3600)
def bls_dates(slug):
    """Upcoming release dates from bls.gov/schedule/news_release/<slug>.htm (cpi, empsit, ppi...)."""
    text = http.get_text(f"https://www.bls.gov/schedule/news_release/{slug}.htm")
    found = re.findall(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2}), (20\d\d)", text)
    return sorted({_date(m, d, y) for m, d, y in found})


@ttl_cache(24 * 3600)
def bea_releases():
    """[(date, time, title)] from bea.gov/news/schedule."""
    text = http.get_text("https://www.bea.gov/news/schedule")
    rows = re.findall(
        r'class="release-date">([A-Za-z]+) (\d{1,2})</div>\s*<small[^>]*>([^<]*)</small>.*?release-title[^>]*>([^<]+)<',
        text, re.S)
    return [(_date(m, d), t.strip(), html.unescape(title).strip()) for m, d, t, title in rows]


def next_bls(slug, today=None):
    today = today or dt.date.today()
    return next((d for d in bls_dates(slug) if d >= today), None)


def next_bea(keyword, today=None):
    today = today or dt.date.today()
    return next((d for d, _, title in bea_releases() if d >= today and keyword.lower() in title.lower()), None)


_SESSION = {"time-pre-market": "BMO", "time-after-hours": "AMC"}


def _money(s):
    try:
        return float(re.sub(r"[^0-9.\-]", "", s or ""))
    except ValueError:
        return None


@ttl_cache(3600)
def earnings_on(day):
    """Nasdaq earnings calendar rows for one date (datetime.date)."""
    data = http.get_json("https://api.nasdaq.com/api/calendar/earnings", params={"date": day.isoformat()})
    rows = (data.get("data") or {}).get("rows") or []
    return [{
        "date": day,
        "symbol": r.get("symbol", "").strip(),
        "name": r.get("name", "").strip(),
        "session": _SESSION.get(r.get("time"), "TBD"),
        "eps_est": r.get("epsForecast") or None,
        "eps_last_year": r.get("lastYearEPS") or None,
        "quarter": r.get("fiscalQuarterEnding") or "",
        "market_cap": _money(r.get("marketCap")),
    } for r in rows]
