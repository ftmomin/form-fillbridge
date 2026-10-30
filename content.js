// Runs in ISOLATED world
// Responsibilities:
//   1. Bridge window.formAutofill() calls → background storage
//   2. Fill form fields when background sends FILL_FORM after a submenu click

// Bridge: injected.js (MAIN world) → background.js
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'FA_INJECTED_TO_CS') return;

  const { type, id, data } = event.data;

  if (type === 'GET_ENTRIES') {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'GET_ENTRIES' });
    } catch (err) {
      response = { error: err.message };
    }
    window.postMessage(
      {
        source: 'FA_CS_TO_INJECTED',
        id,
        success: !response?.error,
        entries: response?.entries ?? [],
        error: response?.error ?? null,
      },
      location.origin,
    );
    return;
  }

  if (type !== 'SAVE_ENTRY') return;

  // Reject save if any value doesn't match the actual page select options
  const invalid = invalidSelectField(data);
  if (invalid) {
    window.postMessage(
      {
        source: 'FA_CS_TO_INJECTED',
        id,
        success: false,
        error: `"${invalid.value}" is not a valid option for "${invalid.field}"`,
      },
      location.origin,
    );
    return;
  }

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'SAVE_ENTRY', data });
  } catch (err) {
    response = { success: false, error: err.message };
  }

  window.postMessage(
    {
      source: 'FA_CS_TO_INJECTED',
      id,
      success: response?.success ?? false,
      error: response?.error ?? null,
    },
    location.origin,
  );
});

// Fill form when user picks an entry from the context submenu
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FILL_FORM') {
    fillForm(message.entry).then((count) => {
      showToast(`Filled ${count} field${count !== 1 ? 's' : ''}`);
      sendResponse({ ok: true });
    });
    return true; // keep channel open for async response
  }
  return false;
});

// Keys that are internal / non-form fields — skip when filling
const SKIP_KEYS = new Set(['action', '_savedAt']);

// Fillable controls only — never buttons, file inputs, or non-form elements like <meta name>
const FORM_CONTROL =
  'input:not([type=file],[type=submit],[type=button],[type=reset],[type=image]), select, textarea';

// Fields whose options load lazily on click — click first, wait, then fill
const LAZY_FIELDS = new Set(['country', 'state', 'doc_type']);

// Processing order for lazy fields: state depends on country being selected first
const LAZY_ORDER = ['country', 'state', 'doc_type'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Returns { field, value } if any data key maps to a <select> on the page
// and the supplied value isn't a valid option; otherwise returns null.
function invalidSelectField(data) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    const el = findFields(key)[0];
    if (!el || el.tagName.toLowerCase() !== 'select') continue;
    const val = String(value).toLowerCase().trim();
    const ok = Array.from(el.options).some(
      (o) =>
        o.value.toLowerCase() === val || o.text.toLowerCase().trim() === val,
    );
    if (!ok) return { field: key, value };
  }
  return null;
}

function fillField(el, value) {
  if (!el || value === undefined || value === null) return false;

  const tag = el.tagName.toLowerCase();

  if (tag === 'select') {
    const val = String(value).toLowerCase().trim();
    const match = Array.from(el.options).find(
      (o) =>
        o.value.toLowerCase() === val || o.text.toLowerCase().trim() === val,
    );
    if (!match) return false;

    // Bootstrap Select: if the custom <a> items are in the DOM, click the
    // matching one — BS handles setting the native value and firing change.
    const bsWrapper = el.closest('.bootstrap-select');
    if (bsWrapper) {
      const matchText = match.text.toLowerCase().trim();
      const optEl = Array.from(
        bsWrapper.querySelectorAll('.dropdown-menu a[role="option"]'),
      ).find((a) => {
        const text = (a.querySelector('.text')?.textContent ?? a.textContent)
          .trim()
          .toLowerCase();
        return text === val || text === matchText;
      });
      if (optEl) {
        optEl.click();
        return true;
      }
    }

    // Fallback for non-BS selects or BS with un-rendered dropdown items.
    // Only fire change when the value actually changed; avoids triggering
    // cascade AJAX (e.g. country → state reload) when already correct.
    const prev = el.value;
    el.value = match.value;
    if (el.value !== prev) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  // React-aware: bypass synthetic event via native setter
  const proto =
    tag === 'textarea'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, String(value));
  else el.value = String(value);

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Click the visible control to open the dropdown
function triggerOpen(el) {
  const bsWrapper = el.closest('.bootstrap-select');
  if (bsWrapper) {
    const btn = bsWrapper.querySelector('button.dropdown-toggle');
    if (btn) { btn.click(); return; }
  }
  el.click();
  el.dispatchEvent(new Event('focus', { bubbles: true }));
}

// Close the dropdown without selecting anything
function triggerClose(el) {
  const bsWrapper = el.closest('.bootstrap-select');
  if (bsWrapper) {
    const btn = bsWrapper.querySelector('button.dropdown-toggle');
    const isOpen = bsWrapper.classList.contains('open') || bsWrapper.classList.contains('show');
    if (btn && isOpen) { btn.click(); return; }
  }
  // Escape key on the focused element closes most dropdown libraries
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
  );
  // Final fallback: click outside to dismiss
  document.body.click();
}

