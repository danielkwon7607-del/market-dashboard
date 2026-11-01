// Performance tracker: benchmark cards, sorted diverging bars, and a symbol × timeframe heatmap.
// One engine, several instances: create({ endpoint: "/api/sectors" }) and create({ endpoint: "/api/em" }).
import { poll } from "../lib/api.js";
import { esc, pct, price, dirOf, spark, showTip, hideTip } from "../lib/format.js";

const REFRESH_MS = 60_000;
const STATUS_ICON = { LEADING: "▲▲", ADVANCING: "▲", FLAT: "■", DECLINING: "▼", LAGGING: "▼▼" };
// Heatmap poles: deeper than the text-green/red so light cell text stays readable.
const NEUTRAL = [27, 32, 43], UP = [14, 128, 106], DOWN = [186, 34, 48];

function load(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

function cellColor(v, max) {
  if (v == null || !max) return `rgb(${NEUTRAL})`;
  const t = Math.min(1, Math.sqrt(Math.abs(v) / max)); // sqrt: small moves still show tint
  const pole = v >= 0 ? UP : DOWN;
  return `rgb(${NEUTRAL.map((n, i) => Math.round(n + (pole[i] - n) * t))})`;
}

/**
 * opts: endpoint, title, sub, key (localStorage + keyboard), benchmark (symbol for the dashed line),
 *       spread: [groupA, groupB, label] for the breadth card (e.g. cyclical − defensive), hotkeys
 */
export function create(opts) {
  const o = { benchmark: "SPY", spread: null, hotkeys: false, ...opts };
  return (root) => {
    let data = null, tf = load(`${o.key}.tf`, "1D");
    const basket = () => data.items.filter((i) => !i.benchmark);
    const benches = () => data.items.filter((i) => i.benchmark);
    const bySym = (s) => data.items.find((i) => i.symbol === s);

    function tipHTML(it) {
      const bm = bySym(o.benchmark);
      const rows = data.timeframes.map((k) => {
        const v = it.returns[k];
        return `<div class="tr ${k === tf ? "on" : ""}"><span>${k}</span><span class="${dirOf(v)}">${pct(v)}</span></div>`;
      }).join("");
      const rel = bm && it.symbol !== o.benchmark && it.returns[tf] != null
        ? `<div class="tr"><span>vs ${o.benchmark} ${tf}</span><span class="${dirOf(it.returns[tf] - bm.returns[tf])}">${pct(it.returns[tf] - bm.returns[tf])}</span></div>` : "";
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

    const sorted = () => basket().filter((i) => i.returns[tf] != null).sort((a, z) => z.returns[tf] - a.returns[tf]);

    function cards() {
      const b = benches().map((it) => {
        const v = it.returns[tf];
        return `<div class="card" data-sym="${it.symbol}">
          <div class="card-k">${it.symbol}<span>${esc(it.name)}</span></div>
          ${spark(it.spark)}
          <div><span class="card-v ${dirOf(v)}">${pct(v)}</span> <span class="card-p px">${price(it.price)}</span></div>
        </div>`;
      }).join("");
      const secs = sorted();
      const ups = secs.filter((i) => i.returns[tf] > 0).length;
      let extra;
      if (o.spread) {
        const [a, z, label] = o.spread;
        const avg = (g) => { const xs = secs.filter((i) => i.group === g).map((i) => i.returns[tf]); return xs.reduce((s, x) => s + x, 0) / (xs.length || 1); };
        const spread = avg(a) - avg(z);
        const tone = Math.abs(spread) < 0.15 ? "MIXED" : spread > 0 ? "RISK-ON" : "RISK-OFF";
        extra = `${label} <span class="${dirOf(spread)}">${pct(spread)}</span> · ${tone}`;
      } else if (secs.length) {
        extra = `BEST ${secs[0].symbol} <span class="${dirOf(secs[0].returns[tf])}">${pct(secs[0].returns[tf], 1)}</span> · WORST ${secs.at(-1).symbol} <span class="${dirOf(secs.at(-1).returns[tf])}">${pct(secs.at(-1).returns[tf], 1)}</span>`;
      }
      const meter = secs.map((i) => `<i class="${i.returns[tf] > 0 ? "u" : i.returns[tf] < 0 ? "d" : ""}" title="${i.symbol} ${pct(i.returns[tf])}"></i>`).join("");
      return `<div class="cards">${b}
        <div class="card" style="grid-template-columns:1fr">
          <div class="card-k">BREADTH<span>up · ${tf}</span></div>
          <div><span class="card-v">${ups}<span class="dim">/${secs.length}</span></span> <span class="card-p">${extra || ""}</span></div>
          <div class="card-meter">${meter}</div>
        </div></div>`;
    }

    function bars() {
      const secs = sorted();
      const bm = bySym(o.benchmark)?.returns[tf];
      const max = Math.max(...secs.map((i) => Math.abs(i.returns[tf])), Math.abs(bm || 0)) * 1.08 || 1;
      const x = (v) => 50 + (v / max) * 50;
      const rows = secs.map((it) => {
        const v = it.returns[tf], st = it.status[tf] || "FLAT";
        const left = v >= 0 ? 50 : x(v), width = Math.abs(v) / max * 50;
        return `<div class="bar-row" data-sym="${it.symbol}">
          <span class="bar-sym">${it.symbol}</span>
          <span class="bar-name">${esc(it.name)}</span>
          <div class="bar-track"><div class="zero"></div>${bm != null ? `<div class="bench" style="left:${x(bm)}%"></div>` : ""}
            <div class="bar ${v >= 0 ? "pos" : "neg"}" style="left:50%;width:0" data-l="${left}" data-w="${width}"></div></div>
          <span class="bar-val ${dirOf(v)}">${pct(v)}</span>
          <span class="status st-${st}">${STATUS_ICON[st]} ${st}</span>
        </div>`;
      }).join("");
      return `<div class="box">
        <div class="box-head"><span>PERFORMANCE · ${tf}</span>
          <span class="legend"><span><span class="sw" style="background:var(--up)"></span>gain</span><span><span class="sw" style="background:var(--down)"></span>loss</span></span></div>
        <div class="bars">${rows}</div>
        ${bm != null ? `<div class="bench-note"><i></i> ${o.benchmark} ${pct(bm)} · bars right of the line are beating ${o.benchmark}</div>` : ""}
      </div>`;
    }

    function heatmap() {
      const tfs = data.timeframes;
      const secs = basket().slice().sort((a, z) => (z.returns[tf] ?? -1e9) - (a.returns[tf] ?? -1e9));
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
      root.querySelector(".seg").innerHTML = data.timeframes.map((k) => `<button data-tf="${k}" class="${k === tf ? "on" : ""}">${k}</button>`).join("");
      root.querySelector(".asof").textContent = asOfLabel();
      root.querySelector(".sectors-body").innerHTML = cards() + `<div class="grid2">${bars()}${heatmap()}</div>`;
      const place = () => root.querySelectorAll(".bar").forEach((b) => { b.style.left = `${b.dataset.l}%`; b.style.width = `${b.dataset.w}%`; });
      if (animate) requestAnimationFrame(() => requestAnimationFrame(place)); else place();
    }

    const setTf = (k) => { tf = k; save(`${o.key}.tf`, tf); render(); };

    root.classList.add("sectors");
    root.innerHTML = `
      <div class="panel-head">
        <span class="panel-title">${esc(o.title)}</span>
        <span class="panel-sub brandline">${esc(o.sub || "")}</span>
        <div class="seg" role="tablist"></div>
        <div class="spacer"></div>
        <span class="panel-sub asof"></span>
      </div>
      <div class="sectors-body"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;

    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-tf]");
      if (b) setTf(b.dataset.tf);
    });
    root.addEventListener("mousemove", (e) => {
      const t = e.target.closest("[data-sym]");
      if (!t || !data) return hideTip();
      const it = bySym(t.dataset.sym);
      if (it) showTip(tipHTML(it), e);
    });
    root.addEventListener("mouseleave", hideTip);
    if (o.hotkeys) {
      addEventListener("keydown", (e) => {
        if (e.target.closest("input, textarea") || !data || root.closest("[hidden]")) return;
        const k = data.timeframes[Number(e.key) - 1];
        if (k) setTf(k);
      });
    }

    poll(o.endpoint, REFRESH_MS, (d) => { const first = !data; data = d; render(first); }, (e) => {
      if (!data) root.querySelector(".sectors-body").innerHTML = `<div class="err">Data unavailable: ${esc(e.message)}</div>`;
    });
  };
}
