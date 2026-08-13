const root = document.querySelector('#account-app');
const accountBase = './data/account/';

const [context, manifest, loadouts, sessions, acquisition] = await Promise.all([
  json('./data/chatgpt-context.json'),
  json(accountBase + 'manifest.json'),
  json(accountBase + 'current-loadouts.json'),
  json('./data/sessions/index.json'),
  json('./data/warframe.json'),
]).catch((error) => {
  root.innerHTML = `<div class="error">Account data could not be loaded.<br>${escapeHtml(error.message)}</div>`;
  throw error;
});

const cache = { equipment: null, mods: null, arcanes: null, rivens: null, currencies: null, focus: null };
const endpoints = {
  equipment: accountBase + 'equipment.json', mods: accountBase + 'mods.json', arcanes: accountBase + 'arcanes.json',
  rivens: accountBase + 'rivens.json', currencies: accountBase + 'currencies.json', focus: accountBase + 'focus.json',
};
const state = {
  ...routeState(), query: '', visible: 60, type: 'all', configSelections: {}, rivenLevel: 'current', promptPreset: 'review',
  sessionDetails: new Map(), loadingSession: new Set(),
};
const arsenalViews = [
  ['current', 'Active loadout'], ['equipment', 'Equipment'], ['mods', 'Mods'], ['arcanes', 'Arcanes'],
  ['rivens', 'Rivens'], ['resources', 'Resources'], ['focus', 'Focus & Intrinsics'],
];
const schoolNames = { AP_POWER: 'Zenurik', AP_ATTACK: 'Madurai', AP_DEFENSE: 'Vazarin', AP_WARD: 'Unairu', AP_TACTIC: 'Naramon' };
const intrinsicNames = {
  LPS_PILOTING: ['Railjack', 'Piloting'], LPS_GUNNERY: ['Railjack', 'Gunnery'], LPS_TACTICAL: ['Railjack', 'Tactical'],
  LPS_ENGINEERING: ['Railjack', 'Engineering'], LPS_COMMAND: ['Railjack', 'Command'],
  LPS_DRIFT_COMBAT: ['Duviri', 'Combat'], LPS_DRIFT_RIDING: ['Duviri', 'Riding'], LPS_DRIFT_OPPORTUNITY: ['Duviri', 'Opportunity'],
  LPS_DRIFT_ENDURANCE: ['Duviri', 'Endurance'], LPP_SPACE: ['Railjack', 'Unspent Intrinsics'], LPP_DRIFTER: ['Duviri', 'Unspent Intrinsics'],
};
const friendlyCategories = {
  Suits: 'Warframe', LongGuns: 'Primary', Pistols: 'Secondary', Melee: 'Melee', Sentinels: 'Sentinel', SentinelWeapons: 'Companion weapon',
  KubrowPets: 'Companion', MoaPets: 'Companion', SpaceSuits: 'Archwing', SpaceGuns: 'Archgun', SpaceMelee: 'Archmelee', MechSuits: 'Necramech',
  OperatorAmps: 'Amp', Hoverboards: 'K-Drive', DataKnives: 'Parazon', CrewShipHarnesses: 'Plexus', DrifterMelee: 'Drifter melee', SpecialItems: 'Special equipment',
};

function json(url) {
  return fetch(url, { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function fmt(value) { return Number(value || 0).toLocaleString('en-US'); }

function formatDate(value, options = {}) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return 'unknown';
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: options.year === false ? undefined : 'numeric',
    hour: options.dateOnly ? undefined : 'numeric', minute: options.dateOnly ? undefined : '2-digit',
    timeZone: 'America/Los_Angeles',
  });
}

