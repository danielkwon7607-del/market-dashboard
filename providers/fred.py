"""FRED macro series via the keyless fredgraph.csv download."""
import datetime as dt
from concurrent.futures import ThreadPoolExecutor

from . import http
from .cache import ttl_cache

CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"


@ttl_cache(6 * 3600)
def series(series_id, start="2018-01-01"):
    """[(date, value), ...] ascending; missing values ('.') are dropped."""
    text = http.get_text(CSV_URL, params={"id": series_id, "cosd": start}, timeout=30)
    rows = []
    for line in text.strip().splitlines()[1:]:
        d, _, v = line.partition(",")
        try:
            rows.append((dt.date.fromisoformat(d), float(v)))
        except ValueError:
            continue
    return rows


def many(ids_with_start):
    """{id: rows} for [(id, start), ...]; failed series are left out."""
    out = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {sid: pool.submit(series, sid, start) for sid, start in ids_with_start}
        for sid, f in futs.items():
            try:
                out[sid] = f.result()
            except Exception as e:  # noqa: BLE001
                print(f"[fred] {sid}: {e}")
    return out
