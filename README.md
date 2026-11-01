# Market Dashboard

A dark, TradingView-style market dashboard for futures day trading. It has:

- a rotating macro and earnings ticker
- a Fear & Greed gauge that stays visible
- a live news and Fed wire with color-coded impact
- two tabs of modules you can rearrange: **Markets** and **Companies**

All data is free: no API keys, no paid feeds.

## Run

```bash
git clone https://github.com/danielkwon7607-del/market-dashboard.git
cd market-dashboard
./run.sh
```

Then open http://localhost:8050. On first run, `run.sh` creates `.venv/` and installs the only Python
dependency, `curl_cffi`. To use another port, run `PORT=9000 ./run.sh`. You need Python 3.9+ and an internet
connection. The chart library loads from unpkg.

The dependency matters: plain Python `urllib` gets `429 Too Many Requests` from Yahoo and timeouts from
FRED. `curl_cffi` makes requests look like Chrome (the same trick `yfinance` uses), and then both work.

## What's on the page

### Always visible
| Piece | What | Source |
|---|---|---|
| **Ticker bar** | ES, NQ, RTY, VIX, 10Y/30Y, DXY, WTI, gold, BTC, EUR/USD | Yahoo chart endpoint |
| | Fed funds and last move, next FOMC, CPI, core CPI, PCE, core PCE, jobs, claims, GDP, 2Y, 2s10s | FRED `fredgraph.csv` |
| | Next CPI / jobs / PCE / GDP release dates | BLS and BEA schedule pages |
| | Upcoming mega-cap earnings (purple `ER` tag) | Nasdaq earnings calendar |
| **Fear & Greed** (top bar) | CNN's stock index plus a ₿ crypto index. Hover for history and the 7 components | CNN dataviz endpoint, alternative.me |
| **News sidebar** | Fed, BLS, BEA, CNBC, MarketWatch, Investing.com, Google News (Fed and M&A searches) | public RSS |

#### News colors
- **Background tint = market impact.** It runs faint green (low) → yellow (medium) → red (high). The
  bars next to the source show the level, and a high-impact item under 90 minutes old gets a blinking
  **BREAKING** badge.
- **Left rail = category.** Amber is **FED**, blue is **MACRO**, and **COMPANY** is green or red for good
  or bad headlines. General market news has no rail.
- **Ticker chips** (e.g. `NVDA`) show which companies a headline names.
- Impact and sentiment come from keyword weights in `config.py` (`IMPACT_WEIGHTS`, `SENTIMENT_*`), so tune
  them there.

### Markets tab
- **Charts:** candlestick charts for ES, NQ, RTY, gold, the US 10Y yield, TLT (long bonds), DXY, WTI,
  BTC and VIX. **Every chart has its own timeframe** (1D, 5D, 1M, 3M, 6M, YTD, 1Y, 5Y), saved per chart.
  "SET ALL" changes them all at once, and the grid can show 2, 3 or 4 per row. Hovering shows OHLC.
- **Compare:** the comparable assets rebased to 0% on one chart, with its own timeframe. Click a legend
  chip to toggle a line.
- **Emerging markets:** country ETFs (China, India, Taiwan, Korea, Brazil, Mexico and others) against
  EEM, with the same bars and heatmap as the sector tracker.
- **Sector tracker:** the 11 SPDR sectors plus SPY/QQQ/IWM across 1D/1W/1M/3M/YTD, with
  LEADING…LAGGING labels, a breadth card with a risk-on/off read, and a heatmap.

### Companies tab
- **Mega-cap board:** the 24 largest US companies with today's move. They drive NQ and ES. Click a tile
  to open its Yahoo quote page.
- **Earnings:** UPCOMING (with BMO/AMC and the EPS estimate) and RESULTS (actual vs estimate,
  BEAT/MISS, surprise %), for companies worth $10B or more.
- **M&A / deals:** acquisition, merger and takeover headlines, tagged with the companies involved.
- **Company news:** every headline that names a listed company. Tickers are recognized from Nasdaq's
  screener (6,000+ US listings).

### Moving modules
Drag a module by its **⠿** grip to reorder it, and use **▭ FULL / ◧ HALF** to resize it. Modules snap
into a two-column grid, so half is the smallest size. Your layout is saved in your browser. To reset
it, run `dashboard.resetLayout()` in the browser console.

## Layout

```
market_dashboard/
  run.sh              start script (creates the venv on first run)
  server.py           stdlib HTTP server: serves static/ and the ROUTES dict of JSON endpoints
  config.py           symbols, series, feeds, keywords, chart assets, impact weights  <- most tweaks go here
  providers/          talk to the outside world (one file per source)
    http.py  cache.py yahoo.py  fred.py  news.py  calendar.py  nasdaq.py  sentiment.py
  services/           turn provider data into one JSON payload per endpoint
    macro.py  sectors.py (also EM)  news.py  charts.py  sentiment.py  companies.py  tickers.py
  static/
    index.html  css/app.css
    js/app.js         TABS: which modules live on which tab
    js/lib/           api.js, store.js (shared polling), layout.js (drag/snap grid), chart.js, news-ui.js, bus.js, format.js
    js/panels/        ticker  topbar  feargreed  news  charts  compare  sectors  companies
```

## Adding features

- **Another chart:** add a row to `CHART_ASSETS` in `config.py`.
- **Another EM country or sector:** add it to `EM_ITEMS` or `SECTORS`.
- **Another ticker quote:** add a row to `MARKET_QUOTES`.
- **Another macro print** (anything on FRED): add the series to `FRED_SERIES`, add a builder to
  `MACRO_BUILDERS` in `services/macro.py`, and add keywords to `TICKER_KEYWORDS`.
- **Another news source:** add `{name, category, url}` to `NEWS_FEEDS`. `category` is `fed`, `macro`,
  `company` or `markets`.
- **A new module** (options positioning, volume profile, economic calendar…):
  1. `services/<thing>.py` with `payload(q)` (where `q` is the query-string dict).
  2. Register it in `ROUTES` in `server.py`.
  3. `static/js/panels/<thing>.js` exporting `init(el)`. Start it with a `.panel-head`, which is where the
     grip and size buttons attach. Use `subscribe(url, ms, fn)` from `lib/store.js` to share a poll.
  4. Add `{ id, size: "half" | "full", init }` to a tab in `TABS` in `js/app.js`.
- **Panels talking to each other:** `emit` / `on` from `js/lib/bus.js`. The news panel emits `news:new` and
  `news:all`, and the ticker listens to both.

## Caveats

- Yahoo, FRED, Nasdaq, CNN and the RSS feeds are free, unofficial endpoints, so they can rate-limit or
  change without notice. If a refresh fails, the cache keeps the last good data.
- Yahoo futures quotes follow the front month and can be delayed. The 1D chart shows the last 24 hours of
  5-minute bars. Yahoo sometimes sends bars with a stale open price, and the server re-anchors those.
- Impact, sentiment and ticker recognition are keyword heuristics, not NLP. Expect the occasional miss.
- `FOMC_DECISION_DATES` in `config.py` is entered by hand. Add each new year's dates from
  federalreserve.gov/monetarypolicy/fomccalendars.htm.
- Charts use [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/)
  (Apache 2.0), credited in the Charts panel header.
