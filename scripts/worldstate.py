from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PRIMARY_WORLD_STATE_URL = "https://api.warframe.com/cdn/worldState.php"

DATA_DIR = Path(__file__).resolve().parent / "worldstate_data"
SOL_NODES = json.loads((DATA_DIR / "solNodes.json").read_text(encoding="utf-8"))

FACTIONS = {
    "FC_CORPUS": "Corpus",
    "FC_CORRUPTED": "Corrupted",
    "FC_GRINEER": "Grineer",
    "FC_INFESTATION": "Infested",
    "FC_OROKIN": "Orokin",
    "FC_SENTIENT": "Sentient",
    "FC_MITW": "Man in the Wall",
    "FC_NARMER": "Narmer",
    "FC_SCALDRA": "Scaldra",
    "FC_TECHROT": "Techrot",
}

# Invasion battle-pay localization keys from WFCD's warframe-worldstate-data.
# These are deliberately limited to the stable invasion reward pool; unknown
# additions remain visible through a readable path fallback instead of vanishing.
REWARD_NAMES = {
    "/lotus/types/items/research/biocomponent": "Mutagen Mass",
    "/lotus/types/items/research/chemcomponent": "Detonite Injector",
    "/lotus/types/items/research/energycomponent": "Fieldron",
    "/lotus/types/recipes/components/formablueprint": "Forma Blueprint",
    "/lotus/types/recipes/components/orokincatalystblueprint": "Orokin Catalyst Blueprint",
    "/lotus/types/recipes/components/orokinreactorblueprint": "Orokin Reactor Blueprint",
    "/lotus/types/recipes/components/utilityunlockerblueprint": "Exilus Warframe Adapter Blueprint",
    "/lotus/types/recipes/weapons/deravandalblueprint": "Dera Vandal Blueprint",
    "/lotus/types/recipes/weapons/grineercombatknifeprint": "Sheev Blueprint",
    "/lotus/types/recipes/weapons/grineercombatknifesortieblueprint": "Sheev Blueprint",
    "/lotus/types/recipes/weapons/karakwraithblueprint": "Karak Wraith Blueprint",
    "/lotus/types/recipes/weapons/latronwraithblueprint": "Latron Wraith Blueprint",
    "/lotus/types/recipes/weapons/snipetronvandalblueprint": "Snipetron Vandal Blueprint",
    "/lotus/types/recipes/weapons/strunwraithblueprint": "Strun Wraith Blueprint",
    "/lotus/types/recipes/weapons/twinviperswraithblueprint": "Twin Vipers Wraith Blueprint",
    "/lotus/types/recipes/weapons/weaponparts/deravandalbarrel": "Dera Vandal Barrel",
    "/lotus/types/recipes/weapons/weaponparts/deravandalreceiver": "Dera Vandal Receiver",
    "/lotus/types/recipes/weapons/weaponparts/deravandalstock": "Dera Vandal Stock",
    "/lotus/types/recipes/weapons/weaponparts/grineercombatknifeblade": "Sheev Blade",
    "/lotus/types/recipes/weapons/weaponparts/grineercombatknifehandle": "Sheev Handle",
    "/lotus/types/recipes/weapons/weaponparts/grineercombatknifeheatsink": "Sheev Heatsink",
    "/lotus/types/recipes/weapons/weaponparts/grineercombatknifehilt": "Sheev Hilt",
    "/lotus/types/recipes/weapons/weaponparts/karakwraithbarrel": "Karak Wraith Barrel",
    "/lotus/types/recipes/weapons/weaponparts/karakwraithreceiver": "Karak Wraith Receiver",
    "/lotus/types/recipes/weapons/weaponparts/karakwraithstock": "Karak Wraith Stock",
    "/lotus/types/recipes/weapons/weaponparts/latronwraithbarrel": "Latron Wraith Barrel",
    "/lotus/types/recipes/weapons/weaponparts/latronwraithreceiver": "Latron Wraith Receiver",
    "/lotus/types/recipes/weapons/weaponparts/latronwraithstock": "Latron Wraith Stock",
    "/lotus/types/recipes/weapons/weaponparts/snipetronvandalbarrel": "Snipetron Vandal Barrel",
    "/lotus/types/recipes/weapons/weaponparts/snipetronvandalreceiver": "Snipetron Vandal Receiver",
    "/lotus/types/recipes/weapons/weaponparts/snipetronvandalstock": "Snipetron Vandal Stock",
    "/lotus/types/recipes/weapons/weaponparts/strunwraithbarrel": "Strun Wraith Barrel",
    "/lotus/types/recipes/weapons/weaponparts/strunwraithreceiver": "Strun Wraith Receiver",
    "/lotus/types/recipes/weapons/weaponparts/strunwraithstock": "Strun Wraith Stock",
    "/lotus/types/recipes/weapons/weaponparts/twinviperswraithbarrel": "Twin Vipers Wraith Barrel",
    "/lotus/types/recipes/weapons/weaponparts/twinviperswraithlink": "Twin Vipers Wraith Link",
    "/lotus/types/recipes/weapons/weaponparts/twinviperswraithreceiver": "Twin Vipers Wraith Receiver",
}

