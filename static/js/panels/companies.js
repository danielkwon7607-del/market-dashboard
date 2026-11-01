// Companies tab modules. All four read one shared /api/companies poll.
import { subscribe } from "../lib/store.js";
import { esc, pct, price, dirOf } from "../lib/format.js";
import { headline, tickerChips } from "../lib/news-ui.js";

const URL = "/api/companies";
const REFRESH_MS = 120_000;
const cap = (c) => (c >= 1e12 ? `$${(c / 1e12).toFixed(2)}T` : `$${Math.round(c / 1e9)}B`);
const day = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
const head = (title, sub, extra = "") => `<div class="panel-head"><span class="panel-title">${title}</span><span class="panel-sub brandline">${sub}</span><div class="spacer"></div>${extra}</div>`;
const quoteUrl = (s) => `https://finance.yahoo.com/quote/${encodeURIComponent(s.replace(".", "-"))}`;

// Faint tile tint by % move.
function tint(p) {
  if (p == null) return "transparent";
  const a = Math.min(0.42, Math.abs(p) / 6 * 0.42 + 0.05);
  return p >= 0 ? `rgba(31,191,117,${a})` : `rgba(255,77,77,${a})`;
}

export function initBoard(root) {
  root.innerHTML = head("MEGA-CAP BOARD", "largest US companies · today's move (these drive NQ/ES)") + `<div class="mc-grid"><div class="skeleton"></div></div>`;
  const grid = root.querySelector(".mc-grid");
  subscribe(URL, REFRESH_MS, (d) => {
    grid.innerHTML = d.board.map((r) => `
      <a class="mc" href="${quoteUrl(r.symbol)}" target="_blank" rel="noopener" style="background:${tint(r.pct)}" data-sym="${esc(r.symbol)}">
        <span class="mc-sym">${esc(r.symbol)}</span>
        <span class="mc-name">${esc(r.name)}</span>
        <span class="mc-row"><span class="num">${price(r.price)}</span><span class="num mc-pct ${dirOf(r.pct)}">${pct(r.pct)}</span></span>
        <span class="mc-cap num">${cap(r.cap)}</span>
      </a>`).join("");
  });
}

export function initEarnings(root) {
  let view = "upcoming", data = null;
  root.innerHTML = head("EARNINGS", "≥ $10B market cap", `<div class="seg seg-sm"><button data-v="upcoming">UPCOMING</button><button data-v="results">RESULTS</button></div>`) +
    `<div class="co-list"><div class="skeleton"></div></div>`;
  const list = root.querySelector(".co-list");
  const render = () => {
    root.querySelectorAll("[data-v]").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
    if (!data) return;
    const rows = data[view];
    if (!rows.length) { list.innerHTML = `<div class="empty">Nothing scheduled</div>`; return; }
    let out = "", lastDay = null;
    for (const r of rows) {
      if (r.date !== lastDay) { out += `<div class="co-day">${day(r.date)}</div>`; lastDay = r.date; }
      const right = view === "upcoming"
        ? `<span class="sess s-${r.session}">${r.session}</span><span class="num co-est">${r.eps_est ? `EST ${esc(r.eps_est)}` : "—"}</span>`
        : `<span class="num co-est">${esc(r.eps || "—")} <span class="dim">vs ${esc(r.eps_est || "—")}</span></span>
           <span class="bm ${r.beat == null ? "" : r.beat ? "beat" : "miss"}">${r.beat == null ? "—" : r.beat ? "BEAT" : "MISS"} ${r.surprise != null ? pct(r.surprise, 1) : ""}</span>`;
      const sent = view === "results" && r.beat != null ? (r.beat ? 1 : -1) : 0;
      out += `<div class="co-row">${tickerChips([{ symbol: r.symbol }], sent, true)}
        <span class="co-name">${esc(r.name)}<span class="num dim"> · ${cap(r.cap)}</span></span>${right}</div>`;
    }
    list.innerHTML = out;
  };
  root.querySelector(".seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]");
    if (b) { view = b.dataset.v; render(); }
  });
  render();
  subscribe(URL, REFRESH_MS, (d) => { data = d; render(); });
}

export function initDeals(root) {
  root.innerHTML = head("M&amp;A / DEALS", "acquisitions, mergers, takeovers · last 3 days") + `<div class="co-list"><div class="skeleton"></div></div>`;
  const list = root.querySelector(".co-list");
  subscribe(URL, REFRESH_MS, (d) => {
    list.innerHTML = d.deals.length ? d.deals.map((it) => headline({ ...it, tag: "deal" }, { showTag: false })).join("") : `<div class="empty">No deal headlines</div>`;
  });
}

export function initCompanyNews(root) {
  root.innerHTML = head("COMPANY NEWS", "headlines naming listed companies · green good / red bad") + `<div class="co-list tall"><div class="skeleton"></div></div>`;
  const list = root.querySelector(".co-list");
  subscribe(URL, REFRESH_MS, (d) => {
    list.innerHTML = d.news.length ? d.news.map((it) => headline({ ...it, tag: "company" }, { showTag: false })).join("") : `<div class="empty">No company headlines</div>`;
  });
}
