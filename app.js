const [data, availability, nightwaveCatalog, liveStatus, accountSync] = await Promise.all([
  fetch('./data/warframe.json', { cache: 'no-store' }).then(check),
  fetch('./data/availability.json', { cache: 'no-store' }).then(check),
  fetch('./data/nightwave-items.json', { cache: 'no-store' }).then(check),
  fetch('./data/live.json', { cache: 'no-store' }).then(check),
  fetch('./data/account-sync.json', { cache: 'no-store' }).then(check).catch(() => ({ items: [] })),
]).catch((error) => {
  document.querySelector('#app').innerHTML = `<div class="error">Tracker data could not be loaded.<br>${escapeHtml(error.message)}</div>`;
  throw error;
});

applyAccountSync(data, accountSync);
applyConsistencyFixes(data);

function check(response) {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function applyAccountSync(payload, sync) {
  const liveItems = Array.isArray(sync?.items) ? sync.items : [];
  if (!liveItems.length) return;

  const arsenalByName = new Map((payload.arsenal || []).map((row) => [row.item, row]));
  const rank40Names = new Set((payload.rank40 || []).map((row) => row.item));
  const liveByName = new Map(liveItems.map((row) => [row.item, row]));

  for (const live of liveItems) {
    const row = arsenalByName.get(live.item);
    if (!row) continue;

    if (live.owned) row.owned = 'Yes';
    if (live.mastered) row.mastered = 'Yes';
    row.liveXp = Number(live.xp || 0);
    row.formaApplied = Number(live.formaApplied || 0);

    // The live cache may add positive evidence, but absence or low XP must
    // never erase mastery already recorded by the acquisition tracker.
    if (row.mastered === 'Yes') {
      row.complete = 'Yes';
      row.missing = '';
      if (!rank40Names.has(row.item)) {
        row.state = row.owned === 'Yes' ? 'Owned + mastered' : 'Mastered; not currently owned';
        row.targetRank = '30';
        row.route = 'Mastery complete';
      }
    } else if (row.owned === 'Yes') {
      row.complete = 'Yes';
      row.missing = '';
      if (!rank40Names.has(row.item)) {
        row.state = 'Owned; rank unknown';
        row.targetRank = '30';
        row.route = 'Already owned';
      }
    }
  }

  const stillNeedsAcquisition = (card) => {
    const row = arsenalByName.get(card.item);
    return !row || (row.owned !== 'Yes' && row.mastered !== 'Yes');
  };
  payload.queue = (payload.queue || []).filter(stillNeedsAcquisition);
  payload.vaulted = (payload.vaulted || []).filter(stillNeedsAcquisition);

  const ownedByName = new Map(
    (payload.owned || [])
      .filter((card) => arsenalByName.get(card.item)?.mastered !== 'Yes')
      .map((card) => [card.item, card]),
  );
  for (const live of liveItems) {
    const row = arsenalByName.get(live.item);
    if (!row || row.owned !== 'Yes' || row.mastered === 'Yes' || rank40Names.has(row.item)) continue;
    if (!ownedByName.has(row.item)) {
      const weaponTypes = new Set(['primary', 'secondary', 'melee', 'archgun', 'archmelee']);
      ownedByName.set(row.item, {
        item: row.item,
        type: row.type,
        state: 'Owned; rank unknown',
        targetRank: '30',
        steps: 'Check Arsenal and level to 30 if needed.',
        tip: weaponTypes.has(row.type)
          ? `Level this ${row.type} in Sanctuary Onslaught, Helene, or Hydron; equip fewer other weapons to focus affinity.`
          : 'Level in Sanctuary Onslaught, Helene, or Hydron.',
        source: row.source,
      });
    }
  }
  payload.owned = [...ownedByName.values()].sort((a, b) => a.item.localeCompare(b.item));

  if (sync.generatedAt) {
    payload.meta.accountSyncAt = sync.generatedAt;
    payload.meta.accountSyncSourceSha256 = sync.sourceSha256 || null;
    const date = new Date(sync.generatedAt);
    if (Number.isFinite(date.getTime())) {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(date).map(({ type, value }) => [type, value]),
      );
      payload.meta.snapshotDate = `${parts.year}-${parts.month}-${parts.day}`;
    }
  }
}

