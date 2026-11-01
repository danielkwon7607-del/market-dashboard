// Shared lightweight-charts setup so every chart looks and handles the same, TradingView-style:
//   drag the chart          pan left/right (and up/down once AUTO is off)
//   mouse wheel / pinch     zoom time; horizontal trackpad swipe scrolls through time
//   drag the price axis     stretch/squeeze prices (turns AUTO off)
//   drag the time axis      stretch/squeeze time
//   double-click an axis    reset that axis
// Each chart gets a small overlay: AUTO (auto-fit prices), LOG (candles only), and ⟲ (reset view).
const LWC = () => window.LightweightCharts;

export const COLORS = { up: "#1fbf75", down: "#ff4d4d", text: "#7a7a7a", grid: "#111111", border: "#262626" };

export function makeChart(el, { intraday = false, percent = false, decimals = 2 } = {}) {
  const chart = LWC().createChart(el, {
    autoSize: true,
    // Attribution is shown once in the Charts panel header instead of a logo on every chart.
    layout: { background: { type: "solid", color: "transparent" }, textColor: COLORS.text, fontSize: 11, attributionLogo: false,
      fontFamily: '"SF Mono", ui-monospace, Menlo, monospace' },
    grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
    rightPriceScale: { borderColor: COLORS.border, scaleMargins: { top: 0.12, bottom: 0.08 } },
    timeScale: { borderColor: COLORS.border, timeVisible: intraday, secondsVisible: false, rightOffset: 3 },
    crosshair: { mode: 0, vertLine: { color: "#555", labelBackgroundColor: "#262626" }, horzLine: { color: "#555", labelBackgroundColor: "#262626" } },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    handleScale: {
      axisPressedMouseMove: { time: true, price: true },
      axisDoubleClickReset: { time: true, price: true },
      mouseWheel: true, pinch: true,
    },
    kineticScroll: { mouse: false, touch: true },
    localization: {
      priceFormatter: percent ? (p) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%` : (p) => p.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    },
  });
  addToolbar(el, chart, { log: !percent }); // log scale makes no sense for % change
  // A chart built on a hidden tab has zero width, so its first fit is wrong. Re-fit when it first shows up.
  let wasHidden = el.clientWidth === 0;
  new ResizeObserver(() => {
    if (wasHidden && el.clientWidth > 0) {
      wasHidden = false;
      requestAnimationFrame(() => chart.timeScale().fitContent());
    } else if (el.clientWidth === 0) {
      wasHidden = true;
    }
  }).observe(el);
  return chart;
}

function addToolbar(el, chart, { log }) {
  const bar = document.createElement("div");
  bar.className = "chart-tools";
  bar.innerHTML = `<button data-a="auto" title="Auto-fit prices (turns off when you drag the price axis)">AUTO</button>
    ${log ? `<button data-a="log" title="Logarithmic price scale">LOG</button>` : ""}
    <button data-a="reset" title="Reset view: fit all data, auto prices">⟲</button>`;
  el.appendChild(bar);
  const ps = () => chart.priceScale("right");
  const sync = () => {
    const o = ps().options();
    bar.querySelector('[data-a="auto"]').classList.toggle("on", o.autoScale);
    bar.querySelector('[data-a="log"]')?.classList.toggle("on", o.mode === 1);
  };
  bar.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "auto") ps().applyOptions({ autoScale: !ps().options().autoScale });
    if (a === "log") ps().applyOptions({ mode: ps().options().mode === 1 ? 0 : 1 });
    if (a === "reset") { ps().applyOptions({ autoScale: true }); chart.timeScale().fitContent(); }
    sync();
  });
  // Dragging the price axis switches AUTO off inside the library; reflect that on the button.
  el.addEventListener("pointerup", () => setTimeout(sync, 0));
  el.addEventListener("dblclick", () => setTimeout(sync, 0));
  sync();
}

export function candles(chart, decimals = 2) {
  return chart.addCandlestickSeries({
    upColor: COLORS.up, downColor: COLORS.down, wickUpColor: COLORS.up, wickDownColor: COLORS.down,
    borderVisible: false, priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals },
  });
}
