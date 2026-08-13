const root = document.querySelector('#account-app');
const base = './data/account/';
const [context, manifest, loadouts, equipment, focus, currencies, mods, arcanes, rivens, sessions] = await Promise.all([
  json('./data/chatgpt-context.json'), json(base + 'manifest.json'), json(base + 'current-loadouts.json'),
  json(base + 'equipment.json'), json(base + 'focus.json'), json(base + 'currencies.json'),
  json(base + 'mods.json'), json(base + 'arcanes.json'), json(base + 'rivens.json'),
  json('./data/sessions/index.json'),
]).catch((error) => {
  root.innerHTML = `<div class="error">Account data could not be loaded.<br>${escapeHtml(error.message)}</div>`;
  throw error;
});

const state = { view: 'current', query: '', visible: 60 };
const views = [
  ['current', 'Current builds'], ['equipment', 'Equipment'], ['mods', 'Mods'], ['arcanes', 'Arcanes'],
  ['rivens', 'Rivens'], ['resources', 'Resources'], ['focus', 'Focus'], ['sessions', 'Sessions'], ['chatgpt', 'Ask ChatGPT'],
];
const slotNames = { s: 'Warframe', l: 'Primary', p: 'Secondary', m: 'Melee', h: 'Heavy', a: 'Exalted', b: 'Second exalted / companion' };

function json(url) { return fetch(url, { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error(`${response.status} ${url}`); return response.json(); }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[c]); }
function matches(value) { return !state.query || JSON.stringify(value).toLowerCase().includes(state.query.toLowerCase()); }
function formatDate(value) { const date = new Date(value || ''); return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'unknown'; }
function fmt(value) { return Number(value || 0).toLocaleString('en-US'); }
function modsText(rows) { return (rows || []).map((row) => `${row.name} · r${row.rank}`).join(' · ') || 'No installed mods recorded'; }
function pill(text, kind='') { return `<span class="pill ${kind}">${escapeHtml(text)}</span>`; }

