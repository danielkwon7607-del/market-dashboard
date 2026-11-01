"""/api/sentiment: CNN Fear & Greed (+ crypto fear & greed)."""
import datetime as dt

from providers import sentiment


def payload(q=None):
    out = {"generated": dt.datetime.now(dt.timezone.utc).isoformat()}
    for key, fn in (("stocks", sentiment.cnn), ("crypto", sentiment.crypto)):
        try:
            out[key] = fn()
        except Exception as e:  # noqa: BLE001
            print(f"[sentiment] {key}: {e!r}")
            out[key] = None
    return out
