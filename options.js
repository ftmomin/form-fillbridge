const SITES_KEY = 'form_autofill_allowed_sites';
const DEFAULT_SITES = ['pathik.guru'];

// --- Tab navigation ---

const navItems = document.querySelectorAll('.nav-item');
const tabs = document.querySelectorAll('.tab');

function activateTab(tabId) {
  navItems.forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === tabId),
  );
  tabs.forEach((t) => t.classList.toggle('active', t.id === `tab-${tabId}`));
}

navItems.forEach((btn) => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// Cross-tab links (e.g. Help → Settings)
document.querySelectorAll('[data-goto]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    activateTab(link.dataset.goto);
  });
});

// Default to first tab
activateTab('general');

// --- Allowed Sites ---

const siteInput = document.getElementById('site-input');
const addBtn = document.getElementById('add-btn');
const sitesList = document.getElementById('sites-list');
const siteError = document.getElementById('site-error');

async function getSites() {
  const result = await chrome.storage.local.get(SITES_KEY);
  return result[SITES_KEY] ?? [...DEFAULT_SITES];
}

async function saveSites(sites) {
  await chrome.storage.local.set({ [SITES_KEY]: sites });
  // Tell background to rebuild context menu with new patterns
  try {
    await chrome.runtime.sendMessage({ type: 'SITES_UPDATED' });
  } catch (_) {}
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSites(sites) {
  sitesList.innerHTML = '';

  if (sites.length === 0) {
    sitesList.innerHTML =
      '<li class="sites-empty">No allowed sites. Add one above.</li>';
    return;
  }

  sites.forEach((site, i) => {
    const li = document.createElement('li');
    li.className = 'site-item';
    li.innerHTML = `
      <span class="site-domain">${escapeHtml(site)}</span>
      <button class="btn btn-remove" data-idx="${i}" title="Remove site" aria-label="Remove ${escapeHtml(site)}">✕</button>
    `;
    li.querySelector('.btn-remove').addEventListener('click', async () => {
      const current = await getSites();
      current.splice(i, 1);
      await saveSites(current);
      renderSites(current);
    });
    sitesList.appendChild(li);
  });
}

function showError(msg) {
  siteError.textContent = msg;
  siteError.classList.remove('hidden');
  clearTimeout(showError._timer);
  showError._timer = setTimeout(() => siteError.classList.add('hidden'), 3500);
}

function normalizeDomain(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, ''); // strip port (e.g. localhost:5000 → localhost)
}

async function handleAddSite() {
  const raw = siteInput.value.trim();
  if (!raw) {
    showError('Please enter a domain.');
    return;
  }

  const domain = normalizeDomain(raw);
  if (!/^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,})$/.test(domain)) {
    showError('Enter a valid domain (e.g. pathik.guru or localhost).');
    return;
  }

  const sites = await getSites();
  if (sites.includes(domain)) {
    showError('This site is already in the list.');
    return;
  }

  sites.push(domain);
  await saveSites(sites);
  renderSites(sites);
  siteInput.value = '';
  siteInput.focus();
}

addBtn.addEventListener('click', handleAddSite);
siteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAddSite();
});

// Load sites on page open
getSites().then(renderSites);

// --- General tab: Test Data ---

const STORAGE_KEY = 'form_autofill_entries';
const MAX_ENTRIES = 5;

