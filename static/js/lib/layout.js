// Modular boards: each tab is a 2-column grid (fill tabs stretch rows to the screen height). Modules snap in as half or full width,
// reorder by dragging the ⠿ grip, resize with the ◧ button. Layout is saved per browser.
const KEY = "layout.v4";

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

// Merge saved order/sizes with the module registry (new modules get appended).
function arrange(tabId, modules, saved) {
  const byId = Object.fromEntries(modules.map((m) => [m.id, m]));
  const out = [];
  for (const s of saved[tabId] || []) {
    if (byId[s.id]) { out.push({ ...byId[s.id], size: s.size === "full" ? "full" : "half" }); delete byId[s.id]; }
  }
  return out.concat(Object.values(byId));
}

export function mountTabs({ tabsEl, workspace, tabs, onSwitch }) {
  const saved = loadSaved();
  const boards = {};
  let active = saved.activeTab && tabs.some((t) => t.id === saved.activeTab) ? saved.activeTab : tabs[0].id;

  const persist = () => {
    for (const t of tabs) {
      saved[t.id] = [...boards[t.id].children].map((el) => ({ id: el.dataset.mod, size: el.dataset.size }));
    }
    saved.activeTab = active;
    save(saved);
  };

  for (const tab of tabs) {
    const board = document.createElement("div");
    board.className = `board ${tab.fill ? "fill" : ""}`;
    board.dataset.tab = tab.id;
    workspace.appendChild(board);
    boards[tab.id] = board;
    for (const m of arrange(tab.id, tab.modules, saved)) {
      const el = document.createElement("section");
      el.className = "module panel";
      el.dataset.mod = m.id;
      el.dataset.size = m.size;
      board.appendChild(el);
      m.init(el);
      addControls(el, persist);
    }
    enableDrag(board, persist);
  }

  const show = (id) => {
    active = id;
    tabsEl.innerHTML = tabs.map((t) => `<button role="tab" class="${t.id === id ? "on" : ""}" data-tab="${t.id}">${t.label}</button>`).join("");
    for (const [tid, b] of Object.entries(boards)) b.hidden = tid !== id;
    workspace.scrollTop = 0;
    persist();
    onSwitch?.(id);
  };
  tabsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) show(b.dataset.tab);
  });
  show(active);

  return {
    reset() { try { localStorage.removeItem(KEY); } catch { /* */ } location.reload(); },
  };
}

function addControls(el, persist) {
  const head = el.querySelector(".panel-head");
  if (!head) return;
  const grip = document.createElement("span");
  grip.className = "mod-grip";
  grip.title = "Drag to move";
  grip.textContent = "⠿";
  grip.draggable = true;
  head.prepend(grip);

  const size = document.createElement("button");
  size.className = "mod-size";
  const label = () => {
    size.textContent = el.dataset.size === "full" ? "◧ HALF" : "▭ FULL";
    size.title = el.dataset.size === "full" ? "Make half width" : "Make full width";
  };
  label();
  size.addEventListener("click", () => {
    el.dataset.size = el.dataset.size === "full" ? "half" : "full";
    label();
    persist();
  });
  head.appendChild(size);
}

function enableDrag(board, persist) {
  let dragging = null;
  board.addEventListener("dragstart", (e) => {
    const grip = e.target.closest?.(".mod-grip");
    if (!grip) return;
    dragging = grip.closest(".module");
    dragging.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragging.dataset.mod);
    e.dataTransfer.setDragImage(dragging, 24, 20);
  });
  board.addEventListener("dragover", (e) => {
    if (!dragging) return;
    e.preventDefault();
    const target = e.target.closest(".module");
    if (!target || target === dragging || target.parentElement !== board) return;
    const r = target.getBoundingClientRect();
    // Halves sit side by side, so split them left/right; full-width modules split top/bottom.
    const after = target.dataset.size === "half" ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    const ref = after ? target.nextElementSibling : target;
    if (ref !== dragging) board.insertBefore(dragging, ref);
  });
  const end = () => {
    if (!dragging) return;
    dragging.classList.remove("dragging");
    dragging = null;
    persist();
  };
  board.addEventListener("drop", (e) => { e.preventDefault(); end(); });
  board.addEventListener("dragend", end);
}
