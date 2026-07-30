from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "warframe.json"
OVERRIDES = ROOT / "data" / "overrides.json"
EXPECTED_FILES = (
    "foundry.json",
    "inventoryArcanes.json",
    "inventoryMisc.json",
    "inventoryMods.json",
    "inventoryParts.json",
    "inventoryRelics.json",
    "inventorySets.json",
    "rivens.json",
)


def yes(value: object) -> str:
    return "Yes" if bool(value) else "No"


def load_complete_export(folder: Path) -> tuple[dict[str, dict], dict[str, dict], dict[str, object]]:
    manifest: dict[str, dict] = {}
    parsed: dict[str, object] = {}
    for name in EXPECTED_FILES:
        path = folder / name
        if not path.is_file():
            raise SystemExit(f"Incomplete export: missing {name}")
        raw = path.read_bytes()
        parsed[name] = json.loads(raw.decode("utf-8-sig"))
        stat = path.stat()
        manifest[name] = {
            "bytes": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime, ZoneInfo("America/Los_Angeles")).isoformat(),
            "sha256": hashlib.sha256(raw).hexdigest(),
        }
    foundry = parsed["foundry.json"]
    if not isinstance(foundry, list) or len(foundry) < 800:
        raise SystemExit("Incomplete export: foundry.json is not a complete item list")
    by_name = {row["name"]: row for row in foundry}
    if len(by_name) != len(foundry):
        raise SystemExit("Invalid export: duplicate item names in foundry.json")
    return by_name, manifest, parsed


def inventory_counts(payload: object) -> dict[str, int]:
    counts: dict[str, int] = {}

    def visit(value: object) -> None:
        if isinstance(value, list):
            for child in value:
                visit(child)
            return
        if not isinstance(value, dict):
            return
        name = next((value.get(key) for key in ("name", "itemName", "displayName") if isinstance(value.get(key), str)), None)
        count = next((value.get(key) for key in ("count", "quantity", "amount", "amountOwned", "itemCount") if isinstance(value.get(key), (int, float))), None)
        if name and count is not None:
            counts[name] = counts.get(name, 0) + int(count)
        for child in value.values():
            if isinstance(child, (list, dict)):
                visit(child)

    visit(payload)
    return counts


def numeric_quantity(value: object) -> float:
    text = str(value or "0").strip().replace(",", "")
    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)([KM]?)", text, re.IGNORECASE)
    if not match:
        return 0
    multiplier = {"": 1, "K": 1_000, "M": 1_000_000}[match.group(2).upper()]
    return float(match.group(1)) * multiplier


def exported_missing(source: dict) -> str:
    missing = []
    for component in source.get("components") or []:
        required = int(component.get("neccessaryAmount") or 0)
        owned = numeric_quantity(component.get("quantityOwned"))
        if required <= 0 or owned >= required:
            continue
        name = component.get("name", "Unknown component")
        missing.append(name if required == 1 and owned == 0 else f"{name} ({int(owned)}/{required})")
    return "; ".join(missing)


def relic_totals(parsed: dict[str, object]) -> dict[str, int]:
    totals: dict[str, int] = {}
    for relic in parsed.get("inventoryRelics.json", []):
        base = re.sub(r"\s+(Intact|Exceptional|Flawless|Radiant)$", "", relic.get("name", ""))
        totals[base] = totals.get(base, 0) + int(relic.get("amountOwned") or 0)
    return totals


def relic_exact_counts(parsed: dict[str, object]) -> dict[str, int]:
    exact: dict[str, int] = {}
    for relic in parsed.get("inventoryRelics.json", []):
        name = relic.get("name", "")
        exact[name] = exact.get(name, 0) + int(relic.get("amountOwned") or 0)
    return exact


