// Shared rendering for headlines (news sidebar + company modules).
import { esc, ago, etTime } from "./format.js";

// Impact 0..1 -> hue 130 (green) .. 55 (yellow) .. 0 (red).
export const impactHue = (x) => Math.round(130 * (1 - Math.min(1, Math.max(0, x))));
const sentClass = (s) => (s > 0.2 ? "pos" : s < -0.2 ? "neg" : "neu");

export function tickerChips(tickers, sentiment = 0, big = false) {
  if (!tickers?.length) return "";
  return `<span class="tkrs">${tickers.map((t) => `<span class="tkr ${sentClass(sentiment)} ${big ? "big" : ""}">${esc(t.symbol)}</span>`).join("")}</span>`;
}

const BADGE = { fed: "FED", macro: "MACRO", company: "COMPANY", markets: "" };
const LEVEL_BARS = { LOW: 1, MEDIUM: 2, HIGH: 3 };

export function headline(it, { fresh = false, showTag = true } = {}) {
  const d = new Date(it.published);
  const hue = impactHue(it.impact ?? 0);
  const rail = it.tag === "company" ? `company ${sentClass(it.sentiment)}` : it.tag;
  const bars = LEVEL_BARS[it.level] || 1;
  return `<a class="ni ${rail} ${fresh ? "new" : ""} ${it.breaking ? "breaking" : ""}" style="--h:${hue}" href="${esc(it.link)}" target="_blank" rel="noopener" title="${esc(it.summary)}">
    <div class="ni-meta">
      ${it.breaking ? `<span class="badge brk">BREAKING</span>` : ""}
      ${showTag && BADGE[it.tag] ? `<span class="badge">${BADGE[it.tag]}</span>` : ""}
      <span class="imp" title="${it.level} impact">${[1, 2, 3].map((i) => `<i class="${i <= bars ? "on" : ""}"></i>`).join("")}</span>
      <span class="ni-src">${esc(it.source)}</span>
      <span class="ni-age num">${etTime(d)} · ${ago(it.published)}</span>
    </div>
    <div class="ni-title">${tickerChips(it.tickers, it.sentiment)}${esc(it.title)}</div>
  </a>`;
}
