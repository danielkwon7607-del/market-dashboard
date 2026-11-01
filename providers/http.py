"""Shared HTTP client. Every outbound request goes through get()."""
import threading

from curl_cffi import requests as _requests

_local = threading.local()


def _session():
    # One session per thread: curl_cffi sessions are not thread-safe.
    s = getattr(_local, "session", None)
    if s is None:
        s = _requests.Session(impersonate="chrome")
        _local.session = s
    return s


def get(url, params=None, timeout=20):
    r = _session().get(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r


def get_json(url, params=None, timeout=20):
    return get(url, params, timeout).json()


def get_text(url, params=None, timeout=20):
    return get(url, params, timeout).text
