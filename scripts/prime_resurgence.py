"""Resolve Varzia's current Aya relics from Digital Extremes sources."""
from __future__ import annotations

import html
import lzma
import re

from worldstate import PRIMARY_WORLD_STATE_URL, iso_time, parse_time

INDEX_URL = "https://content.warframe.com/PublicExport/index_en.txt.lzma"
MANIFEST_URL = "https://content.warframe.com/PublicExport/Manifest/"
DROP_TABLE_URL = "https://www.warframe.com/droptables"
RELIC_SOURCE = "Varzia for Aya during the current Prime Resurgence rotation"


def relic_manifest_url(payload: bytes) -> str:
    # DE's index can have a damaged/truncated tail. Retain only complete lines;
    # never guess a manifest hash or use a partial required entry.
    decoder = lzma.LZMADecompressor()
    chunks = []
    for byte in payload:
        try:
            chunks.append(decoder.decompress(bytes([byte])))
        except (lzma.LZMAError, EOFError):
            break
    index = b"".join(chunks).decode("utf-8")
    match = re.search(r"(?m)^(ExportRelicArcane_en\.json![A-Za-z0-9_+\-]+)\r?\n", index)
    if not match:
        raise ValueError("DE export index has no complete relic manifest entry")
    return MANIFEST_URL + match[1]


def parse_relic_rewards(page: str, relic_names: set[str]) -> dict:
    catalog = {}
    headers = list(re.finditer(r'<th\b[^>]*>([^<]+ Relic \(Intact\))</th>', page))
    for header in headers:
        relic = html.unescape(header[1]).removesuffix(" Relic (Intact)")
        if relic not in relic_names:
            continue
        end = page.find("<th", header.end())
        section = page[header.end():end if end >= 0 else len(page)]
        rows = re.findall(r"<tr><td>([^<]+)</td><td>[^<]*\(([\d.]+)%\)</td></tr>", section)
        rewards = {}
        chances = []
        for name, chance_text in rows:
            chance = float(chance_text)
            # The HTML labels 25.33% as 'Uncommon'; relic slots use Common.
            if abs(chance - 25.33) < 0.02:
                rarity = "Common"
            elif abs(chance - 11.0) < 0.02:
                rarity = "Uncommon"
            elif abs(chance - 2.0) < 0.02:
                rarity = "Rare"
            else:
                raise ValueError(f"Unrecognized Intact chance in {relic}: {chance}")
            rewards[html.unescape(name).strip()] = rarity
            chances.append(chance)
        if len(rows) != 6 or len(rewards) != 6 or abs(sum(chances) - 100) > 0.05:
            raise ValueError(f"Incomplete official reward table for {relic}")
        catalog[relic] = {"source": RELIC_SOURCE, "rewards": rewards}
    missing = relic_names - catalog.keys()
    if missing:
        raise ValueError("Official reward tables missing: " + ", ".join(sorted(missing)))
    return catalog


def current_resurgence(raw: dict, tracker: dict, checked_ms: int, previous: dict,
                       fetch_bytes, fetch_json, fetch_text) -> dict:
    result = {
        "status": "unknown", "items": [], "relics": {},
        "relicCatalogStatus": "unavailable", "source": PRIMARY_WORLD_STATE_URL,
        "rewardsSource": DROP_TABLE_URL, "checkedAt": iso_time(checked_ms),
    }
    try:
        traders = raw.get("PrimeVaultTraders")
        if not isinstance(traders, list):
            raise ValueError("DE world state has no Prime Vault trader list")
        active = [trader for trader in traders
                  if (parse_time(trader.get("Activation")) or 0) <= checked_ms
                  < (parse_time(trader.get("Expiry")) or 0)]
        relic_ids = sorted({entry["ItemType"].replace("/StoreItems/", "/")
                            for trader in active for entry in trader.get("Manifest", [])
                            if "/Projections/" in entry.get("ItemType", "")
                            and entry.get("RegularPrice", 0) > 0})
        result["relicItemTypes"] = relic_ids
        result["expiresAt"] = min((iso_time(parse_time(t["Expiry"])) for t in active), default=None)
        if not active:
            result.update(status="verified", relicCatalogStatus="verified")
            return result
        if not relic_ids:
            raise ValueError("Active Varzia manifest has no Aya relics")
        cache_time = parse_time(previous.get("catalogCheckedAt")) or 0
        if (previous.get("relicCatalogStatus") == "verified"
                and previous.get("relicItemTypes") == relic_ids
                and previous.get("expiresAt") == result["expiresAt"]
                and previous.get("relics") and 0 <= checked_ms - cache_time < 86_400_000):
            return {**previous, "checkedAt": result["checkedAt"]}
        export_url = relic_manifest_url(fetch_bytes(INDEX_URL))
        exported = fetch_json(export_url)["ExportRelicArcane"]
        names_by_id = {row["uniqueName"]: row["name"] for row in exported}
        names = set()
        for item_type in relic_ids:
            name = names_by_id.get(item_type, "")
            if not re.fullmatch(r"(?:Lith|Meso|Neo|Axi) [A-Z]\d+ Relic", name):
                raise ValueError(f"Current Aya relic is absent from DE export: {item_type}")
            names.add(name.removesuffix(" Relic"))
        catalog = parse_relic_rewards(fetch_text(DROP_TABLE_URL), names)
        rewards = {part for definition in catalog.values() for part in definition["rewards"]}
        items = sorted({row["item"] for row in tracker["arsenal"]
                        if " Prime" in row["item"]
                        and any(part.startswith(row["item"] + " ") for part in rewards)})
        result.update(status="verified", items=items, relics=catalog,
                      relicCatalogStatus="verified", catalogCheckedAt=iso_time(checked_ms),
                      exportSource=export_url)
    except Exception as error:
        # Acquisition metadata is optional; an unavailable table must never
        # veto a valid account capture or leave old relics presented as current.
        result["detail"] = "Prime Resurgence relic data incomplete: " + str(error)
        print("::warning title=Prime Resurgence relic data unavailable::" + str(error))
    return result
