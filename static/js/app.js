// Entry point.
// Fixed pieces (ticker, top bar, news sidebar) mount once. Everything else is a MODULE on a tab:
// add one by writing js/panels/<x>.js with init(el) and listing it below. Users can drag modules
// around and switch them between half and full width; the layout is saved in their browser.
import * as topbar from "./panels/topbar.js";
import * as ticker from "./panels/ticker.js";
import * as news from "./panels/news.js";
import * as feargreed from "./panels/feargreed.js";
import * as charts from "./panels/charts.js";
import * as compare from "./panels/compare.js";
import * as companies from "./panels/companies.js";
import { create as tracker } from "./panels/sectors.js";
import { mountTabs } from "./lib/layout.js";
import { emit, on } from "./lib/bus.js";

const TABS = [
  {
    id: "markets", label: "MARKETS", modules: [
      { id: "charts", size: "full", init: charts.init },
      { id: "compare", size: "half", init: compare.init },
      { id: "em", size: "half", init: tracker({ endpoint: "/api/em", title: "EMERGING MARKETS", sub: "country ETFs vs EEM", key: "em", benchmark: "EEM" }) },
      { id: "sectors", size: "full", init: tracker({ endpoint: "/api/sectors", title: "SECTOR TRACKER", sub: "SPDR SELECT SECTORS", key: "sectors", benchmark: "SPY", spread: ["cyclical", "defensive", "CYC−DEF"], hotkeys: true }) },
    ],
  },
  {
    id: "companies", label: "COMPANIES", modules: [
      { id: "megacaps", size: "full", init: companies.initBoard },
      { id: "earnings", size: "half", init: companies.initEarnings },
      { id: "deals", size: "half", init: companies.initDeals },
      { id: "companynews", size: "full", init: companies.initCompanyNews },
    ],
  },
];

topbar.init(document.getElementById("session"));
ticker.init(document.getElementById("ticker"));
feargreed.init(document.getElementById("feargreed"));
news.init(document.getElementById("news"));
const layout = mountTabs({ tabsEl: document.getElementById("tabs"), workspace: document.getElementById("workspace"), tabs: TABS });

// Handy from the devtools console:
//   dashboard.emit("news:new", [{ title: "Test CPI", ticker: ["CPI"], tickers: [] }])
//   dashboard.resetLayout()
window.dashboard = { emit, on, resetLayout: layout.reset };
