const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const data = JSON.parse(fs.readFileSync('data/warframe.json', 'utf8'));
const primeRules = JSON.parse(fs.readFileSync('data/prime-rules.json', 'utf8'));
const appSource = fs.readFileSync('app.js', 'utf8');
const nightwaveCatalog = JSON.parse(fs.readFileSync('data/nightwave-items.json', 'utf8'));
const UNVERIFIED = 'Acquisition route not verified yet';
const nightwaveItems = new Set(nightwaveCatalog.items.map((entry) => entry.item));
const validAvailabilityGroups = new Set(['nightwave', 'dojo', 'baro']);
const kDriveBoards = new Set(['Bad Baby', 'Feverspine', 'Flatbelly', 'Needlenose', 'Runway']);
const permanentRailjackItems = new Set(primeRules.permanentRailjackItems);
const nonRelicPrimeItems = new Set(['Gotva Prime', 'War Prime']);
const validPrimeStatuses = new Set(['RESURGENCE ACTIVE', 'OWNED RELICS', 'PERMANENT SPECIAL RELICS', 'CURRENT RELICS', 'TRADE ONLY', 'DATA INCOMPLETE']);
const validRank40Statuses = new Set(['Active to 40', 'Confirmed at 40', 'Parked at 30', 'Current rank unknown']);
const specializedTypes = {
  Bonewidow: 'necramech',
  Voidrig: 'necramech',
  Amesha: 'archwing',
  Elytron: 'archwing',
  Itzal: 'archwing',
  Odonata: 'archwing',
  'Odonata Prime': 'archwing',
  Arbucep: 'archgun',
  Cortege: 'archgun',
  Corvas: 'archgun',
  'Corvas Prime': 'archgun',
  Cyngas: 'archgun',
  'Dual Decurion': 'archgun',
  Fluctus: 'archgun',
  Grattler: 'archgun',
  Imperator: 'archgun',
  'Imperator Vandal': 'archgun',
  'Kuva Ayanga': 'archgun',
  'Kuva Grattler': 'archgun',
  Larkspur: 'archgun',
  'Larkspur Prime': 'archgun',
  Mandonel: 'archgun',
  Mausolon: 'archgun',
  Morgha: 'archgun',
  Phaedra: 'archgun',
  'Prisma Dual Decurions': 'archgun',
  Velocitus: 'archgun',
  Agkuza: 'archmelee',
  Centaur: 'archmelee',
  Kaszas: 'archmelee',
  Knux: 'archmelee',
  Onorix: 'archmelee',
  'Prisma Veritux': 'archmelee',
  Rathbone: 'archmelee',
  Veritux: 'archmelee',
  'Bad Baby': 'modular',
  Feverspine: 'modular',
  Flatbelly: 'modular',
  Needlenose: 'modular',
  Runway: 'modular',
};
const errors = [];
const relicExactCounts = new Map();
const relicBaseTotals = new Map();
for (const [name, rawCount] of Object.entries(data.meta.relicInventory || {})) {
  const count = Number(rawCount) || 0;
  relicExactCounts.set(name.toLowerCase(), count);
  const base = name.replace(/\s+(?:Intact|Exceptional|Flawless|Radiant)$/i, '').toLowerCase();
  relicBaseTotals.set(base, (relicBaseTotals.get(base) || 0) + count);
}

function fail(collection, row, message) {
  errors.push(`${collection}/${row.item}: ${message}`);
}