function applyConsistencyFixes(payload) {
  const relicCount = (relic) => Object.entries(payload.meta?.relicInventory || {})
    .filter(([name]) => name === relic || name.startsWith(`${relic} `))
    .reduce((total, [, count]) => total + (Number.isFinite(count) ? count : 0), 0);
  const remainingMaterial = (missing, material) => {
    const escaped = material.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(missing || '').match(new RegExp(`${escaped} \\(([\\d,]+)\\/([\\d,]+)\\)`));
    return match ? Number(match[2].replaceAll(',', '')) - Number(match[1].replaceAll(',', '')) : null;
  };

  for (const section of ['queue', 'vaulted', 'arsenal']) {
    for (const row of payload[section] || []) {
      if (row.item === 'Needlenose') {
        const remaining = remainingMaterial(row.missing, 'Hespazym Alloy');
        if (remaining !== null && remaining > 0 && !/Needlenose Blueprint/.test(row.missing || '')) {
          row.steps = `Obtain ${remaining.toLocaleString('en-US')} Hespazym Alloy. Assemble the K-Drive and level it to 30. No gilding is required.`;
          row.tip = 'The Needlenose Board Blueprint is already owned; no gilding is required for mastery.';
        }
      }
      if (row.item === 'Trumna Prime') {
        const count = relicCount('Neo T11');
        if (count > 0) row.steps = `Open the ${count.toLocaleString('en-US')} Neo T11 Intact relics in the export; Receiver is Rare. Refine to Radiant first.`;
      }
    }
  }
}

const UNVERIFIED = 'Acquisition route not verified yet';
const normalizeOffering = (value) => String(value || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+blueprint$/i, '').trim();
const activeNightwave = new Set((availability.activeNightwaveItems || []).map(normalizeOffering));
const isNightwave = (item) => item.availabilityGroup === 'nightwave';
const isDojo = (item) => item.availabilityGroup === 'dojo';
const isBaro = (item) => item.availabilityGroup === 'baro';
const isDeferredCategory = (item) => isNightwave(item) || isDojo(item) || isBaro(item);
const nightwaveDefinitions = new Map(nightwaveCatalog.items.map((entry) => [entry.item, entry.offerings]));
const nightwaveCheckedAt = Date.parse(availability.checkedAt || '');
function nextWeeklyReset(checkedAt) {
  const date = new Date(checkedAt);
  const daysUntilMonday = ((8 - date.getUTCDay()) % 7) || 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysUntilMonday);
}
const nightwaveExpiration = availability.rotationEndsAt
  ? Date.parse(availability.rotationEndsAt)
  : Number.isFinite(nightwaveCheckedAt) ? nextWeeklyReset(nightwaveCheckedAt) : NaN;
const nightwaveStockVerified = availability.status === 'verified'
  && Number.isFinite(nightwaveCheckedAt)
  && Number.isFinite(nightwaveExpiration)
  && Date.now() >= nightwaveCheckedAt
  && Date.now() < nightwaveExpiration;