EARTH_PHASE_MS = 4 * 60 * 60 * 1000
CETUS_DAY_MS = 100 * 60 * 1000
CETUS_NIGHT_MS = 50 * 60 * 1000
VALLIS_ANCHOR_MS = int(datetime(2026, 2, 4, 19, 46, 48, tzinfo=timezone.utc).timestamp() * 1000)
VALLIS_CYCLE_MS = 1_600_000
VALLIS_WARM_MS = 400_000
ZARIMAN_CORPUS_ANCHOR_MS = 1_655_182_800_000
ZARIMAN_CYCLE_MS = 18_000_000
ZARIMAN_PHASE_MS = 9_000_000


def utc_now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def iso_time(milliseconds: int | float | None) -> str | None:
    if milliseconds is None:
        return None
    return datetime.fromtimestamp(float(milliseconds) / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, dict):
        if "$date" in value:
            return parse_time(value["$date"])
        if "$numberLong" in value:
            return int(value["$numberLong"])
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if re.fullmatch(r"-?\d+", stripped):
            return int(stripped)
        return int(datetime.fromisoformat(stripped.replace("Z", "+00:00")).timestamp() * 1000)
    raise TypeError(f"Unsupported timestamp: {value!r}")


def round_minute(milliseconds: int) -> int:
    return math.floor((milliseconds + 30_000) / 60_000) * 60_000


def source_metadata(provider: str, source_type: str, url: str, checked_ms: int, world_state_ms: int | None) -> dict[str, Any]:
    age_seconds = max(0, round((checked_ms - world_state_ms) / 1000)) if world_state_ms is not None else None
    return {
        "provider": provider,
        "type": source_type,
        "url": url,
        "checkedAt": iso_time(checked_ms),
        "worldStateAt": iso_time(world_state_ms),
        "ageSecondsAtCheck": age_seconds,
    }


def readable_path(value: str) -> str:
    tail = str(value or "").rstrip("/").split("/")[-1]
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", tail)
    return re.sub(r"\s+", " ", spaced).strip() or str(value or "Unknown reward")


def reward_name(value: str) -> str:
    return REWARD_NAMES.get(str(value).lower(), readable_path(value))


def parse_reward(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict) or not raw:
        return None
    items = [reward_name(item) for item in raw.get("items", []) if isinstance(item, str)]
    counted_items = []
    for item in raw.get("countedItems", []) or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("ItemType") or "")
        if not key:
            continue
        counted_items.append({
            "count": int(item.get("ItemCount") or 0),
            "type": reward_name(key),
            "key": key,
        })
    labels = list(items)
    labels.extend(
        f"{item['count']} {item['type']}" if item["count"] != 1 else item["type"]
        for item in counted_items
    )
    credits = int(raw.get("credits") or 0)
    if credits:
        labels.append(f"{credits:,} Credits")
    return {
        "items": items,
        "countedItems": counted_items,
        "credits": credits,
        "asString": " + ".join(labels),
    }


