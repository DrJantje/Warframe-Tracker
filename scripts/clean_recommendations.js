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
  Brakk: ['Grustrag Three', 'Defeat the Grustrag Three for the Brakk blueprint and components.', 'Use a Grustrag Three Beacon if you want to force an encounter.'],
  Despair: ['Stalker', 'Defeat the Stalker until the Despair Blueprint drops.', 'The blueprint is the entire acquisition gate.'],
  Velox: ['Granum Void after The Deadlock Protocol', 'Barrel: Normal Granum Void. Receiver: Extended Granum Void. Reach the top kill tier.', 'Use Xoris heavy throws to free Solaris captives and extend the timer.'],
  Seer: ['Captain Vor on Tolstoj, Mercury', 'Defeat Captain Vor on Tolstoj for the Seer Blueprint and Barrel.', 'Repeat Tolstoj until both missing pieces drop.'],
  Catabolyst: ['Market Blueprint + materials', 'Buy the Catabolyst Blueprint from the Market, then obtain 1 Mutagen Mass and 4 Scintillant.', 'Run Deimos Isolation Vault bounties for Scintillant; use Invasions or Bio Lab blueprints for Mutagen Mass.'],
  Kreska: ['Market Blueprint + Fortuna materials', 'Buy the Kreska Blueprint from the Market, then obtain 4 Fieldron and 2 Longwinder Lathe Coagulant.', 'Use Corpus Invasions for Fieldron and fish Longwinders in Orb Vallis for the remaining Coagulant.'],
  Tatsu: ['Market Blueprint + Cetus/Fortuna materials', 'Buy the Tatsu Blueprint from the Market, then obtain 50 Auroxium Alloy and 70 Hespazym Alloy.', 'Mine on the Plains of Eidolon and Orb Vallis, then refine the ores at the matching vendor.'],
  Vitrica: ['Defeat Nihil using Nihil’s Oubliette + Oxium', 'Enter Nihil’s Oubliette with an Enter Nihil’s Oubliette Key, defeat Nihil for the Vitrica Blueprint, then obtain 558 Oxium.', 'The Oubliette and entry key rotate through Nightwave Cred Offerings; farm Oxium Ospreys without letting them self-destruct.'],
  'Kavasa Prime Kubrow Collar': ['Vaulted Void Relics, Prime Resurgence, or player trade', 'Open relics containing the Collar Blueprint, Band, and Buckle, or trade for the missing Prime parts.', 'This is Prime equipment, not a Kubrow breed.'],
  'Wolf Sledge': ['Wolf of Saturn Six; Wolf Beacon', 'Farm all four completed weapon components from the Wolf of Saturn Six.', 'Use Wolf Beacons with a prepared squad.'],
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
  if (/K-Drive|Ventkids/i.test(`${out.route || ''} ${out.tip || ''}`)) {
    out.steps = String(out.steps || '').replace(/gild[^.]*\.?/gi, '');
    out.tip = 'Earn Ventkids Standing through races, buy the component blueprint, assemble, and level it for mastery.';
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
