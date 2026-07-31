from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.js"

OLD_HEAD = """const [data, availability, nightwaveCatalog, liveStatus] = await Promise.all([
  fetch('./data/warframe.json', { cache: 'no-store' }).then(check),
  fetch('./data/availability.json', { cache: 'no-store' }).then(check),
  fetch('./data/nightwave-items.json', { cache: 'no-store' }).then(check),
  fetch('./data/live.json', { cache: 'no-store' }).then(check),
]).catch((error) => {
"""

NEW_HEAD = """const [data, availability, nightwaveCatalog, liveStatus, accountSync] = await Promise.all([
  fetch('./data/warframe.json', { cache: 'no-store' }).then(check),
  fetch('./data/availability.json', { cache: 'no-store' }).then(check),
  fetch('./data/nightwave-items.json', { cache: 'no-store' }).then(check),
  fetch('./data/live.json', { cache: 'no-store' }).then(check),
  fetch('./data/account-sync.json', { cache: 'no-store' }).then(check).catch(() => ({ items: [] })),
]).catch((error) => {
"""

OLD_APPLY = """applyConsistencyFixes(data);

function check(response) {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}
"""

NEW_APPLY = """applyAccountSync(data, accountSync);
applyConsistencyFixes(data);

function check(response) {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function applyAccountSync(payload, sync) {
  const liveItems = Array.isArray(sync?.items) ? sync.items : [];
  if (!liveItems.length) return;

  const arsenalByName = new Map((payload.arsenal || []).map((row) => [row.item, row]));
  const rank40Names = new Set((payload.rank40 || []).map((row) => row.item));
  const liveByName = new Map(liveItems.map((row) => [row.item, row]));

  for (const live of liveItems) {
    const row = arsenalByName.get(live.item);
    if (!row) continue;

    if (live.owned) row.owned = 'Yes';
    if (live.mastered) row.mastered = 'Yes';
    row.liveXp = Number(live.xp || 0);
    row.formaApplied = Number(live.formaApplied || 0);

    // The live cache may add positive evidence, but absence or low XP must
    // never erase mastery already recorded by the acquisition tracker.
    if (row.mastered === 'Yes') {
      row.complete = 'Yes';
      row.missing = '';
      if (!rank40Names.has(row.item)) {
        row.state = row.owned === 'Yes' ? 'Owned + mastered' : 'Mastered; not currently owned';
        row.targetRank = '30';
        row.route = 'Mastery complete';
      }
    } else if (row.owned === 'Yes') {
      row.complete = 'Yes';
      row.missing = '';
      if (!rank40Names.has(row.item)) {
        row.state = 'Owned; rank unknown';
        row.targetRank = '30';
        row.route = 'Already owned';
      }
    }
  }

  const stillNeedsAcquisition = (card) => {
    const row = arsenalByName.get(card.item);
    return !row || (row.owned !== 'Yes' && row.mastered !== 'Yes');
  };
  payload.queue = (payload.queue || []).filter(stillNeedsAcquisition);
  payload.vaulted = (payload.vaulted || []).filter(stillNeedsAcquisition);

  const ownedByName = new Map(
    (payload.owned || [])
      .filter((card) => arsenalByName.get(card.item)?.mastered !== 'Yes')
      .map((card) => [card.item, card]),
  );
  for (const live of liveItems) {
    const row = arsenalByName.get(live.item);
    if (!row || row.owned !== 'Yes' || row.mastered === 'Yes' || rank40Names.has(row.item)) continue;
    if (!ownedByName.has(row.item)) {
      const weaponTypes = new Set(['primary', 'secondary', 'melee', 'archgun', 'archmelee']);
      ownedByName.set(row.item, {
        item: row.item,
        type: row.type,
        state: 'Owned; rank unknown',
        targetRank: '30',
        steps: 'Check Arsenal and level to 30 if needed.',
        tip: weaponTypes.has(row.type)
          ? `Level this ${row.type} in Sanctuary Onslaught, Helene, or Hydron; equip fewer other weapons to focus affinity.`
          : 'Level in Sanctuary Onslaught, Helene, or Hydron.',
        source: row.source,
      });
    }
  }
  payload.owned = [...ownedByName.values()].sort((a, b) => a.item.localeCompare(b.item));

  if (sync.generatedAt) {
    payload.meta.accountSyncAt = sync.generatedAt;
    payload.meta.accountSyncSourceSha256 = sync.sourceSha256 || null;
    const date = new Date(sync.generatedAt);
    if (Number.isFinite(date.getTime())) {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(date).map(({ type, value }) => [type, value]),
      );
      payload.meta.snapshotDate = `${parts.year}-${parts.month}-${parts.day}`;
    }
  }
}
"""


def main() -> None:
    text = APP.read_text(encoding="utf-8")
    changed = False

    if "accountSync" not in text.splitlines()[0]:
        if OLD_HEAD not in text:
            raise SystemExit("Could not locate app.js data-loading block")
        text = text.replace(OLD_HEAD, NEW_HEAD, 1)
        changed = True

    if "function applyAccountSync" not in text:
        if OLD_APPLY not in text:
            raise SystemExit("Could not locate app.js consistency hook")
        text = text.replace(OLD_APPLY, NEW_APPLY, 1)
        changed = True

    if changed:
        APP.write_text(text, encoding="utf-8")
        print("Installed account-sync loading and merge logic")
    else:
        print("Account-sync logic already installed")


if __name__ == "__main__":
    main()
