const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/warframe.json', 'utf8'));
const UNVERIFIED = 'Acquisition route not verified yet';
const kDriveBoards = new Set(['Bad Baby', 'Feverspine', 'Flatbelly', 'Needlenose', 'Runway']);
const nightwaveItems = new Set(['Ceramic Dagger', 'Dark Dagger', 'Dark Sword', 'Glaive', 'Jaw Sword', 'Plasma Sword', 'Vitrica', 'Wolf Sledge']);
const errors = [];

for (const row of data.queue) {
  if (row.route === UNVERIFIED) errors.push(`${row.item}: unresolved acquisition route`);
  if (!String(row.steps || '').trim()) errors.push(`${row.item}: blank steps`);
  if (!String(row.tip || '').trim()) errors.push(`${row.item}: blank tip`);
  for (const field of ['route', 'steps', 'tip']) {
    const value = String(row[field] || '').trim();
    if (/\bNo\s*$/.test(value) || /\b[A-Za-z]{1,3}(?:…|\.\.\.)$/.test(value)) {
      errors.push(`${row.item}: malformed ${field}`);
    }
  }
  const positiveKDriveInstruction = /assemble the K-Drive|K-Drive Board|level it to 30\. No gilding/i.test(`${row.route} ${row.steps}`);
  if (positiveKDriveInstruction && !kDriveBoards.has(row.item)) errors.push(`${row.item}: K-Drive instruction on non-K-Drive item`);
  if (nightwaveItems.has(row.item) && row.availabilityGroup !== 'nightwave') errors.push(`${row.item}: Nightwave item outside Nightwave tab`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Validation passed: ${data.queue.length} active recommendations checked.`);
