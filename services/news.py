"""/api/news: merged, de-duplicated headlines, newest first.

Every item gets:
  tag       fed | macro | company | markets   (category; drives the filter chips and rail color)
  impact    0..1 market-impact score from config.IMPACT_WEIGHTS  (drives the red→yellow→green tint)
  level     HIGH | MEDIUM | LOW
  breaking  HIGH impact and under 90 minutes old
  sentiment -1..1 from config.SENTIMENT_* (company items: green/red)
  tickers   [{symbol, cap}] companies mentioned
  deal      looks like M&A
"""
import datetime as dt
import re

import config
from providers import news as feeds
from services import tickers as tickerfind

_NORM = re.compile(r"[^a-z0-9 ]+")
_POLICY = re.compile(r"fomc|monetary|statement|minutes|federal funds|discount rate|powell|beige book", re.I)


def _norm(title):
    return " ".join(_NORM.sub(" ", title.lower()).split())[:90]


def _matches(text, words):
    t = f" {text.lower()} "
    return [w for w in words if w in t]


def _has_word(text, words):
    """Whole-word match (so 'war' doesn't hit 'award')."""
    t = text.lower()
    return [w for w in words if re.search(r"(?<![a-z])" + re.escape(w) + r"(?![a-z])", t)]


def _impact(title, tag, source, caps):
    score = 0.0
    for weight, words in config.IMPACT_WEIGHTS.items():
        score += weight * min(2, len(_has_word(title, words)))
    if tag == "fed" and _POLICY.search(title):
        score += 3
    elif source == "Fed Speeches":
        score += 2
    elif tag in ("fed", "macro"):
        score += 1
    if any(c >= config.IMPACT_MEGACAP for c in caps):
        score += 1.5
    return min(1.0, score / 5.0)


def _sentiment(title):
    pos = len(_has_word(title, config.SENTIMENT_POSITIVE))
    neg = len(_has_word(title, config.SENTIMENT_NEGATIVE))
    if pos == neg:
        return 0.0
    return (pos - neg) / (pos + neg)


def classify(it, now):
    title = it["title"]
    found = tickerfind.find(title)
    caps = [c for _, c in found]
    tag = it["category"]
    if tag == "markets" and _matches(title, config.MACRO_KEYWORDS):
        tag = "macro"
    elif tag == "markets" and found:
        tag = "company"
    impact = _impact(title, tag, it["source"], caps)
    level = "HIGH" if impact >= 0.6 else "MEDIUM" if impact >= 0.3 else "LOW"
    age_min = (now - it["published"]).total_seconds() / 60
    hay = f"{title} {it['summary']}"
    return {
        "id": _norm(title),
        "title": title,
        "link": it["link"],
        "source": it["source"],
        "tag": tag,
        "impact": round(impact, 2),
        "level": level,
        "breaking": level == "HIGH" and age_min < 90,
        "sentiment": round(_sentiment(title), 2),
        "tickers": [{"symbol": s, "cap": c} for s, c in found],
        "deal": bool(_matches(hay, config.DEAL_KEYWORDS)) and bool(found),
        "published": it["published"].astimezone(dt.timezone.utc).isoformat(),
        "summary": it["summary"],
        "ticker": [tid for tid, words in config.TICKER_KEYWORDS.items() if _matches(title, words)],
    }


def payload(q=None):
    raw = feeds.fetch_all(config.NEWS_FEEDS + config.COMPANY_FEEDS)
    now = dt.datetime.now(dt.timezone.utc)
    seen, items = set(), []
    for it in sorted(raw, key=lambda x: x["published"] or now.replace(year=2000), reverse=True):
        pub = it["published"]
        if pub is None or pub > now + dt.timedelta(minutes=10):
            continue
        if pub < now - dt.timedelta(days=config.NEWS_MAX_AGE_DAYS.get(it["category"], 4)):
            continue
        key = _norm(it["title"])
        if key in seen:
            continue
        seen.add(key)
        item = classify(it, now)
        if it.get("require_ticker") and not item["tickers"]:
            continue
        items.append(item)
        if len(items) >= config.NEWS_MAX_ITEMS:
            break
    return {"items": items, "generated": now.isoformat()}