const SAMPLE_GUESTS = [
  {
    prefix: 'Ms',
    first_name: 'Kajal',
    middle_name: 'Khengar',
    last_name: 'Gangani',
    email: 'kajal.gangani@example.com',
    mobile_no: '9820355183',
    phone_no: '9820355183',
    dob: '05-05-1993',
    address: 'DO Khengar Gangani, Dharamveer Anand CHS',
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
  {
    first_name: 'Ravi',
    last_name: 'Sharma',
    email: 'ravi.sharma@example.com',
    mobile_no: '9876543210',
    phone_no: '9876543210',
    dob: '15-08-1985',
    address: '42 MG Road',
    locality: 'Bandra',
    city: 'Mumbai',
    district: 'Mumbai',
    zip_code: '400050',
    country: 'india',
    state: 'maharashtra',
    coming_from: 'Pune',
    going_to: 'Mumbai',
    doc_type: 'passport no',
    doc_no: 'Z1234567',
    room_no: '101',
    checkin_date: '10-07-2023',
    checkin_time: '12:00',
    child: 1,
    adult: 1,
    vehicle_type: 'Car',
    vehicle_registration_no: 'MH04AB1234',
    other_guests: [],
  },
  {
    first_name: 'Priya',
    last_name: 'Patel',
    email: 'priya.patel@example.com',
    mobile_no: '9988776655',
    phone_no: '9988776655',
    dob: '22-11-1990',
    address: '7 Sardar Nagar',
    locality: 'Navrangpura',
    city: 'Ahmedabad',
    district: 'Ahmedabad',
    zip_code: '380009',
    country: 'india',
    state: 'gujarat',
    coming_from: 'Rajkot',
    going_to: 'Ahmedabad',
    doc_type: 'driving license',
    doc_no: 'GJ0120130012345',
    room_no: '204',
    checkin_date: '18-08-2023',
    checkin_time: '15:00',
    child: 0,
    adult: 1,
    vehicle_type: 'Bike',
    vehicle_registration_no: 'GJ01CD5678',
    other_guests: [],
  },
];

function buildState(guests) {
  const buffer = guests.map((g) => ({ ...g, _savedAt: Date.now() }));
  return { buffer, head: buffer.length % MAX_ENTRIES, count: buffer.length };
}

const loadBtn = document.getElementById('load-samples-btn');
const clearBtn = document.getElementById('clear-data-btn');
const testStatus = document.getElementById('test-status');
const entriesDiv = document.getElementById('current-entries');

function showTestStatus(msg, isError = false) {
  testStatus.textContent = msg;
  testStatus.className = 'test-status' + (isError ? ' error' : ' success');
  clearTimeout(showTestStatus._t);
  showTestStatus._t = setTimeout(() => {
    testStatus.className = 'test-status hidden';
  }, 3500);
}

const FIELD_LABELS = {
  prefix: 'Prefix',
  first_name: 'First Name',
  middle_name: 'Middle Name',
  last_name: 'Last Name',
  email: 'Email',
  mobile_no: 'Mobile',
  phone_no: 'Phone',
  dob: 'Date of Birth',
  address: 'Address',
  locality: 'Locality',
  city: 'City',
  district: 'District',
  zip_code: 'ZIP Code',
  country: 'Country',
  state: 'State',
  coming_from: 'Coming From',
  going_to: 'Going To',
  doc_type: 'Document Type',
  doc_no: 'Document No.',
  room_no: 'Room No.',
  checkin_date: 'Check-in Date',
  checkin_time: 'Check-in Time',
  child: 'Children',
  adult: 'Adults',
  vehicle_type: 'Vehicle Type',
  vehicle_registration_no: 'Vehicle Reg. No.',
};

async function renderEntries() {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  const state = r[STORAGE_KEY] ?? { buffer: [], head: 0, count: 0 };
  const { buffer, head, count } = state;

  if (count === 0) {
    entriesDiv.innerHTML = "<p class='no-entries'>No entries stored.</p>";
    return;
  }

  const label = document.createElement('p');
  label.className = 'entries-label';
  label.textContent = `Stored entries (${count}/5):`;

  const listEl = document.createElement('div');
  listEl.className = 'entries-list';

  for (let i = 0; i < count; i++) {
    const idx = (head - count + i + MAX_ENTRIES) % MAX_ENTRIES;
    const entry = buffer[idx];
    const name =
      [entry.prefix, entry.first_name, entry.middle_name, entry.last_name].filter(Boolean).join(' ') || '—';

    const card = document.createElement('div');
    card.className = 'entry-card';

    const row = document.createElement('div');
    row.className = 'entry-row';
    row.innerHTML = `
      <span class="entry-name">${escapeHtml(name)}</span>
      <span class="entry-date">Check-in: ${escapeHtml(entry.checkin_date ?? '—')}</span>
      <button class="btn-entry-delete" title="Delete entry" aria-label="Delete ${escapeHtml(name)}">✕</button>
      <span class="entry-chevron">›</span>`;

    row
      .querySelector('.btn-entry-delete')
      .addEventListener('click', async (e) => {
        e.stopPropagation();
        const r2 = await chrome.storage.local.get(STORAGE_KEY);
        const s2 = r2[STORAGE_KEY] ?? { buffer: [], head: 0, count: 0 };
        const remaining = Array.from({ length: s2.count }, (_, j) => {
          const bufIdx = (s2.head - s2.count + j + MAX_ENTRIES) % MAX_ENTRIES;
          return s2.buffer[bufIdx];
        }).filter((_, j) => j !== i);
        await chrome.storage.local.set({
          [STORAGE_KEY]: {
            buffer: remaining,
            head: remaining.length % MAX_ENTRIES,
            count: remaining.length,
          },
        });
        showTestStatus('Entry deleted.');
        renderEntries();
      });

    const details = document.createElement('div');
    details.className = 'entry-details';

    const fieldsEl = document.createElement('div');
    fieldsEl.className = 'entry-fields';

    const SKIP_DISPLAY = new Set(['other_guests', 'action', '_savedAt']);

    for (const [key, fieldLabel] of Object.entries(FIELD_LABELS)) {
      const val = entry[key];
      if (val === undefined || val === null || val === '') continue;
      const f = document.createElement('div');
      f.className = 'entry-field';
      f.innerHTML = `<span class="field-label">${escapeHtml(fieldLabel)}</span><span class="field-value">${escapeHtml(String(val))}</span>`;
      fieldsEl.appendChild(f);
    }

    // Render any extra fields present in the entry that FIELD_LABELS doesn't cover
    for (const [key, val] of Object.entries(entry)) {
      if (FIELD_LABELS[key] !== undefined || SKIP_DISPLAY.has(key)) continue;
      if (val === undefined || val === null || val === '') continue;
      const label = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const f = document.createElement('div');
      f.className = 'entry-field';
      f.innerHTML = `<span class="field-label">${escapeHtml(label)}</span><span class="field-value">${escapeHtml(String(val))}</span>`;
      fieldsEl.appendChild(f);
    }

    if (Array.isArray(entry.other_guests) && entry.other_guests.length > 0) {
      const ogSection = document.createElement('div');
      ogSection.className = 'entry-other-guests';
      ogSection.innerHTML = `<span class="other-guests-label">Other Guests</span>`;
      entry.other_guests.forEach((og) => {
        const ogEl = document.createElement('div');
        ogEl.className = 'other-guest';
        [
          ['Name', og.other_full_name],
          ['Mobile', og.other_mobile_number],
          ['Doc Type', og.other_doc_type],
          ['Doc No.', og.other_document_number],
        ]
          .filter(([, v]) => v)
          .forEach(([l, v]) => {
            const f = document.createElement('div');
            f.className = 'entry-field';
            f.innerHTML = `<span class="field-label">${escapeHtml(l)}</span><span class="field-value">${escapeHtml(v)}</span>`;
            ogEl.appendChild(f);
          });
        ogSection.appendChild(ogEl);
      });
      fieldsEl.appendChild(ogSection);
    }

    details.appendChild(fieldsEl);

    row.addEventListener('click', () => {
      card.classList.toggle('expanded');
    });

    card.appendChild(row);
    card.appendChild(details);
    listEl.appendChild(card);
  }

  entriesDiv.innerHTML = '';
  entriesDiv.appendChild(label);
  entriesDiv.appendChild(listEl);
}

loadBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ [STORAGE_KEY]: buildState(SAMPLE_GUESTS) });
  showTestStatus('3 sample guests loaded.');
  renderEntries();
});

clearBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  showTestStatus('All entries cleared.');
  renderEntries();
});

renderEntries();
