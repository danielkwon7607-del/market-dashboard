// Fetch JSON from the local backend and poll it on an interval.
export async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `${url} → HTTP ${r.status}`);
  return body;
}

// Calls onData(json) now and every `ms`; onError(err) on failures. Returns a stop() fn.
export function poll(url, ms, onData, onError = console.error) {
  let timer;
  const tick = async () => {
    try { onData(await getJSON(url)); } catch (e) { onError(e); }
    timer = setTimeout(tick, ms);
  };
  tick();
  return () => clearTimeout(timer);
}