// Poll for the best visible (not filtered-out) dropdown option, up to `timeout` ms.
// When `value` is provided, prefers exact match > starts-with match > first visible.
// Bootstrap Select hides non-matching <li> elements when live-search filters — we must
// skip those hidden items and only return a truly visible option.
async function waitForFirstOption(container, timeout = 2000, value = '') {
  const deadline = Date.now() + timeout;
  const needle = value.trim().toLowerCase();
  while (Date.now() < deadline) {
    const items = container.querySelectorAll('.dropdown-menu a[role="option"]:not(.disabled)');
    const visible = Array.from(items).filter((a) => {
      const li = a.closest('li');
      return li && li.style.display !== 'none' && !li.classList.contains('d-none') && !li.classList.contains('hidden');
    });
    if (visible.length > 0) {
      if (!needle) return visible[0];
      const getText = (a) => (a.querySelector('.text')?.textContent ?? a.textContent).trim().toLowerCase();
      const exact = visible.find((a) => getText(a) === needle);
      if (exact) return exact;
      const startsWith = visible.find((a) => getText(a).startsWith(needle));
      return startsWith ?? visible[0];
    }
    await sleep(200);
  }
  return null;
}

// Open dropdown, type value into its search input, then click the first result
// if the filtered list has items; otherwise close the dropdown.
async function fillLazyField(el, value) {
  triggerOpen(el);
  await sleep(1000);

  const str = String(value);
  const bsWrapper = el.closest('.bootstrap-select');
  const container = bsWrapper ?? el.parentElement;

  const searchInput = container.querySelector(
    '.bs-searchbox input, .select2-search__field, input[type="search"]',
  );

  if (searchInput) {
    searchInput.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(searchInput, str);
    else searchInput.value = str;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    const firstItem = await waitForFirstOption(container, 2000, str);
    if (firstItem) {
      firstItem.click();
    } else {
      triggerClose(el);
    }
  } else {
    fillField(el, value);
  }
}

// All form controls with this name (radio/checkbox groups share one), else the one with this id.
// getElementsByName/getElementById need no selector escaping, so any key is safe.
function findFields(key) {
  const byName = [...document.getElementsByName(key)].filter((el) => el.matches(FORM_CONTROL));
  if (byName.length) return byName;
  const byId = document.getElementById(key);
  return byId?.matches(FORM_CONTROL) ? [byId] : [];
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || v === '';
const same = (a, b) => String(a).toLowerCase().trim() === String(b).toLowerCase().trim();

// Fill a set of same-named controls: radio group, checkbox(es), or a single field.
// click() (not .checked =) so frameworks see the input/change events.
function fillGroup(els, value) {
  const type = els[0].type;

  if (type === 'radio') {
    const el = els.find(
      (e) => same(e.value, value) || [...e.labels].some((l) => same(l.textContent, value)),
    );
    if (!el) return false;
    if (!el.checked) el.click();
    return true;
  }

  if (type === 'checkbox') {
    // Lone checkbox + scalar → on/off flag; otherwise check boxes whose value is listed
    const flag = els.length === 1 && !Array.isArray(value);
    const wanted = [value].flat();
    els.forEach((e) => {
      const on = flag
        ? !/^(false|0|no|off)$/i.test(String(value).trim())
        : wanted.some((v) => same(e.value, v));
      if (e.checked !== on) e.click();
    });
    return true;
  }

  return fillField(els[0], value);
}

// Repeated rows (e.g. other_guests: [{...}, {...}]) — row i's field is named
// field_N (1-based), key[i][field], or the i-th field[]
function fillRows(key, rows) {
  let filled = 0;
  rows.forEach((row, i) => {
    if (!isObject(row)) return;
    for (const [field, val] of Object.entries(row)) {
      if (isBlank(val) || typeof val === 'object') continue;
      const els = [
        findFields(`${field}_${i + 1}`),
        findFields(`${key}[${i}][${field}]`),
        findFields(`${field}[]`).slice(i, i + 1),
      ].find((e) => e.length);
      if (els && fillGroup(els, val)) filled++;
    }
  });
  return filled;
}

async function fillForm(data) {
  let filled = 0;
  const lazyMap = new Map(); // key → [el, value]
  const rowKeys = [];

  for (const [key, value] of Object.entries(data)) {
    if (SKIP_KEYS.has(key)) continue;
    if (isBlank(value)) continue;

    if (Array.isArray(value) && value.some(isObject)) {
      rowKeys.push(key);
      continue;
    }
    // ponytail: nested objects aren't mapped; flatten to key[sub] names if a form needs it
    if (isObject(value)) continue;

    const els = findFields(key);
    if (!els.length) continue;

    if (LAZY_FIELDS.has(key)) {
      lazyMap.set(key, [els[0], value]);
    } else {
      if (fillGroup(els, value)) filled++;
    }
  }

  // Process in dependency order: country must be selected before state loads
  for (const key of LAZY_ORDER) {
    if (!lazyMap.has(key)) continue;
    const [el, value] = lazyMap.get(key);
    await fillLazyField(el, value);
    filled++;
    // After country selects, wait for the state AJAX to finish loading
    if (key === 'country') await sleep(1500);
  }

  // Rows last, as before — gives the page time to render rows (e.g. after adult count changes)
  for (const key of rowKeys) filled += fillRows(key, data[key]);

  return filled;
}

// --- Toast ---

function showToast(msg) {
  document.querySelector('.form-autofill-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'form-autofill-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
