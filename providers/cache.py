"""Tiny TTL cache. If a refresh fails, the last good value is served (marked stale)."""
import functools
import threading
import time


def ttl_cache(seconds):
    def deco(fn):
        store = {}
        lock = threading.Lock()

        @functools.wraps(fn)
        def wrapper(*args):
            key = args
            now = time.time()
            hit = store.get(key)
            if hit and now - hit[0] < seconds:
                return hit[1]
            with lock:
                hit = store.get(key)
                if hit and time.time() - hit[0] < seconds:
                    return hit[1]
                try:
                    value = fn(*args)
                except Exception:
                    if hit:  # serve stale rather than nothing; retry in 15s
                        store[key] = (time.time() - seconds + 15, hit[1])
                        return hit[1]
                    raise
                store[key] = (time.time(), value)
                return value

        return wrapper

    return deco