def refresh_relic_quantities(text: str, totals: dict[str, int], exact: dict[str, int]) -> str:
    multiplied = re.compile(r"\b((?:Lith|Meso|Neo|Axi)\s+[A-Z]\d+)\s*[×x]\s*\d+\b")
    text = multiplied.sub(lambda match: f"{match.group(1)} ×{totals.get(match.group(1), 0)}", text)

    exact_relic = re.compile(
        r"\b\d+\s+((?:Lith|Meso|Neo|Axi)\s+[A-Z]\d+\s+(?:Intact|Exceptional|Flawless|Radiant))\s+relics?\b",
        re.IGNORECASE,
    )

    def replace_exact(match: re.Match) -> str:
        name = match.group(1)
        count = exact.get(name, 0)
        return f"{count} {name} {'relic' if count == 1 else 'relics'}"

    text = exact_relic.sub(replace_exact, text)

    held = re.compile(
        r"\b((?:Lith|Meso|Neo|Axi)\s+[A-Z]\d+)\s+(Common|Uncommon|Rare)\s+\((?:\d+\s+held|none visible in export)\)",
        re.IGNORECASE,
    )

    def replace_held(match: re.Match) -> str:
        count = totals.get(match.group(1), 0)
        availability = f"{count} held" if count else "none visible in export"
        return f"{match.group(1)} {match.group(2)} ({availability})"

    return held.sub(replace_held, text)


def refresh_step_material_quantities(text: str, missing: str) -> str:
    for part in missing.split(";"):
        match = re.fullmatch(r"\s*(.+?)\s+\((\d+)/(\d+)\)\s*", part)
        if not match:
            continue
        name, owned, required = match.group(1), int(match.group(2)), int(match.group(3))
        remaining = required - owned
        escaped = re.escape(name)
        text = re.sub(rf"\b[\d,]+\s+({escaped})\b", f"{remaining:,} \\1", text, flags=re.IGNORECASE)
    return text


def missing_material_names(missing: str) -> set[str]:
    names = set()
    for part in missing.split(";"):
        match = re.fullmatch(r"\s*(.+?)\s+\([\d,]+/[\d,]+\)\s*", part)
        if match:
            names.add(match.group(1))
    return names


def remove_stale_material_clauses(text: str, old_missing: str, new_missing: str) -> str:
    stale = missing_material_names(old_missing) - missing_material_names(new_missing)
    for name in sorted(stale, key=len, reverse=True):
        escaped = re.escape(name)
        patterns = (
            rf"\s*;\s*[^.;!?]*\b{escaped}\b",
            rf"\s*,?\s*(?:and|then)\s+(?:obtain|get|farm|craft|refine|buy)\s+(?:the\s+remaining\s+|[\d,]+\s+)?{escaped}\b[^.;!?]*",
            rf"\s*,?\s*(?:and|then)\s+[\d,]+\s+{escaped}\b",
            rf"\b(?:obtain|get|farm|craft|refine|buy)\s+(?:the\s+remaining\s+|[\d,]+\s+)?{escaped}\b[^.;!?]*",
        )
        for pattern in patterns:
            text = re.sub(pattern, "", text, flags=re.IGNORECASE)
        if re.search(rf"\b{escaped}\b", text, flags=re.IGNORECASE):
            sentences = re.split(r"(?<=[.!?])\s+", text)
            text = " ".join(sentence for sentence in sentences if not re.search(rf"\b{escaped}\b", sentence, flags=re.IGNORECASE))
    return re.sub(r"\s+([.;,])", r"\1", re.sub(r"\s{2,}", " ", text)).strip(" ;,")


