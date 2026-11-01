// Rotating macro ticker. Items come from /api/macro; each one cycles through its `phrases`.
// An item flashes when its value changes or when a matching headline arrives (via the bus).
import { poll } from "../lib/api.js";
import { on } from "../lib/bus.js";
import { esc, arrow } from "../lib/format.js";

const REFRESH_MS = 30_000;
const PX_PER_SEC = 55;
const HEADLINE_MAX_AGE_H = 12;
const state = new Map(); // id -> { item, idx, nextAt, override, related }
let root, track, ids = "";

// Earnings items have no config keywords; match the symbol or the company's first name word.
function matcherFor(it) {
  if (it.kind !== "earnings") return null;
  const sym = it.id.slice(4).replace(".", "\\.");
  const word = (it.phrases[0] || "").split(/[\s,.]+/)[0];
  const generic = /^(advanced|american|general|united|first|international|national|global|the)$/i;
  const alts = [sym, word.length > 3 && !generic.test(word) ? word : null].filter(Boolean);
  return new RegExp(`\\b(${alts.join("|")})\\b`, "i");
}
const related = (n, id, s) => (n.ticker || []).includes(id) || (n.tickers || []).some((t) => `ERN:${t.symbol}` === id) || (s.match && s.match.test(n.title));

const els = (id) => root.querySelectorAll(`.tk[data-id="${CSS.escape(id)}"]`);

function itemHTML(it) {
  return `<div class="tk ${it.kind === "earnings" ? "tk-earn" : ""}" data-id="${esc(it.id)}">
    <span class="tk-label">${esc(it.label)}</span>
    <span class="tk-value num"></span>
    <span class="tk-change num"></span>
    <span class="tk-phrase"></span>
  </div>`;
}

function phrasesOf(s) {
  const list = s.item.phrases.map((text) => ({ text, cls: "" }));
  if (s.related) list.push({ text: `▸ ${s.related}`, cls: "hot" });
  return list;
}

function paint(id, { phrase = true } = {}) {
  const s = state.get(id);
  const it = s.item;
  const list = phrasesOf(s);
  const cur = s.override && s.override.until > Date.now() ? s.override : list[s.idx % Math.max(list.length, 1)];
  const width = Math.min(46, Math.max(12, ...list.map((p) => p.text.length), s.override ? s.override.text.length : 0));
  els(id).forEach((el) => {
    el.querySelector(".tk-value").textContent = it.value;
    const ch = el.querySelector(".tk-change");
    ch.className = `tk-change num ${it.dir}`;
    ch.textContent = it.change ? `${it.dir === "flat" ? "" : arrow(it.dir) + " "}${it.change}` : "";
    const ph = el.querySelector(".tk-phrase");
    ph.style.width = `${(width * 1.03 + 1).toFixed(1)}ch`; // + letter-spacing slack
    if (phrase && cur) {
      ph.textContent = cur.text;
      ph.className = `tk-phrase ${cur.cls || ""}`;
      ph.title = cur.text;
    }
  });
}

function flash(id, kind) {
  els(id).forEach((el) => {
    el.classList.remove("flash-up", "flash-down", "flash-news");
    void el.offsetWidth; // restart the animation
    el.classList.add(`flash-${kind}`);
  });
}

function rotate() {
  const now = Date.now();
  for (const [id, s] of state) {
    if (now < s.nextAt) continue;
    s.nextAt = now + 5000 + Math.random() * 3000;
    if (s.override && s.override.until <= now) s.override = null;
    if (s.override) continue;
    s.idx++;
    els(id).forEach((el) => el.querySelector(".tk-phrase").classList.add("swap"));
    setTimeout(() => {
      paint(id);
      els(id).forEach((el) => el.querySelector(".tk-phrase").classList.remove("swap"));
    }, 350);
  }
}

function build(items) {
  const html = items.map(itemHTML).join("");
  root.innerHTML = `<div class="ticker-track">${html}${html}</div>`;
  track = root.firstElementChild;
  items.forEach((it) => paint(it.id));
  requestAnimationFrame(() => {
    track.style.setProperty("--dur", `${Math.round(track.scrollWidth / 2 / PX_PER_SEC)}s`);
  });
}

function update(data) {
  const items = data.items;
  const nextIds = items.map((i) => i.id).join("|");
  const first = state.size === 0;
  for (const it of items) {
    const prev = state.get(it.id);
    if (!prev) {
      state.set(it.id, { item: it, idx: 0, nextAt: Date.now() + Math.random() * 6000, override: null, related: null, match: matcherFor(it) });
      continue;
    }
    const changed = prev.item.value !== it.value;
    const old = prev.item.value;
    prev.item = it;
    if (changed && !first) {
      prev.override = { text: `UPDATED · WAS ${old}`, cls: "fresh", until: Date.now() + 20_000 };
      flash(it.id, it.dir === "down" ? "down" : "up");
    }
  }
  if (nextIds !== ids) {
    ids = nextIds;
    build(items);
  } else {
    items.forEach((it) => paint(it.id));
  }
}

// Latest related headline becomes one of the rotating phrases.
on("news:all", (items) => {
  const cutoff = Date.now() - HEADLINE_MAX_AGE_H * 3600e3;
  for (const [id, s] of state) {
    const hit = items.find((n) => related(n, id, s) && new Date(n.published) > cutoff);
    s.related = hit ? hit.title : null;
  }
});

// Brand-new headline: flash the matching items and show it right away.
on("news:new", (items) => {
  for (const n of items) {
    for (const [id, s] of state) {
      if (!related(n, id, s)) continue;
      s.related = n.title;
      s.override = { text: `▸ ${n.title}`, cls: "hot", until: Date.now() + 45_000 };
      paint(id);
      flash(id, "news");
    }
  }
});

export function init(el) {
  root = el;
  root.innerHTML = `<div class="ticker-track"><div class="tk"><span class="tk-label">LOADING MACRO TAPE…</span></div></div>`;
  poll("/api/macro", REFRESH_MS, update, (e) => console.warn("ticker", e));
  setInterval(rotate, 1000);
}
