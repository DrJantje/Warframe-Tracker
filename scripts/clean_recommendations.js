const fs = require('fs');
const file = process.env.WARFRAME_DATA_FILE || 'data/warframe.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const overrides = JSON.parse(fs.readFileSync('data/overrides.json', 'utf8'));
const live = JSON.parse(fs.readFileSync('data/live.json', 'utf8'));
const nightwaveCatalog = JSON.parse(fs.readFileSync('data/nightwave-items.json', 'utf8'));
const primeRules = JSON.parse(fs.readFileSync('data/prime-rules.json', 'utf8'));
const confirmedAt40 = new Set(overrides.confirmedAt40 || []);
const UNVERIFIED = 'Acquisition route not verified yet';
const fillerRoutes = new Set([
  'Focused two-part farm',
  'Multi-part item-specific farm',
  'Single item-specific drop or vendor gate',
]);
const fillerPhrases = ['Open the item page', 'Farm the rarer part first', 'Batch parts from the same node or faction'];
const companionBreeds = new Set([
  'Adarza Kavat',
  'Chesa Kubrow',
  'Huras Kubrow',
  'Raksa Kubrow',
  'Sahasa Kubrow',
  'Smeeta Kavat',
  'Sunika Kubrow',
  'Vasca Kavat',
]);
const kDriveBoards = new Set(['Bad Baby', 'Feverspine', 'Flatbelly', 'Needlenose', 'Runway']);
const nightwaveItems = new Set(nightwaveCatalog.items.map((entry) => entry.item));
const permanentRailjackItems = new Set(primeRules.permanentRailjackItems);
const activeResurgenceItems = new Set(live.primeResurgence.status === 'verified' ? live.primeResurgence.items : []);
const nightwaveTip = 'Cred Offerings rotate weekly. Check the Nightwave tab before spending Cred or farming unrelated items.';
const practicalPriorityOverrides = new Map([
  ['Itzal', 1],
  ['Scourge', 2],
  ['Hema', 3],
  ['Quassus Prime', 10],
  ['Trumna Prime', 11],
  ['Heliocor', 20],
  ['Simulor', 21],
  ['Cantare', 30],
  ['Evensong', 31],
  ['Harmony', 32],
  ['Seer', 40],
  ['Pennant', 41],
  ['Miter', 42],
  ['Bad Baby', 50],
  ['Feverspine', 51],
  ['Runway', 52],
  ['Acceltra', 60],
  ['Akarius', 61],
]);
const usesRelics = (row) => /Void Relics?|\bPrime bundled companion weapon/i.test(`${row.route || ''} ${row.steps || ''}`)
  || Boolean(row.primeDetails?.length);
const sourceOverrides = {
  Hema: 'https://wiki.warframe.com/w/Hema',
  Corufell: 'https://wiki.warframe.com/w/Corufell',
  Pennant: 'https://wiki.warframe.com/w/Pennant',
  'War Prime': 'https://wiki.warframe.com/w/War_Prime',
};

