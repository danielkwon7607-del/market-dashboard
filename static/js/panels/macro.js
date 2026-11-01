// Macro board: every FRED print from /api/macro as a tile (value, trend, prior, next release),
// plus a compact cross-asset quote strip.
import { subscribe } from "../lib/store.js";
import { esc, arrow } from "../lib/format.js";

export function init(root) {
  root.innerHTML = `
    <div class="panel-head"><span class="panel-title">MACRO</span><span class="panel-sub brandline">Fed · inflation · jobs · growth · rates (FRED, BLS, BEA)</span><div class="spacer"></div><span class="panel-sub upd"></span></div>
    <div class="macro-body"><div class="skeleton"></div><div class="skeleton"></div></div>`;
  const body = root.querySelector(".macro-body");
  subscribe("/api/macro", 60_000, (d) => {
    const macro = d.items.filter((i) => i.source === "FRED");
    const market = d.items.filter((i) => i.source === "Yahoo");
    const nextOf = (i) => i.phrases.find((p) => p.startsWith("NEXT "));
    body.innerHTML = `
      <div class="mt-grid">${macro.map((i) => {
        const next = nextOf(i);
        const rest = i.phrases.filter((p) => p !== next);
        return `<div class="mt">
          <div class="mt-k">${esc(i.label)}<span>${esc(i.change)}</span></div>
          <div class="mt-v num">${esc(i.value)} <span class="mt-dir ${i.dir}">${i.dir === "flat" ? "" : arrow(i.dir)}</span></div>
          ${rest.map((p) => `<div class="mt-p">${esc(p)}</div>`).join("")}
          ${next ? `<div class="mt-next">${esc(next)}</div>` : ""}
        </div>`;
      }).join("")}</div>
      <div class="mq-strip">${market.map((i) => `<div class="mq"><span class="mq-k">${esc(i.label)}</span><span class="num">${esc(i.value)}</span><span class="num ${i.dir}">${esc(i.change)}</span></div>`).join("")}</div>`;
    root.querySelector(".upd").textContent = `updated ${new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })} ET`;
  });
}
