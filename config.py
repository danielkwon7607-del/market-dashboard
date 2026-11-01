"""Everything you'd want to tweak lives here: symbols, series, feeds, keywords."""

PORT = 8050

# ---- Sector tracker -------------------------------------------------------
SECTORS = [
    # (symbol, name, group) - group feeds the offense/defense read
    ("XLK", "Technology", "cyclical"),
    ("XLF", "Financials", "cyclical"),
    ("XLV", "Health Care", "defensive"),
    ("XLE", "Energy", "cyclical"),
    ("XLI", "Industrials", "cyclical"),
    ("XLY", "Cons. Discretionary", "cyclical"),
    ("XLP", "Cons. Staples", "defensive"),
    ("XLU", "Utilities", "defensive"),
    ("XLB", "Materials", "cyclical"),
    ("XLRE", "Real Estate", "defensive"),
    ("XLC", "Communication Svcs", "cyclical"),
]
BENCHMARKS = [
    ("SPY", "S&P 500"),
    ("QQQ", "Nasdaq 100"),
    ("IWM", "Russell 2000"),
]
# timeframe key -> calendar lookback (days), or "ytd"
TIMEFRAMES = [("1D", None), ("1W", 7), ("1M", 30), ("3M", 91), ("YTD", "ytd")]
# |return| below this (in %) counts as FLAT for that timeframe
FLAT_BAND = {"1D": 0.15, "1W": 0.4, "1M": 0.75, "3M": 1.25, "YTD": 2.0}

# ---- Ticker bar: live market quotes (Yahoo) -------------------------------
# (id, symbol, label, decimals, kind) kind: "price" | "yield" | "index"
MARKET_QUOTES = [
    ("ES", "ES=F", "ES", 2, "price"),
    ("NQ", "NQ=F", "NQ", 2, "price"),
    ("RTY", "RTY=F", "RTY", 1, "price"),
    ("VIX", "^VIX", "VIX", 2, "index"),
    ("US10Y", "^TNX", "US 10Y", 3, "yield"),
    ("US30Y", "^TYX", "US 30Y", 3, "yield"),
    ("DXY", "DX-Y.NYB", "DXY", 2, "index"),
    ("WTI", "CL=F", "WTI CRUDE", 2, "price"),
    ("GOLD", "GC=F", "GOLD", 1, "price"),
    ("BTC", "BTC-USD", "BTC", 0, "price"),
    ("EURUSD", "EURUSD=X", "EUR/USD", 4, "price"),
]

# ---- Ticker bar: macro series (FRED, keyless CSV) -------------------------
# Each entry is built into ticker phrasing by services/macro.py (see MACRO_BUILDERS there).
FRED_SERIES = {
    "DFEDTARL": "2008-12-16", "DFEDTARU": "2008-12-16", "DFF": "2025-01-01",
    "CPIAUCSL": "2023-01-01", "CPILFESL": "2023-01-01", "PCEPI": "2023-01-01", "PCEPILFE": "2023-01-01",
    "UNRATE": "2023-01-01", "PAYEMS": "2024-01-01", "ICSA": "2025-06-01",
    "DGS2": "2025-06-01", "T10Y2Y": "2025-06-01", "A191RL1Q225SBEA": "2023-01-01",
}

# 2026 FOMC meeting end dates (decision days). Source: federalreserve.gov/monetarypolicy/fomccalendars.htm
# Add next year's dates when the Fed publishes them.
FOMC_DECISION_DATES = [
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
    "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
]

# ---- Ticker bar: upcoming earnings (Nasdaq calendar, free) ---------------
EARNINGS_DAYS_AHEAD = 7          # calendar days to look ahead (today included)
EARNINGS_MIN_MARKET_CAP = 50e9   # only names big enough to move ES/NQ
EARNINGS_MAX_ITEMS = 12

# Headlines matching these keywords flash the matching ticker item.
TICKER_KEYWORDS = {
    "FEDFUNDS": ["fomc", "federal reserve", "fed ", "powell", "rate cut", "rate hike", "interest rate"],
    "CPI": ["cpi", "consumer price", "inflation"],
    "CORECPI": ["core cpi", "core inflation"],
    "PCE": ["pce", "personal consumption", "personal income"],
    "COREPCE": ["core pce"],
    "UNRATE": ["unemployment", "jobless rate", "jobs report", "labor market"],
    "NFP": ["payroll", "nonfarm", "jobs report"],
    "CLAIMS": ["jobless claims", "initial claims"],
    "GDP": ["gdp", "gross domestic"],
    "US10Y": ["treasury", "10-year", "bond yield", "yields"],
    "US2Y": ["2-year", "two-year"],
    "DXY": ["dollar"],
    "VIX": ["vix", "volatility"],
    "WTI": ["oil", "crude", "opec"],
    "GOLD": ["gold"],
    "BTC": ["bitcoin", "crypto"],
    "NQ": ["nasdaq", "tech stocks"],
    "ES": ["s&p 500", "stocks", "wall street"],
}

