const [data, availability, overrides] = await Promise.all([
  fetch('./data/warframe.json').then(check),
  fetch('./data/availability.json').then(check),
  fetch('./data/overrides.json').then(check),
]).catch((error) => {
  document.querySelector('#app').innerHTML = `<div class="error">Tracker data could not be loaded.<br>${escapeHtml(error.message)}</div>`;
  throw error;
});

function check(response) {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

const materialNames = new Set(['Lenz', 'Catabolyst', 'Kreska', 'Tatsu', 'Sibear']);
const activeNightwave = new Set(availability.activeNightwaveItems);
const settledAt40 = new Set(overrides.settledAt40);
const isNightwave = (item) => item.route.toLowerCase().includes('nightwave cred offerings');
const actionableQueue = data.queue.filter((item) => !isNightwave(item) || activeNightwave.has(item.item));
const hiddenNightwave = data.queue.length - actionableQueue.length;
const views = [
  ['next', 'Acquire next', actionableQueue.length],
  ['materials', 'Materials', materialNames.size],
  ['rank40', 'Rank 40', data.rank40.filter((x) => x.status === 'Active').length],
  ['vaulted', 'Vaulted', data.vaulted.length],
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
  return `<article class="item-card"><div class="item-topline"><div><h3>${escapeHtml(item.item)}</h3><p class="meta">${escapeHtml(item.type)} · Rank ${escapeHtml(item.targetRank)}</p></div><span class="pill ${material ? 'amber' : ''}">${material ? 'MATERIALS' : escapeHtml(item.ease.split('—')[0].trim())}</span></div><div class="need"><span>NEEDED</span>${escapeHtml(item.missing)}</div><p class="route">${escapeHtml(item.route)}</p><p class="steps">${escapeHtml(item.steps)}</p><details><summary>Farm tip</summary><p>${escapeHtml(item.tip)}</p></details>${source(item.source)}</article>`;
}
function header() {
  const label = views.find(([id]) => id === state.view)?.[1] ?? '';
  const quickWins = actionableQueue.filter((x) => x.ease.startsWith('2')).length;
  return `<header class="masthead"><div class="brand-mark">WF</div><div class="brand-copy"><span>JANTJE'S ARSENAL</span><h1>Acquisition Tracker</h1></div><div class="sync"><i></i> Updated ${escapeHtml(data.meta.snapshotDate)}</div></header><section class="hero"><div><p class="eyebrow">CURRENT OBJECTIVE</p><h2>${state.view === 'next' ? 'Choose the next clean win.' : escapeHtml(label)}</h2><p class="lede">Only the information needed to decide, farm, and move on.</p></div><div class="stat-row"><button data-view="next"><b>${actionableQueue.length}</b><span>active targets</span></button><button data-view="next"><b>${quickWins}</b><span>quick wins</span></button><button data-view="materials"><b>${materialNames.size}</b><span>mats only</span></button><button data-view="rank40"><b>4</b><span>active 40s</span></button></div></section>`;
}
function tabs() {
  return `<nav class="view-tabs" aria-label="Tracker views">${views.map(([id, label, count]) => `<button data-view="${id}" class="${state.view === id ? 'active' : ''}">${label}<span>${count}</span></button>`).join('')}</nav>`;
}
function controls() {
  const types = ['all', ...new Set(actionableQueue.map((x) => x.type))].sort();
  return `<section class="controls"><label class="search"><span>⌕</span><input id="search" value="${escapeHtml(state.query)}" placeholder="Search…" aria-label="Search current view"></label>${state.view === 'next' ? `<select id="type" aria-label="Filter by type">${types.map((type) => `<option value="${escapeHtml(type)}" ${state.type === type ? 'selected' : ''}>${type === 'all' ? 'All types' : escapeHtml(type)}</option>`).join('')}</select>` : ''}</section>`;
}
function content() {
  if (state.view === 'next') {
    const rows = actionableQueue.filter((x) => (state.type === 'all' || x.type === state.type) && matches(x));
    return cardsAndMore(rows, rows.map((x) => queueCard(x)));
  }
  if (state.view === 'materials') {
    const rows = data.queue.filter((x) => materialNames.has(x.item) && matches(x));
    return `<section class="card-grid">${rows.map((x) => queueCard(x, true)).join('')}</section>`;
  }
  if (state.view === 'vaulted') {
    const rows = data.vaulted.filter(matches);
    return cardsAndMore(rows, rows.map((x) => `<article class="item-card muted-card"><div class="item-topline"><div><h3>${escapeHtml(x.item)}</h3><p class="meta">${escapeHtml(x.type)} · Rank ${escapeHtml(x.targetRank)}</p></div><span class="pill violet">TRADE</span></div><div class="need"><span>MISSING</span>${escapeHtml(x.missing)}</div><p class="steps">${escapeHtml(x.steps)}</p><details><summary>Buying tip</summary><p>${escapeHtml(x.tip)}</p></details>${source(x.source)}</article>`));
  }
  if (state.view === 'owned') {
    const rows = data.owned.filter(matches);
    return `<section class="card-grid">${rows.map((x) => `<article class="item-card"><div class="item-topline"><div><h3>${escapeHtml(x.item)}</h3><p class="meta">${escapeHtml(x.type)} · Rank ${escapeHtml(x.targetRank)}</p></div><span class="pill green">OWNED</span></div><div class="need"><span>NEXT</span>${escapeHtml(x.steps)}</div><p class="steps">${escapeHtml(x.tip)}</p>${source(x.source)}</article>`).join('')}</section>`;
  }
  if (state.view === 'rank40') {
    const rows = data.rank40.map((x) => settledAt40.has(x.item) ? { ...x, status: 'Settled at 40', action: 'Complete — no action needed.', formaPlan: 'Five Forma complete' } : x).filter(matches);
    return `<section class="project-list">${rows.map((x) => `<article class="project ${x.status.toLowerCase().split(' ')[0]}"><div><span class="project-status">${escapeHtml(x.status)}</span><h3>${escapeHtml(x.item)}</h3><p>${escapeHtml(x.type)}</p></div><div><span>ACTION</span><p>${escapeHtml(x.action)}</p></div><div><span>FORMA PLAN</span><p>${escapeHtml(x.formaPlan)}</p></div></article>`).join('')}</section>`;
  }
  const rows = data.arsenal.map((x) => settledAt40.has(x.item) ? { ...x, state: 'Settled at 40', targetRank: '40' } : x).filter(matches);
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
  app.innerHTML = `${header()}${tabs()}${controls()}${content()}<footer><span>Snapshot verified ${escapeHtml(data.meta.exportVerifiedAt)}</span><span>${hiddenNightwave} inactive Nightwave items hidden · Ordinary gear → 30</span></footer>`;
  app.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.view; state.query = ''; state.visible = 30; render(); }));
  app.querySelector('#search')?.addEventListener('input', (event) => { state.query = event.target.value; state.visible = 30; render(); queueMicrotask(() => { const input = app.querySelector('#search'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }); });
  app.querySelector('#type')?.addEventListener('change', (event) => { state.type = event.target.value; state.visible = 30; render(); });
  app.querySelector('#more')?.addEventListener('click', () => { state.visible += 30; render(); });
}

render();
