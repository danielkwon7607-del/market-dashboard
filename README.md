# Market Dashboard

A one-page, dark, TradingView-style market dashboard with three parts: a rotating macro ticker, a sector
tracker and a live news/Fed wire. All data is free: no API keys, no paid feeds.

## Run

```bash
cd market_dashboard
./run.sh
```

Then open http://localhost:8050. On first run, `run.sh` creates `.venv/` and installs the only
dependency, `curl_cffi`. To use another port, run `PORT=9000 ./run.sh`.

The dependency matters: plain Python `urllib` gets `429 Too Many Requests` from Yahoo and timeouts from
FRED. `curl_cffi` makes requests look like Chrome (the same trick `yfinance` uses), and then both work.

## What's on the page

| Area | Source | Refresh |
|---|---|---|
| **Ticker bar**: ES, NQ, RTY, VIX, 10Y/30Y, DXY, WTI, gold, BTC, EUR/USD | Yahoo chart endpoint | 30 s (server caches 60 s) |
| **Ticker bar**: fed funds target and last move, next FOMC, CPI, core CPI, PCE, core PCE, unemployment, payrolls, jobless claims, GDP, 2Y, 2s10s | FRED `fredgraph.csv` (no key) | server caches 6 h |
| **Ticker bar**: next CPI / jobs / PCE / GDP release dates | BLS and BEA schedule pages | server caches 24 h |
| **Ticker bar**: upcoming earnings (next 7 days, market cap ≥ $50B, top 12) | Nasdaq earnings calendar (`api.nasdaq.com`) | server caches 1 h |
| **Sector tracker**: 11 SPDR sectors plus SPY/QQQ/IWM; 1D/1W/1M/3M/YTD | Yahoo daily closes (2y) | 60 s |
| **News**: Fed press releases and speeches, BLS, BEA, Google News (Fed), CNBC, MarketWatch, Investing.com | public RSS | 60 s (server caches 90 s) |

How the parts behave:
- **Ticker:** each item rotates through alternate wordings (for example "TARGET 3.75–4.00%", "LAST MOVE…",
  "NEXT FOMC DEC 9 · 38D"). When a value changes, the item flashes green or red and shows `UPDATED · WAS …`.
  When a matching headline arrives, it flashes amber and shows the headline. Hovering pauses the scroll.
- **Earnings items** have a purple `ER` tag and show the day, BMO (before open) or AMC (after close), and
  the EPS estimate. A headline that mentions the symbol or company name flashes the item. Tune the cutoffs
  with `EARNINGS_*` in `config.py`.
- **Sectors:** the timeframe toggle (or keys `1`–`5`) re-sorts the bars. The dashed line is SPY, so bars to
  its right are beating the S&P.
- **Status labels:** the top 2 sectors (if positive) are LEADING and the bottom 2 (if negative) are
  LAGGING. The rest are ADVANCING, FLAT or DECLINING around a flat band for each timeframe
  (`config.FLAT_BAND`).
- **Breadth card:** shows sectors up and the cyclical minus defensive average, which drives the
  RISK-ON/OFF label.
- **Heatmap:** colors are scaled per column, so YTD doesn't wash out 1D. Click a column header to switch
  timeframe.
- **News:** Fed items get an amber rail and a FED badge, and the latest policy item is pinned on top.
  Official data releases, and market headlines about the Fed, rates, inflation or jobs, get a blue MACRO
  badge. Use the chips to filter.

1D means the last close versus the prior close, so on weekends it shows Friday's move. The panel says
"AS OF … CLOSE" when the data isn't from today.

## Layout

```
market_dashboard/
  run.sh              start script (creates the venv on first run)
  server.py           stdlib HTTP server: serves static/ and the ROUTES dict of JSON endpoints
  config.py           symbols, FRED series, RSS feeds, keywords, FOMC dates  <- most tweaks go here
  providers/          talk to the outside world (one file per source)
    http.py           shared curl_cffi client
    cache.py          @ttl_cache: serves the last good value if a refresh fails
    yahoo.py  fred.py  news.py  calendar.py (BLS/BEA release dates, Nasdaq earnings)
  services/           turn provider data into one JSON payload per panel
    sectors.py  macro.py  news.py
  static/
    index.html  css/app.css
    js/app.js         registers panels
    js/lib/           api.js (getJSON/poll), bus.js (cross-panel events), format.js
    js/panels/        topbar.js  ticker.js  sectors.js  news.js
```

## Adding features

- **Another ticker quote** (anything on Yahoo): add a row to `MARKET_QUOTES` in `config.py`.
- **Another macro print** (anything on FRED): add the series id to `FRED_SERIES`, write a small builder in
  `services/macro.py` that returns `{id, label, value, change, dir, phrases}`, and add it to
  `MACRO_BUILDERS`. To have headlines flash it, add keywords under its `id` in `TICKER_KEYWORDS`.
- **Another news source**: add `{name, category, url}` to `NEWS_FEEDS`. `category` is `fed`, `macro` or
  `markets`.
- **A new panel** (for example options positioning, a volume profile, or an economic calendar):
  1. `services/<thing>.py` with a `payload()` function that returns a dict.
  2. Register it in `ROUTES` in `server.py` as `"/api/<thing>": <thing>.payload`.
  3. `static/js/panels/<thing>.js` exporting `init(el)`, using `poll("/api/<thing>", ms, render)`.
  4. Add `<section id="<thing>" class="panel">` to `index.html` and list it in `PANELS` in `app.js`.
     Reuse the `.panel-head`, `.box`, `.seg` and `.num` classes so it matches.
- **Panels talking to each other**: `emit("name", data)` and `on("name", fn)` from `js/lib/bus.js`. The news
  panel already emits `news:new` and `news:all`. From the browser console you can test with
  `dashboard.emit("news:new", [{ title: "test CPI", ticker: ["CPI"] }])`.

## Caveats

- Yahoo and FRED are unofficial or free endpoints, so they can rate-limit or change without notice. If a
  refresh fails, the cache keeps the last good data.
- Yahoo futures quotes (`ES=F`, `NQ=F`) follow the front month, and free quotes can be delayed.
- FRED macro series update on their release schedules (CPI is monthly, for example). The ticker shows which
  month each print covers.
- `FOMC_DECISION_DATES` in `config.py` is entered by hand. Add each new year's dates from
  federalreserve.gov/monetarypolicy/fomccalendars.htm.
