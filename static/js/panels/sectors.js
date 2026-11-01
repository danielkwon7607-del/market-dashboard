// Sector tracker: benchmark cards, sorted diverging bars, and a sector × timeframe heatmap.
import { poll } from "../lib/api.js";
import { esc, pct, price, dirOf, spark, showTip, hideTip } from "../lib/format.js";

const REFRESH_MS = 60_000;
const STATUS_ICON = { LEADING: "▲▲", ADVANCING: "▲", FLAT: "■", DECLINING: "▼", LAGGING: "▼▼" };
// Heatmap poles: deeper than the text-green/red so light cell text stays readable.
const NEUTRAL = [27, 32, 43], UP = [14, 128, 106], DOWN = [186, 34, 48];

let root, data = null, tf = load("sectors.tf", "1D");

function load(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

const sectorsOnly = () => data.items.filter((i) => !i.benchmark);
const benches = () => data.items.filter((i) => i.benchmark);
const bySym = (s) => data.items.find((i) => i.symbol === s);

function cellColor(v, max) {
  if (v == null || !max) return `rgb(${NEUTRAL})`;
  const t = Math.min(1, Math.sqrt(Math.abs(v) / max)); // sqrt: small moves still show tint
  const pole = v >= 0 ? UP : DOWN;
  return `rgb(${NEUTRAL.map((n, i) => Math.round(n + (pole[i] - n) * t))})`;
}

function tipHTML(it) {
  const spy = bySym("SPY");
  const rows = data.timeframes.map((k) => {
    const v = it.returns[k];
    return `<div class="tr ${k === tf ? "on" : ""}"><span>${k}</span><span class="${dirOf(v)}">${pct(v)}</span></div>`;
  }).join("");
  const rel = spy && it.symbol !== "SPY" && it.returns[tf] != null
    ? `<div class="tr"><span>vs SPY ${tf}</span><span class="${dirOf(it.returns[tf] - spy.returns[tf])}">${pct(it.returns[tf] - spy.returns[tf])}</span></div>` : "";
  const st = it.status[tf] ? `<div class="tr"><span>Status</span><span>${it.status[tf]}</span></div>` : "";
  return `<h4>${esc(it.symbol)}<span>${esc(it.name)}</span></h4>
    <div class="tr"><span>Last</span><span>${price(it.price)}</span></div>${rows}${rel}${st}`;
}

function asOfLabel() {
  if (!data.asOf) return "";
  const d = new Date(data.asOf + "T12:00:00");
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const when = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  return data.asOf === todayET ? `LIVE · ${when}` : `AS OF ${when} CLOSE`;
}

function cards() {
  const b = benches().map((it) => {
    const v = it.returns[tf];
    return `<div class="card" data-sym="${it.symbol}">
      <div class="card-k">${it.symbol}<span>${esc(it.name)}</span></div>
      ${spark(it.spark)}
      <div><span class="card-v ${dirOf(v)}">${pct(v)}</span> <span class="card-p px">${price(it.price)}</span></div>
    </div>`;
  }).join("");

  const secs = sectorsOnly().filter((i) => i.returns[tf] != null).sort((a, z) => z.returns[tf] - a.returns[tf]);
  const ups = secs.filter((i) => i.returns[tf] > 0).length;
  const avg = (g) => { const xs = secs.filter((i) => i.group === g).map((i) => i.returns[tf]); return xs.reduce((a, x) => a + x, 0) / (xs.length || 1); };
  const spread = avg("cyclical") - avg("defensive");
  const tone = Math.abs(spread) < 0.15 ? "MIXED" : spread > 0 ? "RISK-ON" : "RISK-OFF";
  const meter = secs.map((i) => `<i class="${i.returns[tf] > 0 ? "u" : i.returns[tf] < 0 ? "d" : ""}" title="${i.symbol} ${pct(i.returns[tf])}"></i>`).join("");
  return `<div class="cards">${b}
    <div class="card" style="grid-template-columns:1fr">
      <div class="card-k">BREADTH<span>sectors up · ${tf}</span></div>
      <div><span class="card-v">${ups}<span class="dim">/${secs.length}</span></span>
        <span class="card-p">CYC−DEF <span class="${dirOf(spread)}">${pct(spread)}</span> · ${tone}</span></div>
      <div class="card-meter">${meter}</div>
    </div></div>`;
}

function bars() {
  const secs = sectorsOnly().filter((i) => i.returns[tf] != null).sort((a, z) => z.returns[tf] - a.returns[tf]);
  const spy = bySym("SPY")?.returns[tf];
  const max = Math.max(...secs.map((i) => Math.abs(i.returns[tf])), Math.abs(spy || 0)) * 1.08 || 1;
  const x = (v) => 50 + (v / max) * 50;
  const rows = secs.map((it) => {
    const v = it.returns[tf], st = it.status[tf] || "FLAT";
    const left = v >= 0 ? 50 : x(v), width = Math.abs(v) / max * 50;
    return `<div class="bar-row" data-sym="${it.symbol}">
      <span class="bar-sym">${it.symbol}</span>
      <span class="bar-name">${esc(it.name)}</span>
      <div class="bar-track"><div class="zero"></div>${spy != null ? `<div class="bench" style="left:${x(spy)}%"></div>` : ""}
        <div class="bar ${v >= 0 ? "pos" : "neg"}" style="left:50%;width:0" data-l="${left}" data-w="${width}"></div></div>
      <span class="bar-val ${dirOf(v)}">${pct(v)}</span>
      <span class="status st-${st}">${STATUS_ICON[st]} ${st}</span>
    </div>`;
  }).join("");
  return `<div class="box">
    <div class="box-head"><span>PERFORMANCE · ${tf}</span>
      <span class="legend"><span><span class="sw" style="background:var(--up)"></span>gain</span><span><span class="sw" style="background:var(--down)"></span>loss</span></span></div>
    <div class="bars">${rows}</div>
    ${spy != null ? `<div class="bench-note"><i></i> SPY ${pct(spy)} · bars right of the line are beating the S&amp;P</div>` : ""}
  </div>`;
}

function heatmap() {
  const tfs = data.timeframes;
  const secs = sectorsOnly().slice().sort((a, z) => (z.returns[tf] ?? -1e9) - (a.returns[tf] ?? -1e9));
  const all = [...secs, ...benches()];
  const max = Object.fromEntries(tfs.map((k) => [k, Math.max(...all.map((i) => Math.abs(i.returns[k] ?? 0)))]));
  const row = (it, cls = "") => `<tr class="${cls}" data-sym="${it.symbol}">
    <td class="rowh num">${it.symbol}<span>${esc(it.name)}</span></td>
    ${tfs.map((k) => `<td class="num ${k === tf ? "col-on" : ""}" data-sym="${it.symbol}" style="background:${cellColor(it.returns[k], max[k])}">${pct(it.returns[k], k === "1D" ? 2 : 1)}</td>`).join("")}
  </tr>`;
  return `<div class="box">
    <div class="box-head"><span>HEATMAP · ALL TIMEFRAMES</span>
      <span class="legend"><span>color scaled per column</span></span></div>
    <table class="heat">
      <thead><tr><th></th>${tfs.map((k) => `<th data-tf="${k}" class="${k === tf ? "on" : ""}">${k}</th>`).join("")}</tr></thead>
      <tbody>${secs.map((i) => row(i)).join("")}<tr class="sep"><td colspan="${tfs.length + 1}"></td></tr>${benches().map((i) => row(i, "bm")).join("")}</tbody>
    </table>
  </div>`;
}

function render(animate = true) {
  if (!data) return;
  root.querySelector(".seg").innerHTML = data.timeframes.map((k) => `<button data-tf="${k}" class="${k === tf ? "on" : ""}">${k === "1D" ? "1D" : k}</button>`).join("");
  root.querySelector(".asof").textContent = asOfLabel();
  root.querySelector(".sectors-body").innerHTML = cards() + `<div class="grid2">${bars()}${heatmap()}</div>`;
  const place = () => root.querySelectorAll(".bar").forEach((b) => { b.style.left = `${b.dataset.l}%`; b.style.width = `${b.dataset.w}%`; });
  if (animate) requestAnimationFrame(() => requestAnimationFrame(place)); else place();
}

export function init(el) {
  root = el;
  root.innerHTML = `
    <div class="panel-head">
      <span class="panel-title">SECTOR TRACKER</span>
      <span class="panel-sub brandline">SPDR SELECT SECTORS</span>
      <div class="seg" role="tablist"></div>
      <div class="spacer"></div>
      <span class="panel-sub asof"></span>
    </div>
    <div class="sectors-body"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tf]");
    if (!b) return;
    tf = b.dataset.tf;
    save("sectors.tf", tf);
    render();
  });
  root.addEventListener("mousemove", (e) => {
    const t = e.target.closest("[data-sym]");
    if (!t || !data) return hideTip();
    const it = bySym(t.dataset.sym);
    if (it) showTip(tipHTML(it), e);
  });
  root.addEventListener("mouseleave", hideTip);
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea") || !data) return;
    const i = Number(e.key) - 1;
    if (data.timeframes[i]) { tf = data.timeframes[i]; save("sectors.tf", tf); render(); }
  });

  poll("/api/sectors", REFRESH_MS, (d) => { const first = !data; data = d; render(first); }, (e) => {
    if (!data) root.querySelector(".sectors-body").innerHTML = `<div class="err">Sector data unavailable: ${esc(e.message)}</div>`;
  });
}