function strings(value, path = '') {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((child, index) => strings(child, `${path}[${index}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, child]) => strings(child, path ? `${path}.${key}` : key));
  return [];
}

function validateRelicQuantities(collection, row) {
  const copy = `${row.steps || ''} ${row.tip || ''}`;
  for (const match of copy.matchAll(/\b((?:Lith|Meso|Neo|Axi)\s+[A-Z]\d+)\s*[×x]\s*(\d+)\b/gi)) {
    const expected = relicBaseTotals.get(match[1].toLowerCase()) || 0;
    if (Number(match[2]) !== expected) fail(collection, row, `${match[1]} count is ${match[2]}; export says ${expected}`);
  }
  for (const match of copy.matchAll(/\b(\d+)\s+((?:Lith|Meso|Neo|Axi)\s+[A-Z]\d+\s+(?:Intact|Exceptional|Flawless|Radiant))\s+relics?\b/gi)) {
    const expected = relicExactCounts.get(match[2].toLowerCase()) || 0;
    if (Number(match[1]) !== expected) fail(collection, row, `${match[2]} count is ${match[1]}; export says ${expected}`);
  }
  for (const match of copy.matchAll(/\b((?:Lith|Meso|Neo|Axi)\s+[A-Z]\d+)\s+(?:Common|Uncommon|Rare)\s+\((?:(\d+)\s+held|(none visible in export))\)/gi)) {
    const expected = relicBaseTotals.get(match[1].toLowerCase()) || 0;
    const shown = match[3] ? 0 : Number(match[2]);
    if (shown !== expected) fail(collection, row, `${match[1]} held count is ${shown}; export says ${expected}`);
  }
}

function parts(row) {
  return String(row.missing || '').split(';').map((part) => part.trim()).filter(Boolean);
}

function materials(row) {
  return parts(row).map((part) => {
    const match = part.match(/^(.+?) \(([\d,]+)\/([\d,]+)\)$/);
    if (!match) return null;
    const owned = Number(match[2].replaceAll(',', ''));
    const required = Number(match[3].replaceAll(',', ''));
    return { name: match[1], owned, required, remaining: required - owned };
  }).filter(Boolean);
}

function isCraftingMaterial(name) {
  return !/(?:Blueprint|Barrel|Receiver|Stock|Blades?|Stars?|Handle|Hilt|Grip|Link|Chassis|Neuroptics|Systems|Harness|Wings|Cerebrum|Carapace|Pouch|Gauntlet|Upper Limb|Lower Limb|String|Band|Buckle|Boot|Ornament|Dull Button|Prime)$/i.test(name);
}

function craftingMaterials(row) {
  return materials(row).filter((material) => isCraftingMaterial(material.name));
}

const knownCraftingMaterials = new Set(
  [...data.queue, ...data.vaulted, ...data.arsenal].flatMap(craftingMaterials).map((material) => material.name)
);

function validateGeneratedText(collection, row) {
  for (const [field, value] of strings(row)) {
    if (/…|\.\.\./.test(value)) fail(collection, row, `${field} contains an ellipsis`);
    const isProseField = /(?:^|\.)(?:route|steps|tip|rankRule|action|formaPlan)$/.test(field);
    if (
      isProseField &&
      (/\bNo\s*$/.test(value) || /\b(?:and|or|the|to|from|with)\s*$/i.test(value))
    ) {
      fail(collection, row, `${field} ends with an incomplete fragment`);
    }
  }
}

function validateQuantities(collection, row) {
  const currentMaterials = new Map(craftingMaterials(row).map((material) => [material.name.toLowerCase(), material]));
  for (const material of craftingMaterials(row)) {
    if (material.owned < 0 || material.required < 0 || material.owned > material.required) {
      fail(collection, row, `${material.name} inventory ${material.owned}/${material.required} is invalid`);
      continue;
    }
    const escaped = material.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mention = String(row.steps || '').match(new RegExp(`([\\d,]+)\\s+${escaped}`, 'i'));
    if (String(row.steps || '').trim() && !mention) {
      fail(collection, row, `${material.name} is missing its remaining quantity in Steps`);
    } else if (mention && Number(mention[1].replaceAll(',', '')) !== material.remaining) {
      fail(collection, row, `${material.name} Steps quantity ${mention[1]} disagrees with Missing remainder ${material.remaining}`);
    }
  }
  const prose = `${row.steps || ''} ${row.tip || ''}`;
  for (const name of knownCraftingMaterials) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b[\\d,]+\\s+${escaped}\\b`, 'i').test(prose) && !currentMaterials.has(name.toLowerCase())) {
      fail(collection, row, `${name} has a numeric instruction but is absent from Missing`);
    }
  }
}