function relativeAge(value) {
  const time = new Date(value || '').getTime();
  if (!Number.isFinite(time)) return 'unknown age';
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function routeState() {
  if (/^#sessions/.test(location.hash)) return { module: 'sessions', view: 'sessions' };
  if (/^#ask/.test(location.hash)) return { module: 'ask', view: 'ask' };
  const match = location.hash.match(/^#arsenal\/(current|equipment|mods|arcanes|rivens|resources|focus)/);
  return { module: 'arsenal', view: match?.[1] || 'current' };
}

function routeFor(module, view) {
  if (module === 'sessions') return '#sessions';
  if (module === 'ask') return '#ask';
  return `#arsenal/${view || 'current'}`;
}

function friendlyConfidence(value) {
  return ({ 'arsenal-selected': 'Selected in Arsenal', 'high-confidence': 'High-confidence observation', 'low-confidence': 'Tentative observation' })[value] || 'Observed by the session tracker';
}

function pill(text, kind = '') { return `<span class="pill ${kind}">${escapeHtml(text)}</span>`; }

function globalNavigation(active) {
  const links = [
    ['plan', './#plan/next', 'Plan'], ['arsenal', '#arsenal/current', 'Arsenal'], ['sessions', '#sessions', 'Sessions'], ['ask', '#ask', 'Ask'],
  ];
  return `<nav class="global-nav" aria-label="Main navigation">${links.map(([id, href, label]) => `<a class="global-nav-link ${active === id ? 'active' : ''}" href="${href}" ${active === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function masthead() {
  return `<header class="masthead"><a class="brand-lockup" href="./#plan/next" aria-label="Jantje's Arsenal home"><img class="brand-mark-image" src="assets/arsenal-mark.png" alt=""><span class="brand-copy"><small>JANTJE'S</small><strong>ARSENAL INTELLIGENCE</strong></span></a>${globalNavigation(state.module)}<div class="sync"><i></i><span>Account captured<br><b>${escapeHtml(formatDate(context.accountSnapshotAt))}</b></span></div></header>`;
}

function freshness() {
  const live = context.liveState || {};
  const accountAge = relativeAge(context.accountSnapshotAt);
  const observedAge = relativeAge(live.observedAt);
  const liveKind = /closed|stopped/i.test(live.phase || '') ? 'stale' : 'live';
  return `<section class="freshness-strip" aria-label="Account freshness">
    <span class="freshness-badge confirmed"><i></i><span><b>Account snapshot</b>${escapeHtml(accountAge)}</span></span>
    <span class="freshness-badge ${liveKind}"><i></i><span><b>Game observation</b>${escapeHtml(observedAge)}</span></span>
    <span class="freshness-badge confirmed"><i></i><span><b>Privacy</b>Sanitized public derivative</span></span>
  </section>`;
}

function currentFrame() { return loadouts.NORMAL?.slots?.s?.item || context.liveState?.frameCandidate || 'Current Arsenal'; }

function currentConfig() { return loadouts.NORMAL?.slots?.s?.configuration || 'A'; }

function currentItems() {
  return Object.values(loadouts.NORMAL?.slots || {}).map((slot) => slot.item).filter(Boolean);
}

function hero() {
  const live = context.liveState || {};
  if (state.module === 'sessions') {
    const last = sessions.sessions?.[0];
    return `<section class="hero account-hero"><div><p class="eyebrow">GAMEPLAY JOURNAL</p><h1>${last ? `${formatDate(last.startedAt, { year: false })} · ${duration(last.durationSeconds)}` : 'No completed sessions yet'}</h1><p class="lede">Missions, meaningful pickups, build changes, and the resource slurry tucked underneath.</p></div><div class="stat-row"><span><b>${fmt(sessions.sessions?.length)}</b><small>published sessions</small></span><span><b>${fmt(last?.missionCount)}</b><small>last missions</small></span><span><b>${fmt(last?.focusEarnedDuringCapture)}</b><small>last Focus</small></span><span><b>${fmt(last?.configurationChangeCount)}</b><small>build changes</small></span></div></section>`;
  }
  if (state.module === 'ask') {
    return `<section class="hero account-hero ai-hero"><div><p class="eyebrow">CHATGPT HANDOFF</p><h1>Ask about the account that actually exists.</h1><p class="lede">One current sanitized context URL, with deep files available when the question needs them.</p></div><div class="hero-orbit" aria-hidden="true"><img src="assets/arsenal-mark.png" alt=""></div></section>`;
  }
  const synchronized = loadouts.NORMAL?.slots?.s?.item;
  const observed = live.frameCandidate;
  const mismatch = synchronized && observed && !synchronized.toLowerCase().includes(observed.toLowerCase());
  return `<section class="hero account-hero"><div><p class="eyebrow">ACTIVE ARSENAL</p><h1>${escapeHtml(currentFrame())} <span>· Config ${escapeHtml(currentConfig())}</span></h1><p class="lede">${escapeHtml(live.mission || live.node || live.phase || 'Latest synchronized snapshot')} · ${escapeHtml(friendlyConfidence(live.frameConfidence))}${live.matchmaking ? ` · ${escapeHtml(String(live.matchmaking).toLowerCase())}` : ''}</p>${mismatch ? `<div class="inline-alert">Observed ${escapeHtml(observed)}, while the synchronized build is ${escapeHtml(synchronized)}.</div>` : ''}</div>
    <div class="slot-strip">${currentItems().slice(0, 7).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div></section>`;
}

function secondaryNavigation() {
  if (state.module !== 'arsenal') return '';
  return `<nav class="view-tabs" aria-label="Arsenal views">${arsenalViews.map(([id, label]) => `<a href="#arsenal/${id}" class="${state.view === id ? 'active' : ''}" ${state.view === id ? 'aria-current="page"' : ''}>${escapeHtml(label)}</a>`).join('')}</nav>`;
}

async function ensureData(view) {
  const needs = {
    current: ['equipment'], equipment: ['equipment'], mods: ['mods', 'equipment'], arcanes: ['arcanes', 'equipment'],
    rivens: ['rivens'], resources: ['currencies'], focus: ['focus'], sessions: [], ask: [],
  }[view] || [];
  await Promise.all(needs.map(async (key) => {
    if (cache[key]) return;
    cache[key] = await json(endpoints[key]);
  }));
}

function matches(value) {
  return !state.query || JSON.stringify(value).toLowerCase().includes(state.query.toLowerCase());
}

function collectionControls(placeholder, options = []) {
  return `<section class="controls collection-toolbar"><label class="search"><span aria-hidden="true">⌕</span><input id="account-search" value="${escapeHtml(state.query)}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}"></label>${options.length ? `<select id="account-type" aria-label="Filter collection"><option value="all">All types</option>${options.map((value) => `<option value="${escapeHtml(value)}" ${state.type === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select>` : ''}</section>`;
}

function modeSlotLabel(mode, key, slot) {
  const category = slot.category;
  if (mode === 'NORMAL') return ({ s: 'Warframe', l: 'Primary', p: 'Secondary', m: 'Melee', h: 'Heavy weapon', a: /Pixia|Regulator|Slinger|Erupt/i.test(slot.item) ? 'Exalted secondary' : 'Exalted weapon', b: /Diwata|Claw|Talons/i.test(slot.item) ? 'Exalted melee' : 'Second exalted' })[key] || friendlyCategories[category] || key;
  if (mode === 'SENTINEL') return category === 'SentinelWeapons' ? 'Companion weapon' : category === 'SpecialItems' ? 'Companion claws' : 'Companion';
  if (mode === 'ARCHWING') return friendlyCategories[category] || 'Archwing equipment';
  if (mode === 'MECH') return friendlyCategories[category] || (key === 'a' ? 'Exalted weapon' : 'Necramech equipment');
  if (mode === 'KDRIVE') return 'K-Drive';
  if (mode === 'OPERATOR') return 'Operator Amp';
  if (mode === 'OPERATOR_ADULT') return 'Drifter Amp';
  if (mode === 'DRIFTER') return 'Drifter melee';
  if (mode === 'DATAKNIFE') return category === 'DataKnives' ? 'Parazon' : category === 'CrewShipHarnesses' ? 'Plexus' : friendlyCategories[category] || key;
  return friendlyCategories[category] || key;
}

function resolveEquipment(slot) {
  const rows = cache.equipment || [];
  if (slot.buildRef) {
    const exact = rows.find((row) => row.buildRef === slot.buildRef);
    return exact ? { item: exact, ambiguous: false } : { item: null, ambiguous: true };
  }
  const candidates = rows.filter((row) => row.name === slot.item && row.category === slot.category);
  return candidates.length === 1 ? { item: candidates[0], ambiguous: false } : { item: null, ambiguous: candidates.length > 1, candidates };
}

function configKey(mode, key, slot) { return `${mode}:${key}:${slot.buildRef || `${slot.category}:${slot.item}`}`; }

function selectedConfiguration(mode, key, slot, item) {
  const configs = item?.configurations || [];
  const selected = state.configSelections[configKey(mode, key, slot)];
  if (Number.isFinite(selected)) return configs[selected] || configs[0] || {};
  return configs.find((row) => row.name === slot.configuration)
    || configs.find((row) => String(row.index) === String(slot.configIndex))
    || configs[0] || {};
}

function isArcane(mod) {
  if (mod.kind === 'arcane') return true;
  return /^(Arcane|Cascadia|Emergence|Eternal|Exodia|Magus|Molt|Pax|Primary |Secondary |Melee |Theorem |Virtuos )|Merciless$|Deadhead$|Dexterity$/i.test(mod.name || '');
}

function friendlyLens(value) {
  if (!value) return '';
  const match = String(value).match(/^(Power|Attack|Defense|Ward|Tactic) Lens( Greater)?$/i);
  if (!match) return friendlyFallback(value);
  const school = schoolNames[`AP_${match[1].toUpperCase()}`] || match[1];
  return `${match[2] ? 'Greater ' : ''}${school} Lens`;
}

function polarityName(value) {
  return ({ AP_ATTACK: 'Madurai', AP_DEFENSE: 'Vazarin', AP_TACTIC: 'Naramon', AP_POWER: 'Zenurik', AP_WARD: 'Unairu', AP_ANY: 'Universal', AP_UNIVERSAL: 'Universal' })[value] || friendlyFallback(value);
}

function shardName(row) {
  const color = String(row.color || '').toUpperCase();
  const hue = color.includes('GREEN') ? 'Emerald' : color.includes('PURPLE') ? 'Violet' : color.includes('YELLOW') ? 'Amber' : color.includes('RED') ? 'Crimson' : color.includes('BLUE') ? 'Azure' : 'Archon';
  const tier = color.includes('MYTHIC') ? 'Tauforged ' : '';
  const effect = friendlyFallback(row.effect).replace(/^Archon Crystal Upgrade /i, '').replace(/ Mythic$/i, '');
  return `${tier}${hue}: ${effect}`;
}

function friendlyFallback(value) {
  return String(value || 'Unresolved game key')
    .replace(/<[^>]*>/g, ' ').replace(/^.*\//, '').replace(/^ACC_/, '').replace(/_/g, ' ').replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildCard(mode, key, slot, open = false) {
  const resolved = resolveEquipment(slot);
  const item = resolved.item;
  const config = selectedConfiguration(mode, key, slot, item);
  const configs = item?.configurations || [];
  const configIndex = Math.max(0, configs.indexOf(config));
  const allUpgrades = [...(config.mods || []), ...(config.arcanes || [])];
  const arcanes = allUpgrades.filter(isArcane);
  const mods = allUpgrades.filter((row) => !isArcane(row));
  const label = modeSlotLabel(mode, key, slot);
  const detailId = `build-${slug(mode)}-${slug(key)}-${slug(slot.item)}`;
  return `<article class="slot-card build-card ${resolved.ambiguous ? 'has-warning' : ''}"><div class="slot-card-head"><div><p class="eyebrow">${escapeHtml(label)}</p><h3>${escapeHtml(slot.item)}</h3><p>${escapeHtml(friendlyCategories[slot.category] || slot.category)} · ${fmt(item?.formaApplied ?? slot.formaApplied)} Forma</p></div>${pill(config.name || slot.configuration || 'A', 'green')}</div>
    ${configs.length > 1 ? `<div class="mode-switcher config-switcher" aria-label="${escapeHtml(slot.item)} configurations">${configs.map((row, index) => `<button data-config-key="${escapeHtml(configKey(mode, key, slot))}" data-config-index="${index}" class="mode-button ${index === configIndex ? 'active' : ''}">${escapeHtml(row.name || String.fromCharCode(65 + index))}${row.name === slot.configuration ? '<small>active</small>' : ''}</button>`).join('')}</div>` : ''}
    ${resolved.ambiguous ? `<div class="data-warning"><strong>Ambiguous legacy snapshot.</strong> This older public file removed the private instance ID before assigning a safe build reference, so the site will not guess which duplicate is selected.</div>` : ''}
    <details class="build-detail" id="${detailId}" ${open ? 'open' : ''}><summary>${open ? 'Build details' : 'Open build details'} <span>${mods.length} mods · ${arcanes.length} arcanes</span></summary>
      ${item ? `<div class="build-groups">
        ${config.helminthAbility ? buildGroup('Helminth', [config.helminthAbility]) : ''}
        ${mods.length ? buildGroup('Installed mods', mods.map((row) => `${row.name} · r${fmt(row.rank)}`), 'mods') : buildGroup('Installed mods', ['No mods recorded'])}
        ${arcanes.length ? buildGroup('Arcanes', arcanes.map((row) => `${row.name} · r${fmt(row.rank)}`), 'arcanes') : ''}
        ${item.focusLens ? buildGroup('Focus Lens', [friendlyLens(item.focusLens)]) : ''}
        ${item.archonShards?.length ? buildGroup('Archon Shards', item.archonShards.map(shardName), 'shards') : ''}
        ${item.modularParts?.length ? buildGroup('Modular parts', item.modularParts.map(friendlyFallback)) : ''}
        ${item.polarities?.length ? buildGroup('Polarities', item.polarities.map((row) => `Slot ${fmt(row.slot + 1)} · ${polarityName(row.polarity)}`)) : ''}
      </div>` : ''}
    </details></article>`;
}

function buildGroup(title, values, kind = '') {
  return `<section class="build-group ${kind}"><h4>${escapeHtml(title)}</h4><div>${values.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}</div></section>`;
}

function loadoutSection(mode, options = {}) {
  const preset = loadouts[mode];
  if (!preset) return '';
  const ordered = Object.entries(preset.slots || {}).sort(([a], [b]) => ['s', 'l', 'p', 'm', 'h', 'a', 'b'].indexOf(a) - ['s', 'l', 'p', 'm', 'h', 'a', 'b'].indexOf(b));
  return `<section class="loadout-section"><div class="section-title"><div><p class="eyebrow">${escapeHtml(options.label || mode)}</p><h2>${escapeHtml(options.title || preset.name || 'Current loadout')}</h2>${options.copy ? `<p>${escapeHtml(options.copy)}</p>` : ''}</div></div><div class="slot-card-grid">${ordered.map(([key, slot], index) => buildCard(mode, key, slot, options.openFirst && index === 0)).join('')}</div></section>`;
}

function currentView() {
  const specialized = ['ARCHWING', 'MECH', 'OPERATOR', 'OPERATOR_ADULT', 'DRIFTER', 'KDRIVE', 'DATAKNIFE'].filter((mode) => loadouts[mode]);
  const diagnostics = ['NORMAL_PVP', 'LUNARO'].filter((mode) => loadouts[mode]);
  return `<section class="overview-grid"><article class="overview-card"><p class="eyebrow">ACCOUNT SOURCE</p><h3>Direct synchronized build data</h3><p>Snapshot ${escapeHtml(formatDate(context.accountSnapshotAt))}. Exact safe build references are used when available; legacy duplicates are never guessed.</p></article><article class="overview-card violet"><p class="eyebrow">REGULAR CHATGPT</p><h3>Review the active build</h3><p>The Ask page generates a current frame-aware prompt and links the complete sanitized files.</p><a href="#ask">Open Ask</a></article></section>
    ${loadoutSection('NORMAL', { label: 'WARFRAME LOADOUT', title: loadouts.NORMAL?.name || currentFrame(), openFirst: true })}
    ${loadoutSection('SENTINEL', { label: 'COMPANION', title: loadouts.SENTINEL?.name || 'Current companion' })}
    ${specialized.length ? `<details class="diagnostic-details specialized-loadouts"><summary>Vehicles, Operator, and specialized gear <span>${specialized.length} loadouts</span></summary>${specialized.map((mode) => loadoutSection(mode, { label: friendlyMode(mode) })).join('')}</details>` : ''}
    ${diagnostics.length ? `<details class="diagnostic-details"><summary>Advanced game modes <span>${diagnostics.length} diagnostic loadouts</span></summary>${diagnostics.map((mode) => loadoutSection(mode, { label: friendlyMode(mode) })).join('')}</details>` : ''}`;
}

function friendlyMode(mode) {
  return ({ ARCHWING: 'ARCHWING', MECH: 'NECRAMECH', OPERATOR: 'OPERATOR', OPERATOR_ADULT: 'DRIFTER AMP', DRIFTER: 'DRIFTER MELEE', KDRIVE: 'K-DRIVE', DATAKNIFE: 'PARAZON & PLEXUS', NORMAL_PVP: 'CONCLAVE', LUNARO: 'LUNARO' })[mode] || mode;
}

function slug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function friendlyCategory(value) { return friendlyCategories[value] || friendlyFallback(value); }

function equipmentView() {
  const types = [...new Set((cache.equipment || []).map((row) => friendlyCategory(row.category)))].sort();
  const currentRefs = new Set(Object.values(loadouts).flatMap((preset) => Object.values(preset.slots || {}).map((slot) => slot.buildRef).filter(Boolean)));
  const currentPairs = new Set(Object.values(loadouts).flatMap((preset) => Object.values(preset.slots || {}).map((slot) => `${slot.category}:${slot.item}`)));
  const rows = (cache.equipment || []).filter((row) => (state.type === 'all' || friendlyCategory(row.category) === state.type) && matches(row)).slice(0, state.visible);
  const total = (cache.equipment || []).filter((row) => (state.type === 'all' || friendlyCategory(row.category) === state.type) && matches(row)).length;
  return `${collectionControls('Search equipment, builds, or configuration names', types)}<section class="mobile-card-list equipment-list">${rows.map((row) => {
    const selected = row.buildRef ? currentRefs.has(row.buildRef) : currentPairs.has(`${row.category}:${row.name}`);
    return `<details class="mobile-data-card"><summary><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(friendlyCategory(row.category))}</small></span><span>${selected ? pill('EQUIPPED', 'green') : ''}${fmt(row.formaApplied)} Forma · ${(row.configurations || []).length} configs</span></summary><div class="config-list">${(row.configurations || []).map((config, index) => `<article><h4>${escapeHtml(config.name || String.fromCharCode(65 + index))}</h4><p>${[...(config.mods || []), ...(config.arcanes || [])].length} installed upgrades${config.helminthAbility ? ` · Helminth ${escapeHtml(config.helminthAbility)}` : ''}</p></article>`).join('') || '<p>No configurations recorded.</p>'}</div></details>`;
  }).join('')}</section>${total > state.visible ? '<button class="load-more" id="more">Show 60 more</button>' : ''}`;
}

function aggregateCollection(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = row.name || 'Unresolved';
    const group = groups.get(key) || { name: key, copies: 0, highestRank: 0, maximumRank: 0, ranks: new Map(), type: row.rarity || row.type || '' };
    if (Array.isArray(row.rankStacks)) {
      for (const stack of row.rankStacks) {
        const count = Number(stack.owned ?? stack.count ?? 0);
        const rank = Number(stack.rank || 0);
        group.copies += count;
        group.ranks.set(rank, (group.ranks.get(rank) || 0) + count);
        group.highestRank = Math.max(group.highestRank, rank);
      }
    } else {
      const count = Number(row.owned || 0);
      const rank = Number(row.rank || 0);
      group.copies += count;
      group.ranks.set(rank, (group.ranks.get(rank) || 0) + count);
      group.highestRank = Math.max(group.highestRank, rank);
    }
    group.maximumRank = Math.max(group.maximumRank, Number(row.maximumRank || 0));
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function installedUpgradeNames() {
  const names = new Set();
  for (const preset of Object.values(loadouts)) for (const slot of Object.values(preset.slots || {})) {
    const resolved = resolveEquipment(slot).item;
    if (!resolved) continue;
    const config = (resolved.configurations || []).find((row) => row.name === slot.configuration) || resolved.configurations?.[slot.configIndex || 0];
    for (const row of [...(config?.mods || []), ...(config?.arcanes || [])]) names.add(row.name);
  }
  return names;
}

function rankedCollectionView(kind) {
  const rows = aggregateCollection(cache[kind]);
  const installed = installedUpgradeNames();
  const filtered = rows.filter(matches);
  const visible = filtered.slice(0, state.visible);
  const maxed = rows.filter((row) => row.maximumRank > 0 && row.highestRank >= row.maximumRank).length;
  return `<section class="overview-grid"><article class="overview-card"><p class="eyebrow">UNIQUE ${kind.toUpperCase()}</p><h3>${fmt(rows.length)}</h3><p>${fmt(rows.reduce((sum, row) => sum + row.copies, 0))} total copies across rank stacks.</p></article><article class="overview-card"><p class="eyebrow">MAX RANK OWNED</p><h3>${fmt(maxed)}</h3><p>At least one copy reaches the published maximum rank.</p></article><article class="overview-card"><p class="eyebrow">INSTALLED NOW</p><h3>${fmt(rows.filter((row) => installed.has(row.name)).length)}</h3><p>Appears in a synchronized current loadout.</p></article></section>
    ${collectionControls(`Search owned ${kind}`)}<section class="mobile-card-list">${visible.map((row) => `<article class="mobile-data-card collection-row"><div><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.type || kind.slice(0, -1))}</small></div><div class="rank-summary">${installed.has(row.name) ? pill('INSTALLED', 'green') : ''}<b>${fmt(row.highestRank)}/${fmt(row.maximumRank)}</b><span>${fmt(row.copies)} ${row.copies === 1 ? 'copy' : 'copies'}</span></div><details><summary>Rank stacks</summary><p>${[...row.ranks.entries()].sort((a, b) => b[0] - a[0]).map(([rank, count]) => `r${rank} ×${count}`).join(' · ')}</p></details></article>`).join('')}</section>${filtered.length > state.visible ? '<button class="load-more" id="more">Show 60 more</button>' : ''}`;
}

function stripMarkup(value) {
  const text = String(value || '').replace(/<[^>]*>/g, ' ').replace(/&lt;[^&]*?&gt;/g, ' ');
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value.replace(/\s+/g, ' ').trim();
}

function rivenTraits(row, levelMode) {
  if (row.traits) return { positive: row.traits.positive || [], negative: row.traits.negative || [] };
  if (row.positiveTraits || row.negativeTraits) {
    const readable = (trait) => ({ text: friendlyRivenTrait(trait.trait || trait.name || trait.text || trait), grade: trait.grade });
    return { positive: (row.positiveTraits || []).map(readable), negative: (row.negativeTraits || []).map(readable) };
  }
  const variants = Array.isArray(row.stats) ? row.stats : [];
  const variant = variants.find((entry) => entry.weaponName === row.weapon) || variants[0];
  const levels = variant?.byLevel || [];
  const target = levelMode === 'maximum' ? Number(row.maximumRank || 8) : Number(row.rank || 0);
  const level = levels.find((entry) => Number(entry.level) === target) || levels.at(-1) || {};
  return {
    positive: (level.positiveTraits || []).map((trait) => ({ text: stripMarkup(trait.description), grade: trait.grade })),
    negative: (level.negativeTraits || []).map((trait) => ({ text: stripMarkup(trait.description), grade: trait.grade })),
  };
}

function friendlyRivenTrait(value) {
  const exact = {
    'Weapon Ammo Max Mod': 'Maximum Ammo',
    'Weapon Clip Max Mod': 'Magazine Capacity',
    'Weapon Crit Damage Mod': 'Critical Damage',
    'Weapon Damage Amount Mod': 'Base Damage',
    'Weapon Electricity Damage Mod': 'Electricity Damage',
    'Weapon Faction Damage Infested': 'Damage to Infested',
    'Weapon Fire Damage Mod': 'Heat Damage',
    'Weapon Fire Iterations Mod': 'Multishot',
    'Weapon Fire Rate Mod': 'Attack / Fire Rate',
    'Weapon Freeze Damage Mod': 'Cold Damage',
    'Weapon Proc Time Mod': 'Status Duration',
    'Weapon Puncture Depth Mod': 'Punch Through',
    'Weapon Reload Speed Mod': 'Reload Speed',
    'Weapon Slash Damage Mod': 'Slash Damage',
    'Weapon Toxin Damage Mod': 'Toxin Damage',
  };
  return exact[value] || friendlyFallback(value).replace(/^Weapon /i, '').replace(/ Mod$/i, '');
}

function rivensView() {
  const rows = (cache.rivens || []).filter(matches);
  const owned = rows.reduce((sum, row) => sum + Number(row.owned || 1), 0);
  return `<section class="section-toolbar"><div><p class="eyebrow">RIVEN INVENTORY</p><h2>${fmt(owned)} owned Rivens · ${fmt(rows.length)} entries</h2><p>Current ownership and trait identities come from the direct snapshot. Opaque trait values stay unpublished instead of being dressed up as confident bullshit.</p></div><div class="mode-switcher"><button data-riven-level="current" class="mode-button ${state.rivenLevel === 'current' ? 'active' : ''}">Current rank</button><button data-riven-level="maximum" class="mode-button ${state.rivenLevel === 'maximum' ? 'active' : ''}">Max rank</button></div></section>${collectionControls('Search Rivens or compatible weapons')}<section class="card-grid riven-grid">${rows.map((row) => {
    const traits = rivenTraits(row, state.rivenLevel);
    const shownRank = state.rivenLevel === 'maximum' ? row.maximumRank : row.rank;
    const traitMarkup = `${traits.positive.map((trait) => `<li class="trait positive"><span>+</span>${escapeHtml(trait.text || trait)}${trait.grade ? `<small>${escapeHtml(trait.grade)}</small>` : ''}</li>`).join('')}${traits.negative.map((trait) => `<li class="trait negative"><span>−</span>${escapeHtml(trait.text || trait)}${trait.grade ? `<small>${escapeHtml(trait.grade)}</small>` : ''}</li>`).join('')}`;
    return `<article class="item-card riven-card"><div class="item-topline"><div><p class="eyebrow">${escapeHtml(row.weapon || row.weaponType || 'VEILED')}</p><h3>${escapeHtml(row.name || `${row.weapon || 'Veiled'} Riven`)}</h3></div>${pill(row.unveiled === false ? `VEILED ×${fmt(row.owned)}` : `RANK ${fmt(shownRank)}`, row.unveiled === false ? 'violet' : 'green')}</div>${row.unveiled === false ? `<div class="riven-meta"><span>${fmt(row.owned)} owned</span><span>${escapeHtml(row.weaponType || 'Unknown class')}</span></div>` : `<div class="riven-meta"><span>MR ${fmt(row.minimumMastery)}</span><span>${fmt(row.rerolls)} rerolls</span><span>${escapeHtml(polarityName(row.polarity || 'No polarity'))}</span></div>`}
      ${/not decoded|summary-only/i.test(row.detailsStatus || '') ? `<div class="data-warning">Direct ownership and trait identities confirmed; numeric trait values are intentionally not decoded.</div>` : ''}
      <ul class="trait-list">${traitMarkup || '<li class="trait empty-trait">No decoded traits published.</li>'}</ul></article>`;
  }).join('') || '<div class="empty">No matching Rivens.</div>'}</section>`;
}

function syndicateName(value) {
  const map = { VentKidsSyndicate: 'Ventkids', SolarisSyndicate: 'Solaris United', CetusSyndicate: 'Ostron', NewLokaSyndicate: 'New Loka', PerrinSyndicate: 'The Perrin Sequence', RedVeilSyndicate: 'Red Veil', SteelMeridianSyndicate: 'Steel Meridian', ArbitersSyndicate: 'Arbiters of Hexis', CephalonSudaSyndicate: 'Cephalon Suda', LibrarySyndicate: 'Cephalon Simaris', QuillsSyndicate: 'The Quills', VoxSyndicate: 'Vox Solaris', NecraloidSyndicate: 'Necraloid', EntratiSyndicate: 'Entrati', ConclaveSyndicate: 'Conclave', KahlSyndicate: "Kahl's Garrison", EntratiLabSyndicate: 'Cavia', ZarimanSyndicate: 'The Holdfasts', HexSyndicate: 'The Hex', NightcapJournalSyndicate: 'Nightcap' };
  return map[value] || (String(value).startsWith('RadioLegion') ? 'Nightwave' : friendlyFallback(value).replace(/ Syndicate$/, ''));
}

function requiredResources() {
  const required = new Map();
  for (const row of [...(acquisition.queue || []), ...(acquisition.vaulted || [])]) for (const part of String(row.missing || '').split(';')) {
    const match = part.trim().match(/^(.+?) \(([\d,]+)\/([\d,]+)\)$/);
    if (!match) continue;
    required.set(match[1], { owned: Number(match[2].replaceAll(',', '')), required: Number(match[3].replaceAll(',', '')), target: row.item });
  }
  return required;
}

function resourcesView() {
  const currencies = cache.currencies || {};
  const needs = requiredResources();
  const resourceByName = new Map((currencies.resources || []).map((row) => [row.name.toLowerCase(), row]));
  const watched = [...needs.entries()].map(([name, need]) => ({ name, owned: resourceByName.get(name.toLowerCase())?.owned ?? need.owned, ...need })).filter((row) => row.owned < row.required);
  const rows = (currencies.resources || []).filter(matches).slice(0, state.visible);
  const total = (currencies.resources || []).filter(matches).length;
  return `<section class="overview-grid balances-grid"><article class="overview-card"><p class="eyebrow">CREDITS</p><h3>${fmt(currencies.balances?.credits)}</h3></article><article class="overview-card"><p class="eyebrow">ENDO</p><h3>${fmt(currencies.balances?.endo)}</h3></article><article class="overview-card"><p class="eyebrow">WATCHED MATERIALS</p><h3>${fmt(watched.length)}</h3><p>Still short for a current acquisition target.</p></article></section>
    ${watched.length ? `<section class="section-title"><div><p class="eyebrow">REQUIRED BY CURRENT TARGETS</p><h2>Watched resources</h2></div></section><section class="card-grid compact-grid">${watched.map((row) => `<article class="item-card resource-target"><h3>${escapeHtml(row.name)}</h3><p>${fmt(row.owned)} / ${fmt(row.required)}</p><div class="progress"><span style="width:${Math.min(100, row.owned / row.required * 100)}%"></span></div><small>Needed for ${escapeHtml(row.target)}</small></article>`).join('')}</section>` : ''}
    <section class="section-title"><div><p class="eyebrow">STANDING</p><h2>Syndicates</h2></div></section><section class="intrinsic-grid syndicate-grid">${(currencies.syndicates || []).map((row) => `<article class="intrinsic-row"><span><strong>${escapeHtml(syndicateName(row.syndicate))}</strong><small>Rank ${fmt(row.rank)}</small></span><b>${fmt(row.standing)}</b></article>`).join('')}</section>
    <section class="section-title"><div><p class="eyebrow">ALL PUBLISHED INVENTORY COUNTS</p><h2>Resources and components</h2></div></section>${collectionControls('Search resources, relics, tokens, or components')}<section class="data-table two-column" role="table"><div class="data-head" role="row"><span>Name</span><span>Owned</span></div>${rows.map((row) => `<div class="data-row" role="row"><strong>${escapeHtml(friendlyFallback(row.name))}</strong><span>${fmt(row.owned)}</span></div>`).join('')}</section>${total > state.visible ? '<button class="load-more" id="more">Show 60 more</button>' : ''}`;
}

function focusSchoolName(active) {
  const value = String(active || '');
  if (/Power/i.test(value)) return 'Zenurik';
  if (/Attack/i.test(value)) return 'Madurai';
  if (/Defense/i.test(value)) return 'Vazarin';
  if (/Ward/i.test(value)) return 'Unairu';
  if (/Tactic/i.test(value)) return 'Naramon';
  return friendlyFallback(value);
}

function focusView() {
  const focus = cache.focus || {};
  const active = focusSchoolName(focus.activeSchool);
  const schoolRows = Object.entries(focus.schools || {}).map(([key, points]) => ({ key, name: schoolNames[key] || friendlyFallback(key), points }));
  const intrinsicGroups = { Railjack: [], Duviri: [] };
  const intrinsics = focus.intrinsicsAndSkills || {};
  if (intrinsics.railjack || intrinsics.drifter) {
    for (const [name, value] of Object.entries(intrinsics.railjack || {})) intrinsicGroups.Railjack.push({ name, value, pool: false });
    for (const [name, value] of Object.entries(intrinsics.drifter || {})) intrinsicGroups.Duviri.push({ name, value, pool: false });
    if (intrinsics.progressCounters?.railjack != null) intrinsicGroups.Railjack.push({ name: 'Progress counter', value: intrinsics.progressCounters.railjack, pool: true, label: 'Published account counter' });
    if (intrinsics.progressCounters?.drifter != null) intrinsicGroups.Duviri.push({ name: 'Progress counter', value: intrinsics.progressCounters.drifter, pool: true, label: 'Published account counter' });
  } else {
    for (const [key, value] of Object.entries(intrinsics)) {
      const [group, name] = intrinsicNames[key] || ['Other', friendlyFallback(key)];
      if (intrinsicGroups[group]) intrinsicGroups[group].push({ name, value, pool: key.startsWith('LPP_') });
    }
  }
  return `<section class="focus-school-grid">${schoolRows.map((row) => `<article class="focus-school-card ${row.name === active ? 'active' : ''}"><div><p class="eyebrow">${row.name === active ? 'ACTIVE SCHOOL' : 'FOCUS SCHOOL'}</p><h3>${escapeHtml(row.name)}</h3></div><strong>${fmt(row.points)}</strong><span>unspent Focus</span></article>`).join('')}</section>
    ${Object.entries(intrinsicGroups).map(([group, rows]) => `<section class="loadout-section"><div class="section-title"><div><p class="eyebrow">INTRINSICS</p><h2>${group}</h2></div></div><div class="intrinsic-grid">${rows.map((row) => row.pool ? `<article class="intrinsic-row pool"><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.label || 'Available points')}</small></span><b>${fmt(row.value)}</b></article>` : `<article class="intrinsic-row"><span><strong>${escapeHtml(row.name)}</strong><small>Rank ${fmt(row.value)} / 10</small></span><div class="progress"><span style="width:${Math.min(100, Number(row.value) * 10)}%"></span></div></article>`).join('')}</div></section>`).join('')}
    <details class="diagnostic-details"><summary>Unlocked Focus nodes <span>${fmt(focus.unlockedNodes?.length)}</span></summary><div class="node-list">${(focus.unlockedNodes || []).map((row) => `<span>${escapeHtml(friendlyFallback(typeof row === 'string' ? row : row.name))}${typeof row === 'object' && row.level != null ? ` · r${fmt(row.level)}` : ''}</span>`).join('')}</div></details>`;
}

function duration(seconds) {
  const minutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${rest ? ` ${rest}m` : ''}`;
}

function notableGains(rows) {
  const notable = (rows || []).filter((row) => /Blueprint| Prime |Prime$|Relic|Intact|Radiant|Exceptional|Flawless|Mk I{1,3}$|Weapon|Neuroptics|Chassis|Systems|Barrel|Receiver|Stock|Blade|Handle/i.test(row.item));
  return notable.length ? notable : (rows || []).slice(0, 6);
}

function sessionsView() {
  const rows = sessions.sessions || [];
  return `<section class="session-list">${rows.map((row, index) => {
    const details = state.sessionDetails.get(row.file);
    const gains = details ? (details.notableAcquisitions || notableGains(details.positiveItemDeltas)) : (row.notableAcquisitions || notableGains(row.topGains));
    const summaryGains = gains.slice(0, 8);
    return `<article class="session-card"><header><div><p class="eyebrow">SESSION ${fmt(rows.length - index)}</p><h2>${escapeHtml(formatDate(row.startedAt))}</h2><p>${duration(row.durationSeconds)} · ${fmt(row.missionCount)} missions · ${fmt(row.focusEarnedDuringCapture)} Focus</p></div>${row.errorEventCount ? pill(`${row.errorEventCount} ERRORS`, 'amber') : pill('CLEAN CAPTURE', 'green')}</header>
      <div class="session-metrics"><span><b>${fmt(row.missionCount)}</b>missions</span><span><b>${fmt(row.focusEarnedDuringCapture)}</b>Focus</span><span><b>${fmt(row.configurationChangeCount)}</b>build changes</span></div>
      <div class="session-gains"><p class="eyebrow">NOTABLE GAINS</p>${summaryGains.map((gain) => `<span>${escapeHtml(gain.item)} <b>+${fmt(gain.delta)}</b></span>`).join('') || '<span>No item changes recorded</span>'}${gains.length > summaryGains.length ? `<small>+${fmt(gains.length - summaryGains.length)} more in the full story</small>` : ''}</div>
      <details class="session-detail" data-session="${escapeHtml(row.file)}" ${details ? 'open' : ''}><summary>${details ? 'Session detail' : 'Load the full session story'}</summary><div class="session-detail-body">${state.loadingSession.has(row.file) ? '<div class="loading-inline">Loading session…</div>' : details ? sessionDetail(details) : '<p>Mission route, configuration changes, notable acquisitions, and resource gains.</p>'}</div></details>
    </article>`;
  }).join('') || '<div class="empty">No completed public sessions yet.</div>'}</section>`;
}

function sessionDetail(detail) {
  const missions = detail.missions || [];
  const changes = detail.configurationChanges || [];
  const notable = detail.notableAcquisitions || notableGains(detail.positiveItemDeltas);
  const salvage = detail.railjackSalvage || [];
  const resources = (detail.resourceGains || (detail.positiveItemDeltas || []).filter((row) => !notable.includes(row) && !salvage.includes(row))).slice(0, 20);
  return `<section class="session-story"><div><p class="eyebrow">MISSION ROUTE</p><ol>${missions.map((mission) => `<li><strong>${escapeHtml(mission.label || mission.type || mission.node)}</strong><span>${duration(mission.durationSeconds)}${mission.steelPath ? ' · Steel Path' : ''}</span></li>`).join('')}</ol></div>
    ${changes.length ? `<div><p class="eyebrow">BUILD CHANGES</p>${changes.map((change) => `<article class="change-card"><strong>${escapeHtml(change.item)} · ${escapeHtml(change.configuration)}</strong><span>${change.added?.length ? `Added ${escapeHtml(change.added.join(', '))}` : ''}${change.added?.length && change.removed?.length ? ' · ' : ''}${change.removed?.length ? `Removed ${escapeHtml(change.removed.join(', '))}` : ''}</span></article>`).join('')}</div>` : ''}
    <div><p class="eyebrow">NOTABLE ACQUISITIONS</p><div class="gain-grid">${notable.map((gain) => `<span>${escapeHtml(gain.item)} <b>+${fmt(gain.delta)}</b></span>`).join('') || '<span>None recorded</span>'}</div></div>
    ${salvage.length ? `<details><summary>Railjack salvage <span>${fmt(salvage.reduce((sum, row) => sum + Number(row.delta || 0), 0))} drops</span></summary><div class="gain-grid muted">${salvage.map((gain) => `<span>${escapeHtml(gain.item)} <b>+${fmt(gain.delta)}</b></span>`).join('')}</div></details>` : ''}
    ${resources.length ? `<details><summary>Resource gains</summary><div class="gain-grid muted">${resources.map((gain) => `<span>${escapeHtml(gain.item)} <b>+${fmt(gain.delta)}</b></span>`).join('')}</div></details>` : ''}</section>`;
}

const promptPresets = {
  review: 'Review my current loadout and each equipped weapon. Identify synergies, weak slots, and changes I can make with mods and Arcanes I actually own.',
  farm: 'Using my exact missing items, owned relics, Foundry state, and current live rotations, what should I farm next? Give an exact node, stop condition, and why it is the best overlap.',
  sell: 'Audit what I can safely sell without consuming something needed for mastery, Foundry recipes, Incarnon adapters, or hard-to-replace equipment.',
  riven: 'Which of my current Rivens most deserves Kuva? Compare the actual current traits, weapon value, and opportunity cost; do not invent a verdict when data is incomplete.',
  compare: `Compare every published configuration for ${currentFrame()}, especially Config A and any renamed configurations. Explain the intended job of each build and exact differences.`,
  recap: 'Recap my last completed session as a gaming journal: missions, meaningful acquisitions, build changes, Focus, and only then the bulk resources.',
};

function promptText() {
  const url = new URL('./chatgpt-context.md', location.href).href;
  return `Open and read ${url}. Treat it as my current sanitized Warframe account, loadout, acquisition, and session context. Follow its deeper links when needed. Distinguish the live observation timestamp from the synchronized account snapshot, and verify current Warframe mechanics and the latest patch notes before making recommendations.\n\nMy question: ${promptPresets[state.promptPreset] || promptPresets.review}`;
}

function askView() {
  const presets = [['review', 'Review current loadout'], ['farm', 'What should I farm?'], ['sell', 'What can I sell?'], ['riven', 'Which Riven gets Kuva?'], ['compare', 'Compare configurations'], ['recap', 'Recap last session']];
  return `<section class="chatgpt-panel"><p class="eyebrow">ONE URL. CURRENT BUILD. NO ARCHAEOLOGICAL DIG.</p><h2>Ask regular ChatGPT about ${escapeHtml(currentFrame())}—or the whole account.</h2><p class="lede">Choose a question, edit it if you like, then copy a prompt that points ChatGPT at the current sanitized context and deeper account files.</p><div class="ai-presets">${presets.map(([id, label]) => `<button data-prompt-preset="${id}" class="${state.promptPreset === id ? 'active' : ''}">${escapeHtml(label)}</button>`).join('')}</div><label class="prompt-label" for="chat-prompt">Prompt</label><textarea id="chat-prompt">${escapeHtml(promptText())}</textarea><div class="prompt-actions"><button id="copy-prompt">Copy prompt</button><a href="https://chatgpt.com/" target="_blank" rel="noopener">Open ChatGPT</a><button id="copy-context">Copy context URL</button><a href="chatgpt-context.md" target="_blank">Open readable context</a></div><p class="copy-status" id="copy-status" aria-live="polite"></p><details class="diagnostic-details privacy-details"><summary>What is public?</summary><p>Current sanitized builds, gameplay inventory counts, acquisition state, and published sessions. Excluded: ${(context.privacy?.excluded || []).map(escapeHtml).join(' · ')}</p></details></section>`;
}

function content() {
  if (state.module === 'sessions') return sessionsView();
  if (state.module === 'ask') return askView();
  return ({ current: currentView, equipment: equipmentView, mods: () => rankedCollectionView('mods'), arcanes: () => rankedCollectionView('arcanes'), rivens: rivensView, resources: resourcesView, focus: focusView })[state.view]();
}

function footer() {
  return `<footer><span>Automatically refreshed, sanitized gameplay derivative</span><span><a href="./#plan/next">Plan</a> · <a href="chatgpt-context.md">ChatGPT context</a> · <a href="llms.txt">AI index</a></span></footer>`;
}

function bind() {
  root.querySelector('#account-search')?.addEventListener('input', (event) => {
    state.query = event.target.value; state.visible = 60; render();
    queueMicrotask(() => { const input = root.querySelector('#account-search'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); });
  });
  root.querySelector('#account-type')?.addEventListener('change', (event) => { state.type = event.target.value; state.visible = 60; render(); });
  root.querySelector('#more')?.addEventListener('click', () => { state.visible += 60; render(); });
  root.querySelectorAll('[data-config-key]').forEach((button) => button.addEventListener('click', () => { state.configSelections[button.dataset.configKey] = Number(button.dataset.configIndex); render(); }));
  root.querySelectorAll('[data-riven-level]').forEach((button) => button.addEventListener('click', () => { state.rivenLevel = button.dataset.rivenLevel; render(); }));
  root.querySelectorAll('[data-prompt-preset]').forEach((button) => button.addEventListener('click', () => { state.promptPreset = button.dataset.promptPreset; render(); }));
  root.querySelector('#copy-prompt')?.addEventListener('click', async () => copyText(root.querySelector('#chat-prompt').value, 'Prompt copied.'));
  root.querySelector('#copy-context')?.addEventListener('click', async () => copyText(new URL('./chatgpt-context.md', location.href).href, 'Context URL copied.'));
  root.querySelectorAll('[data-session]').forEach((details) => details.addEventListener('toggle', async () => {
    if (!details.open || state.sessionDetails.has(details.dataset.session) || state.loadingSession.has(details.dataset.session)) return;
    state.loadingSession.add(details.dataset.session); render();
    try { state.sessionDetails.set(details.dataset.session, await json(`./data/sessions/${details.dataset.session}`)); }
    catch (error) { state.sessionDetails.set(details.dataset.session, { loadError: error.message }); }
    state.loadingSession.delete(details.dataset.session); render();
  }));
}

async function copyText(value, message) {
  try {
    await navigator.clipboard.writeText(value);
    const status = root.querySelector('#copy-status'); if (status) status.textContent = message;
  } catch {
    const textarea = root.querySelector('#chat-prompt'); textarea?.focus(); textarea?.select();
    const status = root.querySelector('#copy-status'); if (status) status.textContent = 'Clipboard access was blocked; the text is selected for manual copy.';
  }
}

function render() {
  root.innerHTML = `${masthead()}${freshness()}${hero()}${secondaryNavigation()}${content()}${footer()}`;
  bind();
}

async function navigate() {
  const route = routeState();
  state.module = route.module; state.view = route.view; state.query = ''; state.type = 'all'; state.visible = 60;
  root.innerHTML = `${masthead()}${freshness()}${hero()}${secondaryNavigation()}<div class="loading-inline page-loading">Loading ${escapeHtml(state.view)}…</div>${footer()}`;
  try { await ensureData(state.view); render(); }
  catch (error) { root.innerHTML = `${masthead()}<div class="error">This account view could not be loaded.<br>${escapeHtml(error.message)}</div>${footer()}`; }
}

window.addEventListener('hashchange', navigate);
if (!location.hash) history.replaceState(null, '', '#arsenal/current');
await navigate();
