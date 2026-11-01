// Live news sidebar. Newest first, Fed/macro highlighted, filter chips, auto-refresh.
import { poll } from "../lib/api.js";
import { emit } from "../lib/bus.js";
import { esc, ago, etTime } from "../lib/format.js";

const REFRESH_MS = 60_000;
const FILTERS = [["all", "ALL"], ["fed", "FED"], ["macro", "MACRO"], ["markets", "MARKETS"]];
const POLICY = /fomc|monetary|statement|minutes|federal funds|discount rate|powell|chair|beige book|projections/i;
const BADGE = { fed: "FED", macro: "MACRO", markets: "" };

let root, list, foot, items = [], filter = "all", seen = null, freshIds = new Set(), lastOk = null;

function render() {
  const counts = { all: items.length };
  for (const it of items) counts[it.tag] = (counts[it.tag] || 0) + 1;
  root.querySelector(".news-filters").innerHTML = FILTERS.map(([k, label]) =>
    `<button class="chip ${k} ${filter === k ? "on" : ""}" data-f="${k}">${label}<b>${counts[k] || 0}</b></button>`).join("");

  // Pin the latest policy-relevant Fed item (statements, minutes, speeches) over routine releases.
  const fed = items.find((i) => i.tag === "fed" && (POLICY.test(i.title) || i.source === "Fed Speeches")) || items.find((i) => i.tag === "fed");
  root.querySelector(".fed-pin").innerHTML = fed ? `<a href="${esc(fed.link)}" target="_blank" rel="noopener">
      <span class="fed-pin-k">LATEST FROM THE FED <span class="num">${ago(fed.published)} ago</span></span>
      <span class="fed-pin-t">${esc(fed.title)}</span></a>` : "";

  const shown = filter === "all" ? items : items.filter((i) => i.tag === filter);
  list.innerHTML = shown.length ? shown.map((it) => {
    const d = new Date(it.published);
    return `<a class="ni ${it.tag} ${freshIds.has(it.id) ? "new" : ""}" href="${esc(it.link)}" target="_blank" rel="noopener" title="${esc(it.summary)}">
      <div class="ni-meta">
        ${BADGE[it.tag] ? `<span class="badge">${BADGE[it.tag]}</span>` : ""}
        <span class="ni-src">${esc(it.source)}</span>
        <span class="ni-age num">${etTime(d)} · ${ago(it.published)}</span>
      </div>
      <div class="ni-title">${esc(it.title)}</div>
    </a>`;
  }).join("") : `<div class="empty">No headlines</div>`;
  freshIds.clear();
  renderFoot();
}

function renderFoot() {
  const s = lastOk ? Math.round((Date.now() - lastOk) / 1000) : null;
  foot.innerHTML = `<span>${s == null ? "connecting…" : `updated ${s}s ago`}</span><span>auto-refresh ${REFRESH_MS / 1000}s</span>`;
}

function update(data) {
  lastOk = Date.now();
  items = data.items;
  if (seen) {
    const fresh = items.filter((i) => !seen.has(i.id));
    fresh.forEach((i) => freshIds.add(i.id));
    if (fresh.length) emit("news:new", fresh);
  }
  seen = new Set(items.map((i) => i.id));
  emit("news:all", items);
  render();
}

export function init(el) {
  root = el;
  root.innerHTML = `
    <div class="panel-head news-head">
      <div style="display:flex;align-items:center;gap:10px"><span class="live-dot"></span><span class="panel-title">NEWS &amp; FED WIRE</span></div>
      <span class="panel-sub">newest first · ET</span>
    </div>
    <div class="fed-pin"></div>
    <div class="news-filters"></div>
    <div class="news-list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    <div class="news-foot"></div>`;
  list = root.querySelector(".news-list");
  foot = root.querySelector(".news-foot");
  root.querySelector(".news-filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    filter = b.dataset.f;
    render();
    list.scrollTop = 0;
  });
  poll("/api/news", REFRESH_MS, update, (e) => {
    foot.innerHTML = `<span class="down">feed error: ${esc(e.message)}</span>`;
  });
  setInterval(renderFoot, 1000);
}
