# Form Autofill

A Chrome extension that auto-fills hotel guest registration forms on [pathik.guru](https://pathik.guru) (and any other configured site).

Guest data is stored from your hotel management system via a simple JavaScript API, then recalled through a right-click context menu.

---

## Features

- **Right-click → Autofill Form** — hover to see a submenu of saved guest entries (newest first)
- **Stores up to 5 entries** in a circular buffer (oldest overwritten automatically)
- **Duplicate detection** — rejects entries with the same guest name + check-in date
- **Lazy-loaded dropdown support** — handles Bootstrap Select dropdowns for `country`, `state`, and `doc_type` with search-based selection and proper dependency ordering (country fills before state loads)
- **Select validation** — checks dropdown values against actual `<select>` options on the page before saving, returning a clear error if invalid
- **Works on any website** — fills any form field whose `name` attribute matches the data key
- **Configurable allowed sites** — includes `pathik.guru` and `localhost` by default
- **Extension detection API** — check if the extension is installed via `window.formAutofill.isInstalled`
- **Settings page** — manage allowed sites, preview stored entries, load test data, developer guide, and help

---

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `pathik-autofill` folder
5. The extension is now active

> To open Settings: right-click the extension icon → **Options**

---

## Usage

### 1 — Store guest data from your system

Call `window.formAutofill` from any client component on an allowed site:

```js
try {
  await window.formAutofill({
    data: {
      prefix: 'Ms',
      first_name: 'Kajal',
      middle_name: 'Khengar',
      last_name: 'Gangani',
      email: 'guest@example.com',
      mobile_no: '9820355183',
      phone_no: '9820355183',
      dob: '05-05-1993',
      address: '123 Main St',
      locality: 'Thane',
      city: 'Thane',
      district: 'Thane',
      zip_code: '400604',
      country: 'india',
      state: 'maharashtra',
      coming_from: 'Thane',
      going_to: 'Thane',
      doc_type: 'aadhar card',
      doc_no: '270715127847',
      room_no: '306',
      checkin_date: '03-06-2023',
      checkin_time: '14:00',
      child: 0,
      adult: 2,
      vehicle_type: 'Other',
      vehicle_registration_no: '',
      other_guests: [
        {
          other_full_name: 'Bhavesh Tank',
          other_mobile_number: '9820355183',
          other_doc_type: 'aadhar card',
          other_document_number: '958952493001',
        },
      ],
    },
  });
} catch (err) {
  if (err.message === 'data exist') {
    // same name + check-in date already stored
  }
  if (err.message.includes('not a valid option')) {
    // a select field value didn't match any option on the page
  }
}
```

### 2 — Fill the form

1. Navigate to pathik.guru (or any allowed site)
2. **Right-click** anywhere on the page
3. Hover over **Autofill Form**
4. Click a guest entry from the submenu
5. All matching form fields are filled automatically

---

## API Reference

### `window.formAutofill({ data })`

Saves a guest entry. Returns a Promise.

| Outcome                               | Result                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Entry saved                           | `Promise` resolves `{ success: true }`                                 |
| Duplicate (same name + check-in date) | `Promise` rejects `Error("data exist")`                                |
| Select value not in page options      | `Promise` rejects `Error('"value" is not a valid option for "field"')` |
| Timeout after 10 s                    | `Promise` rejects `Error("Form Autofill: request timed out")`          |

### `window.formAutofill.getEntries()`

Retrieves all currently stored entries. Returns a Promise.

```js
const { entries } = await window.formAutofill.getEntries();
// entries: array of guest objects, oldest first
```

| Outcome           | Result                                                           |
| ----------------- | ---------------------------------------------------------------- |
| Success           | `Promise` resolves `{ entries: [...] }`                          |
| Timeout after 5 s | `Promise` rejects `Error("Form Autofill: getEntries timed out")` |

### Detection properties

```js
if (window.formAutofill?.isInstalled) {
  // extension is active
}
console.log(window.formAutofill.version); // "1.0.0"
```

| Property                          | Value     |
| --------------------------------- | --------- |
| `window.formAutofill.isInstalled` | `true`    |
| `window.formAutofill.version`     | `"1.0.0"` |

---

## Storage

**Capacity:** Up to 5 entries in `chrome.storage.local`. The 6th entry overwrites the oldest (circular buffer).

**Duplicate check:** compares `first_name + middle_name + last_name + checkin_date` (case-insensitive).

**Form filling:** Every data key is filled into the form control (`input`, `select`, `textarea`) whose `name` attribute matches it, falling back to `id`. Keys with no matching field are skipped, so new fields work without extension changes. Radio groups are matched by value or label text. A lone checkbox is checked by a truthy value (`false`/`0`/`no`/`off` unchecks it), and a checkbox group takes an array of values. An array of objects (e.g. `other_guests`) fills repeated rows named `field_N` (1-based), `key[i][field]`, or the i-th `field[]`. Works on any website, not just pathik.guru.

**Lazy-loaded dropdowns:** `country`, `state`, and `doc_type` are filled via search-based dropdown interaction to handle Bootstrap Select widgets. `country` is always filled before `state` so that state options load correctly from the AJAX cascade.

---

## Settings Page

Open via: right-click extension icon → **Options**

| Tab                 | Description                                                                            |
| ------------------- | -------------------------------------------------------------------------------------- |
| **General**         | Preview stored entries as expandable cards; load 3 sample guests or clear all entries  |
| **Settings**        | Add or remove allowed websites (supports `localhost` and any valid domain)             |
| **Developer Guide** | Full API usage example, `getEntries()` docs, return value table, and storage behaviour |
| **Help**            | Step-by-step usage guide and troubleshooting FAQ                                       |

### Entry cards

The General tab renders each stored entry as a collapsible card showing the guest name and check-in date. Click a card to expand it and view all stored fields, including any additional guests.

---

## File Structure

```
pathik-autofill/
├── manifest.json        # Chrome MV3 manifest
├── background.js        # Service worker — storage, context menu, circular buffer
├── injected.js          # MAIN world — exposes window.formAutofill() and .getEntries()
├── content.js           # ISOLATED world — bridges API calls, validates selects, fills form fields
├── styles.css           # Toast notification styles
├── options.html         # Settings page markup (General, Settings, Developer Guide, Help tabs)
├── options.js           # Settings page logic — site management, entry cards, test data
├── options.css          # Settings page styles
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Development

**Regenerate icons** (requires Node.js):

```bash
node generate_icons.js
```

**Reload extension after changes:**
Go to `chrome://extensions` → click the reload ↺ icon on Form Autofill, then refresh any open tabs you want to test on.

**Test without a PMS:** Open **Options → General** and click **Load Sample Data** to populate 3 sample guest entries (Kajal Gangani, Ravi Sharma, Priya Patel) directly in storage.

---

## License

MIT