const exact = {
  Acceltra: ['Ur, Uranus — Disruption; Demolisher Infested', 'Kill Demolisher Infested on Ur until the Acceltra blueprint drops.', 'Protect every conduit and prioritize Demolishers; resource boosters do not affect blueprint drops.'],
  Akarius: ['Ur, Uranus — Disruption; Demolisher Infested', 'Kill Demolisher Infested on Ur until the Akarius blueprint drops.', 'Protect every conduit and prioritize Demolishers; resource boosters do not affect blueprint drops.'],
  Octavia: ['Lua and Deimos component farms', 'Neuroptics: Deimos Survival rotation C. Systems: Lua Crossfire caches. Main blueprint: Octavia’s Anthem.', 'Use loot radar for Lua caches; stay to rotation C on Deimos.'],
  Protea: ['Granum Void after The Deadlock Protocol', 'Neuroptics: Normal Granum Void. Chassis: Extended Granum Void. Systems: Nightmare Granum Void. Reach the top kill tier.', 'Use Xoris heavy throws to free Solaris captives and extend the timer.'],
  Oberon: ['Railjack point-of-interest rewards', 'Neuroptics and Systems: Earth Proxima point-of-interest rewards. Chassis: Saturn Proxima.', 'Choose short Railjack nodes and finish the side objective before extraction.'],
  Citrine: ['Tyana Pass, Mars — Mirror Defense; Otak pity shop', 'Farm Mirror Defense or buy missing blueprints from Otak with Rania and Belric Crystal Fragments.', 'Collect both crystal colors; spend fragments only on parts still missing.'],
  Steflos: ['Tyana Pass, Mars — Mirror Defense; Otak pity shop', 'Farm the Receiver and Stock or buy them from Otak with crystal fragments.', 'Use Otak to eliminate the last duplicate-heavy gap.'],
  Voruna: ['Yuvarium or Circulus, Lua — Conjunction Survival; Yonta pity shop', 'Farm Conjunction Survival or buy missing blueprints from Yonta with Lua Thrax Plasm.', 'Circulus pays more Lua Thrax Plasm; stay for later rotations when stable.'],
  Sarofang: ['Yuvarium or Circulus, Lua — Conjunction Survival; Yonta pity shop', 'Farm the Blade and Handle or buy them from Yonta with Lua Thrax Plasm.', 'Use Lua Thrax Plasm for the final missing component.'],
  Koumei: ['Saya’s Visions, Earth — Shrine Defense; Fate Pearl shop', 'Run Saya’s Visions and buy missing Koumei blueprints with Fate Pearls.', 'Bank Fate Pearls and purchase only pieces that have not dropped.'],
  Kullervo: ['Kullervo’s Hold in Duviri; Acrithis', 'Fight Kullervo during an eligible Spiral, earn Kullervo’s Bane, then buy blueprints from Acrithis.', 'Finish the Duviri run after the fight so earned resources are retained.'],
  Rauta: ['Kullervo’s Hold in Duviri; Acrithis', 'Earn Kullervo’s Bane from the Kullervo fight and buy Rauta blueprints from Acrithis.', 'Finish the Duviri run after the fight.'],
  Jade: ['Brutus, Uranus — Ascension; Ordis pity shop', 'Farm Jade components or buy missing pieces from Ordis with Vestigial Motes.', 'Complete the optional Sister objective for extra Vestigial Motes.'],
  Cantare: ['Brutus, Uranus — Ascension; Ordis pity shop', 'Farm or buy the blueprint from Ordis with Vestigial Motes.', 'Complete the optional Sister objective for extra Vestigial Motes.'],
  Evensong: ['Brutus, Uranus — Ascension; Ordis pity shop', 'Farm the blueprint or buy it from Ordis with Vestigial Motes.', 'Complete the optional Sister objective for extra Vestigial Motes.'],
  Harmony: ['Brutus, Uranus — Ascension; Ordis pity shop', 'Farm the blueprint or buy it from Ordis with Vestigial Motes.', 'Complete the optional Sister objective for extra Vestigial Motes.'],
  Gauss: ['Kappa, Sedna — Disruption rotation C', 'Farm all three components from rotation C; buy the main blueprint from the Market.', 'From round four onward, defend at least three conduits to keep rotation C.'],
  Nidus: ['Oestrus, Eris — Infested Salvage, all rotations', 'Update 42 added all three components to every Infested Salvage rotation. Rotation C still has the best odds; main blueprint: The Glast Gambit.', 'Keep vaporizer coverage high; stay through rotation C when practical for the best odds.'],
  'Braton Vandal': ['Elite Sanctuary Onslaught — all rotations', 'Farm the missing Braton Vandal components from any Elite Sanctuary Onslaught rotation.', 'Continue through later zones to stack more rotation rewards per run.'],
  'Lato Vandal': ['Elite Sanctuary Onslaught — all rotations', 'Farm the missing Lato Vandal components from any Elite Sanctuary Onslaught rotation.', 'Continue through later zones to stack more rotation rewards per run.'],
  Scourge: ['Clan Dojo Tenno Lab', 'Replicate the Scourge Blueprint from the Tenno Lab, then build it.', 'Check completed clan research before farming materials.'],
  Brakk: ['Grustrag Three', 'Defeat the Grustrag Three for the Brakk blueprint and components.', 'Support the Corpus against the Grineer across five Invasion missions to earn a Grustrag Three mark, or use a Grustrag Three Beacon.'],
  Despair: ['Stalker', 'Defeat the Stalker until the Despair Blueprint drops.', 'The blueprint is the entire acquisition gate.'],
  Velox: ['Granum Void after The Deadlock Protocol', 'Barrel: Normal Granum Void. Receiver: Extended Granum Void. Reach the top kill tier.', 'Use Xoris heavy throws to free Solaris captives and extend the timer.'],
  Seer: ['Captain Vor on Tolstoj, Mercury', 'Defeat Captain Vor on Tolstoj for the Seer Blueprint and Barrel.', 'Repeat Tolstoj until both missing pieces drop.'],
  Catabolyst: ['Market Blueprint + materials', 'Buy the Catabolyst Blueprint from the Market, then obtain the materials still listed in Missing.', 'Run Deimos Isolation Vault bounties for Scintillant; use Invasions or Bio Lab blueprints for Mutagen Mass.'],
  Kreska: ['Market Blueprint + Fortuna materials', 'Obtain 2 Fieldron.', 'Use Corpus Invasions for Fieldron.'],
  Tatsu: ['Market Blueprint + Cetus/Fortuna materials', 'Obtain 50 Auroxium Alloy.', 'Mine on the Plains of Eidolon, then refine the ore in Cetus.'],
  Vitrica: ['Defeat Nihil using Nihil’s Oubliette', 'Enter Nihil’s Oubliette with its key and defeat Nihil for the Vitrica Blueprint.', 'The Oubliette and entry key rotate through Nightwave Cred Offerings.'],
  'Kavasa Prime Kubrow Collar': ['Vaulted Void Relics, Prime Resurgence, or player trade', 'Open relics containing the Collar Blueprint, Band, and Buckle, or trade for the missing Prime parts.', 'This is Prime equipment, not a Kubrow breed.'],
  'Sirius & Orion': ['Uranus Proxima missions / Pontis Tower Secret Vendor', 'Earn the missing blueprints from Scoria’s Angel or The Kuva Wytch, or exchange Emerald or Crimson Talents at the Secret Vendor.', 'Scoria’s Angel guarantees a blueprint from the Sirius & Orion/Wrath pool. The Kuva Wytch guarantees one from the Sirius & Orion/Pride pool. The travel stage supplies Crimson or Emerald Talents for the vendor.'],
  Pride: ['The Kuva Wytch / Pontis Tower Secret Vendor', 'Earn its blueprints from The Kuva Wytch or buy them with Emerald Talents.', 'The Kuva Wytch guarantees one blueprint from the Sirius & Orion/Pride pool; its travel stage supplies Emerald Talents for the vendor.'],
  Wrath: ['Scoria’s Angel / Pontis Tower Secret Vendor', 'Earn its blueprints from Scoria’s Angel or buy them with Crimson Talents.', 'Scoria’s Angel guarantees one blueprint from the Sirius & Orion/Wrath pool; its travel stage supplies Crimson Talents for the vendor.'],
  Follie: ['Follie’s Hunt / Aspirant Zorba', 'Farm the main and component blueprints from Follie’s Hunt or buy them from Zorba in a Relay using Atramentum.', 'Follie’s Hunt gives 15 Atramentum normally or 25 on Steel Path after completion. Atramentum Balloons award currency squad-wide.'],
  Enkaus: ['Follie’s Hunt / Aspirant Zorba', 'Farm the main and component blueprints from Follie’s Hunt or buy them from Zorba in a Relay using Atramentum.', 'Follie’s Hunt gives 15 Atramentum normally or 25 on Steel Path after completion. Atramentum Balloons award currency squad-wide.'],
  Nokko: ['Deepmines Bounties / Nightcap in The Airlock', 'Farm the blueprints from Deepmines Bounties or buy them from Nightcap using Fergolyte.', 'Deepmines Bounties award 11–15 Fergolyte normally or 15–19 on Steel Path. Extra fully analyzed mushrooms can be composted into Fergolyte. Buy only pieces that did not drop.'],
  Arbucep: ['Deepmines Bounties / Nightcap in The Airlock', 'Farm the blueprints from Deepmines Bounties or buy them from Nightcap using Fergolyte.', 'Deepmines Bounties award 11–15 Fergolyte normally or 15–19 on Steel Path. Extra fully analyzed mushrooms can be composted into Fergolyte. Buy only pieces that did not drop.'],
  Amanata: ['Saya’s Visions / Koumei’s Shrine', 'Farm its blueprints and components from Shrine Defense or buy the missing pieces with Fate Pearls.', 'Bank Fate Pearls and purchase only pieces that have not dropped.'],
  Higasa: ['Saya’s Visions / Koumei’s Shrine', 'Farm its blueprints and components from Shrine Defense or buy the missing pieces with Fate Pearls.', 'Bank Fate Pearls and purchase only pieces that have not dropped.'],
  'Riot-848': ['Stage Defense, Solstice Square / Flare’s Memorabilia', 'Farm its blueprints from Stage Defense or buy them with Beating Heartstrings.', 'Stage Defense gives one Beating Heartstring per three waves normally or two on Steel Path. Rewards follow AABCAABC. Use Flare’s shop to finish the final pieces.'],
  Oraxia: ['Isleweaver / Acrithis Scuttler Husk exchange', 'Earn its blueprints from Isleweaver or purchase missing pieces from Acrithis using Scuttler Husks.', 'Blueprints can drop from Isleweaver and can be purchased from Acrithis with Scuttler Husks. Use Husks for the final duplicate-heavy pieces.'],
  Scyotid: ['Isleweaver / Acrithis Scuttler Husk exchange', 'Earn its blueprints from Isleweaver or purchase missing pieces from Acrithis using Scuttler Husks.', 'Blueprints can drop from Isleweaver and can be purchased from Acrithis with Scuttler Husks. Use Husks for the final duplicate-heavy pieces.'],
  Spinnerex: ['Isleweaver / Acrithis Scuttler Husk exchange', 'Earn its blueprints from Isleweaver or purchase missing pieces from Acrithis using Scuttler Husks.', 'Blueprints can drop from Isleweaver and can be purchased from Acrithis with Scuttler Husks. Use Husks for the final duplicate-heavy pieces.'],
  Thalys: ['Isleweaver Scuttler Husk vendor', 'Buy the blueprint using Scuttler Husks and obtain the remaining Temporal Dust shown in Missing.', 'Isleweaver completion gives 16–20 Scuttler Husks normally or 20–24 on Steel Path. Temporal Dust drops from Murmur enemies during Isleweaver.'],
  Aeolak: ['Chrysalith Tier 5 bounty + Zariman endless missions', 'Main Blueprint from a Tier 5 bounty; Barrel from Void Cascade Rotation C; Receiver and Stock from Void Flood Rotation C.', 'Target only the missions that reward the components still listed above.'],
  Hespar: ['Chrysalith Tier 4 bounty + Zariman endless missions', 'Main Blueprint from a Tier 4 bounty; Handle from Void Cascade Rotation C; Blade from Void Armageddon Rotation C.', 'Target only the missions that reward the components still listed above.'],
  Athodai: ['Venus Proxima abandoned derelict cache B', 'Obtain the missing Athodai blueprints from the second cache awarded for activating the abandoned-derelict terminal.', 'The Blueprint, Barrel and Receiver are each 6.45% rewards in Venus Proxima abandoned-derelict cache B.'],
  'Carmine Penta': ['Pluto or Veil Corpus Proxima abandoned Freightlinker caches', 'Farm the missing components from abandoned Freightlinker cache B rewards on Pluto or Veil Proxima.', 'Activate the Freightlinker terminal and finish the Railjack mission so the cache reward is retained.'],
  Epitaph: ['Earth, Venus and Saturn Proxima Void Storms', 'Farm only the missing components from Void Storm rewards.', 'Choose the shortest comfortable Void Storms across the eligible Proxima regions.'],
  Nautilus: ['Neptune Proxima abandoned Ice Mine caches / Arva Vector', 'Farm each missing component from Neptune Proxima abandoned Ice Mine cache B, or from Arva Vector rotations B and C.', 'Ice Mine cache B is 6.06% per Nautilus blueprint; Arva Vector rotation B is 4.65% and rotation C is 4.26%.'],
  Mandonel: ['Cavia bounties + Entrati Labs endless missions', 'Main Blueprint comes from Cavia Bounties; components come from Persto, Munio and Cambire rotations B or C.', 'Persto: Stock on B, Barrel and Receiver on C. Munio: Receiver on B, Barrel and Stock on C. Cambire: Barrel on B, Receiver and Stock on C.'],
  Sevagoth: ['Call of the Tempestarii + Void Storms', 'Main Blueprint from the quest; components from Neptune, Pluto and Veil Proxima Void Storms.', 'Run the shortest comfortable eligible Void Storm for the remaining components.'],
  'Spectra Vandal': ['Veil Proxima Grineer abandoned derelicts', 'Farm the missing components from derelict cache rewards.', 'Complete the derelict point of interest before extraction.'],
  Pennant: ['Railjack commanders', 'Defeat eligible commanders on nodes such as Kasio’s Rest or Flexa. The Blueprint is squad-shared and tradable.', 'Only one squad member needs the Blueprint drop for everyone to receive it.'],
  Ambassador: ['Corpus Railjack Survival + eligible Railjack enemies', 'Main Blueprint from Survival Rotation C; missing components from the applicable Corpus Railjack enemies.', 'Stay through Rotation C only when the main Blueprint is still missing.'],
  Cinta: ['Duviri Enigma puzzles / player trade', 'Complete Enigma puzzles in The Duviri Experience or trade for the missing blueprints.', 'Trade only for the final pieces that refuse to drop.'],
  Dagath: ['Dagath’s Hollow Dojo room + Abyssal Zone', 'Buy the blueprints in Dagath’s Hollow using Vainthorns earned from Abyssal Zone Exterminate missions.', 'Farm Vainthorns in batches, then buy only the listed missing blueprints.'],
  Dorrclave: ['Dagath’s Hollow Dojo room + Abyssal Zone', 'Buy the blueprints in Dagath’s Hollow using Vainthorns earned from Abyssal Zone Exterminate missions.', 'Farm Vainthorns in batches, then buy only the listed missing blueprints.'],
  Stahlta: ['Jackal + Granum Void', 'Main Blueprint from Jackal. Barrel from Nightmare Granum Void, Receiver from Normal Granum Void and Stock from Extended Granum Void.', 'Use the Granum Crown tier matching the component still missing.'],
  Stropha: ['Jackal + Granum Void', 'Main Blueprint from Jackal. Barrel and Blade from Normal, Receiver from Extended and Stock from Nightmare Granum Void.', 'Use the Granum Crown tier matching the component still missing.'],
  Pathocyst: ['Zealoid Prelate, Exequias on Deimos', 'Farm the Blueprint, two Blades and Subcortex from the boss.', 'Repeat the boss only for the pieces still listed above.'],
  Kompressa: ['Roky / Ventkids Rank 5', 'Buy the Kompressa Blueprint, Barrel Blueprint and Receiver Blueprint from Roky using Ventkids Standing, craft the two components, then build the weapon.', 'This is a direct weapon purchase and crafting route, not K-Drive assembly or mastery.'],
  'Imperator Vandal': ['Balor Fomorian', 'Farm the missing components during Fomorian Sabotage or trade for them.', 'During a Balor Fomorian event, collect Omega Isotopes and build Fomorian Disruptors before repeating Fomorian Sabotage.'],
  'Gorgon Wraith': ['Razorback Armada', 'Farm the weapon components during Razorback Armada.', 'During Razorback Armada, farm Cryptographic ALU and build several Razorback Ciphers before repeatedly running the boss.'],
  'Dera Vandal': ['Invasion reward rotation / player trade', 'Watch active Invasions for each missing component or trade for the component.', 'Check both sides of active Invasions before choosing a reward.'],
  'Karak Wraith': ['Invasion reward rotation / player trade', 'Watch active Invasions for each missing component or trade for the component.', 'Check both sides of active Invasions before choosing a reward.'],
  'Latron Wraith': ['Invasion reward rotation / player trade', 'Watch active Invasions for each missing component or trade for the component.', 'Check both sides of active Invasions before choosing a reward.'],
  'Snipetron Vandal': ['Invasion reward rotation / player trade', 'Watch active Invasions for each missing component or trade for the component.', 'Check both sides of active Invasions before choosing a reward.'],
  'Strun Wraith': ['Invasion reward rotation / player trade', 'Watch active Invasions for each missing component or trade for the component.', 'Check both sides of active Invasions before choosing a reward.'],
  'Twin Vipers Wraith': ['Invasion reward rotation / player trade', 'Watch active Invasions for each missing component or trade for the component.', 'Check both sides of active Invasions before choosing a reward.'],
  'Bhaira Hound': ['Sister of Parvos Hound reward / Legs assembly', 'Vanquish Sisters for completed randomized Hounds and Hound component blueprints. Assemble a Hound using the Bhaira Model if that model is still needed for mastery.', 'Check the model on completed Sister Hounds before assembling another Hound.'],
  Basmu: ['Recurring operation or Nights of Naberus / player trade', 'Not currently obtainable from an active event; Blueprint is tradeable.', 'Recent sources include Operation: Belly of the Beast and Nights of Naberus; it has also returned through other operations. Event history does not imply current availability.'],
  'Ceti Lacera': ['Recurring operation or Nights of Naberus / player trade', 'Not currently obtainable from an active event; Blueprint is tradeable.', 'Recent sources include Operation: Belly of the Beast and Nights of Naberus. Event history does not imply current availability.'],
  Sheev: ['Grineer Invasion reward rotation / player trade', 'Check active Invasions for the Sheev Blueprint, Blade, Heatsink and Hilt. Complete the required three missions for the side offering the needed component, or trade for the missing component.', 'Only one component is offered per qualifying Invasion. Check the live Invasion feed before trading.'],
  Hema: ['Clan Dojo — completed Bio Lab research', 'Replicate the Blueprint from completed Bio Lab research. Obtain 4 Mutagen Mass, then build.', 'No drop farm is required once the clan research is complete.'],
  Corufell: ['Tyana Pass, Mars — Mirror Defense / Otak', 'The Receiver is a Tyana Pass Rotation B reward or can be bought from Otak using crystal fragments.', 'Buy the Receiver from Otak if duplicate Rotation B rewards become inefficient.'],
  Needlenose: ['Roky / Ventkids K-Drive Board', 'Buy the Needlenose Board Blueprint from Roky. Assemble the K-Drive and level it to 30. No gilding is required.', 'Buy the board blueprint from Roky with Ventkids Standing.'],
  Runway: ['Roky / Ventkids K-Drive Board', 'Buy the Runway Board Blueprint from Roky. Assemble the K-Drive and level it to 30. No gilding is required.', 'Buy the board blueprint from Roky with Ventkids Standing.'],
  Azima: ['Daily Tribute weapon milestone', 'Select it at an eligible Daily Tribute weapon milestone. Cephalon Simaris sells replacement Blueprints only after this weapon was previously chosen.', 'This is a known login-gated route, not a standing shortcut for first acquisition.'],
  Zenistar: ['Daily Tribute weapon milestone', 'Select it at an eligible Daily Tribute weapon milestone. Cephalon Simaris sells replacement Blueprints only after this weapon was previously chosen.', 'This is a known login-gated route, not a standing shortcut for first acquisition.'],
  Zenith: ['Daily Tribute weapon milestone', 'Select it at an eligible Daily Tribute weapon milestone. Cephalon Simaris sells replacement Blueprints only after this weapon was previously chosen.', 'This is a known login-gated route, not a standing shortcut for first acquisition.'],
  'Sigma & Octantis': ['Daily Tribute weapon milestone', 'Select it at an eligible Daily Tribute weapon milestone. Cephalon Simaris sells replacement Blueprints only after this weapon was previously chosen.', 'This is a known login-gated route, not a standing shortcut for first acquisition.'],
  'Wolf Sledge': ['Wolf of Saturn Six; Wolf Beacon', 'Farm all four completed weapon components from the Wolf of Saturn Six.', nightwaveTip],
  Miter: ['Exta, Ceres — Captain Vor and Lieutenant Lech Kril', 'Repeat Exta for the Miter pieces still listed in Missing. Each completed mission awards one of six equally weighted weapon rewards: the five Miter pieces or the Twin Gremlins Blueprint.', 'Each Miter piece has a 16.67% chance. Focus Captain Vor first, then complete Lieutenant Lech Kril’s armor mechanic.'],
  Detron: ['Zanuka Hunter — death mark or Zanuka Hunter Beacon', 'Earn a Zanuka Hunter death mark by supporting the Grineer against the Corpus in five Invasion missions, then run eligible Corpus missions or use a Zanuka Hunter Beacon.', 'The Detron Blueprint, components and completed weapon are not tradeable. Zanuka Hunter Beacons rotate through Baro Ki’Teer’s inventory.'],
  Shedu: ['Veil Sentient anomaly — Symbilysts', 'Target the missing Handle; each Shedu part is a 1% Symbilyst drop.', 'The missing Handle is a 1% drop from each Symbilyst. Since Shedu parts are tradeable and only one piece remains, compare the Handle’s trade price before committing to a long Sentient Anomaly farm.'],
  Snipetron: ['Limited event/vendor rotation', 'Wait for Plague Star, Star Days, or another announced return of the Blueprint.', 'Check Nakak during Operation: Plague Star and Ticker during Star Days. Buy the Blueprint before the temporary shop closes.'],
  'War Prime': ['Hunhow at Pontis Tower — Hunhow’s Trinkets', 'Buy the Hunhow’s Trinkets Blueprint from Hunhow for 12 Crimson Talents and 12 Emerald Talents, earn the Talents in Uranus Proxima, then craft War Prime.', 'Run the Scoria’s Angel and Kuva Wytch travel stages while farming their weapon pools so both Talent colors progress together.'],
};

