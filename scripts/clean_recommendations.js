const fs = require('fs');
const file = 'data/warframe.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const overrides = JSON.parse(fs.readFileSync('data/overrides.json', 'utf8'));
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
const nightwaveItems = new Set(['Ceramic Dagger', 'Dark Dagger', 'Dark Sword', 'Glaive', 'Jaw Sword', 'Plasma Sword', 'Vitrica', 'Wolf Sledge']);
const nightwaveTip = 'Cred Offerings rotate weekly. Check the Nightwave tab before spending Cred or farming unrelated items.';
const sourceOverrides = {
  Hema: 'https://wiki.warframe.com/w/Hema',
  Corufell: 'https://wiki.warframe.com/w/Corufell',
  Pennant: 'https://wiki.warframe.com/w/Pennant',
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
  Cantare: ['Brutus, Uranus — Ascension; Ordis pity shop', 'Farm or buy the blueprint from Ordis with Vestigial Motes; obtain the remaining Argon Crystals last.', 'Complete the optional Sister objective; Argon decays.'],
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
  Catabolyst: ['Market Blueprint + materials', 'Buy the Catabolyst Blueprint from the Market, then obtain 1 Mutagen Mass and 4 Scintillant.', 'Run Deimos Isolation Vault bounties for Scintillant; use Invasions or Bio Lab blueprints for Mutagen Mass.'],
  Kreska: ['Market Blueprint + Fortuna materials', 'Buy the Kreska Blueprint from the Market, then obtain 4 Fieldron and 2 Longwinder Lathe Coagulant.', 'Use Corpus Invasions for Fieldron and fish Longwinders in Orb Vallis for the remaining Coagulant.'],
  Tatsu: ['Market Blueprint + Cetus/Fortuna materials', 'Buy the Tatsu Blueprint from the Market, then obtain 50 Auroxium Alloy and 70 Hespazym Alloy.', 'Mine on the Plains of Eidolon and Orb Vallis, then refine the ores at the matching vendor.'],
  Vitrica: ['Defeat Nihil using Nihil’s Oubliette + Oxium', 'Enter Nihil’s Oubliette with an Enter Nihil’s Oubliette Key, defeat Nihil for the Vitrica Blueprint, then obtain 558 Oxium.', 'The Oubliette and entry key rotate through Nightwave Cred Offerings; farm Oxium Ospreys without letting them self-destruct.'],
  'Kavasa Prime Kubrow Collar': ['Vaulted Void Relics, Prime Resurgence, or player trade', 'Open relics containing the Collar Blueprint, Band, and Buckle, or trade for the missing Prime parts.', 'This is Prime equipment, not a Kubrow breed.'],
  'Sirius & Orion': ['Uranus Proxima missions / Pontis Tower Secret Vendor', 'Earn the missing blueprints from Scoria’s Angel or The Kuva Wytch, or exchange Emerald or Crimson Talents at the Secret Vendor.', 'Use the matching Talent exchange to finish whichever blueprint does not drop.'],
  Pride: ['The Kuva Wytch / Pontis Tower Secret Vendor', 'Earn its blueprints from The Kuva Wytch or buy them with Emerald Talents.', 'Spend Emerald Talents only on pieces still listed as missing.'],
  Wrath: ['Scoria’s Angel / Pontis Tower Secret Vendor', 'Earn its blueprints from Scoria’s Angel or buy them with Crimson Talents.', 'Spend Crimson Talents only on pieces still listed as missing.'],
  Follie: ['Follie’s Hunt / Aspirant Zorba', 'Farm the main and component blueprints from Follie’s Hunt or buy them from Zorba in a Relay using Atramentum.', 'Use Atramentum to eliminate the last duplicate-heavy gap.'],
  Enkaus: ['Follie’s Hunt / Aspirant Zorba', 'Farm the main and component blueprints from Follie’s Hunt or buy them from Zorba in a Relay using Atramentum.', 'Use Atramentum to eliminate the last duplicate-heavy gap.'],
  Nokko: ['Deepmines Bounties / Nightcap in The Airlock', 'Farm the blueprints from Deepmines Bounties or buy them from Nightcap using Fergolyte.', 'Keep the listed Fergolyte crafting requirements intact when choosing vendor purchases.'],
  Arbucep: ['Deepmines Bounties / Nightcap in The Airlock', 'Farm the blueprints from Deepmines Bounties or buy them from Nightcap using Fergolyte.', 'Keep the listed Fergolyte crafting requirements intact when choosing vendor purchases.'],
  Amanata: ['Saya’s Visions / Koumei’s Shrine', 'Farm its blueprints and components from Shrine Defense or buy the missing pieces with Fate Pearls.', 'Bank Fate Pearls and purchase only pieces that have not dropped.'],
  Higasa: ['Saya’s Visions / Koumei’s Shrine', 'Farm its blueprints and components from Shrine Defense or buy the missing pieces with Fate Pearls.', 'Bank Fate Pearls and purchase only pieces that have not dropped.'],
  'Riot-848': ['Stage Defense, Solstice Square / Flare’s Memorabilia', 'Farm its blueprints from Stage Defense or buy them with Beating Heartstrings.', 'Use Beating Heartstrings to finish the remaining listed pieces.'],
  Oraxia: ['Isleweaver / Scuttler Husk exchange', 'Earn its blueprints from Isleweaver or purchase missing pieces using Scuttler Husks.', 'Spend Scuttler Husks only after checking which pieces remain missing.'],
  Scyotid: ['Isleweaver / Scuttler Husk exchange', 'Earn its blueprints from Isleweaver or purchase missing pieces using Scuttler Husks.', 'Spend Scuttler Husks only after checking which pieces remain missing.'],
  Spinnerex: ['Isleweaver / Scuttler Husk exchange', 'Earn its blueprints from Isleweaver or purchase missing pieces using Scuttler Husks.', 'Spend Scuttler Husks only after checking which pieces remain missing.'],
  Thalys: ['Isleweaver Scuttler Husk vendor', 'Buy the blueprint using Scuttler Husks and obtain the remaining Temporal Dust needed for crafting.', 'The Missing field shows the current Temporal Dust balance and target.'],
  Aeolak: ['Chrysalith Tier 5 bounty + Zariman endless missions', 'Main Blueprint from a Tier 5 bounty; Barrel from Void Cascade Rotation C; Receiver and Stock from Void Flood Rotation C.', 'Target only the missions that reward the components still listed above.'],
  Hespar: ['Chrysalith Tier 4 bounty + Zariman endless missions', 'Main Blueprint from a Tier 4 bounty; Handle from Void Cascade Rotation C; Blade from Void Armageddon Rotation C.', 'Target only the missions that reward the components still listed above.'],
  Athodai: ['Venus Proxima abandoned derelicts', 'Obtain its Blueprint, Barrel and Receiver from abandoned derelict point-of-interest rewards.', 'Complete the derelict point of interest before extraction.'],
  'Carmine Penta': ['Corpus Proxima abandoned derelicts', 'Farm its components from applicable Corpus Railjack point-of-interest cache rewards.', 'Complete the derelict point of interest before extraction.'],
  Epitaph: ['Earth, Venus and Saturn Proxima Void Storms', 'Farm only the missing components from Void Storm rewards.', 'Choose the shortest comfortable Void Storms across the eligible Proxima regions.'],
  Nautilus: ['Neptune Proxima', 'Farm its components from Neptune Proxima point-of-interest rewards or Arva Vector Defense rotations.', 'Use the route matching the specific components still listed above.'],
  Mandonel: ['Cavia bounties + Entrati Labs endless missions', 'Main Blueprint from Cavia bounties; components from Persto, Munio and Cambire rewards.', 'Target only the mission rewards corresponding to the missing components.'],
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
  Basmu: ['Awaiting event rotation', 'Acquire the Blueprint from the currently verified event or vendor when active; otherwise wait for its event rotation.', 'Known event-gated item; check the active event inventory before farming or trading.'],
  'Ceti Lacera': ['Awaiting event rotation', 'Acquire the Blueprint from the currently verified event or vendor when active; otherwise wait for its event rotation.', 'Known event-gated item; keep the listed Oxium requirement for crafting.'],
  Sheev: ['Awaiting event rotation', 'Acquire its components from the currently verified event or vendor when active; otherwise wait for its event rotation.', 'Known event-gated item; farm only the components still listed above.'],
  Hema: ['Clan Dojo — completed Bio Lab research', 'Replicate the Blueprint from completed Bio Lab research, then build it.', 'No drop farm is required once the clan research is complete.'],
  Corufell: ['Tyana Pass, Mars — Mirror Defense / Otak', 'The Receiver is a Tyana Pass Rotation B reward or can be bought from Otak using crystal fragments.', 'Buy the Receiver from Otak if duplicate Rotation B rewards become inefficient.'],
  Needlenose: ['Roky / Ventkids K-Drive Board', 'Buy the Needlenose Board Blueprint from Roky and obtain the remaining Hespazym Alloy. Assemble the K-Drive and level it to 30. No gilding is required.', 'The Missing field preserves the current Hespazym Alloy balance.'],
  Runway: ['Roky / Ventkids K-Drive Board', 'Buy the Runway Board Blueprint from Roky and obtain the remaining Hespazym Alloy. Assemble the K-Drive and level it to 30. No gilding is required.', 'The Missing field preserves the current Hespazym Alloy balance.'],
  Azima: ['Daily Tribute weapon milestone', 'Select it at an eligible Daily Tribute weapon milestone. Cephalon Simaris sells replacement Blueprints only after this weapon was previously chosen.', 'This is a known login-gated route, not a standing shortcut for first acquisition.'],
  Zenistar: ['Daily Tribute weapon milestone', 'Select it at an eligible Daily Tribute weapon milestone. Cephalon Simaris sells replacement Blueprints only after this weapon was previously chosen.', 'This is a known login-gated route, not a standing shortcut for first acquisition.'],
  Zenith: ['Daily Tribute weapon milestone', 'Select it at an eligible Daily Tribute weapon milestone. Cephalon Simaris sells replacement Blueprints only after this weapon was previously chosen.', 'This is a known login-gated route, not a standing shortcut for first acquisition.'],
  'Sigma & Octantis': ['Daily Tribute weapon milestone', 'Select it at an eligible Daily Tribute weapon milestone. Cephalon Simaris sells replacement Blueprints only after this weapon was previously chosen.', 'This is a known login-gated route, not a standing shortcut for first acquisition.'],
  'Wolf Sledge': ['Wolf of Saturn Six; Wolf Beacon', 'Farm all four completed weapon components from the Wolf of Saturn Six.', nightwaveTip],
  Miter: ['Exta, Ceres — Captain Vor and Lieutenant Lech Kril', 'Repeat Exta for the missing Miter Chassis and Handle. Each completed mission awards one of six equally weighted weapon rewards: the five Miter pieces or the Twin Gremlins Blueprint.', 'Each Miter piece has a 16.67% chance. With Chassis and Handle both missing, there is initially a 33.33% chance that a clear gives one needed piece; after the first drops, the last piece remains 16.67%. Focus Captain Vor first, then complete Lieutenant Lech Kril’s armor mechanic.'],
  Detron: ['Zanuka Hunter — death mark or Zanuka Hunter Beacon', 'Fight against the Corpus across five Invasion missions by supporting the Grineer to earn a Zanuka Hunter death mark. Then run eligible Corpus missions until Zanuka attacks, or use a Zanuka Hunter Beacon. Defeat it for the missing Detron Blueprint and Receiver.', 'Blueprint chance: 17.65%. Receiver chance: 32.35%. The Blueprint, components and completed Detron are not tradeable. Zanuka Hunter Beacons rotate through Baro Ki’Teer’s inventory.'],
  Shedu: ['Veil Sentient anomaly — Symbilysts', 'Target the missing Handle; each Shedu part is a 1% Symbilyst drop.', 'The missing Handle is a 1% drop from each Symbilyst. Since Shedu parts are tradeable and only one piece remains, compare the Handle’s trade price before committing to a long Sentient Anomaly farm.'],
  Snipetron: ['Limited event/vendor rotation', 'Wait for Plague Star, Star Days, or another announced return of the Blueprint.', 'Check Nakak during Operation: Plague Star and Ticker during Star Days. Buy the Blueprint before the temporary shop closes.'],
};

