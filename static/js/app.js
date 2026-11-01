// Entry point.
// Fixed pieces (ticker, top bar, news sidebar) mount once. Everything else is a MODULE on a tab.
// Tabs with fill: true size their modules to the screen (no page scrolling; long lists scroll inside).
// Add a module: write js/panels/<x>.js with init(el) and list it below.
import * as topbar from "./panels/topbar.js";
import * as ticker from "./panels/ticker.js";
import * as news from "./panels/news.js";
import * as feargreed from "./panels/feargreed.js";
import * as charts from "./panels/charts.js";
import * as compare from "./panels/compare.js";
import * as macro from "./panels/macro.js";
import * as companies from "./panels/companies.js";
import { create as tracker } from "./panels/sectors.js";
import { mountTabs } from "./lib/layout.js";
import { emit, on } from "./lib/bus.js";

const SECTORS = { endpoint: "/api/sectors", title: "SECTOR TRACKER", sub: "SPDR SELECT SECTORS", key: "sectors", benchmark: "SPY", spread: ["cyclical", "defensive", "CYC−DEF"] };
const EM = { endpoint: "/api/em", title: "EMERGING MARKETS", sub: "country ETFs vs EEM", key: "em", benchmark: "EEM" };

const TABS = [
  { id: "charts", label: "CHARTS", fill: true, modules: [
    { id: "charts", size: "full", init: charts.init },
  ] },
  { id: "compare", label: "COMPARE", fill: true, modules: [
    { id: "compare", size: "full", init: compare.init },
  ] },
  { id: "sectors", label: "SECTORS", fill: true, modules: [
    { id: "sectors", size: "full", init: tracker({ ...SECTORS, parts: ["cards", "bars"], hotkeys: true }) },
  ] },
  { id: "heatmap", label: "HEATMAP", fill: true, modules: [
    { id: "sector-heat", size: "half", init: tracker({ ...SECTORS, title: "SECTOR HEATMAP", parts: ["heatmap"] }) },
    { id: "em-heat", size: "half", init: tracker({ ...EM, title: "EM HEATMAP", parts: ["heatmap"] }) },
  ] },
  { id: "macro", label: "MACRO", fill: true, modules: [
    { id: "macro", size: "half", init: macro.init },
    { id: "em", size: "half", init: tracker({ ...EM, parts: ["cards", "bars"] }) },
  ] },
  { id: "companies", label: "COMPANIES", fill: true, modules: [
    { id: "megacaps", size: "full", init: companies.initBoard },
    { id: "earnings", size: "half", init: companies.initEarnings },
    { id: "deals", size: "half", init: companies.initDeals },
  ] },
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
