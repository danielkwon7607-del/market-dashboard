// Shared lightweight-charts setup so every chart looks the same.
const LWC = () => window.LightweightCharts;

export const COLORS = { up: "#22ab94", down: "#f23645", text: "#787b86", grid: "#1b2130", border: "#2a2e39" };

export function makeChart(el, { intraday = false, percent = false, decimals = 2 } = {}) {
  const chart = LWC().createChart(el, {
    autoSize: true,
    // Attribution is shown once in the Charts panel header instead of a logo on every chart.
    layout: { background: { type: "solid", color: "transparent" }, textColor: COLORS.text, fontSize: 11, attributionLogo: false,
      fontFamily: '"SF Mono", ui-monospace, Menlo, monospace' },
    grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
    rightPriceScale: { borderColor: COLORS.border, scaleMargins: { top: 0.12, bottom: 0.08 } },
    timeScale: { borderColor: COLORS.border, timeVisible: intraday, secondsVisible: false, rightOffset: 3 },
    crosshair: { mode: 0, vertLine: { color: "#4a5263", labelBackgroundColor: "#2a2e39" }, horzLine: { color: "#4a5263", labelBackgroundColor: "#2a2e39" } },
    handleScroll: { mouseWheel: false, pressedMouseMove: true },
    handleScale: { mouseWheel: true, pinch: true },
    localization: {
      priceFormatter: percent ? (p) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%` : (p) => p.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    },
  });
  return chart;
}

export function candles(chart, decimals = 2) {
  return chart.addCandlestickSeries({
    upColor: COLORS.up, downColor: COLORS.down, wickUpColor: COLORS.up, wickDownColor: COLORS.down,
    borderVisible: false, priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals },
  });
}