function truncated(value) {
  return typeof value === 'string' && /\b[A-Za-z]{1,3}(?:…|\.\.\.)$/.test(value.trim());
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
  if (nightwaveItems.has(out.item)) out.availabilityGroup = 'nightwave';
  else delete out.availabilityGroup;
  if (nightwaveItems.has(out.item) && !['Vitrica', 'Wolf Sledge'].includes(out.item)) out.tip = nightwaveTip;
  if (sourceOverrides[out.item]) out.source = sourceOverrides[out.item];
  if (out.item === 'Bhaira Hound') out.missing = 'Bhaira Model / completed Hound using the Bhaira Model';

  if (/^Coda /.test(out.item) && !/Complete|Rank 40 Projects/.test(out.route || '')) {
    out.route = 'Eleanor in the Höllvania Central Mall — Live Heartcells';
    out.missing = 'Completed weapon from Eleanor';
    out.steps = 'Vanquish any Technocyte Coda for 10–15 Live Heartcells, then buy the weapon from Eleanor for 10 Heartcells when its rotating bonus is good.';
    out.tip = 'Check Eleanor’s rotating elemental bonus before spending Heartcells.';
  } else if (/^Kuva /.test(out.item) && !/Complete|Rank 40 Projects/.test(out.route || '')) {
    out.route = 'Kuva Lich adversary';
    out.missing = 'Completed adversary weapon';
    out.steps = 'Create a Lich carrying the weapon, complete the adversary sequence, and vanquish it.';
    out.tip = 'Check the Larvling weapon preview before creating the Lich.';
  } else if (/^Tenet /.test(out.item) && !/Complete|Rank 40 Projects/.test(out.route || '')) {
    const glast = /Agendus|Exec|Ferrox|Grigori|Livia/.test(out.item);
    out.route = glast ? 'Ergo Glast relay stock — Corrupted Holokeys' : 'Sister of Parvos adversary';
    out.missing = 'Completed weapon';
    out.steps = glast ? 'Buy the completed weapon from Ergo Glast when its rotating bonus is acceptable.' : 'Create a Sister carrying the weapon, complete the adversary sequence, and vanquish her.';
    out.tip = glast ? 'Check the weekly element and bonus before spending Holokeys.' : 'Check the Candidate weapon preview before creating the Sister.';
  } else if (/^Prisma /.test(out.item)) {
    out.route = 'Baro Ki’Teer rotating inventory';
    out.steps = 'Buy the completed weapon from Baro when it returns, or trade for it.';
    out.tip = 'Check Baro’s current relay stock before trading.';
  } else if (/^(Rakta|Sancti|Secura|Telos) /.test(out.item)) {
    out.route = 'Syndicate offering or player trade';
    out.steps = 'Buy the completed weapon from its aligned Syndicate at the required rank, or trade for it.';
    out.tip = '';
  } else if (/^Dex /.test(out.item)) {
    out.route = 'Warframe anniversary reward';
    out.steps = 'Claim the completed weapon during its anniversary alert.';
    out.tip = '';
  } else if (companionBreeds.has(out.item) && out.type === 'companion') {
    out.route = 'Companion breeding in the Orbiter Incubator';
    out.steps = 'Breed the required companion using the appropriate egg or genetic codes.';
    out.tip = 'Use genetic imprints when a specific breed must be guaranteed.';
  }
  if (kDriveBoards.has(out.item) && !exact[out.item]) {
    out.route = 'Roky / Ventkids K-Drive Board';
    out.steps = 'Buy the Board Blueprint from Roky, obtain the listed materials, then assemble the K-Drive and level it to 30. No gilding is required.';
    out.tip = 'Earn Ventkids Standing through races and buy only the Board Blueprint still needed for mastery.';
  }
  return out;
}

data.queue = data.queue.map(clean).filter((row) => String(row.missing || '').trim());
data.vaulted = data.vaulted.map(clean).filter((row) => String(row.missing || '').trim());
data.arsenal = data.arsenal.map(clean).map((row) => {
  if (row.item === 'Tenet Envoy' && !confirmedAt40.has(row.item) && row.state === 'Settled at 40') {
    return {
      ...row,
      state: 'Settled at 30/40',
      targetRank: '30/40',
      rankRule: 'Acquired and settled at rank 30 or 40; rank 40 and five Forma are not explicitly confirmed.',
    };
  }
  return row;
});
fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
