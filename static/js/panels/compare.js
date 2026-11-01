// Compare: every asset rebased to 0% at the start of the window, on one chart.
import { getJSON } from "../lib/api.js";
import { esc, pct } from "../lib/format.js";
import { makeChart } from "../lib/chart.js";

// Fixed color per asset (validated categorical palette; color follows the asset, never its rank).
const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const DEFAULT_ON = ["ES", "NQ", "RTY", "GOLD", "TLT", "DXY"];
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

export async function init(root) {
  root.innerHTML = `
    <div class="panel-head">
      <span class="panel-title">COMPARE</span>
      <span class="panel-sub brandline">% change from start of window</span>
      <div class="seg seg-sm tfs"></div>
      <div class="spacer"></div>
    </div>
    <div class="cmp-legend"></div>
    <div class="cmp-chart"></div>`;
  const { assets, timeframes } = await getJSON("/api/charts");
  const list = assets.filter((a) => a.comparable).slice(0, PALETTE.length);
  list.forEach((a, i) => { a.color = PALETTE[i]; });
  let tf = load("compare.tf", "1M");
  let on = new Set(load("compare.on", DEFAULT_ON));
  const latest = {};
  const chart = makeChart(root.querySelector(".cmp-chart"), { percent: true });
  const series = {};
  for (const a of list) {
    series[a.id] = chart.addLineSeries({ color: a.color, lineWidth: 2, title: a.label, priceLineVisible: false,
      lastValueVisible: true, crosshairMarkerRadius: 4, visible: on.has(a.id) });
  }
  // Invisible series that carries the 0% reference line.
  const zero = chart.addLineSeries({ color: "rgba(0,0,0,0)", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
  zero.createPriceLine({ price: 0, color: "#5d6577", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });

  const legend = root.querySelector(".cmp-legend");
  function renderLegend(values = latest) {
    legend.innerHTML = list.map((a) => {
      const v = values[a.id];
      return `<button class="cmp-chip ${on.has(a.id) ? "on" : ""}" data-id="${a.id}" title="${esc(a.desc)}">
        <i style="background:${a.color}"></i>${esc(a.label)} <span class="num">${on.has(a.id) && v != null ? pct(v) : ""}</span></button>`;
    }).join("");
  }
  legend.addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]");
    if (!b) return;
    on.has(b.dataset.id) ? on.delete(b.dataset.id) : on.add(b.dataset.id);
    save("compare.on", [...on]);
    series[b.dataset.id].applyOptions({ visible: on.has(b.dataset.id) });
    renderLegend();
  });
  chart.subscribeCrosshairMove((p) => {
    if (!p.time) return renderLegend();
    const vals = {};
    for (const a of list) vals[a.id] = p.seriesData.get(series[a.id])?.value;
    renderLegend(vals);
  });

  const tfSeg = root.querySelector(".tfs");
  let timer;
  async function refresh() {
    clearTimeout(timer);
    tfSeg.innerHTML = timeframes.map((k) => `<button data-tf="${k}" class="${k === tf ? "on" : ""}">${k}</button>`).join("");
    const results = await Promise.allSettled(list.map((a) => getJSON(`/api/charts?id=${a.id}&tf=${tf}`)));
    let intraday = false, longest = [];
    results.forEach((r, i) => {
      const a = list[i];
      if (r.status !== "fulfilled" || !r.value.bars.length) { series[a.id].setData([]); latest[a.id] = null; return; }
      const bars = r.value.bars, base = bars[0].close;
      intraday = r.value.intraday;
      const pts = bars.map((b) => ({ time: b.time, value: (b.close / base - 1) * 100 }));
      series[a.id].setData(pts);
      if (pts.length > longest.length) longest = pts;
      latest[a.id] = pts.at(-1).value;
    });
    zero.setData(longest.map((p) => ({ time: p.time, value: 0 })));
    chart.applyOptions({ timeScale: { timeVisible: intraday } });
    chart.timeScale().fitContent();
    renderLegend();
    timer = setTimeout(refresh, ["1D", "5D", "1M"].includes(tf) ? 60_000 : 300_000);
  }
  tfSeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tf]");
    if (b) { tf = b.dataset.tf; save("compare.tf", tf); refresh(); }
  });
  refresh();
}
