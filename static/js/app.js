// Entry point. Each panel module exports init(rootEl). Add a panel: create js/panels/x.js,
// add a <section id="x"> in index.html, and register it below.
import * as topbar from "./panels/topbar.js";
import * as ticker from "./panels/ticker.js";
import * as sectors from "./panels/sectors.js";
import * as news from "./panels/news.js";
import { emit, on } from "./lib/bus.js";

const PANELS = [
  [topbar, "session"],
  [ticker, "ticker"],
  [sectors, "sectors"],
  [news, "news"],
];

for (const [mod, id] of PANELS) {
  const el = document.getElementById(id);
  if (el) mod.init(el);
}

// Handy from the devtools console, e.g. dashboard.emit("news:new", [{ title: "Test CPI", ticker: ["CPI"] }])
window.dashboard = { emit, on };
