// Fear & Greed gauge pinned in the top bar (CNN stocks index + crypto index). Hover for detail.
import { subscribe } from "../lib/store.js";
import { esc, showTip, hideTip, spark } from "../lib/format.js";

const BANDS = [
  [25, "extreme fear", "#f23645"],
  [45, "fear", "#f0883e"],
  [55, "neutral", "#c9b458"],
  [75, "greed", "#7cc464"],
  [101, "extreme greed", "#22ab94"],
];
const band = (s) => BANDS.find(([max]) => s < max);
const color = (s) => band(s)[2];

export function init(el) {
  let data = null;
  const render = () => {
    const s = data?.stocks;
    if (!s) { el.innerHTML = `<span class="fg-k">FEAR &amp; GREED</span><span class="dim">—</span>`; return; }
    const v = Math.round(s.score), c = color(v), delta = s.previous.close != null ? v - Math.round(s.previous.close) : null;
    const cr = data.crypto;
    el.innerHTML = `
      <span class="fg-k">FEAR &amp; GREED</span>
      <span class="fg-v num" style="color:${c}">${v}</span>
      <span class="fg-r" style="color:${c}">${esc(s.rating.toUpperCase())}</span>
      <span class="fg-bar"><i style="left:${v}%"></i></span>
      ${delta != null ? `<span class="fg-d num ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}">${delta > 0 ? "▲" : delta < 0 ? "▼" : "■"}${Math.abs(delta)}</span>` : ""}
      ${cr ? `<span class="fg-c num" title="Crypto fear &amp; greed">₿ <b style="color:${color(cr.score)}">${Math.round(cr.score)}</b></span>` : ""}`;
  };
  const tip = () => {
    const s = data?.stocks;
    if (!s) return "";
    const p = s.previous;
    const row = (k, v) => v == null ? "" : `<div class="tr"><span>${k}</span><span style="color:${color(v)}">${Math.round(v)} · ${band(v)[1]}</span></div>`;
    const comps = s.components.map((c) => `<div class="tr"><span>${esc(c.label)}</span><span style="color:${color(c.score ?? 50)}">${esc((c.rating || "").toUpperCase())}</span></div>`).join("");
    const hist = s.history.map((h) => h[1]);
    return `<h4>CNN Fear &amp; Greed<span>0 = extreme fear · 100 = extreme greed</span></h4>
      ${row("Now", s.score)}${row("Prev close", p.close)}${row("1 week ago", p["1w"])}${row("1 month ago", p["1m"])}${row("1 year ago", p["1y"])}
      <div class="tip-spark">${spark(hist, { w: 240, h: 40, dir: hist.at(-1) >= hist[0] ? "up" : "down" })}<span>last ${hist.length} days</span></div>
      <div class="tip-sub">COMPONENTS</div>${comps}
      ${data.crypto ? `<div class="tip-sub">CRYPTO (alternative.me)</div>${row("Bitcoin F&amp;G", data.crypto.score)}` : ""}`;
  };
  el.addEventListener("mousemove", (e) => { const h = tip(); if (h) showTip(h, e); });
  el.addEventListener("mouseleave", hideTip);
  render();
  subscribe("/api/sentiment", 300_000, (d) => { data = d; render(); });
}
