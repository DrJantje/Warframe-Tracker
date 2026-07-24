const fs = require('fs');
const file = 'data/warframe.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const UNVERIFIED = 'Acquisition route not verified yet';
const fillerRoutes = new Set([
  'Focused two-part farm',
  'Multi-part item-specific farm',
  'Single item-specific drop or vendor gate',
]);
const fillerPhrases = ['Open the item page', 'Farm the rarer part first', 'Batch parts from the same node or faction'];

const exact = {
  Acceltra: ['Ur, Uranus — Disruption; Demolisher Infested', 'Kill Demolisher Infested on Ur until the Acceltra blueprint drops.', 'Protect every conduit and prioritize Demolishers; resource boosters do not affect blueprint drops.'],
  Akarius: ['Ur, Uranus — Disruption; Demolisher Infested', 'Kill Demolisher Infested on Ur until the Akarius blueprint drops.', 'Protect every conduit and prioritize Demolishers; resource boosters do not affect blueprint drops.'],
  Octavia: ['Lua and Deimos component farms', 'Neuroptics: Deimos Survival rotation C. Systems: Lua Crossfire caches. Main blueprint: Octavia’s Anthem.', 'Use loot radar for Lua caches; stay to rotation C on Deimos.'],
  Protea: ['Granum Void after The Deadlock Protocol', 'Chassis: Extended Granum Void. Neuroptics: Nightmare Granum Void. Reach the top kill tier.', 'Use Xoris heavy throws to free Solaris captives and extend the timer.'],
  Oberon: ['Railjack point-of-interest rewards', 'Neuroptics: Saturn Proxima. Systems: Earth Proxima. Complete the marked point of interest.', 'Choose short Railjack nodes and finish the side objective before extraction.'],
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
  Nidus: ['Oestrus, Eris — Infested Salvage rotation C', 'Farm all three components from rotation C; main blueprint: The Glast Gambit.', 'Keep vaporizer coverage high and stay through rotation C.'],
  'Wolf Sledge': ['Wolf of Saturn Six; Wolf Beacon', 'Farm all four completed weapon components from the Wolf of Saturn Six.', 'Use Wolf Beacons with a prepared squad.'],
};

function truncated(value) {
  return typeof value === 'string' && (value.includes('…') || value.includes('...'));
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
    out.route = 'Eleanor in the Hollvania Central Mall — Live Heartcells';
    out.missing = 'Completed weapon from Eleanor';
    out.steps = 'Earn Live Heartcells from Technocyte Coda content, then buy the completed weapon from Eleanor.';
    out.tip = 'There is no matching weapon Coda to hunt.';
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
  } else if (/Kubrow|Kavat/.test(out.item) && out.type === 'companion') {
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
data.arsenal = data.arsenal.map(clean);
fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