for (const collection of ['queue', 'vaulted', 'owned']) {
  for (const row of data[collection]) {
    if (!String(row.steps || '').trim()) fail(collection, row, 'blank steps');
    if (!String(row.tip || '').trim()) fail(collection, row, 'blank tip');
    if (collection !== 'owned' && !String(row.missing || '').trim()) fail(collection, row, 'blank Missing');
    if (row.route === UNVERIFIED) fail(collection, row, 'unverified route');
    const normalizedParts = parts(row).map((part) => part.replace(/ \(\d+\/\d+\)$/, '').toLowerCase());
    if (new Set(normalizedParts).size !== normalizedParts.length) fail(collection, row, 'duplicated component text should be a quantity');
    validateGeneratedText(collection, row);
    validateQuantities(collection, row);
    validateRelicQuantities(collection, row);
    const positiveKDriveInstruction = /assemble the K-Drive|K-Drive Board|level it to 30\. No gilding/i.test(`${row.route || ''} ${row.steps || ''}`);
    if (positiveKDriveInstruction && !kDriveBoards.has(row.item)) fail(collection, row, 'K-Drive instruction on non-K-Drive item');
    if (collection !== 'owned' && nightwaveItems.has(row.item) && row.availabilityGroup !== 'nightwave') fail(collection, row, 'Nightwave item outside Nightwave tab');
    if (collection === 'queue' && /^Baro Ki/i.test(row.route || '') && row.availabilityGroup !== 'baro') fail(collection, row, 'direct Baro item outside Baro tab');
    if (collection === 'queue' && /Dojo|Dagath.s Hollow/i.test(row.route || '') && row.availabilityGroup !== 'dojo') fail(collection, row, 'Dojo item outside Dojo tab');
    if (row.availabilityGroup && !validAvailabilityGroups.has(row.availabilityGroup)) fail(collection, row, `invalid availability group ${row.availabilityGroup}`);
    if (collection === 'vaulted' && !validPrimeStatuses.has(row.primeStatus)) fail(collection, row, `invalid Prime status ${row.primeStatus || '(blank)'}`);
    if (kDriveBoards.has(row.item) && !craftingMaterials(row).length && /listed materials/i.test(`${row.steps || ''} ${row.tip || ''}`)) {
      fail(collection, row, 'K-Drive card refers to listed materials when Missing contains none');
    }
    if (/appropriate egg or genetic codes/i.test(`${row.steps || ''} ${row.tip || ''}`)) {
      fail(collection, row, 'companion breeding advice is not item-specific');
    }
    if (collection === 'owned') {
      const copy = `${row.steps || ''} ${row.tip || ''}`;
      if (row.state === 'Rank unknown — verify in Arsenal' && /Claim from Foundry/i.test(copy)) {
        fail(collection, row, 'rank-unknown card must not say Claim from Foundry');
      }
      if (row.type !== 'companion' && /companion weapon/i.test(copy)) {
        fail(collection, row, `owned advice does not match ${row.type} item type`);
      }
    }
  }
}

if (!/isDeferredCategory\(item\)/.test(appSource)) errors.push('app/Acquire Next: deferred categories are not excluded from the ordinary queue');

for (const row of data.queue) {
  if (!Number.isFinite(row.practicalPriority)) fail('queue', row, 'missing numeric practicalPriority');
}
for (let index = 1; index < data.queue.length; index += 1) {
  if (data.queue[index - 1].practicalPriority > data.queue[index].practicalPriority) {
    errors.push(`queue order: ${data.queue[index].item} is ahead of an easier practical priority`);
    break;
  }
}

