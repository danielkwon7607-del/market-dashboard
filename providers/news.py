"""RSS/Atom news aggregation."""
import datetime as dt
import email.utils
import html
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

from . import http
from .cache import ttl_cache

_TAG = re.compile(r"<[^>]+>")


def _clean(s):
    return html.unescape(_TAG.sub("", s or "")).strip()


def _parse_date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def parse_feed(text):
    """Return [{title, link, published, summary}] from RSS 2.0, RDF or Atom."""
    root = ET.fromstring(text.encode("utf-8") if isinstance(text, str) else text)
    items = []
    for el in root.iter():
        name = _local(el.tag)
        if name not in ("item", "entry"):
            continue
        f = {}
        for child in el:
            cname = _local(child.tag)
            if cname == "link":
                f.setdefault("link", child.get("href") or (child.text or "").strip())
            elif cname in ("pubDate", "published", "updated", "date"):
                f.setdefault("date", child.text)
            elif cname in ("title", "description", "summary"):
                f.setdefault(cname, child.text)
        title = _clean(f.get("title"))
        if not title:
            continue
        items.append({
            "title": title,
            "link": f.get("link", ""),
            "published": _parse_date(f.get("date")),
            "summary": _clean(f.get("description") or f.get("summary"))[:280],
        })
    return items


@ttl_cache(90)
def fetch_feed(url):
    return parse_feed(http.get_text(url, timeout=15))


def fetch_all(feeds):
    """feeds: [{name, url, category}] -> flat list of items tagged with source + category."""
    out = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = [(feed, pool.submit(fetch_feed, feed["url"])) for feed in feeds]
        for feed, fut in futs:
            try:
                for it in fut.result()[:feed.get("max_items", 60)]:
                    source, title = feed["name"], it["title"]
                    if feed.get("split_source") and " - " in title:
                        title, source = title.rsplit(" - ", 1)
                    out.append(dict(it, title=title, source=source, category=feed["category"],
                                    require_ticker=feed.get("require_ticker", False)))
            except Exception as e:  # noqa: BLE001
                print(f"[news] {feed['name']}: {e}")
    return out
