// Charts: a 2×2 grid of large charts. Each slot has its own asset picker AND its own timeframe
// (both saved). Presets swap all four slots at once.
import { getJSON } from "../lib/api.js";
import { esc, pct, price, dirOf } from "../lib/format.js";
import { makeChart, candles } from "../lib/chart.js";

const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };
const isIntraday = (tf) => ["1D", "5D", "1M"].includes(tf);

const PRESETS = {
  INDICES: ["ES", "NQ", "RTY", "VIX"],
  "RATES & FX": ["US10Y", "TLT", "DXY", "GOLD"],
  "MACRO MIX": ["ES", "NQ", "GOLD", "US10Y"],
  "CMDTY & CRYPTO": ["GOLD", "WTI", "BTC", "DXY"],
};

function slot(index, assets, timeframes, grid, initialId) {
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
  let asset = byId[initialId] || assets[index];
  let chart = null, series = null, baseLine = null, timer = null;
  const tfKey = () => `chart.slot${index}.tf`;
  let tf = load(tfKey(), "1D");

  const el = document.createElement("div");
  el.className = "chart-card";
  el.innerHTML = `
    <div class="cc-head">
      <div class="cc-id">
        <select class="cc-select" aria-label="Asset">${assets.map((a) => `<option value="${a.id}">${esc(a.label)}</option>`).join("")}</select>
        <span class="cc-desc"></span>
      </div>
      <div class="cc-quote"><span class="cc-px num"></span><span class="cc-chg num"></span></div>
    </div>
    <div class="cc-bar">
      <div class="seg seg-sm">${timeframes.map((k) => `<button data-tf="${k}">${k}</button>`).join("")}</div>
      <span class="cc-ohlc num"></span>
    </div>
    <div class="cc-chart"></div>`;
  grid.appendChild(el);
  const select = el.querySelector(".cc-select");

  function header(bar) {
    const ohlc = el.querySelector(".cc-ohlc");
    if (!bar) { ohlc.textContent = ""; return; }
    const f = (v) => price(v, asset.decimals);
    ohlc.innerHTML = `O <b>${f(bar.open)}</b> H <b>${f(bar.high)}</b> L <b>${f(bar.low)}</b> C <b class="${bar.close >= bar.open ? "up" : "down"}">${f(bar.close)}</b>`;
  }

  function build() {
    if (chart) chart.remove();
    chart = makeChart(el.querySelector(".cc-chart"), { decimals: asset.decimals });
    series = candles(chart, asset.decimals);
    baseLine = null;
    chart.subscribeCrosshairMove((p) => header(p.time ? p.seriesData.get(series) : null));
    select.value = asset.id;
    el.querySelector(".cc-desc").textContent = asset.desc;
    el.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.tf === tf));
  }

  async function refresh(fit = false) {
    clearTimeout(timer);
    const want = `${asset.id}/${tf}`;
    try {
      const d = await getJSON(`/api/charts?id=${asset.id}&tf=${tf}`);
      if (want !== `${asset.id}/${tf}`) return; // user switched while loading
      chart.applyOptions({ timeScale: { timeVisible: d.intraday } });
      series.setData(d.bars);
      if (baseLine) series.removePriceLine(baseLine);
      baseLine = d.base ? series.createPriceLine({ price: d.base, color: "#5d6577", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: tf === "1D" ? "prev" : "start" }) : null;
      if (fit) chart.timeScale().fitContent();
      const unit = asset.id === "US10Y" ? "%" : "";
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
    save(tfKey(), k);
    el.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.tf === k));
    refresh(true);
  }
  function setAsset(id) {
    if (!byId[id]) return;
    asset = byId[id];
    build();
    refresh(true);
  }
  el.querySelector(".seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tf]");
    if (b) setTf(b.dataset.tf);
  });
  select.addEventListener("change", () => onPick(index, select.value));
  let onPick = () => {};

  build();
  refresh(true);
  return { setTf, setAsset, get id() { return asset.id; }, set onPick(fn) { onPick = fn; } };
}

export async function init(root) {
  root.innerHTML = `
    <div class="panel-head">
      <span class="panel-title">CHARTS</span>
      <div class="seg seg-sm presets"></div>
      <span class="panel-sub brandline"><a class="attr" href="https://www.tradingview.com/" target="_blank" rel="noopener">charts by TradingView</a></span>
      <div class="spacer"></div>
      <span class="panel-sub">SET ALL</span>
      <div class="seg seg-sm all-tf"></div>
    </div>
    <div class="chart-grid"><div class="skeleton"></div></div>`;
  const grid = root.querySelector(".chart-grid");
  const { assets, timeframes } = await getJSON("/api/charts");
  grid.innerHTML = "";
  let ids = load("chart.slots", PRESETS["MACRO MIX"]);
  const slots = [0, 1, 2, 3].map((i) => slot(i, assets, timeframes, grid, ids[i]));

  const presetSeg = root.querySelector(".presets");
  const renderPresets = () => {
    const cur = slots.map((s) => s.id).join();
    presetSeg.innerHTML = Object.entries(PRESETS).map(([name, list]) =>
      `<button data-preset="${name}" class="${list.join() === cur ? "on" : ""}">${name}</button>`).join("");
  };
  const persist = () => { save("chart.slots", slots.map((s) => s.id)); renderPresets(); };
  slots.forEach((s) => { s.onPick = (i, id) => { slots[i].setAsset(id); persist(); }; });
  presetSeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]");
    if (!b) return;
    PRESETS[b.dataset.preset].forEach((id, i) => { if (slots[i].id !== id) slots[i].setAsset(id); });
    persist();
  });
  renderPresets();

  const allSeg = root.querySelector(".all-tf");
  allSeg.innerHTML = timeframes.map((k) => `<button data-all="${k}">${k}</button>`).join("");
  allSeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-all]");
    if (b) slots.forEach((s) => s.setTf(b.dataset.all));
  });
}