const userFacingCards = new Map([...data.queue, ...data.vaulted].map((row) => [row.item, row]));
for (const row of data.queue) {
  const relicCopy = `${row.route || ''} ${row.steps || ''} ${row.tip || ''}`;
  if (/\brelics?\b|Void Fissures?|radshare|\bPrime bundled companion weapon/i.test(relicCopy) || row.primeDetails?.length) {
    fail('queue', row, 'relic-acquired target must be placed in Primes / Relics');
  }
  if (/ Prime$/.test(row.item) && !nonRelicPrimeItems.has(row.item)) {
    fail('queue', row, 'Prime target must be placed in Primes / Relics unless explicitly classified as non-relic');
  }
}
const preservedCorrections = {
  'Ceti Lacera': { forbidden: /Oxium|remaining crafting materials/i },
  Kreska: { forbidden: /Longwinder/i },
};
for (const [item, rule] of Object.entries(preservedCorrections)) {
  const card = userFacingCards.get(item);
  if (!card) continue;
  const copy = `${card.steps || ''} ${card.tip || ''}`;
  if (rule.steps && card.steps !== rule.steps) fail('database', card, `Steps must remain exactly: ${rule.steps}`);
  if (rule.required && !rule.required.test(copy)) fail('database', card, 'required corrected instruction is missing');
  if (rule.forbidden && rule.forbidden.test(copy)) fail('database', card, 'a removed material instruction reappeared');
}
for (const [item, requiredSteps] of Object.entries({
  Catabolyst: 'Claim from Foundry; equip and level to 30.',
  'Revenant Prime': 'Check Arsenal and level to 30 if needed.',
})) {
  const card = data.owned.find((row) => row.item === item);
  if (card && card.steps !== requiredSteps) errors.push(`owned/${item}: corrected owned-card Steps regressed`);
}
for (const item of permanentRailjackItems) {
  const arsenal = data.arsenal.find((row) => row.item === item);
  if (arsenal && (arsenal.owned === 'Yes' || arsenal.mastered === 'Yes' || arsenal.pendingFoundry === 'Yes')) continue;
  const card = userFacingCards.get(item);
  if (!card) {
    errors.push(`database/${item}: permanent Railjack Prime has no user-facing card`);
    continue;
  }
  if (!card.primeDetails?.length) fail('database', card, 'permanent Railjack Prime lacks relic details');
  for (const detail of card.primeDetails || []) {
    if (data.meta.relicInventory && detail.ownedRelics === null) fail('database', card, `${detail.relic} owned count is null despite imported relic inventory`);
    for (const value of [detail.relic, detail.rarity, detail.refinement, detail.relicSource]) {
      if (!String(card.steps || '').includes(value)) fail('database', card, `Steps do not expose actionable relic detail: ${value}`);
    }
  }
}

if (!/arsenal\?\.primeDetails\?\.length\s*\?\s*primeDetails\(arsenal\)/.test(appSource)) {
  errors.push('app/Acquire Next: queueCard does not expose matching Arsenal primeDetails');
}
if (/Owned relic counts were not retained in this snapshot/i.test(appSource) || strings(data).some(([, value]) => /Owned relic counts were not retained in this snapshot/i.test(value))) {
  errors.push('app/Primes: DATA INCOMPLETE falsely says relic inventory was not retained');
}

for (const row of data.rank40) {
  if (!validRank40Statuses.has(row.status)) fail('rank40', row, `invalid status ${row.status}`);
  if (!String(row.action || '').trim()) fail('rank40', row, 'blank action');
  if (!String(row.formaPlan || '').trim()) fail('rank40', row, 'blank Forma plan');
  if (row.status === 'Confirmed at 40' && row.mastered !== 'Yes') fail('rank40', row, 'confirmed rank 40 but not mastered');
  validateGeneratedText('rank40', row);
}