function truncated(value) {
  return typeof value === 'string' && /\b[A-Za-z]{1,3}(?:…|\.\.\.)$/.test(value.trim());
}

function missingParts(row) {
  return String(row.missing || '').split(';').map((part) => part.trim()).filter(Boolean);
}

function materialNeeds(row) {
  return missingParts(row).map((part) => {
    const match = part.match(/^(.+?) \(([\d,]+)\/([\d,]+)\)$/);
    if (!match) return null;
    const owned = Number(match[2].replaceAll(',', ''));
    const required = Number(match[3].replaceAll(',', ''));
    return { name: match[1], owned, required, remaining: Math.max(0, required - owned) };
  }).filter(Boolean);
}

function practicalPriority(row) {
  if (practicalPriorityOverrides.has(row.item)) return practicalPriorityOverrides.get(row.item);

  const easeTier = Number.parseInt(String(row.ease || '9'), 10) || 9;
  const missing = missingParts(row);
  const route = String(row.route || '');
  let score = easeTier * 100 + missing.length * 5;

  if (/Clan Dojo|Market Blueprint|Cephalon Simaris Offerings/i.test(route)) score -= 35;
  if (/pity shop|Otak|Yonta|Ordis|Acrithis/i.test(route)) score -= 15;
  if (/Elite Sanctuary Onslaught/i.test(route)) score += 350;
  if (/Daily Tribute|anniversary|Limited event|Recurring operation/i.test(route)) score += 500;
  if (/Invasion reward rotation|Balor Fomorian|Razorback Armada/i.test(route)) score += 250;
  if (/Lich|Sister of Parvos|Technocyte Coda/i.test(route)) score += 150;

  const materialRows = materialNeeds(row);
  if (materialRows.length === missing.length && materialRows.length) {
    const completion = materialRows.reduce((sum, part) => sum + part.owned / Math.max(part.required, 1), 0) / materialRows.length;
    score -= Math.round(completion * 25);
  }
  return score;
}

