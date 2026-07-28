const fs = require('fs');

const file = process.env.WARFRAME_DATA_FILE || 'data/warframe.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

function relicCount(relic) {
  return Object.entries(data.meta?.relicInventory || {})
    .filter(([name]) => name === relic || name.startsWith(`${relic} `))
    .reduce((total, [, count]) => total + (Number.isFinite(count) ? count : 0), 0);
}

function remainingMaterial(missing, material) {
  const escaped = material.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(missing || '').match(new RegExp(`${escaped} \\(([\\d,]+)\\/([\\d,]+)\\)`));
  if (!match) return null;
  return Number(match[2].replaceAll(',', '')) - Number(match[1].replaceAll(',', ''));
}

function patchRow(row) {
  if (row.item === 'Needlenose') {
    const remaining = remainingMaterial(row.missing, 'Hespazym Alloy');
    if (remaining !== null && remaining > 0 && !/Needlenose Blueprint/.test(row.missing || '')) {
      row.steps = `Obtain ${remaining.toLocaleString('en-US')} Hespazym Alloy. Assemble the K-Drive and level it to 30. No gilding is required.`;
      row.tip = 'The Needlenose Board Blueprint is already owned; no gilding is required for mastery.';
    }
  }

  if (row.item === 'Trumna Prime') {
    const count = relicCount('Neo T11');
    if (count > 0) {
      row.steps = `Open the ${count.toLocaleString('en-US')} Neo T11 Intact relics in the export; Receiver is Rare. Refine to Radiant first.`;
    }
  }
}

for (const section of ['queue', 'vaulted', 'arsenal']) {
  for (const row of data[section] || []) patchRow(row);
}

fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