def faction_name(value: Any) -> str:
    key = str(value or "")
    return FACTIONS.get(key, readable_path(key))


def node_name(value: Any) -> str:
    key = str(value or "")
    entry = SOL_NODES.get(key)
    return str(entry.get("value")) if isinstance(entry, dict) and entry.get("value") else key


def parse_invasions(raw_invasions: Any) -> list[dict[str, Any]]:
    parsed = []
    for raw in raw_invasions if isinstance(raw_invasions, list) else []:
        if not isinstance(raw, dict):
            continue
        attacker_info = raw.get("AttackerMissionInfo") or {}
        defender_info = raw.get("DefenderMissionInfo") or {}
        count = int(raw.get("Count") or 0)
        goal = int(raw.get("Goal") or 0)
        vs_infestation = "infest" in str(defender_info.get("faction") or "").lower()
        completion = (1 + count / goal) * (100 if vs_infestation else 50) if goal else 0
        activation_ms = parse_time(raw.get("Activation"))
        oid = str((raw.get("_id") or {}).get("$oid") or f"{raw.get('Node', 'unknown')}-{activation_ms or 0}")
        parsed.append({
            "id": oid,
            "activation": iso_time(activation_ms),
            "node": node_name(raw.get("Node")),
            "nodeKey": str(raw.get("Node") or ""),
            "desc": readable_path(str(raw.get("LocTag") or "Invasion")),
            # This inversion matches WFCD's current Invasion model.
            "attacker": {
                "reward": parse_reward(raw.get("AttackerReward")),
                "faction": faction_name(defender_info.get("faction")),
                "factionKey": faction_name(defender_info.get("faction")),
            },
            "defender": {
                "reward": parse_reward(raw.get("DefenderReward")),
                "faction": faction_name(attacker_info.get("faction")),
                "factionKey": faction_name(attacker_info.get("faction")),
            },
            "vsInfestation": vs_infestation,
            "count": count,
            "requiredRuns": goal,
            "completion": completion,
            "completed": bool(raw.get("Completed")),
        })
    return parsed


def invasion_reward_names(invasions: list[dict[str, Any]]) -> list[str]:
    names = set()
    for invasion in invasions:
        if invasion.get("completed"):
            continue
        for side_name in ("attacker", "defender"):
            reward = (invasion.get(side_name) or {}).get("reward") or {}
            names.update(str(item) for item in reward.get("items", []) if item)
            names.update(str(item.get("type")) for item in reward.get("countedItems", []) if item.get("type"))
    return sorted(names)


def cycle_record(name: str, state: str, activation_ms: int, expiry_ms: int, **extra: Any) -> dict[str, Any]:
    return {
        "id": f"{name}Cycle{expiry_ms}",
        "state": state,
        "activation": iso_time(activation_ms),
        "expiry": iso_time(expiry_ms),
        **extra,
    }


def cetus_cycle(bounty_end_ms: int, now_ms: int) -> dict[str, Any]:
    bounty_date = datetime.fromtimestamp(bounty_end_ms / 1000, tz=timezone.utc)
    # WFCD calls Date.setSeconds(0), which preserves milliseconds.
    rounded_bounty_ms = bounty_end_ms - bounty_date.second * 1000
    seconds_to_night_end = math.floor(((rounded_bounty_ms - now_ms) / 1000) + 0.5)
    is_day = seconds_to_night_end > CETUS_NIGHT_MS / 1000
    seconds_remaining = seconds_to_night_end - CETUS_NIGHT_MS / 1000 if is_day else seconds_to_night_end
    expiry_ms = round_minute(int(now_ms + seconds_remaining * 1000))
    state = "day" if is_day else "night"
    duration = CETUS_DAY_MS if is_day else CETUS_NIGHT_MS
    return cycle_record(
        "cetus",
        state,
        expiry_ms - duration,
        expiry_ms,
        isDay=is_day,
        derivedFrom="CetusSyndicate expiry",
        syndicateExpiry=iso_time(bounty_end_ms),
        logic="WFCD 100-minute day / 50-minute night",
    )