function naturalList(values) {
  if (values.length < 2) return values[0] || '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bblueprint\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeSource(url) {
  return String(url || '').replace('https://warframe.fandom.com/wiki/', 'https://wiki.warframe.com/w/');
}

function defaultMissing(row) {
  if (String(row.missing || '').trim() || row.state !== 'Missing') return row.missing;
  if (companionBreeds.has(row.item)) return `${row.item} breeding result`;
  if (/Prime$|^Prime /.test(row.item) && row.type === 'companion') return `${row.item} Blueprint and components`;
  return `${row.item} (completed item)`;
}

const archwings = new Set(['Amesha', 'Elytron', 'Itzal', 'Odonata', 'Odonata Prime']);
const archguns = new Set(['Arbucep', 'Cortege', 'Corvas', 'Corvas Prime', 'Cyngas', 'Dual Decurion', 'Fluctus', 'Grattler', 'Imperator', 'Imperator Vandal', 'Kuva Ayanga', 'Kuva Grattler', 'Larkspur', 'Larkspur Prime', 'Mandonel', 'Mausolon', 'Morgha', 'Phaedra', 'Prisma Dual Decurions', 'Velocitus']);
const archmelee = new Set(['Agkuza', 'Centaur', 'Kaszas', 'Knux', 'Onorix', 'Prisma Veritux', 'Rathbone', 'Veritux']);
const directBaroItems = new Set(['Glaxion Vandal', 'Gotva Prime', 'Halikar Wraith', 'Machete Wraith', 'Mara Detron', 'Prova Vandal', 'Quanta Vandal', 'Supra Vandal', 'Vastilok', 'Vericres', 'Vulkar Wraith', 'Zylok']);
const sentinelBundledWeapons = {
  'Burst Laser Prime': 'Shade Prime',
  'Deconstructor Prime': 'Helios Prime',
  'Deth Machine Rifle Prime': 'Dethcube Prime',
  'Prime Laser Rifle': 'Wyrm Prime',
  'Prisma Burst Laser': 'Prisma Shade',
  'Sweeper Prime': 'Carrier Prime',
  Verglas: 'Nautilus',
};
const houndBundledWeapons = { Lacerten: 'a Hound configured with the Bhaira Model' };
const invasionItems = new Set(['Dera Vandal', 'Karak Wraith', 'Latron Wraith', 'Snipetron Vandal', 'Strun Wraith', 'Twin Vipers Wraith', 'Viper Wraith', 'Sheev']);
const primeDependencies = {
  'Akbronco Prime': 'Bronco Prime',
  'Aklex Prime': 'Lex Prime',
  'Akmagnus Prime': 'Magnus Prime',
  'Akvasto Prime': 'Vasto Prime',
};