const cardByName = new Map([...data.queue, ...data.vaulted].map((row) => [row.item, row]));
const ownedCardByName = new Map(data.owned.map((row) => [row.item, row]));
const rank40ByName = new Map(data.rank40.map((row) => [row.item, row]));
for (const row of data.arsenal) {
  const owned = row.owned === 'Yes';
  const mastered = row.mastered === 'Yes';
  const complete = row.complete === 'Yes';
  if (complete !== (owned || mastered)) fail('arsenal', row, 'complete disagrees with owned/mastered');
  if (row.state === 'Missing') {
    if (owned || mastered || complete) fail('arsenal', row, 'Missing state contradicts ownership or mastery');
    if (!String(row.missing || '').trim()) fail('arsenal', row, 'blank Missing on Missing item');
    const card = cardByName.get(row.item);
    if (!card) fail('arsenal', row, 'Missing item has no user-facing queue or vaulted card');
    else if (card.missing !== row.missing) fail('arsenal', row, 'card Missing disagrees with Full Arsenal');
  } else if (String(row.missing || '').trim()) {
    fail('arsenal', row, 'non-Missing state has a Missing value');
  }
  if (row.state === 'Owned + mastered' && (!owned || !mastered)) fail('arsenal', row, 'Owned + mastered state contradicts flags');
  if (row.state === 'Mastered; not currently owned' && (owned || !mastered)) fail('arsenal', row, 'mastered-only state contradicts flags');
  if (specializedTypes[row.item] && row.type !== specializedTypes[row.item]) fail('arsenal', row, `type ${row.type} should be ${specializedTypes[row.item]}`);
  const project = rank40ByName.get(row.item);
  if (project && row.state !== project.status) fail('arsenal', row, `rank-40 state ${row.state} disagrees with ${project.status}`);
  const needsOwnedFollowup = !project && (row.pendingFoundry === 'Yes' || (owned && !mastered));
  const hasOwnedFollowup = ownedCardByName.has(row.item);
  if (needsOwnedFollowup !== hasOwnedFollowup) {
    fail('arsenal', row, needsOwnedFollowup ? 'owned/unmastered item lacks an Owned / Foundry card' : 'stale Owned / Foundry card');
  }
  if (mastered && hasOwnedFollowup) fail('arsenal', row, 'mastered item must not appear in Owned / Foundry');
  validateGeneratedText('arsenal', row);
  validateQuantities('arsenal', row);
  validateRelicQuantities('arsenal', row);
}

for (const item of nightwaveItems) {
  const row = cardByName.get(item);
  if (row && row.availabilityGroup !== 'nightwave') fail('database', row, 'Nightwave-dependent item outside Nightwave tab');
}

const dependencies = {
  'Akbronco Prime': 'Bronco Prime',
  'Aklex Prime': 'Lex Prime',
  'Akmagnus Prime': 'Magnus Prime',
  'Akvasto Prime': 'Vasto Prime',
};
for (const [item, base] of Object.entries(dependencies)) {
  const row = data.arsenal.find((entry) => entry.item === item);
  if (row?.state === 'Missing' && !parts(row).includes(`${base} (0/2)`)) fail('arsenal', row, `dependency must be ${base} (0/2)`);
}

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'warframe-clean-'));
const tempData = path.join(tempDirectory, 'warframe.json');
try {
  fs.copyFileSync('data/warframe.json', tempData);
  const runCleanup = () => spawnSync(process.execPath, ['scripts/clean_recommendations.js'], {
    cwd: process.cwd(),
    env: { ...process.env, WARFRAME_DATA_FILE: tempData },
    encoding: 'utf8',
  });
  const first = runCleanup();
  if (first.status !== 0) errors.push(`cleanup/idempotence: first pass failed: ${first.stderr.trim()}`);
  const once = fs.readFileSync(tempData, 'utf8');
  const second = runCleanup();
  if (second.status !== 0) errors.push(`cleanup/idempotence: second pass failed: ${second.stderr.trim()}`);
  const twice = fs.readFileSync(tempData, 'utf8');
  if (once !== twice) errors.push('cleanup/idempotence: second cleanup pass changed generated JSON');
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Validation passed: queue ${data.queue.length}, vaulted ${data.vaulted.length}, owned ${data.owned.length}, rank40 ${data.rank40.length}, arsenal ${data.arsenal.length}.`);