def all_cycles(bounty_end_ms: int, now_ms: int) -> dict[str, dict[str, Any]]:
    cetus = cetus_cycle(bounty_end_ms, now_ms)

    earth_seconds = math.floor(now_ms / 1000) % 28_800
    earth_state = "day" if earth_seconds < 14_400 else "night"
    earth_expiry = now_ms + (14_400 - earth_seconds % 14_400) * 1000
    earth = cycle_record("earth", earth_state, earth_expiry - EARTH_PHASE_MS, earth_expiry, isDay=earth_state == "day")

    cambion = cycle_record(
        "cambion",
        "fass" if cetus["isDay"] else "vome",
        parse_time(cetus["activation"]) or now_ms,
        parse_time(cetus["expiry"]) or now_ms,
    )

    since_vallis_anchor = (now_ms - VALLIS_ANCHOR_MS) % VALLIS_CYCLE_MS
    to_next_full = VALLIS_CYCLE_MS - since_vallis_anchor
    vallis_cold_ms = VALLIS_CYCLE_MS - VALLIS_WARM_MS
    vallis_state = "warm" if to_next_full > vallis_cold_ms else "cold"
    vallis_remaining = to_next_full - vallis_cold_ms if vallis_state == "warm" else to_next_full
    vallis_expiry = now_ms + vallis_remaining
    vallis_activation = now_ms + to_next_full - (VALLIS_CYCLE_MS if vallis_state == "warm" else vallis_cold_ms)
    vallis_activation = vallis_activation - datetime.fromtimestamp(vallis_activation / 1000, tz=timezone.utc).second * 1000
    vallis = cycle_record("vallis", vallis_state, vallis_activation, vallis_expiry, isWarm=vallis_state == "warm")

    zariman_reference = bounty_end_ms - 5000
    zariman_elapsed = (zariman_reference - ZARIMAN_CORPUS_ANCHOR_MS) % ZARIMAN_CYCLE_MS
    zariman_remaining = ZARIMAN_CYCLE_MS - zariman_elapsed
    zariman_state = "corpus" if zariman_remaining > ZARIMAN_PHASE_MS else "grineer"
    zariman_expiry = round_minute(zariman_reference)
    zariman = cycle_record(
        "zariman",
        zariman_state,
        zariman_expiry - ZARIMAN_PHASE_MS,
        zariman_expiry,
        isCorpus=zariman_state == "corpus",
    )

    return {"earth": earth, "cetus": cetus, "vallis": vallis, "cambion": cambion, "zariman": zariman}


def direct_world_state(raw: Any, checked_ms: int | None = None) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("Digital Extremes world state must be an object")
    checked_ms = checked_ms if checked_ms is not None else utc_now_ms()
    world_state_ms = int(raw.get("Time") or 0) * 1000 or None
    source = source_metadata("Digital Extremes", "primary", PRIMARY_WORLD_STATE_URL, checked_ms, world_state_ms)
    syndicates = raw.get("SyndicateMissions") if isinstance(raw.get("SyndicateMissions"), list) else []
    cetus_syndicate = next((entry for entry in syndicates if entry.get("Tag") == "CetusSyndicate"), None)
    bounty_end_ms = parse_time((cetus_syndicate or {}).get("Expiry"))
    if bounty_end_ms is None:
        raise ValueError("Digital Extremes world state has no CetusSyndicate expiry")
    invasions = parse_invasions(raw.get("Invasions"))
    cycles = all_cycles(bounty_end_ms, checked_ms)
    freshness = "current" if source["ageSecondsAtCheck"] is None or source["ageSecondsAtCheck"] <= 300 else "stale"
    status = "verified" if freshness == "current" else "stale"
    return {
        "worldState": {
            "status": status,
            "freshness": freshness,
            "buildLabel": raw.get("BuildLabel"),
            "source": source,
        },
        "invasions": {
            "status": status,
            "source": source,
            "rewards": invasion_reward_names(invasions),
            "items": invasions,
            "activeCount": sum(not invasion["completed"] for invasion in invasions),
        },
        "cetusCycle": {"status": status, "source": source, **cycles["cetus"]},
        "cycles": cycles,
    }