const nightwaveState = (item) => {
  if (!isNightwave(item)) return null;
  if (!nightwaveStockVerified) return 'unknown';
  const names = nightwaveDefinitions.get(item.item) || [item.item];
  return names.some((name) => activeNightwave.has(normalizeOffering(name))) ? 'available' : 'inactive';
};
const nightwaveQueue = data.queue.filter(isNightwave).sort((a, b) => {
  const order = { available: 0, unknown: 1, inactive: 2 };
  return order[nightwaveState(a)] - order[nightwaveState(b)] || a.item.localeCompare(b.item);
});
const practicalOrder = (a, b) => (a.practicalPriority ?? Number.MAX_SAFE_INTEGER) - (b.practicalPriority ?? Number.MAX_SAFE_INTEGER) || a.item.localeCompare(b.item);
const dojoQueue = data.queue.filter(isDojo).sort(practicalOrder);
const baroQueue = data.queue.filter(isBaro).sort(practicalOrder);
const ordinaryQueue = data.queue.filter((item) => !isDeferredCategory(item)).sort(practicalOrder);
const verifiedQueue = ordinaryQueue.filter((item) => item.route !== UNVERIFIED);
const actionableQueue = verifiedQueue;
const missingParts = (item) => String(item.missing || '').split(';').map((part) => part.trim()).filter(Boolean);
const isMaterialOnly = (item) => {
  const parts = missingParts(item);
  return parts.length > 0 && parts.every((part) => /\(\d[\d,]*\/\d[\d,]*\)$/.test(part));
};
const materialQueue = actionableQueue.filter(isMaterialOnly);
const views = [
  ['next', 'Acquire next', actionableQueue.length],
  ['nightwave', 'Nightwave', nightwaveQueue.length],
  ['dojo', 'Dojo', dojoQueue.length],
  ['baro', 'Baro Ki’Teer', baroQueue.length],
  ['materials', 'Materials', materialQueue.length],
  ['vaulted', 'Primes / Relics', data.vaulted.length],
  ['owned', 'Owned / Foundry', data.owned.length],
  ['arsenal', 'Full arsenal', data.arsenal.length],
];
const state = { view: 'next', query: '', type: 'all', visible: 30 };
const app = document.querySelector('#app');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
function source(url) {
  return url ? `<a class="source" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Source ↗</a>` : '';
}
function matches(item) {
  const query = state.query.trim().toLowerCase();
  return !query || Object.values(item).some((value) => String(value ?? '').toLowerCase().includes(query));
}
function queueCard(item, material = false) {
  const arsenal = data.arsenal.find((row) => row.item === item.item);
  const vaulted = item.item.includes('Prime') && arsenal?.vaulted === 'Yes' ? '<span class="pill violet">VAULTED</span>' : '';
  const steps = item.steps ? `<p class="steps">${escapeHtml(item.steps)}</p>` : '';
  const tip = item.tip ? `<details><summary>Farm tip</summary><p>${escapeHtml(item.tip)}</p></details>` : '';
  const nightwave = nightwaveState(item);
  const labels = { available: 'AVAILABLE THIS WEEK', unknown: 'AVAILABILITY UNKNOWN', inactive: 'NOT AVAILABLE THIS WEEK' };
  const nightwavePill = nightwave ? `<span class="pill ${nightwave === 'available' ? 'green' : nightwave === 'inactive' ? 'violet' : 'amber'}">${labels[nightwave]}</span>` : '';
  const activeNow = item.liveMatches?.length ? '<span class="pill green">ACTIVE NOW</span>' : '';
  const live = item.liveMatches?.length ? `<p class="steps">${escapeHtml(item.liveMatches.join(' · '))}</p>` : '';
  const relics = arsenal?.primeDetails?.length ? primeDetails(arsenal) : '';
  return `<article class="item-card"><div class="item-topline"><div><h3>${escapeHtml(item.item)}</h3><p class="meta">${escapeHtml(item.type)} · Rank ${escapeHtml(item.targetRank)}</p></div><div>${vaulted}${nightwavePill}${activeNow}<span class="pill ${material ? 'amber' : ''}">${material ? 'MATERIALS' : escapeHtml(item.ease.split('—')[0].trim())}</span></div></div><div class="need"><span>NEEDED</span>${escapeHtml(item.missing)}</div><p class="route">${escapeHtml(item.route)}</p>${live}${steps}${relics}${tip}${source(item.source)}</article>`;
}
function primeDetails(item) {
  if (!item.primeDetails?.length) return item.primeStatus === 'DATA INCOMPLETE'
    ? '<p class="steps">Historical relic rewards have not yet been matched to these missing parts. Check owned relics manually or trade for the listed gaps.</p>'
    : '';
  return `<details><summary>Relics for missing parts</summary>${item.primeDetails.map((detail) => `<p><strong>${escapeHtml(detail.part)}</strong>: ${escapeHtml(detail.relic)} · ${escapeHtml(detail.rarity)} · owned ${detail.ownedRelics ?? 'unknown'} · ${escapeHtml(detail.relicSource)} · refine ${escapeHtml(detail.refinement)}</p>`).join('')}</details>`;
}
function checkedDate(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
    : 'an unknown date';
}
function nightwaveWarning() {
  if (nightwaveStockVerified) return '';
  return `<div class="status-warning"><strong>Nightwave availability is unverified.</strong> Inventory has not been verified since ${escapeHtml(checkedDate(availability.checkedAt))}. Individual availability labels cannot currently be trusted; check the in-game Cred Offerings before spending Cred.</div>`;
}
function invasionWarning() {
  if (liveStatus.invasions?.status === 'verified') return '';
  return `<div class="status-warning"><strong>Live Invasion matching is unavailable.</strong> The feed was last checked ${escapeHtml(checkedDate(liveStatus.checkedAt))}. An item without an ACTIVE NOW badge may still have a relevant reward; check current Invasions in game.</div>`;
}
function header() {
  const label = views.find(([id]) => id === state.view)?.[1] ?? '';
  const quickWins = actionableQueue.filter((x) => x.ease.startsWith('2')).length;
  return `<header class="masthead"><div class="brand-mark">WF</div><div class="brand-copy"><span>JANTJE'S ARSENAL</span><h1>Acquisition Tracker</h1></div><div class="sync"><i></i> Updated ${escapeHtml(data.meta.snapshotDate)}</div></header><section class="hero"><div><p class="eyebrow">CURRENT OBJECTIVE</p><h2>${state.view === 'next' ? 'Choose the next clean win.' : escapeHtml(label)}</h2><p class="lede">Only the information needed to decide, farm, and move on.</p></div><div class="stat-row"><button data-view="next"><b>${actionableQueue.length}</b><span>active targets</span></button><button data-view="next"><b>${quickWins}</b><span>quick wins</span></button><button data-view="materials"><b>${materialQueue.length}</b><span>mats only</span></button><button data-view="arsenal"><b>${data.arsenal.length}</b><span>arsenal items</span></button></div></section>`;
}
function tabs() {
  return `<nav class="view-tabs" aria-label="Tracker views">${views.map(([id, label, count]) => `<button data-view="${id}" class="${state.view === id ? 'active' : ''}">${label}<span>${count}</span></button>`).join('')}<a class="account-link" href="account.html">Builds & sessions ↗</a></nav>`;
}
function controls() {
  const types = ['all', ...new Set(actionableQueue.map((x) => x.type))].sort();
  return `<section class="controls"><label class="search"><span>⌕</span><input id="search" value="${escapeHtml(state.query)}" placeholder="Search…" aria-label="Search current view"></label>${state.view === 'next' ? `<select id="type" aria-label="Filter by type">${types.map((type) => `<option value="${escapeHtml(type)}" ${state.type === type ? 'selected' : ''}>${type === 'all' ? 'All types' : escapeHtml(type)}</option>`).join('')}</select>` : ''}</section>`;
}
function content() {
  if (state.view === 'next') {
    const rows = actionableQueue.filter((x) => (state.type === 'all' || x.type === state.type) && matches(x));
    return `${invasionWarning()}${cardsAndMore(rows, rows.map((x) => queueCard(x)))}`;
  }
  if (state.view === 'materials') {
    const rows = materialQueue.filter(matches);
    return `<section class="card-grid">${rows.map((x) => queueCard(x, true)).join('')}</section>`;
  }
  if (state.view === 'nightwave') {
    const rows = nightwaveQueue.filter(matches);
    return `${nightwaveWarning()}${cardsAndMore(rows, rows.map((x) => queueCard(x)))}`;
  }
  if (state.view === 'dojo') {
    const rows = dojoQueue.filter(matches);
    return cardsAndMore(rows, rows.map((x) => queueCard(x)));
  }
  if (state.view === 'baro') {
    const rows = baroQueue.filter(matches);
    return cardsAndMore(rows, rows.map((x) => queueCard(x)));
  }
  if (state.view === 'vaulted') {
    const rows = data.vaulted.filter((x) => String(x.missing || '').trim()).filter(matches);
    return cardsAndMore(rows, rows.map((x) => {
      const active = x.liveMatches?.length ? '<span class="pill green">ACTIVE NOW</span>' : '';
      const statusClass = x.primeStatus === 'RESURGENCE ACTIVE' || x.primeStatus === 'OWNED RELICS' || x.primeStatus === 'PERMANENT SPECIAL RELICS' || x.primeStatus === 'CURRENT RELICS' ? 'green' : 'violet';
      return `<article class="item-card muted-card"><div class="item-topline"><div><h3>${escapeHtml(x.item)}</h3><p class="meta">${escapeHtml(x.type)} · Rank ${escapeHtml(x.targetRank)}</p></div><div>${active}<span class="pill ${statusClass}">${escapeHtml(x.primeStatus || 'DATA INCOMPLETE')}</span></div></div><div class="need"><span>MISSING</span>${escapeHtml(x.missing)}</div><p class="route">${escapeHtml(x.route)}</p><p class="steps">${escapeHtml(x.steps)}</p>${primeDetails(x)}<details><summary>Farm tip</summary><p>${escapeHtml(x.tip)}</p></details>${source(x.source)}</article>`;
    }));
  }
  if (state.view === 'owned') {
    const rows = data.owned.filter(matches);
    return `<section class="card-grid">${rows.map((x) => `<article class="item-card"><div class="item-topline"><div><h3>${escapeHtml(x.item)}</h3><p class="meta">${escapeHtml(x.type)} · Rank ${escapeHtml(x.targetRank)}</p></div><span class="pill green">OWNED</span></div><div class="need"><span>NEXT</span>${escapeHtml(x.steps)}</div><p class="steps">${escapeHtml(x.tip)}</p>${source(x.source)}</article>`).join('')}</section>`;
  }
  const rows = data.arsenal.filter(matches);
  const rendered = rows.slice(0, state.visible).map((x) => `<div class="table-row"><strong>${escapeHtml(x.item)}</strong><span>${escapeHtml(x.type)}</span><span>${escapeHtml(x.state)}</span><span>${escapeHtml(x.targetRank)}</span>${source(x.source)}</div>`).join('');
  return `<section class="table-shell"><div class="table-head"><span>Item</span><span>Type</span><span>Status</span><span>Target</span><span>Source</span></div>${rendered}</section>${moreButton(rows.length)}`;
}
function cardsAndMore(rows, rendered) {
  if (!rows.length) return '<div class="empty">No matching items.</div>';
  return `<section class="card-grid">${rendered.slice(0, state.visible).join('')}</section>${moreButton(rows.length)}`;
}
function moreButton(total) {
  return total > state.visible ? '<button class="load-more" id="more">Show 30 more</button>' : '';
}
function render() {
  const availableNightwave = nightwaveQueue.filter((item) => nightwaveState(item) === 'available').length;
  const unknownNightwave = nightwaveQueue.filter((item) => nightwaveState(item) === 'unknown').length;
  app.innerHTML = `${header()}${tabs()}${controls()}${content()}<footer><span>Snapshot verified ${escapeHtml(data.meta.exportVerifiedAt)}</span><span>${availableNightwave} Nightwave available · ${unknownNightwave} unknown · Ordinary gear → 30</span></footer>`;
  app.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.view; state.query = ''; state.visible = 30; render(); }));
  app.querySelector('#search')?.addEventListener('input', (event) => { state.query = event.target.value; state.visible = 30; render(); queueMicrotask(() => { const input = app.querySelector('#search'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }); });
  app.querySelector('#type')?.addEventListener('change', (event) => { state.type = event.target.value; state.visible = 30; render(); });
  app.querySelector('#more')?.addEventListener('click', () => { state.visible += 30; render(); });
}

render();