function applySpecializedType(row) {
  if (['Bonewidow', 'Voidrig'].includes(row.item)) row.type = 'necramech';
  else if (archwings.has(row.item)) row.type = 'archwing';
  else if (archguns.has(row.item)) row.type = 'archgun';
  else if (archmelee.has(row.item)) row.type = 'archmelee';
}

function applyStablePatternRoute(row) {
  if (directBaroItems.has(row.item)) {
    row.vaulted = 'No';
    row.route = 'Baro Ki’Teer rotating inventory / player trade';
    row.steps = `Buy the completed ${row.item} when Baro carries it, or trade for an unranked copy.`;
    row.tip = 'Check the live Baro inventory before trading; his stock changes every visit.';
  } else if (sentinelBundledWeapons[row.item]) {
    const sentinel = sentinelBundledWeapons[row.item];
    row.route = `${sentinel} bundled companion weapon`;
    row.steps = `Obtain ${sentinel}; ${row.item} is granted automatically with it.`;
    row.tip = 'The bundled weapon uses its own companion inventory slot.';
  } else if (houndBundledWeapons[row.item]) {
    const source = houndBundledWeapons[row.item];
    row.route = 'Sister of Parvos Hound reward / Legs assembly';
    row.steps = `Claim ${source}; ${row.item} is granted automatically.`;
    row.tip = 'Check the completed Hound model before assembling another one.';
  } else if (invasionItems.has(row.item) && row.route === UNVERIFIED) {
    row.route = 'Invasion reward rotation / player trade';
    row.steps = `Check active Invasions for ${row.item}; complete all three missions for the needed reward, or trade for it.`;
    row.tip = 'Check both sides of the live Invasion feed before trading.';
  }
}

