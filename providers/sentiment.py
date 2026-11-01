"""Fear & greed gauges: CNN's (stocks) and alternative.me's (crypto). Both free, no key."""
from . import http
from .cache import ttl_cache

CNN_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
CRYPTO_URL = "https://api.alternative.me/fng/"

# CNN component keys -> short labels
CNN_COMPONENTS = {
    "market_momentum_sp500": "Momentum (S&P vs 125d)",
    "stock_price_strength": "52-wk highs vs lows",
    "stock_price_breadth": "Breadth (McClellan)",
    "put_call_options": "Put/call ratio",
    "market_volatility_vix": "VIX vs 50d",
    "junk_bond_demand": "Junk bond demand",
    "safe_haven_demand": "Safe-haven demand",
}


@ttl_cache(300)
def cnn():
    d = http.get_json(CNN_URL)
    fg = d["fear_and_greed"]
    return {
        "score": fg["score"], "rating": fg["rating"], "timestamp": fg["timestamp"],
        "previous": {
            "close": fg.get("previous_close"), "1w": fg.get("previous_1_week"),
            "1m": fg.get("previous_1_month"), "1y": fg.get("previous_1_year"),
        },
        "components": [
            {"label": label, "rating": (d.get(key) or {}).get("rating"), "score": (d.get(key) or {}).get("score")}
            for key, label in CNN_COMPONENTS.items() if d.get(key)
        ],
        "history": [[p["x"], round(p["y"], 1)] for p in (d.get("fear_and_greed_historical") or {}).get("data", [])][-260:],
    }


@ttl_cache(1800)
def crypto():
    d = http.get_json(CRYPTO_URL, params={"limit": "2"})["data"]
    return {"score": float(d[0]["value"]), "rating": d[0]["value_classification"].lower(),
            "previous": float(d[1]["value"]) if len(d) > 1 else None}
