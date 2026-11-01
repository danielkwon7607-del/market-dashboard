// Predictions: a simple model's projection for each upcoming macro print (lavender, dashed, "≈" — an
// estimate, not a fact), YOUR call (cyan, typed in), and the actual once released (white). The
// scorecard keeps track of who was closer. Saved server-side in data/predictions.json.
import { getJSON, postJSON } from "../lib/api.js";
import { esc } from "../lib/format.js";

const REFRESH_MS = 300_000;
// Units: "%", "K" signed change in thousands, "k" level in thousands, "bp" signed basis points.
const SUFFIX = { "%": "%", K: "K", k: "K", bp: "bp" };
function fmt(v, dec, unit) {
  if (v == null) return "—";
  const signed = unit === "K" || unit === "bp";
  const body = signed ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dec)}` : v.toFixed(dec);
  return body + (SUFFIX[unit] || "");
}
const when = (iso, days) => iso ? `${new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} · ${days === 0 ? "TODAY" : `${days}D`}` : "DATE TBA";

// Mini number line: last (gray), model (lavender diamond), yours (cyan dot).
function line(it) {
  const vals = [it.last.value, it.model, it.mine].filter((v) => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.02 || 1;
  const x = (v) => ((v - (lo - pad)) / ((hi + pad) - (lo - pad))) * 100;
  return `<div class="pl">
    <i class="pl-last" style="left:${x(it.last.value)}%" title="last"></i>
    ${it.model != null ? `<i class="pl-model" style="left:${x(it.model)}%" title="model"></i>` : ""}
    ${it.mine != null ? `<i class="pl-mine" style="left:${x(it.mine)}%" title="you"></i>` : ""}
  </div>`;
}

export function init(root) {
  let data = null;
  root.innerHTML = `
    <div class="panel-head">
      <span class="panel-title">PREDICTIONS</span>
      <span class="panel-sub brandline">estimates, not guarantees · your calls vs the model vs reality</span>
      <div class="spacer"></div><span class="pr-score"></span>
    </div>
    <div class="pr-body"><div class="skeleton"></div><div class="skeleton"></div></div>`;
  const body = root.querySelector(".pr-body");

  async function save(key, raw, input) {
    const mine = raw === "" || raw == null ? null : Number(raw);
    if (mine != null && !Number.isFinite(mine)) return;
    const status = input?.closest(".pr-you")?.querySelector(".pr-saved");
    try {
      await postJSON("/api/forecasts", { key, mine });
      if (status) { status.textContent = mine == null ? "cleared" : "saved ✓"; status.className = "pr-saved ok"; }
      refresh(true);
    } catch (e) {
      if (status) { status.textContent = e.message; status.className = "pr-saved bad"; }
    }
  }

  function render() {
    if (!data) return;
    const sc = data.score;
    root.querySelector(".pr-score").innerHTML = `<span class="sc-you">YOU ${sc.you}</span><span class="sc-model">MODEL ${sc.model}</span>${sc.tie ? `<span>TIE ${sc.tie}</span>` : ""}`;
    const f = data.fed;
    const fed = f ? `
      <div class="pr-fed">
        <div class="pr-fed-top">
          <span class="pr-k">FOMC · ${esc(new Date(f.meeting + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase())}</span>
          <span class="pr-dim">target ${f.target[0].toFixed(2)}–${f.target[1].toFixed(2)}% · EFFR ${f.effr.toFixed(2)}%</span>
        </div>
        <div class="pr-fed-row">
          <div class="pr-proj">
            <span class="pr-tag">MARKET-IMPLIED</span>
            <span class="pr-model-v">≈ ${f.implied_bp >= 0 ? "+" : "−"}${Math.abs(f.implied_bp).toFixed(0)}bp</span>
            <span class="pr-dim">≈ ${(f.prob * 100).toFixed(0)}% odds of a 25bp ${f.direction === "hold" ? "move" : f.direction.toUpperCase()} · ${esc(f.contract)}</span>
            <div class="pr-prob"><i style="width:${(f.prob * 100).toFixed(0)}%"></i></div>
          </div>
          <div class="pr-you">
            <span class="pr-tag you">YOUR CALL (bp)</span>
            <div class="pr-quick">${[-50, -25, 0, 25, 50].map((v) => `<button data-fed="${v}" class="${f.mine === v ? "on" : ""}" ${f.locked ? "disabled" : ""}>${v > 0 ? "+" : ""}${v}</button>`).join("")}</div>
            <span class="pr-saved"></span>
          </div>
        </div>
      </div>` : "";
    const rows = data.upcoming.map((it) => `
      <div class="pr-row">
        <div class="pr-name"><b>${esc(it.label)}</b><span>${esc(it.period_label)} · <em>${when(it.release, it.days)}</em></span></div>
        <div class="pr-last"><span class="pr-tag">LAST</span><span class="num">${fmt(it.last.value, it.decimals, it.unit)}</span></div>
        <div class="pr-proj" title="Model: ${esc(it.method)}"><span class="pr-tag">MODEL</span><span class="num pr-model-v">≈ ${fmt(it.model, it.decimals + 1, it.unit)}</span></div>
        <div class="pr-you"><span class="pr-tag you">YOU</span>
          <input class="num" type="number" step="${it.unit.toUpperCase() === "K" ? 1 : 0.1}" inputmode="decimal" data-key="${esc(it.key)}" value="${it.mine ?? ""}" placeholder="your call" ${it.locked ? "disabled" : ""}>
          <span class="pr-saved"></span></div>
        ${line(it)}
      </div>`).join("");
    const hist = data.history.length ? data.history.map((h) => `
      <div class="pr-h">
        <span class="pr-h-name"><b>${esc(h.label)}</b> ${esc(h.period_label)}</span>
        <span class="num pr-h-act">${fmt(h.actual, h.decimals, h.unit)}</span>
        <span class="num pr-model-v">≈ ${fmt(h.model, h.decimals + 1, h.unit)}</span>
        <span class="num pr-you-v">${h.mine == null ? "—" : fmt(h.mine, h.decimals + 1, h.unit)}</span>
        <span class="pr-win ${h.winner || ""}">${h.winner === "you" ? "YOU ✓" : h.winner === "model" ? "MODEL" : h.winner === "tie" ? "TIE" : "—"}</span>
      </div>`).join("") : `<div class="empty">Nothing resolved yet. Lock in calls above; results score themselves as each number is released.</div>`;
    body.innerHTML = `${fed}
      <div class="pr-legend"><span><i class="pl-last"></i>last print</span><span><i class="pl-model"></i>model (simple trend, ≈)</span><span><i class="pl-mine"></i>you</span></div>
      <div class="pr-list">${rows}</div>
      <div class="pr-sub">SCORECARD <span>actual · model · you · closer</span></div>
      <div class="pr-hist">${hist}</div>`;
  }

  body.addEventListener("change", (e) => {
    const inp = e.target.closest("input[data-key]");
    if (inp) save(inp.dataset.key, inp.value, inp);
  });
  body.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input[data-key]")) e.target.blur();
  });
  body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fed]");
    if (!b || !data?.fed) return;
    const v = Number(b.dataset.fed);
    save(data.fed.key, data.fed.mine === v ? null : v, b);
  });

  let timer;
  async function refresh(force = false) {
    clearTimeout(timer);
    try {
      const d = await getJSON("/api/forecasts");
      data = d;
      // Don't yank the input out from under you while you're typing.
      if (force || !root.contains(document.activeElement) || document.activeElement.tagName !== "INPUT") render();
    } catch (e) {
      if (!data) body.innerHTML = `<div class="err">Predictions unavailable: ${esc(e.message)}</div>`;
    }
    timer = setTimeout(refresh, REFRESH_MS);
  }
  refresh(true);
}
