const app = document.querySelector('#app');

const [data, availability, nightwaveCatalog, liveStatus, accountSync] = await Promise.all([
  json('./data/warframe.json'),
  json('./data/availability.json'),
  json('./data/nightwave-items.json'),
  json('./data/live.json'),
  json('./data/account-sync.json').catch(() => ({ items: [] })),
]).catch((error) => {
  app.innerHTML = `<div class="error">Tracker data could not be loaded.<br>${escapeHtml(error.message)}</div>`;
  throw error;
});

applyAccountSync(data, accountSync);
applyConsistencyFixes(data);

const UNVERIFIED = 'Acquisition route not verified yet';
const nightwaveDefinitions = new Map(nightwaveCatalog.items.map((entry) => [entry.item, entry]));
const activeNightwave = new Set((availability.activeNightwaveItems || []).map(normalizeOffering));
const isNightwave = (item) => item.availabilityGroup === 'nightwave';
const isDojo = (item) => item.availabilityGroup === 'dojo';
const isBaro = (item) => item.availabilityGroup === 'baro';
const isDeferredCategory = (item) => isNightwave(item) || isDojo(item) || isBaro(item);
const practicalOrder = (a, b) => (a.practicalPriority ?? Number.MAX_SAFE_INTEGER) - (b.practicalPriority ?? Number.MAX_SAFE_INTEGER) || a.item.localeCompare(b.item);
const ordinaryQueue = data.queue.filter((item) => !isDeferredCategory(item)).sort(practicalOrder);
const actionableQueue = ordinaryQueue.filter((item) => item.route !== UNVERIFIED);
const vendorQueue = data.queue.filter(isDeferredCategory).sort(practicalOrder);
const missingParts = (item) => String(item.missing || '').split(';').map((part) => part.trim()).filter(Boolean);
const isMaterialOnly = (item) => {
  const parts = missingParts(item);
  return parts.length > 0 && parts.every((part) => /\(\d[\d,]*\/\d[\d,]*\)$/.test(part));
};
const materialQueue = actionableQueue.filter(isMaterialOnly);
const state = { view: routeView(), query: '', type: 'all', vendor: 'all', visible: 24 };
const views = [
  ['next', 'Next moves', actionableQueue.length],
  ['relics', 'Primes & relics', data.vaulted.length],
  ['vendors', 'Vendors', vendorQueue.length],
  ['foundry', 'Foundry & leveling', data.owned.length + materialQueue.length],
  ['all', 'All items', data.arsenal.length],
];