function applyDynamicRecommendation(row) {
  const parts = missingParts(row);
  const materials = materialNeeds(row);
  const materialText = naturalList(materials.filter((part) => part.remaining > 0).map((part) => `${part.remaining.toLocaleString('en-US')} ${part.name}`));
  if (row.item === 'Catabolyst') {
    row.steps = `Buy the ${row.item} Blueprint from the Market${materialText ? `, then obtain ${materialText}` : ''}.`;
  } else if (['Kreska', 'Tatsu'].includes(row.item) && materialText) {
    row.steps = `Obtain ${materialText}.`;
  } else if (row.item === 'Cantare' && materialText) {
    row.steps = `Farm or buy the blueprint from Ordis with Vestigial Motes. Obtain ${materialText} last.`;
    row.tip = 'Complete the optional Sister objective for extra Vestigial Motes; Argon Crystals decay.';
  } else if (['Needlenose', 'Runway'].includes(row.item) && materialText) {
    row.steps = `Buy the ${row.item} Board Blueprint from Roky and obtain ${materialText}. Assemble the K-Drive and level it to 30. No gilding is required.`;
  } else if (row.item === 'Hema' && materialText) {
    row.steps = `Replicate the Blueprint from completed Bio Lab research. Obtain ${materialText}, then build.`;
  } else if (row.item === 'Vitrica') {
    const needsBlueprint = parts.some((part) => normalizeText(part) === 'vitrica');
    const clauses = [];
    if (needsBlueprint) clauses.push('enter Nihil’s Oubliette with its key and defeat Nihil for the Vitrica Blueprint');
    if (materialText) clauses.push(`obtain ${materialText}`);
    row.steps = `${naturalList(clauses).replace(/^./, (character) => character.toUpperCase())}.`;
  } else if (row.item === 'Miter') {
    const needed = parts.filter((part) => /^Miter /.test(part));
    const names = needed.map((part) => part.replace(/^Miter /, ''));
    row.steps = `Repeat Exta for the missing ${naturalList(names)}. Each completed mission awards one of six equally weighted weapon rewards: the five Miter pieces or the Twin Gremlins Blueprint.`;
    const usefulChance = (needed.length * 100 / 6).toFixed(2);
    row.tip = `Each Miter piece has a 16.67% chance. With ${needed.length} distinct piece${needed.length === 1 ? '' : 's'} missing, a clear currently has a ${usefulChance}% chance to give a needed piece${needed.length === 2 ? '; after the first drops, the last piece remains 16.67%' : ''}. Focus Captain Vor first, then complete Lieutenant Lech Kril’s armor mechanic.`;
  } else if (row.item === 'Detron') {
    const needed = parts.map((part) => part.replace(/^Detron /, ''));
    row.steps = `Fight against the Corpus across five Invasion missions by supporting the Grineer to earn a Zanuka Hunter death mark. Then run eligible Corpus missions until Zanuka attacks, or use a Zanuka Hunter Beacon. Defeat it for the missing ${naturalList(needed)}.`;
    const chances = { Blueprint: '17.65%', Barrel: '32.35%', Receiver: '32.35%' };
    row.tip = `${needed.map((part) => `${part} chance: ${chances[part]}`).join('. ')}. The Blueprint, components and completed Detron are not tradeable. Zanuka Hunter Beacons rotate through Baro Ki’Teer’s inventory.`;
  } else if (row.item === 'Ceti Lacera' && materialText) {
    row.steps = `Not currently obtainable from an active event; Blueprint is tradeable. Obtain ${materialText} for crafting.`;
  } else if (row.item === 'Thalys' && materialText) {
    row.steps = `Buy the Blueprint from Acrithis using Scuttler Husks and obtain ${materialText} from Murmur enemies during Isleweaver.`;
  } else if (row.item === 'Athodai') {
    row.steps = `Obtain the missing ${naturalList(parts.map((part) => part.replace(/^Athodai /, '')))} from Venus Proxima abandoned-derelict cache B.`;
  } else if (row.item === 'Carmine Penta') {
    row.steps = `Farm the missing ${naturalList(parts.map((part) => part.replace(/^Carmine Penta /, '')))} from Pluto or Veil Corpus Proxima abandoned Freightlinker cache B.`;
  } else if (row.item === 'Nautilus') {
    row.steps = `Farm the missing ${naturalList(parts.map((part) => part.replace(/^Nautilus /, '')))} from Neptune Proxima abandoned Ice Mine cache B, or from Arva Vector rotations B and C.`;
  } else if (row.item === 'Mandonel') {
    const routes = {
      'Mandonel Blueprint': 'Cavia Bounties',
      'Mandonel Barrel': 'Persto C, Munio C, or Cambire B',
      'Mandonel Receiver': 'Persto C, Munio B, or Cambire C',
      'Mandonel Stock': 'Persto B, Munio C, or Cambire C',
    };
    row.steps = parts.map((part) => `${part.replace(/^Mandonel /, '')}: ${routes[part] || 'check current Cavia rewards'}`).join('. ') + '.';
  }
}

function relicInventoryCount(relic) {
  const inventory = data.meta.relicInventory;
  if (!inventory || typeof inventory !== 'object') return null;
  return Object.entries(inventory)
    .filter(([name]) => name === relic || name.startsWith(`${relic} `))
    .reduce((total, [, count]) => total + (Number.isFinite(count) ? count : 0), 0);
}

function requiredCopies(part) {
  const match = String(part).match(/ \(([\d,]+)\/([\d,]+)\)$/);
  return match ? Number(match[2].replaceAll(',', '')) - Number(match[1].replaceAll(',', '')) : 1;
}

function permanentPrimeInstructions(row) {
  const farms = row.primeDetails.map((detail) => {
    const copies = requiredCopies(detail.part);
    const part = detail.part.replace(/ \([\d,]+\/[\d,]+\)$/, '');
    return `Farm ${detail.relic} for ${part}${copies > 1 ? ` ×${copies}` : ''}. ${detail.relic} comes from ${detail.relicSource}. Open it ${detail.refinement} because the reward is ${detail.rarity}.`;
  });
  row.steps = `${farms.join(' ')} Build ${row.item} and level it to 30.`;
  row.tip = 'Do not spend Void Traces refining Common rewards. Compare trade prices only if farming the final copies becomes inefficient.';
}

function primeDetailsFor(row, catalog) {
  const details = [];
  for (const part of missingParts(row)) {
    const normalizedPart = part.replace(/ \(\d+\/\d+\)$/, '');
    for (const [relic, definition] of Object.entries(catalog)) {
      const rarity = definition.rewards[normalizedPart];
      if (!rarity) continue;
      details.push({
        part,
        relic,
        rarity,
        ownedRelics: relicInventoryCount(relic),
        relicSource: definition.source,
        refinement: rarity === 'Rare' ? 'Radiant' : rarity === 'Uncommon' ? 'Flawless' : 'Intact',
      });
      break;
    }
  }
  return details;
}

function applyPrimeAvailability(row) {
  let catalog = null;
  if (activeResurgenceItems.has(row.item)) {
    row.primeStatus = 'RESURGENCE ACTIVE';
    catalog = primeRules.activeResurgenceRelics;
  } else if (permanentRailjackItems.has(row.item)) {
    row.primeStatus = 'PERMANENT SPECIAL RELICS';
    catalog = primeRules.permanentRailjackRelics;
  } else if (row.item === 'Kavasa Prime Kubrow Collar' || row.vaulted === 'Yes') {
    row.primeStatus = data.meta.relicInventory ? 'TRADE ONLY' : 'DATA INCOMPLETE';
  } else if (usesRelics(row) && row.vaulted !== 'Yes') {
    row.primeStatus = 'CURRENT RELICS';
  } else {
    delete row.primeStatus;
  }
  row.primeDetails = catalog ? primeDetailsFor(row, catalog) : [];
  if (row.primeDetails.some((detail) => detail.ownedRelics > 0)) row.primeStatus = 'OWNED RELICS';
  if (row.primeStatus === 'RESURGENCE ACTIVE') {
    row.route = 'Prime Resurgence — Varzia relics for Aya';
    row.steps = 'Buy the listed current relics from Varzia for Aya, then open them in Void Fissures.';
    row.tip = 'Use the per-part refinement shown below; spend Aya only on relics containing pieces still missing.';
  } else if (row.primeStatus === 'PERMANENT SPECIAL RELICS') {
    row.route = 'Permanent Railjack relic pools';
    permanentPrimeInstructions(row);
  } else if ((row.primeStatus === 'TRADE ONLY' || row.primeStatus === 'DATA INCOMPLETE') && !row.primeDetails.length) {
    row.route = 'Currently vaulted — owned relics or player trade';
    row.steps = 'Check your existing relics for the listed missing parts. If none are available, trade only for those gaps.';
    row.tip = 'Compare individual part prices with the full set price before buying.';
  }
}