# ---- News sidebar ---------------------------------------------------------
# category: "fed" (Fed itself), "macro" (official data releases), "markets" (general news)
NEWS_FEEDS = [
    {"name": "Federal Reserve", "category": "fed", "url": "https://www.federalreserve.gov/feeds/press_all.xml"},
    {"name": "Fed Speeches", "category": "fed", "url": "https://www.federalreserve.gov/feeds/speeches.xml"},
    {"name": "BLS", "category": "macro", "url": "https://www.bls.gov/feed/bls_latest.rss"},
    {"name": "BEA", "category": "macro", "url": "https://apps.bea.gov/rss/rss.xml"},
    # Google News search: publisher is split off the " - Publisher" title suffix.
    {"name": "Google News", "category": "macro", "split_source": True, "max_items": 25,
     "url": "https://news.google.com/rss/search?q=%22Federal+Reserve%22+OR+FOMC+OR+%22Fed+Chair%22+when:3d&hl=en-US&gl=US&ceid=US:en"},
    {"name": "CNBC", "category": "markets", "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html"},
    {"name": "CNBC Markets", "category": "markets", "url": "https://www.cnbc.com/id/15839069/device/rss/rss.html"},
    {"name": "CNBC Economy", "category": "markets", "url": "https://www.cnbc.com/id/20910258/device/rss/rss.html"},
    {"name": "MarketWatch", "category": "markets", "url": "https://feeds.content.dowjones.io/public/rss/mw_bulletins"},
    {"name": "Investing.com", "category": "markets", "url": "https://www.investing.com/rss/news_25.rss"},
    {"name": "Investing.com Econ", "category": "markets", "url": "https://www.investing.com/rss/news_14.rss"},
]
# A "markets" headline containing any of these gets promoted to the MACRO tag.
MACRO_KEYWORDS = [
    "fed", "fomc", "powell", "rate cut", "rate hike", "interest rate", "inflation", "cpi", "pce",
    "jobs report", "payroll", "unemployment", "jobless", "gdp", "treasury", "yields", "recession",
    "tariff", "central bank", "ecb", "boj", "bank of japan", "bank of england",
]
NEWS_MAX_ITEMS = 160
# Fed/macro items are rare, so they stay in the feed longer.
NEWS_MAX_AGE_DAYS = {"fed": 30, "macro": 14, "markets": 4, "company": 4}

# ---- Emerging markets tracker (same engine as the sector tracker) ---------
EM_ITEMS = [
    # (symbol, name, region)
    ("FXI", "China Large-Cap", "asia"),
    ("KWEB", "China Internet", "asia"),
    ("INDA", "India", "asia"),
    ("EWT", "Taiwan", "asia"),
    ("EWY", "South Korea", "asia"),
    ("EIDO", "Indonesia", "asia"),
    ("EWZ", "Brazil", "latam"),
    ("EWW", "Mexico", "latam"),
    ("ARGT", "Argentina", "latam"),
    ("EZA", "South Africa", "emea"),
    ("TUR", "Turkey", "emea"),
    ("KSA", "Saudi Arabia", "emea"),
]
EM_BENCHMARKS = [
    ("EEM", "MSCI Emerging"),
    ("SPY", "S&P 500"),
    ("EMB", "EM USD Bonds"),
]

