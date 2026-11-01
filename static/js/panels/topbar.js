// Session pills (RTH / Globex) and clocks. All times in New York.
import { getJSON } from "../lib/api.js";

function etParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { wd: p.weekday, min: (+p.hour % 24) * 60 + +p.minute };
}

function sessions() {
  const { wd, min } = etParts();
  const weekday = !["Sat", "Sun"].includes(wd);
  const rth = weekday && min >= 570 && min < 960;
  const pre = weekday && min >= 240 && min < 570;
  // CME equity futures: Sun 18:00 → Fri 17:00 ET, daily halt 17:00–18:00.
  const globex =
    (wd === "Sun" && min >= 1080) ||
    (["Mon", "Tue", "Wed", "Thu"].includes(wd) && !(min >= 1020 && min < 1080)) ||
    (wd === "Fri" && min < 1020);
  return [
    { label: rth ? "NYSE OPEN" : pre ? "PRE-MARKET" : "NYSE CLOSED", cls: rth ? "live" : pre ? "warn" : "" },
    { label: globex ? "GLOBEX OPEN" : "GLOBEX CLOSED", cls: globex ? "live" : "" },
  ];
}

export function init(el) {
  const clock = document.getElementById("clock");
  const zone = (tz) => new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  let fomc = "";
  const render = () => {
    el.innerHTML = sessions().map((s) => `<span class="pill ${s.cls}"><span class="dot"></span>${s.label}</span>`).join("") + fomc;
    clock.innerHTML = `<span class="alt">LDN <b>${zone("Europe/London")}</b></span><span class="alt">TYO <b>${zone("Asia/Tokyo")}</b></span><span>NY <b>${new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York" })}</b></span>`;
  };
  // Pull the "NEXT FOMC" phrase out of the macro feed for a header pill.
  getJSON("/api/macro").then((d) => {
    const ff = d.items.find((i) => i.id === "FEDFUNDS");
    const next = ff?.phrases.find((p) => p.startsWith("NEXT FOMC"));
    if (next) fomc = `<span class="pill warn"><span class="dot"></span>${next}</span>`;
  }).catch(() => {});
  render();
  setInterval(render, 1000);
}
