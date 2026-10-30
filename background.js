const STORAGE_KEY   = "form_autofill_entries";
const SITES_KEY     = "form_autofill_allowed_sites";
const MAX_ENTRIES   = 5;
const DEFAULT_SITES = ["pathik.guru", "localhost"];
const PARENT_ID     = "form_autofill";
const ENTRY_PREFIX  = "form_autofill_entry_";

// ── Initialization ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  initStorage().then(rebuildFullMenu);
});

chrome.runtime.onStartup.addListener(() => {
  rebuildFullMenu();
});

async function initStorage() {
  const r = await chrome.storage.local.get(SITES_KEY);
  if (!r[SITES_KEY]) {
    await chrome.storage.local.set({ [SITES_KEY]: DEFAULT_SITES });
  }
}

// Rebuild the entire context menu (parent + submenu) from current storage
async function rebuildFullMenu() {
  await chrome.contextMenus.removeAll();

  // Parent item — no documentUrlPatterns so it always appears
  chrome.contextMenus.create(
    { id: PARENT_ID, title: "Autofill Form", contexts: ["all"] },
    () => { if (chrome.runtime.lastError) {} }
  );

  const entries   = await getEntries();
  const displayed = [...entries].reverse(); // newest first

  if (displayed.length === 0) {
    chrome.contextMenus.create(
      { id: "form_autofill_empty", parentId: PARENT_ID, title: "No saved entries", enabled: false, contexts: ["all"] },
      () => { if (chrome.runtime.lastError) {} }
    );
  } else {
    displayed.forEach((entry, i) => {
      const name = [entry.prefix, entry.first_name, entry.middle_name, entry.last_name].filter(Boolean).join(" ") || "—";
      const date = entry.checkin_date ?? "—";
      chrome.contextMenus.create(
        { id: `${ENTRY_PREFIX}${i}`, parentId: PARENT_ID, title: `${name}  ·  Check-in: ${date}`, contexts: ["all"] },
        () => { if (chrome.runtime.lastError) {} }
      );
    });
  }
}

// Keep submenu in sync whenever entries or allowed sites change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[STORAGE_KEY] || changes[SITES_KEY])) {
    rebuildFullMenu();
  }
});

// ── Context menu click ────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);
  if (!id.startsWith(ENTRY_PREFIX)) return;

  const idx   = parseInt(id.replace(ENTRY_PREFIX, ""), 10);
  const entry = [...(await getEntries())].reverse()[idx];
  if (!entry || !tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "FILL_FORM", entry });
  } catch {
    // Content script not yet injected (tab predates the extension load) — inject now and retry
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["styles.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tab.id, { type: "FILL_FORM", entry });
    } catch (err) {
      console.error("Form FillBridge: could not reach content script", err);
    }
  }
});

// ── Message handler (window.formAutofill bridge + options page) ───────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ success: false, error: err.message }));
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case "SAVE_ENTRY":  return saveEntry(message.data);
    case "GET_ENTRIES": return { entries: await getEntries() };
    case "SITES_UPDATED": return { ok: true };
    default:            return { error: `Unknown type: ${message.type}` };
  }
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function getState() {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  return r[STORAGE_KEY] ?? { buffer: [], head: 0, count: 0 };
}

function makeKey(entry) {
  return [
    (entry?.first_name   ?? "").trim().toLowerCase(),
    (entry?.middle_name  ?? "").trim().toLowerCase(),
    (entry?.last_name    ?? "").trim().toLowerCase(),
    (entry?.checkin_date ?? ""),
  ].join("|");
}

async function saveEntry(data) {
  const { buffer, head, count } = await getState();

  const key = makeKey(data);
  for (let i = 0; i < count; i++) {
    const idx = (head - count + i + MAX_ENTRIES) % MAX_ENTRIES;
    if (makeKey(buffer[idx]) === key) throw new Error("data exist");
  }

  const newBuffer = [...buffer];
  newBuffer[head] = { ...data, _savedAt: Date.now() };

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      buffer: newBuffer,
      head:   (head + 1) % MAX_ENTRIES,
      count:  Math.min(count + 1, MAX_ENTRIES),
    },
  });
  return { success: true };
  // chrome.storage.onChanged fires automatically → rebuildFullMenu() is called
}

async function getEntries() {
  const { buffer, head, count } = await getState();
  return Array.from({ length: count }, (_, i) => {
    const idx = (head - count + i + MAX_ENTRIES) % MAX_ENTRIES;
    return buffer[idx];
  });
}
