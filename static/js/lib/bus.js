// Tiny event bus so panels can react to each other without importing each other.
// e.g. news emits "news:new" and the ticker flashes matching items.
const target = new EventTarget();
export const emit = (type, detail) => target.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => target.addEventListener(type, (e) => fn(e.detail));