def base_prime_assemblies(parsed: dict[str, object]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for file_name in ("inventoryParts.json", "inventorySets.json", "inventoryMisc.json"):
        for name, count in inventory_counts(parsed[file_name]).items():
            counts[name] = counts.get(name, 0) + count
    recipes = {
        "Bronco Prime": ("Bronco Prime Blueprint", "Bronco Prime Barrel", "Bronco Prime Receiver"),
        "Lex Prime": ("Lex Prime Blueprint", "Lex Prime Barrel", "Lex Prime Receiver"),
        "Magnus Prime": ("Magnus Prime Blueprint", "Magnus Prime Barrel", "Magnus Prime Receiver"),
        "Vasto Prime": ("Vasto Prime Blueprint", "Vasto Prime Barrel", "Vasto Prime Receiver"),
    }
    return {
        item: min((counts.get(component, 0) for component in components), default=0)
        for item, components in recipes.items()
    }


def followup_row(row: dict) -> dict:
    pending = row["pendingFoundry"] == "Yes"
    item_type = row["type"]
    if item_type == "companion":
        tip = "Level the companion in high-affinity missions."
    elif item_type in {"primary", "secondary", "melee", "archgun", "archmelee"}:
        tip = f"Level this {item_type} in Sanctuary Onslaught, Helene, or Hydron; equip fewer other weapons to focus affinity."
    else:
        tip = "Level in Sanctuary Onslaught, Helene, or Hydron."
    return {
        "item": row["item"],
        "type": row["type"],
        "state": "Ready in Foundry" if pending else "Rank unknown — verify in Arsenal",
        "targetRank": row["targetRank"],
        "steps": "Claim from Foundry; equip and level to 30." if pending else "Check Arsenal and level to 30 if needed.",
        "tip": tip,
        "source": row["source"],
    }


def queue_row(row: dict) -> dict:
    return {
        "ease": row["ease"], "item": row["item"], "type": row["type"],
        "targetRank": row["targetRank"], "missing": row["missing"], "route": row["route"],
        "steps": "Acquire the listed missing parts, build, then level to 30.",
        "tip": "Farm the rarest missing part first; trade only for the final stubborn drop.",
        "source": row["source"],
    }


def update(folder: Path) -> None:
    export, manifest, parsed = load_complete_export(folder)
    relics = relic_totals(parsed)
    exact_relics = relic_exact_counts(parsed)
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    settled_at_40 = set(overrides.get("confirmedAt40", []))
    rank40_by_name = {row["item"]: row for row in payload["rank40"]}
    rank40_names = set(rank40_by_name)
    arsenal = {row["item"]: row for row in payload["arsenal"]}
    if set(arsenal) != set(export):
        missing = sorted(set(arsenal) - set(export))
        extra = sorted(set(export) - set(arsenal))
        raise SystemExit(f"Item catalog mismatch; missing={missing[:5]}, extra={extra[:5]}")

    old_queue = {row["item"]: row for row in payload["queue"]}
    old_vaulted = {row["item"]: row for row in payload["vaulted"]}
    old_cards = {**old_queue, **old_vaulted}
    old_owned = {row["item"]: row for row in payload["owned"]}
    changes = []

    for name, row in arsenal.items():
        source = export[name]
        before = (row["owned"], row["mastered"], row["pendingFoundry"], row.get("missing", ""))
        owned = bool(source.get("owned"))
        mastered = bool(source.get("mastered"))
        pending = bool(source.get("pendingInFoundry"))
        row["owned"], row["mastered"], row["pendingFoundry"] = yes(owned), yes(mastered), yes(pending)
        row["complete"] = yes(owned or mastered)
        if name in settled_at_40:
            row.update(owned="Yes", mastered="Yes", complete="Yes", state="Confirmed at 40", targetRank="40", rankRule="Rank 40 and five total Forma explicitly confirmed.", missing="", ease="1 — Complete", route="Confirmed at 40")
            if name in rank40_by_name:
                rank40_by_name[name].update(owned="Yes", mastered="Yes", status="Confirmed at 40", rankRule="Rank 40 and five total Forma explicitly confirmed.", action="Complete — no action needed.", formaPlan="Five total Forma complete")
        elif name in rank40_by_name:
            project = rank40_by_name[name]
            project["owned"], project["mastered"] = yes(owned), yes(mastered)
            if project["status"].startswith("Active"):
                project["status"] = "Active to 40"
                row.update(state="Active to 40", targetRank="40", rankRule=project["rankRule"], missing="", ease="1 — Active project", route="Active to 40")
            elif project["status"].startswith("Parked"):
                project["status"] = "Parked at 30"
                row.update(state="Parked at 30", targetRank="30", rankRule=project["rankRule"], missing="", ease="6 — Parked", route="Parked at 30")
            else:
                project.update(status="Current rank unknown", rankRule="Weapon is acquired, but rank 40 and five Forma are not explicitly confirmed.", action="Verify current rank and Forma count before scheduling more Forma.", formaPlan="Unknown until verified")
                row.update(state="Current rank unknown", targetRank="Unknown", rankRule=project["rankRule"], missing="", ease="6 — Verify rank", route="Current rank unknown")
        elif pending:
            row.update(state="Owned / in foundry; rank unknown", rankRule="Claim from Foundry, then level to 30.", missing="", ease="1 — Now / no farming", route="Foundry")
        elif mastered:
            row.update(state="Owned + mastered" if owned else "Mastered; not currently owned", rankRule="", missing="", ease="1 — Complete", route="Mastery complete")
        elif owned:
            row.update(state="Owned; rank unknown", rankRule="Export has no current rank/Forma; verify Arsenal rank and finish to 30 only if needed.", missing="", ease="1 — Now / no farming", route="Already owned")
        else:
            refreshed_missing = exported_missing(source)
            if not refreshed_missing and before[3]:
                refreshed_missing = before[3]
            if any(marker in str(before[3]) for marker in ("breeding result", "(completed item)", "Blueprint and components", "Model /")):
                refreshed_missing = before[3]
            if name in {"Akbronco Prime", "Aklex Prime", "Akmagnus Prime", "Akvasto Prime"}:
                refreshed_missing = before[3]
            if name.startswith(("Coda ", "Kuva ", "Tenet ")) and str(before[3]).startswith("Completed"):
                refreshed_missing = before[3]
            row.update(state="Missing", rankRule="", missing=refreshed_missing)
            if "steps" in row:
                row["steps"] = remove_stale_material_clauses(row["steps"], before[3], row["missing"])
                row["steps"] = refresh_relic_quantities(row["steps"], relics, exact_relics)
                row["steps"] = refresh_step_material_quantities(row["steps"], row["missing"])
            if "tip" in row:
                row["tip"] = remove_stale_material_clauses(row["tip"], before[3], row["missing"])
                row["tip"] = refresh_relic_quantities(row["tip"], relics, exact_relics)
            if "steps" in row and name == "Quassus Prime" and "Quassus Prime Blade (1/2)" in row["missing"]:
                row["steps"] = row["steps"].replace("Two Blades are still needed.", "One Blade is still needed.")
        if row["state"] != "Missing" and before[3]:
            if "steps" in row:
                row["steps"] = remove_stale_material_clauses(row["steps"], before[3], "")
            if "tip" in row:
                row["tip"] = remove_stale_material_clauses(row["tip"], before[3], "")
        after = (row["owned"], row["mastered"], row["pendingFoundry"], row.get("missing", ""))
        if before != after:
            changes.append({"item": name, "before": before, "after": after})

    def missing_item(row: dict) -> bool:
        return row["owned"] == "No" and row["mastered"] == "No"

    payload["queue"] = [
        old_cards.get(row["item"], queue_row(row))
        for row in payload["arsenal"]
        if missing_item(row) and row["vaulted"] == "No" and row["item"] not in rank40_names
    ]
    payload["queue"].sort(key=lambda row: (row["ease"], row["item"]))
    arsenal_by_name = {row["item"]: row for row in payload["arsenal"]}
    for row in payload["queue"]:
        old_missing = row.get("missing", "")
        row["missing"] = arsenal_by_name[row["item"]]["missing"]
        row["steps"] = remove_stale_material_clauses(row.get("steps", ""), old_missing, row["missing"])
        row["tip"] = remove_stale_material_clauses(row.get("tip", ""), old_missing, row["missing"])
        row["steps"] = refresh_relic_quantities(row.get("steps", ""), relics, exact_relics)
        row["steps"] = refresh_step_material_quantities(row["steps"], row["missing"])
        row["tip"] = refresh_relic_quantities(row.get("tip", ""), relics, exact_relics)
        if row["item"] == "Quassus Prime" and "Quassus Prime Blade (1/2)" in row["missing"]:
            row["steps"] = row["steps"].replace("Two Blades are still needed.", "One Blade is still needed.")
    payload["vaulted"] = [
        old_cards.get(row["item"], queue_row(row))
        for row in payload["arsenal"]
        if (
            missing_item(row)
            and row["vaulted"] == "Yes"
            and row["item"] not in rank40_names
            and str(row.get("missing", "")).strip()
        )
    ]
    payload["vaulted"].sort(key=lambda row: row["item"])
    for row in payload["vaulted"]:
        old_missing = row.get("missing", "")
        row["missing"] = arsenal_by_name[row["item"]]["missing"]
        row["steps"] = remove_stale_material_clauses(row.get("steps", ""), old_missing, row["missing"])
        row["tip"] = remove_stale_material_clauses(row.get("tip", ""), old_missing, row["missing"])
        row["steps"] = refresh_relic_quantities(row.get("steps", ""), relics, exact_relics)
        row["steps"] = refresh_step_material_quantities(row["steps"], row["missing"])
        row["tip"] = refresh_relic_quantities(row.get("tip", ""), relics, exact_relics)
    refreshed_owned = []
    for row in payload["arsenal"]:
        if row["item"] in rank40_names or not (
            row["pendingFoundry"] == "Yes" or (row["owned"] == "Yes" and row["mastered"] == "No")
        ):
            continue
        fresh = followup_row(row)
        existing = old_owned.get(row["item"])
        if existing and existing["state"] == fresh["state"]:
            if not row["pendingFoundry"] == "Yes" and "Claim from Foundry" in existing.get("steps", ""):
                existing["steps"] = fresh["steps"]
            if row["type"] != "companion" and "companion weapon" in existing.get("tip", "").lower():
                existing["tip"] = fresh["tip"]
            refreshed_owned.append(existing)
        else:
            refreshed_owned.append(fresh)
    payload["owned"] = refreshed_owned
    payload["owned"].sort(key=lambda row: (row["state"], row["item"]))

    now = datetime.now(ZoneInfo("America/Los_Angeles"))
    payload["meta"]["snapshotDate"] = now.date().isoformat()
    payload["meta"]["exportVerifiedAt"] = now.strftime("%Y-%m-%d %H:%M:%S PDT")
    # Keep machine-specific paths out of the public tracker data.
    payload["meta"].pop("exportFolder", None)
    payload["meta"]["exportSource"] = "Local AlecaFrame export"
    payload["meta"]["exportManifest"] = manifest
    payload["meta"]["importChanges"] = changes
    payload["meta"]["relicInventory"] = inventory_counts(parsed["inventoryRelics.json"])
    payload["meta"]["basePrimeAssemblies"] = base_prime_assemblies(parsed)
    payload["meta"]["summary"] = {
        "activeTo40": sum(row["status"] == "Active to 40" for row in payload["rank40"]),
        "confirmedAt40": sum(row["status"] == "Confirmed at 40" for row in payload["rank40"]),
        "parkedAt30": sum(row["status"] == "Parked at 30" for row in payload["rank40"]),
        "currentRankUnknown": sum(row["status"] == "Current rank unknown" for row in payload["rank40"]),
        "missing": sum(missing_item(row) for row in payload["arsenal"]),
    }
    DATA.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "items": len(payload["arsenal"]), "queue": len(payload["queue"]),
        "vaulted": len(payload["vaulted"]), "owned_followups": len(payload["owned"]),
        "owned": sum(r["owned"] == "Yes" for r in payload["arsenal"]),
        "mastered": sum(r["mastered"] == "Yes" for r in payload["arsenal"]),
        "missing": sum(missing_item(r) for r in payload["arsenal"]),
        "changes": changes,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path)
    update(parser.parse_args().folder)