function applyPrimeDependency(row) {
  const base = primeDependencies[row.item];
  if (!base) return;
  const others = missingParts(row).filter((part) => !normalizeText(part).startsWith(normalizeText(base)));
  row.missing = [`${base} (0/2)`, ...others].join('; ');
  const assemblable = data.meta.basePrimeAssemblies?.[base];
  row.basePrimeDependency = { item: base, required: 2, completeOwned: 0, assemblable: Number.isFinite(assemblable) ? assemblable : null };
  row.steps = `Build two complete ${base} weapons, then consume both in the ${row.item} recipe${others.length ? ` along with ${naturalList(others)}` : ''}.`;
  row.tip = Number.isFinite(assemblable)
    ? `Current component inventory can assemble ${assemblable} complete ${base} weapon${assemblable === 1 ? '' : 's'}; the recipe requires two.`
    : `The recipe consumes two completed ${base} weapons. Component-level assembly capacity will be calculated on the next AlecaFrame import.`;
}

function applyLiveMatches(row) {
  const matches = [];
  const missing = missingParts(row).map(normalizeText);
  if (live.invasions.status === 'verified') {
    for (const reward of live.invasions.rewards || []) {
      if (missing.some((part) => normalizeText(reward).includes(part) || part.includes(normalizeText(reward)))) matches.push(`Invasion: ${reward}`);
    }
  }
  if (live.baro.status === 'verified' && live.baro.active && (!live.baro.endsAt || Date.parse(live.baro.endsAt) > Date.now())) {
    for (const item of live.baro.items || []) {
      if (normalizeText(item) === normalizeText(row.item)
        || (row.item === 'Detron' && normalizeText(item) === normalizeText('Zanuka Hunter Beacon'))
        || (row.item === 'Brakk' && normalizeText(item) === normalizeText('Grustrag Three Beacon'))
        || (row.item === 'Despair' && normalizeText(item) === normalizeText('Stalker Beacon'))) matches.push(`Baro: ${item}`);
    }
  }
  if (activeResurgenceItems.has(row.item)) matches.push('Prime Resurgence');
  for (const event of live.events.items || []) {
    if ((/Razorback/i.test(event) && row.item === 'Gorgon Wraith') || (/Fomorian/i.test(event) && row.item === 'Imperator Vandal')) matches.push(event);
  }
  row.liveMatches = [...new Set(matches)];
}

function clean(row) {
  const out = { ...row };
  if (fillerRoutes.has(out.route)) {
    out.route = UNVERIFIED;
    out.steps = '';
    out.tip = '';
  }
  for (const field of ['steps', 'tip']) {
    if (truncated(out[field]) || fillerPhrases.some((phrase) => String(out[field] || '').includes(phrase))) out[field] = '';
  }
  if (truncated(out.route)) out.route = UNVERIFIED;
  if (exact[out.item]) [out.route, out.steps, out.tip] = exact[out.item];
  delete out.availabilityGroup;
  if (nightwaveItems.has(out.item) && !['Vitrica', 'Wolf Sledge'].includes(out.item)) out.tip = nightwaveTip;
  if (sourceOverrides[out.item]) out.source = sourceOverrides[out.item];
  out.source = normalizeSource(out.source);
  if (out.item === 'Bhaira Hound') out.missing = 'Bhaira Model / completed Hound using the Bhaira Model';

  if (!out.status && /^Coda /.test(out.item) && !/Complete|Rank 40 Projects/.test(out.route || '')) {
    out.route = 'Eleanor in the Höllvania Central Mall — Live Heartcells';
    out.missing = 'Completed weapon from Eleanor';
    out.steps = 'Vanquish any Technocyte Coda for 10–15 Live Heartcells, then buy the weapon from Eleanor for 10 Heartcells when its rotating bonus is good.';
    out.tip = 'Check Eleanor’s rotating elemental bonus before spending Heartcells.';
  } else if (!out.status && /^Kuva /.test(out.item) && !/Complete|Rank 40 Projects/.test(out.route || '')) {
    out.route = 'Kuva Lich adversary';
    out.missing = 'Completed adversary weapon';
    out.steps = 'Create a Lich carrying the weapon, complete the adversary sequence, and vanquish it.';
    out.tip = 'Check the Larvling weapon preview before creating the Lich.';
  } else if (!out.status && /^Tenet /.test(out.item) && !/Complete|Rank 40 Projects/.test(out.route || '')) {
    const glast = /Agendus|Exec|Ferrox|Grigori|Livia/.test(out.item);
    out.route = glast ? 'Ergo Glast relay stock — Corrupted Holokeys' : 'Sister of Parvos adversary';
    out.missing = 'Completed weapon';
    out.steps = glast ? 'Buy the completed weapon from Ergo Glast when its rotating bonus is acceptable.' : 'Create a Sister carrying the weapon, complete the adversary sequence, and vanquish her.';
    out.tip = glast ? 'Check the weekly element and bonus before spending Holokeys.' : 'Check the Candidate weapon preview before creating the Sister.';
  } else if (!out.status && /^Prisma /.test(out.item)) {
    out.route = 'Baro Ki’Teer rotating inventory';
    out.steps = 'Buy the completed weapon from Baro when it returns, or trade for it.';
    out.tip = 'Check Baro’s current relay stock before trading.';
  } else if (!out.status && /^(Rakta|Sancti|Secura|Telos) /.test(out.item)) {
    out.route = 'Syndicate offering or player trade';
    out.steps = 'Buy the completed weapon from its aligned Syndicate at the required rank, or trade for it.';
    out.tip = 'Syndicate weapons are delivered complete; compare the Standing cost with the current player-trade price.';
  } else if (!out.status && /^Dex /.test(out.item)) {
    out.route = 'Warframe anniversary reward';
    out.steps = 'Claim the completed weapon during its anniversary alert.';
    out.tip = 'The anniversary reward is delivered complete with a weapon slot and Orokin Catalyst.';
  } else if (!out.status && companionBreeds.has(out.item) && out.type === 'companion') {
    out.route = 'Companion breeding in the Orbiter Incubator';
    if (out.item === 'Vasca Kavat') {
      out.steps = 'Let an owned Kavat become infected by a Vasca on the Plains at night, make two Vasca imprints, then breed with those imprints and Kavat Genetic Codes.';
      out.tip = 'Two Vasca imprints guarantee the Vasca breed.';
    } else if (/Kubrow$/.test(out.item)) {
      out.steps = `Incubate a Kubrow Egg. Use two ${out.item} genetic imprints to guarantee the breed.`;
      out.tip = 'Without two matching imprints, the Kubrow breed is random.';
    } else {
      out.steps = `Breed a Kavat using Kavat Genetic Codes. Use two ${out.item} imprints to guarantee the breed.`;
      out.tip = 'Without two matching imprints, the ordinary Kavat breed is random.';
    }
  }
  if (kDriveBoards.has(out.item) && !exact[out.item]) {
    out.route = 'Roky / Ventkids K-Drive Board';
    out.steps = 'Buy the Board Blueprint from Roky, assemble the K-Drive, and level it to 30. No gilding is required.';
    out.tip = 'Buy only the board blueprint still needed for mastery using Ventkids Standing.';
  }
  applySpecializedType(out);
  applyStablePatternRoute(out);
  applyPrimeDependency(out);
  applyDynamicRecommendation(out);
  applyPrimeAvailability(out);
  applyLiveMatches(out);
  if (nightwaveItems.has(out.item)) out.availabilityGroup = 'nightwave';
  else if (/^Baro Ki/i.test(out.route || '')) out.availabilityGroup = 'baro';
  else if (/Dojo|Dagath.s Hollow/i.test(out.route || '')) out.availabilityGroup = 'dojo';
  for (const field of ['route', 'steps', 'tip', 'rankRule', 'action', 'formaPlan']) {
    if (typeof out[field] === 'string') out[field] = out[field].replace(/…|\.\.\./g, '.').replace(/\.\./g, '.');
  }
  return out;
}

