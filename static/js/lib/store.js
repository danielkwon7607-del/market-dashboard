// Shared polling: several panels can subscribe to the same endpoint and it is fetched once.
import { getJSON } from "./api.js";

const feeds = new Map(); // url -> { subs: Set, last, timer, ms }

export function subscribe(url, ms, onData, onError = console.warn) {
  let f = feeds.get(url);
  if (!f) {
    f = { subs: new Set(), last: null, timer: null, ms };
    feeds.set(url, f);
    const tick = async () => {
      try {
        f.last = await getJSON(url);
        f.subs.forEach((s) => s.onData(f.last));
      } catch (e) {
        f.subs.forEach((s) => s.onError(e));
      }
      f.timer = setTimeout(tick, f.ms);
    };
    tick();
  } else if (f.last) {
    onData(f.last);
  }
  const sub = { onData, onError };
  f.subs.add(sub);
  return () => f.subs.delete(sub);
}