function json(url) {
  return fetch(url, { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function normalizeOffering(value) {
  return String(value || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+blueprint$/i, '').trim();
}

function parseDate(value) {
  const direct = new Date(value || '');
  if (Number.isFinite(direct.getTime())) return direct;
  const normalized = String(value || '').replace(' PDT', '-07:00').replace(' PST', '-08:00').replace(' ', 'T');
  return new Date(normalized);
}

function formatDate(value, includeTime = true) {
  const date = parseDate(value);
  if (!Number.isFinite(date.getTime())) return 'unknown';
  return date.toLocaleString('en-US', includeTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
}

function routeView() {
  const match = location.hash.match(/^#plan\/(next|relics|vendors|foundry|all)/);
  return match?.[1] || 'next';
}

function setRoute(view) {
  const next = `#plan/${view}`;
  if (location.hash === next) render();
  else location.hash = next;
}

function fmt(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function applyAccountSync(payload, sync) {
  const liveItems = Array.isArray(sync?.items) ? sync.items : [];
  if (!liveItems.length) return;
  const arsenalByName = new Map((payload.arsenal || []).map((row) => [row.item, row]));
  const rank40Names = new Set((payload.rank40 || []).map((row) => row.item));
  for (const live of liveItems) {
    const row = arsenalByName.get(live.item);
    if (!row) continue;
    if (live.owned) row.owned = 'Yes';
    if (live.mastered) row.mastered = 'Yes';
    row.liveXp = Number(live.xp || 0);
    row.formaApplied = Number(live.formaApplied || 0);
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
  const ownedByName = new Map((payload.owned || []).filter((card) => arsenalByName.get(card.item)?.mastered !== 'Yes').map((card) => [card.item, card]));
  for (const live of liveItems) {
    const row = arsenalByName.get(live.item);
    if (!row || row.owned !== 'Yes' || row.mastered === 'Yes' || rank40Names.has(row.item) || ownedByName.has(row.item)) continue;
    ownedByName.set(row.item, {
      item: row.item,
      type: row.type,
      state: 'Owned; rank unknown',
      targetRank: '30',
      steps: 'Check Arsenal and level to 30 if needed.',
      tip: 'Equip it in a high-affinity mission and reduce competing equipment if you want to focus the affinity.',
      source: row.source,
    });
  }
  payload.owned = [...ownedByName.values()].sort((a, b) => a.item.localeCompare(b.item));
  if (!sync.generatedAt) return;
  payload.meta.accountSyncAt = sync.generatedAt;
  const auxiliary = parseDate(sync.generatedAt);
  const primary = parseDate(payload.meta.exportVerifiedAt || payload.meta.snapshotDate);
  if (Number.isFinite(auxiliary.getTime()) && (!Number.isFinite(primary.getTime()) || auxiliary > primary)) {
    payload.meta.snapshotDate = auxiliary.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
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
          row.tip = 'The Board Blueprint is already owned; no gilding is required for mastery.';
        }
      }
      if (row.item === 'Trumna Prime') {
        const count = relicCount('Neo T11');
        if (count > 0) row.steps = `Open the ${count.toLocaleString('en-US')} Neo T11 Intact relics in this snapshot; the Receiver is Rare, so refine first.`;
      }
    }
  }
}

function sourceLabel(url) {
  if (!url) return 'Source unavailable';
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'wiki.warframe.com') return 'Official Warframe Wiki';
    if (parsed.hostname.endsWith('warframe.com')) return 'Digital Extremes';
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'Source note';
  }
}

function source(url) {
  return url ? `<a class="source" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(sourceLabel(url))} <span aria-hidden="true">↗</span></a>` : '';
}

function pill(text, kind = '') {
  return `<span class="pill ${kind}">${escapeHtml(text)}</span>`;
}

function matches(item) {
  const query = state.query.trim().toLowerCase();
  return !query || Object.values(item).some((value) => String(value ?? '').toLowerCase().includes(query));
}

function nextWeeklyReset(checkedAt) {
  const date = new Date(checkedAt);
  const daysUntilMonday = ((8 - date.getUTCDay()) % 7) || 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysUntilMonday);
}

const nightwaveCheckedAt = Date.parse(availability.checkedAt || '');
const nightwaveExpiration = availability.rotationEndsAt ? Date.parse(availability.rotationEndsAt) : Number.isFinite(nightwaveCheckedAt) ? nextWeeklyReset(nightwaveCheckedAt) : NaN;
const nightwaveStockVerified = availability.status === 'verified'
  && Number.isFinite(nightwaveCheckedAt)
  && Number.isFinite(nightwaveExpiration)
  && Date.now() >= nightwaveCheckedAt
  && Date.now() < nightwaveExpiration;

function nightwaveState(item) {
  if (!isNightwave(item)) return null;
  const definition = nightwaveDefinitions.get(item.item) || {};
  if (definition.availability === 'permanent') return 'permanent';
  if (!nightwaveStockVerified) return 'unknown';
  const names = definition.offerings || [item.item];
  return names.some((name) => activeNightwave.has(normalizeOffering(name))) ? 'available' : 'inactive';
}

function globalNavigation(active = 'plan') {
  const links = [
    ['plan', './#plan/next', 'Plan'],
    ['arsenal', 'account.html#arsenal/current', 'Arsenal'],
    ['sessions', 'account.html#sessions', 'Sessions'],
    ['ask', 'account.html#ask', 'Ask'],
  ];
  return `<nav class="global-nav" aria-label="Main navigation">${links.map(([id, href, label]) => `<a class="global-nav-link ${active === id ? 'active' : ''}" href="${href}" ${active === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function masthead() {
  return `<header class="masthead"><a class="brand-lockup" href="./#plan/next" aria-label="Jantje's Arsenal home"><img class="brand-mark-image" src="assets/arsenal-mark.png" alt=""><span class="brand-copy"><small>JANTJE'S</small><strong>ARSENAL INTELLIGENCE</strong></span></a>${globalNavigation()}<div class="sync"><i></i><span>Direct sync<br><b>${escapeHtml(formatDate(data.meta.exportVerifiedAt))}</b></span></div></header>`;
}

function freshness() {
  const liveStatuses = [liveStatus.invasions, liveStatus.baro, liveStatus.events].filter((row) => row?.status === 'verified').length;
  const sourceText = /Direct read-only/i.test(data.meta.exportSource || '') ? 'Direct DE inventory' : (data.meta.exportSource || 'Inventory source');
  return `<section class="freshness-strip" aria-label="Data freshness">
    <span class="freshness-badge confirmed"><i></i><span><b>Account</b>${escapeHtml(formatDate(data.meta.exportVerifiedAt))}</span></span>
    <span class="freshness-badge ${liveStatuses ? 'live' : 'stale'}"><i></i><span><b>World state</b>${liveStatuses}/3 feeds verified</span></span>
    <span class="freshness-badge confirmed"><i></i><span><b>Provenance</b>${escapeHtml(sourceText)}</span></span>
  </section>`;
}

function hero() {
  const lead = actionableQueue[0];
  const ready = data.owned.filter((row) => row.state === 'Ready in Foundry').length;
  const missing = data.meta?.summary?.missing ?? [...data.queue, ...data.vaulted].length;
  const title = state.view === 'next' && lead ? `${lead.item} is the next clean win.` : views.find(([id]) => id === state.view)?.[1] || 'Plan';
  const lede = state.view === 'next' && lead ? lead.route : 'Verified routes, exact account gaps, and the shortest useful next action.';
  return `<section class="hero scanner-hero"><div class="hero-copy"><p class="eyebrow">${state.view === 'next' ? 'RECOMMENDED NEXT MOVE' : 'ACQUISITION PLAN'}</p><h1>${escapeHtml(title)}</h1><p class="lede">${escapeHtml(lede)}</p>${lead && state.view === 'next' ? `<a class="primary-action" href="#target-${slug(lead.item)}">Open the route</a>` : ''}</div><div class="stat-row">
    <a href="#plan/next"><b>${fmt(actionableQueue.length)}</b><span>verified farms</span></a>
    <a href="#plan/foundry"><b>${fmt(ready)}</b><span>ready to claim</span></a>
    <a href="#plan/vendors"><b>${fmt(vendorQueue.length)}</b><span>vendor gates</span></a>
    <a href="#plan/all"><b>${fmt(missing)}</b><span>mastery gaps</span></a>
  </div></section>`;
}

function secondaryNavigation() {
  return `<nav class="view-tabs" aria-label="Plan views">${views.map(([id, label, count]) => `<a href="#plan/${id}" class="${state.view === id ? 'active' : ''}" ${state.view === id ? 'aria-current="page"' : ''}>${escapeHtml(label)}<span>${fmt(count)}</span></a>`).join('')}</nav>`;
}

function controls(rows = []) {
  const types = ['all', ...new Set(rows.map((row) => row.type).filter(Boolean))].sort();
  const type = state.view === 'next' ? `<select id="type" aria-label="Filter by equipment type">${types.map((value) => `<option value="${escapeHtml(value)}" ${state.type === value ? 'selected' : ''}>${value === 'all' ? 'All equipment types' : friendlyType(value)}</option>`).join('')}</select>` : '';
  return `<section class="controls"><label class="search"><span aria-hidden="true">⌕</span><input id="search" value="${escapeHtml(state.query)}" placeholder="Search ${escapeHtml(views.find(([id]) => id === state.view)?.[1] || 'items')}" aria-label="Search current view"></label>${type}</section>`;
}

function friendlyType(value) {
  const labels = { primary: 'Primary', secondary: 'Secondary', melee: 'Melee', warframe: 'Warframe', companion: 'Companion', archgun: 'Archgun', archmelee: 'Archmelee', archwing: 'Archwing', necramech: 'Necramech', modular: 'Modular' };
  return labels[String(value).toLowerCase()] || String(value || 'Other').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function primeDetails(item) {
  if (!item.primeDetails?.length) return item.primeStatus === 'DATA INCOMPLETE'
    ? '<p class="steps">Historical relic rewards have not been matched to these gaps. Check owned relics or trade only for the listed pieces.</p>'
    : '';
  return `<details><summary>Relics for the missing parts</summary><div class="detail-stack">${item.primeDetails.map((detail) => `<p><strong>${escapeHtml(detail.part)}</strong><span>${escapeHtml(detail.relic)} · ${escapeHtml(detail.rarity)} · ${fmt(detail.ownedRelics ?? 0)} owned · refine ${escapeHtml(detail.refinement)}</span><small>${escapeHtml(detail.relicSource)}</small></p>`).join('')}</div></details>`;
}

function queueCard(item, options = {}) {
  const arsenal = data.arsenal.find((row) => row.item === item.item);
  const nightwave = nightwaveState(item);
  const labels = { permanent: 'PERMANENT STOCK', available: 'AVAILABLE NOW', unknown: 'ROTATION UNVERIFIED', inactive: 'NOT IN ROTATION' };
  const statusKind = nightwave === 'permanent' || nightwave === 'available' ? 'green' : nightwave === 'unknown' ? 'amber' : 'violet';
  const live = item.liveMatches?.length ? `${pill('ACTIVE NOW', 'green')}<p class="live-match">${escapeHtml(item.liveMatches.join(' · '))}</p>` : '';
  const vaulted = item.item.includes('Prime') && arsenal?.vaulted === 'Yes' ? pill('VAULTED', 'violet') : '';
  const priority = Number.isFinite(item.practicalPriority) && item.practicalPriority < 100 ? pill(`PRIORITY ${item.practicalPriority}`) : '';
  const material = options.material ? pill('MATERIALS ONLY', 'amber') : '';
  const relics = arsenal?.primeDetails?.length ? primeDetails(arsenal) : '';
  return `<article class="item-card ${options.featured ? 'featured-card' : ''}" id="target-${slug(item.item)}"><div class="item-topline"><div><p class="eyebrow">${escapeHtml(friendlyType(item.type))} · TARGET RANK ${escapeHtml(item.targetRank)}</p><h2>${escapeHtml(item.item)}</h2></div><div class="pill-cluster">${vaulted}${priority}${material}${nightwave ? pill(labels[nightwave], statusKind) : ''}</div></div>
    <div class="need"><span>ACCOUNT GAP</span>${escapeHtml(item.missing)}</div>
    <div class="route-block"><span>WHERE</span><strong>${escapeHtml(item.route)}</strong></div>
    ${item.steps ? `<p class="steps">${escapeHtml(item.steps)}</p>` : ''}${live}${relics}
    ${item.tip ? `<div class="tip"><span>RUN IT SMARTER</span><p>${escapeHtml(item.tip)}</p></div>` : ''}
    <div class="card-footer">${source(item.source)}<span>Checked ${escapeHtml(formatDate(data.meta.exportVerifiedAt, false))}</span></div>
  </article>`;
}

function warning(kind, title, copy) {
  return `<div class="status-warning ${kind}"><strong>${escapeHtml(title)}</strong> ${escapeHtml(copy)}</div>`;
}

function invasionWarning() {
  if (liveStatus.invasions?.status === 'verified') return '';
  return warning('amber', 'Live Invasion matching is unavailable.', `The account routes are still valid, but ACTIVE NOW badges may be incomplete. World state last checked ${formatDate(liveStatus.checkedAt)}.`);
}

function nightwaveWarning(rows) {
  const rotating = rows.some((row) => isNightwave(row) && nightwaveState(row) !== 'permanent');
  if (!rotating || nightwaveStockVerified) return '';
  return warning('amber', 'Rotating Nightwave stock is unverified.', `Permanent stock is safe; check the in-game Cred Offerings for rotating items. Last manual inventory: ${formatDate(availability.checkedAt)}.`);
}

function cards(rows, options = {}) {
  const visible = rows.slice(0, state.visible);
  if (!visible.length) return '<div class="empty">No matching targets. The void has, for once, filed its paperwork.</div>';
  return `<section class="card-grid">${visible.map((row, index) => queueCard(row, { ...options, featured: options.featureFirst && index === 0 })).join('')}</section>${rows.length > state.visible ? `<button class="load-more" id="more">Show ${Math.min(24, rows.length - state.visible)} more</button>` : ''}`;
}

function vendorView() {
  const vendorTypes = [
    ['all', 'All vendors'], ['nightwave', 'Nightwave'], ['dojo', 'Dojo'], ['baro', 'Baro Ki’Teer'],
  ];
  const rows = vendorQueue.filter((row) => state.vendor === 'all' || (state.vendor === 'nightwave' && isNightwave(row)) || (state.vendor === 'dojo' && isDojo(row)) || (state.vendor === 'baro' && isBaro(row))).filter(matches);
  return `<section class="section-toolbar"><div><p class="eyebrow">TIME AND ACCESS GATES</p><h2>Vendors</h2></div><div class="filter-chips">${vendorTypes.map(([id, label]) => `<button data-vendor="${id}" class="${state.vendor === id ? 'active' : ''}">${label}</button>`).join('')}</div></section>${nightwaveWarning(rows)}${cards(rows)}`;
}

function foundryView() {
  const owned = data.owned.filter(matches);
  const materials = materialQueue.filter(matches);
  return `<section class="section-toolbar"><div><p class="eyebrow">ALREADY IN MOTION</p><h2>Claim, build, and level</h2><p>These need less farming and more follow-through.</p></div></section>
    ${owned.length ? `<section class="card-grid compact-grid">${owned.map((row) => `<article class="item-card followup-card"><div class="item-topline"><div><p class="eyebrow">${escapeHtml(friendlyType(row.type))}</p><h2>${escapeHtml(row.item)}</h2></div>${pill(row.state === 'Ready in Foundry' ? 'READY TO CLAIM' : 'OWNED', 'green')}</div><div class="route-block"><span>NEXT ACTION</span><strong>${escapeHtml(row.steps)}</strong></div><div class="tip"><span>LEVELING</span><p>${escapeHtml(row.tip)}</p></div><div class="card-footer">${source(row.source)}</div></article>`).join('')}</section>` : ''}
    ${materials.length ? `<section class="section-title"><div><p class="eyebrow">MATERIALS ONLY</p><h2>The blueprint grind is already dead</h2></div></section>${cards(materials, { material: true })}` : ''}
    ${!owned.length && !materials.length ? '<div class="empty">No matching Foundry or leveling follow-ups.</div>' : ''}`;
}

function allItemsView() {
  const rows = data.arsenal.filter(matches);
  const visible = rows.slice(0, state.visible);
  return `<section class="data-table collection-table" role="table" aria-label="Full arsenal"><div class="data-head" role="row"><span>Item</span><span>Type</span><span>Account state</span><span>Target</span><span>Reference</span></div>${visible.map((row) => `<div class="data-row" role="row"><strong>${escapeHtml(row.item)}</strong><span>${escapeHtml(friendlyType(row.type))}</span><span>${escapeHtml(row.state)}</span><span>${escapeHtml(row.targetRank)}</span>${source(row.source)}</div>`).join('')}</section>${rows.length > state.visible ? '<button class="load-more" id="more">Show 24 more</button>' : ''}`;
}

function content() {
  if (state.view === 'vendors') return vendorView();
  if (state.view === 'foundry') return foundryView();
  if (state.view === 'all') return allItemsView();
  if (state.view === 'relics') {
    const rows = data.vaulted.filter((row) => String(row.missing || '').trim()).filter(matches);
    return `<section class="section-toolbar"><div><p class="eyebrow">PRIME PARTS AND RELICS</p><h2>Open what you own. Trade only for the bastard holdouts.</h2></div></section>${cards(rows)}`;
  }
  const rows = actionableQueue.filter((row) => (state.type === 'all' || row.type === state.type) && matches(row));
  return `${invasionWarning()}${cards(rows, { featureFirst: true })}`;
}

function footer() {
  return `<footer><span>Sanitized account derivative · no IDs, Platinum, raw payloads, or authentication data</span><span><a href="chatgpt-context.md">ChatGPT context</a> · <a href="llms.txt">AI index</a> · Rules reviewed ${escapeHtml(formatDate(data.meta.exportVerifiedAt, false))}</span></footer>`;
}

function bind() {
  app.querySelector('#search')?.addEventListener('input', (event) => {
    state.query = event.target.value;
    state.visible = 24;
    render();
    queueMicrotask(() => {
      const input = app.querySelector('#search');
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  });
  app.querySelector('#type')?.addEventListener('change', (event) => { state.type = event.target.value; state.visible = 24; render(); });
  app.querySelector('#more')?.addEventListener('click', () => { state.visible += 24; render(); });
  app.querySelectorAll('[data-vendor]').forEach((button) => button.addEventListener('click', () => { state.vendor = button.dataset.vendor; state.visible = 24; render(); }));
}

function render() {
  state.view = routeView();
  const rows = state.view === 'next' ? actionableQueue : state.view === 'relics' ? data.vaulted : state.view === 'vendors' ? vendorQueue : state.view === 'foundry' ? [...data.owned, ...materialQueue] : data.arsenal;
  app.innerHTML = `${masthead()}${freshness()}${hero()}${secondaryNavigation()}${controls(rows)}${content()}${footer()}`;
  bind();
}

window.addEventListener('hashchange', () => { state.query = ''; state.visible = 24; render(); });
if (!location.hash) history.replaceState(null, '', '#plan/next');
render();
