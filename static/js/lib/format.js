export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const dirOf = (v, eps = 0.005) => (v == null || Math.abs(v) < eps ? "flat" : v > 0 ? "up" : "down");

export function pct(v, dec = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  const s = Math.abs(v).toFixed(dec);
  return (v > 0 ? "+" : v < 0 ? "−" : "") + s + "%";
}

export function price(v, dec = 2) {
  return v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export const arrow = (d) => (d === "up" ? "▲" : d === "down" ? "▼" : "■");

export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const etFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
export const etTime = (d) => etFmt.format(d);

// Inline SVG sparkline (single series, no legend needed).
export function spark(values, { w = 84, h = 30, dir } = {}) {
  if (!values || values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`);
  const d = dir || (values.at(-1) >= values[0] ? "up" : "down");
  const c = d === "up" ? "var(--up)" : "var(--down)";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <polyline points="${pts.join(" ")}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// Shared hover tooltip.
const tip = () => document.getElementById("tooltip");
export function showTip(html, ev) {
  const t = tip();
  t.innerHTML = html;
  t.hidden = false;
  const pad = 14, r = t.getBoundingClientRect();
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}
export const hideTip = () => { tip().hidden = true; };