function header() {
  const live = context.liveState || {};
  return `<header class="masthead"><a class="brand-mark" href="./" aria-label="Acquisition tracker">WF</a><div class="brand-copy"><span>SANITIZED ACCOUNT DATA</span><h1>Account Console</h1></div><div class="sync"><i></i> Snapshot ${escapeHtml(formatDate(context.accountSnapshotAt))}</div></header>
    <section class="hero account-hero"><div><p class="eyebrow">LATEST OBSERVED STATE</p><h2>${escapeHtml(live.frameCandidate || loadouts.NORMAL?.slots?.s?.item || 'Warframe')}</h2><p class="lede">${escapeHtml(live.mission || live.node || live.phase || 'Latest synchronized account snapshot')} · ${escapeHtml(live.frameConfidence || 'account data')}</p></div>
    <div class="stat-row"><button data-view="equipment"><b>${fmt(manifest.equipment)}</b><span>equipment builds</span></button><button data-view="mods"><b>${fmt(manifest.mods)}</b><span>owned mods</span></button><button data-view="arcanes"><b>${fmt(manifest.arcanes)}</b><span>Arcanes</span></button><button data-view="sessions"><b>${fmt(sessions.sessions?.length)}</b><span>sessions</span></button></div></section>`;
}
function navigation() { return `<nav class="view-tabs" aria-label="Account data views">${views.map(([id,label]) => `<button data-view="${id}" class="${state.view===id?'active':''}">${label}</button>`).join('')}</nav>`; }
function controls() { return state.view === 'current' || state.view === 'focus' || state.view === 'chatgpt' ? '' : `<section class="controls"><label class="search"><span>⌕</span><input id="account-search" value="${escapeHtml(state.query)}" placeholder="Search this view…"></label></section>`; }
function buildCard(slotName, slot) {
  const config = (slot.configurations || []).find((row) => row.name === slot.configuration) || {};
  return `<article class="item-card build-card"><div class="item-topline"><div><p class="eyebrow">${escapeHtml(slotNames[slotName] || slotName)}</p><h3>${escapeHtml(slot.item)}</h3><p class="meta">Configuration ${escapeHtml(slot.configuration)} · ${fmt(slot.formaApplied)} Forma</p></div>${pill(slot.configuration,'green')}</div>
    ${config.helminthAbility ? `<p class="route">Helminth: ${escapeHtml(config.helminthAbility)}</p>` : ''}
    <div class="build-mods">${(config.mods || []).map((mod) => `<span>${escapeHtml(mod.name)} <b>r${fmt(mod.rank)}</b></span>`).join('') || '<span>No installed mods recorded</span>'}</div></article>`;
}
function currentView() {
  return Object.entries(loadouts).map(([mode, preset]) => `<section class="loadout-section"><div class="section-title"><div><p class="eyebrow">${escapeHtml(mode)}</p><h2>${escapeHtml(preset.name)}</h2></div></div><div class="card-grid">${Object.entries(preset.slots || {}).map(([key,slot]) => {
    const item = equipment.find((row) => row.name === slot.item && row.category === slot.category) || {};
    return buildCard(key, { ...item, ...slot });
  }).join('')}</div></section>`).join('');
}
function simpleTable(rows, columns) {
  const filtered = rows.filter(matches).slice(0, state.visible);
  return `<section class="data-table"><div class="data-head">${columns.map(([,label]) => `<span>${label}</span>`).join('')}</div>${filtered.map((row) => `<div class="data-row">${columns.map(([key]) => `<span>${escapeHtml(typeof key === 'function' ? key(row) : row[key])}</span>`).join('')}</div>`).join('')}</section>${rows.filter(matches).length > state.visible ? '<button class="load-more" id="more">Show 60 more</button>' : ''}`;
}
function equipmentView() { return simpleTable(equipment, [['name','Item'],['category','Category'],['formaApplied','Forma'],[(r)=>(r.configurations||[]).length,'Configs'],[(r)=>(r.configurations||[]).map(c=>c.name).join(', '),'Names']]); }
function modsView() { return simpleTable(mods, [['name','Mod'],['owned','Owned'],['rank','Rank'],['maximumRank','Maximum'],['type','Type']]); }
function arcanesView() { return simpleTable(arcanes, [['name','Arcane'],['owned','Owned'],['rank','Rank'],['maximumRank','Maximum'],['type','Type']]); }
function rivensView() { return `<section class="card-grid">${rivens.filter(matches).map((row) => `<article class="item-card"><div class="item-topline"><div><h3>${escapeHtml(row.name)}</h3><p class="meta">${escapeHtml(row.weapon || row.weaponType || 'Veiled')}</p></div>${pill(row.unveiled?'UNVEILED':'VEILED',row.unveiled?'green':'violet')}</div><p class="route">Rank ${fmt(row.rank)}/${fmt(row.maximumRank)} · ${fmt(row.rerolls)} rerolls · MR ${fmt(row.minimumMastery)}</p><pre class="json-preview">${escapeHtml(JSON.stringify(row.stats || {}, null, 2))}</pre></article>`).join('') || '<div class="empty">No matching Rivens.</div>'}</section>`; }
function resourcesView() { return simpleTable(currencies.resources || [], [['name','Resource'],['owned','Owned']]); }
function focusView() { return `<section class="focus-grid"><article class="item-card"><p class="eyebrow">ACTIVE SCHOOL</p><h3>${escapeHtml(focus.activeSchool || 'Unknown')}</h3><pre class="json-preview">${escapeHtml(JSON.stringify(focus.schools || {}, null, 2))}</pre></article><article class="item-card"><p class="eyebrow">INTRINSICS AND SKILLS</p><pre class="json-preview">${escapeHtml(JSON.stringify(focus.intrinsicsAndSkills || {}, null, 2))}</pre></article></section>`; }
function sessionsView() { return simpleTable(sessions.sessions || [], [['startedAt','Started'],[(r)=>Math.round((r.durationSeconds||0)/60)+' min','Duration'],['missionCount','Missions'],['focusEarnedDuringCapture','Focus'],[(r)=>(r.topGains||[]).slice(0,3).map(x=>`${x.item} +${fmt(x.delta)}`).join(' · '),'Top gains']]); }
function chatgptView() {
  const url = new URL('./chatgpt-context.md', location.href).href;
  const prompt = `Open and read ${url}. Treat it as my current sanitized Warframe account and build context. Then answer my question using those exact builds and inventory; verify current Warframe mechanics and recent balance changes before recommending changes. My question: What do you think of my current Titania build and equipped guns?`;
  return `<section class="chatgpt-panel"><p class="eyebrow">REGULAR CHATGPT HANDOFF</p><h2>One URL. Current build. No archaeological dig.</h2><p class="lede">The compact context links to the deeper sanitized account files whenever ChatGPT needs more than the active build.</p><textarea id="chat-prompt" readonly>${escapeHtml(prompt)}</textarea><div class="action-row"><button id="copy-prompt">Copy Titania review prompt</button><a href="chatgpt-context.md" target="_blank">Open readable context</a><a href="data/chatgpt-context.json" target="_blank">Open context JSON</a></div><div class="privacy-box"><strong>Not published:</strong> ${escapeHtml((context.privacy?.excluded || []).join(' · '))}</div></section>`;
}
function content() { return ({ current:currentView, equipment:equipmentView, mods:modsView, arcanes:arcanesView, rivens:rivensView, resources:resourcesView, focus:focusView, sessions:sessionsView, chatgpt:chatgptView })[state.view](); }
function render() {
  root.innerHTML = `${header()}${navigation()}${controls()}${content()}<footer><span>Automatically generated sanitized derivative</span><span><a href="./">Acquisition tracker</a> · <a href="llms.txt">AI index</a></span></footer>`;
  root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { state.view=button.dataset.view; state.query=''; state.visible=60; render(); }));
  root.querySelector('#account-search')?.addEventListener('input', (event) => { state.query=event.target.value; state.visible=60; render(); queueMicrotask(()=>root.querySelector('#account-search')?.focus()); });
  root.querySelector('#more')?.addEventListener('click',()=>{state.visible+=60;render();});
  root.querySelector('#copy-prompt')?.addEventListener('click', async (event) => { await navigator.clipboard.writeText(root.querySelector('#chat-prompt').value); event.target.textContent='Copied'; });
}
render();