# ---- Charts grid -----------------------------------------------------------
# (id, yahoo symbol, label, description, decimals, comparable)
# comparable=False for levels (yields, VIX) where "% change" would mislead in the overlay.
CHART_ASSETS = [
    ("ES", "ES=F", "ES", "S&P 500 futures", 2, True),
    ("NQ", "NQ=F", "NQ", "Nasdaq 100 futures", 2, True),
    ("RTY", "RTY=F", "RTY", "Russell 2000 futures", 1, True),
    ("GOLD", "GC=F", "GOLD", "Gold futures", 1, True),
    ("US10Y", "^TNX", "US10Y", "10-year Treasury yield", 3, False),
    ("TLT", "TLT", "TLT", "20+ yr Treasury bonds", 2, True),
    ("DXY", "DX-Y.NYB", "DXY", "US Dollar Index", 2, True),
    ("WTI", "CL=F", "WTI", "Crude oil futures", 2, True),
    ("BTC", "BTC-USD", "BTC", "Bitcoin", 0, True),
    ("VIX", "^VIX", "VIX", "Volatility index", 2, False),
]
# timeframe -> (yahoo range, interval, keep only the last N hours or None)
CHART_TIMEFRAMES = {
    "1D": ("5d", "5m", 24),
    "5D": ("5d", "15m", None),
    "1M": ("1mo", "60m", None),
    "3M": ("3mo", "1d", None),
    "6M": ("6mo", "1d", None),
    "YTD": ("ytd", "1d", None),
    "1Y": ("1y", "1d", None),
    "5Y": ("5y", "1wk", None),
}

# ---- Company tab -----------------------------------------------------------
MEGACAP_COUNT = 24                    # tiles on the mega-cap board
TICKER_MATCH_MIN_CAP = 5e9            # only these companies are recognised in headlines
COMPANY_EARNINGS_MIN_CAP = 10e9
COMPANY_FEEDS = [
    # require_ticker: drop items that don't name a listed company (filters out sports "buyouts" etc.)
    {"name": "Google News M&A", "category": "company", "split_source": True, "max_items": 60, "require_ticker": True,
     "url": "https://news.google.com/rss/search?q=%22to+acquire%22+OR+%22agrees+to+buy%22+OR+%22merger+agreement%22+OR+%22takeover+offer%22+OR+%22all-cash+deal%22+OR+%22acquisition+of%22+when:3d&hl=en-US&gl=US&ceid=US:en"},
    {"name": "CNBC Earnings", "category": "company", "url": "https://www.cnbc.com/id/15839135/device/rss/rss.html"},
]
DEAL_KEYWORDS = ["acquire", "acquisition", "merger", "merge with", "takeover", "buyout", "to buy ",
                 "agrees to buy", "bid for", "deal to buy", "stake in", "spin off", "spinoff", "tender offer"]

# ---- News impact + sentiment (keyword heuristics, tune freely) ---------------
# Each matching phrase adds its weight; total >= 3 is HIGH (red), ~1.5 MEDIUM (yellow), 0 LOW (green).
IMPACT_WEIGHTS = {
    3: ["breaking", "fomc", "rate decision", "raises rates", "cuts rates", "rate cut", "rate hike",
        "emergency", "circuit breaker", "trading halt", "crash", "invasion", "missile", "default",
        "bankruptcy", "recession", "government shutdown", "black monday", "contagion", "bailout",
        "jobs report", "nonfarm", "payrolls", "cpi", "consumer price index"],
    2: ["powell", "fed chair", "inflation", "pce", "gdp", "war", "attack", "sanctions", "tariff",
        "plunge", "plunges", "tumble", "sell-off", "selloff", "rout", "soar", "soars", "surges",
        "hormuz", "opec", "downgrade", "guidance", "treasury yields", "bond market", "unemployment"],
    1: ["earnings", "beats", "misses", "merger", "acquisition", "acquire", "takeover", "buyout",
        "layoffs", "upgrade", "yields", "oil", "crude", "ecb", "bank of japan", "boj", "bank of england",
        "china", "ipo", "antitrust", "lawsuit", "probe", "record high", "futures", "rally", "jumps",
        "falls", "slides", "stocks", "nasdaq", "s&p 500", "dow"],
}
# A company worth more than this in a headline bumps impact (moves the indices).
IMPACT_MEGACAP = 400e9
SENTIMENT_POSITIVE = ["beat", "beats", "tops", "surge", "surges", "soar", "soars", "jump", "jumps", "rally",
                      "rallies", "record", "raises guidance", "raises outlook", "upgrade", "upgraded", "wins",
                      "approval", "approved", "gains", "climbs", "rises", "strong", "boost", "buyback", "beat estimates"]
SENTIMENT_NEGATIVE = ["miss", "misses", "plunge", "plunges", "tumble", "tumbles", "slump", "slumps", "falls",
                      "drops", "sinks", "cuts guidance", "lowers outlook", "warns", "downgrade", "downgraded",
                      "lawsuit", "probe", "investigation", "recall", "layoffs", "cuts jobs", "bankruptcy",
                      "fraud", "weak", "loss", "slides", "halts", "fined", "delay"]
