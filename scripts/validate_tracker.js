const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/warframe.json', 'utf8'));
const nightwaveCatalog = JSON.parse(fs.readFileSync('data/nightwave-items.json', 'utf8'));
const UNVERIFIED = 'Acquisition route not verified yet';
const nightwaveItems = new Set(nightwaveCatalog.items.map((entry) => entry.item));
const kDriveBoards = new Set(['Bad Baby', 'Feverspine', 'Flatbelly', 'Needlenose', 'Runway']);
const validPrimeStatuses = new Set(['RESURGENCE ACTIVE', 'OWNED RELICS', 'PERMANENT SPECIAL RELICS', 'TRADE ONLY', 'DATA INCOMPLETE']);
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

function fail(collection, row, message) {
  errors.push(`${collection}/${row.item}: ${message}`);
}

function strings(value, path = '') {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((child, index) => strings(child, `${path}[${index}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, child]) => strings(child, path ? `${path}.${key}` : key));
  return [];
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
    const positiveKDriveInstruction = /assemble the K-Drive|K-Drive Board|level it to 30\. No gilding/i.test(`${row.route || ''} ${row.steps || ''}`);
    if (positiveKDriveInstruction && !kDriveBoards.has(row.item)) fail(collection, row, 'K-Drive instruction on non-K-Drive item');
    if (nightwaveItems.has(row.item) && row.availabilityGroup !== 'nightwave') fail(collection, row, 'Nightwave item outside Nightwave tab');
    if (collection === 'vaulted' && !validPrimeStatuses.has(row.primeStatus)) fail(collection, row, `invalid Prime status ${row.primeStatus || '(blank)'}`);
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

for (const row of data.rank40) {
  if (!validRank40Statuses.has(row.status)) fail('rank40', row, `invalid status ${row.status}`);
  if (!String(row.action || '').trim()) fail('rank40', row, 'blank action');
  if (!String(row.formaPlan || '').trim()) fail('rank40', row, 'blank Forma plan');
  if (row.status === 'Confirmed at 40' && row.mastered !== 'Yes') fail('rank40', row, 'confirmed rank 40 but not mastered');
  validateGeneratedText('rank40', row);
}

const cardByName = new Map([...data.queue, ...data.vaulted].map((row) => [row.item, row]));
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
  validateGeneratedText('arsenal', row);
  validateQuantities('arsenal', row);
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

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Validation passed: queue ${data.queue.length}, vaulted ${data.vaulted.length}, owned ${data.owned.length}, rank40 ${data.rank40.length}, arsenal ${data.arsenal.length}.`);