const existingCards = new Map([...data.queue, ...data.vaulted].map((row) => [row.item, row]));
data.arsenal = data.arsenal.map((row) => clean({ ...row, missing: defaultMissing(row) }));
data.arsenal = data.arsenal.map((row) => {
  if (row.mastered !== 'Yes' || row.pendingFoundry !== 'Yes') return row;
  return {
    ...row,
    state: row.owned === 'Yes' ? 'Owned + mastered' : 'Mastered; not currently owned',
    pendingFoundry: 'No',
    targetRank: row.targetRank === 'Complete' ? '30' : row.targetRank,
    rankRule: '',
    ease: '1 — Complete',
    route: row.route === 'Foundry' ? 'Mastery complete' : row.route,
  };
});

data.rank40 = data.rank40.map((row) => {
  const normalized = { ...row };
  applySpecializedType(normalized);
  if (confirmedAt40.has(row.item)) {
    normalized.status = 'Confirmed at 40';
    normalized.owned = 'Yes';
    normalized.mastered = 'Yes';
    normalized.rankRule = 'Rank 40 and five total Forma explicitly confirmed.';
    normalized.action = 'Complete — no action needed.';
    normalized.formaPlan = 'Five total Forma complete';
  } else if (/^Active/.test(row.status)) {
    normalized.status = 'Active to 40';
  } else if (/^Parked/.test(row.status)) {
    normalized.status = 'Parked at 30';
  } else {
    normalized.status = 'Current rank unknown';
    normalized.rankRule = 'Weapon is acquired, but rank 40 and five Forma are not explicitly confirmed.';
    normalized.action = 'Verify current rank and Forma count before scheduling more Forma.';
    normalized.formaPlan = 'Unknown until verified';
  }
  const cleaned = clean(normalized);
  for (const field of ['route', 'missing', 'steps', 'tip', 'primeDetails', 'liveMatches', 'source']) {
    delete cleaned[field];
  }
  return cleaned;
});

const rank40ByName = new Map(data.rank40.map((row) => [row.item, row]));
data.arsenal = data.arsenal.map((row) => {
  const project = rank40ByName.get(row.item);
  if (!project) return row;
  const next = { ...row, state: project.status, missing: '', route: project.status };
  if (project.status === 'Confirmed at 40') {
    next.owned = 'Yes';
    next.mastered = 'Yes';
    next.complete = 'Yes';
    next.targetRank = '40';
    next.rankRule = project.rankRule;
    next.ease = '1 — Complete';
  } else if (project.status === 'Active to 40') {
    next.targetRank = '40';
    next.rankRule = project.rankRule;
    next.ease = '1 — Active project';
  } else if (project.status === 'Parked at 30') {
    next.targetRank = '30';
    next.rankRule = project.rankRule;
    next.ease = '6 — Parked';
  } else {
    next.targetRank = 'Unknown';
    next.rankRule = project.rankRule;
    next.ease = '6 — Verify rank';
  }
  return next;
});

function cardFromArsenal(row) {
  const old = existingCards.get(row.item) || {};
  const card = clean({
    ease: row.ease,
    item: row.item,
    type: row.type,
    targetRank: row.targetRank,
    missing: row.missing,
    route: row.route,
    steps: old.steps || row.steps || 'Acquire the item through the listed route, then build and level it.',
    tip: old.tip || row.tip || 'Check the live availability feed before spending Platinum.',
    source: row.source,
    vaulted: row.vaulted,
  });
  card.practicalPriority = practicalPriority(card);
  return card;
}

const missingRows = data.arsenal.filter((row) => row.state === 'Missing');
const cards = missingRows.map(cardFromArsenal);
data.vaulted = cards.filter((row) => row.primeStatus || row.vaulted === 'Yes' || usesRelics(row)).sort((a, b) => a.item.localeCompare(b.item));
data.queue = cards.filter((row) => !row.primeStatus && row.vaulted !== 'Yes' && !usesRelics(row)).sort((a, b) => a.practicalPriority - b.practicalPriority || a.item.localeCompare(b.item));
const arsenalByName = new Map(data.arsenal.map((row) => [row.item, row]));
data.owned = data.owned.filter((row) => {
  const arsenal = arsenalByName.get(row.item);
  return arsenal && arsenal.mastered !== 'Yes' && (arsenal.pendingFoundry === 'Yes' || arsenal.owned === 'Yes');
}).map((row) => {
  const next = { ...row, source: normalizeSource(row.source) };
  const weapon = ['primary', 'secondary', 'melee', 'archgun', 'archmelee'].includes(next.type);
  next.steps = next.state === 'Ready in Foundry'
    ? 'Claim from Foundry; equip and level to 30.'
    : 'Check Arsenal and level to 30 if needed.';
  next.tip = weapon
    ? `Level this ${next.type} in Sanctuary Onslaught, Helene, or Hydron; equip fewer other weapons to focus affinity.`
    : next.type === 'companion'
      ? 'Level the companion in high-affinity missions.'
      : 'Level in Sanctuary Onslaught, Helene, or Hydron.';
  return next;
});
data.meta.summary = {
  activeTo40: data.rank40.filter((row) => row.status === 'Active to 40').length,
  confirmedAt40: data.rank40.filter((row) => row.status === 'Confirmed at 40').length,
  parkedAt30: data.rank40.filter((row) => row.status === 'Parked at 30').length,
  currentRankUnknown: data.rank40.filter((row) => row.status === 'Current rank unknown').length,
  missing: missingRows.length,
};
fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
