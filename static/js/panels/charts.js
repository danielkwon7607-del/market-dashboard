// Charts grid: one candlestick chart per asset, each with its OWN timeframe (saved per asset).
import { getJSON } from "../lib/api.js";
import { esc, pct, price, dirOf } from "../lib/format.js";
import { makeChart, candles } from "../lib/chart.js";

const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } };
const isIntraday = (tf) => ["1D", "5D", "1M"].includes(tf);

function card(asset, timeframes, grid) {
  let tf = load(`chart.tf.${asset.id}`, "1D");
  let chart = null, series = null, baseLine = null, timer = null, last = null;
  const el = document.createElement("div");
  el.className = "chart-card";
  el.innerHTML = `
    <div class="cc-head">
      <div class="cc-id"><span class="cc-sym">${esc(asset.label)}</span><span class="cc-desc">${esc(asset.desc)}</span></div>
      <div class="cc-quote"><span class="cc-px num"></span><span class="cc-chg num"></span></div>
    </div>
    <div class="cc-bar">
      <div class="seg seg-sm">${timeframes.map((k) => `<button data-tf="${k}">${k}</button>`).join("")}</div>
      <span class="cc-ohlc num"></span>
    </div>
    <div class="cc-chart"></div>`;
  grid.appendChild(el);
  const unit = asset.id === "US10Y" ? "%" : "";

  function header(bar) {
    const ohlc = el.querySelector(".cc-ohlc");
    if (!bar) { ohlc.textContent = ""; return; }
    const f = (v) => price(v, asset.decimals);
    ohlc.innerHTML = `O <b>${f(bar.open)}</b> H <b>${f(bar.high)}</b> L <b>${f(bar.low)}</b> C <b class="${bar.close >= bar.open ? "up" : "down"}">${f(bar.close)}</b>`;
  }

  async function refresh(fit = false) {
    clearTimeout(timer);
    try {
      const d = await getJSON(`/api/charts?id=${asset.id}&tf=${tf}`);
      if (!chart) {
        chart = makeChart(el.querySelector(".cc-chart"), { decimals: asset.decimals });
        series = candles(chart, asset.decimals);
        chart.subscribeCrosshairMove((p) => header(p.time ? p.seriesData.get(series) : null));
      }
      chart.applyOptions({ timeScale: { timeVisible: d.intraday } });
      series.setData(d.bars);
      if (baseLine) series.removePriceLine(baseLine);
      baseLine = d.base ? series.createPriceLine({ price: d.base, color: "#5d6577", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: tf === "1D" ? "prev" : "start" }) : null;
      if (fit) chart.timeScale().fitContent();
      last = d;
      el.querySelector(".cc-px").textContent = price(d.last, asset.decimals) + unit;
      const chg = el.querySelector(".cc-chg");
      chg.className = `cc-chg num ${dirOf(d.pct)}`;
      chg.textContent = asset.id === "US10Y" && d.change != null
        ? `${d.change >= 0 ? "+" : "−"}${Math.abs(d.change * 100).toFixed(1)}bp ${tf}`
        : `${pct(d.pct)} ${tf}`;
      el.classList.remove("cc-err");
    } catch (e) {
      el.classList.add("cc-err");
      el.querySelector(".cc-chg").textContent = "no data";
      console.warn(asset.id, e);
    }
    timer = setTimeout(refresh, isIntraday(tf) ? 60_000 : 300_000);
  }

  function setTf(k) {
    tf = k;
    save(`chart.tf.${asset.id}`, k);
    el.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.tf === k));
    refresh(true);
  }
  el.querySelector(".seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tf]");
    if (b) setTf(b.dataset.tf);
  });
  el.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.tf === tf));
  refresh(true);
  return { setTf, get last() { return last; } };
}

export async function init(root) {
  root.innerHTML = `
    <div class="panel-head">
      <span class="panel-title">CHARTS</span>
      <span class="panel-sub brandline">each chart keeps its own timeframe · <a class="attr" href="https://www.tradingview.com/" target="_blank" rel="noopener">charts by TradingView</a></span>
      <div class="spacer"></div>
      <span class="panel-sub">SET ALL</span>
      <div class="seg seg-sm all-tf"></div>
      <div class="seg seg-sm cols" title="Charts per row"></div>
    </div>
    <div class="chart-grid"><div class="skeleton"></div></div>`;
  const grid = root.querySelector(".chart-grid");
  const { assets, timeframes } = await getJSON("/api/charts");
  grid.innerHTML = "";
  const cards = assets.map((a) => card(a, timeframes, grid));

  const allSeg = root.querySelector(".all-tf");
  allSeg.innerHTML = timeframes.map((k) => `<button data-all="${k}">${k}</button>`).join("");
  allSeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-all]");
    if (b) cards.forEach((c) => c.setTf(b.dataset.all));
  });

  const colSeg = root.querySelector(".cols");
  let cols = load("chart.cols", "auto");
  const renderCols = () => {
    colSeg.innerHTML = ["auto", "2", "3", "4"].map((c) => `<button data-cols="${c}" class="${c === cols ? "on" : ""}">${c === "auto" ? "▦" : c}</button>`).join("");
    grid.style.gridTemplateColumns = cols === "auto" ? "" : `repeat(${cols}, minmax(0, 1fr))`;
  };
  colSeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cols]");
    if (b) { cols = b.dataset.cols; save("chart.cols", cols); renderCols(); }
  });
  renderCols();
}
