"""/api/news: merged, de-duplicated headlines, newest first."""
import datetime as dt
import re

import config
from providers import news as feeds

_NORM = re.compile(r"[^a-z0-9 ]+")


def _norm(title):
    return " ".join(_NORM.sub(" ", title.lower()).split())[:90]


def _matches(text, words):
    t = f" {text.lower()} "
    return [w for w in words if w in t]


def payload():
    raw = feeds.fetch_all(config.NEWS_FEEDS)
    now = dt.datetime.now(dt.timezone.utc)
    seen, items = set(), []
    for it in sorted(raw, key=lambda x: x["published"] or now.replace(year=2000), reverse=True):
        pub = it["published"]
        if pub is None or pub < now - dt.timedelta(days=config.NEWS_MAX_AGE_DAYS.get(it["category"], 4)):
            continue
        key = _norm(it["title"])
        if key in seen:
            continue
        seen.add(key)
        tag = it["category"]
        if tag == "markets" and _matches(it["title"], config.MACRO_KEYWORDS):
            tag = "macro"
        hay = f"{it['title']} {it['summary']}"
        items.append({
            "id": key,
            "title": it["title"],
            "link": it["link"],
            "source": it["source"],
            "tag": tag,  # fed | macro | markets
            "published": pub.astimezone(dt.timezone.utc).isoformat(),
            "summary": it["summary"],
            "ticker": [tid for tid, words in config.TICKER_KEYWORDS.items() if _matches(it["title"], words)],
        })
        if len(items) >= config.NEWS_MAX_ITEMS:
            break
    return {"items": items, "generated": dt.datetime.now(dt.timezone.utc).isoformat()}
